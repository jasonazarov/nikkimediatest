import { AwsClient } from 'aws4fetch'
import type { Env } from './types'

/**
 * Uploads laufen NIE durch den Worker (Request-Größenlimit).
 * Der Worker signiert nur URLs; der Browser spricht direkt mit R2 über die
 * S3-kompatible API. Downloads und Vorschauen ebenso (presigned, 1 h gültig).
 */

export const SIGN_TTL_SEC = 3600

/**
 * Wie lange eine signierte Adresse gilt, die an den Veröffentlichungsanbieter
 * geht — sieben Tage, das Maximum von SigV4.
 *
 * Nicht dieselbe Stunde wie oben, und das hat einen konkreten Grund. Eine
 * Vorschau im Browser ist nach Sekunden geladen; ein Video, das an fünfzehn
 * Social-Accounts geht, wird von den Plattformen SELBST abgeholt — Meta und
 * Google laden von dieser Adresse, wann es ihnen passt, und wiederholen den
 * Versuch später, wenn er scheitert. Instagram meldet genau das: „will retry
 * automatically". Läuft die Signatur bis dahin ab, antwortet R2 mit 403 und
 * die Plattform meldet „couldn't download your video from the media URL (the
 * host returned an error)" — ein Fehlschlag, der wie ein Plattformproblem
 * aussieht und in Wahrheit unsere abgelaufene Adresse ist. Genau so ging der
 * erste echte Clip auf einem Instagram-Account verloren.
 *
 * Die lange Gültigkeit kostet nichts: der Schlüssel enthält eine UUID, die
 * Adresse steht nirgends öffentlich, und sie zeigt auf ein einzelnes Objekt.
 */
export const PUBLISH_SIGN_TTL_SEC = 7 * 24 * 3600

/** S3 verlangt mindestens 5 MiB pro Part (außer beim letzten). */
export const PART_SIZE = 16 * 1024 * 1024
/** Darunter lohnt Multipart nicht — dann ein einzelnes presigned PUT. */
export const MULTIPART_THRESHOLD = PART_SIZE

export const ALLOWED_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'jpg', 'jpeg', 'png'] as const

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export const extOf = (filename: string) => (filename.split('.').pop() || '').toLowerCase()
export const isAllowedFile = (filename: string) => (ALLOWED_EXT as readonly string[]).includes(extOf(filename))
export const mimeFor = (filename: string) => MIME_BY_EXT[extOf(filename)] ?? 'application/octet-stream'
export const isVideo = (filename: string) => mimeFor(filename).startsWith('video/')

/** Entfernt Pfadanteile und alles, was in einem R2-Key Ärger macht. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'datei'
  return (
    base
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120) || 'datei'
  )
}

/** R2-Key-Schema:  {customerId}/{folderId}/{uuid}-{filename} */
export const buildKey = (customerId: string, folderId: string, filename: string) =>
  `${customerId}/${folderId}/${crypto.randomUUID()}-${safeFilename(filename)}`

/**
 * Der Schlüssel des Vorschaubilds zu einer Datei.
 *
 * Abgeleitet statt frei gewählt, und das ist der Punkt: Der Browser lädt das
 * Bild selbst nach R2 hoch, darf den Zielort aber nicht bestimmen. Käme der
 * Schlüssel aus dem Browser, ließe sich damit jedes beliebige Objekt im
 * Bucket überschreiben.
 */
export const thumbKeyFor = (key: string) => `${key}.poster.jpg`

/** Vorschaubilder sind winzig; mehr als das gehört nicht in den Bucket. */
export const THUMB_MAX_BYTES = 512 * 1024

function client(env: Env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  })
}

