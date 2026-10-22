# LAMS — Hệ thống quản lí và khai thác thư viện

Bản nguồn nội dung báo cáo học phần. Chưa có mẫu Phenikaa chính thức để xác nhận định dạng. Tên pháp lý, mã sinh viên, lớp, giảng viên, học kỳ và ngày nộp do thành viên bổ sung theo hồ sơ thật; không tự điền từ alias Git.

## 1. Mục tiêu và phạm vi

LAMS hỗ trợ tra cứu và biên mục thư viện, tách tác phẩm, ấn bản và bản sách. Phạm vi thực thi: Auth, Member chỉ đọc, Catalog/Inventory, metadata và ảnh duyệt thủ công; Phase 2.5 bổ sung history ISBN trong Insight. Backend Favorites/Reviews/Rating đã merge nhưng UI chưa triển khai. Circulation/Hold/search nâng cao vẫn roadmap, không đưa vào demo như chức năng có thật.

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

Auth, Profile, Member, Catalog/detail/staff theo design system LAMS. History dùng React-Bootstrap Form/Button/Alert/Spinner với CSS scoped không import Reboot toàn cục. Tham khảo nguyên tắc search/filter/action rõ ràng của Booking.com, không sao chép hình ảnh/logo. Wireframe có loading/empty/error/pending. Chưa kết luận tiêu chí số thao tác trước khi đo runtime.

## 8. Bảo mật

[Security matrix](../tai-lieu/07-kiem-thu/security-matrix.md) liên kết threat/control/test/residual risk. JWT access trong memory; refresh HttpOnly; principal lấy qua Core; owner không từ body. Không thể kết luận “không có lỗ hổng” từ npm audit hoặc CI. “XORs” chờ giảng viên xác nhận.

## 9. Kiểm thử và kết quả

[Chiến lược](../tai-lieu/07-kiem-thu/test-strategy.md) phân biệt unit/integration/contract/frontend/E2E. Bằng chứng cuối phải là CI đúng SHA và E2E web/EXE tương ứng. Test database tạm, không dùng dev data. Bộ test history đã được thêm; PostgreSQL/E2E chưa nghiệm thu khi Docker không sẵn sàng. Không gọi build thành công là demo persistence thành công.

## 10. Cài đặt và sử dụng

Theo [README](../README.md), [runbook local](../tai-lieu/08-van-hanh/chay-local.md), [desktop](../tai-lieu/08-van-hanh/desktop-windows.md). Node 22, Java 21, Docker, PostgreSQL; bootstrap/migration chỉ chạy với môi trường được phép. Bộ cài Tauri là giao diện, backend/database vẫn cần chạy riêng. Chưa có bộ cài offline trọn hệ thống hoặc nghiệm thu cloud production.

## 11. Phân công và đóng góp

Tuan phụ trách kiến trúc/frontend/tích hợp/Insight Phase 2.5; Toan phụ trách các module backend được task map giao, gồm PR #11. Không nhận công việc Toan là của Tuan. PR/commit là nguồn truy vết; alias “「锋」Phong” cần xác nhận. Tác giả, committer, reviewer và người hỗ trợ không đồng nghĩa nhau. [Hướng dẫn thành viên](../tai-lieu/00-bat-dau/huong-dan-thanh-vien.md) là phân công, không tự chứng minh mọi task DONE.

## 12. Pháp luật và đạo đức

[Xem căn cứ và giới hạn](../tai-lieu/01-yeu-cau/phap-luat-va-dao-duc.md). Bảo vệ dữ liệu, nguồn ảnh/metadata, minh bạch AI hỗ trợ, accessibility và test trung thực là nghĩa vụ cần trình bày rõ. LICENSE trung lập không cấp quyền mã nguồn mở. Chuyên cần/thảo luận cần minh chứng thật ngoài repo.

## 13. Hạn chế và hướng phát triển

Chưa đóng xác nhận hybrid từ giảng viên, format trường, quyền bản quyền, video thật, điểm danh/thảo luận. Chưa nghiệm thu đầy đủ history PostgreSQL/E2E và UI trực quan. Phase 3 review update cạnh tranh cần xử lý ở đợt review tiếp theo. [Handoff Phase 3/4](../tai-lieu/00-bat-dau/handoff-phase3-4.md) không phải lời tuyên bố đã triển khai.

## 14. Phụ lục bằng chứng

- Repository: https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien
- PR #10: Phase 2; PR #11: backend Phase 3. PR Phase 2.5 chỉ ghi khi thực sự tạo.
- SHA, kết quả CI và E2E: lấy từ lần bàn giao cuối; không dùng số test cũ làm bằng chứng bản mới.
- Screenshot web/desktop: chưa đính kèm cho history.
- Video demo: chưa quay, chưa có link.
- [Kịch bản demo](../tai-lieu/09-demo/kich-ban-demo.md) có thời lượng dự kiến; video thực tế phải <8 phút.
