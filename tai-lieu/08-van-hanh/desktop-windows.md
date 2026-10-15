# Chạy LAMS dưới dạng ứng dụng Windows

LAMS dùng Tauri 2 và WebView2 để mở React trong cửa sổ riêng. Bản release chứa giao diện đã build, không cần mở Chrome hoặc chạy Vite. Core Service, Insight Service và PostgreSQL vẫn là các dịch vụ riêng; bộ cài giao diện không cài database hoặc biến hệ thống thành ứng dụng offline.

## Máy phát triển mới

Hỗ trợ Windows x64, WebView2 Evergreen, Java 21 và Docker Desktop chạy Linux containers. Cần Git, quyền cài prerequisite và kết nối mạng cho lần thiết lập đầu. Không cần Maven hệ thống.

Clone repository, checkout nhánh được giao và mở PowerShell tại root. Khi PR chưa merge, phần desktop nằm trên `Tuan/core-platform`; sau review/merge, các nhánh thành viên đồng bộ từ main.

```powershell
.\scripts\setup-desktop.ps1
.\scripts\bootstrap-local.ps1
```

`setup-desktop.ps1` tải Node 22.23.3 vào `.tools` của chính checkout, kiểm SHA-256 từ nodejs.org, cài Rustup/C++ Build Tools/WebView2 nếu thiếu, rồi chạy npm ci. Rust 1.99.0, rustfmt/clippy và target MSVC x64 được pin trong `frontend/src-tauri/rust-toolchain.toml`. C++ cần Windows SDK và workload Desktop development with C++. Installer có thể yêu cầu quyền quản trị/khởi động lại; nếu Windows yêu cầu restart, làm theo thông báo rồi chạy lại script.

Script không thay Node mặc định toàn máy. Các script dự án tự ưu tiên Node local; nếu gõ npm/cargo trực tiếp ở terminal mới, chạy `. .\scripts\common.ps1` từ root trước. Java/Docker vẫn phải có sẵn và Docker Engine phải hoạt động. Bootstrap giữ nguyên `.env` và volume hiện có.

## Chạy khi phát triển

Mở ba terminal tại root dự án, mỗi terminal chạy một lệnh:

```powershell
.\scripts\start-core.ps1
```

```powershell
.\scripts\start-insight.ps1
```

```powershell
.\scripts\start-desktop.ps1
```

Lệnh cuối mở cửa sổ LAMS, có hot reload; không mở tab trình duyệt. Đóng cửa sổ hoặc Ctrl+C để kết thúc lượt chạy dev. Cổng Vite 5173 phải trống, không chạy thêm `npm run dev` song song. Các backend vẫn cần terminal riêng, đóng cửa sổ không tắt hoặc xóa database.

## Build và mở bản release

```powershell
.\scripts\build-desktop.ps1
.\scripts\start-desktop.ps1 -Release
```

- EXE: `frontend/src-tauri/target/release/lams-desktop.exe`.
- Bộ cài: `frontend/src-tauri/target/release/bundle/nsis/LAMS_0.1.0_x64-setup.exe`.
- Cài theo tài khoản Windows hiện tại, có shortcut và trình gỡ cài đặt. Bộ cài chưa được ký số; Windows có thể hiện SmartScreen. Không tắt bảo vệ Windows; chỉ cài artifact từ bản build/CI đã xác minh.
- Người dùng bản cài không cần Rust, Node hoặc Vite để mở giao diện. Họ vẫn cần dịch vụ LAMS hoạt động tại địa chỉ được build sẵn. Chưa có cấu hình máy chủ từ UI, auto-updater, ký số hoặc bản macOS/Linux.

Không commit `.tools`, `target`, bộ cài, node_modules hay dữ liệu WebView vào Git. CI job `desktop-windows` build trên Windows sạch và cung cấp bộ cài dưới dạng artifact của từng run, không tự phát hành release hoặc merge PR.

## Địa chỉ và phiên đăng nhập

