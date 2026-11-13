# RÀ SOÁT GIÁ TOÀN HỆ THỐNG - 13/11/2026

Bản quyền © Nguyễn Duy Điển (KK-2026). Tài liệu vận hành nội bộ của KK-MALL.

**Mục tiêu chủ sở hữu giao:** giá bán trên KK-MALL = giá thực trả tại nguồn rẻ nhất (đã gồm phí vận chuyển của nguồn) + phí nền tảng theo khung công khai (giá gốc trên 500.000đ: 32.000đ; 200.000 - 500.000đ: 26.000đ; dưới 200.000đ: 18.000đ).

**Kết luận ngắn:** công thức giá và khung phí vẫn đúng 100%. Vấn đề nằm ở DỮ LIỆU: "nguồn rẻ nhất" của hơn 99% sản phẩm thực chất là nguồn DUY NHẤT hệ thống biết, và 1/5 danh mục đang định giá từ dữ liệu đã chết 3-5 năm. Đợt này sửa tận gốc phần dữ liệu và ghép nguồn; phí giữ nguyên.

---

## 1. Vì sao khách thấy nơi khác rẻ hơn (đo trên dữ liệu thật ngày 13/11/2026)

| # | Nguyên nhân | Số liệu đo được | Đã xử lý |
|---|---|---|---|
| 1 | Chỉ đọc 4.000 bản ghi đầu của mỗi datafeed | Đọc 28.753 / 97.018 bản ghi còn sống (30%) | Nạp toàn bộ bằng file datafeed tĩnh |
| 2 | Mỗi tên gọi là một sản phẩm riêng, không ghép cùng một mặt hàng giữa các nguồn | Chỉ 171 / 29.620 sản phẩm (0,6%) có từ 2 nguồn độc lập trở lên | Bộ ghép chéo nguồn mới (`collector/match.js`) |
| 3 | Datafeed đã ngừng cập nhật nhiều năm vẫn được dùng để định giá | Lazada 1.885 ngày, Sendo 1.554 ngày, Điện máy Chợ Lớn 1.167 ngày; 6.014 sản phẩm định giá từ các feed này | Bỏ hẳn feed quá 45 ngày, gỡ sản phẩm hết nguồn |
| 4 | Liên kết sai và gộp nhầm mẫu (tên giống nhau, mã model nằm trong ngoặc) | 827 nhóm tên gộp nhiều mẫu, 466 liên kết sai mẫu | Tách nhóm theo chữ ký biến thể, gỡ liên kết sai |
| 5 | Bộ lọc tin cậy so nhầm giá niêm yết với giá thực trả; không tự hồi phục | 461 sản phẩm bị "tạm giữ" (hết hàng oan hoặc kẹt giá cũ) | So đúng giá thực trả; tự đặt lại mốc khi giá mới được xác nhận lặp lại |
| 6 | Datafeed của một số chuỗi chỉ có giá niêm yết (không khuyến mãi), cũ 11 ngày | Giá niêm yết có thể gấp 1,5 - 2 lần giá đang bán ở chuỗi khác | Ghép chéo để lấy giá chuỗi khác; dải giá riêng cho trường hợp này |
| 7 | Shopee qua datafeed chỉ có 34 gian hàng; TikTok Shop không có datafeed | 12.736 bản ghi Shopee cho cả sàn | TikTok Shop: hỏi giá từng sản phẩm qua API chính thức. Shopee: cần khóa Shopee Affiliate Open API (mục 7) |
| 8 | Lịch hẹn giờ của GitHub bị trễ/bỏ lượt | "3 giờ/lần" thực tế 6-10 giờ/lần; thu thập bán lẻ "mỗi giờ" thực tế 3-4 lần/ngày | Các quy trình tự gọi bù khi quá 3 giờ |
| 9 | Hàng giá trị thấp: phí cố định + phí vận chuyển dự phòng theo từng món | Xem bảng mục 6.1 | Không sửa được bằng dữ liệu - cần quyết định kinh doanh |

