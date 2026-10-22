import { afterEach, expect, it, vi } from 'vitest';
import { bookSchema, editionSchema, schemas, recordLabel, resourcePath, catalogParams, getBooks, parseCatalogQuery, saveCatalog } from './catalog-api';
import { parseCatalogForm } from './catalog-form';
import { configureCoreAuth } from '../../shared/api/client';

afterEach(() => { vi.unstubAllGlobals(); configureCoreAuth(null); });
it('schema tách Book và Edition, không suy ISBN hay availability cho Book', () => {
  const id='11111111-1111-4111-8111-111111111111';
  const book={id,title:'Tác phẩm',description:null,authors:[],categories:[]};
  expect(bookSchema.parse(book)).toEqual(book);
  expect(editionSchema.safeParse(book).success).toBe(false);
  expect(resourcePath.bind(null,'editions','wrong')).toThrow();
  expect(resourcePath('editions',id)).toBe(`/books/${id}/editions`);
});
it('tác giả phải có UUID thật, nhãn chỉ dùng tên được trả về', () => {
  expect(schemas.authors.safeParse({id:'name-as-id',name:'Tác giả'}).success).toBe(false);
  const author={id:'11111111-1111-4111-8111-111111111111',name:'Tác giả'};
  expect(recordLabel(schemas.authors.parse(author))).toBe('Tác giả');
});
it('kiểm tra URL, giữ filters và chỉ gửi tham số hỗ trợ', () => {
  expect(parseCatalogQuery(new URLSearchParams('page=-1')).success).toBe(false);
  expect(parseCatalogQuery(new URLSearchParams('authorId=invalid')).success).toBe(false);
  const parsed=parseCatalogQuery(new URLSearchParams('query=a%26b&size=1&page=2&unknown=value'));
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(catalogParams(parsed.data).toString()).toBe('query=a%26b&page=2&size=1');
});
it('không coi payload sai schema là danh sách trống', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[]})));
  await expect(getBooks({query:'',authorId:'',categoryId:'',page:0,size:20})).rejects.toThrow();
});
it('Copy update giữ version, không tự gửi trạng thái lưu thông', async () => {
  const id='11111111-1111-4111-8111-111111111111';
  const fetch=vi.fn().mockResolvedValue(Response.json({id,editionId:id,shelfId:id,branchId:id,shelfCode:'A',bookTitle:'Book',isbn13:null,barcode:'BC',status:'IN_PROCESS',version:3}));
  vi.stubGlobal('fetch',fetch);
  const values=parseCatalogForm('copies',{editionId:id,shelfId:id,barcode:'BC',status:'AVAILABLE'});
  expect(values.success).toBe(true);
  if (values.success) await saveCatalog('copies',{...values.data,version:2},id);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({editionId:id,shelfId:id,barcode:'BC',version:2});
});
it.each(['authors','categories','publishers','books','branches','shelves','copies'] as const)('form %s từ chối dữ liệu trống', resource => {
  expect(parseCatalogForm(resource,{}).success).toBe(false);
});
it('Edition cho phép thiếu ISBN, năm và publisher nhưng không nhận ISBN sai', () => {
  expect(parseCatalogForm('editions',{isbn13:'',publicationYear:'',publisherId:'',language:''}).success).toBe(true);
  expect(parseCatalogForm('editions',{isbn13:'123',publicationYear:'2020',publisherId:'',language:''}).success).toBe(false);
});
