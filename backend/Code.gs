/**
 * KK-MALL BACKEND - Google Apps Script Web App
 * Mô hình: Nền tảng công nghệ MUA HỘ & tối ưu giá (thu hộ tiền hàng - chi hộ nhà cung cấp, thu phí dịch vụ).
 *  - Đơn hàng, thành viên (OTP email), lệnh mua (PO), đổi trả / bảo hành (RMA), sổ kế toán (TK 1121/3388/5113/33311/632),
 *    hóa đơn phí dịch vụ, cấu hình - lưu trên Google Sheet của chủ sở hữu.
 *  - Sao lưu 2 nơi: Google Sheet (bản sống) + bản JSON hằng ngày trong thư mục Google Drive (giữ 60 bản).
 *  - Bảo mật: OTP 6 số băm SHA-256 + pepper, hết hạn 10 phút, tối đa 5 lần thử, giới hạn tần suất;
 *    phiên đăng nhập token 256-bit chỉ lưu dạng băm; quyền quản trị chỉ theo ADMIN_EMAILS (Script Properties);
 *    chống chèn công thức vào Sheet; khóa ghi đồng thời (LockService); giá luôn tính lại phía máy chủ.
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */

/* =========================== CẤU HÌNH =========================== */
var VERSION = '1.4.1';
var CONSENT_VERSION = 'UQ-2026-10';
var SHEETS = {
  Orders: ['code', 'created_at', 'status', 'payment_status', 'email', 'phone', 'name', 'goods', 'fee', 'total', 'paid_at', 'data', 'updated_at'],
  PO: ['po_id', 'order_code', 'sku', 'name', 'qty', 'status', 'collected_cost', 'actual_source', 'actual_cost', 'supplier_order_id', 'tracking', 'data', 'updated_at'],
  Members: ['email', 'name', 'phone', 'address', 'role', 'created_at', 'last_login', 'data'],
  Sessions: ['token_hash', 'email', 'role', 'created_at', 'expires_at'],
  RMA: ['rma_id', 'order_code', 'sku', 'type', 'status', 'reason', 'created_at', 'data', 'updated_at'],
  Ledger: ['at', 'order_code', 'ref', 'debit', 'credit', 'amount', 'note'],
  Invoices: ['inv_id', 'order_code', 'created_at', 'status', 'buyer', 'tax_code', 'content', 'pre_tax', 'vat_rate', 'vat', 'total', 'data'],
  Warranty: ['brand', 'hotline', 'url', 'confidence', 'note'],
  Log: ['at', 'action', 'actor', 'detail']
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
  COMPANY_JSON: '{}'
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
  var cur = s.getRange(row, 1, 1, h.length).getValues()[0];
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
function company_() { var c = {}; try { c = JSON.parse(cfg_('COMPANY_JSON') || '{}'); } catch (e) { } return c; }
function mail_(to, subject, html) {
  try {
    var c = company_();
    MailApp.sendEmail({ to: to, subject: subject, name: c.short || 'KK-MALL', htmlBody: '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#0F172A;line-height:1.55">'
      + '<div style="background:#1E3A8A;color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;font-weight:800;font-size:18px">KK-MALL</div><div style="border:1px solid #E2E8F0;border-top:0;padding:18px 20px;border-radius:0 0 12px 12px">'
      + html + '<hr style="border:0;border-top:1px solid #E2E8F0;margin:18px 0"><div style="font-size:12px;color:#64748B">' + esc_(c.name || 'KK-MALL') + (c.tax ? ' · MST ' + esc_(c.tax) : '') + (c.phone ? ' · ' + esc_(c.phone) : '') + ' · ' + cfg_('SITE') + '</div></div></div>' });
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
  var c = CacheService.getScriptCache(), n = parseInt(c.get(key) || '0', 10);
  if (n >= max) throw err_('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút', 429);
  c.put(key, String(n + 1), sec);
}
function otpCode_() { var h = Utilities.getUuid().replace(/-/g, ''); return String(100000 + (parseInt(h.slice(0, 12), 16) % 900000)); } // nguon ngau nhien an toan (SecureRandom)
function mailBudget_(reserve) { try { return MailApp.getRemainingDailyQuota() > reserve; } catch (e) { return true; } }
// chong do mo ma don + SDT: dem lan sai theo ma don va toan he thong
function guardCheck_(code) { var c = CacheService.getScriptCache(); if (parseInt(c.get('gf_' + code) || '0', 10) >= 8 || parseInt(c.get('gf_all') || '0', 10) >= 500) throw err_('Tra cứu sai quá nhiều lần - vui lòng thử lại sau 1 giờ', 429); }
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
  if (rateFixed_('otp_all', 40, 3600)) throw err_('Hệ thống đang nhận nhiều yêu cầu, vui lòng thử lại sau ít phút', 429);
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
  var email = str_(b.email, 120).toLowerCase(), code = str_(b.code, 6);
  var c = CacheService.getScriptCache(), raw = c.get('otp_' + email);
  if (!raw) throw err_('Mã đã hết hạn hoặc chưa được gửi', 401);
  var o = JSON.parse(raw);
  if (o.t >= 5) { c.remove('otp_' + email); throw err_('Nhập sai quá 5 lần - vui lòng lấy mã mới', 401); }
  var hc = hash_(email + '|' + code), prevOk = o.p && o.p.h === hc && Date.now() - o.p.at < 600000;
  if (hc !== o.h && !prevOk) { o.t = (o.t || 0) + 1; c.put('otp_' + email, JSON.stringify(o), 600); throw err_('Mã xác thực không đúng' + (o.t >= 3 ? ' (còn ' + (5 - o.t) + ' lần thử)' : ''), 401); }
  c.remove('otp_' + email);
  var isAdm = adminEmails_().indexOf(email) >= 0, role = isAdm && b.scope === 'admin' ? 'admin' : 'member'; // quyen quan tri chi cap khi dang nhap tu /admin
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = find_('Members', 'email', email);
    var mrole = isAdm ? 'admin' : 'member';
    if (!m) append_('Members', { email: email, name: str_(b.name, 100), phone: normPhone_(b.phone), address: str_(b.address, 300), role: mrole, created_at: nowIso_(), last_login: nowIso_(), data: '{}' });
    else update_('Members', m._row, { last_login: nowIso_(), role: mrole });
    var token = rnd_();
    append_('Sessions', { token_hash: hash_(token), email: email, role: role, created_at: nowIso_(), expires_at: new Date(Date.now() + (role === 'admin' ? 12 * 36e5 : 30 * 864e5)).toISOString() });
  } finally { lock.releaseLock(); }
  log_('login', email, role);
  if (role === 'admin') adminsMail_('🔐 Đăng nhập quản trị KK-MALL: ' + email, '<p>Tài khoản <b>' + esc_(email) + '</b> vừa đăng nhập trang quản trị lúc ' + new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' (phiên hiệu lực 12 giờ).</p><p>Nếu không phải bạn: đổi mật khẩu Google ngay và xóa các dòng phiên trong sheet Sessions.</p>');
  return { token: token, member: memberOut_(find_('Members', 'email', email)) };
}
function memberOut_(m) { return m ? { email: m.email, name: m.name, phone: m.phone, address: m.address, role: m.role } : null; }
function session_(token, needAdmin) {
  if (!token) throw err_('Vui lòng đăng nhập', 401);
  var s = find_('Sessions', 'token_hash', hash_(str_(token, 100)));
  if (!s || new Date(s.expires_at) < new Date()) throw err_('Phiên đăng nhập đã hết hạn', 401);
  if (needAdmin && (s.role !== 'admin' || adminEmails_().indexOf(String(s.email).toLowerCase()) < 0)) throw err_('Không có quyền quản trị', 403);
  return s;
}
function memberUpdate_(b) {
  var s = session_(b.token), m = find_('Members', 'email', s.email);
  var ph = normPhone_(b.phone); if (b.phone && !/^0\d{9}$/.test(ph)) throw err_('Số điện thoại không hợp lệ');
  update_('Members', m._row, { name: str_(b.name, 100) || m.name, phone: ph || m.phone, address: str_(b.address, 300) || m.address });
  return { member: memberOut_(find_('Members', 'email', s.email)) };
}
function logout_(b) { var s = find_('Sessions', 'token_hash', hash_(str_(b.token, 100))); if (s) update_('Sessions', s._row, { expires_at: nowIso_() }); return { ok: true }; }

