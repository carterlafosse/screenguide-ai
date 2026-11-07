// index.js: maps each queue name to its worker function. createJobs() registers every entry.
import { QUEUES } from '../queues.js';
import { noopWorker } from './noop.js';

export const WORKERS = Object.freeze({
  [QUEUES.NOOP]: noopWorker,
});
