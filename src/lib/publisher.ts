import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm'
import { getDb, nowSec, uid, schema } from './db'
import { presignGet, extOf, PUBLISH_SIGN_TTL_SEC } from './r2'
import * as provider from './zernio'
import type { Platform } from './zernio'
import type { Env } from './types'
import { syncExternalAfterConnect } from './metrics'
import type { ClipApproval, Deliverable } from '../db/schema'

/**
 * Veröffentlichungsschicht.
 *
 * Der übrige Code spricht ausschließlich mit dieser Datei und weiß nicht,
 * wie der Anbieter heißt. Ein Anbieterwechsel bedeutet: diese Datei und
 * `zernio.ts` austauschen, sonst nichts. Deshalb taucht hier auch kein
 * Anbietername in einer Signatur auf.
 *
 * Der Kern dieser Fassung, und der Grund für den letzten Wechsel: ein Video
 * geht in EINEM Aufruf an ALLE Accounts eines Projekts — auch an zehn
 * Instagram-Accounts nebeneinander. Ergebnisse werden je ACCOUNT geführt,
 * nicht je Plattform.
 *
 * Seit den Creator-Kampagnen gehört ein Account einem Projekt ODER einem
 * Creator (`AccountOwner`). Daraus folgen zwei Wege für einen fertigen Clip:
 *
 *   AUTOMATISCH (`publishDeliverable`) — an die Accounts des Projekts und,
 *   wenn ein Creator die Kampagne selbst angelegt hat, an seine Accounts.
 *   Der Stand steht am Deliverable.
 *
 *   VERBREITUNG (`publishForCreator`) — ein Creator, der einer fremden,
 *   freigegebenen Kampagne beigetreten ist, stellt einen Clip nach eigener
 *   Freigabe auf seine Kanäle. Der Stand steht an der Freigabe-Zeile
 *   (`clip_approvals`), nie am Deliverable.
 *
 * Beide Wege laufen durch denselben Kern (`sendVideo`, `resendDue`) und damit
 * durch dieselben Sperren gegen Doppelposts.
 */

/* ------------------------------------------------------- Grenzen & Zustände */

/** Was der Anbieter per URL entgegennimmt. */
const PUBLISHABLE_EXT = ['mp4', 'mov'] as const

/**
 * Obergrenzen je Plattform, in Bytes.
 *
 * Sie stammen von den Plattformen selbst. Instagram ist mit 300 MB die
 * engste und entscheidet damit in der Praxis: ein 400-MB-Clip geht auf
 * TikTok und YouTube raus und wird von Instagram abgewiesen. Genau deshalb
 * steht hier eine Tabelle und keine einzelne Zahl — wer eine gemeinsame
 * Obergrenze zieht, verschenkt entweder TikTok oder erzeugt stille
 * Instagram-Fehler.
 */
const MAX_BYTES: Record<Platform, number> = {
  instagram: 300 * 1024 * 1024,
  tiktok: 4 * 1024 * 1024 * 1024,
  youtube: 128 * 1024 * 1024 * 1024,
  // X (Twitter) — von X selbst dokumentierte Video-Obergrenze für den
  // API-Upload; nicht durch die Zernio-Spec bestätigt, deshalb konservativ.
  twitter: 512 * 1024 * 1024,
  // Facebook — die Zernio-Spec nennt keine Grenze. Meta erlaubt Seiten-Videos
  // bis 10 GB nur über den fortsetzbaren Upload; für den einfachen Upload
  // nennt Meta 1 GB. Welchen Weg Zernio nimmt, steht nirgends — also der
  // engere.
  facebook: 1024 * 1024 * 1024,
  // LinkedIn — LinkedIns eigene Video-Grenze (MP4 H.264/AAC, 3 s–30 min,
  // 75 KB–500 MB). So steht sie auch in der Zernio-Spec (Videoanzeigen mit
  // SINGLE_VIDEO); für normale Posts nennt die Spec keine andere Zahl.
  linkedin: 500 * 1024 * 1024,
}

/** Über dieser Grenze nimmt ihn keine der Plattformen. */
const MAX_BYTES_ANY = Math.max(...Object.values(MAX_BYTES))

/**
 * Zustände in `deliverables.publish_status` (und gleich in
 * `clip_approvals.publish_status`).
 *
 * Die drei mittleren sind der Grund, warum diese Spalte existiert: ein Clip,
 * der NICHT rausgeht, muss genauso sichtbar sein wie einer, der rausgeht.
 */
export const PUBLISH_STATUS = {
  /** Beim Anbieter angenommen und eingeplant. */
  scheduled: 'scheduled',
  /** Bestätigt veröffentlicht (kommt per Webhook oder Nachfassen). */
  posted: 'posted',
  /**
   * Auf mindestens einem Account draußen, auf mindestens einem gescheitert.
   *
   * Dieser Zustand fehlte einmal und wurde teuer bezahlt: der erste echte
   * Clip lief auf Instagram und scheiterte auf TikTok — bei uns stand
   * „scheduled". Welcher Account wie ausging, steht in `publish_targets`.
   */
  partial: 'teilweise_veroeffentlicht',
  /** Format, das der Anbieter per URL nicht annimmt. */
  formatUnsupported: 'format_nicht_unterstuetzt',
  /** Zu groß für jede Zielplattform — wird gar nicht erst gesendet. */
  tooLarge: 'zu_gross',
  /**
   * Noch keine verbundenen Accounts — beim Projekt bzw. beim Creator, der
   * verbreiten will. Der Cron holt es nach.
   */
  waitingForAccounts: 'wartet_auf_accounts',
  /** Anbieter hat abgelehnt oder war nicht erreichbar. */
  failed: 'fehlgeschlagen',
  /**
   * Nur an Freigaben: der Creator postet selbst (Twitch, Snapchat) und hatte
   * beim Freigeben keinen verbindbaren Account.
   *
   * Ein eigener Stand und NICHT „wartet auf Accounts“: den nähme der
   * Nachhol-Lauf jede Viertelstunde in die Hand und schickte den Clip
   * ungefragt los, sobald der Creator irgendwann einen Account verbindet —
   * womöglich aus einer längst beendeten Kampagne und nachdem er ihn schon
   * von Hand gepostet hat. Dieser Stand läuft deshalb nie von allein, nur
   * über `publishForCreator` mit `force` (der Knopf „Jetzt posten“).
   */
  manual: 'manuell',
} as const

export type PublishStatus = (typeof PUBLISH_STATUS)[keyof typeof PUBLISH_STATUS]

/** Menschenlesbar — für Admin- und Clipper-Ansicht. */
export function publishStatusLabel(status: string | null, lang: 'de' | 'en' = 'de'): string {
  const de: Record<string, string> = {
    [PUBLISH_STATUS.scheduled]: 'wird veröffentlicht',
    [PUBLISH_STATUS.posted]: 'veröffentlicht',
    [PUBLISH_STATUS.partial]: 'teilweise veröffentlicht',
    [PUBLISH_STATUS.formatUnsupported]: 'Format nicht veröffentlichbar (nur MP4/MOV)',
    [PUBLISH_STATUS.tooLarge]: 'zu groß zum Veröffentlichen',
    [PUBLISH_STATUS.waitingForAccounts]: 'wartet auf verbundene Accounts',
    [PUBLISH_STATUS.failed]: 'Veröffentlichung fehlgeschlagen',
    [PUBLISH_STATUS.manual]: 'Selbst posten',
  }
  const en: Record<string, string> = {
    [PUBLISH_STATUS.scheduled]: 'publishing',
    [PUBLISH_STATUS.posted]: 'published',
    [PUBLISH_STATUS.partial]: 'partly published',
    [PUBLISH_STATUS.formatUnsupported]: 'format cannot be published (MP4/MOV only)',
    [PUBLISH_STATUS.tooLarge]: 'too large to publish',
    [PUBLISH_STATUS.waitingForAccounts]: 'waiting for connected accounts',
    [PUBLISH_STATUS.failed]: 'publishing failed',
    [PUBLISH_STATUS.manual]: 'Manual posting',
  }
  if (!status) return lang === 'en' ? 'not published' : 'nicht veröffentlicht'
  return (lang === 'en' ? en : de)[status] ?? status
}

/** Plattformnamen lesbar machen — auch die, die nur von Hand gepostet werden. */
export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitch: 'Twitch',
  snapchat: 'Snapchat',
}

export const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p

/** Ist die Anbindung überhaupt eingerichtet? */
export const publishingReady = (env: Env) => provider.zernioReady(env)

/** Plattformen, die ein Projekt oder ein Creator verbinden kann. */
export const CONNECTABLE = provider.PLATFORMS
export const isConnectable = provider.isPlatform

/* ------------------------------------------------- Plattformen ohne API */

/**
 * Plattformen, auf die nur von Hand gepostet werden kann.
 *
 * Snapchat ist beim Anbieter geschlossene Beta (403 PLATFORM_BETA_RESTRICTED),
 * Twitch kennt er gar nicht. Viele Creator haben dort trotzdem ihre
 * Reichweite. Statt sie zu übergehen, trägt der Creator den Link zu seinem
 * Beitrag selbst ein — so ist festgehalten, wo der Clip läuft. (Angezeigt
 * wird er bisher nur dem Creator selbst, nicht dem Kunden.)
 */
export const MANUAL_PLATFORMS = ['twitch', 'snapchat'] as const

export type ManualPlatform = (typeof MANUAL_PLATFORMS)[number]

export const isManualPlatform = (v: string): v is ManualPlatform =>
  (MANUAL_PLATFORMS as readonly string[]).includes(v)

/**
 * Wo ein Beitrag der jeweiligen Plattform liegen darf. Ein Link auf eine
 * beliebige Seite würde beim Kunden als „gepostet auf Twitch" erscheinen —
 * das soll nur stehen, wenn er wirklich dorthin zeigt.
 */
const MANUAL_HOSTS: Record<ManualPlatform, readonly string[]> = {
  twitch: ['twitch.tv'],
  snapchat: ['snapchat.com'],
}

/** Link prüfen und vereinheitlichen (immer https). `null` heißt: unbrauchbar. */
export function normalizeManualPostUrl(platform: ManualPlatform, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (!text || text.length > 500) return null
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (!MANUAL_HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) return null
  url.protocol = 'https:'
  return url.toString()
}

/** `clip_approvals.manual_posts` lesen. Kaputter Inhalt darf nichts umwerfen. */
export function readManualPosts(raw: string | null | undefined): Partial<Record<ManualPlatform, string>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const out: Partial<Record<ManualPlatform, string>> = {}
    if (parsed && typeof parsed === 'object') {
      for (const p of MANUAL_PLATFORMS) {
        if (typeof parsed[p] === 'string' && parsed[p]) out[p] = parsed[p]
      }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Trägt den Link zu einem von Hand geposteten Beitrag ein — oder entfernt
 * ihn (`url` leer oder `null`).
 *
 * Verlangt eine bestehende Freigabe: wer einen Clip auf Twitch stellt, hat
 * ihn freigegeben, und nur so bleibt die Prüfung, ob er die Kampagne
 * überhaupt verbreiten darf, an EINER Stelle (`recordApproval`).
 */
export async function setManualPost(
  env: Env,
  deliverableId: string,
  creatorId: string,
  platform: ManualPlatform,
  url: string | null,
): Promise<{ ok: true; posts: Partial<Record<ManualPlatform, string>> } | { ok: false; error: string }> {
  const db = getDb(env)
  const [approval] = await db
    .select()
    .from(schema.clipApprovals)
    .where(
      and(
        eq(schema.clipApprovals.deliverableId, deliverableId),
        eq(schema.clipApprovals.creatorId, creatorId),
      ),
    )
    .limit(1)
  if (!approval || approval.status !== APPROVED) {
    return { ok: false, error: 'Gib den Clip zuerst frei.' }
  }

  const posts = readManualPosts(approval.manualPosts)
  if (url === null || !url.trim()) {
    delete posts[platform]
  } else {
    const clean = normalizeManualPostUrl(platform, url)
    if (!clean) {
      return {
        ok: false,
        error: `Ungültiger Link: erwartet wird ein Beitrag auf ${MANUAL_HOSTS[platform][0]}.`,
      }
    }
    posts[platform] = clean
  }

  await db
    .update(schema.clipApprovals)
    .set({ manualPosts: Object.keys(posts).length ? JSON.stringify(posts) : null, updatedAt: nowSec() })
    .where(
      and(
        eq(schema.clipApprovals.deliverableId, deliverableId),
        eq(schema.clipApprovals.creatorId, creatorId),
      ),
    )
  return { ok: true, posts }
}

/* ---------------------------------------------------------------- Besitzer */

/**
 * Wem ein Steckplatz bzw. Account gehört: einem Projekt ODER einem Creator.
 *
 * Projekt-Accounts verbindet der Kunde (oder der Administrator) für genau
 * dieses Projekt. Creator-Accounts verbindet der Creator einmal für sich —
 * sie gelten für alle seine eigenen Kampagnen und für jede Kunden-Kampagne,
 * die er verbreitet. Je Kampagne neu zu verbinden hieße doppelte Kosten,
 * weil je verbundenem Account abgerechnet wird.
 */
export type AccountOwner = { projectId: string } | { creatorId: string }

const isCreatorOwner = (o: AccountOwner): o is { creatorId: string } => 'creatorId' in o

/** Beide Spalten für eine Zeile dieses Besitzers — die fremde bleibt NULL (CHECK). */
const ownerValues = (o: AccountOwner) =>
  isCreatorOwner(o)
    ? { projectId: null, creatorId: o.creatorId }
    : { projectId: o.projectId, creatorId: null }

const profilesOf = (o: AccountOwner) =>
  isCreatorOwner(o)
    ? eq(schema.publishProfiles.creatorId, o.creatorId)
    : eq(schema.publishProfiles.projectId, o.projectId)

const accountsOf = (o: AccountOwner) =>
  isCreatorOwner(o)
    ? eq(schema.publishAccounts.creatorId, o.creatorId)
    : eq(schema.publishAccounts.projectId, o.projectId)

/** Aus einer Zeile mit beiden Spalten wieder den Besitzer machen. */
function ownerOf(row: { projectId: string | null; creatorId: string | null }): AccountOwner | null {
  if (row.projectId) return { projectId: row.projectId }
  if (row.creatorId) return { creatorId: row.creatorId }
  return null
}

const sameOwner = (a: AccountOwner, b: AccountOwner) =>
  isCreatorOwner(a)
    ? isCreatorOwner(b) && a.creatorId === b.creatorId
    : !isCreatorOwner(b) && a.projectId === b.projectId

/* -------------------------------------------------------------- Steckplätze */

/**
 * Kurzform des Projektnamens für die Anzeige beim Anbieter.
 *
 * Klartext, kein Codename: das Dashboard der Gegenseite sieht nur der
 * Auftraggeber, und er muss die Steckplätze wiederfinden. Die Anonymisierung
 * gilt gegenüber Clippern, nicht gegenüber ihm.
 */
async function projectLabel(env: Env, projectId: string): Promise<string> {
  const [row] = await getDb(env)
    .select({
      projectName: schema.projects.name,
      company: schema.customers.company,
      fullName: schema.users.fullName,
    })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!row) return 'Projekt'
  return `${row.company || row.fullName} · ${row.projectName}`.slice(0, 60)
}

/**
 * Dasselbe für einen Creator: Name und, wenn er einen angegeben hat, sein
 * Handle auf dieser Plattform. Mit dem Handle findet man im Dashboard der
 * Gegenseite auf einen Blick, welcher Steckplatz wohin gehört.
 */
async function creatorLabel(env: Env, creatorId: string, platform: string): Promise<string> {
  const [row] = await getDb(env)
    .select({ fullName: schema.users.fullName, handles: schema.creators.handles })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.creators.id, creatorId))
    .limit(1)
  if (!row) return 'Creator'
  let handle = ''
  try {
    const handles = JSON.parse(row.handles || '{}')
    if (handles && typeof handles[platform] === 'string') handle = handles[platform]
  } catch {
    /* Kaputter Inhalt darf nichts umwerfen — dann eben ohne Handle. */
  }
  return `Creator · ${row.fullName}${handle ? ` @${handle.replace(/^@/, '')}` : ''}`.slice(0, 60)
}

/** Warum das Verbinden zuletzt scheiterte — sonst steht der Grund nur im Log. */
async function noteProjectError(env: Env, projectId: string, error: string | null) {
  await getDb(env)
    .update(schema.projects)
    .set({ publishError: error?.slice(0, 500) ?? null, publishTriedAt: nowSec() })
    .where(eq(schema.projects.id, projectId))
}

/**
 * Fehler beim Verbinden festhalten. Für Projekte steht er am Projekt (die
 * Adminseite zeigt ihn); ein Creator bekommt ihn direkt als Antwort auf
 * seinen Klick — eine eigene Spalte bräuchte es dafür nicht.
 */
async function noteConnectError(env: Env, owner: AccountOwner, error: string | null) {
  if (isCreatorOwner(owner)) {
    if (error) console.error('[publisher] Verbinden fehlgeschlagen', owner.creatorId, error.slice(0, 200))
    return
  }
  await noteProjectError(env, owner.projectId, error)
}

/**
 * Liefert das Profil, in das der nächste Account dieser Plattform gehört.
 *
 * Der Anbieter hält pro Profil nur EINEN Account je Plattform — ein zweiter
 * Instagram-Account würde den ersten ersetzen. Deshalb bekommt jeder Account
 * seinen eigenen Steckplatz. Ein Steckplatz, an dem (noch) kein Account
 * hängt, wird wiederverwendet; sonst entsteht der nächste.
 *
 * Der Profilname trägt die kurze ID des Besitzers mit. Namen sind teamweit
 * eindeutig, und zwei Kunden dürfen durchaus dasselbe Projekt „Reels"
 * nennen — ohne die ID kollidierten sie. Steckplätze eines Creators tragen
 * zusätzlich ein `c:` davor, im Idempotenzschlüssel ein `creator:`: eine
 * Projekt-ID und eine Creator-ID können so nie denselben Namen oder
 * Schlüssel ergeben.
 */
async function profileForNextAccount(
  env: Env,
  owner: AccountOwner,
  platform: Platform,
  /**
   * Erzwingt ein frisches Profil und macht den Idempotenzschlüssel eindeutig.
   *
   * Genutzt für den Neuversuch nach einem toten Steckplatz oder einem
   * drüben verbrauchten Schlüssel (siehe `connectUrlFor`): der verworfene
   * Steckplatz bekäme sonst dieselbe Slot-Nummer und damit denselben
   * Idempotenzschlüssel wie zuvor — Zernio
   * könnte dann die alte, ungültige Profil-ID einfach erneut ausliefern,
   * statt wirklich ein neues Profil anzulegen.
   */
  opts: { forceNew?: boolean } = {},
): Promise<{ profileId: string; reused: boolean }> {
  const db = getDb(env)

  const profiles = await db
    .select()
    .from(schema.publishProfiles)
    .where(and(profilesOf(owner), eq(schema.publishProfiles.platform, platform)))
    .orderBy(schema.publishProfiles.slot)

  if (!opts.forceNew) {
    const taken = new Set(
      (
        await db
          .select({ id: schema.publishAccounts.providerProfileId })
          .from(schema.publishAccounts)
          .where(accountsOf(owner))
      ).map((r) => r.id),
    )

    const free = profiles.find((p) => !taken.has(p.providerProfileId))
    if (free) return { profileId: free.providerProfileId, reused: true }
  }

  const slot = (profiles.at(-1)?.slot ?? 0) + 1
  const retry = opts.forceNew ? `:retry:${uid().slice(0, 8)}` : ''

  let name: string
  let description: string
  let idempotencyKey: string
  if (isCreatorOwner(owner)) {
    const label = await creatorLabel(env, owner.creatorId, platform)
    name = `${label} · ${platform} ${slot} (c:${owner.creatorId.slice(0, 6)})`
    description = `nikki-media · Creator ${owner.creatorId}`
    idempotencyKey = `creator:${owner.creatorId}:${platform}:${slot}${retry}`
  } else {
    const label = await projectLabel(env, owner.projectId)
    name = `${label} · ${platform} ${slot} (${owner.projectId.slice(0, 6)})`
    description = `nikki-media · Projekt ${owner.projectId}`
    idempotencyKey = `${owner.projectId}:${platform}:${slot}${retry}`
  }

  let profileId: string
  try {
    const { profile } = await provider.createProfile(env, {
      name,
      description,
      // Bricht der Aufruf im Netz ab und wird wiederholt, entsteht kein
      // zweites Profil — die Gegenseite spielt die erste Antwort erneut ab.
      idempotencyKey,
    })
    profileId = profile._id
  } catch (err) {
    const adopted = await adoptNamedProfile(env, owner, err, name)
    if (!adopted) throw err
    if (adopted.known) return { profileId: adopted.id, reused: true }
    profileId = adopted.id
  }

  await db.insert(schema.publishProfiles).values({
    id: uid(),
    ...ownerValues(owner),
    providerProfileId: profileId,
    platform,
    slot,
    createdAt: nowSec(),
  })

  return { profileId, reused: false }
}

/**
 * Der Profilname ist drüben schon vergeben (409 `profile_name_conflict`) —
 * dann ist das Profil mit diesem Namen unseres und wird übernommen.
 *
 * So entsteht der Fall: eine verworfene Dublette ließ drüben ein Profil
 * zurück (Trennen oder Löschen scheiterte vorübergehend), der 24-h-Schlüssel
 * ist inzwischen abgelaufen, und die nächste Steckplatznummer ergibt wieder
 * genau diesen Namen. Ohne Übernahme schlüge JEDER weitere Klick für diese
 * Plattform mit demselben 409 fehl, solange sich der Name nicht ändert.
 *
 * Dass es unseres ist, sagt der Name: er trägt die kurze Besitzer-ID,
 * Plattform und Steckplatz (siehe `profileForNextAccount`). Steht die
 * Profil-ID trotzdem schon bei einem ANDEREN Besitzer in unserer Tabelle,
 * wird nichts übernommen — lieber ein Fehler beim Verbinden als ein Account,
 * der im fremden Steckplatz landet.
 */
async function adoptNamedProfile(
  env: Env,
  owner: AccountOwner,
  err: unknown,
  name: string,
): Promise<{ id: string; known: boolean } | null> {
  if (!(err instanceof provider.ZernioError) || err.status !== 409) return null
  // 409 heißt auch „derselbe Schlüssel wird noch verarbeitet“ — das ist kein
  // vergebener Name, und dann gibt es auch nichts zu übernehmen.
  if (err.code === 'idempotency_conflict') return null

  const details = err.details as { existingProfileId?: unknown } | undefined
  let id = typeof details?.existingProfileId === 'string' ? details.existingProfileId : ''
  if (!id) {
    try {
      const { profiles } = await provider.findProfileByName(env, name)
      id = (profiles ?? []).find((p) => p.name === name)?._id ?? ''
    } catch (lookup) {
      console.error('[publisher] Profil nicht auffindbar', name, String(lookup).slice(0, 200))
    }
  }
  if (!id) return null

  const known = await ownerForProfile(env, id)
  if (known && !sameOwner(known, owner)) return null
  return { id, known: Boolean(known) }
}

/**
 * Die Adresse, auf die der Browser zum Verbinden geschickt wird.
 *
 * Das ist der einzige Handgriff, der von Hand bleibt: einmal je Account
 * zustimmen. Alles davor und danach läuft über die API.
 *
 * Ein wiederverwendeter Steckplatz kann bei Zernio verschwunden sein — etwa
 * weil ein früherer Verbindungsversuch nie abgeschlossen wurde und die
 * Gegenseite das verwaiste Profil irgendwann aufräumt. Ohne Gegenmaßnahme
 * bliebe der Steckplatz lokal stehen und JEDER weitere Versuch für diesen
 * Besitzer und diese Plattform schlüge mit „404: Profile not found" fehl —
 * genau das Bild, das als „Instagram geht nicht mehr, TikTok/YouTube schon"
 * gemeldet wird, wenn ausgerechnet dort ein Steckplatz verwaist ist. Bei
 * genau diesem Fehler wird der tote Steckplatz deshalb verworfen und einmal
 * neu versucht — mit einem frischen Profil.
 */
async function connectUrlFor(
  env: Env,
  owner: AccountOwner,
  platform: Platform,
  redirectUrl: string,
  loginMethod?: provider.InstagramLoginMethod,
  byAdmin = false,
): Promise<string> {
  if (!publishingReady(env)) throw new Error('Anbindung nicht eingerichtet.')

  /*
   * Festhalten, wer diesen Link erzeugt hat — erst NACH dem Link, also für
   * genau den Steckplatz, auf den er zeigt. Der Administrator markiert ihn,
   * Kunde und Creator löschen die Marke wieder: ein Steckplatz, den der
   * Administrator nie zu Ende verbunden hat, wird beim nächsten Kundenlink
   * wiederverwendet und zählt dann wieder gegen die Grenze (siehe
   * `beyondAccountLimit`).
   */
  const issued = async (profileId: string, authUrl: string) => {
    await getDb(env)
      .update(schema.publishProfiles)
      .set({ adminLinkAt: byAdmin ? nowSec() : null })
      .where(eq(schema.publishProfiles.providerProfileId, profileId))
    await noteConnectError(env, owner, null)
    return authUrl
  }

  try {
    /*
     * Ein 422 beim Anlegen heißt: der Idempotenzschlüssel ist drüben schon mit
     * einem ANDEREN Inhalt verbraucht. Das passiert, wenn eine Steckplatznummer
     * nach einer verworfenen Dublette neu vergeben wird (`discardDuplicateAccount`
     * räumt den Steckplatz ab, die nächste Nummer ist wieder dieselbe) und sich
     * der Profilname inzwischen geändert hat — Projekt umbenannt, Handle
     * geändert. Ohne Gegenmaßnahme schlüge dann jeder Klick für diese
     * Plattform fehl, solange der Anbieter den Schlüssel hält. Also einmal mit
     * frischem Schlüssel.
     */
    let picked: { profileId: string; reused: boolean }
    try {
      picked = await profileForNextAccount(env, owner, platform)
    } catch (err) {
      if (!(err instanceof provider.ZernioError) || err.status !== 422) throw err
      picked = await profileForNextAccount(env, owner, platform, { forceNew: true })
    }
    let { profileId } = picked

    try {
      const { authUrl } = await provider.connectUrl(env, { platform, profileId, redirectUrl, loginMethod })
      return await issued(profileId, authUrl)
    } catch (err) {
      /*
       * Auch ein FRISCH angelegter Steckplatz kann tot sein: bei gleichem
       * Schlüssel und gleichem Inhalt spielt der Anbieter die erste Antwort
       * erneut ab — samt der ID eines Profils, das nach einer verworfenen
       * Dublette längst gelöscht ist. Deshalb gilt der Neuversuch für beide
       * Fälle; er läuft mit `forceNew` und damit mit eigenem Schlüssel.
       */
      if (!(err instanceof provider.ZernioError) || err.status !== 404) throw err

      await getDb(env)
        .delete(schema.publishProfiles)
        .where(and(profilesOf(owner), eq(schema.publishProfiles.providerProfileId, profileId)))
      ;({ profileId } = await profileForNextAccount(env, owner, platform, { forceNew: true }))

      const { authUrl } = await provider.connectUrl(env, { platform, profileId, redirectUrl, loginMethod })
      return await issued(profileId, authUrl)
    }
  } catch (err) {
    const message = err instanceof provider.ZernioError ? err.short : String(err)
    await noteConnectError(env, owner, message)
    throw err
  }
}

