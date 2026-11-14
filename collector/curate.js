'use strict';
/*
 * KK-MALL CURATE - cham soc danh muc: (1) gop san pham TRUNG ve mot ma chuan, (2) duyet tay offer re bat thuong.
 * Ham thuan (khong doc/ghi file ngoai loadApprovals) de kiem thu doc lap; collect.js goi va ap dung.
 * Tuyet doi khong dua danh tinh nguon / gia nguon ra du lieu cong khai: ma offer la HMAC mot chieu, quyet dinh duyet chi gom SKU + ma.
 * (c) Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs');
const crypto = require('crypto');

/* ===================== 1. GOP SAN PHAM TRUNG =====================
 * Hai san pham trong danh muc la MOT mat hang khi (tat ca):
 *   - cung nhom hang, deu la hang lay tu nguon that (origin)
 *   - diem ghep >= min (mac dinh 0,92: trung ma hang day du hoac ma model manh ca hai ben) VA co it nhat 1 ma model manh
 *   - CUNG chu ky bien the (ma model, bien the Pro/Max..., tinh trang, so luong goi, mau, ma phu) - 1 ben ghi mau, ben kia khong => khong gop
 *   - ten co ghi MAU: chi gop khi hai ten giong het nhau sau khi bo dau/hoa thuong/dau cau ("xanh navy" <> "xanh denim", "xanh dương" <> "xanh dương nhạt"
 *     deu thuoc nhom mau xanh cua bo ghep gia nhung la hai bien the khac nhau); PHU KIEN (ma trong ten la cua may tuong thich)
 *     va HANG CU / DA KICH HOAT ("cu dep" <> "da kich hoat") cung vay
 *   - khong trung ma hang dai (>= 8 ky tu - ma nha san xuat da dinh danh ca cau hinh) thi phai giong nhau ca: nam ghi trong ten ("G34WQi" <> "G34WQi 2026"),
 *     so phien ban, MOI thong so co don vi (1 ben ghi 1TB, ben kia khong ghi => khong gop) va khong ben nao thua tu HIEM trong nhom (ten dong may, kieu switch...)
 *   - KHONG co nguoi ban nao niem yet ca hai ten nhu hai mat hang rieng (chuoi ban le / 1 shop chi dang moi mat hang 1 lan)
 *   - ca hai dang co gia thi gia khong lech qua (min/max >= ratio)
 * Gop hinh sao quanh ma chuan (ma nho nhat = trang lau doi nhat), khong bac cau: B trung A va C trung B nhung C khong trung A thi C dung yen.
 */
const yearsOf = name => new Set(String(name || '').match(/(?<![\d.,])(?:19|20)\d{2}(?![\d.,])/g) || []);
const setEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const plain = n => String(n || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
function planMerges({ full, IDX, MATCH, exBySku, origin = null, min = 0.92, ratio = 0.6, max = 250, skip = null }) {
  const by = new Map(full.map(p => [p.sku, p])), used = new Set(), plan = [], why = { sig: 0, seller: 0, price: 0, year: 0, color: 0, spec: 0, words: 0 };
  const specEq = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] && setEq(a[k], b[k])); };
  const sellers = sku => { const s = new Set(); for (const o of exBySku.get(sku) || []) { const x = MATCH.sellerOf(o.src, o.url); if (x) s.add(x); } return s; };
  const ok = p => p && (!origin || origin[p.sku]) && !(skip && skip.has(p.sku));
  for (const p of full.slice().sort((a, b) => a.sku < b.sku ? -1 : 1)) {
    if (plan.length >= max) break;
    if (used.has(p.sku) || !ok(p)) continue;
    const f = IDX.features(p.sku); if (!f || !f.strong.length) continue;
    const sig = MATCH.signature(f), sa = sellers(p.sku), ya = yearsOf(p.name), ca = MATCH.colorsRaw(p.name), rare = IDX.rare(p.grp); let hit = false;
    const extra = (X, Y) => [...X.words].some(t => !Y.words.has(t) && rare(t));
    for (const m of IDX.find(p.name, p.grp, min, f)) {
      if (plan.length >= max) break;
      if (m.id === p.sku || m.id < p.sku || used.has(m.id)) continue;
      const q = by.get(m.id), fq = IDX.features(m.id); if (!ok(q) || !fq) continue;
      if (MATCH.signature(fq) !== sig) { why.sig++; continue; }
      const cb = MATCH.colorsRaw(q.name); if (!setEq(ca, cb) || ((ca.size || cb.size) && plain(p.name) !== plain(q.name))) { why.color++; continue; }
      if ((f.acc || fq.acc || f.cond || fq.cond) && plain(p.name) !== plain(q.name)) { why.words++; continue; }   // phu kien (ma trong ten la cua may tuong thich) va hang cu/da kich hoat ("cu dep" <> "da kich hoat"): chi gop khi ten giong het
      const longCode = f.strong.some(c => c.core.length >= 8 && fq.strong.some(d => d.full === c.full));
      if (!longCode) {
        if (!setEq(ya, yearsOf(q.name))) { why.year++; continue; }
        if (!setEq(f.nums, fq.nums) || !specEq(f.spec, fq.spec)) { why.spec++; continue; }
        if (extra(f, fq) || extra(fq, f)) { why.words++; continue; }
      }
      const sb = sellers(m.id); if ([...sa].some(x => sb.has(x))) { why.seller++; continue; }
      if (p.in_stock && q.in_stock && p.kk_price > 0 && q.kk_price > 0 && Math.min(p.kk_price, q.kk_price) / Math.max(p.kk_price, q.kk_price) < ratio) { why.price++; continue; }
      plan.push({ to: p.sku, from: m.id, score: m.score }); used.add(m.id); hit = true;
      for (const x of sb) sa.add(x);                                     // nguoi ban cua SP vua gop cung thuoc ve ma chuan
    }
    if (hit) used.add(p.sku);
  }
  return { plan, why };
}
/* File thay the cho ma da gop: du truong ma may chu don hang va gio hang cu can (ten, gia, ton kho cua SP chuan) + con tro merged_into.
 * Khong co so cai (lich su cua ma cu dung lai tai thoi diem gop), khong tham gia Merkle. */
