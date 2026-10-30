import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { HoldActivityReportPage } from './HoldActivityReportPage';
const branchId = '11111111-1111-4111-8111-111111111111';
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'staff', roles: ['LIBRARIAN'] } }) }));
function setup(rows: number, failure = false) {
  const mock = vi.fn((url: string) => {
    if (url.includes('/branches/')) return Promise.resolve(Response.json({ id: branchId, code: 'HN', name: 'Thư viện Hà Nội', address: '', status: 'ACTIVE', version: 0 }));
    if (failure) return Promise.resolve(Response.json({ detail: 'Thu hẹp bộ lọc báo cáo.' }, { status: 422 }));
    return Promise.resolve(Response.json({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z',
      timezone: 'Asia/Ho_Chi_Minh', branchId: null, bookId: null, totalEvents: rows,
      items: Array.from({ length: rows }, (_, index) => ({ date: `2026-01-${String(index % 28 + 1).padStart(2, '0')}`,
        branchId, eventType: `EVENT_${index}`, eventCount: 1 })) }));
  });
  vi.stubGlobal('fetch', mock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><HoldActivityReportPage/></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Từ ngày (bao gồm)'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('Đến ngày (không bao gồm)'), { target: { value: '2026-02-01' } });
  return mock;
}
afterEach(() => vi.unstubAllGlobals());
it('không gọi báo cáo trước khi chọn kỳ; phân trang 50 nhóm và giữ dữ liệu sự kiện chưa biết', async () => {
  const mock = setup(51);
  expect(mock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xem hoạt động giữ chỗ' }));
  await screen.findByText('51 sự kiện');
  expect(screen.getAllByRole('row')).toHaveLength(51);
  expect(screen.queryByText('EVENT_50')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('EVENT_50')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
});
it('phân biệt kết quả rỗng với lỗi 422', async () => {
  setup(0);
  fireEvent.click(screen.getByRole('button', { name: 'Xem hoạt động giữ chỗ' }));
  expect(await screen.findByText('Không có sự kiện giữ chỗ trong khoảng thời gian và bộ lọc này.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('lỗi không biến thành số liệu bằng không', async () => {
  setup(0, true);
  fireEvent.click(screen.getByRole('button', { name: 'Xem hoạt động giữ chỗ' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.queryByText('0 sự kiện')).not.toBeInTheDocument();
});
