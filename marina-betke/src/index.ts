/**
 * Marina Betke: Website + Lead-CRM auf Cloudflare Workers.
 *
 *   public/            alle Seiten von marinabetke.de (statisch, vor dem Worker)
 *   /terminbuchung/    Stepper (views/stepper.ts), schickt an POST /api/leads
 *   /admin             CRM: Übersicht, Leads, Detail mit Verlauf, CSV-Export
 *
 * Aufbau wie bei Nikki Media (Hono, D1, serverseitig gerendertes HTML), aber
 * dahinter nur das CRM: Es werden Leads gesammelt, sonst nichts.
 */
import { Hono, type Context } from 'hono'
import { currentSession, login, logout, sameOrigin } from './lib/auth'
import { STATUS, isStatus, type Status } from './lib/fragen'
import {
  LEADS_PER_HOUR, addNote, countBy, createdSince, deleteLead, eventsOf, leadByNr, listLeads, parseLead, recentFromIp,
  saveLead, setStatus, statusCounts, type Lead,
} from './lib/leads'
import { mailNewLead } from './lib/mail'
import { ipHash, type Env } from './lib/util'
import { leadPage, leadsCsv, leadsPage, loginPage, overviewPage, statusLabel } from './views/admin'
import { terminbuchungPage } from './views/terminbuchung'

type App = { Bindings: Env }
type C = Context<App>

const app = new Hono<App>()

const clientIp = (c: C) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()

const noStore = (c: C) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'same-origin')
}

/* ------------------------------------------------------------ Webseite */

app.get('/terminbuchung', (c) => c.redirect('/terminbuchung/' + (new URL(c.req.url).search || ''), 301))
app.get('/terminbuchung/', (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.html(terminbuchungPage())
})

/* ----------------------------------------------------------------- API */

app.post('/api/leads', async (c) => {
  c.header('Cache-Control', 'no-store')
  if (!sameOrigin(c)) return c.json({ ok: false, error: 'origin' }, 403)

  let body: Record<string, unknown>
  try {
    const raw = await c.req.text()
    if (raw.length > 8000) return c.json({ ok: false, error: 'zu groß' }, 413)
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('kein Objekt')
  } catch {
    return c.json({ ok: false, error: 'json' }, 400)
  }

  // Honeypot: Menschen sehen das Feld nicht. Bots bekommen „ok“, gespeichert wird nichts.
  if (typeof body.website === 'string' && body.website.trim()) {
    return c.json({ ok: true, nr: String(100000 + Math.floor(Math.random() * 900000)), telefon: '' })
  }

  const parsed = parseLead(body)
  if (!parsed.ok) return c.json({ ok: false, field: parsed.field, error: parsed.message }, 400)

  const ip = await ipHash(c.env, clientIp(c))
  if ((await recentFromIp(c.env, ip)) >= LEADS_PER_HOUR) return c.json({ ok: false, error: 'rate' }, 429)

  const { lead, duplicate } = await saveLead(c.env, parsed.input, { ipHash: ip, userAgent: c.req.header('user-agent') ?? '' })
  if (!duplicate) c.executionCtx.waitUntil(mailNewLead(c.env, lead, new URL(c.req.url).origin))
  console.log(JSON.stringify({ event: duplicate ? 'lead.duplicate' : 'lead.created', nr: lead.nr }))
  return c.json({ ok: true, nr: lead.nr, telefon: lead.telefon })
})

/* ------------------------------------------------------------- CRM-Login */

app.use('/admin/*', async (c, next) => {
  noStore(c)
  await next()
})
app.get('/admin/', (c) => c.redirect('/admin'))

app.get('/admin/login', async (c) => {
  noStore(c)
  if (await currentSession(c)) return c.redirect('/admin')
  if (!c.env.ADMIN_PASSWORD) return c.html(loginPage('Das CRM ist noch nicht eingerichtet: Secret ADMIN_PASSWORD fehlt (npx wrangler secret put ADMIN_PASSWORD).', 'info'))
  return c.html(loginPage())
})

app.post('/admin/login', async (c) => {
  noStore(c)
  if (!sameOrigin(c)) return c.text('Forbidden', 403)
  const form = await c.req.parseBody()
  const pw = typeof form.password === 'string' ? form.password : ''
  const result = await login(c, pw, await ipHash(c.env, clientIp(c)))
  if (result === 'ok') return c.redirect('/admin', 303)
  const msg = {
    falsch: 'Das Passwort stimmt nicht.',
    gesperrt: 'Zu viele Fehlversuche. Bitte warte 15 Minuten.',
    'nicht-eingerichtet': 'Das CRM ist noch nicht eingerichtet: Secret ADMIN_PASSWORD fehlt.',
  }[result]
  return c.html(loginPage(msg), result === 'gesperrt' ? 429 : 401)
})

app.post('/admin/logout', async (c) => {
  if (!sameOrigin(c)) return c.text('Forbidden', 403)
  await logout(c)
  return c.redirect('/admin/login', 303)
})