/**
 * Verbinden für ein Projekt — Kunde oder Administrator. `byAdmin` nimmt den
 * Account von der Obergrenze aus (siehe `ACCOUNT_LIMIT`).
 */
export async function connectUrlForProject(
  env: Env,
  projectId: string,
  platform: Platform,
  redirectUrl: string,
  opts: { loginMethod?: provider.InstagramLoginMethod; byAdmin?: boolean } = {},
): Promise<string> {
  return connectUrlFor(env, { projectId }, platform, redirectUrl, opts.loginMethod, opts.byAdmin)
}

/**
 * Verbinden für einen Creator — einmal für alle seine Kampagnen.
 *
 * Für X darf die Rückkehradresse URL-kodiert höchstens 258 Zeichen lang
 * sein (siehe `connectUrl` in zernio.ts); eine kurze Adresse wie
 * `/kampagnen/accounts` ist weit darunter.
 */
export async function connectUrlForCreator(
  env: Env,
  creatorId: string,
  platform: Platform,
  redirectUrl: string,
  loginMethod?: provider.InstagramLoginMethod,
): Promise<string> {
  return connectUrlFor(env, { creatorId }, platform, redirectUrl, loginMethod)
}

/* ---------------------------------------------------------------- Accounts */

/**
 * Die verbundenen Accounts eines Projekts — Zielliste und Anzeige zugleich.
 *
 * Zweitverbindungen desselben echten Kontos werden hier ausgesiebt. Die
 * Sperre beim Verbinden verhindert sie bereits; dies ist das Netz darunter,
 * falls eine Dublette auf anderem Weg hereinkommt (etwa über einen Abgleich,
 * wenn drüben von Hand etwas verbunden wurde). Der Preis eines Durchrutschers
 * wäre ein Video, das zweimal auf demselben Profil landet — das ist der
 * peinlichste aller Fehler und darf nicht von einer einzigen Prüfung abhängen.
 *
 * Nur die Accounts DES PROJEKTS. Was ein Clip insgesamt automatisch bekommt,
 * liefert `autoTargetAccounts`.
 */
export async function accountsForProject(env: Env, projectId: string) {
  const rows = await getDb(env)
    .select()
    .from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.projectId, projectId))
    .orderBy(schema.publishAccounts.platform, schema.publishAccounts.username)
  return dedupeAccounts(rows)
}

/** Plattform und Kontoname als Vergleichsschlüssel — leer, wenn kein Name bekannt ist. */
function handleKey(platform: string, username: string | null | undefined): string {
  const handle = (username ?? '').replace(/^@/, '').toLowerCase()
  return handle ? `${platform}:${handle}` : ''
}

/** Behält je Plattform und Kontoname den ersten Eintrag. */
function dedupeAccounts<T extends { platform: string; username: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const key = handleKey(row.platform, row.username)
    // Ohne Kontonamen lässt sich nichts vergleichen — dann lieber behalten.
    if (!key) {
      out.push(row)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/**
 * D1 bindet höchstens 100 Parameter je Abfrage. Die Adminseiten listen alle
 * Projekte bzw. alle Creator ungefiltert — ein `inArray` über die ganze
 * Liste bräche ab dem hunderteinsten. Deshalb in Stücken, mit Luft für die
 * übrigen Parameter (wie `ID_CHUNK` in routes/work.ts).
 */
const ID_CHUNK = 90

async function inChunks<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(...(await query(ids.slice(i, i + ID_CHUNK))))
  return out
}

/** Dasselbe für viele Projekte auf einmal — die Adminseite listet alle. */
export async function accountsForProjects(env: Env, projectIds: string[]) {
  if (!projectIds.length) return []
  const rows = await inChunks(projectIds, (ids) =>
    getDb(env)
      .select()
      .from(schema.publishAccounts)
      .where(inArray(schema.publishAccounts.projectId, ids))
      .orderBy(schema.publishAccounts.platform, schema.publishAccounts.username),
  )

  // Je Projekt aussieben, nicht über alle hinweg: derselbe Kontoname kann bei
  // zwei verschiedenen Kunden völlig legitim auftauchen.
  return projectIds.flatMap((id) => dedupeAccounts(rows.filter((r) => r.projectId === id)))
}

/** Die verbundenen Accounts eines Creators — mit demselben Netz gegen Dubletten. */
export async function accountsForCreator(env: Env, creatorId: string) {
  const rows = await getDb(env)
    .select()
    .from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.creatorId, creatorId))
    .orderBy(schema.publishAccounts.platform, schema.publishAccounts.username)
  return dedupeAccounts(rows)
}

/** Dasselbe für viele Creator — je Creator ausgesiebt, nicht über alle hinweg. */
export async function accountsForCreators(env: Env, creatorIds: string[]) {
  if (!creatorIds.length) return []
  // In Stücken: Creator tragen sich selbst ein, die Liste wächst ohne Zutun.
  const rows = await inChunks(creatorIds, (ids) =>
    getDb(env)
      .select()
      .from(schema.publishAccounts)
      .where(inArray(schema.publishAccounts.creatorId, ids))
      .orderBy(schema.publishAccounts.platform, schema.publishAccounts.username),
  )
  return creatorIds.flatMap((id) => dedupeAccounts(rows.filter((r) => r.creatorId === id)))
}

/**
 * Der Creator, dem ein Projekt gehört — oder `null`, wenn es ein Kunde ist.
 *
 * Ein Creator legt eigene Kampagnen über seine Zeile in `customers` an; der
 * Weg vom Projekt zu ihm führt deshalb über denselben Nutzer.
 */
export async function ownerCreatorOfProject(env: Env, projectId: string): Promise<string | null> {
  const [row] = await getDb(env)
    .select({ creatorId: schema.creators.id })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(schema.creators, eq(schema.creators.userId, schema.customers.userId))
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  return row?.creatorId ?? null
}

/**
 * Die AUTOMATISCHEN Ziele eines Projekts: seine eigenen Accounts und — wenn
 * ein Creator die Kampagne selbst angelegt hat — dessen Accounts.
 *
 * Damit geht ein fertiger Clip aus der eigenen Kampagne eines Creators ohne
 * weiteren Klick auf seine Kanäle; er hat ihn ja selbst in Auftrag gegeben.
 * Kunden-Kampagnen dagegen erreichen Creator-Accounts NIE auf diesem Weg,
 * sondern nur über eine Freigabe (`publishForCreator`).
 *
 * Über beide Listen hinweg wird noch einmal ausgesiebt: hat jemand dasselbe
 * echte Konto am Projekt UND beim Creator verbunden, bekäme es den Clip
 * sonst zweimal.
 */
export async function autoTargetAccounts(env: Env, projectId: string) {
  const own = await accountsForProject(env, projectId)
  const creatorId = await ownerCreatorOfProject(env, projectId)
  if (!creatorId) return own
  return dedupeAccounts([...own, ...(await accountsForCreator(env, creatorId))])
}

/**
 * Holt den Account-Stand eines Besitzers frisch vom Anbieter und schreibt
 * den Spiegel fort.
 *
 * Nötig, weil die Accounts von Hand verbunden werden: ohne Abgleich erführe
 * unsere Seite erst beim nächsten Webhook davon — und der erste Webhook kann
 * verloren gehen, ohne dass es jemand merkt.
 *
 * Auch hier gilt die Obergrenze (`beyondAccountLimit`) für Accounts, die
 * NEU hereinkommen: blieben Rückkehr und Webhook aus, übernähme sonst
 * „Accounts aktualisieren“ beide Accounts aus zwei vorab geöffneten Links
 * (nachgestellt: 11 statt 10). Was schon im Spiegel steht, fasst die Grenze
 * nie an; was der Administrator verbunden hat, erkennt sie an seinem
 * Steckplatz.
 *
 * `null` heißt: nichts abzugleichen (keine Anbindung oder kein Steckplatz).
 */
async function syncOwnerAccounts(env: Env, owner: AccountOwner): Promise<number | null> {
  if (!publishingReady(env)) return null

  const db = getDb(env)
  const profiles = await db.select().from(schema.publishProfiles).where(profilesOf(owner))
  if (!profiles.length) return null

  const known = new Set(
    (
      await db
        .select({ id: schema.publishAccounts.providerAccountId })
        .from(schema.publishAccounts)
        .where(accountsOf(owner))
    ).map((r) => r.id),
  )
  /** Neu im Spiegel, in der Reihenfolge des Eintrags — Account-ID → Steckplatz. */
  const added = new Map<string, string>()

  const seen: string[] = []
  /*
   * Steckplätze, deren Abfrage scheiterte. Ihre Accounts bleiben stehen:
   * ein Zeitfehler beim Anbieter heißt nicht, dass sie getrennt wurden, und
   * sie zu löschen, nähme ihnen genau den Clip, der gerade rausgehen soll.
   * Nur ein 404 — Steckplatz drüben verschwunden — zählt als „leer".
   */
  const unknown = new Set<string>()
  const ts = nowSec()

  for (const slot of profiles) {
    let accounts
    try {
      accounts = (await provider.listAccounts(env, { profileId: slot.providerProfileId })).accounts
    } catch (err) {
      console.error('[publisher] Abgleich fehlgeschlagen', slot.providerProfileId, String(err).slice(0, 200))
      if (!(err instanceof provider.ZernioError && err.status === 404)) unknown.add(slot.providerProfileId)
      continue
    }

    for (const account of accounts ?? []) {
      /*
       * Ein Account, dessen Verbindung nicht mehr trägt, ist kein Ziel.
       *
       * Die Liste des Anbieters enthält ohne Filter auch abgelaufene oder
       * entzogene Verbindungen. Übernähmen wir sie, stünde ein toter Account
       * als „verbunden" da, jeder Clip scheiterte daran — und weil sein
       * Steckplatz belegt wirkte, landete ein Neuverbinden in einem neuen
       * Steckplatz und würde dort als Dublette verworfen. Ausgelassen fällt er
       * unten als „drüben nicht mehr da" aus dem Spiegel, sein Steckplatz gilt
       * als frei, und das nächste Verbinden dieser Plattform repariert genau
       * diese Verbindung.
       */
      if (account.isActive === false || account.needsReconnection === true) continue
      seen.push(account._id)
      if (!known.has(account._id)) added.set(account._id, slot.providerProfileId)
      const values = {
        providerAccountId: account._id,
        // Beide Besitzerspalten ausdrücklich — sonst bliebe beim Überschreiben
        // eine alte stehen und der CHECK schlüge an.
        ...ownerValues(owner),
        providerProfileId: slot.providerProfileId,
        platform: account.platform,
        username: account.username ?? null,
        displayName: account.displayName ?? null,
        updatedAt: ts,
      }
      await db
        .insert(schema.publishAccounts)
        .values(values)
        .onConflictDoUpdate({ target: schema.publishAccounts.providerAccountId, set: values })
    }
  }

  // Was drüben nicht mehr existiert, verschwindet auch hier — sonst würde ein
  // getrennter Account weiter als Ziel gelten und jeder Post daran scheitern.
  const stale = await db
    .select({
      id: schema.publishAccounts.providerAccountId,
      profileId: schema.publishAccounts.providerProfileId,
    })
    .from(schema.publishAccounts)
    .where(accountsOf(owner))
  for (const row of stale) {
    if (!seen.includes(row.id) && !unknown.has(row.profileId)) {
      await db
        .delete(schema.publishAccounts)
        .where(eq(schema.publishAccounts.providerAccountId, row.id))
    }
  }

  /*
   * Erst NACH dem Aufräumen zählen: ein Account, der drüben nicht mehr da
   * ist, soll keinem neuen den Platz wegnehmen. Der Reihe nach — ist der
   * erste neue verworfen, zählt er für den zweiten nicht mehr mit.
   */
  let count = seen.length
  for (const [id, profileId] of added) {
    if (!(await beyondAccountLimit(env, owner, id))) continue
    console.error('[publisher] Account über der Obergrenze verworfen', id)
    await discardBeyondLimit(env, id, profileId)
    count--
  }

  return count
}

/** Abgleich für ein Projekt — danach zieht die Account-Gruppe nach. */
export async function syncAccounts(env: Env, projectId: string): Promise<number> {
  const count = await syncOwnerAccounts(env, { projectId })
  if (count === null) return 0
  await syncGroup(env, projectId)
  return count
}

/** Abgleich für einen Creator. Creator haben keine Account-Gruppe drüben. */
export async function syncCreatorAccounts(env: Env, creatorId: string): Promise<number> {
  return (await syncOwnerAccounts(env, { creatorId })) ?? 0
}

/**
 * Vor dem Senden: alle automatischen Ziele frisch abgleichen — die des
 * Projekts und, falls ein Creator die Kampagne besitzt, seine.
 */
async function syncAutoTargets(env: Env, projectId: string): Promise<void> {
  await syncAccounts(env, projectId)
  const creatorId = await ownerCreatorOfProject(env, projectId)
  if (creatorId) await syncCreatorAccounts(env, creatorId)
}

/** Ausgang eines Verbindungsversuchs. */
export type UpsertResult =
  /** Neu eingetragen oder aktualisiert. */
  | { state: 'ok'; owner: AccountOwner }
  /** Derselbe echte Account hängt schon an diesem Besitzer. */
  | { state: 'duplicate'; owner: AccountOwner; username: string }
  /** Der Steckplatz gehört zu keinem unserer Projekte oder Creator. */
  | { state: 'unknown' }

/**
 * Pflegt einen einzelnen Account — Gegenstück zu den Webhook-Ereignissen und
 * zur Rückkehr aus dem Verbinden-Ablauf.
 *
 * Wem der Account gehört, entscheidet allein der Steckplatz: ein Steckplatz
 * eines Projekts macht ihn zum Projekt-Account, einer eines Creators zum
 * Creator-Account.
 *
 * `withGroup: false` lässt die Account-Gruppe unangetastet. Das ist für den
 * Seitenaufruf nach dem Verbinden gedacht: dort zählt, dass der Account
 * SOFORT sichtbar ist. Die Gruppe ist reine Lesbarkeit drüben und darf
 * hinterher im Hintergrund nachziehen, statt die Seite auf einen fremden
 * Dienst warten zu lassen. Creator haben keine Gruppe.
 *
 * DUBLETTEN werden abgewiesen. Das ist keine Kür: Instagram, TikTok und
 * YouTube zeigen im Zustimmungsdialog immer das Konto, mit dem der Browser
 * gerade angemeldet ist. Wer zweimal hintereinander verbindet, ohne bei der
 * Plattform das Konto zu wechseln, verbindet zweimal DASSELBE Konto — nur
 * unter zwei verschiedenen IDs. Der Anbieter merkt das nicht; für ihn sind
 * es zwei Accounts. Bei uns wäre die Folge, dass jedes Video doppelt auf
 * demselben Profil landet, und dazu doppelte Kosten, weil je verbundenem
 * Account abgerechnet wird.
 */
export async function upsertAccount(
  env: Env,
  account: {
    id: string
    profileId: string
    platform: string
    username?: string | null
    displayName?: string | null
  },
  opts: { withGroup?: boolean } = {},
): Promise<UpsertResult> {
  const db = getDb(env)
  const owner = await ownerForProfile(env, account.profileId)
  // Ein Profil, das zu keinem unserer Projekte oder Creator gehört (etwa von
  // Hand angelegt), geht uns nichts an.
  if (!owner) return { state: 'unknown' }

  const handle = handleKey(account.platform, account.username)
  if (handle) {
    const siblings = await db
      .select()
      .from(schema.publishAccounts)
      .where(and(accountsOf(owner), eq(schema.publishAccounts.platform, account.platform)))
    const clash = siblings.find(
      (a) => a.providerAccountId !== account.id && handleKey(a.platform, a.username) === handle,
    )
    if (clash) {
      return {
        state: 'duplicate',
        owner,
        username: (account.username ?? '').replace(/^@/, '').toLowerCase(),
      }
    }
  }

  const values = {
    providerAccountId: account.id,
    ...ownerValues(owner),
    providerProfileId: account.profileId,
    platform: account.platform,
    username: account.username ?? null,
    displayName: account.displayName ?? null,
    updatedAt: nowSec(),
  }
  await db
    .insert(schema.publishAccounts)
    .values(values)
    .onConflictDoUpdate({ target: schema.publishAccounts.providerAccountId, set: values })

  if (opts.withGroup !== false && !isCreatorOwner(owner)) await syncGroup(env, owner.projectId)
  return { state: 'ok', owner }
}

/**
 * Macht eine versehentliche Doppelverbindung rückgängig.
 *
 * Trennt den frisch verbundenen Account beim Anbieter und räumt den
 * Steckplatz ab, der dafür entstanden ist. Ohne das bliebe ein zweiter
 * Zugang zu demselben Konto bestehen — er würde weiter abgerechnet, und
 * beim nächsten Abgleich käme er als eigener Account zurück.
 *
 * Wirft nie: der Nutzer hat bereits eine klare Meldung bekommen, und ein
 * hängengebliebener Rest drüben ist kein Grund, die Seite scheitern zu
 * lassen.
 */
export async function discardDuplicateAccount(
  env: Env,
  accountId: string,
  profileId: string,
): Promise<void> {
  const db = getDb(env)
  try {
    await provider.disconnectAccount(env, accountId)
  } catch (err) {
    console.error('[publisher] Dublette nicht getrennt', accountId, String(err).slice(0, 200))
  }

  // Den Steckplatz nur abräumen, wenn er wirklich leer ist — sonst risse man
  // einem gültigen Account den Boden weg.
  const [used] = await db
    .select({ id: schema.publishAccounts.providerAccountId })
    .from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.providerProfileId, profileId))
    .limit(1)
  if (used) return

  /*
   * Die Zeile verschwindet nur, wenn das Profil drüben wirklich weg ist.
   * Scheitert das Löschen (meist, weil das Trennen eben scheiterte und der
   * Account noch dranhängt), bliebe sonst drüben ein Profil, das wir nicht
   * mehr kennen: die nächste Steckplatznummer ergäbe denselben Namen, und
   * nach Ablauf des Schlüssels lehnte die Gegenseite ihn als vergeben ab.
   * Stehen gelassen gilt der Steckplatz als frei (kein Account im Spiegel)
   * und wird beim nächsten Verbinden wiederverwendet — das Verbinden dort
   * ersetzt dann auch den hängengebliebenen Account.
   */
  try {
    await provider.deleteProfile(env, profileId)
  } catch (err) {
    console.error('[publisher] Steckplatz nicht entfernt', profileId, String(err).slice(0, 200))
    return
  }
  await db
    .delete(schema.publishProfiles)
    .where(eq(schema.publishProfiles.providerProfileId, profileId))
}

/** Die Account-Gruppe eines Projekts nachziehen — für Aufrufe im Hintergrund. */
export async function refreshGroupForProject(env: Env, projectId: string): Promise<void> {
  await syncGroup(env, projectId)
}

/** Wem gehört dieser Steckplatz — einem Projekt, einem Creator oder niemandem? */
export async function ownerForProfile(env: Env, profileId: string): Promise<AccountOwner | null> {
  const [row] = await getDb(env)
    .select({
      projectId: schema.publishProfiles.projectId,
      creatorId: schema.publishProfiles.creatorId,
    })
    .from(schema.publishProfiles)
    .where(eq(schema.publishProfiles.providerProfileId, profileId))
    .limit(1)
  return row ? ownerOf(row) : null
}

/** Zu welchem Projekt gehört dieser Steckplatz? `null` auch für Creator-Steckplätze. */
export async function projectForProfile(env: Env, profileId: string): Promise<string | null> {
  const owner = await ownerForProfile(env, profileId)
  return owner && !isCreatorOwner(owner) ? owner.projectId : null
}

/**
 * Trägt eine Trennung NACH, die schon bei Zernio passiert ist — ausgelöst vom
 * Webhook `account.disconnected`. Trennt hier NICHTS mehr drüben; das ist
 * genau der Unterschied zu `disconnectAccountFromProject`.
 */
export async function removeAccount(env: Env, accountId: string): Promise<void> {
  const db = getDb(env)
  const [row] = await db
    .select({ projectId: schema.publishAccounts.projectId })
    .from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.providerAccountId, accountId))
    .limit(1)

  await db
    .delete(schema.publishAccounts)
    .where(eq(schema.publishAccounts.providerAccountId, accountId))

  // Nur Projekte haben eine Gruppe drüben; ein Creator-Account ist mit dem
  // Löschen der Zeile erledigt.
  if (row?.projectId) await syncGroup(env, row.projectId)
}

/**
 * Trennt einen verbundenen Account auf Wunsch — die Gegenrichtung zu
 * `removeAccount`: hier STÖSST der Klick im Dashboard die Trennung bei
 * Zernio erst an, statt nur einen Webhook nachzuvollziehen.
 *
 * Der Steckplatz bleibt bestehen, nur leer. Das ist kein Rest, sondern
 * Absicht: `profileForNextAccount` verwendet einen leeren Steckplatz beim
 * nächsten Verbinden dieser Plattform automatisch wieder, statt einen neuen
 * anzulegen.
 *
 * Schlägt die Trennung bei Zernio fehl (Netz, bereits dort entfernt, …),
 * verschwindet der Account trotzdem aus unserer Liste — hier wurde geklickt,
 * damit der Account bei uns weg ist, und ein Rest drüben darf daran nicht
 * hindern. Der nächste Abgleich oder Webhook räumt das gegebenenfalls nach.
 *
 * Getrennt wird nur, was diesem Besitzer gehört. Eine fremde Account-ID
 * liefert `false` — so kann niemand über die eigene Seite die Accounts
 * eines anderen trennen.
 */
async function disconnectOwnedAccount(
  env: Env,
  owner: AccountOwner,
  accountId: string,
): Promise<boolean> {
  const db = getDb(env)
  const [row] = await db
    .select({ id: schema.publishAccounts.providerAccountId })
    .from(schema.publishAccounts)
    .where(and(eq(schema.publishAccounts.providerAccountId, accountId), accountsOf(owner)))
    .limit(1)
  if (!row) return false

  if (publishingReady(env)) {
    try {
      await provider.disconnectAccount(env, accountId)
    } catch (err) {
      console.error('[publisher] Account nicht getrennt', accountId, String(err).slice(0, 200))
    }
  }

  await db.delete(schema.publishAccounts).where(eq(schema.publishAccounts.providerAccountId, accountId))
  if (!isCreatorOwner(owner)) await syncGroup(env, owner.projectId)
  return true
}

/** Einen Account eines Projekts trennen — Kunde oder Administrator. */
export async function disconnectAccountFromProject(
  env: Env,
  projectId: string,
  accountId: string,
): Promise<boolean> {
  return disconnectOwnedAccount(env, { projectId }, accountId)
}

/** Einen Account eines Creators trennen. */
export async function disconnectAccountFromCreator(
  env: Env,
  creatorId: string,
  accountId: string,
): Promise<boolean> {
  return disconnectOwnedAccount(env, { creatorId }, accountId)
}

/* ------------------------------------------------ Rückkehr aus dem Verbinden */

/**
 * Wessen Rückkehr erwartet wird. `any` nur für den Administrator: er darf
 * für jedes Projekt verbinden, also passt für ihn jeder Steckplatz.
 */
export type ConnectExpectation = AccountOwner | { any: true }

/** Ergebnis der Rückkehr: eine Meldung für die Seite plus Nacharbeit. */
export interface ConnectReturn {
  ok?: string
  error?: string
  /** Wem der Account jetzt gehört — nur bei Erfolg. */
  owner?: AccountOwner
  /**
   * Nacharbeit, die die Seite nicht aufhalten soll: eine Dublette drüben
   * wieder trennen, die Account-Gruppe nachziehen. Sie läuft bereits; die
   * Route steckt sie in `executionCtx.waitUntil`, damit der Worker sie nicht
   * mittendrin abräumt. Bewusst ein laufendes Promise und keine Funktion zum
   * späteren Aufruf: vergisst eine Route das `waitUntil`, bleibt eine
   * Dublette sonst einfach verbunden — und jedes Video ginge doppelt raus.
   */
  background?: Promise<void>
}

const CONNECT_TEXT = {
  de: {
    cancelled: (why: string) => `Verbindung abgebrochen: ${why}`,
    unsupported: (p: string) => `Die Plattform „${p}“ wird nicht unterstützt.`,
    unknown:
      'Diese Verbindung ließ sich keinem Bereich zuordnen. Starte sie bitte noch einmal über den Knopf „Verbinden“.',
    foreign:
      'Diese Verbindung gehört nicht zu deinem Bereich und wurde nicht übernommen. Starte sie bitte noch einmal über den Knopf „Verbinden“.',
    duplicate: (user: string, p: string) =>
      `@${user} ist hier bereits verbunden, die doppelte Verbindung wurde verworfen. ` +
      `Für einen WEITEREN ${p}-Account melde dich zuerst bei ${p} ab und mit dem anderen Account an ` +
      '(oder nutze ein privates Browserfenster). Sonst zeigt die Zustimmungsseite immer denselben Account.',
    pending: (what: string) =>
      `${what} ist verbunden: der Account erscheint hier, sobald der Anbieter die Verbindung bestätigt.`,
    redeemed:
      'Die Verbindung wurde bereits übernommen, der Account erscheint hier, sobald der Anbieter sie bestätigt. Lade die Seite dazu gleich neu.',
    connected: (what: string) => `${what} verbunden.`,
    limit: (n: number) =>
      `Hier sind bereits ${n} Accounts verbunden: das ist die Obergrenze, dieser Account wurde nicht übernommen. ` +
      'Trenne einen, den du nicht mehr brauchst, oder schreib uns, wenn du mehr brauchst.',
  },
  en: {
    cancelled: (why: string) => `Connection cancelled: ${why}`,
    unsupported: (p: string) => `Platform "${p}" is not supported.`,
    unknown:
      'The connected account does not belong to any project on this platform. ' +
      'Was it created directly with the provider?',
    foreign: 'This connection does not belong here and was not saved. Please start it again with the Connect button.',
    duplicate: (user: string, p: string, where: string) =>
      `@${user} is already connected to this ${where}: the duplicate connection was discarded. ` +
      `For an ADDITIONAL ${p} account, first log out of ${p} and sign in with the other account ` +
      '(or use a private browser window). Otherwise the consent page always shows the same account.',
    pending: (what: string) => `${what} connected: the account appears as soon as the provider confirms it.`,
    redeemed:
      'This connection was already completed, the account appears as soon as the provider confirms it. Reload the page in a moment.',
    connected: (what: string) => `${what} connected.`,
    limit: (n: number) =>
      `${n} accounts are already connected here, that is the limit, so this account was not added. ` +
      'Disconnect one you no longer need, or contact us if you need more.',
  },
} as const

