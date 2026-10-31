'use strict';
/*
 * GIA THUC TRA (LANDED COST) - so tien DTIC/KK-MALL thuc su phai thanh toan khi dat mua ho tai nguon
 *   landed = gia niem yet tren nguon (datafeed, CHUA gom ship) + phi van chuyen uoc tinh cua nguon + du phong
 * Nguyen tac: KK-MALL ban "da gom giao hang" nen moi dong phi ship/phu phi cua nguon phai duoc cong vao gia von
 * TRUOC khi cong phi dich vu, de phi dich vu (bieu PRICING_TIERS) luon la lai thuc.
 *
 * Luat mac dinh (10/2026, da tra cuu chinh sach cong khai - uoc tinh THAN TRONG, lay muc cao hon trung binh):
 *   - Chuoi ban le (dienmayxanh, thegioididong, fptshop, dienmaycholon, cellphones): giao mien phi toan quoc voi da so
 *     san pham; hang cong kenh (tu lanh, may giat, dieu hoa, tivi lon) co the phat sinh phi lap dat/van chuyen ngoai
 *     ban kinh -> du phong rieng.
 *   - San TMDT (tiki, shopee, lazada, tiktok, sendo): phi ship 15-40k/don, chi mien co dieu kien (Tiki: don >=149k
 *     giam 15k, >=299k giam 30k, Freeship+ toi da 50k; Shopee/Lazada/TikTok: voucher freeship theo dot, khong chac
 *     chan) -> du phong phan phi NGUOI MUA van phai tra sau khi da tru uu dai pho bien nhat.
 *
 * Ghi de bang bien moi truong SHIP_RULES (JSON, GitHub Secret) va TU HIEU CHINH tu so lieu lenh mua thuc
 * (backend ?a=shipstats: chenh lech thuc tra - da thu theo nguon, 90 ngay): neu thuc te cao hon uoc tinh thi nang du phong.
 */
const BULKY_GRP = new Set(['Tủ lạnh', 'Tủ đông & Tủ mát', 'Máy giặt & Sấy', 'Máy lạnh / Điều hòa', 'Smart Tivi', 'Máy nước nóng', 'Máy lọc nước',
  'Nội thất phòng ngủ', 'Nội thất văn phòng', 'Xe đạp & Xe điện', 'Máy tập & Gym', 'Loa kéo & Karaoke', 'Máy chiếu']);
