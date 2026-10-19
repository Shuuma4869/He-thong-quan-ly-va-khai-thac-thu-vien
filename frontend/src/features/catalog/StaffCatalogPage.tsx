import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../../shared/api/client';
import { deleteCatalog, getCatalogPage, recordLabel, type CatalogRecord, type Resource } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';
import { CatalogForm } from './CatalogForm';
import { ReferencePicker } from './ReferencePicker';
import { MediaEditor } from './MediaEditor';

const labels: Record<Resource,string> = { books:'Tác phẩm',authors:'Tác giả',categories:'Thể loại',publishers:'Nhà xuất bản',editions:'Ấn bản',branches:'Chi nhánh',shelves:'Kệ sách',copies:'Bản sách' };
export function StaffCatalogPage() {
  const [resource,setResource] = useState<Resource>('books');
  return <section><p className="eyebrow">Quản lý thư mục</p><h1 className="page-title">Danh mục thư viện</h1>
    <p className="mt-2 text-muted">Tác phẩm, ấn bản và bản sách được quản lý riêng. Các thay đổi được lưu qua Core API.</p>
    <Link className="text-link inline-block mt-3" to="/sach">Xem danh mục dành cho bạn đọc →</Link>
    <label className="field my-5 max-w-sm">Loại dữ liệu<select value={resource} onChange={event => setResource(event.target.value as Resource)}>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <CatalogManager key={resource} resource={resource} />
  </section>;
}
function CatalogManager({ resource }: { resource: Resource }) {
  const [bookId,setBookId] = useState('');
  return <>{resource === 'editions' && <ReferencePicker label="Tác phẩm" resource="books" value={bookId ? [bookId] : []} onChange={ids => setBookId(ids[0] ?? '')} />}
    {resource !== 'editions' || bookId ? <ResourceManager key={bookId} resource={resource} bookId={bookId || undefined} /> : <p className="my-5">Chọn tác phẩm để xem và quản lý các ấn bản.</p>}</>;
}
function ResourceManager({ resource,bookId }: { resource: Resource; bookId?: string }) {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const [page,setPage] = useState(0); const [editing,setEditing] = useState<CatalogRecord | 'new' | null>(null);
  const [deleting,setDeleting] = useState<CatalogRecord | null>(null); const [notice,setNotice] = useState('');
  const [mediaItem,setMediaItem] = useState<CatalogRecord | null>(null);
  const result = useQuery({ queryKey:['catalog',user?.id,resource,bookId,page], queryFn: ({ signal }) => getCatalogPage(resource,page,signal,bookId), retry:false });
  const removal = useMutation({ mutationFn:(id: string) => deleteCatalog(resource,id,bookId), onSuccess:async () => {
    setDeleting(null); setNotice('Đã xóa dữ liệu.'); await queryClient.invalidateQueries({ queryKey:['catalog'] });
  } });
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
      <div className="flex gap-3 mt-4"><button className="button-primary" disabled={removal.isPending} onClick={() => removal.mutate(deleting.id)}>Xác nhận xóa</button><button className="button-secondary" disabled={removal.isPending} onClick={() => { setDeleting(null); removal.reset(); }}>Giữ lại</button></div>
    </div>}
    {result.isPending ? <p role="status">Đang tải danh mục…</p> : result.isError ? <CatalogError error={result.error} retry={() => void result.refetch()} /> : <>
      {result.data.items.length === 0 ? <p className="editorial-card">Chưa có dữ liệu ở trang này.</p> : <div className="member-table-wrap" tabIndex={0} role="region" aria-label="Danh mục quản lý, cuộn ngang để xem đủ cột">
        <table className="member-table"><thead><tr><th scope="col">{labels[resource]}</th><th scope="col">Thông tin</th><th scope="col">Thao tác</th></tr></thead><tbody>
          {result.data.items.map(item => <tr key={item.id}><td>{recordLabel(item)}</td><td>{'status' in item ? item.status : 'authors' in item ? item.authors.map(author => author.name).join(', ') : 'language' in item ? item.language ?? 'Chưa rõ ngôn ngữ' : 'sortOrder' in item ? `Thứ tự ${item.sortOrder}` : '—'}{'version' in item && <p>Version {item.version} · Kệ {item.shelfCode}</p>}</td><td><div className="flex flex-wrap gap-2">
            <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => { setEditing(item); setNotice(''); }}>Sửa</button>
            {canDelete && <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => { setDeleting(item); removal.reset(); }}>Xóa</button>}
            {(resource === 'authors' || resource === 'editions') && <button className="button-secondary" disabled={editing !== null || deleting !== null || mediaItem !== null} onClick={() => setMediaItem(item)}>Ảnh và nguồn</button>}
          </div></td></tr>)}
        </tbody></table></div>}
      <Pagination page={result.data.page} onChange={next => { if (!editing && !deleting && !mediaItem) setPage(next); }} />
    </>}
  </>;
}
