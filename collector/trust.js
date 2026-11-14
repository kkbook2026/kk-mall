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
 * (c) Nguyen Duy Dien. All rights reserved.
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
function histRef(d, today) {
  // d.href = ngay "dat lai moc tham chieu": muc gia moi da duoc XAC NHAN LAP LAI tai chuoi ban le chinh hang (collect.js) -> chi doi chieu voi lich su
  // tu ngay do tro di. Lich su niem phong (so cai, d90) KHONG bi sua - chi doi cua so dung de phat hien bat thuong.
  const from = d.href || 0, fromMs = from ? Date.parse(String(d.href_at || '')) || 0 : 0;
  const L = (d.ledger || []).filter(e => e && e.kk_price > 0 && (!fromMs || Date.parse(e.at) >= fromMs));
  const D = histVals(d.d90, today || dayOf(new Date().toISOString()), from).filter(v => v > 0);   // gia tung ngay (d90 luu nen theo doan)
  if (D.length >= 3) return median(D);
  if (L.length >= 3) { const span = Date.parse(L[L.length - 1].at) - Date.parse(L[0].at); if (span >= 6 * 3600e3) return median(L.map(e => e.kk_price)); }
  return 0;
}

/*
 * Loc offer cho 1 SP. offers: [{source, price, in_stock, name?}]. offset: phan gia noi bo (de so voi gia ban niem phong).
 * Tra ve { valid, dropped:[{...offer, why}] }
 */
const RETAIL_TRUSTED = new Set(['thegioididong', 'dienmayxanh', 'fptshop', 'cellphones', 'dienmaycholon', 'hoangha', 'phucanh', 'anphat']);
function filterOffers(d, offers, offset, today) {
  const toCost = typeof offset === 'function' ? offset : (v => v - (Number.isFinite(offset) ? offset : 0));
  const H = histRef(d, today);                // gia ban niem phong trung vi
  const Hsrc = H ? toCost(H) : 0;             // quy ve gia nguon (theo bieu loi tung bac)
  const live = offers.filter(o => o.in_stock && o.price > 0);
  // Trung vi tinh theo CHU SO HUU bang gia (The Gioi Di Dong + Dien May Xanh dung chung 1 bang gia niem yet -> chi tinh 1 lan),
  // neu khong gia niem yet cao cua cung 1 cong ty se keo trung vi len va loai oan gia re that cua nguon khac.
  const owner = sname => (sname === 'dienmayxanh' ? 'thegioididong' : sname);
  const byOwner = {}; for (const o of live) { const k = owner(o.source); if (!(k in byOwner) || o.price < byOwner[k]) byOwner[k] = o.price; }
  const ownerPrices = Object.values(byOwner);
  const M = ownerPrices.length >= 2 ? median(ownerPrices) : 0;
  const floor = FLOOR[d.grp] && looksMain(d.name, d.grp) ? FLOOR[d.grp] : 0;
  const mainIsAcc = isAccessory(d.name);
  const valid = [], dropped = [];
  for (const o of offers) {
    let why = '';
    if (o.in_stock && o.price > 0) {
      // Hsrc la GIA THUC TRA (niem yet + ship nguon) suy tu gia ban niem phong -> phai so voi gia thuc tra cua offer, KHONG phai gia niem yet:
      // hang re co phi ship du phong lon hon gia hang (sach 22k + ship 30k) tung bi "thap hon 50% lich su" vinh vien -> het hang oan.
      const lp = o.landed > 0 ? o.landed : o.price;
      if (Hsrc > 0 && lp < 0.5 * Hsrc) why = 'Thấp hơn 50% trung vị lịch sử niêm phong';
      else if (M > 0 && o.price < 0.5 * M && !(RETAIL_TRUSTED.has(o.source) && (!o.fz || o.fz >= 0.92))) why = 'Thấp hơn 50% trung vị các nguồn';   // chuoi ban le chinh hang khop CHINH XAC / trung day du ma hang: gia re hon han la gia that (thanh ly/khuyen mai), khong loai
      else if (Hsrc > 0 && lp > 2.5 * Hsrc) why = 'Cao hơn 2,5 lần trung vị lịch sử niêm phong (nghi lấy nhầm giá niêm yết/biến thể)';
      else if (M > 0 && o.price > 2.5 * M) why = 'Cao hơn 2,5 lần trung vị các nguồn';
      else if (d.base_price > 0 && o.price > 2.5 * d.base_price) why = 'Cao hơn 2,5 lần giá niêm yết đã xác minh (nghi lấy nhầm giá gạch/biến thể)';
      else if (o.name && !mainIsAcc && isAccessory(o.name)) why = 'Biến thể là phụ kiện/linh kiện';
      else if (floor && o.price < floor) why = 'Dưới sàn giá máy chính của nhóm';
    }
    if (why) { o.why = why; dropped.push(o); } else valid.push(o);     // giu NGUYEN doi tuong offer (de co ly do loai hien dung trong goi quan tri)
  }
  return { valid, dropped };
}

