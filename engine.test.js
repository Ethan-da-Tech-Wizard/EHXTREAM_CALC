import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatValue, FUNCTIONS } from './engine.js';

function close(actual, expected, tolerance = 1e-12) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual));
    assert.equal(actual.length, expected.length);
    expected.forEach((v, i) => close(actual[i], v, tolerance));
  } else {
    assert.equal(typeof actual, 'number');
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  }
}
const cases = {
  sin: ['sin(30)', 0.5], cos: ['cos(60)', 0.5], tan: ['tan(45)', 1],
  sec: ['sec(60)', 2], csc: ['csc(30)', 2], cot: ['cot(45)', 1],
  todeg: ['todeg(pi/2)', 90], torad: ['torad(90)', Math.PI/2], dms: ['dms(-12,30,36)', -12.51],
  asin: ['asin(0.5)', 30], acos: ['acos(0.5)', 60], atan: ['atan(1)', 45], atan2: ['atan2(1,-1)', 135],
  sinh: ['sinh(1)', 1.1752011936438014], cosh: ['cosh(1)', 1.5430806348152437], tanh: ['tanh(1)', 0.7615941559557649],
  asinh: ['asinh(1)', 0.881373587019543], acosh: ['acosh(2)', 1.3169578969248166], atanh: ['atanh(0.5)', 0.5493061443340548],
  sqrt: ['sqrt(9)', 3], cbrt: ['cbrt(-8)', -2], abs: ['abs(-5)', 5], exp: ['exp(1)', Math.E],
  floor: ['floor(-1.2)', -2], ceil: ['ceil(-1.2)', -1], round: ['round(1.5)', 2],
  ln: ['ln(e^2)', 2], log: ['log(1000)', 3], factorial: ['factorial(6)', 720],
  ncr: ['ncr(10,3)', 120], npr: ['npr(10,3)', 720],
  min: ['min(8,-2,4)', -2], max: ['max(8,-2,4)', 8], sum: ['sum(8,-2,4)', 10], mean: ['mean(8,-2,3)', 3], hypot: ['hypot(3,4)', 5],
  det: ['det([[1,2],[3,4]])', -2], inverse: ['inverse([[1,2],[3,4]])', [[-2,1],[1.5,-0.5]]],
  transpose: ['transpose([[1,2,3],[4,5,6]])', [[1,4],[2,5],[3,6]]],
  dot: ['dot([1,2,3],[4,5,6])', 32], norm: ['norm([3,4])', 5],
  and: ['and(0b1010,0b1100)', 8], or: ['or(0b1010,0b1100)', 14], xor: ['xor(0b1010,0b1100)', 6],
  not: ['not(0)', -1], shl: ['shl(3,2)', 12], shr: ['shr(-8,2)', -2],
};
test('documentation and numerical coverage include every function exactly once', () => {
  assert.deepEqual(FUNCTIONS.map(f => f.name).sort(), Object.keys(cases).sort());
  assert.equal(new Set(FUNCTIONS.map(f => f.name)).size, FUNCTIONS.length);
  assert.ok(Object.isFrozen(FUNCTIONS));
});
for (const fn of FUNCTIONS) {
  test(`${fn.name}: numerical result, documented example, wrong arity`, () => {
    for (const key of ['name', 'syntax', 'description', 'example']) assert.equal(typeof fn[key], 'string');
    const [expression, expected] = cases[fn.name];
    close(evaluate(expression, { angle: 'deg' }), expected);
    assert.doesNotThrow(() => formatValue(evaluate(fn.example)));
    assert.throws(() => evaluate(`${fn.name}()`));
    assert.throws(() => evaluate(`${fn.name}(${Array(257).fill('1').join(',')})`));
  });
}

