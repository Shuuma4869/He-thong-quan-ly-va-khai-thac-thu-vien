import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Application } from '../../app/router/Application';

const id = '1f6322af-8f00-4cb0-8b06-c6f6934e268a';
const otherId = '6dff85ce-9a56-4cca-845d-a6f5d36cbe32';
const user = { id, memberCode: 'TV-1234', email: 'an@example.test', fullName: 'Nguyễn An', roles: ['READER'] };
const account = { userId: id, memberCode: user.memberCode, fullName: user.fullName, email: user.email,
  status: 'ACTIVE', phone: null, pendingEmail: null, pendingEmailRequestedAt: null, emailVerificationEnabled: true };
let activeUser = user;
let fetchMock: ReturnType<typeof vi.fn>;
function setup() {
  const router = createMemoryRouter([{ path: '*', element: <Application/> }], { initialEntries: ['/ho-so'] });
  render(<RouterProvider router={router}/>);
  return router;
}
beforeEach(() => {
  sessionStorage.clear(); activeUser = user;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
  fetchMock = vi.fn((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }));
    if (/\/auth\/(refresh|login)$/.test(url)) return Promise.resolve(Response.json({
      accessToken: 'test-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user: activeUser,
    }));
    if (url.endsWith('/me/ui-preferences')) return Promise.resolve(Response.json({ schemaVersion: 1, revision: 0, values: {} }));
    if (url.endsWith('/me/account/email-request') && init.method === 'POST') return Promise.resolve(Response.json({
      ...account, pendingEmail: 'new@example.test', pendingEmailRequestedAt: '2026-11-06T00:00:00Z',
    }));
    if (url.endsWith('/me/account')) return Promise.resolve(Response.json({ ...account, userId: activeUser.id, fullName: activeUser.fullName }));
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

it('gửi mã email không ghi đè họ tên đang sửa; rời trang phải xác nhận', async () => {
  setup();
  fireEvent.change(await screen.findByLabelText('Họ và tên'), { target: { value: 'Tên chưa lưu' } });
  const email = screen.getByRole('region', { name: 'Địa chỉ email' });
  fireEvent.change(within(email).getByLabelText('Email mới'), { target: { value: 'new@example.test' } });
  fireEvent.change(within(email).getByLabelText('Mật khẩu hiện tại'), { target: { value: 'TestPassword123' } });
  fireEvent.click(within(email).getByText('Gửi mã xác minh'));
  await within(email).findByText('new@example.test');
  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Tên chưa lưu');
  fireEvent.click(screen.getByRole('link', { name: /Sách yêu thích →/ }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByText('Tiếp tục chỉnh sửa'));
  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Tên chưa lưu');
});

it('đăng xuất bỏ bản nháp của phiên cũ, không giữ blocker khi tài khoản khác đăng nhập', async () => {
  const router = setup();
  fireEvent.change(await screen.findByLabelText('Họ và tên'), { target: { value: 'Tên riêng chưa gửi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/logout'))).toBe(true));
  await act(async () => { await router.navigate('/dang-nhap'); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  activeUser = { ...user, id: otherId, fullName: 'Thành viên khác', email: 'other@example.test' };
  fireEvent.change(await screen.findByLabelText('Email hoặc mã thành viên'), { target: { value: activeUser.email } });
  fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), { target: { value: 'TestPassword123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  await screen.findByRole('button', { name: 'Đăng xuất' });
  await act(async () => { await router.navigate('/ho-so'); });
  expect(await screen.findByLabelText('Họ và tên')).toHaveValue('Thành viên khác');
  expect(screen.queryByDisplayValue('Tên riêng chưa gửi')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
