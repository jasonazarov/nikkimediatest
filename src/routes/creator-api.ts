import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import { consumeRateLimit, requireRole } from '../lib/auth'
import { audit } from '../lib/audit'
import { creatorForUser } from '../lib/domain'
import {
  ACCOUNT_LIMIT,
  accountsForCreator,
  clipApprovalsFor,
  connectedAccountCount,
  connectUrlForCreator,
  creatorMayDistribute,
  disconnectAccountFromCreator,
  isConnectable,
  isManualPlatform,
  markApprovalManual,
  PUBLISH_STATUS,
  platformLabel,
  publishForCreator,
  publishingReady,
  recordApproval,
  setManualPost,
  syncCreatorAccounts,
} from '../lib/publisher'
import { presignGet, r2Ready } from '../lib/r2'
import type { Creator } from '../db/schema'
import type { AppEnv, Env } from '../lib/types'

/**
 * API des Creator-Bereichs (/kampagnen) — eingehängt unter /api/creator.
 *
 * Hier liegt nur, was es ausschließlich für Creator gibt: die eigenen
 * Social-Accounts verbinden und die Verbreitung fremder Kampagnen, die der
 * Administrator ihm zugeordnet hat (Clips ansehen, freigeben, Links zu
 * Handposts). Beitreten oder Verlassen gibt es nicht — zugeordnet wird nur
 * unter /api/admin/projects/:id/creators. Alles, was ein Creator genauso
 * macht wie ein Kunde oder Clipper — Kampagnen anlegen, Material hochladen,
 * fertige Clips hochladen —, läuft weiter über /api/app und /api/work.
 *
 * Antworten sind deutsch, wie der ganze Creator-Bereich.
 */
export const creatorApi = new Hono<AppEnv>()
creatorApi.use('*', requireRole('creator'))

const str = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)

/**
 * Wie lange die Vorschau-Adresse eines Clips gilt.
 *
 * Kurz, weil sie an Material eines fremden Kunden hängt: wer die Kampagne
 * verlässt oder dessen Freigabe zurückgenommen wird, soll den Clip nicht
 * über einen alten Link weiter abrufen können. Eine Viertelstunde reicht,
 * um einen Clip anzusehen — die Seite holt beim nächsten Klick eine neue.
 */
const PREVIEW_TTL_SEC = 15 * 60

/** Wohin es nach dem Verbinden zurückgeht — dort verarbeitet `absorbConnectReturn` die Rückkehr. */
export const CREATOR_ACCOUNTS_PATH = '/kampagnen/accounts'

const NO_ACCOUNTS =
  'Verbinde zuerst mindestens einen Account unter „Meine Accounts“, sonst gibt es keinen Kanal, auf den der Clip gehen könnte.'

/** Die Creator-Zeile des eingeloggten Nutzers. Fehlt sie, ist der Bereich noch nicht eingerichtet. */
async function creatorOf(c: any): Promise<Creator | null> {
  return creatorForUser(c.env, c.get('user').id)
}

const noCreator = (c: any) =>
  c.json({ error: 'Dein Kampagnen-Bereich wird gerade eingerichtet. Versuch es in ein paar Minuten noch einmal.' }, 403)

