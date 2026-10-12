# Independent browser verification

Validated 2026-10-02 with Playwright and system Chromium 153.0.8010.52.
Final run: **21/21 scenarios passed**, including source served over local HTTP
and the generated standalone HTML opened directly through `file://`.
No implementation files were changed by the verification agent.

## Reproduce

```sh
npm install --prefix /tmp/extreme-browser-verification playwright
npm run build
node browser.test.mjs
```

The browser harness starts and stops its own local server. It defaults to
`/usr/bin/chromium`; `CHROMIUM_PATH` and `PLAYWRIGHT_MODULE` override those paths.
Playwright is a development-only tool installed outside this repository.
Set `CAPTURE_SCREENSHOTS=1` to capture desktop and mobile images in `/tmp`.

## Coverage and evidence

- **All 47 registered function examples** ran successfully through the connected
  component's `calculate()` method. Every run produced a non-error display and
  exactly one successful log entry matching its expression, displayed result,
  angle unit and valid timestamp. The actual downloaded JSON export matched all
  47 entries byte-for-value after parsing; reload retained every entry unchanged.
  [Full exported function log and verification audit](verification/function-audit.json)
  contains the complete results and per-function checks. This verifies UI and
  logging integration; independent engine tests assess numerical correctness.
- Scientific arithmetic, answer reuse, errors and recovery, DEG/RAD/GRAD,
  keypad selection/insertion/backspace/clear, keyboard recall and tab navigation.
- Matrix and binary modes, examples, singular-matrix errors, decimal/binary
  output, settings precision and persistence.
- Help search and runnable examples; Help and Settings close icons, Escape,
  backdrop dismissal, keyboard focus trapping and focus restoration; clipboard.
- Graph drawing, three curves, invalid bounds and domains, success/error logs,
  history reuse, pointer dragging, keyboard panning, zoom, reset and trace.
  Recorded canvas paths verify that `1/(x-0.037)` does not bridge its asymptote.
- Three expensive `sum(inverse(14×14 matrix))+x` plots returned control to the
  event loop in **168.3 ms** in the final run; calculation and dialog interaction
  continued successfully afterward. Timing is machine-dependent.
- History preserves successes and errors, timestamps and angle metadata;
  reload, reuse, JSON download, confirmation and persistent clearing work.
  **525 submissions** survived paging, reload and export without truncation;
  the displayed history pages in groups of 50.
- HTML-like expressions and malicious saved history remain inert text.
  Oversized input returns an error and recovers. Corrupt saved JSON and simulated
  storage quota failure preserve session usability and export access.
- Multiple components keep independent state. Removing and reinserting both
  persistent and session-only components preserves expression, answer and history
  without duplicate event handling.
- All four modes fit at 360px without horizontal page overflow. Desktop and
  mobile screenshots were visually inspected; controls and graphs are intact.
- Offline standalone HTML calculates, graphs, closes Help, and downloads its
  history through `file://`. No HTTP requests were observed in that scenario.
- Every scenario checks for uncaught browser exceptions and console errors.

## Bugs found and resolved by the main agent

1. **Help Escape:** a populated search input consumed Escape, leaving the dialog
   open. Explicit dialog keyboard handling fixed this; regression test passes.
2. **Broken standalone build:** `String.replace` interpreted `$$` in the embedded
   JavaScript replacement as `$`, corrupting DOM helper methods. Using a callback
   replacement preserves the code. The rebuilt offline artifact passes.

No unresolved failures remained in the final suite. This is Chromium coverage,
not a cross-browser certification or proof of mathematical accuracy for every
expression. Numerical graph sampling can miss sufficiently narrow features;
the tested reciprocal discontinuity is one concrete regression case.

Inspected screenshots: `/tmp/extreme-verification-desktop.png` and
`/tmp/extreme-verification-mobile.png` (temporary, not required by the app).
