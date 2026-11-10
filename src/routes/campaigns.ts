import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import { consumeRateLimit, requireRole } from '../lib/auth'
import {
  clipperForUser,
  clipperHasProject,
  creatorForUser,
  creatorJoined,
  customerForUser,
  distributionCampaigns,
  payTiersOf,
  projectOfCustomer,
  projectsOf,
  projectsOfClipper,
  teamsByProject,
} from '../lib/domain'
import {
  absorbConnectReturn,
  accountsForCreator,
  clipApprovalsFor,
  isManualPlatform,
  publishingReady,
} from '../lib/publisher'
import {
  emptyTotals,
  metricsPausedUntil,
  rowsForDeliverables,
  totalsForClipper,
  totalsForCreatorDistribution,
  totalsForDeliverables,
  totalsForProjects,
  type MetricTotals,
  type MetricTotalsWithCreators,
} from '../lib/metrics'
import {
  numbersOr,
  renderCustomerFolder,
  renderCustomerProject,
  renderCustomerProjects,
  throttledConnectFlash,
} from './app'
import { clipCounts, renderWorkProject, renderWorkUpload, workPreview } from './work'
import { campaignThumbs } from '../lib/thumbs'
import { CREATOR_CAMPAIGN_AREA } from '../views/app'
import { CREATOR_WORK_AREA } from '../views/work'
import { newCampaignPage } from '../views/collaboration'
import {
  accountsPage,
  assignedListPage,
  distributionCampaignPage,
  distributionListPage,
  overviewPage,
  settingUpPage,
  type AssignedCampaignRow,
  type CreatorProfile,
  type DistributionRow,
} from '../views/campaigns'
import type { Clipper, Creator, Customer } from '../db/schema'
import type { AppEnv, Env } from '../lib/types'

export const campaignRoutes = new Hono<AppEnv>()
campaignRoutes.use('*', requireRole('creator'))

/*
 * Der Kampagnen-Bereich der Creator (/kampagnen) besteht aus zwei Hälften,
 * die es beide schon gibt:
 *
 *   ZUGEORDNETE          /finden, /kampagne/:id, /upload, /vorschau/…
 *   Kampagnen            die Seiten des Clipper-Bereichs (routes/work.ts)
 *                        mit CREATOR_WORK_AREA — über die Zeile in `clippers`.
 *                        Zugeordnet wird nur vom Administrator; offene
 *                        Kampagnen sieht ein Creator nirgends.
 *   EIGENE Kampagnen     /meine, /meine/:id, /ordner/:id
 *                        die Seiten des Kundenbereichs (routes/app.ts) mit
 *                        CREATOR_CAMPAIGN_AREA — über die Zeile in `customers`
 *
 * Eigen sind hier die Übersicht unter / und alles rund um die eigenen
 * Social-Accounts und die Verbreitung fremder Kampagnen:
 *
 *   ÜBERSICHT            / — Preisstaffelung, die aktiven zugeordneten
 *                        Kampagnen (Schneiden und Verbreiten zusammengeführt,
 *                        je Kampagne eine Karte), Kennzahlen als eine Zeile,
 *                        die eigenen Kampagnen und das Profil
 *   MEINE ACCOUNTS       /accounts — einmal verbinden, gilt für alles
 *   VERBREITEN           /verbreiten, /verbreiten/:id — Kunden-Kampagnen,
 *                        die der Administrator ihm zum Verbreiten zugeordnet
 *                        hat; Clips ansehen und mit „Freigeben & posten“ auf
 *                        die eigenen Kanäle
 *
 * Die Knöpfe dieser Seiten sprechen mit /api/creator (routes/creator-api.ts).
 *
 * Jede Route holt zuerst alle drei Zeilen des Creators; fehlt eine, steht
 * statt eines Fehlers die Seite „Dein Kampagnen-Bereich wird gerade
 * eingerichtet“.
 */

interface CreatorArea {
  creator: Creator
  customer: Customer
  clipper: Clipper
}

