# KK-MALL - Hàng thật, giá rẻ nhất đã kiểm chứng (KK-VERIFIED, 24/11/2026)

## 1. Mục tiêu

Giá hiển thị trên www.kk-mall.com luôn là **giá thấp nhất trong các nguồn đạt chuẩn tin cậy**: còn hàng, đặt mua online được, đúng mã model, nguồn uy tín, giá mới kiểm tra. Trước đây bộ thu thập chọn offer rẻ nhất trong các offer đã qua Bộ lọc Tin cậy, tức là chỉ xét **giá**. Một offer rẻ hơn vài nghìn đồng từ nhà bán thường trên sàn, giá đọc từ 2 ngày trước, vẫn có thể thắng offer của chuỗi bán lẻ chính hãng vừa kiểm tra.

## 2. Cách chấm điểm tin cậy (collector/quality.js)

**Cổng bắt buộc:** còn hàng · có đường dẫn đặt mua online (https) · giá thực trả > 0.

**Điểm Q (0-100) = 35% Kênh bán + 25% Trùng mã + 20% Độ mới + 20% Uy tín**

| Thành phần | Mức điểm |
|---|---|
| Kênh bán (T) | A - Chuỗi bán lẻ chính hãng / đối tác có hợp đồng: 100 · B - Gian hàng chính hãng trên sàn (tên gian hàng có Official / Chính hãng / Mall / Flagship / Ủy quyền, hoặc tên thương hiệu + Store): 85 · Tiki: 82 · Shopee (datafeed): 75 · C - Nhà bán thường trên sàn: 55 |
| Trùng mã (M) | Khớp chính xác / quản trị đã duyệt: 100 · Trùng đầy đủ mã hãng (>= 0,92): 95 · Trùng mã model (>= 0,9): 88 · Chỉ ghép theo tên: 55 |
| Độ mới (F) | Giá trang thật vừa đọc / <= 12 giờ: 100 · <= 24 giờ: 90 · <= 3 ngày: 75 · <= 10 ngày: 62 · <= 30 ngày: 52 · cũ hơn: 40 · giá đánh dấu cũ: tối đa 62 |
| Uy tín (R) | Nền theo kênh (A 85 · B 75 · C 60) + số lượng đã bán tại nơi bán (>= 10: +5 · >= 100: +10 · >= 1.000: +15), tối đa 100 |

**Đạt chuẩn:** Q >= `BEST_Q_MIN` (mặc định 70) hoặc quản trị đã duyệt offer đó.

Ví dụ:

| Offer | Q | Kết quả |
|---|---|---|
| Chuỗi bán lẻ, datafeed 22 ngày, khớp chính xác | 86 | Đạt |
| Nhà bán thường trên sàn, giá 3 giờ trước, trùng mã 0,92 | 76 | Đạt |
| Nhà bán thường trên sàn, giá 30 giờ (cũ), trùng mã 0,92 | 67 | Chưa đạt - chờ duyệt |
| Nhà bán thường trên sàn, chỉ ghép theo tên | 66 | Chưa đạt - chờ duyệt |

## 3. Quy tắc chọn giá

1. Rẻ nhất (giá bán hiệu lực = công thức giá + sàn giá đối tác) **trong các offer đạt chuẩn**; bằng giá thì ưu tiên điểm cao hơn.
2. Offer **rẻ hơn nhưng chưa đạt chuẩn**: không kéo giá xuống, vào tab Duyệt giá kèm lý do và điểm. Quản trị duyệt thì từ lần sau được dùng.
3. Không offer nào đạt chuẩn: giữ cách chọn cũ (rẻ nhất trong offer hợp lệ) và **không gắn nhãn kiểm chứng**.
4. Hàng tạm giữ / chưa có nguồn thật / hết hàng: không gắn nhãn.

## 4. Hiển thị (không lộ danh tính / giá nguồn)

