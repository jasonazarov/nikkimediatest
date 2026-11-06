import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { showcaseCampaigns, showcaseFor } from '../../src/lib/showcase'
import { viralClipsFor } from '../../src/lib/viral'
import { viewsAnalyticsFor } from '../../src/lib/analytics'

// Use Cases im Dashboard der Demo-Agentur (lib/showcase.ts): echte Kampagnen mit
// Posts der Startseiten-Accounts, unter dem Markennamen, nur für die Demo-Agentur.
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
x(`INSERT INTO users (id,email,role,full_name,created_at,demo) VALUES
  ('udemo','theguardians@demo.nikkimedia.co','agency','Demo',1,1),('ureal','a@x','agency','Echt',1,0),('ukunde','k@x','customer','Kunde',1,0)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('cdemo','udemo',0,1),('creal','ureal',0,1),('ck','ukunde',0,1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES
  ('pdin','ck','Kundenname GmbH intern','aktiv',1),('pcav','ck','Kaviar Q3','aktiv',1),('pother','ck','Fremd','aktiv',1),('pown','cdemo','Eigene Demo','aktiv',1)`)
x(`INSERT INTO deliverables (id,project_id,r2_key,filename,created_at) VALUES ('d1','pdin','k','a.mp4',1),('d2','pcav','k','b.mp4',1),('d3','pother','k','c.mp4',1),('d4','pown','k','d.mp4',1)`)
const pm = (post: string, d: string, p: string, user: string, v: number) =>
  x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,username,url,views,likes,synced_at) VALUES (?,?,?,?,'instagram',?,?,?,1,1)`,
    post, 'acc-' + user, d, p, user, 'https://i/' + post, v)
pm('a', 'd1', 'pdin', 'DinDrop7', 5_000_000)          // Groß/klein egal
pm('b', 'd2', 'pcav', '@caspianbluecaviar', 2_000_000) // @ davor egal
pm('c', 'd3', 'pother', 'irgendwer', 9_000_000)        // kein Use Case
pm('d', 'd4', 'pown', 'demoacc', 1_000)

;(async () => {
  const names = await showcaseCampaigns(env)
  assert.deepEqual([...names].sort(), [['pcav', 'Caspian Blue'], ['pdin', 'DinDrop']])
  console.log('✓ Use Cases werden über die Accounts gefunden, unter dem Markennamen')

  const demo = { id: 'udemo', role: 'agency', demo: 1 } as any
  const real = { id: 'ureal', role: 'agency', demo: 0 } as any
  assert.equal((await showcaseFor(env, real)).size, 0)
  assert.equal((await showcaseFor(env, { id: 'ukunde', role: 'customer', demo: 0 } as any)).size, 0)
  console.log('✓ Nur die Demo-Agentur bekommt sie, echte Agenturen und Kunden nicht')

  const a = await viewsAnalyticsFor(env, demo)
  assert.equal(a.total, 7_001_000)
  assert.deepEqual(a.top.map((t) => t.name), ['DinDrop', 'Caspian Blue', 'Eigene Demo'])
  assert.ok(!a.top.some((t) => /Kundenname|Kaviar Q3|Fremd/.test(t.name)))
  console.log('✓ Views-Grafik der Demo-Agentur: eigene + Use Cases, nie interne Kampagnennamen, nie fremde')

  const v = await viralClipsFor(env, demo)
  assert.deepEqual(v.map((c) => [c.campaign, c.handle]), [['DinDrop', 'DinDrop7'], ['Caspian Blue', '@caspianbluecaviar'], ['Eigene Demo', 'demoacc']])
  const vr = await viralClipsFor(env, real)
  assert.deepEqual(vr, [])
  console.log('✓ Virale Clips: Demo-Agentur mit Use Cases, echte Agentur ohne')

})().catch((e) => {
  console.error('✗', e)
  process.exit(1)
})
