# Nợ kỹ thuật và dependency

## Frontend development dependencies

Vitest đã nâng lên 5.0.4, typescript-eslint lên 8.71.2 và source-map-js bắc cầu lên bản vá trong lockfile. Khi nâng tooling phải chạy lại typecheck, test, lint, web/desktop build và E2E; không dùng npm audit fix --force hoặc bỏ test để làm sạch cảnh báo.

Kết quả audit phụ thuộc advisory tại thời điểm chạy, không chứng minh toàn bộ dependency an toàn. Kiểm cả cây đầy đủ và omit=dev trước release. Một số dependency có cảnh báo deprecated dù không có advisory; cần bảo trì riêng theo tương thích, không nâng major dây chuyền khi chưa kiểm thử.

## Lần kiểm tra ngày 25/10/2026

`npm audit` trên lockfile frontend và Insight trả 0 advisory sau khi nâng Zod lên 4.6.7 và ghim `multer` 2.5.0, `body-parser` 2.4.0, `fast-uri` 3.1.9 trong Insight. Nest vẫn ở 11.2.6; các bản chuyển tiếp này được ép để tránh advisory trong cây dependency. Cần giữ kiểm thử cài sạch, API, E2E và build Windows ở đúng SHA trước khi phát hành. Kết quả npm chỉ phản ánh advisory registry tại ngày kiểm tra, không thay review mã nguồn, image Docker hoặc cấu hình triển khai.

## Test coverage

Auth/Member, Catalog, lưu thông, giữ chỗ và kiểm kê đã có integration PostgreSQL cùng các bài E2E riêng. Phase 7 có hàm tính điểm và bảng lưu/duyệt đề xuất đã kiểm migration, tranh chấp và audit trên PostgreSQL test; chưa có luồng đề xuất chạy với dữ liệu báo cáo thật vì read projection Core chưa bàn giao. Chưa có API/UI nhân viên cho workflow này. Coverage của một module không chứng minh module khác đã đạt, và build installer không thay E2E WebView2 trên bản EXE tương ứng.

Category Alias V23 có service/repository và Search đọc được bí danh, nhưng hiện chưa có endpoint quản trị để thủ thư tạo/sửa/xóa Alias. Cần Toàn chốt luồng nhập và quyền quản trị trong module Taxonomy trước khi coi Alias sẵn sàng vận hành; không ghi thẳng database production bằng tay để bù thiếu API.
