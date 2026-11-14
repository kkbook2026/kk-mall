'use strict';
/*
 * KK-HUNT - BO SAN GIA THEO MA MODEL (bo sung cho datafeed chinh thuc, retail.js va search.js)
 *
 * VAN DE (ra soat 15/11/2026): datafeed cua mot so chuoi ban le chi co gia NIEM YET, khong co khuyen mai va cu hon 10 ngay
 *   (vd may loc nuoc Karofi KAQ-X26: datafeed 7.760.000 d trong khi chinh trang cua chuoi do dang ban 6.490.000 d). Ngoai ra 89% san pham
 *   chi co 1 nguon nen "gia re nhat" thuc chat la gia cua nguon duy nhat.
 *
 * CACH LAM - hai che do, khai trong collector/hunt-sites.js:
 *   'feed' LAM TUOI GIA TAI NGUON: danh ba dia chi trang san pham lay tu file datafeed tinh; doc lai chinh trang do de lay gia dang ban + ton kho.
 *          Khop theo DIA CHI TRANG (chinh xac tuyet doi), co kiem tra ten tren trang trung ten trong datafeed. Trang da go / chuyen huong ve danh muc /
 *          "lien he" -> danh dau het hang (khong ban san pham khong con mua duoc).
 *   'map'  SUY NGUOC THEO MA MODEL: lap chi muc ma model manh cua toan bo danh muc KK-MALL (vd "kaqx26") -> doc sitemap cua website ->
 *          chi giu dia chi co doan slug trung ma -> tai dung nhung trang do -> offer gan san cho SKU, bo thu thap gia xac nhan lai bang bo ghep
 *          (match.js, chi nhan muc "trung ma" >= 0,90) va cac bo loc tin cay truoc khi dung.
 *
 * KHA DUNG = con hang + giao duoc cho khach toan quoc: moi website co `reach` (pham vi giao hang). Nguon giao theo vung / chua xac minh
 *   KHONG duoc dung cho gia cong khai, chi liet ke trong cong quan tri de duyet tay.
 *
 * PHAP LY: chi doc trang cong khai ma robots.txt cho phep; ton trong Crawl-delay; tu nhan dien KK-MALL-PriceBot (https://www.kk-mall.com/bot.html);
 *   may chu tu choi (401/403, hoac 429/5xx lap lai) thi DUNG - khong vuot chan, khong vuot CAPTCHA, khong dung cho san thuong mai dien tu.
 * BI MAT KINH DOANH: nhat ky chi in so lieu tong hop theo website, khong in ten san pham / gia tung san pham. Bo nho dem nam ngoai git
 *   (GitHub Actions cache), khong commit.
 *
 * Dung:  node collector/hunt.js [phut]            thu thap trong ngan sach thoi gian (mac dinh 45 phut)
 *        node collector/hunt.js probe [id,id...]  do ky thuat website trong danh ba + ung vien (chi in so lieu tong hop)
 *        node collector/hunt.js stat              tinh trang bo nho dem
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const RETAIL = require('./retail'), MATCH = require('./match'), FEEDS = require('./feeds');

const UA = 'Mozilla/5.0 (compatible; KK-MALL-PriceBot/1.0; +https://www.kk-mall.com/bot.html)';
const H = 3600e3, sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] || m));
const nd = MATCH.nd;

/* ---------- danh ba + bo nho dem ---------- */
function sitesOf(env = process.env) { if (env.HUNT_SITES_JSON) { try { return JSON.parse(env.HUNT_SITES_JSON); } catch { } } return require('./hunt-sites'); }
/* VUNG CHAY (zone): 'gh' = may chu cua GitHub (mac dinh) ; 'vn' = TRAM DAT TAI VIET NAM (may chay rieng cua KK-MALL). Mot so chuoi lon chi mo ket noi cho
 * dia chi mang trong nuoc (tu may chu GitHub: het gio ket noi o tang mang, do ngay 15/11/2026) -> cac website do khai zone 'vn' va chi tram VN thu thap.
 * Moi vung co bo nho dem rieng; bo thu thap gia doc gop ca hai. */
