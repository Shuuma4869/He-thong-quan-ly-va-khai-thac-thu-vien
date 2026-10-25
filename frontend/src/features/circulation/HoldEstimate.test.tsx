import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HoldEstimate } from './HoldEstimate';

const holdId = '11111111-1111-4111-8111-111111111111';
const estimate = { holdId, holdVersion: 0, asOf: '2026-10-25T00:00:00Z', estimatedAt: '2026-11-01T00:00:00Z',
  reason: 'CONDITIONAL', policyVersion: 'dev-v1', compatibleCopies: 1, waitingAhead: 1 };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(async () => Response.json(estimate)); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());
function app() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <HoldEstimate owner="reader" holdId={holdId} version={0}/></QueryClientProvider>); }
it('chỉ tính khi yêu cầu, nói rõ giả định và tính lại từ máy chủ', async () => {
  app(); expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xem thời gian dự kiến' }));
  expect(await screen.findByLabelText('Ước tính giữ chỗ')).toHaveTextContent('chưa phải thông báo đến nhận');
  expect(screen.getByText(/Giả định mọi người phía trước/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tính lại thời gian dự kiến' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
it.each(['OVERDUE_COPY', 'NO_COMPATIBLE_COPY', 'SCOPE_TOO_LARGE', 'READY'])('không hiển thị ngày phỏng đoán với lý do %s', async reason => {
  fetchMock.mockResolvedValue(Response.json({ ...estimate, reason, estimatedAt: null })); app();
  fireEvent.click(screen.getByRole('button', { name: 'Xem thời gian dự kiến' }));
  await screen.findByLabelText('Ước tính giữ chỗ'); expect(screen.queryByText(/Có thể đến lượt khoảng/)).not.toBeInTheDocument();
});
it('version đã đổi yêu cầu tải lại trạng thái, không sửa hay hủy giữ chỗ', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...estimate, holdVersion: 2, reason: 'CLOSED', estimatedAt: null })); app();
  fireEvent.click(screen.getByRole('button', { name: 'Xem thời gian dự kiến' }));
  expect(await screen.findByText(/Yêu cầu đã đổi kể từ/)).toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
});
