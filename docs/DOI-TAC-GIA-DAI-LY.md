# KK-MALL - Đối tác giá đại lý (KK-PARTNER)

Ngày lập: 15/11/2026. Quyết định của chủ sở hữu: **hướng A** (giữ công thức giá: giá thực trả tại nguồn rẻ nhất + phí dịch vụ theo bậc, tự động 3 giờ/lần) **và hướng C** (hợp tác giá đại lý với nhà phân phối / hãng), thực hiện tự động.

## 1. Vì sao cần giá đại lý

Mô hình mua hộ cộng phí không thể rẻ hơn chính nguồn mà nó mua: rà soát ngày 15/11/2026 (tài liệu `SAN-GIA-15-11-2026.md`, mục 11) cho thấy 0 sản phẩm rẻ hơn mọi nguồn bán lẻ, 21,5% đang dùng nguồn trùng mã rẻ nhất, 69,8% mới có 1 nguồn. Muốn KK-MALL đứng số 1 về giá mà vẫn có lãi thì giá vốn phải thấp hơn giá bán lẻ: đó là giá đại lý của nhà phân phối / hãng.

Hướng A không đổi: giá đại lý đi vào **cùng công thức** (giá thực trả tại đối tác + phí dịch vụ). Khi giá đại lý thấp hơn giá bán lẻ trên thị trường, KK-MALL tự động rẻ nhất.

## 2. Kiến trúc

| Thành phần | Tệp | Vai trò |
|---|---|---|
| Bộ nạp bảng giá | `collector/partners.js` | Giải mã tệp đối tác, đọc bảng giá trực tiếp (URL), chuẩn hóa dòng, ghép mã 100%, tạo offer |
| Tích hợp định giá | `collector/collect.js` (khối 5c, chọn giá, rà soát vị thế) | Offer đối tác vào cùng bộ lọc và công thức giá; giá bán lẻ tối thiểu; thống kê |
| Tệp bảng giá | `collector/partners/dt<mã>.enc` | Mỗi đối tác 1 tệp, tên là mã ngẫu nhiên, nội dung mã hóa |
| Cổng quản trị | `site/admin/partners.js`, tab "Đối tác giá đại lý" | Đọc CSV/XLSX trong trình duyệt, chỉnh cột, mã hóa, tải lên; bảng đối tác; dòng chưa ghép; lập PO |
| Quy trình | `.github/workflows/collect.yml` | Tự chạy ngay khi có tệp mới trong `collector/partners/` |
| Trang công khai | `/doi-tac.html`, `/doi-tac/mau-bang-gia-doi-tac.csv` | Giới thiệu chương trình, điều kiện, định dạng bảng giá |
| Kiểm thử | `tests/collector/partners.test.js` (40 mục) | Mã hóa tương thích trình duyệt, chạy mã trình duyệt trong Node, CSV/XLSX/JSON, ghép mã |

### 2.1. Bảo mật

- Tệp đối tác mã hóa AES-256-GCM (nén gzip trước), khóa dẫn xuất từ khóa quản trị bằng PBKDF2-SHA256, muối `kk-partner-v1`, 300.000 vòng. Trình duyệt dẫn xuất khóa này lúc mở khóa cổng quản trị và chỉ giữ trong phiên; bộ thu thập dẫn xuất từ Secret `ADMIN_PORTAL_KEY`.
- Kho mã công khai chỉ thấy bản mã hóa và tên tệp ngẫu nhiên. Tên đối tác, giá đại lý, liên hệ chỉ nằm trong gói quản trị mã hóa.
- Nhật ký công khai của GitHub chỉ in số đếm (số bảng giá, số dòng, số dòng trùng mã, số sản phẩm lấy giá đại lý).

### 2.2. Đọc bảng giá

