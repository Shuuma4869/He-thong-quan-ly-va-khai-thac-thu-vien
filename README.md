# LAMS — Library Access & Management System

LAMS là nền tảng quản lý và khai thác thư viện: giúp người đọc tìm và tiếp cận tài liệu, đồng thời hỗ trợ thủ thư quản lý lưu thông, tồn kho và nhu cầu sử dụng sách.

## Trạng thái

Đây là **starter/foundation của Giai đoạn 01**, chưa phải sản phẩm hoàn chỉnh. Repository có ứng dụng chạy tối thiểu, database thật, ranh giới module, contract và tài liệu thiết kế; chưa có auth production, catalog CRUD, mượn/trả hay các tính năng thông minh.

## Kiến trúc ngắn

- `frontend`: React + TypeScript + Vite, UI tiếng Việt theo feature.
- `backend/core-service`: Java 21 + Spring Boot, sở hữu dữ liệu và giao dịch cốt lõi.
- `backend/insight-service`: NestJS + Prisma, dành cho discovery, analytics và tích hợp bất đồng bộ.
- `PostgreSQL`: hai database `lams_core`, `lams_insight`; là source of truth.
- `Redis`, `Kafka`, `MinIO`: cache/coordination, event transport và object storage.

## Yêu cầu môi trường

Git, Java 21, Node.js 20+, npm 10+, Docker Engine/Desktop và Docker Compose. Maven hệ thống không bắt buộc vì `core-service` có Maven Wrapper tự quản lý Maven 3.9.11.

## Chạy local

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis kafka minio

cd backend/core-service
.\mvnw.cmd spring-boot:run

cd ../insight-service
npm install
npm run prisma:generate
npm run start:dev

cd ../../frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`; Core health: `http://localhost:8080/api/v1/health`; Insight health: `http://localhost:3000/api/v1/health`.

## Kiểm thử và build

```powershell
cd backend/core-service; .\mvnw.cmd test; .\mvnw.cmd package
cd ../insight-service; npm test; npm run build
cd ../../frontend; npm run typecheck; npm test; npm run build; npm run lint
cd ..; docker compose config --quiet
```

## Cấu trúc

- `backend/`: hai service có trách nhiệm tách biệt.
- `frontend/`: router, layout và feature UI.
- `contracts/`: OpenAPI hiện thực tối thiểu và AsyncAPI planned.
- `infra/`: PostgreSQL init, Nginx, Kafka và monitoring foundation.
- `tai-lieu/`: yêu cầu, kiến trúc, dữ liệu, workflow, API, UI, test, vận hành, demo.
- `kiem-thu/`: nơi dành cho kiểm thử xuyên service.
- `ho-so-nop-bai/`: khung lưu minh chứng ở các giai đoạn sau.

Đọc [hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md) và [tổng quan dự án](tai-lieu/00-bat-dau/tong-quan-du-an.md) trước khi phát triển.
