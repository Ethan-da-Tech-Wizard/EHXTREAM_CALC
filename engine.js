// ==============================================================================
// Program: engine.js
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Dependency-free, bounded mathematical evaluator supporting arithmetic precedence,
//          trigonometric operations across angle units (deg, rad, grad), matrix linear algebra,
//          and 32-bit bitwise logic operations without code execution risks.
//
// How it fits: this is the whole math core of the project and has no DOM dependency.
//   - calculator.js (the <extreme-calculator> web element) imports evaluate/formatValue/
//     FUNCTIONS from here for every keypress and graph sample.
//   - index.d.ts describes this file's three exports for TypeScript users; package.json's
//     "." export points straight at this file.
//   - scripts/build.mjs bundles it with calculator.js into dist/ (generated; never edit it).
//   - engine.test.js exercises it directly under `node --test`.
//
// Public API (exactly three exports):
//   evaluate(expression, {angle, variables}) -> number | number[] | number[][]
//   formatValue(value, precision)            -> string
//   FUNCTIONS                                 -> frozen list of {name, syntax, description, example}
//
// Pipeline for one evaluate() call: tokenize() (cached) -> recursive-descent parse that
//   computes values AS IT PARSES (there is no AST) -> shape() validation of the result.
//   Because values are computed during parsing, every limit below is enforced inline.
//
// Design decisions: (1) no eval/new Function, so untrusted text cannot execute code;
//   (2) every number passes through finite(), so NaN/Infinity can never be returned;
//   (3) hard caps (LIMITS) bound CPU and recursion; (4) the function registry has a null
//   prototype and variables are restricted to `x` and `ans`, so user text cannot reach
//   Object.prototype members; (5) errors are plain Error objects with user-readable text.
//
// Known limits: matrices are at most 16x16, expressions at most 16384 characters; complex
//   numbers are unsupported; `%` is a scalar remainder with the sign of the dividend (JS
//   semantics); trig of exact multiples of pi shows normal floating-point residue.
//
// Test: `npm test` (node --test engine.test.js). All code here is synchronous and pure
//   apart from the module-level token cache.
// ==============================================================================
// ---------------------------------------------------------------------------
// Section 1: resource limits and value validators
// ---------------------------------------------------------------------------
// Hard resource caps that make evaluation safe on untrusted input (there is no
// eval/Function anywhere in this file):
//   length    - max characters in an expression
//   tokens    - max tokens produced by the lexer
//   depth     - max nesting of parentheses/unary/array/call recursion
//   dimension - max entries per array dimension (so matrices are <= 16x16)
//   work      - max "spend" units (roughly arithmetic steps) per evaluate() call
// Defaults chosen empirically: 16 per dimension keeps a matrix product at 4096
// multiply-adds, well inside the 100000 work budget, while 64 nesting levels is far below
// the JS stack limit so a deep expression fails with our message, not a RangeError.
const LIMITS = Object.freeze({ length: 16384, tokens: 2048, depth: 64, dimension: 16, work: 100000 });
// Single failure path: every validation error is a plain Error with a message
// meant to be shown directly to the calculator user.
// Throws instead of returning an error value, so an inner failure aborts the whole parse at
// once; used as an expression (`cond ? x : fail(..)`) by the validators below.
const fail = message => { throw new Error(message); };
// Guard applied to every intermediate result: NaN, +-Infinity and non-numbers
// (domain errors, overflow, division results) abort evaluation immediately
// instead of propagating silently.
const finite = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Expected a finite real number (domain error or overflow)');
  // Preserve signed zero so dms(-0, minutes, seconds) can express negative angles.
  return value;
};
// The checkers below compose: scalar() = finite number (not array); integer()
// = safe integer; positive()/nonnegative() = sign constraints. Each returns its
// input so it can be used inline, e.g. integer(nonnegative(n)).
const scalar = value => typeof value === 'number' ? finite(value) : fail('Expected a scalar number');
const integer = value => Number.isSafeInteger(scalar(value)) ? value : fail('Expected a safe integer');
const positive = value => scalar(value) > 0 ? value : fail('Expected a positive number');
const nonnegative = value => scalar(value) >= 0 ? value : fail('Expected a nonnegative number');
const isArray = Array.isArray;
/**
 * Validates a value and returns its shape.
 * @param {unknown} value - scalar, vector, or matrix.
 * @returns {number[]} [] (scalar), [n] (vector) or [rows, cols] (matrix).
 * @throws {Error} on non-finite entries, ragged rows, empty or over-16 dimensions. Only
 *   two nesting levels are inspected, so 3-D arrays are rejected by the rectangular check.
 */