test('arithmetic precedence, associativity, postfix factorial and implicit multiplication', () => {
  for (const [expression, expected] of [
    ['2+3*4',14], ['(2+3)*4',20], ['2^3^2',512], ['-2^2',-4], ['(-2)^2',4], ['2^-2',0.25],
    ['2^-2^2',1/16], ['10-3-2',5], ['12/3/2',2], ['-5%3',-2], ['3!^2',36], ['2^3!',64],
    ['-3!',-6], ['3!!',720], ['0!',1], ['2(3+4)',14], ['(1+2)(3+4)',21], ['2pi',2*Math.PI],
    ['2sin(pi/2)',2], ['3e',3*Math.E], ['1.25e-3+2E2',200.00125], ['.5 + 2.',2.5], ['tau/pi',2],
    ['0b101+0B11',8], ['+--2',2], ['0^0',1],
  ]) close(evaluate(expression), expected);
});

test('angle modes, inverse trig and quadrants', () => {
  for (const [angle, quarter, half] of [['rad',Math.PI/2,Math.PI], ['deg',90,180], ['grad',100,200]]) {
    const options = { angle, variables: { x: quarter } };
    close(evaluate('sin(x)', options), 1);
    close(evaluate('cos(x)', options), 0);
    close(evaluate('asin(1)', options), quarter);
    close(evaluate('acos(-1)', options), half);
    close(evaluate('atan2(-1,-1)', options), -half*0.75);
    close(evaluate('atan(tan(x/2))', options), quarter/2);
    assert.throws(() => evaluate('tan(x)', options), /undefined/);
    close(evaluate('sinh(1)', options), cases.sinh[1]);
  }
  close(evaluate('log(8,2)'), 3);
  close(evaluate('atan2(0,-1)', {angle:'deg'}), 180);
});

test('reciprocal trig honors all angle modes, quadrants and singularities', () => {
  for (const [angle, quarter] of [['rad', Math.PI/2], ['deg', 90], ['grad', 100]]) {
    const options = { angle, variables: { x: quarter } };
    close(evaluate('sec(x/2)', options), Math.SQRT2);
    close(evaluate('sec(2x)', options), -1);
    close(evaluate('csc(-x)', options), -1);
    close(evaluate('cot(x/2)', options), 1);
    close(evaluate('cot(-x/2)', options), -1);
    close(evaluate('cot(x)', options), 0);
    close(evaluate('sec(x/2)*cos(x/2)', options), 1);
    close(evaluate('csc(x/2)*sin(x/2)', options), 1);
    for (const expr of ['sec(x)', 'sec(-x)', 'sec(3x)', 'csc(0)', 'csc(2x)', 'cot(0)', 'cot(-2x)']) {
      assert.throws(() => evaluate(expr, options), /undefined/);
    }
  }
  for (const expr of ['sec(pi/2+1e-15)', 'csc(1e-15)', 'cot(1e-15)']) assert.throws(() => evaluate(expr), /undefined/);
  close(evaluate('csc(1e-8)'), 1e8);
  for (const name of ['sec','csc','cot']) assert.throws(() => evaluate(`${name}([1])`), /scalar/);
});

test('angle conversions and signed DMS are independent of angle mode', () => {
  for (const angle of ['rad', 'deg', 'grad']) {
    const options = { angle };
    close(evaluate('todeg(-pi)', options), -180);
    close(evaluate('torad(-360)', options), -2*Math.PI);
    close(evaluate('todeg(torad(123.45))', options), 123.45);
    close(evaluate('dms(12,30,36)', options), 12.51);
    close(evaluate('dms(-12,30,36)', options), -12.51);
    close(evaluate('dms(0,30,0)', options), 0.5);
    close(evaluate('dms(-0,30,0)', options), -0.5);
    close(evaluate('dms(0,0,30)', options), 1/120);
    close(evaluate('dms(1,0.5,30.5)', options), 1+0.5/60+30.5/3600);
    close(evaluate('dms(1.5,0,0)', options), 1.5);
    close(evaluate('dms(0,59.999,59.999)', options), 59.999/60+59.999/3600);
  }
  close(evaluate('dms(x,30,0)', {variables:{x:-0}}), -0.5);
  close(evaluate('sin(torad(dms(30,0,0)))'), 0.5);
  for (const expr of ['dms(1,-1,0)','dms(1,60,0)','dms(1,0,-1)','dms(1,0,60)',
    'dms(1,2)','dms(1,2,3,4)','dms([1],0,0)','dms(1,[0],0)','dms(1,0,[0])',
    'torad([1])','todeg([1])','todeg(1e308)']) assert.throws(() => evaluate(expr), expr);
});

