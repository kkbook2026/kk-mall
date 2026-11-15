# Bảng giá đại lý của đối tác (mã hóa)

Mỗi tệp `dt<mã ngẫu nhiên>.enc` là bảng giá đại lý của một đối tác (nhà phân phối / hãng), do Cổng quản trị (tab "Đối tác giá đại lý") tạo và mã hóa
AES-256-GCM bằng khóa dẫn xuất từ khóa quản trị. Tên tệp không chứa tên đối tác; nội dung chỉ giải mã được bằng khóa quản trị.

- Thêm / cập nhật: Cổng quản trị → tab Đối tác → "Mã hóa & tải tệp" → tải tệp lên thư mục này (Add file → Upload files) → Commit.
- Mỗi lần có tệp mới, quy trình "Auto collect prices" tự chạy và tính lại giá (`collector/partners.js`).
- Tạm dừng: tạo tệp "Tạm dừng" trong Cổng quản trị và tải lên thay tệp cũ. Xóa: xóa tệp trong thư mục này.

Tài liệu: `docs/DOI-TAC-GIA-DAI-LY.md`.
