import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { CatalogMedia } from './CatalogMedia';
import { MediaEditor } from './MediaEditor';
import { GoogleAttribution,SourceLink } from './SourceLink';
import { configureCoreAuth } from '../../shared/api/client';

vi.mock('../auth/auth-context',()=>({useAuth:()=>({user:{id:'11111111-1111-4111-8111-111111111111',roles:['LIBRARIAN']}})}));
const id='22222222-2222-4222-8222-222222222222';
const media={id,source:'wikimedia',sourceId:'File:Writer.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Writer.jpg',imageUrl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Writer.jpg',
  license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Photographer',evidence:'OL1A linked to Q1',mime:'image/jpeg',byteSize:123,
  approvedBy:id,approvedAt:'2026-10-18T00:00:00Z',version:0};
const renderQuery=(child:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{child}</QueryClientProvider>);
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{fetchMock=vi.fn().mockImplementation(async()=>Response.json({media:null}));vi.stubGlobal('fetch',fetchMock);configureCoreAuth({token:()=> 'staff-token',refresh:async()=>false,clear:vi.fn()});});
afterEach(()=>{configureCoreAuth(null);vi.unstubAllGlobals();});

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
