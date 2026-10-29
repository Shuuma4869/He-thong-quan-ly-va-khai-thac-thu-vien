# Nguồn ảnh và quy trình duyệt

## Phân định trách nhiệm

Insight tìm ứng viên; Core lưu tham chiếu đã được nhân viên duyệt; React/Tauri chỉ hiển thị ảnh đã duyệt. Không có upload, không tải ảnh về MinIO, không ghi trực tiếp database Core từ Insight. Một ảnh bìa thuộc **Edition**, không tự gắn cho mọi ấn bản của Book. Ảnh người thuộc **Author UUID**, không ghép theo tên giống nhau.

Tra sách dùng ISBN-13 có checksum hợp lệ: Open Library trước, Google Books chỉ khi thiếu metadata hoặc bìa. Giữ riêng kết quả từng nguồn cùng `sourceId/sourceUrl/fetchedAt`, không tự ghi đè title/author/ISBN trong Catalog. Nếu nguồn không xác nhận đúng ISBN thì không nhận ứng viên. Open Library/Google Books có ảnh không đồng nghĩa có quyền tái sử dụng; candidate để license/attribution null khi nguồn không cung cấp, `verified:false`.

Tra tác giả dùng Open Library Author ID → Wikidata ID → kiểm P648 trỏ ngược đúng Author ID → P18 → Wikimedia Commons. Thiếu hoặc mơ hồ định danh, thiếu giấy phép/ghi công, MIME/size sai thì loại bỏ. Không tìm ảnh bằng tên gần giống. Các giấy phép Commons được chấp nhận là CC0, Public Domain, CC BY và CC BY-SA có phiên bản; nhân viên vẫn kiểm lại từng trang nguồn.

## Duyệt và hiển thị

Trong quản trị Catalog, chọn Author hoặc Edition rồi mở **Ảnh và nguồn**. Tra metadata hoặc nhập tham chiếu thủ công. Đối chiếu định danh, đọc giấy phép, ghi attribution và bằng chứng; xác nhận trước khi lưu. Core xác minh URL, loại file và kích thước, rồi lưu `catalog_media_references` (V12): URL nguồn/ảnh/giấy phép, source ID, license, attribution, evidence, MIME/bytes, người/thời điểm duyệt và version. Chỉ giữ lần duyệt hiện tại; chưa có audit history ảnh.

