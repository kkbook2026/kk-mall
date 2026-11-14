'use strict';
/*
 * UNG VIEN cho danh ba san gia (collector/hunt-sites.js) - CHUA duoc dung de thu thap.
 * Lenh `node collector/hunt.js probe` chi do KY THUAT tung website (robots.txt co cho phep khong, co sitemap khong, bao nhieu trang trung ma model
 * cua danh muc KK-MALL, trang san pham co du lieu chuan schema.org khong). Website dat ky thuat + da xac minh pham vi giao hang moi duoc chuyen
 * sang hunt-sites.js. Tat ca de reach 'check' (chua xac minh).
 *
 * KET QUA DO 15/11/2026 tu may chu GitHub (ghi chu sau moi dong): khong website nao duoi day dung duoc luc do. Nguyen tac: may chu tu choi thi DUNG,
 * khong vuot chan. Website ghi zone 'vn' se duoc do lai khi co tram dat tai Viet Nam.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const M = (name, base, extra = {}) => ({ name, base, mode: 'map', delay: 2500, reach: 'check', ...extra });
module.exports = {
  // dien may - gia dung
  nguyenkim: M('Nguyễn Kim', 'https://www.nguyenkim.com', { zone: 'vn' }),          // robots.txt 200 nhung sitemap tra 403
  hc: M('HC', 'https://hc.com.vn'),                                                 // chung chi TLS cua may chu thieu chuoi trung gian -> khong ket noi an toan duoc (khong tat kiem tra chung chi)
  thienhoa: M('Thiên Hòa', 'https://dienmaythienhoa.vn', { zone: 'vn' }),           // het gio ket noi o tang mang
  hoanghai: M('Điện Máy Hoàng Hải', 'https://dienmayhoanghai.vn'),                  // sitemap khong liet ke trang san pham (chi danh muc, bai viet); website chi giao TP.HCM va cac tinh lan can
  kangaroo: M('Kangaroo', 'https://kangaroo.vn'),                                   // sitemap chi co 1 dia chi
  sunhouse: M('Sunhouse', 'https://sunhouse.com.vn'),                               // trang san pham khong cong bo gia trong du lieu chuan
  // dien thoai - thiet bi so
  fptshop: M('FPT Shop', 'https://fptshop.com.vn', { zone: 'vn' }),                 // robots.txt 403
  bachlong: M('Bạch Long Mobile', 'https://bachlongmobile.com'),                    // sitemap chi co 1 dia chi
  shopdunk: M('ShopDunk', 'https://shopdunk.com'),                                  // trang san pham khong co du lieu chuan
  // may tinh - linh kien
  phongvu: M('Phong Vũ', 'https://phongvu.vn', { zone: 'vn' }),                     // robots.txt 403
  kimlong: M('Kim Long Center', 'https://kimlongcenter.com'),                       // robots.txt 503
  ankhang: M('An Khang', 'https://www.ankhang.vn'),                                 // sitemap 403
  nguyencong: M('Nguyễn Công PC', 'https://nguyencongpc.vn'),                       // robots.txt 403
  laptopworld: M('Laptop World', 'https://laptopworld.vn'),                         // trang san pham khong co du lieu chuan
  songphuong: M('Song Phương', 'https://songphuong.vn'),                            // khong doc duoc sitemap
  // dong ho
  haitrieu: M('Hải Triều', 'https://donghohaitrieu.com'),                           // khong cong bo gia trong du lieu chuan; mot so trang 403
  xwatch: M('Xwatch', 'https://xwatch.vn'),                                         // sitemap khong co dia chi san pham
};