const zoneOf = S => (S && S.zone) || 'gh';
const cacheFile = (env, zone = 'gh') => zone === 'vn' ? (env.HUNT_CACHE_FILE_VN || path.join(__dirname, '.hunt-cache-vn', 'hunt.json.gz')) : (env.HUNT_CACHE_FILE || path.join(__dirname, '.hunt-cache', 'hunt.json.gz'));
function loadCache(env = process.env, zone = 'gh') { try { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(cacheFile(env, zone))).toString('utf8')); if (c && c.v === 1 && c.sites && c.offers) return c; } catch { } return { v: 1, sites: {}, offers: {} }; }
function saveCache(c, env = process.env, zone = 'gh') { const f = cacheFile(env, zone); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', zlib.gzipSync(JSON.stringify(c))); fs.renameSync(f + '.tmp', f); }
/* doc gop bo nho dem cua moi vung; moi website chi lay du lieu tu bo nho dem cua DUNG vung no dang khai */
function loadAll(env = process.env) { const SITES = sitesOf(env), out = { v: 1, sites: {}, offers: {}, savedAt: {} };
  for (const zone of ['gh', 'vn']) { const c = loadCache(env, zone); out.savedAt[zone] = c.savedAt || 0;
    for (const [id, st] of Object.entries(c.sites)) if (SITES[id] && zoneOf(SITES[id]) === zone) out.sites[id] = st;
    for (const [k, o] of Object.entries(c.offers)) { const id = k.slice(0, k.indexOf('|')); if (SITES[id] && zoneOf(SITES[id]) === zone) out.offers[k] = o; } }
  return out; }
const hostOf = u => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
/* khoa dia chi trang: ten mien (bo www) + duong dan, khong tham so - dung de khop ban ghi datafeed voi trang da doc */
const urlKey = u => { try { const x = new URL(u); return x.host.replace(/^www\./, '').toLowerCase() + x.pathname.replace(/\/+$/, ''); } catch { return ''; } };

/* ---------- tai trang (tu nhan dien, co gioi han dung luong, tu giai nen sitemap .gz) ---------- */
async function get(url, { timeout = 30000, max = 8 * 1048576 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'vi-VN,vi;q=0.9', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' }, signal: ac.signal, redirect: 'follow' });
    if (r.status >= 400) { try { await r.arrayBuffer(); } catch { } return { status: r.status, text: '', url: r.url || url }; }
    let buf = Buffer.from(await r.arrayBuffer());
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch { return { status: 0, text: '', url: r.url || url }; } }
    if (buf.length > max) buf = buf.subarray(0, max);
    return { status: r.status, text: buf.toString('utf8'), url: r.url || url };
  } catch (e) { return { status: 0, text: '', url, err: String((e && e.cause && (e.cause.code || e.cause.name)) || (e && e.name) || 'loi').slice(0, 40) }; } finally { clearTimeout(t); }
}

/* ---------- robots.txt: luat cua retail.robots (gop nhom "*" va nhom ten bot) + danh sach Sitemap ---------- */
function robotsOf(txt) { const R = RETAIL.robots(txt), sitemaps = []; for (const m of String(txt || '').matchAll(/^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim)) sitemaps.push(m[1]); return { delay: R.delay, allowed: R.allowed, sitemaps }; }
/* khoang cach giua 2 yeu cau = muc LON HON giua cau hinh cua ta va Crawl-delay website yeu cau (HUNT_DELAY_MS chi de kiem thu, khong ha duoc Crawl-delay) */
const delayOf = (S, R, env = process.env) => Math.max(env.HUNT_DELAY_MS != null && env.HUNT_DELAY_MS !== '' ? +env.HUNT_DELAY_MS || 0 : (S.delay || 2500), (R.delay || 0) * 1000);

/* ---------- CHI MUC MA MODEL cua danh muc KK-MALL (suy nguoc: tu san pham dang ban -> ma can tim tren thi truong) ---------- */
function loadCatalog(env = process.env) { return JSON.parse(fs.readFileSync(env.HUNT_CATALOG_FILE || path.join(__dirname, '..', 'site', 'api', 'catalog-full.json'), 'utf8')); }
function buildIndex(catalog, maxPerCode = 12) {
  const byCode = new Map(), keys = new Map(), words = new Map();
  for (const p of catalog) {
    if (!p || !p.sku || !p.name) continue;
    keys.set(FEEDS.normKey(p.name), p.sku);
    const f = MATCH.features(p.name);
    if (f.cond || f.acc || !f.strong.length) continue;                 // hang da qua su dung / phu kien (ma trong ten la cua may tuong thich): khong san theo ma
    words.set(p.sku, [...new Set([...f.brands, ...f.words])].filter(w => w.length >= 3));
    const ks = new Set();
    for (const c of f.strong) { ks.add(c.full); ks.add(c.core);
      // ma dai co tien to cum/khoi ("CU/CS-PU9AKH-8" = cucspu9akh8): noi khac thuong chi ghi phan duoi ("PU9AKH-8") - cung quy tac voi match.codeEq
      if (c.full.length >= 8) for (let d = 1; d <= 4; d++) { const suf = c.full.slice(d); if (suf.length >= 6 && /[a-z]/.test(suf) && /\d/.test(suf)) ks.add(suf); } }
    for (const k of ks) { if (k.length < 5) continue; let a = byCode.get(k); if (!a) byCode.set(k, a = []); if (!a.includes(p.sku)) a.push(p.sku); }
  }
  for (const [k, a] of byCode) if (a.length > maxPerCode) byCode.delete(k);   // ma co o qua nhieu san pham (ten dong may, chipset...) khong dinh danh duoc 1 san pham
  return { byCode, keys, words };
}
/* Doan slug cua dia chi -> cac SKU co ma model nam trong slug ("...-karofi-kaq-x26-10-loi" chua "kaq"+"x26" = "kaqx26").
 * Them 1 chot nhe: slug phai chua it nhat 1 tu cua ten san pham (thuong hieu / loai hang) de bo trung ma ngau nhien. */
