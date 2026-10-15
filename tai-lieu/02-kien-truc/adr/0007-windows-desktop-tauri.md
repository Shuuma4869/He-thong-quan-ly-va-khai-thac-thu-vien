# ADR 0007 — Giao diện Windows bằng Tauri

## Quyết định

Dùng Tauri 2 và WebView2 trên Windows x64, tái sử dụng React/Vite. Rust chỉ tạo cửa sổ và giới hạn điều hướng; chưa có command/plugin native. Core và Insight giữ nguyên trách nhiệm, quyền và database. Không nhúng JVM/PostgreSQL vào bộ cài ở phạm vi này.

Dev dùng Vite và hot reload; release đóng gói static assets, không chạy frontend HTTP server. UI desktop dùng hash routing, UI web giữ browser routing. Cùng một bộ feature Auth/Member phục vụ cả hai giao diện, không có bản sao nghiệp vụ desktop.

## Phiên đăng nhập và origin

Ở bản local Windows, app dùng `http://tauri.localhost`, API local dùng `http://api.tauri.localhost:8080` và `:3000`. Các host loopback này cùng site, giữ được refresh cookie HttpOnly/SameSite=Lax trong WebView2. CORS vẫn allowlist origin cụ thể và credentials. Không dùng localhost plugin hoặc tắt browser security.

Bản build pilot/production dùng `https://tauri.localhost` qua `useHttpsScheme`, URL API HTTPS và CSP theo đúng origin đã truyền lúc build. API từ xa khác site, nên profile Core `pilot` dùng cookie Secure/SameSite=None và bắt buộc kiểm tra Origin HTTPS cùng header không đơn giản trên mọi POST Auth. Không dùng cấu hình này cho HTTP local. Khả năng lưu/rotate cookie với server HTTPS thực phải được nghiệm thu trên WebView2 trước phát hành; hiện cấu hình không đồng nghĩa đã có môi trường cloud hoạt động.

Access JWT vẫn chỉ ở bộ nhớ. Refresh rotation/reuse/logout và kiểm quyền hiện tại do backend quyết định. CSP giới hạn nguồn kết nối, không cấp quyền shell/filesystem cho trang web. Cửa sổ chỉ cho phép điều hướng app origin; dev thêm đúng localhost:5173. Debug port chỉ được bật từ script kiểm thử với profile riêng, không cấu hình trong ứng dụng phát hành.

## Hệ quả và giới hạn

Thành viên cần C++ Build Tools/Windows SDK, Rust pin và WebView2 để build; người cài chỉ cần WebView2 cùng dịch vụ backend. Bộ cài NSIS theo tài khoản hiện tại; CI giữ artifact, không commit binary.

Chưa có auto-update, code signing, cấu hình remote server từ UI hoặc hỗ trợ macOS/Linux. Đổi cổng/origin/HTTPS triển khai phải review đồng thời CSP, CORS và cookie; không giả định cấu hình local là thiết kế production. Không suy build thành công thành đăng nhập đúng: phải chạy E2E trên EXE với WebView2/API/PostgreSQL thật.

Xem [runbook desktop](../../08-van-hanh/desktop-windows.md), [Auth flow](../authentication-flow.md), [Tauri configuration](https://v2.tauri.app/reference/config/).
