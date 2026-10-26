'use strict';
/*
 * THU THAP GIA CONG KHAI TU WEBSITE BAN LE (Hoang Ha Mobile, Phuc Anh, An Phat)
 * - Chi doc trang san pham cong khai ma robots.txt CHO PHEP; tuan thu Crawl-delay (An Phat 5 giay/trang).
 * - Lay du lieu chuan schema.org Product (JSON-LD): ten, gia ban dang hien thi, ton kho, anh, ma, danh muc.
 * - Tu nhan dien: User-Agent "KK-MALL-PriceBot" kem trang gioi thieu bot (https://www.kk-mall.com/bot.html).
 * - Tai lan luot theo sitemap, uu tien trang chua co du lieu + trang co gia cu nhat; luu bo nho dem ngoai git
 *   (GitHub Actions cache) de khong lam phinh repo. Bo thu thap gia 3 gio/lan doc bo nho dem nay.
 * Dung: node collector/retail.js [phut_ngan_sach]     (c) 2026 Nguyen Duy Dien (KK-2026)
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const UA = 'Mozilla/5.0 (compatible; KK-MALL-PriceBot/1.0; +https://www.kk-mall.com/bot.html)';
const CACHE = path.join(__dirname, '.retail-cache', 'retail.json.gz');
const SITES = {
  hoangha: { name: 'Hoàng Hà Mobile', base: 'https://hoanghamobile.com', sitemaps: ['/sitemap.xml'], delay: 1500,
    ok: p => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(p) && !/^\/(tin-tuc|account|gio-hang|so-sanh|tim-kiem|order|trung-tam|he-thong|gioi-thieu|danh-muc|khuyen-mai|tuyen-dung|chinh-sach|ho-tro)\//.test(p) },
  phucanh: { name: 'Phúc Anh', base: 'https://www.phucanh.vn', sitemaps: ['/sitemap_product.xml'], delay: 1500, ok: p => /^\/[a-z0-9-]+\.html$/.test(p) },
  anphat: { name: 'An Phát', base: 'https://www.anphatpc.com.vn', sitemaps: ['/sitemap_product.xml'], delay: 5000, ok: p => /^\/[a-z0-9-]+\.html$/.test(p) },
};
const SELLER_BRAND = /^(phuc ?anh|phucanh|an ?phat|anphat|hoang ?ha|hoanghamobile)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] || m));

async function get(url, timeout = 30000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'vi-VN,vi;q=0.9' }, signal: ac.signal, redirect: 'follow' }); return { status: r.status, text: r.status < 400 ? await r.text() : '' }; }
  finally { clearTimeout(t); }
}
/* robots.txt: gop moi nhom "User-agent: *" va nhom ten bot; tra ve ham kiem tra + crawl-delay */
function robots(txt) {
  const dis = [], allow = []; let delay = 0, on = false, prevUA = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { const me = v === '*' || /kk-mall/i.test(v); on = prevUA ? (on || me) : me; prevUA = true; continue; }
    prevUA = false; if (!on) continue;
    if (k === 'disallow' && v) dis.push(v); else if (k === 'allow' && v) allow.push(v); else if (k === 'crawl-delay') delay = Math.max(delay, parseFloat(v) || 0);
  }
  const rx = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  const D = dis.map(rx), A = allow.map(p => [p.length, rx(p)]);
  return { delay, allowed: p => { let best = -1, ok = true; D.forEach((r, i) => { if (r.test(p) && dis[i].length > best) { best = dis[i].length; ok = false; } }); for (const [len, r] of A) if (r.test(p) && len >= best) ok = true; return ok; } };
}
/* trich schema.org Product tu HTML */
function parseProduct(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => { try { return JSON.parse(m[1].trim()); } catch { return null; } }).filter(Boolean)
    .flatMap(x => Array.isArray(x) ? x : (x['@graph'] || [x]));
  const p = blocks.find(x => /Product/.test([].concat(x['@type']).join(',')));
  if (!p) return null;
  const off = [].concat(p.offers || []).flatMap(o => o && o['@type'] === 'AggregateOffer' && o.offers ? [].concat(o.offers) : [o]).filter(Boolean)[0] || {};
  const ps = String(off.price != null ? off.price : off.lowPrice || '').trim();
  const price = Math.round(Number(/^\d{1,3}([.,]\d{3})+$/.test(ps) ? ps.replace(/[.,]/g, '') : ps.replace(/[^\d.]/g, '')) || 0); // "25.490.000" va "25490000.00"
  if (price < 10000) return { name: dec(p.name).trim().slice(0, 200), price: 0, stock: 0, contact: 1 }; // "Lien he bao gia" (An Phat ghi gia 1d) -> KHONG co gia
  const bc = blocks.find(x => /BreadcrumbList/.test([].concat(x['@type']).join(',')));
  const cat = bc ? [].concat(bc.itemListElement || []).map(i => dec((i.item && i.item.name) || i.name || '')).filter(Boolean).slice(1, -1).join(' > ') : String(p.category || '');
  let brand = dec(p.brand && (p.brand.name || (typeof p.brand === 'string' ? p.brand : '')) || '');
  if (SELLER_BRAND.test(String(brand).trim())) brand = '';
  const img = [].concat(p.image || []).map(i => typeof i === 'string' ? i : (i && i.url) || '').find(u => /^https:\/\//.test(u)) || '';
  const av = String(off.availability || '').split('/').pop().toLowerCase();
  if (!av && !p.sku && !p.mpn) return null;                                    // trang danh muc/thuong hieu khai "Product" voi gia thap nhat nhom -> bo
  return { name: dec(p.name).replace(/\s+/g, ' ').trim().slice(0, 200), price, stock: price > 0 && (!av || /instock|limitedavailability|onlineonly|preorder|presale/.test(av)) ? 1 : 0,
    image: img, brand: String(brand).trim().slice(0, 40), cat: cat.slice(0, 160), id: String(p.sku || p.mpn || '').slice(0, 60) };
}
function loadCache() { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString('utf8')); } catch { return { v: 1, sites: {}, offers: {} }; } }
function saveCache(c) { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(c))); }

