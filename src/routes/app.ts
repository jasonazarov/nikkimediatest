import { openDraft } from '../lib/drafts'
import { Hono } from 'hono'
import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import { consumeRateLimit, requireRole } from '../lib/auth'
import { campaignCreatorCounts, customerForUser, linksOf, ownerCreatorOfProject, projectOfCustomer } from '../lib/domain'
import { presignGet, r2Ready } from '../lib/r2'
import { campaignThumbs, type CampaignThumb } from '../lib/thumbs'
import {
  metricsPausedUntil,
  rowsForDeliverables,
  totalsForDeliverables,
  totalsForProjects,
} from '../lib/metrics'
import {
  absorbConnectReturn,
  accountsForCreator,
  accountsForProject,
  publishingReady,
  type ConnectReturn,
} from '../lib/publisher'
import {
  CUSTOMER_AREA,
  filesPage,
  projectsPage,
  settingsPage,
  videosPage,
  type CustomerArea,
  type PublishingView,
  type VideoCard,
} from '../views/app'
import type { AppEnv } from '../lib/types'
import { newCampaignPage } from '../views/collaboration'
import type { Customer, Folder, Project } from '../db/schema'

export const appRoutes = new Hono<AppEnv>()
appRoutes.use('*', requireRole('customer'))

const TRASH_DAYS = 30

/**
 * Zahlen dürfen eine Seite nie umwerfen.
 *
 * Die Zahlen aus Zernio sind eine Beigabe zu jedem Dashboard, nicht sein
 * Kern. Scheitert ihre Abfrage — etwa weil Migration 0015 (`post_metrics`,
 * `app_state`, `metrics_sync`) auf der Datenbank noch fehlt oder D1 kurz
 * hakt —, steht dort „Noch keine Zahlen“ und die Seite lädt trotzdem. Ohne
 * das lieferte jeder Bereich eine 500, nur weil eine Beigabe fehlt. Der
 * Fehler geht ins Log, damit er nicht still bleibt.
 *
 * Gilt für alle vier Bereiche — work.ts, campaigns.ts und admin.ts nehmen
 * ihn von hier.
 */
export function numbersOr<T>(query: Promise<T>, fallback: T): Promise<T> {
  return query.catch((err) => {
    console.error('[metrics] Zahlen nicht geladen, die Seite zeigt keine', err)
    return fallback
  })
}

/**
 * Thumbnails dürfen eine Seite ebenso wenig umwerfen wie Zahlen: Scheitert
 * ihre Abfrage (etwa weil Migration 0018 mit `projects.thumb_key` noch
 * fehlt), zeigen die Karten die Initialen-Fläche und die Seite lädt.
 */
function thumbsOr(query: Promise<Map<string, CampaignThumb>>): Promise<Map<string, CampaignThumb>> {
  return query.catch((err) => {
    console.error('[thumbs] Thumbnails nicht geladen, die Seite zeigt Initialen', err)
    return new Map()
  })
}

/* ----------------------------------------------------- 1 — Meine Kampagnen

   Die oberste Ebene des Kundenbereichs ist die Kampagne (technisch ein
   Projekt, `projects`), nicht der Ordner. Eine Kampagne ist zugleich der Job
   für die Clipper: Sobald darin Material liegt — eine hochgeladene Datei oder
   ein Cloud-Link —, erfährt es der Administrator und stellt ihr Team
   zusammen (Clipper und Creator, beliebig viele).

   Die drei Lader unten (Liste, Kampagne, Ordner) sind exportiert: Die
   eigenen Kampagnen eines Creators sind technisch dieselben Projekte in
   seinem Arbeitsbereich (`customers`) und laufen durch denselben Code — nur
   mit CREATOR_CAMPAIGN_AREA statt CUSTOMER_AREA. Den Arbeitsbereich ermittelt
   jeweils die Route; die Lader prüfen nur noch, ob Kampagne bzw. Ordner zu
   ihm gehören.
   -------------------------------------------------------------------------- */

/**
 * Fertige Clips je Kampagne des Arbeitsbereichs — für die Kennzahlen. Nur
 * im Kundenbereich (`area.videosHref`): Ein Creator sieht die fertigen Clips
 * seiner eigenen Kampagnen nicht.
 */
