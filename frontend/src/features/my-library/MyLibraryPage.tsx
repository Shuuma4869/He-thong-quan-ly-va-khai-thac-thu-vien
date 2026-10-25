import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { Pagination } from '../catalog/CatalogStates';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { listFavorites, myReviews } from './library-api';
import { LibraryError } from './LibraryError';

export function MyLibraryPage() {
  const { user } = useAuth();
  return user ? <Library key={user.id} owner={user.id}/> : null;
}
function Library({ owner }: { owner: string }) {
  const [favoritePage, setFavoritePage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);
  const favorites = useQuery({ queryKey: ['favorites', owner, 'list', favoritePage], queryFn: ({ signal }) => listFavorites(favoritePage, signal), retry: false });
  const reviews = useQuery({ queryKey: ['reviews', owner, 'mine', reviewPage], queryFn: ({ signal }) => myReviews(reviewPage, undefined, signal), retry: false });
  return <section className="shell py-8"><p className="eyebrow">Không gian cá nhân</p><h1 className="page-title">Thư viện của tôi</h1>
    <p className="my-3 text-muted">Sách đã lưu và những đánh giá của bạn. <Link className="text-link" to="/sach">Khám phá danh mục</Link></p>
    <p className="my-4"><Link className="button-secondary" to="/muon-va-giu-cho">Mượn và giữ chỗ</Link></p>
    <section id="sach-yeu-thich" aria-label="Sách yêu thích" className="my-8"><h2 className="section-title">Sách yêu thích</h2>
      {favorites.isPending ? <p role="status">Đang tải sách yêu thích…</p> : favorites.isError
        ? <LibraryError error={favorites.error} retry={() => void favorites.refetch()}/>
        : <>{!favorites.data.items.length && <p className="my-4">Chưa có sách yêu thích ở trang này.</p>}
          <ul className="grid gap-4 my-4 sm:grid-cols-2">{favorites.data.items.map(book => <li className="editorial-card min-w-0" key={book.bookId}>
            <Link className="text-link font-semibold break-words" to={`/sach/${book.bookId}`}>{book.bookTitle}</Link>
            <FavoriteButton bookId={book.bookId}/>
          </li>)}</ul><Pagination page={favorites.data.page} onChange={setFavoritePage}/></>}
    </section>
    <section id="danh-gia" aria-label="Đánh giá đã viết" className="my-8"><h2 className="section-title">Đánh giá đã viết</h2>
      {reviews.isPending ? <p role="status">Đang tải đánh giá đã viết…</p> : reviews.isError
        ? <LibraryError error={reviews.error} retry={() => void reviews.refetch()}/>
        : <>{!reviews.data.items.length && <p className="my-4">Bạn chưa có đánh giá ở trang này.</p>}
          <ul className="grid gap-4 my-4">{reviews.data.items.map(review => <li className="editorial-card min-w-0" key={review.reviewId}>
            <p className="font-semibold">{review.rating}/5</p><p className="my-3 whitespace-pre-wrap break-words">{review.body}</p>
            <Link className="text-link" to={`/sach/${review.bookId}`}>Xem sách và quản lý đánh giá</Link>
          </li>)}</ul><Pagination page={reviews.data.page} onChange={setReviewPage}/></>}
    </section>
  </section>;
}
