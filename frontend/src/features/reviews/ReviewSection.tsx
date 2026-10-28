import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { Pagination } from '../catalog/CatalogStates';
import { LibraryError } from '../my-library/LibraryError';
import { createReview, deleteReview, listReviews, myReviews, ratingSummary, updateReview, type Review, type ReviewInput } from '../my-library/library-api';
import { RatingInput } from './RatingInput';
import { reportReview } from './moderation-api';

export function ReviewSection({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  return user ? <Reviews key={`${user.id}:${bookId}`} book={bookId} owner={user.id}/> : null;
}
function Reviews({ book, owner }: { book: string; owner: string }) {
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['reviews', owner, book, 'list', page], queryFn: ({ signal }) => listReviews(book, page, signal), retry: false });
  const mine = useQuery({ queryKey: ['reviews', owner, book, 'mine'], queryFn: ({ signal }) => myReviews(0, book, signal), retry: false });
  const summary = useQuery({ queryKey: ['reviews', owner, book, 'summary'], queryFn: ({ signal }) => ratingSummary(book, signal), retry: false });
  const refresh = async () => {
    // Hủy cả lượt đọc đầu tiên để phản hồi cũ không ghi lại cache sau khi sửa/xóa.
    await client.cancelQueries({ queryKey: ['reviews', owner] });
    await client.invalidateQueries({ queryKey: ['reviews', owner] });
  };
  return <section className="my-8 border-t border-line pt-6" aria-labelledby="reviews-heading">
    <h2 id="reviews-heading" className="section-title">Đánh giá của bạn đọc</h2>
    {notice && <p role="status">{notice}</p>}
    {summary.isPending ? <p role="status">Đang tải điểm đánh giá…</p> : summary.isError
      ? <LibraryError error={summary.error} retry={() => void summary.refetch()}/>
      : <p className="my-3" aria-label="Điểm trung bình">{summary.data.average === null ? 'Chưa có điểm đánh giá.'
        : `${summary.data.average.toFixed(2)}/5 · ${summary.data.count} đánh giá`}</p>}
    {mine.isPending ? <p role="status">Đang tải đánh giá của bạn…</p> : mine.isError
      ? <LibraryError error={mine.error} retry={() => void mine.refetch()}/>
      : <ReviewEditor key={mine.data.items[0] ? `${mine.data.items[0].reviewId}:${mine.data.items[0].updatedAt}` : 'new'}
        book={book} review={mine.data.items[0]} refresh={refresh} onNotice={setNotice}/>}
    {list.isPending ? <p role="status">Đang tải đánh giá…</p> : list.isError
      ? <LibraryError error={list.error} retry={() => void list.refetch()}/>
      : <>{!list.data.items.length && <p className="my-5">Chưa có đánh giá ở trang này.</p>}
        <ul className="grid gap-4 my-5">{list.data.items.map(review => <li className="editorial-card min-w-0" key={review.reviewId}>
          <p className="font-semibold">{review.mine ? 'Đánh giá của bạn' : 'Bạn đọc'} · {review.rating}/5</p>
          <p className="my-3 whitespace-pre-wrap break-words">{review.body}</p>
          <time className="text-sm text-muted" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString('vi-VN')}</time>
          {!review.mine && <ReportReview book={book} reviewId={review.reviewId}/>}
        </li>)}</ul><Pagination page={list.data.page} onChange={setPage}/></>}
  </section>;
}
function ReportReview({ book, reviewId }: { book: string; reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const send = useMutation({ mutationFn: () => reportReview(book, reviewId, reason.trim()) });
  const valid = [...reason.trim()].length >= 10 && [...reason.trim()].length <= 500;
  return <div className="mt-3">
    {!open && !send.isSuccess && <button type="button" className="text-link" onClick={() => setOpen(true)}>Báo cáo đánh giá</button>}
    {send.isSuccess && <p role="status">Đã gửi báo cáo. Quản trị viên sẽ xem xét.</p>}
    {open && !send.isSuccess && <form onSubmit={event => { event.preventDefault(); if (valid) send.mutate(); }}>
      <label className="field">Lý do báo cáo<textarea rows={2} value={reason} maxLength={500}
        onChange={event => setReason(event.target.value)} disabled={send.isPending} required/></label>
      <p className="text-sm text-muted">Nêu lý do cụ thể, 10–500 ký tự.</p>
      <div className="mt-2 flex gap-2"><button type="submit" className="button-primary" disabled={!valid || send.isPending}>Gửi báo cáo</button>
        <button type="button" className="button-secondary" disabled={send.isPending} onClick={() => { setOpen(false); send.reset(); }}>Hủy</button></div>
      {send.isError && <LibraryError error={send.error} retry={() => send.reset()}/>}
    </form>}
  </div>;
}
function ReviewEditor({ book, review, refresh, onNotice }: { book: string; review?: Review; refresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const [body, setBody] = useState(review?.body ?? '');
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [editing, setEditing] = useState(!review);
  const [confirm, setConfirm] = useState(false);
  const sending = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const save = useMutation({ mutationFn: (input: Partial<ReviewInput>) => review
    ? updateReview(book, review.reviewId, input) : createReview(book, input as ReviewInput) });
  const remove = useMutation({ mutationFn: () => deleteReview(book, review!.reviewId) });
  const busy = save.isPending || remove.isPending;
  const changed = !review || body.trim() !== review.body || rating !== review.rating;
  const valid = [...body.trim()].length >= 1 && [...body.trim()].length <= 5000 && rating >= 1 && rating <= 5;
  const submit = async () => {
    if (sending.current || !valid || !changed) return;
    sending.current = true; onNotice(''); remove.reset();
    const input: Partial<ReviewInput> = {};
    if (!review || body.trim() !== review.body) input.body = body.trim();
    if (!review || rating !== review.rating) input.rating = rating;
    try { await save.mutateAsync(input); onNotice('Đã lưu đánh giá.'); setEditing(false); await refresh(); }
    catch { /* Giữ input để người dùng sửa hoặc tải lại. */ }
    finally { sending.current = false; }
  };
  const destroy = async () => {
    if (sending.current || !review) return;
    sending.current = true; onNotice(''); save.reset();
    try { await remove.mutateAsync(); onNotice('Đã xóa đánh giá.'); setConfirm(false); await refresh(); }
    catch { /* Không đóng xác nhận khi server từ chối. */ }
    finally { sending.current = false; }
  };
  return <div className="editorial-card my-5" aria-label="Đánh giá của tôi">
    <h3 className="font-semibold">{review ? 'Quản lý đánh giá của bạn' : 'Viết đánh giá'}</h3>
    {review?.moderationStatus === 'HIDDEN' && <p role="status" className="my-2">Đánh giá này đã bị ẩn sau khi kiểm duyệt. Chỉnh sửa không tự đưa đánh giá lên lại.</p>}
    <p className="text-sm text-muted my-2">Nội dung hiển thị cho bạn đọc đã đăng nhập. Không đưa thông tin cá nhân vào đánh giá.</p>
    {editing ? <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="field">Nội dung đánh giá<textarea rows={4} value={body} disabled={busy} required
        onChange={event => setBody(event.target.value)} aria-describedby="review-body-help"/></label>
      <p id="review-body-help" className="text-sm my-2">1–5000 ký tự · {[...body.trim()].length}/5000</p>
      <RatingInput value={rating} onChange={setRating} disabled={busy}/>
      <div className="flex flex-wrap gap-3"><button className="button-primary" type="submit" disabled={busy || !valid || !changed}>Lưu đánh giá</button>
        {review && <button className="button-secondary" type="button" disabled={busy} onClick={() => {
          setBody(review.body); setRating(review.rating); setEditing(false); save.reset();
        }}>Hủy chỉnh sửa</button>}</div>
    </form> : <button className="button-secondary" type="button" disabled={busy} onClick={() => { setEditing(true); setConfirm(false); }}>Sửa đánh giá của tôi</button>}
    {review && <button ref={cancelRef} className="button-secondary my-3 ml-3" type="button" disabled={busy} onClick={() => setConfirm(true)}>Xóa đánh giá của tôi</button>}
    {confirm && <div role="group" aria-label="Xác nhận xóa đánh giá" className="my-3 border-t border-line pt-3">
      <p>Xóa đánh giá và điểm số của bạn? Thao tác này không thể hoàn tác.</p>
      <button className="button-primary mt-3" type="button" disabled={busy} onClick={() => void destroy()}>Xác nhận xóa đánh giá</button>
      <button className="button-secondary ml-3" type="button" disabled={busy} onClick={() => { setConfirm(false); remove.reset(); cancelRef.current?.focus(); }}>Giữ đánh giá</button>
    </div>}
    {busy && <p role="status">Đang lưu thay đổi…</p>}
    {(save.isError || remove.isError) && <LibraryError error={(save.error ?? remove.error)!} retry={() => void refresh()}/>}
  </div>;
}
