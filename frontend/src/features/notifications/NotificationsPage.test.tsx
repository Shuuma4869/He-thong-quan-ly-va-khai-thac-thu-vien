import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '1f6322af-8f00-4cb0-8b06-c6f6934e268a';
const itemId = '6dff85ce-9a56-4cca-845d-a6f5d36cbe32';
const user = { id, memberCode: 'TV-1234', email: 'reader@example.test', fullName: 'Người đọc', roles: ['READER'] };
const session = { accessToken: 'reader-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const item = { id: itemId, holdId: '4e6fa4d1-bdd9-429a-ae84-957eb9af60a8', eventType: 'HOLD_READY',
  occurredAt: '2026-10-28T00:00:00Z', receivedAt: '2026-10-28T00:00:01Z',
  expiresAt: '2026-10-30T00:00:00Z', readAt: null };

afterEach(() => vi.unstubAllGlobals());

it('người đọc xem thông báo giữ chỗ và đánh dấu đã đọc bằng API Insight', async () => {
  let read = false;
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(
    String(url).endsWith('/auth/refresh') ? Response.json(session)
      : String(url).includes('/me/notifications/unread-count') ? Response.json({ count: read ? 0 : 1 })
        : String(url).endsWith(`/me/notifications/${itemId}/read`) && init.method === 'PATCH'
          ? (read = true, new Response(null, { status: 204 }))
          : String(url).includes('/me/notifications?') ? Response.json({ items: [{ ...item,
            readAt: read ? '2026-10-28T01:00:00Z' : null }], page: 0, size: 20, totalElements: 1 })
            : Response.json({})));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/thong-bao']}><AppRouter/></MemoryRouter></AppProviders>);
  expect(await screen.findByRole('heading', { name: 'Thông báo' })).toBeInTheDocument();
  expect(await screen.findByText('Sách đã sẵn sàng nhận')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/me/notifications/${itemId}/read`) && init.method === 'PATCH')).toBe(true));
  expect(await screen.findByText('0 thông báo chưa đọc')).toBeInTheDocument();
});
