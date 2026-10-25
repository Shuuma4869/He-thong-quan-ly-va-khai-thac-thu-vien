# Điểm nhu cầu bổ sung sách

Insight có bộ tính điểm `acquisition-v1` nhận số liệu tổng hợp theo Book, chi nhánh và khoảng thời gian. Đây là hàm tính thuần: cùng đầu vào cho cùng kết quả. [Hợp đồng nguồn](../../05-api-va-event/acquisition-read-contract.md) nêu tín hiệu nào Core hiện có và cách giữ `null` khi chưa đủ lịch sử. Insight đã có bảng lưu đề xuất và lịch sử quyết định, nhưng chưa đọc Core hoặc mở API tạo đề xuất. Khi read projection Phase 7 của Toàn được review, luồng tạo đề xuất mới được nối vào số liệu thật.

| Thành phần | Chuẩn hóa | Trọng số |
|---|---|---:|
| Hold đang WAITING tại `asOf` | `min(1, waitingHolds / max(1, copiesOwned))` | 50% |
| Loan bắt đầu trong cửa sổ | `min(1, loansStarted / (max(1, copiesOwned) × max(1, số ngày / 30) × 4))` | 35% |
| Favorite mới trong cửa sổ | `min(1, favoritesAdded / (max(1, copiesOwned) × 4))` | 15% |

Điểm là tổng đóng góp 0–100, làm tròn một chữ số thập phân. Mức LOW dưới 25, MEDIUM từ 25 đến dưới 60, HIGH từ 60. Confidence là tổng trọng số của các tín hiệu đã có số đếm; tín hiệu chưa có (`null`) góp 0 điểm và giảm confidence, không được thay bằng ước lượng. Tổng Copy và số sẵn có là snapshot tại `asOf`; chúng phải là số nguyên không âm, số sẵn có không vượt tổng. Cửa sổ UTC dạng `[from,to)` không quá 366 ngày và `asOf` không trước `to`.

Kết quả giữ từng số đếm, điểm chuẩn hóa, đóng góp, cửa sổ và phiên bản công thức để nhân viên đối chiếu. `manualReviewRequired` luôn là true. Bản ghi đề xuất bắt đầu ở `DRAFT`; quyết định `APPROVED` hoặc `REJECTED` cần lý do và phiên bản dự kiến, được ghi cùng nhật ký trong một transaction. `APPROVED` chỉ xác nhận đề xuất nội bộ, không tạo đơn mua. Ràng buộc database ngăn cùng một snapshot và phiên bản công thức sinh hai đề xuất, ngăn trạng thái đã duyệt mà thiếu người, thời điểm hoặc lý do. Hiện không có dữ liệu zero-result search, lượt xem khi hết sách, đơn đặt mua đang mở hoặc ngân sách; các tín hiệu này được ghi rõ là thiếu. Cần kiểm nguồn, quyền và guardrail đơn hàng/ngân sách trước khi nối API và dashboard.
