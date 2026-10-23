import { z } from 'zod';
import { insightApi } from '../../shared/api/client';
import { bookLookupSchema } from './media-api';

const recordSchema = z.object({ id:z.string().uuid(), isbn13:z.string().regex(/^\d{13}$/),
  createdAt:z.string().datetime(), attempts:z.array(z.object({provider:z.string(),status:z.string()})) });
const pageSchema = z.object({ items:z.array(recordSchema), page:z.object({ number:z.number().int().nonnegative(),
  size:z.number().int().positive(), totalElements:z.number().int().nonnegative(), totalPages:z.number().int().nonnegative() }) });
export async function listHistory(page:number,isbn:string,signal?:AbortSignal) {
  const query=new URLSearchParams({page:String(page),size:'10'});
  if(isbn) query.set('isbn',isbn);
  return pageSchema.parse(await insightApi.get<unknown>(`/metadata/history?${query}`,true,signal));
}
export async function saveLookup(isbn13:string) {
  return z.object({record:recordSchema,lookup:bookLookupSchema}).parse(await insightApi.post<unknown>('/metadata/history',{isbn13}));
}
export async function replayLookup(id:string) {
  return bookLookupSchema.parse(await insightApi.post<unknown>(`/metadata/history/${id}/replay`));
}
export function deleteHistory(id:string) { return insightApi.delete<void>(`/metadata/history/${id}`); }
