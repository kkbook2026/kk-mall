## CẬP NHẬT 23/10/2026 - MÔ HÌNH MUA HỘ (v3, đang chạy live)

**Máy chủ đơn hàng:** Google Apps Script "KK-MALL Backend" (tài khoản nguyenduydien75@gmail.com), Web app chạy dưới quyền chủ sở hữu, truy cập Anyone. URL `/exec` khai báo trong `site/config.js`. Mã nguồn: `backend/Code.gs` (repo), hướng dẫn: `backend/README.md`. Cập nhật mã: dán Code.gs mới → Lưu → Deploy → Manage deployments → ✏️ → New version (URL giữ nguyên).

**Dữ liệu - backup 2 nơi:** Google Sheet "KK-MALL Backend" (bản sống: Orders, PO, Members, Sessions, RMA, Ledger, Invoices, Warranty, Log) + bản JSON hằng ngày trong thư mục Google Drive (giữ 60 bản). Trigger: `hourly` (hủy đơn quá hạn chưa thanh toán) và `dailyBackup`.

**Giá & phí (công khai theo mô hình tách hóa đơn):** giá bán = giá gốc nhà cung cấp rẻ nhất + phí dịch vụ theo khung: gốc > 500.000đ → 32.000đ; 200.000-500.000đ → 26.000đ; < 200.000đ → 18.000đ (GitHub Secret `PRICING_TIERS`). Thu thập giá 3 giờ/lần (cron `17 */3 * * *`). Trả góp đã bỏ. Voucher chỉ giảm trên phí dịch vụ, tối đa 50% phí của đơn (`VOUCHER_FEE_CAP_PCT`).

**Luồng đơn:** khách đặt → VietQR (không COD) → đánh dấu đã thu (tay hoặc webhook SePay/Casso) → hệ thống tự lập **Lệnh mua (PO)** từng dòng, trang quản trị chọn sẵn nguồn rẻ nhất còn hàng đúng sản phẩm (ưu tiên nguồn xuất VAT khi khách cần) → nhân viên đặt 1 click (sao chép sẵn thông tin giao hàng + VAT của khách) → nhập mã đơn nguồn/vận đơn → tự đồng bộ trạng thái, email khách từng bước → giao xong tự lập nháp hóa đơn phí dịch vụ. Sàn TMĐT không có API mua hàng cho bên thứ ba nên bước đặt tại nguồn là bán tự động; nâng lên tự động hoàn toàn theo từng nhà cung cấp khi có hợp đồng B2B/API.

**Hóa đơn tách:** nhà cung cấp xuất HĐ GTGT tiền hàng trực tiếp cho khách; KK-MALL xuất HĐ GTGT riêng nội dung "Phí dịch vụ mua hộ và xử lý đơn hàng KK-MALL" (VAT 10%).

**Sổ kế toán tự động:** khách trả: Nợ 1121 / Có 3388 (tiền hàng thu hộ) + Có 5113 (phí trước thuế) + Có 33311 (VAT). Trả NCC: Nợ 3388 / Có 1121; bù trượt giá trong dung sai 5.000đ: Nợ 632. Hoàn khách: Nợ 3388 (+ 5213, 33311 nếu hoàn phí) / Có 1121. NCC hoàn tiền hàng trả lại: Nợ 1121 / Có 3388 (nhập ở tab Đổi trả khi bấm "NCC đã nhận"/"Đã hoàn").

**Đổi trả & bảo hành:** khách gửi yêu cầu kèm ảnh/video trên trang theo dõi đơn (đổi trả 7 ngày); bảo hành tự gửi thông tin trung tâm bảo hành chính hãng (38 hãng, chỉ nhóm điện tử - điện máy).

**Tài khoản:** đăng nhập không mật khẩu bằng mã OTP 6 số qua email (hết hạn 10 phút, tối đa 5 lần thử, băm SHA-256 + pepper), token phiên chỉ lưu dạng băm; quyền quản trị theo `ADMIN_EMAILS`.

**Quản trị (/admin):** thêm tab Lệnh mua, Đổi trả & BH, Sổ kế toán; bảng So sánh giá có cột "Giá gốc NCC rẻ nhất | Khung phí | Phí DV KK-MALL | Giá bán"; Doanh thu tách tiền hàng thu hộ (3388) và phí dịch vụ (5113). Tab Hệ thống → Cấu hình vận hành: ngân hàng VietQR, thông tin công ty, VAT, dung sai, ngày đổi trả, URL webhook.

**Kiểm thử 23/10/2026:** 67 kiểm tra máy chủ + 26 kiểm tra trình duyệt đạt; chạy thật trên máy chủ live một đơn đủ vòng đời (thanh toán → PO → đặt → giao → nháp HĐ phí → đổi trả → hoàn tiền → NCC hoàn) - sổ cân về 0. Hai đơn thử mã KK2610230CC36, KK261023FB65E (đã hoàn/hủy, ghi chú TEST).

**Còn chờ chủ sở hữu:** tài khoản ngân hàng nhận VietQR, thông tin pháp lý công ty (tên, MST, địa chỉ, hotline, số đăng ký Bộ Công Thương), đăng ký SePay để tự xác nhận thanh toán. Lưu ý: MailApp Gmail cá nhân giới hạn ~100 email/ngày; dữ liệu cá nhân lưu trên Google có thể là chuyển dữ liệu ra nước ngoài - cần hồ sơ đánh giá tác động.

---

