import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { publishedAtOf, showcaseCampaign, showcaseCampaigns, showcaseClips, showsShowcase } from '../../src/lib/showcase'
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
  // Genau die Angaben des Auftraggebers, nichts geschätzt.
  const known = showcaseClips().filter((c) => c.views !== null).map((c) => [c.reel, c.views, c.handle])
  assert.deepEqual(known, [
    ['DRSI7B3CI1M', 35_400_000, 'dindrop7'], ['C1xEPryiQ4t', 13_100_000, 'max_tornow_business'], ['DNF5zC7o66_', 11_600_000, 'dindrop7'],
    ['DKZ-ra1qDiR', 6_400_000, 'caspianbluecaviar'], ['C0hXUyfixJt', 821_000, null], ['DY77rgqAHmj', 500_000, 'dindrop7'],
    ['DaIZcxnqCPw', 475_000, 'caspianbluecaviar']])
  assert.ok(showcaseClips().every((c) => c.likes === 0 && c.comments === 0 && c.shares === 0))
  console.log('✓ Views je Reel genau wie angegeben, keine geschätzten Likes oder Shares')

  // Veröffentlichungstag aus dem Shortcode
  assert.equal(new Date(publishedAtOf('DRSI7B3CI1M') * 1000).toISOString().slice(0, 10), '2025-11-20')
  assert.equal(new Date(publishedAtOf('C0hXUyfixJt') * 1000).toISOString().slice(0, 10), '2023-12-06')
  console.log('✓ Veröffentlichungstag aus dem Instagram-Link')

  assert.deepEqual(showcaseCampaigns().map((c) => [c.name, c.views]), [
    ['DinDrop', 100_000_000], ['Max Tornow', 70_000_000], ['Caspian Blue', 40_000_000], ['Levantine Istanbul', 3_000_000], ['Panperium', 450_000]])
  const din = showcaseCampaign('usecase-dindrop')!
  assert.deepEqual(din.clips.slice(0, 3).map((c) => c.views), [35_400_000, 11_600_000, 500_000])
  assert.ok(din.clips.slice(3).every((c) => c.views === -1))
  assert.equal(showcaseCampaign('p-1'), null)
  console.log('✓ Kampagnen mit den Zahlen der Startseite, Reels ohne Zahl ohne Views')

  const demo = { id: 'udemo', role: 'agency', demo: 1 } as any
  const real = { id: 'ureal', role: 'agency', demo: 0 } as any
  assert.ok(showsShowcase(demo) && !showsShowcase(real) && !showsShowcase({ role: 'customer', demo: 1 }))

  const a = await viewsAnalyticsFor(env, demo)
  assert.equal(a.total, 213_451_000)
  assert.deepEqual(a.top.map((t) => t.name), ['DinDrop', 'Max Tornow', 'Caspian Blue', 'Levantine Istanbul', 'Panperium', 'Eigene Demo'])
  assert.equal(a.series.at(-1)?.views, 213_451_000)
  assert.equal(a.platforms[0].platform, 'instagram')
  // Freigegebener Verlauf: 7 Tage genau 732.431 (+ eigene Kampagne der Demo: 0 in diesem Zeitraum), gleichmäßig steigend
  const sr = a.series, at = (n: number) => sr[sr.length - 1].views - sr[sr.length - 1 - n].views
  assert.equal(at(7), 732_431)
  assert.ok(at(30) > 3_000_000 && at(30) < 3_150_000, 'Views 30 Tage: ' + at(30))
  assert.ok(at(90) > 8_700_000 && at(90) < 9_000_000, 'Views 90 Tage: ' + at(90))
  for (let i = sr.length - 360; i < sr.length; i++) assert.ok(sr[i].views - sr[i - 1].views < 150_000, 'kein Sprung am ' + sr[i].day)
  assert.deepEqual(a.live, { minPerMinute: 15_000, maxPerMinute: 23_000 })
  console.log('✓ Kurve: 7 Tage 732.431, 30/90 Tage passend, kein Tag mit Sprung, Live-Zähler 15.000–23.000/Min.')
  const r = await viewsAnalyticsFor(env, real)
  assert.equal(r.live, undefined)
  assert.deepEqual(r.top.map((t) => t.name), ['Echte'])
  console.log('✓ Views-Grafik: Demo-Agentur mit Use Cases + eigenen, echte Agentur ohne')

  const v = await viralClipsFor(env, demo)
  assert.deepEqual(v.map((c) => c.views), [35_400_000, 13_100_000, 11_600_000, 6_400_000, 821_000, 500_000, 475_000, 1000])
  assert.ok(v.slice(0, 7).every((c) => c.url?.startsWith('https://www.instagram.com/reel/')))
  assert.deepEqual((await viralClipsFor(env, real)).map((c) => c.id), ['d2'])
  console.log('✓ Virale Clips: genau die angegebenen Reels in der richtigen Reihenfolge, echte Agentur ohne')
})().catch((e) => {
  console.error('✗', e)
  process.exit(1)
})