async function areaOf(c: any): Promise<CreatorArea | null> {
  const userId: string = c.get('user').id
  const [creator, customer, clipper] = await Promise.all([
    creatorForUser(c.env, userId),
    customerForUser(c.env, userId),
    clipperForUser(c.env, userId),
  ])
  return creator && customer && clipper ? { creator, customer, clipper } : null
}

/** Wie viele eigene Kampagnen ein Creator hat — mit einer eigenen entfällt „… zuordnen.“ */
async function ownCampaignCount(env: Env, customerId: string): Promise<number> {
  const [row] = await getDb(env)
    .select({ n: sql<number>`count(*)` })
    .from(schema.projects)
    .where(eq(schema.projects.customerId, customerId))
  return Number(row?.n ?? 0)
}

/* ------------------------------------------------------------- Übersicht */

/**
 * Alle Kampagnen, die NIKKI MEDIA diesem Creator ZUGEWIESEN hat — was er
 * schneidet (`project_workers`) ODER verbreitet (`campaign_creators`).
 * Dieselbe Kampagne kann beides sein und steht dann EINMAL da, mit beiden
 * Rollen. Eigene Kampagnen gehören nicht dazu — die stehen getrennt unter
 * „Meine Kampagnen“.
 */
async function assignedCampaigns(env: Env, area: CreatorArea) {
  const [taken, distribute, pausedDistribution] = await Promise.all([
    projectsOfClipper(env, area.clipper.id),
    distributionCampaigns(env, area.creator.id),
    joinedInactiveCampaigns(env, area.creator.id),
  ])

  const assigned = new Map<string, AssignedCampaignRow>()
  for (const p of taken) {
    assigned.set(p.id, {
      id: p.id,
      name: p.name,
      status: p.status,
      cuts: true,
      distributes: false,
      files: 0,
      links: 0,
      delivered: 0,
      readyClips: 0,
    })
  }
  for (const d of [...distribute.map((d) => ({ ...d, status: 'aktiv' })), ...pausedDistribution]) {
    const known = assigned.get(d.id)
    if (known) {
      known.distributes = true
      known.readyClips = d.clips
    } else {
      assigned.set(d.id, {
        id: d.id,
        name: d.name,
        status: d.status,
        cuts: false,
        distributes: true,
        files: 0,
        links: 0,
        delivered: 0,
        readyClips: d.clips,
      })
    }
  }
  const rows = [...assigned.values()]
  const cutIds = rows.filter((r) => r.cuts).map((r) => r.id)
  // Wer nur verbreitet, sieht kein Rohmaterial — auch nicht im Thumbnail.
  const distOnlyIds = rows.filter((r) => !r.cuts).map((r) => r.id)

  const [material, distribution, clipReach, fullThumbs, limitedThumbs, delivered] = await Promise.all([
    materialCounts(env, cutIds),
    numbersOr(totalsForCreatorDistribution(env, area.creator.id), noDistribution()),
    numbersOr(totalsForClipper(env, area.clipper.id), noDistribution()),
    campaignThumbs(env, cutIds),
    campaignThumbs(env, distOnlyIds, { full: false }),
    clipCounts(env, area.clipper.id, cutIds),
  ])

  for (const r of rows) {
    if (r.cuts) Object.assign(r, material.get(r.id) ?? { files: 0, links: 0 }, { delivered: delivered.get(r.id) ?? 0 })
    r.thumb = r.cuts ? fullThumbs.get(r.id) : limitedThumbs.get(r.id)
    r.cutMetrics = r.cuts ? clipReach.perProject.get(r.id) : undefined
    r.distMetrics = r.distributes ? distribution.perProject.get(r.id) : undefined
  }
  return { rows, taken, distribute, distribution, clipReach }
}

