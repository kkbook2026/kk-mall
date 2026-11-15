'use strict';
/*
 * GIÁM SÁT KK-MALL (chạy 30 phút/lần trên GitHub Actions) - kiểm tra hệ thống đang chạy thật từ bên ngoài:
 *  website, dữ liệu giá còn mới, máy chủ đơn hàng (phiên bản + báo giá thật), trang quản trị, gói tiện ích, sitemap, chứng chỉ HTTPS.
 * Lỗi -> thoát mã 1 + ghi báo cáo monitor-report.md (workflow mở/ cập nhật Issue cảnh báo; hết lỗi tự đóng).
 * Chỉ ĐỌC - không tạo đơn, không gửi email.
 * (c) 2026 Nguyễn Duy Điển. All rights reserved.
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
      // Loi thoang qua (15/11/2026: may chu doc trang SP dung luc CDN cua GitHub Pages tra loi khac 200 -> bao "khong tim thay SP", 17 phut sau binh thuong)
      // -> thu lai 1 lan sau 20 giay truoc khi bao dong (khong mo Issue canh bao vi mot nhip loi mang).
      const ask = async () => json((await get(be, { method: 'POST', body: JSON.stringify({ a: 'quote', items: [{ sku: row[0], qty: 1 }] }), timeout: 40000 })).body);
      const okQ = q => q && q.lines && q.lines.length === 1 && q.total > 0;
      let q = await ask(), retried = false;
      if (!okQ(q)) { await new Promise(r => setTimeout(r, 20000)); q = await ask(); retried = true; }
      add('Báo giá thật (máy chủ đọc giá website)', okQ(q), (q ? (q.error ? q.error : `${row[0]} → ${q.total} đ`) : 'không phản hồi') + (retried ? ' (đã thử lại 1 lần)' : ''));
    } else add('Báo giá thật', false, 'không tìm thấy SP còn hàng trong catalog-pack');
    const rv = json((await get(be + '?a=reviews&sku=' + (row ? row[0] : 'KK000001'), { timeout: 40000 })).body);
    add('Đánh giá sản phẩm (API công khai)', rv && typeof rv.n === 'number', rv ? rv.n + ' đánh giá' : 'không phản hồi');
  }
  const ks = await get(SITE + '/kk-search.js?t=' + Date.now()); const kv = (ks.body.match(/version: '([\d.]+)'/) || [])[1];
  add('Bộ máy tìm kiếm trên thiết bị (kk-search.js)', ks.status === 200 && /^2\./.test(kv || ''), kv ? 'phiên bản ' + kv : 'HTTP ' + ks.status);
  const adm = await get(SITE + '/admin/'); add('Trang quản trị', adm.status === 200 && /noindex/.test(adm.body), 'HTTP ' + adm.status);
  const enc = await get(SITE + '/admin/data.enc', { method: 'HEAD' }); add('Gói dữ liệu quản trị (mã hóa)', enc.status === 200, 'HTTP ' + enc.status);
  const ext = await get(SITE + '/admin/ext/kk-auto-order.zip', { method: 'HEAD' }); add('Gói tiện ích đặt hàng', ext.status === 200, 'HTTP ' + ext.status);
  const pwa = await Promise.all(['/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png'].map(u => get(SITE + u, { method: 'HEAD' })));
  add('PWA (manifest, service worker, offline, icon)', pwa.every(r => r.status === 200), pwa.map(r => r.status).join('/'));
  const sm = await get(SITE + '/sitemap.xml'); add('Sitemap', sm.status === 200 && /<(urlset|sitemapindex)/.test(sm.body), 'HTTP ' + sm.status);
  const legal = await get(SITE + '/phap-ly.html'); add('Trang pháp lý / chính sách', legal.status === 200, 'HTTP ' + legal.status);
  const days = await certDays(new URL(SITE).hostname); add('Chứng chỉ HTTPS', days > 14, days < 0 ? 'không đọc được' : 'còn ' + days + ' ngày');
  /* Quy trinh tu dong con giu nhip? (cron cua GitHub bo / tre phan lon luot - nhip duoc giu boi collector/scheduler.js). Chi chay khi co token (tren GitHub). */
  const tok = process.env.GH_TOKEN || '', repo = process.env.GITHUB_REPOSITORY || '';
  if (tok && repo) {
    const LIM = [['collect.yml', 'Thu thập giá', 5], ['hunt-crawl.yml', 'Săn giá theo mã', 6], ['search-crawl.yml', 'Tìm giá trên sàn', 6], ['retail-crawl.yml', 'Giá bán lẻ', 9]], parts = []; let ok = true;
    for (const [wf, name, h] of LIM) {
      const r = await get(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?per_page=5`, { headers: { authorization: 'Bearer ' + tok, accept: 'application/vnd.github+json', 'user-agent': 'KK-MALL-Monitor/1.0' } });
      const runs = (json(r.body) || {}).workflow_runs; if (!Array.isArray(runs)) { parts.push(name + ': không đọc được'); continue; }
      const live = runs.some(x => x.status !== 'completed'), last = runs[0] ? (Date.now() - Date.parse(runs[0].run_started_at || runs[0].created_at)) / 36e5 : Infinity;
      const fails = runs.slice(0, 3).filter(x => x.status === 'completed' && x.conclusion === 'failure').length;
      const bad = (!live && last > h) || fails >= 3; if (bad) ok = false;
      parts.push(`${name}: ${live ? 'đang chạy' : 'lượt gần nhất ' + (Number.isFinite(last) ? last.toFixed(1) + ' giờ trước' : 'chưa có')}${fails >= 3 ? ', 3 lượt lỗi liên tiếp' : ''}${bad ? ' ⚠' : ''}`);
    }
    add('Quy trình tự động giữ nhịp (điều phối lịch)', ok, parts.join(' · '));
  }
  const bad = checks.filter(c => !c.ok);
  const md = `## ${bad.length ? '🚨 ' + bad.length + ' kiểm tra lỗi' : '✅ Hệ thống bình thường'} - ${new Date().toISOString()}\n\n| | Kiểm tra | Chi tiết |\n|---|---|---|\n` + checks.map(c => `| ${c.ok ? '✅' : '❌'} | ${c.name} | ${c.detail.replace(/\|/g, '/')} |`).join('\n') + '\n';
  // chu ky loi: workflow chi binh luan (= bao ve dien thoai) khi tap kiem tra loi THAY DOI, tranh bao lap moi 30 phut
  const sig = bad.map(c => c.name).sort().join(' | ');
  fs.writeFileSync(process.env.MONITOR_REPORT || 'monitor-report.md', md + (bad.length ? `\n\n<!-- kk-sig: ${sig} -->\n` : ''));
  fs.writeFileSync(process.env.MONITOR_SIG || 'monitor-sig.txt', sig);
  if (bad.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
