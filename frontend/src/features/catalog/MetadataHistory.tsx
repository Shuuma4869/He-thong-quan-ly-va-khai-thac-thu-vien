import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../auth/auth-context';
import { listHistory, saveLookup, replayLookup, deleteHistory } from './history-api';
import type { BookMetadata } from './media-api';
import { GoogleAttribution, SourceLink } from './SourceLink';
import './metadata-history.css';

export function MetadataHistory() {
  const {user}=useAuth();
  return user ? <HistoryContent key={user.id} ownerId={user.id}/> : null;
}
function HistoryContent({ownerId}:{ownerId:string}) {
  const client=useQueryClient();
  const [isbn,setIsbn]=useState(''); const [filter,setFilter]=useState('');
  const [draftFilter,setDraftFilter]=useState(''); const [page,setPage]=useState(0);
  const [books,setBooks]=useState<BookMetadata[]>([]); const [notice,setNotice]=useState('');
  const [removing,setRemoving]=useState<string|null>(null);
  const history=useQuery({queryKey:['metadata-history',ownerId,page,filter],queryFn:({signal})=>listHistory(page,filter,signal),retry:false});
  const refresh=()=>client.invalidateQueries({queryKey:['metadata-history',ownerId]});
  const lookup=useMutation({mutationFn:()=>saveLookup(isbn),onSuccess:async result=>{
    setBooks(result.lookup.candidates); setNotice('Đã lưu lịch sử tra cứu. '+result.lookup.attempts.map(a=>`${a.provider}: ${a.status}`).join(' · ')); await refresh();
  }});
  const replay=useMutation({mutationFn:replayLookup,onSuccess:result=>{
    setBooks(result.candidates);setNotice('Kết quả tra lại nguồn hiện tại. '+result.attempts.map(a=>`${a.provider}: ${a.status}`).join(' · '));
  }});
  const removal=useMutation({mutationFn:deleteHistory,onSuccess:async()=>{
    setRemoving(null);setBooks([]);setNotice('Đã xóa bản ghi lịch sử.');await refresh();
  }});
  const busy=lookup.isPending||replay.isPending||removal.isPending;
  const begin=()=>{setBooks([]);setNotice('');lookup.reset();replay.reset();removal.reset();};
  return <section className="metadata-history editorial-card my-5" aria-labelledby="history-heading">
    <h2 id="history-heading" className="section-title">Lịch sử tra cứu ISBN của tôi</h2>
    <p>Chỉ lưu ISBN, nguồn, trạng thái và thời điểm. Mở lại sẽ tra nguồn hiện tại; không lưu nội dung provider và không tự sửa Catalog.</p>
    <Form onSubmit={event=>{event.preventDefault();begin();lookup.mutate();}}>
      <Form.Group controlId="history-isbn"><Form.Label>ISBN-13 cần tra và lưu</Form.Label>
        <Form.Control value={isbn} onChange={event=>setIsbn(event.target.value)} required pattern="[0-9]{13}" maxLength={13} inputMode="numeric"/>
      </Form.Group>
      <Button type="submit" disabled={busy||!/^\d{13}$/.test(isbn)}>Tra cứu và lưu lịch sử</Button>
    </Form>
    <Form onSubmit={event=>{event.preventDefault();setPage(0);setFilter(draftFilter);}}>
      <Form.Group controlId="history-filter"><Form.Label>Lọc lịch sử theo đầu ISBN</Form.Label>
        <Form.Control value={draftFilter} onChange={event=>setDraftFilter(event.target.value)} pattern="[0-9]{0,13}" maxLength={13} inputMode="numeric"/>
      </Form.Group><Button variant="secondary" type="submit" disabled={busy}>Lọc lịch sử</Button>
    </Form>
    {busy&&<p role="status"><Spinner animation="border" size="sm" aria-hidden="true"/> Đang xử lý…</p>}
    {notice&&<p role="status">{notice}</p>}
    {(lookup.isError||replay.isError||removal.isError)&&<Alert variant="danger">Không hoàn tất thao tác. Kiểm tra ISBN, kết nối và quyền; tải lại lịch sử trước khi thử lại nếu đã chờ quá lâu.</Alert>}
    {books.map(book=>{
      const content=<article><h3>{book.title}</h3><p>{book.authors.join(', ')} · {book.isbn13}</p>
        <SourceLink href={book.sourceUrl}>Nguồn {book.source}</SourceLink><p>Đối chiếu thông tin này khi nhập biểu mẫu biên mục. Chưa ghi vào Book hoặc Edition.</p></article>;
      return book.source==='google-books'?<GoogleAttribution key={book.sourceId}>{content}</GoogleAttribution>:<div key={`${book.source}:${book.sourceId}`}>{content}</div>;
    })}
    {history.isPending?<p role="status">Đang tải lịch sử…</p>:history.isError?<Alert variant="danger">Không tải được lịch sử. <Button onClick={()=>void history.refetch()}>Thử lại</Button></Alert>:<>
      {!history.data.items.length&&<p>Chưa có bản ghi ở trang này.</p>}
      <ul>{history.data.items.map(item=><li key={item.id}>
        <strong>{item.isbn13}</strong> · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time>
        <p>{item.attempts.map(a=>`${a.provider}: ${a.status}`).join(' · ')}</p>
        <Button variant="secondary" disabled={busy} onClick={()=>{begin();replay.mutate(item.id);}}>Mở lại {item.isbn13}</Button>
        <Button variant="danger" disabled={busy} onClick={()=>{removal.reset();setRemoving(item.id);}}>Xóa {item.isbn13}</Button>
        {removing===item.id&&<div role="group" aria-label={`Xác nhận xóa ${item.isbn13}`}><p>Chỉ xóa lịch sử của bạn, không xóa sách.</p>
          <Button disabled={busy} onClick={()=>removal.mutate(item.id)}>Xác nhận xóa lịch sử</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>setRemoving(null)}>Giữ lại</Button></div>}
      </li>)}</ul>
      <nav aria-label="Phân trang lịch sử"><Button variant="secondary" disabled={busy||page===0} onClick={()=>setPage(page-1)}>Trang trước</Button>
        <span>Trang {page+1} · {history.data.page.totalElements} bản ghi</span>
        <Button variant="secondary" disabled={busy||page+1>=history.data.page.totalPages} onClick={()=>setPage(page+1)}>Trang sau</Button></nav>
    </>}
  </section>;
}
