// main.jsx: client entry point; mounts the app providers (Mantine, TanStack Query) and the router.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { AppProviders } from './AppProviders.jsx';
import { router } from './router.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