// Validate a value and return its shape: [] for a scalar, [n] for a vector,
// [rows, cols] for a rectangular matrix. Every entry must be a finite number
// and each dimension must be within LIMITS.dimension. Throws otherwise, so
// calling shape() doubles as a validity check.
function shape(value) {
  if (!isArray(value)) { scalar(value); return []; }
  if (!value.length || value.length > LIMITS.dimension) fail('Arrays must contain 1–16 entries per dimension');
  if (!isArray(value[0])) {
    for (const entry of value) scalar(entry);
    return [value.length];
  }
  const width = value[0].length;
  if (!width || width > LIMITS.dimension) fail('Matrices must have 1–16 columns');
  for (const row of value) {
    if (!isArray(row) || row.length !== width) fail('Expected a rectangular matrix');
    for (const entry of row) scalar(entry);
  }
  return [value.length, width];
}

// ---------------------------------------------------------------------------
// Section 2: array and linear-algebra helpers (all of them validate with shape())
// ---------------------------------------------------------------------------
/**
 * @param {unknown} value - candidate matrix.
 * @param {boolean} [square=false] - also require rows === cols (needed for det/inverse).
 * @returns {number[]} [rows, cols].
 * @throws {Error} if it is not a matrix (or not square when requested).
 */
// Assert `value` is a matrix (optionally square) and return its shape.
function matrix(value, square = false) {
  const s = shape(value);
  if (s.length !== 2 || (square && s[0] !== s[1])) fail(square ? 'Expected a square matrix' : 'Expected a matrix');
  return s;
}
// Assert `value` is a 1-D array.
function vector(value) {
  if (shape(value).length !== 1) fail('Expected a vector');
  return value;
}
// Apply fn to every scalar in a scalar/vector/matrix, preserving structure and
// re-checking each result with finite().
function map(value, fn) { return isArray(value) ? value.map(v => map(v, fn)) : finite(fn(value)); }
// Element-wise combine of two same-shaped values (used for + and -). Shapes
// are compared via JSON so scalar+scalar, vector+vector and matrix+matrix are
// all allowed but mixing shapes is rejected.
function zip(a, b, fn) {
  if (JSON.stringify(shape(a)) !== JSON.stringify(shape(b))) fail('Array dimensions must match');
  const walk = (x, y) => isArray(x) ? x.map((v, i) => walk(v, y[i])) : finite(fn(x, y));
  return walk(a, b);
}
// Multiplication: scalar*anything scales element-wise; otherwise a true matrix
// product (m x n)(n x q). ctx.spend() is called per multiply-add so large
// products count toward the work limit.
/**
 * @param {number|number[]|number[][]} a - left operand.
 * @param {number|number[]|number[][]} b - right operand.
 * @param {{spend: () => void}} ctx - evaluation context; spend() is charged once per
 *   multiply-add so a 16x16 times 16x16 product (4096 steps) is bounded by LIMITS.work.
 * @returns {number|number[]|number[][]} scaled value or matrix product. Note vectors are
 *   rejected in vector*vector products: matrix() needs 2-D arrays, so use dot() instead.
 * @throws {Error} on inner-dimension mismatch or non-finite intermediate results.
 */
function product(a, b, ctx) {
  if (!isArray(a)) return map(b, v => scalar(a) * v);
  if (!isArray(b)) return map(a, v => v * scalar(b));
  const [m, n] = matrix(a), [p, q] = matrix(b);
  if (n !== p) fail('Matrix multiplication dimensions must match');
  return Array.from({ length: m }, (_, i) => Array.from({ length: q }, (_, j) => {
    let total = 0;
    for (let k = 0; k < n; k++) { ctx.spend(); total = finite(total + finite(a[i][k] * b[k][j])); }
    return total;
  }));
}
/**
 * Gaussian elimination with partial pivoting for square matrices.
 * Computes either:
 *   - The matrix determinant (invert=false) in O(N^3) arithmetic operations.
 *   - The matrix inverse (invert=true) via Gauss-Jordan elimination on augmented [A | I].
 * 
 * Numerical Stability & Partial Pivoting:
 * Floating-point arithmetic on unpivoted matrices is prone to catastrophic roundoff error
 * if a diagonal pivot is close to zero. Partial pivoting scans column entries to locate the
 * row with maximum absolute pivot magnitude, swapping rows to preserve numerical precision.
 * Singular / ill-conditioned detection compares pivot magnitude against machine epsilon (Number.EPSILON * n * scale).
 *
 * @param {number[][]} value - square matrix, at most 16x16 (copied; the input is never mutated).
 * @param {boolean} invert - false returns the determinant, true returns the inverse.
 * @param {{spend: () => void}} ctx - charged once per inner-loop update (work limit).
 * @returns {number|number[][]} determinant, or the inverse matrix.
 * @throws {Error} if the matrix is not square, an inverse is requested of a singular or
 *   numerically singular matrix, or a value overflows. A singular matrix gives determinant 0
 *   (no throw) because that is a valid answer for det().
 */
