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
  useEffect(() => {
    if (isInitializing) return;
    let active = true;
    setLoading(true); setSaving(false); setError(null);
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
    const next = parseAppearance(candidate);
    setSaving(true); setError(null);
    try {
      if (user) {
        const stored = await coreApi.put<Stored>('/me/ui-preferences', { schemaVersion: 1, revision, values: next });
        if (ownerRef.current !== requestedOwner) return;
        setRevision(stored.revision); setSaved(parseAppearance(stored.values)); setValues(parseAppearance(stored.values));
      } else {
        if (ownerRef.current !== requestedOwner) return;
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
        setSaved(next); setValues(next);
      }
    } catch (cause) {
      if (ownerRef.current !== requestedOwner) return;
      setError(cause instanceof Error ? cause.message : 'Không lưu được thiết lập giao diện.');
      throw cause;
    } finally { if (ownerRef.current === requestedOwner) setSaving(false); }
  };
  const reset = () => save(defaults);
  const discard = () => setValues(saved);
  return <AppearanceContext.Provider value={{ values, saved, loading: pending, saving, error,
    preview: setValues, save, reset, discard }}>
    {children}
    {pending && <div className="appearance-loading" role="status">Đang chuẩn bị giao diện…</div>}
  </AppearanceContext.Provider>;
}
