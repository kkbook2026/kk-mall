/*
 * KK-MALL Auto Order - thư viện dùng chung (trang Tiki + nền + kiểm thử Node)
 * (c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
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
  /* kế hoạch đặt: nguồn tự động (Tiki) rẻ nhất trong biên dung sai so với giá đã thu */
  function planAuto(item, offers, tol, sources) {
    const unit = Number(item.unit_cost) || Math.round(item.collected_cost / item.qty);
    const fit = (offers || []).filter(x => x && x.k && !x.x).map(x => Object.assign({}, x, { l: x.l != null ? x.l : x.p })).filter(x => x.l - unit <= tol).sort((a, b) => a.l - b.l);
    const ok = fit.filter(x => (sources || ['tiki']).includes(x.s) && /^https:\/\/tiki\.vn\/[^?#]*-p\d+\.html/.test(x.u || ''));
    let why = '';
    if (item.vat) why = 'Đơn cần hóa đơn GTGT - giai đoạn 1 đặt tay';
    else if (!fit.length) why = 'Không còn nguồn hợp lệ trong biên dung sai - xử lý tay (hoàn tiền/chờ nguồn)';
    else if (!ok.length) why = 'Nguồn phù hợp (' + fit[0].s + ') chưa có bot - đặt tay';
    return { unit, best: fit[0] || null, pick: why ? null : ok[0], why };
  }
  const api = { norm, digits, money, expandAddr, patterns, pickUnit, parseAddress, streetOf, cover, planAuto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KKLIB = api;
})(typeof self !== 'undefined' ? self : this);
