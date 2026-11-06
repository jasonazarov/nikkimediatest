import { processDrafts } from './lib/drafts'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm'
import { getDb, nowSec, schema } from './lib/db'
import { consumeRateLimit, currentUser, homeFor } from './lib/auth'
import { loginSelfTest } from './lib/selftest'
import { mailLoginBroken } from './lib/mail'
import { checkStorageWarning } from './lib/domain'
import { catchUp } from './lib/publisher'
import { syncMetrics } from './lib/metrics'
import { deleteObject } from './lib/r2'
import { publicRoutes } from './routes/public'
import { authRoutes } from './routes/auth'
import { apiRoutes } from './routes/api'
import { appRoutes } from './routes/app'
import { adminRoutes } from './routes/admin'
import { workRoutes } from './routes/work'
import { campaignRoutes } from './routes/campaigns'
import { mediaRoutes } from './routes/media'
import { creatorApi } from './routes/creator-api'
import { collaborationApi, collaborationRoutes } from './routes/collaboration'
import { marketplaceApi } from './routes/marketplace'
import type { AppEnv } from './lib/types'

const app = new Hono<AppEnv>()

/**
 * Es soll genau eine öffentliche Adresse geben: https://nikkimedia.co
 *
 * Jeder andere Host, unter dem der Worker erreichbar ist — allen voran
 * www.nikkimedia.co — leitet dauerhaft dorthin um, statt dieselbe Seite ein
 * zweites Mal auszuliefern. Sonst existierte die Seite unter mehreren Links
 * parallel, was Suchmaschinen als doppelten Inhalt werten.
 *
 * Ausgenommen sind localhost und 127.0.0.1, sonst wäre `wrangler dev` nicht
 * mehr benutzbar.
 */
const CANONICAL_HOST = 'nikkimedia.co'

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  const host = url.hostname

  if (host !== CANONICAL_HOST && host !== 'localhost' && host !== '127.0.0.1') {
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    url.port = ''
    return c.redirect(url.toString(), 301)
  }

  await next()
})

app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=15552000; includeSubDomains',
  }),
)

app.route('/', publicRoutes)
app.route('/', authRoutes)
/*
 * Die Creator-API ist ein eigener Router und NICHT in api.ts eingehängt: dort
 * hängen die Bereiche an ihrer Rollen-Middleware (Kunde, Clipper, Admin), hier
 * soll allein `requireRole('creator')` greifen. Kein Konflikt mit
 * POST /api/creators (dem Selbsteintrag) — Hono trennt an der Pfadgrenze.
 */
app.route('/api/creator', creatorApi)
// Ebenso die API des Collaboration-Bereichs (Agenturen): allein `requireRole('agency')`.
app.route('/api/collaboration', collaborationApi)
// Marktplatz: FAQ-Agent, virale Clips, Investoren-Anfragen (routes/marketplace.ts).
app.route('/api', marketplaceApi)
app.route('/api', apiRoutes)
app.route('/app', appRoutes)
app.route('/admin', adminRoutes)
app.route('/work', workRoutes)
app.route('/kampagnen', campaignRoutes)
app.route('/collaboration', collaborationRoutes)
app.route('/media', mediaRoutes)

/** Bequemer Einstieg: schickt jeden eingeloggten Nutzer in seinen Bereich. */
app.get('/dashboard', async (c) => {
  const user = await currentUser(c.env, c)
  return c.redirect(user ? homeFor(user.role) : '/login', 302)
})

app.notFound((c) =>
  c.html(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Seite nicht gefunden | Nikki Media</title>
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <link rel="stylesheet" href="/assets/tw.css"></head>
     <body class="grid min-h-screen place-items-center bg-black px-6 text-center font-sans text-white">
       <div>
         <p class="text-6xl font-black text-[#2fe08c]">404</p>
         <h1 class="mt-4 text-2xl font-bold">Diese Seite gibt es nicht</h1>
         <a href="/" class="mt-8 inline-block rounded-xl bg-[#2fe08c] px-6 py-3 font-semibold text-[#02160c] hover:bg-[#5eeaa6]">Zur Startseite</a>
       </div>
     </body></html>`,
    404,
  ),
)

app.onError((err, c) => {
  console.error('[worker]', err)
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Serverfehler.' }, 500)
  return c.html(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fehler | Nikki Media</title>
     <link rel="stylesheet" href="/assets/tw.css"></head>
     <body class="grid min-h-screen place-items-center bg-black px-6 text-center font-sans text-white">
       <div><p class="text-6xl font-black text-[#2fe08c]">500</p>
       <h1 class="mt-4 text-2xl font-bold">Da ist etwas schiefgelaufen</h1>
       <a href="/" class="mt-8 inline-block rounded-xl bg-[#2fe08c] px-6 py-3 font-semibold text-[#02160c] hover:bg-[#5eeaa6]">Zur Startseite</a></div>
     </body></html>`,
    500,
  )
})

