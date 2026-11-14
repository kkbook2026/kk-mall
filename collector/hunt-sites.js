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
 * ship    : luat du phong phi giao hang cua nguon (cung dang voi collector/landed.js); khong khai -> luat mac dinh cua nguon chua biet.
 *
 * Nguyen tac phap ly: chi doc trang CONG KHAI ma robots.txt cho phep, tu nhan dien KK-MALL-PriceBot, may chu tu choi thi DUNG (khong vuot chan,
 * khong vuot CAPTCHA). Khong dua san thuong mai dien tu vao day (san chi dung API / datafeed chinh thuc).
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
module.exports = {
  dienmayxanh: { name: 'Điện Máy Xanh', color: '#2e7d32', base: 'https://www.dienmayxanh.com', mode: 'feed', feed: 'dienmayxanh.com', delay: 2500, every: [8, 24, 96], reach: 'vn', trusted: 1 },
  thegioididong: { name: 'Thế Giới Di Động', color: '#f9a825', base: 'https://www.thegioididong.com', mode: 'feed', feed: 'thegioididong.com', delay: 5000, every: [8, 24, 96], reach: 'vn', trusted: 1 },
};
