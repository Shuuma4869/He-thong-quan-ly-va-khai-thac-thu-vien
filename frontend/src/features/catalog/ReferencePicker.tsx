import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem, getCatalogPage, recordLabel, type Resource } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';

export function ReferencePicker({ label, resource, value, onChange, multiple = false, bookId, disabled = false }: {
  label: string; resource: Resource; value: string[]; onChange: (ids: string[]) => void;
  multiple?: boolean; bookId?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const result = useQuery({ queryKey: ['catalog', user?.id, resource, bookId, page],
    queryFn: ({ signal }) => getCatalogPage(resource, page, signal, bookId), enabled: open && !disabled, retry: false });
  return <fieldset className="reference-picker" disabled={disabled}>
    <legend className="font-semibold text-sm">{label}</legend>
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {value.map(id => <span key={id} className="reference-tag"><ReferenceLabel resource={resource} id={id} bookId={bookId} />
        <button type="button" aria-label={`Bỏ chọn ${label} ${id}`} onClick={() => onChange(value.filter(v => v !== id))}>×</button></span>)}
      <button type="button" className="button-secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Đóng lựa chọn' : `Chọn ${label.toLowerCase()}`}</button>
    </div>
    {open && <div className="reference-options">
      {result.isPending ? <p role="status">Đang tải {label.toLowerCase()}…</p>
        : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} />
        : <>{result.data.items.length === 0 && <p>Chưa có dữ liệu.</p>}
          {result.data.items.map(item => <label key={item.id} className="reference-option">
            <input type={multiple ? 'checkbox' : 'radio'} name={`reference-${label}`} checked={value.includes(item.id)}
              onChange={() => { onChange(multiple ? value.includes(item.id) ? value.filter(v => v !== item.id) : [...value, item.id] : [item.id]); if (!multiple) setOpen(false); }} />
            {recordLabel(item)}</label>)}
          <Pagination page={result.data.page} onChange={setPage} />
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
