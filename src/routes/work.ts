import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import { requireRole } from '../lib/auth'
import {
  clipperForUser,
  clipperHasProject,
  linksOf,
  payTiersOf,
  projectsOfClipper,
} from '../lib/domain'
import { emptyTotals, metricsPausedUntil, totalsForClipper, totalsForDeliverables } from '../lib/metrics'
import { presignGet, r2Ready } from '../lib/r2'
import { campaignThumbs, signThumb } from '../lib/thumbs'
import { numbersOr } from './app'
import {
  CLIPPER_WORK_AREA,
  projectDetailPage,
  projectsPage,
  uploadPage,
  type UploadRow,
  type WorkArea,
  type WorkProject,
} from '../views/work'
import type { Clipper, User } from '../db/schema'
import type { AppEnv, Env } from '../lib/types'

export const workRoutes = new Hono<AppEnv>()
workRoutes.use('*', requireRole('clipper'))

/*
 * Die Seiten hier sind zweimal in Gebrauch: unter /work für Clipper und
 * unter /kampagnen für Creator — beide auf Deutsch, beide mit „Kampagne“.
 * Die Lader unten kennen deshalb keine feste Adresse — was sich je Rolle
 * unterscheidet, kommt als `WorkArea` herein. Die Routen in dieser Datei
 * sind die Clipper-Seite davon; der Creator-Bereich ruft dieselben Lader
 * mit CREATOR_WORK_AREA auf.
 *
 * Wer keine Zeile in `clippers` hat, sieht `noAccessPage` — das prüft der
 * Aufrufer, die Lader bekommen den Clipper fertig übergeben.
 */

workRoutes.get('/', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.html(noAccessPage(CLIPPER_WORK_AREA), 200)
  return renderWorkHome(c, CLIPPER_WORK_AREA, clipper)
})

workRoutes.get('/projekt/:id', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.html(noAccessPage(CLIPPER_WORK_AREA), 200)
  return renderWorkProject(c, CLIPPER_WORK_AREA, clipper, c.req.param('id'))
})

workRoutes.get('/upload', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.html(noAccessPage(CLIPPER_WORK_AREA), 200)
  return renderWorkUpload(c, CLIPPER_WORK_AREA, clipper)
})

workRoutes.get('/vorschau/:art/:id', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.text('Nicht gefunden', 404)
  return workPreview(c, clipper, c.req.param('art'), c.req.param('id'))
})

/* ------------------------------------------------------------------ Lader */

/**
 * Der Arbeitsbereich zeigt nur die Kampagnen, die der Administrator diesem
 * Clipper zugeordnet hat — als große Karten mit Thumbnail, darüber die
 * Preisstaffelung. Solange ihm nichts zugeordnet ist, steht dort „NIKKI
 * MEDIA wird dir in Kürze eine Kampagne zuordnen.“ Offene Kampagnen
 * erscheinen hier nie, weder welche es gibt noch wie viele.
 *
 * `otherAssignments`: beim Creator die Kampagnen, die er VERBREITET, und
 * seine EIGENEN — hat er eine davon, verschwindet die Zeile ebenso.
 *
 * Eine Kampagne kommt hier ausschließlich mit ihrem Namen vor. Firmenname,
 * Kundenname und Kontaktdaten bleiben draußen.
 *
 * Die Zahlen sind die Reichweite SEINER Clips (`totalsForClipper`): eine
 * gruppierte Abfrage liefert die Summe und die Aufteilung je Kampagne.
 * Was andere in derselben Kampagne geliefert haben, zählt hier nicht mit.
 */
export async function renderWorkHome(
  c: any,
  area: WorkArea,
  clipper: Clipper,
  opts: { otherAssignments?: number } = {},
): Promise<Response> {
  const env: Env = c.env
  const user: User = c.get('user')

  const [mine, reach, pausedUntil, tiers] = await Promise.all([
    projectsOfClipper(env, clipper.id),
    numbersOr(totalsForClipper(env, clipper.id), noReach()),
    numbersOr(metricsPausedUntil(env), null),
    payTiersOf(env, user.id),
  ])

  // Je Kampagne EINE gruppierte Abfrage statt einer je Karte.
  const ids = mine.map((p) => p.id)
  const [material, links, clips, thumbs] = await Promise.all([
    materialStats(env, ids),
    linkCounts(env, ids),
    clipCounts(env, clipper.id, ids),
    campaignThumbs(env, ids),
  ])

  const projects: WorkProject[] = mine.map((p) => {
    const m = material.get(p.id)
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      folders: m?.folders ?? 0,
      files: m?.files ?? 0,
      bytes: m?.bytes ?? 0,
      links: links.get(p.id) ?? 0,
      clips: clips.get(p.id) ?? 0,
      thumb: thumbs.get(p.id),
      metrics: reach.perProject.get(p.id),
    }
  })

  return c.html(
    projectsPage(
      {
        user,
        projects,
        tiers,
        assigned: projects.length > 0 || (opts.otherAssignments ?? 0) > 0,
        reach,
        metricsPausedUntil: pausedUntil,
      },
      area,
    ),
  )
}

