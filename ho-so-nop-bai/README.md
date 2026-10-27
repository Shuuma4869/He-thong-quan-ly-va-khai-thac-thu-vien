# Hồ sơ nộp bài

| Mục | Nội dung |
|---|---|
| [Slide PowerPoint](slide/Bao_cao_LAMS_2026-10-27_phase5-7.pptx) | 15 slide 16:9 về bài toán, kiến trúc, nghiệp vụ, kiểm thử local và giới hạn. Slide 12 ghi CI 5/5 tại `1580bf6` và E2E Web/EXE 18 bài mỗi loại. |
| [Báo cáo nguồn](bao-cao-nguon.md) | Liên kết yêu cầu, UML, wireframe, API, ORM, bảo mật và demo. |
| [Đối chiếu rubric](doi-chieu-rubric.md) | Bằng chứng và các điều kiện học thuật còn cần xác nhận. |
| [Minh chứng giao diện](minh-chung-giao-dien/README.md) | Ảnh web và EXE/WebView2 có nguồn và SHA kiểm chứng. |

Slide dùng ảnh thư viện đã ghi nguồn trong ghi chú và ảnh giao diện LAMS từ bộ minh chứng. Ảnh từ fixture kiểm thử được chú thích là ảnh thử, không phải dữ liệu vận hành. Số test ở slide 12 là kết quả local ngày 27/10/2026; [CI run #98](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40540834864) đạt 5/5 tại SHA `1580bf6`. Slide giữ đúng mốc đó; CI của commit sau phải xem riêng. Bài E2E trên bản EXE dùng database cô lập, chưa thay cho thử cài đặt trên máy Windows thứ hai.

Chưa có mẫu báo cáo chính thức của trường, video trình bày hoặc minh chứng chuyên cần/thảo luận. Kết quả chạy mới lấy từ CI và artifact đúng commit; không lưu nhật ký chạy tạm trong repository.