/**
 * Verarbeitet die Rückkehr aus dem OAuth-Ablauf des Anbieters — für
 * Administrator, Kunde und Creator gleichermaßen.
 *
 * Der Anbieter hängt seine Ergebnisse an unsere Adresse an und lässt eine
 * bestehende Abfrage stehen. Bei Erfolg stehen dort `connected`, `profileId`,
 * `accountId` und `username`; bei einem Abbruch ein `error`. Damit steht
 * alles fest, was der Account braucht — er wird sofort eingetragen, statt
 * auf den Webhook zu warten. Doppelt eingetragen wird nichts, weil die
 * Account-ID der Primärschlüssel ist.
 *
 * Liefert `undefined`, wenn die Adresse gar keine Rückkehr trägt.
 *
 * SICHERHEIT. Die Abfrage kommt aus dem Browser und lässt sich von Hand
 * zusammenbauen. Solange nur der Administrator verband, war das
 * gleichgültig. Seit Kunden und Creator selbst verbinden, gilt:
 *
 *   - Der Steckplatz (`profileId`) muss dem erwarteten Besitzer gehören —
 *     dem Projekt des eingeloggten Kunden bzw. dem eingeloggten Creator.
 *     Sonst könnte jemand einen fremden Steckplatz in seine Rückkehr
 *     schreiben.
 *
 *   - Die Account-ID wird beim Anbieter gegengeprüft: sie muss wirklich in
 *     diesem Steckplatz hängen, und Plattform und Kontoname kommen von dort,
 *     nicht aus der Adresse. Account-IDs sind fortlaufend vergeben und damit
 *     zu erraten; ohne die Prüfung ließe sich ein fremder Account in den
 *     eigenen Steckplatz schreiben — und beim Überschreiben der Zeile dem
 *     rechtmäßigen Besitzer wegnehmen.
 *
 *   - Ein Account, der bei uns schon einem ANDEREN Besitzer gehört, wird
 *     nie umgehängt.
 *
 * Für den Administrator (`{ any: true }`) entfällt NUR die erste Prüfung —
 * er darf für jedes Projekt verbinden. Die beiden anderen gelten auch für
 * ihn: die Rückkehr ist ein GET mit Wirkung, und seit Kunden und Creator
 * ihre eigenen Steckplatz-IDs in der Adresse sehen, kann jeder von ihnen
 * einen Link mit fremder Account-ID und eigenem Steckplatz bauen. Klickt der
 * Administrator ihn an, hinge sonst der Instagram-Account eines Kunden am
 * Creator — und dessen Kampagnen-Clips gingen auf den Kanal des Kunden. Die
 * Prüfung kostet einen Aufruf beim Anbieter, aber nur bei einer Rückkehr,
 * nicht bei jedem Laden der Projektliste.
 */
export async function absorbConnectReturn(
  env: Env,
  query: {
    connected?: string
    accountId?: string
    profileId?: string
    username?: string
    error?: string
    /** `error_message` des Anbieters — lesbarer als der Fehlercode allein. */
    errorMessage?: string
  },
  expected: ConnectExpectation,
  lang: 'de' | 'en',
): Promise<ConnectReturn | undefined> {
  const t = CONNECT_TEXT[lang]

  /*
   * `code_already_redeemed` ist KEIN Abbruch: derselbe Autorisierungscode kam
   * zweimal an (Doppeltipp auf der Zustimmungsseite, Callback doppelt
   * aufgerufen), und die erste Anfrage hat den Account bereits verbunden.
   * Als „abgebrochen" gemeldet, verbände der Nutzer neu — in einen neuen
   * Steckplatz, der dann als Dublette verworfen würde. Stattdessen der
   * Hinweis „kommt gleich", und für den erwarteten Besitzer gleich ein
   * Abgleich, damit der Account ohne Warten auf den Webhook erscheint. Beim
   * Administrator (`any`) ist der Besitzer unbekannt; dort bleibt es beim
   * Hinweis.
   */
  if (query.error === 'code_already_redeemed') {
    return {
      ok: t.redeemed,
      background:
        'any' in expected
          ? undefined
          : (isCreatorOwner(expected)
              ? syncCreatorAccounts(env, expected.creatorId)
              : syncAccounts(env, expected.projectId)
            ).then(
              () => undefined,
              (err) => console.error('[publisher] Abgleich nach Rückkehr fehlgeschlagen', String(err).slice(0, 200)),
            ),
    }
  }

  if (query.error) {
    return { error: t.cancelled((query.errorMessage || query.error).slice(0, 200)) }
  }

  const platform = query.connected
  const accountId = query.accountId
  const profileId = query.profileId
  if (!platform || !accountId || !profileId) return undefined

  /*
   * Nur Plattformen übernehmen, die wir auch veröffentlichen können.
   *
   * Über die Knöpfe kann nichts anderes hereinkommen. Eine von Hand
   * zusammengebaute Adresse aber schon — und ein Account, den wir eintragen,
   * aber nicht bedienen können, würde später jeden Post daran scheitern
   * lassen. Lieber hier ablehnen als still eine Zeitbombe speichern.
   */
  if (!isConnectable(platform)) return { error: t.unsupported(platform.slice(0, 40)) }

  const owner = await ownerForProfile(env, profileId)
  if (!owner) return { error: t.unknown }

  if (!('any' in expected) && !sameOwner(owner, expected)) return { error: t.foreign }

  const [existing] = await getDb(env)
    .select({
      projectId: schema.publishAccounts.projectId,
      creatorId: schema.publishAccounts.creatorId,
    })
    .from(schema.publishAccounts)
    .where(eq(schema.publishAccounts.providerAccountId, accountId))
    .limit(1)
  const existingOwner = existing ? ownerOf(existing) : null
  if (existingOwner && !sameOwner(existingOwner, owner)) return { error: t.foreign }

  let listed: provider.ZernioAccount[]
  try {
    listed = (await provider.listAccounts(env, { profileId })).accounts ?? []
  } catch (err) {
    // Der Anbieter ist gerade nicht zu erreichen. Eingetragen wird dann
    // nichts — der Webhook `account.connected` holt es nach, er ist
    // signiert und braucht diese Prüfung nicht.
    console.error('[publisher] Rückkehr nicht prüfbar', profileId, String(err).slice(0, 200))
    return { ok: t.pending(platformLabel(platform)) }
  }
  const real = listed.find((a) => a._id === accountId)
  if (!real || !isConnectable(real.platform)) return { error: t.foreign }
  const account = {
    id: accountId,
    profileId,
    platform: real.platform,
    username: real.username ?? null,
    displayName: real.displayName ?? null,
  }

  const label = platformLabel(account.platform)
  const result = await upsertAccount(
    env,
    account,
    // Die Gruppe zieht gleich im Hintergrund nach.
    { withGroup: false },
  )

  if (result.state === 'unknown') return { error: t.unknown }

  /*
   * Doppelt verbundenes Konto.
   *
   * Der Zustimmungsdialog der Plattform zeigt immer das Konto, mit dem der
   * Browser gerade angemeldet ist. Zweimal hintereinander klicken heißt
   * deshalb: zweimal dasselbe Konto, nur unter zwei IDs. Bliebe das stehen,
   * ginge jedes Video doppelt auf dasselbe Profil — und es kostet doppelt.
   */
  if (result.state === 'duplicate') {
    return {
      error:
        lang === 'en'
          ? CONNECT_TEXT.en.duplicate(result.username, label, isCreatorOwner(result.owner) ? 'creator' : 'project')
          : CONNECT_TEXT.de.duplicate(result.username, label),
      background: discardDuplicateAccount(env, accountId, profileId),
    }
  }

  /*
   * Jenseits der Obergrenze: zwei Links, vor dem Verbinden geöffnet, kamen
   * beide durch (siehe `beyondAccountLimit`). Gleich aus dem Spiegel, damit
   * die Seite ihn nicht zeigt; drüben getrennt wird im Hintergrund.
   */
  if (!('any' in expected) && (await beyondAccountLimit(env, result.owner, accountId))) {
    await getDb(env)
      .delete(schema.publishAccounts)
      .where(eq(schema.publishAccounts.providerAccountId, accountId))
    return {
      error: t.limit(isCreatorOwner(result.owner) ? ACCOUNT_LIMIT.creator : ACCOUNT_LIMIT.customer),
      background: discardDuplicateAccount(env, accountId, profileId),
    }
  }

  const handle = account.username ? ` @${account.username.replace(/^@/, '')}` : ''
  return {
    ok: t.connected(`${label}${handle}`),
    owner: result.owner,
    // Account-Gruppe nachziehen und die direkt geposteten Videos des Accounts
    // gleich abholen (lib/metrics.ts), damit ihre Views sofort dastehen.
    background: isCreatorOwner(result.owner)
      ? undefined
      : Promise.all([
          refreshGroupForProject(env, result.owner.projectId),
          syncExternalAfterConnect(env, result.owner.projectId, accountId),
        ]).then(() => undefined),
  }
}

/* ------------------------------------------------------------ Account-Gruppe */

/**
 * Hält die Account-Gruppe des Projekts beim Anbieter aktuell.
 *
 * Die Gruppe ist reine Lesbarkeit: sie zeigt im Dashboard der Gegenseite
 * alle Accounts eines Kunden nebeneinander, über Profilgrenzen hinweg. Für
 * den Versand ist sie ohne Bedeutung — die Zielliste steht bei uns. Deshalb
 * darf hier alles schiefgehen, ohne dass etwas anderes stehen bleibt.
 *
 * Eine LEERE Gruppe nimmt die Gegenseite nicht an (400, „expected array to
 * have >=1 items"), obwohl die Spec kein Minimum nennt. Sie entsteht daher
 * erst mit dem ersten Account.
 *
 * Nur für Projekte. Creator-Accounts brauchen keine: ein Creator sieht das
 * Dashboard der Gegenseite nie.
 */
async function syncGroup(env: Env, projectId: string): Promise<void> {
  try {
    const db = getDb(env)
    const accounts = await accountsForProject(env, projectId)
    const accountIds = accounts.map((a) => a.providerAccountId)
    if (!accountIds.length) return

    const label = await projectLabel(env, projectId)
    const name = `${label} (${projectId.slice(0, 6)})`

    const [existing] = await db
      .select()
      .from(schema.publishGroups)
      .where(eq(schema.publishGroups.projectId, projectId))
      .limit(1)

    if (existing) {
      await provider.updateGroup(env, existing.providerGroupId, { name, accountIds })
      await db
        .update(schema.publishGroups)
        .set({ updatedAt: nowSec() })
        .where(eq(schema.publishGroups.projectId, projectId))
      return
    }

    const { group } = await provider.createGroup(env, { name, accountIds })
    await db
      .insert(schema.publishGroups)
      .values({ projectId, providerGroupId: group._id, updatedAt: nowSec() })
      .onConflictDoUpdate({
        target: schema.publishGroups.projectId,
        set: { providerGroupId: group._id, updatedAt: nowSec() },
      })
  } catch (err) {
    console.error('[publisher] Gruppe konnte nicht gepflegt werden', projectId, String(err).slice(0, 200))
  }
}

/* ------------------------------------------------------------------ Kosten */

/**
 * Wie viele Accounts bei uns verbunden sind — getrennt nach Besitzer.
 *
 * Gezählt werden die Zeilen des Spiegels, ohne Dubletten auszusieben: der
 * Anbieter rechnet je verbundenem Account ab, und eine Dublette, die wir beim
 * Versand übergehen, kostet trotzdem.
 */
export async function connectedAccountStats(
  env: Env,
): Promise<{ projectAccounts: number; creatorAccounts: number; total: number }> {
  const [row] = await getDb(env)
    .select({
      projectAccounts: sql<number>`coalesce(sum(case when ${schema.publishAccounts.projectId} is not null then 1 else 0 end), 0)`,
      creatorAccounts: sql<number>`coalesce(sum(case when ${schema.publishAccounts.creatorId} is not null then 1 else 0 end), 0)`,
    })
    .from(schema.publishAccounts)
  const projectAccounts = Number(row?.projectAccounts ?? 0)
  const creatorAccounts = Number(row?.creatorAccounts ?? 0)
  return { projectAccounts, creatorAccounts, total: projectAccounts + creatorAccounts }
}

/**
 * Obergrenzen für SELBST verbundene Accounts.
 *
 * Jeder verbundene Account kostet beim Anbieter monatlich, und seit Kunden
 * und Creator selbst verbinden, gäbe es sonst keine Grenze: ein frisch
 * eingetragener Creator könnte über eine Facebook-Anmeldung Seite um Seite
 * verbinden — jede ein eigener, abgerechneter Account. Die Grenze gilt beim
 * Kunden über ALLE seine Projekte (Projekte legt er unbegrenzt an), beim
 * Creator für sich. Großzügig für echten Gebrauch: zehn Instagram-Accounts
 * eines Kunden sind der Grund, warum es diesen Anbieter gibt. Darüber hinaus
 * verbindet der Administrator — sein Weg kennt keine Grenze.
 */
export const ACCOUNT_LIMIT = { customer: 50, creator: 10 } as const

/** Wie viele Accounts an diesem Creator bzw. an allen Projekten dieses Kunden hängen. */
export async function connectedAccountCount(
  env: Env,
  who: { creatorId: string } | { customerId: string },
): Promise<number> {
  const db = getDb(env)
  if ('creatorId' in who) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.publishAccounts)
      .where(eq(schema.publishAccounts.creatorId, who.creatorId))
    return Number(row?.n ?? 0)
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.publishAccounts)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.publishAccounts.projectId))
    .where(eq(schema.projects.customerId, who.customerId))
  return Number(row?.n ?? 0)
}

/**
 * Liegt dieser frisch verbundene Account jenseits der Obergrenze seines
 * Besitzers (`ACCOUNT_LIMIT`)?
 *
 * Die Routen prüfen die Grenze schon beim Erzeugen des Links. Das allein
 * reicht nicht: wer bei neun Accounts zwei Links öffnet (etwa Instagram und
 * TikTok), bekommt beide, und beide Rückkehrer würden angenommen — elf
 * Accounts (nachgestellt). Deshalb noch einmal, wenn der Account ankommt.
 *
 * Gezählt wird, was VOR ihm eingetragen wurde (`rowid`), nicht alles außer
 * ihm: kommen zwei Rückkehrer gleichzeitig an, sähe sonst jeder den anderen,
 * und beide flögen raus. So fällt genau der spätere heraus.
 *
 * Gefragt wird auf jedem Weg, auf dem ein Account ankommt: Rückkehr,
 * Webhook, Abgleich (`syncOwnerAccounts`). Nur die Rückkehr weiß, wer
 * verbunden hat — deshalb steht es am Steckplatz: hat der Administrator den
 * Link erzeugt (`admin_link_at`, Migration 0016), zählt der Account nie als
 * „drüber“. Er verbindet für Projekte über die Grenze hinaus (siehe
 * `ACCOUNT_LIMIT`).
 */
export async function beyondAccountLimit(env: Env, owner: AccountOwner, accountId: string): Promise<boolean> {
  const db = getDb(env)
  const rowid = sql<number>`${schema.publishAccounts}.rowid`
  const [mine] = await db
    .select({ rowid, adminLinkAt: schema.publishProfiles.adminLinkAt })
    .from(schema.publishAccounts)
    .leftJoin(
      schema.publishProfiles,
      eq(schema.publishProfiles.providerProfileId, schema.publishAccounts.providerProfileId),
    )
    .where(eq(schema.publishAccounts.providerAccountId, accountId))
    .limit(1)
  if (!mine || mine.adminLinkAt !== null) return false
  const earlier = sql`${rowid} < ${mine.rowid}`

  if (isCreatorOwner(owner)) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.publishAccounts)
      .where(and(eq(schema.publishAccounts.creatorId, owner.creatorId), earlier))
    return Number(row?.n ?? 0) >= ACCOUNT_LIMIT.creator
  }

  const [project] = await db
    .select({ customerId: schema.projects.customerId })
    .from(schema.projects)
    .where(eq(schema.projects.id, owner.projectId))
    .limit(1)
  if (!project) return false
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.publishAccounts)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.publishAccounts.projectId))
    .where(and(eq(schema.projects.customerId, project.customerId), earlier))
  return Number(row?.n ?? 0) >= ACCOUNT_LIMIT.customer
}

/**
 * Verwirft einen Account jenseits der Obergrenze: raus aus dem Spiegel, dann
 * drüben getrennt und sein Steckplatz abgeräumt wie bei einer Dublette —
 * sonst würde er weiter abgerechnet.
 */
export async function discardBeyondLimit(env: Env, accountId: string, profileId: string): Promise<void> {
  await getDb(env)
    .delete(schema.publishAccounts)
    .where(eq(schema.publishAccounts.providerAccountId, accountId))
  await discardDuplicateAccount(env, accountId, profileId)
}

/**
 * Preisstufen des Anbieters je verbundenem Account und Monat, in USD
 * (zernio.com/pricing, geprüft am 11.10.2026). Jede Stufe gilt NUR für die
 * Accounts in ihrem Bereich — wie bei Steuerstufen: der elfte Account kostet
 * 3 USD, die Accounts drei bis zehn bleiben bei 6 USD. Keine Grundgebühr.
 */
const PROVIDER_TIERS: readonly { upTo: number; usd: number }[] = [
  { upTo: 2, usd: 0 },
  { upTo: 10, usd: 6 },
  { upTo: 100, usd: 3 },
  { upTo: Infinity, usd: 1 },
]

/** Geschätzte Monatskosten beim Anbieter für `total` verbundene Accounts, in USD. */
export function zernioMonthlyCost(total: number): number {
  const n = Math.max(0, Math.floor(total || 0))
  let cost = 0
  let below = 0
  for (const tier of PROVIDER_TIERS) {
    if (n <= below) break
    cost += (Math.min(n, tier.upTo) - below) * tier.usd
    below = tier.upTo
  }
  return cost
}

/* ---------------------------------------------------------------- Aufräumen */

/**
 * Trennt alle Accounts eines Besitzers beim Anbieter und räumt seine
 * Steckplätze ab. Gemeinsamer Teil von `releaseAtProvider` und
 * `releaseCreatorAtProvider`.
 */
async function releaseOwnerAtProvider(
  env: Env,
  owner: AccountOwner,
): Promise<{ accounts: number; profiles: number; failed: number }> {
  const db = getDb(env)
  let accounts = 0
  let profiles = 0
  let failed = 0

  // Erst die Accounts trennen, dann die Steckplätze abräumen: ein Profil mit
  // hängendem Account lehnt der Anbieter ab (400, „disconnect them first").
  // Hier OHNE Aussieben von Dubletten — auch eine Dublette ist drüben
  // verbunden und kostet.
  const ids = new Set(
    (
      await db
        .select({ id: schema.publishAccounts.providerAccountId })
        .from(schema.publishAccounts)
        .where(accountsOf(owner))
    ).map((r) => r.id),
  )
  const slots = await db.select().from(schema.publishProfiles).where(profilesOf(owner))

  /*
   * Der Spiegel allein reicht nicht. Er kann eine Verbindung verpasst haben —
   * die Rückkehr konnte den Account nicht prüfen und der Webhook ging
   * verloren, oder ein abgelaufener Account fiel beim Abgleich heraus. Hinge
   * so ein Account noch drüben, schlüge das Löschen des Steckplatzes fehl,
   * und weil hier gleich alle Zeilen per Kaskade verschwinden, liefe er ohne
   * jede Spur weiter und würde weiter abgerechnet. Deshalb je Steckplatz
   * beim Anbieter nachsehen und alles trennen, was dort hängt.
   */
  for (const slot of slots) {
    // Ohne Profil-ID fragte `listAccounts` das GANZE Team ab — und hier würde
    // alles getrennt, was dabei herauskommt.
    if (!slot.providerProfileId) continue
    try {
      const listed = (await provider.listAccounts(env, { profileId: slot.providerProfileId })).accounts
      for (const account of listed ?? []) ids.add(account._id)
    } catch (err) {
      // 404: der Steckplatz ist drüben schon weg — dann hängt dort auch nichts.
      if (!(err instanceof provider.ZernioError && err.status === 404)) {
        console.error(
          '[publisher] Steckplatz nicht abfragbar',
          slot.providerProfileId,
          String(err).slice(0, 200),
        )
      }
    }
  }

  for (const id of ids) {
    try {
      await provider.disconnectAccount(env, id)
      accounts++
    } catch (err) {
      failed++
      console.error('[publisher] Account nicht getrennt', id, String(err).slice(0, 200))
    }
  }

  for (const slot of slots) {
    try {
      await provider.deleteProfile(env, slot.providerProfileId)
      profiles++
    } catch (err) {
      failed++
      console.error(
        '[publisher] Steckplatz nicht entfernt',
        slot.providerProfileId,
        String(err).slice(0, 200),
      )
    }
  }

  return { accounts, profiles, failed }
}

/**
 * Gibt alles frei, was ein Projekt beim ANBIETER belegt.
 *
 * Nicht zu verwechseln mit `releaseProject` in domain.ts — das gibt einen
 * Job für Clipper frei. Hier geht es um Accounts und Steckplätze drüben.
 *
 * MUSS laufen, BEVOR das Projekt aus unserer Datenbank verschwindet: danach
 * sind die IDs weg (alles hängt per `ON DELETE cascade` am Projekt) und die
 * Accounts blieben drüben für immer verbunden — und werden je Account und
 * Tag weiter abgerechnet. Genau dieser stille Kostenläufer ist der Grund
 * für diese Funktion.
 *
 * Nur die Accounts DES PROJEKTS. Die eines Creators, dem die Kampagne
 * gehört, bleiben verbunden — sie gelten für alle seine übrigen Kampagnen.
 *
 * Wirft nie. Ein Projekt zu löschen darf nicht daran scheitern, dass ein
 * fremder Dienst gerade nicht erreichbar ist; was übrig bleibt, ist Datenmüll
 * drüben, kein kaputter Zustand hier. Was tatsächlich freigegeben wurde,
 * steht im Rückgabewert und gehört ins Prüfprotokoll.
 */
export async function releaseAtProvider(
  env: Env,
  projectId: string,
): Promise<{ accounts: number; profiles: number; failed: number }> {
  if (!publishingReady(env)) return { accounts: 0, profiles: 0, failed: 0 }

  const db = getDb(env)
  let failed = 0

  const [group] = await db
    .select()
    .from(schema.publishGroups)
    .where(eq(schema.publishGroups.projectId, projectId))
    .limit(1)
  if (group) {
    try {
      await provider.deleteGroup(env, group.providerGroupId)
    } catch (err) {
      failed++
      console.error('[publisher] Gruppe nicht entfernt', projectId, String(err).slice(0, 200))
    }
  }

  const released = await releaseOwnerAtProvider(env, { projectId })
  return { ...released, failed: released.failed + failed }
}

/**
 * Dasselbe für einen Creator — alles, was er drüben belegt.
 *
 * Gleiche Regel wie bei Projekten: MUSS laufen, bevor der Creator aus
 * unserer Datenbank verschwindet. Seine Steckplätze und Accounts hängen per
 * `ON DELETE cascade` an ihm; sind die Zeilen weg, laufen die Accounts
 * drüben unbemerkt weiter und kosten. Wirft nie.
 */
export async function releaseCreatorAtProvider(
  env: Env,
  creatorId: string,
): Promise<{ accounts: number; profiles: number; failed: number }> {
  if (!publishingReady(env)) return { accounts: 0, profiles: 0, failed: 0 }
  return releaseOwnerAtProvider(env, { creatorId })
}

/* --------------------------------------------------- Ergebnisse je Account */

export interface PublishOutcome {
  status: PublishStatus
  postId?: string
  error?: string
}

