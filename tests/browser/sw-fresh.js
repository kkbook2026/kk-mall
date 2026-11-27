/*
 * KK-MALL - Kiem thu service worker: khach quay lai phai thay du lieu gia MOI ngay o lan tai dau (mang truoc),
 * mang cham qua 2,5 giay thi dung ban luu (khong treo), mat mang van mo duoc trang va du lieu da luu.
 * Lap 27/11/2026: ban cu tra ban luu truoc (stale-while-revalidate) nen khach quay lai thay gia, gio cap nhat cua lan xem truoc.
 * Chay: node tests/browser/sw-fresh.js   (tu mo may chu tinh tai cong 8767; bien PORT de doi)
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..', 'site'), PORT = Number(process.env.PORT || 8767);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'meta.json'), 'utf8'));
const VER = { A: ['2026-11-27T07:53:00.000Z', 50955], B: ['2026-11-27T10:54:00.000Z', 51028], C: ['2026-11-27T13:54:00.000Z', 51100] };
let ver = 'A', slow = 0, pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/api/meta.json') {
    const m = Object.assign({}, real, { lastSync: VER[ver][0], totalProducts: VER[ver][1] });
    return setTimeout(() => { res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(m)); }, slow);
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}).listen(PORT);

(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(), page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const total = () => page.evaluate(() => document.getElementById('totalProducts').textContent);
  const until = (v) => page.waitForFunction(v => document.getElementById('totalProducts').textContent === v, v, { timeout: 15000 }).catch(() => {});
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(r => !!r.active), null, { timeout: 20000 });
  await page.reload({ waitUntil: 'load' }); await until('50.955');
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller) && await total() === '50.955', 'lần 1: service worker điều khiển trang, dữ liệu bản A');
  ver = 'B';
  await page.reload({ waitUntil: 'load' }); await until('51.028');
  ok(await total() === '51.028', 'khách quay lại: thấy ngay dữ liệu mới (bản B) ở lần tải đầu, không phải bản đã xem (' + await total() + ')');
  ver = 'C'; slow = 4000;
  const t0 = Date.now(); await page.reload({ waitUntil: 'domcontentloaded' }); await until('51.028'); const dt = Date.now() - t0;
  ok(await total() === '51.028' && dt < 4000, 'mạng chậm 4 giây: dùng bản lưu sau khoảng 2,5 giây, không treo (' + dt + ' ms)');
  await page.waitForTimeout(2500); slow = 0;
  await ctx.setOffline(true);
  let off = ''; try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }); await until('51.100'); off = await total(); } catch (e) { off = 'LỖI ' + e.message.slice(0, 60); }
  ok(off === '51.100', 'mất mạng: mở được trang và dữ liệu đã cập nhật ngầm gần nhất (bản C) (' + off + ')');
  await ctx.setOffline(false);
  ok(errs.length === 0, 'không lỗi JavaScript' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); srv.close();
  console.log(`\nKet qua service worker: ${pass} dat, ${fail} loi`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
