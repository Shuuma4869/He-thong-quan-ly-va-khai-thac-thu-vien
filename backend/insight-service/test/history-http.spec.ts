import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HistoryController } from '../src/discovery/metadata/history/history.controller';
import { HistoryService } from '../src/discovery/metadata/history/history.service';
import { HistoryRepository } from '../src/discovery/metadata/history/history.repository';
import { MetadataService } from '../src/discovery/metadata/metadata.service';
import { MetadataGuard } from '../src/discovery/metadata/metadata.guard';
import { MetadataController } from '../src/discovery/metadata/metadata.controller';

// HTTP boundary thật; Core/provider/database doubles chỉ trong suite này.
const owner='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const repository={create:jest.fn(),list:jest.fn(),find:jest.fn(),delete:jest.fn()};
const metadata={book:jest.fn(),author:jest.fn()};
const nativeFetch=globalThis.fetch;
let app:INestApplication;
let base:string;
const previous=process.env.CORE_API_URL;
beforeAll(async()=>{
  const module=await Test.createTestingModule({controllers:[HistoryController,MetadataController],providers:[MetadataGuard,HistoryService,
    {provide:HistoryRepository,useValue:repository},{provide:MetadataService,useValue:metadata}]}).compile();
  app=module.createNestApplication(); app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
beforeEach(()=>{
  jest.clearAllMocks();process.env.CORE_API_URL='http://127.0.0.1:1/api/v1';
  jest.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(String(input)==='http://127.0.0.1:1/api/v1/auth/me') {
      const token=(init?.headers as Record<string,string>)?.Authorization;
      if(token==='Bearer locked')return Response.json({}, {status:403});
      if(token==='Bearer deleted')return Response.json({}, {status:401});
      return Response.json({id:token==='Bearer quota'?id:owner,roles:token==='Bearer reader'?['READER']:['LIBRARIAN']});
    }
    return nativeFetch(input,init);
  });
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{await app?.close();if(previous===undefined)delete process.env.CORE_API_URL;else process.env.CORE_API_URL=previous;});
const request=(path:string,method='GET',body?:unknown,token='staff')=>nativeFetch(`${base}/api/v1/metadata/history${path}`,{
  method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
test.each(['','reader','locked','deleted'])('chặn token không đủ quyền hoặc tài khoản không còn tồn tại: %s',async token=>{
  expect((await request('','GET',undefined,token)).status).toBe(token && token!=='deleted'?403:401);
  expect(repository.list).not.toHaveBeenCalled();
});
test('query/body thừa và UUID sai bị chặn qua HTTP',async()=>{
  expect((await request('?size=101')).status).toBe(400);
  expect((await request('/not-uuid')).status).toBe(400);
  expect((await request('','POST',{isbn13:'9780132350884',ownerId:id})).status).toBe(400);
  expect(repository.create).not.toHaveBeenCalled();
});
test('principal từ Core được dùng cho create và response không lộ token',async()=>{
  metadata.book.mockResolvedValue({attempts:[],candidates:[]});repository.create.mockResolvedValue({id,isbn13:'9780132350884',attempts:[],createdAt:new Date()});
  const response=await request('','POST',{isbn13:'9780132350884'});
  expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(repository.create).toHaveBeenCalledWith(owner,'9780132350884',[]);
  expect(JSON.stringify(await response.json())).not.toContain('Bearer');
});
test('id không thuộc owner trả 404; lỗi DB thành 503 không lộ SQL',async()=>{
  repository.find.mockResolvedValue(null);
  expect((await request(`/${id}`)).status).toBe(404);
  expect(repository.find).toHaveBeenCalledWith(owner,id);
  repository.delete.mockRejectedValue(new Error('SQL secret'));
  const response=await request(`/${id}`,'DELETE');expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('SQL secret');
});

test('HTTP routes keep lookup/replay in provider quota and bound history CRUD separately',async()=>{
  metadata.book.mockResolvedValue({attempts:[],candidates:[]});
  repository.create.mockResolvedValue({id,isbn13:'9780132350884',attempts:[],createdAt:new Date()});
  repository.list.mockResolvedValue({items:[],page:{number:0,size:20,totalElements:0,totalPages:0}});
  repository.find.mockResolvedValue({id,isbn13:'9780132350884',attempts:[],createdAt:new Date()});
  repository.delete.mockResolvedValue({count:1});
  for(let i=0;i<10;i++) expect((await request('','POST',{isbn13:'9780132350884'},'quota')).status).toBe(201);
  const replay=await request(`/${id}/replay`,'POST',undefined,'quota');
  expect(replay.status).toBe(429);
  expect(Number(replay.headers.get('retry-after'))).toBeGreaterThan(0);
  for(const path of ['books/9780132350884','authors/OL1A']) {
    expect((await nativeFetch(`${base}/api/v1/metadata/${path}`,{headers:{Authorization:'Bearer quota'}})).status).toBe(429);
  }
  expect(metadata.book).toHaveBeenCalledTimes(10);
  expect(metadata.author).not.toHaveBeenCalled();
  expect((await request(`/${id}`,'GET',undefined,'quota')).status).toBe(200);
  expect((await request(`/${id}`,'DELETE',undefined,'quota')).status).toBe(204);
  for(let i=0;i<58;i++) expect((await request('','GET',undefined,'quota')).status).toBe(200);
  const exhausted=await request('','GET',undefined,'quota');
  expect(exhausted.status).toBe(429);
  expect(Number(exhausted.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(repository.list).toHaveBeenCalledTimes(58);
});
