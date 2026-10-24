import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMembers, statusLabels } from '../members/member-api';
import { Pagination } from '../catalog/CatalogStates';
import { CirculationError } from './CirculationStates';

export type SelectedMember = { userId: string; memberCode: string; fullName: string; status: 'ACTIVE' | 'LOCKED' | 'DISABLED' };
export function MemberPicker({ owner, selected, onChange, disabled = false }: {
  owner: string; selected: SelectedMember | null; onChange: (value: SelectedMember | null) => void; disabled?: boolean;
}) {
  const [text, setText] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const result = useQuery({ queryKey: ['circulation', owner, 'members', search, page],
    queryFn: ({ signal }) => getMembers({ query: search, page, size: 10, sort: 'memberCode,asc', status: '' }, signal), enabled: open, retry: false });
  return <fieldset disabled={disabled} className="my-4"><legend className="font-semibold">Người mượn</legend>
    {selected && <p className="my-3">Đã chọn: {selected.memberCode} · {selected.fullName} · {statusLabels[selected.status]}
      <button type="button" className="text-link ml-3" onClick={() => onChange(null)}>Bỏ chọn người mượn</button></p>}
    <div className="flex flex-wrap items-end gap-3"><label className="field grow">Mã thành viên hoặc họ tên
      <input value={text} maxLength={150} onChange={e => setText(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); setSearch(text.trim()); setPage(0); setOpen(true); }
      }}/></label><button type="button" className="button-secondary" onClick={() => { setSearch(text.trim()); setPage(0); setOpen(true); }}>Tìm thành viên</button></div>
    {open && <div className="my-3">{result.isPending ? <p role="status">Đang tìm thành viên…</p> : result.isError
      ? <CirculationError error={result.error} reload={() => void result.refetch()}/>
      : <>{!result.data.items.length && <p>Không có thành viên phù hợp.</p>}
        {result.data.items.map(member => <button type="button" className="reference-option text-left w-full" key={member.userId}
          onClick={() => { onChange(member); setOpen(false); }}>{member.memberCode} · {member.fullName} · {statusLabels[member.status]}</button>)}
        <Pagination page={result.data.page} onChange={setPage}/></>}</div>}
  </fieldset>;
}
