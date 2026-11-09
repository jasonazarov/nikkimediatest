// Minimaler D1-Ersatz für Tests: prepare/bind/first/all/run/batch über node:sqlite.
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'fs'
export function makeD1(migrationsDir: string) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    try { db.exec(readFileSync(`${migrationsDir}/${f}`, 'utf8')) } catch (e) { throw new Error(`Migration ${f}: ${(e as Error).message}`) }
  }
  const stmt = (sql: string, binds: unknown[] = []) => ({
    bind: (...b: unknown[]) => stmt(sql, b),
    first: async <T>(col?: string) => { const r = db.prepare(sql).get(...(binds as any[])) as any; return (r ? (col ? r[col] : r) : null) as T },
    all: async <T>() => ({ results: db.prepare(sql).all(...(binds as any[])) as T[], success: true }),
    run: async () => { const r = db.prepare(sql).run(...(binds as any[])); return { success: true, meta: { changes: Number(r.changes) } } },
    // Für Drizzle (getDb): Zeilen als Arrays in Spaltenreihenfolge.
    raw: async () => (db.prepare(sql).all(...(binds as any[])) as any[]).map((r) => Object.values(r)),
  })
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (s: any[]) => Promise.all(s.map((x) => x.run())) }
}
