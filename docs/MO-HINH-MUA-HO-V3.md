## CẬP NHẬT 13/11/2026 - RÀ SOÁT GIÁ: GHÉP CHÉO NGUỒN, NẠP ĐỦ DATAFEED, HỎI GIÁ TRÊN SÀN

Chi tiết đầy đủ: `docs/RA-SOAT-GIA-13-11-2026.md`. Tóm tắt các thay đổi có hiệu lực từ 13/11/2026:

- **Nạp dữ liệu:** datafeed AccessTrade lấy bằng file tĩnh (`http://datafeed.accesstrade.me/<tên miền>.csv`, 1 yêu cầu/nhà bán, đủ 97.018 bản ghi còn sống thay vì 28.753); API AccessTrade (giới hạn 30 yêu cầu/phút) chỉ dùng để biết tuổi dữ liệu 1 lần/ngày và để hỏi giá TikTok Shop. Feed không cập nhật quá 45 ngày (Lazada, Sendo, Điện máy Chợ Lớn) bị bỏ.
- **Ghép chéo nguồn (`collector/match.js`):** cùng một mặt hàng ở nhiều nguồn được so giá với nhau theo mã model, thương hiệu, thông số, biến thể, màu, tình trạng. Offer ghép theo tên được đánh dấu trong quản trị và không cho bot tự đặt.
- **Chọn giá:** dải giá theo độ tin cậy; offer rẻ bất thường chờ duyệt tay; lịch sử niêm phong so với giá thực trả; giá mới lệch trên 50% được tự xác nhận sau 3 lần chạy trong 20 giờ (đặt lại mốc tham chiếu, không sửa lịch sử).
- **An toàn vận hành:** mất dữ liệu nguồn lớn thì DỪNG, giữ nguyên bản đã xuất bản tối đa 12 giờ; sản phẩm hết nguồn chỉ bị gỡ sau 8 lần chạy khỏe; trần 36.000 sản phẩm.
- **Hỏi giá trên sàn (`collector/search.js`, `search-crawl.yml`):** TikTok Shop qua API AccessTrade 25 truy vấn/phút; Shopee Affiliate Open API tự bật khi có `SHOPEE_APP_ID` + `SHOPEE_APP_SECRET`.
- **Bù lịch:** `retail-crawl.yml` và `search-crawl.yml` tự gọi `collect.yml` khi quá 3 giờ chưa chạy (lịch hẹn giờ của GitHub hay trễ/bỏ lượt).
- **Khung phí không đổi:** trên 500.000đ +32.000đ; 200.000 - 500.000đ +26.000đ; dưới 200.000đ +18.000đ.

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

## NGUỒN BÁN LẺ MỚI + TÌM BẰNG GIỌNG NÓI (26/10/2026)

- **3 nguồn mới:** Hoàng Hà Mobile (~9.000 trang), Phúc Anh (~15.000 SP), An Phát (~25.000 SP). Bot `collector/retail.js` (workflow "Retail price crawl", mỗi giờ, tối đa 45 phút) đọc sitemap + dữ liệu chuẩn schema.org trên trang sản phẩm công khai; tuân thủ robots.txt và Crawl-delay (An Phát 5 giây/trang, 2 trang còn lại 1,5 giây), tự dừng khi máy chủ báo bận, tự nhận dạng "KK-MALL-PriceBot" kèm trang giới thiệu `/bot.html`. Kết quả lưu GitHub Actions cache (không commit, không phình repo); bộ thu thập 3 giờ/lần đọc lại để định giá. Ước tính phủ toàn bộ ~1,5 ngày (An Phát chậm nhất do crawl-delay), sau đó làm mới xoay vòng.
- **Kiểm soát dữ liệu:** bỏ "liên hệ báo giá" (An Phát ghi giá 1đ), bỏ trang danh mục khai báo dạng Product, giải mã ký tự HTML, bỏ thương hiệu là tên cửa hàng; giá quá 7 ngày không dùng, giá cũ hơn 48 giờ cộng thêm dự phòng 1%. Phúc Anh luôn báo "còn hàng" → tồn kho thực xác nhận khi đặt lệnh mua.
- **Ship dự phòng theo chính sách công bố:** Hoàng Hà miễn phí toàn quốc (15k đơn < 300k, 30k hàng cồng kềnh); Phúc Anh miễn phí từ 500k nội thành HN → dự phòng 25-35k, cồng kềnh 60k; An Phát miễn phí theo bán kính quanh HN, 6.000đ/km ngoài bán kính → dự phòng 30-40k, cồng kềnh 80k. Nhóm PC & Linh kiện / Màn hình / Máy in chỉ tính cồng kềnh khi là máy bộ, màn ≥ 27 inch, máy in. Cả 3 nguồn xuất VAT (đã thêm vào danh sách ưu tiên khi khách cần hóa đơn).
- **Ghép chéo nguồn theo mã model** (vd QA55Q60C, LS32DG502EEXXV): cùng sản phẩm ở nhiều nơi được so giá trên 1 SKU thay vì tạo bản trùng; chỉ dùng mã duy nhất trong cùng nhóm hàng.
- **Lần chạy đầu (26/10):** +382 SP mới (PC & linh kiện, laptop, màn hình...), định giá đúng: ví dụ ThinkBook 14 G9 An Phát 31.990.000 + ship 30.000 + phí 32.000 = 32.052.000đ. Trần tổng SP từ nguồn nâng lên 80.000 (biến `FEED_MAX_TOTAL`).
- **Tìm bằng giọng nói:** nói xong tự tìm, hiển thị chữ ngay khi đang nói, nút micro nhấp nháy đỏ khi nghe (bấm lần nữa để dừng), báo lỗi cụ thể (chưa cấp quyền micro + cách bật, không nghe thấy, mất mạng, không có micro), trình duyệt không hỗ trợ thì gợi ý bàn phím giọng nói của điện thoại; hiểu số đọc bằng chữ ("dưới năm triệu", "từ mười lăm đến hai mươi triệu", "bảy triệu rưỡi", "năm trăm nghìn"), phân biệt "tầm/từ" với "tám/tư".
- **Theo dõi:** repo git ~650MB, tăng theo số SP; khi vượt ~2GB nên chuyển dữ liệu sản phẩm ra khỏi git (lưu trữ ngoài + build lúc deploy).

