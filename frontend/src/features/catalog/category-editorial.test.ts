import { describe, expect, it } from 'vitest';
import { categoryEditorialPhoto } from './category-editorial';

describe('Ảnh minh họa thể loại', () => {
  it('nhận tên tiếng Việt có dấu và tên tiếng Anh', () => {
    expect(categoryEditorialPhoto('Khoa học')?.alt).toContain('phòng thí nghiệm');
    expect(categoryEditorialPhoto('Science')?.alt).toContain('phòng thí nghiệm');
    expect(categoryEditorialPhoto('Thiếu nhi')?.alt).toContain('thiếu nhi');
  });

  it('không gán ảnh chủ đề không liên quan', () => {
    expect(categoryEditorialPhoto('Văn học')).toBeNull();
  });
});
