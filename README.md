# LAMS — Hệ thống quản lý và khai thác thư viện

LAMS giúp người đọc tra cứu sách, giữ chỗ, theo dõi lượt mượn và đánh giá sách. Thủ thư quản lý danh mục, lưu thông và kiểm kê trên cùng một hệ thống. Giao diện chạy trên trình duyệt hoặc trong cửa sổ ứng dụng Windows bằng Tauri.

## Thông tin học phần

| Lớp học phần | Thành viên | MSSV |
|---|---|---|
| Thiết kế Web nâng cao-1-1-26(N01) | Nguyễn Trọng Tuấn | 23010690 |
|  | Vũ Đức Toàn | 23010062 |

Phân công được ghi trong [hướng dẫn thành viên](tai-lieu/00-bat-dau/huong-dan-thanh-vien.md). Lịch sử commit và PR thể hiện phần mã thực tế của từng người.

## Chức năng

- **Người đọc:** đăng ký, đăng nhập, cập nhật tên/số điện thoại, đổi mật khẩu, duyệt tác giả/thể loại, tìm và lọc sách, xem ấn bản và số bản sẵn có theo chi nhánh, lưu yêu thích, viết và báo cáo đánh giá, đặt giữ chỗ và theo dõi lượt mượn. Đổi email có mã xác minh gửi tới địa chỉ mới khi người vận hành bật SMTP; mặc định tính năng gửi thư tắt.
- **Thủ thư, quản trị viên:** quản lý danh mục và bản sách, tra cứu thành viên, mượn/trả/gia hạn, xử lý giữ chỗ, xem báo cáo lưu thông, mở phiên kiểm kê, quét mã vạch và xác nhận xử lý sai lệch. ADMIN còn có trang khóa/mở tài khoản, cấp/thu hồi vai trò và xem lịch sử thay đổi. Dashboard hiển thị các số đếm lấy từ API; chưa có feed hoạt động vì backend chưa cung cấp.
- **Tìm kiếm:** PostgreSQL full-text search và trigram; có thể lọc bằng tên thể loại chuẩn hoặc bí danh đã lưu. Thanh tìm kiếm chung gợi ý sách, tác giả và thể loại bằng các truy vấn giới hạn trên server. Metadata ISBN và ảnh bìa dùng quy trình duyệt thủ công; mục chưa có ảnh được duyệt dùng hình thay thế.
- **Đề xuất bổ sung sách:** nhân viên chọn sách, chi nhánh và khoảng thời gian; Core đọc số liệu thật trong một snapshot, Insight tính điểm, lưu bằng chứng và quyết định nội bộ. Có CSV xuất đề xuất đã lưu. Lượt thêm Favorite đã bị bỏ chưa có lịch sử nên tín hiệu này được ghi là thiếu, không điền 0.

