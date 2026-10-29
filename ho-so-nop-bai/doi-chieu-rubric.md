# Đối chiếu rubric và điều kiện bàn giao

Đây là tài liệu nghiệm thu học phần, không phải nhật ký chạy tool. Không tính điểm tổng. Cột trạng thái không thay xác nhận của giảng viên. Q2 chưa có trọng số con nên giữ tổng 1 điểm. Technical Gate có mốc ảnh tại `ee929cd` và lượt kiểm lại tại `dc65064` (CI 5/5, EXE 8/8). [Bảng bằng chứng](minh-chung-giao-dien/README.md) phân biệt hai mốc này với commit sau vòng review hạn mức. Các ô bên dưới ghi bằng chứng đã có, không tự chứng nhận head mới của PR #12. Academic Final Gate chưa đóng.

| Tiêu chí | Trọng số | Trạng thái | Thay đổi/bằng chứng và test | Giới hạn/phụ thuộc |
|---|---|---|---|---|
| Q1 | 1 | Đạt, có bằng chứng | 13 stories/AC/FR/UC + story-test-matrix.md | Phạm vi kỹ thuật, không tự quy đổi thành điểm học phần |
| Q2a | Trong tổng Q2=1 | Một phần | FR/UC mapping, yêu cầu chức năng/phi chức năng | Cần review độ đầy đủ đối tượng/phương thức |
| Q2b | Trong tổng Q2=1 | Đạt, có bằng chứng | Class Diagram/flowchart và ERD đã render; sửa cú pháp ERD cũ | Sơ đồ roadmap tách khỏi schema đang có |
| Q3a | 0,2 | Đạt, có bằng chứng | Wireframe W1–W5 có bố cục, tương tác và trạng thái | Wireframe không phải screenshot runtime |
| Q3b | 0,25 | Đạt, có bằng chứng | Container/system flow/history flow; ORM thật, Redis/Kafka planned | Môi trường production vẫn chưa nghiệm thu |
| Q3c | 0,2 | Một phần | Nest history layered, React, LICENSE | Hybrid và chủ thể bản quyền cần xác nhận |
| Q3d | 0,35 | Một phần | security-matrix.md; Core/Insight/HTTP/owner/session regression; E2E web/EXE | Còn đánh giá môi trường HTTPS triển khai |
| Q4a | 0,5 | Đạt, có bằng chứng | Core/Insight OpenAPI validator, HTTP tests, PostgreSQL và E2E web | Đạt phạm vi endpoint triển khai, không bao gồm roadmap |
| Q4b | 0,2 | Một phần | OpenAPI validator | Mẫu tài liệu API lớp chưa cung cấp |
| Q4c | 0,3 | Một phần | owner/current-role/bind/ORM, input/error và session generation tests | XORs chưa rõ; không khẳng định an toàn tuyệt đối |
| Q5a | 0,3 | Đạt, có bằng chứng | W1 kiểm Chrome Windows local; W2–W5 đối chiếu ảnh web; W5 EXE 1440/390 | Chưa thay nghiên cứu usability với người dùng |
| Q5b | 0,5 | Một phần | React-Bootstrap Form/Button/Alert/Spinner trong MetadataHistory | Booking.com principles có giải thích; mức bao phủ rubric cần xác nhận |
| Q5c | 0,2 | Một phần | wireframes.md ghi số thao tác từ E2E đã chạy | Chưa nghiên cứu người dùng hoặc xác nhận cách đếm ≤4 |
| Q6a | 0,5 | Đạt, có bằng chứng | Prisma schema, repository, PostgreSQL integration 4 case + E2E thật | CI kiểm database tạm; chưa nâng database dev thật |
| Q6b | 0,5 | Đạt, có bằng chứng | metadata-history-orm.md; lifecycle/query/transaction/fresh/upgrade | Không phải sự chấp thuận hybrid của giảng viên |
| Q7.1 | 0,2 | Đạt, có bằng chứng | Unit/HTTP DB→503, DTO400, 401/403/404, UI write failure, E2E | Provider live có thể unavailable; không false success |
| Q7.2 | 0,2 | Đạt, có bằng chứng | story-test-matrix.md; Auth/Member unit mới, parser/provider/history unit | Component/integration được phân loại riêng; không claim 100% coverage |
| Q7.3 | 0,2 | Đạt, có bằng chứng | 8 E2E web CI và 8 E2E EXE/WebView2 local, API/PostgreSQL thật tại ee929cd | Không kiểm bộ cài offline trọn backend hoặc HTTPS production |
| Q7.4 | 0,2 | Một phần | positive/negative service/DTO, owner test | Review PATCH race còn ở handoff; chưa runtime repro |
| Q7.5 | 0,2 | Một phần | Frontend unit/component, account-switch/late response; E2E web/EXE keyboard/responsive | Chưa kiểm trợ năng đầy đủ |
| Q8 | 1 | Một phần | Báo cáo nguồn, ảnh thật có SHA, demo 7:20 dự kiến | Chưa có mẫu trường/video thật, chưa chốt Academic Gate |
| Q9a | 0,2 | Một phần | Luật 91/2025 và 07/2022: nguồn chính thức, hiệu lực/ngày kiểm | Cần rà văn bản hiện hành đầy đủ và quyền asset trước phát hành |
| Q9b | 0,2 | Một phần | Trách nhiệm, AI hỗ trợ, test trung thực | Thành viên xác nhận nội dung và chính sách môn học |
| Q9c | 0,2 | Một phần | Privacy/accessibility/tác động người dùng | Chưa nghiệm thu accessibility đầy đủ |
| Q9d | 0,4 tổng | Chưa kiểm chứng | Không có dữ liệu lớp | Bốn buổi thảo luận do giảng viên/thành viên xác nhận |
| Q10a | 0,25 | Một phần | Báo cáo nguồn: bảng commit/PR #10/#11/#12 và phân công | Alias tác giả cần xác nhận; giữ nguyên Git history |
| Q10b | 0,25 | Một phần | bao-cao-nguon.md; handoff | Cần xác nhận đóng góp thực tế, không suy từ số commit |
| Q10c | 0,5 | Chưa kiểm chứng | Không có dữ liệu lớp | Chuyên cần không suy từ Git |

