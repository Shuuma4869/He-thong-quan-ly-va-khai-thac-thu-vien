import { z } from 'zod';
import type { CatalogRecord, Resource } from './catalog-api';

export type FormValues = Record<string, string | string[]>;
const requiredText = (max: number) => z.string().transform(value => value.normalize('NFKC').replace(/\s+/gu,' ').trim())
  .pipe(z.string().min(1,'Không được để trống.').max(max,`Tối đa ${max} ký tự.`));
const id = z.string().uuid('Hãy chọn một mục hợp lệ.');
const optionalId = z.union([id,z.literal('')]).transform(value => value || null);
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null);
const numeric = (min: number, max: number) => z.string().regex(/^\d+$/,'Nhập số nguyên hợp lệ.').transform(Number).pipe(z.number().int().min(min).max(max));
const forms = {
  authors: z.object({ name: requiredText(200) }), categories: z.object({ name: requiredText(150) }), publishers: z.object({ name: requiredText(200) }),
  books: z.object({ title: requiredText(500), description: optionalText(10000), authorIds: z.array(id).max(100), categoryIds: z.array(id).max(100) }),
  editions: z.object({ isbn13: z.union([z.string().regex(/^\d{13}$/,'ISBN gồm đúng 13 chữ số.'),z.literal('')]).transform(value => value || null),
    publisherId: optionalId, publicationYear: z.union([numeric(1000,9999),z.literal('')]).transform(value => value === '' ? null : value), language: optionalText(35) }),
  branches: z.object({ code: requiredText(30),name: requiredText(200),status: z.enum(['ACTIVE','DISABLED']) }),
  shelves: z.object({ branchId:id,code:requiredText(30),label:requiredText(150),sortOrder:numeric(0,2147483647) }),
  copies: z.object({ editionId:id,shelfId:id,barcode:requiredText(100) }),
};
export function parseCatalogForm(resource: Resource, values: FormValues) { return forms[resource].safeParse(values); }
export function initialValues(resource: Resource, item?: CatalogRecord): FormValues {
  const defaults: Record<Resource,FormValues> = { authors:{name:''},categories:{name:''},publishers:{name:''},
    books:{title:'',description:'',authorIds:[],categoryIds:[]},editions:{isbn13:'',publisherId:'',publicationYear:'',language:''},
    branches:{code:'',name:'',status:'ACTIVE'},shelves:{branchId:'',code:'',label:'',sortOrder:'0'},copies:{editionId:'',shelfId:'',barcode:''} };
  const values = { ...defaults[resource] };
  if (!item) return values;
  for (const [key,value] of Object.entries(item)) if (key in values) values[key] = value == null ? '' : String(value);
  if ('authors' in item) { values.authorIds = item.authors.map(author => author.id); values.categoryIds = item.categories.map(category => category.id); }
  return values;
}