/** `creators.platforms` als Liste — ein kaputter Wert heißt schlicht: keine Angabe. */
function profilePlatforms(creator: Creator): string[] {
  try {
    const parsed = JSON.parse(creator.platforms)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/**
 * Ein Clip, den dieser Creator sehen und verbreiten darf — oder `null`.
 *
 * Die Bedingungen stehen an EINER Stelle, damit Vorschau und Freigabe nicht
 * auseinanderlaufen: der Clip ist fertig hochgeladen, seine Kampagne ist
 * für Creator freigegeben, der Creator ist ihr beigetreten, und es ist NICHT
 * seine eigene (`creatorMayDistribute`). Eigene Kampagnen gehen ohnehin
 * automatisch auf seine Accounts — über die Verbreitung gingen sie doppelt.
 *
 * Eine fremde oder unbekannte ID bekommt dieselbe Antwort wie ein
 * gesperrter Clip. So verrät die API nicht, welche IDs es gibt.
 */
async function distributableClip(env: Env, deliverableId: string, creatorId: string) {
  const [row] = await getDb(env)
    .select({
      id: schema.deliverables.id,
      projectId: schema.deliverables.projectId,
      r2Key: schema.deliverables.r2Key,
      filename: schema.deliverables.filename,
      thumbnailKey: schema.deliverables.thumbnailKey,
      uploadStatus: schema.deliverables.uploadStatus,
      projectStatus: schema.projects.status,
    })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .where(eq(schema.deliverables.id, deliverableId))
    .limit(1)
  if (!row || row.uploadStatus !== 'complete') return null
  if (!(await creatorMayDistribute(env, row.projectId, creatorId))) return null
  return row
}

/* ------------------------------------------------------------- Accounts

   Ein Creator verbindet seine Kanäle EINMAL für sich, nicht je Kampagne.
   Sie gelten für seine eigenen Kampagnen (automatisch) und für jede
   Kampagne, die er verbreitet (nach seiner Freigabe). Je Kampagne neu zu
   verbinden hieße doppelte Kosten — der Anbieter rechnet je verbundenem
   Account ab.
   -------------------------------------------------------------------------- */

/**
 * Adresse zum Verbinden eines Accounts. Der Browser geht dorthin und kommt
 * nach der Zustimmung auf /kampagnen/accounts zurück.
 *
 * Gedrosselt, weil jeder Klick beim Anbieter einen Steckplatz anlegen kann:
 * ein freier wird zwar wiederverwendet, aber ein Skript, das im Kreis
 * klickt, soll dort keine Profile anhäufen.
 */
creatorApi.post('/accounts/connect/:platform', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)

  const platform = c.req.param('platform')
  if (!isConnectable(platform)) {
    return c.json(
      {
        error: isManualPlatform(platform)
          ? `${platformLabel(platform)} lässt sich nicht verbinden, dort postest du selbst und trägst danach den Link beim Clip ein.`
          : 'Diese Plattform wird nicht unterstützt.',
      },
      400,
    )
  }
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Das Verbinden ist gerade nicht eingerichtet. Versuch es später noch einmal.' }, 503)
  }
  if (!(await consumeRateLimit(c.env, `creator-connect:${creator.id}`, 20, 3600))) {
    return c.json({ error: 'Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.' }, 429)
  }
  // Jeder Account kostet monatlich — siehe `ACCOUNT_LIMIT`.
  if ((await connectedAccountCount(c.env, { creatorId: creator.id })) >= ACCOUNT_LIMIT.creator) {
    return c.json(
      {
        error: `Du hast bereits ${ACCOUNT_LIMIT.creator} Accounts verbunden: das ist die Obergrenze. Trenne einen, den du nicht mehr brauchst, oder schreib uns, wenn du mehr brauchst.`,
      },
      409,
    )
  }

  try {
    const url = await connectUrlForCreator(c.env, creator.id, platform, `${c.env.APP_URL}${CREATOR_ACCOUNTS_PATH}`)
    await audit(c.env, {
      actorId: c.get('user').id,
      action: 'publish.connect',
      entity: 'creator',
      entityId: creator.id,
      payload: { platform },
    })
    return c.json({ ok: true, url })
  } catch (err) {
    console.error('[creator] Verbindungslink fehlgeschlagen', creator.id, platform, err)
    return c.json(
      { error: `Der Link zum Verbinden ließ sich gerade nicht erzeugen. Versuch es gleich noch einmal.` },
      502,
    )
  }
})

/**
 * Einen Account trennen. Getrennt wird nur, was diesem Creator gehört —
 * eine fremde Account-ID liefert 404 (siehe `disconnectAccountFromCreator`).
 */
creatorApi.delete('/accounts/:accountId', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)

  const accountId = c.req.param('accountId')
  if (!(await disconnectAccountFromCreator(c.env, creator.id, accountId))) {
    return c.json({ error: 'Account nicht gefunden.' }, 404)
  }

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'publish.account.disconnected',
    entity: 'creator',
    entityId: creator.id,
    payload: { accountId },
  })
  return c.json({ ok: true })
})

/**
 * Accounts frisch beim Anbieter abgleichen — für den Fall, dass eine
 * Verbindung durchlief, die Rückkehr aber nicht ankam (Fenster zu früh
 * geschlossen, Anbieter kurz nicht erreichbar). Gedrosselt, weil jeder
 * Abgleich je Steckplatz eine Anfrage beim Anbieter kostet.
 */
creatorApi.post('/accounts/sync', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Das Verbinden ist gerade nicht eingerichtet. Versuch es später noch einmal.' }, 503)
  }
  if (!(await consumeRateLimit(c.env, `creator-sync:${creator.id}`, 30, 3600))) {
    return c.json({ error: 'Zu viele Abgleiche in kurzer Zeit. Bitte warte ein paar Minuten.' }, 429)
  }

  try {
    const count = await syncCreatorAccounts(c.env, creator.id)
    return c.json({ ok: true, count })
  } catch (err) {
    console.error('[creator] Abgleich fehlgeschlagen', creator.id, err)
    return c.json({ error: 'Der Abgleich hat gerade nicht geklappt. Versuch es gleich noch einmal.' }, 502)
  }
})

