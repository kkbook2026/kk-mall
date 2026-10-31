# Đo chất lượng tìm kiếm KK-SEARCH

Chạy trên danh mục thật (`site/api/catalog-pack.json`), không cần mạng:

```
node tests/search/eval.js --test -v     # 110 truy vấn: 55 dùng để chỉnh (dev) + 55 kiểm tra (test)
node tests/search/fresh.js -v           # 32 truy vấn holdout
node tests/search/fresh2.js -v          # 30 truy vấn viết "mù" sau khi khóa bộ máy
node tests/search/eval.js duong/dan/kk-search-cu.js --test   # so sánh với bản cũ
```

Chỉ số: nDCG@10 (chấm phân cấp: 2 = đúng ý, 1 = liên quan, 0 = sai), P@10, Đúng@1 (kết quả đầu đúng ý), số truy vấn 0 kết quả, độ trễ.
Quy tắc: chỉ chỉnh bộ máy theo bộ **dev**; bộ test / holdout chỉ để đo. Khi thêm từ đồng nghĩa từ tab "🔎 Tìm không ra", thêm luôn truy vấn đó vào bộ đánh giá.

(c) 2026 Nguyễn Duy Điển (KK-2026). All rights reserved.