campaignRoutes.get('/', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const env = c.env
  const user = c.get('user')

  const [own, assigned, accounts, tiers] = await Promise.all([
    projectsOf(env, area.customer.id),
    assignedCampaigns(env, area),
    accountsForCreator(env, area.creator.id),
    payTiersOf(env, user.id),
  ])
  const { rows, taken, distribute, distribution, clipReach } = assigned

  // Die eigenen Kampagnen kommen ältestes zuerst; die Übersicht zeigt die neuesten.
  const latestOwn = own.slice(-OWN_SHOWN).reverse()
  const latestOwnIds = latestOwn.map((p) => p.id)

  // Die Zahlen der eigenen Kampagnen über ALLE, nicht nur die gezeigten:
  // eine gruppierte Abfrage liefert die Summe je Kampagne, die Karten nehmen
  // sich daraus ihre.
  const [material, ownMetrics, pausedUntil, teams, ownThumbs] = await Promise.all([
    materialCounts(env, latestOwnIds),
    numbersOr(totalsForProjects(env, own.map((p) => p.id)), new Map()),
    numbersOr(metricsPausedUntil(env), null),
    teamsByProject(env, latestOwnIds),
    campaignThumbs(env, latestOwnIds),
  ])
  const counted = (id: string) => material.get(id) ?? { files: 0, links: 0 }

  return c.html(
    overviewPage({
      user,
      profile: profileOf(area.creator),
      tiers,
      active: rows.filter((r) => r.status === 'aktiv'),
      inactive: rows.filter((r) => r.status !== 'aktiv'),
      counts: {
        own: own.length,
        taken: taken.length,
        distribute: distribute.length,
      },
      accounts: accounts.length,
      own: latestOwn.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        taken: teams.get(p.id)?.some((m) => m.cuts) ?? false,
        status: p.status,
        ...counted(p.id),
        thumb: ownThumbs.get(p.id),
        metrics: ownMetrics.get(p.id),
      })),
      metrics: {
        own: sumWithCreators([...ownMetrics.values()]),
        clips: clipReach.posts > 0 ? clipReach : undefined,
        distribution: distribution.posts > 0 ? distribution : undefined,
        pausedUntil,
      },
    }),
  )
})

/** So viele eigene Kampagnen zeigt die Übersicht — die neuesten; alle stehen unter „Meine Kampagnen“. */
const OWN_SHOWN = 4

/* ------------------------------------------------ Zugeordnete Kampagnen */

campaignRoutes.get('/finden', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  // Alles Zugewiesene — Schneiden UND Verbreiten —, ausdrücklich getrennt von
  // den eigenen Kampagnen unter „Meine Kampagnen“.
  const [{ rows }, own, tiers] = await Promise.all([
    assignedCampaigns(c.env, area),
    ownCampaignCount(c.env, area.customer.id),
    payTiersOf(c.env, c.get('user').id),
  ])
  return c.html(
    assignedListPage({
      user: c.get('user'),
      tiers,
      active: rows.filter((r) => r.status === 'aktiv'),
      inactive: rows.filter((r) => r.status !== 'aktiv'),
      ownCount: own,
      seeking: profileOf(area.creator).goal !== 'haben',
    }),
  )
})

/** Vorschaubilder für Rohmaterial und eigene Clips — dieselbe Prüfung wie im Clipper-Bereich. */
campaignRoutes.get('/vorschau/:art/:id', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.text('Nicht gefunden', 404)
  return workPreview(c, area.clipper, c.req.param('art'), c.req.param('id'))
})

/*
 * Eine Kampagne hat für den Creator je nach Rolle eine von zwei Adressen:
 * /kampagne/:id, wenn sie ihm zugeordnet ist, /meine/:id, wenn sie ihm
 * gehört. Landet er unter der jeweils anderen (alter Link, Mail, Lesezeichen),
 * geht es weiter an die richtige statt auf 404.
 */
campaignRoutes.get('/kampagne/:id', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const id = c.req.param('id')
  if (await projectOfCustomer(c.env, area.customer.id, id)) {
    return c.redirect(CREATOR_CAMPAIGN_AREA.projectHref(id), 302)
  }
  return renderWorkProject(c, CREATOR_WORK_AREA, area.clipper, id)
})