Bộ demo có thêm [ứng viên bìa Standard Ebooks](../09-demo/anh-bia-ung-vien.csv) cho 32 tác phẩm. V24 mở nguồn `standard-ebooks` trong bảng media; Core chỉ chấp nhận URL ảnh/trang nguồn HTTPS tại `standardebooks.org`. Mười hai bìa được đối chiếu từ trang tác phẩm và colophon, có thể ghi vào database demo bằng [script duyệt có kiểm tra Edition](../09-demo/du-lieu-demo.md#ảnh-bìa); 20 ứng viên còn lại chưa duyệt. Danh sách ứng viên không tự tạo tham chiếu đã duyệt. [Chính sách nguồn của Standard Ebooks](https://standardebooks.org/about/standard-ebooks-and-the-public-domain) nói về phần họ tạo và bìa trong ebook, nhưng không thay việc kiểm quyền đối với tác phẩm/tranh gốc tại nơi triển khai. Nhân viên vẫn đối chiếu từng Edition, quyền sử dụng, ghi công và bằng chứng trước khi xác nhận.

Thay/gỡ ảnh phải có version hiện tại; 409 yêu cầu tải lại, không tự ghi đè. Chưa có ảnh dùng typography cho Edition, initials cho Author. Ảnh tải hỏng quay lại fallback; lỗi metadata/ảnh không làm mất nội dung Catalog. Nguồn/giấy phép/ghi công luôn đi cùng ảnh. Google Books chỉ hiện nội dung sau khi tải được nhãn “Powered by Google”; mất nhãn thì không hiện nội dung nguồn này.

Catalog mới dùng bìa chữ nhiều tông màu với đúng tên sách và tác giả khi không có tham chiếu đã duyệt. Bìa chữ không được ghi là ảnh bìa thật. Ảnh thật được giữ nguyên tỷ lệ trong card và trang chi tiết, có ghi công dưới ảnh; lỗi tải ảnh quay lại bìa chữ. Font được đóng gói trong ứng dụng, nhưng ảnh bên ngoài vẫn do trình duyệt/WebView tải từ nguồn đã duyệt, nên cần kết nối mạng để xem. Không đóng gói trước 32 ảnh ứng viên vào Git hoặc EXE và không tự động duyệt toàn bộ 10.000 tác phẩm tham khảo.

## Bảo vệ mạng và tài nguyên

- Insight chỉ truy cập HTTPS tới các host nhà cung cấp định sẵn; không nhận endpoint tùy ý từ frontend, không theo redirect.
- Mỗi host cách nhau ít nhất 1,1 giây; tối đa 4 request đồng thời, hàng chờ tối đa 3 giây, deadline 5 giây. Không tự retry vô hạn khi timeout/429. JSON tối đa 1 MiB, ảnh tối đa 2 MiB; đọc stream có giới hạn ngay cả khi thiếu Content-Length.
- Cache JSON 10 phút, tối đa 200 mục, gộp request trùng đang chạy. Cache/rate limit hiện theo process, không phải giới hạn phân tán trên nhiều replica.
- Endpoint metadata yêu cầu JWT; Insight gọi Core `auth/me` để kiểm status/role mới nhất, chỉ cho nhân viên. Tra sách/tác giả, lưu history và replay dùng chung 10 request/phút/tài khoản/process; đọc/xóa history có hạn mức riêng 60 request/phút, không làm mất lượt tra nguồn. Token chỉ gửi tới Core cấu hình sẵn, không gửi tới nhà cung cấp.
- Core kiểm lại URL theo source, chỉ JPEG/PNG/WebP với signature phù hợp; không SVG. Tối đa 2 MiB, 6 giây cho cả response, tối đa 4 lượt kiểm/process. Phân quyền được kiểm lại sau truy cập mạng; không giữ DB transaction trong lúc chờ ảnh.
- Ảnh ngoài tải trực tiếp tới trình duyệt/WebView: nhà cung cấp có thể nhận IP người xem. Dùng `referrerPolicy=no-referrer`, không kèm JWT ứng dụng. URL có thể đổi hoặc mất sau lần duyệt; fallback là bắt buộc, không cam kết lưu trữ vĩnh viễn.

## Cấu hình

`CORE_API_URL` ở Insight mặc định `http://localhost:8080/api/v1`; môi trường từ xa dùng Core HTTPS thật. `FRONTEND_ORIGIN` là danh sách origin cụ thể cho CORS. `METADATA_USER_AGENT` có thể đặt tên/địa chỉ liên hệ của đơn vị vận hành.

`GOOGLE_BOOKS_ENABLED=false` mặc định. Chỉ bật `true` cùng `GOOGLE_BOOKS_API_KEY` ở môi trường server khi đã chuẩn bị key/quota và kiểm branding/điều khoản. Không đặt key trong `VITE_*`, Git hoặc URL trả cho client. Chưa cấu hình trả `not-configured`; đây không phải lỗi của Catalog. Kiểm thử adapter dùng fixture có kiểm soát không chứng minh tài khoản Google/quota thật đã hoạt động.

Pilot hiện mới có cấu hình Core, chưa triển khai Insight công khai. Không khai báo URL Insight mẫu là một dịch vụ đang hoạt động. MinIO vẫn không tham gia luồng ảnh Phase 2.

## Tài liệu nguồn

[Open Library APIs](https://openlibrary.org/developers/api), [Books API](https://openlibrary.org/dev/docs/api/books), [Google Books API](https://developers.google.com/books/docs/v1/using), [Google Books branding](https://developers.google.com/books/branding), [Wikimedia Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo), [Standard Ebooks và phạm vi public domain](https://standardebooks.org/about/standard-ebooks-and-the-public-domain). Kiểm lại điều khoản tại thời điểm sử dụng/phân phối; URL công khai không mặc nhiên cấp quyền sao chép ảnh.
