import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import type { Env } from './types'

export type DB = DrizzleD1Database<typeof schema>

export function getDb(env: Env): DB {
  return drizzle(env.DB, { schema })
}

export { schema }

/** Unix-Sekunden — überall die einzige Zeitquelle. */
export const nowSec = () => Math.floor(Date.now() / 1000)

/** UUID v4, in Workers nativ verfügbar. */
export const uid = () => crypto.randomUUID()