/** Was aus einem Video auf EINEM Account geworden ist. */
export interface TargetOutcome {
  /** `scheduled` = abgeschickt, Ausgang offen. */
  state: 'scheduled' | 'posted' | 'failed'
  /** instagram | tiktok | youtube | twitter | facebook | linkedin */
  platform: string
  /** @name des Accounts — ohne ihn wären fünf TikToks nicht zu unterscheiden. */
  username?: string | null
  /** Link zum veröffentlichten Beitrag, sobald der Anbieter ihn kennt. */
  url?: string
  /** Originaltext der Plattform. */
  error?: string
  /** Zahl der Sendeversuche. Begrenzt die automatischen Wiederholungen. */
  attempts: number
  /**
   * Wann zuletzt gesendet wurde.
   *
   * Ohne diesen Zeitstempel gäbe es keinen Abstand zwischen den Versuchen:
   * der Nachhol-Lauf würde alle drei erlaubten Versuche innerhalb einer
   * Stunde verbrennen — und zwar genau bei den Fehlern, die von selbst
   * vergehen (Zeitüberschreitung, „will retry automatically").
   */
  lastTryAt?: number
  /**
   * Der Post, zu dem dieser Stand gehört.
   *
   * Belegen, Abschluss eines Versands, Nachfassen und Webhook schreiben
   * dieselbe Spalte, und ihre Läufe überlappen. Wer schreibt, muss deshalb
   * erkennen können, ob ein Eintrag seit dem eigenen Lesen von einem Webhook
   * oder vom Nachfassen kam: das Belegen leert dieses Feld, und steht danach
   * eine Post-ID da, weiß jemand mehr über den laufenden Versuch als die
   * (womöglich abgebrochene) Antwort des eigenen Aufrufs.
   */
  postId?: string
  /**
   * Posts FRÜHERER Versuche auf diesem Account. Ein verspätetes Ereignis zu
   * einem davon darf ein neu belegtes Ziel nicht wieder auf „gescheitert"
   * setzen — sonst wäre es für den Nachschuss fällig, während der neue
   * Versuch noch läuft, und das Video ginge zweimal raus.
   */
  earlierPostIds?: string[]
  /**
   * Der `Idempotency-Key`, mit dem dieser Versuch gesendet wurde bzw. wird.
   *
   * Gebildet beim Belegen, gespeichert, BEVOR gesendet wird. Nur so lässt
   * sich ein Versuch, dessen Ausgang wir nicht kennen, gefahrlos wiederholen:
   * mit demselben Schlüssel liefert die Gegenseite binnen 24 Stunden den
   * schon angelegten Post zurück, statt einen zweiten anzulegen — oder legt
   * ihn an, wenn die erste Anfrage nie ankam (siehe `keyReusable`).
   */
  key?: string
  /** Wann `key` zum ersten Mal gesendet wurde — die Gegenseite hält ihn 24 h. */
  keyAt?: number
  /**
   * Wie oft ein Versuch mit DIESEM Schlüssel ohne gesicherten Ausgang endete
   * (Abbruch, 5xx, Zeitüberschreitung, „läuft noch“, verwaiste Belegung).
   *
   * Solche Versuche zählen nicht als `attempts` — es ist ja womöglich derselbe
   * Post, und ein neuer Schlüssel ergäbe einen zweiten. Damit das trotzdem
   * nicht endlos läuft, hat dieser Zähler seine eigene Grenze
   * (`MAX_UNSURE`). Ein eindeutiger Ausgang setzt ihn zurück.
   */
  unsure?: number
  /** Früher nicht erneut senden — aus `Retry-After` der Gegenseite. */
  retryAt?: number
  /**
   * Die Gegenseite hat bestätigt, dass sie diesen Schlüssel verarbeitet
   * (409 `idempotency_conflict`). Der Post entsteht also sicher. Läuft der
   * Schlüssel nach 24 h ab, ohne dass ein Ausgang bekannt wurde, wird NICHT
   * mit neuem Schlüssel nachgesendet — das ergäbe einen zweiten Post. Den
   * Ausgang klären Webhook und Nachfassen.
   */
  inFlight?: true
  /**
   * Gesperrt, weil dasselbe echte Konto den Clip gerade über die Verbreitung
   * eines Creators bekommt (läuft oder ist draußen). Kein Versuch: zählt
   * nicht gegen `MAX_TARGET_ATTEMPTS`, und sobald der Creator-Post scheitert,
   * übernimmt dieser Weg (siehe `foreignHolds`).
   */
  blockedByCreator?: true
  /** Dasselbe an einer Freigabe: das Konto bekommt den Clip über das Projekt. */
  blockedByProject?: true
  /**
   * Die Sperre ist endgültig — der Clip steht auf diesem Konto bereits über
   * den anderen Besitzer. Dann gibt es nichts mehr nachzuprüfen, und das Ziel
   * belegt keinen Platz im Nachhol-Lauf.
   */
  blockedFinal?: true
}

/** Schlüssel ist die ACCOUNT-ID, nicht der Plattformname. */
export type TargetMap = Record<string, TargetOutcome>

/**
 * Wie oft ein einzelner Account automatisch nachgereicht wird.
 *
 * Drei, nicht unbegrenzt: ein dauerhaft abgelehnter Clip soll nicht jeden Tag
 * erneut gegen dieselbe Wand laufen. Danach bleibt der Fehler sichtbar stehen
 * und will von Hand angesehen werden.
 *
 * Ausnahme: ein Video, das automatisch rausgehen soll und NIRGENDS draußen
 * ist (siehe `retryDue` mit `endless`).
 */
const MAX_TARGET_ATTEMPTS = 3

/**
 * Mindestabstand vor dem n-ten Nachschuss, in Sekunden.
 *
 * Die Fehler, die hier ankommen, sind überwiegend Zeitüberschreitungen —
 * beim ersten echten Clip meldeten alle vier TikTok- und alle drei
 * X-Accounts „Publishing timed out during platform API call". Solche Fehler
 * vergehen von selbst, aber nicht in derselben Minute. Sofort nachzuschießen
 * hieße: dreimal dieselbe Wand, danach ist Schluss.
 *
 * Der erste Abstand hat einen zweiten Zweck. Bricht unser Aufruf zur
 * Gegenseite ab, ohne dass eine Antwort ankam, wissen wir NICHT, ob der Post
 * drüben trotzdem entstanden ist — die Ziele stehen dann als gescheitert da,
 * obwohl sie längst laufen. Der Webhook klärt das binnen Sekunden
 * (`post.scheduled` kam beim ersten Clip nach 16 s). Zehn Minuten Abstand
 * heißen deshalb: wenn nachgeschossen wird, steht die Wahrheit schon in der
 * Datenbank und kein Video geht zweimal raus.
 */
const RETRY_BACKOFF_SEC = [10 * 60, 45 * 60, 3 * 3600]

/**
 * Ab wann eine Belegung ohne Ausgang als verwaist gilt.
 *
 * Belegt wird vor dem Senden (siehe `reserveTargets`). Endet der Worker
 * mitten im Aufruf — `waitUntil` lebt höchstens 30 Sekunden nach der
 * Antwort, ein synchroner TikTok-Upload dauert Minuten —, läuft kein catch
 * mehr: das Ziel steht für immer auf „scheduled“, ohne Post-ID, und weder
 * Nachfassen (kennt keinen Post) noch Nachschuss (nimmt nur „gescheitert“)
 * fassten es je wieder an. Länger als ein Aufruf samt Webhook-Verzug dauern
 * kann, wartet niemand auf einen Ausgang; danach wird mit DEMSELBEN
 * Schlüssel erneut gesendet. War die erste Anfrage drüben angekommen, kommt
 * ihr Post zurück, sonst entsteht er jetzt — ein zweiter nie.
 */
const ORPHAN_AFTER_SEC = 30 * 60

/** So lange hält die Gegenseite einen `Idempotency-Key` (laut Spec 24 h). */
const KEY_TTL_SEC = 24 * 3600

/**
 * Wie oft ein Versuch ohne gesicherten Ausgang mit demselben Schlüssel
 * wiederholt wird, bevor er als ausgeschöpft gilt (nicht auf dem
 * automatischen Weg, siehe `endless`). Fünf mit den Abständen aus
 * `RETRY_BACKOFF_SEC` sind gut sieben Stunden — weit innerhalb der 24 h, in
 * denen der Schlüssel drüben gilt.
 */
const MAX_UNSURE = 5

/** Weit in der Zukunft — „nie fällig“ für die Sortierung im Nachhol-Lauf. */
const NEVER = 1e15

const isBlocked = (t: TargetOutcome | undefined) => Boolean(t?.blockedByCreator || t?.blockedByProject)

/**
 * Belegt, kein Post bekannt, und seit `ORPHAN_AFTER_SEC` kein Ausgang.
 *
 * Nur Ziele MIT gespeichertem Schlüssel: Belegungen aus der Zeit vor dem
 * Schlüssel (`key` fehlt) kannten noch keine Post-ID je Ziel. Ein solches
 * „scheduled“ heißt meist „längst draußen, nur nie bestätigt“ — es erneut zu
 * senden, ergäbe mit neuem Schlüssel einen Doppelpost beim Kunden. Live
 * standen beim Umstieg 22 solche Ziele aus drei Clips vom August/September.
 */
function isOrphan(t: TargetOutcome | undefined, now: number): boolean {
  if (t?.state !== 'scheduled' || t.postId || !t.lastTryAt || !t.key) return false
  // Bestätigt in Arbeit, Schlüssel abgelaufen: der Post existiert — siehe `inFlight`.
  if (t.inFlight && t.keyAt && now - t.keyAt >= KEY_TTL_SEC) return false
  return now - t.lastTryAt >= ORPHAN_AFTER_SEC && (!t.retryAt || now >= t.retryAt)
}

/**
 * Darf der nächste Versuch den gespeicherten Schlüssel wiederverwenden?
 *
 * Genau dann, wenn der Ausgang des letzten Versuchs NICHT bekannt ist: eine
 * Belegung ohne Post (verwaist oder „läuft noch“) oder ein Fehler ohne
 * Gewissheit (`unsure`). Dann ist es womöglich derselbe Post, und ein neuer
 * Schlüssel könnte ihn ein zweites Mal anlegen. Einen NEUEN Schlüssel gibt
 * es nur nach eindeutigem Ausgang — ein bekannter Post (Post-ID, auch ein
 * gescheiterter: derselbe Schlüssel brächte nur ihn zurück) oder eine klare
 * Ablehnung — und wenn die Gegenseite den alten nach 24 h vergessen hat.
 */
function keyReusable(t: TargetOutcome | undefined, now: number): boolean {
  if (!t?.key || t.postId) return false
  if (t.keyAt && now - t.keyAt >= KEY_TTL_SEC) return false
  if (t.state === 'scheduled') return true
  return t.state === 'failed' && (t.unsure ?? 0) > 0
}

/**
 * Wann dieses Ziel frühestens erneut gesendet werden darf — `null` heißt:
 * gar nicht (draußen, läuft, ausgeschöpft). Dieselbe Rechnung steht als SQL
 * in `dueAtSql`; wer die eine ändert, ändert die andere mit.
 *
 * `endless` hebt die Obergrenzen auf, nicht den Abstand: nach dem letzten
 * Abstand geht es im Takt von `RETRY_BACKOFF_SEC.at(-1)` weiter. Das gilt
 * nur für Stände, die noch NIRGENDS draußen sind (`publishDeliverable`,
 * `publishForCreator`). So lief es immer — dort wurde ein komplett
 * gescheitertes Video ohne Grenze erneut versucht. Ein abgelaufenes Token
 * oder ein stundenlanger Ausfall beim Anbieter scheitert auf allen
 * Plattformen zugleich; mit einer harten Grenze von drei Versuchen bliebe so
 * ein Clip für immer liegen, auch nachdem der Kunde neu verbunden hat oder
 * der Anbieter längst wieder läuft — und es gibt keinen Knopf, ihn von Hand
 * anzustoßen.
 */
function dueAt(t: TargetOutcome | undefined, now: number, opts: { endless?: boolean } = {}): number | null {
  if (!t) return null
  const unsure = t.unsure ?? 0

  // Gesperrt über einen anderen Besitzer: kein Versuch, nur nachsehen, ob
  // die Sperre noch gilt — ohne Obergrenze, solange sie nicht endgültig ist.
  if (t.state === 'failed' && isBlocked(t)) {
    return t.blockedFinal ? null : (t.lastTryAt ?? 0) + RETRY_BACKOFF_SEC[0]
  }

  // Belegt ohne Post: erst nach `ORPHAN_AFTER_SEC` verwaist und fällig.
  if (t.state === 'scheduled') {
    // Ohne Schlüssel: Altbestand, nie erneut senden (siehe `isOrphan`).
    if (t.postId || !t.lastTryAt || !t.key) return null
    // Bestätigt in Arbeit und Schlüssel abgelaufen: nie mit neuem Schlüssel.
    if (t.inFlight && t.keyAt && now - t.keyAt >= KEY_TTL_SEC) return null
    if (!opts.endless && unsure >= MAX_UNSURE) return null
    return Math.max(t.lastTryAt + ORPHAN_AFTER_SEC, t.retryAt ?? 0)
  }

  if (t.state !== 'failed') return null
  if (!opts.endless) {
    // Ein Versuch ohne gesicherten Ausgang ist noch nicht verbraucht — er
    // wird mit demselben Schlüssel wiederholt und zählt nur gegen `MAX_UNSURE`.
    const spent = keyReusable(t, now) ? unsure >= MAX_UNSURE : (t.attempts ?? 0) >= MAX_TARGET_ATTEMPTS
    if (spent) return null
  }
  // Alte Einträge ohne Zeitstempel stammen aus der Zeit vor dieser Spalte —
  // die sollen nicht ewig warten.
  if (!t.lastTryAt) return 0
  // Der Abstand wächst mit JEDEM Versand, auch mit denen ohne neuen Versuch.
  const sends = (t.attempts ?? 0) + Math.max(unsure - 1, 0)
  const wait = RETRY_BACKOFF_SEC[Math.min(sends, RETRY_BACKOFF_SEC.length) - 1] ?? 0
  return Math.max(t.lastTryAt + wait, t.retryAt ?? 0)
}

/** Darf dieses Ziel JETZT erneut gesendet (bzw. eine Sperre geprüft) werden? */
function retryDue(target: TargetOutcome | undefined, now: number, opts: { endless?: boolean } = {}): boolean {
  const at = dueAt(target, now, opts)
  return at !== null && now >= at
}

/** JSON aus der Spalte lesen. Kaputter Inhalt darf nichts umwerfen. */
export function readTargets(raw: string | null | undefined): TargetMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as TargetMap) : {}
  } catch {
    return {}
  }
}

/** Nur schreiben, wenn wirklich etwas drinsteht — sonst bleibt die Spalte NULL. */
const writeTargets = (map: TargetMap): string | null =>
  Object.keys(map).length ? JSON.stringify(map) : null

/**
 * Alle Post-IDs eines Videos.
 *
 * Seit je Plattform ein eigener Aufruf rausgeht, sind es bis zu sechs.
 * `publish_post_id` trägt weiter die erste — daran hängt der eindeutige Index
 * und damit die Sperre gegen Doppelposts; die vollständige Liste steht in
 * `publish_post_ids`. Ältere Videos haben nur die erste, deshalb hier beides.
 * Eine Freigabe-Zeile (`clip_approvals`) hat nur die Liste.
 */
export function readPostIds(row: {
  publishPostId?: string | null
  publishPostIds?: string | null
}): string[] {
  const out = new Set<string>()
  if (row.publishPostId) out.add(row.publishPostId)
  try {
    const parsed = row.publishPostIds ? JSON.parse(row.publishPostIds) : null
    if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === 'string' && id) out.add(id)
  } catch {
    /* Kaputter Inhalt darf nichts umwerfen. */
  }
  return [...out]
}

/**
 * Fasst die Einzelergebnisse zu dem einen Zustand zusammen, den Listen und
 * Abzeichen anzeigen.
 *
 * Die Reihenfolge ist Absicht: solange irgendetwas gescheitert ist, darf
 * nirgends „veröffentlicht" stehen — auch dann nicht, wenn die Mehrheit
 * durchlief.
 */
export function summarize(map: TargetMap): PublishStatus {
  const states = Object.values(map).map((p) => p?.state)
  if (!states.length) return PUBLISH_STATUS.scheduled
  const failed = states.filter((x) => x === 'failed').length
  const posted = states.filter((x) => x === 'posted').length
  if (failed && posted) return PUBLISH_STATUS.partial
  if (failed && failed === states.length) return PUBLISH_STATUS.failed
  if (posted === states.length) return PUBLISH_STATUS.posted
  return PUBLISH_STATUS.scheduled
}

/**
 * Läuft für diesen Stand noch etwas — ein Versand mit offenem Ausgang oder
 * ein Nachschuss, der noch kommt?
 *
 * Für Anzeigen, die „läuft im Hintergrund" sagen. Der Sammelstatus allein
 * taugt dafür nicht: „teilweise veröffentlicht" kann endgültig sein (alle
 * Nachschüsse verbraucht), und „fehlgeschlagen" kann noch einen Nachschuss
 * vor sich haben. Gedacht für Freigaben, bei denen die Obergrenze greift.
 */
export function publishStillRunning(status: string | null, raw: string | null | undefined): boolean {
  if (!status || status === PUBLISH_STATUS.scheduled) return true
  const now = nowSec()
  // Gescheitert mit offenem Nachschuss, oder gesperrt mit einer Sperre, die
  // noch fallen kann — dieselbe Rechnung wie der Nachhol-Lauf (`dueAt`).
  return Object.values(readTargets(raw)).some(
    (t) => t?.state === 'scheduled' || (t?.state === 'failed' && dueAt(t, now) !== null),
  )
}

/** Einzeiler für `publish_error` — welcher Account woran scheiterte. */
function summarizeErrors(map: TargetMap): string | null {
  const parts = Object.values(map)
    .filter((v) => v?.state === 'failed')
    .map((v) => `${targetName(v)}: ${v?.error ?? 'unbekannter Fehler'}`)
  return parts.length ? parts.join(' | ').slice(0, 500) : null
}

/** „TikTok @nikki.clips" — Plattform allein reicht bei mehreren Accounts nicht. */
const targetName = (t: TargetOutcome) =>
  `${platformLabel(t.platform)}${t.username ? ` @${t.username.replace(/^@/, '')}` : ''}`

/** Menschenlesbare Kurzform je Account — für Anzeigen. */
export function platformLines(raw: string | null | undefined): {
  type: string
  state: string
  url?: string
  error?: string
}[] {
  return Object.values(readTargets(raw)).map((v) => ({
    type: targetName(v),
    state: v?.state ?? 'scheduled',
    url: v?.url,
    error: v?.error,
  }))
}

/**
 * Die Kontonamen, auf denen ein Video schon läuft oder steht.
 *
 * Die Sperren gegen Doppelposts sind nach ACCOUNT-ID geschlüsselt. Seit ein
 * Clip Projekt- und Creator-Accounts zugleich erreichen kann, darf das nicht
 * mehr die einzige Sicht sein: hängt dasselbe echte Konto unter zwei IDs
 * (einmal am Projekt, einmal beim Creator), sähe die zweite ID „noch nichts
 * gesendet". Diese Menge schließt die Lücke über Plattform und Kontoname.
 */
function handlesInFlight(targets: TargetMap): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [id, t] of Object.entries(targets)) {
    if (t?.state !== 'posted' && t?.state !== 'scheduled') continue
    const key = handleKey(t.platform, t.username)
    if (!key) continue
    const ids = out.get(key)
    if (ids) ids.add(id)
    else out.set(key, new Set([id]))
  }
  return out
}

/**
 * Läuft dasselbe echte Konto unter einer ANDEREN Account-ID? Die eigene
 * zählt nicht — sonst sperrte sich eine verwaiste Belegung beim erneuten
 * Senden selbst.
 */
function busyElsewhere(busy: Map<string, Set<string>>, key: string, accountId: string): boolean {
  const ids = busy.get(key)
  return Boolean(ids && [...ids].some((id) => id !== accountId))
}

/* ------------------------------------------------------- Veröffentlichungsstand */

/**
 * Wo ein Veröffentlichungsstand steht.
 *
 * Ohne `creatorId`: am Video selbst (`deliverables.publish_*`) — der Stand
 * der automatischen Ziele. Mit `creatorId`: an der Freigabe dieses Creators
 * (`clip_approvals.publish_*`) — der Stand seiner Verbreitung. Beide werden
 * mit denselben Regeln geschrieben, aber nie vermischt: ein Video, das ein
 * Creator gepostet hat, darf für das Projekt nicht als „draußen" gelten.
 */
interface Ledger {
  deliverableId: string
  creatorId?: string
}

/**
 * Schreibt einen Stand. `error` nur, wenn angegeben (`undefined` lässt die
 * Spalte stehen), Post-IDs nur, wenn welche da sind.
 *
 * Eine einmal bekannte Post-ID wird NIE wieder auf NULL gesetzt. Früher
 * stand im Abschluss von `publishDeliverable` `outcome.postId ?? null`.
 * Scheiterte der Aufruf, löschte dieser Zweig die ID, die der Webhook
 * womöglich längst eingetragen hatte — und ohne ID greift weder das
 * Nachfassen noch die Sperre gegen Doppelposts gleich zu Beginn.
 *
 * `expectTargets` macht daraus ein Vergleichen-und-Tauschen: geschrieben
 * wird nur, wenn `publish_targets` noch genau so dasteht wie beim Lesen
 * (`null` = leer). Das Ergebnis sagt, ob es so war. Ohne die Angabe wird
 * immer geschrieben, und das Ergebnis ist `true`.
 */
async function writeLedger(
  env: Env,
  ledger: Ledger,
  set: { status: string; targets: TargetMap; error?: string | null; postIds?: string[] },
  opts: { expectTargets?: string | null } = {},
): Promise<boolean> {
  const db = getDb(env)
  const ids = [...new Set(set.postIds ?? [])].filter(Boolean)
  const common = {
    publishStatus: set.status,
    publishTargets: writeTargets(set.targets),
    ...(set.error !== undefined ? { publishError: set.error } : {}),
  }
  // Bedingung fürs Vergleichen-und-Tauschen — `undefined` heißt: keine.
  const expected = opts.expectTargets
  const guarded = expected !== undefined
  const unchanged = (
    column: typeof schema.deliverables.publishTargets | typeof schema.clipApprovals.publishTargets,
  ) => (expected === undefined ? undefined : expected === null ? isNull(column) : eq(column, expected))

  if (ledger.creatorId) {
    const rows = await db
      .update(schema.clipApprovals)
      .set({
        ...common,
        ...(ids.length ? { publishPostIds: JSON.stringify(ids) } : {}),
        updatedAt: nowSec(),
      })
      .where(
        and(
          eq(schema.clipApprovals.deliverableId, ledger.deliverableId),
          eq(schema.clipApprovals.creatorId, ledger.creatorId),
          unchanged(schema.clipApprovals.publishTargets),
        ),
      )
      .returning({ id: schema.clipApprovals.deliverableId })
    return !guarded || rows.length > 0
  }

  const rows = await db
    .update(schema.deliverables)
    .set({
      ...common,
      ...(ids.length ? { publishPostId: ids[0], publishPostIds: JSON.stringify(ids) } : {}),
    })
    .where(
      and(
        eq(schema.deliverables.id, ledger.deliverableId),
        unchanged(schema.deliverables.publishTargets),
      ),
    )
    .returning({ id: schema.deliverables.id })
  return !guarded || rows.length > 0
}

/** Ein Stand, wie er gerade in der Datenbank steht. */
interface LedgerState {
  /** `publish_targets` als Text — die Vergleichsgröße fürs Vergleichen-und-Tauschen. */
  raw: string | null
  targets: TargetMap
  postIds: string[]
}

async function readLedger(env: Env, ledger: Ledger): Promise<LedgerState | null> {
  const db = getDb(env)
  if (ledger.creatorId) {
    const [row] = await db
      .select({ raw: schema.clipApprovals.publishTargets, ids: schema.clipApprovals.publishPostIds })
      .from(schema.clipApprovals)
      .where(
        and(
          eq(schema.clipApprovals.deliverableId, ledger.deliverableId),
          eq(schema.clipApprovals.creatorId, ledger.creatorId),
        ),
      )
      .limit(1)
    if (!row) return null
    return { raw: row.raw, targets: readTargets(row.raw), postIds: readPostIds({ publishPostIds: row.ids }) }
  }
  const [row] = await db
    .select({
      raw: schema.deliverables.publishTargets,
      id: schema.deliverables.publishPostId,
      ids: schema.deliverables.publishPostIds,
    })
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, ledger.deliverableId))
    .limit(1)
  if (!row) return null
  return {
    raw: row.raw,
    targets: readTargets(row.raw),
    postIds: readPostIds({ publishPostId: row.id, publishPostIds: row.ids }),
  }
}

/** So oft wird neu gelesen und gemischt, bevor ein Schreiber aufgibt. */
const COMMIT_ROUNDS = 5

/**
 * Schreibt einen Stand, ohne fremde Schreiber zu überrollen.
 *
 * Belegen, Abschluss eines Versands, Nachfassen und Webhook schreiben alle
 * `publish_targets`, und ihre Läufe überlappen: ein TikTok-Versand dauert
 * Minuten, in denen Webhooks zum Instagram-Post desselben Videos eintreffen
 * und ein zweiter Nachhol-Lauf nachfasst. Schrieb jeder seinen beim Lesen
 * gehaltenen Stand blind zurück, gewann der Letzte — und mit ihm ging
 * verloren, was die anderen wussten: eine Post-ID, die nur der Webhook
 * kannte (danach stand das Ziel wieder auf „gescheitert", und der Nachschuss
 * stellte dasselbe Reel ein zweites Mal ein), oder eine frische Belegung
 * (danach war das Ziel für einen zweiten Lauf erneut fällig, während der
 * erste noch sendete).
 *
 * Deshalb: frisch lesen, `compute` mischt den eigenen Beitrag in DIESEN
 * Stand, Schreiben nur, wenn er sich seither nicht geändert hat — sonst
 * dasselbe noch einmal. Post-IDs werden mit dem gelesenen Stand vereinigt,
 * nie ersetzt. `compute` darf `null` liefern: dann gibt es nichts zu
 * schreiben.
 */
async function commitLedger(
  env: Env,
  ledger: Ledger,
  compute: (
    current: LedgerState,
  ) => { status: string; targets: TargetMap; error?: string | null; postIds?: string[] } | null,
): Promise<{ status: string; targets: TargetMap; postIds: string[] } | null> {
  for (let round = 0; round < COMMIT_ROUNDS; round++) {
    const current = await readLedger(env, ledger)
    if (!current) return null
    const next = compute(current)
    if (!next) return null
    const postIds = [...new Set([...current.postIds, ...(next.postIds ?? [])])].filter(Boolean)
    if (await writeLedger(env, ledger, { ...next, postIds }, { expectTargets: current.raw })) {
      return { status: next.status, targets: next.targets, postIds }
    }
  }
  console.error(
    '[publisher] Stand nicht geschrieben, zu viele gleichzeitige Schreiber',
    ledger.deliverableId,
    ledger.creatorId ?? '',
  )
  return null
}

/**
 * Welcher Stand gilt für ein Ziel, das dieser Lauf selbst belegt und
 * gesendet hat: der eigene oder der, den inzwischen jemand anderes
 * eingetragen hat?
 *
 * Das Belegen leert `postId`. Trägt der Eintrag in der Datenbank jetzt eine,
 * kam sie von einem Webhook oder vom Nachfassen — die wissen über diesen
 * Post mehr als unsere Antwort, die womöglich mit 5xx oder Zeitüberschreitung
 * abbrach, obwohl der Post drüben entstand. Einzig ein eigenes „draußen"
 * bleibt stehen; es wird nie zurückgestuft.
 */
function settleTarget(theirs: TargetOutcome | undefined, ours: TargetOutcome): TargetOutcome {
  if (!theirs) return ours
  if (ours.state === 'posted') return !ours.url && theirs.url ? { ...ours, url: theirs.url } : ours
  if (theirs.state === 'posted' || theirs.postId) return theirs
  return ours
}

/* ------------------------------------------------------------ Veröffentlichen */

/** Die Textgrenzen der Plattformen — nicht die des Anbieters. */
const TEXT_LIMIT = {
  /** Instagram und TikTok: 2200 Zeichen Caption. Die engste unter allen. */
  caption: 2200,
  /** YouTube-Titel. Länger wird der Upload abgewiesen. */
  youtubeTitle: 100,
} as const

