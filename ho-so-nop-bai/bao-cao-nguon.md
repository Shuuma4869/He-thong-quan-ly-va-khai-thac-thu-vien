# LAMS — Hệ thống quản lí và khai thác thư viện

Bản nguồn nội dung báo cáo học phần. Chưa có mẫu Phenikaa chính thức để xác nhận định dạng. Tên pháp lý, mã sinh viên, lớp, giảng viên, học kỳ và ngày nộp do thành viên bổ sung theo hồ sơ thật; không tự điền từ alias Git.

## 1. Mục tiêu và phạm vi

LAMS hỗ trợ tra cứu và biên mục thư viện, tách tác phẩm, ấn bản và bản sách. Ứng dụng hiện có Auth, hồ sơ và danh sách thành viên chỉ đọc, Catalog/Inventory, lịch sử tra ISBN, Favorites/Reviews/Rating, mượn/trả/gia hạn, giữ chỗ và tìm kiếm từ vựng. Web và ứng dụng Windows dùng chung giao diện; ảnh bên ngoài chỉ hiển thị sau khi nhân viên duyệt. Luồng đề xuất bổ sung sách đã được kiểm E2E xuyên Core, Insight và giao diện trên Web và EXE ở máy phát triển, với hai database PostgreSQL cô lập. Hệ thống chưa có đặt mua hay thanh toán.

## 2. Yêu cầu người dùng

Nhóm có hai thành viên theo phân công dự án. [13 User Stories và AC](../tai-lieu/01-yeu-cau/user-stories.md) là nguồn truy vết requirement/use case/API/UI/data/test. Mỗi story phải có evidence của commit nộp bài. Không sử dụng roadmap để tăng số story hoàn thành.

## 3. Phân tích và thiết kế

[Xem Class Diagram và flowchart](../tai-lieu/02-kien-truc/lop-va-thuat-toan.md), [ERD](../tai-lieu/03-du-lieu/erd.md), [wireframe](../tai-lieu/06-giao-dien/wireframes.md). ERD mô tả persistence, Class Diagram mô tả lớp và phương thức; wireframe mô tả bố cục, không thay bằng danh sách route. Lớp Core sử dụng JDBC dù dependency JPA hiện có.

## 4. Kiến trúc

Spring Boot Java 21 sở hữu Identity/Catalog/Inventory và các giao dịch Core; NestJS Node 22 sở hữu metadata và lịch sử tra cứu. React/TypeScript dùng chung cho web và Tauri Windows. Hai database PostgreSQL tách ownership; không sao chép Catalog làm nguồn thật trong Insight. Redis/Kafka/MinIO chỉ được mô tả theo implementation thực tế, không coi mọi thành phần Compose là luồng nghiệp vụ đang chạy.

## 5. Database và ORM

[Metadata history/Prisma lifecycle](../tai-lieu/02-kien-truc/metadata-history-orm.md) mô tả schema, migration, request flow, query, transaction và test. History lưu UUID actor, ISBN, provider/status và timestamp; không lưu nội dung bên thứ ba. Count/list dùng RepeatableRead; remote HTTP ngoài transaction. Dữ liệu Core không được Insight ghi.

## 6. API

[Core OpenAPI](../contracts/openapi/core-api.yaml), [Insight OpenAPI](../contracts/openapi/insight-api.yaml). Phiên bản API /api/v1. Auth và owner kiểm ở server; DTO/request/response không tự suy từ UI. Validation schema chưa thay runtime test. Bản ghi history mới chỉ trả thành công sau khi DB write thành công.

## 7. Giao diện

Giao diện có trang cho người đọc, danh mục, My Library, mượn và giữ chỗ; nhân viên có màn hình biên mục, quầy lưu thông, kiểm kê và báo cáo. History dùng React-Bootstrap Form/Button/Alert/Spinner với CSS scoped. Các màn hình có trạng thái tải, rỗng và lỗi theo từng luồng. [Bản đồ chức năng](../tai-lieu/06-giao-dien/ban-do-chuc-nang-frontend.md) nối màn hình với API và bài kiểm thử; [wireframe](../tai-lieu/06-giao-dien/wireframes.md) ghi cách đếm thao tác. Chưa có kết quả nghiên cứu với người dùng để khẳng định mọi hành trình đạt bốn tương tác.

## 8. Bảo mật

[Security matrix](../tai-lieu/07-kiem-thu/security-matrix.md) liên kết threat/control/test/residual risk. JWT access trong memory; refresh HttpOnly; principal lấy qua Core; owner không từ body. Không thể kết luận “không có lỗ hổng” từ npm audit hoặc CI. “XORs” chờ giảng viên xác nhận.

## 9. Kiểm thử và kết quả

[Chiến lược](../tai-lieu/07-kiem-thu/test-strategy.md) và [ma trận AC](../tai-lieu/07-kiem-thu/story-test-matrix.md) phân biệt unit/integration/contract/frontend/E2E. [Ảnh và SHA kiểm UI](minh-chung-giao-dien/README.md) có nguồn rõ. Tại `ee929cd`, CI run `39907400703` đạt năm job; E2E Windows local có 8/8 bài trong EXE/WebView2 cho history. Đây là bằng chứng của bản Phase 2.5. Ở head PR #27 `63d1508`, [CI run `40544635046`](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40544635046) đạt năm job. Lượt E2E Phase 5–7 riêng ở máy phát triển đạt 18/18 Web và 18/18 EXE trên database tạm; kết quả này không tự động là kết quả EXE tại merge commit `41c4c89`. Build installer không thay kiểm WebView2.

