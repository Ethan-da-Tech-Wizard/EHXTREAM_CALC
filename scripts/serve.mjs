// Program: EHXTREAM_CALC - scripts/serve.mjs
// Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
// Last Modified: 2026-11-18
// Purpose: Tiny local web server (127.0.0.1 only) that serves the project folder with strict security headers for trying the calculator in a browser.
//
// Run with: node scripts/serve.mjs   (set PORT to change the port, default 4173)
//
// Node's built-in HTTP server and file reader.
import http from 'node:http';
// readFile: loads a file from disk to send to the browser.
import {readFile} from 'node:fs/promises';
// Path helpers: resolve builds an absolute path, extname gets the file extension, sep is the folder separator.
import {resolve, extname, sep} from 'node:path';
// root: absolute path of the project folder; files outside it are never served.
const root=resolve(new URL('..',import.meta.url).pathname);
// types: maps file extensions to the Content-Type header the browser needs.
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
// The server itself. For every request it:
//   1. turns the URL into a file path under root ('/' becomes '/index.html');
//   2. answers 403 if the path would escape root (blocks ../ tricks);
//   3. reads the file and replies 200 with a content type and security headers
//      (no sniffing, and a Content-Security-Policy that only allows same-origin
//      scripts and no network connections);
//   4. answers 404 'Not found' for anything that cannot be read.
// It listens on 127.0.0.1 (this computer only) and prints the address when ready.
http.createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}const content=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'text/plain','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'"});res.end(content)}catch{res.writeHead(404);res.end('Not found')}}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Calculator: http://localhost:'+ (process.env.PORT||4173)));
