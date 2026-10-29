import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { coreApi } from '../../shared/api/client';
import { useAuth } from '../auth/auth-context';
import { defaults, GUEST_KEY, guestAppearance, parseAppearance, type Appearance } from './appearance';
import { AppearanceContext } from './appearance-context';

type Stored = { schemaVersion: number; revision: number; values: Appearance };
export function AppearanceProvider({ children }: PropsWithChildren) {
  const { user, isInitializing } = useAuth();
  const userId = user?.id;
  const owner = userId ?? 'guest';
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [saved, setSaved] = useState<Appearance>(guestAppearance);
  const [values, setValues] = useState<Appearance>(guestAppearance);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveRequest = useRef<symbol | null>(null);
  const session = useRef({ owner, generation: 0 });
  if (session.current.owner !== owner) session.current = { owner, generation: session.current.generation + 1 };
  const state = useRef({ saved, values });
  state.current = { saved, values };
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (owner === 'guest' && (event.key === GUEST_KEY || event.key === null)) {
        const next = guestAppearance();
        const dirty = JSON.stringify(state.current.values) !== JSON.stringify(state.current.saved);
        setSaved(next);
        if (!dirty) setValues(next);
        else setError('Thiết lập khách đã đổi ở tab khác. Bản xem thử được giữ lại; chọn Bỏ thay đổi để dùng bản vừa lưu.');
      } else if (owner !== 'guest' && event.key === `lams-ui-revision:${owner}`) {
        setError('Giao diện đã được lưu ở tab khác. Tải lại trang để nhận thiết lập mới trước khi chỉnh tiếp.');
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [owner]);
  useEffect(() => {
    if (isInitializing) return;
    let active = true;
    setLoading(true); setSaving(false); setError(null);
    saveRequest.current = null;
    if (!userId) {
      const guest = guestAppearance();
      setSaved(guest); setValues(guest); setRevision(0); setLoading(false); setLoadedOwner('guest');
      return;
    }
    // Do not carry a previous account's settings while this account loads.
    setSaved(defaults); setValues(defaults); setRevision(0);
    void coreApi.get<Stored>('/me/ui-preferences').then(data => {
      if (!active) return;
      const next = data.schemaVersion === 1 ? parseAppearance(data.values) : defaults;
      setSaved(next); setValues(next); setRevision(data.revision);
    }).catch(() => { if (active) setError('Không tải được thiết lập từ tài khoản. Đang dùng giao diện mặc định.'); })
      .finally(() => { if (active) { setLoading(false); setLoadedOwner(userId); } });
    return () => { active = false; };
  }, [userId, isInitializing]);
  const pending = loading || isInitializing || loadedOwner !== owner;
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(pending ? defaults : values)) {
      if (key !== 'widgets') root.dataset[`appearance${key[0].toUpperCase()}${key.slice(1)}`] = String(value);
    }
  }, [values, pending]);
  const save = async (candidate: Appearance) => {
    const requestedOwner = ownerRef.current;
    const generation = session.current.generation;
    const stillCurrent = () => ownerRef.current === requestedOwner && session.current.generation === generation;
    if (pending || saveRequest.current) throw new Error('Vui lòng chờ thiết lập đang tải hoặc lưu.');
    const next = parseAppearance(candidate);
    const request = Symbol();
    saveRequest.current = request;
    setSaving(true); setError(null);
    try {
      if (user) {
        const stored = await coreApi.put<Stored>('/me/ui-preferences', { schemaVersion: 1, revision, values: next });
        if (!stillCurrent()) return;
        setRevision(stored.revision); setSaved(parseAppearance(stored.values)); setValues(parseAppearance(stored.values));
        try { localStorage.setItem(`lams-ui-revision:${requestedOwner}`, String(stored.revision)); } catch { /* Cross-tab hints are optional; server revision remains authoritative. */ }
      } else {
        if (!stillCurrent()) return;
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
        setSaved(next); setValues(next);
      }
    } catch (cause) {
      if (!stillCurrent()) return;
      setError(cause instanceof Error ? cause.message : 'Không lưu được thiết lập giao diện.');
      throw cause;
    } finally {
      if (saveRequest.current === request) saveRequest.current = null;
      if (stillCurrent()) setSaving(false);
    }
  };
  const reset = () => save(defaults);
  const discard = () => setValues(saved);
  return <AppearanceContext.Provider value={{ values, saved, loading: pending, saving, error,
    preview: setValues, save, reset, discard }}>
    {children}
    {pending && <div className="appearance-loading" role="status">Đang chuẩn bị giao diện…</div>}
  </AppearanceContext.Provider>;
}
