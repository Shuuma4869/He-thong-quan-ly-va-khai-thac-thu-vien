# Tra cứu sách

Danh mục công khai tra sách ngay trên dữ liệu Core. Người đọc có thể nhập tên, một phần mô tả, tên tác giả hoặc ISBN 13; bộ lọc tác giả và thể loại vẫn áp dụng cùng kết quả. Khi nhập từ khóa, giao diện chọn thứ tự “Phù hợp nhất”. Người đọc vẫn có thể đổi sang tên A–Z hoặc mới cập nhật.

V22 cài `unaccent` và `pg_trgm` trong schema `public` của PostgreSQL, kể cả khi bảng Catalog nằm ở schema kiểm thử riêng. Trigger cập nhật tên/mô tả đã bỏ dấu và `tsvector` mỗi khi Book được ghi; migration điền dữ liệu cho Book có sẵn. Chỉ mục GIN hỗ trợ full text và tên gần đúng. ISBN và tác giả được đọc từ quan hệ Catalog hiện tại, không sao chép sang bảng tìm kiếm riêng. Không thay đổi khóa duy nhất của Category hay dữ liệu alias.

Thứ tự phù hợp ưu tiên ISBN đúng, tên đúng, tiền tố tên, full text, tác giả, phần tên và cuối cùng là tên gần đúng. Tên gần đúng chỉ tham gia với từ khóa từ ba ký tự. Các giá trị tìm kiếm đều là tham số SQL; tên cột và kiểu sắp xếp không nhận trực tiếp từ người dùng. Cùng một bộ ứng viên được dùng cho cả ba cách sắp xếp. Ở chế độ phù hợp, điểm rồi ID quyết định thứ tự. Một request đọc count và trang trong transaction `REPEATABLE READ`; hai request phân trang riêng biệt không phải cùng một snapshot nếu Catalog thay đổi giữa chừng.

Đây là tra cứu từ vựng trên Core, chưa có vector, mô hình ngữ nghĩa, search event, cache liên dịch vụ hoặc đề xuất sửa chính tả. Truy vấn không có kết quả chỉ hiện trạng thái trống; hiện chưa ghi tín hiệu `SEARCH_ZERO_RESULT`. Khi tích hợp taxonomy/alias của Toàn, cần quyết định rõ quy tắc ánh xạ trước khi đưa alias vào tìm kiếm. Đo tải trên dữ liệu thực và quyền cài extension phải được kiểm tra ở môi trường triển khai trước khi bật cho production.