function slugSkus(pathname, idx) {
  let p = String(pathname || ''); try { p = decodeURIComponent(p); } catch { }
  const out = new Set();
  for (const seg of nd(p).split('/').filter(Boolean).slice(-3)) {
    const toks = seg.replace(/\.(html?|aspx?|php)$/, '').split(/[^a-z0-9]+/).filter(Boolean);
    if (toks.length < 2) continue;                                     // "/p/12345": khong phai slug ten san pham
    const set = new Set(toks);
    for (let i = 0; i < toks.length; i++) { let s = '';
      for (let j = i; j < toks.length && j < i + 4; j++) { s += toks[j]; if (s.length > 24) break; if (s.length < 5) continue;
        const a = idx.byCode.get(s); if (!a) continue;
        for (const sku of a) { const w = idx.words.get(sku); if (!w || !w.length || w.some(x => set.has(x))) out.add(sku); } } }
  }
  return out;
}

/* ---------- doc du lieu san pham tren trang: schema.org Product (JSON-LD), du phong the meta Open Graph "product:price:amount" ---------- */
function cleanTitle(t, S) {
  let s = dec(t).replace(/\s+/g, ' ').trim(); const site = nd((S && S.name) || '').replace(/[^a-z0-9]/g, ''), dom = S && S.base ? hostOf(S.base).split('.')[0] : '';
  for (let i = 0; i < 3; i++) { const m = s.match(/^(.{8,})\s+[|–—-]\s+([^|–—]{2,60})$/); if (!m) break; const tail = nd(m[2]).replace(/[^a-z0-9]/g, '');
    if (/\|\s*[^|]+$/.test(s) || (site && tail.includes(site)) || (dom && tail.includes(dom)) || /chinh hang|gia re|gia tot|tra gop|mua ngay|khuyen mai/.test(nd(m[2]))) s = m[1].trim(); else break; }
  return s.slice(0, 200);
}
function parsePage(html, S) {
  const d = RETAIL.parseProduct(html);
  if (d) return { ...d, via: 'jsonld' };
  const meta = k => { const q = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = html.match(new RegExp('<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["\']' + q + '["\'][^>]*?content\\s*=\\s*["\']([^"\']*)["\']', 'i')) || html.match(new RegExp('<meta[^>]+content\\s*=\\s*["\']([^"\']*)["\'][^>]*?(?:property|name|itemprop)\\s*=\\s*["\']' + q + '["\']', 'i'));
    return m ? dec(m[1]).trim() : ''; };
  const amt = meta('product:sale_price:amount') || meta('product:price:amount') || meta('og:price:amount'), title = meta('og:title');
  if (!amt || !title) return null;
  const cur = meta('product:price:currency') || meta('og:price:currency'); if (cur && !/^(vnd|đ|₫)$/i.test(cur)) return null;
  const price = FEEDS.parsePrice(amt), name = cleanTitle(title, S);
  if (!(price >= 10000)) return { name, price: 0, stock: 0, contact: 1, via: 'meta' };
  const av = nd(meta('product:availability') || meta('og:availability')).replace(/[^a-z]/g, ''), img = meta('og:image');
  return { name, price, stock: !av || /^(instock|available|preorder|conhang|instoreonly)/.test(av) ? 1 : 0, image: /^https:\/\//.test(img) ? img : '', brand: meta('product:brand').slice(0, 40), cat: '', id: meta('product:retailer_item_id').slice(0, 60), via: 'meta' };
}
/* Ten tren trang co phai dung mat hang cua ban ghi datafeed khong (cung dia chi trang). `moved` = trang da bi chuyen huong sang dia chi khac -> xet chat. */
function sameItem(a, b, moved) {
  const ka = FEEDS.normKey(a), kb = FEEDS.normKey(b); if (ka && ka === kb) return true;
  const fa = MATCH.features(a), fb = MATCH.features(b); if (fa.cond !== fb.cond) return false;
  if (fa.strong.length && fb.strong.length && !fa.strong.some(c => fb.strong.some(d => MATCH.codeEq(c, d)))) return false;   // hai ten deu co ma model ma khong ma nao trung
  const sc = MATCH.score(fa, fb); if (sc >= (moved ? 0.9 : 0.6)) return true;
  if (moved) return false;
  const A = new Set(ka.split(' ').filter(Boolean)), B = new Set(kb.split(' ').filter(Boolean)); let i = 0; for (const t of A) if (B.has(t)) i++;
  return A.size + B.size - i > 0 && i / (A.size + B.size - i) >= 0.6;
}

/* ---------- che do 'feed': danh ba dia chi tu file datafeed tinh (khong can khoa; lam moi 12 gio/lan) ---------- */
async function feedTargets(src, S, st, idx, env, log) {
  if (st.t && Date.now() - (st.tAt || 0) < 12 * H) return;
  const r = await get(String(env.ACCESSTRADE_CSV_BASE || FEEDS.AT_CSV) + S.feed + '.csv', { timeout: 300000, max: 256 * 1048576 });
  let rows = []; if (r.status === 200 && r.text) { try { rows = FEEDS.parseAny(r.text, 'text/csv'); } catch { rows = []; } }
  const host = hostOf(S.pub || S.base), t = {}, amb = new Set(); let n = 0; const pr = [0, 0, 0, 0];
  for (const row of rows) {
    const o = FEEDS.normRow({ name: row.name, price: row.price, sale_price: row.discount, image: row.image, link: FEEDS.csvUrl(row.url), category: row.category });
    if (!o.name || !o.url || !(o.price >= 1000) || hostOf(o.url) !== host) continue;
    let p; try { const x = new URL(o.url); p = x.pathname; } catch { continue; }
    if (p.length > 300 || p.length < 4 || /\/(null|undefined|nan)$/i.test(p) || amb.has(p)) continue;
    // 1 dia chi dung cho NHIEU mat hang khac ten trong datafeed (dia chi hong ".../null", 2 mau chung 1 trang): khong biet trang do la cua mat hang nao -> khong lam tuoi, giu ban ghi goc
    if (t[p]) { if (FEEDS.normKey(t[p][0]) !== FEEDS.normKey(o.name)) { pr[t[p][4]]--; n--; delete t[p]; amb.add(p); } continue; }
    // muc uu tien: 1 = dang la san pham tren KK-MALL (trung khoa ten) ; 2 = co ma model trung voi san pham tren KK-MALL (se duoc ghep cheo) ; 3 = con lai
    const prio = idx.keys.has(FEEDS.normKey(o.name)) ? 1 : (MATCH.features(o.name).strong.some(c => idx.byCode.has(c.core) || idx.byCode.has(c.full)) ? 2 : 3);
    t[p] = [o.name, o.image, o.cat, o.price, prio]; n++; pr[prio]++;
  }
  if (n >= 20) { st.t = t; st.tAt = Date.now(); st.dir = { n, p1: pr[1], p2: pr[2], p3: pr[3], amb: amb.size, at: st.tAt }; log(`[${src}] danh ba tu datafeed: ${n} trang (uu tien 1: ${pr[1]} · 2: ${pr[2]} · 3: ${pr[3]})`); }
  else log(`[${src}] khong tai duoc danh ba tu datafeed (HTTP ${r.status}, ${n} dong hop le) - dung danh ba lan truoc (${st.t ? Object.keys(st.t).length : 0} trang)`);
}

/* ---------- che do 'map': doc sitemap, giu dia chi co ma model cua danh muc (lam moi 72 gio/lan; doc do thi lan sau doc tiep) ---------- */
/* ten file sitemap: bo chu "sitemap" truoc khi xet (chu nay chua "item"); file ten co product/san-pham luon doc, file tin tuc/danh muc/thuong hieu... bo qua */
const MAP_SKIP = /(news|blog|tin-?tuc|bai-?viet|post|article|video|image|img|tag|brand|thuong-?hieu|store|sieu-?thi|cua-?hang|page|static|faq|hoi-?dap|khuyen-?mai|promo|landing|event|author|collection|cate|danh-?muc|knh|kinh-?nghiem)/i, MAP_KEEP = /(product|san-?pham|sanpham|item|detail)/i;
async function mapTargets(src, S, st, R, idx, delay, deadline, log, limit) {
  const every = (S.mapEveryH || 72) * H, host = hostOf(S.base);
  if (!st.mq) {
    if (st.m && Date.now() - (st.mAt || 0) < every) return true;
    const start = S.sitemaps && S.sitemaps.length ? S.sitemaps.map(x => /^https?:/i.test(x) ? x : S.base + x) : (R.sitemaps.length ? R.sitemaps : [S.base + '/sitemap.xml']);
    st.mq = start.filter(u => hostOf(u) === host).map(u => [u, 0]); st.mn = {}; st.ms = { files: 0, urls: 0, skip: 0, err: 0 }; st.mseen = [];
  }
  const seen = new Set(st.mseen), max = limit || S.maxMaps || 400, deny = S.deny ? new RegExp(S.deny) : null;
  while (st.mq.length) {
    if (Date.now() + delay > deadline) return false;
    const [u, depth] = st.mq.shift(); if (seen.has(u)) continue; if (st.ms.files >= max) { st.ms.cut = 1; st.mq = []; break; }
    seen.add(u); st.mseen.push(u);
    const t0 = Date.now(), r = await get(u, { timeout: 120000, max: 96 * 1048576 });
    if (r.status !== 200 || !r.text) { st.ms.err++; st.ms.http = r.status; }
    else {
      st.ms.files++;
      const isIndex = /<sitemapindex[\s>]/i.test(r.text.slice(0, 6000));
      for (const m of r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/g)) {
        const loc = dec(m[1]);
        if (isIndex) { if (depth < 3 && hostOf(loc) === host) { const nm = loc.replace(/^https?:\/\/[^/]+/i, '').replace(/sitemaps?/ig, ' '); if (MAP_KEEP.test(nm) || !MAP_SKIP.test(nm)) st.mq.push([loc, depth + 1]); else st.ms.skip++; } continue; }
        let x; try { x = new URL(loc); } catch { continue; }
        if (x.host.replace(/^www\./, '').toLowerCase() !== host || x.search) continue;
        st.ms.urls++;
        const p = x.pathname; if (p.length > 300 || !R.allowed(p) || (deny && deny.test(p))) continue;
        const skus = slugSkus(p, idx); if (skus.size) st.mn[p] = [...skus].slice(0, 6);
      }
    }
    await sleep(Math.max(0, delay - (Date.now() - t0)));
  }
  const match = Object.keys(st.mn).length;
  if (st.ms.files) { st.m = st.mn; st.mAt = Date.now(); }
  else st.mAt = Date.now() - every + 12 * H;                             // khong doc duoc sitemap nao: giu ket qua cu, 12 gio sau thu lai
  st.map = { ...st.ms, match, at: Date.now() };
  delete st.mq; delete st.mn; delete st.ms; delete st.mseen;
  log(`[${src}] sitemap: ${st.map.files} file · ${st.map.urls} dia chi · ${match} trang trung ma model cua danh muc` + (st.map.files ? '' : ` - KHONG doc duoc sitemap (HTTP ${st.map.http || 0})`));
  return true;
}

