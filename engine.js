/** Dependency-free calculator. All parsing and evaluation is bounded; no code execution. */
const LIMITS = Object.freeze({ length: 16384, tokens: 2048, depth: 64, dimension: 16, work: 100000 });
const fail = message => { throw new Error(message); };
const finite = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Expected a finite real number (domain error or overflow)');
  // Preserve signed zero so dms(-0, minutes, seconds) can express negative angles.
  return value;
};
const scalar = value => typeof value === 'number' ? finite(value) : fail('Expected a scalar number');
const integer = value => Number.isSafeInteger(scalar(value)) ? value : fail('Expected a safe integer');
const positive = value => scalar(value) > 0 ? value : fail('Expected a positive number');
const nonnegative = value => scalar(value) >= 0 ? value : fail('Expected a nonnegative number');
const isArray = Array.isArray;
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
function matrix(value, square = false) {
  const s = shape(value);
  if (s.length !== 2 || (square && s[0] !== s[1])) fail(square ? 'Expected a square matrix' : 'Expected a matrix');
  return s;
}
function vector(value) {
  if (shape(value).length !== 1) fail('Expected a vector');
  return value;
}
function map(value, fn) { return isArray(value) ? value.map(v => map(v, fn)) : finite(fn(value)); }
function zip(a, b, fn) {
  if (JSON.stringify(shape(a)) !== JSON.stringify(shape(b))) fail('Array dimensions must match');
  const walk = (x, y) => isArray(x) ? x.map((v, i) => walk(v, y[i])) : finite(fn(x, y));
  return walk(a, b);
}
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
function elimination(value, invert, ctx) {
  const [n] = matrix(value, true);
  const a = value.map(row => row.slice());
  const identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  let determinant = 1;
  const scale = Math.max(...a.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (a[pivot][col] === 0 || (invert && Math.abs(a[pivot][col]) <= Number.EPSILON * n * scale)) {
      if (invert) fail('Matrix is singular or numerically ill-conditioned');
      return 0;
    }
    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      [identity[pivot], identity[col]] = [identity[col], identity[pivot]];
      determinant = -determinant;
    }
    const divisor = a[col][col];
    if (!invert) determinant = finite(determinant * divisor);
    if (invert) {
      for (let j = 0; j < n; j++) { ctx.spend(); a[col][j] = finite(a[col][j] / divisor); identity[col][j] = finite(identity[col][j] / divisor); }
    }
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
function factorial(value) {
  const n = integer(nonnegative(value));
  if (n > 170) fail('Factorial exceeds the finite number range');
  let result = 1;
  for (let i = 2; i <= n; i++) result = finite(result * i);
  return result;
}
function combinations(n, r, permute, ctx) {
  integer(nonnegative(n)); integer(nonnegative(r));
  if (r > n) fail('Require 0 <= r <= n');
  if (!permute) r = Math.min(r, n - r);
  if (r > 1000) fail('Combination/permutation work limit exceeded');
  let result = 1;
  for (let i = 1; i <= r; i++) { ctx.spend(); result = finite(result * (permute ? n - i + 1 : (n - r + i) / i)); }
  return Number.isSafeInteger(Math.round(result)) ? Math.round(result) : result;
}
const registry = Object.create(null);
function define(name, syntax, description, example, min, max, run) {
  registry[name] = { name, syntax, description, example, min, max, run };
}
const unary = (name, description, example, fn) => define(name, `${name}(x)`, description, example, 1, 1, ([x], ctx) => fn(scalar(x), ctx));
const trigNames = { sin: 'Sine', cos: 'Cosine', tan: 'Tangent' };
for (const name of ['sin', 'cos', 'tan']) unary(name, `${trigNames[name]} of an angle in the selected unit.`, `${name}(45)`, (x, ctx) => {
  const radians = finite(x * ctx.toRadians);
  if (name === 'tan' && Math.abs(Math.cos(radians)) < 1e-14) fail('Tangent is undefined at this angle');
  return Math[name](radians);
});
for (const name of ['asin', 'acos', 'atan']) unary(name, `Inverse ${trigNames[name.slice(1)].toLowerCase()}; returns the principal angle in the selected unit${name === 'atan' ? '.' : '; input from -1 to 1.'}`, `${name}(0.5)`, (x, ctx) => Math[name](x) / ctx.toRadians);
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
define('atan2', 'atan2(y, x)', 'Quadrant-aware inverse tangent in the selected angle unit; (0,0) is undefined.', 'atan2(1, -1)', 2, 2, ([y, x], ctx) => {
  scalar(y); scalar(x);
  if (x === 0 && y === 0) fail('atan2(0, 0) is undefined');
  return Math.atan2(y, x) / ctx.toRadians;
});
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
define('log', 'log(x, base=10)', 'Logarithm; x and base positive, base != 1.', 'log(8, 2)', 1, 2, ([x, base = 10]) => {
  positive(x); positive(base);
  if (base === 1) fail('Logarithm base must not equal 1');
  return Math.log(x) / Math.log(base);
});
unary('factorial', 'Factorial of an integer from 0 through 170; also x!.', 'factorial(5)', factorial);
for (const name of ['ncr', 'npr']) define(name, `${name}(n, r)`, `Number of ${name === 'ncr' ? 'combinations' : 'permutations'}; integers 0 <= r <= n.`, `${name}(5, 2)`, 2, 2, ([n, r], ctx) => combinations(n, r, name === 'npr', ctx));
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
function tokenize(expression) {
  if (typeof expression !== 'string' || !expression.trim()) fail('Expression must be a nonempty string');
  if (expression.length > LIMITS.length) fail('Expression length limit exceeded');
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
    const rest = expression.slice(i);
    let match;
    if (/^0[bBxX]/.test(rest)) {
      const hex = /^0[xX]/.test(rest);
      match = (hex ? /^0[xX][0-9a-fA-F]+/ : /^0[bB][01]+/).exec(rest);
      if (!match) fail(`Invalid ${hex ? 'hexadecimal' : 'binary'} literal at ${i}`);
      const end = i + match[0].length;
      if (/[\w.]/.test(expression[end] || '')) fail(`Invalid ${hex ? 'hexadecimal' : 'binary'} literal at ${i}`);
      tokens.push({ type: 'number', value: finite(Number(match[0])) }); i = end;
    } else if ((match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) {
      tokens.push({ type: 'number', value: finite(Number(match[0])) }); i += match[0].length;
      if (expression[i] === '.') fail(`Invalid number at ${i}`);
    } else if ((match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest))) {
      tokens.push({ type: 'identifier', value: match[0] }); i += match[0].length;
    } else if ('+-*/%^!(),[]'.includes(c)) { tokens.push({ type: c, value: c }); i++; }
    else fail(`Unexpected character '${c}' at ${i}`);
  }
  tokens.push({ type: 'end' });
  if (tokenCache.size >= 32) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(expression, tokens);
  return tokens;
}

