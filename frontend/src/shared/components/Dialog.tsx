import { useEffect, useRef, type PropsWithChildren, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Native modal keeps background controls inert, including inside WebView2. */
export function Dialog({ title, onClose, children, className = '', initialFocus }: PropsWithChildren<{
  title: string; onClose: () => void; className?: string; initialFocus?: RefObject<HTMLElement | null>;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    initialFocus?.current?.focus();
    const element = dialog.current;
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [initialFocus]);
  return createPortal(<dialog ref={dialog} className={`app-dialog ${className}`} aria-label={title}
    onCancel={event => { event.preventDefault(); close.current(); }}
    onClick={event => { if (event.target === dialog.current) close.current(); }}>
    <div className="app-dialog-content">
      <header className="app-dialog-heading"><h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Đóng hộp thoại" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </dialog>, document.body);
}
