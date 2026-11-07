import { Hono } from 'hono'
import { upsellCampaigns } from '../lib/upsell'
import { agencyPricesPage } from '../views/gold-dashboard'
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import { getDb, nowSec, uid, schema } from '../lib/db'
import { consumeRateLimit, requireRole } from '../lib/auth'
import { audit } from '../lib/audit'
import {
  agencyLeadForUser,
  agencyPackageLabel,
  agencyPlatformLabel,
  decideBooking,
  parseNewCampaign,
  pricePerThousandCents,
  budgetRuleError,
  agencyUnlocked,
  bookingsOfAgency,
  claimCooperationCode,
  normalizeCooperationCode,
  openCooperationCode,
  parseBriefing,
  projectBriefing,
  viewsShort,
  type Briefing,
} from '../lib/agency'
import {
  addProjectLink,
  addToTeam,
  CLIPPER_AVAILABILITY,
  CLIPPER_EXPERIENCE,
  adOpennessLabel,
  createProject,
  customerForUser,
  followersLabel,
  notifyMaterialAdded,
  projectOfCustomer,
  teamsByProject,
  views30dLabel,
} from '../lib/domain'
import { mailAgencyBriefingAdmin, mailAgencyCampaignAdmin, mailClipperBookingAdmin, mailCreatorBookingAdmin } from '../lib/mail'
import { totalsForDeliverables, totalsForProjects } from '../lib/metrics'
import { presignGet, r2Ready } from '../lib/r2'
import { campaignThumbs } from '../lib/thumbs'
import { isShowcaseId, showcaseCampaign, showcaseCampaigns, showcaseClipUrl } from '../lib/showcase'
import { formatEuro } from '../views/layout'
import {
  AGENCY_CAMPAIGN_AREA,
  bookingsPage,
  briefingPage,
  campaignPage,
  campaignsPage,
  clippersPage,
  creatorsPage,
  lockedPage,
  newCampaignPage,
  noLeadPage,
  overviewPage,
  waitingPage,
  type AgencyCampaign,
  type AgencyClip,
  type AgencyClipper,
  type AgencyCreator,
} from '../views/collaboration'
import { numbersOr, renderCustomerFolder, renderCustomerProject, renderCustomerProjects } from './app'
import {
  DEMO_EXAMPLE,
  DEMO_TOTALS,
  demoCampaign,
  demoCampaigns,
  demoClippers,
  demoClips,
  demoCreators,
  demoTeam,
} from '../lib/demo'
import type { AgencyLead, Customer } from '../db/schema'
import type { AppEnv, Env } from '../lib/types'

/*
 * Collaboration-Bereich der Agenturen (/collaboration) und seine API
 * (/api/collaboration). Wer hier was sieht, steht in lib/agency.ts; die
 * Seiten in views/collaboration.ts.
 *
 * Jede Seite außer der Übersicht verlangt einen freigeschalteten Zugang.
 * Gesperrt steht dort statt des Inhalts eine Seite mit Schloss — dieselbe
 * Adresse, damit ein Lesezeichen nach der Freischaltung einfach funktioniert.
 *
 * Die eigenen Kampagnen (/meine, /ordner) sind die Seiten des Kundenbereichs
 * mit AGENCY_CAMPAIGN_AREA; deren Knöpfe sprechen mit /api/app, das für
 * Agenturen dieselbe Sperre prüft.
 */
export const collaborationRoutes = new Hono<AppEnv>()
collaborationRoutes.use('*', requireRole('agency'))

export const collaborationApi = new Hono<AppEnv>()
collaborationApi.use('*', requireRole('agency'))

/* --------------------------------------------------------------- Daten */

/**
 * Alle Kampagnen — mit Clips, Views, Teamgröße und Thumbnail; die eigenen
 * markiert. Kampagnen ANDERER Agenturen bleiben draußen: sonst sähe eine
 * Agentur, welche Konkurrenten mit NIKKI MEDIA arbeiten — genau das, was
 * die Trennung in kalt und warm verhindern soll. Ebenso die Kampagnen der
 * Demo-Konten (`users.demo`).
 *
 * `onlyOwn`: nur die eigenen — so sieht es die Demo-Agentur, deren übriges
 * Netzwerk erfunden ist (lib/demo.ts).
 */
async function allCampaigns(
  env: Env,
  ownCustomerId: string | null,
  opts: { onlyOwn?: boolean } = {},
): Promise<AgencyCampaign[]> {
  if (opts.onlyOwn && !ownCustomerId) return []
  const db = getDb(env)
  const others = and(ne(schema.users.role, 'agency'), eq(schema.users.demo, 0))
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status, customerId: schema.projects.customerId })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(
      opts.onlyOwn
        ? eq(schema.projects.customerId, ownCustomerId!)
        : ownCustomerId
          ? or(others, eq(schema.projects.customerId, ownCustomerId))
          : others,
    )
    .orderBy(sql`${schema.projects.status} = 'beendet'`, desc(schema.projects.createdAt))
  if (!projects.length) return []
  const ids = projects.map((p) => p.id)
  const ownIds = projects.filter((p) => p.customerId === ownCustomerId).map((p) => p.id)
  const otherIds = ids.filter((id) => !ownIds.includes(id))

  const [clipRows, teams, totals, ownThumbs, otherThumbs] = await Promise.all([
    db
      .select({ projectId: schema.deliverables.projectId, n: sql<number>`COUNT(*)` })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.uploadStatus, 'complete'))
      .groupBy(schema.deliverables.projectId),
    teamsByProject(env, ids),
    numbersOr(totalsForProjects(env, ids), new Map()),
    // Eigene Kampagnen mit dem vollen Thumbnail, fremde ohne Rohmaterial.
    campaignThumbs(env, ownIds).catch(() => new Map()),
    campaignThumbs(env, otherIds, { full: false }).catch(() => new Map()),
  ])
  const clips = new Map(clipRows.map((r) => [r.projectId, Number(r.n)]))

  return projects.map((p) => {
    const team = teams.get(p.id) ?? []
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      own: p.customerId === ownCustomerId,
      thumb: ownThumbs.get(p.id) ?? otherThumbs.get(p.id),
      clips: clips.get(p.id) ?? 0,
      views: totals.get(p.id)?.views ?? 0,
      clippers: team.filter((m) => m.role === 'clipper').length,
      creators: team.filter((m) => m.role === 'creator').length,
    }
  })
}