/* =========================== ĐƠN HÀNG =========================== */
function newCode_() { var d = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyMMdd'); return 'KK' + d + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase(); }
function orderCreate_(b) {
  if (b.website) throw err_('Yêu cầu không hợp lệ'); // honeypot chong bot
  var c = b.customer || {};
  var name = str_(c.name, 100), phone = normPhone_(c.phone), email = str_(c.email, 120).toLowerCase(), addr = str_(c.address, 300);
  if (name.length < 2) throw err_('Vui lòng nhập họ tên người nhận');
  if (!/^0\d{9}$/.test(phone)) throw err_('Số điện thoại không hợp lệ');
  if (!isEmail_(email)) throw err_('Email không hợp lệ (dùng để nhận hóa đơn)');
  if (addr.length < 10) throw err_('Địa chỉ nhận hàng chưa đầy đủ');
  if (b.consent !== true || b.consent_version !== CONSENT_VERSION) throw err_('Bạn cần đồng ý Điều khoản dịch vụ và Ủy quyền mua hộ - thanh toán hộ');
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
    payment_method: 'vietqr', consent: { version: CONSENT_VERSION, at: nowIso_(), ua: str_(b.ua, 200) },
    price_lock: b.lock ? { at: b.lock.at ? new Date(Number(b.lock.at)).toISOString() : '', ms: b.lock.ms || null } : null,
    history: [{ at: nowIso_(), s: 'awaiting_payment', by: 'customer' }] };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { append_('Orders', { code: o.code, created_at: o.created_at, status: o.status, payment_status: o.payment_status, email: email, phone: phone, name: name, goods: o.goods, fee: o.fee_net, total: o.total, paid_at: '', data: JSON.stringify(o), updated_at: nowIso_() }); }
  finally { lock.releaseLock(); }
  mail_(email, 'KK-MALL đã nhận đơn ' + o.code + ' - vui lòng thanh toán', '<p>Chào <b>' + esc_(name) + '</b>,</p><p>KK-MALL đã nhận đơn <b>' + o.code + '</b>. Ngay khi nhận được thanh toán, hệ thống tự động đặt mua tại nhà cung cấp có giá tốt nhất và giao thẳng đến bạn.</p>' + orderTable_(o) + payBox_(o)
    + '<p style="font-size:13px;color:#475569">Hóa đơn GTGT tiền hàng do <b>nhà cung cấp</b> xuất trực tiếp cho bạn; KK-MALL xuất hóa đơn GTGT riêng cho <b>phí dịch vụ</b>. Đơn chưa thanh toán sau ' + cfg_('UNPAID_HOURS') + ' giờ sẽ tự hủy.</p><p><a href="' + cfg_('SITE') + '/?order=' + o.code + '&phone=' + phone + '">Theo dõi đơn hàng →</a></p>');
  adminsMail_('🆕 Đơn mới ' + o.code + ' - ' + vnd_(o.total) + ' (chờ thanh toán)', '<p>Đơn mới từ <b>' + esc_(name) + '</b> (' + maskPhone_(phone) + ').</p>' + orderTable_(o));
  log_('order_create', email, o.code + ' ' + o.total);
  return { order: publicOrder_(o), payment: payInfo_(o) };
}
function payInfo_(o) { var b = bank_(); return b.ready ? { type: 'vietqr', ready: true, bank: b.label, acc: b.acc, name: b.name, amount: o.total, content: o.code, qr: qrUrl_(o) } : { type: 'vietqr', ready: false, note: 'KK-MALL sẽ liên hệ gửi thông tin thanh toán' }; }
function publicOrder_(o, pos, invs, rmas) {
  return { code: o.code, created_at: o.created_at, status: o.status, status_text: ST[o.status] || o.status, payment_status: o.payment_status, paid_at: o.paid_at || '', paid_claim_at: o.paid_claim_at || '',
    customer: { name: o.customer.name, phone: maskPhone_(o.customer.phone), address: o.customer.address }, vat: o.vat ? { name: o.vat.name, tax_code: o.vat.tax_code } : null,
    lines: o.lines.map(function (l) { return { sku: l.sku, name: l.name, image: l.image, category_id: l.category_id, warranty_ok: WARRANTY_CATS.indexOf(l.category_id) >= 0, qty: l.qty, unit: l.unit, unit_cost: l.unit_cost, unit_fee: l.unit_fee, line_total: l.line_total, line_cost: l.line_cost, line_fee: l.line_fee }; }),
    goods: o.goods, fee: o.fee, discount: o.discount, vouchers: o.vouchers, fee_net: o.fee_net, fee_pre_tax: o.fee_pre_tax, fee_vat: o.fee_vat, total: o.total, refund_due: o.refund_due || 0,
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
function setStatus_(o, s, by, note) { o.status = s; (o.history = o.history || []).push({ at: nowIso_(), s: s, by: by || 'system', note: note || '' }); }
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
  if (o.payment_status === 'paid') return o;
  if (Number(amount) < o.total) throw err_('Số tiền nhận (' + vnd_(amount) + ') nhỏ hơn tổng đơn (' + vnd_(o.total) + ')');
  o.payment_status = 'paid'; o.paid_at = nowIso_(); o.payment_ref = str_(ref, 100); o.paid_amount = Number(amount);
  setStatus_(o, 'paid', by, 'Nhận ' + vnd_(amount));
  // SO KE TOAN: thu ho tien hang (3388) + doanh thu phi dich vu (5113) + VAT dau ra (33311)
  ledger_(o.code, o.payment_ref, '1121', '', o.total, 'Khách thanh toán đơn (VietQR)');
  ledger_(o.code, o.payment_ref, '', '3388', o.goods, 'Thu hộ tiền hàng cho nhà cung cấp');
  if (o.fee_pre_tax) ledger_(o.code, o.payment_ref, '', '5113', o.fee_pre_tax, 'Doanh thu phí dịch vụ mua hộ & xử lý đơn');
  if (o.fee_vat) ledger_(o.code, o.payment_ref, '', '33311', o.fee_vat, 'Thuế GTGT đầu ra phí dịch vụ ' + o.vat_rate + '%');
  if (Number(amount) > o.total) { o.refund_due = (o.refund_due || 0) + Number(amount) - o.total; ledger_(o.code, o.payment_ref, '', '3388', Number(amount) - o.total, 'Khách chuyển dư - phải trả lại khách'); }
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
function ledger_(code, ref, debit, credit, amount, note) { append_('Ledger', { at: nowIso_(), order_code: code, ref: ref || '', debit: debit, credit: credit, amount: amount, note: note }); }
function adminsMail_(subject, html) { adminEmails_().forEach(function (e) { mail_(e, subject, html); }); }
// Webhook SePay / Casso (cấu hình URL: <web app>?a=webhook&key=WEBHOOK_KEY). Nội dung CK phải chứa mã đơn.
function webhook_(b, key) {
  if (!key || key !== P_().getProperty('WEBHOOK_KEY')) throw err_('Sai khóa webhook', 403);
  var txs = b.data && b.data.length ? b.data : [b];
  var done = [];
  txs.forEach(function (t) {
    var amount = Number(t.transferAmount || t.amount || 0); if (t.transferType && t.transferType !== 'in') return;
    var m = String(t.content || t.description || '').toUpperCase().replace(/\s/g, '').match(/KK\d{6}[0-9A-F]{5}/);
    if (!m) return;
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { var o = loadOrder_(m[0]); markPaid_(o, amount, t.referenceCode || t.id || t.tid || '', 'bank-webhook'); done.push(m[0]); }
    catch (e) { log_('webhook_unmatched', '', m[0] + ' ' + e.message); } finally { lock.releaseLock(); }
  });
  return { success: true, matched: done };
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
  rate_('rma_' + o.code, 10, 86400);
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
      var amt = Number(b.amount || o.total);
      if (o.payment_status !== 'paid') throw err_('Đơn chưa thanh toán');
      o.refunded = (o.refunded || 0) + amt; if (o.refunded >= o.total) setStatus_(o, 'refunded', s.email, 'Hoàn ' + vnd_(amt) + ' - ' + str_(b.ref, 60)); else (o.history = o.history || []).push({ at: nowIso_(), s: o.status, by: s.email, note: 'Hoàn một phần ' + vnd_(amt) + ' - ' + str_(b.ref, 60) }); if (o.refund_due) o.refund_due = Math.max(0, o.refund_due - amt); saveOrder_(o);
      var goodsPart = Math.min(amt, o.goods), feePart = amt - goodsPart;
      ledger_(o.code, b.ref, '3388', '', goodsPart, 'Hoàn tiền hàng cho khách');
      if (feePart > 0) { var pre = Math.round(feePart / (1 + o.vat_rate / 100)); ledger_(o.code, b.ref, '5213', '', pre, 'Hoàn phí dịch vụ (giảm trừ doanh thu)'); ledger_(o.code, b.ref, '33311', '', feePart - pre, 'Điều chỉnh giảm thuế GTGT phí dịch vụ'); }
      ledger_(o.code, b.ref, '', '1121', amt, 'Chuyển hoàn tiền cho khách');
      mail_(o.customer.email, 'KK-MALL đã hoàn tiền đơn ' + o.code, '<p>KK-MALL đã hoàn <b>' + vnd_(amt) + '</b> cho đơn <b>' + o.code + '</b>. Mã giao dịch: ' + esc_(b.ref || '') + '.</p>');
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
    else if (st === 'cancelled') { d.cancel_reason = str_(b.note, 200); }
    else throw err_('Trạng thái không hợp lệ');
    upd.data = JSON.stringify(d); update_('PO', p._row, upd);
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
  var cand = pos.filter(function (p) { var o = orderOf(p.order_code); return p.status === 'to_order' && o && o.payment_status === 'paid' && phone_(o.customer.phone) === r.phone; });
  var out = [];
  cand.forEach(function (p) {
    var best = null, bs = 0;
    r.lines.forEach(function (l) { var sc = nameCover_(p.name, l.name); if (sc > bs) { bs = sc; best = l; } });
    if (best && bs >= 0.6) out.push({ po: p, line: best, score: bs });
    else if (!r.lines.length && nameCover_(p.name, r.text || '') >= 0.8) out.push({ po: p, line: null, score: 0.8 });
  });
  if (!out.length) return [];
  var linesSum = out.reduce(function (a, x) { return a + (x.line ? x.line.price * x.line.qty : 0); }, 0), sub = r.sub || linesSum, shipNet = Math.max(0, r.ship - r.shipDisc);
  if (out.some(function (x) { return !x.line; })) { if (out.length > 1 || !r.total) return []; return [{ po: out[0].po, cost: r.total, ship: shipNet, qty_ok: true }]; }
  return out.map(function (x) {
    var amt = x.line.price * x.line.qty, w = sub ? amt / sub : 1;
    var cost = r.total && sub ? amt + Math.round((r.total - sub) * w) : amt + Math.round(shipNet * w);
    return { po: x.po, cost: Math.max(0, cost), ship: Math.round(shipNet * w), qty_ok: x.line.qty >= Number(x.po.qty) };
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
    out.push({ id: x.id, at: Number(m.internalDate) || 0, subject: hs.subject || '', text: html ? htmlText_(html) : plain });
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
    var r = m.src === 'tiki' || !m.src ? parseTikiMail_(m.subject, m.text) : null; if (!r) return;
    r.text = m.text; var srcName = (MAIL_SOURCES[r.src] || {}).name || r.src;
    var pos = rows_('PO'), linked = pos.filter(function (p) { return String(p.supplier_order_id) === r.id && p.status !== 'cancelled'; });
    try {
      if (r.type === 'confirm') {
        if (linked.length) return note({ src: r.src, id: r.id, type: r.type, po: linked.map(function (p) { return p.po_id; }).join(','), note: 'đã gắn từ trước' });
        var mt = matchConfirm_(r, pos, orderOf);
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
function botAuth_(b) {
  var h = P_().getProperty('BOT_KEY_HASH'), k = str_(b.bot_key, 200);
  if (!h || !k || sha_('kk-bot|' + k) !== h) { rate_('botbad', 30, 3600); throw err_('Khóa bot không đúng hoặc đã bị đổi', 401); }
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
  return { at: nowIso_(), tolerance: Number(cfg_('TOLERANCE')), sources: BOT_SOURCES, items: items };
}
function botUpdate_(b) {
  botAuth_(b);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = find_('PO', 'po_id', b.po_id); if (!p) throw err_('Không tìm thấy lệnh mua', 404);
    var d = parseData_(p), bot = d.bot || {}, st = String(b.state || ''), now = nowIso_(), age = bot.at ? (Date.now() - new Date(bot.at).getTime()) / 60000 : 1e9;
    var src = str_(b.source, 20).toLowerCase(); if (src && BOT_SOURCES.indexOf(src) < 0) throw err_('Nguồn chưa hỗ trợ bot: ' + src);
    var logIt = function (note) { (bot.log = bot.log || []).push({ at: now, state: bot.state, note: str_(note, 160) }); bot.log = bot.log.slice(-12); };
    if (st === 'claim') {
      if (p.status !== 'to_order') throw err_('Lệnh mua không còn ở trạng thái Cần đặt', 409);
      if (['paying', 'paying_unknown', 'pay_failed'].indexOf(bot.state) >= 0) throw err_('Lệnh mua đã từng bấm Đặt hàng tại nguồn - cần quản trị kiểm tra và cho phép đặt lại', 409);
      if (bot.state === 'working' && age < 15 && bot.run !== str_(b.run, 60)) throw err_('Một phiên bot khác đang xử lý lệnh mua này', 409);
      if (bot.state === 'failed' && !b.retry) throw err_('Lệnh mua đã lỗi ở lần trước - bấm "Thử lại" trong tiện ích hoặc quản trị cho phép', 409);
      bot.state = 'working'; bot.at = now; bot.run = str_(b.run, 60); bot.src = src || 'tiki'; bot.tries = (bot.tries || 0) + 1; logIt('bắt đầu đặt tại ' + bot.src);
    } else if (st === 'paying') {
      if (bot.state !== 'working' || bot.run !== str_(b.run, 60)) throw err_('Phiên bot không hợp lệ cho lệnh mua này', 409);
      var total = Math.round(Number(b.total) || 0), cap = Number(p.collected_cost) + Number(cfg_('TOLERANCE'));
      if (!(total > 0) || total > cap) throw err_('Tổng thanh toán tại nguồn ' + vnd_(total) + ' vượt tiền hàng đã thu + biên dung sai (' + vnd_(cap) + ') - không đặt', 409);
      bot.state = 'paying'; bot.at = now; bot.total = total; bot.ship = Math.max(0, Math.round(Number(b.ship) || 0)); logIt('bấm Đặt hàng, tổng ' + vnd_(total) + ' - chờ OTP');
    } else if (st === 'done') {
      var id = str_(b.supplier_order_id, 40).replace(/[^\w-]/g, ''); if (!id) throw err_('Thiếu mã đơn nguồn');
      if (p.status === 'to_order') poUpdate_({ po_id: p.po_id, status: 'ordered', actual_source: bot.src || src || 'tiki', actual_cost: Math.round(Number(b.total) || bot.total || 0), supplier_order_id: id, ship_paid: b.ship !== undefined ? b.ship : bot.ship, vat_requested: false, auto: 'bot-' + (bot.src || src || 'tiki') }, 'bot:' + (P_().getProperty('BOT_DEVICE') || 'chrome'));
      else if (String(p.supplier_order_id) !== id) throw err_('Lệnh mua đã gắn mã đơn nguồn khác: ' + p.supplier_order_id, 409);
      p = find_('PO', 'po_id', b.po_id); d = parseData_(p); bot = d.bot || bot; bot.state = 'done'; bot.at = now; logIt('đặt thành công, mã đơn ' + id);
    } else if (st === 'fail' || st === 'skip') {
      var reason = str_(b.note, 200) || 'không rõ';
      if (bot.state === 'paying') { bot.state = /thanh to[aá]n|payment|otp/i.test(reason) ? 'pay_failed' : 'paying_unknown'; }
      else bot.state = st === 'skip' ? 'skip' : 'failed';
      bot.at = now; bot.note = reason; logIt(reason);
      if (bot.state !== 'skip' && rate_soft_('botmail_' + p.po_id + '_' + bot.state, 1, 21600)) adminsMail_((bot.state === 'failed' ? '⚠️' : '🚨') + ' Bot đặt hàng: ' + p.po_id + ' - ' + reason.slice(0, 80), '<p>Lệnh mua <b>' + esc_(p.po_id) + '</b> (' + esc_(p.name) + ')</p><p>Trạng thái bot: <b>' + esc_(bot.state) + '</b><br>Lý do: ' + esc_(reason) + '</p>' + (bot.state === 'failed' ? '<p>Bấm "Thử lại" trong tiện ích hoặc đặt tay trong Quản trị → Lệnh mua.</p>' : '<p><b>Đã bấm Đặt hàng tại nguồn</b> - kiểm tra đơn trên ứng dụng nguồn (thanh toán lại nếu cần). Hệ thống đọc email xác nhận sẽ tự gắn mã đơn khi có.</p>'));
    } else throw err_('Trạng thái bot không hợp lệ');
    d = parseData_(find_('PO', 'po_id', b.po_id)); d.bot = bot;
    var row = find_('PO', 'po_id', b.po_id); update_('PO', row._row, { data: JSON.stringify(d), updated_at: now });
    log_('bot_' + st, P_().getProperty('BOT_DEVICE') || 'bot', b.po_id + ' ' + (bot.note || ''));
    return { ok: true, po_id: b.po_id, bot: { state: bot.state, at: bot.at, note: bot.note || '' }, status: row.status };
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
  try { var p = find_('PO', 'po_id', b.po_id); if (!p) throw err_('Không tìm thấy lệnh mua', 404); var d = parseData_(p); var old = d.bot && d.bot.state; d.bot_prev = d.bot || null; delete d.bot; update_('PO', p._row, { data: JSON.stringify(d), updated_at: nowIso_() }); log_('admin_po_botreset', s.email, b.po_id + ' (' + old + ')'); return { ok: true }; } finally { lock.releaseLock(); }
}
function botInfo_() { var P = P_(); return { has_key: !!P.getProperty('BOT_KEY_HASH'), key_at: P.getProperty('BOT_KEY_AT') || '', seen_at: P.getProperty('BOT_SEEN_AT') || '', device: P.getProperty('BOT_DEVICE') || '', sources: BOT_SOURCES }; }
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
  var s = session_(b.token, true), r = find_('RMA', 'rma_id', b.rma_id); if (!r) throw err_('Không tìm thấy yêu cầu', 404);
  var d = parseData_(r), o = loadOrder_(r.order_code);
  ['return_tracking', 'pickup', 'supplier_rma_id', 'note'].forEach(function (k) { if (b[k] !== undefined) d[k] = str_(b[k], 300); });
  var sr = Math.round(Number(b.supplier_refund) || 0);
  if (sr > 0) { // NCC hoan tien hang tra lai ve KK-MALL: No 1121 / Co 3388 (doi ung khoan da hoan khach / chi ho truoc do)
    d.supplier_refund = (Number(d.supplier_refund) || 0) + sr; d.supplier_refund_at = nowIso_();
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
    var allow = ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'VAT_RATE', 'TOLERANCE', 'UNPAID_HOURS', 'RETURN_DAYS', 'COMPANY_JSON', 'VOUCHER_FEE_CAP_PCT', 'STATS_KEY'];
    var kept = [];
    Object.keys(b.set).forEach(function (k) {
      if (allow.indexOf(k) < 0) return;
      var v = str_(b.set[k], 2000);
      // BAO VE TAI KHOAN NHAN TIEN: khong cho ghi de trong (form cu/tab cu) - muon xoa phai gui clear_bank: true
      if (!v && ['BANK_ACC', 'BANK_NAME', 'BANK_BIN'].indexOf(k) >= 0 && cfg_(k) && b.clear_bank !== true) { kept.push(k); return; }
      P_().setProperty(k, v);
    });
    log_('admin_config', s.email, Object.keys(b.set).join(',') + (kept.length ? ' | GIU NGUYEN (gia tri trong): ' + kept.join(',') : ''));
  }
  var out = {}; ['BANK_BIN', 'BANK_ACC', 'BANK_NAME', 'BANK_LABEL', 'VAT_RATE', 'TOLERANCE', 'UNPAID_HOURS', 'RETURN_DAYS', 'COMPANY_JSON', 'ADMIN_EMAILS', 'VOUCHER_FEE_CAP_PCT'].forEach(function (k) { out[k] = cfg_(k); });
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

/* =========================== ĐỊNH KỲ & SAO LƯU =========================== */
function hourly() {
  var lim = Number(cfg_('UNPAID_HOURS')) * 3600e3;
  rows_('Orders').forEach(function (r) {
    if (r.status !== 'awaiting_payment' || Date.now() - new Date(r.created_at).getTime() < lim) return;
    var o = parseData_(r); o._row = r._row; setStatus_(o, 'cancelled', 'system', 'Quá hạn thanh toán'); saveOrder_(o);
    mail_(o.customer.email, 'Đơn ' + o.code + ' đã tự hủy do chưa thanh toán', '<p>Đơn <b>' + o.code + '</b> đã tự hủy vì chưa nhận được thanh toán sau ' + cfg_('UNPAID_HOURS') + ' giờ. Bạn có thể đặt lại bất cứ lúc nào.</p>');
  });
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
}

/* =========================== ĐỊNH TUYẾN HTTP =========================== */
function doGet(e) {
  var a = (e && e.parameter && e.parameter.a) || 'config';
  try {
    if (a === 'config') return json_(publicConfig_());
    if (a === 'health') return json_({ ok: true, version: VERSION, at: nowIso_() });
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
  return { version: VERSION, consent_version: CONSENT_VERSION, company: c, bank_ready: b.ready, fee_table: feeTable_(), vat_rate: Number(cfg_('VAT_RATE')), return_days: Number(cfg_('RETURN_DAYS')), unpaid_hours: Number(cfg_('UNPAID_HOURS')), vouchers: VOUCHERS.map(function (v) { return { code: v.code, title: v.title }; }), voucher_fee_cap_pct: Number(cfg_('VOUCHER_FEE_CAP_PCT')) };
}
function doPost(e) {
  var b = {}, a = (e && e.parameter && e.parameter.a) || '';
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ error: 'Dữ liệu không hợp lệ', code: 400 }); }
  a = b.a || a;
  try {
    var R = {
      'config': function () { return publicConfig_(); },
      'quote': function () { return quote_(b.items, b.voucher_codes, !!b.fresh); },
      'order.create': function () { return orderCreate_(b); },
      'order.get': function () { return orderGet_(b); },
      'order.paid_claim': function () { return paidClaim_(b); },
      'orders.mine': function () { return ordersMine_(b); },
      'otp.request': function () { return otpRequest_(b); },
      'otp.verify': function () { return otpVerify_(b); },
      'me': function () { var s = session_(b.token); return { member: memberOut_(find_('Members', 'email', s.email)) }; },
      'member.update': function () { return memberUpdate_(b); },
      'logout': function () { return logout_(b); },
      'rma.create': function () { return rmaCreate_(b); },
      'warranty': function () { var p = product_(b.sku); return { warranty: warrantyFor_(p.brand, p.category_id), brand: p.brand }; },
      'webhook': function () { return webhook_(b, e.parameter && e.parameter.key); },
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
