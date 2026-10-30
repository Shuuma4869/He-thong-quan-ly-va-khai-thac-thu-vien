import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, BookCopy, BookOpenText, LibraryBig } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getBookAvailability, getBooks, getEditions } from './catalog-api';
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
  const availability = useQuery({ queryKey: ['catalog','availability',id],
    queryFn: ({ signal }) => getBookAvailability(id, signal), enabled: book.isSuccess, retry: false, staleTime: 0 });
  const authorId = book.data?.authors[0]?.id;
  const categoryId = book.data?.categories[0]?.id;
  const related = useQuery({ queryKey: ['catalog',user?.id,'related',authorId,id],
    queryFn: ({ signal }) => getBooks({ query: '', authorId: authorId!, categoryId: '', categoryTerm: '',
      page: 0, size: 5, sort: 'title' }, signal), enabled: !!authorId, retry: false });
  const sameCategory = useQuery({ queryKey: ['catalog',user?.id,'related-category',categoryId,id],
    queryFn: ({ signal }) => getBooks({ query: '', authorId: '', categoryId: categoryId!, categoryTerm: '',
      page: 0, size: 5, sort: 'title' }, signal), enabled: !!categoryId, retry: false });
  return <section className="shell library-page detail-page py-8"><nav className="catalog-breadcrumb" aria-label="Đường dẫn">
    <Link to="/sach">← Khám phá sách</Link><span aria-hidden="true">/</span><span>Chi tiết tác phẩm</span></nav>
    {book.isPending ? <p role="status" className="py-8">Đang tải tác phẩm…</p> : book.isError ? <CatalogError error={book.error} retry={() => void book.refetch()} /> : <>
      <div className="book-detail-hero">
        <div className="book-detail-cover-area"><div className="book-detail-cover-stage">
          <div className="book-detail-cover"><BookCover title={book.data.title} author={book.data.authors[0]?.name} cover={book.data.cover}/></div>
        </div><p>{book.data.cover ? 'Nguồn bìa đã được thư viện duyệt; ảnh lỗi sẽ chuyển sang bìa chữ.' : 'Bìa chữ thay thế · chưa có ảnh được duyệt'}</p></div>
        <div className="book-detail-content">
          <p className="eyebrow">{book.data.catalogSource ? 'Tác phẩm tham khảo' : 'Tác phẩm trong thư viện'}</p><h1 className="book-detail-title">{book.data.title}</h1>
          <p className="book-detail-authors">{book.data.authors.length ? book.data.authors.map((author,i) =>
            <span key={author.id}>{i > 0 && ' · '}<Link className="text-link" to={`/tac-gia/${author.id}`}>{author.name}</Link></span>) : 'Chưa có thông tin tác giả'}</p>
          <div className="book-detail-categories">{book.data.categories.length ? book.data.categories.map(category =>
            <Link key={category.id} className="landing-category-chip" to={`/the-loai/${category.id}`}>{category.name}</Link>) : <span>Chưa phân loại</span>}</div>
          {!!book.data.ratingCount && book.data.averageRating != null && <p className="book-detail-rating" aria-label={`Điểm trung bình ${book.data.averageRating.toFixed(2)} trên 5 từ ${book.data.ratingCount} đánh giá`}>
            ★ {book.data.averageRating.toFixed(1)} / 5 · {book.data.ratingCount} đánh giá</p>}
          <p className="book-detail-description whitespace-pre-wrap">{book.data.description || 'Tác phẩm này chưa có phần giới thiệu. Bạn vẫn có thể xem tác giả, thể loại và các ấn bản đã được biên mục.'}</p>
          <div className="book-detail-actions">{user ? <FavoriteButton bookId={id}/> : <Link className="button-primary" to="/dang-nhap">Đăng nhập để lưu sách <ArrowRight size={16}/></Link>}
            <button type="button" className="button-primary" onClick={() => {
              const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                || ['off', 'reduced'].includes(document.documentElement.dataset.appearanceMotion ?? '');
              document.getElementById('cac-an-ban')?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
              document.getElementById('editions-heading')?.focus({ preventScroll: true });
            }}>Xem ấn bản và giữ chỗ <BookCopy size={17}/></button>
            {user && <Link className="button-secondary" to="/muon-va-giu-cho">Mượn và giữ chỗ của tôi</Link>}</div>
          {book.data.catalogSource && <p className="book-source-note">Dữ liệu thư mục đối chiếu từ <a className="text-link" href={book.data.catalogSource.sourceUrl} target="_blank" rel="noopener noreferrer">Project Gutenberg ↗</a>. Ngày phát hành ebook không phải năm xuất bản sách in; thông tin nguồn không chứng minh thư viện có bản vật lý.</p>}
        </div>
      </div>
      <div className="book-detail-quick-facts" aria-label="Tóm tắt tác phẩm">
        <div><BookOpenText size={20} aria-hidden="true"/><span>Ấn bản đã biên mục</span><strong>{editions.isSuccess ? editions.data.page.totalElements : 'Đang kiểm tra'}</strong></div>
        <div><LibraryBig size={20} aria-hidden="true"/><span>Thể loại</span><strong>{book.data.categories[0]?.name ?? 'Chưa phân loại'}</strong></div>
        <div><BookCopy size={20} aria-hidden="true"/><span>Nguồn thông tin</span><strong>{book.data.catalogSource ? 'Thư mục tham khảo' : 'Danh mục thư viện'}</strong></div>
      </div>
      <section id="cac-an-ban" className="detail-section" aria-labelledby="editions-heading"><div className="detail-section-heading"><div>
        <p className="eyebrow">Biên mục thư viện</p><h2 id="editions-heading" tabIndex={-1}>Các ấn bản</h2>
        <p>Chọn ấn bản bên dưới để giữ chỗ tại chi nhánh nhận. Khi đến thư viện, thủ thư ghi nhận lượt mượn tại quầy. Bạn có thể theo dõi yêu cầu trong mục Mượn và giữ chỗ.</p></div></div>
      <section className="availability-panel my-5" aria-labelledby="availability-heading">
        <div className="detail-section-heading"><div><p className="eyebrow">Tình trạng theo dữ liệu Core</p>
          <h3 id="availability-heading">Khả dụng tại thư viện</h3></div></div>
        {availability.isPending ? <p role="status">Đang kiểm tra bản sách theo chi nhánh…</p>
          : availability.isError ? <CatalogError error={availability.error} retry={() => void availability.refetch()}/>
            : <>
              <dl className="availability-metrics">
                <div><dt>Tổng bản đang quản lý</dt><dd>{availability.data.copies.totalCopies}</dd></div>
                <div><dt>Sẵn sàng</dt><dd>{availability.data.copies.availableCopies}</dd></div>
                <div><dt>Đang mượn</dt><dd>{availability.data.copies.borrowedCopies}</dd></div>
                <div><dt>Đã phân bổ giữ chỗ</dt><dd>{availability.data.copies.reservedCopies}</dd></div>
                <div><dt>Hỏng, mất hoặc xử lý</dt><dd>{availability.data.copies.unavailableCopies}</dd></div>
                <div><dt>Hold READY</dt><dd>{availability.data.readyHolds}</dd></div>
                <div><dt>Đang chờ</dt><dd>{availability.data.waitingHolds}</dd></div>
              </dl>
              <p className="availability-footnote">Bản thanh lý không nằm trong tổng đang quản lý ({availability.data.copies.withdrawnCopies} bản).
                Số liệu được chụp lúc {new Date(availability.data.checkedAt).toLocaleString('vi-VN')}; hãy tải lại trước khi quyết định.</p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="button-secondary" disabled={availability.isFetching}
                  onClick={() => void availability.refetch()}>{availability.isFetching ? 'Đang tải lại…' : 'Tải lại tình trạng'}</button>
              </div>
              <div className="availability-branches">
                {availability.data.branches.map(branch => <article key={branch.branchId} className="availability-branch">
                  <h4>{branch.branchName} <span>({branch.branchCode})</span></h4>
                  <p>{branch.copies.availableCopies} sẵn có · {branch.copies.totalCopies} bản đang quản lý · {branch.copies.borrowedCopies} đang mượn
                    · {branch.copies.reservedCopies} bản được giữ · {branch.waitingHolds} yêu cầu đang chờ</p>
                </article>)}
              </div>
            </>}
      </section>
      {editions.isPending ? <p role="status">Đang tải ấn bản…</p> : editions.isError ? <CatalogError error={editions.error} retry={() => void editions.refetch()} /> : <>
        {!editions.data.items.length && <p className="editorial-card">{book.data.catalogSource ? 'Thư viện chưa biên mục ấn bản hoặc bản sách vật lý cho tác phẩm tham khảo này.' : 'Tác phẩm chưa có ấn bản ở trang này.'}</p>}
        <div className="edition-grid">{editions.data.items.map(edition => <article key={edition.id} className="editorial-card edition-card">
          <CatalogMedia kind="editions" id={edition.id} title={book.data.title} />
          <h3 className="font-semibold mt-4">{edition.isbn13 ? `ISBN ${edition.isbn13}` : 'Ấn bản không có ISBN'}</h3>
          <dl className="catalog-facts"><dt>Nhà xuất bản</dt><dd>{edition.publisherName ?? 'Chưa có thông tin'}</dd>
            <dt>Năm xuất bản</dt><dd>{edition.publicationYear ?? 'Chưa có thông tin'}</dd><dt>Ngôn ngữ</dt><dd>{edition.language ?? 'Chưa có thông tin'}</dd></dl>
          {availability.isSuccess && (() => {
            const stock = availability.data.editions.find(item => item.editionId === edition.id);
            return stock ? <div className="availability-edition mt-4">
              <p><strong>{stock.copies.availableCopies}</strong> sẵn có trên {stock.copies.totalCopies} bản đang quản lý · {stock.copies.borrowedCopies} đang mượn
                · {stock.copies.reservedCopies} được giữ · {stock.copies.unavailableCopies} không khả dụng</p>
              {stock.branches.map(branch => <p key={branch.branchId} className="text-sm">
                <strong>{branch.branchName}</strong>: {branch.copies.availableCopies} bản sẵn sàng
                {branch.compatibleWaitingHolds ? ` · ${branch.compatibleWaitingHolds} yêu cầu phù hợp đang chờ` : ''}
              </p>)}
            </div> : <p className="availability-edition mt-4">Ấn bản này chưa có bản sách vật lý tại chi nhánh đang hoạt động.</p>;
          })()}
          {user && availability.isSuccess && availability.data.editions.some(item =>
            item.editionId === edition.id && item.copies.totalCopies > 0)
            && <Link className="button-secondary mt-4" to={`/giu-cho/${id}/${edition.id}`}>
              {(() => {
                const stock = availability.data.editions.find(item => item.editionId === edition.id)!;
                return stock.copies.availableCopies > 0 && stock.compatibleWaitingHolds === 0
                  ? 'Đăng ký mượn tại quầy' : 'Đặt giữ chỗ';
              })()} <ArrowRight size={16}/>
            </Link>}
        </article>)}</div><Pagination page={editions.data.page} onChange={setPage} />
      </>}</section>
      {user && <section className="detail-section detail-reviews"><ReviewSection bookId={id}/></section>}
      {authorId && <section className="detail-section" aria-labelledby="related-books-title"><div className="detail-section-heading">
        <div><p className="eyebrow">Tiếp tục khám phá</p><h2 id="related-books-title">Cùng tác giả</h2></div><Link className="text-link" to={`/sach?authorId=${authorId}`}>Xem tất cả <ArrowRight size={16}/></Link></div>
        {related.isPending ? <p role="status" className="my-4">Đang tải sách cùng tác giả…</p>
          : related.isError ? <CatalogError error={related.error} retry={() => void related.refetch()}/>
            : related.data.items.filter(item => item.id !== id).length ? <BookList books={related.data.items.filter(item => item.id !== id)} />
              : <p className="my-4 text-muted">Chưa có tác phẩm khác của tác giả này trong danh mục.</p>}
      </section>}
      {categoryId && <section className="detail-section" aria-labelledby="related-category-title"><div className="detail-section-heading">
        <div><p className="eyebrow">Đọc thêm</p><h2 id="related-category-title">Cùng thể loại</h2></div><Link className="text-link" to={`/sach?categoryId=${categoryId}`}>Xem thể loại <ArrowRight size={16}/></Link></div>
        {sameCategory.isPending ? <p role="status">Đang tải sách cùng thể loại…</p>
          : sameCategory.isError ? <CatalogError error={sameCategory.error} retry={() => void sameCategory.refetch()}/>
            : sameCategory.data.items.filter(item => item.id !== id).length ? <BookList books={sameCategory.data.items.filter(item => item.id !== id)} />
              : <p className="text-muted">Chưa có tác phẩm khác trong thể loại này.</p>}
      </section>}
    </>}
  </section>;
}
