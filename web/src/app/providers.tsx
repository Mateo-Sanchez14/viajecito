"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ServiceWorkerBoot } from "@/features/pwa/containers/ServiceWorkerBoot";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; created lazily so SSR requests never share state.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ServiceWorkerBoot />
      {children}
    </QueryClientProvider>
  );
}
