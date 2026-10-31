'use strict';
/*
 * BIEU LOI NHUAN THEO BAC GIA (bi mat kinh doanh - cau hinh tu GitHub Secret, KHONG ghi trong ma nguon)
 *   PRICING_TIERS = "nguong1:loi1,nguong2:loi2,...,0:loiN"  (nguong = gia nguon toi thieu, tinh ca nguong)
 *   Bac duoc chon theo GIA NGUON re nhat da qua Bo loc Tin cay. Thieu PRICING_TIERS -> dung PRICING_OFFSET (1 muc).
 */
function parse(env) {
  const raw = String(env.PRICING_TIERS || '').trim();
  let tiers = raw ? raw.split(/[,;\s]+/).filter(Boolean).map(x => x.split(':').map(v => parseInt(v, 10))).filter(t => t.length === 2 && t.every(Number.isFinite)) : [];
  if (!tiers.length) { const off = parseInt(env.PRICING_OFFSET || '', 10); if (Number.isFinite(off)) tiers = [[0, off]]; }
  tiers.sort((a, b) => b[0] - a[0]);
  if (tiers.length && tiers[tiers.length - 1][0] > 0) tiers.push([0, tiers[tiers.length - 1][1]]);
  return tiers;
}
function create(env = process.env) {
  const T = parse(env);
  const ok = T.length > 0;
  const marginFor = cost => { for (const [min, m] of T) if (cost >= min) return m; return T.length ? T[T.length - 1][1] : 0; };
  const sell = cost => cost + marginFor(cost);
  // gia ban -> gia nguon (nghich dao, dung cho so sanh voi lich su niem phong)
  const toCost = s => { for (const [min, m] of T) if (s - m >= min) return s - m; return s - (T.length ? T[T.length - 1][1] : 0); };
  return { ok, tiers: T.length, marginFor, sell, toCost, desc: ok ? T.length + ' bac' : 'chua cau hinh' };
}
module.exports = { create };
