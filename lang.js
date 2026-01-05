// @ts-check
/** @typedef {`str!${string}` & { __brand__: "str" }} Str*/
/** @typedef {`sym!${string}` & { __brand__: "sym" }} Sym*/
/** @typedef {Str | Sym | number | DataArray} Data*/
/** @typedef {ReadonlyArray<Data>} DataArray */
/**
 * @typedef {Object} Token
 * @property {'id' | 'string' | 'number' | 'quote' | 'lparen' | 'rparen' | 'invalid'} type
 * @property {string} value
 */

/**
 * @param {string} source
 * @returns {{ value: Token; rest: string }}
 */
export function readToken(source) {
  source = source.trimStart();

  if (!source) {
    return {
      value: { type: "invalid", value: "" },
      rest: "",
    };
  }

  // Identifier
  const idMatch = source.match(
    /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}\?-]*/u
  );
  if (idMatch) {
    return {
      value: { type: "id", value: idMatch[0] },
      rest: source.slice(idMatch[0].length),
    };
  }

  // String
  const strMatch = source.match(/^"(?:[^\\"]|\\.)*"/);
  if (strMatch) {
    return {
      value: { type: "string", value: strMatch[0] },
      rest: source.slice(strMatch[0].length),
    };
  }

  // Number
  const numMatch = source.match(
    /^-?(?:[0-9]|[1-9][0-9]+)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/
  );
  if (numMatch) {
    return {
      value: { type: "number", value: numMatch[0] },
      rest: source.slice(numMatch[0].length),
    };
  }

  // Quote
  if (source[0] === "'") {
    return {
      value: { type: "quote", value: "'" },
      rest: source.slice(1),
    };
  }

  // Left paren
  if (source[0] === "(") {
    return {
      value: { type: "lparen", value: "(" },
      rest: source.slice(1),
    };
  }

  // Right paren
  if (source[0] === ")") {
    return {
      value: { type: "rparen", value: ")" },
      rest: source.slice(1),
    };
  }

  // Invalid - consume one character
  return {
    value: { type: "invalid", value: source[0] },
    rest: source.slice(1),
  };
}

/**
 * @param {string} source
 * @returns {{ value: Data; rest: string }}
 */
function parseInner(source) {
  const { value: token, rest } = readToken(source);

  if (token.type === "id") {
    return {
      value: sym(token.value),
      rest,
    };
  }

  if (token.type === "string") {
    return {
      value: str(JSON.parse(token.value)),
      rest,
    };
  }

  if (token.type === "number") {
    return {
      value: +JSON.parse(token.value),
      rest,
    };
  }

  if (token.type === "quote") {
    const { value, rest: afterQuoted } = parseInner(rest);
    return { value: [SYM_QUOTE, value], rest: afterQuoted };
  }

  if (token.type === "lparen") {
    /** @type {Data[]} */
    let value = [];
    let remaining = rest;

    while (true) {
      const { value: nextToken, rest: afterPeek } = readToken(remaining);

      if (nextToken.type === "rparen") {
        return {
          value,
          rest: afterPeek,
        };
      }

      const parsed = parseInner(remaining);
      remaining = parsed.rest;
      value.push(parsed.value);
    }
  }

  throw new SyntaxError(`unexpected character: ${token.value}`);
}

/**
 * @param {string} source
 * @returns {Data}
 */
export function parse(source) {
  const { value, rest } = parseInner(source);
  if (rest.trimEnd()) throw new SyntaxError("unexpected stuff at end");
  return value;
}

/** @type {(value: unknown) => value is Sym} */
export const isSym = (value) =>
  typeof value === "string" && value.startsWith("sym!");
/** @type { (value: string) => Sym} */
const sym = (value) => /** @type {Sym} */ ("sym!" + value);
/** @type { (value: string) => Str} */
const str = (value) => /** @type {Str} */ ("str!" + value);

export const SYM_CONS = sym("cons");
export const SYM_QUOTE = sym("quote");
export const SYM_LAMBDA = sym("lambda");
export const SYM_IF = sym("if");

