import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { getDb, nowSec, schema } from './db'
import { audit } from './audit'
import {
  getPostAnalytics,
  zernioReady,
  ZernioError,
  type AnalyticsResult,
  type ZernioAnalyticsResponse,
  type ZernioPlatformAnalytics,
  type ZernioPostAnalytics,
} from './zernio'
import type { MetricsSync } from '../db/schema'
import type { Env } from './types'

/* --------------------------------------------------------------------------
   Echte Zahlen aus Zernio

   Zwei Hälften in einer Datei, damit Zeitplan und Anzeige dieselben Regeln
   kennen:

   ABGLEICH — im Viertelstundentakt aus `index.ts`. Er trägt neue Post-IDs in
   den Zeitplan ein (`discoverPosts`, einmal je Stunde), fragt die fälligen
   bei Zernio ab und schreibt die Zahlen je Account (`syncMetrics`). Ein
   Admin-Knopf gleicht ein einzelnes Projekt sofort ab (`syncProjectMetrics`).

   LESEN — gruppierte Abfragen für die Dashboards, nie eine Abfrage je Clip.
   Große ID-Listen gehen in Stücken zu 90 hinaus: D1 nimmt höchstens 100
   gebundene Parameter je Abfrage, und eine Kampagne kann mehr Clips haben.

   Neben publisher.ts ist dies die einzige Datei, die zernio.ts kennt: Zahlen
   lesen ist eine eigene Aufgabe, die mit dem Veröffentlichen nichts teilt —
   und publisher.ts soll nicht noch weiter wachsen.

   Woher die Post-IDs stammen:
     deliverables.publish_post_ids   automatische Ziele des Projekts
                                     (creator_id NULL)
     clip_approvals.publish_post_ids Verbreitung über einen Creator
                                     (creator_id gesetzt)
   Je Plattform ist es ein eigener Zernio-Post; ein Post kann an mehrere
   Accounts derselben Plattform gehen, deshalb zählt `post_metrics` je
   Post UND Account.
   -------------------------------------------------------------------------- */

const HOUR = 3600
const DAY = 86400
const WEEK = 7 * DAY

/** Höchstens so viele Abrufe je Viertelstundenlauf. */
const DEFAULT_LIMIT = 40

/** Höchstens so viele Abrufe für den Admin-Knopf „Refresh numbers“. */
const PROJECT_LIMIT = 60

/**
 * Gleichzeitige Abrufe. Vier halten den Admin-Knopf flott (60 Abrufe in
 * Sekunden statt einer Minute), ohne das Rate-Limit der Gegenseite zu reizen:
 * 60 Abrufe je Minute bei bis zu zwei Accounts, 600 darüber.
 */
const CONCURRENCY = 4

/**
 * Wie lange ein Lauf die Posts, die er sich genommen hat, für sich hält
 * (`leased_until`).
 *
 * Bricht er ab (429, 402, Zeitüberschreitung), sind sie nach zehn Minuten
 * wieder frei — ein fälliger Post also beim nächsten Viertelstundenlauf,
 * nicht erst nach seinem regulären Abstand. Und zwei Läufe, die sich
 * überlappen (Admin-Knopf und Cron, Doppelklick, zwei offene Tabs), fragen
 * denselben Post nicht doppelt: BEIDE Auswahlwege lassen belegte Posts liegen.
 * Die Belegung steht deshalb in einer eigenen Spalte und nicht in `next_at` —
 * der Admin-Knopf fragt ohne Rücksicht auf `next_at` und sähe sie dort nicht.
 */
const LEASE_SEC = 10 * 60

/** So oft trägt der Viertelstundenlauf neue Posts ein (siehe `discoverPosts`). */
const DISCOVER_EVERY = HOUR
const DISCOVER_KEY = 'metrics_discovered_at'

/** 402 heißt: der Plan enthält keine Analytics. Dann ruht der Abgleich einen Tag. */
const PAUSE_SEC = DAY
const PAUSE_KEY = 'metrics_paused_until'

/**
 * Der Admin-Knopf fragt nichts, was in den letzten fünf Minuten gefragt wurde.
 * Zernio holt die Zahlen selbst nur in Abständen von der Plattform; ein
 * zweiter Klick brächte dieselben Zahlen und kostete trotzdem Abrufe.
 */
const MANUAL_MIN_GAP = 5 * 60

/**
 * So viele 202-Antworten in Folge werden stündlich nachgefragt — danach gilt
 * der Abstand nach Alter. Ein Post, der nie fertig wird (Upload hängt bei der
 * Plattform), soll nicht auf ewig 24 Abrufe am Tag kosten.
 */
const PENDING_FAST_TRIES = 12

/**
 * Nach so vielen Fehlern in Folge gilt der Abgleich als gestört — Abbruch.
 * Gezählt wird alles ohne verwertbares Ergebnis: 5xx, Netz, eine Antwort,
 * die wir nicht lesen können, und ein Schreiben, das scheitert.
 */
const MAX_ERRORS_IN_ROW = 3

/** D1 nimmt höchstens 100 gebundene Parameter — 90 IDs lassen Luft für den Rest. */
const ID_CHUNK = 90

async function inChunks<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const out: T[] = []
  for (let i = 0; i < unique.length; i += ID_CHUNK) out.push(...(await query(unique.slice(i, i + ID_CHUNK))))
  return out
}

/**
 * X rechnet jeden Analytics-Abruf ab ($0.005) — daher höchstens alle sechs
 * Stunden. Das gilt für jeden Weg: Zeitplan, Fehler und Admin-Knopf.
 */
