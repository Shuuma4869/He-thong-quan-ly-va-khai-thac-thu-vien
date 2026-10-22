# Dữ liệu, quyền sử dụng và trách nhiệm

## Căn cứ và giới hạn

Đối chiếu ngày 23/10/2026: [Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=), ban hành 26/06/2025, hiệu lực 01/01/2026. Nguồn chính thức xác nhận văn bản và ngày hiệu lực; tài liệu này không phải kết luận LAMS tuân thủ đầy đủ pháp luật. Phải rà thêm nghĩa vụ cụ thể, văn bản hướng dẫn và quy trình vận hành trước khi dùng dữ liệu thật.

Phần quyền tác giả cần đối chiếu văn bản sở hữu trí tuệ hiện hành và điều khoản từng provider/asset. Chưa có căn cứ cấp lại license cho ảnh hoặc snapshot metadata chỉ vì API truy cập công khai. Lịch sử ISBN vì vậy chỉ lưu thông tin sự kiện tối thiểu, không lưu nội dung bên thứ ba. Google Books vẫn tắt mặc định.

## Áp dụng trong LAMS

| Vấn đề | Biện pháp hiện có | Phần còn phải xác minh |
|---|---|---|
| Lộ dữ liệu tài khoản | JWT trong memory; refresh HttpOnly; DTO allowlist; owner ở server | Chính sách retention, xuất/xóa dữ liệu và người chịu trách nhiệm vận hành |
| Theo dõi người dùng quá mức | History chỉ UUID/ISBN/nguồn/status/thời gian; không email hoặc token | UUID vẫn liên quan người dùng; cần thông báo mục đích và thời hạn lưu trước pilot |
| Ảnh sai quyền/sai tác giả | Duyệt thủ công, provenance, license/evidence; fallback chưa duyệt | Không coi khai báo license là chứng minh pháp lý tuyệt đối |
| Công bằng tiếp cận | Nhãn, keyboard, focus, reduced motion và responsive | Kiểm trợ năng thực tế; không tự tuyên bố WCAG AA đầy đủ |
| Minh bạch kỹ thuật | Phân biệt planned/implemented/tested | Không dùng screenshot thay chứng minh persistence |

## Trách nhiệm nghề nghiệp và xã hội

Không đưa dữ liệu cá nhân thật vào fixture/video nếu chưa có căn cứ sử dụng. Không công bố secrets hoặc lỗi có thể khai thác trước khi có phương án xử lý. Người thực hiện phải bảo toàn tác giả commit, công bố hạn chế và không dùng số lượng commit để suy đóng góp học thuật.

Dự án có sử dụng AI hỗ trợ phân tích, viết mã và kiểm thử theo yêu cầu của DEV1. Thành viên phải kiểm tra đầu ra, chịu trách nhiệm phần nộp, trình bày mức hỗ trợ theo chính sách môn học; không tự nhận toàn bộ nội dung hỗ trợ là tự viết nếu quy định yêu cầu khai báo. Đây không phải bằng chứng giảng viên đã chấp thuận cách sử dụng.

Các thay đổi ảnh hưởng thủ thư phải có thông báo lỗi rõ, không báo đã lưu khi write thất bại. Dữ liệu gợi ý không tự trở thành Catalog có thẩm quyền. Quyền người đọc, quyền thủ thư và trách nhiệm đơn vị vận hành phải được giải thích trong hướng dẫn sử dụng.

## Quyền mã nguồn và minh chứng lớp

Root LICENSE chỉ là thông báo bảo lưu quyền trung lập, chưa cấp MIT/Apache/GPL. Chủ thể quyền và quyền phân phối chờ Tuan/Toan xác nhận. Dependency có license riêng; phải kiểm notice khi đóng gói. Ảnh nền và tài sản có sẵn cần giữ nguồn/giấy phép tương ứng, không tự ghi quyền sở hữu.

Chuyên cần, bốn buổi thảo luận, tên pháp lý, mã sinh viên và mẫu báo cáo là thông tin cần con người cung cấp. Không suy hoặc tạo chúng từ Git. Thuật ngữ rubric “XORs” giữ trạng thái chờ giảng viên giải thích.
