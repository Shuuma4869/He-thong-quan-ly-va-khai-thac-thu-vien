import { createContext, useContext, useEffect, useId, useLayoutEffect } from 'react';

export type DraftState = { dirty: boolean; busy?: boolean; uncertain?: boolean; label: string };
export const DraftContext = createContext<{
  register: (id: string, state: DraftState | null) => void;
  request: (id: string, action: () => void) => void;
} | null>(null);

/** Only forms with disposable local state opt in; persistent previews need no route blocker. */
export function useUnsavedChanges({ dirty, busy = false, uncertain = false, label }: DraftState) {
  const context = useContext(DraftContext);
  const register = context?.register;
  const id = useId();
  useLayoutEffect(() => {
    register?.(id, { dirty, busy, uncertain, label });
    return () => register?.(id, null);
  }, [register, id, dirty, busy, uncertain, label]);
  useEffect(() => {
    if (!dirty && !busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy, uncertain]);
  return (action: () => void) => {
    if (context && (dirty || busy || uncertain)) context.request(id, action);
    else action();
  };
}
