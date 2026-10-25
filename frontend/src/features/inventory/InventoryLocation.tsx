import { useQuery } from '@tanstack/react-query';
import { getCatalogItem, recordLabel } from '../catalog/catalog-api';

export function InventoryLocation({ owner, branchId, shelfId }: {
  owner: string; branchId: string; shelfId: string | null;
}) {
  const branch = useQuery({ queryKey: ['catalog', owner, 'branches', undefined, 'item', branchId],
    queryFn: ({ signal }) => getCatalogItem('branches', branchId, signal), retry: false, staleTime: 30_000 });
  return <span>{branch.data ? recordLabel(branch.data) : branch.isError ? `Chi nhánh ${branchId}` : 'Đang tải chi nhánh…'}
    {' · '}{shelfId ? <ShelfName owner={owner} id={shelfId}/> : 'Toàn chi nhánh'}</span>;
}

export function ShelfName({ owner, id }: { owner: string; id: string }) {
  const shelf = useQuery({ queryKey: ['catalog', owner, 'shelves', undefined, 'item', id],
    queryFn: ({ signal }) => getCatalogItem('shelves', id, signal), retry: false, staleTime: 30_000 });
  return <span>{shelf.data ? recordLabel(shelf.data) : shelf.isError ? `Kệ ${id}` : 'Đang tải kệ…'}</span>;
}