## THANH TOÁN & BẢO VỆ TÀI KHOẢN NHẬN TIỀN (26/10/2026, backend v1.2.2 - Version 7)
- **Sự cố đơn KK261026A7B4B (87.200đ):** đơn tạo 15:39, email có QR ACB; 15:44 một lần Lưu "Cấu hình vận hành" từ form trống đã xóa STK → `bank_ready=false`. Chưa có webhook ngân hàng nên tiền vào không tự xác nhận → đơn vẫn "Chờ thanh toán", chưa tạo PO.
- **Luồng đúng:** tiền vào → (webhook SePay/Casso tự động, hoặc quản trị bấm "💰 Đã nhận tiền") → hệ thống tạo PO theo nguồn có giá thực trả thấp nhất → nhân viên đặt tại NCC theo PO (sàn không có API cho người mua) → nhập mã đơn NCC/vận đơn.
- **Đã sửa:** server giữ nguyên BANK_ACC/BANK_NAME/BANK_BIN khi form gửi giá trị trống (nhật ký ghi "GIU NGUYEN"); trang quản trị hỏi xác nhận khi ô STK trống; khách có nút "✅ Tôi đã chuyển khoản" (giới hạn 3 lần/giờ) → email báo quản trị + huy hiệu "💸 Khách báo đã CK" trong danh sách đơn.
- **Khuyến nghị:** kết nối SePay với tài khoản ACB, dán Webhook URL có sẵn trong Admin → đơn tự xác nhận và tự lập PO trong vài giây.

## TỰ ĐỒNG BỘ LỆNH MUA TỪ EMAIL NGUỒN (26/10/2026, backend v1.3.0)
- **Quy trình đặt tại nguồn:** mở trang nguồn → Mua ngay → địa chỉ nhận = tên + SĐT + địa chỉ của khách KK-MALL → thanh toán trước bằng phương thức đã lưu (KHÔNG chọn tiền mặt khi nhận hàng) → bấm Đặt hàng. Claude có thể làm hộ qua Chrome tới bước thanh toán, chủ sở hữu duyệt tổng tiền rồi mới bấm Đặt hàng (sàn không có API mua hàng, thanh toán cần xác thực ngân hàng).
- **Tự động sau khi đặt** (hàm `mailSync`, 15 phút/lần, đọc hộp thư chủ sở hữu với quyền CHỈ ĐỌC `gmail.readonly` qua dịch vụ Gmail API nâng cao):
  - "Xác nhận đơn hàng #ID" (noreply@tiki.vn): gắn mã đơn Tiki vào lệnh mua "Cần đặt" khi SĐT người nhận trùng khách đã thanh toán và tên SP khớp ≥ 60%; thực trả = tổng giá trị đơn Tiki (chia theo dòng nếu nhiều SP), ship thực = phí vận chuyển - giảm giá vận chuyển → sổ kế toán, bù trượt giá/phải hoàn khách, email "đã đặt tại nhà cung cấp".
  - "Đang vận chuyển": lệnh mua → Đang giao, lưu đơn vị (TED) + dự kiến giao, email khách; trang theo dõi đơn hiển thị dự kiến giao.
  - "Giao thành công": lệnh mua + đơn → Đã giao, tự lập nháp hóa đơn phí dịch vụ, email khách.
  - Cảnh báo quản trị: đơn nguồn để COD cho khách KK-MALL, nguồn hủy đơn, chưa thanh toán tại nguồn, SĐT khớp khách nhưng sai sản phẩm. Đơn Tiki cá nhân (SĐT khác khách) bị bỏ qua.
- **Quản trị → Lệnh mua:** dòng trạng thái "Tự đồng bộ từ email Tiki" + nhật ký 10 sự kiện gần nhất + nút "📧 Đồng bộ email nguồn ngay"; thẻ lệnh mua hiện "🤖 tự gắn từ email nguồn", dự kiến giao, số phải hoàn khách.
- **Manifest** `backend/appsscript.json`: khai báo quyền tối thiểu (spreadsheets, drive, script.send_mail, script.external_request, script.scriptapp, gmail.readonly). Cài lịch: chạy `installMailSync` trong trình soạn thảo (lần đầu cần chủ sở hữu cấp quyền Gmail chỉ đọc).
- **Mở rộng nguồn khác:** thêm vào `MAIL_SOURCES` + bộ đọc mẫu email tương ứng (Shopee, Lazada...).
- **Kiểm thử:** 114 kiểm tra máy chủ (thêm 24 cho đồng bộ email, dùng mẫu email Tiki thật) + 28 kiểm tra trình duyệt đạt.

## BOT ĐẶT HÀNG TỰ ĐỘNG - TIỆN ÍCH CHROME "KK-MALL AUTO ORDER" (26/10/2026, backend v1.4.0, giai đoạn 1: Tiki)
- **Vì sao là tiện ích Chrome:** sàn không có API mua hàng cho bên thứ ba và thanh toán cần OTP ngân hàng, nên bot chạy trên Chrome của chủ sở hữu (đã đăng nhập Tiki, thẻ đã lưu sẵn). Chủ sở hữu chỉ nhập OTP.
- **Luồng:** tiện ích hỏi máy chủ `bot.queue` (khóa bot riêng) → giải mã gói dữ liệu quản trị (`data.enc`, khóa quản trị nhập trong tiện ích) lấy link nguồn → chọn Tiki rẻ nhất trong biên dung sai (đơn cần hóa đơn GTGT và nguồn chưa có bot thì để đặt tay) → `claim` (khóa lệnh mua, chống 2 phiên) → mở trang SP (kiểm tra giá/tồn qua API sản phẩm Tiki) → Mua ngay → chọn địa chỉ khách có sẵn trong sổ địa chỉ hoặc thêm mới (tự tách Tỉnh/Quận/Phường theo danh mục Tiki; thiếu thì dừng chờ chọn tay) → chọn thẻ đã lưu (không bao giờ COD) → đối chiếu SP, số lượng, địa chỉ → `paying` (máy chủ chỉ cho phép khi tổng ≤ tiền hàng đã thu + biên dung sai, tiện ích thêm trần mỗi đơn) → bấm Đặt hàng → thông báo "Nhập OTP" → đọc mã đơn Tiki → `done` (lệnh mua "Đã đặt", sổ kế toán, phải hoàn khách nếu rẻ hơn). Email xác nhận Tiki là lớp dự phòng tự gắn mã đơn.
- **Chống mua trùng:** đã qua `paying` thì không bao giờ tự đặt lại (trạng thái `pay_failed` / `paying_unknown` cần quản trị kiểm tra rồi bấm "Cho bot đặt lại"); lỗi trước khi đặt (`failed`) chỉ chạy lại khi bấm "Thử lại".
- **Quản trị:** Hệ thống → "🤖 Bot đặt hàng tự động": tải tiện ích (`/admin/ext/kk-auto-order.zip`), tạo/đổi khóa bot (chỉ lưu bản băm, hiện 1 lần, email cảnh báo), lần hoạt động cuối; Lệnh mua: nhãn trạng thái bot từng lệnh.
- **Form đặt hàng:** bắt buộc địa chỉ đủ 3 cấp (số nhà + đường, Phường/Xã, Quận/Huyện, Tỉnh/TP) để bot điền chính xác.
- **Mã nguồn:** `extension/kk-auto-order/` (MV3: background.js điều phối, tiki.js thao tác trang, lib.js tách địa chỉ + kế hoạch nguồn, popup). Kiểm thử: 136 kiểm tra máy chủ, 15 kiểm tra tách địa chỉ, 28 kiểm tra trình duyệt; chạy thử thật trên Tiki tới bước xin phép thanh toán (sản phẩm 39.200đ, ship 16.500đ, tổng 55.700đ, thẻ đã lưu) - máy chủ giả lập từ chối nên không đặt.
- **Mở rộng:** thêm nguồn = thêm bộ thao tác trang (vd `shopee.js`) + khai báo `BOT_SOURCES` ở máy chủ.

