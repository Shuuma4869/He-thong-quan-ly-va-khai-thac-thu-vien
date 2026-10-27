# Tra cứu sách

Danh mục công khai tra sách ngay trên dữ liệu Core. Người đọc có thể nhập tên, một phần mô tả, tên tác giả hoặc ISBN 13; bộ lọc tác giả và thể loại vẫn áp dụng cùng kết quả. Có thể chọn Category từ danh sách hoặc gõ tên/bí danh đã được khai báo; bộ lọc tên ánh xạ về đúng Category chuẩn trước khi truy vấn Book. Khi nhập từ khóa, giao diện chọn thứ tự “Phù hợp nhất”. Người đọc vẫn có thể đổi sang tên A–Z hoặc mới cập nhật.

V22 cài `unaccent` và `pg_trgm` trong schema `public` của PostgreSQL, kể cả khi bảng Catalog nằm ở schema kiểm thử riêng. Trigger cập nhật tên/mô tả đã bỏ dấu và `tsvector` mỗi khi Book được ghi; migration điền dữ liệu cho Book có sẵn. Chỉ mục GIN hỗ trợ full text và tên gần đúng. ISBN và tác giả được đọc từ quan hệ Catalog hiện tại, không sao chép sang bảng tìm kiếm riêng. Không thay đổi khóa duy nhất của Category hay dữ liệu alias.

Thứ tự phù hợp ưu tiên ISBN đúng, tên đúng, tiền tố tên, full text, tác giả, phần tên và cuối cùng là tên gần đúng. Tên gần đúng chỉ tham gia với từ khóa từ ba ký tự. Các giá trị tìm kiếm đều là tham số SQL; tên cột và kiểu sắp xếp không nhận trực tiếp từ người dùng. Cùng một bộ ứng viên được dùng cho cả ba cách sắp xếp. Ở chế độ phù hợp, điểm rồi ID quyết định thứ tự. Một request đọc count và trang trong transaction `REPEATABLE READ`; hai request phân trang riêng biệt không phải cùng một snapshot nếu Catalog thay đổi giữa chừng.

Đây là tra cứu từ vựng trên Core, chưa có vector, mô hình ngữ nghĩa, search event, cache liên dịch vụ hoặc đề xuất sửa chính tả. Truy vấn không có kết quả chỉ hiện trạng thái trống; hiện chưa ghi tín hiệu `SEARCH_ZERO_RESULT`. Bộ lọc tên thể loại không nhận đồng thời `categoryId`; tên không có trong taxonomy trả trang rỗng, dữ liệu nhập nhằng trả 409 để người dùng không nhận nhầm sách. Đo tải trên dữ liệu thực và quyền cài extension phải được kiểm tra ở môi trường triển khai trước khi bật cho production.

## Đo trên bộ demo local

Ngày 27/10/2026, `scripts/benchmark-catalog.mjs` gọi API Core đang chạy với 10.013 Book: một lượt làm nóng rồi 20 lượt đo cho mỗi kịch bản. Đây là thời gian HTTP trên máy phát triển, gồm đọc SQL và tạo response; không phải thời gian SQL riêng hay SLA production. Bộ lọc bí danh dùng `Khoa học giả tưởng` đã có trong database demo. Gợi ý gọi song song API Book/Author/Category.

| Kịch bản | Tổng kết quả | P50 | P95 |
|---|---:|---:|---:|
| Trang đầu A–Z | 10.013 | 19,7 ms | 23,7 ms |
| Trang 100 A–Z | 10.013 | 17,8 ms | 20,5 ms |
| Tên đầy đủ | 13 | 256,7 ms | 271,8 ms |
| Tiền tố tên | 34 | 209,7 ms | 222,7 ms |
| Tên gần đúng | 7 | 195,5 ms | 205,0 ms |
| Tác giả | 7 | 183,0 ms | 188,7 ms |
| Bí danh thể loại | 5 | 16,0 ms | 24,0 ms |
| Từ khóa và thể loại | 241 | 213,8 ms | 309,0 ms |
| Không có kết quả | 0 | 195,2 ms | 203,6 ms |
| Gợi ý Book/Author/Category | 104/12/0 | 160,1 ms | 186,2 ms |

`scripts/evaluate-catalog-relevance.mjs` giữ sáu câu hỏi mẫu và một tựa đích đã biết cho mỗi câu: tên đầy đủ và tiền tố của *Alice's Adventures in Wonderland* đứng thứ 1, từ gõ gần đúng thứ 2; *Les Misérables* đứng thứ 1 với cả cách gõ có dấu và không dấu; *Dracula* đứng thứ 4 khi tìm tác giả Bram Stoker. Hit@5 = 6/6, MRR = 0,792, nDCG@5 = 0,844. Đây chỉ là sáu cặp truy vấn–sách mục tiêu, không phải bộ nhãn đầy đủ cho mọi kết quả; vì vậy Precision@K trên toàn Catalog chưa có cơ sở đo. Database demo hiện có 0 Edition mang ISBN, nên xếp hạng ISBN được kiểm bằng fixture PostgreSQL cô lập trong `PublicCatalogIntegrationTest`, không gán số đo relevance từ demo cho ISBN. Cần tập nhãn rộng hơn và đa dạng thể loại trước khi suy ra chất lượng tìm kiếm vận hành.

`scripts/explain-catalog-search.sql` dùng câu truy vấn trang đầu tương ứng `BookRepository.search` với từ `adventures`. `EXPLAIN (ANALYZE, BUFFERS)` trên cùng PostgreSQL demo trả 20 hàng, `shared hit=362`, planning 7,993 ms, execution 123,201 ms; trong đó JIT 35,718 ms. Đây chỉ là câu SQL chọn trang, chưa gồm câu đếm và các batch lấy bìa/điểm/nguồn. `scripts/benchmark-catalog-concurrent.mjs` chạy 4 request tìm kiếm song song × 20 lượt: mỗi request P50 184,1 ms, P95 218,5 ms; thời gian một lượt P50 194,1 ms, P95 224,4 ms. Không thấy 429 trong lượt đo này. Những số đo local và ba câu đánh giá thủ công chưa đủ để cam kết SLA hoặc relevance trên dữ liệu production.

Lượt chạy lặp cùng ngày trên Node 22 và Core đang chạy, lấy mẫu tiến trình Core mỗi 200 ms, cho P95 từ 15,7 ms (lọc bí danh) đến 281,0 ms (tên đầy đủ); truy vấn kết hợp P95 275,6 ms. Trong khoảng đo, working set Core cao nhất 382,9 MiB, private bytes cao nhất 437,9 MiB và CPU tăng 2,78 giây. Đây là số của cả tiến trình Core, chịu ảnh hưởng cache và hoạt động nền, không thể quy riêng bộ nhớ cho truy vấn Catalog. File kết quả local nằm ở `.tools/bench-catalog-2026-10-27.txt`; script benchmark được giữ trong repository để chạy lại.