/**
 * Täglicher Wartungslauf:
 *   1. Speicherwarnung (>100 GB) je Kunde — einmalig pro Kunde
 *   2. Papierkorb älter als 30 Tage endgültig löschen
 *   3. Abgelaufene Sessions und Login-Codes aufräumen
 *   4. Veröffentlichung nachholen, was beim ersten Versuch nicht durchkam
 */
async function scheduledRun(env: AppEnv['Bindings']) {
  const db = getDb(env)
  const ts = nowSec()
  const cutoff = ts - 30 * 86400

  const customers = await db.select({ id: schema.customers.id }).from(schema.customers)
  for (const customer of customers) await checkStorageWarning(env, customer.id)

  const expired = await db
    .select({
      id: schema.rawAssets.id,
      key: schema.rawAssets.r2Key,
      thumb: schema.rawAssets.thumbKey,
      bytes: schema.rawAssets.bytes,
    })
    .from(schema.rawAssets)
    .where(and(isNotNull(schema.rawAssets.deletedAt), lt(schema.rawAssets.deletedAt, cutoff)))
    .limit(500)

  for (const asset of expired) {
    // Das Vorschaubild gehört zur Datei und geht mit ihr — sonst bliebe ein
    // JPEG liegen, auf das nichts mehr zeigt.
    for (const key of [asset.key, asset.thumb]) {
      if (!key) continue
      try {
        await deleteObject(env, key)
      } catch (err) {
        console.error('[cron] R2-Löschung fehlgeschlagen', key, err)
      }
    }
    await db.delete(schema.rawAssets).where(eq(schema.rawAssets.id, asset.id))
  }

  await db
    .delete(schema.folders)
    .where(and(isNotNull(schema.folders.deletedAt), lt(schema.folders.deletedAt, cutoff)))

  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, ts))
  await db.delete(schema.loginCodes).where(lt(schema.loginCodes.expiresAt, ts - 86400))
  await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.windowStart} < ${ts - 7 * 86400}`)

  /*
   * Nachhol-Lauf für die Veröffentlichung. Er ist der Grund, warum das
   * Anlegen eines Projekts nie an der Gegenseite scheitern muss: was dort
   * ausfällt, wird hier eingesammelt statt verloren.
   *
   * Holt nach:
   *   - Videos, die auf verbundene Accounts warteten oder an einem Fehler
   *     hängen blieben
   *   - offene Posts, deren Ausgang noch nicht feststeht
   *   - einzelne Accounts, die beim letzten Versuch scheiterten
   *   - dasselbe für Clips, die Creator zur Verbreitung freigegeben haben
   */
  const caught = await catchUp(env, { deep: true })

  console.log(
    `[cron] fertig: ${expired.length} Dateien endgültig entfernt, ` +
      `${caught.posts} Videos nachveröffentlicht, ${caught.refreshed} Posts nachgefasst, ` +
      `${caught.retried} Accounts nachgereicht (davon ${caught.creator} aus der Verbreitung über Creator)`,
  )
}

/** Der tägliche Lauf. Muss zum Eintrag in `wrangler.toml` passen. */
const DAILY_CRON = '0 7 * * *'

/**
 * Nur der Veröffentlichungs-Nachhol-Lauf, alle 15 Minuten.
 *
 * Warum das nicht beim täglichen Lauf bleiben konnte: der erste echte Clip
 * ging um 15:31 Uhr raus, acht Accounts scheiterten an Zeitüberschreitungen —
 * Fehler, die von selbst vergehen. Der nächste und einzige Nachhol-Lauf wäre
 * am Morgen um 07:00 gewesen. Der Kunde hätte also über fünfzehn Stunden auf
 * eine halb veröffentlichte Kampagne gesehen, während ein Nachschuss binnen
 * Minuten gereicht hätte.
 *
 * Dass daraus kein Dauerfeuer wird, regelt `RETRY_BACKOFF_SEC` in
 * `publisher.ts`: ein Ziel wird frühestens nach zehn Minuten erneut
 * versucht, danach mit wachsendem Abstand, höchstens dreimal.
 */
/**
 * Der Selbsttest der Anmeldung, im Viertelstundentakt.
 *
 * Er geht den Login-Weg selbst durch (siehe `lib/selftest.ts`). Fällt etwas
 * durch, geht eine Warnung an die Administration — höchstens eine je Stunde,
 * damit ein anhaltender Fehler nicht das Postfach flutet. Der Punkt ist, dass
 * ein kaputter Login auffällt, bevor jemand davorsteht.
 */
async function loginWatch(env: AppEnv['Bindings'], ctx: ExecutionContext) {
  // Die Seiten werden im eigenen Prozess gerendert statt über das Netz
  // geholt: Der Worker erreicht seine eigene Adresse nicht (HTTP 522).
  const result = await loginSelfTest(env, async (pfad) =>
    app.fetch(new Request(`${env.APP_URL}${pfad}`), env, ctx),
  )
  if (result.ok) return

  const failed = result.checks.filter((check) => !check.ok)
  console.error('[selftest] Login gestört:', JSON.stringify(failed))

  if (await consumeRateLimit(env, 'selftest-alarm', 1, 3600)) {
    await mailLoginBroken(env, failed)
  }
}

async function publishCatchUp(env: AppEnv['Bindings']) {
  const caught = await catchUp(env)
  if (caught.posts || caught.refreshed || caught.retried) {
    console.log(
      `[cron] Veröffentlichung: ${caught.posts} Videos nachveröffentlicht, ` +
        `${caught.refreshed} Posts nachgefasst, ${caught.retried} Accounts nachgereicht ` +
        `(davon ${caught.creator} aus der Verbreitung über Creator)`,
    )
  }
}

/**
 * Echte Zahlen aus Zernio, im Viertelstundentakt (siehe `lib/metrics.ts`).
 *
 * Neue Posts kommen (einmal je Stunde) in den Zeitplan, fällige werden
 * abgefragt — höchstens 40 je Lauf, junge Clips stündlich, alte seltener.
 * Ein eigener `try`: scheitert der Abgleich, sollen Veröffentlichung und
 * Login-Selbsttest davon nichts merken. Die Zahlen sind Beiwerk, die beiden
 * anderen nicht.
 */
/**
 * 20 Abrufe je Lauf, nicht mehr: derselbe Lauf schickt auch Nachholposts und
 * den Selbsttest raus, und Cloudflare begrenzt die Unteranfragen je Aufruf.
 * 96 Läufe am Tag mal 20 sind knapp 2.000 Abrufe — weit mehr, als die Clips
 * nach dem Zeitplan in metrics.ts je brauchen.
 */
const METRICS_PER_RUN = 20

async function metricsCatchUp(env: AppEnv['Bindings']) {
  try {
    const m = await syncMetrics(env, { limit: METRICS_PER_RUN })
    if (m.discovered || m.fetched) {
      console.log(
        `[cron] Zahlen: ${m.discovered} Posts neu im Zeitplan, ${m.fetched} abgefragt, ` +
          `${m.updated} Accounts aktualisiert, ${m.pending} noch in Synchronisierung, ${m.failed} ohne Zahlen` +
          (m.paused ? ': Analytics ruhen (402)' : ''),
      )
    }
  } catch (err) {
    console.error('[cron] Zahlen-Abgleich fehlgeschlagen', err)
  }
}

/**
 * Angefangene, nicht abgeschickte Kampagnen-Formulare (lib/drafts.ts): nach
 * 2 Stunden Meldung an den Admin, nach 24 Stunden Erinnerung an den Kunden.
 */
async function draftsCatchUp(env: AppEnv['Bindings']) {
  try {
    const d = await processDrafts(env)
    if (d.admin || d.reminded) console.log(`[cron] Entwürfe: ${d.admin} an Admin gemeldet, ${d.reminded} Kunden erinnert`)
  } catch (err) {
    console.error('[cron] Entwürfe fehlgeschlagen', err)
  }
}

/**
 * Wartet ALLE Aufgaben des Viertelstundentakts ab, auch wenn eine scheitert.
 *
 * Mit `Promise.all` endete das gemeinsame Promise beim ersten Fehler — und
 * mit ihm `waitUntil`: der Aufruf durfte enden, während der Zahlen-Abgleich
 * noch mitten in seinen Abrufen steckte. Der erste Fehler wird danach
 * trotzdem geworfen, damit der Lauf im Cloudflare-Log weiter als gescheitert
 * erscheint; weitere stehen davor einzeln im Log.
 */
async function allToEnd(tasks: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(tasks)
  const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
  for (const reason of failed.slice(1)) console.error('[cron] Weitere Aufgabe fehlgeschlagen', reason)
  if (failed.length) throw failed[0]
}

export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) => {
    // Der Viertelstundentakt fasst nur die Veröffentlichung nach. Das
    // Aufräumen von Papierkorb, Sessions und Speicherwarnungen bleibt beim
    // täglichen Lauf — es 96-mal am Tag zu wiederholen, brächte nichts.
    // Der Selbsttest der Anmeldung läuft im Viertelstundentakt mit — er
    // kostet ein paar Abfragen und ist der einzige Weg, von einem kaputten
    // Login zu erfahren, bevor jemand davorsteht. Nicht im täglichen Lauf:
    // der feuert um 07:00 zugleich mit dem Viertelstundentakt, der Test liefe
    // sonst doppelt. Aus demselben Grund läuft auch der Zahlen-Abgleich nur
    // hier — sein Zeitplan steckt in `metrics_sync`, der Takt weckt nur.
    ctx.waitUntil(
      event.cron === DAILY_CRON
        ? scheduledRun(env)
        : allToEnd([publishCatchUp(env), loginWatch(env, ctx), metricsCatchUp(env), draftsCatchUp(env)]),
    )
  },
}