/**
 * Eine zugeordnete Kampagne mit Rohmaterial, Cloud-Links und den eigenen
 * fertigen Clips. Wer ihr nicht zugeordnet ist, bekommt 404 — nicht 403,
 * damit nicht einmal die Existenz der Kampagne durchsickert.
 *
 * Dazu die Reichweite seiner Clips in dieser Kampagne — dieselbe Abfrage wie
 * auf der Startseite, daraus der eine Eintrag. Sie läuft über alle seine
 * Kampagnen, bleibt aber eine einzige gruppierte Abfrage.
 */
export async function renderWorkProject(
  c: any,
  area: WorkArea,
  clipper: Clipper,
  projectId: string,
): Promise<Response> {
  const env: Env = c.env
  const user: User = c.get('user')
  if (!(await clipperHasProject(env, clipper.id, projectId))) return c.notFound()

  const db = getDb(env)
  const [project] = await db
    .select({ name: schema.projects.name, status: schema.projects.status })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.notFound()

  const [folders, links, reach, clips, pausedUntil, thumbs, uploads] = await Promise.all([
    db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.projectId, projectId), isNull(schema.folders.deletedAt)))
      .orderBy(schema.folders.name),
    linksOf(env, projectId),
    numbersOr(totalsForClipper(env, clipper.id), noReach()),
    clipsDelivered(env, clipper.id, projectId),
    numbersOr(metricsPausedUntil(env), null),
    campaignThumbs(env, [projectId]),
    uploadsOf(env, clipper.id, { projectId, limit: MAX_CLIPS }),
  ])

  const withFiles = await Promise.all(
    folders.map(async (f) => ({
      id: f.id,
      name: f.name,
      files: (
        await db
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
      ).map((a) => ({ id: a.id, filename: a.filename, bytes: a.bytes, createdAt: a.createdAt, poster: Boolean(a.thumbKey) })),
    })),
  )

  return c.html(
    projectDetailPage(
      {
        user,
        name: project.name,
        projectId,
        status: project.status,
        thumb: thumbs.get(projectId),
        folders: withFiles,
        links,
        clips: uploads,
        reach: { totals: reach.perProject.get(projectId), clips, pausedUntil },
      },
      area,
    ),
  )
}

/**
 * Upload fertiger Clips. `?projekt=<id>` wählt die Kampagne vor — aber nur,
 * wenn es eine der eigenen ist; sonst die erste aktive.
 *
 * Je fertig hochgeladenem Clip seine Reichweite — alle Posts, auch die über
 * Creator: es ist sein Schnitt, egal über welchen Kanal. Eine gruppierte
 * Abfrage für die ganze Liste, nur Summen.
 */
export async function renderWorkUpload(c: any, area: WorkArea, clipper: Clipper): Promise<Response> {
  const env: Env = c.env
  const user: User = c.get('user')
  const projects = await projectsOfClipper(env, clipper.id)
  const requested: string | null = c.req.query('projekt') ?? null
  const selected = projects.some((p) => p.id === requested)
    ? requested
    : ((projects.find((p) => p.status === 'aktiv') ?? projects[0])?.id ?? null)

  const [uploads, thumbs] = await Promise.all([
    projects.length ? uploadsOf(env, clipper.id, { limit: 100 }) : Promise.resolve([] as UploadRow[]),
    campaignThumbs(env, projects.map((p) => p.id)),
  ])
  const pausedUntil = await numbersOr(metricsPausedUntil(env), null)

  return c.html(
    uploadPage(
      {
        user,
        projects: projects.map((p) => ({ ...p, thumb: thumbs.get(p.id) })),
        selectedProjectId: selected,
        uploads,
        metricsPausedUntil: pausedUntil,
      },
      area,
    ),
  )
}

/**
 * Vorschaubilder hinter der Zugriffsprüfung — für die Kacheln der
 * Kampagnenseite und der Uploads:
 *
 *   /vorschau/rohmaterial/:id   Bild einer Rohmaterial-Datei (nur aus
 *                               Kampagnen, denen er zugeordnet ist)
 *   /vorschau/clip/:id          Bild eines EIGENEN fertigen Clips;
 *                               `?video=1` der Clip selbst zum Ansehen
 *
 * Wie /media/kampagne/:id/thumb: eine Weiterleitung auf eine kurz gültige,
 * signierte R2-Adresse — erst, wenn der Browser das Bild wirklich lädt, nicht
 * für jede Kachel beim Rendern. Alles andere (fremd, gelöscht, kein Bild,
 * R2 nicht eingerichtet) ist 404; die Kachel zeigt dann ihre ruhige Fläche.
 */
