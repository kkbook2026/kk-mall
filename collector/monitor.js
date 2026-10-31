'use strict';
/*
 * GIÁM SÁT KK-MALL (chạy 30 phút/lần trên GitHub Actions) - kiểm tra hệ thống đang chạy thật từ bên ngoài:
 *  website, dữ liệu giá còn mới, máy chủ đơn hàng (phiên bản + báo giá thật), trang quản trị, gói tiện ích, sitemap, chứng chỉ HTTPS.
 * Lỗi -> thoát mã 1 + ghi báo cáo monitor-report.md (workflow mở/ cập nhật Issue cảnh báo; hết lỗi tự đóng).
 * Chỉ ĐỌC - không tạo đơn, không gửi email.
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
const fs = require('fs');
const tls = require('tls');
const SITE = (process.env.KK_SITE || 'https://www.kk-mall.com').replace(/\/$/, '');
const MAX_DATA_AGE_H = Number(process.env.MAX_DATA_AGE_H || 8);
const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: String(detail || '') }); console.log((ok ? '✓' : '✗') + ' ' + name + (detail ? ' - ' + detail : '')); };
async function get(url, opt = {}) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), opt.timeout || 25000), t0 = Date.now();
  try { const r = await fetch(url, Object.assign({ signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'KK-MALL-Monitor/1.0' } }, opt)); const body = await r.text(); return { status: r.status, body, ms: Date.now() - t0 }; }
  catch (e) { return { status: 0, body: '', ms: Date.now() - t0, err: e.name === 'AbortError' ? 'quá thời gian' : e.message }; } finally { clearTimeout(t); }
}
const json = s => { try { return JSON.parse(s); } catch { return null; } };
function certDays(host) {
  return new Promise(res => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => { const c = s.getPeerCertificate(); s.end(); res(c && c.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 864e5) : -1); });
    s.on('error', () => res(-1)); s.on('timeout', () => { s.destroy(); res(-1); });
  });
}
async function main() {
  const home = await get(SITE + '/');
  add('Trang chủ', home.status === 200 && /KK-MALL/.test(home.body) && /Content-Security-Policy/.test(home.body), `HTTP ${home.status} · ${home.ms} ms${home.err ? ' · ' + home.err : ''}`);
  const meta = json((await get(SITE + '/api/meta.json?t=' + Date.now())).body);
  const age = meta && meta.lastSync ? (Date.now() - new Date(meta.lastSync)) / 36e5 : 1e9;
  add('Dữ liệu giá còn mới', age <= MAX_DATA_AGE_H, meta ? `cập nhật ${age.toFixed(1)} giờ trước · ${meta.totalProducts} SP` : 'không đọc được meta.json');
  const cfgJs = (await get(SITE + '/config.js?t=' + Date.now())).body, be = (cfgJs.match(/KK_BACKEND\s*=\s*'(https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec)'/) || [])[1];
  add('Cấu hình máy chủ (config.js)', !!be, be ? 'có địa chỉ máy chủ' : 'thiếu KK_BACKEND');
  if (be) {
    const h = json((await get(be + '?a=health', { timeout: 40000 })).body);
    add('Máy chủ đơn hàng', h && h.ok, h ? 'phiên bản ' + h.version : 'không phản hồi');
    const c = json((await get(be + '?a=config', { timeout: 40000 })).body);
    add('Tài khoản nhận tiền VietQR', c && c.bank_ready === true, c ? (c.bank_ready ? 'sẵn sàng' : 'CHƯA cấu hình - khách không thấy mã QR') : 'không đọc được');
    const pack = json((await get(SITE + '/api/catalog-pack.json?t=' + Date.now())).body);
    const row = pack && pack.rows ? pack.rows.find(r => r[7] && r[6] > 50000 && !(r[11] & 33)) : null;
    if (row) {
      const q = json((await get(be, { method: 'POST', body: JSON.stringify({ a: 'quote', items: [{ sku: row[0], qty: 1 }] }), timeout: 40000 })).body);
      add('Báo giá thật (máy chủ đọc giá website)', q && q.lines && q.lines.length === 1 && q.total > 0, q ? (q.error ? q.error : `${row[0]} → ${q.total} đ`) : 'không phản hồi');
    } else add('Báo giá thật', false, 'không tìm thấy SP còn hàng trong catalog-pack');
    const rv = json((await get(be + '?a=reviews&sku=' + (row ? row[0] : 'KK000001'), { timeout: 40000 })).body);
    add('Đánh giá sản phẩm (API công khai)', rv && typeof rv.n === 'number', rv ? rv.n + ' đánh giá' : 'không phản hồi');
  }
  const adm = await get(SITE + '/admin/'); add('Trang quản trị', adm.status === 200 && /noindex/.test(adm.body), 'HTTP ' + adm.status);
  const enc = await get(SITE + '/admin/data.enc', { method: 'HEAD' }); add('Gói dữ liệu quản trị (mã hóa)', enc.status === 200, 'HTTP ' + enc.status);
  const ext = await get(SITE + '/admin/ext/kk-auto-order.zip', { method: 'HEAD' }); add('Gói tiện ích đặt hàng', ext.status === 200, 'HTTP ' + ext.status);
  const sm = await get(SITE + '/sitemap.xml'); add('Sitemap', sm.status === 200 && /<(urlset|sitemapindex)/.test(sm.body), 'HTTP ' + sm.status);
  const legal = await get(SITE + '/phap-ly.html'); add('Trang pháp lý / chính sách', legal.status === 200, 'HTTP ' + legal.status);
  const days = await certDays(new URL(SITE).hostname); add('Chứng chỉ HTTPS', days > 14, days < 0 ? 'không đọc được' : 'còn ' + days + ' ngày');
  const bad = checks.filter(c => !c.ok);
  const md = `## ${bad.length ? '🚨 ' + bad.length + ' kiểm tra lỗi' : '✅ Hệ thống bình thường'} - ${new Date().toISOString()}\n\n| | Kiểm tra | Chi tiết |\n|---|---|---|\n` + checks.map(c => `| ${c.ok ? '✅' : '❌'} | ${c.name} | ${c.detail.replace(/\|/g, '/')} |`).join('\n') + '\n';
  fs.writeFileSync(process.env.MONITOR_REPORT || 'monitor-report.md', md);
  if (bad.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