const X_PLATFORMS = ['twitter', 'x']
const X_MIN_GAP = 6 * HOUR
const isX = (platform: string | null | undefined) => X_PLATFORMS.includes(platform ?? '')

/**
 * Abstand bis zum nächsten Abruf, nach Alter des Clips.
 *
 * In den ersten zwei Tagen passiert fast alles, was ein Clip je an Views
 * sammelt — dort lohnt stündlich. Danach flacht es ab, nach drei Monaten
 * ändert sich kaum noch etwas. Mehr Abrufe brächten keine besseren Zahlen,
 * nur ein früheres Rate-Limit.
 */
export function intervalFor(ageSec: number, platform: string | null): number {
  const base = ageSec < 2 * DAY ? HOUR : ageSec < 14 * DAY ? 6 * HOUR : ageSec < 90 * DAY ? DAY : WEEK
  return isX(platform) ? Math.max(base, X_MIN_GAP) : base
}

/* ------------------------------------------------------------- Entdecken */

/**
 * Ein JSON-Array aus einer Spalte — Kaputtes wird zur leeren Liste statt zum
 * Fehler. Ein einziger kaputter Eintrag ließe sonst `json_each` und damit das
 * Entdecken für ALLE Clips scheitern, bei jedem Lauf aufs Neue.
 */
const arrayOrEmpty = (column: string) =>
  `(case when json_valid(${column}) and json_type(${column}) = 'array' then ${column} else '[]' end)`

/** Dasselbe für die Map je Account in `publish_targets`. */
const objectOrEmpty = (column: string) =>
  `(case when json_valid(${column}) and json_type(${column}) = 'object' then ${column} else '{}' end)`

/**
 * Das Ziel in `publish_targets`, das eine Post-ID trägt — als Unterabfrage,
 * die `pick` daraus liest. Das `case` schützt `json_extract` vor Einträgen,
 * die kein Objekt sind (es würfe sonst „malformed JSON“) — anders als bei
 * `and` legt SQLite dort die Reihenfolge der Auswertung fest.
 */
const fromTarget = (pick: string) =>
  sql.raw(
    `(select ${pick} from json_each(${objectOrEmpty('ids.targets')}) t ` +
      `where case when t.type = 'object' then (` +
      `json_extract(t.value, '$.postId') = ids.post_id ` +
      `or exists (select 1 from json_each(case when json_type(t.value, '$.earlierPostIds') = 'array' ` +
      `then json_extract(t.value, '$.earlierPostIds') else '[]' end) e where e.value = ids.post_id)) ` +
      `else 0 end)`,
  )

/**
 * Trägt neue Post-IDs in den Zeitplan ein, fällig sofort.
 *
 * EINE Anweisung für alle Clips statt einer Schleife: `json_each` faltet die
 * ID-Listen in der Datenbank auf, `insert or ignore` lässt Bekanntes stehen.
 * Über alle Clips zu gehen kostet so eine Abfrage, nicht hunderte — aber
 * jede Zeile wird gelesen, auch wenn nichts neu ist (rund 11 gelesene Zeilen
 * je Clip mit vier Posts). Deshalb läuft das im Viertelstundentakt nur
 * einmal je Stunde (`DISCOVER_EVERY`), und der Admin-Knopf nur über sein
 * Projekt (`projectId`).
 *
 * `union all` statt `union`: dieselbe Post-ID aus `publish_post_id` und
 * `publish_post_ids` ergibt zweimal dieselbe Zeile, und die zweite fängt
 * `insert or ignore` ab. Das Aussortieren vorab kostete eine Hilfstabelle
 * und ein Fünftel mehr gelesene Zeilen.
 *
 * Plattform und Sendezeit kommen aus dem Ziel in `publish_targets`, das diese
 * Post-ID trägt (oder sie unter `earlierPostIds` führt). Fehlt es, gilt das
 * Hochladen des Clips bzw. die Freigabe als Uhr; der erste Abruf ersetzt
 * beides durch das, was Zernio meldet.
 *
 * Gibt die Zahl neu eingetragener Posts zurück.
 */
export async function discoverPosts(env: Env, opts: { projectId?: string } = {}): Promise<number> {
  const ts = nowSec()
  const inProject = opts.projectId ? sql`and d.project_id = ${opts.projectId}` : sql``
  const result = await getDb(env).run(sql`
    insert or ignore into metrics_sync
      (post_id, deliverable_id, creator_id, project_id, platform, published_at, status, next_at, tries)
    select ids.post_id, ids.deliverable_id, ids.creator_id, ids.project_id,
           ${fromTarget(`json_extract(t.value, '$.platform')`)},
           coalesce(${fromTarget(`nullif(min(json_extract(t.value, '$.lastTryAt')), 0)`)}, ids.fallback_at),
           'pending', ${ts}, 0
    from (
      select j.value as post_id, d.id as deliverable_id, null as creator_id, d.project_id as project_id,
             d.publish_targets as targets, d.created_at as fallback_at
      from deliverables d join json_each(${sql.raw(arrayOrEmpty('d.publish_post_ids'))}) j
      where d.publish_post_ids is not null and j.type = 'text' and j.value <> '' ${inProject}
      union all
      select d.publish_post_id, d.id, null, d.project_id, d.publish_targets, d.created_at
      from deliverables d
      where d.publish_post_id is not null and d.publish_post_id <> '' ${inProject}
      union all
      select j.value, a.deliverable_id, a.creator_id, d.project_id, a.publish_targets, a.decided_at
      from clip_approvals a
        join deliverables d on d.id = a.deliverable_id
        join json_each(${sql.raw(arrayOrEmpty('a.publish_post_ids'))}) j
      where a.publish_post_ids is not null and j.type = 'text' and j.value <> '' ${inProject}
    ) ids
    where not exists (select 1 from metrics_sync m where m.post_id = ids.post_id)
  `)
  return Number(result.meta?.changes ?? 0)
}

