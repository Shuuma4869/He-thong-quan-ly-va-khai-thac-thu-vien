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
const page = (items: typeof row[] = [row], number = 0, total = 21) => ({
  items, page: { number, size: 20, totalElements: total, totalPages: Math.ceil(total / 20) },
});
let fetchMock: ReturnType<typeof vi.fn>;
function app(path = '/ho-so') {
  return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter></AppProviders>);
}
beforeEach(() => {
  fetchMock = vi.fn((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? session : url.includes('/members?') ? page() : profile,
  )));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each(['READER', 'LIBRARIAN', 'ADMIN'])('hồ sơ %s chỉ đọc và xử lý profile null', async role => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(Response.json(
    url.endsWith('/auth/refresh') ? { ...session, user: { ...user, roles: [role] } } : profile,
  )));
  app();
  expect(await screen.findByText('an@example.test')).toBeInTheDocument();
  expect(screen.getByText(/Chưa có thông tin hồ sơ bổ sung/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Lưu|Sửa/ })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/me/profile'),
    expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-access' }) }));
});
it('loading, lỗi rồi retry hồ sơ thành công', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((url: string) => url.endsWith('/auth/refresh')
    ? Promise.resolve(Response.json(session)) : new Promise<Response>(resolve => { finish = resolve; }));
  app();
  expect(await screen.findByText('Đang tải hồ sơ…')).toBeInTheDocument();
  await act(async () => finish(Response.json({ detail: 'internal trace' }, { status: 500 })));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('internal trace');
  fetchMock.mockResolvedValue(Response.json(profile));
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('an@example.test')).toBeInTheDocument();
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
