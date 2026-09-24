// Kohalik proovi-server: node tooriistad/server.mjs → http://localhost:8765
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const JUUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYYP = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.png': 'image/png' };
http.createServer((q, r) => {
  const f = path.join(JUUR, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(JUUR) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYYP[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8765, () => console.log('http://localhost:8765'));
