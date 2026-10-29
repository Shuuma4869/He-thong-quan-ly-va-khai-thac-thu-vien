"""Verify report structure, local evidence and Word fields without changing files."""
from pathlib import Path
import re
import zipfile
import json
from hashlib import sha256
from lxml import etree
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'ho-so-nop-bai/bao-cao/Bao-cao-tieu-luan-LAMS'
source = REPORT.with_suffix('.md').read_text(encoding='utf-8')
figures = re.findall(r'^!\[Hình (\d+)\. [^]]+\]\(([^)]+)\)', source, re.M)
tables = re.findall(r'^Bảng (\d+)\. ', source, re.M)
assert [int(n) for n, _ in figures] == list(range(1, 26)), 'Số hình không liên tục.'
assert [int(n) for n in tables] == list(range(1, len(tables) + 1)), 'Số bảng không liên tục.'
assert len(re.findall(r'^# Chương \d+\.', source, re.M)) == 10
assert len(re.findall(r'^\| US\d{2} \|', source, re.M)) == 29
assert len(re.findall(r'^### UC\d+\.', source, re.M)) == 10
refs = re.findall(r'^\[(\d+)\] ', source, re.M)
assert refs == [str(i) for i in range(1, len(refs) + 1)]
body = source.split('# Tài liệu tham khảo')[0]
assert all(re.search(r'\[' + n + r'\]', body) for n in refs), 'Có nguồn chưa trích dẫn.'
for _, image in figures:
    assert (REPORT.parent / image).is_file(), image
for label, link in re.findall(r'(?<!!)\[([^]]+)\]\(([^)]+)\)', source):
    if not link.startswith(('https://', 'http://', '#')):
        assert (REPORT.parent / link).is_file(), f'Liên kết local thiếu: {label}: {link}'
with zipfile.ZipFile(REPORT.with_suffix('.docx')) as archive:
    doc = etree.fromstring(archive.read('word/document.xml'))
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
fields = doc.xpath('//w:instrText/text()', namespaces=ns)
assert sum('SEQ Figure' in x for x in fields) == len(figures)
assert sum('SEQ Table' in x for x in fields) == len(tables)
assert any('TOC ' in x for x in fields)
bookmarks = set(doc.xpath('//w:bookmarkStart/@w:name', namespaces=ns))
anchors = doc.xpath('//w:hyperlink/@w:anchor', namespaces=ns)
assert set(anchors) <= bookmarks, f'Anchor thiếu: {set(anchors)-bookmarks}'
assert all(f'fig-{n}' in bookmarks for n, _ in figures)
assert all(f'tbl-{n}' in bookmarks for n in tables)
pdf = PdfReader(REPORT.with_suffix('.pdf'))
for index, page in enumerate(pdf.pages, 1):
    content = page.extract_text()
    assert not re.search(r'Error!|Error Bookmark|Reference source not found', content, re.I), index
    meaningful = re.sub(r'Trang\s+\d+|\s+', '', content)
    assert meaningful or '/XObject' in page['/Resources'], f'Trang trắng: {index}'
assert 'Trang 1' not in pdf.pages[0].extract_text(), 'Bìa có số trang.'
manifest = json.loads((REPORT.parent / 'manifest-bao-cao.json').read_text(encoding='utf-8'))
assert len(pdf.pages) == manifest['structure']['pdf_pages_including_cover']
for item in manifest['artifacts'] + manifest['figures'] + manifest['sources']:
    path = (ROOT / item['path']).resolve()
    assert path.is_relative_to(ROOT), item['path']
    data = path.read_bytes()
    if item['hash_mode'] == 'UTF-8 with LF line endings':
        data = data.replace(b'\r\n', b'\n')
    assert sha256(data).hexdigest() == item['sha256'], f'Hash không khớp: {item["path"]}'
print(f'Đạt kiểm cấu trúc: {len(pdf.pages)} trang, 10 chương, 29 stories, '
      f'10 use case, {len(figures)} hình, {len(tables)} bảng, {len(refs)} nguồn.')
print('Đủ ảnh, link local, SEQ/TOC/PAGEREF và bookmark; vẫn cần xem từng trang render.')