/**
 * Ist das stündliche Entdecken für den Viertelstundentakt fällig?
 *
 * Fünf Minuten Spielraum: der Takt feuert nicht auf die Sekunde genau, und
 * ein Lauf um 11:00:20 nach einem um 10:00:40 soll nicht bis 11:15 warten.
 * Neue Posts bekommen ihre ersten Zahlen so spätestens nach gut einer Stunde
 * — die ersten Abrufe ergeben ohnehin meist 202, Zernio holt selbst nur in
 * Abständen ab.
 */
async function discoverDue(env: Env, ts: number): Promise<boolean> {
  const [row] = await getDb(env)
    .select({ value: schema.appState.value })
    .from(schema.appState)
    .where(eq(schema.appState.key, DISCOVER_KEY))
    .limit(1)
  const last = Number(row?.value)
  return !Number.isFinite(last) || last <= ts - (DISCOVER_EVERY - 5 * 60)
}

async function markDiscovered(env: Env, ts: number): Promise<void> {
  await getDb(env)
    .insert(schema.appState)
    .values({ key: DISCOVER_KEY, value: String(ts), updatedAt: ts })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: String(ts), updatedAt: ts } })
}

/* ------------------------------------------------------------- Abgleich */

export interface SyncResult {
  /** Neu in den Zeitplan aufgenommene Posts. */
  discovered: number
  /** Abrufe bei Zernio — jeder, auch die gescheiterten. */
  fetched: number
  /** Account-Zeilen, die Zahlen bekommen haben. */
  updated: number
  /** Posts, die Zernio noch synchronisiert (202). */
  pending: number
  /** Posts ohne Zahlen: 404, 424 oder ein Fehler. */
  failed: number
  /** Analytics ruhen (402) — der Lauf hat nichts gefragt oder abgebrochen. */
  paused: boolean
}

const emptyResult = (): SyncResult => ({
  discovered: 0,
  fetched: 0,
  updated: 0,
  pending: 0,
  failed: 0,
  paused: false,
})

/** Die Zustandszeile der 402-Pause — oder null, wenn es nie eine gab. */
async function readPause(env: Env): Promise<{ until: number } | null> {
  const [row] = await getDb(env)
    .select({ value: schema.appState.value })
    .from(schema.appState)
    .where(eq(schema.appState.key, PAUSE_KEY))
    .limit(1)
  if (!row) return null
  const until = Number(row.value)
  return { until: Number.isFinite(until) ? until : 0 }
}

/**
 * Bis wann der Abgleich ruht, weil Zernio 402 meldete — null, wenn er läuft.
 *
 * Die Zeile bleibt nach Ablauf stehen, bis wieder Zahlen kommen. Daran
 * erkennt der nächste 402er, dass er nichts Neues meldet, und schreibt
 * keinen zweiten Audit-Eintrag.
 */
export async function metricsPausedUntil(env: Env): Promise<number | null> {
  const pause = await readPause(env)
  return pause && pause.until > nowSec() ? pause.until : null
}

/** Eine Zahl aus der Antwort — oder null, wenn die Plattform sie nicht nennt. */
const metric = (a: ZernioPostAnalytics | null | undefined, key: keyof ZernioPostAnalytics): number | null => {
  const v = a?.[key]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'impressions', 'reach'] as const
type MetricKey = (typeof METRIC_KEYS)[number]

/** ISO-Zeitpunkt → Unix-Sekunden; Unsinn und Zukunft werden zu null. */
function isoToSec(v: string | null | undefined, ts: number): number | null {
  if (!v) return null
  const ms = Date.parse(v)
  if (!Number.isFinite(ms) || ms <= 0) return null
  const sec = Math.floor(ms / 1000)
  return sec > ts + 300 ? null : Math.min(sec, ts)
}

/** Zernio schreibt den Namen mit @ davor, wir speichern ihn ohne (wie `publish_accounts`). */
const cleanUsername = (v: unknown) => {
  const name = typeof v === 'string' ? v.trim().replace(/^@+/, '') : ''
  return name || null
}

/** Ein Text aus der Antwort, klein geschrieben — alles andere wird zu null. */
const lowerText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Die Schreibbefehle für EINEN Account einer Antwort.
 *
 * Drei Regeln, damit eine schlechte Antwort keine guten Zahlen zerstört:
 *
 *   - Nennt die Plattform eine Kennzahl nicht (null), bleibt der alte Wert.
 *   - Meldet sie 0, wo schon mehr stand, bleibt ebenfalls der alte Wert. Ein
 *     veröffentlichter Clip verliert nicht alle Views auf einmal; eine 0 nach
 *     einer echten Zahl ist ein abgelaufenes Token oder eine Kennzahl, die die
 *     Plattform gerade nicht herausgibt. (Preis: wer von 5 Likes auf 0 fällt,
 *     behält bei uns die 5 — das ist der seltenere und harmlosere Fehler.)
 *   - Ein Account, der noch synchronisiert und nur Nullen trägt, legt keine
 *     neue Zeile an. Sonst stünde dort „0 Views“ statt „Noch keine Zahlen“.
 *
 * Fehlt ein Account in der Antwort ganz, wird er gar nicht angefasst.
 */