campaignRoutes.get('/upload', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  return renderWorkUpload(c, CREATOR_WORK_AREA, area.clipper)
})

/* ------------------------------------------------------- Eigene Kampagnen */

campaignRoutes.get('/meine', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  return renderCustomerProjects(c, CREATOR_CAMPAIGN_AREA, area.customer)
})

/** „Neue Kampagne“: dasselbe Formular wie bei Agentur und Kunde (views/collaboration.ts). */
campaignRoutes.get('/neu', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  return c.html(newCampaignPage({ user: c.get('user'), area: 'creator' }))
})

campaignRoutes.get('/meine/:id', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const id = c.req.param('id')
  if (
    (await clipperHasProject(c.env, area.clipper.id, id)) &&
    !(await projectOfCustomer(c.env, area.customer.id, id))
  ) {
    return c.redirect(CREATOR_WORK_AREA.projectHref(id), 302)
  }
  return renderCustomerProject(c, CREATOR_CAMPAIGN_AREA, area.customer, id)
})

campaignRoutes.get('/ordner/:id', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  return renderCustomerFolder(c, CREATOR_CAMPAIGN_AREA, area.customer, c.req.param('id'))
})

/* --------------------------------------------------------- Meine Accounts */

/**
 * Die verbundenen Accounts — und zugleich die Rückkehradresse aus dem
 * Verbinden. Der Anbieter hängt `connected`, `profileId`, `accountId` und
 * `username` an (bei einem Abbruch `error` und `error_message`).
 *
 * Erwartet wird ausdrücklich DIESER Creator als Besitzer: der Steckplatz
 * muss ihm gehören und der Account wird beim Anbieter gegengeprüft (siehe
 * `absorbConnectReturn`). Eine von Hand gebaute Adresse mit fremden IDs
 * bringt so keinen fremden Account in seine Liste.
 */
campaignRoutes.get('/accounts', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const env = c.env

  // Gedrosselt wie auf der Projektseite der Kunden (siehe `publishingFor` in
  // routes/app.ts): jede Rückkehr kostet einen Aufruf beim Anbieter, dessen
  // Ratenbegrenzung für das ganze Team gilt.
  const returning = Boolean(c.req.query('connected') || c.req.query('error'))
  const throttled =
    returning && !(await consumeRateLimit(env, `connect-return:${c.get('user').id}`, 10, 600))
  const connect = throttled
    ? throttledConnectFlash(c)
    : await absorbConnectReturn(
        env,
        {
          connected: c.req.query('connected'),
          accountId: c.req.query('accountId'),
          profileId: c.req.query('profileId'),
          username: c.req.query('username'),
          error: c.req.query('error'),
          errorMessage: c.req.query('error_message'),
        },
        { creatorId: area.creator.id },
        'de',
      )
  // Nacharbeit drüben (etwa eine Dublette wieder trennen) läuft weiter, ohne
  // die Seite aufzuhalten — aber nur mit waitUntil wird sie nicht abgeräumt.
  if (connect?.background) c.executionCtx.waitUntil(connect.background)

  const accounts = await accountsForCreator(env, area.creator.id)
  return c.html(
    accountsPage({
      user: c.get('user'),
      accounts: accounts.map((a) => ({
        id: a.providerAccountId,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
      })),
      profilePlatforms: profileOf(area.creator).platforms,
      flash: connect && { ok: connect.ok, error: connect.error },
      ready: publishingReady(env),
    }),
  )
})

/* ------------------------------------------------------------- Verbreiten */

/** Warum jemand von einer Kampagnenseite auf die Liste zurückgeschickt wird. */
const GONE = 'Diese Kampagne steht nicht (mehr) zur Verbreitung bereit.'

