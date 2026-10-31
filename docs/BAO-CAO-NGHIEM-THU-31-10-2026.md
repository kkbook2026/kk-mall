# BÁO CÁO NGHIỆM THU THEO VAI TRÒ - KK-MALL (31/10/2026)

**Kết luận:** 335/335 kiểm tra đạt. Phát hiện và đã sửa 1 lỗi thật (đánh giá ảo trên dòng hàng đã hủy). Website chạy thật; máy chủ v1.6.0 đã lưu, chờ chủ sở hữu bấm triển khai Version 10.

## 1. Môi trường và tài khoản thử nghiệm

- **Nơi chạy:** bản sao cục bộ dùng **đúng mã nguồn đang chạy thật** (website `site/` + máy chủ `backend/Code.gs` v1.6.0) trong bộ mô phỏng Google Apps Script (Sheet, Drive, Mail, Cache, Lock), trình duyệt Chromium thật. Không tạo dữ liệu, không gửi email, không chuyển tiền trên hệ thống thật.
- **Vì sao không tạo tài khoản / đơn trên www.kk-mall.com:** đăng nhập cần mã OTP gửi về email (không được nhập mã xác thực thay chủ sở hữu); thanh toán cần chuyển khoản thật; đơn thử sẽ gửi email thật và nằm trong sổ sách thật.
- **Tài khoản tự tạo trong phiên (tên miền .test - không tồn tại thật):**

| Vai trò | Tài khoản | Dùng để kiểm tra |
|---|---|---|
| Quản trị viên | email quản trị + khóa dữ liệu thử | đăng nhập 2 lớp, toàn bộ trang quản trị |
| Thành viên A | an.nguyen@kkmall.test | đăng ký OTP, hồ sơ, voucher, đơn của tôi, đơn quá hạn |
| Thành viên B (doanh nghiệp) | ketoan.b@kkmall.test - MST 0109876543 | hóa đơn GTGT, đổi trả, bảo hành, tải/xóa dữ liệu |
| Khách vãng lai C | khach.c@kkmall.test (không đăng ký) | đặt hàng không tài khoản, bot tự đặt Tiki, đánh giá |
| Khách D | khach.d@kkmall.test (tên chứa mã độc) | chuyển dư, hoàn tiền VietQR, chống XSS |
| Bot đặt hàng | khóa `kkbot_…` tạo trên trang quản trị | hàng đợi, chống mua trùng, chặn vượt giá |

- **Sản phẩm thật trong danh mục:** USB Wifi TP-Link TL-WN823N (276.000đ), Nồi chiên không dầu Philips NA130 (2.092.000đ), Sách Collins IELTS (165.000đ), Router TP-Link Archer C64 (782.000đ).

## 2. Kết quả kịch bản nghiệm thu (72/72)

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Khách vãng lai: tìm → SP → giỏ → đặt không cần tài khoản → VietQR → "Tôi đã chuyển khoản" → ngân hàng báo có → màn hình tự chuyển "Đã nhận thanh toán" → tự lập lệnh mua | 10/10 |
| 2 | Thành viên A: đăng ký OTP, lưu hồ sơ, checkout tự điền, 2 dòng hàng, voucher chỉ giảm phí dịch vụ (-34.000đ), "Đơn hàng của tôi" không lộ đơn người khác | 6/6 |
| 3 | Thành viên B: đơn cần hóa đơn GTGT lưu đúng tên/MST công ty | 2/2 |
| 4 | Khách D: chuyển dư 50.000đ → ghi phải hoàn; ngân hàng gửi lặp không cộng trùng; khách khai TK nhận hoàn (che số); mã độc trong tên không chạy | 4/4 |
| 5 | Quản trị: đăng nhập khóa dữ liệu + OTP; đủ đơn; xác nhận thanh toán tay; kế hoạch lệnh mua đơn VAT bỏ qua Shopee (rẻ hơn nhưng không xuất VAT) | 6/6 |
| 6 | Bot đặt hàng: tạo khóa (email cảnh báo), hàng đợi kèm địa chỉ khách, chọn Tiki, đơn VAT để đặt tay, chặn giá nguồn vượt biên, chống mua trùng, báo xong → "Đã đặt" + email khách, thực trả rẻ hơn → tự ghi hoàn 3.000đ | 10/10 |
| 7 | Vận hành: đặt tay, nguồn hết hàng → hủy lệnh → tự hoàn 100% dòng + email; chặn chuyển trạng thái sai; vận chuyển → đã giao; khách tự tra cứu; sai SĐT không xem được | 5/5 |
| 8 | Sau giao: đánh giá thật (ẩn danh, nhãn "Đã nhận hàng"); chặn đánh giá dòng đã hủy; đổi trả kèm ảnh → thu hồi → hoàn tiền; bảo hành thiết bị điện tử (sách: báo không thuộc diện bảo hành); hàng đợi hoàn tiền VietQR → "Đã chuyển hoàn" | 9/9 |
| 9 | Đơn quá hạn: nhắc thanh toán 1 lần sau 2 giờ → tự hủy → tiền vào muộn không kích hoạt lại, ghi phải hoàn + email quản trị | 3/3 |
| 10 | Phân quyền & dữ liệu cá nhân: thành viên chỉ thấy đơn mình; không gọi được API quản trị; khóa bot sai bị chặn; tải dữ liệu JSON; tự xóa tài khoản (gõ XOA), chứng từ vẫn giữ | 5/5 |
| 11 | "Tìm không ra" → tab quản trị thấy từ khóa + yêu cầu tìm nguồn (ẩn danh) | 1/1 |
| 12 | Kế toán: tự lập + phát hành hóa đơn phí dịch vụ (email kế toán B); sổ cái Nợ = Có 9.162.000đ; tự kiểm toán 0 vấn đề; doanh thu tách thu hộ/phí; tab Đánh giá, Đổi trả; sao lưu JSON | 8/8 |
| 13 | Điện thoại 390px không tràn ngang; 0 lỗi JavaScript; 0 vi phạm CSP | 3/3 |

