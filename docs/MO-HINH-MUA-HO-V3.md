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


## BẢO MẬT v1.1 (24/10/2026)

- **Web:** CSP trên mọi trang (chỉ kết nối tới chính site + máy chủ Google Apps Script; cấm plugin, cấm đổi base URL, form chỉ gửi nội bộ), Referrer-Policy, trang quản trị noindex + no-referrer. Đã vá 2 lỗi XSS: tra đơn qua `?order=&phone=` (SĐT/mã đơn được chuẩn hóa, không nội suy vào JS) và link nguồn `javascript:` trong quản trị (chỉ cho phép https, lọc từ khâu thu thập feed). Mọi tham số trong onclick dùng JSON.stringify + escape.
- **Máy chủ (Apps Script v1.1.0):** OTP sinh từ nguồn ngẫu nhiên an toàn; quyền quản trị CHỈ cấp khi đăng nhập từ /admin (scope admin), phiên 12 giờ, mỗi lần đăng nhập quản trị gửi email cảnh báo; đăng nhập email quản trị ở cửa hàng chỉ là phiên thành viên. Chống dò mã đơn + SĐT: sai 8 lần/mã đơn hoặc 500 lần/giờ toàn hệ thống -> khóa 1 giờ (chủ đơn đã đăng nhập không bị ảnh hưởng). Bảo vệ hạn mức email: OTP tối đa 25/giờ, 10/ngày/email, tạm dừng OTP khi còn < 30 email/ngày; đơn hàng tối đa 40/giờ toàn hệ thống, 10/giờ mỗi SĐT/email. Lỗi nội bộ không lộ ra ngoài (ghi vào sheet Log).
- **GitHub Actions:** pin theo SHA commit (chống tấn công chuỗi cung ứng), workflow deploy không giữ credential; secret scanning + push protection đang bật.
- **Google Drive:** Sheet, thư mục backup, dự án Apps Script chỉ chủ sở hữu truy cập (đã kiểm tra quyền chia sẻ).
- **Kiểm thử:** 78 kiểm tra máy chủ + 28 kiểm tra trình duyệt (gồm thử XSS và vi phạm CSP) đạt; 0 vi phạm CSP trên trang SEO, pháp lý, 404, quản trị.
- **Chủ sở hữu cần tự bật:** xác minh 2 bước/passkey cho Google và GitHub; cân nhắc chuyển repo sang private (cần GitHub Pro để giữ Pages).

## TÌM KIẾM & CHẤT LƯỢNG DỮ LIỆU (26/10/2026)

- **Bộ máy KK-SEARCH** (`site/kk-search.js`, chạy trong Web Worker trên máy khách, không gửi truy vấn đi đâu): chỉ mục theo từ nguyên vẹn (hết lỗi "sac" khớp "sách"), trọng số trường (hãng > tên > nhóm > ngành) × IDF, chuẩn hóa số + đơn vị (55 inch, 9kg, 1.5HP), từ đồng nghĩa và viết tắt một chiều (dt, tv, ip, đh, laptop ↔ máy tính xách tay...), gõ dở, sửa lỗi gõ (samsng → samsung), hiểu giá ("dưới 5 triệu", "5-7tr", "tầm 10tr"), ưu tiên đúng nhóm hàng và máy chính hơn phụ kiện/đồ chơi, tự nới điều kiện khi 0 kết quả; gợi ý nhóm hàng, bộ lọc thương hiệu theo kết quả; sắp xếp "Phù hợp nhất", khi đổi sang sắp xếp giá chỉ giữ kết quả liên quan mạnh.
- **Đo chất lượng** (độ chính xác top-10): bộ 30 truy vấn chuẩn 57,8% → 93,3%, 0 truy vấn rỗng (cũ: 3); bộ 12 truy vấn kiểm chứng độc lập 48,9% → 81,8%. Tốc độ ~4 ms/truy vấn trên 20.500 mặt hàng.
- **Phân loại lại 308 SP xếp nhầm nhóm** (luật ưu tiên trong `collector/feeds.js`, công cụ `node collector/reclassify.js [--dry]`): TPCN "điều hòa kinh nguyệt/nội tiết" khỏi nhóm Máy lạnh, quạt điều hòa, chiếu điều hòa, bao da/túi/dán màn hình iPad-MacBook-laptop về đúng nhóm phụ kiện/túi; loại dịch vụ thu cũ (buyback) khỏi danh mục hàng hóa.
- **Giá:** gỡ 739 SP mô phỏng không nguồn + 864 trang SP mồ côi; "Bạn vừa xem", giỏ hàng, SP cùng loại luôn đồng bộ giá hiện hành; chặn giá nguồn > 2,5 lần giá niêm yết đã thu (lấy nhầm giá gạch) - SP tạm giữ ẩn giá ở mọi nơi kể cả dữ liệu Google.

