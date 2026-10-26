import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

/** Read RFC-style CSV, including quoted newlines, without loading the feed into memory. */
export async function* csvRows(path) {
  const input = createReadStream(path).pipe(createGunzip());
  input.setEncoding('utf8');
  let field = '';
  let row = [];
  let quoted = false;
  let quotePending = false;
  let skipLf = false;
  for await (const chunk of input) {
    for (const char of chunk) {
      if (quoted) {
        if (quotePending) {
          if (char === '"') { field += '"'; quotePending = false; continue; }
          quoted = false;
          quotePending = false;
        } else if (char === '"') {
          quotePending = true;
          continue;
        } else {
          field += char;
          continue;
        }
      }
      if (skipLf) { skipLf = false; if (char === '\n') continue; }
      if (char === '"' && field === '') { quoted = true; continue; }
      if (char === ',') { row.push(field); field = ''; continue; }
      if (char === '\r' || char === '\n') {
        row.push(field); field = '';
        yield row;
        row = [];
        skipLf = char === '\r';
        continue;
      }
      field += char;
    }
  }
  if (quoted && !quotePending) throw new Error('CSV kết thúc trong một ô có dấu nháy chưa đóng.');
  if (field !== '' || row.length > 0) { row.push(field); yield row; }
}

export const tidy = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
export const titleKey = value => tidy(value).normalize('NFD').replace(/\p{M}/gu, '')
  .replaceAll('đ', 'd').replaceAll('Đ', 'D').toLocaleLowerCase('en');

export function authorNames(raw) {
  return [...new Set(String(raw ?? '').split(';').map(piece => {
    if (/\[[^\]]+\]/u.test(piece)) return '';
    const withoutDates = piece.replace(/,\s*\d{3,4}(?:-\d{0,4})?\s*$/u, '');
    const name = tidy(withoutDates);
    const comma = name.indexOf(',');
    return comma > 0 ? tidy(`${name.slice(comma + 1)} ${name.slice(0, comma)}`) : name;
  }).filter(name => name && name.length <= 200))];
}

export function bookshelfNames(raw) {
  const values = String(raw ?? '').split(';').map(value => tidy(tidy(value).replace(/^(?:Category:\s*)+/iu, '')))
    .filter(value => value && value.length <= 150 && value !== 'Best Books Ever Listings');
  return [...new Set(values)];
}
