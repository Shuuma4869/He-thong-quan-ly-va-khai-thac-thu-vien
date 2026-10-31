import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const staffId = '11111111-1111-4111-8111-111111111111';
const holdId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const session = { accessToken: 'staff-token', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id: staffId, memberCode: 'NV1', email: 'staff@example.test', fullName: 'Thủ thư', roles: ['LIBRARIAN'] } };

afterEach(() => vi.unstubAllGlobals());

it('hiển thị work item từ Insight và mở trực tiếp yêu cầu WAITING/READY trong quầy', async () => {
  const fetchMock = vi.fn((url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    if (path.endsWith('/staff/work-items/unread-count')) return Promise.resolve(Response.json({ count: 1 }));
    if (path.endsWith('/staff/work-items')) return Promise.resolve(Response.json({ items: [{
      aggregateType: 'HOLD', aggregateId: holdId, workType: 'READY', branchId,
      createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:01:00Z',
    }], page: 0, size: 20, totalElements: 1 }));
    if (path.endsWith(`/branches/${branchId}`)) return Promise.resolve(Response.json({
      id: branchId, code: 'A', name: 'Chi nhánh A', status: 'ACTIVE',
    }));
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/hop-thu']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByRole('heading', { name: 'Hộp thư công việc' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Hold sẵn sàng nhận sách' })).toBeInTheDocument();
  expect(await screen.findByText('Chi nhánh A')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Mở nghiệp vụ' });
  expect(link).toHaveAttribute('href', `/nhan-vien/giu-cho?status=READY&branchId=${branchId}&holdId=${holdId}`);
  expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/staff/work-items'))).toBe(true);
});
