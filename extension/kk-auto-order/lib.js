/*
 * KK-MALL Auto Order - thư viện dùng chung (trang Tiki + nền + kiểm thử Node)
 * (c) 2026 Nguyễn Duy Điển. All rights reserved.
 */
(function (root) {
  'use strict';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); // tach chu-so dinh lien ("Văn phòng289")
  const digits = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2); return d; };
  const money = s => Math.round(Number(String(s || '').replace(/[^\d]/g, '')) || 0);

  /* Chuẩn hóa địa chỉ tự do của khách: viết tắt phổ biến -> dạng đầy đủ */
  function expandAddr(t) {
    let x = ' ' + norm(t) + ' ';
    x = x.replace(/ (tp )?(hcm|tphcm|sai gon|sg) /g, ' thanh pho ho chi minh ').replace(/ (tp )?hn /g, ' ha noi ')
      .replace(/ tp /g, ' thanh pho ').replace(/ tx /g, ' thi xa ').replace(/ tt /g, ' thi tran ')
      .replace(/ q (\d+) /g, ' quan $1 ').replace(/ p (\d+) /g, ' phuong $1 ').replace(/ q(\d+) /g, ' quan $1 ').replace(/ p(\d+) /g, ' phuong $1 ')
      .replace(/ (quan|phuong) 0+(\d)/g, ' $1 $2');
    return x.replace(/\s+/g, ' ');
  }
  const PREFIX = /^(tinh|thanh pho|quan|huyen|thi xa|phuong|xa|thi tran) /;
  /* tên đơn vị hành chính -> các mẫu tìm kiếm: tên gốc (bỏ tiền tố); tên là số thì bắt buộc có tiền tố */
  function patterns(name) {
    const n = norm(name).replace(/ 0+(\d)/g, ' $1'), base = n.replace(PREFIX, '');
    if (/^\d+$/.test(base)) return [n];
    const out = [n]; if (base !== n) out.push(base);
    return out;
  }
  /* vị trí xuất hiện CUỐI CÙNG (nguyên từ) của 1 trong các mẫu trong chuỗi t, trước vị trí limit */
  function lastPos(t, pats, limit) {
    let best = -1, len = 0;
    for (const p of pats) {
      const re = new RegExp(' ' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?= )', 'g'); let m;
      while ((m = re.exec(t))) { if (m.index + 1 + p.length <= limit && (m.index > best || (m.index === best && p.length > len))) { best = m.index; len = p.length; } }
    }
    return best < 0 ? null : { pos: best, len };
  }
  /* chọn 1 đơn vị khớp tốt nhất trong danh sách [[id, tên]] */
  function pickUnit(t, list, limit) {
    let best = null;
    for (const [id, name] of list) {
      const hit = lastPos(t, patterns(name), limit); if (!hit) continue;
      if (!best || hit.pos > best.pos || (hit.pos === best.pos && hit.len > best.len)) best = { id, name, pos: hit.pos, len: hit.len };
    }
    return best;
  }
  /*
   * Tách địa chỉ khách thành Tỉnh/Quận/Phường theo danh mục của nguồn.
   * dir: { regions(): Promise<[[id,name]]>, districts(rid), wards(did) }
   */
  async function parseAddress(addr, dir) {
    const t = expandAddr(addr) + ' ', out = { ok: false, region: null, district: null, ward: null, street: '' };
    const R = await dir.regions(); out.region = pickUnit(t, R, t.length);
    if (!out.region) return out;
    const D = await dir.districts(out.region.id); out.district = pickUnit(t, D, out.region.pos + 1);
    if (!out.district) {
      // tên quận trùng tên tỉnh (vd Thành phố Huế) hoặc khách bỏ dấu phẩy: thử toàn chuỗi
      out.district = pickUnit(t, D, t.length); if (!out.district) { out.street = streetOf(addr, [out.region.name]); return out; }
    }
    const W = await dir.wards(out.district.id); out.ward = pickUnit(t, W, out.district.pos + 1);
    out.street = streetOf(addr, [out.region.name, out.district.name, out.ward && out.ward.name].filter(Boolean));
    out.ok = !!(out.region && out.district && out.ward && out.street);
    return out;
  }
  /* phần số nhà + đường: bỏ các đoạn (theo dấu phẩy) chứa tên đơn vị hành chính */
  function streetOf(addr, units) {
    const pats = units.flatMap(patterns);
    const parts = String(addr || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    const keep = parts.filter(p => {
      const n = expandAddr(p).trim(), nn = ' ' + n + ' ';
      if (PREFIX.test(n + ' ') || /^(phuong|xa|quan|huyen|tinh|thanh pho|thi tran|thi xa)( |$)/.test(n)) return false; // doan bat dau bang cap hanh chinh
      return !pats.some(q => nn.includes(' ' + q + ' ') && n.length <= q.length + 14);
    });
    let s = (keep.length ? keep : parts.slice(0, 1)).join(', ');
    if (parts.length === 1) { // khách không dùng dấu phẩy: cắt bỏ phần đuôi là tên đơn vị
      let n = norm(s); for (const q of pats) { const i = (' ' + n + ' ').lastIndexOf(' ' + q + ' '); if (i >= 0 && i > 3) n = n.slice(0, i).trim(); }
      const words = n.split(' ').length; s = s.split(/\s+/).slice(0, words).join(' ');
    }
    return s.trim().replace(/[,\s]+$/, '');
  }
  /* mức độ phủ (0..1) các từ của a trong b */
  function cover(a, b) {
    const ta = norm(a).split(' ').filter(w => w.length >= 1), hb = ' ' + norm(b) + ' ';
    if (!ta.length) return 0; return ta.filter(w => hb.includes(' ' + w + ' ')).length / ta.length;
  }
  /* JSON chuẩn hóa (khóa sắp xếp) - cùng thuật toán với canon_ trên máy chủ, dùng để ký thông điệp */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  /* Giờ làm việc theo chính sách (tz Việt Nam) */
  function inHours(h, now) {
    h = h || {}; const tz = h.tz || 'Asia/Ho_Chi_Minh';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(now || Date.now()));
    const m = {}; parts.forEach(x => { m[x.type] = x.value; }); const cur = (m.hour === '24' ? '00' : m.hour) + ':' + m.minute, a = h.from || '00:00', b = h.to || '23:59';
    return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
  }
  /* Đánh giá chính sách phía tiện ích (bản sao của policyEval_ trên máy chủ - máy chủ vẫn quyết định cuối khi claim/paying)
   * item: lệnh mua (collected_cost, vat), offer: { s, l (giá thực trả/đơn vị) }, pol: chính sách từ bot.queue, ctx: { daySpent, now, firstOrder } */
  function policyEval(item, offer, pol, ctx) {
    ctx = ctx || {}; pol = pol || {}; const A = pol.autonomy || {}, r = [], val = Math.round(Number(item.collected_cost) || 0);
    if (A.enabled === false) r.push('AUTONOMY_OFF');
    if (A.hours && !inHours(A.hours, ctx.now)) r.push('OUT_OF_HOURS');
    if (A.otp_max_vnd !== undefined && val > Number(A.otp_max_vnd)) r.push('OVER_AUTO_CAP');
    if (ctx.daySpent !== undefined && A.daily_cap_vnd !== undefined && Number(ctx.daySpent) + val > Number(A.daily_cap_vnd)) r.push('DAILY_CAP');
    const S = pol.sources || {};
    if (offer && offer.s) {
      if (S.allow && S.allow.indexOf(offer.s) < 0) r.push('SOURCE_NOT_ALLOWED');
      if (item.vat && S.vat_sources && S.vat_sources.indexOf(offer.s) < 0) r.push('VAT_NEEDS_B2B');
    }
    const tol = pol.price && pol.price.tolerance_vnd !== undefined ? Number(pol.price.tolerance_vnd) : (ctx.tol !== undefined ? Number(ctx.tol) : 5000);
    if (offer && offer.l !== undefined) { const total = Math.round(Number(offer.l) * (Number(item.qty) || 1)); if (total > val + tol) r.push('OVER_CAP'); }
    if (ctx.firstOrder && pol.customer && val > Number(pol.customer.first_order_hold_over_vnd)) r.push('NEW_CUSTOMER_HIGH_VALUE');
    const decision = r.length ? 'hold' : (A.auto_max_vnd !== undefined && val > Number(A.auto_max_vnd) ? 'otp' : 'auto');
    return { decision, reasons: r };
  }
  /* kế hoạch đặt: nguồn tự động (Tiki) rẻ nhất trong biên dung sai so với giá đã thu; pol (tùy chọn) = chính sách từ máy chủ */
  function planAuto(item, offers, tol, sources, pol) {
    if (pol && pol.price && pol.price.tolerance_vnd !== undefined) tol = Number(pol.price.tolerance_vnd);
    let src = (sources || ['tiki']).slice(); if (pol && pol.sources && Array.isArray(pol.sources.allow)) src = src.filter(x => pol.sources.allow.includes(x));
    const unit = Number(item.unit_cost) || Math.round(item.collected_cost / item.qty);
    const fit = (offers || []).filter(x => x && x.k && !x.x).map(x => Object.assign({}, x, { l: x.l != null ? x.l : x.p })).filter(x => x.l - unit <= tol).sort((a, b) => a.l - b.l);
    const ok = fit.filter(x => src.includes(x.s) && /^https:\/\/tiki\.vn\/[^?#]*-p\d+\.html/.test(x.u || ''));
    let why = '';
    const vatOk = pol && pol.sources && Array.isArray(pol.sources.vat_sources) ? x => pol.sources.vat_sources.includes(x.s) : () => false;
    if (item.vat && !(ok.length && vatOk(ok[0]))) why = 'Đơn cần hóa đơn GTGT - nguồn chưa được phép xuất VAT qua bot, đặt tay';
    else if (!fit.length) why = 'Không còn nguồn hợp lệ trong biên dung sai - xử lý tay (hoàn tiền/chờ nguồn)';
    else if (!ok.length) why = 'Nguồn phù hợp (' + fit[0].s + ') chưa có bot hoặc không trong danh sách cho phép - đặt tay';
    const pick = why ? null : ok[0];
    let ev = null;
    if (pick && pol) { ev = policyEval(item, pick, pol, { daySpent: pol._daySpent, tol }); if (ev.decision === 'hold') why = 'Ngoài hành lang chính sách: ' + ev.reasons.join(', '); }
    return { unit, best: fit[0] || null, pick: why ? null : pick, why, decision: ev ? ev.decision : (pick ? 'auto' : 'hold'), reasons: ev ? ev.reasons : [] };
  }
  const api = { norm, digits, money, expandAddr, patterns, pickUnit, parseAddress, streetOf, cover, planAuto, policyEval, inHours, canon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KKLIB = api;
})(typeof self !== 'undefined' ? self : this);
