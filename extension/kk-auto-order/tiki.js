/*
 * KK-MALL Auto Order - bộ đặt hàng trên Tiki (content script)
 * Chỉ hoạt động trên tab do tiện ích mở cho 1 lệnh mua; mọi tab Tiki khác bỏ qua.
 * Nguyên tắc an toàn: không bao giờ chọn tiền mặt khi nhận hàng; chỉ bấm "Đặt hàng" khi máy chủ KK-MALL đồng ý
 * tổng tiền (≤ tiền hàng đã thu + biên dung sai); không đọc/lưu số thẻ; OTP do chủ sở hữu nhập.
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
 */
(function () {
  'use strict';
  const L = self.KKLIB;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const vis = e => !!(e && (e.offsetParent || e.getClientRects().length));
  const txt = e => (e && (e.innerText || e.textContent) || '').replace(/\s+/g, ' ').trim();
  async function waitFor(fn, ms = 15000, step = 250) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (e) { } await sleep(step); } return null; }
  const fire = (el, t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  const click = el => { el.scrollIntoView({ block: 'center' }); ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => fire(el, t)); };
  function setVal(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const byText = (sel, re) => $$(sel).filter(vis).find(e => re.test(txt(e)));
  class Stop extends Error { constructor(m, stage, kind) { super(m); this.stage = stage; this.kind = kind || 'fail'; } }

  /* ---------- thanh trạng thái trên trang ---------- */
  function banner(msg, tone) {
    let b = document.getElementById('kk-auto-banner');
    if (!b) { b = document.createElement('div'); b.id = 'kk-auto-banner'; b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;font:600 14px/1.4 Segoe UI,Arial,sans-serif;padding:10px 16px;color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;justify-content:space-between'; document.documentElement.appendChild(b); }
    b.style.background = tone === 'warn' ? '#B45309' : tone === 'pay' ? '#7C3AED' : tone === 'ok' ? '#166534' : tone === 'err' ? '#B91C1C' : '#1D4ED8';
    b.innerHTML = ''; const s = document.createElement('span'); s.textContent = '🤖 KK-MALL Auto Order · ' + msg; b.appendChild(s);
    const x = document.createElement('button'); x.textContent = '⏹ Dừng bot'; x.style.cssText = 'background:#fff;color:#111;border:0;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer';
    x.onclick = () => BR.send({ t: 'stop' }); b.appendChild(x);
  }

  /* ---------- danh mục địa chỉ của Tiki (pre-merger, cùng nguồn với form) ---------- */
  const dirCache = {};
  async function dirGet(path) { if (dirCache[path]) return dirCache[path]; const j = await (await fetch(path, { credentials: 'include' })).json(); return (dirCache[path] = (j.data || j).map(x => [x.id, x.name])); }
  const DIR = { regions: () => dirGet('/api/v2/directory/regions?country_id=VN'), districts: id => dirGet('/api/v2/directory/districts?region_id=' + id), wards: id => dirGet('/api/v2/directory/wards?district_id=' + id) };

  /* ---------- trang sản phẩm ---------- */
  async function stepProduct(job) {
    banner('Kiểm tra sản phẩm & giá - ' + job.po_id);
    const m = location.pathname.match(/-p(\d+)\.html/); if (!m) throw new Stop('Link sản phẩm Tiki không hợp lệ', 'product');
    const spid = new URLSearchParams(location.search).get('spid');
    const P = await (await fetch('/api/v2/products/' + m[1] + (spid ? '?spid=' + spid : ''), { credentials: 'include' })).json().catch(() => ({}));
    if (P.inventory_status && P.inventory_status !== 'available') throw new Stop('Tiki báo hết hàng (' + P.inventory_status + ')', 'product');
    const price = Number(P.price || (P.current_seller && P.current_seller.price) || 0);
    if (price && price * job.qty > job.collected + job.tol) throw new Stop('Giá Tiki ' + price.toLocaleString('vi-VN') + 'đ × ' + job.qty + ' vượt tiền hàng đã thu (' + job.collected.toLocaleString('vi-VN') + 'đ)', 'product');
    const maxQ = P.stock_item && P.stock_item.max_sale_qty; if (maxQ && job.qty > maxQ) throw new Stop('Tiki chỉ cho mua tối đa ' + maxQ + ' sản phẩm/đơn', 'product');
    await BR.send({ t: 'progress', step: 'product', note: 'giá ' + price + ', còn hàng' });
    // so luong
    const qin = await waitFor(() => $$('input.input, input[type=text]').filter(vis).find(i => /^\d+$/.test(i.value) && i.parentElement && i.parentElement.querySelector('img[alt*=add], img[alt*=remove]')), 10000);
    if (job.qty > 1) {
      if (!qin) throw new Stop('Không tìm thấy ô số lượng', 'product');
      const add = qin.parentElement.querySelector('img[alt*=add]'); const addBtn = add && (add.closest('button') || add);
      for (let i = 1; i < job.qty && Number(qin.value) < job.qty; i++) { click(addBtn); await sleep(350); }
      if (Number(qin.value) !== job.qty) throw new Stop('Không đặt được số lượng ' + job.qty, 'product');
    }
    const buy = await waitFor(() => $$('button').filter(vis).find(b => txt(b) === 'Mua ngay' && !b.disabled), 10000);
    if (!buy) throw new Stop('Không thấy nút "Mua ngay" (có thể cần chọn phân loại/hết hàng)', 'product');
    await BR.send({ t: 'progress', step: 'checkout', note: 'bấm Mua ngay' });
    click(buy);
    const res = await waitFor(() => /\/checkout\//.test(location.pathname) ? 'nav' : (byText('div,h2,h3,p', /^Đăng nhập|Xin chào,|Đăng nhập bằng email/) && $$('input[name=tel],input[type=tel],input[name=email]').some(vis)) ? 'login' : null, 15000);
    if (res === 'login') throw new Stop('Tiki yêu cầu đăng nhập - đăng nhập Tiki trên Chrome này rồi bấm "Tiếp tục" trong tiện ích', 'login', 'pause');
    if (!res) throw new Stop('Bấm "Mua ngay" nhưng Tiki không chuyển sang thanh toán (cần chọn phân loại/màu?)', 'product');
  }

  /* ---------- trang địa chỉ giao hàng ---------- */
  function cards() {
    return $$('button').filter(b => vis(b) && txt(b) === 'Giao đến địa chỉ này' && !b.closest('form') && !(b.parentElement && b.parentElement.parentElement && b.parentElement.parentElement.querySelector('input[name=full_name]'))).map(b => {
      let c = b; for (let i = 0; i < 6 && c && !/Điện thoại/.test(txt(c)); i++) c = c.parentElement;
      if (!c || c.querySelector('input[name=full_name], textarea[name=street]')) return null; // nut luu cua form them dia chi
      const t = c.innerText, lines = t.split('\n').map(x => x.trim()).filter(Boolean);
      return { btn: b, name: lines[0] || '', phone: L.digits((t.match(/Điện thoại:?\s*([\d +.]+)/) || [])[1]), addr: ((t.match(/Địa chỉ:?\s*([^\n]+)/) || [])[1] || '') };
    }).filter(c => c && c.phone);
  }
  async function pickSelect(idx, name) {
    const sel = () => $$('.rc-select').filter(vis)[idx];
    const s = await waitFor(sel, 8000); if (!s) return false;
    const head = s.querySelector('.rc-select-selection'); fire(head, 'mousedown'); fire(head, 'click');
    const target = L.norm(name);
    const item = await waitFor(() => $$('.rc-select-dropdown:not(.rc-select-dropdown-hidden) .rc-select-dropdown-menu-item').find(i => L.norm(txt(i)) === target), 8000);
    if (!item) { fire(head, 'mousedown'); return false; }
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(t => fire(item, t));
    return !!(await waitFor(() => L.norm(txt(sel())) === target, 4000));
  }
  async function stepShipping(job) {
    banner('Chọn địa chỉ giao cho khách ' + job.ship_to.name);
    await waitFor(() => $$('button').some(b => vis(b) && /Giao đến địa chỉ này/.test(txt(b))) || byText('span,div,a', /Thêm địa chỉ giao hàng mới/), 15000);
    const want = { name: L.norm(job.ship_to.name), phone: L.digits(job.ship_to.phone) };
    const parsed = await L.parseAddress(job.ship_to.address, DIR).catch(() => ({ ok: false }));
    const streetRef = parsed.street || job.ship_to.address;
    // 1) dia chi da co trong so dia chi Tiki
    const hit = cards().find(c => c.phone === want.phone && L.norm(c.name) === want.name && L.cover(streetRef, c.addr) >= 0.8 && (!parsed.ward || L.cover(parsed.ward.name.replace(/^(Phường|Xã|Thị trấn) /, ''), c.addr) >= 0.99));
    if (hit) { await BR.send({ t: 'progress', step: 'address', note: 'dùng địa chỉ có sẵn trong sổ Tiki' }); click(hit.btn); return; }
    // 2) them dia chi moi
    const f = await fillAddressForm(job, parsed);
    if (!f.auto) {
      const miss = ['Tỉnh/Thành', 'Quận/Huyện', 'Phường/Xã'].filter((_, i) => ![parsed.region, parsed.district, parsed.ward][i]).join(', ') || 'đơn vị hành chính';
      banner('CẦN ANH: chọn ' + miss + ' cho địa chỉ "' + job.ship_to.address + '" rồi bấm "Giao đến địa chỉ này"', 'warn');
      await BR.send({ t: 'manual', note: 'Địa chỉ khách thiếu/không khớp ' + miss + ' - chờ chọn tay' });
      return; // nguoi van hanh bam submit -> trang thanh toan tiep tuc tu dong
    }
    await BR.send({ t: 'progress', step: 'address', note: 'thêm địa chỉ mới: ' + [parsed.ward.name, parsed.district.name, parsed.region.name].join(', ') });
    const sb = f.submit(); if (!sb) throw new Stop('Không thấy nút lưu địa chỉ', 'address'); click(sb);
    await sleep(2500);
    const err = $$('.error, [class*=error]').filter(vis).map(txt).filter(Boolean)[0]; if (err && /checkout\/shipping/.test(location.pathname)) throw new Stop('Tiki báo lỗi địa chỉ: ' + err.slice(0, 120), 'address');
  }
  async function fillAddressForm(job, parsed) {
    const want = { phone: L.digits(job.ship_to.phone) };
    if (!$$('input[name=full_name]').some(vis)) { const add = byText('span,div,a', /^Thêm địa chỉ giao hàng mới$/) || byText('span,div,a', /Thêm địa chỉ giao hàng mới/); if (add) click(add); }
    const nameIn = await waitFor(() => $$('input[name=full_name]').find(vis), 8000); if (!nameIn) throw new Stop('Không mở được form thêm địa chỉ', 'address');
    setVal(nameIn, job.ship_to.name); setVal($$('input[name=telephone]').find(vis), want.phone);
    let auto = parsed.ok;
    if (parsed.region) auto = (await pickSelect(0, parsed.region.name)) && auto;
    if (parsed.district) auto = (await pickSelect(1, parsed.district.name)) && auto;
    if (parsed.ward) auto = (await pickSelect(2, parsed.ward.name)) && auto;
    const st = $$('textarea[name=street]').find(vis); if (st) setVal(st, parsed.street || job.ship_to.address);
    const office = /cong ty|van phong|toa nha|tower|building|office|chi nhanh/.test(L.norm(job.ship_to.address));
    const typ = $$('label').filter(vis).find(l => office ? /Cơ quan/.test(txt(l)) : /Nhà riêng/.test(txt(l))); if (typ) click(typ.querySelector('input') || typ);
    const submit = () => { const f = nameIn.closest('form') || nameIn.parentElement.parentElement.parentElement.parentElement; return $$('button', f.parentElement || f).filter(vis).reverse().find(b => txt(b) === 'Giao đến địa chỉ này'); };
    return { auto, submit };
  }

  /* ---------- trang thanh toán ---------- */
  function rowVal(label) {
    const e = $$('div,span,p').find(x => x.childElementCount === 0 && txt(x) === label); if (!e) return null;
    let r = e.parentElement; for (let i = 0; i < 3 && r && !/\d[\d.]*\s*₫/.test(txt(r)); i++) r = r.parentElement;
    const m = r && txt(r).replace(label, '').match(/-?\s*[\d.]+\s*₫/); return m ? L.money(m[0]) * (/-/.test(m[0]) ? -1 : 1) : null;
  }
  async function stepPayment(job) {
    banner('Kiểm tra đơn trước khi thanh toán - ' + job.po_id);
    const orderBtn = await waitFor(() => $$('button').filter(vis).find(b => txt(b) === 'Đặt hàng'), 20000);
    if (!orderBtn) throw new Stop('Không thấy nút "Đặt hàng" trên trang thanh toán', 'payment');
    await waitFor(() => rowVal('Tổng tiền thanh toán') > 0, 10000);
    // dia chi giao
    const box = $$('*').find(x => x.childElementCount === 0 && txt(x) === 'Giao tới'); let bx = box; for (let i = 0; i < 3 && bx; i++) bx = bx.parentElement;
    const bt = txt(bx);
    const parsed = await L.parseAddress(job.ship_to.address, DIR).catch(() => ({}));
    const addrOk = bt && L.digits(bt).includes(L.digits(job.ship_to.phone)) && L.cover(job.ship_to.name, bt) >= 0.99 && L.cover(parsed.street || job.ship_to.address, bt) >= 0.8;
    if (!addrOk) {
      const r = await BR.send({ t: 'progress', step: 'checkout', note: 'địa chỉ đang chọn chưa phải của khách - đổi', addr_retry: true });
      if (r && r.stop) throw new Stop('Đổi địa chỉ quá 2 lần không thành công', 'address');
      const ch = $$('a,span,div').filter(vis).find(e => txt(e) === 'Thay đổi' && bx && bx.contains(e)) || $$('a').filter(vis).find(e => txt(e) === 'Thay đổi');
      if (!ch) throw new Stop('Không đổi được địa chỉ giao', 'address');
      click(ch); return;
    }
    // san pham
    const lines = $$('div,span').filter(x => x.childElementCount === 0 && /^\d+ x$/.test(txt(x)));
    if (lines.length !== 1) throw new Stop('Giỏ thanh toán có ' + lines.length + ' dòng (cần đúng 1 sản phẩm)', 'payment');
    const qty = parseInt(txt(lines[0]), 10), lineTxt = txt(lines[0].parentElement.parentElement);
    if (qty !== job.qty) throw new Stop('Số lượng tại Tiki ' + qty + ' ≠ lệnh mua ' + job.qty, 'payment');
    if (L.cover(lineTxt.replace(/[\d.]+\s*₫/g, ''), job.name) < 0.5 && L.cover(job.name, lineTxt) < 0.5) throw new Stop('Sản phẩm ở trang thanh toán không khớp lệnh mua', 'payment');
    // thanh toan: the da luu (khong bao gio COD)
    const card = $$('input[type=radio][name=payment-method]').find(r => r.value === 'cybersource');
    if (!card) throw new Stop('Tiki không có phương thức thẻ tín dụng/ghi nợ', 'pay_setup', 'pause');
    if (!card.checked) { click(card.closest('label') || card); await sleep(800); }
    const toks = $$('input[type=radio][name=payment-token]');
    if (!toks.length) throw new Stop('Chưa có thẻ lưu trên Tiki - vào Tiki > Tài khoản > Thông tin thanh toán để lưu thẻ', 'pay_setup', 'pause');
    const want4 = String(job.card_last4 || '').trim();
    const tok = (want4 && toks.find(r => txt(r.closest('label') || r.parentElement.parentElement).includes(want4))) || toks[0];
    if (!tok.checked) { click(tok.closest('label') || tok); await sleep(800); }
    const cod = $$('input[type=radio][name=payment-method]').find(r => r.value === 'cod');
    if (!card.checked || !tok.checked || (cod && cod.checked)) throw new Stop('Không chọn được thẻ đã lưu (chặn để không thanh toán khi nhận hàng)', 'pay_setup', 'pause');
    // tong tien
    await sleep(800);
    const total = rowVal('Tổng tiền thanh toán'), shipFee = rowVal('Phí vận chuyển') || 0, shipDisc = Math.abs(rowVal('Giảm giá vận chuyển') || 0) + Math.abs(rowVal('Miễn phí vận chuyển') || 0);
    if (!(total > 0)) throw new Stop('Không đọc được tổng tiền thanh toán', 'payment');
    const ship = Math.max(0, shipFee - shipDisc);
    banner('Tổng ' + total.toLocaleString('vi-VN') + 'đ - đang xin phép máy chủ KK-MALL', 'pay');
    const ok = await BR.send({ t: 'ready', total, ship, card4: txt(tok.closest('label') || tok.parentElement.parentElement).replace(/\D/g, '').slice(-4) });
    if (!ok || !ok.go) throw new Stop((ok && ok.err) || 'Máy chủ không cho phép đặt', 'payment');
    banner('Đã bấm ĐẶT HÀNG - anh nhập OTP để thanh toán ' + total.toLocaleString('vi-VN') + 'đ', 'pay');
    click(orderBtn);
    watchResult(job, 0);
  }

  /* ---------- sau khi bấm Đặt hàng: chờ OTP / kết quả ---------- */
  let watching = false;
  async function watchResult(job, delay) {
    if (watching) return; watching = true;
    if (delay !== 0) await sleep(1500);
    for (let i = 0; i < 300; i++) {
      const t = document.body ? document.body.innerText : '';
      const q = new URLSearchParams(location.search), qid = q.get('order_code') || q.get('order_id') || q.get('code');
      const id = (qid && /^\d{8,12}$/.test(qid) ? qid : null) || ((t.match(/(?:mã đơn hàng|mã đơn|đơn hàng)\s*(?:của bạn)?\s*(?:là)?\s*:?\s*#?\s*(\d{8,12})/i) || [])[1]);
      if (/đặt hàng thành công|cảm ơn bạn đã (đặt|mua)|thanh toán thành công|yay/i.test(t) && id) { banner('Đặt thành công - mã đơn Tiki ' + id, 'ok'); await BR.send({ t: 'success', order_id: id }); watching = false; return; }
      if (/thanh toán (không thành công|thất bại)|giao dịch (thất bại|không thành công|bị từ chối)|đang đợi thanh toán/i.test(t) && !/\/checkout\/payment$/.test(location.pathname)) { banner('Thanh toán chưa thành công', 'err'); await BR.send({ t: 'fail', err: 'Thanh toán tại Tiki không thành công' + (id ? ' (đơn ' + id + ')' : ''), stage: 'pay', kind: 'pause', order_id: id || '' }); watching = false; return; }
      await sleep(2000);
    }
    watching = false; // het 10 phut tren trang nay: nen tu theo doi tiep (watchdog) + email Tiki se tu gan ma don
  }

  /* ---------- điều phối ---------- */
  let BR = null, running = false, lastHref = '';
  async function route() {
    if (running) return; running = true;
    try {
      const r = await BR.send({ t: 'hello', url: location.href }); const job = r && r.job; if (!job) return;
      if (job.step === 'paying') { banner('Chờ anh nhập OTP / kết quả thanh toán…', 'pay'); return watchResult(job); }
      const p = location.pathname;
      if (/-p\d+\.html$/.test(p) && job.step === 'product') await stepProduct(job);
      else if (p.startsWith('/checkout/shipping')) await stepShipping(job);
      else if (p.startsWith('/checkout/payment')) await stepPayment(job);
      else if (p.startsWith('/checkout/cart')) throw new Stop('Tiki chuyển về giỏ hàng thay vì Mua ngay', 'checkout');
    } catch (e) {
      banner('Dừng: ' + e.message, e.kind === 'pause' ? 'warn' : 'err');
      await BR.send({ t: 'fail', err: e.message, stage: e.stage || 'page', kind: e.kind || 'fail' });
    } finally { running = false; }
  }
  function start(bridge) {
    BR = bridge; lastHref = location.href; route();
    setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; setTimeout(route, 800); } }, 500); // Tiki dung dieu huong SPA
  }
  self.KKTIKI = { start, stepProduct, stepShipping, stepPayment, fillAddressForm, parseAddrLive: a => L.parseAddress(a, DIR), cards, rowVal };
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) start({ send: m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => { void chrome.runtime.lastError; res(r); }); } catch (e) { res(null); } }) });
})();
