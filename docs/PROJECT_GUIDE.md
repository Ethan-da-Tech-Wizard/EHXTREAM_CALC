# Extreme Calculator

An embeddable scientific and graphing calculator with matrix tools, custom-element UI, and standalone offline builds.

**Status:** Working calculator component  
**Built with:** JavaScript, Web Components, Node.js

## Reading order

1. Read the root README for project purpose and setup navigation.
2. Follow the entry points below to find the implementation.
3. Use the file guide to locate individual modules, tests, assets, and configuration.
4. Check component licenses before redistributing dependencies or assets.

## Important paths

- [engine.js](../engine.js) — Source module for engine; defines `shape`, `matrix`, `vector`, `map`, `zip`, `product`, `elimination` and 26 more symbols.
- [calculator.js](../calculator.js) — Source module for calculator; defines `ExtremeCalculator`, `using`, `field`, `icon`, `on`, `step`.
- [examples/embed.html](../examples/embed.html) — Browser document: Embed Extreme; provides page structure and may include inline styles or application logic.

## Structure

| Path | Role |
| --- | --- |
| [dist/](../dist/) | Generated distributable artifacts (4 tracked entries). |
| [docs/](../docs/) | Project documentation, decisions, and reference material (5 tracked entries). |
| [examples/](../examples/) | Usage examples and demonstration inputs (1 tracked entries). |
| [scripts/](../scripts/) | Build, launch, maintenance, and verification commands (2 tracked entries). |
| [verification/](../verification/) | Recorded verification evidence and supporting checks (1 tracked entries). |

## Useful commands

Run from the repository root after following the documented prerequisites.

```sh
npm start
# Run the engine checks separately:
npm test
# Produce the standalone build:
npm run build
```

## Scope

Node 20+ is used for development. The calculator has no runtime package dependencies.

## Maintaining the guide

The file catalog is a source-inspection snapshot, not proof that every runtime path works. Update it when moving files or changing module responsibilities. The 2026-10-12 documentation review did not run every application, deploy services, or validate all historical performance claims.
