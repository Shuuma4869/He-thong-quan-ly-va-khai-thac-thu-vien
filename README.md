# LAMS — Hệ thống quản lý và khai thác thư viện

LAMS hỗ trợ tra cứu sách, quản lý mượn–trả, giữ chỗ và kiểm kê thư viện. Người đọc, thủ thư và quản trị viên sử dụng cùng giao diện trên trình duyệt hoặc ứng dụng Windows.

## Chức năng chính

- **Người đọc:** tìm sách, tác giả và thể loại; xem ấn bản/tồn kho theo chi nhánh; lưu yêu thích, viết và báo cáo đánh giá; giữ chỗ, theo dõi lượt mượn, thông báo và hồ sơ cá nhân.
- **Thủ thư:** biên mục tác phẩm/ấn bản/bản sách; tra cứu thành viên; mượn, trả, gia hạn, bàn giao giữ chỗ; kiểm kê và xác nhận xử lý sai lệch; xem báo cáo và đề xuất bổ sung sách.
- **Quản trị viên:** quản lý tài khoản, vai trò, kiểm duyệt đánh giá và rà soát các lần không đến nhận sách theo dữ liệu có căn cứ.
- **Tìm kiếm và giao diện:** PostgreSQL FTS/trigram, bí danh thể loại, tra cứu ISBN; ảnh tham chiếu được duyệt thủ công; tùy chỉnh giao diện lưu theo tài khoản.

## Kiến trúc

| Thành phần | Công nghệ | Trách nhiệm |
|---|---|---|
| Frontend | React, TypeScript, Vite | Giao diện Web và nội dung cửa sổ Desktop |
| Desktop | Tauri 2, WebView2 | Đóng gói giao diện thành ứng dụng Windows |
| Core | Java 21, Spring Boot, Flyway | Tài khoản, Catalog, lưu thông, kiểm kê và dữ liệu nghiệp vụ |
| Insight | NestJS, Prisma | Metadata, thông báo và đề xuất bổ sung |
| Hạ tầng | PostgreSQL, Redis, Kafka, Docker Compose | Hai database riêng theo service, cache và sự kiện |

Giao diện gọi API Core/Insight; Insight không đọc trực tiếp database Core. Xem [sơ đồ kiến trúc](tai-lieu/02-kien-truc/container-diagram.md) và [ERD](tai-lieu/03-du-lieu/erd.md).

## Cấu trúc repository

| Thư mục | Nội dung |
|---|---|
| `backend/core-service/`, `backend/insight-service/` | Hai dịch vụ và migration |
| `frontend/` | React, Tauri và kiểm thử UI |
| `contracts/` | OpenAPI và AsyncAPI |
| `infra/`, `scripts/` | Hạ tầng, bootstrap, launcher và kiểm thử |
| `tai-lieu/` | Kiến trúc, nghiệp vụ, hướng dẫn vận hành |
| `ho-so-nop-bai/` | Hồ sơ học phần và minh chứng theo mốc phiên bản |

## Yêu cầu môi trường

Để chạy Web trên Windows: **Git, PowerShell 7, Java 21, Node.js 22.x/npm 10.x và Docker Desktop chạy Linux containers**. Bật Docker Engine trước khi thiết lập. Maven dùng wrapper trong repository. Lần đầu cần Internet để tải dependency và image; Web không yêu cầu Rust hoặc C++ Build Tools.

Các cổng local mặc định: Web `5173`, Core `8080`, Insight `3000`, PostgreSQL `15432`, Redis `16379`, Kafka `19092`. Launcher từ chối tái sử dụng tiến trình không thuộc checkout hiện tại.

## Quick Start — Windows / Web

Mở PowerShell 7:

```powershell
git clone https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien.git
cd .\He-thong-quan-ly-va-khai-thac-thu-vien
.\lams.ps1 Setup
.\lams.ps1 Web
```

`Setup` tạo `.env` với secret ngẫu nhiên nếu chưa có, cài dependencies, tạo Prisma client, bật hạ tầng và chạy Prisma migrations. Chạy lại giữ nguyên `.env` và volume. `Web` tự build Core khi thiếu hoặc cũ, chờ Flyway/database và hai API sẵn sàng rồi mở **http://localhost:5173/**. Không cần mở ba terminal và không tự seed dữ liệu.

Bạn có thể đăng ký Reader ngay. Với database mới, Catalog trống là trạng thái bình thường. Việc tạo tài khoản nhân viên và nhập danh mục ban đầu được hướng dẫn trong [chạy local](tai-lieu/08-van-hanh/chay-local.md); không tự cấp quyền quản trị qua đăng ký công khai.

