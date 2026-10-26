import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { BookList } from './BookList';
import { BookFilters } from './BookFilters';
import { CatalogError, Pagination } from './CatalogStates';
import { catalogParams, getBooks, parseCatalogQuery, type CatalogQuery } from './catalog-api';
import { BookGridSkeleton } from './BookGridSkeleton';

export function CatalogPage() {
  const [params, setParams] = useSearchParams(); const parsed = parseCatalogQuery(params);
  return <section className="shell py-8"><nav aria-label="Đường dẫn" className="catalog-breadcrumb"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Khám phá sách</span></nav>
    <p className="eyebrow">Thư mục thư viện</p><h1 className="page-title">Khám phá sách</h1>
    <p className="mt-2 text-muted">Tra cứu tác phẩm, tác giả và các ấn bản trong thư viện.</p>
    {parsed.success ? <CatalogResults value={parsed.data} onNavigate={setParams} /> : <div role="alert" className="editorial-card my-5"><p>Bộ lọc trong đường dẫn không hợp lệ.</p><button className="button-secondary mt-3" onClick={() => setParams({})}>Đặt lại bộ lọc</button></div>}
  </section>;
}
function CatalogResults({ value, onNavigate }: { value: CatalogQuery; onNavigate: (params: URLSearchParams) => void }) {
  const { user } = useAuth(); const { query, authorId, categoryId, categoryTerm, page, size, sort } = value;
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  return <div className="catalog-explore-layout">
    <button type="button" className="catalog-filter-toggle button-secondary" aria-expanded={filtersOpen}
      aria-controls="catalog-filter-panel" onClick={() => setFiltersOpen(open => !open)}>
      Bộ lọc {active.length > 0 && `(${active.length})`}
    </button>
    {filtersOpen && <button type="button" className="catalog-filter-backdrop" aria-label="Đóng bộ lọc" onClick={() => setFiltersOpen(false)} />}
    <aside id="catalog-filter-panel" className={`catalog-filter-panel ${filtersOpen ? 'is-open' : ''}`} aria-label="Bộ lọc sách">
      <div className="catalog-filter-heading"><h2>Lọc danh mục</h2><button type="button" className="catalog-filter-close" onClick={() => setFiltersOpen(false)}>Đóng</button></div>
      <BookFilters value={value} onChange={update} />
    </aside>
    <div className="catalog-results-panel">
      <div className="catalog-results-heading"><div><p className="eyebrow">Tìm trong danh mục</p><h2 className="section-title">Tác phẩm</h2></div>
        <p role="status" aria-live="polite">{result.isPending ? 'Đang tìm sách…' : result.isError ? 'Không tải được kết quả' : `${result.data.page.totalElements.toLocaleString('vi-VN')} tác phẩm`}</p></div>
      {active.length > 0 && <div className="catalog-active-filters" aria-label="Bộ lọc đang áp dụng">{active.map(filter =>
        <button key={filter.label} type="button" onClick={() => update({ ...filter.patch, page: 0 })}>{filter.label} <span aria-hidden="true">×</span></button>)}
        <button type="button" onClick={() => update({ query: '', authorId: '', categoryId: '', categoryTerm: '', sort: 'title', page: 0 })}>Xóa tất cả</button></div>}
      {result.isPending ? <BookGridSkeleton count={8} /> : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} />
        : <><BookList books={result.data.items} /><Pagination page={result.data.page} onChange={page => update({ page })} /></>}
    </div>
  </div>;
}
