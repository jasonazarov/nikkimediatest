import { showcaseFor } from './showcase'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb, schema } from './db'
import { deleteObject, objectSize, presignGet, presignPut, r2Ready } from './r2'
import type { Env } from './types'

/* ==========================================================================
   Kampagnen-Thumbnails — wie bei YouTube ein Bild je Kampagne.

   Welches Bild, in dieser Reihenfolge:

     1. ein eigenes, hochgeladen von Admin, Kunde oder Creator
        (`projects.thumb_key`) — es gilt dann fest
     2. ein Bild aus dem Rohmaterial: das Vorschaubild der ersten Datei, die
        eins hat (`raw_assets.thumb_key`, erzeugt beim Hochladen)
     3. das Symbol des Cloud-Anbieters, groß, wenn statt Dateien ein
        Cloud-Link drinliegt (Google Drive, Dropbox, …)
     4. ein Bild aus einem fertigen Clip
     5. nichts — die Ansicht zeigt dann eine ruhige Fläche mit Initialen

   Rohmaterial und Cloud-Links sieht außer dem Besitzer nur der Administrator
   und die Bearbeiter der Kampagne. Wer eine Kampagne nur VERBREITET, bekommt
   deshalb höchstens Stufe 1 und 4 (`full: false`).

   Ausgeliefert wird das Bild über GET /media/kampagne/:id/thumb: die Route
   prüft den Zugriff und leitet auf eine kurz gültige, signierte R2-Adresse
   weiter. So signiert eine Liste mit fünfzig Kampagnen nicht fünfzig URLs
   beim Rendern, sondern nur die, die der Browser wirklich lädt.
   ========================================================================== */

export type CampaignThumb =
  | { kind: 'image'; src: string }
  | { kind: 'cloud'; host: string; provider: CloudProvider }
  | { kind: 'none' }

export interface CloudProvider {
  /** Kurzname, zugleich Dateiname unter /img/cloud/<id>.svg */
  id: string
  label: string
  /** Eigenes Symbol unter /img/cloud — sonst das Favicon der Seite. */
  bundled: boolean
}

const PROVIDERS: { id: string; label: string; hosts: RegExp }[] = [
  { id: 'drive', label: 'Google Drive', hosts: /(^|\.)(drive|docs)\.google\.com$/ },
  { id: 'dropbox', label: 'Dropbox', hosts: /(^|\.)dropbox(usercontent)?\.com$|(^|\.)db\.tt$/ },
  { id: 'onedrive', label: 'OneDrive', hosts: /(^|\.)(onedrive\.live\.com|1drv\.ms|sharepoint\.com)$/ },
  { id: 'icloud', label: 'iCloud', hosts: /(^|\.)icloud\.com$/ },
  { id: 'wetransfer', label: 'WeTransfer', hosts: /(^|\.)(wetransfer\.com|we\.tl)$/ },
  { id: 'box', label: 'Box', hosts: /(^|\.)box\.com$/ },
  { id: 'mega', label: 'MEGA', hosts: /(^|\.)mega\.(nz|io)$/ },
]

