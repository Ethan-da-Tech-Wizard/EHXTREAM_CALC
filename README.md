# Extreme Calculator

A compact scientific and graphing calculator you can put inside another app. Plain JavaScript, no runtime dependencies, no accounts, no network calls. MIT licensed.

## Run it

```sh
npm start
```

Open **http://localhost:4173**. Requires Node 20+ for the development server and tests. No install step is needed for the app.

For an entirely standalone copy:

```sh
npm run build
```

Open `dist/extreme-calculator.html` directly in a modern browser, even offline. The file includes everything. Copy it into a WebView or serve it as an iframe to embed an isolated complete app.

## Embed the UI

Copy `calculator.js` and `engine.js` together into your app:

```html
<script type="module" src="/calculator.js"></script>
<extreme-calculator storage-key="my-app-math"></extreme-calculator>
```

Or use the one-file bundle, `dist/extreme-calculator.js`, instead of `/calculator.js`. Serve module files over HTTP(S); for opening from a file manager, use the standalone HTML.

The custom element uses Shadow DOM to isolate its styles and works in plain HTML, React, Vue, Svelte, or other browser apps. Give independent calculators distinct storage keys. Without `storage-key`, history stays in memory for that component's lifetime. No external fonts or assets are required. Browser globals are only used by the UI module, so import it client-side in server-rendered apps.

```js
const calc = document.querySelector('extreme-calculator');
await customElements.whenDefined('extreme-calculator');
calc.setAngle('deg'); // deg, rad, grad
calc.calculate('atan2(3,4)');
calc.setMode('graph'); // calculate, graph, matrix, logic
calc.addEventListener('calculate', event => {
  // {expression, result: number | number[] | number[][], angle}
  console.log(event.detail);
});
calc.addEventListener('calculation-error', event => {
  console.log(event.detail); // {expression, error}
});
```

Call UI methods after the element is connected. Successful calculations emit bubbling, composed `calculate` events; failed calculations emit `calculation-error`. `calculate` returns the raw value, or `null` on error. `exportHistory()` downloads the complete JSON log and returns its payload. TypeScript declarations are included.

Customize the host's width and CSS variables:

```css
extreme-calculator {
  max-width: 1000px;
  --calc-accent: #285743;
  --calc-bg: #fffefb;
  --calc-text: #283f38;
}
```

See `examples/embed.html` for a minimal integration. To distribute through an internal package registry, `npm pack` prepares the package; nothing is automatically published.

## Use only the engine

`engine.js` is a standalone ES module for browsers, Node, or other JavaScript runtimes. It does not depend on the DOM or the UI.

```js
import {evaluate, formatValue, FUNCTIONS} from './engine.js';

evaluate('sin(30)', {angle: 'deg'});             // 0.5 (floating-point approximation)
evaluate('sin(pi/2)');                          // 1; engine default is radians
evaluate('det([[1,2],[3,4]])');                 // -2
evaluate('[[1,2],[3,4]] * [[2,0],[0,2]]');      // [[2,4],[6,8]]
evaluate('xor(0b1100,0b1010)');                 // 6
evaluate('x^2 + ans', {variables:{x:3, ans:2}}); // 11
formatValue(evaluate('1/3'), 6);                 // '0.333333'
```

The UI starts in degrees; the engine defaults to radians. Specify an angle explicitly in integrations. `FUNCTIONS` provides name, syntax, description, and a runnable example for every callable function. Errors throw an `Error` with a readable message. `ans` can be a scalar, vector or matrix; `x` is scalar. Expression text cannot define variables, access objects or execute JavaScript.

## What it does

- Arithmetic with conventional precedence, right-associative powers, factorial, remainder, scientific notation, parentheses and implicit multiplication. Use `pi`, `tau`, `e` and `ans`. `%` means remainder; calculate 15% of 50 with `50*15/100`.
- Degrees, radians, gradians, direct/inverse/reciprocal trig, quadrant-aware `atan2`, hyperbolic functions, angle conversion and degrees/minutes/seconds conversion.
- Roots, logarithms, exponentials, rounding, combinations/permutations, min/max, sum/mean and hypotenuse.
- Vectors and matrices: addition/subtraction, scalar multiplication/division, matrix multiplication, determinant, inverse, transpose, dot product and norm.
- Binary and hexadecimal literals, AND, OR, XOR, NOT, signed shifts, and decimal/binary/hex result views.
- Three Cartesian curves, editable viewport, pointer pan, keyboard pan, zoom, reset, coordinate inspection, and discontinuity handling.
- Searchable function guide with runnable examples, short walkthroughs, adjustable display precision and menus that close with Escape, the close icon, or an outside click.
- Persistent, exportable run history. Successes, errors, graph submissions, timestamps and angle units are recorded. Click an entry to reuse it. The display pages through older entries without dropping them. Clearing history requires two clicks.

All functions and workflows have in-app guidance. There is no need to memorize function names.

## Log and privacy

The demo's log is saved under `extreme-demo` in the browser's local storage. Data never leaves your browser unless you export it. There is no artificial history cap; storage still has the browser's quota. If saving fails, a visible notice tells you that new entries are session-only and should be exported before closing. Private browsing, cleared site data, or a different browser/profile can remove or isolate local storage. The JSON export is the portable archive; importing archives is not implemented.

Saved results capture their display precision at submission time. Changing precision affects the current result; it does not rewrite historical results. Changing angle unit affects future calculations and graphs, and does not silently recompute the displayed answer. `ans` retains the last successful raw result for the component's current lifetime. Graph sampling and panning are not individually added to the log; explicitly submitted graph expressions are.

## Validation

```sh
npm test          # every function, parser, domains, matrix math, input limits
npm run build     # regenerate standalone HTML and embeddable bundle
```

Independent browser regression tests use Playwright as a **test-only** dependency. It is not shipped to app users. To run them, use the setup documented at the top of `browser.test.mjs` and then `npm run test:browser`. Chromium/Chrome must be available; the test script reports its required executable or environment overrides. See `REVIEW.md` for the completed browser assessment.

## Numerical and platform limits

This is a real-valued numerical calculator, not a symbolic algebra system: no symbolic solving, complex arithmetic, arbitrary-precision decimals, 3D or parametric plots. IEEE 754 doubles have about 15–16 significant digits. Display settings change formatting, not arithmetic. Extremely large angles lose precision. Singular/ill-conditioned matrix inverses are rejected.

The engine bounds input to 16,384 characters, 2,048 tokens, nesting depth 64, 16 entries per array dimension, and an evaluation work limit. UI expressions are limited to 4,096 characters and graph expressions to 512. Bitwise inputs fit 32 bits and results are signed; negative results show two's-complement binary/hex. Shift counts are 0–31.

Graphs use at most 700 samples per curve and a per-curve work budget. Very narrow features or steep/discontinuous functions can require zooming; the plot is not a proof of continuity or a symbolic root finder. Graph bounds are within ±1e12 with a minimum span of 1e−9. A budget error means to simplify the expression. Dense calculations are bounded, but this in-process engine is not a general-purpose sandbox for executing third-party JavaScript.

The UI targets modern browsers with ES modules, custom elements, Shadow DOM, Canvas, dialog, ResizeObserver and Pointer Events. Clipboard copying needs browser permission/secure context; manual text selection remains available. Browser testing was performed in Chromium; native frameworks without a WebView need a JavaScript bridge or an engine port. Accessibility includes named controls, keyboard navigation and textual graph descriptions; the graph itself remains visual.