async function clipCounts(env: AppEnv['Bindings'], customerId: string): Promise<Map<string, number>> {
  const rows = await getDb(env)
    .select({ projectId: schema.deliverables.projectId, n: sql<number>`COUNT(*)` })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .where(and(eq(schema.projects.customerId, customerId), eq(schema.deliverables.uploadStatus, 'complete')))
    .groupBy(schema.deliverables.projectId)
  return new Map(rows.map((r) => [r.projectId, Number(r.n)]))
}

/** Liste aller Kampagnen eines Arbeitsbereichs. */
export async function renderCustomerProjects(c: any, area: CustomerArea, customer: Customer): Promise<Response> {
  const user = c.get('user')

  const rows = await getDb(c.env)
    .select({
      project: schema.projects,
      folderCount: sql<number>`COUNT(DISTINCT ${schema.folders.id})`,
      fileCount: sql<number>`COUNT(${schema.rawAssets.id})`,
      bytes: sql<number>`COALESCE(SUM(${schema.rawAssets.bytes}), 0)`,
      // Eigene Unterabfrage statt eines weiteren JOINs: der würde jede
      // Datei-Zeile mit jedem Link multiplizieren und die Zählung verfälschen.
      linkCount: sql<number>`(SELECT COUNT(*) FROM ${schema.projectLinks} WHERE ${schema.projectLinks.projectId} = ${schema.projects.id})`,
      // Ebenso: die Accounts am Projekt — für die Lösch-Abfrage, die sagt,
      // dass sie mit dem Projekt getrennt werden. Gezählt ohne Dubletten-Sieb:
      // getrennt wird beim Anbieter jede einzelne Zeile.
      accountCount: sql<number>`(SELECT COUNT(*) FROM ${schema.publishAccounts} WHERE ${schema.publishAccounts.projectId} = ${schema.projects.id})`,
    })
    .from(schema.projects)
    .leftJoin(
      schema.folders,
      and(eq(schema.folders.projectId, schema.projects.id), isNull(schema.folders.deletedAt)),
    )
    .leftJoin(
      schema.rawAssets,
      and(
        eq(schema.rawAssets.folderId, schema.folders.id),
        isNull(schema.rawAssets.deletedAt),
        eq(schema.rawAssets.uploadStatus, 'complete'),
      ),
    )
    .where(eq(schema.projects.customerId, customer.id))
    .groupBy(schema.projects.id)
    // Wie bei YouTube: die neueste zuerst — beendete Kampagnen ans Ende.
    .orderBy(sql`${schema.projects.status} = 'beendet'`, desc(schema.projects.createdAt))

  // Zahlen aus Zernio: EINE gruppierte Abfrage für alle Kampagnen der Liste,
  // nicht eine je Karte. Gezählt wird jeder Post — die automatischen Ziele
  // und die Verbreitung über Creator; den Anteil darin zeigt die Karte extra.
  // Thumbnails ebenso gebündelt, und voll: es sind die eigenen Kampagnen,
  // Rohmaterial und Cloud-Links dürfen ins Bild.
  const ids = rows.map((r) => r.project.id)
  const [metrics, pausedUntil, thumbs, clips] = await Promise.all([
    numbersOr(totalsForProjects(c.env, ids), new Map()),
    numbersOr(metricsPausedUntil(c.env), null),
    thumbsOr(campaignThumbs(c.env, ids, { full: true })),
    area.videosHref ? clipCounts(c.env, customer.id) : Promise.resolve(null),
  ])

  return c.html(
    projectsPage({
      user,
      area,
      projects: rows.map((r) => ({
        ...r.project,
        folderCount: Number(r.folderCount),
        fileCount: Number(r.fileCount),
        bytes: Number(r.bytes),
        linkCount: Number(r.linkCount),
        accountCount: Number(r.accountCount),
        metrics: metrics.get(r.project.id),
        thumb: thumbs.get(r.project.id),
      })),
      metricsPausedUntil: pausedUntil,
      clipCount: clips ? [...clips.values()].reduce((s, n) => s + n, 0) : undefined,
    }),
  )
}

appRoutes.get('/', async (c) => {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return c.redirect('/app/einstellungen', 302)
  return renderCustomerProjects(c, CUSTOMER_AREA, customer)
})