## 2. Hiện trạng từng nguồn (lần chạy 13:37 UTC ngày 13/11/2026)

| Nguồn | Kênh hợp pháp đang dùng | Bản ghi dùng / tổng | Tuổi dữ liệu | Đánh giá |
|---|---|---|---|---|
| Tiki | File datafeed tĩnh AccessTrade | 45.184 / 45.184 | 0,6 ngày | Tốt |
| Shopee | File datafeed tĩnh AccessTrade | 12.736 / 12.736 | 0,8 ngày | Chỉ 34 gian hàng - chưa phản ánh giá rẻ nhất trên sàn |
| Thế Giới Di Động | File datafeed tĩnh AccessTrade | 10.912 / 10.912 | 11,6 ngày | Giá niêm yết, không có khuyến mãi |
| Điện Máy Xanh | File datafeed tĩnh AccessTrade | 17.835 / 17.835 | 11,6 ngày | Giá niêm yết, không có khuyến mãi |
| CellphoneS | File datafeed tĩnh AccessTrade | 10.351 / 10.351 | 0,6 ngày | Tốt |
| Hoàng Hà Mobile | Trang sản phẩm công khai (tuân thủ robots.txt) | 3.536 giá / 7.806 trang | 0,7 ngày | Tốt |
| An Phát | Trang sản phẩm công khai (Crawl-delay 5 giây) | 5.872 giá / 14.108 trang | 4 ngày | Chậm - đã tăng ngân sách để 1 vòng còn khoảng 2 ngày |
| TikTok Shop | API tìm sản phẩm của AccessTrade (hỏi từng sản phẩm) | 74 giá đang dùng | dưới 1 ngày | Mới bật 13/11/2026; 18% sản phẩm được hỏi có tin khớp |
| Phúc Anh | Trang sản phẩm công khai | 0 | - | Máy chủ từ chối truy cập tự động - không thu thập, không vượt chặn |
| FPT Shop | Datafeed AccessTrade | 0 | - | AccessTrade không có dữ liệu (file tĩnh rỗng) |
| Lazada | Datafeed AccessTrade | 0 / 1.055.719 | 1.885 ngày | Feed chết - đã bỏ |
| Sendo | Datafeed AccessTrade | 0 / 9.045.191 | 1.554 ngày | Feed chết - đã bỏ |
| Điện máy Chợ Lớn | Datafeed AccessTrade | 0 / 753 | 1.167 ngày | Feed chết - đã bỏ |

Nguyên tắc pháp lý không đổi: chỉ dùng kênh chính thức (datafeed/API đối tác) hoặc trang công khai mà robots.txt cho phép; không quét sàn, không vượt chặn, không vượt CAPTCHA; tôn trọng giới hạn tốc độ của đối tác.

## 3. Những gì đã sửa

**3.1. Nạp dữ liệu (`collector/feeds.js`)**
- Dữ liệu lấy từ **file datafeed tĩnh** của AccessTrade (`http://datafeed.accesstrade.me/<tên miền nhà bán>.csv`, làm mới hằng ngày): 1 yêu cầu/nhà bán, đủ toàn bộ bản ghi. Đây là kênh AccessTrade khuyến nghị thay cho API.
- API AccessTrade (giới hạn 30 yêu cầu/phút cho mỗi tài khoản) chỉ còn dùng 1 yêu cầu/nhà bán mỗi khoảng 20 giờ để biết tuổi dữ liệu; kết quả nhớ trong `collector/feed-index.json`. API phân trang là phương án dự phòng, đi qua một hàng đợi chung cách nhau 2,3 giây; bị từ chối thì chờ 65 giây rồi mới thử lại.
- Bỏ cả nguồn nếu dữ liệu không cập nhật quá `FEED_MAX_AGE_DAYS` (45 ngày); bỏ tin giới hạn khu vực ("chỉ giao HCM/HN").
- File hoặc feed trả thiếu (ít hơn một nửa số bản ghi đã biết) được ghi là lỗi.

