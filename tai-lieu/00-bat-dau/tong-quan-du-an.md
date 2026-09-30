# Tổng quan dự án LAMS

## Bài toán và mục tiêu

LAMS hợp nhất việc tra cứu, lưu thông và quản lý tồn kho thư viện. Người đọc cần biết tài liệu nào tồn tại và có thể tiếp cận; thủ thư cần trạng thái bản vật lý đáng tin; quản trị viên cần chính sách, audit và dữ liệu nhu cầu. Hiện dự án đã có nền tảng kỹ thuật và phần xác thực của Phase 1A; các nghiệp vụ thư viện sẽ được phát triển theo từng giai đoạn.

## Actors

- **READER:** tìm tài liệu, theo dõi khoản mượn/giữ chỗ và hồ sơ cá nhân.
- **LIBRARIAN:** vận hành quầy mượn trả, catalog, copy, hold và kiểm kê.
- **ADMIN:** quản lý người dùng/quyền, chính sách, audit và cấu hình.

## Scope

Repository hiện có React, Spring, NestJS, PostgreSQL, Redis, Kafka, MinIO, contract, tài liệu vận hành và kiểm thử nền. Danh tính và đăng nhập đã được triển khai. Member/Profile, catalog, bản sách, mượn/trả/gia hạn và giữ chỗ là các phần việc tiếp theo.

## Ngoài phạm vi hiện tại

Chưa có CRUD nghiệp vụ thư viện, semantic search, thuật toán phân bổ giữ chỗ, kiểm kê theo kệ, đề xuất bổ sung sách, tích hợp metadata/email thật hoặc triển khai production.

## Flagship features định hướng

Smart Discovery, Smart Hold & Availability, Live Shelf Audit và Demand-to-Acquisition Intelligence hiện mới có tài liệu thiết kế, chưa có luồng nghiệp vụ hoàn chỉnh.

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