/** „Neue Kampagne“: dasselbe Formular wie bei den Agenturen (views/collaboration.ts,
 *  Vorgabe des Auftraggebers, November 2026): Name, Bereich, Plattformen, Views,
 *  Budget, Übersicht, verbindlicher Auftrag. */
appRoutes.get('/neu', async (c) => {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return c.redirect('/app/einstellungen', 302)
  // Angefangener Entwurf steht schon drin (lib/drafts.ts), z. B. nach der Erinnerungsmail.
  const draft = await openDraft(c.env, c.get('user').id).catch(() => null)
  return c.html(
    newCampaignPage({
      user: c.get('user'),
      area: 'customer',
      prefill: { name: draft?.name, views: draft?.views },
      autosave: true,
    }),
  )
})

/* ------------------------------------ 2 — Ordner innerhalb einer Kampagne */

/** Ordnerkette von der Kampagnenseite bis zum aktuellen Ordner. */
async function breadcrumbFor(env: AppEnv['Bindings'], customerId: string, folder: Folder | null) {
  const chain: Folder[] = []
  let current = folder
  const db = getDb(env)
  while (current) {
    chain.unshift(current)
    if (!current.parentId) break
    const [parent] = await db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, current.parentId), eq(schema.folders.customerId, customerId)))
      .limit(1)
    current = parent ?? null
    if (chain.length > 12) break
  }
  return chain
}

