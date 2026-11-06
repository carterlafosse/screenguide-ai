// PlaceholderPage.test.jsx: the placeholder shows the API status from /api/health.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils/render.jsx';
import { PlaceholderPage } from './PlaceholderPage.jsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlaceholderPage', () => {
  it('shows "API connected" when the health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
    );
    render(<PlaceholderPage />);
    expect(screen.getByRole('heading', { name: /screenguide ai/i })).toBeInTheDocument();
    expect(await screen.findByText('API connected')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/health', { credentials: 'include' });
  });

  it('shows "API not reachable" when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    render(<PlaceholderPage />);
    expect(await screen.findByText('API not reachable')).toBeInTheDocument();
  });
});
