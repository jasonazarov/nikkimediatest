import { makeD1 } from './d1'
import assert from 'node:assert/strict'
const db = makeD1(new URL('../../migrations', import.meta.url).pathname)
// lib/db (uid, nowSec) mit Stub-Drizzle laden geht; uid braucht crypto
import * as A from '../../src/lib/articles'
import * as U from '../../src/lib/upsell'
const env: any = { DB: db }
const x = (sql: string, ...b: any[]) => db.raw.prepare(sql).run(...b)
const now = Math.floor(Date.now() / 1000)
x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ua','a@x.de','agency','Agentur A',?),('uc','c@x.de','customer','Kunde C',?),('ux','x@x.de','agency','Agentur X',?),('ucl','cl@x.de','clipper','Clip',?)`, now, now, now, now)
x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('ca','ua',0,?),('cc','uc',0,?),('cx','ux',0,?)`, now, now, now)
x(`INSERT INTO projects (id,customer_id,name,status,created_at,briefing_views,briefing_budget_cents) VALUES
  ('pa','ca','Agentur Kampagne','aktiv',?,2000000,800000),
  ('pc','cc','Kunden Kampagne','aktiv',?,NULL,NULL),
  ('pend','cc','Beendet','beendet',?,NULL,NULL),
  ('px','cx','Fremd','aktiv',?,NULL,NULL)`, now, now, now, now)
let pass = 0; const ok = (name: string, fn: () => any) => Promise.resolve(fn()).then(() => { pass++; console.log('✓', name) })

;(async () => {
  const agency: any = { id: 'ua', role: 'agency' }, cust: any = { id: 'uc', role: 'customer' }, clip: any = { id: 'ucl', role: 'clipper' }

  await ok('Agentur: Briefing-Preis 4 €/1.000 und Basis 2 Mio.', async () => {
    const r = await U.upsellCampaigns(env, agency)
    assert.equal(r.campaigns.length, 1)
    const c = r.campaigns[0]
    assert.equal(c.baseSource, 'briefing'); assert.equal(c.perThousandCents, 400)
    // Listenpreis 4 €/1.000, dann Push-Rabatt 5 / 7,5 / 11 % (nur Agentur und Kunde)
    assert.deepEqual(c.offers.map(o => [o.percent, o.extraViews, o.listPriceCents, o.discountPct, o.priceCents]),
      [[20,400000,160000,5,152000],[35,700000,280000,7.5,259000],[50,1000000,400000,11,356000]])
    assert.equal(c.offers[0].clientPriceCents, 152000) // Marge 0
    assert.equal(c.offers[0].clientListPriceCents, 160000)
  })
  await ok('Marge 30 % wird gespeichert und auf den Kundenpreis gerechnet', async () => {
    assert.equal(await U.setMargin(env, agency, 30), 30)
    const r = await U.upsellCampaigns(env, agency)
    assert.equal(r.marginPct, 30); assert.equal(r.campaigns[0].offers[1].clientPriceCents, 336700) // Marge auf den rabattierten Preis
    assert.equal(r.campaigns[0].offers[1].clientListPriceCents, 364000)
  })
  await ok('Marge: ungültige Werte und falsche Rolle abgewiesen', async () => {
    assert.ok('error' in (await U.setMargin(env, agency, -5) as any))
    assert.ok('error' in (await U.setMargin(env, agency, 301) as any))
    assert.ok('error' in (await U.setMargin(env, agency, 'abc') as any))
    assert.ok('error' in (await U.setMargin(env, cust, 20) as any))
  })
  await ok('Lead (nicht zum Kunden erklärt) bekommt keine Upsells', async () => {
    assert.equal((await U.upsellCampaigns(env, cust)).campaigns.length, 0)
    assert.equal((await U.createUpsell(env, cust, 'pc', 20) as any).status, 404)
    x(`UPDATE customers SET converted_at = ? WHERE id = 'cc'`, now)
  })
  await ok('Kunde ohne Briefing: Basis 1 Mio. zu 5 €, beendete Kampagne fehlt, kein Kundenpreis', async () => {
    const r = await U.upsellCampaigns(env, cust)
    assert.deepEqual(r.campaigns.map(c => c.id), ['pc'])
    const c = r.campaigns[0]
    assert.equal(c.baseSource, 'default'); assert.equal(c.offers[0].listPriceCents, 100000); assert.equal(c.offers[0].priceCents, 95000); assert.equal(c.offers[0].clientPriceCents, null)
  })
  await ok('Erreichte Views werden Basis, sobald es Zahlen gibt', async () => {
    x(`INSERT INTO deliverables (id,project_id,r2_key,filename,created_at) VALUES ('d1','pc','k','f.mp4',?)`, now)
    x(`INSERT INTO post_metrics (post_id,account_id,deliverable_id,project_id,platform,views,impressions,synced_at) VALUES ('p1','a1','d1','pc','tiktok',2345678,0,?)`, now)
    const c = (await U.upsellCampaigns(env, cust)).campaigns[0]
    assert.equal(c.baseSource, 'reached'); assert.equal(c.baseViews, 2345678); assert.equal(c.offers[1].extraViews, 821000)
  })
  await ok('Anfrage anlegen, Doppelklick wird abgewiesen, Status „pending“', async () => {
    const r: any = await U.createUpsell(env, cust, 'pc', 35)
    assert.ok(r.id); assert.equal(r.offer.listPriceCents, 410500); assert.equal(r.offer.priceCents, 379713) // 7,5 % Push-Rabatt
    const again: any = await U.createUpsell(env, cust, 'pc', 35); assert.equal(again.status, 409)
    const c = (await U.upsellCampaigns(env, cust)).campaigns[0]
    assert.deepEqual(c.offers.map(o => o.pending), [false, true, false])
  })
  await ok('Fremde, beendete Kampagnen, falsche Prozente und Clipper abgewiesen', async () => {
    assert.equal((await U.createUpsell(env, cust, 'px', 20) as any).status, 404)
    assert.equal((await U.createUpsell(env, cust, 'pend', 20) as any).status, 404)
    assert.equal((await U.createUpsell(env, cust, 'pc', 25) as any).status, 400) // alte Stufe gilt nicht mehr
    assert.equal((await U.createUpsell(env, clip, 'pc', 20) as any).status, 404)
  })
  await ok('Creator: nur eigene Kampagnen pushen, zugewiesene und fremde nicht', async () => {
    x(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('ucr','cr@x.de','creator','Creator R',?)`, now)
    x(`INSERT INTO customers (id,user_id,storage_bytes,created_at) VALUES ('ccr','ucr',0,?)`, now)
    x(`INSERT INTO projects (id,customer_id,name,status,created_at) VALUES ('pcr','ccr','Eigene','aktiv',?)`, now)
    const creator: any = { id: 'ucr', role: 'creator' }
    const r = await U.upsellCampaigns(env, creator)
    assert.deepEqual(r.campaigns.map(c => c.id), ['pcr']); assert.equal(r.campaigns[0].offers[2].clientPriceCents, null)
    assert.ok(r.campaigns[0].offers.every(o => o.discountPct === 0 && o.priceCents === o.listPriceCents)) // Creator: kein Push-Rabatt
    assert.equal((await U.createUpsell(env, creator, 'pc', 20) as any).status, 404)
    const made: any = await U.createUpsell(env, creator, 'pcr', 20); assert.ok(made.id)
    x(`DELETE FROM upsell_requests WHERE id = ?`, made.id)
  })
  await ok('Agentur-Anfrage speichert rabattierten Preis und Kundenpreis mit Marge', async () => {
    const r: any = await U.createUpsell(env, agency, 'pa', 50)
    const row: any = db.raw.prepare('SELECT price_cents, client_price_cents FROM upsell_requests WHERE id=?').get(r.id)
    assert.equal(row.price_cents, 356000); assert.equal(row.client_price_cents, 462800) // nach 11 % Push-Rabatt, Marge 30 % darauf
  })
  await ok('Admin-Liste: offene zuerst; Status setzen; ungültiger Status abgewiesen', async () => {
    const list = await U.allUpsells(env); assert.equal(list.length, 2); assert.ok(list.every(l => l.status === 'offen'))
    assert.equal(await U.setUpsellStatus(env, list[0].id, 'bestätigt'), true)
    assert.ok('error' in (await U.setUpsellStatus(env, list[0].id, 'egal') as any))
    const after = await U.allUpsells(env); assert.equal(after[0].status, 'offen'); assert.equal(after[1].status, 'bestätigt')
    // nach Bestätigung darf dasselbe Angebot erneut angefragt werden
    const again: any = await U.createUpsell(env, after[1].role === 'agency' ? agency : cust, after[1].projectId, after[1].percent)
    assert.ok(again.id)
  })
  await ok('Artikel: Slug, Pflichtfelder, https-Pflicht', () => {
    assert.equal(A.slugify('Was kostet Clipping 2026? Über Größe & Preis'), 'was-kostet-clipping-2026-ueber-groesse-preis')
    assert.ok('error' in A.parseArticle({ title: '', excerpt: 'x', body: 'y' }))
    assert.ok('error' in A.parseArticle({ title: 'T', excerpt: '', body: 'y' }))
    assert.ok('error' in A.parseArticle({ title: 'T', excerpt: 'E' }))
    assert.ok('error' in A.parseArticle({ title: 'T', excerpt: 'E', sourceUrl: 'http://x.de' }))
    assert.ok(!('error' in A.parseArticle({ title: 'T', excerpt: 'E', sourceUrl: 'https://x.de/a' })))
  })
  await ok('Artikel: anlegen, gleiche Adresse bekommt -2, Entwurf und Zukunft sind unsichtbar', async () => {
    const a = await A.createArticle(env, A.parseArticle({ title: 'Clipping erklärt', excerpt: 'Kurz', body: 'Absatz 1\n\nAbsatz 2' }) as any)
    const b = await A.createArticle(env, A.parseArticle({ title: 'Clipping erklärt', excerpt: 'Kurz', body: 'x' }) as any)
    assert.equal(a.slug, 'clipping-erklaert'); assert.equal(b.slug, 'clipping-erklaert-2')
    await A.createArticle(env, A.parseArticle({ title: 'Entwurf', excerpt: 'E', body: 'x', published: false }) as any)
    await A.createArticle(env, A.parseArticle({ title: 'Morgen', excerpt: 'E', body: 'x', publishedAt: new Date(Date.now() + 86400e3).toISOString() }) as any)
    assert.equal((await A.publishedArticles(env)).length, 2)
    assert.equal((await A.allArticles(env)).length, 4)
    assert.equal(await A.articleBySlug(env, 'entwurf'), null)
    assert.ok(await A.articleBySlug(env, 'clipping-erklaert'))
  })
  await ok('Artikel: bearbeiten behält eigene Adresse, löschen', async () => {
    const a = (await A.articleBySlug(env, 'clipping-erklaert'))!
    const u = await A.updateArticle(env, a.id, A.parseArticle({ title: 'Clipping erklärt', excerpt: 'Neu', body: 'B' }) as any)
    assert.equal(u!.slug, 'clipping-erklaert'); assert.equal(u!.excerpt, 'Neu')
    assert.equal(await A.deleteArticle(env, a.id), true); assert.equal(await A.deleteArticle(env, a.id), false)
  })
  await ok('Projekt löschen räumt Upsell-Anfragen mit ab (Fremdschlüssel)', async () => {
    x(`DELETE FROM projects WHERE id='pc'`)
    assert.equal((db.raw.prepare(`SELECT count(*) n FROM upsell_requests WHERE project_id='pc'`).get() as any).n, 0)
  })
  console.log(`\n${pass} Prüfungen bestanden`)
})().catch((e) => { console.error('✗ FEHLER', e); process.exit(1) })
