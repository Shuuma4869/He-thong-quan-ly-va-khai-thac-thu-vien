import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { pageSchema } from '../catalog/catalog-api';

const uuid = z.string().uuid();
const pathId = (id: string) => uuid.parse(id);
export const favoriteSchema = z.object({ bookId: uuid, bookTitle: z.string(), favoritedAt: z.string().datetime() });
export const reviewSchema = z.object({ reviewId: uuid, bookId: uuid, body: z.string(), rating: z.number().int().min(1).max(5),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), mine: z.boolean() });
const reviewPage = z.object({ items: z.array(reviewSchema), page: pageSchema });
export type Review = z.infer<typeof reviewSchema>;
export type ReviewInput = { body: string; rating: number };
export async function favoriteState(book: string, signal?: AbortSignal) {
  return z.object({ bookId: uuid, saved: z.boolean() }).parse(await coreApi.get(`/me/favorites/${pathId(book)}`, true, signal));
}
export async function listFavorites(page: number, signal?: AbortSignal) {
  return z.object({ items: z.array(favoriteSchema), page: pageSchema }).parse(await coreApi.get(`/me/favorites?page=${page}&size=10`, true, signal));
}
export async function saveFavorite(book: string) { return favoriteSchema.parse(await coreApi.put(`/me/favorites/${pathId(book)}`)); }
export function removeFavorite(book: string) { return coreApi.delete<void>(`/me/favorites/${pathId(book)}`); }
export async function listReviews(book: string, page: number, signal?: AbortSignal) {
  return reviewPage.parse(await coreApi.get(`/books/${pathId(book)}/reviews?page=${page}&size=10`, true, signal));
}
export async function myReviews(page: number, book?: string, signal?: AbortSignal) {
  return reviewPage.parse(await coreApi.get(`/me/reviews?page=${page}&size=10${book ? `&bookId=${pathId(book)}` : ''}`, true, signal));
}
export async function ratingSummary(book: string, signal?: AbortSignal) {
  return z.object({ bookId: uuid, average: z.number().min(1).max(5).nullable(), count: z.number().int().nonnegative() })
    .parse(await coreApi.get(`/books/${pathId(book)}/reviews/summary`, true, signal));
}
export async function createReview(book: string, input: ReviewInput) {
  return reviewSchema.parse(await coreApi.post(`/books/${pathId(book)}/reviews`, input));
}
export async function updateReview(book: string, id: string, input: Partial<ReviewInput>) {
  return reviewSchema.parse(await coreApi.patch(`/books/${pathId(book)}/reviews/${pathId(id)}`, input));
}
export function deleteReview(book: string, id: string) { return coreApi.delete<void>(`/books/${pathId(book)}/reviews/${pathId(id)}`); }
