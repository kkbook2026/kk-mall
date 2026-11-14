'use strict';
/*
 * KIEM THU BO GHEP CHEO NGUON (collector/match.js) + bo nap feed (do tuoi, phan trang) + tim gia theo tu khoa.
 * Cac cap ten duoi day lay tu du lieu THAT cua dot ra soat 13/11/2026 (ten san pham tren cac nguon khac nhau):
 * moi cap "KHAC" tung bi ghep nham hoac de bi ghep nham -> giu lam hoi quy. Chay: node tests/collector/match.test.js
 */
const http = require('http');
const M = require('../../collector/match');
let pass = 0, fail = 0; const t = (ok, name) => { if (ok) pass++; else { fail++; console.log('  ✘ ' + name); } };

/* ---------- 1) Cap ten: [ten san pham, ten offer, co phai cung san pham?] ---------- */
const PAIRS = [
  // --- "W39"/"W88" la ma model (khong phai Windows) ; do phan giai camera viet khac don vi ---
  ['Loa Bluetooth Alpha Works AW-W88', 'Loa Bluetooth Alpha Works AW-W39', 0],
  ['Camera Wifi Ngoài Trời Ezviz H3C 3MP có màu ban đêm', 'Camera IP Wifi ngoài trời EZVIZ H3C 1080P - Chính hãng', 0],
  ['Camera IP Ngoài Trời 360 Độ 3MP Ezviz H8C Pro', 'Camera IP ngoài trời 360 độ 3MP EZVIZ H8C Pro 2K', 1],
  // --- phu kien: ma trong ten la cua MAY TUONG THICH -> tu hiem lech o bat ky ben nao la phu kien khac ---
  ['Ốp lưng Flipsuit Galaxy Z Flip6 Neon', 'Ốp lưng Samsung Galaxy Z Flip6 trong', 0],
  ['Ốp lưng Samsung Galaxy A35 2024 Samsung Clear', 'Cường lực Samsung A35', 0],
  ['Máy in laser trắng đen đơn năng Brother HL-L2321D', 'Brother TN-2385 Toner Mực Cho Máy In HL-L2321D, HL-2361DN, HL-2366DW, MFC-L2701D, MFC-L2701DW', 0],
  ['Đầu kim máy in Epson LQ-310', 'Băng mực máy in Kim Epson LQ310 - HÀNG CHÍNH HÃNG', 0],
  ['Ốp lưng Samsung Galaxy A26 chính hãng clear', 'Kính cường lực Samsung A26', 0],
  ['Ốp lưng Samsung Galaxy Z Flip8 chính hãng kèm gương With Magsafe', 'Ốp lưng Silicone Magnet kèm vòng Galaxy Z Flip8', 0],
  // --- trung ma model manh (duong S) ---
  ['Máy sấy tóc Philips BHD510/00', 'Máy sấy tóc Philips BHD51000 - Hàng Chính Hãng', 1],
  ['Nồi chiên không dầu Philips 6.2 lít NA130', 'Nồi chiên không dầu Philips NA130/00 6.2L', 1],
  ['Máy lạnh Panasonic Inverter 1 HP CU/CS-PU9AKH-8', 'Điều hòa Panasonic 1 chiều Inverter 9000BTU PU9AKH-8', 1],
  ['Nồi cơm nắp gài Sharp 1.8 lít KS-183TJV-CR', 'Nồi cơm điện nắp gài Sharp KS-183TJV', 1],
  ['Nồi cơm nắp gài Sharp 1.8 lít KS-N191ETV', 'Sharp nồi cơm điện KS-N191ETV SB, 1.8L', 1],
  ['Quạt đứng Toshiba 5 cánh F-LSA20(H)VN 60W', 'Quạt đứng Toshiba F- LSA20HVN 60W - Xám - Hàng chính hãng', 1],
  ['USB Wifi 300Mbps TP-Link TL-WN823N', 'TP-Link TL-WN823N - USB Wifi chuẩn N tốc độ 300Mbps - Hàng Chính Hãng', 1],
  ['Router Wifi Chuẩn Wifi 6 Asus RT-AX52', 'Bộ định tuyến ASUS RT AX52 AX1800 WiFi 6', 1],
  ['Tủ lạnh Sharp Inverter 605 lít Multi Door SJ-FX688VG-BK', 'Sharp Inverter 605 lít Multi Door SJ-FX688VG-BK', 1],
  ['Máy giặt Samsung cửa ngang Bespoke 14kg 2023 (WW14BB944DGHSV)', 'Samsung Inverter 14 kg WW14BB944DGHSV', 1],
  ['Màn hình Gaming GIGABYTE GS27QA 27 inch 2K/IPS/180Hz/1ms', 'Màn hình Gaming GIGABYTE GS27QA (27 inch - IPS - 2K - 180Hz - 1ms)', 1],
  ['Màn hình Gaming Samsung Odyssey G5 G55C LS27CG552EEXXV 27 inch 2K/VA/165Hz/1ms/HDMI/DisplayPort', 'Màn Hình Gaming SAMSUNG Odyssey G5 G55C LS27CG552EEXXV (27.0 inch - 2K - VA - 165Hz - 1ms - FreeSync - HDR10 - Curved)', 1],
  ['Màn hình cong Dell UltraSharp U3824DW 38 inch', 'Màn Hình Dell UltraSharp U3824DW (37.52 inch - WQHD+ - IPS - 60Hz - 5ms - USB TypeC)', 1],
  ['Máy in phun màu đơn năng HP Smart Tank 210 Wifi (3D4L3A)', 'Máy in phun màu HP Smart Tank 210 (3D4L3A) (A4| A5| USB | WIFI)', 1],
  ['Máy in phun màu đa năng HP Smart Tank 520 (1F3W2A)', 'Máy in phun màu đa năng HP 520 1F3W2A (A4 | In | Scan | Copy | USB)', 1],
  ['Máy lọc không khí LG PuriCare 360 Alpha Double AS10GDBY0.ABAE 72W', 'Máy lọc không khí PuriCare360 Alpha PET 2 tầng AS10GDBY0.ABAE 72W', 1],
  ['VGA Asus Prime Geforce RTX 5060 Ti 8GB PRIME-RTX5060TI-8G', 'VGA ASUS PRIME RTX 5060 Ti 8GB GDDR7 (PRIME-RTX5060TI-8G) giá sốc', 1],
  ['Máy in laser trắng đen đơn năng HP LaserJet M211dw Wifi (9YF83A)', 'Máy in HP LaserJet M211dw (9YF83A)', 1],
  // khac model / khac cau hinh / khac mau
  ['Tủ lạnh Samsung Inverter 236 lít RT22M4032BU/SV', 'Tủ lạnh Samsung 256 lít RT25M4032BU', 0],
  ['Tủ lạnh Samsung Inverter 488 lít Multi Door RF48A4000B4/SV', 'Tủ lạnh Samsung Multidoor 488 lít 2021 (RF48A4010M9/SV)', 0],
  ['Tủ lạnh Hitachi Inverter 366 lít R-FVX480PGV9 GBK', 'Hitachi Inverter 366 lít R-FVX480PGV9 MIR', 0],
  ['Tủ lạnh Hitachi Inverter 390 lít R-FVY510PGV0 GMG', 'Tủ lạnh Hitachi 390L 2020 (R-FVY510PGV0 GBK)', 0],
  ['Quạt đứng Toshiba 9 cánh F-LSD10(W)VN 30W', 'Toshiba quạt cây F-LSD10(H)VN, 9 cánh, DC Inverter, 30W', 0],
  ['Tủ đông Sanaky Inverter 150 lít TD.VH180VD3', 'Tủ đông Sanaky 150 lít TD.VH180VD', 0],
  ['Đồng hồ MOVADO 22 x 18 mm Nữ 0606473', 'Đồng hồ MOVADO 22 x 18 mm Nữ 0606472', 0],
  ['Đồng hồ CERTINA Aqua 33.8 mm Nữ C032.051.22.036.00', 'Đồng hồ CERTINA Aqua 33.8 mm Nữ C032.051.11.036.00', 0],
  ['Mainboard Gigabyte B760M Aorus Elite GEN5 DDR5', 'Mainboard MSI B760M Gaming WIFI DDR5', 0],
  ['Mainboard Asus PRIME B760M-A WIFI DDR4', 'Mainboard Asus Prime B760M-A DDR4', 0],
  ['Mainboard Asus B760M-AYW WIFI DDR4 Giá Sốc', 'Mainboard Asus B760M-AYW WIFI DDR5 GIÁ SỐC', 0],
  ['Laptop HP Elitebook 630 G11 A7LM7PT (Intel Core Ultra 5-125U | 16GB | 512GB | 13.3 inch WUXGA | Cảm ứng | Win 11 | Bạc)', 'Laptop HP Elitebook 630 G11 A7LL8PT (Intel Core Ultra 5-125U | 16GB | 512GB | 13.3 inch WUXGA | Win 11 | Bạc | Vỏ nhôm)', 0],
  ['Máy tính để bàn đồng bộ Dell Tower ECT1250 TFPC812 (Intel Core i5-14400 | 16GB | 512GB SSD)', 'Máy tính để bàn đồng bộ Dell Tower ECT1250 TFPC81 (Intel Core i5-14400 | 8GB | 512GB SSD)', 0],
  ['USB Wifi 6 AX1800 Tp-link Archer TX20U', 'USB Wifi Chuẩn Wifi 6 TP-Link Archer TX20U Nano', 0],
  ['Máy in laser Canon LBP122dw II (In đảo mặt| A4| A5| USB| LAN| WIFI)', 'Máy in laser đen trắng Canon LBP122DW (In đảo mặt | A4 | A5 | USB | LAN | WIFI)', 0],
  // lien ket SAI cua luat "ma model duy nhat" cu (da gay sai gia that)
  ['Laptop ASUS TUF Gaming A15 FA506NCG-HN329W (AMD Ryzen 7 8845HS | RTX 3050 4GB | 15.6 inch FHD 144Hz | 16GB | 512GB | Win 11 | Đen)', 'Laptop Lenovo LOQ 15APH9 83DX0085VN(AMD Ryzen 7 8845HS |RTX 4060 | 16GB | 512GB | 15.6 inch FHD 144Hz | Win 11 | Xám)', 0],
  ['Ổ cứng Western Digital Caviar Blue 2TB 64MB Cache 5400rpm ( WD20EARZ)', 'Ổ cứng Seagate Ironwolf 6TB NAS SATA 3 5400rpm 256MB cache ST6000VN006', 0],
  ['CPU Intel Core Ultra 9 285K (Intel LGA1851 - 24 Core - 24 Thread - Base 3.2Ghz - Turbo 5.7Ghz - Cache 36MB)', 'CPU Intel Core Ultra 7 265 (Intel LGA1851 - 20 Core - 20 Thread - Base 1.8Ghz - Turbo 5.3Ghz - Cache 30MB)', 0],
  ['Máy in laser đen trắng đa năng Canon MF269dw II (In đảo mặt| Copy| Scan| Fax| ADF A4| A5| USB| LAN| WIFI)', 'Hộp mực in Canon 051 (1700 trang) dùng cho máy LBP160 series, MF260 series (LBP161dn, LBP161DN+, MF269DW, MF266DN, MF264dw)', 0],
  // --- ma yeu + thuong hieu (duong W1) ---
  ['Router Wifi Chuẩn AC1200 TP-Link Archer C64 Gigabit', 'Router Wifi băng tầng kép AC1200 TP-Link Archer C64 - Chính hãng', 1],
  ['Router Wifi Chuẩn AC1200 TP-Link Archer C64 Gigabit', 'Bộ Phát Wifi TP-Link Archer C64 Băng Tần Kép Chuẩn AC1200 - Hàng Chính Hãng', 1],
  ['Router Wifi Chuẩn AC1200 TP-Link Archer C64 Gigabit', 'Router TP-Link Archer C6 AC1200', 0],
  ['Chuột Không dây Gaming Logitech G304', 'Chuột game không dây Logitech G304 Đen (USB)', 1],
  ['Chuột Không dây Gaming Logitech G304', 'Chuột Logitech G304 X LightSpeed White', 0],
  ['Chuột Không dây Gaming Logitech G304', 'Chuột không dây G304, chuột chơi game, nhiều màu sắc', 0],        // hang nhai/OEM khong ghi hang
  ['Chuột không dây Logitech MX Master 3S', 'Chuột không dây Logitech MX Anywhere 3S Wireless Bluetooth - Hàng chính hãng - Màu Đen', 0],
  ['Bàn Phím Có Dây Gaming Corsair K55 CORE RGB', 'Bàn phím gaming có dây Corsair K55 Core TKL RGB', 0],
  ['Robot hút bụi lau nhà Ecovacs Deebot T10', 'Robot hút bụi Ecovacs Deebot T10 Omni - Chính Hãng', 0],
  ['Đồng hồ thông minh Xiaomi Watch S4 41mm - Trắng dây Da', 'Đồng hồ thông minh Xiaomi Watch S4 41mm', 0],
  ['Bàn phím Rapoo V500 Pro Pink White Blue switch', 'Bàn phím cơ Gaming Rapoo V500 Pro (Trắng Xanh/Blue Switch)', 0],
  ['Sạc nhanh Baseus GaN6 Pro 2C + 2U 100W US kèm cáp C-C 100W 1m', 'Sạc nhanh Baseus GaN6 Pro 2C + 2U 100W EU kèm cáp C-C 100W 1m', 0],
  ['Bao da bàn phím Samsung Tab S11', 'Bao da Samsung Galaxy Tab S11 chính hãng', 0],
  ['Samsung Galaxy A18 6GB/128GB', 'Samsung Galaxy A18 6GB 128GB - Đã kích hoạt', 0],
  ['Sony MDR-EX15AP', 'Tai nghe Sony MDR-EX15AP Cũ -Đen', 0],
  ['Tai nghe Có dây Xiaomi Basic', 'Tai nghe không dây Xiaomi Basic', 0],
  // --- khong co ma (duong W2) ---
  ['Sách Nhà Giả Kim', 'Sách Nhà Giả Kim Tái Bản', 1],
  ['Sách Để Con Được Ốm Tái Bản 2018', 'Sách Để Con Được Ốm', 1],
  ['iPad A16 WiFi 128GB', 'iPad A16 Wifi 128GB 2025 | Chính hãng Apple Việt Nam', 1],
  ['iPad A16 WiFi 128GB', 'iPad A16 5G 128GB', 0],
  ['iPad A16 WiFi 128GB', 'iPad A16 Wifi 128GB 2025 - Cũ Đẹp', 0],
  ['iPhone 15 128GB', 'Apple iPhone 15 Plus 128GB Chính hãng VN/A', 0],
  ['iPhone 15 128GB', 'iPhone 15 256GB', 0],
  ['Sách Taking The TOEIC - Skills and Strategies 2 tặng 1MP3', 'Sách Taking The TOEIC - Skills and Strategies 1 tặng 1MP3', 0],
  ['Sách Người Mẹ Tốt Hơn Là Người Thầy Tốt Tái Bản 2015', 'Sách Người Mẹ Tốt Hơn Là Người Thầy Tốt - Tập 2', 0],
  ['Sách Luyện Thi Năng Lực Nhật Ngữ N1 - Ngữ Pháp', 'Sách Luyện Thi Năng Lực Nhật Ngữ N1 - Đọc Hiểu', 0],
  ['Sách Học Ngữ Pháp Tiếng Trung Bằng Hình Trình Độ Nâng Cao', 'Sách Học Ngữ Pháp Tiếng Trung Bằng Hình Trình Độ Cơ Bản', 0],
  ['Túi bọc bảo vệ vali -Áo vỏ bọc vali - Mũi Tên - Size L', 'Túi bọc bảo vệ vali -Áo vỏ bọc vali - Mũi Tên - Size S', 0],
  ['TÚI CHỐNG SỐC, CẶP ĐỰNG MACBOOK, LAPTOP, SURFACE - TẶNG KÈM VÍ ĐỰNG SẠC CHUỘT - GHI SÁNG - 13 INCH', 'TÚI CHỐNG SỐC, CẶP ĐỰNG MACBOOK, LAPTOP, SURFACE - TẶNG KÈM VÍ ĐỰNG SẠC CHUỘT - XÁM - 13 INCH', 1],   // ghi sang = xam
  ['BAO DA, TÚI DA CHỐNG SỐC CHO MACBOOK - Xanh Ngọc - 13.3 inch', 'BAO DA, TÚI DA CHỐNG SỐC CHO MACBOOK - Hồng - 13.3 inch', 0],
  ['Ba lô da nam công suất lớn phong cách châu âu', 'Ba lô da bò nam công suất lớn phong cách châu âu', 0],
  ['Quạt đứng Senko 3 cánh', 'Quạt bàn Senko 3 cánh', 0],
  ['Bếp từ đôi Sunhouse', 'Bếp đôi Sunhouse', 0],
  ['Combo 2 hộp sữa Vinamilk 180ml', 'Sữa tươi Vinamilk 180ml', 0],
  ['Viên uống Vitamin C 100 viên', 'Viên uống Vitamin C 60 viên', 0],
  ['Kính Bơi Cho Trẻ Em View V730J - Xanh Lá', 'Kính Bơi VIEW V730J Cho Trẻ Em Từ 4-9 Tuổi - Xanh dương nhạt', 0],
];
{ // chi muc gom toan bo ten san pham; offer la ngu lieu. Ngu lieu nho -> hau het tu deu "hiem" (che do khat khe nhat)
  const idx = M.createIndex(); PAIRS.forEach((p, i) => idx.add('P' + i, p[0], 'G')); PAIRS.forEach(p => idx.addCorpus(p[1], 'G'));
  PAIRS.forEach(([a, b, want], i) => { const hit = idx.find(b, 'G', 0.6).some(m => m.id === 'P' + i); t(hit === !!want, `${want ? 'PHAI ghep' : 'KHONG duoc ghep'}: "${a}" <> "${b}"`); });
  // doi xung: diem doc lap (khong ngu lieu) cua cap "KHAC" phai = 0 voi cac rang buoc cung
  for (const [a, b] of [['iPhone 15 128GB', 'iPhone 15 256GB'], ['Sony MDR-EX15AP', 'Tai nghe Sony MDR-EX15AP Cũ -Đen'], ['Đồng hồ MOVADO 22 x 18 mm Nữ 0606473', 'Đồng hồ MOVADO 22 x 18 mm Nữ 0606472']])
    t(M.score(M.features(a), M.features(b)) === 0 && M.score(M.features(b), M.features(a)) === 0, 'diem doc lap = 0: ' + a);
}