/* ------------------------------------------------------- Verbreitung

   Kunden können eine Kampagne für Creator freigeben; der Administrator
   ordnet ihr einzelne Creator zu. Ein zugeordneter Creator sieht die
   fertigen Clips und stellt sie Clip für Clip mit „Freigeben & posten“ auf
   seine Kanäle.
   -------------------------------------------------------------------------- */

/**
 * Vorschau eines Clips: eine kurz gültige, signierte Adresse zum Ansehen
 * (kein Download-Dialog). Die Seite holt sie erst, wenn der Clip sichtbar
 * wird — nicht schon beim Rendern für jeden Clip der Kampagne.
 *
 * Mit `?download=1` dieselbe Adresse als Download — aber erst nach der
 * Freigabe. Wer auf Twitch oder Snapchat selbst postet, braucht die Datei;
 * wer einen Clip nur ansieht, nicht.
 */
creatorApi.get('/clips/:deliverableId/preview', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)
  if (!r2Ready(c.env)) return c.json({ error: 'Die Vorschau ist gerade nicht verfügbar.' }, 503)

  const deliverableId = c.req.param('deliverableId')
  const clip = await distributableClip(c.env, deliverableId, creator.id)
  if (!clip) return c.json({ error: 'Clip nicht gefunden.' }, 404)

  if (c.req.query('download') === '1') {
    const [approval] = await clipApprovalsFor(c.env, [deliverableId], creator.id)
    if (!approval) return c.json({ error: 'Gib den Clip zuerst frei, dann kannst du ihn herunterladen.' }, 409)
    return c.json({ url: await presignGet(c.env, clip.r2Key, clip.filename, PREVIEW_TTL_SEC) })
  }

  const [url, poster] = await Promise.all([
    presignGet(c.env, clip.r2Key, undefined, PREVIEW_TTL_SEC),
    clip.thumbnailKey ? presignGet(c.env, clip.thumbnailKey, undefined, PREVIEW_TTL_SEC) : null,
  ])
  return c.json({ url, poster })
})

/**
 * „Freigeben & posten“.
 *
 * Erst die Freigabe festhalten, dann im Hintergrund senden. Bricht das
 * Senden ab (Worker beendet, Anbieter nicht erreichbar), holt es der
 * Nachhol-Lauf alle 15 Minuten nach — die Freigabe-Zeile ist sein Auftrag.
 *
 * Ein zweiter Klick (Doppeltipp, Zurück-Taste) richtet keinen Schaden an:
 * die Zeile besteht schon, und `publishForCreator` sendet nichts, was
 * bereits läuft oder draußen steht.
 *
 * Strenger als die Vorschau in einem Punkt: eine pausierte oder beendete
 * Kampagne nimmt keine neuen Freigaben an. Ansehen darf er die Clips
 * weiterhin — etwa um zu sehen, was er schon gepostet hat.
 *
 * Ohne verbundenen Account, aber mit Twitch oder Snapchat im Profil, wird
 * die Freigabe als „Selbst posten“ (`PUBLISH_STATUS.manual`) festgehalten
 * und NICHT gesendet — siehe unten.
 */
