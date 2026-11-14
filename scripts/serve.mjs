#!/usr/bin/env node
// A local server for the built site: `node scripts/serve.mjs [port]`. No dependencies.
// It serves dist/ and nothing else, with the headers in scripts/headers.mjs, and it answers on this computer only.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';
import { HEADERS } from './headers.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.yml': 'text/plain; charset=utf-8' };
const dist = join(root, 'dist');
const base = Object.fromEntries(HEADERS.map((h) => [h.name, h.value]));

export const siteServer = () => createServer((req, res) => {
  const send = (code, text) => { res.writeHead(code, { ...base, 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Only GET and HEAD');
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(400, 'Bad address'); }
  if (path.includes('\0')) return send(400, 'Bad address');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(dist, normalize(path));
  if (!file.startsWith(dist + sep)) return send(404, 'Not found');
  let st;
  try { st = statSync(file); } catch { return send(404, 'Not found'); }
  if (!st.isFile()) return send(404, 'Not found');
  res.writeHead(200, { ...base, 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const port = Number(process.argv[2] || 4440);
  siteServer().listen(port, '127.0.0.1', () => console.log(`Ordinance DS on port ${port} of this computer (127.0.0.1). Ctrl+C stops it.`));
}