/* ---------- 2) Dac trung ---------- */
{ const f = M.features('Đèn led để bàn Rạng Đông - Đen');
  t(f.color.has('den') && f.words.has('den') === false || f.words.has('den'), 'đèn (den) khong bi nham thanh mau đen');   // "đèn" la tu, "đen" la mau
  t([...M.features('Tủ lạnh màu ghi sáng').color].join() === 'xam' && [...M.features('Tai nghe Black').color].join() === 'den', 'chuan hoa mau: ghi sang = xam, black = den');
  t(M.features('Bếp từ đôi').words.has('tu') && M.features('Tủ lạnh').words.has('tu'), 'khong bo nham tu "từ"/"tủ" nhu tu dung');
  t(M.features('Tai nghe Sony MDR-EX15AP Cũ -Đen').cond === 1 && M.features('iPhone 16 - Trợ giá thu cũ đổi mới').cond === 0 && M.features('Củ sạc nhanh 20W').cond === 0, 'nhan dien hang cu, khong nham "thu cũ đổi mới"/"củ sạc"');
  t(M.features('Samsung Galaxy A18 6GB/128GB').strong.length === 0 && M.features('Màn hình 27 inch 2K/IPS/180Hz/1ms').strong.length === 0, 'danh sach thong so "6GB/128GB", "2K/IPS/180Hz" khong bi coi la ma model');
  t(M.features('Tủ lạnh Samsung RF48A4010B4/SV').strong[0].core === 'rf48a4010b4', 'ma model co hau to khu vuc: goc = RF48A4010B4');
  t(M.features('Laptop X (Intel Core Ultra 5 | Win 11 Pro)').variant.size === 0, '"Core Ultra", "Win 11 Pro" khong phai bien the cua san pham');
  t(M.features('Màn hình 38 inch WQHD+').variant.size === 0 && M.features('Samsung Galaxy S24+').variant.has('plus'), '"WQHD+" la do phan giai, "S24+" la ban Plus');
  t(M.signature(M.features('CPU Intel 285K (Tray NK không kèm Tản)')) !== M.signature(M.features('CPU Intel 285K')), 'chu ky bien the: Tray <> Box');
}

