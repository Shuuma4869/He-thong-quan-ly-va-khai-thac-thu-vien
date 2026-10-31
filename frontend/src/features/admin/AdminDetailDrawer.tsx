import { useEffect, useRef, type ReactNode } from 'react';

export function AdminDetailDrawer({ title, children, onClose }: {
  title: string; children: ReactNode; onClose: () => void;
}) {
  const drawer = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = drawer.current;
    panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[role="alertdialog"][aria-modal="true"]')) return;
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
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
  return <div className="admin-drawer-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) closeRef.current();
  }}>
    <aside ref={drawer} className="admin-detail-drawer" role="dialog" aria-modal="true"
      aria-labelledby="admin-detail-drawer-title" tabIndex={-1}>
      <header className="admin-detail-drawer-heading">
        <p id="admin-detail-drawer-title" className="eyebrow">{title}</p>
        <button type="button" className="button-secondary" onClick={onClose}>Đóng</button>
      </header>
      {children}
    </aside>
  </div>;
}
