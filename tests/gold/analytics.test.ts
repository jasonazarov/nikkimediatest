import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { viewsAnalyticsFor } from '../../src/lib/analytics'
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const NOW = 1_780_000_000, D = 86400
x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ad','ad@x','admin','A',1),('uc','c@x','customer','C',1),('uo','o@x','customer','O',1),('ucl','cl@x','clipper','Cl',1)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('cc','uc',0,1),('co','uo',0,1)`)
x(`INSERT INTO clippers (id,user_id,display_name,status,created_at) VALUES ('kl','ucl','Cl','aktiv',1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('p1','cc','Kunde Eins','aktiv',1),('p2','co','Andere','aktiv',1)`)
x(`INSERT INTO deliverables (id,project_id,clipper_id,r2_key,filename,created_at) VALUES ('d1','p1','kl','k','a.mp4',1),('d2','p1',NULL,'k','b.mp4',1),('d3','p2',NULL,'k','c.mp4',1)`)
const pm = (post: string, d: string, p: string, plat: string, v: number, imp = 0) =>
  x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,views,impressions,likes,synced_at) VALUES (?,?,?,?,?,?,?,2,?)`, post, post + 'a', d, p, plat, v, imp, NOW)
const ms = (post: string, d: string, p: string, at: number) =>
  x(`INSERT INTO metrics_sync (post_id,deliverable_id,project_id,published_at,next_at) VALUES (?,?,?,?,?)`, post, d, p, at, at)
pm('a', 'd1', 'p1', 'tiktok', 1000); ms('a', 'd1', 'p1', NOW - 10 * D)
pm('b', 'd2', 'p1', 'twitter', 0, 500); ms('b', 'd2', 'p1', NOW - 3 * D)
pm('c', 'd3', 'p2', 'tiktok', 4000)   // ohne Zeitplan: zählt am Tag des Stands
;(async () => {
  const a = await viewsAnalyticsFor(env, { id: 'ad', role: 'admin' } as any, NOW)
  assert.equal(a.total, 5500); assert.equal(a.campaigns, 2); assert.equal(a.clips, 3)
  assert.equal(a.series.length, 30); assert.equal(a.series.at(-1)!.views, 5500)
  assert.equal(a.series.at(-11)!.views, 1000); assert.equal(a.series[0].views, 0)
  assert.deepEqual(a.top.map(c => [c.name, c.views]), [['Andere', 4000], ['Kunde Eins', 1500]])
  assert.deepEqual(a.platforms.map(p => p.platform), ['tiktok', 'twitter'])
  console.log('✓ Admin: Summen, Kurve nach Veröffentlichungstag, Kampagnen und Plattformen')
  const c = await viewsAnalyticsFor(env, { id: 'uc', role: 'customer' } as any, NOW)
  assert.equal(c.total, 1500); assert.deepEqual(c.top.map(t => t.id), ['p1'])
  console.log('✓ Kunde: nur eigene Kampagnen')
  const k = await viewsAnalyticsFor(env, { id: 'ucl', role: 'clipper' } as any, NOW)
  assert.equal(k.total, 1000)
  console.log('✓ Clipper: nur selbst gelieferte Clips')
  const n = await viewsAnalyticsFor(env, { id: 'zz', role: 'agency' } as any, NOW)
  assert.equal(n.total, 0); assert.deepEqual(n.series, [])
  console.log('✓ Ohne Arbeitsbereich: leer statt Fehler')
})().catch(e => { console.error('✗', e); process.exit(1) })
