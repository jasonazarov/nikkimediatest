import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, nowSec, schema } from '../lib/db'
import {
  consumeRateLimit,
  createSession,
  currentUser,
  destroySession,
  findUserByEmail,
  homeFor,
  issueLoginCode,
  normalizeEmail,
  verifyLoginCode,
  verifyPasswordLogin,
  agencyPasswordLogin,
} from '../lib/auth'
import { audit } from '../lib/audit'
import { mailLoginCode, mailLoginTrouble } from '../lib/mail'
import { loginPage } from '../views/login'
import type { AppEnv } from '../lib/types'
import type { Context } from 'hono'
import type { Role, User } from '../db/schema'

export const authRoutes = new Hono<AppEnv>()

/**
 * Nur eigene Pfade zulassen — sonst wäre ?next= eine offene Weiterleitung.
 * Backslash und Steuerzeichen fallen mit raus: Browser lesen `/\evil.com`
 * und `/<Tab>/evil.com` als `//evil.com`, also als fremden Host.
 */
const safeNext = (value: string | undefined): string | undefined =>
  value && value.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x1f\x7f]/.test(value)
    ? value
    : undefined

/**
 * Welche Rolle ein Ziel-Pfad verlangt. Entscheidet, welche der parallel
 * möglichen Sitzungen zählt — wer als Kunde eingeloggt ist und /admin
 * ansteuert, soll das Admin-Login sehen, nicht in den Kundenbereich
 * umgeleitet werden.
 */
const roleForNext = (next: string | undefined): Role | undefined =>
  next?.startsWith('/admin')
    ? 'admin'
    : next?.startsWith('/work')
      ? 'clipper'
      : next?.startsWith('/app')
        ? 'customer'
        : next?.startsWith('/kampagnen')
          ? 'creator'
          : next?.startsWith('/collaboration')
            ? 'agency'
            : undefined

/*
 * Sprache der Anmeldeseite: Der Code-Login ist für Kunden, Clipper und
 * Creator deutsch. Ein `?lang=en` aus älteren Clipper-Mails wird ignoriert.
 * Englisch ist nur noch der Passwort-Login der Administration.
 */

/**
 * Adresse der Code-Eingabe. Sie ist eine eigene GET-Seite, damit nach dem
 * Absenden der E-Mail-Adresse umgeleitet wird (Post/Redirect/Get).
 *
 * Der Grund ist handfest: vorher war die Code-Eingabe die direkte Antwort auf
 * das abgeschickte Formular. Jedes Neuladen, jedes Zurück und jede
 * Wiederherstellung der Seite durch den Browser schickte damit dasselbe
 * Formular erneut ab — und jedes Mal ging ein neuer Code raus, der den
 * vorigen ersetzte. Wer zwischendurch ins Postfach wechselte, kam mit einem
 * Code zurück, der schon nicht mehr galt.
 */
const codeStageUrl = (email: string, next: string | undefined, sent: boolean) => {
  const q = new URLSearchParams({ email })
  if (next) q.set('next', next)
  if (sent) q.set('sent', '1')
  return `/login/code?${q.toString()}`
}

const clientIp = (c: { req: { header: (name: string) => string | undefined } }) =>
  c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unbekannt'

/** Session setzen, Einladung ggf. annehmen, ins jeweilige Dashboard schicken. */
async function completeLogin(
  c: Context<AppEnv>,
  user: User,
  next: string | undefined,
  how: 'code' | 'passwort',
) {
  /*
   * Erster nachgewiesener Login dieser Adresse: alle älteren Sitzungen
   * fallen weg. Ein Selbsteintrag über die Stepper kann eine Sitzung
   * bekommen, bevor jemand die Adresse bestätigt hat — wer eine fremde
   * Adresse vorab eingetragen hat, säße sonst 30 Tage lang mit im Konto,
   * auch nachdem der echte Inhaber übernommen hat.
   */
  if (!user.verifiedAt) {
    const db = getDb(c.env)
    await db.update(schema.users).set({ verifiedAt: nowSec() }).where(eq(schema.users.id, user.id))
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id))
  }

  await createSession(c.env, c, user.id, user.role)

  // Eine Einladung gilt mit dem ersten Login als angenommen. Creator haben
  // dieselbe Zeile in `clippers` — über sie bekommen sie Kampagnen
  // zugeordnet. Jobs gibt es dabei keine: die ordnet nur der Administrator zu.
  if (user.role === 'clipper' || user.role === 'creator') {
    await getDb(c.env)
      .update(schema.clippers)
      .set({ status: 'aktiv' })
      .where(eq(schema.clippers.userId, user.id))
  }

  await audit(c.env, {
    actorId: user.id,
    action: `login.success.${how}`,
    entity: 'user',
    entityId: user.id,
  })
  return c.redirect(next ?? homeFor(user.role), 302)
}