- Định dạng: XLSX, CSV (dấu `,` `;` hoặc tab, tự nhận), JSON; hoặc đường dẫn trực tiếp (Google Sheets chia sẻ "bất kỳ ai có liên kết" được đổi tự động sang địa chỉ xuất CSV). Đường dẫn lỗi thì dùng bảng giá trong tệp và cảnh báo.
- Tự nhận cột tiếng Việt / tiếng Anh, kể cả khi phía trên dòng tiêu đề có tên công ty, tiêu đề bảng giá: mã hàng / model, tên, thương hiệu, giá đại lý, giá bán lẻ đề xuất / giá bìa, chiết khấu %, giá bán lẻ tối thiểu, VAT từng dòng, tồn kho / tình trạng, KK SKU, link, EAN / mã vạch / ISBN. Quản trị chỉnh lại cột được trong cổng.
- Chuẩn hóa: cộng VAT nếu bảng giá chưa gồm VAT; sách tính giá = giá bìa × (1 - chiết khấu); tồn kho dạng số hoặc chữ ("hết hàng", "liên hệ" = hết); dòng không ghi tồn kho theo điều khoản đối tác.
- Điều khoản đối tác: phạm vi giao (toàn quốc / theo vùng), VAT, phí giao (miễn phí từ mức nào, phí dưới mức, phí hàng cồng kềnh), giá bán lẻ tối thiểu, hiệu lực đến ngày, thương hiệu mặc định, tạm dừng.

### 2.3. Ghép mã 100% (`createMatcher`)

| Trường hợp | Kết quả |
|---|---|
| Dòng có cột KK SKU | Ghép thẳng (theo mã chuẩn nếu sản phẩm đã gộp) |
| Mã model của dòng có trong tên sản phẩm KK-MALL, cùng thương hiệu, không lệch tình trạng / loại hàng / số lượng gói / màu / hậu tố mã / phiên bản / thông số | Ghép |
| Cùng mã, nhiều biến thể trong danh mục (ví dụ 2 màu) mà bảng giá không ghi rõ | Mơ hồ - không ghép, báo quản trị ghi rõ màu / dung lượng hoặc điền KK SKU |
| Cùng mã ở nhiều trang có cùng chữ ký biến thể (một mặt hàng đăng nhiều lần) | Ghép tất cả |
| Cùng mã, khác thương hiệu | Không ghép |
| Không có mã model, tên chuẩn hóa trùng đúng 1 sản phẩm | Chỉ để quản trị duyệt tay (tab Duyệt) |

Ví dụ kiểm thử trên danh mục thật: CRP-LHTR1009F/WHSIVNCV (Cuckoo), KAQ-X26 (Karofi), C032.851.22.037.00 (Certina), SHD6803 (Sunhouse), MK240 (Logitech) ghép đúng; KAQ-X26 + thương hiệu Kangaroo bị loại; G304 không ghi màu bị đánh dấu mơ hồ (7 biến thể); G304 ghi "Đen" ghép đúng bản màu đen.

### 2.4. Định giá

- Offer đối tác qua cùng dải giá và bộ lọc tin cậy như mọi nguồn trùng mã (đối tác được coi là người bán duy nhất, nguồn tin cậy).
- Giá bán hiệu lực của mỗi offer = công thức A; nếu hợp đồng có **giá bán lẻ tối thiểu**, offer đối tác không bán dưới mức đó. Chạy thử: bảng giá đại lý thấp hơn nhưng giá tối thiểu 5.200.000 đ cao hơn giá bán lẻ hiện có (4.952.000 đ) thì hệ thống dùng nguồn bán lẻ, không vi phạm hợp đồng.
- Đối tác chỉ giao theo vùng, dòng chỉ trùng tên: vào tab Duyệt với ghi chú "Đối tác giá đại lý: ...".
- Rà soát vị thế giá tách **thị trường bán lẻ** khỏi giá đại lý: thêm nhóm "Giá đại lý (chưa có giá bán lẻ để so)" và cờ "rẻ hơn mọi giá bán lẻ trùng mã".

Chạy thử trên dữ liệu thật với 2 đối tác giả lập (63 dòng, giá đại lý bằng 80-85% giá bán lẻ): 62 dòng trùng mã, 1 dòng không có trong danh mục; 65 sản phẩm lấy giá đại lý, cả 65 rẻ hơn mọi giá bán lẻ trùng mã; đối tác theo vùng vào tab Duyệt với mức hạ giá dự kiến.

## 3. Vận hành (chủ sở hữu / quản trị)