function elimination(value, invert, ctx) {
  const [n] = matrix(value, true);
  const a = value.map(row => row.slice());
  const identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  let determinant = 1;
  // Largest magnitude entry: scales the singularity threshold so a matrix of tiny numbers is
  // not wrongly called singular (and a matrix of huge numbers is not wrongly called regular).
  const scale = Math.max(...a.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    // Partial pivoting: pick the row at or below `col` with the largest |entry| in this
    // column to keep the divisor as far from zero as possible.
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (a[pivot][col] === 0 || (invert && Math.abs(a[pivot][col]) <= Number.EPSILON * n * scale)) {
      if (invert) fail('Matrix is singular or numerically ill-conditioned');
      return 0;
    }
    // Swapping rows flips the determinant's sign; the identity half is swapped in lockstep
    // so it keeps recording the same row operations (needed only when inverting).
    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      [identity[pivot], identity[col]] = [identity[col], identity[pivot]];
      determinant = -determinant;
    }
    const divisor = a[col][col];
    if (!invert) determinant = finite(determinant * divisor);
    // Gauss-Jordan: normalise the pivot row so the pivot becomes 1, in both halves.
    if (invert) {
      for (let j = 0; j < n; j++) { ctx.spend(); a[col][j] = finite(a[col][j] / divisor); identity[col][j] = finite(identity[col][j] / divisor); }
    }
    // Eliminate this column from other rows: only rows BELOW for a determinant (upper
    // triangular is enough), ALL other rows for an inverse (reduces A to the identity).
    for (let row = invert ? 0 : col + 1; row < n; row++) {
      if (row === col) continue;
      const factor = invert ? a[row][col] : finite(a[row][col] / divisor);
      for (let j = invert ? 0 : col + 1; j < n; j++) {
        ctx.spend();
        a[row][j] = finite(a[row][j] - finite(factor * a[col][j]));
        if (invert) identity[row][j] = finite(identity[row][j] - finite(factor * identity[col][j]));
      }
      a[row][col] = 0;
    }
  }
  return invert ? identity : determinant;
}
/**
 * @param {number} value - nonnegative integer; 0 to 170 inclusive.
 * @returns {number} value!. 171! overflows a double, hence the cap of 170.
 * @throws {Error} for negatives, non-integers or values above 170.
 */
function factorial(value) {
  const n = integer(nonnegative(value));
  if (n > 170) fail('Factorial exceeds the finite number range');
  let result = 1;
  for (let i = 2; i <= n; i++) result = finite(result * i);
  return result;
}
// nCr / nPr computed multiplicatively (never via full factorials) to avoid
// overflow. For combinations r is replaced by min(r, n-r) since C(n,r)=C(n,n-r),
// which keeps the loop short. The result is rounded when it is still a safe
// integer, to remove floating-point residue from the divisions.
/**
 * @param {number} n - nonnegative integer.
 * @param {number} r - integer with 0 <= r <= n.
 * @param {boolean} permute - true gives nPr, false gives nCr.
 * @param {{spend: () => void}} ctx - charged once per loop step.
 * @returns {number} the count (rounded to an exact integer when it is a safe integer).
 * @throws {Error} on invalid arguments, r over 1000 (work cap) or float overflow.
 */
