# Technical debt của starter

## Frontend development dependencies

Vitest đã nâng lên 5.0.4, typescript-eslint lên 8.71.2 và source-map-js bắc cầu lên bản vá trong lockfile. Khi nâng tooling phải chạy lại typecheck, test, lint, web/desktop build và E2E; không dùng npm audit fix --force hoặc bỏ test để làm sạch cảnh báo.

Kết quả audit phụ thuộc advisory tại thời điểm chạy, không chứng minh toàn bộ dependency an toàn. Kiểm cả cây đầy đủ và omit=dev trước release. Một số dependency có cảnh báo deprecated dù không có advisory; cần bảo trì riêng theo tương thích, không nâng major dây chuyền khi chưa kiểm thử.

## Insight development dependencies

Jest 30.5.2, ts-loader 9.6.2 và handlebars bắc cầu đã được cập nhật. Nhánh tooling `ts-jest → @jest/transform → babel-plugin-istanbul → @istanbuljs/load-nyc-config → js-yaml 3 → argparse 1 → sprintf-js` vẫn chịu advisory [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) về DoS với precision không giới hạn. Registry chưa có phiên bản sprintf-js được vá tại lần kiểm tra; npm lan truyền cảnh báo tới 20 package moderate trong cây dev. Không hạ Jest về 25 theo gợi ý audit hoặc ép js-yaml major mới khi chưa kiểm tương thích.

Không nhận YAML/format string từ nguồn không tin cậy để chạy tooling kiểm thử. Kiểm tra bản vá upstream trước release; lỗi này không thuộc dependency production theo npm audit omit=dev. Đây là giới hạn còn mở, không được báo toàn bộ dự án đã sạch lỗ hổng.

## Test coverage

Auth và Member đã có integration PostgreSQL, frontend state/permission/race tests và E2E ba role. Các nghiệp vụ ngoài Phase 1 chưa có implementation/test đầy đủ; không lấy coverage Auth/Member làm bằng chứng cho Catalog, Loan hoặc các phase sau.
