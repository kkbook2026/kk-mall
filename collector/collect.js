'use strict';
/*
 * KK-MALL CLOUD COLLECTOR - chay tren GitHub Actions moi 3 gio, 24/7,
 * khong phu thuoc may tinh hay trinh duyet cua chu shop.
 * Nhiem vu: thu thap/cap nhat gia & ton kho cho toan bo catalog cua site,
 * tinh lai gia ban va NOI DAI SO CAI GIA (hash-chain) roi xuat ra site/.
 * Cau hinh dinh gia noi bo lay tu bien moi truong ma hoa (GitHub Secret) - khong nam trong ma nguon.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
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
const RETAIL = require('./retail');                       // gia cong khai website ban le (Hoang Ha, Phuc Anh, An Phat)                      // gia thuc tra = gia nguon + ship uoc tinh (tu hieu chinh tu PO that)
const CYCLE_MIN = 180;                                   // chu ky thu thap: 3 gio/lan
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));
const wj = (f, d) => fs.writeFileSync(path.join(API, f), JSON.stringify(d));
const round1000 = v => Math.round(v / 1000) * 1000;
// URL anh dung duoc: https + KHONG phai host test/staging cua san (hay chet, khong hien tren web)
const BAD_IMG_HOST = /^https:\/\/(vn-test-\d+\.slatic\.net|lzd-staging[^/]*|[^/]*staging[^/]*\.oss-[^/]*\.aliyuncs\.com|[^/]*sandbox[^/]*)\//i;
const goodImg = u => typeof u === 'string' && /^https:\/\//.test(u) && !BAD_IMG_HOST.test(u);

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
  { let n = 0, un = 0; for (const r of RETAIL.rows(FEEDS)) {
      if (!r.name || r.name.length < 6 || r.price < 1000 || r.price > 2e9) continue;
      r.grp = FEEDS.classify(r.name, r.cat); if (!r.grp) { un++; continue; }
      r.key = FEEDS.normKey(r.name); feed.offers.push(r); n++; }
    feed.stat.retail = n; feed.stat.retailUnclassified = un; console.log(`Gia ban le cong khai: ${n} offer (bo ${un} chua phan loai)`); }
  const SHIP = LANDEDM.create(process.env, await LANDEDM.fetchStats(process.env)); console.log('Gia thuc tra: ' + SHIP.desc);
  const REVIEWS = await LANDEDM.fetchReviewStats(process.env); console.log('Danh gia that: ' + (REVIEWS ? Object.keys(REVIEWS).length + ' SP co danh gia' : 'khong lay duoc - giu thong ke cu'));
  const feedBySku = {};
  feed.stat.matched = 0; feed.stat.added = 0; feed.stat.capped = 0;
  if (feed.offers.length) {
    const byName = {}; for (const p of full) byName[FEEDS.normKey(p.name)] = p.sku;
    // GHEP CHEO NGUON THEO MA MODEL (vd LS32DG502EEXXV, QA55Q60C): chi ma xuat hien o DUY NHAT 1 SP trong cung nhom
    const codesOf = s => [...new Set(String(s || '').toUpperCase().replace(/[()\[\],/|+]/g, ' ').split(/\s+/).map(t => t.replace(/^-+|-+$/g, ''))
      .filter(t => t.length >= 6 && /[A-Z]/.test(t) && /\d/.test(t) && !/^\d+(GB|TB|MB|MAH|W|HZ|MM|CM|INCH|K|MP|L|KG|ML|V|BTU|GHZ|MHZ)$/.test(t) && !/^(RTX|GTX|RX|I[3579]|CORE|ULTRA|RYZEN|DDR|LPDDR|USB|WIFI|PCIE|GEN|M\d)/.test(t)))];
    const byModel = new Map(); for (const p of full) for (const c of codesOf(p.name)) { const k = p.grp + '|' + c; byModel.set(k, byModel.has(k) ? null : p.sku); }
    feed.stat.modelMatched = 0;
    const g2c = {}; for (const p of full) g2c[p.grp] = [p.category_id, p.category_name];
    const fullBySku = new Map(full.map(p => [p.sku, p]));
    let nextId = Math.max(...full.map(p => parseInt(p.sku.slice(2), 10) || 0)) + 1;
    const groups = {}; for (const o of feed.offers) (groups[o.key] = groups[o.key] || []).push(o);
    const nowFeedTotal = Object.keys(fidx.origin).length;
    for (const [key, offs] of Object.entries(groups)) {
      let sku = fidx.map[key] || byName[key];
      if (!sku) { for (const o of offs) { for (const c of codesOf(o.name)) { const m = byModel.get(o.grp + '|' + c); if (m) { sku = m; break; } } if (sku) { feed.stat.modelMatched++; break; } } }
      if (sku && !fs.existsSync(path.join(API, 'products', sku + '.json'))) sku = null;
      if (!sku) {
        if (feed.stat.added >= MAX_NEW || nowFeedTotal + feed.stat.added >= MAX_TOTAL) { feed.stat.capped++; continue; }
        const best = offs.filter(o => o.stock).sort((a, b) => a.price - b.price)[0] || offs[0];
        const withImg = offs.find(o => goodImg(o.image));
        if (!withImg) { feed.stat.capped++; continue; }                 // chi nhan hang co anh that
        const [cid, cname] = g2c[best.grp] || ['khac', 'Khác'];
        sku = 'KK' + String(nextId++).padStart(6, '0');
        const name = TRUST.cleanText(best.name).replace(/\s*[-–|]\s*(hàng chính hãng|chính hãng|hàng nhập khẩu)\s*$/i, '').slice(0, 140);
        const brand = (offs.find(o => o.brand) || {}).brand || name.split(' ').find(w => /^[A-Z][A-Za-z0-9&.-]{1,}$/.test(w)) || 'KK Select';
        const base = offs.map(o => o.list || o.price).sort((a, b) => a - b)[Math.floor(offs.length / 2)];
        const initKK = PRICING.ok ? PRICING.sell(Math.min(...offs.map(o => SHIP.landed(o.src, o.price, best.grp, { freeship: /freeship/i.test(o.name || ''), name: o.name })))) : base; // gia thuc tra, khong bao gio de 0d
        const slug = FEEDS.normKey(name).replace(/ /g, '-').slice(0, 80) + '-' + sku.toLowerCase();
        const d = { id: nextId - 1, sku, spu_id: nextId - 1, variant: '', name, slug, category_id: cid, category_name: cname, grp: best.grp, brand,
          image: withImg.image, description: name + ' chính hãng, mới 100%. Giá được KK-MALL so sánh và cập nhật tự động 3 giờ/lần.',
          specs: { 'Thương hiệu': brand, 'Bảo hành': 'Theo chính sách của hãng' }, base_price: base, rating: 0, sold: 0, stock_qty: null,
          kk_price: initKK, in_stock: 0, active: 1, updated_at: now, ledger: [], related: [], variants: [{ sku, variant: '', kk_price: initKK, in_stock: 0 }], reviews: [], reviewStat: { n: 0, avg: null } };
        fs.writeFileSync(path.join(API, 'products', sku + '.json'), JSON.stringify(d));
        full.push({ sku, name, slug, category_id: cid, category_name: cname, grp: best.grp, brand, variant: '', image: withImg.image, base_price: base, kk_price: initKK, in_stock: 0, stock_qty: 50, rating: 4.6, sold: 0, updated_at: now });
        fidx.origin[sku] = 1; feed.stat.added++;
      } else {
        feed.stat.matched++;
        // PHAN LOAI LAI san pham tu feed neu luat moi xep nhom khac
        if (fidx.origin[sku]) {
          const bestG = (offs.find(o => o.stock) || offs[0]).grp;
          const fe = fullBySku.get(sku);
          if (fe && fe.grp !== bestG && g2c[bestG]) {
            const [cid, cname] = g2c[bestG];
            fe.grp = bestG; fe.category_id = cid; fe.category_name = cname;
            const pf = path.join(API, 'products', sku + '.json');
            const pd = JSON.parse(fs.readFileSync(pf, 'utf8')); pd.grp = bestG; pd.category_id = cid; pd.category_name = cname; fs.writeFileSync(pf, JSON.stringify(pd));
            feed.stat.reclassified = (feed.stat.reclassified || 0) + 1;
          }
        }
      }
      fidx.map[key] = sku;
      const per = {}; for (const o of offs) if (!per[o.src] || (o.stock && o.price < per[o.src].price)) per[o.src] = o;
      feedBySku[sku] = Object.values(per).map(o => ({ source: o.src, price: o.price, in_stock: o.stock, url: o.url, image: o.image, name: o.name, fetched_at: now, fs: /freeship|mi[eê]n ph[ií] v[aâ]n chuy[eê]n/i.test(o.name || '') ? 1 : 0, st: o.stale ? 1 : 0 }));
    }
  }
  if (feed.dropKeys && feed.dropKeys.size) {
    const rm = new Set();
    for (const k of feed.dropKeys) { const sku = fidx.map[k]; if (sku && fidx.origin[sku] && !feedBySku[sku]) { rm.add(sku); delete fidx.map[k]; delete fidx.origin[sku]; } }
    if (rm.size) {
      for (let i = full.length - 1; i >= 0; i--) if (rm.has(full[i].sku)) { try { fs.unlinkSync(path.join(API, 'products', full[i].sku + '.json')); } catch {} full.splice(i, 1); }
      feed.stat.removed = rm.size;
    }
  }
  if (feed.stat.sources) console.log(`Feed: ${feed.stat.ok}/${feed.stat.sources} nguon · ${feed.stat.items} ban ghi · khop ${feed.stat.matched} · them moi ${feed.stat.added} · phan loai lai ${feed.stat.reclassified || 0} · go ${feed.stat.removed || 0}` + (feed.stat.fail.length ? ' · LOI: ' + feed.stat.fail.join('; ') : ''));

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
    if (feedBySku[p.sku] || fidx.origin[p.sku]) {
      // GIA THAT tu datafeed chinh thuc (san pham tu feed khong co gia mo phong; mat khoi feed => tam het hang)
      offerState = feedBySku[p.sku] || [];
      for (const o of offerState) { o.ship = SHIP.shipFor(o.source, o.price, p.grp, { freeship: o.fs, stale: o.st, name: p.name }); o.landed = o.price + o.ship; }
    } else for (const src of sources) {
      const rnd = mulberry32((seed + hash32(p.sku + src)) >>> 0);
      const price = round1000(d.base_price * (0.91 + rnd() * 0.18));
      const inStock = rnd() > 0.06 ? 1 : 0;
      offerState.push({ source: src, price, in_stock: inStock, fetched_at: now, ship: 0, landed: price });
    }
    /* ===== BO LOC TIN CAY: loai offer ngoai lai truoc khi chon gia ===== */
    const flt = TRUST.filterOffers(d, offerState, PRICING.ok ? PRICING.toCost : 0);
    const hadLive = offerState.some(o => o.in_stock);
    best = null; bestSrc = null; let bestListed = null, bestShip = 0;   // best = GIA THUC TRA (da gom ship nguon)
    for (const o of flt.valid) if (o.in_stock && (!best || o.landed < best)) { best = o.landed; bestListed = o.price; bestShip = o.ship; bestSrc = o.source; }
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
    if (!(feedBySku[p.sku] || fidx.origin[p.sku])) ev.fl |= TRUST.FL.NO_SOURCE;   // SP mo phong: khong co nguon mua ho that
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
      offers: offerState.map(o => ({ s: o.source, p: o.price, sh: o.ship || 0, l: o.landed || o.price, k: o.in_stock, u: o.url || '', x: o.x || '' })).sort((a, b) => a.l - b.l), feed: feedBySku[p.sku] ? 1 : 0,
      hold: d.hold ? d.hold_why : '', fl: ev.fl, disc: ev.disc });
  }
  /* ===== MERKLE ROOT toan so cai + proof tung SP, roi moi ghi file ===== */
  const mk = TRUST.merkle(leaves);
  for (const [sku, { f, d }] of docs) { d.mp = mk.proofs[sku]; d.mr = mk.root; d.mat = now; fs.writeFileSync(f, JSON.stringify(d)); }
  docs.clear();
  console.log(`Bo loc tin cay: loai ${trustStat.dropped} offer ngoai lai · tam giu ${trustStat.hold} SP · Merkle root ${mk.root.slice(0, 16)}… (${mk.n} la)`);
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
    let i = 0;
    await Promise.all(Array.from({ length: 12 }, async () => { while (i < batch.length) { const p = batch[i++];
      const ok = goodImg(p.image) ? await okImg(p.image) : false; imgStat.checked++;
      if (ok === null) { imgStat.unreach++; continue; }          // mang loi: khong ket luan
      if (ok) { delete fidx.broken[p.sku]; continue; }
      imgStat.broken++;
      const alt = (feedBySku[p.sku] || []).map(o => o.image).find(u => u && u !== p.image && goodImg(u));
      if (alt && await okImg(alt)) {
        p.image = alt; imgStat.swapped++; delete fidx.broken[p.sku];
        const pf = path.join(API, 'products', p.sku + '.json'); const pd = JSON.parse(fs.readFileSync(pf, 'utf8')); pd.image = alt; fs.writeFileSync(pf, JSON.stringify(pd));
      } else fidx.broken[p.sku] = now;
    } }));
    console.log(`Kiem anh: ${imgStat.checked} anh · hong ${imgStat.broken} · da thay ${imgStat.swapped} · khong ket noi ${imgStat.unreach} · tong dang hong ${Object.keys(fidx.broken).length}`);
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
      trig: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'Chạy tay' : 'Lịch 3 giờ',
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
  const PUBR = publish({ API, pub, meta, now, seq, mk, recent: recent.sort((a, b) => b.seq - a.seq) });
  // danh sach trang SP vua doi gia/ton kho -> IndexNow (chay sau deploy)
  const pubSet = new Set(PUBR.pub.map(r => r.slug));
  fs.writeFileSync(path.join(__dirname, '.changed.json'), JSON.stringify(changedSlugs.filter(s => s && pubSet.has(s))));

  console.log(`✔ Thu thập xong lúc ${now}: ${full.length} SP · ${changed} đổi giá · ${outOfStock} tạm hết hàng · sổ cái #${seq}` + (PRICING.ok ? ' · biểu lời ' + PRICING.desc : ' · (chưa có PRICING_TIERS/PRICING_OFFSET - giữ nguyên giá bán)'));
})().catch(e => { console.error('COLLECTOR LỖI:', e); process.exit(1); });