function combinations(n, r, permute, ctx) {
  integer(nonnegative(n)); integer(nonnegative(r));
  if (r > n) fail('Require 0 <= r <= n');
  if (!permute) r = Math.min(r, n - r);
  if (r > 1000) fail('Combination/permutation work limit exceeded');
  let result = 1;
  for (let i = 1; i <= r; i++) { ctx.spend(); result = finite(result * (permute ? n - i + 1 : (n - r + i) / i)); }
  return Number.isSafeInteger(Math.round(result)) ? Math.round(result) : result;
}
// Function table: name -> {syntax, description, example, min/max arity, run}.
// It has a null prototype so names like "constructor" or "toString" can never
// be mistaken for functions.
const registry = Object.create(null);
// Register one callable. `run` receives (argsArray, ctx) where ctx carries the
// angle conversion factor and the work counter.
/**
 * @param {string} name - function name as typed by users (lower case).
 * @param {string} syntax - signature shown in the help list, e.g. 'log(x, base=10)'.
 * @param {string} description - one-line help text.
 * @param {string} example - sample expression; the test suite evaluates every example.
 * @param {number} min - minimum argument count.
 * @param {number} max - maximum argument count.
 * @param {(args: Array, ctx: object) => number|number[]|number[][]} run - implementation.
 * @returns {void} adds the entry to `registry` (and so to FUNCTIONS and the parser).
 */
function define(name, syntax, description, example, min, max, run) {
  registry[name] = { name, syntax, description, example, min, max, run };
}
// Shorthand for one-argument functions: validates the argument as a scalar.
const unary = (name, description, example, fn) => define(name, `${name}(x)`, description, example, 1, 1, ([x], ctx) => fn(scalar(x), ctx));
const trigNames = { sin: 'Sine', cos: 'Cosine', tan: 'Tangent' };
// Trig functions take their argument in the selected angle unit; ctx.toRadians
// converts it. tan is rejected near odd multiples of 90 degrees where cos ~ 0.
for (const name of ['sin', 'cos', 'tan']) unary(name, `${trigNames[name]} of an angle in the selected unit.`, `${name}(45)`, (x, ctx) => {
  const radians = finite(x * ctx.toRadians);
  if (name === 'tan' && Math.abs(Math.cos(radians)) < 1e-14) fail('Tangent is undefined at this angle');
  return Math[name](radians);
});
for (const name of ['asin', 'acos', 'atan']) unary(name, `Inverse ${trigNames[name.slice(1)].toLowerCase()}; returns the principal angle in the selected unit${name === 'atan' ? '.' : '; input from -1 to 1.'}`, `${name}(0.5)`, (x, ctx) => Math[name](x) / ctx.toRadians);
// sec/csc/cot are computed from cos/sin and refuse poles instead of returning
// huge values.
for (const [name, description] of Object.entries({ sec: 'Secant (1/cos)', csc: 'Cosecant (1/sin)', cot: 'Cotangent (cos/sin)' })) {
  unary(name, `${description} in the selected angle unit; rejects poles (denominator magnitude below 1e-14).`, `${name}(45)`, (x, ctx) => {
    const radians = finite(x * ctx.toRadians);
    const denominator = name === 'sec' ? Math.cos(radians) : Math.sin(radians);
    if (Math.abs(denominator) < 1e-14) fail(`${name} is undefined at this angle`);
    return (name === 'cot' ? Math.cos(radians) : 1) / denominator;
  });
}
unary('todeg', 'Convert radians to degrees, independent of angle mode.', 'todeg(pi)', x => x * (180 / Math.PI));
unary('torad', 'Convert degrees to radians, independent of angle mode.', 'torad(180)', x => x * (Math.PI / 180));
define('dms', 'dms(degrees, minutes, seconds)', 'Convert to decimal degrees; the degrees sign (including -0) applies to the entire angle. Minutes and seconds must be from 0 inclusive to 60 exclusive; independent of angle mode.', 'dms(-30, 15, 30)', 3, 3, ([degrees, minutes, seconds]) => {
  scalar(degrees); scalar(minutes); scalar(seconds);
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) fail('DMS minutes and seconds must satisfy 0 <= value < 60');
  const sign = degrees < 0 || Object.is(degrees, -0) ? -1 : 1;
  return sign * finite(Math.abs(degrees) + minutes / 60 + seconds / 3600);
});
// atan2 result is converted back from radians into the selected angle unit.
define('atan2', 'atan2(y, x)', 'Quadrant-aware inverse tangent in the selected angle unit; (0,0) is undefined.', 'atan2(1, -1)', 2, 2, ([y, x], ctx) => {
  scalar(y); scalar(x);
  if (x === 0 && y === 0) fail('atan2(0, 0) is undefined');
  return Math.atan2(y, x) / ctx.toRadians;
});
// Thin wrappers over Math.* for functions whose only difference is the name;
// finite() in the wrappers turns NaN (e.g. sqrt(-1)) into a domain error.
const mathDescriptions = {
  sinh: 'Hyperbolic sine, (exp(x) - exp(-x))/2; independent of angle mode.',
  cosh: 'Hyperbolic cosine, (exp(x) + exp(-x))/2; independent of angle mode.',
  tanh: 'Hyperbolic tangent, sinh(x)/cosh(x); independent of angle mode.',
  asinh: 'Inverse hyperbolic sine; accepts any real number, independent of angle mode.',
  acosh: 'Inverse hyperbolic cosine; x >= 1, independent of angle mode.',
  atanh: 'Inverse hyperbolic tangent; -1 < x < 1, independent of angle mode.',
  sqrt: 'Nonnegative square root; x >= 0.',
  cbrt: 'Real cube root, including negative inputs.',
  abs: 'Absolute value: distance from zero.',
  exp: 'Exponential: Euler’s number e raised to x.',
  floor: 'Round down to the nearest integer, toward negative infinity.',
  ceil: 'Round up to the nearest integer, toward positive infinity.',
  round: 'Round to the nearest integer; exact halves round toward positive infinity.',
};
for (const [name, description] of Object.entries(mathDescriptions)) {
  unary(name, description, `${name}(${name === 'atanh' ? '0.5' : '1'})`, Math[name]);
}
unary('ln', 'Natural logarithm; x > 0.', 'ln(e)', x => Math.log(positive(x)));
// Change of base: log_b(x) = ln(x)/ln(b).
define('log', 'log(x, base=10)', 'Logarithm; x and base positive, base != 1.', 'log(8, 2)', 1, 2, ([x, base = 10]) => {
  positive(x); positive(base);
  if (base === 1) fail('Logarithm base must not equal 1');
  return Math.log(x) / Math.log(base);
});
unary('factorial', 'Factorial of an integer from 0 through 170; also x!.', 'factorial(5)', factorial);
for (const name of ['ncr', 'npr']) define(name, `${name}(n, r)`, `Number of ${name === 'ncr' ? 'combinations' : 'permutations'}; integers 0 <= r <= n.`, `${name}(5, 2)`, 2, 2, ([n, r], ctx) => combinations(n, r, name === 'npr', ctx));
// Accept either variadic numbers (min(1,2,3)) or one array (min([1,2,3])); a
// nested array is flattened. Every entry must be a finite number.
/**
 * @param {Array} args - raw call arguments: either numbers or a single (nested) array.
 * @returns {number[]} flat list of finite numbers (at least one).
 * @throws {Error} when empty or when any entry is not a finite scalar.
 */