test('hexadecimal literals support arithmetic, matrices, bitwise operations and reject malformed values', () => {
  for (const [expr, expected] of [['0xFF',255],['0Xff',255],['0xAbCd',43981],['0x0',0],
    ['-0x10',-16],['0x10^2',256],['0xF+0b1',16],['0x1e2',482],['0x10(2+1)',48],
    ['and(0xFF,0x0F)',15],['xor(0xFF,0xF0)',15],['or(0xFFFFFFFF,0)',-1],['shr(0x80,4)',8]]) {
    close(evaluate(expr),expected);
  }
  close(evaluate('[[0xA,0xB]]*0x2'), [[20,22]]);
  for (const expr of ['0x','0X','0xG','0x12G','0x1.2','0x_FF','0xFF_00','0x10x','0x10n','0x'+'F'.repeat(300)]) {
    assert.throws(() => evaluate(expr), expr);
  }
});

test('matrices, vectors, pivoting, scalar operations and immutable inputs', () => {
  const a = '[[1,2,3],[4,5,6]]', b = '[[7,8],[9,10],[11,12]]';
  close(evaluate(`${a}*${b}`), [[58,64],[139,154]]);
  close(evaluate('[[1,2],[3,4]]+[[4,3],[2,1]]'), [[5,5],[5,5]]);
  close(evaluate('[[1,2]]-[[3,4]]'), [[-2,-2]]);
  close(evaluate('2[[1,2]]/4'), [[0.5,1]]);
  close(evaluate('-[1,2]*3'), [-3,-6]);
  close(evaluate('det([[0,1],[2,3]])'), -2);
  close(evaluate('inverse([[0,1],[2,3]])'), [[-1.5,0.5],[1,0]]);
  close(evaluate('det([[1,2],[2,4]])'), 0);
  close(evaluate('det([[5]])'), 5);
  close(evaluate('inverse([[5]])'), [[0.2]]);
  close(evaluate('[[2,1,0],[1,3,1],[0,1,2]]*inverse([[2,1,0],[1,3,1],[0,1,2]])'), [[1,0,0],[0,1,0],[0,0,1]]);
  close(evaluate('norm([[1,2],[2,4]])'), 5);
  for (const [name, expected] of [['min',1],['max',4],['sum',10],['mean',2.5],['hypot',Math.sqrt(30)]]) close(evaluate(`${name}([[1,2],[3,4]])`), expected);
  const ans = [[1,2],[3,4]], snapshot = structuredClone(ans);
  close(evaluate('inverse(ans)', {variables:{ans}}), [[-2,1],[1.5,-0.5]]);
  assert.deepEqual(ans, snapshot);
});

test('variables and repeated cached graph samples are independent', () => {
  for (let x = -300; x < 300; x++) close(evaluate('x^2+ans', {variables:{x,ans:2}}), x*x+2);
  assert.throws(() => evaluate('x^2+ans', {variables:{x:1}}), /Unknown/);
  close(evaluate('sin(x)', {angle:'deg',variables:{x:90}}), 1);
  close(evaluate('sin(x)', {angle:'rad',variables:{x:90}}), Math.sin(90));
  assert.throws(() => evaluate('x', {variables:{x:Infinity}}));
  assert.throws(() => evaluate('x', {variables:{x:'2'}}));
  assert.throws(() => evaluate('ans', {variables:{ans:Array(2)}}));
  assert.throws(() => evaluate('x', {variables:Object.create({x:1})}));
  assert.throws(() => evaluate('x', {variables:{get x(){ throw new Error('getter ran'); }}}), /getters/);
  for (const options of [null, [], {angle:'turn'}, {variables:null}, {variables:[]}]) assert.throws(() => evaluate('1',options));
});

