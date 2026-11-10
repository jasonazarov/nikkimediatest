import { desc, eq, sql } from 'drizzle-orm'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { getDb, nowSec, uid, schema } from './db'
import { loginPage } from '../views/login'
import type { AppEnv, Env } from './types'
import type { Role, User } from '../db/schema'

/**
 * Basisname der Session-Cookies. Unter genau diesem Namen lief früher die
 * einzige Sitzung des Browsers; heute ist er das Alt-Cookie für die
 * Migration, die aktiven Cookies heißen `nm_session_<rolle>`.
 */
export const SESSION_COOKIE = 'nm_session'
const SESSION_DAYS = 30

/**
 * Wie lange ein Login-Code gilt.
 *
 * 30 Minuten, nicht 15: Outlook und Hotmail liefern Post regelmäßig mit
 * Minuten Verzug aus, und ein Code, der beim Ankommen schon tot ist, ist der
 * sicherste Weg, jemanden auszusperren. Die Zahl steht in Prosa außerdem in
 * `views/login.ts`, `lib/mail.ts`, `views/admin.ts` und `views/legal.ts` —
 * wer sie hier ändert, ändert sie dort mit.
 */
const CODE_TTL_SEC = 30 * 60
export const CODE_TTL_MIN = CODE_TTL_SEC / 60
/**
 * So viele der zuletzt verschickten Codes einer Adresse werden geprüft.
 * Mehr als eine Code-Mail im Postfach ist der Normalfall, nicht die Ausnahme.
 */
const CODE_WINDOW = 5
const MAX_ATTEMPTS = 5
const LOCKOUT_SEC = 30 * 60

/* ------------------------------------------------------------------ Hashing */

const enc = new TextEncoder()

/** HMAC-SHA256 mit AUTH_SECRET als Pepper — Codes/Token liegen nie im Klartext. */
async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Konstantzeit-Vergleich, damit Hashes nicht per Timing erraten werden. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const hashCode = (env: Env, email: string, code: string) =>
  hmac(env.AUTH_SECRET, `code:${normalizeEmail(email)}:${code}`)

export const hashToken = (env: Env, token: string) => hmac(env.AUTH_SECRET, `session:${token}`)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * Das Konto zu einer Adresse — für jeden Anmeldeweg dasselbe.
 *
 * Gespeichert wird überall kleingeschrieben, und danach wird zuerst gesucht.
 * Der zweite Versuch ohne Rücksicht auf Groß- und Kleinschreibung ist die
 * Versicherung für den Fall, dass je eine Zeile von Hand in D1 landet (so
 * wird das Admin-Passwort gesetzt): Eine Adresse mit einem großen Buchstaben
 * darin fände sich sonst nie wieder, der Code ginge nie raus, und die
 * Anmeldeseite behauptete trotzdem, die Mail sei unterwegs.
 */
