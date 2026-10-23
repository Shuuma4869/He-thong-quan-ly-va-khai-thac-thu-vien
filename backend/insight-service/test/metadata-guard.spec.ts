import type { ExecutionContext } from '@nestjs/common';
import { MetadataGuard } from '../src/discovery/metadata/metadata.guard';
import { metadataRateGroup } from '../src/discovery/metadata/metadata-rate-limit';

const previous=process.env.CORE_API_URL;
const providerHandler=()=>undefined;
const historyHandler=()=>undefined;
Reflect.defineMetadata(metadataRateGroup,'history',historyHandler);
const context=(authorization?:string,history=false,setHeader=jest.fn())=>({
  getHandler:()=>history?historyHandler:providerHandler,
  switchToHttp:()=>({getRequest:()=>({headers:{authorization}}),getResponse:()=>({setHeader})}),
}) as unknown as ExecutionContext;
beforeEach(()=>{process.env.CORE_API_URL='http://localhost:8080/api/v1';});
afterEach(()=>{jest.restoreAllMocks();if(previous===undefined)delete process.env.CORE_API_URL;else process.env.CORE_API_URL=previous;});

test.each([undefined,'Basic credentials','Bearer token\r\ninjected','Bearer '+ 'a'.repeat(8193)])('invalid authorization rejected without contacting Core: %s',async value=>{
  const fetch=jest.spyOn(globalThis,'fetch');
  await expect(new MetadataGuard().canActivate(context(value))).rejects.toMatchObject({status:401});
  expect(fetch).not.toHaveBeenCalled();
});
test.each([401,403,500])('Core status %s is not accepted',async status=>{
  jest.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({},{status}));
  await expect(new MetadataGuard().canActivate(context('Bearer token'))).rejects.toMatchObject({status:status===500?503:status});
});
test.each([{roles:[]},{roles:['READER']}])('current nonstaff roles cannot look up metadata: %j',async({roles})=>{
  jest.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({id:'reader',roles}));
  await expect(new MetadataGuard().canActivate(context('Bearer old-staff-token'))).rejects.toMatchObject({status:403});
});
test('staff permission is checked on every request; rate limit is per user',async()=>{
  const fetch=jest.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({id:'staff',roles:['LIBRARIAN']}));
  const guard=new MetadataGuard();
  for(let i=0;i<10;i++) expect(await guard.canActivate(context('Bearer token'))).toBe(true);
  await expect(guard.canActivate(context('Bearer token'))).rejects.toMatchObject({status:429});
  expect(fetch).toHaveBeenCalledTimes(11);
  expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/auth/me',expect.objectContaining({redirect:'error',headers:{Authorization:'Bearer token'},signal:expect.any(AbortSignal)}));
  fetch.mockResolvedValueOnce(Response.json({id:'other',roles:['ADMIN']}));
  expect(await guard.canActivate(context('Bearer other-token'))).toBe(true);
});
test('Core unavailable fails closed',async()=>{
  jest.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline'));
  await expect(new MetadataGuard().canActivate(context('Bearer token'))).rejects.toMatchObject({status:503});
});

test('history quota does not spend or bypass the provider quota',async()=>{
  jest.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({id:'staff',roles:['LIBRARIAN']}));
  const guard=new MetadataGuard();
  for(let i=0;i<10;i++) await guard.canActivate(context('Bearer token'));
  for(let i=0;i<60;i++) expect(await guard.canActivate(context('Bearer token',true))).toBe(true);
  await expect(guard.canActivate(context('Bearer token'))).rejects.toMatchObject({status:429});
  await expect(guard.canActivate(context('Bearer token',true))).rejects.toMatchObject({status:429});
});

test('exhausting history quota still permits a provider request',async()=>{
  jest.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({id:'staff',roles:['ADMIN']}));
  const guard=new MetadataGuard();
  for(let i=0;i<60;i++) await guard.canActivate(context('Bearer token',true));
  await expect(guard.canActivate(context('Bearer token',true))).rejects.toMatchObject({status:429});
  expect(await guard.canActivate(context('Bearer token'))).toBe(true);
});

test('429 reports remaining seconds and both counters reset after the fixed window',async()=>{
  const clock=jest.spyOn(Date,'now').mockReturnValue(100_000);
  jest.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({id:'staff',roles:['LIBRARIAN']}));
  const guard=new MetadataGuard();
  for(let i=0;i<10;i++) await guard.canActivate(context('Bearer token'));
  for(let i=0;i<60;i++) await guard.canActivate(context('Bearer token',true));
  clock.mockReturnValue(115_001);
  const header=jest.fn();
  await expect(guard.canActivate(context('Bearer token',false,header))).rejects.toMatchObject({status:429});
  expect(header).toHaveBeenCalledWith('Retry-After','45');
  clock.mockReturnValue(160_000);
  expect(await guard.canActivate(context('Bearer token'))).toBe(true);
  expect(await guard.canActivate(context('Bearer token',true))).toBe(true);
});

test('revoked roles remain forbidden after a successful history request',async()=>{
  const fetch=jest.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({id:'staff',roles:['LIBRARIAN']}))
    .mockResolvedValueOnce(Response.json({id:'staff',roles:['READER']}));
  const guard=new MetadataGuard();
  expect(await guard.canActivate(context('Bearer token',true))).toBe(true);
  await expect(guard.canActivate(context('Bearer token',true))).rejects.toMatchObject({status:403});
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('actor storage remains bounded and expired actors release capacity',async()=>{
  const clock=jest.spyOn(Date,'now').mockReturnValue(200_000);
  let id=0;
  jest.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({id:`staff-${id++}`,roles:['LIBRARIAN']}));
  const guard=new MetadataGuard();
  for(let i=0;i<1000;i++) await guard.canActivate(context('Bearer token',i%2===0));
  await expect(guard.canActivate(context('Bearer token',true))).rejects.toMatchObject({status:429});
  clock.mockReturnValue(260_000);
  expect(await guard.canActivate(context('Bearer token',true))).toBe(true);
});