/* ---------- danh sach trang den han lam tuoi (chua tung doc -> uu tien cao -> cu nhat) ---------- */
function dueList(src, S, st, C, R, now) {
  const out = [];
  if (S.mode === 'feed') { const ev = S.every || [8, 24, 96];
    for (const [p, T] of Object.entries(st.t || {})) { if (!R.allowed(p)) continue; const o = C.offers[src + '|' + p], at = o ? o.at : 0;
      const every = (o && o.e ? 72 : o && o.g ? Math.max(48, ev[2] || 96) : (ev[(T[4] || 3) - 1] || 96)) * H; if (at + every <= now) out.push([p, at + every]); } }
  else { const ev = ((S.every && S.every[0]) || 12) * H;
    for (const p of Object.keys(st.m || {})) { const o = C.offers[src + '|' + p], at = o ? o.at : 0, every = o && o.e ? 168 * H : ev; if (at + every <= now) out.push([p, at + every]); } }
  return out.sort((a, b) => a[1] - b[1]);
}

/* ---------- thu thap 1 website: tuan tu, cach nhau `delay`; may chu tu choi thi dung ---------- */
async function crawlSite(src, S, C, idx, deadline, env, log, KICK, save) {
  const st = C.sites[src] = C.sites[src] || {};
  const rb = await get(S.base + '/robots.txt');
  st.http = { robots: rb.status, at: Date.now() };
  if (rb.status === 200 && hostOf(rb.url) && hostOf(rb.url) !== hostOf(S.base)) { st.fail = 'chuyen huong sang ten mien khac'; log(`[${src}] robots.txt chuyen huong sang ten mien khac -> bo qua (can cap nhat danh ba)`); return null; }
  if (!(rb.status === 200 || rb.status === 404 || rb.status === 410)) { st.fail = 'robots.txt HTTP ' + rb.status; log(`[${src}] robots.txt HTTP ${rb.status}: may chu khong cho doc tu dong -> khong thu thap, khong vuot chan`); return null; }
  const R = robotsOf(rb.status === 200 ? rb.text : ''), delay = delayOf(S, R, env);
  if (S.mode === 'feed') await feedTargets(src, S, st, idx, env, log);
  else { const done = await mapTargets(src, S, st, R, idx, delay, deadline, log); if (done && st.m) for (const k of Object.keys(C.offers)) if (k.startsWith(src + '|') && !st.m[k.slice(src.length + 1)]) delete C.offers[k]; }
  const due = dueList(src, S, st, C, R, Date.now());
  let n = 0, ok = 0, got = 0, errs = 0, denied = 0, odd = 0, lastSave = Date.now();
  const ODD_MAX = parseInt(env.HUNT_ODD_MAX || '20', 10);
  for (const [p] of due) {
    if (Date.now() + delay > deadline) break;
    if (KICK) await KICK.tick();
    const t0 = Date.now(); n++;
    const r = await get(S.base + p), k = src + '|' + p, at = Date.now();
    if (r.status === 401 || r.status === 403) { if (++denied >= 3) { st.fail = 'HTTP ' + r.status; log(`[${src}] DUNG: may chu tu choi truy cap tu dong (HTTP ${r.status}) ${denied} lan lien tiep -> khong thu thap, khong vuot chan`); break; } await sleep(delay * 4); continue; }
    if (r.status === 429 || r.status >= 500 || r.status === 0) { if (++errs >= 6) { log(`[${src}] dung som: may chu bao ban/loi (HTTP ${r.status})`); break; } await sleep(delay * 4); continue; }
    errs = 0; denied = 0; ok++; delete st.fail;
    if (S.mode === 'feed') {
      const T = st.t[p], moved = urlKey(r.url) !== urlKey(S.base + p);
      if (r.status === 404 || r.status === 410) C.offers[k] = { g: 1, at };                                   // trang da go
      else if (r.status !== 200) C.offers[k] = { e: 'http', at };
      else { const d = parsePage(r.text, S);
        if (!d) C.offers[k] = moved ? { g: 2, at } : { e: 'nodata', at };                                     // chuyen huong ve trang khong phai san pham = da ngung ban
        else if (!sameItem(T[0], d.name, moved)) C.offers[k] = moved ? { g: 2, at } : { e: 'name', at };
        else if (d.contact || !(d.price >= 1000 && d.price <= 2e9)) C.offers[k] = { g: 3, at };              // "lien he": khong dat mua truc tuyen duoc
        else { C.offers[k] = { p: d.price, s: d.stock ? 1 : 0, at }; got++; } }
    } else if (r.status === 404 || r.status === 410) { delete C.offers[k]; delete st.m[p]; }
    else { const d = r.status === 200 ? parsePage(r.text, S) : null;
      if (d && d.name && d.price >= 1000 && d.price <= 2e9) { C.offers[k] = { n: d.name, p: d.price, s: d.stock ? 1 : 0, i: d.image || '', at }; got++; }
      else C.offers[k] = { e: d && d.contact ? 'contact' : 'nodata', at }; }
    /* CHAN MEM: nhieu trang LIEN TIEP khong co gia (da go / chuyen huong / khong co du lieu san pham) la bat thuong - co the may chu dang tra trang khac cho bot.
     * Khong vuot chan: dung luot nay, va bo cac ket qua "khong con ban" vua ghi trong chuoi do de khong danh dau het hang oan. */
    { const o = C.offers[k]; if (o && o.p > 0) odd = 0; else if (++odd >= ODD_MAX) { st.fail = 'nhieu trang lien tiep khong co gia - nghi may chu tra trang khac cho bot'; st.oddAt = at;
        for (const q of due.slice(Math.max(0, n - odd), n)) { const kk = src + '|' + q[0], x = C.offers[kk]; if (x && (x.g || x.e) && x.at >= t0 - odd * (delay + 60000)) delete C.offers[kk]; }
        log(`[${src}] DUNG: ${odd} trang lien tiep khong co gia - nghi may chu tra trang khac cho bot -> bo ket qua cua chuoi nay, khong vuot chan`); break; } }
    if (Date.now() - lastSave > 10 * 60e3) { try { (save || (() => saveCache(C, env)))(); } catch { } lastSave = Date.now(); }     // luu dinh ky: lan chay bi cat ngang van giu ket qua
    await sleep(Math.max(0, delay - (Date.now() - t0)));
  }
  st.run = { at: Date.now(), due: due.length, n, ok, got };
  log(`[${src}] den han ${due.length} trang · tai ${n} · thanh cong ${ok} · co gia ${got} (cach nhau ${delay / 1000}s)`);
  return { n, ok, got, due: due.length };
}

