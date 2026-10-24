import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '11111111-1111-4111-8111-111111111111';
const editionId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333';
const holdId = '44444444-4444-4444-8444-444444444444';
const time = '2026-10-24T00:00:00Z';
const session = { accessToken: 'test-only', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id, memberCode: 'TV1', email: 'reader@example.test', fullName: 'Bạn đọc', roles: ['READER'] } };
const book = { id, title: 'Sách cần mượn', description: null, authors: [], categories: [] };
const edition = { id: editionId, bookId: id, bookTitle: book.title, isbn13: '9786040000000', publisherId: null, publisherName: null, publicationYear: 2026, language: 'vi' };
const initialLoan = { loanId: id, copyId: editionId, readerId: id, editionId, branchId, bookTitle: book.title, barcode: 'B001', branchName: 'Chi nhánh A',
  borrowedAt: time, dueAt: '2026-11-07T00:00:00Z', returnedAt: null, renewalCount: 0, version: 0, copyVersion: 2, status: 'ACTIVE', overdue: false };
const initialHold = { id: holdId, readerId: id, bookId: id, editionId, branchId, status: 'WAITING', queuedAt: time, readyAt: null,
  expiresAt: null, closedAt: null, copyId: null, loanId: null, version: 0, policyVersion: 'dev-v1', pickupSeconds: 172800 };
const page = (items: unknown[]) => ({ items, page: { number: 0, size: 10, totalElements: items.length, totalPages: items.length ? 1 : 0 } });
let loan = { ...initialLoan };
let hold = { ...initialHold };
let fetchMock: ReturnType<typeof vi.fn>;
function result(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/refresh')) return Response.json(session);
  if (path.endsWith(`/books/${id}`)) return Response.json(book);
  if (path.endsWith(`/editions/${editionId}`)) return Response.json(edition);
  if (path.endsWith('/holds/pickup-branches')) return Response.json(page([{ id: branchId, code: 'A', name: 'Chi nhánh A' }]));
  if (path.endsWith('/me/loans')) return Response.json({ ...page([loan]), asOf: time });
  if (path.endsWith('/me/holds')) return Response.json(page([{ hold, bookTitle: book.title, branchName: 'Chi nhánh A', queuePosition: hold.status === 'WAITING' ? 1 : null }]));
  if (path.endsWith('/renew')) { loan = { ...loan, version: 1, renewalCount: 1, dueAt: '2026-11-14T00:00:00Z' }; return Response.json(loan); }
  if (path.endsWith('/cancel')) { hold = { ...hold, status: 'CANCELLED', version: 1 }; return Response.json(hold); }
  if (path.endsWith('/holds') && init.method === 'POST') return Response.json(hold, { status: 201 });
  return Response.json(page([]));
}
function app(path = '/muon-va-giu-cho') { return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter/></MemoryRouter></AppProviders>); }
function commands() { return fetchMock.mock.calls.filter(([url, init]) => init.method === 'POST' && !url.endsWith('/auth/refresh')); }
async function chooseBranch() {
  fireEvent.click(await screen.findByRole('button', { name: 'Chọn chi nhánh nhận' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'A · Chi nhánh A' }));
}
beforeEach(() => {
  loan = { ...initialLoan }; hold = { ...initialHold };
  fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(result(url, init))); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('giữ đúng ấn bản mặc định, chỉ gọi API chi nhánh đọc và chặn gửi hai lần', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/holds') && init.method === 'POST'
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(result(url, init)));
  app(`/giu-cho/${id}/${editionId}`); await chooseBranch();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  const submit = screen.getByRole('button', { name: 'Xác nhận giữ chỗ' });
  fireEvent.click(submit); fireEvent.click(submit);
  await waitFor(() => expect(submit).toBeDisabled()); expect(commands()).toHaveLength(1);
  expect(JSON.parse(commands()[0][1].body)).toMatchObject({ bookId: id, editionId, branchId, anyEdition: false });
  expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/branches'))).toBe(false);
  await act(async () => finish(Response.json(hold, { status: 201 })));
  expect(await screen.findByText(/Đã ghi nhận: Đang chờ/)).toBeInTheDocument();
  expect(submit).toBeDisabled();
});

