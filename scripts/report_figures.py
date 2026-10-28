"""Draw the report's explanatory diagrams from verified LAMS components.

These are simplified teaching diagrams, not generated database schemas. Keep
labels aligned with the migrations and service methods cited in the report.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "ho-so-nop-bai/bao-cao/hinh"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1920, 1080
INK, BLUE, PALE, LINE = "#17243a", "#22538a", "#eaf1f8", "#9ab1c8"
FONT = r"C:\Windows\Fonts\arial.ttf"
BOLD = r"C:\Windows\Fonts\arialbd.ttf"


def canvas(title, subtitle=""):
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.text((70, 35), title, font=ImageFont.truetype(BOLD, 47), fill=INK)
    if subtitle:
        d.text((72, 101), subtitle, font=ImageFont.truetype(FONT, 28), fill=BLUE)
    d.line((70, 150, 1850, 150), fill=LINE, width=3)
    return im, d


def box(d, xy, title, lines=(), fill=PALE, size=30):
    x1, y1, x2, y2 = xy
    d.rounded_rectangle(xy, radius=18, fill=fill, outline=BLUE, width=3)
    d.text((x1 + 22, y1 + 16), title, font=ImageFont.truetype(BOLD, size), fill=INK)
    y = y1 + 68
    font = ImageFont.truetype(FONT, 25)
    for line in lines:
        d.text((x1 + 22, y), line, font=font, fill=INK)
        y += 39


def arrow(d, start, end, label=""):
    d.line((start, end), fill=BLUE, width=5)
    x1, y1 = start; x2, y2 = end
    if abs(x2-x1) > abs(y2-y1):
        p = [(x2,y2), (x2-20,y2-12), (x2-20,y2+12)] if x2>x1 else [(x2,y2),(x2+20,y2-12),(x2+20,y2+12)]
    else:
        p = [(x2,y2),(x2-12,y2-20),(x2+12,y2-20)] if y2>y1 else [(x2,y2),(x2-12,y2+20),(x2+12,y2+20)]
    d.polygon(p, fill=BLUE)
    if label:
        d.text(((x1+x2)//2+12,(y1+y2)//2-42), label, font=ImageFont.truetype(FONT,23), fill=BLUE)


def save(im, name):
    im.save(OUT/name, optimize=True)


im,d=canvas("Bối cảnh vận hành", "Tác nhân, biên ứng dụng và nguồn dữ liệu ngoài")
box(d,(70,310,410,550),"Người dùng",["Reader", "Librarian / Admin"])
box(d,(640,270,1070,590),"LAMS",["React + Tauri", "Core Service", "Insight Service"])
box(d,(1320,220,1840,460),"Nguồn ngoài",["Metadata / email", "Ảnh cần duyệt thủ công"])
box(d,(1320,630,1840,860),"Cơ sở dữ liệu",["PostgreSQL Core", "PostgreSQL Insight"])
arrow(d,(410,430),(640,430),"thao tác")
arrow(d,(1070,340),(1320,340),"tra cứu")
arrow(d,(1070,530),(1320,720),"ghi/đọc")
save(im,"system-context.png")

im,d=canvas("Tác nhân và use case", "Chỉ nêu nhóm tác vụ hiện có trong route/API")
for i,(who,items) in enumerate([
    ("Khách",["Tra Catalog", "Xem sách, tác giả, thể loại"]),
    ("Reader",["Favorite / Review", "Mượn, giữ chỗ, Inbox"]),
    ("Librarian",["Biên mục, quầy", "Kiểm kê, báo cáo"]),
    ("Admin",["Quản lý tài khoản", "Xử lý báo cáo đánh giá"])]):
    y=190+i*210; box(d,(90,y,450,y+160),who); box(d,(680,y,1750,y+160),"Tác vụ",items)
    arrow(d,(450,y+80),(680,y+80))
save(im,"use-cases.png")

im,d=canvas("Cấu trúc lớp rút gọn", "Record miền và lớp điều phối; Core dùng JDBC, không dùng JPA entity")
for xy,name,attrs in [
    ((80,205,520,400),"Book",["id, title", "authors, categories"]),
    ((735,205,1175,400),"Edition",["id, bookId", "isbn13"]),
    ((1390,205,1830,400),"BookCopy",["id, editionId", "barcode, status, version"]),
    ((80,585,610,880),"BookRepository",["JdbcTemplate", "list/search(...)"]),
    ((695,585,1225,880),"HoldAllocationService",["allocateBook(...) ", "transaction + queue"]),
    ((1310,585,1840,880),"InventorySessionService",["start/scan/close", "snapshot + resolution"])]: box(d,xy,name,attrs)
arrow(d,(520,300),(735,300),"1 → n"); arrow(d,(1175,300),(1390,300),"1 → n")
arrow(d,(940,400),(940,585),"dùng Book / Copy")
save(im,"class-diagram.png")

im,d=canvas("ERD Core rút gọn", "Các đường chỉ quan hệ chính; xem migration V1–V31 cho khóa và constraint")
for xy,title,attrs in [
    ((80,200,490,405),"books",["id (PK)","title"]),
    ((750,200,1160,405),"editions",["id (PK)","book_id (FK)"]),
    ((1420,200,1830,405),"book_copies",["id (PK)","edition_id (FK)","version"]),
    ((80,650,490,855),"users",["id (PK)","role"]),
    ((750,650,1160,855),"holds / loans",["user_id (FK)","copy / edition"]),
    ((1420,650,1830,855),"inventory",["session, snapshot", "scan, anomaly"])]: box(d,xy,title,attrs)
for a,b in [((490,300),(750,300)),((1160,300),(1420,300)),((490,750),(750,750)),((1160,750),(1420,750)),((1620,405),(1620,650))]: arrow(d,a,b)
save(im,"erd-core.png")

im,d=canvas("Insight: dữ liệu và tham chiếu", "UUID từ Core là tham chiếu logic, không phải FK xuyên database")
for xy,name,attrs in [
    ((80,230,570,500),"metadata_lookups",["ownerId: UUID Core", "isbn, provider, kết quả"]),
    ((720,230,1210,500),"acquisition_*",["bookId / branchId: Core", "score, decision"]),
    ((1360,230,1850,500),"notices / inbox",["recipientId: UUID Core", "delivery status"]),
    ((470,680,1450,890),"Core API",["Xác nhận actor, quyền và Book/Branch trước thao tác nhạy cảm"])
]: box(d,xy,name,attrs)
for x in (330,965,1600): arrow(d,(x,500),(965,680),"logic")
save(im,"erd-insight.png")

im,d=canvas("Thành phần ứng dụng", "Ranh giới API và quyền sở hữu database")
box(d,(70,300,430,600),"Giao diện",["React / TypeScript", "Tauri / WebView2"])
box(d,(630,200,1100,430),"Core (Spring Boot)",["Auth, Catalog, Loan", "Hold, Inventory"])
box(d,(630,640,1100,870),"Insight (NestJS)",["Metadata, Inbox", "Acquisition"])
box(d,(1370,200,1840,430),"PostgreSQL Core")
box(d,(1370,640,1840,870),"PostgreSQL Insight")
arrow(d,(430,360),(630,320),"HTTP")
arrow(d,(430,520),(630,750),"HTTP")
arrow(d,(1100,315),(1370,315),"JDBC")
arrow(d,(1100,750),(1370,750),"Prisma")
save(im,"components.png")

im,d=canvas("Sequence giữ chỗ", "Chuyển READY trong giao dịch; ETA chỉ là dự đoán")
actors=[("Reader",85),("Core API",530),("Hold service",975),("PostgreSQL",1420)]
for label,x in actors:
    box(d,(x,190,x+370,300),label)
    d.line((x+185,300,x+185,930),fill=LINE,width=3)
for y,a,b,label in [
    (370,270,715,"POST hold"),(475,715,1160,"validate + lock Book"),
    (580,1160,1605,"insert Hold + outbox"),(685,1605,1160,"commit"),
    (790,1160,715,"READY khi có Copy"),(895,715,270,"trạng thái / deadline")]:
    arrow(d,(a,y),(b,y),label)
save(im,"hold-sequence.png")

im,d=canvas("Triển khai local Windows", "Desktop là cửa sổ riêng nhưng vẫn cần API chạy")
box(d,(80,290,500,700),"Máy Windows",["Tauri / WebView2", "Core :8080", "Insight :3000", "Web dev :5173"])
box(d,(765,290,1200,700),"Docker Desktop",["PostgreSQL Core", "PostgreSQL Insight", "Redis / Kafka", "MinIO: profile tùy chọn"])
box(d,(1460,320,1840,680),"Nguồn ngoài",["Metadata provider", "Email provider"])
arrow(d,(500,485),(765,485),"loopback")
arrow(d,(1200,485),(1460,485),"HTTPS khi dùng")
save(im,"deployment.png")

im,d=canvas("Wireframe: bố cục chính", "Thiết kế vị trí thành phần, không phải ảnh chạy thật")
for y,title in [(190,"Header: logo  |  tìm kiếm  |  tài khoản"),(315,"Hero / tiêu đề trang  |  hành động chính")]:
    box(d,(80,y,1840,y+92),title,size=28)
box(d,(80,450,425,950),"Sidebar",["Điều hướng", "Lọc / nhóm tác vụ"])
box(d,(485,450,1840,950),"Vùng nội dung",["Thẻ sách / bảng / biểu mẫu", "Trạng thái tải, trống và lỗi", "Phân trang + hành động"])
save(im,"wireframe.png")

im,d=canvas("Một request và hai cách truy vấn", "ORM ở Insight; Core dùng SQL tham số qua JDBC")
box(d,(80,330,460,660),"Frontend",["Gửi request", "Nhận trạng thái / lỗi"])
box(d,(675,205,1210,435),"Core",["Controller → Service", "JdbcTemplate + SQL tham số"])
box(d,(675,650,1210,880),"Insight",["Guard → Service", "Prisma Client + ownerId"])
box(d,(1440,205,1840,435),"DB Core")
box(d,(1440,650,1840,880),"DB Insight")
arrow(d,(460,395),(675,320),"HTTP")
arrow(d,(460,595),(675,765),"HTTP")
arrow(d,(1210,320),(1440,320),"JDBC")
arrow(d,(1210,765),(1440,765),"Prisma")
save(im,"database-flow.png")

im,d=canvas("Thuật toán kiểm kê", "Snapshot bất biến, idempotency và xác nhận của nhân viên")
steps=["Mở phiên + chụp snapshot Copy", "Nhận barcode + clientScanId",
       "Retry cùng ID → biên nhận cũ", "Chốt và đối chiếu sáu loại bất thường",
       "Nhân viên xác nhận + kiểm version", "Ghi kết quả hoặc trả 409"]
for i,s in enumerate(steps):
    y=180+i*145
    box(d,(230,y,1690,y+105),f"{i+1}. {s}",size=29)
    if i<5: arrow(d,(960,y+105),(960,y+145))
save(im,"inventory-flow.png")

# Print-friendly excerpts. The unmodified E2E screenshots remain in
# minh-chung-giao-dien/pr31 with commit/run provenance.
evidence = OUT.parents[1] / "minh-chung-giao-dien/pr31"
for source, target, bottom in [
    ("landing-1440.png", "landing-excerpt.png", 1120),
    ("catalog-1440.png", "catalog-excerpt.png", 1200),
]:
    with Image.open(evidence / source) as shot:
        shot.crop((0, 0, shot.width, min(bottom, shot.height))).save(OUT / target, optimize=True)
print("Generated report diagrams and screenshot excerpts")
