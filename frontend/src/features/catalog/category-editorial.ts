import adventureTrail from '../../assets/img/categories/adventure-trail.jpg';
import childrenBooks from '../../assets/img/categories/children-books.jpg';
import historicalLibrary from '../../assets/img/categories/historical-library.jpg';
import natureForest from '../../assets/img/categories/nature-forest.jpg';
import romanceReading from '../../assets/img/categories/romance-reading.jpg';
import scienceLab from '../../assets/img/categories/science-lab.jpg';

const photos = [
  { words: ['phieu luu', 'adventure', 'du lich', 'travel', 'hanh trinh'], src: adventureTrail, alt: 'Đường mòn trên núi' },
  { words: ['lich su', 'historical', 'history', 'co dien', 'classic'], src: historicalLibrary, alt: 'Kệ sách trong thư viện cổ' },
  { words: ['khoa hoc', 'science', 'cong nghe', 'technology', 'ky thuat'], src: scienceLab, alt: 'Nhà khoa học trong phòng thí nghiệm' },
  { words: ['thien nhien', 'nature', 'moi truong', 'environment', 'sinh hoc', 'biology'], src: natureForest, alt: 'Rừng cây xanh' },
  { words: ['lang man', 'romance', 'tinh yeu', 'love'], src: romanceReading, alt: 'Hai người cùng đọc sách' },
  { words: ['thieu nhi', 'children', 'child', 'tre em', 'kids'], src: childrenBooks, alt: 'Kệ sách thiếu nhi nhiều màu' },
];

export function categoryEditorialPhoto(title: string) {
  const normalized = title.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  return photos.find(photo => photo.words.some(word => normalized.includes(word))) ?? null;
}
