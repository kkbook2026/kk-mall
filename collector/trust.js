'use strict';
/*
 * KK-MALL TRUST ENGINE - Bo loc Tin cay gia (Anomaly Detection) + So cai mat ma (Merkle)
 * Dung chung cho: collector (3 gio/lan), trust-pass (chay doc lap), build-seo (trang tinh).
 *
 * Nguyen tac:
 *  1. Loc offer ngoai lai TRUOC khi chon gia re nhat: offer < 50% trung vi lich su niem phong,
 *     < 50% trung vi cac nguon, ten offer la phu kien trong khi SP la may chinh, hoac duoi san gia nhom
 *     => loai (thuong la phu kien/linh kien dang chung link, sai phan loai, loi gia, hang ao).
 *  2. Neu khong con offer hop le => TAM GIU (hold): khong cho dat, khong len ke deal.
 *  3. % giam hien thi chi khi DA XAC MINH: so voi gia tham chieu tin cay, toi da 50%
 *     (Nghi dinh 81/2018/ND-CP: muc giam khong vuot 50% gia truoc khuyen mai).
 *     Hang da qua su dung khong bao gio so voi gia may moi.
 * (c) Nguyen Duy Dien (KK-2026). All rights reserved.
 */
const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/* ---------- Nhan dien ---------- */
// Hang da qua su dung: so khop CO DAU de khong nham "dụng cụ" voi "cũ"
const USED_RE = /(\s[-–|:]\s*cũ(?=[\s)\],.;]|$)|[(\[]\s*cũ|\scũ\s*(đẹp|trầy|xước|cấn|như mới|\d+\s?%)|hàng cũ|máy cũ|đã qua sử dụng|like ?new|trầy xước|xước cấn|cấn móp|tân trang|refurbish|\s[-–]\s*(99|98|97|95)\s?%|\scũ$)/i;
const isUsed = (name, cat) => cat !== 'sach-van-phong-pham' && USED_RE.test(String(name || '').toLowerCase());

const ACC_RE = /\b(op lung|bao da|bao dung|mieng dan|cuong luc|dan man hinh|day sac|cap sac|cu sac|cot sac|sac nhanh|adapter|remote|dieu khien tu xa|gia do|gia treo|ke treo|chan de|de tan nhiet|khay|gioang|ron cua|loi loc|bo loc|mang loc|coc loc|phu kien|linh kien|ao trum|tam che|bao trum|vo boc|tui chong soc|tui dung|nap dau|ong xa|ong thoat|day cap|day nguon|day dong ho|day deo|pin thay|pin cmos|but cam ung|skin|sticker|case|kinh cuong luc|ban di|thanh ray|motor thay|bo mach|board mach|cam bien thay|tem|mieng lot|tham lot|nut bam|nap dong)\b/;
const isAccessory = name => ACC_RE.test(fold(name));

const COMBO_RE = /\b(combo|bo \d+|set \d+|\d+ ?(hop|chai|goi|lon|tui|cuon|cai|chiec|doi|tuyp|lo|loc|thung|vi|cap)\b|loc \d+|thung \d+|pack \d+|\d+ ?pack|mua \d+ tang \d+)/;
const isCombo = name => COMBO_RE.test(fold(name));

/* San gia hop ly cho MAY CHINH theo nhom (VND). Duoi san ma ten la may chinh => nghi loi gia / bien the. */
const FLOOR = {
  'Tủ lạnh': 1800000, 'Máy lạnh / Điều hòa': 3500000, 'Máy giặt & Sấy': 2500000, 'Tủ đông & Tủ mát': 2000000,
  'Máy nước nóng': 900000, 'Smart Tivi': 2200000, 'Laptop văn phòng': 3000000, 'Laptop gaming': 8000000,
  'MacBook': 8000000, 'Điện thoại thông minh': 900000, 'Máy tính bảng': 1200000, 'Máy lọc nước': 900000,
  'Màn hình máy tính': 1200000, 'Loa kéo & Karaoke': 800000,
};
const MAIN_RE = {
  'Tủ lạnh': /^tu lanh\b/, 'Máy lạnh / Điều hòa': /^(may lanh|may dieu hoa|dieu hoa (khong khi|inverter|\d|1 chieu|2 chieu|di dong|tu dung|am tran|multi|daikin|panasonic|lg|samsung|casper|toshiba|mitsubishi|sharp|gree|midea|aqua|funiki|nagakawa|tcl|hisense|carrier|electrolux|reetech|sumikura|comfee|xiaomi))/, 'Máy giặt & Sấy': /^may giat\b/,
  'Tủ đông & Tủ mát': /^(tu dong|tu mat)\b/, 'Máy nước nóng': /^(may nuoc nong|binh nong lanh|may tam nuoc nong)\b/,
  'Smart Tivi': /^(smart )?(tivi|google tivi|android tivi|google tv|smart tv|qled|oled)\b/, 'Laptop văn phòng': /^laptop\b/, 'Laptop gaming': /^laptop\b/,
  'MacBook': /^(apple )?macbook\b/, 'Điện thoại thông minh': /^(dien thoai|iphone|samsung galaxy [asz]|xiaomi|oppo|vivo|realme)\b/,
  'Máy tính bảng': /^(may tinh bang|ipad|samsung galaxy tab)\b/, 'Máy lọc nước': /^may loc nuoc\b/, 'Màn hình máy tính': /^man hinh\b/,
  'Loa kéo & Karaoke': /^loa keo\b/,
};
const cleanName = n => fold(n).replace(/^(\s*[\[(][^\])]{1,20}[\])]\s*)+/, '').replace(/^(chinh hang|hang chinh hang|new|moi)\s+/, '').trim();
const looksMain = (name, grp) => !!(MAIN_RE[grp] && MAIN_RE[grp].test(cleanName(name)) && !isAccessory(name) && !isUsed(name));

