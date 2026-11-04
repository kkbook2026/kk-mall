#!/usr/bin/env node
/*
 * KK-MALL - Sinh ma va trang web tu NGUON DUY NHAT cua van ban phap ly (legal/terms/<phien ban>/):
 *   1. backend/Code.gs: khoi giua "HD:BEGIN" / "HD:END" = thu vien site/kk-hop-dong.js + TERMS_META + TERMS_TPL (mau hop dong tung phien ban)
 *   2. site/phap-ly/hop-dong-<phien ban>.html  : toan van mau hop dong (o trong) de khach doc truoc
 *      site/phap-ly/dieu-khoan-<phien ban>.html : Dieu khoan dich vu (neu phien ban co)
 *      site/phap-ly/phien-ban.html             : danh sach phien ban, ngay cong bo / ap dung, bang so sanh thay doi
 * Chay: node tools/build-terms.js          (ghi file)
 *       node tools/build-terms.js --check  (CI: bao loi neu file sinh ra khong khop nguon)
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LEGAL = path.join(ROOT, 'legal', 'terms'), SITE = path.join(ROOT, 'site'), CODE = path.join(ROOT, 'backend', 'Code.gs');
const CHECK = process.argv.includes('--check');
const BEGIN = '/* ==== HD:BEGIN - sinh tu site/kk-hop-dong.js + legal/terms/* bang node tools/build-terms.js - KHONG SUA TAY ==== */';
const END = '/* ==== HD:END ==== */';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const vnDate = ymd => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

