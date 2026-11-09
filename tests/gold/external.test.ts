// Extern gepostete Videos (lib/metrics.ts → external_posts): Abgleich mit nachgestellten
// Zernio-Antworten, dann Summen, Views-Grafik und „Virale Clips“ je Rolle.
import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { externalRow, grandTotals, syncExternalAfterConnect, syncExternalPosts, totalsForProjects } from '../../src/lib/metrics'
import { viewsAnalyticsFor } from '../../src/lib/analytics'
import { viralClipsFor } from '../../src/lib/viral'

const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db, ZERNIO_API_KEY: 'test' }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const NOW = 1_780_000_000, D = 86400
const iso = (t: number) => new Date(t * 1000).toISOString()

x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ua','a@x','agency','Ag',1),('uo','o@x','customer','O',1),('ucl','cl@x','clipper','Cl',1),('ucr','cr@x','creator','Cr',1),('ad','ad@x','admin','A',1)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('ca','ua',0,1),('co','uo',0,1)`)
x(`INSERT INTO clippers (id,user_id,display_name,status,created_at) VALUES ('kl','ucl','Cl','aktiv',1)`)
x(`INSERT INTO creators (id,user_id,goal,platforms,open_to_ads,followers,views_total,views_30d,handles,created_at) VALUES ('cr','ucr','g','[]','ja','1','1','1','{}',1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('p1','ca','Omid Kampagne','aktiv',1),('p2','co','Andere','aktiv',1)`)
x(`INSERT INTO deliverables (id,project_id,clipper_id,r2_key,filename,created_at) VALUES ('d1','p1','kl','k','a.mp4',1)`)
// Kampagnen-Account (zählt) und ein Creator-Account (zählt nicht)
x(`INSERT INTO publish_accounts (provider_account_id,project_id,creator_id,provider_profile_id,platform,username,updated_at) VALUES ('acc1','p1',NULL,'prof1','tiktok','nikkiclips1',1),('acc9',NULL,'cr','prof9','tiktok','creator',1)`)
// Ein über die Plattform veröffentlichter Clip auf demselben Account: steht schon in post_metrics
x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,url,views,synced_at) VALUES ('z1','acc1','d1','p1','tiktok','https://www.tiktok.com/@nikkiclips1/video/100',500,?)`, NOW)

const post = (id: string, views: number, extra: Record<string, unknown> = {}) => ({
  _id: id,
  latePostId: null,
  publishedAt: iso(NOW - 5 * D),
  platform: 'tiktok',
  isExternal: true,
  thumbnailUrl: `https://media.zernio.com/${id}.jpg`,
  platformPostUrl: `https://www.tiktok.com/@nikkiclips1/video/${id}`,
  platforms: [{ platform: 'tiktok', accountId: 'acc1', accountUsername: '@nikkiclips1', status: 'published',
    platformPostUrl: `https://www.tiktok.com/@nikkiclips1/video/${id}`,
    analytics: { views, likes: 10, comments: 2, shares: 1, impressions: 0, lastUpdated: iso(NOW - 600) } }],
  ...extra,
})

let calls: string[] = []
let reply: () => Response
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string, init?: any) => { calls.push(`${init?.method ?? 'GET'} ${url}`); return reply() }) as any
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

