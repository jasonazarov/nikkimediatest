import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { openDraft, processDrafts, saveDraft, submitDraft, DRAFT_ADMIN_AFTER_SEC, DRAFT_REMIND_AFTER_SEC } from '../../src/lib/drafts'
import { customerTimeline } from '../../src/lib/crm'

// Angefangene Kampagnen-Formulare (lib/drafts.ts) und CRM-Verlauf (lib/crm.ts).
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const sent: { to: string; subject: string }[] = []
;(globalThis as any).fetch = async (_u: string, init: any) => {
  const b = JSON.parse(init.body); sent.push({ to: [].concat(b.to).join(','), subject: b.subject })
  return new Response('{}', { status: 200 })
}
const env: any = { DB: db, ADMIN_EMAIL: 'admin@x.de', APP_URL: 'https://nikkimedia.co', RESEND_API_KEY: 'test', MAIL_FROM: 'a@b' }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const t0 = 1_800_000_000
x(`INSERT INTO users (id,email,role,full_name,created_at,demo) VALUES ('uc','kunde@x.de','customer','Kim Kunde',1,0),('ud','d@demo.nikkimedia.co','customer','Demo',1,1)`)
x(`INSERT INTO customers (id,user_id,company,storage_bytes,created_at) VALUES ('cc','uc','Kim GmbH',0,1),('cd','ud',NULL,0,1)`)

;(async () => {
  assert.equal(await saveDraft(env, 'uc', 'cc', {}, t0), null)
  const id = await saveDraft(env, 'uc', 'cc', { name: ' Sommer ', durationDays: 60, views: 123 }, t0)
  let d = await openDraft(env, 'uc')
  assert.deepEqual([d?.id, d?.name, d?.durationDays, d?.views], [id, 'Sommer', 60, null])
  await saveDraft(env, 'uc', 'cc', { name: 'Sommer', durationDays: 60, views: 2_500_000 }, t0 + 10)
  d = await openDraft(env, 'uc')
  assert.deepEqual([d?.id, d?.views, d?.updatedAt], [id, 2_500_000, t0 + 10])
  console.log('✓ Entwurf: leer nichts, ungültige Werte verworfen, ein offener Entwurf je Kunde')

  // Zu früh: nichts
  assert.deepEqual(await processDrafts(env, t0 + 10 + DRAFT_ADMIN_AFTER_SEC - 1), { admin: 0, reminded: 0 })
  assert.deepEqual(await processDrafts(env, t0 + 10 + DRAFT_ADMIN_AFTER_SEC), { admin: 1, reminded: 0 })
  assert.deepEqual(await processDrafts(env, t0 + 10 + DRAFT_ADMIN_AFTER_SEC + 900), { admin: 0, reminded: 0 })
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'admin@x.de'); assert.match(sent[0].subject, /nicht abgeschlossen: Kim GmbH/)
  assert.deepEqual(await processDrafts(env, t0 + 10 + DRAFT_REMIND_AFTER_SEC), { admin: 0, reminded: 1 })
  assert.deepEqual(await processDrafts(env, t0 + 10 + DRAFT_REMIND_AFTER_SEC * 3), { admin: 0, reminded: 0 })
  assert.equal(sent.length, 2); assert.equal(sent[1].to, 'kunde@x.de')
  console.log('✓ Nach 2 Stunden Admin, nach 24 Stunden Kunde, jeweils genau einmal')

  // Abgeschickt: erledigt, kein weiterer Hinweis
  x(`INSERT INTO projects (id,customer_id,name,status,created_at,briefing_views,briefing_duration_days) VALUES ('p1','cc','Sommer','aktiv',?,2500000,60)`, t0 + 99_999)
  await submitDraft(env, 'uc', 'p1', t0 + 99_999)
  assert.equal(await openDraft(env, 'uc'), null)
  await saveDraft(env, 'ud', 'cd', { name: 'Demo' }, t0)
  assert.deepEqual(await processDrafts(env, t0 + DRAFT_REMIND_AFTER_SEC * 2), { admin: 1, reminded: 1 })
  assert.equal(sent.length, 2)
  console.log('✓ Abgeschickt: erledigt; Demo-Konten: abgehakt, ohne Mail')

  await saveDraft(env, 'uc', 'cc', { durationDays: 30 }, t0 + 200_000)
  x(`INSERT INTO leads (id,full_name,email,phone,platforms,industry,footage_amount,budget_range,created_at,customer_id) VALUES ('l1','Kim','kunde@x.de','1','[]','Food','viel','5–10k',?, 'cc')`, t0 - 100)
  x(`INSERT INTO upsell_requests (id,project_id,user_id,percent,base_views,extra_views,price_cents,status,created_at) VALUES ('u1','p1','uc',35,1,875000,404688,'offen',?)`, t0 + 150_000)
  const tl = await customerTimeline(env, { customerId: 'cc', userId: 'uc' })
  assert.deepEqual(tl.map((e) => e.kind), ['draft', 'push', 'campaign', 'lead'])
  assert.ok(tl[0].attention && tl[1].attention)
  assert.match(tl[2].detail, /60 days · 2,500,000 views/)
  assert.equal(tl[2].href, '/admin/projekte/p1')
  console.log('✓ CRM-Verlauf: Lead, Kampagne mit Angaben, Push, offener Entwurf, neueste zuerst')
})().catch((e) => { console.error('✗', e); process.exit(1) })
