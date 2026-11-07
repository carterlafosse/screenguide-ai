// noop.js: worker for the sample system.noop queue. Real workers do their tenant work inside
// withOrg(job.data.orgId, ...) and must be idempotent (safe to run twice).

/**
 * @param {{ id: string, data: { orgId: number, requestId: string } }} job
 * @param {{ logger: import('pino').Logger }} context
 */
export async function noopWorker(job, { logger }) {
  logger.info('noop job processed');
  return { ok: true };
}
