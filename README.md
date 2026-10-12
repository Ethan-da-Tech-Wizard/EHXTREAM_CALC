# Extreme Calculator

An embeddable scientific and graphing calculator with matrix tools, custom-element UI, and standalone offline builds.

**Status:** Working calculator component  
**Built with:** JavaScript, Web Components, Node.js

[Project guide](docs/PROJECT_GUIDE.md) · [Every file explained](docs/FILE_GUIDE.md) · [Licenses and dependencies](docs/LICENSE_REVIEW.md)

## Start here

- [engine.js](engine.js) — Source module for engine; defines `shape`, `matrix`, `vector`, `map`, `zip`, `product`, `elimination` and 26 more symbols.
- [calculator.js](calculator.js) — Source module for calculator; defines `ExtremeCalculator`, `using`, `field`, `icon`, `on`, `step`.
- [examples/embed.html](examples/embed.html) — Browser document: Embed Extreme; provides page structure and may include inline styles or application logic.

The following commands are taken from this project’s source/configuration. Install its prerequisites first.

```sh
npm start
# Run the engine checks separately:
npm test
# Produce the standalone build:
npm run build
```

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

Node 20+ is used for development. The calculator has no runtime package dependencies.

## License

Original project code retains **MIT** terms in [LICENSE](LICENSE). Third-party libraries, media, data, models, and tools retain their own terms. See the [license review](docs/LICENSE_REVIEW.md) and [dependency inventory](docs/DEPENDENCIES.csv).
