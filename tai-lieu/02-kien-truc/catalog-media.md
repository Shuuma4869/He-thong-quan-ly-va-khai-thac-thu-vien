# Kiến trúc Catalog, Inventory và media

## Ranh giới dữ liệu

Core sở hữu Book (tác phẩm), Edition (ấn bản), BookCopy (bản vật lý), các danh mục và tham chiếu ảnh đã duyệt trong PostgreSQL. UUID/FK là quan hệ thật; ISBN thuộc Edition, barcode thuộc Copy. Không có `books.available/total`; Phase 2 không thực hiện mượn/trả/giữ chỗ hay thay trạng thái lưu thông từ UI quản trị.

React dùng API client chung, Zod kiểm response, TanStack Query quản lý trạng thái mạng. `/sach` có query/author/category/page/size trong URL; lọc/phân trang chạy ở Core, không tải toàn bộ danh mục để lọc trên client. `ReferencePicker` phân trang danh mục tham chiếu, không cắt ngầm ở 100 bản ghi. Route staff có guard; server vẫn là nơi quyết định quyền.

## Hai luồng độc lập

```text
Reader/Staff → React hoặc Tauri → Core → PostgreSQL
                                    └─ CRUD, FK, khóa/version, ảnh đã duyệt

Staff → Insight → Open Library / Google Books / Wikimedia
           └─ kiểm quyền qua Core; trả ứng viên và nguồn, không ghi Catalog
Staff đối chiếu và xác nhận → Core kiểm ảnh → ghi tham chiếu có version
```

Không giữ transaction Catalog trong lúc tra nhà cung cấp. Nếu provider lỗi, UI vẫn quản lý dữ liệu Core và dùng fallback ảnh. Ảnh chỉ đi vào luồng đọc sau khi staff duyệt; metadata tra cứu không tự thay thông tin tác phẩm. [Media strategy](../03-du-lieu/media-strategy.md) nêu định danh, giấy phép, giới hạn và dữ liệu gửi ra ngoài.

## Quyền, khóa và migration

- JWT được kiểm ở controller; service đọc status/role hiện tại từ Identity. Thu hồi toàn bộ quyền hoặc vô hiệu hóa tài khoản có hiệu lực cả với JWT còn hạn. Reader chỉ đọc Catalog; Inventory và mutation yêu cầu nhân viên.
- Book create/update và các bảng nối nằm trong cùng transaction. Query dùng bind parameters, escape wildcard; count/items có cùng snapshot REPEATABLE_READ.
- Shelf branch transfer và Copy create/move khóa cùng hàng Shelf trước khi kiểm tra/ghi. Copy cập nhật bằng version có điều kiện, không ghi đè thay đổi đồng thời. Không thêm khóa vào GET chỉ để kiểm tồn tại.
- V11 chuẩn hóa NFKC rồi gộp whitespace Unicode cho dữ liệu Category/Book cũ, giữ nguyên FK. Collision dừng migration thay vì tự gộp/xóa. V12 thêm tham chiếu ảnh một-một với Edition/Author, người duyệt tham chiếu Identity.
- V13 cấp revision media từ sequence chung cho tạo/cập nhật. Việc gỡ rồi tạo ảnh không làm version quay về 0, tránh biểu mẫu cũ ghi đè/xóa nhầm tham chiếu mới. Migration giữ nguyên revision hiện có và cấp giá trị mới lớn hơn; client không tự tính revision.

Tauri đóng gói cùng UI, không truy cập PostgreSQL trực tiếp. WebView chỉ điều hướng trong ứng dụng. Lệnh native `open_catalog_source` chỉ mở URL HTTPS thuộc allowlist nhà cung cấp, không cho shell/file/URL tùy ý; CSP giới hạn các host ảnh. Secret nhà cung cấp ở Insight, không ở bundle desktop.

## Giới hạn đã biết

Chưa có media upload/history, cập nhật ảnh tự động, semantic search, nghiệp vụ Phase 3, cloud Insight, signing/updater hay nghiệm thu máy Windows thứ hai. Bản cài local chỉ đóng gói giao diện, Core/Insight/PostgreSQL vẫn chạy riêng. Những việc này không được coi là đã triển khai chỉ vì có vị trí trong sơ đồ mục tiêu.
