"""Build the editable LAMS report from its Markdown source on Windows.

Requires python-docx and Pillow. Export the resulting DOCX to PDF in Word,
then inspect every PDF page before committing either artifact.
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'ho-so-nop-bai/bao-cao/Bao-cao-tieu-luan-LAMS.md'
OUT = ROOT / 'ho-so-nop-bai/bao-cao/Bao-cao-tieu-luan-LAMS.docx'
NAVY = RGBColor(27, 54, 94)
GRAY = RGBColor(86, 94, 106)


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

for name, size, bold in [('Normal', 13, False), ('Title', 22, True), ('Heading 1', 16, True), ('Heading 2', 14, True), ('Heading 3', 13, True)]:
    style = doc.styles[name]
    style.font.name = 'Times New Roman'
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.color.rgb = RGBColor(30, 30, 30)
    style.paragraph_format.space_after = Pt(3 if name == 'Normal' else 8)
    if name == 'Normal': style.paragraph_format.line_spacing = 1.3
    else: style.paragraph_format.keep_with_next = True

def add_rich(paragraph, text: str):
    chunks = re.split(r'(\[[^]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)', text)
    for chunk in chunks:
        link = re.fullmatch(r'\[([^]]+)\]\(([^)]+)\)', chunk)
        if link:
            target = link.group(2)
            h = OxmlElement('w:hyperlink')
            if target.startswith('#'):
                h.set(qn('w:anchor'), target[1:])
            else:
                rid = paragraph.part.relate_to(target,
                    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
                    is_external=True)
                h.set(qn('r:id'), rid)
            run = OxmlElement('w:r')
            t = OxmlElement('w:t'); t.text = link.group(1); run.append(t); h.append(run)
            paragraph._p.append(h)
        elif chunk.startswith('**') and chunk.endswith('**'):
            paragraph.add_run(chunk[2:-2]).bold = True
        elif chunk.startswith('`') and chunk.endswith('`'):
            run = paragraph.add_run(chunk[1:-1]); run.font.name = 'Consolas'; run.font.size = Pt(10)
        else:
            paragraph.add_run(chunk)

def table_from_lines(rows: list[str]):
    data = [[c.strip() for c in row.strip().strip('|').split('|')] for row in rows]
    data = [row for row in data if not all(re.fullmatch(r':?-{3,}:?', c) for c in row)]
    table = doc.add_table(rows=0, cols=len(data[0]))
    table.autofit = False
    if data[0] == ['Nhóm', 'Bảng đang có trong migration', 'Vai trò']: widths = [3.1, 8.7, 4.4]
    elif len(data[0]) == 3 and data[0][0] == 'Mã': widths = [2.0, 8.0, 6.2]
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
                p.paragraph_format.keep_with_next = index == 0
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
    ('[TÊN TRƯỜNG / KHOA — NHÓM XÁC NHẬN]', 14, True),
    ('[HỌC PHẦN — NHÓM XÁC NHẬN]', 13, False),
    ('BÁO CÁO TIỂU LUẬN', 21, True),
    ('HỆ THỐNG QUẢN LÍ VÀ KHAI THÁC THƯ VIỆN', 19, True),
    ('LAMS Library Access and Management System', 13, False),
    ('Nhóm hai thành viên', 13, False),
    ('Giảng viên, sinh viên, mã số và lớp: [nhóm tự điền]', 11, False),
    ('[Địa điểm], 2026', 12, False),
]
for idx, (content, size, bold) in enumerate(cover):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(60 if idx == 2 else 12)
    run = p.add_run(content); run.font.name = 'Times New Roman'; run.font.size = Pt(size); run.bold = bold; run.font.color.rgb = RGBColor(30, 30, 30)
doc.add_page_break()

lines = SOURCE.read_text(encoding='utf-8').splitlines()
figure_titles = [re.match(r'!\[(Hình \d+\. [^]]+)\]', s).group(1)
                 for s in lines if re.match(r'!\[(Hình \d+\. [^]]+)\]', s)]
table_titles = [s for s in lines if re.match(r'Bảng \d+\. ', s)]

def add_field(paragraph, instruction, result='…'):
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin')
    code = OxmlElement('w:instrText'); code.set(qn('xml:space'), 'preserve'); code.text = ' ' + instruction + ' '
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate')
    shown = OxmlElement('w:t'); shown.text = result
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end')
    paragraph.add_run()._r.extend([begin, code, sep, shown, end])

def add_bookmark(paragraph, name):
    number = len(doc.element.body.xpath('.//w:bookmarkStart')) + 1
    start = OxmlElement('w:bookmarkStart'); start.set(qn('w:id'), str(number)); start.set(qn('w:name'), name)
    end = OxmlElement('w:bookmarkEnd'); end.set(qn('w:id'), str(number))
    paragraph._p.insert(0, start); paragraph._p.append(end)

def caption(value, kind):
    p = doc.add_paragraph(style='Caption')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if kind == 'fig' else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.keep_with_next = kind == 'tab'
    p.add_run(value)
    add_bookmark(p, f'{kind}-{re.search(r"\d+", value).group()}')

def list_items(items, kind):
    for title in items:
        number = re.search(r'\d+', title).group()
        p = doc.add_paragraph(style='Normal')
        p.add_run(title + '  ')
        add_field(p, f'PAGEREF {kind}-{number} \\h')

table_rows = []
def flush_table():
    global table_rows
    if table_rows: table_from_lines(table_rows); table_rows = []
for line in lines:
    stripped = line.strip()
    if stripped.startswith('|'): table_rows.append(stripped); continue
    flush_table()
    if not stripped: continue
    if stripped == '<!--TOC-->':
        add_field(doc.add_paragraph(), 'TOC \\o "1-2" \\h \\z \\u', 'Cập nhật mục lục trong Word')
        continue
    if stripped == '<!--LISTFIG-->':
        list_items(figure_titles, 'fig'); continue
    if stripped == '<!--LISTTAB-->':
        list_items(table_titles, 'tab'); continue
    if stripped.startswith('!['):
        match = re.match(r'!\[([^]]+)\]\(([^)]+)\)', stripped)
        if match:
            path = (SOURCE.parent / match.group(2)).resolve()
            if not path.is_file(): raise FileNotFoundError(path)
            with Image.open(path) as img: width, height = img.size
            picture_width = min(16.2, 12 * width / height)
            p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next = True
            p.add_run().add_picture(str(path), width=Cm(picture_width))
            caption(match.group(1), 'fig')
        continue
    if re.match(r'Bảng \d+\. ', stripped):
        caption(stripped, 'tab'); continue
    if stripped.startswith('<!--'):
        continue
    if stripped.startswith('# '):
        doc.add_paragraph(stripped[2:], 'Heading 1')
    elif stripped.startswith('## '): doc.add_paragraph(stripped[3:], 'Heading 2')
    else:
        p = doc.add_paragraph(style='Normal')
        add_rich(p, stripped)
flush_table()
doc.core_properties.title = 'Báo cáo bài tập lớn Hệ thống quản lí và khai thác thư viện LAMS'
doc.core_properties.subject = 'Bản làm việc của PR #31; đối chiếu CI theo SHA trong báo cáo'
doc.save(OUT)
print(OUT)