Truy vấn snapshot kiểm kê của Toàn đã vào `main` qua [PR #25](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/25), merge commit `e525d34`, giữ nguyên lịch sử tác giả. Search, quản trị Alias, Acquisition và đợt giao diện đã vào `main` qua [PR #27](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/27), merge commit `41c4c89`. Bài E2E Web và EXE tại máy phát triển đạt 18/18 mỗi loại trên database cô lập; [CI PR #27](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40544635046) đạt 5/5 tại head `63d1508`.

## Công nghệ và kiến trúc

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | React, TypeScript, Vite, Tauri 2/WebView2 | Cùng một UI cho web và Windows |
| Core Service | Java 21, Spring Boot, Flyway | Tài khoản, Catalog, lưu thông và kiểm kê |
| Insight Service | NestJS, Prisma | Metadata, discovery và đề xuất bổ sung sách |
| Dữ liệu | PostgreSQL (`lams_core`, `lams_insight`) | Hai database tách theo service |
| Hạ tầng | Redis, Kafka, Docker Compose | Cache/coordination và truyền sự kiện |

Luồng chính: **giao diện → Core/Insight → PostgreSQL**. Insight không đọc trực tiếp database của Core. [Sơ đồ container](tai-lieu/02-kien-truc/container-diagram.md), [ERD](tai-lieu/03-du-lieu/erd.md) và [hợp đồng API](contracts/openapi/) mô tả chi tiết. MinIO là dịch vụ Compose tùy chọn và mặc định tắt; ảnh Catalog hiện là URL tham chiếu đã duyệt.

[Hệ thống giao diện](tai-lieu/06-giao-dien/design-system.md) ghi màu, font, bố cục và cách xử lý ảnh thiếu; [bản đồ chức năng](tai-lieu/06-giao-dien/ban-do-chuc-nang-frontend.md) nối từng màn với API và trạng thái thực tế.

[Quản trị tài khoản](tai-lieu/02-kien-truc/quan-tri-tai-khoan.md) mô tả quyền, chống xung đột và audit. Muốn thử đổi email trên local, bật Mailpit theo [hướng dẫn chạy](tai-lieu/08-van-hanh/chay-local.md); mặc định không gửi thư.
[Tình trạng bản sách](tai-lieu/04-nghiep-vu/kha-dung-sach.md) giải thích cách đọc số bản sẵn có tại một thời điểm và giới hạn khi người đọc đặt giữ chỗ.

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

Máy cần Git, Java 21, PowerShell 7, Docker Desktop/Engine, Node.js 22 và npm 10. Maven dùng wrapper trong repository. Để build desktop còn cần Rust, C++ Build Tools, Windows SDK và WebView2; [script setup](scripts/setup-desktop.ps1) kiểm tra/cài các thành phần này. Docker phải chạy trước khi bootstrap.

```powershell
git clone https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien.git
cd .\He-thong-quan-ly-va-khai-thac-thu-vien
pwsh -NoProfile -File .\scripts\setup-desktop.ps1
pwsh -NoProfile -File .\scripts\bootstrap-local.ps1
pwsh -NoProfile -File .\scripts\smoke-test.ps1
```

`bootstrap-local.ps1` tạo `.env` với mật khẩu PostgreSQL và JWT secret ngẫu nhiên khi chưa có, cài dependency, khởi động Compose và chạy Prisma migration. Nếu `.env` đã có, script kiểm tra cấu hình rồi giữ nguyên secret; không xóa volume cũ. Core chạy Flyway khi khởi động. Dùng PowerShell 7 để các script UTF-8 được đọc đúng.

Nếu dùng **Git Bash trong VS Code**, chạy `./scripts/lams.sh doctor`, `./scripts/lams.sh bootstrap`, `./scripts/lams.sh smoke`. Wrapper gọi các script PowerShell 7, xử lý đường dẫn có dấu/khoảng trắng và dùng Node 22 cục bộ nếu có. Các lệnh `core`, `insight`, `web`, `desktop` chạy ở foreground trong từng terminal riêng; `Ctrl+C` dừng tiến trình đó. Xem [hướng dẫn chạy local](tai-lieu/08-van-hanh/chay-local.md) để biết tất cả lệnh.

Mở **ba cửa sổ PowerShell** tại thư mục repository, mỗi cửa sổ chạy một lệnh:

```powershell
# Cửa sổ 1 — Core
pwsh -NoProfile -File .\scripts\start-core.ps1
```

```powershell
# Cửa sổ 2 — Insight
pwsh -NoProfile -File .\scripts\start-insight.ps1
```

```powershell
# Cửa sổ 3 — ứng dụng Windows
pwsh -NoProfile -File .\scripts\start-desktop.ps1
```

Core health: `http://localhost:8080/api/v1/health`; Insight health: `http://localhost:3000/api/v1/health`. Để phát triển giao diện web, chạy `./scripts/lams.sh web` trong Git Bash hoặc `npm run dev` trong `frontend/` sau khi Core và Insight đã sẵn sàng. [Dữ liệu demo](tai-lieu/09-demo/du-lieu-demo.md) có lệnh seed Catalog và tạo ba tài khoản không lưu mật khẩu trong repository. [Bản đồ chức năng giao diện](tai-lieu/06-giao-dien/ban-do-chuc-nang-frontend.md) ghi đường vào và phạm vi của từng màn.

Bộ seed nhỏ có 32 tác phẩm và 64 bản sách mô phỏng để thử nghiệp vụ. Có thêm [catalog tham khảo 10.000 định danh Project Gutenberg](tai-lieu/09-demo/catalog-nguon-gutenberg.md) cho tìm kiếm quy mô lớn; dữ liệu này không tạo ấn bản hoặc tồn kho vật lý. Trên máy demo, tám bìa Standard Ebooks đã được đối chiếu và duyệt qua Core; [hướng dẫn dữ liệu demo](tai-lieu/09-demo/du-lieu-demo.md#ảnh-bìa) chỉ cách tạo lại các tham chiếu đó trên máy khác. 24 ảnh còn lại chỉ là ứng viên, chưa tự động xuất hiện trên giao diện. Muốn thử hành trình có đăng nhập, người vận hành chạy script tạo tài khoản và nhập mật khẩu tại terminal của chính mình.

## Kiểm thử và build

```powershell
.\scripts\check-quality.ps1
python -m pip install -r contracts/openapi/requirements.txt
python .\scripts\validate-openapi.py
```

`check-quality.ps1` chạy Core `clean verify`, Prisma, Insight test/integration/build, frontend typecheck/lint/test/build và kiểm Compose. OpenAPI validator, E2E web/desktop và kiểm thử bảo mật được chạy riêng theo [pre-push gate](tai-lieu/08-van-hanh/pre-push-gate.md). Kết quả kiểm thử cần gắn với đúng commit; build thành công không thay bài E2E trên EXE.

[Runbook sao lưu và khôi phục](tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md) mô tả cả hai database, diễn tập restore cô lập và giới hạn nhất quán xuyên dịch vụ.
[Vòng đời dữ liệu](tai-lieu/03-du-lieu/quan-tri-vong-doi-du-lieu.md) ghi dữ liệu nào cần đối soát và những quyết định lưu giữ còn chờ đơn vị vận hành.
[Số liệu hiệu năng](tai-lieu/07-kiem-thu/hieu-nang.md) tách phép đo local khỏi SLA triển khai.

## Ứng dụng Windows và bộ cài

```powershell
.\scripts\build-desktop.ps1
.\scripts\start-desktop.ps1 -Release
```

Lệnh build tạo EXE và gói cài trong `frontend/src-tauri/target/release/`. [Hướng dẫn desktop](tai-lieu/08-van-hanh/desktop-windows.md) có đường dẫn cụ thể và cách xử lý lỗi. EXE mở cửa sổ riêng, không cần tab Chrome hoặc Vite khi chạy bản release. **Core, Insight và PostgreSQL vẫn phải chạy hoặc được triển khai riêng**; bộ cài chưa phải hệ thống offline trọn gói. Chưa có updater hoặc ký số.

## Demo và hồ sơ học phần

[Kịch bản demo](tai-lieu/09-demo/kich-ban-demo.md) ghi các bước trình diễn và điều kiện dữ liệu. [Hồ sơ nộp bài](ho-so-nop-bai/README.md) gồm [slide PowerPoint](ho-so-nop-bai/slide/Bao_cao_LAMS_2026-10-27_phase5-7.pptx), [báo cáo nguồn](ho-so-nop-bai/bao-cao-nguon.md), [đối chiếu rubric](ho-so-nop-bai/doi-chieu-rubric.md) và minh chứng giao diện có mốc commit.
[Phụ lục kiểm tra phát hành](ho-so-nop-bai/slide/Phu_luc_kiem_thu_phat_hanh_2026-10-28.pptx) bổ sung số liệu local và điều kiện còn chờ, không thay SHA đã ghi trên slide chính.

## Giới hạn hiện tại

- Phase 5: truy vấn snapshot của Toàn đã vào main qua PR #25; phần phiên, scan, xử lý bất thường và UI có test PostgreSQL cùng E2E Web/EXE. Đã đo một phiên 5.000 Copy với 100 scan; chưa thử máy quét vật lý hoặc tải nhiều phiên trên mạng thật.
- Phase 6: Core có FTS/trigram, xếp hạng, bí danh Category và gợi ý; giao diện đã nối Search/API. Đã đo trên 10.013 Book demo, nhưng sáu câu relevance chỉ là mẫu nhỏ và chưa có SLA production.
- Phase 7: Core có read projection theo Book/chi nhánh, Insight có luồng phân tích/tạo/duyệt và CSV của các đề xuất đã lưu; E2E Core → Insight → UI trên Web/EXE đã đạt tại source `1580bf6`. Chưa có lịch sử đầy đủ lượt thêm Favorite, số lần tìm không ra sách, ngân sách hay luồng đặt mua; `APPROVED` chỉ là quyết định nội bộ.
- [Cấu hình pilot HTTPS](tai-lieu/08-van-hanh/cloud-pilot.md) đã được chuẩn bị, chưa có máy chủ công cộng. Chưa nghiệm thu production, bộ cài trên máy Windows thứ hai hoặc chính sách lưu/xóa dữ liệu đề xuất.
