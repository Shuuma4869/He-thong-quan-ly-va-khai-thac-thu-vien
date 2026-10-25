# LAMS — Hệ thống quản lý và khai thác thư viện

LAMS giúp người đọc tra cứu sách, giữ chỗ, theo dõi lượt mượn và đánh giá sách. Thủ thư quản lý danh mục, lưu thông và kiểm kê trên cùng một hệ thống. Giao diện chạy trên trình duyệt hoặc trong cửa sổ ứng dụng Windows bằng Tauri.

## Thông tin học phần

| Lớp học phần | Thành viên | MSSV |
|---|---|---|
| Thiết kế Web nâng cao-1-1-26(N01) | Nguyễn Trọng Tuấn | 23010690 |
|  | Vũ Đức Toàn | 23010062 |

Phân công được ghi trong [hướng dẫn thành viên](tai-lieu/00-bat-dau/huong-dan-thanh-vien.md). Lịch sử commit và PR thể hiện phần mã thực tế của từng người.

## Chức năng

- **Người đọc:** đăng ký, đăng nhập, xem hồ sơ, tìm và lọc sách, xem ấn bản, lưu yêu thích, viết đánh giá, đặt giữ chỗ và theo dõi lượt mượn.
- **Thủ thư, quản trị viên:** quản lý danh mục và bản sách, tra cứu thành viên, mượn/trả/gia hạn, xử lý giữ chỗ, xem báo cáo lưu thông, mở phiên kiểm kê, quét mã vạch và xác nhận xử lý sai lệch.
- **Tìm kiếm:** PostgreSQL full-text search và trigram; có thể lọc bằng tên thể loại chuẩn hoặc bí danh đã lưu. Metadata ISBN và ảnh bìa dùng quy trình duyệt thủ công.
- **Đề xuất bổ sung sách:** nhánh phát triển có công thức tính điểm, lưu bằng chứng và quyết định nội bộ. Giao diện nhân viên xem và duyệt đề xuất. Nguồn Core để **tạo đề xuất từ số liệu thật chưa được tích hợp**.