;(async () => {
  assert.equal(externalRow({ _id: 'a', latePostId: 'z' }, { account_id: 'acc1', platform: 'tiktok', username: null }, NOW), null)
  assert.equal(externalRow('kein Objekt', { account_id: 'acc1', platform: 'tiktok', username: null }, NOW), null)
  console.log('✓ Über uns veröffentlichte Posts und Unsinn werden keine Zeile')

  reply = json({
    posts: [
      post('1', 1000),
      post('2', 9999, { latePostId: 'zernio-post' }),            // über uns veröffentlicht
      post('3', 8888, { isAd: true }),                          // Werbung
      { ...post('100', 7777) },                                 // Link steht schon in post_metrics
      post('5', 300, { publishedAt: iso(NOW - 40 * D), thumbnailUrl: 'javascript:alert(1)' }),
    ],
    pagination: { page: 1, limit: 100, total: 5, pages: 1 },
  })
  let r = await syncExternalPosts(env, { now: NOW })
  assert.deepEqual(r, { accounts: 1, fetched: 1, posts: 2, paused: false })
  assert.equal(calls.length, 1)
  const q = new URL(calls[0].split(' ')[1]).searchParams
  assert.equal(q.get('accountId'), 'acc1'); assert.equal(q.get('source'), 'external'); assert.equal(q.get('limit'), '100')
  const rows = db.raw.prepare('SELECT post_id, project_id, username, views, thumb_url FROM external_posts ORDER BY post_id').all() as any[]
  assert.deepEqual(rows.map((r) => [r.post_id, r.project_id, r.username, r.views]), [['1', 'p1', 'nikkiclips1', 1000], ['5', 'p1', 'nikkiclips1', 300]])
  assert.equal(rows[1].thumb_url, null)
  console.log('✓ Nur der Kampagnen-Account, ohne eigene Posts, Werbung und Doppelte; nur https-Links')

  calls = []
  r = await syncExternalPosts(env, { now: NOW + 600 })
  assert.equal(r.fetched, 0); assert.equal(calls.length, 0)
  console.log('✓ Höchstens einmal je Stunde je Account')

  reply = json({ posts: [post('1', 0), post('5', 450)], pagination: { pages: 1 } })
  r = await syncExternalPosts(env, { now: NOW + 3600 })
  assert.equal(r.posts, 2)
  const v = Object.fromEntries((db.raw.prepare('SELECT post_id, views FROM external_posts').all() as any[]).map((r) => [r.post_id, r.views]))
  assert.deepEqual(v, { '1': 1000, '5': 450 })
  console.log('✓ Neue Zahlen ersetzen alte, eine 0 nach echten Views nicht')

  calls = []
  reply = json({ error: 'Analytics not included' }, 402)
  r = await syncExternalPosts(env, { projectId: 'p1', force: true, now: NOW + 3700 })
  assert.equal(r.paused, true)
  const mark = db.raw.prepare(`SELECT value FROM app_state WHERE key = 'external_synced:acc1'`).get() as any
  assert.equal(Number(mark.value), NOW + 3600)
  console.log('✓ 402: Lauf hält an, Account bleibt fällig')

  // Lesen: Summen, Grafik und virale Clips
  const t = await totalsForProjects(env, ['p1', 'p2'])
  assert.equal(t.get('p1')!.views, 500 + 1450); assert.equal(t.get('p1')!.posts, 3); assert.equal(t.has('p2'), false)
  assert.equal((await grandTotals(env)).views, 1950)
  console.log('✓ Kampagnen-Summen und Gesamtsumme zählen die externen Videos mit')

  const ag = await viewsAnalyticsFor(env, { id: 'ua', role: 'agency' } as any, NOW + 3600)
  assert.equal(ag.total, 1950); assert.equal(ag.clips, 3); assert.equal(ag.campaigns, 1)
  assert.deepEqual(ag.top.map((c) => [c.name, c.views]), [['Omid Kampagne', 1950]])
  assert.equal(ag.series.at(-1)!.views, 1950)
  const other = await viewsAnalyticsFor(env, { id: 'uo', role: 'customer' } as any, NOW + 3600)
  assert.equal(other.total, 0)
  const cl = await viewsAnalyticsFor(env, { id: 'ucl', role: 'clipper' } as any, NOW + 3600)
  assert.equal(cl.total, 500)
  console.log('✓ Views-Grafik: Agentur sieht ihre externen Videos, fremde Kunden und Clipper nicht')

  const vc = await viralClipsFor(env, { id: 'ua', role: 'agency' } as any)
  assert.deepEqual(vc.map((c) => c.views), [1000, 500, 450])
  assert.equal(vc[0].url, 'https://www.tiktok.com/@nikkiclips1/video/1'); assert.equal(vc[0].handle, 'nikkiclips1')
  assert.equal(vc[0].thumb, 'https://media.zernio.com/1.jpg')
  assert.equal(vc[2].thumb, 'https://media.zernio.com/5.jpg'); assert.equal(vc[1].thumb, '/media/kampagne/p1/thumb')
  const vk = await viralClipsFor(env, { id: 'ucl', role: 'clipper' } as any)
  assert.deepEqual(vk.map((c) => c.views), [500])
  console.log('✓ Virale Clips: externe Videos mit Link und Cover, beim Clipper nicht')

  // Gleich nach dem Verbinden: Zernio liest den Account sofort, dann holen wir die Videos ab.
  x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('p3','ca','Neu verbunden','aktiv',1)`)
  x(`INSERT INTO publish_accounts (provider_account_id,project_id,creator_id,provider_profile_id,platform,username,updated_at) VALUES ('acc3','p3',NULL,'prof3','tiktok','neu',1)`)
  calls = []
  reply = json({ posts: [{ ...post('31', 5000), platforms: [{ ...post('31', 5000).platforms[0], accountId: 'acc3' }] }], pagination: { pages: 1 } })
  await syncExternalAfterConnect(env, 'p3', 'acc3')
  assert.equal(calls[0], 'POST https://zernio.com/api/v1/posts/sync-external')
  assert.ok(calls[1].startsWith('GET https://zernio.com/api/v1/analytics?accountId=acc3&source=external'))
  assert.equal(calls.length, 2)
  assert.equal((await totalsForProjects(env, ['p3'])).get('p3')!.views, 5000)
  console.log('✓ Nach dem Verbinden: Zernio liest sofort, Views stehen ohne Wartezeit da')

  delete env.ZERNIO_API_KEY
  assert.deepEqual(await syncExternalPosts(env, { now: NOW + 9 * 3600 }), { accounts: 0, fetched: 0, posts: 0, paused: false })
  console.log('✓ Ohne ZERNIO_API_KEY passiert nichts')
  globalThis.fetch = realFetch
})().catch((e) => { console.error('✗', e); process.exit(1) })
