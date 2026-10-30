import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { favoriteStates, removeFavorite, saveFavorite } from '../my-library/library-api';
import { getCatalogAvailability, type Book, type CatalogAvailability } from './catalog-api';
import { BookCover } from './BookCover';

export function BookList({ books, savedIds }: { books: Book[]; savedIds?: ReadonlySet<string> }) {
  const { user } = useAuth();
  const ids = books.map(book => book.id);
  const states = useQuery({ queryKey: ['favorites', user?.id, 'card-states', ids],
    queryFn: ({ signal }) => favoriteStates(ids, signal), enabled: !!user && ids.length > 0 && !savedIds, retry: false });
  const inventory = useQuery({ queryKey: ['catalog', 'availability', 'batch', ids],
    queryFn: ({ signal }) => getCatalogAvailability(ids, signal), enabled: ids.length > 0, retry: false });
  const saved = new Map<string, boolean>(savedIds
    ? books.map(book => [book.id, savedIds.has(book.id)]) : states.data?.map(item => [item.bookId, item.saved]));
  const inventoryById = new Map(inventory.data?.map(item => [item.bookId, item]));
  if (books.length === 0) return <div className="editorial-card empty-state compact"><h2>Chưa có sách phù hợp</h2><p>Thử đổi từ khóa hoặc bộ lọc.</p></div>;
  return <><div className="catalog-grid">{books.map(book => <article className="book-card" key={book.id}>
    <Link className="book-card-image-link" to={`/sach/${book.id}`} aria-label={`Xem sách ${book.title}`}><BookCover title={book.title} author={book.authors[0]?.name} cover={book.cover} /></Link>
    <div className="book-card-body">
      <div className="book-card-meta"><p className="book-card-kicker">{book.categories[0]?.name ?? 'Tác phẩm'}</p>
        {book.catalogSource && <p className="book-card-source">Dữ liệu thư mục tham khảo</p>}</div>
      <h2 className="book-card-title"><Link to={`/sach/${book.id}`}>{book.title}</Link></h2>
      <p className="book-card-authors">{book.authors.length ? book.authors.map((author, index) => <span key={author.id}>{index > 0 && ', '}<Link to={`/tac-gia/${author.id}`}>{author.name}</Link></span>) : 'Chưa có thông tin tác giả'}</p>
      {inventory.isPending ? <p role="status" className="book-card-inventory-loading">Đang tải tồn kho…</p>
        : inventory.isError ? <p role="alert" className="book-card-inventory-error">Chưa tải được tồn kho.
          <button type="button" onClick={() => void inventory.refetch()}>Thử lại</button></p>
          : <BookInventory bookTitle={book.title} availability={inventoryById.get(book.id)}/>}
      <div className="book-card-footer"><div className="book-card-rating-line">
        {!!book.ratingCount && book.averageRating != null ? <p className="book-card-rating" aria-label={`Điểm trung bình ${book.averageRating.toFixed(2)} trên 5 từ ${book.ratingCount} đánh giá`}>
          <Star size={15} fill="currentColor" aria-hidden="true"/> {book.averageRating.toFixed(2)} <span>({book.ratingCount})</span></p>
          : <span className="book-card-unrated">Chưa có đánh giá</span>}
        {user && saved.has(book.id) && <CardFavoriteButton bookId={book.id} title={book.title} saved={saved.get(book.id)!} owner={user.id}/>}</div>
        <Link className="book-card-more" to={`/sach/${book.id}`}>Xem chi tiết <span aria-hidden="true">↗</span></Link></div>
    </div>
  </article>)}</div>{states.isError && user && !savedIds && <p role="alert" className="mt-3 text-sm text-muted">Chưa tải được trạng thái sách đã lưu. Bạn vẫn có thể lưu sách ở trang chi tiết.</p>}</>;
}

function BookInventory({ bookTitle, availability }: {
  bookTitle: string; availability: CatalogAvailability | undefined;
}) {
  if (!availability) return <p role="alert" className="book-card-inventory-error">Chưa có dữ liệu tồn kho cho {bookTitle}.</p>;
  return <section className="book-card-inventory" aria-label={`Tồn kho ${bookTitle}`}>
    <p><span>Tồn kho hiện tại</span><strong>{availability.copies.availableCopies} sẵn có · {availability.copies.totalCopies} đang quản lý</strong></p>
    {availability.branches.length > 0
      ? <details><summary>Tồn theo {availability.branches.length} chi nhánh</summary>
        <ul>{availability.branches.map(branch => <li key={branch.branchId}>
          <span>{branch.branchCode} · {branch.branchName}</span>
          <strong>{branch.copies.availableCopies} sẵn có · {branch.copies.totalCopies} đang quản lý</strong>
        </li>)}</ul>
      </details>
      : <small>Chưa có bản sách tại chi nhánh đang hoạt động.</small>}
  </section>;
}

function CardFavoriteButton({ bookId, title, saved, owner }: { bookId: string; title: string; saved: boolean; owner: string }) {
  const client = useQueryClient();
  const change = useMutation({ mutationFn: async () => { if (saved) await removeFavorite(bookId); else await saveFavorite(bookId); },
    onSuccess: () => client.invalidateQueries({ queryKey: ['favorites', owner] }) });
  return <><button type="button" className="book-card-favorite" aria-label={`${saved ? 'Bỏ yêu thích' : 'Lưu yêu thích'} ${title}`}
      aria-pressed={saved} disabled={change.isPending} onClick={() => change.mutate()}>
      <Heart size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden="true"/>
      {change.isPending ? 'Đang cập nhật…' : saved ? 'Đã lưu' : 'Lưu sách'}
    </button>{change.isError && <p role="alert" className="text-sm text-red-700">Chưa lưu được sách. Thử lại nhé.</p>}</>;
}
