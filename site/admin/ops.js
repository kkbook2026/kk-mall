/*
 * KK-MALL ADMIN OPS - vận hành đơn hàng thật qua máy chủ (Google Apps Script)
 *  Lệnh mua (PO) tự lập kế hoạch nguồn rẻ nhất · Đơn hàng tách tiền hàng/phí · Đổi trả & bảo hành
 *  Sổ kế toán thu hộ - chi hộ (1121/3388/5113/33311/632) · Hóa đơn phí dịch vụ · Cấu hình ngân hàng/công ty
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
'use strict';
const OPS = {
  on: !!(window.KK_BACKEND && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(window.KK_BACKEND)),
  tok: () => sessionStorage.getItem('kk_adm_tok'),
  orders: [], tol: 5000, vatSrc: [], cfg: null,
  async call(a, body = {}) {
    const r = await fetch(window.KK_BACKEND, { method: 'POST', body: JSON.stringify({ a, token: OPS.tok(), ...body }), redirect: 'follow' });
    const j = await r.json(); if (j && j.error) { const e = new Error(j.error); e.code = j.code; if (j.code === 401 || j.code === 403) { sessionStorage.removeItem('kk_adm_tok'); opsGate(); } throw e; } return j;
  }
};
const BANKS = [['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'], ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'], ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970441', 'VIB'], ['970437', 'HDBank'], ['970448', 'OCB'], ['970426', 'MSB'], ['970443', 'SHB'], ['970440', 'SeABank'], ['970431', 'Eximbank'], ['970449', 'LPBank']];
const POST = { to_order: '🟠 Cần đặt', ordered: '🔵 Đã đặt NCC', shipped: '🚚 Đang giao', delivered: '✅ Đã giao', cancelled: '⛔ Hủy' };
const OST = { awaiting_payment: '⏳ Chờ thanh toán', paid: '💰 Đã thanh toán', ordered: '🔵 Đã đặt NCC', shipping: '🚚 Đang giao', delivered: '✅ Đã giao', completed: '✅ Hoàn tất', cancelled: '⛔ Đã hủy', refunding: '↩️ Đang hoàn', refunded: '↩️ Đã hoàn' };
const cp = (t, label = '📋') => `<button class="btn2" style="padding:3px 8px;font-size:11.5px" onclick="navigator.clipboard.writeText(${esc(JSON.stringify(String(t)))});this.textContent='✓ Đã chép'">${label}</button>`;
const srcName = s => (SRC[s] || [s])[0];

/* ---------- khung giao diện: thêm tab ---------- */
(function injectTabs() {
  const nav = document.getElementById('nav'), main = document.querySelector('main');
  const addTab = (key, label, after) => { const b = document.createElement('button'); b.dataset.t = key; b.textContent = label; b.onclick = () => go(key); const ref = nav.querySelector(`[data-t="${after}"]`); ref ? ref.after(b) : nav.appendChild(b); };
  addTab('po', '🛒 Lệnh mua', 'orders'); addTab('rma', '↩️ Đổi trả & BH', 'po'); addTab('ledger', '📒 Sổ kế toán', 'rev'); addTab('reviews', '⭐ Đánh giá', 'rma');
  main.insertAdjacentHTML('beforeend', `
  <section class="sec" id="t-po"><h2>Lệnh mua tại nhà cung cấp <span style="font-weight:600;font-size:12px;color:var(--muted)" id="poCount"></span></h2>
    <div class="note">Mỗi đơn đã thanh toán tự sinh lệnh mua cho từng sản phẩm. Hệ thống <b>tự lập kế hoạch</b>: nguồn rẻ nhất còn hàng đã qua Bộ lọc Tin cậy, đúng mã sản phẩm, ưu tiên nguồn <b>xuất được hóa đơn GTGT</b> nếu khách yêu cầu, áp <b>biên dung sai trượt giá</b>. Người vận hành chỉ cần: <b>Mở trang nguồn → dán thông tin giao hàng (đã chép sẵn) → thanh toán → bấm "Đã đặt"</b>. Hệ thống tự hạch toán chi hộ, bù trượt giá, báo khách.</div>
    <div class="row"><select id="poF" onchange="renderPO()"><option value="to_order">Cần đặt</option><option value="ordered">Đã đặt - chờ giao vận chuyển</option><option value="shipped">Đang giao</option><option value="">Tất cả</option></select><button class="btn2" onclick="opsLoad()">⟳ Tải lại</button><button class="btn2" id="msBtn" onclick="runMailSync()">📧 Đồng bộ email nguồn ngay</button></div>
    <div id="mailSync"></div>
    <div id="poList"></div></section>
  <section class="sec" id="t-rma"><h2>Đổi trả & bảo hành</h2><div class="note">Khách gửi yêu cầu kèm ảnh/video trên trang theo dõi đơn. Bảo hành: hệ thống tự gửi trung tâm bảo hành chính hãng. Đổi trả: tạo yêu cầu trả hàng tại nhà cung cấp (bằng tài khoản đã đặt), nhập <b>mã vận đơn thu hồi + lịch lấy hàng</b> → khách nhận email tự động. Khi nhà cung cấp hoàn tiền về, bấm <b>Hoàn tiền</b> ở tab Đơn hàng.</div><div class="card"><table id="rmaTbl"></table></div></section>
  <section class="sec" id="t-ledger"><h2>Sổ kế toán thu hộ - chi hộ</h2><div class="note">Theo mô hình ủy quyền: tiền hàng ghi <b>TK 3388 (phải trả khác - thu hộ, chi hộ)</b>, chỉ <b>phí dịch vụ</b> ghi doanh thu <b>TK 5113</b> + thuế GTGT đầu ra <b>TK 33311</b>; trượt giá KK-MALL bù ghi <b>TK 632</b>; hoàn phí ghi <b>TK 5213</b>. Mỗi mã đơn đối soát 1-1: tiền khách chuyển vào ↔ tiền chi nhà cung cấp.</div>
    <div class="cards" id="ldCards"></div><div class="row"><button class="btn2 pri" onclick="exportLedger()">⬇ Xuất sổ (CSV - Excel)</button></div>
    <div class="card"><b style="color:var(--ink)">Đối soát theo đơn</b><table id="ldRecon" style="margin-top:8px"></table></div><div class="card"><b style="color:var(--ink)">Nhật ký bút toán</b><table id="ldTbl" style="margin-top:8px"></table></div></section>`);
  main.insertAdjacentHTML('beforeend', `<section class="sec" id="t-reviews"><h2>Đánh giá từ người đã nhận hàng <span style="font-weight:600;font-size:12px;color:var(--muted)" id="rvCount"></span></h2>
    <div class="note">Chỉ khách có đơn KK-MALL <b>đã giao</b> mới đánh giá được (mỗi sản phẩm/đơn 1 lần). Nội dung chứa liên kết, số điện thoại, email hoặc từ ngữ thô tục tự chuyển <b>Chờ duyệt</b>. Trang sản phẩm chỉ hiện sao khi có đánh giá thật.</div>
    <div class="row"><select id="rvF" onchange="renderReviews()"><option value="pending">Chờ duyệt</option><option value="published">Đang hiển thị</option><option value="hidden">Đã ẩn</option><option value="">Tất cả</option></select><button class="btn2" onclick="loadReviewsAdm()">⟳ Tải lại</button></div>
    <div class="card"><table id="rvTbl"></table></div></section>`);
  document.querySelector('#t-orders .note').insertAdjacentHTML('afterend', '<div id="rfQueue"></div>');
  document.querySelector('#t-orders .note').innerHTML = 'Đơn hàng từ <b>máy chủ</b> (mọi khách, mọi thiết bị). Cột tách: <b>Tiền hàng thu hộ</b> (chi trả nhà cung cấp, TK 3388) và <b>Phí DV KK-MALL</b> (doanh thu, TK 5113 + VAT). Thanh toán VietQR tự xác nhận qua webhook ngân hàng; có thể xác nhận tay.';
})();

