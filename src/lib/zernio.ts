import type { Env } from './types'

/**
 * Dünner Client für die Zernio-API.
 *
 * Bewusst kein SDK: wir brauchen zehn Endpunkte, `fetch` genügt, und ein
 * Paket weniger heißt ein Update-Zwang weniger. Die Feldnamen hier stammen
 * aus der offiziellen OpenAPI-Spec (`https://docs.zernio.com/api/openapi`) —
 * nicht geraten.
 *
 * WICHTIG: Diese Datei kennt nur den Anbieter. Abnehmer sind genau zwei:
 * `publisher.ts` (Veröffentlichen) und `metrics.ts` (Zahlen lesen). Wer sie
 * sonst irgendwo importiert, hat die Abstraktion durchbrochen.
 */

const BASE = 'https://zernio.com/api'

/**
 * Plattformen, die wir bedienen.
 *
 * Zernio kennt mehr; hier steht nur, was Nikki Media veröffentlicht. Die
 * Schreibweise ist KLEIN — anders als beim Vorgänger, der Großbuchstaben
 * verlangte. Ein falsch geschriebener Name wird nicht etwa abgewiesen,
 * sondern trifft schlicht keinen Account.
 *
 * Facebook und LinkedIn kamen mit den Creator-Accounts dazu. Beide postet
 * Zernio per API (`GET /v1/connect/{platform}` und `POST /v1/posts` führen
 * sie in der Spec). Die Auswahl der Facebook-Seite bzw. LinkedIn-Organisation
 * hostet Zernio im Standard-Modus selbst und leitet erst danach zurück — für
 * uns sieht die Rückkehr also aus wie bei jeder anderen Plattform.
 *
 * NICHT hier: Snapchat (bei Zernio geschlossene Beta, 403
 * PLATFORM_BETA_RESTRICTED) und Twitch (gibt es bei Zernio nicht). Für beide
 * hält `MANUAL_PLATFORMS` in publisher.ts einen von Hand eingetragenen Link.
 */
export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook' | 'linkedin'

export const PLATFORMS: readonly Platform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'linkedin',
]

export const isPlatform = (v: string): v is Platform =>
  (PLATFORMS as readonly string[]).includes(v)

/** Ein Profil bei Zernio — für uns ein OAuth-Steckplatz, sonst nichts. */
export interface ZernioProfile {
  _id: string
  name: string
  description?: string | null
}

/** Ein verbundener Social-Account. */
export interface ZernioAccount {
  _id: string
  platform: string
  username?: string | null
  displayName?: string | null
  /**
   * `false`, sobald die Verbindung nicht mehr trägt (Token abgelaufen oder
   * entzogen). `GET /v1/accounts` liefert ohne Filter auch solche Accounts.
   */
  isActive?: boolean
  /** Die Plattform hat das Token endgültig für tot erklärt — nur Neuverbinden hilft. */
  needsReconnection?: boolean
  /**
   * Kommt als Objekt ODER als String zurück, je nach Endpunkt. `accountRef`
   * unten löst das auf; wer hier selbst zugreift, holt sich einen Bug.
   */
  profileId?: { _id: string; name?: string } | string | null
}

/** Ein Zielkanal innerhalb eines Posts — ein Eintrag je Account. */
export interface ZernioPostTarget {
  platform: string
  /** REST-Antworten liefern ein Objekt, Webhooks einen String. Beides gültig. */
  accountId?: { _id: string } | string | null
  status?: string
  platformPostId?: string | null
  /** REST nennt es `platformPostUrl`, der Webhook `publishedUrl`. */
  platformPostUrl?: string | null
  publishedUrl?: string | null
  error?: string | null
}

export interface ZernioPost {
  _id?: string
  id?: string
  status?: string
  platforms?: ZernioPostTarget[]
  metadata?: Record<string, unknown> | null
}

