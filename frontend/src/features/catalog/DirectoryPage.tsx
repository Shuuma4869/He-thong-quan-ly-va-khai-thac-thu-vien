import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCatalogPage, recordLabel } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';
import { useAuth } from '../auth/auth-context';

export function DirectoryPage({ kind }: { kind: 'authors' | 'categories' }) {
  const { isInitializing } = useAuth();
  const [params, setParams] = useSearchParams();
  const query = params.get('query')?.trim() ?? '';
  const page = Number(params.get('page') ?? '0');
  const [input, setInput] = useState(query);
  const author = kind === 'authors';
  const title = author ? 'Tác giả' : 'Thể loại';
  const valid = query.length <= 150 && Number.isInteger(page) && page >= 0 && page <= 10000;
  useEffect(() => setInput(query), [query]);
  const results = useQuery({ queryKey: ['directory', kind, query, page],
    queryFn: ({ signal }) => getCatalogPage(kind, page, signal, undefined, query), enabled: valid && !isInitializing, retry: false });
  const change = (nextQuery: string, nextPage: number) => {
    const value = new URLSearchParams();
    if (nextQuery) value.set('query', nextQuery);
    if (nextPage) value.set('page', String(nextPage));
    setParams(value);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); change(input.trim(), 0); };
  return <section className="shell py-8">
    <nav aria-label="Đường dẫn" className="catalog-breadcrumb"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>{title}</span></nav>
    <p className="eyebrow">Khám phá thư viện</p><h1 className="page-title">{title}</h1>
    <p className="mt-2 text-muted">{author ? 'Tìm tác giả và xem các tác phẩm trong danh mục.' : 'Chọn thể loại để khám phá những tác phẩm phù hợp.'}</p>
    <form className="directory-search mt-6" onSubmit={submit}>
      <label className="field">Tìm {title.toLowerCase()}<input type="search" value={input} maxLength={150}
        onChange={event => setInput(event.target.value)} placeholder={author ? 'Tên tác giả' : 'Tên thể loại'} /></label>
      <button className="button-primary" type="submit">Tìm kiếm</button>
    </form>
    {!valid ? <div role="alert" className="editorial-card mt-5">Đường dẫn tìm kiếm không hợp lệ. <button type="button" className="text-link" onClick={() => change('', 0)}>Đặt lại</button></div>
      : results.isPending ? <p role="status" className="mt-6">Đang tải {title.toLowerCase()}…</p>
        : results.isError ? <CatalogError error={results.error} retry={() => void results.refetch()} />
          : <><div className="directory-grid mt-6">{results.data.items.map(item =>
            <Link key={item.id} className="directory-card" to={author ? `/tac-gia/${item.id}` : `/the-loai/${item.id}`}>
              <strong>{recordLabel(item)}</strong><span aria-hidden="true">↗</span>
            </Link>)}</div>
            {!results.data.items.length && <p className="editorial-card mt-6">{query ? 'Không tìm thấy mục phù hợp. Thử tên khác.' : 'Danh mục này chưa có dữ liệu.'}</p>}
            <Pagination page={results.data.page} onChange={next => change(query, next)} /></>}
  </section>;
}
