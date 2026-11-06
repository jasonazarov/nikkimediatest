import { Hono } from 'hono'
import type { Role } from '../db/schema'
import { consumeRateLimit, currentUser } from '../lib/auth'
import { audit } from '../lib/audit'
import { answerQuestion } from '../lib/faq'
import { INVESTOR_KINDS, INVESTOR_TICKETS } from '../lib/investors'
import { mailInvestorAdmin, mailUpsellAdmin } from '../lib/mail'
import { agencyLeadForUser, agencyUnlocked } from '../lib/agency'
import { createArticle, deleteArticle, parseArticle, updateArticle } from '../lib/articles'
import { createUpsell, setMargin, setUpsellStatus, upsellCampaigns } from '../lib/upsell'
import { formatEuro } from '../views/layout'
import { composePhone } from '../lib/phone'
import { viralClipsFor } from '../lib/viral'
import { viewsAnalyticsFor } from '../lib/analytics'
import type { AppEnv } from '../lib/types'

/**
 * Marktplatz-Endpunkte der Gold-Oberfläche (November 2026):
 *
 *   POST /api/agent/faq     FAQ-Agent der Landingpages und Dashboards (öffentlich, gedrosselt)
 *   GET  /api/viral-clips   „Virale Clips“ oben in jeder Übersicht (je Rolle, siehe lib/viral.ts)
 *   GET  /api/views-analytics  Views-Grafik der Übersichten und /admin/analytics (lib/analytics.ts)
 *   POST /api/investors     Anfrage über /investoren → Mail an ADMIN_EMAIL + audit_log
 *   GET  /api/upsell        Angebote +20/35/50 % Budget je Kampagne (Kunde, Agentur, Creator; lib/upsell.ts)
 *   POST /api/upsell        Anfrage anlegen → upsell_requests + Mail an ADMIN_EMAIL
 *   PUT  /api/agency/margin Aufschlag der Agentur auf unsere Preise
 *   /api/gold-admin/…       Fachartikel anlegen/ändern/löschen, Upsell-Status (nur Admin)
 *
 * In index.ts VOR `/api` eingehängt, damit keine Rollen-Middleware aus
 * api.ts dazwischenfunkt. Bestehende Endpunkte bleiben unberührt.
 */
export const marketplaceApi = new Hono<AppEnv>()

const clientIp = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unbekannt'

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* ------------------------------------------------------------ FAQ-Agent */

marketplaceApi.post('/agent/faq', async (c) => {
  if (!(await consumeRateLimit(c.env, `agent:${clientIp(c)}`, 40, 3600))) {
    return c.json({ error: 'Zu viele Fragen in kurzer Zeit. Bitte versuche es in einer Stunde erneut.' }, 429)
  }
  const body = (await c.req.json().catch(() => ({}))) as { question?: unknown }
  const question = str(body.question, 400)
  if (question.length < 2) return c.json({ error: 'Bitte stell eine Frage.' }, 400)
  const answer = await answerQuestion(c.env, question)
  return c.json(answer)
})

/* ---------------------------------------------------------- Virale Clips */

const AREAS: Role[] = ['admin', 'customer', 'agency', 'clipper', 'creator']

marketplaceApi.get('/viral-clips', async (c) => {
  // Jede Rolle hat ihr eigenes Cookie — die Seite sagt, aus welchem Bereich sie fragt.
  const area = c.req.query('area') as Role | undefined
  if (!area || !AREAS.includes(area)) return c.json({ error: 'Unbekannter Bereich.' }, 400)
  const user = await currentUser(c.env, c, area)
  if (!user) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const clips = await viralClipsFor(c.env, user, 8)
  c.header('Cache-Control', 'private, max-age=60')
  return c.json({ clips })
})

/* --------------------------------------------------------- Views-Grafik */

marketplaceApi.get('/views-analytics', async (c) => {
  const area = c.req.query('area') as Role | undefined
  if (!area || !AREAS.includes(area)) return c.json({ error: 'Unbekannter Bereich.' }, 400)
  const user = await currentUser(c.env, c, area)
  if (!user) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const data = await viewsAnalyticsFor(c.env, user)
  // Links zu den Kampagnen nur, wo es eine Kampagnenseite für diese Rolle gibt.
  const href: Partial<Record<Role, (id: string) => string>> = {
    admin: (id) => `/admin/projekte/${encodeURIComponent(id)}`,
    customer: (id) => `/app/projekt/${encodeURIComponent(id)}`,
    clipper: (id) => `/work/projekt/${encodeURIComponent(id)}`,
    agency: (id) => `/collaboration/kampagne/${encodeURIComponent(id)}`,
  }
  const link = href[user.role]
  c.header('Cache-Control', 'private, max-age=60')
  return c.json({ ...data, top: data.top.map((t) => ({ ...t, href: link ? link(t.id) : null })) })
})

/* ------------------------------------------------------------- Investoren */


