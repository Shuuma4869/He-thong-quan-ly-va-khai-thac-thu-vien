import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Heart, Star } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { BookList } from '../catalog/BookList';
import { BookCover } from '../catalog/BookCover';
import { getBookCards } from '../catalog/catalog-api';
import { Pagination } from '../catalog/CatalogStates';
import { listFavorites, myReviews } from './library-api';
import { LibraryError } from './LibraryError';

export function MyLibraryPage() {
  const { user } = useAuth();
  return user ? <Library key={user.id} owner={user.id}/> : null;
}
function Library({ owner }: { owner: string }) {
  const location = useLocation();
  const [favoritePage, setFavoritePage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);
  const favorites = useQuery({ queryKey: ['favorites', owner, 'list', favoritePage], queryFn: ({ signal }) => listFavorites(favoritePage, signal), retry: false });
  const reviews = useQuery({ queryKey: ['reviews', owner, 'mine', reviewPage], queryFn: ({ signal }) => myReviews(reviewPage, undefined, signal), retry: false });
  const ids = [...new Set([...(favorites.data?.items.map(item => item.bookId) ?? []), ...(reviews.data?.items.map(item => item.bookId) ?? [])])];
  const cards = useQuery({ queryKey: ['library-book-cards', owner, ids], enabled: ids.length > 0,
    queryFn: ({ signal }) => getBookCards(ids, signal), retry: false });
  const byId = new Map(cards.data?.map(book => [book.id, book]));
  useEffect(() => {
    if (location.hash !== '#sach-yeu-thich' && location.hash !== '#danh-gia') return;
    const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [location.hash, favorites.isPending, reviews.isPending]);
  return <section className="shell library-page my-library-page py-8">
    <header className="my-library-hero"><p className="eyebrow">Không gian cá nhân</p><h1>Thư viện của tôi</h1>
      <p>Sách đã lưu và những đánh giá của bạn, ở cùng một nơi.</p>
      <div className="my-library-hero-links"><Link to="/sach"><BookOpen size={17}/> Khám phá sách</Link>
        <Link to="/muon-va-giu-cho">Mượn và giữ chỗ →</Link></div></header>
    <nav className="my-library-sections" aria-label="Các mục trong thư viện của tôi">
      <Link to="#sach-yeu-thich" aria-current={location.hash === '#sach-yeu-thich' ? 'location' : undefined}><Heart size={17}/> Sách yêu thích
        {favorites.isSuccess && <span>{favorites.data.page.totalElements}</span>}</Link>
      <Link to="#danh-gia" aria-current={location.hash === '#danh-gia' ? 'location' : undefined}><Star size={17}/> Đánh giá của tôi
        {reviews.isSuccess && <span>{reviews.data.page.totalElements}</span>}</Link>
    </nav>
    <section id="sach-yeu-thich" aria-label="Sách yêu thích" className="my-library-section">
      <div className="detail-section-heading"><div><p className="eyebrow">Bộ sưu tập</p><h2>Sách yêu thích</h2></div>
        {favorites.isSuccess && <p>{favorites.data.page.totalElements.toLocaleString('vi-VN')} tác phẩm đã lưu</p>}</div>
      {favorites.isPending ? <p role="status">Đang tải sách yêu thích…</p> : favorites.isError
        ? <LibraryError error={favorites.error} retry={() => void favorites.refetch()}/>
        : <>{!favorites.data.items.length ? <p className="editorial-card">Chưa có sách yêu thích ở trang này.</p>
          : cards.isPending ? <p role="status">Đang tải thông tin sách đã lưu…</p>
            : cards.isError ? <LibraryError error={cards.error} retry={() => void cards.refetch()}/>
              : <BookList books={favorites.data.items.flatMap(item => byId.get(item.bookId) ?? [])}
                savedIds={new Set(favorites.data.items.map(item => item.bookId))}/>}
          <Pagination page={favorites.data.page} onChange={setFavoritePage}/></>}
    </section>
    <section id="danh-gia" aria-label="Đánh giá đã viết" className="my-library-section">
      <div className="detail-section-heading"><div><p className="eyebrow">Góc nhìn của bạn</p><h2>Đánh giá đã viết</h2></div>
        {reviews.isSuccess && <p>{reviews.data.page.totalElements.toLocaleString('vi-VN')} đánh giá</p>}</div>
      {reviews.isPending ? <p role="status">Đang tải đánh giá đã viết…</p> : reviews.isError
        ? <LibraryError error={reviews.error} retry={() => void reviews.refetch()}/>
        : <>{!reviews.data.items.length && <p className="editorial-card">Bạn chưa có đánh giá ở trang này.</p>}
          <ul className="my-review-list">{reviews.data.items.map(review => {
            const book = byId.get(review.bookId);
            return <li className="my-review-card" key={review.reviewId}>
              <Link className="my-review-cover" to={`/sach/${review.bookId}`} aria-label={`Xem sách ${book?.title ?? 'đã đánh giá'}`}>
                {book ? <BookCover title={book.title} author={book.authors[0]?.name} cover={book.cover}/>
                  : <BookOpen size={27} aria-hidden="true"/>}</Link>
              <div><p className="eyebrow">Đánh giá của tôi · {review.rating}/5 sao</p>
                {review.moderationStatus === 'HIDDEN' && <p className="text-sm text-muted">Đã ẩn sau kiểm duyệt</p>}
                {book && <><h3><Link to={`/sach/${book.id}`}>{book.title}</Link></h3>
                  <p className="my-review-author">{book.authors.map(author => author.name).join(', ') || 'Chưa rõ tác giả'}</p></>}
                <p className="my-review-body whitespace-pre-wrap break-words">{review.body}</p>
                <div className="my-review-footer"><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('vi-VN')}</time>
                  <Link className="text-link" to={`/sach/${review.bookId}#reviews-heading`}>Xem sách và quản lý đánh giá →</Link></div></div>
            </li>;
          })}</ul><Pagination page={reviews.data.page} onChange={setReviewPage}/></>}
    </section>
  </section>;
}
