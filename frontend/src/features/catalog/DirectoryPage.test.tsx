import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const authorId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const bookId = '44444444-4444-4444-8444-444444444444';
const page = (items: unknown[]) => ({ items, page: { number: 0, size: 20,
  totalElements: items.length, totalPages: items.length ? 1 : 0 } });
afterEach(() => vi.unstubAllGlobals());

it('duyệt tác giả và tìm theo tên qua API, không lọc riêng trang đầu', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({}, { status: 401 }));
    const query = new URL(url).searchParams.get('query');
    return Promise.resolve(Response.json(page(query === 'Jane' ? [{ id: authorId, name: 'Jane Austen' }] : [])));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/tac-gia']}><AppRouter /></MemoryRouter></AppProviders>);
  fireEvent.change(await screen.findByRole('searchbox', { name: 'Tìm tác giả' }), { target: { value: 'Jane' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
  expect(await screen.findByRole('link', { name: 'Jane Austen' })).toHaveAttribute('href', `/tac-gia/${authorId}`);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
    new URL(String(url)).searchParams.get('query') === 'Jane')).toBe(true));
});

it('trang thể loại lấy sách bằng categoryId thật', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({}, { status: 401 }));
    if (url.endsWith(`/categories/${categoryId}`)) return Promise.resolve(Response.json({ id: categoryId, name: 'Kinh điển' }));
    if (url.includes('/books?')) return Promise.resolve(Response.json(page([{ id: bookId, title: 'Emma',
      description: null, authors: [], categories: [{ id: categoryId, name: 'Kinh điển' }],
      cover: null, averageRating: null, ratingCount: 0 }])));
    return Promise.resolve(Response.json(page([])));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={[`/the-loai/${categoryId}`]}><AppRouter /></MemoryRouter></AppProviders>);
  expect(await screen.findByRole('link', { name: 'Emma' })).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => new URL(String(url)).searchParams.get('categoryId') === categoryId)).toBe(true);
});

it('đợi khôi phục phiên trước khi tải danh mục công khai', async () => {
  let finishRefresh!: (value: Response) => void;
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finishRefresh = resolve; });
    return Promise.resolve(Response.json(page([{ id: authorId, name: 'Jane Austen' }])));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/tac-gia']}><AppRouter /></MemoryRouter></AppProviders>);
  await waitFor(() => expect(finishRefresh).toBeDefined());
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/public/catalog/authors?'))).toBe(false);
  await act(async () => finishRefresh(Response.json({}, { status: 401 })));
  expect(await screen.findByRole('link', { name: 'Jane Austen' })).toBeInTheDocument();
});
