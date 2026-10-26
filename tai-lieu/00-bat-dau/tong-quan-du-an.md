# Tổng quan dự án LAMS

## Bài toán và mục tiêu

LAMS hợp nhất việc tra cứu, lưu thông và quản lý tồn kho thư viện. Người đọc cần biết tài liệu nào tồn tại và có thể tiếp cận; thủ thư cần trạng thái bản vật lý đáng tin; quản trị viên cần kiểm kê và dữ liệu nhu cầu. Ứng dụng đã có giao diện Windows bằng Tauri, Catalog, lưu thông/giữ chỗ và phiên kiểm kê. Tìm kiếm từ vựng đã có trên Web/EXE; đề xuất bổ sung sách trên nhánh Tuan mới được kiểm ở từng lớp, chưa có E2E xuyên dịch vụ.

## Actors

- **READER:** tìm tài liệu, theo dõi khoản mượn/giữ chỗ và hồ sơ cá nhân.
- **LIBRARIAN:** vận hành quầy mượn trả, catalog, copy, hold và kiểm kê.
- **ADMIN:** quản lý người dùng/quyền, chính sách, audit và cấu hình.

## Scope

Repository dùng Tauri/WebView2 + React, Spring Core, NestJS Insight và PostgreSQL. Auth, Member/Profile chỉ đọc, Catalog/Edition/Copy, Favorites/Reviews/Rating, mượn/trả/gia hạn, giữ chỗ, lịch sử và báo cáo lưu thông, duyệt ảnh, lịch sử ISBN và kiểm kê kệ đã có luồng nghiệp vụ và test. Catalog có tìm kiếm từ vựng được xếp hạng và lọc theo bí danh thể loại. Redis, Kafka và MinIO có cấu hình hoặc vai trò kiến trúc riêng, không được coi là điều kiện để các luồng trên hoạt động. Xem [phân công và đầu ra](huong-dan-thanh-vien.md).

## Ngoài phạm vi hiện tại

Chưa có tìm kiếm ngữ nghĩa/vector, đề xuất bổ sung sách được duyệt thành quy trình mua, dữ liệu zero-result search, tích hợp email ngoài hoặc triển khai production đã nghiệm thu. Metadata tra cứu từ nhà cung cấp vẫn cần nhân viên xác nhận trước khi ghi vào Catalog; Google Books đang tắt.

## Flagship features định hướng

Smart Hold & Availability và Live Shelf Audit đã có các luồng giao dịch/kiểm kê chính. Smart Discovery hiện có metadata lookup và tìm kiếm từ vựng, chưa có semantic search. Demand-to-Acquisition Intelligence đã có phép tính và luồng đề xuất nội bộ trên nhánh Tuan; chưa có E2E xuyên dịch vụ hoặc quy trình mua sách.

## Glossary

| Thuật ngữ | Nghĩa |
|---|---|
| Book | Tác phẩm logic, độc lập ấn bản |
| Edition | Một ấn bản cụ thể, ISBN/publisher/năm |
| Copy | Bản vật lý có barcode riêng |
| Hold | Yêu cầu xếp hàng chờ một tác phẩm/ấn bản |
| Loan | Giao dịch một copy được mượn bởi reader |
| Shelf audit | Kiểm kê thực tế theo kệ |
| Outbox | Bảng event ghi cùng transaction rồi publish sau |
