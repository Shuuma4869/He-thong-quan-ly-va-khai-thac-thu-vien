import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getBooks, getEditions } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';
import { CatalogMedia } from './CatalogMedia';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { ReviewSection } from '../reviews/ReviewSection';
import { BookCover } from './BookCover';
import { BookList } from './BookList';

export function BookDetailPage() {
  const { bookId = '' } = useParams();
  return <BookDetail key={bookId} id={bookId} />;
}
function BookDetail({ id }: { id: string }) {
  const { user } = useAuth(); const [page, setPage] = useState(0);
  const book = useQuery({ queryKey: ['catalog',user?.id,'book',id], queryFn: ({ signal }) => getBook(id,signal), retry: false });
  const editions = useQuery({ queryKey: ['catalog',user?.id,'editions',id,page], queryFn: ({ signal }) => getEditions(id,page,signal), enabled: book.isSuccess, retry: false });
  const authorId = book.data?.authors[0]?.id;
  const related = useQuery({ queryKey: ['catalog',user?.id,'related',authorId,id],
    queryFn: ({ signal }) => getBooks({ query: '', authorId: authorId!, categoryId: '', categoryTerm: '',
      page: 0, size: 5, sort: 'title' }, signal), enabled: !!authorId, retry: false });
  return <section className="shell py-8"><Link className="text-link" to="/sach">← Danh mục sách</Link>
    {book.isPending ? <p role="status" className="py-8">Đang tải tác phẩm…</p> : book.isError ? <CatalogError error={book.error} retry={() => void book.refetch()} /> : <>
      <div className="book-detail-hero mt-6">
        <div className="book-detail-cover"><BookCover title={book.data.title} cover={book.data.cover}/></div>
        <div className="book-detail-content">
          <p className="eyebrow">Tác phẩm trong thư viện</p><h1 className="book-detail-title">{book.data.title}</h1>
          <p className="book-detail-authors">{book.data.authors.length ? book.data.authors.map((author,i) =>
            <span key={author.id}>{i > 0 && ' · '}<Link className="text-link" to={`/tac-gia/${author.id}`}>{author.name}</Link></span>) : 'Chưa có thông tin tác giả'}</p>
          <div className="book-detail-categories">{book.data.categories.length ? book.data.categories.map(category =>
            <Link key={category.id} className="landing-category-chip" to={`/the-loai/${category.id}`}>{category.name}</Link>) : <span>Chưa phân loại</span>}</div>
          {!!book.data.ratingCount && book.data.averageRating != null && <p className="book-detail-rating" aria-label={`Điểm trung bình ${book.data.averageRating.toFixed(2)} trên 5 từ ${book.data.ratingCount} đánh giá`}>
            ★ {book.data.averageRating.toFixed(1)} / 5 · {book.data.ratingCount} đánh giá</p>}
          <p className="book-detail-description whitespace-pre-wrap">{book.data.description || 'Chưa có mô tả tác phẩm.'}</p>
          {user ? <FavoriteButton bookId={id}/> : <Link className="text-link" to="/dang-nhap">Đăng nhập để lưu sách hoặc viết đánh giá</Link>}
        </div>
      </div>
      <h2 className="section-title mt-8">Các ấn bản</h2>
      <p className="text-sm text-muted my-3">Mỗi ấn bản có ISBN và thông tin xuất bản riêng. Chọn ấn bản để giữ chỗ tại chi nhánh nhận; trạng thái sẵn sàng nhận được xác nhận sau khi gửi yêu cầu.</p>
      {editions.isPending ? <p role="status">Đang tải ấn bản…</p> : editions.isError ? <CatalogError error={editions.error} retry={() => void editions.refetch()} /> : <>
        {!editions.data.items.length && <p className="editorial-card">Tác phẩm chưa có ấn bản ở trang này.</p>}
        <div className="catalog-grid">{editions.data.items.map(edition => <article key={edition.id} className="editorial-card">
          <CatalogMedia kind="editions" id={edition.id} title={book.data.title} />
          <h3 className="font-semibold mt-4">{edition.isbn13 ? `ISBN ${edition.isbn13}` : 'Ấn bản không có ISBN'}</h3>
          <dl className="catalog-facts"><dt>Nhà xuất bản</dt><dd>{edition.publisherName ?? 'Chưa có thông tin'}</dd>
            <dt>Năm xuất bản</dt><dd>{edition.publicationYear ?? 'Chưa có thông tin'}</dd><dt>Ngôn ngữ</dt><dd>{edition.language ?? 'Chưa có thông tin'}</dd></dl>
          {user && <Link className="button-secondary mt-4" to={`/giu-cho/${id}/${edition.id}`}>Giữ chỗ ấn bản này</Link>}
        </article>)}</div><Pagination page={editions.data.page} onChange={setPage} />
      </>}
      {user && <ReviewSection bookId={id}/>}
      {authorId && <section className="mt-10" aria-labelledby="related-books-title"><div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="related-books-title" className="section-title">Cùng tác giả</h2><Link className="text-link" to={`/sach?authorId=${authorId}`}>Xem tất cả →</Link></div>
        {related.isPending ? <p role="status" className="my-4">Đang tải sách cùng tác giả…</p>
          : related.isError ? <CatalogError error={related.error} retry={() => void related.refetch()}/>
            : related.data.items.filter(item => item.id !== id).length ? <div className="mt-4"><BookList books={related.data.items.filter(item => item.id !== id)} /></div>
              : <p className="my-4 text-muted">Chưa có tác phẩm khác của tác giả này trong danh mục.</p>}
      </section>}
    </>}
  </section>;
}
