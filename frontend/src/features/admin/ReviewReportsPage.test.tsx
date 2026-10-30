import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const admin = { id: '1f6322af-8f00-4cb0-8b06-c6f6934e268a', memberCode: 'TV-1234',
  email: 'admin@example.test', fullName: 'Quản trị viên', roles: ['ADMIN'] };
const session = { accessToken: 'admin-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user: admin };
const report = { id: '6dff85ce-9a56-4cca-845d-a6f5d36cbe32', reviewId: '5a5804a7-43a5-48f4-aa76-3357f0cdd565',
  bookId: '4e6fa4d1-bdd9-429a-ae84-957eb9af60a8', reporterId: '118a10cc-4c70-40d1-8c97-d569f5c23c19',
  reviewOwnerId: 'b316c1b2-ffcb-4867-8cff-3761546f9a12', bodySnapshot: 'Nội dung tại lúc báo cáo',
  ratingSnapshot: 2, reason: 'Nội dung không phù hợp', status: 'OPEN',
  createdAt: '2026-10-28T00:00:00Z', resolvedAt: null };

afterEach(() => vi.unstubAllGlobals());

it('quản trị viên thấy ảnh chụp nội dung và ghi lý do khi ẩn đánh giá', async () => {
  let decided = false;
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    if (String(url).includes('/admin/review-reports?')) return Promise.resolve(Response.json({
      items: decided ? [] : [report], page: 0, size: 20, totalElements: decided ? 0 : 1 }));
    if (String(url).endsWith(`/admin/review-reports/${report.id}/decisions`) && init.method === 'POST') {
      decided = true;
      return Promise.resolve(Response.json({ reportId: report.id, action: 'HIDE', reviewStatus: 'HIDDEN',
        resolvedAt: '2026-10-28T01:00:00Z' }));
    }
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/bao-cao-danh-gia']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByRole('heading', { name: 'Báo cáo đánh giá' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết' }));
  const drawer = await screen.findByRole('dialog', { name: 'Chi tiết báo cáo' });
  expect(await within(drawer).findByText('Nội dung tại thời điểm báo cáo')).toBeInTheDocument();
  fireEvent.change(within(drawer).getByLabelText('Lý do quyết định'), { target: { value: 'Có nội dung xúc phạm rõ ràng' } });
  fireEvent.click(within(drawer).getByRole('button', { name: 'Ẩn đánh giá' }));
  const confirmation = await screen.findByRole('alertdialog', { name: 'Ẩn đánh giá này?' });
  expect(decided).toBe(false);
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Xác nhận ẩn đánh giá' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/admin/review-reports/${report.id}/decisions`) && init.method === 'POST'
      && JSON.parse(String(init.body)).action === 'HIDE'
      && JSON.parse(String(init.body)).reason === 'Có nội dung xúc phạm rõ ràng')).toBe(true));
  expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu quyết định.');
  expect(await screen.findByText('Không có báo cáo ở trang này.')).toBeInTheDocument();
});

it('người đọc không tải hàng đợi kiểm duyệt', async () => {
  const fetchMock = vi.fn((url: string) => Promise.resolve(Response.json(
    String(url).endsWith('/auth/refresh') ? { ...session, user: { ...admin, roles: ['READER'] } } : {})));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/bao-cao-danh-gia']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByText(/403 · Không có quyền truy cập/)).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/admin/review-reports'))).toBe(false);
});
