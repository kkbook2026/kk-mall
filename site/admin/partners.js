'use strict';
/*
 * TAB "DOI TAC GIA DAI LY" - Cong quan tri KK-MALL.
 * - Doc bang gia doi tac (CSV / XLSX / JSON) NGAY TRONG TRINH DUYET, tu nhan cot (tieng Viet / tieng Anh), cho chinh lai cot.
 * - Ma hoa AES-256-GCM bang khoa dan xuat tu khoa quan tri (PBKDF2-SHA256, muoi 'kk-partner-v1', 300.000 vong) -> tep <ma>.enc.
 *   Tep KHONG roi trinh duyet o dang ro: quan tri tai tep ma hoa, keo vao trang tai len GitHub -> bo thu thap tu tinh lai gia.
 * - Bang doi tac: thong ke ghep ma, so SP dang lay gia dai ly, so SP re nhat thi truong nho doi tac, dong chua ghep (tai CSV de bo sung cot KK SKU).
 * - Lap don dat hang (PO) gui doi tac tu cac lenh mua dang cho dat.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const PT_REPO = 'kkbook2026/kk-mall';
let PT_GRID = null, PT_HD = null, PT_FNAME = '';
const ptList = () => (typeof DATA !== 'undefined' && DATA && DATA.partners) || [];
const ptIs = s => ptList().some(p => p.id === s);
const ptFold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const PT_KEYS = [['code', 'Mã hàng / model *'], ['name', 'Tên hàng'], ['brand', 'Thương hiệu'], ['price', 'Giá đại lý *'], ['list', 'Giá bán lẻ đề xuất / giá bìa'], ['disc', 'Chiết khấu %'],
  ['floor', 'Giá bán lẻ tối thiểu (theo hợp đồng)'], ['vat', 'VAT % từng dòng'], ['stock', 'Tồn kho / tình trạng'], ['kk', 'KK SKU (ghép thẳng)'], ['url', 'Link sản phẩm'], ['ean', 'EAN / mã vạch / ISBN']];
/* cung bo quy tac voi collector/partners.js (COLS) */
const PT_COLS = [
  ['kk', /\bkk ?-?(mall )?sku\b|\bma kk\b|ma (san pham )?kk-?mall/], ['ean', /\b(ean|barcode|gtin|upc|isbn)\b|ma vach/],
  ['floor', /gia (ban )?(le )?(toi thieu|san)|gia ban toi thieu|\bmap\b|min(imum)? ?(retail|price|sell)/],
  ['list', /gia (niem yet|ban le|le|de xuat|bia|thi truong)|\b(msrp|rrp|srp)\b|retail ?price|list ?price/], ['disc', /chiet khau|\bck\b|discount/],
  ['vat', /^(vat|thue|thue gtgt|% ?vat|vat ?%)$/],
  ['price', /gia (dai ly|si|nhap|net|von|thanh toan|phan phoi|npp|cho kk|hop tac|ban)\b|^gia$|^don gia|don gia|^price$|dealer|wholesale|\bcost\b|unit ?price|net ?price/],
  ['stock', /ton|so luong|^sl$|stock|qty|quantity|^kho$|con hang|tinh trang|availability/], ['url', /\blink\b|\burl\b|duong dan/],
  ['brand', /thuong hieu|nhan hieu|^hang$|hang (sx|san xuat)|\bbrand\b|manufacturer|nha san xuat|^nsx$/],
  ['code', /^ma$|ma (hang|sp|san pham|model|mau|nsx|hang hoa|vt|vat tu|ncc)|\bmodel\b|part ?(no|number)|\bmpn\b|\bsku\b|item ?code|product ?code|^code$/],
  ['name', /^ten|ten (hang|sp|san pham|sach)|san pham|mo ta|dien giai|product|description|\bname\b|hang hoa|^tieu de/]];
