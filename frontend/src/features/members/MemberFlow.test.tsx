import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id = '1f6322af-8f00-4cb0-8b06-c6f6934e268a';
const user = { id, memberCode: 'TV-1234', email: 'an@example.test', fullName: 'Nguyễn An', roles: ['LIBRARIAN'] };
const session = { accessToken: 'test-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const row = { userId: id, memberCode: 'TV-1234', fullName: 'Nguyễn An', status: 'ACTIVE' };
const profile = { ...row, email: user.email, profile: null };
const account = { userId: id, memberCode: user.memberCode, fullName: user.fullName, email: user.email,
  status: 'ACTIVE', phone: null, pendingEmail: null, pendingEmailRequestedAt: null, emailVerificationEnabled: true };
const page = (items: typeof row[] = [row], number = 0, total = 21) => ({
  items, page: { number, size: 20, totalElements: total, totalPages: Math.ceil(total / 20) },
});
let fetchMock: ReturnType<typeof vi.fn>;
function app(path = '/ho-so') {
  return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter></AppProviders>);
}
beforeEach(() => {
  fetchMock = vi.fn((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? session : url.includes('/members?') ? page() : url.endsWith('/me/account') ? account : profile,
  )));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

it('thủ thư xem căn cứ no-show nhưng không có quyền xác nhận', async () => {
  const holdId = 'a4b701a8-7d74-45b8-b346-1800770d6b34';
  fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? session : url.includes('/members?') ? page([row], 0, 1)
      : url.includes('/hold-reliability') ? { policyVersion: 'advisory-v1', from: '2026-08-01T00:00:00Z',
        to: '2026-10-30T00:00:00Z', confirmed: 0, unreviewed: 1, excused: 0,
        advisoryLevel: 'CLEAR', restrictionsEnabled: false, recentIncidents: [{ holdId,
          readyAt: '2026-10-20T00:00:00Z', expiresAt: '2026-10-22T00:00:00Z',
          closedAt: '2026-10-22T00:00:00Z', decision: 'UNREVIEWED', decisionVersion: 0,
          reason: null, decidedAt: null, decisionPolicyVersion: null }] } : profile)));
  app('/nhan-vien/thanh-vien');
  fireEvent.click(await screen.findByRole('button', { name: 'Xem hết hạn' }));
  const panel = await screen.findByRole('region', { name: 'Rà soát giữ chỗ hết hạn' });
  expect(await within(panel).findByText(/1 chưa rà soát/)).toBeInTheDocument();
  expect(within(panel).getByText(/Không áp dụng giảm ưu tiên/)).toBeInTheDocument();
  expect(within(panel).queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
});

it('quản trị viên gửi quyết định no-show kèm phiên bản và lý do', async () => {
  const holdId = 'a4b701a8-7d74-45b8-b346-1800770d6b34';
  const record = { holdId, readyAt: '2026-10-20T00:00:00Z', expiresAt: '2026-10-22T00:00:00Z',
    closedAt: '2026-10-22T00:00:00Z', decision: 'UNREVIEWED', decisionVersion: 0,
    reason: null, decidedAt: null, decisionPolicyVersion: null };
  const summary = { policyVersion: 'advisory-v1', from: '2026-08-01T00:00:00Z',
    to: '2026-10-30T00:00:00Z', confirmed: 0, unreviewed: 1, excused: 0,
    advisoryLevel: 'CLEAR', restrictionsEnabled: false, recentIncidents: [record] };
  fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? { ...session, user: { ...user, roles: ['ADMIN'] } }
      : url.includes('/members?') ? page([row], 0, 1)
        : url.includes('/no-show') ? { ...summary, confirmed: 1, unreviewed: 0,
          recentIncidents: [{ ...record, decision: 'CONFIRMED', decisionVersion: 1,
            reason: 'Đã đối chiếu tại quầy', decidedAt: '2026-10-28T00:00:00Z', decisionPolicyVersion: 'advisory-v1' }] }
          : url.includes('/hold-reliability') ? summary : profile)));
  app('/nhan-vien/thanh-vien');
  fireEvent.click(await screen.findByRole('button', { name: 'Xem hết hạn' }));
  const panel = await screen.findByRole('region', { name: 'Rà soát giữ chỗ hết hạn' });
  fireEvent.change(await within(panel).findByLabelText('Lý do quyết định'),
    { target: { value: 'Đã đối chiếu tại quầy' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Xác nhận' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/admin/holds/${holdId}/no-show`) && init.method === 'PATCH'
    && JSON.parse(String(init.body)).expectedVersion === 0
    && JSON.parse(String(init.body)).reason === 'Đã đối chiếu tại quầy')).toBe(true));
  expect(await within(panel).findByText('Đã lưu quyết định và lý do.')).toBeInTheDocument();
});