/**
 * Alle Creator — ohne E-Mail und Telefon. `pendingFor` markiert offene
 * Buchungen dieser Agentur. `demoAccounts`: statt der echten nur die
 * Demo-Konten (für die Demo-Agentur); echte Agenturen sehen sie nie.
 */
async function allCreators(env: Env, pendingFor: string, demoAccounts = false): Promise<AgencyCreator[]> {
  const db = getDb(env)
  const [rows, distRows, pending] = await Promise.all([
    db
      .select({ c: schema.creators, name: schema.users.fullName })
      .from(schema.creators)
      .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
      .where(eq(schema.users.demo, demoAccounts ? 1 : 0))
      .orderBy(desc(schema.creators.createdAt)),
    db
      .select({ creatorId: schema.campaignCreators.creatorId, n: sql<number>`COUNT(*)` })
      .from(schema.campaignCreators)
      .groupBy(schema.campaignCreators.creatorId),
    db
      .select({ creatorId: schema.creatorBookings.creatorId })
      .from(schema.creatorBookings)
      .where(and(eq(schema.creatorBookings.agencyUserId, pendingFor), eq(schema.creatorBookings.status, 'angefragt'))),
  ])
  const dist = new Map(distRows.map((r) => [r.creatorId, Number(r.n)]))
  const open = new Set(pending.map((r) => r.creatorId))
  const parse = <T,>(raw: string, fallback: T): T => {
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }
  return rows.map(({ c, name }) => ({
    id: c.id,
    name,
    niche: c.niche,
    platforms: parse<string[]>(c.platforms, []),
    handles: parse<Record<string, string>>(c.handles, {}),
    followers: followersLabel(c.followers),
    views30d: views30dLabel(c.views30d),
    openToAds: adOpennessLabel(c.openToAds),
    campaigns: dist.get(c.id) ?? 0,
    pending: open.has(c.id),
    demo: demoAccounts,
  }))
}

/**
 * Alle Clipper (ohne Creator) — Name, Plattformen, Erfahrung; keine Kontaktdaten.
 * `pendingFor` markiert offene Buchungen dieser Agentur, `demoAccounts` wie bei den Creatorn.
 */
async function allClippers(env: Env, pendingFor: string, demoAccounts = false): Promise<AgencyClipper[]> {
  const db = getDb(env)
  const [rows, apps, work, clips, pending] = await Promise.all([
    db
      .select({ id: schema.clippers.id, name: schema.clippers.displayName })
      .from(schema.clippers)
      .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
      .where(and(eq(schema.users.role, 'clipper'), eq(schema.users.demo, demoAccounts ? 1 : 0)))
      .orderBy(desc(schema.clippers.createdAt)),
    db.select().from(schema.clipperApplications).orderBy(desc(schema.clipperApplications.createdAt)),
    db
      .select({ clipperId: schema.projectWorkers.clipperId, n: sql<number>`COUNT(*)` })
      .from(schema.projectWorkers)
      .groupBy(schema.projectWorkers.clipperId),
    db
      .select({ clipperId: schema.deliverables.clipperId, n: sql<number>`COUNT(*)` })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.uploadStatus, 'complete'))
      .groupBy(schema.deliverables.clipperId),
    db
      .select({ clipperId: schema.clipperBookings.clipperId })
      .from(schema.clipperBookings)
      .where(and(eq(schema.clipperBookings.agencyUserId, pendingFor), eq(schema.clipperBookings.status, 'angefragt'))),
  ])
  const open = new Set(pending.map((r) => r.clipperId))
  const latest = new Map<string, (typeof apps)[number]>()
  for (const a of apps) if (!latest.has(a.clipperId)) latest.set(a.clipperId, a)
  const workCount = new Map(work.map((r) => [r.clipperId, Number(r.n)]))
  const clipCount = new Map(clips.map((r) => [r.clipperId ?? '', Number(r.n)]))
  return rows.map((r) => {
    const app = latest.get(r.id)
    let platforms: string[] = []
    try {
      platforms = app ? JSON.parse(app.platforms) : []
    } catch {
      platforms = []
    }
    return {
      id: r.id,
      name: r.name,
      platforms,
      // Deutsch wie der ganze Bereich — `experienceLabel` liefert die englischen Texte des Admins.
      experience: app ? (CLIPPER_EXPERIENCE.find((o) => o.value === app.experience)?.labelDe ?? app.experience) : null,
      availability: app ? (CLIPPER_AVAILABILITY.find((o) => o.value === app.availability)?.labelDe ?? app.availability) : null,
      campaigns: workCount.get(r.id) ?? 0,
      clips: clipCount.get(r.id) ?? 0,
      pending: open.has(r.id),
      // Den Demo-Clipper holt die Demo-Agentur direkt ins Team (POST /assign-clipper).
      assignable: demoAccounts,
    }
  })
}