export async function workPreview(c: any, clipper: Clipper, kind: string, id: string): Promise<Response> {
  const env: Env = c.env
  const gone = () => c.text('Nicht gefunden', 404)
  if (!r2Ready(env)) return gone()
  const db = getDb(env)

  if (kind === 'rohmaterial') {
    const [row] = await db
      .select({ key: schema.rawAssets.thumbKey, projectId: schema.folders.projectId })
      .from(schema.rawAssets)
      .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
      .where(and(eq(schema.rawAssets.id, id), isNull(schema.rawAssets.deletedAt)))
      .limit(1)
    if (!row?.key || !row.projectId || !(await clipperHasProject(env, clipper.id, row.projectId))) return gone()
    c.header('Cache-Control', 'private, max-age=1800')
    return c.redirect(await signThumb(env, row.key), 302)
  }

  if (kind === 'clip') {
    const [row] = await db
      .select({
        key: schema.deliverables.r2Key,
        poster: schema.deliverables.thumbnailKey,
        projectId: schema.deliverables.projectId,
        status: schema.deliverables.uploadStatus,
      })
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.id, id), eq(schema.deliverables.clipperId, clipper.id)))
      .limit(1)
    if (!row || row.status !== 'complete' || !(await clipperHasProject(env, clipper.id, row.projectId))) return gone()
    if (c.req.query('video') === '1') return c.redirect(await presignGet(env, row.key, undefined, 3600), 302)
    if (!row.poster) return gone()
    c.header('Cache-Control', 'private, max-age=1800')
    return c.redirect(await signThumb(env, row.poster), 302)
  }

  return gone()
}

/** Höchstens so viele eigene Clips zeigt eine Kampagnenseite — die neuesten. */
const MAX_CLIPS = 60

/**
 * Seine Uploads samt Reichweite, neueste zuerst — für die Upload-Seite (alle
 * Kampagnen) und die Kampagnenseite (`projectId`).
 *
 * Nur Kampagnen, die er noch hat — über einen Join auf `project_workers`
 * statt `inArray` über ihre IDs: D1 bindet höchstens 100 Parameter, und ab
 * rund hundert Kampagnen brach die Seite sonst mit 500 ab.
 */
async function uploadsOf(
  env: Env,
  clipperId: string,
  o: { projectId?: string; limit: number },
): Promise<UploadRow[]> {
  const rows = await getDb(env)
    .select({
      id: schema.deliverables.id,
      projectId: schema.deliverables.projectId,
      filename: schema.deliverables.filename,
      caption: schema.deliverables.caption,
      projectName: schema.projects.name,
      createdAt: schema.deliverables.createdAt,
      bytes: schema.deliverables.bytes,
      uploadStatus: schema.deliverables.uploadStatus,
      thumbnailKey: schema.deliverables.thumbnailKey,
      publishStatus: schema.deliverables.publishStatus,
      publishTargets: schema.deliverables.publishTargets,
    })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .innerJoin(
      schema.projectWorkers,
      and(
        eq(schema.projectWorkers.projectId, schema.deliverables.projectId),
        eq(schema.projectWorkers.clipperId, clipperId),
      ),
    )
    .where(
      o.projectId
        ? and(eq(schema.deliverables.clipperId, clipperId), eq(schema.deliverables.projectId, o.projectId))
        : eq(schema.deliverables.clipperId, clipperId),
    )
    .orderBy(desc(schema.deliverables.createdAt))
    .limit(o.limit)

  const metrics = await numbersOr(
    totalsForDeliverables(
      env,
      rows.filter((u) => u.uploadStatus === 'complete').map((u) => u.id),
    ),
    new Map(),
  )
  return rows.map(({ thumbnailKey, ...u }) => ({ ...u, poster: Boolean(thumbnailKey), metrics: metrics.get(u.id) }))
}

/**
 * Wie viele Clips ein Bearbeiter in einer Kampagne fertig hochgeladen hat —
 * für die Kennzahlen im Kopf. Abgebrochene Uploads zählen nicht, sie wurden
 * nie veröffentlicht.
 */
async function clipsDelivered(env: Env, clipperId: string, projectId: string): Promise<number> {
  const [row] = await getDb(env)
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.deliverables)
    .where(
      and(
        eq(schema.deliverables.clipperId, clipperId),
        eq(schema.deliverables.projectId, projectId),
        eq(schema.deliverables.uploadStatus, 'complete'),
      ),
    )
  return Number(row?.n ?? 0)
}