/** Der Cloud-Anbieter hinter einem Link — unbekannte zeigen ihr Favicon. */
export function cloudProvider(host: string): CloudProvider {
  const h = host.toLowerCase().replace(/^www\./, '')
  const known = PROVIDERS.find((p) => p.hosts.test(h))
  return known ? { id: known.id, label: known.label, bundled: true } : { id: 'web', label: h, bundled: false }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Adresse des Bildes; `v` ändert sich mit dem Bild, damit kein alter Stand im Cache hängt. */
const imageSrc = (projectId: string, version: string) =>
  `/media/kampagne/${encodeURIComponent(projectId)}/thumb?v=${encodeURIComponent(version.slice(-24))}`

interface Sources {
  custom: Map<string, string>
  raw: Map<string, { id: string; key: string }>
  link: Map<string, string>
  clip: Map<string, { id: string; key: string }>
}

/** Alles, woraus ein Thumbnail werden kann — je Kampagne das erste. In Stücken (D1: ≤ 100 Parameter). */
async function sources(env: Env, projectIds: string[], full: boolean): Promise<Sources> {
  const db = getDb(env)
  const out: Sources = { custom: new Map(), raw: new Map(), link: new Map(), clip: new Map() }
  for (let i = 0; i < projectIds.length; i += 90) {
    const ids = projectIds.slice(i, i + 90)

    for (const r of await db
      .select({ id: schema.projects.id, key: schema.projects.thumbKey })
      .from(schema.projects)
      .where(and(inArray(schema.projects.id, ids), isNotNull(schema.projects.thumbKey)))) {
      if (r.key) out.custom.set(r.id, r.key)
    }

    if (full) {
      // SQLite gibt bei MIN() die übrigen Spalten der Zeile mit dem kleinsten
      // Wert zurück — also das Bild der zuerst hochgeladenen Datei.
      for (const r of await db
        .select({
          projectId: schema.folders.projectId,
          id: schema.rawAssets.id,
          key: schema.rawAssets.thumbKey,
          first: sql<number>`min(${schema.rawAssets.createdAt})`,
        })
        .from(schema.rawAssets)
        .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
        .where(
          and(
            inArray(schema.folders.projectId, ids),
            isNotNull(schema.rawAssets.thumbKey),
            isNull(schema.rawAssets.deletedAt),
            eq(schema.rawAssets.uploadStatus, 'complete'),
          ),
        )
        .groupBy(schema.folders.projectId)) {
        if (r.projectId && r.key) out.raw.set(r.projectId, { id: r.id, key: r.key })
      }

      for (const r of await db
        .select({
          projectId: schema.projectLinks.projectId,
          url: schema.projectLinks.url,
          first: sql<number>`min(${schema.projectLinks.createdAt})`,
        })
        .from(schema.projectLinks)
        .where(inArray(schema.projectLinks.projectId, ids))
        .groupBy(schema.projectLinks.projectId)) {
        out.link.set(r.projectId, r.url)
      }
    }

    for (const r of await db
      .select({
        projectId: schema.deliverables.projectId,
        id: schema.deliverables.id,
        key: schema.deliverables.thumbnailKey,
        first: sql<number>`min(${schema.deliverables.createdAt})`,
      })
      .from(schema.deliverables)
      .where(
        and(
          inArray(schema.deliverables.projectId, ids),
          isNotNull(schema.deliverables.thumbnailKey),
          eq(schema.deliverables.uploadStatus, 'complete'),
        ),
      )
      .groupBy(schema.deliverables.projectId)) {
      if (r.key) out.clip.set(r.projectId, { id: r.id, key: r.key })
    }
  }
  return out
}

/**
 * Das Thumbnail je Kampagne, wie es eine Liste anzeigt.
 *
 * `full: false` für alle, die eine Kampagne nur verbreiten — sie sehen weder
 * Rohmaterial noch Cloud-Links (siehe Kopf dieser Datei).
 */
export async function campaignThumbs(
  env: Env,
  projectIds: string[],
  opts: { full?: boolean } = {},
): Promise<Map<string, CampaignThumb>> {
  const full = opts.full !== false
  const src = await sources(env, projectIds, full)
  const out = new Map<string, CampaignThumb>()
  for (const id of projectIds) {
    const custom = src.custom.get(id)
    const raw = src.raw.get(id)
    const link = src.link.get(id)
    const clip = src.clip.get(id)
    if (custom) out.set(id, { kind: 'image', src: imageSrc(id, custom) })
    else if (raw) out.set(id, { kind: 'image', src: imageSrc(id, raw.id) })
    else if (link && hostOf(link)) out.set(id, { kind: 'cloud', host: hostOf(link), provider: cloudProvider(hostOf(link)) })
    else if (clip) out.set(id, { kind: 'image', src: imageSrc(id, clip.id) })
    else out.set(id, { kind: 'none' })
  }
  return out
}

/** Der R2-Schlüssel des Bildes, das `campaignThumbs` für diese Kampagne zeigt — oder null. */
export async function campaignThumbKey(env: Env, projectId: string, full: boolean): Promise<string | null> {
  const src = await sources(env, [projectId], full)
  return src.custom.get(projectId) ?? src.raw.get(projectId)?.key ?? (src.link.has(projectId) ? null : src.clip.get(projectId)?.key ?? null)
}

/* --------------------------------------------------------------- Zugriff */

/**
 * Was ein Nutzer von einer Kampagne sehen darf:
 *   'full'    Admin, Besitzer (Kunde oder Creator), Bearbeiter
 *   'limited' verbreitende Creator und freigeschaltete Agenturen — kein Rohmaterial
 *   null      gar nichts
 */
export async function thumbAccess(
  env: Env,
  user: { id: string; role: string; demo?: number | null },
  projectId: string,
): Promise<'full' | 'limited' | null> {
  if (user.role === 'admin') return 'full'
  const db = getDb(env)

  const [owned] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.customers.userId, user.id)))
    .limit(1)
  if (owned) return 'full'

  const [worker] = await db
    .select({ id: schema.projectWorkers.projectId })
    .from(schema.projectWorkers)
    .innerJoin(schema.clippers, eq(schema.clippers.id, schema.projectWorkers.clipperId))
    .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.clippers.userId, user.id)))
    .limit(1)
  if (worker) return 'full'

  const [distributor] = await db
    .select({ id: schema.campaignCreators.projectId })
    .from(schema.campaignCreators)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.campaignCreators.creatorId))
    .where(and(eq(schema.campaignCreators.projectId, projectId), eq(schema.creators.userId, user.id)))
    .limit(1)
  if (distributor) return 'limited'

  // Freigeschaltete Agenturen sehen alle Kampagnen — aber kein Rohmaterial
  // und keine Cloud-Links (siehe lib/agency.ts). Eigene sind oben schon 'full'.
  if (user.role === 'agency') {
    // Use Cases der Demo-Agentur (lib/showcase.ts): Bild ohne Rohmaterial, wie bei fremden Kampagnen.
    if ((await showcaseFor(env, user)).has(projectId)) return 'limited'
    const [lead] = await db
      .select({ accessAt: schema.agencyLeads.accessAt, briefedAt: schema.agencyLeads.briefedAt })
      .from(schema.agencyLeads)
      .where(eq(schema.agencyLeads.userId, user.id))
      .limit(1)
    // Kampagnen ANDERER Agenturen sieht eine Agentur nicht.
    const [owner] = await db
      .select({ role: schema.users.role })
      .from(schema.projects)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
      .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
      .where(eq(schema.projects.id, projectId))
      .limit(1)
    if (lead?.accessAt && lead.briefedAt && owner && owner.role !== 'agency') return 'limited'
  }
  return null
}

