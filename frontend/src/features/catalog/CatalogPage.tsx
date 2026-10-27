import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpenText, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { BookList } from './BookList';
import { BookFilters } from './BookFilters';
import { CatalogError, Pagination } from './CatalogStates';
import { catalogParams, getBooks, parseCatalogQuery, type CatalogQuery } from './catalog-api';
import { BookGridSkeleton } from './BookGridSkeleton';

export function CatalogPage() {
  const [params, setParams] = useSearchParams(); const parsed = parseCatalogQuery(params);
  return <section className="shell library-page catalog-page py-8"><nav aria-label="Đường dẫn" className="catalog-breadcrumb"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Khám phá sách</span></nav>
    <header className="catalog-intro"><div className="catalog-intro-copy">
      <p className="eyebrow">Thư mục · LAMS</p><h1>Khám phá sách</h1>
      <p>Tìm tác phẩm theo câu chuyện, tác giả hoặc chủ đề bạn quan tâm. Thông tin nguồn và ấn bản luôn được phân biệt rõ để bạn chọn đúng sách.</p>
      <div className="catalog-intro-links"><Link to="/tac-gia">Khám phá tác giả <ArrowRight size={16}/></Link>
        <Link to="/the-loai">Duyệt thể loại <ArrowRight size={16}/></Link></div>
    </div><div className="catalog-intro-art" aria-hidden="true"><div className="catalog-intro-book one"/><div className="catalog-intro-book two"/>
      <div className="catalog-intro-book three"/><BookOpenText size={84} strokeWidth={1}/></div></header>
    {parsed.success ? <CatalogResults value={parsed.data} onNavigate={setParams} /> : <div role="alert" className="editorial-card my-5"><p>Bộ lọc trong đường dẫn không hợp lệ.</p><button className="button-secondary mt-3" onClick={() => setParams({})}>Đặt lại bộ lọc</button></div>}
  </section>;
}
function CatalogResults({ value, onNavigate }: { value: CatalogQuery; onNavigate: (params: URLSearchParams) => void }) {
  const { user } = useAuth(); const { query, authorId, categoryId, categoryTerm, page, size, sort } = value;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState(query);
  useEffect(() => setQuickSearch(query), [query]);
  useEffect(() => {
    if (!filtersOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFiltersOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [filtersOpen]);
  const update = useCallback((patch: Partial<CatalogQuery>) => onNavigate(catalogParams({ query, authorId, categoryId, categoryTerm, page, size, sort, ...patch })), [query,authorId,categoryId,categoryTerm,page,size,sort,onNavigate]);
  const result = useQuery({ queryKey: ['catalog',user?.id,'books',value], queryFn: ({ signal }) => getBooks(value,signal), retry: false });
  const active = [query && { label: `Từ khóa: ${query}`, patch: { query: '', sort: 'title' as const } },
    authorId && { label: 'Tác giả đã chọn', patch: { authorId: '' } },
    categoryId && { label: 'Thể loại đã chọn', patch: { categoryId: '' } },
    categoryTerm && { label: `Thể loại: ${categoryTerm}`, patch: { categoryTerm: '' } }].filter(Boolean) as { label: string; patch: Partial<CatalogQuery> }[];
  return <><form className="catalog-search-bar" onSubmit={event => { event.preventDefault(); const next = quickSearch.trim(); update({ query: next, sort: next ? 'relevance' : 'title', page: 0 }); }}>
    <Search size={22} aria-hidden="true"/><label className="sr-only" htmlFor="catalog-quick-search">Từ khóa tra cứu</label>
    <input id="catalog-quick-search" type="search" value={quickSearch} maxLength={500}
      onChange={event => setQuickSearch(event.target.value)} placeholder="Tên sách, tác giả hoặc ISBN…"/>
    <button type="submit">Tìm trong thư viện <ArrowRight size={17} aria-hidden="true"/></button>
  </form><div className="catalog-explore-layout">
    <button type="button" className="catalog-filter-toggle button-secondary" aria-expanded={filtersOpen}
      aria-controls="catalog-filter-panel" onClick={() => setFiltersOpen(open => !open)}>
      <SlidersHorizontal size={17} aria-hidden="true"/> Bộ lọc {active.length > 0 && `(${active.length})`}
    </button>
    {filtersOpen && <button type="button" className="catalog-filter-backdrop" aria-label="Đóng bộ lọc" onClick={() => setFiltersOpen(false)} />}
    <aside id="catalog-filter-panel" className={`catalog-filter-panel ${filtersOpen ? 'is-open' : ''}`} aria-label="Bộ lọc sách">
      <div className="catalog-filter-heading"><div><p className="eyebrow">Khám phá chính xác hơn</p><h2>Lọc danh mục</h2></div>
        <button type="button" className="catalog-filter-close" onClick={() => setFiltersOpen(false)}>Đóng</button></div>
      <BookFilters value={value} onChange={update} />
    </aside>
    <div className="catalog-results-panel">
      <div className="catalog-results-heading"><div><p className="eyebrow">Kết quả trong thư mục</p><h2 className="section-title">Tác phẩm trong danh mục</h2></div>
        <p role="status" aria-live="polite">{result.isPending ? 'Đang tìm sách…' : result.isError ? 'Không tải được kết quả' : `${result.data.page.totalElements.toLocaleString('vi-VN')} tác phẩm`}</p></div>
      {active.length > 0 && <div className="catalog-active-filters" aria-label="Bộ lọc đang áp dụng">{active.map(filter =>
        <button key={filter.label} type="button" onClick={() => update({ ...filter.patch, page: 0 })}>{filter.label} <span aria-hidden="true">×</span></button>)}
        <button type="button" onClick={() => update({ query: '', authorId: '', categoryId: '', categoryTerm: '', sort: 'title', page: 0 })}>Xóa tất cả</button></div>}
      {result.isPending ? <BookGridSkeleton count={8} /> : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} />
        : <><BookList books={result.data.items} /><Pagination page={result.data.page} onChange={page => update({ page })} /></>}
    </div>
  </div></>;
}
