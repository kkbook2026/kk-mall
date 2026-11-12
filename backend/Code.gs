/**
 * KK-MALL BACKEND - Google Apps Script Web App
 * Mô hình: Nền tảng công nghệ MUA HỘ & tối ưu giá (thu hộ tiền hàng - chi hộ nhà cung cấp, thu phí dịch vụ).
 *  - Đơn hàng, thành viên (OTP email), lệnh mua (PO), đổi trả / bảo hành (RMA), sổ kế toán (TK 1121/3388/5113/33311/632),
 *    hóa đơn phí dịch vụ, cấu hình - lưu trên Google Sheet của chủ sở hữu.
 *  - Sao lưu 2 nơi: Google Sheet (bản sống) + bản JSON hằng ngày trong thư mục Google Drive (giữ 60 bản).
 *  - Hợp đồng điện tử: mỗi đơn có văn bản hợp đồng/xác nhận ủy quyền tự điền theo phiên bản điều khoản, lưu nguyên văn, băm SHA-256,
 *    nối chuỗi băm, đính kèm email, tải về; ô tiếp thị tách riêng; xóa tài khoản 24 tháng không hoạt động; kiểm tra chia sẻ Drive; sự cố dữ liệu 72 giờ.
 *  - Bảo mật: OTP 6 số băm SHA-256 + pepper, hết hạn 10 phút, tối đa 5 lần thử, giới hạn tần suất;
 *    phiên đăng nhập token 256-bit chỉ lưu dạng băm; quyền quản trị chỉ theo ADMIN_EMAILS (Script Properties);
 *    chống chèn công thức vào Sheet; khóa ghi đồng thời (LockService); giá luôn tính lại phía máy chủ.
 * (c) 2026 Nguyễn Duy Điển. All rights reserved.
 */

/* =========================== CẤU HÌNH =========================== */
var VERSION = '1.9.0';
var SHEETS = {
  Orders: ['code', 'created_at', 'status', 'payment_status', 'email', 'phone', 'name', 'goods', 'fee', 'total', 'paid_at', 'data', 'updated_at'],
  PO: ['po_id', 'order_code', 'sku', 'name', 'qty', 'status', 'collected_cost', 'actual_source', 'actual_cost', 'supplier_order_id', 'tracking', 'data', 'updated_at'],
  Members: ['email', 'name', 'phone', 'address', 'role', 'created_at', 'last_login', 'data'],
  Sessions: ['token_hash', 'email', 'role', 'created_at', 'expires_at'],
  RMA: ['rma_id', 'order_code', 'sku', 'type', 'status', 'reason', 'created_at', 'data', 'updated_at'],
  Ledger: ['at', 'order_code', 'ref', 'debit', 'credit', 'amount', 'note'],
  Invoices: ['inv_id', 'order_code', 'created_at', 'status', 'buyer', 'tax_code', 'content', 'pre_tax', 'vat_rate', 'vat', 'total', 'data'],
  Warranty: ['brand', 'hotline', 'url', 'confidence', 'note'],
  Log: ['at', 'action', 'actor', 'detail'],
  Reviews: ['id', 'sku', 'order_code', 'rating', 'content', 'name', 'status', 'created_at', 'data'],
  SearchMiss: ['q', 'kind', 'n', 'results', 'first_at', 'last_at'],
  Contracts: ['code', 'version', 'hash', 'created_at', 'marketing', 'html'],
  Incidents: ['id', 'at', 'by', 'kind', 'severity', 'status', 'detected_at', 'summary', 'data', 'updated_at'],
  Chain: ['seq', 'at', 'kind', 'ref', 'digest', 'prev', 'hash']   // chuoi bam nhat ky tien & trang thai (chainhead cong khai)
};
var DEFAULTS = {
  SITE: 'https://www.kk-mall.com',
  PRICING_TIERS: '',                 // "nguong:phi,..."; dat trong setup() - KHONG ghi o day
  ADMIN_EMAILS: 'nguyenduydien75@gmail.com',
  VAT_RATE: '10',
  TOLERANCE: '5000',                 // bien dung sai truot gia KK-MALL tu bu (đ/đơn vị)
  UNPAID_HOURS: '24',
  RETURN_DAYS: '7',
  VOUCHER_FEE_CAP_PCT: '50',        // voucher giam toi da % phi dich vu cua don (KK-MALL luon con lai)
  BANK_BIN: '', BANK_ACC: '', BANK_NAME: '', BANK_LABEL: '',
  COMPANY_JSON: '{}',
  AUTONOMY_ENABLED: '1',             // cong tac dung toan bo bot dat hang ('0' = dung)
  BOT_REQUIRE_SIG: '0',              // '1' = bat buoc moi thong diep bot co chu ky + nonce (bat sau khi tien ich da cap nhat)
  POLICY_JSON: ''                    // chinh sach tu dong (JSON) ghi de POLICY_DEFAULT - sua tai Quan tri -> He thong
};
var VOUCHERS = [ // giam tren PHI DICH VU, tong giam toi da VOUCHER_FEE_CAP_PCT% phi dich vu cua don - dong bo voi site
  { code: 'KKWELCOME', title: 'Giảm phí dịch vụ cho đơn từ 200K', type: 'percent', value: 10, max: 50000, min: 200000, scope: 'all', group: 'order' },
  { code: 'KK50', title: 'Giảm phí dịch vụ cho đơn từ 1 triệu', type: 'fixed', value: 50000, min: 1000000, scope: 'all', group: 'order' },
  { code: 'KK150', title: 'Giảm phí dịch vụ cho đơn từ 5 triệu', type: 'fixed', value: 150000, min: 5000000, scope: 'all', group: 'order' },
  { code: 'DIENLANH5', title: 'Giảm phí dịch vụ ngành Điện lạnh, đơn từ 2 triệu', type: 'percent', value: 5, max: 300000, min: 2000000, scope: 'dien-lanh', group: 'category' },
  { code: 'GIADUNG30', title: 'Giảm phí dịch vụ ngành Gia dụng, đơn từ 300K', type: 'fixed', value: 30000, min: 300000, scope: 'gia-dung', group: 'category' }
];
// Nguon co he thong xuat hoa don GTGT dien tu on dinh (sieu thi / chuoi ban le / gian hang chinh hang)
var VAT_SOURCES = ['dienmayxanh', 'thegioididong', 'fptshop', 'cellphones', 'dienmaycholon', 'tiki', 'hoangha', 'phucanh', 'anphat'];
var FL = { HOLD: 1, USED: 2, NO_SOURCE: 32 };
// Nganh co bao hanh ky thuat cua hang (dien tu, dien may, thiet bi) - nganh khac: dung doi tra
var WARRANTY_CATS = ['dien-thoai-may-tinh-bang', 'laptop-may-tinh', 'thiet-bi-am-thanh-deo', 'tivi-giai-tri', 'dien-lanh', 'gia-dung', 'noi-that-trang-tri', 'o-to-xe-may', 'the-thao-du-lich'];
var ST = {
  awaiting_payment: 'Chờ thanh toán', paid: 'Đã thanh toán - đang lập lệnh mua', ordered: 'Đã đặt tại nhà cung cấp',
  shipping: 'Đang giao hàng', delivered: 'Đã giao hàng', completed: 'Hoàn tất', cancelled: 'Đã hủy',
  refunding: 'Đang hoàn tiền', refunded: 'Đã hoàn tiền'
};

