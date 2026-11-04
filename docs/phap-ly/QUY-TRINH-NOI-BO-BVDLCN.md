# KK-MALL - Quy trình nội bộ bảo vệ dữ liệu cá nhân (dự thảo 04/11/2026, luật sư rà)

Ba văn bản dưới đây là hồ sơ số 4 và 5 trong bộ hồ sơ đánh giá tác động chuyển dữ liệu cá nhân xuyên biên giới (Mẫu 09): (A) Quy trình thông báo vi phạm; (B) Quy trình thực hiện quyền của chủ thể dữ liệu; (C) Quyết định phân công nhân sự bảo vệ dữ liệu cá nhân. Căn cứ: Luật Bảo vệ dữ liệu cá nhân 2025 (Điều 4, 9, 10, 23, 33); Nghị định 356/2025/NĐ-CP (Điều 5, 6); Luật Bảo vệ quyền lợi người tiêu dùng 2023 (Điều 19 khoản 3). Phần kỹ thuật tương ứng đã có trong máy chủ KK-MALL v1.9.0 (Quản trị → Hệ thống → Sự cố dữ liệu; nút Tải dữ liệu / Xóa tài khoản / Tiếp thị trong Tài khoản).

## A. Quy trình thông báo vi phạm quy định bảo vệ dữ liệu cá nhân (72 giờ / 24 giờ)

| Bước | Thời hạn | Người làm | Việc làm | Bằng chứng |
|---|---|---|---|---|
| 1. Phát hiện | Ngay khi biết | Bất kỳ ai (chủ sở hữu, hệ thống giám sát 30 phút, khách báo) | Mở sự cố tại Quản trị → Hệ thống → Sự cố dữ liệu: loại (lộ/rò rỉ, bị tấn công, mất dữ liệu, truy cập trái phép), mức, thời điểm phát hiện, mô tả, phạm vi. Hệ thống ghi sổ Incidents, nối chuỗi băm, email hạn chót cho quản trị | Mã sự cố SC..., email |
| 2. Khoanh vùng | Trong 4 giờ | Người phụ trách BVDLCN (mục C) | Đổi khóa webhook, khóa bot, mật khẩu/OTP quản trị; thu hồi mọi chia sẻ Sheet/Drive (kiểm tra bằng Tự kiểm toán); tắt công tắc bot nếu nghi ngờ; xuất sheet Log, Chain, Incidents; chụp màn hình | Trạng thái "Đã khoanh vùng" + ghi chú |
| 3. Đánh giá | Trong 12 giờ | Người phụ trách + luật sư | Xác định: dữ liệu nào, bao nhiêu chủ thể, nguyên nhân, nguy cơ tổn hại (tài chính, lừa đảo, danh dự). Nếu có thể gây tổn hại → bắt buộc thông báo cơ quan quản lý | Biên bản đánh giá (mẫu phần A.1) |
| 4. Thông báo khách | Trong 24 giờ kể từ phát hiện nếu hệ thống bị tấn công (Luật BVQLNTD 2023 Đ.19 k3); các trường hợp khác không muộn hơn thông báo cơ quan | Người phụ trách | Email từng khách bị ảnh hưởng: dữ liệu bị ảnh hưởng, thời điểm, biện pháp KK-MALL đã làm, việc khách nên làm (đổi mật khẩu email, cảnh giác cuộc gọi lạ), đầu mối liên hệ. Đánh dấu "đã báo khách" trong sự cố | Email gửi, mốc notified_users_at |
| 5. Thông báo cơ quan | Trong 72 giờ kể từ phát hiện (Luật BVDLCN 2025 Đ.23) | Người phụ trách, Giám đốc ký | Gửi Thông báo vi phạm quy định bảo vệ dữ liệu cá nhân (mẫu theo NĐ 356/2025) tới Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao (A05) qua Cổng Dịch vụ công Bộ Công an; từ 29/4/2026 Bộ Công an phân loại và chuyển Công an tỉnh, thành phố xử lý (NQ 22/2026/NQ-CP). Nội dung: mô tả vi phạm, thời điểm, loại dữ liệu, số chủ thể, hậu quả, biện pháp đã và sẽ làm, đầu mối. Đánh dấu "đã báo A05" | Mã hồ sơ Cổng DVC, mốc notified_a05_at |
| 6. Khắc phục, đóng | Theo kế hoạch, tối đa 30 ngày | Người phụ trách | Sửa lỗi gốc, kiểm thử lại, cập nhật hồ sơ DPIA nếu thay đổi biện pháp; đóng sự cố với ghi chú kết luận; lưu toàn bộ hồ sơ 10 năm | Trạng thái "Đã đóng", biên bản |

Không được: xóa nhật ký, sửa dữ liệu sự cố (chuỗi băm sẽ phát hiện), tự thương lượng với khách để che giấu, chậm thông báo vì chưa biết đủ thông tin (gửi thông báo ban đầu, bổ sung sau).

### A.1 Mẫu biên bản đánh giá sự cố