/* ---------- đăng nhập máy chủ (OTP email quản trị) ---------- */
function opsGate() {
  let g = document.getElementById('opsGate');
  if (!g) { g = document.createElement('div'); g.id = 'opsGate'; document.querySelector('main').prepend(g); }
  if (!OPS.on) { g.innerHTML = `<div class="note" style="background:#FFF7ED;border-color:#FED7AA;color:#9A3412">⚠️ Chưa cấu hình máy chủ đơn hàng (config.js → KK_BACKEND). Các tab đơn hàng đang đọc dữ liệu trình diễn trên thiết bị này.</div>`; return; }
  if (OPS.tok()) { g.innerHTML = ''; return; }
  g.innerHTML = `<div class="card" style="border-color:#FED7AA;background:#FFFBEB"><b style="color:#92400E">🔐 Kết nối máy chủ đơn hàng</b> - xác thực mã OTP gửi tới email quản trị
    <div class="row" style="margin:10px 0 0"><input id="opsEm" value="${esc(sessionStorage.getItem('kk_admin_email') || '')}" style="max-width:280px"><button class="btn2 pri" onclick="opsOtp()">Gửi mã</button><input id="opsCode" placeholder="Mã 6 số" style="max-width:140px" inputmode="numeric"><button class="btn2 pri" onclick="opsVerify()">Xác thực</button><span id="opsMsg" style="font-size:12.5px"></span></div></div>`;
}
async function opsOtp() {
  const m = $('#opsMsg'), b = document.querySelector('#opsGate button.pri'); if (b && b.disabled) return;
  try {
    if (b) b.disabled = true; const r = await OPS.call('otp.request', { email: $('#opsEm').value.trim() });
    const t = new Date(Date.now() - ((r.reused ? 600 - (r.expires_in || 600) : 0) * 1000)).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    m.textContent = r.reused ? '✓ Mã đã gửi lúc ' + t + ' vẫn dùng được - mở email mới nhất và nhập mã' : '✓ Đã gửi mã lúc ' + t + ' - nhập mã trong email MỚI NHẤT (hiệu lực 10 phút)';
    let w = r.wait || 60; const lab = b ? b.textContent : ''; if (b) { const iv = setInterval(() => { w--; b.textContent = 'Gửi lại (' + w + 's)'; if (w <= 0) { clearInterval(iv); b.disabled = false; b.textContent = 'Gửi mã'; } }, 1000); }
    const ci = $('#opsCode'); if (ci) ci.focus();
  } catch (e) { m.textContent = '⚠ ' + e.message; if (b) b.disabled = false; }
}
async function opsVerify() { const m = $('#opsMsg'); try { const r = await OPS.call('otp.verify', { email: $('#opsEm').value.trim(), code: $('#opsCode').value.trim(), scope: 'admin' }); if (r.member.role !== 'admin') { m.textContent = '⚠ Email này không có quyền quản trị'; return; } sessionStorage.setItem('kk_adm_tok', r.token); opsGate(); opsLoad(); } catch (e) { m.textContent = '⚠ ' + e.message; } }

/* ---------- tải dữ liệu ---------- */
async function opsLoad() {
  if (!OPS.on || !OPS.tok()) return;
  try {
    const [o, cfg] = await Promise.all([OPS.call('admin.orders', { limit: 500 }), OPS.call('admin.config')]);
    OPS.orders = o.orders; OPS.tol = o.tolerance; OPS.vatSrc = o.vat_sources; OPS.cfg = cfg; FEE_TABLE = o.fee_table;
    try { const sk = sessionStorage.getItem('kk_stats_key'); if (sk && cfg.STATS_KEY !== sk) { OPS.cfg = await OPS.call('admin.config', { set: { STATS_KEY: sk } }); logAdmin('Đăng ký khóa thống kê ship cho bộ thu thập'); } } catch (e) { console.warn('stats key', e); }
    renderOrders(); renderRev(); renderPO(); renderCmp(); renderOpsCfg(); renderMailSync(); renderRefunds(); loadReviewsAdm();
    OPS.call('admin.rmas').then(r => { OPS.rmas = r.rows; renderRMA(); });
    OPS.call('admin.ledger').then(r => { OPS.ledger = r.rows; renderLedger(); });
    OPS.call('admin.invoices').then(r => { OPS.invs = r.rows; renderFeeInv(); });
    OPS.call('admin.members').then(r => { OPS.mems = r.rows; renderCust(); });
  } catch (e) { console.warn(e); }
}

