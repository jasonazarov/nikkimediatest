import { getDb, nowSec, uid, schema } from './db'
import type { Env } from './types'

/** Jede schreibende Aktion landet hier. Fehler dürfen den Request nicht kippen. */
export async function audit(
  env: Env,
  entry: {
    actorId?: string | null
    action: string
    entity: string
    entityId?: string | null
    payload?: unknown
  },
): Promise<void> {
  try {
    await getDb(env)
      .insert(schema.auditLog)
      .values({
        id: uid(),
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        payload: entry.payload === undefined ? null : JSON.stringify(entry.payload),
        createdAt: nowSec(),
      })
  } catch (err) {
    console.error('[audit] fehlgeschlagen', entry.action, err)
  }
}
