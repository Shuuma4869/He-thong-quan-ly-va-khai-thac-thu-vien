# Hiệu năng đã đo và phạm vi áp dụng

Số liệu dưới đây lấy trên máy phát triển Windows ngày 28/10/2026, với PostgreSQL local và 10.013 Book demo. Đây là phép đo để tìm điểm nghẽn và phát hiện hồi quy, chưa phải SLA cho hệ thống triển khai Internet. Dữ liệu, CPU, RAM, cấu hình PostgreSQL và số người dùng đồng thời của môi trường thực có thể khác.

## Catalog

Script `scripts/benchmark-catalog.mjs` chạy warm-up rồi đo từng nhóm request, báo p50/p95, lỗi và requests/giây. Script `scripts/benchmark-catalog-concurrent.mjs` chạy 4 luồng, mỗi luồng 20 request. Giá trị dưới đây là p95 của lượt đo trên database demo; mỗi nhóm đều không có HTTP error:

| Truy vấn | PostgreSQL mặc định | Kết nối thử `jit=off` |
|---|---:|---:|
| Trang đầu | 32,7 ms | 21,8 ms |
| Trang sâu | 20,0 ms | 16,8 ms |
| Tên chính xác | 313,3 ms | 224,0 ms |
| Tiền tố | 732,1 ms | 182,1 ms |
| Gần đúng | 266,6 ms | 153,5 ms |
| Tác giả | 194,8 ms | 177,6 ms |
| Alias thể loại | 19,5 ms | 17,0 ms |
| Từ khóa + thể loại | 280,3 ms | 258,9 ms |
| Không có kết quả | 207,7 ms | 162,2 ms |
| Gợi ý | 216,8 ms | 131,8 ms |
| Chi tiết sách | 11,8 ms | 9,3 ms |

Ở mức 4 luồng × 20 request với cấu hình mặc định, p50/p95 request là 197,7/215,0 ms; p95 một đợt bốn request là 244,1 ms, thông lượng 19,0 request/giây, lỗi 0. Đây là tải kiểm soát trên một máy, không đại diện nhiều người dùng thật.

`EXPLAIN (ANALYZE, BUFFERS)` cho từ khóa `adventures` ghi khoảng 278 ms, trong đó PostgreSQL dành 72,8 ms tạo JIT. Một lượt thử tắt JIT trong transaction giảm truy vấn đó xuống 78,7 ms. Kết nối JDBC thử `?options=-c%20jit%3Doff` cũng cải thiện một số nhóm, nhưng các phép đo không chạy cùng lúc và có thể chịu ảnh hưởng cache. Chưa đổi mặc định hệ thống; cần đo lặp trên môi trường triển khai trước khi quyết định cấu hình PostgreSQL. CPU, RAM và I/O toàn hệ thống chưa được thu theo chuỗi thời gian chuẩn hóa.

## Kiểm kê

`InventoryLoadBenchmark` dùng PostgreSQL Testcontainers và dữ liệu cô lập. Mốc 5.000 Copy/100 scan: mở snapshot 489 ms, scan p50/p95 13,3/17,7 ms, finalize 689 ms. Mốc 1.000 Copy/250 scan: mở snapshot 78 ms, scan p50/p95 12,3/14,1 ms, finalize 104 ms. Heap mẫu ở lượt 5.000 Copy: trước 84,9 MiB, sau 94,0 MiB, mẫu cao nhất 104,9 MiB. Yêu cầu 5.001 Copy bị từ chối HTTP 422 trong 28 ms và không tạo session dở dang.

Phép đo này chưa lượng hóa riêng resolution của từng bất thường, lock contention khi nhiều nhân viên ghi cùng phiên, CPU của tiến trình hoặc máy quét barcode thật. Các bài integration khác kiểm tính đúng đắn và tranh chấp, không được dùng thay số đo tải.

Lượt kiểm lại với image PostgreSQL 17.11 trên cùng máy, sau khi chạy nhiều bài E2E và build desktop, cũng đạt 2/2 bài. Mốc 5.000 Copy/100 scan: mở 597 ms, scan p50/p95 14,4/18,5 ms, finalize 740 ms. Mốc 1.000 Copy/250 scan: mở 81 ms, scan p50/p95 13,9/26,4 ms, finalize 143 ms. 5.001 Copy bị từ chối trong 31 ms, không tạo session dở dang. Đây là hai lượt chạy khác thời điểm; chênh lệch không chứng minh PostgreSQL 17.11 nhanh hay chậm hơn 17.6 vì tải máy và cache đã thay đổi.

## Acquisition

Core/Insight/Web/EXE đã chạy E2E cho phân tích và quyết định đề xuất trên PostgreSQL cô lập. Chưa có bộ số liệu lặp đủ để báo p50/p95 riêng cho analysis, adapter, list/detail, CSV và 409 khi nhiều nhân viên thao tác. Trước khi đặt ngưỡng hiệu năng cho nghiệp vụ này cần fixture có số dòng đại diện, warm-up, tải đồng thời và theo dõi CPU/RAM hai service. Không thực hiện stress có ghi trên database demo chính.
