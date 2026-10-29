# Nợ kỹ thuật và dependency

## Frontend development dependencies

Vitest đã nâng lên 5.0.4, typescript-eslint lên 8.71.2 và source-map-js bắc cầu lên bản vá trong lockfile. Khi nâng tooling phải chạy lại typecheck, test, lint, web/desktop build và E2E; không dùng npm audit fix --force hoặc bỏ test để làm sạch cảnh báo.

Kết quả audit phụ thuộc advisory tại thời điểm chạy, không chứng minh toàn bộ dependency an toàn. Kiểm cả cây đầy đủ và omit=dev trước release. Một số dependency có cảnh báo deprecated dù không có advisory; cần bảo trì riêng theo tương thích, không nâng major dây chuyền khi chưa kiểm thử.

## Lần kiểm tra ngày 25/10/2026

`npm audit` trên lockfile frontend và Insight trả 0 advisory sau khi nâng Zod lên 4.6.7 và ghim `multer` 2.5.0, `body-parser` 2.4.0, `fast-uri` 3.1.9 trong Insight. Nest vẫn ở 11.2.6; các bản chuyển tiếp này được ép để tránh advisory trong cây dependency. Cần giữ kiểm thử cài sạch, API, E2E và build Windows ở đúng SHA trước khi phát hành. Kết quả npm chỉ phản ánh advisory registry tại ngày kiểm tra, không thay review mã nguồn, image Docker hoặc cấu hình triển khai.

## Test coverage

Auth/Member, Catalog, lưu thông, giữ chỗ và kiểm kê đã có integration PostgreSQL cùng các bài E2E riêng. Phase 7 có read projection Core cho số Copy, Hold và Loan, adapter Insight, hàm tính điểm, bảng lưu/duyệt, API/UI cho nhân viên và CSV đề xuất đã lưu. Core projection, migration/transaction của Insight, adapter và HTTP guard có test riêng. Web và EXE E2E trên máy phát triển đã tạo Loan/Hold qua API Core, xem điểm và lưu/duyệt qua UI, đối chiếu bản ghi/audit trong PostgreSQL Insight, thử từ chối và hai quyết định cạnh tranh; mỗi suite đạt 18/18. [CI head PR #27](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/40544635046) đạt 5/5. Chưa có lịch sử lượt thêm Favorite hay tìm kiếm không ra kết quả; ngân sách/đặt mua cũng chưa có nguồn. [Vòng đời dữ liệu](../03-du-lieu/vong-doi-de-xuat-bo-sung.md) có dry-run chỉ đọc, nhưng thời hạn lưu và quy trình purge production chưa được phê duyệt. Coverage của một module không chứng minh module khác đã đạt; build installer không thay E2E WebView2 trên đúng bản EXE.

Category Alias V23 có service/repository và Search đọc được bí danh. API cùng màn hình quản trị cho thủ thư đã vào `main` qua PR #27, có CI head 5/5. Không ghi thẳng database production bằng tay để bù lỗi giao diện.

## Lần kiểm tra ngày 30/10/2026

Frontend không có advisory trong lượt `npm audit`; Insight có tám kết quả LOW do `deepmerge` trong Jest và công cụ build Nest. `npm audit --omit=dev` của Insight không có advisory. [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) chưa công bố phiên bản vá tại lúc kiểm tra. Không nhận cấu hình build/test không tin cậy, không mang dev dependencies vào image runtime, và kiểm lại khi upstream phát hành bản sửa. Gợi ý `npm audit fix --force` hạ Nest CLI xuống major cũ không phải phương án vá được áp dụng cho LAMS.

Bundle JS đầu vào web giảm từ 552,29 kB xuống 499,36 kB (gzip 168,52 → 154,60 kB) khi tách lazy các màn hồ sơ, giao diện, thư viện cá nhân, giữ chỗ và dashboard. Đây là số liệu build Vite local, không phải thời gian tải đo trên mạng người dùng. Ảnh và font đóng gói vẫn cần được tính vào ngân sách tải toàn trang; chưa có kiểm tải đồng thời hoặc P95 production.

## Hiệu năng báo cáo giữ chỗ

`hold_changes.occurred_at` hiện chưa có index riêng. Database demo ngày 30/10/2026 có 0 sự kiện, nên EXPLAIN trên database này không đủ để quyết định index. Một phép đo riêng bằng bảng TEMP có 20.000 Hold và 100.000 sự kiện trải trên 1.400 ngày, lọc bảy ngày, cho 497 dòng đầu vào: không index 16,571 ms, index ngày 3,602 ms; kế hoạch chuyển từ sequential scan sang bitmap index scan. Bảng TEMP tự mất khi kết nối đóng, không sửa dữ liệu ứng dụng.

Đây là phép đo tổng hợp một lượt trên máy phát triển, có ảnh hưởng cache và cấu trúc bảng rút gọn; chưa phải benchmark production hay P95. Index ngày có triển vọng khi lịch sử lớn và kỳ lọc ngắn, nhưng cần đo thêm tỷ lệ ghi, kỳ sáu tháng và các bộ lọc Book/Branch trước khi thêm migration. Hiện giữ timeout truy vấn 15 giây, kỳ tối đa sáu tháng và giới hạn 10.000 nhóm; không lấy số đo trên bảng trống làm lý do tuyên bố đã tối ưu.

Chiều Book/Branch trong báo cáo JOIN từ Hold hiện hành. Luồng nghiệp vụ tạo Hold cố định hai chiều này và không có API đổi Book/Branch của Hold; FK chỉ bảo đảm bản ghi tham chiếu tồn tại, không ngăn người có quyền SQL sửa trực tiếp. Trước mọi sửa dữ liệu ngoài nghiệp vụ cần đánh giá lại lịch sử báo cáo, lưu biên bản và bản sao khôi phục. Muốn lưu chiều tại thời điểm sự kiện cần thiết kế bổ sung dữ liệu lịch sử, không tự suy diễn giá trị quá khứ từ bản ghi hiện tại.