creatorApi.post('/clips/:deliverableId/approve', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)

  const deliverableId = c.req.param('deliverableId')
  const clip = await distributableClip(c.env, deliverableId, creator.id)
  if (!clip) return c.json({ error: 'Clip nicht gefunden.' }, 404)
  if (clip.projectStatus !== 'aktiv') {
    return c.json({ error: 'Diese Kampagne ist pausiert oder beendet, gerade gehen keine neuen Clips raus.' }, 409)
  }
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Das Posten ist gerade nicht eingerichtet. Versuch es später noch einmal.' }, 503)
  }

  /*
   * Gedrosselt: jeder Klick stößt im Hintergrund einen Versand samt Abgleich
   * beim Anbieter an, und dessen Ratenbegrenzung gilt für das ganze Team. Ein
   * Skript, das diesen Knopf im Kreis drückt, legte sonst auch die
   * Veröffentlichung der Kunden lahm. 120 in der Stunde reichen, um eine
   * ganze Kampagne Clip für Clip durchzuklicken.
   */
  if (!(await consumeRateLimit(c.env, `creator-approve:${creator.id}`, 120, 3600))) {
    return c.json({ error: 'Zu viele Freigaben in kurzer Zeit. Bitte warte ein paar Minuten.' }, 429)
  }

  /*
   * Ohne verbundenen Account gäbe es nur eine Freigabe, die auf
   * „wartet auf verbundene Accounts“ stehen bleibt. Lieber gleich sagen,
   * was fehlt — die Seite verlinkt die Antwort auf „Meine Accounts“.
   *
   * Ausnahme: Twitch oder Snapchat im Profil. Dorthin postet er selbst, und
   * das Feld für den Beitragslink wie den Download gibt es erst nach der
   * Freigabe. Ohne sie stünde er in einer Sackgasse — obwohl „Meine
   * Accounts“ ihm genau diesen Weg beschreibt.
   */
  const hasAccounts = (await accountsForCreator(c.env, creator.id)).length > 0
  const manualOnly = !hasAccounts && profilePlatforms(creator).some(isManualPlatform)
  if (!hasAccounts && !manualOnly) {
    return c.json({ error: NO_ACCOUNTS, connect: CREATOR_ACCOUNTS_PATH }, 409)
  }

  const res = await recordApproval(c.env, deliverableId, creator.id)
  if (!res.ok) return c.json({ error: res.error }, 409)

  if (manualOnly) {
    /*
     * Reiner Selbstposter: die Freigabe schaltet nur Download und Link-Feld
     * frei. Sie geht NICHT an `publishForCreator` — der fände keinen Account
     * und schriebe „wartet auf verbundene Accounts“, und der Nachhol-Lauf
     * schickte den Clip dann ungefragt raus, sobald er irgendwann einen
     * Account verbindet. Womöglich hat er ihn bis dahin längst von Hand
     * gepostet; ein zweiter, automatischer Post auf einem neuen Kanal wäre
     * eine Überraschung. „Selbst posten“ läuft deshalb nie von allein —
     * nur über „Jetzt posten“ (siehe `/clips/:id/post`).
     *
     * Ein Clip, der früher über einen inzwischen getrennten Account
     * rausging, behält seinen Stand — ein Doppeltipp soll aus
     * „veröffentlicht“ nicht „Selbst posten“ machen. Diese Sperre (keine
     * Ziele, kein Post) liegt in `markApprovalManual` selbst.
     */
    await markApprovalManual(c.env, deliverableId, creator.id)
  } else {
    /*
     * Den Abgleich seiner Accounts (je Steckplatz ein Aufruf beim Anbieter)
     * höchstens alle fünf Minuten — nicht bei jeder Freigabe. Wer zehn Clips
     * hintereinander freigibt, braucht ihn einmal; ein frisch verbundener
     * Account steht ohnehin sofort im Spiegel (Rückkehr bzw. Webhook). Ein
     * vorab gefülltes `synced` heißt für `publishForCreator`: schon erledigt.
     */
    const syncDue = await consumeRateLimit(c.env, `creator-autosync:${creator.id}`, 1, 300)

    c.executionCtx.waitUntil(
      publishForCreator(c.env, deliverableId, creator.id, {
        synced: syncDue ? undefined : new Set([creator.id]),
      }).catch((err) =>
        console.error('[creator] Verbreitung fehlgeschlagen', deliverableId, creator.id, err),
      ),
    )
  }

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clip.approved',
    entity: 'deliverable',
    entityId: deliverableId,
    payload: { creatorId: creator.id, projectId: clip.projectId, manual: manualOnly },
  })
  // `manual` sagt der Seite, welcher Text auf den Knopf gehört.
  return c.json({ ok: true, manual: manualOnly })
})

/**
 * „Jetzt posten“ — eine Freigabe, die als „Selbst posten“ festgehalten
 * wurde, nachträglich auf die inzwischen verbundenen Accounts schicken.
 *
 * Der einzige Weg, auf dem ein solcher Clip automatisch rausgeht: der
 * Nachhol-Lauf fasst „Selbst posten“ nie an (siehe Freigabe oben), also
 * braucht es den ausdrücklichen Klick — und `force`, weil
 * `publishForCreator` diesen Stand sonst übergeht.
 *
 * Nur für eine EIGENE, bestehende Freigabe, in einer aktiven Kampagne, die
 * er weiterhin verbreiten darf, und erst mit mindestens einem Account. Der
 * Stand muss „Selbst posten“ sein (oder „wartet auf verbundene Accounts“,
 * die ältere Form davon): alles andere läuft ohnehin von selbst, und ein
 * erzwungener Versand dort umginge die Wartezeiten des Nachhol-Laufs.
 *
 * Anders als die Freigabe wartet diese Route auf den Versand: die Seite lädt
 * gleich danach neu und soll dann den Stand je Account zeigen statt wieder
 * „Selbst posten“. `waitUntil` hält den Versand am Leben, falls der Browser
 * vorher geht — die Sperren in `publishForCreator` verhindern dabei, dass
 * ein zweiter Klick doppelt sendet.
 */