/* ---------- sổ đơn: dùng dữ liệu máy chủ cho các tab sẵn có (doanh thu, khách hàng, hóa đơn) ---------- */
const _orderRowsLocal = orderRows;
orderRows = function () {
  if (!OPS.on || !OPS.tok()) return _orderRowsLocal();
  return OPS.orders.map(o => ({ order: { code: o.code, created_at: o.created_at, customer_name: o.customer.name, customer_phone: o.customer.phone, customer_email: o.customer.email, customer_address: o.customer.address, note: o.customer.note,
    items: o.lines.map(l => ({ sku: l.sku, name: l.name, qty: l.qty, unit: l.unit, line_total: l.line_total })), discount: o.discount, total: o.total, payment_method: 'vietqr', payment_status: o.payment_status === 'paid' ? 'paid' : 'unpaid', status: o.status },
    fulfillments: o.po.map(p => ({ tracking_code: p.tracking })), invoice: o.invoices[0] ? { number: o.invoices[0].inv_id } : null, _o: o }));
};
const _renderOrders = renderOrders;
renderOrders = function () {
  if (!OPS.on || !OPS.tok()) return _renderOrders();
  const q = ($('#ordQ') ? $('#ordQ').value : '').trim().toLowerCase();
  const rows = OPS.orders.filter(o => !q || (o.code + ' ' + o.customer.name + ' ' + o.customer.phone + ' ' + o.customer.email).toLowerCase().includes(q));
  $('#ordCount').textContent = '· ' + rows.length + ' đơn (máy chủ)';
  $('#ordTbl').innerHTML = '<tr><th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th><th>Tiền hàng thu hộ<br><small>TK 3388</small></th><th>Phí DV KK-MALL<br><small>TK 5113 + VAT</small></th><th>Tổng</th><th>Trạng thái</th><th>Thao tác</th></tr>' + (rows.map(o => {
    const paid = o.payment_status === 'paid';
    return `<tr><td><b>${o.code}</b><br><span style="font-size:11px;color:var(--muted)">${new Date(o.created_at).toLocaleString('vi-VN')}</span>${o.vat ? '<br><span class="badge" style="background:#DBEAFE;color:#1E40AF">VAT: ' + esc(o.vat.tax_code || o.vat.name) + '</span>' : ''}</td>
    <td style="min-width:170px">${esc(o.customer.name)}<br><span style="font-size:11px;color:var(--muted)">📞 ${esc(o.customer.phone)}<br>✉ ${esc(o.customer.email)}<br>🏠 ${esc(o.customer.address)}</span></td>
    <td style="font-size:12px;min-width:200px">${o.lines.map(l => `${esc(l.name)}<br><span style="color:var(--muted)">${l.sku} · ${l.qty} × (${vnd(l.unit_cost)} + phí ${vnd(l.unit_fee)})</span>`).join('<hr style="border:0;border-top:1px dashed var(--line);margin:4px 0">')}</td>
    <td>${vnd(o.goods)}</td><td class="mg">${vnd(o.fee_net)}${o.discount ? `<br><small style="color:var(--ok)">đã giảm ${vnd(o.discount)}</small>` : ''}<br><small style="color:var(--muted)">trước thuế ${vnd(o.fee_pre_tax)} · VAT ${vnd(o.fee_vat)}</small></td>
    <td class="kk">${vnd(o.total)}</td><td style="font-size:12px">${OST[o.status] || o.status}${o.refund_due ? `<br><span class="warn">phải hoàn ${vnd(o.refund_due)}</span>` : ''}${o.paid_at ? '<br><small style="color:var(--muted)">TT ' + new Date(o.paid_at).toLocaleString('vi-VN') + '</small>' : ''}</td>
    <td style="font-size:12px;min-width:150px">${!paid && o.paid_claim_at && o.status === 'awaiting_payment' ? `<div style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:4px 8px;margin-bottom:4px;font-weight:700">💸 Khách báo đã CK lúc ${new Date(o.paid_claim_at).toLocaleString('vi-VN')} - kiểm tra app ngân hàng</div>` : ''}${!paid && o.status === 'awaiting_payment' ? `<button class="btn2 pri" onclick="ordAct('${o.code}','mark_paid')">💰 Đã nhận tiền</button> <button class="btn2" onclick="ordAct('${o.code}','cancel')">Hủy</button>` : ''}
      ${paid && !['refunded'].includes(o.status) ? `<input id="rf_${o.code}" placeholder="Số tiền hoàn" value="${o.refund_due || ''}" style="width:110px;padding:5px 7px;font-size:12px"> <input id="rr_${o.code}" placeholder="Mã GD" style="width:90px;padding:5px 7px;font-size:12px"> <button class="btn2" onclick="ordAct('${o.code}','refund')">↩️ Hoàn tiền</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="8">Chưa có đơn hàng.</td></tr>');
};
async function ordAct(code, action) {
  const body = { code, action };
  if (action === 'mark_paid') { const o = OPS.orders.find(x => x.code === code); body.amount = o.total; body.ref = 'XAC-NHAN-TAY'; if (!confirm(`Xác nhận ĐÃ NHẬN ${vnd(o.total)} cho đơn ${code}? Hệ thống sẽ hạch toán và tạo lệnh mua.`)) return; }
  if (action === 'cancel' && !confirm('Hủy đơn ' + code + '?')) return;
  if (action === 'refund') { body.amount = Number(($('#rf_' + code).value || '').replace(/\D/g, '')); body.ref = $('#rr_' + code).value.trim(); if (!body.amount) return alert('Nhập số tiền hoàn'); if (!confirm(`Ghi nhận ĐÃ HOÀN ${vnd(body.amount)} cho đơn ${code}?`)) return; }
  try { await OPS.call('admin.order.update', body); logAdmin('Đơn ' + code + ': ' + action); await opsLoad(); } catch (e) { alert(e.message); }
}

/* ---------- doanh thu tách tiền hàng / phí dịch vụ ---------- */
const _renderRev = renderRev;
renderRev = function () {
  _renderRev();
  if (!OPS.on || !OPS.tok()) return;
  const paid = OPS.orders.filter(o => o.payment_status === 'paid' && o.status !== 'refunded');
  const s = k => paid.reduce((a, o) => a + (o[k] || 0), 0);
  $('#revCards').innerHTML = [['Tổng tiền khách thanh toán', vnd(s('total'))], ['Tiền hàng thu hộ (chi trả NCC)', vnd(s('goods'))], ['Doanh thu phí DV (gồm VAT)', vnd(s('fee_net'))], ['Phí DV trước thuế (TK 5113)', vnd(s('fee_pre_tax'))], ['VAT đầu ra phí DV', vnd(s('fee_vat'))], ['Số đơn đã thanh toán', paid.length], ['Phí DV TB/đơn', vnd(Math.round(s('fee_net') / (paid.length || 1)))]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:17px">${v}</div></div>`).join('');
};
const _renderCust = renderCust;
renderCust = function () {
  _renderCust();
  if (!OPS.mems) return;
  $('#memTbl').innerHTML = '<tr><th>Email</th><th>Họ tên</th><th>SĐT</th><th>Vai trò</th><th>Đăng ký</th><th>Đăng nhập gần nhất</th></tr>' + OPS.mems.map(m => `<tr><td><b>${esc(m.email)}</b></td><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${m.role === 'admin' ? '⚡ admin' : 'thành viên'}</td><td style="font-size:12px">${m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : '-'}</td><td style="font-size:12px">${m.last_login ? new Date(m.last_login).toLocaleString('vi-VN') : '-'}</td></tr>`).join('');
  document.querySelector('#t-cust .card b').textContent = 'Thành viên (máy chủ - đăng nhập OTP)';
};

/* ---------- LỆNH MUA: tự lập kế hoạch nguồn rẻ nhất ---------- */
function planPO(po, o) {
  const row = DATA && DATA.rows.find(r => r.sku === po.sku);
  const unit = Number(po.data.unit_cost) || Math.round(po.collected_cost / po.qty), needVat = !!o.vat;
  // so sanh theo GIA THUC TRA (niem yet + ship du phong cua nguon) - tien hang da thu cua khach cung la gia thuc tra
  const offers = (row ? row.offers : []).filter(x => x.k && !x.x).map(x => { const l = x.l != null ? x.l : x.p; return { ...x, l, diff: l - unit, vat: OPS.vatSrc.includes(x.s) }; }).sort((a, b) => a.l - b.l);
  const fit = offers.filter(x => x.diff <= OPS.tol);
  let pick = needVat ? fit.find(x => x.vat) : fit[0], warn = '';
  if (!pick && needVat && fit.length) { pick = fit[0]; warn = 'Không có nguồn xuất VAT trong biên dung sai - xác nhận với người bán trước khi đặt'; }
  const act = !offers.length ? ['refund', 'Không còn nguồn hợp lệ còn hàng → đề xuất hoàn tiền / chờ nguồn'] : !pick ? ['refund', `Mọi nguồn cao hơn giá đã thu quá ${vnd(OPS.tol)} → đề xuất hoàn tiền hoặc báo khách`]
    : pick.diff < 0 ? ['go', `Đặt ngay - rẻ hơn dự kiến ${vnd(-pick.diff * po.qty)} (sẽ hoàn khách)`] : pick.diff > 0 ? ['go', `Đặt - KK-MALL bù trượt giá ${vnd(pick.diff * po.qty)} (trong biên dung sai)`] : ['go', 'Đặt ngay - đúng giá đã thu'];
  return { unit, offers, pick, act, warn, needVat, row };
}
function renderPO() {
  if (!OPS.on || !OPS.tok()) { $('#poList').innerHTML = '<div class="note">Kết nối máy chủ đơn hàng để xem lệnh mua.</div>'; return; }
  const f = $('#poF').value; const list = [];
  for (const o of OPS.orders) for (const p of o.po) if (!f || p.status === f) list.push([p, o]);
  $('#poCount').textContent = '· ' + list.length + ' lệnh';
  const open = OPS.orders.reduce((a, o) => a + o.po.filter(p => p.status === 'to_order').length, 0);
  const nb = document.querySelector('[data-t="po"]'); if (nb) nb.textContent = '🛒 Lệnh mua' + (open ? ` (${open})` : '');
  $('#poList').innerHTML = list.map(([p, o]) => {
    const pl = planPO(p, o), s = o.customer, v = o.vat, id = p.po_id.replace(/\W/g, '_');
    const shipTxt = `${s.name}\n${s.phone}\n${s.address}`;
    return `<div class="card" style="border-left:5px solid ${p.status === 'to_order' ? '#EA580C' : p.status === 'delivered' ? '#10B981' : '#3B82F6'}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b style="font-size:15px">${esc(p.name)}</b> × <b>${p.qty}</b><br><span style="font-size:12px;color:var(--muted)">${p.po_id} · ${p.sku} · đơn ${o.code} · đã thu tiền hàng <b>${vnd(p.collected_cost)}</b> (${vnd(pl.unit)}/sp)</span></div><div style="font-weight:800">${POST[p.status] || p.status}</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px" class="pog">
        <div style="background:#F8FAFC;border-radius:10px;padding:10px 12px;font-size:13px"><b>📦 Giao tới (điền vào ô người nhận tại nguồn)</b> ${cp(shipTxt, '📋 Chép tất cả')}<br>${esc(s.name)} ${cp(s.name)}<br>${esc(s.phone)} ${cp(s.phone)}<br>${esc(s.address)} ${cp(s.address)}${s.note ? '<br><i>Ghi chú: ' + esc(s.note) + '</i>' : ''}</div>
        <div style="background:${v ? '#EFF6FF' : '#F8FAFC'};border-radius:10px;padding:10px 12px;font-size:13px">${v ? `<b>🧾 Xuất hóa đơn GTGT tiền hàng cho khách</b> ${cp(`${v.name}\nMST: ${v.tax_code || ''}\n${v.address || ''}\n${v.email || ''}`, '📋 Chép')}<br>${esc(v.name)}<br>MST: <b>${esc(v.tax_code || '-')}</b><br>${esc(v.address || '')}<br>Email nhận HĐ: ${esc(v.email || '')}` : '<b>🧾 Không yêu cầu hóa đơn GTGT</b><br><span style="color:var(--muted)">Có thể đặt tại nguồn rẻ nhất bất kỳ.</span>'}</div></div>
      ${p.status === 'to_order' ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:${pl.act[0] === 'go' ? '#ECFDF5' : '#FEF2F2'};color:${pl.act[0] === 'go' ? '#065F46' : '#991B1B'};font-weight:700;font-size:13px">🤖 Kế hoạch: ${pl.pick ? `<b>${esc(srcName(pl.pick.s))}</b> - thực trả ${vnd(pl.pick.l)}/sp${pl.pick.sh ? ' (niêm yết ' + vnd(pl.pick.p) + ' + ship dự phòng ' + vnd(pl.pick.sh) + ')' : ' (freeship)'} · ` : ''}${pl.act[1]}${pl.warn ? '<br>⚠️ ' + pl.warn : ''}${pl.row ? '' : '<br>⚠️ Mở khóa dữ liệu so sánh giá để xem nguồn'}</div>${botBadge(p)}
        <table style="margin-top:8px"><tr><th>Nguồn</th><th>Niêm yết/sp</th><th>Ship dự phòng</th><th>Thực trả/sp</th><th>So với đã thu</th><th>Xuất VAT</th><th></th></tr>${pl.offers.slice(0, 5).map(x => `<tr${pl.pick && x.s === pl.pick.s ? ' style="background:#DCFCE7"' : ''}><td><span class="src-dot" style="background:${(SRC[x.s] || ['', '#999'])[1]}"></span>${esc(srcName(x.s))}</td><td>${vnd(x.p)}</td><td style="color:#B45309">${x.sh ? '+' + vnd(x.sh) : '0'}</td><td><b>${vnd(x.l)}</b></td><td class="${x.diff > OPS.tol ? 'warn' : x.diff > 0 ? '' : 'good'}">${x.diff > 0 ? '+' : ''}${vnd(x.diff)}</td><td>${x.vat ? '✓ có' : '<span style="color:var(--muted)">không chắc</span>'}</td><td>${x.u ? `<a class="btn2" href="${safeUrl(x.u)}" target="_blank" rel="noopener noreferrer">Mở trang nguồn ↗</a>` : '<span style="color:var(--muted);font-size:11px">chưa có link</span>'}</td></tr>`).join('') || '<tr><td colspan="5">Không có nguồn hợp lệ còn hàng.</td></tr>'}</table>
        <div class="row" style="margin-top:10px"><select id="ps_${id}" style="max-width:170px">${Object.keys(SRC).map(k => `<option value="${k}" ${pl.pick && pl.pick.s === k ? 'selected' : ''}>${esc(SRC[k][0])}</option>`).join('')}</select>
          <input id="pc_${id}" placeholder="TỔNG thực trả NCC (gồm ship)" value="${pl.pick ? pl.pick.l * p.qty : ''}" style="max-width:200px" title="Tổng số tiền đã thanh toán cho nguồn, gồm tiền hàng + phí ship/phụ phí"><input id="psh_${id}" placeholder="Trong đó ship/phụ phí" value="${pl.pick ? pl.pick.sh * p.qty : ''}" style="max-width:170px" title="Phần phí vận chuyển/phụ phí thực tế tại nguồn - dùng để hệ thống tự hiệu chỉnh dự phòng ship"><input id="pi_${id}" placeholder="Mã đơn tại nguồn" style="max-width:180px">
          <label style="display:flex;gap:5px;align-items:center;font-size:12.5px;width:auto;margin:0"><input type="checkbox" id="pv_${id}" style="width:auto" ${v ? 'checked' : ''}> Đã yêu cầu xuất VAT</label>
          <button class="btn2 pri" onclick="poAct('${p.po_id}','ordered','${id}')">✅ Đã đặt & thanh toán</button><button class="btn2" onclick="poAct('${p.po_id}','cancelled','${id}')">⛔ Hủy lệnh</button></div>`
      : `<div style="font-size:13px;margin-top:8px">Nguồn: <b>${esc(srcName(p.actual_source))}</b> · Thực trả: <b>${vnd(p.actual_cost)}</b> (${Number(p.actual_cost) > Number(p.collected_cost) ? 'bù ' + vnd(p.actual_cost - p.collected_cost) : Number(p.actual_cost) < Number(p.collected_cost) ? 'hoàn khách ' + vnd(p.collected_cost - p.actual_cost) : 'đúng giá'}) · Mã đơn nguồn: <b>${esc(p.supplier_order_id)}</b>${p.tracking ? ' · Vận đơn: <b>' + esc(p.data.carrier || '') + ' ' + esc(p.tracking) + '</b>' : ''}${p.data.eta ? ' · Dự kiến giao: <b>' + esc(p.data.eta) + '</b>' : ''}${p.data.auto ? ' · <span style="color:#1D4ED8;font-weight:700">🤖 tự gắn từ email nguồn</span>' : ''}${Number(p.data.refund_due) > 0 ? ' · <span style="color:#B45309;font-weight:700">phải hoàn khách ' + vnd(p.data.refund_due) + '</span>' : ''}</div>
        ${p.status === 'ordered' ? `<div class="row" style="margin-top:8px"><input id="pk_${id}" placeholder="Đơn vị vận chuyển (GHN, SPX...)" style="max-width:200px"><input id="pt_${id}" placeholder="Mã vận đơn" style="max-width:200px"><button class="btn2 pri" onclick="poAct('${p.po_id}','shipped','${id}')">🚚 Đã giao vận chuyển</button></div>` : ''}
        ${p.status === 'shipped' ? `<div class="row" style="margin-top:8px"><button class="btn2 pri" onclick="poAct('${p.po_id}','delivered','${id}')">📦 Khách đã nhận hàng</button></div>` : ''}`}</div>`;
  }).join('') || '<div class="card" style="color:var(--muted)">Không có lệnh mua ở trạng thái này. 🎉</div>';
}
async function poAct(po_id, status, id) {
  const b = { po_id, status };
  if (status === 'ordered') { b.actual_source = $('#ps_' + id).value; b.actual_cost = Number(($('#pc_' + id).value || '').replace(/\D/g, '')); b.supplier_order_id = $('#pi_' + id).value.trim(); b.vat_requested = $('#pv_' + id).checked; b.ship_paid = ($('#psh_' + id).value || '').replace(/\D/g, ''); if (!b.actual_cost) return alert('Nhập tổng tiền thực trả nhà cung cấp'); if (!b.supplier_order_id) return alert('Nhập mã đơn tại nguồn (để đối soát)'); }
  if (status === 'shipped') { b.carrier = $('#pk_' + id).value.trim(); b.tracking = $('#pt_' + id).value.trim(); if (!b.tracking) return alert('Nhập mã vận đơn'); }
  if (status === 'cancelled') { b.note = prompt('Lý do hủy lệnh mua (khách sẽ được xử lý hoàn tiền):') || ''; if (!b.note) return; }
  try { await OPS.call('admin.po.update', b); logAdmin('Lệnh mua ' + po_id + ': ' + status); await opsLoad(); go('po'); } catch (e) { alert(e.message); }
}

/* ---------- ĐỔI TRẢ & BẢO HÀNH ---------- */
const RST = { info_sent: 'Đã gửi hướng dẫn BH', requested: '🟠 Mới - cần tạo yêu cầu tại nguồn', pickup_scheduled: '🚚 Đã hẹn lấy hàng', returned: '📦 NCC đã nhận lại', refunded: '✅ Đã hoàn tiền', rejected: '⛔ Từ chối', closed: 'Đã đóng' };
function renderRMA() {
  const R = OPS.rmas || [];
  const nb = document.querySelector('[data-t="rma"]'); const open = R.filter(r => r.type === 'return' && ['requested', 'pickup_scheduled', 'returned'].includes(r.status)).length; if (nb) nb.textContent = '↩️ Đổi trả & BH' + (open ? ` (${open})` : '');
  $('#rmaTbl').innerHTML = '<tr><th>Mã</th><th>Đơn / SP</th><th>Loại · lý do</th><th>Bằng chứng</th><th>Trạng thái</th><th>Xử lý</th></tr>' + (R.map(r => {
    const d = r.data || {}, id = r.rma_id.replace(/\W/g, '_');
    return `<tr><td><b>${esc(r.rma_id)}</b><br><small style="color:var(--muted)">${new Date(r.created_at).toLocaleString('vi-VN')}</small></td><td>${r.order_code}<br><small>${r.sku}</small></td>
      <td style="font-size:12.5px">${r.type === 'warranty' ? '🛠 Bảo hành' : '↩️ Đổi trả'} · <b>${esc(r.reason)}</b><br><span style="color:var(--muted)">${esc(d.desc || '')}</span>${d.warranty ? `<br>Hãng ${esc(d.warranty.brand)} ${esc(d.warranty.hotline || '')}` : ''}</td>
      <td style="font-size:12px">${(d.files || []).map((u, i) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">Tệp ${i + 1}</a>`).join(' · ') || '-'}${d.refund_to && d.refund_to.acc ? `<br>Hoàn về: ${esc(d.refund_to.bank)} ${esc(d.refund_to.acc)} - ${esc(d.refund_to.name)}` : ''}${d.amount ? `<br>Tiền hàng: <b>${vnd(d.amount)}</b>` : ''}</td>
      <td style="font-size:12.5px">${RST[r.status] || r.status}${d.return_tracking ? '<br>Mã thu hồi: <b>' + esc(d.return_tracking) + '</b>' : ''}${d.pickup ? '<br>Lấy hàng: ' + esc(d.pickup) : ''}</td>
      <td style="min-width:260px">${r.type === 'return' && !['refunded', 'rejected', 'closed'].includes(r.status) ? `<input id="rt_${id}" placeholder="Mã vận đơn thu hồi" value="${esc(d.return_tracking || '')}" style="margin-bottom:4px"><input id="rp_${id}" placeholder="Lịch lấy hàng (VD: 25/10 9-12h)" value="${esc(d.pickup || '')}" style="margin-bottom:4px"><input id="rs_${id}" placeholder="Mã yêu cầu tại nguồn" value="${esc(d.supplier_rma_id || '')}" style="margin-bottom:4px">
        <div class="row" style="margin:0"><button class="btn2 pri" onclick="rmaAct('${r.rma_id}','pickup_scheduled','${id}')">🚚 Báo lịch lấy hàng</button><button class="btn2" onclick="rmaAct('${r.rma_id}','returned','${id}')">📦 NCC đã nhận</button><button class="btn2" onclick="rmaAct('${r.rma_id}','refunded','${id}')">✅ Đã hoàn</button><button class="btn2" onclick="rmaAct('${r.rma_id}','rejected','${id}')">⛔ Từ chối</button></div>` : '-'}</td></tr>`;
  }).join('') || '<tr><td colspan="6">Chưa có yêu cầu.</td></tr>');
}
async function rmaAct(rma_id, status, id) {
  const b = { rma_id, status, return_tracking: $('#rt_' + id).value.trim(), pickup: $('#rp_' + id).value.trim(), supplier_rma_id: $('#rs_' + id).value.trim() };
  if (status === 'returned' || status === 'refunded') { const v = prompt('Số tiền nhà cung cấp ĐÃ HOÀN về tài khoản KK-MALL cho hàng trả lại (để 0 nếu chưa hoàn):', '0'); if (v === null) return; b.supplier_refund = Number(String(v).replace(/\D/g, '')) || 0; }
  if (status === 'pickup_scheduled' && (!b.return_tracking || !b.pickup)) return alert('Nhập mã vận đơn thu hồi và lịch lấy hàng');
  if (status === 'rejected') { b.note = prompt('Lý do (gửi cho khách):') || ''; if (!b.note) return; }
  try { await OPS.call('admin.rma.update', b); const r = await OPS.call('admin.rmas'); OPS.rmas = r.rows; renderRMA(); if (status === 'refunded') alert('Nhớ ghi nhận "Hoàn tiền" ở tab Đơn hàng để hạch toán.'); } catch (e) { alert(e.message); }
}

/* ---------- SỔ KẾ TOÁN ---------- */
function renderLedger() {
  const L = OPS.ledger || [], acc = {};
  for (const e of L) { if (e.debit) (acc[e.debit] = acc[e.debit] || { d: 0, c: 0 }).d += Number(e.amount); if (e.credit) (acc[e.credit] = acc[e.credit] || { d: 0, c: 0 }).c += Number(e.amount); }
  const N = { 1121: 'Tiền gửi NH', 3388: 'Thu hộ - chi hộ', 5113: 'DT phí dịch vụ', 33311: 'VAT đầu ra', 632: 'Bù trượt giá', 5213: 'Giảm trừ DT' };
  $('#ldCards').innerHTML = Object.entries(acc).map(([k, v]) => `<div class="stat"><div class="k">TK ${k} · ${N[k] || ''}</div><div class="v" style="font-size:16px">Nợ ${vnd(v.d)}<br>Có ${vnd(v.c)}</div><div class="k">Số dư ${['1121', '632', '5213'].includes(k) ? 'Nợ' : 'Có'}: <b>${vnd(Math.abs(v.d - v.c))}</b></div></div>`).join('') || '<div class="stat"><div class="k">Chưa có bút toán</div></div>';
  const by = {}; for (const e of L) { const o = by[e.order_code] = by[e.order_code] || { in: 0, out: 0, h: 0 }; if (e.debit == '1121') o.in += +e.amount; if (e.credit == '1121') o.out += +e.amount; if (e.credit == '3388') o.h += +e.amount; if (e.debit == '3388') o.h -= +e.amount; }
  $('#ldRecon').innerHTML = '<tr><th>Mã đơn</th><th>Tiền khách chuyển vào</th><th>Đã chi (NCC + hoàn)</th><th>Còn giữ hộ (TK 3388)</th><th>Đối soát</th></tr>' + Object.entries(by).map(([c, o]) => `<tr><td><b>${c}</b></td><td>${vnd(o.in)}</td><td>${vnd(o.out)}</td><td class="${o.h > 0 ? 'warn' : ''}">${vnd(o.h)}</td><td>${o.h === 0 ? '<span class="good">✓ khớp</span>' : o.h > 0 ? 'chờ chi trả NCC / hoàn khách' : '<span class="warn">kiểm tra</span>'}</td></tr>`).join('');
  $('#ldTbl').innerHTML = '<tr><th>Thời điểm</th><th>Mã đơn</th><th>Chứng từ</th><th>Nợ</th><th>Có</th><th>Số tiền</th><th>Diễn giải</th></tr>' + L.slice(0, 400).map(e => `<tr><td style="font-size:12px">${new Date(e.at).toLocaleString('vi-VN')}</td><td>${e.order_code}</td><td style="font-size:12px">${esc(e.ref)}</td><td>${e.debit}</td><td>${e.credit}</td><td>${vnd(e.amount)}</td><td style="font-size:12.5px">${esc(e.note)}</td></tr>`).join('');
}
function exportLedger() {
  const L = OPS.ledger || []; const lines = [['Thời điểm', 'Mã đơn', 'Chứng từ', 'TK Nợ', 'TK Có', 'Số tiền', 'Diễn giải'].map(csvq).join(',')];
  for (const e of L.slice().reverse()) lines.push([new Date(e.at).toLocaleString('vi-VN'), e.order_code, e.ref, e.debit, e.credit, e.amount, e.note].map(csvq).join(','));
  dl('﻿' + lines.join('\r\n'), `kk-mall-so-ke-toan-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); logAdmin('Xuất sổ kế toán');
}

/* ---------- HÓA ĐƠN PHÍ DỊCH VỤ ---------- */
function renderFeeInv() {
  let c = document.getElementById('feeInvCard');
  if (!c) { c = document.createElement('div'); c.className = 'card'; c.id = 'feeInvCard'; document.querySelector('#t-inv .note').after(c); }
  const I = OPS.invs || [];
  c.innerHTML = `<b style="color:var(--ink)">Hóa đơn GTGT phí dịch vụ KK-MALL (máy chủ)</b> <span style="font-size:12px;color:var(--muted)">Tự lập bản nháp khi đơn giao thành công. Phát hành trên phần mềm HĐĐT (Viettel/VNPT/MISA) → nhập số HĐ → "Phát hành & gửi" để email khách. Hóa đơn tiền hàng do nhà cung cấp xuất.</span>
    <table style="margin-top:8px"><tr><th>Số HĐ nội bộ</th><th>Đơn</th><th>Người mua</th><th>Nội dung</th><th>Trước thuế</th><th>VAT</th><th>Tổng</th><th>Trạng thái</th></tr>${I.map(i => `<tr><td><b>${esc(i.inv_id)}</b><br><small style="color:var(--muted)">${new Date(i.created_at).toLocaleDateString('vi-VN')}</small></td><td>${i.order_code}</td><td>${esc(i.buyer)}${i.tax_code ? '<br><small>MST ' + esc(i.tax_code) + '</small>' : ''}</td><td style="font-size:12px">${esc(i.content)}</td><td>${vnd(i.pre_tax)}</td><td>${vnd(i.vat)} <small>(${i.vat_rate}%)</small></td><td class="kk">${vnd(i.total)}</td>
      <td>${i.status === 'issued' ? '<span class="good">✓ Đã phát hành & gửi</span>' : `<input id="ein_${esc(i.inv_id)}" placeholder="Số HĐĐT" style="width:110px;padding:5px 7px"> <button class="btn2 pri" onclick="invIssue(${esc(JSON.stringify(String(i.inv_id)))})">Phát hành & gửi</button>`}</td></tr>`).join('') || '<tr><td colspan="8">Chưa có hóa đơn phí dịch vụ.</td></tr>'}</table>`;
}
async function invIssue(id) { try { await OPS.call('admin.invoice.issue', { inv_id: id, einvoice_no: document.getElementById('ein_' + id).value.trim() }); const r = await OPS.call('admin.invoices'); OPS.invs = r.rows; renderFeeInv(); } catch (e) { alert(e.message); } }

/* ---------- CẤU HÌNH (ngân hàng VietQR, công ty, tham số) ---------- */
function renderOpsCfg() {
  let c = document.getElementById('opsCfg');
  if (!c) { c = document.createElement('div'); c.className = 'card'; c.id = 'opsCfg'; document.getElementById('t-sys').prepend(c); }
  const C = OPS.cfg || {}; let co = {}; try { co = JSON.parse(C.COMPANY_JSON || '{}'); } catch { }
  c.innerHTML = `<b style="color:var(--ink)">⚙️ Cấu hình vận hành (máy chủ)</b>
    <div class="fgrid" style="margin-top:10px"><div><label>Ngân hàng nhận tiền (VietQR)</label><select id="cBin">${BANKS.map(([b, n]) => `<option value="${b}" ${C.BANK_BIN === b ? 'selected' : ''}>${n} (${b})</option>`).join('')}</select></div>
      <div><label>Số tài khoản</label><input id="cAcc" value="${esc(C.BANK_ACC || '')}" inputmode="numeric"></div><div><label>Tên chủ tài khoản (IN HOA, không dấu)</label><input id="cName" value="${esc(C.BANK_NAME || '')}"></div>
      <div><label>Tên công ty (pháp nhân)</label><input id="coN" value="${esc(co.name || '')}"></div><div><label>Mã số thuế</label><input id="coT" value="${esc(co.tax || '')}"></div><div><label>Địa chỉ trụ sở</label><input id="coA" value="${esc(co.address || '')}"></div>
      <div><label>Hotline</label><input id="coP" value="${esc(co.phone || '')}"></div><div><label>Email CSKH</label><input id="coE" value="${esc(co.email || '')}"></div><div><label>Số đăng ký Bộ Công Thương</label><input id="coM" value="${esc(co.moit || '')}"></div>
      <div><label>Thuế suất GTGT phí dịch vụ (%)</label><input id="cVat" value="${esc(C.VAT_RATE || '10')}"></div><div><label>Biên dung sai trượt giá KK-MALL bù (đ/sp)</label><input id="cTol" value="${esc(C.TOLERANCE || '5000')}"></div><div><label>Hạn đổi trả (ngày)</label><input id="cRet" value="${esc(C.RETURN_DAYS || '7')}"></div></div>
    <div class="row" style="margin-top:12px"><button class="btn2 pri" onclick="saveOpsCfg()">💾 Lưu cấu hình</button><span id="cfgMsg" style="font-size:12.5px"></span><button class="btn2" onclick="OPS.call('admin.backup').then(()=>alert('Đã sao lưu vào Google Drive'))">🗄 Sao lưu ngay</button>${C.SHEET_URL ? `<a class="btn2" href="${safeUrl(C.SHEET_URL)}" target="_blank">📊 Mở Google Sheet dữ liệu</a>` : ''}</div>
    <div class="note" style="margin-top:12px">🔗 <b>Tự động xác nhận thanh toán</b>: đăng ký SePay (sepay.vn) hoặc Casso, liên kết tài khoản ngân hàng trên, khai báo Webhook URL:<br><code style="word-break:break-all">${esc(C.WEBHOOK_URL || '')}</code> ${C.WEBHOOK_URL ? cp(C.WEBHOOK_URL, '📋 Chép') : ''}<br>Biểu phí dịch vụ: ${(C.fee_table || []).map(t => `${t.to == null ? '> ' + vnd(t.from - 1) : vnd(t.from) + '-' + vnd(t.to)}: <b>${vnd(t.fee)}</b>`).join(' · ')} (chỉ sửa trong dự án Apps Script - Script Properties).</div>
    <div class="note" style="margin-top:12px">🚚 <b>Giá thực trả tự hiệu chỉnh theo ship thực tế</b>: bộ thu thập cộng dự phòng ship của từng nguồn vào giá vốn; mỗi lệnh mua anh nhập "trong đó ship/phụ phí" sẽ được thống kê 90 ngày để nâng dự phòng nếu thực tế cao hơn. Khóa thống kê được dẫn xuất tự động từ khóa quản trị và đã đăng ký lên máy chủ ${sessionStorage.getItem('kk_stats_key') && C.STATS_KEY === sessionStorage.getItem('kk_stats_key') ? '<b style="color:#166534">✓ sẵn sàng</b>' : '<b style="color:#B45309">(chưa khớp - mở lại trang quản trị)</b>'}; bộ thu thập tự đọc qua URL máy chủ trong <code>config.js</code> - không cần cấu hình thêm.
      <button class="btn2" style="margin-left:8px" onclick="showShipStats()">📊 Xem chênh lệch ship theo nguồn</button><div id="shipStats" style="margin-top:8px;font-size:12.5px"></div></div>
    <div class="note" style="margin-top:12px" id="botBox">${botBoxHtml(C.BOT)}</div>
    <div class="note" style="margin-top:12px">🧾 <b>Tự kiểm toán</b>: hằng ngày sau sao lưu, máy chủ đối soát sổ cái từng đơn, đơn đã thu tiền thiếu lệnh mua, lệnh mua/bot/hoàn tiền bị treo, hạn mức email - có vấn đề sẽ email quản trị. <button class="btn2 pri" style="margin-left:8px" onclick="runAudit()">🧾 Kiểm toán ngay</button><div id="auditOut" style="margin-top:8px;font-size:12.5px"></div></div>`;
}
async function saveOpsCfg() {
  if (!$('#cAcc').value.trim() && OPS.cfg && OPS.cfg.BANK_ACC && !confirm('Ô số tài khoản đang TRỐNG trong khi máy chủ đang có tài khoản ' + OPS.cfg.BANK_LABEL + ' ' + OPS.cfg.BANK_ACC + '.\nMáy chủ sẽ GIỮ NGUYÊN tài khoản cũ. Tiếp tục lưu các mục khác?')) return;
  const co = { name: $('#coN').value.trim(), short: 'KK-MALL', tax: $('#coT').value.trim(), address: $('#coA').value.trim(), phone: $('#coP').value.trim(), email: $('#coE').value.trim(), moit: $('#coM').value.trim() };
  const bin = $('#cBin').value, lab = (BANKS.find(b => b[0] === bin) || [, bin])[1];
  try { OPS.cfg = await OPS.call('admin.config', { set: { BANK_BIN: bin, BANK_LABEL: lab, BANK_ACC: $('#cAcc').value.replace(/\s/g, ''), BANK_NAME: $('#cName').value.trim().toUpperCase(), COMPANY_JSON: JSON.stringify(co), VAT_RATE: $('#cVat').value.trim(), TOLERANCE: $('#cTol').value.replace(/\D/g, ''), RETURN_DAYS: $('#cRet').value.replace(/\D/g, '') } }); $('#cfgMsg').textContent = '✓ Đã lưu'; renderOpsCfg(); logAdmin('Cập nhật cấu hình vận hành'); }
  catch (e) { $('#cfgMsg').textContent = '⚠ ' + e.message; }
}

/* ---------- khởi động: sau khi mở khóa dữ liệu ---------- */
const _boot = boot;
boot = function () { _boot(); opsGate(); opsLoad(); if (OPS.on) fetch(window.KK_BACKEND + '?a=config').then(r => r.json()).then(c => { if (!FEE_TABLE) { FEE_TABLE = c.fee_table; renderCmp(); } }).catch(() => { }); };

async function showShipStats() {
  const box = $('#shipStats'); box.textContent = 'Đang tải...';
  try { const C = OPS.cfg || {}; const r = await fetch(window.KK_BACKEND + '?a=shipstats&key=' + encodeURIComponent(C.STATS_KEY || '')); const j = await r.json(); if (j.error) throw new Error(j.error);
    const S = j.sources || {}; const ks = Object.keys(S); if (!ks.length) { box.textContent = 'Chưa có lệnh mua nào ghi nhận ship thực tế (90 ngày).'; return; }
    box.innerHTML = '<table><tr><th>Nguồn</th><th>Số lệnh</th><th>Ship thực tế TB</th><th>Mức 75%</th></tr>' + ks.map(k => `<tr><td>${esc(srcName(k))}</td><td>${S[k].n}</td><td>${vnd(S[k].avg)}</td><td><b>${vnd(S[k].p75)}</b></td></tr>`).join('') + '</table><div style="color:var(--muted)">Bộ thu thập dùng "mức 75%" làm dự phòng tối thiểu cho nguồn (từ 5 lệnh trở lên).</div>';
  } catch (e) { box.textContent = '⚠ ' + e.message; }
}

/* ---------- tự đồng bộ lệnh mua từ email nguồn (Tiki) ---------- */
const MS_TYPE = { confirm: '✅ Xác nhận đơn', shipped: '🚚 Đang vận chuyển', delivered: '📦 Giao thành công', cancelled: '⛔ Nguồn hủy', unpaid: '⚠️ Chưa thanh toán', notice: 'ℹ️ Thông báo', invoice: '🧾 Hóa đơn' };
function renderMailSync(extra) {
  const el = document.getElementById('mailSync'); if (!el) return;
  const m = OPS.cfg && OPS.cfg.MAILSYNC;
  if (!m) { el.innerHTML = ''; return; }
  const when = m.at ? new Date(m.at).toLocaleString('vi-VN') : 'chưa chạy';
  el.innerHTML = `<div class="note" style="margin-top:10px;${m.on ? '' : 'background:#FFF7ED;border-color:#FED7AA;color:#9A3412'}">📧 <b>Tự đồng bộ từ email ${esc((m.sources || []).join(', '))}</b>: ${m.on ? 'đang bật, 15 phút/lần' : '<b>CHƯA BẬT</b> - chạy hàm installMailSync trong dự án Apps Script'} · lần cuối: <b>${esc(when)}</b>${extra ? ' · ' + esc(extra) : ''}<br>
    <span style="font-size:12.5px">Đặt hàng tại nguồn với SĐT người nhận = SĐT khách, thanh toán trước (không COD). Email "Xác nhận đơn hàng" sẽ tự gắn mã đơn + thực trả vào lệnh mua; "Đang vận chuyển" / "Giao thành công" tự cập nhật trạng thái và báo khách.</span>
    ${(m.log || []).length ? `<table style="margin-top:8px;font-size:12.5px"><tr><th>Lúc</th><th>Nguồn</th><th>Mã đơn nguồn</th><th>Sự kiện</th><th>Lệnh mua</th><th>Kết quả</th></tr>${m.log.slice(0, 10).map(e => `<tr><td>${esc(new Date(e.at).toLocaleString('vi-VN'))}</td><td>${esc(srcName(e.src))}</td><td>${esc(e.id)}</td><td>${MS_TYPE[e.type] || esc(e.type)}</td><td>${esc(e.po || '-')}</td><td>${esc(e.note || '')}</td></tr>`).join('')}</table>` : ''}</div>`;
}
async function runMailSync() {
  const b = document.getElementById('msBtn'); if (b) { b.disabled = true; b.textContent = '⏳ Đang đọc email...'; }
  try { const r = await OPS.call('admin.mailsync'); if (OPS.cfg) OPS.cfg.MAILSYNC = r.info; logAdmin('Đồng bộ email nguồn: ' + r.events.length + ' sự kiện'); await opsLoad(); renderMailSync('vừa quét ' + r.scanned + ' email, ' + r.events.length + ' cập nhật'); }
  catch (e) { alert(e.message); }
  if (b) { b.disabled = false; b.textContent = '📧 Đồng bộ email nguồn ngay'; }
}

/* ---------- bot đặt hàng tự động (tiện ích Chrome KK-MALL Auto Order) ---------- */
const BOT_ST = { working: ['🤖 Bot đang đặt', '#1D4ED8'], paying: ['💳 Đã bấm Đặt hàng - chờ OTP', '#7C3AED'], done: ['✅ Bot đã đặt', '#166534'], failed: ['⚠️ Bot lỗi (chưa đặt)', '#B45309'], skip: ['↪️ Bot bỏ qua - đặt tay', '#475569'], pay_failed: ['🚨 Thanh toán tại nguồn lỗi', '#B91C1C'], paying_unknown: ['🚨 Đã bấm Đặt hàng - chưa rõ kết quả', '#B91C1C'] };
function botBadge(p) {
  const b = p.data && p.data.bot; if (!b || p.status !== 'to_order') return '';
  const [t, c] = BOT_ST[b.state] || [b.state, '#475569'];
  const canReset = ['failed', 'pay_failed', 'paying_unknown', 'skip'].includes(b.state);
  return `<div style="margin-top:8px;padding:8px 12px;border-radius:10px;border:1px solid ${c}33;background:${c}0D;font-size:12.5px"><b style="color:${c}">${t}</b> · ${esc(new Date(b.at).toLocaleString('vi-VN'))}${b.note ? ' · ' + esc(b.note) : ''}${b.total ? ' · tổng tại nguồn ' + vnd(b.total) : ''}
    ${['pay_failed', 'paying_unknown'].includes(b.state) ? '<br>Đã bấm Đặt hàng tại nguồn: kiểm tra đơn trên ứng dụng nguồn trước. Nếu nguồn KHÔNG có đơn, bấm cho phép đặt lại.' : ''}
    ${canReset ? ` <button class="btn2" style="padding:3px 10px;font-size:12px" onclick="botReset('${p.po_id}')">↻ Cho bot đặt lại</button>` : ''}</div>`;
}
async function botReset(po_id) {
  if (!confirm('Cho bot đặt lại lệnh mua ' + po_id + '?\nChỉ đồng ý khi đã kiểm tra nguồn KHÔNG có đơn cho lệnh này (tránh mua trùng).')) return;
  try { await OPS.call('admin.po.botreset', { po_id }); logAdmin('Cho bot đặt lại ' + po_id); await opsLoad(); } catch (e) { alert(e.message); }
}
function botBoxHtml(B) {
  B = B || {};
  return `🤖 <b>Bot đặt hàng tự động</b> (tiện ích Chrome "KK-MALL Auto Order" - nguồn: ${esc((B.sources || ['tiki']).join(', '))}): ${B.has_key ? 'đã có khóa (tạo ' + esc(B.key_at ? new Date(B.key_at).toLocaleString('vi-VN') : '') + ')' : '<b>chưa có khóa</b>'} · bot hoạt động lần cuối: <b>${B.seen_at ? esc(new Date(B.seen_at).toLocaleString('vi-VN')) + (B.device ? ' (' + esc(B.device) + ')' : '') : 'chưa'}</b><br>
    <span style="font-size:12.5px">Bot tự lấy lệnh mua đã thanh toán, đặt tại nguồn với thông tin khách, chọn thẻ đã lưu (không bao giờ COD), chặn nếu tổng tiền vượt tiền đã thu + biên dung sai, bấm Đặt hàng - anh chỉ nhập OTP. Cài: tải gói → chrome://extensions → bật Chế độ nhà phát triển → "Tải tiện ích đã giải nén" → chọn thư mục đã giải nén.</span><br>
    <a class="btn2" href="ext/kk-auto-order.zip" download style="margin-top:6px">⬇ Tải tiện ích (zip)</a> <button class="btn2 pri" style="margin-top:6px" onclick="botKeyNew()">🔑 ${B.has_key ? 'Đổi' : 'Tạo'} khóa bot</button><div id="botKeyOut" style="margin-top:8px"></div>`;
}
async function botKeyNew() {
  if (OPS.cfg && OPS.cfg.BOT && OPS.cfg.BOT.has_key && !confirm('Đổi khóa bot? Khóa cũ hết hiệu lực ngay - phải dán khóa mới vào tiện ích.')) return;
  try {
    const r = await OPS.call('admin.botkey');
    document.getElementById('botKeyOut').innerHTML = `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px 12px;font-size:13px">Khóa bot (chỉ hiện MỘT lần - dán vào ô "Khóa bot" của tiện ích): <code style="word-break:break-all">${esc(r.bot_key)}</code> ${cp(r.bot_key, '📋 Chép khóa')}</div>`;
    logAdmin('Tạo/đổi khóa bot đặt hàng'); if (OPS.cfg) OPS.cfg.BOT = Object.assign({}, OPS.cfg.BOT, { has_key: true, key_at: r.at });
  } catch (e) { alert(e.message); }
}

/* ---------- hoàn tiền: danh sách cần hoàn + VietQR chuyển đúng số tiền ---------- */
function renderRefunds() {
  const el = document.getElementById('rfQueue'); if (!el) return;
  const L = (OPS.orders || []).filter(o => Number(o.refund_due) > 0);
  const nb = document.querySelector('[data-t="orders"]'); if (nb) nb.textContent = nb.textContent.replace(/ \(💸\d+\)$/, '') + (L.length ? ` (💸${L.length})` : '');
  if (!L.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="border-left:5px solid #B45309;margin:10px 0"><b style="color:#92400E">💸 Cần hoàn tiền cho khách · ${L.length} đơn · ${vnd(L.reduce((a, o) => a + Number(o.refund_due), 0))}</b>
    <table style="margin-top:8px"><tr><th>Đơn</th><th>Khách</th><th>Cần hoàn</th><th>Tài khoản khách</th><th>Quét để chuyển</th><th></th></tr>${L.map(o => {
      const a = o.refund_account, info = 'HOAN ' + o.code, id = o.code.replace(/\W/g, '');
      const qr = a ? `https://img.vietqr.io/image/${encodeURIComponent(a.bin)}-${encodeURIComponent(a.acc)}-compact2.png?amount=${Number(o.refund_due)}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(a.name)}` : '';
      return `<tr><td><b>${esc(o.code)}</b><br><small>${esc(OST[o.status] || o.status)}</small></td><td>${esc(o.customer.name)}<br><small>${esc(o.customer.phone)} · ${esc(o.customer.email)}</small></td><td><b>${vnd(o.refund_due)}</b>${o.refunded ? `<br><small>đã hoàn ${vnd(o.refunded)}</small>` : ''}</td>
        <td>${a ? `${esc(a.bank_label || a.bin)}<br><b>${esc(a.acc)}</b> ${cp(a.acc)}<br>${esc(a.name)}<br><small>Nội dung: ${esc(info)}</small> ${cp(info)}` : '<span style="color:#B45309">Khách chưa khai tài khoản</span><br><small>Đã gửi email kèm link nhập TK</small>'}</td>
        <td>${qr ? `<img src="${safeUrl(qr)}" alt="VietQR" style="width:150px;border-radius:8px;border:1px solid var(--line)" referrerpolicy="no-referrer">` : '-'}</td>
        <td><input id="rfr_${id}" placeholder="Mã GD ngân hàng" style="width:140px"><br><button class="btn2 pri" style="margin-top:6px" onclick="refundDone('${esc(o.code)}','${id}',${Number(o.refund_due)})">✅ Đã chuyển hoàn</button></td></tr>`;
    }).join('')}</table></div>`;
}
async function refundDone(code, id, amt) {
  const ref = ($('#rfr_' + id).value || '').trim(); if (!ref) return alert('Nhập mã giao dịch ngân hàng của lần chuyển hoàn (để đối soát)');
  if (!confirm('Xác nhận ĐÃ chuyển hoàn ' + vnd(amt) + ' cho đơn ' + code + '?\nHệ thống ghi sổ kế toán và email cho khách.')) return;
  try { await OPS.call('admin.order.update', { code, action: 'refund', amount: amt, ref }); logAdmin('Hoàn tiền ' + code + ' ' + amt); await opsLoad(); } catch (e) { alert(e.message); }
}
/* ---------- kiểm duyệt đánh giá ---------- */
const RVST = { pending: '🕓 Chờ duyệt', published: '✅ Hiển thị', hidden: '🙈 Đã ẩn', removed: '🗑 Đã xóa' };
async function loadReviewsAdm() { if (!OPS.on || !OPS.tok()) return; try { OPS.reviews = (await OPS.call('admin.reviews')).rows; renderReviews(); } catch (e) { console.warn(e); } }
function renderReviews() {
  const t = document.getElementById('rvTbl'); if (!t) return; const R = OPS.reviews || [], f = ($('#rvF') || {}).value || '';
  const pend = R.filter(r => r.status === 'pending').length, nb = document.querySelector('[data-t="reviews"]'); if (nb) nb.textContent = '⭐ Đánh giá' + (pend ? ` (${pend})` : '');
  const L = R.filter(r => !f || r.status === f); $('#rvCount').textContent = '· ' + L.length + ' / ' + R.length;
  t.innerHTML = '<tr><th>Lúc</th><th>Sản phẩm</th><th>Sao</th><th>Nội dung</th><th>Người đánh giá</th><th>Trạng thái</th><th></th></tr>' + (L.map(r => `<tr><td style="font-size:12px">${esc(new Date(r.created_at).toLocaleString('vi-VN'))}</td><td>${esc(r.product || r.sku)}<br><small>${esc(r.sku)} · ${esc(r.order_code)}</small></td><td>${'★'.repeat(Number(r.rating) || 0)}</td><td style="max-width:360px">${esc(r.content)}</td><td>${esc(r.name)}</td><td>${RVST[r.status] || esc(r.status)}</td>
    <td>${r.status !== 'published' ? `<button class="btn2 pri" onclick="rvAct('${esc(r.id)}','publish')">Hiển thị</button>` : ''}${r.status !== 'hidden' ? `<button class="btn2" onclick="rvAct('${esc(r.id)}','hide')">Ẩn</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">Không có đánh giá ở trạng thái này.</td></tr>');
}
async function rvAct(id, action) { try { await OPS.call('admin.review.update', { id, action }); logAdmin('Đánh giá ' + id + ': ' + action); await loadReviewsAdm(); } catch (e) { alert(e.message); } }
/* ---------- tự kiểm toán ---------- */
async function runAudit() {
  const el = document.getElementById('auditOut'); el.textContent = 'Đang đối soát…';
  try {
    const r = await OPS.call('admin.audit');
    el.innerHTML = `Đối soát ${r.orders} đơn, ${r.ledger_rows} bút toán, hạn mức email còn ${r.mail_quota < 0 ? '?' : r.mail_quota} · ${r.issues.length ? `<b style="color:#B91C1C">${r.issues.length} việc cần xử lý</b>` : '<b style="color:#166534">✓ Không phát hiện sai lệch</b>'}`
      + (r.issues.length ? `<table style="margin-top:6px">${r.issues.map(i => `<tr><td>${i.lvl === 'high' ? '🔴' : '🟠'}</td><td><b>${esc(i.code)}</b></td><td>${esc(i.msg)}</td></tr>`).join('')}</table>` : '');
    logAdmin('Tự kiểm toán: ' + r.issues.length + ' việc');
  } catch (e) { el.textContent = '⚠ ' + e.message; }
}
