/* Kiem thu "Hang that - gia re nhat da kiem chung" (collector/quality.js) */
const Q = require('../../collector/quality.js');
let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.error('FAIL', n); } };
const U = 'https://x.vn/p/1';
const mk = (o) => ({ in_stock: 1, url: U, price: o.landed || 1000000, landed: 1000000, ...o });

// 1. Kenh ban
t('chuoi ban le = A', Q.tierOf({ source: 'thegioididong' }).t === 'A');
t('doi tac co hop dong = A', Q.tierOf({ source: 'dt-abc', pt: 1 }).t === 'A');
t('tiki = B', Q.tierOf({ source: 'tiki' }).t === 'B');
t('gian hang chinh hang tren san = B', Q.tierOf({ source: 'tiktok', shop: 'Samsung Official Store' }, 'Samsung').t === 'B');
t('cua hang mang ten thuong hieu = B', Q.tierOf({ source: 'tiktok', shop: 'Xiaomi Store VN' }, 'Xiaomi').t === 'B');
t('nha ban thuong = C', Q.tierOf({ source: 'tiktok', shop: 'Shop Gia Re 247' }, 'Samsung').t === 'C');
t('ten shop chua thuong hieu nhung khong phai store = C', Q.tierOf({ source: 'tiktok', shop: 'Dien may Samsung gia re' }, 'Samsung').t === 'C');

// 2. Do moi
t('gia trang that = 100', Q.freshOf({ lv: 1 }).s === 100);
t('6 gio = 100', Q.freshOf({ ah: 6 }).s === 100);
t('30 gio = 75', Q.freshOf({ ah: 30 }).s === 75);
t('gia danh dau cu toi da 62', Q.freshOf({ ah: 2, st: 1 }).s === 62);
t('datafeed 22 ngay = 52', Q.freshOf({ source: 'dienmayxanh' }, { dienmayxanh: 22.5 }).s === 52);

// 3. Diem tong hop
const qOf = (o, ctx) => Q.score(mk(o), ctx).q;
t('chuoi ban le, datafeed 22 ngay, khop chinh xac >= 70', qOf({ source: 'dienmayxanh' }, { srcAgeD: { dienmayxanh: 22.5 } }) >= 70);
t('san thuong, gia moi, trung ma 0,92 >= 70', qOf({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 3 }) >= 70);
t('san thuong, gia cu 30 gio danh dau cu < 70', qOf({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 30, st: 1 }) < 70);
t('san thuong, chi ghep theo ten < 70', qOf({ source: 'tiktok', shop: 'abc', fz: 0.75, ah: 3 }) < 70);
t('san thuong ban chay (1.000+) duoc cong diem', qOf({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 3, sd: 1500 }) > qOf({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 3 }));

// 4. Chon gia
const eff = o => o.landed;
{ const chain = mk({ source: 'cellphones', landed: 10000000 }), cheapLow = mk({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 40, st: 1, landed: 9500000 });
  const r = Q.pick([chain, cheapLow], eff, { qmin: 70, srcAgeD: { cellphones: 0.5 } });
  t('re hon nhung do tin cay thap: khong dung', r.best === chain && r.conf === 'ok');
  t('offer tin cay thap vao danh sach cho duyet', r.low.length === 1 && r.low[0] === cheapLow);
  t('cach chon cu se lay offer re hon', r.legacy === cheapLow); }
{ const a = mk({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 40, st: 1, landed: 9500000, ap: 'ok' }), b = mk({ source: 'cellphones', landed: 10000000 });
  const r = Q.pick([a, b], eff, { qmin: 70, srcAgeD: { cellphones: 0.5 } });
  t('quan tri da duyet -> dat chuan', r.best === a && r.low.length === 0); }
{ const noUrl = mk({ source: 'tiki', url: '', landed: 8000000 }), ok = mk({ source: 'tiki', landed: 9000000 });
  const r = Q.pick([noUrl, ok], eff, { qmin: 70, srcAgeD: { tiki: 0.5 } });
  t('khong dat mua online duoc -> khong chon', r.best === ok && r.conf === 'ok'); }
{ const x = mk({ source: 'tiktok', shop: 'abc', fz: 0.75, ah: 50, st: 1, landed: 9000000 });
  const r = Q.pick([x], eff, { qmin: 70 });
  t('khong offer nao dat chuan -> cach chon cu, khong gan nhan', r.best === x && r.conf === 'low' && Q.publicOf(r, { n: 1 }) === null); }
{ const a = mk({ source: 'tiktok', shop: 'abc', fz: 0.92, ah: 3, landed: 9000000 }), b = mk({ source: 'thegioididong', landed: 9000000 });
  const r = Q.pick([a, b], eff, { qmin: 70, srcAgeD: { thegioididong: 1 } });
  t('bang gia -> uu tien diem cao hon', r.best === b); }
{ const r = Q.pick([mk({ source: 'tiki', in_stock: 0 })], eff, { qmin: 70 });
  t('het hang -> khong co gia', r.best === null && r.conf === 'none'); }
{ const a = mk({ source: 'tiktok', shop: 'abc', fz: 0.75, ah: 50, st: 1, landed: 9000000 });
  const r = Q.pick([a], eff, { qmin: 0 });
  t('BEST_Q_MIN = 0 tat cong diem', r.best === a && r.conf === 'ok'); }

// 5. Thong tin cong khai: khong lo nguon
{ const b = mk({ source: 'thegioididong', landed: 9000000 }), r = Q.pick([b], eff, { qmin: 70, srcAgeD: { thegioididong: 1 } }), pv = Q.publicOf(r, { n: 3, lt: 1 });
  t('cong khai: diem lam tron 5', pv && pv.q % 5 === 0);
  t('cong khai: co hang kenh, so nguon, re nhat', pv.t === 'A' && pv.n === 3 && pv.lt === 1);
  t('cong khai: khong chua ten nguon / gia nguon', !/thegioididong|9000000|https/.test(JSON.stringify(pv))); }
t('qmin mac dinh 70', Q.qmin({}) === 70 && Q.qmin({ BEST_Q_MIN: '80' }) === 80);

console.log(`Hang that - gia re nhat da kiem chung: ${pass}/${pass + fail} dat`);
if (fail) process.exit(1);
