import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { coreApi } from '../../shared/api/client';
import { AuthContext, type AuthState, type CurrentUser } from '../auth/auth-context';
import { AppearanceProvider } from './AppearanceProvider';
import { useAppearance } from './appearance-context';
import { defaults, GUEST_KEY } from './appearance';

vi.mock('../../shared/api/client', () => ({ coreApi: { get: vi.fn(), put: vi.fn() } }));
const getMock = vi.mocked(coreApi.get);
const putMock = vi.mocked(coreApi.put);

function auth(id: string): AuthState {
  const user: CurrentUser = { id, memberCode: id, email: `${id}@example.test`, fullName: id, roles: ['READER'] };
  return { user, accessToken: id, isInitializing: false, isAuthenticated: true,
    login: async () => user, register: async () => user, logout: async () => {}, refreshSession: async () => false };
}
function Controls() {
  const appearance = useAppearance();
  return <><span>{appearance.values.accent}</span><span data-testid="saved">{appearance.saved.accent}</span>
    <button disabled={appearance.loading} onClick={() => void appearance.save({ ...appearance.values, accent: 'sand' }).catch(() => {})}>Lưu</button>
    <button onClick={() => appearance.preview({ ...appearance.values, accent: 'emerald' })}>Xem thử</button>
    <button onClick={appearance.discard}>Bỏ</button>
    {appearance.error && <p role="alert">{appearance.error}</p>}</>;
}
function app(value: AuthState) {
  return <AuthContext.Provider value={value}><AppearanceProvider><Controls /></AppearanceProvider></AuthContext.Provider>;
}

afterEach(() => { vi.resetAllMocks(); localStorage.clear(); document.documentElement.removeAttribute('data-appearance-accent'); });

it('bỏ qua phản hồi lưu của tài khoản cũ sau khi đổi tài khoản', async () => {
  getMock.mockResolvedValueOnce({ schemaVersion: 1, revision: 1, values: { accent: 'blue' } } as never)
    .mockResolvedValueOnce({ schemaVersion: 1, revision: 2, values: { accent: 'teal' } } as never);
  let resolvePut!: (value: unknown) => void;
  putMock.mockReturnValue(new Promise(resolve => { resolvePut = resolve; }) as never);
  const view = render(app(auth('first')));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  view.rerender(app(auth('second')));
  await waitFor(() => expect(document.documentElement.dataset.appearanceAccent).toBe('teal'));
  await act(async () => resolvePut({ schemaVersion: 1, revision: 2, values: { accent: 'sand' } }));
  await waitFor(() => expect(document.documentElement.dataset.appearanceAccent).toBe('teal'));
  expect(screen.getByTestId('saved')).toHaveTextContent('teal');
});

it('không nhận phản hồi cũ khi đổi A → B → A trong lúc lưu chậm', async () => {
  getMock.mockResolvedValueOnce({ schemaVersion: 1, revision: 1, values: defaults })
    .mockResolvedValueOnce({ schemaVersion: 1, revision: 1, values: { ...defaults, accent: 'teal' } })
    .mockResolvedValueOnce({ schemaVersion: 1, revision: 3, values: { ...defaults, accent: 'emerald' } });
  let finish!: (value: unknown) => void;
  putMock.mockReturnValue(new Promise(resolve => { finish = resolve; }) as never);
  const view = render(app(auth('A')));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  view.rerender(app(auth('B')));
  await waitFor(() => expect(document.documentElement.dataset.appearanceAccent).toBe('teal'));
  view.rerender(app(auth('A')));
  await waitFor(() => expect(document.documentElement.dataset.appearanceAccent).toBe('emerald'));
  await act(async () => finish({ schemaVersion: 1, revision: 2, values: { ...defaults, accent: 'sand' } }));
  expect(screen.getByTestId('saved')).toHaveTextContent('emerald');
});

it.each(['Xung đột revision (409)', 'Thiết lập không hợp lệ (422)', 'Mất kết nối'])('giữ bản xem thử khi lưu lỗi: %s', async message => {
  getMock.mockResolvedValue({ schemaVersion: 1, revision: 4, values: defaults });
  putMock.mockRejectedValue(new Error(message));
  render(app(auth('A')));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Xem thử' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(document.documentElement.dataset.appearanceAccent).toBe('emerald');
  expect(screen.getByTestId('saved')).toHaveTextContent('blue');
  expect(putMock).toHaveBeenCalledWith('/me/ui-preferences', expect.objectContaining({ revision: 4 }));
});

it('đồng bộ tab khách nhưng giữ bản đang sửa cho đến khi bỏ thay đổi', async () => {
  const guest = { ...auth('guest'), user: null, isAuthenticated: false, accessToken: null };
  render(app(guest));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
  localStorage.setItem(GUEST_KEY, JSON.stringify({ ...defaults, accent: 'teal' }));
  fireEvent(window, new StorageEvent('storage', { key: GUEST_KEY }));
  expect(document.documentElement.dataset.appearanceAccent).toBe('teal');
  fireEvent.click(screen.getByRole('button', { name: 'Xem thử' }));
  localStorage.setItem(GUEST_KEY, JSON.stringify({ ...defaults, accent: 'sand' }));
  fireEvent(window, new StorageEvent('storage', { key: GUEST_KEY }));
  expect(document.documentElement.dataset.appearanceAccent).toBe('emerald');
  expect(screen.getByRole('alert')).toHaveTextContent('tab khác');
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ' }));
  expect(document.documentElement.dataset.appearanceAccent).toBe('sand');
});

it('chỉ cảnh báo đồng bộ tab đúng tài khoản và không gửi hai lệnh lưu đồng thời', async () => {
  getMock.mockResolvedValue({ schemaVersion: 1, revision: 1, values: defaults });
  let finish!: (value: unknown) => void;
  putMock.mockReturnValue(new Promise(resolve => { finish = resolve; }) as never);
  render(app(auth('A')));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
  fireEvent(window, new StorageEvent('storage', { key: 'lams-ui-revision:B' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent(window, new StorageEvent('storage', { key: 'lams-ui-revision:A' }));
  expect(screen.getByRole('alert')).toHaveTextContent('tab khác');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(putMock).toHaveBeenCalledTimes(1);
  await act(async () => finish({ schemaVersion: 1, revision: 2, values: defaults }));
});