function items(args) {
  const values = args.length === 1 && isArray(args[0]) ? args[0].flat() : args;
  if (!values.length) fail('Expected at least one number');
  values.forEach(scalar);
  return values;
}
const aggregateDescriptions = { min: 'Smallest value', max: 'Largest value', sum: 'Total', mean: 'Arithmetic average', hypot: 'Square root of the sum of squares' };
for (const name of ['min', 'max', 'sum', 'mean', 'hypot']) define(name, `${name}(x, ...) or ${name}([values])`, `${aggregateDescriptions[name]} of numbers or all entries of one array.`, `${name}(1, 2, 3)`, 1, 256, args => {
  const values = items(args);
  if (name === 'min' || name === 'max' || name === 'hypot') return Math[name](...values);
  return values.reduce((a, b) => finite(a + (name === 'mean' ? b / values.length : b)), 0);
});
define('det', 'det(matrix)', 'Determinant of a square matrix, using pivoted elimination.', 'det([[1,2],[3,4]])', 1, 1, ([a], ctx) => elimination(a, false, ctx));
define('inverse', 'inverse(matrix)', 'Inverse of a square matrix; rejects singular or ill-conditioned matrices.', 'inverse([[1,2],[3,4]])', 1, 1, ([a], ctx) => elimination(a, true, ctx));
define('transpose', 'transpose(matrix)', 'Swap matrix rows and columns.', 'transpose([[1,2],[3,4]])', 1, 1, ([a]) => {
  const [m, n] = matrix(a);
  return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => a[i][j]));
});
define('dot', 'dot(vector, vector)', 'Dot product of equal-length vectors.', 'dot([1,2], [3,4])', 2, 2, ([a, b]) => {
  vector(a); vector(b);
  if (a.length !== b.length) fail('Vector dimensions must match');
  return a.reduce((total, v, i) => finite(total + finite(v * b[i])), 0);
});
define('norm', 'norm(array)', 'Euclidean vector norm or Frobenius matrix norm.', 'norm([3,4])', 1, 1, ([a]) => {
  if (!shape(a).length) fail('Expected a vector or matrix');
  return Math.hypot(...a.flat());
});
// Bitwise operators work on 32-bit integers. Accepts the signed (-2^31..2^31-1)
// and unsigned (up to 2^32-1) ranges and normalises with `| 0` to a signed
// 32-bit value, matching JavaScript's own bitwise semantics.
/**
 * @param {number} value - integer from -2147483648 to 4294967295.
 * @returns {number} the same bit pattern as a signed 32-bit integer (4294967295 becomes -1).
 * @throws {Error} for non-integers or values that do not fit 32 bits.
 */
