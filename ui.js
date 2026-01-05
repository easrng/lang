// @ts-check
import { parse, step, canStep, readToken } from "./lang.js";
import { compare, applyPatch } from "./fast-json-patch.js";
import { prettyPrint } from "./prettier-print.js";

/** @type {Record<string, string>} */
const examples = {
  factorial: String.raw`
((lambda (Y) ((lambda (factorial)
  (factorial 5))
  (Y (lambda (recursive-factorial)
       (lambda (x)
         (if (lte x 0)
             1
             (mul x (recursive-factorial (sub x 1)))))))))
  ((lambda (f)
     (f f))
   (lambda (z)
     (lambda (f)
       (f (lambda (x) (((z z) f) x)))))))`.slice(1),
  "infinite recursion": String.raw`
((lambda (Y)
  ((Y (lambda (self) (lambda (i) (self (add i 1))))) 0))
  (lambda (f)
    (f
      (lambda (x)
        ((((lambda (z)
          (lambda (f) (f (lambda (x) (((z z) f) x)))))
          (lambda (z)
            (lambda (f) (f (lambda (x) (((z z) f) x))))))
          f)
          x)))))`.slice(1),
};

const examplesMenu = /** @type {HTMLSelectElement} */ (
  document.querySelector("#examples")
);
const inputDiv = /** @type {HTMLDivElement} */ (
  document.querySelector("#input")
);
const outputDiv = /** @type {HTMLDivElement} */ (
  document.querySelector("#output")
);
const firstBtn = /** @type {HTMLButtonElement} */ (
  document.querySelector("#first")
);
const prevBtn = /** @type {HTMLButtonElement} */ (
  document.querySelector("#prev")
);
const nextBtn = /** @type {HTMLButtonElement} */ (
  document.querySelector("#next")
);
const lastBtn = /** @type {HTMLButtonElement} */ (
  document.querySelector("#last")
);
const stepInput = /** @type {HTMLInputElement} */ (
  document.querySelector("#step")
);
outputDiv.addEventListener("beforeinput", (e) => e.preventDefault());

/**
 * @type {import("./lang.js").Data | null}
 */
let state = null;
/**
 * @type {import("./lang.js").Data | null}
 */
let initialState = null;
/**
 * @type {unknown[]}
 */
const backPatches = [];
let currentStep = 0;
stepInput.value = "0";

examplesMenu.addEventListener("change", () => {
  inputDiv.textContent = examples[examplesMenu.value];
  onChange();
});

examplesMenu.append(...Object.keys(examples).map((e) => new Option(e)));

inputDiv.addEventListener("input", () => {
  examplesMenu.value = "_";
  onChange();
});

let steppingToEnd = false;

firstBtn.addEventListener("click", () => showStep(0));
prevBtn.addEventListener("click", () => showStep(currentStep - 1));
nextBtn.addEventListener("click", () => showStep(currentStep + 1));
lastBtn.addEventListener("click", () => {
  if (steppingToEnd) {
    steppingToEnd = false;
  } else {
    steppingToEnd = true;
    showStep(Infinity);
  }
});

function updateButtons() {
  const hasNext = state ? canStep(state) : false;
  firstBtn.disabled = steppingToEnd || currentStep <= 0;
  prevBtn.disabled = steppingToEnd || currentStep <= 0;
  nextBtn.disabled = steppingToEnd || !hasNext;
  lastBtn.disabled = !steppingToEnd && !hasNext;
  lastBtn.textContent = steppingToEnd ? "⏹︎" : "⏭︎";
}

/** @type {WeakMap<HTMLElement, Range[]>} */
const prevHighlights = new WeakMap();
/**
 * @param {HTMLElement} element
 */
