# KK-MALL - Phân tích pháp lý mô hình & cách hệ thống tuân thủ

Tài liệu này giải thích vì sao hệ thống được thiết kế như hiện tại để mô hình "tổng hợp giá từ các sàn - cộng 32.000đ - đặt hộ - giao thẳng" **hợp pháp tại Việt Nam**. Đây là phân tích kỹ thuật-pháp lý để làm việc với luật sư/kế toán, không thay thế tư vấn pháp lý chính thức.

## 0. Thông tin pháp nhân vận hành (cập nhật 12/11/2026)

| Mục | Nội dung |
|---|---|
| Tên công ty | **CÔNG TY TNHH KK-MALL** |
| Tên tiếng Anh | **KK-MALL COMPANY LIMITED** |
| Mã số doanh nghiệp (đồng thời là mã số thuế) | **0111694057** |
| Địa chỉ trụ sở, hotline, email CSKH | chờ bổ sung tại Admin → Hệ thống |
| Nơi cấp / ngày cấp GCN ĐKDN, người đại diện theo pháp luật | chờ bổ sung tại Admin → Hệ thống |
| Số/mã hồ sơ xác nhận thông báo nền tảng TMĐT (UBND TP Hà Nội) | chờ bổ sung sau khi được xác nhận |

Đã hiển thị trên www.kk-mall.com: chân trang, trang Pháp lý & Chính sách, mẫu hợp đồng ủy thác / hợp đồng dịch vụ / điều khoản (Bên B), dữ liệu có cấu trúc Google (legalName, taxID) và cấu hình máy chủ dùng cho email, hóa đơn phí dịch vụ, hợp đồng điện tử theo đơn.

## 0.1. Chân trang pháp lý & thủ tục thông báo nền tảng TMĐT (cập nhật 12/11/2026)

**Dòng chân trang đang chạy trên www.kk-mall.com:**

> © 2026 CÔNG TY TNHH KK-MALL (KK-MALL COMPANY LIMITED) - Mã số doanh nghiệp/MST: 0111694057 - đơn vị chủ quản và vận hành website www.kk-mall.com. Bản quyền thiết kế, mã nguồn, nội dung và thương hiệu KK-MALL thuộc về tác giả Nguyễn Duy Điển. Nền tảng thương mại điện tử kinh doanh trực tiếp: đang thực hiện thủ tục thông báo theo Luật Thương mại điện tử số 122/2025/QH15 và Nghị định 248/2026/NĐ-CP.
> KK-MALL cung cấp dịch vụ mua hộ: giá hiển thị là tổng số tiền khách thanh toán (tiền hàng thu hộ để trả nhà cung cấp + phí dịch vụ KK-MALL), đã gồm thuế GTGT và phí giao hàng - không thu thêm phụ phí. Không áp dụng thanh toán khi nhận hàng (COD).

**Tự chuyển trạng thái:** khi nhập "Số/mã hồ sơ xác nhận thông báo" + "Đường dẫn trang xác nhận" (https) tại Admin → Hệ thống → Công ty, câu "đang thực hiện thủ tục" tự đổi thành "Đã được xác nhận thông báo nền tảng thương mại điện tử kinh doanh trực tiếp (số/mã hồ sơ: ...) - xem xác nhận". Ngày cấp/nơi cấp GCN ĐKDN cũng tự hiện sau MST.

**Thủ tục (Luật 122/2025/QH15 + NĐ 248/2026/NĐ-CP, hiệu lực 01/7/2026, thay NĐ 52/2013 và NĐ 85/2021):**

