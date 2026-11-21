# Security policy

## What this project is

A small calculator: `engine.js` evaluates expressions (no `eval`, no `new Function`, with caps on expression length, nesting, matrix size and work per call), and `calculator.js` is a web component around it. No network calls, no accounts, no runtime dependencies.

## Limits

- Tested only by the author's own tests: the engine suite, and an optional browser suite that is not run in CI. No third party has reviewed the code.
- The caps in `engine.js` (`LIMITS`) bound the cost of one `evaluate()` call, but a page that evaluates untrusted input in a loop still needs its own rate limiting.
- The component writes user text with `textContent` and keeps optional history in `localStorage` under the `storage-key` you set. Do not store anything sensitive in a calculator history.
- Not for safety-critical or financial calculation; results use ordinary floating point (for example `sin(30)` in degrees gives `0.49999999999999994` before rounding for display).

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: open this repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a vulnerability. This is a one-person project with no service-level promise.

## Supported versions

Only the latest commit on the default branch. There are no releases.