authRoutes.get('/login', async (c) => {
  const next = safeNext(c.req.query('next'))
  const wanted = roleForNext(next)

  // Nur eine Sitzung der passenden Rolle leitet weiter. Eine Anmeldung in
  // einem anderen Bereich desselben Browsers steht dem Login nicht im Weg.
  if (wanted) {
    if (await currentUser(c.env, c, wanted)) return c.redirect(next!, 302)
  } else {
    const user = await currentUser(c.env, c)
    if (user) return c.redirect(homeFor(user.role), 302)
  }

  // Wer in den Admin-Bereich will, braucht Passwort statt Code — auch wenn er
  // über einen alten Link auf /login?next=/admin landet. Der Passwort-Login
  // ist ausschließlich für Admins — deshalb immer englisch.
  return c.html(
    loginPage({
      stage: wanted === 'admin' ? 'passwort' : 'email',
      email: c.req.query('email') ?? '',
      next,
      lang: wanted === 'admin' ? 'en' : 'de',
    }),
  )
})

/* -------------------------------------------------- Admin-Login mit Passwort

   Bewusst eine eigene Seite und eine eigene Route. Kunden und Clipper
   sehen auf /login unverändert nur das E-Mail-Feld — für sie bleibt der
   achtstellige Code der einzige Weg. Die Rollenprüfung selbst sitzt in
   verifyPasswordLogin, nicht hier.

   Der Admin-Bereich läuft komplett auf Englisch, deshalb ist diese Seite es
   auch — unabhängig von einem etwaigen ?lang= in der Adresse.
   -------------------------------------------------------------------------- */

authRoutes.get('/login/admin', async (c) => {
  const next = safeNext(c.req.query('next'))
  if (await currentUser(c.env, c, 'admin')) return c.redirect(next ?? '/admin', 302)

  return c.html(loginPage({ stage: 'passwort', email: c.req.query('email') ?? '', next, lang: 'en' }))
})

authRoutes.post('/login/admin', async (c) => {
  const form = await c.req.parseBody()
  const email = normalizeEmail(String(form.email ?? ''))
  const password = String(form.password ?? '')
  const next = safeNext(String(form.next ?? '') || undefined)

  const fail = (error: string) => c.html(loginPage({ stage: 'passwort', email, next, error, lang: 'en' }))

  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || !password) {
    return fail('Please enter an email address and password.')
  }

  if (!(await consumeRateLimit(c.env, `pwreq:${clientIp(c)}`, 20, 3600))) {
    return fail('Too many requests. Please try again in an hour.')
  }

  const check = await verifyPasswordLogin(c.env, email, password)
  if (!check.ok) {
    return fail(
      check.reason === 'gesperrt'
        ? `Too many failed attempts. Please try again in ${check.retryInMin ?? 30} minutes.`
        : 'Email address or password is incorrect.',
    )
  }

  const db = getDb(c.env)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, check.userId)).limit(1)
  if (!user) return fail('Email address or password is incorrect.')

  return completeLogin(c, user, next, 'passwort')
})

/* ------------------------------------------------------------ Demo-Konten

   Die Demo-Konten (Agentur, Creator, Clipper; siehe lib/demo.ts) haben kein
   Postfach, ihre Zugangsdaten werden weitergegeben. Deshalb E-Mail und
   Passwort, aber NUR für Konten mit `users.demo = 1`. Jedes andere Konto
   bekommt hier dieselbe Absage wie ein falsches Passwort.
   -------------------------------------------------------------------------- */