function writesFor(
  env: Env,
  row: MetricsSync,
  entry: ZernioPlatformAnalytics,
  fallbackPlatform: string | null,
  ts: number,
): { items: BatchItem<'sqlite'>[]; numbers: boolean } {
  const db = getDb(env)
  const pm = schema.postMetrics
  const accountId = typeof entry.accountId === 'string' ? entry.accountId : ''
  // `failed` = auf diesem Account gar nicht veröffentlicht — es gibt nichts zu zählen.
  if (!accountId || entry.status === 'failed') return { items: [], numbers: false }

  const username = cleanUsername(entry.accountUsername)
  const url = typeof entry.platformPostUrl === 'string' && entry.platformPostUrl.trim() ? entry.platformPostUrl.trim() : null
  // Nur ein Objekt trägt Zahlen. Ein Text oder eine Liste an dieser Stelle
  // ergäbe sonst lauter null — und mit `synced` eine Zeile voller Nullen.
  const analytics = isObject(entry.analytics) ? (entry.analytics as ZernioPostAnalytics) : null
  const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, metric(analytics, k)])) as Record<
    MetricKey,
    number | null
  >
  const anyPositive = METRIC_KEYS.some((k) => (values[k] ?? 0) > 0)
  const synced = entry.syncStatus === undefined || entry.syncStatus === null || entry.syncStatus === 'synced'
  const real = analytics !== null && (synced || anyPositive)

  if (!real) {
    // Keine Zahlen, aber vielleicht ein Name oder Link, die eine bestehende
    // Zeile noch nicht kannte.
    if (!username && !url) return { items: [], numbers: false }
    return {
      items: [
        db
          .update(pm)
          .set({
            ...(username ? { username } : {}),
            ...(url ? { url } : {}),
          })
          .where(and(eq(pm.postId, row.postId), eq(pm.accountId, accountId))),
      ],
      numbers: false,
    }
  }

  const syncedAt = isoToSec(typeof analytics.lastUpdated === 'string' ? analytics.lastUpdated : null, ts) ?? ts
  const platform = lowerText(entry.platform) ?? lowerText(fallbackPlatform) ?? 'unknown'
  // Nur Kennzahlen über 0 überschreiben (siehe oben) — fehlende Schlüssel im
  // `set` lassen die Spalte, wie sie ist.
  const positive: Partial<Record<MetricKey, number>> = Object.fromEntries(
    METRIC_KEYS.filter((k) => (values[k] ?? 0) > 0).map((k) => [k, values[k] as number]),
  )

  return {
    items: [
      db
        .insert(pm)
        .values({
          postId: row.postId,
          accountId,
          deliverableId: row.deliverableId,
          creatorId: row.creatorId,
          projectId: row.projectId,
          platform,
          // Ohne Namen in der Antwort hilft unser Spiegel der verbundenen Accounts.
          username:
            username ??
            sql`(select ${schema.publishAccounts.username} from ${schema.publishAccounts} where ${schema.publishAccounts.providerAccountId} = ${accountId})`,
          url,
          views: values.views ?? 0,
          likes: values.likes ?? 0,
          comments: values.comments ?? 0,
          shares: values.shares ?? 0,
          saves: values.saves ?? 0,
          impressions: values.impressions ?? 0,
          reach: values.reach ?? 0,
          syncedAt,
        })
        .onConflictDoUpdate({
          target: [pm.postId, pm.accountId],
          set: {
            platform,
            ...(username ? { username } : {}),
            ...(url ? { url } : {}),
            ...positive,
            // Der Stand läuft nie rückwärts, auch wenn Zernio einen älteren nennt.
            syncedAt: sql`max(${pm.syncedAt}, ${syncedAt})`,
          },
        }),
    ],
    numbers: true,
  }
}

/** Abstand nach einem Fehler: 30 Minuten, dann doppelt so lang, höchstens ein Tag. */
const errorBackoff = (errors: number) => Math.min(30 * 60 * 2 ** Math.max(0, errors - 1), DAY)

/**
 * Die Accounts einer Antwort — nur Einträge, die Objekte sind.
 *
 * Fehlt die Liste, gibt es (noch) nichts zu zählen: ein 202 darf ohne
 * kommen. Steht dort etwas anderes als eine Liste, hat die Gegenseite ihre
 * Antwortform geändert — das ist ein Fehler mit wachsendem Abstand, kein
 * „ok, keine Zahlen“ im regulären Takt, den niemand bemerkt. Ein einzelner
 * kaputter Eintrag (`null`) kostet dagegen nur sich selbst, nicht die
 * übrigen Accounts desselben Posts.
 */
function entriesOf(body: ZernioAnalyticsResponse | null): ZernioPlatformAnalytics[] {
  const list: unknown = body?.platformAnalytics
  if (list === undefined || list === null) return []
  if (!Array.isArray(list)) throw new Error('platformAnalytics ist keine Liste')
  return list.filter(isObject) as ZernioPlatformAnalytics[]
}

/**
 * Wertet eine Antwort aus: Zahlen schreiben, nächsten Abruf planen und die
 * Belegung lösen. Alles in einem Batch — D1 führt ihn als eine Transaktion aus.
 */
