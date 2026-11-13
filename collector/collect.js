'use strict';
/*
 * KK-MALL CLOUD COLLECTOR - chay tren GitHub Actions moi 3 gio, 24/7,
 * khong phu thuoc may tinh hay trinh duyet cua chu shop.
 * Nhiem vu: thu thap/cap nhat gia & ton kho cho toan bo catalog cua site,
 * tinh lai gia ban va NOI DAI SO CAI GIA (hash-chain) roi xuat ra site/.
 * Cau hinh dinh gia noi bo lay tu bien moi truong ma hoa (GitHub Secret) - khong nam trong ma nguon.
 * (c) Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ULOG = require('./update-log'); // nhat ky cap nhat (ma hoa trong goi quan tri)
const FEEDS = require('./feeds');      // datafeed chinh thuc (affiliate/doi tac) - nap song song
const TRUST = require('./trust');      // Bo loc Tin cay gia (anomaly detection) + Merkle
const { publish } = require('./publish');

const SITE = path.join(__dirname, '..', 'site');
const API = path.join(SITE, 'api');
const PRICING = require('./pricing').create(process.env); // bieu loi theo bac gia - bi mat kinh doanh, tu GitHub Secret
const LANDEDM = require('./landed');
const RETAIL = require('./retail');
const SEARCH = require('./search');                       // gia tim theo tu khoa tren san (TikTok Shop / Shopee) - doc bo nho dem
const MATCH = require('./match');                         // bo ghep cheo nguon: cung 1 san pham o nhieu noi -> so gia                       // gia cong khai website ban le (Hoang Ha, Phuc Anh, An Phat)                      // gia thuc tra = gia nguon + ship uoc tinh (tu hieu chinh tu PO that)
const CYCLE_MIN = 180;                                   // chu ky thu thap: 3 gio/lan
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));
const wj = (f, d) => fs.writeFileSync(path.join(API, f), JSON.stringify(d));
const round1000 = v => Math.round(v / 1000) * 1000;
// URL anh dung duoc: https + KHONG phai host test/staging cua san (hay chet, khong hien tren web)
const BAD_IMG_HOST = /^https:\/\/(vn-test-\d+\.slatic\.net|lzd-staging[^/]*|[^/]*staging[^/]*\.oss-[^/]*\.aliyuncs\.com|[^/]*sandbox[^/]*)\//i;
const goodImg = u => typeof u === 'string' && /^https:\/\//.test(u) && !BAD_IMG_HOST.test(u);
const { isFreeship } = require('./match');   // 'Freeship' trong ten chi duoc tinh khi KHONG kem dieu kien (khu vuc, gia tri don, chuong trinh co tran)
const FS_RE = { test: n => isFreeship(n) };
const HIST_RUNS = Math.max(1, parseInt(process.env.HIST_OVERRIDE_RUNS || '3', 10)), HIST_HOURS = Math.max(0, parseFloat(process.env.HIST_OVERRIDE_HOURS || '20'));

// PRNG deterministic theo chu ky - gia nguon dao dong nhu thi truong that
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash32 = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

(async () => {
  const now = new Date().toISOString();
  const seed = Math.floor(Date.now() / (CYCLE_MIN * 60000));
  const meta = rj('meta.json');
  const full = rj('catalog-full.json');
  let seq = (meta.ledgerHead && meta.ledgerHead.seq) || 0;
  let changed = 0, outOfStock = 0;
  const adminRows = [];
  const t0 = Date.now();
  const run = ULOG.newRun();
  const seqFrom = seq;

  /* ===== DATAFEED CHINH THUC: tai song song moi feed, khop/tao san pham ===== */
  const FIDX_FILE = path.join(__dirname, 'feed-index.json');   // ten chuan hoa -> SKU (giu on dinh SKU giua cac lan chay)
  const fidx = fs.existsSync(FIDX_FILE) ? JSON.parse(fs.readFileSync(FIDX_FILE, 'utf8')) : { map: {}, origin: {} };
  const MAX_TOTAL = parseInt(process.env.FEED_MAX_TOTAL || '30000', 10), MAX_NEW = parseInt(process.env.FEED_MAX_NEW || '5000', 10);
  const feed = await FEEDS.collectFeeds(process.env);
  /* ===== GIA BAN LE CONG KHAI: doc bo nho dem do retail.js thu (khong tai lai o day) ===== */
  const medOf = a => { const x = a.slice().sort((p, q) => p - q); return x.length ? x[x.length >> 1] : null; };
  { let n = 0, un = 0; const per = feed.stat.per = feed.stat.per || {}, ages = {}, SS = RETAIL.siteStat();
    for (const src of Object.keys(RETAIL.SITES)) { per[src] = { total: SS[src].pages, n: 0, age: null }; ages[src] = []; }   // website khong doc duoc (may chu tu choi) van hien 0 de quan tri thay
    for (const r of RETAIL.rows(FEEDS)) {
      if (!r.name || r.name.length < 6 || r.price < 1000 || r.price > 2e9) continue;
      r.grp = FEEDS.classify(r.name, r.cat); if (!r.grp) { un++; continue; }
      r.key = FEEDS.normKey(r.name); feed.offers.push(r); n++; if (per[r.src]) { per[r.src].n++; ages[r.src].push(r.ageH || 0); } }
    for (const src of Object.keys(ages)) { const m = medOf(ages[src]); if (m != null) per[src].age = +(m / 24).toFixed(1); }
    feed.stat.retail = n; feed.stat.retailUnclassified = un; console.log(`Gia ban le cong khai: ${n} offer (bo ${un} chua phan loai)`); }
  const SHIP = LANDEDM.create(process.env, await LANDEDM.fetchStats(process.env)); console.log('Gia thuc tra: ' + SHIP.desc);
  const CHAIN = await LANDEDM.fetchChainHead(process.env); console.log('Chuoi bam may chu: ' + (CHAIN ? '#' + CHAIN.seq + ' ' + CHAIN.hash.slice(0, 12) : 'khong lay duoc'));
  const REVIEWS = await LANDEDM.fetchReviewStats(process.env); console.log('Danh gia that: ' + (REVIEWS ? Object.keys(REVIEWS).length + ' SP co danh gia' : 'khong lay duoc - giu thong ke cu'));
  /* ===== GIA TIM THEO TU KHOA (TikTok Shop qua AccessTrade, Shopee Affiliate khi co khoa): doc bo nho dem do search.js thu ===== */
  const SROWS = SEARCH.rows(); feed.stat.search = SROWS.length;
  { const per = feed.stat.per = feed.stat.per || {}, by = {}; for (const r of SROWS) (by[r.src] = by[r.src] || []).push(r.ageH || 0);
    for (const [src, a] of Object.entries(by)) { const e = per[src] = per[src] || { total: 0, n: 0, age: null }; e.total += a.length; e.n += a.length; e.age = +(medOf(a) / 24).toFixed(1); } }
  console.log(`Gia tim theo tu khoa tren san: ${SROWS.length} offer` + (SROWS.length ? ' (' + Object.entries(SROWS.reduce((a, r) => (a[r.src] = (a[r.src] || 0) + 1, a), {})).map(x => x.join(':')).join(', ') + ')' : ''));

  /*
   * ===== GHEP OFFER VAO SAN PHAM =====
   *  exBySku : offer KHOP CHINH XAC (cung khoa ten da luu -> cung SKU)
   *  fzBySku : offer GHEP CHEO MO (cung san pham, ten viet khac / nguon khac) kem diem tin cay cua match.js
   * Truoc day moi ten la 1 san pham rieng nen 89% san pham chi co DUNG 1 nguon -> "gia re nhat" thuc chat la gia cua nguon duy nhat.
   */
  const exBySku = new Map(), fzBySku = new Map();
  const pushM = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); };
  const MIN_FZ = parseFloat(process.env.MATCH_MIN_SCORE || '0.6');
  feed.stat.matched = 0; feed.stat.added = 0; feed.stat.capped = 0; feed.stat.split = 0; feed.stat.unlinked = 0; feed.stat.fuzzyKeys = 0; feed.stat.lowPrice = 0;
  if (feed.offers.length) {
    const fullBySku = new Map(full.map(p => [p.sku, p]));
    const byName = {}; for (const p of full) byName[FEEDS.normKey(p.name)] = p.sku;
    const g2c = {}; for (const p of full) g2c[p.grp] = [p.category_id, p.category_name];
    const exists = sku => fullBySku.has(sku) && fs.existsSync(path.join(API, 'products', sku + '.json'));
    const IDX = MATCH.createIndex(); for (const p of full) IDX.add(p.sku, p.name, p.grp);
    const featC = new Map(), feat = n => { let f = featC.get(n); if (!f) featC.set(n, f = MATCH.features(n)); return f; };
    const sigOf = n => MATCH.signature(feat(n));
    /* (1) Gom theo khoa ten. normKey bo noi dung trong ngoac nen "Tủ lạnh ... 2021 (RF48A4000B4/SV)" va "(RF48A4010M9/SV)", hay CPU ban Box va
     *     "(Tray NK không kèm Tản)" tung bi gop lam 1 san pham roi lay gia re nhat cua ca 2 -> tach nhom theo chu ky bien the (ma model, bien the, mau, tinh trang, so luong). */
    const groups0 = {}; for (const o of feed.offers) (groups0[o.key] = groups0[o.key] || []).push(o);
    const groups = new Map();
    for (const [key, offs] of Object.entries(groups0)) {
      const bySig = new Map(); for (const o of offs) pushM(bySig, sigOf(o.name), o);
      if (bySig.size === 1) { groups.set(key, offs); continue; }
      feed.stat.split++;
      const sku0 = fidx.map[key] || byName[key], own = sku0 && fullBySku.has(sku0) ? sigOf(fullBySku.get(sku0).name) : null;
      for (const [sg, a] of bySig) { const k = own != null && sg === own ? key : key + ' #' + sg; groups.set(k, a); for (const o of a) o.key = k; }
    }
    for (const offs of groups.values()) { const seenN = new Set(); for (const o of offs) if (!seenN.has(o.name)) { seenN.add(o.name); IDX.addCorpus(o.name, o.grp, feat(o.name)); } }   // ngu lieu thong ke tu
    /* (2) Khop chinh xac theo khoa da luu / ten san pham. Kiem tra lai lien ket cu: ten offer va ten SP khong duoc xung dot ma model,
     *     tinh trang (cu/moi)...; lien ket khac ten (tao boi luat "ma model duy nhat" truoc day) phai dat duong S cua bo ghep. */
    const skuOf = new Map(), pending = [];
    for (const [key, offs] of groups) {
      let sku = fidx.map[key] || byName[key];
      if (sku && !exists(sku)) sku = null;
      if (sku) { const p = fullBySku.get(sku), rep = offs.find(o => o.stock) || offs[0];
        if (!MATCH.linkValid(feat(p.name), feat(rep.name), key.replace(/ #.*$/, '') === FEEDS.normKey(p.name))) { sku = null; delete fidx.map[key]; feed.stat.unlinked++; } }
      if (sku) { skuOf.set(key, sku); fidx.map[key] = sku; feed.stat.matched++; for (const o of offs) pushM(exBySku, sku, o); }
      else pending.push([key, offs]);
    }
    /* (3) Ten chua co san pham: neu ghep mo duoc vao san pham da co -> la offer cua san pham do (khong tao trung);
     *     con lai moi la ung vien san pham moi - uu tien hang co nhieu nguon va gia tri cao, co tran de site khong vuot gioi han GitHub Pages. */
    const NEW_MIN_PRICE = parseInt(process.env.NEW_MIN_PRICE || '100000', 10);
    const maxTotal = Math.min(MAX_TOTAL, parseInt(process.env.FEED_HARD_MAX || '36000', 10));
    const repOf = offs => offs.find(o => o.stock) || offs[0];
    const cands = [];
    for (const [key, offs] of pending) { const rep = repOf(offs); if (IDX.find(rep.name, rep.grp, MIN_FZ, feat(rep.name)).length) feed.stat.fuzzyKeys++; else cands.push([key, offs]); }
    const minP = offs => Math.min(...offs.map(o => o.price)), nSrc = offs => new Set(offs.map(o => o.src)).size;
    cands.sort((x, y) => (nSrc(y[1]) - nSrc(x[1])) || (minP(y[1]) - minP(x[1])));
    let nextId = Math.max(...full.map(p => parseInt(p.sku.slice(2), 10) || 0)) + 1;
    for (const [key, offs] of cands) {
      const rep = repOf(offs);
      if (IDX.find(rep.name, rep.grp, MIN_FZ, feat(rep.name)).length) { feed.stat.fuzzyKeys++; continue; }   // trung voi SP vua tao trong chinh lan chay nay
      if (feed.stat.added >= MAX_NEW || full.length >= maxTotal) { feed.stat.capped++; continue; }
      const best = offs.filter(o => o.stock).sort((a, b) => a.price - b.price)[0] || offs[0];
      const withImg = offs.find(o => goodImg(o.image));
      if (!withImg || best.price < NEW_MIN_PRICE) { feed.stat.capped++; continue; }           // chi nhan hang co anh that; hang gia tri thap khong tu them (phi co dinh/mon lam gia doi qua cao)
      const [cid, cname] = g2c[best.grp] || ['khac', 'Khác'];
      const sku = 'KK' + String(nextId++).padStart(6, '0');
      const name = TRUST.cleanText(best.name).replace(/\s*[-–|]\s*(hàng chính hãng|chính hãng|hàng nhập khẩu)\s*$/i, '').slice(0, 140);
      const brand = (offs.find(o => o.brand) || {}).brand || name.split(' ').find(w => /^[A-Z][A-Za-z0-9&.-]{1,}$/.test(w)) || 'KK Select';
      const base = offs.map(o => o.list || o.price).sort((a, b) => a - b)[Math.floor(offs.length / 2)];
      const initKK = PRICING.ok ? PRICING.sell(Math.min(...offs.map(o => SHIP.landed(o.src, o.price, best.grp, { freeship: isFreeship(o.name), name: o.name })))) : base; // gia thuc tra, khong bao gio de 0d
      const slug = FEEDS.normKey(name).replace(/ /g, '-').slice(0, 80) + '-' + sku.toLowerCase();
      const d = { id: nextId - 1, sku, spu_id: nextId - 1, variant: '', name, slug, category_id: cid, category_name: cname, grp: best.grp, brand,
        image: withImg.image, description: name + ' chính hãng, mới 100%. Giá được KK-MALL so sánh và cập nhật tự động 3 giờ/lần.',
        specs: { 'Thương hiệu': brand, 'Bảo hành': 'Theo chính sách của hãng' }, base_price: base, rating: 0, sold: 0, stock_qty: null,
        kk_price: initKK, in_stock: 0, active: 1, updated_at: now, ledger: [], related: [], variants: [{ sku, variant: '', kk_price: initKK, in_stock: 0 }], reviews: [], reviewStat: { n: 0, avg: null } };
      fs.writeFileSync(path.join(API, 'products', sku + '.json'), JSON.stringify(d));
      const fe = { sku, name, slug, category_id: cid, category_name: cname, grp: best.grp, brand, variant: '', image: withImg.image, base_price: base, kk_price: initKK, in_stock: 0, stock_qty: 50, rating: 4.6, sold: 0, updated_at: now };
      full.push(fe); fullBySku.set(sku, fe); IDX.add(sku, name, best.grp);
      fidx.origin[sku] = 1; fidx.map[key] = sku; skuOf.set(key, sku); feed.stat.added++;
      for (const o of offs) pushM(exBySku, sku, o);
    }
    /* (4) GHEP CHEO: moi ten offer duoc tim trong toan bo san pham; khop san pham KHAC san pham cua chinh no -> them lam offer ghep mo.
     *     Nho vay cung 1 mat hang ban o nhieu noi (ten viet khac nhau) duoc so gia voi nhau. */
    for (const [key, offs] of groups) {
      const own = skuOf.get(key), rep = repOf(offs);
      const ms = IDX.find(rep.name, rep.grp, MIN_FZ, feat(rep.name));
      for (const m of ms) if (m.id !== own) for (const o of offs) pushM(fzBySku, m.id, { o, sc: m.score });
      // PHAN LOAI LAI san pham tu feed neu luat moi xep nhom khac
      if (own && fidx.origin[own]) { const bestG = rep.grp, fe = fullBySku.get(own);
        if (fe && fe.grp !== bestG && g2c[bestG]) { const [cid, cname] = g2c[bestG]; fe.grp = bestG; fe.category_id = cid; fe.category_name = cname;
          const pf = path.join(API, 'products', own + '.json'); const pd = JSON.parse(fs.readFileSync(pf, 'utf8')); pd.grp = bestG; pd.category_id = cid; pd.category_name = cname; fs.writeFileSync(pf, JSON.stringify(pd));
          feed.stat.reclassified = (feed.stat.reclassified || 0) + 1; } }
    }
    /* (5) Offer tim theo tu khoa (da gan san cho 1 SKU): xac nhan lai bang bo ghep hien hanh roi moi dung */
    for (const r of SROWS) { const p = fullBySku.get(r.sku); if (!p) continue;
      const m = IDX.find(r.name, p.grp, MIN_FZ).find(m => m.id === r.sku); if (!m) continue;
      pushM(fzBySku, r.sku, { o: { src: r.src, price: r.price, stock: 1, url: r.url, image: r.image, name: r.name, stale: r.stale }, sc: m.score }); }
    feed.stat.fuzzySku = fzBySku.size;
  }
  if (feed.dropKeys && feed.dropKeys.size) {
    const rm = new Set();
    for (const k of feed.dropKeys) { const sku = fidx.map[k]; if (sku && fidx.origin[sku] && !exBySku.has(sku)) { rm.add(sku); delete fidx.map[k]; delete fidx.origin[sku]; } }
    if (rm.size) {
      for (let i = full.length - 1; i >= 0; i--) if (rm.has(full[i].sku)) { try { fs.unlinkSync(path.join(API, 'products', full[i].sku + '.json')); } catch {} full.splice(i, 1); }
      feed.stat.removed = rm.size;
    }
  }
  /* ===== GO SAN PHAM KHONG CON NGUON: khong offer nao (chinh xac lan ghep mo) trong RETIRE_RUNS lan chay khoe lien tiep =====
   * (vd hang chi co o feed da chet nhieu nam cua Lazada/Sendo/Dien May Cho Lon - gia do khong mua duoc that) */
  { fidx.miss = fidx.miss || {}; fidx.srcN = fidx.srcN || {};
    /* Chi go khi lan chay KHOE: khong nguon nao loi, va khong nguon nao TUT so ban ghi qua nua so voi lan khoe gan nhat
     * (feed tra thieu, bo nho dem ban le/tim kiem bi mat...) - neu khong se go oan hang loat san pham roi tao lai voi ma moi. */
    const cntBySrc = {}; for (const o of feed.offers) cntBySrc[o.src] = (cntBySrc[o.src] || 0) + 1;
    const shrunk = Object.entries(fidx.srcN).filter(([src, n]) => n >= 200 && (cntBySrc[src] || 0) < 0.5 * n).map(([src, n]) => `${src} ${cntBySrc[src] || 0}/${n}`);
    if (shrunk.length) { feed.stat.shrunk = shrunk; console.log('CANH BAO: nguon tut so ban ghi qua nua so voi lan khoe gan nhat -> lan nay KHONG go san pham: ' + shrunk.join(', ')); }
    const healthy = feed.offers.length > 0 && !feed.stat.fail.length && !shrunk.length, RETIRE_RUNS = Math.max(1, parseInt(process.env.RETIRE_RUNS || '8', 10)), rm = new Set();
    if (healthy) fidx.srcN = cntBySrc;
    if (healthy) for (const p of full) {
      if (!fidx.origin[p.sku]) continue;
      if (exBySku.has(p.sku) || fzBySku.has(p.sku)) { delete fidx.miss[p.sku]; continue; }
      const n = (fidx.miss[p.sku] || 0) + 1; fidx.miss[p.sku] = n; if (n >= RETIRE_RUNS) rm.add(p.sku);
    }
    if (rm.size) {
      for (let i = full.length - 1; i >= 0; i--) if (rm.has(full[i].sku)) { try { fs.unlinkSync(path.join(API, 'products', full[i].sku + '.json')); } catch {} full.splice(i, 1); }
      for (const k of Object.keys(fidx.map)) if (rm.has(fidx.map[k])) delete fidx.map[k];
      for (const sku of rm) { delete fidx.origin[sku]; delete fidx.miss[sku]; }
    }
    feed.stat.retired = rm.size; feed.stat.missing = Object.keys(fidx.miss).length; }
  if (feed.stat.sources) console.log(`Feed: ${feed.stat.ok}/${feed.stat.sources} nguon · ${feed.stat.items} ban ghi · khop ${feed.stat.matched} · ghep mo ${feed.stat.fuzzyKeys} ten vao ${feed.stat.fuzzySku || 0} SP · tach ${feed.stat.split} nhom gop sai · go lien ket sai ${feed.stat.unlinked} · them moi ${feed.stat.added} · phan loai lai ${feed.stat.reclassified || 0} · go ${(feed.stat.removed || 0) + feed.stat.retired} (cho go: ${feed.stat.missing})`
    + (feed.stat.stale && feed.stat.stale.length ? ' · FEED CU BI BO: ' + feed.stat.stale.join(', ') : '') + (feed.stat.fail.length ? ' · LOI: ' + feed.stat.fail.join('; ') : ''));
  if (feed.stat.per) console.log('Feed theo nguon: ' + Object.entries(feed.stat.per).map(([k, v]) => `${k} ${v.n}/${v.total}${v.age != null ? ' (' + v.age + ' ngay)' : ''}`).join(' · '));

  /*
   * NGUON DU LIEU:
   *  - Co khoa API/feed doi tac (SHOPEE_*, LAZADA_*, TIKTOK_*, TIKI_*, SENDO_FEED_URL... dat trong Secrets)
   *    -> goi kenh chinh thuc de lay gia that (hook: collectors/sources.js).
   *  - Chua co khoa -> che do MO PHONG thi truong: gia tung nguon dao dong deterministic quanh gia tham chieu,
   *    giu he thong song that 3 gio/lan; khi dien Secrets la chay du lieu that, khong doi ma.
   */
  const docs = new Map(), leaves = [], recent = [], changedSlugs = [];
  const trustStat = { dropped: 0, hold: 0 };
  for (const p of full) {
    const f = path.join(API, 'products', p.sku + '.json');
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    // Danh sach nguon noi bo (khong cong bo ra du lieu tinh)
    const sources = ['dienmayxanh', 'thegioididong', 'fptshop', 'cellphones', 'dienmaycholon', 'tiki', 'shopee', 'tiktok', 'lazada', 'sendo'];
    // gia nguon tot nhat chu ky nay
    let best = null, bestSrc = null; let offerState = [];
    const exOffers = exBySku.get(p.sku) || [], fzOffers = fzBySku.get(p.sku) || [], lowOffers = [];
    if (exOffers.length || fzOffers.length || fidx.origin[p.sku]) {
      // GIA THAT tu kenh chinh thuc (san pham tu feed khong co gia mo phong; mat khoi feed => tam het hang)
      const toState = (o, extra) => ({ source: o.src, price: o.price, in_stock: o.stock ? 1 : 0, url: o.url, image: o.image, name: o.name, fetched_at: now, fs: FS_RE.test(o.name || '') ? 1 : 0, st: o.stale ? 1 : 0, ...extra });
      /* Offer ghep mo phai qua 2 chot truoc khi duoc so gia:
       *  - NGUOI BAN: chuoi ban le / 1 shop chi niem yet moi SP 1 lan -> offer ghep mo tu chinh nguoi ban da co offer chinh xac la SP KHAC -> bo
       *  - DAI GIA : so voi gia neo (trung vi offer chinh xac; khong co thi gia nguon ky truoc), toi da 160% gia neo. San duoi:
       *              trung DAY DU ma hang nha san xuat (>= 0.92) tai CHUOI BAN LE chinh hang: 30% (datafeed cua mot so chuoi chi co gia NIEM YET,
       *              khong gom khuyen mai, co the gap doi gia dang ban thuc te o chuoi khac - san 50% se loai oan gia re that);
       *              trung ma model (>= 0.9): 50%; ghep theo ten: 70%. Re hon san -> KHONG dung dinh gia, liet ke trong goi quan tri de duyet tay. */
      const exSellers = new Set(exOffers.map(o => MATCH.sellerOf(o.src, o.url)).filter(Boolean));
      const fz = fzOffers.filter(x => { if (!x.o.stock) return false; const sl = MATCH.sellerOf(x.o.src, x.o.url); return !(sl && exSellers.has(sl)); });
      const exLive = exOffers.filter(o => o.stock).map(o => o.price);
      const prev = PRICING.ok && d.in_stock && d.kk_price > 0 ? PRICING.toCost(d.kk_price) - (d.sh || 0) : 0;   // gia niem yet cua nguon ky truoc lam neo du phong
      const wrap = a => a.map(x => ({ price: x.o.price, source: x.o.src, x }));
      const sure = x => x.sc >= 0.92 && MATCH.SINGLE_SELLER.has(x.o.src);
      // Gia neo CHI gom gia NIEM YET tu datafeed khong co khuyen mai (2 chuoi dung chung 1 bang gia): offer cua chuoi ban le khac
      // ghep theo ma model yeu + thuong hieu (0.7..0.9) duoc nhan tu 45% gia neo thay vi 70%.
      const exL = exOffers.filter(o => o.stock), listOnly = exL.length > 0 && exL.every(o => o.src === 'thegioididong' || o.src === 'dienmayxanh');
      const retailW = x => listOnly && x.sc >= 0.7 && x.sc < 0.9 && MATCH.SINGLE_SELLER.has(x.o.src);
      const bT = MATCH.band(exLive, wrap(fz.filter(sure)), 0.3, prev), bS = MATCH.band(exLive, wrap(fz.filter(x => x.sc >= 0.9 && !sure(x))), 0.5, prev),
        bR = MATCH.band(exLive, wrap(fz.filter(retailW)), 0.45, prev), bW = MATCH.band(exLive, wrap(fz.filter(x => x.sc < 0.9 && !retailW(x))), 0.7, prev);
      for (const k of ['ok', 'low', 'high']) bW[k] = bW[k].concat(bR[k]);
      const per = {}, consider = st => { const cur = per[st.source]; if (!cur || (st.in_stock && (!cur.in_stock || st.price < cur.price))) per[st.source] = st; };
      for (const o of exOffers) consider(toState(o));
      for (const y of bT.ok.concat(bS.ok, bW.ok)) consider(toState(y.x.o, { fz: y.x.sc }));
      offerState = Object.values(per);
      for (const y of bT.low.concat(bS.low, bW.low)) lowOffers.push({ ...toState(y.x.o, { fz: y.x.sc }), x: 'Ghép chéo: rẻ bất thường so với giá neo - chưa dùng định giá, cần duyệt tay' });
      trustStat.low = (trustStat.low || 0) + lowOffers.length;
      // offer ghep cheo DAT hon 1,6 lan gia neo: khong anh huong gia re nhat -> chi liet ke 1 dong/nguon de quan tri tham khao (neu nguon do chua co offer hop le)
      { const seenH = new Set(Object.keys(per)); for (const y of bT.high.concat(bS.high, bW.high).sort((a, b) => a.price - b.price)) { const src = y.x.o.src; if (seenH.has(src)) continue; seenH.add(src);
          lowOffers.push({ ...toState(y.x.o, { fz: y.x.sc }), x: 'Ghép chéo: đắt hơn 1,6 lần giá neo (giá niêm yết cao hoặc bản khác) - không dùng' }); } }
      for (const o of offerState) { o.ship = SHIP.shipFor(o.source, o.price, p.grp, { freeship: o.fs, stale: o.st, name: p.name }); o.landed = o.price + o.ship; }
    } else for (const src of sources) {
      const rnd = mulberry32((seed + hash32(p.sku + src)) >>> 0);
      const price = round1000(d.base_price * (0.91 + rnd() * 0.18));
      const inStock = rnd() > 0.06 ? 1 : 0;
      offerState.push({ source: src, price, in_stock: inStock, fetched_at: now, ship: 0, landed: price });
    }
    /* ===== BO LOC TIN CAY: loai offer ngoai lai truoc khi chon gia ===== */
    let flt = TRUST.filterOffers(d, offerState, PRICING.ok ? PRICING.toCost : 0);
    /* TU CHUA LICH SU SAI: offer bi loai CHI vi lech > 50% / > 2,5 lan so voi lich su niem phong, nhung den tu CHUOI BAN LE chinh hang
     * (khop chinh xac hoac trung day du ma hang) va LAP LAI cung muc gia qua >= HIST_OVERRIDE_RUNS lan chay trong >= HIST_OVERRIDE_HOURS gio
     * => lich su cu sai (tung lay nham gia) hoac gia thi truong da doi that -> dat lai moc tham chieu (d.href), khong sua lich su niem phong.
     * Truoc day cac san pham nay bi giu gia cu / het hang VINH VIEN vi gia bi giu thi lich su khong bao gio cap nhat. */
    if (exOffers.length || fzOffers.length) { const hk = fidx.hist = fidx.hist || {};
      const cand = flt.dropped.filter(o => o.in_stock && /lịch sử niêm phong/.test(o.why || '') && MATCH.SINGLE_SELLER.has(o.source) && (!o.fz || o.fz >= 0.92)).sort((a, b) => a.landed - b.landed)[0];
      if (cand) { const e = hk[p.sku], same = e && Math.abs(cand.price - e.p) <= 0.1 * e.p, cur = same ? { p: e.p, n: e.n + 1, t: e.t } : { p: cand.price, n: 1, t: Date.now() };
        hk[p.sku] = cur; trustStat.histWait = (trustStat.histWait || 0) + 1;
        if (cur.n >= HIST_RUNS && Date.now() - cur.t >= HIST_HOURS * 3600e3) {
          d.href = TRUST.dayOf(now); d.href_at = now; delete hk[p.sku]; trustStat.healed = (trustStat.healed || 0) + 1; trustStat.histWait--;
          for (const o of offerState) delete o.why;
          flt = TRUST.filterOffers(d, offerState, PRICING.ok ? PRICING.toCost : 0);
        }
      } else if (hk[p.sku]) delete hk[p.sku]; }
    const hadLive = offerState.some(o => o.in_stock);
    best = null; bestSrc = null; let bestListed = null, bestShip = 0, bestFz = 0;   // best = GIA THUC TRA (da gom ship nguon)
    for (const o of flt.valid) if (o.in_stock && (!best || o.landed < best)) { best = o.landed; bestListed = o.price; bestShip = o.ship; bestSrc = o.source; bestFz = o.fz || 0; }
    for (const o of flt.dropped) o.x = o.why;
    trustStat.dropped += flt.dropped.length;
    if (hadLive && !best) { d.hold = 1; d.hold_why = flt.dropped[0] ? flt.dropped[0].why : 'Không còn nguồn giá hợp lệ'; trustStat.hold++; }
    else { delete d.hold; delete d.hold_why; }
    let kk = d.kk_price;
    if (best && PRICING.ok) kk = PRICING.sell(best);                 // cong thuc noi bo theo bac gia (Secret)
    else if (best && !PRICING.ok) kk = d.kk_price;                   // thieu Secret: giu gia, van cap nhat ton kho
    const inStock = best ? 1 : 0;
    if (!inStock) outOfStock++;

    const priceChanged = kk !== d.kk_price || inStock !== d.in_stock;
    ULOG.track(run, p, d.kk_price, kk, d.in_stock, inStock);
    // Tuyet doi khong ghi danh tinh nguon / gia nguon ra du lieu cong khai
    delete d.offers; delete d.sources; delete d.best_source; delete d.best_price; delete d.best_url;
    d.in_stock = inStock; d.updated_at = now; d.sh = best ? bestShip : 0;   // phan ship nguon da du phong trong gia (khong lo danh tinh nguon)
    if (priceChanged) {
      changed++;
      d.kk_price = kk;
      // Noi dai so cai (chain theo SKU, seq toan cuc)
      d.ledger = d.ledger || [];
      const prev = d.ledger.length ? d.ledger[d.ledger.length - 1].hash : 'GENESIS-' + p.sku;
      seq++;
      const h = sha(`${seq}|${p.sku}|${kk}|${inStock}|${now}|${prev}`);
      const oldKK = d.ledger.length ? d.ledger[d.ledger.length - 1].kk_price : null;
      d.ledger.push({ seq, kk_price: kk, s: inStock, at: now, hash: h });
      if (d.ledger.length > 60) d.ledger = d.ledger.slice(-60);
      recent.push({ sku: p.sku, name: p.name, kk, prev: oldKK, s: inStock, seq, hash: h, at: now });
      changedSlugs.push(/^[a-z0-9-]+$/.test(p.slug || '') ? p.slug : '');
    }
    /* lich su 90 ngay + danh gia tin cay cong khai */
    { const cn = TRUST.cleanText(d.name); if (cn !== d.name) { d.name = cn; p.name = cn; } }
    if (/30 phút\/lần/.test(d.description || '')) d.description = d.description.replace(/30 phút\/lần/g, '3 giờ/lần');
    TRUST.updateD90(d, now);
    const ev = TRUST.evaluate(d);
    if (!(exOffers.length || fzOffers.length || fidx.origin[p.sku])) ev.fl |= TRUST.FL.NO_SOURCE;   // SP mo phong: khong co nguon mua ho that
    if (!fidx.origin[p.sku] && (p.sold || d.sold)) { p.sold = 0; d.sold = 0; }   // so 'da ban' cua du lieu mau cu khong xac thuc -> 0
    /* danh gia: CHI tu nguoi da nhan hang (may chu); khong co danh gia -> khong hien sao. Bo ton kho gia dinh ("con 50 suat") */
    { const rv = REVIEWS ? REVIEWS[p.sku] : null;
      if (REVIEWS) d.reviewStat = rv ? { n: rv[0], avg: rv[1] } : { n: 0, avg: null };
      const rs = d.reviewStat && d.reviewStat.n ? d.reviewStat : null;
      d.rating = rs ? rs.avg : 0; p.rating = d.rating; d.reviews = []; if (d.stock_qty) d.stock_qty = null; }
    d.trust = { disc: ev.disc, fl: ev.fl, why: ev.why };
  if ((ev.fl & TRUST.FL.USED) && /mới 100%/i.test(d.description || '')) d.description = String(d.description).replace(/chính hãng, mới 100%(, đầy đủ phụ kiện)?/i, 'đã qua sử dụng, tình trạng đúng như tên gọi').replace(/mới 100%/ig, 'đã qua sử dụng');
    p.disc = ev.disc; p.fl = ev.fl;
    const lastE = d.ledger && d.ledger.length ? d.ledger[d.ledger.length - 1].hash : 'GENESIS-' + p.sku;
    leaves.push({ sku: p.sku, head: lastE });
    docs.set(p.sku, { f, d });
    p.kk_price = d.kk_price; p.in_stock = inStock; p.updated_at = now;
    adminRows.push({ sku: p.sku, name: p.name, brand: p.brand, cat: p.category_id, catName: p.category_name, grp: p.grp,
      base: d.base_price, kk: d.kk_price, stock: inStock, rating: p.rating, sold: p.sold,
      img: (d.image || '').startsWith('http') ? d.image : '',
      sp: Object.keys(d.specs || {}).length,
      best: best ? { s: bestSrc, p: bestListed, sh: bestShip, l: best } : null, margin: best ? d.kk_price - best : null,   // margin = lai thuc sau ship
      // u = duong dan dat hang (bot chi tu dat khi khop chinh xac hoac trung ma model >= 0.9); ghep theo ten: duong dan nam o fu de nguoi van hanh kiem tra truoc
      offers: offerState.concat(lowOffers).map(o => { const man = o.fz && o.fz < 0.9; const r = { s: o.source, p: o.price, sh: o.ship || 0, l: o.landed || o.price, k: o.in_stock, u: man ? '' : (o.url || ''), x: o.x || '' }; if (o.fz) { r.f = o.fz; r.n = String(o.name || '').slice(0, 110); if (man) r.fu = o.url || ''; } return r; }).sort((a, b) => a.l - b.l), feed: (exOffers.length || fzOffers.length) ? 1 : 0, nx: exOffers.length, bf: best && bestFz ? bestFz : 0,
      hold: d.hold ? d.hold_why : '', fl: ev.fl, disc: ev.disc });
  }
  /* ===== MERKLE ROOT toan so cai + proof tung SP, roi moi ghi file ===== */
  const mk = TRUST.merkle(leaves);
  for (const [sku, { f, d }] of docs) { d.mp = mk.proofs[sku]; d.mr = mk.root; d.mat = now; fs.writeFileSync(f, JSON.stringify(d)); }
  docs.clear();
  feed.stat.trust = { dropped: trustStat.dropped, hold: trustStat.hold, low: trustStat.low || 0, histWait: trustStat.histWait || 0, healed: trustStat.healed || 0 };
  console.log(`Bo loc tin cay: loai ${trustStat.dropped} offer ngoai lai · tam giu ${trustStat.hold} SP · cho xac nhan muc gia moi ${trustStat.histWait || 0} SP · da dat lai moc lich su ${trustStat.healed || 0} SP · Merkle root ${mk.root.slice(0, 16)}… (${mk.n} la)`);
  /* ===== KIEM TRA ANH THAT (xoay vong ~300 anh/lan) + thay anh hong bang anh nguon khac ===== */
  fidx.broken = fidx.broken || {};
  const imgList = full.filter(p => /^https:\/\//.test(p.image || ''));
  // Uu tien kiem ngay nhung SP dang tro vao host test/staging (chac chan hong) - khong cho xoay vong
  const badHostList = imgList.filter(p => !goodImg(p.image));
  const IMG_N = parseInt(process.env.IMG_CHECK_PER_RUN || '1000', 10);
  const start = (fidx.imgPtr || 0) % Math.max(1, imgList.length);
  const batch = badHostList.concat(imgList.slice(start, start + IMG_N).concat(start + IMG_N > imgList.length ? imgList.slice(0, start + IMG_N - imgList.length) : [])).filter((p, i, a) => a.indexOf(p) === i);
  fidx.imgPtr = start + IMG_N;
  const okImg = async u => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
    try { const r = await fetch(u, { headers: { range: 'bytes=0-0', 'user-agent': 'KK-MALL-ImageCheck/1.0' }, signal: ac.signal }); return r.status < 400 && /image|octet/.test(r.headers.get('content-type') || 'image'); } catch { return null; } finally { clearTimeout(t); } };
  const imgStat = { checked: 0, broken: 0, swapped: 0, unreach: 0 };
  if (process.env.IMG_CHECK !== '0') {
    /* May chu anh khong phan hoi (vd CDN cua san da ngung): moi anh cho het 8 giay -> 900 anh lam ca lan chay cham them 10 phut.
     * Cau dao: 1 host loi lien tiep 15 lan thi bo qua phan con lai cua host do trong lan nay; toan bo buoc kiem anh toi da IMG_CHECK_BUDGET_S giay. */
    let i = 0; const hostFail = {}, hostOf = u => { try { return new URL(u).host; } catch { return ''; } }, tImg = Date.now(), IMG_BUDGET = parseInt(process.env.IMG_CHECK_BUDGET_S || '150', 10) * 1000;
    await Promise.all(Array.from({ length: 12 }, async () => { while (i < batch.length) { const p = batch[i++], h = hostOf(p.image);
      if (Date.now() - tImg > IMG_BUDGET || (hostFail[h] || 0) >= 15) { imgStat.skipped = (imgStat.skipped || 0) + 1; continue; }
      const ok = goodImg(p.image) ? await okImg(p.image) : false; imgStat.checked++;
      if (ok === null) { imgStat.unreach++; hostFail[h] = (hostFail[h] || 0) + 1; continue; }          // mang loi: khong ket luan
      hostFail[h] = 0;
      if (ok) { delete fidx.broken[p.sku]; continue; }
      imgStat.broken++;
      const alt = (exBySku.get(p.sku) || []).map(o => o.image).find(u => u && u !== p.image && goodImg(u));
      if (alt && await okImg(alt)) {
        p.image = alt; imgStat.swapped++; delete fidx.broken[p.sku];
        const pf = path.join(API, 'products', p.sku + '.json'); const pd = JSON.parse(fs.readFileSync(pf, 'utf8')); pd.image = alt; fs.writeFileSync(pf, JSON.stringify(pd));
      } else fidx.broken[p.sku] = now;
    } }));
    console.log(`Kiem anh: ${imgStat.checked} anh · hong ${imgStat.broken} · da thay ${imgStat.swapped} · khong ket noi ${imgStat.unreach} · bo qua ${imgStat.skipped || 0} · tong dang hong ${Object.keys(fidx.broken).length}`);
  }

  /* ===== DANH MUC CONG KHAI: chi SP co anh that khi nhom da du hang that ===== */
  const realN = {}; for (const p of full) if (goodImg(p.image) && !fidx.broken[p.sku]) realN[p.grp] = (realN[p.grp] || 0) + 1;
  const MIN_REAL = parseInt(process.env.MIN_REAL_PER_GROUP || '8', 10);
  const pub = full.filter(p => !fidx.broken[p.sku] && !(/^https:\/\//.test(p.image || '') && !goodImg(p.image)) && (/^https:\/\//.test(p.image || '') || (realN[p.grp] || 0) < MIN_REAL));
  const hiddenSynthetic = full.length - pub.length;
  console.log(`Danh muc cong khai: ${pub.length} SP · an ${hiddenSynthetic} SP mau/anh hong`);
  fs.writeFileSync(FIDX_FILE, JSON.stringify(fidx));

  // ---- GOI DU LIEU QUAN TRI MA HOA (cong /admin) ----
  // Chi sinh khi co khoa (GitHub Secret ADMIN_PORTAL_KEY); nguoi ngoai khong giai ma duoc.
  const AKEY = (process.env.ADMIN_PORTAL_KEY || '').trim(); // tu cat khoang trang/xuong dong khi dan Secret
  if (AKEY) {
    const SRCMETA = { dienmayxanh: ['\u0110i\u1ec7n M\u00e1y Xanh', '#2e7d32'], thegioididong: ['Th\u1ebf Gi\u1edbi Di \u0110\u1ed9ng', '#f9a825'], fptshop: ['FPT Shop', '#f37021'], cellphones: ['CellphoneS', '#d70018'], dienmaycholon: ['\u0110M Ch\u1ee3 L\u1edbn', '#0066b3'], tiki: ['Tiki', '#1a94ff'], shopee: ['Shopee', '#ee4d2d'], tiktok: ['TikTok Shop', '#111'], lazada: ['Lazada', '#0f146d'], sendo: ['Sendo', '#d0021b'] , hoangha: ['Ho\u00e0ng H\u00e0 Mobile', '#c2185b'], phucanh: ['Ph\u00fac Anh', '#1565c0'], anphat: ['An Ph\u00e1t', '#d84315'] };
    // Lich su cap nhat: giai ma goi cu -> noi them ban ghi lan chay nay
    const ENC = path.join(SITE, 'admin', 'data.enc');
    const prev = ULOG.decryptFile(ENC, AKEY);
    const FEEDK = ['ACCESSTRADE_KEY', 'FEED_URLS', 'SHOPEE_APP_ID', 'LAZADA_APP_KEY', 'TIKTOK_APP_KEY', 'TIKI_CLIENT_ID', 'SENDO_FEED_URL'].filter(k => process.env[k]);
    const entry = ULOG.finish(run, {
      at: now, dur: Date.now() - t0,
      trig: process.env.KK_TRIGGER === 'bu-lich' ? 'Lịch bù (GitHub trễ lịch)' : process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'Chạy tay' : 'Lịch 3 giờ',
      mode: feed.stat.ok ? 'Feed chính thức (' + feed.stat.ok + '/' + feed.stat.sources + ' nguồn) + mô phỏng phần chưa có feed' : (FEEDK.length ? 'Đã cấu hình feed nhưng chưa tải được' : 'Mô phỏng thị trường (chưa nối feed)'),
      offers: adminRows.reduce((a, r) => a + r.offers.length, 0), feed: feed.stat.sources ? feed.stat : undefined, img: imgStat, pub: pub.length, hidden: hiddenSynthetic, ledger: [seqFrom + 1, seq], price_ok: PRICING.ok,
    });
    const updates = ULOG.append(prev && prev.updates, entry);
    const encObj = ULOG.encrypt({ v: 1, generated_at: now, total: adminRows.length, sources: SRCMETA, rows: adminRows, updates, unclassSample: feed.unclassSample || [] }, AKEY);
    fs.mkdirSync(path.join(SITE, 'admin'), { recursive: true });
    fs.writeFileSync(ENC, JSON.stringify(encObj));
    const ct = Buffer.from(encObj.ct, 'base64');
    console.log('Nhat ky cap nhat: ' + updates.length + ' ban ghi (lan nay: ' + run.n + ' SP, +' + run.up + '/-' + run.down + ' gia, ' + run.oos + ' het, ' + run.back + ' co lai)');
    console.log('Goi quan tri ma hoa: OK (' + (ct.length / 1024).toFixed(0) + 'KB)');
  } else {
    console.log('Bo qua goi quan tri (chua dat ADMIN_PORTAL_KEY) - giu ban cu.');
  }

  // ---- XUAT BAN CONG KHAI (catalog, nganh, pack, SDUI, meta + Merkle root, nhat ky root) ----
  meta.syncMinutes = CYCLE_MIN;
  const PUBR = publish({ API, pub, meta, now, seq, mk, recent: recent.sort((a, b) => b.seq - a.seq), chain: CHAIN });
  // danh sach trang SP vua doi gia/ton kho -> IndexNow (chay sau deploy)
  const pubSet = new Set(PUBR.pub.map(r => r.slug));
  fs.writeFileSync(path.join(__dirname, '.changed.json'), JSON.stringify(changedSlugs.filter(s => s && pubSet.has(s))));

  console.log(`✔ Thu thập xong lúc ${now}: ${full.length} SP · ${changed} đổi giá · ${outOfStock} tạm hết hàng · sổ cái #${seq}` + (PRICING.ok ? ' · biểu lời ' + PRICING.desc : ' · (chưa có PRICING_TIERS/PRICING_OFFSET - giữ nguyên giá bán)'));
})().catch(e => { console.error('COLLECTOR LỖI:', e); process.exit(1); });