/** Signierte Adresse des Bildes — so lange gültig, wie der Browser die Weiterleitung zwischenspeichert. */
export const THUMB_URL_TTL_SEC = 3600
export const signThumb = (env: Env, key: string) => presignGet(env, key, undefined, THUMB_URL_TTL_SEC)

/* ---------------------------------------------------- eigenes Thumbnail */

/** Eigene Thumbnails sind im Browser auf 1280 × 720 JPEG verkleinert; mehr gehört nicht in den Bucket. */
export const CUSTOM_THUMB_MAX_BYTES = 2 * 1024 * 1024

/** Wohin ein eigenes Thumbnail hochgeladen wird — im Bereich des Besitzers, je Upload neu. */
const customThumbPrefix = (customerId: string, projectId: string) => `${customerId}/kampagnen-thumbs/${projectId}/`

/** Schritt 1: signierte Adresse für den Upload. Den Schlüssel bestimmt der Server, nicht der Browser. */
export async function startCustomThumb(env: Env, project: { id: string; customerId: string }) {
  const key = `${customThumbPrefix(project.customerId, project.id)}${crypto.randomUUID()}.jpg`
  return { key, url: await presignPut(env, key) }
}

/**
 * Schritt 2: nach dem Upload. Nimmt nur einen Schlüssel aus dem Bereich
 * dieser Kampagne an, prüft, dass die Datei wirklich oben liegt und nicht zu
 * groß ist, setzt sie als Thumbnail und räumt das vorige weg.
 */
export async function finishCustomThumb(
  env: Env,
  project: { id: string; customerId: string; thumbKey: string | null },
  key: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!key.startsWith(customThumbPrefix(project.customerId, project.id)) || key.includes('..')) {
    return { ok: false, error: 'invalid' }
  }
  const size = await objectSize(env, key)
  if (!size) return { ok: false, error: 'missing' }
  if (size > CUSTOM_THUMB_MAX_BYTES) {
    await deleteObject(env, key).catch(() => {})
    return { ok: false, error: 'too_large' }
  }
  await getDb(env).update(schema.projects).set({ thumbKey: key }).where(eq(schema.projects.id, project.id))
  if (project.thumbKey && project.thumbKey !== key) await deleteObject(env, project.thumbKey).catch(() => {})
  return { ok: true }
}

/** Eigenes Thumbnail entfernen — danach gilt wieder das automatische. */
export async function removeCustomThumb(env: Env, project: { id: string; thumbKey: string | null }) {
  await getDb(env).update(schema.projects).set({ thumbKey: null }).where(eq(schema.projects.id, project.id))
  if (project.thumbKey && r2Ready(env)) await deleteObject(env, project.thumbKey).catch(() => {})
}
