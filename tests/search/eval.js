// BO DANH GIA TIM KIEM v2 - 110 truy van thuc te, cham diem PHAN CAP (2 = dung y, 1 = lien quan, 0 = sai)
// Chi so: nDCG@10, P@10 (rel>=1), Dung@1 (ket qua dau rel=2), ty le 0 ket qua, do tre. Chia DEV (de chinh) / TEST (chi do cuoi).
const fs = require('fs');
const P = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../site/api/catalog-pack.json'), 'utf8')); const R = P.rows;
const f = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const N = r => f(r[1]), G = r => r[5], B = r => f(r[2]), PR = r => r[6];
const ACC = /^(op|bao da|cap|day|sac |cu sac|mieng dan|dan |kinh cuong luc|cuong luc|day deo|gia do|phu kien|tui|vo bao|nut|de sac|remote|dieu khien|ban phim ipad|but|tay cam|tham|loi loc|binh xit|yen|lop|kinh mat)/;
const acc = r => ACC.test(N(r)) || /danh cho|tuong thich|thay the/.test(N(r));
const used = r => /\b(cu|cu dep|tray xuoc|like new|da qua su dung)\b/.test(N(r));
const WH = r => /may nuoc nong|binh nong lanh|binh nuoc nong/.test(N(r)) && !/giu nhiet/.test(N(r));
const has = (r, re) => re.test(N(r)), grp = (...g) => r => g.includes(G(r));
// q, judge(r) -> 0/1/2
const Q = [
 // ===== nhom 1: ten hang / thuong hieu / model =====
 ['iphone 16', r => /^iphone 16\b/.test(N(r)) ? 2 : /iphone 16/.test(N(r)) && !acc(r) ? 1 : 0],
 ['samsung galaxy a56', r => /galaxy a56/.test(N(r)) && G(r) === 'Điện thoại thông minh' ? 2 : /galaxy a\d\d/.test(N(r)) && G(r) === 'Điện thoại thông minh' ? 1 : 0],
 ['tu lanh inverter', r => G(r) === 'Tủ lạnh' && /inverter/.test(N(r)) ? 2 : G(r) === 'Tủ lạnh' ? 1 : 0],
 ['may giat lg', r => G(r) === 'Máy giặt & Sấy' && /\blg\b/.test(N(r) + ' ' + B(r)) ? 2 : 0],
 ['tivi sony 65 inch', r => G(r) === 'Smart Tivi' && /sony/.test(N(r)) && /\b65\b/.test(N(r)) ? 2 : G(r) === 'Smart Tivi' && /sony/.test(N(r)) && !acc(r) ? 1 : 0],
 ['laptop dell', r => /^(laptop )?dell/.test(N(r)) && /Laptop/.test(G(r)) ? 2 : 0],
 ['loa marshall', r => /marshall/.test(N(r)) && /loa/.test(N(r)) ? 2 : 0],
 ['noi com toshiba', r => G(r) === 'Nồi cơm điện' && /toshiba/.test(N(r)) ? 2 : G(r) === 'Nồi cơm điện' ? 0 : 0],
 ['o cung ssd', r => /\bssd\b/.test(N(r)) && /o cung|ssd/.test(N(r)) && !/laptop|^(dell|asus|lenovo|hp|acer|msi)/.test(N(r)) ? 2 : 0],
 ['router wifi 6', r => /router|bo phat/.test(N(r)) && /wifi 6|ax\d/.test(N(r)) ? 2 : /router/.test(N(r)) ? 1 : 0],
 ['may in canon', r => /^may in/.test(N(r)) && /canon/.test(N(r)) ? 2 : /^may in/.test(N(r)) ? 1 : 0],
 ['ghe cong thai hoc', r => /^ghe/.test(N(r)) && /cong thai hoc|ergonomic/.test(N(r)) ? 2 : /^ghe/.test(N(r)) ? 1 : 0],
 ['bep tu doi', r => /bep tu doi|bep dien tu doi/.test(N(r)) ? 2 : /^bep (dien )?tu/.test(N(r)) ? 1 : 0],
 ['may xay sinh to', r => /may xay sinh to/.test(N(r)) ? 2 : /^may xay/.test(N(r)) ? 1 : 0],
 ['may pha ca phe', r => /may pha ca phe|may pha cafe|espresso/.test(N(r)) && !/^(giay|tui)/.test(N(r)) ? 2 : 0],
 ['binh nong lanh', r => /may nuoc nong|binh nong lanh|binh nuoc nong|may tam nuoc nong/.test(N(r)) && !/giu nhiet/.test(N(r)) ? 2 : 0],
 ['quat dieu hoa', r => /quat dieu hoa|quat hoi nuoc/.test(N(r)) ? 2 : 0],
 ['may hut bui cam tay', r => /hut bui/.test(N(r)) && /cam tay/.test(N(r)) ? 2 : /^may hut bui/.test(N(r)) ? 1 : 0],
 ['noi chien khong dau philips', r => /noi chien/.test(N(r)) && /philips/.test(N(r)) ? 2 : /noi chien/.test(N(r)) ? 1 : 0],
 ['pin du phong 20000mah', r => /(pin|sac) (sac )?du phong/.test(N(r)) && /20000 ?mah/.test(N(r)) ? 2 : /(pin|sac) (sac )?du phong/.test(N(r)) ? 1 : 0],
 ['apple watch', r => /^(dong ho thong minh )?apple watch/.test(N(r)) && !acc(r) ? 2 : 0],
 ['airpods pro', r => /airpods pro/.test(N(r)) && !acc(r) ? 2 : /airpods/.test(N(r)) && !acc(r) ? 1 : 0],
 ['macbook pro', r => /macbook pro/.test(N(r)) && !acc(r) && G(r) === 'MacBook' ? 2 : G(r) === 'MacBook' ? 1 : 0],
 ['ipad air', r => /ipad air/.test(N(r)) && G(r) === 'Máy tính bảng' ? 2 : 0],
 ['ps5', r => /playstation 5|ps5/.test(N(r)) && /may choi game/.test(N(r)) ? 2 : /playstation 5|ps5/.test(N(r)) ? 1 : 0],
 ['loa soundbar', r => /soundbar|loa thanh/.test(N(r)) ? 2 : 0],
 ['mi band', r => /mi band|smart band/.test(N(r)) && !acc(r) ? 2 : 0],
 ['dieu hoa panasonic', r => G(r) === 'Máy lạnh / Điều hòa' && /panasonic/.test(N(r)) && !acc(r) ? 2 : 0],
 ['balo laptop', r => /^(ba lo|balo)/.test(N(r)) && /laptop/.test(N(r)) ? 2 : /^(ba lo|balo)/.test(N(r)) ? 1 : 0],
 ['ban phim co', r => /ban phim co/.test(N(r)) ? 2 : 0],
 ['camera wifi', r => /^camera/.test(N(r)) && /wifi|ip|wi-fi/.test(N(r)) ? 2 : /^camera/.test(N(r)) ? 1 : 0],
 ['muc in', r => /^(hop )?muc in|^muc/.test(N(r)) ? 2 : 0],
 ['lo vi song', r => /^lo vi song/.test(N(r)) ? 2 : 0],
 ['tu dong', r => G(r) === 'Tủ đông & Tủ mát' && /^tu dong/.test(N(r)) ? 2 : 0],
 ['sua rua mat', r => /sua rua mat/.test(N(r)) ? 2 : 0],
 ['vitamin c', r => /vitamin c\b/.test(N(r)) && G(r) === 'Thực phẩm chức năng' ? 2 : /vitamin c\b/.test(N(r)) ? 1 : 0],
 ['may chieu mini', r => /may chieu/.test(N(r)) && /mini/.test(N(r)) ? 2 : /^may chieu/.test(N(r)) ? 1 : 0],
 ['dong ho casio nam', r => /dong ho/.test(N(r)) && /casio/.test(N(r)) && /nam\b/.test(N(r)) ? 2 : /dong ho/.test(N(r)) && /casio|g-shock/.test(N(r)) ? 1 : 0],
 ['tai nghe sony', r => /tai nghe/.test(N(r)) && /sony/.test(N(r)) ? 2 : 0],
 ['may loc khong khi xiaomi', r => /loc khong khi/.test(N(r)) && /xiaomi/.test(N(r) + B(r)) ? 2 : /may loc khong khi/.test(N(r)) ? 1 : 0],
 // ===== nhom 2: kho - lo go, khong dau, viet tat, tieng long, don vi =====
 ['dieu hoa 1.5 ngua', r => G(r) === 'Máy lạnh / Điều hòa' && /\b1\.5 ?hp\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Máy lạnh / Điều hòa' && !acc(r) ? 1 : 0],
 ['may lanh 12000btu', r => G(r) === 'Máy lạnh / Điều hòa' && /12000 ?btu|\b1\.5 ?hp\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Máy lạnh / Điều hòa' && !acc(r) ? 1 : 0],
 ['binh nong lanh 30 lit', r => WH(r) && /\b30 ?(l|lit)\b/.test(N(r)) ? 2 : WH(r) ? 1 : 0],
 ['ban la hoi nuoc', r => /^ban (ui|la)\b/.test(N(r)) ? 2 : 0],
 ['tai phone bluetooth', r => /tai nghe/.test(N(r)) && /bluetooth|khong day/.test(N(r)) ? 2 : /tai nghe/.test(N(r)) ? 1 : 0],
 ['dt oppo', r => /oppo/.test(N(r)) && G(r) === 'Điện thoại thông minh' ? 2 : 0],
 ['lap dell', r => /dell/.test(N(r)) && /Laptop/.test(G(r)) ? 2 : 0],
 ['ip 15 pro max', r => /iphone 15 pro max/.test(N(r)) && !acc(r) ? 2 : /iphone 15/.test(N(r)) && !acc(r) ? 1 : 0],
 ['ss a26', r => /galaxy a26/.test(N(r)) && G(r) === 'Điện thoại thông minh' ? 2 : /samsung/.test(N(r)) && G(r) === 'Điện thoại thông minh' ? 1 : 0],
 ['tl samsung', r => G(r) === 'Tủ lạnh' && /samsung/.test(N(r)) ? 2 : 0],
 ['ti vi 43 inch', r => G(r) === 'Smart Tivi' && /\b43\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Smart Tivi' && !acc(r) ? 1 : 0],
 ['mat kinh', r => /^(mat )?kinh/.test(N(r)) && G(r) === 'Mắt kính & Phụ kiện' ? 2 : G(r) === 'Mắt kính & Phụ kiện' ? 1 : 0],
 ['ba lo', r => /^(ba lo|balo)/.test(N(r)) ? 2 : 0],
 ['giay the thao nam', r => /^giay/.test(N(r)) && /the thao|sneaker|chay bo/.test(N(r)) ? 2 : /^giay/.test(N(r)) && G(r) === 'Giày dép' ? 1 : 0],
 ['laptop ram 16gb', r => /Laptop/.test(G(r)) && /16 ?gb/.test(N(r)) ? 2 : /Laptop/.test(G(r)) ? 1 : 0],
 ['ssd 1tb', r => /\bssd\b/.test(N(r)) && /\b1 ?tb\b/.test(N(r)) && !/^(laptop|dell|asus|lenovo|hp|acer|msi)/.test(N(r)) ? 2 : /\bssd\b/.test(N(r)) ? 1 : 0],
 ['man hinh 165hz', r => G(r) === 'Màn hình máy tính' && /165 ?hz/.test(N(r)) ? 2 : G(r) === 'Màn hình máy tính' ? 1 : 0],
 ['tivi 4k 55 inch', r => G(r) === 'Smart Tivi' && /4k/.test(N(r)) && /\b55\b/.test(N(r)) ? 2 : G(r) === 'Smart Tivi' && /\b55\b/.test(N(r)) ? 1 : 0],
 ['may giat 10kg', r => G(r) === 'Máy giặt & Sấy' && /\b10 ?kg\b/.test(N(r)) ? 2 : G(r) === 'Máy giặt & Sấy' ? 1 : 0],
 ['noi com dien 1.8 lit', r => G(r) === 'Nồi cơm điện' && /1\.8 ?(l|lit)\b/.test(N(r)) ? 2 : G(r) === 'Nồi cơm điện' ? 1 : 0],
 ['loa bluetooth chong nuoc', r => /^loa/.test(N(r)) && /chong nuoc|ip6|ip7|waterproof/.test(N(r)) ? 2 : /^loa/.test(N(r)) && /bluetooth/.test(N(r) + f(G(r))) ? 1 : 0],
 ['tai nghe chong on', r => /tai nghe/.test(N(r)) && /chong on|anc|noise/.test(N(r)) ? 2 : /tai nghe/.test(N(r)) ? 1 : 0],
 ['tủ lạnh sámsung', r => G(r) === 'Tủ lạnh' && /samsung/.test(N(r)) ? 2 : 0],
 ['maý giặt toshiba', r => G(r) === 'Máy giặt & Sấy' && /toshiba/.test(N(r)) ? 2 : 0],
 ['điều hoà daikin inverter', r => G(r) === 'Máy lạnh / Điều hòa' && /daikin/.test(N(r)) && /inverter/.test(N(r)) ? 2 : G(r) === 'Máy lạnh / Điều hòa' && /daikin/.test(N(r)) && !acc(r) ? 1 : 0],
 ['iphone 15 cũ', r => /iphone 15/.test(N(r)) && used(r) ? 2 : /iphone 15/.test(N(r)) && !acc(r) ? 1 : 0],
 ['laptop gamng', r => G(r) === 'Laptop gaming' ? 2 : /Laptop/.test(G(r)) ? 1 : 0],
 ['chuot khong day logitech', r => /chuot/.test(N(r)) && /logitech/.test(N(r)) && /khong day|wireless|bluetooth/.test(N(r)) ? 2 : /chuot/.test(N(r)) && /logitech/.test(N(r)) ? 1 : 0],
 ['sac nhanh 20w', r => /^(cu |cu sac|sac|bo sac|adapter|cu cap)/.test(N(r)) && /20 ?w/.test(N(r)) ? 2 : /sac/.test(N(r)) && /20 ?w/.test(N(r)) ? 1 : 0],
 ['cap type c', r => /^(cap|day cap|cable)/.test(N(r)) && /type.?c/.test(N(r)) ? 2 : 0],
 ['op lung samsung', r => /^op/.test(N(r)) && /samsung|galaxy/.test(N(r)) ? 2 : 0],
 ['bim quan', r => /bim quan|ta quan/.test(N(r)) ? 2 : /bim|^ta /.test(N(r)) ? 1 : 0],
 ['do choi cho be', r => G(r) === 'Đồ chơi & Giáo dục' ? 2 : 0],
 ['ca phe', r => G(r) === 'Đồ uống' && /ca phe|cafe/.test(N(r)) && !/^combo|quan tri/.test(N(r)) ? 2 : /ca phe|cafe/.test(N(r)) && /Đồ uống|Máy xay/.test(G(r)) ? 1 : 0],
 ['nuoc hoa', r => G(r) === 'Nước hoa' || /^nuoc hoa/.test(N(r)) ? 2 : 0],
 ['xe dap dien', r => /xe dap dien/.test(N(r)) && !acc(r) ? 2 : /xe dien|xe dap/.test(N(r)) && !acc(r) ? 1 : 0],
 ['sach ky nang song', r => G(r) === 'Sách' && /ky nang|song|thanh cong|tu duy|hanh phuc|dac nhan tam/.test(N(r)) ? 2 : G(r) === 'Sách' ? 1 : 0],
 ['may tinh casio', r => /casio/.test(N(r)) && /may tinh/.test(N(r)) ? 2 : 0],
 ['tu lanh 2 canh', r => G(r) === 'Tủ lạnh' && /2 canh|hai canh|side by side|ngan da tren|ngan da duoi/.test(N(r)) ? 2 : G(r) === 'Tủ lạnh' ? 1 : 0],
 ['tivi 32 inch', r => G(r) === 'Smart Tivi' && /\b32\b/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Smart Tivi' && !acc(r) ? 1 : 0],
 ['dong ho thong minh tre em', r => /dong ho/.test(N(r)) && /tre em|kid|cho be/.test(N(r)) && !acc(r) ? 2 : G(r) === 'Đồng hồ thông minh' && !acc(r) ? 1 : 0],
 ['am sieu toc', r => /^(am|binh) (dun )?sieu toc|^am dun/.test(N(r)) ? 2 : 0],
 // ===== nhom 3: rang buoc gia =====
 ['laptop duoi 15 trieu', r => /Laptop/.test(G(r)) && G(r) !== 'Bàn phím, Chuột, Tai nghe' && PR(r) <= 15e6 && !acc(r) ? 2 : 0],
 ['dien thoai tu 5 den 8 trieu', r => G(r) === 'Điện thoại thông minh' && PR(r) >= 5e6 && PR(r) <= 8e6 ? 2 : 0],
 ['tivi 55 inch duoi 10tr', r => G(r) === 'Smart Tivi' && /\b55\b/.test(N(r)) && PR(r) <= 10e6 ? 2 : 0],
 ['tai nghe tam 500k', r => /tai nghe/.test(N(r)) && PR(r) >= 3e5 && PR(r) <= 7e5 ? 2 : /tai nghe/.test(N(r)) ? 1 : 0],
 ['may loc nuoc khoang 5 trieu', r => G(r) === 'Máy lọc nước' && /^may loc nuoc/.test(N(r)) && PR(r) >= 3.5e6 && PR(r) <= 6.5e6 ? 2 : G(r) === 'Máy lọc nước' && /^may loc nuoc/.test(N(r)) ? 1 : 0],
 ['dong ho thong minh duoi 2 trieu', r => G(r) === 'Đồng hồ thông minh' && !acc(r) && PR(r) <= 2e6 ? 2 : 0],
 ['tu lanh tren 20 trieu', r => G(r) === 'Tủ lạnh' && PR(r) >= 20e6 ? 2 : 0],
 ['may giat duoi 7 trieu', r => G(r) === 'Máy giặt & Sấy' && /^may giat/.test(N(r)) && PR(r) <= 7e6 ? 2 : 0],
 ['noi chien khong dau re', r => /noi chien/.test(N(r)) ? 2 : 0],
 ['may hut bui khong day duoi 3 trieu', r => /hut bui/.test(N(r)) && /khong day|cam tay|pin/.test(N(r)) && PR(r) <= 3e6 && !acc(r) ? 2 : /hut bui/.test(N(r)) && PR(r) <= 3e6 && !acc(r) ? 1 : 0],
 // ===== nhom 4: tieng Anh / ten cong nghe =====
 ['smartwatch', r => G(r) === 'Đồng hồ thông minh' && !acc(r) ? 2 : 0],
 ['air fryer', r => /noi chien/.test(N(r)) ? 2 : 0],
 ['powerbank', r => /(pin|sac) (sac )?du phong/.test(N(r)) ? 2 : 0],
 ['gaming chair', r => /^ghe/.test(N(r)) && /gaming|choi game|cong thai/.test(N(r)) ? 2 : 0],
 ['mechanical keyboard', r => /ban phim co/.test(N(r)) ? 2 : /ban phim/.test(N(r)) ? 1 : 0],
 ['wifi mesh', r => /mesh/.test(N(r)) ? 2 : /router|wifi/.test(N(r)) ? 1 : 0],
 ['robot vacuum', r => /robot/.test(N(r)) && /hut bui|lau nha/.test(N(r)) ? 2 : 0],
 ['monitor 27 inch', r => G(r) === 'Màn hình máy tính' && /\b27\b/.test(N(r)) ? 2 : G(r) === 'Màn hình máy tính' ? 1 : 0],
 ['hair dryer', r => /may say toc/.test(N(r)) ? 2 : 0],
 ['projector', r => /^may chieu/.test(N(r)) ? 2 : 0],
 // ===== nhom 5: tu khoa mo / nhom hang =====
 ['phu kien iphone', r => /iphone/.test(N(r)) && acc(r) ? 2 : 0],
 ['do gia dung nha bep', r => G(r) === 'Đồ dùng nhà bếp' ? 2 : /Gia dụng/.test(r[4]) ? 1 : 0],
 ['thuc pham chuc nang', r => G(r) === 'Thực phẩm chức năng' ? 2 : 0],
 ['dien thoai samsung', r => G(r) === 'Điện thoại thông minh' && /samsung/.test(N(r)) ? 2 : 0],
 ['may tinh bang', r => G(r) === 'Máy tính bảng' && !acc(r) ? 2 : 0],
 ['loa keo karaoke', r => G(r) === 'Loa kéo & Karaoke' && /^loa/.test(N(r)) ? 2 : G(r) === 'Loa kéo & Karaoke' ? 1 : 0],
 ['den ngu', r => /^den/.test(N(r)) && /ngu/.test(N(r)) ? 2 : /^den/.test(N(r)) ? 1 : 0],
 ['gia treo xe dap', r => /^gia (treo|do|kep)/.test(N(r)) && /xe dap/.test(N(r)) ? 2 : 0],
];
const ix_split = i => (i % 2 === 0 ? 'dev' : 'test');
function evaluate(name, search, which, verbose) {
  const sets = { dev: [], test: [] }; let t = 0;
  Q.forEach(([q, judge], i) => {
    const t0 = Date.now(); const res = search(q).slice(0, 10); t += Date.now() - t0;
    const g = res.map(r => judge(r) || 0);
    const dcg = g.reduce((a, v, k) => a + (Math.pow(2, v) - 1) / Math.log2(k + 2), 0);
    const ideal = R.map(r => judge(r) || 0).sort((a, b) => b - a).slice(0, 10).reduce((a, v, k) => a + (Math.pow(2, v) - 1) / Math.log2(k + 2), 0);
    const m = { q, ndcg: ideal ? dcg / ideal : (res.length ? 0 : 1), p: res.length ? g.filter(v => v > 0).length / res.length : 0, s1: g[0] === 2 ? 1 : 0, zero: res.length ? 0 : 1, top: res.slice(0, 3).map((r, k) => g[k] + ':' + r[1].slice(0, 38)).join(' | '), ideal };
    sets[ix_split(i)].push(m);
  });
  const agg = L => ({ n: L.length, ndcg: L.reduce((a, m) => a + m.ndcg, 0) / L.length, p: L.reduce((a, m) => a + m.p, 0) / L.length, s1: L.reduce((a, m) => a + m.s1, 0) / L.length, zero: L.reduce((a, m) => a + m.zero, 0) });
  const out = {};
  for (const k of (which || ['dev', 'test'])) { const a = agg(sets[k]); out[k] = a; console.log(`${name} [${k}] nDCG@10 ${(a.ndcg * 100).toFixed(1)}% · P@10 ${(a.p * 100).toFixed(1)}% · Đúng@1 ${(a.s1 * 100).toFixed(1)}% · 0 kq ${a.zero}/${a.n}`); }
  console.log(`  độ trễ TB ${(t / Q.length).toFixed(1)} ms/truy vấn`);
  if (verbose) for (const k of (which || ['dev'])) sets[k].filter(m => m.ndcg < 0.75 || !m.s1).sort((a, b) => a.ndcg - b.ndcg).forEach(m => console.log(`   ${(m.ndcg * 100).toFixed(0).padStart(3)}% s1=${m.s1} ${m.q.padEnd(30)} ${m.top}`));
  return out;
}
module.exports = { evaluate, Q, R };
if (require.main === module) {
  const file = require('path').resolve((process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '') || require('path').join(__dirname, '../../site/kk-search.js'));
  delete require.cache[require.resolve(file)]; const K = require(file);
  let t = Date.now(); const ix = K.build(R); console.log('build', Date.now() - t, 'ms');
  const which = process.argv.includes('--test') ? ['dev', 'test'] : ['dev'];
  evaluate('KK-SEARCH ' + K.version, q => K.query(ix, q, { limit: 10 }).ids.map(i => R[i]), which, process.argv.includes('-v'));
}
