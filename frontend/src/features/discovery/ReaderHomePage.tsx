import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, LibraryBig, Search, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import heroImage from '../../assets/img/auth/auth-cover-library.webp';
import { useAuth } from '../auth/auth-context';
import { BookList } from '../catalog/BookList';
import { BookGridSkeleton } from '../catalog/BookGridSkeleton';
import { getBooks, getPublicCategories, getRecentBooks, type Named } from '../catalog/catalog-api';
import { ReferencePicker } from '../catalog/ReferencePicker';

export function ReaderHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const categories = useQuery({ queryKey: ['landing', 'categories'],
    queryFn: ({ signal }) => getPublicCategories(signal), retry: false });
  const recent = useQuery({ queryKey: ['landing', 'recent-books'], queryFn: ({ signal }) => getRecentBooks(signal), retry: false });
  const search = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    if (author[0]) params.set('authorId', author[0]);
    if (category[0]) params.set('categoryId', category[0]);
    navigate(`/sach${params.size ? `?${params}` : ''}`);
  };
  return <>
    <section className="landing-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,33,29,.88) 0%, rgba(8,33,29,.68) 49%, rgba(8,33,29,.15) 100%), url(${heroImage})` }}>
      <div className="landing-container landing-hero-inner">
        <p className="landing-hero-kicker"><Sparkles size={16}/> Không gian tri thức dành cho bạn</p>
        <h1>Cuốn sách tiếp theo<br/>đang chờ bạn khám phá.</h1>
        <p className="landing-hero-lead">Tìm tác phẩm, xem ấn bản và giữ chỗ tại chi nhánh thư viện phù hợp.</p>
        <Link className="landing-hero-link" to="/sach">Khám phá danh mục <ArrowRight size={18}/></Link>
      </div>
    </section>
    <div className="landing-container landing-search-position">
      <form className="landing-search" onSubmit={search} aria-label="Tìm sách trong thư viện">
        <label className="landing-search-keyword">Tên sách<input type="search" value={query} maxLength={500}
          onChange={event => setQuery(event.target.value)} placeholder="Bạn muốn đọc gì?" /></label>
        <ReferencePicker label="Tác giả" resource="authors" value={author} onChange={setAuthor}/>
        <ReferencePicker label="Thể loại" resource="categories" value={category} onChange={setCategory}/>
        <button className="landing-search-button" type="submit"><Search size={19}/> Tìm sách</button>
      </form>
    </div>
    <section id="the-loai" className="landing-section landing-container" aria-labelledby="landing-categories-title">
      <div className="landing-section-head"><div><p className="eyebrow">Bắt đầu từ sở thích</p>
        <h2 id="landing-categories-title">Khám phá theo thể loại</h2></div><Link to="/the-loai">Xem thể loại <ArrowRight size={17}/></Link></div>
      {categories.isPending ? <p role="status">Đang tải thể loại…</p> : categories.isError
        ? <div className="landing-retry" role="alert">Chưa tải được thể loại. <button type="button" onClick={() => void categories.refetch()}>Thử lại</button></div>
        : categories.data.items.length ? <div className="landing-category-grid">{categories.data.items.slice(0, 8).map(item =>
          <Link key={item.id} to={`/the-loai/${item.id}`} className="landing-category-card">
            <span className="landing-category-icon"><BookOpen size={27}/></span><span>{item.name}</span><ArrowRight size={18}/>
          </Link>)}</div> : <p>Thư viện chưa có thể loại để giới thiệu.</p>}
    </section>
    <section className="landing-section landing-section-soft" aria-labelledby="landing-recent-title">
      <div className="landing-container"><div className="landing-section-head"><div><p className="eyebrow">Từ danh mục thư viện</p>
        <h2 id="landing-recent-title">Sách mới cập nhật</h2></div><Link to="/sach">Xem tất cả <ArrowRight size={17}/></Link></div>
        {recent.isPending ? <BookGridSkeleton count={8} /> : recent.isError
          ? <div className="landing-retry" role="alert">Chưa tải được sách. <button type="button" onClick={() => void recent.refetch()}>Thử lại</button></div>
          : recent.data.items.length ? <BookList books={recent.data.items} /> : <p>Chưa có tác phẩm trong danh mục.</p>}
      </div>
    </section>
    {categories.data?.items.length ? <CategoryBooks categories={categories.data.items.slice(0, 8)} /> : null}
    <section className="landing-section landing-container landing-story" aria-labelledby="landing-story-title">
      <div className="landing-story-mark"><LibraryBig size={65} strokeWidth={1.3}/></div>
      <div><p className="eyebrow">Một hành trình đọc</p><h2 id="landing-story-title">Từ tìm kiếm đến cuốn sách trên tay</h2>
        <p>Khám phá thông tin tác phẩm và ấn bản đã được thư viện biên mục. Khi đăng nhập, bạn có thể lưu sách yêu thích, theo dõi lượt mượn và gửi yêu cầu giữ chỗ.</p>
        <Link className="text-link" to="/sach">Bắt đầu tìm sách <ArrowRight size={17}/></Link></div>
    </section>
    <section className="landing-cta" aria-labelledby="landing-cta-title"><div className="landing-container landing-cta-inner">
      <div><p className="eyebrow">LAMS · Thư viện của bạn</p><h2 id="landing-cta-title">Để những cuốn sách hay luôn ở gần bạn.</h2>
        <p>{user ? 'Trở lại thư viện cá nhân để xem sách đã lưu, đánh giá và những lượt mượn của bạn.'
          : 'Tạo tài khoản để lưu tác phẩm, đánh giá và sử dụng dịch vụ mượn, giữ chỗ của thư viện.'}</p></div>
      <Link className="button-primary" to={user ? '/thu-vien-cua-toi' : '/dang-ky'}>
        {user ? 'Mở thư viện của tôi' : 'Tạo tài khoản'} <ArrowRight size={18}/></Link>
    </div></section>
  </>;
}

function CategoryBooks({ categories }: { categories: Named[] }) {
  const [selected, setSelected] = useState(categories[0].id);
  const active = categories.find(item => item.id === selected) ?? categories[0];
  const books = useQuery({ queryKey: ['landing', 'category-books', active.id],
    queryFn: ({ signal }) => getBooks({ query: '', authorId: '', categoryId: active.id, categoryTerm: '',
      page: 0, size: 4, sort: 'updated' }, signal), retry: false });
  return <section className="landing-section landing-container" aria-labelledby="landing-category-books-title">
    <div className="landing-section-head"><div><p className="eyebrow">Từ những thể loại bạn quan tâm</p>
      <h2 id="landing-category-books-title">Sách theo thể loại</h2></div>
      <Link to={`/sach?categoryId=${active.id}`}>Xem thêm <ArrowRight size={17}/></Link></div>
    <div className="landing-category-chips" aria-label="Chọn thể loại để xem sách">
      {categories.map(item => <button type="button" key={item.id} aria-pressed={item.id === active.id}
        className="landing-category-chip" onClick={() => setSelected(item.id)}>{item.name}</button>)}
    </div>
    {books.isPending ? <BookGridSkeleton message="Đang tải sách theo thể loại…" /> : books.isError
      ? <div className="landing-retry" role="alert">Chưa tải được sách. <button type="button" onClick={() => void books.refetch()}>Thử lại</button></div>
      : <BookList books={books.data.items} />}
  </section>;
}