/**
 * Zieht die Account-ID aus einem Feld, das mal Objekt und mal String ist.
 *
 * Das ist keine Überfürsorge: `POST /v1/posts` und `GET /v1/posts/{id}`
 * liefern `accountId` als eingebettetes Objekt, die Webhook-Nutzlast als
 * blanke ID. Wer nur einen Fall behandelt, verliert je nach Weg entweder
 * alle Ergebnisse der Echtzeit-Antwort oder alle aus dem Webhook.
 */
export const accountRef = (v: ZernioPostTarget['accountId']): string =>
  typeof v === 'string' ? v : (v?._id ?? '')

/**
 * Ein Fehler von Zernio — mit allem, was zur Diagnose taugt.
 *
 * `details` trägt bei einem 400er die Feldfehler der Gegenseite. Genau die
 * braucht man, wenn ein Post nicht angenommen wird; eine Meldung wie
 * „Bad Request" allein hilft niemandem weiter.
 */
export class ZernioError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    /**
     * Der maschinenlesbare `code` der Gegenseite. Bei 409 entscheidet er
     * zwischen zwei völlig verschiedenen Lagen: `idempotency_conflict` heißt
     * „derselbe Post wird gerade noch angelegt“, ein Konflikt ohne diesen
     * Code meint etwas anderes (Inhaltsdublette, Profilname vergeben).
     */
    readonly code?: string,
    /** `Retry-After` in Sekunden, wenn die Gegenseite einen Abstand verlangt. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'ZernioError'
  }

  /** Kurzfassung für die Spalte `deliverables.publish_error`. */
  get short(): string {
    const detail = this.details ? `: ${JSON.stringify(this.details).slice(0, 300)}` : ''
    return `HTTP ${this.status}: ${this.message}${detail}`.slice(0, 500)
  }
}

/** Fehlt der Schlüssel, ist die Anbindung schlicht nicht eingerichtet. */
export const zernioReady = (env: Env) => Boolean(env.ZERNIO_API_KEY)

async function call<T>(
  env: Env,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  if (!env.ZERNIO_API_KEY) {
    throw new ZernioError(0, 'ZERNIO_API_KEY ist nicht gesetzt.')
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.ZERNIO_API_KEY}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const raw = await res.text()
  let parsed: any = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    /* Kein JSON — dann trägt `raw` die Meldung. */
  }

  if (!res.ok) {
    throw new ZernioError(
      res.status,
      String(parsed?.error ?? parsed?.message ?? raw.slice(0, 300) ?? res.statusText),
      parsed?.details ?? parsed?.issues,
      typeof parsed?.code === 'string' ? parsed.code : undefined,
      retryAfterSec(res.headers.get('retry-after')),
    )
  }
  return parsed as T
}

/**
 * `Retry-After` lesen — Sekunden oder ein HTTP-Datum. Unbrauchbares zählt
 * als „nicht angegeben“, statt einen Versand für immer aufzuschieben.
 */