**3.2. Ghép chéo nguồn (`collector/match.js` - mới)**
- Trích đặc trưng từ tên: mã model mạnh/yếu, thương hiệu, thông số có đơn vị, biến thể (Pro/Max/5G...), màu, tình trạng (cũ/đã kích hoạt), số lượng/bộ, loại phụ kiện, độ phân giải.
- 4 mức tin cậy: trùng đầy đủ mã hàng nhà sản xuất (0,92-1,0) - trùng mã model (0,90-1,0) - trùng thương hiệu + mã yếu hiếm (0,70-0,89) - trùng toàn bộ từ khóa (0,60-0,69).
- Mọi tên offer được so với toàn bộ sản phẩm, nên cùng một mặt hàng bán ở nhiều nơi được so giá với nhau.
- Luật an toàn: khác biến thể/màu/thông số/tình trạng là loại; phụ kiện khác loại (kính cường lực với ốp lưng) là loại; mực/toner không ghép với máy in; một người bán không thể có 2 offer cho cùng sản phẩm.

**3.3. Chọn giá (`collector/collect.js`, `collector/trust.js`)**
- Dải giá so với giá neo (trung vị offer khớp chính xác): chuỗi bán lẻ trùng đầy đủ mã hàng từ 30%; trùng mã model từ 50%; ghép theo tên từ 70% (45% khi giá neo chỉ là giá niêm yết không khuyến mãi). Trên 160% giá neo: bỏ.
- Offer rẻ bất thường KHÔNG dùng định giá, liệt kê trong trang quản trị để duyệt tay.
- Offer ghép theo tên (dưới 0,90) được đánh dấu "ghép theo tên" trong quản trị; bot không tự đặt hàng theo các offer này - người vận hành kiểm tra đường dẫn trước.
- Bộ lọc tin cậy: so lịch sử niêm phong với GIÁ THỰC TRẢ; hai chuỗi dùng chung bảng giá chỉ tính 1 lần trong trung vị.
- Tự chữa lịch sử: giá mới lệch trên 50% so với lịch sử, đến từ chuỗi bán lẻ chính hãng (khớp chính xác hoặc trùng đầy đủ mã hàng), lặp lại từ 3 lần chạy trong ít nhất 20 giờ thì đặt lại mốc tham chiếu. Lịch sử niêm phong (sổ cái, biểu đồ 90 ngày) không bị sửa.
- "Freeship" trong tên chỉ được tính khi không kèm điều kiện (khu vực, giá trị đơn, chương trình có trần).
- Gỡ sản phẩm không còn nguồn sau `RETIRE_RUNS` lần chạy khỏe liên tiếp (mặc định 8).
- **Giữ nguyên bản đã xuất bản khi mất nguồn:** nguồn nào tụt quá nửa số bản ghi so với lần khỏe gần nhất thì lần chạy DỪNG, không xuất bản (cửa hàng giữ nguyên) tối đa `SHRINK_HOLD_H` = 12 giờ; chạy tay với `force=1` để bỏ qua.
- Trần cứng 36.000 sản phẩm (giới hạn 1 GB của GitHub Pages); chỉ tự thêm hàng mới có giá nguồn từ 100.000đ, ưu tiên hàng có nhiều nguồn và giá trị cao.

**3.4. Hỏi giá trên sàn theo từng sản phẩm (`collector/search.js`, `search-crawl.yml` - mới)**
- TikTok Shop qua API tìm sản phẩm của AccessTrade (dùng khóa sẵn có), 25 truy vấn/phút - dưới giới hạn chính thức 30 yêu cầu/phút.
- Shopee qua Shopee Affiliate Open API - đã viết sẵn, tự bật khi có `SHOPEE_APP_ID` + `SHOPEE_APP_SECRET`.
- Ưu tiên làm mới sản phẩm đang có giá từ sàn, rồi sản phẩm chưa hỏi (trải đều), rồi lâu nhất. Kết quả lưu GitHub Actions cache (không commit), bộ thu thập giá xác nhận lại bằng bộ ghép trước khi dùng.

