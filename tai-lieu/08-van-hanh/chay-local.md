# Chạy LAMS trên local

## 1. Chuẩn bị

Yêu cầu Git, Java 21, Node 20+, npm 10+, Docker và Docker Compose. Từ `D:\LAMS`:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up -d postgres redis kafka minio
docker compose ps
```

Compose tạo project `lams` với named volume riêng; không chạy `docker compose down -v` nếu muốn giữ dữ liệu.

Image MinIO local dùng gói Alpine có tag cố định và chạy quyền root chỉ để khởi tạo named volume trên Docker Desktop. Không tái sử dụng cấu hình này cho production; production phải dùng image đã review, user không đặc quyền và storage policy riêng.

## 2. Migration và service

Core tự chạy Flyway `V1__foundation.sql` khi khởi động:

```powershell
cd backend/core-service
.\mvnw.cmd spring-boot:run
```

Insight dùng Prisma; lần đầu:

```powershell
cd backend/insight-service
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run start:dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

## 3. Kiểm tra

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
Invoke-RestMethod http://localhost:8080/api/v1/health
Invoke-RestMethod http://localhost:3000/api/v1/health
```

## 4. Build/test

```powershell
cd backend/core-service; .\mvnw.cmd test; .\mvnw.cmd package
cd ../insight-service; npm test; npm run build
cd ../../frontend; npm run typecheck; npm test; npm run lint; npm run build
```

## 5. Dừng hạ tầng

```powershell
cd D:\LAMS
docker compose down
```

Nếu port 5432/6379/9092/9000/9001 bận, đổi port host trong `.env`; URL chạy local phải khớp. Không commit `.env`.
