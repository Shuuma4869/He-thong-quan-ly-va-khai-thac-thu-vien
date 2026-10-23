import { afterEach, expect, it, vi } from 'vitest';
import { createReview, deleteReview, favoriteState, listFavorites, listReviews, myReviews, ratingSummary, removeFavorite, saveFavorite, updateReview } from './library-api';

const book = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const time = '2026-10-23T00:00:00Z';
const review = { reviewId: id, bookId: book, body: 'Nhận xét', rating: 5, createdAt: time, updatedAt: time, mine: true };
const page = { number: 0, size: 10, totalElements: 0, totalPages: 0 };
afterEach(() => vi.unstubAllGlobals());

it('các truy vấn dùng đúng scope cá nhân, phân trang và contract response', async () => {
  const fetch = vi.fn((url: string) => Promise.resolve(Response.json(url.includes('/summary') ? { bookId: book, average: null, count: 0 }
    : url.endsWith(`/favorites/${book}`) ? { bookId: book, saved: false } : { items: [], page })));
  vi.stubGlobal('fetch', fetch);
  expect(await favoriteState(book)).toEqual({ bookId: book, saved: false });
  await listFavorites(2); await listReviews(book, 3); await myReviews(0, book); await ratingSummary(book);
  const paths = fetch.mock.calls.map(([url]) => new URL(url).pathname + new URL(url).search);
  expect(paths).toEqual([`/api/v1/me/favorites/${book}`, '/api/v1/me/favorites?page=2&size=10',
    `/api/v1/books/${book}/reviews?page=3&size=10`, `/api/v1/me/reviews?page=0&size=10&bookId=${book}`, `/api/v1/books/${book}/reviews/summary`]);
});
it('ghi review giữ partial PATCH, favorite/delete nhận đúng method và 204', async () => {
  const fetch = vi.fn((_url: string, init: RequestInit) => Promise.resolve(init.method === 'DELETE' ? new Response(null, { status: 204 })
    : Response.json(init.method === 'PUT' ? { bookId: book, bookTitle: 'Sách', favoritedAt: time } : review)));
  vi.stubGlobal('fetch', fetch);
  await saveFavorite(book); await removeFavorite(book); await createReview(book, { body: 'Nhận xét', rating: 5 });
  await updateReview(book, id, { rating: 1 }); await deleteReview(book, id);
  expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(['PUT', 'DELETE', 'POST', 'PATCH', 'DELETE']);
  expect(JSON.parse(String(fetch.mock.calls[3][1].body))).toEqual({ rating: 1 });
  expect(fetch.mock.calls.every(([, init]) => init.credentials === 'include')).toBe(true);
});
it('UUID sai không gửi request và response rating ngoài contract bị từ chối', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...review, rating: 6 })); vi.stubGlobal('fetch', fetch);
  await expect(favoriteState('../other-user')).rejects.toThrow();
  await expect(updateReview(book, '../reviews', { body: 'x' })).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await expect(createReview(book, { body: 'Nhận xét', rating: 5 })).rejects.toThrow();
});
