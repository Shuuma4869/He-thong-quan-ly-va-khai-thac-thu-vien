import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '11111111-1111-4111-8111-111111111111', copyId = '22222222-2222-4222-8222-222222222222';
const branchId = '33333333-3333-4333-8333-333333333333', readerId = '44444444-4444-4444-8444-444444444444';
const holdId = '55555555-5555-4555-8555-555555555555';
const time = '2026-10-25T00:00:00Z';
const session = { accessToken: 'test-only', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id, memberCode: 'TT1', email: 'staff@example.test', fullName: 'Thủ thư', roles: ['LIBRARIAN'] } };
const member = { userId: readerId, memberCode: 'TV42', fullName: 'Nguyễn An', status: 'ACTIVE' };
const initialCopy = { id: copyId, editionId: id, bookTitle: 'Sách tại quầy', isbn13: null, shelfId: id,
  shelfCode: 'K1', branchId, barcode: "A_%'/?", status: 'AVAILABLE', version: 7 };
const initialLoan = { loanId: id, copyId, readerId, editionId: id, branchId, bookTitle: initialCopy.bookTitle, barcode: initialCopy.barcode,
  branchName: 'Chi nhánh A', borrowedAt: time, dueAt: '2026-11-08T00:00:00Z', returnedAt: null as string | null, renewalCount: 0,
  version: 2, copyVersion: 8, status: 'ACTIVE', overdue: false };
const hold = { id: holdId, readerId, bookId: id, editionId: id, branchId, status: 'READY', queuedAt: time,
  readyAt: time, expiresAt: '2030-01-01T00:00:00Z', closedAt: null, copyId, loanId: null, version: 1,
  policyVersion: 'test-v1', pickupSeconds: 172800 };
const readyCopy = { ...initialCopy, status: 'ON_HOLD', version: 8 };
const staffHoldItem = { hold, queuePosition: null, readerMemberCode: 'TV42', readerName: 'Nguyễn An',
  bookTitle: initialCopy.bookTitle, isbn13: null, branchCode: 'A', branchName: 'Chi nhánh A',
  copyBarcode: initialCopy.barcode, copyStatus: 'ON_HOLD', copyVersion: 8 };
