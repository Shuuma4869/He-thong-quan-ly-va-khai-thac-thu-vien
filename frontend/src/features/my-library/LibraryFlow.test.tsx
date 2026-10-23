import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const bookId = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const instant = '2026-10-23T00:00:00Z';
const user = { id: bookId, memberCode: 'TV-1', email: 'reader@example.test', fullName: 'Bạn đọc', roles: ['READER'] };
const session = { accessToken: 'test-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const book = { id: bookId, title: 'Sách đã chọn', description: '', authors: [], categories: [] };
const favorite = { bookId, bookTitle: book.title, favoritedAt: instant };
const initialReview = { reviewId, bookId, body: 'Nội dung của tôi', rating: 3, createdAt: instant, updatedAt: instant, mine: true };
const otherReview = { ...initialReview, reviewId: otherId, body: 'Nội dung bạn đọc khác', mine: false };
const page = (items: unknown[], number = 0, total = items.length) => ({ items, page: { number, size: 10, totalElements: total, totalPages: Math.ceil(total / 10) } });
let saved = false;
let review: typeof initialReview | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
function result(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/refresh')) return Response.json(session);
  if (path.endsWith(`/me/favorites/${bookId}`)) {
    if (init.method === 'PUT') { saved = true; return Response.json(favorite); }
    if (init.method === 'DELETE') { saved = false; return new Response(null, { status: 204 }); }
    return Response.json({ bookId, saved });
  }
  if (path.endsWith('/me/favorites')) return Response.json(page(saved ? [favorite] : []));
  if (path.endsWith('/me/reviews')) return Response.json(page(review ? [review] : []));
  if (path.endsWith('/reviews/summary')) return Response.json({ bookId, average: review?.rating ?? null, count: review ? 1 : 0 });
  if (path.endsWith(`/reviews/${reviewId}`)) {
    if (init.method === 'DELETE') { review = undefined; return new Response(null, { status: 204 }); }
    review = { ...review!, ...JSON.parse(String(init.body)), updatedAt: '2026-10-23T01:00:00Z' };
    return Response.json(review);
  }
  if (path.endsWith('/reviews')) {
    if (init.method === 'POST') { review = { ...initialReview, ...JSON.parse(String(init.body)) }; return Response.json(review, { status: 201 }); }
    return Response.json(page(review ? [review, otherReview] : [otherReview]));
  }
  if (path.endsWith(`/books/${bookId}`)) return Response.json(book);
  return Response.json(page([]));
}
function app(path = `/sach/${bookId}`) { return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter/></MemoryRouter></AppProviders>); }
const writes = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method);
beforeEach(() => { saved = false; review = undefined; fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(result(url, init))); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it('yêu thích chờ server, chặn double click và tải lại trạng thái', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((url: string, init: RequestInit) => init.method === 'PUT'
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(result(url, init)));
  const view = app();
  const button = await screen.findByRole('button', { name: 'Lưu yêu thích' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled()); expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(writes('PUT')).toHaveLength(1);
  saved = true; await act(async () => finish(Response.json(favorite)));
  expect(await screen.findByRole('button', { name: 'Bỏ yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  view.unmount(); app('/thu-vien-cua-toi');
  expect(await screen.findByRole('link', { name: book.title })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Bỏ yêu thích' }));
  expect(await screen.findByText('Chưa có sách yêu thích ở trang này.')).toBeInTheDocument();
});

it('lỗi yêu thích không đổi trạng thái và không lộ thông tin nội bộ', async () => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(init.method === 'PUT'
    ? Response.json({ detail: 'SQL secret trace' }, { status: 500 }) : result(url, init)));
  app(); fireEvent.click(await screen.findByRole('button', { name: 'Lưu yêu thích' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('SQL secret trace');
  expect(screen.getByRole('button', { name: 'Lưu yêu thích' })).toHaveAttribute('aria-pressed', 'false');
  expect(writes('PUT')).toHaveLength(1);
});

it('tạo review có validation, rating bằng bàn phím và không chèn HTML', async () => {
  const keyboard = userEvent.setup(); app();
  const body = await screen.findByLabelText('Nội dung đánh giá');
  const submit = screen.getByRole('button', { name: 'Lưu đánh giá' });
  expect(submit).toBeDisabled();
  fireEvent.change(body, { target: { value: ' '.repeat(5) } });
  fireEvent.click(screen.getByRole('radio', { name: '1 sao' })); expect(submit).toBeDisabled();
  fireEvent.change(body, { target: { value: 'a'.repeat(5001) } }); expect(submit).toBeDisabled();
  fireEvent.change(body, { target: { value: '<img src=x onerror=alert(1)>Nội dung mới' } });
  screen.getByRole('radio', { name: '1 sao' }).focus();
  await keyboard.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(screen.getByRole('radio', { name: '5 sao' })).toBeChecked();
  fireEvent.click(submit);
  expect(await screen.findByText('Đã lưu đánh giá.')).toBeInTheDocument();
  expect(await screen.findByLabelText('Điểm trung bình')).toHaveTextContent('5.00/5');
  expect(await screen.findByText('<img src=x onerror=alert(1)>Nội dung mới')).toBeInTheDocument();
  expect(document.querySelector('img[src="x"]')).toBeNull();
  expect(writes('POST')).toHaveLength(2); // refresh đăng nhập và tạo review.
  const created = writes('POST').find(([url]) => String(url).endsWith('/reviews'));
  expect(JSON.parse(created![1].body)).toEqual({ body: '<img src=x onerror=alert(1)>Nội dung mới', rating: 5 });
});

it('chỉ sửa review của mình, PATCH chỉ gửi trường đổi và xóa cần xác nhận', async () => {
  review = { ...initialReview }; app();
  fireEvent.click(await screen.findByRole('button', { name: 'Sửa đánh giá của tôi' }));
  expect(screen.getAllByRole('button', { name: 'Xóa đánh giá của tôi' })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Nội dung đánh giá'), { target: { value: 'Đã sửa nội dung' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá' }));
  await screen.findByText('Đã sửa nội dung');
  expect(JSON.parse(writes('PATCH')[0][1].body)).toEqual({ body: 'Đã sửa nội dung' });
  expect(screen.getByLabelText('Điểm trung bình')).toHaveTextContent('3.00/5');
  fireEvent.click(screen.getByRole('button', { name: 'Xóa đánh giá của tôi' }));
  expect(writes('DELETE')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Giữ đánh giá' }));
  expect(screen.getByRole('button', { name: 'Xóa đánh giá của tôi' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Xóa đánh giá của tôi' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa đánh giá' }));
  expect(await screen.findByText('Đã xóa đánh giá.')).toBeInTheDocument();
  await screen.findByLabelText('Nội dung đánh giá');
  expect(screen.getByLabelText('Điểm trung bình')).toHaveTextContent('Chưa có điểm đánh giá.');
  expect(writes('DELETE')).toHaveLength(1);
});

it.each([409, 422, 500])('review lỗi %s giữ nội dung, không báo thành công và không tự gửi lại', async status => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(init.method === 'POST' && url.endsWith('/reviews')
    ? Response.json({ detail: 'internal trace' }, { status }) : result(url, init)));
  app(); fireEvent.change(await screen.findByLabelText('Nội dung đánh giá'), { target: { value: 'Giữ nội dung này' } });
  fireEvent.click(screen.getByRole('radio', { name: '1 sao' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('internal trace');
  expect(screen.getByLabelText('Nội dung đánh giá')).toHaveValue('Giữ nội dung này');
  expect(screen.queryByText('Đã lưu đánh giá.')).not.toBeInTheDocument();
  expect(writes('POST').filter(([url]) => String(url).endsWith('/reviews'))).toHaveLength(1);
});

it('phân trang Thư viện của tôi có hai truy vấn độc lập, không giả dữ liệu mượn trả', async () => {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(url.includes('/me/reviews?')
    ? Response.json(page([initialReview], Number(new URL(url).searchParams.get('page')), 11)) : result(url, init)));
  app('/thu-vien-cua-toi'); const reviews = await screen.findByRole('region', { name: 'Đánh giá đã viết' });
  await within(reviews).findByText('Nội dung của tôi');
  fireEvent.click(within(reviews).getByRole('button', { name: 'Trang sau' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/me/reviews?page=1'))).toBe(true));
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/me/favorites?page=1'))).toBe(false);
  expect(screen.queryByText(/Đang mượn|Đang giữ chỗ/)).not.toBeInTheDocument();
});

it('trang cá nhân yêu cầu đăng nhập', async () => {
  fetchMock.mockResolvedValue(Response.json({}, { status: 401 })); app('/thu-vien-cua-toi');
  expect(await screen.findByLabelText('Email hoặc mã thành viên')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/me/reviews'))).toBe(false);
});

it('logout rồi đổi tài khoản không hiện favorite/review hay response muộn của tài khoản cũ', async () => {
  let second = false;
  let late!: (response: Response) => void;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.endsWith('/auth/login')) { second = true; return Promise.resolve(Response.json({ ...session, user: { ...user, id: otherId } })); }
    if (url.includes('/me/reviews?') && !second) return new Promise(resolve => { late = resolve; });
    if (url.includes('/me/reviews?') || url.includes('/me/favorites?')) return Promise.resolve(Response.json(page(second ? [] : [favorite])));
    return Promise.resolve(result(url, init));
  });
  saved = true; app('/thu-vien-cua-toi');
  await screen.findByRole('link', { name: book.title }); await waitFor(() => expect(late).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  await screen.findByLabelText('Email hoặc mã thành viên');
  fireEvent.change(screen.getByLabelText('Email hoặc mã thành viên'), { target: { value: 'other@example.test' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), { target: { value: 'Password-test-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Thư viện của tôi' }));
  await screen.findByText('Bạn chưa có đánh giá ở trang này.');
  await act(async () => late(Response.json(page([initialReview]))));
  expect(screen.queryByText('Nội dung của tôi')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: book.title })).not.toBeInTheDocument();
});
