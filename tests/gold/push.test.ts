import { makeD1 } from './d1'
import assert from 'node:assert/strict'
import { campaignWindow, DEFAULT_CAMPAIGN_DAYS, setPushPopupDays, upsellCampaigns } from '../../src/lib/upsell'

// Push-Rabatt nur innerhalb des Kampagnenzeitraums (Popup alle 7 Tage zeigt die Resttage).
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const DAY = 86_400, now = 1_800_000_000
x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('uc','c@x.de','customer','Kunde',1)`)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at,converted_at) VALUES ('cc','uc',0,1,1)`)
x(`INSERT INTO projects (id,customer_id,name,status,created_at,briefing_duration_days) VALUES
  ('p60','cc','60 Tage','aktiv',?,60), ('pold','cc','Ohne Laufzeit, alt','aktiv',?,NULL), ('pnew','cc','Ohne Laufzeit, neu','aktiv',?,NULL)`,
  now - 50 * DAY, now - 31 * DAY, now - 10 * DAY)

;(async () => {
  assert.deepEqual(campaignWindow(now, 90, now), { durationDays: 90, endsAt: now + 90 * DAY, daysLeft: 90 })
  assert.equal(campaignWindow(now, null, now).durationDays, DEFAULT_CAMPAIGN_DAYS)
  assert.equal(campaignWindow(now - DAY / 2, 30, now).daysLeft, 30) // angebrochener Tag zählt mit
  assert.equal(campaignWindow(now - 40 * DAY, 30, now).daysLeft, 0)
  console.log('✓ Kampagnenzeitraum: Anlage + Laufzeit, ohne Laufzeit 30 Tage, Resttage aufgerundet')

  const { campaigns } = await upsellCampaigns(env, { id: 'uc', role: 'customer' } as any, now)
  const by = Object.fromEntries(campaigns.map((c) => [c.id, c]))
  assert.equal(by.p60.daysLeft, 10)
  assert.deepEqual(by.p60.offers.map((o) => o.discountPct), [5, 7.5, 11])
  assert.equal(by.pnew.daysLeft, 20)
  assert.equal(by.pold.daysLeft, 0)
  assert.deepEqual(by.pold.offers.map((o) => o.discountPct), [0, 0, 0])
  assert.ok(by.pold.offers.every((o) => o.priceCents === o.listPriceCents))
  console.log('✓ Rabatt nur bis Kampagnenende, danach Angebot zum Listenpreis')

  const cust: any = { id: 'uc', role: 'customer' }
  assert.equal((await upsellCampaigns(env, cust, now)).popupDays, 7)
  assert.deepEqual(await setPushPopupDays(env, 'cc', 3), { days: 3 })
  assert.equal((await upsellCampaigns(env, cust, now)).popupDays, 3)
  assert.deepEqual(await setPushPopupDays(env, 'cc', 0), { days: 0 })
  assert.equal((await upsellCampaigns(env, cust, now)).popupDays, 0)
  assert.ok('error' in (await setPushPopupDays(env, 'cc', 91)))
  assert.ok('error' in (await setPushPopupDays(env, 'cc', 'x')))
  assert.ok('error' in (await setPushPopupDays(env, 'nope', 5)))
  assert.deepEqual(await setPushPopupDays(env, 'cc', null), { days: null })
  assert.equal((await upsellCampaigns(env, cust, now)).popupDays, 7)
  console.log('✓ Popup-Abstand je Kunde: Standard 7, 0 = aus, 1 bis 90, ungültig abgewiesen')

  // Leads (noch nicht bestätigt): standardmäßig KEIN Push, nur wenn der Admin es einschaltet.
  x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ul','l@x.de','customer','Lead',1)`)
  x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('cl','ul',0,1)`)
  x(`INSERT INTO projects (id,customer_id,name,status,created_at,briefing_duration_days) VALUES ('pl','cl','Lead-Kampagne','aktiv',?,30)`, now - 2 * DAY)
  const lead: any = { id: 'ul', role: 'customer' }
  assert.deepEqual(await upsellCampaigns(env, lead, now), { marginPct: 0, campaigns: [], popupDays: 0 })
  await setPushPopupDays(env, 'cl', 5)
  const on = await upsellCampaigns(env, lead, now)
  assert.equal(on.popupDays, 5); assert.equal(on.campaigns.length, 1); assert.equal(on.campaigns[0].daysLeft, 28)
  await setPushPopupDays(env, 'cl', 0)
  assert.equal((await upsellCampaigns(env, lead, now)).campaigns.length, 0)
  console.log('✓ Leads: ohne Einstellung kein Push, eingeschaltet mit eigenem Abstand, 0 = wieder aus')
})().catch((e) => { console.error('✗', e); process.exit(1) })