Dev dùng `http://localhost:5173`, API localhost 8080/3000. Release dùng origin `http://tauri.localhost`, API `http://api.tauri.localhost:8080/api/v1` và cổng 3000 cho Insight. Đây là tên loopback của Chromium/WebView2, không phải dịch vụ Internet và không cần sửa hosts file. Các API phải chạy tại cổng mặc định này cho release hiện tại.

Hai origin release cùng site để refresh cookie `HttpOnly; SameSite=Lax` hoạt động. Không hạ SameSite xuống None, không tắt bảo mật WebView. CORS chỉ cho phép origin cụ thể, không wildcard credentials. Launcher Core/Insight bổ sung origin desktop ngay cả khi `.env` cũ chưa có; nếu chạy backend bằng Docker/lệnh riêng, đặt `CORS_ALLOWED_ORIGINS` và `FRONTEND_ORIGIN` gồm `http://tauri.localhost`.

`build-desktop.ps1` đặt URL desktop trong phạm vi build và khôi phục biến cũ sau đó. Không đưa secret vào bất cứ biến VITE nào. Giao diện dùng HashRouter trên desktop để reload/deep link không phụ thuộc web server. Rust chặn chuyển cửa sổ ra origin khác; không cấp quyền filesystem/shell hoặc plugin native cho nội dung web.

## Kiểm thử

```powershell
.\scripts\check-quality.ps1
.\scripts\test-phase1-e2e.ps1
.\scripts\build-desktop.ps1
.\scripts\test-phase1-e2e.ps1 -Desktop
```

E2E cần Docker, Chromium của Playwright (`npx playwright install chromium` trong frontend, dùng Node đã pin), cổng trống và bản release mới. Chế độ desktop dùng WebView2 thật của EXE, API thật và PostgreSQL tạm có nhãn riêng; kiểm Reader/Librarian/Admin, reload refresh cookie, logout, quyền, tìm kiếm/lọc/sort/page/Back. Cổng Core 8080 và CDP kiểm thử 19222 phải trống; script không tự dừng tiến trình lạ. Không chạy E2E desktop đồng thời với Core dev. Có thể đổi `-DebugPort`, nhưng Core release vẫn dùng 8080.

CDP chỉ bật qua biến môi trường của lượt kiểm thử, với profile WebView riêng trong thư mục target bị Git bỏ qua. Launcher thường không bật debug port. Script dừng tiến trình và xóa database tạm do chính nó tạo, không xóa volume dự án. Log/ảnh/report của test là artifact local, không phải tài liệu bàn giao.

Để kiểm cả bản đã cài, thêm `-DesktopExecutable "$env:LOCALAPPDATA\LAMS\lams-desktop.exe"` cùng `-Desktop`. Chỉ chọn EXE LAMS của bản build cần nghiệm thu; profile/dữ liệu test vẫn tách khỏi phiên sử dụng bình thường.

## Khi gặp lỗi

- Không kết nối API: kiểm health Core/Insight, Docker và terminal backend; EXE không tự khởi động server.
- Đăng nhập được nhưng mất phiên sau reload: kiểm origin API và CORS, không đổi sang `127.0.0.1`/`localhost` trong release. Kiểm cookie không bị policy máy chặn.
- Build lỗi linker/Windows SDK: mở Visual Studio Installer, kiểm workload C++ và Windows SDK; chạy lại setup.
- Rust/Node chưa được nhận: mở terminal mới hoặc nạp common.ps1; không cần thêm đường dẫn máy người khác.
- Có Vite cũ chiếm 5173: dừng terminal do mình mở rồi chạy desktop dev. Không kill hàng loạt node/java.
- Proxy/DNS chính sách công ty chặn `*.localhost`: cần kiểm chính sách mạng của máy; không sửa hosts hoặc tắt bảo mật toàn hệ thống để né lỗi.

Tham khảo chính thức: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [Vite integration](https://v2.tauri.app/start/frontend/vite/), [Windows installer](https://v2.tauri.app/distribute/windows-installer/).