const page = (items: unknown[]) => ({ items, page: { number: 0, size: 10, totalElements: items.length, totalPages: items.length ? 1 : 0 } });
let copy = { ...initialCopy }, loans: typeof initialLoan[] = [], memberStatus = 'ACTIVE';
let fetchMock: ReturnType<typeof vi.fn>;
function result(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/refresh')) return Response.json(session);
  if (path.endsWith('/members')) return Response.json(page([{ ...member, status: memberStatus }]));
  if (path.endsWith('/copies/by-barcode')) return Response.json(copy);
  if (path.endsWith(`/copies/${copyId}`)) return Response.json(readyCopy);
  if (path.endsWith('/staff/holds/summary')) return Response.json({ waiting: 0, ready: 1, expiringSoon: 0, fulfilledLast30Days: 0, needsAttention: 0 });
  if (path.endsWith('/staff/holds')) return Response.json(page([staffHoldItem]));
  if (path.endsWith(`/staff/holds/${holdId}`)) return Response.json({ item: staffHoldItem, history: [{ version: 1, eventType: 'HOLD_READY', actorId: null, occurredAt: time }] });
  if (path.endsWith(`/branches/${branchId}`)) return Response.json({ id: branchId, code: 'A', name: 'Chi nhánh A', status: 'ACTIVE' });
  if (path.endsWith('/return')) { loans = [{ ...initialLoan, version: 3, returnedAt: time, status: 'RETURNED' }]; return Response.json(loans[0]); }
  if (path.endsWith('/renew')) { loans = [{ ...initialLoan, version: 3, renewalCount: 1 }]; return Response.json(loans[0]); }
  if (path.endsWith('/loans') && init.method === 'POST') { loans = [{ ...initialLoan }]; copy = { ...copy, status: 'ON_LOAN', version: 8 }; return Response.json(loans[0], { status: 201 }); }
  if (path.endsWith('/loans')) return Response.json({ ...page(loans), asOf: time });
  if (path.endsWith('/reports/circulation')) return Response.json({ from: time, to: '2026-11-01T00:00:00Z', asOf: time, timezone: 'Asia/Ho_Chi_Minh',
    totals: { borrowed: 2, active: 1, returned: 1, overdue: 0 }, items: [] });
  return Response.json(page([]));
}
function app(path = '/nhan-vien/luu-thong') { return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter/></MemoryRouter></AppProviders>); }
function commands() { return fetchMock.mock.calls.filter(([url, init]) => init.method === 'POST' && !url.endsWith('/auth/refresh')); }
async function selectAndScan() {
  fireEvent.click(await screen.findByRole('button', { name: 'Tìm thành viên' }));
  fireEvent.click(await screen.findByRole('button', { name: /TV42 · Nguyễn An/ }));
  fireEvent.change(screen.getByLabelText('Mã vạch bản sách'), { target: { value: initialCopy.barcode } });
  fireEvent.click(screen.getByRole('button', { name: 'Tra bản sách' }));
  await screen.findByRole('button', { name: 'Cho mượn bản sách này' });
}
beforeEach(() => {
  copy = { ...initialCopy }; loans = []; memberStatus = 'ACTIVE';
  fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(result(url, init))); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('quầy xác nhận đúng người, bản, chi nhánh và version; không gửi hai lần', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith('/loans') && init.method === 'POST'
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(result(url, init)));
  app(); await selectAndScan();
  expect(new URL(fetchMock.mock.calls.find(([url]) => url.includes('/copies/by-barcode'))![0]).searchParams.get('barcode')).toBe(initialCopy.barcode);
  fireEvent.click(screen.getByRole('button', { name: 'Cho mượn bản sách này' }));
  expect(commands()).toHaveLength(0);
  expect(screen.getByRole('group', { name: 'Xác nhận cho mượn' })).toHaveTextContent('TV42 · Nguyễn An');
  const submit = screen.getByRole('button', { name: 'Xác nhận cho mượn' }); fireEvent.click(submit); fireEvent.click(submit);
  await waitFor(() => expect(commands()).toHaveLength(1));
  expect(JSON.parse(commands()[0][1].body)).toMatchObject({ copyId, readerId, branchId, copyVersion: 7 });
  expect(screen.getByLabelText('Mã vạch bản sách')).toBeDisabled();
  await act(async () => finish(Response.json(initialLoan, { status: 201 })));
  expect(await screen.findByText(/Đã cho mượn. Hạn trả/)).toBeInTheDocument();
});
it('không tạo Loan trước bàn giao; workspace giữ chỗ xác nhận qua Core với Copy đã phân bổ', async () => {
  app('/nhan-vien/giu-cho');
  await screen.findByRole('heading', { name: 'Quản lý giữ chỗ' });
  expect(await screen.findByText('Sách tại quầy')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mở chi tiết' }));
  const pickup = await screen.findByRole('button', { name: 'Xác nhận đã giao sách' });
  expect(commands()).toHaveLength(0);
  fireEvent.click(pickup);
  await screen.findByText(/Đã bàn giao\. Hạn trả:/);
  expect(commands()).toHaveLength(1);
  expect(commands()[0][0]).toContain('/loans');
  expect(JSON.parse(commands()[0][1].body)).toMatchObject({ copyId, readerId, branchId, copyVersion: 8 });
});
it('deep link từ work inbox mở đúng Hold, chi nhánh và hàng trạng thái READY', async () => {
  app(`/nhan-vien/giu-cho?status=READY&branchId=${branchId}&holdId=${holdId}`);
  expect(await screen.findByRole('heading', { name: 'Quản lý giữ chỗ' })).toBeInTheDocument();
  expect(await screen.findByText('Xác nhận bàn giao')).toBeInTheDocument();
  const listRequest = fetchMock.mock.calls.find(([url]) => String(url).includes('/staff/holds?'));
  expect(listRequest).toBeDefined();
  const params = new URL(String(listRequest![0])).searchParams;
  expect(params.get('status')).toBe('READY');
  expect(params.get('branchId')).toBe(branchId);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/staff/holds/${holdId}`),
    expect.objectContaining({ method: 'GET' }));
});
it('lọc giữ chỗ theo ngày nghiệp vụ Việt Nam, gồm trọn ngày kết thúc', async () => {
  app('/nhan-vien/giu-cho');
  await screen.findByRole('heading', { name: 'Quản lý giữ chỗ' });
  fireEvent.change(screen.getByLabelText('Tạo từ ngày'), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText('Đến hết ngày'), { target: { value: '2026-10-26' } });
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng bộ lọc/ }));
  await waitFor(() => {
    const request = fetchMock.mock.calls.filter(([url]) => String(url).includes('/staff/holds?')).at(-1);
    expect(request).toBeDefined();
    const params = new URL(String(request![0])).searchParams;
    expect(params.get('from')).toBe('2026-10-24T17:00:00.000Z');
    expect(params.get('to')).toBe('2026-10-26T17:00:00.000Z');
  });
});
it('mất phản hồi giữ nguyên giao dịch cho mượn khi thử lại', async () => {
  let first = true;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/loans') && init.method === 'POST' && first) { first = false; return Promise.reject(new TypeError('network')); }
    return Promise.resolve(result(url, init));
  });
  app(); await selectAndScan(); fireEvent.click(screen.getByRole('button', { name: 'Cho mượn bản sách này' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận cho mượn' }));
  const retry = await screen.findByRole('button', { name: 'Thử lại yêu cầu cho mượn' });
  expect(screen.queryByRole('button', { name: 'Hủy xác nhận' })).not.toBeInTheDocument();
  fireEvent.click(retry); await screen.findByText(/Đã cho mượn. Hạn trả/);
  expect(commands()).toHaveLength(2); expect(commands()[0][1].body).toBe(commands()[1][1].body);
});
it.each(['LOCKED', 'DISABLED'])('chặn cho mượn cho thành viên %s nhưng vẫn cho xem lịch sử', async status => {
  memberStatus = status; app(); await selectAndScan();
  expect(screen.getByRole('button', { name: 'Cho mượn bản sách này' })).toBeDisabled();
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/loans?') && url.includes(`readerId=${readerId}`))).toBe(true);
});
it('tìm lượt theo bản đã quét, bỏ bộ lọc người trước đó để nhận trả đúng bản', async () => {
  app(); await selectAndScan(); fireEvent.click(screen.getByRole('button', { name: 'Tìm lượt đang mượn của bản này' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
    const parsed = new URL(url); return parsed.pathname.endsWith('/loans') && parsed.searchParams.get('copyId') === copyId && !parsed.searchParams.has('readerId');
  })).toBe(true));
  expect(screen.queryByText(/Đã chọn: TV42/)).not.toBeInTheDocument();
});
it.each(['return', 'renew'])('thao tác %s cần xác nhận và gửi version đã đọc', async action => {
  loans = [{ ...initialLoan }]; app();
  fireEvent.click(await screen.findByRole('button', { name: action === 'return' ? 'Nhận trả' : 'Gia hạn tại quầy' }));
  expect(commands()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: action === 'return' ? 'Xác nhận nhận trả' : 'Xác nhận gia hạn tại quầy' }));
  await waitFor(() => expect(commands()).toHaveLength(1));
  expect(commands()[0][0]).toContain(`/loans/${id}/${action}`);
  expect(JSON.parse(commands()[0][1].body)).toMatchObject(action === 'return' ? { branchId, version: 2 } : { version: 2 });
  await screen.findByText(action === 'return' ? /Chi nhánh A · Đã trả/ : /Đã gia hạn 1 lần/);
});
it('xung đột nhận trả không báo thành công và giữ nguyên lượt mượn', async () => {
  loans = [{ ...initialLoan }];
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(url.endsWith('/return')
    ? Response.json({ detail: 'Lượt mượn đã thay đổi, hãy tải lại.' }, { status: 409 }) : result(url, init)));
  app(); fireEvent.click(await screen.findByRole('button', { name: 'Nhận trả' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận trả' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Lượt mượn đã thay đổi');
  expect(screen.queryByText('Đã ghi nhận giao dịch.')).not.toBeInTheDocument(); expect(commands()).toHaveLength(1);
});
it('báo cáo và CSV giữ bộ lọc đã áp dụng, không lấy các ngày đang sửa dở', async () => {
  const create = vi.fn(() => 'blob:test');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(url.includes('/reports/circulation.csv?')
    ? new Response('date,borrowed\r\n2026-10-25,2', { headers: { 'Content-Type': 'text/csv;charset=UTF-8' } }) : result(url, init)));
  app('/nhan-vien/bao-cao-luu-thong');
  fireEvent.change(await screen.findByLabelText('Từ ngày (bao gồm)'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Đến ngày (không bao gồm)'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
  const region = await screen.findByRole('region', { name: 'Kết quả báo cáo' });
  expect(screen.getByText(/Số đã trả không phải/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Từ ngày (bao gồm)'), { target: { value: '2026-09-01' } });
  fireEvent.click(within(region).getByRole('button', { name: 'Tải CSV theo bộ lọc này' }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const csv = new URL(fetchMock.mock.calls.find(([url]) => url.includes('/reports/circulation.csv?'))![0]);
  expect(csv.searchParams.get('from')).toBe('2026-09-30T17:00:00.000Z');
  expect(csv.searchParams.has('token')).toBe(false);
});

it('rời báo cáo hủy tải CSV, phản hồi đến muộn không tạo file', async () => {
  const create = vi.fn(() => 'blob:late');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
  let finish!: (response: Response) => void; let signal: AbortSignal | null | undefined;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.includes('/reports/circulation.csv?')) { signal = init.signal; return new Promise(resolve => { finish = resolve; }); }
    return Promise.resolve(result(url, init));
  });
  const view = app('/nhan-vien/bao-cao-luu-thong');
  fireEvent.change(await screen.findByLabelText('Từ ngày (bao gồm)'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Đến ngày (không bao gồm)'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tải CSV theo bộ lọc này' }));
  await waitFor(() => expect(signal).toBeDefined()); view.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => finish(new Response('private report', { headers: { 'Content-Type': 'text/csv' } })));
  expect(create).not.toHaveBeenCalled();
});
it.each(['/nhan-vien/luu-thong', '/nhan-vien/bao-cao-luu-thong'])('Reader không mở được trang staff %s', async path => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(url.endsWith('/auth/refresh')
    ? Response.json({ ...session, user: { ...session.user, roles: ['READER'] } }) : result(url, init)));
  app(path); await screen.findByRole('heading', { name: '403 · Không có quyền truy cập' });
  expect(fetchMock.mock.calls.some(([url]) => /\/(loans|members|reports\/circulation)(\?|$)/.test(url))).toBe(false);
});
