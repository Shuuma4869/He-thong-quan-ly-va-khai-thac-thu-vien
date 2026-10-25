import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const staffId = '11111111-1111-4111-8111-111111111111';
const bookId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const recommendationId = '44444444-4444-4444-8444-444444444444';
const at = '2026-10-25T00:00:00.000Z';
const session = { accessToken: 'test-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id: staffId, memberCode: 'TT1', email: 'staff@example.test', fullName: 'Thủ thư', roles: ['LIBRARIAN'] } };
const signal = { count: 2, basis: 'trong kỳ', source: 'Core', unavailableReason: null };
const component = { count: 2, normalized: 0.5, contribution: 20, weight: 0.4 };
const recommendation = { id: recommendationId, bookId, branchId, windowFrom: at,
  windowTo: '2026-10-26T00:00:00.000Z', snapshotAt: at, sourceContractVersion: 'v1',
  sourceRevision: 'revision-1', scoreVersion: 'v1', score: 42, confidence: 0.8,
  evidence: { copiesOwned: 4, copiesAvailable: 1, waitingHolds: signal, loansStarted: signal,
    favoritesAdded: signal, components: { waitingHolds: component, loansStarted: component,
      favoritesAdded: component }, omittedSignals: ['Tìm kiếm không có kết quả'],
    manualReviewRequired: true, purchaseDecisionAllowed: false },
  state: 'DRAFT', version: 0, createdBy: staffId, createdAt: at,
  reviewedBy: null, reviewedAt: null, reviewReason: null, decisions: [] };
const page = (items: unknown[]) => ({ items, page: { number: 0, size: 20,
  totalElements: items.length, totalPages: items.length ? 1 : 0 } });
let role = 'LIBRARIAN';
let records: Array<Record<string, unknown>> = [];
let fetchMock: ReturnType<typeof vi.fn>;

function app() {
  return render(<AppProviders><MemoryRouter initialEntries={['/nhan-vien/de-xuat-bo-sung']}>
    <AppRouter/>
  </MemoryRouter></AppProviders>);
}

beforeEach(() => {
  role = 'LIBRARIAN'; records = [];
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/auth/refresh'))
      return Response.json({ ...session, user: { ...session.user, roles: [role] } });
    if (path.endsWith('/acquisition/recommendations')) return Response.json(page(records));
    if (path.endsWith(`/acquisition/recommendations/${recommendationId}`))
      return Response.json(records[0]);
    if (path.endsWith(`/acquisition/recommendations/${recommendationId}/decision`) && init.method === 'POST') {
      const body = JSON.parse(init.body as string);
      records = [{ ...records[0], state: body.action, version: 1, reviewReason: body.reason,
        reviewedBy: staffId, reviewedAt: at,
        decisions: [{ id: '55555555-5555-4555-8555-555555555555', recommendationId,
          action: body.action, actorId: staffId, reason: body.reason, version: 1, createdAt: at }] }];
      return Response.json(records[0]);
    }
    if (path.endsWith(`/books/${bookId}`)) return Response.json({ id: bookId, title: 'Sách A',
      description: null, authors: [], categories: [] });
    if (path.endsWith(`/branches/${branchId}`)) return Response.json({ id: branchId, code: 'A',
      name: 'Chi nhánh A', status: 'ACTIVE' });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('hiển thị trạng thái trống đúng khi Core chưa có nguồn tạo đề xuất', async () => {
  app();
  expect(await screen.findByText(/Chưa có đề xuất phù hợp/)).toBeInTheDocument();
  expect(screen.getByText(/chưa tự tạo đề xuất/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Tạo đề xuất/ })).not.toBeInTheDocument();
});

it('nhân viên xem bằng chứng và duyệt với lý do, version hiện tại', async () => {
  records = [recommendation]; app();
  fireEvent.click(await screen.findByRole('button', { name: 'Xem bằng chứng' }));
  expect(await screen.findByText(/Tìm kiếm không có kết quả/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Duyệt nội bộ' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Lý do quyết định'),
    { target: { value: 'Đã đối chiếu dữ liệu tại chi nhánh.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt nội bộ' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/acquisition/recommendations/${recommendationId}/decision`)
      && JSON.parse((init as RequestInit).body as string).expectedVersion === 0)).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Lịch sử quyết định' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Duyệt nội bộ' })).not.toBeInTheDocument();
});

it('reader không được tải trang đề xuất nhân viên', async () => {
  role = 'READER'; app();
  expect(await screen.findByText('403 · Không có quyền truy cập')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/acquisition/recommendations'))).toBe(false);
});
