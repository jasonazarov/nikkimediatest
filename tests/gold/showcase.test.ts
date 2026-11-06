import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { showcaseCampaign, showcaseCampaigns, showcaseClips, showsShowcase } from '../../src/lib/showcase'
import { viralClipsFor } from '../../src/lib/viral'
import { viewsAnalyticsFor } from '../../src/lib/analytics'

// Use Cases im Dashboard der Demo-Agentur (lib/showcase.ts): feste Zahlen von der
// Startseite, nur für die Demo-Agentur, nie in der Datenbank.
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
x(`INSERT INTO users (id,email,role,full_name,created_at,demo) VALUES
  ('udemo','theguardians@demo.nikkimedia.co','agency','Demo',1,1),('ureal','a@x','agency','Echt',1,0)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('cdemo','udemo',0,1),('creal','ureal',0,1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('pown','cdemo','Eigene Demo','aktiv',1),('preal','creal','Echte','aktiv',1)`)
x(`INSERT INTO deliverables (id,project_id,r2_key,filename,created_at) VALUES ('d1','pown','k','a.mp4',1),('d2','preal','k','b.mp4',1)`)
x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,username,url,views,likes,synced_at) VALUES
  ('a','acc','d1','pown','tiktok','demo','https://t/a',1000,1,1),('b','acc2','d2','preal','tiktok','echt','https://t/b',2000,1,1)`)

;(async () => {
  const sum = (id: string) => showcaseClips().filter((c) => c.campaignId === id).reduce((s, c) => s + c.views, 0)
  assert.deepEqual(showcaseCampaigns().map((c) => [c.name, c.views, sum(c.id)]), [
    ['DinDrop', 100_000_000, 100_000_000], ['Max Tornow', 70_000_000, 70_000_000], ['Caspian Blue', 40_000_000, 40_000_000],
    ['Levantine Istanbul', 3_000_000, 3_000_000], ['Panperium', 450_000, 450_000]])
  console.log('✓ Fünf Use Cases, Views der Reels ergeben genau die Zahlen der Startseite')

  assert.equal(showcaseCampaign('usecase-dindrop')?.clips.length, 5)
  assert.equal(showcaseCampaign('p-1'), null)
  console.log('✓ Kampagnenseite: Reels mit Vorschaubild, fremde IDs nie')

  const demo = { id: 'udemo', role: 'agency', demo: 1 } as any
  const real = { id: 'ureal', role: 'agency', demo: 0 } as any
  assert.ok(showsShowcase(demo) && !showsShowcase(real) && !showsShowcase({ role: 'customer', demo: 1 }))

  const a = await viewsAnalyticsFor(env, demo)
  assert.equal(a.total, 213_451_000)
  assert.deepEqual(a.top.map((t) => t.name), ['DinDrop', 'Max Tornow', 'Caspian Blue', 'Levantine Istanbul', 'Panperium', 'Eigene Demo'])
  assert.equal(a.series.at(-1)?.views, 213_451_000)
  assert.equal(a.platforms[0].platform, 'instagram')
  const r = await viewsAnalyticsFor(env, real)
  assert.deepEqual(r.top.map((t) => t.name), ['Echte'])
  console.log('✓ Views-Grafik: Demo-Agentur mit Use Cases + eigenen, echte Agentur ohne')

  const v = await viralClipsFor(env, demo)
  assert.equal(v.length, 8)
  assert.equal(v[0].handle, 'dindrop7')
  assert.ok(v.every((c) => c.thumb?.startsWith('/img/cases/') && c.url?.startsWith('https://www.instagram.com/')))
  assert.deepEqual((await viralClipsFor(env, real)).map((c) => c.id), ['d2'])
  console.log('✓ Virale Clips: die stärksten Reels mit Bild und Link, echte Agentur ohne')
})().catch((e) => {
  console.error('✗', e)
  process.exit(1)
})