/* =========================== TIỆN ÍCH =========================== */
/* ==== HD:BEGIN - sinh tu site/kk-hop-dong.js + legal/terms/* bang node tools/build-terms.js - KHONG SUA TAY ==== */
/*
 * KK-MALL - HOP DONG DIEN TU: dien mau hop dong theo don hang + van ban chuan de bam (SHA-256).
 * File nay dung CHUNG cho trinh duyet (xem truoc khi dat) va may chu Apps Script (ban chot luu kem don):
 * tools/build-terms.js chep nguyen van vao backend/Code.gs giua hai dau moc HD:BEGIN / HD:END - KHONG sua ban trong Code.gs.
 * Chi dung cu phap ES5 + ham thuan (khong Intl, khong Date local) de ket qua giong het nhau o moi noi.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
var KKHD = (function () {
  'use strict';
  var NA = '[đang cập nhật]';
  var CSS = 'body{font-family:"Segoe UI",Arial,sans-serif;max-width:860px;margin:0 auto;padding:20px 16px;color:#0F172A;line-height:1.55;font-size:14px}'
    + '.hd h1,.dk h1{font-size:20px;text-align:center;margin:8px 0 4px;letter-spacing:.3px}.hd-top{text-align:center;margin:0 0 6px}.hd-sub{text-align:center;color:#334155;margin:0 0 14px}'
    + '.hd h2,.dk h2{font-size:15px;margin:16px 0 4px;color:#1E3A8A}.hd p,.dk p{margin:4px 0;text-align:justify}'
    + 'table.hd-t{width:100%;border-collapse:collapse;margin:8px 0}table.hd-t th,table.hd-t td{border:1px solid #CBD5E1;padding:6px 8px;vertical-align:top;text-align:left}table.hd-t th{background:#F1F5F9}'
    + 'table.hd-l{width:100%;border-collapse:collapse;font-size:13px}table.hd-l th,table.hd-l td{border:1px solid #E2E8F0;padding:4px 6px}table.hd-l th{background:#F8FAFC}'
    + '.hd-foot{font-size:12px;color:#475569;margin-top:14px;border-top:1px dashed #CBD5E1;padding-top:8px}.hd-print{text-align:center;margin:18px 0}.hd-print button{font-size:14px;padding:8px 16px;cursor:pointer}'
    + '@media print{.hd-print{display:none}body{padding:0}}';
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function vnd(n) { n = Math.round(Number(n) || 0); var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '-' : '') + s + ' đ'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function vnTime(iso) { // dd/mm/yyyy hh:mm theo gio Viet Nam (UTC+7), khong phu thuoc mui gio may chay
    var t = new Date(iso).getTime(); if (!isFinite(t)) return '';
    var d = new Date(t + 7 * 3600e3);
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function vnDate(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function or(v, alt) { v = v === null || v === undefined ? '' : String(v).replace(/^\s+|\s+$/g, ''); return v || alt; }
  /* Du lieu dien mau: o = don hang (code, created_at, customer, vat, lines, goods, fee_net, discount, vouchers, total, marketing)
   * c = cau hinh cong khai cua may chu (company, bank, terms, vat_rate, voucher_cap, tolerance, order_days, unpaid_hours, return_days, sources, eta) */
  function data(o, c) {
    o = o || {}; c = c || {};
    var cu = o.customer || {}, co = c.company || {}, b = c.bank || {}, t = c.terms || {}, v = o.vat || null;
    var vatBlock = v && v.name ? 'Yêu cầu hóa đơn GTGT tiền hàng: ' + or(v.name, '') + (v.tax_code ? ', MST ' + v.tax_code : '') + (v.address ? ', ' + v.address : '') + '.' : 'Không yêu cầu hóa đơn GTGT tiền hàng.';
    var codes = (o.vouchers || []).map(function (x) { return x && x.code ? x.code : String(x || ''); }).filter(String).join('+');
    return {
      code: or(o.code, '[cấp khi đặt hàng]'), at: o.created_at ? vnTime(o.created_at) : '[thời điểm đặt hàng]',
      terms_label: or(t.label, ''), terms_date: vnDate(t.effective) || '[ngày áp dụng]', terms_published: vnDate(t.published) || '', terms_url: or(t.url, 'https://www.kk-mall.com/phap-ly.html'),
      cust_name: or(cu.name, ''), cust_phone: or(cu.phone, ''), cust_email: or(cu.email, ''), cust_address: or(cu.address, ''), vat_block: vatBlock,
      co_name: or(co.name, 'CÔNG TY TNHH KK-MALL'), co_tax: or(co.tax, '0111694057'), co_reg_no: or(co.reg_no, '0111694057'), co_reg_by: or(co.reg_by, NA), co_reg_date: or(co.reg_date, NA),
      co_address: or(co.address, NA), co_phone: or(co.phone, NA), co_email: or(co.email, NA), co_rep: or(co.rep, NA), co_rep_title: or(co.rep_title, 'Giám đốc'),
      vat_rate: String(c.vat_rate === undefined || c.vat_rate === null ? 10 : c.vat_rate), voucher_cap: String(c.voucher_cap === undefined || c.voucher_cap === null ? 50 : c.voucher_cap),
      tolerance: vnd(c.tolerance === undefined ? 5000 : c.tolerance), order_days: String(c.order_days || 5), unpaid_hours: String(c.unpaid_hours || 24), return_days: String(c.return_days || 7),
      lines: (o.lines || []).map(function (l) { return { sku: or(l.sku, ''), name: or(l.name, ''), qty: String(l.qty || 1), unit_cost: vnd(l.unit_cost), line_cost: vnd(l.line_cost), line_fee: vnd(l.line_fee) }; }),
      goods: vnd(o.goods), fee: vnd(o.fee_net), discount_note: o.discount ? ' (đã trừ mã giảm giá ' + (codes || '') + ' ' + vnd(-o.discount) + ' vào phí dịch vụ)' : '', total: vnd(o.total),
      bank_label: or(b.label, NA), bank_acc: or(b.acc, NA), sources: (c.sources || []).join(', ') || NA,
      eta: or(c.eta, 'theo trang theo dõi đơn hàng (thường 2-7 ngày làm việc sau khi đặt tại nguồn)'), marketing: o.marketing ? 'Đồng ý nhận thông tin khuyến mãi qua email (có thể rút lại bất kỳ lúc nào)' : 'Không nhận'
    };
  }
  function fill(tpl, d) { // {{#lines}}...{{/lines}} lap theo dong hang; {{key}} thay gia tri (da escape HTML)
    tpl = String(tpl || '').replace(/\{\{#lines\}\}([\s\S]*?)\{\{\/lines\}\}/g, function (m, row) {
      return (d.lines || []).map(function (l, i) { return row.replace(/\{\{(\w+)\}\}/g, function (m2, k) { return esc(k === 'i' ? i + 1 : l[k]); }); }).join('');
    });
    return tpl.replace(/\{\{(\w+)\}\}/g, function (m, k) { return esc(d[k] === undefined || d[k] === null ? '' : d[k]); });
  }
  function text(html) { // van ban chuan de bam: bo the, giai ma thuc the HTML, gop khoang trang
    return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  function doc(inner, title, hash) { // file HTML doc lap de gui email / tai ve / in - luu PDF
    return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>' + inner
      + (hash ? '<p class="hd-foot">Mã băm SHA-256 của văn bản: <code>' + esc(hash) + '</code> (tính trên nội dung đã bỏ định dạng, gộp khoảng trắng).</p>' : '')
      + '<p class="hd-print"><button type="button" onclick="window.print()">In / Lưu PDF</button></p></body></html>';
  }
  return { NA: NA, CSS: CSS, esc: esc, vnd: vnd, vnTime: vnTime, vnDate: vnDate, data: data, fill: fill, text: text, doc: doc };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KKHD;
/* Phien ban dieu khoan (thu tu cong bo) va mau hop dong tung phien ban */
var TERMS_META = [{"version":"UQ-2026-10","label":"UQ-2026-10","kind":"contract","title":"Điều khoản ủy quyền tìm kiếm, đặt hàng và thanh toán hộ (bản đang áp dụng)","published":"2026-10-23","effective":"2026-10-23","url":"https://www.kk-mall.com/phap-ly.html#uy-quyen","contract_url":"https://www.kk-mall.com/phap-ly/hop-dong-UQ-2026-10.html"},
  {"version":"HD-2026-11","label":"v1.0","kind":"contract","title":"Hợp đồng ủy thác mua hàng hóa điện tử và Điều khoản dịch vụ mua hộ","published":"2026-11-04","effective":null,"url":"https://www.kk-mall.com/phap-ly/dieu-khoan-HD-2026-11.html","contract_url":"https://www.kk-mall.com/phap-ly/hop-dong-HD-2026-11.html"}];
var TERMS_TPL = {
  'UQ-2026-10': "<div class=\"hd\" data-version=\"UQ-2026-10\">\n<h1>XÁC NHẬN ỦY QUYỀN TÌM KIẾM, ĐẶT HÀNG VÀ THANH TOÁN HỘ</h1>\n<p class=\"hd-sub\">Số: <b>{{code}}</b> - Phiên bản điều khoản: <b>{{terms_label}}</b> (áp dụng từ {{terms_date}}) - Xác nhận lúc {{at}} (giờ Việt Nam)</p>\n<p><b>Bên ủy quyền (Khách hàng):</b> {{cust_name}} - số điện thoại {{cust_phone}} - email {{cust_email}} - địa chỉ nhận hàng: {{cust_address}}. {{vat_block}}</p>\n<p><b>Bên nhận ủy quyền (KK-MALL):</b> {{co_name}}; địa chỉ: {{co_address}}; mã số doanh nghiệp: {{co_tax}}; hotline {{co_phone}}; email {{co_email}}; website www.kk-mall.com.</p>\n<p>Bằng việc tích chọn đồng ý tại bước đặt hàng và chuyển tiền thanh toán, Khách hàng xác nhận đã đọc và đồng ý toàn văn Điều khoản ủy quyền dưới đây và Điều khoản sử dụng, Chính sách thanh toán, Đổi trả - bảo hành, Chính sách bảo vệ dữ liệu cá nhân công bố tại {{terms_url}} ở thời điểm xác nhận.</p>\n\n<h2>Điều 1. Bản chất dịch vụ</h2>\n<p>KK-MALL là nền tảng công nghệ cung cấp công cụ tự động giúp Khách hàng tìm nguồn hàng có giá tối ưu từ các Nhà cung cấp và thực hiện đặt hàng, thanh toán hộ theo yêu cầu của Khách hàng. KK-MALL không phải là người bán hàng hóa, không sở hữu hàng hóa và không định giá gốc của hàng hóa. Quan hệ mua bán hàng hóa được xác lập trực tiếp giữa Khách hàng và Nhà cung cấp.</p>\n<h2>Điều 2. Nội dung ủy quyền thu hộ - chi hộ</h2>\n<p>Khách hàng ủy quyền cho KK-MALL: (1) nhận tiền ủy thác bằng đúng giá hàng tại Nhà cung cấp; (2) dùng chính khoản tiền đó thanh toán cho Nhà cung cấp để hoàn tất đơn hàng, với thông tin người nhận là Khách hàng; (3) thay mặt Khách hàng cung cấp thông tin xuất hóa đơn (nếu Khách hàng yêu cầu) để Nhà cung cấp xuất hóa đơn GTGT tiền hàng trực tiếp cho Khách hàng; (4) thay mặt Khách hàng thực hiện thủ tục đổi trả, hoàn tiền với Nhà cung cấp và nhận lại tiền hoàn để chuyển trả Khách hàng.</p>\n<h2>Điều 3. Phí dịch vụ và hóa đơn của KK-MALL</h2>\n<p>Khách hàng trả phí dịch vụ mua hộ và xử lý đơn hàng theo biểu phí công bố (đã gồm thuế GTGT {{vat_rate}}%), ghi tại Phụ lục. KK-MALL xuất hóa đơn GTGT cho khoản phí dịch vụ này. Mã giảm giá chỉ trừ vào phí dịch vụ, tối đa {{voucher_cap}}% phí dịch vụ của đơn.</p>\n<h2>Điều 4. Trượt giá và hết hàng</h2>\n<p>Nếu tại thời điểm đặt mua, giá Nhà cung cấp cao hơn giá đã thu trong biên dung sai {{tolerance}} mỗi đơn vị hàng, KK-MALL tự chịu phần chênh lệch; nếu thấp hơn, phần chênh lệch được hoàn lại Khách hàng. Nếu vượt biên dung sai hoặc hết hàng, KK-MALL đổi sang nguồn tương đương cùng mã sản phẩm hoặc hoàn tiền 100%.</p>\n<h2>Điều 5. Trách nhiệm</h2>\n<p>Nhà cung cấp chịu trách nhiệm về chất lượng, nguồn gốc, bảo hành hàng hóa theo pháp luật và chính sách của hãng. KK-MALL chịu trách nhiệm thực hiện đúng, đủ, kịp thời các công việc được ủy quyền và hỗ trợ Khách hàng trong suốt quá trình đổi trả, bảo hành; đổi trả trong {{return_days}} ngày kể từ ngày nhận theo Chính sách đổi trả.</p>\n<h2>Điều 6. Thời hạn ủy quyền, thanh toán và dữ liệu</h2>\n<p>Ủy quyền có hiệu lực từ khi Khách hàng xác nhận đơn hàng đến khi hoàn tất giao hàng và các nghĩa vụ đổi trả, hoàn tiền liên quan đến đơn hàng đó. Đơn chưa thanh toán sau {{unpaid_hours}} giờ tự động hủy. Họ tên, số điện thoại, email, địa chỉ nhận hàng và thông tin hóa đơn của Khách hàng được xử lý để thực hiện ủy quyền này (chuyển cho Nhà cung cấp và đơn vị vận chuyển để giao hàng, xuất hóa đơn) theo Chính sách bảo vệ dữ liệu cá nhân; không dùng cho tiếp thị nếu Khách hàng không đồng ý riêng. Lựa chọn nhận thông tin tiếp thị: {{marketing}}. Thời điểm và phiên bản điều khoản Khách hàng đồng ý được lưu kèm đơn hàng cùng mã băm SHA-256 của văn bản này.</p>\n\n<h2>Phụ lục - Nội dung đơn hàng (hệ thống tự lập)</h2>\n<table class=\"hd-t\">\n<tr><th>Mục</th><th>Nội dung</th></tr>\n<tr><td>Mã đơn hàng, thời điểm xác nhận</td><td>{{code}} - {{at}} (giờ Việt Nam)</td></tr>\n<tr><td>Khách hàng</td><td>{{cust_name}}, {{cust_phone}}, {{cust_email}}, {{cust_address}}. {{vat_block}}</td></tr>\n<tr><td>Hàng hóa</td><td><table class=\"hd-l\"><tr><th>#</th><th>Mã KK</th><th>Tên hàng</th><th>SL</th><th>Tiền hàng/đơn vị</th><th>Thành tiền hàng</th><th>Phí dịch vụ dòng</th></tr>{{#lines}}<tr><td>{{i}}</td><td>{{sku}}</td><td>{{name}}</td><td>{{qty}}</td><td>{{unit_cost}}</td><td>{{line_cost}}</td><td>{{line_fee}}</td></tr>{{/lines}}</table></td></tr>\n<tr><td>Tiền hàng thanh toán hộ Nhà cung cấp</td><td>{{goods}}</td></tr>\n<tr><td>Phí dịch vụ mua hộ và xử lý đơn (đã gồm VAT {{vat_rate}}%)</td><td>{{fee}}{{discount_note}}</td></tr>\n<tr><td>Tổng thanh toán</td><td><b>{{total}}</b> - chuyển khoản VietQR: {{bank_label}} {{bank_acc}}, nội dung chuyển khoản \"{{code}}\"</td></tr>\n<tr><td>Nguồn hàng được phép đặt</td><td>{{sources}}</td></tr>\n<tr><td>Biên dung sai, thời hạn đặt</td><td>{{tolerance}}/đơn vị; {{order_days}} ngày làm việc kể từ khi nhận đủ thanh toán</td></tr>\n<tr><td>Thời gian giao dự kiến</td><td>{{eta}}</td></tr>\n<tr><td>Điều khoản đã đồng ý</td><td>{{terms_label}} (áp dụng từ {{terms_date}}) - {{terms_url}}</td></tr>\n<tr><td>Nhận thông tin tiếp thị</td><td>{{marketing}}</td></tr>\n</table>\n<p class=\"hd-foot\">Văn bản này do hệ thống KK-MALL lập tự động từ dữ liệu Khách hàng nhập và được lưu nguyên văn kèm đơn hàng; mã băm SHA-256 của nội dung (sau khi bỏ định dạng, gộp khoảng trắng) được ghi vào chuỗi băm nhật ký của hệ thống để chứng minh không bị sửa đổi.</p>\n</div>",
  'HD-2026-11': "<div class=\"hd\" data-version=\"HD-2026-11\">\n<p class=\"hd-top\">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><b>Độc lập - Tự do - Hạnh phúc</b></p>\n<h1>HỢP ĐỒNG ỦY THÁC MUA HÀNG HÓA</h1>\n<p class=\"hd-sub\">Số: <b>{{code}}</b> - Phiên bản điều khoản: <b>{{terms_label}}</b> (áp dụng từ {{terms_date}}) - Giao kết lúc {{at}} (giờ Việt Nam)</p>\n<p><i>Căn cứ Bộ luật Dân sự 2015; Luật Thương mại 2005; Luật Bảo vệ quyền lợi người tiêu dùng 2023; Luật Giao dịch điện tử 2023; Luật Thương mại điện tử 2025; Luật Bảo vệ dữ liệu cá nhân 2025 và các văn bản hướng dẫn.</i></p>\n<p><b>Bên ủy thác (Khách hàng, gọi tắt \"Bên A\"):</b> {{cust_name}} - số điện thoại {{cust_phone}} - email {{cust_email}} - địa chỉ nhận hàng: {{cust_address}}. {{vat_block}}</p>\n<p><b>Bên nhận ủy thác (\"Bên B\"):</b> {{co_name}} - Giấy chứng nhận đăng ký doanh nghiệp số {{co_reg_no}} do {{co_reg_by}} cấp ngày {{co_reg_date}}; địa chỉ trụ sở: {{co_address}}; điện thoại {{co_phone}}; email {{co_email}}; website www.kk-mall.com; người đại diện: {{co_rep}}, chức vụ {{co_rep_title}}.</p>\n<p>Hai bên thỏa thuận như sau:</p>\n\n<h2>Điều 1. Nội dung ủy thác</h2>\n<p>1.1. Bên A ủy thác cho Bên B, với danh nghĩa của Bên B, mua các hàng hóa liệt kê tại Phụ lục 1 (gọi là \"Hàng hóa\") từ nhà cung cấp theo Điều 3 và tổ chức giao Hàng hóa đến địa chỉ Bên A chỉ định.</p>\n<p>1.2. Hàng hóa là hàng lưu thông hợp pháp tại Việt Nam, mới 100%, nguyên hộp của nhà sản xuất hoặc nhà phân phối chính thức, trừ khi trang sản phẩm ghi rõ khác. Bên B không mua hộ hàng cấm, hàng hạn chế kinh doanh, hàng đã qua sử dụng.</p>\n<p>1.3. Bên B là thương nhân kinh doanh các mặt hàng phù hợp với Hàng hóa ủy thác theo ngành nghề đã đăng ký (Luật Thương mại 2005, Điều 156).</p>\n\n<h2>Điều 2. Giá, thù lao ủy thác và tổng tiền thanh toán</h2>\n<p>2.1. Tổng tiền Bên A thanh toán cho một đơn hàng gồm hai khoản tách bạch, hiển thị riêng tại thời điểm đặt hàng và trong email xác nhận:</p>\n<p>a) Tiền hàng: giá bán niêm yết của nhà cung cấp cộng chi phí giao hàng và phụ phí dự phòng của nhà cung cấp đó (gọi chung là \"giá thực trả tại nguồn\"). Bên B thu hộ khoản này và chi trả cho nhà cung cấp; khoản này không phải doanh thu của Bên B.</p>\n<p>b) Thù lao ủy thác (gọi là \"phí dịch vụ mua hộ và xử lý đơn hàng\"): tính theo từng dòng hàng theo biểu phí công bố tại Điều khoản dịch vụ, đã gồm thuế giá trị gia tăng {{vat_rate}}%. Biểu phí tại ngày giao kết ghi ở Phụ lục 1.</p>\n<p>2.2. Tổng tiền tại 2.1 là giá cuối cùng. Bên B không thu thêm bất kỳ khoản nào của Bên A sau khi giao kết, kể cả khi giá tại nguồn tăng. Nếu giá thực trả tại nguồn tại thời điểm Bên B đặt mua thấp hơn tiền hàng đã thu, Bên B hoàn phần chênh lệch cho Bên A theo Điều 8 trong vòng 7 ngày làm việc kể từ ngày đặt mua.</p>\n<p>2.3. Mã giảm giá (voucher) chỉ giảm vào thù lao ủy thác, tối đa {{voucher_cap}}% thù lao của đơn hàng; không giảm vào tiền hàng.</p>\n\n<h2>Điều 3. Lựa chọn nhà cung cấp và phạm vi ủy quyền tự động</h2>\n<p>3.1. Bên A ủy quyền cho Bên B lựa chọn nhà cung cấp trong danh sách nguồn công bố tại Điều khoản dịch vụ theo thứ tự: còn hàng đúng mã sản phẩm, giá thực trả thấp nhất, xuất được hóa đơn GTGT nếu Bên A yêu cầu hóa đơn, thời gian giao dự kiến phù hợp.</p>\n<p>3.2. Bên A đồng ý để hệ thống của Bên B tự động đặt mua Hàng hóa tại nhà cung cấp mà không cần Bên A xác nhận lại, với các giới hạn sau (hạn mức ủy quyền):</p>\n<p>a) Số tiền thanh toán cho nhà cung cấp không vượt tiền hàng đã thu cộng biên dung sai {{tolerance}} mỗi đơn vị hàng; phần vượt trong biên dung sai do Bên B chịu;</p>\n<p>b) Chỉ đặt tại nhà cung cấp trong danh sách nguồn công bố;</p>\n<p>c) Chỉ đặt trong thời hạn {{order_days}} ngày làm việc kể từ khi nhận đủ thanh toán;</p>\n<p>d) Giao đúng tên, số điện thoại, địa chỉ nhận hàng Bên A đã khai; Bên B không đổi địa chỉ nếu Bên A không yêu cầu bằng văn bản điện tử;</p>\n<p>đ) Không chọn phương thức thu tiền khi nhận hàng; không mua hàng thay thế khác mã sản phẩm nếu Bên A chưa đồng ý.</p>\n<p>3.3. Ngoài hạn mức 3.2, Bên B phải hỏi ý kiến Bên A qua email hoặc điện thoại trước khi đặt mua. Nếu Bên A không trả lời trong 48 giờ, Bên B hủy dòng hàng đó và hoàn tiền theo Điều 8.</p>\n<p>3.4. Bên B không ủy thác lại cho bên thứ ba thực hiện hợp đồng này, trừ khi Bên A chấp thuận bằng văn bản điện tử (Luật Thương mại 2005, Điều 160). Việc nhà cung cấp hoặc đơn vị vận chuyển giao hàng theo đơn mua của Bên B không phải là ủy thác lại.</p>\n\n<h2>Điều 4. Giao kết, hiệu lực và thời hạn</h2>\n<p>4.1. Hợp đồng được giao kết khi Bên A đã đọc nội dung hợp đồng và Điều khoản dịch vụ, đánh dấu xác nhận đồng ý, bấm \"Đặt hàng\" và nhận được email xác nhận mã đơn từ Bên B. Thời điểm giao kết là thời điểm hệ thống ghi nhận mã đơn (giờ Việt Nam) ghi tại Phụ lục 1.</p>\n<p>4.2. Hợp đồng được thực hiện khi Bên B nhận đủ tổng tiền thanh toán theo Điều 5. Nếu sau {{unpaid_hours}} giờ kể từ khi giao kết Bên B chưa nhận được thanh toán, đơn hàng tự hủy; tiền chuyển đến sau đó được hoàn lại toàn bộ theo Điều 8.</p>\n<p>4.3. Hợp đồng chấm dứt khi: Hàng hóa đã giao và hết thời hạn đổi trả tại Điều 7; hoặc các bên hoàn tất hoàn tiền sau khi hủy; hoặc theo thỏa thuận khác bằng văn bản điện tử.</p>\n\n<h2>Điều 5. Thanh toán</h2>\n<p>5.1. Bên A thanh toán trước toàn bộ tổng tiền bằng chuyển khoản VietQR vào tài khoản ngân hàng của Bên B ghi trên trang thanh toán và email xác nhận, nội dung chuyển khoản là mã đơn hàng. Bên B không nhận tiền mặt, không thu tiền khi nhận hàng.</p>\n<p>5.2. Bên B xác nhận đã nhận thanh toán qua email trong vòng 15 phút khi ngân hàng báo có tự động, hoặc tối đa 04 giờ làm việc khi đối soát thủ công.</p>\n<p>5.3. Tiền hàng Bên B thu hộ được hạch toán tách bạch với thù lao ủy thác. Bên B chỉ dùng tiền hàng để thanh toán cho nhà cung cấp Hàng hóa của chính đơn hàng đó hoặc hoàn lại cho Bên A.</p>\n\n<h2>Điều 6. Hóa đơn, chứng từ</h2>\n<p>6.1. Nếu Bên A yêu cầu hóa đơn GTGT cho tiền hàng, Bên B chọn nhà cung cấp xuất được hóa đơn và yêu cầu nhà cung cấp xuất hóa đơn tiền hàng mang tên, mã số thuế Bên A theo Phụ lục 1. Bên B không xuất hóa đơn cho tiền hàng thu hộ.</p>\n<p>6.2. Bên B xuất hóa đơn điện tử cho thù lao ủy thác (nội dung \"Phí dịch vụ mua hộ và xử lý đơn hàng KK-MALL\") trong vòng 03 ngày làm việc kể từ ngày Hàng hóa giao thành công, gửi vào email Bên A.</p>\n<p>6.3. Bên B cung cấp cho Bên A mã đơn tại nhà cung cấp, mã vận đơn và tình trạng giao hàng trên trang theo dõi đơn.</p>\n\n<h2>Điều 7. Giao hàng, kiểm tra, đổi trả và bảo hành</h2>\n<p>7.1. Hàng hóa do nhà cung cấp hoặc đơn vị vận chuyển của nhà cung cấp giao trực tiếp đến địa chỉ Bên A. Thời gian giao dự kiến ghi trên trang theo dõi đơn; Bên B thông báo khi Hàng hóa được đặt, được giao cho vận chuyển và giao thành công.</p>\n<p>7.2. Bên A có quyền kiểm tra Hàng hóa khi nhận. Hàng hóa sai mã, thiếu, hư hỏng do vận chuyển, hoặc lỗi kỹ thuật phát hiện trong {{return_days}} ngày kể từ ngày nhận được đổi hoặc trả theo quy trình đổi trả tại Điều khoản dịch vụ; Bên B thay mặt Bên A làm việc với nhà cung cấp và chịu trách nhiệm theo dõi đến khi giải quyết xong.</p>\n<p>7.3. Bảo hành theo chính sách của nhà sản xuất hoặc nhà cung cấp; Bên B cung cấp thông tin trung tâm bảo hành chính hãng và hỗ trợ Bên A liên hệ.</p>\n<p>7.4. Bên B không chịu trách nhiệm về Hàng hóa đã bàn giao đúng thỏa thuận cho Bên A (Luật Thương mại 2005, Điều 164 khoản 3), nhưng vẫn chịu trách nhiệm về việc lựa chọn nguồn, đặt mua, theo dõi và hỗ trợ đổi trả theo hợp đồng này; quyền của Bên A theo pháp luật bảo vệ quyền lợi người tiêu dùng không bị hạn chế.</p>\n\n<h2>Điều 8. Hủy đơn, hoàn tiền</h2>\n<p>8.1. Bên A được hủy toàn bộ hoặc một phần đơn hàng miễn phí trước khi Bên B đặt mua tại nhà cung cấp (trạng thái \"Cần đặt\" trên trang theo dõi đơn). Sau khi đã đặt mua, việc hủy thực hiện theo chính sách của nhà cung cấp; Bên B hỗ trợ tối đa và hoàn các khoản thu được từ nhà cung cấp.</p>\n<p>8.2. Bên B hủy dòng hàng và hoàn 100% tiền hàng cùng thù lao của dòng hàng đó khi: nhà cung cấp hết hàng; giá thực trả tại nguồn vượt tiền hàng đã thu quá biên dung sai và Bên A không đồng ý phương án thay thế; hoặc quá thời hạn tại khoản 3.2 c mà chưa đặt được.</p>\n<p>8.3. Mọi khoản hoàn được chuyển về tài khoản ngân hàng Bên A khai trên trang theo dõi đơn trong vòng 07 ngày làm việc kể từ ngày phát sinh khoản hoàn, nội dung \"HOAN {{code}}\". Bên B không hoàn bằng tiền mặt, không giữ tiền hoàn dưới dạng điểm hay mã giảm giá nếu Bên A không yêu cầu.</p>\n<p>8.4. Nếu Bên B cung cấp không chính xác hoặc không đầy đủ thông tin theo Điều 37 Luật Bảo vệ quyền lợi người tiêu dùng 2023, Bên A có quyền đơn phương chấm dứt hợp đồng trong 30 ngày kể từ ngày giao kết và được hoàn tiền theo Điều 38 Luật này.</p>\n\n<h2>Điều 9. Quyền và nghĩa vụ của Bên A</h2>\n<p>9.1. Cung cấp đúng, đủ họ tên, số điện thoại, địa chỉ nhận hàng ba cấp (tỉnh/thành, quận/huyện, phường/xã) và thông tin hóa đơn nếu có; chịu trách nhiệm về thông tin đã khai (Luật Thương mại 2005, Điều 163 khoản 1).</p>\n<p>9.2. Thanh toán đúng hạn; nhận hàng hoặc ủy quyền người nhận; kiểm tra hàng khi nhận.</p>\n<p>9.3. Được yêu cầu Bên B thông báo đầy đủ tình hình thực hiện (Điều 162 khoản 1); được tra cứu đơn mọi lúc trên trang theo dõi đơn bằng mã đơn và số điện thoại hoặc tài khoản.</p>\n<p>9.4. Không chịu trách nhiệm về hành vi vi phạm pháp luật của Bên B, trừ trường hợp nguyên nhân do Bên A gây ra hoặc các bên cố ý làm trái pháp luật (Điều 162 khoản 2, Điều 163 khoản 4).</p>\n\n<h2>Điều 10. Quyền và nghĩa vụ của Bên B</h2>\n<p>10.1. Thực hiện mua hàng đúng thỏa thuận và trong hạn mức ủy quyền; thông báo kịp thời các vấn đề phát sinh; thực hiện chỉ dẫn hợp lý của Bên A; giao hàng, giao tiền đúng thỏa thuận (Điều 165).</p>\n<p>10.2. Bảo quản tài sản, tài liệu và giữ bí mật thông tin liên quan đến hợp đồng (Điều 165 khoản 4, 5); bảo vệ dữ liệu cá nhân của Bên A theo Điều 11.</p>\n<p>10.3. Được nhận thù lao ủy thác và yêu cầu Bên A cung cấp thông tin cần thiết (Điều 164 khoản 1, 2).</p>\n<p>10.4. Duy trì sổ kế toán tách bạch tiền hàng thu hộ và thù lao; lưu trữ hợp đồng, chứng từ điện tử của đơn hàng tối thiểu 10 năm theo pháp luật kế toán và cung cấp bản sao cho Bên A trong 07 ngày làm việc khi được yêu cầu.</p>\n\n<h2>Điều 11. Bảo vệ thông tin và dữ liệu cá nhân</h2>\n<p>11.1. Bên B xử lý họ tên, số điện thoại, email, địa chỉ nhận hàng và thông tin hóa đơn của Bên A để thực hiện hợp đồng này, gồm chuyển cho nhà cung cấp và đơn vị vận chuyển để giao hàng và xuất hóa đơn. Việc xử lý này là để thực hiện thỏa thuận giữa hai bên (Luật Bảo vệ dữ liệu cá nhân 2025, Điều 19 khoản 1 điểm d) và được Bên A biết rõ tại thời điểm đặt hàng.</p>\n<p>11.2. Bên B không dùng dữ liệu của Bên A cho quảng cáo, tiếp thị nếu Bên A không đồng ý riêng; không bán, không chuyển cho bên thứ ba ngoài mục đích 11.1. Lựa chọn của Bên A về việc nhận thông tin tiếp thị: {{marketing}}.</p>\n<p>11.3. Dữ liệu được lưu trữ có mã hóa trên hạ tầng của Google (Google Workspace, Google Cloud) đặt ngoài lãnh thổ Việt Nam theo hồ sơ đánh giá tác động chuyển dữ liệu xuyên biên giới mà Bên B đã lập; Bên A có quyền xem, tải về, yêu cầu sửa hoặc xóa dữ liệu bằng công cụ trên website, trừ chứng từ phải lưu theo pháp luật kế toán.</p>\n<p>11.4. Chi tiết tại Chính sách bảo vệ dữ liệu cá nhân công bố trên website, là một phần của Điều khoản dịch vụ.</p>\n\n<h2>Điều 12. Trách nhiệm do vi phạm, bất khả kháng</h2>\n<p>12.1. Bên vi phạm phải bồi thường thiệt hại thực tế, trực tiếp cho bên kia theo Bộ luật Dân sự 2015 và Luật Thương mại 2005. Bên B hoàn tiền chậm quá thời hạn tại Điều 8 phải trả lãi theo lãi suất quy định tại Bộ luật Dân sự 2015 cho thời gian chậm.</p>\n<p>12.2. Bên B không được miễn trách nhiệm chỉ vì Hàng hóa do nhà cung cấp hoặc đơn vị vận chuyển thực hiện (Luật Bảo vệ quyền lợi người tiêu dùng 2023, Điều 25 khoản 9).</p>\n<p>12.3. Sự kiện bất khả kháng theo Bộ luật Dân sự 2015 (thiên tai, dịch bệnh, quyết định của cơ quan nhà nước, sự cố hệ thống ngân hàng hoặc nhà cung cấp ngoài tầm kiểm soát) kéo dài thời hạn thực hiện tương ứng; quá 15 ngày, mỗi bên được chấm dứt hợp đồng và Bên B hoàn toàn bộ tiền đã thu chưa chi cho nhà cung cấp.</p>\n\n<h2>Điều 13. Giải quyết khiếu nại và tranh chấp</h2>\n<p>13.1. Bên A gửi khiếu nại qua hotline {{co_phone}}, email {{co_email}} hoặc trang theo dõi đơn. Bên B tiếp nhận trong 01 ngày làm việc và trả lời kết quả trong 07 ngày làm việc kể từ ngày nhận đủ thông tin.</p>\n<p>13.2. Tranh chấp được giải quyết bằng thương lượng; không thành, mỗi bên có quyền đưa ra Tòa án nhân dân có thẩm quyền theo pháp luật Việt Nam. Bên A là người tiêu dùng có thể lựa chọn phương thức giải quyết tranh chấp theo Luật Bảo vệ quyền lợi người tiêu dùng 2023, gồm Tòa án nơi Bên A cư trú.</p>\n\n<h2>Điều 14. Điều khoản chung</h2>\n<p>14.1. Hợp đồng được giao kết bằng thông điệp dữ liệu, có giá trị như văn bản theo Luật Giao dịch điện tử 2023. Việc Bên A xác nhận bằng tài khoản đăng nhập mã OTP email hoặc bằng cặp mã đơn + số điện thoại và thanh toán từ tài khoản ngân hàng là chữ ký điện tử chuyên dùng theo thỏa thuận của các bên (Luật Giao dịch điện tử 2023, Điều 22 khoản 2). Bản hợp đồng kèm Phụ lục 1 được gửi vào email Bên A và lưu tại trang theo dõi đơn để Bên A xem lại, tải về bất kỳ lúc nào.</p>\n<p>14.2. Ngôn ngữ hợp đồng là tiếng Việt. Khi có cách hiểu khác nhau, hợp đồng được giải thích theo hướng có lợi cho Bên A.</p>\n<p>14.3. Điều khoản dịch vụ mua hộ công bố trên website tại thời điểm giao kết ({{terms_url}}) là một phần của hợp đồng; nếu mâu thuẫn, hợp đồng này và Phụ lục 1 được ưu tiên. Mọi sửa đổi phải được hai bên xác nhận bằng văn bản điện tử.</p>\n\n<h2>Phụ lục 1 - Nội dung đơn hàng (hệ thống tự lập)</h2>\n<table class=\"hd-t\">\n<tr><th>Mục</th><th>Nội dung</th></tr>\n<tr><td>Mã đơn hàng, thời điểm giao kết</td><td>{{code}} - {{at}} (giờ Việt Nam)</td></tr>\n<tr><td>Bên A</td><td>{{cust_name}}, {{cust_phone}}, {{cust_email}}, {{cust_address}}. {{vat_block}}</td></tr>\n<tr><td>Hàng hóa</td><td><table class=\"hd-l\"><tr><th>#</th><th>Mã KK</th><th>Tên hàng</th><th>SL</th><th>Tiền hàng/đơn vị</th><th>Thành tiền hàng</th><th>Thù lao dòng</th></tr>{{#lines}}<tr><td>{{i}}</td><td>{{sku}}</td><td>{{name}}</td><td>{{qty}}</td><td>{{unit_cost}}</td><td>{{line_cost}}</td><td>{{line_fee}}</td></tr>{{/lines}}</table></td></tr>\n<tr><td>Tổng tiền hàng thu hộ</td><td>{{goods}}</td></tr>\n<tr><td>Thù lao ủy thác (đã gồm VAT {{vat_rate}}%)</td><td>{{fee}}{{discount_note}}</td></tr>\n<tr><td>Tổng thanh toán</td><td><b>{{total}}</b> - chuyển khoản VietQR: {{bank_label}} {{bank_acc}}, nội dung chuyển khoản \"{{code}}\"</td></tr>\n<tr><td>Danh sách nguồn được phép đặt</td><td>{{sources}}</td></tr>\n<tr><td>Hạn mức ủy quyền tự động</td><td>biên dung sai {{tolerance}}/đơn vị; thời hạn đặt {{order_days}} ngày làm việc kể từ khi nhận đủ thanh toán</td></tr>\n<tr><td>Thời gian giao dự kiến</td><td>{{eta}}</td></tr>\n<tr><td>Phiên bản Điều khoản dịch vụ đã đồng ý</td><td>{{terms_label}} (áp dụng từ {{terms_date}}) - {{terms_url}}</td></tr>\n<tr><td>Nhận thông tin tiếp thị</td><td>{{marketing}}</td></tr>\n</table>\n<p class=\"hd-foot\">Bản hợp đồng này do hệ thống KK-MALL lập tự động từ dữ liệu Bên A nhập và được lưu nguyên văn kèm đơn hàng; mã băm SHA-256 của nội dung văn bản (sau khi bỏ định dạng, gộp khoảng trắng) được ghi vào chuỗi băm nhật ký của hệ thống để chứng minh không bị sửa đổi.</p>\n</div>"
};
/* ==== HD:END ==== */

/* =========================== ĐIỀU KHOẢN & HỢP ĐỒNG ĐIỆN TỬ ===========================
 * TERMS_META / TERMS_TPL sinh tu legal/terms (nguon duy nhat). Phien ban moi nhat chua co ngay ap dung -> chu so huu dat
 * TERMS_EFFECTIVE (YYYY-MM-DD, cach hom nay >= 7 ngay) tai Quan tri sau khi luat su chot van ban. Don dat truoc ngay do van theo ban cu.
 * Moi don: van ban dien theo don -> luu nguyen van (sheet Contracts) + bam SHA-256 van ban chuan + noi chuoi bam + dinh kem email + tai ve. */
var SOURCES_PUBLIC = ['Tiki', 'Shopee', 'Lazada', 'TikTok Shop', 'Sendo', 'Điện Máy Xanh', 'Thế Giới Di Động', 'FPT Shop', 'CellphoneS', 'Hoàng Hà Mobile', 'Phúc Anh', 'An Phát'];
function vnToday_(t) { return Utilities.formatDate(new Date(t || Date.now()), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
function termsList_() {
  var ov = str_(P_().getProperty('TERMS_EFFECTIVE') || '', 10);
  return TERMS_META.map(function (t, i) { var x = {}; for (var k in t) x[k] = t[k]; if (!x.effective && i === TERMS_META.length - 1 && /^\d{4}-\d{2}-\d{2}$/.test(ov)) x.effective = ov; return x; });
}
function termsActive_(t) { var today = vnToday_(t), L = termsList_(), a = L[0]; L.forEach(function (x) { if (x.effective && x.effective <= today) a = x; }); return a; }
function hdCfg_() {
  var b = bank_();
  return { company: company_(), bank: b.ready ? { label: b.label, acc: b.acc } : {}, terms: termsActive_(), vat_rate: Number(cfg_('VAT_RATE')), voucher_cap: Number(cfg_('VOUCHER_FEE_CAP_PCT')), tolerance: Number(cfg_('TOLERANCE')),
    order_days: 5, unpaid_hours: Number(cfg_('UNPAID_HOURS')), return_days: Number(cfg_('RETURN_DAYS')), sources: SOURCES_PUBLIC, fee_table: feeTable_() };
}
function termsPublic_() { var c = hdCfg_(); return { active: c.terms.version, versions: termsList_(), config: c, templates: TERMS_TPL }; }
function hdHtml_(o, c) { c = c || hdCfg_(); var tpl = TERMS_TPL[c.terms.version]; if (!tpl) throw err_('Thiếu mẫu hợp đồng ' + c.terms.version, 500); return KKHD.fill(tpl, KKHD.data(o, c)); }
function hdHash_(html) { return sha_(KKHD.text(html)); }
function hdTitle_(code, version) { return (version === 'UQ-2026-10' ? 'Xác nhận ủy quyền mua hộ ' : 'Hợp đồng ủy thác mua hàng hóa ') + code; }
function contractSave_(o) { // ban chot cua don: luu nguyen van + ma bam + noi chuoi (goi trong khoa, truoc khi ghi don)
  var c = hdCfg_(), html = hdHtml_(o, c), hash = hdHash_(html);
  o.contract = { version: c.terms.version, label: c.terms.label, effective: c.terms.effective || '', at: o.created_at, hash: hash, marketing: !!o.marketing, consent: true };
  append_('Contracts', { code: o.code, version: c.terms.version, hash: hash, created_at: o.created_at, marketing: o.marketing ? 1 : 0, html: html });
  chain_('contract', o.code, { code: o.code, version: c.terms.version, hash: hash, marketing: !!o.marketing, at: o.created_at }, hash);
  return { html: html, hash: hash, version: c.terms.version };
}
function contractDoc_(code, version, html, hash) { return KKHD.doc(html, hdTitle_(code, version) + ' - KK-MALL', hash); }
function orderContract_(b) {
  var o = ownedOrder_(b, true), r = find_('Contracts', 'code', o.code);
  if (!r) throw err_('Đơn này đặt trước khi hệ thống lập văn bản hợp đồng điện tử - liên hệ KK-MALL để nhận bản sao', 404);
  return { code: o.code, version: r.version, hash: r.hash, created_at: r.created_at, title: hdTitle_(o.code, r.version), html: contractDoc_(o.code, r.version, String(r.html), r.hash) };
}
function memberMarketing_(email, on, version) {
  var m = find_('Members', 'email', String(email || '').toLowerCase()); if (!m) return false;
  var d = parseData_(m); d.marketing = { on: !!on, at: nowIso_(), version: version || '' }; update_('Members', m._row, { data: JSON.stringify(d) });
  log_(on ? 'marketing_on' : 'marketing_off', email, version || ''); return true;
}

function P_() { return PropertiesService.getScriptProperties(); }
function cfg_(k) { var v = P_().getProperty(k); return v === null || v === undefined ? (DEFAULTS[k] !== undefined ? DEFAULTS[k] : '') : v; }
function nowIso_() { return new Date().toISOString(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(msg, code) { var e = new Error(msg); e.code = code || 400; return e; }
function sha_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(function (b) { return ((b + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join(''); }
function pepper_() { var p = P_().getProperty('PEPPER'); if (!p) { p = Utilities.getUuid() + Utilities.getUuid(); P_().setProperty('PEPPER', p); } return p; }
function hash_(s) { return sha_(pepper_() + '|' + s); }
function rnd_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function str_(v, max) { v = v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); return max ? v.slice(0, max) : v; }
function safeCell_(v) { // chong chen cong thuc vao Google Sheet / CSV
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
function normPhone_(p) { return String(p || '').replace(/\D/g, '').replace(/^84/, '0'); }
function vnd_(n) { return Number(n || 0).toLocaleString('vi-VN') + ' đ'; }
function esc_(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function maskPhone_(p) { p = String(p || ''); return p.length > 6 ? p.slice(0, 3) + '****' + p.slice(-3) : p; }
function isEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function adminEmails_() { return cfg_('ADMIN_EMAILS').toLowerCase().split(/[,;\s]+/).filter(String); }

/* =========================== SHEET =========================== */
function ss_() {
  var id = P_().getProperty('SHEET_ID');
  if (!id) throw err_('Máy chủ chưa được khởi tạo (chạy setup)', 500);
  return SpreadsheetApp.openById(id);
}
function sh_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) { s = ss_().insertSheet(name); s.appendRow(SHEETS[name]); s.setFrozenRows(1); }
  return s;
}
function rows_(name) {
  var s = sh_(name), v = s.getDataRange().getValues(), h = v[0], out = [];
  for (var i = 1; i < v.length; i++) { var o = { _row: i + 1 }; for (var j = 0; j < h.length; j++) o[h[j]] = v[i][j]; out.push(o); }
  return out;
}
function append_(name, obj) {
  var h = SHEETS[name]; sh_(name).appendRow(h.map(function (k) { return safeCell_(obj[k] === undefined ? '' : obj[k]); }));
}
function update_(name, row, obj) {
  var h = SHEETS[name], s = sh_(name);
  var cur = s.getRange(row, 1, 1, h.length).getValues()[0].map(safeCell_); // Sheets tra ve gia tri DA BO dau ' -> bao ve lai ca o cu
  for (var j = 0; j < h.length; j++) if (obj[h[j]] !== undefined) cur[j] = safeCell_(obj[h[j]]);
  s.getRange(row, 1, 1, h.length).setValues([cur]);
}
function find_(name, key, val) { var r = rows_(name); for (var i = 0; i < r.length; i++) if (String(r[i][key]) === String(val)) return r[i]; return null; }
function log_(action, actor, detail) { try { append_('Log', { at: nowIso_(), action: action, actor: actor || '', detail: str_(typeof detail === 'string' ? detail : JSON.stringify(detail), 2000) }); } catch (e) { } }
function parseData_(r) { try { return JSON.parse(r.data || '{}'); } catch (e) { return {}; } }

/* =========================== ĐỊNH GIÁ =========================== */
function tiers_() {
  var raw = str_(cfg_('PRICING_TIERS')); var t = [];
  raw.split(/[,;\s]+/).forEach(function (x) { var p = x.split(':').map(function (v) { return parseInt(v, 10); }); if (p.length === 2 && isFinite(p[0]) && isFinite(p[1])) t.push(p); });
  t.sort(function (a, b) { return b[0] - a[0]; });
  if (t.length && t[t.length - 1][0] > 0) t.push([0, t[t.length - 1][1]]);
  return t;
}
function toCost_(sell) { var T = tiers_(); for (var i = 0; i < T.length; i++) if (sell - T[i][1] >= T[i][0]) return sell - T[i][1]; return T.length ? sell - T[T.length - 1][1] : sell; }
function feeTable_() { // bang phi cong khai (dieu khoan dich vu)
  var T = tiers_().slice().reverse(), out = [];
  for (var i = 0; i < T.length; i++) { var lo = T[i][0], hi = i + 1 < T.length ? T[i + 1][0] - 1 : null; out.push({ from: lo, to: hi, fee: T[i][1] }); }
  return out;
}
function product_(sku, fresh) {
  sku = str_(sku, 20).toUpperCase(); if (!/^KK\d{6}$/.test(sku)) throw err_('Mã sản phẩm không hợp lệ');
  var c = CacheService.getScriptCache(), k = 'p_' + sku;
  if (!fresh) { var hit = c.get(k); if (hit) return JSON.parse(hit); }
  var r = UrlFetchApp.fetch(cfg_('SITE') + '/api/products/' + sku + '.json?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw err_('Không tìm thấy sản phẩm ' + sku, 404);
  var d = JSON.parse(r.getContentText());
  var p = { sku: d.sku, name: d.name, brand: d.brand, category_id: d.category_id, grp: d.grp, image: d.image, kk_price: d.kk_price, in_stock: d.in_stock, sh: Number(d.sh) || 0, fl: d.trust ? d.trust.fl : 0, warranty: (d.specs || {})['Bảo hành'] || '' };
  try { c.put(k, JSON.stringify(p), 120); } catch (e) { }
  return p;
}
function sellable_(p) { return p.in_stock && p.kk_price > 0 && !(p.fl & FL.HOLD) && !(p.fl & FL.NO_SOURCE); }
function quote_(items, codes, fresh) {
  if (!items || !items.length) throw err_('Giỏ hàng trống');
  if (fresh && rateFixed_('qfresh', 240, 60)) fresh = false; // qua 240 bao gia moi/phut: dung gia trong bo nho dem (<=2 phut)
  if (items.length > 30) throw err_('Tối đa 30 dòng sản phẩm mỗi đơn');
  var vat = Number(cfg_('VAT_RATE')) / 100, lines = [], bad = [];
  items.forEach(function (it) {
    var qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    var p = product_(it.sku, fresh);
    if (!sellable_(p)) { bad.push({ sku: p.sku, name: p.name, reason: (p.fl & FL.NO_SOURCE) ? 'Đang kết nối nguồn hàng' : (p.fl & FL.HOLD) ? 'Đang xác minh giá' : 'Hết hàng' }); return; }
    var cost = toCost_(p.kk_price), fee = p.kk_price - cost;
    lines.push({ sku: p.sku, name: p.name, brand: p.brand, category_id: p.category_id, image: p.image, qty: qty, unit: p.kk_price, unit_cost: cost, unit_fee: fee, ship_est: p.sh || 0, line_total: p.kk_price * qty, line_cost: cost * qty, line_fee: fee * qty });
  });
  var goods = lines.reduce(function (a, l) { return a + l.line_cost; }, 0), fee = lines.reduce(function (a, l) { return a + l.line_fee; }, 0);
  var sub = goods + fee;
  // voucher: moi nhom 1 ma tot nhat; tong giam KHONG vuot phi dich vu (khong bu tien hang)
  var best = {};
  VOUCHERS.forEach(function (v) {
    if (sub < v.min) return;
    var scope = v.scope === 'all' ? sub : lines.filter(function (l) { return l.category_id === v.scope; }).reduce(function (a, l) { return a + l.line_total; }, 0);
    if (!scope) return;
    var d = v.type === 'percent' ? Math.min(Math.floor(scope * v.value / 100), v.max || 1e12) : Math.min(v.value, scope);
    if (d > 0 && (!best[v.group] || d > best[v.group].d)) best[v.group] = { code: v.code, title: v.title, d: d };
  });
  var vouchers = Object.keys(best).map(function (g) { return best[g]; });
  var cap = Math.floor(fee * Math.max(0, Math.min(100, Number(cfg_('VOUCHER_FEE_CAP_PCT')))) / 100 / 1000) * 1000; // lam tron nghin
  var disc = Math.min(cap, vouchers.reduce(function (a, v) { return a + v.d; }, 0));
  if (!disc) vouchers = [];
  var feeNet = fee - disc, feePre = Math.round(feeNet / (1 + vat)), feeVat = feeNet - feePre;
  return { lines: lines, unavailable: bad, goods: goods, fee: fee, discount: disc, vouchers: vouchers.map(function (v) { return { code: v.code, title: v.title }; }),
    fee_net: feeNet, fee_pre_tax: feePre, fee_vat: feeVat, vat_rate: vat * 100, total: goods + feeNet, fee_table: feeTable_() };
}

/* =========================== EMAIL =========================== */
// phap nhan theo GCN dang ky doanh nghiep (gia tri luu trong Admin -> He thong luon uu tien hon)
var COMPANY_DEFAULT = { name: 'CÔNG TY TNHH KK-MALL', name_en: 'KK-MALL COMPANY LIMITED', short: 'KK-MALL', tax: '0111694057', reg_no: '0111694057' };
function company_() { var c = {}; try { c = JSON.parse(cfg_('COMPANY_JSON') || '{}'); } catch (e) { } var out = {}; Object.keys(COMPANY_DEFAULT).forEach(function (k) { out[k] = COMPANY_DEFAULT[k]; }); Object.keys(c || {}).forEach(function (k) { if (c[k] !== '' && c[k] != null) out[k] = c[k]; }); return out; }
function mail_(to, subject, html, opt) {
  try {
    var c = company_();
    var m = { to: to, subject: subject, name: c.short || 'KK-MALL' }; if (opt && opt.attachments) m.attachments = opt.attachments;
    m.htmlBody = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#0F172A;line-height:1.55">'
      + '<div style="background:#1E3A8A;color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;font-weight:800;font-size:18px">KK-MALL</div><div style="border:1px solid #E2E8F0;border-top:0;padding:18px 20px;border-radius:0 0 12px 12px">'
      + html + '<hr style="border:0;border-top:1px solid #E2E8F0;margin:18px 0"><div style="font-size:12px;color:#64748B">' + esc_(c.name || 'KK-MALL') + (c.tax ? ' · MST ' + esc_(c.tax) : '') + (c.phone ? ' · ' + esc_(c.phone) : '') + ' · ' + cfg_('SITE') + '</div></div></div>';
    MailApp.sendEmail(m);
    return true;
  } catch (e) { log_('mail_error', to, e.message); return false; }
}
function orderTable_(o) {
  return '<table style="width:100%;border-collapse:collapse;font-size:14px">' + o.lines.map(function (l) { return '<tr><td style="padding:6px 0;border-bottom:1px solid #F1F5F9">' + esc_(l.name) + ' × ' + l.qty + '</td><td style="text-align:right;border-bottom:1px solid #F1F5F9">' + vnd_(l.line_cost) + '</td></tr>'; }).join('')
    + '<tr><td style="padding:6px 0">Tiền hàng thanh toán hộ nhà cung cấp</td><td style="text-align:right">' + vnd_(o.goods) + '</td></tr>'
    + '<tr><td>Phí dịch vụ mua hộ & xử lý đơn KK-MALL (gồm VAT)</td><td style="text-align:right">' + vnd_(o.fee) + '</td></tr>'
    + (o.discount ? '<tr><td style="color:#047857">Giảm phí dịch vụ (' + o.vouchers.map(function (v) { return v.code; }).join('+') + ')</td><td style="text-align:right;color:#047857">-' + vnd_(o.discount) + '</td></tr>' : '')
    + '<tr><td style="padding-top:8px;font-weight:800">Tổng thanh toán</td><td style="text-align:right;font-weight:800;color:#DC2626;padding-top:8px">' + vnd_(o.total) + '</td></tr></table>';
}
function payBox_(o) {
  var b = bank_(); if (!b.ready) return '<p>KK-MALL sẽ liên hệ để gửi thông tin thanh toán chuyển khoản.</p>';
  return '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;margin:12px 0"><b>Chuyển khoản VietQR</b><br>Ngân hàng: <b>' + esc_(b.label) + '</b><br>Số tài khoản: <b>' + esc_(b.acc) + '</b><br>Chủ tài khoản: <b>' + esc_(b.name) + '</b><br>Số tiền: <b style="color:#DC2626">' + vnd_(o.total) + '</b><br>Nội dung: <b>' + o.code + '</b><br><img src="' + qrUrl_(o) + '" width="220" style="margin-top:8px"></div>';
}
function bank_() { var bin = cfg_('BANK_BIN'), acc = cfg_('BANK_ACC'); return { ready: !!(bin && acc), bin: bin, acc: acc, name: cfg_('BANK_NAME'), label: cfg_('BANK_LABEL') || bin }; }
function qrUrl_(o) { var b = bank_(); return 'https://img.vietqr.io/image/' + encodeURIComponent(b.bin) + '-' + encodeURIComponent(b.acc) + '-compact2.png?amount=' + o.total + '&addInfo=' + encodeURIComponent(o.code) + '&accountName=' + encodeURIComponent(b.name); }

/* =========================== THÀNH VIÊN & OTP =========================== */
function rate_(key, max, sec) {
  sec = Math.min(sec, 21600); // CacheService chi giu toi da 6 gio
  var c = CacheService.getScriptCache(), n = parseInt(c.get(key) || '0', 10);
  if (n >= max) throw err_('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút', 429);
  c.put(key, String(n + 1), sec);
}
function otpCode_() { var h = Utilities.getUuid().replace(/-/g, ''); return String(100000 + (parseInt(h.slice(0, 12), 16) % 900000)); } // nguon ngau nhien an toan (SecureRandom)
function mailBudget_(reserve) { try { return MailApp.getRemainingDailyQuota() > reserve; } catch (e) { return true; } }
// chong do mo ma don + SDT: dem lan sai theo ma don va toan he thong
function guardCheck_(code) { var c = CacheService.getScriptCache(); if (parseInt(c.get('gf_' + code) || '0', 10) >= 8 || parseInt(c.get('gf_all') || '0', 10) >= 5000) throw err_('Tra cứu sai quá nhiều lần - vui lòng thử lại sau 1 giờ', 429); }
function guardFail_(code) { var c = CacheService.getScriptCache(); ['gf_' + code, 'gf_all'].forEach(function (k) { c.put(k, String(parseInt(c.get(k) || '0', 10) + 1), 3600); }); }
function ownedOrder_(b, adminOk) {
  var code = str_(b.code, 20).toUpperCase(), NF = 'Không tìm thấy đơn hàng hoặc số điện thoại không khớp';
  var o; try { o = loadOrder_(code); } catch (e) { guardCheck_(code); guardFail_(code); throw err_(NF, 404); }
  if (b.token) { try { var s = session_(b.token); if ((adminOk && s.role === 'admin') || s.email === o.customer.email || s.email === o.member) return o; } catch (e) { } } // chu don da dang nhap: khong bi khoa
  guardCheck_(code);
  if (!normPhone_(b.phone) || normPhone_(b.phone) !== o.customer.phone) { guardFail_(code); throw err_(NF, 404); }
  return o;
}
// Gioi han theo CUA SO CO DINH (khong keo dai thoi gian khoa moi lan thu) - tra ve so giay con lai neu vuot
function rateFixed_(key, max, sec) {
  var c = CacheService.getScriptCache(), win = Math.floor(Date.now() / (sec * 1000)), k = key + '_' + win, n = parseInt(c.get(k) || '0', 10);
  if (n >= max) return Math.ceil(((win + 1) * sec * 1000 - Date.now()) / 1000);
  c.put(k, String(n + 1), sec); return 0;
}
function otpRequest_(b) {
  var email = str_(b.email, 120).toLowerCase(); if (!isEmail_(email)) throw err_('Email không hợp lệ');
  var c = CacheService.getScriptCache(), cur = null; try { cur = JSON.parse(c.get('otp_' + email) || 'null'); } catch (e) { cur = null; }
  // bam "Gui ma" lien tiep (bam dup / mang cham): KHONG gui ma moi trong 60 giay - ma vua gui van dung duoc
  if (cur && cur.at && Date.now() - cur.at < 60000) return { ok: true, sent: true, reused: true, wait: Math.ceil((60000 - (Date.now() - cur.at)) / 1000), expires_in: Math.max(0, Math.round((cur.at + 600000 - Date.now()) / 1000)) };
  var adm = adminEmails_().indexOf(email) >= 0, day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var w = rateFixed_('otp15_' + email, adm ? 6 : 3, 900);
  if (w) throw err_('Đã gửi nhiều mã trong 15 phút - dùng mã MỚI NHẤT trong email, hoặc thử lại sau ' + Math.ceil(w / 60) + ' phút', 429);
  var cd = CacheService.getScriptCache(), dk = 'otpday_' + email + '_' + day, dn = parseInt(cd.get(dk) || '0', 10);
  if (dn >= (adm ? 40 : 10)) throw err_('Email này đã nhận quá nhiều mã hôm nay - vui lòng thử lại vào ngày mai', 429);
  cd.put(dk, String(dn + 1), 21600); // CacheService toi da 6 gio; khoa theo ngay nam trong ten khoa
  if (!adm && rateFixed_('otp_all', 40, 3600)) throw err_('Hệ thống đang nhận nhiều yêu cầu, vui lòng thử lại sau ít phút', 429);
  if (!mailBudget_(adm ? 5 : 30)) throw err_('Hệ thống đang tạm giới hạn gửi email, vui lòng thử lại sau', 503); // giu han muc email cho don hang
  var code = otpCode_();
  // giu ca ma truoc (neu con han) de ma trong email cu van dung khi 2 email den lech nhau
  var prev = cur && cur.h && cur.at && Date.now() - cur.at < 600000 ? { h: cur.h, at: cur.at } : null;
  c.put('otp_' + email, JSON.stringify({ h: hash_(email + '|' + code), at: Date.now(), t: cur && prev ? (cur.t || 0) : 0, p: prev }), 600);
  var ok = mail_(email, 'Mã đăng nhập KK-MALL: ' + code, '<p>Mã xác thực của bạn là:</p><p style="font-size:30px;font-weight:900;letter-spacing:6px;color:#1E3A8A">' + code + '</p><p>Mã có hiệu lực <b>10 phút</b>. Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên KK-MALL.</p>');
  if (!ok) throw err_('Không gửi được email, vui lòng thử lại', 500);
  log_('otp_sent', email, '');
  return { ok: true, sent: true, expires_in: 600 };
}
function otpVerify_(b) {
  var lk = LockService.getScriptLock(); lk.waitLock(20000);
  try { return otpVerifyLocked_(b); } finally { lk.releaseLock(); }
}
function otpVerifyLocked_(b) {
  var email = str_(b.email, 120).toLowerCase(), code = str_(b.code, 6);
  var c = CacheService.getScriptCache(), raw = c.get('otp_' + email);
  if (!raw) throw err_('Mã đã hết hạn hoặc chưa được gửi', 401);
  var o = JSON.parse(raw);
  if (o.t >= 5) { c.remove('otp_' + email); throw err_('Nhập sai quá 5 lần - vui lòng lấy mã mới', 401); }
  var hc = hash_(email + '|' + code), prevOk = o.p && o.p.h === hc && Date.now() - o.p.at < 600000;
  if (hc !== o.h && !prevOk) { o.t = (o.t || 0) + 1; c.put('otp_' + email, JSON.stringify(o), 600); throw err_('Mã xác thực không đúng' + (o.t >= 3 ? ' (còn ' + (5 - o.t) + ' lần thử)' : ''), 401); }
  c.remove('otp_' + email);
  var isAdm = adminEmails_().indexOf(email) >= 0, role = isAdm && b.scope === 'admin' ? 'admin' : 'member'; // quyen quan tri chi cap khi dang nhap tu /admin
  {
    var m = find_('Members', 'email', email);
    var mrole = isAdm ? 'admin' : 'member';
    if (!m) append_('Members', { email: email, name: str_(b.name, 100), phone: normPhone_(b.phone), address: str_(b.address, 300), role: mrole, created_at: nowIso_(), last_login: nowIso_(), data: '{}' });
    else update_('Members', m._row, { last_login: nowIso_(), role: mrole });
    var token = rnd_();
    append_('Sessions', { token_hash: hash_(token), email: email, role: role, created_at: nowIso_(), expires_at: new Date(Date.now() + (role === 'admin' ? 12 * 36e5 : 30 * 864e5)).toISOString() });
  }
  log_('login', email, role);
  if (role === 'admin') adminsMail_('🔐 Đăng nhập quản trị KK-MALL: ' + email, '<p>Tài khoản <b>' + esc_(email) + '</b> vừa đăng nhập trang quản trị lúc ' + new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' (phiên hiệu lực 12 giờ).</p><p>Nếu không phải bạn: đổi mật khẩu Google ngay và xóa các dòng phiên trong sheet Sessions.</p>');
  return { token: token, member: memberOut_(find_('Members', 'email', email)) };
}
function memberOut_(m) { return m ? { email: m.email, name: m.name, phone: m.phone, address: m.address, role: m.role, marketing: !!((parseData_(m).marketing || {}).on) } : null; }
function session_(token, needAdmin) {
  if (!token) throw err_('Vui lòng đăng nhập', 401);
  var s = find_('Sessions', 'token_hash', hash_(str_(token, 100)));
  if (!s || new Date(s.expires_at) < new Date()) throw err_('Phiên đăng nhập đã hết hạn', 401);
  if (needAdmin && (s.role !== 'admin' || adminEmails_().indexOf(String(s.email).toLowerCase()) < 0)) throw err_('Không có quyền quản trị', 403);
  return s;
}

/* ---------- quyền của chủ thể dữ liệu (Luật Bảo vệ dữ liệu cá nhân 2025): tải dữ liệu, xóa tài khoản ---------- */
function memberExport_(b) {
  var s = session_(b.token); rate_('mexp_' + s.email, 5, 3600);
  var m = find_('Members', 'email', s.email), orders = rows_('Orders').filter(function (r) { var d = parseData_(r); return r.email === s.email || d.member === s.email; }).map(function (r) { var o = parseData_(r); return { code: o.code, created_at: o.created_at, status: o.status, customer: o.customer, vat: o.vat, lines: (o.lines || []).map(function (l) { return { sku: l.sku, name: l.name, qty: l.qty, unit: l.unit }; }), total: o.total, history: o.history, refund_account: o.refund_account || null }; });
  var revs = rows_('Reviews').filter(function (r) { return orders.some(function (o) { return o.code === r.order_code; }); }).map(function (r) { return { sku: r.sku, rating: r.rating, content: r.content, status: r.status, created_at: r.created_at }; });
  log_('member_export', s.email, orders.length + ' don');
  return { exported_at: nowIso_(), controller: 'KK-MALL', member: memberOut_(m), orders: orders, reviews: revs, note: 'Dữ liệu đơn hàng được lưu theo thời hạn Luật Kế toán; bạn có thể yêu cầu chỉnh sửa/xóa phần không bắt buộc lưu.' };
}
function memberDelete_(b) {
  var s = session_(b.token); if (String(b.confirm || '').toUpperCase() !== 'XOA') throw err_('Gõ XOA để xác nhận xóa tài khoản');
  if (adminEmails_().indexOf(String(s.email).toLowerCase()) >= 0) throw err_('Không xóa tài khoản quản trị từ cửa hàng');
  var lk = LockService.getScriptLock(); lk.waitLock(20000);
  try {
    var m = find_('Members', 'email', s.email); if (m) update_('Members', m._row, { name: '', phone: '', address: '', role: 'deleted', data: JSON.stringify({ deleted_at: nowIso_() }) });
    var sh = sh_('Sessions'), v = sh.getDataRange().getValues(); for (var i = v.length - 1; i >= 1; i--) if (String(v[i][1]).toLowerCase() === String(s.email).toLowerCase()) sh.deleteRow(i + 1);
  } finally { lk.releaseLock(); }
  mail_(s.email, 'KK-MALL đã xóa tài khoản của bạn', '<p>Tài khoản thành viên <b>' + esc_(s.email) + '</b> đã được xóa: họ tên, số điện thoại, địa chỉ mặc định và mọi phiên đăng nhập. Chứng từ của các đơn đã phát sinh được lưu trữ theo thời hạn Luật Kế toán và chỉ dùng cho nghĩa vụ kế toán, thuế, bảo hành.</p>');
  log_('member_delete', s.email, 'xoa tai khoan theo yeu cau');
  return { ok: true };
}
function memberUpdate_(b) {
  var s = session_(b.token), m = find_('Members', 'email', s.email);
  var ph = normPhone_(b.phone); if (b.phone && !/^0\d{9}$/.test(ph)) throw err_('Số điện thoại không hợp lệ');
  update_('Members', m._row, { name: str_(b.name, 100) || m.name, phone: ph || m.phone, address: str_(b.address, 300) || m.address });
  return { member: memberOut_(find_('Members', 'email', s.email)) };
}
function logout_(b) { var s = find_('Sessions', 'token_hash', hash_(str_(b.token, 100))); if (s) update_('Sessions', s._row, { expires_at: nowIso_() }); return { ok: true }; }

/* =========================== ĐƠN HÀNG =========================== */
function newCode_() { var d = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyMMdd'); return 'KK' + d + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); }
var CODE_RE = /KK\d{6}(?:[0-9A-F]{8}|[0-9A-F]{5})/g; // ma moi 8 ky tu hex, ma cu 5 ky tu
function orderCreate_(b) {
  if (b.website) throw err_('Yêu cầu không hợp lệ'); // honeypot chong bot
  var c = b.customer || {};
  var name = str_(c.name, 100), phone = normPhone_(c.phone), email = str_(c.email, 120).toLowerCase(), addr = str_(c.address, 300);
  if (name.length < 2) throw err_('Vui lòng nhập họ tên người nhận');
  if (!/^0\d{9}$/.test(phone)) throw err_('Số điện thoại không hợp lệ');
  if (!isEmail_(email)) throw err_('Email không hợp lệ (dùng để nhận hóa đơn)');
  if (addr.length < 10) throw err_('Địa chỉ nhận hàng chưa đầy đủ');
  var T = termsActive_();
  if (b.consent !== true || b.consent_version !== T.version) throw err_('Bạn cần đọc và đồng ý ' + (T.version === 'UQ-2026-10' ? 'Điều khoản dịch vụ và Ủy quyền mua hộ - thanh toán hộ' : 'Hợp đồng ủy thác mua hàng hóa và Điều khoản dịch vụ mua hộ') + ' (phiên bản ' + T.label + ')' + (b.consent_version && b.consent_version !== T.version ? ' - trang đang mở theo phiên bản cũ, vui lòng tải lại trang' : ''));
  rate_('ord_' + phone, 10, 3600); rate_('ord_e_' + email, 10, 3600); rate_('ord_all', 40, 3600);
  if (!mailBudget_(5)) throw err_('Hệ thống đang quá tải, vui lòng thử lại sau ít phút', 503);
  var q = quote_(b.items, b.voucher_codes, true);
  if (q.unavailable.length) throw err_('Sản phẩm không còn đặt được: ' + q.unavailable.map(function (x) { return x.name + ' (' + x.reason + ')'; }).join('; '), 409);
  if (b.lock && b.lock.items) {
    if (!b.lock.exp || Date.now() > Number(b.lock.exp)) throw err_('Hết thời gian giữ giá - hệ thống sẽ kiểm tra lại giá & tồn kho', 409);
    var changed = b.lock.items.filter(function (l) { var x = q.lines.filter(function (y) { return y.sku === l.sku; })[0]; return !x || x.unit !== Number(l.price); });
    if (changed.length) throw err_('Giá vừa thay đổi ở ' + changed.length + ' sản phẩm - vui lòng xác nhận lại giá mới', 409);
  }
  var v = b.vat || {}, vat = null;
  if (v.need) {
    vat = { name: str_(v.name, 200), tax_code: str_(v.tax_code, 20).replace(/\s/g, ''), address: str_(v.address, 300), email: str_(v.email, 120).toLowerCase() || email };
    if (vat.name.length < 2) throw err_('Vui lòng nhập tên đơn vị / cá nhân trên hóa đơn');
    if (vat.tax_code && !/^\d{10}(-\d{3})?$|^\d{12}$/.test(vat.tax_code)) throw err_('Mã số thuế không hợp lệ (10 số, 10-3 số hoặc 12 số CCCD)');
  }
  var member = ''; if (b.token) { try { member = session_(b.token).email; } catch (e) { } }
  var o = { code: newCode_(), created_at: nowIso_(), status: 'awaiting_payment', payment_status: 'unpaid', member: member,
    customer: { name: name, phone: phone, email: email, address: addr, note: str_(c.note, 300) }, vat: vat,
    lines: q.lines, goods: q.goods, fee: q.fee, discount: q.discount, vouchers: q.vouchers, fee_net: q.fee_net, fee_pre_tax: q.fee_pre_tax, fee_vat: q.fee_vat, vat_rate: q.vat_rate, total: q.total,
    payment_method: 'vietqr', marketing: b.marketing === true, consent: { version: T.version, at: nowIso_(), ua: str_(b.ua, 200), marketing: b.marketing === true },
    price_lock: b.lock ? { at: b.lock.at ? new Date(Number(b.lock.at)).toISOString() : '', ms: b.lock.ms || null } : null,
    history: [{ at: nowIso_(), s: 'awaiting_payment', by: 'customer' }] };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    for (var tries = 0; find_('Orders', 'code', o.code); tries++) { if (tries > 5) throw err_('Hệ thống bận, vui lòng thử lại', 503); o.code = newCode_(); }
    var hd = contractSave_(o); // van ban giao ket: luu nguyen van + bam + noi chuoi truoc khi ghi don
    append_('Orders', { code: o.code, created_at: o.created_at, status: o.status, payment_status: o.payment_status, email: email, phone: phone, name: name, goods: o.goods, fee: o.fee_net, total: o.total, paid_at: '', data: JSON.stringify(o), updated_at: nowIso_() }); }
  finally { lock.releaseLock(); }
  if (member) { try { memberMarketing_(member, o.marketing, T.version); } catch (e) { } }
  var hdDoc = contractDoc_(o.code, hd.version, hd.html, hd.hash);
  mail_(email, 'KK-MALL đã nhận đơn ' + o.code + ' - vui lòng thanh toán', '<p>Chào <b>' + esc_(name) + '</b>,</p><p>KK-MALL đã nhận đơn <b>' + o.code + '</b>. Ngay khi nhận được thanh toán, hệ thống tự động đặt mua tại nhà cung cấp có giá tốt nhất và giao thẳng đến bạn.</p>' + orderTable_(o) + payBox_(o)
    + '<p style="font-size:13px;color:#475569">📄 <b>' + esc_(hdTitle_(o.code, hd.version)) + '</b> (phiên bản ' + esc_(T.label) + ') đính kèm email này - đây là xác nhận giao kết của KK-MALL; mã băm SHA-256 của văn bản: <code>' + hd.hash + '</code>. Bạn xem lại, tải về bất kỳ lúc nào tại trang theo dõi đơn.</p>'
    + '<p style="font-size:13px;color:#475569">Hóa đơn GTGT tiền hàng do <b>nhà cung cấp</b> xuất trực tiếp cho bạn; KK-MALL xuất hóa đơn GTGT riêng cho <b>phí dịch vụ</b>. Đơn chưa thanh toán sau ' + cfg_('UNPAID_HOURS') + ' giờ sẽ tự hủy.</p><p><a href="' + cfg_('SITE') + '/?order=' + o.code + '&phone=' + phone + '">Theo dõi đơn hàng →</a></p>',
    { attachments: [Utilities.newBlob(hdDoc, 'text/html', 'KK-MALL-' + o.code + '-hop-dong.html')] });
  adminsMail_('🆕 Đơn mới ' + o.code + ' - ' + vnd_(o.total) + ' (chờ thanh toán)', '<p>Đơn mới từ <b>' + esc_(name) + '</b> (' + maskPhone_(phone) + ').</p>' + orderTable_(o));
  log_('order_create', email, o.code + ' ' + o.total);
  return { order: publicOrder_(o), payment: payInfo_(o) };
}
function payInfo_(o) { var b = bank_(); return b.ready ? { type: 'vietqr', ready: true, bank: b.label, acc: b.acc, name: b.name, amount: o.total, content: o.code, qr: qrUrl_(o) } : { type: 'vietqr', ready: false, note: 'KK-MALL sẽ liên hệ gửi thông tin thanh toán' }; }
function publicOrder_(o, pos, invs, rmas) {
  return { code: o.code, created_at: o.created_at, status: o.status, status_text: ST[o.status] || o.status, payment_status: o.payment_status, paid_at: o.paid_at || '', paid_claim_at: o.paid_claim_at || '',
    customer: { name: o.customer.name, phone: maskPhone_(o.customer.phone), address: o.customer.address }, vat: o.vat ? { name: o.vat.name, tax_code: o.vat.tax_code } : null,
    lines: o.lines.map(function (l) { return { sku: l.sku, name: l.name, image: l.image, category_id: l.category_id, warranty_ok: WARRANTY_CATS.indexOf(l.category_id) >= 0, qty: l.qty, unit: l.unit, unit_cost: l.unit_cost, unit_fee: l.unit_fee, line_total: l.line_total, line_cost: l.line_cost, line_fee: l.line_fee }; }),
    goods: o.goods, fee: o.fee, discount: o.discount, vouchers: o.vouchers, fee_net: o.fee_net, fee_pre_tax: o.fee_pre_tax, fee_vat: o.fee_vat, total: o.total, refund_due: o.refund_due || 0, refunded: o.refunded || 0,
    refund_account: o.refund_account ? { bank_label: o.refund_account.bank_label || o.refund_account.bin, acc: '****' + String(o.refund_account.acc).slice(-4), name: o.refund_account.name } : null,
    contract: o.contract ? { version: o.contract.version, label: o.contract.label, hash: o.contract.hash, at: o.contract.at, marketing: !!o.contract.marketing } : null,
    history: o.history, shipments: (pos || []).map(function (p) { var d = parseData_(p); return { sku: p.sku, name: p.name, qty: p.qty, status: p.status, carrier: d.carrier || '', tracking: p.tracking || '', eta: d.eta || '', delivered_at: d.delivered_at || '' }; }),
    invoices: (invs || []).map(function (i) { return { inv_id: i.inv_id, status: i.status, content: i.content, total: i.total }; }),
    rmas: (rmas || []).map(function (r) { var d = parseData_(r); return { rma_id: r.rma_id, sku: r.sku, type: r.type, status: r.status, created_at: r.created_at, return_tracking: d.return_tracking || '', pickup: d.pickup || '' }; }) };
}
function loadOrder_(code) { var r = find_('Orders', 'code', str_(code, 20).toUpperCase()); if (!r) throw err_('Không tìm thấy đơn hàng', 404); var o = parseData_(r); o._row = r._row; return o; }
function saveOrder_(o, extra) {
  var row = o._row; var copy = JSON.parse(JSON.stringify(o)); delete copy._row;
  var upd = { status: o.status, payment_status: o.payment_status, paid_at: o.paid_at || '', fee: o.fee_net, total: o.total, data: JSON.stringify(copy), updated_at: nowIso_() };
  for (var k in (extra || {})) upd[k] = extra[k];
  update_('Orders', row, upd);
}
function setStatus_(o, s, by, note) { var ev = { at: nowIso_(), s: s, by: by || 'system', note: note || '' }; o.status = s; (o.history = o.history || []).push(ev); chain_('status', o.code, { code: o.code, s: s, by: ev.by, at: ev.at }); }
/* Khach bao "Toi da chuyen khoan" (khi chua co SePay/Casso tu doi soat): ghi lich su + email quan tri doi soat ngay */
function paidClaim_(b) {
  var o = ownedOrder_(b, false);
  if (o.payment_status === 'paid') return { ok: true, already: true };
  if (o.status === 'cancelled') throw err_('Đơn đã hủy - vui lòng liên hệ KK-MALL để được hỗ trợ hoàn tiền nếu đã chuyển khoản');
  rate_('claim_' + o.code, 3, 3600);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { o = loadOrder_(o.code); o.paid_claim_at = nowIso_(); (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: 'customer', note: 'Khách báo đã chuyển khoản ' + vnd_(o.total) }); saveOrder_(o); }
  finally { lock.releaseLock(); }
  var bk = bank_();
  adminsMail_('💸 Khách báo ĐÃ CHUYỂN KHOẢN đơn ' + o.code + ' - ' + vnd_(o.total), '<p>Khách <b>' + esc_(o.customer.name) + '</b> báo đã chuyển <b>' + vnd_(o.total) + '</b>, nội dung <b>' + o.code + '</b> vào tài khoản <b>' + esc_(bk.label) + ' ' + esc_(bk.acc) + '</b>.</p><p>1. Kiểm tra giao dịch trong app ngân hàng.<br>2. Vào <a href="' + cfg_('SITE') + '/admin/">Quản trị → Đơn hàng</a> → bấm <b>Xác nhận đã nhận tiền</b> đơn ' + o.code + ' → hệ thống tự lập lệnh mua tại nguồn rẻ nhất.</p><p style="color:#64748B">Đăng ký SePay để bước này tự động hoàn toàn (Webhook URL trong Quản trị → Hệ thống).</p>');
  log_('paid_claim', o.customer.email, o.code);
  return { ok: true };
}
function orderGet_(b) {
  var o = ownedOrder_(b, true);
  var pos = rows_('PO').filter(function (p) { return p.order_code === o.code; });
  var inv = rows_('Invoices').filter(function (i) { return i.order_code === o.code; });
  var rma = rows_('RMA').filter(function (r) { return r.order_code === o.code; });
  return { order: publicOrder_(o, pos, inv, rma), payment: o.payment_status === 'paid' ? null : payInfo_(o) };
}
function ordersMine_(b) {
  var s = session_(b.token);
  return { orders: rows_('Orders').filter(function (r) { var d = parseData_(r); return r.email === s.email || d.member === s.email; })
    .map(function (r) { return { code: r.code, created_at: r.created_at, status: r.status, status_text: ST[r.status] || r.status, payment_status: r.payment_status, total: r.total }; }).reverse() };
}

/* ---------- thanh toán xác nhận (webhook ngân hàng hoặc quản trị) ---------- */
function markPaid_(o, amount, ref, by) {
  amount = Math.round(Number(amount)); ref = str_(ref, 100);
  if (!(amount > 0)) throw err_('Số tiền không hợp lệ');
  o.pay_refs = o.pay_refs || [];
  if (ref && o.pay_refs.indexOf(ref) >= 0) return o; // ngan hang gui lai cung giao dich (webhook retry) -> bo qua
  // tien vao don DA thanh toan hoac DA huy: KHONG kich hoat lai don - ghi nhan phai tra lai khach + bao quan tri
  if (o.payment_status === 'paid' || ['cancelled', 'refunded'].indexOf(o.status) >= 0) {
    o.pay_refs.push(ref); o.extra_payments = (o.extra_payments || []).concat([{ at: nowIso_(), amount: amount, ref: ref, by: by }]);
    o.refund_due = (o.refund_due || 0) + amount; o.paid_total = (o.paid_total || o.paid_amount || 0) + amount;
    ledger_(o.code, ref, '1121', '', amount, 'Tiền vào đơn ' + (o.payment_status === 'paid' ? 'đã thanh toán (chuyển trùng)' : 'đã hủy'));
    ledger_(o.code, ref, '', '3388', amount, 'Phải trả lại khách (tiền chuyển trùng / vào đơn đã hủy)');
    (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: by, note: 'Nhận thêm ' + vnd_(amount) + ' - phải hoàn khách' });
    saveOrder_(o);
    adminsMail_('⚠️ Tiền vào đơn ' + o.code + ' ' + (o.payment_status === 'paid' ? 'ĐÃ thanh toán' : 'ĐÃ HỦY') + ': ' + vnd_(amount), '<p>Đơn <b>' + o.code + '</b> (trạng thái ' + esc_(ST[o.status] || o.status) + ') vừa nhận thêm <b>' + vnd_(amount) + '</b> (mã GD ' + esc_(ref) + '). Hệ thống KHÔNG kích hoạt lại đơn; số tiền đã vào danh sách <b>Cần hoàn tiền</b>.</p>');
    log_('order_extra_payment', by, o.code + ' ' + amount);
    return o;
  }
  if (!(amount >= Number(o.total))) throw err_('Số tiền nhận (' + vnd_(amount) + ') nhỏ hơn tổng đơn (' + vnd_(o.total) + ')');
  o.payment_status = 'paid'; o.paid_at = nowIso_(); o.payment_ref = ref; o.paid_amount = amount; o.paid_total = amount; if (ref) o.pay_refs.push(ref);
  setStatus_(o, 'paid', by, 'Nhận ' + vnd_(amount));
  // SO KE TOAN: thu ho tien hang (3388) + doanh thu phi dich vu (5113) + VAT dau ra (33311); chuyen du -> 3388 phai tra
  ledger_(o.code, o.payment_ref, '1121', '', amount, 'Khách thanh toán đơn (VietQR)');
  ledger_(o.code, o.payment_ref, '', '3388', o.goods, 'Thu hộ tiền hàng cho nhà cung cấp');
  if (o.fee_pre_tax) ledger_(o.code, o.payment_ref, '', '5113', o.fee_pre_tax, 'Doanh thu phí dịch vụ mua hộ & xử lý đơn');
  if (o.fee_vat) ledger_(o.code, o.payment_ref, '', '33311', o.fee_vat, 'Thuế GTGT đầu ra phí dịch vụ ' + o.vat_rate + '%');
  if (amount > o.total) { o.refund_due = (o.refund_due || 0) + amount - o.total; ledger_(o.code, o.payment_ref, '', '3388', amount - o.total, 'Khách chuyển dư - phải trả lại khách'); }
  // LENH MUA (PO) cho tung dong hang -> trang quan tri tu lap ke hoach nguon re nhat
  o.lines.forEach(function (l, i) {
    append_('PO', { po_id: o.code + '-' + (i + 1), order_code: o.code, sku: l.sku, name: l.name, qty: l.qty, status: 'to_order', collected_cost: l.line_cost, actual_source: '', actual_cost: '', supplier_order_id: '', tracking: '',
      data: JSON.stringify({ ship_to: o.customer, vat: o.vat, unit_cost: l.unit_cost, ship_est: l.ship_est || 0, brand: l.brand, category_id: l.category_id }), updated_at: nowIso_() });
  });
  saveOrder_(o);
  mail_(o.customer.email, 'Đã nhận thanh toán đơn ' + o.code, '<p>KK-MALL đã nhận <b>' + vnd_(amount) + '</b> cho đơn <b>' + o.code + '</b>. Hệ thống đang đặt mua tại nhà cung cấp tốt nhất và sẽ gửi mã vận đơn ngay khi có.</p>' + orderTable_(o));
  adminsMail_('💰 Đơn ' + o.code + ' đã thanh toán - có ' + o.lines.length + ' lệnh mua cần đặt', '<p>Vào <a href="' + cfg_('SITE') + '/admin/">Quản trị → Lệnh mua</a> để đặt hàng tại nguồn rẻ nhất (đã lập sẵn).</p>' + orderTable_(o));
  log_('order_paid', by, o.code + ' ' + amount);
  return o;
}
// so du tung tai khoan cua 1 don: net = No - Co
function ledgerBal_(code) { var n = {}; rows_('Ledger').forEach(function (r) { if (r.order_code !== code) return; var a = Number(r.amount) || 0; if (r.debit) n[r.debit] = (n[r.debit] || 0) + a; if (r.credit) n[r.credit] = (n[r.credit] || 0) - a; }); return n; }
// Hoan tien cho khach: tru truoc vao phan TIEN HANG da thu (3388 - ke ca chuyen du/chuyen trung; co the ung truoc khi NCC hoan),
// phan con lai giam tru PHI DICH VU (5213) + VAT (33311). Moi phan co tran rieng -> khong hoan qua so da thu.
function refund_(o, amt, ref, by) {
  amt = Math.round(Number(amt)); var paid = Number(o.paid_total || o.paid_amount || 0), done = Number(o.refunded || 0);
  if (!(paid > 0)) throw err_('Đơn chưa nhận tiền');
  if (!(amt > 0) || amt > paid - done) throw err_('Số tiền hoàn vượt số đã nhận còn lại (' + vnd_(paid - done) + ')');
  var feeNet = o.payment_status === 'paid' ? Number(o.fee_net || 0) : 0, goodsPool = paid - feeNet;
  var a = Math.min(amt, Math.max(0, goodsPool - Number(o.refunded_goods || 0))), rest = amt - a;
  if (rest > feeNet - Number(o.refunded_fee || 0)) throw err_('Số tiền hoàn vượt tiền hàng + phí dịch vụ còn lại của đơn');
  ref = str_(ref, 60) || 'HOAN-' + Date.now();
  if (a) ledger_(o.code, ref, '3388', '', a, 'Hoàn tiền hàng / tiền chuyển dư cho khách');
  if (rest) { var pre = Math.round(rest / (1 + Number(o.vat_rate || 0) / 100)); ledger_(o.code, ref, '5213', '', pre, 'Hoàn phí dịch vụ (giảm trừ doanh thu)'); if (rest - pre) ledger_(o.code, ref, '33311', '', rest - pre, 'Điều chỉnh giảm thuế GTGT phí dịch vụ'); }
  ledger_(o.code, ref, '', '1121', amt, 'Chuyển hoàn tiền cho khách');
  o.refunded = done + amt; o.refunded_goods = Number(o.refunded_goods || 0) + a; o.refunded_fee = Number(o.refunded_fee || 0) + rest;
  o.refund_due = Math.max(0, Number(o.refund_due || 0) - amt);
  (o.refunds = o.refunds || []).push({ at: nowIso_(), amount: amt, ref: ref, by: by });
  if (o.refunded >= paid) setStatus_(o, 'refunded', by, 'Hoàn ' + vnd_(amt) + ' - ' + ref); else (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: by, note: 'Hoàn ' + vnd_(amt) + ' - ' + ref });
  saveOrder_(o);
  mail_(o.customer.email, 'KK-MALL đã hoàn tiền đơn ' + o.code, '<p>KK-MALL đã chuyển hoàn <b>' + vnd_(amt) + '</b> cho đơn <b>' + o.code + '</b>' + (o.refund_account ? ' vào tài khoản <b>' + esc_(o.refund_account.bank_label || o.refund_account.bin) + ' ' + esc_(o.refund_account.acc) + '</b>' : '') + '. Mã giao dịch: ' + esc_(ref) + '.</p>');
  return o;
}
function ledger_(code, ref, debit, credit, amount, note) {
  var row = { at: nowIso_(), order_code: code, ref: ref || '', debit: debit, credit: credit, amount: amount, note: note };
  append_('Ledger', row); chain_('ledger', code, row, ledgerDigest_(row));
}
// Bam 1 dong so cai theo dang CHUAN HOA (Sheets co the doi '1121' thanh so, ISO -> Date) de kiem chung lai duoc tu du lieu doc ve
function ledgerDigest_(r) { var at = r.at && typeof r.at.toISOString === 'function' ? r.at.toISOString() : String(r.at || ''); return sha_([at, r.order_code, r.ref || '', r.debit || '', r.credit || '', Math.round(Number(r.amount) || 0), r.note || ''].map(String).join('|')); }
/* =========================== CHUỖI BĂM (hash-chain) NHẬT KÝ TIỀN & TRẠNG THÁI =========================== */
// Moi su kien tien / trang thai (but toan, doi trang thai don, lenh mua, bot dat hang) duoc noi vao chuoi SHA-256:
//   hash_n = sha256(prev_hash | seq | at | kind | ref | sha256(canon(payload)))
// Dau chuoi (seq, hash) luu o Script Properties CHAIN_HEAD; kiem toan hang ngay tinh lai toan bo chuoi va doi chieu tung dong so cai
// -> sua/xoa/chen 1 dong bat ky trong Ledger hay Chain deu lo. Dau chuoi cong khai qua ?a=chainhead de bo thu thap neo vao so cai gia
// cong khai (meta.json, ledger-roots.json) = bang chung thoi diem khong can tin KK-MALL. Chi ghi hash, khong ghi du lieu ca nhan.
function chainHead_() { try { var h = JSON.parse(P_().getProperty('CHAIN_HEAD') || '{}'); return { seq: Number(h.seq) || 0, hash: String(h.hash || '0'), at: h.at || '' }; } catch (e) { return { seq: 0, hash: '0', at: '' }; } }
function chainHash_(prev, seq, at, kind, ref, digest) { return sha_([prev, seq, at, kind, ref || '', digest].join('|')); }
function chain_(kind, ref, payload, digest) {
  try {
    var lock = LockService.getScriptLock(), mine = !lock.hasLock(); if (mine) lock.waitLock(10000);
    try {
      var h = chainHead_(), seq = h.seq + 1, at = nowIso_(); digest = digest || sha_(canon_(payload || {})); var hash = chainHash_(h.hash, seq, at, kind, ref, digest);
      append_('Chain', { seq: seq, at: at, kind: kind, ref: str_(ref, 60), digest: digest, prev: h.hash, hash: hash });
      P_().setProperty('CHAIN_HEAD', JSON.stringify({ seq: seq, hash: hash, at: at }));
      return hash;
    } finally { if (mine) lock.releaseLock(); }
  } catch (e) { log_('chain_error', 'system', String(e && e.message || e).slice(0, 200)); return ''; }
}
// Kiem chung: (1) tung mat xich khop prev/hash; (2) dau chuoi trong Properties = dong cuoi; (3) moi dong so cai co dung 1 mat xich 'ledger' cung digest.
function chainVerify_() {
  var rows = rows_('Chain'), prev = '0', bad = [], n = 0;
  rows.forEach(function (r, i) {
    var seq = Number(r.seq), exp = chainHash_(prev, seq, r.at, r.kind, r.ref, r.digest);
    if (seq !== i + 1) bad.push('seq ' + seq + ' (mong ' + (i + 1) + ')');
    else if (String(r.prev) !== prev) bad.push('prev lệch tại seq ' + seq);
    else if (String(r.hash) !== exp) bad.push('hash lệch tại seq ' + seq);
    prev = String(r.hash); n++;
  });
  var head = chainHead_();
  if (rows.length && (head.seq !== n || head.hash !== prev)) bad.push('đầu chuỗi (' + head.seq + ') ≠ dòng cuối (' + n + ')');
  var ledger = rows_('Ledger'), links = rows.filter(function (r) { return r.kind === 'ledger'; });
  if (ledger.length !== links.length) bad.push('sổ cái ' + ledger.length + ' dòng ≠ ' + links.length + ' mắt xích');
  else ledger.forEach(function (l, i) { if (ledgerDigest_(l) !== String(links[i].digest)) bad.push('sổ cái dòng ' + (i + 2) + ' (' + l.order_code + ') khác mắt xích ' + links[i].seq); });
  return { ok: !bad.length, links: n, ledger_rows: ledger.length, head: head, problems: bad.slice(0, 20), at: nowIso_() };
}
function adminsMail_(subject, html) { adminEmails_().forEach(function (e) { mail_(e, subject, html); }); }
// Webhook SePay / Casso (cấu hình URL: <web app>?a=webhook&key=WEBHOOK_KEY). Nội dung CK phải chứa mã đơn.
// Apps Script khong doc duoc header HTTP nen khoa trong URL chi la lop 1. Lop 2 (khuyen nghi): dat SEPAY_API_TOKEN (Quan tri -> He thong)
// -> moi giao dich webhook duoc goi lai API SePay de xac minh; API loi/khong khop -> KHONG ghi nhan (fail-closed) + email quan tri.
function whVerify_(t) {
  var tok = P_().getProperty('SEPAY_API_TOKEN'); if (!tok) return { ok: true, mode: 'key-only' };
  var id = String(t.id || '').replace(/\D/g, '').slice(0, 20); if (!id) return { ok: false, why: 'thiếu mã giao dịch (id) để đối chiếu' };
  var r; try { r = UrlFetchApp.fetch('https://my.sepay.vn/userapi/transactions/details/' + id, { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true }); } catch (e) { return { ok: false, why: 'không gọi được API SePay' }; }
  if (r.getResponseCode() !== 200) return { ok: false, why: 'API SePay trả mã ' + r.getResponseCode() };
  var j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { return { ok: false, why: 'API SePay trả dữ liệu không đọc được' }; }
  var tx = j.transaction || (j.data && j.data.transaction) || null; if (!tx) return { ok: false, why: 'SePay không có giao dịch ' + id };
  var got = Math.round(Number(tx.amount_in || 0)), want = Math.round(Number(t.transferAmount || t.amount || 0));
  if (!(got > 0) || got !== want) return { ok: false, why: 'số tiền SePay ' + got + ' ≠ webhook ' + want };
  var norm = function (x) { return String(x || '').toUpperCase().replace(/[\s.\-_]/g, '').slice(0, 60); }, c1 = norm(tx.transaction_content), c0 = norm(t.content || t.description);
  if (c0 && c1 && c1.indexOf(c0.slice(0, 30)) < 0 && c0.indexOf(c1.slice(0, 30)) < 0) return { ok: false, why: 'nội dung SePay khác webhook' };
  return { ok: true, mode: 'sepay-api' };
}
function webhook_(b, key) {
  if (!key || key !== P_().getProperty('WEBHOOK_KEY')) throw err_('Sai khóa webhook', 403);
  var txs = b.data && b.data.length ? b.data : [b];
  var done = [];
  txs.forEach(function (t) {
    var amount = Number(t.transferAmount || t.amount || 0); if (t.transferType && t.transferType !== 'in') return;
    var txt = String(t.content || t.description || '').toUpperCase().replace(/[\s.\-_]/g, ''), ref = str_(t.referenceCode || t.id || t.tid || '', 100);
    var cands = []; txt.replace(CODE_RE, function (x) { cands.push(x); cands.push(x.slice(0, 13)); return x; }); // thu ca ma cu 5 ky tu
    if (!(amount > 0)) return;
    if (!ref) ref = 'NOREF-' + amount + '-' + sha_(txt).slice(0, 10);
    var vf = whVerify_(t); // lop 2 (khi co SEPAY_API_TOKEN): goi lai SePay - giao dich co that, dung so tien, dung noi dung
    if (!vf.ok) { log_('webhook_unverified', '', ref + ' ' + vf.why); if (rate_soft_('wh_vf_' + ref, 1, 21600)) adminsMail_('⚠️ Webhook chưa xác minh được qua SePay: ' + vnd_(amount), '<p>Giao dịch <b>' + esc_(ref) + '</b> (' + vnd_(amount) + ', nội dung "' + esc_(String(t.content || t.description || '').slice(0, 80)) + '") <b>không được ghi nhận</b> vì ' + esc_(vf.why) + '. Kiểm tra trên SePay rồi bấm "Đã nhận tiền" nếu đúng.</p>'); return; } // khong co ma GD: cung noi dung + so tien = cung giao dich (chong ghi trung khi gui lai)
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var o = null; for (var i = 0; i < cands.length && !o; i++) { try { o = loadOrder_(cands[i]); } catch (e) { } }
      if (!o) { if (rate_soft_('wh_un_' + (ref || txt.slice(0, 40)), 1, 21600)) adminsMail_('⚠️ Tiền vào KHÔNG khớp đơn: ' + vnd_(amount), '<p>Giao dịch <b>' + vnd_(amount) + '</b>, nội dung "' + esc_(String(t.content || t.description || '').slice(0, 200)) + '" (mã GD ' + esc_(ref) + ') không chứa mã đơn hợp lệ. Kiểm tra sao kê và đối soát tay.</p>'); log_('webhook_unmatched', '', txt.slice(0, 80) + ' ' + amount); return; }
      markPaid_(o, amount, ref, 'bank-webhook'); done.push(o.code);
    } catch (e) { log_('webhook_unmatched', '', txt.slice(0, 60) + ' ' + e.message); if (rate_soft_('wh_er_' + ref, 1, 21600)) adminsMail_('⚠️ Tiền vào chưa ghi nhận được: ' + vnd_(amount), '<p>Nội dung "' + esc_(String(t.content || t.description || '').slice(0, 200)) + '": ' + esc_(e.message) + '. Đối soát tay trong Quản trị.</p>'); }
    finally { lock.releaseLock(); }
  });
  return { success: true, matched: done };
}


/* =========================== ĐÁNH GIÁ TỪ NGƯỜI MUA THẬT =========================== */
// Chi khach co don DA GIAO moi danh gia duoc (ma don + SDT hoac dang nhap); moi san pham/don 1 danh gia.
// Tu duyet: noi dung co link / SDT / email / tu cam -> cho quan tri duyet; con lai hien ngay. Khong co danh gia -> khong hien sao.
var REVIEW_BAD = /(https?:\/\/|www\.|\.com\b|\.vn\b|zalo|facebook|fb\.com|t\.me|0\d{9}|@[a-z0-9.-]+\.[a-z]{2,}|lừa đảo|đm|vcl|dcm|địt|lồn|cặc)/i;
function reviewName_(n) { var w = String(n || '').trim().split(/\s+/).filter(String); if (!w.length) return 'Khách hàng'; return w.length === 1 ? w[0] : w[w.length - 1] + ' ' + w[0].charAt(0).toUpperCase() + '.'; }
function reviewSubmit_(b) {
  var o = ownedOrder_(b, false), sku = str_(b.sku, 20).toUpperCase(), rating = Math.round(Number(b.rating));
  if (!(rating >= 1 && rating <= 5)) throw err_('Chọn số sao từ 1 đến 5');
  var line = o.lines.filter(function (l) { return l.sku === sku; })[0]; if (!line) throw err_('Sản phẩm không có trong đơn này');
  var po = rows_('PO').filter(function (p) { return p.order_code === o.code && p.sku === sku; })[0];
  // co lenh mua cho dong hang: chi danh gia khi CHINH dong do da giao (dong bi huy/hoan do nguon het hang thi khach chua tung nhan hang)
  if (po ? po.status !== 'delivered' : !(o.status === 'delivered' || o.status === 'completed')) throw err_('Bạn có thể đánh giá sau khi đã nhận hàng');
  rate_('rv_' + o.code, 6, 21600);
  var content = str_(b.content, 600), lk = LockService.getScriptLock(); lk.waitLock(20000);
  try {
    if (rows_('Reviews').some(function (r) { return r.order_code === o.code && r.sku === sku && r.status !== 'removed'; })) throw err_('Bạn đã đánh giá sản phẩm này cho đơn ' + o.code, 409);
    var st = REVIEW_BAD.test(content) ? 'pending' : 'published', id = 'RV' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    append_('Reviews', { id: id, sku: sku, order_code: o.code, rating: rating, content: content, name: reviewName_(o.customer.name), status: st, created_at: nowIso_(), data: JSON.stringify({ product: line.name }) });
  } finally { lk.releaseLock(); }
  CacheService.getScriptCache().removeAll(['rvl_' + sku, 'rvstats']);
  if (st === 'pending') adminsMail_('📝 Đánh giá chờ duyệt ' + id + ' - ' + line.name, '<p>' + rating + '★ - ' + esc_(content) + '</p><p>Vào Quản trị → Đơn hàng → Đánh giá để duyệt.</p>');
  log_('review_submit', o.code, sku + ' ' + rating + ' ' + st);
  return { ok: true, status: st, note: st === 'published' ? 'Cảm ơn bạn! Đánh giá đã hiển thị.' : 'Cảm ơn bạn! Đánh giá sẽ hiển thị sau khi được kiểm duyệt (nội dung có liên kết/số điện thoại).' };
}
function reviewList_(sku) {
  sku = str_(sku, 20).toUpperCase(); if (!/^KK\d{6}$/.test(sku)) throw err_('Mã sản phẩm không hợp lệ');
  var c = CacheService.getScriptCache(), hit = c.get('rvl_' + sku); if (hit) return JSON.parse(hit);
  var rs = rows_('Reviews').filter(function (r) { return r.sku === sku && r.status === 'published'; });
  var n = rs.length, avg = n ? Math.round(rs.reduce(function (a, r) { return a + Number(r.rating); }, 0) / n * 10) / 10 : null;
  var out = { sku: sku, n: n, avg: avg, reviews: rs.reverse().slice(0, 30).map(function (r) { return { rating: Number(r.rating), content: String(r.content || ''), name: r.name, at: r.created_at, verified: true }; }) };
  try { c.put('rvl_' + sku, JSON.stringify(out), 300); } catch (e) { }
  return out;
}
function reviewStats_() { // tong hop cong khai (khong co du lieu ca nhan) cho bo thu thap gan vao trang SP / SEO
  var c = CacheService.getScriptCache(), hit = c.get('rvstats'); if (hit) return JSON.parse(hit);
  var m = {}; rows_('Reviews').forEach(function (r) { if (r.status !== 'published') return; var x = m[r.sku] = m[r.sku] || [0, 0]; x[0]++; x[1] += Number(r.rating); });
  var out = { at: nowIso_(), stats: {} }; Object.keys(m).forEach(function (k) { out.stats[k] = [m[k][0], Math.round(m[k][1] / m[k][0] * 10) / 10]; });
  try { c.put('rvstats', JSON.stringify(out), 600); } catch (e) { }
  return out;
}
function adminReviewUpdate_(b) {
  var s = session_(b.token, true), r = find_('Reviews', 'id', str_(b.id, 20)); if (!r) throw err_('Không tìm thấy đánh giá', 404);
  var st = { publish: 'published', hide: 'hidden', remove: 'removed' }[b.action]; if (!st) throw err_('Thao tác không hợp lệ');
  update_('Reviews', r._row, { status: st }); CacheService.getScriptCache().removeAll(['rvl_' + r.sku, 'rvstats']);
  log_('admin_review_' + b.action, s.email, r.id); return { ok: true };
}

/* =========================== TÀI KHOẢN NHẬN HOÀN TIỀN =========================== */
// Khach (ma don + SDT hoac dang nhap) khai bao tai khoan nhan hoan -> quan tri chuyen bang VietQR dung so tien, dung noi dung
function refundAccount_(b) {
  var o = ownedOrder_(b, false), bin = str_(b.bin, 10).replace(/\D/g, ''), acc = str_(b.acc, 30).replace(/[^\dA-Za-z]/g, ''), name = str_(b.name, 80).toUpperCase();
  if (!(Number(o.refund_due) > 0)) throw err_('Đơn này hiện không có khoản cần hoàn');
  if (!/^\d{6}$/.test(bin)) throw err_('Chọn ngân hàng nhận hoàn tiền');
  if (!/^[\dA-Z]{6,19}$/.test(acc)) throw err_('Số tài khoản không hợp lệ');
  if (name.length < 3) throw err_('Nhập tên chủ tài khoản');
  rate_('rfacc_' + o.code, 5, 3600);
  var lk = LockService.getScriptLock(); lk.waitLock(20000);
  try { o = loadOrder_(o.code); o.refund_account = { bin: bin, bank_label: str_(b.bank_label, 40), acc: acc, name: name, at: nowIso_() }; (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: 'customer', note: 'Khai báo tài khoản nhận hoàn tiền' }); saveOrder_(o); }
  finally { lk.releaseLock(); }
  adminsMail_('💸 Khách đã khai tài khoản nhận hoàn - đơn ' + o.code + ': ' + vnd_(o.refund_due), '<p>Vào Quản trị → Đơn hàng → <b>Cần hoàn tiền</b> để quét VietQR chuyển hoàn đúng số tiền.</p>');
  log_('refund_account', o.code, bin + ' ' + acc.slice(-4));
  return { ok: true };
}
/* =========================== ĐỔI TRẢ / BẢO HÀNH =========================== */
function warrantyFor_(brand, cat) {
  if (cat && WARRANTY_CATS.indexOf(cat) < 0) return null;   // hang tieu dung: khong ap bang bao hanh hang dien tu (tranh trung ten thuong hieu)
  var b = String(brand || '').toLowerCase().trim(), rs = rows_('Warranty');
  for (var i = 0; i < rs.length; i++) { var k = String(rs[i].brand).toLowerCase(); if (k && (b === k || b.indexOf(k) === 0 || k.indexOf(b) === 0)) return { brand: rs[i].brand, hotline: rs[i].hotline, url: rs[i].url, confidence: rs[i].confidence, note: rs[i].note }; }
  return null;
}
function rmaCreate_(b) {
  var o = ownedOrder_(b, false);
  if (o.payment_status !== 'paid') throw err_('Đơn chưa thanh toán');
  var line = o.lines.filter(function (l) { return l.sku === str_(b.sku, 20).toUpperCase(); })[0]; if (!line) throw err_('Sản phẩm không có trong đơn');
  var type = b.type === 'return' ? 'return' : 'warranty';
  rate_('rma_' + o.code, 10, 21600);
  var w = warrantyFor_(line.brand, line.category_id);
  if (type === 'warranty' && line.category_id && WARRANTY_CATS.indexOf(line.category_id) < 0) throw err_('Sản phẩm này không thuộc diện bảo hành kỹ thuật của hãng - nếu hàng lỗi, vui lòng gửi yêu cầu Đổi trả');
  if (type === 'warranty') {
    var id1 = 'BH' + o.code.slice(2) + '-' + (rows_('RMA').filter(function (r) { return r.order_code === o.code; }).length + 1);
    append_('RMA', { rma_id: id1, order_code: o.code, sku: line.sku, type: 'warranty', status: 'info_sent', reason: str_(b.reason, 300), created_at: nowIso_(), data: JSON.stringify({ desc: str_(b.desc, 1000), warranty: w }), updated_at: nowIso_() });
    var invs = rows_('Invoices').filter(function (i) { return i.order_code === o.code; });
    var html = '<p>Yêu cầu bảo hành <b>' + id1 + '</b> cho <b>' + esc_(line.name) + '</b> (đơn ' + o.code + ').</p>'
      + (w ? '<div style="background:#F8FAFC;border-radius:10px;padding:12px 14px"><b>Bảo hành chính hãng ' + esc_(w.brand) + '</b><br>' + (w.hotline ? 'Tổng đài: <b>' + esc_(w.hotline) + '</b><br>' : '') + 'Tra cứu trung tâm bảo hành gần bạn: <a href="' + esc_(w.url) + '">' + esc_(w.url) + '</a>' + (w.confidence !== 'high' ? '<br><i>Vui lòng gọi tổng đài để xác nhận địa chỉ gần nhất.</i>' : '') + '</div>'
        : '<p>KK-MALL sẽ gửi địa chỉ trung tâm bảo hành của hãng trong vòng 1 ngày làm việc.</p>')
      + '<p><b>Mang theo khi bảo hành:</b> sản phẩm, phụ kiện kèm theo, <b>hóa đơn GTGT tiền hàng do nhà cung cấp xuất</b> (đã gửi vào email nhận hóa đơn của bạn) và mã đơn ' + o.code + '.</p>';
    mail_(o.customer.email, 'Hướng dẫn bảo hành ' + id1 + ' - ' + line.name, html);
    adminsMail_('🛠 Yêu cầu bảo hành ' + id1, html + '<p>Lý do: ' + esc_(b.reason) + '</p>');
    return { rma_id: id1, type: 'warranty', warranty: w, html: html };
  }
  // DOI TRA / HOAN TIEN: trong han RETURN_DAYS ke tu khi giao (hoac ke tu khi thanh toan neu chua co ngay giao)
  var pos = rows_('PO').filter(function (p) { return p.order_code === o.code && p.sku === line.sku; });
  var deliveredAt = pos.map(function (p) { return parseData_(p).delivered_at; }).filter(String)[0] || o.paid_at;
  var days = (Date.now() - new Date(deliveredAt).getTime()) / 864e5;
  if (days > Number(cfg_('RETURN_DAYS')) + 3) throw err_('Đã quá thời hạn đổi trả ' + cfg_('RETURN_DAYS') + ' ngày - bạn có thể gửi yêu cầu bảo hành');
  var id2 = 'DT' + o.code.slice(2) + '-' + (rows_('RMA').filter(function (r) { return r.order_code === o.code; }).length + 1);
  var files = [];
  if (b.images && b.images.length) {
    var folder = rmaFolder_(id2);
    b.images.slice(0, 4).forEach(function (im, i) {
      var raw = String(im.b64 || '').replace(/^data:[^,]+,/, ''); if (raw.length > 4.2e6) return;
      var mime = /^image\/(jpeg|png|webp)$|^video\/mp4$/.test(im.type) ? im.type : 'image/jpeg';
      var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(raw), mime, id2 + '-' + (i + 1) + (mime.indexOf('video') >= 0 ? '.mp4' : '.jpg')));
      files.push(f.getUrl());
    });
  }
  var rb = b.refund || {};
  append_('RMA', { rma_id: id2, order_code: o.code, sku: line.sku, type: 'return', status: 'requested', reason: str_(b.reason, 300), created_at: nowIso_(),
    data: JSON.stringify({ desc: str_(b.desc, 1000), files: files, refund_to: { bank: str_(rb.bank, 80), acc: str_(rb.acc, 30), name: str_(rb.name, 100) }, amount: line.line_cost, fee: line.line_fee }), updated_at: nowIso_() });
  mail_(o.customer.email, 'KK-MALL đã nhận yêu cầu đổi trả ' + id2, '<p>KK-MALL đã nhận yêu cầu đổi trả <b>' + id2 + '</b> cho <b>' + esc_(line.name) + '</b>.</p><p>Hệ thống đang gửi yêu cầu trả hàng lên nhà cung cấp. Bạn sẽ nhận <b>mã vận đơn thu hồi và lịch bưu tá đến lấy hàng tận nơi</b> qua email này (miễn phí). Vui lòng giữ nguyên tem, hộp và phụ kiện.</p><p>Tiền hoàn sẽ chuyển về tài khoản bạn cung cấp ngay khi nhà cung cấp hoàn tiền về KK-MALL.</p>');
  adminsMail_('↩️ Yêu cầu đổi trả ' + id2 + ' - đơn ' + o.code, '<p>' + esc_(line.name) + ' × ' + line.qty + '</p><p>Lý do: <b>' + esc_(b.reason) + '</b><br>' + esc_(b.desc) + '</p><p>Ảnh/video: ' + files.map(function (u) { return '<a href="' + u + '">xem</a>'; }).join(' ') + '</p><p>Vào Quản trị → Đổi trả để tạo yêu cầu trả hàng tại nguồn.</p>');
  log_('rma_create', o.customer.email, id2);
  return { rma_id: id2, type: 'return', status: 'requested' };
}
function rmaFolder_(id) {
  var root = DriveApp.getFolderById(P_().getProperty('RMA_FOLDER_ID'));
  return root.createFolder(id);
}

/* =========================== QUẢN TRỊ =========================== */
function adminOrders_(b) {
  session_(b.token, true);
  var pos = rows_('PO'), inv = rows_('Invoices'), rma = rows_('RMA');
  var list = rows_('Orders').map(function (r) { var o = parseData_(r); o._row = r._row; return o; })
    .filter(function (o) { return !b.status || o.status === b.status; }).reverse().slice(0, Math.min(500, b.limit || 300));
  return { orders: list.map(function (o) { var x = JSON.parse(JSON.stringify(o)); delete x._row; x.status_text = ST[x.status] || x.status;
    x.po = pos.filter(function (p) { return p.order_code === o.code; }).map(poOut_); x.invoices = inv.filter(function (i) { return i.order_code === o.code; }).map(invOut_); x.rmas = rma.filter(function (r) { return r.order_code === o.code; }).map(rmaOut_); return x; }), fee_table: feeTable_(), tolerance: Number(cfg_('TOLERANCE')), vat_sources: VAT_SOURCES };
}
function poOut_(p) { var d = parseData_(p); return { po_id: p.po_id, order_code: p.order_code, sku: p.sku, name: p.name, qty: p.qty, status: p.status, collected_cost: p.collected_cost, actual_source: p.actual_source, actual_cost: p.actual_cost, supplier_order_id: p.supplier_order_id, tracking: p.tracking, data: d, updated_at: p.updated_at }; }
function invOut_(i) { return { inv_id: i.inv_id, order_code: i.order_code, created_at: i.created_at, status: i.status, buyer: i.buyer, tax_code: i.tax_code, content: i.content, pre_tax: i.pre_tax, vat_rate: i.vat_rate, vat: i.vat, total: i.total }; }
function rmaOut_(r) { return { rma_id: r.rma_id, order_code: r.order_code, sku: r.sku, type: r.type, status: r.status, reason: r.reason, created_at: r.created_at, data: parseData_(r), updated_at: r.updated_at }; }
function adminOrderUpdate_(b) {
  var s = session_(b.token, true), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var o = loadOrder_(b.code);
    if (b.action === 'mark_paid') markPaid_(o, Number(b.amount || o.total), b.ref || 'ADMIN-' + Date.now(), s.email);
    else if (b.action === 'cancel') {
      if (o.payment_status === 'paid') throw err_('Đơn đã thanh toán - dùng "Hoàn tiền"');
      setStatus_(o, 'cancelled', s.email, str_(b.note, 200)); saveOrder_(o);
      mail_(o.customer.email, 'Đơn ' + o.code + ' đã hủy', '<p>Đơn <b>' + o.code + '</b> đã được hủy. ' + esc_(b.note || '') + '</p>');
    } else if (b.action === 'refund') {
      refund_(o, b.amount || o.refund_due || 0, b.ref, s.email);
    } else if (b.action === 'note') { (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: s.email, note: str_(b.note, 300) }); saveOrder_(o); }
    else throw err_('Thao tác không hợp lệ');
    log_('admin_order_' + b.action, s.email, b.code);
    return { ok: true, order: publicOrder_(loadOrder_(b.code)) };
  } finally { lock.releaseLock(); }
}
function adminPoUpdate_(b) {
  var s = session_(b.token, true), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return poUpdate_(b, s.email); } finally { lock.releaseLock(); }
}
// Chuyen trang thai lenh mua (dung chung cho quan tri bam tay va bo dong bo email nguon) - goi khi DA giu khoa
function poUpdate_(b, by) {
  {
    var p = find_('PO', 'po_id', b.po_id); if (!p) throw err_('Không tìm thấy lệnh mua', 404);
    var d = parseData_(p), o = loadOrder_(p.order_code), st = b.status;
    var NEXT = { to_order: ['ordered', 'cancelled'], ordered: ['shipped', 'delivered'], shipped: ['delivered'], delivered: [], cancelled: [] };
    if ((NEXT[p.status] || []).indexOf(st) < 0) throw err_('Lệnh mua đang "' + p.status + '" - không chuyển sang "' + st + '" được' + (p.status === 'ordered' && st === 'cancelled' ? ' (đã đặt tại nguồn: xử lý qua Đổi trả / hoàn tiền)' : ''), 409);
    var upd = { status: st, updated_at: nowIso_() };
    if (st === 'ordered') {
      var cost = Number(b.actual_cost); if (!(cost > 0)) throw err_('Nhập số tiền thực trả nhà cung cấp');
      upd.actual_source = str_(b.actual_source, 40); upd.actual_cost = cost; upd.supplier_order_id = str_(b.supplier_order_id, 60);
      if (b.ship_paid !== undefined && b.ship_paid !== '') d.ship_paid = Math.max(0, Math.round(Number(b.ship_paid) || 0)); // phi ship/phu phi thuc tra tai nguon (da nam trong actual_cost)
      var lineFee = (o.lines.filter(function (l) { return l.sku === p.sku; })[0] || {}).line_fee || 0;
      if (cost - Number(p.collected_cost) > lineFee) adminsMail_('⚠️ Lệnh mua ' + p.po_id + ' LỖ: thực trả vượt phí dịch vụ', '<p>Thực trả nhà cung cấp <b>' + vnd_(cost) + '</b> cao hơn tiền hàng đã thu <b>' + vnd_(p.collected_cost) + '</b> quá phí dịch vụ của dòng này (' + vnd_(lineFee) + '). Kiểm tra lại dự phòng ship của nguồn <b>' + esc_(upd.actual_source) + '</b>.</p>');
      d.source_url = str_(b.source_url, 500); d.ordered_at = nowIso_(); d.vat_requested = !!b.vat_requested; if (b.auto) d.auto = str_(b.auto, 40);
      ledger_(o.code, upd.supplier_order_id, '3388', '', Math.min(cost, Number(p.collected_cost)), 'Chi hộ tiền hàng cho nhà cung cấp (' + upd.actual_source + ')');
      if (cost > Number(p.collected_cost)) ledger_(o.code, upd.supplier_order_id, '632', '', cost - Number(p.collected_cost), 'KK-MALL bù trượt giá trong biên dung sai');
      ledger_(o.code, upd.supplier_order_id, '', '1121', cost, 'Thanh toán nhà cung cấp');
      if (cost < Number(p.collected_cost)) { o.refund_due = (o.refund_due || 0) + Number(p.collected_cost) - cost; d.refund_due = Number(p.collected_cost) - cost; }
    } else if (st === 'shipped') { upd.tracking = str_(b.tracking, 60); d.carrier = str_(b.carrier, 40); d.shipped_at = nowIso_(); if (b.eta) d.eta = str_(b.eta, 60); }
    else if (st === 'delivered') { d.delivered_at = nowIso_(); }
    else if (st === 'cancelled') {
      d.cancel_reason = str_(b.note, 200);
      // khong dat duoc (het hang / vuot bien dung sai): hoan 100% dong hang = tien hang + phi dich vu cua dong (sau giam gia)
      var ln = o.lines.filter(function (l) { return l.sku === p.sku; })[0] || {}, feeNet = Math.max(0, Number(ln.line_fee || 0) - (o.fee ? Math.round(Number(o.discount || 0) * Number(ln.line_fee || 0) / Number(o.fee)) : 0));
      d.refund_due = Number(p.collected_cost) + feeNet; o.refund_due = (o.refund_due || 0) + d.refund_due;
      mail_(o.customer.email, 'Đơn ' + o.code + ': ' + p.name + ' không đặt được - hoàn ' + vnd_(d.refund_due), '<p>Rất tiếc, <b>' + esc_(p.name) + '</b> hiện không đặt được tại nhà cung cấp' + (d.cancel_reason ? ' (' + esc_(d.cancel_reason) + ')' : '') + '. KK-MALL hoàn <b>100%</b> giá trị dòng hàng: <b>' + vnd_(d.refund_due) + '</b>.</p><p>Vui lòng nhập tài khoản nhận hoàn tiền tại <a href="' + cfg_('SITE') + '/?order=' + o.code + '&phone=' + o.customer.phone + '">trang theo dõi đơn</a>.</p>');
    }
    else throw err_('Trạng thái không hợp lệ');
    upd.data = JSON.stringify(d); update_('PO', p._row, upd); chain_('po', p.po_id, { po: p.po_id, status: st, by: by, at: upd.updated_at, cost: upd.actual_cost || '', src: upd.actual_source || '' });
    // dong bo trang thai don theo cac lenh mua
    var all = rows_('PO').filter(function (x) { return x.order_code === o.code; }), live = all.filter(function (x) { return x.status !== 'cancelled'; });
    var every = function (s2) { return live.length && live.every(function (x) { return x.status === s2 || (s2 === 'ordered' && (x.status === 'shipped' || x.status === 'delivered')) || (s2 === 'shipped' && x.status === 'delivered'); }); };
    var prev = o.status;
    var to = every('delivered') ? 'delivered' : every('shipped') ? 'shipping' : every('ordered') ? 'ordered' : '';
    if (to && to !== o.status) setStatus_(o, to, by);
    saveOrder_(o);
    if (st === 'shipped') mail_(o.customer.email, 'Đơn ' + o.code + ' đang giao: ' + p.name, '<p><b>' + esc_(p.name) + '</b> đã được nhà cung cấp bàn giao vận chuyển.</p><p>Đơn vị vận chuyển: <b>' + esc_(d.carrier || '') + '</b><br>Mã vận đơn: <b>' + esc_(upd.tracking) + '</b>' + (d.eta ? '<br>Dự kiến giao: <b>' + esc_(d.eta) + '</b>' : '') + '</p><p><a href="' + cfg_('SITE') + '/?order=' + o.code + '&phone=' + o.customer.phone + '">Theo dõi đơn →</a></p>');
    if (st === 'ordered' && o.status === 'ordered' && prev !== 'ordered') mail_(o.customer.email, 'Đơn ' + o.code + ' đã được đặt tại nhà cung cấp', '<p>Toàn bộ sản phẩm trong đơn <b>' + o.code + '</b> đã được đặt tại nhà cung cấp và giao thẳng đến bạn.' + (o.vat ? ' Hóa đơn GTGT tiền hàng mang tên <b>' + esc_(o.vat.name) + '</b> do nhà cung cấp xuất trực tiếp.' : '') + '</p>');
    if (o.status === 'delivered' && prev !== 'delivered') { feeInvoice_(o); mail_(o.customer.email, 'Đơn ' + o.code + ' đã giao thành công', '<p>Cảm ơn bạn đã mua sắm tại KK-MALL. Nếu sản phẩm có lỗi, bạn có thể yêu cầu <b>đổi trả trong ' + cfg_('RETURN_DAYS') + ' ngày</b> hoặc <b>bảo hành</b> ngay trên trang theo dõi đơn hàng.</p>'); }
    log_('admin_po_' + st, by, b.po_id);
    return { ok: true, po: poOut_(find_('PO', 'po_id', b.po_id)), order_status: o.status };
  }
}
/* =========================== TỰ ĐỒNG BỘ LỆNH MUA TỪ EMAIL NGUỒN ===========================
 * Doc email giao dich nguon gui ve hop thu chu so huu - quyen CHI DOC (gmail.readonly, dich vu Gmail API nang cao), 15 phut/lan:
 *  - "Xac nhan don hang #ID": tu gan ma don nguon vao lenh mua "Can dat" (bat buoc khop SDT nguoi nhan voi khach KK-MALL + ten SP),
 *    ghi thuc tra = tong gia tri don nguon (phan bo theo dong neu nhieu SP), ship thuc tra = phi van chuyen - giam gia van chuyen
 *  - "Dang van chuyen" / "Giao thanh cong": tu chuyen trang thai lenh mua + don, email khach (don vi van chuyen, du kien giao)
 *  - Canh bao quan tri: don nguon dat COD cho khach KK-MALL (khach se bi thu tien lan 2), nguon huy don, cho thanh toan, khong khop lenh mua
 * Don ca nhan cua chu so huu (SDT khong thuoc khach KK-MALL dang cho dat) bi bo qua.
 */
