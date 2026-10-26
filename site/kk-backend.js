/*
 * KK-MALL BACKEND CLIENT - kết nối máy chủ đơn hàng (Google Apps Script) khi đã cấu hình KK_BACKEND (config.js).
 * Mô hình mua hộ: Tiền hàng (thu hộ - chi hộ nhà cung cấp, NCC xuất VAT) + Phí dịch vụ KK-MALL (KK-MALL xuất VAT).
 * Ghi đè luồng demo: đặt hàng, thanh toán VietQR, thành viên OTP, theo dõi đơn, bảo hành / đổi trả.
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
'use strict';
const KKB = {
  on: !!(window.KK_BACKEND && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(window.KK_BACKEND)),
  cfg: null,
  async call(a, body = {}) {
    const r = await fetch(window.KK_BACKEND, { method: 'POST', body: JSON.stringify({ a, ...body }), redirect: 'follow' });
    let j; try { j = await r.json(); } catch { throw new Error('Máy chủ đang bận, vui lòng thử lại'); }
    if (j && j.error) { const e = new Error(j.error); e.code = j.code; throw e; }
    return j;
  },
  sess() { try { return JSON.parse(localStorage.getItem('kk_sess') || 'null'); } catch { return null; } },
  setSess(s) { try { s ? localStorage.setItem('kk_sess', JSON.stringify(s)) : localStorage.removeItem('kk_sess'); } catch { } },
  token() { const s = KKB.sess(); return s && s.token; }
};
const CONSENT_FALLBACK = 'UQ-2026-10';
// bang phi cong khai mac dinh (dung ngay khi trang vua mo, truoc khi may chu tra cau hinh)
const FEE_FALLBACK = [{ from: 0, to: 199999, fee: 18000 }, { from: 200000, to: 500000, fee: 26000 }, { from: 500001, to: null, fee: 32000 }];
function feeOf(kk) { // phi dich vu theo khung (bang phi cong khai) - de hien thi minh bach tren the SP
  const T = (KKB.cfg && KKB.cfg.fee_table) || FEE_FALLBACK;
  for (const t of T) { const c = kk - t.fee; if (c >= t.from && (t.to == null || c <= t.to)) return t.fee; }
  return 0;
}

if (KKB.on) {
  /* ---------- cấu hình công khai (bảng phí, công ty, ngân hàng sẵn sàng) ---------- */
  KKB.ready = KKB.call('config').then(c => {
    KKB.cfg = c;
    try {
      const co = c.company || {};
      if (co.name) { $('#coName').textContent = co.name; } if (co.address) $('#coAddr').textContent = co.address;
      if (co.tax) $('#coTax').textContent = co.tax; if (co.email) $('#coEmail').textContent = co.email; if (co.phone) $('#hotline').textContent = co.phone;
      if (co.moit) $('#moit').textContent = 'Số đăng ký Bộ Công Thương: ' + co.moit;
    } catch { }
    document.querySelectorAll('#grid .card,.shelf .card').length && typeof reload === 'function';
    return c;
  }).catch(e => { console.warn('backend config', e); return null; });

  /* ---------- bằng chứng giá trên thẻ: voucher chỉ giảm trên phí dịch vụ ---------- */
  const _sv = window.singleVoucher;
  window.singleVoucher = function (p) {
    const v = _sv(p); const fee = feeOf(p.kk_price || 0);
    if (!fee) return v;
    const pct = (KKB.cfg && KKB.cfg.voucher_fee_cap_pct != null) ? KKB.cfg.voucher_fee_cap_pct : 50;
    const d = Math.min(v.d, Math.floor(fee * pct / 100 / 1000) * 1000); return { codes: d > 0 ? v.codes : [], d, after: (p.kk_price || 0) - d };
  };

  /* ================= THÀNH VIÊN: OTP EMAIL (không mật khẩu) ================= */
  window.getMember = () => { const s = KKB.sess(); return s ? s.member : null; };
  window.memberBadge = () => { const m = getMember(); $('#memLbl').textContent = m ? (m.name ? m.name.split(' ').slice(-1)[0] : m.email.split('@')[0]) : 'Đăng nhập'; };
  window.openMember = function () {
    const m = getMember();
    if (!m) {
      $('#mBox').innerHTML = `<div style="padding:28px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0;color:var(--ink)">👤 Đăng nhập / Đăng ký</h2><button class="x" onclick="closeAll()">✕</button></div>
        <p style="color:var(--muted);font-size:13px;margin:6px 0 14px">Chỉ cần email - <b>không mật khẩu</b>. KK-MALL gửi mã 6 số (hiệu lực 10 phút) để xác thực. Tài khoản mới được tạo tự động.</p>
        <form id="otpF1" onsubmit="otpSend(event)"><div class="f"><label>Email *</label><input name="email" type="email" required autocomplete="email" placeholder="ban@email.com"></div>
        <div class="err" id="memErr"></div><button class="btn i" id="otpB1">Gửi mã xác thực</button></form>
        <form id="otpF2" onsubmit="otpVerify(event)" style="display:none"><div class="f"><label>Mã 6 số đã gửi tới <b id="otpTo"></b></label><input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" placeholder="••••••" style="font-size:22px;letter-spacing:8px;text-align:center"></div>
        <div class="err" id="memErr2"></div><button class="btn i" id="otpB2">Xác thực & đăng nhập</button><button type="button" class="btn o" onclick="otpBack()">← Đổi email / gửi lại mã</button></form>
        <div class="note" style="margin-top:12px">🔐 Mã chỉ dùng 1 lần, sai 5 lần sẽ bị khóa; phiên đăng nhập lưu trên thiết bị này 30 ngày. Thông tin xử lý theo <a href="./phap-ly#bao-mat" target="_blank" style="color:var(--ink);font-weight:700">Chính sách bảo vệ dữ liệu cá nhân</a>.</div></div>`;
      show('#mm'); return;
    }
    $('#mBox').innerHTML = `<div style="padding:28px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0;color:var(--ink)">👤 ${esc(m.name || m.email)} ${m.role === 'admin' ? '<span class="ledger-badge" style="background:#FFEDD5;border-color:#EA580C;color:#92400E">⚡ ADMIN</span>' : ''}</h2><button class="x" onclick="closeAll()">✕</button></div>
      <div style="font-size:13px;color:var(--muted);margin:4px 0 14px">${esc(m.email)}</div>
      <form onsubmit="saveProfile(event)"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="f"><label>Họ và tên</label><input name="name" value="${esc(m.name || '')}"></div><div class="f"><label>Số điện thoại</label><input name="phone" value="${esc(m.phone || '')}"></div></div>
      <div class="f"><label>Địa chỉ nhận hàng mặc định</label><textarea name="address" rows="2">${esc(m.address || '')}</textarea></div><div class="err" id="memErr"></div><button class="btn o" style="margin-top:0">💾 Lưu thông tin</button></form>
      ${m.role === 'admin' ? '<a class="btn g" style="display:block;text-align:center" href="./admin">⚡ Vào trang Quản trị</a>' : ''}
      <button class="btn i" onclick="myOrders()">📦 Đơn hàng của tôi</button><div id="myOrdersBox" style="margin-top:10px"></div>
      <button class="btn o" onclick="kkLogout()">Đăng xuất</button></div>`;
    show('#mm');
  };
  window.otpSend = async function (e) {
    e.preventDefault(); const em = e.target.email.value.trim().toLowerCase(), b = $('#otpB1'), er = $('#memErr'); er.style.display = 'none'; b.disabled = true; b.textContent = 'Đang gửi mã...';
    try { await KKB.call('otp.request', { email: em }); window._otpEmail = em; $('#otpTo').textContent = em; $('#otpF1').style.display = 'none'; $('#otpF2').style.display = 'block'; setTimeout(() => $('#otpF2').code.focus(), 50); toast('Đã gửi mã tới ' + em); }
    catch (x) { er.textContent = x.message; er.style.display = 'block'; } b.disabled = false; b.textContent = 'Gửi mã xác thực';
  };
  window.otpBack = () => { $('#otpF2').style.display = 'none'; $('#otpF1').style.display = 'block'; };
  window.otpVerify = async function (e) {
    e.preventDefault(); const b = $('#otpB2'), er = $('#memErr2'); er.style.display = 'none'; b.disabled = true; b.textContent = 'Đang xác thực...';
    try { const r = await KKB.call('otp.verify', { email: window._otpEmail, code: e.target.code.value.trim() }); KKB.setSess(r); memberBadge(); toast(r.member.role === 'admin' ? 'Chào ADMIN!' : 'Đăng nhập thành công'); openMember(); }
    catch (x) { er.textContent = x.message; er.style.display = 'block'; } b.disabled = false; b.textContent = 'Xác thực & đăng nhập';
  };
  window.saveProfile = async function (e) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), er = $('#memErr');
    try { const r = await KKB.call('member.update', { token: KKB.token(), ...f }); const s = KKB.sess(); s.member = r.member; KKB.setSess(s); memberBadge(); toast('Đã lưu thông tin'); }
    catch (x) { er.textContent = x.message; er.style.display = 'block'; }
  };
  window.kkLogout = async function () { try { await KKB.call('logout', { token: KKB.token() }); } catch { } KKB.setSess(null); memberBadge(); closeAll(); toast('Đã đăng xuất'); };
  window.myOrders = async function () {
    const box = $('#myOrdersBox'); box.innerHTML = '<div style="font-size:12px;color:var(--muted)">Đang tải...</div>';
    try {
      const r = await KKB.call('orders.mine', { token: KKB.token() }); const m = getMember();
      box.innerHTML = r.orders.length ? `<table class="cmp"><tr><th>Mã đơn</th><th>Tổng</th><th>Trạng thái</th><th></th></tr>${r.orders.map(o => `<tr><td><b>${o.code}</b><br><small style="color:var(--muted)">${new Date(o.created_at).toLocaleDateString('vi-VN')}</small></td><td>${vnd(o.total)}</td><td style="font-size:12px">${esc(o.status_text)}</td><td><button class="vbtn" onclick="closeAll();showTrack(${esc(JSON.stringify(String(o.code)))},'')">Xem</button></td></tr>`).join('')}</table>` : '<div style="font-size:13px;color:var(--muted)">Bạn chưa có đơn hàng nào.</div>';
    } catch (x) { box.innerHTML = '<div style="color:#B91C1C;font-size:13px">' + esc(x.message) + '</div>'; if (x.code === 401) { KKB.setSess(null); memberBadge(); } }
  };
  window.regMember = window.otpSend;

  /* ================= ĐẶT HÀNG: tách phí + VAT + ủy quyền + VietQR ================= */
  let QUOTE = null;
  window.openCheckout = async function () {
    if (!cart.length) return toast('Giỏ hàng trống');
    if (window._coBusy) return; window._coBusy = true;
    const btn = $('#coBtn'), old = btn.textContent; btn.disabled = true; btn.textContent = '🔒 Đang kiểm tra tồn kho & chốt giá...';
    let lc;
    try { await KKB.ready; lc = await liveCheck(); renderCart(); if (!lc.ok) { toast('Các sản phẩm trong giỏ vừa hết hàng hoặc đang xác minh giá'); openCart(); return; }
      QUOTE = await KKB.call('quote', { items: cart.filter(c => !c.unavailable).map(c => ({ sku: c.sku, qty: c.qty })), fresh: true });
    } catch (x) { toast(x.message); return; } finally { window._coBusy = false; btn.disabled = false; btn.textContent = old; }
    if (QUOTE.unavailable.length) { QUOTE.unavailable.forEach(u => { const c = cart.find(x => x.sku === u.sku); if (c) c.unavailable = 1; }); save(); renderCart(); }
    if (!QUOTE.lines.length) { toast('Không còn sản phẩm đặt được'); openCart(); return; }
    const m = getMember() || {}; let saved = {}; try { saved = JSON.parse(localStorage.getItem('kk_cust') || '{}'); } catch { }
    const v = (k) => esc(m[k] || saved[k] || ''), q = QUOTE, C = KKB.cfg || {};
    $('#coBox').innerHTML = `<button class="x" onclick="closeAll()" type="button" style="position:absolute;top:12px;right:14px;z-index:5">✕</button><form class="co" onsubmit="submitOrder(event)"><div>
      <div class="step"><b>1</b> Thông tin <span style="margin:0 6px">›</span><b>2</b> Thanh toán VietQR <span style="margin:0 6px">›</span><b>3</b> KK-MALL tự đặt mua & giao</div>
      <h2 style="margin:0 0 14px;color:var(--ink)">Đặt hàng nhanh - 1 phút</h2>${lockBanner(lc)}
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off">
      <div class="f"><label>Họ và tên người nhận *</label><input name="name" required autocomplete="name" value="${v('name')}" placeholder="Nguyễn Văn A"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="f"><label>Số điện thoại *</label><input name="phone" required inputmode="tel" autocomplete="tel" value="${v('phone')}" placeholder="09xxxxxxxx"></div><div class="f"><label>Email nhận thông báo *</label><input name="email" type="email" required autocomplete="email" value="${v('email')}" placeholder="ban@email.com"></div></div>
      <div class="f"><label>Địa chỉ nhận hàng đầy đủ *</label><textarea name="address" rows="2" required autocomplete="street-address" placeholder="Số nhà, đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố (cách nhau bằng dấu phẩy)">${v('address')}</textarea></div>
      <div class="f"><label>Ghi chú giao hàng</label><input name="note" placeholder="Giờ nhận hàng, gọi trước khi giao..."></div>
      <label class="consent" style="background:#F8FAFC;border-radius:10px;padding:10px"><input type="checkbox" name="vat_need" onchange="document.getElementById('vatBox').style.display=this.checked?'block':'none'" style="margin-top:2px"><span><b>Xuất hóa đơn GTGT</b> (công ty / cá nhân có MST)</span></label>
      <div id="vatBox" style="display:none;border:1.5px dashed var(--line);border-radius:12px;padding:10px 12px;margin-bottom:12px">
        <div class="f"><label>Tên đơn vị / cá nhân trên hóa đơn *</label><input name="vat_name" placeholder="Công ty TNHH ..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="f"><label>Mã số thuế</label><input name="vat_tax" inputmode="numeric" placeholder="10 số / 10-3 số / CCCD 12 số"></div><div class="f"><label>Email nhận hóa đơn</label><input name="vat_email" type="email" placeholder="ketoan@congty.vn"></div></div>
        <div class="f"><label>Địa chỉ trên hóa đơn</label><input name="vat_addr" placeholder="Địa chỉ đăng ký kinh doanh"></div>
        <div style="font-size:12px;color:var(--muted)">Hóa đơn <b>tiền hàng</b> do nhà cung cấp xuất trực tiếp cho bạn (hệ thống chỉ chọn nguồn có xuất hóa đơn điện tử); hóa đơn <b>phí dịch vụ</b> do KK-MALL xuất.</div></div>
      <div class="f"><label>Thanh toán trước (không hỗ trợ COD)</label><div class="pm"><label><input type="radio" name="payment_method" value="vietqr" checked> 📲 Chuyển khoản VietQR - mọi ngân hàng<span class="lv">● Miễn phí · xác nhận tự động</span></label>
        <label style="opacity:.5"><input type="radio" disabled> 🏦 Thẻ quốc tế / Ví điện tử<span class="lv">○ Sắp có</span></label></div></div>
      <label class="consent"><input type="checkbox" name="consent" required style="margin-top:2px"><span>Tôi đồng ý <a href="./phap-ly#dieu-khoan" target="_blank" style="color:var(--ink);font-weight:700">Điều khoản dịch vụ</a> và <a href="./phap-ly#uy-quyen" target="_blank" style="color:var(--ink);font-weight:700">Hợp đồng ủy quyền mua hộ - thanh toán hộ</a> (${esc(C.consent_version || CONSENT_FALLBACK)}): KK-MALL thay mặt tôi đặt mua tại nhà cung cấp có giá tốt nhất, thu hộ - chi hộ tiền hàng và thu phí dịch vụ; đồng ý <a href="./phap-ly#bao-mat" target="_blank" style="color:var(--ink);font-weight:700">xử lý dữ liệu cá nhân</a> để giao hàng.</span></label>
      <div class="err" id="coErr"></div><button class="btn" style="font-size:16px" id="coSubmit">Xác nhận & thanh toán ${vnd(q.total)}</button></div>
      <div><div class="sum"><h3 style="margin:0 0 10px;color:var(--ink)">Đơn hàng (${q.lines.reduce((a, l) => a + l.qty, 0)} sản phẩm)</h3>
      ${q.lines.map(l => `<div class="row"><span style="flex:1;padding-right:8px;font-size:13px">${esc(l.name)} × ${l.qty}</span><b>${vnd(l.line_total)}</b></div>`).join('')}
      <hr style="border:0;border-top:1px dashed var(--line)">
      <div class="row"><span>Tiền hàng thanh toán hộ nhà cung cấp<br><small style="color:var(--muted)">Nhà cung cấp xuất hóa đơn GTGT</small></span><b>${vnd(q.goods)}</b></div>
      <div class="row"><span>Phí dịch vụ mua hộ & xử lý đơn KK-MALL<br><small style="color:var(--muted)">Đã gồm VAT ${q.vat_rate}% · KK-MALL xuất hóa đơn</small></span><b>${vnd(q.fee)}</b></div>
      ${q.discount ? `<div class="row" style="color:var(--ok)"><span>Giảm phí dịch vụ (${q.vouchers.map(v => v.code).join('+')})</span><b>-${vnd(q.discount)}</b></div>` : ''}
      <div class="row"><span>Phí giao hàng</span><b style="color:var(--ok)">Đã bao gồm ✓</b></div><div class="row"><span>Phí cổng thanh toán VietQR</span><b style="color:var(--ok)">0 đ</b></div>
      <div class="row t"><span>Tổng thanh toán</span><span style="color:var(--coral)">${vnd(q.total)}</span></div>
      <details style="font-size:12px;color:var(--muted);margin-top:6px"><summary style="cursor:pointer;font-weight:700;color:var(--ink)">Biểu phí dịch vụ KK-MALL</summary>${(q.fee_table || []).map(t => `<div>Giá hàng ${t.to == null ? 'trên ' + vnd(t.from - 1) : vnd(t.from) + ' - ' + vnd(t.to)}: <b>${vnd(t.fee)}</b>/sản phẩm</div>`).join('')}<div>Voucher (nếu có) giảm trên phí dịch vụ.</div></details>
      <div class="note" style="margin-top:12px">🔐 Tiền hàng được thu hộ và chuyển thẳng cho nhà cung cấp; hàng giao trực tiếp từ nhà cung cấp tới bạn. Hết hàng hoặc tăng giá vượt biên dung sai → <b>hoàn tiền 100%</b> tự động.</div></div></div></form>`;
    show('#com'); startLockTimer();
  };
  let _idem = null, _poll = null;
  window.submitOrder = async function (e) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = $('#coSubmit'), er = $('#coErr'); er.style.display = 'none';
    // dia chi du 3 cap (phuong/xa, quan/huyen, tinh/thanh) de nha cung cap giao dung va he thong dat hang tu dong dien chinh xac
    if (String(f.address || '').split(/[,;\n]/).map(x => x.trim()).filter(x => x.length > 1).length < 3) { er.textContent = 'Vui lòng ghi đủ địa chỉ: số nhà + đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố - cách nhau bằng dấu phẩy (ví dụ: 12 Phố Huế, Phường Hàng Bài, Quận Hoàn Kiếm, Hà Nội).'; er.style.display = 'block'; const ta = e.target.querySelector('[name=address]'); if (ta) ta.focus(); return; }
    b.disabled = true; b.textContent = 'Đang tạo đơn...';
    try {
      try { localStorage.setItem('kk_cust', JSON.stringify({ name: f.name, phone: f.phone, email: f.email, address: f.address })); } catch { }
      const r = await KKB.call('order.create', { website: f.website || '', token: KKB.token(), items: QUOTE.lines.map(l => ({ sku: l.sku, qty: l.qty })),
        customer: { name: f.name, phone: f.phone, email: f.email, address: f.address, note: f.note }, consent: !!f.consent, consent_version: (KKB.cfg && KKB.cfg.consent_version) || CONSENT_FALLBACK,
        vat: f.vat_need ? { need: true, name: f.vat_name, tax_code: f.vat_tax, address: f.vat_addr, email: f.vat_email } : null, lock: PRICE_LOCK, ua: navigator.userAgent.slice(0, 180) });
      cart = cart.filter(c => c.unavailable); save(); renderCart(); PRICE_LOCK = null;
      payScreen(r.order, r.payment, f.phone);
    } catch (x) { er.textContent = x.message; er.style.display = 'block'; b.disabled = false; b.textContent = 'Xác nhận & thanh toán';
      if (x.code === 409) { toast('Giá/tồn kho vừa thay đổi - đang chốt lại...'); setTimeout(openCheckout, 1000); } }
  };
  const copyBtn = (t) => `<button type="button" class="vbtn" style="padding:2px 8px;margin-left:6px" data-v="${esc(String(t))}" onclick="navigator.clipboard.writeText(this.dataset.v);toast('Đã sao chép')">Sao chép</button>`;
  window.paidClaim = async function (code, phone) {
    const b = $('#claimBtn'); if (b) { b.disabled = true; b.textContent = 'Đang gửi...'; }
    try { const r = await KKB.call('order.paid_claim', { code, phone, token: KKB.token() });
      const msg = r.already ? '✅ Đơn đã được xác nhận thanh toán.' : '✅ Đã báo KK-MALL. Bộ phận đối soát kiểm tra giao dịch và xác nhận trong giờ làm việc (thường vài phút) - trang này tự cập nhật khi xong.';
      if (b) { b.textContent = '✓ Đã báo chuyển khoản'; } const s = $('#payState'); if (s) s.innerHTML = msg; toast(msg.slice(0, 60)); }
    catch (e) { if (b) { b.disabled = false; b.textContent = '✅ Tôi đã chuyển khoản'; } toast(e.message); }
  };
  window.payScreen = function (o, p, phone) {
    phone = String(phone || '').replace(/\D/g, '').slice(0, 11); window._payPhone = phone;
    clearInterval(_poll);
    $('#coBox').innerHTML = `<button class="x" onclick="closeAll()" type="button" style="position:absolute;top:12px;right:14px;z-index:5">✕</button><div style="padding:28px;max-width:720px;margin:auto">
      <div class="step"><b>1</b> Thông tin <span style="margin:0 6px">›</span><b style="background:var(--cta)">2</b> Thanh toán VietQR <span style="margin:0 6px">›</span><b>3</b> KK-MALL tự đặt mua & giao</div>
      <h2 style="margin:0 0 4px;color:var(--ink)">Đơn <span style="color:var(--cta)">${o.code}</span> đã tạo</h2><div style="color:var(--muted);font-size:13px;margin-bottom:14px">Email xác nhận đã gửi tới hộp thư của bạn. Đơn được giữ ${(KKB.cfg && KKB.cfg.unpaid_hours) || 24} giờ.</div>
      ${p && p.ready ? `<div style="display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:center" class="payg"><img src="${esc(p.qr)}" alt="Mã VietQR" style="width:240px;border-radius:14px;border:1px solid var(--line);background:#fff" referrerpolicy="no-referrer">
        <div style="font-size:14px;line-height:2">Ngân hàng: <b>${esc(p.bank)}</b><br>Số tài khoản: <b>${esc(p.acc)}</b>${copyBtn(p.acc)}<br>Chủ tài khoản: <b>${esc(p.name)}</b><br>Số tiền: <b style="color:var(--coral);font-size:18px">${vnd(p.amount)}</b>${copyBtn(p.amount)}<br>Nội dung: <b>${esc(p.content)}</b>${copyBtn(p.content)}</div></div>
        <div class="note" style="margin-top:14px">📲 Mở app ngân hàng bất kỳ → <b>Quét mã QR</b> (đã điền sẵn số tiền & nội dung) → xác nhận. Hệ thống tự ghi nhận trong vài giây, không cần gửi ảnh chụp.</div>
        <div id="payState" class="lock" style="margin-top:10px">⏳ Đang chờ thanh toán... (tự cập nhật)</div>
        <button type="button" id="claimBtn" class="btn g" style="margin-top:10px" onclick="paidClaim(${esc(JSON.stringify(String(o.code)))},_payPhone)">✅ Tôi đã chuyển khoản</button>`
        : `<div class="note">KK-MALL sẽ gọi điện / gửi email thông tin chuyển khoản cho đơn <b>${o.code}</b> trong giờ làm việc.</div>`}
      <div class="sum" style="margin-top:14px"><div class="row"><span>Tiền hàng thanh toán hộ nhà cung cấp</span><b>${vnd(o.goods)}</b></div><div class="row"><span>Phí dịch vụ KK-MALL (gồm VAT)</span><b>${vnd(o.fee_net)}</b></div><div class="row t"><span>Tổng</span><span style="color:var(--coral)">${vnd(o.total)}</span></div></div>
      <button class="btn i" onclick="showTrack(${esc(JSON.stringify(String(o.code)))},_payPhone)">📦 Theo dõi đơn hàng</button></div>`;
    show('#com');
    if (p && p.ready) _poll = setInterval(async () => {
      if (!document.getElementById('payState')) { clearInterval(_poll); return; }
      try { const r = await KKB.call('order.get', { code: o.code, phone, token: KKB.token() }); if (r.order.payment_status === 'paid') { clearInterval(_poll); const s = $('#payState'); s.className = 'lock'; s.innerHTML = '✅ <b>Đã nhận thanh toán!</b> Hệ thống đang đặt mua tại nhà cung cấp tốt nhất. Mã vận đơn sẽ gửi qua email.'; toast('Đã nhận thanh toán đơn ' + o.code); } } catch { }
    }, 8000);
  };

  /* ================= THEO DÕI ĐƠN + BẢO HÀNH / ĐỔI TRẢ ================= */
  const SHIP = { to_order: 'Đang đặt tại nhà cung cấp', ordered: 'Đã đặt - chờ giao vận chuyển', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
  const RMAST = { info_sent: 'Đã gửi hướng dẫn bảo hành', requested: 'Đã nhận yêu cầu', pickup_scheduled: 'Đã hẹn lấy hàng', returned: 'Nhà cung cấp đã nhận lại', refunded: 'Đã hoàn tiền', rejected: 'Không được chấp nhận', closed: 'Đã đóng' };
  window.showTrack = async function (code, phone) {
    code = String(code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20); phone = String(phone || '').replace(/\D/g, '').slice(0, 11);
    try {
      const d = await KKB.call('order.get', { code, phone, token: KKB.token() }); const o = d.order, paid = o.payment_status === 'paid';
      window._trk = { code, phone, o };
      const steps = [['Đặt hàng', true], ['Thanh toán', paid], ['Đặt tại nhà cung cấp', ['ordered', 'shipping', 'delivered', 'completed'].includes(o.status)], ['Đang giao', ['shipping', 'delivered', 'completed'].includes(o.status)], ['Đã giao', ['delivered', 'completed'].includes(o.status)]];
      $('#tBox').innerHTML = `<div style="padding:28px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0;color:var(--ink)">Đơn ${o.code}</h2><button class="x" onclick="closeAll()">✕</button></div>
        <div class="${paid ? 'okm' : 'err'}" style="display:block;margin:10px 0">${paid ? '✅ Đã thanh toán' : '⏳ Chưa thanh toán'} · <b>${esc(o.status_text)}</b></div>
        ${!paid && d.payment && d.payment.ready && !['cancelled'].includes(o.status) ? `<button class="btn g" onclick="payScreen(_trk.o,${JSON.stringify(d.payment).replace(/"/g, '&quot;')},_trk.phone)">📲 Thanh toán ngay bằng VietQR</button>` : ''}
        ${!paid && !['cancelled'].includes(o.status) ? (o.paid_claim_at ? `<div class="note" style="margin:8px 0">💸 Bạn đã báo chuyển khoản lúc ${new Date(o.paid_claim_at).toLocaleString('vi-VN')} - KK-MALL đang đối soát, đơn sẽ tự chuyển sang "Đã thanh toán".</div>` : `<button type="button" id="claimBtn" class="btn" style="margin:8px 0;background:#fff;color:var(--ink);border:1px solid var(--line)" onclick="paidClaim(${esc(JSON.stringify(String(o.code)))},_trk.phone)">✅ Tôi đã chuyển khoản</button>`) : ''}
        <div class="timeline">${steps.map(([t, on]) => `<div class="tl ${on ? 'on' : ''}"><span class="d"></span><div><b>${t}</b></div></div>`).join('')}</div>
        <table class="cmp">${o.lines.map(l => { const sh = o.shipments.filter(s => s.sku === l.sku); const st = sh[0]; return `<tr><td>${esc(l.name)} × ${l.qty}${st ? `<br><span style="font-size:12px;color:var(--muted)">${SHIP[st.status] || st.status}${st.tracking ? ` · ${esc(st.carrier)} <b>${esc(st.tracking)}</b>` : ''}${st.eta && st.status === 'shipped' ? ` · dự kiến giao ${esc(st.eta)}` : ''}</span>` : ''}</td><td style="text-align:right">${vnd(l.line_total)}</td>
          <td style="white-space:nowrap">${paid ? `${l.warranty_ok ? `<button class="vbtn" onclick="openRma('${l.sku}','warranty')">🛠 Bảo hành</button> ` : ''}<button class="vbtn" onclick="openRma('${l.sku}','return')">↩️ Đổi trả</button>` : ''}</td></tr>`; }).join('')}
          <tr><td>Tiền hàng (thanh toán hộ nhà cung cấp)</td><td style="text-align:right">${vnd(o.goods)}</td><td></td></tr><tr><td>Phí dịch vụ KK-MALL (gồm VAT)${o.discount ? ` - đã giảm ${vnd(o.discount)}` : ''}</td><td style="text-align:right">${vnd(o.fee_net)}</td><td></td></tr>
          <tr style="font-weight:800"><td>Tổng thanh toán</td><td style="text-align:right;color:var(--coral)">${vnd(o.total)}</td><td></td></tr></table>
        ${o.refund_due ? `<div class="note">↩️ Nhà cung cấp bán rẻ hơn dự kiến: KK-MALL sẽ hoàn lại bạn <b>${vnd(o.refund_due)}</b>.</div>` : ''}
        ${o.invoices.length ? `<div class="note">🧾 Hóa đơn phí dịch vụ: ${o.invoices.map(i => `${esc(i.inv_id)} - ${i.status === 'issued' ? 'đã gửi email' : 'đang lập'}`).join(', ')} · Hóa đơn tiền hàng do nhà cung cấp gửi trực tiếp.</div>` : ''}
        ${o.rmas.length ? `<div class="note">🛠 Yêu cầu sau bán: ${o.rmas.map(r => `<b>${esc(r.rma_id)}</b> (${r.type === 'warranty' ? 'bảo hành' : 'đổi trả'}): ${RMAST[r.status] || r.status}${r.return_tracking ? ' · mã thu hồi ' + esc(r.return_tracking) : ''}${r.pickup ? ' · lấy hàng ' + esc(r.pickup) : ''}`).join('<br>')}</div>` : ''}
        <div style="font-size:12.5px;color:var(--muted)">Giao đến: ${esc(o.customer.name)} · ${esc(o.customer.phone)} · ${esc(o.customer.address)}</div><div id="rmaBox"></div></div>`;
      show('#tm');
    } catch (x) { toast(x.message); openTrack(); }
  };
  window.openRma = function (sku, type) {
    const o = window._trk.o, l = o.lines.find(x => x.sku === sku);
    $('#rmaBox').innerHTML = `<form class="rmaf" onsubmit="sendRma(event,'${sku}','${type}')" style="margin-top:14px;border:1.5px solid var(--line);border-radius:14px;padding:14px">
      <h3 style="margin:0 0 8px;color:var(--ink)">${type === 'warranty' ? '🛠 Yêu cầu bảo hành' : '↩️ Yêu cầu đổi trả / hoàn tiền'} - ${esc(l.name)}</h3>
      ${type === 'warranty' ? '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">KK-MALL gửi ngay địa chỉ trung tâm bảo hành chính hãng, tổng đài của hãng và hướng dẫn mang theo hóa đơn GTGT tiền hàng.</div>'
        : `<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Áp dụng trong ${(KKB.cfg && KKB.cfg.return_days) || 7} ngày từ khi nhận: giao sai mẫu, vỡ/hỏng khi nhận, thiếu hàng/phụ kiện, lỗi nhà sản xuất. Bưu tá đến lấy hàng tận nơi, miễn phí.</div>`}
      <div class="f"><label>Lý do *</label><select name="reason" required>${(type === 'warranty' ? ['Không hoạt động / lỗi kỹ thuật', 'Lỗi sau thời gian sử dụng', 'Cần kích hoạt / tra cứu bảo hành', 'Khác'] : ['Giao sai mẫu / màu / phiên bản', 'Vỡ, móp, hỏng khi nhận', 'Thiếu hàng / phụ kiện', 'Lỗi nhà sản xuất (không dùng được)', 'Khác']).map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="f"><label>Mô tả chi tiết</label><textarea name="desc" rows="2" placeholder="Mô tả tình trạng, thời điểm phát hiện..."></textarea></div>
      ${type === 'return' ? `<div class="f"><label>Ảnh / video khui hàng (tối đa 4, bắt buộc với hàng vỡ/sai mẫu)</label><input type="file" name="media" accept="image/*,video/mp4" multiple></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div class="f"><label>Ngân hàng nhận hoàn</label><input name="bank" placeholder="VD: Vietcombank"></div><div class="f"><label>Số tài khoản</label><input name="acc" inputmode="numeric"></div><div class="f"><label>Chủ tài khoản</label><input name="accname"></div></div>` : ''}
      <div class="err" id="rmaErr"></div><button class="btn i" id="rmaBtn">Gửi yêu cầu</button></form>`;
    $('#rmaBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const shrink = (file) => new Promise((res) => { // nen anh <= 1600px JPEG ~0.8
    if (!/^image\//.test(file.type)) { if (file.size > 3e6) return res(null); const r = new FileReader(); r.onload = () => res({ type: file.type, b64: r.result }); r.readAsDataURL(file); return; }
    const img = new Image(); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res({ type: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.8) }); URL.revokeObjectURL(img.src); };
    img.onerror = () => res(null); img.src = URL.createObjectURL(file);
  });
  window.sendRma = async function (e, sku, type) {
    e.preventDefault(); const f = e.target, b = $('#rmaBtn'), er = $('#rmaErr'); er.style.display = 'none'; b.disabled = true; b.textContent = 'Đang gửi...';
    try {
      const images = []; if (f.media) for (const file of [...f.media.files].slice(0, 4)) { const x = await shrink(file); if (x) images.push(x); }
      const t = window._trk; const r = await KKB.call('rma.create', { code: t.code, phone: t.phone, token: KKB.token(), sku, type, reason: f.reason.value, desc: f.desc.value, images, refund: type === 'return' ? { bank: f.bank.value, acc: f.acc.value, name: f.accname.value } : null });
      $('#rmaBox').innerHTML = `<div class="okm" style="display:block;margin-top:14px">✅ Đã tạo yêu cầu <b>${esc(r.rma_id)}</b>. Hướng dẫn chi tiết đã gửi vào email của bạn.</div>${r.html ? `<div class="note" style="margin-top:8px">${r.html}</div>` : ''}`;
    } catch (x) { er.textContent = x.message; er.style.display = 'block'; b.disabled = false; b.textContent = 'Gửi yêu cầu'; }
  };

  memberBadge();
}
