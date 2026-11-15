'use strict';
/*
 * DOI TAC GIA DAI LY (KK-PARTNER) - nap bang gia dai ly cua nha phan phoi / hang vao bo thu thap gia.
 *
 * Nguon du lieu (moi doi tac 1 tep collector/partners/<id>.enc, ten tep la ma ngau nhien - khong lo ten doi tac):
 *   - Tep do quan tri tao trong Cong quan tri (tab Doi tac): doc CSV/XLSX trong trinh duyet, ma hoa AES-256-GCM bang khoa dan xuat
 *     tu khoa quan tri (PBKDF2-SHA256, muoi 'kk-partner-v1', 300.000 vong), tai len kho ma. Kho ma cong khai chi thay ban ma hoa.
 *   - Tuy chon: duong dan bang gia truc tiep cua doi tac (Google Sheets / CSV / XLSX / JSON) ghi trong tep - moi lan thu thap doc lai,
 *     doi tac sua bang tinh la KK-MALL cap nhat theo.
 * Ghep san pham: TRUNG MA 100% (ma model cua nha san xuat + cung thuong hieu + khong lech mau / dung luong / tinh trang / so luong goi),
 *   hoac quan tri ghi thang ma SKU KK-MALL vao cot "KK SKU". Dong chi trung ten (khong co ma) -> chi de quan tri duyet tay.
 * Gia dua vao dinh gia = gia dai ly (cong VAT neu bang gia chua gom VAT); ship theo dieu khoan doi tac; gia ban le toi thieu (neu hop dong co) duoc ton trong.
 * Nhat ky cong khai CHI co so dem - khong ten doi tac, khong gia.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const DIR_DEFAULT = path.join(__dirname, 'partners');
const KDF_SALT = 'kk-partner-v1', KDF_ITER = 300000;
const ID_RE = /^dt[0-9a-f]{6,16}$/;

/* ---------- ma hoa (cung dinh dang voi WebCrypto AES-GCM: ban ma || the xac thuc 16 byte) ---------- */
const keyOf = adminKey => crypto.pbkdf2Sync(String(adminKey || '').trim(), KDF_SALT, KDF_ITER, 32, 'sha256');
function encryptDoc(obj, key) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'))), c.final(), c.getAuthTag()]);
  return { v: 1, kind: 'kk-partner', z: 'gzip', iv: iv.toString('base64'), ct: ct.toString('base64') };
}
function decryptDoc(e, key) {
  try {
    if (!e || e.kind !== 'kk-partner') return null;
    const buf = Buffer.from(e.ct, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const pt = Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
    return JSON.parse((e.z === 'gzip' ? zlib.gunzipSync(pt) : pt).toString('utf8'));
  } catch { return null; }
}

/* ---------- doc bang tinh ---------- */
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const foldKey = s => fold(s).replace(/[^a-z0-9]/g, '');

function parseCSV(text) {
  let s = String(text || ''); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  // dau phan cach: dem tren 20 dong dau (bang gia thuong co vai dong tieu de / ten cong ty phia tren dong tieu de cot)
  const head = s.split(/\r?\n/).slice(0, 20), cnt = ch => Math.max(0, ...head.map(l => l.split(ch).length - 1));
  const sep = [['\t', cnt('\t')], [';', cnt(';')], [',', cnt(',')]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === sep) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* XLSX toi gian: zip (doc muc luc trung tam) -> sharedStrings + trang tinh dau tien. Du cho bang gia (khong cong thuc phuc tap). */
function unzip(buf) {
  const out = new Map(); let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('khong phai tep zip');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28), start = off + 30 + lnlen + lxlen, data = buf.subarray(start, start + csize);
    out.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const xmlText = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const colIdx = ref => { let n = 0; for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
function parseXLSX(buf) {
  const z = unzip(buf), get = n => (z.get(n) || Buffer.alloc(0)).toString('utf8');
  const ss = []; for (const m of get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(xmlText((m[1].match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join('')));
  let sheet = 'xl/worksheets/sheet1.xml';
  { const wb = get('xl/workbook.xml'), rel = get('xl/_rels/workbook.xml.rels'), rid = (wb.match(/<sheet [^>]*r:id="([^"]+)"/) || [])[1];
    const t = rid && (rel.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || rel.match(new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"')) || [])[1];
    if (t) sheet = 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, ''); if (!z.has(sheet)) sheet = [...z.keys()].find(k => /^xl\/worksheets\/sheet\d*\.xml$/.test(k)) || sheet; }
  const rows = [];
  for (const m of get(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = [];
    for (const c of m[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = c[1], ref = (a.match(/r="([A-Z]+\d+)"/) || [])[1], t = (a.match(/t="(\w+)"/) || [])[1], body = c[2] || '';
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = t === 's' ? ss[+v] : t === 'inlineStr' ? xmlText((body.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || '') : v != null ? xmlText(v) : '';
      if (t !== 's' && t !== 'inlineStr' && t !== 'str' && val !== '' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(val)) val = +val;
      r[ref ? colIdx(ref) : r.length] = val;
    }
    rows.push(Array.from(r, x => x == null ? '' : x));
  }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function parseAny(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
  if (b.length > 4 && b.readUInt32LE(0) === 0x04034b50) return parseXLSX(b);
  const t = b.toString('utf8').replace(/^﻿/, ''), h = t.trimStart()[0];
  if (h === '[' || h === '{') {
    let j = JSON.parse(t); if (!Array.isArray(j)) j = j.items || j.products || j.data || j.rows || [];
    if (!j.length) return [];
    if (Array.isArray(j[0])) return j;
    const keys = [...new Set(j.flatMap(o => Object.keys(o || {})))];
    return [keys, ...j.map(o => keys.map(k => (o || {})[k] == null ? '' : o[k]))];
  }
  return parseCSV(t);
}

/* ---------- nhan cot (tieu de tieng Viet / tieng Anh) - thu tu kiem tra quan trong ---------- */
const COLS = [
  ['kk', /\bkk ?-?(mall )?sku\b|\bma kk\b|ma (san pham )?kk-?mall/],
  ['ean', /\b(ean|barcode|gtin|upc|isbn)\b|ma vach/],
  ['floor', /gia (ban )?(le )?(toi thieu|san)|gia ban toi thieu|\bmap\b|min(imum)? ?(retail|price|sell)/],
  ['list', /gia (niem yet|ban le|le|de xuat|bia|thi truong)|\b(msrp|rrp|srp)\b|retail ?price|list ?price/],
  ['disc', /chiet khau|\bck\b|discount/],
  ['vat', /^(vat|thue|thue gtgt|% ?vat|vat ?%)$/],
  ['price', /gia (dai ly|si|nhap|net|von|thanh toan|phan phoi|npp|cho kk|hop tac|ban)\b|^gia$|^don gia|don gia|^price$|dealer|wholesale|\bcost\b|unit ?price|net ?price/],
  ['stock', /ton|so luong|^sl$|stock|qty|quantity|^kho$|con hang|tinh trang|availability/],
  ['url', /\blink\b|\burl\b|duong dan/],
  ['brand', /thuong hieu|nhan hieu|^hang$|hang (sx|san xuat)|\bbrand\b|manufacturer|nha san xuat|^nsx$/],
  ['code', /^ma$|ma (hang|sp|san pham|model|mau|nsx|hang hoa|vt|vat tu|ncc)|\bmodel\b|part ?(no|number)|\bmpn\b|\bsku\b|item ?code|product ?code|^code$/],
  ['name', /^ten|ten (hang|sp|san pham|sach)|san pham|mo ta|dien giai|product|description|\bname\b|hang hoa|^tieu de/],
];
function detectHeader(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const map = {}, used = new Set();
    rows[i].forEach((h, j) => { const f = fold(h).replace(/[()\[\]:*]/g, ' ').replace(/\s+/g, ' ').trim(); if (!f || f.length > 60) return;
      for (const [k, re] of COLS) if (!(k in map) && re.test(f)) { map[k] = j; used.add(j); break; } });
    const ok = (('price' in map) || ('list' in map && 'disc' in map)) && (('code' in map) || ('name' in map) || ('kk' in map));
    const n = Object.keys(map).length;
    if (ok && (!best || n > best.n)) best = { hi: i, map, n };
  }
  return best ? { hi: best.hi, map: best.map } : null;
}

/* ---------- chuan hoa dong ---------- */
const priceOf = v => { if (typeof v === 'number') return Math.round(v); let s = String(v || '').replace(/[^\d.,]/g, ''); if (!s) return 0; s = s.replace(/[.,]\d{1,2}$/, ''); const n = parseInt(s.replace(/[.,]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
function stockOf(v, def) {
  if (typeof v === 'number') return v > 0 ? 1 : 0;
  const s = fold(v); if (!s) return def;
  if (/^\d+([.,]\d+)?$/.test(s)) return +s.replace(',', '.') > 0 ? 1 : 0;
  if (/het|ngung|khong co|tam het|lien he|out of stock|^no$|^false$|discontinued/.test(s)) return 0;
  return 1;
}
function normRows(rows, hd, terms = {}) {
  if (!hd) return [];
  const m = hd.map, at = (r, k) => (k in m ? r[m[k]] : ''), def = terms.stockDefault === 0 ? 0 : 1, out = [];
  for (const r of rows.slice(hd.hi + 1)) {
    const code = String(at(r, 'code') || '').trim().slice(0, 80), name = String(at(r, 'name') || '').replace(/\s+/g, ' ').trim().slice(0, 200), kk = String(at(r, 'kk') || '').trim().toUpperCase();
    if (!code && !name && !kk) continue;
    const list = priceOf(at(r, 'list'));
    let price = priceOf(at(r, 'price'));
    if (!price && list && 'disc' in m) { const d = parseFloat(String(at(r, 'disc')).replace(',', '.').replace(/[^\d.]/g, '')); if (d > 0 && d < 90) price = Math.round(list * (1 - d / 100)); }
    if (!price || price < 1000) continue;
    const vr = 'vat' in m ? parseFloat(String(at(r, 'vat')).replace(',', '.').replace(/[^\d.]/g, '')) : NaN;
    const vat = terms.vatIncluded ? 0 : (Number.isFinite(vr) ? (vr < 1 ? vr * 100 : vr) : (+terms.vat || 0));
    const gross = Math.round(price * (1 + vat / 100));
    let floor = priceOf(at(r, 'floor')); if (!floor && terms.floorFromList && list) floor = list;
    const url = String(at(r, 'url') || '').trim();
    out.push({ code, name, brand: String(at(r, 'brand') || terms.brand || '').trim().slice(0, 60), price: gross, net: price, vat, stock: stockOf(at(r, 'stock'), def),
      floor: floor > gross ? floor : 0, list, kk: /^KK\d{6}$/.test(kk) ? kk : '', url: /^https:\/\//i.test(url) ? url.slice(0, 500) : '', ean: String(at(r, 'ean') || '').replace(/\D/g, '').slice(0, 14) });
  }
  return out;
}

/* ---------- nap tat ca doi tac ---------- */
const sheetsCsv = u => { const m = String(u).match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/); if (!m || /\/export\?|output=csv|format=csv/.test(u)) return u; const gid = (String(u).match(/[#&?]gid=(\d+)/) || [])[1] || '0'; return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`; };
async function fetchBuf(url, timeout = 60000, max = 40 * 1048576) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'KK-MALL-PartnerFeed/1.0 (+https://www.kk-mall.com/doi-tac.html)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status); const b = Buffer.from(await r.arrayBuffer()); if (b.length > max) throw new Error('qua lon'); return b; }
  finally { clearTimeout(t); }
}
const vnDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

async function load(env = process.env, log = () => { }, opts = {}) {
  const dir = env.PARTNER_DIR || DIR_DEFAULT, akey = String(env.ADMIN_PORTAL_KEY || '').trim(), out = [], st = { files: 0, bad: 0, inactive: 0, expired: 0, urlOk: 0, urlErr: 0 };
  if (!fs.existsSync(dir)) return { partners: out, stat: st };
  const files = fs.readdirSync(dir).filter(f => /\.enc$/.test(f)).sort(); st.files = files.length;
  if (!files.length) return { partners: out, stat: st };
  if (!akey) { log('Doi tac gia dai ly: thieu khoa quan tri - bo qua ' + files.length + ' tep'); st.bad = files.length; return { partners: out, stat: st }; }
  const key = keyOf(akey), today = opts.today || vnDay(), fetcher = opts.fetch || fetchBuf;
  for (const f of files) {
    let doc = null; try { doc = decryptDoc(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), key); } catch { doc = null; }
    if (!doc || !ID_RE.test(String(doc.id || '')) || f !== doc.id + '.enc') { st.bad++; continue; }
    if (doc.active === false) { st.inactive++; continue; }
    const terms = doc.terms || {}, P = { id: doc.id, name: String(doc.name || doc.id).slice(0, 120), contact: doc.contact || {}, terms, rows: doc.rows ? doc.rows.map(r => Array.isArray(r) ? { code: r[0], name: r[1], brand: r[2], price: r[3], stock: r[4], floor: r[5], list: r[6], kk: r[7], url: r[8], ean: r[9], net: r[10], vat: r[11] } : r) : [],
      updated_at: doc.updated_at || '', file: doc.file || null, feedUrl: doc.feed && doc.feed.url ? String(doc.feed.url) : '', stat: { src: 'file', err: '', expired: 0 } };
    if (Array.isArray(doc.grid) && doc.grid.length) P.rows = normRows(doc.grid, doc.hd && doc.hd.map ? doc.hd : detectHeader(doc.grid), terms);   // tep do Cong quan tri lap: luoi o + cot da chon, chuan hoa tai day (1 noi duy nhat)
    const url = doc.feed && /^https:\/\//i.test(String(doc.feed.url || '')) ? sheetsCsv(doc.feed.url) : '';
    if (url) {
      try { const grid = parseAny(await fetcher(url)); const hd = doc.feed.cols ? { hi: doc.feed.hi || 0, map: doc.feed.cols } : detectHeader(grid); const rows = normRows(grid, hd, terms);
        if (rows.length) { P.rows = rows; P.stat.src = 'url'; st.urlOk++; } else { P.stat.err = 'đường dẫn bảng giá không có dòng hợp lệ (dùng bảng giá trong tệp)'; st.urlErr++; } }
      catch (e) { P.stat.err = 'không đọc được đường dẫn bảng giá: ' + String(e && e.message || e).slice(0, 60) + ' (dùng bảng giá trong tệp)'; st.urlErr++; }
    }
    if (terms.validTo && String(terms.validTo) < today) { P.stat.expired = 1; st.expired++; }
    out.push(P);
  }
  return { partners: out, stat: st };
}

/* ---------- ghep ma 100% ---------- */
function createMatcher(catalog, MATCH, normKey, resolve = s => s) {
  const bySku = new Map(catalog.map(p => [p.sku, p])), F = new Map(), feats = sku => { let f = F.get(sku); if (!f) { f = MATCH.features(bySku.get(sku).name); F.set(sku, f); } return f; };
  const codesOf = f => { const s = new Set(); for (const c of f.strong) { s.add(c.full); s.add(c.core); } for (const t of f.ids) s.add(t); return s; };
  const okCode = c => c && c.length >= 3 && /\d/.test(c) && /[a-z]/.test(c) || (c && c.length >= 6 && /^\d+$/.test(c));
  const codeIdx = new Map(), nameIdx = new Map();
  for (const p of catalog) { const f = feats(p.sku); for (const c of codesOf(f)) if (okCode(c)) { let a = codeIdx.get(c); if (!a) codeIdx.set(c, a = []); a.push(p.sku); }
    const k = normKey(p.name); let a = nameIdx.get(k); if (!a) nameIdx.set(k, a = []); a.push(p.sku); }
  const setEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x)), meets = (a, b) => [...a].some(x => b.has(x));
  function conflict(R, P) {
    if (R.cond !== P.cond) return 'lệch tình trạng (mới / đã qua sử dụng)';
    if (R.acc !== P.acc || R.bundle !== P.bundle) return 'lệch loại hàng (phụ kiện / combo)';
    if (R.pack > 1 && P.pack > 1 && R.pack !== P.pack) return 'lệch số lượng gói';
    if (R.color.size && P.color.size && !meets(R.color, P.color)) return 'lệch màu';
    if (R.sfx.size && P.sfx.size && !meets(R.sfx, P.sfx)) return 'lệch hậu tố mã (màu / vùng)';
    if (R.variant.size && P.variant.size && !setEq(R.variant, P.variant)) return 'lệch phiên bản';
    for (const k of Object.keys(R.spec)) if (P.spec[k] && !setEq(R.spec[k], P.spec[k])) return 'lệch thông số (' + k + ')';
    return '';
  }
  function match(row) {
    if (row.kk) { const s = resolve(row.kk); return bySku.has(s) ? { skus: [s], mode: 'kk' } : { skus: [], why: 'mã KK SKU không còn trong danh mục' }; }
    const full = [row.brand, row.name, row.code].filter(Boolean).join(' '), R = MATCH.features(full), C = row.code ? MATCH.features(row.code) : R;
    let rc = [...C.strong.map(c => c.full), ...C.ids].filter(okCode); if (!rc.length && C !== R) rc = [...R.strong.map(c => c.full), ...R.ids].filter(okCode);
    const rb = new Set([...R.brands, foldKey(row.brand)].filter(Boolean));
    if (!rc.length) { const a = nameIdx.get(normKey(row.name || '')) || []; return a.length === 1 ? { skus: a, mode: 'name' } : { skus: [], why: a.length > 1 ? 'chỉ trùng tên, nhiều sản phẩm cùng tên' : 'không có mã model' }; }
    if (!rb.size) return { skus: [], why: 'thiếu thương hiệu (thêm cột Thương hiệu hoặc khai thương hiệu mặc định)' };
    const main = rc.slice().sort((a, b) => b.length - a.length)[0];
    const cand = codeIdx.get(main) || [];
    if (!cand.length) return { skus: [], why: 'KK-MALL chưa có sản phẩm mã này' };
    const ok = [], whyN = {};
    for (const sku of cand) { const P = feats(sku), pc = codesOf(P), pb = new Set([...P.brands, foldKey(bySku.get(sku).brand)].filter(Boolean));
      if (!rc.every(c => pc.has(c))) { whyN['khác mã'] = 1; continue; }
      if (!meets(rb, pb)) { whyN['khác thương hiệu'] = 1; continue; }
      const w = conflict(R, P); if (w) { whyN[w] = 1; continue; }
      ok.push(sku); }
    if (ok.length === 1) return { skus: ok, mode: 'code' };
    if (!ok.length) return { skus: [], why: Object.keys(whyN).join(', ') || 'không khớp' };
    const tw = ok.filter(s => MATCH.codeTwin(feats(s), R)); if (tw.length === 1) return { skus: tw, mode: 'code' };
    if (new Set(ok.map(s => MATCH.signature(feats(s)))).size === 1) return { skus: ok, mode: 'code' };   // cung chu ky bien the = cung 1 mat hang dang o nhieu trang
    return { skus: [], amb: 1, why: 'mơ hồ: ' + ok.length + ' sản phẩm cùng mã khác biến thể (ghi rõ màu / dung lượng hoặc cột KK SKU)' };
  }
  return { match };
}

/* offer cho bo dinh gia: moi doi tac x SKU giu dong re nhat con hang */
function offersFor(partners, M) {
  const offers = [], per = {};
  /* url: khong co trang SP -> dia chi noi bo kkpartner:<id>/<ma> (ma duyet tay can 1 dia chi on dinh; bot dat hang tu dong khong mo dia chi nay) */
  for (const P of partners) {
    const s = per[P.id] = { rows: P.rows.length, code: 0, kk: 0, name: 0, amb: 0, none: 0, stock: 0, expired: P.stat.expired, src: P.stat.src, err: P.stat.err, unmatched: [] };
    if (P.stat.expired) continue;
    const best = new Map();
    for (const r of P.rows) {
      const m = M.match(r);
      if (!m.skus.length) { if (m.amb) s.amb++; else s.none++; if (s.unmatched.length < 300) s.unmatched.push([r.code || '', String(r.name || '').slice(0, 90), r.price, m.why || '']); continue; }
      s[m.mode]++; if (r.stock) s.stock++;
      for (const sku of m.skus) { const cur = best.get(sku); if (!cur || (r.stock && !cur.r.stock) || (r.stock === cur.r.stock && r.price < cur.r.price)) best.set(sku, { r, mode: m.mode }); }
    }
    for (const [sku, { r, mode }] of best) offers.push({ sku, src: P.id, price: r.price, net: r.net || r.price, stock: r.stock ? 1 : 0, url: r.url || ('kkpartner:' + P.id + '/' + encodeURIComponent(String(r.code || r.kk || r.name || '').slice(0, 60))), floor: r.floor || 0, list: r.list || 0,
      pc: r.code || '', name: [r.brand, r.name, r.code].filter(Boolean).join(' ').slice(0, 200), mode });
  }
  return { offers, per };
}

module.exports = { keyOf, encryptDoc, decryptDoc, parseCSV, parseXLSX, parseAny, unzip, detectHeader, normRows, load, createMatcher, offersFor, sheetsCsv, fold, foldKey, ID_RE, KDF_SALT, KDF_ITER, vnDay };
