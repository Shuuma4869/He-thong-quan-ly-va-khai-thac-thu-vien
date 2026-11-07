import { describe, expect, it } from 'vitest';
import { afterAuthentication, authLink, returnPath } from './auth-navigation';

describe('đường quay lại sau xác thực', () => {
  it('giữ nguyên bộ lọc và vị trí trong trang', () => {
    const target = '/muon-va-giu-cho?holdPage=2#holds';
    expect(returnPath(authLink('/dang-nhap', target).split('?')[1])).toBe(target);
  });
  it.each(['https://example.test', '//example.test', '/\\example.test', '/dang-nhap', '/dang-ky?returnTo=/', '/\nexample.test'])(
    'từ chối đường chuyển hướng không an toàn: %s', target => {
      expect(returnPath(`?${new URLSearchParams({ returnTo: target })}`)).toBeNull();
    });
  it('giữ trang mặc định theo vai trò khi không có đường quay lại', () => {
    expect(afterAuthentication({ id: '1', fullName: 'Thủ thư', memberCode: 'TV1', email: 'staff@example.test', roles: ['LIBRARIAN'] }, '')).toBe('/nhan-vien/bang-dieu-khien');
    expect(authLink('/dang-ky', null)).toBe('/dang-ky');
  });
});
