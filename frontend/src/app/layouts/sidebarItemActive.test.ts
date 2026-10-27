import { describe, expect, it } from 'vitest';
import { sidebarItemActive } from './sidebarItemActive';

const links = ['/thu-vien-cua-toi', '/thu-vien-cua-toi#sach-yeu-thich', '/thu-vien-cua-toi#danh-gia'];
describe('điều hướng Thư viện của tôi', () => {
  it.each(['', '#sach-yeu-thich', '#danh-gia'])('chỉ chọn một mục khi hash là %s', hash => {
    expect(links.filter(link => sidebarItemActive('/thu-vien-cua-toi', hash, link)))
      .toEqual([hash ? `/thu-vien-cua-toi${hash}` : '/thu-vien-cua-toi']);
  });
  it('không tô Trang chủ trên trang con và giữ mục cha khi xem chi tiết', () => {
    expect(sidebarItemActive('/sach/123', '', '/')).toBe(false);
    expect(sidebarItemActive('/sach/123', '', '/sach')).toBe(true);
  });
});
