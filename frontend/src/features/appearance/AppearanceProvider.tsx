import { useEffect, useLayoutEffect, useState, type PropsWithChildren } from 'react';
import { coreApi } from '../../shared/api/client';
import { useAuth } from '../auth/auth-context';
import { defaults, GUEST_KEY, guestAppearance, parseAppearance, type Appearance } from './appearance';
import { AppearanceContext } from './appearance-context';

type Stored = { schemaVersion: number; revision: number; values: Appearance };
export function AppearanceProvider({ children }: PropsWithChildren) {
  const { user, isInitializing } = useAuth();
  const userId = user?.id;
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
    setLoading(true); setError(null);
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
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'widgets') root.dataset[`appearance${key[0].toUpperCase()}${key.slice(1)}`] = String(value);
    }
  }, [values]);
  const save = async (candidate: Appearance) => {
    const next = parseAppearance(candidate);
    setSaving(true); setError(null);
    try {
      if (user) {
        const stored = await coreApi.put<Stored>('/me/ui-preferences', { schemaVersion: 1, revision, values: next });
        setRevision(stored.revision); setSaved(parseAppearance(stored.values)); setValues(parseAppearance(stored.values));
      } else {
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
        setSaved(next); setValues(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được thiết lập giao diện.');
      throw cause;
    } finally { setSaving(false); }
  };
  const reset = () => save(defaults);
  const discard = () => setValues(saved);
  const pending = loading || isInitializing || loadedOwner !== (userId ?? 'guest');
  return <AppearanceContext.Provider value={{ values, saved, loading: pending, saving, error,
    preview: setValues, save, reset, discard }}>
    {children}
    {pending && <div className="appearance-loading" role="status">Đang chuẩn bị giao diện…</div>}
  </AppearanceContext.Provider>;
}
