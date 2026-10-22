# Đối chiếu rubric và điều kiện bàn giao

Đây là tài liệu nghiệm thu học phần, không phải nhật ký chạy tool. Không tính điểm tổng. Cột trạng thái không thay xác nhận của giảng viên. Q2 chưa có trọng số con nên giữ tổng 1 điểm. Technical Gate hiện chưa đạt; không dùng ma trận này như chứng nhận hoàn thành Phase 2.5.

| Tiêu chí | Trọng số | Trạng thái | Thay đổi/bằng chứng và test | Giới hạn/phụ thuộc |
|---|---|---|---|---|
| Q1 | 1 | Một phần | user-stories.md: 13 stories/AC/trace | Cần evidence cuối theo từng AC và unit gaps |
| Q2a | Trong tổng Q2=1 | Một phần | FR/UC mapping, yêu cầu chức năng/phi chức năng | Cần review độ đầy đủ đối tượng/phương thức |
| Q2b | Trong tổng Q2=1 | Một phần | lop-va-thuat-toan.md; ERD riêng | Cần render/đối chiếu đầy đủ diagram trước bàn giao |
| Q3a | 0,2 | Một phần | wireframes.md W1–W5 | Bố cục có thật trong tài liệu; chưa kiểm trực quan UI cuối |
| Q3b | 0,25 | Một phần | system-flow.md, auth sequence, history flow | Cần review current/planned nhất quán toàn bộ diagram |
| Q3c | 0,2 | Một phần | Nest history layered, React, LICENSE | Hybrid và chủ thể bản quyền cần xác nhận |
| Q3d | 0,35 | Một phần | security-matrix.md; guard/session tests | PostgreSQL/E2E và môi trường triển khai chưa chốt |
| Q4a | 0,5 | Một phần | Core/Insight OpenAPI; HistoryController | HTTP/DB nghiệm thu cuối còn thiếu |
| Q4b | 0,2 | Một phần | OpenAPI validator | Mẫu tài liệu API lớp chưa cung cấp |
| Q4c | 0,3 | Một phần | owner/current-role/bind/ORM | XORs chưa rõ; security test đủ scope chưa chốt |
| Q5a | 0,3 | Chưa kiểm chứng | wireframes.md | Chưa đối chiếu trực quan web/desktop |
| Q5b | 0,5 | Một phần | React-Bootstrap Form/Button/Alert/Spinner trong MetadataHistory | Booking.com principles có giải thích; mức bao phủ rubric cần xác nhận |
| Q5c | 0,2 | Chưa kiểm chứng | Kịch bản đo trong wireframe | Chưa đo số thao tác runtime |
| Q6a | 0,5 | Một phần | MetadataLookup/Prisma/HistoryRepository/migration | Test PostgreSQL hiện bị chặn môi trường, chưa PASS |
| Q6b | 0,5 | Một phần | metadata-history-orm.md | Bổ sung evidence migration upgrade độc lập/HTTP boundary |
| Q7.1 | 0,2 | Một phần | Service DB→503, DTO, UI alerts | Cần HTTP negative tests và E2E |
| Q7.2 | 0,2 | Một phần | history.spec và frontend tests; story trace | Chưa hoàn tất unit mapping mọi story |
| Q7.3 | 0,2 | Chưa kiểm chứng | E2E mới và script database cô lập | Chưa chạy toàn ứng dụng bản cuối |
| Q7.4 | 0,2 | Một phần | positive/negative service/DTO, owner test | Review PATCH race còn ở handoff; chưa runtime repro |
| Q7.5 | 0,2 | Một phần | MetadataHistory.test, regression frontend | Cần account-switch/race/accessibility cases và E2E cuối |
| Q8 | 1 | Một phần | bao-cao-nguon.md, demo 7:20 dự kiến | Thiếu mẫu trường/video thật/screenshot và evidence cuối |
| Q9a | 0,2 | Một phần | phap-luat-va-dao-duc.md: nguồn chính thức, hiệu lực/ngày kiểm tra | Chưa kết luận tuân thủ; cần nguồn sở hữu trí tuệ/điều khoản asset đầy đủ |
| Q9b | 0,2 | Một phần | Trách nhiệm, AI hỗ trợ, test trung thực | Thành viên xác nhận nội dung và chính sách môn học |
| Q9c | 0,2 | Một phần | Privacy/accessibility/tác động người dùng | Chưa nghiệm thu accessibility đầy đủ |
| Q9d | 0,4 tổng | Chưa kiểm chứng | Không có dữ liệu lớp | Bốn buổi thảo luận do giảng viên/thành viên xác nhận |
| Q10a | 0,25 | Một phần | Git/PR #10/#11 và phân công | Alias tác giả cần xác nhận; không sửa lịch sử |
| Q10b | 0,25 | Một phần | bao-cao-nguon.md; handoff | Cần xác nhận đóng góp thực tế, không suy từ số commit |
| Q10c | 0,5 | Chưa kiểm chứng | Không có dữ liệu lớp | Chuyên cần không suy từ Git |

## Technical Gate

- [ ] CI đúng SHA cuối đạt, local/remote xác minh.
- [ ] PostgreSQL Core/Insight regression, fresh và upgrade được chạy thực tế.
- [ ] HTTP guard/owner/DTO/error, frontend và E2E web/EXE đạt.
- [ ] User Story/AC→unit/integration/contract/UI/E2E→evidence đủ, không gọi integration là unit.
- [ ] Diagram/wireframe đã render và đối chiếu source/UI; usability đã đo.
- [ ] Không còn blocker kỹ thuật trong scope; LICENSE/asset status minh bạch.
- [ ] PR chỉ chờ người review, không tự merge main.

## Academic Final Gate

- [ ] Giảng viên xác nhận hybrid/Nest scope và XORs.
- [ ] Mẫu báo cáo Phenikaa được cung cấp và áp dụng.
- [ ] Chủ thể quyền/license/asset được xác nhận.
- [ ] Video thật dưới 8 phút và screenshot/evidence có nguồn.
- [ ] Danh tính/đóng góp/chuyên cần/thảo luận được con người xác nhận.

Tài liệu chính: [báo cáo nguồn](bao-cao-nguon.md), [stories](../tai-lieu/01-yeu-cau/user-stories.md), [ORM](../tai-lieu/02-kien-truc/metadata-history-orm.md), [security](../tai-lieu/07-kiem-thu/security-matrix.md), [handoff](../tai-lieu/00-bat-dau/handoff-phase3-4.md). Kết quả chạy phải lấy từ CI/artifact đúng SHA, không sao chép test count cũ vào báo cáo.
