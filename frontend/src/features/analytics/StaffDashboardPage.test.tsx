import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '11111111-1111-4111-8111-111111111111';
const user = { id, memberCode: 'TV-1', email: 'staff@example.test', fullName: 'Thủ thư demo', roles: ['LIBRARIAN'] };
const page = (totalElements: number) => ({ items: [], page: { number: 0, page: 0, size: 20,
  totalElements, totalPages: Math.ceil(totalElements / 20) } });

afterEach(() => vi.unstubAllGlobals());

it('dashboard hiển thị số liệu API thật, không dùng KPI tĩnh', async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({
      accessToken: 'test-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user,
    }));
    if (url.includes('/public/catalog/books?')) return Promise.resolve(Response.json(page(32)));
    if (url.includes('/copies?')) return Promise.resolve(Response.json(page(64)));
    if (url.includes('/inventory-sessions?')) return Promise.resolve(Response.json(page(2)));
    return Promise.resolve(Response.json({ detail: 'Not found' }, { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/bang-dieu-khien']}><AppRouter /></MemoryRouter></AppProviders>);
  expect(await screen.findByText('Tác phẩm trong danh mục')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
  expect(screen.queryByText('Sẵn sàng cấu hình')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/inventory-sessions?'))).toBe(true);
});
