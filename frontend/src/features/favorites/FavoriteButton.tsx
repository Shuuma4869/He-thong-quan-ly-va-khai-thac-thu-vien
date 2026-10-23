import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { favoriteState, removeFavorite, saveFavorite } from '../my-library/library-api';
import { LibraryError } from '../my-library/LibraryError';

export function FavoriteButton({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  return user ? <FavoriteControl key={`${user.id}:${bookId}`} owner={user.id} book={bookId}/> : null;
}
function FavoriteControl({ owner, book }: { owner: string; book: string }) {
  const client = useQueryClient();
  const sending = useRef(false);
  const state = useQuery({ queryKey: ['favorites', owner, 'state', book], queryFn: ({ signal }) => favoriteState(book, signal), retry: false, staleTime: 0 });
  const change = useMutation({ mutationFn: async (saved: boolean) => { if (saved) await removeFavorite(book); else await saveFavorite(book); },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['favorites', owner] }); } });
  const toggle = async () => {
    if (sending.current || !state.isSuccess) return;
    sending.current = true;
    try { await change.mutateAsync(state.data.saved); } catch { /* Hiển thị lỗi qua mutation state. */ }
    finally { sending.current = false; }
  };
  return <div className="my-4">
    {state.isPending ? <p role="status">Đang kiểm tra sách đã lưu…</p> : state.isError
      ? <LibraryError error={state.error} retry={() => void state.refetch()}/>
      : <button type="button" className="button-secondary" aria-pressed={state.data.saved}
        disabled={change.isPending || state.isFetching} onClick={() => void toggle()}>
        {change.isPending ? 'Đang lưu thay đổi…' : state.data.saved ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
      </button>}
    {change.isError && <LibraryError error={change.error} retry={() => void state.refetch()}/>}
  </div>;
}
