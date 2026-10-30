import adventureTrail from '../../assets/img/categories/adventure-trail.jpg';
import childrenBooks from '../../assets/img/categories/children-books.jpg';
import historicalLibrary from '../../assets/img/categories/historical-library.jpg';
import natureForest from '../../assets/img/categories/nature-forest.jpg';
import romanceReading from '../../assets/img/categories/romance-reading.jpg';
import scienceLab from '../../assets/img/categories/science-lab.jpg';
import artStudio from '../../assets/img/categories/art-studio.jpg';
import businessCharts from '../../assets/img/categories/business-charts.jpg';
import mathematicsBoard from '../../assets/img/categories/mathematics-board.jpg';
import musicPiano from '../../assets/img/categories/music-piano.jpg';
import astronomyTelescope from '../../assets/img/categories/astronomy-telescope.jpg';
import sportsFootball from '../../assets/img/categories/sports-football.jpg';
import readingCorner from '../../assets/img/editorial/reading-corner.jpg';
import booksTable from '../../assets/img/editorial/books-table.jpg';

const photos = [
  { words: ['am nhac', 'music', 'musical', 'piano', 'opera'], src: musicPiano, alt: 'Đàn piano và bản nhạc' },
  { words: ['thien van', 'astronomy', 'space', 'vu tru', 'science fiction'], src: astronomyTelescope, alt: 'Kính thiên văn dưới bầu trời sao' },
  { words: ['the thao', 'sport', 'sports', 'football', 'soccer'], src: sportsFootball, alt: 'Bóng trên sân cỏ' },
  { words: ['phieu luu', 'adventure', 'du lich', 'travel', 'hanh trinh'], src: adventureTrail, alt: 'Đường mòn trên núi' },
  { words: ['lich su', 'historical', 'history', 'co dien', 'classic'], src: historicalLibrary, alt: 'Kệ sách trong thư viện cổ' },
  { words: ['khoa hoc', 'science', 'cong nghe', 'technology', 'ky thuat'], src: scienceLab, alt: 'Nhà khoa học trong phòng thí nghiệm' },
  { words: ['thien nhien', 'nature', 'moi truong', 'environment', 'sinh hoc', 'biology', 'animal', 'bird', 'insect', 'mammal', 'botany', 'zoology'], src: natureForest, alt: 'Rừng cây xanh' },
  { words: ['lang man', 'romance', 'tinh yeu', 'love'], src: romanceReading, alt: 'Hai người cùng đọc sách' },
  { words: ['thieu nhi', 'children', 'child', 'tre em', 'kids'], src: childrenBooks, alt: 'Kệ sách thiếu nhi nhiều màu' },
  { words: ['nghe thuat', 'my thuat', 'hoi hoa', 'painting', 'visual art', 'art'], src: artStudio, alt: 'Họa sĩ vẽ tranh trên giá' },
  { words: ['kinh te', 'tai chinh', 'economics', 'finance', 'business'], src: businessCharts, alt: 'Nhóm người xem biểu đồ kinh doanh' },
  { words: ['toan hoc', 'mathematics', 'maths', 'math'], src: mathematicsBoard, alt: 'Nhóm nghiên cứu thảo luận trước bảng toán' },
  { words: ['van hoc', 'literature', 'literary', 'poetry', 'poems', 'tho', 'novel', 'novels', 'fiction', 'essay', 'essays', 'short stories'], src: readingCorner, alt: 'Sách trên bàn đọc' },
];

export function categoryEditorialPhoto(title: string) {
  const normalized = title.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const phrase = ` ${normalized} `;
  const match = photos.find(photo => photo.words.some(word => phrase.includes(` ${word} `) || (word.length > 3 && phrase.includes(` ${word}s `))));
  if (match) return match;
  // General reading scenes are illustrations, never portraits or book covers.
  const fallback = [historicalLibrary, readingCorner, booksTable];
  const index = [...normalized].reduce((sum, character) => sum + character.charCodeAt(0), 0) % fallback.length;
  return { src: fallback[index], alt: 'Không gian đọc và sách — ảnh minh họa chuyên mục' };
}
