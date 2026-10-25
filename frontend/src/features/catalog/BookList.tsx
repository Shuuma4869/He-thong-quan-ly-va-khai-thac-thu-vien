import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { favoriteStates, removeFavorite, saveFavorite } from '../my-library/library-api';
import type { Book } from './catalog-api';
import { BookCover } from './BookCover';

export function BookList({ books }: { books: Book[] }) {
  const { user } = useAuth();
  const ids = books.map(book => book.id);
  const states = useQuery({ queryKey: ['favorites', user?.id, 'card-states', ids],
    queryFn: ({ signal }) => favoriteStates(ids, signal), enabled: !!user && ids.length > 0, retry: false });
  const saved = new Map(states.data?.map(item => [item.bookId, item.saved]));
  if (books.length === 0) return <div className="editorial-card empty-state compact"><h2>Chưa có sách phù hợp</h2><p>Thử đổi từ khóa hoặc bộ lọc.</p></div>;
  return <><div className="catalog-grid">{books.map(book => <article className="book-card" key={book.id}>
    <Link className="book-card-image-link" to={`/sach/${book.id}`} aria-label={`Xem sách ${book.title}`}><BookCover title={book.title} cover={book.cover} /></Link>
    <div className="book-card-body">
      <p className="book-card-kicker">{book.categories[0]?.name ?? 'Tác phẩm'}</p>
      <h2 className="book-card-title"><Link to={`/sach/${book.id}`}>{book.title}</Link></h2>
      <p className="book-card-authors">{book.authors.length ? book.authors.map((author, index) => <span key={author.id}>{index > 0 && ', '}<Link to={`/tac-gia/${author.id}`}>{author.name}</Link></span>) : 'Chưa có thông tin tác giả'}</p>
      {!!book.ratingCount && book.averageRating != null && <p className="book-card-rating" aria-label={`Điểm trung bình ${book.averageRating.toFixed(2)} trên 5 từ ${book.ratingCount} đánh giá`}>
        <Star size={15} fill="currentColor" aria-hidden="true"/> {book.averageRating.toFixed(2)} <span>({book.ratingCount})</span></p>}
      {user && saved.has(book.id) && <CardFavoriteButton bookId={book.id} title={book.title} saved={saved.get(book.id)!} owner={user.id}/>}
      <Link className="book-card-more" to={`/sach/${book.id}`}>Xem chi tiết <span aria-hidden="true">↗</span></Link>
    </div>
  </article>)}</div>{states.isError && user && <p role="alert" className="mt-3 text-sm text-muted">Chưa tải được trạng thái sách đã lưu. Bạn vẫn có thể lưu sách ở trang chi tiết.</p>}</>;
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
