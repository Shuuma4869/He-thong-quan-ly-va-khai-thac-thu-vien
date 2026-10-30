import { useEffect, useRef, type ReactNode } from 'react';

export function AdminConfirmationDialog({ title, description, confirmLabel, busy, error, onCancel, onConfirm }: {
  title: string; description: string; confirmLabel: string; busy: boolean; error?: ReactNode;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = dialog.current;
    panel?.querySelector<HTMLElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); onCancelRef.current(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      if (!panel.contains(document.activeElement)) { event.preventDefault(); focusable[0].focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, []);
  return <div className="admin-confirm-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy) onCancelRef.current();
  }}>
    <section ref={dialog} className="admin-confirm-dialog" role="alertdialog" aria-modal="true"
      aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" tabIndex={-1}>
      <p className="eyebrow">Xác nhận thao tác quản trị</p>
      <h2 id="admin-confirm-title">{title}</h2>
      <p id="admin-confirm-description">{description}</p>
      {error && <div className="admin-confirm-error" aria-live="assertive">{error}</div>}
      <div className="admin-confirm-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Quay lại</button>
        <button type="button" className="button-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Đang lưu…' : confirmLabel}
        </button>
      </div>
    </section>
  </div>;
}