/**
 * Was die Demo-Agentur sieht: vorn das Echte (eigene Kampagnen, Demo-Creator,
 * Demo-Clipper), dahinter das erfundene Netzwerk, zusammen genau DEMO_TOTALS.
 */
async function demoNetwork(env: Env, ctx: AgencyCtx, userId: string) {
  const [own, creators, clippers] = await Promise.all([
    allCampaigns(env, ctx.customer?.id ?? null, { onlyOwn: true }),
    allCreators(env, userId, true),
    allClippers(env, userId, true),
  ])
  // Die Use Cases von der Startseite stehen direkt hinter den eigenen (lib/showcase.ts).
  const showcase = showcaseCampaigns()
  return {
    own,
    campaigns: [...own, ...showcase, ...demoCampaigns(DEMO_TOTALS.campaigns - own.length - showcase.length)],
    creators: [...creators, ...demoCreators().slice(0, Math.max(0, DEMO_TOTALS.creators - creators.length))],
    clippers: [...clippers, ...demoClippers().slice(0, Math.max(0, DEMO_TOTALS.clippers - clippers.length))],
  }
}

/** Offene Buchungsanfragen einer Agentur (Creator und Clipper). */
async function pendingBookings(env: Env, userId: string): Promise<number> {
  const db = getDb(env)
  const [[creators], [clippers]] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.creatorBookings)
      .where(and(eq(schema.creatorBookings.agencyUserId, userId), eq(schema.creatorBookings.status, 'angefragt'))),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.clipperBookings)
      .where(and(eq(schema.clipperBookings.agencyUserId, userId), eq(schema.clipperBookings.status, 'angefragt'))),
  ])
  return Number(creators?.n ?? 0) + Number(clippers?.n ?? 0)
}

/** Eigene Kampagnen einer Agentur (für die Wahl beim Buchen), neueste zuerst. */
async function ownCampaignsOf(env: Env, ctx: AgencyCtx): Promise<{ id: string; name: string }[]> {
  if (!ctx.customer) return []
  return getDb(env)
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.customerId, ctx.customer.id))
    .orderBy(desc(schema.projects.createdAt))
}

/* ------------------------------------------------------------- Zugang */

interface AgencyCtx {
  lead: AgencyLead
  customer: Customer | null
}

async function ctxOf(c: any): Promise<AgencyCtx | null> {
  const userId: string = c.get('user').id
  const [lead, customer] = await Promise.all([agencyLeadForUser(c.env, userId), customerForUser(c.env, userId)])
  return lead ? { lead, customer } : null
}

/**
 * Lädt den Zugang und lässt nur freigeschaltete Agenturen durch. Alle anderen
 * sehen an derselben Adresse die Seite mit dem Schloss.
 */
async function unlocked(c: any, title: string, active: string): Promise<AgencyCtx | Response> {
  const ctx = await ctxOf(c)
  if (!ctx) return c.html(noLeadPage(c.get('user')))
  if (!agencyUnlocked(ctx.lead)) return c.html(lockedPage({ user: c.get('user'), lead: ctx.lead, title, active }))
  return ctx
}

const isResponse = (x: unknown): x is Response => x instanceof Response

/** `?seite=3` — Listen mit vielen Einträgen sind geblättert. */
const pageOf = (c: any): number => Math.max(1, Math.floor(Number(c.req.query('seite')) || 1))

/* --------------------------------------------------------------- Seiten */

collaborationRoutes.get('/', async (c) => {
  const user = c.get('user')
  const ctx = await ctxOf(c)
  if (!ctx) return c.html(noLeadPage(user))
  if (!ctx.lead.briefedAt) return c.html(briefingPage({ user, lead: ctx.lead }))
  if (!agencyUnlocked(ctx.lead)) return c.html(waitingPage({ user, lead: ctx.lead }))

  if (ctx.lead.demo) {
    const [net, pending] = await Promise.all([demoNetwork(c.env, ctx, user.id), pendingBookings(c.env, user.id)])
    return c.html(
      overviewPage({
        user,
        lead: ctx.lead,
        campaigns: net.campaigns,
        creators: net.creators,
        clipperCount: DEMO_TOTALS.clippers,
        ownCount: net.own.length,
        pendingBookings: pending,
        totals: { clips: DEMO_TOTALS.clips, views: DEMO_TOTALS.views },
        justUnlocked: false,
      }),
    )
  }

  const [campaigns, creators, clippers, pending] = await Promise.all([
    allCampaigns(c.env, ctx.customer?.id ?? null),
    allCreators(c.env, user.id),
    allClippers(c.env, user.id),
    pendingBookings(c.env, user.id),
  ])
  return c.html(
    overviewPage({
      user,
      lead: ctx.lead,
      campaigns,
      creators,
      clipperCount: clippers.length,
      ownCount: campaigns.filter((x) => x.own).length,
      pendingBookings: pending,
      totals: {
        clips: campaigns.reduce((s, x) => s + x.clips, 0),
        views: campaigns.reduce((s, x) => s + x.views, 0),
      },
      justUnlocked: c.req.query('freigeschaltet') === '1',
    }),
  )
})

/** Marge der Agentur auf unsere Preise (lib/upsell.ts) — nur freigeschaltet, wie alle Bereiche außer der Übersicht. */
collaborationRoutes.get('/preise', async (c) => {
  const ctx = await unlocked(c, 'Preise & Marge', '/collaboration/preise')
  if (isResponse(ctx)) return ctx
  const user = c.get('user')
  const { marginPct, campaigns } = await upsellCampaigns(c.env, user)
  return c.html(agencyPricesPage({ user, marginPct, campaigns }))
})

