import { eq } from 'drizzle-orm'
import { getDb, schema, uid } from './db'
import { findUserByEmail, issueLoginCode, normalizeEmail, verifyLoginCode } from './auth'
import type { Env } from './types'

/* --------------------------------------------------------------------------
   Selbsttest der Anmeldung

   Ein kaputter Login fällt sonst erst auf, wenn jemand davorsteht und nicht
   hineinkommt — und dann meldet er es im besten Fall. Dieser Test geht den
   Weg selbst: Code ausstellen, Code einlösen, denselben Code ein zweites Mal
   einlösen, älteren Code neben neuerem prüfen, falschen Code abweisen. Dazu
   die beiden Voraussetzungen, ohne die der ganze Weg nichts nützt: ein
   erreichbarer Mailversand und antwortende Anmeldeseiten.

   Er läuft im Viertelstundentakt aus `index.ts` und auf Abruf unter
   GET /api/admin/health/login.

   Der Kanarienvogel trägt bewusst KEIN Konto: `issueLoginCode` und
   `verifyLoginCode` brauchen keines, es geht also keine Mail an eine echte
   Adresse raus. Am Ende wird beides wieder abgeräumt.

   Jeder Lauf bekommt seine EIGENE Testadresse. Um 07:00 UTC feuern beide
   Cron-Zeitpläne zugleich, dazu kann jederzeit der Abruf im Admin-Bereich
   kommen. Mit einer gemeinsamen Adresse räumte der eine Lauf dem anderen
   die Codes weg — „Derselbe Code ein zweites Mal: unbekannt", jeden Morgen
   ein falscher Alarm. Bleibt ein Lauf hängen, nimmt der tägliche Lauf die
   abgelaufenen Codes mit.
   -------------------------------------------------------------------------- */

const canary = () => `login-selbsttest+${uid().slice(0, 8)}@nikkimedia.co`

export interface Check {
  name: string
  ok: boolean
  detail?: string
}

export interface SelfTestResult {
  ok: boolean
  checks: Check[]
}

/**
 * @param seite Ruft eine Seite dieses Workers auf. Bewusst hereingereicht
 *   statt hier per `fetch` geholt: Der Worker kann seine eigene Adresse
 *   nicht über das Netz erreichen — der Versuch endete live in HTTP 522 und
 *   damit in einem falschen Alarm. Der Aufrufer reicht deshalb den
 *   fetch-Handler selbst herein, die Seite wird im selben Prozess gerendert.
 *   Fehlt der Parameter, entfallen diese beiden Prüfungen.
 */
export async function loginSelfTest(
  env: Env,
  seite?: (pfad: string) => Promise<Response>,
): Promise<SelfTestResult> {
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail?: string) => {
    checks.push(detail ? { name, ok, detail } : { name, ok })
  }

  const db = getDb(env)
  const mail = normalizeEmail(canary())

  try {
    // Sollte die Adresse je ein echtes Konto bekommen, bricht der Test ab,
    // statt einem Menschen Codes zu schicken.
    if (await findUserByEmail(env, mail)) {
      add('Testadresse ohne Konto', false, `${mail} gehört inzwischen einem Konto`)
      return { ok: false, checks }
    }

    const first = await issueLoginCode(env, mail)
    add('Code wird erzeugt', /^\d{8}$/.test(first), first.length === 8 ? undefined : first)

    const richtig = await verifyLoginCode(env, mail, first)
    add('Richtiger Code wird angenommen', richtig.ok, richtig.ok ? undefined : richtig.reason)

    // Der Doppeltipp — genau hier stand früher „kein gültiger Code".
    const nochmal = await verifyLoginCode(env, mail, first)
    add('Derselbe Code ein zweites Mal', nochmal.ok, nochmal.ok ? undefined : nochmal.reason)

    // Zwei Mails im Postfach: beide müssen funktionieren.
    const second = await issueLoginCode(env, mail)
    const alt = await verifyLoginCode(env, mail, first)
    const neu = await verifyLoginCode(env, mail, second)
    add('Älterer Code bleibt gültig', alt.ok, alt.ok ? undefined : alt.reason)
    add('Neuer Code gilt', neu.ok, neu.ok ? undefined : neu.reason)

    const falsch = await verifyLoginCode(env, mail, first === '00000000' ? '11111111' : '00000000')
    add('Falscher Code wird abgewiesen', !falsch.ok, falsch.ok ? 'wurde angenommen' : undefined)

    add('Mailversand eingerichtet', !!env.RESEND_API_KEY, env.RESEND_API_KEY ? undefined : 'RESEND_API_KEY fehlt')

    // Die Seiten selbst — ohne sie nützt der beste Code nichts.
    if (seite) {
      for (const [name, pfad] of [
        ['Anmeldeseite antwortet', '/login'],
        ['Code-Seite antwortet', `/login/code?email=${encodeURIComponent(mail)}`],
      ] as const) {
        try {
          const res = await seite(pfad)
          add(name, res.status === 200, res.status === 200 ? undefined : `HTTP ${res.status}`)
        } catch (err) {
          add(name, false, String(err))
        }
      }
    }
  } catch (err) {
    add('Selbsttest läuft durch', false, String(err))
  } finally {
    await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, mail))
    await db.delete(schema.rateLimits).where(eq(schema.rateLimits.bucket, `login:${mail}`))
  }

  return { ok: checks.every((check) => check.ok), checks }
}