authRoutes.get('/login/demo', async (c) => {
  return c.html(loginPage({ stage: 'demo', email: c.req.query('email') ?? '' }))
})

authRoutes.post('/login/demo', async (c) => {
  const form = await c.req.parseBody()
  const email = normalizeEmail(String(form.email ?? ''))
  const password = String(form.password ?? '')
  const fail = (error: string) => c.html(loginPage({ stage: 'demo', email, error }))

  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || !password) {
    return fail('Bitte gib E-Mail-Adresse und Passwort ein.')
  }
  if (!(await consumeRateLimit(c.env, `pwreq:${clientIp(c)}`, 20, 3600))) {
    return fail('Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.')
  }

  const check = await verifyPasswordLogin(c.env, email, password, (u) => u.demo === 1 && u.role !== 'admin')
  if (!check.ok) {
    return fail(
      check.reason === 'gesperrt'
        ? `Zu viele Fehlversuche. Bitte versuche es in ${check.retryInMin ?? 30} Minuten erneut.`
        : 'E-Mail-Adresse oder Passwort ist falsch.',
    )
  }

  const [user] = await getDb(c.env).select().from(schema.users).where(eq(schema.users.id, check.userId)).limit(1)
  if (!user) return fail('E-Mail-Adresse oder Passwort ist falsch.')
  return completeLogin(c, user, homeFor(user.role), 'passwort')
})

/* --------------------------------------------- Agentur-Konten mit Passwort

   Vorgabe des Auftraggebers (November 2026): ein Agentur-Konto, dem der
   Administrator ein Passwort gesetzt hat (scripts/agentur-konto.mjs), meldet
   sich mit E-Mail und Passwort an statt mit dem Code per Mail. Kein Demo-Konto:
   echte Daten, und der Zugang folgt denselben Regeln wie bei jedem anderen
   Agentur-Lead (kalt, bis der Administrator ihn warm setzt oder freigibt).
   Jedes andere Konto bekommt hier dieselbe Absage wie ein falsches Passwort.
   -------------------------------------------------------------------------- */

authRoutes.get('/login/passwort', async (c) => {
  const next = safeNext(c.req.query('next'))
  if (await currentUser(c.env, c, 'agency')) return c.redirect(next ?? homeFor('agency'), 302)
  return c.html(loginPage({ stage: 'konto', email: c.req.query('email') ?? '', next }))
})

authRoutes.post('/login/passwort', async (c) => {
  const form = await c.req.parseBody()
  const email = normalizeEmail(String(form.email ?? ''))
  const password = String(form.password ?? '')
  const next = safeNext(String(form.next ?? '') || undefined)
  const fail = (error: string) => c.html(loginPage({ stage: 'konto', email, next, error }))

  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || !password) {
    return fail('Bitte gib E-Mail-Adresse und Passwort ein.')
  }
  if (!(await consumeRateLimit(c.env, `pwreq:${clientIp(c)}`, 20, 3600))) {
    return fail('Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.')
  }

  const check = await verifyPasswordLogin(c.env, email, password, agencyPasswordLogin)
  if (!check.ok) {
    return fail(
      check.reason === 'gesperrt'
        ? `Zu viele Fehlversuche. Bitte versuche es in ${check.retryInMin ?? 30} Minuten erneut.`
        : 'E-Mail-Adresse oder Passwort ist falsch.',
    )
  }

  const [user] = await getDb(c.env).select().from(schema.users).where(eq(schema.users.id, check.userId)).limit(1)
  if (!user) return fail('E-Mail-Adresse oder Passwort ist falsch.')
  // Nur in den Agentur-Bereich: ein `next` woandershin führte ohnehin zur Anmeldung zurück.
  return completeLogin(c, user, next?.startsWith('/collaboration') ? next : homeFor(user.role), 'passwort')
})

