import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../../shared/api/client';
import { approveMedia,getMedia,lookupAuthor,lookupBook,removeMedia,safeMediaUrl,type BookMetadata,type Candidate,type MediaKind } from './media-api';
import { CatalogError } from './CatalogStates';
import { GoogleAttribution,SourceLink } from './SourceLink';

export function MediaEditor({kind,id,isbn,title,onClose}:{kind:MediaKind;id:string;isbn?:string|null;title:string;onClose:()=>void}) {
  const {user}=useAuth(); const client=useQueryClient();
  const current=useQuery({queryKey:['catalog-media',user?.id,kind,id],queryFn:({signal})=>getMedia(kind,id,signal),retry:false});
  const [source,setSource]=useState('open-library'); const [fields,setFields]=useState<Record<string,string>>({sourceId:'',sourceUrl:'',imageUrl:'',license:'',licenseUrl:'',attribution:'',evidence:''});
  const [confirmed,setConfirmed]=useState(false); const [lookupId,setLookupId]=useState(isbn??'');
  const [candidates,setCandidates]=useState<Candidate[]>([]); const [message,setMessage]=useState(''); const [invalid,setInvalid]=useState('');
  const [books,setBooks]=useState<BookMetadata[]>([]);
  const lookup=useMutation({mutationFn:async()=>{
    setCandidates([]); setBooks([]); setMessage('');
    if (kind==='editions') {
      const result=await lookupBook(lookupId); setBooks(result.candidates);
      setMessage(result.attempts.map(item=>`${item.provider}: ${item.status}`).join(' · '));
    } else { const result=await lookupAuthor(lookupId); setCandidates(result.candidates); setMessage(`Tra cứu: ${result.status}`); }
  }});
  const save=useMutation({mutationFn:()=>approveMedia(kind,id,{source,...fields,confirmed,expectedVersion:current.data?.version??null}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['catalog-media']});onClose();}});
  const remove=useMutation({mutationFn:()=>removeMedia(kind,id,current.data!.version),onSuccess:async()=>{await client.invalidateQueries({queryKey:['catalog-media']});onClose();}});
  const [confirmRemoval,setConfirmRemoval]=useState(false);
  const choose=(candidate:Candidate)=>{setSource(candidate.source);setFields({sourceId:candidate.source_id,sourceUrl:candidate.source_url,imageUrl:candidate.image_url,
    license:candidate.license??'',licenseUrl:candidate.source==='wikimedia'?candidate.source_url:'',attribution:candidate.attribution??'',
    evidence:`Nguồn tra cứu: ${JSON.stringify(candidate.evidence)}. `});setConfirmed(false);};
  if (current.isPending) return <p role="status">Đang tải tham chiếu ảnh…</p>;
  if (current.isError) return <CatalogError error={current.error} retry={()=>void current.refetch()} />;
  const labels:Record<string,string>={sourceId:'Định danh nguồn',sourceUrl:'URL trang nguồn',imageUrl:'URL ảnh HTTPS',license:'Giấy phép / căn cứ quyền sử dụng',licenseUrl:'URL bằng chứng quyền sử dụng',attribution:'Ghi công',evidence:'Bằng chứng đúng tác phẩm / tác giả'};
  return <section className="editorial-card my-5"><h2 className="section-title">Duyệt ảnh: {title}</h2>
    <p className="my-3">Không chỉ đối chiếu tên. Kiểm tra ISBN/ấn bản hoặc định danh tác giả, quyền sử dụng và ghi công trên trang nguồn. Ứng viên chưa được duyệt sẽ không hiển thị cho bạn đọc.</p>
    <p className="text-sm text-muted">{current.data?`Đang có ảnh đã duyệt, version ${current.data.version}. Duyệt ảnh mới sẽ thay thế tham chiếu hiện tại.`:'Chưa có ảnh được duyệt.'}</p>
    <div className="my-5"><label className="field">{kind==='editions'?'ISBN tra cứu':'Định danh Open Library (ví dụ OL23919A)'}<input value={lookupId} onChange={event=>setLookupId(event.target.value)} maxLength={40}/></label>
      <button className="button-secondary mt-3" disabled={lookup.isPending || !(kind==='editions'?/^\d{13}$/:/^OL[1-9]\d*A$/).test(lookupId)} onClick={()=>lookup.mutate()}>{lookup.isPending?'Đang tra cứu…':'Search Books / tra nguồn'}</button>
      {lookup.isError&&<p role="alert">Không tra được nguồn lúc này. Bạn vẫn có thể nhập tham chiếu và bằng chứng đã kiểm tra.</p>}
      {message&&<p role="status" className="mt-3">{message}</p>}
      {books.map(book=>{
        const content=<div className="my-3"><h3 className="font-semibold">{book.title}</h3><p>{book.authors.join(', ') || 'Nguồn chưa cung cấp tác giả'} · ISBN {book.isbn13}</p>
          <p className="text-sm">Truy xuất: {new Date(book.fetchedAt).toLocaleString('vi-VN')}. Chỉ để đối chiếu, không tự cập nhật Catalog.</p>
          <SourceLink href={book.sourceUrl}>Xem nguồn {book.source}</SourceLink>
          {book.media?<><p className="text-sm">{book.media.license??'Cần kiểm tra quyền sử dụng ảnh.'}</p><button className="button-secondary mt-2" onClick={()=>choose(book.media!)}>Điền tham chiếu để kiểm tra</button></>:<p className="text-sm">Không có ảnh phù hợp từ nguồn này.</p>}</div>;
        return <div key={`${book.source}:${book.sourceId}`}>{book.source==='google-books'?<GoogleAttribution>{content}</GoogleAttribution>:content}</div>;
      })}
      {candidates.map(candidate=>{
        const content=<div className="my-3"><SourceLink href={candidate.source_url}>Xem nguồn {candidate.source}</SourceLink><p className="text-sm">{candidate.license??'Nguồn chưa cung cấp giấy phép ảnh; cần kiểm tra quyền sử dụng.'}</p><button className="button-secondary mt-2" onClick={()=>choose(candidate)}>Điền tham chiếu để kiểm tra</button></div>;
        return <div key={`${candidate.source}:${candidate.source_id}`}>{candidate.source==='google-books'?<GoogleAttribution>{content}</GoogleAttribution>:content}</div>;
      })}
    </div>
    <form onSubmit={event=>{event.preventDefault();if(save.isPending)return;
      if(!confirmed || Object.values(fields).some(value=>!value.trim()) || !['sourceUrl','imageUrl','licenseUrl'].every(key=>safeMediaUrl(fields[key]))) {setInvalid('Điền đủ thông tin, URL HTTPS đúng nguồn và xác nhận kiểm tra trước khi duyệt.');return;}setInvalid('');save.mutate();}}>
      <fieldset disabled={save.isPending || remove.isPending} className="catalog-form-grid"><label className="field">Nguồn<select value={source} onChange={event=>setSource(event.target.value)}><option value="open-library">Open Library</option><option value="wikimedia">Wikimedia Commons</option><option value="standard-ebooks">Standard Ebooks</option><option value="google-books">Google Books</option></select></label>
        {Object.entries(labels).map(([key,label])=><label className="field" key={key}>{label}<input value={fields[key]} onChange={event=>setFields(previous=>({...previous,[key]:event.target.value}))} required maxLength={key==='sourceId'||key==='license'?500:key.endsWith('Url')?2048:2000}/></label>)}
        <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />Tôi đã xác minh đúng tác phẩm/tác giả và có căn cứ sử dụng, ghi công ảnh này.</label>
      </fieldset>
      {invalid&&<p role="alert" className="form-notice mt-3">{invalid}</p>}
      {save.isError&&<p role="alert" className="form-notice mt-3">{save.error instanceof ApiError&&save.error.status<500?save.error.message:'Không lưu được tham chiếu ảnh.'}</p>}
      <div className="flex flex-wrap gap-3 mt-4"><button className="button-primary" disabled={save.isPending||remove.isPending} type="submit">{save.isPending?'Đang kiểm tra ảnh…':'Duyệt và lưu tham chiếu'}</button>
        <button className="button-secondary" disabled={save.isPending||remove.isPending} type="button" onClick={onClose}>Đóng</button>
        {current.data&&<button className="button-secondary" type="button" disabled={save.isPending||remove.isPending} onClick={()=>setConfirmRemoval(true)}>Gỡ ảnh đã duyệt</button>}</div>
    </form>
    {confirmRemoval&&<div role="alertdialog" aria-label="Xác nhận gỡ ảnh" className="my-4"><p>Gỡ tham chiếu ảnh này? Không xóa file ở nhà cung cấp.</p><button className="button-secondary" disabled={remove.isPending} onClick={()=>remove.mutate()}>Xác nhận gỡ ảnh</button><button className="button-secondary" disabled={remove.isPending} onClick={()=>setConfirmRemoval(false)}>Giữ ảnh</button>{remove.isError&&<p role="alert">Không gỡ được ảnh. Hãy tải lại dữ liệu.</p>}</div>}
  </section>;
}
