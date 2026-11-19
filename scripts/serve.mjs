// ==============================================================================
// Program: serve.mjs
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Zero-dependency local development HTTP server with Content-Security-Policy
//          headers and MIME type resolution.
//
// How it fits: `npm start` runs this file so the demo (index.html + calculator.js as an ES
//   module) can be opened over http://, which ES module imports require (file:// blocks
//   them in most browsers). It is a developer convenience only: nothing imports it and
//   it is not shipped in the npm package (see "files" in package.json).
// Inputs/outputs: env PORT (default 4173); serves any file under the repo root read-only.
// Limits: no caching headers, no range requests, no directory listings; each request reads
//   the whole file into memory, which is fine for a handful of small demo files.
// Run: `npm start`, then open http://localhost:4173. Stop with Ctrl-C.
// ==============================================================================
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
// Project root served by the dev server.
const root=resolve(new URL('..',import.meta.url).pathname);
// Content-Type map for the few file kinds the demo uses; anything else is
// served as text/plain.
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
// Security notes: the request path is resolved and rejected with 403 unless it
// stays inside `root` (blocks ../ traversal); '/' maps to index.html; the CSP
// forbids network connections (connect-src 'none') and external scripts; the
// server listens on 127.0.0.1 only, on PORT (default 4173).
// One request handler, in order: resolve the path -> refuse escapes with 403 -> read file ->
// reply 200 with the type and security headers; any read failure becomes a generic 404 so
// error text never leaks file system details. 'unsafe-inline' is allowed for styles only
// because the component injects a <style> element into its shadow root.
http.createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}const content=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'text/plain','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'"});res.end(content)}catch{res.writeHead(404);res.end('Not found')}}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Calculator: http://localhost:'+ (process.env.PORT||4173)));