collaborationRoutes.get('/kampagnen', async (c) => {
  const ctx = await unlocked(c, 'Kampagnen', '/collaboration/kampagnen')
  if (isResponse(ctx)) return ctx
  const campaigns = ctx.lead.demo
    ? (await demoNetwork(c.env, ctx, c.get('user').id)).campaigns
    : await allCampaigns(c.env, ctx.customer?.id ?? null)
  return c.html(
    campaignsPage({
      user: c.get('user'),
      campaigns,
      filter: c.req.query('filter') === 'eigene' ? 'eigene' : 'alle',
      page: pageOf(c),
    }),
  )
})

collaborationRoutes.get('/kampagne/:id', async (c) => {
  const ctx = await unlocked(c, 'Kampagnen', '/collaboration/kampagnen')
  if (isResponse(ctx)) return ctx
  const id = c.req.param('id')

  // Use Case von der Startseite (nur für die Demo-Agentur, lib/showcase.ts).
  const useCase = ctx.lead.demo && isShowcaseId(id) ? showcaseCampaign(id) : null
  if (useCase) {
    return c.html(
      campaignPage({
        user: c.get('user'),
        campaign: useCase.campaign,
        briefing: null,
        team: [],
        clips: useCase.clips,
        manageHref: null,
      }),
    )
  }

  // Erfundene Kampagne aus dem Demo-Netzwerk (nur für die Demo-Agentur).
  const demo = ctx.lead.demo ? demoCampaign(id) : null
  if (demo) {
    const clips = demoClips(demo)
    return c.html(
      campaignPage({
        user: c.get('user'),
        campaign: demo,
        briefing: null,
        team: demoTeam(demo),
        clips,
        moreClips: demo.clips - clips.length,
        manageHref: null,
      }),
    )
  }

  const db = getDb(c.env)
  const [row] = await db
    .select({ project: schema.projects, ownerRole: schema.users.role, ownerDemo: schema.users.demo })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(eq(schema.projects.id, id))
    .limit(1)
  const project = row?.project
  const own = Boolean(project && project.customerId === ctx.customer?.id)
  // Kampagnen anderer Agenturen gibt es hier nicht (siehe `allCampaigns`), die
  // der Demo-Konten ebenso wenig. Die Demo-Agentur sieht nur ihre eigenen.
  if (!project || (row.ownerRole === 'agency' && !own) || (!own && (ctx.lead.demo || row.ownerDemo))) return c.notFound()

  const clipRows = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.projectId, id), eq(schema.deliverables.uploadStatus, 'complete')))
    .orderBy(desc(schema.deliverables.createdAt))
    .limit(120)

  const ready = r2Ready(c.env)
  const [teams, totals, clipTotals, thumbs, posters] = await Promise.all([
    teamsByProject(c.env, [id]),
    numbersOr(totalsForProjects(c.env, [id]), new Map()),
    numbersOr(totalsForDeliverables(c.env, clipRows.map((d) => d.id)), new Map()),
    campaignThumbs(c.env, [id], { full: own }).catch(() => new Map()),
    // Titelbild je Clip: das kleine Vorschaubild — nur ohne eins der Clip selbst.
    Promise.all(
      clipRows.map(async (d) => {
        if (!ready) return { poster: '', preview: '' }
        if (d.thumbnailKey) return { poster: await presignGet(c.env, d.thumbnailKey), preview: '' }
        return { poster: '', preview: await presignGet(c.env, d.r2Key) }
      }),
    ),
  ])
  const team = teams.get(id) ?? []
  const clips: AgencyClip[] = clipRows.map((d, i) => ({
    id: d.id,
    filename: d.filename,
    caption: d.caption,
    createdAt: d.createdAt,
    posterUrl: posters[i].poster,
    previewUrl: posters[i].preview,
    views: clipTotals.get(d.id)?.views ?? 0,
  }))

  return c.html(
    campaignPage({
      user: c.get('user'),
      campaign: {
        id,
        name: project.name,
        status: project.status,
        own,
        thumb: thumbs.get(id),
        clips: clips.length,
        views: totals.get(id)?.views ?? 0,
        clippers: team.filter((m) => m.role === 'clipper').length,
        creators: team.filter((m) => m.role === 'creator').length,
      },
      // Das Briefing nur bei eigenen Kampagnen — fremde Budgets gehen niemanden etwas an.
      briefing: own ? projectBriefing(project) : null,
      team: team.map((m) => ({ name: m.name, role: m.role })),
      clips,
      manageHref: own ? AGENCY_CAMPAIGN_AREA.projectHref(id) : null,
    }),
  )
})

collaborationRoutes.get('/creator', async (c) => {
  const ctx = await unlocked(c, 'Creator', '/collaboration/creator')
  if (isResponse(ctx)) return ctx
  if (ctx.lead.demo) {
    const net = await demoNetwork(c.env, ctx, c.get('user').id)
    return c.html(
      creatorsPage({
        user: c.get('user'),
        creators: net.creators,
        ownCampaigns: net.own.map((x) => ({ id: x.id, name: x.name })),
        selected: c.req.query('kampagne') ?? null,
        page: pageOf(c),
      }),
    )
  }
  const [creators, own] = await Promise.all([allCreators(c.env, c.get('user').id), ownCampaignsOf(c.env, ctx)])
  return c.html(
    creatorsPage({ user: c.get('user'), creators, ownCampaigns: own, selected: c.req.query('kampagne') ?? null, page: pageOf(c) }),
  )
})

