# EHXTREAM_CALC (Extreme Calculator)

A small scientific and graphing calculator you can embed in a web page: a dependency-free expression engine plus a `<extreme-calculator>` web component, with an optional single-file offline build.

## What it does and why

I wanted a calculator that could be dropped into another app without a framework, an account or network calls, and that evaluates typed expressions without `eval`. It has:

- an expression engine (`engine.js`): arithmetic with precedence, scientific functions, degree/radian/gradian angle modes, combinatorics, 32-bit bitwise operations, and matrices up to 16x16 (determinant, inverse, product);
- a web component (`calculator.js`): keypad, history, a function reference and graphing of up to three curves on a canvas;
- a build script that bundles both into `dist/` (an embeddable `.js`, a standalone `.html` that opens from disk, and gzip/Brotli copies).

## Status

Small personal project, tested only by my own tests. The engine has an automated suite that needs only Node. The UI has a separate browser suite that needs a browser and **was not run in CI**; I ran it by hand once (see Tests). The calculator has not been checked against other math software, and nobody else has reviewed the code. Much of the code and documentation was written with AI coding assistants under my direction.

## Quick start

Needs Node 20 or newer (developed on Node 24). No install step, no dependencies.

```sh
npm test            # engine tests, no browser needed
npm start           # demo at http://localhost:4173
npm run build       # writes dist/
```

Use the engine from Node (output observed on Node 24.22.1, 2026-11-21):

```js
import { evaluate, formatValue } from './engine.js';
evaluate('2+3*4');                           // 14
evaluate('sin(30)', { angle: 'deg' });       // 0.49999999999999994 (floating point; formatValue rounds for display)
evaluate('inverse([[1,2],[3,4]])');          // [[-1.9999999999999996,0.9999999999999998],[1.4999999999999998,-0.49999999999999994]]
formatValue(evaluate('10!'));                // '3628800'
evaluate('1/0');                             // throws Error('Division by zero')
evaluate('2+');                              // throws Error('Expected a number, function, or parenthesis at token 3')
```

Embed the UI (serve the files over HTTP; `dist/extreme-calculator.html` opens straight from disk):

```html
<script type="module" src="/calculator.js"></script>
<extreme-calculator storage-key="my-app-math"></extreme-calculator>
```

## Usage

- `evaluate(expression, { angle, variables })` returns a number, a vector or a matrix. `angle` is `deg`, `rad` or `grad`; `variables` may only use `x` and `ans`. Invalid input throws an `Error` with a readable message.
- `formatValue(value, precision = 12)` turns a result into display text. `FUNCTIONS` is the frozen list of supported functions with syntax and examples.
- The element has methods `calculate(expression?)`, `setAngle(unit)`, `setMode(mode)`, `exportHistory()` and fires bubbling `calculate` and `calculation-error` events. TypeScript declarations are in `index.d.ts` and `calculator.d.ts`.
- More: [PROJECT_NOTES.md](PROJECT_NOTES.md), [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md), [docs/FILE_GUIDE.md](docs/FILE_GUIDE.md).

## Configuration

| Setting | Where | Meaning |
|---|---|---|
| `storage-key` | element attribute | `localStorage` key for saved angle mode, precision and history. Omit it and nothing is saved. |
| `--calc-accent`, `--calc-bg`, `--calc-text`, `--calc-muted` | CSS variables on the element | Retheme the component. |
| `angle` | `evaluate` option | `deg`, `rad` or `grad`. |
| `LIMITS` | `engine.js` | Caps: 16384 characters, 2048 tokens, nesting depth 64, 16 entries per dimension, 100000 work units per call. |
| `PORT` | environment, `npm start` | Port of the demo server (default 4173, listens on 127.0.0.1 only). |
| `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` | environment, browser test only | Where to find Playwright and a Chromium-based browser. |

## How it works

`engine.js` tokenizes an expression (cached), then a recursive-descent parser computes values as it parses (there is no syntax tree), checks every number is finite, and validates the result shape. There is no `eval` or `new Function`; resource caps are enforced inline. `calculator.js` is a Shadow-DOM web component that does no math of its own: it calls `evaluate`/`formatValue`/`FUNCTIONS` for every keypress and graph sample. `scripts/build.mjs` concatenates `engine.js` and `calculator.js` into `dist/`; `dist/` is generated and never edited by hand.

## Security notes and limits

- Evaluation never executes expression text as code, and the caps bound the work of one call. A page that evaluates untrusted input in a loop still needs its own rate limiting.
- An embedded calculator stores history in `localStorage` only if you set `storage-key`; the demo page saves history on the device automatically. Do not use a calculator history for anything sensitive.
- Ordinary floating point: not for safety-critical or financial work. No complex numbers; matrices at most 16x16.
- Browser testing was done in Chrome only.

Report vulnerabilities privately through the Security tab (see [SECURITY.md](SECURITY.md)).

## Tests

- `npm test` runs `engine.test.js` with Node's built-in runner. Observed 2026-11-21 on macOS arm64, Node 24.22.1, scratch `HOME` and `TMPDIR`: `tests 64, pass 64, fail 0, skipped 0`.
- `npm run test:browser` runs `browser.test.mjs`, a 21-check UI suite. It **needs a real browser** (Playwright plus a Chromium-based browser, deliberately not declared in `package.json`) and is **not run in CI**. Install them yourself, build first, then point the test at them:

```sh
npm run build
npm install --prefix /tmp/extreme-browser-verification playwright
PLAYWRIGHT_MODULE=/tmp/extreme-browser-verification/node_modules/playwright/index.mjs \
CHROMIUM_PATH="/path/to/chromium-or-chrome" npm run test:browser
```

  I ran it by hand earlier on 2026-11-21 on macOS with Playwright 1.49.1 and Google Chrome: 21 of 21 checks passed after rebuilding `dist/` (a stale `dist/` made the standalone `file://` check fail, 20 of 21, before the build fix). I did not re-run it for this README change. The test rewrites `verification/function-audit.json` as a side effect.
- CI (`.github/workflows/ci.yml`) runs `npm test` on Ubuntu and macOS with Node 24 and checks that `npm run build` reproduces the committed `dist/` bundle and page. See the Actions tab for the current result.

## Repository layout

| Path | Role |
| --- | --- |
| `engine.js`, `engine.test.js` | Expression engine and its tests. |
| `calculator.js`, `index.html`, `demo.css` | Web component and demo page. |
| `index.d.ts`, `calculator.d.ts` | TypeScript declarations. |
| `scripts/` | `build.mjs` (bundler) and `serve.mjs` (demo server). |
| `dist/` | Generated bundles. |
| `browser.test.mjs`, `verification/` | Optional browser suite and its recorded output. |
| `docs/` | Project guide, per-file guide, license and dependency review. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Questions and bugs: GitHub Issues on this repository.

## License

MIT, see [LICENSE](LICENSE). Copyright holder: Ethan-da-Tech-Wizard. Third-party material keeps its own terms; see the [license review](docs/LICENSE_REVIEW.md) and [dependency inventory](docs/DEPENDENCIES.csv).