/* Alles Weitere unter /admin nur mit Sitzung. */
const guard = async (c: C, next: () => Promise<void>) => {
  if (!(await currentSession(c))) return c.redirect('/admin/login')
  if (c.req.method === 'POST' && !sameOrigin(c)) return c.text('Forbidden', 403)
  await next()
}
app.use('/admin', guard)
app.use('/admin/leads', guard)
app.use('/admin/leads/*', guard)
app.use('/admin/export.csv', guard)

/* ------------------------------------------------------------------ CRM */

app.get('/admin', async (c) => {
  noStore(c)
  const env = c.env
  const now = Date.now()
  const [counts, latest, created30, situation, woher, quelle, ...perStatus] = await Promise.all([
    statusCounts(env),
    listLeads(env, { limit: 8 }),
    createdSince(env, now - 30 * 86400_000),
    countBy(env, 'situation'),
    countBy(env, 'woher'),
    countBy(env, 'quelle'),
    ...STATUS.map((s) => listLeads(env, { status: s.value, limit: 5 })),
  ])
  const byStatus: Record<string, Lead[]> = {}
  STATUS.forEach((s, i) => (byStatus[s.value] = perStatus[i]))
  const week = created30.filter((t) => t > now - 7 * 86400_000).length
  const flash = c.req.query('geloescht') ? 'Der Lead wurde endgültig gelöscht.' : ''
  return c.html(overviewPage({ counts, latest, byStatus, created30, week, situation, woher, quelle }, flash))
})

app.get('/admin/leads', async (c) => {
  noStore(c)
  const st = c.req.query('status')
  const status: Status | undefined = isStatus(st) ? st : undefined
  const q = (c.req.query('q') ?? '').slice(0, 80)
  const [counts, leads] = await Promise.all([statusCounts(c.env), listLeads(c.env, { status, q })])
  // Genau ein Treffer bei der Suche nach einer Nummer: direkt öffnen.
  if (q && /^\d{6}$/.test(q) && leads.length === 1 && leads[0].nr === q) return c.redirect(`/admin/leads/${q}`)
  return c.html(leadsPage(leads, counts, { status, q }))
})

app.get('/admin/leads/:nr', async (c) => {
  noStore(c)
  const lead = await leadByNr(c.env, c.req.param('nr'))
  if (!lead) return c.redirect('/admin/leads')
  const [events, counts] = await Promise.all([eventsOf(c.env, lead.id), statusCounts(c.env)])
  const flash = { status: 'Status gespeichert.', notiz: 'Notiz gespeichert.' }[c.req.query('ok') ?? ''] ?? ''
  return c.html(leadPage(lead, events, counts, flash))
})

app.post('/admin/leads/:nr/status', async (c) => {
  const lead = await leadByNr(c.env, c.req.param('nr'))
  if (!lead) return c.redirect('/admin/leads', 303)
  const form = await c.req.parseBody()
  const next = form.status
  if (isStatus(next) && next !== lead.status) {
    await setStatus(c.env, lead, next, `${statusLabel(lead.status)} → ${statusLabel(next)}`)
  }
  return c.redirect(`/admin/leads/${lead.nr}?ok=status`, 303)
})

app.post('/admin/leads/:nr/notiz', async (c) => {
  const lead = await leadByNr(c.env, c.req.param('nr'))
  if (!lead) return c.redirect('/admin/leads', 303)
  const form = await c.req.parseBody()
  const text = typeof form.text === 'string' ? form.text.replace(/\r\n/g, '\n').trim().slice(0, 4000) : ''
  if (text) await addNote(c.env, lead, text)
  return c.redirect(`/admin/leads/${lead.nr}?ok=notiz`, 303)
})

app.post('/admin/leads/:nr/loeschen', async (c) => {
  const lead = await leadByNr(c.env, c.req.param('nr'))
  if (lead) {
    await deleteLead(c.env, lead)
    console.log(JSON.stringify({ event: 'lead.deleted', nr: lead.nr }))
  }
  return c.redirect('/admin?geloescht=1', 303)
})

app.get('/admin/export.csv', async (c) => {
  noStore(c)
  const leads = await listLeads(c.env, { limit: 5000 })
  const day = new Date().toISOString().slice(0, 10)
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="leads-marina-betke-${day}.csv"`)
  return c.body(leadsCsv(leads))
})

/* ----------------------------------------------------------- Unbekannt

   Wie auf marinabetke.de: Seiten, die es nicht gibt, führen zur Startseite.
   Dateien unter /assets/ und die API antworten ehrlich mit 404. */
app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/assets/') || path.startsWith('/api/') || path.startsWith('/admin')) return c.text('Nicht gefunden', 404)
  return c.redirect('/', 301)
})

app.onError((err, c) => {
  console.error(JSON.stringify({ event: 'error', path: new URL(c.req.url).pathname, message: String(err) }))
  if (new URL(c.req.url).pathname.startsWith('/api/')) return c.json({ ok: false, error: 'server' }, 500)
  return c.text('Da ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.', 500)
})

export default app
