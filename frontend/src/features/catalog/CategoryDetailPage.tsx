import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookList } from './BookList';
import { getBooks, getCatalogItem } from './catalog-api';
import { CatalogError, Pagination } from './CatalogStates';

export function CategoryDetailPage() {
  const { categoryId = '' } = useParams();
  return <CategoryDetail key={categoryId} id={categoryId} />;
}

function CategoryDetail({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const category = useQuery({ queryKey: ['catalog', 'category', id],
    queryFn: ({ signal }) => getCatalogItem('categories', id, signal), retry: false });
  const books = useQuery({ queryKey: ['catalog', 'category-books', id, page],
    queryFn: ({ signal }) => getBooks({ query: '', authorId: '', categoryId: id, categoryTerm: '',
      page, size: 20, sort: 'title' }, signal), enabled: category.isSuccess, retry: false });
  return <section className="shell library-page directory-detail-page py-8"><nav aria-label="Đường dẫn" className="catalog-breadcrumb">
    <Link to="/the-loai">Thể loại</Link><span aria-hidden="true">/</span><span>{category.data && 'name' in category.data ? category.data.name : 'Chi tiết'}</span>
  </nav>
    {category.isPending ? <p role="status">Đang tải thể loại…</p>
      : category.isError ? <CatalogError error={category.error} retry={() => void category.refetch()} />
        : <><header className="category-heading"><p className="eyebrow">Tủ sách theo chủ đề</p><h1 className="page-title">{'name' in category.data ? category.data.name : ''}</h1>
          <p className="mt-2 text-muted">Duyệt các tác phẩm được biên mục theo thể loại này.</p></header>
          {books.isSuccess && <div className="detail-section-heading"><div><p className="eyebrow">Tác phẩm đã biên mục</p><h2>Khám phá trong tủ sách</h2></div><p>{books.data.page.totalElements.toLocaleString('vi-VN')} tác phẩm</p></div>}
          {books.isPending ? <p role="status" className="mt-6">Đang tải tác phẩm…</p>
            : books.isError ? <CatalogError error={books.error} retry={() => void books.refetch()} />
              : <div className="mt-6"><BookList books={books.data.items} /><Pagination page={books.data.page} onChange={setPage} /></div>}
        </>}
  </section>;
}