/* ------------------------------------------------------ Login per E-Mail-Code

   Der Weg für Kunden und Clipper — und ausschließlich für die.

   Admin-Konten sind hier bewusst ausgeschlossen: für sie gibt es nur den
   Passwort-Login unter /login/admin. Ein Code wird für sie weder erzeugt
   noch verschickt, und ein vorhandener Code würde auch nicht angenommen.
   -------------------------------------------------------------------------- */

/** Kunden- und Clipper-Konten dürfen sich per Code anmelden, Admins nicht. */
const darfCodeLogin = (user: User | undefined): user is User =>
  !!user && user.role !== 'admin'

/** Schritt 1 — E-Mail entgegennehmen und Code verschicken. */
authRoutes.post('/login', async (c) => {
  const form = await c.req.parseBody()
  const email = normalizeEmail(String(form.email ?? ''))
  const next = safeNext(String(form.next ?? '') || undefined)

  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return c.html(
      loginPage({
        stage: 'email',
        email,
        next,
        error: 'Bitte gib eine gültige E-Mail-Adresse ein.',
      }),
    )
  }

  const user = await findUserByEmail(c.env, email)

  // Missbrauch bremsen, ohne zu verraten, ob die Adresse existiert.
  //
  // 20 statt 10 je Stunde: Hinter einer IPv4-Adresse kann ein ganzes Büro
  // oder ein Mobilfunk-NAT stecken. Zehn Anforderungen waren dort schnell
  // aufgebraucht — und dann stand die Sperre vor Leuten, die nichts falsch
  // gemacht hatten.
  const allowed = await consumeRateLimit(c.env, `codereq:${clientIp(c)}`, 20, 3600)
  if (!allowed) {
    return c.html(
      loginPage({
        stage: 'email',
        email,
        next,
        error: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.',
      }),
    )
  }

  // Demo-Konten haben kein Postfach, sie melden sich mit Passwort an.
  if (user?.demo === 1 && user.role !== 'admin') {
    return c.redirect(`/login/demo?email=${encodeURIComponent(email)}`, 303)
  }

  // Agentur-Konten mit Passwort (vom Administrator gesetzt): kein Code per Mail,
  // sondern gleich das Passwort-Feld.
  if (user && agencyPasswordLogin(user)) {
    return c.redirect(`/login/passwort?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`, 303)
  }

  if (darfCodeLogin(user)) {
    const code = await issueLoginCode(c.env, email)
    const sent = await mailLoginCode(c.env, { email, displayName: user.fullName, code })

    // Der Versand scheitert lautlos — für den Wartenden sieht ein kaputter
    // Mailversand genauso aus wie eine langsame Mail. Deshalb steht der
    // Fehlschlag im Protokoll und geht als Warnung an die Administration.
    // Höchstens drei solcher Meldungen je Stunde — hakt der Anbieter für
    // alle, soll das Postfach nicht zulaufen.
    if (!sent) {
      console.error('[login] Code-Mail nicht verschickt an', email)
      if (await consumeRateLimit(c.env, 'mailalarm', 3, 3600)) await mailLoginTrouble(c.env, email)
    }
    await audit(c.env, {
      actorId: user.id,
      action: sent ? 'login.code_requested' : 'login.code_mail_failed',
      entity: 'user',
      entityId: user.id,
    })
  }

  // Gleiche Antwort für bekannte und unbekannte Adressen (keine Kontoauskunft).
  // 303 statt einer direkt gerenderten Seite: nur so löst ein Neuladen der
  // Code-Eingabe nicht erneut diesen Versand aus (siehe codeStageUrl).
  return c.redirect(codeStageUrl(email, next, true), 303)
})

/**
 * Schritt 2a — die Seite mit dem Code-Feld.
 *
 * Sie darf beliebig oft aufgerufen, neu geladen und aus dem Verlauf
 * zurückgeholt werden: sie verschickt nichts. Auf diese Adresse zeigt auch
 * der Knopf in der Code-Mail, damit ein Tipp darauf direkt beim Code-Feld
 * landet — und nicht auf der Seite, die einen neuen Code anfordert.
 */
