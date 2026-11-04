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
      co_name: or(co.name, 'CÔNG TY TNHH KK-MALL'), co_tax: or(co.tax, NA), co_reg_no: or(co.reg_no, NA), co_reg_by: or(co.reg_by, NA), co_reg_date: or(co.reg_date, NA),
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