## 10. Cài đặt và sử dụng

Theo [README](../README.md), [runbook local](../tai-lieu/08-van-hanh/chay-local.md), [desktop](../tai-lieu/08-van-hanh/desktop-windows.md). Node 22, Java 21, Docker, PostgreSQL; bootstrap/migration chỉ chạy với môi trường được phép. Bộ cài Tauri là giao diện, backend/database vẫn cần chạy riêng. Chưa có bộ cài offline trọn hệ thống hoặc nghiệm thu cloud production.

## 11. Phân công và đóng góp

Tuan phụ trách kiến trúc, frontend và tích hợp; Toan phụ trách các module backend được task map giao. PR/commit là nguồn truy vết; alias “「锋」Phong” cần xác nhận với chủ tài khoản. Tác giả code, người merge và người review là các vai trò khác nhau. [Hướng dẫn thành viên](../tai-lieu/00-bat-dau/huong-dan-thanh-vien.md) ghi phân công, không tự chứng minh mọi task đã hoàn thành. PR #25 của Toan và PR #27 từ nhánh Tuan đã vào `main`; bảng đóng góp cuối cùng vẫn cần đối chiếu từng commit và xác nhận danh tính tác giả.

| Bằng chứng Git | Tác giả hiển thị | Nội dung kiểm được | Giới hạn diễn giải |
|---|---|---|---|
| PR #10, squash 8698405 | Nguyễn Trọng Tuấn | Tích hợp Phase 2 | Không nhận toàn bộ code nền của Toan là của người merge |
| PR #11, f4dcbcb; merge b8e7bc6 | 23010062-star; merge Nguyễn Trọng Tuấn | Favorites/Reviews/Rating backend | Tách author code khỏi người merge; UI được bổ sung ở PR sau |
| PR #12, b3b067e | 「锋」Phong | History Nest/Prisma + contract/test | Thực hiện trên nhánh DEV1; alias cần chủ tài khoản xác nhận |
| PR #12, 160b6b5 | 「锋」Phong | UI history, React-Bootstrap, bảo vệ phiên | Không suy kết quả review chỉ từ người tạo commit |
| PR #12, 08f5b35 và các commit tiếp | 「锋」Phong | Thiết kế/hồ sơ/test bổ sung | Xem lịch sử PR để lấy SHA nộp cuối; không suy điểm chuyên cần |
| PR #13, fe16d64–6598dd3; merge ea93b7a | 「锋」Phong; merge Nguyễn Trọng Tuấn | Sửa lỗi tích hợp backend, truy vấn cá nhân và UI Favorites/Reviews/Rating/My Library | Backend gốc vẫn thuộc Toan; head PR đạt CI 5/5 tại 40010074211; kết quả EXE phân biệt checkout/binary trong thư mục minh chứng |
| PR #25; merge e525d34 | Xem tác giả từng commit trong PR | Truy vấn snapshot kiểm kê do Toan bàn giao | Người tích hợp không nhận tác giả code gốc |
| PR #27, head 63d1508; merge 41c4c89 | Xem tác giả từng commit trong PR | Search, quản trị Alias, Acquisition, giao diện và kiểm thử tích hợp | CI head 5/5; E2E Web/EXE 18/18 là kết quả local, không gán cho merge SHA |

## 12. Pháp luật và đạo đức

[Xem căn cứ và giới hạn](../tai-lieu/01-yeu-cau/phap-luat-va-dao-duc.md). Bảo vệ dữ liệu, nguồn ảnh/metadata, minh bạch AI hỗ trợ, accessibility và test trung thực là nghĩa vụ cần trình bày rõ. LICENSE trung lập không cấp quyền mã nguồn mở. Chuyên cần/thảo luận cần minh chứng thật ngoài repo.

## 13. Hạn chế và hướng phát triển

Chưa đóng xác nhận hybrid từ giảng viên, định dạng trường, quyền sử dụng ảnh, video thật và minh chứng điểm danh/thảo luận. Web và EXE đã có E2E cho các hành trình chính; nghiệm thu trợ năng/usability với người dùng và triển khai HTTPS vẫn chưa có. [Chính sách vòng đời history](../tai-lieu/03-du-lieu/vong-doi-lich-su-isbn.md) phân biệt hành vi hiện tại với đề xuất trước pilot; mốc lưu giữ, xử lý tài khoản ngừng dùng/bị xóa và backup chưa được code tự động thực thi. Dữ liệu demo mới có Catalog; tài khoản mẫu và ảnh bìa cần bước chuẩn bị riêng trước khi quay video.

## 14. Phụ lục bằng chứng

- Repository: https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien
- PR #10: Phase 2; PR #11: backend Phase 3; [PR #12](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/12): Phase 2.5 đã merge tại b9cf5f3, CI main 39985051027 đạt 5/5. [PR #25](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/25) và [PR #27](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/27) là nguồn truy vết tích hợp Phase 5–7.
- SHA, kết quả CI và E2E: lấy từ lần bàn giao cuối; không dùng số test cũ làm bằng chứng bản mới.
- Screenshot history: [ảnh web CI và nội dung WebView2 của EXE thật](minh-chung-giao-dien/README.md), phân biệt rõ môi trường chụp.
- Video demo: chưa quay, chưa có link.
- [Kịch bản demo](../tai-lieu/09-demo/kich-ban-demo.md) có thời lượng dự kiến; video thực tế phải <8 phút.
