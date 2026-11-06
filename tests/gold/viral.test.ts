import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { viralClipsFor } from '../../src/lib/viral'
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const n = 1
x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ad','ad@x','admin','A',1),('uc','c@x','customer','C',1),('uo','o@x','customer','O',1),('ucl','cl@x','clipper','Cl',1),('ucr','cr@x','creator','Cr',1)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('cc','uc',0,1),('co','uo',0,1),('ccr','ucr',0,1)`)
x(`INSERT INTO clippers (id,user_id,display_name,status,created_at) VALUES ('kl','ucl','Cl','aktiv',1),('kcr','ucr','Cr','aktiv',1)`)
x(`INSERT INTO creators (id,user_id,goal,platforms,open_to_ads,followers,views_total,views_30d,handles,created_at) VALUES ('cr1','ucr','g','[]','ja','1','1','1','{}',1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('p1','cc','Kunde Eins','aktiv',1),('p2','co','Andere','aktiv',1),('p3','ccr','Creator Eigen','aktiv',1)`)
x(`INSERT INTO deliverables (id,project_id,clipper_id,r2_key,filename,thumbnail_key,created_at) VALUES
  ('d1','p1','kl','k','a.mp4','thumbs/d1.jpg',1),('d2','p1','kl','k','b.mp4',NULL,1),('d3','p2','kcr','k','c.mp4',NULL,1),('d4','p3',NULL,'k','d.mp4',NULL,1),('d5','p2',NULL,'k','e.mp4',NULL,1)`)
const pm = (post: string, d: string, p: string, plat: string, v: number, imp = 0, user = 'acc', url = 'https://t/' + post) =>
  x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,username,url,views,impressions,likes,synced_at) VALUES (?,?,?,?,?,?,?,?,?,3,1)`, post, post + 'a', d, p, plat, user, url, v, imp)
pm('a', 'd1', 'p1', 'tiktok', 900000, 0, 'big'); pm('b', 'd1', 'p1', 'instagram', 100000, 0, 'small')
pm('c', 'd2', 'p1', 'twitter', 0, 50000)       // X meldet Impressions
pm('d', 'd3', 'p2', 'tiktok', 3000000)
pm('e', 'd4', 'p3', 'youtube', 70000)
pm('f', 'd5', 'p2', 'tiktok', 0, 0)            // 0 Views: erscheint nicht
;(async () => {
  const admin = await viralClipsFor(env, { id: 'ad', role: 'admin' } as any)
  assert.deepEqual(admin.map(c => [c.id, c.views]), [['d3', 3000000], ['d1', 1000000], ['d4', 70000], ['d2', 50000]])
  assert.equal(admin[1].handle, 'big'); assert.equal(admin[1].url, 'https://t/a')
  assert.deepEqual(admin[1].platforms.sort(), ['instagram', 'tiktok'])
  assert.equal(admin[0].thumb, '/media/kampagne/p2/thumb')   // ohne R2: Kampagnen-Thumbnail
  console.log('✓ Admin: alle Clips, Summe je Clip, Impressions als Views, 0-View-Clips fehlen, stärkster Post liefert @handle')
  const cust = await viralClipsFor(env, { id: 'uc', role: 'customer' } as any)
  assert.deepEqual(cust.map(c => c.id), ['d1', 'd2']); assert.equal(cust[0].handle, 'big')
  console.log('✓ Kunde: nur eigene Kampagnen, mit Accountnamen')
  const clip = await viralClipsFor(env, { id: 'ucl', role: 'clipper' } as any)
  assert.deepEqual(clip.map(c => c.id), ['d1', 'd2']); assert.ok(clip.every(c => c.handle === null && c.url === null))
  console.log('✓ Clipper: nur selbst gelieferte Clips, OHNE Accountnamen und Links')
  const cr = await viralClipsFor(env, { id: 'ucr', role: 'creator' } as any)
  assert.deepEqual(cr.map(c => c.id), ['d3', 'd4']); assert.ok(cr.every(c => c.handle === null))
  console.log('✓ Creator: eigene Kampagne + selbst geschnittene Clips, ohne Accountnamen')
  const nobody = await viralClipsFor(env, { id: 'zz', role: 'agency' } as any)
  assert.deepEqual(nobody, [])
  console.log('✓ Agentur ohne Arbeitsbereich: leere Liste statt Fehler')
})().catch(e => { console.error('✗', e); process.exit(1) })
