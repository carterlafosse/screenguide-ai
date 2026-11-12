// audit.service.js: records audit events. recordAudit() takes the caller's transaction client, so the
// audit row commits or rolls back together with the change it describes (plan Section 8.3).
import { isIP } from 'node:net';
import { z } from 'zod';
import { insertAuditEvent } from './audit.queries.js';

/** Every action the app may audit (plan Section 8.3). Unknown actions are rejected. */
export const AUDIT_ACTIONS = Object.freeze([
  'auth.login',
  'auth.login_failed',
  'auth.locked',
  'org.registered',
  'user.created',
  'user.role_changed',
  'user.deactivated',
  'invitation.sent',
  'invitation.accepted',
  'invitation.revoked',
  'org.settings_updated',
  'integration.updated',
  'session.deleted',
  'org.exported',
  'ticket.pushed',
  'ticket.push_failed',
  'safety.blocked',
]);

const auditInput = z.object({
  orgId: z.number().int().positive(),
  actorId: z.number().int().positive().nullable().default(null),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.string().max(50).nullable().default(null),
  entityId: z
    .union([z.string(), z.number()])
    .nullable()
    .default(null)
    .transform((v) => (v === null ? null : String(v))),
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
  requestId: z.uuid().nullable().default(null),
  // Express gives IPv4 clients as ::ffff:1.2.3.4; INET accepts both forms.
  ip: z
    .string()
    .nullable()
    .default(null)
    .transform((v) => (v && isIP(v) ? v : null)),
});

/**
 * Write one audit event inside the caller's transaction (use the client from withOrg).
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, actorId?: number | null, action: (typeof AUDIT_ACTIONS)[number],
 *   entityType?: string | null, entityId?: string | number | null, meta?: object | null,
 *   requestId?: string | null, ip?: string | null }} event
 */
export async function recordAudit(client, event) {
  const result = auditInput.safeParse(event);
  // A bad audit event is a bug in our code, not bad user input, so it must surface as a 500
  // (a raw ZodError would be answered as a 400 VALIDATION_ERROR).
  if (!result.success) {
    throw new Error(`recordAudit: invalid event: ${result.error.message}`);
  }
  const row = result.data;
  return insertAuditEvent(client, row);
}
