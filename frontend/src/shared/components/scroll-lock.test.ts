import { expect, it } from 'vitest';
import { lockBodyScroll } from './scroll-lock';

it.each([true, false])('giữ khóa đến khi lớp cuối đóng, đóng lớp cha trước: %s', parentFirst => {
  const original = document.body.style.overflow;
  document.body.style.overflow = 'auto';
  const parent = lockBodyScroll(), child = lockBodyScroll();
  try {
    (parentFirst ? parent : child)();
    expect(document.body.style.overflow).toBe('hidden');
    (parentFirst ? child : parent)();
    expect(document.body.style.overflow).toBe('auto');
  } finally { parent(); child(); document.body.style.overflow = original; }
});

it('cleanup lặp không mở khóa khi lớp phủ khác còn hoạt động', () => {
  const original = document.body.style.overflow;
  const first = lockBodyScroll(), second = lockBodyScroll();
  try {
    first(); first();
    expect(document.body.style.overflow).toBe('hidden');
    second();
    expect(document.body.style.overflow).toBe(original);
  } finally { first(); second(); }
});
