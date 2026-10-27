export function BookGridSkeleton({ count = 4, message = 'Đang tải sách…' }: { count?: number; message?: string }) {
  return <div role="status" aria-live="polite" className="py-5">
    <p className="text-muted mb-4">{message}</p>
    <div className="catalog-grid" aria-hidden="true">{Array.from({ length: count }, (_, index) =>
      <div className="book-card skeleton-book" key={index}>
        <div className="skeleton-cover skeleton-shine" />
        <div className="book-card-body"><div className="skeleton-line skeleton-shine short" />
          <div className="skeleton-line skeleton-shine" /><div className="skeleton-line skeleton-shine medium" /></div>
      </div>)}</div>
  </div>;
}
