# Sao lưu và khôi phục dữ liệu

LAMS dùng hai database PostgreSQL độc lập: `lams_core` giữ tài khoản, Catalog, bản sách, lưu thông và kiểm kê; `lams_insight` giữ lịch sử tra ISBN, thông báo và đề xuất bổ sung. Không có transaction xuyên hai database. Hai lệnh `pg_dump` chạy lần lượt **không** tạo một snapshot nguyên tử của toàn hệ thống.

## Diễn tập trên máy phát triển

Chạy sau khi đã build Core và Insight, Docker Engine đang hoạt động:

```powershell
pwsh -NoProfile -File .\scripts\test-release-recovery.ps1
```

Script tạo một PostgreSQL tạm chỉ bind loopback và gắn nhãn riêng của lượt chạy. Core chạy Flyway trên database nguồn mới; Insight chạy Prisma migration trên database nguồn mới. Fixture gồm tài khoản nhân viên, Book/Edition/Copy và một đề xuất Acquisition. Script dump cả hai database ở định dạng custom, đọc mục lục archive, restore vào **hai database mới**, so số lượng hàng và migration history, rồi khởi động Core/Insight với database đã khôi phục. Nó đăng nhập, đọc Catalog, tra Copy bằng barcode, đọc đề xuất và tải CSV qua API thật. Dump chỉ nằm trong container tạm; script dọn đúng container được gắn nhãn. Log tiến trình thử nghiệm được xóa khi PASS; khi lỗi, log ở `.tools/` bị Git ignore để điều tra. Không đưa log hoặc dump vào commit.

Thời gian đo của bài này là thời gian trên máy phát triển với fixture nhỏ. Nó không phải RTO/RPO đã cam kết cho dữ liệu thật hoặc máy chủ khác. Kết quả từng lượt chạy phải gắn với SHA code, phiên bản PostgreSQL và thời gian thực tế; không dùng kết quả cũ cho bản phát hành mới.

## Backup trước migration hoặc khi có dữ liệu cần giữ

Người vận hành phải xác nhận đúng môi trường, role, tên database và vị trí lưu **ngoài repository**. Dùng PostgreSQL client cùng major với server, nơi lưu có giới hạn quyền đọc và mã hóa theo chính sách đơn vị. Lấy thông tin đăng nhập từ secret manager hoặc prompt; không đưa password vào URL, script, shell history hoặc artifact CI. Tạo hai file mới với timestamp, không ghi đè bản gần nhất:

```powershell
pg_dump --format=custom --no-owner --no-acl --dbname=lams_core --file=<duong-dan-core-moi.dump>
pg_dump --format=custom --no-owner --no-acl --dbname=lams_insight --file=<duong-dan-insight-moi.dump>
pg_restore --list <duong-dan-core-moi.dump>
pg_restore --list <duong-dan-insight-moi.dump>
```

Lưu cùng manifest gồm thời điểm bắt đầu/kết thúc từng dump, commit ứng dụng, phiên bản migration, SHA-256 của từng file, người thực hiện và phạm vi dữ liệu. `pg_restore --list` chỉ xác nhận archive đọc được; phải thử restore để chứng minh khả năng phục hồi. Nếu cần điểm nhất quán xuyên dịch vụ, dừng các thao tác ghi từ Core và Insight trong cửa sổ bảo trì được duyệt, chờ request/outbox đang xử lý hoàn tất, rồi mới dump cả hai. Không coi việc backup database Core trước Insight là tương đương transaction phân tán.

## Restore và mở lại dịch vụ

1. Khóa quyền truy cập file dump; xác minh checksum, môi trường, version ứng dụng và lịch migration. Giữ nguyên database nguồn để điều tra.
2. Tạo **hai database rỗng có tên mới** trong môi trường thử nghiệm hoặc vùng khôi phục được phê duyệt. Không restore đè demo, không `docker compose down -v`, `flyway clean` hay `prisma db push`.
3. Restore từng archive bằng `pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname=<database-moi> <dump>`. So `flyway_schema_history`, `_prisma_migrations`, số hàng và các bất biến nghiệp vụ: tài khoản, Book/Edition/Copy, Loan/Hold, phiên kiểm kê, lịch sử ISBN, đề xuất và quyết định.
4. Chạy đúng phiên bản Core/Insight tương thích với schema đã restore. Kiểm readiness, Auth, Catalog, Inventory, Acquisition và CSV qua API. Đối chiếu sự kiện outbox/notification có thể còn chờ hoặc đã gửi trước điểm backup; tránh phát lại thành hành động trùng bằng khóa idempotency và kiểm audit.
5. Chỉ đổi kết nối client trong cửa sổ bảo trì khi người chịu trách nhiệm dữ liệu và vận hành xác nhận. Ghi thời gian khôi phục thực tế, dữ liệu mất giữa hai mốc dump và các xử lý đối soát. Không rollback schema bằng cách sửa migration cũ. Nếu phải quay lại code cũ, trước tiên kiểm tương thích schema và giữ bản backup của trạng thái mới.

Core ngừng hoạt động thì Insight không xác minh được quyền nhân viên hoặc tải facts mới; không tạo đề xuất từ dữ liệu đoán. Insight ngừng hoạt động thì Core vẫn giữ Catalog và giao dịch của mình, nhưng lịch sử metadata/Acquisition không sẵn sàng. Sau khi phục hồi, kiểm lại đề xuất dựa trên snapshot Core, các quyết định đã ghi và backlog thông báo; không tự ghi đè evidence cũ. Yêu cầu xóa/ẩn danh đã được phê duyệt phải được áp dụng lại nếu restore từ backup cũ, trước khi mở truy cập.

Thời hạn giữ dump, nơi lưu bản sao ngoài máy và người có quyền giải mã vẫn cần đơn vị vận hành phê duyệt trước khi có dữ liệu production. Xem [vòng đời đề xuất](../03-du-lieu/vong-doi-de-xuat-bo-sung.md) và [lịch sử ISBN](../03-du-lieu/vong-doi-lich-su-isbn.md); hai loại dữ liệu này không dùng chung một mốc lưu giữ mặc định.
