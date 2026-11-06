// router.jsx: application routes (React Router data mode). Phase 4 adds the real pages and guards.
import { createBrowserRouter } from 'react-router';
import { PlaceholderPage } from './features/home/PlaceholderPage.jsx';

export const router = createBrowserRouter([
  {
    path: '*',
    element: <PlaceholderPage />,
  },
]);
