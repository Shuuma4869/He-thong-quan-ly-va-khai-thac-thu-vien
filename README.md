# LAMS — Hệ thống quản lý và khai thác thư viện

**LAMS (Library Access & Management System)** là hệ thống quản lý và khai thác thư viện, hỗ trợ tra cứu sách, mượn–trả, giữ chỗ, kiểm kê và quản lý nghiệp vụ theo ba vai trò: **Reader, Librarian và Admin**.

Ứng dụng hỗ trợ cả **Web** và **Windows Desktop**.

## Chức năng chính

- **Reader — Bạn đọc:** tìm kiếm sách, xem tình trạng bản sách, yêu thích, đánh giá, giữ chỗ, theo dõi lượt mượn và thông báo.
- **Librarian — Thủ thư:** quản lý danh mục sách, tác giả, ấn bản, thành viên, mượn–trả, giữ chỗ, kiểm kê và báo cáo.
- **Admin — Quản trị viên:** quản lý tài khoản, vai trò, kiểm duyệt đánh giá và theo dõi hoạt động quản trị.
- **Tìm kiếm và giao diện:** PostgreSQL Full-Text Search, `pg_trgm`, tra cứu ISBN, bộ lọc nâng cao và tùy chỉnh giao diện.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | React, TypeScript, Vite |
| Windows Desktop | Tauri 2, WebView2 |
| Core Service | Java 21, Spring Boot, Flyway |
| Insight Service | NestJS, Prisma |
| Database | PostgreSQL |
| Cache | Redis |
| Event Streaming | Apache Kafka |
| Infrastructure | Docker Compose |

Core và Insight sử dụng database riêng, giao tiếp qua API và sự kiện.

Xem [kiến trúc hệ thống](tai-lieu/02-kien-truc/container-diagram.md) và [ERD](tai-lieu/03-du-lieu/erd.md).

## Cấu trúc repository

| Thư mục | Nội dung |
|---|---|
| `backend/core-service/` | Spring Boot và nghiệp vụ chính |
| `backend/insight-service/` | NestJS, metadata và thông báo |
| `frontend/` | React và Tauri Desktop |
| `infra/`, `scripts/` | Docker, khởi chạy và kiểm thử |
| `contracts/` | OpenAPI và AsyncAPI |
| `tai-lieu/` | Tài liệu kỹ thuật và hướng dẫn |
| `ho-so-nop-bai/` | Hồ sơ học phần |

## Hướng dẫn cài đặt và chạy ứng dụng

### 1. Chuẩn bị môi trường

Máy Windows cần cài:

- **Git**
- **PowerShell 7**
- **Java JDK 21**
- **Node.js 22.x và npm 10.x**
- **Docker Desktop** (Linux containers)

Maven sử dụng wrapper có sẵn trong dự án. Không cần cài Rust hoặc C++ Build Tools nếu chỉ chạy Web.

**Trước khi bắt đầu, mở Docker Desktop và bảo đảm Docker Engine đang hoạt động.** Lần thiết lập đầu tiên cần kết nối Internet để tải dependencies và Docker images.

### 2. Clone repository

Mở **PowerShell 7** tại thư mục muốn lưu dự án:

```powershell
git clone https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien.git
cd .\He-thong-quan-ly-va-khai-thac-thu-vien
```

### 3. Thiết lập lần đầu

```powershell
.\lams.ps1 Setup
```

Lệnh tự động tạo cấu hình `.env` khi chưa có, cài dependencies, khởi động hạ tầng Docker và chuẩn bị database.

Sau khi Setup thành công, chạy:

```powershell
.\lams.ps1 Web
```

Ứng dụng sẽ mở tại:

**http://localhost:5173**

Launcher tự kiểm tra và khởi động Core/Insight, build Core khi cần. Không cần mở nhiều terminal riêng.

> **Lưu ý:** Database mới chưa có sách hoặc tài khoản demo. Bạn có thể tự đăng ký Reader hoặc thực hiện bước tiếp theo để trải nghiệm đầy đủ ba vai trò.

## Tài khoản demo — 3 vai trò

| Vai trò | Email đăng nhập |
|---|---|
| **Reader** | `reader.demo@lams.test` |
| **Librarian** | `librarian.demo@lams.test` |
| **Admin** | `admin.demo@lams.test` |

Các tài khoản không được tạo tự động khi Setup. Để tạo dữ liệu và tài khoản trải nghiệm trên **database local/demo mới**, giữ ứng dụng đang chạy và mở thêm một cửa sổ PowerShell 7 tại thư mục gốc dự án.

**Bước 1 — Thêm dữ liệu sách mẫu:**

```powershell
.\scripts\seed-demo-catalog.ps1
```

**Bước 2 — Tạo ba tài khoản và sinh mật khẩu:**

```powershell
.\scripts\provision-demo-users.ps1 -GeneratePasswords
```

Nhập `DEMO` khi mỗi script yêu cầu xác nhận.