/* ---------- chay trong ngan sach thoi gian: cac website song song, moi website tuan tu ---------- */
async function run(minutes = 45, log = console.log, env = process.env) {
  const zone = env.HUNT_ZONE === 'vn' ? 'vn' : 'gh';
  const SITES = Object.fromEntries(Object.entries(sitesOf(env)).filter(([, S]) => zoneOf(S) === zone)), C = loadCache(env, zone), deadline = Date.now() + minutes * 60e3;
  const idx = buildIndex(loadCatalog(env));
  log(`Vung chay: ${zone === 'vn' ? 'tram Viet Nam' : 'may chu GitHub'} · ${Object.keys(SITES).length} website · chi muc ma model cua danh muc: ${idx.byCode.size} ma · ${idx.keys.size} ten san pham`);
  for (const src of Object.keys(C.sites)) if (!SITES[src]) { delete C.sites[src]; for (const k of Object.keys(C.offers)) if (k.startsWith(src + '|')) delete C.offers[k]; }   // website da bo khoi danh ba / chuyen sang vung khac
  const KICK = require('./kick').make(env, log), save = () => saveCache(C, env, zone);
  const res = await Promise.all(Object.entries(SITES).map(([src, S]) => crawlSite(src, S, C, idx, deadline, env, log, KICK, save).catch(e => (log(`[${src}] loi: ${String(e && e.message || e).slice(0, 120)}`), null))));
  C.savedAt = Date.now(); save();
  const S2 = Object.fromEntries(Object.entries(siteStat(env, C)).filter(([k]) => SITES[k]));
  log('Bo nho dem san gia: ' + Object.entries(S2).map(([k, v]) => `${k} ${v.fresh}/${v.targets}${v.gone ? ' (ngung ban ' + v.gone + ')' : ''}`).join(' · '));
  return res;
}

