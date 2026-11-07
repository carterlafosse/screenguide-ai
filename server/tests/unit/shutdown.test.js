// shutdown.test.js: graceful shutdown order and failure handling (src/shutdown.js).
import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../../src/shutdown.js';
import { captureLogger } from '../helpers.js';

function fakes({ jobsFail = false } = {}) {
  const calls = [];
  return {
    calls,
    server: {
      close: (cb) => {
        calls.push('server.close');
        cb();
      },
      closeIdleConnections: () => calls.push('server.closeIdleConnections'),
    },
    jobs: {
      stop: async ({ timeout }) => {
        calls.push(`jobs.stop(${timeout})`);
        if (jobsFail) throw new Error('boom');
      },
    },
    pool: { end: async () => calls.push('pool.end') },
    exit: vi.fn((code) => calls.push(`exit(${code})`)),
  };
}

describe('createShutdown', () => {
  it('stops HTTP, then jobs (10 s grace), then the pool, then exits 0', async () => {
    const f = fakes();
    const { logger } = captureLogger();
    await createShutdown({ ...f, logger })('SIGTERM');
    expect(f.calls).toEqual([
      'server.close',
      'server.closeIdleConnections',
      'jobs.stop(10000)',
      'pool.end',
      'exit(0)',
    ]);
  });

  it('runs only once even if signalled twice', async () => {
    const f = fakes();
    const { logger } = captureLogger();
    const shutdown = createShutdown({ ...f, logger });
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(f.exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 and logs when a step fails', async () => {
    const f = fakes({ jobsFail: true });
    const { logger, lines } = captureLogger();
    await createShutdown({ ...f, logger })('SIGTERM');
    expect(f.exit).toHaveBeenCalledWith(1);
    expect(lines.some((l) => l.msg === 'error during shutdown')).toBe(true);
  });

  it('forces exit 1 if shutdown hangs', async () => {
    vi.useFakeTimers();
    try {
      const f = fakes();
      f.pool.end = () => new Promise(() => {}); // never resolves
      const { logger } = captureLogger();
      createShutdown({ ...f, logger, forceExitMs: 500 })('SIGTERM');
      await vi.advanceTimersByTimeAsync(600);
      expect(f.exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