collaborationRoutes.get('/clipper', async (c) => {
  const ctx = await unlocked(c, 'Clipper', '/collaboration/clipper')
  if (isResponse(ctx)) return ctx
  if (ctx.lead.demo) {
    const net = await demoNetwork(c.env, ctx, c.get('user').id)
    return c.html(
      clippersPage({
        user: c.get('user'),
        clippers: net.clippers,
        ownCampaigns: net.own.map((x) => ({ id: x.id, name: x.name })),
        selected: c.req.query('kampagne') ?? null,
        page: pageOf(c),
      }),
    )
  }
  const [clippers, own] = await Promise.all([allClippers(c.env, c.get('user').id), ownCampaignsOf(c.env, ctx)])
  return c.html(
    clippersPage({ user: c.get('user'), clippers, ownCampaigns: own, selected: c.req.query('kampagne') ?? null, page: pageOf(c) }),
  )
})

collaborationRoutes.get('/buchungen', async (c) => {
  const ctx = await unlocked(c, 'Buchungen', '/collaboration/buchungen')
  if (isResponse(ctx)) return ctx
  const rows = await bookingsOfAgency(c.env, c.get('user').id)
  const neu = c.req.query('neu')
  return c.html(
    bookingsPage({
      user: c.get('user'),
      justBooked: neu === 'bestaetigt' ? 'confirmed' : neu === '1' ? 'requested' : null,
      bookedKind: c.req.query('art') === 'clipper' ? 'clipper' : 'creator',
      bookings: rows,
    }),
  )
})

/* ------------------------------------------------- Eigene Kampagnen */

collaborationRoutes.get('/meine', async (c) => {
  const ctx = await unlocked(c, 'Meine Kampagnen', '/collaboration/meine')
  if (isResponse(ctx)) return ctx
  if (!ctx.customer) return c.html(noLeadPage(c.get('user')))
  return renderCustomerProjects(c, AGENCY_CAMPAIGN_AREA, ctx.customer)
})

/** Neue Kampagne — erst das Briefing, dann entsteht sie (siehe POST /api/collaboration/campaigns). */
collaborationRoutes.get('/neu', async (c) => {
  const ctx = await unlocked(c, 'Meine Kampagnen', '/collaboration/meine')
  if (isResponse(ctx)) return ctx
  if (!ctx.customer) return c.html(noLeadPage(c.get('user')))
  return c.html(newCampaignPage({ user: c.get('user') }))
})

collaborationRoutes.get('/meine/:id', async (c) => {
  const ctx = await unlocked(c, 'Meine Kampagnen', '/collaboration/meine')
  if (isResponse(ctx)) return ctx
  if (!ctx.customer) return c.html(noLeadPage(c.get('user')))
  return renderCustomerProject(c, AGENCY_CAMPAIGN_AREA, ctx.customer, c.req.param('id'))
})

collaborationRoutes.get('/ordner/:id', async (c) => {
  const ctx = await unlocked(c, 'Meine Kampagnen', '/collaboration/meine')
  if (isResponse(ctx)) return ctx
  if (!ctx.customer) return c.html(noLeadPage(c.get('user')))
  return renderCustomerFolder(c, AGENCY_CAMPAIGN_AREA, ctx.customer, c.req.param('id'))
})

/* ================================================================== API */

const str = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)

/** Legt eine Kampagne der Agentur an, mit dem Briefing als Angaben daran. */
async function createBriefedCampaign(env: Env, customerId: string, name: string, b: Briefing) {
  const project = await createProject(env, { customerId, name, folderName: 'Rohmaterial' })
  await getDb(env)
    .update(schema.projects)
    .set({
      briefingViews: b.views,
      briefingBudgetCents: b.budgetCents,
      briefingPackage: b.pkg,
      briefingNiche: b.niche,
      briefingPlatforms: b.platforms.length ? JSON.stringify(b.platforms) : null,
    })
    .where(eq(schema.projects.id, project.id))
  return project
}

const leadPlatforms = (lead: AgencyLead): string[] => {
  try {
    return JSON.parse(lead.platforms || '[]')
  } catch {
    return []
  }
}

/**
 * „Kampagne starten“ — das Briefing nach dem Login.
 *
 * Legt die erste eigene Kampagne an (mit dem Link aus dem Formular, falls
 * es einen gab) und schaltet einen WARMEN Lead sofort frei. Ein kalter
 * bleibt gesperrt; er sieht „NIKKI MEDIA meldet sich bei dir.“ Der
 * Administrator bekommt in beiden Fällen eine Mail.
 */
