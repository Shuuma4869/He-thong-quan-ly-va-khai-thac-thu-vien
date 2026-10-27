import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../../shared/api/client';
import { getCatalogItem } from './catalog-api';
import { ReferencePicker } from './ReferencePicker';
import { deleteCategoryAlias, listCategoryAliases, saveCategoryAlias, type CategoryAlias } from './category-alias-api';

export function CategoryAliasManager() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CategoryAlias | 'new' | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<CategoryAlias | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const result = useQuery({ queryKey: ['category-aliases', user?.id, page],
    queryFn: ({ signal }) => listCategoryAliases(page, signal), retry: false });

  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['category-aliases'] }),
      client.invalidateQueries({ queryKey: ['catalog'] })]);
  };
  const begin = (item: CategoryAlias | 'new') => {
    setEditing(item); setDeleting(null); setError(''); setNotice('');
    setCategoryId(item === 'new' ? '' : item.categoryId);
    setName(item === 'new' ? '' : item.name);
  };
  const save = async () => {
    if (!editing || busy || !categoryId || !name.trim()) return;
    setBusy(true); setError('');
    try {
      await saveCategoryAlias(categoryId, name, editing === 'new' ? undefined : editing.id);
      setEditing(null); setNotice('Đã lưu bí danh thể loại.'); await refresh();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true); setError('');
    try {
      await deleteCategoryAlias(deleting.id);
      setDeleting(null); setNotice('Đã xóa bí danh thể loại.'); await refresh();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return <section aria-label="Bí danh thể loại" className="my-10">
    <h2 className="section-title">Bí danh thể loại</h2>
    <p className="my-3 text-muted">Mỗi bí danh dẫn về một thể loại chuẩn. Tên trùng hoặc nhập nhằng sẽ bị từ chối.</p>
    <button type="button" className="button-secondary my-4" disabled={!!editing || !!deleting} onClick={() => begin('new')}>Thêm bí danh</button>
    {notice && <p role="status">{notice}</p>}
    {editing && <div className="editorial-card my-4">
      <h3 className="section-title">{editing === 'new' ? 'Thêm bí danh' : 'Sửa bí danh'}</h3>
      <ReferencePicker label="Thể loại chuẩn" resource="categories" value={categoryId ? [categoryId] : []}
        onChange={ids => setCategoryId(ids[0] ?? '')}/>
      <label className="field my-3">Tên bí danh<input value={name} maxLength={150}
        onChange={event => setName(event.target.value)} placeholder="Ví dụ: Truyện trinh thám"/></label>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3 my-3"><button type="button" className="button-primary" disabled={busy || !categoryId || !name.trim()}
        onClick={() => void save()}>Lưu bí danh</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>Hủy</button></div>
    </div>}
    {deleting && <div role="alertdialog" aria-label="Xác nhận xóa bí danh" className="editorial-card my-4">
      <p>Xóa bí danh “{deleting.name}”?</p>{error && <p role="alert">{error}</p>}
      <div className="flex gap-3 my-3"><button type="button" className="button-primary" disabled={busy}
        onClick={() => void remove()}>Xác nhận xóa bí danh</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>Giữ lại</button></div>
    </div>}
    {result.isPending ? <p role="status">Đang tải bí danh…</p> : result.isError
      ? <p role="alert">Không tải được bí danh. <button type="button" className="text-link" onClick={() => void result.refetch()}>Thử lại</button></p>
      : <>
        {!result.data.items.length ? <p>Chưa có bí danh nào.</p> : <div className="member-table-wrap" role="region" aria-label="Danh sách bí danh thể loại" tabIndex={0}>
          <table className="member-table"><thead><tr><th>Bí danh</th><th>Thể loại chuẩn</th><th>Thao tác</th></tr></thead><tbody>
            {result.data.items.map(item => <tr key={item.id}><td>{item.name}</td><td><CategoryName id={item.categoryId}/></td>
              <td><div className="flex gap-2"><button type="button" className="button-secondary" disabled={!!editing || !!deleting}
                onClick={() => begin(item)}>Sửa bí danh</button>
                <button type="button" className="button-secondary" disabled={!!editing || !!deleting}
                  onClick={() => { setDeleting(item); setError(''); setNotice(''); }}>Xóa bí danh</button></div></td></tr>)}</tbody></table></div>}
        <div className="flex items-center gap-3 my-4"><button type="button" className="button-secondary" disabled={page === 0}
          onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page + 1}/{Math.max(1, result.data.page.totalPages)}</span>
          <button type="button" className="button-secondary" disabled={page + 1 >= result.data.page.totalPages}
            onClick={() => setPage(page + 1)}>Trang sau</button></div>
      </>}
  </section>;
}

function CategoryName({ id }: { id: string }) {
  const result = useQuery({ queryKey: ['category-aliases', 'category', id],
    queryFn: ({ signal }) => getCatalogItem('categories', id, signal), retry: false });
  return result.data && 'name' in result.data ? result.data.name : id;
}
function message(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 409) return 'Tên này đã thuộc thể loại hoặc bí danh khác.';
  return cause instanceof Error ? cause.message : 'Không lưu được bí danh. Hãy thử lại.';
}
