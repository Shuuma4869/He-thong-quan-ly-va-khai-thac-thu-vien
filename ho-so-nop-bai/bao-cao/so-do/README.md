# Nguồn sơ đồ của báo cáo

Chín file `.puml` là nguồn của các hình Use Case, Class và ERD trong `../hinh/`. Sơ đồ được đối chiếu với Java record, Flyway migration và Prisma schema tại mốc ghi trong báo cáo; ảnh PNG là bản đã dựng để DOCX/PDF hiển thị ổn định.

Máy có Java 21 và PlantUML MIT-light JAR có thể dựng lại bằng PowerShell 7:

```powershell
pwsh -File scripts/render-report-uml.ps1 -PlantUmlJar D:\duong-dan\plantuml-mit-light.jar
```

Chạy lệnh từ thư mục gốc repository. Script dùng thư mục tạm tên ASCII trên ổ D vì PlantUML/Graphviz trên Windows gặp lỗi khi ghi trực tiếp vào đường dẫn có dấu; thư mục tạm được dọn sau khi chạy. JAR chỉ là công cụ build, không nằm trong bộ hồ sơ nộp bài.
