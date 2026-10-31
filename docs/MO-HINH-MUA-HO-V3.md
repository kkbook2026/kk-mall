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
