import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { saveCatalog, type CatalogRecord, type Resource } from './catalog-api';
import { initialValues, parseCatalogForm } from './catalog-form';
import { ReferencePicker } from './ReferencePicker';

export function CatalogForm({ resource, item, bookId, onClose, onSaved }: {
  resource: Resource; item?: CatalogRecord; bookId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [values,setValues] = useState(() => initialValues(resource,item));
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [copyBook,setCopyBook] = useState('');
  const [conflict,setConflict] = useState(false);
  const queryClient = useQueryClient(); const submitting = useRef(false);
  const mutation = useMutation({ mutationFn: (body: unknown) => saveCatalog(resource,body,item?.id,bookId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey:['catalog'] }); onSaved(); },
    onError: error => { if (resource === 'copies' && error instanceof ApiError && error.status === 409) setConflict(true); } });
  const text = (key: string) => typeof values[key] === 'string' ? values[key] as string : '';
  const set = (key: string, value: string | string[]) => setValues(previous => ({ ...previous,[key]:value }));
  const field = (key: string, label: string, max: number, type = 'text') => <label className="field" key={key}>{label}
    <input value={text(key)} type={type} maxLength={max} onChange={event => set(key,event.target.value)} aria-invalid={Boolean(errors[key])} />
    {errors[key] && <small>{errors[key]}</small>}</label>;
  const reference = (key: string, label: string, target: Resource, multiple = false, parentBook?: string) => <div key={key}>
    <ReferencePicker label={label} resource={target} value={multiple ? values[key] as string[] : text(key) ? [text(key)] : []}
      onChange={ids => set(key,multiple ? ids : ids[0] ?? '')} multiple={multiple} bookId={parentBook} />
    {errors[key] && <p className="text-red-700 text-sm">{errors[key]}</p>}</div>;
  return <form className="editorial-card my-5" onSubmit={event => {
    event.preventDefault(); if (submitting.current || conflict) return;
    const parsed = parseCatalogForm(resource,values);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]),issue.message]))); return; }
    setErrors({}); submitting.current = true;
    const body = resource === 'copies' && item && 'version' in item ? { ...parsed.data,version:item.version } : parsed.data;
    mutation.mutate(body,{ onSettled: () => { submitting.current = false; } });
  }}>
    <h2 className="section-title mb-5">{item ? 'Chỉnh sửa thông tin' : 'Thêm mới'}</h2>
    <fieldset disabled={mutation.isPending} className="catalog-form-grid">
      {['authors','categories','publishers'].includes(resource) && field('name','Tên',resource === 'categories' ? 150 : 200)}
      {resource === 'books' && <>{field('title','Tên tác phẩm',500)}<label className="field">Mô tả<textarea value={text('description')} maxLength={10000} rows={5} onChange={event => set('description',event.target.value)} />{errors.description && <small>{errors.description}</small>}</label>
        {reference('authorIds','Tác giả','authors',true)}{reference('categoryIds','Thể loại','categories',true)}</>}
      {resource === 'editions' && <>{field('isbn13','ISBN-13 (không bắt buộc)',13)}{field('publicationYear','Năm xuất bản (không bắt buộc)',4)}{field('language','Ngôn ngữ (không bắt buộc)',35)}{reference('publisherId','Nhà xuất bản','publishers')}</>}
      {resource === 'branches' && <>{field('code','Mã chi nhánh',30)}{field('name','Tên chi nhánh',200)}<label className="field">Trạng thái<select value={text('status')} onChange={event => set('status',event.target.value)}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Đã vô hiệu hóa</option></select></label></>}
      {resource === 'shelves' && <>{reference('branchId','Chi nhánh','branches')}{field('code','Mã kệ',30)}{field('label','Nhãn kệ',150)}{field('sortOrder','Thứ tự kệ',10)}</>}
      {resource === 'copies' && <>
        {field('barcode','Mã vạch',100)}{reference('shelfId','Kệ sách','shelves')}
        {item && 'version' in item && <p className="text-sm">Ấn bản hiện tại: {item.isbn13 ?? 'Không ISBN'} · {item.bookTitle}. Version {item.version}. Trạng thái {item.status} chỉ đọc.</p>}
        <ReferencePicker label="Tác phẩm để chọn ấn bản" resource="books" value={copyBook ? [copyBook] : []} onChange={ids => { setCopyBook(ids[0] ?? ''); set('editionId',ids.length === 0 && item && 'editionId' in item ? item.editionId : ''); }} />
        {copyBook && <ReferencePicker key={copyBook} label="Ấn bản" resource="editions" bookId={copyBook} value={text('editionId') ? [text('editionId')] : []} onChange={ids => set('editionId',ids[0] ?? '')} />}
        {errors.editionId && <p className="text-red-700 text-sm">{errors.editionId}</p>}
        <p className="text-sm text-muted">Bản sách mới luôn ở trạng thái IN_PROCESS. Không đổi trạng thái lưu thông ở màn hình này.</p>
      </>}
    </fieldset>
    {Object.keys(errors).length > 0 && <p role="alert" className="form-notice mt-4">Kiểm tra các trường chưa hợp lệ trước khi lưu.</p>}
    {mutation.isError && <div role="alert" className="form-notice mt-4">{mutation.error instanceof ApiError && mutation.error.status < 500 ? mutation.error.message : 'Chưa lưu được dữ liệu. Vui lòng tải lại để kiểm tra trước khi thử tiếp.'}
      {conflict && <p className="mt-2">Hủy chỉnh sửa, tải lại bản sách và mở lại biểu mẫu. Không tự ghi đè phiên bản mới.</p>}</div>}
    <div className="flex flex-wrap gap-3 mt-5"><button className="button-primary" type="submit" disabled={mutation.isPending || conflict}>{mutation.isPending ? 'Đang lưu…' : 'Lưu thông tin'}</button>
      <button type="button" className="button-secondary" disabled={mutation.isPending} onClick={onClose}>Hủy chỉnh sửa</button></div>
  </form>;
}
