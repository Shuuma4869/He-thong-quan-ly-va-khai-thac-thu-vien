import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { QueryClient,QueryClientProvider,useQuery } from '@tanstack/react-query';
import { getRecentBooks } from './catalog-api';
import { CatalogMedia } from './CatalogMedia';
import { MediaEditor } from './MediaEditor';
import { GoogleAttribution,SourceLink } from './SourceLink';
import { configureCoreAuth } from '../../shared/api/client';
import { ReferencePicker } from './ReferencePicker';
import { invalidateCatalogViews } from './catalog-cache';
import { MemoryRouter } from 'react-router-dom';
import { SearchCommand } from './SearchCommand';

vi.mock('../auth/auth-context',()=>({useAuth:()=>({user:{id:'11111111-1111-4111-8111-111111111111',roles:['LIBRARIAN']}})}));
const id='22222222-2222-4222-8222-222222222222';
const media={id,source:'wikimedia',sourceId:'File:Writer.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Writer.jpg',imageUrl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Writer.jpg',
  license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Photographer',evidence:'OL1A linked to Q1',mime:'image/jpeg',byteSize:123,
  approvedBy:id,approvedAt:'2026-10-18T00:00:00Z',version:0};
const renderQuery=(child:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{child}</QueryClientProvider>);
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{fetchMock=vi.fn().mockImplementation(async()=>Response.json({media:null}));vi.stubGlobal('fetch',fetchMock);configureCoreAuth({token:()=> 'staff-token',refresh:async()=>false,clear:vi.fn()});});
afterEach(()=>{configureCoreAuth(null);vi.unstubAllGlobals();});