/* ---------- xuat cho bo thu thap gia ---------- */
/* Che do 'feed': ban ghi THAY THE ban ghi datafeed cung dia chi trang (ten/anh/nhom giu cua datafeed, gia + ton kho la cua trang that).
 * Trang da go / lien he -> stock 0. Tra ve { rows, src: Set(ma nguon) }. Du lieu cu hon maxAgeH bi bo (khi do ban ghi datafeed goc duoc dung lai). */
function liveRows(env = process.env, maxAgeH = 168) {
  const SITES = sitesOf(env), C = loadAll(env), now = Date.now(), rows = [], src = new Set(), suspect = [];
  const GONE_MAX = parseFloat(env.HUNT_GONE_MAX || '0.25');
  for (const [id, S] of Object.entries(SITES)) { if (S.mode !== 'feed') continue; const st = C.sites[id]; if (!st || !st.t) continue;
    /* CHOT AN TOAN: ty le trang "khong con ban" cao bat thuong (> 25% so trang da doc) -> khong tin trang thai do (giu ban ghi datafeed goc cho cac trang nay) */
    let nf = 0, ng = 0; for (const p of Object.keys(st.t)) { const o = C.offers[id + '|' + p]; if (!o || o.e || now - o.at > maxAgeH * H) continue; nf++; if (o.g) ng++; }
    const skipGone = nf >= 40 && ng > GONE_MAX * nf; if (skipGone) suspect.push(id);
    for (const [p, T] of Object.entries(st.t)) { const o = C.offers[id + '|' + p]; if (!o || o.e || now - o.at > maxAgeH * H || (o.g && skipGone)) continue;
      const price = o.g ? T[3] : o.p, ageH = Math.round((now - o.at) / H);
      rows.push({ name: T[0], price, list: T[3] > price ? T[3] : 0, image: T[1] || '', url: (S.pub || S.base) + p, brand: '', cat: T[2] || '', stock: o.g ? 0 : (o.s ? 1 : 0), id: '', src: id, live: 1, gone: o.g ? 1 : 0, stale: ageH > 48 ? 1 : 0, ageH });
      src.add(id); } }
  return { rows, src, suspect };
}
/* Che do 'map': offer da gan san cho SKU (bo thu thap gia xac nhan lai bang bo ghep roi moi dung). */
function huntRows(env = process.env, maxAgeH = 120) {
  const SITES = sitesOf(env), C = loadAll(env), now = Date.now(), out = [];
  for (const [id, S] of Object.entries(SITES)) { if (S.mode === 'feed') continue; const st = C.sites[id]; if (!st || !st.m) continue;
    for (const [p, skus] of Object.entries(st.m)) { const o = C.offers[id + '|' + p]; if (!o || o.e || !(o.p > 0) || now - o.at > maxAgeH * H) continue;
      const ageH = Math.round((now - o.at) / H);
      for (const sku of skus) out.push({ sku, src: id, name: o.n, price: o.p, stock: o.s ? 1 : 0, url: S.base + p, image: o.i || '', reach: S.hold ? 'hold' : (S.reach || 'check'), region: S.region || '', stale: ageH > 48 ? 1 : 0, ageH }); } }
  return out;
}
/* Pham vi giao hang cua 1 offer san duoc: '' = dung duoc cho gia cong khai ; khac rong = ly do chi liet ke cho quan tri */
function reachNote(reach, region, bulky) {
  if (reach === 'vn' || (reach === 'vn-small' && !bulky)) return '';
  if (reach === 'hold') return 'mới đưa vào danh bạ - đang kiểm định độ khớp mã';
  if (reach === 'region') return 'chỉ giao ' + (region || 'theo vùng');
  if (reach === 'vn-small') return 'hàng cồng kềnh chỉ giao theo vùng' + (region ? ' (' + region + ')' : '');
  return 'chưa xác minh phạm vi giao hàng';
}
/* Tinh trang tung website cho nhat ky quan tri */
function siteStat(env = process.env, C0) {
  const SITES = sitesOf(env), C = C0 || loadAll(env), now = Date.now(), out = {};
  for (const [id, S] of Object.entries(SITES)) { const st = C.sites[id] || {}, paths = Object.keys((S.mode === 'feed' ? st.t : st.m) || {});
    let fresh = 0, gone = 0, miss = 0; const ages = [];
    for (const p of paths) { const o = C.offers[id + '|' + p]; if (!o) continue; if (o.e) { miss++; continue; } if (now - o.at > 168 * H) continue; fresh++; if (o.g) gone++; ages.push((now - o.at) / H); }
    ages.sort((a, b) => a - b);
    out[id] = { name: S.name, mode: S.mode, zone: zoneOf(S), reach: S.reach || 'check', targets: paths.length, fresh, gone, miss, ageH: ages.length ? Math.round(ages[ages.length >> 1]) : null, fail: st.fail || '', http: st.http || null, map: st.map || null, dir: st.dir || null, run: st.run || null }; }
  return out;
}

