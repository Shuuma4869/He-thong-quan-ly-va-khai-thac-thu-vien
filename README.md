# LAMS — Library Access & Management System

LAMS là nền tảng quản lý và khai thác thư viện: giúp người đọc tìm và tiếp cận tài liệu, đồng thời hỗ trợ thủ thư quản lý lưu thông, tồn kho và nhu cầu sử dụng sách.

## Trạng thái

Auth Phase 1A và Member backend chỉ đọc của Phase 1B đã có trên `main`. Phase 1C bổ sung trang `/ho-so` cho người đã đăng nhập và `/nhan-vien/thanh-vien` cho LIBRARIAN/ADMIN, dùng API thật và hỗ trợ tìm kiếm/lọc/sắp xếp/phân trang. Phạm vi và đầu ra công việc được quản lý trong [hướng dẫn thành viên](tai-lieu/00-bat-dau/huong-dan-thanh-vien.md); kết quả từng lần chạy xem ở CI của PR.

Profile hiện chỉ đọc; `profile: null` là chủ đích, không có form sửa, bảng Member riêng hoặc PATCH. Phase 2 có Catalog/Inventory API, giao diện tra cứu và quản trị tám loại dữ liệu, metadata theo ISBN và tham chiếu ảnh duyệt thủ công. Xem [hợp đồng Catalog](tai-lieu/05-api-va-event/catalog-contract.md) và [kiến trúc Catalog/media](tai-lieu/02-kien-truc/catalog-media.md). Mượn/trả, My Library và tìm kiếm nâng cao chưa triển khai; đây chưa phải sản phẩm hoàn chỉnh.

## Kiến trúc ngắn

Phase 2.5 đang được kiểm chứng ở [PR #12](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/12): Insight có lịch sử tra cứu ISBN dùng Prisma/PostgreSQL, giao diện ở nút “Lịch sử tra cứu ISBN” trong trang quản trị danh mục. PostgreSQL và E2E web đã chạy trên CI; E2E EXE còn cần nghiệm thu trên Windows. Xem [ORM và giới hạn](tai-lieu/02-kien-truc/metadata-history-orm.md), [User Stories](tai-lieu/01-yeu-cau/user-stories.md), [wireframe](tai-lieu/06-giao-dien/wireframes.md) và [gate hiện hành](ho-so-nop-bai/doi-chieu-rubric.md). Chưa tuyên bố Phase 2.5 hoàn thành toàn bộ.

Main đã có backend Favorites/Reviews/Rating từ PR #11; UI My Library và các chức năng này chưa triển khai. Không chuyển chúng sang NestJS trong Phase 2.5.

- `frontend`: Tauri 2 + WebView2 trên Windows; React + TypeScript + Vite dùng chung UI theo feature. Bản release mở cửa sổ riêng, không cần Chrome/Vite.
- `backend/core-service`: Java 21 + Spring Boot, sở hữu dữ liệu và giao dịch cốt lõi.
- `backend/insight-service`: NestJS + Prisma, dành cho discovery, analytics và tích hợp bất đồng bộ.
- `PostgreSQL`: hai database `lams_core`, `lams_insight`; là source of truth.
- `Redis`, `Kafka`, `MinIO`: hạ tầng cho cache/coordination, event transport và object storage theo roadmap; không coi dịch vụ có trong Compose là nghiệp vụ đã tích hợp.

## Yêu cầu môi trường

Git, Java 21, Node.js 22.x, npm 10.x, Docker Engine/Desktop và Docker Compose. Version được pin trong `.java-version`, `.nvmrc`, `.node-version` và `package.json`. Maven hệ thống không bắt buộc vì Core có Maven Wrapper 3.9.11.

## Khởi chạy desktop Windows

Từ thư mục clone trên Windows PowerShell:

```powershell
.\scripts\setup-desktop.ps1
.\scripts\bootstrap-local.ps1
.\scripts\smoke-test.ps1
.\scripts\check-quality.ps1
```

Bootstrap kiểm tra prerequisite, tạo `.env` nếu thiếu, chạy `npm ci`, Prisma validate/generate/deploy và khởi động hạ tầng. Script không ghi đè `.env` và không xóa volume.

Sau đó mở ba terminal tại root project:

```powershell
.\scripts\start-core.ps1

.\scripts\start-insight.ps1

.\scripts\start-desktop.ps1
```

Desktop mở bằng lệnh trên; Core health: `http://localhost:8080/api/v1/health`; Insight health: `http://localhost:3000/api/v1/health`.

Xem [hướng dẫn desktop Windows](tai-lieu/08-van-hanh/desktop-windows.md) để build EXE/bộ cài, yêu cầu C++/Rust/WebView2 và xử lý lỗi. Backend/database vẫn chạy riêng; bộ cài giao diện chưa phải gói offline toàn hệ thống. Chế độ web vẫn có thể chạy `npm run dev` trong frontend để phát triển/kiểm thử.

[Cấu hình pilot Render + Neon](tai-lieu/08-van-hanh/cloud-pilot.md) đã được chuẩn bị cho Core HTTPS và PostgreSQL tập trung. Đây là cấu hình để triển khai sau khi có tài khoản, không phải thông báo đã có máy chủ hoạt động. Chưa có updater, ký số hay nghiệm thu trên máy Windows thứ hai.

## Kiểm thử và build

```powershell
.\scripts\check-quality.ps1
```

E2E Auth/Member/Catalog: `scripts/test-phase1-e2e.ps1`; thêm `-Desktop` để chạy trên EXE/WebView2 sau khi build. Kiểm toàn bộ OpenAPI bằng Python 3.12+ trong môi trường riêng: `python -m pip install -r contracts/openapi/requirements.txt`, rồi `python scripts/validate-openapi.py`. CI có job `api-contracts` riêng, không chỉ parse YAML.

Ảnh chưa duyệt dùng placeholder/initials. Tra cứu metadata cần Insight và Core cùng chạy; Google Books mặc định tắt, chỉ bật khi có server API key và kiểm tra điều kiện sử dụng. Không đưa key vào frontend. [Chiến lược media](tai-lieu/03-du-lieu/media-strategy.md) nêu cấu hình, quyền sử dụng và giới hạn hiện tại.

## Cấu trúc

- `backend/`: hai service có trách nhiệm tách biệt.
- `frontend/`: router, layout và feature UI.
- `contracts/`: OpenAPI hiện thực tối thiểu và AsyncAPI planned.
- `infra/`: PostgreSQL init, Nginx, Kafka và monitoring foundation.
- `tai-lieu/`: yêu cầu, kiến trúc, dữ liệu, workflow, API, UI, test, vận hành, demo.
- `kiem-thu/`: nơi dành cho kiểm thử xuyên service.
- `ho-so-nop-bai/`: báo cáo nguồn học phần, ma trận rubric và ảnh minh chứng có nguồn/SHA; mẫu trường và video thật còn cần bổ sung.

Đọc [hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md), [xử lý lỗi môi trường](tai-lieu/08-van-hanh/xu-ly-loi-moi-truong.md) và [pre-push gate](tai-lieu/08-van-hanh/pre-push-gate.md) khi cần chi tiết.
