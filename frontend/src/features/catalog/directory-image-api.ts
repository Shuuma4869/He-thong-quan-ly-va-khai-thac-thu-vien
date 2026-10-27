import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { safeMediaUrl } from './media-api';

export const directoryImageSchema = z.object({ subjectId: z.string().uuid(), imageUrl: z.string().url().refine(safeMediaUrl),
  source: z.enum(['open-library', 'wikimedia', 'standard-ebooks']), sourceUrl: z.string().url().refine(safeMediaUrl),
  license: z.string(), licenseUrl: z.string().url().refine(safeMediaUrl), attribution: z.string(),
  approvedAt: z.string().datetime(), context: z.enum(['portrait', 'book-cover']) });
export type DirectoryImage = z.infer<typeof directoryImageSchema>;
export async function getDirectoryImages(kind: 'authors' | 'categories', ids: string[], signal?: AbortSignal) {
  if (!ids.length) return [];
  if (ids.length > 20 || new Set(ids).size !== ids.length) throw new Error('Cần từ 1 đến 20 mã khác nhau.');
  const params = new URLSearchParams();
  for (const id of ids) params.append('itemId', z.string().uuid().parse(id));
  return z.array(directoryImageSchema).parse(await coreApi.get<unknown>(`/public/catalog/${kind}/media?${params}`, true, signal));
}
