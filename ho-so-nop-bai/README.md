# Hồ sơ nộp bài

| Mục | Nội dung |
|---|---|
| [Slide PowerPoint](slide/Bao_cao_LAMS_2026-10-27_phase5-7.pptx) | 15 slide 16:9 về bài toán, kiến trúc, nghiệp vụ, kiểm thử local và giới hạn. Slide 12 ghi CI 5/5 tại `1580bf6` và E2E Web/EXE 18 bài mỗi loại. |
| [Phụ lục kiểm tra phát hành](slide/Phu_luc_kiem_thu_phat_hanh_2026-10-28.pptx) | 3 slide bổ sung kết quả thử local, cài/gỡ Windows và các điều kiện còn chờ; dùng cùng bộ slide chính khi báo cáo. |
| [Báo cáo nguồn](bao-cao-nguon.md) | Liên kết yêu cầu, UML, wireframe, API, ORM, bảo mật và demo. |
| [Báo cáo tiểu luận](bao-cao/Bao-cao-tieu-luan-LAMS.pdf) | Bản PDF A4, 48 trang; [DOCX](bao-cao/Bao-cao-tieu-luan-LAMS.docx) để sửa và [Markdown](bao-cao/Bao-cao-tieu-luan-LAMS.md) làm nguồn. Có 29 User Stories (22 yêu cầu gốc, 7 story tổng hợp từ chức năng đã có), 25 hình, 14 bảng, UML/ERD, thuật toán, wireframe, ORM/API, kiểm thử, bảo mật và giới hạn. |
| [Đối chiếu rubric](doi-chieu-rubric.md) | Bằng chứng và các điều kiện học thuật còn cần xác nhận. |
| [Minh chứng giao diện](minh-chung-giao-dien/README.md) | Ảnh web và EXE/WebView2 có nguồn và SHA kiểm chứng. |
| [Ảnh giao diện PR #31](minh-chung-giao-dien/pr31/README.md) | 13 ảnh gốc từ artifact Web E2E tại `0ef4007` và 2 ảnh trang tĩnh chụp local; không coi là bằng chứng EXE/WebView2. |
| [Ảnh giao diện vòng cuối](minh-chung-giao-dien/23b90ba/README.md) | 50 ảnh toàn trang và 2 viewport ở UI commit `23b90ba`, chụp web local với Core/Insight/PostgreSQL demo; thêm [7 ảnh EXE E2E](minh-chung-giao-dien/23b90ba/desktop-e2e/README.md) có giao dịch test thật. |

Slide dùng ảnh thư viện đã ghi nguồn trong ghi chú và ảnh giao diện LAMS từ bộ minh chứng. Ảnh từ fixture kiểm thử được chú thích là ảnh thử, không phải dữ liệu vận hành. Số test ở slide 12 là kết quả local ngày 27/10/2026; [CI run #98](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40540834864) đạt 5/5 tại SHA `1580bf6`. Slide giữ đúng mốc đó; CI của commit sau phải xem riêng. Bài E2E trên bản EXE dùng database cô lập, chưa thay cho thử cài đặt trên máy Windows thứ hai.

Chưa có mẫu báo cáo chính thức của trường, video trình bày hoặc minh chứng chuyên cần/thảo luận. Báo cáo tiểu luận hiện là bản làm việc: lớp học phần, tên và mã số hai thành viên lấy từ README LAMS; trường/khoa, giảng viên, logo, địa điểm và ngày nộp còn chờ nhóm xác nhận. Ảnh và kết quả trong báo cáo gắn với từng SHA `0ef4007`, `8169ac7` hoặc `23b90ba`; CI của commit nộp cuối phải xem riêng. Không lưu nhật ký chạy tạm trong repository.

Đợt kiểm tra phát hành sau slide hiện tại có [số liệu hiệu năng](../tai-lieu/07-kiem-thu/hieu-nang.md), [ma trận bảo mật](../tai-lieu/07-kiem-thu/security-matrix.md), [diễn tập sao lưu/khôi phục](../tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md) và [phạm vi vòng đời dữ liệu](../tai-lieu/03-du-lieu/quan-tri-vong-doi-du-lieu.md). Slide ngày 27/10 giữ nguyên số liệu và SHA đã ghi; khi trình bày kết quả mới phải đối chiếu commit, CI và EXE mới, không gộp hai mốc làm một.