it('tìm kiếm chung bỏ tên sách cũ ngay sau khi danh mục được sửa', async () => {
  let title = 'Sách trước cập nhật';
  fetchMock.mockImplementation(async (url: string) => {
    const items = new URL(url).pathname.endsWith('/books') ? [{ id, title, description: null, authors: [], categories: [] }] : [];
    return Response.json({ items, page: { number: 0, size: 4, totalElements: items.length, totalPages: items.length ? 1 : 0 } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SearchCommand/>
    <button onClick={() => { title = 'Sách sau cập nhật'; void invalidateCatalogViews(client); }}>Hoàn tất sửa tên sách</button>
  </MemoryRouter></QueryClientProvider>);
  const search = screen.getByRole('combobox', { name: 'Tìm sách, tác giả và thể loại' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Sách' } });
  await screen.findByRole('option', { name: /Sách trước cập nhật/ });
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất sửa tên sách' }));
  expect(await screen.findByRole('option', { name: /Sách sau cập nhật/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Sách trước cập nhật/ })).not.toBeInTheDocument();
});

it('danh sách chọn tác giả tải tên mới sau khi danh mục thay đổi', async () => {
  let name = 'Tên trước cập nhật';
  fetchMock.mockImplementation(async () => Response.json({ items: [{ id, name }],
    page: { number: 0, size: 20, totalElements: 1, totalPages: 1 } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<QueryClientProvider client={client}><ReferencePicker label="Tác giả" resource="authors" value={[]} onChange={vi.fn()}/>
    <button onClick={() => { name = 'Tên sau cập nhật'; void invalidateCatalogViews(client); }}>Hoàn tất cập nhật danh mục</button>
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tác giả' }));
  await screen.findByText('Tên trước cập nhật');
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lựa chọn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất cập nhật danh mục' }));
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tác giả' }));
  expect(await screen.findByText('Tên sau cập nhật')).toBeInTheDocument();
  expect(screen.queryByText('Tên trước cập nhật')).not.toBeInTheDocument();
});

it('gỡ ảnh cập nhật cả bìa đang được hiển thị ở trang chủ', async () => {
  let approved = true;
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (init.method === 'DELETE') { approved = false; return new Response(null, { status: 204 }); }
    if (url.includes('/public/catalog/books')) return Response.json({ items: [{ id, title: 'Sách thử bìa', description: null,
      authors: [], categories: [], cover: approved ? { ...media, editionId: id } : null }],
      page: { number: 0, size: 8, totalElements: 1, totalPages: 1 } });
    return Response.json({ media: approved ? media : null });
  });
  function RecentCover() {
    const books = useQuery({ queryKey: ['landing', 'recent-books'], queryFn: () => getRecentBooks(), staleTime: Infinity });
    return <p>{books.data?.items[0]?.cover ? 'Trang chủ đang dùng ảnh đã duyệt' : 'Trang chủ dùng bìa chữ'}</p>;
  }
  renderQuery(<><RecentCover/><MediaEditor kind="editions" id={id} title="Sách thử bìa" onClose={vi.fn()}/></>);
  await screen.findByText('Trang chủ đang dùng ảnh đã duyệt');
  fireEvent.click(await screen.findByRole('button', { name: 'Gỡ ảnh đã duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ ảnh' }));
  await waitFor(() => expect(screen.queryByText('Trang chủ đang dùng ảnh đã duyệt')).not.toBeInTheDocument());
  expect(await screen.findByText('Trang chủ dùng bìa chữ')).toBeInTheDocument();
});

it('chưa duyệt hoặc lỗi API thì dùng initials, không hiển thị ảnh ngẫu nhiên',async()=>{
  fetchMock.mockResolvedValue(Response.json({detail:'internal'},{status:500}));
  renderQuery(<CatalogMedia kind="authors" id={id} title="Tác giả A"/>);
  expect(screen.getByLabelText('Chưa có ảnh tác giả đã xác minh')).toBeInTheDocument();
  expect(await screen.findByText(/Chưa tải được thông tin ảnh/)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
it('ảnh đã duyệt giữ license/ghi công và ảnh hỏng quay lại fallback',async()=>{
  fetchMock.mockResolvedValue(Response.json({media}));
  renderQuery(<CatalogMedia kind="authors" id={id} title="Tác giả A"/>);
  const img=await screen.findByRole('img',{name:'Tác giả A'});
  expect(img).toHaveAttribute('referrerpolicy','no-referrer');
  expect(screen.getByText('Photographer')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'CC BY-SA 4.0'})).toHaveAttribute('href',media.licenseUrl);
  fireEvent.error(img);expect(screen.getByLabelText('Chưa có ảnh tác giả đã xác minh')).toBeInTheDocument();
});
it('Google attribution tải lỗi thì nội dung nguồn không hiển thị',()=>{
  render(<GoogleAttribution><p>Nội dung Google</p></GoogleAttribution>);
  expect(screen.queryByText('Nội dung Google')).not.toBeInTheDocument();
  fireEvent.load(screen.getByAltText('Powered by Google'));expect(screen.getByText('Nội dung Google')).toBeInTheDocument();
  fireEvent.error(screen.getByAltText('Powered by Google'));expect(screen.queryByText('Nội dung Google')).not.toBeInTheDocument();
});
it('desktop mở nguồn qua lệnh allowlist, không điều hướng WebView',async()=>{
  const invoke=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('__TAURI__',{core:{invoke}});
  render(<SourceLink href={media.sourceUrl}>Nguồn ảnh</SourceLink>);fireEvent.click(screen.getByRole('link'));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('open_catalog_source',{url:media.sourceUrl}));
});
it('từ chối URL nguồn ngoài allowlist',()=>{
  render(<SourceLink href="https://evil.example/">Nguồn ảnh</SourceLink>);expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('nguồn Gutenberg mở bằng native command nhưng không mở tên miền giả mạo', async () => {
  const invoke = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  render(<><SourceLink href="https://www.gutenberg.org/ebooks/1342">Gutenberg</SourceLink>
    <SourceLink href="https://www.gutenberg.org.evil.test/ebooks/1342">Nguồn giả</SourceLink></>);
  fireEvent.click(screen.getByRole('link', { name: 'Gutenberg' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('open_catalog_source', { url: 'https://www.gutenberg.org/ebooks/1342' }));
  expect(screen.queryByRole('link', { name: 'Nguồn giả' })).not.toBeInTheDocument();
});
it('metadata không có ảnh vẫn được trình bày để đối chiếu và không tự ghi Core',async()=>{
  fetchMock.mockImplementation(async(url:string)=>Response.json(url.includes('/metadata/books/')?{attempts:[{provider:'open-library',status:'ok'}],candidates:[{
    source:'open-library',sourceId:'OL1M',sourceUrl:'https://openlibrary.org/books/OL1M',fetchedAt:'2026-10-18T00:00:00Z',title:'Metadata title',authors:['Writer'],isbn13:'9780140328721',media:null,
  }]}:{media:null}));
  renderQuery(<MediaEditor kind="editions" id={id} isbn="9780140328721" title="Book" onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Search Books / tra nguồn'}));
  expect(await screen.findByRole('heading',{name:'Metadata title'})).toBeInTheDocument();
  expect(screen.getByText('Không có ảnh phù hợp từ nguồn này.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([,init])=>(init as RequestInit).method==='GET')).toBe(true);
});
it('duyệt thủ công gửi bằng chứng và version hiện tại; 409 không tự ghi đè',async()=>{
  fetchMock.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='POST'?Response.json({detail:'Ảnh đã được cập nhật.'},{status:409}):Response.json({media}));
  const close=vi.fn();renderQuery(<MediaEditor kind="authors" id={id} title="Writer" onClose={close}/>);
  await screen.findByRole('heading',{name:'Duyệt ảnh: Writer'});
  fireEvent.change(screen.getByLabelText('Nguồn',{exact:true}),{target:{value:'wikimedia'}});
  for(const [label,value] of Object.entries({'Định danh nguồn':media.sourceId,'URL trang nguồn':media.sourceUrl,'URL ảnh HTTPS':media.imageUrl,'Giấy phép / căn cứ quyền sử dụng':media.license,'URL bằng chứng quyền sử dụng':media.licenseUrl,'Ghi công':media.attribution,'Bằng chứng đúng tác phẩm / tác giả':media.evidence}))
    fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Duyệt và lưu tham chiếu'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ảnh đã được cập nhật.');
  const post=fetchMock.mock.calls.find(([,init])=>(init as RequestInit).method==='POST')!;
  expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({confirmed:true,expectedVersion:0,evidence:media.evidence});
  expect(close).not.toHaveBeenCalled();
});
