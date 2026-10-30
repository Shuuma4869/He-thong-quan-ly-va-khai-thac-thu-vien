# Hồ sơ nộp bài

| Mục | Nội dung |
|---|---|
| [Slide PowerPoint](slide/Bao_cao_LAMS_2026-10-27_phase5-7.pptx) | 15 slide 16:9 về bài toán, kiến trúc, nghiệp vụ, kiểm thử local và giới hạn. Slide 12 ghi CI 5/5 tại `1580bf6` và E2E Web/EXE 18 bài mỗi loại. |
| [Phụ lục kiểm tra phát hành](slide/Phu_luc_kiem_thu_phat_hanh_2026-10-28.pptx) | 3 slide bổ sung kết quả thử local, cài/gỡ Windows và các điều kiện còn chờ; dùng cùng bộ slide chính khi báo cáo. |
| [Báo cáo nguồn](bao-cao-nguon.md) | Liên kết yêu cầu, UML, wireframe, API, ORM, bảo mật và demo. |
| [Báo cáo tiểu luận](bao-cao/Bao-cao-tieu-luan-LAMS.pdf) | Báo cáo cá nhân của Nguyễn Trọng Tuấn, PDF A4, 65 trang; [DOCX](bao-cao/Bao-cao-tieu-luan-LAMS.docx) để sửa và [Markdown](bao-cao/Bao-cao-tieu-luan-LAMS.md) làm nguồn. Có phần chung của nhóm và chương đóng góp cá nhân; 29 User Stories, 10 Use Case, 25 hình, 19 bảng, 21 nguồn tham khảo. Bổ sung NFR, rủi ro, quyết định kiến trúc và ví dụ thuật toán; [manifest](bao-cao/manifest-bao-cao.json) ghi baseline và nguồn minh chứng. |
| [Đối chiếu rubric](doi-chieu-rubric.md) | Bằng chứng và các điều kiện học thuật còn cần xác nhận. |
| [Minh chứng giao diện](minh-chung-giao-dien/README.md) | Ảnh web và EXE/WebView2 có nguồn và SHA kiểm chứng. |
| [Ảnh giao diện PR #31](minh-chung-giao-dien/pr31/README.md) | 13 ảnh gốc từ artifact Web E2E tại `0ef4007` và 2 ảnh trang tĩnh chụp local; không coi là bằng chứng EXE/WebView2. |
| [Ảnh Reader–Librarian tại `00afafa`](minh-chung-giao-dien/00afafa/README.md) | 5 ảnh gốc từ Web E2E cô lập tại code SHA `00afafa`; gồm tồn kho Book, Reader circulation và Hold READY của Librarian ở desktop/mobile. Không phải ảnh EXE. |
| [Ảnh giao diện vòng cuối](minh-chung-giao-dien/23b90ba/README.md) | 50 ảnh toàn trang và 2 viewport ở UI commit `23b90ba`, chụp web local với Core/Insight/PostgreSQL demo; thêm [7 ảnh EXE E2E](minh-chung-giao-dien/23b90ba/desktop-e2e/README.md) có giao dịch test thật. |
| [Ảnh Web E2E tại main](minh-chung-giao-dien/d0ba015/README.md) | 6 ảnh gốc từ run `40880637621` tại `d0ba015`; ảnh Reader và dashboard Admin được dùng trong báo cáo. Không phải ảnh EXE. |

Slide dùng ảnh thư viện đã ghi nguồn trong ghi chú và ảnh giao diện LAMS từ bộ minh chứng. Ảnh từ fixture kiểm thử được chú thích là ảnh thử, không phải dữ liệu vận hành. Số test ở slide 12 là kết quả local ngày 27/10/2026; [CI run #98](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40540834864) đạt 5/5 tại SHA `1580bf6`. Slide giữ đúng mốc đó; CI của commit sau phải xem riêng. Bài E2E trên bản EXE dùng database cô lập, chưa thay cho thử cài đặt trên máy Windows thứ hai.

Bìa theo mẫu báo cáo học phần trước do tác giả cung cấp; trường, logo, tên tác giả, lớp và năm học đã xác nhận. Giảng viên được để trống theo yêu cầu để tác giả bổ sung trước khi nộp, vì vậy hồ sơ hiện ở trạng thái NEEDS_USER_INPUT. Baseline nội dung là main d0ba015; kết quả EXE và ảnh cũ giữ đúng SHA nguồn. Chưa có video trình bày hoặc minh chứng chuyên cần/thảo luận trong bộ hồ sơ này.

Đợt kiểm tra phát hành sau slide hiện tại có [số liệu hiệu năng](../tai-lieu/07-kiem-thu/hieu-nang.md), [ma trận bảo mật](../tai-lieu/07-kiem-thu/security-matrix.md), [diễn tập sao lưu/khôi phục](../tai-lieu/08-van-hanh/sao-luu-khoi-phuc.md) và [phạm vi vòng đời dữ liệu](../tai-lieu/03-du-lieu/quan-tri-vong-doi-du-lieu.md). Slide ngày 27/10 giữ nguyên số liệu và SHA đã ghi; khi trình bày kết quả mới phải đối chiếu commit, CI và EXE mới, không gộp hai mốc làm một.

## Cập nhật và xuất báo cáo

Sửa bản Markdown trước; chỉ sửa DOCX riêng khi cần điền thông tin nộp bài, vì lần dựng sau sẽ lấy lại nội dung từ nguồn. Bộ dựng dùng Python với `python-docx`, Pillow; bộ kiểm cấu trúc cần thêm `pypdf`, `lxml`. Các sơ đồ PlantUML có nguồn trong `bao-cao/so-do/`; khi sửa sơ đồ, chạy `scripts/render-report-uml.ps1 -PlantUmlJar <đường-dẫn-JAR>` từ root. Các hình giải thích còn lại được dựng bằng `scripts/report_figures.py`.

Từ root repository, chạy `python scripts/build-lams-report.py`, rồi `pwsh -File scripts/export-lams-report.ps1`. Bước xuất cần Microsoft Word trên Windows để cập nhật TOC, SEQ và PAGEREF, sau đó xuất PDF. Script mở một phiên Word riêng và không đóng tài liệu người dùng đang mở. Chạy `python scripts/verify-lams-report.py` để kiểm cấu trúc, số hình/bảng, bookmark và liên kết local. Sau mỗi lần thay đổi, vẫn phải render PDF và xem từng trang; kiểm cấu trúc không thay kiểm bố cục. Cập nhật hash trong manifest khi các file đầu ra hoặc ảnh thay đổi.
