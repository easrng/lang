// @ts-check
import { isSym, SYM_QUOTE } from "./lang.js";
import * as doc from "./prettier.js";
const { group, indent, line, softline, join } = doc.builders;

/**
 * Builds a Prettier document AST for s-expressions
 * @param {import("./lang.js").Data} data
 * @returns {import("./prettier.js").builders.Doc}
 */
function buildDoc(data) {
  if (typeof data === "string") {
    if (isSym(data)) {
      return data.slice(4);
    } else {
      return JSON.stringify(data.slice(4));
    }
  }

  if (typeof data === "number") {
    return data.toString();
  }

  if (data[0] === SYM_QUOTE) {
    return ["'", buildDoc(data[1] ?? [])];
  }

  // Empty list
  if (data.length === 0) {
    return "()";
  }

  const head = buildDoc(data[0]);
  const rest = data.slice(1);

  // Empty list with just head
  if (rest.length === 0) {
    return group(["(", head, ")"]);
  }

  // Check if head is a special form
  const headValue =
    typeof data[0] === "string" && isSym(data[0]) ? data[0].slice(4) : null;

  const specialForms = new Set(["lambda", "let", "if"]);

  // Special formatting for known forms
  if (specialForms.has(headValue ?? "")) {
    return group([
      "(",
      group([head, " ", softline, buildDoc(rest[0])]),
      indent([line, join(line, rest.slice(1).map(buildDoc))]),
      ")",
    ]);
  }

  // Default: try to fit on one line, otherwise break with hanging indent
  return group([
    "(",
    head,
    indent([line, join(line, rest.map(buildDoc))]),
    ")",
  ]);
}

/**
 * Pretty-prints s-expressions using Prettier's document model
 * @param {import("./lang.js").Data} data
 * @param {Object} options - Prettier options
 * @param {number=} options.printWidth - Line width (default: 80)
 * @param {number=} options.tabWidth - Spaces per indent (default: 2)
 * @returns {string}
 */
export function prettyPrint(data, options = {}) {
  const { printWidth = 60, tabWidth = 2 } = options;
  const docNode = buildDoc(data);

  return doc.printer.printDocToString(docNode, {
    printWidth,
    tabWidth,
    useTabs: false,
  }).formatted;
}