test('binary operations validate ranges and preserve signed 32-bit behavior', () => {
  close(evaluate('and(4294967295,255)'), 255);
  close(evaluate('or(4294967295,0)'), -1);
  close(evaluate('shl(1,31)'), -2147483648);
  close(evaluate('shr(4294967295,31)'), -1);
  for (const expr of ['and(1.5,2)','not(4294967296)','not(-2147483649)','shl(1,-1)','shr(1,32)','shl(1,1.5)','0b102','0b','0b101.1']) assert.throws(() => evaluate(expr), expr);
});

test('strict domains, finite intermediate values and matrix shape errors', () => {
  for (const expr of [
    '1/0','0/0','2%0','sqrt(-1)','ln(0)','ln(-1)','log(0)','log(2,1)','log(2,-1)',
    'asin(2)','acos(-2)','acosh(0)','atanh(1)','atanh(-2)','atan2(0,0)',
    'exp(1000)','cosh(1000)','1e309','1e308*2','1e308+1e308','(-1)^0.5','0^-1',
    '(-1)!','2.5!','171!','factorial(-2)','ncr(2,3)','npr(-1,0)','ncr(2.5,1)','ncr(4000,2000)','npr(1000,500)',
    '[]','[[1],[2,3]]','[1,[2]]','[[[1]]]','[1]+[1,2]','[1]+2','[1]*[2]',
    '[[1,2]]*[[1,2]]','det([1,2])','det([[1,2]])','inverse([[1,2],[2,4]])','inverse([[0]])',
    'transpose([1,2])','dot([1],[1,2])','dot([[1]],[[1]])','norm(2)','sin([1])','sum(1,[2])',
    '[[1e308]]*[[2]]','inverse([[1e-320]])','[1]/0',
  ]) assert.throws(() => evaluate(expr), expr);
});

test('malformed and malicious strings never execute code', () => {
  for (const expr of [
    '', ' ', '1+', '()', '2**3','2//3','sin 1','sin(1,2)','(1','1)','[1,]','1,2', '1.2.3',
    'process.exit()', 'globalThis', 'constructor(1)', '__proto__', 'Math.sin(1)',
    '(()=>1)()', 'eval(1)', 'Function(1)', 'x=1', '1;2', '"1"', '`1`', '1/*x*/+2',
    'fetch(1)', 'ans[0]', '{a:1}',
  ]) assert.throws(() => evaluate(expr), expr);
  for (const value of [null, undefined, 1, {}, []]) assert.throws(() => evaluate(value));
});

test('length, token, recursion, argument, matrix and evaluation-work limits', () => {
  for (const expr of [
    '1'.repeat(16385), Array(1100).fill('1').join('+'), '('.repeat(1000)+'1'+')'.repeat(1000),
    '-'.repeat(1000)+'1', Array(100).fill('2').join('^'),
    'sin('.repeat(100)+'1'+')'.repeat(100), '['.repeat(100)+'1'+']'.repeat(100),
    `[${Array(17).fill('1').join(',')}]`, `sum(${Array(257).fill('1').join(',')})`,
  ]) assert.throws(() => evaluate(expr), /limit|16|nesting/i);
  const m = Array.from({length:16},(_,i)=>Array.from({length:16},(_,j)=>+(i===j)));
  close(evaluate('inverse(ans)',{variables:{ans:m}}),m);
  assert.throws(() => evaluate(Array(30).fill('ans').join('*'), {variables:{ans:m}}), /work limit/);
});

test('formatting uses significant precision and rejects nonfinite/invalid data', () => {
  assert.equal(formatValue(Math.PI), '3.14159265359');
  assert.equal(formatValue(1.234567,4), '1.235');
  assert.equal(formatValue(-0), '0');
  assert.equal(formatValue([[1,2.5],[-0,1/3]],4), '[[1, 2.5], [0, 0.3333]]');
  assert.equal(formatValue([1e30,1e-20]), '[1e+30, 1e-20]');
  for (const value of [Infinity,NaN,'2',[],[[1],[2,3]]]) assert.throws(()=>formatValue(value));
  for (const precision of [0,101,1.5,NaN,'12']) assert.throws(()=>formatValue(1,precision));
});

