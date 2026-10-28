import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/providers/AppProviders';
import { ReviewSection } from './ReviewSection';

const book = '4e6fa4d1-bdd9-429a-ae84-957eb9af60a8';
const review = '5a5804a7-43a5-48f4-aa76-3357f0cdd565';
const user = { id: '1f6322af-8f00-4cb0-8b06-c6f6934e268a', memberCode: 'TV-1234',
  email: 'reader@example.test', fullName: 'Người đọc', roles: ['READER'] };
const session = { accessToken: 'reader-access', accessTokenExpiresAt: '2030-01-01T00:00:00Z', user };
const page = { number: 0, size: 10, totalElements: 1, totalPages: 1 };

afterEach(() => vi.unstubAllGlobals());

it('người đọc gửi lý do báo cáo đánh giá của người khác', async () => {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(
    String(url).endsWith('/auth/refresh') ? Response.json(session)
      : String(url).endsWith(`/books/${book}/reviews/${review}/reports`) && init.method === 'POST'
        ? Response.json({ reportId: '6dff85ce-9a56-4cca-845d-a6f5d36cbe32' }, { status: 201 })
        : String(url).includes('/me/reviews?') ? Response.json({ items: [], page: { ...page, totalElements: 0, totalPages: 0 } })
          : String(url).includes('/reviews/summary') ? Response.json({ bookId: book, average: 4, count: 1 })
            : Response.json({ items: [{ reviewId: review, bookId: book, body: 'Đánh giá cần xem lại', rating: 4,
              createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', mine: false }], page })));
  vi.stubGlobal('fetch', fetchMock);
  render(<AppProviders><ReviewSection bookId={book}/></AppProviders>);
  fireEvent.click(await screen.findByRole('button', { name: 'Báo cáo đánh giá' }));
  fireEvent.change(screen.getByLabelText('Lý do báo cáo'), { target: { value: 'Nội dung có thông tin cá nhân' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
    String(url).endsWith(`/books/${book}/reviews/${review}/reports`) && init.method === 'POST'
      && JSON.parse(String(init.body)).reason === 'Nội dung có thông tin cá nhân')).toBe(true));
  expect(await screen.findByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.')).toBeInTheDocument();
});
