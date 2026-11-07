// queues.js: every pg-boss queue the API uses, with its retry policy, and the envelope every job
// payload must carry (orgId + requestId, plan Section 8.2). Later phases add the Section 8.2 queues.
import { z } from 'zod';

export const QUEUES = Object.freeze({
  /** Sample queue proving the wiring (Phase 2). Does nothing but log. */
  NOOP: 'system.noop',
});

/**
 * Queue definitions created (or updated) at startup.
 * @type {{ name: string, options: object }[]}
 */
export const QUEUE_DEFINITIONS = [
  { name: QUEUES.NOOP, options: { retryLimit: 3, retryDelay: 1, retryBackoff: true } },
];

/** Every job payload: the org whose data it touches and the request that caused it. */
export const jobEnvelope = z.looseObject({
  orgId: z.number().int().positive(),
  requestId: z.uuid(),
});
