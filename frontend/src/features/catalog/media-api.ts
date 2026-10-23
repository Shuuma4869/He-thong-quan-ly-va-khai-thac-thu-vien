import { z } from 'zod';
import { coreApi, insightApi } from '../../shared/api/client';

export type MediaKind = 'editions' | 'authors';
const trustedHosts = ['openlibrary.org','covers.openlibrary.org','books.google.com','commons.wikimedia.org','upload.wikimedia.org','creativecommons.org','archive.org','developers.google.com'];
export function safeMediaUrl(value: string) {
  try { const url=new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && trustedHosts.includes(url.hostname); } catch { return false; }
}
const url=z.string().url().refine(safeMediaUrl);
export const mediaSchema=z.object({id:z.string().uuid(),source:z.enum(['open-library','google-books','wikimedia']),sourceId:z.string(),sourceUrl:url,imageUrl:url,
  license:z.string(),licenseUrl:url,attribution:z.string(),evidence:z.string(),mime:z.string(),byteSize:z.number().int().positive(),
  approvedBy:z.string().uuid(),approvedAt:z.string().datetime(),version:z.number().int().nonnegative()});
export type Media=z.infer<typeof mediaSchema>;
const mediaCandidate=z.object({source:z.enum(['open-library','google-books','wikimedia']),source_id:z.string(),source_url:url,image_url:url,thumbnail_url:url,
  license:z.string().nullable(),attribution:z.string().nullable(),verified:z.literal(false),fetched_at:z.string(),evidence:z.object({isbn13:z.string().optional(),openLibraryAuthorId:z.string().optional(),wikidataId:z.string().optional()})});
export type Candidate=z.infer<typeof mediaCandidate>;
const bookMetadata=z.object({source:z.string(),sourceId:z.string(),sourceUrl:url,fetchedAt:z.string(),title:z.string(),authors:z.array(z.string()),isbn13:z.string(),media:mediaCandidate.nullable()});
export type BookMetadata=z.infer<typeof bookMetadata>;
export const bookLookupSchema=z.object({attempts:z.array(z.object({provider:z.string(),status:z.string()})),candidates:z.array(bookMetadata)});
export async function getMedia(kind:MediaKind,id:string,signal?:AbortSignal) {
  return z.object({media:mediaSchema.nullable()}).parse(await coreApi.get<unknown>(`/catalog-media/${kind}/${id}`,true,signal)).media;
}
export async function approveMedia(kind:MediaKind,id:string,body:unknown) { return mediaSchema.parse(await coreApi.post<unknown>(`/catalog-media/${kind}/${id}`,body)); }
export function removeMedia(kind:MediaKind,id:string,version:number) { return coreApi.delete<void>(`/catalog-media/${kind}/${id}?version=${version}`); }
export async function lookupBook(isbn:string) {
  return z.object({attempts:z.array(z.object({provider:z.string(),status:z.string()})),candidates:z.array(bookMetadata)})
    .parse(await insightApi.get<unknown>(`/metadata/books/${encodeURIComponent(isbn)}`));
}
export async function lookupAuthor(id:string) {
  return z.object({status:z.string(),candidates:z.array(mediaCandidate)}).parse(await insightApi.get<unknown>(`/metadata/authors/${encodeURIComponent(id)}`));
}
