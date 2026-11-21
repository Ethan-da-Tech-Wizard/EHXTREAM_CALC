// ==============================================================================
// Program: build.mjs
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Build and distribution bundler combining engine and UI into standalone
//          single-file distributions with gzip and Brotli precompression.
//
// How it fits: run via `npm run build`. Inputs: engine.js, calculator.js, index.html and
// demo.css. Outputs (in dist/): extreme-calculator.js (embeddable bundle),
// extreme-calculator.html (demo with everything inlined, works from file://),
// and .gz/.br copies of the bundle. browser.test.mjs's last check opens that HTML file, so
// run the build before `npm run test:browser`. Nothing here is executed by `npm test`.
// ==============================================================================
// Build script: concatenates engine.js and calculator.js into one distributable
// module, inlines it in the demo page and writes gzip/Brotli copies, all with
// Node built-ins only. Run with `npm run build`; it overwrites dist/.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,brotliCompressSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
// Read every source up front, in parallel.
const [engine,component,html,css]=await Promise.all(['engine.js','calculator.js','index.html','demo.css'].map(read));
// The component's `import ... from './engine.js'` line is stripped because the
// engine source is placed first in the same module; both then share one scope.
// Plain concatenation, not a real bundler: engine.js has no imports, and its exports
// (export function/const) remain valid inside the combined module, so calculator.js can use
// those names directly after the import line is removed.
const bundle=engine+'\n'+component.replace(/^import .*?from '\.\/engine\.js';\s*/m, '');
// Inline the stylesheet and bundled script into index.html. The replacement is
// a function so `$` sequences in the code are not treated as replacement
// patterns, and `</script` is escaped so the inline script cannot end early.
const standalone=html.replace('<link rel="stylesheet" href="demo.css"><script type="module" src="calculator.js"></script>',()=>`<style>${css}</style><script type="module">${bundle.replaceAll('</script','<\\/script')}</script>`);
// Write all four outputs in parallel. gzip/br copies exist so static hosts can serve
// precompressed files; dist/ is GENERATED (never edit it by hand) and is overwritten on
// each build.
await mkdir(new URL('dist/',root),{recursive:true});
await Promise.all([writeFile(new URL('dist/extreme-calculator.js',root),bundle),writeFile(new URL('dist/extreme-calculator.html',root),standalone),writeFile(new URL('dist/extreme-calculator.js.gz',root),gzipSync(bundle)),writeFile(new URL('dist/extreme-calculator.js.br',root),brotliCompressSync(bundle))]);
// Size report only; nothing is asserted about the numbers.
console.log(`Standalone HTML: ${Buffer.byteLength(standalone)} bytes\nEmbeddable JS: ${Buffer.byteLength(bundle)} bytes (${gzipSync(bundle).length} gzip; ${brotliCompressSync(bundle).length} Brotli)\nEngine: ${Buffer.byteLength(engine)} bytes (${gzipSync(engine).length} gzip)`);
