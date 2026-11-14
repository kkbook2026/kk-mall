'use strict';
/*
 * DANH BA WEBSITE CUA BO SAN GIA THEO MA MODEL (collector/hunt.js) - chi la DU LIEU, khong phu thuoc module nao khac.
 *
 * mode 'feed' : LAM TUOI GIA NGAY TAI TRANG NGUON cua mot datafeed da co. Datafeed cua mot so chuoi chi co gia NIEM YET (khong khuyen mai)
 *               va cu nhieu ngay; trang san pham cong khai cua chinh chuoi do moi la gia dang ban. `feed` = ten file datafeed tinh.
 * mode 'map'  : SUY NGUOC tu ma model cua san pham dang co tren KK-MALL -> tim dung trang san pham trong sitemap cua website
 *               (chi tai nhung trang co ma trung), doc gia dang ban + ton kho tu du lieu chuan schema.org tren trang.
 *
 * reach (pham vi giao hang - quyet dinh offer co duoc dung cho GIA CONG KHAI toan quoc hay khong):
 *   'vn'       giao toan quoc moi mat hang                         -> duoc dung dinh gia
 *   'vn-small' giao toan quoc voi hang nho; hang cong kenh theo vung -> hang cong kenh chi liet ke cho quan tri
 *   'region'   chi giao theo vung (`region` = mo ta dung nhu website cong bo) -> chi liet ke cho quan tri duyet tay
 *   'check'    chua xac minh pham vi giao hang                      -> chi liet ke cho quan tri duyet tay
 *
 * trusted : 1 = chuoi ban le chinh hang quy mo lon (gia re hon han trung vi van duoc coi la gia that khi trung ma hang) ; mac dinh 0.
 * delay   : khoang cach toi thieu giua 2 yeu cau (ms); luon lay muc LON HON giua so nay va Crawl-delay trong robots.txt cua website.
 * every   : [gio] chu ky lam tuoi theo muc uu tien 1-2-3 (mode 'feed') hoac [gio] cho trang da khop ma (mode 'map').
 * ship    : luat du phong phi giao hang cua nguon (cung dang voi collector/landed.js); khong khai -> luat mac dinh cua nguon chua biet (25k, cong kenh 60k).
 * hold    : 1 = nguon moi dua vao danh ba, DANG KIEM DINH do khop ma -> tam thoi chi liet ke cho quan tri (bo co nay sau khi ra soat mau khop).
 *           Dot kiem dinh 15/11/2026 (15.932 trang, ra soat mau cap ten) da xong cho cac nguon giao toan quoc duoi day; 5 lo hong cua bo ghep lo ra
 *           trong dot nay da va (collector/match.js: ma CPU, dung luong TB/GB, hang cu "QSD", hau to mau dinh lien ma, ten hang co chu so).
 * zone    : 'vn' = chi thu thap duoc tu TRAM DAT TAI VIET NAM (may chu chi mo ket noi cho dia chi mang trong nuoc) ; khong khai = may chu GitHub.
 *
 * Pham vi giao hang va phi giao hang duoi day lay tu CHINH SACH GIAO HANG CONG BO tren chinh website do (doc ngay 15/11/2026); website chua doc duoc
 * chinh sach thi de 'check'. Ket qua do ky thuat (robots.txt, sitemap, du lieu schema.org) cung ngay: lenh `node collector/hunt.js probe`.
 *
 * Nguyen tac phap ly: chi doc trang CONG KHAI ma robots.txt cho phep, tu nhan dien KK-MALL-PriceBot, may chu tu choi thi DUNG (khong vuot chan,
 * khong vuot CAPTCHA). Khong dua san thuong mai dien tu vao day (san chi dung API / datafeed chinh thuc).
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
module.exports = {
  /* ===== Che do 'feed': gia dang ban tai chinh trang nguon cua datafeed. Tu may chu GitHub KHONG ket noi duoc (het gio o tang mang) -> can tram Viet Nam ===== */
  dienmayxanh: { name: 'Điện Máy Xanh', color: '#2e7d32', base: 'https://www.dienmayxanh.com', mode: 'feed', feed: 'dienmayxanh.com', zone: 'vn', delay: 2500, every: [8, 24, 96], reach: 'vn', trusted: 1 },
  thegioididong: { name: 'Thế Giới Di Động', color: '#f9a825', base: 'https://www.thegioididong.com', mode: 'feed', feed: 'thegioididong.com', zone: 'vn', delay: 5000, every: [8, 24, 96], reach: 'vn', trusted: 1 },

  /* ===== Che do 'map' - GIAO TOAN QUOC: duoc dung cho gia cong khai ===== */
  hacom: { name: 'HACOM', color: '#c62828', base: 'https://hacom.vn', mode: 'map', delay: 2500, reach: 'vn', trusted: 1,
    ship: { tiers: [[300000, 0], [0, 15000]], bulky: 60000, note: 'Miễn phí giao hàng toàn quốc cho đơn từ 300.000đ; dưới 300.000đ phí 15.000đ' } },
  gearvn: { name: 'GearVN', color: '#e53935', base: 'https://gearvn.com', mode: 'map', delay: 2500, reach: 'vn', trusted: 1,
    ship: { tiers: [[5000000, 0], [0, 40000]], bulky: 60000, note: 'Giao hàng toàn quốc: đơn dưới 5 triệu 40.000đ, từ 5 triệu miễn phí' } },
  memoryzone: { name: 'MemoryZone', color: '#1565c0', base: 'https://memoryzone.com.vn', mode: 'map', delay: 2500, reach: 'vn',
    ship: { tiers: [[300000, 0], [0, 10000]], bulky: 60000, note: 'Giao hàng toàn quốc cho đơn từ 100.000đ; miễn phí từ 300.000đ, dưới mức đó 10.000đ' } },
  ngoisao: { name: 'Tin học Ngôi Sao', color: '#283593', base: 'https://tinhocngoisao.com', mode: 'map', delay: 2500, reach: 'vn', ship: { tiers: [[0, 40000]], bulky: 80000, note: 'Giao nhận trên toàn quốc; phí không ghi rõ - dự phòng 40.000đ, hàng cồng kềnh 80.000đ' } },   // chinh sach giao nhan ap dung cho tat ca tinh thanh tren toan quoc; phi khong ghi ro -> luat du phong mac dinh
  xgear: { name: 'Xgear', color: '#2e7d32', base: 'https://xgear.net', mode: 'map', delay: 2500, reach: 'vn', ship: { tiers: [[0, 40000]], bulky: 80000, note: 'Giao hàng toàn quốc cho đơn từ 100.000đ; phí liên tỉnh không ghi rõ - dự phòng 40.000đ, hàng cồng kềnh 80.000đ' } },                      // giao hang toan quoc cho don tu 100.000d; lien tinh 3-5 ngay; phi lien tinh khong ghi ro -> luat du phong mac dinh
  watchstore: { name: 'WatchStore', color: '#37474f', base: 'https://www.watchstore.vn', mode: 'map', delay: 2500, reach: 'vn',
    ship: { tiers: [[500000, 0], [0, 30000]], bulky: 0, note: 'Miễn phí vận chuyển toàn quốc cho đơn từ 500.000đ; giao COD toàn quốc' } },
  karofi: { name: 'Karofi', color: '#00838f', base: 'https://karofi.com', mode: 'map', delay: 2500, reach: 'vn', trusted: 1 },   // cua hang chinh hang, giao + lap toan quoc (tinh: 2-5 ngay); phi khong cong bo -> luat du phong mac dinh

  /* ===== GIAO TOAN QUOC voi hang nho; hang nang / cong kenh tinh phi rieng theo tung don -> hang cong kenh chi liet ke cho quan tri ===== */
  meta: { name: 'META', color: '#ef6c00', base: 'https://meta.vn', mode: 'map', delay: 2500, reach: 'vn-small', trusted: 1,
    ship: { tiers: [[3000000, 120000], [1000000, 70000], [0, 40000]], bulky: 150000, note: 'Bán và thu tiền tại nhà trên toàn quốc; miễn phí nội thành HN/HCM cho đơn từ 500.000đ; tỉnh xa qua chuyển phát, phí báo theo đơn - dự phòng 40.000đ / 70.000đ / 120.000đ theo giá trị hàng' } },

  /* ===== CHI GIAO THEO VUNG: khong dung cho gia toan quoc, liet ke de quan tri duyet tay ===== */
  dienmaycholon: { name: 'Điện Máy Chợ Lớn', color: '#0066b3', base: 'https://dienmaycholon.com', mode: 'map', delay: 2500, reach: 'region', region: 'trong tỉnh/thành phố có chi nhánh Điện Máy Chợ Lớn', trusted: 1 },
  mediamart: { name: 'MediaMart', color: '#d32f2f', base: 'https://mediamart.vn', mode: 'map', delay: 2500, reach: 'region', region: 'miền Bắc và miền Trung, theo bán kính từ siêu thị MediaMart gần nhất', trusted: 1 },
  pico: { name: 'Pico', color: '#6a1b9a', base: 'https://pico.vn', mode: 'map', delay: 2500, reach: 'region', region: 'miền Bắc, trong bán kính 100 km từ siêu thị Pico gần nhất', trusted: 1 },
  viettelstore: { name: 'Viettel Store', color: '#00897b', base: 'https://viettelstore.vn', mode: 'map', delay: 2500, reach: 'region', region: 'tại tỉnh/thành có siêu thị Viettel Store', trusted: 1 },

  /* ===== CHUA XAC MINH pham vi giao hang (dat ky thuat): chi liet ke de quan tri duyet tay cho den khi doc duoc chinh sach cong bo ===== */
  tnc: { name: 'TNC Store', color: '#455a64', base: 'https://www.tnc.com.vn', mode: 'map', delay: 2500, reach: 'check' },
  maihoang: { name: 'Mai Hoàng', color: '#455a64', base: 'https://maihoang.com.vn', mode: 'map', delay: 2500, reach: 'check' },
  minhtuan: { name: 'Minh Tuấn Mobile', color: '#455a64', base: 'https://minhtuanmobile.com', mode: 'map', delay: 2500, reach: 'check' },
  h24store: { name: '24hStore', color: '#455a64', base: 'https://24hstore.vn', mode: 'map', delay: 2500, reach: 'check' },
  didongviet: { name: 'Di Động Việt', color: '#455a64', base: 'https://didongviet.vn', mode: 'map', delay: 2500, reach: 'check' },
  clickbuy: { name: 'Clickbuy', color: '#455a64', base: 'https://clickbuy.com.vn', mode: 'map', delay: 2500, reach: 'check' },
  dangquang: { name: 'Đăng Quang Watch', color: '#455a64', base: 'https://www.dangquangwatch.vn', mode: 'map', delay: 2500, reach: 'check' },
};
