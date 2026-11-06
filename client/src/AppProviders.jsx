// AppProviders.jsx: wraps the app in Mantine, notifications and TanStack Query providers.
// Phase 4 adds the full Mantine theme (Section 18.1) and global error handling.
import { useState } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const theme = createTheme({
  primaryColor: 'teal',
});

/**
 * @param {{ children: import('react').ReactNode, env?: 'default' | 'test' }} props
 */
export function AppProviders({ children, env = 'default' }) {
  // ----- State -----
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: env === 'test' ? false : 1 } } }),
  );

  // ----- Render -----
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" env={env}>
      <Notifications />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
