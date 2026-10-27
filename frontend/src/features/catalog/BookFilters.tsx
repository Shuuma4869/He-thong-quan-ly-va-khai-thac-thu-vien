import { useEffect, useState } from 'react';
import { ReferencePicker } from './ReferencePicker';
import type { CatalogQuery } from './catalog-api';

export function BookFilters({ value, onChange }: { value: CatalogQuery; onChange: (patch: Partial<CatalogQuery>) => void }) {
  const [query, setQuery] = useState(value.query);
  const [syncedQuery, setSyncedQuery] = useState(value.query);
  if (syncedQuery !== value.query) { setSyncedQuery(value.query); setQuery(value.query); }
  const [categoryTerm, setCategoryTerm] = useState(value.categoryTerm);
  const [syncedCategoryTerm, setSyncedCategoryTerm] = useState(value.categoryTerm);
  if (syncedCategoryTerm !== value.categoryTerm) { setSyncedCategoryTerm(value.categoryTerm); setCategoryTerm(value.categoryTerm); }
  useEffect(() => { if (query === value.query) return; const timer = setTimeout(() => onChange({ query, sort: query.trim() ? 'relevance' : 'title', page: 0 }), 350); return () => clearTimeout(timer); }, [query, value.query, onChange]);
  useEffect(() => { if (categoryTerm === value.categoryTerm) return; const timer = setTimeout(() => onChange({ categoryTerm: categoryTerm.trim(), categoryId: '', page: 0 }), 350); return () => clearTimeout(timer); }, [categoryTerm, value.categoryTerm, onChange]);
  return <div className="catalog-filters editorial-card my-5">
    <label className="field">Tìm sách<input type="search" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} placeholder="Tên sách, tác giả hoặc ISBN…" /></label>
    <ReferencePicker label="Tác giả" resource="authors" value={value.authorId ? [value.authorId] : []} onChange={ids => onChange({ authorId: ids[0] ?? '', page: 0 })} />
    <ReferencePicker label="Thể loại" resource="categories" value={value.categoryId ? [value.categoryId] : []} onChange={ids => { setCategoryTerm(''); onChange({ categoryId: ids[0] ?? '', categoryTerm: '', page: 0 }); }} />
    <label className="field">Tên thể loại hoặc bí danh<input type="search" value={categoryTerm} maxLength={150} onChange={event => setCategoryTerm(event.target.value)} placeholder="Ví dụ: Truyện trinh thám" /></label>
    <label className="field">Sắp xếp<select value={value.sort} onChange={event => onChange({ sort: event.target.value as CatalogQuery['sort'], page: 0 })}>
      {value.query.trim() && <option value="relevance">Phù hợp nhất</option>}<option value="title">Tên sách A–Z</option><option value="updated">Mới cập nhật</option></select></label>
    <label className="field">Số sách mỗi trang<select value={value.size} onChange={event => onChange({ size: Number(event.target.value), page: 0 })}>{[...new Set([10,20,50,value.size])].sort((a,b) => a-b).map(size => <option key={size}>{size}</option>)}</select></label>
    <p className="text-sm text-muted">Tìm sách theo tên, mô tả, tác giả hoặc ISBN. Bộ lọc bí danh dùng tên thể loại đã được thư viện khai báo.</p>
    <button type="button" className="button-secondary" onClick={() => { setQuery(''); setCategoryTerm(''); onChange({ query: '', authorId: '', categoryId: '', categoryTerm: '', sort: 'title', page: 0 }); }}>Xóa bộ lọc</button>
  </div>;
}