// Reproducible 32-bit LCG; each property owns its seed and fixed sample budget.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const angleScales = [['rad', 1], ['deg', 180 / Math.PI], ['grad', 200 / Math.PI]];

test('seeded property: 600 bounded angles agree across units and reciprocal identities', () => {
  const random = seededRandom(0xA961E);
  const reciprocalCounts = { tan: 0, sec: 0, csc: 0, cot: 0 };
  for (let sample = 0; sample < 600; sample++) {
    const radians = (random() * 16 - 8) * Math.PI;
    const sine = Math.sin(radians), cosine = Math.cos(radians);
    const expected = { sin: sine, cos: cosine };
    // Keep away from poles so comparisons measure unit conversion rather than conditioning.
    if (Math.abs(cosine) > 0.05) { expected.tan = sine / cosine; expected.sec = 1 / cosine; }
    if (Math.abs(sine) > 0.05) { expected.csc = 1 / sine; expected.cot = cosine / sine; }
    for (const name of Object.keys(reciprocalCounts)) if (name in expected) reciprocalCounts[name]++;
    for (const [angle, scale] of angleScales) {
      const options = { angle, variables: { x: radians * scale } };
      for (const [name, value] of Object.entries(expected)) close(evaluate(`${name}(x)`, options), value, 2e-11);
      close(evaluate('sin(x)^2+cos(x)^2', options), 1);
      if ('sec' in expected) close(evaluate('sec(x)^2-tan(x)^2', options), 1, 2e-11);
      if ('csc' in expected) close(evaluate('csc(x)^2-cot(x)^2', options), 1, 2e-11);
    }
  }
  for (const count of Object.values(reciprocalCounts)) assert.ok(count > 500, 'Each reciprocal needs substantial nonsingular coverage');
});

test('seeded property: 600 principal-angle and inverse-value roundtrips in every angle mode', () => {
  const random = seededRandom(0x1A2B3C);
  for (let sample = 0; sample < 600; sample++) {
    // Margins around branch endpoints prevent tiny input errors from being amplified.
    const principal = (random() * 2 - 1) * (Math.PI / 2 - 0.01);
    const acosAngle = 0.01 + random() * (Math.PI - 0.02);
    const fullAngle = (random() * 2 - 1) * (Math.PI - 0.01);
    const unitValue = random() * 1.98 - 0.99;
    const tangentValue = random() * 200 - 100;
    for (const [angle, scale] of angleScales) {
      const options = x => ({ angle, variables: { x } });
      close(evaluate('asin(sin(x))', options(principal * scale)), principal * scale, 2e-11);
      close(evaluate('atan(tan(x))', options(principal * scale)), principal * scale, 2e-11);
      close(evaluate('acos(cos(x))', options(acosAngle * scale)), acosAngle * scale, 2e-11);
      close(evaluate('atan2(sin(x),cos(x))', options(fullAngle * scale)), fullAngle * scale, 2e-11);
      close(evaluate('sin(asin(x))', options(unitValue)), unitValue);
      close(evaluate('cos(acos(x))', options(unitValue)), unitValue);
      close(evaluate('tan(atan(x))', options(tangentValue)), tangentValue, 2e-11);
      // Independent numerical oracles also prevent mutually compensating inverse errors.
      close(evaluate('asin(x)', options(unitValue)), Math.asin(unitValue) * scale);
      close(evaluate('acos(x)', options(unitValue)), Math.acos(unitValue) * scale);
      close(evaluate('atan(x)', options(tangentValue)), Math.atan(tangentValue) * scale);
    }
  }
});

