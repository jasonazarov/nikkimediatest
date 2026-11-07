import { customerTimeline } from '../lib/crm'
import { Hono } from 'hono'
import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm'
import { getDb, nowSec, schema } from '../lib/db'
import { PASSWORD_MIN, requireRole } from '../lib/auth'
import {
  campaignDetailPage,
  campaignsPage,
  clipperProfilePage,
  creatorProfilePage,
  creatorsPage,
  customerDetailPage,
  customersPage,
  clippersPage,
  leadDetailPage,
  leadsPage,
  overviewPage,
  passwordPage,
  type AdminCampaign,
  type AssignableCampaign,
  type CampaignFilter,
  type ClipperApplicationInfo,
  type CreatorRow,
  type CustomerRow,
  type LeadRow,
  type OwnerOption,
  type ProfileLinks,
  type ProjectMediaFolder,
  type ProjectReel,
  type TeamCandidate,
  type TeamMemberView,
  analyticsPage,
} from '../views/admin'
import { LEAD_STATUS, campaignsOfUser, linkHost, linksOf, payTierCounts, payTiersOf, teamsByProject } from '../lib/domain'
import { isVideo } from '../lib/r2'
import { campaignThumbs, cloudProvider } from '../lib/thumbs'
import {
  PUBLISH_STATUS,
  absorbConnectReturn,
  accountsForCreators,
  accountsForProjects,
  connectedAccountStats,
  zernioMonthlyCost,
} from '../lib/publisher'
import {
  emptyTotals,
  grandTotals,
  metricsPausedUntil,
  rowsForDeliverables,
  syncOverview,
  totalsForClipper,
  totalsForCreatorDistribution,
  totalsForDeliverables,
  totalsForProjects,
  type MetricTotals,
} from '../lib/metrics'
import type { AppEnv } from '../lib/types'
import { numbersOr } from './app'
import { alias } from 'drizzle-orm/sqlite-core'
import { agenciesPage, agencyDetailPage, type AgencyRow, type BookingRow, type CodeRow } from '../views/admin-agencies'
import { projectBriefing } from '../lib/agency'
import { allArticles, articleById } from '../lib/articles'
import { allUpsells, pushPopupSetting } from '../lib/upsell'
import { adminArticleEditPage, adminArticlesPage, adminUpsellsPage } from '../views/gold-dashboard'

/*
 * Administration. Jede Seite hier ist englisch (siehe views/admin.ts); die
 * Adressen bleiben deutsch, damit Lesezeichen und Mails weiter stimmen:
 * /admin/projekte sind die Kampagnen, /admin/clipper/:id und
 * /admin/creator/:id die Profile.
 *
 * Eine Kampagne hat ein TEAM aus beliebig vielen Clippern und Creatorn —
 * `project_workers` (Schnitt) und `campaign_creators` (Verbreitung). Die
 * alte Spalte `projects.claimed_by` (ein Bearbeiter je Projekt) liest diese
 * Datei nicht mehr.
 */
export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireRole('admin'))

type Env = AppEnv['Bindings']

/* -------------------------------------------------------------- Reichweite

   Summen je Clipper und je Creator für die beiden Personenlisten.

   lib/metrics.ts rechnet beides nur für EINE Person (`totalsForClipper`,
   `totalsForCreatorDistribution`) — für eine Liste wäre das eine Abfrage je
   Zeile. Hier steht stattdessen je EINE gruppierte Abfrage über alle. Ohne
   `inArray` über IDs: gebraucht werden ohnehin alle, und so stößt auch die
   hundertste Zeile nicht an die 100 gebundenen Parameter von D1.

   Gezählt wird nach denselben Regeln wie dort, damit Liste und Einzelansicht
   nie auseinanderlaufen: „Views“ sind die Views der Plattform, sonst ihre
   Impressions (`viewsOf` in lib/metrics.ts — X und LinkedIn melden Ansichten
   nur als Impressions). Ändert sich die Regel dort, muss sie hier mit.
   -------------------------------------------------------------------------- */

const pm = schema.postMetrics

/** Abgleich ohne Zahlen — was `numbersOr` zeigt, wenn die Abfrage scheitert. */
const NO_SYNC = { total: 0, ok: 0, pending: 0, failed: 0, unknown: 0, lastAt: null }

const reachColumns = {
  views: sql<number>`COALESCE(SUM(CASE WHEN ${pm.views} > 0 THEN ${pm.views} ELSE ${pm.impressions} END), 0)`.mapWith(
    Number,
  ),
  likes: sql<number>`COALESCE(SUM(${pm.likes}), 0)`.mapWith(Number),
  comments: sql<number>`COALESCE(SUM(${pm.comments}), 0)`.mapWith(Number),
  shares: sql<number>`COALESCE(SUM(${pm.shares}), 0)`.mapWith(Number),
  posts: sql<number>`COUNT(*)`.mapWith(Number),
  syncedAt: sql<number | null>`MAX(${pm.syncedAt})`.mapWith(Number),
}

const toTotals = (r: MetricTotals): MetricTotals => ({
  views: r.views,
  likes: r.likes,
  comments: r.comments,
  shares: r.shares,
  posts: r.posts,
  syncedAt: r.syncedAt ?? null,
})

/**
 * Was die Verbreitung jedes Creators erreicht hat — nur seine eigenen Posts
 * (`creator_id` = er), wie `totalsForCreatorDistribution`. Creator ohne
 * Zahlen fehlen in der Map.
 */
async function reachByCreator(env: AppEnv['Bindings']): Promise<Map<string, MetricTotals>> {
  const rows = await getDb(env)
    .select({ creatorId: pm.creatorId, ...reachColumns })
    .from(pm)
    .where(isNotNull(pm.creatorId))
    .groupBy(pm.creatorId)
  const out = new Map<string, MetricTotals>()
  for (const r of rows) if (r.creatorId) out.set(r.creatorId, toTotals(r))
  return out
}

/**
 * Was die Clips jedes Clippers erreicht haben — ALLE Posts der Clips, die er
 * geliefert hat, auch die über Creator verbreiteten (wie `totalsForClipper`:
 * die Reichweite seines Schnitts, egal über welchen Kanal).
 *
 * Schlüssel ist die Clipper-ID; `userId` kommt mit, weil ein Creator, der
 * fremde Kampagnen bearbeitet, dafür ebenfalls eine Clipper-Zeile hat — die
 * Creator-Liste findet ihn darüber. Clips eines gelöschten Clippers
 * (`clipper_id` NULL) gehören niemandem mehr und fallen heraus.
 */
async function reachByClipper(
  env: AppEnv['Bindings'],
): Promise<Map<string, MetricTotals & { userId: string }>> {
  const rows = await getDb(env)
    .select({
      clipperId: schema.deliverables.clipperId,
      userId: sql<string>`MIN(${schema.clippers.userId})`,
      ...reachColumns,
    })
    .from(pm)
    .innerJoin(schema.deliverables, eq(schema.deliverables.id, pm.deliverableId))
    .innerJoin(schema.clippers, eq(schema.clippers.id, schema.deliverables.clipperId))
    .groupBy(schema.deliverables.clipperId)
  const out = new Map<string, MetricTotals & { userId: string }>()
  for (const r of rows) if (r.clipperId) out.set(r.clipperId, { ...toTotals(r), userId: r.userId })
  return out
}

/**
 * Selbsteinträge über /clipper seit `since`.
 *
 * Gezählt wird je Clipper die ERSTE Bewerbung: Wer das Formular später ein
 * zweites Mal abschickt, ist kein neuer Zugang und zählt nicht noch einmal.
 * Übersicht und Clipper-Seite fragen beide hier — so können die zwei Zahlen
 * nie auseinanderlaufen.
 *
 * Nur Zugänge mit der Rolle `clipper`: Ein Creator hat zwar auch eine Zeile
 * in `clippers`, ist aber kein Clipper und zählt unter „Creators“.
 */
async function selfSignupsSince(env: AppEnv['Bindings'], since: number): Promise<number> {
  const db = getDb(env)
  const firstApplications = db
    .select({ clipperId: schema.clipperApplications.clipperId })
    .from(schema.clipperApplications)
    .innerJoin(schema.clippers, eq(schema.clippers.id, schema.clipperApplications.clipperId))
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(eq(schema.users.role, 'clipper'))
    .groupBy(schema.clipperApplications.clipperId)
    .having(sql`MIN(${schema.clipperApplications.createdAt}) >= ${since}`)
    .as('first_applications')
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(firstApplications)
  return Number(row?.n ?? 0)
}

/**
 * Selbsteinträge über /creator seit `since`.
 *
 * Einfacher als bei den Clippern: Die Creator-Zeile entsteht genau einmal,
 * beim ersten Absenden des Steppers, und wird danach nie neu geschrieben
 * (siehe `provisionCreator`). Ihr `createdAt` IST also der Zeitpunkt des
 * Selbsteintrags.
 */
async function creatorSignupsSince(env: AppEnv['Bindings'], since: number): Promise<number> {
  const [row] = await getDb(env)
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(and(eq(schema.users.role, 'creator'), sql`${schema.creators.createdAt} >= ${since}`))
  return Number(row?.n ?? 0)
}

