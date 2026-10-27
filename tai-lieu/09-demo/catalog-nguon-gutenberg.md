# Catalog tham khảo từ Project Gutenberg

Catalog demo có một bộ 10.000 định danh ebook lấy từ [catalog CSV tải về của Project Gutenberg](https://www.gutenberg.org/ebooks/offline_catalogs.html). Bản nguồn được tải ngày 26/10/2026. File `data/catalog/project-gutenberg-novels-10000.jsonl.gz` là ảnh chụp metadata đã chọn; manifest bên cạnh ghi SHA-256 của file nguồn và ảnh chụp để có thể kiểm tra lại. Repository không chứa nội dung ebook hay ảnh bìa.

Chương trình chọn các bản ghi `Text`, ngôn ngữ `en`, thuộc bookshelf `Novels`, có tên và tác giả. Dữ liệu được đọc theo dòng từ CSV nén, xử lý dấu ngoặc kép và xuống dòng trong trường CSV, chuẩn hóa Unicode rồi loại tên/tác giả trùng trong feed. Thống kê của ảnh chụp: 79.674 dòng nguồn, 61.900 dòng Text tiếng Anh, 18.500 ứng viên Novels, 154 dòng trùng tên/tác giả và 82 dòng thiếu hoặc sai metadata. Sau lọc có đúng 10.000 định danh nguồn.

## Nhập vào database demo

Sau khi khởi động Docker và Core để Flyway áp dụng migration V25, chạy seed demo nhỏ trước, rồi nhập bộ lớn:

```powershell
pwsh -NoProfile -File .\scripts\seed-demo-catalog.ps1 -ConfirmDemoDatabase
pwsh -NoProfile -File .\scripts\import-gutenberg-catalog.ps1 -ConfirmDemoDatabase
```

Script nhập chỉ chấp nhận `lams_core` trên `localhost:15432` của Compose project `lams`; nếu không truyền `-ConfirmDemoDatabase` phải gõ `CATALOG`. Mỗi lô 500 bản ghi nằm trong một transaction. Khi lô lỗi, các lô đã xong vẫn giữ nguyên; chạy lại để tiếp tục. ID mới được suy ra ổn định từ định danh nguồn, với bit phiên bản và biến thể UUID hợp lệ cho API/frontend. Khóa nguồn `(source_code, source_record_id)` ngăn tạo liên kết lặp. Bản ghi trùng tên và tác giả được gắn nguồn vào Book đã có, không tạo Book thứ hai. Không chạy script này trên dữ liệu thật của thư viện.

Đối chiếu PostgreSQL trên máy phát triển ngày 26/10/2026 sau hai lần nhập: **10.000 liên kết nguồn**, **10.013 Book** tổng cộng, 2.697 Author, 160 Category, 32 Edition demo, 64 BookCopy demo và 0 Publisher. Lần nhập lại không thêm Book. 19 định danh nguồn được liên kết với Book trùng đã có; 9.981 Book mới được tạo. Database `lams_core` chiếm khoảng 25,9 MB sau khi cập nhật thống kê và thu hồi dung lượng trên máy demo. Số liệu trên là của database demo, không phải số liệu thư viện thật.

## Ý nghĩa và giới hạn dữ liệu

Project Gutenberg ghi ngày `Issued` của **ebook**; LAMS chỉ giữ ngày này trong thông tin nguồn, không dùng làm năm xuất bản sách in. Feed không xác nhận ISBN, nhà xuất bản, ấn bản in, số bản vật lý hoặc khả năng cho mượn. Vì vậy pipeline chỉ thêm Book, Author, Category và liên kết nguồn; không tạo Edition hay BookCopy từ feed. Những bản sao vật lý mang mã `DEMO` thuộc bộ seed riêng và chỉ dùng để diễn tập nghiệp vụ.

Màn hình chi tiết đánh dấu bản ghi có nguồn ngoài là “Dữ liệu thư mục tham khảo” và đưa link về trang Project Gutenberg. Chỉ khi thư viện biên mục một Edition thật thì mới xuất hiện đường giữ chỗ. Không lấy ảnh bìa từ feed; ảnh cần qua quy trình đối chiếu ấn bản, giấy phép và ghi công thủ công. Khi chưa có ảnh đã duyệt, giao diện dùng bìa chữ với bảng màu khác nhau, có nhãn cho biết đó không phải bìa thật.

Metadata và cách tải catalog được Project Gutenberg mô tả trong [hướng dẫn catalog ngoại tuyến](https://www.gutenberg.org/ebooks/offline_catalogs.html). Trước khi tái phân phối nội dung ebook hoặc ảnh, cần kiểm tra riêng quyền sử dụng tại nơi triển khai; bộ nhập này không cấp quyền cho các nội dung đó.

## Đo nhanh trên máy demo

Sau khi nhập dữ liệu, chạy `node scripts/benchmark-catalog.mjs` với Core local. Mỗi trường hợp có một lượt làm nóng và 20 lượt đo tuần tự, gồm tải và phân tích JSON, không đại diện cho tải đồng thời. Lần đo 26/10/2026 trên 10.013 Book:

| Truy vấn API | Tổng kết quả | Trung vị | P95 |
|---|---:|---:|---:|
| Trang đầu A–Z, 20 mục | 10.013 | 19,0 ms | 23,8 ms |
| Trang 100 A–Z, 20 mục | 10.013 | 21,4 ms | 25,0 ms |
| Tìm “adventures” theo độ phù hợp | 242 | 202,5 ms | 347,7 ms |
| Tìm “adventures” và lọc `Novels` | 241 | 254,4 ms | 321,6 ms |

`EXPLAIN (ANALYZE, BUFFERS)` cho truy vấn FTS đơn giản sắp theo tên dùng `ix_books_normalized_title`, trả 20 dòng trong 2,3 ms; trang A–Z offset 2.000 dùng Index Only Scan, 0,8 ms. Những số SQL này chỉ là từng truy vấn minh họa, không phải thời gian toàn bộ endpoint. Sau lượt đo lại, Core dùng khoảng 360 MB working set và database khoảng 25,9 MB. Tìm kiếm xếp hạng còn tốn nhiều thời gian hơn duyệt trang; nếu cần phục vụ nhiều người đồng thời, phải đo tải song song trước khi đặt SLA.