## 3. Các bộ kiểm thử tự động khác (chạy lại cùng ngày)

| Bộ | Kết quả |
|---|---|
| Máy chủ (Code.gs, 21 nhóm) | 183/183 |
| Trình duyệt toàn trang (cửa hàng + quản trị) | 38/38 |
| Ô tìm kiếm (gợi ý, dấu, phím, bộ lọc, 0 kết quả, điện thoại) | 27/27 |
| Tiện ích Chrome (tách địa chỉ, kế hoạch nguồn) | 15/15 |
| **Tổng (kể cả nghiệm thu 72)** | **335/335** |

## 4. Kiểm tra trên hệ thống thật (chỉ đọc, không tạo dữ liệu)

- Trang chủ 17 kệ hàng, 15 ngành, 28.397 SP; máy chủ trả cấu hình: TK VietQR sẵn sàng, biểu phí 18.000/26.000/32.000đ.
- Tìm "noi chien khong dau philips" → Nồi chiên không dầu Philips 6.2 lít NA130 (2.092.000đ); trang SP hiển thị đúng.
- Báo giá thật từ máy chủ: tiền hàng 2.060.000đ + phí 32.000đ - voucher 16.000đ = **2.076.000đ** (rẻ hơn giá niêm yết nhờ voucher tự áp).
- Tra cứu mã đơn giả → từ chối đúng; trang quản trị noindex; trang pháp lý, sitemap, gói tiện ích: HTTP 200. Giỏ hàng thử được khôi phục nguyên trạng.

## 5. Lỗi phát hiện và đã sửa

- **Đánh giá ảo trên dòng hàng chưa từng nhận:** đơn 2 dòng, 1 dòng nguồn hết hàng bị hủy + hoàn tiền, dòng kia đã giao → máy chủ vẫn cho đánh giá dòng đã hủy (vì chỉ xét trạng thái cả đơn). Đã sửa: có lệnh mua thì chỉ đánh giá khi CHÍNH dòng đó đã giao; thêm 2 kiểm tra hồi quy. Mã sửa đã lưu trong Apps Script, có hiệu lực khi triển khai Version 10.

## 6. Việc cần chủ sở hữu

1. **Triển khai máy chủ Version 10** (Deploy → Manage deployments → ✏️ → New version): bật ghi nhận "tìm không ra" + sửa lỗi đánh giá.
2. **Thử 1 đơn thật trọn vòng** (khuyến nghị): đặt 1 SP rẻ trên www.kk-mall.com bằng email của anh → chuyển khoản → xác nhận email, lệnh mua, bot Tiki (nhập OTP ngân hàng) → nhận hàng → đánh giá. Đây là phần duy nhất cần tiền thật và mã OTP thật.
3. Nhập thông tin doanh nghiệp thật tại Admin → Hệ thống (MST, hotline, email, số đăng ký Bộ Công Thương).

(c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
