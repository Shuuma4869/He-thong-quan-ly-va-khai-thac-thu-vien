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
.\scripts\bootstrap-local.ps1
.\scripts\smoke-test.ps1
.\scripts\check-quality.ps1
```

Bootstrap không ghi đè `.env` đã tồn tại và không xóa volume. Flyway chạy khi Core khởi động; Prisma migration được bootstrap deploy.

## Chạy ứng dụng

Mở ba terminal tại root project:

```powershell
.\scripts\start-core.ps1
```

```powershell
cd backend\insight-service
npm run start:dev
```

```powershell
cd frontend
npm run dev
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
| MinIO API | `localhost:19000` | `minio:9000` |
| MinIO Console | `localhost:19001` | `minio:9001` |

Ứng dụng chạy trực tiếp trên host dùng các giá trị `localhost` trong `.env`. Container ứng dụng phải được truyền URL service-name/internal-port; không dùng host port hoặc `localhost` để gọi container khác.

## Database và migration

PostgreSQL init script tạo `lams_core` và `lams_insight` khi volume mới được khởi tạo lần đầu. Thay đổi init script không tự chạy lại trên volume cũ.

```powershell
cd backend\insight-service
npm run prisma:validate
npm run prisma:generate
npm run prisma:deploy
```

Không dùng `prisma db push` thay migration. Core chạy Flyway `V1__foundation.sql` khi khởi động.

## Dừng an toàn

```powershell
.\scripts\stop-infra.ps1
```

Script chỉ chạy `docker compose down`, không xóa named volume. Xem [xử lý lỗi môi trường](xu-ly-loi-moi-truong.md) trước khi can thiệp dữ liệu.
