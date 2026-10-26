import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getAuthor, getBooks } from './catalog-api';
import { BookList } from './BookList';
import { CatalogError, Pagination } from './CatalogStates';
import { CatalogMedia } from './CatalogMedia';

export function AuthorDetailPage() {
  const { authorId = '' } = useParams(); return <AuthorDetail key={authorId} id={authorId} />;
}
function AuthorDetail({ id }: { id: string }) {
  const { user } = useAuth(); const [page,setPage] = useState(0);
  const author = useQuery({ queryKey: ['catalog',user?.id,'author',id], queryFn: ({ signal }) => getAuthor(id,signal), retry: false });
  const books = useQuery({ queryKey: ['catalog',user?.id,'author-books',id,page], queryFn: ({ signal }) => getBooks({ authorId:id,categoryId:'',categoryTerm:'',query:'',page,size:20,sort:'title' },signal), enabled: author.isSuccess, retry: false });
  return <section className="shell library-page directory-detail-page py-8"><nav className="catalog-breadcrumb" aria-label="Đường dẫn"><Link to="/tac-gia">Tác giả</Link><span aria-hidden="true">/</span><span>Chi tiết</span></nav>
    {author.isPending ? <p role="status" className="py-8">Đang tải tác giả…</p> : author.isError ? <CatalogError error={author.error} retry={() => void author.refetch()} /> : <>
      <div className="author-heading my-6"><CatalogMedia kind="authors" id={id} title={author.data.name} />
        <div><p className="eyebrow">Gặp gỡ tác giả</p><h1 className="page-title">{author.data.name}</h1><p className="text-muted mt-2">Khám phá những tác phẩm được biên mục dưới tên tác giả này.</p></div></div>
      <div className="detail-section-heading"><div><p className="eyebrow">Danh mục tác phẩm</p><h2>Tác phẩm trong thư viện</h2></div>
        {books.isSuccess && <p>{books.data.page.totalElements.toLocaleString('vi-VN')} tác phẩm</p>}</div>
      {books.isPending ? <p role="status">Đang tải tác phẩm…</p> : books.isError ? <CatalogError error={books.error} retry={() => void books.refetch()} />
        : <><BookList books={books.data.items} /><Pagination page={books.data.page} onChange={setPage} /></>}
    </>}
  </section>;
}
