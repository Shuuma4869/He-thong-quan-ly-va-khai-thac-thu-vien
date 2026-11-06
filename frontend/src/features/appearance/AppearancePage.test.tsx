import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppearancePage } from './AppearancePage';

const state = vi.hoisted(() => ({ roles: ['READER'], loading: false, save: vi.fn(), preview: vi.fn() }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { roles: state.roles } }) }));
vi.mock('./appearance-context', async () => {
  const { defaults: values } = await import('./appearance');
  return { useAppearance: () => ({ values, saved: values, loading: state.loading, saving: false,
    error: null, save: state.save, discard: vi.fn(), preview: state.preview }) };
});
afterEach(() => { state.roles = ['READER']; state.loading = false; vi.clearAllMocks(); });
function app() {
  render(<MemoryRouter><Routes><Route path="/" element={<AppearancePage/>}/>
    <Route path="/sach" element={<h1>Danh mục thử nghiệm</h1>}/></Routes></MemoryRouter>);
}
it('liên kết trong xem trước mở danh mục thật', () => {
  app(); fireEvent.click(screen.getByRole('link', { name: 'Khám phá sách' }));
  expect(screen.getByRole('heading', { name: 'Danh mục thử nghiệm' })).toBeInTheDocument();
});
it('không cho lưu/reset khi cấu hình tài khoản còn đang tải', () => {
  state.loading = true; app();
  for (const name of ['Lưu giao diện', 'Bỏ thay đổi', 'Khôi phục mặc định']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(state.save).not.toHaveBeenCalled();
});
it.each([['ADMIN'], ['ADMIN', 'LIBRARIAN']])('dashboard quản trị không có tùy chọn widget dành riêng thủ thư: %s', (...roles) => {
  state.roles = roles; app();
  expect(screen.queryByRole('group', { name: 'Widget bảng điều khiển thủ thư' })).not.toBeInTheDocument();
});
it('thủ thư có thể bật tắt các nhóm widget đã triển khai', () => {
  state.roles = ['LIBRARIAN']; app();
  expect(screen.getByRole('group', { name: 'Widget bảng điều khiển thủ thư' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tổng quan' }));
  expect(state.preview).toHaveBeenCalledWith(expect.objectContaining({ widgets: ['circulation', 'inventory', 'acquisition'] }));
});