**3.5. Vận hành**
- `retail-crawl.yml`: 150 phút/lần (vẫn đúng Crawl-delay từng website); ghi rõ mã HTTP khi website từ chối.
- Bù lịch: `retail-crawl.yml` và `search-crawl.yml` tự gọi `collect.yml` nếu đã quá 3 giờ chưa chạy.
- Kiểm ảnh: cầu dao theo máy chủ ảnh + ngân sách 150 giây (máy chủ ảnh của sàn đã ngừng từng làm một lần chạy chậm thêm 10 phút).
- Trang quản trị: bảng so sánh hiện offer ghép chéo, lý do loại; nhật ký lần chạy hiện thống kê từng nguồn, feed bị bỏ, số offer chờ duyệt, cảnh báo nguồn tụt bản ghi.
- `meta.json`: `sourceCount` = số nguồn thực sự có dữ liệu trong lần chạy (hiện là 8).

## 4. Kết quả trên hệ thống thật (đo từ sổ cái giá công khai, mốc trước 12:10 UTC ngày 13/11/2026, trạng thái sau lần chạy 13:37 UTC)

| Chỉ số | Trước | Sau |
|---|---|---|
| Bản ghi nguồn đọc mỗi lần chạy | 28.753 | 97.018 |
| Thời gian bước thu thập | khoảng 2 phút | khoảng 2 phút |
| Sản phẩm trong danh mục | 29.630 | 35.918 (gỡ khoảng 7.000 hết nguồn, thêm khoảng 13.300 mới) |
| Sản phẩm còn hàng | 27.201 | 35.107 |
| Sản phẩm tạm hết hàng | 2.429 | 811 |
| Sản phẩm bị bộ lọc tin cậy tạm giữ | 461 | 33 (32 sản phẩm khác đang chờ xác nhận giá mới, tự mở sau khoảng 1 ngày) |
| Sản phẩm có từ 2 nguồn độc lập | 171 (0,6%) | khoảng 3.000 (8,4%) |
| Sản phẩm đang định giá nhờ offer ghép chéo | 0 | khoảng 1.600 |

Trong 19.552 sản phẩm còn hàng cả trước và sau:
- **1.275 sản phẩm giảm giá** (6,5%), mức giảm trung vị 9,1%, tiết kiệm trung vị 264.000đ/sản phẩm, tổng mức giảm cộng dồn 1,66 tỷ đồng.
- 129 sản phẩm tăng giá (trung vị +18,5%): giá cũ lấy nhầm từ mẫu khác rẻ hơn - nay đúng mẫu.
- 2.342 sản phẩm có hàng trở lại; 6 sản phẩm chuyển sang tạm hết.

Ví dụ giá bán KK-MALL (công khai trên web): Router TP-Link Archer C64 782.000đ → 631.000đ (cả 3 trang sản phẩm trùng nhau nay cùng một giá); chuột Logitech G304 962.000đ → 772.000đ; tủ lạnh LG GR-X257BG 58.722.000đ → 34.052.000đ; tủ lạnh LG LFI50BLMAI 44.222.000đ → 27.052.000đ; tủ lạnh Samsung RF59C766FB1/SV 45.592.000đ → 30.652.000đ.

Kiểm chứng công thức trên toàn bộ sản phẩm còn hàng của lần chạy nghiệm thu: phí đúng bậc 100%, nguồn định giá luôn là offer hợp lệ có giá thực trả thấp nhất - 0 sai lệch.

## 5. Sự cố trong lúc triển khai (13:14 - 13:40 UTC ngày 13/11/2026)

