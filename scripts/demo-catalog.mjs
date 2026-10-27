import { createHash } from 'node:crypto';

// Danh sách tác phẩm đã đối chiếu tên/tác giả với trang Standard Ebooks ngày 26/10/2026.
// Bìa ở các URL này chỉ là ứng viên; script không duyệt hoặc lưu media.
const works = [
  ['jane-austen/pride-and-prejudice', 'Pride and Prejudice', 'Jane Austen', ['Kinh điển', 'Lãng mạn'], 'Elizabeth Bennet và Fitzwilliam Darcy phải vượt qua thành kiến về địa vị, gia đình và hôn nhân.'],
  ['jane-austen/sense-and-sensibility', 'Sense and Sensibility', 'Jane Austen', ['Kinh điển', 'Lãng mạn'], 'Hai chị em Dashwood đi tìm tình yêu trong khi học cách cân bằng cảm xúc và lý trí.'],
  ['jane-austen/emma', 'Emma', 'Jane Austen', ['Kinh điển', 'Lãng mạn'], 'Emma Woodhouse thích mai mối cho bạn bè, nhưng thường hiểu sai tình cảm của người quanh mình.'],
  ['jane-austen/persuasion', 'Persuasion', 'Jane Austen', ['Kinh điển', 'Lãng mạn'], 'Anne Elliot gặp lại Frederick Wentworth sau nhiều năm và có cơ hội nhìn lại lựa chọn cũ.'],
  ['jane-austen/northanger-abbey', 'Northanger Abbey', 'Jane Austen', ['Kinh điển', 'Châm biếm'], 'Catherine Morland bước vào đời sống xã hội và nhận ra tưởng tượng khác xa thực tế.'],
  ['charlotte-bronte/jane-eyre', 'Jane Eyre', 'Charlotte Brontë', ['Kinh điển', 'Gothic'], 'Jane Eyre tìm một cuộc sống độc lập khi làm gia sư tại Thornfield Hall.'],
  ['emily-bronte/wuthering-heights', 'Wuthering Heights', 'Emily Brontë', ['Kinh điển', 'Gothic'], 'Mối quan hệ giữa Catherine Earnshaw và Heathcliff để lại hậu quả qua nhiều thế hệ.'],
  ['bram-stoker/dracula', 'Dracula', 'Bram Stoker', ['Kinh điển', 'Gothic'], 'Những lá thư và nhật ký lần theo mối đe dọa từ bá tước Dracula.'],
  ['mary-shelley/frankenstein', 'Frankenstein', 'Mary Shelley', ['Kinh điển', 'Khoa học viễn tưởng', 'Gothic'], 'Victor Frankenstein tạo ra một sinh thể rồi phải đối diện trách nhiệm với chính sáng tạo đó.'],
  ['h-g-wells/the-time-machine', 'The Time Machine', 'H. G. Wells', ['Kinh điển', 'Khoa học viễn tưởng'], 'Một nhà phát minh du hành tới tương lai xa và chứng kiến xã hội đã đổi khác.'],
  ['h-g-wells/the-war-of-the-worlds', 'The War of the Worlds', 'H. G. Wells', ['Kinh điển', 'Khoa học viễn tưởng'], 'Cuộc xâm lăng từ Sao Hỏa làm đảo lộn cuộc sống thường ngày trên Trái Đất.'],
  ['h-g-wells/the-invisible-man', 'The Invisible Man', 'H. G. Wells', ['Kinh điển', 'Khoa học viễn tưởng'], 'Một nhà khoa học tìm được cách tàng hình nhưng không kiểm soát được hệ quả của nó.'],
  ['h-g-wells/the-island-of-doctor-moreau', 'The Island of Doctor Moreau', 'H. G. Wells', ['Kinh điển', 'Khoa học viễn tưởng'], 'Một người sống sót trôi dạt tới hòn đảo nơi bác sĩ Moreau làm thí nghiệm.'],
  ['arthur-conan-doyle/a-study-in-scarlet', 'A Study in Scarlet', 'Arthur Conan Doyle', ['Kinh điển', 'Trinh thám'], 'Sherlock Holmes và John Watson cùng điều tra một vụ án mạng bí ẩn ở London.'],
  ['arthur-conan-doyle/the-hound-of-the-baskervilles', 'The Hound of the Baskervilles', 'Arthur Conan Doyle', ['Kinh điển', 'Trinh thám'], 'Holmes và Watson tìm sự thật sau lời nguyền ám ảnh gia đình Baskerville.'],
  ['arthur-conan-doyle/the-adventures-of-sherlock-holmes', 'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', ['Kinh điển', 'Trinh thám'], 'Tập truyện ngắn ghi lại những vụ án Sherlock Holmes giải cùng bác sĩ Watson.'],
  ['oscar-wilde/the-picture-of-dorian-gray', 'The Picture of Dorian Gray', 'Oscar Wilde', ['Kinh điển', 'Gothic'], 'Bức chân dung phản chiếu những thay đổi mà Dorian Gray không muốn thấy ở chính mình.'],
  ['louisa-may-alcott/little-women', 'Little Women', 'Louisa May Alcott', ['Kinh điển', 'Gia đình'], 'Bốn chị em nhà March trưởng thành cùng những lựa chọn riêng về gia đình và công việc.'],
  ['charles-dickens/great-expectations', 'Great Expectations', 'Charles Dickens', ['Kinh điển', 'Xã hội'], 'Pip nhận được một cơ hội đổi đời và dần hiểu cái giá của những kỳ vọng.'],
  ['charles-dickens/a-christmas-carol', 'A Christmas Carol', 'Charles Dickens', ['Kinh điển', 'Gia đình'], 'Ebenezer Scrooge trải qua một đêm Giáng sinh khiến ông nhìn lại cách mình sống.'],
  ['charles-dickens/oliver-twist', 'Oliver Twist', 'Charles Dickens', ['Kinh điển', 'Xã hội'], 'Cậu bé Oliver phải xoay xở giữa nghèo đói và tội phạm ở London.'],
  ['charles-dickens/a-tale-of-two-cities', 'A Tale of Two Cities', 'Charles Dickens', ['Kinh điển', 'Lịch sử'], 'Số phận nhiều người đan xen giữa London và Paris trong thời Cách mạng Pháp.'],
  ['joseph-conrad/heart-of-darkness', 'Heart of Darkness', 'Joseph Conrad', ['Kinh điển', 'Phiêu lưu'], 'Marlow kể lại chuyến đi ngược dòng sông Congo để tìm Kurtz.'],
  ['joseph-conrad/the-secret-agent', 'The Secret Agent', 'Joseph Conrad', ['Kinh điển', 'Trinh thám'], 'Một người bán hàng ở London bị cuốn vào kế hoạch chính trị nguy hiểm.'],
  ['rudyard-kipling/the-jungle-book', 'The Jungle Book', 'Rudyard Kipling', ['Kinh điển', 'Phiêu lưu'], 'Tập truyện về Mowgli và những nhân vật khác trong khu rừng Ấn Độ.'],
  ['rudyard-kipling/kim', 'Kim', 'Rudyard Kipling', ['Kinh điển', 'Phiêu lưu'], 'Kim đi khắp Ấn Độ cùng một vị lama và vướng vào hoạt động tình báo.'],
  ['l-frank-baum/the-wonderful-wizard-of-oz', 'The Wonderful Wizard of Oz', 'L. Frank Baum', ['Kinh điển', 'Kỳ ảo', 'Thiếu nhi'], 'Dorothy theo con đường gạch vàng cùng những người bạn mới để tìm đường về nhà.'],
  ['robert-louis-stevenson/treasure-island', 'Treasure Island', 'Robert Louis Stevenson', ['Kinh điển', 'Phiêu lưu'], 'Jim Hawkins lên đường tìm kho báu và gặp những thủy thủ không dễ tin cậy.'],
  ['jack-london/the-call-of-the-wild', 'The Call of the Wild', 'Jack London', ['Kinh điển', 'Phiêu lưu'], 'Chú chó Buck thích nghi với cuộc sống khắc nghiệt ở vùng Klondike.'],
  ['jack-london/white-fang', 'White Fang', 'Jack London', ['Kinh điển', 'Phiêu lưu'], 'White Fang lớn lên giữa hoang dã và con người ở miền bắc lạnh giá.'],
  ['edgar-allan-poe/short-fiction', 'Short Fiction', 'Edgar Allan Poe', ['Kinh điển', 'Gothic'], 'Tuyển tập truyện ngắn của Edgar Allan Poe với nhiều sắc thái bí ẩn và rùng rợn.'],
  ['herman-melville/moby-dick', 'Moby Dick', 'Herman Melville', ['Kinh điển', 'Phiêu lưu'], 'Thuyền trưởng Ahab theo đuổi con cá voi trắng trên hành trình của tàu Pequod.'],
];

