import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';

export function useCirculationCommand<T>(owner: string, signature: string, send: (requestId: string) => Promise<T>) {
  const client = useQueryClient();
  const receipt = useRef<{ signature: string; id: string } | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const uncertain = !!error && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
  const run = async () => {
    if (sending.current || result) return;
    sending.current = true; setBusy(true); setError(null);
    if (!receipt.current || receipt.current.signature !== signature) receipt.current = { signature, id: crypto.randomUUID() };
    try {
      const response = await send(receipt.current.id);
      setResult(response);
      await client.cancelQueries({ queryKey: ['circulation', owner] });
      await client.invalidateQueries({ queryKey: ['circulation', owner] });
      await client.invalidateQueries({ queryKey: ['catalog', owner] });
    } catch (failure) { setError(failure instanceof Error ? failure : new Error('Không hoàn tất yêu cầu.')); }
    finally { sending.current = false; setBusy(false); }
  };
  return { busy, error, uncertain, result, run };
}
