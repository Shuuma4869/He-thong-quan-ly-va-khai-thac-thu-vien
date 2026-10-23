# Minh chứng giao diện

## Phase 3 — EXE tại 56049b9

Ngày 24/10/2026, build local từ `56049b93f1735b9e7a95a55ac9a2489f00c405b7`, chạy `scripts/test-phase1-e2e.ps1 -Desktop`: 9/9 bài đạt trong 27,4 giây. Core và Insight chạy từ cùng checkout với PostgreSQL test riêng; process EXE 20740, window handle 526592, kết nối WebView2 qua CDP test và xác minh Tauri bridge. Không dùng response mock.

- SHA256 `lams-desktop.exe`: `8305D770E66A93216578E8BB915A028E968DCEB73877206BDCA15F3D7461A6CB`.
- SHA256 `LAMS_0.1.0_x64-setup.exe`: `C537EB550E8D504B73BDACB55900F2F98BA43BC434076E79ECE66B8FE4511114`.
- Ảnh nội dung WebView2 [1440 px](phase3-desktop-56049b9-1440.png) và [390 px](phase3-desktop-56049b9-390.png), chụp sau sửa điểm 1→5. Đã đối chiếu bố cục W6, text/nút không tràn ngang. Không phải ảnh toàn màn hình Windows hoặc bằng chứng đã chạy trình cài/gỡ.
- Hành trình Phase 3: save favorite/reload, tạo và sửa review bằng bàn phím, My Library/reload, đổi tài khoản, chặn cross-owner bằng API, xóa review và favorite. Các bài còn lại kiểm Auth/Member/Catalog/Inventory/history.

CI tại `56049b9` chưa đạt toàn bộ ở thời điểm ghi bằng chứng: component test đổi tài khoản còn race điều hướng và đang được sửa. EXE PASS không thay CI. Khi bàn giao commit sau, xem kết quả chính xác trong [PR #13](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/13); không đổi nhãn các ảnh này thành ảnh SHA mới. Chưa nghiệm thu máy Windows thứ hai, cài/gỡ installer hoặc HTTPS pilot.

## Phân biệt các mốc kiểm chứng

Kiểm lại ngày 24/10/2026 trên checkout `66ab31e807a96557867be51b4801be23b3e66109`: `scripts/test-phase1-e2e.ps1 -Desktop` đạt 9/9 bài trong 37,2 giây, `DESKTOP_E2E_PASS`; process 23540, window handle 1902322. Backend và bộ test chạy từ checkout này; EXE dùng lại binary build tại `56049b9` với SHA256 nêu trên vì phần production không đổi, chỉ sửa test và tài liệu. Đây không phải lượt build binary mới; ảnh vẫn giữ nhãn `56049b9`.

| Mốc | Bằng chứng | Phạm vi kết luận |
|---|---|---|
| `ee929cd` | [CI 39907400703](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/39907400703) đạt 5/5; EXE local 8/8 (24.6s) | Mốc nghiệm thu có ảnh EXE bên dưới, không phải kết quả tự áp dụng cho mọi commit sau |
| `dc65064ac3f4dac0c3222241ff0fcb85519e2b7d` | [CI 39909236154](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/39909236154) đạt 5/5; EXE local chạy lại 8/8 (26.3s) | Bản bàn giao trước vòng review hạn mức; vẫn dùng binary local build tại `0075377`, không có bộ ảnh mới trong thư mục này |
| Commit sau vòng review hạn mức | Xem head SHA và CI tương ứng trong [PR #12](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/pull/12) | Chỉ nghiệm thu sau CI đủ năm job và lượt EXE kiểm backend mới. PR ghi riêng SHA nguồn, hash binary và kết quả chạy; không đổi nhãn ảnh cũ |

CI Windows build bộ cài không đồng nghĩa đã chạy E2E trong EXE. Kết quả EXE local cũng không chứng minh đã kiểm cài/gỡ bộ cài hoặc vận hành HTTPS.

## Ảnh web tại `0075377`

Hai ảnh được chụp bằng Playwright trong [CI run 39871120289](https://github.com/Shuuma4869/He-thong-quan-ly-va-khai-thac-thu-vien/actions/runs/39871120289), head commit `0075377995ea9bcd313d15cd0e147b58279d1718`, artifact `web-e2e-results`. Không chỉnh sửa nội dung ảnh. Ngày kiểm tra 23/10/2026 theo giờ Việt Nam; timestamp trên ảnh dùng timezone trình duyệt CI (UTC).

Luồng thật: Core tạo tài khoản fixture → cấp role trong database test → đăng nhập UI → lưu history qua Nest/Prisma/PostgreSQL → reload → replay → kiểm bàn phím → chụp ảnh. Sau đó test chặn cross-owner 404 và xóa. Không intercept response để tạo dữ liệu history. Dữ liệu là fixture, không phải thông tin thành viên thật.

- [History 1440 px](history-1440.png): bố cục desktop web, không phải cửa sổ EXE.
- [History 390 px](history-390.png): bố cục hẹp, control xuống dòng và focus trên bộ lọc.

Provider Open Library trả `ok` trong lượt ảnh này; không suy provider luôn khả dụng từ một lần chạy. Google Books tắt. Screenshot không thay test persistence/owner và không chứng minh Tauri WebView2 đã nghiệm thu. Phần nội dung metadata đang hiển thị được tra trực tiếp, không lưu snapshot vào history.

## EXE/WebView2 trên Windows

Ngày 23/10/2026 lúc 12:53 (Asia/Saigon), chạy `scripts/test-phase1-e2e.ps1 -Desktop` tại head `ee929cdd5f05ed465aec784ba27f06660e5b19a7`: **8 passed (24.6s), DESKTOP_E2E_PASS**. Docker Engine Linux 29.3.1, Node 22.23.3, Java 21.0.12. Core/Insight/PostgreSQL thật dùng container tạm riêng; script dọn container và các tiến trình đã khởi tạo sau test.

EXE local được build tại `0075377`; diff tới `ee929cd` chỉ có tài liệu/ảnh, không đổi mã runtime hoặc test. SHA-256 `lams-desktop.exe`: `E149687E81149F2E64441FBCD3FA47F00F6AFFB37A7B5A5A327F43CA2F8E7115`. Script xác nhận process/window handle của EXE và test kiểm `__TAURI_INTERNALS__` trong trang WebView2; không chỉ mở tab Chrome rồi gọi là desktop.

- [History EXE 1440 px](history-desktop-1440.png).
- [History EXE 390 px](history-desktop-390.png).

Đây là ảnh nội dung WebView2 chụp qua Playwright/CDP, không gồm khung cửa sổ Windows; kích thước 390 là viewport kiểm responsive, không phải ứng dụng mobile. Ảnh nguyên bản, không chỉnh sửa. Fixture và luồng kiểm giống web; không dùng dữ liệu người dùng thật. Lượt này kiểm EXE build local, không phải bài kiểm thao tác cài/gỡ installer hoặc triển khai HTTPS.
