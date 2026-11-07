# Chạy LAMS dưới dạng ứng dụng Windows

LAMS dùng Tauri 2 và WebView2 để mở React trong cửa sổ riêng. Bản release chứa giao diện đã build, không cần mở Chrome hoặc chạy Vite. Core Service, Insight Service và PostgreSQL vẫn là các dịch vụ riêng; bộ cài giao diện không cài database hoặc biến hệ thống thành ứng dụng offline.

## Máy phát triển mới

Hỗ trợ Windows x64, WebView2 Evergreen, Java 21 và Docker Desktop chạy Linux containers. Cần Git, quyền cài prerequisite và kết nối mạng cho lần thiết lập đầu. Không cần Maven hệ thống.

Clone repository từ main và mở PowerShell 7 tại root. Người chỉ chạy bộ cài đã được nghiệm thu không cần Rust/C++ Build Tools; backend và database vẫn phải được cung cấp riêng.

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
- Manifest của EXE: `frontend/src-tauri/target/release/lams-build-manifest.json`, gồm SHA nền, trạng thái working tree, phiên bản, thời điểm build, môi trường, URL API, fingerprint input và SHA-256 EXE. Bản có `dirty: true` là bản thử từ source chưa commit, không phải release từ SHA sạch.
- Cài theo tài khoản Windows hiện tại, có shortcut và trình gỡ cài đặt. Bộ cài chưa được ký số; Windows có thể hiện SmartScreen. Không tắt bảo vệ Windows; chỉ cài artifact từ bản build/CI đã xác minh.
- Người dùng bản cài không cần Rust, Node hoặc Vite để mở giao diện. Họ vẫn cần dịch vụ LAMS hoạt động tại địa chỉ được build sẵn. Chưa có cấu hình máy chủ từ UI, auto-updater, ký số hoặc bản macOS/Linux.

Không commit `.tools`, `target`, bộ cài, node_modules hay dữ liệu WebView vào Git. CI job `desktop-windows` build trên Windows sạch và cung cấp bộ cài cùng file SHA-256 dưới dạng artifact của từng run. Kiểm checksum sau khi tải artifact; job này không tự phát hành release hoặc merge PR.

Launcher release trong checkout kiểm manifest trước khi mở EXE. Nếu thiếu manifest, source/config đã đổi hoặc checksum EXE không khớp, script dừng và yêu cầu build lại. `start-local-desktop.ps1` kiểm bước này trước khi bật dịch vụ. Không cần build lại mỗi lần mở nếu input vẫn khớp. Kiểm này dành cho EXE trong checkout; shortcut của bản cài không đọc source và chưa tự kiểm phiên bản backend. Các bài E2E với API thật vẫn là điều kiện nghiệm thu riêng.

File `Khoi chay ung dung LAMS.cmd` ở root gọi cùng `scripts/start-local-desktop.ps1` bằng PowerShell 7. Khi có lỗi, cửa sổ giữ thông báo để người dùng đọc. Việc chuẩn bị dữ liệu demo phải được thực hiện riêng theo hướng dẫn dữ liệu, không gắn với mỗi lần mở ứng dụng.

Launcher chặn hai lượt khởi động đồng thời trong cùng phiên Windows. Sau khi hạ tầng chạy, nó kiểm tên dịch vụ và trạng thái `UP` của Core/Insight, rồi kiểm health tổng hợp của Core để không mở ứng dụng khi database chưa sẵn sàng. Insight trả HTTP 200 nhưng trạng thái `DEGRADED` vẫn chưa được chấp nhận. Mỗi bước chờ API có giới hạn 90 giây; khi hết hạn, đọc log tại `.tools/desktop-launch` để xử lý rồi chạy lại.

Khi Core chưa chạy, launcher kiểm source và checksum JAR qua `backend/core-service/target/lams-core-build.json`. Nếu thiếu hoặc không khớp, launcher tự build lại trước khi chạy. Có thể dùng `lams.ps1 Desktop -RebuildCore` để yêu cầu build lại khi Core chưa chạy; các lần mở sau dùng bản đã xác minh. Script `start-core.ps1` ghi manifest sau khi package thành công và từ chối source thay đổi giữa lúc build.

