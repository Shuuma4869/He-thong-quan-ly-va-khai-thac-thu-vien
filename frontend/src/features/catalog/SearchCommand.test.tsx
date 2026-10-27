import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SearchCommand } from './SearchCommand';

const bookId = '11111111-1111-4111-8111-111111111111';
const authorId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const page = (items: unknown[]) => ({ items, page: { number: 0, size: 4, totalElements: items.length, totalPages: 1 } });
function CurrentLocation() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function setup() {
  const fetchMock = vi.fn((url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/books')) return Promise.resolve(Response.json(page([
      { id: bookId, title: 'Đường về nhà', description: null, authors: [{ id: authorId, name: 'Nguyễn Bình' }], categories: [] },
    ])));
    if (path.endsWith('/authors')) return Promise.resolve(Response.json(page([{ id: authorId, name: 'Nguyễn Bình' }])));
    if (path.endsWith('/categories')) return Promise.resolve(Response.json(page([{ id: categoryId, name: 'Truyện dài' }])));
    return Promise.resolve(Response.json({}, { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SearchCommand/><Routes>
    <Route path="*" element={<CurrentLocation/>}/>
  </Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

it('gợi ý ba loại dữ liệu từ server, giới hạn kết quả và điều hướng bằng bàn phím', async () => {
  const keyboard = userEvent.setup();
  const fetchMock = setup();
  await keyboard.keyboard('{Control>}k{/Control}');
  const input = screen.getByRole('combobox', { name: 'Tìm sách, tác giả và thể loại' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Nguyễn' } });
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(3);
  expect(options.map(option => option.textContent)).toEqual([
    expect.stringContaining('Đường về nhà'), expect.stringContaining('Nguyễn Bình'), expect.stringContaining('Truyện dài'),
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [url] of fetchMock.mock.calls) expect(new URL(url).searchParams.get('size')).toBe('4');
  await keyboard.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(screen.getByTestId('location')).toHaveTextContent(`/tac-gia/${authorId}`);
  expect(input).toHaveAttribute('aria-expanded', 'false');
});

it('Escape đóng gợi ý và Enter mở trang tìm kiếm với URL đúng', async () => {
  const keyboard = userEvent.setup(); setup();
  const input = screen.getByRole('combobox', { name: 'Tìm sách, tác giả và thể loại' });
  input.focus();
  fireEvent.change(input, { target: { value: 'Đường' } });
  await screen.findAllByRole('option');
  await keyboard.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await keyboard.keyboard('{Enter}');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sach?query=%C4%90%C6%B0%E1%BB%9Dng&sort=relevance'));
});
