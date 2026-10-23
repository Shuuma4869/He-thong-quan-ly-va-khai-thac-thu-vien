import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MetadataHistory } from './MetadataHistory';
import { configureCoreAuth } from '../../shared/api/client';

const actor=vi.hoisted(()=>({id:'11111111-1111-4111-8111-111111111111'}));
vi.mock('../auth/auth-context',()=>({useAuth:()=>({user:{id:actor.id}})}));
const record={id:'22222222-2222-4222-8222-222222222222',isbn13:'9780132350884',createdAt:'2026-10-23T00:00:00Z',attempts:[{provider:'open-library',status:'not-found'}]};
const empty={items:[],page:{number:0,size:10,totalElements:0,totalPages:0}};
let fetchMock:ReturnType<typeof vi.fn>;
const show=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MetadataHistory/></QueryClientProvider>);
beforeEach(()=>{actor.id='11111111-1111-4111-8111-111111111111';fetchMock=vi.fn().mockImplementation(async()=>Response.json(empty));vi.stubGlobal('fetch',fetchMock);configureCoreAuth({token:()=> 'staff',refresh:async()=>false,clear:vi.fn()});});
afterEach(()=>{configureCoreAuth(null);vi.unstubAllGlobals();});
it('empty, filter và reload dùng API, không giả dữ liệu',async()=>{
  show();expect(await screen.findByText('Chưa có bản ghi ở trang này.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Lọc lịch sử theo đầu ISBN'),{target:{value:'978'}});
  fireEvent.click(screen.getByRole('button',{name:'Lọc lịch sử'}));
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('isbn=978'),expect.anything()));
});
it('chỉ báo lưu sau response thành công',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='POST'?Response.json({record,lookup:{attempts:record.attempts,candidates:[]}}):Response.json(empty));
  show();await screen.findByText('Chưa có bản ghi ở trang này.');
  fireEvent.change(screen.getByLabelText('ISBN-13 cần tra và lưu'),{target:{value:record.isbn13}});
  fireEvent.click(screen.getByRole('button',{name:'Tra cứu và lưu lịch sử'}));
  expect(await screen.findByText(/Đã lưu lịch sử tra cứu/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/metadata/history'),expect.objectContaining({method:'POST',body:JSON.stringify({isbn13:record.isbn13})}));
});
it('write 503 không báo thành công',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='POST'?Response.json({message:'database down'},{status:503}):Response.json(empty));
  show();await screen.findByText('Chưa có bản ghi ở trang này.');
  fireEvent.change(screen.getByLabelText('ISBN-13 cần tra và lưu'),{target:{value:record.isbn13}});
  fireEvent.click(screen.getByRole('button',{name:'Tra cứu và lưu lịch sử'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Không hoàn tất thao tác');
  expect(screen.queryByText(/Đã lưu lịch sử/)).not.toBeInTheDocument();
});
it('xóa cần xác nhận và dùng ID bản ghi',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='DELETE'?new Response(null,{status:204}):Response.json({...empty,items:[record],page:{...empty.page,totalElements:1,totalPages:1}}));
  show();fireEvent.click(await screen.findByRole('button',{name:`Xóa ${record.isbn13}`}));
  expect(fetchMock.mock.calls.some(([,init])=>init.method==='DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận xóa lịch sử'}));
  expect(await screen.findByText('Đã xóa bản ghi lịch sử.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(record.id),expect.objectContaining({method:'DELETE'}));
});

it('mở lại gọi nguồn hiện tại, không tạo history mới hoặc ghi Core',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='POST'
    ?Response.json({candidates:[],attempts:record.attempts})
    :Response.json({...empty,items:[record],page:{...empty.page,totalElements:1,totalPages:1}}));
  show();fireEvent.click(await screen.findByRole('button',{name:`Mở lại ${record.isbn13}`}));
  expect(await screen.findByText(/Kết quả tra lại nguồn hiện tại/)).toBeInTheDocument();
  const writes=fetchMock.mock.calls.filter(([,init])=>init.method!=='GET');
  expect(writes).toHaveLength(1);expect(writes[0][0]).toContain(`/${record.id}/replay`);
});

it('phân trang gửi query server và lỗi tải có thể thử lại',async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({}, {status:503})).mockImplementation(async()=>Response.json({...empty,page:{...empty.page,totalElements:11,totalPages:2}}));
  show();fireEvent.click(await screen.findByRole('button',{name:'Thử lại'}));
  await screen.findByText('Trang 1 · 11 bản ghi');
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=1'),expect.anything()));
});

it('đổi tài khoản xóa ISBN đang nhập và không hiển thị history của owner cũ',async()=>{
  fetchMock.mockImplementation(async()=>Response.json(actor.id.startsWith('1111')
    ?{...empty,items:[record],page:{...empty.page,totalElements:1,totalPages:1}}:empty));
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=render(<QueryClientProvider client={client}><MetadataHistory/></QueryClientProvider>);
  await screen.findByRole('button',{name:`Mở lại ${record.isbn13}`});
  fireEvent.change(screen.getByLabelText('ISBN-13 cần tra và lưu'),{target:{value:record.isbn13}});
  actor.id='33333333-3333-4333-8333-333333333333';
  view.rerender(<QueryClientProvider client={client}><MetadataHistory/></QueryClientProvider>);
  expect(await screen.findByText('Chưa có bản ghi ở trang này.')).toBeInTheDocument();
  expect(screen.getByLabelText('ISBN-13 cần tra và lưu')).toHaveValue('');
  expect(screen.queryByRole('button',{name:`Mở lại ${record.isbn13}`})).not.toBeInTheDocument();
});