creatorApi.post('/clips/:deliverableId/post', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)

  const deliverableId = c.req.param('deliverableId')
  const clip = await distributableClip(c.env, deliverableId, creator.id)
  if (!clip) return c.json({ error: 'Clip nicht gefunden.' }, 404)
  if (clip.projectStatus !== 'aktiv') {
    return c.json({ error: 'Diese Kampagne ist pausiert oder beendet, gerade gehen keine neuen Clips raus.' }, 409)
  }
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Das Posten ist gerade nicht eingerichtet. Versuch es später noch einmal.' }, 503)
  }

  const [approval] = await clipApprovalsFor(c.env, [deliverableId], creator.id)
  if (!approval) return c.json({ error: 'Gib den Clip zuerst frei.' }, 409)
  if (
    approval.publishStatus !== PUBLISH_STATUS.manual &&
    approval.publishStatus !== PUBLISH_STATUS.waitingForAccounts
  ) {
    return c.json({ error: 'Dieser Clip ist schon unterwegs, der Stand aktualisiert sich von selbst.' }, 409)
  }
  if (!(await accountsForCreator(c.env, creator.id)).length) {
    return c.json({ error: NO_ACCOUNTS, connect: CREATOR_ACCOUNTS_PATH }, 409)
  }

  // Dieselbe Bremse wie die Freigabe — jeder Klick ist ein Versand beim Anbieter.
  if (!(await consumeRateLimit(c.env, `creator-approve:${creator.id}`, 120, 3600))) {
    return c.json({ error: 'Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.' }, 429)
  }
  const syncDue = await consumeRateLimit(c.env, `creator-autosync:${creator.id}`, 1, 300)

  const run = publishForCreator(c.env, deliverableId, creator.id, {
    synced: syncDue ? undefined : new Set([creator.id]),
    force: true,
  }).catch((err) => {
    console.error('[creator] Jetzt posten fehlgeschlagen', deliverableId, creator.id, err)
    return null
  })
  c.executionCtx.waitUntil(run)
  const outcome = await run

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clip.post_now',
    entity: 'deliverable',
    entityId: deliverableId,
    payload: { creatorId: creator.id, projectId: clip.projectId, status: outcome?.status ?? null },
  })
  return c.json({ ok: true, status: outcome?.status ?? null })
})

/**
 * Link zu einem Beitrag, den der Creator selbst gepostet hat — für
 * Plattformen ohne Schnittstelle (Twitch, Snapchat). Leerer Link entfernt
 * den Eintrag.
 *
 * Nur für Plattformen aus seinem Profil: wer bei der Anmeldung kein Twitch
 * angegeben hat, hat dort auch keinen Kanal, auf dem der Kunde den Clip
 * suchen sollte. Und nur nach der Freigabe — das prüft `setManualPost`;
 * damit bleibt die Frage, ob er die Kampagne verbreiten darf, an der
 * Freigabe hängen und wird hier nicht ein zweites Mal anders beantwortet.
 */
creatorApi.put('/clips/:deliverableId/manual', async (c) => {
  const creator = await creatorOf(c)
  if (!creator) return noCreator(c)

  const body = await c.req.json().catch(() => ({}))
  const platform = str(body.platform, 20)
  if (!isManualPlatform(platform)) return c.json({ error: 'Für diese Plattform gibt es keinen Link zum Eintragen.' }, 400)
  if (!profilePlatforms(creator).includes(platform)) {
    return c.json({ error: `${platformLabel(platform)} steht nicht in deinem Profil.` }, 400)
  }

  const raw = body.url === null ? null : str(body.url, 500)
  const deliverableId = c.req.param('deliverableId')
  const res = await setManualPost(c.env, deliverableId, creator.id, platform, raw)
  if (!res.ok) return c.json({ error: res.error }, 400)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clip.manual_post',
    entity: 'deliverable',
    entityId: deliverableId,
    payload: { creatorId: creator.id, platform, url: res.posts[platform] ?? null },
  })
  return c.json({ ok: true, url: res.posts[platform] ?? null })
})