test('seeded property: 400 invertible 2x2 matrices satisfy both inverse products and closed forms', () => {
  const random = seededRandom(0x2A2B);
  const identity = [[1,0],[0,1]];
  let accepted = 0, positive = 0, negative = 0, pivotSwaps = 0;
  for (let attempt = 0; attempt < 2000 && accepted < 400; attempt++) {
    const [a,b,c,d] = Array.from({length:4}, () => Math.floor(random()*41)-20);
    const determinant = a*d-b*c;
    if (Math.abs(determinant) < 20) continue;
    accepted++;
    if (determinant > 0) positive++; else negative++;
    if (Math.abs(c) > Math.abs(a)) pivotSwaps++;
    const input = [[a,b],[c,d]], snapshot = structuredClone(input);
    const options = { variables: { ans: input } };
    const inverse = evaluate('inverse(ans)', options);
    close(inverse, [[d/determinant,-b/determinant],[-c/determinant,a/determinant]], 2e-11);
    close(evaluate('det(ans)', options), determinant);
    close(evaluate('ans*inverse(ans)', options), identity, 2e-11);
    close(evaluate('inverse(ans)*ans', options), identity, 2e-11);
    close(evaluate('inverse(inverse(ans))', options), input, 2e-11);
    close(evaluate('det(inverse(ans))', options), 1/determinant, 2e-11);
    assert.deepEqual(input, snapshot);
  }
  assert.equal(accepted, 400);
  assert.ok(positive > 100 && negative > 100 && pivotSwaps > 100);
});

test('seeded property: 1200 malformed mutations reject and 1000 bounded random strings remain safe', () => {
  const random = seededRandom(0xF022);
  const pick = values => values[Math.floor(random()*values.length)];
  function validExpression(depth) {
    if (depth === 0) return String(1 + Math.floor(random()*9));
    switch (Math.floor(random()*4)) {
      case 0: return `(${validExpression(depth-1)}+${validExpression(depth-1)})`;
      case 1: return `(${validExpression(depth-1)}*${validExpression(depth-1)})`;
      case 2: return `sin(${validExpression(depth-1)})`;
      default: return `abs(-${validExpression(depth-1)})`;
    }
  }
  const mutations = [
    s => `(${s}`, s => `${s})`, s => `${s}+`, s => `${s}**2`,
    s => `sin(${s},1)`, s => `[${s},]`, s => `[[${s}],[1,2]]`,
    s => `${s};1`, s => `0xG+${s}`, s => `0b102+${s}`,
    s => `${s}${pick(['@',':','"','`','{','\\'])}1`, s => `__proto__(${s})`,
  ];
  const rejected = expression => assert.throws(() => evaluate(expression), error => {
    assert.equal(error.constructor, Error, `Unexpected internal exception for ${JSON.stringify(expression)}`);
    assert.ok(error.message.length > 0);
    return true;
  });
  for (let sample = 0; sample < 1200; sample++) {
    const base = validExpression(3);
    assert.ok(Number.isFinite(evaluate(base)));
    const malformed = mutations[sample % mutations.length](base);
    assert.ok(malformed.length < 256);
    rejected(malformed);
    // Rejection must not poison cached tokens or subsequent evaluation state.
    assert.ok(Number.isFinite(evaluate(base)));
  }
  const alphabet = '0123456789abcdefxsin()+-*/%^![],. _@;';
  let errors = 0;
  for (let sample = 0; sample < 1000; sample++) {
    const length = 1 + Math.floor(random()*96);
    const expression = Array.from({length}, () => pick(alphabet)).join('');
    let result;
    try { result = evaluate(expression); }
    catch (error) {
      errors++;
      assert.equal(error.constructor, Error, `Unexpected internal exception for ${JSON.stringify(expression)}`);
      continue;
    }
    // Arbitrary strings occasionally form valid expressions: only finite bounded results are allowed.
    const check = (value, depth = 0) => {
      if (Array.isArray(value)) {
        assert.ok(depth < 2 && value.length > 0 && value.length <= 16);
        for (const entry of value) check(entry, depth+1);
      } else assert.ok(typeof value === 'number' && Number.isFinite(value));
    };
    check(result);
  }
  assert.ok(errors > 900);
  close(evaluate('sin(pi/2)+det([[1,2],[3,4]])'), -1);
});