function retryAfterSec(raw: string | null): number | undefined {
  if (!raw) return undefined
  const text = raw.trim()
  if (/^\d+$/.test(text)) return Number(text)
  const at = Date.parse(text)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/* --------------------------------------------------------------- Profile */

/**
 * POST /v1/profiles
 *
 * Ein Profil hält höchstens EINEN Account je Plattform. Für den zweiten
 * Instagram-Account eines Kunden braucht es deshalb ein zweites Profil.
 * Das ist reine Verkabelung: veröffentlicht wird über Account-IDs, die
 * Zernio teamweit prüft — nicht profilweise.
 *
 * `Idempotency-Key` verhindert, dass ein wiederholter Aufruf nach einem
 * Netzabbruch ein zweites Profil anlegt.
 */
export const createProfile = (
  env: Env,
  o: { name: string; description?: string; idempotencyKey?: string },
) =>
  call<{ profile: ZernioProfile }>(
    env,
    'POST',
    '/v1/profiles',
    { name: o.name, description: o.description },
    o.idempotencyKey ? { 'Idempotency-Key': o.idempotencyKey } : undefined,
  )

/** GET /v1/profiles — Namen sind teamweit eindeutig, daher der Filter. */
export const findProfileByName = (env: Env, name: string) =>
  call<{ profiles: ZernioProfile[] }>(
    env,
    'GET',
    `/v1/profiles?name=${encodeURIComponent(name)}`,
  )

/* -------------------------------------------------------------- Accounts */

/** GET /v1/accounts — optional auf ein Profil eingegrenzt. */
/**
 * Verbundene Accounts, auf Wunsch eines Profils.
 *
 * `includeOverLimit=true`: ohne den Schalter lässt die Gegenseite Accounts
 * aus Profilen weg, die über einem Planlimit liegen. Unser Abgleich würde sie
 * dann für getrennt halten und lokal löschen — und eine echte Verbindung beim
 * Zurückkehren als fremd abweisen.
 */
export const listAccounts = (env: Env, o?: { profileId?: string }) =>
  call<{ accounts: ZernioAccount[] }>(
    env,
    'GET',
    o?.profileId
      ? `/v1/accounts?profileId=${encodeURIComponent(o.profileId)}&includeOverLimit=true`
      : '/v1/accounts?includeOverLimit=true',
  )

/* ------------------------------------------------------------ Verbinden */

/**
 * Wie ein Instagram-Konto verbunden wird. Nur für Instagram von Bedeutung.
 *
 * `instagram_login` (Voreinstellung): der Nutzer meldet sich direkt bei
 * Instagram an. Nachteil bei mehreren Konten — Instagram zeigt immer das im
 * Browser angemeldete Konto und bietet KEINE Auswahl. Für ein zweites Konto
 * muss man sich dort erst abmelden.
 *
 * `facebook_login`: der Nutzer meldet sich bei Facebook an und wählt dann
 * die Seite, deren Instagram-Konto verbunden werden soll. Wer zehn
 * Kundenkonten über einen Business-Zugang verwaltet, meldet sich damit
 * EINMAL an und wählt danach je Verbindung ein anderes Konto — ohne
 * Abmelden, ohne privates Fenster.
 */
export type InstagramLoginMethod = 'instagram_login' | 'facebook_login'

/**
 * X trägt die Rückkehradresse im OAuth-`state`, und der ist auf 500 Zeichen
 * begrenzt. Laut Spec darf die URL-kodierte `redirect_url` für API-Aufrufer
 * deshalb höchstens 258 Zeichen lang sein — sonst 400 INVALID_REDIRECT_URL.
 */
const TWITTER_REDIRECT_MAX = 258

/**
 * GET /v1/connect/{platform}
 *
 * Liefert die `authUrl`, auf die der Browser geschickt wird. Für Instagram,
 * TikTok und YouTube zeigt sie direkt auf die Plattform, nicht auf Zernio —
 * nachgeprüft. Für TikTok steht dort bereits `disable_auto_auth=1` und für
 * YouTube `prompt=select_account consent`: beide zeigen also von sich aus
 * eine Auswahl, statt still das angemeldete Konto zu nehmen.
 *
 * Bei Facebook und LinkedIn folgt nach der Zustimmung noch eine Auswahl
 * (welche Seite, welche Organisation). Die hostet Zernio im Standard-Modus
 * selbst; zurück kommt der Browser erst danach, mit denselben Angaben
 * (`connected`, `profileId`, `accountId`, `username`) wie überall.
 */
export const connectUrl = (
  env: Env,
  o: {
    platform: Platform
    profileId: string
    redirectUrl: string
    loginMethod?: InstagramLoginMethod
  },
) => {
  // Lieber hier mit klarer Meldung abbrechen als mit einem 400er, dessen
  // Grund niemand mehr der Adresslänge zuordnet.
  if (o.platform === 'twitter' && encodeURIComponent(o.redirectUrl).length > TWITTER_REDIRECT_MAX) {
    return Promise.reject(
      new ZernioError(
        400,
        `Rückkehradresse zu lang für X (höchstens ${TWITTER_REDIRECT_MAX} Zeichen URL-kodiert).`,
      ),
    )
  }
  return call<{ authUrl: string }>(
    env,
    'GET',
    `/v1/connect/${o.platform}?profileId=${encodeURIComponent(o.profileId)}` +
      `&redirect_url=${encodeURIComponent(o.redirectUrl)}` +
      (o.loginMethod ? `&loginMethod=${o.loginMethod}` : ''),
  )
}

/* ------------------------------------------------------- Account-Gruppen */

/**
 * POST /v1/account-groups
 *
 * Die Gruppe ist der Container, den es beim Vorgänger nicht gab: sie hält
 * beliebig viele Accounts über Profilgrenzen hinweg — also auch zehn
 * Instagram-Accounts nebeneinander. Wir führen eine je Projekt, damit das
 * Dashboard der Gegenseite lesbar bleibt.
 *
 * Für den Versand ist sie NICHT nötig; die Wahrheit steht in unserer
 * Datenbank. Scheitert sie, darf deshalb nichts weiter passieren.
 */
export const createGroup = (env: Env, o: { name: string; accountIds: string[] }) =>
  call<{ group: { _id: string; name: string; accountIds: string[] } }>(
    env,
    'POST',
    '/v1/account-groups',
    o,
  )

/** PUT /v1/account-groups/{groupId} — ersetzt die Mitgliederliste vollständig. */
export const updateGroup = (
  env: Env,
  groupId: string,
  o: { name?: string; accountIds: string[] },
) => call<unknown>(env, 'PUT', `/v1/account-groups/${encodeURIComponent(groupId)}`, o)

/* ----------------------------------------------------------------- Posts */

/** Ein Zielkanal beim Anlegen — Plattform plus Account, mehrfach je Plattform. */
export interface CreatePostTarget {
  platform: Platform
  accountId: string
  /** Plattformabhängige Felder — YouTube-Titel, Instagram-Feed-Schalter, … */
  platformSpecificData?: Record<string, unknown>
}

export interface CreatePostInput {
  /** Der sichtbare Text. Auf allen Plattformen derselbe. */
  content: string
  /** Interner Name, KEINE Caption. */
  title?: string
  mediaItems: { type: 'video'; url: string; filename?: string; mimeType?: string }[]
  platforms: CreatePostTarget[]
  publishNow?: boolean
  /**
   * Wird im Webhook unverändert zurückgeliefert — unser Weg zur Deliverable-ID
   * und, bei der Verbreitung über Creator, zur Freigabe-Zeile (`creatorId`).
   */
  metadata?: Record<string, unknown>
  /** Gilt für ALLE TikTok-Ziele desselben Aufrufs. */
  tiktokSettings?: Record<string, unknown>
}

/**
 * POST /v1/posts
 *
 * Der ganze Grund für den Anbieterwechsel: `platforms` ist eine Liste von
 * Account-IDs, kein Plattformname. Derselbe Name darf mehrfach vorkommen —
 * fünf TikToks, drei Instagram und zwei YouTube gehen in EINEM Aufruf raus.
 *
 * Gesendet wird `Idempotency-Key`, nicht mehr `x-request-id`. Letzteres
 * griff nur, wenn derselbe Schlüssel mit demselben Inhalts-Fingerabdruck
 * eintraf — gleicher Account, gleicher Text, gleiche MEDIEN-URL —, und jeder
 * unserer Läufe signiert die R2-Adresse frisch. `Idempotency-Key` vergleicht
 * laut Spec allein den Schlüssel: binnen 24 Stunden kommt der erste Post
 * zurück (auch wenn dessen Antwort mit 5xx abbrach), solange er noch
 * angelegt wird ein 409 `idempotency_conflict`; scheiterte die erste Anfrage
 * ohne Post, gilt die zweite als neu. Wie der Schlüssel gebildet wird, damit
 * er nie zwei verschiedene Posts meint, steht in publisher.ts
 * (`idempotencyKeyFor`). Die erste Sperre gegen Doppelposts bleibt das
 * Belegen dort (`reserveTargets`), dieser Kopf ist die zweite — und der
 * einzige sichere Weg, einen Versuch ohne bekannten Ausgang (Abbruch, 5xx,
 * verwaiste Belegung) zu wiederholen: publisher.ts speichert den Schlüssel
 * je Ziel und schickt ihn dann unverändert erneut (`keyReusable`).
 */
export const createPost = (env: Env, input: CreatePostInput, idempotencyKey?: string) =>
  call<{ post: ZernioPost; existingPost?: ZernioPost }>(
    env,
    'POST',
    '/v1/posts',
    input,
    idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  )

/** GET /v1/posts/{postId} */
export const getPost = (env: Env, postId: string) =>
  call<{ post: ZernioPost }>(env, 'GET', `/v1/posts/${encodeURIComponent(postId)}`)

/* ---------------------------------------------------------------- Aufräumen */

/**
 * DELETE /v1/accounts/{accountId} — trennt die Verbindung endgültig.
 *
 * Wichtig fürs Geld: abgerechnet wird je verbundenem Account und Tag. Ein
 * Account, den niemand mehr braucht, kostet weiter, solange er verbunden ist.
 */
export const disconnectAccount = (env: Env, accountId: string) =>
  call<unknown>(env, 'DELETE', `/v1/accounts/${encodeURIComponent(accountId)}`)

/** DELETE /v1/profiles/{profileId} — räumt einen leeren Steckplatz ab. */
export const deleteProfile = (env: Env, profileId: string) =>
  call<unknown>(env, 'DELETE', `/v1/profiles/${encodeURIComponent(profileId)}`)

/** DELETE /v1/account-groups/{groupId} */
export const deleteGroup = (env: Env, groupId: string) =>
  call<unknown>(env, 'DELETE', `/v1/account-groups/${encodeURIComponent(groupId)}`)

/* -------------------------------------------------------------- Webhooks */

export const listWebhooks = (env: Env) =>
  call<{ webhooks: { _id: string; url: string; events: string[] }[] }>(
    env,
    'GET',
    '/v1/webhooks/settings',
  )

export const createWebhook = (
  env: Env,
  o: { name: string; url: string; secret: string; events: string[] },
) => call<unknown>(env, 'POST', '/v1/webhooks/settings', o)

/* ------------------------------------------------------------- Analytics */

/**
 * Die Zahlen eines Posts auf einem Account (`PostAnalytics` in der Spec).
 *
 * Alles optional und nullbar: welche Kennzahl eine Plattform liefert, ist
 * verschieden (X kennt `impressions`, aber `views` bleibt 0; Instagram hat
 * `impressions` 2025 abgeschafft). Wer liest, prüft jede Zahl einzeln.
 */
export interface ZernioPostAnalytics {
  impressions?: number | null
  reach?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
  clicks?: number | null
  views?: number | null
  engagementRate?: number | null
  /** ISO-Zeitpunkt, zu dem Zernio die Zahlen zuletzt von der Plattform holte. */
  lastUpdated?: string | null
}

/** Ein Account innerhalb des Posts (`PlatformAnalytics` in der Spec). */
export interface ZernioPlatformAnalytics {
  platform?: string
  /** `failed` = auf diesem Account gar nicht veröffentlicht. */
  status?: 'published' | 'failed' | string
  platformPostId?: string | null
  accountId?: string
  /** Kommt mit führendem @ ("@acmecorp"). */
  accountUsername?: string | null
  /** NULL, solange für diesen Account nichts synchronisiert ist. */
  analytics?: ZernioPostAnalytics | null
  syncStatus?: 'synced' | 'pending' | 'unavailable' | string
  platformPostUrl?: string | null
  errorMessage?: string | null
  errorCode?: string | null
}

/**
 * Antwort auf `GET /v1/analytics?postId=…` (`AnalyticsSinglePostResponse`).
 *
 * Dieselbe Form bei 200, 202 und 424 — nur `syncStatus` und `message`
 * sagen, ob schon etwas zu holen war.
 */
export interface ZernioAnalyticsResponse {
  postId?: string
  status?: string
  publishedAt?: string | null
  /** Summe über alle Accounts. Wir summieren selbst aus `platformAnalytics`. */
  analytics?: ZernioPostAnalytics | null
  platformAnalytics?: ZernioPlatformAnalytics[]
  platform?: string
  platformPostUrl?: string | null
  syncStatus?: 'synced' | 'pending' | 'partial' | 'unavailable' | string
  message?: string | null
}

/** Die Antworten, die der Abgleich als Ergebnis behandelt — nicht als Fehler. */
export type AnalyticsStatus = 200 | 202 | 402 | 404 | 424

export interface AnalyticsResult {
  status: AnalyticsStatus
  /** Bei 402 und 404 der Fehlerkörper der Gegenseite, sonst die Analytics. Immer ein JSON-Objekt. */
  body: ZernioAnalyticsResponse
}

const ANALYTICS_RESULTS: readonly number[] = [200, 202, 402, 404, 424]

/**
 * Obergrenze je Abruf. Der Abgleich läuft mit vier Abrufen nebeneinander im
 * Viertelstundentakt; eine hängende Verbindung soll einen davon nicht bis
 * zum Ende des Laufs blockieren, sondern als gewöhnlicher Fehler später
 * erneut drankommen.
 */
const ANALYTICS_TIMEOUT_MS = 20_000

/**
 * GET /v1/analytics?postId={postId} — die Zahlen EINES Zernio-Posts.
 *
 * Eigener Aufruf statt `call`: der wirft bei allem außer 2xx und verschluckt
 * den Status. Hier sind fünf Antworten aber Ergebnisse, keine Fehler —
 * 202 (Zernio synchronisiert noch), 424 (auf allen Plattformen gescheitert),
 * 404 (Post unbekannt), 402 (Plan ohne Analytics). Der Abgleich plant nach
 * jeder anders weiter (siehe lib/metrics.ts), also muss er sie unterscheiden
 * können. Alles andere — 401, 429, 5xx, Netzfehler — bleibt ein `ZernioError`.
 *
 * Ein Ergebnis nur MIT JSON-Objekt als Körper. Ein 404 als HTML-Seite kommt
 * nicht von der API, sondern von einem falschen Pfad, einem Proxy oder einer
 * Fehlerseite davor — als „Post unbekannt“ gewertet, schöbe er jeden Post
 * still um eine Woche. Als `ZernioError` ist er ein gewöhnlicher Fehler:
 * kurzer Abstand, und drei in Folge brechen den Lauf ab.
 *
 * Neben publisher.ts ist lib/metrics.ts der einzige Abnehmer: Zahlen lesen
 * ist eine eigene Aufgabe, die mit dem Veröffentlichen nichts teilt.
 */
export async function getPostAnalytics(env: Env, postId: string): Promise<AnalyticsResult> {
  if (!env.ZERNIO_API_KEY) {
    throw new ZernioError(0, 'ZERNIO_API_KEY ist nicht gesetzt.')
  }

  const res = await fetch(`${BASE}/v1/analytics?postId=${encodeURIComponent(postId)}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${env.ZERNIO_API_KEY}` },
    signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
  })

  const raw = await res.text()
  let parsed: any = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    /* Kein JSON — dann trägt `raw` die Meldung. */
  }

  const isJsonObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  if (ANALYTICS_RESULTS.includes(res.status) && isJsonObject) {
    return { status: res.status as AnalyticsStatus, body: parsed as ZernioAnalyticsResponse }
  }
  throw new ZernioError(
    res.status,
    String(parsed?.error ?? parsed?.message ?? (raw.slice(0, 300) || res.statusText)),
    parsed?.details ?? parsed?.issues,
  )
}
