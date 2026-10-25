import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

export const pageSchema = z.object({ number: z.number().int().nonnegative(), size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() });
const named = z.object({ id: z.string().uuid(), name: z.string() });
export const publicCoverSchema = z.object({ editionId: z.string().uuid(), imageUrl: z.string().url(),
  source: z.enum(['open-library', 'wikimedia']), sourceUrl: z.string().url(), license: z.string(), licenseUrl: z.string().url(),
  attribution: z.string(), approvedAt: z.string().datetime() });
export type PublicCover = z.infer<typeof publicCoverSchema>;
export const bookSchema = z.object({ id: z.string().uuid(), title: z.string(), description: z.string().nullable(),
  authors: z.array(named), categories: z.array(named), cover: publicCoverSchema.nullable().optional(),
  averageRating: z.number().min(1).max(5).nullable().optional(), ratingCount: z.number().int().nonnegative().optional() });
export const editionSchema = z.object({ id: z.string().uuid(), bookId: z.string().uuid(), bookTitle: z.string().nullable(),
  isbn13: z.string().nullable(), publisherId: z.string().uuid().nullable(), publisherName: z.string().nullable(),
  publicationYear: z.number().int().nullable(), language: z.string().nullable() });
const branchSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), status: z.enum(['ACTIVE', 'DISABLED']) });
const shelfSchema = z.object({ id: z.string().uuid(), branchId: z.string().uuid(), branchCode: z.string(),
  code: z.string(), label: z.string(), sortOrder: z.number().int() });
const copySchema = z.object({ id: z.string().uuid(), editionId: z.string().uuid(), bookTitle: z.string(), isbn13: z.string().nullable(),
  shelfId: z.string().uuid(), shelfCode: z.string(), branchId: z.string().uuid(), barcode: z.string(), status: z.string(), version: z.number().int().nonnegative() });
export const schemas = { authors: named, categories: named, publishers: named, books: bookSchema,
  editions: editionSchema, branches: branchSchema, shelves: shelfSchema, copies: copySchema };
export type Resource = keyof typeof schemas;
export type Book = z.infer<typeof bookSchema>;
export type Edition = z.infer<typeof editionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type CatalogRecord = z.infer<(typeof schemas)[Resource]>;
export type Named = z.infer<typeof named>;
const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
export const catalogQuerySchema = z.object({ query: z.string().max(500).default(''),
  authorId: z.union([z.string().uuid(), z.literal('')]).default(''), categoryId: z.union([z.string().uuid(), z.literal('')]).default(''),
  page: integer(0, 0, 2147483647), size: integer(20, 1, 50), sort: z.enum(['title', 'updated']).default('title') });
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export function parseCatalogQuery(params: URLSearchParams) { return catalogQuerySchema.safeParse(Object.fromEntries(params)); }
export function catalogParams(value: CatalogQuery) {
  return new URLSearchParams(Object.entries(value).filter(([key, v]) => v !== '' && (key !== 'sort' || v !== 'title'))
    .map(([k, v]) => [k, String(v)]));
}
export function resourcePath(resource: Resource, bookId?: string) {
  if (resource === 'editions') {
    if (!bookId || !z.string().uuid().safeParse(bookId).success) throw new Error('Chọn tác phẩm trước khi quản lý ấn bản.');
    return `/books/${bookId}/editions`;
  }
  return `/${resource}`;
}
export async function getBooks(value: CatalogQuery, signal?: AbortSignal) {
  return z.object({ items: z.array(bookSchema), page: pageSchema }).parse(await coreApi.get<unknown>(`/public/catalog/books?${catalogParams(value)}`, true, signal));
}
export async function getRecentBooks(signal?: AbortSignal) {
  return z.object({ items: z.array(bookSchema), page: pageSchema }).parse(await coreApi.get<unknown>('/public/catalog/books?sort=updated&size=8', true, signal));
}
export async function getPublicCategories(signal?: AbortSignal) {
  return z.object({ items: z.array(named), page: pageSchema }).parse(
    await coreApi.get<unknown>('/public/catalog/categories?size=50', true, signal));
}
export async function getBook(id: string, signal?: AbortSignal) { return bookSchema.parse(await coreApi.get<unknown>(`/public/catalog/books/${encodeURIComponent(id)}`, true, signal)); }
export async function getAuthor(id: string, signal?: AbortSignal) { return named.parse(await coreApi.get<unknown>(`/public/catalog/authors/${encodeURIComponent(id)}`, true, signal)); }
export async function getEditions(bookId: string, page: number, signal?: AbortSignal) {
  return z.object({ items: z.array(editionSchema), page: pageSchema }).parse(await coreApi.get<unknown>(`/public/catalog/books/${encodeURIComponent(bookId)}/editions?page=${page}&size=20`, true, signal));
}
export async function getCatalogPage(resource: Resource, page: number, signal?: AbortSignal, bookId?: string) {
  const path = resource === 'authors' || resource === 'categories'
    ? `/public/catalog/${resource}` : resourcePath(resource, bookId);
  return z.object({ items: z.array(schemas[resource]), page: pageSchema }).parse(
    await coreApi.get<unknown>(`${path}?page=${page}&size=20`, true, signal));
}
export async function getCatalogItem(resource: Resource, id: string, signal?: AbortSignal, bookId?: string) {
  const path = resource === 'authors' || resource === 'categories'
    ? `/public/catalog/${resource}` : resourcePath(resource, bookId);
  return schemas[resource].parse(await coreApi.get<unknown>(`${path}/${encodeURIComponent(id)}`, true, signal));
}
export async function saveCatalog(resource: Resource, body: unknown, id?: string, bookId?: string) {
  const path = resourcePath(resource, bookId);
  return schemas[resource].parse(id ? await coreApi.patch<unknown>(`${path}/${id}`, body) : await coreApi.post<unknown>(path, body));
}
export function deleteCatalog(resource: Resource, id: string, bookId?: string) {
  return coreApi.delete<void>(`${resourcePath(resource, bookId)}/${id}`);
}
export function recordLabel(item: CatalogRecord) {
  if ('title' in item) return item.title;
  if ('barcode' in item) return `${item.barcode} · ${item.bookTitle}`;
  if ('isbn13' in item) return `${item.isbn13 ?? 'Không ISBN'} · ${item.publicationYear ?? 'Chưa rõ năm'} · ${item.publisherName ?? 'Chưa có NXB'}`;
  if ('label' in item) return `${item.branchCode} / ${item.code} · ${item.label}`;
  if ('code' in item) return `${item.code} · ${item.name}`;
  return item.name;
}