async function applyResult(
  env: Env,
  row: MetricsSync,
  res: AnalyticsResult,
  ts: number,
): Promise<{ written: number }> {
  const db = getDb(env)
  const body = res.status === 200 || res.status === 202 ? res.body : null
  const entries = entriesOf(body)
  const publishedAt = isoToSec(typeof body?.publishedAt === 'string' ? body.publishedAt : null, ts) ?? row.publishedAt
  const platform =
    row.platform ?? lowerText(body?.platform) ?? entries.map((p) => lowerText(p.platform)).find(Boolean) ?? null

  const items: BatchItem<'sqlite'>[] = []
  let written = 0
  for (const entry of entries) {
    const w = writesFor(env, row, entry, platform, ts)
    items.push(...w.items)
    if (w.numbers) written++
  }

  // `tries` zählt nur 202er in Folge; jede andere Antwort beginnt von vorn.
  // Eine Antwort beendet zugleich jede Fehlerserie (`errors`).
  const tries = res.status === 202 ? row.tries + 1 : 0
  const age = Math.max(0, ts - publishedAt)
  let status: MetricsSync['status']
  let wait: number
  switch (res.status) {
    case 200:
      status = 'ok'
      wait = intervalFor(age, platform)
      break
    case 202:
      // Zernio holt gerade ab — bald noch einmal fragen, aber nicht ewig.
      status = 'pending'
      wait = tries <= PENDING_FAST_TRIES ? HOUR : intervalFor(age, platform)
      break
    case 424:
      status = 'failed'
      wait = WEEK
      break
    default:
      status = 'unknown'
      wait = WEEK
  }
  if (isX(platform)) wait = Math.max(wait, X_MIN_GAP)

  items.push(
    db
      .update(schema.metricsSync)
      .set({ status, tries, errors: 0, nextAt: ts + wait, lastAt: ts, leasedUntil: null, publishedAt, platform })
      .where(eq(schema.metricsSync.postId, row.postId)),
  )
  await db.batch(items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { written }
}

/**
 * Ein Fehler ohne verwertbares Ergebnis (5xx, Netz, unlesbare Antwort, ein
 * gescheitertes Schreiben): später erneut, mit wachsendem Abstand — gezählt
 * in `errors`, damit vorangegangene 202er den ersten Abstand nicht verlängern.
 * `tries` und `status` bleiben, wie der letzte echte Befund sie hinterließ.
 */
async function scheduleRetry(env: Env, row: MetricsSync, ts: number): Promise<void> {
  const errors = row.errors + 1
  let wait = errorBackoff(errors)
  if (isX(row.platform)) wait = Math.max(wait, X_MIN_GAP)
  await getDb(env)
    .update(schema.metricsSync)
    .set({ errors, nextAt: ts + wait, lastAt: ts, leasedUntil: null })
    .where(eq(schema.metricsSync.postId, row.postId))
}

/**
 * Nimmt sich die nächsten Posts und hält sie für diesen Lauf (`LEASE_SEC`).
 *
 * Auswahl und Belegen in EINER Anweisung: D1 führt sie am Stück aus, also
 * kann ein zweiter Lauf dazwischen nicht dieselben Posts greifen. Belegte
 * Posts lassen BEIDE Wege liegen — sonst fragte der Admin-Knopf, was der
 * Cron gerade fragt, und ein Doppelklick alles zweimal.
 *
 * Der Admin-Knopf fragt ohne Rücksicht auf `next_at`, aber nicht ohne
 * Grenzen: nichts aus den letzten fünf Minuten, und X wie überall höchstens
 * alle sechs Stunden — jeder Abruf dort kostet Geld, auch der von Hand.
 */
async function claim(
  env: Env,
  o: { limit: number; projectId?: string; manual: boolean },
): Promise<MetricsSync[]> {
  const db = getDb(env)
  const ms = schema.metricsSync
  const ts = nowSec()
  const minGap = sql`(case when ${inArray(ms.platform, X_PLATFORMS)} then ${X_MIN_GAP} else ${MANUAL_MIN_GAP} end)`
  const pick = db
    .select({ id: ms.postId })
    .from(ms)
    .where(
      and(
        or(isNull(ms.leasedUntil), lte(ms.leasedUntil, ts)),
        o.manual ? or(isNull(ms.lastAt), lt(ms.lastAt, sql`${ts} - ${minGap}`)) : lte(ms.nextAt, ts),
        o.projectId ? eq(ms.projectId, o.projectId) : undefined,
      ),
    )
    // Regulär: älteste Fälligkeit zuerst. Von Hand: am längsten nicht
    // gefragt zuerst — bei mehr als 60 Posts deckt der nächste Klick den Rest.
    .orderBy(o.manual ? sql`coalesce(${ms.lastAt}, 0)` : asc(ms.nextAt), asc(ms.postId))
    .limit(o.limit)
  // `next_at` bleibt stehen: bricht der Lauf ab, ist ein fälliger Post nach
  // der Belegung wieder dran, und ein von Hand genommener, noch nicht
  // fälliger behält seinen Zeitplan.
  const rows = await db
    .update(ms)
    .set({ leasedUntil: ts + LEASE_SEC })
    .where(inArray(ms.postId, pick))
    .returning()
  // RETURNING liefert in Tabellenreihenfolge, nicht in der der Auswahl. Bricht
  // ein Lauf mittendrin ab (429, 402), sollen die Dringendsten schon gefragt
  // sein — also dieselbe Reihenfolge wie oben, hier noch einmal.
  const byId = (a: MetricsSync, b: MetricsSync) => (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0)
  return rows.sort(
    o.manual
      ? (a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0) || byId(a, b)
      : (a, b) => a.nextAt - b.nextAt || byId(a, b),
  )
}

/** 402: Analytics ruhen einen Tag. Gemeldet wird nur der Beginn einer Pause. */
async function pause(env: Env, o: { postId: string; body: unknown; known: boolean }): Promise<void> {
  const ts = nowSec()
  const until = ts + PAUSE_SEC
  await getDb(env)
    .insert(schema.appState)
    .values({ key: PAUSE_KEY, value: String(until), updatedAt: ts })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: String(until), updatedAt: ts } })
  console.warn(`[metrics] Zernio meldet 402: Analytics ruhen bis ${new Date(until * 1000).toISOString()}`)
  if (o.known) return
  const body = (o.body ?? {}) as { code?: unknown; error?: unknown }
  await audit(env, {
    action: 'metrics.paused',
    entity: 'metrics',
    entityId: o.postId,
    payload: { until, code: body.code ?? null, error: body.error ?? null },
  })
}

