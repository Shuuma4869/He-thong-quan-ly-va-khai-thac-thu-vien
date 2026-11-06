import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../../shared/api/client';
import { deleteCatalog, getCatalogPage, recordLabel, type CatalogRecord, type Resource } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';
import { CatalogForm } from './CatalogForm';
import { ReferencePicker } from './ReferencePicker';
import { MediaEditor } from './MediaEditor';
import { CategoryAliasManager } from './CategoryAliasManager';
import { invalidateCatalogViews } from './catalog-cache';
import { useUnsavedChanges } from '../../shared/navigation/unsaved-changes';
const MetadataHistory = lazy(() => import('./MetadataHistory').then(module => ({ default: module.MetadataHistory })));

const labels: Record<Resource,string> = { books:'Tác phẩm',authors:'Tác giả',categories:'Thể loại',publishers:'Nhà xuất bản',editions:'Ấn bản',branches:'Chi nhánh',shelves:'Kệ sách',copies:'Bản sách' };
export function StaffCatalogPage() {
  const [historyOpen,setHistoryOpen] = useState(false);
  const [resource,setResource] = useState<Resource>('books');
  const [busy,setBusy] = useState(false);
  const [aliasBusy,setAliasBusy] = useState(false);
  return <section><p className="eyebrow">Quản lý thư mục</p><h1 className="page-title">Danh mục thư viện</h1>
    <p className="mt-2 text-muted">Quản lý thông tin tác phẩm, các ấn bản và từng bản sách tại thư viện.</p>
    <Link className="text-link inline-block mt-3" to="/sach">Xem danh mục dành cho bạn đọc →</Link>
    <div><button className="button-secondary my-3" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}>Lịch sử tra cứu ISBN</button></div>
    {historyOpen && <Suspense fallback={<p role="status">Đang mở lịch sử…</p>}><MetadataHistory /></Suspense>}
    <label className="field my-5 max-w-sm">Loại dữ liệu<select disabled={busy || aliasBusy} aria-describedby={busy || aliasBusy ? 'catalog-context-hint' : undefined} value={resource} onChange={event => setResource(event.target.value as Resource)}>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {(busy || aliasBusy) && <p id="catalog-context-hint">Hoàn tất hoặc hủy thao tác đang mở trước khi chuyển loại dữ liệu hay tác phẩm.</p>}
    <CatalogManager key={resource} resource={resource} busy={busy} onBusyChange={setBusy} />
    {resource === 'categories' && <CategoryAliasManager onBusyChange={setAliasBusy} />}
  </section>;
}
function CatalogManager({ resource, busy, onBusyChange }: { resource: Resource; busy: boolean; onBusyChange: (busy: boolean) => void }) {
  const [bookId,setBookId] = useState('');
  return <>{resource === 'editions' && <fieldset disabled={busy}><ReferencePicker label="Tác phẩm" resource="books" value={bookId ? [bookId] : []} onChange={ids => setBookId(ids[0] ?? '')} /></fieldset>}
    {resource !== 'editions' || bookId ? <ResourceManager key={bookId} resource={resource} bookId={bookId || undefined} onBusyChange={onBusyChange} /> : <p className="my-5">Chọn tác phẩm để xem và quản lý các ấn bản.</p>}</>;
}
function ResourceManager({ resource,bookId,onBusyChange }: { resource: Resource; bookId?: string; onBusyChange: (busy: boolean) => void }) {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const [page,setPage] = useState(0); const [editing,setEditing] = useState<CatalogRecord | 'new' | null>(null);
  const [deleting,setDeleting] = useState<CatalogRecord | null>(null); const [notice,setNotice] = useState('');
  const [mediaItem,setMediaItem] = useState<CatalogRecord | null>(null);
  const busy = editing !== null || deleting !== null || mediaItem !== null;
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const result = useQuery({ queryKey:['catalog',user?.id,resource,bookId,page], queryFn: ({ signal }) => getCatalogPage(resource,page,signal,bookId), retry:false });
  const removal = useMutation({ mutationFn:(id: string) => deleteCatalog(resource,id,bookId), onSuccess:async () => {
    setDeleting(null); setNotice('Đã xóa dữ liệu.'); await invalidateCatalogViews(queryClient);
  } });
  const leaveRemoval = useUnsavedChanges({ dirty: false, busy: removal.isPending,
    uncertain: removal.isError && (!(removal.error instanceof ApiError) || removal.error.status === 0 || removal.error.status >= 500),
    label: 'Yêu cầu xóa dữ liệu danh mục' });
  const canDelete = ['authors','categories','publishers','books','editions'].includes(resource);
  return <>
    {mediaItem && (resource === 'authors' || resource === 'editions') && <MediaEditor key={mediaItem.id} kind={resource} id={mediaItem.id}
      title={recordLabel(mediaItem)} isbn={'isbn13' in mediaItem ? mediaItem.isbn13 : undefined} onClose={() => setMediaItem(null)} />}
    <div className="flex gap-3 my-5"><button className="button-primary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => { setEditing('new'); setNotice(''); }}>Thêm {labels[resource].toLowerCase()}</button>
      <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => void result.refetch()}>Tải lại danh sách</button></div>
    {notice && <p role="status" className="my-4">{notice}</p>}
    {editing && <CatalogForm key={editing === 'new' ? 'new' : editing.id} resource={resource} item={editing === 'new' ? undefined : editing} bookId={bookId}
      onClose={() => { setEditing(null); void result.refetch(); }} onSaved={() => { setEditing(null); setNotice('Đã lưu thông tin.'); }} />}
    {deleting && <div role="alertdialog" aria-labelledby="delete-heading" className="editorial-card my-5"><h2 id="delete-heading" className="section-title">Xác nhận xóa</h2>
      <p className="my-3">Xóa “{recordLabel(deleting)}”? Dữ liệu đang được tham chiếu sẽ không được xóa.</p>
      {removal.isError && <p role="alert" className="form-notice">{removal.error instanceof ApiError && removal.error.status < 500 ? removal.error.message : 'Không xóa được dữ liệu. Hãy tải lại để kiểm tra.'}</p>}
      <div className="flex gap-3 mt-4"><button className="button-primary" disabled={removal.isPending} onClick={() => removal.mutate(deleting.id)}>Xác nhận xóa</button><button className="button-secondary" disabled={removal.isPending} onClick={() => leaveRemoval(() => { setDeleting(null); removal.reset(); })}>Giữ lại</button></div>
    </div>}
    {result.isPending ? <p role="status">Đang tải danh mục…</p> : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} /> : <>
      {result.data.items.length === 0 ? <p className="editorial-card">Chưa có dữ liệu ở trang này.</p> : <>
        <p className="catalog-table-hint">Vuốt ngang để xem đầy đủ thông tin và thao tác.</p>
        <div className="member-table-wrap" tabIndex={0} role="region" aria-label="Danh mục quản lý, cuộn ngang để xem đủ cột">
        <table className="member-table"><thead><tr><th scope="col">{labels[resource]}</th><th scope="col">Thông tin</th><th scope="col">Thao tác</th></tr></thead><tbody>
          {result.data.items.map(item => <tr key={item.id}><td>{recordLabel(item)}</td><td>{'status' in item ? item.status : 'authors' in item ? item.authors.map(author => author.name).join(', ') : 'language' in item ? item.language ?? 'Chưa rõ ngôn ngữ' : 'sortOrder' in item ? `Thứ tự ${item.sortOrder}` : '—'}{'version' in item && <p>Version {item.version} · Kệ {item.shelfCode}</p>}</td><td><div className="flex flex-wrap gap-2">
            <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => { setEditing(item); setNotice(''); }}>Sửa</button>
            {canDelete && <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => { setDeleting(item); removal.reset(); }}>Xóa</button>}
            {(resource === 'authors' || resource === 'editions') && <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => setMediaItem(item)}>Ảnh và nguồn</button>}
          </div></td></tr>)}
        </tbody></table></div>
      </>}
      <Pagination page={result.data.page} onChange={next => { if (!editing && !deleting && !mediaItem) setPage(next); }} />
    </>}
  </>;
}
