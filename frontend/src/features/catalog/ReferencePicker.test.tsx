import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AppProviders } from '../../app/providers/AppProviders';
import { ReferencePicker } from './ReferencePicker';

const id = '22222222-2222-4222-8222-222222222222';
const author = { id, name: 'Nguyễn Bình' };

afterEach(() => vi.unstubAllGlobals());

it('Enter trong lúc chờ từ khóa mới không chọn kết quả cũ hoặc gửi form cha', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
    url.endsWith('/auth/refresh') ? Response.json({}, { status: 401 })
      : Response.json({ items: [author], page: { number: 0, size: 20, totalElements: 1, totalPages: 1 } }))));
  const choose = vi.fn();
  render(<AppProviders><ReferencePicker label="Tác giả" resource="authors" value={[]} onChange={choose}/></AppProviders>);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tác giả' }));
  await screen.findByRole('option', { name: 'Nguyễn Bình' });
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'Tên khác' } });
  const allowedDefault = fireEvent.keyDown(input, { key: 'Enter', cancelable: true });
  expect(choose).not.toHaveBeenCalled();
  expect(allowedDefault).toBe(false);
  expect(input).not.toHaveAttribute('aria-activedescendant');
});

it('Enter khi không có lựa chọn không gửi form cha', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
    url.endsWith('/auth/refresh') ? Response.json({}, { status: 401 })
      : Response.json({ items: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 } }))));
  render(<AppProviders><ReferencePicker label="Tác giả" resource="authors" value={[]} onChange={vi.fn()}/></AppProviders>);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tác giả' }));
  await screen.findByRole('listbox');
  expect(fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', cancelable: true })).toBe(false);
});

it('tìm tác giả ở server, chọn bằng bàn phím và xóa chip', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({}, { status: 401 }));
    if (url.endsWith(`/authors/${id}`)) return Promise.resolve(Response.json(author));
    const query = new URL(url).searchParams.get('query');
    return Promise.resolve(Response.json({ items: query === 'Nguyen' ? [author] : [],
      page: { number: 0, size: 20, totalElements: query === 'Nguyen' ? 1 : 0,
        totalPages: query === 'Nguyen' ? 1 : 0 } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  function Example() {
    const [ids, setIds] = useState<string[]>([]);
    return <ReferencePicker label="Tác giả" resource="authors" value={ids} onChange={setIds} />;
  }
  render(<AppProviders><Example /></AppProviders>);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tác giả' }));
  const search = screen.getByRole('combobox', { name: 'Tìm trong tác giả' });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: 'Nguyen' } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
    new URL(String(url)).searchParams.get('query') === 'Nguyen')).toBe(true));
  expect(await screen.findByRole('option', { name: 'Nguyễn Bình' })).toBeInTheDocument();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(await screen.findByText('Nguyễn Bình')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Bỏ chọn Tác giả ${id}` }));
  expect(screen.queryByText('Nguyễn Bình')).not.toBeInTheDocument();
});
