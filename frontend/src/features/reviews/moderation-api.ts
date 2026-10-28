import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const id = z.string().uuid();
const pathId = (value: string) => id.parse(value);
const report = z.object({ id, reviewId: id, bookId: id, reporterId: id, reviewOwnerId: id,
  bodySnapshot: z.string(), ratingSnapshot: z.number().int(), reason: z.string(),
  status: z.enum(['OPEN', 'RESOLVED']), createdAt: z.string().datetime(), resolvedAt: z.string().datetime().nullable() });
const queue = z.object({ items: z.array(report), page: z.number().int(), size: z.number().int(), totalElements: z.number().int() });
export type ReviewReport = z.infer<typeof report>;

export async function reportReview(book: string, review: string, reason: string) {
  return z.object({ reportId: id }).parse(await coreApi.post(
    `/books/${pathId(book)}/reviews/${pathId(review)}/reports`, { reason }));
}

export async function listReviewReports(status: 'OPEN' | 'RESOLVED', page: number, signal?: AbortSignal) {
  return queue.parse(await coreApi.get(`/admin/review-reports?status=${status}&page=${page}&size=20`, true, signal));
}

export async function decideReviewReport(reportId: string, action: 'HIDE' | 'DISMISS', reason: string) {
  return z.object({ reportId: id, action: z.enum(['HIDE', 'DISMISS']),
    reviewStatus: z.enum(['VISIBLE', 'HIDDEN']).nullable(), resolvedAt: z.string().datetime() })
    .parse(await coreApi.post(`/admin/review-reports/${pathId(reportId)}/decisions`, { action, reason }));
}