## SỬA ĐĂNG NHẬP OTP (26/10/2026, backend v1.4.1 - Version 8)
- **Sự cố:** quản trị bị báo "thao tác quá nhanh" vì hôm đó đã gửi đủ 10 mã (giới hạn 10 mã/ngày/email), và mỗi lần bấm "Gửi mã" làm mã trước mất hiệu lực nên dễ bấm lặp.
- **Đã sửa:** bấm "Gửi mã" lần nữa trong 60 giây không gửi mã mới (mã vừa gửi vẫn dùng được); mã của email trước còn hạn vẫn đăng nhập được; giới hạn theo cửa sổ cố định (quản trị 6 mã/15 phút, 40 mã/ngày; khách 3 mã/15 phút, 10 mã/ngày), báo rõ số phút phải chờ, không còn khóa kéo dài; nút "Gửi mã" đếm ngược 60 giây.
- **Đồng bộ email Tiki tạm tắt:** để triển khai ngay mà không chờ cấp quyền, manifest đang dùng 5 quyền cũ (`backend/appsscript.json`). Khi bật lại: thay bằng `backend/appsscript.gmail.json` (thêm dịch vụ Gmail + `gmail.readonly`), chủ sở hữu cấp quyền, chạy `installMailSync`, triển khai phiên bản mới. Bot đặt hàng tự báo mã đơn nên không phụ thuộc phần này.

