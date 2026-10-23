# Lịch sử tra cứu ISBN và vòng đời Prisma

## Trách nhiệm và dữ liệu

Insight sở hữu `metadata_lookups` trong database Insight; Core vẫn sở hữu Book, Edition, Copy, Identity và Reviews/Favorites. Không có FK xuyên database hoặc bản sao Catalog. `owner_id` là UUID opaque được Core xác thực mỗi request, không lấy từ body. Không lưu email, tên, token, ảnh, tiêu đề hoặc payload provider.

Prisma `MetadataLookup`: UUID id, ownerId, isbn13, attempts (chỉ provider/status), createdAt. Các index owner/time/id và owner/ISBN phục vụ list và prefix filter. Migration `202610230001_metadata_lookup_history` bổ sung bảng, không sửa migration foundation. ISBN checksum được MetadataService kiểm trước khi gọi provider; DB còn kiểm đúng 13 chữ số. Hai lần tra cứu là hai sự kiện độc lập, không ép unique ISBN.

## Đường đi request

`StaffCatalogPage → MetadataHistory → history-api → MetadataGuard → HistoryController → HistoryService → HistoryRepository → PrismaService → PostgreSQL`.

Guard gọi Core `/auth/me`, kiểm role hiện tại, gắn actor bằng Symbol nội bộ. Mỗi request dùng chung limiter metadata 10 request/phút/actor/process; limiter chưa phân tán qua Redis. Principal không phải chủ sở hữu nhận 404 khi get/delete/replay, kể cả ADMIN. DELETE không ảnh hưởng sách.

POST `/metadata/history` tra provider trước, sau đó lưu dấu vết. Không giữ DB transaction khi chờ HTTP. Write thất bại trả 503, không trả thông báo đã lưu. Replay chỉ dùng ISBN của bản ghi thuộc owner để tra lại nguồn hiện tại, không tạo snapshot hoặc tự sửa Core. GET cũ `/metadata/books/{isbn13}` vẫn không ghi dữ liệu.

POST tạo lịch sử không idempotent. Khi mất response/timeout, tải lại danh sách trước khi gửi lại. Một request đã commit có thể hoàn thành dù client ngắt kết nối. Không tự retry POST vì lỗi mạng. Provider unavailable/not-found có thể được lưu như một sự kiện không có kết quả, không phải sách đã xác minh.

## Lifecycle, query và transaction

Nest tạo một PrismaService dùng chung module. `onModuleInit` kết nối; `enableShutdownHooks` và `onModuleDestroy` đóng pool. Vì vậy Insight hiện cần database truy cập được khi khởi động; health UP chỉ có sau initialization, nhưng không thay readiness database liên tục.

Repository dùng Prisma create/findFirst/deleteMany với owner trong WHERE; DTO projection không trả owner. Query list dùng transaction RepeatableRead cho count và items cùng snapshot, sort createdAt rồi id, page 0–1000000, size 1–100. Không ghép SQL người dùng. Xóa là một statement có điều kiện owner nên không cần read-then-delete transaction. Prisma errors được service đổi thành 503 không lộ SQL/credentials. Không dùng transaction hình thức cho HTTP provider.

## Thiết lập và kiểm thử

Node 22 theo `.node-version`. Cấu hình `INSIGHT_DATABASE_URL` bằng secret môi trường của database Insight, không dùng URL Core. Trên database được quản trị viên cho phép nâng cấp: `npm run prisma:generate`, `npm run prisma:deploy`, `npm run build`, `npm run start`. Không chạy `db push` lên dữ liệu thật. Sao lưu trước khi nâng cấp môi trường đang có dữ liệu.

`npm test` chạy unit/DTO/provider/guard và HTTP boundary với repository/provider/Core test doubles. `npm run test:integration` tự tạo PostgreSQL Docker tạm, port loopback ngẫu nhiên, không gắn volume dự án và không dùng URL dev. Chờ listener TCP thay vì server Unix socket tạm của initdb; khi kết thúc chỉ xóa container có đúng nhãn của lượt test và volume ẩn danh đi kèm. Test kiểm fresh migration, persistence sau reconnect, owner, filter/page và deploy lặp. Test upgrade tạo schema riêng từ foundation, baseline bằng migrate resolve rồi deploy migration mới, kiểm dữ liệu foundation còn nguyên. HTTP test không thay kiểm PostgreSQL; chỉ ghi PASS sau khi suite tương ứng chạy đạt.

E2E: `scripts/test-phase1-e2e.ps1` tạo Core và Insight databases trong container test riêng; thêm `-Desktop` để chạy cùng hành trình trên EXE đã build. Không chạy migration thử nghiệm lên database development.

Tham khảo: [Prisma v6 transaction](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), [Nest Prisma](https://docs.nestjs.com/recipes/prisma). Khả năng đáp ứng kỹ thuật không đồng nghĩa giảng viên đã chấp nhận kiến trúc hybrid.