marketplaceApi.post('/investors', async (c) => {
  if (!(await consumeRateLimit(c.env, `investor:${clientIp(c)}`, 5, 3600))) {
    return c.json({ error: 'Zu viele Anfragen von dieser Verbindung. Bitte versuche es später erneut.' }, 429)
  }
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  // Honeypot wie bei /api/leads: Treffer → Erfolg melden, nichts tun.
  if (str(b.website, 200)) {
    await audit(c.env, { action: 'investor.honeypot', entity: 'investor', payload: { ip: clientIp(c) } })
    return c.json({ ok: true })
  }

  const fullName = str(b.fullName, 120)
  const email = str(b.email, 200).toLowerCase()
  const phone = composePhone(str(b.phoneDial, 8), str(b.phone, 40))
  const company = str(b.company, 160) || null
  const kind = INVESTOR_KINDS.includes(str(b.kind, 60)) ? str(b.kind, 60) : ''
  const ticket = INVESTOR_TICKETS.includes(str(b.ticket, 60)) ? str(b.ticket, 60) : ''
  const message = str(b.message, 2000) || null

  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !kind || !ticket || b.privacy !== true) {
    return c.json({ error: 'Bitte fülle alle Pflichtfelder aus und stimme der Datenschutzerklärung zu.' }, 400)
  }

  await audit(c.env, {
    action: 'investor.request',
    entity: 'investor',
    payload: { fullName, email, phone, company, kind, ticket, message },
  })
  await mailInvestorAdmin(c.env, { fullName, email, phone, company, kind, ticket, message })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------- Upsells */

/**
 * Wer Upsells sehen und anfragen darf: Kunden und Creator (eigene Kampagnen)
 * immer, Agenturen nur mit freigeschaltetem Zugang (wie alle anderen Agentur-Bereiche).
 */
async function upsellUser(c: any): Promise<{ user: any } | Response> {
  const area = c.req.query('area') ?? (await c.req.json().catch(() => ({}))).area
  if (area !== 'customer' && area !== 'agency' && area !== 'creator') return c.json({ error: 'Unbekannter Bereich.' }, 400)
  const user = await currentUser(c.env, c, area)
  if (!user) return c.json({ error: 'Nicht angemeldet.' }, 401)
  if (area === 'agency') {
    const lead = await agencyLeadForUser(c.env, user.id)
    if (!lead || !agencyUnlocked(lead)) return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  }
  return { user }
}

marketplaceApi.get('/upsell', async (c) => {
  const u = await upsellUser(c)
  if (u instanceof Response) return u
  return c.json(await upsellCampaigns(c.env, u.user))
})

marketplaceApi.post('/upsell', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const area = body.area
  if (area !== 'customer' && area !== 'agency' && area !== 'creator') return c.json({ error: 'Unbekannter Bereich.' }, 400)
  const user = await currentUser(c.env, c, area)
  if (!user) return c.json({ error: 'Nicht angemeldet.' }, 401)
  if (area === 'agency') {
    const lead = await agencyLeadForUser(c.env, user.id)
    if (!lead || !agencyUnlocked(lead)) return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  }
  if (!(await consumeRateLimit(c.env, `upsell:${user.id}`, 20, 3600))) {
    return c.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, 429)
  }
  const r = await createUpsell(c.env, user, body.projectId, body.percent)
  if ('error' in r) return c.json({ error: r.error }, r.status as 400)
  await audit(c.env, {
    actorId: user.id,
    action: 'upsell.request',
    entity: 'project',
    entityId: r.campaign.id,
    payload: { percent: r.offer.percent, extraViews: r.offer.extraViews, priceCents: r.offer.priceCents },
  })
  await mailUpsellAdmin(c.env, {
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    campaign: r.campaign.name,
    percent: r.offer.percent,
    extraViews: r.offer.extraViews,
    price: formatEuro(r.offer.priceCents),
    clientPrice: r.offer.clientPriceCents == null ? null : formatEuro(r.offer.clientPriceCents),
  })
  return c.json({ ok: true, offer: r.offer })
})

marketplaceApi.put('/agency/margin', async (c) => {
  const user = await currentUser(c.env, c, 'agency')
  if (!user) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as { pct?: unknown }
  const r = await setMargin(c.env, user, body.pct)
  if (typeof r !== 'number') return c.json({ error: r.error }, 400)
  await audit(c.env, { actorId: user.id, action: 'agency.margin', entity: 'user', entityId: user.id, payload: { pct: r } })
  return c.json({ ok: true, pct: r })
})

/* ------------------------------------------------- Admin: Artikel, Upsells */

const adminOnly = async (c: any) => currentUser(c.env, c, 'admin')

marketplaceApi.post('/gold-admin/articles', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const parsed = parseArticle((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const a = await createArticle(c.env, parsed)
  await audit(c.env, { actorId: admin.id, action: 'article.create', entity: 'article', entityId: a.id, payload: { slug: a.slug } })
  return c.json({ ok: true, article: a })
})

marketplaceApi.put('/gold-admin/articles/:id', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const parsed = parseArticle((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const a = await updateArticle(c.env, c.req.param('id'), parsed)
  if (!a) return c.json({ error: 'Diesen Artikel gibt es nicht mehr.' }, 404)
  await audit(c.env, { actorId: admin.id, action: 'article.update', entity: 'article', entityId: a.id, payload: { slug: a.slug } })
  return c.json({ ok: true, article: a })
})

marketplaceApi.delete('/gold-admin/articles/:id', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const id = c.req.param('id')
  if (!(await deleteArticle(c.env, id))) return c.json({ error: 'Diesen Artikel gibt es nicht mehr.' }, 404)
  await audit(c.env, { actorId: admin.id, action: 'article.delete', entity: 'article', entityId: id })
  return c.json({ ok: true })
})

marketplaceApi.put('/gold-admin/upsells/:id', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ error: 'Nicht angemeldet.' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as { status?: unknown }
  const r = await setUpsellStatus(c.env, c.req.param('id'), body.status)
  if (r !== true) return c.json({ error: typeof r === 'object' ? r.error : 'Diese Anfrage gibt es nicht mehr.' }, typeof r === 'object' ? 400 : 404)
  await audit(c.env, { actorId: admin.id, action: 'upsell.status', entity: 'upsell', entityId: c.req.param('id'), payload: { status: body.status } })
  return c.json({ ok: true })
})