## RÀ SOÁT ĐỘC LẬP + GIA CỐ TIỀN/BẢO MẬT + TÍNH NĂNG THIẾT YẾU (31/10/2026, backend v1.5.0)
**Rà soát độc lập** (agent riêng, chứng minh bằng script) phát hiện 15 lỗi; đã sửa toàn bộ:
- **Tiền:** mã đơn 8 ký tự hex + kiểm tra trùng (trước 5 ký tự, ~82%/năm trùng ở 100 đơn/ngày → tiền vào nhầm đơn); webhook nhận cả mã cũ/mới; ghi Nợ 1121 đúng số thực nhận (chuyển dư không làm lệch sổ); chuyển trùng / tiền vào đơn đã hủy → **không** kích hoạt lại đơn, vào danh sách cần hoàn + email quản trị; ngân hàng gửi lại cùng giao dịch → bỏ qua (theo mã GD, không có mã thì theo nội dung+số tiền); tiền vào không chứa mã đơn → email đối soát.
- **Lệnh mua:** bảng chuyển trạng thái hợp lệ (to_order→ordered→shipped→delivered; hủy chỉ khi chưa đặt) → hết ghi chi NCC 2 lần khi bấm đúp; hủy lệnh mua → tự ghi hoàn 100% dòng hàng (tiền hàng + phí sau giảm) + email khách.
- **Hoàn tiền:** trần theo số đã nhận; tách 2 quỹ (tiền hàng/chuyển dư → 3388, phí → 5213/33311) nên hoàn 2 lần vẫn đảo đúng doanh thu; NCC hoàn hàng trả lại nhập **tổng lũy kế** (không cộng đôi), yêu cầu đã kết thúc không đổi trạng thái được.
- **Đồng thời:** tự hủy đơn quá hạn chạy trong khóa + đọc lại đơn (không ghi đè thanh toán vừa vào); OTP xác thực trong khóa (không vượt 5 lần thử bằng gửi song song); bot "done" chỉ nhận khi đã được duyệt "paying" cùng phiên, dùng đúng số tiền đã duyệt.
- **Bảo mật:** `update_` bảo vệ lại mọi ô (Sheets bỏ dấu ' khi đọc → trước đây công thức độc hại sống lại khi cập nhật đơn); CSV xuất Excel chặn công thức; khóa thống kê ship dẫn xuất PBKDF2-300k (trước SHA-256 nhanh → dò được khóa quản trị), gửi trong thân POST; email nguồn phải qua DKIM/DMARC mới được tin; giới hạn tra cứu toàn hệ thống nâng 5.000/giờ (mã 8 hex không dò được), OTP quản trị không bị chặn bởi spam OTP khách; báo giá "fresh" tối đa 240/phút (chống cạn hạn mức UrlFetch); TTL CacheService ≤ 6 giờ.
- **Bộ thu thập:** đẩy dữ liệu bằng `--force-with-lease`, nếu main vừa có commit mã nguồn thì đặt dữ liệu lên trên (trước đây `push -f` có thể xóa commit mã nguồn đẩy cùng lúc).
- **Lỗi thật trên web:** link "Theo dõi đơn hàng" trong email đôi khi mở ra form tra cứu trống (chạy trước khi kk-backend.js nạp) → chờ nạp xong.

**Trung thực dữ liệu / pháp lý:** gỡ "⭐ 4.6" gán sẵn cho mọi SP và "Còn 50 suất" giả; chỉ hiện sao khi có đánh giá thật, dữ liệu có cấu trúc (aggregateRating) dùng điểm thật; bỏ đánh giá lưu trên trình duyệt (chỉ người viết thấy); thay MST "0000000000", hotline "1900 0000", email không tồn tại bằng "đang cập nhật" - **chủ sở hữu cần nhập thông tin doanh nghiệp thật tại Admin → Hệ thống** (website tự hiển thị).

**Tính năng mới:**
- **Đánh giá từ người đã nhận hàng** (sheet Reviews): chỉ đơn đã giao, 1 đánh giá/SP/đơn, tên ẩn danh, nội dung có link/SĐT/email/từ thô tục → chờ duyệt; tab "⭐ Đánh giá" để duyệt/ẩn; bộ thu thập lấy thống kê công khai (`reviews.stats`) gắn điểm thật vào SP/SEO.
- **Quy trình hoàn tiền:** khách khai TK nhận hoàn trên trang theo dõi đơn (che số TK khi hiển thị) → Admin → Đơn hàng → "💸 Cần hoàn tiền" có VietQR đúng TK, đúng số tiền, nội dung "HOAN <mã đơn>" → bấm "Đã chuyển hoàn" (nhập mã GD) → ghi sổ + email khách.
- **Nhắc thanh toán** 1 lần sau 2 giờ (kèm VietQR); email tự hủy ghi rõ đã chuyển khoản sẽ được hoàn.
- **Tự kiểm toán hằng ngày** (sau sao lưu) + nút "🧾 Kiểm toán ngay": sổ cái từng đơn, đơn đã thu thiếu lệnh mua, lệnh mua/bot/hoàn tiền treo, hạn mức email → email quản trị khi có vấn đề.
- **Giám sát 30 phút** (`.github/workflows/monitor.yml` + `collector/monitor.js`): trang chủ + CSP, độ mới dữ liệu giá, máy chủ (phiên bản, TK VietQR sẵn sàng, báo giá thật, API đánh giá), trang quản trị, gói dữ liệu, gói tiện ích, sitemap, trang pháp lý, chứng chỉ HTTPS → lỗi tự mở Issue GitHub (email chủ repo), hết lỗi tự đóng.
- **Quyền dữ liệu cá nhân (Luật BVDLCN 2025):** thành viên tự tải toàn bộ dữ liệu (JSON) và tự xóa tài khoản (xóa hồ sơ + thu hồi phiên; chứng từ đơn giữ theo Luật Kế toán).

**Kiểm thử:** 174 kiểm tra máy chủ + 38 kiểm tra trình duyệt (thêm: địa chỉ 3 cấp, đánh giá thật qua giao diện, hoàn tiền khách→quản trị→VietQR, tự kiểm toán, khóa PBKDF2 trình duyệt = bộ thu thập) + 15 kiểm tra tiện ích; chạy lại 8 script chứng minh lỗi của rà soát → đều đã hết.
- **Triển khai 31/10/2026:** máy chủ Version 9 (v1.5.0) chạy thật; website + bộ thu thập + giám sát đã lên `main`. Kiểm tra trên hệ thống thật: giám sát 30 phút đạt toàn bộ; 28.397 SP không còn sao/tồn kho giả (điểm 0 cho tới khi có đánh giá thật); trang SP tải đánh giá từ máy chủ; link theo dõi đơn trong email mở đúng đơn; bộ thu thập đặt commit dữ liệu lên trên commit mã nguồn (không ghi đè).

## TÌM KIẾM KK-SEARCH 2 - DỄ TÌM NHẤT, CÓ ĐO LƯỜNG (31/10/2026, kk-search 2.0.0, backend v1.6.0)
**Mục tiêu:** khách gõ thế nào cũng ra đúng hàng (có dấu / không dấu / viết tắt / gõ sai / gõ dính chữ / tiếng Anh / đơn vị), hiểu loại hàng khách cần, không bao giờ trả trang trống vô ích.

**Bộ máy (chạy trong Web Worker trên máy khách, không gửi truy vấn đi đâu, ~4 ms/truy vấn, dựng chỉ mục ~1,1 giây như bản cũ):**
- **Hiểu dấu khi khách có gõ dấu:** "giày" ≠ "giấy", "đèn" ≠ "đen", "bàn là" ≠ "bản lần"; không phân biệt kiểu bỏ dấu (hoà = hòa). Không gõ dấu vẫn tìm bình thường.
- **Hiểu LOẠI HÀNG (từ chính của câu):** sản phẩm có tên bắt đầu bằng đúng loại hàng xếp trước (bỏ qua chữ đệm Combo/Bộ/Set, tên hãng); đẩy phụ kiện, linh kiện ("yên/đèn/mũ xe đạp", remote điều hòa, ốp lưng) xuống khi khách không tìm phụ kiện; khi khách tìm chính phụ kiện ("ốp lưng", "giá treo xe đạp", "pin dự phòng") thì không bị phạt.
- **Cụm từ tự học từ danh mục** (2.100+ cụm: "đồng hồ", "dây da", "chạy bộ", "cửa ngang", "type c") + đồng nghĩa 2 chiều (bình nóng lạnh = máy nước nóng, ấm siêu tốc, tai phone, gaming chair, hair dryer, projector...) + mở rộng 1 chiều (ổ cứng → SSD/HDD, đồ chơi → lego/xếp hình) + tương đương đơn vị (12000BTU = 1.5HP = "1 ngựa rưỡi", 1.0HP = 1HP, 12.000 BTU, 1TB = 1000GB).
- **Gõ lỗi:** dính chữ ("noichien", "maylocnuoc", "laptopdell"), sót phím Telex/VNI ("tur lanh", "tu3 lanh"), sai chính tả (samsng, tivj, gamng); không "sửa" tên thật danh mục chưa có (LEGO, Nike...) thành từ khác.
- **Nói thật khi không có hàng:** loại hàng khách cần không có trong danh mục → báo "KK-MALL chưa có mặt hàng 'bàn là'" (không trả hàng khác loại); thiếu thuộc tính → hiện hàng cùng loại gần đúng + ghi rõ đã bỏ qua từ nào; ít hàng khớp đủ (vd 1 điện thoại + vài ốp lưng) → bổ sung hàng cùng loại, cùng hãng, chỉ nới thuộc tính/model, xếp trước phụ kiện. "mini/nhỏ gọn" mà không có đúng chữ → ưu tiên loại nhỏ (giá thấp trong cùng loại).
- **Bộ lọc tự sinh theo kết quả:** RAM / Bộ nhớ trong / Kích thước / Công suất lạnh / Khối lượng / Dung lượng pin...; khoảng giá theo phân vị thực tế của kết quả; danh mục; thương hiệu thật (lọc nhiễu "Sandal", "ATTP"... từ dữ liệu nguồn).

**Giao diện ô tìm kiếm:** gợi ý hoàn thành cụm từ CÓ DẤU khi gõ không dấu ("tu lanh s" → "tủ lạnh samsung · 78 SP"), chip danh mục + thương hiệu (bấm để tìm trong đó), sản phẩm có tô đậm chữ khớp, "Xem tất cả N kết quả"; phím ↑/↓/Enter/Esc, chuẩn ARIA combobox; ô trống → "Tìm gần đây" (lưu trên máy, xóa từng mục) + "Mọi người hay tìm"; URL `?q=` chia sẻ được; điện thoại: Enter ẩn bàn phím.

**Tìm không ra → dữ liệu để bổ sung nguồn (ẩn danh):** từ khóa 0 kết quả / chỉ gần đúng và nút "🙋 Nhờ KK-MALL tìm nguồn hàng này" gửi `search.miss` (chỉ cụm từ; bỏ qua nếu có SĐT, email, link; trần 400 lượt/giờ) → đệm, gộp vào sheet **SearchMiss** mỗi giờ → Admin tab **"🔎 Tìm không ra"** (lọc loại, thử tìm, chép, xuất CSV).

**Đo lường (nDCG@10 - chấm điểm phân cấp 2/1/0, 3 bộ truy vấn người mua thật):**
| Bộ đánh giá | KK-SEARCH 1.1 | KK-SEARCH 2.0 |
|---|---|---|
| 110 truy vấn (55 chỉnh + 55 kiểm tra) - phần kiểm tra | 84,3% | 94,3% |
| 32 truy vấn holdout (đã dùng để sửa lỗi tổng quát) | 74,5% | 85,3% |
| 30 truy vấn viết "mù" cuối cùng - lần chạy đầu | 90,9% | 92,0% |
| ... sau 3 sửa lỗi tổng quát (từ khóa tên riêng, "mini", nhận nhầm "Loa" là thương hiệu) | | 94,8% |
| Truy vấn trả 0 kết quả (110 truy vấn) | 5 | 1 (bàn là - danh mục thật sự không có) |

**Kiểm thử:** 181 kiểm tra máy chủ (thêm 7: ghi nhận ẩn danh, lọc dữ liệu cá nhân, trần lượt, quyền quản trị, chống chèn công thức, gộp hằng giờ), 38 kiểm tra trình duyệt toàn trang + 27 kiểm tra trình duyệt riêng ô tìm kiếm (gợi ý, dấu, phím, bộ lọc thuộc tính/giá/danh mục/thương hiệu, 0 kết quả, liên kết, điện thoại 390px, không lỗi JS/CSP). Giám sát 30 phút kiểm tra thêm phiên bản bộ máy tìm kiếm.
- **Triển khai 31/10/2026:** website (KK-SEARCH 2.0.0) đã chạy thật trên www.kk-mall.com - kiểm tra thật: liên kết `?q=tu lanh samsung` ra 84 SP đúng + bộ lọc khoảng giá, gõ "dieu hoa 1 ngua" gợi ý đúng điều hòa 1 HP; giám sát 30 phút đạt (gồm kiểm tra phiên bản bộ máy tìm kiếm). Máy chủ v1.6.0 (ghi nhận "tìm không ra") **đã lưu trong trình soạn thảo Apps Script, chờ chủ sở hữu bấm triển khai Version 10** (Deploy → Manage deployments → ✏️ → New version); trước khi triển khai, website tự bỏ qua lệnh ghi nhận, không ảnh hưởng khách.

## NGHIỆM THU THEO VAI TRÒ (31/10/2026)
- 6 vai trò tự tạo (quản trị, thành viên A, doanh nghiệp B, khách vãng lai C, khách D, bot đặt hàng) đi trọn vòng đời đơn trên bản sao dùng đúng mã nguồn đang chạy: **73/73** kịch bản; tổng các bộ tự động **336/336**. Chi tiết: `docs/BAO-CAO-NGHIEM-THU-31-10-2026.md`.
- Sửa 2 lỗi thật: không cho đánh giá dòng hàng đã hủy/hoàn (nguồn hết hàng) dù đơn đã giao dòng khác (máy chủ - có hiệu lực khi triển khai Version 10); ô ship/phụ phí trong form đặt lệnh mua hiện NaN (quản trị - đã chạy thật).

## TỐI ƯU TOÀN DIỆN (04/11/2026, backend v1.7.0, tiện ích 1.1.0)

**Hiệu năng web (đo Lighthouse di động trên bản tĩnh cục bộ, cùng điều kiện trước/sau):** điểm hiệu năng 39 → 98; LCP 28,5 s → 1,7 s; thời gian chặn luồng chính (TBT) 4.780 ms → 140 ms; luồng chính 8,9 s → 2,9 s; DOM 3.093 → 1.030 phần tử; tiếp cận 94 → 96 (0 vi phạm axe WCAG 2.1 AA trên máy tính và điện thoại); SEO 92 → 100.
- **Gói danh mục 5 MB không còn qua luồng chính:** Web Worker tự tải, phân tích và lưu `catalog-pack.json` vào IndexedDB (khóa theo `packV`/`lastSync`); lần mở sau không tải lại (0 yêu cầu mạng, sẵn sàng ~1,1 s). Bỏ hẳn `localStorage.kk_pack` (5 MB, hay vượt hạn mức). Luồng chính nhận hàng qua `window.kkPackRows()` / `kkPackRowsBy(skus)`; `demo-shim.js` dựng `lite` một lần thay vì mỗi yêu cầu.
- **Kệ hàng trang chủ dựng dần:** 3 kệ đầu ngay, phần còn lại khi cuộn tới (IntersectionObserver, biên 900 px).
- **Font Google tải không chặn render** (preload → stylesheet, swap); `kk-backend.js` tải `defer`; ảnh thẻ sản phẩm có `width/height`, `decoding="async"`, `loading="lazy"`; logo có kích thước.
- **Tiếp cận:** tương phản AA (`--ok` #047857, `--cta` #C2410C), cỡ chữ tối thiểu 12 px, thứ tự tiêu đề h1→h2→h3, mọi liên kết có `href` (bot thu thập + bàn phím), vùng chạm ≥ 24 px cho liên kết ưu đãi.
- **PWA:** `manifest.webmanifest` (icon 192/512 + maskable sinh từ logo), `theme-color`, `sw.js` thận trọng (điều hướng: mạng trước, mất mạng → bản lưu → `offline.html`; dữ liệu sản phẩm/ngành/meta: stale-while-revalidate; ảnh/js/css: cache có trần; không cache tài nguyên ngoài, `catalog-pack`, yêu cầu `no-store`, `config.js`, sổ cái). Giám sát 30 phút kiểm tra thêm 4 tài nguyên PWA.
- **Trang SEO tĩnh:** `speculationrules` prefetch khi di chuột (p/c/n), `theme-color`, manifest, ảnh sản phẩm có kích thước + `fetchpriority="high"`, CTA đủ tương phản.

**Máy chủ v1.7.0 - hành lang tự động (Giai đoạn 0 của kiến trúc tự động đặt hàng):**
- `POLICY_JSON` (Script Properties, sửa tại Quản trị → Hệ thống → Chính sách tự động) ghi đè `POLICY_DEFAULT`: tự đặt ≤ 5 triệu, 5-20 triệu bot làm và chủ sở hữu duyệt OTP, > 20 triệu chờ người; trần ngày 30 triệu, 10 lệnh/giờ, khung giờ 07-22, dung sai 5.000 đ, nguồn cho phép, đơn VAT mặc định đặt tay, khách mới > 10 triệu chờ người, trần mỗi giao dịch 5 triệu. `policyEval_` trả `auto` / `otp` / `hold` + mã lý do (`OVER_AUTO_CAP`, `DAILY_CAP`, `HOURLY_CAP`, `OUT_OF_HOURS`, `SOURCE_NOT_ALLOWED`, `VAT_NEEDS_B2B`, `OVER_CAP`, `QUOTE_STALE`, `NEW_CUSTOMER_HIGH_VALUE`, `ADDRESS_INCOMPLETE`, `AUTONOMY_OFF`). Lệnh `hold` hiện "⏸ Chờ người duyệt" trong Quản trị, email ngay, nhắc gộp sau 4 giờ, kiểm toán hằng ngày liệt kê.
- Máy chủ là nơi quyết định cuối: `claim` chạy `policyEval_` (kèm `offer_total`, khách mới), `paying` kiểm tra trần ngày (`botDaySpent_`), trần giờ (`rateFixed_`), trần mỗi giao dịch; chính sách có chữ ký `policy_sig` - tiện ích gửi kèm, lệch là `POLICY_STALE`.
- **Chữ ký thông điệp bot:** HMAC-SHA256 (khóa MAC dẫn xuất từ khóa bot, máy chủ không lưu khóa bot) trên `ts + nonce + sha256(JSON chuẩn hóa)`; lệch giờ > 5 phút hoặc nonce lặp trong 10 phút → 401. Tương thích: máy chủ chấp nhận thông điệp không ký cho tới khi bật `BOT_REQUIRE_SIG=1`.
- **Công tắc dừng** `AUTONOMY_ENABLED` (nút "🛑 Dừng mọi bot ngay"), **tự dừng** sau 3 lệnh lỗi liên tiếp (email), bật lại tại Quản trị. **Heartbeat:** có lệnh chờ trong giờ làm việc mà bot không kết nối > 30 phút → email (tối đa 1 lần/6 giờ).
- Tiện ích 1.1.0: ký mọi thông điệp, đọc chính sách từ `bot.queue`, lệnh ngoài hành lang hiện "Chờ kiểm tra" kèm lý do, trần mỗi giao dịch theo chính sách, chờ khi máy chủ tắt tự động.
- **Kiểm thử tự động (GitHub Actions `test.yml`, chạy khi đẩy mã nguồn):** 47 kiểm tra máy chủ trên bộ giả lập Apps Script (`tests/backend/harness.js`, không cần triển khai), 13 kiểm tra tiện ích (`tests/extension/lib.test.js`), đánh giá tìm kiếm nDCG@10, kiểm tra cú pháp toàn bộ JS/JSON.
- **Triển khai máy chủ (chủ sở hữu):** dán `backend/Code.gs` v1.7.0 → Deploy → New version (Version 11). Sau đó: tải tiện ích 1.1.0 (gói zip mới), rồi bật "Bắt buộc chữ ký bot".

**Kiểm tra sau triển khai 04/11 (13:10 UTC):** www.kk-mall.com đã nhận bản tối ưu (service worker hoạt động, manifest/offline/icon 200, IndexedDB giữ 28.913 dòng, lần mở sau 0 yêu cầu tải gói, tìm "tủ lạnh samsung" 81 SP, 0 lỗi JS). **Máy chủ live vẫn là 1.5.0** (`?a=health`): v1.6.0 và v1.7.0 chưa được triển khai - chủ sở hữu cần dán Code.gs và tạo phiên bản mới (xem `docs/TONG-KET-04-11-2026.xlsx`, sheet "Hướng dẫn triển khai").

**Khôi phục lịch sử mã nguồn (04/11):** bộ thu thập chạy `git commit --amend` trên bản sao nông 1 commit (actions/checkout mặc định) → commit dữ liệu thành commit mồ côi, `push --force-with-lease` xóa toàn bộ lịch sử `main` sau mỗi đợt đẩy mã nguồn (đã xảy ra 22/10, 23/10, 24/10, 26/10, 31/10, 02/11). Đã tìm lại 6 đoạn lịch sử từ nhật ký sự kiện GitHub và lưu ở các nhánh `lich-su-1-den-22-10` … `lich-su-6-den-02-11` (69 commit); `collect.yml` sửa `fetch-depth: 2` và chỉ amend khi còn biết commit cha. Nối lại thành một nhánh liên tục cần ghi đè `main` một lần - chờ chủ sở hữu quyết định.

**Tổng kết:** `docs/TONG-KET-04-11-2026.xlsx` - cập nhật 04/11 21:30: 57 việc đã làm (22/10 → 04/11), 33 việc cần làm theo ưu tiên, 24 chỉ số trước/sau, hướng dẫn triển khai 8 bước, 54 commit mã nguồn.

## MÁY CHỦ v1.8.0 - CHUỖI BĂM, XÁC MINH WEBHOOK, SLA NGOẠI LỆ (04/11/2026, chưa triển khai - gộp cùng 1.6.0/1.7.0 khi dán Code.gs)

- **Chuỗi băm nhật ký tiền & trạng thái** (sheet `Chain`): mọi bút toán sổ cái, đổi trạng thái đơn, lệnh mua (đặt/giao/hủy) được nối vào chuỗi SHA-256 `hash_n = sha256(prev | seq | at | kind | ref | sha256(canon(payload)))`; đầu chuỗi lưu `CHAIN_HEAD`. Bút toán băm theo dạng chuẩn hóa (`ledgerDigest_`) nên kiểm chứng lại được dù Sheets đổi kiểu ô. `chainVerify_` tính lại toàn bộ chuỗi + đối chiếu từng dòng sổ cái (sửa/xóa/chèn 1 dòng là lộ) - chạy trong tự kiểm toán hằng ngày (mức cao) và nút "Kiểm chứng toàn bộ chuỗi" ở Quản trị → Hệ thống. Đầu chuỗi công khai `?a=chainhead` (chỉ seq/hash/at); bộ thu thập neo vào `meta.json` (`orderChain`) mỗi lần xuất bản - bằng chứng thời điểm không cần tin KK-MALL.
- **Xác minh webhook qua API SePay** (lớp 2, `SEPAY_API_TOKEN` nhập tại Quản trị → Hệ thống, chỉ ghi không hiển thị): mỗi giao dịch webhook được gọi lại `my.sepay.vn/userapi/transactions/details/{id}` để đối chiếu số tiền và nội dung; API lỗi / không khớp / thiếu id → **không ghi nhận** (fail-closed) + email quản trị 1 lần/6 giờ. Chưa đặt token → giữ cách cũ (khóa trong URL).
- **SLA ngoại lệ**: lệnh `hold` quá `holds.escalate_hours` (8 giờ) → email "🚨 KHẨN" (1 lần/8 giờ); `holds.auto_cancel = true` (mặc định tắt) → quá `cancel_refund_hours` (24 giờ) tự hủy dòng hàng qua `poUpdate_` (ghi hoàn 100% dòng, email khách, nối chuỗi băm). Nhắc gộp 4 giờ giữ nguyên.
- **Website**: danh mục chân trang xếp ngang (bỏ `display:block` thừa - trước cao 858 px), ảnh thẻ không gọi `/api/img/<sku>.svg` cho SKU > 1540 (hết yêu cầu 404), service worker chạy cả trên localhost để kiểm thử.
- **Kiểm thử**: 66 kiểm tra máy chủ (thêm 19: chuỗi băm, xác minh SePay, SLA), 13 kiểm tra trình duyệt Playwright trên bản tĩnh (`tests/browser/smoke.js`: Worker + IndexedDB, service worker, PWA, tìm kiếm có dấu/không dấu, "bàn là" không có hàng, trang sản phẩm + giỏ, điện thoại 390 px, không lỗi JS/CSP), ngân sách Lighthouse di động (`tests/browser/lighthouse.js`: hiệu năng ≥ 80, tiếp cận ≥ 90, SEO ≥ 90, thực hành tốt ≥ 80; đo cục bộ 91/100/96/100). CI `test.yml` thêm job `browser`.
- **Duyệt lệnh hold một chạm** (máy chủ v1.8.0 + tiện ích 1.2.0): email cảnh báo hold / nhắc 4 giờ / KHẨN 8 giờ kèm 2 nút "Duyệt cho bot đặt" và "Hủy & hoàn khách" (token HMAC gắn với lệnh, hạn 48 giờ). Link GET chỉ mở trang xác nhận (bộ quét liên kết của email không làm gì được), bấm nút trong trang = POST mới đổi trạng thái. Duyệt → bot `approved`: tiện ích bỏ các lý do mềm (trần tự động, trần ngày/giờ, ngoài giờ, khách mới), vẫn giữ lý do cứng (công tắc, nguồn, VAT, giá vượt dung sai, báo giá cũ, địa chỉ); đơn > 5 triệu vẫn cần OTP ngân hàng; trần mỗi giao dịch của thẻ bot vẫn áp. Quản trị → Lệnh mua: nút "Duyệt - cho bot đặt" trên lệnh hold (trước đây "cho bot đặt lại" chỉ xóa trạng thái nên bot hold lại y như cũ). 75 kiểm tra máy chủ (thêm 9 cho luồng duyệt), 14 kiểm tra tiện ích. CI trên GitHub (job `browser`): 13/13 kiểm thử trình duyệt đạt, ngân sách Lighthouse đạt.

## MÁY CHỦ v1.9.0 - HỢP ĐỒNG ĐIỆN TỬ THEO ĐƠN, LƯU TRỮ CÓ THỜI HẠN, SỰ CỐ DỮ LIỆU (04/11/2026)

- **Nguồn văn bản pháp lý duy nhất** `legal/terms/<phiên bản>/` (`meta.json`, `hop-dong.html` mẫu điền theo đơn, `dieu-khoan.html`): `node tools/build-terms.js` chép thư viện `site/kk-hop-dong.js` (KKHD: điền mẫu, định dạng tiền, văn bản chuẩn để băm) + `TERMS_META`/`TERMS_TPL` vào `backend/Code.gs` giữa hai mốc `HD:BEGIN`/`HD:END`, và sinh `site/phap-ly/hop-dong-<v>.html`, `dieu-khoan-<v>.html`, `phien-ban.html`; CI chạy `--check` để mã và trang web không lệch nguồn. Hai phiên bản: `UQ-2026-10` (đang áp dụng - văn bản "Xác nhận ủy quyền" theo đơn) và `HD-2026-11` v1.0 (Hợp đồng ủy thác mua hàng hóa 14 điều + Phụ lục 1, Điều khoản dịch vụ 13 mục; đã công bố, chưa áp dụng).
- **Ngày áp dụng phiên bản mới** = Script Property `TERMS_EFFECTIVE` (Quản trị → Hệ thống → Điều khoản; máy chủ bắt buộc cách hôm nay ≥ 7 ngày - công bố trước khi áp dụng). `termsActive_()` chọn phiên bản theo ngày; đơn đặt trước ngày đó giữ nguyên văn bản cũ (bản chốt đã lưu).
- **Mỗi đơn**: `orderCreate_` kiểm tra `consent === true && consent_version === phiên bản đang áp dụng` (sai → báo tải lại trang), `contractSave_` điền mẫu bằng chính KKHD → lưu nguyên văn vào sheet `Contracts` (code, version, hash, created_at, marketing, html) → `hash = sha256(KKHD.text(html))` (bỏ thẻ, gộp khoảng trắng) → nối chuỗi băm `kind = contract` → email mã đơn đính kèm file HTML độc lập (có nút In / Lưu PDF, ghi mã băm) → `order.get` trả `contract {version, label, hash, at, marketing}`; `order.contract` (mã đơn + SĐT, hoặc tài khoản, hoặc quản trị) trả lại bản chốt để xem / tải. Trình duyệt: nút "Xem ... đã điền theo đơn này" điền mẫu tại chỗ từ dữ liệu form + báo giá (không gửi dữ liệu đi), 2 ô tích: hợp đồng (bắt buộc) và tiếp thị (tùy chọn, không tích sẵn, nhớ lựa chọn của thành viên); màn hình thanh toán và trang theo dõi đơn có "Xem" / "Tải về".
- **Tiếp thị**: `marketing` lưu trong đơn và hồ sơ thành viên (`member.marketing` bật/tắt trong Tài khoản → Dữ liệu cá nhân của tôi); xử lý dữ liệu giao hàng theo cơ sở "thực hiện hợp đồng" (Luật BVDLCN 2025 Đ.19 k1 d), không gắn với ô tiếp thị.
- **Lưu trữ có thời hạn** `retention_()` (chạy sau sao lưu hằng ngày): thành viên 23 tháng không đăng nhập và không có đơn → email báo trước 30 ngày (`retention_warn_at`); đủ 24 tháng và đã báo ≥ 28 ngày → ẩn danh hóa (email băm, xóa tên/SĐT/địa chỉ, role `deleted`, thu hồi phiên, email xác nhận); đăng nhập lại → hủy cảnh báo. Chứng từ đơn hàng giữ 10 năm theo Luật Kế toán. Quản trị, tài khoản đã xóa không bị động đến.
- **Kiểm tra chia sẻ Drive** `shareCheck_()` trong tự kiểm toán: Sheet dữ liệu, thư mục sao lưu, thư mục ảnh đổi trả, dự án Apps Script phải `PRIVATE` và không có người xem/sửa khác chủ sở hữu → vi phạm là vấn đề mức cao (email hằng ngày).
- **Sự cố dữ liệu cá nhân** (sheet `Incidents`, Quản trị → Hệ thống → Sự cố dữ liệu): mở sự cố (loại, mức, thời điểm phát hiện, mô tả, phạm vi) → mã `SC...`, hạn báo khách = +24 giờ, hạn báo A05 = +72 giờ, email quản trị kèm 4 bước phải làm, nối chuỗi băm; cập nhật trạng thái (khoanh vùng / đã thông báo / đóng), đánh dấu đã báo A05 / khách. Quy trình giấy: `docs/phap-ly/QUY-TRINH-NOI-BO-BVDLCN.md` (thông báo vi phạm 72 giờ, quyền chủ thể, quyết định phân công nhân sự).
- **Thông tin doanh nghiệp** trong Quản trị thêm: số/nơi cấp/ngày cấp GCN ĐKDN, người đại diện, chức vụ (điền vào hợp đồng; thiếu thì in "[đang cập nhật]").
- **Trang pháp lý**: mục 3 thêm đoạn "Văn bản giao kết theo từng đơn"; mục 7 thêm tiếp thị tách riêng, lưu trữ có thời hạn, sự cố dữ liệu, thời hạn phản hồi quyền chủ thể (tiếp nhận 02 ngày làm việc; rút đồng ý 15 ngày, xem/sửa 10 ngày, xóa 20 ngày theo NĐ 356/2025).
- **Kiểm thử**: 91 máy chủ (thêm 16: phiên bản điều khoản, bản chốt + băm + chuỗi + email, tải về, tiếp thị, ngày áp dụng, lưu trữ 24 tháng, chia sẻ Drive, sự cố), 15 trình duyệt (thêm thư viện KKHD + 5 trang pháp lý), **9 kiểm tra đầu-cuối** `tests/browser/checkout.js` (Chromium thật + máy chủ Apps Script giả lập chạy đúng `Code.gs` trong cùng tiến trình, chặn mọi gọi `script.google.com`: mở checkout, 2 ô tích, xem trước, đặt hàng, email đính kèm, tải file, trang theo dõi đơn).
- **Triển khai**: dán `backend/Code.gs` v1.9.0 → Deploy → New version; không cần tạo Script Property mới (sheet `Contracts`, `Incidents` tự tạo). Sau khi luật sư chốt v1.0 và có GCN ĐKDN: điền thông tin doanh nghiệp → đặt `TERMS_EFFECTIVE` (≥ 7 ngày) tại Quản trị.

## THÔNG TIN PHÁP NHÂN (cập nhật 12/11/2026)
- **Tên công ty:** CÔNG TY TNHH KK-MALL
- **Tên tiếng Anh:** KK-MALL COMPANY LIMITED
- **Mã số doanh nghiệp (đồng thời là mã số thuế):** 0111694057
- **Đã cập nhật lên www.kk-mall.com:** chân trang mọi trang chủ (tên, tên tiếng Anh, MSDN/MST), trang Pháp lý & Chính sách, mẫu hợp đồng ủy thác / hợp đồng dịch vụ / điều khoản (số GCN ĐKDN, MST của Bên B), dữ liệu có cấu trúc Google (legalName, taxID, alternateName) trên trang chủ và mọi trang sản phẩm/danh mục; cấu hình máy chủ `COMPANY_JSON` (email, hóa đơn phí dịch vụ, hợp đồng điện tử dùng chung nguồn này).
- **Còn chờ bổ sung** (Admin → Hệ thống → Cấu hình vận hành): địa chỉ trụ sở, hotline, email CSKH, nơi cấp + ngày cấp GCN ĐKDN, người đại diện theo pháp luật, số đăng ký/thông báo Bộ Công Thương.

## 0.1. Chân trang pháp lý & thủ tục thông báo nền tảng TMĐT (cập nhật 12/11/2026)

**Dòng chân trang đang chạy trên www.kk-mall.com:**

> © 2026 CÔNG TY TNHH KK-MALL (KK-MALL COMPANY LIMITED) - Mã số doanh nghiệp/MST: 0111694057 - đơn vị chủ quản và vận hành website www.kk-mall.com. Bản quyền thiết kế, mã nguồn, nội dung và thương hiệu KK-MALL thuộc về tác giả Nguyễn Duy Điển. Nền tảng thương mại điện tử kinh doanh trực tiếp: đang thực hiện thủ tục thông báo theo Luật Thương mại điện tử số 122/2025/QH15 và Nghị định 248/2026/NĐ-CP.
> KK-MALL cung cấp dịch vụ mua hộ: giá hiển thị là tổng số tiền khách thanh toán (tiền hàng thu hộ để trả nhà cung cấp + phí dịch vụ KK-MALL), đã gồm thuế GTGT và phí giao hàng - không thu thêm phụ phí. Không áp dụng thanh toán khi nhận hàng (COD).

**Tự chuyển trạng thái:** khi nhập "Số/mã hồ sơ xác nhận thông báo" + "Đường dẫn trang xác nhận" (https) tại Admin → Hệ thống → Công ty, câu "đang thực hiện thủ tục" tự đổi thành "Đã được xác nhận thông báo nền tảng thương mại điện tử kinh doanh trực tiếp (số/mã hồ sơ: ...) - xem xác nhận". Ngày cấp/nơi cấp GCN ĐKDN (reg_date, reg_by) cũng tự hiện sau MST.

**Thủ tục (Luật 122/2025/QH15 + NĐ 248/2026/NĐ-CP, hiệu lực 01/7/2026):**

| Bước | Nội dung |
|---|---|
| Loại hình | Nền tảng TMĐT kinh doanh trực tiếp có chức năng đặt hàng trực tuyến (website riêng bán hàng/dịch vụ của chính công ty) |
| Thời điểm | Phải được xác nhận thông báo TRƯỚC khi hoạt động |
| Nơi nộp | Cổng Dịch vụ công quốc gia - cơ quan tiếp nhận: UBND TP Hà Nội (Điều 51 k1 NĐ 248) |
| Hồ sơ | Mẫu số 01 kèm thông tin doanh nghiệp, tên miền, chủ sở hữu |
| Thời hạn | Khoảng 3 ngày làm việc |
| Kết quả | Biểu tượng xác nhận điện tử liên kết về hệ thống quản lý TMĐT, gắn ở chân trang |
| Công khai bắt buộc (Điều 4, Điều 17 k1) | Tên, địa chỉ trụ sở, người đại diện theo pháp luật, số/ngày/nơi cấp GCN ĐKDN, MST, hotline, email - hiển thị nổi bật trên trang chủ |

**Còn thiếu (nhập tại Admin → Hệ thống):** địa chỉ trụ sở, người đại diện theo pháp luật, ngày + nơi cấp GCN ĐKDN, hotline, email CSKH.

Nguồn: hethongphapluat.com (NĐ 248/2026), moit.gov.vn (phổ biến Luật TMĐT + NĐ 248), thuvienphapluat.vn (Luật 122/2025/QH15), tapchicongthuong.vn. Đây là tóm tắt tham khảo, không phải tư vấn pháp lý.