function highlight(element) {
  const source = element.textContent || "";

  // Ranges for each token type
  /** @type {Range[]} */
  const numberRanges = [];
  /** @type {Range[]} */
  const stringRanges = [];
  /** @type {[Range[], Range[], Range[]]} */
  const parenRanges = [[], [], []]; // purple, yellow, pink

  // Helper to convert text position to DOM node/offset
  /**
   * @param {number} position
   */
  function getNodeAtPosition(position) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentPos = 0;
    let node = walker.nextNode();

    while (node) {
      const nodeLength = (node.textContent ?? "").length;
      if (currentPos + nodeLength >= position) {
        return { node, offset: position - currentPos };
      }
      currentPos += nodeLength;
      node = walker.nextNode();
    }

    return null;
  }

  let position = 0;
  let remaining = source;
  let parenDepth = 0;

  while (remaining.length > 0) {
    const { value: token, rest } = readToken(remaining);
    const tokenLength = remaining.length - rest.length;

    const start = getNodeAtPosition(position);
    const end = getNodeAtPosition(position + tokenLength);

    if (start && end) {
      const range = new Range();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);

      if (token.type === "number") {
        numberRanges.push(range);
      } else if (token.type === "string") {
        stringRanges.push(range);
      } else if (token.type === "lparen") {
        parenRanges[parenDepth % 3].push(range);
        parenDepth++;
      } else if (token.type === "rparen") {
        parenDepth--;
        parenRanges[parenDepth % 3].push(range);
      }
    }

    position += tokenLength;
    remaining = rest;
  }

  const newRanges = [
    ...numberRanges,
    ...stringRanges,
    ...parenRanges[0],
    ...parenRanges[1],
    ...parenRanges[2],
  ];
  const prevRanges = prevHighlights.get(element) ?? [];
  // Register highlights
  /**
   * @param {string} key
   * @param {Range[]} ranges
   */
  function update(key, ranges) {
    const set = CSS.highlights.get(key) ?? new Highlight();
    CSS.highlights.set(key, set);
    for (const prevRange of prevRanges) {
      set.delete(prevRange);
    }
    for (const range of ranges) {
      set.add(range);
    }
  }
  update("lisp-numbers", numberRanges);
  update("lisp-strings", stringRanges);
  update("lisp-parens-purple", parenRanges[0]);
  update("lisp-parens-yellow", parenRanges[1]);
  update("lisp-parens-pink", parenRanges[2]);
  prevHighlights.set(element, newRanges);
}

/**
 * @param {number} index
 */
function showStep(index) {
  if (index === 0) {
    currentStep = 0;
    state = initialState;
    backPatches.length = 0;
  } else {
    let i = currentStep;
    while (backPatches.length && i > index) {
      i--;
      state = applyPatch({ _: state }, backPatches.pop(), true, false)
        .newDocument._;
    }
    let prevYield = Date.now();
    while (i < index && state && canStep(state)) {
      const prevState = state;
      state = step(state);
      const patch = compare({ _: state }, { _: prevState });
      console.log(
        JSON.stringify(prevState) ===
          JSON.stringify(
            applyPatch({ _: state }, patch, true, false).newDocument._
          )
      );
      if (backPatches.length > 10000) {
        backPatches.shift();
      }
      backPatches.push(patch);
      i++;
      if (index === Infinity && Date.now() - prevYield > 7) {
        if (steppingToEnd) {
          setTimeout(() => showStep(index), 7);
        }
        break;
      }
    }
    if (steppingToEnd && state && !canStep(state)) {
      steppingToEnd = false;
    }
    currentStep = i;
  }
  stepInput.value = "" + currentStep;
  outputDiv.textContent = state ? prettyPrint(state) : "'()";
  highlight(outputDiv);
  updateButtons();
}

async function onChange() {
  highlight(inputDiv);
  state = null;
  backPatches.length = 0;
  currentStep = 0;
  stepInput.value = "";
  outputDiv.innerHTML =
    '<span class="placeholder">Step forwards to start</span>';
  updateButtons();
  if (inputDiv.textContent.trim()) {
    try {
      let parsed = parse(inputDiv.textContent);
      initialState = state = parsed;
      backPatches.length = 0;
      showStep(0);
      updateButtons();
    } catch (e) {
      outputDiv.innerHTML = `<span class="error">${e}</span>`;
      console.error(e);
    }
  }
}

onChange();
