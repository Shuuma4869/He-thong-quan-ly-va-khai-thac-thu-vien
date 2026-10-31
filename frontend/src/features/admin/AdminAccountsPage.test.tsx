import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '1f6322af-8f00-4cb0-8b06-c6f6934e268a';
const user = { id, memberCode: 'TV-1234', email: 'admin@example.test', fullName: 'Quản trị viên', roles: ['ADMIN'] };
const session = { accessToken: 'admin-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const target = { id: '71ea21bb-9603-4b15-9fe8-3b376b483ff9', memberCode: 'TV-5678',
  fullName: 'Nguyễn Bình', email: 'reader@example.test', status: 'ACTIVE', roles: ['READER'],
  version: 0, createdAt: '2026-10-28T00:00:00Z' };

afterEach(() => vi.unstubAllGlobals());

it('chỉ quản trị viên thấy màn tài khoản và lưu thay đổi kèm phiên bản, lý do', async () => {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(
    String(url).endsWith('/auth/refresh') ? Response.json(session)
      : String(url).includes('/admin/accounts?') ? Response.json({ items: [target], number: 0, size: 20, totalElements: 1 })
        : String(url).endsWith(`/admin/accounts/${target.id}/audit`) ? Response.json([])
          : String(url).endsWith(`/admin/accounts/${target.id}/status`) && init.method === 'PATCH'
            ? Response.json({ ...target, status: 'LOCKED', version: 1 }) : Response.json(target)));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/tai-khoan']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
  const panel = await screen.findByRole('dialog', { name: 'Hồ sơ quản trị' });
  fireEvent.change(await within(panel).findByLabelText('Lý do thay đổi'), { target: { value: 'Kiểm tra tài khoản' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Khóa tài khoản' }));
  const confirmation = await screen.findByRole('alertdialog', { name: 'Khóa tài khoản?' });
  expect(confirmation).toHaveTextContent('được ghi lại cùng lý do');
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Xác nhận khóa' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/admin/accounts/${target.id}/status`) && init.method === 'PATCH'
    && JSON.parse(String(init.body)).expectedVersion === 0
    && JSON.parse(String(init.body)).reason === 'Kiểm tra tài khoản')).toBe(true));
});

it('người đọc không thấy trang quản trị hoặc gọi API tài khoản', async () => {
  const fetchMock = vi.fn((url: string) => Promise.resolve(Response.json(
    String(url).endsWith('/auth/refresh') ? { ...session, user: { ...user, roles: ['READER'] } } : {})));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/tai-khoan']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByText(/403 · Không có quyền truy cập/)).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/admin/accounts'))).toBe(false);
});

it('cho phép tải lại lịch sử quản trị khi API audit tạm thời lỗi', async () => {
  let auditAttempts = 0;
  const fetchMock = vi.fn((url: string) => {
    if (String(url).endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    if (String(url).endsWith(`/admin/accounts/${target.id}/audit`)) {
      auditAttempts += 1;
      return Promise.resolve(auditAttempts === 1 ? Response.json({}, { status: 503 }) : Response.json([]));
    }
    return Promise.resolve(Response.json(String(url).includes('/admin/accounts?')
      ? { items: [target], number: 0, size: 20, totalElements: 1 } : target));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/tai-khoan']}><AppRouter/></MemoryRouter></AppProviders>);
  fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
  expect(await screen.findByText('Không tải được dữ liệu. Vui lòng kiểm tra kết nối và thử lại.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Chưa có thay đổi quản trị.')).toBeInTheDocument();
  expect(auditAttempts).toBe(2);
});