var MAIL_SOURCES = { tiki: { name: 'Tiki', q: 'from:noreply@tiki.vn' } };
function nd_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
function phone_(s) { var d = String(s || '').replace(/\D/g, ''); if (d.indexOf('84') === 0 && d.length === 11) d = '0' + d.slice(2); return d; }
function money_(s) { return Math.round(Number(String(s || '').replace(/[^\d]/g, '')) || 0); }
function htmlText_(h) {
  return String(h || '').replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(td|th)>/gi, ' | ').replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li|\/table)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/[ \t ]+/g, ' ').replace(/ *\n[ |\n]*/g, '\n');
}
/* Phan tich 1 email Tiki -> { src, id, type, phone, total, sub, ship, shipDisc, cod, lines[], carrier, eta } | null */
function parseTikiMail_(subject, text) {
  var s = nd_(subject), t = String(text || ''), tn = nd_(t);
  var m = s.match(/(?:#|don hang)\s*#?\s*(\d{8,12})/) || tn.match(/don hang\s*#?\s*(\d{8,12})/);
  if (!m) return null;
  var r = { src: 'tiki', id: m[1], type: '' };
  if (/xac nhan don hang/.test(s)) r.type = 'confirm';
  else if (/giao thanh cong/.test(s)) r.type = 'delivered';
  else if (/dang van chuyen/.test(s)) r.type = 'shipped';
  else if (/doi thanh toan/.test(s)) r.type = 'unpaid';
  else if (/hoa don dien tu/.test(s)) r.type = 'invoice';
  else if (/thong bao don hang/.test(s)) r.type = /huy don hang|da bi huy|da huy don/.test(tn) ? 'cancelled' : 'notice';
  else return null;
  var ph = tn.match(/(?:sdt|so dien thoai|dien thoai)\s*:?\s*((?:\+?84|0)[\d .]{8,13})/); r.phone = ph ? phone_(ph[1]) : '';
  var g = function (re) { var x = tn.match(re); return x ? money_(x[1]) : 0; };
  r.total = g(/tong (?:gia tri don hang|cong|thanh toan)[^\d\n]{0,12}([\d.,]{4,})\s*d/);
  r.sub = g(/tam tinh[^\d\n]{0,12}([\d.,]{4,})\s*d/);
  r.ship = g(/phi van chuyen[^\d\n]{0,12}([\d.,]{3,})\s*d/);
  r.shipDisc = g(/giam gia van chuyen[^\d\n]{0,12}([\d.,]{3,})\s*d/);
  r.cod = /thanh toan (?:bang )?tien mat khi nhan hang/.test(tn);
  r.lines = [];
  t.split('\n').forEach(function (ln) {
    var c = ln.split('|').map(function (x) { return x.trim(); }).filter(String); if (c.length < 3) return;
    var price = c[c.length - 1], qty = c[c.length - 2], name = c[c.length - 3];
    if (/^[\d.,]+\s*(đ|₫|d)$/i.test(price) && /^\d{1,3}$/.test(qty) && name.length >= 3 && !/^(sản phẩm|tạm tính)/i.test(name)) r.lines.push({ name: name.slice(0, 200), qty: Number(qty), price: money_(price) });
  });
  var cr = t.match(/đối tác vận chuyển\s+([^.\n|,]{2,30})/i); if (cr) r.carrier = cr[1].trim();
  var eta = t.match(/giao trước\s+([^.\n|]{3,40})/i); if (eta) r.eta = eta[1].trim();
  return r;
}
/* Muc do phu ten SP lenh mua trong 1 chuoi (0..1) - bo tu qua ngan, dem token co mat */
function nameCover_(poName, hay) {
  var tk = nd_(poName).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 2 && ['hang', 'chinh', 'hang', 'cho', 'va', 'the', 'new'].indexOf(w) < 0; });
  if (!tk.length) return 0; var h = ' ' + nd_(hay).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  return tk.filter(function (w) { return h.indexOf(' ' + w + ' ') >= 0; }).length / tk.length;
}
/* Gan don nguon (email xac nhan) vao cac lenh mua dang cho dat - tra ve [{ po, cost, ship, qty_ok }] */
function matchConfirm_(r, pos, orderOf) {
  if (!r.phone) return [];
  var cand = pos.filter(function (p) { var o = orderOf(p.order_code); return p.status === 'to_order' && o && o.payment_status === 'paid' && ['cancelled', 'refunded', 'refunding'].indexOf(o.status) < 0 && phone_(o.customer.phone) === r.phone; });
  if (!cand.length) return [];
  var shipNet = Math.max(0, r.ship - r.shipDisc), out = [];
  if (!r.lines.length) { // khong doc duoc bang SP: chi gan khi DUY NHAT 1 lenh mua khop ten
    var one = cand.filter(function (p) { return nameCover_(p.name, r.text || '') >= 0.8; });
    return one.length === 1 && r.total ? [{ po: one[0], cost: r.total, ship: shipNet, qty_ok: true }] : (one.length > 1 ? [{ ambiguous: true }] : []);
  }
  var pairs = [], left = r.lines.map(function (l) { return l.qty; }), used = {};
  cand.forEach(function (p) { r.lines.forEach(function (l, i) { var sc = nameCover_(p.name, l.name); if (sc >= 0.6) pairs.push({ p: p, i: i, sc: sc }); }); });
  pairs.sort(function (a, b) { return b.sc - a.sc; });
  pairs.forEach(function (x) { // tham lam: moi lenh mua 1 dong, dong email bi tru dan so luong
    if (used[x.p.po_id] || left[x.i] < Number(x.p.qty)) return;
    used[x.p.po_id] = 1; left[x.i] -= Number(x.p.qty); out.push({ po: x.p, line: r.lines[x.i] });
  });
  if (!out.length) return [];
  var codes = {}; out.forEach(function (x) { codes[x.po.order_code] = 1; });
  if (Object.keys(codes).length > 1) return [{ ambiguous: true }]; // 1 don nguon khop nhieu don KK-MALL -> gan tay
  var sub = r.sub || r.lines.reduce(function (a, l) { return a + l.price * l.qty; }, 0);
  return out.map(function (x) {
    var unit = x.line.price, amt = unit * Number(x.po.qty), w = sub ? amt / sub : 1;
    var cost = r.total && sub ? amt + Math.round((r.total - sub) * w) : amt + Math.round(shipNet * w);
    return { po: x.po, cost: Math.max(0, cost), ship: Math.round(shipNet * w), qty_ok: true };
  });
}
function b64Text_(d) {
  try {
    if (typeof d !== 'string') return Utilities.newBlob(d).getDataAsString('UTF-8');
    while (d.length % 4) d += '=';
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(d)).getDataAsString('UTF-8');
  } catch (e) { return ''; }
}
function gmailFetch_(q, max, seen) {
  if (typeof Gmail === 'undefined') throw err_('Chưa bật dịch vụ Gmail API (Services → Gmail API) cho dự án Apps Script');
  var res = Gmail.Users.Messages.list('me', { q: q, maxResults: max || 40 }), out = [];
  ((res && res.messages) || []).forEach(function (x) {
    if (seen[x.id]) return;
    var m = Gmail.Users.Messages.get('me', x.id, { format: 'full' }), hs = {}, html = '', plain = '';
    ((m.payload && m.payload.headers) || []).forEach(function (h) { hs[String(h.name).toLowerCase()] = h.value; });
    (function walk(pt) { if (!pt) return; var mt = String(pt.mimeType || ''); if (pt.body && pt.body.data) { if (mt === 'text/html' && !html) html = b64Text_(pt.body.data); else if (mt === 'text/plain' && !plain) plain = b64Text_(pt.body.data); } (pt.parts || []).forEach(walk); })(m.payload);
    var ar = String(hs['authentication-results'] || ''), dom = (q.match(/from:\S*@([\w.-]+)/) || [])[1] || '';
    var auth = new RegExp('(dkim=pass[^;]*header\\.(i|d)=@?([\\w-]+\\.)*' + dom.split('.').slice(-2).join('\\.') + '|dmarc=pass[^;]*header\\.from=([\\w-]+\\.)*' + dom.split('.').slice(-2).join('\\.') + ')', 'i').test(ar);
    out.push({ id: x.id, at: Number(m.internalDate) || 0, subject: hs.subject || '', text: html ? htmlText_(html) : plain, auth: auth });
  });
  return out.sort(function (a, b) { return a.at - b.at; });
}
/* Chay dong bo: msgs (tuy chon, de kiem thu) = [{ id, at, subject, text, src }] */
function mailSync_(opt) {
  opt = opt || {};
  var P = P_(), seenArr = []; try { seenArr = JSON.parse(P.getProperty('MAILSYNC_SEEN') || '[]'); } catch (e) { seenArr = []; }
  var seen = {}; seenArr.forEach(function (k) { seen[k] = 1; });
  var msgs = opt.msgs || [];
  if (!opt.msgs) Object.keys(MAIL_SOURCES).forEach(function (src) { gmailFetch_(MAIL_SOURCES[src].q + ' newer_than:' + (opt.days || 10) + 'd', 40, seen).forEach(function (m) { m.src = src; msgs.push(m); }); });
  var ev = [], orders = {}, orderOf = function (c) { if (!(c in orders)) { try { orders[c] = loadOrder_(c); } catch (e) { orders[c] = null; } } return orders[c]; };
  var note = function (e) { e.at = nowIso_(); ev.push(e); };
  msgs.forEach(function (m) {
    if (seen[m.id]) return; seen[m.id] = 1; seenArr.push(m.id);
    if (m.auth === false) { note({ src: m.src, id: '', type: 'spoof', note: 'bỏ qua email không qua DKIM/DMARC: ' + str_(m.subject, 60) }); return; } // email gia mao nguon
    var r = m.src === 'tiki' || !m.src ? parseTikiMail_(m.subject, m.text) : null; if (!r) return;
    r.text = m.text; var srcName = (MAIL_SOURCES[r.src] || {}).name || r.src;
    var pos = rows_('PO'), linked = pos.filter(function (p) { return String(p.supplier_order_id) === r.id && p.status !== 'cancelled'; });
    try {
      if (r.type === 'confirm') {
        if (linked.length) return note({ src: r.src, id: r.id, type: r.type, po: linked.map(function (p) { return p.po_id; }).join(','), note: 'đã gắn từ trước' });
        var mt = matchConfirm_(r, pos, orderOf);
        if (mt.length && mt[0].ambiguous) { adminsMail_('⚠️ Đơn ' + srcName + ' #' + r.id + ' khớp NHIỀU lệnh mua - cần gắn tay', '<p>Email xác nhận đơn ' + srcName + ' <b>#' + esc_(r.id) + '</b> khớp sản phẩm của nhiều đơn KK-MALL cùng SĐT người nhận. Hệ thống không tự gắn để tránh ghi nhận sai - vào Quản trị → Lệnh mua để gắn tay.</p>'); return note({ src: r.src, id: r.id, type: r.type, note: 'khớp nhiều đơn - đã báo quản trị gắn tay' }); }
        if (!mt.length) {
          var kkPhone = r.phone && pos.some(function (p) { var o = orderOf(p.order_code); return p.status === 'to_order' && o && phone_(o.customer.phone) === r.phone; });
          if (kkPhone) { adminsMail_('⚠️ Đơn ' + srcName + ' #' + r.id + ' giao tới khách KK-MALL nhưng CHƯA khớp lệnh mua', '<p>Email xác nhận đơn ' + srcName + ' <b>#' + esc_(r.id) + '</b> có SĐT người nhận trùng khách đang chờ đặt, nhưng tên sản phẩm không khớp lệnh mua nào. Vào Quản trị → Lệnh mua để gắn tay mã đơn nguồn.</p>'); note({ src: r.src, id: r.id, type: r.type, note: 'SĐT khớp khách nhưng không khớp sản phẩm - đã báo quản trị' }); }
          return;
        }
        mt.forEach(function (x) {
          poUpdate_({ po_id: x.po.po_id, status: 'ordered', actual_source: r.src, actual_cost: x.cost, supplier_order_id: r.id, ship_paid: x.ship, vat_requested: false, auto: 'email-' + r.src }, 'tu-dong:email-' + r.src);
          note({ src: r.src, id: r.id, type: r.type, po: x.po.po_id, note: 'đã gắn mã đơn, thực trả ' + vnd_(x.cost) + (x.qty_ok ? '' : ' - SỐ LƯỢNG THIẾU') });
          if (!x.qty_ok) adminsMail_('⚠️ Đơn ' + srcName + ' #' + r.id + ' đặt THIẾU số lượng cho ' + x.po.po_id, '<p>Lệnh mua cần ' + x.po.qty + ' sản phẩm, đơn nguồn ít hơn. Kiểm tra và đặt bổ sung.</p>');
        });
        if (r.cod) adminsMail_('🚨 Đơn ' + srcName + ' #' + r.id + ' đang để THANH TOÁN KHI NHẬN HÀNG', '<p>Đơn nguồn giao thẳng cho khách KK-MALL nhưng phương thức là <b>tiền mặt khi nhận hàng</b> - khách sẽ bị thu tiền lần 2. Đổi sang thanh toán trước hoặc hủy và đặt lại ngay.</p>');
      } else if (r.type === 'shipped' || r.type === 'delivered') {
        linked.forEach(function (p) {
          if (r.type === 'shipped' && p.status === 'ordered') { poUpdate_({ po_id: p.po_id, status: 'shipped', carrier: srcName + (r.carrier ? ' - ' + r.carrier : ''), tracking: r.id, eta: r.eta || '' }, 'tu-dong:email-' + r.src); note({ src: r.src, id: r.id, type: r.type, po: p.po_id, note: 'đang giao' + (r.eta ? ', dự kiến ' + r.eta : '') }); }
          if (r.type === 'delivered' && (p.status === 'ordered' || p.status === 'shipped')) { poUpdate_({ po_id: p.po_id, status: 'delivered' }, 'tu-dong:email-' + r.src); note({ src: r.src, id: r.id, type: r.type, po: p.po_id, note: 'đã giao' }); }
        });
      } else if (r.type === 'cancelled' && linked.length) {
        adminsMail_('🚨 ' + srcName + ' HỦY đơn #' + r.id + ' (' + linked.map(function (p) { return p.po_id; }).join(', ') + ')', '<p>Nguồn thông báo hủy đơn đã đặt cho khách KK-MALL. Đặt lại tại nguồn khác hoặc hoàn tiền cho khách trong Quản trị → Lệnh mua.</p>');
        note({ src: r.src, id: r.id, type: r.type, po: linked.map(function (p) { return p.po_id; }).join(','), note: 'nguồn hủy đơn - đã báo quản trị' });
      } else if (r.type === 'unpaid' && (linked.length || (r.phone && pos.some(function (p) { var o = orderOf(p.order_code); return p.status === 'to_order' && o && phone_(o.customer.phone) === r.phone; })))) {
        adminsMail_('⚠️ Đơn ' + srcName + ' #' + r.id + ' CHƯA thanh toán thành công', '<p>Thanh toán tại nguồn chưa thành công. Vào ứng dụng ' + srcName + ' thanh toán lại để đơn của khách không bị hủy.</p>');
        note({ src: r.src, id: r.id, type: r.type, note: 'chưa thanh toán tại nguồn - đã báo quản trị' });
      } else if ((r.type === 'notice' || r.type === 'invoice') && linked.length) {
        linked.forEach(function (p) { var d = parseData_(p); (d.src_notes = d.src_notes || []).push({ at: nowIso_(), type: r.type, text: str_(m.subject, 120) }); d.src_notes = d.src_notes.slice(-5); if (r.type === 'invoice') d.supplier_invoice = true; update_('PO', p._row, { data: JSON.stringify(d), updated_at: nowIso_() }); });
        note({ src: r.src, id: r.id, type: r.type, po: linked.map(function (p) { return p.po_id; }).join(','), note: str_(m.subject, 80) });
      }
    } catch (x) { note({ src: r.src, id: r.id, type: r.type, note: 'LỖI: ' + str_(x && x.message, 120) }); log_('mailsync_error', r.id, String(x && x.stack || x).slice(0, 800)); }
  });
  P.setProperty('MAILSYNC_SEEN', JSON.stringify(seenArr.slice(-400)));
  var logArr = []; try { logArr = JSON.parse(P.getProperty('MAILSYNC_LOG') || '[]'); } catch (e) { logArr = []; }
  P.setProperty('MAILSYNC_LOG', JSON.stringify(logArr.concat(ev).slice(-30))); P.setProperty('MAILSYNC_AT', nowIso_());
  if (ev.length) log_('mailsync', opt.by || 'tu-dong', ev.length + ' su kien');
  return { at: P.getProperty('MAILSYNC_AT'), scanned: msgs.length, events: ev };
}
function mailSyncInfo_() {
  var log = []; try { log = JSON.parse(P_().getProperty('MAILSYNC_LOG') || '[]'); } catch (e) { }
  var on = false; try { on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'mailSync'; }); } catch (e) { }
  return { on: on, at: P_().getProperty('MAILSYNC_AT') || '', sources: Object.keys(MAIL_SOURCES).map(function (k) { return MAIL_SOURCES[k].name; }), log: log.slice(-15).reverse() };
}
// Trigger 15 phut/lan (chay duoi quyen chu so huu)
function mailSync() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try { mailSync_({}); } catch (e) { log_('mailsync_error', 'trigger', String(e && e.stack || e).slice(0, 800)); } finally { lock.releaseLock(); }
}
// Chay 1 lan trong trinh soan thao de cap quyen Gmail (chi doc) + cai lich 15 phut
function installMailSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mailSync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mailSync').timeBased().everyMinutes(15).create();
  var r = mailSync_({ days: 3, by: 'cai-dat' });
  Logger.log('MAILSYNC ' + JSON.stringify({ scanned: r.scanned, events: r.events.length, info: mailSyncInfo_() }));
  return r;
}
/* =========================== BOT ĐẶT HÀNG TỰ ĐỘNG (tiện ích Chrome "KK-MALL Auto Order") ===========================
 * Tien ich chay tren Chrome cua chu so huu (da dang nhap tai nguon): lay lenh mua "Can dat" -> dat tai nguon voi thong tin khach
 * -> chon the/vi DA LUU (khong bao gio COD) -> bam Dat hang -> chu so huu chi nhap OTP -> bao ma don nguon ve may chu.
 * Xac thuc bang KHOA BOT rieng (chi luu ban bam), chi doc lenh mua dang cho dat + ghi ket qua; xoay khoa trong trang quan tri.
 * Chong dat trung: moi lenh mua co trang thai bot (working -> paying -> done); da qua "paying" (da bam Dat hang) thi KHONG BAO GIO
 * tu thu lai - chi quan tri moi dat lai duoc sau khi kiem tra tai nguon.
 */
