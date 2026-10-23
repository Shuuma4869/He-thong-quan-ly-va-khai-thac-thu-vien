import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getEditions } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';
import { CatalogMedia } from './CatalogMedia';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { ReviewSection } from '../reviews/ReviewSection';

export function BookDetailPage() {
  const { bookId = '' } = useParams();
  return <BookDetail key={bookId} id={bookId} />;
}
function BookDetail({ id }: { id: string }) {
  const { user } = useAuth(); const [page, setPage] = useState(0);
  const book = useQuery({ queryKey: ['catalog',user?.id,'book',id], queryFn: ({ signal }) => getBook(id,signal), retry: false });
  const editions = useQuery({ queryKey: ['catalog',user?.id,'editions',id,page], queryFn: ({ signal }) => getEditions(id,page,signal), enabled: book.isSuccess, retry: false });
  return <section className="shell py-8"><Link className="text-link" to="/sach">← Danh mục sách</Link>
    {book.isPending ? <p role="status" className="py-8">Đang tải tác phẩm…</p> : book.isError ? <CatalogError error={book.error} retry={() => void book.refetch()} /> : <>
      <p className="eyebrow mt-6">Tác phẩm</p><h1 className="page-title">{book.data.title}</h1>
      <p className="my-3">{book.data.authors.map((author,i) => <span key={author.id}>{i > 0 && ' · '}<Link className="text-link" to={`/tac-gia/${author.id}`}>{author.name}</Link></span>)}</p>
      <p className="text-muted">{book.data.categories.map(category => category.name).join(' · ') || 'Chưa phân loại'}</p>
      <p className="my-5 whitespace-pre-wrap">{book.data.description || 'Chưa có mô tả tác phẩm.'}</p>
      <FavoriteButton bookId={id}/>
      <h2 className="section-title mt-8">Các ấn bản</h2>
      <p className="text-sm text-muted my-3">Mỗi ấn bản có ISBN và thông tin xuất bản riêng. Bản sách vật lý được quản lý riêng; trang này chưa cung cấp thông tin mượn hoặc số bản sẵn có.</p>
      {editions.isPending ? <p role="status">Đang tải ấn bản…</p> : editions.isError ? <CatalogError error={editions.error} retry={() => void editions.refetch()} /> : <>
        {!editions.data.items.length && <p className="editorial-card">Tác phẩm chưa có ấn bản ở trang này.</p>}
        <div className="catalog-grid">{editions.data.items.map(edition => <article key={edition.id} className="editorial-card">
          <CatalogMedia kind="editions" id={edition.id} title={book.data.title} />
          <h3 className="font-semibold mt-4">{edition.isbn13 ? `ISBN ${edition.isbn13}` : 'Ấn bản không có ISBN'}</h3>
          <dl className="catalog-facts"><dt>Nhà xuất bản</dt><dd>{edition.publisherName ?? 'Chưa có thông tin'}</dd>
            <dt>Năm xuất bản</dt><dd>{edition.publicationYear ?? 'Chưa có thông tin'}</dd><dt>Ngôn ngữ</dt><dd>{edition.language ?? 'Chưa có thông tin'}</dd></dl>
        </article>)}</div><Pagination page={editions.data.page} onChange={setPage} />
      </>}
      <ReviewSection bookId={id}/>
    </>}
  </section>;
}