Các script Core/Insight ghi thông tin lượt khởi động vào `.tools/desktop-launch`: workspace, PID và thời điểm tạo tiến trình cha, cùng fingerprint đầu vào. Launcher đối chiếu tiến trình đang nghe cổng 8080/3000 với chuỗi tiến trình con của lượt đó, đồng thời kiểm source/cấu hình và binary Core. Dịch vụ chỉ trả health tốt nhưng không có bản ghi phù hợp vẫn bị từ chối. Cơ chế này giúp tránh dùng nhầm backend cũ hoặc backend của checkout khác; không phải cơ chế xác thực bảo mật giữa các tài khoản Windows.

Nếu dịch vụ đang chạy từ lệnh riêng hoặc từ bản script cũ, đóng đúng terminal đã khởi động nó rồi chạy lại `start-core.ps1`/`start-insight.ps1` trong checkout hiện tại. Launcher không tự kill tiến trình hoặc tự restart dịch vụ đang dùng. Khi sửa source Insight trong chế độ watch, launcher vẫn yêu cầu một lượt khởi động mới trước khi nghiệm thu release. Bản ghi chỉ chứa fingerprint, không chép giá trị secret từ `.env`; thay đổi `.env` cũng yêu cầu khởi động lại. Kiểm tra ownership cần quyền đọc thông tin tiến trình Windows; nếu không đọc được, script dừng thay vì bỏ qua bước kiểm.

EXE cài bằng NSIS có thể khác checksum EXE rời do Tauri gắn nhãn loại gói vào binary. Khi nghiệm thu, ghi riêng checksum installer, EXE rời và EXE đã cài; không tự coi mọi khác biệt checksum là hợp lệ. Cần đối chiếu nguồn artifact và kiểm phần khác biệt trước khi chạy bộ test trên bản cài.

Nếu đã di chuyển checkout và Cargo báo không tìm thấy file permissions trong đường dẫn cũ, cache `frontend/src-tauri/target` có thể chứa đường dẫn tuyệt đối của lần build trước. Dừng lượt build, giữ lại EXE/bộ cài cần bảo toàn, chuyển cache cũ ra thư mục backup rồi build lại từ root hiện tại. Không sao chép cache Rust giữa các workspace để làm bằng chứng bản release mới.

## Địa chỉ và phiên đăng nhập

Dev dùng `http://localhost:5173`, API localhost 8080/3000. Release dùng origin `http://tauri.localhost`, API `http://api.tauri.localhost:8080/api/v1` và cổng 3000 cho Insight. Đây là tên loopback của Chromium/WebView2, không phải dịch vụ Internet và không cần sửa hosts file. Các API phải chạy tại cổng mặc định này cho release hiện tại.

Hai origin release local cùng site để refresh cookie `HttpOnly; SameSite=Lax` hoạt động. Không đổi cookie local sang None hoặc tắt bảo mật WebView. CORS chỉ cho phép origin cụ thể, không wildcard credentials. Launcher Core/Insight bổ sung origin desktop ngay cả khi `.env` cũ chưa có; nếu chạy backend bằng Docker/lệnh riêng, đặt `CORS_ALLOWED_ORIGINS` và `FRONTEND_ORIGIN` gồm `http://tauri.localhost`.

`build-desktop.ps1` đặt URL desktop trong phạm vi build và khôi phục biến cũ sau đó. Không đưa secret vào bất cứ biến VITE nào. Giao diện dùng HashRouter trên desktop để reload/deep link không phụ thuộc web server. Rust chặn chuyển cửa sổ ra origin khác; không cấp quyền filesystem/shell tổng quát cho nội dung web. Lệnh native `open_catalog_source` chỉ mở liên kết HTTPS thuộc allowlist nguồn metadata trong trình duyệt ngoài, không nhận lệnh shell hoặc đường dẫn file. CSP giới hạn host ảnh và API; xem [kiến trúc Catalog/media](../02-kien-truc/catalog-media.md).

## Bản kết nối máy chủ HTTPS

Chỉ build để phân phối sau khi đã triển khai và kiểm tra Core HTTPS theo [hướng dẫn pilot](cloud-pilot.md). Thay URL ví dụ bằng URL thật:

```powershell
.\scripts\build-desktop.ps1 -Environment pilot -CoreApiUrl 'https://TEN-DICH-VU.onrender.com/api/v1'
```

Không truyền `-InsightApiUrl` khi pilot chưa cần Insight. Script bật origin `https://tauri.localhost`, giới hạn CSP vào các API đã chỉ định và không dùng `.env.desktop` local. Server pilot phải cho phép origin này, bật cookie Secure/SameSite=None và kiểm tra trusted origin/header. Bản local vẫn là mặc định khi không có `-Environment`.