- **Hiện tượng:** trong khoảng 26 phút, cửa hàng hiển thị 10.930 rồi 17.247 sản phẩm "tạm hết hàng".
- **Nguyên nhân:** bản đầu của đợt sửa tải đủ datafeed qua API phân trang (khoảng 490 yêu cầu/lần chạy). Cộng với 2 lần chạy thử việc hỏi giá trên sàn, tổng lượng gọi vượt giới hạn 30 yêu cầu/phút của AccessTrade; API trả HTTP 429, 3 feed không tải được; bộ thu thập khi đó vẫn xuất bản và coi sản phẩm của các feed này là hết hàng.
- **Phạm vi:** chỉ trạng thái còn hàng; không sản phẩm nào bị gỡ (chốt chặn đã có), không sai giá, không ảnh hưởng đơn hàng. Các lần đổi trạng thái đều nằm trong sổ cái công khai.
- **Khắc phục:** chuyển sang file datafeed tĩnh; lần chạy 13:37 UTC khôi phục toàn bộ (811 sản phẩm tạm hết - mức bình thường).
- **Phòng ngừa đã triển khai:** (1) bộ thu thập không còn phụ thuộc hạn mức API; (2) mất dữ liệu nguồn lớn thì dừng, giữ nguyên bản đã xuất bản tối đa 12 giờ; (3) mọi lời gọi API có giãn cách và chờ 65 giây khi bị từ chối; (4) việc hỏi giá trên sàn chạy 25 truy vấn/phút; (5) đã gỡ công cụ kiểm toán gọi API dày đặc.

## 6. Giới hạn còn lại (nêu trung thực)

**6.1. Hàng giá trị thấp không thể rẻ bằng giá niêm yết của sàn.** Giá KK-MALL đã gồm giao hàng và phí cố định, còn giá hiển thị trên sàn chưa gồm phí vận chuyển.

| Giá niêm yết tại nguồn | Tỷ trọng danh mục | Chênh trung vị so với giá niêm yết nguồn | Phí vận chuyển dự phòng (trung vị) | Phí nền tảng |
|---|---|---|---|---|
| Dưới 50.000đ | 2,5% | +142% | 25.000đ | 18.000đ |
| 50.000 - 100.000đ | 4,0% | +60% | 30.000đ | 18.000đ |
| 100.000 - 200.000đ | 6,6% | +24% | 20.000đ | 18.000đ |
| 200.000 - 500.000đ | 18,0% | +10% | 10.000đ | 26.000đ |
| 500.000 - 2.000.000đ | 24,1% | +4% | 0đ | 32.000đ |
| Trên 2.000.000đ | 44,7% | +1% | 0đ | 32.000đ |

**6.2. Hơn 90% sản phẩm vẫn chỉ có 1 nguồn độc lập.** Với các sản phẩm này "rẻ nhất" là rẻ nhất trong những nguồn hệ thống có dữ liệu. Tỷ lệ sản phẩm có từ 2 nguồn độc lập theo ngành: điện lạnh 38%, tivi 23%, laptop và máy tính 12%, âm thanh 12%, gia dụng 11%, sức khỏe và làm đẹp 8%, điện thoại và máy tính bảng 4% (ngành này phần lớn là phụ kiện), thời trang/sách/bách hóa/thể thao gần 0%.

**6.3. Shopee:** datafeed chỉ có 34 gian hàng. Muốn so được với giá rẻ nhất trên Shopee phải có khóa Shopee Affiliate Open API (mục 7). Bộ kết nối đã viết theo đặc tả công khai và kiểm thử với máy chủ giả lập, CHƯA chạy với API thật.

**6.4. TikTok Shop:** mỗi vòng hỏi hết khoảng 20.000 sản phẩm có mã model mất khoảng 2 ngày (giới hạn tốc độ của API).

**6.5. Trùng lặp sản phẩm:** cùng một mặt hàng có thể còn 2-4 trang sản phẩm (tạo từ tên gọi của từng nguồn). Ghép chéo giúp các trang này về cùng mức giá khi ghép được; trường hợp tên có/không có chữ "5G" cố ý không ghép (4G và 5G là 2 máy khác nhau ở nhiều dòng).

**6.6. Nguồn chưa có dữ liệu:** FPT Shop, Phúc Anh, Lazada, Sendo, Điện máy Chợ Lớn (lý do ở mục 2).