- Mã sự cố: SC.......; người lập: ......; thời điểm lập: ......
- Mô tả sự việc và cách phát hiện: ......
- Dữ liệu bị ảnh hưởng (họ tên / số điện thoại / email / địa chỉ / thông tin hóa đơn / tài khoản nhận hoàn / khác): ......; số chủ thể: ......
- Nguyên nhân gốc: ......
- Đánh giá nguy cơ tổn hại cho chủ thể (thấp / vừa / cao) và lý do: ......
- Biện pháp đã làm (giờ): ......; biện pháp sẽ làm: ......
- Kết luận: thông báo cơ quan quản lý (có / không), thông báo khách (có / không), hạn chót: ......
- Chữ ký người phụ trách BVDLCN và Giám đốc.

## B. Quy trình thực hiện quyền của chủ thể dữ liệu

| Quyền (Luật BVDLCN 2025 Đ.4, 10; NĐ 356/2025 Đ.5) | Cách khách thực hiện | Thời hạn xử lý | Cách KK-MALL làm |
|---|---|---|---|
| Được biết, được truy cập, được cung cấp bản sao | Tài khoản → "Dữ liệu cá nhân của tôi" → Tải dữ liệu (JSON) - tức thời; hoặc email/hotline | Xác nhận tiếp nhận 02 ngày làm việc; cung cấp trong 10 ngày | Công cụ tự phục vụ; yêu cầu qua email: xác minh chủ thể (OTP tới email đã đăng ký hoặc mã đơn + số điện thoại), xuất JSON gửi email |
| Chỉnh sửa | Tài khoản → sửa họ tên, số điện thoại, địa chỉ; đơn đang xử lý: liên hệ hotline | 10 ngày | Sửa Members; đơn đã đặt: sửa địa chỉ giao qua lệnh mua nếu chưa đặt tại nguồn |
| Rút lại sự đồng ý (tiếp thị) | Bỏ tích ô tiếp thị trong Tài khoản; hoặc email | 15 ngày; thực tế tức thời | member.marketing = off; không gửi tiếp thị |
| Xóa dữ liệu | Tài khoản → Xóa tài khoản (gõ XOA); hoặc email | 20 ngày; thực tế tức thời | Xóa họ tên, số điện thoại, địa chỉ, phiên; giữ chứng từ đơn hàng 10 năm theo Luật Kế toán (Đ.10 khoản 4: dữ liệu phải lưu theo luật không xóa); bản sao lưu tự hết sau tối đa 60 ngày |
| Hạn chế xử lý, phản đối xử lý | Email/hotline | 72 giờ (Luật) | Dừng mục đích bị phản đối (tiếp thị), ghi Log |
| Khiếu nại, tố cáo, yêu cầu bồi thường | Email/hotline, Cổng DVC Bộ Công an | Tiếp nhận 01 ngày làm việc, trả lời 07 ngày làm việc | Lập sự cố nếu có vi phạm; trả lời bằng văn bản điện tử |

Xác minh chủ thể trước khi cung cấp hoặc xóa: chỉ chấp nhận yêu cầu từ email đã đăng ký (OTP) hoặc kèm mã đơn + số điện thoại đúng; không cung cấp dữ liệu qua điện thoại. Mọi yêu cầu và kết quả ghi vào sheet Log (hành động member_export, member_delete, marketing_off) để chứng minh thời hạn.

## C. Quyết định phân công nhân sự bảo vệ dữ liệu cá nhân (mẫu)

CÔNG TY TNHH KK-MALL - Số: 01/2026/QĐ-KKM - Hà Nội, ngày ...... tháng ...... năm 2026

QUYẾT ĐỊNH về việc phân công nhân sự phụ trách bảo vệ dữ liệu cá nhân

Căn cứ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (Điều 33 - doanh nghiệp siêu nhỏ được miễn nghĩa vụ chỉ định bộ phận chuyên trách theo khoản 2 nhưng vẫn phải có người chịu trách nhiệm); căn cứ Nghị định 356/2025/NĐ-CP; căn cứ Điều lệ Công ty;

Giám đốc Công ty quyết định:

Điều 1. Phân công ông/bà ...... (chức vụ Giám đốc, kiêm nhiệm) làm người phụ trách bảo vệ dữ liệu cá nhân của Công ty, đầu mối liên hệ với Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao, Công an thành phố Hà Nội, cơ quan bảo vệ quyền lợi người tiêu dùng và chủ thể dữ liệu. Thông tin liên hệ: email ......, điện thoại ......

Điều 2. Nhiệm vụ: (1) duy trì và cập nhật hồ sơ đánh giá tác động xử lý và chuyển dữ liệu cá nhân xuyên biên giới; (2) thực hiện quy trình thông báo vi phạm (phần A) và quy trình quyền chủ thể (phần B); (3) kiểm tra định kỳ hằng tháng kết quả tự kiểm toán của hệ thống (quyền chia sẻ Drive, chuỗi băm, hạn mức email), bật xác minh 2 bước cho tài khoản Google và GitHub; (4) rà soát hợp đồng với bên xử lý (Google Workspace DPA, SePay, nhà cung cấp B2B) trước khi ký; (5) đào tạo người được cấp quyền quản trị về bảo mật và bảo vệ dữ liệu.

Điều 3. Quyết định có hiệu lực kể từ ngày ký. Người được phân công và các bộ phận liên quan chịu trách nhiệm thi hành.

GIÁM ĐỐC (ký, ghi rõ họ tên, đóng dấu)

---
(c) 2026 Nguyễn Duy Điển. Dự thảo do hệ thống hỗ trợ soạn theo hồ sơ DPIA ngày 04/11/2026; luật sư rà trước khi ký và nộp.
