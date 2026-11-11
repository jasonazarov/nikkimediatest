export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** Passwort für /admin. Ohne dieses Secret bleibt das CRM zu. */
  ADMIN_PASSWORD?: string
  /** Salz für gehashte IP-Adressen (Drosselung). */
  IP_SALT?: string
  /** Optional: Mail an ADMIN_EMAIL bei jeder neuen Anfrage (Resend). */
  RESEND_API_KEY?: string
  ADMIN_EMAIL?: string
  MAIL_FROM?: string
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Alles, was in HTML landet, geht hier durch. */
export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c])

/** JSON in einem <script type="application/json">: kein `</script>` möglich. */
export const jsonScript = (v: unknown): string =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Vergleich in konstanter Zeit, damit die Antwortzeit nichts über das Passwort verrät. */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256('pw:' + a), sha256('pw:' + b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const ipHash = async (env: Env, ip: string | undefined): Promise<string> =>
  (await sha256((env.IP_SALT || 'marina-betke') + '|' + (ip || 'unbekannt'))).slice(0, 32)

const BERLIN_DT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const BERLIN_D = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
const BERLIN_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })

export const fmtDateTime = (ms: number) => BERLIN_DT.format(new Date(ms)) + ' Uhr'
export const fmtDate = (ms: number) => BERLIN_D.format(new Date(ms))
/** Tag in Berliner Zeit als JJJJ-MM-TT, für Tagesgrafiken. */
export const dayKey = (ms: number) => BERLIN_KEY.format(new Date(ms))

/** „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“, danach das Datum. */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'gerade eben'
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`
  const d = Math.floor(s / 86400)
  if (d < 14) return d === 1 ? 'gestern' : `vor ${d} Tagen`
  return fmtDate(ms)
}

/** Nur die Ziffern einer Nummer mit Ländervorwahl, für wa.me und tel:. */
export const phoneDigits = (tel: string) => tel.replace(/\D/g, '')