const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#039': "'", '#34': '"' };
function cleanText(t) {
  let s = String(t || ''), prev;
  do { prev = s; s = s.replace(/&(amp|quot|apos|lt|gt|nbsp|#0?39|#34);?/gi, (m, k) => ENT[k.toLowerCase()] || m); } while (s !== prev);
  return s.replace(/\s+/g, ' ').trim();
}
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/* Gia tham chieu tu lich su niem phong (chi tinh khi du du lieu): trung vi gia so cai/ngay */
function histRef(d) {
  const L = (d.ledger || []).filter(e => e && e.kk_price > 0);
  const D = (d.d90 || []).map(x => x[1]).filter(v => v > 0);
  if (D.length >= 3) return median(D);
  if (L.length >= 3) { const span = Date.parse(L[L.length - 1].at) - Date.parse(L[0].at); if (span >= 6 * 3600e3) return median(L.map(e => e.kk_price)); }
  return 0;
}

/*
 * Loc offer cho 1 SP. offers: [{source, price, in_stock, name?}]. offset: phan gia noi bo (de so voi gia ban niem phong).
 * Tra ve { valid, dropped:[{...offer, why}] }
 */
function filterOffers(d, offers, offset) {
  const toCost = typeof offset === 'function' ? offset : (v => v - (Number.isFinite(offset) ? offset : 0));
  const H = histRef(d);                       // gia ban niem phong trung vi
  const Hsrc = H ? toCost(H) : 0;             // quy ve gia nguon (theo bieu loi tung bac)
  const live = offers.filter(o => o.in_stock && o.price > 0);
  const M = live.length >= 2 ? median(live.map(o => o.price)) : 0;
  const floor = FLOOR[d.grp] && looksMain(d.name, d.grp) ? FLOOR[d.grp] : 0;
  const mainIsAcc = isAccessory(d.name);
  const valid = [], dropped = [];
  for (const o of offers) {
    let why = '';
    if (o.in_stock && o.price > 0) {
      if (Hsrc > 0 && o.price < 0.5 * Hsrc) why = 'Thấp hơn 50% trung vị lịch sử niêm phong';
      else if (M > 0 && o.price < 0.5 * M) why = 'Thấp hơn 50% trung vị các nguồn';
      else if (o.name && !mainIsAcc && isAccessory(o.name)) why = 'Biến thể là phụ kiện/linh kiện';
      else if (floor && o.price < floor) why = 'Dưới sàn giá máy chính của nhóm';
    }
    (why ? dropped : valid).push(why ? { ...o, why } : o);
  }
  return { valid, dropped };
}

/* Danh gia tin cay cong khai cho 1 SP (sau khi da co kk_price). Khong doi gia. */
const FL = { HOLD: 1, USED: 2, LOW: 4, COMBO: 8, REF_INFLATED: 16, NO_SOURCE: 32 }; // NO_SOURCE: chua co nguon hang that (gia mo phong) -> khong cho dat
function evaluate(d) {
  let fl = 0; const why = [];
  const kk = d.kk_price || 0, base = d.base_price || 0;
  const used = isUsed(d.name, d.category_id) || isUsed(d.variant, d.category_id);
  if (used) { fl |= FL.USED; why.push('Hàng đã qua sử dụng - không so với giá máy mới'); }
  if (isCombo(d.name)) fl |= FL.COMBO;
  // HOLD: collector da danh dau (khong con offer hop le) / duoi san may chinh / sap > 50% so lich su
  const H = histRef(d);
  if (d.hold) { fl |= FL.HOLD; why.push(d.hold_why || 'Không còn nguồn giá hợp lệ'); }
  else if (kk && FLOOR[d.grp] && looksMain(d.name, d.grp) && kk < FLOOR[d.grp]) { fl |= FL.HOLD; why.push('Giá thấp bất thường so với sàn giá máy chính'); }
  else if (kk && H && kk < 0.5 * H) { fl |= FL.HOLD; why.push('Giá sụt > 50% so với trung vị lịch sử niêm phong'); }
  // Gia tham chieu tin cay:
  //  - co lich su niem phong xac nhan (H > gia hien tai): ref = min(gia niem yet, H) - bao thu, tran 50% (ND 81/2018)
  //  - chi co gia niem yet cua nguoi ban (chua co lich su xac nhan): tran tin cay 40%, vuot => "gia goc ao"
  let ref = 0, cap = 50;
  if (!used && !(fl & FL.HOLD)) {
    const hOk = H > kk, lOk = base > kk;
    if (hOk && lOk) ref = Math.min(base, H);
    else if (hOk) ref = H;
    else if (lOk) { ref = base; cap = 40; }
    if (ref && kk < (1 - cap / 100) * ref) { fl |= FL.REF_INFLATED; why.push(cap === 40 ? 'Giá gốc niêm yết chưa được lịch sử xác nhận (giảm > 40%)' : 'Giá gốc niêm yết không đáng tin (giảm > 50%)'); ref = 0; }
  }
  let disc = ref ? Math.max(0, Math.min(cap, Math.round((1 - kk / ref) * 100))) : 0;
  if (disc < 5) disc = 0;                                   // muc giam vun < 5% khong hien thi (nhieu)
  // Day gia lich su: gia hien tai <= thap nhat moi moc niem phong, va tung cao hon >= 3%
  const pts = [...(d.ledger || []).map(e => e.kk_price), ...(d.d90 || []).map(x => x[1])].filter(v => v > 0);
  if (kk && pts.length >= 2 && kk <= Math.min(...pts) && Math.max(...pts) >= kk * 1.03 && !(fl & (FL.HOLD | FL.USED))) fl |= FL.LOW;
  return { disc, fl, ref, why };
}

/* Chuoi gia theo ngay (90 ngay) - moi diem gan hash so cai cuoi ngay */
const dayOf = iso => Math.floor(Date.parse(iso) / 86400000);
function seedD90(d) {
  const by = new Map();
  for (const e of d.ledger || []) if (e && e.at) by.set(dayOf(e.at), [dayOf(e.at), e.kk_price, String(e.hash || '').slice(0, 16)]);
  return [...by.values()].sort((a, b) => a[0] - b[0]).slice(-90);
}
function updateD90(d, nowIso) {
  if (!Array.isArray(d.d90) || !d.d90.length) d.d90 = seedD90(d);
  const day = dayOf(nowIso), last = (d.ledger || []).slice(-1)[0];
  const pt = [day, d.kk_price || 0, last ? String(last.hash).slice(0, 16) : 'GENESIS'];
  if (!pt[1]) return d.d90;
  if (d.d90.length && d.d90[d.d90.length - 1][0] === day) d.d90[d.d90.length - 1] = pt; else d.d90.push(pt);
  if (d.d90.length > 90) d.d90 = d.d90.slice(-90);
  return d.d90;
}

/* Merkle (SHA-256, nut le nhan doi kieu Bitcoin). leaves: [{sku, head}] -> {root, proofs:{sku:[ 'L:hash'|'R:hash' ]}} */
const leafHash = (sku, head) => sha('LEAF|' + sku + '|' + head);
function merkle(leaves) {
  const L = leaves.slice().sort((a, b) => a.sku < b.sku ? -1 : 1);
  let level = L.map(x => leafHash(x.sku, x.head));
  const pos = L.map((_, i) => i); const proofs = L.map(() => []);
  if (!level.length) return { root: sha('EMPTY'), proofs: {}, n: 0 };
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha(level[i] + (level[i + 1] || level[i])));
    for (let k = 0; k < L.length; k++) {
      const i = pos[k], sib = i ^ 1;
      proofs[k].push((i % 2 ? 'L:' : 'R:') + (level[sib] || level[i]));
      pos[k] = i >> 1;
    }
    level = next;
  }
  const out = {}; L.forEach((x, k) => { out[x.sku] = proofs[k]; });
  return { root: level[0], proofs: out, n: L.length };
}
function verifyProof(sku, head, proof, root) {
  let h = leafHash(sku, head);
  for (const p of proof) h = p[0] === 'L' ? sha(p.slice(2) + h) : sha(h + p.slice(2));
  return h === root;
}

module.exports = { cleanText, sha, fold, isUsed, isAccessory, isCombo, looksMain, FLOOR, FL, median, histRef, filterOffers, evaluate, seedD90, updateD90, dayOf, merkle, verifyProof, leafHash };