function bits(value) {
  integer(value);
  if (value < -2147483648 || value > 4294967295) fail('Bitwise input must fit 32 bits');
  return value | 0;
}
for (const [name, fn] of Object.entries({ and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b })) {
  define(name, `${name}(a, b)`, `32-bit bitwise ${name.toUpperCase()}; result is a signed integer.`, `${name}(0b1010, 0b1100)`, 2, 2, ([a, b]) => fn(bits(a), bits(b)));
}
unary('not', '32-bit bitwise complement; result is a signed integer.', 'not(0)', x => ~bits(x));
for (const [name, fn] of Object.entries({ shl: (a, n) => a << n, shr: (a, n) => a >> n })) {
  define(name, `${name}(x, count)`, `32-bit ${name === 'shr' ? 'sign-preserving right' : 'left'} shift, count 0–31.`, `${name}(8, 2)`, 2, 2, ([x, n]) => {
    const a = bits(x); integer(n);
    if (n < 0 || n > 31) fail('Shift count must be from 0 through 31');
    return fn(a, n);
  });
}
/** Discoverable documentation for every callable function. */
export const FUNCTIONS = Object.freeze(Object.values(registry).map(({ name, syntax, description, example }) => Object.freeze({ name, syntax, description, example })));

// Small bounded LRU cache avoids rescanning expressions for graph samples.
const tokenCache = new Map();
/**
 * Lexer: splits an expression into tokens (numbers, identifiers, punctuation, then 'end').
 * Results are cached (see tokenCache) and the SAME array is returned on a hit, so callers
 * must treat tokens as read-only; evaluate() does.
 *
 * @param {string} expression - non-empty text, at most LIMITS.length (16384) characters.
 * @returns {Array<{type: string, value?: (number|string)}>} tokens ending with {type:'end'}.
 * @throws {Error} on a non-string or empty input, unexpected characters, malformed numeric
 *   literals (0b102, 1.2.3) or more than LIMITS.tokens (2048) tokens.
 */
function tokenize(expression) {
  if (typeof expression !== 'string' || !expression.trim()) fail('Expression must be a nonempty string');
  if (expression.length > LIMITS.length) fail('Expression length limit exceeded');
  // LRU hit: re-insert the entry so Map iteration order keeps it "most recent".
  if (tokenCache.has(expression)) {
    const cached = tokenCache.get(expression);
    tokenCache.delete(expression); tokenCache.set(expression, cached);
    return cached;
  }
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const c = expression[i];
    if (/\s/.test(c)) { i++; continue; }
    if (tokens.length >= LIMITS.tokens) fail('Token limit exceeded');
    // `rest` lets each anchored (^) regex test the text at the cursor only. Slicing per token
    // is O(n^2) in the worst case, which the 16384-character cap keeps affordable.
    const rest = expression.slice(i);
    let match;
    // Binary (0b...) and hex (0x...) literals. A literal glued to more word
    // characters (e.g. 0b102) is rejected rather than split in two.
    if (/^0[bBxX]/.test(rest)) {
      const hex = /^0[xX]/.test(rest);
      match = (hex ? /^0[xX][0-9a-fA-F]+/ : /^0[bB][01]+/).exec(rest);
      if (!match) fail(`Invalid ${hex ? 'hexadecimal' : 'binary'} literal at ${i}`);
      const end = i + match[0].length;
      if (/[\w.]/.test(expression[end] || '')) fail(`Invalid ${hex ? 'hexadecimal' : 'binary'} literal at ${i}`);
      tokens.push({ type: 'number', value: finite(Number(match[0])) }); i = end;
    } else if ((match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) {
      // Decimal numbers with optional fraction and exponent; a second '.' directly
      // after the number (1.2.3) is an error.
      tokens.push({ type: 'number', value: finite(Number(match[0])) }); i += match[0].length;
      if (expression[i] === '.') fail(`Invalid number at ${i}`);
    } else if ((match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest))) {
      // Identifiers (function names, constants, variables); resolved at parse time.
      tokens.push({ type: 'identifier', value: match[0] }); i += match[0].length;
    } else if ('+-*/%^!(),[]'.includes(c)) { tokens.push({ type: c, value: c }); i++; }
    else fail(`Unexpected character '${c}' at ${i}`);
  }
  tokens.push({ type: 'end' });
  // Evict the oldest entry (first key in the Map) once 32 expressions are cached.
  if (tokenCache.size >= 32) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(expression, tokens);
  return tokens;
}

