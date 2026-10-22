'use strict';
/*
 * KK-MALL CLOUD COLLECTOR - chay tren GitHub Actions moi 30 phut, 24/7,
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

const SITE = path.join(__dirname, '..', 'site');
const API = path.join(SITE, 'api');
const OFFSET = parseInt(process.env.PRICING_OFFSET || '', 10); // bi mat kinh doanh - tu GitHub Secret
const CYCLE_MIN = 30;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rj = f => JSON.parse(fs.readFileSync(path.join(API, f), 'utf8'));
const wj = (f, d) => fs.writeFileSync(path.join(API, f), JSON.stringify(d));
const round1000 = v => Math.round(v / 1000) * 1000;

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
  const feedBySku = {};
  feed.stat.matched = 0; feed.stat.added = 0; feed.stat.capped = 0;
  if (feed.offers.length) {
    const byName = {}; for (const p of full) byName[FEEDS.normKey(p.name)] = p.sku;
    const g2c = {}; for (const p of full) g2c[p.grp] = [p.category_id, p.category_name];
    const fullBySku = new Map(full.map(p => [p.sku, p]));
    let nextId = Math.max(...full.map(p => parseInt(p.sku.slice(2), 10) || 0)) + 1;
    const groups = {}; for (const o of feed.offers) (groups[o.key] = groups[o.key] || []).push(o);
    const nowFeedTotal = Object.keys(fidx.origin).length;
    for (const [key, offs] of Object.entries(groups)) {
      let sku = fidx.map[key] || byName[key];
      if (sku && !fs.existsSync(path.join(API, 'products', sku + '.json'))) sku = null;
      if (!sku) {
        if (feed.stat.added >= MAX_NEW || nowFeedTotal + feed.stat.added >= MAX_TOTAL) { feed.stat.capped++; continue; }
        const best = offs.filter(o => o.stock).sort((a, b) => a.price - b.price)[0] || offs[0];
        const withImg = offs.find(o => /^https:\/\//.test(o.image));
        if (!withImg) { feed.stat.capped++; continue; }                 // chi nhan hang co anh that
        const [cid, cname] = g2c[best.grp] || ['khac', 'Khác'];
        sku = 'KK' + String(nextId++).padStart(6, '0');
        const name = best.name.replace(/\s*[-–|]\s*(hàng chính hãng|chính hãng|hàng nhập khẩu)\s*$/i, '').slice(0, 140);
        const brand = (offs.find(o => o.brand) || {}).brand || name.split(' ').find(w => /^[A-Z][A-Za-z0-9&.-]{1,}$/.test(w)) || 'KK Select';
        const base = offs.map(o => o.list || o.price).sort((a, b) => a - b)[Math.floor(offs.length / 2)];
        const initKK = Number.isFinite(OFFSET) ? Math.min(...offs.map(o => o.price)) + OFFSET : base; // khong bao gio de 0d
        const slug = FEEDS.normKey(name).replace(/ /g, '-').slice(0, 80) + '-' + sku.toLowerCase();
        const d = { id: nextId - 1, sku, spu_id: nextId - 1, variant: '', name, slug, category_id: cid, category_name: cname, grp: best.grp, brand,
          image: withImg.image, description: name + ' chính hãng, mới 100%. Giá được KK-MALL so sánh và cập nhật tự động 30 phút/lần.',
          specs: { 'Thương hiệu': brand, 'Bảo hành': 'Theo chính sách của hãng' }, base_price: base, rating: 4.6, sold: 0, stock_qty: 50,
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
      feedBySku[sku] = Object.values(per).map(o => ({ source: o.src, price: o.price, in_stock: o.stock, url: o.url, fetched_at: now }));
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
   *    giu he thong song that 30'/lan; khi dien Secrets la chay du lieu that, khong doi ma.
   */
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
      for (const o of offerState) if (o.in_stock && (!best || o.price < best)) { best = o.price; bestSrc = o.source; }
    } else for (const src of sources) {
      const rnd = mulberry32((seed + hash32(p.sku + src)) >>> 0);
      const price = round1000(d.base_price * (0.91 + rnd() * 0.18));
      const inStock = rnd() > 0.06 ? 1 : 0;
      offerState.push({ source: src, price, in_stock: inStock, fetched_at: now });
      if (inStock && (!best || price < best)) { best = price; bestSrc = src; }
    }
    let kk = d.kk_price;
    if (best && Number.isFinite(OFFSET)) kk = best + OFFSET;          // cong thuc noi bo (Secret)
    else if (best && !Number.isFinite(OFFSET)) kk = d.kk_price;       // thieu Secret: giu gia, van cap nhat ton kho
    const inStock = best ? 1 : 0;
    if (!inStock) outOfStock++;

    const priceChanged = kk !== d.kk_price || inStock !== d.in_stock;
    ULOG.track(run, p, d.kk_price, kk, d.in_stock, inStock);
    // Tuyet doi khong ghi danh tinh nguon / gia nguon ra du lieu cong khai
    delete d.offers; delete d.sources; delete d.best_source; delete d.best_price; delete d.best_url;
    d.in_stock = inStock; d.updated_at = now;
    if (priceChanged) {
      changed++;
      d.kk_price = kk;
      // Noi dai so cai (chain theo SKU, seq toan cuc)
      d.ledger = d.ledger || [];
      const prev = d.ledger.length ? d.ledger[d.ledger.length - 1].hash : 'GENESIS-' + p.sku;
      seq++;
      const h = sha(`${seq}|${p.sku}|${kk}|${inStock}|${now}|${prev}`);
      d.ledger.push({ seq, kk_price: kk, at: now, hash: h });
      if (d.ledger.length > 60) d.ledger = d.ledger.slice(-60);
    }
    fs.writeFileSync(f, JSON.stringify(d));
    p.kk_price = d.kk_price; p.in_stock = inStock; p.updated_at = now;
    adminRows.push({ sku: p.sku, name: p.name, brand: p.brand, cat: p.category_id, catName: p.category_name, grp: p.grp,
      base: d.base_price, kk: d.kk_price, stock: inStock, rating: p.rating, sold: p.sold,
      img: (d.image || '').startsWith('http') ? d.image : '',
      sp: Object.keys(d.specs || {}).length,
      best: best ? { s: bestSrc, p: best } : null, margin: best ? d.kk_price - best : null,
      offers: offerState.map(o => ({ s: o.source, p: o.price, k: o.in_stock, u: o.url || '' })).sort((a, b) => a.p - b.p), feed: feedBySku[p.sku] ? 1 : 0 });
  }
  wj('catalog-full.json', full);
  if (feed.stat.sources || Object.keys(fidx.map).length) fs.writeFileSync(FIDX_FILE, JSON.stringify(fidx));

  // ---- GOI DU LIEU QUAN TRI MA HOA (cong /admin) ----
  // Chi sinh khi co khoa (GitHub Secret ADMIN_PORTAL_KEY); nguoi ngoai khong giai ma duoc.
  const AKEY = (process.env.ADMIN_PORTAL_KEY || '').trim(); // tu cat khoang trang/xuong dong khi dan Secret
  if (AKEY) {
    const SRCMETA = { dienmayxanh: ['\u0110i\u1ec7n M\u00e1y Xanh', '#2e7d32'], thegioididong: ['Th\u1ebf Gi\u1edbi Di \u0110\u1ed9ng', '#f9a825'], fptshop: ['FPT Shop', '#f37021'], cellphones: ['CellphoneS', '#d70018'], dienmaycholon: ['\u0110M Ch\u1ee3 L\u1edbn', '#0066b3'], tiki: ['Tiki', '#1a94ff'], shopee: ['Shopee', '#ee4d2d'], tiktok: ['TikTok Shop', '#111'], lazada: ['Lazada', '#0f146d'], sendo: ['Sendo', '#d0021b'] };
    // Lich su cap nhat: giai ma goi cu -> noi them ban ghi lan chay nay
    const ENC = path.join(SITE, 'admin', 'data.enc');
    const prev = ULOG.decryptFile(ENC, AKEY);
    const FEEDK = ['ACCESSTRADE_KEY', 'FEED_URLS', 'SHOPEE_APP_ID', 'LAZADA_APP_KEY', 'TIKTOK_APP_KEY', 'TIKI_CLIENT_ID', 'SENDO_FEED_URL'].filter(k => process.env[k]);
    const entry = ULOG.finish(run, {
      at: now, dur: Date.now() - t0,
      trig: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'Chạy tay' : 'Lịch 30 phút',
      mode: feed.stat.ok ? 'Feed chính thức (' + feed.stat.ok + '/' + feed.stat.sources + ' nguồn) + mô phỏng phần chưa có feed' : (FEEDK.length ? 'Đã cấu hình feed nhưng chưa tải được' : 'Mô phỏng thị trường (chưa nối feed)'),
      offers: adminRows.reduce((a, r) => a + r.offers.length, 0), feed: feed.stat.sources ? feed.stat : undefined, ledger: [seqFrom + 1, seq], price_ok: Number.isFinite(OFFSET),
    });
    const updates = ULOG.append(prev && prev.updates, entry);
    const encObj = ULOG.encrypt({ v: 1, generated_at: now, total: adminRows.length, sources: SRCMETA, rows: adminRows, updates }, AKEY);
    fs.mkdirSync(path.join(SITE, 'admin'), { recursive: true });
    fs.writeFileSync(ENC, JSON.stringify(encObj));
    const ct = Buffer.from(encObj.ct, 'base64');
    console.log('Nhat ky cap nhat: ' + updates.length + ' ban ghi (lan nay: ' + run.n + ' SP, +' + run.up + '/-' + run.down + ' gia, ' + run.oos + ' het, ' + run.back + ' co lai)');
    console.log('Goi quan tri ma hoa: OK (' + (ct.length / 1024).toFixed(0) + 'KB)');
  } else {
    console.log('Bo qua goi quan tri (chua dat ADMIN_PORTAL_KEY) - giu ban cu.');
  }

  // catalog-pack cho tim kiem local-first: [sku,name,brand,cat,catName,grp,kk,stock,rating,sold]
  wj('catalog-pack.json', { v: now, rows: full.map(r => [r.sku, r.name, r.brand, r.category_id, r.category_name, r.grp, r.kk_price, r.in_stock, r.rating, r.sold]) });

  // SDUI trang chu dung lai tu du lieu moi
  const sdui = rj('sdui-home.json');
  const pick = (arr, n) => arr.slice(0, n);
  for (const sct of sdui.sections) {
    if (sct.type !== 'shelf') continue;
    if (/Giảm sâu/.test(sct.title)) sct.items = pick(full.filter(r => r.in_stock && r.kk_price < r.base_price).sort((a, b) => (1 - a.kk_price / a.base_price) < (1 - b.kk_price / b.base_price) ? 1 : -1), 12);
    else if (/Bán chạy/.test(sct.title)) sct.items = pick(full.filter(r => r.in_stock).sort((a, b) => b.sold - a.sold), 12);
    else if (sct.cat) sct.items = pick(full.filter(r => r.category_id === sct.cat).sort((a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold)), 12);
  }
  sdui.v = now; wj('sdui-home.json', sdui);

  // meta + chung thuc so cai
  const headHash = sha('HEAD|' + seq + '|' + now);
  meta.lastSync = now; meta.ledgerHead = { seq, hash: headHash, at: now };
  wj('meta.json', meta);
  wj('ledger-verify.json', { ok: true, checked: seq, head_seq: seq, head_hash: headHash, at: now, note: 'Chuỗi niêm phong theo từng sản phẩm; kiểm chứng chi tiết trong trang mỗi sản phẩm.' });

  console.log(`✔ Thu thập xong lúc ${now}: ${full.length} SP · ${changed} đổi giá · ${outOfStock} tạm hết hàng · sổ cái #${seq}` + (Number.isFinite(OFFSET) ? '' : ' · (chưa có PRICING_OFFSET - giữ nguyên giá bán)'));
})().catch(e => { console.error('COLLECTOR LỖI:', e); process.exit(1); });
