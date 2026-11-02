// HOLDOUT MOI (viet "mu" truoc khi chay - khong dung de chinh): 32 truy van kieu nguoi mua that
const { R } = require('./eval.js');
const f = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const N = r => f(r[1]), G = r => r[5], PR = r => r[6];
const ACC = /^(op|bao da|cap|day|sac |cu sac|mieng dan|dan |kinh cuong luc|cuong luc|gia do|phu kien|tui|vo bao|remote|dieu khien|tay cam)|danh cho|tuong thich|thay the/;
const acc = r => ACC.test(N(r));
const Q = [
 ['iphone 16 pro', r => /iphone 16 pro\b/.test(N(r)) && !acc(r) ? 2 : /iphone 16/.test(N(r)) && !acc(r) ? 1 : 0],
 ['tu lanh lg inverter', r => G(r) === 'Tủ lạnh' && /\blg\b/.test(N(r)) && /inverter/.test(N(r)) ? 2 : G(r) === 'Tủ lạnh' && /\blg\b/.test(N(r)) ? 1 : 0],
 ['may giat cua ngang', r => G(r) === 'Máy giặt & Sấy' && /cua ngang|long ngang/.test(N(r)) ? 2 : G(r) === 'Máy giặt & Sấy' && /^may giat/.test(N(r)) ? 1 : 0],
 ['dieu hoa 1 chieu 9000btu', r => G(r) === 'Máy lạnh / Điều hòa' && !acc(r) && /9000 ?btu|\b1 ?hp\b/.test(N(r)) ? 2 : G(r) === 'Máy lạnh / Điều hòa' && !acc(r) ? 1 : 0],
 ['tivi samsung 55', r => G(r) === 'Smart Tivi' && /samsung/.test(N(r)) && /\b55\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Smart Tivi' && /samsung/.test(N(r)) && !acc(r) ? 1 : 0],
 ['laptop hp', r => /Laptop/.test(G(r)) && /\bhp\b/.test(N(r)) && !acc(r) ? 2 : 0],
 ['laptop gaming msi', r => /Laptop/.test(G(r)) && /msi/.test(N(r)) ? 2 : G(r) === 'Laptop gaming' ? 1 : 0],
 ['tai nghe airpods', r => /airpods/.test(N(r)) && !acc(r) ? 2 : 0],
 ['loa jbl bluetooth', r => /jbl/.test(N(r)) && /^loa/.test(N(r)) ? 2 : /^loa/.test(N(r)) ? 0 : 0],
 ['noi chien khong dau 5 lit', r => /noi chien/.test(N(r)) && /\b5(\.\d)? ?(l|lit)\b/.test(N(r)) ? 2 : /noi chien/.test(N(r)) ? 1 : 0],
 ['may loc nuoc ro', r => /^may loc nuoc/.test(N(r)) && /\bro\b/.test(N(r)) ? 2 : /^may loc nuoc/.test(N(r)) ? 1 : 0],
 ['quat dieu hoa kangaroo', r => /quat (dieu hoa|hoi nuoc)/.test(N(r)) && /kangaroo/.test(N(r)) ? 2 : /quat (dieu hoa|hoi nuoc)/.test(N(r)) ? 1 : 0],
 ['robot hut bui xiaomi', r => /robot/.test(N(r)) && /xiaomi|mijia|roborock|dreame/.test(N(r)) ? 2 : /robot/.test(N(r)) && /hut bui|lau nha/.test(N(r)) ? 1 : 0],
 ['man hinh dell 24 inch', r => G(r) === 'Màn hình máy tính' && /dell/.test(N(r)) && /\b24|23\.8/.test(N(r)) ? 2 : G(r) === 'Màn hình máy tính' && /dell/.test(N(r)) ? 1 : 0],
 ['chuot gaming', r => /^chuot/.test(N(r)) && /gaming|game/.test(N(r)) ? 2 : /^chuot/.test(N(r)) ? 1 : 0],
 ['ban phim khong day', r => /^ban phim/.test(N(r)) && /khong day|bluetooth|wireless/.test(N(r)) ? 2 : /^ban phim/.test(N(r)) ? 1 : 0],
 ['ssd samsung', r => /\bssd\b/.test(N(r)) && /samsung/.test(N(r)) && !/^laptop/.test(N(r)) ? 2 : /\bssd\b/.test(N(r)) && !/^laptop/.test(N(r)) ? 1 : 0],
 ['dong ho nam day da', r => /^dong ho/.test(N(r)) && /nam\b/.test(N(r)) && /day da/.test(N(r)) ? 2 : /^dong ho/.test(N(r)) && /nam\b/.test(N(r)) ? 1 : 0],
 ['kem chong nang la roche posay', r => /chong nang/.test(N(r)) && /roche/.test(N(r)) ? 2 : /chong nang/.test(N(r)) ? 1 : 0],
 ['sua tam', r => /^sua tam/.test(N(r)) ? 2 : /sua tam/.test(N(r)) ? 1 : 0],
 ['nuoc giat', r => /nuoc giat/.test(N(r)) ? 2 : 0],
 ['xe dap the thao', r => /^xe dap/.test(N(r)) && !acc(r) && /the thao|dia hinh|mtb|road|touring/.test(N(r)) ? 2 : /^xe dap/.test(N(r)) && !acc(r) ? 1 : 0],
 ['giay chay bo nu', r => /^giay/.test(N(r)) && /chay bo|running/.test(N(r)) && /\bnu\b/.test(N(r)) ? 2 : /^giay/.test(N(r)) && /chay bo|running|the thao/.test(N(r)) ? 1 : 0],
 ['tui xach nu', r => /^tui/.test(N(r)) && /\bnu\b/.test(N(r)) ? 2 : G(r) === 'Túi xách & Ba lô' && /^tui/.test(N(r)) ? 1 : 0],
 ['sach tieng anh cho be', r => G(r) === 'Sách' && /tieng anh/.test(N(r)) && /be|tre em|thieu nhi/.test(N(r)) ? 2 : G(r) === 'Sách' && /tieng anh/.test(N(r)) ? 1 : 0],
 ['do choi lego', r => /lego/.test(N(r)) ? 2 : /xep hinh|lap rap/.test(N(r)) ? 1 : 0],
 ['may in brother', r => /^may in/.test(N(r)) && /brother/.test(N(r)) ? 2 : /^may in/.test(N(r)) ? 1 : 0],
 ['camera an ninh ngoai troi', r => /^camera/.test(N(r)) && /ngoai troi|outdoor/.test(N(r)) ? 2 : /^camera/.test(N(r)) ? 1 : 0],
 ['bep tu duoi 3 trieu', r => /^bep (dien )?tu/.test(N(r)) && PR(r) <= 3e6 ? 2 : 0],
 ['tai nghe chup tai sony', r => /tai nghe/.test(N(r)) && /chup tai|over.?ear|headphone/.test(N(r)) && /sony/.test(N(r)) ? 2 : /tai nghe/.test(N(r)) && /sony/.test(N(r)) ? 1 : 0],
 ['dien thoai xiaomi', r => G(r) === 'Điện thoại thông minh' && /xiaomi|redmi|poco/.test(N(r)) ? 2 : 0],
 ['sac du phong anker', r => /(pin|sac) (sac )?du phong/.test(N(r)) && /anker/.test(N(r)) ? 2 : /(pin|sac) (sac )?du phong/.test(N(r)) ? 1 : 0],
];
module.exports = { Q };
if (require.main === module) {
  const file = require('path').resolve((process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '') || require('path').join(__dirname, '../../site/kk-search.js')); const K = require(file); const ix = K.build(R);
  let S = 0, P = 0, S1 = 0, Z = 0, n = 0; const bad = [];
  for (const [q, j] of Q) {
    const res = K.query(ix, q, { limit: 10 }).ids.map(i => R[i]); const g = res.map(r => j(r) || 0);
    const dcg = g.reduce((a, v, k) => a + (2 ** v - 1) / Math.log2(k + 2), 0), id = R.map(r => j(r) || 0).sort((a, b) => b - a).slice(0, 10).reduce((a, v, k) => a + (2 ** v - 1) / Math.log2(k + 2), 0);
    const nd = id ? dcg / id : (res.length ? 0 : 1); S += nd; P += res.length ? g.filter(v => v).length / res.length : 0; S1 += g[0] === 2 ? 1 : 0; Z += res.length ? 0 : 1; n++;
    if (nd < 0.7 || g[0] !== 2) bad.push(`   ${(nd * 100).toFixed(0).padStart(3)}% ${q.padEnd(30)} ${res.slice(0, 3).map((r, k) => g[k] + ':' + r[1].slice(0, 34)).join(' | ')}`);
  }
  console.log(`HOLDOUT MỚI ${K.version}: nDCG@10 ${(S / n * 100).toFixed(1)}% · P@10 ${(P / n * 100).toFixed(1)}% · Đúng@1 ${(S1 / n * 100).toFixed(1)}% · 0 kq ${Z}/${n}`);
  if (process.argv.includes('-v')) console.log(bad.join('\n'));
}
