import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { BookList } from './BookList';
import { BookFilters } from './BookFilters';
import { CatalogError, Pagination } from './CatalogStates';
import { catalogParams, getBooks, parseCatalogQuery, type CatalogQuery } from './catalog-api';

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
  const update = useCallback((patch: Partial<CatalogQuery>) => onNavigate(catalogParams({ query, authorId, categoryId, categoryTerm, page, size, sort, ...patch })), [query,authorId,categoryId,categoryTerm,page,size,sort,onNavigate]);
  const result = useQuery({ queryKey: ['catalog',user?.id,'books',value], queryFn: ({ signal }) => getBooks(value,signal), retry: false });
  return <><BookFilters value={value} onChange={update} />
    {result.isPending ? <p role="status" className="py-8">Đang tải sách…</p> : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} />
      : <><BookList books={result.data.items} /><Pagination page={result.data.page} onChange={page => update({ page })} /></>}
  </>;
}