campaignRoutes.get('/verbreiten', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const env = c.env

  const [active, paused, accounts, distribution, pausedUntil, taken, own] = await Promise.all([
    distributionCampaigns(env, area.creator.id),
    joinedInactiveCampaigns(env, area.creator.id),
    accountsForCreator(env, area.creator.id),
    numbersOr(totalsForCreatorDistribution(env, area.creator.id), noDistribution()),
    numbersOr(metricsPausedUntil(env), null),
    projectsOfClipper(env, area.clipper.id),
    ownCampaignCount(env, area.customer.id),
  ])

  // Das Thumbnail ohne Rohmaterial und Links — außer bei Kampagnen, die er
  // auch schneidet: dort sieht er beides ohnehin, und die Karte gleicht der
  // in der Übersicht.
  const list = [...active.map((d) => ({ ...d, status: 'aktiv' })), ...paused]
  const cutting = new Set(taken.map((p) => p.id))
  const [fullThumbs, limitedThumbs] = await Promise.all([
    campaignThumbs(env, list.filter((d) => cutting.has(d.id)).map((d) => d.id)),
    campaignThumbs(env, list.filter((d) => !cutting.has(d.id)).map((d) => d.id), { full: false }),
  ])
  const campaigns: DistributionRow[] = list.map((d) => ({
    ...d,
    metrics: distribution.perProject.get(d.id),
    thumb: (cutting.has(d.id) ? fullThumbs : limitedThumbs).get(d.id),
  }))
  return c.html(
    distributionListPage({
      user: c.get('user'),
      campaigns,
      cutAssignments: taken.length,
      ownCampaigns: own,
      accounts: accounts.length,
      // Wie auf der Kampagnenseite: wer nur selbst postet, bekommt keinen
      // Hinweis „erst nach dem Verbinden“ — freigeben kann er auch so.
      manualPlatforms: profileOf(area.creator).platforms.filter(isManualPlatform),
      notice: c.req.query('hinweis') === 'weg' ? GONE : undefined,
      total: distribution.posts > 0 ? distribution : undefined,
      pausedUntil,
    }),
  )
})

/**
 * Höchstens so viele Clips zeigt eine Kampagnenseite — die neuesten. Jeder
 * Clip ist ein Video-Element; Hunderte davon machten die Seite auf dem
 * Handy unbenutzbar, und freigegeben wird ohnehin, was neu ist.
 */
const MAX_CLIPS = 60

/**
 * Eine Kampagne zum Verbreiten.
 *
 * Nur wem der Administrator sie zugeordnet hat, sieht die fertigen Clips.
 * Alles andere (unbekannt, nicht zugeordnet, nicht freigegeben, Freigabe
 * zurückgenommen) geht mit Hinweis zurück auf die Liste — mit derselben
 * Antwort, damit eine Adresse nicht verrät, ob es die Kampagne gibt. Eine
 * eigene Kampagne geht auf ihre Seite unter „Meine Kampagnen“.
 */
