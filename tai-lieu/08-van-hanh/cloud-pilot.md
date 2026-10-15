# Pilot Core HTTPS và PostgreSQL tập trung

Tuan phụ trách triển khai, vận hành, desktop, CI/CD và nghiệm thu Windows. Toan giữ phạm vi module trong [hướng dẫn thành viên](../00-bat-dau/huong-dan-thanh-vien.md), không có nhiệm vụ cloud hoặc desktop trong bước này.

Repository mới chuẩn bị cấu hình; chưa tạo tài khoản, database hoặc dịch vụ cloud. Không dùng URL mẫu để phát hành installer. Cần chủ dự án duyệt tài khoản, quyền GitHub và hạn mức trước khi tạo tài nguyên. Không bật billing hoặc nâng gói tự động.

## Phương án pilot

Chọn Render Free cho một Core container và Neon Free cho PostgreSQL. Render cấp HTTPS; không cần mua domain hoặc dựng reverse proxy riêng. Phase 1 chưa cần Insight, Redis, Kafka, MinIO trên cloud; các thành phần đó vẫn giữ trong kiến trúc và môi trường local.

Theo [Render Free](https://render.com/docs/free), dịch vụ ngủ sau 15 phút không có lưu lượng, cold start khoảng một phút; 750 giờ miễn phí dùng chung trong workspace mỗi tháng. Filesystem tạm, không dùng để lưu ảnh hoặc backup. Hết quota có thể bị dừng; khi có phương thức thanh toán, vượt bandwidth/build quota có thể tính phí. Database Render Free hết hạn sau 30 ngày nên không chọn cho pilot này. Gói Free không phù hợp production.

[Neon Free](https://neon.com/pricing) tại thời điểm đối chiếu 15/10/2026 có 100 CU-giờ/tháng/project, 1 GB/project, compute tối đa 2 CU/8 GB; không yêu cầu thẻ và không giới hạn thời gian gói. Hạn mức không phải cam kết luôn bật compute tối đa. Kiểm tra lại trang giá và bảng usage trước khi tạo, demo và mở rộng.

Phương án dự phòng là VM Oracle Always Free tự vận hành Core/PostgreSQL. Cần kiểm tra vùng còn capacity, xác minh tài khoản, chính sách thu hồi máy idle và trách nhiệm vá máy/backup. Không cấu hình song song hai nhà cung cấp khi Render + Neon còn đáp ứng pilot; xem [điều kiện Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) trước khi đổi phương án.

## Thứ tự thiết lập khi đã có tài khoản

1. Tạo project Neon Free, PostgreSQL 17 và database `lams_core` riêng cho pilot; chọn vùng gần Core. Không dùng dữ liệu cá nhân thật cho thử nghiệm.
2. Lấy hostname **direct**, không dùng pooled endpoint cho Flyway. Lưu username/password trong phần secret của Render, không chép vào Git hoặc frontend.
3. Review/merge PR vào main theo quy trình. Tạo Render Blueprint từ `infra/pilot/render.yaml`, xác nhận plan Free. Nếu giao diện không cho chọn đường dẫn Blueprint, tạo Docker Web Service thủ công với cùng trường cấu hình; không di chuyển file vào root chỉ để tự động deploy.
4. Điền các biến theo `infra/pilot/server.env.example`. `LAMS_JWT_SECRET` được Blueprint tạo; nếu cấu hình thủ công, dùng secret ngẫu nhiên đủ mạnh, tối thiểu 32 byte. Không dùng giá trị local. JDBC URL không chứa password; giữ `sslmode=verify-full` và Java SSL factory dùng trust store chuẩn.
5. `CORS_ALLOWED_ORIGINS=https://tauri.localhost`; chỉ thêm origin web HTTPS thực tế nếu đã triển khai web. Không wildcard, không path hoặc dấu `/` cuối origin. Bật `SPRING_PROFILES_ACTIVE=pilot`.
6. Deploy thủ công từ commit đã review. Blueprint tắt tự deploy. Kiểm tra migration, readiness và memory trước khi build client. Nếu Free không đủ RAM/startup time, ghi nhận giới hạn; không tự nâng gói.

Profile pilot dùng pool tối đa 4 kết nối, graceful shutdown 20 giây, log JSON ECS và chỉ expose Actuator health. `/actuator/health/readiness` kiểm cả database; `/api/v1/health` chỉ cho biết tiến trình phản hồi. Redis không tham gia health pilot vì Phase 1 chưa dùng. Container Core chạy user không phải root.

Trước khi triển khai, có thể kiểm image và diễn tập backup/restore local bằng `scripts/test-pilot-container.ps1`. Script tạo mạng và PostgreSQL tạm, giới hạn Core 512 MiB RAM, đăng ký một tài khoản test, dump/restore sang database rỗng và đối chiếu số tài khoản. Sau đó chỉ dọn container/mạng có nhãn đúng lượt chạy; không truy cập database dev hoặc cloud. Không coi phép thử này là nghiệm thu tài nguyên CPU/RAM hay TLS của Render thực tế.

## Build và nghiệm thu client

```powershell
.\scripts\build-desktop.ps1 -Environment pilot -CoreApiUrl 'https://TEN-DICH-VU.onrender.com/api/v1'
```

Với web, chép `frontend/.env.pilot.example` thành `.env.pilot.local`, thay URL thật rồi chạy `npm run typecheck` và `npx vite build --mode pilot` trong frontend. Tất cả biến `VITE_*` là công khai trong bundle, không chứa secret. Không cần URL Insight khi Phase 1 chưa dùng dịch vụ này.

Client pilot bắt buộc HTTPS, timeout mặc định 15 giây (`VITE_API_TIMEOUT_MS`, tối đa 120000). Khi Core đang ngủ, lần đầu có thể timeout; chờ máy chủ hoạt động rồi thử lại. Không dùng ping giữ dịch vụ thức liên tục để né chính sách miễn phí. Không tự retry thao tác ghi khi timeout vì server có thể đã xử lý thành công.

Cookie khác site dùng Secure/HttpOnly/SameSite=None. Mọi POST Auth phải có Origin HTTPS được cho phép và `X-LAMS-Client: 1`. Không tắt bộ lọc hoặc chuyển refresh token vào localStorage nếu policy WebView2 chặn cookie. Phải kiểm thực tế register/login, reload/khởi động lại, rotate, logout, Reader bị chặn staff, Librarian/Admin, lỗi mạng và cold start. Kiểm trên máy Windows thứ hai trước phát hành; build thành công không chứng minh phiên HTTPS đã hoạt động.

## Migration, backup và khôi phục

Flyway chạy khi Core khởi động, Hibernate chỉ validate. Không sửa migration đã áp dụng, không dùng `ddl-auto=update`, không chạy `clean`. Trước mỗi thay đổi schema, backup và thử migration trên database riêng. Chỉ triển khai một Core instance ở pilot.

Backup thủ công cần PostgreSQL client 17 tương thích, `pg_dump`, `pg_restore`, `psql` và `createdb`. Cấu hình PGHOST/PGPORT/PGUSER/PGDATABASE của pilot qua môi trường, `PGSSLMODE=verify-full` và CA tin cậy theo nhà cung cấp. Dùng password prompt hoặc password manager; không đưa password vào URL/lệnh/history. Ví dụ lưu dump **ngoài repository** tại thư mục riêng đã chuẩn bị:

```powershell
pg_dump --format=custom --no-owner --no-acl --file 'D:\LAMS-backups\core-before-migration.dump'
if ($LASTEXITCODE -ne 0) { throw 'Backup thất bại; không tiếp tục deploy.' }
pg_restore --list 'D:\LAMS-backups\core-before-migration.dump'
```

Chọn tên file mới cho mỗi backup, không ghi đè bản gần nhất. Dump có dữ liệu tài khoản và hash token: giới hạn quyền đọc, lưu trên ổ mã hóa, không đưa lên Git/PR/artifact công khai. `--list` chỉ kiểm cấu trúc archive, chưa chứng minh restore thành công.

Thử restore vào **database mới, rỗng**, khác database ứng dụng. Ví dụ sau chỉ thực hiện khi đã xác nhận tên chưa tồn tại và role có quyền tạo database:

```powershell
createdb lams_restore_check
if ($LASTEXITCODE -ne 0) { throw 'Không tạo được database mới; không restore vào database có sẵn.' }
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname lams_restore_check 'D:\LAMS-backups\core-before-migration.dump'
if ($LASTEXITCODE -ne 0) { throw 'Restore thất bại; giữ database kiểm tra để điều tra.' }
```

Chạy Core với database kiểm tra, xác nhận Flyway history và dữ liệu/chức năng; không để client thật kết nối vào đó. Không có lệnh drop/clean trong quy trình này. Hiện chưa diễn tập backup/restore trên Neon và chưa có lịch backup tự động; phải hoàn tất trước khi nhận dữ liệu cần giữ lâu dài. Nên backup trước migration và hàng ngày khi pilot có dữ liệu; Tuan chịu trách nhiệm lưu bản sao và kiểm restore định kỳ.

## Theo dõi và rollback

- Xem log JSON, request ID, readiness, memory và quota tại dashboard. Không ghi token/password hoặc nội dung cookie vào log hỗ trợ.
- Khi deploy lỗi, dừng rollout, xem lỗi migration/SSL/secrets và chỉ rollback image/commit khi tương thích schema. Không rollback schema bằng cách xóa migration hay khôi phục đè dữ liệu mới.
- Nếu cần phục hồi dữ liệu, restore sang database mới, đối chiếu rồi mới đổi kết nối trong cửa sổ bảo trì được duyệt. Giữ database cũ để điều tra.
- Desktop local và pilot dùng cùng identifier/version hiện tại. Chưa có updater hoặc signing; không tự phát hành GitHub Release. Trước phát hành phải có version riêng, checksum, kiểm máy sạch, ký update và phương án phục hồi. Tauri update signing khác với Windows Authenticode.

Tham khảo: [Render Blueprint](https://render.com/docs/blueprint-spec), [PostgreSQL JDBC SSL](https://jdbc.postgresql.org/documentation/ssl/), [hướng dẫn Windows](desktop-windows.md).