var BOT_SOURCES = ['tiki'];
/* =========================== CHÍNH SÁCH TỰ ĐỘNG (POLICY) & KÝ THÔNG ĐIỆP BOT =========================== */
// Moi "yeu cau hoach dinh san" nam trong POLICY_JSON (Script Properties, sua o Quan tri -> He thong). May chu la noi quyet dinh cuoi:
// bot chi duoc claim/paying khi policyEval_ tra 'auto' hoac 'otp'; moi quyet dinh ghi kem policy.version.
var POLICY_DEFAULT = {
  version: 'default',
  autonomy: { enabled: true, auto_max_vnd: 5000000, otp_max_vnd: 20000000, daily_cap_vnd: 30000000, max_per_hour: 10, hours: { from: '07:00', to: '22:00', tz: 'Asia/Ho_Chi_Minh' } },
  price: { tolerance_vnd: 5000, max_loss_per_line: 'line_fee', quote_max_age_hours: 6, live_check_required: true },
  sources: { allow: ['tiki'], tier: { tiki: 'C' }, max_eta_days: 5, vat_sources: [] },   // vat_sources: nguon bot duoc phep dat cho don can hoa don GTGT (mac dinh: khong - dat tay)
  fallback: { max_replans: 2, allow_split: false },
  customer: { address_levels: 3, first_order_hold_over_vnd: 10000000 },
  holds: { remind_hours: 4, escalate_hours: 8, cancel_refund_hours: 24, auto_cancel: false },   // auto_cancel: true -> qua cancel_refund_hours tu huy lenh hold + ghi hoan khach
  instrument: { per_txn_cap_vnd: 5000000 }
};
function policy_() {
  var p = JSON.parse(JSON.stringify(POLICY_DEFAULT)), raw = cfg_('POLICY_JSON'), custom = {};
  if (raw) { try { custom = JSON.parse(raw) || {}; } catch (e) { custom = {}; log_('policy_invalid', 'system', String(e.message).slice(0, 200)); } }
  Object.keys(custom).forEach(function (k) {
    var v = custom[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) Object.keys(v).forEach(function (j) { p[k][j] = v[j]; });
    else p[k] = v;
  });
  if (!custom.price || custom.price.tolerance_vnd === undefined) p.price.tolerance_vnd = Number(cfg_('TOLERANCE')) || 5000; // tuong thich cau hinh cu
  p.autonomy.enabled = cfg_('AUTONOMY_ENABLED') !== '0' && p.autonomy.enabled !== false;
  p.version = String(custom.version || 'default');
  return p;
}
function policySecret_() { var k = P_().getProperty('POLICY_SECRET'); if (!k) { k = rnd_(); P_().setProperty('POLICY_SECRET', k); } return k; }
function hmac_(key, msg) { return Utilities.computeHmacSha256Signature(String(msg), String(key), Utilities.Charset.UTF_8).map(function (b) { var h = ((b + 256) % 256).toString(16); return h.length < 2 ? '0' + h : h; }).join(''); }
// JSON chuan hoa (khoa sap xep) de hai ben ky/kiem cung mot chuoi
function canon_(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon_).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon_(v[k]); }).join(',') + '}';
}
function policySig_(p) { return hmac_(policySecret_(), canon_(p)); }
function inHours_(h, now) {
  h = h || {}; var tz = h.tz || 'Asia/Ho_Chi_Minh', cur = Utilities.formatDate(new Date(now || Date.now()), tz, 'HH:mm'), a = h.from || '00:00', b = h.to || '23:59';
  return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
}
// Danh gia mot lenh mua theo chinh sach. Tra { decision: 'auto'|'otp'|'hold', reasons: [...], version }
// p: hang PO (collected_cost, qty), o: don (vat, customer), offer: { s: nguon, total: gia thuc tra ca dong }, ctx: { policy, now, daySpent, hourCount, quoteAgeHours, firstOrder, addrLevels }
function policyEval_(p, o, offer, ctx) {
  ctx = ctx || {}; var pol = ctx.policy || policy_(), A = pol.autonomy || {}, r = [], val = Math.round(Number(p.collected_cost) || 0), now = ctx.now || Date.now();
  if (!A.enabled) r.push('AUTONOMY_OFF');
  if (!inHours_(A.hours, now)) r.push('OUT_OF_HOURS');
  if (val > Number(A.otp_max_vnd)) r.push('OVER_AUTO_CAP');
  if (ctx.daySpent !== undefined && Number(ctx.daySpent) + val > Number(A.daily_cap_vnd)) r.push('DAILY_CAP');
  if (ctx.hourCount !== undefined && Number(ctx.hourCount) >= Number(A.max_per_hour)) r.push('HOURLY_CAP');
  if (offer && offer.s) {
    if ((pol.sources.allow || []).indexOf(offer.s) < 0) r.push('SOURCE_NOT_ALLOWED');
    if (o && o.vat && (pol.sources.vat_sources || []).indexOf(offer.s) < 0) r.push('VAT_NEEDS_B2B');
  }
  if (offer && offer.total !== undefined && Math.round(Number(offer.total)) > val + Number(pol.price.tolerance_vnd)) r.push('OVER_CAP');
  if (ctx.quoteAgeHours !== undefined && Number(ctx.quoteAgeHours) > Number(pol.price.quote_max_age_hours)) r.push('QUOTE_STALE');
  if (ctx.firstOrder && val > Number(pol.customer.first_order_hold_over_vnd)) r.push('NEW_CUSTOMER_HIGH_VALUE');
  if (ctx.addrLevels !== undefined && Number(ctx.addrLevels) < Number(pol.customer.address_levels)) r.push('ADDRESS_INCOMPLETE');
  // Nguoi da duyet (email mot cham / quan tri): bo cac ly do MEM (tran, gio, khach moi); giu ly do CUNG (cong tac, nguon, VAT, gia, bao gia cu, dia chi)
  if (ctx.approved) r = r.filter(function (x) { return ['OVER_AUTO_CAP', 'NEW_CUSTOMER_HIGH_VALUE', 'OUT_OF_HOURS', 'DAILY_CAP', 'HOURLY_CAP'].indexOf(x) < 0; });
  return { decision: r.length ? 'hold' : (val > Number(A.auto_max_vnd) ? 'otp' : 'auto'), reasons: r, version: pol.version, approved: !!ctx.approved };
}
// Don dau tien cua khach (chua co don nao da thanh toan truoc do cung SDT hoac email)
function firstOrder_(o) {
  if (!o || !o.customer) return false;
  var ph = normPhone_(o.customer.phone), em = String(o.customer.email || '').toLowerCase(), n = 0;
  rows_('Orders').forEach(function (r) { if (r.code === o.code) return; var x = parseData_(r); if (x.payment_status === 'paid' && x.customer && ((ph && normPhone_(x.customer.phone) === ph) || (em && String(x.customer.email || '').toLowerCase() === em))) n++; });
  return n === 0;
}
function vnDay_(t) { return Utilities.formatDate(new Date(t || Date.now()), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
// Tien bot da chi (hoac dang chi) trong ngay: lenh 'ordered' do bot + lenh dang 'paying'
function botDaySpent_(pos) {
  var day = vnDay_(), sum = 0;
  (pos || rows_('PO')).forEach(function (p) {
    var d = parseData_(p), bt = d.bot || {};
    if (p.status === 'ordered' && /^bot-/.test(String(d.auto || '')) && vnDay_(d.ordered_at || p.updated_at) === day) sum += Number(p.actual_cost) || 0;
    else if (p.status === 'to_order' && bt.state === 'paying' && bt.at && vnDay_(bt.at) === day) sum += Number(bt.total) || 0;
  });
  return sum;
}
function botFailStreak_(reset) {
  var n = reset ? 0 : (parseInt(P_().getProperty('BOT_FAIL_STREAK') || '0', 10) + 1);
  P_().setProperty('BOT_FAIL_STREAK', String(n));
  if (!reset && n >= 3 && cfg_('AUTONOMY_ENABLED') !== '0') {
    P_().setProperty('AUTONOMY_ENABLED', '0'); log_('autonomy_off', 'system', 'bot loi ' + n + ' lan lien tiep');
    adminsMail_('🛑 Bot đặt hàng TỰ DỪNG sau ' + n + ' lệnh lỗi liên tiếp', '<p>Hệ thống đã tắt tự động đặt hàng (AUTONOMY_ENABLED=0) để tránh lỗi lặp. Kiểm tra nguyên nhân trong Quản trị → Lệnh mua, rồi bật lại tại Quản trị → Hệ thống → Chính sách tự động.</p>');
  }
  return n;
}
function botAuth_(b) {
  var h = P_().getProperty('BOT_KEY_HASH'), k = str_(b.bot_key, 200);
  if (!h || !k || sha_('kk-bot|' + k) !== h) { rate_('botbad', 30, 3600); throw err_('Khóa bot không đúng hoặc đã bị đổi', 401); }
  // Chu ky HMAC-SHA256 + nonce + moc thoi gian: chong gui lai va sua than thong diep. Khoa MAC dan xuat tu khoa bot (may chu khong luu khoa bot).
  if (b.sig !== undefined || cfg_('BOT_REQUIRE_SIG') === '1') {
    var ts = Number(b.ts) || 0, nonce = str_(b.nonce, 64), sig = String(b.sig || '').toLowerCase();
    if (!sig || !nonce || Math.abs(Date.now() - ts) > 5 * 60e3) { rate_('botbad', 30, 3600); throw err_('Thông điệp bot thiếu chữ ký/nonce hoặc lệch giờ quá 5 phút', 401); }
    var c = CacheService.getScriptCache(); if (c.get('bn_' + nonce)) { rate_('botbad', 30, 3600); throw err_('Thông điệp bot bị gửi lại (nonce trùng)', 401); }
    var body = {}; Object.keys(b).forEach(function (x) { if (x !== 'sig') body[x] = b[x]; });
    if (hmac_(sha_('kk-mac|' + k), ts + '\n' + nonce + '\n' + sha_(canon_(body))) !== sig) { rate_('botbad', 30, 3600); throw err_('Chữ ký bot không hợp lệ', 401); }
    c.put('bn_' + nonce, '1', 600);
  }
  rate_('bot', 600, 3600);
  P_().setProperty('BOT_SEEN_AT', nowIso_()); if (b.device) P_().setProperty('BOT_DEVICE', str_(b.device, 80));
}
function botQueue_(b) {
  botAuth_(b);
  var orders = {}, orderOf = function (c) { if (!(c in orders)) { try { orders[c] = loadOrder_(c); } catch (e) { orders[c] = null; } } return orders[c]; };
  var items = rows_('PO').filter(function (p) { return p.status === 'to_order'; }).map(function (p) {
    var o = orderOf(p.order_code); if (!o || o.payment_status !== 'paid' || ['cancelled', 'refunded', 'refunding'].indexOf(o.status) >= 0) return null;
    var d = parseData_(p), c = o.customer || {};
    return { po_id: p.po_id, order_code: p.order_code, sku: p.sku, name: p.name, qty: Number(p.qty), collected_cost: Number(p.collected_cost), unit_cost: Number(d.unit_cost) || Math.round(Number(p.collected_cost) / Number(p.qty)),
      ship_est: Number(d.ship_est) || 0, vat: !!o.vat, paid_at: o.paid_at || '', ship_to: { name: c.name, phone: c.phone, address: c.address, note: c.note || '' }, bot: d.bot ? { state: d.bot.state, at: d.bot.at, note: d.bot.note || '' } : null };
  }).filter(Boolean).slice(0, 50);
  var pol = policy_();
  return { at: nowIso_(), tolerance: Number(pol.price.tolerance_vnd), sources: BOT_SOURCES, items: items, enabled: !!pol.autonomy.enabled, policy: pol, policy_sig: policySig_(pol), require_sig: cfg_('BOT_REQUIRE_SIG') === '1', day_spent: botDaySpent_() };
}
function botUpdate_(b) {
  botAuth_(b);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = find_('PO', 'po_id', b.po_id); if (!p) throw err_('Không tìm thấy lệnh mua', 404);
    var d = parseData_(p), bot = d.bot || {}, st = String(b.state || ''), now = nowIso_(), age = bot.at ? (Date.now() - new Date(bot.at).getTime()) / 60000 : 1e9;
    var src = str_(b.source, 20).toLowerCase(); if (src && BOT_SOURCES.indexOf(src) < 0) throw err_('Nguồn chưa hỗ trợ bot: ' + src);
    var logIt = function (note) { (bot.log = bot.log || []).push({ at: now, state: bot.state, note: str_(note, 160) }); bot.log = bot.log.slice(-12); };
    var pol = policy_(), o0 = null; try { o0 = loadOrder_(p.order_code); } catch (e) { o0 = null; }
    if (st === 'claim' || st === 'paying') {
      if (b.policy_sig !== undefined && String(b.policy_sig) !== policySig_(pol)) throw err_('Chính sách tự động đã thay đổi - tiện ích tải lại hàng đợi (POLICY_STALE)', 409);
      if (!pol.autonomy.enabled) throw err_('Tự động đặt hàng đang TẮT (AUTONOMY_OFF) - bật lại tại Quản trị → Hệ thống', 409);
    }
    if (st === 'claim') {
      if (p.status !== 'to_order') throw err_('Lệnh mua không còn ở trạng thái Cần đặt', 409);
      var approved = bot.state === 'approved' && bot.approved_at && (Date.now() - new Date(bot.approved_at).getTime()) < APPROVE_HOURS * 3600e3; // nguoi da duyet trong 48 gio
      var ev = policyEval_(p, o0, { s: src || 'tiki', total: b.offer_total !== undefined ? Number(b.offer_total) : undefined }, { policy: pol, daySpent: botDaySpent_(), firstOrder: firstOrder_(o0), addrLevels: b.addr_levels !== undefined ? Number(b.addr_levels) : undefined, approved: approved });
      if (ev.decision === 'hold') {
        bot.state = 'hold'; bot.at = now; bot.reasons = ev.reasons; bot.policy = ev.version; bot.note = 'Ngoại lệ chính sách: ' + ev.reasons.join(', '); logIt(bot.note);
        d.bot = bot; update_('PO', p._row, { data: JSON.stringify(d), updated_at: now }); log_('bot_hold', 'policy', b.po_id + ' ' + ev.reasons.join(','));
        if (rate_soft_('bothold_' + p.po_id, 1, 21600)) adminsMail_('⏸ Lệnh mua ' + p.po_id + ' chờ người duyệt (' + ev.reasons.join(', ') + ')', '<p>Lệnh mua <b>' + esc_(p.po_id) + '</b> (' + esc_(p.name) + ', ' + vnd_(p.collected_cost) + ') không nằm trong hành lang tự động: <b>' + esc_(ev.reasons.join(', ')) + '</b> (chính sách ' + esc_(ev.version) + ').</p>' + approveLinks_(p.po_id) + '<p>Hoặc vào Quản trị → Lệnh mua để đặt tay / duyệt.</p>');
        throw err_('Ngoài hành lang chính sách: ' + ev.reasons.join(', '), 409);
      }
      bot.otp = ev.decision === 'otp'; bot.policy = ev.version;
      if (['paying', 'paying_unknown', 'pay_failed'].indexOf(bot.state) >= 0) throw err_('Lệnh mua đã từng bấm Đặt hàng tại nguồn - cần quản trị kiểm tra và cho phép đặt lại', 409);
      if (bot.state === 'working' && age < 15 && bot.run !== str_(b.run, 60)) throw err_('Một phiên bot khác đang xử lý lệnh mua này', 409);
      if (bot.state === 'failed' && !b.retry) throw err_('Lệnh mua đã lỗi ở lần trước - bấm "Thử lại" trong tiện ích hoặc quản trị cho phép', 409);
      bot.state = 'working'; bot.at = now; bot.run = str_(b.run, 60); bot.src = src || 'tiki'; bot.tries = (bot.tries || 0) + 1; bot.approved = approved; logIt('bắt đầu đặt tại ' + bot.src + (approved ? ' (đã được người duyệt)' : ''));
    } else if (st === 'paying') {
      if (bot.state !== 'working' || bot.run !== str_(b.run, 60)) throw err_('Phiên bot không hợp lệ cho lệnh mua này', 409);
      var total = Math.round(Number(b.total) || 0), cap = Number(p.collected_cost) + Number(pol.price.tolerance_vnd);
      if (!(total > 0) || total > cap) throw err_('Tổng thanh toán tại nguồn ' + vnd_(total) + ' vượt tiền hàng đã thu + biên dung sai (' + vnd_(cap) + ') - không đặt', 409);
      if (total > Number(pol.instrument.per_txn_cap_vnd)) throw err_('Tổng ' + vnd_(total) + ' vượt trần mỗi giao dịch của phương tiện chi (' + vnd_(pol.instrument.per_txn_cap_vnd) + ')', 409);
      var spent = botDaySpent_(); if (!bot.approved && spent + total > Number(pol.autonomy.daily_cap_vnd)) throw err_('Vượt hạn mức chi tự động trong ngày (' + vnd_(spent) + ' + ' + vnd_(total) + ' > ' + vnd_(pol.autonomy.daily_cap_vnd) + ') - DAILY_CAP', 409);
      if (!bot.approved && rateFixed_('botpay', Number(pol.autonomy.max_per_hour) || 10, 3600)) throw err_('Vượt số lệnh tự động mỗi giờ (' + pol.autonomy.max_per_hour + ') - HOURLY_CAP', 409);
      bot.state = 'paying'; bot.at = now; bot.total = total; bot.ship = Math.max(0, Math.round(Number(b.ship) || 0)); logIt('bấm Đặt hàng, tổng ' + vnd_(total) + ' - chờ OTP');
    } else if (st === 'done') {
      var id = str_(b.supplier_order_id, 40).replace(/[^\w-]/g, ''); if (!id) throw err_('Thiếu mã đơn nguồn');
      if (p.status === 'to_order' && (bot.state !== 'paying' || bot.run !== str_(b.run, 60))) throw err_('Lệnh mua chưa được máy chủ duyệt thanh toán ở phiên này', 409);
      b.total = bot.total; if (b.ship === undefined) b.ship = bot.ship; // so tien da duoc may chu duyet o buoc paying
      if (p.status === 'to_order') poUpdate_({ po_id: p.po_id, status: 'ordered', actual_source: bot.src || src || 'tiki', actual_cost: Math.round(Number(b.total) || bot.total || 0), supplier_order_id: id, ship_paid: b.ship !== undefined ? b.ship : bot.ship, vat_requested: false, auto: 'bot-' + (bot.src || src || 'tiki') }, 'bot:' + (P_().getProperty('BOT_DEVICE') || 'chrome'));
      else if (String(p.supplier_order_id) !== id) throw err_('Lệnh mua đã gắn mã đơn nguồn khác: ' + p.supplier_order_id, 409);
      p = find_('PO', 'po_id', b.po_id); d = parseData_(p); bot = d.bot || bot; bot.state = 'done'; bot.at = now; logIt('đặt thành công, mã đơn ' + id); botFailStreak_(true);
    } else if (st === 'fail' || st === 'skip') {
      var reason = str_(b.note, 200) || 'không rõ';
      if (bot.state === 'paying') { bot.state = /thanh to[aá]n|payment|otp/i.test(reason) ? 'pay_failed' : 'paying_unknown'; }
      else bot.state = st === 'skip' ? 'skip' : 'failed';
      bot.at = now; bot.note = reason; logIt(reason);
      if (bot.state !== 'skip') botFailStreak_(false);
      if (bot.state !== 'skip' && rate_soft_('botmail_' + p.po_id + '_' + bot.state, 1, 21600)) adminsMail_((bot.state === 'failed' ? '⚠️' : '🚨') + ' Bot đặt hàng: ' + p.po_id + ' - ' + reason.slice(0, 80), '<p>Lệnh mua <b>' + esc_(p.po_id) + '</b> (' + esc_(p.name) + ')</p><p>Trạng thái bot: <b>' + esc_(bot.state) + '</b><br>Lý do: ' + esc_(reason) + '</p>' + (bot.state === 'failed' ? '<p>Bấm "Thử lại" trong tiện ích hoặc đặt tay trong Quản trị → Lệnh mua.</p>' : '<p><b>Đã bấm Đặt hàng tại nguồn</b> - kiểm tra đơn trên ứng dụng nguồn (thanh toán lại nếu cần). Hệ thống đọc email xác nhận sẽ tự gắn mã đơn khi có.</p>'));
    } else throw err_('Trạng thái bot không hợp lệ');
    d = parseData_(find_('PO', 'po_id', b.po_id)); d.bot = bot;
    var row = find_('PO', 'po_id', b.po_id); update_('PO', row._row, { data: JSON.stringify(d), updated_at: now });
    log_('bot_' + st, P_().getProperty('BOT_DEVICE') || 'bot', b.po_id + ' ' + (bot.note || ''));
    return { ok: true, po_id: b.po_id, bot: { state: bot.state, at: bot.at, note: bot.note || '' }, status: row.status, otp: !!bot.otp, approved: !!bot.approved };
  } finally { lock.releaseLock(); }
}
function rate_soft_(key, max, sec) { var c = CacheService.getScriptCache(), n = parseInt(c.get(key) || '0', 10); if (n >= max) return false; c.put(key, String(n + 1), sec); return true; }
function adminBotKey_(b) {
  var s = session_(b.token, true), k = 'kkbot_' + rnd_();
  P_().setProperty('BOT_KEY_HASH', sha_('kk-bot|' + k)); P_().setProperty('BOT_KEY_AT', nowIso_());
  log_('admin_botkey', s.email, 'tao/doi khoa bot'); adminsMail_('🔑 Khóa bot đặt hàng vừa được tạo/đổi', '<p>Khóa bot đặt hàng tự động vừa được tạo bởi ' + esc_(s.email) + '. Khóa cũ (nếu có) đã hết hiệu lực. Nếu không phải anh/chị thực hiện, đăng nhập Quản trị và đổi khóa ngay.</p>');
  return { bot_key: k, at: P_().getProperty('BOT_KEY_AT') };
}
function adminPoBotReset_(b) {
  var s = session_(b.token, true), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = find_('PO', 'po_id', b.po_id); if (!p) throw err_('Không tìm thấy lệnh mua', 404); var d = parseData_(p); var old = d.bot && d.bot.state;
    if (old === 'hold') { approveSet_(p, d, s.email); log_('admin_po_approve', s.email, b.po_id); return { ok: true, approved: true }; } // hold -> DUYET (xoa trang thai thi bot se hold lai y nhu cu)
    d.bot_prev = d.bot || null; delete d.bot; update_('PO', p._row, { data: JSON.stringify(d), updated_at: nowIso_() }); log_('admin_po_botreset', s.email, b.po_id + ' (' + old + ')'); return { ok: true };
  } finally { lock.releaseLock(); }
}
/* =========================== DUYỆT LỆNH HOLD MỘT CHẠM TỪ EMAIL =========================== */
// Email canh bao hold kem 2 nut: "Duyet cho bot dat" / "Huy & hoan khach". Link GET chi MO TRANG XAC NHAN (khong doi trang thai -> bo quet link
// cua email khong lam gi duoc); bam nut trong trang = POST voi token ky HMAC (khoa dan xuat tu PEPPER), han 48 gio, gan voi dung lenh mua.
var APPROVE_HOURS = 48;
function approveSecret_() { return sha_('kk-approve|' + pepper_()); }
function approveToken_(poId) { var exp = Date.now() + APPROVE_HOURS * 3600e3; return poId + '.' + exp + '.' + hmac_(approveSecret_(), poId + '|' + exp).slice(0, 32); }
function approveVerify_(t) {
  var m = /^([A-Z0-9-]{8,40})\.(\d{10,16})\.([0-9a-f]{32})$/.exec(String(t || '')); if (!m) throw err_('Liên kết không hợp lệ', 400);
  if (Number(m[2]) < Date.now()) throw err_('Liên kết đã hết hạn (' + APPROVE_HOURS + ' giờ) - vào Quản trị để xử lý', 410);
  if (hmac_(approveSecret_(), m[1] + '|' + m[2]).slice(0, 32) !== m[3]) throw err_('Liên kết không hợp lệ', 400);
  return m[1];
}
function approveLinks_(poId, small) {
  var u = ScriptApp.getService().getUrl() + '?a=approve&t=' + approveToken_(poId), st = small ? 'padding:3px 10px;font-size:12px;margin-left:6px' : 'padding:10px 18px;font-size:14px;margin-right:10px';
  return (small ? '' : '<p>') + '<a href="' + u + '" style="' + st + ';background:#166534;color:#fff;border-radius:8px;text-decoration:none;display:inline-block">✅ Duyệt cho bot đặt</a>'
    + '<a href="' + u + '&x=cancel" style="' + st + ';background:#B91C1C;color:#fff;border-radius:8px;text-decoration:none;display:inline-block">⛔ Hủy &amp; hoàn khách</a>' + (small ? '' : '</p>');
}
function approveSet_(p, d, by) { var old = d.bot || {}; d.bot = { state: 'approved', at: nowIso_(), approved_at: nowIso_(), by: by, reasons: old.reasons || [], note: 'Người duyệt: ' + by + (old.reasons && old.reasons.length ? ' (' + old.reasons.join(', ') + ')' : ''), log: (old.log || []).slice(-11).concat([{ at: nowIso_(), state: 'approved', note: 'duyệt bởi ' + by }]) }; update_('PO', p._row, { data: JSON.stringify(d), updated_at: nowIso_() }); chain_('bot', p.po_id, { po: p.po_id, state: 'approved', by: by, at: d.bot.at }); }
function approvePage_(title, body) {
  return HtmlService.createHtmlOutput('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc_(title) + '</title>'
    + '<style>body{font:15px/1.5 system-ui,Arial,sans-serif;background:#F3F4F6;margin:0;padding:24px}.c{max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:22px 24px;box-shadow:0 6px 24px rgba(0,0,0,.08)}h1{font-size:18px;color:#1E3A8A;margin:0 0 10px}.b{display:inline-block;padding:10px 18px;border-radius:8px;border:0;color:#fff;font-size:14px;cursor:pointer;margin:6px 8px 0 0}.ok{background:#166534}.no{background:#B91C1C}.m{color:#4B5563;font-size:13px}</style></head><body><div class="c"><h1>' + esc_(title) + '</h1>' + body + '</div></body></html>').setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}