Đóng tab không dừng backend. Dùng `.\lams.ps1 Stop` để dừng Core/Insight/Web của checkout này; Docker và dữ liệu vẫn được giữ. Sau đó dùng `Web` hoặc `Desktop` để mở lại.

Nếu khởi động lỗi, chạy `.\lams.ps1 Doctor`; đọc thông báo và log tại `.tools/desktop-launch/`. Sau khi sửa nguyên nhân, chạy lại `Web` hoặc `Desktop`. Launcher kiểm ownership, phiên bản và readiness trước khi dùng dịch vụ đang chạy; không tự kill tiến trình khác. [Runbook local](tai-lieu/08-van-hanh/chay-local.md) có cách xử lý cổng trùng, mật khẩu volume và khởi động từng service khi phát triển.

## Windows Desktop

**Dùng bộ cài đã được nghiệm thu:** máy chạy cần Windows x64 và WebView2; không cần Rust/C++ chỉ để mở ứng dụng. Người vận hành phải cung cấp Core, Insight và PostgreSQL phù hợp với cấu hình của bộ cài. Bản local gọi backend trên cùng máy; installer không chứa backend/database và không phải ứng dụng offline độc lập.

**Tự build từ source:** cần thêm Rust, C++ Build Tools và Windows SDK. Script setup sau đây có thể cài phần mềm hệ thống còn thiếu; chỉ chạy khi bạn muốn chuẩn bị máy build:

```powershell
.\scripts\setup-desktop.ps1
.\lams.ps1 Setup
.\scripts\build-desktop.ps1
.\lams.ps1 Desktop
```

EXE ở `frontend/src-tauri/target/release/lams-desktop.exe`; bộ cài ở `frontend/src-tauri/target/release/bundle/nsis/`. Launcher chỉ mở bản có manifest và checksum khớp source. Nếu clone mới chưa có EXE, hãy build theo lệnh trên. Xem [hướng dẫn Desktop](tai-lieu/08-van-hanh/desktop-windows.md) để kiểm tra artifact, cài đặt và xử lý lỗi toolchain.

## Kiểm thử và build

```powershell
.\scripts\check-quality.ps1
.\scripts\test-phase1-e2e.ps1 -EnableKafkaNotifications
```

E2E tạo database riêng và không dùng database demo. Kiểm thử EXE, OpenAPI, bảo mật và các gate trước PR được mô tả trong [hướng dẫn kiểm thử](tai-lieu/07-kiem-thu/test-strategy.md) và [pre-push gate](tai-lieu/08-van-hanh/pre-push-gate.md). Kết quả phải gắn với đúng commit/artifact; build thành công không thay kiểm thử bản đã cài.

## Tài liệu kỹ thuật

- [Hướng dẫn thành viên](tai-lieu/00-bat-dau/huong-dan-thanh-vien.md), [hợp đồng API](contracts/openapi/) và [bản đồ chức năng UI](tai-lieu/06-giao-dien/ban-do-chuc-nang-frontend.md).
- [Design system](tai-lieu/06-giao-dien/design-system.md), [nguồn ảnh](tai-lieu/06-giao-dien/nguon-anh.md) và [tình trạng bản sách](tai-lieu/04-nghiep-vu/kha-dung-sach.md).
- [Vận hành và phạm vi triển khai](tai-lieu/08-van-hanh/pham-vi-trien-khai.md), [pilot HTTPS](tai-lieu/08-van-hanh/cloud-pilot.md), [sao lưu/khôi phục](tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md).
- [Dữ liệu demo tùy chọn](tai-lieu/09-demo/du-lieu-demo.md), [kịch bản demo](tai-lieu/09-demo/kich-ban-demo.md) và [hồ sơ học phần](ho-so-nop-bai/README.md).

SMTP mặc định tắt. Muốn đổi email bằng mã xác minh, cấu hình SMTP/Mailpit theo runbook. Thông báo sự kiện cần bật outbox và consumer với Kafka. MinIO là dịch vụ tùy chọn, không cần cho luồng ảnh tham chiếu hiện tại.

## Thành viên

| Thành viên | MSSV |
|---|---|
| Nguyễn Trọng Tuấn | 23010690 |
| Vũ Đức Toàn | 23010062 |

Học phần: Thiết kế Web nâng cao-1-1-26(N01). Giảng viên hướng dẫn: TS. Nguyễn Lệ Thu
