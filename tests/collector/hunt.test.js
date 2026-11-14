'use strict';
/*
 * KIEM THU BO SAN GIA THEO MA MODEL (collector/hunt.js) voi may chu ban le GIA LAP chay trong tien trinh (khong goi ra Internet).
 * Kiem: tuan thu robots.txt + Crawl-delay, tu nhan dien bot, dung khi may chu tu choi, chi tai trang trung ma model, doc gia tu schema.org / the meta,
 * trang da go -> het hang, ten khong khop -> khong dung, khong tai lai khi chua den han, pham vi giao hang, nhat ky khong lo gia / ten san pham.
 * Chay: node tests/collector/hunt.test.js
 */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const HUNT = require('../../collector/hunt');
let pass = 0, fail = 0; const t = (ok, name) => { if (ok) pass++; else { fail++; console.log('  ✘ ' + name); } };

const ld = (name, price, av = 'InStock') => `<html><head><title>${name}</title><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name, sku: 'S' + price, image: 'https://img.test/a.jpg', brand: { '@type': 'Brand', name: 'X' }, offers: { '@type': 'Offer', price, priceCurrency: 'VND', availability: 'https://schema.org/' + av } })}</script></head><body><h1>${name}</h1></body></html>`;
const og = (title, price, av) => `<html><head><meta property="og:type" content="product"><meta property="og:title" content="${title}"><meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="VND">${av ? `<meta property="product:availability" content="${av}">` : ''}<meta property="og:image" content="https://img.test/b.jpg"></head><body></body></html>`;
function serve() {
  const routes = {}, log = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); log.push({ p: u.pathname, ua: req.headers['user-agent'] || '', t: Date.now() });
    const h = routes[u.pathname]; if (h == null) { res.writeHead(404); return res.end('khong co'); }
    const [code, body, hdr] = Array.isArray(h) ? h : [200, h];
    res.writeHead(code, { 'content-type': /<urlset|<sitemapindex/.test(body) ? 'application/xml' : 'text/html; charset=utf-8', ...(hdr || {}) }); res.end(body);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, routes, log, base: 'http://127.0.0.1:' + srv.address().port })));
}