it('chỉ gửi bất kỳ ấn bản khi bạn đọc chủ động chọn', async () => {
  app(`/giu-cho/${id}/${editionId}`); await chooseBranch();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận giữ chỗ' }));
  await screen.findByText(/Đã ghi nhận/);
  expect(JSON.parse(commands()[0][1].body)).toMatchObject({ editionId: null, anyEdition: true });
});

it('mất phản hồi giữ nguyên requestId và khóa sửa phạm vi khi thử lại', async () => {
  let first = true;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/holds') && init.method === 'POST' && first) { first = false; return Promise.reject(new TypeError('network')); }
    return Promise.resolve(result(url, init));
  });
  app(`/giu-cho/${id}/${editionId}`); await chooseBranch();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận giữ chỗ' }));
  const retry = await screen.findByRole('button', { name: 'Thử lại đúng yêu cầu' });
  expect(screen.getByRole('checkbox')).toBeDisabled();
  fireEvent.click(retry); await screen.findByText(/Đã ghi nhận/);
  expect(commands()).toHaveLength(2);
  expect(JSON.parse(commands()[0][1].body)).toEqual(JSON.parse(commands()[1][1].body));
});

it('gia hạn cần xác nhận, gửi version đã đọc và tải lại hạn trả thật', async () => {
  app(); fireEvent.click(await screen.findByRole('button', { name: 'Gia hạn' }));
  expect(commands()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gia hạn' }));
  expect(await screen.findByText('Đã gia hạn 1 lần')).toBeInTheDocument();
  expect(JSON.parse(commands()[0][1].body)).toMatchObject({ version: 0 });
  expect(commands()[0][0]).toContain(`/loans/${id}/renew`);
});

it('hủy giữ chỗ có xác nhận và không tự báo thành công khi server từ chối', async () => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(url.endsWith('/cancel')
    ? Response.json({ detail: 'Giữ chỗ đã thay đổi, hãy tải lại.' }, { status: 409 }) : result(url, init)));
  app(); fireEvent.click(await screen.findByRole('button', { name: 'Hủy giữ chỗ' }));
  expect(commands()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy giữ chỗ' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Giữ chỗ đã thay đổi');
  expect(screen.queryByText(/Đã hủy/)).not.toBeInTheDocument();
  expect(commands()).toHaveLength(1);
});

it('hủy thành công cập nhật trạng thái, bộ lọc và phân trang gửi riêng cho Loan', async () => {
  app(); fireEvent.click(await screen.findByRole('button', { name: 'Hủy giữ chỗ' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy giữ chỗ' }));
  await screen.findByText(/Chi nhánh A · Đã hủy/);
  expect(screen.queryByRole('button', { name: 'Hủy giữ chỗ' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Trạng thái lượt mượn'), { target: { value: 'OVERDUE' } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/loans?') && url.includes('status=OVERDUE'))).toBe(true));
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/holds?') && url.includes('status='))).toBe(false);
});

it('URL không hợp lệ không gửi query, chưa đăng nhập không đọc lịch sử', async () => {
  const view = app('/muon-va-giu-cho?page=-1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Bộ lọc trong đường dẫn không hợp lệ');
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/loans'))).toBe(false);
  view.unmount(); fetchMock.mockResolvedValue(Response.json({}, { status: 401 }));
  app(); expect(await screen.findByLabelText('Email hoặc mã thành viên')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/holds'))).toBe(false);
});

it.each(['READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'])('chỉ nhắc đến quầy khi còn sẵn sàng nhận: %s', async status => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(new URL(url).pathname.endsWith('/me/holds')
    ? Response.json(page([{ hold: { ...hold, status, expiresAt: '2026-10-27T00:00:00Z' }, queuePosition: null,
      bookTitle: book.title, branchName: 'Chi nhánh A' }])) : result(url, init)));
  app(); await screen.findByText('Giữ đúng ấn bản đã chọn.');
  if (status === 'READY') expect(screen.getByText(/Hạn nhận:/)).toBeInTheDocument();
  else expect(screen.queryByText(/Hạn nhận:/)).not.toBeInTheDocument();
});
