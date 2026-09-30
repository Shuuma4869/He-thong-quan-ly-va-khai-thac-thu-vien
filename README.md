# LAMS — Library Access & Management System

LAMS là nền tảng quản lý và khai thác thư viện: giúp người đọc tìm và tiếp cận tài liệu, đồng thời hỗ trợ thủ thư quản lý lưu thông, tồn kho và nhu cầu sử dụng sách.

## Trạng thái

Nền tảng kỹ thuật và Auth Phase 1A đã có trên `main`: Core quản lý tài khoản, vai trò, đăng ký, đăng nhập và phiên đăng nhập; frontend có màn hình đăng nhập, đăng ký và bảo vệ route nhân viên. Member/Profile, catalog CRUD, mượn/trả và các tính năng tìm kiếm nâng cao vẫn chưa triển khai. Đây chưa phải sản phẩm hoàn chỉnh.

## Kiến trúc ngắn

- `frontend`: React + TypeScript + Vite, UI tiếng Việt theo feature.
- `backend/core-service`: Java 21 + Spring Boot, sở hữu dữ liệu và giao dịch cốt lõi.
- `backend/insight-service`: NestJS + Prisma, dành cho discovery, analytics và tích hợp bất đồng bộ.
- `PostgreSQL`: hai database `lams_core`, `lams_insight`; là source of truth.
- `Redis`, `Kafka`, `MinIO`: cache/coordination, event transport và object storage.

## Yêu cầu môi trường

Git, Java 21, Node.js 22.x, npm 10.x, Docker Engine/Desktop và Docker Compose. Version được pin trong `.java-version`, `.nvmrc`, `.node-version` và `package.json`. Maven hệ thống không bắt buộc vì Core có Maven Wrapper 3.9.11.

## Khởi chạy lần đầu

Từ thư mục clone trên Windows PowerShell:

```powershell
.\scripts\bootstrap-local.ps1
.\scripts\smoke-test.ps1
.\scripts\check-quality.ps1
```

Bootstrap kiểm tra prerequisite, tạo `.env` nếu thiếu, chạy `npm ci`, Prisma validate/generate/deploy và khởi động hạ tầng. Script không ghi đè `.env` và không xóa volume.

Sau đó mở ba terminal tại root project:

```powershell
.\scripts\start-core.ps1

cd backend\insight-service
npm run start:dev

cd frontend
npm run dev
```

Frontend: `http://localhost:5173`; Core health: `http://localhost:8080/api/v1/health`; Insight health: `http://localhost:3000/api/v1/health`.

## Kiểm thử và build

```powershell
.\scripts\check-quality.ps1
```

## Cấu trúc

- `backend/`: hai service có trách nhiệm tách biệt.
- `frontend/`: router, layout và feature UI.
- `contracts/`: OpenAPI hiện thực tối thiểu và AsyncAPI planned.
- `infra/`: PostgreSQL init, Nginx, Kafka và monitoring foundation.
- `tai-lieu/`: yêu cầu, kiến trúc, dữ liệu, workflow, API, UI, test, vận hành, demo.
- `kiem-thu/`: nơi dành cho kiểm thử xuyên service.
- `ho-so-nop-bai/`: khung lưu minh chứng ở các giai đoạn sau.

Đọc [hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md), [xử lý lỗi môi trường](tai-lieu/08-van-hanh/xu-ly-loi-moi-truong.md) và [pre-push gate](tai-lieu/08-van-hanh/pre-push-gate.md) khi cần chi tiết.