/* ------------------------------------------------------ Kampagnen-Karten

   Was jede Kampagnenkarte im Admin-Bereich zeigt — Besitzer, Thumbnail,
   Team, Material, Clips — für beliebig viele Kampagnen in wenigen
   gruppierten Abfragen statt in Rundreisen je Karte. Listen über IDs gehen
   in Stücken zu 90: D1 bindet höchstens 100 Parameter je Abfrage.
   -------------------------------------------------------------------------- */

async function chunked<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 90) out.push(...(await query(ids.slice(i, i + 90))))
  return out
}

/** Alle Clipper und Creator — mit beiden möglichen Zeilen (Schnitt und Verbreitung). */
async function people(env: Env) {
  const rows = await getDb(env)
    .select({
      userId: schema.users.id,
      name: schema.users.fullName,
      email: schema.users.email,
      role: schema.users.role,
      clipperId: schema.clippers.id,
      creatorId: schema.creators.id,
    })
    .from(schema.users)
    .leftJoin(schema.clippers, eq(schema.clippers.userId, schema.users.id))
    .leftJoin(schema.creators, eq(schema.creators.userId, schema.users.id))
    .where(inArray(schema.users.role, ['clipper', 'creator']))
    .orderBy(schema.users.fullName)
  const seen = new Set<string>()
  return rows
    .filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)))
    .map((r) => ({ ...r, role: r.role === 'creator' ? ('creator' as const) : ('clipper' as const) }))
}

/** Nutzer-ID → Profil im Admin-Bereich. Creator haben auch eine Clipper-Zeile — ihr Profil ist das Creator-Profil. */
function profileLinksOf(list: Awaited<ReturnType<typeof people>>): ProfileLinks {
  const out: ProfileLinks = new Map()
  for (const p of list) {
    if (p.role === 'creator' && p.creatorId) out.set(p.userId, `/admin/creator/${p.creatorId}`)
    else if (p.clipperId) out.set(p.userId, `/admin/clipper/${p.clipperId}`)
  }
  return out
}

/** Wohin der Name eines Besitzers führt: Creator-Profil oder Kundenseite. */
const ownerHref = (o: { role: string; customerId: string; creatorId?: string | null }) =>
  o.role === 'creator' && o.creatorId ? `/admin/creator/${o.creatorId}` : `/admin/kunden/${o.customerId}`

/**
 * Die Kampagnen als Karten-Daten, neueste zuerst. Ohne Filter alle; mit
 * `ids` genau diese, mit `customerId` die eines Kunden bzw. Creators.
 */
async function campaignSummaries(env: Env, filter: { ids?: string[]; customerId?: string } = {}): Promise<AdminCampaign[]> {
  const db = getDb(env)
  if (filter.ids && !filter.ids.length) return []

  const base = (where?: SQL) =>
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        status: schema.projects.status,
        createdAt: schema.projects.createdAt,
        creatorDistribution: schema.projects.creatorDistribution,
        publishError: schema.projects.publishError,
        customerId: schema.customers.id,
        company: schema.customers.company,
        userId: schema.users.id,
        role: schema.users.role,
        fullName: schema.users.fullName,
        email: schema.users.email,
      })
      .from(schema.projects)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
      .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
      .where(where)
      .orderBy(desc(schema.projects.createdAt))

  const rows = filter.ids
    ? (await chunked(filter.ids, (ids) => base(inArray(schema.projects.id, ids)))).sort((a, b) => b.createdAt - a.createdAt)
    : await base(filter.customerId ? eq(schema.projects.customerId, filter.customerId) : undefined)
  const ids = rows.map((r) => r.id)
  if (!ids.length) return []

  /* Material wie `hasMaterial` in domain.ts: fertig hochgeladen, nicht im
     Papierkorb (ein Ordner im Papierkorb setzt `deletedAt` auch an seinen
     Dateien). */
  const fileFilter = (chunk: string[]) =>
    and(
      inArray(schema.folders.projectId, chunk),
      eq(schema.rawAssets.uploadStatus, 'complete'),
      isNull(schema.rawAssets.deletedAt),
    )

  const [thumbs, teams, fileStats, fileNames, linkRows, clipRows, creatorRows] = await Promise.all([
    campaignThumbs(env, ids),
    teamsByProject(env, ids),
    chunked(ids, (chunk) =>
      db
        .select({
          projectId: schema.folders.projectId,
          n: sql<number>`count(*)`.mapWith(Number),
          bytes: sql<number>`coalesce(sum(${schema.rawAssets.bytes}), 0)`.mapWith(Number),
        })
        .from(schema.rawAssets)
        .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
        .where(fileFilter(chunk))
        .groupBy(schema.folders.projectId),
    ),
    /* Je Kampagne die drei neuesten Dateinamen — als Fensterfunktion, damit
       eine Kampagne mit tausend Dateien nicht tausend Zeilen schickt. */
    chunked(ids, (chunk) => {
      const ranked = db
        .select({
          projectId: schema.folders.projectId,
          filename: schema.rawAssets.filename,
          rn: sql<number>`row_number() over (partition by ${schema.folders.projectId} order by ${schema.rawAssets.createdAt} desc)`.as('rn'),
        })
        .from(schema.rawAssets)
        .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
        .where(fileFilter(chunk))
        .as('ranked')
      return db
        .select({ projectId: ranked.projectId, filename: ranked.filename })
        .from(ranked)
        .where(sql`${ranked.rn} <= 3`)
        .orderBy(ranked.projectId, sql`${ranked.rn}`)
    }),
    chunked(ids, (chunk) =>
      db
        .select({ projectId: schema.projectLinks.projectId, url: schema.projectLinks.url })
        .from(schema.projectLinks)
        .where(inArray(schema.projectLinks.projectId, chunk))
        .orderBy(schema.projectLinks.createdAt),
    ),
    chunked(ids, (chunk) =>
      db
        .select({ projectId: schema.deliverables.projectId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(schema.deliverables)
        .where(and(inArray(schema.deliverables.projectId, chunk), eq(schema.deliverables.uploadStatus, 'complete')))
        .groupBy(schema.deliverables.projectId),
    ),
    db.select({ id: schema.creators.id, userId: schema.creators.userId }).from(schema.creators),
  ])

  const stats = new Map(fileStats.map((f) => [f.projectId, f]))
  const names = new Map<string, string[]>()
  for (const f of fileNames) {
    if (!f.projectId) continue
    const list = names.get(f.projectId) ?? []
    list.push(f.filename)
    names.set(f.projectId, list)
  }
  const linksBy = new Map<string, string[]>()
  for (const l of linkRows) {
    const list = linksBy.get(l.projectId) ?? []
    list.push(l.url)
    linksBy.set(l.projectId, list)
  }
  const clips = new Map(clipRows.map((r) => [r.projectId, r.n]))
  const creatorOf = new Map(creatorRows.map((r) => [r.userId, r.id]))

  return rows.map((r) => {
    const urls = linksBy.get(r.id) ?? []
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      owner: {
        customerId: r.customerId,
        userId: r.userId,
        role: r.role,
        label: r.company || r.fullName,
        fullName: r.fullName,
        email: r.email,
        href: ownerHref({ role: r.role, customerId: r.customerId, creatorId: creatorOf.get(r.userId) }),
      },
      thumb: thumbs.get(r.id) ?? { kind: 'none' },
      team: teams.get(r.id) ?? [],
      files: stats.get(r.id)?.n ?? 0,
      bytes: stats.get(r.id)?.bytes ?? 0,
      links: urls.length,
      clips: clips.get(r.id) ?? 0,
      fileNames: names.get(r.id) ?? [],
      // Je Anbieter einmal — zwei Drive-Ordner sind auf der Karte ein „drive.google.com“.
      linkHosts: [...new Set(urls.map((u) => linkHost(u)))].slice(0, 2),
      creatorDistribution: r.creatorDistribution === 1,
      publishError: r.publishError,
    }
  })
}

/**
 * Wem eine neue Kampagne gehören kann: bestätigte Kunden, dann Creator,
 * dann Leads (sie haben einen Arbeitsbereich, sind aber noch keine Kunden).
 */
async function ownerOptions(env: Env): Promise<OwnerOption[]> {
  const rows = await getDb(env)
    .select({
      customerId: schema.customers.id,
      company: schema.customers.company,
      fullName: schema.users.fullName,
      role: schema.users.role,
      convertedAt: schema.customers.convertedAt,
    })
    .from(schema.customers)
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(inArray(schema.users.role, ['customer', 'creator']))
  const rank = (r: (typeof rows)[number]) => (r.role === 'creator' ? 1 : r.convertedAt ? 0 : 2)
  return rows
    .map((r) => ({
      r,
      label: `${r.company || r.fullName}${r.role === 'creator' ? ' · Creator' : r.convertedAt ? '' : ' · Lead'}`,
    }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.label.localeCompare(b.label, 'en'))
    .map(({ r, label }) => ({ customerId: r.customerId, label }))
}

/** Alle Kampagnen für „Assign to campaign“ — ohne die, in denen die Person schon ist, und ohne ihre eigenen. */
async function assignableCampaigns(env: Env, o: { exclude: Set<string>; ownerUserId: string }): Promise<AssignableCampaign[]> {
  const rows = await getDb(env)
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      status: schema.projects.status,
      company: schema.customers.company,
      fullName: schema.users.fullName,
      ownerUserId: schema.customers.userId,
      role: schema.users.role,
    })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .orderBy(desc(schema.projects.createdAt))
  return rows
    .filter((r) => !o.exclude.has(r.id) && r.ownerUserId !== o.ownerUserId)
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      owner: r.role === 'creator' ? `Creator: ${r.fullName}` : r.company || r.fullName,
    }))
}

