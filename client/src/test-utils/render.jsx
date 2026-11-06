// render.jsx: Testing Library render wrapped in the app providers (Mantine needs MantineProvider).
import { render as testingLibraryRender } from '@testing-library/react';
import { AppProviders } from '../AppProviders.jsx';

/**
 * @param {import('react').ReactNode} ui
 */
export function render(ui) {
  return testingLibraryRender(ui, {
    wrapper: ({ children }) => <AppProviders env="test">{children}</AppProviders>,
  });
}

export * from '@testing-library/react';
