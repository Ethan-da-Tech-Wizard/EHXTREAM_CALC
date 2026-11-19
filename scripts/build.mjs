// ==============================================================================
// Program: build.mjs
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Build and distribution bundler combining engine and UI into standalone
//          single-file distributions with gzip and Brotli precompression.
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
// Step 1: Assemble bundled distribution file and compress with gzip and brotli
const bundle=engine+'\n'+component.replace(/^import .*?from '\.\/engine\.js';\s*/, '');
// Inline the stylesheet and bundled script into index.html. The replacement is
// a function so `$` sequences in the code are not treated as replacement
// patterns, and `</script` is escaped so the inline script cannot end early.
const standalone=html.replace('<link rel="stylesheet" href="demo.css"><script type="module" src="calculator.js"></script>',()=>`<style>${css}</style><script type="module">${bundle.replaceAll('</script','<\\/script')}</script>`);
await mkdir(new URL('dist/',root),{recursive:true});
await Promise.all([writeFile(new URL('dist/extreme-calculator.js',root),bundle),writeFile(new URL('dist/extreme-calculator.html',root),standalone),writeFile(new URL('dist/extreme-calculator.js.gz',root),gzipSync(bundle)),writeFile(new URL('dist/extreme-calculator.js.br',root),brotliCompressSync(bundle))]);
console.log(`Standalone HTML: ${Buffer.byteLength(standalone)} bytes\nEmbeddable JS: ${Buffer.byteLength(bundle)} bytes (${gzipSync(bundle).length} gzip; ${brotliCompressSync(bundle).length} Brotli)\nEngine: ${Buffer.byteLength(engine)} bytes (${gzipSync(engine).length} gzip)`);