function ptDetect(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const map = {}; rows[i].forEach((h, j) => { const f = ptFold(h).replace(/[()\[\]:*]/g, ' ').replace(/\s+/g, ' ').trim(); if (!f || f.length > 60) return; for (const [k, re] of PT_COLS) if (!(k in map) && re.test(f)) { map[k] = j; break; } });
    const ok = (('price' in map) || ('list' in map && 'disc' in map)) && (('code' in map) || ('name' in map) || ('kk' in map)), n = Object.keys(map).length;
    if (ok && (!best || n > best.n)) best = { hi: i, map, n };
  }
  return best ? { hi: best.hi, map: best.map } : { hi: 0, map: {} };
}
/* ---------- doc tep ---------- */
function ptCSV(text) {
  let s = String(text || ''); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const head = s.split(/\r?\n/).slice(0, 20), cnt = ch => Math.max(0, ...head.map(l => l.split(ch).length - 1));
  const sep = [['\t', cnt('\t')], [';', cnt(';')], [',', cnt(',')]].sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === sep) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
async function ptInflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
async function ptUnzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder(), out = new Map(); let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Tệp không phải XLSX hợp lệ');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    if (/^xl\/(sharedStrings|workbook|worksheets\/sheet\d+|_rels\/workbook)\.xml(\.rels)?$/.test(name)) {
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
      out.set(name, td.decode(method === 8 ? await ptInflate(data) : data));
    }
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const ptXml = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
async function ptXLSX(u8) {
  const z = await ptUnzip(u8), get = n => z.get(n) || '';
  const ss = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => ptXml((m[1].match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join('')));
  let sheet = 'xl/worksheets/sheet1.xml';
  { const wb = get('xl/workbook.xml'), rel = get('xl/_rels/workbook.xml.rels'), rid = (wb.match(/<sheet [^>]*r:id="([^"]+)"/) || [])[1];
    const t = rid && (rel.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || rel.match(new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"')) || [])[1];
    if (t) sheet = 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, ''); if (!z.has(sheet)) sheet = [...z.keys()].find(k => /^xl\/worksheets\/sheet\d*\.xml$/.test(k)) || sheet; }
  const ci = ref => { let n = 0; for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const rows = [];
  for (const m of get(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) { const r = [];
    for (const c of m[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) { const a = c[1], ref = (a.match(/r="([A-Z]+\d+)"/) || [])[1], t = (a.match(/t="(\w+)"/) || [])[1], body = c[2] || '', v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = t === 's' ? ss[+v] : t === 'inlineStr' ? ptXml((body.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || '') : v != null ? ptXml(v) : '';
      if (t !== 's' && t !== 'inlineStr' && t !== 'str' && val !== '' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(val)) val = +val;
      r[ref ? ci(ref) : r.length] = val; }
    rows.push(Array.from(r, x => x == null ? '' : x)); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
async function ptReadFile(f) {
  const u8 = new Uint8Array(await f.arrayBuffer());
  if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b) return ptXLSX(u8);
  if (/\.xls$/i.test(f.name)) throw new Error('Tệp .xls (Excel 97-2003) chưa hỗ trợ - mở bằng Excel và "Lưu thành" .xlsx hoặc .csv');
  const t = new TextDecoder().decode(u8).replace(/^﻿/, ''), h = t.trimStart()[0];
  if (h === '[' || h === '{') { let j = JSON.parse(t); if (!Array.isArray(j)) j = j.items || j.products || j.data || j.rows || []; if (!j.length) return []; if (Array.isArray(j[0])) return j;
    const keys = [...new Set(j.flatMap(o => Object.keys(o || {})))]; return [keys, ...j.map(o => keys.map(k => (o || {})[k] == null ? '' : o[k]))]; }
  return ptCSV(t);
}
/* ---------- ma hoa (khoa dan xuat luc mo khoa, luu trong phien) ---------- */
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function ptEncrypt(doc) {
  const hex = sessionStorage.getItem('kk_partner_key'); if (!hex) throw new Error('Phiên chưa có khóa đối tác - khóa và mở lại cổng quản trị');
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g).map(x => parseInt(x, 16))), { name: 'AES-GCM' }, false, ['encrypt']);
  const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gz));
  return { v: 1, kind: 'kk-partner', z: 'gzip', iv: b64(iv), ct: b64(ct) };
}
const ptNewId = () => 'dt' + [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
const ptNum = n => Number(n || 0).toLocaleString('vi-VN');

/* ---------- giao dien ---------- */
function renderPartners() {
  const el = $('#ptBody'); if (!el) return;
  const P = ptList(), sum = k => P.reduce((a, p) => a + (+p[k] || 0), 0), st = (DATA && DATA.partnerStat) || {};
  if (typeof OPS !== 'undefined' && OPS && Array.isArray(OPS.vatSrc)) for (const p of P) if (!(p.terms && p.terms.invoice === false) && !OPS.vatSrc.includes(p.id)) OPS.vatSrc.push(p.id);   // nha phan phoi xuat hoa don GTGT
  $('#ptCards').innerHTML = [['Đối tác đang có bảng giá', P.length + (st.bad ? ` <small style="color:#B91C1C">(${st.bad} tệp lỗi)</small>` : '')], ['Dòng bảng giá', ptNum(sum('rows'))],
    ['Dòng trùng mã 100%', ptNum(sum('code') + sum('kk'))], ['SP đang lấy giá đại lý', ptNum(sum('used'))], ['SP rẻ nhất thị trường nhờ đối tác', ptNum(sum('cheap'))]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#ptTbl').innerHTML = '<tr><th class="l">Đối tác</th><th>Phạm vi</th><th>Hiệu lực</th><th>Dòng</th><th>Trùng mã</th><th>Chỉ trùng tên</th><th>Mơ hồ</th><th>Chưa có SP</th><th>SP lấy giá</th><th>Rẻ nhất TT</th><th>Nguồn</th><th></th></tr>' +
    (P.map(p => { const T = p.terms || {}, c = p.contact || {};
      return `<tr><td class="l"><b>${esc(p.name)}</b><br><span style="font-size:11px;color:var(--muted)">${esc(p.id)} · ${esc(c.person || '')} ${esc(c.email || '')} ${esc(c.phone || '')}</span>${p.err ? `<br><span class="warn" style="font-size:11.5px">⚠ ${esc(p.err)}</span>` : ''}</td>
        <td>${T.reach === 'region' ? 'Theo vùng: ' + esc(T.region || '') : 'Toàn quốc'}</td><td${p.expired ? ' style="color:#B91C1C;font-weight:700"' : ''}>${esc(T.validTo || '-')}${p.expired ? '<br>HẾT HẠN' : ''}</td>
        <td>${ptNum(p.rows)}</td><td>${ptNum(p.code + p.kk)}</td><td>${ptNum(p.name_only)}</td><td>${ptNum(p.amb)}</td><td>${ptNum(p.none)}</td><td><b>${ptNum(p.used)}</b></td><td><b style="color:#166534">${ptNum(p.cheap)}</b></td>
        <td style="font-size:11.5px">${p.src === 'url' ? 'Bảng tính trực tiếp' : 'Tệp tải lên'}<br>${p.updated_at ? new Date(p.updated_at).toLocaleDateString('vi-VN') : ''}</td>
        <td style="white-space:nowrap"><button class="btn2" onclick="ptEdit('${p.id}')">✏️ Cập nhật</button> <button class="btn2" onclick="ptUnmatched('${p.id}')" ${p.unmatched && p.unmatched.length ? '' : 'disabled'}>⬇ Dòng chưa ghép</button> <button class="btn2" onclick="ptPOFor('${p.id}')">🧾 Lập PO</button></td></tr>`; }).join('') ||
      '<tr><td class="l" colspan="12">Chưa có đối tác nào. Thêm bảng giá đầu tiên ở khung bên dưới.</td></tr>');
  const sel = $('#ptId'); if (sel) sel.innerHTML = '<option value="">+ Đối tác mới</option>' + P.map(p => `<option value="${p.id}">${esc(p.name)} (${p.id})</option>`).join('');
  const ps = $('#ptPOSel'); if (ps) ps.innerHTML = P.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}
function ptEdit(id) {
  const p = ptList().find(x => x.id === id); $('#ptId').value = id || ''; if (!p) return;
  const T = p.terms || {}, c = p.contact || {}, S = T.ship || {}, tiers = (S.tiers || []).slice().sort((a, b) => b[0] - a[0]);
  $('#ptName').value = p.name || ''; $('#ptPerson').value = c.person || ''; $('#ptEmail').value = c.email || ''; $('#ptPhone').value = c.phone || '';
  $('#ptReach').value = T.reach === 'region' ? 'region' : 'vn'; $('#ptRegion').value = T.region || ''; $('#ptVatInc').value = T.vatIncluded ? '1' : '0'; $('#ptVat').value = T.vat != null ? T.vat : 10;
  $('#ptFreeFrom').value = tiers.length > 1 ? tiers[0][0] : (tiers[0] && tiers[0][1] === 0 ? 0 : ''); $('#ptFee').value = tiers.length ? tiers[tiers.length - 1][1] : 0; $('#ptBulky').value = S.bulky || 0;
  $('#ptFloor').value = T.floorFromList ? '1' : '0'; $('#ptValid').value = T.validTo || ''; $('#ptBrand').value = T.brand || ''; $('#ptUrl').value = p.feedUrl || ''; $('#ptNote').value = T.note || '';
  $('#ptStock').value = T.stockDefault === 0 ? '0' : '1';
  document.getElementById('ptForm').scrollIntoView({ behavior: 'smooth' });
}
function ptUnmatched(id) {
  const p = ptList().find(x => x.id === id); if (!p) return;
  const lines = [['Mã hàng', 'Tên hàng', 'Giá', 'Lý do chưa ghép', 'KK SKU (điền để ghép thẳng)'].map(csvq).join(',')].concat((p.unmatched || []).map(u => [u[0], u[1], u[2], u[3], ''].map(csvq).join(',')));
  dl('﻿' + lines.join('\r\n'), `kk-mall-doi-tac-${id}-dong-chua-ghep.csv`, 'text/csv;charset=utf-8'); logAdmin('Tải dòng chưa ghép của đối tác ' + id);
}
async function ptFile(ev) {
  const f = ev.target.files[0]; PT_GRID = null; PT_HD = null; PT_FNAME = f ? f.name : '';
  $('#ptMap').innerHTML = ''; $('#ptPrev').innerHTML = ''; if (!f) return;
  try { PT_GRID = await ptReadFile(f); PT_HD = ptDetect(PT_GRID); ptRenderMap(); }
  catch (e) { $('#ptMap').innerHTML = `<div class="warn">Không đọc được tệp: ${esc(e.message)}</div>`; }
}
function ptRenderMap() {
  if (!PT_GRID) return; const hdr = PT_GRID[PT_HD.hi] || [], opts = sel => '<option value="">(không có)</option>' + hdr.map((h, j) => `<option value="${j}" ${sel === j ? 'selected' : ''}>${esc(String(h).slice(0, 40) || 'Cột ' + (j + 1))}</option>`).join('');
  $('#ptMap').innerHTML = `<div style="font-size:12.5px;margin:6px 0">Dòng tiêu đề: <input type="number" min="1" value="${PT_HD.hi + 1}" style="width:70px" onchange="PT_HD.hi=Math.max(0,this.value-1);ptRenderMap()"> · ${ptNum(PT_GRID.length - PT_HD.hi - 1)} dòng dữ liệu · cột được nhận tự động, chỉnh lại nếu cần:</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 12px">${PT_KEYS.map(([k, label]) => `<label style="font-size:12px">${label}<select onchange="ptSetCol('${k}',this.value)">${opts(PT_HD.map[k])}</select></label>`).join('')}</div>`;
  const keys = ['code', 'name', 'brand', 'price', 'list', 'stock', 'kk'], data = PT_GRID.slice(PT_HD.hi + 1, PT_HD.hi + 9);
  $('#ptPrev').innerHTML = '<table style="margin-top:8px"><tr>' + keys.map(k => `<th>${PT_KEYS.find(x => x[0] === k)[1].replace(' *', '')}</th>`).join('') + '</tr>' + data.map(r => '<tr>' + keys.map(k => `<td class="l">${esc(k in PT_HD.map ? String(r[PT_HD.map[k]] ?? '').slice(0, 60) : '')}</td>`).join('') + '</tr>').join('') + '</table>' +
    (!('price' in PT_HD.map) && !('list' in PT_HD.map && 'disc' in PT_HD.map) ? '<div class="warn" style="margin-top:6px">Chưa chọn cột giá đại lý.</div>' : '') + (!('code' in PT_HD.map) && !('kk' in PT_HD.map) ? '<div class="warn" style="margin-top:6px">Chưa có cột mã hàng / model: chỉ ghép được theo tên và phải duyệt tay từng dòng.</div>' : '');
}
function ptSetCol(k, v) { if (v === '') delete PT_HD.map[k]; else PT_HD.map[k] = +v; ptRenderMap(); }
function ptTerms() {
  const n = id => Math.max(0, Number(String($(id).value || '').replace(/\D/g, '')) || 0), free = String($('#ptFreeFrom').value).trim(), fee = n('#ptFee');
  const tiers = free === '' ? [[0, fee]] : (n('#ptFreeFrom') > 0 ? [[n('#ptFreeFrom'), 0], [0, fee]] : [[0, 0]]);
  return { reach: $('#ptReach').value, region: $('#ptRegion').value.trim(), vatIncluded: $('#ptVatInc').value === '1', vat: Number($('#ptVat').value) || 0, ship: { tiers, bulky: n('#ptBulky') },
    floorFromList: $('#ptFloor').value === '1', validTo: $('#ptValid').value || '', brand: $('#ptBrand').value.trim(), stockDefault: $('#ptStock').value === '0' ? 0 : 1, note: $('#ptNote').value.trim().slice(0, 500) };
}
async function ptBuild(active = true) {
  const name = $('#ptName').value.trim(), email = $('#ptEmail').value.trim(), url = $('#ptUrl').value.trim(), id = $('#ptId').value || ptNewId();
  if (active) { if (!name) return alert('Nhập tên đối tác'); if (!/^\S+@\S+\.\S+$/.test(email)) return alert('Nhập email nhận đơn đặt hàng của đối tác');
    if (!PT_GRID && !url) return alert('Chọn tệp bảng giá hoặc nhập đường dẫn bảng giá trực tiếp'); if (url && !/^https:\/\//i.test(url)) return alert('Đường dẫn bảng giá phải bắt đầu bằng https://');
    if (PT_GRID && !('price' in PT_HD.map) && !('list' in PT_HD.map && 'disc' in PT_HD.map)) return alert('Chưa chọn cột giá đại lý'); }
  const doc = { id, name: name || id, active, contact: { person: $('#ptPerson').value.trim(), email, phone: $('#ptPhone').value.trim() }, terms: ptTerms(), updated_at: new Date().toISOString() };
  if (url) doc.feed = { url };
  if (active && PT_GRID) {   // chi giu cac cot da chon (gon + khong mang du lieu thua)
    const keys = Object.keys(PT_HD.map), map = {}; keys.forEach((k, i) => map[k] = i);
    doc.grid = [keys].concat(PT_GRID.slice(PT_HD.hi + 1).map(r => keys.map(k => r[PT_HD.map[k]] ?? ''))); doc.hd = { hi: 0, map }; doc.file = { name: PT_FNAME, rows: doc.grid.length - 1, at: doc.updated_at };
  }
  try {
    const enc = await ptEncrypt(doc), fname = id + '.enc';
    dl(JSON.stringify(enc), fname, 'application/json'); logAdmin((active ? 'Lập tệp bảng giá đối tác ' : 'Lập tệp TẠM DỪNG đối tác ') + id);
    $('#ptOut').innerHTML = `<div class="note" style="border-color:#86EFAC;background:#F0FDF4;color:#14532D"><b>✅ Đã tạo tệp mã hóa <code>${fname}</code></b> (tên tệp là mã ngẫu nhiên, không lộ tên đối tác; nội dung chỉ giải mã được bằng khóa quản trị).<br>
      <b>Bước 2:</b> <a href="https://github.com/${PT_REPO}/upload/main/collector/partners" target="_blank" rel="noopener"><b>Mở trang tải lên GitHub ↗</b></a> → kéo tệp <code>${fname}</code> vừa tải vào → bấm <b>Commit changes</b>.<br>
      <b>Bước 3:</b> không cần làm gì thêm - bộ thu thập giá tự chạy ngay sau khi tệp lên kho mã (khoảng 5 phút), ghép mã 100% với danh mục và tính lại giá; kết quả hiện ở bảng trên sau lần thu thập đó.</div>`;
  } catch (e) { alert(e.message); }
}
function ptDelete() {
  const id = $('#ptId').value; if (!id) return alert('Chọn đối tác cần xóa');
  window.open(`https://github.com/${PT_REPO}/delete/main/collector/partners/${id}.enc`, '_blank', 'noopener');
}
/* ---------- don dat hang (PO) gui doi tac ---------- */
function ptPOLines(pid) {
  const out = []; if (typeof OPS === 'undefined' || !OPS || !OPS.orders) return out;
  for (const o of OPS.orders) for (const p of (o.po || [])) if (p.status === 'to_order') { const pl = planPO(p, o); if (pl.pick && pl.pick.s === pid) out.push({ p, o, pick: pl.pick }); }
  return out;
}
function ptPOFor(pid) { go('partner'); $('#ptPOSel').value = pid; ptPORender(); document.getElementById('ptPO').scrollIntoView({ behavior: 'smooth' }); }
function ptPOText(pid, items) {
  const P = ptList().find(x => x.id === pid) || { name: pid, contact: {} }, d = new Date().toLocaleDateString('vi-VN'), co = (DATA && DATA.company) || {};
  const L = items.map((x, i) => { const s = x.o.customer || {}, v = x.o.vat;
    return `${i + 1}. Mã hàng: ${x.pick.pc || '-'} | ${x.p.name} | SL: ${x.p.qty} | Đơn giá đại lý: ${ptNum(x.pick.p)} đ | Thành tiền: ${ptNum(x.pick.p * x.p.qty)} đ\n   Mã tham chiếu: ${x.p.po_id} (đơn ${x.o.code})\n   Giao tới: ${s.name || ''} - ${s.phone || ''} - ${s.address || ''}${s.note ? '\n   Ghi chú: ' + s.note : ''}\n   Hóa đơn GTGT: ${v ? `xuất cho ${v.name}, MST ${v.tax_code || ''}, ${v.address || ''}, email nhận HĐ ${v.email || ''}` : 'xuất cho người nhận (cá nhân)'}`; });
  const total = items.reduce((a, x) => a + x.pick.p * x.p.qty, 0);
  return `Kính gửi ${P.name},\n\nCÔNG TY TNHH KK-MALL (MST 0111694057) đặt hàng theo bảng giá đại lý đã thỏa thuận - ngày ${d}:\n\n${L.join('\n\n')}\n\nTổng giá trị: ${ptNum(total)} đ (${items.length} dòng).\nĐề nghị Quý đối tác xác nhận đơn, thời gian giao và mã vận đơn từng dòng (trả lời email này kèm mã tham chiếu).\n\nTrân trọng,\nKK-MALL`;
}
function ptPORender() {
  const pid = $('#ptPOSel').value, el = $('#ptPOOut'); if (!pid) { el.innerHTML = ''; return; }
  const items = ptPOLines(pid), P = ptList().find(x => x.id === pid) || { contact: {} };
  if (typeof OPS === 'undefined' || !OPS.on) { el.innerHTML = '<div class="note">Kết nối máy chủ đơn hàng (tab Đơn hàng) để lấy các lệnh mua đang chờ đặt.</div>'; return; }
  if (!items.length) { el.innerHTML = '<div class="note">Không có lệnh mua nào đang chờ đặt mà kế hoạch chọn đối tác này.</div>'; return; }
  const text = ptPOText(pid, items), subj = `Đơn đặt hàng KK-MALL ${new Date().toLocaleDateString('vi-VN')} - ${items.length} dòng`;
  const mail = 'mailto:' + encodeURIComponent(P.contact.email || '') + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(text.length > 1800 ? 'Kính gửi Quý đối tác,\n\nKK-MALL gửi đơn đặt hàng trong nội dung dán bên dưới / tệp đính kèm.\n\n' : text);
  el.innerHTML = `<table style="margin-top:8px"><tr><th class="l">Lệnh mua</th><th class="l">Sản phẩm</th><th>Mã đối tác</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr>${items.map(x => `<tr><td class="l">${esc(x.p.po_id)}</td><td class="l">${esc(x.p.name)}</td><td>${esc(x.pick.pc || '-')}</td><td>${x.p.qty}</td><td>${ptNum(x.pick.p)}</td><td>${ptNum(x.pick.p * x.p.qty)}</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:10px"><a class="btn2 pri" href="${mail}" onclick="logAdmin('Soạn email PO gửi đối tác ${pid}')">✉ Soạn email gửi ${esc(P.contact.email || 'đối tác')}</a>${cp(text, '📋 Chép nội dung đơn')}<button class="btn2" onclick="ptPOcsv('${pid}')">⬇ Tải PO (CSV)</button></div>
    <div class="note" style="margin-top:8px">Sau khi đối tác xác nhận: ở tab Lệnh mua, chọn nguồn là đối tác, nhập tổng thực trả và mã đơn của đối tác rồi bấm "Đã đặt & thanh toán" như mọi nguồn khác.${text.length > 1800 ? ' Nội dung đơn dài - email chỉ có lời chào; bấm "Chép nội dung đơn" rồi dán vào email hoặc đính kèm tệp CSV.' : ''}</div>`;
}
function ptPOcsv(pid) {
  const items = ptPOLines(pid), head = ['Mã tham chiếu', 'Mã đơn KK-MALL', 'Mã hàng đối tác', 'Tên hàng', 'SL', 'Đơn giá đại lý', 'Thành tiền', 'Người nhận', 'SĐT', 'Địa chỉ giao', 'Xuất HĐ GTGT cho', 'MST', 'Địa chỉ HĐ', 'Email nhận HĐ'];
  const lines = [head.map(csvq).join(',')].concat(items.map(x => { const s = x.o.customer || {}, v = x.o.vat || {}; return [x.p.po_id, x.o.code, x.pick.pc || '', x.p.name, x.p.qty, x.pick.p, x.pick.p * x.p.qty, s.name, s.phone, s.address, v.name || '', v.tax_code || '', v.address || '', v.email || ''].map(csvq).join(','); }));
  dl('﻿' + lines.join('\r\n'), `kk-mall-PO-${pid}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); logAdmin('Tải PO CSV đối tác ' + pid);
}
/* nut trong the Lenh mua (ops.js) khi ke hoach chon doi tac */
function ptPOBtn(p, o, pl) { return pl && pl.pick && ptIs(pl.pick.s) && p.status === 'to_order' ? `<div style="margin-top:8px"><button class="btn2" onclick="ptPOFor('${esc(pl.pick.s)}')">🧾 Lập đơn gửi đối tác ${esc(srcName(pl.pick.s).replace('🤝 ', ''))} (mã hàng ${esc(pl.pick.pc || '-')})</button></div>` : ''; }