async function renderFiles(c: any, area: CustomerArea, customer: Customer, project: Project, folder: Folder | null) {
  const user = c.get('user')
  const db = getDb(c.env)
  const folderId = folder?.id ?? null

  // Unterordner samt Anzahl und Größe der enthaltenen Dateien.
  const folderRows = await db
    .select({
      folder: schema.folders,
      fileCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.rawAssets.id} IS NOT NULL AND ${schema.rawAssets.deletedAt} IS NULL THEN 1 ELSE 0 END), 0)`,
      bytes: sql<number>`COALESCE(SUM(CASE WHEN ${schema.rawAssets.deletedAt} IS NULL THEN ${schema.rawAssets.bytes} ELSE 0 END), 0)`,
    })
    .from(schema.folders)
    .leftJoin(schema.rawAssets, eq(schema.rawAssets.folderId, schema.folders.id))
    .where(
      and(
        eq(schema.folders.projectId, project.id),
        isNull(schema.folders.deletedAt),
        folderId ? eq(schema.folders.parentId, folderId) : isNull(schema.folders.parentId),
      ),
    )
    .groupBy(schema.folders.id)
    .orderBy(schema.folders.name)

  const assets = folder
    ? await db
        .select()
        .from(schema.rawAssets)
        .where(
          and(
            eq(schema.rawAssets.folderId, folder.id),
            isNull(schema.rawAssets.deletedAt),
            eq(schema.rawAssets.uploadStatus, 'complete'),
          ),
        )
        .orderBy(desc(schema.rawAssets.createdAt))
    : []

  // Der Papierkorb zeigt nur, was zu dieser Kampagne gehört.
  const cutoff = Math.floor(Date.now() / 1000) - TRASH_DAYS * 86400
  const trashFolders = await db
    .select()
    .from(schema.folders)
    .where(
      and(
        eq(schema.folders.projectId, project.id),
        isNotNull(schema.folders.deletedAt),
        sql`${schema.folders.deletedAt} > ${cutoff}`,
      ),
    )
    .orderBy(desc(schema.folders.deletedAt))
    .limit(50)

  const trashAssets = await db
    .select({ asset: schema.rawAssets })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(
      and(
        eq(schema.folders.projectId, project.id),
        isNotNull(schema.rawAssets.deletedAt),
        isNull(schema.folders.deletedAt),
        sql`${schema.rawAssets.deletedAt} > ${cutoff}`,
      ),
    )
    .orderBy(desc(schema.rawAssets.deletedAt))
    .limit(50)

  // Cloud-Links hängen an der Kampagne, nicht an einem Ordner — sie stehen
  // deshalb nur auf der Kampagnenseite. Dasselbe gilt für Accounts,
  // Verbreitung, Thumbnail und den Bestand der ganzen Kampagne.
  const links = folder ? [] : await linksOf(c.env, project.id)
  const publishing = folder ? undefined : await publishingFor(c, area, project)
  const metrics = folder ? undefined : await projectMetrics(c.env, project.id)
  const thumb = folder
    ? undefined
    : (await thumbsOr(campaignThumbs(c.env, [project.id], { full: true }))).get(project.id)
  const stats = folder ? undefined : await projectStats(c.env, area, project.id)

  /*
   * Vorschaubilder der Dateien: kleine JPEGs (`thumb_key`, beim Hochladen im
   * Browser erzeugt), nur für die Dateien dieses einen Ordners signiert.
   * Ohne Bild oder ohne Speicher zeigt die Kachel ein Symbol.
   */
  const assetThumbs: Record<string, string> = {}
  if (r2Ready(c.env)) {
    await Promise.all(
      assets
        .filter((a) => a.thumbKey)
        .map(async (a) => {
          assetThumbs[a.id] = await presignGet(c.env, a.thumbKey!)
        }),
    )
  }

  return c.html(
    filesPage({
      area,
      user,
      customer,
      project,
      folder,
      breadcrumb: await breadcrumbFor(c.env, customer.id, folder),
      folders: folderRows.map((r) => ({ ...r.folder, fileCount: Number(r.fileCount), bytes: Number(r.bytes) })),
      assets,
      assetThumbs,
      links,
      trash: { folders: trashFolders, assets: trashAssets.map((r) => r.asset) },
      showTrash: true,
      publishing,
      metrics,
      thumb,
      stats,
    }),
  )
}

/**
 * Bestand der ganzen Kampagne für die Kennzahlen im Kopf — über alle Ordner,
 * auch Unterordner (die Ordnerkacheln zählen nur, was direkt darin liegt).
 * Dieselbe Zählung wie die Karte in der Liste.
 */
async function projectStats(env: AppEnv['Bindings'], area: CustomerArea, projectId: string) {
  const [row] = await getDb(env)
    .select({
      folders: sql<number>`COUNT(DISTINCT ${schema.folders.id})`,
      files: sql<number>`COUNT(${schema.rawAssets.id})`,
      bytes: sql<number>`COALESCE(SUM(${schema.rawAssets.bytes}), 0)`,
    })
    .from(schema.folders)
    .leftJoin(
      schema.rawAssets,
      and(
        eq(schema.rawAssets.folderId, schema.folders.id),
        isNull(schema.rawAssets.deletedAt),
        eq(schema.rawAssets.uploadStatus, 'complete'),
      ),
    )
    .where(and(eq(schema.folders.projectId, projectId), isNull(schema.folders.deletedAt)))
  const [clipRow] = area.videosHref
    ? await getDb(env)
        .select({ n: sql<number>`COUNT(*)` })
        .from(schema.deliverables)
        .where(and(eq(schema.deliverables.projectId, projectId), eq(schema.deliverables.uploadStatus, 'complete')))
    : []
  const clips = area.videosHref ? Number(clipRow?.n ?? 0) : undefined
  return {
    folders: Number(row?.folders ?? 0),
    files: Number(row?.files ?? 0),
    bytes: Number(row?.bytes ?? 0),
    clips,
  }
}

/**
 * Die Summen einer Kampagne für ihre Seite — alle Posts, samt dem Anteil
 * über Creator. Kunde und Creator (eigene Kampagne) sehen dasselbe: es ist
 * ihre Kampagne, und eine Summe verrät keinen einzelnen Account.
 */
async function projectMetrics(env: AppEnv['Bindings'], projectId: string) {
  const [totals, pausedUntil] = await Promise.all([
    numbersOr(totalsForProjects(env, [projectId]), new Map()),
    numbersOr(metricsPausedUntil(env), null),
  ])
  return { totals: totals.get(projectId), pausedUntil }
}

/**
 * Veröffentlichung auf der Kampagnenseite: verbundene Accounts und der
 * Schalter „Verbreitung über Creator“.
 *
 * Kampagnen eines Kunden verbinden ihre eigenen Accounts. Hierher kehrt der
 * Kunde auch aus dem Verbinden zurück — der Anbieter hängt `connected`,
 * `profileId`, `accountId` und `username` an die Adresse der Kampagnenseite
 * (oder `error`, wenn abgebrochen wurde). Die Rückkehr wird ausgewertet,
 * BEVOR die Accounts gelesen werden, damit der neue Account sofort in der
 * Liste steht. `{ projectId }` ist dabei die Sperre: Der Steckplatz muss zu
 * genau dieser Kampagne gehören, und dass die Kampagne dem eingeloggten Kunden
 * gehört, hat der Aufrufer schon geprüft. Eine von Hand zusammengebaute
 * Adresse mit einem fremden Steckplatz wird abgewiesen.
 *
 * Eigene Kampagnen eines Creators zeigen dessen Accounts — die bekommen
 * jeden fertigen Clip automatisch (`autoTargetAccounts`). Verbunden werden
 * sie unter /kampagnen/accounts, nicht hier.
 */
async function publishingFor(c: any, area: CustomerArea, project: Project): Promise<PublishingView> {
  const env = c.env

  let flash: PublishingView['flash']
  let accounts: Awaited<ReturnType<typeof accountsForProject>>
  if (area.accounts === 'project') {
    /*
     * Gedrosselt: jede Rückkehr fragt beim Anbieter nach (`listAccounts`), und
     * die Adresse lässt sich von Hand nachbauen und beliebig oft laden. Dessen
     * Ratenbegrenzung gilt für das ganze Team — ohne Bremse ließe sich per
     * Neuladen die Veröffentlichung aller Kunden ausbremsen. Zehn Rückkehrer
     * in zehn Minuten reichen für jeden echten Gebrauch; einen echten Account
     * trägt danach der Webhook nach.
     */
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
          { projectId: project.id },
          'de',
        )
    // Dublette drüben trennen, Account-Gruppe nachziehen — die Seite wartet
    // nicht darauf, der Worker darf es aber auch nicht mittendrin abräumen.
    if (connect?.background) c.executionCtx.waitUntil(connect.background)
    flash = connect && { ok: connect.ok, error: connect.error }
    accounts = await accountsForProject(env, project.id)
  } else {
    const creatorId = await ownerCreatorOfProject(env, project.id)
    accounts = creatorId ? await accountsForCreator(env, creatorId) : []
  }

  const creators = await campaignCreatorCounts(env, [project.id])
  return {
    accounts: accounts.map((a) => ({
      id: a.providerAccountId,
      platform: a.platform,
      username: a.username,
      displayName: a.displayName,
    })),
    ready: publishingReady(env),
    flash,
    distribution: project.creatorDistribution === 1,
    creators: creators.get(project.id) ?? 0,
  }
}

/**
 * Rückmeldung für eine gedrosselte Rückkehr aus dem Verbinden — für die
 * Projektseite der Kunden und „Meine Accounts“ der Creator
 * (routes/campaigns.ts).
 *
 * Gedrosselt wird, BEVOR `absorbConnectReturn` läuft; die Meldung muss also
 * selbst aus der Adresse lesen, was passiert ist. Ein Abbruch beim Anbieter
 * (`error`) heißt: es gibt keinen Account, der „gleich erscheint“ — ihm das
 * zu versprechen, ließe ihn warten und neu laden, ohne dass je etwas kommt.
 * Nur eine erfolgreiche Verbindung (`connected`) trägt danach der Webhook
 * nach. `code_already_redeemed` ist kein Abbruch, sondern eine schon
 * übernommene Verbindung (siehe `absorbConnectReturn`) — dort stimmt der
 * Hinweis aufs Erscheinen ebenfalls.
 */
export function throttledConnectFlash(c: any): ConnectReturn {
  const error: string | undefined = c.req.query('error')
  if (error && error !== 'code_already_redeemed') {
    const why = String(c.req.query('error_message') || error).slice(0, 200)
    return { error: `Verbindung abgebrochen: ${why}: starte sie bei Bedarf in ein paar Minuten noch einmal.` }
  }
  return {
    error:
      'Zu viele Verbindungen in kurzer Zeit. Der Account erscheint, sobald der Anbieter ihn bestätigt, lade die Seite gleich neu.',
  }
}

/** Kampagnenseite: Thumbnail, Cloud-Links und oberste Ordner. 404, wenn die Kampagne nicht zum Arbeitsbereich gehört. */
export async function renderCustomerProject(
  c: any,
  area: CustomerArea,
  customer: Customer,
  projectId: string,
): Promise<Response> {
  const project = await projectOfCustomer(c.env, customer.id, projectId)
  if (!project) return c.notFound()
  return renderFiles(c, area, customer, project, null)
}

/** Ein Ordner samt Dateien. 404, wenn er gelöscht ist oder nicht zum Arbeitsbereich gehört. */
export async function renderCustomerFolder(
  c: any,
  area: CustomerArea,
  customer: Customer,
  folderId: string,
): Promise<Response> {
  const [folder] = await getDb(c.env)
    .select()
    .from(schema.folders)
    .where(
      and(
        eq(schema.folders.id, folderId),
        eq(schema.folders.customerId, customer.id),
        isNull(schema.folders.deletedAt),
      ),
    )
    .limit(1)
  if (!folder?.projectId) return c.notFound()

  const project = await projectOfCustomer(c.env, customer.id, folder.projectId)
  if (!project) return c.notFound()
  return renderFiles(c, area, customer, project, folder)
}

appRoutes.get('/projekt/:id', async (c) => {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return c.redirect('/app/einstellungen', 302)
  return renderCustomerProject(c, CUSTOMER_AREA, customer, c.req.param('id'))
})

appRoutes.get('/ordner/:id', async (c) => {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return c.redirect('/app/einstellungen', 302)
  return renderCustomerFolder(c, CUSTOMER_AREA, customer, c.req.param('id'))
})

appRoutes.get('/videos', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.redirect('/app/einstellungen', 302)

  const rows = await getDb(c.env)
    .select({ d: schema.deliverables, projectName: schema.projects.name })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .where(
      and(eq(schema.projects.customerId, customer.id), eq(schema.deliverables.uploadStatus, 'complete')),
    )
    .orderBy(desc(schema.deliverables.createdAt))
    .limit(200)

  /*
   * Zahlen je Clip: Summe und Zeilen je Account, über ALLE Posts — die
   * automatischen Ziele der Kampagne und die Verbreitung über Creator (in der
   * Tabelle markiert). Es sind die Clips des Kunden, er darf jeden Beitrag
   * sehen, auch den auf dem Kanal eines Creators. Gruppiert über alle Clips
   * der Seite statt einer Abfrage je Clip.
   */
  const ids = rows.map((r) => r.d.id)
  const ready = r2Ready(c.env)
  const [totals, accountRows, pausedUntil, posters] = await Promise.all([
    numbersOr(totalsForDeliverables(c.env, ids), new Map()),
    numbersOr(rowsForDeliverables(c.env, ids), new Map()),
    numbersOr(metricsPausedUntil(c.env), null),
    /*
     * Titelbild je Kachel: das kleine Vorschaubild des Clips (`thumbnail_key`).
     * Nur wo es keins gibt, wird der Clip selbst signiert und sein erstes
     * Frame gezeigt — sonst fasste der Browser für jede Kachel ein Video an.
     */
    Promise.all(
      rows.map(async (r) => {
        if (!ready) return { poster: '', preview: '' }
        if (r.d.thumbnailKey) return { poster: await presignGet(c.env, r.d.thumbnailKey), preview: '' }
        return { poster: '', preview: await presignGet(c.env, r.d.r2Key) }
      }),
    ),
  ])

  const videos: VideoCard[] = rows.map((r, i) => ({
    id: r.d.id,
    filename: r.d.filename,
    caption: r.d.caption,
    projectName: r.projectName,
    createdAt: r.d.createdAt,
    seenByCustomer: r.d.seenByCustomer,
    posterUrl: posters[i].poster,
    previewUrl: posters[i].preview,
    publishStatus: r.d.publishStatus,
    metrics: totals.get(r.d.id),
    metricRows: accountRows.get(r.d.id),
  }))

  return c.html(videosPage({ user, videos, metricsPausedUntil: pausedUntil }))
})

appRoutes.get('/einstellungen', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) {
    return c.html(
      `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kein Kundenkonto</title>
       <link rel="stylesheet" href="/assets/tw.css"></head>
       <body class="grid min-h-screen place-items-center bg-slate-50 p-6 text-center font-sans">
         <div><h1 class="text-xl font-bold">Kein Kundenkonto hinterlegt</h1>
         <p class="mt-2 text-slate-600">Bitte wende dich an Nikki Media.</p></div></body></html>`,
      200,
    )
  }
  return c.html(
    settingsPage({ user, customer, limitBytes: Number(c.env.STORAGE_WARN_BYTES || 107374182400) }),
  )
})
