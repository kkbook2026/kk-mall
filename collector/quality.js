'use strict';
/*
 * KK-VERIFIED - "HANG THAT - GIA RE NHAT DA KIEM CHUNG" (24/11/2026)
 *
 * Truoc day bo thu thap chon offer re nhat trong cac offer da qua Bo loc Tin cay (trust.js) - chi xet GIA. Mot offer re hon vai nghin dong
 * tu nha ban thuong tren san, gia doc tu 2 ngay truoc, ghep theo ten, van co the thang offer cua chuoi ban le chinh hang vua kiem tra.
 * Module nay cham DIEM TIN CAY Q (0-100) cho tung offer va chon GIA THAP NHAT trong cac offer DAT CHUAN:
 *
 *   Cong (bat buoc): con hang · co duong dan dat mua online (https) · gia thuc tra > 0
 *   Q = 35% Kenh ban (T) + 25% Trung ma (M) + 20% Do moi cua gia (F) + 20% Uy tin (R)
 *     T  chuoi ban le chinh hang / doi tac co hop dong 100 · gian hang chinh hang tren san 85 · Tiki 82 · Shopee (datafeed) 75 · nha ban thuong tren san 55
 *     M  khop chinh xac / quan tri da duyet 100 · trung day du ma hang (>= 0,92) 95 · trung ma model (>= 0,9) 88 · chi ghep theo ten 55
 *     F  gia trang that vua doc 100 · <= 12h 100 · <= 24h 90 · <= 3 ngay 75 · <= 10 ngay 62 · <= 30 ngay 52 · cu hon 40 (gia danh dau cu: toi da 62)
 *     R  nen theo kenh (85 / 75 / 60) + so luong da ban tai noi ban (>= 10: +5, >= 100: +10, >= 1.000: +15), toi da 100
 *   Dat chuan: Q >= BEST_Q_MIN (mac dinh 70) hoac quan tri da duyet offer do.
 *
 * Chon gia: re nhat (gia ban hieu luc) trong cac offer dat chuan; hoa nhau -> Q cao hon. Offer RE HON nhung chua dat chuan KHONG keo gia xuong ma
 * vao danh sach cho duyet tay. Khong offer nao dat chuan -> giu cach chon cu (re nhat trong offer hop le) va KHONG gan nhan kiem chung.
 * Khong cong bo danh tinh / gia nguon: du lieu cong khai chi co diem, hang kenh (A/B/C), muc do moi, so nguon da so sanh.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const TRUST = require('./trust');

const MARKET = new Set(['tiki', 'shopee', 'tiktok', 'lazada', 'sendo']);
const OFFICIAL_RE = /\b(official|chinh hang|flagship|mall|authori[sz]ed|uy quyen|nha phan phoi)\b/;
const STORE_RE = /\b(store|shop|brand)\b/;
const FLAG = { VQ: 64, LT: 128 };                       // bit trong trust.fl: 64 = gia re nhat da kiem chung, 128 = kiem chung + re nhat moi gia ban le trung ma
const W = { T: 0.35, M: 0.25, F: 0.20, R: 0.20 };

function qmin(env = process.env) { const v = parseFloat(env.BEST_Q_MIN); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70; }

/* Kenh ban: A = chuoi ban le chinh hang / doi tac co hop dong, B = gian hang chinh hang / san bao dam hang chinh hang, C = nha ban thuong */
function tierOf(o, brand) {
  if (o.pt) return { t: 'A', s: 100 };
  if (TRUST.RETAIL_TRUSTED.has(o.source)) return { t: 'A', s: 100 };
  const shop = TRUST.fold(o.shop || ''), b = TRUST.fold(brand || '').trim();
  if (shop && (OFFICIAL_RE.test(shop) || (b.length >= 3 && shop.includes(b) && STORE_RE.test(shop)))) return { t: 'B', s: 85 };
  if (o.source === 'tiki') return { t: 'B', s: 82 };
  if (o.source === 'shopee') return { t: 'B', s: 75 };
  if (MARKET.has(o.source)) return { t: 'C', s: 55 };
  return { t: 'C', s: 50 };
}
const matchOf = (o, twin) => (o.ap === 'ok' || !o.fz) ? 100 : o.fz >= 0.92 ? 95 : (o.fz >= 0.9 || twin) ? 88 : 55;
/* do moi: gio ke tu luc doc gia (o.ah: ket qua tim / san gia; khong co thi tuoi datafeed cua nguon) */
function freshOf(o, srcAgeD) {
  if (o.lv) return { s: 100, b: 1, h: 0 };
  let h = Number.isFinite(o.ah) ? o.ah : (srcAgeD && Number.isFinite(srcAgeD[o.source]) ? srcAgeD[o.source] * 24 : null);
  if (h == null) h = o.st ? 48 : 24;
  let s = h <= 12 ? 100 : h <= 24 ? 90 : h <= 72 ? 75 : h <= 240 ? 62 : h <= 720 ? 52 : 40;
  if (o.st) s = Math.min(s, 62);
  return { s, b: h <= 24 ? 1 : h <= 72 ? 2 : 3, h };
}
function repOf(o, tier) {
  let s = tier.t === 'A' ? 85 : tier.t === 'B' ? 75 : 60; const n = +o.sd || 0;
  s += n >= 1000 ? 15 : n >= 100 ? 10 : n >= 10 ? 5 : 0;
  return Math.min(100, s);
}
const orderable = o => !!(o && o.in_stock && o.landed > 0 && /^https:\/\//.test(o.url || ''));

function score(o, ctx = {}) {
  const tier = tierOf(o, ctx.brand), m = matchOf(o, ctx.twin ? ctx.twin(o) : false), f = freshOf(o, ctx.srcAgeD), r = repOf(o, tier);
  const q = Math.round(W.T * tier.s + W.M * m + W.F * f.s + W.R * r);
  return { q, t: tier.t, m, f: f.s, fb: f.b, r };
}

/*
 * Chon offer: valid = offer da qua Bo loc Tin cay; eff(o) = gia ban hieu luc (cong thuc gia + san doi tac).
 * Tra ve { best, bestQ, conf: 'ok' | 'low' | 'none', low: [offer re hon best nhung chua dat chuan], legacy: offer re nhat theo cach cu }
 */
function pick(valid, eff, ctx = {}) {
  const QMIN = ctx.qmin != null ? ctx.qmin : qmin();
  const live = valid.filter(o => o.in_stock && o.landed > 0);
  const better = (a, b, ea, eb) => ea < eb || (ea === eb && ((a._q ? a._q.q : 0) > (b._q ? b._q.q : 0) || ((a._q ? a._q.q : 0) === (b._q ? b._q.q : 0) && a.landed < b.landed)));
  let legacy = null, le = 0;
  for (const o of live) { const e = eff(o); if (!legacy || e < le || (e === le && o.landed < legacy.landed)) { legacy = o; le = e; } }
  if (!legacy) return { best: null, bestQ: null, conf: 'none', low: [], legacy: null };
  for (const o of live) o._q = orderable(o) ? score(o, ctx) : null;
  const good = live.filter(o => o._q && (QMIN <= 0 || o._q.q >= QMIN || o.ap === 'ok'));
  if (!good.length) return { best: legacy, bestQ: legacy._q, conf: 'low', low: [], legacy };
  let best = null, be = 0;
  for (const o of good) { const e = eff(o); if (!best || better(o, best, e, be)) { best = o; be = e; } }
  const low = live.filter(o => !good.includes(o) && o._q && eff(o) < be);
  return { best, bestQ: best._q, conf: 'ok', low, legacy };
}

/* Thong tin cong khai (khong lo nguon): q lam tron 5 diem, hang kenh, muc do moi, so nguon trung ma da so sanh, re nhat thi truong */
function publicOf(sel, mkt) {
  if (!sel || sel.conf !== 'ok' || !sel.bestQ) return null;
  const x = sel.bestQ;
  return { q: Math.min(100, Math.round(x.q / 5) * 5), t: x.t, f: x.fb, n: Math.min(9, (mkt && mkt.n) || 1), ...(mkt && mkt.lt ? { lt: 1 } : {}) };
}

module.exports = { FLAG, W, qmin, tierOf, matchOf, freshOf, repOf, orderable, score, pick, publicOf };
