import { Link } from 'react-router-dom';
import type { Book } from './catalog-api';

export function BookList({ books }: { books: Book[] }) {
  if (books.length === 0) return <div className="editorial-card empty-state compact"><h2>Chưa có sách phù hợp</h2><p>Thử đổi từ khóa hoặc bộ lọc.</p></div>;
  return <div className="catalog-grid">{books.map(book => <article className="editorial-card book-card" key={book.id}>
    <div className="book-placeholder" aria-label="Chưa có bìa đã xác minh"><span>LAMS</span><strong>{book.title}</strong></div>
    <h2 className="section-title mt-4"><Link className="text-link" to={`/sach/${book.id}`}>{book.title}</Link></h2>
    <p className="mt-2">{book.authors.length ? book.authors.map((author, index) => <span key={author.id}>{index > 0 && ', '}<Link to={`/tac-gia/${author.id}`}>{author.name}</Link></span>) : 'Chưa có thông tin tác giả'}</p>
    <p className="text-sm text-muted mt-2">{book.categories.map(category => category.name).join(' · ') || 'Chưa phân loại'}</p>
  </article>)}</div>;
}