## Technical Gate

- [x] CI đủ năm job đạt ở head `ee929cd`, run `39907400703`; local/remote khớp tại lần kiểm này. Các commit bàn giao tiếp theo phải kiểm CI riêng trước khi nghiệm thu.
- [x] PostgreSQL Core/Insight regression, fresh và upgrade đã chạy trên CI (xem PR #12).
- [x] HTTP guard/owner/DTO/error, frontend và E2E web đạt trên các commit kiểm chứng.
- [x] E2E EXE/WebView2: 8/8 bài đạt ngày 23/10/2026 tại ee929cd; có process/window handle và kiểm Tauri bridge, database tạm; build installer không thay bước này.
- [x] Có trace từng US/AC sang unit/integration/contract/UI/E2E; phân biệt lớp kiểm thử và giới hạn evidence.
- [x] Class/flow/ERD render đạt; W2–W5 đối chiếu ảnh web; đo thao tác tự động có định nghĩa.
- [x] Đối chiếu EXE history 1440/390 và keyboard; W1 đã kiểm trực quan web local. Không tuyên bố nghiên cứu usability với người tham gia đã hoàn thành.
- [x] LICENSE trung lập, phân biệt quyền mã nguồn/asset/dependency; chưa cấp OSS license.
- [x] Docker local và EXE không còn chặn; kiểm thử không thay dữ liệu development thật.
- [x] PR #12 đã được review và merge theo phê duyệt ngày 23/10/2026 lúc 23:13 (Asia/Saigon) tại b9cf5f3; CI main 39985051027 đạt đủ năm job. Các dòng ee929cd ở trên là snapshot kỹ thuật cũ; không gán kết quả EXE đó cho commit bàn giao mới.

Phase 3 bổ sung US-14/15/16, W6 và minh chứng EXE riêng tại [nguồn ảnh](minh-chung-giao-dien/README.md). Gate tích hợp của Phase 3 phải đối chiếu PR #13/CI đúng head, không tự đóng Academic Final Gate.

## Kiểm tra phát hành local sau Phase 5–7

Ngày 28/10/2026 đã chạy lại 18 E2E Web, 18 E2E trên EXE nguồn và 18 E2E trên EXE cài đặt, cùng Core 279 test, Insight 117 unit/HTTP + 17 integration và frontend 169 test. Bản cài NSIS được gỡ/cài lại trên cùng máy; hai database được backup và restore thử riêng. Đây là phép kiểm local trên working tree trước commit phát hành, không thay CI đúng SHA hoặc bài thử trên máy Windows khác. Các hàng rubric ở trên phản ánh bằng chứng lịch sử của từng mốc, chưa tự động chuyển thành điểm hoặc xác nhận nộp bài. Kết quả cuối phải lấy từ commit và CI được bàn giao; xem [số liệu hiệu năng](../tai-lieu/07-kiem-thu/hieu-nang.md), [security](../tai-lieu/07-kiem-thu/security-matrix.md) và [runbook recovery](../tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md).

## Academic Final Gate

- [ ] Giảng viên xác nhận hybrid/Nest scope và XORs.
- [ ] Mẫu báo cáo chính thức của học phần/trường được cung cấp và áp dụng; không suy trường từ báo cáo tham khảo.
- [ ] Chủ thể quyền/license/asset được xác nhận.
- [ ] Video thật dưới 8 phút và screenshot/evidence có nguồn.
- [ ] Cách đếm tương tác và yêu cầu usability với người tham gia được xác nhận; không suy từ kiểm thử tự động.
- [ ] Danh tính/đóng góp/chuyên cần/thảo luận được con người xác nhận.

## Điều kiện trước pilot có dữ liệu thật

[Chính sách history](../tai-lieu/03-du-lieu/vong-doi-lich-su-isbn.md) đã mô tả dữ liệu, tài khoản ngừng dùng/bị xóa và quy trình được ủy quyền. Các mốc 90 ngày cho history và 30 ngày cho yêu cầu xóa/backup là đề xuất cần chốt; chưa có TTL, cascade hoặc cơ chế thực thi tự động. Đây là việc cần hoàn tất trước pilot, không phải bằng chứng hệ thống đã xóa dữ liệu. HTTPS, bảo vệ ingress và limiter nhiều replica vẫn cần nghiệm thu trên môi trường triển khai.

Tài liệu chính: [báo cáo nguồn](bao-cao-nguon.md), [stories](../tai-lieu/01-yeu-cau/user-stories.md), [ORM](../tai-lieu/02-kien-truc/metadata-history-orm.md), [security](../tai-lieu/07-kiem-thu/security-matrix.md), [handoff](../tai-lieu/00-bat-dau/handoff-phase3-4.md). Kết quả chạy phải lấy từ CI/artifact đúng SHA, không sao chép test count cũ vào báo cáo.