export const SYM_ADD = sym("add");
export const SYM_SUB = sym("sub");
export const SYM_MUL = sym("mul");
export const SYM_DIV = sym("div");
export const SYM_REM = sym("rem");
export const SYM_POW = sym("pow");

export const SYM_BAND = sym("band");
export const SYM_BOR = sym("bor");
export const SYM_BXOR = sym("bxor");
export const SYM_BNOT = sym("bnot");
export const SYM_SHL = sym("shl");
export const SYM_SHR = sym("shr");
export const SYM_SHRU = sym("shru");

export const SYM_CAR = sym("car");
export const SYM_CDR = sym("cdr");

export const SYM_EQL = sym("eql");
export const SYM_NEQ = sym("neq");

export const SYM_AND = sym("and");
export const SYM_OR = sym("or");
export const SYM_NOT = sym("not");

export const SYM_LT = sym("lt");
export const SYM_LTE = sym("lte");
export const SYM_GT = sym("gt");
export const SYM_GTE = sym("gte");

export const SYM_TYPEOF = sym("typeof");

/** @type {Data} */
const nil = [SYM_QUOTE, []];
/** @type {Data} */
const true_ = [SYM_QUOTE, sym("true")];

const isArray = /** @type {(value: unknown) => value is readonly unknown[]} */ (
  Array.isArray
);
/**
 * @param {Data} value
 * @returns {asserts value is number}
 */
function assertNumber(value) {
  if (typeof value !== "number")
    throw new TypeError("expected number, got " + print(value));
}
/**
 * @param {Data} value
 * @returns {asserts value is readonly [typeof SYM_CONS, Data, Data]}
 */
function assertCons(value) {
  if (!(isArray(value) && value.length === 3 && value[0] === SYM_CONS)) {
    throw new TypeError("expected cons pair");
  }
}
/**
 * @param {Data} l
 * @param {Data} r
 * @returns {boolean}
 */
function equals(l, r) {
  return (
    typeof l === typeof r &&
    (r === l ||
      (Array.isArray(r) &&
        r.every((e, i) => equals(e, /** @type {readonly Data[]} */ (l)[i]))))
  );
}
/** @type {Record<Sym, (..._: Data[]) => Data>} */
const builtins = {
  // arithmetic
  [SYM_ADD](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l + r;
  },
  [SYM_SUB](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l - r;
  },
  [SYM_MUL](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l * r;
  },
  [SYM_DIV](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l / r;
  },
  [SYM_REM](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l % r;
  },
  [SYM_POW](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l ** r;
  },

  // bitwise
  [SYM_BAND](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l & r;
  },
  [SYM_BOR](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l | r;
  },
  [SYM_BXOR](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l ^ r;
  },
  [SYM_BNOT](v) {
    assertNumber(v);
    return ~v;
  },
  [SYM_SHL](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l << r;
  },
  [SYM_SHR](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l >> r;
  },
  [SYM_SHRU](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l >>> r;
  },

  // comparison
  [SYM_EQL](l, r) {
    return equals(l, r) ? true_ : nil;
  },
  [SYM_NEQ](l, r) {
    return !equals(l, r) ? true_ : nil;
  },
  [SYM_GT](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l > r ? true_ : nil;
  },
  [SYM_GTE](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l >= r ? true_ : nil;
  },
  [SYM_LT](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l < r ? true_ : nil;
  },
  [SYM_LTE](l, r) {
    assertNumber(l);
    assertNumber(r);
    return l <= r ? true_ : nil;
  },

  // logical operators
  [SYM_NOT](v) {
    return isNil(v) ? true_ : nil;
  },

  // data structures
  [SYM_CONS](l, r) {
    return [SYM_CONS, l ?? nil, r ?? nil];
  },
  [SYM_CAR](value) {
    assertCons(value);
    return value[1];
  },
  [SYM_CDR](value) {
    assertCons(value);
    return value[2];
  },

  // util
  [SYM_TYPEOF](v) {
    return isNil(v)
      ? [SYM_QUOTE, sym("nil")]
      : typeof v === "object"
      ? [
          SYM_QUOTE,
          v[0] === SYM_QUOTE && isSym(v[1]) ? sym("symbol") : sym("list"),
        ]
      : [SYM_QUOTE, sym(typeof v)];
  },
};
/**
 * @param {Data} data
 * @returns {string}
 */
