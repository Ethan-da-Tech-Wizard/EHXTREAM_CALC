// Program: EHXTREAM_CALC - scripts/build.mjs
// Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
// Last Modified: 2026-11-18
// Purpose: Build script that bundles engine.js, calculator.js, demo.css and index.html into dist/ as a standalone HTML page and a single embeddable JS file (plus gzip and Brotli copies).
//
// Run with: node scripts/build.mjs
//
// File-system helpers: read, write and make folders.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
// Compression helpers from Node: gzip and Brotli make the files smaller for downloading.
import {gzipSync,brotliCompressSync} from 'node:zlib';
// root: URL of the project folder (the parent of scripts/), used to build every file path.
const root=new URL('../',import.meta.url);
// read(name): reads a project file as text.
const read=name=>readFile(new URL(name,root),'utf8');
// Read the four source files at the same time.
const [engine,component,html,css]=await Promise.all(['engine.js','calculator.js','index.html','demo.css'].map(read));
// bundle: engine.js followed by calculator.js, with calculator.js's import line removed because engine.js is now in the same file.
const bundle=engine+'\n'+component.replace(/^import .*?from '\.\/engine\.js';\s*/, '');
// standalone: index.html with its stylesheet link and script tag swapped for the CSS and JavaScript pasted inline, so the page works from a single file. '</script' inside the code is escaped so it cannot end the tag early.
const standalone=html.replace('<link rel="stylesheet" href="demo.css"><script type="module" src="calculator.js"></script>',()=>`<style>${css}</style><script type="module">${bundle.replaceAll('</script','<\\/script')}</script>`);
// Create the dist/ folder if it does not exist.
await mkdir(new URL('dist/',root),{recursive:true});
// Write the four output files into dist/ at the same time: the embeddable JS, the standalone HTML, and gzip and Brotli versions of the JS.
await Promise.all([writeFile(new URL('dist/extreme-calculator.js',root),bundle),writeFile(new URL('dist/extreme-calculator.html',root),standalone),writeFile(new URL('dist/extreme-calculator.js.gz',root),gzipSync(bundle)),writeFile(new URL('dist/extreme-calculator.js.br',root),brotliCompressSync(bundle))]);
// Print the output sizes in bytes so growth is easy to notice.
console.log(`Standalone HTML: ${Buffer.byteLength(standalone)} bytes\nEmbeddable JS: ${Buffer.byteLength(bundle)} bytes (${gzipSync(bundle).length} gzip; ${brotliCompressSync(bundle).length} Brotli)\nEngine: ${Buffer.byteLength(engine)} bytes (${gzipSync(engine).length} gzip)`);