1. Nhận bảng giá từ đối tác (Excel/CSV), hoặc đường dẫn Google Sheets.
2. Cổng quản trị → tab **Đối tác giá đại lý** → nhập tên, email nhận đơn, điều khoản → chọn tệp → kiểm tra cột tự nhận → **Mã hóa & tải tệp**.
3. Bấm **Mở trang tải lên GitHub** → kéo tệp `dt....enc` vào → **Commit changes**.
4. Không cần làm gì thêm: quy trình thu thập giá tự chạy (khoảng 5 phút), ghép mã, tính lại giá. Bảng đối tác hiện số dòng trùng mã, số sản phẩm lấy giá đại lý, số sản phẩm rẻ nhất thị trường.
5. Dòng chưa ghép: bấm **Dòng chưa ghép** → tệp CSV có lý do từng dòng → điền cột KK SKU hoặc ghi rõ biến thể → cập nhật lại bảng giá.
6. Khi có đơn: thẻ Lệnh mua hiện nút **Lập đơn gửi đối tác** → bảng PO + email soạn sẵn (mã hàng đối tác, số lượng, đơn giá, địa chỉ giao, thông tin hóa đơn) + tệp CSV. Đối tác xác nhận → nhập mã đơn như mọi nguồn.
7. Bảng giá hết hiệu lực tự ngừng dùng; tạm dừng / xóa đối tác bằng nút trong tab.

## 4. Tuyển đối tác

### 4.1. Ưu tiên theo dữ liệu KK-MALL (sản phẩm còn hàng, tổng giá trị danh mục)

| Thương hiệu | Số sản phẩm | Ngành chính |
|---|---|---|
| Asus | 946 | PC, linh kiện, laptop |
| Lenovo | 616 | Laptop |
| Apple | 788 | Đồng hồ thông minh, phụ kiện, MacBook |
| HP | 504 | Laptop, máy in |
| MSI | 380 | Linh kiện, màn hình |
| LG | 372 | Tivi, máy giặt |
| Samsung | 867 | Phụ kiện, điện thoại |
| Dell | 285 | Laptop |
| Gigabyte | 246 | Linh kiện, laptop |

Phần lớn sản phẩm của các thương hiệu này mới có 1 nguồn trùng mã. Nhóm điện máy (Panasonic, Toshiba, Hitachi, Sharp, Electrolux, Daikin) và sách là đợt sau; sách cần bổ sung ISBN vào danh mục để ghép mã 100%.

### 4.2. Nhà phân phối mục tiêu đợt 1

| Nhà phân phối | Thương hiệu liên quan | Kênh liên hệ chính thức | Trạng thái |
|---|---|---|---|
| Digiworld (DGW) | Apple, Xiaomi, Gigabyte, gia dụng | info@dgw.com.vn (danh sách nhà phân phối trên website ASUS Việt Nam) | Thư mời đã soạn sẵn trong Gmail (bản nháp) |
| Petrosetco Distribution (PSD) | Dell, Asus, Samsung, LG | info@petrosetco.com.vn (như trên) | Thư mời đã soạn sẵn (bản nháp) |
| Synnex FPT | Dell, HP, Lenovo, Asus, Intel, Apple | fdcmarketing@fpt.com; biểu mẫu "Contact to become a reseller" trên synnexfpt.com; đăng ký đại lý Apple tại partners.synnexfpt.com | Thư mời đã soạn sẵn (bản nháp); biểu mẫu cần chủ sở hữu tự gửi |
| Viễn Sơn | Asus (bo mạch chủ, card đồ họa, màn hình, laptop), Gigabyte laptop | Điện thoại văn phòng TP.HCM 028 3832 6085 | Liên hệ qua điện thoại |
| Vĩnh Xuân (SPC) | Corsair (độc quyền), linh kiện MSI | Website spc.com.vn | Liên hệ qua website |

Ba thư mời nằm ở mục Thư nháp của Gmail chủ sở hữu, chưa gửi. Chủ sở hữu đọc lại và bấm Gửi.

## 5. Việc tiếp theo

| Việc | Ghi chú |
|---|---|
| Công bố email / điện thoại hợp tác của công ty | Trang `/doi-tac.html` tự hiện khi thông tin công ty có email, điện thoại |
| Bổ sung ISBN cho sách | Mở đường ghép mã 100% với nhà phát hành sách (sách chiếm phần lớn sản phẩm chỉ có 1 nguồn) |
| Định giá theo khu vực nhận hàng | Dùng được đối tác / nguồn chỉ giao theo vùng cho khách ở vùng đó |
