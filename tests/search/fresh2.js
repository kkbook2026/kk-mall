// HOLDOUT CUOI (viet mu sau khi da khoa bo may - KHONG chinh theo bo nay): 30 truy van
const { R } = require('./eval.js');
const f = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const N = r => f(r[1]), G = r => r[5], PR = r => r[6];
const ACC = /^(op|bao da|cap|day|sac |cu sac|mieng dan|dan |kinh cuong luc|cuong luc|gia do|phu kien|tui|vo bao|remote|dieu khien|tay cam)|danh cho|tuong thich|thay the/;
const acc = r => ACC.test(N(r));
const Q = [
 ['iphone 17 pro max', r => /iphone 17 pro max/.test(N(r)) && !acc(r) ? 2 : /iphone 17/.test(N(r)) && !acc(r) ? 1 : 0],
 ['máy giặt sấy', r => G(r) === 'Máy giặt & Sấy' && /giat say|giat.*say/.test(N(r)) ? 2 : G(r) === 'Máy giặt & Sấy' ? 1 : 0],
 ['tủ lạnh mini', r => G(r) === 'Tủ lạnh' && /mini/.test(N(r)) ? 2 : G(r) === 'Tủ lạnh' && PR(r) < 5e6 ? 1 : 0],
 ['điều hòa daikin 1hp', r => G(r) === 'Máy lạnh / Điều hòa' && /daikin/.test(N(r)) && /\b1(\.0)? ?hp\b|9000/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Máy lạnh / Điều hòa' && /daikin/.test(N(r)) && !acc(r) ? 1 : 0],
 ['loa jbl', r => /^loa/.test(N(r)) && /jbl/.test(N(r)) ? 2 : 0],
 ['tai nghe sony chống ồn', r => /tai nghe/.test(N(r)) && /sony/.test(N(r)) && /chong on|noise|anc|wh-1000|wf-1000/.test(N(r)) ? 2 : /tai nghe/.test(N(r)) && /sony/.test(N(r)) ? 1 : 0],
 ['laptop lenovo thinkpad', r => /thinkpad/.test(N(r)) && /Laptop/.test(G(r)) ? 2 : /lenovo/.test(N(r)) && /Laptop/.test(G(r)) ? 1 : 0],
 ['màn hình 4k', r => G(r) === 'Màn hình máy tính' && /4k|uhd|3840/.test(N(r)) ? 2 : G(r) === 'Màn hình máy tính' ? 1 : 0],
 ['bàn phím logitech', r => /^ban phim/.test(N(r)) && /logitech/.test(N(r)) ? 2 : /logitech/.test(N(r)) && /ban phim/.test(N(r)) ? 1 : 0],
 ['ổ cứng di động 1tb', r => /o cung/.test(N(r)) && /di dong|portable|external/.test(N(r)) && /1 ?tb/.test(N(r)) ? 2 : /o cung/.test(N(r)) && /1 ?tb/.test(N(r)) ? 1 : 0],
 ['router tp-link', r => /router|bo phat|wifi/.test(N(r)) && /tp.?link/.test(N(r)) && G(r) === 'Thiết bị mạng' ? 2 : G(r) === 'Thiết bị mạng' && /tp.?link/.test(N(r)) ? 1 : 0],
 ['nồi cơm điện cuckoo', r => G(r) === 'Nồi cơm điện' && /cuckoo/.test(N(r)) ? 2 : G(r) === 'Nồi cơm điện' ? 1 : 0],
 ['máy xay sinh tố philips', r => /may xay/.test(N(r)) && /philips/.test(N(r)) ? 2 : /may xay/.test(N(r)) ? 1 : 0],
 ['bếp từ đơn', r => /^bep (dien )?tu/.test(N(r)) && /don\b|1 vung/.test(N(r)) ? 2 : /^bep (dien )?tu/.test(N(r)) ? 1 : 0],
 ['máy lọc không khí sharp', r => /loc khong khi/.test(N(r)) && /sharp/.test(N(r)) ? 2 : /^may loc khong khi/.test(N(r)) ? 1 : 0],
 ['quạt đứng', r => /^quat dung/.test(N(r)) ? 2 : /^quat/.test(N(r)) ? 1 : 0],
 ['smart tivi 65 inch', r => G(r) === 'Smart Tivi' && /\b65\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Smart Tivi' && !acc(r) ? 1 : 0],
 ['đồng hồ casio g-shock', r => /g-?shock/.test(N(r)) && /dong ho/.test(N(r) + f(G(r))) ? 2 : /casio/.test(N(r)) && /dong ho/.test(N(r)) ? 1 : 0],
 ['ví da nam', r => /^vi\b/.test(N(r)) && /nam\b/.test(N(r)) ? 2 : /^vi\b/.test(N(r)) ? 1 : 0],
 ['áo khoác nữ', r => /^ao khoac/.test(N(r)) && /\bnu\b/.test(N(r)) ? 2 : /^ao khoac/.test(N(r)) ? 1 : 0],
 ['sữa rửa mặt cerave', r => /sua rua mat/.test(N(r)) && /cerave/.test(N(r)) ? 2 : /sua rua mat/.test(N(r)) ? 1 : 0],
 ['dầu gội', r => /^dau goi/.test(N(r)) ? 2 : /dau goi/.test(N(r)) ? 1 : 0],
 ['máy đo huyết áp omron', r => /huyet ap/.test(N(r)) && /omron/.test(N(r)) ? 2 : /may do huyet ap/.test(N(r)) ? 1 : 0],
 ['sách đắc nhân tâm', r => G(r) === 'Sách' && /dac nhan tam/.test(N(r)) ? 2 : 0],
 ['bỉm dán', r => /(bim|ta) (dan|so sinh)/.test(N(r)) ? 2 : /^(bim|ta)\b/.test(N(r)) ? 1 : 0],
 ['xe đạp trẻ em 16 inch', r => /^xe dap/.test(N(r)) && /tre em|cho be/.test(N(r)) && /\b16\b/.test(N(r)) ? 2 : /^xe dap/.test(N(r)) && /tre em|cho be/.test(N(r)) ? 1 : 0],
 ['camera hành trình', r => /camera hanh trinh|dashcam/.test(N(r)) ? 2 : /^camera/.test(N(r)) ? 0 : 0],
 ['máy in canon dưới 5 triệu', r => /^may in/.test(N(r)) && /canon/.test(N(r)) && PR(r) <= 5e6 ? 2 : /^may in/.test(N(r)) && PR(r) <= 5e6 ? 1 : 0],
 ['điện thoại dưới 5 triệu', r => G(r) === 'Điện thoại thông minh' && PR(r) <= 5e6 ? 2 : 0],
 ['ghe van phong', r => /^ghe/.test(N(r)) && /van phong|cong thai hoc/.test(N(r)) ? 2 : /^ghe/.test(N(r)) ? 1 : 0],
];
module.exports = { Q };
if (require.main === module) {
  const file = require('path').resolve((process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '') || require('path').join(__dirname, '../../site/kk-search.js')); const K = require(file); const ix = K.build(R);
  let S = 0, P = 0, S1 = 0, Z = 0, n = 0; const bad = [];
  for (const [q, j] of Q) {
    const res = K.query(ix, q, { limit: 10 }).ids.map(i => R[i]); const g = res.map(r => j(r) || 0);
    const dcg = g.reduce((a, v, k) => a + (2 ** v - 1) / Math.log2(k + 2), 0), id = R.map(r => j(r) || 0).sort((a, b) => b - a).slice(0, 10).reduce((a, v, k) => a + (2 ** v - 1) / Math.log2(k + 2), 0);
    const nd = id ? dcg / id : (res.length ? 0 : 1); S += nd; P += res.length ? g.filter(v => v).length / res.length : (id ? 0 : 1); S1 += g[0] === 2 || (!id && !res.length) ? 1 : 0; Z += res.length ? 0 : 1; n++;
    if (nd < 0.7 || g[0] !== 2) bad.push(`   ${(nd * 100).toFixed(0).padStart(3)}% ${q.padEnd(30)} ${res.slice(0, 3).map((r, k) => g[k] + ':' + r[1].slice(0, 34)).join(' | ')}`);
  }
  console.log(`HOLDOUT CUỐI ${K.version}: nDCG@10 ${(S / n * 100).toFixed(1)}% · P@10 ${(P / n * 100).toFixed(1)}% · Đúng@1 ${(S1 / n * 100).toFixed(1)}% · 0 kq ${Z}/${n}`);
  if (process.argv.includes('-v')) console.log(bad.join('\n'));
}