/* ---------- DO KY THUAT (probe): chi in so lieu tong hop, khong in ten / gia san pham ---------- */
async function probe(ids, log = console.log, env = process.env) {
  const ALL = { ...require('./hunt-candidates'), ...sitesOf(env) }, pick = ids && ids.length ? ids.filter(i => ALL[i]) : Object.keys(ALL);
  const idx = buildIndex(loadCatalog(env)), maps = parseInt(env.HUNT_PROBE_MAPS || '30', 10), samples = parseInt(env.HUNT_PROBE_SAMPLES || '4', 10), budget = parseFloat(env.HUNT_PROBE_MIN || '12') * 60e3;
  log(`Do ky thuat ${pick.length} website · chi muc ${idx.byCode.size} ma model`);
  const out = {};
  await Promise.all(pick.map(async id => { const S = ALL[id], o = out[id] = { mode: S.mode }; const deadline = Date.now() + budget;
    try {
      const rb = await get(S.base + '/robots.txt'); o.robots = rb.status; if (rb.err) o.neterr = rb.err; if (hostOf(rb.url) !== hostOf(S.base)) o.moved = hostOf(rb.url);
      if (!(rb.status === 200 || rb.status === 404 || rb.status === 410)) return;
      const R = robotsOf(rb.status === 200 ? rb.text : ''), delay = delayOf(S, R, env); o.delay = delay / 1000; o.smDecl = R.sitemaps.length;
      let paths = [];
      if (S.mode === 'feed') { const st = {}; await feedTargets(id, S, st, idx, env, () => { }); o.dir = st.dir || null; paths = Object.entries(st.t || {}).filter(([p, T]) => T[4] === 1 && R.allowed(p)).map(x => x[0]); o.allowed = paths.length; }
      else { const st = {}; await mapTargets(id, S, st, R, idx, delay, deadline, () => { }, maps); o.map = st.map || { files: 0, urls: 0, partial: 1, ...(st.ms || {}), match: Object.keys(st.mn || {}).length }; paths = Object.keys(st.m || st.mn || {}); }
      const pickN = []; for (let i = 0; i < samples && paths.length; i++) pickN.push(paths[Math.floor(i * paths.length / samples)]);
      o.sample = { n: 0, http: {}, data: 0, price: 0, stock: 0, via: {} };
      for (const p of [...new Set(pickN)]) { await sleep(delay); const r = await get(S.base + p); o.sample.n++; o.sample.http[r.status] = (o.sample.http[r.status] || 0) + 1;
        const d = r.status === 200 ? parsePage(r.text, S) : null; if (d) { o.sample.data++; o.sample.via[d.via] = (o.sample.via[d.via] || 0) + 1; if (d.price > 0) o.sample.price++; if (d.stock) o.sample.stock++; } }
    } catch (e) { o.err = String(e && e.message || e).slice(0, 80); }
  }));
  for (const id of pick) { const o = out[id], m = o.map, s = o.sample;
    log(`${id.padEnd(14)} robots ${o.robots}${o.neterr ? ' (' + o.neterr + ')' : ''}${o.moved ? ' ->' + o.moved : ''}` + (o.delay != null ? ` · cach ${o.delay}s · sitemap khai ${o.smDecl}` : '') + (m ? ` · doc ${m.files} file${m.cut ? '+' : ''} (loi ${m.err}${m.http ? ' HTTP ' + m.http : ''}, bo ${m.skip}) · ${m.urls} dia chi · trung ma ${m.match}` : '') + (o.dir ? ` · danh ba ${o.dir.n} (uu tien 1: ${o.dir.p1}), duoc phep ${o.allowed}` : '')
      + (s ? ` · mau ${s.n}: HTTP ${JSON.stringify(s.http)} · co du lieu ${s.data} (${Object.entries(s.via).map(x => x.join(':')).join(',') || '-'}) · co gia ${s.price} · con hang ${s.stock}` : '') + (o.err ? ' · LOI ' + o.err : '')); }
  return out;
}