// GET ?a=approve&t=... : chi hien thong tin + nut (POST). Khong doi trang thai.
function approveGet_(q) {
  try {
    var poId = approveVerify_(q.t), p = find_('PO', 'po_id', poId); if (!p) throw err_('Không tìm thấy lệnh mua', 404);
    var d = parseData_(p), bt = d.bot || {}, url = ScriptApp.getService().getUrl();
    if (p.status !== 'to_order') return approvePage_('Lệnh mua ' + poId + ' đã được xử lý', '<p>Trạng thái hiện tại: <b>' + esc_(p.status) + '</b>. Không còn gì để duyệt.</p>');
    if (bt.state !== 'hold') return approvePage_('Lệnh mua ' + poId, '<p>Lệnh không còn ở trạng thái chờ duyệt (hiện: <b>' + esc_(bt.state || 'chưa có bot') + '</b>).</p>');
    var f = function (x, cls, label) { return '<form method="post" action="' + esc_(url) + '" style="display:inline"><input type="hidden" name="a" value="approve"><input type="hidden" name="t" value="' + esc_(q.t) + '"><input type="hidden" name="x" value="' + x + '"><button class="b ' + cls + '" type="submit">' + label + '</button></form>'; };
    return approvePage_('Duyệt lệnh mua ' + poId, '<p><b>' + esc_(p.name) + '</b><br>Số lượng ' + esc_(p.qty) + ' · tiền hàng đã thu <b>' + vnd_(p.collected_cost) + '</b><br>Lý do chờ: <b>' + esc_((bt.reasons || []).join(', ') || bt.note || '') + '</b> · từ ' + esc_(new Date(bt.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })) + '</p>'
      + '<p class="m">Duyệt: bot sẽ đặt ở chu kỳ tới (vẫn giữ kiểm tra giá, nguồn, địa chỉ; đơn trên ' + vnd_(policy_().autonomy.auto_max_vnd) + ' cần OTP ngân hàng; vượt trần mỗi giao dịch của thẻ bot thì phải đặt tay). Hủy: dòng hàng bị hủy, hệ thống ghi khoản hoàn cho khách và gửi email.</p>'
      + f(q.x === 'cancel' ? 'cancel' : 'approve', q.x === 'cancel' ? 'no' : 'ok', q.x === 'cancel' ? '⛔ Xác nhận HỦY và hoàn khách' : '✅ Xác nhận DUYỆT cho bot đặt') + (q.x === 'cancel' ? f('approve', 'ok', '✅ Duyệt thay vì hủy') : f('cancel', 'no', '⛔ Hủy & hoàn khách')));
  } catch (x) { return approvePage_('Không mở được liên kết', '<p>' + esc_(x.message) + '</p>'); }
}
// POST form (a=approve, t, x): thuc hien
function approvePost_(q) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var poId = approveVerify_(q.t), p = find_('PO', 'po_id', poId); if (!p) throw err_('Không tìm thấy lệnh mua', 404);
    var d = parseData_(p), bt = d.bot || {};
    if (p.status !== 'to_order') return approvePage_('Đã xử lý trước đó', '<p>Lệnh mua ' + esc_(poId) + ' đang ở trạng thái <b>' + esc_(p.status) + '</b>.</p>');
    if (String(q.x) === 'cancel') { poUpdate_({ po_id: poId, status: 'cancelled', note: 'Quản trị hủy qua liên kết email - hoàn khách' }, 'email-link'); log_('po_cancel_email', 'email-link', poId); return approvePage_('Đã hủy lệnh mua ' + poId, '<p>Đã ghi khoản hoàn cho khách và gửi email thông báo. Chuyển hoàn tại Quản trị → Đơn hàng → Cần hoàn tiền.</p>'); }
    if (bt.state !== 'hold') return approvePage_('Không cần duyệt', '<p>Lệnh không ở trạng thái chờ duyệt (hiện: <b>' + esc_(bt.state || 'chưa có bot') + '</b>).</p>');
    approveSet_(p, d, 'email-link'); log_('po_approve_email', 'email-link', poId);
    return approvePage_('Đã duyệt lệnh mua ' + poId, '<p>Bot sẽ đặt ở chu kỳ kế tiếp (tối đa vài phút khi máy chạy tiện ích đang bật). Hiệu lực duyệt: ' + APPROVE_HOURS + ' giờ.</p>');
  } catch (x) { return approvePage_('Không thực hiện được', '<p>' + esc_(x.message) + '</p>'); } finally { lock.releaseLock(); }
}
function botInfo_() { var P = P_(), pol = policy_(); return { has_key: !!P.getProperty('BOT_KEY_HASH'), key_at: P.getProperty('BOT_KEY_AT') || '', seen_at: P.getProperty('BOT_SEEN_AT') || '', device: P.getProperty('BOT_DEVICE') || '', sources: BOT_SOURCES, enabled: !!pol.autonomy.enabled, fail_streak: parseInt(P.getProperty('BOT_FAIL_STREAK') || '0', 10), policy_version: pol.version, require_sig: cfg_('BOT_REQUIRE_SIG') === '1', day_spent: botDaySpent_() }; }
// Hoa don GTGT phi dich vu (ban nhap -> quan tri duyet -> phat hanh qua nha cung cap HDDT & gui khach)
function feeInvoice_(o) {
  if (!o.fee_net || rows_('Invoices').some(function (i) { return i.order_code === o.code; })) return;
  var v = o.vat || {};
  append_('Invoices', { inv_id: 'HD-' + o.code, order_code: o.code, created_at: nowIso_(), status: 'draft', buyer: v.name || o.customer.name, tax_code: v.tax_code || '', content: 'Phí dịch vụ mua hộ và xử lý đơn hàng KK-MALL (đơn ' + o.code + ')',
    pre_tax: o.fee_pre_tax, vat_rate: o.vat_rate, vat: o.fee_vat, total: o.fee_net, data: JSON.stringify({ address: v.address || o.customer.address, email: v.email || o.customer.email }) });
}
function adminInvoiceIssue_(b) {
  var s = session_(b.token, true), i = find_('Invoices', 'inv_id', b.inv_id); if (!i) throw err_('Không tìm thấy hóa đơn', 404);
  var d = parseData_(i); d.einvoice_no = str_(b.einvoice_no, 40); d.issued_by = s.email; d.issued_at = nowIso_();
  update_('Invoices', i._row, { status: 'issued', data: JSON.stringify(d) });
  mail_(d.email, 'Hóa đơn GTGT phí dịch vụ KK-MALL - ' + i.order_code, '<p>KK-MALL gửi bạn hóa đơn GTGT <b>phí dịch vụ</b> cho đơn <b>' + i.order_code + '</b>' + (d.einvoice_no ? ' (số HĐĐT: <b>' + esc_(d.einvoice_no) + '</b>)' : '') + '.</p><table style="font-size:14px"><tr><td>Người mua:</td><td><b>' + esc_(i.buyer) + '</b>' + (i.tax_code ? ' - MST ' + esc_(i.tax_code) : '') + '</td></tr><tr><td>Nội dung:</td><td>' + esc_(i.content) + '</td></tr><tr><td>Tiền trước thuế:</td><td>' + vnd_(i.pre_tax) + '</td></tr><tr><td>Thuế GTGT ' + i.vat_rate + '%:</td><td>' + vnd_(i.vat) + '</td></tr><tr><td><b>Tổng cộng:</b></td><td><b>' + vnd_(i.total) + '</b></td></tr></table><p style="font-size:13px;color:#475569">Hóa đơn GTGT tiền hàng do nhà cung cấp xuất trực tiếp cho bạn.</p>');
  log_('admin_invoice_issue', s.email, b.inv_id);
  return { ok: true };
}
function adminRmaUpdate_(b) {
  var s = session_(b.token, true), lk = LockService.getScriptLock(); lk.waitLock(20000);
  try { return rmaUpdate_(b, s); } finally { lk.releaseLock(); }
}
function rmaUpdate_(b, s) {
  var r = find_('RMA', 'rma_id', b.rma_id); if (!r) throw err_('Không tìm thấy yêu cầu', 404);
  var d = parseData_(r), o = loadOrder_(r.order_code);
  if (b.status && b.status !== r.status && ['refunded', 'rejected', 'closed'].indexOf(r.status) >= 0) throw err_('Yêu cầu đã kết thúc (' + r.status + ') - không đổi trạng thái được', 409);
  ['return_tracking', 'pickup', 'supplier_rma_id', 'note'].forEach(function (k) { if (b[k] !== undefined) d[k] = str_(b[k], 300); });
  var tot = Math.round(Number(b.supplier_refund) || 0), prev = Number(d.supplier_refund) || 0, sr = tot - prev; // b.supplier_refund = TONG so NCC da hoan den nay
  if (tot && tot < prev) throw err_('Tổng tiền NCC đã hoàn (' + vnd_(tot) + ') nhỏ hơn số đã ghi trước đó (' + vnd_(prev) + ')');
  if (sr > 0) { // NCC hoan tien hang tra lai ve KK-MALL: No 1121 / Co 3388 (doi ung khoan da hoan khach / chi ho truoc do)
    d.supplier_refund = tot; d.supplier_refund_at = nowIso_();
    ledger_(o.code, d.supplier_rma_id || r.rma_id, '1121', '', sr, 'Nhà cung cấp hoàn tiền hàng trả lại (' + r.rma_id + ')');
    ledger_(o.code, d.supplier_rma_id || r.rma_id, '', '3388', sr, 'Ghi giảm khoản chi hộ - hàng trả lại nhà cung cấp');
  }
  update_('RMA', r._row, { status: b.status || r.status, data: JSON.stringify(d), updated_at: nowIso_() });
  if (b.status === 'pickup_scheduled') mail_(o.customer.email, 'Lịch lấy hàng đổi trả ' + r.rma_id, '<p>Yêu cầu trả hàng <b>' + r.rma_id + '</b> đã được nhà cung cấp duyệt.</p><p>Bưu tá sẽ đến lấy hàng tại địa chỉ của bạn: <b>' + esc_(d.pickup) + '</b><br>Mã vận đơn thu hồi: <b>' + esc_(d.return_tracking) + '</b></p><p>Bạn chỉ cần đóng gói lại sản phẩm và giao cho bưu tá - không mất phí vận chuyển.</p>');
  if (b.status === 'rejected') mail_(o.customer.email, 'Kết quả yêu cầu ' + r.rma_id, '<p>Rất tiếc, nhà cung cấp chưa chấp nhận yêu cầu <b>' + r.rma_id + '</b>: ' + esc_(d.note) + '. KK-MALL sẽ tiếp tục hỗ trợ bạn.</p>');
  log_('admin_rma', s.email, b.rma_id + ' ' + b.status);
  return { ok: true };
}
/* Thong ke chenh lech (thuc tra - da thu) tren moi lenh mua theo nguon, 90 ngay - de bo thu thap tu hieu chinh du phong ship.
   Chi tra ve so lieu tong hop (n, trung binh, p75) - can khoa STATS_KEY (GitHub Secret BACKEND_STATS_KEY). */