/** Die neuesten fertigen Clips — über alle Kampagnen oder die eines Bearbeiters (Clipper-ID). */
async function recentClips(env: Env, o: { clipperId?: string; limit: number }): Promise<ProjectReel[]> {
  const rows = await getDb(env)
    .select({
      d: schema.deliverables,
      projectName: schema.projects.name,
      clipper: schema.clippers.displayName,
    })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .leftJoin(schema.clippers, eq(schema.clippers.id, schema.deliverables.clipperId))
    .where(
      and(
        eq(schema.deliverables.uploadStatus, 'complete'),
        o.clipperId ? eq(schema.deliverables.clipperId, o.clipperId) : undefined,
      ),
    )
    .orderBy(desc(schema.deliverables.createdAt))
    .limit(o.limit)
  return rows.map(({ d, projectName, clipper }) => ({
    id: d.id,
    filename: d.filename,
    caption: d.caption,
    bytes: d.bytes,
    createdAt: d.createdAt,
    // Auf dem eigenen Profil wäre der Name doppelt — dort steht nur die Kampagne.
    clipper: o.clipperId ? null : clipper,
    uploadStatus: d.uploadStatus,
    publishStatus: d.publishStatus,
    publishTargets: d.publishTargets,
    projectId: d.projectId,
    projectName,
  }))
}

/** Gelieferte und veröffentlichte Clips eines Bearbeiters. */
async function clipStats(env: Env, clipperId: string | null): Promise<{ delivered: number; published: number }> {
  if (!clipperId) return { delivered: 0, published: 0 }
  const [row] = await getDb(env)
    .select({
      delivered: sql<number>`count(*)`.mapWith(Number),
      published: sql<number>`coalesce(sum(case when ${schema.deliverables.publishStatus} in (${PUBLISH_STATUS.posted}, ${PUBLISH_STATUS.partial}) then 1 else 0 end), 0)`.mapWith(Number),
    })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.clipperId, clipperId), eq(schema.deliverables.uploadStatus, 'complete')))
  return { delivered: row?.delivered ?? 0, published: row?.published ?? 0 }
}

/** Kampagnen in der Reihenfolge, in der die Person ihnen zugeordnet wurde (neueste zuerst). */
const inOrder = (list: AdminCampaign[], order: string[]) => {
  const at = new Map(order.map((id, i) => [id, i]))
  return [...list].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
}

/* ---------------------------------------------------------------- Analytics */

/** Views-Grafik groß; die Zahlen holt assets/views.js über GET /api/views-analytics. */
adminRoutes.get('/analytics', (c) => c.html(analyticsPage({ user: c.get('user') })))

/* ---------------------------------------------------------------- Übersicht */

adminRoutes.get('/', async (c) => {
  const db = getDb(c.env)
  const ts = nowSec()
  const weekAgo = ts - 7 * 86400
  const dayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)

  const [newLeads] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.leads)
    .where(sql`${schema.leads.createdAt} >= ${weekAgo}`)

  const [activeProjects] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.projects)
    .where(eq(schema.projects.status, 'aktiv'))

  /*
   * Kunden, Clipper und Creator strikt nach Rolle getrennt.
   *
   * Ein Creator hat eine Zeile in `customers` UND eine in `clippers` — ohne
   * den Blick auf `users.role` zählte er in beiden Zahlen mit und dazu noch
   * unter „Creators“. Gezählt werden bei den Kunden außerdem nur Zugänge, die
   * Jason ausdrücklich zum Kunden erklärt hat.
   */
  const [customerCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.customers)
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(and(eq(schema.users.role, 'customer'), isNotNull(schema.customers.convertedAt)))

  const [clipperCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(eq(schema.users.role, 'clipper'))
  const clipperSignups = await selfSignupsSince(c.env, weekAgo)

  const [creatorCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.users.role, 'creator'))
  const creatorSignups = await creatorSignupsSince(c.env, weekAgo)

  // Der Speicher bleibt eine Gesamtzahl: Er misst, was im Bucket liegt — und
  // dort liegt das Material der Creator-Kampagnen genauso wie das der Kunden.
  const [storage] = await db
    .select({ n: sql<number>`COALESCE(SUM(${schema.customers.storageBytes}), 0)` })
    .from(schema.customers)

  const [uploadsToday] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.rawAssets)
    .where(
      and(eq(schema.rawAssets.uploadStatus, 'complete'), sql`${schema.rawAssets.createdAt} >= ${dayStart}`),
    )

  const recentLeads = await db
    .select()
    .from(schema.leads)
    .orderBy(desc(schema.leads.createdAt))
    .limit(8)

  /*
   * Verbundene Accounts — Kampagnen und Creator zusammen, denn Zernio rechnet
   * je verbundenem Account ab, egal wem er bei uns gehört. Seit Kunden und
   * Creator selbst verbinden, wächst die Zahl ohne Zutun des Administrators;
   * daneben steht, was das im Monat ungefähr kostet.
   */
  const accounts = await connectedAccountStats(c.env)

  /*
   * Reichweite über alles, die Kampagnen als Karten, die neuesten Clips und
   * die Profil-Adressen für die Team-Chips — unabhängig voneinander, also
   * gleichzeitig.
   */
  const [reachTotals, reachSync, reachPausedUntil, campaigns, team, clips] = await Promise.all([
    numbersOr(grandTotals(c.env), { ...emptyTotals(), viaCreators: emptyTotals() }),
    numbersOr(syncOverview(c.env), NO_SYNC),
    numbersOr(metricsPausedUntil(c.env), null),
    campaignSummaries(c.env),
    people(c.env),
    recentClips(c.env, { limit: 6 }),
  ])

  /* Wartet auf ein Team: aktiv und niemand daran. Mit Material zuerst — dort
     wartet schon jemand auf Ergebnisse. */
  const hasMaterial = (x: AdminCampaign) => (x.files || x.links ? 1 : 0)
  const waiting = campaigns
    .filter((x) => x.status === 'aktiv' && !x.team.length)
    .sort((a, b) => hasMaterial(b) - hasMaterial(a) || b.createdAt - a.createdAt)

  return c.html(
    overviewPage({
      user: c.get('user'),
      newLeads: Number(newLeads?.n ?? 0),
      customers: Number(customerCount?.n ?? 0),
      activeCampaigns: Number(activeProjects?.n ?? 0),
      clippers: Number(clipperCount?.n ?? 0),
      clipperSignups,
      creators: Number(creatorCount?.n ?? 0),
      creatorSignups,
      storageBytes: Number(storage?.n ?? 0),
      uploadsToday: Number(uploadsToday?.n ?? 0),
      accounts: { ...accounts, monthlyUsd: zernioMonthlyCost(accounts.total) },
      reach: { totals: reachTotals, sync: reachSync, pausedUntil: reachPausedUntil },
      recentLeads,
      waiting,
      latest: campaigns.slice(0, 12),
      clips,
      links: profileLinksOf(team),
    }),
  )
})

/* -------------------------------------------------------------------- Leads */