/* ---------- CHAN DOAN MANG: vi sao 1 website khong ket noi duoc tu noi dang chay (DNS / TCP / TLS / HTTP) - chi in ma loi va thoi gian ---------- */
async function netDiag(ids, log = console.log, env = process.env) {
  const ALL = { ...require('./hunt-candidates'), ...sitesOf(env) }, dns = require('dns').promises, net = require('net');
  for (const id of ids.filter(i => ALL[i])) { const S = ALL[id], host = new URL(S.base).host, o = [];
    let ips = []; try { ips = await dns.resolve4(host); o.push('DNS ' + ips.length + ' dia chi'); } catch (e) { o.push('DNS loi ' + (e.code || e.name)); }
    if (ips.length) { const t0 = Date.now(); const r = await new Promise(res => { const sk = net.connect({ host: ips[0], port: 443, timeout: 12000 }); sk.on('connect', () => { sk.destroy(); res('TCP 443 mo sau ' + (Date.now() - t0) + ' ms'); }); sk.on('timeout', () => { sk.destroy(); res('TCP 443 het gio 12s (goi tin bi bo - thuong la chan theo vung/dai dia chi)'); }); sk.on('error', e => res('TCP 443 loi ' + (e.code || e.name))); }); o.push(r); }
    const t1 = Date.now(), r = await get(S.base + '/robots.txt', { timeout: 20000 }); o.push('HTTP robots.txt ' + r.status + (r.err ? ' (' + r.err + ')' : '') + ' sau ' + (Date.now() - t1) + ' ms');
    log(`${id.padEnd(14)} ${o.join(' · ')}`); }
}

module.exports = { run, liveRows, huntRows, siteStat, reachNote, probe, netDiag, loadAll, zoneOf, urlKey, hostOf, buildIndex, slugSkus, parsePage, sameItem, robotsOf, delayOf, cleanTitle, sitesOf, loadCache, saveCache, get, dueList, UA };
if (require.main === module) {
  const a = process.argv[2];
  const done = p => p.then(() => process.exit(0), e => { console.error(e); process.exit(1); });
  if (a === 'probe') done(probe(String(process.argv[3] || '').split(',').filter(Boolean)));
  else if (a === 'net') done(netDiag(String(process.argv[3] || '').split(',').filter(Boolean)));
  else if (a === 'stat') { const s = siteStat(); for (const [k, v] of Object.entries(s)) console.log(`${k.padEnd(14)} ${v.mode} · trang ${v.targets} · con moi ${v.fresh} · ngung ban ${v.gone} · khong doc duoc ${v.miss} · tuoi ${v.ageH == null ? '-' : v.ageH + 'h'}${v.fail ? ' · ' + v.fail : ''}`); }
  else done(run(parseFloat(a) || 45));
}
