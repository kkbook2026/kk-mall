/* May chu tinh cho kiem thu trinh duyet / Lighthouse: phuc vu thu muc site/ (khong nen, no-store). (c) 2026 Nguyen Duy Dien. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.KK_SITE_ROOT ? path.resolve(process.env.KK_SITE_ROOT) : path.join(__dirname, '..', '..', 'site');   // KK_SITE_ROOT: kiem thu tren ban dung thu (du lieu moi)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.txt': 'text/plain', '.xml': 'application/xml' };
function serve(PORT) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      let f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }).listen(PORT, () => resolve(srv));
  });
}
module.exports = { serve, ROOT };