/* ---------- 3) Lien ket khoa -> san pham ---------- */
{ const lv = (a, b, same) => M.linkValid(M.features(a), M.features(b), same);
  t(lv('Tủ lạnh Samsung Multidoor 488 lít 2021 (RF48A4000B4/SV)', 'Tủ lạnh Samsung Multidoor 488 lít 2021 (RF48A4010M9/SV)', true) === false, 'cung khoa ten nhung khac ma model trong ngoac -> go lien ket');
  t(lv('Sách Nhà Giả Kim', 'Sách Nhà Giả Kim (Tái Bản)', true) === true, 'cung khoa ten, khong xung dot -> giu');
  t(lv('Laptop MSI Modern 14 C12MO-660VN - Cũ Trầy Xước', 'Laptop MSI Modern 14 C12MO-660VN (Intel Core i5-1235U | 16GB | 512GB)', false) === false, 'may cu khong lien ket voi may moi');
  t(lv('VGA Asus Prime Geforce RTX 5060 Ti 8GB PRIME-RTX5060TI-8G', 'VGA ASUS PRIME RTX 5060 Ti 8GB GDDR7 (PRIME-RTX5060TI-8G) giá sốc', false) === true, 'khac ten nhung trung day du ma hang -> giu');
  t(lv('Máy in tem nhãn mã vạch Godex GX430i Pro - 300dpi', 'Máy in mã vạch Zebra ZT231 (300dpi)', false) === false, 'lien ket sai theo "300dpi" -> go');
}