/** Erste Zeile, auf Länge gebracht — taugt als Titel, wo einer verlangt ist. */
function asTitle(caption: string, limit: number): string {
  // YouTube weist Titel mit spitzen Klammern ab.
  const firstLine = (caption.split('\n')[0] || caption).replace(/[<>]/g, '').trim()
  return (firstLine || 'Video').slice(0, limit)
}

/**
 * TikToks Pflichtangaben, gültig für ALLE TikTok-Ziele desselben Aufrufs.
 *
 * `contentPreviewConfirmed` und `expressConsentGiven` sind keine Kür: TikTok
 * verlangt die Zustimmung des Veröffentlichenden, und ohne sie wird der Post
 * abgewiesen.
 *
 * `privacyLevel` muss zu dem passen, was der jeweilige Creator erlaubt. Wir
 * setzen öffentlich für alle. Ein Account, dessen Einstellungen das nicht
 * hergeben, scheitert einzeln und sichtbar — besser als ein Video, das
 * überall still auf privat landet.
 */
const TIKTOK_SETTINGS = {
  privacyLevel: 'PUBLIC_TO_EVERYONE',
  allowComment: true,
  allowDuet: true,
  allowStitch: true,
  contentPreviewConfirmed: true,
  expressConsentGiven: true,
} as const

/** Der plattformabhängige Teil eines Ziels. */
function platformData(platform: string, caption: string): Record<string, unknown> | undefined {
  if (platform === 'youtube') {
    /*
     * YouTube ist die Ausnahme: es braucht einen TITEL, und der darf nur 100
     * Zeichen haben. Die Caption unverändert hineinzuschreiben, hieße:
     * Upload abgewiesen. Also erste Zeile als Titel, die ganze Caption
     * bleibt die Beschreibung (das ist `content` des Posts).
     *
     * `visibility` steht ausdrücklich auf public. Ohne Angabe landet das
     * Video womöglich als privat — draußen, aber für niemanden sichtbar,
     * und das wäre ein Fehlschlag, den niemand bemerkt. `madeForKids` ist
     * ebenfalls Pflicht: fehlt die Angabe, blockiert YouTube Aufrufe.
     */
    return {
      title: asTitle(caption, TEXT_LIMIT.youtubeTitle),
      visibility: 'public',
      madeForKids: false,
    }
  }
  if (platform === 'instagram') {
    // Reel soll auch im Profil-Feed erscheinen, nicht nur im Reels-Tab.
    return { shareToFeed: true }
  }
  /*
   * Facebook: bewusst KEIN `contentType: 'reel'`.
   *
   * Laut `FacebookPlatformData` in der Zernio-Spec verlangt ein Reel genau
   * ein Hochkant-Video (9:16), und Meta dokumentiert für Reels 3–90 Sekunden;
   * die Länge prüft Zernio nicht vorab. Unsere Clips dürfen länger sein und
   * sind nicht zwingend hochkant — als Reel scheiterten genau die. Ohne
   * `contentType` wird ein normales Seiten-Video daraus, das jede Länge und
   * jedes Seitenverhältnis annimmt. Lieber ein Clip als Video auf der Seite
   * als einer, der an der Reel-Grenze hängen bleibt. Die Seite selbst hat der
   * Creator beim Verbinden gewählt (`pageId` entfällt dann).
   *
   * LinkedIn: nichts nötig. `organizationUrn` entfällt ebenso — Zernio nimmt
   * das beim Verbinden gewählte Profil bzw. die Organisation; ein einzelnes
   * Video ist erlaubt (`LinkedInPlatformData`: „no multi-video").
   */
  return undefined
}

/**
 * Belegt Ziele, BEVOR gesendet wird — und schreibt das sofort in die
 * Datenbank.
 *
 * Der Grund ist der Viertelstundentakt. Ein Versand an TikTok kann elf
 * Minuten dauern; wird er länger, läuft der nächste Nachhol-Lauf an, während
 * der erste noch sendet. Würde der Zustand erst NACH dem Versand
 * festgehalten, sähe der zweite Lauf dieselben Ziele unverändert als fällig
 * an und schickte dasselbe Video ein zweites Mal auf dieselben Profile.
 *
 * Deshalb wird zuerst belegt und dann gesendet. Wer danach kommt, sieht
 * `state: 'scheduled'` mit frischem `lastTryAt` — und lässt die Finger davon.
 * Scheitert der Versand, setzt `sendPerPlatform` die Ziele wieder auf
 * `failed`, und nach dem Abstand aus `RETRY_BACKOFF_SEC` sind sie erneut
 * fällig. Kommt gar kein Ausgang mehr (Worker beendet), gilt die Belegung
 * nach `ORPHAN_AFTER_SEC` als verwaist und wird mit demselben Schlüssel
 * erneut gesendet.
 *
 * Das Belegen selbst ist ein Vergleichen-und-Tauschen gegen `expected`, den
 * Stand von `publish_targets` beim Lesen. Ohne das gewönne niemand das
 * Rennen, wenn zwei Läufe dasselbe Video lesen, BEVOR einer belegt hat —
 * genau das passiert beim Doppeltipp auf „Freigeben & posten“: beide lesen
 * „noch nichts gesendet“, beide gleichen erst Accounts ab, beide belegen,
 * beide senden. Der zweite bekommt beim Anbieter für den laufenden Post nur
 * „409 noch in Arbeit“, hält seine Ziele für gescheitert und überschreibt
 * damit den echten Stand samt Post-IDs — der Nachschuss stellt das Video
 * danach mit neuem Schlüssel ein zweites Mal. So belegt nur der Erste; wer
 * `false` zurückbekommt, sendet nichts und schreibt nichts. Dasselbe Muster
 * wie `claimProject` in domain.ts.
 */
async function reserveTargets(
  env: Env,
  ledger: Ledger,
  accounts: AccountRow[],
  targets: TargetMap,
  ts: number,
  expected: string | null,
  requestKey: (platform: string, attempt: number) => string,
): Promise<boolean> {
  const fresh: AccountRow[] = []
  for (const a of accounts) {
    const prev = targets[a.providerAccountId]

    /*
     * Ausgang des letzten Versuchs unbekannt (verwaiste Belegung, Abbruch,
     * 5xx, „läuft noch“): derselbe Versuch noch einmal, mit DEMSELBEN
     * Schlüssel und ohne `attempts` hochzuzählen — siehe `keyReusable`. Eine
     * verwaiste Belegung ist dabei selbst ein Versand ohne Ausgang und zählt
     * in `unsure`; ein Fehler ohne Gewissheit wurde dort schon gezählt.
     */
    if (prev && keyReusable(prev, ts)) {
      targets[a.providerAccountId] = {
        state: 'scheduled',
        platform: a.platform,
        username: a.username,
        attempts: prev.attempts ?? 1,
        lastTryAt: ts,
        key: prev.key,
        keyAt: prev.keyAt ?? ts,
        unsure: (prev.unsure ?? 0) + (prev.state === 'scheduled' ? 1 : 0),
        ...(prev.earlierPostIds?.length ? { earlierPostIds: prev.earlierPostIds } : {}),
      }
      continue
    }

    // Der Post des vorigen Versuchs wandert in die Liste der früheren: ein
    // verspätetes Ereignis dazu darf diese Belegung nicht mehr umwerfen
    // (siehe `mergePostIntoTargets`). Ohne Post-ID bleibt die Belegung als
    // solche erkennbar (siehe `settleTarget`).
    const earlier = [...new Set([...(prev?.earlierPostIds ?? []), ...(prev?.postId ? [prev.postId] : [])])]
    targets[a.providerAccountId] = {
      state: 'scheduled',
      platform: a.platform,
      username: a.username,
      attempts: (prev?.attempts ?? 0) + 1,
      lastTryAt: ts,
      keyAt: ts,
      ...(earlier.length ? { earlierPostIds: earlier.slice(-5) } : {}),
    }
    fresh.push(a)
  }

  // Neue Versuche bekommen ihren Schlüssel je Plattform — und er steht in
  // der Datenbank, BEVOR gesendet wird. Endet der Worker mitten im Aufruf,
  // kennt der nächste Lauf ihn noch (siehe `ORPHAN_AFTER_SEC`).
  for (const [platform, group] of groupBy(fresh, (a) => a.platform)) {
    const attempt = Math.max(...group.map((a) => targets[a.providerAccountId]?.attempts ?? 1))
    const key = await idempotencyKeyFor(requestKey(platform, attempt), group, targets)
    for (const a of group) targets[a.providerAccountId] = { ...targets[a.providerAccountId], key }
  }

  return writeLedger(env, ledger, { status: summarize(targets), targets }, { expectTargets: expected })
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = out.get(key)
    if (list) list.push(item)
    else out.set(key, [item])
  }
  return out
}

/**
 * Idempotenzschlüssel für EINEN Aufruf: Grundschlüssel (Video, Weg,
 * Plattform) plus die belegten Accounts samt ihrer Versuchsnummer.
 *
 * Beim `Idempotency-Key` vergleicht der Anbieter NUR den Schlüssel, nicht den
 * Inhalt: binnen 24 Stunden liefert derselbe Schlüssel den ersten Post
 * zurück, und solange der noch angelegt wird, kommt 409. Damit fängt er zwei
 * Läufe ab, die dieselbe Belegung senden — das soll schon das Belegen
 * verhindern, hier bekommt es eine zweite Sperre, die nicht an unserer
 * Datenbank hängt. Das bisherige `x-request-id` griff dafür nicht: es zählt
 * nur bei gleicher Medien-URL, und die signiert jeder Lauf neu.
 *
 * Umgekehrt darf ein Schlüssel NIE zwei verschiedene Posts meinen, sonst
 * bekäme der zweite den ersten zurück und ginge nie raus. Deshalb stehen die
 * Accounts mit ihren Versuchsnummern drin: ein Nachschuss (Versuch + 1) oder
 * eine andere Zusammenstellung ergibt einen anderen Schlüssel. Als
 * Prüfsumme, weil zehn Account-IDs die 255 Zeichen sprengen könnten.
 *
 * Gebildet wird er nur für NEUE Versuche. Ein Versuch ohne bekannten Ausgang
 * wird mit seinem gespeicherten Schlüssel wiederholt (`TargetOutcome.key`) —
 * genau der Fall, für den die Gegenseite ihn anbietet: Wiederholung nach
 * 5xx, Zeitüberschreitung oder Abbruch.
 */
async function idempotencyKeyFor(base: string, group: AccountRow[], targets: TargetMap): Promise<string> {
  const parts = group
    .map((a) => `${a.providerAccountId}:${targets[a.providerAccountId]?.attempts ?? 1}`)
    .sort()
    .join(',')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${base}#${hex.slice(0, 32)}`
}

/**
 * Schickt ein Video an eine Liste von Accounts — EIN Aufruf JE PLATTFORM.
 *
 * Hier steckt die Lehre aus dem ersten echten Fehlschlag. Bis dahin ging ein
 * Video in EINEM Aufruf an alle Accounts aller Plattformen, und das sah
 * elegant aus, weil der Anbieter es zulässt. Die Plattformen sind aber nicht
 * gleich teuer:
 *
 *   YouTube und Instagram bekommen nur die Adresse; Google und Meta holen die
 *   Datei SELBST von R2. Das ist in Sekunden erledigt.
 *
 *   TikTok und X haben keinen solchen Weg. Dort lädt der Anbieter die ganze
 *   Datei herunter und schiebt sie je Account einzeln durch die Plattform-API.
 *   Bei 145 MB und sieben Accounts sind das über ein Gigabyte Transfer.
 *
 * In einem gemeinsamen Aufruf teilen sich alle dasselbe Zeitbudget, und die
 * teuren stehen hinten an. Genau so ging es aus: nach 11 Minuten standen
 * YouTube 5/5 und Instagram 4/5 draußen, TikTok 0/4 und X 0/3 meldeten
 * „Publishing timed out during platform API call".
 *
 * Getrennte Aufrufe geben jeder Plattform ihr eigenes Budget, und ein
 * Zeitverlust bei TikTok kostet YouTube nichts mehr.
 *
 * Wirft nie — jeder Ausgang landet in `targets`, samt der Art des Ausgangs
 * (siehe `failureKind`): davon hängt ab, ob der nächste Versuch denselben
 * Schlüssel nimmt.
 */
async function sendPerPlatform(
  env: Env,
  video: { id: string; projectId: string; filename: string; caption: string; creatorId?: string },
  accounts: AccountRow[],
  url: string,
  targets: TargetMap,
): Promise<{ postIds: string[]; sent: number; error?: string }> {
  // Je Schlüssel ein Aufruf. Neue Versuche tragen je Plattform einen
  // gemeinsamen Schlüssel; ein wiederholter Versuch behält seinen eigenen und
  // geht mit genau den Accounts raus, die ihn damals trugen (siehe
  // `reserveTargets`). Ein Schlüssel ohne Belegung kommt nicht vor —
  // abgesichert trotzdem, damit nie ohne Dublettensperre gesendet wird.
  const byKey = groupBy(accounts, (a) => targets[a.providerAccountId]?.key ?? `${video.id}#${a.platform}`)

  const postIds: string[] = []
  let sent = 0
  let error: string | undefined

  /*
   * Alle Aufrufe starten GLEICHZEITIG. Nacheinander erreichte bei einem
   * Versand im `waitUntil` womöglich nur der erste die Gegenseite: TikTok
   * lädt synchron und braucht Minuten, der Worker lebt danach höchstens 30
   * Sekunden. Gleichzeitig gestartet liegen alle Anfragen drüben, bevor er
   * endet — und ihre Posts entstehen auch dann, wenn keine Antwort mehr
   * ankommt (der Webhook trägt sie nach, sonst holt der verwaiste Versuch
   * sie mit demselben Schlüssel ab). Das eigene Zeitbudget je Plattform
   * bleibt: es sind weiterhin getrennte Aufrufe.
   */
  await Promise.allSettled(
    [...byKey].map(async ([idempotencyKey, group]) => {
      const platform = group[0].platform
      try {
        const res = await provider.createPost(
          env,
          {
            content: video.caption,
            title: video.filename.slice(0, 120),
            mediaItems: [{ type: 'video', url, filename: video.filename }],
            platforms: group.map((a) => ({
              platform: a.platform as Platform,
              accountId: a.providerAccountId,
              platformSpecificData: platformData(a.platform, video.caption),
            })),
            publishNow: true,
            // Kommt im Webhook unverändert zurück — damit findet das Ereignis
            // sein Video ohne Umweg über eine Suche. Und weil unser Aufruf
            // länger dauern kann, als der Worker lebt, ist der Webhook oft der
            // einzige Weg, auf dem die Post-ID je bei uns ankommt. `creatorId`
            // lenkt das Ereignis auf die Freigabe-Zeile statt aufs Video.
            metadata: {
              deliverableId: video.id,
              projectId: video.projectId,
              ...(video.creatorId ? { creatorId: video.creatorId } : {}),
            },
            tiktokSettings: platform === 'tiktok' ? { ...TIKTOK_SETTINGS } : undefined,
          },
          // Dublettensperre der Gegenseite (siehe `idempotencyKeyFor`).
          idempotencyKey,
        )

        const post = res.existingPost ?? res.post
        const postId = post?._id ?? post?.id

        /*
         * Ohne Post-ID ist der Versuch wertlos, auch wenn die Gegenseite ihn
         * angenommen hat: nachfassen können wir ihn nicht, und als
         * „abgeschickt" wäre er auch für den Nachschuss unsichtbar. Als
         * Ausgang ohne Gewissheit behandelt (Status 0): derselbe Schlüssel
         * holt den Post beim nächsten Mal ab.
         */
        if (!postId) {
          throw new provider.ZernioError(0, 'Anbieter lieferte keine Post-ID.')
        }
        postIds.push(postId)

        // Die Ziele stehen bereits belegt in `targets` (siehe
        // `reserveTargets`) — hier kommt nur noch dazu, was die Antwort weiß.
        Object.assign(targets, mergePostIntoTargets(targets, post!, accounts))
        sent += group.length
      } catch (err) {
        const message = err instanceof provider.ZernioError ? err.short : String(err).slice(0, 400)
        const kind = failureKind(err)
        // Zeitpunkt des FEHLERS, nicht des Sendebeginns: ein TikTok-Aufruf,
        // der nach elf Minuten scheitert, hätte den 10-min-Abstand sonst
        // schon beim Schreiben verbraucht.
        const ts = nowSec()
        error = message
        console.error('[publisher] Veröffentlichung fehlgeschlagen', video.id, platform, kind, message)
        for (const a of group) {
          const prev = targets[a.providerAccountId]
          // Die Belegung fortschreiben, nicht ersetzen: `earlierPostIds`
          // und `key` müssen bleiben — sonst wirft ein verspätetes Ereignis
          // eines alten Posts den nächsten Versuch um, und der nächste
          // Versuch hätte keinen Schlüssel zum Wiederverwenden.
          const base = {
            ...prev,
            platform: a.platform,
            username: a.username,
            // Nicht erneut hochzählen: die Reservierung hat das schon getan.
            attempts: prev?.attempts ?? 1,
            lastTryAt: ts,
          }
          if (kind === 'running') {
            /*
             * 409 `idempotency_conflict`: derselbe Schlüssel wird drüben noch
             * verarbeitet. Kein Fehlschlag — der Post entsteht gerade. Das
             * Ziel bleibt belegt; kommt kein Webhook, holt es der verwaiste
             * Versuch nach dem verlangten Abstand mit demselben Schlüssel ab.
             *
             * `unsure` zählt hier NICHT hoch: das Ziel bleibt „scheduled“, und
             * `reserveTargets` zählt genau diesen Versand beim nächsten Senden
             * als einen ohne Ausgang. Zählten beide, kostete jedes „läuft noch“
             * zwei der `MAX_UNSURE` Nachfragen — nachgestellt: nach drei
             * Nachfragen (1,5 h) war Schluss; lief die TikTok-Verarbeitung
             * länger und kam kein Webhook, ging der Clip nach 24 h mit neuem
             * Schlüssel ein zweites Mal raus.
             */
            targets[a.providerAccountId] = {
              ...base,
              state: 'scheduled',
              error: undefined,
              inFlight: true,
              ...(err instanceof provider.ZernioError && err.retryAfter
                ? { retryAt: ts + err.retryAfter }
                : {}),
            }
          } else if (kind === 'unsure') {
            // Ausgang unbekannt: der Post kann drüben trotzdem entstanden
            // sein. Nächster Versuch mit DEMSELBEN Schlüssel (`keyReusable`).
            targets[a.providerAccountId] = {
              ...base,
              state: 'failed',
              error: message,
              unsure: (prev?.unsure ?? 0) + 1,
              retryAt: undefined,
            }
          } else {
            // Klar abgelehnt, drüben entstand nichts: der nächste Versuch
            // ist ein neuer, mit neuem Schlüssel.
            targets[a.providerAccountId] = {
              ...base,
              state: 'failed',
              error: message,
              unsure: undefined,
              retryAt: undefined,
            }
          }
        }
      }
    }),
  )

  return { postIds, sent, error }
}

/**
 * Was ein gescheiterter Aufruf über den Post drüben sagt.
 *
 *   `rejected` — klar abgelehnt (4xx wie 400/401/403/404/422/429): es
 *   entstand nichts, der nächste Versuch bekommt einen neuen Schlüssel.
 *
 *   `unsure` — kein gesicherter Ausgang: die Anfrage brach ab (fetch warf),
 *   die Gegenseite antwortete mit 5xx/52x oder 408, oder ein anderer
 *   Konflikt (409 ohne `idempotency_conflict`, etwa eine Inhaltsdublette —
 *   dann steht dieser Inhalt drüben schon). Laut Spec kann der Post trotz
 *   5xx oder Zeitüberschreitung angelegt sein. Ein neuer Schlüssel stellte
 *   ihn dann ein zweites Mal ein.
 *
 *   `running` — 409 `idempotency_conflict`: derselbe Schlüssel ist drüben
 *   noch in Arbeit.
 */
function failureKind(err: unknown): 'rejected' | 'unsure' | 'running' {
  if (!(err instanceof provider.ZernioError)) return 'unsure'
  if (err.status === 409) return err.code === 'idempotency_conflict' ? 'running' : 'unsure'
  if (err.status === 0 || err.status === 408 || err.status >= 500) return 'unsure'
  return 'rejected'
}

/**
 * Wer ein Konto gerade hält — ein ANDERER Besitzer, bei dem der Clip für
 * dasselbe echte Konto läuft oder draußen ist (siehe `foreignHolds`).
 * `final`: dort ist er bereits draußen; diese Sperre fällt nie mehr.
 */
type Hold = { by: 'creator' | 'project'; final: boolean }

/** Nach Account-ID UND nach Plattform + Kontoname (siehe `handleKey`). */
type Holds = Map<string, Hold>

function holdFor(holds: Holds | undefined, a: AccountRow): Hold | undefined {
  if (!holds?.size) return undefined
  const key = handleKey(a.platform, a.username)
  return holds.get(a.providerAccountId) ?? (key ? holds.get(key) : undefined)
}

/**
 * Ein Ziel, das ein anderer Besitzer gerade bedient: sichtbar vermerkt statt
 * still übergangen, OHNE einen Versuch zu zählen. Was der Stand vorher trug
 * (Schlüssel, offener Ausgang), bleibt — fällt die Sperre, geht es von dort
 * weiter, notfalls mit demselben Schlüssel.
 */
function blockedTarget(seen: TargetOutcome | undefined, a: AccountRow, hold: Hold, now: number): TargetOutcome {
  return {
    ...seen,
    state: 'failed',
    platform: a.platform,
    username: a.username,
    error:
      hold.by === 'creator'
        ? 'Läuft auf diesem Konto bereits über die Verbreitung eines Creators.'
        : 'Läuft auf diesem Konto bereits über die Kampagne.',
    attempts: seen?.attempts ?? 0,
    lastTryAt: now,
    retryAt: undefined,
    blockedByCreator: hold.by === 'creator' ? true : undefined,
    blockedByProject: hold.by === 'project' ? true : undefined,
    blockedFinal: hold.final ? true : undefined,
  }
}

/**
 * Ein fälliges Ziel, dessen Account nicht mehr verbunden ist (getrennt, oder
 * beim Abgleich als abgelaufen herausgefallen). Dorthin lässt sich nichts
 * senden, und ein Neuverbinden bekommt eine neue Account-ID — dieses Ziel
 * erreicht es nie. Ohne Vermerk aber bliebe es „nachreichbar“ und hielte
 * seine Zeile für immer im Nachhol-Lauf. Also als ausgeschöpft vermerkt,
 * mit frischem Zeitstempel. Auf dem automatischen Weg (`endless`) wird es
 * trotzdem weiter im großen Abstand angesehen — kommt derselbe Account
 * zurück, geht der Clip dort noch raus.
 */
function goneTarget(t: TargetOutcome, now: number): TargetOutcome {
  return {
    ...t,
    state: 'failed',
    error: (t.error && !isBlocked(t) ? `${t.error}. ` : '') + 'Account nicht mehr verbunden.',
    attempts: Math.max(t.attempts ?? 0, MAX_TARGET_ATTEMPTS),
    unsure: undefined,
    retryAt: undefined,
    blockedByCreator: undefined,
    blockedByProject: undefined,
    blockedFinal: undefined,
    lastTryAt: now,
  }
}

/**
 * Wählt aus den Accounts die aus, die jetzt etwas bekommen dürfen.
 *
 * Accounts, deren Plattform die Datei nicht annimmt, fallen hier heraus —
 * mit sichtbarem Grund statt eines stillen Fehlschlags weiter hinten.
 * Instagram ist mit 300 MB die enge Grenze; TikTok und YouTube bekommen
 * denselben Clip trotzdem.
 */
function pickUsable(
  accounts: AccountRow[],
  targets: TargetMap,
  bytes: number,
  now: number,
  opts: {
    /** Siehe `dueAt` — nur für Stände, die noch nirgends draußen sind. */
    endless?: boolean
    /** Konten, die ein anderer Besitzer gerade bedient (siehe `foreignHolds`). */
    blocked?: Holds
  } = {},
): AccountRow[] {
  const busy = handlesInFlight(targets)
  const usable: AccountRow[] = []
  for (const a of accounts) {
    /*
     * Dritte Sperre gegen Doppelposts, und die einzige, die auch dann noch
     * hält, wenn die Post-ID verloren ging: ein Account, für den schon ein
     * Ergebnis vorliegt, bekommt hier nichts mehr. Ohne sie könnte ein
     * Nachhol-Lauf ein Video ein zweites Mal auf ein Profil stellen, auf dem
     * es längst steht.
     *
     * Die einzige Ausnahme ist eine VERWAISTE Belegung (siehe
     * `ORPHAN_AFTER_SEC`): sie wird erneut gesendet, aber mit ihrem
     * gespeicherten Schlüssel — ein schon angelegter Post kommt so zurück,
     * statt ein zweites Mal zu entstehen.
     */
    const seen = targets[a.providerAccountId]
    if (seen?.state === 'posted') continue
    if (seen?.state === 'scheduled' && !retryDue(seen, now, { endless: opts.endless })) continue

    /*
     * Gescheitert heißt nicht „sofort wieder". Auch hier gilt der Abstand aus
     * `retryDue` — sonst schickte der Nachhol-Lauf ein Video, das auf allen
     * Plattformen scheiterte (und darum keine Post-ID hat), jede
     * Viertelstunde erneut los. Die Obergrenze gilt nur ohne `endless`.
     */
    if (seen?.state === 'failed' && !retryDue(seen, now, { endless: opts.endless })) continue

    // Dasselbe echte Konto unter anderer ID läuft schon — siehe `handlesInFlight`.
    const key = handleKey(a.platform, a.username)
    if (key && busyElsewhere(busy, key, a.providerAccountId)) continue

    /*
     * Dasselbe echte Konto bekommt den Clip schon über einen anderen
     * Besitzer (die Verbreitung eines Creators bzw. das Projekt). Sichtbar
     * vermerkt statt still übergangen — sonst stünde ein Clip, dessen
     * einziges Ziel so belegt ist, als „zu groß" bzw. „wartet auf Accounts"
     * da. Ohne Versuch zu zählen und mit Zeitstempel: nach dem kurzen Abstand
     * wird erneut geprüft, und scheitert der Post dort, übernimmt dieser Weg.
     */
    const hold = holdFor(opts.blocked, a)
    if (hold) {
      targets[a.providerAccountId] = blockedTarget(seen, a, hold, now)
      continue
    }

    const limit = MAX_BYTES[a.platform as Platform] ?? MAX_BYTES_ANY
    if (bytes > limit) {
      targets[a.providerAccountId] = {
        state: 'failed',
        platform: a.platform,
        username: a.username,
        error: `Datei zu groß für ${platformLabel(a.platform)} (${Math.round(limit / 1024 / 1024)} MB Grenze).`,
        attempts: MAX_TARGET_ATTEMPTS,
        // Mit Zeitstempel: auf dem automatischen Weg (`endless`) kommt das
        // Ziel sonst bei jedem Lauf als „sofort fällig" wieder und belegte
        // einen Platz im Nachhol-Lauf, ohne dass je etwas passiert.
        lastTryAt: now,
      }
      continue
    }
    usable.push(a)
  }

  /*
   * Fällige Ziele, deren Account gar nicht mehr unter den Zielen ist —
   * siehe `goneTarget`. Nur auf dem Weg ohne Obergrenze: der Nachschuss
   * (`resendDue`) vermerkt sie selbst.
   */
  if (opts.endless) {
    const present = new Set(accounts.map((a) => a.providerAccountId))
    for (const [id, t] of Object.entries(targets)) {
      if (!present.has(id) && retryDue(t, now, { endless: true })) targets[id] = goneTarget(t, now)
    }
  }
  return usable
}