async function crawlSite(src, S, C, deadline, log) {
  const st = C.sites[src] = C.sites[src] || { urls: [], sitemapAt: 0 };
  const rb = await get(S.base + '/robots.txt').catch(() => ({ status: 0, text: '' }));
  const R = robots(rb.text); const delay = Math.max(S.delay, R.delay * 1000);
  if (Date.now() - st.sitemapAt > 20 * 3600e3 || !st.urls.length) {                     // lam moi sitemap moi ngay
    const urls = new Set();
    for (const sm of S.sitemaps) {
      const queue = [S.base + sm]; let guard = 0;
      while (queue.length && guard++ < 60) {
        const r = await get(queue.shift(), 60000).catch(() => ({ status: 0, text: '' })); await sleep(delay);
        for (const m of r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
          const u = m[1].replace(/&amp;/g, '&'); if (/\.xml(\.gz)?$/i.test(u)) { queue.push(u); continue; }
          let p; try { const x = new URL(u); if (x.search) continue; p = x.pathname; } catch { continue; }
          if (S.ok(p) && R.allowed(p)) urls.add(p);
        }
      }
    }
    if (urls.size) { st.urls = [...urls]; st.sitemapAt = Date.now(); }
    log(`[${src}] sitemap: ${st.urls.length} trang san pham hop le (robots.txt + crawl-delay ${delay / 1000}s)`);
  }
  // uu tien: chua tung tai -> gia cu nhat
  const now = Date.now(), seen = st.urls.map(p => [p, (C.offers[src + '|' + p] || {}).at || 0]);
  seen.sort((a, b) => a[1] - b[1]);
  let n = 0, ok = 0, prod = 0, errs = 0;
  for (const [p] of seen) {
    if (Date.now() + delay > deadline) break;
    const t0 = Date.now(); n++;
    let r; try { r = await get(S.base + p); } catch { r = { status: 0, text: '' }; }
    if (r.status === 429 || r.status >= 500 || r.status === 0) { errs++; if (errs >= 6) { log(`[${src}] dung som: may chu bao ban/loi ${r.status}`); break; } await sleep(delay * 4); continue; }
    errs = 0; ok++;
    const k = src + '|' + p;
    if (r.status === 404 || r.status === 410) { delete C.offers[k]; st.urls = st.urls.filter(x => x !== p); }
    else {
      const d = parseProduct(r.text);
      if (d && d.name && d.price > 0) { C.offers[k] = { ...d, at: now }; prod++; }
      else C.offers[k] = { skip: 1, at: now };                                               // trang danh muc/thuong hieu: bo qua lan sau
    }
    await sleep(Math.max(0, delay - (Date.now() - t0)));
  }
  log(`[${src}] tai ${n} trang · ${ok} thanh cong · ${prod} san pham co gia`);
  return { n, ok, prod };
}

/* Chay thu thap trong ngan sach thoi gian (phut); 3 trang chay song song, moi trang tuan tu theo crawl-delay rieng */
async function run(minutes = 45, log = console.log) {
  const C = loadCache(), deadline = Date.now() + minutes * 60e3;
  const res = await Promise.all(Object.entries(SITES).map(([src, S]) => crawlSite(src, S, C, deadline, log).catch(e => (log(`[${src}] loi: ${e.message}`), null))));
  C.savedAt = Date.now(); saveCache(C);
  const tot = Object.values(C.offers).filter(o => !o.skip).length;
  log(`Bo nho dem gia ban le: ${tot} san pham co gia`);
  return res;
}
/* Doc offer cho bo thu thap chinh (dang hang nhu datafeed). Gia cu hon maxAgeH bi bo; > 48h cong du phong 1% */
function rows(FEEDS, maxAgeH = 168) {
  const C = loadCache(), now = Date.now(), out = [];
  for (const [k, o] of Object.entries(C.offers || {})) {
    if (o.skip || !o.price || now - o.at > maxAgeH * 3600e3) continue;
    const i = k.indexOf('|'), src = k.slice(0, i), p = k.slice(i + 1), S = SITES[src]; if (!S) continue;
    const r = FEEDS.normRow({ title: o.name, price: o.price, image: o.image, link: S.base + p, category: o.cat, brand: o.brand, id: o.id, availability: o.stock ? 'instock' : 'outofstock' });
    out.push({ ...r, src, stale: now - o.at > 48 * 3600e3 ? 1 : 0, ageH: Math.round((now - o.at) / 3600e3) });
  }
  return out;
}
module.exports = { SITES, run, rows, parseProduct, robots, loadCache };
if (require.main === module) run(parseFloat(process.argv[2]) || 45).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
