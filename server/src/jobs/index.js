// index.js: pg-boss bootstrap. pg-boss runs as resolvd_app with its automatic migrations off (the
// `pgboss` schema is installed by migration 112, run as resolvd_owner), creates the queues, registers
// the workers, and can enqueue a job inside an existing transaction so the job exists only if the
// data change commits. Started from server.js (not createApp) so tests control it.
import { PgBoss } from 'pg-boss';
import { jobEnvelope, QUEUE_DEFINITIONS } from './queues.js';
import { WORKERS } from './workers/index.js';

const HEALTH_TIMEOUT_MS = 2000;

/**
 * Adapter so pg-boss runs its INSERT on our transaction's client.
 * @param {import('pg').ClientBase} client
 */
function clientDb(client) {
  return { executeSql: (text, values) => client.query(text, values) };
}

/**
 * @param {{ connectionString: string, logger: import('pino').Logger,
 *   workers?: Record<string, (job: any, ctx: { logger: import('pino').Logger }) => Promise<unknown>>,
 *   bossOptions?: object, workOptions?: object }} options
 */
export function createJobs({
  connectionString,
  logger,
  workers = WORKERS,
  bossOptions = {},
  workOptions = {},
}) {
  const boss = new PgBoss({
    connectionString,
    application_name: 'screenguide-jobs',
    migrate: false, // schema comes from migrations; the app role can't run DDL
    createSchema: false,
    reindex: false, // REINDEX needs table ownership, which resolvd_app doesn't have
    ...bossOptions,
  });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  boss.on('warning', (warning) => logger.warn({ warning }, 'pg-boss warning'));

  let started = false;
  const queueNames = new Set(QUEUE_DEFINITIONS.map((q) => q.name));

  async function registerWorkers() {
    for (const [name, handler] of Object.entries(workers)) {
      await boss.work(name, { batchSize: 1, ...workOptions }, async ([job]) => {
        const data = jobEnvelope.parse(job.data);
        const log = logger.child({
          queue: name,
          jobId: job.id,
          orgId: data.orgId,
          requestId: data.requestId,
        });
        try {
          return await handler(job, { logger: log });
        } catch (err) {
          log.error({ err }, 'job failed');
          throw err; // pg-boss retries according to the queue's policy
        }
      });
    }
  }

  return {
    boss,

    async start() {
      await boss.start();
      for (const { name, options } of QUEUE_DEFINITIONS) {
        await boss.createQueue(name, options);
        await boss.updateQueue(name, options); // keep existing queues in step with the code
      }
      await registerWorkers();
      started = true;
      logger.info({ queues: [...queueNames] }, 'job queue started');
    },

    /** Stop polling, let running jobs finish (up to `timeout` ms), then close connections. */
    async stop({ timeout = 10000 } = {}) {
      if (!started) return;
      started = false;
      await boss.stop({ graceful: true, timeout, close: true });
    },

    /** True when started and pg-boss can reach its tables. */
    async isUp() {
      if (!started) return false;
      try {
        await Promise.race([
          boss.getQueue(QUEUE_DEFINITIONS[0].name),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS).unref(),
          ),
        ]);
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Enqueue a job. Pass `client` to enqueue inside that transaction (outbox guarantee: the job
     * exists only if the transaction commits).
     * @param {string} name
     * @param {{ orgId: number, requestId: string } & Record<string, unknown>} data
     * @param {{ client?: import('pg').ClientBase } & Record<string, unknown>} [options]
     */
    async send(name, data, { client, ...options } = {}) {
      if (!queueNames.has(name)) throw new Error(`Unknown queue: ${name}`);
      // A bad payload is a bug in our code: throw a plain Error (500), not a ZodError (400).
      const parsed = jobEnvelope.safeParse(data);
      if (!parsed.success)
        throw new Error(`jobs.send(${name}): invalid payload: ${parsed.error.message}`);
      const payload = parsed.data;
      return boss.send(name, payload, client ? { ...options, db: clientDb(client) } : options);
    },
  };
}