export async function findUserByEmail(env: Env, email: string): Promise<User | undefined> {
  const db = getDb(env)
  const mail = normalizeEmail(email)

  const [exact] = await db.select().from(schema.users).where(eq(schema.users.email, mail)).limit(1)
  if (exact) return exact

  const [loose] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${mail}`)
    .limit(1)
  return loose
}

/** 8-stelliger numerischer Code, gleichverteilt (kein Modulo-Bias durch Rejection). */
export function generateCode(): string {
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= 4_294_967_295 - (4_294_967_295 % 100_000_000))
  return String(n % 100_000_000).padStart(8, '0')
}

export function generateToken(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ------------------------------------------------------------- Passwörter */

/** Mindestlänge für selbst gesetzte Passwörter. */
export const PASSWORD_MIN = 10

const PBKDF2_ROUNDS = 100_000
const PW_MAX_ATTEMPTS = 5

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))

/** Platzhalter, damit auch ein Fehlversuch ohne Konto gleich lange rechnet. */
const DUMMY_HASH = `pbkdf2$sha256$${PBKDF2_ROUNDS}$${'00'.repeat(16)}$${'00'.repeat(32)}`

async function derive(password: string, salt: Uint8Array, rounds: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    key,
    256,
  )
  return toHex(bits)
}

/**
 * PBKDF2-SHA256, 100.000 Runden, 16 Byte Zufalls-Salt pro Konto.
 * Ergebnis: `pbkdf2$sha256$<runden>$<salt-hex>$<hash-hex>`
 *
 * Bewusst ohne AUTH_SECRET als Pepper — anders als bei Codes und Tokens.
 * Grund: das erste Passwort muss von außerhalb des Workers gesetzt werden
 * können (direkt in D1), und dort ist das Secret nicht lesbar. Salt und
 * Rundenzahl stecken im Hash selbst, ein Wechsel der Parameter bricht also
 * keine bestehenden Passwörter.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return `pbkdf2$sha256$${PBKDF2_ROUNDS}$${toHex(salt)}$${await derive(password, salt, PBKDF2_ROUNDS)}`
}

/** Prüft ein Passwort gegen einen gespeicherten Hash. */
export async function verifyPassword(
  stored: string | null | undefined,
  password: string,
): Promise<boolean> {
  // Ohne gesetztes Passwort trotzdem rechnen, sonst verrät die Antwortzeit,
  // ob es das Konto gibt bzw. ob dort ein Passwort hinterlegt ist.
  const record = stored ?? DUMMY_HASH
  const [scheme, algo, rounds, saltHex, hashHex] = record.split('$')
  if (scheme !== 'pbkdf2' || algo !== 'sha256') return false

  const n = Number(rounds)
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return false

  const candidate = await derive(password, fromHex(saltHex), n)
  return stored ? timingSafeEqual(candidate, hashHex) : false
}

export type PasswordCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: 'gesperrt' | 'falsch'; retryInMin?: number }

/**
 * Login per E-Mail und Passwort — **ausschließlich für das Admin-Konto**.
 *
 * Kunden und Clipper melden sich weiterhin nur mit dem achtstelligen
 * E-Mail-Code an. Die Rollenprüfung steht bewusst hier und nicht bloß in der
 * Route: selbst wenn bei einem Kunden- oder Clipper-Konto jemals ein
 * Passwort-Hash landen sollte, öffnet er keine Tür.
 *
 * Nach 5 Fehlversuchen ist die Adresse 30 Minuten gesperrt — dieselbe Regel
 * wie beim Code-Login, aber in einem eigenen Zähler, damit sich beide Wege
 * nicht gegenseitig blockieren.
 *
 * Unbekannte Adresse, falsche Rolle und falsches Passwort liefern denselben
 * Grund (`falsch`), damit die Antwort keine Kontoauskunft gibt.
 *
 * `allowed` sagt, wer sich auf diesem Weg anmelden darf — ohne Angabe nur
 * Admins. Ausnahmen: die Demo-Konten (/login/demo) und Agentur-Konten, denen
 * der Administrator ein Passwort gesetzt hat (`agencyPasswordLogin`, /login/passwort).
 */
export async function verifyPasswordLogin(
  env: Env,
  email: string,
  password: string,
  allowed: (user: User) => boolean | Promise<boolean> = (u) => u.role === 'admin',
): Promise<PasswordCheck> {
  const mail = normalizeEmail(email)
  const ts = nowSec()

  const blocked = await getBlock(env, `pw:${mail}`)
  if (blocked > ts) return { ok: false, reason: 'gesperrt', retryInMin: Math.ceil((blocked - ts) / 60) }

  const user = await findUserByEmail(env, mail)

  // verifyPassword rechnet immer, auch ohne Konto — die Rollenprüfung danach
  // ändert daran nichts, die Antwortzeit bleibt also für alle Fälle gleich.
  const correct = await verifyPassword(user?.passwordHash, password)

  if (!correct || !user || !(await allowed(user))) {
    const within = await consumeRateLimit(env, `pw:${mail}`, PW_MAX_ATTEMPTS, LOCKOUT_SEC)
    if (!within) {
      await setBlock(env, `pw:${mail}`, ts + LOCKOUT_SEC)
      return { ok: false, reason: 'gesperrt', retryInMin: LOCKOUT_SEC / 60 }
    }
    return { ok: false, reason: 'falsch' }
  }

  await clearBlock(env, `pw:${mail}`)
  return { ok: true, userId: user.id }
}

/**
 * Agentur-Konten mit Passwort (Vorgabe des Auftraggebers, November 2026): manche
 * Agenturen melden sich mit E-Mail und Passwort an statt mit dem Code per Mail.
 * Das Passwort setzt nur der Administrator (scripts/agentur-konto.mjs), es gibt
 * keinen Weg, es selbst zu setzen. Nur Rolle `agency`, kein Demo-Konto (die haben
 * /login/demo) und nur mit gesetztem Hash: ein Kunden-, Clipper- oder Creator-Konto
 * öffnet diese Tür nie, auch nicht, falls dort je ein Hash landen sollte.
 * Login unter /login/passwort; /login leitet solche Adressen dorthin.
 */
export const agencyPasswordLogin = (u: Pick<User, 'role' | 'demo' | 'passwordHash'>): boolean =>
  u.role === 'agency' && u.demo !== 1 && Boolean(u.passwordHash)

/** Setzt bzw. ersetzt das Passwort eines Kontos. */
export async function setPassword(env: Env, userId: string, password: string): Promise<void> {
  await getDb(env)
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), passwordSetAt: nowSec() })
    .where(eq(schema.users.id, userId))
}

/* ------------------------------------------------------------- Login-Codes */

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'gesperrt' | 'abgelaufen' | 'falsch' | 'unbekannt'; retryInMin?: number }

/**
 * Erzeugt einen neuen Login-Code.
 *
 * Frühere Codes derselben Adresse werden dabei **nicht** mehr abgeschaltet.
 * Genau das war eine der Ursachen der wiederkehrenden Anmeldeprobleme: Wer
 * die Code-Mail öffnete, dort auf „Einloggen" tippte und auf der Seite noch
 * einmal einen Code anforderte, machte damit genau den Code unbrauchbar, den
 * er gerade vor sich hatte. Es gilt jetzt schlicht: jeder Code, den wir in
 * den letzten 30 Minuten an diese Adresse geschickt haben, funktioniert.
 */
export async function issueLoginCode(env: Env, email: string): Promise<string> {
  const db = getDb(env)
  const mail = normalizeEmail(email)
  const ts = nowSec()

  const code = generateCode()
  await db.insert(schema.loginCodes).values({
    id: uid(),
    email: mail,
    codeHash: await hashCode(env, mail, code),
    expiresAt: ts + CODE_TTL_SEC,
    attempts: 0,
    createdAt: ts,
  })
  return code
}

/**
 * Prüft einen Code. Nach 5 Fehlversuchen wird die E-Mail 30 Minuten gesperrt.
 * Die Sperre liegt in rate_limits, damit sie auch neue Code-Anforderungen bremst.
 *
 * Zwei Dinge sind hier bewusst großzügig, weil genau sie die gescheiterten
 * Anmeldungen verursacht haben:
 *
 *   · Es zählt nicht nur der zuletzt verschickte Code, sondern jeder der
 *     letzten `CODE_WINDOW` — wer zwei Code-Mails im Postfach hat, kommt mit
 *     beiden hinein, solange sie nicht abgelaufen sind.
 *   · Ein bereits benutzter Code wird bis zum Ablauf weiter angenommen. Ein
 *     zweiter Tipp auf „Einloggen", ein Neuladen oder die Zurück-Taste
 *     schickt dasselbe Formular ein zweites Mal ab; vorher endete das in
 *     „Es liegt kein gültiger Code vor", obwohl die Anmeldung im selben
 *     Moment geklappt hatte. Ein Sicherheitsgewinn war die Einmaligkeit
 *     nicht: der Code läuft ohnehin nach 30 Minuten ab, liegt im selben
 *     Postfach und ist achtstellig.
 */
export async function verifyLoginCode(env: Env, email: string, code: string): Promise<CodeCheck> {
  const db = getDb(env)
  const mail = normalizeEmail(email)
  const ts = nowSec()

  const blocked = await getBlock(env, `login:${mail}`)
  if (blocked > ts) return { ok: false, reason: 'gesperrt', retryInMin: Math.ceil((blocked - ts) / 60) }

  const recent = await db
    .select()
    .from(schema.loginCodes)
    .where(eq(schema.loginCodes.email, mail))
    .orderBy(desc(schema.loginCodes.createdAt))
    .limit(CODE_WINDOW)

  if (!recent.length) return { ok: false, reason: 'unbekannt' }

  const live = recent.filter((row) => row.expiresAt >= ts)
  if (!live.length) return { ok: false, reason: 'abgelaufen' }

  // Der Hash hängt nur an Adresse und Code, nicht an der Zeile — einmal
  // rechnen genügt für alle Kandidaten.
  const candidate = await hashCode(env, mail, code.trim())
  const hit = live.find((row) => timingSafeEqual(candidate, row.codeHash))

  if (hit) {
    if (!hit.usedAt) {
      await db.update(schema.loginCodes).set({ usedAt: ts }).where(eq(schema.loginCodes.id, hit.id))
    }
    await clearBlock(env, `login:${mail}`)
    return { ok: true }
  }

  // Fehlversuche zählen über alle noch gültigen Codes zusammen, sonst setzte
  // ein neu angeforderter Code das Kontingent zurück.
  const spent = live.reduce((sum, row) => sum + row.attempts, 0) + 1
  await db
    .update(schema.loginCodes)
    .set({ attempts: live[0].attempts + 1 })
    .where(eq(schema.loginCodes.id, live[0].id))

  if (spent >= MAX_ATTEMPTS) {
    await setBlock(env, `login:${mail}`, ts + LOCKOUT_SEC)
    return { ok: false, reason: 'gesperrt', retryInMin: LOCKOUT_SEC / 60 }
  }
  return { ok: false, reason: 'falsch' }
}

/* ------------------------------------------------------------- Rate-Limits */

async function getBlock(env: Env, bucket: string): Promise<number> {
  const db = getDb(env)
  const [row] = await db
    .select()
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.bucket, bucket))
    .limit(1)
  return row?.blockedUntil ?? 0
}

async function setBlock(env: Env, bucket: string, until: number) {
  await env.DB.prepare(
    `INSERT INTO rate_limits (id, bucket, count, window_start, blocked_until)
     VALUES (?1, ?2, 0, ?3, ?4)
     ON CONFLICT(bucket) DO UPDATE SET blocked_until = ?4`,
  )
    .bind(uid(), bucket, nowSec(), until)
    .run()
}

async function clearBlock(env: Env, bucket: string) {
  await env.DB.prepare(`UPDATE rate_limits SET blocked_until = NULL, count = 0 WHERE bucket = ?1`)
    .bind(bucket)
    .run()
}

/**
 * Fenster-Zähler: erlaubt `limit` Ereignisse pro `windowSec`.
 * Rückgabe true = erlaubt.
 */
export async function consumeRateLimit(
  env: Env,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const ts = nowSec()
  await env.DB.prepare(
    `INSERT INTO rate_limits (id, bucket, count, window_start)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(bucket) DO UPDATE SET
       count        = CASE WHEN rate_limits.window_start < ?4 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < ?4 THEN ?3 ELSE rate_limits.window_start END`,
  )
    .bind(uid(), bucket, ts, ts - windowSec)
    .run()

  const row = await env.DB.prepare(`SELECT count FROM rate_limits WHERE bucket = ?1`)
    .bind(bucket)
    .first<{ count: number }>()
  return (row?.count ?? 0) <= limit
}

/* ---------------------------------------------------------------- Sessions

   Ein Session-Cookie PRO ROLLE statt eines einzigen für die ganze Seite.

   Früher gab es nur `nm_session`: wer im selben Browser als Kunde eingeloggt
   war, galt damit für /admin und /work automatisch als „falsche Rolle" und
   sah dort nur noch 403. Mit einem Cookie je Rolle laufen Admin-, Kunden-
   und Clipper-Sitzung im selben Browser nebeneinander, ohne einander zu
   überschreiben oder zu blockieren.

   Das alte Cookie wird beim ersten Zugriff auf das rollenspezifische
   umgezogen — bestehende Logins bleiben gültig.
*/

const ROLES: Role[] = ['admin', 'customer', 'clipper', 'creator', 'agency']

export const sessionCookieFor = (role: Role) => `${SESSION_COOKIE}_${role}`

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const

export async function createSession(
  env: Env,
  c: Context,
  userId: string,
  role: Role,
): Promise<void> {
  const db = getDb(env)
  const ts = nowSec()
  const token = generateToken()

  await db.insert(schema.sessions).values({
    id: uid(),
    userId,
    tokenHash: await hashToken(env, token),
    expiresAt: ts + SESSION_DAYS * 86400,
    createdAt: ts,
  })
  await db.update(schema.users).set({ lastLoginAt: ts }).where(eq(schema.users.id, userId))

  setCookie(c, sessionCookieFor(role), token, { ...COOKIE_OPTS, maxAge: SESSION_DAYS * 86400 })
}

/**
 * Meldet eine Rolle ab — oder, ohne Angabe, alle. Das Abmelden im
 * Kundenbereich lässt eine parallele Admin-Sitzung im selben Browser
 * dadurch unangetastet.
 */
export async function destroySession(env: Env, c: Context, role?: Role): Promise<void> {
  const names = role ? [sessionCookieFor(role)] : ROLES.map(sessionCookieFor)
  // Alt-Cookies hängen an keinem Bereich — sie werden immer mit abgeräumt.
  names.push(...Object.keys(getCookie(c)).filter(isStraySessionCookie))

  const db = getDb(env)
  for (const name of names) {
    const token = getCookie(c, name)
    if (token) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.tokenHash, await hashToken(env, token)))
    }
    deleteCookie(c, name, { path: '/' })
  }
}

/** Löst ein Session-Token zum Nutzer auf; abgelaufene Sitzungen werden gelöscht. */
async function sessionUser(env: Env, token: string | undefined): Promise<User | null> {
  if (!token) return null

  const db = getDb(env)
  const tokenHash = await hashToken(env, token)
  const [row] = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .limit(1)

  if (!row) return null
  if (row.expiresAt < nowSec()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))
    return null
  }
  return row.user
}

/**
 * Der angemeldete Nutzer für eine Rolle — oder, ohne Rolle, der erste in der
 * Reihenfolge Admin, Kunde, Clipper (für rollenfreie Einstiege wie
 * /dashboard). Die Rolle im Cookie-Namen muss zur Rolle des Kontos passen,
 * ein fremdes Token im falschen Cookie zählt nicht.
 */
export async function currentUser(env: Env, c: Context, role?: Role): Promise<User | null> {
  for (const r of role ? [role] : ROLES) {
    const user = await sessionUser(env, getCookie(c, sessionCookieFor(r)))
    if (user?.role === r) return user
  }

  /*
   * Cookies ohne gültigen Rollennamen akzeptieren und dabei auf das
   * Rollen-Cookie umziehen, damit bestehende Logins jede Umstellung
   * überleben. Das betrifft das Alt-Cookie `nm_session` ebenso wie ein
   * Cookie, dessen Rolle inzwischen anders heißt: die Sitzung dahinter hängt
   * an der Nutzer-ID, und die Rolle kommt ohnehin frisch aus `users`.
   */
  let found: User | null = null
  for (const [name, token] of Object.entries(getCookie(c))) {
    if (!isStraySessionCookie(name)) continue
    const legacy = await sessionUser(env, token)
    deleteCookie(c, name, { path: '/' })
    if (!legacy) continue
    setCookie(c, sessionCookieFor(legacy.role), token, {
      ...COOKIE_OPTS,
      maxAge: SESSION_DAYS * 86400,
    })
    if (!found && (!role || legacy.role === role)) found = legacy
  }
  return found
}

const ROLE_COOKIES = new Set<string>(ROLES.map(sessionCookieFor))

/** Das Alt-Cookie oder ein Sitzungs-Cookie, dessen Rollenname es nicht mehr gibt. */
const isStraySessionCookie = (name: string) =>
  name === SESSION_COOKIE || (name.startsWith(`${SESSION_COOKIE}_`) && !ROLE_COOKIES.has(name))

/* -------------------------------------------------------------- Middleware */

const HOME: Record<Role, string> = {
  admin: '/admin',
  customer: '/app',
  clipper: '/work',
  creator: '/kampagnen',
  agency: '/collaboration',
}

export const homeFor = (role: Role) => HOME[role]

/**
 * Reihenfolge der Rollen, wenn eine Route mehrere zulässt (/api/app und
 * /api/work). Hält derselbe Browser zwei passende Sitzungen — etwa Kunde
 * und Creator —, entscheidet die Seite, von der die Anfrage kommt: Wer unter
 * /kampagnen „Neue Kampagne“ drückt, legt sie in seinem Creator-Zugang an
 * und nicht im Kundenkonto daneben. Ohne Referer bleibt die Reihenfolge.
 */
function byArea(c: Context<AppEnv>, roles: Role[]): Role[] {
  if (roles.length < 2) return roles
  let path = ''
  try {
    path = new URL(c.req.header('referer') ?? '').pathname
  } catch {
    return roles
  }
  const area = roles.find((r) => path === HOME[r] || path.startsWith(`${HOME[r]}/`))
  return area ? [area, ...roles.filter((r) => r !== area)] : roles
}

/**
 * Schützt eine Route: durch kommt, wer für eine der geforderten Rollen
 * angemeldet ist. Jede Rolle hat ihr eigenes Session-Cookie — eine Anmeldung
 * in einem anderen Bereich desselben Browsers zählt hier schlicht als „nicht
 * angemeldet" und führt zum Login des Bereichs, nicht mehr zu 403.
 *
 * Ohne Login hängt das Ziel an der geforderten Rolle:
 *
 *   · Admin-Bereich → die Anmeldung mit E-Mail und Passwort, und zwar direkt
 *     unter der aufgerufenen Adresse. `nikkimedia.co/admin` bleibt also
 *     `nikkimedia.co/admin` und zeigt dort die beiden Felder — Admin-Konten
 *     sind vom Code-Login ausgeschlossen (siehe verifyPasswordLogin).
 *   · Kunden und Clipper → weiterhin /login mit E-Mail-Code.
 */
export function requireRole(...roles: Role[]) {
  const adminOnly = roles.length === 1 && roles[0] === 'admin'

  return async (c: Context<AppEnv>, next: () => Promise<void>) => {
    let user: User | null = null
    for (const role of byArea(c, roles)) {
      user = await currentUser(c.env, c, role)
      if (user) break
    }

    if (!user) {
      const target = new URL(c.req.url)
      const wanted = target.pathname + target.search

      if (c.req.path.startsWith('/api/')) return c.json({ error: 'Nicht angemeldet' }, 401)

      if (adminOnly) {
        // Kein Redirect: das Formular erscheint unter der aufgerufenen Adresse.
        return c.html(loginPage({ stage: 'passwort', next: wanted, lang: 'en' }), 401)
      }
      return c.redirect(`/login?next=${encodeURIComponent(wanted)}`, 302)
    }

    c.set('user', user)
    await next()
  }
}
