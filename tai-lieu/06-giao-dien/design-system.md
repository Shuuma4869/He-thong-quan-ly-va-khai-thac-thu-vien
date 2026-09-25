# Design System Foundation

## Visual language

Modern Editorial + SaaS Dashboard: khoảng thở rõ, surface trắng, border nhẹ; Newsreader chỉ cho tiêu đề mang tính đọc, Inter cho form/dashboard.

| Token | Giá trị |
|---|---|
| canvas / surface / muted | `#F6F8F7` / `#FFFFFF` / `#F0F4F2` |
| text / muted / border | `#17211F` / `#66736F` / `#E1E8E5` |
| primary / hover / soft | `#0F766E` / `#115E59` / `#CCFBF1` |
| link / success / warning / danger | `#2563EB` / `#15803D` / `#B45309` / `#B91C1C` |

Type: body 15–16px, label 14px, helper 13px, section 20–22px, page 28–32px. Spacing dựa trên 4px; radius chủ đạo 10–14px; shadow chỉ phân lớp nhẹ.

## Motion và responsive

Hover khoảng 180ms, page enter 220ms, modal/drawer dùng spring nhẹ, toast slide + fade. `prefers-reduced-motion` tắt chuyển động không thiết yếu. Mobile bắt đầu từ 320px; login một cột dưới 900px; bảng phải có phương án scroll/card.

## Accessibility

Focus nhìn rõ; label thật cho input; lỗi liên kết bằng ARIA; contrast AA; target tối thiểu khoảng 44px; không truyền nghĩa chỉ bằng màu; dialog quản lý focus và Escape.

## Quy tắc copy tiếng Việt

Mặc định `vi-VN`; câu ngắn, trực tiếp, không sáo rỗng. Button dùng động từ (“Lưu thay đổi”), empty state nói đúng nguyên nhân và hành động tiếp theo. Identifier kỹ thuật dùng tiếng Anh; comment business có ích dùng tiếng Việt.