async function run(
  env: Env,
  o: { limit: number; projectId?: string; manual: boolean },
): Promise<SyncResult> {
  const result = emptyResult()
  if (!zernioReady(env)) return result

  const pauseRow = await readPause(env)
  // Der Cron wartet die Pause ab. Der Admin-Knopf nicht: ein Klick ist eine
  // bewusste Frage, und ein einziger Abruf zeigt, ob der Plan inzwischen
  // Analytics enthält.
  if (!o.manual && pauseRow && pauseRow.until > nowSec()) {
    result.paused = true
    return result
  }

  // Ein Fehler beim Entdecken hält nur neue Posts auf, nicht die bekannten:
  // ohne eigenes `try` stünden bei einem dauerhaften Fehler hier ALLE Zahlen.
  // Der Admin-Knopf entdeckt immer, aber nur in seinem Projekt; der Cron
  // über alle Clips, dafür nur einmal je Stunde.
  try {
    if (o.manual && o.projectId) {
      result.discovered = await discoverPosts(env, { projectId: o.projectId })
    } else {
      const ts = nowSec()
      if (await discoverDue(env, ts)) {
        result.discovered = await discoverPosts(env)
        await markDiscovered(env, ts)
      }
    }
  } catch (err) {
    console.error('[metrics] Neue Posts nicht eingetragen', err)
  }
  const rows = await claim(env, o)
  if (!rows.length) return result

  let next = 0
  let stop = false
  let errorsInRow = 0
  let answered = false
  let paused = false

  const worker = async () => {
    while (!stop && next < rows.length) {
      const row = rows[next++]
      const ts = nowSec()
      let res: AnalyticsResult
      try {
        result.fetched++
        res = await getPostAnalytics(env, row.postId)
      } catch (err) {
        const status = err instanceof ZernioError ? err.status : 0
        if (status === 429 || status === 401 || status === 403) {
          // Rate-Limit oder Schlüssel ungültig: jeder weitere Abruf liefe
          // gegen dieselbe Wand. Die genommenen Posts sind nach `LEASE_SEC`
          // wieder frei.
          console.warn(`[metrics] Abbruch: Zernio antwortet ${status}`)
          stop = true
          return
        }
        result.failed++
        console.error('[metrics] Abruf fehlgeschlagen', row.postId, err instanceof ZernioError ? err.short : err)
        try {
          await scheduleRetry(env, row, ts)
        } catch (dbErr) {
          console.error('[metrics] Zeitplan nicht geschrieben', row.postId, dbErr)
        }
        if (++errorsInRow >= MAX_ERRORS_IN_ROW) stop = true
        continue
      }

      if (res.status === 402) {
        stop = true
        result.paused = true
        // Gleichzeitige 402er dürfen nur EINEN Audit-Eintrag schreiben —
        // geprüft und gesetzt vor dem ersten `await`.
        if (paused) return
        paused = true
        try {
          await pause(env, { postId: row.postId, body: res.body, known: Boolean(pauseRow) })
        } catch (err) {
          console.error('[metrics] Pause nicht gespeichert', err)
        }
        return
      }
      // Nur Antworten MIT Analytics beweisen, dass der Plan sie enthält. Ein
      // 404 oder 424 kann vor der Planprüfung entstehen — er beendete sonst
      // die Pause, und der nächste 402 meldete sie als neu.
      if (res.status === 200 || res.status === 202) answered = true

      try {
        const { written } = await applyResult(env, row, res, ts)
        errorsInRow = 0
        result.updated += written
        if (res.status === 202) result.pending++
        if (res.status === 404 || res.status === 424) result.failed++
      } catch (err) {
        // Etwa eine Antwortform, die wir nicht lesen können, oder die
        // Freigabe verschwand zwischen Belegen und Schreiben (Fremdschlüssel —
        // dann ist die Zeile im Zeitplan schon mit weg). Wie ein Fehler der
        // Gegenseite: wachsender Abstand statt alle zehn Minuten von vorn,
        // und drei in Folge brechen ab (etwa wenn D1 gerade nicht schreibt).
        result.failed++
        console.error('[metrics] Zahlen nicht geschrieben', row.postId, err)
        try {
          await scheduleRetry(env, row, ts)
        } catch (dbErr) {
          console.error('[metrics] Zeitplan nicht geschrieben', row.postId, dbErr)
        }
        if (++errorsInRow >= MAX_ERRORS_IN_ROW) stop = true
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

  // Zernio hat wieder geantwortet, ohne 402: Analytics sind (wieder) da.
  if (pauseRow && answered && !paused) {
    await getDb(env).delete(schema.appState).where(eq(schema.appState.key, PAUSE_KEY))
  }
  return result
}

/**
 * Der Viertelstundenlauf: neue Posts eintragen, fällige abfragen.
 *
 * Höchstens `limit` Abrufe (Standard 40), älteste Fälligkeit zuerst; mit
 * `projectId` nur die fälligen Posts dieses Projekts. Ohne ZERNIO_API_KEY
 * passiert nichts. Während einer 402-Pause wird nichts gefragt.
 */
export async function syncMetrics(
  env: Env,
  opts: { limit?: number; projectId?: string } = {},
): Promise<SyncResult> {
  return run(env, {
    limit: Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200)),
    projectId: opts.projectId,
    manual: false,
  })
}

/**
 * Sofortiger Abgleich aller Posts eines Projekts — für „Refresh numbers“.
 *
 * Ohne Rücksicht auf den Zeitplan (nur nichts, was in den letzten fünf
 * Minuten gefragt wurde, X nichts aus den letzten sechs Stunden, und nichts,
 * was ein anderer Lauf gerade abfragt), höchstens 60 Abrufe, und auch während
 * einer 402-Pause: ein Klick soll zeigen dürfen, dass sie vorbei ist.
 */
export async function syncProjectMetrics(env: Env, projectId: string): Promise<SyncResult> {
  return run(env, { limit: PROJECT_LIMIT, projectId, manual: true })
}

/* ---------------------------------------------------------------- Lesen */

export interface MetricTotals {
  views: number
  likes: number
  comments: number
  shares: number
  /** Account-Posts mit Zahlen — ein Clip auf drei Accounts zählt dreimal. */
  posts: number
  /** Jüngster Stand unter den gezählten Posts. */
  syncedAt: number | null
}

/** Gesamtsumme und darin enthalten der Anteil, der über Creator lief. */
export type MetricTotalsWithCreators = MetricTotals & { viaCreators: MetricTotals }

/** Summen samt Aufteilung je Projekt. */
export type MetricTotalsPerProject = MetricTotals & { perProject: Map<string, MetricTotals> }

/** Eine Zeile je Account — für die Tabelle unter einem Clip. */
export interface MetricRow {
  platform: string
  username: string | null
  url: string | null
  views: number
  likes: number
  comments: number
  shares: number
  /** NULL = automatisches Ziel des Projekts, sonst Verbreitung über diesen Creator. */
  creatorId: string | null
  syncedAt: number
}

export const emptyTotals = (): MetricTotals => ({
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  posts: 0,
  syncedAt: null,
})

const addInto = (into: MetricTotals, add: MetricTotals): MetricTotals => {
  into.views += add.views
  into.likes += add.likes
  into.comments += add.comments
  into.shares += add.shares
  into.posts += add.posts
  if (add.syncedAt !== null && (into.syncedAt === null || add.syncedAt > into.syncedAt)) into.syncedAt = add.syncedAt
  return into
}

const pm = schema.postMetrics

/**
 * „Views“ je Account: die Views der Plattform, sonst ihre Impressions.
 *
 * Nicht jede Plattform füllt `views`: X meldet die Ansichten eines Posts als
 * `impressions` und `views` bleibt 0, LinkedIn ebenso bei allem außer Video.
 * Instagram dagegen hat `impressions` 2025 abgeschafft und meldet `views`.
 * Die erste Zahl über 0 ist deshalb die, die der Nutzer auf der Plattform
 * als Aufrufe sieht.
 */
const viewsOf = sql`(case when ${pm.views} > 0 then ${pm.views} else ${pm.impressions} end)`

/** Die Summen-Spalten — überall dieselben, damit jede Ansicht gleich zählt. */
const totalsColumns = {
  views: sql<number>`coalesce(sum(${viewsOf}), 0)`.mapWith(Number),
  likes: sql<number>`coalesce(sum(${pm.likes}), 0)`.mapWith(Number),
  comments: sql<number>`coalesce(sum(${pm.comments}), 0)`.mapWith(Number),
  shares: sql<number>`coalesce(sum(${pm.shares}), 0)`.mapWith(Number),
  posts: sql<number>`count(*)`.mapWith(Number),
  syncedAt: sql<number | null>`max(${pm.syncedAt})`.mapWith(Number),
}

const viaCreator = sql<number>`(case when ${pm.creatorId} is null then 0 else 1 end)`.mapWith(Number)

const toTotals = (r: MetricTotals): MetricTotals => ({
  views: r.views,
  likes: r.likes,
  comments: r.comments,
  shares: r.shares,
  posts: r.posts,
  syncedAt: r.syncedAt ?? null,
})

/** `creatorId`: undefined = alle Posts, null = nur automatische, sonst nur dieser Creator. */
const creatorFilter = (creatorId: string | null | undefined) =>
  creatorId === undefined ? undefined : creatorId === null ? isNull(pm.creatorId) : eq(pm.creatorId, creatorId)

/**
 * Summen je Projekt. Die Hauptzahlen enthalten ALLE Posts des Projekts;
 * `viaCreators` ist der Anteil daran, der über Creator-Accounts lief
 * („davon über Creator“). Projekte ohne Zahlen fehlen in der Map.
 */
export async function totalsForProjects(
  env: Env,
  projectIds: string[],
): Promise<Map<string, MetricTotalsWithCreators>> {
  const rows = await inChunks(projectIds, (ids) =>
    getDb(env)
      .select({ projectId: pm.projectId, via: viaCreator, ...totalsColumns })
      .from(pm)
      .where(inArray(pm.projectId, ids))
      .groupBy(pm.projectId, viaCreator),
  )
  const out = new Map<string, MetricTotalsWithCreators>()
  for (const r of rows) {
    let entry = out.get(r.projectId)
    if (!entry) out.set(r.projectId, (entry = { ...emptyTotals(), viaCreators: emptyTotals() }))
    addInto(entry, toTotals(r))
    if (r.via) addInto(entry.viaCreators, toTotals(r))
  }
  return out
}

/**
 * Summen je Clip. `creatorId` wie bei `creatorFilter`: weggelassen = alle
 * Posts des Clips, null = nur die automatischen Ziele, eine ID = nur die
 * Verbreitung über diesen Creator. Clips ohne Zahlen fehlen in der Map.
 */
export async function totalsForDeliverables(
  env: Env,
  deliverableIds: string[],
  opts: { creatorId?: string | null } = {},
): Promise<Map<string, MetricTotals>> {
  const rows = await inChunks(deliverableIds, (ids) =>
    getDb(env)
      .select({ deliverableId: pm.deliverableId, ...totalsColumns })
      .from(pm)
      .where(and(inArray(pm.deliverableId, ids), creatorFilter(opts.creatorId)))
      .groupBy(pm.deliverableId),
  )
  return new Map(rows.map((r) => [r.deliverableId, toTotals(r)]))
}

/** Die Zeilen je Account unter jedem Clip — Filter wie `totalsForDeliverables`. */
export async function rowsForDeliverables(
  env: Env,
  deliverableIds: string[],
  opts: { creatorId?: string | null } = {},
): Promise<Map<string, MetricRow[]>> {
  const rows = await inChunks(deliverableIds, (ids) =>
    getDb(env)
      .select({
        deliverableId: pm.deliverableId,
        platform: pm.platform,
        username: pm.username,
        url: pm.url,
        views: sql<number>`${viewsOf}`.mapWith(Number),
        likes: pm.likes,
        comments: pm.comments,
        shares: pm.shares,
        creatorId: pm.creatorId,
        syncedAt: pm.syncedAt,
      })
      .from(pm)
      .where(and(inArray(pm.deliverableId, ids), creatorFilter(opts.creatorId)))
      // Automatische Ziele zuerst, dann je Creator; darin nach Plattform und Name.
      .orderBy(sql`${pm.creatorId} is not null`, pm.creatorId, pm.platform, pm.username),
  )
  const out = new Map<string, MetricRow[]>()
  for (const { deliverableId, ...row } of rows) {
    const list = out.get(deliverableId)
    if (list) list.push(row)
    else out.set(deliverableId, [row])
  }
  return out
}

/** Gesamtsumme aus Zeilen, die je Projekt gruppiert sind. */
function perProjectTotals(rows: (MetricTotals & { projectId: string })[]): MetricTotalsPerProject {
  const perProject = new Map<string, MetricTotals>()
  const total = emptyTotals()
  for (const r of rows) {
    const t = toTotals(r)
    perProject.set(r.projectId, t)
    addInto(total, t)
  }
  return { ...total, perProject }
}

/**
 * Was die Clips eines Clippers erreicht haben — alle Posts der Clips, die er
 * geliefert hat, auch die über Creator verbreiteten: die Reichweite seines
 * Schnitts, egal über welchen Kanal. Ein Creator, der Kampagnen bearbeitet,
 * hat dafür ebenfalls eine Clipper-ID.
 */
export async function totalsForClipper(env: Env, clipperId: string): Promise<MetricTotalsPerProject> {
  const rows = await getDb(env)
    .select({ projectId: pm.projectId, ...totalsColumns })
    .from(pm)
    .innerJoin(schema.deliverables, eq(schema.deliverables.id, pm.deliverableId))
    .where(eq(schema.deliverables.clipperId, clipperId))
    .groupBy(pm.projectId)
  return perProjectTotals(rows)
}

/** Was ein Creator mit seiner Verbreitung erreicht hat — nur seine eigenen Posts, je Kampagne. */
export async function totalsForCreatorDistribution(
  env: Env,
  creatorId: string,
): Promise<MetricTotalsPerProject> {
  const rows = await getDb(env)
    .select({ projectId: pm.projectId, ...totalsColumns })
    .from(pm)
    .where(eq(pm.creatorId, creatorId))
    .groupBy(pm.projectId)
  return perProjectTotals(rows)
}

/** Alles zusammen, für die Admin-Übersicht — `viaCreators` wie bei `totalsForProjects`. */
export async function grandTotals(env: Env): Promise<MetricTotalsWithCreators> {
  const rows = await getDb(env)
    .select({ via: viaCreator, ...totalsColumns })
    .from(pm)
    .groupBy(viaCreator)
  const out: MetricTotalsWithCreators = { ...emptyTotals(), viaCreators: emptyTotals() }
  for (const r of rows) {
    addInto(out, toTotals(r))
    if (r.via) addInto(out.viaCreators, toTotals(r))
  }
  return out
}

/** Wie viele Posts im Zeitplan stehen und wie es um sie steht — für die Admin-Seite. */
export interface SyncOverview {
  total: number
  ok: number
  pending: number
  failed: number
  unknown: number
  /** Letzter Abruf überhaupt (bzw. in diesem Projekt). */
  lastAt: number | null
}

export async function syncOverview(env: Env, projectId?: string): Promise<SyncOverview> {
  const ms = schema.metricsSync
  const rows = await getDb(env)
    .select({
      status: ms.status,
      n: sql<number>`count(*)`.mapWith(Number),
      lastAt: sql<number | null>`max(${ms.lastAt})`.mapWith(Number),
    })
    .from(ms)
    .where(projectId ? eq(ms.projectId, projectId) : undefined)
    .groupBy(ms.status)
  const out: SyncOverview = { total: 0, ok: 0, pending: 0, failed: 0, unknown: 0, lastAt: null }
  for (const r of rows) {
    out.total += r.n
    if (r.status === 'ok' || r.status === 'pending' || r.status === 'failed' || r.status === 'unknown') {
      out[r.status] += r.n
    }
    if (r.lastAt !== null && (out.lastAt === null || r.lastAt > out.lastAt)) out.lastAt = r.lastAt
  }
  return out
}
