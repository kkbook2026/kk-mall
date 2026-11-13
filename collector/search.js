'use strict';
/*
 * TIM GIA RE NHAT THEO TU KHOA tren cac san (CHI qua kenh chinh thuc - khong quet trang web cua san):
 *   - TikTok Shop : API tim san pham cua AccessTrade (v2/tiktokshop_product_feeds) - dung khoa ACCESSTRADE_KEY san co.
 *   - Shopee      : Shopee Affiliate Open API (productOfferV2, tim theo tu khoa) - can SHOPEE_APP_ID + SHOPEE_APP_SECRET
 *                   (dang ky tai affiliate.shopee.vn > Open API). Chua co khoa thi tu bo qua.
 * Datafeed cua AccessTrade khong tim duoc theo ten va chi co mot phan nho hang cua Shopee, nen muon biet
 * "san pham nay tren san dang re nhat bao nhieu" phai HOI TUNG SAN PHAM. Moi san gioi han toc do, vi vay chay xoay vong
 * (uu tien SP chua kiem tra / kiem tra lau nhat), luu ket qua vao bo nho dem ngoai git (GitHub Actions cache);
 * bo thu thap gia 3 gio/lan doc lai, ghep bang bo ghep cheo (match.js) roi moi dung de dinh gia.
 * Dung: node collector/search.js [phut_ngan_sach]            (c) 2026 Nguyen Duy Dien
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const MATCH = require('./match');
const CACHE = path.join(__dirname, '.search-cache', 'search.json.gz');
const API = path.join(__dirname, '..', 'site', 'api');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadCache() { try { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString('utf8')); if (c && c.items) return c; } catch { } return { v: 1, items: {}, stat: {} }; }
function saveCache(C) { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(C))); }

async function http(url, opt = {}, timeout = 25000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { ...opt, signal: ac.signal }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { } return { status: r.status, j }; }
  catch (e) { return { status: 0, j: null, err: String(e.message || e) }; }
  finally { clearTimeout(t); }
}
const num = v => { const n = Math.round(parseFloat(v)); return Number.isFinite(n) ? n : 0; };

/* ---------- cac san ---------- */
const PROVIDERS = {
  tiktok: {
    enabled: env => !!String(env.ACCESSTRADE_KEY || '').trim(),
    gap: env => parseInt(env.SEARCH_TT_GAP_MS || '2400', 10),       // 25 truy van/phut - duoi gioi han chinh thuc 30 yeu cau/phut cua AccessTrade, chua lai 5 cho viec khac
    async search(env, q) {
      const base = env.ACCESSTRADE_TT_API || 'https://api.accesstrade.vn/v2/tiktokshop_product_feeds';
      const r = await http(`${base}?title_keywords=${encodeURIComponent(q)}&sort_field=${encodeURIComponent(env.SEARCH_TT_SORT || 'RECOMMENDED')}&limit=20`,
        { headers: { Authorization: 'Token ' + String(env.ACCESSTRADE_KEY).trim(), 'Content-Type': 'application/json' } });
      const ps = (r.j && r.j.data && r.j.data.products) || [];
      return { status: r.status, items: ps.map(x => ({ n: String(x.title || ''), lo: num(x.sales_price && x.sales_price.minimum_amount), hi: num(x.sales_price && x.sales_price.maximum_amount),
        u: String(x.detail_link || ''), i: String(x.main_image_url || ''), shop: String((x.shop && x.shop.name) || ''), inv: x.has_inventory ? 1 : 0 })) };
    },
  },
  shopee: {
    enabled: env => !!(String(env.SHOPEE_APP_ID || '').trim() && String(env.SHOPEE_APP_SECRET || '').trim()),
    gap: env => parseInt(env.SEARCH_SHOPEE_GAP_MS || '2000', 10),   // gioi han cua Shopee: 2.000 truy van/gio
    /* Shopee Affiliate Open API (GraphQL). Chu ky: SHA256(AppId + Timestamp + Payload + Secret) */
    async search(env, q) {
      const base = env.SHOPEE_API || 'https://open-api.affiliate.shopee.vn/graphql';
      const app = String(env.SHOPEE_APP_ID).trim(), secret = String(env.SHOPEE_APP_SECRET).trim();
      const query = `{ productOfferV2(keyword: ${JSON.stringify(q)}, sortType: 1, page: 1, limit: 30) { nodes { itemId productName priceMin priceMax imageUrl productLink shopName shopId sales ratingStar } } }`;
      const payload = JSON.stringify({ query }), ts = Math.floor(Date.now() / 1000);
      const sig = crypto.createHash('sha256').update(app + ts + payload + secret).digest('hex');
      const r = await http(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${app}, Timestamp=${ts}, Signature=${sig}` }, body: payload });
      const errs = r.j && r.j.errors, ns = (r.j && r.j.data && r.j.data.productOfferV2 && r.j.data.productOfferV2.nodes) || [];
      const status = errs && errs.length ? (/(rate|limit|10030)/i.test(JSON.stringify(errs)) ? 429 : 400) : r.status;
      return { status, err: errs ? JSON.stringify(errs).slice(0, 160) : '', items: ns.map(x => ({ n: String(x.productName || ''), lo: num(x.priceMin), hi: num(x.priceMax),
        u: String(x.productLink || ''), i: String(x.imageUrl || ''), shop: String(x.shopName || ''), inv: 1 })) };
    },
  },
};

/* Tu khoa tim: co ma model manh -> "<thuong hieu> <ma model>" (ngan, trung dich); khong co -> 8 tu dau cua ten da lam sach */
function queryOf(name, f) {
  const raw = String(name || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (f && f.strong.length) {
    const want = f.strong[0];
    const tok = raw.split(/\s+/).find(t => { const c = MATCH.codeOf(MATCH.nd(t).replace(/^[(\-/.]+|[)\-/.,]+$/g, '')); return c && (c.full === want.full || c.core === want.core); });
    if (tok) {
      const words = raw.split(/\s+/); const i = words.indexOf(tok);
      const brand = words.slice(0, i).reverse().find(w => MATCH.brandsOf(MATCH.nd(w)).size) || (i > 0 ? words[i - 1] : '');
      return (brand + ' ' + tok.replace(/[,;]+$/, '')).trim();
    }
  }
  return raw.replace(/[-–|,/]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
}
/* SP dang tim: co ma model (manh hoac yeu) - ten thuan chu (sach, thoi trang...) khong ghep duoc voi tieu de tren san nen bo qua */
const eligible = f => f.strong.length > 0 || [...f.ids].some(t => !t.startsWith('§'));

/* Gia cua 1 ket qua: 1 muc gia -> dung luon; khoang gia hep (<= 15%) -> lay muc cao (than trong); khoang rong = nhieu bien the -> bo */
function priceOf(it) { if (!(it.lo > 0)) return 0; if (!(it.hi > 0) || it.hi === it.lo) return it.lo; return it.hi <= 1.15 * it.lo ? it.hi : 0; }

async function run(minutes = 110, env = process.env, log = console.log) {
  const provs = Object.keys(PROVIDERS).filter(k => PROVIDERS[k].enabled(env) && !String(env.SEARCH_DISABLE || '').split(',').includes(k));
  if (!provs.length) { log('Khong co khoa cho san nao (ACCESSTRADE_KEY / SHOPEE_APP_ID+SECRET) - bo qua.'); return null; }
  const cat = JSON.parse(fs.readFileSync(path.join(API, 'catalog-full.json'), 'utf8'));
  const IDX = MATCH.createIndex(); for (const p of cat) IDX.add(p.sku, p.name, p.grp);
  const C = loadCache(), deadline = Date.now() + minutes * 60e3, live = new Set(cat.map(p => p.sku));
  for (const sku of Object.keys(C.items)) if (!live.has(sku)) delete C.items[sku];                 // SP da go khoi cua hang
  const pool = cat.filter(p => eligible(IDX.features(p.sku)));
  const res = {};
  await Promise.all(provs.map(async prov => {
    const P = PROVIDERS[prov], st = res[prov] = { n: 0, got: 0, items: 0, priced: 0, hit: 0, offers: 0, e429: 0, err: 0, eligible: pool.length };
    const ent = p => (C.items[p.sku] || {})[prov], last = p => (ent(p) || {}).at || 0, t00 = Date.now();
    /* Thu tu hoi (lich cua GitHub hay bi tre/bo nen moi lan chay phai dung ngan sach vao cho co gia tri nhat):
     *  0 - SP DANG CO offer khop (dang tham gia dinh gia) va da qua SEARCH_REFRESH_H gio -> lam moi truoc, de gia dung khong bi cu
     *  1 - SP chua tung hoi (gia tri cao truoc)        2 - con lai, lau nhat truoc */
    const REFRESH = parseFloat(env.SEARCH_REFRESH_H || '8') * 3600e3;
    const pri = p => { const e = ent(p); if (!e) return 1; return e.offers && e.offers.length && t00 - e.at >= REFRESH ? 0 : 2; };
    // SP chua tung hoi: thu tu gia ngau nhien co dinh theo ma SP (trai deu moi nhom hang, moi tam gia) - xep theo gia giam dan thi cac lan dau chi hoi
    // toan hang tram trieu dong, loai hang gan nhu khong co tren san
    const mix = sku => parseInt(crypto.createHash('md5').update(prov + sku).digest('hex').slice(0, 8), 16);
    const queue = pool.slice().sort((a, b) => (pri(a) - pri(b)) || (last(a) - last(b)) || (mix(a.sku) - mix(b.sku)));
    let gap = P.gap(env), fails = 0, c429 = 0;
    for (const p of queue) {
      if (Date.now() > deadline) break;
      const t0 = Date.now(), f = IDX.features(p.sku), q = queryOf(p.name, f);
      const r = await P.search(env, q);
      if (r.status === 429) { st.e429++; gap = Math.min(8000, Math.round(gap * 1.3));                                     // qua nhanh: gian nhip, bo qua SP nay (lan sau thu lai)
        if (++c429 >= 25) { log(`[${prov}] dung som: bi gioi han toc do keo dai (HTTP 429 x${c429})`); break; } await sleep(15000); continue; }
      c429 = 0;
      if (r.status !== 200) { st.err++; if (++fails >= 12) { log(`[${prov}] dung som: loi lien tiep (HTTP ${r.status}${r.err ? ' ' + r.err : ''})`); break; } await sleep(3000); continue; }
      fails = 0; st.n++; if (r.items.length) st.got++; st.items += r.items.length;
      const offers = [];
      for (const it of r.items) {
        if (!it.inv || !it.n || !/^https:\/\//.test(it.u)) continue;
        const price = priceOf(it); if (!price) continue;
        st.priced++;
        // loc so bo bang rang buoc cung cua bo ghep (chua co ngu lieu offer day du) - bo thu thap gia se xac nhan lai lan nua truoc khi dung
        const sc = MATCH.score(f, MATCH.features(it.n)); if (!(sc >= 0.6)) continue;
        offers.push({ n: it.n.slice(0, 160), p: price, u: it.u, i: it.i, shop: it.shop.slice(0, 60), sc });
      }
      offers.sort((a, b) => a.p - b.p);
      (C.items[p.sku] = C.items[p.sku] || {})[prov] = { at: Date.now(), q, offers: offers.slice(0, 3) };
      if (offers.length) { st.hit++; st.offers += offers.length; }
      if (st.n % 200 === 0) { C.savedAt = Date.now(); saveCache(C); }
      await sleep(Math.max(0, gap - (Date.now() - t0)));
    }
    log(`[${prov}] hoi ${st.n} SP · san tra ket qua cho ${st.got} SP (${st.items} tin, ${st.priced} tin con hang co 1 muc gia) · co offer KHOP ${st.hit} SP · 429: ${st.e429} · loi: ${st.err} · nhip ${gap}ms · SP du dieu kien ${st.eligible}`);
  }));
  C.savedAt = Date.now(); C.stat = { at: C.savedAt, res }; saveCache(C);
  let tot = 0, withOffer = 0; for (const v of Object.values(C.items)) for (const e of Object.values(v)) { tot++; if (e.offers && e.offers.length) withOffer++; }
  log(`Bo nho dem tim kiem: ${tot} luot SP-san · ${withOffer} co offer khop`);
  return res;
}

/* Doc offer cho bo thu thap chinh: [{ sku, src, name, price, url, image, shop, stock, stale, ageH }]. Ket qua cu hon maxAgeH bi bo; > 12h cong du phong 1% */
function rows(maxAgeH = 60) {
  const C = loadCache(), now = Date.now(), out = [];
  for (const [sku, v] of Object.entries(C.items || {})) for (const [src, e] of Object.entries(v)) {
    if (!e || !e.offers || !e.offers.length || now - e.at > maxAgeH * 3600e3) continue;
    for (const o of e.offers) out.push({ sku, src, name: o.n, price: o.p, url: o.u, image: o.i, shop: o.shop, stock: 1, stale: now - e.at > 12 * 3600e3 ? 1 : 0, ageH: Math.round((now - e.at) / 3600e3) });
  }
  return out;
}
function stat() { const C = loadCache(); return C.stat || {}; }

module.exports = { PROVIDERS, run, rows, stat, queryOf, priceOf, eligible, loadCache, saveCache, CACHE };
if (require.main === module) run(parseFloat(process.argv[2]) || 110).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
