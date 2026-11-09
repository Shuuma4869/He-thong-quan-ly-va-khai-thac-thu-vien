import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { focusManager } from '@tanstack/react-query';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '1f6322af-8f00-4cb0-8b06-c6f6934e268a';
const itemId = '6dff85ce-9a56-4cca-845d-a6f5d36cbe32';
const user = { id, memberCode: 'TV-1234', email: 'reader@example.test', fullName: 'Người đọc', roles: ['READER'] };
const session = { accessToken: 'reader-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const item = { id: itemId, aggregateType: 'HOLD', aggregateId: '4e6fa4d1-bdd9-429a-ae84-957eb9af60a8', eventType: 'HOLD_READY',
  occurredAt: '2026-10-28T00:00:00Z', receivedAt: '2026-10-28T00:00:01Z',
  expiresAt: '2026-10-30T00:00:00Z', readAt: null };

afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined); });

it('counter tính cả hộp thư và cập nhật trang hiện tại khi trở lại cửa sổ', async () => {
  let readElsewhere = false;
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    if (url.includes('/unread-count')) return Promise.resolve(Response.json({ count: readElsewhere ? 20 : 21 }));
    if (url.includes('/me/notifications?')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return Promise.resolve(Response.json({ items: [{ ...item,
        id: page === 0 ? itemId : '7e6fa4d1-bdd9-429a-ae84-957eb9af60a8',
        readAt: page === 1 && readElsewhere ? '2026-11-06T00:00:00Z' : null }], page, size: 20, totalElements: 21 }));
    }
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/thong-bao']}><AppRouter/></MemoryRouter></AppProviders>);
  await screen.findByText('21 thông báo chưa đọc');
  fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));
  await screen.findByText('Trang 2');
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=1'))).toBe(true));
  await act(async () => { focusManager.setFocused(false); readElsewhere = true; focusManager.setFocused(true); });
  expect(await screen.findByText('20 thông báo chưa đọc')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Đánh dấu đã đọc' })).not.toBeInTheDocument());
});

it('đọc lại counter sau khi danh sách nhận sự kiện mới giữa hai request', async () => {
  let delivered = false;
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    if (url.includes('/unread-count')) return Promise.resolve(Response.json({ count: delivered ? 1 : 0 }));
    if (url.includes('/me/notifications?')) {
      delivered = true;
      return Promise.resolve(Response.json({ items: [item], page: 0, size: 20, totalElements: 1 }));
    }
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/thong-bao']}><AppRouter/></MemoryRouter></AppProviders>);
  await screen.findByText('Sách đã sẵn sàng nhận');
  expect(await screen.findByText('1 thông báo chưa đọc')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/unread-count')).length).toBeGreaterThan(1);
});

it('tải lại dữ liệu sau lỗi đánh dấu đọc thực sự gọi lại API', async () => {
  let read = false;
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(
    url.endsWith('/auth/refresh') ? Response.json(session)
      : url.includes('/unread-count') ? Response.json({ count: read ? 0 : 1 })
        : url.endsWith(`/${itemId}/read`) && init.method === 'PATCH'
          ? (read = true, Response.json({ detail: 'Không nhận được biên nhận.' }, { status: 503 }))
          : url.includes('/me/notifications?') ? Response.json({ items: [{ ...item, readAt: read ? '2026-10-28T01:00:00Z' : null }], page: 0, size: 20, totalElements: 1 })
            : Response.json({})));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/thong-bao']}><AppRouter/></MemoryRouter></AppProviders>);
  fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tải lại dữ liệu' }));
  expect(await screen.findByText('0 thông báo chưa đọc')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Đánh dấu đã đọc' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/me/notifications?')).length).toBe(2);
});

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
  expect(screen.getByRole('link', { name: 'Mở giao dịch' })).toHaveAttribute(
    'href', `/muon-va-giu-cho?holdId=${item.aggregateId}#holds`);
  fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/me/notifications/${itemId}/read`) && init.method === 'PATCH')).toBe(true));
  expect(await screen.findByText('0 thông báo chưa đọc')).toBeInTheDocument();
});
