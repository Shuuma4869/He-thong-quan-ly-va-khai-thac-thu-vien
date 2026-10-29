import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';

export function useInventoryCommand<T>(owner: string, signature: string, send: (requestId: string) => Promise<T>, onSuccess?: (value: T) => void) {
  const client = useQueryClient();
  const receipt = useRef<{ signature: string; id: string; send: (requestId: string) => Promise<T> } | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const uncertain = !!error && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
  const run = async () => {
    if (sending.current || result) return;
    sending.current = true; setBusy(true); setError(null);
    if (!receipt.current || (!uncertain && receipt.current.signature !== signature))
      receipt.current = { signature, id: crypto.randomUUID(), send };
    try {
      const value = await receipt.current.send(receipt.current.id);
      setResult(value);
      await client.cancelQueries({ queryKey: ['inventory', owner] });
      onSuccess?.(value);
      // The command receipt is final; background reads must not keep its button spinning.
      void client.invalidateQueries({ queryKey: ['inventory', owner] });
      void client.invalidateQueries({ queryKey: ['catalog', owner] });
    } catch (failure) { setError(failure instanceof Error ? failure : new Error('Không hoàn tất yêu cầu kiểm kê.')); }
    finally { sending.current = false; setBusy(false); }
  };
  return { busy, error, uncertain, result, run };
}
