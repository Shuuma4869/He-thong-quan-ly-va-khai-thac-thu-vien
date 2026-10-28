import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { coreApi } from '../../shared/api/client';
import { AuthContext, type AuthState, type CurrentUser } from '../auth/auth-context';
import { AppearanceProvider } from './AppearanceProvider';
import { useAppearance } from './appearance-context';

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
  return <><span>{appearance.values.accent}</span><button onClick={() => void appearance.save({ ...appearance.values, accent: 'sand' })}>Lưu</button></>;
}
function app(value: AuthState) {
  return <AuthContext.Provider value={value}><AppearanceProvider><Controls /></AppearanceProvider></AuthContext.Provider>;
}

afterEach(() => { vi.clearAllMocks(); document.documentElement.removeAttribute('data-appearance-accent'); });

it('bỏ qua phản hồi lưu của tài khoản cũ sau khi đổi tài khoản', async () => {
  getMock.mockResolvedValueOnce({ schemaVersion: 1, revision: 1, values: { accent: 'blue' } } as never)
    .mockResolvedValueOnce({ schemaVersion: 1, revision: 2, values: { accent: 'teal' } } as never);
  let resolvePut!: (value: unknown) => void;
  putMock.mockReturnValue(new Promise(resolve => { resolvePut = resolve; }) as never);
  const view = render(app(auth('first')));
  await screen.findByText('blue');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  view.rerender(app(auth('second')));
  await screen.findByText('teal');
  await act(async () => resolvePut({ schemaVersion: 1, revision: 2, values: { accent: 'sand' } }));
  await waitFor(() => expect(document.documentElement.dataset.appearanceAccent).toBe('teal'));
  expect(screen.getByText('teal')).toBeInTheDocument();
});