collaborationApi.post('/briefing', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!lead) return c.json({ error: 'Kein Zugang hinterlegt.' }, 400)
  if (lead.briefedAt) return c.json({ ok: true, redirect: '/collaboration' })

  const parsed = parseBriefing(await c.req.json().catch(() => ({})))
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  // Nische und Plattformen kennt das Briefing schon aus dem Eintrag auf /brands.
  const brief: Briefing = { ...parsed, niche: lead.niche, platforms: leadPlatforms(lead) }
  // Unsere Preise je Bereich (lib/agency.ts): ein Budget darunter oder darüber wird nicht angenommen.
  const rule = budgetRuleError(lead.niche, parsed.views, parsed.budgetCents)
  if (rule) return c.json({ error: rule }, 400)
  const { views, budgetCents } = brief
  const pkg = parsed.pkg

  const db = getDb(c.env)
  const ts = nowSec()

  // Die erste eigene Kampagne — sie trägt den Link aus dem Formular und ist
  // der Ort, an dem nach der Freischaltung das Material landet.
  const customer = await customerForUser(c.env, user.id)
  let projectId: string | null = null
  if (customer) {
    const project = await createBriefedCampaign(
      c.env,
      customer.id,
      lead.company ? `${lead.company} · ${agencyPackageLabel(pkg)}` : agencyPackageLabel(pkg),
      brief,
    )
    projectId = project.id
    if (lead.footageLink) await addProjectLink(c.env, { projectId, url: lead.footageLink, addedBy: user.id })
  }

  const unlock = Boolean(lead.warm) || Boolean(lead.accessAt)
  // `briefed_at IS NULL` in der Bedingung: ein Doppelklick legt keine zweite Kampagne an.
  const updated = await db
    .update(schema.agencyLeads)
    .set({
      viewsTarget: views,
      budgetCents,
      package: pkg,
      briefedAt: ts,
      projectId,
      accessAt: lead.accessAt ?? (lead.warm ? ts : null),
    })
    .where(and(eq(schema.agencyLeads.id, lead.id), sql`${schema.agencyLeads.briefedAt} IS NULL`))
    .returning({ id: schema.agencyLeads.id })
  if (!updated.length) {
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
    return c.json({ ok: true, redirect: '/collaboration' })
  }

  await audit(c.env, {
    actorId: user.id,
    action: 'agency.briefed',
    entity: 'agency',
    entityId: lead.id,
    payload: { views, budgetCents, package: pkg, warm: Boolean(lead.warm), unlocked: unlock },
  })

  c.executionCtx.waitUntil(
    Promise.all([
      mailAgencyBriefingAdmin(c.env, {
        leadId: lead.id,
        warm: Boolean(lead.warm),
        unlocked: unlock,
        fullName: user.fullName,
        company: lead.company,
        email: user.email,
        phone: user.phone,
        views: `${viewsShort(views)} Views`,
        budget: formatEuro(budgetCents),
        pkg: agencyPackageLabel(pkg),
      }),
      projectId && lead.footageLink ? notifyMaterialAdded(c.env, projectId) : Promise.resolve(),
    ]),
  )

  // ?angelegt=1: Glückwunsch-Popup (shell()) — die erste Kampagne ist angelegt.
  return c.json({ ok: true, unlocked: unlock, redirect: unlock ? '/collaboration?freigeschaltet=1&angelegt=1' : '/collaboration?angelegt=1' })
})

/**
 * Jede weitere Kampagne: Name, Bereich, Plattformen, Views, Budget und die
 * Bestätigung, dass der Auftrag verbindlich ist (Vorgabe des Auftraggebers).
 * Ein bloßes Namensfeld gibt es für Agenturen nicht (`/api/app/projects`
 * weist sie ab). Die Angaben hängen an der Kampagne, der Administrator
 * bekommt eine Mail (außer bei der Demo-Agentur).
 */
collaborationApi.post('/campaigns', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!lead || !agencyUnlocked(lead)) return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Arbeitsbereich hinterlegt.' }, 400)

  const brief = parseNewCampaign(await c.req.json().catch(() => ({})))
  if ('error' in brief) return c.json({ error: brief.error }, 400)
  const { name } = brief
  if (!(await consumeRateLimit(c.env, `agencycampaign:${user.id}`, 30, 3600))) {
    return c.json({ error: 'Zu viele neue Kampagnen in kurzer Zeit. Bitte versuche es später erneut.' }, 429)
  }

  const project = await createBriefedCampaign(c.env, customer.id, name, brief)
  await audit(c.env, {
    actorId: user.id,
    action: 'agency.campaign_started',
    entity: 'project',
    entityId: project.id,
    payload: {
      views: brief.views,
      budgetCents: brief.budgetCents,
      niche: brief.niche,
      platforms: brief.platforms,
      binding: true,
    },
  })

  if (!lead.demo) {
    c.executionCtx.waitUntil(
      mailAgencyCampaignAdmin(c.env, {
        leadId: lead.id,
        projectId: project.id,
        campaign: name,
        fullName: user.fullName,
        company: lead.company,
        email: user.email,
        phone: user.phone,
        niche: brief.niche ?? '–',
        platforms: brief.platforms.map(agencyPlatformLabel).join(', '),
        views: `${viewsShort(brief.views)} Views`,
        budget: formatEuro(brief.budgetCents),
        perThousand: formatEuro(pricePerThousandCents(brief)),
      }),
    )
  }

  return c.json({ ok: true, id: project.id, redirect: `${AGENCY_CAMPAIGN_AREA.projectHref(project.id)}?angelegt=1` })
})

/**
 * Cooperation-Code nachträglich einlösen — der kalte Lead hat ihn im
 * Erstgespräch bekommen. Macht ihn warm; hat er das Briefing schon
 * abgeschickt, ist er damit sofort freigeschaltet.
 */
collaborationApi.post('/code', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!lead) return c.json({ error: 'Kein Zugang hinterlegt.' }, 400)
  if (lead.warm && agencyUnlocked(lead)) return c.json({ ok: true, redirect: '/collaboration' })

  if (!(await consumeRateLimit(c.env, `coopredeem:${user.id}`, 10, 3600))) {
    return c.json({ error: 'Zu viele Versuche. Bitte versuche es später erneut.' }, 429)
  }
  const body = await c.req.json().catch(() => ({}))
  const code = normalizeCooperationCode(body.code)
  const BAD = 'Dieser Cooperation-Code ist ungültig oder wurde bereits verwendet.'
  if (!(await openCooperationCode(c.env, code))) return c.json({ error: BAD }, 400)
  const codeId = await claimCooperationCode(c.env, code, user.id)
  if (!codeId) return c.json({ error: BAD }, 400)

  const ts = nowSec()
  await getDb(c.env)
    .update(schema.agencyLeads)
    .set({ warm: 1, codeId, accessAt: lead.briefedAt ? (lead.accessAt ?? ts) : lead.accessAt })
    .where(eq(schema.agencyLeads.id, lead.id))

  await audit(c.env, { actorId: user.id, action: 'agency.code_redeemed', entity: 'agency', entityId: lead.id, payload: { code } })
  return c.json({ ok: true, redirect: lead.briefedAt ? '/collaboration?freigeschaltet=1' : '/collaboration' })
})

