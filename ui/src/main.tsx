import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { LangProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import { ApiError } from '@/api/client';
import { router } from '@/app/routes';
import { installPreloadErrorReload } from '@/lib/chunks';
import '@/styles/base.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

installPreloadErrorReload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                <RouterProvider router={router} />
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </LangProvider>
    </QueryClientProvider>
  </StrictMode>,
);