/* ---------- 4) Dai gia + nguoi ban + khu vuc ---------- */
{ const fz = (p, s) => ({ price: p, source: s });
  let b = M.band([1000000], [fz(800000, 'a'), fz(650000, 'b'), fz(1700000, 'c')], 0.7);
  t(b.ok.length === 1 && b.low.length === 1 && b.low[0].price === 650000 && b.high.length === 1 && b.high[0].price === 1700000, 'dai gia: nhan 80%; 65% = re bat thuong (cho duyet tay); 170% = qua dat (bo, tach rieng)');
  t(M.band([4000000], [fz(1900000, 'a')], 0.3).ok.length === 1 && M.band([4000000], [fz(1900000, 'b')], 0.5).low.length === 1 && M.band([4000000], [fz(1100000, 'a')], 0.3).low.length === 1, 'san 30% cho chuoi ban le trung day du ma hang (gia neo la gia niem yet khong khuyen mai); san TMDT van 50%');
  b = M.band([1000000], [fz(600000, 'a'), fz(610000, 'b'), fz(590000, 'c')], 0.7);
  t(b.ok.length === 3, 'dong thuan: >= 2 nguon khac cung muc gia thap -> nhan');
  b = M.band([], [fz(600000, 'a')], 0.7, 1000000);
  t(b.low.length === 1 && M.band([], [fz(600000, 'a')], 0.5, 1000000).ok.length === 1, 'khong co offer chinh xac: dung gia ky truoc lam neo; trung ma model cho phep tu 50%');
  t(M.sellerOf('cellphones', 'https://cellphones.com.vn/x.html') === 'cellphones' && M.sellerOf('shopee', 'https://shopee.vn/product/14346466/255489769') === 'shopee:14346466' && M.sellerOf('tiki', 'https://tiki.vn/a-p1.html') === null, 'nguoi ban: chuoi ban le / ma shop Shopee / Tiki khong xac dinh');
  t(M.REGION_RE.test('Tủ Mát Sanaky VH-258KL 200L - Hàng Chính Hãng - Chỉ giao tại HCM') && !M.REGION_RE.test('Tủ Mát Sanaky VH-258KL 200L'), 'offer chi giao 1 khu vuc bi loai');
}

