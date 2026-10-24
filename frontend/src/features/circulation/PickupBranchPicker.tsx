import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pagination } from '../catalog/CatalogStates';
import { getPickupBranches } from './circulation-api';
import { CirculationError } from './CirculationStates';

export function PickupBranchPicker({ owner, value, onChange, disabled }: { owner: string; value: string; onChange: (id: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false); const [page, setPage] = useState(0); const [label, setLabel] = useState('');
  const branches = useQuery({ queryKey: ['circulation', owner, 'pickup-branches', page],
    queryFn: ({ signal }) => getPickupBranches(page, signal), enabled: open, retry: false });
  return <fieldset className="reference-picker" disabled={disabled}><legend>Chi nhánh nhận</legend>
    {value && <p className="my-2">Đã chọn: {label}</p>}
    <button className="button-secondary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Đóng lựa chọn' : 'Chọn chi nhánh nhận'}</button>
    {open && <div className="reference-options">
      {branches.isPending ? <p role="status">Đang tải chi nhánh nhận…</p> : branches.isError ? <CirculationError error={branches.error} reload={() => void branches.refetch()}/>
        : <>{!branches.data.items.length && <p>Không có chi nhánh nhận ở trang này.</p>}
          {branches.data.items.map(branch => <label className="reference-option" key={branch.id}><input type="radio" name="pickup-branch" checked={value === branch.id}
            onChange={() => { onChange(branch.id); setLabel(`${branch.code} · ${branch.name}`); setOpen(false); }}/>{branch.code} · {branch.name}</label>)}
          <Pagination page={branches.data.page} onChange={setPage}/></>}
    </div>}
  </fieldset>;
}