Các môi trường hiện dùng cùng app identifier, version và đường dẫn output; build sau sẽ thay artifact build trước. Không cài đồng thời bản local và pilot như hai sản phẩm riêng. Ghi lại môi trường và commit của artifact trước khi bàn giao. Chưa có server pilot thật nên chưa nghiệm thu đăng nhập HTTPS từ máy người dùng; không phát hành bộ cài trỏ tới URL mẫu.

Sau khi cài, có thể mở từ Start Menu/shortcut hoặc PowerShell:

```powershell
& "$env:LOCALAPPDATA\LAMS\lams-desktop.exe"
```

## Kiểm thử

```powershell
.\scripts\check-quality.ps1
.\scripts\test-phase1-e2e.ps1
.\scripts\build-desktop.ps1
.\scripts\test-phase1-e2e.ps1 -Desktop
```

E2E cần Docker, Chromium của Playwright (`npx playwright install chromium` trong frontend, dùng Node đã pin), cổng trống và bản release mới. Chế độ desktop dùng WebView2 thật của EXE, Core/Insight thật và PostgreSQL tạm có nhãn riêng; kiểm Reader/Librarian/Admin, reload refresh cookie, logout, quyền, tìm kiếm/lọc/sort/page/Back, Catalog CRUD, BookCopy version và metadata/fallback. Cổng Core 8080, Insight 3000 và CDP kiểm thử 19222 phải trống; script không tự dừng tiến trình lạ. Không chạy E2E desktop đồng thời với Core/Insight dev. Có thể đổi `-DebugPort`, nhưng Core/Insight release local vẫn dùng 8080/3000. Chế độ web mặc định dùng 18081/13001/15174 và có tham số đổi cổng.

CDP chỉ bật qua biến môi trường của lượt kiểm thử, với profile WebView riêng trong thư mục target bị Git bỏ qua. Launcher thường không bật debug port. Script dừng tiến trình và xóa database tạm do chính nó tạo, không xóa volume dự án. Log/ảnh/report của test là artifact local, không phải tài liệu bàn giao.

Để kiểm cả bản đã cài, thêm `-DesktopExecutable "$env:LOCALAPPDATA\LAMS\lams-desktop.exe"` cùng `-Desktop`. Chỉ chọn EXE LAMS của bản build cần nghiệm thu; profile/dữ liệu test vẫn tách khỏi phiên sử dụng bình thường.

Ngày 28/10/2026, trên máy phát triển Windows 11, bản NSIS local 0.1.0 đã được cài, chạy E2E 18/18 trên EXE cài đặt, gỡ bằng uninstaller `/S` rồi cài lại thành công. Thư mục Maven dùng chung trong `%LOCALAPPDATA%\LAMS\maven` vẫn còn sau khi gỡ. Bài kiểm này xác nhận máy hiện tại, chưa phải nghiệm thu trên máy Windows thứ hai hoặc gói cài toàn bộ backend. Bộ cài local chưa ký Authenticode; CI phải build lại từ commit bàn giao và artifact của CI cần được kiểm riêng trước khi phát cho người khác.

## Khi gặp lỗi

- Không kết nối API: kiểm health Core/Insight, Docker và terminal backend; EXE không tự khởi động server.
- Đăng nhập được nhưng mất phiên sau reload: kiểm origin API và CORS, không đổi sang `127.0.0.1`/`localhost` trong release. Kiểm cookie không bị policy máy chặn.
- Build lỗi linker/Windows SDK: mở Visual Studio Installer, kiểm workload C++ và Windows SDK; chạy lại setup.
- Rust/Node chưa được nhận: mở terminal mới hoặc nạp common.ps1; không cần thêm đường dẫn máy người khác.
- Có Vite cũ chiếm 5173: dừng terminal do mình mở rồi chạy desktop dev. Không kill hàng loạt node/java.
- Proxy/DNS chính sách công ty chặn `*.localhost`: cần kiểm chính sách mạng của máy; không sửa hosts hoặc tắt bảo mật toàn hệ thống để né lỗi.

Tham khảo chính thức: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [Vite integration](https://v2.tauri.app/start/frontend/vite/), [Windows installer](https://v2.tauri.app/distribute/windows-installer/).