export function print(data) {
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
    return `'${print(data[1] ?? [])}`;
  }
  return `(${data.map(print).join(" ")})`;
}
/**
 * @param {Data} input
 * @returns {boolean}
 */
function isNil(input) {
  return (
    isArray(input) &&
    input[0] === SYM_QUOTE &&
    isArray(input[1]) &&
    input[1].length === 0
  );
}
/**
 *
 * @param {Data} input
 * @returns {input is Sym | readonly Data[]}
 */
export function canStep(input) {
  if (typeof input == "number") {
    return false;
  }
  if (typeof input === "string") {
    if (isSym(input)) {
      return !(input in builtins);
    } else {
      return false;
    }
  }
  if (input[0] === SYM_CONS) {
    return canStep(input[1] ?? nil) || canStep(input[2] ?? nil);
  }
  if (isNil(input)) {
    return false;
  }
  if (input[0] === SYM_QUOTE && isSym(input[1])) {
    return false;
  }
  if (input[0] === SYM_LAMBDA) {
    return false;
  }
  return true;
}
/**
 *
 * @param {Data} data
 * @param {Map<Sym, Data>} mapping
 * @returns {Data}
 */
function rewrite(data, mapping) {
  if (typeof data === "string") {
    if (isSym(data)) {
      return mapping.get(data) ?? data;
    }
    return data;
  }
  if (typeof data === "number") {
    return data;
  }
  if (data[0] === SYM_QUOTE) {
    return data;
  }
  if (data[0] === SYM_LAMBDA) {
    const newMapping = new Map(mapping);
    if (isArray(data[1])) {
      for (const binding of data[1]) {
        if (isSym(binding)) {
          newMapping.delete(binding);
        }
      }
    }
    return [SYM_LAMBDA, data[1] ?? nil, rewrite(data[2], newMapping)];
  }
  return data.map((value) => rewrite(value, mapping));
}
/**
 * @param {Data} input
 * @returns {Data}
 */
export function step(input) {
  if (canStep(input)) {
    if (isSym(input)) {
      throw new TypeError(print(input) + " is not defined");
    } else {
      const fn = input[0] ?? nil;
      if (fn === SYM_IF) {
        if (canStep(input[1])) {
          return [input[0], step(input[1]), ...input.slice(2)];
        }
        return !isNil(input[1]) ? input[2] : input[3] ?? nil;
      }
      if (fn === SYM_OR) {
        if (canStep(input[1])) {
          return [input[0], step(input[1]), ...input.slice(2)];
        }
        return isNil(input[1]) ? input[2] : input[1];
      }
      if (fn === SYM_AND) {
        if (canStep(input[1])) {
          return [input[0], step(input[1]), ...input.slice(2)];
        }
        return isNil(input[1]) ? nil : input[2];
      }
      for (let i = 0; i < input.length; i++) {
        const arg = input[i];
        if (canStep(arg)) {
          return [...input.slice(0, i), step(arg), ...input.slice(i + 1)];
        }
      }
      if (isArray(fn) && fn[0] === SYM_LAMBDA) {
        const paramNames = fn[1] ?? nil;
        if (
          !(fn.length === 3 && isArray(paramNames) && paramNames.every(isSym))
        ) {
          throw new TypeError(print(fn) + " is not a valid lambda");
        }
        /** @type {Map<Sym, Data>} */
        const mapping = new Map();
        for (let i = 0; i < paramNames.length; i++) {
          mapping.set(paramNames[i], input[i + 1] ?? nil);
        }
        return rewrite(fn[2], mapping);
      } else if (isSym(fn)) {
        const execute = builtins[fn];
        if (execute) {
          return execute(...input.slice(1));
        } else {
          throw new TypeError(print(fn) + " is not defined");
        }
      } else {
        throw new TypeError("expected symbol, got " + print(fn));
      }
    }
  } else {
    return input;
  }
}