adminRoutes.get('/leads', async (c) => {
  const db = getDb(c.env)
  const status = c.req.query('status') ?? ''
  const search = (c.req.query('q') ?? '').trim()

  const filters = []
  if (status && (LEAD_STATUS as readonly string[]).includes(status)) {
    filters.push(eq(schema.leads.status, status))
  }
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, '')}%`
    filters.push(
      or(
        like(schema.leads.fullName, pattern),
        like(schema.leads.company, pattern),
        like(schema.leads.email, pattern),
        like(schema.leads.phone, pattern),
      ),
    )
  }

  // `convertedAt` kommt mit: die Liste zeigt für jeden Lead, ob sein Zugang
  // schon zum Kunden erklärt wurde — und bietet den Schalter dafür an.
  const rows = await db
    .select({ lead: schema.leads, convertedAt: schema.customers.convertedAt })
    .from(schema.leads)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.leads.customerId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.leads.createdAt))
    .limit(300)

  /*
   * Eine Zeile je Zugang, nicht je Anfrage.
   *
   * Eine E-Mail-Adresse ergibt genau einen Zugang (`users_email_unique`);
   * wer das Formular zweimal abschickt, bekommt zwei Lead-Einträge, aber
   * denselben Zugang. Als zwei Zeilen standen beide mit „Customer ✓“ da,
   * während unter „Customers“ nur einer auftauchte — das sah nach einem
   * verschwundenen Kunden aus. Jetzt steht der Zugang einmal da, die übrigen
   * Anfragen derselben Adresse klappen unter dem „i“ auf.
   *
   * Die Geschwister kommen ohne gebundene Parameter: eine Liste aus bis zu
   * 300 Zugangs-IDs liefe in die Obergrenze von D1 (100 je Abfrage).
   */
  const shared = await db
    .select()
    .from(schema.leads)
    .where(
      inArray(
        schema.leads.customerId,
        db
          .select({ id: schema.leads.customerId })
          .from(schema.leads)
          .groupBy(schema.leads.customerId)
          .having(sql`count(*) > 1`),
      ),
    )
    .orderBy(desc(schema.leads.createdAt))

  const seen = new Set<string>()
  const leads: LeadRow[] = []
  for (const r of rows) {
    const customerId = r.lead.customerId
    if (customerId) {
      if (seen.has(customerId)) continue
      seen.add(customerId)
    }
    leads.push({
      ...r.lead,
      converted: Boolean(r.convertedAt),
      others: customerId ? shared.filter((s) => s.customerId === customerId && s.id !== r.lead.id) : [],
    })
  }

  return c.html(
    leadsPage({
      user: c.get('user'),
      leads,
      filterStatus: status,
      search,
    }),
  )
})

adminRoutes.get('/leads/:id', async (c) => {
  const db = getDb(c.env)
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param('id'))).limit(1)
  if (!lead) return c.notFound()

  // Kundenkonto und Kampagnen gehören zum Lead dazu — sie entstehen beim
  // Absenden des Formulars, nicht durch einen Handgriff im Admin-Bereich.
  let customer:
    | {
        id: string
        label: string
        converted: boolean
        projects: { id: string; name: string; status: string }[]
      }
    | null = null
  if (lead.customerId) {
    const [row] = await db
      .select({
        id: schema.customers.id,
        company: schema.customers.company,
        fullName: schema.users.fullName,
        convertedAt: schema.customers.convertedAt,
      })
      .from(schema.customers)
      .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
      .where(eq(schema.customers.id, lead.customerId))
      .limit(1)

    if (row) {
      const projects = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          status: schema.projects.status,
        })
        .from(schema.projects)
        .where(eq(schema.projects.customerId, row.id))
        .orderBy(schema.projects.createdAt)
      customer = {
        id: row.id,
        label: row.company || row.fullName,
        converted: Boolean(row.convertedAt),
        projects,
      }
    }
  }

  // Weitere Anfragen derselben Adresse — sie teilen sich diesen Zugang.
  const others = lead.customerId
    ? (
        await db
          .select()
          .from(schema.leads)
          .where(eq(schema.leads.customerId, lead.customerId))
          .orderBy(desc(schema.leads.createdAt))
      ).filter((l) => l.id !== lead.id)
    : []

  const pushPopupDays = customer ? await pushPopupSetting(c.env, customer.id) : null
  return c.html(leadDetailPage({ user: c.get('user'), lead, customer, others, pushPopupDays }))
})

/* ------------------------------------------------------------------ Kunden */

/**
 * Kundenzeilen. `onlyConverted` ist der Kern der Trennung: Unter „Kunden“
 * erscheint ausschließlich, wen der Administrator dazu erklärt hat. Alle
 * anderen Zugänge bleiben Leads und stehen nur unter „Leads“.
 *
 * `role` trennt zusätzlich die Creator ab: Ihr Arbeitsbereich für eigene
 * Kampagnen ist technisch eine Zeile in `customers`, gehört aber nicht in die
 * Kundenliste. Die Detailseite fragt ohne `role` — sie zeigt den
 * Arbeitsbereich eines Creators genauso wie den eines Kunden.
 */
async function customerRows(
  env: Env,
  o: { customerId?: string; onlyConverted?: boolean; role?: 'customer' | 'creator' } = {},
): Promise<CustomerRow[]> {
  const db = getDb(env)
  const filters = []
  if (o.customerId) filters.push(eq(schema.customers.id, o.customerId))
  if (o.onlyConverted) filters.push(isNotNull(schema.customers.convertedAt))
  if (o.role) filters.push(eq(schema.users.role, o.role))

  const rows = await db
    .select({
      customerId: schema.customers.id,
      userId: schema.users.id,
      role: schema.users.role,
      company: schema.customers.company,
      fullName: schema.users.fullName,
      email: schema.users.email,
      phone: schema.users.phone,
      storageBytes: schema.customers.storageBytes,
      convertedAt: schema.customers.convertedAt,
    })
    .from(schema.customers)
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.customers.createdAt))
    .limit(500)

  /*
   * Alle Kampagnen dieser Kunden in EINER Abfrage (in Stücken), dazu ihre
   * Teams — gruppiert über `teamsByProject`, nicht eine Abfrage je Zeile.
   */
  const campaigns = await chunked(
    rows.map((r) => r.customerId),
    (ids) =>
      db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          status: schema.projects.status,
          customerId: schema.projects.customerId,
        })
        .from(schema.projects)
        .where(inArray(schema.projects.customerId, ids))
        .orderBy(schema.projects.createdAt),
  )
  const teams = await teamsByProject(env, campaigns.map((p) => p.id))

  return Promise.all(
    rows.map(async (r) => {
      const [last] = await db
        .select({ ts: sql<number>`MAX(${schema.rawAssets.createdAt})` })
        .from(schema.rawAssets)
        .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
        .where(eq(schema.folders.customerId, r.customerId))

      // Anfragen aus dem Formular, die an diesem Zugang hängen — eine Adresse
      // kann mehrere haben. Die Kundenliste nennt die Zahl, damit „zwei Leads
      // mit Customer ✓, aber nur ein Kunde“ nicht nach einem Fehler aussieht.
      const [enquiries] = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(schema.leads)
        .where(eq(schema.leads.customerId, r.customerId))

      return {
        ...r,
        projects: campaigns
          .filter((p) => p.customerId === r.customerId)
          .map((p) => ({ id: p.id, name: p.name, status: p.status, team: teams.get(p.id) ?? [] })),
        lastUpload: last?.ts ? Number(last.ts) : null,
        enquiries: Number(enquiries?.n ?? 0),
      }
    }),
  )
}

adminRoutes.get('/kunden', async (c) => {
  return c.html(
    customersPage({
      user: c.get('user'),
      customers: await customerRows(c.env, { onlyConverted: true, role: 'customer' }),
    }),
  )
})

adminRoutes.get('/kunden/:id', async (c) => {
  const [customer] = await customerRows(c.env, { customerId: c.req.param('id') })
  if (!customer) return c.notFound()

  const db = getDb(c.env)
  const folders = await db
    .select({ folder: schema.folders, projectName: schema.projects.name })
    .from(schema.folders)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.folders.projectId))
    .where(eq(schema.folders.customerId, customer.customerId))
    .orderBy(schema.folders.name)

  const withFiles = await Promise.all(
    folders.map(async ({ folder: f, projectName }) => ({
      id: f.id,
      name: f.name,
      deletedAt: f.deletedAt,
      projectId: f.projectId,
      projectName,
      files: (
        await db
          .select()
          .from(schema.rawAssets)
          .where(eq(schema.rawAssets.folderId, f.id))
          .orderBy(desc(schema.rawAssets.createdAt))
      ).map((a) => ({
        id: a.id,
        filename: a.filename,
        bytes: a.bytes,
        createdAt: a.createdAt,
        video: isVideo(a.filename),
      })),
    })),
  )

  const [campaigns, team, timeline, pushPopupDays] = await Promise.all([
    campaignSummaries(c.env, { customerId: customer.customerId }),
    people(c.env),
    customerTimeline(c.env, { customerId: customer.customerId, userId: customer.userId }),
    pushPopupSetting(c.env, customer.customerId),
  ])
  const links = profileLinksOf(team)

  return c.html(
    customerDetailPage({
      timeline,
      pushPopupDays,
      user: c.get('user'),
      customer,
      campaigns,
      links,
      creatorHref: customer.role === 'creator' ? links.get(customer.userId) ?? null : null,
      folders: withFiles,
    }),
  )
})

/* -------------------------------------------------------------- Clipper */

/**
 * Die Bewerbungen aus /clipper — neueste Fassung je Clipper. Ohne `clipperId`
 * die ALLER Clipper in einer Abfrage: bewusst ohne `inArray` über die IDs,
 * denn D1 nimmt höchstens 100 gebundene Werte je Abfrage und die Liste ist
 * ungefiltert. Ein Clipper kann das Formular mehrmals abschicken; es zählt
 * die neueste Fassung, also die erste, die je Clipper vorbeikommt.
 */
async function latestApplications(env: Env, clipperId?: string): Promise<Map<string, ClipperApplicationInfo>> {
  const applications = await getDb(env)
    .select({
      clipperId: schema.clipperApplications.clipperId,
      platforms: schema.clipperApplications.platforms,
      workStatus: schema.clipperApplications.workStatus,
      experience: schema.clipperApplications.experience,
      availability: schema.clipperApplications.availability,
      createdAt: schema.clipperApplications.createdAt,
    })
    .from(schema.clipperApplications)
    .where(clipperId ? eq(schema.clipperApplications.clipperId, clipperId) : undefined)
    .orderBy(desc(schema.clipperApplications.createdAt))

  const latest = new Map<string, ClipperApplicationInfo>()
  for (const a of applications) {
    if (latest.has(a.clipperId)) continue
    latest.set(a.clipperId, {
      platforms: platformsOf(a.platforms),
      workStatus: a.workStatus,
      experience: a.experience,
      availability: a.availability,
      createdAt: a.createdAt,
    })
  }
  return latest
}

adminRoutes.get('/clipper', async (c) => {
  const db = getDb(c.env)
  const rows = await db
    .select({
      id: schema.clippers.id,
      userId: schema.users.id,
      displayName: schema.clippers.displayName,
      email: schema.users.email,
      phone: schema.users.phone,
      status: schema.clippers.status,
      invitedAt: schema.clippers.invitedAt,
    })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    // Creator haben auch eine Zeile in `clippers` — sie stehen unter /admin/creator.
    .where(eq(schema.users.role, 'clipper'))
    .orderBy(desc(schema.clippers.createdAt))

  /*
   * Kampagnen und gelieferte Clips je Clipper — je EINE gruppierte Abfrage
   * über alle, nicht zwei je Zeile. Kampagnen zählen die Zeilen in
   * `project_workers`: so viele Teams, in denen er schneidet.
   */
  const [latest, campaignRows, uploadRows, reach, metricsPaused, payTiers] = await Promise.all([
    latestApplications(c.env),
    db
      .select({ clipperId: schema.projectWorkers.clipperId, n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(schema.projectWorkers)
      .groupBy(schema.projectWorkers.clipperId),
    db
      .select({ clipperId: schema.deliverables.clipperId, n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.uploadStatus, 'complete'))
      .groupBy(schema.deliverables.clipperId),
    // Was die gelieferten Clips erreicht haben — eine gruppierte Abfrage für
    // alle. Dazu der 402-Hinweis: ohne ihn sähen eingefrorene Zahlen frisch aus.
    numbersOr(reachByClipper(c.env), new Map()),
    numbersOr(metricsPausedUntil(c.env), null),
    payTierCounts(c.env, rows.map((r) => r.userId)),
  ])
  const campaignsBy = new Map(campaignRows.map((r) => [r.clipperId, r.n]))
  const uploadsBy = new Map(uploadRows.map((r) => [r.clipperId, r.n]))

  const clippers = rows.map((cl) => ({
    ...cl,
    projects: campaignsBy.get(cl.id) ?? 0,
    uploads: uploadsBy.get(cl.id) ?? 0,
    application: latest.get(cl.id) ?? null,
    reach: reach.get(cl.id),
    payTiers: payTiers.get(cl.userId) ?? 0,
  }))

  return c.html(
    clippersPage({
      user: c.get('user'),
      clippers,
      recentSignups: await selfSignupsSince(c.env, nowSec() - 7 * 86400),
      metricsPausedUntil: metricsPaused,
    }),
  )
})

/*
 * Das Profil eines Clippers: was er insgesamt erreicht und gemacht hat, in
 * welchen Teams er ist, seine letzten Clips — und hier ordnet der
 * Administrator ihn persönlich Kampagnen zu und legt seine Preisstaffelung
 * fest. Ein Creator hat ebenfalls eine Zeile in `clippers`; sein Profil ist
 * das Creator-Profil.
 */
adminRoutes.get('/clipper/:id', async (c) => {
  const db = getDb(c.env)
  const [row] = await db
    .select({
      id: schema.clippers.id,
      userId: schema.users.id,
      role: schema.users.role,
      displayName: schema.clippers.displayName,
      email: schema.users.email,
      phone: schema.users.phone,
      status: schema.clippers.status,
      invitedAt: schema.clippers.invitedAt,
      createdAt: schema.clippers.createdAt,
      verifiedAt: schema.users.verifiedAt,
      lastLoginAt: schema.users.lastLoginAt,
    })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(eq(schema.clippers.id, c.req.param('id')))
    .limit(1)
  if (!row) return c.notFound()

  if (row.role === 'creator') {
    const [creator] = await db
      .select({ id: schema.creators.id })
      .from(schema.creators)
      .where(eq(schema.creators.userId, row.userId))
      .limit(1)
    if (creator) return c.redirect(`/admin/creator/${creator.id}`, 302)
  }

  const mine = await campaignsOfUser(c.env, row.userId)
  const ids = mine.map((m) => m.id)

  const [applications, campaigns, team, assignable, clips, stats, totals, payTiers, paused] = await Promise.all([
    latestApplications(c.env, row.id),
    campaignSummaries(c.env, { ids }),
    people(c.env),
    assignableCampaigns(c.env, { exclude: new Set(ids), ownerUserId: row.userId }),
    recentClips(c.env, { clipperId: row.id, limit: 24 }),
    clipStats(c.env, row.id),
    numbersOr(totalsForClipper(c.env, row.id).then((t): MetricTotals | undefined => t), undefined),
    payTiersOf(c.env, row.userId),
    numbersOr(metricsPausedUntil(c.env), null),
  ])

  return c.html(
    clipperProfilePage({
      user: c.get('user'),
      clipper: row,
      application: applications.get(row.id) ?? null,
      campaigns: inOrder(campaigns, ids),
      roles: new Map(mine.map((m) => [m.id, { cuts: m.cuts, distributes: m.distributes }])),
      assignable,
      clips,
      stats,
      totals,
      payTiers,
      links: profileLinksOf(team),
      metricsPausedUntil: paused,
    }),
  )
})

/**
 * Die Plattformen einer Bewerbung — gespeichert als JSON-Array. Ein
 * kaputter Eintrag ergibt eine leere Liste statt einer Fehlerseite.
 */
function platformsOf(raw: string): string[] {
  try {
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/**
 * Die Handles eines Creators — gespeichert als JSON-Objekt
 * `{ plattform: handle }`. Wie oben: Ein kaputter Eintrag ergibt ein leeres
 * Objekt, und nur Texte kommen durch.
 */
function handlesOf(raw: string): Record<string, string> {
  try {
    const map: unknown = JSON.parse(raw)
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {}
    return Object.fromEntries(
      Object.entries(map).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
    )
  } catch {
    return {}
  }
}

/* ----------------------------------------------------------------- Creator

   Influencer und UGC-Creator aus /creator. Ein Creator steht auf zwei Seiten
   zugleich: Er bringt eigene Kampagnen mit (über seine Zeile in `customers`)
   und arbeitet in fremden Kampagnen-Teams (Schnitt über seine Zeile in
   `clippers` und `project_workers`, Verbreitung über `campaign_creators`).
   Die Liste zählt alles in je EINER gruppierten Abfrage über alle Creator,
   nicht in Rundreisen je Zeile.
   -------------------------------------------------------------------------- */

const creatorColumns = {
  creatorId: schema.creators.id,
  userId: schema.users.id,
  fullName: schema.users.fullName,
  email: schema.users.email,
  phone: schema.users.phone,
  verifiedAt: schema.users.verifiedAt,
  lastLoginAt: schema.users.lastLoginAt,
  goal: schema.creators.goal,
  niche: schema.creators.niche,
  platforms: schema.creators.platforms,
  handles: schema.creators.handles,
  openToAds: schema.creators.openToAds,
  followers: schema.creators.followers,
  viewsTotal: schema.creators.viewsTotal,
  views30d: schema.creators.views30d,
  source: schema.creators.source,
  createdAt: schema.creators.createdAt,
}

type CreatorBase = {
  creatorId: string
  userId: string
  fullName: string
  email: string
  phone: string | null
  verifiedAt: number | null
  goal: string
  niche: string | null
  platforms: string
  handles: string
  openToAds: string
  followers: string
  viewsTotal: string
  views30d: string
  source: string | null
  createdAt: number
}

/** Eine Creator-Zeile, wie Liste und Profil sie zeigen. */
function creatorRowOf(
  r: CreatorBase,
  x: {
    customerId: string | null
    ownCampaigns: number
    acceptedCampaigns: number
    joinedCampaigns: number
    distributionReach?: MetricTotals
    editedReach?: MetricTotals
    accounts: Awaited<ReturnType<typeof accountsForCreators>>
    payTiers: number
  },
): CreatorRow {
  return {
    creatorId: r.creatorId,
    userId: r.userId,
    customerId: x.customerId,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    verified: r.verifiedAt != null,
    goal: r.goal,
    niche: r.niche,
    platforms: platformsOf(r.platforms),
    handles: handlesOf(r.handles),
    openToAds: r.openToAds,
    followers: r.followers,
    viewsTotal: r.viewsTotal,
    views30d: r.views30d,
    source: r.source,
    ownCampaigns: x.ownCampaigns,
    acceptedCampaigns: x.acceptedCampaigns,
    joinedCampaigns: x.joinedCampaigns,
    distributionReach: x.distributionReach,
    editedReach: x.editedReach,
    socialAccounts: x.accounts
      .filter((a) => a.creatorId === r.creatorId)
      .map((a) => ({
        id: a.providerAccountId,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
      })),
    createdAt: r.createdAt,
    payTiers: x.payTiers,
  }
}

adminRoutes.get('/creator', async (c) => {
  const db = getDb(c.env)

  const [rows, own, accepted, joined, recentSignups, distributionReach, clipperReach, metricsPaused] = await Promise.all([
    db
      .select(creatorColumns)
      .from(schema.creators)
      .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
      .where(eq(schema.users.role, 'creator'))
      .orderBy(desc(schema.creators.createdAt)),

    /*
     * Eigene Kampagnen je Creator — mit LEFT JOIN, damit auch ein
     * Arbeitsbereich ohne Kampagne eine Zeile (mit 0) liefert: Seine ID
     * braucht die Liste trotzdem, sie führt zu Ordnern und Material.
     */
    db
      .select({
        userId: schema.customers.userId,
        customerId: sql<string>`MIN(${schema.customers.id})`,
        n: sql<number>`COUNT(${schema.projects.id})`,
      })
      .from(schema.customers)
      .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
      .leftJoin(schema.projects, eq(schema.projects.customerId, schema.customers.id))
      .where(eq(schema.users.role, 'creator'))
      .groupBy(schema.customers.userId),

    // Kampagnen, die er schneidet — Zeilen in `project_workers` über seine Clipper-Zeile.
    db
      .select({ userId: schema.clippers.userId, n: sql<number>`COUNT(*)` })
      .from(schema.projectWorkers)
      .innerJoin(schema.clippers, eq(schema.clippers.id, schema.projectWorkers.clipperId))
      .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
      .where(eq(schema.users.role, 'creator'))
      .groupBy(schema.clippers.userId),

    // Kampagnen, die er verbreitet — fremde, für Creator freigegebene Kampagnen.
    db
      .select({ creatorId: schema.campaignCreators.creatorId, n: sql<number>`COUNT(*)` })
      .from(schema.campaignCreators)
      .groupBy(schema.campaignCreators.creatorId),

    creatorSignupsSince(c.env, nowSec() - 7 * 86400),

    /*
     * Reichweite, je EINE gruppierte Abfrage über alle Creator: was seine
     * eigene Verbreitung erreicht hat, und — weil er fremde Kampagnen auch
     * schneidet — was die Clips erreicht haben, die er selbst geschnitten
     * hat. Letzteres hängt an seiner Clipper-Zeile, gefunden über die
     * Nutzer-ID.
     */
    numbersOr(reachByCreator(c.env), new Map()),
    numbersOr(reachByClipper(c.env), new Map()),
    // Der 402-Hinweis wie auf den anderen Seiten mit Zahlen.
    numbersOr(metricsPausedUntil(c.env), null),
  ])

  const ownBy = new Map(own.map((r) => [r.userId, r]))
  const acceptedBy = new Map(accepted.map((r) => [r.userId, Number(r.n)]))
  const joinedBy = new Map(joined.map((r) => [r.creatorId, Number(r.n)]))
  const editedReachBy = new Map([...clipperReach.values()].map((r) => [r.userId, r]))

  // Accounts und Preisstaffeln aller Creator in je EINER Abfrage, nicht einer je Zeile.
  const [creatorAccounts, payTiers] = await Promise.all([
    accountsForCreators(c.env, rows.map((r) => r.creatorId)),
    payTierCounts(c.env, rows.map((r) => r.userId)),
  ])

  const creators: CreatorRow[] = rows.map((r) =>
    creatorRowOf(r, {
      customerId: ownBy.get(r.userId)?.customerId ?? null,
      ownCampaigns: Number(ownBy.get(r.userId)?.n ?? 0),
      acceptedCampaigns: acceptedBy.get(r.userId) ?? 0,
      joinedCampaigns: joinedBy.get(r.creatorId) ?? 0,
      distributionReach: distributionReach.get(r.creatorId),
      editedReach: editedReachBy.get(r.userId),
      accounts: creatorAccounts,
      payTiers: payTiers.get(r.userId) ?? 0,
    }),
  )

  return c.html(creatorsPage({ user: c.get('user'), creators, recentSignups, metricsPausedUntil: metricsPaused }))
})

/*
 * Das Profil eines Creators — seine Angaben aus der Anmeldung, verbundene
 * Accounts, eigene Kampagnen, die Teams, in denen er schneidet oder
 * verbreitet, und seine Zahlen. Hier ordnet der Administrator ihn
 * persönlich Kampagnen zu und legt seine Preisstaffelung fest.
 */
adminRoutes.get('/creator/:id', async (c) => {
  const db = getDb(c.env)
  const [row] = await db
    .select(creatorColumns)
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.creators.id, c.req.param('id')))
    .limit(1)
  if (!row) return c.notFound()

  const [[workspace], [clipperRow], mine] = await Promise.all([
    db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.userId, row.userId)).limit(1),
    db.select({ id: schema.clippers.id }).from(schema.clippers).where(eq(schema.clippers.userId, row.userId)).limit(1),
    campaignsOfUser(c.env, row.userId),
  ])

  const own = workspace ? await campaignSummaries(c.env, { customerId: workspace.id }) : []
  const ownIds = new Set(own.map((x) => x.id))
  // Die eigene Kampagne bearbeitet er nicht als Teammitglied — steht sie aus
  // alter Zeit trotzdem dort, bleibt sie bei „Own campaigns“.
  const teamOf = mine.filter((m) => !ownIds.has(m.id))
  const teamIds = teamOf.map((m) => m.id)

  const [team, everyone, assignable, clips, stats, accounts, distribution, edited, payTiers, paused] = await Promise.all([
    campaignSummaries(c.env, { ids: teamIds }),
    people(c.env),
    assignableCampaigns(c.env, { exclude: new Set([...teamIds, ...ownIds]), ownerUserId: row.userId }),
    clipperRow ? recentClips(c.env, { clipperId: clipperRow.id, limit: 24 }) : Promise.resolve([]),
    clipStats(c.env, clipperRow?.id ?? null),
    accountsForCreators(c.env, [row.creatorId]),
    numbersOr(totalsForCreatorDistribution(c.env, row.creatorId).then((t): MetricTotals | undefined => t), undefined),
    clipperRow
      ? numbersOr(totalsForClipper(c.env, clipperRow.id).then((t): MetricTotals | undefined => t), undefined)
      : Promise.resolve(undefined),
    payTiersOf(c.env, row.userId),
    numbersOr(metricsPausedUntil(c.env), null),
  ])

  const roles = new Map(teamOf.map((m) => [m.id, { cuts: m.cuts, distributes: m.distributes }]))
  const creator = creatorRowOf(row, {
    customerId: workspace?.id ?? null,
    ownCampaigns: own.length,
    acceptedCampaigns: teamOf.filter((m) => m.cuts).length,
    joinedCampaigns: teamOf.filter((m) => m.distributes).length,
    distributionReach: distribution,
    editedReach: edited,
    accounts,
    payTiers: payTiers.length,
  })

  return c.html(
    creatorProfilePage({
      user: c.get('user'),
      creator,
      lastLoginAt: row.lastLoginAt,
      clipperId: clipperRow?.id ?? null,
      own,
      team: inOrder(team, teamIds),
      roles,
      assignable,
      clips,
      stats,
      payTiers,
      links: profileLinksOf(everyone),
      metricsPausedUntil: paused,
    }),
  )
})

/* ---------------------------------------------------------------- Kampagnen

   Alle Kampagnen als große Karten — von wem sie kommen, wer im Team ist,
   was an Material drinliegt. Hier entstehen neue Kampagnen; das Team stellt
   der Administrator auf der Kampagnenseite zusammen. Clipper und Creator
   sehen keine offenen Kampagnen — ohne diese Seiten bekommt niemand einen
   Job.
   -------------------------------------------------------------------------- */

/**
 * Rückkehr aus dem Verbinden-Ablauf.
 *
 * Der Anbieter hängt an unsere Adresse `connected={plattform}&profileId=…
 * &accountId=…&username=…` an. Damit steht alles fest, was der Account
 * braucht — wir tragen ihn sofort ein, statt auf den Webhook zu warten
 * oder eine Rundreise für einen Abgleich zu machen. Der Webhook bleibt als
 * zweiter Weg bestehen; doppelt eingetragen wird nichts, weil die
 * Account-ID der Primärschlüssel ist.
 *
 * Die Verarbeitung steckt in `absorbConnectReturn` — dieselbe, die Kunden
 * und Creator nutzen. Der Administrator darf für jede Kampagne verbinden
 * (`any`). Die Nacharbeit drüben (Dublette trennen, Gruppe nachziehen)
 * läuft im Hintergrund weiter und hält die Seite nicht auf.
 *
 * Seit Oktober 2026 kehrt der Ablauf auf die Kampagnenseite zurück; die
 * Liste wertet die Rückkehr weiter aus, damit Links von vorher nicht ins
 * Leere laufen.
 */
async function connectFlash(c: any): Promise<{ ok?: string; error?: string } | undefined> {
  const connect = await absorbConnectReturn(
    c.env,
    {
      connected: c.req.query('connected'),
      accountId: c.req.query('accountId'),
      profileId: c.req.query('profileId'),
      username: c.req.query('username'),
      error: c.req.query('error'),
      errorMessage: c.req.query('error_message'),
    },
    { any: true },
    'en',
  )
  if (connect?.background) c.executionCtx.waitUntil(connect.background)
  return connect && { ok: connect.ok, error: connect.error }
}

adminRoutes.get('/projekte', async (c) => {
  const flash = await connectFlash(c)

  const [all, team, owners, metricsPaused] = await Promise.all([
    campaignSummaries(c.env),
    people(c.env),
    ownerOptions(c.env),
    numbersOr(metricsPausedUntil(c.env), null),
  ])

  const pick = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : '')
  const filter: CampaignFilter = {
    status: pick(c.req.query('status'), ['aktiv', 'pausiert', 'beendet']),
    team: pick(c.req.query('team'), ['none']),
    owner: pick(c.req.query('owner'), ['creator']),
    q: (c.req.query('q') ?? '').trim().slice(0, 120),
  }

  /*
   * Gefiltert wird hier und nicht im WHERE: gesucht wird über Felder aus vier
   * Tabellen (Kampagne, Kunde, Adresse, Team), und die Liste ist durch die
   * Zahl der Kampagnen begrenzt, nicht durch die Datenmenge.
   */
  const needle = filter.q.toLowerCase()
  const campaigns = all.filter(
    (x) =>
      (!filter.status || x.status === filter.status) &&
      (!filter.team || !x.team.length) &&
      (!filter.owner || x.owner.role === 'creator') &&
      (!needle ||
        [x.name, x.owner.label, x.owner.fullName, x.owner.email, ...x.team.map((m) => m.name)].some((v) =>
          (v ?? '').toLowerCase().includes(needle),
        )),
  )

  return c.html(
    campaignsPage({
      user: c.get('user'),
      campaigns,
      all,
      filter,
      owners,
      links: profileLinksOf(team),
      flash,
      metricsPausedUntil: metricsPaused,
    }),
  )
})

/* ------------------------------------------------- Eine Kampagne im Detail

   Thumbnail, Eckdaten und das TEAM — beliebig viele Clipper und Creator,
   mit Schnitt und Verbreitung je Creator einzeln schaltbar. Darunter das
   Material, so wie das Team es sieht, die fertigen Clips mit ihren Zahlen
   und die verbundenen Accounts.

   Rohmaterial läuft komplett im Browser: Wer sehen will, ob brauchbares
   Material geliefert wurde, muss nichts auf die eigene Platte holen — bei
   einem Archiv mit Stunden an Aufnahmen wäre das keine Sichtung.
   -------------------------------------------------------------------------- */

adminRoutes.get('/projekte/:id', async (c) => {
  const db = getDb(c.env)
  const projectId = c.req.param('id')
  const flash = await connectFlash(c)

  const [row] = await db
    .select({
      project: schema.projects,
      customerId: schema.customers.id,
      ownerUserId: schema.users.id,
      ownerRole: schema.users.role,
      company: schema.customers.company,
      fullName: schema.users.fullName,
      email: schema.users.email,
      phone: schema.users.phone,
    })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!row) return c.notFound()

  const folderRows = await db
    .select()
    .from(schema.folders)
    .where(and(eq(schema.folders.projectId, projectId), isNull(schema.folders.deletedAt)))
    .orderBy(schema.folders.name)

  /*
   * Der volle Pfad statt des bloßen Ordnernamens.
   *
   * Ein Kunde legt Unterordner an („Rohmaterial / Januar“, „Rohmaterial /
   * Interviews“), und zwei davon heißen erfahrungsgemäß irgendwann gleich.
   * Nur der Name stünde dann zweimal identisch über zwei verschiedenen
   * Kacheln — der Pfad hält sie auseinander.
   */
  const byId = new Map(folderRows.map((f) => [f.id, f]))
  const pathOf = (id: string): string => {
    const parts: string[] = []
    let current = byId.get(id)
    // Die Tiefe ist begrenzt, damit ein fehlerhafter Elternverweis die Seite
    // nicht in eine Endlosschleife schickt.
    for (let depth = 0; current && depth < 12; depth++) {
      parts.unshift(current.name)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return parts.join(' / ')
  }

  const unsorted: ProjectMediaFolder[] = await Promise.all(
    folderRows.map(async (f) => {
      const files = await db
        .select()
        .from(schema.rawAssets)
        .where(
          and(
            eq(schema.rawAssets.folderId, f.id),
            isNull(schema.rawAssets.deletedAt),
            eq(schema.rawAssets.uploadStatus, 'complete'),
          ),
        )
        .orderBy(desc(schema.rawAssets.createdAt))

      return {
        id: f.id,
        path: pathOf(f.id),
        bytes: files.reduce((n, a) => n + a.bytes, 0),
        files: files.map((a) => ({
          id: a.id,
          filename: a.filename,
          bytes: a.bytes,
          createdAt: a.createdAt,
          video: isVideo(a.filename),
        })),
      }
    }),
  )

  /* Nach Pfad sortiert, nicht nach Namen: Sonst stünde „Rohmaterial / Januar“
     über „Rohmaterial“, weil J vor R kommt — der Unterordner also vor seinem
     eigenen Elternordner. */
  const folders = unsorted.sort((a, b) => a.path.localeCompare(b.path, 'de'))

  /* Was im Papierkorb liegt, zählt nicht mit — ohne einen Hinweis darauf wäre
     aber unerklärlich, warum die Zahl kleiner ist als erwartet. */
  const [trashed] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(
      and(
        eq(schema.folders.projectId, projectId),
        or(isNotNull(schema.rawAssets.deletedAt), isNotNull(schema.folders.deletedAt)),
      ),
    )

  const reelRows = await db
    .select({
      d: schema.deliverables,
      clipper: schema.clippers.displayName,
    })
    .from(schema.deliverables)
    .leftJoin(schema.clippers, eq(schema.clippers.id, schema.deliverables.clipperId))
    .where(eq(schema.deliverables.projectId, projectId))
    .orderBy(desc(schema.deliverables.createdAt))

  /*
   * Zahlen je fertigem Clip — ALLE Posts, die automatischen Ziele wie die
   * Verbreitung über Creator; die Ansicht markiert, was über Creator lief.
   * Summen und Zeilen je Account kommen gruppiert für alle Clips auf einmal,
   * dazu die Summe der Kampagne und der Stand des Abgleichs. Ein Clip, dessen
   * Upload nie fertig wurde, ist nirgends gepostet und braucht keine Abfrage.
   */
  const finishedIds = reelRows.filter(({ d }) => d.uploadStatus === 'complete').map(({ d }) => d.id)
  const ownerCreator =
    row.ownerRole === 'creator'
      ? (await db.select({ id: schema.creators.id }).from(schema.creators).where(eq(schema.creators.userId, row.ownerUserId)).limit(1))[0]
      : undefined

  const [reelTotals, reelRowsByClip, projectTotals, sync, pausedUntil, links, [summary], everyone, socialAccounts, creatorAccounts] =
    await Promise.all([
      numbersOr(totalsForDeliverables(c.env, finishedIds), new Map()),
      numbersOr(rowsForDeliverables(c.env, finishedIds), new Map()),
      numbersOr(totalsForProjects(c.env, [projectId]), new Map()),
      numbersOr(syncOverview(c.env, projectId), NO_SYNC),
      numbersOr(metricsPausedUntil(c.env), null),
      // Geteilte Cloud-Ordner — Material wie die Dateien oben, nur woanders gelagert.
      linksOf(c.env, projectId),
      campaignSummaries(c.env, { ids: [projectId] }),
      people(c.env),
      accountsForProjects(c.env, [projectId]),
      /*
       * Creator-Kampagnen gehen zusätzlich auf die Accounts ihres Creators
       * (`autoTargetAccounts`). Ohne sie stünde dort „No account connected“,
       * obwohl jeder Clip rausgeht — und wer daraufhin hier verbindet,
       * bezahlt dasselbe Konto ein zweites Mal.
       */
      ownerCreator ? accountsForCreators(c.env, [ownerCreator.id]) : Promise.resolve([]),
    ])

  const reels: ProjectReel[] = reelRows.map(({ d, clipper }) => ({
    id: d.id,
    filename: d.filename,
    caption: d.caption,
    bytes: d.bytes,
    createdAt: d.createdAt,
    clipper,
    uploadStatus: d.uploadStatus,
    publishStatus: d.publishStatus,
    publishTargets: d.publishTargets,
    reach: reelTotals.get(d.id),
    reachRows: reelRowsByClip.get(d.id) ?? [],
  }))

  /*
   * Das Team mit allem, was die Schalter brauchen: Clipper-Zeile fürs
   * Schneiden, Creator-Zeile fürs Verbreiten, Profil-Adresse. Wer ins Team
   * geholt werden kann: jeder Clipper und Creator außer dem Besitzer (eine
   * eigene Kampagne bearbeitet ein Creator nicht selbst, siehe `workersFor`)
   * und außer denen, die schon dabei sind.
   */
  const links2 = profileLinksOf(everyone)
  const personBy = new Map(everyone.map((p) => [p.userId, p]))
  const teamList = summary?.team ?? []
  const members: TeamMemberView[] = teamList.map((m) => {
    const p = personBy.get(m.userId)
    return {
      ...m,
      email: p?.email ?? null,
      href: links2.get(m.userId),
      clipperId: p?.clipperId ?? null,
      creatorId: p?.role === 'creator' ? (p.creatorId ?? null) : null,
    }
  })
  const inTeam = new Set(teamList.map((m) => m.userId))
  const candidates: TeamCandidate[] = everyone
    .filter((p) => p.userId !== row.ownerUserId && !inTeam.has(p.userId))
    .map((p) => ({ userId: p.userId, name: p.name, email: p.email, role: p.role }))

  const account = (a: { providerAccountId: string; platform: string; username: string | null; displayName: string | null }) => ({
    id: a.providerAccountId,
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
  })

  const campaign: AdminCampaign = summary ?? {
    id: row.project.id,
    name: row.project.name,
    status: row.project.status,
    createdAt: row.project.createdAt,
    owner: {
      customerId: row.customerId,
      userId: row.ownerUserId,
      role: row.ownerRole,
      label: row.company || row.fullName,
      fullName: row.fullName,
      email: row.email,
      href: ownerHref({ role: row.ownerRole, customerId: row.customerId, creatorId: ownerCreator?.id }),
    },
    thumb: { kind: 'none' },
    team: [],
    files: 0,
    bytes: 0,
    links: 0,
    clips: 0,
    fileNames: [],
    linkHosts: [],
    creatorDistribution: row.project.creatorDistribution === 1,
    publishError: row.project.publishError,
  }

  return c.html(
    campaignDetailPage({
      user: c.get('user'),
      campaign,
      project: {
        id: row.project.id,
        name: row.project.name,
        status: row.project.status,
        createdAt: row.project.createdAt,
        thumbKey: row.project.thumbKey,
        creatorDistribution: row.project.creatorDistribution === 1,
        publishError: row.project.publishError,
        briefing: projectBriefing(row.project),
        request: row.project.briefingDurationDays
          ? { durationDays: row.project.briefingDurationDays, views: row.project.briefingViews }
          : null,
      },
      owner: {
        customerId: row.customerId,
        label: row.company || row.fullName,
        fullName: row.fullName,
        company: row.company,
        email: row.email,
        phone: row.phone,
        role: row.ownerRole,
        href: campaign.owner.href,
      },
      members,
      candidates,
      folders,
      links: links.map((l) => ({
        id: l.id,
        url: l.url,
        createdAt: l.createdAt,
        provider: cloudProvider(linkHost(l.url)),
      })),
      reels,
      trashedFiles: Number(trashed?.n ?? 0),
      reach: { totals: projectTotals.get(projectId), sync, pausedUntil },
      socialAccounts: socialAccounts.filter((a) => a.projectId === projectId).map(account),
      creatorAccounts: creatorAccounts.map(account),
      flash,
    }),
  )
})

/** Die Seite hieß früher „Zuordnungen“ — alte Lesezeichen sollen weiter gehen. */
/* ---------------------------------------------------------------- Agenturen

   Leads von /brands, die Cooperation-Codes und die Creator-Buchungen der
   Agenturen (siehe lib/agency.ts). Der Menüpunkt heißt auf Wunsch des
   Auftraggebers deutsch „Agenturen“.
   -------------------------------------------------------------------------- */

async function agencyRows(env: Env, leadId?: string): Promise<AgencyRow[]> {
  return getDb(env)
    .select({
      lead: schema.agencyLeads,
      fullName: schema.users.fullName,
      email: schema.users.email,
      phone: schema.users.phone,
      code: schema.cooperationCodes.code,
    })
    .from(schema.agencyLeads)
    .innerJoin(schema.users, eq(schema.users.id, schema.agencyLeads.userId))
    .leftJoin(schema.cooperationCodes, eq(schema.cooperationCodes.id, schema.agencyLeads.codeId))
    .where(leadId ? eq(schema.agencyLeads.id, leadId) : undefined)
    .orderBy(desc(schema.agencyLeads.createdAt))
}

async function bookingRows(env: Env, agencyUserId?: string): Promise<BookingRow[]> {
  const creatorUser = alias(schema.users, 'creator_user')
  const agencyUser = alias(schema.users, 'agency_user')
  const db = getDb(env)
  const [creators, clippers] = await Promise.all([
    db
      .select({
        b: schema.creatorBookings,
        personName: creatorUser.fullName,
        personId: schema.creatorBookings.creatorId,
        projectName: schema.projects.name,
        agencyName: agencyUser.fullName,
        company: schema.agencyLeads.company,
        agencyLeadId: schema.agencyLeads.id,
      })
      .from(schema.creatorBookings)
      .innerJoin(schema.creators, eq(schema.creators.id, schema.creatorBookings.creatorId))
      .innerJoin(creatorUser, eq(creatorUser.id, schema.creators.userId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.creatorBookings.projectId))
      .innerJoin(agencyUser, eq(agencyUser.id, schema.creatorBookings.agencyUserId))
      .leftJoin(schema.agencyLeads, eq(schema.agencyLeads.userId, schema.creatorBookings.agencyUserId))
      .where(agencyUserId ? eq(schema.creatorBookings.agencyUserId, agencyUserId) : undefined)
      .orderBy(desc(schema.creatorBookings.createdAt))
      .limit(300),
    // Clipper-Buchungen (Migration 0028), gleich aufgebaut.
    db
      .select({
        b: schema.clipperBookings,
        personName: schema.clippers.displayName,
        personId: schema.clipperBookings.clipperId,
        projectName: schema.projects.name,
        agencyName: agencyUser.fullName,
        company: schema.agencyLeads.company,
        agencyLeadId: schema.agencyLeads.id,
      })
      .from(schema.clipperBookings)
      .innerJoin(schema.clippers, eq(schema.clippers.id, schema.clipperBookings.clipperId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.clipperBookings.projectId))
      .innerJoin(agencyUser, eq(agencyUser.id, schema.clipperBookings.agencyUserId))
      .leftJoin(schema.agencyLeads, eq(schema.agencyLeads.userId, schema.clipperBookings.agencyUserId))
      .where(agencyUserId ? eq(schema.clipperBookings.agencyUserId, agencyUserId) : undefined)
      .orderBy(desc(schema.clipperBookings.createdAt))
      .limit(300),
  ])
  const row =
    (kind: 'creator' | 'clipper') =>
    (r: (typeof creators)[number] | (typeof clippers)[number]): BookingRow => ({
      id: r.b.id,
      kind,
      status: r.b.status,
      message: r.b.message,
      createdAt: r.b.createdAt,
      creatorName: r.personName,
      creatorId: r.personId,
      projectId: r.b.projectId,
      projectName: r.projectName,
      agencyName: r.company || r.agencyName,
      agencyLeadId: r.agencyLeadId,
    })
  return [...creators.map(row('creator')), ...clippers.map(row('clipper'))]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
}

adminRoutes.get('/agenturen', async (c) => {
  const db = getDb(c.env)
  const filterRaw = c.req.query('filter')
  const filter = filterRaw === 'warm' || filterRaw === 'cold' ? filterRaw : 'all'
  const [rows, codes, bookings] = await Promise.all([
    agencyRows(c.env),
    db
      .select({
        code: schema.cooperationCodes,
        usedByName: schema.users.fullName,
        usedByLeadId: schema.agencyLeads.id,
      })
      .from(schema.cooperationCodes)
      .leftJoin(schema.users, eq(schema.users.id, schema.cooperationCodes.usedBy))
      .leftJoin(schema.agencyLeads, eq(schema.agencyLeads.userId, schema.cooperationCodes.usedBy))
      .orderBy(sql`${schema.cooperationCodes.usedAt} IS NOT NULL`, desc(schema.cooperationCodes.createdAt))
      .limit(300),
    bookingRows(c.env),
  ])
  return c.html(agenciesPage({ user: c.get('user'), rows, codes: codes as CodeRow[], bookings, filter }))
})

adminRoutes.get('/agenturen/:id', async (c) => {
  const [row] = await agencyRows(c.env, c.req.param('id'))
  if (!row) return c.notFound()
  const [bookings, projects, pushPopupDays] = await Promise.all([
    bookingRows(c.env, row.lead.userId),
    row.lead.customerId
      ? getDb(c.env)
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.customerId, row.lead.customerId))
          .orderBy(desc(schema.projects.createdAt))
      : Promise.resolve([]),
    row.lead.customerId ? pushPopupSetting(c.env, row.lead.customerId) : Promise.resolve(null),
  ])
  return c.html(
    agencyDetailPage({
      user: c.get('user'),
      row,
      bookings,
      pushPopupDays,
      campaigns: projects.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, briefing: projectBriefing(p) })),
    }),
  )
})

adminRoutes.get('/zuordnungen', (c) => c.redirect('/admin/projekte', 301))

/* ----------------------------------------------------------------- Passwort */

/* Gold-Marktplatz: Fachartikel und Upsell-Anfragen (lib/articles.ts, lib/upsell.ts). */
adminRoutes.get('/fachartikel', async (c) => c.html(adminArticlesPage({ user: c.get('user'), articles: await allArticles(c.env) })))
adminRoutes.get('/fachartikel/neu', (c) => c.html(adminArticleEditPage({ user: c.get('user'), article: null })))
adminRoutes.get('/fachartikel/:id', async (c) => {
  const article = await articleById(c.env, c.req.param('id'))
  if (!article) return c.redirect('/admin/fachartikel', 302)
  return c.html(adminArticleEditPage({ user: c.get('user'), article }))
})
adminRoutes.get('/upsells', async (c) => c.html(adminUpsellsPage({ user: c.get('user'), rows: await allUpsells(c.env) })))

adminRoutes.get('/passwort', (c) =>
  c.html(passwordPage({ user: c.get('user'), min: PASSWORD_MIN })),
)
