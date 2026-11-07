import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReducer } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { ReviewSection } from './ReviewSection';
import * as moderation from './moderation-api';
import { ApiError, ApiTransportError, configureCoreAuth } from '../../shared/api/client';
import { UnsavedChangesProvider } from '../../shared/navigation/UnsavedChangesProvider';

const actor = vi.hoisted(() => ({ id: '11111111-1111-4111-8111-111111111111' }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: actor.id } }) }));
const book = '22222222-2222-4222-8222-222222222222';
const review = '33333333-3333-4333-8333-333333333333';
const reason = 'Nội dung có thông tin cần kiểm tra';
const result = { reportId: '44444444-4444-4444-8444-444444444444' };
const page = { number: 0, size: 10, totalElements: 1, totalPages: 1 };
beforeEach(() => {
  actor.id = '11111111-1111-4111-8111-111111111111';
  configureCoreAuth({ token: () => 'test-only', refresh: async () => false, clear: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('/me/reviews?')
    ? { items: [], page: { ...page, totalElements: 0, totalPages: 0 } }
    : url.includes('/reviews/summary') ? { bookId: book, average: 4, count: 1 }
      : { items: [{ reviewId: review, bookId: book, body: 'Đánh giá của bạn đọc khác', rating: 4,
        mine: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }], page })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { configureCoreAuth(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}>
    <UnsavedChangesProvider><Link to="/khac">Trang khác</Link><SessionView/></UnsavedChangesProvider>
  </QueryClientProvider> }], { initialEntries: [`/sach/${book}`] });
  const view = render(<RouterProvider router={router}/>);
  return { ...view, router };
}
function SessionView() {
  const [, refresh] = useReducer(value => value + 1, 0);
  return <><button onClick={() => { actor.id = '55555555-5555-4555-8555-555555555555'; refresh(); }}>Đổi tài khoản thử</button>
    <ReviewSection bookId={book}/></>;
}
async function draft() {
  fireEvent.click(await screen.findByRole('button', { name: 'Báo cáo đánh giá' }));
  fireEvent.change(screen.getByLabelText('Lý do báo cáo'), { target: { value: reason } });
  return screen.getByLabelText('Lý do báo cáo').closest('form')!;
}

it('hai submit cùng lượt chỉ gửi một báo cáo, giữ đúng ID và chờ kết quả trước khi rời trang', async () => {
  let finish!: (value: typeof result) => void;
  const send = vi.spyOn(moderation, 'reportReview').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { router } = show();
  const form = await draft();
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledWith(book, review, reason);
  expect(screen.queryByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Lý do báo cáo')).toBeDisabled();
  fireEvent.click(screen.getByText('Trang khác'));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Bỏ thay đổi và rời trang')).toBeDisabled();
  fireEvent.click(within(dialog).getByLabelText('Đóng hộp thoại'));
  await act(async () => finish(result));
  expect(await screen.findByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Trang khác'));
  await waitFor(() => expect(router.state.location.pathname).toBe('/khac'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each([
  ['timeout', new ApiTransportError('timeout'), true],
  ['đã báo cáo', new ApiError(409, 'Bạn đã báo cáo đánh giá này.'), false],
  ['nội dung không hợp lệ', new ApiError(422, 'Lý do không hợp lệ.'), false],
  ['giới hạn gửi', new ApiError(429, 'Quá nhiều báo cáo.'), false],
] as const)('lỗi %s giữ lý do, không tự retry và không báo thành công', async (_name, error, uncertain) => {
  const send = vi.spyOn(moderation, 'reportReview').mockRejectedValue(error);
  show(); const form = await draft(); fireEvent.submit(form);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  if (error.status === 409) expect(screen.getByRole('alert')).toHaveTextContent('bạn đã gửi báo cáo');
  if (error.status === 422) expect(screen.getByRole('alert')).toHaveTextContent('10 đến 500 ký tự');
  if (error.status === 429) expect(screen.getByRole('alert')).toHaveTextContent('giới hạn gửi báo cáo');
  expect(screen.getByLabelText('Lý do báo cáo')).toHaveValue(reason);
  expect(screen.queryByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  let dialog = await screen.findByRole('dialog');
  if (uncertain) expect(dialog).toHaveTextContent('Chưa xác định được máy chủ');
  fireEvent.click(within(dialog).getByLabelText('Đóng hộp thoại'));
  expect(screen.getByLabelText('Lý do báo cáo')).toHaveValue(reason);
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByText(uncertain ? 'Rời trang và kiểm tra lại sau' : 'Bỏ thay đổi và tiếp tục'));
  expect(screen.queryByLabelText('Lý do báo cáo')).not.toBeInTheDocument();
  expect(send).toHaveBeenCalledTimes(1);
});

it('reload được cảnh báo khi có nháp, đổi owner không mang lý do sang tài khoản sau', async () => {
  const send = vi.spyOn(moderation, 'reportReview');
  show(); await draft();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByText('Đổi tài khoản thử'));
  fireEvent.click(await screen.findByRole('button', { name: 'Báo cáo đánh giá' }));
  expect(screen.getByLabelText('Lý do báo cáo')).toHaveValue('');
  expect(send).not.toHaveBeenCalled();
});
