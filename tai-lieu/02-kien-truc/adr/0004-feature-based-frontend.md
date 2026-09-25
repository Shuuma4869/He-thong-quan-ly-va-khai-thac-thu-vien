# ADR 0004: Frontend theo feature

**Trạng thái:** Chấp nhận

## Context
Tổ chức thuần `components/services/pages` khiến code một nghiệp vụ bị phân tán.

## Decision
Code theo `app`, `features`, `shared`; feature giữ UI/query/schema gần nhau và chỉ đẩy primitive tái sử dụng thật vào shared.

## Reason
Hai developer có thể sở hữu feature với xung đột thấp; boundary phản ánh sản phẩm.

## Consequences
Cần quy tắc dependency: feature không import nội bộ feature khác; composition đặt ở app. Tránh tạo folder rỗng trước nhu cầu.