/**
 * Evaluate a real-valued expression. Default angle mode: radians. x is a finite scalar; ans may also be a vector or matrix.
 *
 * Recursive Descent Mathematical Evaluator
 * Evaluates an infix expression through predictive recursive descent parsing:
 *   add (precedence 1: +, -)
 *     -> multiply (precedence 2: *, /, %, implicit multiplication)
 *       -> unaryExpression (precedence 3: prefix +, -)
 *         -> power (precedence 4: factorial postfix !, exponentiation ^)
 *           -> primary (numbers, grouped subexpressions, arrays, function calls, variables)
 * 
 * Safety & Denial of Service Defense:
 * Tracks recursion call depth (depth limit 64) and operation counts (work limit 100,000)
 * to prevent stack overflow from deeply nested parentheses and CPU exhaustion from matrix operations.
 *
 * @param {string} expression - the text to evaluate; implicit multiplication (2pi, 3(4)) is
 *   supported, `!` is postfix factorial, `^` is right-associative power.
 * @param {{angle?: 'deg'|'rad'|'grad', variables?: {x?: number, ans?: (number|number[]|number[][])}}} [options]
 *   angle defaults to 'rad'. Only the own data properties `x` and `ans` of `variables` are read.
 * @returns {number|number[]|number[][]} a finite scalar, a vector or a matrix.
 * @throws {Error} with a user-readable message for any syntax, domain, limit or type error.
 *   evaluate never throws non-Error values and has no side effects beyond the token cache.
 */