it.each(['READER', 'LIBRARIAN', 'ADMIN'])('hồ sơ %s cho phép sửa thông tin của chính mình', async role => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? { ...session, user: { ...user, roles: [role] } } : account,
  )));
  app();
  expect(await screen.findByText('an@example.test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn An');
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/me/account'),
    expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-access' }) }));
});
it('loading, lỗi rồi retry hồ sơ thành công', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((url: string) => url.endsWith('/auth/refresh')
    ? Promise.resolve(Response.json(session)) : new Promise<Response>(resolve => { finish = resolve; }));
  app();
  expect(await screen.findByText('Đang tải hồ sơ…')).toBeInTheDocument();
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish(Response.json({ detail: 'internal trace' }, { status: 500 })));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('internal trace');
  fetchMock.mockResolvedValue(Response.json(account));
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('an@example.test')).toBeInTheDocument();
});
it('lưu họ tên và số liên hệ qua API của chính tài khoản', async () => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? session : init.method === 'PATCH' ? { ...account, fullName: 'Nguyễn Bình', phone: '+84901234567' } : account,
  )));
  app();
  fireEvent.change(await screen.findByLabelText('Họ và tên'), { target: { value: 'Nguyễn Bình' } });
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '+84901234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect(await screen.findByText('Đã cập nhật thông tin cá nhân.')).toBeInTheDocument();
  const patch = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/me/account') && init.method === 'PATCH');
  expect(JSON.parse(patch![1].body)).toEqual({ fullName: 'Nguyễn Bình', phone: '+84901234567' });
});
it('đổi email chỉ ở trạng thái chờ xác minh và có thể hủy', async () => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(
    String(url).endsWith('/me/account/email-request') && init.method === 'POST'
      ? Response.json({ ...account, pendingEmail: 'new@example.test', pendingEmailRequestedAt: '2026-10-27T00:00:00Z' })
      : init.method === 'DELETE' ? new Response(null, { status: 204 })
        : Response.json(String(url).endsWith('/auth/refresh') ? session : account)));
  app();
  const section = await screen.findByRole('region', { name: 'Địa chỉ email' });
  fireEvent.change(within(section).getByLabelText('Email mới'), { target: { value: 'new@example.test' } });
  fireEvent.change(within(section).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'CurrentPassword123' } });
  fireEvent.click(within(section).getByRole('button', { name: 'Gửi mã xác minh' }));
  expect(await within(section).findByText(/Đang chờ xác minh:/)).toBeInTheDocument();
  expect(within(section).getByText('an@example.test')).toBeInTheDocument();
  fireEvent.click(within(section).getByRole('button', { name: 'Hủy yêu cầu' }));
  await waitFor(() => expect(within(section).queryByText(/Đang chờ xác minh:/)).not.toBeInTheDocument());
});
it('không gợi ý gửi mã khi môi trường chưa bật SMTP', async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? session : { ...account, emailVerificationEnabled: false })));
  app();
  expect(await screen.findByText(/Máy chủ hiện chưa bật gửi mã xác minh/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Gửi mã xác minh' })).not.toBeInTheDocument();
});
it('xác minh email gửi mã tới API rồi yêu cầu đăng nhập lại', async () => {
  const pending = { ...account, pendingEmail: 'new@example.test', pendingEmailRequestedAt: '2026-10-27T00:00:00Z' };
  fetchMock.mockImplementation((url: string) => Promise.resolve(
    String(url).endsWith('/me/account/email-confirm') || String(url).endsWith('/auth/logout')
      ? new Response(null, { status: 204 }) : Response.json(String(url).endsWith('/auth/refresh') ? session : pending)));
  app();
  const section = await screen.findByRole('region', { name: 'Địa chỉ email' });
  fireEvent.change(within(section).getByLabelText('Mã xác minh'), { target: { value: 'abcdefghjklm' } });
  fireEvent.click(within(section).getByRole('button', { name: 'Xác minh email' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith('/me/account/email-confirm') && init.method === 'POST'
    && JSON.parse(init.body).code === 'ABCDEFGHJKLM')).toBe(true));
});
it('đổi mật khẩu thành công đăng xuất khỏi giao diện', async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(
    String(url).endsWith('/me/account/password') || String(url).endsWith('/auth/logout')
      ? new Response(null, { status: 204 }) : Response.json(String(url).endsWith('/auth/refresh') ? session : account)));
  app();
  const section = await screen.findByRole('region', { name: 'Đổi mật khẩu' });
  fireEvent.change(within(section).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'CurrentPassword123' } });
  fireEvent.change(within(section).getByLabelText('Mật khẩu mới'), { target: { value: 'AnotherPassword123' } });
  fireEvent.click(within(section).getByRole('button', { name: 'Đổi mật khẩu' }));
  expect(await screen.findByLabelText('Email hoặc mã thành viên')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/me/account/password') && init.method === 'POST')).toBe(true);
});
it('chặn Reader vào staff deep link, không gọi API danh sách', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...session, user: { ...user, roles: ['READER'] } }));
  app('/nhan-vien/thanh-vien');
  expect(await screen.findByText('403 · Không có quyền truy cập')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/members?'))).toBe(false);
});
it('anonymous được chuyển về đăng nhập', async () => {
  fetchMock.mockResolvedValue(Response.json({}, { status: 401 }));
  app();
  expect(await screen.findByLabelText('Email hoặc mã thành viên')).toBeInTheDocument();
});
it('staff deep link giữ bộ lọc, phân trang thật, đổi filter/reset trở về trang đầu', async () => {
  app('/nhan-vien/thanh-vien?query=An&status=ACTIVE&page=0&size=20&sort=fullName,asc');
  expect(await screen.findByRole('table')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
    const p = new URL(String(url)).searchParams;
    return p.get('page') === '1' && p.get('query') === 'An' && p.get('sort') === 'fullName,asc';
  })).toBe(true));
  fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'LOCKED' } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=0') && String(url).includes('status=LOCKED'))).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  await waitFor(() => expect(screen.getByLabelText('Tìm theo mã hoặc họ tên')).toHaveValue(''));
  fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'memberCode,desc' } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => new URL(String(url)).searchParams.get('sort') === 'memberCode,desc')).toBe(true));
});
it('debounce tìm kiếm, phản hồi cũ không đè kết quả mới', async () => {
  let oldResponse!: (response: Response) => void;
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json(session));
    const q = new URL(url).searchParams.get('query');
    if (q === 'cũ') return new Promise<Response>(resolve => { oldResponse = resolve; });
    return Promise.resolve(Response.json(page([{ ...row, fullName: q === 'mới' ? 'Kết quả mới' : row.fullName }])));
  });
  app('/nhan-vien/thanh-vien');
  await screen.findByRole('table');
  const input = screen.getByLabelText('Tìm theo mã hoặc họ tên');
  const before = fetchMock.mock.calls.length;
  input.focus();
  fireEvent.change(input, { target: { value: 'c' } });
  fireEvent.change(input, { target: { value: 'cũ' } });
  expect(fetchMock.mock.calls.length).toBe(before);
  await waitFor(() => expect(oldResponse).toBeDefined());
  expect(screen.getByLabelText('Tìm theo mã hoặc họ tên')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Tìm theo mã hoặc họ tên'), { target: { value: 'mới' } });
  await screen.findByText('Kết quả mới');
  await act(async () => oldResponse(Response.json(page([{ ...row, fullName: 'Kết quả cũ' }]))));
  expect(screen.queryByText('Kết quả cũ')).not.toBeInTheDocument();
  expect(screen.getByText('Kết quả mới')).toBeInTheDocument();
});
it('phân biệt empty với lỗi và không hiển thị dữ liệu staff sau 403', async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh')
    ? Response.json(session) : Response.json(page([], 0, 0))));
  app('/nhan-vien/thanh-vien');
  await screen.findByText('Không có thành viên phù hợp');
  fetchMock.mockResolvedValue(Response.json({ detail: 'Forbidden' }, { status: 403 }));
  fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'DISABLED' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không còn quyền');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it('URL không hợp lệ không được gửi sang API, đặt lại được', async () => {
  app('/nhan-vien/thanh-vien?page=-1&sort=email,asc');
  expect(await screen.findByRole('alert')).toHaveTextContent('Bộ lọc trong đường dẫn không hợp lệ');
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/members?'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});
it('401 sau một lần refresh đưa người dùng về đăng nhập, không lặp vô hạn', async () => {
  let refreshes = 0;
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh') && ++refreshes <= 1
    ? Response.json(session) : Response.json({}, { status: 401 })));
  app();
  expect(await screen.findByLabelText('Email hoặc mã thành viên')).toBeInTheDocument();
  expect(refreshes).toBe(2);
});
it('đăng xuất trong khi refresh chờ không làm phiên sống lại', async () => {
  let finish!: (response: Response) => void;
  let refreshes = 0;
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/auth/refresh')) return ++refreshes === 1 ? Promise.resolve(Response.json(session))
      : new Promise<Response>(resolve => { finish = resolve; });
    if (url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(Response.json({}, { status: 401 }));
  });
  app();
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  await act(async () => finish(Response.json({ ...session, accessToken: 'rotated-access' })));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/logout'))).toBe(true));
  expect(screen.queryByText('an@example.test')).not.toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Điều hướng chính' })).queryByText('Hồ sơ của tôi')).not.toBeInTheDocument();
});