| Bước | Nội dung |
|---|---|
| Loại hình | Nền tảng TMĐT kinh doanh trực tiếp có chức năng đặt hàng trực tuyến (website riêng bán hàng/dịch vụ của chính công ty) |
| Thời điểm | Phải được xác nhận thông báo TRƯỚC khi hoạt động |
| Nơi nộp | Cổng Dịch vụ công quốc gia - cơ quan tiếp nhận: UBND TP Hà Nội (Điều 51 k1 NĐ 248) |
| Hồ sơ | Mẫu số 01 kèm thông tin doanh nghiệp, tên miền, chủ sở hữu |
| Thời hạn | Khoảng 3 ngày làm việc |
| Kết quả | Biểu tượng xác nhận điện tử liên kết về hệ thống quản lý TMĐT, gắn ở chân trang (Điều 45 k2a) |
| Công khai bắt buộc (Điều 4, Điều 17 k1) | Tên, địa chỉ trụ sở, người đại diện theo pháp luật, số/ngày/nơi cấp GCN ĐKDN, MST, hotline, email - hiển thị nổi bật trên trang chủ |

**Còn thiếu (nhập tại Admin → Hệ thống):** địa chỉ trụ sở, người đại diện theo pháp luật, ngày + nơi cấp GCN ĐKDN, hotline, email CSKH.

Nguồn: hethongphapluat.com (NĐ 248/2026), moit.gov.vn (phổ biến Luật TMĐT + NĐ 248), thuvienphapluat.vn (Luật 122/2025/QH15), tapchicongthuong.vn.

## 1. Ba điểm rủi ro của mô hình gốc và cách xử lý

| Yêu cầu ban đầu | Rủi ro pháp lý nếu làm "thô" | Cách KK-MALL thực hiện |
|---|---|---|
| "30 phút quét hàng & giá từ website các sàn" | Cào dữ liệu (scraping) vi phạm Điều khoản dịch vụ của Shopee, Tiki, TikTok Shop, Lazada, TGDĐ/ĐMX; có thể bị quy chiếu Điều 17 Luật An ninh mạng 2018 (truy cập trái phép), Luật SHTT (sao chép CSDL) và bị chặn IP, khóa tài khoản | Lớp `connectors` chỉ lấy dữ liệu qua **kênh chính thức**: Shopee Affiliate Open API, TikTok Shop Partner/Affiliate API, Lazada Open Platform, Tiki Open API, feed theo hợp đồng đại lý với ĐMX. Chưa có khóa → chế độ mô phỏng, **không gọi ra ngoài** |
| "Tự động đặt hàng tại website rẻ nhất bằng bot" | Bot mua hàng vi phạm ToS mọi sàn; tài khoản mua bị khóa, đơn bị hủy hàng loạt; giao dịch dùng tài khoản cá nhân → không có hóa đơn đầu vào hợp lệ cho doanh nghiệp | Nguồn có **hợp đồng B2B/dropship + API đặt hàng** → đặt tự động hoàn toàn. Nguồn chỉ có API công khai → **hỗ trợ 1 click** (nhân viên đặt, hệ thống điền sẵn dữ liệu, ghi mã đơn nguồn). Toàn bộ vẫn tự động ở khâu chọn nguồn, tính giá, theo dõi, hóa đơn |
| "Dùng tên, địa chỉ, SĐT khách để đặt ở sàn khác" | Chuyển dữ liệu cá nhân cho bên thứ ba cần **cơ sở pháp lý** (Luật BVDLCN 2025, NĐ 13/2023): sự đồng ý rõ ràng, mục đích cụ thể, ghi nhận được | Checkbox đồng ý bắt buộc tại bước đặt hàng, **lưu nguyên văn + thời điểm + IP** trong bảng `orders`; chính sách BVDLCN công khai tại `/phap-ly#bao-mat`; chỉ chuyển 3 trường tối thiểu (tên, SĐT, địa chỉ) |

## 2. Bản chất pháp lý của giao dịch

