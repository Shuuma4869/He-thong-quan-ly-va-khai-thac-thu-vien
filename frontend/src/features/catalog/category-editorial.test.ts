import { expect, it } from 'vitest';
import { categoryEditorialPhoto } from './category-editorial';
it('giữ các ánh xạ tiếng Việt và tiếng Anh đã có', () => {
  for (const title of ['Khoa học', 'Science']) expect(categoryEditorialPhoto(title).alt).toContain('phòng thí nghiệm');
  expect(categoryEditorialPhoto('Thiếu nhi').alt).toContain('thiếu nhi');
  expect(categoryEditorialPhoto('Nghệ thuật').alt).toContain('Họa sĩ');
  expect(categoryEditorialPhoto('Kinh tế').alt).toContain('kinh doanh');
  expect(categoryEditorialPhoto('Toán học').alt).toContain('bảng toán');
  expect(categoryEditorialPhoto('Văn học').alt).toBe('Sách trên bàn đọc');
  expect(categoryEditorialPhoto('Martial arts').alt).toContain('ảnh minh họa chuyên mục');
});
it('ánh xạ Unicode, từ ghép và tên nhóm phân cách bằng dấu gạch', () => {
  expect(categoryEditorialPhoto('ÂM NHẠC').src).toBe(categoryEditorialPhoto('Music').src);
  expect(categoryEditorialPhoto('Animals-Wild-Birds').src).toBe(categoryEditorialPhoto('Thiên nhiên').src);
  expect(categoryEditorialPhoto('Science Fiction').src).toBe(categoryEditorialPhoto('Thiên văn').src);
});
it('không khớp một phần của từ làm sai chủ đề', () => {
  expect(categoryEditorialPhoto('Love').alt).toBe('Hai người cùng đọc sách');
  expect(categoryEditorialPhoto('Gloves').alt).toContain('ảnh minh họa chuyên mục');
  expect(categoryEditorialPhoto('Art').alt).toBe('Họa sĩ vẽ tranh trên giá');
  expect(categoryEditorialPhoto('Martial').alt).toContain('ảnh minh họa chuyên mục');
});