function shipStats_(key) {
  if (!key || key !== P_().getProperty('STATS_KEY')) throw err_('Sai khóa', 403);
  var since = Date.now() - 90 * 864e5, by = {};
  rows_('PO').forEach(function (p) {
    if (!p.actual_source || !(Number(p.actual_cost) > 0) || ['ordered', 'shipped', 'delivered'].indexOf(p.status) < 0) return;
    if (Date.parse(p.updated_at || '') < since) return;
    var d = parseData_(p), unitL = Number(d.unit_cost) || 0, qty = Number(p.qty) || 1;
    var ship = Number(d.ship_paid); var delta = Number.isFinite(ship) && d.ship_paid !== '' && d.ship_paid != null ? ship : (Number(p.actual_cost) - Number(p.collected_cost));
    var est = Number(d.ship_est) || 0;                                   // ship da du phong khi dinh gia
    (by[p.actual_source] = by[p.actual_source] || []).push(Math.max(0, delta + est));  // phi ship thuc te cua nguon (uoc)
  });
  var out = {};
  Object.keys(by).forEach(function (k) { var a = by[k].sort(function (x, y) { return x - y; }); out[k] = { n: a.length, avg: Math.round(a.reduce(function (s, v) { return s + v; }, 0) / a.length), p75: a[Math.min(a.length - 1, Math.floor(a.length * 0.75))] }; });
  return { at: nowIso_(), days: 90, sources: out };
}
function adminList_(b, name, outFn) { session_(b.token, true); return { rows: rows_(name).reverse().slice(0, 1000).map(outFn) }; }
function adminConfig_(b) {
  var s = session_(b.token, true);
  if (b.set) {
    var allow = ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'VAT_RATE', 'TOLERANCE', 'UNPAID_HOURS', 'RETURN_DAYS', 'COMPANY_JSON', 'VOUCHER_FEE_CAP_PCT', 'STATS_KEY', 'POLICY_JSON', 'AUTONOMY_ENABLED', 'BOT_REQUIRE_SIG', 'SEPAY_API_TOKEN', 'TERMS_EFFECTIVE'];
    var kept = [];
    Object.keys(b.set).forEach(function (k) {
      if (allow.indexOf(k) < 0) return;
      var v = str_(b.set[k], k === 'POLICY_JSON' ? 20000 : 2000);
      if (k === 'COMPANY_JSON' && v) { try { var cj = JSON.parse(v); if (!cj || typeof cj !== 'object' || Array.isArray(cj)) throw new Error('phải là đối tượng JSON'); } catch (e) { throw err_('COMPANY_JSON không hợp lệ: ' + e.message, 400); } }
      if (k === 'TERMS_EFFECTIVE' && v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err_('Ngày áp dụng điều khoản phải dạng YYYY-MM-DD', 400); if (v < vnToday_(Date.now() + 7 * 86400e3)) throw err_('Ngày áp dụng phải cách hôm nay ít nhất 7 ngày (phải công bố trước khi áp dụng - Điều khoản mục 12)', 400); }
      if (k === 'POLICY_JSON' && v) { try { var pj = JSON.parse(v); if (!pj || typeof pj !== 'object' || Array.isArray(pj)) throw new Error('phải là đối tượng JSON'); v = JSON.stringify(pj); } catch (e) { throw err_('POLICY_JSON không hợp lệ: ' + e.message, 400); } }
      if (k === 'AUTONOMY_ENABLED' || k === 'BOT_REQUIRE_SIG') { v = v === '1' || v === 'true' ? '1' : '0'; if (k === 'AUTONOMY_ENABLED' && v === '1') P_().setProperty('BOT_FAIL_STREAK', '0'); }
      // BAO VE TAI KHOAN NHAN TIEN: khong cho ghi de trong (form cu/tab cu) - muon xoa phai gui clear_bank: true
      if (!v && ['BANK_ACC', 'BANK_NAME', 'BANK_BIN'].indexOf(k) >= 0 && cfg_(k) && b.clear_bank !== true) { kept.push(k); return; }
      if (k === 'SEPAY_API_TOKEN') { if (!v && b.clear_sepay !== true) return; if (v && !/^[\w.\-]{20,200}$/.test(v)) throw err_('Token API SePay không hợp lệ'); P_().setProperty(k, v); return; } // chi ghi, khong bao gio tra ve
      P_().setProperty(k, v);
    });
    log_('admin_config', s.email, Object.keys(b.set).join(',') + (kept.length ? ' | GIU NGUYEN (gia tri trong): ' + kept.join(',') : ''));
  }
  var out = {}; ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'VAT_RATE', 'TOLERANCE', 'UNPAID_HOURS', 'RETURN_DAYS', 'COMPANY_JSON', 'ADMIN_EMAILS', 'VOUCHER_FEE_CAP_PCT', 'POLICY_JSON', 'AUTONOMY_ENABLED', 'BOT_REQUIRE_SIG'].forEach(function (k) { out[k] = cfg_(k); });
  out.POLICY_EFFECTIVE = policy_(); out.POLICY_DEFAULT = POLICY_DEFAULT; out.SEPAY_VERIFY = !!P_().getProperty('SEPAY_API_TOKEN'); out.CHAIN = chainHead_();
  out.TERMS = termsList_(); out.TERMS_ACTIVE = termsActive_().version; out.TERMS_EFFECTIVE = cfg_('TERMS_EFFECTIVE') || ''; out.CONTRACTS = rows_('Contracts').length; out.INCIDENTS_OPEN = rows_('Incidents').filter(function (r) { return r.status !== 'closed'; }).length;
  out.WEBHOOK_URL = ScriptApp.getService().getUrl() + '?a=webhook&key=' + P_().getProperty('WEBHOOK_KEY');
  if (!P_().getProperty('STATS_KEY')) P_().setProperty('STATS_KEY', rnd_());
  out.STATS_KEY = P_().getProperty('STATS_KEY'); out.BACKEND_URL = ScriptApp.getService().getUrl(); out.MAILSYNC = mailSyncInfo_(); out.BOT = botInfo_();
  out.SHEET_URL = ss_().getUrl(); out.fee_table = feeTable_();
  return out;
}
function adminStats_(b) {
  session_(b.token, true);
  var os = rows_('Orders').map(parseData_), paid = os.filter(function (o) { return o.payment_status === 'paid'; });
  var sum = function (a, k) { return a.reduce(function (x, o) { return x + Number(o[k] || 0); }, 0); };
  return { orders: os.length, paid: paid.length, awaiting: os.filter(function (o) { return o.status === 'awaiting_payment'; }).length,
    goods_collected: sum(paid, 'goods'), fee_revenue: sum(paid, 'fee_net'), fee_pre_tax: sum(paid, 'fee_pre_tax'), fee_vat: sum(paid, 'fee_vat'), total: sum(paid, 'total'),
    po_open: rows_('PO').filter(function (p) { return p.status === 'to_order'; }).length, rma_open: rows_('RMA').filter(function (r) { return r.type === 'return' && ['requested', 'pickup_scheduled', 'returned'].indexOf(r.status) >= 0; }).length,
    members: rows_('Members').length };
}


