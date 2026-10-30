# Minh chứng giao diện và kiểm thử 011eb53

Bộ ảnh ngày 30/10/2026 thuộc commit `011eb53915a9a5d1fac58b8de2de0282562d3cbb`. Có 44 ảnh web của 22 route theo vai trò, ở 1440 và 390 px, dùng database demo thật; không thấy lỗi JavaScript, alert lỗi hoặc tràn ngang ở trạng thái đã chụp. Core, Insight và PostgreSQL chạy local, không mock API. Demo có 10.013 Book và 64 Copy; không diễn giải số Book thành tồn kho vật lý.

Sáu ảnh trong `desktop-e2e/` lấy từ EXE/WebView2 với database kiểm thử riêng. Cả web và EXE đạt 25/25 hành trình. Ảnh Hold Activity có hai sự kiện tạo qua Core API; ảnh dashboard demo ghi đúng trạng thái không có sự kiện của database demo. Không trộn hai nguồn dữ liệu này thành một số liệu vận hành.

`accessibility.json` ghi 17 màn không có vi phạm tự động trong các quy tắc axe đã chọn. Các mục incomplete, screen reader và zoom trình duyệt thủ công chưa được nghiệm thu đầy đủ. Bộ ảnh không chứng minh mọi trạng thái CRUD, và build/test EXE không thay thử cài/gỡ installer hoặc chạy trên máy thứ hai.

Vòng Tab của hộp thoại được cải thiện tiếp ở `e5c238d`; không gán kết quả E2E ở đây cho commit đó. `manifest.json` ghi SHA-256 từng ảnh và phạm vi đo.

Để so sánh trước/sau, dùng [bộ ảnh 23b90ba](../23b90ba/manifest.json) và [bộ ảnh d0ba015](../d0ba015/README.md) theo đúng SHA, viewport và nguồn dữ liệu được ghi ở từng bộ. Dữ liệu demo thay đổi theo thời điểm, vì vậy đây là đối chiếu bố cục, không phải so sánh số liệu nghiệp vụ trước/sau.
