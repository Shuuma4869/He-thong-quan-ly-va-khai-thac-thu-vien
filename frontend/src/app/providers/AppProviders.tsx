import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { type PropsWithChildren, useState } from 'react';
import { AppErrorBoundary } from '../../shared/components/AppErrorBoundary';

function GlobalQueryIndicator() {
  const pendingRequests = useIsFetching();
  if (pendingRequests === 0) return null;
  return <div className="global-progress" role="progressbar" aria-label="Đang tải dữ liệu" />;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GlobalQueryIndicator />
        {children}
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