authRoutes.get('/login/code', async (c) => {
  const email = normalizeEmail(c.req.query('email') ?? '')
  const next = safeNext(c.req.query('next'))
  const wanted = roleForNext(next)

  if (wanted) {
    if (await currentUser(c.env, c, wanted)) return c.redirect(next!, 302)
  } else {
    const signedIn = await currentUser(c.env, c)
    if (signedIn) return c.redirect(homeFor(signedIn.role), 302)
  }

  if (!email) return c.redirect('/login', 302)

  return c.html(
    loginPage({
      stage: 'code',
      email,
      next,
      notice:
        c.req.query('sent') === '1'
          ? 'Wenn ein Zugang zu dieser Adresse existiert, ist der Code unterwegs.'
          : undefined,
    }),
  )
})

/** Schritt 2 — Code prüfen, Session setzen, nach Rolle weiterleiten. */
authRoutes.post('/login/code', async (c) => {
  const form = await c.req.parseBody()
  const email = normalizeEmail(String(form.email ?? ''))
  const code = String(form.code ?? '').replace(/\D/g, '')
  const next = safeNext(String(form.next ?? '') || undefined)

  const account = await findUserByEmail(c.env, email)

  const NO_CODE = 'Es liegt kein gültiger Code vor. Fordere bitte einen neuen an.'

  // Wer die Sitzung schon hat, gehört ins Dashboard und nicht auf eine
  // Fehlermeldung. Ein Doppeltipp auf „Einloggen", die Zurück-Taste oder ein
  // Neuladen schickt dieses Formular ein zweites Mal ab — genau dabei sahen
  // Clipper bisher „Es liegt kein gültiger Code vor", obwohl die
  // Anmeldung eine Sekunde zuvor durchgelaufen war.
  if (account && (await currentUser(c.env, c, account.role))?.id === account.id) {
    return c.redirect(next ?? homeFor(account.role), 303)
  }

  const WRONG = 'Der Code stimmt nicht. Bitte prüfe deine E-Mail.'

  // Admins kommen hier nicht durch, auch nicht mit einem gültigen Code.
  // Die Prüfung steht vor verifyLoginCode, damit ein Code dabei nicht
  // stillschweigend verbraucht wird.
  if (!darfCodeLogin(account)) {
    return c.html(loginPage({ stage: 'code', email, next, error: NO_CODE }))
  }

  // Was gar kein achtstelliger Code sein kann — ein leeres Feld, ein
  // abgeschnittener Einfügevorgang — kostet keinen der fünf Versuche.
  if (code.length !== 8) {
    return c.html(loginPage({ stage: 'code', email, next, error: WRONG }))
  }

  const result = await verifyLoginCode(c.env, email, code)
  if (!result.ok) {
    const minutes = result.retryInMin ?? 30
    const message: Record<string, string> = {
      gesperrt: `Zu viele Fehlversuche. Bitte versuche es in ${minutes} Minuten erneut.`,
      abgelaufen: 'Der Code ist abgelaufen. Fordere bitte einen neuen an.',
      falsch: WRONG,
      unbekannt: NO_CODE,
    }
    return c.html(loginPage({ stage: 'code', email, next, error: message[result.reason] }))
  }

  return completeLogin(c, account, next, 'code')
})

/**
 * Meldet nur den Bereich ab, aus dem der Klick kommt (verstecktes Feld
 * `area` im Logout-Formular). Ohne das Feld werden alle Sitzungen beendet.
 */
authRoutes.post('/logout', async (c) => {
  const form = await c.req.parseBody()
  const raw = String(form.area ?? '')
  const area: Role | undefined =
    raw === 'admin' || raw === 'customer' || raw === 'clipper' || raw === 'creator' || raw === 'agency'
      ? raw
      : undefined

  const user = await currentUser(c.env, c, area)
  await destroySession(c.env, c, area)
  if (user) await audit(c.env, { actorId: user.id, action: 'logout', entity: 'user', entityId: user.id })
  return c.redirect('/', 302)
})

authRoutes.get('/logout', (c) => c.redirect('/login', 302))
