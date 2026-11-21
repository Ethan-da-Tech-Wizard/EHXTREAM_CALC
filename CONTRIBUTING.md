# Contributing

Small, one-maintainer project; the process is light.

## Useful contributions

1. Wrong results or unhelpful errors, with the exact expression and expected value.
2. Bug reports for the UI with browser, OS and steps.
3. Corrections to a README or comment the code or tests do not support.
4. Small pull requests that change one thing and add a test to `engine.test.js`.

## Ground rules

- No runtime or dev dependencies. Plain JavaScript, Node 20 or newer (CI uses 24).
- Run `npm test` before opening a PR. If you change `engine.js` or `calculator.js`, run `npm run build` and commit the regenerated `dist/` files (CI checks they match).
- `dist/` is generated; never edit it by hand.
- The browser suite (`npm run test:browser`) is optional and needs Playwright and Chromium installed outside the repo; see the README. Mention in your PR whether you ran it. It rewrites `verification/function-audit.json` as a side effect.
- Numbers in docs must come from a real run. Say if an AI agent helped write your change.

By contributing you agree your contribution is licensed under the MIT license in [LICENSE](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