**Bước 3 — Xem mật khẩu demo:**

```powershell
Import-Clixml .\.tools\demo-credentials.xml | ForEach-Object {
    "$($_.UserName): $($_.GetNetworkCredential().Password)"
}
```

Mật khẩu được sinh ngẫu nhiên và lưu mã hóa trên máy Windows hiện tại, **không có mật khẩu mặc định công khai**. Không chia sẻ kết quả lệnh xem mật khẩu hoặc đưa file chứa thông tin đăng nhập lên GitHub.

Nếu các tài khoản đã tồn tại nhưng không còn file mật khẩu, sử dụng mật khẩu đã biết theo [hướng dẫn dữ liệu demo](tai-lieu/09-demo/du-lieu-demo.md); script không tự đặt lại mật khẩu cũ.

Sau khi tạo thành công, đăng nhập lần lượt bằng ba tài khoản để trải nghiệm các chức năng theo quyền tương ứng.

## Chạy Windows Desktop

Nếu muốn dùng phiên bản Desktop thay vì trình duyệt, có thể sử dụng bộ cài Windows đã build hoặc tự build từ source.

Để tự build, cần thêm Rust, C++ Build Tools, Windows SDK và WebView2:

```powershell
.\scripts\setup-desktop.ps1
.\scripts\build-desktop.ps1
.\lams.ps1 Desktop
```

Sau khi build thành công, bạn cũng có thể nhấp đúp file **`Khoi chay ung dung LAMS.cmd`** ở thư mục gốc để mở ứng dụng.

File CMD yêu cầu PowerShell 7 và bản Desktop có manifest hợp lệ; không tự build EXE khi mới clone.

Bộ cài Desktop hiện chỉ đóng gói giao diện, **không tích hợp backend và database**. Các dịch vụ LAMS vẫn phải hoạt động trên máy hoặc máy chủ được cấu hình phù hợp.

Xem [hướng dẫn Windows Desktop](tai-lieu/08-van-hanh/desktop-windows.md).

## Tắt và khởi động lại

| Thao tác | Lệnh |
|---|---|
| Mở Web | `.\lams.ps1 Web` |
| Mở Desktop đã build | `.\lams.ps1 Desktop` |
| Kiểm tra môi trường | `.\lams.ps1 Doctor` |
| Dừng Core, Insight và Web do launcher quản lý | `.\lams.ps1 Stop` |
| Dừng hạ tầng Docker Compose của LAMS | `.\scripts\stop-infra.ps1` |

**Lưu ý:**

- Đóng tab Web hoặc cửa sổ Desktop không tự động dừng backend.
- Chạy `.\lams.ps1 Stop` khi muốn dừng các dịch vụ ứng dụng.
- Nếu muốn dừng cả hạ tầng LAMS, chạy thêm `.\scripts\stop-infra.ps1` sau khi đã lưu thao tác và dừng ứng dụng.
- Các lệnh dừng trên không xóa named volumes, tài khoản hoặc dữ liệu sách.
- Để mở lại, bật Docker Desktop nếu cần rồi chạy `.\lams.ps1 Web` hoặc `.\lams.ps1 Desktop`.
- Không cần Setup lại mỗi lần mở nếu môi trường vẫn đầy đủ.

Nếu gặp lỗi, chạy:

```powershell
.\lams.ps1 Doctor
```

Kiểm tra thông báo và log tại `.tools/desktop-launch/`, hoặc tham khảo [hướng dẫn xử lý lỗi](tai-lieu/08-van-hanh/xu-ly-loi-moi-truong.md).

## Kiểm thử

```powershell
.\scripts\check-quality.ps1
.\scripts\test-phase1-e2e.ps1 -EnableKafkaNotifications
```

Các bài E2E sử dụng dữ liệu kiểm thử cô lập, không sử dụng database demo để ghi dữ liệu thử nghiệm.

Xem [chiến lược kiểm thử](tai-lieu/07-kiem-thu/test-strategy.md).

## Tài liệu kỹ thuật

- [Hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md)
- [Hướng dẫn Windows Desktop](tai-lieu/08-van-hanh/desktop-windows.md)
- [Dữ liệu demo](tai-lieu/09-demo/du-lieu-demo.md)
- [Kịch bản demo](tai-lieu/09-demo/kich-ban-demo.md)
- [Design System](tai-lieu/06-giao-dien/design-system.md)
- [Nguồn ảnh](tai-lieu/06-giao-dien/nguon-anh.md)
- [Sao lưu và khôi phục](tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md)
- [Hồ sơ học phần](ho-so-nop-bai/README.md)

## Thành viên

| Thành viên | MSSV |
|---|---|
| Nguyễn Trọng Tuấn | 23010690 |
| Vũ Đức Toàn | 23010062 |

**Học phần:** Thiết kế Web nâng cao-1-1-26(N01)

**Giảng viên hướng dẫn:** TS. Nguyễn Lệ Thu