/** Evaluate a real-valued expression. Default angle mode: radians. x is a finite scalar; ans may also be a vector or matrix. */
export function evaluate(expression, options = {}) {
  if (!options || typeof options !== 'object' || isArray(options)) fail('Options must be an object');
  const { angle = 'rad', variables = {} } = options;
  if (!['deg', 'rad', 'grad'].includes(angle)) fail('Angle mode must be deg, rad, or grad');
  if (!variables || typeof variables !== 'object' || isArray(variables)) fail('Variables must be an object');
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
  const tokens = tokenize(expression);
  let pos = 0, depth = 0, work = 0;
  const ctx = { toRadians: angle === 'deg' ? Math.PI / 180 : angle === 'grad' ? Math.PI / 200 : 1,
    spend() { if (++work > LIMITS.work) fail('Evaluation work limit exceeded'); } };
  const peek = () => tokens[pos].type;
  const take = type => { if (peek() === type) { pos++; return true; } return false; };
  const expect = type => { if (!take(type)) fail(`Expected '${type}' at token ${pos + 1}`); };
  function nested(fn) {
    if (++depth > LIMITS.depth) fail('Expression nesting limit exceeded');
    try { ctx.spend(); return fn(); } finally { depth--; }
  }
  function add() {
    let a = multiply();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++].type, b = multiply(); ctx.spend();
      a = zip(a, b, op === '+' ? (x, y) => x + y : (x, y) => x - y);
    }
    return a;
  }
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
  function unaryExpression() {
    return nested(() => {
      if (take('+')) return unaryExpression();
      if (take('-')) return map(unaryExpression(), x => -x);
      return power();
    });
  }
  function power() {
    let a = primary();
    while (take('!')) { ctx.spend(); a = factorial(a); }
    if (take('^')) a = finite(scalar(a) ** scalar(unaryExpression()));
    return a;
  }
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
  const result = add();
  expect('end'); shape(result);
  return result;
}

/** Format scalars, vectors, and matrices with 1–100 significant digits. */
export function formatValue(value, precision = 12) {
  if (!Number.isInteger(precision) || precision < 1 || precision > 100) fail('Precision must be an integer from 1 through 100');
  shape(value);
  const format = v => isArray(v) ? `[${v.map(format).join(', ')}]` : String(Number(finite(v).toPrecision(precision)));
  return format(value);
}