/** Reichweite ohne Zahlen — was `numbersOr` zeigt, wenn die Abfrage scheitert. */
const noReach = () => ({ ...emptyTotals(), perProject: new Map() })

/**
 * D1 bindet höchstens 100 Parameter je Abfrage. Lange ID-Listen gehen
 * deshalb in Stücken — mit Luft für die übrigen Parameter der Abfrage.
 */
const ID_CHUNK = 90

/** Zählt je Kampagnen-ID; IDs ohne Treffer fehlen in der Map (also 0). */
async function countPerProject(
  projectIds: string[],
  query: (ids: string[]) => Promise<{ projectId: string | null; n: number }[]>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (let i = 0; i < projectIds.length; i += ID_CHUNK) {
    for (const row of await query(projectIds.slice(i, i + ID_CHUNK))) {
      if (row.projectId) counts.set(row.projectId, Number(row.n))
    }
  }
  return counts
}

/** Cloud-Links je Kampagne. */
const linkCounts = (env: Env, projectIds: string[]) =>
  countPerProject(projectIds, (ids) =>
    getDb(env)
      .select({ projectId: schema.projectLinks.projectId, n: sql<number>`COUNT(*)` })
      .from(schema.projectLinks)
      .where(inArray(schema.projectLinks.projectId, ids))
      .groupBy(schema.projectLinks.projectId),
  )

/** Seine fertig hochgeladenen Clips je Kampagne — auch für die Übersicht der Creator (routes/campaigns.ts). */
export const clipCounts = (env: Env, clipperId: string, projectIds: string[]) =>
  countPerProject(projectIds, (ids) =>
    getDb(env)
      .select({ projectId: schema.deliverables.projectId, n: sql<number>`COUNT(*)` })
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.clipperId, clipperId),
          eq(schema.deliverables.uploadStatus, 'complete'),
          inArray(schema.deliverables.projectId, ids),
        ),
      )
      .groupBy(schema.deliverables.projectId),
  )

/**
 * Ordner, Dateien und Bytes je Kampagne — gezählt wie bisher je Karte:
 * Ordner nicht im Papierkorb, Dateien vollständig hochgeladen und nicht
 * gelöscht. Eine gruppierte Abfrage je Stück statt einer je Kampagne.
 */
async function materialStats(env: Env, projectIds: string[]) {
  const out = new Map<string, { folders: number; files: number; bytes: number }>()
  for (let i = 0; i < projectIds.length; i += ID_CHUNK) {
    const rows = await getDb(env)
      .select({
        projectId: schema.folders.projectId,
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
      .where(and(inArray(schema.folders.projectId, projectIds.slice(i, i + ID_CHUNK)), isNull(schema.folders.deletedAt)))
      .groupBy(schema.folders.projectId)
    for (const r of rows) {
      if (r.projectId) out.set(r.projectId, { folders: Number(r.folders), files: Number(r.files), bytes: Number(r.bytes) })
    }
  }
  return out
}

/**
 * Zugang ohne Zeile in `clippers`. Deutsch für beide Rollen, im Wortschatz
 * des jeweiligen Bereichs (`area.kind`).
 */
export const noAccessPage = (area: Pick<WorkArea, 'kind'> = CLIPPER_WORK_AREA): string =>
  area.kind === 'creator' ? NO_ACCESS_CREATOR : NO_ACCESS_CLIPPER

/**
 * `logoutArea` gibt dem Logout-Formular das versteckte Feld `area` mit — dann
 * endet nur die Sitzung dieser Rolle; eine zweite Sitzung im selben Browser
 * (etwa als Kunde) bleibt bestehen. Ohne das Feld enden alle Sitzungen.
 */
const noAccess = (message: string, logoutArea?: 'creator') => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Noch kein Arbeitsbereich | Nikki Media</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="grid min-h-screen place-items-center bg-slate-950 p-6 text-center font-sans text-white">
  <div>
    <h1 class="text-2xl font-bold">Noch kein Arbeitsbereich</h1>
    <p class="mx-auto mt-2 max-w-sm text-slate-400">${message}</p>
    <form method="post" action="/logout">${
      logoutArea ? `<input type="hidden" name="area" value="${logoutArea}">` : ''
    }<button class="mt-7 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold hover:bg-blue-500">Abmelden</button></form>
  </div>
</body></html>`

const NO_ACCESS_CLIPPER = noAccess(
  'Dein Zugang ist eingerichtet, aber dein Arbeitsbereich ist noch nicht fertig. Jason meldet sich bei dir.',
)

const NO_ACCESS_CREATOR = noAccess(
  'Dein Zugang ist eingerichtet, aber dein Arbeitsbereich für Kampagnen ist noch nicht fertig. Jason meldet sich bei dir.',
  'creator',
)