function aliasStub(from, slug, c, now) {
  return { sku: from, merged_into: c.sku, slug, name: c.name, brand: c.brand, category_id: c.category_id, category_name: c.category_name, grp: c.grp, image: c.image,
    specs: c.specs && c.specs['Bảo hành'] ? { 'Bảo hành': c.specs['Bảo hành'] } : {}, base_price: c.base_price, kk_price: c.kk_price, in_stock: c.in_stock, sh: c.sh || 0, active: 1,
    trust: c.trust ? { disc: c.trust.disc || 0, fl: c.trust.fl || 0 } : { disc: 0, fl: 0 }, rating: 0, sold: 0, reviews: [], reviewStat: { n: 0, avg: null }, updated_at: now };
}

/* ===================== 2. DUYET TAY OFFER =====================
 * Ma offer  = HMAC(K, sku|nguon|duong dan)  (20 hex)  - on dinh qua cac lan chay, nguoi ngoai khong suy nguoc duoc nguon.
 * Cam ket   = HMAC(K, ma|gia da thay)       (16 hex)  - quan tri duyet DUNG muc gia da nhin thay; gia tut sau hon luc xu ly thi phai duyet lai.
 * K dan xuat tu khoa quan tri (PBKDF2, muoi rieng) - trang quan tri dan xuat cung khoa ngay tren trinh duyet, khong luu khoa goc.
 */
const APPR_SALT = 'kk-approve-v1', APPR_ITER = 300000;
function apprKeys(adminKey) {
  if (!adminKey) return null;
  const K = crypto.pbkdf2Sync(String(adminKey), APPR_SALT, APPR_ITER, 32, 'sha256');
  const h = s => crypto.createHmac('sha256', K).update(s).digest('hex');
  return { oid: (sku, src, url) => h(sku + '|' + src + '|' + (url || '')).slice(0, 20), commit: (id, price) => h(id + '|' + Math.round(price)).slice(0, 16) };
}
/* Tieu de issue do nut bam trong trang quan tri tao ra: "KK-DUYET <ok|no|clear> <SKU> <ma offer 20 hex> <cam ket 16 hex>" */
const TITLE_RE = /^KK-DUYET (ok|no|clear) (KK\d{6}) ([0-9a-f]{20}) ([0-9a-f]{16})$/;
function parseTitle(title) { const m = TITLE_RE.exec(String(title || '').trim()); return m ? { d: m[1], sku: m[2], id: m[3], c: m[4] } : null; }
/* Ghi 1 quyet dinh vao so duyet (doi tuong { v, items: { sku: { id: { d, c, at, by, n } } } }) */
function applyDecision(book, dec, { at, by, n }) {
  book = book && typeof book === 'object' ? book : {}; book.v = 1; book.items = book.items || {};
  if (dec.d === 'clear') { if (book.items[dec.sku]) { delete book.items[dec.sku][dec.id]; if (!Object.keys(book.items[dec.sku]).length) delete book.items[dec.sku]; } return book; }
  (book.items[dec.sku] = book.items[dec.sku] || {})[dec.id] = { d: dec.d, c: dec.c, at, by, n };
  return book;
}
function loadApprovals(file) {
  try { const b = JSON.parse(fs.readFileSync(file, 'utf8')); return b && b.items && typeof b.items === 'object' ? b : { v: 1, items: {} }; } catch { return { v: 1, items: {} }; }
}
/* Trang thai 1 offer theo so duyet. priv = so rieng (nam trong goi quan tri ma hoa): { sku: { id: { p0 } } } - gia da duyet.
 * seen = cac muc gia quan tri co the da nhin thay (gia lan nay, gia trong goi quan tri lan truoc).
 *   'ok'    : da duyet va gia hien tai >= tol x gia da duyet        -> dung dinh gia, bo qua dai gia / bo loc tin cay
 *   'no'    : da tu choi                                            -> loai han khoi san pham nay
 *   'stale' : da duyet nhung gia da tut sau hon muc da duyet / khong khop cam ket -> cho duyet lai
 *   ''      : chua co quyet dinh */
function decisionOf(book, priv, K, sku, id, price, seen = [], tol = 0.9) {
  const e = book && book.items && book.items[sku] && book.items[sku][id]; if (!e) return '';
  if (e.d === 'no') return 'no';
  if (e.d !== 'ok' || !K) return '';
  const pv = (priv[sku] = priv[sku] || {});
  if (!pv[id] || pv[id].c !== e.c) { const p0 = [price, ...seen].find(x => x > 0 && K.commit(id, x) === e.c); if (!p0) return 'stale'; pv[id] = { p0, c: e.c }; }
  return price >= tol * pv[id].p0 ? 'ok' : 'stale';
}

module.exports = { planMerges, aliasStub, yearsOf, apprKeys, parseTitle, applyDecision, loadApprovals, decisionOf, TITLE_RE, APPR_SALT, APPR_ITER };