const namespace = Buffer.from('6ca8332c0d1b4b0d934e9a87246f23c5', 'hex');
function id(key) {
  const bytes = createHash('sha1').update(namespace).update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
if (process.argv[2] === '--media-review') {
  const csv = value => `"${String(value).replaceAll('"', '""')}"`;
  const columns = ['Tác phẩm', 'Tác giả', 'Edition ID', 'Định danh nguồn', 'Trang nguồn', 'Ứng viên ảnh', 'Trang quyền sử dụng', 'Trạng thái'];
  const rows = works.map(([slug, title, author]) => [title, author, id('edition:' + slug), slug,
    `https://standardebooks.org/ebooks/${slug}`,
    `https://standardebooks.org/ebooks/${slug}/downloads/cover.jpg`,
    'https://standardebooks.org/about/standard-ebooks-and-the-public-domain', 'Chưa duyệt']);
  process.stdout.write([columns, ...rows].map(row => row.map(csv).join(',')).join('\n') + '\n');
  process.exit(0);
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '')
  .replaceAll('đ', 'd').replaceAll('Đ', 'D').trim().toLowerCase().replace(/\s+/g, ' ');
const categoryKey = value => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const authors = [...new Set(works.map(item => item[2]))];
const categories = [...new Set(works.flatMap(item => item[3]))];
const aliases = [
  ['Truyện tình', 'Lãng mạn'],
  ['Thám tử', 'Trinh thám'],
  ['Khoa học giả tưởng', 'Khoa học viễn tưởng'],
];
const branches = [
  { code: 'DEMO-TT', name: 'Thư viện Trung tâm (demo)' },
  { code: 'DEMO-CS', name: 'Thư viện Cơ sở (demo)' },
];
const shelves = branches.map(branch => ({ branch, code: 'SACH', label: 'Kệ sách demo' }));
const rows = [];
rows.push('BEGIN;');
rows.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM books WHERE id NOT IN (${works.map(w => quote(id('book:' + w[0]))).join(',')})) THEN RAISE EXCEPTION 'Database có sách ngoài bộ demo; không seed vào dữ liệu đang sử dụng.'; END IF; END $$;`);
for (const author of authors) rows.push(`INSERT INTO authors(id,name) VALUES (${quote(id('author:' + author))},${quote(author)}) ON CONFLICT(id) DO NOTHING;`);
for (const category of categories) rows.push(`INSERT INTO categories(id,name,normalized_name) VALUES (${quote(id('category:' + category))},${quote(category)},${quote(categoryKey(category))}) ON CONFLICT(id) DO UPDATE SET normalized_name=EXCLUDED.normalized_name;`);
for (const [alias, category] of aliases) {
  const normalized = categoryKey(alias), categoryId = id('category:' + category);
  rows.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM category_aliases WHERE normalized_alias=${quote(normalized)} AND category_id<>${quote(categoryId)}) THEN RAISE EXCEPTION 'Bí danh demo đã trỏ tới thể loại khác.'; END IF; END $$;`);
  rows.push(`INSERT INTO category_aliases(id,category_id,alias_name,normalized_alias) VALUES (${quote(id('alias:' + alias))},${quote(categoryId)},${quote(alias)},${quote(normalized)}) ON CONFLICT(id) DO UPDATE SET normalized_alias=EXCLUDED.normalized_alias;`);
}
for (const branch of branches) rows.push(`INSERT INTO branches(id,code,name) VALUES (${quote(id('branch:' + branch.code))},${quote(branch.code)},${quote(branch.name)}) ON CONFLICT(id) DO NOTHING;`);
for (const shelf of shelves) rows.push(`INSERT INTO shelves(id,branch_id,code,label) VALUES (${quote(id('shelf:' + shelf.branch.code))},${quote(id('branch:' + shelf.branch.code))},${quote(shelf.code)},${quote(shelf.label)}) ON CONFLICT(id) DO NOTHING;`);
for (const [index, work] of works.entries()) {
  const [slug, title, author, tags, description] = work;
  const book = id('book:' + slug), edition = id('edition:' + slug);
  rows.push(`INSERT INTO books(id,title,normalized_title,description) VALUES (${quote(book)},${quote(title)},${quote(normalize(title))},${quote(description)}) ON CONFLICT(id) DO NOTHING;`);
  rows.push(`INSERT INTO book_authors(book_id,author_id) VALUES (${quote(book)},${quote(id('author:' + author))}) ON CONFLICT DO NOTHING;`);
  for (const tag of tags) rows.push(`INSERT INTO book_categories(book_id,category_id) VALUES (${quote(book)},${quote(id('category:' + tag))}) ON CONFLICT DO NOTHING;`);
  // ISBN, nhà xuất bản và năm của bản in chưa được xác minh nên để NULL.
  rows.push(`INSERT INTO editions(id,book_id,language) VALUES (${quote(edition)},${quote(book)},'en') ON CONFLICT(id) DO NOTHING;`);
  for (const [position, branch] of branches.entries()) {
    const barcode = `DEMO-SE-${String(index + 1).padStart(3, '0')}-${position + 1}`;
    rows.push(`INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (${quote(id('copy:' + barcode))},${quote(edition)},${quote(barcode)},${quote(id('shelf:' + branch.code))},'AVAILABLE') ON CONFLICT(id) DO NOTHING;`);
  }
}
rows.push('COMMIT;');
rows.push(`SELECT 'demo_books',count(*) FROM books WHERE id IN (${works.map(w => quote(id('book:' + w[0]))).join(',')});`);
rows.push(`SELECT 'demo_copies',count(*) FROM book_copies WHERE barcode LIKE 'DEMO-SE-%';`);
process.stdout.write(rows.join('\n') + '\n');