/** Clip ansehen oder herunterladen — jeder fertige Clip, nur mit freigeschaltetem Zugang. */
collaborationApi.get('/clips/:id/url', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!agencyUnlocked(lead)) {
    return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  }
  // Reel eines Use Case: lief direkt bei Instagram, also dorthin (lib/showcase.ts).
  const reel = lead?.demo ? showcaseClipUrl(c.req.param('id')) : null
  if (reel) return c.json({ url: reel, external: true })
  if (c.req.param('id').startsWith('demo-clip-')) {
    return c.json({ error: 'Beispiel-Clip aus dem Demo-Netzwerk: Ansehen und Herunterladen gehen hier nicht.' }, 403)
  }
  if (!r2Ready(c.env)) return c.json({ error: 'Gerade nicht verfügbar.' }, 503)
  const [hit] = await getDb(c.env)
    .select({ d: schema.deliverables, ownerId: schema.customers.userId, ownerRole: schema.users.role, ownerDemo: schema.users.demo })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(and(eq(schema.deliverables.id, c.req.param('id')), eq(schema.deliverables.uploadStatus, 'complete')))
    .limit(1)
  // Clips aus Kampagnen anderer Agenturen bleiben verborgen, wie die Kampagnen selbst; ebenso
  // die der Demo-Konten. Die Demo-Agentur sieht nur Clips ihrer eigenen Kampagnen.
  const own = hit?.ownerId === user.id
  if (!hit || (!own && (hit.ownerRole === 'agency' || hit.ownerDemo || lead?.demo))) {
    return c.json({ error: 'Clip nicht gefunden.' }, 404)
  }
  const d = hit.d
  const download = c.req.query('download') === '1'
  if (download) {
    await audit(c.env, { actorId: user.id, action: 'agency.clip_downloaded', entity: 'deliverable', entityId: d.id })
  }
  return c.json({ url: await presignGet(c.env, d.r2Key, download ? d.filename : undefined) })
})

/**
 * Creator buchen. Ins Team kommt er erst, wenn der Administrator bestätigt;
 * zugeordnet wird ausschließlich im Admin-Bereich. Gebucht werden kann nur
 * für eine EIGENE Kampagne.
 *
 * Ausnahme Demo-Agentur: Bucht sie den Demo-Creator, ist die Buchung sofort
 * bestätigt und der Creator im Team (über `decideBooking`, denselben Weg wie
 * im Admin). Erfundene Creator lassen sich nicht buchen.
 */