**6.7. File datafeed tĩnh chỉ có qua HTTP** (chứng chỉ HTTPS của máy chủ đó đã hết hạn) và làm mới 1 lần/ngày; giá Tiki/Shopee/CellphoneS vì vậy trễ tối đa khoảng 1 ngày.

## 7. Việc cần chủ sở hữu thực hiện

1. **Đăng ký Shopee Affiliate Open API** (trang chương trình tiếp thị liên kết Shopee, mục Open API), lấy AppID và Secret, thêm 2 GitHub Secret: `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`. Không cần sửa mã.
2. **Quyết định chính sách hàng dưới 100.000đ** (6,5% danh mục): giữ nguyên, ẩn khỏi cửa hàng, hoặc đổi cách tính phí vận chuyển nguồn (theo đơn thay vì theo món).
3. Lazada / Sendo / FPT Shop / Phúc Anh: muốn có giá phải có kênh đối tác chính thức (Lazada Open Platform, datafeed đối tác...). Có khóa nào thì thêm Secret tương ứng.
4. Vào trang quản trị > So sánh giá nguồn: xem các offer "đã loại - rẻ bất thường" để quyết định từng trường hợp.

## 8. Vận hành

| Quy trình | Lịch | Việc làm |
|---|---|---|
| `collect.yml` | 3 giờ/lần + gọi bù | Nạp feed, ghép nguồn, định giá, niêm phong, xuất bản |
| `retail-crawl.yml` | mỗi giờ, tối đa 150 phút | Thu giá trang công khai của website bán lẻ |
| `search-crawl.yml` | mỗi giờ, tối đa 110 phút | Hỏi giá từng sản phẩm trên sàn qua API chính thức |
| `feed-probe.yml` | chạy tay | Kiểm tra file datafeed tĩnh (chỉ in siêu dữ liệu) |
| `test.yml` | mỗi lần đẩy mã | 91 + 14 + 130 kiểm thử, tìm kiếm, trình duyệt, Lighthouse |

Biến cấu hình (GitHub Variables, đều có mặc định): `FEED_MAX_AGE_DAYS` 45 · `FEED_HARD_MAX` 36000 · `FEED_MAX_NEW` 5000 · `NEW_MIN_PRICE` 100000 · `RETIRE_RUNS` 8 · `SHRINK_HOLD_H` 12 · `MATCH_MIN_SCORE` 0.6 · `SEARCH_TT_SORT` RECOMMENDED. Chạy tay `collect.yml`: `retire_runs=1` để gỡ ngay sản phẩm hết nguồn; `force=1` để xuất bản dù có nguồn mất dữ liệu.

Khôi phục: nhánh `sao-luu-truoc-ra-soat-gia-13-11-2026` giữ nguyên trạng thái trước đợt này.

## 9. Kiểm thử

- `tests/collector/match.test.js`: 130 kiểm tra hồi quy (cặp tên sản phẩm thật phải ghép / không được ghép, dải giá, người bán, file tĩnh và API giả lập kể cả khi API bị giới hạn, bộ lọc tin cậy, chữ ký Shopee).
- Chạy thử toàn bộ quy trình mới trên dữ liệu thật trong bản sao cô lập trước khi triển khai; chạy nhiều lần liên tiếp để kiểm tra ổn định (chỉ 4 / 29.000 sản phẩm đổi giá giữa 2 lần chạy cùng dữ liệu); kiểm cả kịch bản mất nguồn (dừng, không xuất bản).
- Hệ thống thật: lần chạy 13:37 UTC thành công bằng file tĩnh, số bản ghi từng nguồn trùng khớp với số đọc qua API.

## Nguồn tham khảo

- Thông báo giới hạn tần suất gọi API của AccessTrade (30 yêu cầu/phút): https://help.accesstrade.vn/thong-bao-gioi-han-tan-suat-goi-api/
- Sử dụng link datafeed tĩnh thay vì API (AccessTrade): https://help.accesstrade.vn/knowledgebase/su-dung-link-datafeed-tinh-thay-vi-api/
