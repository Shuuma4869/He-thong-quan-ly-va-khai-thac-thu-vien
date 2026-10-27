import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { pageSchema } from './catalog-api';

const uuid = z.string().uuid();
const alias = z.object({ id: uuid, categoryId: uuid, name: z.string(), normalizedAlias: z.string() });
const aliasPage = z.object({ items: z.array(alias), page: pageSchema });
export type CategoryAlias = z.infer<typeof alias>;

export async function listCategoryAliases(page: number, signal?: AbortSignal) {
  const number = z.number().int().min(0).max(1000000).parse(page);
  return aliasPage.parse(await coreApi.get<unknown>(`/category-aliases?page=${number}&size=20`, true, signal));
}
export async function saveCategoryAlias(categoryId: string, name: string, id?: string) {
  const body = { categoryId: uuid.parse(categoryId), name: z.string().trim().min(1).max(150).parse(name) };
  return alias.parse(id ? await coreApi.patch<unknown>(`/category-aliases/${uuid.parse(id)}`, body)
    : await coreApi.post<unknown>('/category-aliases', body));
}
export function deleteCategoryAlias(id: string) {
  return coreApi.delete<void>(`/category-aliases/${uuid.parse(id)}`);
}