collaborationApi.post('/bookings', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!lead || !agencyUnlocked(lead)) return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Arbeitsbereich hinterlegt.' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const creatorId = str(body.creatorId, 60)
  const clipperId = str(body.clipperId, 60)
  const projectId = str(body.projectId, 60)
  const message = str(body.message, 1000) || null

  if (creatorId.startsWith('demo-creator-') || clipperId.startsWith('demo-clipper-')) return c.json({ error: DEMO_EXAMPLE }, 403)
  const project = await projectOfCustomer(c.env, customer.id, projectId)
  if (!project) return c.json({ error: 'Bitte wähle eine deiner Kampagnen.' }, 400)
  const db = getDb(c.env)

  /* Clipper buchen (Migration 0028): derselbe Weg, eigene Tabelle. */
  if (clipperId) {
    const [clipper] = await db
      .select({ id: schema.clippers.id, name: schema.clippers.displayName, demo: schema.users.demo })
      .from(schema.clippers)
      .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
      .where(and(eq(schema.clippers.id, clipperId), eq(schema.users.role, 'clipper')))
      .limit(1)
    // Demo-Clipper gibt es nur für die Demo-Agentur, echte Clipper nur für echte Agenturen.
    if (!clipper || Boolean(clipper.demo) !== Boolean(lead.demo)) return c.json({ error: 'Clipper nicht gefunden.' }, 404)
    const [taken] = await db
      .select({ id: schema.clipperBookings.id })
      .from(schema.clipperBookings)
      .where(
        and(
          eq(schema.clipperBookings.agencyUserId, user.id),
          eq(schema.clipperBookings.clipperId, clipperId),
          eq(schema.clipperBookings.projectId, projectId),
          inArray(schema.clipperBookings.status, ['angefragt', 'bestaetigt']),
        ),
      )
      .limit(1)
    if (taken) return c.json({ error: 'Diesen Clipper hast du für diese Kampagne schon gebucht.' }, 409)
    const [inTeam] = await db
      .select({ id: schema.projectWorkers.clipperId })
      .from(schema.projectWorkers)
      .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.projectWorkers.clipperId, clipperId)))
      .limit(1)
    if (inTeam) return c.json({ error: 'Dieser Clipper ist schon im Team dieser Kampagne.' }, 409)
    if (!(await consumeRateLimit(c.env, `booking:${user.id}`, 30, 3600))) {
      return c.json({ error: 'Zu viele Buchungen in kurzer Zeit. Bitte versuche es später erneut.' }, 429)
    }
    const id = uid()
    await db.insert(schema.clipperBookings).values({
      id,
      agencyUserId: user.id,
      clipperId,
      projectId,
      message,
      status: 'angefragt',
      createdAt: nowSec(),
    })
    await audit(c.env, { actorId: user.id, action: 'agency.clipper_booking_requested', entity: 'booking', entityId: id, payload: { clipperId, projectId } })
    if (lead.demo) {
      const decided = await decideBooking(c.env, id, true)
      if (!decided.ok) return c.json({ error: decided.error }, 400)
      return c.json({ ok: true, id, confirmed: true })
    }
    c.executionCtx.waitUntil(
      mailClipperBookingAdmin(c.env, {
        leadId: lead.id,
        agency: lead.company || user.fullName,
        email: user.email,
        clipper: clipper.name,
        campaign: project.name,
        message,
      }),
    )
    return c.json({ ok: true, id })
  }
  const [creator] = await db
    .select({ id: schema.creators.id, name: schema.users.fullName, demo: schema.users.demo })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.creators.id, creatorId))
    .limit(1)
  // Demo-Creator gibt es nur für die Demo-Agentur, echte Creator nur für echte Agenturen.
  if (!creator || Boolean(creator.demo) !== Boolean(lead.demo)) return c.json({ error: 'Creator nicht gefunden.' }, 404)

  const [open] = await db
    .select({ id: schema.creatorBookings.id })
    .from(schema.creatorBookings)
    .where(
      and(
        eq(schema.creatorBookings.agencyUserId, user.id),
        eq(schema.creatorBookings.creatorId, creatorId),
        eq(schema.creatorBookings.projectId, projectId),
        inArray(schema.creatorBookings.status, ['angefragt', 'bestaetigt']),
      ),
    )
    .limit(1)
  if (open) return c.json({ error: 'Diesen Creator hast du für diese Kampagne schon gebucht.' }, 409)
  if (!(await consumeRateLimit(c.env, `booking:${user.id}`, 30, 3600))) {
    return c.json({ error: 'Zu viele Buchungen in kurzer Zeit. Bitte versuche es später erneut.' }, 429)
  }

  const id = uid()
  await db.insert(schema.creatorBookings).values({
    id,
    agencyUserId: user.id,
    creatorId,
    projectId,
    message,
    status: 'angefragt',
    createdAt: nowSec(),
  })
  await audit(c.env, { actorId: user.id, action: 'agency.booking_requested', entity: 'booking', entityId: id, payload: { creatorId, projectId } })

  if (lead.demo) {
    const decided = await decideBooking(c.env, id, true)
    if (!decided.ok) return c.json({ error: decided.error }, 400)
    return c.json({ ok: true, id, confirmed: true })
  }

  c.executionCtx.waitUntil(
    mailCreatorBookingAdmin(c.env, {
      leadId: lead.id,
      agency: lead.company || user.fullName,
      email: user.email,
      creator: creator.name,
      campaign: project.name,
      message,
    }),
  )
  return c.json({ ok: true, id })
})

/**
 * Nur Demo-Agentur: den Demo-Clipper direkt ins Team einer eigenen Kampagne
 * holen, über `addToTeam` wie im Admin. Echte Agenturen weisen keine Clipper
 * zu, das macht ausschließlich der Administrator.
 */
collaborationApi.post('/assign-clipper', async (c) => {
  const user = c.get('user')
  const lead = await agencyLeadForUser(c.env, user.id)
  if (!lead?.demo || !agencyUnlocked(lead)) return c.json({ error: 'Clipper weist NIKKI MEDIA zu.' }, 403)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Arbeitsbereich hinterlegt.' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const clipperId = str(body.clipperId, 60)
  if (clipperId.startsWith('demo-clipper-')) return c.json({ error: DEMO_EXAMPLE }, 403)
  const project = await projectOfCustomer(c.env, customer.id, str(body.projectId, 60))
  if (!project) return c.json({ error: 'Bitte wähle eine deiner Kampagnen.' }, 400)

  const db = getDb(c.env)
  const [clipper] = await db
    .select({ userId: schema.clippers.userId, name: schema.clippers.displayName })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(and(eq(schema.clippers.id, clipperId), eq(schema.users.role, 'clipper'), eq(schema.users.demo, 1)))
    .limit(1)
  if (!clipper) return c.json({ error: 'Clipper nicht gefunden.' }, 404)

  const added = await addToTeam(c.env, project.id, clipper.userId)
  if (!added.ok) return c.json({ error: added.error }, 400)
  // Wie eine sofort bestätigte Buchung festhalten, damit sie unter „Buchungen“ steht (wie beim Demo-Creator).
  const [booked] = await db
    .select({ id: schema.clipperBookings.id })
    .from(schema.clipperBookings)
    .where(
      and(
        eq(schema.clipperBookings.agencyUserId, user.id),
        eq(schema.clipperBookings.clipperId, clipperId),
        eq(schema.clipperBookings.projectId, project.id),
        eq(schema.clipperBookings.status, 'bestaetigt'),
      ),
    )
    .limit(1)
  if (!booked) {
    const ts = nowSec()
    await db.insert(schema.clipperBookings).values({
      id: uid(),
      agencyUserId: user.id,
      clipperId,
      projectId: project.id,
      message: null,
      status: 'bestaetigt',
      createdAt: ts,
      decidedAt: ts,
    })
  }
  await audit(c.env, { actorId: user.id, action: 'agency.demo_clipper_assigned', entity: 'project', entityId: project.id, payload: { clipperId } })
  return c.json({ ok: true, redirect: `/collaboration/kampagne/${project.id}` })
})
