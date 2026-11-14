'use strict';
/*
 * UNG VIEN cho danh ba san gia (collector/hunt-sites.js) - CHUA duoc dung de thu thap.
 * Lenh `node collector/hunt.js probe` chi do KY THUAT tung website (robots.txt co cho phep khong, co sitemap khong, bao nhieu trang trung ma model
 * cua danh muc KK-MALL, trang san pham co du lieu chuan schema.org khong). Website dat ky thuat + da xac minh pham vi giao hang moi duoc chuyen
 * sang hunt-sites.js. Tat ca de reach 'check' (chua xac minh) cho den khi doc chinh sach giao hang cong bo cua website.
 * (c) 2026 Nguyen Duy Dien. All rights reserved.
 */
const M = (name, base, extra = {}) => ({ name, base, mode: 'map', delay: 2500, reach: 'check', ...extra });
module.exports = {
  // dien may - gia dung
  nguyenkim: M('Nguyễn Kim', 'https://www.nguyenkim.com'),
  dienmaycholon: M('Điện Máy Chợ Lớn', 'https://dienmaycholon.com'),
  mediamart: M('MediaMart', 'https://mediamart.vn'),
  pico: M('Pico', 'https://pico.vn'),
  hc: M('HC', 'https://hc.com.vn'),
  thienhoa: M('Thiên Hòa', 'https://dienmaythienhoa.vn'),
  meta: M('META', 'https://meta.vn'),
  hoanghai: M('Điện Máy Hoàng Hải', 'https://dienmayhoanghai.vn'),
  karofi: M('Karofi', 'https://karofi.com'),
  kangaroo: M('Kangaroo', 'https://kangaroo.vn'),
  sunhouse: M('Sunhouse', 'https://sunhouse.com.vn'),
  // dien thoai - thiet bi so
  fptshop: M('FPT Shop', 'https://fptshop.com.vn'),
  viettelstore: M('Viettel Store', 'https://viettelstore.vn'),
  didongviet: M('Di Động Việt', 'https://didongviet.vn'),
  bachlong: M('Bạch Long Mobile', 'https://bachlongmobile.com'),
  h24store: M('24hStore', 'https://24hstore.vn'),
  minhtuan: M('Minh Tuấn Mobile', 'https://minhtuanmobile.com'),
  clickbuy: M('Clickbuy', 'https://clickbuy.com.vn'),
  shopdunk: M('ShopDunk', 'https://shopdunk.com'),
  // may tinh - linh kien
  phongvu: M('Phong Vũ', 'https://phongvu.vn'),
  gearvn: M('GearVN', 'https://gearvn.com'),
  hacom: M('HACOM', 'https://hacom.vn'),
  memoryzone: M('MemoryZone', 'https://memoryzone.com.vn'),
  ngoisao: M('Tin học Ngôi Sao', 'https://tinhocngoisao.com'),
  kimlong: M('Kim Long Center', 'https://kimlongcenter.com'),
  ankhang: M('An Khang', 'https://www.ankhang.vn'),
  tnc: M('TNC Store', 'https://www.tnc.com.vn'),
  nguyencong: M('Nguyễn Công PC', 'https://nguyencongpc.vn'),
  xgear: M('Xgear', 'https://xgear.net'),
  laptopworld: M('Laptop World', 'https://laptopworld.vn'),
  maihoang: M('Mai Hoàng', 'https://maihoang.com.vn'),
  songphuong: M('Song Phương', 'https://songphuong.vn'),
  // dong ho
  haitrieu: M('Hải Triều', 'https://donghohaitrieu.com'),
  dangquang: M('Đăng Quang Watch', 'https://www.dangquangwatch.vn'),
  xwatch: M('Xwatch', 'https://xwatch.vn'),
  watchstore: M('WatchStore', 'https://www.watchstore.vn'),
};
