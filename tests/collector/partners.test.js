'use strict';
/*
 * KIEM THU BANG GIA DAI LY CUA DOI TAC (collector/partners.js) - khong goi ra Internet.
 * Kiem: ma hoa tuong thich trinh duyet (WebCrypto), doc CSV / XLSX / JSON, nhan cot tieng Viet, VAT, chiet khau, gia ban le toi thieu,
 * ton kho, het han, tat doi tac, duong dan truc tiep (co du phong), ghep TRUNG MA 100% (thuong hieu, mau, dung luong, tinh trang, mo ho), KK SKU.
 * Chay: node tests/collector/partners.test.js
 */
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const PT = require('../../collector/partners'), MATCH = require('../../collector/match'), FEEDS = require('../../collector/feeds');
let pass = 0, fail = 0; const t = (ok, name) => { if (ok) pass++; else { fail++; console.log('  ✘ ' + name); } };

/* zip toi gian (de tao tep XLSX that trong kiem thu) */
function makeZip(files) {
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), nb = Buffer.from(name, 'utf8');
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nb.length, 26);
    loc.push(h, nb, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cen.length / 2, 8); e.writeUInt16LE(cen.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
function makeXlsx(rows) {
  const ss = [], sid = s => { let i = ss.indexOf(s); if (i < 0) { ss.push(s); i = ss.length - 1; } return i; };
  const col = i => String.fromCharCode(65 + i);
  const sheet = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${sid(String(v))}</v></c>`).join('') + '</row>').join('');
  return makeZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Bang gia" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst>' + ss.map(s => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('') + '</sst>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
  });
}

(async () => {
  const KEY = 'khoa-quan-tri-thu-nghiem-local';
  /* ---------- 1) Ma hoa: Node <-> WebCrypto (dinh dang trinh duyet tao trong Cong quan tri) ---------- */
  { const k = PT.keyOf(KEY), doc = { id: 'dt0a1b2c', name: 'Đối tác A', rows: [['X1', 'Sản phẩm', 'Hãng', 100000]] };
    t(JSON.stringify(PT.decryptDoc(PT.encryptDoc(doc, k), k)) === JSON.stringify(doc), 'ma hoa / giai ma khu hoi');
    t(PT.decryptDoc(PT.encryptDoc(doc, k), PT.keyOf('khoa-sai')) === null, 'sai khoa -> khong giai ma duoc (khong nem loi)');
    const sub = crypto.webcrypto.subtle, te = new TextEncoder();
    const base = await sub.importKey('raw', te.encode(KEY), 'PBKDF2', false, ['deriveBits']);
    const bits = await sub.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(PT.KDF_SALT), iterations: PT.KDF_ITER }, base, 256);
    const aes = await sub.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt']), iv = crypto.randomBytes(12);
    const ct = await sub.encrypt({ name: 'AES-GCM', iv }, aes, zlib.gzipSync(Buffer.from(JSON.stringify(doc))));
    const e = { v: 1, kind: 'kk-partner', z: 'gzip', iv: iv.toString('base64'), ct: Buffer.from(ct).toString('base64') };
    t(PT.decryptDoc(e, k) && PT.decryptDoc(e, k).name === 'Đối tác A', 'tep do trinh duyet ma hoa (WebCrypto) giai ma duoc o bo thu thap'); }

  /* ---------- 2) Doc bang tinh ---------- */
  { const csv = '﻿STT;Mã hàng;Tên hàng;Thương hiệu;"Giá đại lý (chưa VAT)";Giá bán lẻ đề xuất;Tồn kho\n1;KAQ-X26;"Máy lọc nước RO; 10 lõi";Karofi;5.400.000;7.760.000;12\n2;SHD6803;Bếp từ đơn;Sunhouse;650.000;;Hết hàng\n';
    const g = PT.parseCSV(csv); t(g.length === 3 && g[1][2] === 'Máy lọc nước RO; 10 lõi' && g[0][1] === 'Mã hàng', 'CSV: dau ; , ngoac kep, BOM');
    const hd = PT.detectHeader(g); t(hd && hd.hi === 0 && hd.map.code === 1 && hd.map.name === 2 && hd.map.brand === 3 && hd.map.price === 4 && hd.map.list === 5 && hd.map.stock === 6, 'nhan cot tieu de tieng Viet (ma, ten, hang, gia dai ly, gia ban le, ton)');
    const rows = PT.normRows(g, hd, { vat: 10 });
    t(rows.length === 2 && rows[0].price === 5940000 && rows[0].net === 5400000 && rows[0].stock === 1 && rows[1].stock === 0, 'gia chua VAT -> cong VAT 10%; ton "Het hang" -> 0');
    t(PT.normRows(g, hd, { vat: 10, vatIncluded: true })[0].price === 5400000, 'bang gia da gom VAT -> khong cong them');
    t(PT.normRows(g, hd, { floorFromList: true })[0].floor === 7760000 && PT.normRows(g, hd, {})[0].floor === 0, 'gia ban le de xuat chi thanh gia toi thieu khi dieu khoan yeu cau');
    const books = PT.parseCSV('Tên sách,Giá bìa,Chiết khấu (%),ISBN\nĐắc Nhân Tâm,120000,35,8934974178637\n');
    const bh = PT.detectHeader(books), br = PT.normRows(books, bh, {}); t(bh && br.length === 1 && br[0].price === 78000 && br[0].ean === '8934974178637', 'sach: gia = gia bia x (1 - chiet khau), doc ISBN');
    const top = PT.parseCSV('BẢNG GIÁ THÁNG 11/2026\nCông ty ABC\n\nModel,Description,Brand,Dealer price,Qty\nMK240,Combo keyboard mouse,Logitech,410000,5\n');
    const th = PT.detectHeader(top); t(th && th.hi === 2 && PT.normRows(top, th, {})[0].code === 'MK240', 'tieu de nam o dong 4 (co dong tieu de bang gia phia tren), tieu de tieng Anh');
    const x = makeXlsx([['Mã SP', 'Tên sản phẩm', 'Hãng', 'Đơn giá', 'SL'], ['CRP-LHTR1009F/WHSIVNCV', 'Nồi cơm cao tần 1.8L', 'Cuckoo', 8900000, 3]]);
    const xg = PT.parseAny(x); t(xg.length === 2 && xg[1][0] === 'CRP-LHTR1009F/WHSIVNCV' && xg[1][3] === 8900000, 'XLSX: doc chuoi chung + so');
    const jg = PT.parseAny(Buffer.from(JSON.stringify({ items: [{ model: 'G304', name: 'Chuột', brand: 'Logitech', price: 600000 }] })));
    t(jg.length === 2 && PT.normRows(jg, PT.detectHeader(jg), {})[0].code === 'G304', 'JSON: mang doi tuong');
    t(PT.sheetsCsv('https://docs.google.com/spreadsheets/d/AbC_1-x/edit#gid=123') === 'https://docs.google.com/spreadsheets/d/AbC_1-x/export?format=csv&gid=123', 'Google Sheets: doi sang dia chi xuat CSV'); }

  /* ---------- 3) Ghep TRUNG MA 100% ---------- */
  const cat = [
    { sku: 'KK000001', name: 'Máy lọc nước RO Karofi KAQ-X26 10 lõi', brand: 'Karofi' },
    { sku: 'KK000002', name: 'Nồi cơm áp suất cao tần Cuckoo 1.8 lít CRP-LHTR1009F/WHSIVNCV', brand: 'Cuckoo' },
    { sku: 'KK000003', name: 'Chuột không dây Logitech G304 Đen', brand: 'Logitech' },
    { sku: 'KK000004', name: 'Chuột không dây Logitech G304 Trắng', brand: 'Logitech' },
    { sku: 'KK000005', name: 'Ổ cứng SSD Samsung 990 PRO 1TB MZ-V9P1T0BW', brand: 'Samsung' },
    { sku: 'KK000006', name: 'Ổ cứng SSD Samsung 990 PRO 2TB MZ-V9P2T0BW', brand: 'Samsung' },
    { sku: 'KK000007', name: 'Sách Đắc Nhân Tâm', brand: 'First News' },
    { sku: 'KK000008', name: 'Bàn phím Logitech K580 (Hàng trưng bày)', brand: 'Logitech' },
    { sku: 'KK000009', name: 'Router Wifi AC1200 TP-Link Archer C64', brand: 'TP-Link' },
    { sku: 'KK000010', name: 'Router Wifi băng tần kép TP-Link Archer C64 AC1200', brand: 'TP-Link' },
  ];
  const M = PT.createMatcher(cat, MATCH, FEEDS.normKey, s => s === 'KK999999' ? 'KK000001' : s);
  const mm = r => M.match(r);
  { let r = mm({ code: 'KAQ-X26', name: 'Máy lọc nước', brand: 'Karofi' }); t(r.mode === 'code' && r.skus.join() === 'KK000001', 'trung ma + thuong hieu -> ghep');
    r = mm({ code: 'KAQ-X26', name: 'Máy lọc nước', brand: 'Kangaroo' }); t(!r.skus.length && /thương hiệu/.test(r.why), 'cung ma, khac thuong hieu -> KHONG ghep');
    r = mm({ code: 'CRP-LHTR1009F/WHSIVNCV', name: 'Nồi cơm', brand: 'Cuckoo' }); t(r.skus.join() === 'KK000002', 'ma dai co dau / va hau to mau dinh lien');
    r = mm({ code: 'G304', name: 'Chuột', brand: 'Logitech' }); t(!r.skus.length && r.amb === 1, 'cung ma, 2 mau trong danh muc, bang gia khong ghi mau -> mo ho, KHONG ghep');
    r = mm({ code: 'G304', name: 'Chuột không dây trắng', brand: 'Logitech' }); t(r.skus.join() === 'KK000004', 'ghi ro mau -> ghep dung mau');
    r = mm({ code: 'MZ-V9P1T0BW', name: 'SSD 990 PRO 1TB', brand: 'Samsung' }); t(r.skus.join() === 'KK000005', 'SSD 1TB ghep dung dung luong');
    r = mm({ code: 'MZ-V9P1T0BW', name: 'SSD 990 PRO 2TB', brand: 'Samsung' }); t(!r.skus.length, 'ma 1TB nhung ten ghi 2TB -> lech thong so, KHONG ghep');
    r = mm({ code: 'K580', name: 'Bàn phím', brand: 'Logitech' }); t(!r.skus.length && /tình trạng/.test(r.why), 'hang moi khong ghep vao san pham hang trung bay');
    r = mm({ code: 'Archer C64', name: 'Router', brand: 'TP-Link' }); t(r.skus.length === 2, 'cung 1 mat hang dang o 2 trang (cung chu ky bien the) -> ghep ca 2');
    r = mm({ kk: 'KK999999' }); t(r.mode === 'kk' && r.skus.join() === 'KK000001', 'cot KK SKU: ghep thang, theo ma chuan neu da gop');
    r = mm({ code: '', name: 'Đắc Nhân Tâm', brand: '' }); t(!r.skus.length, 'ten khong trung chuan hoa 100% -> khong ghep');
    r = mm({ code: '', name: 'Sách Đắc Nhân Tâm', brand: '' }); t(r.mode === 'name' && r.skus.join() === 'KK000007', 'chi trung ten chuan hoa (khong co ma) -> che do "name" (chi de duyet tay)');
    r = mm({ code: 'ZZ9999X', name: 'abc', brand: 'Sony' }); t(!r.skus.length && /chưa có/.test(r.why), 'ma khong co trong danh muc'); }

  /* ---------- 4) Nap tep ma hoa + duong dan truc tiep + het han + tat ---------- */
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkpt-')), k = PT.keyOf(KEY), w = (id, doc) => fs.writeFileSync(path.join(dir, id + '.enc'), JSON.stringify(PT.encryptDoc({ id, ...doc }, k)));
    w('dt000001', { name: 'NPP Gia dụng', terms: { reach: 'vn', vat: 0, validTo: '2099-12-31', ship: { tiers: [[0, 0]] } }, rows: [['KAQ-X26', 'Máy lọc nước', 'Karofi', 5900000, 1, 0], ['KAQ-X26', 'Máy lọc nước', 'Karofi', 5800000, 1, 6500000], ['ZZ9999X', 'Không có', 'Sony', 100000, 1, 0]] });
    w('dt000002', { name: 'NPP hết hạn', terms: { validTo: '2020-01-01' }, rows: [['SHD6803', 'Bếp', 'Sunhouse', 700000, 1, 0]] });
    w('dt000003', { name: 'NPP tạm dừng', active: false, rows: [] });
    w('dt000004', { name: 'NPP bảng tính trực tiếp', terms: { vat: 8 }, feed: { url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0' }, rows: [['G304', 'Chuột trắng', 'Logitech', 500000, 1, 0]] });
    w('dt000005', { name: 'NPP đường dẫn hỏng', feed: { url: 'https://bang-gia.test/x.csv' }, rows: [['MK240', 'Combo', 'Logitech', 400000, 1, 0]] });
    w('dt000006', { name: 'NPP lưới ô (Cổng quản trị)', terms: { vat: 10, brand: 'Sunhouse' }, grid: [['code', 'name', 'price', 'stock'], ['SHD6803', 'Bếp từ đơn', '600.000', 'Còn hàng']], hd: { hi: 0, map: { code: 0, name: 1, price: 2, stock: 3 } } });
    fs.writeFileSync(path.join(dir, 'dt0000ff.enc'), JSON.stringify(PT.encryptDoc({ id: 'dt0000ff', name: 'Khóa khác' }, PT.keyOf('khoa-khac'))));
    fs.writeFileSync(path.join(dir, 'dt0000aa.enc'), JSON.stringify(PT.encryptDoc({ id: 'dt0000bb', name: 'Sai tên tệp' }, k)));
    const urls = [];
    const fetch = async u => { urls.push(u); if (/docs\.google/.test(u)) return Buffer.from('Mã hàng,Tên hàng,Hãng,Đơn giá\nG304,Chuột không dây trắng,Logitech,450000\n'); throw new Error('HTTP 404'); };
    const logs = []; const L = await PT.load({ PARTNER_DIR: dir, ADMIN_PORTAL_KEY: KEY }, m => logs.push(m), { fetch, today: '2026-11-15' });
    const by = Object.fromEntries(L.partners.map(P => [P.id, P]));
    t(L.stat.files === 8 && L.stat.bad === 2 && L.stat.inactive === 1 && L.partners.length === 5, 'nap: dem tep, bo tep sai khoa / sai ten, bo doi tac tam dung');
    t(by.dt000006.rows.length === 1 && by.dt000006.rows[0].price === 660000 && by.dt000006.rows[0].brand === 'Sunhouse' && by.dt000006.rows[0].stock === 1, 'tep luoi o tu Cong quan tri: chuan hoa tai bo thu thap (VAT, thuong hieu mac dinh)');
    t(by.dt000002.stat.expired === 1 && L.stat.expired === 1, 'bang gia het hieu luc duoc danh dau');
    t(by.dt000004.stat.src === 'url' && by.dt000004.rows.length === 1 && by.dt000004.rows[0].price === 486000 && urls[0].includes('/export?format=csv&gid=0'), 'duong dan Google Sheets: doc truc tiep, cong VAT 8%');
    t(by.dt000005.stat.src === 'file' && /không đọc được/.test(by.dt000005.stat.err) && by.dt000005.rows.length === 1, 'duong dan loi -> dung bang gia trong tep, ghi canh bao');
    const nk = await PT.load({ PARTNER_DIR: dir }, m => logs.push(m)); t(!nk.partners.length && nk.stat.bad === 8, 'thieu khoa quan tri -> khong nap gi');
    const O = PT.offersFor(L.partners, M);
    const o1 = O.offers.filter(o => o.src === 'dt000001');
    t(o1.length === 1 && o1[0].sku === 'KK000001' && o1[0].price === 5800000 && o1[0].floor === 6500000 && o1[0].pc === 'KAQ-X26' && o1[0].url.startsWith('kkpartner:dt000001/'), 'moi SKU giu dong re nhat; khong co trang SP -> dia chi noi bo kkpartner:');
    t(!O.offers.some(o => o.src === 'dt000002'), 'doi tac het han khong tao offer');
    t(O.offers.some(o => o.src === 'dt000004' && o.sku === 'KK000004'), 'offer tu bang tinh truc tiep ghep dung mau');
    t(O.per.dt000001.none === 1 && O.per.dt000001.unmatched[0][3] && O.per.dt000001.code === 2, 'thong ke ghep + ly do dong chua ghep cho quan tri');
    t(!logs.some(m => /NPP|Karofi|5800000|5\.800\.000/.test(m)), 'nhat ky khong lo ten doi tac / gia');
    fs.rmSync(dir, { recursive: true, force: true }); }

  /* ---------- 5) Ma cua tab Doi tac (site/admin/partners.js) chay nhu trong trinh duyet: doc XLSX/CSV, nhan cot, ma hoa -> bo thu thap doc duoc ---------- */
  { const vm = require('vm'), store = {}, ctx = { console, TextDecoder, TextEncoder, Response, Blob, DecompressionStream, CompressionStream, crypto: crypto.webcrypto, btoa, atob, Uint8Array, DataView, Map, Set, JSON, Math, String, Number, Array, Object, RegExp, Promise, Error, Date,
      sessionStorage: { getItem: k => store[k], setItem: (k, v) => { store[k] = v; } }, DATA: { partners: [] }, $: () => null, esc: s => String(s) };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../../site/admin/partners.js'), 'utf8') + ';this.api = { ptReadFile, ptDetect, ptEncrypt };', ctx);
    const A = ctx.api, file = (name, buf) => ({ name, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
    const xg = await A.ptReadFile(file('bang-gia.xlsx', makeXlsx([['BẢNG GIÁ ĐẠI LÝ 11/2026'], ['Mã hàng', 'Tên hàng', 'Hãng', 'Giá đại lý', 'Tồn kho'], ['KAQ-X26', 'Máy lọc nước', 'Karofi', 5400000, 4]])));
    const hd = A.ptDetect(xg); t(xg.length === 3 && hd.hi === 1 && hd.map.code === 0 && hd.map.price === 3 && hd.map.stock === 4, 'trinh duyet: doc XLSX (DecompressionStream deflate-raw) + nhan cot');
    const cg = await A.ptReadFile(file('a.csv', Buffer.from('\ufeffModel;Tên;Brand;Đơn giá\nG304;Chuột trắng;Logitech;450.000\n'))); t(cg.length === 2 && A.ptDetect(cg).map.price === 3, 'trinh duyet: doc CSV dau ;');
    store.kk_partner_key = PT.keyOf(KEY).toString('hex');
    const keys = Object.keys(hd.map), map = {}; keys.forEach((k, i) => { map[k] = i; });
    const doc = { id: 'dt00abcd', name: 'NPP từ trình duyệt', active: true, contact: { email: 'po@npp.test' }, terms: { vat: 10 }, grid: [keys].concat(xg.slice(hd.hi + 1).map(r => keys.map(k => r[hd.map[k]] ?? ''))), hd: { hi: 0, map } };
    const enc = await A.ptEncrypt(doc), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkpt2-')); fs.writeFileSync(path.join(dir, 'dt00abcd.enc'), JSON.stringify(enc));
    const L = await PT.load({ PARTNER_DIR: dir, ADMIN_PORTAL_KEY: KEY }, () => { });
    t(L.partners.length === 1 && L.partners[0].rows.length === 1 && L.partners[0].rows[0].price === 5940000 && L.partners[0].rows[0].code === 'KAQ-X26', 'tep do trinh duyet ma hoa (CompressionStream + AES-GCM) -> bo thu thap giai ma, cong VAT');
    fs.rmSync(dir, { recursive: true, force: true }); }

  console.log(`\nBang gia dai ly doi tac: ${pass}/${pass + fail} dat`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
