# KK-MALL Backend (Google Apps Script)

Máy chủ đơn hàng: đơn hàng, thành viên OTP, lệnh mua (PO), đổi trả - bảo hành (RMA), sổ kế toán thu hộ - chi hộ, hóa đơn phí dịch vụ.
Dữ liệu nằm trong Google Sheet của chủ sở hữu; sao lưu JSON hằng ngày vào Google Drive (2 nơi).

## Triển khai (1 lần)
1. script.google.com → Dự án mới → dán toàn bộ `Code.gs` → Lưu (tên: KK-MALL Backend).
2. Chọn hàm `setup` → Chạy → cấp quyền (Sheets, Drive, Gmail gửi thư, kết nối ngoài, trình kích hoạt).
3. Triển khai → Tùy chọn triển khai mới → Ứng dụng web: Thực thi với tư cách **Tôi**, Quyền truy cập **Bất kỳ ai** → Triển khai → chép URL `/exec`.
4. Ghi URL vào `site/config.js` (`window.KK_BACKEND`) → đẩy lên GitHub.
5. Quản trị → Hệ thống → Cấu hình vận hành: ngân hàng nhận tiền (VietQR), thông tin công ty, VAT, biên dung sai; chép Webhook URL vào SePay/Casso.

Biểu phí dịch vụ nằm trong Script Properties `PRICING_TIERS` (mặc định do `setup()` đặt), công khai tại điều khoản dịch vụ.
Cập nhật mã: dán bản mới → Triển khai → Quản lý triển khai → Sửa → Phiên bản mới (giữ nguyên URL).
