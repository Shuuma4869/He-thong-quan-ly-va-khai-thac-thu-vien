import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem, getCatalogPage, recordLabel, type Resource } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';

export function ReferencePicker({ label, resource, value, onChange, multiple = false, bookId, disabled = false }: {
  label: string; resource: Resource; value: string[]; onChange: (ids: string[]) => void;
  multiple?: boolean; bookId?: string; disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { user } = useAuth();
  const canSearch = resource === 'authors' || resource === 'categories' || resource === 'books';
  const needsBook = resource === 'editions' && !bookId;
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(input.trim()); setPage(0); setActive(0); }, 280);
    return () => window.clearTimeout(timer);
  }, [input]);
  useEffect(() => { if (open && canSearch) search.current?.focus(); }, [open, canSearch]);
  const result = useQuery({ queryKey: ['catalog-picker', user?.id, resource, bookId, page, canSearch ? query : ''],
    queryFn: ({ signal }) => getCatalogPage(resource, page, signal, bookId, canSearch ? query : ''),
    enabled: open && !disabled && !needsBook, retry: false, staleTime: 30_000 });
  const items = result.data?.items ?? [];
  const choose = (itemId: string) => {
    onChange(multiple ? value.includes(itemId) ? value.filter(v => v !== itemId) : [...value, itemId] : [itemId]);
    if (!multiple) { setOpen(false); trigger.current?.focus(); } else search.current?.focus();
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <fieldset className="reference-picker" disabled={disabled || needsBook}>
    <legend className="font-semibold text-sm">{label}</legend>
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {value.map(id => <span key={id} className="reference-tag"><ReferenceLabel resource={resource} id={id} bookId={bookId} />
        <button type="button" aria-label={`Bỏ chọn ${label} ${id}`} onClick={() => onChange(value.filter(v => v !== id))}>×</button></span>)}
      <button ref={trigger} type="button" className="button-secondary" aria-expanded={open}
        aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>{open ? 'Đóng lựa chọn' : `Chọn ${label.toLowerCase()}`}</button>
      {value.length > 1 && <button type="button" className="text-link text-sm" onClick={() => onChange([])}>Xóa tất cả</button>}
    </div>
    {needsBook && <p className="text-sm text-muted mt-2">Chọn tác phẩm trước khi chọn ấn bản.</p>}
    {open && <div id={`${id}-panel`} className="reference-options">
      {canSearch && <label className="field">Tìm trong {label.toLowerCase()}
        <input ref={search} type="search" role="combobox" aria-autocomplete="list" aria-expanded={open}
          aria-controls={`${id}-list`} aria-activedescendant={items[active] ? `${id}-option-${active}` : undefined}
          value={input} maxLength={150} placeholder="Gõ tên để tìm trong toàn bộ danh mục"
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, active - 1)); }
            if (event.key === 'Enter' && items[active]) { event.preventDefault(); choose(items[active].id); }
          }}/>
      </label>}
      {canSearch && input.trim() !== query ? <p role="status">Đang tìm {label.toLowerCase()}…</p>
        : result.isPending ? <p role="status">Đang tải {label.toLowerCase()}…</p>
        : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} />
        : <><div id={`${id}-list`} role="listbox" aria-label={label} aria-multiselectable={multiple} className="reference-list">
          {items.length === 0 && <p className="reference-feedback">Không tìm thấy {label.toLowerCase()} phù hợp. {query ? 'Thử từ khóa khác.' : 'Kiểm tra dữ liệu Catalog demo.'}</p>}
          {items.map((item, index) => <label key={item.id} id={`${id}-option-${index}`}
            role="option" aria-selected={value.includes(item.id)}
            className={`reference-option ${index === active ? 'reference-option-active' : ''}`}>
            <input type={multiple ? 'checkbox' : 'radio'} name={`reference-${id}`} checked={value.includes(item.id)}
              onFocus={() => setActive(index)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}
              onChange={() => choose(item.id)} />
            <span>{recordLabel(item)}</span></label>)}
          </div>
          <Pagination page={result.data.page} onChange={next => { setPage(next); setActive(0); search.current?.focus(); }} />
          {!canSearch && result.data.page.totalPages > 1 && <p className="text-xs text-muted mt-2">Dùng phân trang để xem thêm lựa chọn.</p>}
        </>}
    </div>}
  </fieldset>;
}
function ReferenceLabel({ resource, id, bookId }: { resource: Resource; id: string; bookId?: string }) {
  const { user } = useAuth();
  const item = useQuery({ queryKey: ['catalog', user?.id, resource, bookId, 'item', id],
    queryFn: ({ signal }) => getCatalogItem(resource, id, signal, bookId), retry: false, staleTime: 30_000 });
  return <span>{item.data ? recordLabel(item.data) : item.isError ? `Không tải được mục ${id}` : 'Đang tải tên…'}</span>;
}