(async () => {
  /* ---------- 1) Ham thuan: robots, khoang cach, chi muc ma, doc trang, so ten ---------- */
  { const R = HUNT.robotsOf('User-agent: Googlebot\nDisallow: /x/\n\nUser-agent: *\nCrawl-delay: 5\nDisallow: /price/\nDisallow: /cart\nAllow: /price/cong-khai\nSitemap: https://a.test/sitemap.xml\nsitemap: https://a.test/sm2.xml\n');
    t(R.delay === 5 && R.sitemaps.length === 2 && R.sitemaps[1] === 'https://a.test/sm2.xml', 'robots: doc Crawl-delay va moi dong Sitemap');
    t(!R.allowed('/price/abc') && R.allowed('/price/cong-khai/1') && !R.allowed('/cart') && R.allowed('/may-loc-nuoc/x') && R.allowed('/x/1'), 'robots: Disallow / Allow theo nhom "*" (nhom cua bot khac khong ap dung)');
    t(HUNT.delayOf({ delay: 2500 }, R, {}) === 5000 && HUNT.delayOf({ delay: 2500 }, R, { HUNT_DELAY_MS: '0' }) === 5000 && HUNT.delayOf({ delay: 2500 }, { delay: 0 }, {}) === 2500 && HUNT.delayOf({}, { delay: 0 }, { HUNT_DELAY_MS: '40' }) === 40,
      'khoang cach yeu cau: khong bao gio thap hon Crawl-delay cua website, ke ca khi dat bien kiem thu'); }
  const CATALOG = [
    { sku: 'KK900001', name: 'Máy lọc nước RO Karofi KAQ-X26 10 lõi', grp: 'Máy lọc nước' },
    { sku: 'KK900002', name: 'Tủ lạnh Samsung Inverter 236 lít RT22M4032BY/SV', grp: 'Tủ lạnh' },
    { sku: 'KK900003', name: 'Nồi cơm nắp gài Sharp 1.8 lít KS-183TJV', grp: 'Nồi cơm điện' },
    { sku: 'KK900004', name: 'Smart Tivi LG 4K 55 inch 55UT8050PSB', grp: 'Smart Tivi' },
    { sku: 'KK900005', name: 'Máy giặt LG Inverter 9 kg FV1409S4W', grp: 'Máy giặt & Sấy' },
    { sku: 'KK900006', name: 'Quạt đứng Toshiba 5 cánh F-LSA20(H)VN 60W', grp: 'Quạt & Máy lọc không khí' },
    { sku: 'KK900007', name: 'Loa Bluetooth JBL Charge 6', grp: 'Loa Bluetooth' },
    { sku: 'KK900008', name: 'Máy lạnh Panasonic Inverter 1 HP CU/CS-PU9AKH-8', grp: 'Máy lạnh / Điều hòa' },
    { sku: 'KK900009', name: 'Ốp lưng Samsung Galaxy S24 Ultra SM-S928B chính hãng', grp: 'Ốp lưng & Phụ kiện' },
    { sku: 'KK900010', name: 'Máy lọc nước RO Karofi KAQ-X26 10 lõi - Hàng cũ đã qua sử dụng', grp: 'Máy lọc nước' },
  ];
  const idx = HUNT.buildIndex(CATALOG);
  const sk = p => [...HUNT.slugSkus(p, idx)].sort().join(',');
  t(sk('/may-loc-nuoc/may-loc-nuoc-ro-karofi-kaq-x26-10-loi') === 'KK900001' && sk('/san-pham/may-loc-nuoc-karofi-kaq-x26.html') === 'KK900001', 'suy nguoc theo ma: slug chua "kaq-x26" -> dung san pham KAQ-X26 (khong lay ban hang cu)');
  t(sk('/dieu-hoa-panasonic-1-chieu-inverter-9000btu-pu9akh-8.html') === 'KK900008' && sk('/may-lanh-panasonic-cu-cs-pu9akh-8') === 'KK900008', 'suy nguoc theo ma: ma co tien to cum/khoi (CU/CS-PU9AKH-8) khop ca cach ghi rut gon PU9AKH-8');
  t(sk('/tu-lanh-samsung-rt22m4032by-sv') === 'KK900002' && sk('/tu-lanh-samsung-rt22m4032by') === 'KK900002', 'suy nguoc theo ma: co / khong co hau to khu vuc (/SV)');
  t(sk('/tin-tuc/danh-gia-tu-lanh-moi') === '' && sk('/p/12345') === '' && sk('/op-lung-samsung-galaxy-s24-ultra-sm-s928b') === '' && sk('/kaq-x26') === '' , 'suy nguoc theo ma: bai viet / dia chi khong co ten / phu kien / slug chi co moi ma -> khong lay');
  t(sk('/xe-dap-abc-kaq-x26-do') === '', 'suy nguoc theo ma: trung ma ngau nhien nhung khong co tu nao cua ten san pham -> bo');
  { const S = { name: 'Shop B', base: 'https://shopb.test' };
    const a = HUNT.parsePage(ld('Máy lọc nước Karofi KAQ-X26', 6100000), S), b = HUNT.parsePage(og('Nồi cơm điện Sharp KS-183TJV 1.8 lít | Shop B', '1.450.000', 'instock'), S), c = HUNT.parsePage(ld('Máy giặt LG FV1409S4W', 1), S), d = HUNT.parsePage('<html><body>Tin tuc</body></html>', S);
    t(a && a.price === 6100000 && a.stock === 1 && a.via === 'jsonld', 'doc trang: schema.org Product (JSON-LD) -> gia + con hang');
    t(b && b.price === 1450000 && b.stock === 1 && b.via === 'meta' && b.name === 'Nồi cơm điện Sharp KS-183TJV 1.8 lít', 'doc trang: du phong the meta product:price:amount, ten da bo duoi ten website');
    t(c && c.contact === 1 && c.price === 0 && d === null, 'doc trang: gia "lien he" (1 d) khong phai gia ; trang khong co du lieu san pham -> null');
    t(HUNT.parsePage(ld('Quạt X', 990000, 'OutOfStock'), S).stock === 0 && HUNT.parsePage(og('Quạt Y 123', '990000', 'out of stock'), S).stock === 0 && HUNT.parsePage(og('Quạt Y 123', '39.99', '').replace('content="VND"', 'content="USD"'), S) === null, 'doc trang: het hang -> stock 0 ; gia ngoai te -> khong dung');
    t(HUNT.cleanTitle('Tủ lạnh Samsung RT22M4032BY/SV - Hàng chính hãng', S) === 'Tủ lạnh Samsung RT22M4032BY/SV' && HUNT.cleanTitle('Laptop Dell Inspiron 15 3520 - i5 1235U/8GB/512GB', S) === 'Laptop Dell Inspiron 15 3520 - i5 1235U/8GB/512GB' && HUNT.cleanTitle('Máy lọc nước Karofi KAQ-X26 - ShopB.test', S) === 'Máy lọc nước Karofi KAQ-X26',
      'lam sach tieu de: bo duoi quang cao / ten website, giu phan cau hinh'); }
  t(HUNT.sameItem('Máy lọc nước RO Karofi KAQ-X26 10 lõi', 'Máy lọc nước RO Karofi KAQ-X26 10 lõi') && HUNT.sameItem('Máy lọc nước RO Karofi KAQ-X26 10 lõi', 'Máy lọc nước Karofi KAQ-X26 (10 lõi lọc)') && HUNT.sameItem('iPad A16 WiFi 128GB', 'Máy tính bảng iPad A16 WiFi 128GB'),
    'cung dia chi trang: ten tren trang khop ten trong datafeed (viet khac di van nhan)');
  t(!HUNT.sameItem('Máy lọc nước RO Karofi KAQ-X26 10 lõi', 'Máy lọc nước RO Karofi KAQ-U95 10 lõi') && !HUNT.sameItem('Quạt đứng Toshiba 5 cánh F-LSA20(H)VN 60W', 'Bếp từ đôi Sunhouse SHD6149') && !HUNT.sameItem('Loa Bluetooth JBL Charge 6', 'Loa Bluetooth JBL Charge 6 - Hàng cũ đã qua sử dụng'),
    'cung dia chi trang: khac ma model / khac mat hang / khac tinh trang -> khong dung');
  t(!HUNT.sameItem('iPad A16 WiFi 128GB', 'Máy tính bảng iPad A16 WiFi 128GB chính hãng VN/A', true) || HUNT.sameItem('Máy lọc nước RO Karofi KAQ-X26 10 lõi', 'Máy lọc nước RO Karofi KAQ-X26 10 lõi', true), 'trang bi chuyen huong: chi nhan khi ten trung hoan toan / trung ma');
  t(HUNT.reachNote('vn', '', true) === '' && HUNT.reachNote('vn-small', '', false) === '' && /cồng kềnh/.test(HUNT.reachNote('vn-small', '', true)) && /TP\.HCM/.test(HUNT.reachNote('region', 'TP.HCM và các tỉnh lân cận', false)) && /chưa xác minh/.test(HUNT.reachNote('check', '', false)) && /chưa xác minh/.test(HUNT.reachNote(undefined, '', false)),
    'pham vi giao hang: chi nguon giao toan quoc moi duoc dung cho gia cong khai');
  t(HUNT.urlKey('https://www.DienMayXanh.com/may-loc-nuoc/abc/?utm=1#x') === 'dienmayxanh.com/may-loc-nuoc/abc' && HUNT.urlKey('khong phai url') === '', 'khoa dia chi trang: bo www, tham so, dau / cuoi');

  /* ---------- 2) Danh ba that: hop le, khong co san thuong mai dien tu ---------- */
  { const REG = require('../../collector/hunt-sites'), CAND = require('../../collector/hunt-candidates'), bad = [];
    for (const [id, S] of Object.entries({ ...CAND, ...REG })) {
      if (!/^[a-z0-9]+$/.test(id) || !S.name || !/^https:\/\/[a-z0-9.-]+$/.test(S.base) || !['feed', 'map'].includes(S.mode) || !['vn', 'vn-small', 'region', 'check'].includes(S.reach) || (S.mode === 'feed' && !S.feed) || (S.reach === 'region' && !S.region) || !(S.delay >= 1500)) bad.push(id);
      if (/shopee|lazada|tiki\.vn|tiktok|sendo/.test(S.base)) bad.push(id + ' (san TMDT)'); }
    t(!bad.length, 'danh ba: moi website co ten, dia chi https, che do, pham vi giao hang, cach nhau >= 1,5s; khong co san TMDT ' + bad.join(', '));
    t(Object.values(CAND).every(S => S.reach === 'check'), 'ung vien: chua xac minh pham vi giao hang thi de "check" (khong dung dinh gia)');
    const M = require('../../collector/match'), T = require('../../collector/trust');
    t(Object.keys(REG).every(id => M.SINGLE_SELLER.has(id)), 'website trong danh ba duoc coi la 1 nguoi ban (moi san pham niem yet 1 lan)'); }

  /* ---------- 3) Dau - cuoi voi may chu gia lap ---------- */
  const A = await serve(), B = await serve(), C = await serve(), D = await serve();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-hunt-')), cacheF = path.join(tmp, 'hunt.json.gz'), catF = path.join(tmp, 'catalog.json');
  fs.writeFileSync(catF, JSON.stringify(CATALOG));
  // --- A: chuoi co datafeed chi gia niem yet (che do 'feed') ---
  const feedRows = [
    ['Máy lọc nước RO Karofi KAQ-X26 10 lõi', 7760000, '/may-loc-nuoc/may-loc-nuoc-ro-karofi-kaq-x26-10-loi'],
    ['Tủ lạnh Samsung Inverter 236 lít RT22M4032BY/SV', 6990000, '/tu-lanh/tu-lanh-samsung-rt22m4032by-sv'],
    ['Nồi cơm nắp gài Sharp 1.8 lít KS-183TJV', 1590000, '/noi-com/noi-com-sharp-ks-183tjv'],
    ['Smart Tivi LG 4K 55 inch 55UT8050PSB', 12900000, '/cam/tivi-lg-55ut8050psb'],
    ['Máy giặt LG Inverter 9 kg FV1409S4W', 8490000, '/may-giat/may-giat-lg-fv1409s4w'],
    ['Quạt đứng Toshiba 5 cánh F-LSA20(H)VN 60W', 1290000, '/quat/quat-dung-toshiba-f-lsa20hvn'],
    ['Loa Bluetooth JBL Charge 6', 4790000, '/loa/loa-bluetooth-jbl-charge-6'],
    ['Đồng hồ Citizen 38 mm Nam BM7334-58E', 9885000, '/dong-ho/citizen-bm7334-58e-nam'],      // 2 mat hang khac ten chung 1 dia chi trong datafeed
    ['Đồng hồ Citizen 39 mm Nam BM7524-87Y', 10685000, '/dong-ho/citizen-bm7334-58e-nam'],
    ['Chuột không dây Silent Rapoo M310 Đen', 245000, '/null'],                                 // dia chi hong trong datafeed
    ['Loa Bluetooth JBL Charge 6', 4790000, '/loa/loa-bluetooth-jbl-charge-6'],                 // ban ghi lap lai y het
  ];
  for (let i = 0; i < 15; i++) feedRows.push([`Bàn ủi hơi nước Philips DST30${i + 10}`, 800000 + i * 1000, `/ban-ui/ban-ui-philips-dst30${i + 10}`]);
  A.routes['/_csv/shopa.csv'] = 'name,price,discount,image,url,category\n' + feedRows.map(r => `"${r[0]}",${r[1]},${r[1]},https://img.test/${encodeURIComponent(r[2])}.jpg,https://shopa.test${r[2]},gia-dung`).join('\n') + '\n';
  A.routes['/robots.txt'] = 'User-agent: *\nDisallow: /cam/\n';
  A.routes['/may-loc-nuoc/may-loc-nuoc-ro-karofi-kaq-x26-10-loi'] = ld('Máy lọc nước RO Karofi KAQ-X26 10 lõi', 6490000);
  A.routes['/noi-com/noi-com-sharp-ks-183tjv'] = ld('Nồi cơm nắp gài Sharp 1.8 lít KS-183TJV', 1);                       // "lien he"
  A.routes['/cam/tivi-lg-55ut8050psb'] = ld('Smart Tivi LG 4K 55 inch 55UT8050PSB', 9990000);                           // robots.txt cam -> khong duoc tai
  A.routes['/may-giat/may-giat-lg-fv1409s4w'] = [302, '', { location: '/danh-muc/may-giat' }];
  A.routes['/danh-muc/may-giat'] = '<html><body>Danh muc may giat</body></html>';
  A.routes['/quat/quat-dung-toshiba-f-lsa20hvn'] = ld('Bếp từ đôi Sunhouse SHD6149', 990000);                            // dia chi bi dung lai cho mat hang khac
  A.routes['/loa/loa-bluetooth-jbl-charge-6'] = ld('Loa Bluetooth JBL Charge 6', 4290000, 'OutOfStock');
  A.routes['/dong-ho/citizen-bm7334-58e-nam'] = ld('Đồng hồ Citizen 38 mm Nam BM7334-58E', 8900000);
  A.routes['/null'] = ld('Trang hong', 100000);
  for (let i = 0; i < 15; i++) A.routes[`/ban-ui/ban-ui-philips-dst30${i + 10}`] = ld(`Bàn ủi hơi nước Philips DST30${i + 10}`, 700000 + i * 1000);
  // --- B: website ban le khac (che do 'map'), chi giao theo vung ---
  B.routes['/robots.txt'] = `User-agent: *\nDisallow: /noi-bo/\nSitemap: ${B.base}/sitemap.xml\n`;
  B.routes['/sitemap.xml'] = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${B.base}/sitemap-products-1.xml</loc></sitemap><sitemap><loc>${B.base}/sitemap-news.xml</loc></sitemap><sitemap><loc>${B.base}/sitemap-danh-muc.xml</loc></sitemap></sitemapindex>`;
  const bUrls = ['/san-pham/may-loc-nuoc-karofi-kaq-x26-10-loi.html', '/san-pham/dieu-hoa-panasonic-1-chieu-inverter-9000btu-pu9akh-8.html', '/san-pham/tu-lanh-abc-xyz999.html', '/noi-bo/may-loc-nuoc-kaq-x26-gia-si.html',
    '/san-pham/noi-com-dien-sharp-ks-183tjv.html', '/san-pham/tivi-lg-55ut8050psb.html', '/san-pham/may-giat-lg-fv1409s4w.html', '/san-pham/may-loc-nuoc-karofi-kaq-x26-10-loi.html?ref=abc'];
  B.routes['/sitemap-products-1.xml'] = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${bUrls.map(u => `<url><loc>${B.base}${u.replace(/&/g, '&amp;')}</loc></url>`).join('')}<url><loc>https://noi-khac.test/san-pham/may-loc-nuoc-karofi-kaq-x26.html</loc></url></urlset>`;
  B.routes['/sitemap-news.xml'] = `<urlset><url><loc>${B.base}/tin-tuc/danh-gia-may-loc-nuoc-karofi-kaq-x26.html</loc></url></urlset>`;
  B.routes['/sitemap-danh-muc.xml'] = `<urlset><url><loc>${B.base}/danh-muc/may-loc-nuoc-karofi-kaq-x26</loc></url></urlset>`;
  B.routes['/san-pham/may-loc-nuoc-karofi-kaq-x26-10-loi.html'] = ld('Máy lọc nước Karofi KAQ-X26 (10 lõi lọc)', 6100000);
  B.routes['/san-pham/dieu-hoa-panasonic-1-chieu-inverter-9000btu-pu9akh-8.html'] = ld('Điều hòa Panasonic 1 chiều Inverter 9000BTU PU9AKH-8', 9350000);
  B.routes['/san-pham/tu-lanh-abc-xyz999.html'] = ld('Tủ lạnh ABC XYZ999', 5000000);
  B.routes['/noi-bo/may-loc-nuoc-kaq-x26-gia-si.html'] = ld('Máy lọc nước Karofi KAQ-X26 giá sỉ', 5000000);
  B.routes['/san-pham/noi-com-dien-sharp-ks-183tjv.html'] = og('Nồi cơm điện Sharp KS-183TJV 1.8 lít | Shop B', '1450000', 'instock');
  B.routes['/san-pham/may-giat-lg-fv1409s4w.html'] = ld('Máy giặt LG Inverter 9 kg FV1409S4W', 1);
  B.routes['/tin-tuc/danh-gia-may-loc-nuoc-karofi-kaq-x26.html'] = ld('Đánh giá Karofi KAQ-X26', 6000000);
  // --- C: may chu tu choi trang san pham (403) ; D: tu choi ca robots.txt ---
  C.routes['/robots.txt'] = `User-agent: *\nSitemap: ${C.base}/sitemap.xml\n`;
  const cUrls = ['/sp/may-loc-nuoc-karofi-kaq-x26', '/sp/tu-lanh-samsung-rt22m4032by-sv', '/sp/noi-com-sharp-ks-183tjv', '/sp/tivi-lg-55ut8050psb', '/sp/may-giat-lg-fv1409s4w'];
  C.routes['/sitemap.xml'] = `<urlset>${cUrls.map(u => `<url><loc>${C.base}${u}</loc></url>`).join('')}</urlset>`;
  for (const u of cUrls) C.routes[u] = [403, 'cam'];
  D.routes['/robots.txt'] = [403, 'cam'];
  D.routes['/sitemap.xml'] = `<urlset><url><loc>${D.base}/sp/may-loc-nuoc-karofi-kaq-x26</loc></url></urlset>`;
  D.routes['/sp/may-loc-nuoc-karofi-kaq-x26'] = ld('Máy lọc nước Karofi KAQ-X26', 1000000);

  const SITES = {
    shopa: { name: 'Shop A', base: A.base, pub: 'https://shopa.test', mode: 'feed', feed: 'shopa', delay: 2500, every: [8, 24, 96], reach: 'vn', trusted: 1 },
    shopb: { name: 'Shop B', base: B.base, mode: 'map', delay: 2500, reach: 'region', region: 'TP.HCM và các tỉnh lân cận' },
    shopc: { name: 'Shop C', base: C.base, mode: 'map', delay: 2500, reach: 'vn' },
    shopd: { name: 'Shop D', base: D.base, mode: 'map', delay: 2500, reach: 'vn' },
  };
  const env = { HUNT_SITES_JSON: JSON.stringify(SITES), HUNT_CACHE_FILE: cacheF, HUNT_CATALOG_FILE: catF, HUNT_DELAY_MS: '40', ACCESSTRADE_CSV_BASE: A.base + '/_csv/' };
  const logs = []; await HUNT.run(0.5, m => logs.push(String(m)), env);
  const pg = S => S.log.filter(x => !/robots\.txt|sitemap|_csv/.test(x.p));
  t([A, B, C, D].every(S => S.log.length && S.log[0].p === '/robots.txt'), 'moi website: doc robots.txt TRUOC moi yeu cau khac');
  t([A, B, C, D].every(S => S.log.every(x => /KK-MALL-PriceBot\/1\.0; \+https:\/\/www\.kk-mall\.com\/bot\.html/.test(x.ua))), 'moi yeu cau deu tu nhan dien KK-MALL-PriceBot kem trang gioi thieu bot');
  t(!A.log.some(x => x.p.startsWith('/cam/')) && !B.log.some(x => x.p.startsWith('/noi-bo/')), 'khong tai trang bi robots.txt cam');
  t(!A.log.some(x => x.p === '/null' || x.p.startsWith('/dong-ho/')), "che do 'feed': dia chi hong (/null) va dia chi dung chung cho nhieu mat hang khac ten -> khong lam tuoi (giu ban ghi goc)");
  t(pg(A).filter(x => x.p !== '/danh-muc/may-giat').length === 21 && new Set(pg(A).map(x => x.p)).size === pg(A).length, "che do 'feed': moi trang trong danh ba duoc phep tai dung 1 lan (21 trang, khong tinh buoc chuyen huong)");
  { const gaps = [], a = pg(A).filter(x => x.p !== '/danh-muc/may-giat'); for (let i = 1; i < a.length; i++) gaps.push(a[i].t - a[i - 1].t);
    t(Math.min(...gaps) >= 35, 'cac yeu cau toi cung 1 website di TUAN TU, cach nhau it nhat bang khoang cach da dat (nho nhat ' + Math.min(...gaps) + ' ms)'); }
  t(!B.log.some(x => /sitemap-news|sitemap-danh-muc|tin-tuc|danh-muc/.test(x.p)), "che do 'map': bo qua sitemap tin tuc / danh muc");
  { const got = pg(B).map(x => x.p).sort().join('|'), want = ['/san-pham/may-loc-nuoc-karofi-kaq-x26-10-loi.html', '/san-pham/dieu-hoa-panasonic-1-chieu-inverter-9000btu-pu9akh-8.html', '/san-pham/noi-com-dien-sharp-ks-183tjv.html', '/san-pham/tivi-lg-55ut8050psb.html', '/san-pham/may-giat-lg-fv1409s4w.html'].sort().join('|');
    t(got === want, "che do 'map': CHI tai nhung trang co ma model trung voi danh muc (khong tai trang khac ma, trang co tham so, ten mien khac) " + got); }
  t(pg(C).length === 3 && pg(D).length === 0 && D.log.length === 1, 'may chu tu choi: 403 ba lan lien tiep thi dung han ; robots.txt bi tu choi thi khong gui them yeu cau nao');
  const st = HUNT.siteStat(env);
  t(/403/.test(st.shopc.fail) && /robots\.txt HTTP 403/.test(st.shopd.fail) && !st.shopa.fail && !st.shopb.fail, 'ghi nhan ly do dung cua tung website cho nhat ky quan tri');
  // --- ket qua che do 'feed' ---
  const L = HUNT.liveRows(env), by = Object.fromEntries(L.rows.map(r => [r.name, r]));
  const kaq = by['Máy lọc nước RO Karofi KAQ-X26 10 lõi'];
  t(kaq && kaq.price === 6490000 && kaq.list === 7760000 && kaq.stock === 1 && kaq.live === 1 && kaq.src === 'shopa' && kaq.url === 'https://shopa.test/may-loc-nuoc/may-loc-nuoc-ro-karofi-kaq-x26-10-loi' && /^https:\/\/img\.test\//.test(kaq.image),
    'gia trang that thay gia niem yet: KAQ-X26 datafeed 7.760.000 -> trang dang ban 6.490.000 (giu ten / anh / dia chi cua datafeed)');
  { const rt = by['Tủ lạnh Samsung Inverter 236 lít RT22M4032BY/SV'], ks = by['Nồi cơm nắp gài Sharp 1.8 lít KS-183TJV'], fv = by['Máy giặt LG Inverter 9 kg FV1409S4W'], jbl = by['Loa Bluetooth JBL Charge 6'];
    t(rt && rt.stock === 0 && rt.gone === 1 && rt.price === 6990000, 'trang da go (404) -> het hang, khong ban san pham khong con mua duoc');
    t(ks && ks.stock === 0 && fv && fv.stock === 0, 'gia "lien he" / chuyen huong ve trang danh muc -> het hang');
    t(jbl && jbl.stock === 0 && jbl.price === 4290000, 'trang bao het hang -> stock 0 (van ghi nhan gia dang niem yet tren trang)'); }
  t(!by['Smart Tivi LG 4K 55 inch 55UT8050PSB'] && !by['Quạt đứng Toshiba 5 cánh F-LSA20(H)VN 60W'], 'trang bi robots.txt cam / ten tren trang khong khop -> KHONG thay ban ghi datafeed (giu nguyen du lieu goc)');
  t(L.rows.length === 20 && L.src.has('shopa') && L.rows.filter(r => /Philips DST30/.test(r.name)).every(r => r.stock === 1 && r.price < r.list), "che do 'feed': du 20 ban ghi (5 + 15 hang ngoai danh muc), deu la gia trang that");
  t(st.shopa.targets === 22 && st.shopa.fresh === 20 && st.shopa.gone === 3 && st.shopa.miss === 1 && st.shopa.dir && st.shopa.dir.p1 === 7 && st.shopa.dir.p3 === 15 && st.shopa.dir.amb === 1, 'thong ke: 22 trang trong danh ba, 20 da doc, 3 ngung ban/lien he, 1 ten khong khop; 7 trang uu tien 1');
  // --- ket qua che do 'map' ---
  const Hh = HUNT.huntRows(env), hb = Hh.filter(r => r.src === 'shopb');
  { const a = hb.find(r => r.sku === 'KK900001'), b = hb.find(r => r.sku === 'KK900008'), c = hb.find(r => r.sku === 'KK900003');
    t(a && a.price === 6100000 && a.stock === 1 && a.reach === 'region' && /TP\.HCM/.test(a.region) && a.url === B.base + '/san-pham/may-loc-nuoc-karofi-kaq-x26-10-loi.html', 'offer san theo ma: KAQ-X26 tai website khac 6.100.000, kem pham vi giao hang cua website');
    t(b && b.price === 9350000 && c && c.price === 1450000 && c.name === 'Nồi cơm điện Sharp KS-183TJV 1.8 lít', 'offer san theo ma: ma rut gon PU9AKH-8 ; trang chi co the meta van doc duoc gia');
    t(hb.length === 3 && !Hh.some(r => r.src === 'shopc' || r.src === 'shopd'), 'offer san theo ma: trang 404 / "lien he" / website tu choi -> khong co offer');
    t(st.shopb.targets === 4 && st.shopb.map && st.shopb.map.files === 2 && st.shopb.map.skip === 2 && st.shopb.map.match === 5, 'thong ke sitemap: doc 2 file, bo 2 file tin tuc/danh muc, 5 trang trung ma (1 trang 404 da go khoi danh sach)'); }
  t(!/6490000|6\.490\.000|6100000|Karofi|KAQ|Philips|Sharp/i.test(logs.join('\n')) && logs.some(l => /^\[shopa\]/.test(l)), 'nhat ky cong khai: chi so lieu tong hop theo website, KHONG co ten san pham / gia tung san pham');
  // --- chay lai ngay: khong trang nao den han ---
  const n0 = [A, B, C, D].map(S => S.log.length); await HUNT.run(0.5, () => { }, env);
  t(A.log.length === n0[0] + 1 && B.log.length === n0[1] + 1 && A.log[A.log.length - 1].p === '/robots.txt', 'chay lai ngay: chi doc lai robots.txt, khong tai lai trang / sitemap / datafeed khi chua den han');
  t(C.log.length - n0[2] === 4 && D.log.length - n0[3] === 1, 'website tung tu choi: lan sau chi thu lai toi da 3 trang roi dung');
  // --- den han theo muc uu tien ---
  { const C0 = HUNT.loadCache(env), now = Date.now(), R = HUNT.robotsOf(A.routes['/robots.txt']);
    for (const k of Object.keys(C0.offers)) if (k.startsWith('shopa|')) C0.offers[k].at = now - 9 * 3600e3;                // 9 gio truoc
    const due = HUNT.dueList('shopa', SITES.shopa, C0.sites.shopa, C0, R, now).map(x => x[0]);
    t(due.length === 2 && due.includes('/may-loc-nuoc/may-loc-nuoc-ro-karofi-kaq-x26-10-loi') && due.includes('/loa/loa-bluetooth-jbl-charge-6'), 'den han: sau 9 gio chi trang uu tien 1 con ban (chu ky 8 gio) phai doc lai; trang ngung ban / uu tien 3 thua hon ' + due.join(','));
    for (const k of Object.keys(C0.offers)) if (k.startsWith('shopa|')) C0.offers[k].at = now - 100 * 3600e3;
    const due2 = HUNT.dueList('shopa', SITES.shopa, C0.sites.shopa, C0, R, now);
    t(due2.length === 21 && !due2.some(x => x[0].startsWith('/cam/')), 'den han: sau 100 gio moi trang duoc phep deu den han; trang bi robots.txt cam khong bao gio vao danh sach');
    HUNT.saveCache(C0, env); const L2 = HUNT.liveRows(env, 168); t(L2.rows.length === 20 && L2.rows.every(r => r.stale === 1), 'du lieu cu hon 48 gio duoc danh dau de cong du phong');
    for (const k of Object.keys(C0.offers)) C0.offers[k].at = now - 200 * 3600e3; HUNT.saveCache(C0, env);
    t(HUNT.liveRows(env, 168).rows.length === 0 && HUNT.huntRows(env, 120).length === 0, 'du lieu qua han (7 ngay / 5 ngay) khong con duoc dung - ban ghi datafeed goc duoc dung lai'); }
  // --- chot an toan: chan mem (may chu tra trang khac cho bot) + ty le "khong con ban" bat thuong ---
  { const E = await serve(), rowsE = []; for (let i = 0; i < 30; i++) rowsE.push([`Nồi chiên không dầu Philips HD92${i + 10}`, 2000000 + i * 1000, `/noi-chien/philips-hd92${i + 10}`]);
    E.routes['/_csv/shope.csv'] = 'name,price,discount,image,url,category\n' + rowsE.map(r => `"${r[0]}",${r[1]},${r[1]},https://img.test/x.jpg,https://shope.test${r[2]},gia-dung`).join('\n') + '\n';
    E.routes['/robots.txt'] = 'User-agent: *\nAllow: /\n';
    for (const r of rowsE) E.routes[r[2]] = '<html><body>Vui long xac minh ban khong phai robot</body></html>';       // trang thu thach: 200 nhung khong co du lieu san pham
    const envE = { HUNT_SITES_JSON: JSON.stringify({ shope: { name: 'Shop E', base: E.base, pub: 'https://shope.test', mode: 'feed', feed: 'shope', delay: 2500, reach: 'vn' } }), HUNT_CACHE_FILE: path.join(tmp, 'e.gz'), HUNT_CATALOG_FILE: catF, HUNT_DELAY_MS: '5', HUNT_ODD_MAX: '6', ACCESSTRADE_CSV_BASE: E.base + '/_csv/' };
    const lg = []; await HUNT.run(0.5, m => lg.push(String(m)), envE);
    const CE = HUNT.loadCache(envE), nE = E.log.filter(x => x.p.startsWith('/noi-chien/')).length;
    t(nE === 6 && /nghi may chu/.test(CE.sites.shope.fail || '') && !Object.keys(CE.offers).length && HUNT.liveRows(envE).rows.length === 0 && lg.some(l => /DUNG: 6 trang lien tiep khong co gia/.test(l)),
      'chan mem: 6 trang lien tiep khong co gia -> dung luot, bo ket qua cua chuoi do (khong danh dau het hang oan), khong tim cach vuot (da tai ' + nE + ' trang)');
    // ty le "khong con ban" bat thuong
    const now = Date.now(), tt = {}, off = {}; for (let i = 0; i < 50; i++) { const p = '/sp/hang-' + i; tt[p] = ['Hàng thử số ' + i + ' ABC-' + (1000 + i), '', 'gia-dung', 1000000, 3]; off['shope|' + p] = i < 20 ? { g: 1, at: now } : { p: 900000, s: 1, at: now }; }
    HUNT.saveCache({ v: 1, sites: { shope: { t: tt, tAt: now } }, offers: off }, envE);
    const L3 = HUNT.liveRows(envE); t(L3.rows.length === 30 && L3.rows.every(r => r.stock === 1) && L3.suspect.join() === 'shope', 'chot an toan: 40% trang "khong con ban" la bat thuong -> khong ap dung trang thai ngung ban, co canh bao');
    for (let i = 5; i < 20; i++) off['shope|/sp/hang-' + i] = { p: 900000, s: 1, at: now }; HUNT.saveCache({ v: 1, sites: { shope: { t: tt, tAt: now } }, offers: off }, envE);
    const L4 = HUNT.liveRows(envE); t(L4.rows.length === 50 && L4.rows.filter(r => !r.stock).length === 5 && !L4.suspect.length, 'ty le binh thuong (10%): trang da go duoc danh dau het hang');
    E.srv.close(); }
  // --- do ky thuat (probe) ---
  { const plog = [], env2 = { ...env, HUNT_CACHE_FILE: path.join(tmp, 'none.gz') }, P = await HUNT.probe(['shopb', 'shopd', 'shopa'], m => plog.push(String(m)), env2);
    t(P.shopb && P.shopb.robots === 200 && P.shopb.map && P.shopb.map.match === 5 && P.shopb.sample && P.shopb.sample.data >= 2 && P.shopd.robots === 403 && !P.shopd.sample && P.shopa.dir && P.shopa.dir.p1 === 7 && P.shopa.sample.price >= 1,
      'do ky thuat: bao cao robots / sitemap / so trang trung ma / mau trang co du lieu; website tu choi thi khong do tiep');
    t(!/6490000|6100000|Karofi|KAQ/i.test(plog.join('\n')), 'do ky thuat: nhat ky khong co ten san pham / gia'); }
  for (const S of [A, B, C, D]) S.srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nBo san gia theo ma model: ${pass}/${pass + fail} dat`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
