# Extreme Calculator

An embeddable scientific and graphing calculator with matrix tools, custom-element UI, and standalone offline builds.

**Status:** small personal project. The author's own tests pass (below); they are not an independent audit, and the calculator has not been checked against other math software.  
**Built with:** JavaScript, Web Components, Node.js

[Project guide](docs/PROJECT_GUIDE.md) · [Every file explained](docs/FILE_GUIDE.md) · [Licenses and dependencies](docs/LICENSE_REVIEW.md)

## Start here

- [engine.js](engine.js) — Source module for engine; defines `shape`, `matrix`, `vector`, `map`, `zip`, `product`, `elimination` and 26 more symbols.
- [calculator.js](calculator.js) — Source module for calculator; defines `ExtremeCalculator`, `using`, `field`, `icon`, `on`, `step`.
- [examples/embed.html](examples/embed.html) — Browser document: Embed Extreme; provides page structure and may include inline styles or application logic.

Requires Node (developed and tested here on Node 24; `package.json` declares 20 or newer). There are no runtime or dev dependencies to install.

```sh
npm start
# Engine tests (no browser needed)
npm test
# Produce the standalone build in dist/
npm run build
```

`npm start` serves the demo at http://localhost:4173. `dist/extreme-calculator.html` is a single file that opens straight from disk.

## Tests

- `npm test` runs `engine.test.js` with Node's built-in runner. Observed on a fresh clone, 2026-11-21: 64 tests, 64 pass, 0 fail.
- `npm run test:browser` runs `browser.test.mjs`, a 21-check UI suite. It is **optional and not part of `npm test`** because it needs Playwright and a Chromium-based browser, which are deliberately not declared in `package.json` (to keep the project dependency-free). Install them yourself, then point the test at them:

```sh
npm install --prefix /tmp/extreme-browser-verification playwright
PLAYWRIGHT_MODULE=/tmp/extreme-browser-verification/node_modules/playwright/index.mjs \
CHROMIUM_PATH="/path/to/chromium-or-chrome" npm run test:browser
```

  Observed 2026-11-21 on macOS with Playwright 1.49.1 and Google Chrome: 21 of 21 checks pass after rebuilding `dist/` with `npm run build`. Before the build-script fix in this commit, the standalone `file://` check failed (20 of 21) because the committed `dist/` bundle was stale and declared `evaluate` twice. The test also rewrites `verification/function-audit.json` as a side effect.

[Detailed setup, usage, and development notes](PROJECT_NOTES.md) preserve the previous project documentation.

## Repository layout

| Path | Role |
| --- | --- |
| [dist/](dist/) | Generated distributable artifacts (4 tracked entries). |
| [docs/](docs/) | Project documentation, decisions, and reference material (5 tracked entries). |
| [examples/](examples/) | Usage examples and demonstration inputs (1 tracked entries). |
| [scripts/](scripts/) | Build, launch, maintenance, and verification commands (2 tracked entries). |
| [verification/](verification/) | Recorded verification evidence and supporting checks (1 tracked entries). |

## Scope and current limits

The calculator has no runtime package dependencies. Browser testing was done in Chromium-based Chrome only. The scientific and matrix functions are tested by the author's own suite; do not rely on them for safety-critical or financial work. Much of the code and documentation was written with AI coding assistants under the author's direction.

## License

Original project code retains **MIT** terms in [LICENSE](LICENSE). Third-party libraries, media, data, models, and tools retain their own terms. See the [license review](docs/LICENSE_REVIEW.md) and [dependency inventory](docs/DEPENDENCIES.csv).