| Vị trí | Nội dung |
|---|---|
| Thẻ sản phẩm | "✅ Hàng thật giá rẻ nhất" · "🏆 Hàng thật · rẻ nhất mọi nguồn" (khi thấp nhất mọi giá bán lẻ trùng mã đang đối chiếu) |
| Trang chi tiết | Khung kiểm chứng: điểm tin cậy, còn hàng, đặt mua online, loại kênh bán, trùng mã 100% + số nguồn đã so sánh, độ mới của giá + thời điểm cập nhật |
| Thanh menu | Bộ lọc "Hàng Thật Giá Rẻ Nhất" (`?f=vq`) |
| Trang chủ | Kệ đầu tiên "✅ Hàng thật - giá rẻ nhất đã kiểm chứng"; kệ ngành ưu tiên hàng đã kiểm chứng |
| Trang SEO tĩnh | Nhãn tương ứng |
| Dữ liệu công khai | `products/<SKU>.json` → `vq: { q, t, f, n, lt }`; `trust.fl` bit 64 / 128; `meta.json` → `vq: { min, ok, lt, low, at }` |

Câu chữ giới hạn trong "các nguồn KK-MALL đối chiếu" (không khẳng định tuyệt đối toàn thị trường) - phù hợp quy định cấm dùng từ "nhất" khi không có tài liệu chứng minh (Luật Quảng cáo); bằng chứng nằm trong sổ cái niêm phong và gói quản trị.

## 5. Luôn cập nhật

- Bộ thu thập chạy 3 giờ/lần (điều phối lịch 3 lớp), chấm lại toàn bộ danh mục mỗi lượt.
- Tìm giá trên sàn ưu tiên làm mới sản phẩm đang có offer khớp sau 8 giờ (70% lượt hỏi), lưu thêm số lượng đã bán và tên gian hàng.
- Giám sát 30 phút/lần thêm chỉ số "Hàng thật - giá rẻ nhất đã kiểm chứng" (báo lỗi nếu danh mục > 1.000 SP mà không SP nào đạt chuẩn).

## 6. Cấu hình

| Biến (Secret / env) | Mặc định | Ý nghĩa |
|---|---|---|
| `BEST_Q_MIN` | 70 | Ngưỡng điểm đạt chuẩn; 0 = tắt cổng điểm (chỉ tính nhãn) |

## 7. Kết quả lượt chạy đầu tiên (24/11/2026 12:56 UTC)

| Chỉ số | Giá trị |
|---|---|
| Sản phẩm đạt chuẩn "hàng thật giá rẻ nhất" | **49.811** / 51.862 (kênh A 22.933 · B 23.290 · C 3.588) |
| Hiển thị trong bộ lọc (còn hàng, không tạm giữ) | 48.353 |
| Còn hàng nhưng chưa đạt chuẩn (không gắn nhãn) | 881 |
| Đổi sang nguồn tin cậy hơn | 1 SP (chênh +1%) |
| Có offer rẻ hơn nhưng tin cậy thấp → chờ duyệt | 1 SP |
| Thấp nhất mọi giá bán lẻ trùng mã (nhãn 🏆) | 0 - giá KK-MALL = giá nguồn + phí dịch vụ, nên chỉ đạt được khi có giá đại lý của đối tác |

Kiểm tra trên web thật: kệ đầu trang chủ, 27 nhãn trên trang chủ, khung kiểm chứng trên trang chi tiết, bộ lọc `?f=vq`, không lỗi console. Kiểm thử tự động (backend, trình duyệt, đặt hàng đầu-cuối, Lighthouse) đạt.

## 8. Kiểm thử

`tests/collector/quality.test.js` - 30 mục: kênh bán, độ mới, điểm tổng hợp, chọn giá (offer rẻ hơn tin cậy thấp bị giữ, quản trị duyệt, không đặt online được, không offer nào đạt chuẩn, bằng giá ưu tiên điểm cao, tắt cổng), dữ liệu công khai không lộ nguồn.
