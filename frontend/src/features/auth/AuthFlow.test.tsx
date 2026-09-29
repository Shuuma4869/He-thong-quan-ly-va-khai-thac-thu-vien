import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const reader = { id: 'user-1', memberCode: 'TV-1234567890ABCDEF', email: 'minh@example.test', fullName: 'Nguyễn Thị Minh', roles: ['READER'] };
const session = { accessToken: 'access-token', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user: reader };
type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const unauthorized = () => json({ status: 401, detail: 'Phiên đăng nhập không hợp lệ.' }, 401);

function app(path: string) {
  return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter></AppProviders>);
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(unauthorized());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('luồng xác thực giao diện', () => {
  it('báo lỗi validation khi login thiếu thông tin', async () => {
    app('/dang-nhap');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Vui lòng nhập email hoặc mã thành viên.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything());
  });

  it('đăng nhập thành công bằng API và chuyển về trang chủ', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/login') ? json(session) : unauthorized()));
    app('/dang-nhap');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email hoặc mã thành viên'), reader.email);
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct-password-123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText(/Nguyễn Thị Minh · TV-/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('hiển thị lỗi đăng nhập chung từ server', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/login')
      ? json({ detail: 'Email/mã thành viên hoặc mật khẩu không đúng.' }, 401) : unauthorized()));
    app('/dang-nhap');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email hoặc mã thành viên'), reader.email);
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email/mã thành viên hoặc mật khẩu không đúng.');
  });

  it('chặn đăng ký khi xác nhận mật khẩu khác', async () => {
    app('/dang-ky');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Họ và tên'), reader.fullName);
    await user.type(screen.getByLabelText('Email'), reader.email);
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct-password-123');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu'), 'different-password');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(await screen.findByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/register'), expect.anything());
  });

  it('đăng ký thành công và không gửi role hoặc memberCode', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/register') ? json(session, 201) : unauthorized()));
    app('/dang-ky');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Họ và tên'), reader.fullName);
    await user.type(screen.getByLabelText('Email'), reader.email);
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct-password-123');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu'), 'correct-password-123');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(await screen.findByText(/Nguyễn Thị Minh · TV-/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/register'));
    expect(JSON.parse(call![1].body)).toEqual({ fullName: reader.fullName, email: reader.email, password: 'correct-password-123' });
  });

  it('giữ loading trong khi khôi phục phiên', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    app('/nhan-vien/bang-dieu-khien');
    expect(await screen.findByRole('status')).toHaveTextContent('Đang khôi phục phiên đăng nhập');
    expect(screen.queryByText('403 · Không có quyền truy cập')).not.toBeInTheDocument();
    finish(unauthorized());
    expect(await screen.findByRole('heading', { name: 'Chào mừng bạn quay lại' })).toBeInTheDocument();
  });

  it('đưa anonymous khỏi staff route về đăng nhập', async () => {
    app('/nhan-vien/bang-dieu-khien');
    expect(await screen.findByRole('heading', { name: 'Chào mừng bạn quay lại' })).toBeInTheDocument();
  });

  it('chặn READER vào staff route bằng trang 403', async () => {
    fetchMock.mockResolvedValue(json(session));
    app('/nhan-vien/bang-dieu-khien');
    expect(await screen.findByText('403 · Không có quyền truy cập')).toBeInTheDocument();
  });

  it('khôi phục phiên bằng cookie, đăng xuất và reload vẫn anonymous', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh') ? json(session)
      : url.endsWith('/auth/logout') ? new Response(null, { status: 204 }) : unauthorized()));
    const rendered = app('/');
    expect(await screen.findByText(/Nguyễn Thị Minh · TV-/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.queryByText(/Nguyễn Thị Minh · TV-/)).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({ method: 'POST' }));
    rendered.unmount();
    fetchMock.mockResolvedValue(unauthorized());
    app('/');
    expect((await screen.findAllByRole('link', { name: /Đăng nhập/ })).length).toBeGreaterThan(0);
  });
});
