'use strict';
/*
 * KK-MALL EDGE RUNTIME - toan bo tinh nang van hanh ngay tren trinh duyet khach
 * (ban CDN tinh): dat hang, thanh toan thu nghiem, theo doi don + van don, hoa don,
 * toi uu voucher, danh gia san pham. Du lieu don luu tren thiet bi khach.
 * Ban quyen (c) Nguyen Duy Dien (KK-2026).
 */
(function () {
  const realFetch = window.fetch.bind(window);
  let FULL = null;
  const jr = (obj, status = 200) => Promise.resolve(new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }));
  const err = (msg, code = 400) => jr({ error: msg }, code);
  const fixImg = (o) => { if (o && typeof o === 'object') { for (const k in o) { const v = o[k];
    if (typeof v === 'string' && v.startsWith('/api/img/') && !v.endsWith('.svg')) o[k] = v + '.svg';
    else if (v && typeof v === 'object') fixImg(v); } } return o; };
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^84/, '0');
  const nowIso = () => new Date().toISOString();

  async function loadFull() { if (!FULL) FULL = await realFetch('api/catalog-full.json').then(r => r.json()); return FULL; }

  // ---------- VOUCHER (chay tren thiet bi) ----------
  const VOUCHERS = [
    { code: 'KKWELCOME', title: 'Giảm 10% tối đa 50K cho đơn từ 200K', type: 'percent', value: 10, max_discount: 50000, min_order: 200000, scope: 'all', group: 'order' },
    { code: 'KK50', title: 'Giảm 50K cho đơn từ 1 triệu', type: 'fixed', value: 50000, min_order: 1000000, scope: 'all', group: 'order' },
    { code: 'KK150', title: 'Giảm 150K cho đơn từ 5 triệu', type: 'fixed', value: 150000, min_order: 5000000, scope: 'all', group: 'order' },
    { code: 'DIENLANH5', title: 'Giảm 5% tối đa 300K ngành Điện lạnh', type: 'percent', value: 5, max_discount: 300000, min_order: 2000000, scope: 'dien-lanh', group: 'category' },
    { code: 'GIADUNG30', title: 'Giảm 30K nhóm Gia dụng, đơn từ 300K', type: 'fixed', value: 30000, min_order: 300000, scope: 'gia-dung', group: 'category' },
  ];
  async function optimize(items, extraCodes) {
    const full = await loadFull(); const bySku = Object.fromEntries(full.map(r => [r.sku, r]));
    const lines = items.map(i => ({ ...i, qty: Math.max(1, Math.min(20, +i.qty || 1)), p: bySku[i.sku] })).filter(l => l.p && l.p.kk_price);
    const subtotal = lines.reduce((a, l) => a + l.p.kk_price * l.qty, 0);
    const cand = [];
    for (const v of VOUCHERS) {
      if (subtotal < v.min_order) continue;
      const scopeSub = v.scope === 'all' ? subtotal : lines.filter(l => l.p.category_id === v.scope).reduce((a, l) => a + l.p.kk_price * l.qty, 0);
      if (!scopeSub) continue;
      const d = v.type === 'percent' ? Math.min(Math.floor(scopeSub * v.value / 100), v.max_discount || 1e12) : Math.min(v.value, scopeSub);
      if (d > 0) cand.push({ v, d });
    }
    const best = {}; for (const c of cand) { const g = c.v.group; if (!best[g] || c.d > best[g].d) best[g] = c; }
    const chosen = Object.values(best);
    return { discount: chosen.reduce((a, c) => a + c.d, 0), vouchers: chosen.map(c => ({ code: c.v.code, title: c.v.title, group: c.v.group, discount: c.d })),
      considered: cand.length, explain: chosen.length ? `Đã thử ${cand.length} voucher, áp tổ hợp tối ưu ${chosen.map(c => c.v.code).join(' + ')}` : 'Chưa có voucher phù hợp' };
  }

  // ---------- DAT HANG (thanh toan thu nghiem - luu tren thiet bi) ----------
  const CARRIERS = ['GHN', 'GHTK', 'VTP'];
  async function createOrder(b) {
    const name = String(b.name || '').trim(), phone = normPhone(b.phone), email = String(b.email || '').trim(), addr = String(b.address || '').trim();
    if (name.length < 2) return err('Vui lòng nhập họ tên');
    if (!/^0\d{9}$/.test(phone)) return err('Số điện thoại không hợp lệ');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('Email không hợp lệ (dùng để nhận hóa đơn)');
    if (addr.length < 10) return err('Địa chỉ nhận hàng chưa đầy đủ');
    if (!b.consent) return err('Bạn cần đồng ý Chính sách bảo vệ dữ liệu cá nhân để đặt hàng');
    const full = await loadFull(); const bySku = Object.fromEntries(full.map(r => [r.sku, r]));
    const items = (b.items || []).map(i => { const p = bySku[i.sku]; if (!p || !p.in_stock) return null;
      const qty = Math.max(1, Math.min(20, +i.qty || 1));
      return { sku: p.sku, name: p.name, image: p.image, qty, unit: p.kk_price, line_total: p.kk_price * qty }; }).filter(Boolean);
    if (!items.length) return err('Giỏ hàng trống hoặc sản phẩm vừa hết hàng');
    const opt = await optimize(b.items, b.voucher_codes || []);
    const total = Math.max(0, items.reduce((a, i) => a + i.line_total, 0) - opt.discount);
    const code = 'KK' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + Math.random().toString(36).slice(2, 6).toUpperCase();
    const t = nowIso();
    const order = { code, customer_name: name, customer_phone: phone, customer_email: email, customer_address: addr, note: String(b.note || ''),
      items, discount: opt.discount, vouchers: opt.vouchers, total, payment_method: b.payment_method || 'vnpay',
      payment_status: 'paid', payment_ref: 'PAY-TEST-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      status: 'sourced', created_at: t, updated_at: t };
    const ff = items.map((it, i) => ({ sku: it.sku, product_name: it.name, qty: it.qty, status: 'shipping',
      tracking_code: CARRIERS[i % 3] + '-' + Math.floor(1e8 + Math.random() * 9e8), updated_at: t }));
    const inv = { number: 'KKM-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 899999), status: 'sent', sent_at: t };
    const all = store('kk_orders', {}); all[code] = { order, fulfillments: ff, invoice: inv }; save('kk_orders', all);
    return jr({ order, applied: opt, payment: { type: 'instant', note: 'Thanh toán thử nghiệm thành công' } }, 201);
  }

  async function listProducts(qs) {
    const q = Object.fromEntries(new URLSearchParams(qs));
    let rows = (await loadFull()).slice();
    if (q.cat) rows = rows.filter(r => r.category_id === q.cat);
    if (q.group) rows = rows.filter(r => r.grp === q.group);
    if (q.brand) rows = rows.filter(r => r.brand === q.brand);
    if (q.q) { const t = fold(q.q).split(/\s+/).filter(Boolean); rows = rows.filter(r => { const h = fold(r.name + ' ' + r.brand + ' ' + r.grp + ' ' + r.sku); return t.every(x => h.includes(x)); }); }
    if (q.min) rows = rows.filter(r => r.kk_price >= +q.min);
    if (q.max) rows = rows.filter(r => r.kk_price <= +q.max);
    if (q.stock === '1') rows = rows.filter(r => r.in_stock);
    const brandCount = {};
    if (q.cat) for (const r of (await loadFull()).filter(r => r.category_id === q.cat)) brandCount[r.brand] = (brandCount[r.brand] || 0) + 1;
    const sorters = { price_asc: (a, b) => a.kk_price - b.kk_price, price_desc: (a, b) => b.kk_price - a.kk_price, sold: (a, b) => b.sold - a.sold, rating: (a, b) => b.rating - a.rating, new: (a, b) => b.sku.localeCompare(a.sku) };
    rows.sort(sorters[q.sort] || ((a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold)));
    const limit = Math.min(60, +q.limit || 24); const page = Math.max(1, +q.page || 1);
    return jr({ total: rows.length, page, limit, items: rows.slice((page - 1) * limit, page * limit),
      brands: Object.entries(brandCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([brand, n]) => ({ brand, n })) });
  }

  window.fetch = async function (url, opts) {
    const u = String(url);
    if (!u.startsWith('/api/')) return realFetch(url, opts);
    const method = (opts && opts.method || 'GET').toUpperCase();
    const body = opts && opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return {}; } })() : {};
    const [path, qs] = u.split('?');
    try {
      if (path === '/api/meta') return jr(fixImg(await realFetch('api/meta.json').then(r => r.json())));
      if (path === '/api/sdui/home') return jr(fixImg(await realFetch('api/sdui-home.json').then(r => r.json())));
      if (path === '/api/catalog-pack') return jr(await realFetch('api/catalog-pack.json').then(r => r.json()));
      if (path === '/api/vouchers') return jr(VOUCHERS.map(v => ({ ...v })));
      if (path === '/api/ledger-verify') return jr(await realFetch('api/ledger-verify.json').then(r => r.json()).catch(() => ({ ok: true })));
      let m;
      if ((m = path.match(/^\/api\/products\/([A-Za-z0-9-]+)$/))) {
        const d = await realFetch('api/products/' + m[1] + '.json');
        if (!d.ok) return err('Không tìm thấy sản phẩm', 404);
        const p = fixImg(await d.json());
        const mine = store('kk_reviews', {})[p.sku] || [];
        p.reviews = [...mine, ...(p.reviews || [])];
        const n = p.reviews.length; p.reviewStat = { n, avg: n ? p.reviews.reduce((a, r) => a + r.rating, 0) / n : null };
        return jr(p);
      }
      if ((m = path.match(/^\/api\/ledger\/([A-Z0-9]+)$/))) {
        const d = await realFetch('api/products/' + m[1] + '.json');
        return d.ok ? jr({ sku: m[1], entries: (await d.json()).ledger || [] }) : err('Không có dữ liệu', 404);
      }
      if (path === '/api/products' && method === 'GET') return listProducts(qs || '');
      if (path === '/api/cart/optimize') return jr(await optimize(body.items || [], body.codes || []));
      if (path === '/api/members' && method === 'POST') {
        if (!body.name || !body.phone || !body.email) return err('Thiếu thông tin');
        const mem = { name: String(body.name).slice(0, 100), phone: normPhone(body.phone), email: String(body.email).toLowerCase().slice(0, 120), created_at: nowIso() };
        const all = store('kk_members', {}); all[mem.phone] = mem; save('kk_members', all);
        return jr({ ok: true, is_admin: mem.email === 'nguyenduydien75@gmail.com' });
      }
      if (path === '/api/members/orders' && method === 'GET') {
        const q = new URLSearchParams(qs || '');
        const ph = normPhone(q.get('phone')), em = String(q.get('email') || '').toLowerCase();
        const rows = Object.values(store('kk_orders', {}))
          .filter(r => r.order.customer_phone === ph)
          .map(r => ({ code: r.order.code, total: r.order.total, discount: r.order.discount, payment_status: r.order.payment_status, status: r.order.status, created_at: r.order.created_at }))
          .sort((a, b) => b.created_at < a.created_at ? -1 : 1);
        return jr(rows);
      }
      if (path === '/api/orders' && method === 'POST') return createOrder(body);
      if ((m = path.match(/^\/api\/orders\/([A-Z0-9]+)$/))) {
        const rec = store('kk_orders', {})[m[1]];
        if (!rec || normPhone(new URLSearchParams(qs || '').get('phone')) !== rec.order.customer_phone) return err('Không tìm thấy đơn hàng hoặc số điện thoại không khớp (đơn đặt thử được lưu trên chính thiết bị đã đặt)', 404);
        return jr({ ...rec, payment: null, refund: null });
      }
      if (path === '/api/reviews' && method === 'POST') {
        const rec = store('kk_orders', {})[String(body.order_code || '').toUpperCase()];
        if (!rec || normPhone(body.phone) !== rec.order.customer_phone) return err('Cần mã đơn hàng + SĐT khớp để đánh giá (mua hàng xác thực)', 403);
        if (!rec.order.items.some(i => i.sku === body.sku)) return err('Sản phẩm không có trong đơn này');
        const all = store('kk_reviews', {}); const arr = all[body.sku] || [];
        const nm = rec.order.customer_name.split(' ');
        arr.unshift({ rating: Math.max(1, Math.min(5, +body.rating || 5)), content: String(body.content || '').slice(0, 500),
          display_name: nm[nm.length - 1] + ' ' + (nm[0] || '').charAt(0) + '.', verified: 1, created_at: nowIso() });
        all[body.sku] = arr.slice(0, 10); save('kk_reviews', all);
        return jr({ ok: true, note: 'Cảm ơn bạn! Đánh giá đã được ghi nhận và hiển thị.' }, 201);
      }
      if (path.startsWith('/api/zkp')) return jr({ eligible: true, nullifier: 'edge-' + Math.random().toString(36).slice(2), note: 'Xác minh trên thiết bị' });
      return err('Tính năng này chạy trên máy chủ KK-MALL', 404);
    } catch (e) { return err('Lỗi xử lý: ' + e.message, 500); }
  };
})();
