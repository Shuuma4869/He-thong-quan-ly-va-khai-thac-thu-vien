# Chạy LAMS trên local

## Yêu cầu

- Git.
- Java 21.
- Node.js 22.x và npm 10.x.
- Docker Desktop/Engine và Docker Compose.

Không cần Maven hệ thống. `mvnw.cmd` lưu Maven 3.9.11 trong cache người dùng, nên project chạy được từ đường dẫn có dấu và khoảng trắng.

## Khởi chạy lần đầu

Từ `<thu-muc-du-an>`:

```powershell
.\scripts\setup-desktop.ps1
.\scripts\bootstrap-local.ps1
.\scripts\smoke-test.ps1
.\scripts\check-quality.ps1
```

Bootstrap không ghi đè `.env` đã tồn tại và không xóa volume. Flyway chạy khi Core khởi động; Prisma migration được bootstrap deploy.
Mặc định Compose chỉ khởi động PostgreSQL, Redis và Kafka. MinIO không phục vụ ảnh Catalog hiện tại nên nằm trong profile `media` và không tiêu thụ tài nguyên khi khởi động thông thường.

## Chạy ứng dụng

Mở ba terminal tại root project:

```powershell
.\scripts\start-core.ps1
```

```powershell
.\scripts\start-insight.ps1
```

```powershell
.\scripts\start-desktop.ps1
```

Health:

- Core: `http://localhost:8080/api/v1/health`
- Actuator: `http://localhost:8080/actuator/health`
- Insight: `http://localhost:3000/api/v1/health`
- Frontend: `http://localhost:5173`

## Host và Docker network

| Dịch vụ | Từ Windows host | Trong Docker network |
|---|---|---|
| PostgreSQL | `localhost:15432` | `postgres:5432` |
| Redis | `localhost:16379` | `redis:6379` |
| Kafka | `localhost:19092` | `kafka:29092` |
| MinIO API (tùy chọn) | `localhost:19000` | `minio:9000` |
| MinIO Console (tùy chọn) | `localhost:19001` | `minio:9001` |

Ứng dụng chạy trực tiếp trên host dùng các giá trị `localhost` trong `.env`. Container ứng dụng phải được truyền URL service-name/internal-port; không dùng host port hoặc `localhost` để gọi container khác.

Chỉ khi cần kiểm tra MinIO riêng, chạy `docker compose --profile media up -d --build --wait minio` rồi `.\scripts\smoke-test.ps1 -IncludeMinio`. Profile này không xóa hoặc tạo lại volume khi dừng. Nếu máy đã có container MinIO chạy từ cấu hình cũ và không còn dùng, `docker compose stop minio` sẽ hạ dịch vụ mà giữ dữ liệu.

## Database và migration

PostgreSQL init script tạo `lams_core` và `lams_insight` khi volume mới được khởi tạo lần đầu. Thay đổi init script không tự chạy lại trên volume cũ.

```powershell
cd backend\insight-service
npm run prisma:validate
npm run prisma:generate
npm run prisma:deploy
```

Các lệnh Prisma cần `INSIGHT_DATABASE_URL` đã được nạp vào môi trường terminal. Từ root PowerShell có thể dùng `. .\scripts\common.ps1` rồi `Import-LamsEnv` trước khi `cd`; không in URL/secret ra log. Bootstrap đã thực hiện bước này.

Không dùng `prisma db push` thay migration. Core chạy chuỗi Flyway V1–V15 trên database mới; V14/V15 thuộc backend Favorites/Reviews/Rating. Insight chạy foundation và `202610230001_metadata_lookup_history`. Sau khi pull thay đổi Phase 2.5 vào môi trường có dữ liệu: sao lưu theo quy trình vận hành, chạy `npm ci`, `npm run prisma:generate`, `npm run prisma:deploy` tại Insight trước khi restart. Frontend cũng cần `npm ci` vì bổ sung React-Bootstrap. Không dùng database development để thử migration thất bại.

Insight từ Phase 2.5 yêu cầu PostgreSQL sẵn sàng khi khởi động. Nếu không kết nối được, sửa cấu hình/database trước; không thay bằng JSON hoặc bỏ lifecycle Prisma. Kiểm database cô lập bằng `npm run test:integration`; hành trình UI thật bằng `.\scripts\test-phase1-e2e.ps1` tại root, thêm `-Desktop` cho EXE đã build. Xem [vòng đời ORM](../02-kien-truc/metadata-history-orm.md).

## Dừng an toàn

```powershell
.\scripts\stop-infra.ps1
```

Script chỉ chạy `docker compose down`, không xóa named volume. Xem [xử lý lỗi môi trường](xu-ly-loi-moi-truong.md) trước khi can thiệp dữ liệu.

## Desktop và web

Mặc định dùng cửa sổ Tauri trên Windows. [Runbook desktop](desktop-windows.md) ghi prerequisite, lệnh build EXE/bộ cài, cookie/CORS và E2E WebView2. Vite chỉ chạy khi dev; release không cần cổng 5173. Muốn kiểm web riêng thì chạy npm run dev trong frontend, không chạy đồng thời desktop dev trên cùng cổng. Backend và database vẫn khởi động riêng.
