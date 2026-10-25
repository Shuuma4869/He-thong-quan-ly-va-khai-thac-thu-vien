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
  return <section className="shell py-8"><Link className="text-link" to="/sach">← Danh mục sách</Link>
    {author.isPending ? <p role="status" className="py-8">Đang tải tác giả…</p> : author.isError ? <CatalogError error={author.error} retry={() => void author.refetch()} /> : <>
      <div className="author-heading my-6"><CatalogMedia kind="authors" id={id} title={author.data.name} />
        <div><p className="eyebrow">Tác giả</p><h1 className="page-title">{author.data.name}</h1><p className="text-muted mt-2">Thông tin được quản lý theo định danh tác giả, không gộp theo tên.</p></div></div>
      <h2 className="section-title my-5">Tác phẩm trong thư viện</h2>
      {books.isPending ? <p role="status">Đang tải tác phẩm…</p> : books.isError ? <CatalogError error={books.error} retry={() => void books.refetch()} />
        : <><BookList books={books.data.items} /><Pagination page={books.data.page} onChange={setPage} /></>}
    </>}
  </section>;
}