- KK-MALL là **bên bán** đối với khách hàng (xuất hóa đơn cho khách theo giá đã thanh toán), đồng thời là **bên mua** đối với nguồn (cần hóa đơn đầu vào/chứng từ từ nguồn để hạch toán giá vốn). Đây là mô hình **dropship/mua hộ có doanh thu** - phổ biến và hợp pháp khi kê khai đủ thuế GTGT, TNDN.
- Khoản 32.000đ là **phí dịch vụ giao hàng & xử lý đơn**, hiển thị tách bạch ở mọi nơi (trang SP, giỏ hàng, hóa đơn dòng riêng) → tuân thủ nghĩa vụ công khai giá, phí theo Luật TMĐT 122/2025/QH15, NĐ 248/2026 & Luật BVQLNTD 2023, tránh bị coi là "ẩn phí".
- KK-MALL **không nhận COD** → tiền về trước khi đặt nguồn, không phát sinh rủi ro tín dụng và hoàn toàn phù hợp với cổng thanh toán được NHNN cấp phép.

## 3. Nghĩa vụ đăng ký & công bố

1. Thông báo nền tảng TMĐT kinh doanh trực tiếp qua Cổng Dịch vụ công quốc gia (UBND TP Hà Nội) theo Luật TMĐT 122/2025/QH15 + NĐ 248/2026/NĐ-CP (thay NĐ 52/2013, NĐ 85/2021) - xem mục 0.1. Gắn biểu tượng xác nhận ở chân trang ngay khi có kết quả (Admin → Hệ thống).
2. Công khai: thông tin chủ sở hữu, điều khoản, chính sách thanh toán, vận chuyển, đổi trả, bảo mật, khiếu nại - đã có tại `/phap-ly`.
3. Hóa đơn điện tử: NĐ 123/2020, NĐ 70/2025 (hiệu lực 01/6/2025), TT 78/2021 - lập ngay khi hoàn tất giao dịch, gửi dữ liệu đến CQT qua tổ chức cung cấp dịch vụ HĐĐT. Module `invoice.js` có hook `EINVOICE_*` để phát hành qua nhà cung cấp và lưu mã CQT.
4. Bảo vệ dữ liệu cá nhân: lập hồ sơ đánh giá tác động xử lý DLCN gửi Bộ Công an (A05) trong 60 ngày kể từ khi xử lý; ký thỏa thuận xử lý dữ liệu (DPA) với đối tác nguồn hàng/vận chuyển.
5. Thuế: KK-MALL kê khai doanh thu toàn bộ giá bán cho khách; giá vốn = giá mua tại nguồn (cần chứng từ hợp lệ từ nguồn - ưu tiên nguồn xuất được hóa đơn GTGT cho doanh nghiệp: Điện Máy Xanh, Tiki Trading, gian hàng Mall).

## 4. Lộ trình đối tác (để bật đặt hàng tự động 100%)

| Nguồn | Kênh dữ liệu | Kênh đặt hàng | Ghi chú |
|---|---|---|---|
| Điện Máy Xanh / TGDĐ | Hợp đồng đại lý/bán buôn → feed giá, tồn kho | API B2B theo hợp đồng | Đã có khung `autoOrder` trong connector |
| Tiki | Tiki Open API (Tiki Trading / seller) | Thỏa thuận dropship Tiki Trading | Tiki xuất HĐ GTGT đầy đủ |
| Shopee | Affiliate Open API (giá, link) | Hỗ trợ 1 click / tài khoản doanh nghiệp | Không có API đặt hàng cho người mua |
| TikTok Shop | Partner Center / Affiliate API | Hỗ trợ 1 click | Tương tự Shopee |
| Lazada | Open Platform | Hỗ trợ 1 click / LazMall B2B | |

Kết luận: toàn bộ chuỗi giá trị (thu thập → so sánh → định giá → nhận đơn → thanh toán → điều phối → hóa đơn → email) được tự động hóa; riêng khâu "bấm đặt" tại những sàn chưa có API B2B được giữ ở chế độ con người xác nhận để hợp pháp và an toàn tài khoản. Khi ký được hợp đồng B2B, chỉ cần điền khóa API - không phải sửa mã.