/**
 * Zweite Prüfung „läuft das Konto bei einem anderen Besitzer?“ — NACH dem
 * eigenen Belegen, unmittelbar vor dem Senden.
 *
 * Das Belegen ist ein Vergleichen-und-Tauschen, aber nur innerhalb EINES
 * Stands. Zwei Besitzer mit demselben echten Konto (zwei Creator, oder
 * Creator und Projekt) schreiben in verschiedene Zeilen; geben beide
 * gleichzeitig frei, lesen beide „nirgends belegt“, beide belegen mit
 * Erfolg — und beide senden. Deshalb hier noch einmal frisch nachsehen.
 * Jeder Lauf prüft erst NACH seinem eigenen Schreiben: wer zuerst belegt
 * und prüft, sendet; der zweite sieht dessen Belegung und tritt zurück.
 * Prüfen beide nach beiden Belegungen, treten beide zurück — der Clip geht
 * dann beim nächsten Takt über einen von beiden raus. Doppelt nie.
 *
 * Zurücktreten heißt: vermerken, nicht senden (siehe `blockedTarget`), mit
 * dem Stand von VOR dem Belegen — es zählt kein Versuch. Liefert die
 * Accounts, an die weiterhin gesendet wird.
 */
async function withdrawHeld(
  env: Env,
  ledger: Ledger,
  reserved: AccountRow[],
  before: TargetMap,
  targets: TargetMap,
  recheck?: () => Promise<Holds>,
): Promise<AccountRow[]> {
  if (!recheck) return reserved
  const holds = await recheck()
  const now = nowSec()
  const keep: AccountRow[] = []
  const back: string[] = []
  for (const a of reserved) {
    const hold = holdFor(holds, a)
    if (!hold) {
      keep.push(a)
      continue
    }
    targets[a.providerAccountId] = blockedTarget(before[a.providerAccountId], a, hold, now)
    back.push(a.providerAccountId)
  }
  if (!back.length) return keep

  // Sofort schreiben, nicht erst im Abschluss: solange die Belegung steht,
  // hielte sie den anderen Besitzer ebenfalls zurück.
  await commitLedger(env, ledger, (current) => {
    const merged: TargetMap = { ...current.targets }
    for (const id of back) {
      const cur = merged[id]
      // Hat seither jemand mehr gewusst (Post-ID), gilt das — wie `settleTarget`.
      if (cur && (cur.state === 'posted' || cur.postId)) continue
      merged[id] = targets[id]
    }
    return { status: summarize(merged), error: summarizeErrors(merged), targets: merged }
  })
  return keep
}

/**
 * Der Abschluss eines Laufs von `publishDeliverable` bzw. `publishForCreator`.
 *
 * Zwei Fälle mit verschiedenen Regeln:
 *
 *   OHNE Versand (Grenzen, keine Accounts, nichts fällig): geschrieben wird
 *   nur, wenn `publish_targets` noch so dasteht wie beim Lesen (`expected`).
 *   Hat seither jemand belegt oder ein Webhook etwas eingetragen, gilt
 *   dessen Stand — ein „wartet auf Accounts" darüber wäre falsch.
 *
 *   NACH einem Versand (`sent`): der eigene Ausgang wird in den FRISCH
 *   gelesenen Stand gemischt (`commitLedger`), und zwar nur für die Ziele,
 *   die dieser Lauf belegt hat, je Ziel nach `settleTarget`. Was ein Webhook
 *   während des Sendens eingetragen hat — etwa die Post-ID eines
 *   Instagram-Posts, dessen Antwort uns mit 5xx erreichte, während TikTok
 *   noch minutenlang lief —, bleibt so stehen. Früher schrieb der Abschluss
 *   seinen Stand vom Anfang blind zurück: die Post-ID war weg, Instagram
 *   stand wieder auf „gescheitert", und der Nachschuss stellte dasselbe Reel
 *   ein zweites Mal ein.
 */
function finisher(env: Env, ledger: Ledger, expected: string | null, targets: TargetMap) {
  return async (
    outcome: PublishOutcome,
    sent?: { ids: string[]; postIds: string[] },
  ): Promise<PublishOutcome> => {
    if (!sent) {
      const written = await writeLedger(
        env,
        ledger,
        { status: outcome.status, error: outcome.error ?? summarizeErrors(targets), targets },
        { expectTargets: expected },
      )
      // Ein anderer Lauf war schneller — sein Stand gilt, wie beim Belegen.
      return written ? outcome : { status: PUBLISH_STATUS.scheduled }
    }

    const done = await commitLedger(env, ledger, (current) => {
      const merged: TargetMap = { ...current.targets }
      for (const id of sent.ids) {
        const ours = targets[id]
        if (ours) merged[id] = settleTarget(current.targets[id], ours)
      }
      return {
        status: summarize(merged),
        error: summarizeErrors(merged) ?? outcome.error ?? null,
        targets: merged,
        postIds: sent.postIds,
      }
    })
    return {
      ...outcome,
      status: (done?.status as PublishStatus | undefined) ?? outcome.status,
      postId: outcome.postId ?? (done?.postIds ?? sent.postIds)[0],
    }
  }
}

/**
 * Der gemeinsame Rest von `publishDeliverable` und `publishForCreator`, ab
 * dem die Ziele feststehen: aussieben, Datei bereitstellen, belegen, senden.
 *
 * `expected` ist `publish_targets` so, wie der Aufrufer die Spalte gelesen
 * hat — das Belegen gelingt nur, wenn sie seither niemand angefasst hat
 * (siehe `reserveTargets`).
 */
async function sendVideo(
  env: Env,
  ledger: Ledger,
  row: Deliverable,
  accounts: AccountRow[],
  targets: TargetMap,
  expected: string | null,
  requestKey: (platform: string, attempt: number) => string,
  opts: {
    endless?: boolean
    /** Konten, die ein anderer Besitzer bedient — vor dem Belegen gelesen. */
    blocked?: Holds
    /** Liest dasselbe frisch, NACH dem Belegen (siehe `withdrawHeld`). */
    recheck?: () => Promise<Holds>
  } = {},
): Promise<PublishOutcome> {
  const finish = finisher(env, ledger, expected, targets)
  const usable = pickUsable(accounts, targets, row.bytes, nowSec(), opts)

  if (!usable.length) {
    // Nichts zu senden. Liegt bereits ein Ergebnis vor, ist das der Zustand,
    // der gilt — „zu groß" wäre dann schlicht falsch.
    return finish({
      status: Object.keys(targets).length ? summarize(targets) : PUBLISH_STATUS.tooLarge,
    })
  }

  // --- Datei bereitstellen ------------------------------------------------

  /*
   * Ohne `downloadAs` — die Gegenseite lädt die Datei, sie soll keinen
   * Speichern-Dialog auslösen.
   *
   * Und mit langer Gültigkeit: nicht der Anbieter allein holt diese Datei,
   * sondern auch Meta und Google, und die tun es, wann es ihnen passt und
   * wiederholen es später. Eine Stunde reicht dafür nicht — siehe
   * `PUBLISH_SIGN_TTL_SEC`.
   */
  let url: string
  try {
    url = await presignGet(env, row.r2Key, undefined, PUBLISH_SIGN_TTL_SEC)
  } catch (err) {
    return finish({
      status: PUBLISH_STATUS.failed,
      error: `Signierte URL fehlgeschlagen: ${String(err).slice(0, 200)}`,
    })
  }

  const caption = (row.caption ?? '').slice(0, TEXT_LIMIT.caption)

  // Erst belegen, dann senden — sonst schickt ein überlappender Lauf
  // dasselbe Video ein zweites Mal los. Siehe `reserveTargets`.
  const before: TargetMap = { ...targets }
  if (!(await reserveTargets(env, ledger, usable, targets, nowSec(), expected, requestKey))) {
    // Ein anderer Lauf hat seit dem Lesen belegt und sendet. Hier wird
    // nichts gesendet und nichts geschrieben — sein Stand ist der gültige.
    return { status: PUBLISH_STATUS.scheduled }
  }

  // Derselbe Clip auf demselben echten Konto über einen anderen Besitzer,
  // seit dem Lesen belegt? Dann hier zurücktreten (siehe `withdrawHeld`).
  const sending = await withdrawHeld(env, ledger, usable, before, targets, opts.recheck)
  if (!sending.length) return { status: summarize(targets) }

  const { postIds, sent, error } = await sendPerPlatform(
    env,
    {
      id: row.id,
      projectId: row.projectId,
      filename: row.filename,
      caption,
      creatorId: ledger.creatorId,
    },
    sending,
    url,
    targets,
  )

  const mine = { ids: sending.map((a) => a.providerAccountId), postIds }
  if (!sent) {
    // `error` trägt nur die letzte Meldung; `finish` setzt ohne sie die
    // vollständige Aufstellung je Account ein. Die ist die bessere Antwort.
    return finish({ status: PUBLISH_STATUS.failed, error: summarizeErrors(targets) ?? error }, mine)
  }
  return finish({ status: summarize(targets), postId: postIds[0] }, mine)
}

/**
 * Schickt ein fertiges Video an alle AUTOMATISCHEN Ziele seines Projekts
 * (siehe `autoTargetAccounts`).
 *
 * Läuft im Hintergrund (`waitUntil`) — der Clipper wartet nie darauf.
 * Wirft nie: jeder Ausgang wird als Zustand am Deliverable festgehalten,
 * damit nichts unbemerkt liegen bleibt.
 */
export async function publishDeliverable(env: Env, deliverableId: string): Promise<PublishOutcome> {
  const db = getDb(env)

  const [row] = await db
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row) return { status: PUBLISH_STATUS.failed, error: 'Video nicht gefunden.' }

  // Erste Sperre gegen Doppelposts: schon draußen, also nichts zu tun.
  // Was einzeln scheiterte, holt `retryFailedTargets` nach — gezielt und
  // ohne die Accounts anzufassen, die bereits laufen.
  const alreadySent = readPostIds(row)
  if (alreadySent.length) {
    return {
      status: (row.publishStatus as PublishStatus) ?? PUBLISH_STATUS.scheduled,
      postId: alreadySent[0],
    }
  }

  const ledger: Ledger = { deliverableId: row.id }
  const targets: TargetMap = readTargets(row.publishTargets)
  const finish = finisher(env, ledger, row.publishTargets, targets)

  if (!publishingReady(env)) {
    return finish({ status: PUBLISH_STATUS.failed, error: 'Anbindung nicht eingerichtet.' })
  }

  // --- Grenzen, bevor irgendein Aufruf rausgeht ---------------------------

  if (!(PUBLISHABLE_EXT as readonly string[]).includes(extOf(row.filename))) {
    return finish({ status: PUBLISH_STATUS.formatUnsupported })
  }
  if (row.bytes > MAX_BYTES_ANY) {
    return finish({ status: PUBLISH_STATUS.tooLarge })
  }

  // --- Ziele bestimmen ----------------------------------------------------

  // Frisch abgleichen: die Accounts hängt der Auftraggeber von Hand ein, und
  // der Spiegel könnte veraltet sein.
  await syncAutoTargets(env, row.projectId)
  const accounts = await autoTargetAccounts(env, row.projectId)
  if (!accounts.length) {
    return finish({ status: PUBLISH_STATUS.waitingForAccounts })
  }

  return sendVideo(
    env,
    ledger,
    row,
    accounts,
    targets,
    row.publishTargets,
    (platform) => `${row.id}#${platform}`,
    {
      // Nirgends draußen (sonst hätte die erste Sperre oben gegriffen) —
      // also ohne Obergrenze, nur mit Abstand. Siehe `dueAt`.
      endless: true,
      blocked: await distributedElsewhere(env, row.id),
      recheck: () => distributedElsewhere(env, row.id),
    },
  )
}

/**
 * Hält dieser fremde Stand das Konto? `true` = draußen (endgültig), `false`
 * = läuft, `null` = sperrt nicht.
 *
 * Die Sperre über Besitzergrenzen gilt NUR, solange beim anderen Besitzer ein
 * Post für dieses Konto läuft oder draußen ist. Was dort klar scheiterte oder
 * ausgeschöpft ist, oder selbst nur ein Sperrvermerk, sperrt hier nichts.
 * Sonst sperrten sich beide Seiten gegenseitig für immer: der Creator-Post
 * scheitert, sein Nachschuss ist durch das Projekt gesperrt, und das Projekt
 * durch den gescheiterten Creator-Post — das Konto bekäme den Clip auf keinem
 * Weg.
 *
 * „Läuft“ heißt dabei auch: Ausgang offen (`keyReusable`). Ein Aufruf, der
 * mit 5xx oder Zeitüberschreitung abbrach, und eine verwaiste Belegung können
 * drüben längst einen Post haben, nur der Webhook fehlt noch. Gab das den
 * Weg frei, stellte der andere Besitzer den Clip in genau dieser Lücke ein
 * zweites Mal auf dasselbe Konto (nachgestellt: Projekt-Post mit 502, der
 * Creator gibt eine Minute später frei — zwei Posts auf @brand). Der Halter
 * klärt den Ausgang selbst mit demselben Schlüssel; spätestens nach 24 h,
 * wenn die Gegenseite den Schlüssel vergisst, fällt die Sperre ohnehin.
 *
 * `active` = der Besitzer darf weiter senden. Ein Creator, der die Kampagne
 * verlassen hat, holt nichts mehr nach; seine bloßen Belegungen halten
 * deshalb nur, solange ihr Ausgang offen ist. Ein Post, der bei ihm schon
 * drüben läuft oder draußen ist, zählt weiter — das Nachfassen löst ihn ohne
 * Kampagnen-Bedingung auf, und bis dahin wäre ein zweiter Post ein Doppelpost.
 *
 * Der offene Ausgang zählt deshalb VOR der Kampagnen-Bedingung. Ein
 * Creator-Post mit 502 kann drüben längst stehen; tritt der Creator danach
 * aus, darf das den Weg nicht freigeben — sonst stellte das Projekt den Clip
 * auf dasselbe Konto, sobald der Kunde es dort verbindet (nachgestellt: zwei
 * Posts). Klären kann der Creator den Ausgang nicht mehr, er sendet nichts
 * nach; es bleibt beim Webhook oder bei der 24-h-Grenze aus `keyReusable`.
 */
function holdOf(t: TargetOutcome | undefined, now: number, active: boolean): boolean | null {
  if (!t || isBlocked(t)) return null
  if (t.state === 'posted') return true
  if (t.state === 'scheduled' && t.postId) return false
  if (keyReusable(t, now)) return false
  if (!active) return null
  if (t.state !== 'scheduled' || isOrphan(t, now)) return null
  return false
}

function addHolds(out: Holds, targets: TargetMap, by: Hold['by'], now: number, active: boolean) {
  for (const [id, t] of Object.entries(targets)) {
    const final = holdOf(t, now, active)
    if (final === null) continue
    for (const k of [id, handleKey(t.platform, t.username)]) {
      if (!k) continue
      // Mehrere Halter desselben Kontos: „draußen“ schlägt „läuft“.
      const prev = out.get(k)
      if (!prev || (final && !prev.final)) out.set(k, { by, final })
    }
  }
}

/**
 * Wer dieses Video auf welchem echten Konto gerade bedient — über alle
 * Besitzer AUSSER `self`: am Video (die automatischen Ziele des Projekts)
 * und an den Freigaben der Creator. Nach Account-ID UND nach Plattform und
 * Kontoname: verbindet ein Manager dasselbe Instagram-Konto bei zwei
 * Creatorn oder am Kundenprojekt, ist es unter jeder ID dasselbe Profil —
 * und bekäme den Clip sonst zwei-, dreimal.
 *
 * Immer frisch aus der Datenbank, auch der Stand des Videos: diese Abfrage
 * läuft ein zweites Mal NACH dem eigenen Belegen (siehe `withdrawHeld`).
 */
async function foreignHolds(env: Env, deliverableId: string, self: { creatorId?: string }): Promise<Holds> {
  const db = getDb(env)
  const now = nowSec()
  const out: Holds = new Map()

  if (self.creatorId) {
    const [video] = await db
      .select({ targets: schema.deliverables.publishTargets })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.id, deliverableId))
      .limit(1)
    // Das Projekt sendet ohne Kampagnen-Bedingung — es ist immer „aktiv“.
    if (video) addHolds(out, readTargets(video.targets), 'project', now, true)
  }

  const rows = await db
    .select({
      creatorId: schema.clipApprovals.creatorId,
      targets: schema.clipApprovals.publishTargets,
      active: sql<number>`exists (select 1 from ${schema.campaignCreators} cc where cc.project_id = ${schema.deliverables.projectId} and cc.creator_id = ${schema.clipApprovals.creatorId})`,
    })
    .from(schema.clipApprovals)
    .innerJoin(schema.deliverables, eq(schema.deliverables.id, schema.clipApprovals.deliverableId))
    .where(
      and(
        eq(schema.clipApprovals.deliverableId, deliverableId),
        self.creatorId ? ne(schema.clipApprovals.creatorId, self.creatorId) : undefined,
      ),
    )
  for (const row of rows) addHolds(out, readTargets(row.targets), 'creator', now, Boolean(row.active))
  return out
}

/**
 * Konten, auf denen ein Creator diesen Clip schon verbreitet — laufend oder
 * draußen. Für den automatischen Weg des Videos.
 *
 * Ohne diese Richtung ginge ein Clip zweimal auf dasselbe echte Konto, wenn
 * es zuerst ein Creator verbreitet und dasselbe Konto DANACH am Projekt
 * verbunden wird (etwa vom Manager, der beide betreut): der automatische Weg
 * sähe nur den Stand am Video, und der ist leer. Die Gegenrichtung —
 * Creator gegen Projekt und gegen andere Creator — ist dieselbe Abfrage
 * (`foreignHolds` mit `creatorId`).
 */
function distributedElsewhere(env: Env, deliverableId: string): Promise<Holds> {
  return foreignHolds(env, deliverableId, {})
}

/* -------------------------------------------------- Verbreitung über Creator */

/** Bisher der einzige Wert in `clip_approvals.status`. */
const APPROVED = 'approved'

/**
 * Darf dieser Creator diese Kampagne verbreiten?
 *
 * Drei Bedingungen, alle nötig: der Kunde hat die Kampagne freigegeben
 * (`creator_distribution`), der Creator ist ihr beigetreten, und es ist
 * NICHT seine eigene — die bekommt er ohnehin automatisch (siehe
 * `autoTargetAccounts`), und über die Verbreitung ginge sie doppelt raus.
 *
 * Geprüft wird bei jedem Senden, nicht nur beim Freigeben: nimmt der Kunde
 * seine Zustimmung zurück oder verlässt der Creator die Kampagne, geht ab
 * da auch kein Nachschuss mehr raus.
 *
 * `toSend` verlangt zusätzlich eine laufende Kampagne (`aktiv`): eine
 * pausierte oder beendete schickt nichts mehr los, auch keinen Nachschuss
 * eines halb veröffentlichten Clips. Ohne diese Bedingung, weil der Creator
 * ihre Clips weiterhin ansehen darf (siehe `distributableClip`).
 */
export async function creatorMayDistribute(
  env: Env,
  projectId: string,
  creatorId: string,
  opts: { toSend?: boolean } = {},
): Promise<boolean> {
  const db = getDb(env)
  const [project] = await db
    .select({ distribution: schema.projects.creatorDistribution, status: schema.projects.status })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project || project.distribution !== 1) return false
  if (opts.toSend && project.status !== 'aktiv') return false
  if ((await ownerCreatorOfProject(env, projectId)) === creatorId) return false

  const [joined] = await db
    .select({ id: schema.campaignCreators.creatorId })
    .from(schema.campaignCreators)
    .where(
      and(
        eq(schema.campaignCreators.projectId, projectId),
        eq(schema.campaignCreators.creatorId, creatorId),
      ),
    )
    .limit(1)
  return Boolean(joined)
}

/**
 * Hält die Freigabe eines Clips durch einen Creator fest — der Klick auf
 * „Freigeben & posten". Danach `publishForCreator` aufrufen (im
 * Hintergrund); bleibt der Aufruf aus, holt ihn der Nachhol-Lauf nach.
 *
 * Ein zweiter Klick ändert nichts: die Zeile besteht schon, und ein bereits
 * gesendeter Clip geht dank der Sperren in `publishForCreator` nicht noch
 * einmal raus.
 */
export async function recordApproval(
  env: Env,
  deliverableId: string,
  creatorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb(env)
  const [row] = await db
    .select({
      projectId: schema.deliverables.projectId,
      uploadStatus: schema.deliverables.uploadStatus,
    })
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row || row.uploadStatus !== 'complete') return { ok: false, error: 'Clip nicht gefunden.' }
  if (!(await creatorMayDistribute(env, row.projectId, creatorId))) {
    return { ok: false, error: 'Diese Kampagne ist nicht zur Verbreitung freigegeben.' }
  }

  const ts = nowSec()
  await db
    .insert(schema.clipApprovals)
    .values({ deliverableId, creatorId, status: APPROVED, decidedAt: ts, updatedAt: ts })
    .onConflictDoUpdate({
      target: [schema.clipApprovals.deliverableId, schema.clipApprovals.creatorId],
      set: { status: APPROVED, updatedAt: ts },
    })
  return { ok: true }
}

/** Die Freigaben zu einer Reihe von Clips — optional nur die eines Creators. */
export async function clipApprovalsFor(
  env: Env,
  deliverableIds: string[],
  creatorId?: string,
): Promise<ClipApproval[]> {
  if (!deliverableIds.length) return []
  // In Stücken (siehe `ID_CHUNK`): eine Kampagne kann mehr als hundert Clips haben.
  const rows = await inChunks(deliverableIds, (ids) =>
    getDb(env)
      .select()
      .from(schema.clipApprovals)
      .where(
        and(
          inArray(schema.clipApprovals.deliverableId, ids),
          creatorId ? eq(schema.clipApprovals.creatorId, creatorId) : undefined,
        ),
      ),
  )
  return rows.sort((a, b) => a.decidedAt - b.decidedAt)
}