Truy vấn snapshot kiểm kê của Toàn còn ở [PR #25](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/25). Search và Acquisition đang phát triển ở [PR #27](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/27). Các phần này chỉ có trên `main` sau khi PR được review và merge.

## Công nghệ và kiến trúc

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | React, TypeScript, Vite, Tauri 2/WebView2 | Cùng một UI cho web và Windows |
| Core Service | Java 21, Spring Boot, Flyway | Tài khoản, Catalog, lưu thông và kiểm kê |
| Insight Service | NestJS, Prisma | Metadata, discovery và đề xuất bổ sung sách |
| Dữ liệu | PostgreSQL (`lams_core`, `lams_insight`) | Hai database tách theo service |
| Hạ tầng | Redis, Kafka, Docker Compose | Cache/coordination và truyền sự kiện |

Luồng chính: **giao diện → Core/Insight → PostgreSQL**. Insight không đọc trực tiếp database của Core. [Sơ đồ container](tai-lieu/02-kien-truc/container-diagram.md), [ERD](tai-lieu/03-du-lieu/erd.md) và [hợp đồng API](contracts/openapi/) mô tả chi tiết. MinIO là dịch vụ Compose tùy chọn và mặc định tắt; ảnh Catalog hiện là URL tham chiếu đã duyệt.

## Cấu trúc repository

| Thư mục | Nội dung |
|---|---|
| `backend/core-service/` | Spring Boot và Flyway migration |
| `backend/insight-service/` | NestJS, Prisma schema và migration |
| `frontend/` | React UI, Tauri và kiểm thử giao diện |
| `contracts/` | OpenAPI và AsyncAPI |
| `infra/`, `scripts/` | Hạ tầng và lệnh cài/chạy/kiểm tra |
| `tai-lieu/` | Yêu cầu, kiến trúc, nghiệp vụ và vận hành |
| `ho-so-nop-bai/` | Báo cáo nguồn, rubric và slide |

## Chạy trên Windows

Máy cần Git, Java 21, Docker Desktop/Engine, Node.js 22 và npm 10. Maven dùng wrapper trong repository. Để build desktop còn cần Rust, C++ Build Tools, Windows SDK và WebView2; [script setup](scripts/setup-desktop.ps1) kiểm tra/cài các thành phần này. Docker phải chạy trước khi bootstrap.

```powershell
git clone https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien.git
cd .\He-thong-quan-ly-va-khai-thac-thu-vien
.\scripts\setup-desktop.ps1
.\scripts\bootstrap-local.ps1
.\scripts\smoke-test.ps1
```

`bootstrap-local.ps1` tạo `.env` từ `.env.example` nếu chưa có, cài dependency, khởi động Compose và chạy Prisma migration. Hãy kiểm tra `.env` trước khi dùng ngoài máy phát triển; script không ghi đè file đã có. Core chạy Flyway khi khởi động.

Mở **ba cửa sổ PowerShell** tại thư mục repository, mỗi cửa sổ chạy một lệnh:

```powershell
# Cửa sổ 1 — Core
.\scripts\start-core.ps1
```

```powershell
# Cửa sổ 2 — Insight
.\scripts\start-insight.ps1
```

```powershell
# Cửa sổ 3 — ứng dụng Windows
.\scripts\start-desktop.ps1
```

Core health: `http://localhost:8080/api/v1/health`; Insight health: `http://localhost:3000/api/v1/health`. Để phát triển giao diện web, chạy `npm run dev` trong `frontend/` sau khi Core và Insight đã sẵn sàng. Xem [hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md) khi cần cấu hình chi tiết.

## Kiểm thử và build

```powershell
.\scripts\check-quality.ps1
python -m pip install -r contracts/openapi/requirements.txt
python .\scripts\validate-openapi.py
```

`check-quality.ps1` chạy Core `clean verify`, Prisma, Insight test/integration/build, frontend typecheck/lint/test/build và kiểm Compose. OpenAPI validator, E2E web/desktop và kiểm thử bảo mật được chạy riêng theo [pre-push gate](tai-lieu/08-van-hanh/pre-push-gate.md). Kết quả kiểm thử cần gắn với đúng commit; build thành công không thay bài E2E trên EXE.

## Ứng dụng Windows và bộ cài

```powershell
.\scripts\build-desktop.ps1
.\scripts\start-desktop.ps1 -Release
```

Lệnh build tạo EXE và gói cài trong `frontend/src-tauri/target/release/`. [Hướng dẫn desktop](tai-lieu/08-van-hanh/desktop-windows.md) có đường dẫn cụ thể và cách xử lý lỗi. EXE mở cửa sổ riêng, không cần tab Chrome hoặc Vite khi chạy bản release. **Core, Insight và PostgreSQL vẫn phải chạy hoặc được triển khai riêng**; bộ cài chưa phải hệ thống offline trọn gói. Chưa có updater hoặc ký số.

## Demo và hồ sơ học phần

[Kịch bản demo](tai-lieu/09-demo/kich-ban-demo.md) ghi các bước trình diễn và điều kiện dữ liệu. [Hồ sơ nộp bài](ho-so-nop-bai/README.md) gồm [slide PowerPoint](ho-so-nop-bai/slide/Bao_cao_LAMS_Thiet_ke_Web_nang_cao.pptx), [báo cáo nguồn](ho-so-nop-bai/bao-cao-nguon.md), [đối chiếu rubric](ho-so-nop-bai/doi-chieu-rubric.md) và minh chứng giao diện có mốc commit.

## Giới hạn hiện tại

- Phase 5 cần xử lý review của PR #25 và kiểm thử tích hợp lại trước khi coi truy vấn snapshot hoàn tất.
- Category Alias đã được dùng khi tìm kiếm, nhưng chưa có API quản trị để thủ thư thêm/sửa/xóa bí danh.
- Phase 7 chưa có read projection/report/CSV Core và chưa chạy luồng tạo đề xuất từ dữ liệu thật. `APPROVED` chỉ là quyết định nội bộ, không đặt mua sách.
- [Cấu hình pilot HTTPS](tai-lieu/08-van-hanh/cloud-pilot.md) đã được chuẩn bị, chưa có máy chủ công cộng. Chưa nghiệm thu production, bộ cài trên máy Windows thứ hai hoặc chính sách lưu/xóa dữ liệu đề xuất.
