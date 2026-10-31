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

  /* ---------- TAI DU LIEU THEO NGANH (nhe cho dien thoai) ----------
   * api/cat/index.json  : danh sach nganh + so luong + nhom
   * api/cat/<nganh>.json: san pham cua 1 nganh (chi tai khi xem nganh do)
   * catalog-pack.json   : chi muc gon de tim kiem / sap xep toan site
   * products/<sku>.json : chi tiet tung SP (gio hang, the san pham) */
  let CATIDX = null, PACK = null; const CHUNK = {}, PROD = {};
  async function catIndex() {
    if (CATIDX === null) { try { const r = await realFetch('api/cat/index.json', { cache: 'no-cache' }); CATIDX = r.ok ? await r.json() : false; } catch { CATIDX = false; } }
    return CATIDX;
  }
  function loadCat(id) {
    if (!CHUNK[id]) CHUNK[id] = realFetch('api/cat/' + encodeURIComponent(id) + '.json?v=' + encodeURIComponent((CATIDX && CATIDX.v) || '')).then(r => r.ok ? r.json() : []).catch(() => []);
    return CHUNK[id];
  }
  async function getPack() {
    if (!PACK) PACK = realFetch('api/catalog-pack.json').then(r => r.json());
    return PACK;
  }
  function getProd(sku) {
    if (!PROD[sku]) PROD[sku] = realFetch('api/products/' + sku + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
    return PROD[sku];
  }
  async function bySkus(skus) {
    const ix = await catIndex();
    if (!ix) { const full = await loadFull(); return Object.fromEntries(full.map(r => [r.sku, r])); }
    const out = {}; await Promise.all([...new Set(skus)].map(async s => { const d = await getProd(s); if (d) out[s] = d; }));
    return out;
  }
  const toRow = d => ({ sku: d.sku, name: d.name, slug: d.slug, category_id: d.category_id, category_name: d.category_name, grp: d.grp, brand: d.brand, variant: d.variant || '',
    image: d.image, base_price: d.base_price, kk_price: d.kk_price, in_stock: d.in_stock, stock_qty: d.stock_qty, rating: d.rating, sold: d.sold, updated_at: d.updated_at,
    disc: d.trust ? d.trust.disc : (d.disc || 0), fl: d.trust ? d.trust.fl : (d.fl || 0) });

  // ---------- VOUCHER (chay tren thiet bi) ----------
  const VOUCHERS = [
    { code: 'KKWELCOME', title: 'Giảm 10% tối đa 50K cho đơn từ 200K', type: 'percent', value: 10, max_discount: 50000, min_order: 200000, scope: 'all', group: 'order' },
    { code: 'KK50', title: 'Giảm 50K cho đơn từ 1 triệu', type: 'fixed', value: 50000, min_order: 1000000, scope: 'all', group: 'order' },
    { code: 'KK150', title: 'Giảm 150K cho đơn từ 5 triệu', type: 'fixed', value: 150000, min_order: 5000000, scope: 'all', group: 'order' },
    { code: 'DIENLANH5', title: 'Giảm 5% tối đa 300K ngành Điện lạnh', type: 'percent', value: 5, max_discount: 300000, min_order: 2000000, scope: 'dien-lanh', group: 'category' },
    { code: 'GIADUNG30', title: 'Giảm 30K nhóm Gia dụng, đơn từ 300K', type: 'fixed', value: 30000, min_order: 300000, scope: 'gia-dung', group: 'category' },
  ];
  window.KK_VOUCHERS = VOUCHERS.map(v => ({ ...v }));
  async function optimize(items, extraCodes) {
    const bySku = await bySkus(items.map(i => i.sku));
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
    // PRICE LOCK: doi chieu gia da chot luc bam Thanh toan voi du lieu moi nhat
    const fresh = {}; await Promise.all((b.items || []).map(async i => { try { const r = await realFetch('api/products/' + i.sku + '.json?lc=' + Date.now(), { cache: 'no-store' }); if (r.ok) fresh[i.sku] = await r.json(); } catch { } }));
    for (const s in fresh) PROD[s] = Promise.resolve(fresh[s]);
    if (b.lock) {
      if (!b.lock.exp || Date.now() > b.lock.exp) return err('Hết thời gian giữ giá 15 phút - hệ thống sẽ kiểm tra lại giá & tồn kho', 409);
      const changed = (b.lock.items || []).filter(l => { const p = fresh[l.sku]; return !p || p.kk_price !== l.price || !p.in_stock || (p.trust && (p.trust.fl & 1)); });
      if (changed.length) return err('Giá hoặc tồn kho vừa thay đổi ở ' + changed.length + ' sản phẩm - vui lòng xác nhận lại giá mới', 409);
    }
    const bySku = { ...(await bySkus((b.items || []).filter(i => !fresh[i.sku]).map(i => i.sku))), ...fresh };
    const items = (b.items || []).map(i => { const p = bySku[i.sku]; if (!p || !p.in_stock || (p.trust && (p.trust.fl & 1))) return null;
      const qty = Math.max(1, Math.min(20, +i.qty || 1));
      return { sku: p.sku, name: p.name, image: p.image, qty, unit: p.kk_price, line_total: p.kk_price * qty }; }).filter(Boolean);
    if (!items.length) return err('Giỏ hàng trống hoặc sản phẩm vừa hết hàng');
    const opt = await optimize(b.items, b.voucher_codes || []);
    const total = Math.max(0, items.reduce((a, i) => a + i.line_total, 0) - opt.discount);
    const code = 'KK' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + Math.random().toString(36).slice(2, 6).toUpperCase();
    const t = nowIso();
    const order = { code, customer_name: name, customer_phone: phone, customer_email: email, customer_address: addr, note: String(b.note || ''),
      items, discount: opt.discount, vouchers: opt.vouchers, total, payment_method: b.payment_method || 'vnpay',
      price_lock: b.lock ? { at: new Date(b.lock.at).toISOString(), checked_ms: b.lock.ms || null } : null,
      payment_status: 'paid', payment_ref: 'PAY-TEST-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      status: 'sourced', created_at: t, updated_at: t };
    const ff = items.map((it, i) => ({ sku: it.sku, product_name: it.name, qty: it.qty, status: 'shipping',
      tracking_code: CARRIERS[i % 3] + '-' + Math.floor(1e8 + Math.random() * 9e8), updated_at: t }));
    const inv = { number: 'KKM-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 899999), status: 'sent', sent_at: t };
    const all = store('kk_orders', {}); all[code] = { order, fulfillments: ff, invoice: inv }; save('kk_orders', all);
    return jr({ order, applied: opt, payment: { type: 'instant', note: 'Thanh toán thử nghiệm thành công' } }, 201);
  }

  const SORTERS = { price_asc: (a, b) => a.kk_price - b.kk_price, price_desc: (a, b) => b.kk_price - a.kk_price, sold: (a, b) => b.sold - a.sold, rating: (a, b) => b.rating - a.rating, new: (a, b) => b.sku.localeCompare(a.sku) };
  const DEF_SORT = (a, b) => (b.in_stock - a.in_stock) || (b.sold - a.sold);
  function filterRows(rows, q) {
    if (q.group) rows = rows.filter(r => r.grp === q.group);
    if (q.brand) rows = rows.filter(r => r.brand === q.brand);
    if (q.q) { const t = fold(q.q).split(/\s+/).filter(Boolean); rows = rows.filter(r => { const h = fold(r.name + ' ' + r.brand + ' ' + r.grp + ' ' + r.sku); return t.every(x => h.includes(x)); }); }
    if (q.min) rows = rows.filter(r => r.kk_price >= +q.min);
    if (q.max) rows = rows.filter(r => r.kk_price <= +q.max);
    if (q.stock === '1') rows = rows.filter(r => r.in_stock);
    return rows.sort(SORTERS[q.sort] || DEF_SORT);
  }
  /* ---------- BO LOC HANH VI MUA SAM (chay tren chi muc gon, da qua Bo loc Tin cay) ---------- */
  const GENERIC = /^(kk select|no ?brand|oem|khác|không thương hiệu|generic|)$/i;
  const BLOCK = 1 | 2 | 16 | 32; // tam giu | hang cu | gia goc ao | chua co nguon that
  const SMART = {
    deal: { test: r => r.in_stock && r.disc >= 20 && !(r.fl & BLOCK), sort: (a, b) => (b.disc - a.disc) || (b.sold - a.sold) },
    low: { test: r => r.in_stock && (r.fl & 4) && !(r.fl & 3), sort: (a, b) => (b.sold - a.sold) },
    clear: { test: r => r.in_stock && r.disc >= 10 && !(r.fl & BLOCK) && !GENERIC.test(String(r.brand || '').trim()), sort: (a, b) => (b.disc * Math.log(b.sold + 2)) - (a.disc * Math.log(a.sold + 2)) },
    combo: { test: r => r.in_stock && (r.fl & 8) && !(r.fl & 3), sort: (a, b) => (b.disc - a.disc) || (b.sold - a.sold) },
  };
  let SCACHE = null; // ket qua tim kiem gan nhat (phan trang khong tinh lai)
  async function listProducts(qs) {
    const q = Object.fromEntries(new URLSearchParams(qs));
    const limit = Math.min(60, +q.limit || 24); const page = Math.max(1, +q.page || 1);
    const ix = await catIndex();
    let rows, brandSrc = null;
    if (!ix) {                                   // du phong: ban cu chua tach nganh
      rows = (await loadFull()).slice(); if (q.cat) rows = rows.filter(r => r.category_id === q.cat);
      if (q.cat) brandSrc = rows.slice();
      rows = filterRows(rows, q);
    } else if (q.cat) {                          // xem 1 nganh: chi tai file nganh do
      const all = await loadCat(q.cat); brandSrc = all;
      rows = filterRows(all.slice(), q);
    } else {                                     // tim kiem / tat ca: loc tren chi muc gon, roi lay chi tiet dung trang can xem
      const pk = await getPack();
      const lite = pk.rows.map(r => ({ sku: r[0], name: r[1], brand: r[2], category_id: r[3], category_name: r[4], grp: r[5], kk_price: r[6], in_stock: r[7], rating: r[8], sold: r[9], disc: r[10] || 0, fl: r[11] || 0 }));
      let hit, search = null, brands = [];
      if (q.q && window.kkSearch) {                // KK-SEARCH: xep theo do phu hop (Worker), roi ap cac bo loc phu
        let ks = SCACHE && SCACHE.q === q.q ? SCACHE.r : await window.kkSearch(q.q);
        if (ks) {
          SCACHE = { q: q.q, r: ks };
          const order = new Map(ks.skus.map((k, i) => [k, i])), by = new Map(lite.map(r => [r.sku, r]));
          const rel = new Map(ks.skus.map((k, i) => [k, ks.rel ? ks.rel[i] : 1]));
          hit = ks.skus.map(k => by.get(k)).filter(Boolean);
          if (q.sort) hit = hit.filter(r => rel.get(r.sku) >= 0.35);   // sap xep lai (gia/ban chay): chi giu ket qua lien quan manh
          const bc = {}; for (const r of hit) bc[r.brand] = (bc[r.brand] || 0) + 1;
          brands = Object.entries(bc).filter(([b]) => !GENERIC.test(String(b || '').trim())).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([brand, n]) => ({ brand, n }));
          if (q.group) hit = hit.filter(r => r.grp === q.group);
          if (q.brand) hit = hit.filter(r => r.brand === q.brand);
          if (q.min) hit = hit.filter(r => r.kk_price >= +q.min);
          if (q.max) hit = hit.filter(r => r.kk_price <= +q.max);
          if (q.stock === '1') hit = hit.filter(r => r.in_stock);
          hit.sort(SORTERS[q.sort] || ((a, b) => order.get(a.sku) - order.get(b.sku)));
          search = { fix: ks.fix, relaxed: ks.relaxed, price: ks.price, groups: ks.groups, total: ks.total };
        }
      }
      if (!hit) {
        if (q.f && SMART[q.f]) { const F = SMART[q.f]; const sq = { ...q }; delete sq.sort; hit = filterRows(lite.filter(F.test), sq); if (!q.sort) hit.sort(F.sort); }
        else hit = filterRows(lite, q);
      }
      const slice = hit.slice((page - 1) * limit, page * limit);
      const det = await bySkus(slice.map(r => r.sku));
      return jr({ total: hit.length, page, limit, items: slice.map(r => det[r.sku] ? fixImg(toRow(det[r.sku])) : r), brands, search });
    }
    const brandCount = {};
    if (brandSrc) for (const r of brandSrc) brandCount[r.brand] = (brandCount[r.brand] || 0) + 1;
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
      if (path === '/api/ledger-roots') return jr(await realFetch('api/ledger-roots.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => []));
      if (path === '/api/ledger-recent') return jr(await realFetch('api/ledger-recent.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ items: [] })));
      if (path === '/api/ledger-verify') return jr(await realFetch('api/ledger-verify.json').then(r => r.json()).catch(() => ({ ok: true })));
      let m;
      if ((m = path.match(/^\/api\/products\/([A-Za-z0-9-]+)$/))) {
        const d = await realFetch('api/products/' + m[1] + '.json');
        if (!d.ok) return err('Không tìm thấy sản phẩm', 404);
        const p = fixImg(await d.json());
        // danh gia that lay truc tiep tu may chu khi mo SP (review.list); thong ke n/avg do bo thu thap gan tu may chu
        p.reviews = []; if (!p.reviewStat || !p.reviewStat.n) { p.reviewStat = { n: 0, avg: null }; p.rating = 0; }
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
      if (path.startsWith('/api/zkp')) return jr({ eligible: true, nullifier: 'edge-' + Math.random().toString(36).slice(2), note: 'Xác minh trên thiết bị' });
      return err('Tính năng này chạy trên máy chủ KK-MALL', 404);
    } catch (e) { return err('Lỗi xử lý: ' + e.message, 500); }
  };
})();
