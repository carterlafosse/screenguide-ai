// audit.queries.js: SQL for the append-only audit log. Every function takes the transaction's client.

/**
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, actorId: number | null, action: string, entityType: string | null,
 *   entityId: string | null, meta: object | null, requestId: string | null, ip: string | null }} row
 * @returns {Promise<{ id: string, created_at: Date }>}
 */
export async function insertAuditEvent(client, row) {
  const { rows } = await client.query(
    `INSERT INTO audit_events
       (organization_id, actor_id, action, entity_type, entity_id, meta, request_id, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [
      row.orgId,
      row.actorId,
      row.action,
      row.entityType,
      row.entityId,
      row.meta === null ? null : JSON.stringify(row.meta),
      row.requestId,
      row.ip,
    ],
  );
  return rows[0];
}