async function approvalOf(
  env: Env,
  deliverableId: string,
  creatorId: string,
): Promise<ClipApproval | null> {
  const [row] = await getDb(env)
    .select()
    .from(schema.clipApprovals)
    .where(
      and(
        eq(schema.clipApprovals.deliverableId, deliverableId),
        eq(schema.clipApprovals.creatorId, creatorId),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Hält eine Freigabe als „Selbst posten“ fest (`PUBLISH_STATUS.manual`) —
 * für einen Creator, der beim Freigeben keinen verbindbaren Account hat und
 * auf Twitch oder Snapchat selbst postet.
 *
 * Nur, solange an der Freigabe noch nichts versucht wurde (keine Ziele, kein
 * Post): ein Clip, der schon über einen Account lief, behält seinen Stand.
 * Liefert, ob gesetzt wurde. Von diesem Stand aus sendet nur noch
 * `publishForCreator` mit `force` — siehe dort.
 */
export async function markApprovalManual(env: Env, deliverableId: string, creatorId: string): Promise<boolean> {
  const rows = await getDb(env)
    .update(schema.clipApprovals)
    .set({ publishStatus: PUBLISH_STATUS.manual, publishError: null, updatedAt: nowSec() })
    .where(
      and(
        eq(schema.clipApprovals.deliverableId, deliverableId),
        eq(schema.clipApprovals.creatorId, creatorId),
        eq(schema.clipApprovals.status, APPROVED),
        isNull(schema.clipApprovals.publishTargets),
        isNull(schema.clipApprovals.publishPostIds),
      ),
    )
    .returning({ id: schema.clipApprovals.deliverableId })
  return rows.length > 0
}

/**
 * Ein Creator stellt einen Kunden-Clip auf seine Kanäle — nach seiner
 * Freigabe (`recordApproval`).
 *
 * Dieselben Sperren wie `publishDeliverable`, nur gegen einen eigenen Stand
 * in `clip_approvals`: schon gesendet → nichts tun; erst belegen, dann
 * senden; was läuft oder steht, wird übersprungen; Grenzen je Plattform.
 * Der Idempotenzschlüssel trägt den Creator mit
 * (`${deliverableId}#c:${creatorId}#${platform}`), sonst bekäme er beim
 * Anbieter womöglich den Post eines anderen zurück.
 *
 * Ziele sind ALLE seine Accounts. Was dasselbe echte Konto gerade über einen
 * anderen Besitzer bekommt (das Projekt, ein anderer Creator), wird an der
 * Freigabe sichtbar als gesperrt vermerkt, nicht still weggelassen — sonst
 * zeigte die Seite „Wartet auf verbundene Accounts“ und einen Knopf, der
 * nichts bewirkt. Scheitert der Post dort, übernimmt dieser Weg (siehe
 * `foreignHolds`).
 *
 * `opts.synced` verhindert wiederholte Abgleiche: im Nachhol-Lauf soll
 * derselbe Creator nicht für jeden seiner Clips erneut abgeglichen werden,
 * und die Freigabe-Route gleicht höchstens alle paar Minuten ab (ein Creator
 * darin gilt als schon abgeglichen).
 *
 * `opts.force` ist der Knopf „Jetzt posten“: nur damit geht eine Freigabe im
 * Stand „Selbst posten“ (`PUBLISH_STATUS.manual`) raus; danach läuft sie wie
 * jede andere. Ohne `force` bleibt sie unangetastet.
 *
 * Wirft nie.
 */
export async function publishForCreator(
  env: Env,
  deliverableId: string,
  creatorId: string,
  opts: { synced?: Set<string>; force?: boolean } = {},
): Promise<PublishOutcome> {
  const approval = await approvalOf(env, deliverableId, creatorId)
  if (!approval || approval.status !== APPROVED) {
    return { status: PUBLISH_STATUS.failed, error: 'Keine Freigabe für diesen Clip.' }
  }

  // „Selbst posten“ läuft nie von allein — nur auf ausdrücklichen Klick.
  if (approval.publishStatus === PUBLISH_STATUS.manual && !opts.force) {
    return { status: PUBLISH_STATUS.manual }
  }

  const [row] = await getDb(env)
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row) return { status: PUBLISH_STATUS.failed, error: 'Video nicht gefunden.' }

  // Erste Sperre, wie am Video: schon draußen, also nichts zu tun.
  const alreadySent = readPostIds(approval)
  if (alreadySent.length) {
    return {
      status: (approval.publishStatus as PublishStatus) ?? PUBLISH_STATUS.scheduled,
      postId: alreadySent[0],
    }
  }

  // Die Zustimmung des Kunden kann zurückgenommen, die Kampagne pausiert
  // werden. Dann bleibt der Stand, wie er ist — geschrieben wird nichts,
  // gesendet auch nicht.
  if (!(await creatorMayDistribute(env, row.projectId, creatorId, { toSend: true }))) {
    return { status: PUBLISH_STATUS.failed, error: 'Kampagne nicht (mehr) zur Verbreitung freigegeben oder pausiert.' }
  }

  const ledger: Ledger = { deliverableId: row.id, creatorId }
  const targets: TargetMap = readTargets(approval.publishTargets)
  const finish = finisher(env, ledger, approval.publishTargets, targets)

  if (!publishingReady(env)) {
    return finish({ status: PUBLISH_STATUS.failed, error: 'Anbindung nicht eingerichtet.' })
  }
  if (!(PUBLISHABLE_EXT as readonly string[]).includes(extOf(row.filename))) {
    return finish({ status: PUBLISH_STATUS.formatUnsupported })
  }
  if (row.bytes > MAX_BYTES_ANY) {
    return finish({ status: PUBLISH_STATUS.tooLarge })
  }

  await syncCreatorOnce(env, creatorId, opts.synced)
  const accounts = await accountsForCreator(env, creatorId)
  if (!accounts.length) {
    return finish({ status: PUBLISH_STATUS.waitingForAccounts })
  }

  return sendVideo(
    env,
    ledger,
    row,
    accounts,
    targets,
    approval.publishTargets,
    (platform) => `${row.id}#c:${creatorId}#${platform}`,
    {
      /*
       * Ohne Obergrenze, wie am Video: die Sperre oben (`alreadySent`)
       * garantiert, dass diese Freigabe noch NIRGENDS draußen ist. Mit
       * Obergrenze ginge sie nach einer Stunde Anbieterstörung endgültig
       * verloren — ein erneuter Klick bewirkte nichts, und einen Knopf dafür
       * gibt es nicht.
       */
      endless: true,
      blocked: await foreignHolds(env, row.id, { creatorId }),
      recheck: () => foreignHolds(env, row.id, { creatorId }),
    },
  )
}

/** Einen Creator höchstens einmal je Nachhol-Lauf abgleichen. */
async function syncCreatorOnce(env: Env, creatorId: string, synced?: Set<string>) {
  if (synced?.has(creatorId)) return
  synced?.add(creatorId)
  await syncCreatorAccounts(env, creatorId)
}

/* -------------------------------------------------------------- Nachfassen */

/** Was wir über einen Account wissen — für lesbare Namen in den Ergebnissen. */
type AccountRow = { providerAccountId: string; platform: string; username: string | null }

/**
 * Verrechnet die Antwort der Gegenseite mit dem, was wir schon wussten.
 *
 * Der bisherige Stand wird bewusst NICHT einfach überschrieben: nach einem
 * gezielten Nachschuss trägt der neue Post nur noch die Accounts, die beim
 * ersten Mal scheiterten. Ein Überschreiben ließe die bereits
 * veröffentlichten Accounts aus der Aufstellung verschwinden — und damit
 * genau die Information, die einen Doppelpost verhindert.
 */
function mergePostIntoTargets(
  previous: TargetMap,
  post: provider.ZernioPost,
  accounts: AccountRow[],
): TargetMap {
  const map: TargetMap = { ...previous }
  const known = new Map(accounts.map((a) => [a.providerAccountId, a]))
  const postId = post._id ?? post.id ?? ''

  for (const entry of post.platforms ?? []) {
    const id = provider.accountRef(entry.accountId)
    if (!id) continue

    const current = map[id]
    const link = entry.platformPostUrl ?? entry.publishedUrl ?? current?.url
    const state = String(entry.status ?? '').toLowerCase()
    const published = state === 'published' || state === 'posted' || state === 'success'

    /*
     * Ein Ereignis zu einem FRÜHEREN Versuch auf diesem Account.
     *
     * Ist das Ziel seither neu belegt, darf ein verspätetes „gescheitert"
     * oder „in Arbeit" des alten Posts es nicht mehr umwerfen: stünde es
     * wieder auf „gescheitert", wäre es für den nächsten Nachschuss fällig,
     * während der neue Versuch noch läuft — das Video ginge zweimal raus.
     * Nur „draußen" zählt noch, denn dann steht es tatsächlich auf dem Profil.
     */
    if (postId && current?.earlierPostIds?.includes(postId)) {
      if (published && current.state !== 'posted') {
        map[id] = { ...current, state: 'posted', url: link ?? undefined, postId, error: undefined }
      }
      continue
    }

    const account = known.get(id)
    const base = {
      platform: entry.platform || account?.platform || '',
      username: account?.username ?? current?.username ?? null,
      attempts: current?.attempts ?? 1,
      // Muss mit: ohne den Zeitstempel gilt ein Ziel in `retryDue` als
      // sofort fällig, und der Abstand zwischen zwei Versuchen wäre
      // wirkungslos — alle drei Versuche lägen in derselben Viertelstunde.
      lastTryAt: current?.lastTryAt,
      // Zu welchem Post dieser Stand gehört (siehe `TargetOutcome.postId`).
      ...(postId || current?.postId ? { postId: postId || current?.postId } : {}),
      ...(current?.earlierPostIds?.length ? { earlierPostIds: current.earlierPostIds } : {}),
      // Der Schlüssel bleibt zur Nachverfolgung. `unsure`, `retryAt` und
      // Sperrvermerke fallen weg: mit dem Post ist der Ausgang bekannt.
      ...(current?.key ? { key: current.key, keyAt: current.keyAt } : {}),
    }

    if (published) {
      map[id] = { ...base, state: 'posted', url: link ?? undefined }
      continue
    }

    /*
     * Was einmal draußen ist, bleibt draußen.
     *
     * Ereignisse kommen nicht in der Reihenfolge an, in der sie entstanden
     * sind, und seit je Plattform ein eigener Post existiert, treffen zu
     * einem Video mehrere Ereignisketten ein. Ein verspätetes
     * „noch in Arbeit" darf einen bereits gemeldeten Permalink nicht wieder
     * einkassieren — der Beitrag steht dann sichtbar auf dem Profil, während
     * unsere Oberfläche „wird veröffentlicht" behauptet und der Nachhol-Lauf
     * ihn ein zweites Mal stellt.
     */
    if (map[id]?.state === 'posted') {
      if (link && !map[id].url) map[id] = { ...map[id], url: link }
      continue
    }
    if (state === 'failed' || state === 'error') {
      map[id] = {
        ...base,
        state: 'failed',
        error: (entry.error ?? map[id]?.error ?? 'Plattform meldete einen Fehler.').slice(0, 300),
      }
      continue
    }
    // pending, processing, scheduled — der Ausgang steht noch aus.
    map[id] = { ...base, state: 'scheduled', url: link ?? undefined }
  }

  return map
}

/**
 * Holt den tatsächlichen Ausgang eines Posts und schreibt ihn je Account fort.
 *
 * Warum das nötig ist, obwohl es Webhooks gibt: ein verlorenes Ereignis
 * merkt niemand. Ohne Nachfassen stünde bei uns „wird veröffentlicht",
 * während der Post drüben längst gescheitert ist — genau so blieb einmal ein
 * gescheiterter TikTok-Versuch unsichtbar.
 */
export async function refreshPostStatus(
  env: Env,
  deliverableId: string,
): Promise<PublishStatus | null> {
  if (!publishingReady(env)) return null

  const db = getDb(env)
  const [row] = await db
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row) return null
  const postIds = readPostIds(row)
  if (!postIds.length) return null

  const accounts = await autoTargetAccounts(env, row.projectId)
  return refreshLedger(env, { deliverableId: row.id }, postIds, accounts)
}

/** Dasselbe für die Verbreitung eines Creators. */
export async function refreshCreatorPost(
  env: Env,
  deliverableId: string,
  creatorId: string,
): Promise<PublishStatus | null> {
  if (!publishingReady(env)) return null

  const approval = await approvalOf(env, deliverableId, creatorId)
  if (!approval) return null
  const postIds = readPostIds(approval)
  if (!postIds.length) return null

  const accounts = await accountsForCreator(env, creatorId)
  return refreshLedger(env, { deliverableId, creatorId }, postIds, accounts)
}

async function refreshLedger(
  env: Env,
  ledger: Ledger,
  postIds: string[],
  accounts: AccountRow[],
): Promise<PublishStatus | null> {
  const posts: provider.ZernioPost[] = []

  // Je Plattform ein eigener Post — also auch je Plattform ein eigenes
  // Nachfassen. Ein Ausfall bei einem davon darf die übrigen nicht kosten.
  for (const postId of postIds) {
    try {
      posts.push((await provider.getPost(env, postId)).post)
    } catch (err) {
      console.error(
        '[publisher] Nachfassen fehlgeschlagen',
        ledger.deliverableId,
        ledger.creatorId ?? '',
        postId,
        String(err).slice(0, 200),
      )
    }
  }
  if (!posts.length) return null

  // Die Abrufe dauern Sekunden. Gemischt wird deshalb in den Stand, der
  // DANACH in der Datenbank steht, nicht in den vom Anfang — sonst drehte
  // das Nachfassen eine Belegung zurück, die ein anderer Lauf inzwischen
  // geschrieben hat, und das Ziel wäre für einen zweiten Versand fällig,
  // während der erste noch läuft (siehe `commitLedger`).
  return persistTargets(env, ledger, (current) =>
    posts.reduce((map, post) => mergePostIntoTargets(map, post, accounts), current),
  )
}

/**
 * Zustand schreiben und die Zusammenfassung zurückgeben — für Nachfassen und
 * Webhook.
 *
 * `apply` bekommt den FRISCH gelesenen Stand und mischt das Ereignis hinein
 * (siehe `commitLedger`); geschrieben wird nur, wenn ihn seither niemand
 * geändert hat. Früher schrieben beide ihren beim Lesen gehaltenen Stand
 * unbedingt zurück und konnten so eine Belegung umwerfen, die ein anderer
 * Lauf eben geschrieben hatte — samt einem zweiten Versand desselben Videos.
 *
 * `fresh` sind die Post-IDs, die dieser Aufruf mitbringt; die bekannten
 * bleiben ohnehin stehen. Sie zu schreiben ist KEIN Beiwerk, sondern die
 * Lehre aus dem ersten echten Fehlschlag: unser Aufruf zur Gegenseite lief
 * 11 Minuten, der Worker war längst abgeräumt, als die Antwort kam — die
 * Post-ID stand nur noch im Webhook. Der schrieb bis hierher aber
 * ausschließlich die Ziele, nie die ID. Ergebnis: ein Video mit
 * `publish_post_id IS NULL`, das der Nachhol-Lauf weder nachfassen (er
 * verlangt eine ID) noch sicher wiederholen konnte — die Sperre gegen
 * Doppelposts in `publishDeliverable` prüft genau diese Spalte.
 */
async function persistTargets(
  env: Env,
  ledger: Ledger,
  apply: (current: TargetMap) => TargetMap,
  fresh: string[] = [],
): Promise<PublishStatus | null> {
  const done = await commitLedger(env, ledger, (current) => {
    const targets = apply(current.targets)
    return { status: summarize(targets), error: summarizeErrors(targets), targets, postIds: fresh }
  })
  return done ? (done.status as PublishStatus) : null
}

/** Dasselbe, ausgehend von der Post-ID der Gegenseite (Webhook-Weg). */
export async function refreshByPostId(env: Env, postId: string): Promise<boolean> {
  if (!postId) return false
  const db = getDb(env)
  const [row] = await db
    .select({ id: schema.deliverables.id })
    .from(schema.deliverables)
    // Auch die Nebenposts der übrigen Plattformen finden, nicht nur den
    // ersten: `publish_post_ids` ist ein JSON-Array von Zeichenketten.
    .where(
      or(
        eq(schema.deliverables.publishPostId, postId),
        like(schema.deliverables.publishPostIds, `%"${postId}"%`),
      ),
    )
    .limit(1)
  if (row) {
    await refreshPostStatus(env, row.id)
    return true
  }

  // Kein Video-Post — dann vielleicht einer aus der Verbreitung eines Creators.
  const [approval] = await db
    .select({
      deliverableId: schema.clipApprovals.deliverableId,
      creatorId: schema.clipApprovals.creatorId,
    })
    .from(schema.clipApprovals)
    .where(like(schema.clipApprovals.publishPostIds, `%"${postId}"%`))
    .limit(1)
  if (!approval) return false
  await refreshCreatorPost(env, approval.deliverableId, approval.creatorId)
  return true
}

/**
 * Übernimmt einen Webhook-Post direkt, ohne Rückfrage bei der Gegenseite.
 *
 * Die Nutzlast trägt bereits alles: Ziele, Zustand je Account, Links und
 * über `metadata` unsere eigene Deliverable-ID. Ein zusätzlicher GET wäre
 * ein Aufruf ohne Erkenntnisgewinn.
 *
 * Trägt `metadata` eine `creatorId`, gehört der Post zur Verbreitung dieses
 * Creators: dann wird AUSSCHLIESSLICH seine Freigabe-Zeile fortgeschrieben,
 * nie das Video. Sonst sähe ein Clip, den ein Creator gepostet hat, für das
 * Projekt bereits als „draußen" aus.
 */
export async function applyPostEvent(env: Env, post: provider.ZernioPost): Promise<boolean> {
  const db = getDb(env)
  const postId = post._id ?? post.id ?? ''
  const fromMeta = typeof post.metadata?.deliverableId === 'string' ? post.metadata.deliverableId : ''
  const creatorId = typeof post.metadata?.creatorId === 'string' ? post.metadata.creatorId : ''
  if (!fromMeta && !postId) return false

  if (creatorId) return applyApprovalEvent(env, post, postId, fromMeta, creatorId)

  const [row] = await db
    .select()
    .from(schema.deliverables)
    .where(
      fromMeta
        ? eq(schema.deliverables.id, fromMeta)
        : or(
            eq(schema.deliverables.publishPostId, postId),
            like(schema.deliverables.publishPostIds, `%"${postId}"%`),
          ),
    )
    .limit(1)

  if (!row) {
    // Ohne Metadaten kann der Post auch aus einer Verbreitung stammen.
    if (fromMeta) return false
    const [approval] = await db
      .select({ creatorId: schema.clipApprovals.creatorId })
      .from(schema.clipApprovals)
      .where(like(schema.clipApprovals.publishPostIds, `%"${postId}"%`))
      .limit(1)
    return approval ? applyApprovalEvent(env, post, postId, '', approval.creatorId) : false
  }

  /*
   * Die Post-ID wird hier ÜBERNOMMEN, nicht nur geprüft.
   *
   * Bis hierher stand hier eine Sperre, die jedes Ereignis verwarf, dessen
   * ID nicht der gespeicherten entsprach. Das war aus zwei Gründen falsch:
   *
   * Erstens gibt es seit dem Aufteilen je Plattform bis zu sechs Posts je
   * Video — fast alle Ereignisse hätte diese Sperre weggeworfen.
   *
   * Zweitens ist der Webhook oft der EINZIGE Weg, auf dem wir die ID
   * überhaupt erfahren. Dauert unser Aufruf zur Gegenseite länger, als der
   * Worker leben darf, kommt die Antwort nie bei uns an — beim ersten echten
   * Clip waren es 11 Minuten. Das Ereignis `post.scheduled` traf dagegen
   * nach 16 Sekunden ein und trug die ID; verworfen wurde sie trotzdem.
   *
   * Gegen verspätete Ereignisse schützt jetzt `mergePostIntoTargets`: was
   * einmal als veröffentlicht gemeldet wurde, wird dort nicht mehr
   * zurückgestuft, und ein Ereignis zu einem früheren Versuch wirft eine
   * neue Belegung nicht um. Das sind die Regeln, die tatsächlich zählen.
   */
  const accounts = await autoTargetAccounts(env, row.projectId)
  await persistTargets(
    env,
    { deliverableId: row.id },
    (current) => mergePostIntoTargets(current, post, accounts),
    postId ? [postId] : [],
  )
  return true
}

/** Ein Webhook-Post aus der Verbreitung eines Creators — gleiche Regeln, andere Zeile. */
async function applyApprovalEvent(
  env: Env,
  post: provider.ZernioPost,
  postId: string,
  deliverableId: string,
  creatorId: string,
): Promise<boolean> {
  const [approval] = await getDb(env)
    .select()
    .from(schema.clipApprovals)
    .where(
      and(
        eq(schema.clipApprovals.creatorId, creatorId),
        deliverableId
          ? eq(schema.clipApprovals.deliverableId, deliverableId)
          : like(schema.clipApprovals.publishPostIds, `%"${postId}"%`),
      ),
    )
    .limit(1)
  if (!approval) return false

  const accounts = await accountsForCreator(env, creatorId)
  await persistTargets(
    env,
    { deliverableId: approval.deliverableId, creatorId },
    (current) => mergePostIntoTargets(current, post, accounts),
    postId ? [postId] : [],
  )
  return true
}

/**
 * Meldet, ob dieses Webhook-Ereignis schon verarbeitet wurde.
 *
 * Die Zustellung ist „mindestens einmal": bei langsamer Antwort kommt
 * dasselbe Ereignis erneut. Ohne diese Sperre liefe die Verarbeitung doppelt.
 */
export async function seenEvent(env: Env, eventId: string): Promise<boolean> {
  if (!eventId) return false
  try {
    await getDb(env)
      .insert(schema.publishEvents)
      .values({ eventId, receivedAt: nowSec() })
    return false
  } catch {
    // Verletzt den Primärschlüssel — also schon dagewesen.
    return true
  }
}

/* --------------------------------------------------------------- Nachschuss */

/**
 * Schickt genau die Accounts nach, die beim letzten Versuch scheiterten.
 *
 * Der Zuschnitt ist der Kern: war Instagram draußen und TikTok nicht, hätte
 * ein schlichtes „nochmal senden" denselben Reel ein zweites Mal auf
 * Instagram gestellt. Zielgruppe sind deshalb nur Accounts im Zustand
 * `failed`, und auch die nur bis `MAX_TARGET_ATTEMPTS` — dazu verwaiste
 * Belegungen (mit ihrem Schlüssel, siehe `ORPHAN_AFTER_SEC`) und Sperren über
 * einen anderen Besitzer, die ohne Obergrenze neu geprüft werden.
 */
export async function retryFailedTargets(
  env: Env,
  deliverableId: string,
): Promise<{ retried: string[]; postId?: string; error?: string }> {
  if (!publishingReady(env)) return { retried: [], error: 'Anbindung nicht eingerichtet.' }

  const db = getDb(env)
  const [row] = await db
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row) return { retried: [], error: 'Video nicht gefunden.' }

  const targets = readTargets(row.publishTargets)
  const now = nowSec()
  const dueIds = Object.keys(targets).filter((id) => retryDue(targets[id], now))
  if (!dueIds.length && !Object.values(targets).some((t) => isOrphan(t, now))) return { retried: [] }

  // Nur Accounts, die auch (noch) verbunden sind. Ein inzwischen getrennter
  // Account würde jeden Versuch scheitern lassen.
  await syncAutoTargets(env, row.projectId)
  const accounts = await autoTargetAccounts(env, row.projectId)

  return resendDue(
    env,
    { deliverableId: row.id },
    row,
    targets,
    row.publishTargets,
    accounts,
    dueIds,
    // Eigener Schlüssel je Versuch UND Plattform — mit dem alten käme der
    // erste Post zurück statt eines neuen.
    (platform, attempt) => `${row.id}#${attempt}#${platform}`,
    // Was ein Creator auf demselben Konto gerade verbreitet, bekommt hier
    // keinen Nachschuss — siehe `distributedElsewhere`.
    await distributedElsewhere(env, row.id),
    () => distributedElsewhere(env, row.id),
  )
}

/** Dasselbe für die Verbreitung eines Creators — gleiche Regeln, eigener Stand. */
export async function retryCreatorTargets(
  env: Env,
  deliverableId: string,
  creatorId: string,
  opts: { synced?: Set<string> } = {},
): Promise<{ retried: string[]; postId?: string; error?: string }> {
  if (!publishingReady(env)) return { retried: [], error: 'Anbindung nicht eingerichtet.' }

  const approval = await approvalOf(env, deliverableId, creatorId)
  if (!approval || approval.status !== APPROVED) return { retried: [], error: 'Keine Freigabe für diesen Clip.' }

  const [row] = await getDb(env)
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row) return { retried: [], error: 'Video nicht gefunden.' }

  const targets = readTargets(approval.publishTargets)
  const now = nowSec()
  const dueIds = Object.keys(targets).filter((id) => retryDue(targets[id], now))
  if (!dueIds.length && !Object.values(targets).some((t) => isOrphan(t, now))) return { retried: [] }

  if (!(await creatorMayDistribute(env, row.projectId, creatorId, { toSend: true }))) {
    return { retried: [], error: 'Kampagne nicht (mehr) zur Verbreitung freigegeben oder pausiert.' }
  }

  await syncCreatorOnce(env, creatorId, opts.synced)
  const accounts = await accountsForCreator(env, creatorId)

  return resendDue(
    env,
    { deliverableId: row.id, creatorId },
    row,
    targets,
    approval.publishTargets,
    accounts,
    dueIds,
    (platform, attempt) => `${row.id}#c:${creatorId}#${attempt}#${platform}`,
    await foreignHolds(env, row.id, { creatorId }),
    () => foreignHolds(env, row.id, { creatorId }),
  )
}

/**
 * Der gemeinsame Teil beider Nachschüsse, ab dem die fälligen Ziele
 * feststehen. `expected` wie bei `sendVideo`: der gelesene Stand von
 * `publish_targets`.
 */
async function resendDue(
  env: Env,
  ledger: Ledger,
  row: Deliverable,
  targets: TargetMap,
  expected: string | null,
  accounts: AccountRow[],
  dueIds: string[],
  requestKey: (platform: string, attempt: number) => string,
  blocked: Holds = new Map(),
  recheck?: () => Promise<Holds>,
): Promise<{ retried: string[]; postId?: string; error?: string }> {
  const ts = nowSec()

  /*
   * Verwaiste Belegungen, deren Wiederholungen ohne Ausgang aufgebraucht
   * sind (`MAX_UNSURE`): sie werden nicht mehr gesendet, sollen aber auch
   * nicht für immer „wird veröffentlicht“ zeigen. Als gescheitert vermerkt —
   * kommt doch noch ein Webhook zu ihrem Post, trägt er den Ausgang nach.
   */
  for (const [id, t] of Object.entries(targets)) {
    if (isOrphan(t, ts) && !retryDue(t, ts)) {
      targets[id] = { ...t, state: 'failed', error: 'Kein Ausgang bekannt: wiederholt ohne Antwort.', lastTryAt: ts }
    }
  }

  // Dasselbe echte Konto unter anderer ID läuft schon — siehe `handlesInFlight`.
  const busy = handlesInFlight(targets)
  const present = new Map(accounts.map((a) => [a.providerAccountId, a]))
  const due: AccountRow[] = []
  for (const id of dueIds) {
    const t = targets[id]
    const a = present.get(id)
    if (!t) continue
    // Account nicht mehr verbunden — siehe `goneTarget`.
    if (!a) {
      targets[id] = goneTarget(t, ts)
      continue
    }
    const key = handleKey(a.platform, a.username)
    const hold = holdFor(blocked, a)
    if (hold) {
      targets[id] = blockedTarget(t, a, hold, ts)
      continue
    }
    if (row.bytes > (MAX_BYTES[a.platform as Platform] ?? MAX_BYTES_ANY) || (key && busyElsewhere(busy, key, id))) {
      targets[id] = { ...t, lastTryAt: ts }
      continue
    }
    due.push(a)
  }

  if (!due.length) {
    /*
     * Fällig, aber nichts zu senden: der Account ist nicht mehr verbunden,
     * die Datei zu groß, oder dasselbe Konto läuft gerade auf anderem Weg.
     * Ohne Spur bliebe die Zeile im Nachhol-Lauf vorn stehen und belegte
     * jedes Mal einen seiner 25 Plätze, ohne dass je etwas geschieht — bei
     * genug solchen Zeilen käme kein anderes Video mehr dran. Vermerkt ist
     * es oben, mit frischem Zeitstempel und ohne einen Versuch zu zählen.
     * Nur per Vergleichen-und-Tauschen — hat jemand anderes inzwischen
     * geschrieben, ist ohnehin Bewegung drin.
     */
    await writeLedger(env, ledger, { status: summarize(targets), targets }, { expectTargets: expected })
    return { retried: [] }
  }

  const caption = (row.caption ?? '').slice(0, TEXT_LIMIT.caption)

  /*
   * Frische signierte Adresse: die alte mag noch gelten, aber ein
   * abgelaufener Link wäre ein zweiter Fehlversuch aus reiner Sparsamkeit.
   * Nebenbei umgeht die neue Signatur die 24-Stunden-Dublettenprüfung der
   * Gegenseite, die über Text UND Medien-URL gebildet wird. Ein Versuch mit
   * gespeichertem Schlüssel bekommt trotzdem seinen ursprünglichen Post
   * zurück — der Schlüssel zählt allein, nicht der Inhalt.
   */
  let url: string
  try {
    url = await presignGet(env, row.r2Key, undefined, PUBLISH_SIGN_TTL_SEC)
  } catch (err) {
    return { retried: [], error: `Signierte URL fehlgeschlagen: ${String(err).slice(0, 200)}` }
  }

  // Erst belegen, dann senden. Beim Nachschuss ist das besonders wichtig:
  // er läuft im Viertelstundentakt, und ein TikTok-Versand kann länger
  // dauern als ein Takt breit ist. Hat seit dem Lesen jemand anderes den
  // Stand angefasst (ein überlappender Lauf, ein Webhook), wartet dieser
  // Nachschuss auf den nächsten Takt — dann mit dem frischen Stand.
  const before: TargetMap = { ...targets }
  if (!(await reserveTargets(env, ledger, due, targets, nowSec(), expected, requestKey))) {
    return { retried: [] }
  }
  const sending = await withdrawHeld(env, ledger, due, before, targets, recheck)
  if (!sending.length) return { retried: [] }

  // Auch der Nachschuss geht je Plattform getrennt raus. Gerade hier zählt
  // das: die Ziele, die überhaupt nachzureichen sind, sind überwiegend die
  // teuren — beim ersten echten Clip waren es vier TikTok- und drei
  // X-Accounts. Genau die noch einmal in einen gemeinsamen Aufruf zu packen,
  // hieße denselben Fehler ein zweites Mal zu machen.
  const { postIds, sent, error } = await sendPerPlatform(
    env,
    {
      id: row.id,
      projectId: row.projectId,
      filename: row.filename,
      caption,
      creatorId: ledger.creatorId,
    },
    sending,
    url,
    targets,
  )

  // Wie beim ersten Versand: in den frisch gelesenen Stand mischen, nicht den
  // vom Anfang zurückschreiben — sonst ginge verloren, was ein Webhook
  // während des Sendens eingetragen hat (siehe `finisher`).
  await finisher(env, ledger, expected, targets)(
    { status: summarize(targets), error },
    { ids: sending.map((a) => a.providerAccountId), postIds },
  )

  if (!sent) return { retried: [], error }
  return {
    retried: sending
      .filter((a) => targets[a.providerAccountId]?.state !== 'failed')
      .map((a) => a.providerAccountId),
    postId: postIds[0],
  }
}

