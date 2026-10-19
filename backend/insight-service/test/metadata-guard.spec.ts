import type { ExecutionContext } from '@nestjs/common';
import { MetadataGuard } from '../src/discovery/metadata/metadata.guard';

const previous=process.env.CORE_API_URL;
const context=(authorization?:string)=>({switchToHttp:()=>({getRequest:()=>({headers:{authorization}})})}) as ExecutionContext;
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
