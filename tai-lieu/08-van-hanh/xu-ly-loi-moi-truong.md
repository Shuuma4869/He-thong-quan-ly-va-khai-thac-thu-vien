# Xử lý lỗi môi trường

## Node hoặc npm sai version

Chạy `.\scripts\doctor.ps1`. Dự án yêu cầu Node 22.x và npm 10.x; dùng nvm/fnm/Volta hoặc bản Node 22 chính thức rồi mở terminal mới. Không bỏ `engine-strict` để né lỗi.

## Java sai version

Dùng JDK 21 và kiểm tra `java -version`. Maven Enforcer dừng sớm với thông báo rõ nếu không phải Java 21.

Trên Windows, Maven distribution được cache ngoài project. Core được khởi động bằng JAR qua `scripts\start-core.ps1`; cách này tránh giới hạn classpath Java khi đường dẫn project có ký tự Unicode.

## Docker daemon chưa chạy

Khởi động Docker Desktop/Engine, chờ daemon sẵn sàng, rồi chạy lại doctor. Không dùng `docker system prune` như giải pháp mặc định.

## Host port bị chiếm

Doctor cảnh báo port đang dùng. Không cần tắt PostgreSQL/Redis của project khác; đổi port host trong `.env`, đồng thời cập nhật URL host tương ứng. Internal container port không đổi.

## Kafka listener

Client host dùng `localhost:${KAFKA_PORT}`; client trong Compose network dùng `kafka:29092`. Chạy `.\scripts\smoke-test.ps1` để kiểm tra produce/consume qua cả INTERNAL và EXTERNAL listener.

## MinIO permission

Image LAMS kế thừa image MinIO đã pin, chuẩn hóa ownership `/data` lúc build và chạy process bằng user `minio` không đặc quyền. Nếu lỗi, xem `docker compose logs minio`; không thêm `privileged: true` và không chown thư mục host thủ công.

## Migration lỗi

Xem `docker compose logs postgres`, kiểm tra URL/credential trong `.env`, rồi chạy `npm run prisma:validate` và `npm run prisma:deploy`. Flyway history nằm trong `lams_core`; Prisma history nằm trong `lams_insight`. Không reset database chính để sửa migration.

## Xem log và dừng an toàn

```powershell
docker compose logs --tail 200 postgres redis kafka minio
.\scripts\stop-infra.ps1
```

Stop bình thường giữ nguyên volume. Chỉ xóa volume của một verification project có tên đã xác minh, không chạy `docker volume prune`.
