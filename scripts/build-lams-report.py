"""Build the editable LAMS report from its Markdown source on Windows.

Requires python-docx and Pillow. Export the resulting DOCX to PDF in Word,
then inspect every PDF page before committing either artifact.
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'ho-so-nop-bai/bao-cao/Bao-cao-tieu-luan-LAMS.md'
OUT = ROOT / 'ho-so-nop-bai/bao-cao/Bao-cao-tieu-luan-LAMS.docx'
ART = ROOT / '.tools/report-art'
ART.mkdir(parents=True, exist_ok=True)
NAVY = RGBColor(27, 54, 94)
GRAY = RGBColor(86, 94, 106)


def diagram(lines: list[str], output: Path, title: str) -> None:
    font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 29)
    strong = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 32)
    im = Image.new('RGB', (1600, 300 + 130 * len(lines)), 'white')
    draw = ImageDraw.Draw(im)
    draw.text((70, 35), title, font=strong, fill='#1b365e')
    y = 110
    for i, line in enumerate(lines):
        x1, x2 = (90, 1510) if i % 2 == 0 else (190, 1410)
        draw.rounded_rectangle((x1, y, x2, y + 83), radius=13, outline='#718096', width=3, fill='#f1f5fa')
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((1600 - (bbox[2] - bbox[0])) / 2, y + 20), line, font=font, fill='#1d2939')
        if i < len(lines) - 1:
            draw.line((800, y + 83, 800, y + 124), fill='#1b365e', width=4)
            draw.polygon([(800, y + 128), (790, y + 114), (810, y + 114)], fill='#1b365e')
        y += 130
    im.crop((0, 0, 1600, y + 10)).save(output)


def uml_box(draw, rect, name, fields, methods):
    x1, y1, x2, y2 = rect
    draw.rectangle(rect, outline='#1b365e', fill='#f5f8fc', width=3)
    draw.line((x1, y1 + 62, x2, y1 + 62), fill='#1b365e', width=3)
    draw.line((x1, y1 + 63 + 45 * len(fields), x2, y1 + 63 + 45 * len(fields)), fill='#1b365e', width=2)
    draw.text((x1 + 20, y1 + 12), name, font=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 36), fill='#1b365e')
    font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 29)
    for i, value in enumerate(fields): draw.text((x1 + 17, y1 + 73 + 45 * i), value, font=font, fill='#263445')
    for i, value in enumerate(methods): draw.text((x1 + 17, y1 + 76 + 45 * len(fields) + 45 * i), value, font=font, fill='#263445')

im = Image.new('RGB', (1600, 1250), 'white')
d = ImageDraw.Draw(im)
d.text((60, 20), 'Sơ đồ lớp rút gọn của Core', font=ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 43), fill='#1b365e')
uml_box(d, (60, 110, 450, 360), 'Book', ['+ id: UUID', '+ title: String'], ['+ authors()', '+ categories()'])
uml_box(d, (600, 110, 1000, 360), 'Edition', ['+ id: UUID', '+ bookId: UUID'], ['+ isbn13()'])
uml_box(d, (1150, 110, 1550, 360), 'BookCopy', ['+ id: UUID', '+ barcode: String'], ['+ status()', '+ version()'])
uml_box(d, (60, 510, 450, 760), 'Branch', ['+ id: UUID', '+ name: String'], ['+ status()'])
uml_box(d, (600, 510, 1000, 760), 'Shelf', ['+ id: UUID', '+ branchId: UUID'], ['+ code()'])
uml_box(d, (150, 900, 700, 1170), 'PublicCatalogService', ['- books: BookRepository'], ['+ books(page, size, query)', '+ cards(ids)'])
uml_box(d, (900, 900, 1450, 1170), 'BookRepository', ['- jdbc: JdbcTemplate'], ['+ search(page, size, query)', '+ findById(id)'])
line_color = '#1b365e'
for points in [((450, 235), (600, 235)), ((1000, 235), (1150, 235)), ((450, 635), (600, 635)), ((1000, 635), (1190, 360)), ((700, 1030), (900, 1030))]:
    d.line(points, fill=line_color, width=4)
    x2, y2 = points[1]
    d.polygon([(x2, y2), (x2 - 16, y2 - 10), (x2 - 16, y2 + 10)], fill=line_color)
label_font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 27)
d.text((470, 180), '1   0..*', font=label_font, fill=line_color)
d.text((1020, 180), '1   0..*', font=label_font, fill=line_color)
d.text((470, 580), '1   0..*', font=label_font, fill=line_color)
d.text((1020, 590), '1   0..*', font=label_font, fill=line_color)
d.text((745, 980), 'JDBC', font=label_font, fill=line_color)
im.crop((0, 0, 1600, 1195)).save(ART / 'uml.png')
diagram([
    'Mở phiên → chụp snapshot Copy trong giao dịch',
    'Nhận barcode + clientScanId → trả biên nhận cũ nếu đã ghi',
    'Ghi scan mới → nhân viên kiểm tra và chốt phiên',
    'So snapshot + scan + Copy hiện tại → lưu bằng chứng',
    'Nhân viên xác nhận → kiểm version → ghi kết quả hoặc trả xung đột',
], ART / 'algorithm.png', 'Luồng thuật toán kiểm kê')

doc = Document()
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.top_margin = Cm(2)
section.bottom_margin = Cm(2)
section.left_margin = Cm(2.6)
section.right_margin = Cm(2)
section.header.paragraphs[0].text = ''
footer = section.footer.paragraphs[0]
footer.text = ''
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
footer.add_run('Trang ')
for fld in ('PAGE',):
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin')
    code = OxmlElement('w:instrText'); code.set(qn('xml:space'), 'preserve'); code.text = fld
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate')
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end')
    run = footer.add_run(); run._r.extend([begin, code, sep, end])

for name, size, bold in [('Normal', 12, False), ('Title', 24, True), ('Heading 1', 16, True), ('Heading 2', 13.5, True), ('Heading 3', 12.5, True)]:
    style = doc.styles[name]
    style.font.name = 'Times New Roman'
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.color.rgb = NAVY if name != 'Normal' else RGBColor(30, 30, 30)
    style.paragraph_format.space_after = Pt(5 if name == 'Normal' else 9)
    if name == 'Normal': style.paragraph_format.line_spacing = 1.12
    else: style.paragraph_format.keep_with_next = True

def add_rich(paragraph, text: str):
    chunks = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
    for chunk in chunks:
        if chunk.startswith('**') and chunk.endswith('**'):
            paragraph.add_run(chunk[2:-2]).bold = True
        elif chunk.startswith('`') and chunk.endswith('`'):
            run = paragraph.add_run(chunk[1:-1]); run.font.name = 'Consolas'; run.font.size = Pt(10)
        else:
            # Markdown links are kept readable without raw URL in the body.
            paragraph.add_run(re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', chunk))

def table_from_lines(rows: list[str]):
    data = [[c.strip() for c in row.strip().strip('|').split('|')] for row in rows]
    data = [row for row in data if not all(re.fullmatch(r':?-{3,}:?', c) for c in row)]
    if data[0][0] == 'Mã':
        for code, story, condition in data[1:]:
            p = doc.add_paragraph(style='Normal')
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.space_after = Pt(7)
            p.add_run(code + '. ').bold = True
            p.add_run(story + ' ')
            p.add_run('Đạt khi: ').bold = True
            p.add_run(condition)
        return
    table = doc.add_table(rows=0, cols=len(data[0]))
    table.autofit = False
    if len(data[0]) == 3 and data[0][0] == 'Mã': widths = [2.0, 8.0, 6.2]
    elif len(data[0]) == 3: widths = [4.5, 6.5, 5.2]
    else: widths = [16.2 / len(data[0])] * len(data[0])
    for j, width in enumerate(widths): table.columns[j].width = Cm(width)
    for index, values in enumerate(data):
        cells = table.add_row().cells
        for j, value in enumerate(values):
            cells[j].width = Cm(widths[j])
            cells[j].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            cells[j].text = ''
            add_rich(cells[j].paragraphs[0], value)
            for p in cells[j].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j == 0 and data[0][0] == 'Mã' else WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = Pt(0)
                p.paragraph_format.left_indent = Pt(0)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.keep_with_next = False
                p.paragraph_format.keep_together = True
                for run in p.runs: run.font.size = Pt(10.5)
            tcPr = cells[j]._tc.get_or_add_tcPr()
            shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), '1B365E' if index == 0 else ('F1F5FA' if index % 2 == 0 else 'FFFFFF'))
            tcPr.append(shd)
            mar = OxmlElement('w:tcMar')
            for side in ('top', 'left', 'bottom', 'right'):
                el = OxmlElement('w:' + side); el.set(qn('w:w'), '100'); el.set(qn('w:type'), 'dxa'); mar.append(el)
            tcPr.append(mar)
            for run in cells[j].paragraphs[0].runs:
                if index == 0: run.font.bold = True; run.font.color.rgb = RGBColor(255, 255, 255)
        if index == 0:
            trPr = table.rows[-1]._tr.get_or_add_trPr()
            repeat = OxmlElement('w:tblHeader'); repeat.set(qn('w:val'), 'true'); trPr.append(repeat)
        trPr = table.rows[-1]._tr.get_or_add_trPr()
        no_split = OxmlElement('w:cantSplit'); trPr.append(no_split)
    tblPr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + side); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), 'D9D9D9'); borders.append(e)
    tblPr.append(borders)
    doc.add_paragraph()

cover = [
    ('ĐẠI HỌC PHENIKAA', 17, True),
    ('TRƯỜNG CÔNG NGHỆ THÔNG TIN', 15, True),
    ('HỌC PHẦN LẬP TRÌNH HƯỚNG ĐỐI TƯỢNG', 13, False),
    ('BÁO CÁO BÀI TẬP LỚN', 21, True),
    ('HỆ THỐNG QUẢN LÍ VÀ KHAI THÁC THƯ VIỆN', 19, True),
    ('LAMS Library Access and Management System', 13, False),
    ('Nhóm hai thành viên', 13, False),
    ('Thông tin sinh viên và giảng viên bổ sung theo hồ sơ học phần', 11, False),
    ('Hà Nội 2026', 12, False),
]
for idx, (content, size, bold) in enumerate(cover):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(45 if idx == 3 else 10)
    run = p.add_run(content); run.font.name = 'Times New Roman'; run.font.size = Pt(size); run.bold = bold; run.font.color.rgb = NAVY
doc.add_page_break()

lines = SOURCE.read_text(encoding='utf-8').splitlines()
in_code = False; code_lang = ''; code = []; table_rows = []
def flush_table():
    global table_rows
    if table_rows: table_from_lines(table_rows); table_rows = []
for line in lines:
    stripped = line.strip()
    if stripped.startswith('```'):
        flush_table()
        if not in_code: in_code = True; code_lang = stripped[3:]; code = []
        else:
            if code_lang == 'mermaid':
                img = ART / ('uml.png' if any('classDiagram' in x for x in code) else 'algorithm.png')
                p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.add_run().add_picture(str(img), width=Cm(14.2 if img.name == 'uml.png' else 15))
            else:
                for item in code:
                    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(0)
                    run = p.add_run(item); run.font.name = 'Consolas'; run.font.size = Pt(8.5)
            in_code = False
        continue
    if in_code: code.append(line); continue
    if stripped.startswith('|'): table_rows.append(stripped); continue
    flush_table()
    if not stripped: continue
    if stripped.startswith('# '):
        if stripped == '# Hệ thống quản lí và khai thác thư viện LAMS': continue
        doc.add_paragraph(stripped[2:], 'Heading 1')
    elif stripped.startswith('## '): doc.add_paragraph(stripped[3:], 'Heading 2')
    else:
        p = doc.add_paragraph(style='Normal')
        add_rich(p, stripped)
flush_table()
doc.core_properties.title = 'Báo cáo bài tập lớn Hệ thống quản lí và khai thác thư viện LAMS'
doc.core_properties.subject = 'Bản làm việc tại commit 52606cc'
doc.save(OUT)
print(OUT)