campaignRoutes.get('/verbreiten/:id', async (c) => {
  const area = await areaOf(c)
  if (!area) return c.html(settingUpPage(), 200)
  const env = c.env
  const id = c.req.param('id')

  if (await projectOfCustomer(env, area.customer.id, id)) {
    return c.redirect(CREATOR_CAMPAIGN_AREA.projectHref(id), 302)
  }

  const db = getDb(env)
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      status: schema.projects.status,
      createdAt: schema.projects.createdAt,
      distribution: schema.projects.creatorDistribution,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1)
  if (!project || project.distribution !== 1) return c.redirect('/kampagnen/verbreiten?hinweis=weg', 302)

  const campaign = { id: project.id, name: project.name, status: project.status, createdAt: project.createdAt }
  if (!(await creatorJoined(env, id, area.creator.id))) return c.redirect('/kampagnen/verbreiten?hinweis=weg', 302)

  // Ein Clip mehr als gezeigt — so weiß die Seite, ob es noch ältere gibt.
  const cuts = await clipperHasProject(env, area.clipper.id, id)
  const [clips, accounts, thumbs] = await Promise.all([
    db
      .select({
        id: schema.deliverables.id,
        filename: schema.deliverables.filename,
        caption: schema.deliverables.caption,
        createdAt: schema.deliverables.createdAt,
      })
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.projectId, id), eq(schema.deliverables.uploadStatus, 'complete')))
      .orderBy(desc(schema.deliverables.createdAt))
      .limit(MAX_CLIPS + 1),
    accountsForCreator(env, area.creator.id),
    campaignThumbs(env, [id], { full: cuts }),
  ])
  const shown = clips.slice(0, MAX_CLIPS)
  const shownIds = shown.map((clip) => clip.id)

  // Zahlen nur seiner eigenen Posts (creatorId = er): was über die
  // automatischen Ziele der Kampagne oder über andere Creator lief, gehört
  // dem Kunden bzw. den anderen — samt deren @Accountnamen und Links. Die
  // Summe der Kampagne kommt aus `perProject` und zählt auch die älteren
  // Clips mit, die die Seite nicht mehr zeigt.
  const [approvalList, metricRowsByClip, metricTotalsByClip, distribution, pausedUntil] = await Promise.all([
    clipApprovalsFor(env, shownIds, area.creator.id),
    numbersOr(rowsForDeliverables(env, shownIds, { creatorId: area.creator.id }), new Map()),
    numbersOr(totalsForDeliverables(env, shownIds, { creatorId: area.creator.id }), new Map()),
    numbersOr(totalsForCreatorDistribution(env, area.creator.id), noDistribution()),
    numbersOr(metricsPausedUntil(env), null),
  ])
  const approvals = new Map(approvalList.map((a) => [a.deliverableId, a]))

  return c.html(
    distributionCampaignPage({
      user: c.get('user'),
      campaign,
      clips: shown.map((clip) => {
        const a = approvals.get(clip.id)
        return {
          ...clip,
          approval: a
            ? {
                decidedAt: a.decidedAt,
                publishStatus: a.publishStatus,
                publishTargets: a.publishTargets,
                manualPosts: a.manualPosts,
              }
            : null,
          metrics: { totals: metricTotalsByClip.get(clip.id), rows: metricRowsByClip.get(clip.id) },
        }
      }),
      accounts: accounts.length,
      manualPlatforms: profileOf(area.creator).platforms.filter(isManualPlatform),
      truncated: clips.length > MAX_CLIPS,
      total: distribution.perProject.get(id),
      pausedUntil,
      thumb: thumbs.get(id),
      cuts,
    }),
  )
})

/* ---------------------------------------------------------------- Helfer */

/**
 * Zugeordnete Kampagnen, die pausiert oder beendet sind.
 *
 * `distributionCampaigns` liefert nur aktive. Wer aber zugeordnet ist, soll
 * seine Kampagne nicht aus den Augen verlieren, nur weil sie ruht: auf ihrer
 * Seite steht, was er gepostet hat. Eigene Kampagnen können hier nicht
 * auftauchen; zuordnen lässt `assignDistribution` sie nicht.
 */
async function joinedInactiveCampaigns(env: Env, creatorId: string): Promise<DistributionRow[]> {
  const rows = await getDb(env)
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      createdAt: schema.projects.createdAt,
      status: schema.projects.status,
      joinedAt: schema.campaignCreators.joinedAt,
      clips: sql<number>`(select count(*) from ${schema.deliverables} where ${schema.deliverables.projectId} = ${schema.projects.id} and ${schema.deliverables.uploadStatus} = 'complete')`,
    })
    .from(schema.campaignCreators)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.campaignCreators.projectId))
    .where(
      and(
        eq(schema.campaignCreators.creatorId, creatorId),
        eq(schema.projects.creatorDistribution, 1),
        ne(schema.projects.status, 'aktiv'),
      ),
    )
    .orderBy(desc(schema.campaignCreators.joinedAt))
  return rows.map((r) => ({ ...r, clips: Number(r.clips ?? 0), joined: true }))
}

