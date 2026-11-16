# KK-MALL - Rà soát vận hành tự động & pháp lý (15/11/2026)

## 1. Vấn đề đo được trong 24 giờ (14-15/11/2026)

| Quy trình | Lịch đặt (cron GitHub) | Số lượt thực chạy | Hậu quả |
|---|---|---|---|
| Giám sát (monitor) | 30 phút / 48 lượt | 5 | Lỗi không được báo kịp |
| Thu thập giá & xuất bản (collect) | 3 giờ / 8 lượt | 3 | Giá trên web cũ tới 7-8 giờ |
| Săn giá theo mã model (hunt) | 1 giờ / 24 lượt | 2 | Không chạy từ 03:47 |
| Tìm giá trên sàn (search) | nối chuỗi | đứt 23:51 | Máy chạy chết giữa chừng, bước nối chuỗi không chạy |

Nguyên nhân: cron của GitHub Actions là "nỗ lực tối đa", bị bỏ lượt khi hệ thống tải cao; chuỗi nối tiếp dựa vào một bước cuối duy nhất nên đứt hẳn khi máy chạy chết.

## 2. Thiết kế mới: điều phối lịch 3 lớp (không phụ thuộc cron)

| Lớp | Cơ chế | Tần suất |
|---|---|---|
| 1. Bước cuối mỗi quy trình | `node collector/scheduler.js --self <workflow>` (luôn chạy, kể cả khi bước trước lỗi) | Sau mỗi lượt của 7 quy trình |
| 2. Nhịp giữa lượt | `collector/kick.js` trong tiến trình dài: thu thập 3 giờ, giám sát 30 phút | Trong lúc săn giá / tìm giá đang chạy |
| 3. Dự phòng | `.github/workflows/scheduler.yml` | 10 phút (phút 4, 14, 24, ...) |

**Luật quyết định (`decide`, hàm thuần, 21 kiểm thử):**

| Quy trình | Kiểu | Chu kỳ | Ghi chú |
|---|---|---|---|
| Thu thập giá & xuất bản | định kỳ | 180 phút | input trigger = bu-lich |
| Giám sát | định kỳ | 30 phút | |
| Săn giá theo mã model | vòng liên tục | nghỉ 5 phút | lượt ngắn (hết việc) → nghỉ 60 phút |
| Tìm giá trên sàn (API chính thức) | vòng liên tục | nghỉ 2 phút | tắt bằng biến SEARCH_CHAIN=0 |
| Giá bán lẻ (website công khai) | định kỳ | 240 phút | |
| Săn giá - trạm Việt Nam | vòng liên tục | | chỉ bật khi có HUNT_VN_RUNNER |

- Bỏ qua khi quy trình đang chạy (không tạo lượt chồng).
- 3 lượt lỗi liên tiếp → lùi 60 phút (tránh vòng lỗi đốt phút chạy).
- Định kỳ đến hạn khi `tuổi lượt gần nhất >= chu kỳ - 3 phút`.

**Kiểm chứng trên GitHub (lượt dự phòng đầu tiên):** săn giá "ĐÃ GỌI CHẠY - nghỉ 378 phút", giá bán lẻ "ĐÃ GỌI CHẠY - cách 476 phút", thu thập/giám sát "bỏ qua - mới chạy", tìm giá "bỏ qua - đang chạy", trạm VN "đang tắt". Hai quy trình bị bỏ lỡ đã được khởi động lại ngay.

## 3. Giám sát bổ sung

`collector/monitor.js` thêm kiểm tra **"Quy trình tự động giữ nhịp"**: báo động khi lượt gần nhất quá cũ mà không có lượt đang chạy (thu thập 5 giờ, săn giá 6 giờ, tìm giá 6 giờ, giá bán lẻ 9 giờ) hoặc 3 lượt lỗi liên tiếp.

## 4. Giảm tải website nguồn (giá bán lẻ)

- Trang đã đọc trong `RETAIL_MIN_AGE_H` giờ (mặc định 12) không đọc lại; trang không phải sản phẩm 7 ngày mới kiểm lại.
- Vẫn tôn trọng robots.txt + crawl-delay; máy chủ từ chối truy cập tự động (HTTP 403) → không thu thập, không vượt chặn.
- Hết việc thì dừng sớm, điều phối lịch gọi lượt sau theo nhịp 4 giờ.

## 5. Pháp lý điền theo GCN ĐKDN

Xem `docs/PHAP-LY.md` mục 0. Nguồn dữ liệu duy nhất `collector/company.json`, hiển thị tại chân trang, /phap-ly, /doi-tac, trang SEO tĩnh, JSON-LD, hợp đồng điện tử, máy chủ. Sửa thông tin sai: chỉ nhận chuyển khoản VietQR (bỏ câu VNPay/MoMo/ZaloPay ở chatbot), nhịp cập nhật 180 phút.

## 6. Kết quả kiểm thử

| Bộ kiểm thử | Kết quả |
|---|---|
| Ghép chéo & feed | 203/203 |
| Săn giá theo mã model | 59/59 |
| Bảng giá đại lý đối tác | 40/40 |
| Điều phối lịch | 21/21 |
| Mẫu hợp đồng (build-terms --check) | khớp |
| CI: backend, tiện ích, tìm kiếm, trình duyệt, Lighthouse | đạt |
| Triển khai GitHub Pages | đạt |

## 7. Cảnh báo về điện thoại

Khi giám sát phát hiện lỗi, Issue cảnh báo được **giao cho chủ kho mã** - GitHub gửi email và đẩy thông báo qua ứng dụng GitHub Mobile. Chỉ báo lại khi danh sách lỗi THAY ĐỔI (không lặp mỗi 30 phút); hết lỗi thì bình luận và tự đóng.

## 8. Trạng thái việc của chủ sở hữu (cập nhật 15/11/2026)

| Việc | Trạng thái |
|---|---|
| Triển khai lại Apps Script | **Xong** - Version 11 (15/11/2026 18:07), cùng URL; kiểm tra ?a=config trả về đủ thông tin công ty, bank_ready = true |
| Tạm gỡ tài khoản nhận tiền (16/11/2026) | **Đang tạm gỡ** - máy chủ Version 12, BANK_PAUSED = 1: trang thanh toán, email, hợp đồng không hiện STK / mã QR; khách vẫn đặt đơn, KK-MALL liên hệ gửi thông tin chuyển khoản. Số đã lưu được giữ nguyên. Mở lại: Quản trị - Hệ thống bỏ chọn "Tạm gỡ tài khoản nhận tiền", hoặc chạy hàm moLaiTaiKhoanNhanTien trong trình soạn thảo Apps Script |
| Thông báo nền tảng TMĐT | Đang làm - thủ tục 1.115417 (QĐ 1617/QĐ-BCT), DVC toàn trình, cơ quan: **Sở Công Thương Thành phố Hà Nội**, 3 ngày làm việc; chờ chủ sở hữu đăng nhập VNeID (tài khoản tổ chức) |
| Hotline + email CSKH | Chờ chủ sở hữu cấp (biểu mẫu thông báo TMĐT cũng cần) |
| Cài GitHub Mobile, bật thông báo | Chủ sở hữu (để nhận cảnh báo đẩy) |
| Gửi 3 thư nháp đối tác, biểu mẫu Synnex, xóa nhánh audit-tmp | Chủ sở hữu |