const endpoint = (env: Env, key: string) =>
  `https://${env.R2_PUBLIC_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

/* ------------------------------------------------------- presigned URLs */

async function presign(env: Env, url: URL, method: string, ttl = SIGN_TTL_SEC): Promise<string> {
  url.searchParams.set('X-Amz-Expires', String(ttl))
  const signed = await client(env).sign(url.toString(), {
    method,
    aws: { signQuery: true },
  })
  return signed.url
}

/** Einzelner PUT-Upload (kleine Dateien). */
export function presignPut(env: Env, key: string): Promise<string> {
  return presign(env, new URL(endpoint(env, key)), 'PUT')
}

/**
 * Download bzw. Streaming-Vorschau. `download` erzwingt den Speichern-Dialog.
 *
 * `ttl` überschreibt die Standard-Stunde. Für den Weg zum
 * Veröffentlichungsanbieter gehört dort `PUBLISH_SIGN_TTL_SEC` hinein —
 * siehe die Begründung an dieser Konstante.
 */
export function presignGet(
  env: Env,
  key: string,
  downloadAs?: string,
  ttl = SIGN_TTL_SEC,
): Promise<string> {
  const url = new URL(endpoint(env, key))
  if (downloadAs) {
    url.searchParams.set(
      'response-content-disposition',
      `attachment; filename="${safeFilename(downloadAs)}"`,
    )
  }
  return presign(env, url, 'GET', ttl)
}

/* ------------------------------------------------------------- multipart */

const textOf = async (res: Response) => await res.text()

function xmlValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1] : null
}

async function s3Fetch(env: Env, url: string, init: RequestInit): Promise<Response> {
  const res = await client(env).fetch(url, init)
  if (!res.ok) {
    throw new Error(`R2 ${init.method ?? 'GET'} ${res.status}: ${(await textOf(res)).slice(0, 400)}`)
  }
  return res
}

export async function createMultipartUpload(env: Env, key: string, contentType: string): Promise<string> {
  const res = await s3Fetch(env, `${endpoint(env, key)}?uploads`, {
    method: 'POST',
    headers: { 'content-type': contentType },
  })
  const uploadId = xmlValue(await textOf(res), 'UploadId')
  if (!uploadId) throw new Error('R2 lieferte keine UploadId')
  return uploadId
}

export function presignPart(env: Env, key: string, uploadId: string, partNumber: number): Promise<string> {
  const url = new URL(endpoint(env, key))
  url.searchParams.set('partNumber', String(partNumber))
  url.searchParams.set('uploadId', uploadId)
  return presign(env, url, 'PUT')
}

export async function completeMultipartUpload(
  env: Env,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const body =
    '<CompleteMultipartUpload>' +
    parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map(
        (p) =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(
            /"/g,
            '&quot;',
          )}</ETag></Part>`,
      )
      .join('') +
    '</CompleteMultipartUpload>'

  const url = new URL(endpoint(env, key))
  url.searchParams.set('uploadId', uploadId)
  await s3Fetch(env, url.toString(), {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/xml' },
  })
}

export async function abortMultipartUpload(env: Env, key: string, uploadId: string): Promise<void> {
  const url = new URL(endpoint(env, key))
  url.searchParams.set('uploadId', uploadId)
  try {
    await s3Fetch(env, url.toString(), { method: 'DELETE' })
  } catch {
    /* Abbruch ist best effort — ein verwaister Upload blockiert nichts. */
  }
}

/** Bereits übertragene Parts — Grundlage für das Fortsetzen abgebrochener Uploads. */
export async function listParts(
  env: Env,
  key: string,
  uploadId: string,
): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const url = new URL(endpoint(env, key))
  url.searchParams.set('uploadId', uploadId)
  const xml = await textOf(await s3Fetch(env, url.toString(), { method: 'GET' }))
  const out: { partNumber: number; etag: string; size: number }[] = []
  for (const block of xml.match(/<Part>[\s\S]*?<\/Part>/g) ?? []) {
    const n = xmlValue(block, 'PartNumber')
    const e = xmlValue(block, 'ETag')
    const s = xmlValue(block, 'Size')
    if (n && e) out.push({ partNumber: Number(n), etag: e, size: Number(s ?? 0) })
  }
  return out
}

/**
 * Ist R2 einsatzbereit? Für presigned URLs genügen die S3-Zugangsdaten; das
 * Binding MEDIA ist eine Abkürzung und darf fehlen, solange R2 im Account
 * noch nicht freigeschaltet ist.
 */
export const r2Ready = (env: Env) => Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)

export const R2_MISSING =
  'Der Videospeicher ist noch nicht eingerichtet. Bitte R2 aktivieren und die Zugangsdaten hinterlegen.'

/** Dieselbe Meldung für Clipper und Creator — die können R2 nicht selbst einrichten. */
export const R2_MISSING_WORKER =
  'Der Videospeicher ist noch nicht eingerichtet. Bitte wende dich an Nikki Media.'

/** Objektgröße nach Upload-Abschluss — Quelle der Wahrheit für die Speicherbilanz. */
export async function objectSize(env: Env, key: string): Promise<number> {
  if (env.MEDIA) return (await env.MEDIA.head(key))?.size ?? 0
  const res = await client(env).fetch(endpoint(env, key), { method: 'HEAD' })
  return res.ok ? Number(res.headers.get('content-length') ?? 0) : 0
}

export async function deleteObject(env: Env, key: string): Promise<void> {
  if (env.MEDIA) {
    await env.MEDIA.delete(key)
    return
  }
  await s3Fetch(env, endpoint(env, key), { method: 'DELETE' })
}

/**
 * Dateigröße lesbar machen. Das Dezimalzeichen richtet sich nach der Sprache
 * der Seite: im deutschen Bereich das Komma, im englischen Admin-Bereich
 * der Punkt.
 */
export function formatBytes(bytes: number, lang: 'de' | 'en' = 'de'): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const text = value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)
  return `${lang === 'en' ? text : text.replace('.', ',')} ${units[i]}`
}
