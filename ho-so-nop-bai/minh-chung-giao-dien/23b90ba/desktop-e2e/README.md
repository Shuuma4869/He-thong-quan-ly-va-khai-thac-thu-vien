# Ảnh từ lượt E2E trong EXE

Ngày 29/10/2026, `scripts/test-phase1-e2e.ps1 -Desktop` chạy trên Windows với Core/Insight cùng checkout, PostgreSQL test trong container riêng và bản `lams-desktop.exe` build local từ UI commit `23b90ba`. Playwright kết nối CDP vào WebView2, xác nhận Tauri bridge; process native 22192, window handle 2689410. Lượt chạy đạt 18/18 bài. EXE có SHA-256 `A593B0D91643BD4D27F22D7D6B339FA51B190E9065D0FB30CF268E93FBA1EAFE`.

Ảnh là nội dung WebView2 tại trạng thái test, không có khung cửa sổ Windows. `staff-circulation-1440.png` được chụp sau khi cuộn về đầu nên topbar nằm đúng vị trí; `circulation-report-1440.png` và bản 390 px có 1 lượt mượn, 1 lượt đã trả, bảng và nút tải CSV. Ảnh kiểm kê có một sai kệ đã được xử lý, có scan và snapshot. Hai ảnh Acquisition cho thấy điểm 58,8 và quyết định duyệt nội bộ cùng bằng chứng nguồn. Tất cả dữ liệu trên ảnh là fixture sinh trong database test rồi bị dọn sau lượt chạy.

Script chụp có sửa vị trí cuộn và thứ tự chụp báo cáo trong working tree của lượt kiểm; mã giao diện trong EXE không đổi sau commit UI nêu trên. Đây không phải bằng chứng cài/gỡ bộ cài NSIS, kiểm trên máy thứ hai hoặc chạy tại commit tài liệu cuối. Kết quả CI phải đối chiếu theo SHA riêng.
