import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';

const id='11111111-1111-4111-8111-111111111111',authorId='22222222-2222-4222-8222-222222222222';
const book={id,title:'Tác phẩm thật',description:'Mô tả tác phẩm',authors:[{id:authorId,name:'Tác giả A'}],categories:[]};
const edition={id,bookId:id,bookTitle:book.title,isbn13:'9780140328721',publisherId:null,publisherName:null,publicationYear:1988,language:'en'};
const user={id,memberCode:'TV-1',email:'catalog@example.test',fullName:'Người đọc',roles:['READER']};
const session={accessToken:'test-access',accessTokenExpiresAt:'2030-01-01T00:00:00Z',user};
const page=(items:unknown[],number=0,total=items.length) => ({items,page:{number,size:20,totalElements:total,totalPages:Math.ceil(total/20)}});
let fetchMock:ReturnType<typeof vi.fn>;
let role='READER';
function app(path='/sach') { return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter></AppProviders>); }
function response(url:string) {
  const path=new URL(url).pathname;
  if (path.endsWith('/auth/refresh')) return {...session,user:{...user,roles:[role]}};
  if (path.endsWith(`/me/favorites/${id}`)) return {bookId:id,saved:false};
  if (path.endsWith('/reviews/summary')) return {bookId:id,average:null,count:0};
  if (path.endsWith('/editions')) return page([edition,{...edition,id:authorId,isbn13:null,publicationYear:2024}]);
  if (path.endsWith('/availability')) return { bookId:id, checkedAt:'2026-10-28T00:00:00Z',
    branches:[{ editionId:id, branchId:authorId, branchCode:'CN1', branchName:'Chi nhánh 1',
      catalogedCopies:2, availableCopies:1, waitingHolds:1 }] };
  if (path.endsWith(`/books/${id}`)) return book;
  if (path.endsWith(`/authors/${authorId}`)) return book.authors[0];
  if (path.endsWith('/books')) return page([book],Number(new URL(url).searchParams.get('page')??0),21);
  return page([]);
}
beforeEach(() => { role='READER'; fetchMock=vi.fn((url:string) => Promise.resolve(Response.json(response(url)))); vi.stubGlobal('fetch',fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it('Reader tra sách, phân trang, đồng bộ query và reset trang', async () => {
  app('/sach?query=Tác&page=0&size=20');
  expect(await screen.findByRole('link',{name:book.title},{timeout:5000})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=1'))).toBe(true));
  fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));
  await waitFor(() => expect(screen.getByLabelText('Tìm sách')).toHaveValue(''));
  expect(screen.queryByText(/Số bản sẵn có/)).not.toBeInTheDocument();
});
it('ô tìm nhanh giữ bộ lọc hiện có và đưa từ khóa vào truy vấn server', async () => {
  app('/sach?categoryTerm=Kinh%20dien');
  await screen.findByRole('link',{name:book.title});
  fireEvent.change(screen.getByRole('searchbox',{name:'Từ khóa tra cứu'}),{target:{value:'  Jane Austen  '}});
  fireEvent.click(screen.getByRole('button',{name:'Tìm trong thư viện'}));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
    const target=new URL(String(url));
    return target.pathname.endsWith('/public/catalog/books') && target.searchParams.get('query')==='Jane Austen'
      && target.searchParams.get('categoryTerm')==='Kinh dien' && target.searchParams.get('sort')==='relevance';
  })).toBe(true));
});
it('Reader lọc bằng tên bí danh, giữ URL và xóa bộ lọc', async () => {
  app(); await screen.findByRole('link',{name:book.title});
  fireEvent.change(screen.getByLabelText('Tên thể loại hoặc bí danh'),{target:{value:'  Truyện trinh thám  '}});
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
    new URL(String(url)).searchParams.get('categoryTerm') === 'Truyện trinh thám')).toBe(true));
  fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));
  await waitFor(() => expect(screen.getByLabelText('Tên thể loại hoặc bí danh')).toHaveValue(''));
});
it('debounce giữ focus và phản hồi cũ không ghi đè kết quả mới', async () => {
  let old!:(response:Response)=>void;
  fetchMock.mockImplementation((url:string) => {
    const query=new URL(url).searchParams.get('query');
    if (query==='cũ') return new Promise(resolve => { old=resolve; });
    return Promise.resolve(Response.json(query==='mới'?page([{...book,title:'Kết quả mới'}]):response(url)));
  });
  app(); await screen.findByRole('link',{name:book.title});
  const input=screen.getByLabelText('Tìm sách'); input.focus();
  fireEvent.change(input,{target:{value:'cũ'}}); await waitFor(() => expect(old).toBeDefined());
  fireEvent.change(input,{target:{value:'mới'}}); await screen.findByRole('link',{name:'Kết quả mới'});
  await act(async () => old(Response.json(page([{...book,title:'Kết quả cũ'}]))));
  expect(screen.queryByRole('link',{name:'Kết quả cũ'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('Tìm sách')).toHaveFocus();
});
it('loading, lỗi và retry được phân biệt với empty', async () => {
  let finish!:(response:Response)=>void;
  fetchMock.mockImplementation((url:string) => url.includes('/books?')?new Promise(resolve => {finish=resolve;}):Promise.resolve(Response.json(response(url))));
  app(); expect(await screen.findByText('Đang tải sách…')).toBeInTheDocument();
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish(Response.json({detail:'internal trace'},{status:500})));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('internal trace');
  fetchMock.mockResolvedValue(Response.json(page([])));
  fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));
  expect(await screen.findByText('Chưa có sách phù hợp')).toBeInTheDocument();
});
it('Book Detail tách hai Edition và hiển thị availability thật từ API', async () => {
  app(`/sach/${id}`); expect(await screen.findByRole('heading',{name:book.title})).toBeInTheDocument();
  expect(await screen.findByText('ISBN 9780140328721')).toBeInTheDocument();
  expect(screen.getByText('Ấn bản không có ISBN')).toBeInTheDocument();
  expect(await screen.findByText((_, node) => node?.tagName === 'LI'
    && node.textContent?.includes('Chi nhánh 1: 1 bản sẵn có') === true)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại tình trạng' }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/availability')).length).toBeGreaterThan(1));
  expect(screen.queryByRole('button',{name:/Mượn|Giữ chỗ/})).not.toBeInTheDocument();
});
it('availability hiển thị lỗi, thử lại và trạng thái không có bản vật lý', async () => {
  let failed = false;
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith('/availability')) {
      if (!failed) { failed = true; return Promise.resolve(Response.json({ detail: 'private trace' }, { status: 503 })); }
      return Promise.resolve(Response.json({ bookId: id, checkedAt: '2026-10-28T00:00:00Z', branches: [] }));
    }
    return Promise.resolve(Response.json(response(url)));
  });
  app(`/sach/${id}`);
  const area = await screen.findByLabelText('Tình trạng bản sách');
  expect(await within(area).findByRole('alert')).not.toHaveTextContent('private trace');
  fireEvent.click(within(area).getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findAllByText('Chưa có bản sách vật lý tại chi nhánh đang hoạt động.')).toHaveLength(2);
});
it('Author Detail lấy sách bằng UUID, không giả biography', async () => {
  app(`/tac-gia/${authorId}`); await screen.findByRole('heading',{name:'Tác giả A'});
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`authorId=${authorId}`))).toBe(true));
  expect(screen.getByLabelText('Chưa có chân dung đã duyệt')).toBeInTheDocument();
});
it('404 có link quay lại, URL filter sai không gọi sách', async () => {
  fetchMock.mockImplementation((url:string) => Promise.resolve(url.endsWith('/auth/refresh')?Response.json(session):Response.json({detail:'Không tìm thấy sách.'},{status:404})));
  const view=app(`/sach/${id}`); expect(await screen.findByText('Không tìm thấy dữ liệu')).toBeInTheDocument(); view.unmount();
  fetchMock.mockClear(); app('/sach?size=999'); expect(await screen.findByText('Bộ lọc trong đường dẫn không hợp lệ.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/books?'))).toBe(false);
});
it('Reader không mở được staff route', async () => {
  app('/nhan-vien/danh-muc'); expect(await screen.findByText('403 · Không có quyền truy cập')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/books?'))).toBe(false);
});
it('anonymous mở được danh mục công khai nhưng vẫn không có quyền ghi', async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh')
    ? Response.json({}, { status: 401 }) : Response.json(response(url))));
  app();
  expect(await screen.findByRole('link', { name: book.title })).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/public/catalog/books?'))).toBe(true);
  expect(screen.getAllByRole('link', { name: 'Đăng nhập' }).length).toBeGreaterThan(0);
});
it('refresh 401 của khách không hủy danh mục công khai đang hiển thị', async () => {
  let finishRefresh!: (response: Response) => void;
  fetchMock.mockImplementation((url: string) => url.endsWith('/auth/refresh')
    ? new Promise<Response>(resolve => { finishRefresh = resolve; })
    : Promise.resolve(Response.json(response(url))));
  app();
  expect(await screen.findByRole('link', { name: book.title })).toBeInTheDocument();
  await act(async () => finishRefresh(Response.json({}, { status: 401 })));
  expect(screen.getByRole('link', { name: book.title })).toBeInTheDocument();
  expect(screen.queryByText('Không tải được dữ liệu')).not.toBeInTheDocument();
});
it('staff tạo Author, refetch và delete có xác nhận/FK conflict', async () => {
  role='LIBRARIAN'; let stored=false;
  fetchMock.mockImplementation((url:string,init:RequestInit) => {
    if (url.endsWith('/authors') && init.method==='POST') { stored=true; return Promise.resolve(Response.json({id:authorId,name:'Tác giả mới'},{status:201})); }
    if (url.endsWith(`/authors/${authorId}`) && init.method==='DELETE') return Promise.resolve(Response.json({detail:'Tác giả đang được sách tham chiếu.'},{status:409}));
    return Promise.resolve(Response.json(url.includes('/authors?')?page(stored?[{id:authorId,name:'Tác giả mới'}]:[]):response(url)));
  });
  app('/nhan-vien/danh-muc'); await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Loại dữ liệu'),{target:{value:'authors'}});
  fireEvent.click(screen.getByRole('button',{name:'Thêm tác giả'}));
  fireEvent.change(screen.getByLabelText('Tên'),{target:{value:'Tác giả mới'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thông tin'}));
  expect(await screen.findByText('Đã lưu thông tin.')).toBeInTheDocument();
  const table=await screen.findByRole('table'); expect(within(table).getByText('Tác giả mới')).toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button',{name:'Xóa'}));
  const dialog=screen.getByRole('alertdialog'); fireEvent.click(within(dialog).getByRole('button',{name:'Xác nhận xóa'}));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tác giả đang được sách tham chiếu.');
});
it('staff thêm và xóa bí danh, Reader không gọi API quản trị', async () => {
  role='LIBRARIAN';
  const category={id,name:'Khoa học'};
  let alias:{id:string;categoryId:string;name:string;normalizedAlias:string}|null=null;
  fetchMock.mockImplementation((url:string,init:RequestInit) => {
    const path=new URL(url).pathname;
    if(path.endsWith('/category-aliases') && init.method==='POST') {
      const body=JSON.parse(init.body as string); alias={id:authorId,categoryId:body.categoryId,name:body.name,normalizedAlias:'science'};
      return Promise.resolve(Response.json(alias,{status:201}));
    }
    if(path.endsWith(`/category-aliases/${authorId}`) && init.method==='DELETE') {
      alias=null; return Promise.resolve(new Response(null,{status:204}));
    }
    if(path.endsWith('/category-aliases')) return Promise.resolve(Response.json(page(alias?[alias]:[])));
    if(path.endsWith(`/categories/${id}`)) return Promise.resolve(Response.json(category));
    if(path.endsWith('/categories')) return Promise.resolve(Response.json(page([category])));
    return Promise.resolve(Response.json(response(url)));
  });
  const view=app('/nhan-vien/danh-muc');
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Loại dữ liệu'),{target:{value:'categories'}});
  const manager=await screen.findByRole('region',{name:'Bí danh thể loại'});
  fireEvent.click(within(manager).getByRole('button',{name:'Thêm bí danh'}));
  fireEvent.click(within(manager).getByRole('button',{name:'Chọn thể loại chuẩn'}));
  fireEvent.click(await within(manager).findByRole('radio',{name:'Khoa học'}));
  fireEvent.change(within(manager).getByLabelText('Tên bí danh'),{target:{value:'Science'}});
  fireEvent.click(within(manager).getByRole('button',{name:'Lưu bí danh'}));
  expect(await within(manager).findByText('Đã lưu bí danh thể loại.')).toBeInTheDocument();
  expect(await within(manager).findByText('Science')).toBeInTheDocument();
  fireEvent.click(within(manager).getByRole('button',{name:'Xóa bí danh'}));
  fireEvent.click(within(manager).getByRole('button',{name:'Xác nhận xóa bí danh'}));
  expect(await within(manager).findByText('Chưa có bí danh nào.')).toBeInTheDocument();
  view.unmount();
  role='READER'; fetchMock.mockClear(); app('/nhan-vien/danh-muc');
  expect(await screen.findByText('403 · Không có quyền truy cập')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url])=>String(url).includes('/category-aliases'))).toBe(false);
});
it('Copy conflict không tự retry bằng version mới', async () => {
  role='ADMIN'; const copy={id,editionId:id,bookTitle:book.title,isbn13:null,shelfId:id,branchId:id,shelfCode:'A',barcode:'BC',status:'IN_PROCESS',version:7};
  fetchMock.mockImplementation((url:string,init:RequestInit) => Promise.resolve(init.method==='PATCH'?Response.json({detail:'Bản sách đã được cập nhật.'},{status:409}):Response.json(url.includes('/copies?')?page([copy]):url.endsWith(`/shelves/${id}`)?{id,branchId:id,branchCode:'A',code:'A',label:'Kệ A',sortOrder:0}:response(url))));
  app('/nhan-vien/danh-muc'); await screen.findByRole('table'); fireEvent.change(screen.getByLabelText('Loại dữ liệu'),{target:{value:'copies'}});
  await screen.findByText('BC · Tác phẩm thật'); fireEvent.click(screen.getByRole('button',{name:'Sửa'}));
  fireEvent.change(screen.getByLabelText('Mã vạch'),{target:{value:'BC-new'}}); fireEvent.click(screen.getByRole('button',{name:'Lưu thông tin'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bản sách đã được cập nhật.');
  expect(screen.getByRole('button',{name:'Lưu thông tin'})).toBeDisabled();
  const writes=fetchMock.mock.calls.filter(([,init]) => init.method==='PATCH'); expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toEqual({editionId:id,shelfId:id,barcode:'BC-new',version:7});
});
it('đổi tác phẩm trong Copy phải chọn lại ấn bản trước khi lưu', async () => {
  role='ADMIN'; const copy={id,editionId:id,bookTitle:book.title,isbn13:null,shelfId:id,branchId:id,shelfCode:'A',barcode:'BC',status:'IN_PROCESS',version:7};
  fetchMock.mockImplementation((url:string) => Promise.resolve(Response.json(url.includes('/copies?')?page([copy]):url.includes('/books?')?page([{...book,id:authorId,title:'Tác phẩm khác'}]):url.endsWith(`/shelves/${id}`)?{id,branchId:id,branchCode:'A',code:'A',label:'Kệ A',sortOrder:0}:response(url))));
  app('/nhan-vien/danh-muc'); await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Loại dữ liệu'),{target:{value:'copies'}});
  await screen.findByText('BC · Tác phẩm thật'); fireEvent.click(screen.getByRole('button',{name:'Sửa'}));
  fireEvent.click(screen.getByRole('button',{name:'Chọn tác phẩm để chọn ấn bản'}));
  fireEvent.click(await screen.findByRole('radio',{name:'Tác phẩm khác'}));
  fireEvent.click(screen.getByRole('button',{name:'Lưu thông tin'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Kiểm tra các trường chưa hợp lệ');
  expect(screen.getByText('Hãy chọn một mục hợp lệ.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
});
