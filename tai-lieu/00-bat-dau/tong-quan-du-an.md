# Tổng quan dự án LAMS

## Bài toán và mục tiêu

LAMS hợp nhất việc tra cứu, lưu thông và quản lý tồn kho thư viện. Người đọc cần biết tài liệu nào tồn tại và có thể tiếp cận; thủ thư cần trạng thái bản vật lý đáng tin; quản trị viên cần chính sách, audit và dữ liệu nhu cầu. Giai đoạn 01 chỉ xây nền tảng kỹ thuật để hai developer phát triển độc lập.

## Actors

- **READER:** tìm tài liệu, theo dõi khoản mượn/giữ chỗ và hồ sơ cá nhân.
- **LIBRARIAN:** vận hành quầy mượn trả, catalog, copy, hold và kiểm kê.
- **ADMIN:** quản lý người dùng/quyền, chính sách, audit và cấu hình.

## Scope

Foundation gồm React, Spring, NestJS, PostgreSQL, Redis, Kafka, MinIO, contract, sơ đồ, test foundation và runbook. MVP tương lai gồm danh tính, catalog, copy, mượn/trả/gia hạn và hold cơ bản.

## Ngoài phạm vi hiện tại

Không có auth production, CRUD nghiệp vụ, semantic search, thuật toán phân bổ hold, live shelf audit, recommendation, tích hợp metadata/email thật hoặc triển khai production.

## Flagship features định hướng

Smart Discovery, Smart Hold & Availability, Live Shelf Audit và Demand-to-Acquisition Intelligence. Chúng mới có boundary và design notes.

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
