import type { QueryClient } from '@tanstack/react-query';

// Một tác phẩm được đọc ở nhiều màn hình; cập nhật danh mục phải làm mới cả các projection đó.
export async function invalidateCatalogViews(client: QueryClient) {
  await Promise.all(['catalog', 'catalog-picker', 'catalog-media', 'global-search', 'landing', 'directory', 'directory-images',
    'library-book-cards', 'admin-review-books', 'staff-dashboard', 'admin-dashboard']
    .map(key => client.invalidateQueries({ queryKey: [key] })));
}