/* ---------------------------------------------------------- Nachhol-Läufe */

/*
 * Bausteine für die Auswahl der Nachhol-Läufe, direkt in SQL über das JSON
 * in `publish_targets`. Kaputter Inhalt zählt als leer, statt die ganze
 * Abfrage scheitern zu lassen (`json_each` wirft bei ungültigem JSON).
 */
type TargetsColumn = typeof schema.deliverables.publishTargets | typeof schema.clipApprovals.publishTargets

const targetsJson = (column: TargetsColumn) =>
  sql`(case when json_valid(${column}) then ${column} else '{}' end)`

/**
 * Zahlen direkt in den Text statt als Parameter: es sind Konstanten bzw.
 * eine Uhrzeit aus `nowSec()`, nie Eingaben — und D1 bindet höchstens 100
 * Parameter je Abfrage, die Fälligkeitsrechnung steht mehrfach darin.
 */
const num = (v: number) => sql.raw(String(Math.floor(v)))

/** Ein Feld des Ziels in `json_each(...) j`. */
const field = (name: string) => sql.raw(`json_extract(j.value, '$.${name}')`)

/**
 * `dueAt` als SQL, für ein Ziel `j` — dieselbe Rechnung, Fall für Fall. `null`
 * heißt: dieses Ziel ist nie fällig. `capped` = mit Obergrenzen (Nachschuss),
 * ohne = `endless` (noch nirgends draußen).
 */
function dueAtSql(capped: boolean, now: number) {
  const state = field('state')
  const last = field('lastTryAt')
  const unsure = sql`coalesce(${field('unsure')}, 0)`
  const attempts = sql`coalesce(${field('attempts')}, 0)`
  const retryAt = sql`coalesce(${field('retryAt')}, 0)`
  const blocked = sql`(${field('blockedByCreator')} = 1 or ${field('blockedByProject')} = 1)`
  const resumable = sql`(${field('key')} is not null and ${field('postId')} is null and ${unsure} > 0 and (${field('keyAt')} is null or ${num(now)} - ${field('keyAt')} < ${num(KEY_TTL_SEC)}))`
  const sends = sql`(${attempts} + max(${unsure} - 1, 0))`
  const wait = sql`(case when ${sends} <= 0 then 0 when ${sends} = 1 then ${num(RETRY_BACKOFF_SEC[0])} when ${sends} = 2 then ${num(RETRY_BACKOFF_SEC[1])} else ${num(RETRY_BACKOFF_SEC[2])} end)`
  const orphanCap = capped ? sql`when ${unsure} >= ${num(MAX_UNSURE)} then null` : sql``
  const failedCap = capped
    ? sql`when (case when ${resumable} then ${unsure} >= ${num(MAX_UNSURE)} else ${attempts} >= ${num(MAX_TARGET_ATTEMPTS)} end) then null`
    : sql``
  return sql`(case
    when ${state} = 'failed' and ${blocked} then (case when ${field('blockedFinal')} = 1 then null else coalesce(${last}, 0) + ${num(RETRY_BACKOFF_SEC[0])} end)
    when ${state} = 'scheduled' then (case when ${field('postId')} is not null or ${last} is null or ${field('key')} is null then null when ${field('inFlight')} = 1 and ${field('keyAt')} is not null and ${num(now)} - ${field('keyAt')} >= ${num(KEY_TTL_SEC)} then null ${orphanCap} else max(${last} + ${num(ORPHAN_AFTER_SEC)}, ${retryAt}) end)
    when ${state} = 'failed' then (case ${failedCap} when ${last} is null then 0 else max(${last} + ${wait}, ${retryAt}) end)
    else null end)`
}

/**
 * Wann an dieser Zeile frühestens wieder ein Ziel fällig ist — zum
 * Auswählen und Sortieren. Wer gerade versucht wurde, rückt damit nach
 * hinten, und ein Ziel mit kurzem Abstand muss nicht warten, bis lauter
 * länger wartende vor ihm fällig werden.
 *
 * Nur über Ziele, die überhaupt noch fällig werden können (`capped`: mit
 * denselben Obergrenzen wie `hasRetryableTarget`). Ein ausgeschöpftes Ziel
 * behält seinen alten Zeitstempel für immer; zählte es mit, klebte seine
 * Zeile mit diesem Zeitstempel dauerhaft ganz vorn und verdrängte fällige.
 *
 * Ohne Ziele 0 (sofort — etwa ein Versand, der vor dem Belegen scheiterte);
 * mit Zielen, von denen keines mehr fällig wird, nie.
 */
const nextTryOf = (column: TargetsColumn, capped: boolean, now: number) =>
  sql`coalesce((select min(${dueAtSql(capped, now)}) from json_each(${targetsJson(column)}) j), case when exists (select 1 from json_each(${targetsJson(column)})) then ${num(NEVER)} else 0 end)`

/**
 * Gibt es ein Ziel, für das der Nachschuss etwas zu tun hat: gescheitert mit
 * Versuchen übrig (siehe `dueAt`), gesperrt mit einer Sperre, die noch fallen
 * kann, oder eine verwaiste Belegung (auch eine ausgeschöpfte — die vermerkt
 * `resendDue` dann als gescheitert, statt sie für immer „läuft“ zu zeigen).
 */
const hasRetryableTarget = (column: TargetsColumn, now: number) =>
  sql`exists (select 1 from json_each(${targetsJson(column)}) j where (${field('state')} = 'failed' and ${dueAtSql(true, now)} is not null) or (${field('state')} = 'scheduled' and ${field('postId')} is null and ${field('lastTryAt')} + ${num(ORPHAN_AFTER_SEC)} <= ${num(now)} and coalesce(${field('retryAt')}, 0) <= ${num(now)}))`

/**
 * Hat das Projekt dieses Videos ein automatisches Ziel im Spiegel — einen
 * eigenen Account oder einen des Creators, dem die Kampagne gehört (siehe
 * `autoTargetAccounts`)?
 */
const hasAutoAccounts = sql`(exists (select 1 from ${schema.publishAccounts} pa where pa.project_id = ${schema.deliverables.projectId}) or exists (select 1 from ${schema.projects} p join ${schema.customers} cu on cu.id = p.customer_id join ${schema.creators} cr on cr.user_id = cu.user_id join ${schema.publishAccounts} pa on pa.creator_id = cr.id where p.id = ${schema.deliverables.projectId}))`

/** Dasselbe für Steckplätze: hat das Projekt (bzw. sein Creator) überhaupt einen? */
const hasAutoSlots = sql`(exists (select 1 from ${schema.publishProfiles} pp where pp.project_id = ${schema.deliverables.projectId}) or exists (select 1 from ${schema.projects} p join ${schema.customers} cu on cu.id = p.customer_id join ${schema.creators} cr on cr.user_id = cu.user_id join ${schema.publishProfiles} pp on pp.creator_id = cr.id where p.id = ${schema.deliverables.projectId}))`

/** Hat der Creator dieser Freigabe einen Account im Spiegel? */
const creatorHasAccount = sql`exists (select 1 from ${schema.publishAccounts} pa where pa.creator_id = ${schema.clipApprovals.creatorId})`

/** Dasselbe für Steckplätze. */
const creatorHasSlot = sql`exists (select 1 from ${schema.publishProfiles} pp where pp.creator_id = ${schema.clipApprovals.creatorId})`

/** So viele stille Besitzer gleicht ein Lauf höchstens ab — je Art. */
const SILENT_SYNC_PER_RUN = 5

/**
 * Besitzer mit Steckplatz, aber ohne einen einzigen Account im Spiegel — und
 * mit Clips, die auf Accounts warten: vor der Auswahl abgleichen.
 *
 * Die Auswahl der wartenden Clips verlangt einen Account im Spiegel; ohne
 * diese Bedingung belegten Projekte, die nie verbinden, dauerhaft die Plätze.
 * Der Spiegel kann aber leer sein, obwohl drüben längst ein Account hängt:
 * die Rückkehr aus dem Verbinden konnte ihn nicht prüfen („kommt gleich“),
 * und der Webhook ging verloren. Dann ginge der wartende Clip nie raus — bis
 * zufällig ein neuer Clip kommt oder jemand „Aktualisieren“ klickt. Ein
 * Steckplatz heißt: hier wurde verbunden oder es wenigstens versucht. Also
 * nachsehen, was drüben hängt — danach trifft die Auswahl die richtigen.
 *
 * Begrenzt und in zufälliger Reihenfolge: wer wirklich nie verbunden hat,
 * kostet höchstens einen Abruf je Steckplatz und Lauf, und viele solche
 * Besitzer verdrängen einander nicht dauerhaft. Creator, die hier
 * abgeglichen wurden, landen in `synced` und werden im selben Lauf nicht
 * noch einmal abgeglichen.
 */
async function syncSilentOwners(env: Env, synced: Set<string>): Promise<void> {
  const db = getDb(env)
  try {
    const projects = await db
      .select({ projectId: schema.deliverables.projectId })
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.uploadStatus, 'complete'),
          isNull(schema.deliverables.publishPostId),
          eq(schema.deliverables.publishStatus, PUBLISH_STATUS.waitingForAccounts),
          sql`not ${hasAutoAccounts}`,
          hasAutoSlots,
        ),
      )
      .groupBy(schema.deliverables.projectId)
      .orderBy(sql`random()`)
      .limit(SILENT_SYNC_PER_RUN)
    for (const { projectId } of projects) {
      await syncAccounts(env, projectId)
      const creatorId = await ownerCreatorOfProject(env, projectId)
      if (creatorId) await syncCreatorOnce(env, creatorId, synced)
    }

    const creators = await db
      .select({ creatorId: schema.clipApprovals.creatorId })
      .from(schema.clipApprovals)
      .innerJoin(schema.deliverables, eq(schema.deliverables.id, schema.clipApprovals.deliverableId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
      .where(
        and(
          eq(schema.clipApprovals.status, APPROVED),
          eq(schema.projects.status, 'aktiv'),
          eq(schema.projects.creatorDistribution, 1),
          isNull(schema.clipApprovals.publishPostIds),
          or(
            isNull(schema.clipApprovals.publishStatus),
            eq(schema.clipApprovals.publishStatus, PUBLISH_STATUS.waitingForAccounts),
          ),
          sql`not ${creatorHasAccount}`,
          creatorHasSlot,
        ),
      )
      .groupBy(schema.clipApprovals.creatorId)
      .orderBy(sql`random()`)
      .limit(SILENT_SYNC_PER_RUN)
    for (const { creatorId } of creators) await syncCreatorOnce(env, creatorId, synced)
  } catch (err) {
    // Ein gescheiterter Abgleich darf den Nachhol-Lauf nicht kosten.
    console.error('[publisher] Abgleich stiller Besitzer fehlgeschlagen', String(err).slice(0, 200))
  }
}

/**
 * Wird vom täglichen Cron gerufen und räumt auf, was liegen bleiben kann:
 * Videos, die auf Accounts warteten oder an einem Fehler hängen blieben —
 * und dasselbe für die Freigaben der Creator.
 *
 * Ohne diesen Lauf wäre jeder Ausfall der Gegenseite dauerhaft.
 *
 * Die Zähler im Ergebnis umfassen beide Wege; `creator` sagt, wie viel davon
 * auf die Verbreitung über Creator entfiel.
 */
export async function catchUp(
  env: Env,
  opts: { deep?: boolean } = {},
): Promise<{ posts: number; refreshed: number; retried: number; creator: number }> {
  if (!publishingReady(env)) return { posts: 0, refreshed: 0, retried: 0, creator: 0 }

  const db = getDb(env)
  const synced = new Set<string>()
  let posts = 0
  let refreshed = 0
  let retried = 0

  await syncSilentOwners(env, synced)
  const now = nowSec()

  /*
   * Was noch nirgends draußen ist. Auswahl und Reihenfolge sind Absicht:
   * die Liste hat 25 Plätze, und ohne Reihenfolge lieferte SQLite jedes Mal
   * dieselben ältesten Zeilen. Belegten die dauerhaft untätige Videos —
   * Projekte, die nie einen Account verbunden haben, oder komplett
   * gescheiterte Clips im Abstand —, käme ein neuer Clip nie mehr dran, und
   * ein Kunde, der erst nach dem ersten Clip verbindet, wartete für immer.
   *
   *   - Unangefasste (`NULL`) zuerst: ein erster Versand, der abbrach.
   *   - Dann „wartet auf Accounts" — aber NUR, wo inzwischen ein
   *     automatisches Ziel verbunden ist (am Projekt oder beim Creator, dem
   *     die Kampagne gehört; stille Steckplätze gleicht `syncSilentOwners`
   *     vorher ab). Ohne Account gibt es dort nichts zu tun; mit Account geht
   *     der Clip raus und verlässt die Liste.
   *   - Zuletzt gescheiterte und belegte — nur die, an denen etwas fällig
   *     ist (`nextTryOf`, dieselbe Rechnung wie `dueAt`), die am frühesten
   *     fälligen zuerst. „Belegt“ heißt hier: eine verwaiste Belegung, deren
   *     Aufruf nie einen Ausgang lieferte (siehe `ORPHAN_AFTER_SEC`). Die
   *     übrigen kosteten jeden Takt einen Abgleich beim Anbieter, ohne dass
   *     etwas gesendet würde.
   */
  const status = schema.deliverables.publishStatus
  const videoNext = nextTryOf(schema.deliverables.publishTargets, false, now)
  const pending = await db
    .select({ id: schema.deliverables.id })
    .from(schema.deliverables)
    .where(
      and(
        eq(schema.deliverables.uploadStatus, 'complete'),
        isNull(schema.deliverables.publishPostId),
        or(
          isNull(status),
          and(inArray(status, [PUBLISH_STATUS.failed, PUBLISH_STATUS.scheduled]), sql`${videoNext} <= ${num(now)}`),
          and(eq(status, PUBLISH_STATUS.waitingForAccounts), hasAutoAccounts),
        ),
      ),
    )
    .orderBy(
      sql`case when ${status} is null then 0 when ${status} = ${PUBLISH_STATUS.waitingForAccounts} then 1 else 2 end`,
      videoNext,
    )
    .limit(25)

  for (const deliverable of pending) {
    const outcome = await publishDeliverable(env, deliverable.id)
    if (outcome.status === PUBLISH_STATUS.scheduled || outcome.status === PUBLISH_STATUS.posted) {
      posts++
    }
  }

  /*
   * Abgeschickte Posts nachfassen.
   *
   * Ohne diesen Schritt bliebe „wird veröffentlicht" für immer stehen, wenn
   * der Webhook ausbleibt — und ein Fehler drüben bliebe unsichtbar.
   */
  const stillOpen = inArray(schema.deliverables.publishStatus, [
    PUBLISH_STATUS.scheduled,
    PUBLISH_STATUS.partial,
    PUBLISH_STATUS.failed,
  ])

  /*
   * Auch frisch Veröffentlichtes noch einmal ansehen: der Anbieter meldet
   * einen Post als fertig, bevor der Permalink der Plattform bei ihm
   * eingetragen ist. Wer nur offene Posts nachfasst, hält genau diesen
   * Zwischenstand für endgültig und der Link fehlt für immer.
   *
   * Dieser Rundumschlag gehört aber NUR in den Tageslauf (`deep`). Im
   * Viertelstundentakt liefe er 96-mal am Tag über jedes Video aus drei
   * Tagen, mal bis zu sechs Posts je Video — Tausende Abrufe bei der
   * Gegenseite für eine Frage, die sich einmal täglich stellt. Der häufige
   * Lauf sieht deshalb nur an, was wirklich offen ist.
   */
  const open = await db
    .select({ id: schema.deliverables.id })
    .from(schema.deliverables)
    .where(
      and(
        isNotNull(schema.deliverables.publishPostId),
        opts.deep
          ? or(stillOpen, gt(schema.deliverables.createdAt, nowSec() - 3 * 86400))
          : stillOpen,
      ),
    )
    .orderBy(desc(schema.deliverables.createdAt))
    .limit(50)

  for (const deliverable of open) {
    if (await refreshPostStatus(env, deliverable.id)) refreshed++
  }

  /*
   * Und was danach je Account als gescheitert, gesperrt oder verwaist
   * dasteht, gezielt nachreichen.
   *
   * Nur Zeilen, an denen der Nachschuss noch etwas zu tun hat —
   * ausgeschöpfte blieben sonst für immer in der Liste und verdrängten die
   * übrigen. Auch Zeilen, die insgesamt „wird veröffentlicht“ zeigen: läuft
   * TikTok noch, während YouTube verwaist ist, steht dort genau das. Ein
   * Video OHNE Post-ID gehört nicht hierher, das holt oben
   * `publishDeliverable` nach. Die am frühesten fälligen zuerst — gerechnet
   * nur über Ziele, die noch fällig werden können (siehe `nextTryOf`).
   */
  const now2 = nowSec()
  const broken = await db
    .select({ id: schema.deliverables.id })
    .from(schema.deliverables)
    .where(
      and(
        or(
          eq(status, PUBLISH_STATUS.partial),
          and(
            inArray(status, [PUBLISH_STATUS.failed, PUBLISH_STATUS.scheduled]),
            isNotNull(schema.deliverables.publishPostId),
          ),
        ),
        hasRetryableTarget(schema.deliverables.publishTargets, now2),
      ),
    )
    .orderBy(nextTryOf(schema.deliverables.publishTargets, true, now2))
    .limit(25)

  for (const deliverable of broken) {
    const res = await retryFailedTargets(env, deliverable.id)
    retried += res.retried.length
  }

  const creator = await catchUpApprovals(env, opts, synced)
  return {
    posts: posts + creator.posts,
    refreshed: refreshed + creator.refreshed,
    retried: retried + creator.retried,
    creator: creator.posts + creator.refreshed + creator.retried,
  }
}

/**
 * Derselbe Nachhol-Lauf für die Verbreitung über Creator: freigegebene Clips,
 * die noch nicht rausgingen, offene Posts nachfassen, Gescheitertes
 * nachreichen — mit denselben Grenzen und Abständen.
 *
 * Läuft NACH den Projekt-Videos: sind die Viertelstunden knapp, geht der
 * Auftrag des Kunden vor.
 *
 * Gesendet wird nur, solange die Kampagne freigegeben und der Creator
 * beigetreten ist — das prüft schon die Abfrage, damit eine zurückgenommene
 * Freigabe nicht jede Viertelstunde einen Platz in der Liste belegt. Und die
 * Liste der offenen Freigaben ist nach `updated_at` sortiert: was gerade
 * angefasst wurde, rückt nach hinten, sodass nichts dauerhaft verdrängt wird.
 */
async function catchUpApprovals(
  env: Env,
  opts: { deep?: boolean },
  synced: Set<string> = new Set(),
): Promise<{ posts: number; refreshed: number; retried: number }> {
  const db = getDb(env)
  let posts = 0
  let refreshed = 0
  let retried = 0
  const now = nowSec()

  const allowed = and(
    eq(schema.clipApprovals.status, APPROVED),
    eq(schema.projects.creatorDistribution, 1),
  )
  const joinedSelect = () =>
    db
      .select({
        deliverableId: schema.clipApprovals.deliverableId,
        creatorId: schema.clipApprovals.creatorId,
      })
      .from(schema.clipApprovals)
      .innerJoin(schema.deliverables, eq(schema.deliverables.id, schema.clipApprovals.deliverableId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
      .innerJoin(
        schema.campaignCreators,
        and(
          eq(schema.campaignCreators.projectId, schema.projects.id),
          eq(schema.campaignCreators.creatorId, schema.clipApprovals.creatorId),
        ),
      )

  /*
   * Was noch nirgends draußen ist — mit drei Bedingungen, die die Route beim
   * Freigeben ebenso stellt:
   *
   *   - Die Kampagne läuft (`aktiv`). Eine pausierte oder beendete nimmt
   *     keine neuen Freigaben an; dann darf auch der Nachhol-Lauf daraus
   *     nichts mehr losschicken.
   *   - Der Creator hat einen Account im Spiegel. Ohne gibt es nichts zu tun,
   *     und solche Zeilen belegten sonst dauerhaft die 25 Plätze (stille
   *     Steckplätze gleicht `syncSilentOwners` vorher ab).
   *   - „Selbst posten“ (`PUBLISH_STATUS.manual`) steht NICHT in der Liste:
   *     das geht nur auf ausdrücklichen Klick raus, nie von allein.
   *
   * Gescheiterte und belegte nur, wenn etwas fällig ist (`nextTryOf`, ohne
   * Obergrenze wie in `publishForCreator`) — sonst kostete jede tote Zeile
   * jeden Takt einen Abgleich beim Anbieter. Jeder Durchlauf schreibt die
   * Zeile (und damit `updated_at`) fort — so rücken auch Freigaben, aus
   * denen gerade nichts wird, nach hinten.
   */
  const approvalStatus = schema.clipApprovals.publishStatus
  const approvalNext = nextTryOf(schema.clipApprovals.publishTargets, false, now)
  const pending = await joinedSelect()
    .where(
      and(
        allowed,
        eq(schema.projects.status, 'aktiv'),
        eq(schema.deliverables.uploadStatus, 'complete'),
        isNull(schema.clipApprovals.publishPostIds),
        creatorHasAccount,
        or(
          isNull(approvalStatus),
          eq(approvalStatus, PUBLISH_STATUS.waitingForAccounts),
          and(
            inArray(approvalStatus, [PUBLISH_STATUS.failed, PUBLISH_STATUS.scheduled]),
            sql`${approvalNext} <= ${num(now)}`,
          ),
        ),
      ),
    )
    .orderBy(asc(schema.clipApprovals.updatedAt))
    .limit(25)

  for (const a of pending) {
    const outcome = await publishForCreator(env, a.deliverableId, a.creatorId, { synced })
    if (outcome.status === PUBLISH_STATUS.scheduled || outcome.status === PUBLISH_STATUS.posted) {
      posts++
    }
  }

  // Nachfassen ist nur Lesen — das gilt auch für Kampagnen, deren Freigabe
  // inzwischen zurückgenommen wurde. Deshalb hier ohne Bedingung daran.
  const stillOpen = inArray(schema.clipApprovals.publishStatus, [
    PUBLISH_STATUS.scheduled,
    PUBLISH_STATUS.partial,
    PUBLISH_STATUS.failed,
  ])
  const open = await db
    .select({
      deliverableId: schema.clipApprovals.deliverableId,
      creatorId: schema.clipApprovals.creatorId,
    })
    .from(schema.clipApprovals)
    .where(
      and(
        isNotNull(schema.clipApprovals.publishPostIds),
        opts.deep
          ? or(stillOpen, gt(schema.clipApprovals.decidedAt, nowSec() - 3 * 86400))
          : stillOpen,
      ),
    )
    .orderBy(desc(schema.clipApprovals.decidedAt))
    .limit(50)

  for (const a of open) {
    if (await refreshCreatorPost(env, a.deliverableId, a.creatorId)) refreshed++
  }

  /*
   * Nur Freigaben, an denen der Nachschuss noch etwas zu tun hat (siehe
   * `hasRetryableTarget`), und nur solche mit Post-ID — ohne holt sie oben
   * `publishForCreator` nach. Ausgeschöpfte werden nie wieder angefasst, ihr
   * `updated_at` bliebe stehen — und nach `updated_at` sortiert, belegten sie
   * ab der 26. für immer alle Plätze, während neuere Freigaben mit fälligen
   * Zielen nie drankämen. Fällige, aber nicht sendbare Ziele bekommen in
   * `resendDue` einen frischen Zeitstempel und rücken damit nach hinten.
   *
   * Und nur aus laufenden Kampagnen, wie oben: pausiert der Kunde, geht auch
   * der Nachschuss eines halb veröffentlichten Clips nicht mehr raus (das
   * prüft `retryCreatorTargets` ohnehin — hier, damit solche Zeilen keine
   * Plätze belegen).
   */
  const now2 = nowSec()
  const broken = await joinedSelect()
    .where(
      and(
        allowed,
        eq(schema.projects.status, 'aktiv'),
        or(
          eq(approvalStatus, PUBLISH_STATUS.partial),
          and(
            inArray(approvalStatus, [PUBLISH_STATUS.failed, PUBLISH_STATUS.scheduled]),
            isNotNull(schema.clipApprovals.publishPostIds),
          ),
        ),
        hasRetryableTarget(schema.clipApprovals.publishTargets, now2),
      ),
    )
    .orderBy(asc(schema.clipApprovals.updatedAt))
    .limit(25)

  for (const a of broken) {
    const res = await retryCreatorTargets(env, a.deliverableId, a.creatorId, { synced })
    retried += res.retried.length
  }

  return { posts, refreshed, retried }
}