/* =========================== TỰ KIỂM TOÁN HẰNG NGÀY =========================== */
// Doi soat tu dong: so cai can theo tung don, don da thu tien phai co du lenh mua, lenh mua/hoan tien/bot bi treo.
// Chay sau sao luu moi ngay; co van de -> email quan tri. Trang quan tri goi admin.audit de xem ngay.
function audit_() {
  var now = Date.now(), H = 3600e3, issues = [], orders = rows_('Orders'), pos = rows_('PO'), L = rows_('Ledger');
  var bal = {}; L.forEach(function (r) { var a = Number(r.amount) || 0, b = bal[r.order_code] = bal[r.order_code] || { d: 0, c: 0 }; if (r.debit) b.d += a; if (r.credit) b.c += a; });
  Object.keys(bal).forEach(function (k) { if (Math.round(bal[k].d) !== Math.round(bal[k].c)) issues.push({ lvl: 'high', code: k, msg: 'Sổ cái lệch: Nợ ' + vnd_(bal[k].d) + ' ≠ Có ' + vnd_(bal[k].c) }); });
  var poBy = {}; pos.forEach(function (p) { (poBy[p.order_code] = poBy[p.order_code] || []).push(p); });
  orders.forEach(function (r) {
    var o = parseData_(r), ps = poBy[r.code] || [];
    if (o.payment_status === 'paid' && ['cancelled', 'refunded'].indexOf(o.status) < 0) {
      if (ps.length < (o.lines || []).length) issues.push({ lvl: 'high', code: r.code, msg: 'Đã thu tiền nhưng thiếu lệnh mua (' + ps.length + '/' + (o.lines || []).length + ')' });
      if (!bal[r.code]) issues.push({ lvl: 'high', code: r.code, msg: 'Đã thu tiền nhưng chưa có bút toán' });
      ps.forEach(function (p) {
        var d = parseData_(p), age = (now - new Date(o.paid_at || r.created_at).getTime()) / H;
        if (p.status === 'to_order' && age > 24) issues.push({ lvl: 'med', code: r.code, msg: 'Lệnh mua ' + p.po_id + ' chờ đặt ' + Math.round(age) + ' giờ' });
        if (p.status === 'to_order' && d.bot && d.bot.state === 'hold') issues.push({ lvl: 'med', code: r.code, msg: 'Lệnh mua ' + p.po_id + ' chờ người duyệt: ' + ((d.bot.reasons || []).join(', ') || d.bot.note || '') });
        if (d.bot && ['paying', 'paying_unknown', 'pay_failed'].indexOf(d.bot.state) >= 0 && p.status === 'to_order' && (now - new Date(d.bot.at).getTime()) > H) issues.push({ lvl: 'high', code: r.code, msg: 'Bot: ' + p.po_id + ' đã bấm Đặt hàng nhưng chưa có kết quả (' + d.bot.state + ') - kiểm tra tại nguồn' });
        if (p.status === 'ordered' && (now - new Date(d.ordered_at || p.updated_at).getTime()) > 10 * 24 * H) issues.push({ lvl: 'med', code: r.code, msg: 'Lệnh mua ' + p.po_id + ' đã đặt quá 10 ngày chưa giao vận chuyển' });
      });
    }
    if (Number(o.refund_due) > 0) {
      var since = (now - new Date((o.history || []).slice(-1)[0] ? o.history.slice(-1)[0].at : r.created_at).getTime()) / H;
      if (since > 72) issues.push({ lvl: 'med', code: r.code, msg: 'Còn phải hoàn khách ' + vnd_(o.refund_due) + (o.refund_account ? ' (khách đã khai tài khoản)' : ' (khách chưa khai tài khoản)') });
    }
  });
  try { shareCheck_().forEach(function (i) { issues.push(i); }); } catch (e) { issues.push({ lvl: 'med', code: '', msg: 'Không kiểm tra được quyền chia sẻ Drive: ' + String(e && e.message || e).slice(0, 100) }); }
  try { var cv = chainVerify_(); if (!cv.ok) issues.push({ lvl: 'high', code: '', msg: 'Chuỗi băm nhật ký KHÔNG khớp: ' + cv.problems.join('; ') }); } catch (e) { issues.push({ lvl: 'med', code: '', msg: 'Không kiểm chứng được chuỗi băm: ' + String(e && e.message || e).slice(0, 120) }); }
  var quota = -1; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { }
  if (quota >= 0 && quota < 20) issues.push({ lvl: 'med', code: '', msg: 'Hạn mức email còn ' + quota + ' trong ngày' });
  return { at: nowIso_(), orders: orders.length, ledger_rows: L.length, mail_quota: quota, issues: issues };
}
function dailyAudit() {
  var r = audit_(); P_().setProperty('AUDIT_LAST', JSON.stringify({ at: r.at, n: r.issues.length, high: r.issues.filter(function (i) { return i.lvl === 'high'; }).length }));
  if (r.issues.length) adminsMail_('🧾 Tự kiểm toán KK-MALL: ' + r.issues.length + ' việc cần xử lý', '<table style="font-size:13px;border-collapse:collapse">' + r.issues.slice(0, 60).map(function (i) { return '<tr><td style="padding:4px 8px">' + (i.lvl === 'high' ? '🔴' : '🟠') + '</td><td style="padding:4px 8px"><b>' + esc_(i.code) + '</b></td><td style="padding:4px 8px">' + esc_(i.msg) + '</td></tr>'; }).join('') + '</table>');
  log_('audit', 'system', r.issues.length + ' issues');
  return r;
}
// Moi gio: (1) bot khong ket noi trong gio lam viec ma co lenh cho dat -> bao; (2) lenh hold qua SLA nhac -> bao gop
function botWatch_() {
  try {
    var pol = policy_(), P = P_(), pos = rows_('PO').filter(function (p) { return p.status === 'to_order'; });
    if (!pos.length) return;
    if (pol.autonomy.enabled && P.getProperty('BOT_KEY_HASH') && inHours_(pol.autonomy.hours, Date.now())) {
      var seen = P.getProperty('BOT_SEEN_AT');
      if ((!seen || Date.now() - new Date(seen).getTime() > 30 * 60e3) && rate_soft_('bot_hb_mail', 1, 21600))
        adminsMail_('⚠️ Bot đặt hàng không kết nối', '<p>Có ' + pos.length + ' lệnh mua chờ đặt nhưng bot không kết nối từ <b>' + esc_(seen ? new Date(seen).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'chưa bao giờ') + '</b>. Kiểm tra máy chạy tiện ích hoặc đặt tay trong Quản trị → Lệnh mua.</p>');
    }
    var H = 3600e3, old = pos.filter(function (p) { var bt = parseData_(p).bot || {}; return bt.state === 'hold' && bt.at && Date.now() - new Date(bt.at).getTime() > Number(pol.holds.remind_hours) * H; });
    var late = pos.filter(function (p) { var bt = parseData_(p).bot || {}; return bt.state === 'hold' && bt.at && Date.now() - new Date(bt.at).getTime() > Number(pol.holds.escalate_hours) * H; });
    if (late.length && rate_soft_('bot_hold_esc', 1, Number(pol.holds.escalate_hours) * 3600))
      adminsMail_('🚨 KHẨN: ' + late.length + ' lệnh mua chờ duyệt quá ' + pol.holds.escalate_hours + ' giờ - khách đã trả tiền', '<p>Các lệnh mua sau đã quá <b>' + pol.holds.escalate_hours + ' giờ</b> chưa được người duyệt. Khách đã thanh toán và đang chờ: đặt tay hoặc hủy và hoàn ngay trong Quản trị → Lệnh mua.</p><ul>' + late.map(function (p) { var bt = parseData_(p).bot || {}; return '<li><b>' + esc_(p.po_id) + '</b> ' + esc_(p.name) + ' · ' + vnd_(p.collected_cost) + ' · ' + esc_((bt.reasons || []).join(', ')) + approveLinks_(p.po_id, true) + '</li>'; }).join('') + '</ul><p>Chính sách: ' + (pol.holds.auto_cancel ? 'TỰ HỦY và hoàn khách sau ' + pol.holds.cancel_refund_hours + ' giờ' : 'không tự hủy (bật holds.auto_cancel = true để tự hủy sau ' + pol.holds.cancel_refund_hours + ' giờ)') + '.</p>');
    if (pol.holds.auto_cancel === true) pos.forEach(function (p) {
      var bt = parseData_(p).bot || {}; if (!(bt.state === 'hold' && bt.at && Date.now() - new Date(bt.at).getTime() > Number(pol.holds.cancel_refund_hours) * H)) return;
      var lk = LockService.getScriptLock(); if (!lk.tryLock(20000)) return;
      try { poUpdate_({ po_id: p.po_id, status: 'cancelled', note: 'Quá ' + pol.holds.cancel_refund_hours + ' giờ chờ người duyệt - tự hủy theo chính sách holds.auto_cancel, hoàn khách' }, 'policy'); log_('po_auto_cancel', 'policy', p.po_id); }
      catch (e) { log_('po_auto_cancel_error', p.po_id, String(e && e.message || e).slice(0, 200)); } finally { lk.releaseLock(); }
    });
    if (old.length && rate_soft_('bot_hold_mail', 1, Number(pol.holds.remind_hours) * 3600))
      adminsMail_('⏰ ' + old.length + ' lệnh mua chờ người duyệt quá ' + pol.holds.remind_hours + ' giờ', '<ul>' + old.map(function (p) { var bt = parseData_(p).bot || {}; return '<li><b>' + esc_(p.po_id) + '</b> ' + esc_(p.name) + ' · ' + vnd_(p.collected_cost) + ' · ' + esc_((bt.reasons || []).join(', ')) + ' · từ ' + esc_(new Date(bt.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })) + approveLinks_(p.po_id, true) + '</li>'; }).join('') + '</ul><p>Đặt tay hoặc hủy và hoàn khách trong Quản trị → Lệnh mua (chính sách: hủy sau ' + pol.holds.cancel_refund_hours + ' giờ).</p>');
  } catch (e) { log_('bot_watch', 'system', String(e.message).slice(0, 200)); }
}
/* =========================== ĐỊNH KỲ & SAO LƯU =========================== */
function hourly() {
  botWatch_();
  var lim = Number(cfg_('UNPAID_HOURS')) * 3600e3, remindAt = Math.min(2 * 3600e3, lim / 3), outbox = [];
  rows_('Orders').forEach(function (r) {
    if (r.status !== 'awaiting_payment') return;
    var age = Date.now() - new Date(r.created_at).getTime();
    if (age < remindAt) return;
    var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
    try {
      var o = loadOrder_(r.code); // doc lai trong khoa: webhook co the vua ghi nhan thanh toan
      if (o.status !== 'awaiting_payment' || o.payment_status === 'paid') return;
      if (age >= lim) {
        setStatus_(o, 'cancelled', 'system', 'Quá hạn thanh toán'); saveOrder_(o);
        outbox.push([o.customer.email, 'Đơn ' + o.code + ' đã tự hủy do chưa thanh toán', '<p>Đơn <b>' + o.code + '</b> đã tự hủy vì chưa nhận được thanh toán sau ' + cfg_('UNPAID_HOURS') + ' giờ. Nếu bạn đã chuyển khoản, KK-MALL sẽ hoàn lại đầy đủ. Bạn có thể đặt lại bất cứ lúc nào.</p>']);
      } else if (!o.reminded_at && !o.paid_claim_at && bank_().ready) {
        o.reminded_at = nowIso_(); saveOrder_(o);
        outbox.push([o.customer.email, 'Nhắc thanh toán đơn ' + o.code + ' - giữ giá đến ' + new Date(new Date(o.created_at).getTime() + lim).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), '<p>Đơn <b>' + o.code + '</b> đang chờ thanh toán. Quét mã VietQR bên dưới để KK-MALL đặt mua ngay; đơn chưa thanh toán sẽ tự hủy sau ' + cfg_('UNPAID_HOURS') + ' giờ.</p>' + orderTable_(o) + payBox_(o) + '<p><a href="' + cfg_('SITE') + '/?order=' + o.code + '&phone=' + o.customer.phone + '">Xem đơn hàng →</a></p>']);
      }
    } catch (e) { log_('hourly_error', r.code, String(e && e.message || e)); } finally { lock.releaseLock(); }
  });
  outbox.forEach(function (m) { mail_(m[0], m[1], m[2]); });
  try { flushSearchMiss_(); } catch (e) { log_('searchmiss_error', 'system', String(e && e.message || e)); }
  // don phien het han
  var s = sh_('Sessions'), v = s.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) if (new Date(v[i][4]) < new Date()) s.deleteRow(i + 1);
}
function dailyBackup() {
  var folder = DriveApp.getFolderById(P_().getProperty('BACKUP_FOLDER_ID')), out = { at: nowIso_(), version: VERSION, sheets: {} };
  Object.keys(SHEETS).forEach(function (n) { if (n !== 'Sessions') out.sheets[n] = sh_(n).getDataRange().getValues(); });
  folder.createFile('kk-mall-backup-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmm') + '.json', JSON.stringify(out), 'application/json');
  var files = [], it = folder.getFiles(); while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); }).slice(60).forEach(function (f) { f.setTrashed(true); });
  log_('backup', 'system', 'ok');
  try { dailyAudit(); } catch (e) { log_('audit_error', 'system', String(e && e.message || e)); }
  try { retention_(); } catch (e) { log_('retention_error', 'system', String(e && e.message || e)); }
}