/**
 * Dateien und Cloud-Links je Kampagne — für die Karten der Übersicht.
 * Gezählt wie in `hasMaterial` (domain.ts): vollständig hochgeladen und
 * nicht im Papierkorb. So passt „Wartet auf Material“ genau zu dem, was eine
 * Kampagne erst sichtbar macht. In Stücken: D1 bindet höchstens 100
 * Parameter, und zugeordnete Kampagnen können viele sein.
 */
async function materialCounts(env: Env, projectIds: string[]) {
  const counts = new Map<string, { files: number; links: number }>()
  for (const id of projectIds) counts.set(id, { files: 0, links: 0 })
  for (let i = 0; i < projectIds.length; i += 90) await countMaterial(env, projectIds.slice(i, i + 90), counts)
  return counts
}

async function countMaterial(env: Env, projectIds: string[], counts: Map<string, { files: number; links: number }>) {
  const db = getDb(env)
  const [files, links] = await Promise.all([
    db
      .select({ projectId: schema.folders.projectId, n: sql<number>`COUNT(*)` })
      .from(schema.rawAssets)
      .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
      .where(
        and(
          inArray(schema.folders.projectId, projectIds),
          eq(schema.rawAssets.uploadStatus, 'complete'),
          isNull(schema.rawAssets.deletedAt),
        ),
      )
      .groupBy(schema.folders.projectId),
    db
      .select({ projectId: schema.projectLinks.projectId, n: sql<number>`COUNT(*)` })
      .from(schema.projectLinks)
      .where(inArray(schema.projectLinks.projectId, projectIds))
      .groupBy(schema.projectLinks.projectId),
  ])

  for (const row of files) {
    const entry = row.projectId ? counts.get(row.projectId) : undefined
    if (entry) entry.files = Number(row.n)
  }
  for (const row of links) {
    const entry = counts.get(row.projectId)
    if (entry) entry.links = Number(row.n)
  }
}

/** Verbreitung ohne Zahlen — was `numbersOr` zeigt, wenn die Abfrage scheitert. */
const noDistribution = () => ({ ...emptyTotals(), perProject: new Map<string, MetricTotals>() })

/**
 * Summe über mehrere Kampagnen samt „davon über Creator“ — für den Block
 * „Deine eigenen Kampagnen“ der Übersicht. `undefined` ohne Zahlen, damit
 * die Kacheln „Noch keine Zahlen“ zeigen statt einer Reihe Nullen.
 */
function sumWithCreators(list: MetricTotalsWithCreators[]): MetricTotalsWithCreators | undefined {
  if (!list.length) return undefined
  const add = (into: MetricTotals, t: MetricTotals) => {
    into.views += t.views
    into.likes += t.likes
    into.comments += t.comments
    into.shares += t.shares
    into.posts += t.posts
    if (t.syncedAt !== null && (into.syncedAt === null || t.syncedAt > into.syncedAt)) into.syncedAt = t.syncedAt
  }
  const out: MetricTotalsWithCreators = { ...emptyTotals(), viaCreators: emptyTotals() }
  for (const t of list) {
    add(out, t)
    add(out.viaCreators, t.viaCreators)
  }
  return out
}

/** JSON aus der Datenbank lesen — ein kaputter Wert darf die Übersicht nicht umwerfen. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Die Angaben aus `creators`, Plattformen und Handles schon als Liste bzw. Objekt. */
function profileOf(creator: Creator): CreatorProfile {
  const platforms = parseJson(creator.platforms)
  const handles = parseJson(creator.handles)
  return {
    goal: creator.goal,
    platforms: Array.isArray(platforms) ? platforms.filter((p): p is string => typeof p === 'string') : [],
    handles:
      handles && typeof handles === 'object' && !Array.isArray(handles)
        ? Object.fromEntries(
            Object.entries(handles as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : {},
    openToAds: creator.openToAds,
    followers: creator.followers,
    viewsTotal: creator.viewsTotal,
    views30d: creator.views30d,
  }
}