/* Danh gia tin cay cong khai cho 1 SP (sau khi da co kk_price). Khong doi gia. */
const FL = { HOLD: 1, USED: 2, LOW: 4, COMBO: 8, REF_INFLATED: 16, NO_SOURCE: 32 }; // NO_SOURCE: chua co nguon hang that (gia mo phong) -> khong cho dat
function evaluate(d, today) {
  let fl = 0; const why = [];
  const kk = d.kk_price || 0, base = d.base_price || 0;
  const used = isUsed(d.name, d.category_id) || isUsed(d.variant, d.category_id);
  if (used) { fl |= FL.USED; why.push('Hàng đã qua sử dụng - không so với giá máy mới'); }
  if (isCombo(d.name)) fl |= FL.COMBO;
  // HOLD: collector da danh dau (khong con offer hop le) / duoi san may chinh / sap > 50% so lich su
  const H = histRef(d, today);
  if (d.hold) { fl |= FL.HOLD; why.push(d.hold_why || 'Không còn nguồn giá hợp lệ'); }
  else if (kk && FLOOR[d.grp] && looksMain(d.name, d.grp) && kk < FLOOR[d.grp]) { fl |= FL.HOLD; why.push('Giá thấp bất thường so với sàn giá máy chính'); }
  else if (kk && H && kk < 0.5 * H) { fl |= FL.HOLD; why.push('Giá sụt > 50% so với trung vị lịch sử niêm phong'); }
  else if (kk && base && kk > 2.5 * base + 32000) { fl |= FL.HOLD; why.push('Giá cao bất thường so với giá niêm yết đã xác minh - đang đối chiếu lại với nguồn'); }
  else if (kk && H && kk > 2.5 * H) { fl |= FL.HOLD; why.push('Giá tăng bất thường > 2,5 lần trung vị lịch sử - đang xác minh lại với nguồn'); }
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
/* d90 LUU NEN THEO DOAN: moi phan tu [ngay, gia, 16 ky tu dau hash so cai] co hieu luc tu ngay do den truoc phan tu ke tiep
 * (phan tu cuoi: den hom nay). Chi them phan tu khi gia/hash doi -> file san pham KHONG doi moi ngay va khong phinh theo thoi gian
 * (truoc day moi ngay 1 diem: 90 diem ~3 KB/SP). Du lieu cu (moi ngay 1 diem) duoc gop tu dong khi cap nhat. */
function packD90(A) { const out = []; for (const x of A || []) { const t = out[out.length - 1]; if (!t || t[1] !== x[1] || t[2] !== x[2]) out.push(x); } return out; }
/* Bung ra gia TUNG NGAY trong cua so 90 ngay tinh den `today` (tu ngay `from` neu co) */
function histDays(A, today, from = 0) {
  const out = []; A = A || []; const start = Math.max(from || 0, today - 89);
  for (let i = 0; i < A.length; i++) {
    const end = i + 1 < A.length ? A[i + 1][0] - 1 : Math.max(today, A[i][0]);
    for (let day = Math.max(A[i][0], start); day <= end; day++) out.push([day, A[i][1], A[i][2]]);
  }
  return out;
}
function histVals(A, today, from = 0) {
  const out = []; A = A || []; const start = Math.max(from || 0, today - 89);
  for (let i = 0; i < A.length; i++) {
    const end = i + 1 < A.length ? A[i + 1][0] - 1 : Math.max(today, A[i][0]);
    for (let day = Math.max(A[i][0], start); day <= end; day++) out.push(A[i][1]);
  }
  return out;
}
function updateD90(d, nowIso) {
  if (!Array.isArray(d.d90) || !d.d90.length) d.d90 = seedD90(d);
  const day = dayOf(nowIso), last = (d.ledger || []).slice(-1)[0];
  const pt = [day, d.kk_price || 0, last ? String(last.hash).slice(0, 16) : 'GENESIS'];
  if (!pt[1]) return d.d90;
  const A = packD90(d.d90), tail = A[A.length - 1];
  if (tail && tail[0] === day) A[A.length - 1] = pt;                         // doan bat dau hom nay: lay gia cuoi ngay
  else if (!tail || tail[1] !== pt[1] || tail[2] !== pt[2]) A.push(pt);      // chi mo doan moi khi gia/hash doi
  while (A.length >= 2 && A[A.length - 1][1] === A[A.length - 2][1] && A[A.length - 1][2] === A[A.length - 2][2]) A.pop();   // doi roi quay lai dung muc cu trong ngay
  while (A.length >= 2 && A[1][0] <= day - 89) A.shift();                    // bo doan da ket thuc truoc cua so 90 ngay
  d.d90 = A; return A;
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
/* MERKLE THEO KHOI - cung cay, cung root voi merkle() nhung KHONG luu proof trong tung file san pham (truoc: ~1,2 KB/SP, doi moi lan chay).
 * Cong bo: merkle/<i>.json = { i, skus[], heads[] } (C la lien tiep theo thu tu SKU) va merkle/top.json = { n, c, first[], nodes[], root }.
 * Tu kiem chung 1 SKU: bam lai C la cua khoi -> nut khoi, doi chieu top.nodes[i]; bam top.nodes -> root; doi chieu root da cong bo. */
const MERKLE_CHUNK = 256;
const pairUp = level => { const next = []; for (let i = 0; i < level.length; i += 2) next.push(sha(level[i] + (level[i + 1] || level[i]))); return next; };
function chunkNode(skus, heads, n, C = MERKLE_CHUNK) {
  let level = skus.map((s, k) => leafHash(s, heads[k]));
  for (let k = 0, LV = Math.log2(C); k < LV && Math.ceil(n / 2 ** k) > 1; k++) level = pairUp(level);
  return level[0];
}
function merkleChunks(leaves, C = MERKLE_CHUNK) {
  const L = leaves.slice().sort((a, b) => a.sku < b.sku ? -1 : 1), n = L.length;
  if (!n) return { root: sha('EMPTY'), n: 0, c: C, chunks: [], nodes: [], first: [] };
  const chunks = [], nodes = [], first = [];
  for (let s = 0; s < n; s += C) {
    const part = L.slice(s, s + C), skus = part.map(x => x.sku), heads = part.map(x => x.head);
    chunks.push({ i: s / C, skus, heads }); nodes.push(chunkNode(skus, heads, n, C)); first.push(skus[0]);
  }
  let level = nodes; while (level.length > 1) level = pairUp(level);
  return { root: level[0], n, c: C, chunks, nodes, first };
}
/* Kiem chung phia may chu/kiem thu: SKU + dau chuoi co nam trong root khong (dung dung du lieu se cong bo) */
function verifyChunk(sku, head, chunk, top) {
  const k = chunk.skus.indexOf(sku); if (k < 0 || chunk.heads[k] !== head) return false;
  if (chunkNode(chunk.skus, chunk.heads, top.n, top.c) !== top.nodes[chunk.i]) return false;
  let level = top.nodes; while (level.length > 1) level = pairUp(level);
  return level[0] === top.root;
}
function verifyProof(sku, head, proof, root) {
  let h = leafHash(sku, head);
  for (const p of proof) h = p[0] === 'L' ? sha(p.slice(2) + h) : sha(h + p.slice(2));
  return h === root;
}

module.exports = { cleanText, sha, fold, isUsed, isAccessory, isCombo, looksMain, FLOOR, FL, median, histRef, filterOffers, evaluate, seedD90, updateD90, packD90, histDays, histVals, dayOf, merkle, merkleChunks, verifyChunk, chunkNode, MERKLE_CHUNK, verifyProof, leafHash };