## GIÁ THỰC TRẢ - LANDED COST (26/10/2026, backend v1.2.0)

- **Phát hiện:** giá trong datafeed các nguồn là giá niêm yết sản phẩm, CHƯA gồm phí vận chuyển. Sàn TMĐT (Tiki, Shopee, Lazada, TikTok, Sendo) thu ship 15-40k/đơn và chỉ miễn có điều kiện (Tiki: ≥149k giảm 15k, ≥299k giảm 30k, Freeship+ tối đa 50k); chuỗi bán lẻ (ĐMX, TGDĐ, FPT Shop, ĐM Chợ Lớn, CellphoneS ≥300k) giao miễn phí. Trước đây KK-MALL cam kết "đã gồm giao hàng" nên phí ship của nguồn ăn vào phí dịch vụ.
- **Xử lý:** `collector/landed.js` - giá vốn = giá niêm yết + dự phòng ship/phụ phí theo nguồn, theo ngưỡng giá đơn và hàng cồng kềnh (tủ lạnh, máy giặt, điều hòa, tivi, nội thất, xe...: 60k với sàn); nguồn ghi "Freeship" trong tên → 0. Giá bán = giá thực trả + phí dịch vụ theo khung (khung chọn theo giá thực trả). Chọn nguồn rẻ nhất theo giá thực trả, biên dung sai 5.000đ cũng so với giá thực trả. Kết quả: 11.228/20.561 SP (nguồn sàn) được cộng dự phòng 10-60k; 9.333 SP từ chuỗi bán lẻ giữ nguyên.
- **Tự hiệu chỉnh theo thực tế:** mỗi lệnh mua, quản trị nhập "trong đó ship/phụ phí"; backend `?a=shipstats&key=STATS_KEY` tổng hợp 90 ngày theo nguồn (n, trung bình, mức 75%); bộ thu thập nâng dự phòng lên mức 75% thực tế nếu cao hơn (từ 5 lệnh). Cần 2 GitHub Secret: `KK_BACKEND_URL`, `BACKEND_STATS_KEY` (lấy ở Admin → Hệ thống → Cấu hình vận hành). Ghi đè luật ship: Secret `SHIP_RULES` (JSON), dự phòng thêm theo %: `SHIP_SAFETY_PCT`.
- **Cảnh báo lỗ:** khi thực trả nguồn vượt tiền hàng đã thu quá phí dịch vụ của dòng hàng → email ngay cho quản trị. Thu dư (nguồn freeship thật) → quy trình hoàn khách hiện có.
- **Quản trị:** bảng so sánh tách cột Niêm yết NCC | Ship dự phòng | Giá thực trả | Khung phí | Phí DV | Giá bán; kế hoạch lệnh mua hiển thị niêm yết + ship = thực trả từng nguồn; nút "Xem chênh lệch ship theo nguồn".
- **Kiểm thử:** 84 kiểm tra máy chủ + 28 kiểm tra trình duyệt đạt; chạy thu thập thật (run 40268951999) và kiểm tra báo giá live: sách 34k niêm yết → thực trả 64k (ship 30k) → bán 82k (phí 18k).
