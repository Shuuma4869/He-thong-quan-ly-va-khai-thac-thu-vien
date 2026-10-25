import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pagination } from '../catalog/CatalogStates';
import { CatalogError } from '../catalog/CatalogStates';
import { listShelves } from './inventory-api';

export function ShelfPicker({ owner, branchId, value, onChange, allowWholeBranch = false, disabled = false }: {
  owner: string; branchId: string; value: string; onChange: (id: string) => void;
  allowWholeBranch?: boolean; disabled?: boolean;
}) {
  const [page, setPage] = useState(0);
  const shelves = useQuery({ queryKey: ['inventory', owner, 'shelves', branchId, page],
    queryFn: ({ signal }) => listShelves(branchId, page, signal), enabled: !!branchId, retry: false });
  if (!branchId) return <p className="text-sm text-muted">Chọn chi nhánh trước khi chọn kệ.</p>;
  return <fieldset disabled={disabled} className="editorial-card my-3">
    <legend className="font-semibold">{allowWholeBranch ? 'Phạm vi kiểm kê' : 'Kệ đang quét'}</legend>
    {allowWholeBranch && <label className="reference-option"><input type="radio" name="inventory-shelf" checked={!value}
      onChange={() => onChange('')}/> Toàn chi nhánh (tối đa 5.000 bản sách)</label>}
    {shelves.isPending ? <p role="status">Đang tải kệ…</p> : shelves.isError
      ? <CatalogError error={shelves.error} retry={() => void shelves.refetch()}/>
      : <>{!shelves.data.items.length && <p>Chi nhánh chưa có kệ trong trang này.</p>}
        {shelves.data.items.map(shelf => <label className="reference-option" key={shelf.id}>
          <input type="radio" name="inventory-shelf" checked={shelf.id === value}
            onChange={() => onChange(shelf.id)}/> {shelf.code} · {shelf.label}</label>)}
        <Pagination page={shelves.data.page} onChange={setPage}/></>}
  </fieldset>;
}