/* =========================== LƯU TRỮ CÓ THỜI HẠN & AN TOÀN DỮ LIỆU ===========================
 * retention_: tai khoan 24 thang khong dang nhap va khong co don -> bao truoc 30 ngay -> an danh hoa ho so (email, ten, SDT, dia chi),
 *   thu hoi phien. Chung tu don hang GIU NGUYEN 10 nam theo Luat Ke toan (Dieu khoan dich vu muc 8.1, 9.2; ho so DPIA muc 4).
 * shareCheck_: Sheet, thu muc Drive, du an Apps Script phai o che do rieng tu, khong co nguoi xem/sua khac chu so huu. */
var RETAIN_MONTHS = 24, RETAIN_WARN_DAYS = 30;
function retention_(now) {
  now = now || Date.now(); var admins = adminEmails_(), out = { warned: 0, deleted: 0, checked: 0 }, DAY = 86400e3, LIMIT = RETAIN_MONTHS * 30.4375 * DAY;
  var lastOrder = {}; rows_('Orders').forEach(function (r) { var d = parseData_(r), t = new Date(r.created_at).getTime() || 0; [String(r.email || '').toLowerCase(), String(d.member || '').toLowerCase()].forEach(function (e) { if (e && t > (lastOrder[e] || 0)) lastOrder[e] = t; }); });
  rows_('Members').forEach(function (m) {
    var email = String(m.email || '').toLowerCase(); if (!email || m.role === 'deleted' || m.role === 'admin' || admins.indexOf(email) >= 0) return;
    var last = Math.max(new Date(m.last_login || 0).getTime() || 0, new Date(m.created_at || 0).getTime() || 0, lastOrder[email] || 0); if (!last) return;
    out.checked++; var idle = now - last, d = parseData_(m);
    if (idle < LIMIT - RETAIN_WARN_DAYS * DAY) { if (d.retention_warn_at) { delete d.retention_warn_at; update_('Members', m._row, { data: JSON.stringify(d) }); } return; } // da hoat dong lai -> huy canh bao
    if (!d.retention_warn_at) {
      d.retention_warn_at = nowIso_(); update_('Members', m._row, { data: JSON.stringify(d) }); out.warned++;
      mail_(email, 'Tài khoản KK-MALL sẽ được xóa sau 30 ngày nếu không đăng nhập', '<p>Tài khoản <b>' + esc_(email) + '</b> đã không đăng nhập và không có đơn hàng trong gần 24 tháng. Theo Điều khoản dịch vụ và Chính sách bảo vệ dữ liệu cá nhân (lưu trữ có thời hạn), KK-MALL sẽ xóa hồ sơ tài khoản (họ tên, số điện thoại, địa chỉ mặc định) sau <b>30 ngày</b> nữa nếu bạn không đăng nhập lại. Chứng từ của các đơn đã phát sinh vẫn được lưu theo Luật Kế toán.</p><p><a href="' + cfg_('SITE') + '/">Đăng nhập để giữ tài khoản →</a></p>');
      return;
    }
    if (idle >= LIMIT && (now - new Date(d.retention_warn_at).getTime()) >= (RETAIN_WARN_DAYS - 2) * DAY) {
      var anon = 'da-xoa-' + sha_(email).slice(0, 16) + '@xoa.kk-mall.invalid';
      update_('Members', m._row, { email: anon, name: '', phone: '', address: '', role: 'deleted', data: JSON.stringify({ deleted_at: nowIso_(), reason: 'retention_24m' }) });
      var sh = sh_('Sessions'), v = sh.getDataRange().getValues(); for (var i = v.length - 1; i >= 1; i--) if (String(v[i][1]).toLowerCase() === email) sh.deleteRow(i + 1);
      mail_(email, 'KK-MALL đã xóa tài khoản không hoạt động 24 tháng', '<p>Hồ sơ tài khoản <b>' + esc_(email) + '</b> (họ tên, số điện thoại, địa chỉ mặc định, phiên đăng nhập) đã được xóa vì không hoạt động trong 24 tháng, theo Điều khoản dịch vụ mục 8 và 9. Chứng từ đơn hàng được lưu theo Luật Kế toán và chỉ dùng cho nghĩa vụ kế toán, thuế, bảo hành. Bạn có thể đăng ký lại bất kỳ lúc nào.</p>');
      log_('member_retention_delete', 'system', anon + ' (24 thang khong hoat dong)'); out.deleted++;
    }
  });
  if (out.warned || out.deleted) log_('retention', 'system', JSON.stringify(out));
  return out;
}
function shareCheck_() {
  var P = P_(), out = [], scriptId = ''; try { scriptId = ScriptApp.getScriptId(); } catch (e) { }
  [['Bảng tính dữ liệu', P.getProperty('SHEET_ID'), 'file'], ['Thư mục sao lưu', P.getProperty('BACKUP_FOLDER_ID'), 'folder'], ['Thư mục ảnh đổi trả', P.getProperty('RMA_FOLDER_ID'), 'folder'], ['Dự án Apps Script', scriptId, 'file']].forEach(function (it) {
    if (!it[1]) return;
    try {
      var f = it[2] === 'folder' ? DriveApp.getFolderById(it[1]) : DriveApp.getFileById(it[1]), acc = String(f.getSharingAccess()), who = [];
      f.getEditors().forEach(function (u) { who.push(u.getEmail() + ' (sửa)'); }); f.getViewers().forEach(function (u) { who.push(u.getEmail() + ' (xem)'); });
      if (acc !== 'PRIVATE' || who.length) out.push({ lvl: 'high', code: '', msg: it[0] + ' đang được chia sẻ (' + acc + (who.length ? ': ' + who.join(', ') : '') + ') → thu hồi ngay: chỉ tài khoản chủ sở hữu được truy cập dữ liệu khách' });
    } catch (e) { out.push({ lvl: 'med', code: '', msg: 'Không kiểm tra được quyền chia sẻ ' + it[0] + ': ' + String(e && e.message || e).slice(0, 80) }); }
  });
  return out;
}

/* =========================== SỰ CỐ DỮ LIỆU CÁ NHÂN (quy trình 72 giờ) ===========================
 * Luat BVDLCN 2025 D.23: thong bao Cuc A05 trong 72 gio ke tu khi phat hien vi pham co the gay ton hai; Luat BVQLNTD 2023 D.19 k3:
 * thong bao nguoi tieu dung trong 24 gio khi he thong bi tan cong. Mo su co -> ghi so + noi chuoi + email quan tri kem han chot & viec can lam. */
var INCIDENT_KINDS = { leak: 'Lộ / rò rỉ dữ liệu cá nhân', attack: 'Hệ thống bị tấn công', loss: 'Mất / hỏng dữ liệu', misuse: 'Truy cập, sử dụng trái phép', other: 'Khác' };
function fmtVn_(d) { return Utilities.formatDate(new Date(d), 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM/yyyy'); }
function incidentOut_(r) { var d = parseData_(r); return { id: r.id, at: r.at, by: r.by, kind: r.kind, kind_text: INCIDENT_KINDS[r.kind] || r.kind, severity: r.severity, status: r.status, detected_at: r.detected_at, summary: r.summary, affected: d.affected || '', deadline_a05: d.deadline_a05 || '', deadline_users: d.deadline_users || '', notified_a05_at: d.notified_a05_at || '', notified_users_at: d.notified_users_at || '', log: d.log || [], updated_at: r.updated_at }; }
function incidentMail_(id, kind, sev, detected, summary, data) {
  return '<p>Sự cố <b>' + esc_(id) + '</b> (' + esc_(INCIDENT_KINDS[kind]) + ', mức ' + esc_(sev) + ') phát hiện lúc <b>' + fmtVn_(detected) + '</b>.</p><p>' + esc_(summary) + '</p>' + (data.affected ? '<p>Phạm vi ảnh hưởng: ' + esc_(data.affected) + '</p>' : '')
    + '<p><b>Việc phải làm theo quy trình thông báo vi phạm (docs/phap-ly/QUY-TRINH-NOI-BO-BVDLCN.md):</b></p><ol>'
    + '<li><b>Ngay:</b> khoanh vùng - đổi khóa webhook, khóa bot, mật khẩu quản trị; thu hồi mọi chia sẻ Sheet/Drive; tắt công tắc bot nếu nghi ngờ; xuất sheet Log và Chain, chụp màn hình làm bằng chứng.</li>'
    + '<li><b>Trước ' + fmtVn_(data.deadline_users) + ' (24 giờ - Luật BVQLNTD 2023 Đ.19 khoản 3, khi hệ thống bị tấn công):</b> email khách bị ảnh hưởng: dữ liệu nào, thời điểm, biện pháp đã làm, việc khách nên làm, đầu mối liên hệ.</li>'
    + '<li><b>Trước ' + fmtVn_(data.deadline_a05) + ' (72 giờ - Luật BVDLCN 2025 Đ.23; NĐ 356/2025):</b> gửi Thông báo vi phạm quy định bảo vệ dữ liệu cá nhân tới Cục A05 Bộ Công an qua Cổng Dịch vụ công: mô tả vi phạm, thời điểm, loại dữ liệu, số chủ thể, hậu quả, biện pháp đã và sẽ làm, đầu mối.</li>'
    + '<li>Khắc phục, lập biên bản, cập nhật trạng thái tại Quản trị → Hệ thống → Sự cố dữ liệu (đánh dấu đã thông báo A05 / khách); lưu hồ sơ 10 năm.</li></ol>';
}
function adminIncident_(b) {
  var s = session_(b.token, true);
  if (b.id) {
    var r = find_('Incidents', 'id', str_(b.id, 20)); if (!r) throw err_('Không tìm thấy sự cố', 404);
    var st = ['open', 'contained', 'notified', 'closed'].indexOf(b.status) >= 0 ? b.status : r.status, d = parseData_(r);
    (d.log = d.log || []).push({ at: nowIso_(), by: s.email, status: st, note: str_(b.note, 1000) });
    if (b.notified_a05 === true && !d.notified_a05_at) d.notified_a05_at = nowIso_(); if (b.notified_users === true && !d.notified_users_at) d.notified_users_at = nowIso_();
    update_('Incidents', r._row, { status: st, data: JSON.stringify(d), updated_at: nowIso_() });
    chain_('incident', r.id, { id: r.id, status: st, by: s.email, at: nowIso_(), a05: !!d.notified_a05_at, users: !!d.notified_users_at });
    log_('incident_update', s.email, r.id + ' ' + st); return { ok: true, incident: incidentOut_(find_('Incidents', 'id', r.id)) };
  }
  var kind = INCIDENT_KINDS[b.kind] ? b.kind : 'other', sev = ['low', 'med', 'high'].indexOf(b.severity) >= 0 ? b.severity : 'high', summary = str_(b.summary, 2000);
  if (summary.length < 10) throw err_('Mô tả sự cố quá ngắn (tối thiểu 10 ký tự)');
  var detected = b.detected_at && isFinite(new Date(b.detected_at).getTime()) ? new Date(b.detected_at).toISOString() : nowIso_(), t0 = new Date(detected).getTime();
  var id = 'SC' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyMMdd') + rnd_().slice(0, 4).toUpperCase();
  var data = { affected: str_(b.affected, 500), deadline_a05: new Date(t0 + 72 * 3600e3).toISOString(), deadline_users: new Date(t0 + 24 * 3600e3).toISOString(), log: [{ at: nowIso_(), by: s.email, status: 'open', note: 'Mở sự cố' }] };
  append_('Incidents', { id: id, at: nowIso_(), by: s.email, kind: kind, severity: sev, status: 'open', detected_at: detected, summary: summary, data: JSON.stringify(data), updated_at: nowIso_() });
  chain_('incident', id, { id: id, kind: kind, severity: sev, detected_at: detected, by: s.email, at: nowIso_() });
  log_('incident_open', s.email, id + ' ' + kind + ' ' + sev);
  adminsMail_('🚨 SỰ CỐ DỮ LIỆU ' + id + ' - ' + INCIDENT_KINDS[kind] + ' - hạn báo A05: ' + fmtVn_(data.deadline_a05), incidentMail_(id, kind, sev, detected, summary, data));
  return { ok: true, id: id, incident: incidentOut_(find_('Incidents', 'id', id)) };
}

/* =========================== ĐỊNH TUYẾN HTTP =========================== */
/* =========================== TỪ KHÓA TÌM KHÔNG RA (ẩn danh) ===========================
 * Trình duyệt khách gửi từ khóa cho 0 / rất ít kết quả hoặc khách bấm "Tìm giúp tôi": chỉ lưu CỤM TỪ (không email, SĐT, link,
 * không định danh người gửi) để KK-MALL bổ sung nguồn hàng / từ đồng nghĩa. Ghi đệm vào bộ nhớ đệm, gộp vào Sheet mỗi giờ.
 */
function searchMiss_(b) {
  var q = str_(b.q, 120).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2 || /@|https?:|www\.|\d{8,}|(\d[\s.-]?){9,}/.test(q)) return { ok: true };   // co dang du lieu ca nhan -> bo
  if (rateFixed_('smiss', 400, 3600)) return { ok: true };                                    // tran: bo qua im lang (khong anh huong khach)
  var kind = b.kind === 'request' ? 'request' : 'zero', n = Math.max(0, Math.min(99999, Math.round(Number(b.n) || 0)));
  var c = CacheService.getScriptCache(), lk = LockService.getScriptLock(); if (!lk.tryLock(3000)) return { ok: true };
  try {
    var buf = []; try { buf = JSON.parse(c.get('smq') || '[]'); } catch (e) { buf = []; }
    if (buf.length < 400) buf.push([q, kind, n, nowIso_()]);
    c.put('smq', JSON.stringify(buf), 21600);
  } finally { lk.releaseLock(); }
  return { ok: true };
}
function flushSearchMiss_() {
  var c = CacheService.getScriptCache(), lk = LockService.getScriptLock(); if (!lk.tryLock(20000)) return 0;
  try {
    var buf = []; try { buf = JSON.parse(c.get('smq') || '[]'); } catch (e) { buf = []; }
    if (!buf.length) return 0;
    var agg = {}; buf.forEach(function (x) { var k = x[0] + '|' + x[1], a = agg[k] || (agg[k] = { q: x[0], kind: x[1], n: 0, results: x[2], first: x[3], last: x[3] }); a.n++; a.results = x[2]; if (x[3] > a.last) a.last = x[3]; if (x[3] < a.first) a.first = x[3]; });
    var cur = {}; rows_('SearchMiss').forEach(function (r) { cur[String(r.q) + '|' + r.kind] = r; });
    Object.keys(agg).forEach(function (k) { var a = agg[k], r = cur[k];
      if (r) update_('SearchMiss', r._row, { n: (Number(r.n) || 0) + a.n, results: a.results, last_at: a.last });
      else append_('SearchMiss', { q: a.q, kind: a.kind, n: a.n, results: a.results, first_at: a.first, last_at: a.last }); });
    c.remove('smq'); return buf.length;
  } finally { lk.releaseLock(); }
}
function doGet(e) {
  var a = (e && e.parameter && e.parameter.a) || 'config';
  try {
    if (a === 'config') return json_(publicConfig_());
    if (a === 'health') return json_({ ok: true, version: VERSION, at: nowIso_() });
    if (a === 'approve') return approveGet_(e.parameter);
    if (a === 'terms') return json_(termsPublic_());
    if (a === 'chainhead') { var ch = chainHead_(); return json_({ seq: ch.seq, hash: ch.hash, at: ch.at, algo: 'sha256(prev|seq|at|kind|ref|sha256(canon(payload)))' }); }
    if (a === 'reviews') return json_(reviewList_(e.parameter.sku));
    if (a === 'shipstats') return json_(shipStats_(e.parameter.key));
    return json_({ error: 'Không hỗ trợ' });
  } catch (x) {
    if (x.code) return json_({ error: x.message, code: x.code });
    try { log_('error', a, String(x && x.stack || x).slice(0, 1500)); } catch (e) { }
    return json_({ error: 'Hệ thống đang bận, vui lòng thử lại', code: 500 }); // khong lo thong bao loi noi bo
  }
}
function publicConfig_() {
  var c = company_(), b = bank_();
  var T = termsActive_();
  return { version: VERSION, consent_version: T.version, terms: { active: T.version, label: T.label, kind: T.kind, effective: T.effective || '', url: T.url, contract_url: T.contract_url, versions: termsList_().map(function (x) { return { version: x.version, label: x.label, effective: x.effective || '', published: x.published }; }) }, company: c, bank_ready: b.ready, fee_table: feeTable_(), vat_rate: Number(cfg_('VAT_RATE')), return_days: Number(cfg_('RETURN_DAYS')), unpaid_hours: Number(cfg_('UNPAID_HOURS')), vouchers: VOUCHERS.map(function (v) { return { code: v.code, title: v.title }; }), voucher_fee_cap_pct: Number(cfg_('VOUCHER_FEE_CAP_PCT')) };
}
function doPost(e) {
  var b = {}, a = (e && e.parameter && e.parameter.a) || '';
  if (a === 'approve' && e.parameter.t) return approvePost_(e.parameter); // form POST tu trang xac nhan duyet (khong phai JSON)
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ error: 'Dữ liệu không hợp lệ', code: 400 }); }
  a = b.a || a;
  try {
    var R = {
      'config': function () { return publicConfig_(); },
      'quote': function () { return quote_(b.items, b.voucher_codes, !!b.fresh); },
      'order.create': function () { return orderCreate_(b); },
      'order.get': function () { return orderGet_(b); },
      'order.paid_claim': function () { return paidClaim_(b); },
      'order.refund_account': function () { return refundAccount_(b); },
      'order.contract': function () { return orderContract_(b); },
      'terms': function () { return termsPublic_(); },
      'member.marketing': function () { var s0 = session_(b.token); memberMarketing_(s0.email, b.on === true, termsActive_().version); return { ok: true, marketing: b.on === true }; },
      'admin.incident': function () { return adminIncident_(b); },
      'admin.incidents': function () { return adminList_(b, 'Incidents', incidentOut_); },
      'admin.retention': function () { session_(b.token, true); return retention_(); },
      'review.submit': function () { return reviewSubmit_(b); },
      'review.list': function () { return reviewList_(b.sku); },
      'reviews.stats': function () { return reviewStats_(); },
      'search.miss': function () { return searchMiss_(b); },
      'admin.searchmiss': function () { session_(b.token, true); flushSearchMiss_(); return { rows: rows_('SearchMiss').map(function (r) { return { q: String(r.q), kind: r.kind, n: Number(r.n) || 0, results: Number(r.results) || 0, first_at: r.first_at, last_at: r.last_at }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 500) }; },
      'admin.reviews': function () { return adminList_(b, 'Reviews', function (r) { return { id: r.id, sku: r.sku, order_code: r.order_code, rating: r.rating, content: r.content, name: r.name, status: r.status, created_at: r.created_at, product: parseData_(r).product || '' }; }); },
      'admin.review.update': function () { return adminReviewUpdate_(b); },
      'admin.audit': function () { session_(b.token, true); return audit_(); },
      'admin.chain': function () { session_(b.token, true); return chainVerify_(); },
      'orders.mine': function () { return ordersMine_(b); },
      'otp.request': function () { return otpRequest_(b); },
      'otp.verify': function () { return otpVerify_(b); },
      'me': function () { var s = session_(b.token); return { member: memberOut_(find_('Members', 'email', s.email)) }; },
      'member.update': function () { return memberUpdate_(b); },
      'member.export': function () { return memberExport_(b); },
      'member.delete': function () { return memberDelete_(b); },
      'logout': function () { return logout_(b); },
      'rma.create': function () { return rmaCreate_(b); },
      'warranty': function () { var p = product_(b.sku); return { warranty: warrantyFor_(p.brand, p.category_id), brand: p.brand }; },
      'webhook': function () { return webhook_(b, e.parameter && e.parameter.key); },
      'shipstats': function () { return shipStats_(b.key); },
      'admin.orders': function () { return adminOrders_(b); },
      'admin.order.update': function () { return adminOrderUpdate_(b); },
      'admin.po.update': function () { return adminPoUpdate_(b); },
      'admin.rma.update': function () { return adminRmaUpdate_(b); },
      'admin.invoice.issue': function () { return adminInvoiceIssue_(b); },
      'admin.ledger': function () { return adminList_(b, 'Ledger', function (r) { return { at: r.at, order_code: r.order_code, ref: r.ref, debit: r.debit, credit: r.credit, amount: r.amount, note: r.note }; }); },
      'admin.invoices': function () { return adminList_(b, 'Invoices', invOut_); },
      'admin.rmas': function () { return adminList_(b, 'RMA', rmaOut_); },
      'admin.members': function () { return adminList_(b, 'Members', function (m) { return { email: m.email, name: m.name, phone: m.phone, address: m.address, role: m.role, created_at: m.created_at, last_login: m.last_login }; }); },
      'admin.config': function () { return adminConfig_(b); },
      'admin.stats': function () { return adminStats_(b); },
      'admin.backup': function () { session_(b.token, true); dailyBackup(); return { ok: true }; },
      'bot.queue': function () { return botQueue_(b); },
      'bot.update': function () { return botUpdate_(b); },
      'admin.botkey': function () { return adminBotKey_(b); },
      'admin.po.botreset': function () { return adminPoBotReset_(b); },
      'admin.mailsync': function () { var s2 = session_(b.token, true), lk = LockService.getScriptLock(); lk.waitLock(25000); try { var r2 = mailSync_({ by: s2.email }); r2.info = mailSyncInfo_(); return r2; } finally { lk.releaseLock(); } }
    };
    if (!R[a]) throw err_('Thao tác không hỗ trợ: ' + a, 404);
    return json_(R[a]());
  } catch (x) {
    if (x.code) return json_({ error: x.message, code: x.code });
    try { log_('error', a, String(x && x.stack || x).slice(0, 1500)); } catch (e) { }
    return json_({ error: 'Hệ thống đang bận, vui lòng thử lại', code: 500 }); // khong lo thong bao loi noi bo
  }
}

/* =========================== KHỞI TẠO (chạy 1 lần trong trình soạn thảo) =========================== */
function setup() {
  var p = P_();
  if (!p.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('KK-MALL Backend - Don hang & Ke toan');
    p.setProperty('SHEET_ID', ss.getId());
    var first = ss.getSheets()[0]; first.setName('Orders'); first.appendRow(SHEETS.Orders); first.setFrozenRows(1);
  }
  Object.keys(SHEETS).forEach(function (n) { sh_(n); });
  var root;
  if (!p.getProperty('BACKUP_FOLDER_ID')) { root = DriveApp.createFolder('KK-MALL Backend'); p.setProperty('ROOT_FOLDER_ID', root.getId()); p.setProperty('BACKUP_FOLDER_ID', root.createFolder('Sao luu hang ngay').getId()); p.setProperty('RMA_FOLDER_ID', root.createFolder('Doi tra - anh video').getId()); DriveApp.getFileById(p.getProperty('SHEET_ID')).moveTo(root); }
  if (!p.getProperty('WEBHOOK_KEY')) p.setProperty('WEBHOOK_KEY', rnd_());
  if (!p.getProperty('STATS_KEY')) p.setProperty('STATS_KEY', rnd_());
  pepper_();
  if (!p.getProperty('PRICING_TIERS')) p.setProperty('PRICING_TIERS', '500001:32000,200000:26000,0:18000'); // bieu phi dich vu (chi nam trong du an Apps Script rieng tu)
  if (!rows_('Warranty').length) WARRANTY_SEED.forEach(function (w) { append_('Warranty', w); });
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('mailSync').timeBased().everyMinutes(15).create(); // dong bo lenh mua tu email nguon (Tiki)
  Logger.log('KK-MALL backend OK. Sheet: ' + ss_().getUrl());
}
var WARRANTY_SEED = [
  { brand: 'Samsung', hotline: '1800 588 889', url: 'https://www.samsung.com/vn/support/service-center/', confidence: 'high' },
  { brand: 'Apple', hotline: '1800 1127', url: 'https://support.apple.com/vi-vn/contact', confidence: 'high' },
  { brand: 'LG', hotline: '1800 1503', url: 'https://www.lg.com/vn/tro-giup/lien-he-voi-chung-toi/trung-tam-dich-vu/', confidence: 'high' },
  { brand: 'Sony', hotline: '', url: 'https://locator.sony/?locale=vi_VN&profile=consumer/customer_support/ap', confidence: 'medium', note: 'Tra cứu trung tâm trên trang Sony' },
  { brand: 'Panasonic', hotline: '1800 1593', url: 'https://www.panasonic.com/vn/support/service-center.html', confidence: 'high' },
  { brand: 'Toshiba', hotline: '1800 1529', url: 'https://www.toshiba-lifestyle.com/vn/service-center', confidence: 'high' },
  { brand: 'Sharp', hotline: '1800 1599', url: 'https://vn.sharp/chinh-sach-bao-hanh', confidence: 'high' },
  { brand: 'Xiaomi', hotline: '1800 400 410', url: 'https://www.mi.com/vn/support/service-centre/', confidence: 'high' },
  { brand: 'OPPO', hotline: '1800 588 841', url: 'https://support.oppo.com/vn/service-center/', confidence: 'high' },
  { brand: 'vivo', hotline: '1800 6101', url: 'https://www.vivo.com/vn/support/serviceCenter', confidence: 'high' },
  { brand: 'realme', hotline: '1800 6067', url: 'https://www.realme.com/vn/support/services', confidence: 'high' },
  { brand: 'Asus', hotline: '1800 6588', url: 'https://www.asus.com/vn/support/Service-Center/Vietnam', confidence: 'high' },
  { brand: 'Acer', hotline: '1900 969 601', url: 'https://www.acer.com/vn-vi/support/warranty/service-center', confidence: 'high' },
  { brand: 'Dell', hotline: '', url: 'https://www.dell.com/support/incidents-online/en-vn/contactus/dynamic', confidence: 'medium' },
  { brand: 'HP', hotline: '', url: 'https://support.hp.com/vn-en/help/service-center', confidence: 'medium' },
  { brand: 'Lenovo', hotline: '1800 6318', url: 'https://lenovo.com/vn/vi/contact', confidence: 'high' },
  { brand: 'MSI', hotline: '', url: 'https://vn.msi.com/page/service-location-new', confidence: 'medium' },
  { brand: 'Daikin', hotline: '1800 6777', url: 'https://www.daikin.com.vn/dich-vu/mang-luoi-trung-tam-dich-vu', confidence: 'high' },
  { brand: 'Aqua', hotline: '1800 585 832', url: 'https://aquavietnam.com.vn/tram-bao-hanh', confidence: 'high' },
  { brand: 'Electrolux', hotline: '1800 588 899', url: 'https://www.electrolux.vn/ho-tro/dang-ky-bao-hanh-truc-tuyen/', confidence: 'high' },
  { brand: 'Philips', hotline: '1800 599 988', url: 'https://www.philips.com.vn/c-s/support/contact', confidence: 'medium', note: 'Gọi tổng đài để xác nhận' },
  { brand: 'Sunhouse', hotline: '1800 6680', url: 'https://sunhouse.com.vn/bao-hanh', confidence: 'high' },
  { brand: 'Kangaroo', hotline: '1900 555 566', url: 'https://baohanhdientu.kangaroo.vn/', confidence: 'high' },
  { brand: 'Karofi', hotline: '1900 6418', url: 'https://baohanh.karofi.com/', confidence: 'high' },
  { brand: 'Midea', hotline: '1800 588 863', url: 'https://www.midea.com/vn/support', confidence: 'high' },
  { brand: 'Casper', hotline: '1800 6644', url: 'https://casper-electric.com/help-support/mang-luoi-tram-bao-hanh-uy-quyen/', confidence: 'high' },
  { brand: 'TCL', hotline: '1800 588 880', url: 'https://www.tcl.com/vn/vi/warranty', confidence: 'high' },
  { brand: 'Hisense', hotline: '1800 888 877', url: 'https://hisense.vn/trung-tam-bao-hanh/', confidence: 'high' },
  { brand: 'Canon', hotline: '028 3820 0466', url: 'https://vn.canon/vi/consumer/contact-us', confidence: 'medium' },
  { brand: 'Epson', hotline: '', url: 'https://www.epson.com.vn/Support/ServiceCenterLocator', confidence: 'high' },
  { brand: 'Brother', hotline: '1900 6062', url: 'https://www.brother.com.vn/vi-vn/support/contact', confidence: 'high' },
  { brand: 'Logitech', hotline: '', url: 'https://support.logi.com/hc/vi', confidence: 'high' },
  { brand: 'Marshall', hotline: '', url: 'https://www.marshall.com/vn/en/support/warranty', confidence: 'high' },
  { brand: 'Garmin', hotline: '028 5414 3890', url: 'https://support.garmin.com/vi-VN/', confidence: 'high' },
  { brand: 'Huawei', hotline: '', url: 'https://consumer.huawei.com/vn/support/service-center/', confidence: 'high' },
  { brand: 'Lock&Lock', hotline: '1900 5351', url: 'https://www.locknlock.vn/vi-vn/stores', confidence: 'high' },
  { brand: 'Tefal', hotline: '1800 555 521', url: 'https://www.tefal.com.vn/pages/repairer-list', confidence: 'high' },
  { brand: 'Bluestone', hotline: '1800 545 494', url: 'https://www.bluestone.com.vn/pages/bao-hanh-va-lap-dat', confidence: 'high' }
];
