# Chiến lược media

Cover sách ưu tiên Open Library, Google Books là fallback. Ảnh tác giả ưu tiên Open Library, Wikimedia Commons là fallback. Provider chỉ cung cấp metadata; asset phải lưu provenance gồm `source`, `source_id`, `source_url`, `image_url`, `thumbnail_url`, `license`, `attribution`, `verified`, `fetched_at`.

Không dùng ảnh stock thay cover thật, không gắn ảnh người nếu chưa xác minh và không proxy nội dung trái điều khoản provider. Khi chưa có cover dùng placeholder typography; khi chưa có ảnh tác giả dùng initials. Fetcher tương lai phải có rate limit, cache, timeout, kích thước/MIME allowlist và review quyền sử dụng. MinIO dành cho asset do hệ thống sở hữu hoặc được phép lưu; URL provider không mặc nhiên được sao chép.