export function evaluate(expression, options = {}) {
  if (!options || typeof options !== 'object' || isArray(options)) fail('Options must be an object');
  const { angle = 'rad', variables = {} } = options;
  if (!['deg', 'rad', 'grad'].includes(angle)) fail('Angle mode must be deg, rad, or grad');
  if (!variables || typeof variables !== 'object' || isArray(variables)) fail('Variables must be an object');
  // Only 'x' and 'ans' are accepted as variables, and only as plain data
  // properties; getters could run arbitrary user code, so they are refused.
  // Copy own data properties only. Do not invoke user-defined getters.
  const scope = Object.create(null);
  for (const name of ['x', 'ans']) {
    const descriptor = Object.getOwnPropertyDescriptor(variables, name);
    if (descriptor) {
      if (!('value' in descriptor)) fail('Variable getters are not supported');
      if (name === 'ans') { shape(descriptor.value); scope[name] = map(descriptor.value, v => v); }
      else scope[name] = scalar(descriptor.value);
    }
  }
  // Parser state shared by the closures below: `pos` is the cursor into `tokens`, `depth` the
  // current recursion depth and `work` the running cost against LIMITS.work.
  const tokens = tokenize(expression);
  let pos = 0, depth = 0, work = 0;
  // toRadians converts the selected angle unit to radians (deg: pi/180, grad:
  // pi/200, rad: 1). spend() is the shared work counter used by all heavy loops.
  const ctx = { toRadians: angle === 'deg' ? Math.PI / 180 : angle === 'grad' ? Math.PI / 200 : 1,
    spend() { if (++work > LIMITS.work) fail('Evaluation work limit exceeded'); } };
  // peek: type of the next token without consuming it. take: consume it if it matches.
  // expect: consume or fail with the 1-based token index (the 'end' token guarantees that
  // tokens[pos] always exists, so peek never reads past the array).
  const peek = () => tokens[pos].type;
  const take = type => { if (peek() === type) { pos++; return true; } return false; };
  const expect = type => { if (!take(type)) fail(`Expected '${type}' at token ${pos + 1}`); };
  // Wraps every recursive entry point to enforce the depth limit and count one
  // unit of work; `finally` keeps depth correct when an error unwinds the stack.
  function nested(fn) {
    if (++depth > LIMITS.depth) fail('Expression nesting limit exceeded');
    try { ctx.spend(); return fn(); } finally { depth--; }
  }
  // Lowest precedence: left-associative + and -, applied element-wise. Grammar:
  //   add := multiply (('+' | '-') multiply)*
  function add() {
    let a = multiply();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++].type, b = multiply(); ctx.spend();
      a = zip(a, b, op === '+' ? (x, y) => x + y : (x, y) => x - y);
    }
    return a;
  }
  // multiply := unaryExpression (('*' | '/' | '%' | implicit) unaryExpression)*
  // Handles explicit * / % and also implicit multiplication: a number, name, '('
  // or '[' directly after an operand multiplies (so 2pi and 3(4) work). Division
  // and modulo require a nonzero scalar divisor.
  function multiply() {
    let a = unaryExpression();
    while (['*', '/', '%', 'number', 'identifier', '(', '['].includes(peek())) {
      const explicit = ['*', '/', '%'].includes(peek());
      const op = explicit ? tokens[pos++].type : '*';
      const b = unaryExpression(); ctx.spend();
      if (op === '*') a = product(a, b, ctx);
      else {
        scalar(b);
        if (b === 0) fail('Division by zero');
        a = op === '/' ? map(a, v => v / b) : finite(scalar(a) % b);
      }
    }
    return a;
  }
  // unaryExpression := ('+' | '-') unaryExpression | power. Prefix + and -; recursion allows
  // chains such as --x. Because ^ is handled below this level, -2^2 is -(2^2) = -4.
  function unaryExpression() {
    return nested(() => {
      if (take('+')) return unaryExpression();
      if (take('-')) return map(unaryExpression(), x => -x);
      return power();
    });
  }
  // power := primary '!'* ('^' unaryExpression)?
  // Postfix factorial binds tighter than ^. The exponent is parsed with
  // unaryExpression, which makes ^ right-associative and allows 2^-3.
  function power() {
    let a = primary();
    while (take('!')) { ctx.spend(); a = factorial(a); }
    if (take('^')) a = finite(scalar(a) ** scalar(unaryExpression()));
    return a;
  }
  // primary := number | '(' add ')' | '[' add (',' add)* ']' | name '(' args ')' | constant | variable.
  // Atoms: numbers, parenthesised expressions, [array literals], function calls,
  // the constants pi/e/tau, and the variables x/ans. Unknown names are errors.
  function primary() {
    if (peek() === 'number') return tokens[pos++].value;
    if (take('(')) { const value = nested(add); expect(')'); return value; }
    if (take('[')) {
      const values = [];
      do {
        if (values.length >= LIMITS.dimension) fail('Array dimension limit exceeded (16)');
        values.push(nested(add));
      } while (take(','));
      expect(']'); shape(values); return values;
    }
    if (peek() === 'identifier') {
      const name = tokens[pos++].value;
      if (Object.hasOwn(registry, name)) {
        expect('(');
        const args = [];
        if (peek() !== ')') do {
          if (args.length >= 256) fail('Function argument limit exceeded');
          args.push(nested(add));
        } while (take(','));
        expect(')');
        const fn = registry[name];
        if (args.length < fn.min || args.length > fn.max) fail(`Wrong number of arguments for ${name}`);
        ctx.spend();
        const result = fn.run(args, ctx); shape(result); return result;
      }
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      if (name === 'tau') return 2 * Math.PI;
      if (Object.hasOwn(scope, name)) return scope[name];
      fail(`Unknown name '${name}'`);
    }
    fail(`Expected a number, function, or parenthesis at token ${pos + 1}`);
  }
  // The whole input must be consumed (expect 'end') and the result validated.
  const result = add();
  expect('end'); shape(result);
  return result;
}

/**
 * Format scalars, vectors, and matrices with 1–100 significant digits.
 *
 * @param {number|number[]|number[][]} value - value to print; validated with shape().
 * @param {number} [precision=12] - significant digits, integer 1 to 100.
 * @returns {string} e.g. '0.3', '[1, 2]', '[[1, 2], [3, 4]]'.
 * @throws {Error} for a bad precision or an invalid/non-finite value.
 */
// Format with toPrecision then re-parse through Number so trailing zeros and
// needless exponents are dropped (e.g. 0.30000000000 -> 0.3).
export function formatValue(value, precision = 12) {
  if (!Number.isInteger(precision) || precision < 1 || precision > 100) fail('Precision must be an integer from 1 through 100');
  shape(value);
  const format = v => isArray(v) ? `[${v.map(format).join(', ')}]` : String(Number(finite(v).toPrecision(precision)));
  return format(value);
}