const versions = fs.readdirSync(LEGAL).filter(d => fs.existsSync(path.join(LEGAL, d, 'meta.json'))).map(d => {
  const meta = JSON.parse(fs.readFileSync(path.join(LEGAL, d, 'meta.json'), 'utf8'));
  if (meta.version !== d) throw new Error('legal/terms/' + d + ': meta.version phai trung ten thu muc');
  const contract = fs.readFileSync(path.join(LEGAL, d, meta.contract_file), 'utf8').replace(/\r\n/g, '\n').trim();
  const terms = meta.terms_file ? fs.readFileSync(path.join(LEGAL, d, meta.terms_file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
  for (const t of [contract, terms || '']) { if (/[—–]/.test(t)) throw new Error(d + ': van ban chua dau gach dai - chi dung dau "-"'); if (new RegExp('KK-20' + '26').test(t)) throw new Error(d + ': van ban chua chu ky cu (bo theo yeu cau chu so huu)'); }
  return { dir: d, meta, contract, terms };
}).sort((a, b) => a.meta.published.localeCompare(b.meta.published));
if (!versions.length) throw new Error('Khong co phien ban nao trong legal/terms');

/* ---------- 1. backend/Code.gs ---------- */
const lib = fs.readFileSync(path.join(SITE, 'kk-hop-dong.js'), 'utf8').replace(/\r\n/g, '\n').trim();
const metaOut = versions.map(v => ({ version: v.meta.version, label: v.meta.label, kind: v.meta.kind, title: v.meta.title, published: v.meta.published, effective: v.meta.effective || null,
  url: v.meta.terms_url || ('https://www.kk-mall.com/phap-ly/dieu-khoan-' + v.meta.version + '.html'), contract_url: 'https://www.kk-mall.com/phap-ly/hop-dong-' + v.meta.version + '.html' }));
const block = [BEGIN, lib, '/* Phien ban dieu khoan (thu tu cong bo) va mau hop dong tung phien ban */',
  'var TERMS_META = ' + JSON.stringify(metaOut, null, 0).replace(/\},\{/g, '},\n  {') + ';',
  'var TERMS_TPL = {', ...versions.map((v, i) => "  '" + v.meta.version + "': " + JSON.stringify(v.contract) + (i < versions.length - 1 ? ',' : '')), '};', END].join('\n');
let code = fs.readFileSync(CODE, 'utf8');
const bi = code.indexOf(BEGIN), ei = code.indexOf(END);
if (bi < 0 || ei < 0 || ei < bi) throw new Error('backend/Code.gs thieu dau moc HD:BEGIN / HD:END');
const newCode = code.slice(0, bi) + block + code.slice(ei + END.length);

/* ---------- 2. trang web ---------- */
const DEF = { co_name: 'CÔNG TY TNHH KK-MALL', co_rep_title: 'Giám đốc', vat_rate: '10', voucher_cap: '50', tolerance: '5.000 đ', order_days: '5', unpaid_hours: '24', return_days: '7', terms_url: 'https://www.kk-mall.com/phap-ly.html', eta: 'theo trang theo dõi đơn hàng' };
const ORDER_KEYS = ['code', 'at', 'cust_name', 'cust_phone', 'cust_email', 'cust_address', 'vat_block', 'goods', 'fee', 'discount_note', 'total', 'marketing'];
function toPage(tpl, v) {
  const t = v.meta;
  const fee = '<tr><td>Dưới 200.000 đ</td><td>18.000 đ</td></tr><tr><td>200.000 - 500.000 đ</td><td>26.000 đ</td></tr><tr><td>Trên 500.000 đ</td><td>32.000 đ</td></tr>';
  let h = tpl.replace(/\{\{#lines\}\}([\s\S]*?)\{\{\/lines\}\}/g, (m, row) => row.replace(/\{\{(\w+)\}\}/g, (m2, k) => k === 'i' ? '1' : '<i>[theo đơn hàng]</i>'));
  h = h.replace(/\{\{fee_rows\}\}/g, '<tbody data-k="fee_rows">' + fee + '</tbody>');
  return h.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k === 'terms_label') return esc(t.label); if (k === 'terms_date') return t.effective ? esc(vnDate(t.effective)) : '<span data-k="terms_date">[ngày áp dụng sẽ công bố trước 7 ngày]</span>';
    if (k === 'terms_published') return esc(vnDate(t.published)); if (k === 'terms_url') return esc(t.terms_url || ('https://www.kk-mall.com/phap-ly/dieu-khoan-' + t.version + '.html'));
    if (ORDER_KEYS.includes(k)) return '<i>[theo đơn hàng]</i>';
    return '<span data-k="' + k + '">' + esc(DEF[k] || '[đang cập nhật]') + '</span>';
  });
}
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests">`;
const FILL_JS = `<script src="/config.js"></script><script>
(function(){var NAMES={co_name:'name',co_tax:'tax',co_address:'address',co_phone:'phone',co_email:'email',co_reg_no:'reg_no',co_reg_by:'reg_by',co_reg_date:'reg_date',co_rep:'rep',co_rep_title:'rep_title'};
function set(k,v){document.querySelectorAll('[data-k="'+k+'"]').forEach(function(e){e.textContent=v;});}
function vnd(n){return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')+' đ';}
if(!window.KK_BACKEND)return;fetch(window.KK_BACKEND+'?a=terms').then(function(r){return r.json();}).then(function(c){if(!c||!c.config)return;var g=c.config,co=g.company||{};
Object.keys(NAMES).forEach(function(k){if(co[NAMES[k]])set(k,co[NAMES[k]]);});if(g.vat_rate!=null)set('vat_rate',g.vat_rate);if(g.voucher_cap!=null)set('voucher_cap',g.voucher_cap);if(g.tolerance!=null)set('tolerance',vnd(g.tolerance));
if(g.order_days)set('order_days',g.order_days);if(g.unpaid_hours)set('unpaid_hours',g.unpaid_hours);if(g.return_days)set('return_days',g.return_days);if(g.bank&&g.bank.label){set('bank_label',g.bank.label);set('bank_acc',g.bank.acc);}if(g.sources&&g.sources.length)set('sources',g.sources.join(', '));
var tb=document.querySelector('[data-k="fee_rows"]');if(tb&&g.fee_table)tb.innerHTML=g.fee_table.map(function(t){return '<tr><td>'+(t.to==null?'Trên '+vnd(t.from-1):vnd(t.from)+' - '+vnd(t.to))+'</td><td>'+vnd(t.fee)+'</td></tr>';}).join('');
var a=(c.versions||[]).filter(function(v){return v.version===document.body.getAttribute('data-version');})[0];if(a&&a.effective){var m=/^(\\d{4})-(\\d{2})-(\\d{2})/.exec(a.effective);if(m)set('terms_date',m[3]+'/'+m[2]+'/'+m[1]);}}).catch(function(){});})();
</script>`;
function page(title, body, v, desc) {
  const css = fs.readFileSync(path.join(SITE, 'kk-hop-dong.js'), 'utf8').match(/var CSS = ([\s\S]*?);\n/)[1];
  const cssVal = eval(css); // chuoi CSS trong kk-hop-dong.js (noi + nhieu dong)
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">${CSP}<meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · KK-MALL</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#1E3A8A"><link rel="icon" href="/logo.svg">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;800&display=swap" rel="stylesheet">
<style>${cssVal}body{font-family:'Be Vietnam Pro',system-ui,sans-serif;background:#FAF9F6}.top{display:flex;align-items:center;gap:14px;padding:10px 0 14px;border-bottom:1px solid #ECEAE4;margin-bottom:14px}.top img{height:40px}.top a{color:#0F172A;font-weight:700;text-decoration:none}.nav{font-size:13px;margin:0 0 14px}.nav a{margin-right:12px;color:#1E3A8A}.hd,.dk{background:#fff;border:1px solid #ECEAE4;border-radius:14px;padding:18px 22px}i{color:#64748B}.foot{font-size:12px;color:#64748B;margin-top:20px}</style></head>
<body data-version="${esc(v)}"><div class="top"><a href="/"><img src="/logo.svg" alt="KK-MALL"></a><a href="/phap-ly.html">Thông tin pháp lý &amp; Chính sách</a></div>
<p class="nav"><a href="/phap-ly/phien-ban.html">Phiên bản điều khoản</a><a href="/phap-ly.html">Chính sách chung</a><a href="/">Trang chủ</a></p>
${body}
<p class="foot">Văn bản thuộc bản quyền Nguyễn Duy Điển. Thông tin doanh nghiệp, biểu phí và ngày áp dụng được điền tự động từ máy chủ KK-MALL; nội dung in đậm "[theo đơn hàng]" sẽ do hệ thống điền khi khách đặt hàng.</p>
${FILL_JS}</body></html>
`;
}
const pages = {};
for (const v of versions) {
  const t = v.meta, when = t.effective ? 'áp dụng từ ' + vnDate(t.effective) : 'chưa áp dụng - ' + (t.effective_note || '');
  pages['phap-ly/hop-dong-' + t.version + '.html'] = page('Mẫu hợp đồng ' + t.label + ' (' + t.version + ')', `<p class="hd-sub" style="text-align:left"><b>${esc(t.title)}</b> - phiên bản ${esc(t.label)} (${esc(t.version)}), công bố ${esc(vnDate(t.published))}, ${esc(when)}. Mẫu dưới đây được hệ thống điền tự động theo từng đơn hàng; khách xem toàn văn trước khi bấm "Đặt hàng" và nhận bản đã điền qua email, tải về tại trang theo dõi đơn.</p>\n` + toPage(v.contract, v), t.version, 'Mẫu hợp đồng ủy thác mua hàng hóa KK-MALL phiên bản ' + t.label + ' - toàn văn để khách đọc trước khi đặt hàng.');
  if (v.terms) pages['phap-ly/dieu-khoan-' + t.version + '.html'] = page('Điều khoản dịch vụ mua hộ ' + t.label, toPage(v.terms, v), t.version, 'Điều khoản dịch vụ mua hộ KK-MALL phiên bản ' + t.label + ' - điều kiện giao dịch chung công bố trước khi giao dịch.');
}
const list = versions.slice().reverse().map(v => { const t = v.meta; return `<div class="hd"><h2 style="margin-top:0">${esc(t.label)} - ${esc(t.version)}${t.effective ? ' <span style="font-weight:400;color:#166534">(áp dụng từ ' + esc(vnDate(t.effective)) + ')</span>' : ' <span style="font-weight:400;color:#B45309">(đã công bố, chưa áp dụng)</span>'}</h2>
<p><b>${esc(t.title)}</b></p><p>Công bố: ${esc(vnDate(t.published))}. ${t.effective ? '' : esc(t.effective_note || '')}</p><p>Căn cứ: ${esc(t.legal_basis || '')}</p>
<p><a href="/phap-ly/hop-dong-${esc(t.version)}.html">Mẫu hợp đồng / văn bản xác nhận theo đơn</a>${v.terms ? ` · <a href="/phap-ly/dieu-khoan-${esc(t.version)}.html">Điều khoản dịch vụ mua hộ</a>` : ` · <a href="${esc(t.terms_url || '/phap-ly.html')}">Toàn văn điều khoản</a>`}</p>
${t.changes && t.changes.length ? '<p><b>Thay đổi so với phiên bản trước:</b></p><ol>' + t.changes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ol>' : ''}</div>`; }).join('\n');
pages['phap-ly/phien-ban.html'] = page('Phiên bản điều khoản', `<h1 style="font-size:22px">Phiên bản điều khoản dịch vụ và hợp đồng ủy thác</h1><p>Mỗi đơn hàng được giao kết theo phiên bản đang áp dụng tại thời điểm đặt (ghi trong văn bản gửi email). Bản mới được công bố tại đây ít nhất 7 ngày trước khi áp dụng, kèm bảng thay đổi; đơn đã giao kết trước đó tiếp tục theo bản cũ (Luật Bảo vệ quyền lợi người tiêu dùng 2023, Điều 25 khoản 3, 4 và Điều 27).</p>\n` + list, versions[versions.length - 1].meta.version, 'Danh sách phiên bản điều khoản dịch vụ mua hộ và hợp đồng ủy thác của KK-MALL, ngày công bố, ngày áp dụng và thay đổi.');

/* ---------- ghi / kiem tra ---------- */
const outputs = Object.assign({ 'backend/Code.gs': newCode }, Object.fromEntries(Object.entries(pages).map(([k, v]) => ['site/' + k, v])));
let changed = 0;
for (const [rel, content] of Object.entries(outputs)) {
  const abs = path.join(ROOT, rel), cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (cur === content) continue;
  changed++;
  if (CHECK) console.error('KHONG KHOP: ' + rel + ' (chay node tools/build-terms.js roi commit)');
  else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); console.log('da ghi ' + rel + ' (' + content.length + ' ky tu)'); }
}
if (CHECK) { console.log(changed ? 'build-terms --check: ' + changed + ' file lech' : 'build-terms --check: khop (' + Object.keys(outputs).length + ' file)'); process.exit(changed ? 1 : 0); }
else console.log('xong: ' + versions.length + ' phien ban, ' + Object.keys(outputs).length + ' file' + (changed ? '' : ' (khong doi)'));