// nhom hon hop: chi cong kenh khi ten cho thay hang lon (may bo, vo case, man hinh lon, may in A3...)
const BULKY_NAME = { 'PC & Linh kiện': /\b(may tinh de ban|may bo|pc |case|vo may|thung may|may tram|workstation|server|may chu|aio|all in one)\b/, 'Màn hình máy tính': /\b(2[7-9]|[3-9]\d) ?(inch|")|\b(2[7-9]|[3-9]\d)\b/, 'Máy in & Mực in': /\b(may in|may photo|a3)\b/ };
const nd = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const isBulky = (grp, name) => BULKY_GRP.has(grp) || !!(BULKY_NAME[grp] && BULKY_NAME[grp].test(nd(name)));
// [nguong gia tu, phi ship nguoi mua con phai tra sau uu dai pho bien] - sap xep giam dan theo nguong; bulky: phi cho hang cong kenh
const DEFAULT_RULES = {
  dienmayxanh: { tiers: [[0, 0]], bulky: 0, note: 'Giao hàng miễn phí toàn quốc' },
  thegioididong: { tiers: [[0, 0]], bulky: 0, note: 'Giao hàng miễn phí toàn quốc' },
  fptshop: { tiers: [[0, 0]], bulky: 0, note: 'Giao hàng miễn phí toàn quốc' },
  dienmaycholon: { tiers: [[0, 0]], bulky: 0, note: 'Giao hàng miễn phí' },
  cellphones: { tiers: [[300000, 0], [0, 20000]], bulky: 0, note: 'Miễn phí từ 300k, dưới 300k dự phòng 20k' },
  tiki: { tiers: [[299000, 10000], [149000, 20000], [0, 30000]], bulky: 60000, note: 'Freeship ≥149k -15k, ≥299k -30k (phí gốc 25-40k)' },
  shopee: { tiers: [[500000, 10000], [100000, 15000], [0, 25000]], bulky: 60000, note: 'Voucher freeship theo đợt, dự phòng phần còn lại' },
  lazada: { tiers: [[500000, 10000], [100000, 15000], [0, 25000]], bulky: 60000, note: 'Freeship Max có điều kiện' },
  tiktok: { tiers: [[300000, 8000], [0, 18000]], bulky: 60000, note: 'Voucher freeship thường xuyên' },
  sendo: { tiers: [[300000, 12000], [0, 25000]], bulky: 60000, note: 'Freeship có điều kiện' },
  // Website ban le (thu thap gia cong khai, 10/2026):
  hoangha: { tiers: [[300000, 0], [0, 15000]], bulky: 30000, note: 'Miễn phí vận chuyển toàn quốc (dự phòng 15k đơn nhỏ, 30k hàng cồng kềnh tỉnh xa)' },
  phucanh: { tiers: [[500000, 25000], [0, 35000]], bulky: 60000, note: 'Miễn phí giao từ 500k nội thành HN; khách tỉnh qua chuyển phát - dự phòng' },
  anphat: { tiers: [[3000000, 30000], [500000, 35000], [0, 40000]], bulky: 80000, note: 'Miễn phí theo bán kính 10-40km quanh HN, ngoài bán kính 6.000đ/km - dự phòng khách tỉnh' },
};
const DEFAULT_SAFETY = 0; // % du phong them tren gia hang (0 = tin luat ship; dat 1-2 khi vao mua cao diem)

function parseEnvRules(env) {
  let o = {}; try { o = JSON.parse(env.SHIP_RULES || '{}'); } catch { o = {}; }
  return o && typeof o === 'object' ? o : {};
}
/* stats: { source: { n, avg, p75 } } - chenh lech (thuc tra - da thu) tren moi lenh mua, tu backend */
function create(env = process.env, stats = null) {
  const over = parseEnvRules(env);
  const rules = {}; for (const k of Object.keys(DEFAULT_RULES)) rules[k] = { ...DEFAULT_RULES[k], ...(over[k] || {}) };
  for (const k of Object.keys(over)) if (!rules[k]) rules[k] = { tiers: [[0, 0]], bulky: 0, ...over[k] };
  const safety = Number.isFinite(+env.SHIP_SAFETY_PCT) ? +env.SHIP_SAFETY_PCT : DEFAULT_SAFETY;
  const calib = {};
  if (stats) for (const [src, s] of Object.entries(stats)) if (s && s.n >= 5 && Number.isFinite(+s.p75)) calib[src] = Math.max(0, Math.round(+s.p75 / 1000) * 1000);
  const shipFor = (src, price, grp, flags) => {
    const r = rules[src] || { tiers: [[0, 25000]], bulky: 60000 };
    if (flags && flags.freeship) return calib[src] ? Math.min(calib[src], 5000) : 0;   // nguon ghi ro Freeship trong ten
    let fee = 0; for (const [min, f] of [...r.tiers].sort((a, b) => b[0] - a[0])) if (price >= min) { fee = f; break; }
    if (grp && isBulky(grp, flags && flags.name)) fee = Math.max(fee, r.bulky || 0);
    if (calib[src] != null) fee = Math.max(fee, calib[src]);                            // thuc te > uoc tinh -> theo thuc te
    if (flags && flags.stale) fee += Math.round(price * 0.01 / 1000) * 1000;            // gia ban le thu thap > 48h: du phong 1%
    return fee + Math.round(price * safety / 100 / 1000) * 1000;
  };
  const landed = (src, price, grp, flags) => price + shipFor(src, price, grp, flags);
  return { rules, safety, calib, shipFor, landed, BULKY_GRP, desc: Object.keys(calib).length ? 'ship mặc định + hiệu chỉnh ' + Object.keys(calib).length + ' nguồn' : 'ship mặc định' };
}
/* Lay thong ke chenh lech thuc tra tu backend (neu cau hinh) - khong bao gio lam hong chu ky thu thap */
async function fetchStats(env = process.env) {
  let url = String(env.KK_BACKEND_URL || '').trim(), key = String(env.BACKEND_STATS_KEY || '').trim();
  if (!url) { try { const m = require('fs').readFileSync(require('path').join(__dirname, '..', 'site', 'config.js'), 'utf8').match(/KK_BACKEND\s*=\s*'([^']+)'/); if (m) url = m[1]; } catch { } }
  if (!key && env.ADMIN_PORTAL_KEY) key = require('crypto').pbkdf2Sync(String(env.ADMIN_PORTAL_KEY).trim(), 'kk-stats-v2', 300000, 32, 'sha256').toString('hex'); // cung cong thuc voi trang quan tri (PBKDF2 - khong lo khoa quan tri)
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || !key) return null;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ a: 'shipstats', key }), signal: ac.signal, redirect: 'follow' }); clearTimeout(t); // khoa trong than POST, khong nam tren URL
    const j = await r.json(); return j && j.sources ? j.sources : null;
  } catch { return null; }
}
/* Thong ke danh gia THAT (nguoi da nhan hang) tu may chu - cong khai, khong co du lieu ca nhan. null neu khong lay duoc */
async function fetchReviewStats(env = process.env) {
  let url = String(env.KK_BACKEND_URL || '').trim();
  if (!url) { try { const m = require('fs').readFileSync(require('path').join(__dirname, '..', 'site', 'config.js'), 'utf8').match(/KK_BACKEND\s*=\s*'([^']+)'/); if (m) url = m[1]; } catch { } }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return null;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ a: 'reviews.stats' }), signal: ac.signal, redirect: 'follow' }); clearTimeout(t);
    const j = await r.json(); return j && j.stats && typeof j.stats === 'object' ? j.stats : null;
  } catch { return null; }
}
module.exports = { create, fetchStats, fetchReviewStats, DEFAULT_RULES, BULKY_GRP, isBulky };