/* ---------- 5) Bo nap AccessTrade: tai du trang, bo feed chet ---------- */
(async () => {
  const day = d => { const x = new Date(Date.now() - d * 86400e3 + 7 * 3600e3), p = n => String(n).padStart(2, '0'); return `${p(x.getUTCDate())}-${p(x.getUTCMonth() + 1)}-${x.getUTCFullYear()}T${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:00`; };
  const DATA = {
    'tiki.vn': Array.from({ length: 450 }, (_, i) => ({ name: 'Sách Kiểm Thử Số ' + i + ' Tái Bản', price: 100000 + i, discount: 90000 + i, image: 'https://img.example/' + i + '.jpg', url: 'https://tiki.vn/sach-' + i + '-p' + i + '.html', update_time: day(0.2) })),
    'lazada.vn': Array.from({ length: 300 }, (_, i) => ({ name: 'Hàng Lazada cũ ' + i, price: 50000, discount: 40000, image: 'https://img.example/l' + i + '.jpg', url: 'https://www.lazada.vn/p' + i + '.html', update_time: day(1800) })),
    'dienmayxanh.com': [{ name: 'Tủ Mát Sanaky VH-258KL 200L - Chỉ giao tại HCM', price: 7899000, discount: 7899000, image: 'https://img.example/t.jpg', url: 'https://www.dienmayxanh.com/t', update_time: day(11) }],
  };
  let calls = 0, csvHits = 0, apiDown = false;
  const csvQ = v => '"' + String(v).replace(/"/g, '""') + '"';
  const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/csv\/(.+)\.csv$/);
    if (m) { csvHits++; const arr = m[1] === 'tiki.vn' || m[1] === 'shopee.vn' ? DATA['tiki.vn'] : null; if (!arr) { res.statusCode = 404; return res.end('nf'); }
      // file tinh: cot name,url,price,discount,image,desc,category ; mo ta nhieu dong nam trong ngoac kep
      res.setHeader('content-type', 'application/octet-stream');
      return res.end('"name","url","price","discount","image","desc","category"\n' + arr.map(r => [r.name, r.url, r.price, r.discount, r.image, 'Mo ta dong 1\ndong 2, co dau phay va "ngoac kep"', 'Sách'].map(csvQ).join(',')).join('\n') + '\n'); }
    calls++; if (apiDown) { res.statusCode = 429; return res.end('{"message":"You hit the rate limit"}'); }
    const arr = DATA[u.searchParams.get('domain')] || [], pg = +u.searchParams.get('page'), lim = +u.searchParams.get('limit');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: arr.slice((pg - 1) * lim, pg * lim), total: arr.length })); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.ACCESSTRADE_API = 'http://127.0.0.1:' + srv.address().port + '/';
  process.env.ACCESSTRADE_CSV_BASE = 'http://127.0.0.1:' + srv.address().port + '/csv/';
  const FEEDS = require('../../collector/feeds');
  const ENV = { ACCESSTRADE_KEY: 'k', ACCESSTRADE_GAP_MS: '1', ACCESSTRADE_RL_WAIT_MS: '5', FEED_AGE_TTL_H: '0' };   // TTL 0: luon hoi API (khong dung moc khoi dau trong ma)
  const f = await FEEDS.collectFeeds({ ...ENV, ACCESSTRADE_DOMAINS: 'tiki.vn,lazada.vn,dienmayxanh.com' });
  const bySrc = {}; for (const o of f.offers) bySrc[o.src] = (bySrc[o.src] || 0) + 1;
  t(bySrc.tiki === 450 && f.stat.per.tiki.via === 'csv' && f.offers.find(o => o.src === 'tiki').price === 90000 && /^https:\/\/tiki\.vn\//.test(f.offers.find(o => o.src === 'tiki').url), 'tai DU 450 ban ghi Tiki tu FILE DATAFEED TINH (gia khuyen mai, link goc) - duoc ' + bySrc.tiki);
  t(calls === 3, 'API chi dung 1 yeu cau/nha ban de biet tuoi du lieu (gioi han 30 yeu cau/phut) - da goi ' + calls);
  t(!bySrc.lazada && f.stat.stale.length === 1 && /lazada/.test(f.stat.stale[0]), 'feed Lazada khong cap nhat ~5 nam bi BO ca nguon (khong tai file)');
  t(f.stat.per.lazada.n === 0 && f.stat.per.tiki.n === 450 && f.stat.per.tiki.age < 1, 'thong ke theo nguon: so ban ghi + do tuoi');
  t(!bySrc.dienmayxanh && f.stat.region === 1 && f.stat.per.dienmayxanh.via === 'api', 'khong co file tinh -> du phong API; offer "Chỉ giao tại HCM" bi loai khoi viec so gia');
  t(f.stat.fail.length === 0 && f.stat.ok === 3, 'feed cu duoc tinh la lan chay khoe (khong phai loi)');
  // lan sau: da nho tuoi du lieu -> KHONG goi API; API dang tu choi (429) cung khong anh huong
  apiDown = true; const c0 = calls;
  const f2 = await FEEDS.collectFeeds({ ...ENV, FEED_AGE_TTL_H: '20', ACCESSTRADE_DOMAINS: 'tiki.vn' }, { feedAge: f.stat.feedAge });
  t(calls === c0 && f2.offers.length === 450 && f2.stat.fail.length === 0, 'da nho tuoi du lieu: lan sau khong ton han muc API, API bi gioi han van nap du feed');
  const f3 = await FEEDS.collectFeeds({ ...ENV, ACCESSTRADE_RETRIES: '1', ACCESSTRADE_DOMAINS: 'shopee.vn,dienmayxanh.com' });
  t(f3.offers.filter(o => o.src === 'shopee').length === 450 && f3.stat.per.shopee.via === 'csv', 'API tu choi + chua co thong tin nho: dung moc khoi dau trong ma de van nap duoc file tinh');
  t(f3.stat.fail.some(m => /dienmayxanh.*khong tai duoc/.test(m)), 'khong co file tinh + API tu choi -> bao LOI ro rang (lan chay se giu nguyen ban da xuat ban)');
  t(f3.stat.fail.some(m => /shopee.*chi nhan 450\/12736/.test(m)), 'file tinh it hon mot nua so ban ghi da biet -> bao LOI (file bi cat cut / dang ghi do)');
  srv.close();

  /* ---------- 6) Tim gia theo tu khoa ---------- */
  const S = require('../../collector/search');
  t(S.priceOf({ lo: 100000, hi: 100000 }) === 100000 && S.priceOf({ lo: 100000, hi: 110000 }) === 110000 && S.priceOf({ lo: 100000, hi: 300000 }) === 0, 'gia ket qua tim kiem: 1 muc -> dung; khoang hep -> lay muc cao; khoang rong (nhieu bien the) -> bo');
  t(S.queryOf('Bếp từ đôi âm Electrolux EHI7280BB 3700W', M.features('Bếp từ đôi âm Electrolux EHI7280BB 3700W')) === 'Electrolux EHI7280BB', 'tu khoa tim = thuong hieu + ma model');
  t(S.eligible(M.features('Chuột Logitech G304')) && !S.eligible(M.features('Sách Nhà Giả Kim')), 'chi tim tren san voi SP co ma model');
  // nha cung cap Shopee: ky SHA256(AppId + Timestamp + Payload + Secret)
  let got = null; const sv2 = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got = { auth: req.headers.authorization, body: b }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: { productOfferV2: { nodes: [{ itemId: 1, productName: 'Chuột Logitech G304', priceMin: '700000', priceMax: '700000', imageUrl: 'https://i/1.jpg', productLink: 'https://shopee.vn/product/9/1', shopName: 'Logitech Official' }] } } })); }); });
  await new Promise(r => sv2.listen(0, '127.0.0.1', r));
  const r2 = await S.PROVIDERS.shopee.search({ SHOPEE_APP_ID: '123', SHOPEE_APP_SECRET: 'sec', SHOPEE_API: 'http://127.0.0.1:' + sv2.address().port + '/graphql' }, 'logitech g304'); sv2.close();
  const m = /^SHA256 Credential=123, Timestamp=(\d+), Signature=([0-9a-f]{64})$/.exec(got.auth || '');
  t(!!m && require('crypto').createHash('sha256').update('123' + m[1] + got.body + 'sec').digest('hex') === m[2], 'Shopee Affiliate: chu ky SHA256(AppId+Timestamp+Payload+Secret) dung dinh dang');
  t(r2.status === 200 && r2.items.length === 1 && r2.items[0].lo === 700000 && /shopee\.vn\/product\/9\/1/.test(r2.items[0].u), 'Shopee Affiliate: doc ket qua productOfferV2');
  t(!S.PROVIDERS.shopee.enabled({}) && S.PROVIDERS.tiktok.enabled({ ACCESSTRADE_KEY: 'x' }), 'chua co khoa Shopee -> tu bo qua; TikTok dung khoa AccessTrade');

  t(M.isFreeship('Tai nghe Sony WH-1000XM5 - Freeship toàn quốc') && M.isFreeship('[FREESHIP] Nồi cơm Sharp KS-183TJV'), '"Freeship" khong dieu kien -> khong du phong phi ship');
  t(!M.isFreeship('[FREESHIP HN&HCM] Máy Giặt Sấy Hitachi BD-D852HVOS') && !M.isFreeship('Quạt Senko - freeship đơn từ 300k') && !M.isFreeship('Ốp lưng iPhone 17 Freeship Xtra') && !M.isFreeship('Tủ lạnh Samsung miễn phí vận chuyển nội thành') && !M.isFreeship('Chuột Logitech G304'), '"Freeship" kem dieu kien (khu vuc / gia tri don / chuong trinh co tran) -> van du phong phi ship');
  { const f1 = M.features('Laptop Asus Vivobook 15 X1504VA i5-1335U/16GB/512GB/W11SL'), f2 = M.features('Robot hút bụi Dreame W10 Pro');
    t(![...f1.ids].includes('w11sl') && !f1.variant.has('pro') && [...f2.ids].includes('w10'), '"W11SL" trong ten laptop la Windows (bo); "W10" cua Dreame la ma model (giu)');
    t(JSON.stringify(M.features('Camera EZVIZ H3C 1080P').res) === '[2]' && JSON.stringify(M.features('Camera Imou 2K 4MP').res) === '[4]' && M.features('Chuột Logitech G304').res === null, 'do phan giai quy ve megapixel: 1080P = 2MP; "2K 4MP" = 4MP'); }
  /* ---------- 7) Bo loc tin cay: lich su niem phong la GIA THUC TRA -> so voi gia thuc tra cua offer ---------- */
  { const TR = require('../../collector/trust');
    const day = i => TR.dayOf(new Date(Date.UTC(2026, 9, 1 + i)).toISOString()), d90 = v => Array.from({ length: 5 }, (_, i) => [day(i), v, 'h']), D5 = day(4);   // 5 ngay cung gia (ban cu: moi ngay 1 diem)
    const toCost = kk => kk - 18000;
    // vi du: sach 20.000d + ship du phong 30.000d = thuc tra 50.000d -> gia ban 68.000d. Truoc day lay 20.000 so voi 50% x 50.000 nen bi loai VINH VIEN
    const book = TR.filterOffers({ name: 'Sách thiếu nhi A', grp: 'Sách', base_price: 30000, d90: d90(68000) }, [{ source: 'tiki', price: 20000, ship: 30000, landed: 50000, in_stock: 1 }], toCost, D5);
    t(book.valid.length === 1 && !book.dropped.length, 'hang re co ship du phong > gia hang KHONG con bi loai oan vi "thap hon 50% lich su"');
    const drop = TR.filterOffers({ name: 'Sách thiếu nhi A', grp: 'Sách', base_price: 30000, d90: d90(170000) }, [{ source: 'tiki', price: 20000, ship: 30000, landed: 50000, in_stock: 1 }], toCost, D5);
    t(drop.dropped.length === 1 && /50%/.test(drop.dropped[0].why), 'gia thuc tra sut that > 50% so voi lich su van bi giu lai de kiem tra');
    // dat lai moc tham chieu (muc gia moi da duoc xac nhan lap lai): chi doi chieu voi lich su tu moc do, lich su cu van nguyen
    { const dd = { name: 'Loa thanh Y', grp: 'Loa', base_price: 0, d90: d90(14752000) }; const off = [{ source: 'cellphones', price: 6990000, landed: 6990000, in_stock: 1 }];
      const R = TR.dayOf(new Date(Date.UTC(2026, 9, 20)).toISOString());   // ngay dat lai moc = ngay chay
      const before = TR.filterOffers(dd, off.map(o => ({ ...o })), toCost, R).dropped.length;
      dd.href = R; dd.href_at = new Date(Date.UTC(2026, 9, 20)).toISOString();
      t(before === 1 && TR.histRef(dd, R) === 0 && TR.filterOffers(dd, off.map(o => ({ ...o })), toCost, R).valid.length === 1 && dd.d90.length === 5, 'gia moi lech > 50% lich su: bi giu; sau khi dat lai moc tham chieu thi duoc nhan, lich su niem phong khong bi sua');
      // sau khi gia moi duoc nhan: d90 mo doan moi -> cac ngay sau chi doi chieu voi muc gia moi
      dd.kk_price = 7016000; dd.ledger = [{ hash: 'f'.repeat(64), at: dd.href_at, kk_price: 7016000 }]; TR.updateD90(dd, dd.href_at);
      t(TR.histRef(dd, R + 5) === 7016000 && dd.d90.length === 2 && dd.d90[0][1] === 14752000, 'tu ngay dat lai moc, gia tham chieu la muc gia moi; doan gia cu van nam trong lich su'); }
    /* d90 nen theo doan + Merkle theo khoi */
    { const d0 = TR.dayOf('2026-10-01T00:00:00Z'), iso = (i, h = 1) => new Date((d0 + i) * 864e5 + h * 3600e3).toISOString();
      const d = { kk_price: 100000, ledger: [{ hash: 'a'.repeat(64), at: iso(0), kk_price: 100000 }], d90: [] };
      for (let i = 0; i < 10; i++) TR.updateD90(d, iso(i));
      t(d.d90.length === 1 && TR.histVals(d.d90, d0 + 9).length === 10, 'd90 nen theo doan: 10 ngay cung gia chi 1 phan tu, bung ra du 10 ngay');
      d.kk_price = 120000; d.ledger.push({ hash: 'b'.repeat(64), at: iso(10), kk_price: 120000 }); TR.updateD90(d, iso(10));
      d.kk_price = 110000; d.ledger.push({ hash: 'c'.repeat(64), at: iso(10, 5), kk_price: 110000 }); TR.updateD90(d, iso(10, 5));
      t(d.d90.length === 2 && d.d90[1][0] === d0 + 10 && d.d90[1][1] === 110000, 'doi gia 2 lan trong ngay: giu gia cuoi ngay, khong tao 2 phan tu');
      for (let i = 11; i < 60; i++) TR.updateD90(d, iso(i));
      const v = TR.histVals(d.d90, d0 + 59); t(d.d90.length === 2 && v.length === 60 && v.filter(x => x === 100000).length === 10 && TR.histRef(d, d0 + 59) === 110000, 'trung vi lich su tinh theo NGAY (10 ngay gia cu, 50 ngay gia moi)');
      for (let i = 60; i < 130; i++) TR.updateD90(d, iso(i));
      t(d.d90.length === 1 && TR.histVals(d.d90, d0 + 129).length === 90, 'cua so 90 ngay: doan da ket thuc truoc cua so bi bo, van bung du 90 ngay');
      t(JSON.stringify(TR.packD90([[1, 5, 'G'], [2, 5, 'G'], [3, 6, 'H'], [4, 6, 'H'], [6, 6, 'H']])) === '[[1,5,"G"],[3,6,"H"]]', 'du lieu cu (moi ngay 1 diem) duoc gop thanh doan');
      let okM = true;
      for (const n of [1, 2, 3, 255, 256, 257, 513, 1000, 4097]) { const L = Array.from({ length: n }, (_, i) => ({ sku: 'KK' + String(100000 + i * 7), head: TR.sha('h' + i) })); const a = TR.merkle(L), b = TR.merkleChunks(L), top = { n: b.n, c: b.c, nodes: b.nodes, root: b.root };
        const last = b.chunks[b.chunks.length - 1], k = last.skus.length - 1;
        if (a.root !== b.root || !TR.verifyChunk(b.chunks[0].skus[0], b.chunks[0].heads[0], b.chunks[0], top) || !TR.verifyChunk(last.skus[k], last.heads[k], last, top) || TR.verifyChunk(last.skus[k], TR.sha('gia'), last, top)) okM = false;
        const bad = { ...last, heads: last.heads.map((h, i) => i ? h : TR.sha('sua')) }; if (n > 1 && TR.verifyChunk(bad.skus[k], bad.heads[k], bad, top)) okM = false; }
      t(okM, 'Merkle theo khoi: cung root voi cay cu; SKU dau/cuoi kiem chung duoc; dau chuoi gia hoac khoi bi sua bi phat hien'); }
    const both = TR.filterOffers({ name: 'Tai nghe X', grp: 'Tai nghe', base_price: 0 }, [{ source: 'thegioididong', price: 1000000, landed: 1000000, in_stock: 1 }, { source: 'dienmayxanh', price: 1000000, landed: 1000000, in_stock: 1 }, { source: 'hoangha', price: 450000, landed: 450000, in_stock: 1 }], toCost);
    t(both.valid.some(o => o.source === 'hoangha'), '2 chuoi dung chung 1 bang gia chi tinh 1 lan; chuoi ban le chinh hang khop chinh xac re hon han khong bi loai');
    const mk = TR.filterOffers({ name: 'Tai nghe X', grp: 'Tai nghe', base_price: 0 }, [{ source: 'tiki', price: 1000000, landed: 1000000, in_stock: 1 }, { source: 'cellphones', price: 990000, landed: 990000, in_stock: 1 }, { source: 'shopee', price: 300000, landed: 300000, in_stock: 1 }], toCost);
    t(mk.dropped.length === 1 && mk.dropped[0].source === 'shopee' && !!mk.dropped[0].why, 'offer san TMDT thap hon 50% trung vi cac nguon van bi loai, kem ly do'); }

  /* ---------- 8) Bu lich trong luc chay (kick.js) voi GitHub API gia lap ---------- */
  { const http = require('http'); let runs = [], posts = [];
    const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
      if (q.headers.authorization !== 'Bearer tok-thu') { r.statusCode = 401; return r.end('{}'); }
      if (q.method === 'GET' && /\/actions\/workflows\/collect\.yml\/runs/.test(q.url)) { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ workflow_runs: runs })); }
      if (q.method === 'POST' && /\/actions\/workflows\/collect\.yml\/dispatches$/.test(q.url)) { posts.push(JSON.parse(b)); r.statusCode = 204; return r.end(); }
      r.statusCode = 404; r.end('{}'); }); });
    await new Promise(res => srv.listen(0, '127.0.0.1', res));
    const env = { GH_TOKEN: 'tok-thu', GITHUB_REPOSITORY: 'o/r', KICK_API: 'http://127.0.0.1:' + srv.address().port, KICK_EVERY_MIN: '10', KICK_AFTER_MIN: '180' }, K = require('../../collector/kick');
    const T0 = Date.parse('2026-11-14T06:00:00Z'), ago = m => new Date(T0 - m * 60e3).toISOString(), quiet = () => { };
    runs = [{ status: 'completed', run_started_at: ago(100) }]; let k = K.make(env, quiet);
    const a1 = await k.tick(T0), a2 = await k.tick(T0 + 60e3);
    t(a1 === 'fresh' && a2 === null && !posts.length, 'bu lich: lan thu thap gan nhat moi 100 phut -> khong goi; trong 10 phut khong hoi lai GitHub');
    runs = [{ status: 'completed', run_started_at: ago(190) }]; k = K.make(env, quiet);
    const b1 = await k.tick(T0), b2 = await k.tick(T0 + 11 * 60e3);
    t(b1 === 'kicked' && b2 === 'recent' && posts.length === 1 && posts[0].ref === 'main' && posts[0].inputs.trigger === 'bu-lich', 'bu lich: qua 3 gio -> goi collect.yml dung 1 lan (trigger=bu-lich), khong goi chong');
    runs = [{ status: 'in_progress', run_started_at: ago(1) }, { status: 'completed', run_started_at: ago(400) }]; k = K.make(env, quiet); posts = [];
    t(await k.tick(T0) === 'running' && !posts.length, 'bu lich: dang co lan thu thap chay/cho -> khong goi them');
    t(await K.make({ GITHUB_REPOSITORY: 'o/r' }, quiet).tick(T0) === null && await K.make({ ...env, GH_TOKEN: 'sai' }, quiet).tick(T0) === 'http401', 'bu lich: khong co token thi bo qua; token sai khong lam hong tien trinh');
    srv.close(); }

  /* kich thuoc / dinh luong khong phai ma model (tung lam 2 tam nem khac hang cung co "160x200x5cm" bi coi la trung ma hang dai) */
  { const sc = (a, b) => M.score(M.features(a), M.features(b));
    t(sc('Nệm Kim Cương Gấp 3 Cao Su Bông 160x200x5cm', 'Nệm Cao Su thiên nhiên Vạn Thành UNIQUE - 160x200x5cm') === 0 && sc('Nệm Lò Xo Vạn Thành Phoenix 160x200x22cm', 'Nệm Lò Xo Vạn Thành Royal 160x200x22cm') === 0, 'kich thuoc "160x200x5cm" khong phai ma model: nem khac hang / khac dong cung kich thuoc KHONG ghep');
    t(sc('Nệm Lò Xo Vạn Thành Phoenix 160x200x22cm', 'Nệm lò xo Vạn Thành Phoenix 160x200x22cm - Hàng chính hãng') >= 0.6 && sc('Nệm Lò Xo Vạn Thành Phoenix 160x200x22cm', 'Nệm Lò Xo Vạn Thành Phoenix 180x200x22cm') === 0 && sc('Giấy A4 Double A 70gsm', 'Giấy A4 Double A 80gsm') === 0, 'cung san pham cung kich thuoc van ghep; khac kich thuoc / khac dinh luong (70gsm <> 80gsm) thi khong');
    t(!M.features('Kệ sắt 120x40x180').strong.length && !M.features('Thảm 1m6x2m').strong.length && M.features('Màn hình Samsung LS27B800PXEXXV').strong.length === 1 && M.features('Tai nghe JBL Live 670NC').strong.length === 1 && M.features('Chuột ThinkPad Essential Wireless Mouse_4X30M56887').strong.some(c => c.full === '4x30m56887'), 'ma model that (LS27B800PXEXXV, 670NC, ma linh kien Lenovo 4X30M56887) van la ma manh'); }
  /* ---------- 9) Cham soc danh muc (curate.js): gop san pham trung + duyet tay offer ---------- */
  { const C = require('../../collector/curate'), G = 'Thiết bị mạng', F = 'Tủ lạnh';
    const full = [], add = (sku, name, grp, kk = 1000000, st = 1) => full.push({ sku, name, grp, kk_price: kk, in_stock: st });
    for (let i = 0; i < 40; i++) add('KK9' + String(10000 + i).slice(1) + '0', `Router Wifi chuẩn băng tần kép Hãng${i} Model${i}X${i}${i} AC1200`, G);   // ngu lieu: "chuan", "bang tan kep" la tu pho bien
    add('KK000010', 'Tủ lạnh Panasonic Inverter 306 lít NR-TV341VGMV', F); add('KK000020', 'Tủ lạnh Panasonic 306 lít 2021 (NR-TV341VGMV)', F);
    add('KK000030', 'Balo dây kéo ANELLO AT-B2261 - Màu Xanh Navy', 'Túi xách & Ba lô'); add('KK000031', 'Balo dây kéo ANELLO AT-B2261 - Màu Xanh Denim', 'Túi xách & Ba lô');
    add('KK000040', 'Ổ cứng SSD WD Blue SN580 1TB', 'PC & Linh kiện'); add('KK000041', 'Ổ cứng SSD WD Blue SN580', 'PC & Linh kiện');
    add('KK000050', 'Router Wifi 6 Asus RT-AX52', G); add('KK000051', 'Router Wifi 6 chuẩn băng tần kép Asus RT-AX52', G);
    add('KK000060', 'Router Wifi 6 Mercusys MR60X', G); add('KK000061', 'Router Wifi 6 băng tần kép Mercusys MR60X', G);
    add('KK000070', 'Màn hình Gaming Xiaomi G34WQi 34 inch', 'Màn hình máy tính'); add('KK000071', 'Màn hình Gaming Xiaomi G34WQi 2026 34 inch', 'Màn hình máy tính');
    add('KK000080', 'Máy trạm Workstation HP Z2 Tower G9 4N3U8AV (Core i7 14700 | 8GB | 256GB', 'PC & Linh kiện'); add('KK000081', 'Máy trạm Workstation HP Z2 Tower G9 4N3U8AV (Core i7 14700 | 8GB | 256GB', 'PC & Linh kiện'); add('KK000082', 'Máy trạm Workstation HP Z2 Tower G9 4N3U8AV (Core i7 14700 | 8GB | 256GB', 'PC & Linh kiện');
    add('KK000090', 'Màn hình ViewSonic VX2479A-HD-PRO 240Hz 24 inch - Cũ Đẹp', 'Màn hình máy tính'); add('KK000091', 'Màn hình ViewSonic VX2479A-HD-PRO 240Hz 24 inch - Đã Kích Hoạt', 'Màn hình máy tính');
    add('KK000100', 'Tủ lạnh LG Inverter 315 lít LTB31BLM', F, 9000000); add('KK000101', 'Tủ lạnh LG 315 lít 2024 (LTB31BLM)', F, 3000000);
    const IDX = M.createIndex(); for (const p of full) IDX.add(p.sku, p.name, p.grp);
    const ex = new Map([['KK000050', [{ src: 'cellphones', url: 'https://cellphones.com.vn/a.html' }]], ['KK000051', [{ src: 'cellphones', url: 'https://cellphones.com.vn/b.html' }]], ['KK000060', [{ src: 'thegioididong', url: 'https://www.thegioididong.com/a' }]], ['KK000061', [{ src: 'hoangha', url: 'https://hoanghamobile.com/b' }]]]);
    const { plan, why } = C.planMerges({ full, IDX, MATCH: M, exBySku: ex }), pm = new Map(plan.map(x => [x.from, x.to]));
    t(pm.get('KK000020') === 'KK000010', 'gop: trung day du ma hang dai cua nha san xuat -> gop ve ma nho hon (ten mo ta khac nhau van gop)');
    t(!pm.has('KK000031') && !pm.has('KK000041') && !pm.has('KK000071') && !pm.has('KK000091'), 'KHONG gop: khac mau (Navy/Denim), 1 ben thieu dung luong (SN580 1TB), khac nam (G34WQi 2026), hang cu khac tinh trang (Cu dep / Da kich hoat)');
    t(!pm.has('KK000051') && why.seller >= 1, 'KHONG gop: cung 1 chuoi ban le niem yet ca hai ten nhu hai mat hang rieng');
    t(pm.get('KK000061') === 'KK000060', 'gop: ma model ngan, chi lech tu mo ta pho bien trong nhom ("băng tần kép"), khac nguoi ban');
    t(pm.get('KK000081') === 'KK000080' && pm.get('KK000082') === 'KK000080', 'gop: nhieu ma trung ten hoan toan (loi tao lai san pham moi lan chay) ve 1 ma chuan');
    t(!pm.has('KK000101') && why.price >= 1, 'KHONG gop: gia hai trang lech qua xa (min/max < 0,6)');
    t(C.planMerges({ full, IDX, MATCH: M, exBySku: ex, max: 2 }).plan.length === 2, 'gop: ton trong tran so luong moi lan chay');
    const st = C.aliasStub('KK000020', 'slug-cu', { sku: 'KK000010', name: 'N', brand: 'B', category_id: 'c', category_name: 'C', grp: F, image: 'https://x/y.jpg', specs: { 'Bảo hành': '24 tháng', 'Khác': 'x' }, kk_price: 5, in_stock: 1, sh: 3, trust: { fl: 4, disc: 7, why: ['a'] }, ledger: [{ hash: 'h' }], d90: [[1, 2, 'h']] }, 'T');
    t(st.sku === 'KK000020' && st.merged_into === 'KK000010' && st.kk_price === 5 && st.sh === 3 && st.trust.fl === 4 && st.specs['Bảo hành'] === '24 tháng' && !st.ledger && !st.d90 && !st.trust.why, 'file thay the cua ma da gop: du truong cho gio hang / may chu don hang, khong co so cai');
    // duyet tay
    const K = C.apprKeys('khoa-thu'), id = K.oid('KK000010', 'tiki', 'https://tiki.vn/p1.html'), id2 = K.oid('KK000010', 'tiki', 'https://tiki.vn/p2.html');
    t(/^[0-9a-f]{20}$/.test(id) && id !== id2 && id === C.apprKeys('khoa-thu').oid('KK000010', 'tiki', 'https://tiki.vn/p1.html') && id !== C.apprKeys('khoa-khac').oid('KK000010', 'tiki', 'https://tiki.vn/p1.html') && C.apprKeys('') === null, 'ma offer: HMAC on dinh theo khoa quan tri, doi khoa thi doi ma; khong co khoa -> khong co ma');
    const title = `KK-DUYET ok KK000010 ${id} ${K.commit(id, 5000000)}`, d1 = C.parseTitle(title);
    t(d1 && d1.d === 'ok' && d1.sku === 'KK000010' && d1.id === id && !C.parseTitle(title + ' ; rm -rf /') && !C.parseTitle('KK-DUYET ok KK1 x y') && !C.parseTitle('KK-DUYET xoa KK000010 ' + id + ' ' + K.commit(id, 1)) && !C.parseTitle(title.replace('KK-DUYET', 'kk-duyet')), 'tieu de issue: chi nhan dung dinh dang chat, tu choi moi bien the/chen lenh');
    let book = C.applyDecision(null, d1, { at: '2026-11-14T00:00:00Z', by: 'chu', n: 7 }); const priv = {};
    t(C.decisionOf(book, priv, K, 'KK000010', id, 5000000) === 'ok' && priv.KK000010[id].p0 === 5000000, 'duyet: cam ket khop gia hien tai -> dung offer, ghi muc gia da duyet vao so rieng');
    t(C.decisionOf(book, priv, K, 'KK000010', id, 4600000) === 'ok' && C.decisionOf(book, priv, K, 'KK000010', id, 4400000) === 'stale' && C.decisionOf(book, priv, K, 'KK000010', id, 9000000) === 'ok', 'duyet: gia nguon tut qua 10% so voi muc da duyet -> phai duyet lai; gia tang thi van hieu luc');
    t(C.decisionOf(book, {}, K, 'KK000010', id, 4000000) === 'stale' && C.decisionOf(book, {}, K, 'KK000010', id, 4700000, [5000000]) === 'ok' && C.decisionOf(book, {}, K, 'KK000010', id2, 5000000) === '', 'duyet: gia luc xu ly khac gia da nhin thay -> chi nhan khi khop gia trong goi quan tri lan truoc va chua tut qua 10%; offer khac khong bi anh huong');
    book = C.applyDecision(book, C.parseTitle(`KK-DUYET no KK000010 ${id2} ${K.commit(id2, 1)}`), { at: 'x', by: 'chu', n: 8 });
    t(C.decisionOf(book, priv, K, 'KK000010', id2, 123) === 'no', 'tu choi: offer bi loai han khoi san pham, bat ke gia');
    book = C.applyDecision(book, C.parseTitle(`KK-DUYET clear KK000010 ${id} ${K.commit(id, 1)}`), { at: 'x', by: 'chu', n: 9 });
    t(C.decisionOf(book, priv, K, 'KK000010', id, 5000000) === '' && book.items.KK000010[id2].d === 'no', 'bo quyet dinh: offer tro lai trang thai cho duyet, quyet dinh khac giu nguyen');
    const tmp = require('path').join(require('os').tmpdir(), 'kk-appr-' + process.pid + '.json'), AP = require('../../collector/approve');
    const r1 = AP.run({ ISSUE_TITLE: title, ISSUE_USER: 'Chu', REPO_OWNER: 'chu', ISSUE_ASSOC: 'OWNER', ISSUE_NUMBER: '12' }, tmp, '2026-11-14T01:00:00Z');
    const r2 = AP.run({ ISSUE_TITLE: title, ISSUE_USER: 'nguoila', REPO_OWNER: 'chu', ISSUE_ASSOC: 'NONE' }, tmp), r3 = AP.run({ ISSUE_TITLE: 'KK-DUYET ok $(id)', ISSUE_USER: 'chu', REPO_OWNER: 'chu' }, tmp), r4 = AP.run({ ISSUE_TITLE: title, ISSUE_USER: 'chu', REPO_OWNER: 'chu', ISSUE_ASSOC: 'COLLABORATOR' }, tmp);
    const saved = JSON.parse(require('fs').readFileSync(tmp, 'utf8')); require('fs').unlinkSync(tmp);
    t(r1.ok && r1.changed && saved.items.KK000010[id].d === 'ok' && saved.items.KK000010[id].n === 12 && !r2.ok && !r2.changed && !r3.ok && !r4.ok && !/tiki|5000000/.test(JSON.stringify(saved)), 'approve.js: chi chu kho ma + tieu de hop le moi duoc ghi; so duyet khong chua ten nguon/gia nguon'); }

  console.log(`\nBo ghep cheo & bo nap feed: ${pass}/${pass + fail} dat`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
