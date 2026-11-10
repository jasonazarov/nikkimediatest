import { Hono } from 'hono'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, nowSec, uid, schema } from '../lib/db'
import {
  PASSWORD_MIN,
  consumeRateLimit,
  createSession,
  requireRole,
  issueLoginCode,
  setPassword,
  verifyPasswordLogin,
} from '../lib/auth'
import { audit } from '../lib/audit'
import { formatEuro } from '../views/layout'
import { saveDraft, submitDraft } from '../lib/drafts'
import { setPushPopupDays } from '../lib/upsell'
import { loginSelfTest } from '../lib/selftest'
import {
  BUDGETS,
  FOOTAGE,
  INDUSTRIES,
  PLATFORMS,
  LEAD_STATUS,
  addStorage,
  assignDistribution,
  addToTeam,
  distributeWithTeamCreators,
  parsePayTiers,
  setPayTiers,
  assignWorker,
  removeFromTeam,
  unassignWorker,
  workersOfProject,
  campaignCreatorsOf,
  checkStorageWarning,
  customerForUser,
  workerRecipients,
  clipperForUser,
  clipperHasProject,
  createProject,
  deleteCustomerAccount,
  deleteClipperAccount,
  deleteCreatorAccount,
  deleteProject,
  emailHeldByOtherRole,
  notifyMaterialAdded,
  normalizeCloudLink,
  addProjectLink,
  provisionClipper,
  CLIPPER_AVAILABILITY,
  CLIPPER_EXPERIENCE,
  CLIPPER_WORK_STATUS,
  availabilityLabel,
  experienceLabel,
  workStatusLabel,
  CREATOR_AD_OPENNESS,
  CREATOR_FOLLOWERS,
  CREATOR_GOALS,
  CREATOR_PLATFORMS,
  CREATOR_VIEWS_30D,
  CREATOR_VIEWS_TOTAL,
  adOpennessLabel,
  creatorGoalLabel,
  creatorPlatformLabel,
  followersLabel,
  provisionCreator,
  views30dLabel,
  viewsTotalLabel,
  platformLabel,
  primaryProject,
  projectForFolder,
  projectOfCustomer,
  leaveDistribution,
  provisionAgency,
  provisionCustomer,
  releaseProject,
  setCustomerConverted,
  updateUserIdentity,
} from '../lib/domain'
import {
  MULTIPART_THRESHOLD,
  PART_SIZE,
  abortMultipartUpload,
  buildKey,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  isAllowedFile,
  isVideo,
  listParts,
  mimeFor,
  objectSize,
  presignGet,
  presignPart,
  presignPut,
  r2Ready,
  safeFilename,
  thumbKeyFor,
  THUMB_MAX_BYTES,
  R2_MISSING,
  R2_MISSING_WORKER,
} from '../lib/r2'
import { composePhone, hasEnoughDigits } from '../lib/phone'
import {
  ACCOUNT_LIMIT,
  applyPostEvent,
  beyondAccountLimit,
  connectedAccountCount,
  connectUrlForProject,
  discardBeyondLimit,
  discardDuplicateAccount,
  disconnectAccountFromProject,
  isConnectable,
  publishDeliverable,
  publishingReady,
  releaseAtProvider,
  removeAccount,
  seenEvent,
  syncAccounts,
  upsertAccount,
} from '../lib/publisher'
import { syncExternalPosts, syncOverview, syncProjectMetrics } from '../lib/metrics'
import { CUSTOMER_AREA } from '../views/app'
import { AGENCY_CAMPAIGN_AREA } from '../views/collaboration'
import {
  mailClipForApproval,
  mailDeliverableAdmin,
  mailDeliverableCustomer,
  mailClipperInvite,
  mailClipperSignupAdmin,
  mailClipperWelcome,
  mailCreatorSignupAdmin,
  mailCreatorWelcome,
  mailLinkAddedClipper,
  mailLeadAdmin,
  mailLeadCustomer,
  mailLoginCode,
  mailUploadClipper,
  mailAgencySignupAdmin,
  mailAgencyUnlocked,
  mailAgencyWelcome,
  mailCustomerCampaignAdmin,
} from '../lib/mail'
import {
  AGENCY_CLIENTS,
  AGENCY_FOOTAGE,
  AGENCY_KINDS,
  AGENCY_PLATFORMS,
  AGENCY_SOCIALS,
  AGENCY_SOURCES,
  agencyClientsLabel,
  agencyFootageLabel,
  agencyKindLabel,
  agencyLeadForUser,
  agencyPlatformLabel,
  agencySocialLabel,
  agencySourceLabel,
  agencyUnlocked,
  claimCooperationCode,
  createCooperationCode,
  decideBooking,
  deleteAgencyAccount,
  normalizeCooperationCode,
  openCooperationCode,
  releaseCooperationCode,
  isValidDuration,
  parseNewCampaign,
  pricePerThousandCents,
  isValidViews,
} from '../lib/agency'
import { finishCustomThumb, removeCustomThumb, startCustomThumb } from '../lib/thumbs'
import type { AppEnv } from '../lib/types'
import type { Role } from '../db/schema'

export const apiRoutes = new Hono<AppEnv>()

const clientIp = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unbekannt'

const str = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)

/* ==========================================================================
   ÖFFENTLICH — Selbsteintrag über die Stepper (Kunde, Clipper)
   ========================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

/** Auswahl aus einer Liste erlaubter Werte — Doppeltes und Fremdes fällt weg. */
const pickList = (raw: unknown, allowed: readonly string[]) =>
  Array.isArray(raw) ? [...new Set(raw.map((v) => str(v, 40)))].filter((v) => allowed.includes(v)) : []

const PLATFORM_VALUES = PLATFORMS.map((p) => p.value) as readonly string[]

/**
 * Obergrenze für Selbsteinträge je Verbindung und Stunde.
 *
 * Gezählt wird erst, wenn ein Eintrag wirklich etwas tut — einen Zugang
 * anlegt oder eine Mail verschickt. Früher zählte jeder Klick auf
 * „Absenden“, auch der, der an einem leeren Pflichtfeld oder an „gehört
 * bereits zu einem anderen Zugang“ scheiterte. Nach fünf solchen Versuchen
 * war die Verbindung eine Stunde gesperrt, obwohl nichts angelegt und nichts
 * verschickt worden war. Dazu teilen sich Mobilfunkkunden oft eine IP
 * (CGNAT) — fünf waren dafür zu knapp.
 */
const SIGNUP_LIMIT = 10

const signupAllowed = (c: any, kind: 'lead' | 'clipper' | 'creator' | 'agency') =>
  consumeRateLimit(c.env, `${kind}:${clientIp(c)}`, SIGNUP_LIMIT, 3600)

/**
 * Wohin es nach dem Absenden geht.
 *
 * Ein NEUER Kunde wird sofort eingeloggt und landet direkt im Ziel — in
 * seinem Bereich liegt nur, was er selbst hochlädt. Gab es den Zugang schon,
 * gibt es KEINE Sitzung: sonst säße jeder, der eine fremde Adresse in das
 * Formular tippt, in deren Zugang.
 *
 * Clipper und Creator bestätigen ihre Adresse IMMER erst mit dem Code aus der
 * Willkommens-Mail. Sie sehen Rohmaterial fremder Kunden und können Clips auf
 * deren Accounts veröffentlichen — das darf nicht an einer erfundenen Adresse
 * hängen. Der Code steckt in der Mail, die ohnehin rausgeht; danach geht es
 * direkt ins Dashboard.
 */
async function signupLanding(
  c: any,
  o: { userId: string; role: Role; created: boolean; email: string; target: string },
): Promise<string> {
  if (o.created && o.role === 'customer') {
    await createSession(c.env, c, o.userId, o.role)
    return o.target
  }
  const q = new URLSearchParams({ email: o.email, next: o.target, sent: '1' })
  return `/login/code?${q.toString()}`
}

apiRoutes.post('/leads', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Ungültige Anfrage.' }, 400)
  }

  // Honeypot: Erfolg vortäuschen, Lead verwerfen.
  if (str(body.website)) {
    await audit(c.env, { action: 'lead.honeypot', entity: 'lead', payload: { ip: clientIp(c) } })
    return c.json({ ok: true, redirect: '/' })
  }

  const platforms = pickList(body.platforms, PLATFORM_VALUES)
  const industry = str(body.industry, 80)
  const footage = str(body.footage, 40)
  const budget = str(body.budget, 40)
  // „Wie bist du auf uns aufmerksam geworden?“ wie bei den Agenturen. Das Formular
  // verlangt es; ältere Aufrufe ohne Angabe bleiben gültig (NULL).
  const source = str(body.source, 20)
  const fullName = str(body.fullName, 120)
  const company = str(body.company, 120)
  const email = str(body.email, 190).toLowerCase()
  /*
   * Vorwahl und Nummer kommen getrennt aus dem Formular und werden HIER
   * zusammengesetzt — nicht im Browser. Der Server ist die einzige Stelle,
   * die jeder Aufrufer durchläuft; eine Nummer, die von woanders her kommt
   * (alter Zwischenspeicher, Skript), bekommt dieselbe Behandlung. Ohne
   * Vorwahl fällt sie unten durch die Prüfung: eine Nummer, die Jason nicht
   * anrufen kann, ist als Lead wertlos.
   */
  const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
  // Optional — aber wenn ausgefüllt, muss es ein echter https-Link sein.
  const rawLink = str(body.cloudLink, 2100)
  const cloudLink = rawLink ? normalizeCloudLink(rawLink) : null

  const valid =
    platforms.length > 0 &&
    (INDUSTRIES as readonly string[]).includes(industry) &&
    FOOTAGE.some((f) => f.value === footage) &&
    (BUDGETS as readonly string[]).includes(budget) &&
    (!source || AGENCY_SOURCES.some((o) => o.value === source)) &&
    fullName.length > 1 &&
    EMAIL_RE.test(email) &&
    phone.startsWith('+') &&
    hasEnoughDigits(phone) &&
    body.privacy === true

  if (!valid) return c.json({ error: 'Bitte fülle alle Pflichtfelder aus.' }, 400)
  if (rawLink && !cloudLink) {
    return c.json({ error: 'Der Cloud-Link muss mit https:// beginnen, oder lass das Feld leer.' }, 400)
  }
  if (await emailHeldByOtherRole(c.env, email, 'customer')) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }
  if (!(await signupAllowed(c, 'lead'))) {
    return c.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, 429)
  }

  const db = getDb(c.env)
  const ts = nowSec()

  // Nutzer und Kundenzugang anlegen (oder wiederverwenden).
  const provisioned = await provisionCustomer(c.env, { email, fullName, phone, company: company || null })
  if (!provisioned.ok) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }

  /*
   * Kein Referenzzeichen mehr, keine Schleife: Ein Lead ist durch Name,
   * E-Mail und Telefonnummer eindeutig genug. Die frühere Nummer NM-JAHR-0001
   * musste bei jedem Eintrag gegen Kollisionen abgesichert werden und stand
   * dafür in jeder Tabelle als erste Spalte, ohne je gebraucht zu werden.
   */
  const leadId = uid()
  try {
    await db.insert(schema.leads).values({
      id: leadId,
      fullName,
      company: company || null,
      email,
      phone,
      platforms: JSON.stringify(platforms),
      industry,
      footageAmount: footage,
      budgetRange: budget,
      source: source || null,
      status: 'Neu',
      createdAt: ts,
      customerId: provisioned.customerId,
    })
  } catch (err) {
    console.error('[lead] konnte nicht gespeichert werden', err)
    return c.json({ error: 'Speichern fehlgeschlagen. Bitte versuche es erneut.' }, 500)
  }

  /*
   * Ein Cloud-Link braucht ein Projekt, an dem er hängt — sonst sähe ihn
   * kein Clipper. Mit ihm hat das Projekt sofort Material; der Administrator
   * erfährt es unten im Hintergrund und ordnet es zu.
   *
   * Nur bei einem NEUEN Zugang. Gehört die Adresse schon jemandem, schreibt
   * das Formular nichts in dessen Bereich — sonst könnte jeder, der eine
   * fremde Adresse kennt, dort Projekte mit beliebigen Links anlegen. Der
   * Link steht dann nur in der Mail an Jason.
   */
  let target = '/app'
  let projectId: string | null = null
  if (cloudLink && provisioned.created) {
    const project = await createProject(c.env, {
      customerId: provisioned.customerId,
      name: 'Meine erste Kampagne',
      folderName: 'Rohmaterial',
    })
    await addProjectLink(c.env, { projectId: project.id, url: cloudLink, addedBy: provisioned.userId })
    projectId = project.id
    target = `/app/projekt/${project.id}`
  }

  const code = await issueLoginCode(c.env, email)
  const redirect = await signupLanding(c, {
    userId: provisioned.userId,
    role: 'customer',
    created: provisioned.created,
    email,
    target,
  })

  await audit(c.env, {
    actorId: provisioned.userId,
    action: 'lead.created',
    entity: 'lead',
    entityId: leadId,
    payload: { platforms, industry, footage, budget, cloudLink: !!cloudLink, newAccount: provisioned.created },
  })

  // E-Mails im Hintergrund — der Nutzer wartet nicht darauf.
  c.executionCtx.waitUntil(
    Promise.all([
      mailLeadCustomer(c.env, {
        fullName: provisioned.fullName,
        email,
        code,
        linkNotAdded: !!cloudLink && !provisioned.created,
      }),
      mailLeadAdmin(c.env, {
        fullName,
        company: company || null,
        email,
        phone,
        platforms: platforms.map(platformLabel),
        industry,
        footageAmount: FOOTAGE.find((f) => f.value === footage)?.label ?? footage,
        budgetRange: budget,
        source: source ? agencySourceLabel(source) : '–',
        cloudLink,
      }),
      projectId ? notifyMaterialAdded(c.env, projectId) : Promise.resolve(),
    ]),
  )

  return c.json({ ok: true, redirect })
})

/**
 * Clipper tragen sich selbst ein (/clipper).
 *
 * Neben der Einladung durch den Administrator der zweite Weg ins System —
 * die Einladung bleibt unverändert bestehen. Der Zugang ist sofort aktiv;
 * Jobs bekommt er, sobald der Administrator ihm einen zuordnet. Deutsch wie
 * der ganze Clipper-Bereich.
 */
apiRoutes.post('/clippers', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Ungültige Anfrage.' }, 400)
  }

  if (str(body.website)) {
    await audit(c.env, { action: 'clipper.honeypot', entity: 'clipper', payload: { ip: clientIp(c) } })
    return c.json({ ok: true, redirect: '/clipper' })
  }

  const platforms = pickList(body.platforms, PLATFORM_VALUES)
  const workStatus = str(body.workStatus, 40)
  const experience = str(body.experience, 40)
  const availability = str(body.availability, 40)
  const fullName = str(body.fullName, 120)
  const email = str(body.email, 190).toLowerCase()
  const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))

  const valid =
    platforms.length > 0 &&
    CLIPPER_WORK_STATUS.some((o) => o.value === workStatus) &&
    CLIPPER_EXPERIENCE.some((o) => o.value === experience) &&
    CLIPPER_AVAILABILITY.some((o) => o.value === availability) &&
    fullName.length > 1 &&
    EMAIL_RE.test(email) &&
    phone.startsWith('+') &&
    hasEnoughDigits(phone) &&
    body.privacy === true

  if (!valid) return c.json({ error: 'Bitte fülle alle Pflichtfelder aus.' }, 400)
  if (await emailHeldByOtherRole(c.env, email, 'clipper')) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }
  if (!(await signupAllowed(c, 'clipper'))) {
    return c.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, 429)
  }

  const provisioned = await provisionClipper(c.env, { email, fullName, phone })
  if (!provisioned.ok) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }

  const code = await issueLoginCode(c.env, email)
  const redirect = await signupLanding(c, {
    userId: provisioned.userId,
    role: 'clipper',
    created: provisioned.created,
    email,
    target: '/work',
  })

  /*
   * Gibt es den Zugang schon, schreibt das Formular nichts in ihn hinein —
   * es könnte ja jemand anderes sein, der nur die Adresse kennt. Es geht nur
   * der Login-Code an die Adresse, wie bei „Code anfordern“.
   */
  if (!provisioned.created) {
    c.executionCtx.waitUntil(mailLoginCode(c.env, { email, displayName: provisioned.fullName, code }))
    return c.json({ ok: true, redirect })
  }

  await getDb(c.env).insert(schema.clipperApplications).values({
    id: uid(),
    clipperId: provisioned.clipperId,
    platforms: JSON.stringify(platforms),
    workStatus,
    experience,
    availability,
    createdAt: nowSec(),
  })

  await audit(c.env, {
    actorId: provisioned.userId,
    action: 'clipper.signed_up',
    entity: 'clipper',
    entityId: provisioned.clipperId,
    payload: { platforms, workStatus, experience, availability },
  })

  c.executionCtx.waitUntil(
    Promise.all([
      mailClipperWelcome(c.env, { email, fullName, code }),
      mailClipperSignupAdmin(c.env, {
        fullName,
        email,
        phone,
        platforms: platforms.map(platformLabel),
        workStatus: workStatusLabel(workStatus),
        experience: experienceLabel(experience),
        availability: availabilityLabel(availability),
      }),
    ]),
  )

  return c.json({ ok: true, redirect })
})

/**
 * Creator tragen sich selbst ein (/creator).
 *
 * Deutsch wie der ganze Creator-Bereich. Der Zugang ist sofort aktiv: Wer
 * Kampagnen sucht, bekommt sie vom Administrator zugeordnet; wer Kampagnen
 * hat, lädt sie direkt hoch. Ein Cloud-Link im Formular wird — wie bei
 * Kunden — sofort zur ersten Kampagne.
 */
apiRoutes.post('/creators', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Ungültige Anfrage.' }, 400)
  }

  if (str(body.website)) {
    await audit(c.env, { action: 'creator.honeypot', entity: 'creator', payload: { ip: clientIp(c) } })
    return c.json({ ok: true, redirect: '/creator' })
  }

  const goal = str(body.goal, 20)
  const niche = str(body.niche, 80)
  const platforms = pickList(body.platforms, CREATOR_PLATFORMS.map((p) => p.value))
  const openToAds = str(body.openToAds, 20)
  const followers = str(body.followers, 20)
  const viewsTotal = str(body.viewsTotal, 20)
  const views30d = str(body.views30d, 20)
  const source = str(body.source, 20)
  const fullName = str(body.fullName, 120)
  const email = str(body.email, 190).toLowerCase()
  const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))

  // Je gewählter Plattform ein Handle, freiwillig (seit November 2026 ganz unten im
  // Kontakt-Schritt). Führendes @ und Leerraum fallen weg.
  const handles: Record<string, string> = {}
  for (const platform of platforms) {
    const handle = str(body[`handle_${platform}`], 100).replace(/^@+/, '').trim()
    if (handle) handles[platform] = handle
  }

  const wantsOwn = goal === 'haben' || goal === 'beides'
  const rawLink = wantsOwn ? str(body.cloudLink, 2100) : ''
  const cloudLink = rawLink ? normalizeCloudLink(rawLink) : null

  const valid =
    CREATOR_GOALS.some((o) => o.value === goal) &&
    (INDUSTRIES as readonly string[]).includes(niche) &&
    platforms.length > 0 &&
    CREATOR_AD_OPENNESS.some((o) => o.value === openToAds) &&
    CREATOR_FOLLOWERS.some((o) => o.value === followers) &&
    CREATOR_VIEWS_TOTAL.some((o) => o.value === viewsTotal) &&
    CREATOR_VIEWS_30D.some((o) => o.value === views30d) &&
    (!source || AGENCY_SOURCES.some((o) => o.value === source)) &&
    fullName.length > 1 &&
    EMAIL_RE.test(email) &&
    phone.startsWith('+') &&
    hasEnoughDigits(phone) &&
    body.privacy === true

  if (!valid) return c.json({ error: 'Bitte fülle alle Pflichtfelder aus.' }, 400)
  if (rawLink && !cloudLink) {
    return c.json({ error: 'Der Cloud-Link muss mit https:// beginnen, oder lass das Feld leer.' }, 400)
  }
  if (await emailHeldByOtherRole(c.env, email, 'creator')) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }
  if (!(await signupAllowed(c, 'creator'))) {
    return c.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, 429)
  }

  const provisioned = await provisionCreator(c.env, {
    email,
    fullName,
    phone,
    profile: { goal, niche, platforms, openToAds, followers, viewsTotal, views30d, handles, source: source || null },
  })
  if (!provisioned.ok) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }

  const code = await issueLoginCode(c.env, email)

  /*
   * Gibt es den Zugang schon, schreibt das Formular nichts in ihn hinein —
   * keine Kampagne, kein Link, keine neuen Angaben. Es geht nur der
   * Login-Code an die Adresse, wie bei „Code anfordern“.
   */
  if (!provisioned.created) {
    const redirect = await signupLanding(c, {
      userId: provisioned.userId,
      role: 'creator',
      created: false,
      email,
      target: '/kampagnen',
    })
    c.executionCtx.waitUntil(
      mailLoginCode(c.env, { email, displayName: provisioned.fullName, code }),
    )
    return c.json({ ok: true, redirect })
  }

  let target = '/kampagnen'
  let projectId: string | null = null
  if (cloudLink) {
    const project = await createProject(c.env, {
      customerId: provisioned.customerId,
      name: 'Meine erste Kampagne',
      folderName: 'Rohmaterial',
    })
    await addProjectLink(c.env, { projectId: project.id, url: cloudLink, addedBy: provisioned.userId })
    projectId = project.id
    target = `/kampagnen/meine/${project.id}`
  }

  const redirect = await signupLanding(c, {
    userId: provisioned.userId,
    role: 'creator',
    created: true,
    email,
    target,
  })

  await audit(c.env, {
    actorId: provisioned.userId,
    action: 'creator.signed_up',
    entity: 'creator',
    entityId: provisioned.creatorId,
    payload: {
      goal,
      niche,
      platforms,
      openToAds,
      followers,
      viewsTotal,
      views30d,
      cloudLink: !!cloudLink,
    },
  })

  c.executionCtx.waitUntil(
    Promise.all([
      mailCreatorWelcome(c.env, { email, fullName, code }),
      mailCreatorSignupAdmin(c.env, {
        fullName,
        email,
        phone,
        goal: creatorGoalLabel(goal),
        niche,
        platforms: platforms.map(creatorPlatformLabel),
        handles: Object.entries(handles).map(([p, h]) => `${creatorPlatformLabel(p)}: @${h}`),
        openToAds: adOpennessLabel(openToAds),
        followers: followersLabel(followers),
        viewsTotal: viewsTotalLabel(viewsTotal),
        views30d: views30dLabel(views30d),
        source: source ? agencySourceLabel(source) : '–',
        cloudLink,
      }),
      projectId ? notifyMaterialAdded(c.env, projectId) : Promise.resolve(),
    ]),
  )

  return c.json({ ok: true, redirect })
})

/**
 * Agenturen, Marken und Brand-Owner tragen sich selbst ein (/brands).
 *
 * Mit Cooperation-Code ist der Lead WARM, ohne KALT (siehe lib/agency.ts).
 * Ein falscher oder bereits benutzter Code wird hier abgewiesen — das
 * Formular sagt es, und wer keinen Code hat, lässt das Feld leer. Fehlversuche
 * zählen je Verbindung, damit niemand Codes durchprobiert.
 *
 * Die Adresse wird IMMER erst mit dem Code aus der Willkommens-Mail bestätigt:
 * ein warmer Lead sieht danach fremde Kampagnen, das darf nicht an einer
 * erfundenen Adresse hängen.
 */
apiRoutes.post('/agencies', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Ungültige Anfrage.' }, 400)
  }

  if (str(body.website)) {
    await audit(c.env, { action: 'agency.honeypot', entity: 'agency', payload: { ip: clientIp(c) } })
    return c.json({ ok: true, redirect: '/brands' })
  }

  const platforms = pickList(body.platforms, AGENCY_PLATFORMS.map((p) => p.value))
  const clients = str(body.clients, 10)
  const kind = str(body.kind, 20)
  const kindOther = kind === 'sonstiges' ? str(body.kindOther, 120) : ''
  const source = str(body.source, 20)
  const niche = str(body.niche, 80)
  const footage = str(body.footage, 20)
  const rawLink = str(body.footageLink, 2100)
  const footageLink = rawLink ? normalizeCloudLink(rawLink) : null
  const fullName = str(body.fullName, 120)
  const company = str(body.company, 120)
  const email = str(body.email, 190).toLowerCase()
  const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
  const coopCode = normalizeCooperationCode(body.cooperationCode)

  // Alle freiwillig — führendes @ fällt weg, wie bei den Creator-Handles.
  const socials: Record<string, string> = {}
  for (const s of AGENCY_SOCIALS) {
    const value = str(body[`social_${s.value}`], 200).replace(/^@+/, '').trim()
    if (value) socials[s.value] = value
  }

  const valid =
    platforms.length > 0 &&
    AGENCY_CLIENTS.some((o) => o.value === clients) &&
    AGENCY_KINDS.some((o) => o.value === kind) &&
    (kind !== 'sonstiges' || kindOther.length > 1) &&
    AGENCY_SOURCES.some((o) => o.value === source) &&
    (INDUSTRIES as readonly string[]).includes(niche) &&
    AGENCY_FOOTAGE.some((o) => o.value === footage) &&
    fullName.length > 1 &&
    EMAIL_RE.test(email) &&
    phone.startsWith('+') &&
    hasEnoughDigits(phone) &&
    body.privacy === true

  if (!valid) return c.json({ error: 'Bitte fülle alle Pflichtfelder aus.' }, 400)
  if (rawLink && !footageLink) {
    return c.json({ error: 'Der Link zum Rohmaterial muss mit https:// beginnen, oder lass das Feld leer.' }, 400)
  }

  const BAD_CODE =
    'Dieser Cooperation-Code ist ungültig oder wurde bereits verwendet. Prüfe ihn, oder lass das Feld leer.'
  if (coopCode) {
    if (!(await consumeRateLimit(c.env, `coopcode:${clientIp(c)}`, 10, 3600))) {
      return c.json({ error: 'Zu viele Versuche mit Cooperation-Codes. Bitte versuche es später erneut.' }, 429)
    }
    if (!(await openCooperationCode(c.env, coopCode))) return c.json({ error: BAD_CODE }, 400)
  }

  if (await emailHeldByOtherRole(c.env, email, 'agency')) {
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }
  if (!(await signupAllowed(c, 'agency'))) {
    return c.json({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }, 429)
  }

  /*
   * Den Code einlösen, BEVOR der Zugang entsteht — in einer Anweisung, damit
   * zwei gleichzeitige Formulare ihn nicht beide bekommen. Scheitert danach
   * etwas, geht er zurück.
   */
  const codeId = coopCode ? await claimCooperationCode(c.env, coopCode, null) : null
  if (coopCode && !codeId) return c.json({ error: BAD_CODE }, 400)

  const provisioned = await provisionAgency(c.env, { email, fullName, phone, company: company || null })
  if (!provisioned.ok) {
    if (codeId) await releaseCooperationCode(c.env, codeId)
    return c.json({ error: 'Diese E-Mail-Adresse gehört bereits zu einem anderen Zugang.' }, 400)
  }

  const code = await issueLoginCode(c.env, email)
  const redirect = await signupLanding(c, {
    userId: provisioned.userId,
    role: 'agency',
    created: provisioned.created,
    email,
    target: '/collaboration',
  })

  /*
   * Gibt es den Zugang schon, schreibt das Formular nichts in ihn hinein —
   * es könnte jemand sein, der nur die Adresse kennt. Auch der Code bleibt
   * dann unverbraucht: eingelöst wird er nach dem Login im Dashboard.
   */
  if (!provisioned.created) {
    if (codeId) await releaseCooperationCode(c.env, codeId)
    c.executionCtx.waitUntil(mailLoginCode(c.env, { email, displayName: provisioned.fullName, code }))
    return c.json({ ok: true, redirect })
  }

  const db = getDb(c.env)
  const leadId = uid()
  await db.insert(schema.agencyLeads).values({
    id: leadId,
    userId: provisioned.userId,
    customerId: provisioned.customerId,
    company: company || null,
    kind,
    kindOther: kindOther || null,
    hasClients: clients,
    platforms: JSON.stringify(platforms),
    source,
    niche,
    socials: JSON.stringify(socials),
    footage,
    footageLink,
    warm: codeId ? 1 : 0,
    codeId,
    createdAt: nowSec(),
  })
  if (codeId) {
    await db
      .update(schema.cooperationCodes)
      .set({ usedBy: provisioned.userId })
      .where(eq(schema.cooperationCodes.id, codeId))
  }

  await audit(c.env, {
    actorId: provisioned.userId,
    action: 'agency.signed_up',
    entity: 'agency',
    entityId: leadId,
    payload: { warm: Boolean(codeId), clients, kind, platforms, source, niche, footage, footageLink: !!footageLink },
  })

  c.executionCtx.waitUntil(
    Promise.all([
      mailAgencyWelcome(c.env, { email, fullName, code }),
      mailAgencySignupAdmin(c.env, {
        leadId,
        warm: Boolean(codeId),
        code: codeId ? coopCode : null,
        fullName,
        company: company || null,
        email,
        phone,
        kind: agencyKindLabel({ kind, kindOther: kindOther || null }),
        clients: agencyClientsLabel(clients),
        platforms: platforms.map(agencyPlatformLabel),
        source: agencySourceLabel(source),
        niche,
        socials: Object.entries(socials).map(([k, v]) => `${agencySocialLabel(k)}: ${v}`),
        footage: agencyFootageLabel(footage),
        footageLink,
      }),
    ]),
  )

  return c.json({ ok: true, redirect })
})

/* ==========================================================================
   WEBHOOK — Rückmeldungen des Veröffentlichungsanbieters

   Öffentlich erreichbar und bewusst OHNE Rollen-Middleware: der Aufrufer ist
   kein eingeloggter Nutzer, sondern ein fremder Server. Statt einer Sitzung
   weist er sich über eine HMAC-Signatur aus.

   Diese Route steht vor allen Bereichs-Routern, damit keine der Middlewares
   darunter sie abfängt.
   ========================================================================== */

/**
 * Prüft `X-Zernio-Signature` (HMAC-SHA256 über den rohen Text, klein-hex)
 * gegen das hinterlegte Geheimnis.
 *
 * Der Vergleich läuft in konstanter Zeit. Ein `===` auf Strings bricht beim
 * ersten abweichenden Zeichen ab und verrät über die Antwortzeit, wie viele
 * Zeichen stimmten — damit ließe sich eine gültige Signatur Stück für Stück
 * erraten.
 */
async function verifyWebhookSignature(secret: string, body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const given = signature.trim().toLowerCase().replace(/^sha256=/, '')
  if (given.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

apiRoutes.post('/webhooks/zernio', async (c) => {
  const secret = c.env.ZERNIO_WEBHOOK_SECRET
  // Ohne Geheimnis ließe sich jede Meldung fälschen. Dann lieber gar nichts
  // annehmen, als ungeprüft Daten zu übernehmen.
  if (!secret) return c.json({ error: 'Webhook nicht eingerichtet.' }, 503)

  const raw = await c.req.text()
  const signature = c.req.header('x-zernio-signature') ?? c.req.header('x-late-signature') ?? ''
  if (!signature || !(await verifyWebhookSignature(secret, raw, signature))) {
    await audit(c.env, {
      action: 'publish.webhook.rejected',
      entity: 'webhook',
      payload: { ip: clientIp(c), reason: signature ? 'signatur ungültig' : 'signatur fehlt' },
    })
    return c.json({ error: 'Ungültige Signatur.' }, 401)
  }

  let event: any
  try {
    event = JSON.parse(raw)
  } catch {
    return c.json({ error: 'Kein gültiges JSON.' }, 400)
  }

  // Sofort bestätigen, danach in Ruhe verarbeiten. Die Gegenseite wiederholt
  // bei langsamer Antwort — was doppelte Verarbeitung hieße.
  c.executionCtx.waitUntil(handlePublishEvent(c.env, event))
  return c.json({ ok: true })
})

/**
 * Verarbeitet ein Ereignis des Veröffentlichungsanbieters.
 *
 * Die Nutzlast trägt bereits alles Nötige — Zustand je Account, Links und
 * über `metadata` unsere eigene Deliverable-ID. Eine Rückfrage bei der
 * Gegenseite wäre ein Aufruf ohne Erkenntnisgewinn.
 */
async function handlePublishEvent(env: AppEnv['Bindings'], event: any): Promise<void> {
  const type = String(event?.event ?? event?.type ?? '')
  const eventId = String(event?.id ?? '')

  try {
    // Zustellung ist „mindestens einmal". Ohne diese Sperre liefe dasselbe
    // Ereignis bei einer wiederholten Zustellung ein zweites Mal durch.
    if (await seenEvent(env, eventId)) return

    switch (type) {
      /*
       * Post-Ereignisse tragen die vollständige Zielliste. Auch der
       * Teilerfolg kommt hier an: `post.partial` heißt, dass mindestens ein
       * Account draußen ist und mindestens einer nicht.
       */
      case 'post.published':
      case 'post.failed':
      case 'post.partial':
      case 'post.scheduled':
      case 'post.cancelled': {
        const post = event?.post
        if (!post) return
        // Trägt `metadata.creatorId`, gehört der Post zur Verbreitung eines
        // Creators — `applyPostEvent` schreibt dann dessen Freigabe fort,
        // nicht das Video.
        const hit = await applyPostEvent(env, post)
        await audit(env, {
          action: `publish.${type}`,
          entity: 'deliverable',
          payload: {
            postId: post.id ?? post._id ?? null,
            zugeordnet: hit,
            creatorId: typeof post.metadata?.creatorId === 'string' ? post.metadata.creatorId : null,
          },
        })
        return
      }

      /*
       * Ereignisse je einzelnem Ziel. Sie kommen zusätzlich zu den
       * Post-Ereignissen und melden früher, welcher Account fertig ist.
       * Beide Wege laufen durch dieselbe Verrechnung, deshalb ist die
       * doppelte Meldung harmlos.
       */
      case 'post.platform.published':
      case 'post.platform.failed': {
        const post = event?.post
        if (!post) return
        await applyPostEvent(env, post)
        return
      }

      /*
       * Gilt für Projekt- und Creator-Steckplätze gleichermaßen: wem der
       * Account gehört, entscheidet `upsertAccount` allein am Steckplatz.
       */
      case 'account.connected': {
        const account = event?.account ?? {}
        const id = String(account.accountId ?? account.id ?? account._id ?? '')
        const profileId = String(account.profileId ?? '')
        if (!id || !profileId) return
        const result = await upsertAccount(env, {
          id,
          profileId,
          platform: String(account.platform ?? ''),
          username: account.username ?? null,
          displayName: account.displayName ?? null,
        })

        // Dasselbe Konto ein zweites Mal — verwerfen, sonst ginge jedes Video
        // doppelt dorthin. Kann auch hier ankommen, wenn der Webhook den
        // Nutzer bei der Rückkehr überholt.
        if (result.state === 'duplicate') {
          await discardDuplicateAccount(env, id, profileId)
        }

        // Jenseits der Obergrenze — siehe `beyondAccountLimit`. Auch an
        // Projekt-Steckplätzen: was der Administrator verbunden hat, erkennt
        // die Prüfung an seinem Steckplatz und lässt es stehen.
        const overLimit =
          result.state === 'ok' && (await beyondAccountLimit(env, result.owner, id))
        if (overLimit) await discardBeyondLimit(env, id, profileId)

        await audit(env, {
          action: 'publish.account.connected',
          entity: 'account',
          entityId: id,
          payload: {
            platform: account.platform ?? null,
            ausgang: overLimit ? 'limit' : result.state,
            besitzer:
              result.state === 'unknown' ? null : 'creatorId' in result.owner ? 'creator' : 'projekt',
          },
        })
        return
      }

      case 'account.disconnected': {
        const account = event?.account ?? {}
        const id = String(account.accountId ?? account.id ?? account._id ?? '')
        if (id) await removeAccount(env, id)
        return
      }

      default:
        // Alles andere (message.*, review.*) interessiert uns nicht — aber es
        // ist auch kein Fehler, sondern schlicht nichts zu tun.
        return
    }
  } catch (err) {
    console.error('[webhook] Verarbeitung fehlgeschlagen', type, err)
  }
}

/* ==========================================================================
   VORSCHAUBILDER

   Ein Vorschaubild entsteht im BROWSER (public/assets/poster.js) und geht
   von dort direkt nach R2 — wie jede andere Datei auch, der Worker fasst sie
   nie an. Er signiert nur das PUT und schreibt hinterher den Schlüssel in
   die Datenbank.

   Der Schlüssel kommt dabei NICHT aus der Anfrage, sondern wird aus dem
   Schlüssel der Originaldatei abgeleitet (`thumbKeyFor`). Andernfalls ließe
   sich mit einer signierten Adresse jedes beliebige Objekt im Bucket
   überschreiben — auch das Rohmaterial eines anderen Kunden.

   Zwei Anfragen je Bild:

     POST …/thumb        signierte Adresse zum Hochladen
     POST …/thumb/done   „liegt oben" (ok) bzw. „ging nicht" (ok: false)

   Die zweite ist auch im Misserfolgsfall Pflicht. Sie setzt `thumb_tried_at`,
   und ohne diese Spur versuchte es jeder neue Seitenaufruf erneut — bei
   einer Datei, die der Browser gar nicht decodieren kann (ProRes, viele
   AVI/MKV), jedes Mal vergebens und mit vollem Download.
   ========================================================================== */

interface ThumbTarget {
  kind: 'raw' | 'reel'
  id: string
  /** Schlüssel der ORIGINALDATEI — der des Bildes folgt daraus. */
  r2Key: string
}

/**
 * Ergebnis eines Versuchs festhalten. Liefert, ob am Ende ein Bild steht.
 *
 * „Fertig" heißt nicht „der Browser sagt fertig", sondern: das Objekt liegt
 * wirklich oben und hat eine plausible Größe. Ein Eintrag, der ins Leere
 * zeigt, wäre eine dauerhaft kaputte Kachel — und die ließe sich später von
 * einem echten Bild nicht mehr unterscheiden.
 */
async function recordThumb(
  env: AppEnv['Bindings'],
  target: ThumbTarget,
  uploaded: boolean,
): Promise<boolean> {
  const key = thumbKeyFor(target.r2Key)
  const size = uploaded ? await objectSize(env, key).catch(() => 0) : 0
  const ok = size > 0 && size <= THUMB_MAX_BYTES
  if (size > THUMB_MAX_BYTES) await deleteObject(env, key).catch(() => {})

  const db = getDb(env)
  if (target.kind === 'raw') {
    await db
      .update(schema.rawAssets)
      .set(ok ? { thumbKey: key, thumbTriedAt: null } : { thumbTriedAt: nowSec() })
      .where(eq(schema.rawAssets.id, target.id))
  } else {
    await db
      .update(schema.deliverables)
      .set(ok ? { thumbnailKey: key, thumbTriedAt: null } : { thumbTriedAt: nowSec() })
      .where(eq(schema.deliverables.id, target.id))
  }
  return ok
}

/**
 * Hängt die beiden Routen an einen Bereich. Kunde, Clipper und
 * Administration unterscheiden sich nur darin, WEM eine Datei gehören muss —
 * das steckt in `resolve`, alles andere ist dasselbe.
 */
function mountThumbRoutes(
  app: Hono<AppEnv>,
  path: string,
  notFound: string,
  resolve: (c: any, body: any) => Promise<ThumbTarget | null>,
) {
  app.post(path, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const target = await resolve(c, body)
    if (!target) return c.json({ error: notFound }, 404)
    return c.json({ url: await presignPut(c.env, thumbKeyFor(target.r2Key)) })
  })

  app.post(`${path}/done`, async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const target = await resolve(c, body)
    if (!target) return c.json({ error: notFound }, 404)
    return c.json({ ok: await recordThumb(c.env, target, body.ok !== false) })
  })
}

/* ==========================================================================
   KUNDE — Ordner, Uploads, Downloads
   ========================================================================== */

const appApi = new Hono<AppEnv>()
/*
 * Kunden UND Creator: Ein Creator legt seine eigenen Kampagnen genauso an wie
 * ein Kunde seine Projekte — mit Ordnern, Uploads und Cloud-Links in seinem
 * Arbeitsbereich (`customers`). Was ihn unterscheidet, steht bei den
 * fertigen Clips weiter unten.
 */
appApi.use('*', requireRole('customer', 'creator', 'agency'))

/*
 * Agenturen arbeiten mit denselben Wegen an ihren EIGENEN Kampagnen — aber
 * erst, wenn ihr Zugang freigeschaltet ist (siehe lib/agency.ts). Gesperrt
 * heißt hier: gar nichts, auch kein Upload.
 */
appApi.use('*', async (c, next) => {
  const user = c.get('user')
  if (user.role === 'agency' && !agencyUnlocked(await agencyLeadForUser(c.env, user.id))) {
    return c.json({ error: 'Dein Zugang ist noch nicht freigeschaltet.' }, 403)
  }
  await next()
})

/** Kunden und Creator lesen „Kampagne“ — wie im jeweiligen Bereich. */
const projectNotFound = (_c: any) => 'Kampagne nicht gefunden.'

/** Alles rund um Dateien braucht R2. Fehlt die Konfiguration, sagen wir das klar. */
const needsR2 = async (c: any, next: () => Promise<void>) => {
  if (!r2Ready(c.env)) return c.json({ error: R2_MISSING }, 503)
  await next()
}
appApi.use('/uploads/*', needsR2)
appApi.use('/assets/:id/url', needsR2)
appApi.use('/deliverables/:id/url', needsR2)

/** Ordner muss dem eingeloggten Kunden gehören — sonst kein Zugriff. */
async function ownedFolder(c: any, folderId: string) {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return null
  const [folder] = await getDb(c.env)
    .select()
    .from(schema.folders)
    .where(and(eq(schema.folders.id, folderId), eq(schema.folders.customerId, customer.id)))
    .limit(1)
  return folder ? { folder, customer } : null
}

/* ------------------------------------------------------------- Projekte

   Der Kunde legt seine Projekte selbst an. Genau diese Projekte kann Jason
   anschließend einem Clipper zuordnen — deshalb muss der Weg hier liegen
   und nicht nur im Adminbereich.
   -------------------------------------------------------------------------- */

appApi.post('/projects', async (c) => {
  const user = c.get('user')
  // Agenturen starten jede Kampagne über das Briefing (Views, Budget,
  // Auftrag) — POST /api/collaboration/campaigns, nie über ein bloßes Namensfeld.
  if (user.role === 'agency') {
    return c.json({ error: 'Neue Kampagnen startest du über das Briefing unter „Neue Kampagne“.' }, 403)
  }
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const body = await c.req.json().catch(() => ({}))

  /*
   * Seit November 2026 legen Kunde und Creator ihre Kampagnen im selben Formular an
   * wie Agenturen (Vorgabe des Auftraggebers): Name, Bereich, Plattformen, Views,
   * Budget, verbindlicher Auftrag. Dieselben Prüfungen und Preise (parseNewCampaign).
   */
  const full = body.niche !== undefined || body.platforms !== undefined || body.binding !== undefined
  const brief = full ? parseNewCampaign(body) : null
  if (brief && 'error' in brief) return c.json({ error: brief.error }, 400)
  const name = brief ? brief.name : str(body.name, 80)
  if (!name) return c.json({ error: 'Bitte gib einen Namen ein.' }, 400)

  // Älterer Kunden-Weg (Laufzeit und Reichweite) bleibt für offene Seiten bestehen.
  // Ohne alle Angaben bleibt es beim bloßen Namen (ältere Aufrufe).
  const withBrief = !brief && user.role === 'customer' && (body.durationDays !== undefined || body.views !== undefined)
  const durationDays = Number(body.durationDays)
  const views = brief ? brief.views : Number(body.views)
  if (withBrief && !isValidDuration(durationDays)) return c.json({ error: 'Bitte wähle die Laufzeit: 30, 60 oder 90 Tage.' }, 400)
  if (withBrief && !isValidViews(views)) return c.json({ error: 'Bitte wähle die gewünschte Reichweite.' }, 400)

  // Der Startordner heißt neutral „Rohmaterial“ — ein Ordner, der genauso
  // heißt wie das Projekt, das ihn enthält, verwirrt nur.
  const project = await createProject(c.env, {
    customerId: customer.id,
    name,
    folderName: 'Rohmaterial',
  })
  if (brief) {
    await getDb(c.env)
      .update(schema.projects)
      .set({
        briefingViews: brief.views,
        briefingBudgetCents: brief.budgetCents,
        briefingNiche: brief.niche,
        briefingPlatforms: brief.platforms.length ? JSON.stringify(brief.platforms) : null,
        briefingDurationDays: isValidDuration(durationDays) ? durationDays : null,
      })
      .where(eq(schema.projects.id, project.id))
    await mailCustomerCampaignAdmin(c.env, {
      by: user.role === 'creator' ? 'creator' : 'kunde',
      projectId: project.id,
      campaign: name,
      fullName: user.fullName,
      company: customer.company,
      email: user.email,
      phone: user.phone,
      duration: isValidDuration(durationDays) ? `${durationDays} Tage` : '–',
      views: `${brief.views.toLocaleString('de-DE')} Views`,
      niche: brief.niche ?? '–',
      platforms: brief.platforms.map(agencyPlatformLabel).join(', '),
      budget: formatEuro(brief.budgetCents),
      perThousand: formatEuro(pricePerThousandCents(brief)),
    }).catch(() => false)
  }
  if (withBrief) {
    await getDb(c.env)
      .update(schema.projects)
      .set({ briefingViews: views, briefingDurationDays: durationDays })
      .where(eq(schema.projects.id, project.id))
    // Zusätzlich zum Eintrag aus dem ersten Formular: die weiteren Angaben per Mail.
    await mailCustomerCampaignAdmin(c.env, {
      projectId: project.id,
      campaign: name,
      fullName: user.fullName,
      company: customer.company,
      email: user.email,
      phone: user.phone,
      duration: `${durationDays} Tage`,
      views: `${views.toLocaleString('de-DE')} Views`,
    }).catch(() => false)
  }
  await audit(c.env, {
    actorId: user.id,
    action: 'project.created',
    entity: 'project',
    entityId: project.id,
    payload: {
      name,
      by: user.role === 'customer' ? 'kunde' : user.role === 'creator' ? 'creator' : 'agentur',
      ...(withBrief ? { durationDays, views } : {}),
      ...(brief ? { views: brief.views, budgetCents: brief.budgetCents, niche: brief.niche, platforms: brief.platforms, binding: true } : {}),
    },
  })
  // Der angefangene Entwurf (lib/drafts.ts) ist damit erledigt: keine Meldung, keine Erinnerung.
  if (user.role === 'customer') await submitDraft(c.env, user.id, project.id).catch(() => undefined)
  return c.json({ ok: true, id: project.id })
})

/**
 * Entwurf von „Neue Kampagne“ (/app/neu), gespeichert während des Ausfüllens.
 * Wer nicht abschickt, taucht nach 2 Stunden beim Admin auf und bekommt nach
 * 24 Stunden eine Erinnerung (lib/drafts.ts). Nur für Kunden.
 */
appApi.put('/campaign-draft', async (c) => {
  const user = c.get('user')
  if (user.role !== 'customer') return c.json({ error: 'Nur für Kunden.' }, 403)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)
  const body = await c.req.json().catch(() => ({}))
  const id = await saveDraft(c.env, user.id, customer.id, body ?? {})
  return c.json({ ok: true, saved: !!id })
})

appApi.post('/projects/:id', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const body = await c.req.json().catch(() => ({}))
  const name = str(body.name, 80)
  if (!name) return c.json({ error: 'Bitte gib einen Namen ein.' }, 400)

  await getDb(c.env).update(schema.projects).set({ name }).where(eq(schema.projects.id, project.id))
  await audit(c.env, {
    actorId: user.id,
    action: 'project.renamed',
    entity: 'project',
    entityId: project.id,
    payload: { name },
  })
  return c.json({ ok: true })
})

/**
 * Projekt löschen — nur solange nichts drinliegt. Hochgeladenes Material
 * verschwindet so nie versehentlich mit einem Klick.
 */
appApi.delete('/projects/:id', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const db = getDb(c.env)
  const [raw] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(eq(schema.folders.projectId, project.id))
  const [done] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.deliverables)
    .where(eq(schema.deliverables.projectId, project.id))
  // Ein Cloud-Link ist Material wie eine Datei — mit ihm ist das Projekt
  // womöglich schon ein Job, an dem jemand arbeitet.
  const [links] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.projectLinks)
    .where(eq(schema.projectLinks.projectId, project.id))

  if (Number(raw?.n ?? 0) || Number(done?.n ?? 0) || Number(links?.n ?? 0)) {
    return c.json(
      {
        error: 'In dieser Kampagne liegen noch Dateien oder Cloud-Links. Entferne sie zuerst oder benenne die Kampagne um.',
      },
      400,
    )
  }

  /*
   * Erst beim Anbieter freigeben, dann hier löschen — wie `deleteProject`
   * in domain.ts.
   *
   * Seit Kunden ihre Accounts selbst verbinden, kann auch ein LEERES Projekt
   * verbundene Accounts tragen (der Block „Social-Accounts“ steht an jeder
   * Projektwurzel). Steckplätze, Accounts und Gruppe hängen per
   * `ON DELETE cascade` am Projekt; ohne diesen Schritt wären ihre IDs mit
   * der Zeile weg, und die Accounts liefen drüben unsichtbar weiter — je
   * Account und Monat abgerechnet, in keiner Kostenkachel mehr zu sehen und
   * von niemandem mehr zu trennen. Wirft nie; was tatsächlich freigegeben
   * wurde, steht im Prüfprotokoll.
   */
  const released = await releaseAtProvider(c.env, project.id)

  await db.delete(schema.projects).where(eq(schema.projects.id, project.id))
  await audit(c.env, {
    actorId: user.id,
    action: 'project.deleted',
    entity: 'project',
    entityId: project.id,
    payload: { name: project.name, freigegeben: released },
  })
  return c.json({ ok: true })
})

/* ----------------------------------------------------------- Cloud-Links

   Neben dem Upload der zweite Weg, Rohmaterial in ein Projekt zu bringen:
   ein Link zu einem Ordner bei Google Drive, Dropbox, iCloud & Co. Er zählt
   genauso als Material — mit dem ersten Link wird das Projekt zum Job.
   -------------------------------------------------------------------------- */

appApi.post('/projects/:id/links', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const body = await c.req.json().catch(() => ({}))
  const url = normalizeCloudLink(body.url)
  if (!url) {
    return c.json({ error: 'Bitte gib einen vollständigen Link ein, der mit https:// beginnt.' }, 400)
  }

  const link = await addProjectLink(c.env, { projectId: project.id, url, addedBy: user.id })
  if (link.created) {
    await audit(c.env, {
      actorId: user.id,
      action: 'link.added',
      entity: 'project',
      entityId: project.id,
      payload: { url },
    })
    /*
     * Der erste Link gibt dem Projekt Material — dann erfährt es der
     * Administrator (oder der zugeordnete Bearbeiter). Arbeitet schon jemand
     * daran, erfährt er von dem neuen Link genauso wie von neuen Dateien.
     */
    c.executionCtx.waitUntil(
      (async () => {
        // Wer seine Job-Mail schon hat, erfährt vom neuen Link; wer noch
        // keine hat (oder der Administrator), bekommt sie jetzt.
        const notified = (await workersOfProject(c.env, project.id)).filter((w) => w.notifiedAt)
        for (const area of ['clipper', 'creator'] as const) {
          const to = notified.filter((w) => (w.role === 'creator' ? 'creator' : 'clipper') === area).map((w) => w.email)
          if (to.length) await mailLinkAddedClipper(c.env, { to, projectName: project.name, area })
        }
        await notifyMaterialAdded(c.env, project.id)
      })(),
    )
  }
  return c.json({ ok: true, id: link.id, url: link.url })
})

appApi.delete('/links/:id', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const db = getDb(c.env)
  const [row] = await db
    .select({ id: schema.projectLinks.id, projectId: schema.projectLinks.projectId, url: schema.projectLinks.url })
    .from(schema.projectLinks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectLinks.projectId))
    .where(and(eq(schema.projectLinks.id, c.req.param('id')), eq(schema.projects.customerId, customer.id)))
    .limit(1)
  if (!row) return c.json({ error: 'Link nicht gefunden.' }, 404)

  await db.delete(schema.projectLinks).where(eq(schema.projectLinks.id, row.id))
  await audit(c.env, {
    actorId: user.id,
    action: 'link.removed',
    entity: 'project',
    entityId: row.projectId,
    payload: { url: row.url },
  })
  return c.json({ ok: true })
})

/* ------------------------------------------------------ Social-Accounts

   Der Kunde verbindet die Accounts seines Projekts selbst — derselbe Weg
   wie im Adminbereich, nur auf die eigenen Projekte beschränkt. Fertige
   Clips gehen danach ohne weiteren Klick dorthin.

   Nur Kunden. Ein Creator verbindet seine Accounts EINMAL für alle seine
   Kampagnen unter „Meine Accounts“; am Projekt verbunden, kostete jeder
   davon je Kampagne noch einmal, weil je verbundenem Account abgerechnet
   wird. Den Schalter „Verbreitung über Creator“ darf dagegen jeder Besitzer
   setzen — auch ein Creator für seine eigene Kampagne.
   -------------------------------------------------------------------------- */

const accountsOnlyForCustomers = (c: any) =>
  c.json({ error: 'Deine Accounts verbindest du unter „Meine Accounts“, einmal für alle deine Kampagnen.' }, 403)

/**
 * Zernio rechnet jeden Aufruf mit. Ein Knopf, den jemand im Sekundentakt
 * drückt, soll dort keine Flut auslösen — 30 Verbinden- oder
 * Aktualisieren-Klicks in zehn Minuten reichen für jeden echten Gebrauch.
 */
const publishRateLimited = async (c: any) =>
  !(await consumeRateLimit(c.env, `publish:${c.get('user').id}`, 30, 600))

/** Adresse zum Verbinden EINES Accounts — je Plattform beliebig oft, jeder braucht seine Zustimmung. */
appApi.post('/projects/:id/connect/:platform', async (c) => {
  const user = c.get('user')
  if (user.role !== 'customer' && user.role !== 'agency') return accountsOnlyForCustomers(c)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const platform = c.req.param('platform')
  if (!isConnectable(platform)) return c.json({ error: 'Diese Plattform wird nicht unterstützt.' }, 400)
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Das Verbinden ist gerade nicht verfügbar. Bitte versuch es später noch einmal.' }, 503)
  }
  if (await publishRateLimited(c)) {
    return c.json({ error: 'Zu viele Versuche hintereinander. Bitte warte ein paar Minuten.' }, 429)
  }
  // Jeder Account kostet monatlich — gezählt über ALLE Projekte des Kunden
  // (siehe `ACCOUNT_LIMIT`).
  if ((await connectedAccountCount(c.env, { customerId: customer.id })) >= ACCOUNT_LIMIT.customer) {
    return c.json(
      {
        error: `In deinem Konto sind bereits ${ACCOUNT_LIMIT.customer} Accounts verbunden: das ist die Obergrenze. Trenne einen, den du nicht mehr brauchst, oder schreib uns, wenn du mehr brauchst.`,
      },
      409,
    )
  }

  try {
    /*
     * Zurück geht es auf die Projektseite — dort wertet `absorbConnectReturn`
     * die Rückkehr aus und prüft, dass der Steckplatz zu GENAU diesem Projekt
     * gehört. Bewusst die kurze Adresse ohne Zusätze: Für X darf sie
     * URL-kodiert höchstens 258 Zeichen lang sein.
     */
    const url = await connectUrlForProject(
      c.env,
      project.id,
      platform,
      `${c.env.APP_URL}${(user.role === 'agency' ? AGENCY_CAMPAIGN_AREA : CUSTOMER_AREA).projectHref(project.id)}`,
    )
    await audit(c.env, {
      actorId: user.id,
      action: 'publish.connect',
      entity: 'project',
      entityId: project.id,
      payload: { platform, by: 'kunde' },
    })
    return c.json({ ok: true, url })
  } catch (err) {
    console.error('[app] Verbindungslink fehlgeschlagen', project.id, platform, err)
    return c.json(
      { error: 'Der Link zum Verbinden ließ sich gerade nicht erstellen. Bitte versuch es gleich noch einmal.' },
      502,
    )
  }
})

/**
 * Einen Account des Projekts trennen. Getrennt wird nur, was an DIESEM
 * Projekt hängt — eine fremde Account-ID liefert 404, auch wenn sie
 * existiert (siehe `disconnectAccountFromProject`).
 */
appApi.delete('/projects/:id/accounts/:accountId', async (c) => {
  const user = c.get('user')
  if (user.role !== 'customer' && user.role !== 'agency') return accountsOnlyForCustomers(c)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const accountId = str(c.req.param('accountId'), 120)
  const ok = await disconnectAccountFromProject(c.env, project.id, accountId)
  if (!ok) return c.json({ error: 'Account nicht gefunden.' }, 404)

  await audit(c.env, {
    actorId: user.id,
    action: 'publish.account.disconnected',
    entity: 'project',
    entityId: project.id,
    payload: { accountId, by: 'kunde' },
  })
  return c.json({ ok: true })
})

/** Accounts des Projekts frisch vom Anbieter holen — falls drüben etwas von Hand geändert wurde. */
appApi.post('/projects/:id/sync-accounts', async (c) => {
  const user = c.get('user')
  if (user.role !== 'customer' && user.role !== 'agency') return accountsOnlyForCustomers(c)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  if (await publishRateLimited(c)) {
    return c.json({ error: 'Zu viele Versuche hintereinander. Bitte warte ein paar Minuten.' }, 429)
  }

  try {
    const count = await syncAccounts(c.env, project.id)
    return c.json({ ok: true, count })
  } catch (err) {
    console.error('[app] Abgleich fehlgeschlagen', project.id, err)
    return c.json({ error: 'Das Aktualisieren hat gerade nicht geklappt. Bitte versuch es gleich noch einmal.' }, 502)
  }
})

/**
 * Verbreitung über Creator ein- oder ausschalten.
 *
 * Standard ist aus: ohne ausdrückliche Zustimmung landet kein Clip auf
 * fremden Kanälen. Ausschalten wirkt sofort — `creatorMayDistribute` prüft
 * den Schalter vor jedem Senden, auch vor jedem Nachschuss. Beigetretene
 * Creator bleiben beigetreten und posten nach dem Wiedereinschalten weiter.
 */
appApi.patch('/projects/:id/distribution', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const project = await projectOfCustomer(c.env, customer.id, c.req.param('id'))
  if (!project) return c.json({ error: projectNotFound(c) }, 404)

  const body = await c.req.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'Ungültige Angabe.' }, 400)

  await getDb(c.env)
    .update(schema.projects)
    .set({ creatorDistribution: body.enabled ? 1 : 0 })
    .where(eq(schema.projects.id, project.id))
  if (body.enabled) c.executionCtx.waitUntil(distributeWithTeamCreators(c.env, project.id))
  await audit(c.env, {
    actorId: user.id,
    action: 'project.distribution',
    entity: 'project',
    entityId: project.id,
    payload: { enabled: body.enabled, by: user.role === 'customer' ? 'kunde' : user.role === 'creator' ? 'creator' : 'agentur' },
  })
  return c.json({ ok: true, enabled: body.enabled })
})

/* ----------------------------------------- eigenes Kampagnen-Thumbnail */

const THUMB_ERRORS_DE: Record<string, string> = {
  invalid: 'Ungültiger Upload.',
  missing: 'Das Bild ist nicht angekommen, bitte versuche es erneut.',
  too_large: 'Das Bild ist zu groß.',
}

async function ownProject(c: any) {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return null
  return projectOfCustomer(c.env, customer.id, c.req.param('id'))
}

appApi.post('/projects/:id/thumb', needsR2, async (c) => {
  const project = await ownProject(c)
  if (!project) return c.json({ error: projectNotFound(c) }, 404)
  return c.json(await startCustomThumb(c.env, project))
})

appApi.post('/projects/:id/thumb/done', needsR2, async (c) => {
  const project = await ownProject(c)
  if (!project) return c.json({ error: projectNotFound(c) }, 404)
  const body = await c.req.json().catch(() => ({}))
  const result = await finishCustomThumb(c.env, project, str(body.key, 300))
  if (!result.ok) return c.json({ error: THUMB_ERRORS_DE[result.error] ?? 'Upload fehlgeschlagen.' }, 400)
  await audit(c.env, { actorId: c.get('user').id, action: 'project.thumb_set', entity: 'project', entityId: project.id })
  return c.json({ ok: true })
})

appApi.delete('/projects/:id/thumb', async (c) => {
  const project = await ownProject(c)
  if (!project) return c.json({ error: projectNotFound(c) }, 404)
  await removeCustomThumb(c.env, project)
  await audit(c.env, { actorId: c.get('user').id, action: 'project.thumb_removed', entity: 'project', entityId: project.id })
  return c.json({ ok: true })
})

/* --------------------------------------------------------------- Ordner */

appApi.post('/folders', async (c) => {
  const user = c.get('user')
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const name = str(body.name, 80)
  if (!name) return c.json({ error: 'Bitte gib einen Namen ein.' }, 400)

  const parentId = str(body.parentId, 60) || null
  const parent = parentId ? await ownedFolder(c, parentId) : null
  if (parentId && !parent) return c.json({ error: 'Ordner nicht gefunden.' }, 404)

  /**
   * Zu welchem Projekt gehört der neue Ordner?
   *
   * Ein Kunde kann mehrere Projekte haben — Restaurant, Personal Brand,
   * Software-Firma —, und an dem Projekt hängt, welche Clipper das
   * Material später sehen. Deshalb muss die Zuordnung stimmen:
   *
   *   · Unterordner erben das Projekt ihres Elternordners.
   *   · Auf oberster Ebene kommt es aus der Projektansicht (`projectId`).
   *   · Ohne Angabe — etwa aus einem alten Formular — das erste Projekt.
   *
   * Ein mitgeschicktes Projekt, das dem Kunden nicht gehört, ist ein Fehler
   * und keine Einladung zur Rückfallebene: Der Ordner landete sonst still im
   * falschen Projekt und damit vor den falschen Augen.
   */
  let projectId: string | null = parent?.folder.projectId ?? null
  if (!parent) {
    const wanted = str(body.projectId, 60)
    if (wanted) {
      const project = await projectOfCustomer(c.env, customer.id, wanted)
      if (!project) return c.json({ error: projectNotFound(c) }, 404)
      projectId = project.id
    }
    if (!projectId) projectId = (await primaryProject(c.env, customer.id))?.id ?? null
  }
  if (parent && !projectId) {
    // Altbestand ohne Projekt am Elternordner — auf das erste zurückfallen.
    projectId = (await primaryProject(c.env, customer.id))?.id ?? null
  }

  const id = uid()
  await getDb(c.env).insert(schema.folders).values({
    id,
    customerId: customer.id,
    projectId,
    name,
    parentId,
    createdAt: nowSec(),
  })
  await audit(c.env, { actorId: user.id, action: 'folder.created', entity: 'folder', entityId: id, payload: { name } })
  return c.json({ ok: true, id })
})

/** Löschen heißt Papierkorb — 30 Tage Aufbewahrung. */
appApi.delete('/folders/:id', async (c) => {
  const owned = await ownedFolder(c, c.req.param('id'))
  if (!owned) return c.json({ error: 'Ordner nicht gefunden.' }, 404)

  const ts = nowSec()
  const db = getDb(c.env)
  await db.update(schema.folders).set({ deletedAt: ts }).where(eq(schema.folders.id, owned.folder.id))
  await db
    .update(schema.rawAssets)
    .set({ deletedAt: ts })
    .where(and(eq(schema.rawAssets.folderId, owned.folder.id), isNull(schema.rawAssets.deletedAt)))

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'folder.trashed',
    entity: 'folder',
    entityId: owned.folder.id,
  })
  return c.json({ ok: true })
})

appApi.post('/folders/:id/restore', async (c) => {
  const owned = await ownedFolder(c, c.req.param('id'))
  if (!owned) return c.json({ error: 'Ordner nicht gefunden.' }, 404)

  const db = getDb(c.env)
  await db.update(schema.folders).set({ deletedAt: null }).where(eq(schema.folders.id, owned.folder.id))
  await db
    .update(schema.rawAssets)
    .set({ deletedAt: null })
    .where(eq(schema.rawAssets.folderId, owned.folder.id))

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'folder.restored',
    entity: 'folder',
    entityId: owned.folder.id,
  })
  return c.json({ ok: true })
})

/**
 * Upload vorbereiten. Der Worker fasst die Datei nie an — er liefert nur
 * signierte URLs, der Browser lädt direkt zu R2.
 */
appApi.post('/uploads/init', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const folderId = str(body.folderId, 60)
  const filename = safeFilename(str(body.filename, 200))
  const size = Math.max(0, Number(body.size) || 0)

  const owned = await ownedFolder(c, folderId)
  if (!owned) return c.json({ error: 'Ordner nicht gefunden.' }, 404)
  if (!isAllowedFile(filename)) {
    return c.json({ error: 'Dateityp nicht erlaubt (mp4, mov, avi, mkv, webm, jpg, png).' }, 400)
  }

  // Gleicher Dateiname, gleicher Ordner, Upload noch offen? Dann fortsetzen
  // statt neu beginnen — der Browser überspringt die fertigen Parts.
  const resumed = await resumeUpload(c.env, {
    table: 'raw_assets',
    folderId: owned.folder.id,
    filename,
    size,
  })
  if (resumed) return c.json(resumed)

  const key = buildKey(owned.customer.id, owned.folder.id, filename)
  const mime = mimeFor(filename)
  const id = uid()
  const multipart = size >= MULTIPART_THRESHOLD

  const uploadParts = multipart
    ? { uploadId: await createMultipartUpload(c.env, key, mime), partSize: PART_SIZE, parts: [] as unknown[] }
    : null

  await getDb(c.env).insert(schema.rawAssets).values({
    id,
    folderId: owned.folder.id,
    r2Key: key,
    filename,
    bytes: size,
    mime,
    uploadStatus: 'uploading',
    uploadParts: uploadParts ? JSON.stringify(uploadParts) : null,
    createdAt: nowSec(),
  })

  await audit(c.env, {
    actorId: user.id,
    action: 'asset.upload_started',
    entity: 'raw_asset',
    entityId: id,
    payload: { filename, size, multipart },
  })

  return c.json(
    multipart
      ? { assetId: id, mode: 'multipart', uploadId: uploadParts!.uploadId, partSize: PART_SIZE, done: [] }
      : { assetId: id, mode: 'single', url: await presignPut(c.env, key) },
  )
})

/** Signierte URL für einen einzelnen Part. */
appApi.post('/uploads/part', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const asset = await ownedAsset(c, str(body.assetId, 60))
  if (!asset) return c.json({ error: 'Upload nicht gefunden.' }, 404)

  const meta = JSON.parse(asset.raw.uploadParts ?? '{}')
  const partNumber = Number(body.partNumber)
  if (!meta.uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return c.json({ error: 'Ungültiger Part.' }, 400)
  }
  return c.json({ url: await presignPart(c.env, asset.raw.r2Key, meta.uploadId, partNumber) })
})

appApi.post('/uploads/complete', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const asset = await ownedAsset(c, str(body.assetId, 60))
  if (!asset) return c.json({ error: 'Upload nicht gefunden.' }, 404)

  const meta = JSON.parse(asset.raw.uploadParts ?? 'null')
  if (meta?.uploadId) {
    const parts = Array.isArray(body.parts)
      ? body.parts.map((p: any) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
      : []
    if (!parts.length) return c.json({ error: 'Keine Parts übermittelt.' }, 400)
    await completeMultipartUpload(c.env, asset.raw.r2Key, meta.uploadId, parts)
  }

  const bytes = await objectSize(c.env, asset.raw.r2Key)
  await getDb(c.env)
    .update(schema.rawAssets)
    .set({ uploadStatus: 'complete', bytes, uploadParts: null })
    .where(eq(schema.rawAssets.id, asset.raw.id))

  await addStorage(c.env, asset.customer.id, bytes)
  await checkStorageWarning(c.env, asset.customer.id)
  await audit(c.env, {
    actorId: user.id,
    action: 'asset.uploaded',
    entity: 'raw_asset',
    entityId: asset.raw.id,
    payload: { filename: asset.raw.filename, bytes },
  })

  // Erst jetzt liegt wirklich Material im Projekt — die Job-Mail an den
  // Clipper geht deshalb von hier aus, nicht schon beim Anlegen.
  const project = await projectForFolder(c.env, asset.folder)
  if (project) c.executionCtx.waitUntil(notifyMaterialAdded(c.env, project.id))

  return c.json({ ok: true, bytes })
})

appApi.post('/uploads/abort', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const asset = await ownedAsset(c, str(body.assetId, 60))
  if (!asset) return c.json({ error: 'Upload nicht gefunden.' }, 404)

  const meta = JSON.parse(asset.raw.uploadParts ?? 'null')
  if (meta?.uploadId) await abortMultipartUpload(c.env, asset.raw.r2Key, meta.uploadId)
  await getDb(c.env)
    .update(schema.rawAssets)
    .set({ uploadStatus: 'aborted', deletedAt: nowSec() })
    .where(eq(schema.rawAssets.id, asset.raw.id))
  return c.json({ ok: true })
})

/* Der Kunde erzeugt das Vorschaubild beim Upload aus der Datei, die ohnehin
   schon auf seiner Platte liegt — es kostet ihn keine Übertragung. */
mountThumbRoutes(appApi, '/uploads/thumb', 'Upload nicht gefunden.', async (c, body) => {
  const asset = await ownedAsset(c, str(body.assetId, 60))
  return asset ? { kind: 'raw', id: asset.raw.id, r2Key: asset.raw.r2Key } : null
})

appApi.delete('/assets/:id', async (c) => {
  const asset = await ownedAsset(c, c.req.param('id'))
  if (!asset) return c.json({ error: 'Datei nicht gefunden.' }, 404)

  await getDb(c.env)
    .update(schema.rawAssets)
    .set({ deletedAt: nowSec() })
    .where(eq(schema.rawAssets.id, asset.raw.id))
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'asset.trashed',
    entity: 'raw_asset',
    entityId: asset.raw.id,
  })
  return c.json({ ok: true })
})

appApi.post('/assets/:id/restore', async (c) => {
  const asset = await ownedAsset(c, c.req.param('id'))
  if (!asset) return c.json({ error: 'Datei nicht gefunden.' }, 404)
  await getDb(c.env)
    .update(schema.rawAssets)
    .set({ deletedAt: null })
    .where(eq(schema.rawAssets.id, asset.raw.id))
  return c.json({ ok: true })
})

appApi.get('/assets/:id/url', async (c) => {
  const asset = await ownedAsset(c, c.req.param('id'))
  if (!asset) return c.json({ error: 'Datei nicht gefunden.' }, 404)
  const download = c.req.query('download') === '1'
  return c.json({
    url: await presignGet(c.env, asset.raw.r2Key, download ? asset.raw.filename : undefined),
  })
})

/**
 * Beim Verlassen eines Ordners mit frisch hochgeladenen Dateien werden die
 * zugeordneten Clipper benachrichtigt — mit Codename, nie mit Firmennamen.
 */
appApi.post('/folders/:id/notify', async (c) => {
  const owned = await ownedFolder(c, c.req.param('id'))
  if (!owned) return c.json({ error: 'Ordner nicht gefunden.' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const count = Math.max(0, Number(body.count) || 0)
  if (!count) return c.json({ ok: true, sent: false })

  // Benachrichtigt werden die Clipper genau des Projekts, zu dem der
  // Ordner gehört — nicht alle des Kunden. Sonst bekäme der Cutter der
  // Software-Firma Post über neues Restaurant-Material.
  const project = await projectForFolder(c.env, owned.folder)
  if (!project) return c.json({ ok: true, sent: false })

  const groups = await workerRecipients(c.env, project.id)
  const recipients = { to: groups.flatMap((g) => g.to) }
  if (!recipients.to.length) return c.json({ ok: true, sent: false })

  c.executionCtx.waitUntil(
    Promise.all(
      groups.map((g) =>
        mailUploadClipper(c.env, {
          to: g.to,
          projectName: project.name,
          folderName: owned.folder.name,
          count,
          area: g.area,
        }),
      ),
    ),
  )
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'folder.upload_notified',
    entity: 'folder',
    entityId: owned.folder.id,
    payload: { count, recipients: recipients.to.length },
  })
  return c.json({ ok: true, sent: true })
})

appApi.get('/deliverables/:id/url', async (c) => {
  const user = c.get('user')
  // Fertige Clips sind Sache des Kunden. Ein Creator gibt Material in seine
  // eigenen Kampagnen, die fertigen Clips sieht er dort nicht.
  if (user.role !== 'customer') return c.json({ error: 'Video nicht gefunden.' }, 404)
  const customer = await customerForUser(c.env, user.id)
  if (!customer) return c.json({ error: 'Kein Kundenkonto.' }, 400)

  const db = getDb(c.env)
  const [row] = await db
    .select({ d: schema.deliverables })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .where(
      and(eq(schema.deliverables.id, c.req.param('id')), eq(schema.projects.customerId, customer.id)),
    )
    .limit(1)
  if (!row) return c.json({ error: 'Video nicht gefunden.' }, 404)

  if (!row.d.seenByCustomer) {
    await db
      .update(schema.deliverables)
      .set({ seenByCustomer: 1 })
      .where(eq(schema.deliverables.id, row.d.id))
  }

  const download = c.req.query('download') === '1'
  return c.json({ url: await presignGet(c.env, row.d.r2Key, download ? row.d.filename : undefined) })
})

appApi.post('/settings', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const fullName = str(body.fullName, 120)
  const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
  const company = str(body.company, 120)
  if (!fullName) return c.json({ error: 'Bitte gib deinen Namen an.' }, 400)

  const db = getDb(c.env)
  await db.update(schema.users).set({ fullName, phone: phone || null }).where(eq(schema.users.id, user.id))
  const customer = await customerForUser(c.env, user.id)
  if (customer) {
    await db
      .update(schema.customers)
      .set({ company: company || null })
      .where(eq(schema.customers.id, customer.id))
  }
  await audit(c.env, { actorId: user.id, action: 'settings.updated', entity: 'user', entityId: user.id })
  return c.json({ ok: true })
})

/** Datei + zugehöriger Kunde, streng auf den eingeloggten Nutzer gefiltert. */
async function ownedAsset(c: any, assetId: string) {
  const customer = await customerForUser(c.env, c.get('user').id)
  if (!customer) return null
  const [row] = await getDb(c.env)
    .select({ raw: schema.rawAssets, folder: schema.folders })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(and(eq(schema.rawAssets.id, assetId), eq(schema.folders.customerId, customer.id)))
    .limit(1)
  return row ? { raw: row.raw, folder: row.folder, customer } : null
}

apiRoutes.route('/app', appApi)

/* ==========================================================================
   ADMIN
   ========================================================================== */

const adminApi = new Hono<AppEnv>()
adminApi.use('*', requireRole('admin'))
adminApi.use('/assets/:id/url', needsR2)
adminApi.use('/deliverables/:id/url', needsR2)
adminApi.use('/media/*', needsR2)

/**
 * Der Selbsttest der Anmeldung auf Abruf — dieselben Prüfungen, die alle 15
 * Minuten von selbst laufen. Wer wissen will, ob der Login gerade
 * funktioniert, fragt hier und muss niemanden bitten, es auszuprobieren.
 */
adminApi.get('/health/login', async (c) => {
  const result = await loginSelfTest(c.env)
  return c.json(result, result.ok ? 200 : 503)
})

/**
 * Einen Lead ändern — Status, Notizen UND die personenbezogenen Daten.
 *
 * Name, Firma, Adresse und Telefonnummer kommen aus einem Formular, das der
 * Interessent selbst ausgefüllt hat. Da steht regelmäßig ein Tippfehler in
 * der Adresse, eine Nummer ohne Vorwahl oder ein Name in Kleinschreibung —
 * und bisher war nichts davon zu berichtigen. Der Datensatz war ab dem
 * Absenden in Stein.
 *
 * Hängt am Lead bereits ein Zugang, wandert die Änderung mit: sie IST die
 * Anmeldeadresse dieses Kunden. Blieben beide auseinander, stünde im
 * Lead-Bereich die berichtigte Adresse und der Login-Code ginge weiter an die
 * falsche.
 */
adminApi.post('/leads/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const db = getDb(c.env)
  const leadId = c.req.param('id')

  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1)
  if (!lead) return c.json({ error: 'Lead not found.' }, 404)

  const patch: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!(LEAD_STATUS as readonly string[]).includes(body.status)) {
      return c.json({ error: 'Unknown status.' }, 400)
    }
    patch.status = body.status
  }
  if (typeof body.notes === 'string') patch.notes = str(body.notes, 4000)

  if (typeof body.fullName === 'string') {
    const fullName = str(body.fullName, 120)
    if (!fullName) return c.json({ error: 'The name cannot be empty.' }, 400)
    patch.fullName = fullName
  }
  if (typeof body.company === 'string') {
    const company = str(body.company, 120)
    patch.company = company || null
  }
  if (typeof body.email === 'string') {
    const email = str(body.email, 190).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      return c.json({ error: 'That is not a valid email address.' }, 400)
    }
    patch.email = email
  }
  if (typeof body.phone === 'string') {
    const phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
    if (!phone) return c.json({ error: 'The phone number cannot be empty.' }, 400)
    patch.phone = phone
  }

  if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change.' }, 400)

  /*
   * Der Zugang zuerst: schlägt die Adresse dort fehl (sie gehört schon einem
   * anderen Konto), bleibt der Lead unverändert. Andersherum stünden zwei
   * verschiedene Adressen für denselben Menschen in der Datenbank.
   */
  let account = false
  if (lead.customerId && ('fullName' in patch || 'email' in patch || 'phone' in patch)) {
    const [customer] = await db
      .select({ userId: schema.customers.userId })
      .from(schema.customers)
      .where(eq(schema.customers.id, lead.customerId))
      .limit(1)
    if (customer) {
      const result = await updateUserIdentity(c.env, customer.userId, {
        fullName: patch.fullName as string | undefined,
        email: patch.email as string | undefined,
        phone: patch.phone as string | undefined,
      })
      if (!result.ok) return c.json({ error: result.error }, 400)
      account = true
    }
  }
  if (lead.customerId && 'company' in patch) {
    await db
      .update(schema.customers)
      .set({ company: patch.company as string | null })
      .where(eq(schema.customers.id, lead.customerId))
  }

  await db.update(schema.leads).set(patch).where(eq(schema.leads.id, leadId))
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'lead.updated',
    entity: 'lead',
    entityId: leadId,
    payload: { ...patch, account },
  })
  return c.json({ ok: true, account })
})

/**
 * Die personenbezogenen Daten eines Kundenzugangs ändern.
 *
 * Derselbe Vorgang wie am Lead, nur von der anderen Seite: Auf der Kunden-
 * und der Projektseite steht dieser Datensatz, nicht der Lead — und der
 * Administrator soll ihn dort berichtigen können, wo er ihn sieht, statt erst
 * den zugehörigen Lead suchen zu müssen. Existiert der Lead noch, zieht er
 * mit, damit nicht zwei Stellen Verschiedenes behaupten.
 */
/** „Kampagne pushen“-Popup: alle wie viele Tage (0 = aus, null = Standard 7). Admin-Abschnitt „Push popup“. */
adminApi.put('/customers/:id/push-popup', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const r = await setPushPopupDays(c.env, c.req.param('id'), (body as any).days)
  if ('error' in r) return c.json({ error: r.error }, r.error === 'Customer not found.' ? 404 : 400)
  await audit(c.env, { actorId: c.get('user').id, action: 'customer.push_popup', entity: 'customer', entityId: c.req.param('id'), payload: { days: r.days } })
  return c.json({ ok: true, days: r.days })
})

adminApi.post('/customers/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const db = getDb(c.env)
  const customerId = c.req.param('id')

  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1)
  if (!customer) return c.json({ error: 'Customer not found.' }, 404)

  const identity: { fullName?: string; email?: string; phone?: string } = {}
  if (typeof body.fullName === 'string') identity.fullName = str(body.fullName, 120)
  if (typeof body.email === 'string') identity.email = str(body.email, 190).toLowerCase()
  if (typeof body.phone === 'string') {
    identity.phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
  }

  if (Object.keys(identity).length) {
    const result = await updateUserIdentity(c.env, customer.userId, identity)
    if (!result.ok) return c.json({ error: result.error }, 400)
  }

  let company: string | null | undefined
  if (typeof body.company === 'string') {
    company = str(body.company, 120) || null
    await db.update(schema.customers).set({ company }).where(eq(schema.customers.id, customerId))
  }

  if (!Object.keys(identity).length && company === undefined) {
    return c.json({ error: 'Nothing to change.' }, 400)
  }

  // Die Lead-Einträge desselben Menschen mitziehen — sie sind dieselbe Person.
  const leadPatch: Record<string, unknown> = {}
  if (identity.fullName) leadPatch.fullName = identity.fullName
  if (identity.email) leadPatch.email = identity.email
  if (identity.phone) leadPatch.phone = identity.phone
  if (company !== undefined) leadPatch.company = company
  if (Object.keys(leadPatch).length) {
    await db.update(schema.leads).set(leadPatch).where(eq(schema.leads.customerId, customerId))
  }

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'customer.updated',
    entity: 'customer',
    entityId: customerId,
    payload: { ...identity, company },
  })
  return c.json({ ok: true })
})

/** Name, Adresse und Telefonnummer eines Clippers ändern. */
adminApi.post('/clippers/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const db = getDb(c.env)
  const clipperId = c.req.param('id')

  const [clipper] = await db
    .select()
    .from(schema.clippers)
    .where(eq(schema.clippers.id, clipperId))
    .limit(1)
  if (!clipper) return c.json({ error: 'Clipper not found.' }, 404)

  const identity: { fullName?: string; email?: string; phone?: string } = {}
  if (typeof body.name === 'string') identity.fullName = str(body.name, 120)
  if (typeof body.email === 'string') identity.email = str(body.email, 190).toLowerCase()
  if (typeof body.phone === 'string') {
    identity.phone = composePhone(str(body.phoneDial, 8), str(body.phone, 60))
  }
  if (!Object.keys(identity).length) return c.json({ error: 'Nothing to change.' }, 400)

  const result = await updateUserIdentity(c.env, clipper.userId, identity)
  if (!result.ok) return c.json({ error: result.error }, 400)

  // `display_name` ist der Name, der an den Projekten steht — er muss mit.
  if (identity.fullName) {
    await db
      .update(schema.clippers)
      .set({ displayName: identity.fullName })
      .where(eq(schema.clippers.id, clipperId))
  }

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clipper.updated',
    entity: 'clipper',
    entityId: clipperId,
    payload: identity,
  })
  return c.json({ ok: true })
})

/**
 * Lead zum Kunden erklären — oder das zurücknehmen.
 *
 * Die einzige Stelle, an der jemand Kunde wird. Wer sich einträgt, bleibt bis
 * hierher ein Lead mit eigenem Zugang: Nicht jede Anfrage wird ein Auftrag,
 * und diese Entscheidung trifft Jason, nicht das Formular.
 */
adminApi.post('/leads/:id/kunde', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const converted = body.converted !== false

  const db = getDb(c.env)
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param('id'))).limit(1)
  if (!lead) return c.json({ error: 'Lead not found.' }, 404)
  if (!lead.customerId) return c.json({ error: 'This lead has no account.' }, 400)

  await setCustomerConverted(c.env, lead.customerId, converted)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: converted ? 'lead.converted' : 'lead.unconverted',
    entity: 'lead',
    entityId: lead.id,
    payload: { customerId: lead.customerId },
  })
  return c.json({ ok: true, converted })
})

/**
 * Lead löschen. Hängt daran ein Zugang, der noch kein Kunde ist, verschwindet
 * er mitsamt Projekten und Dateien — ein Testeintrag lässt sich so restlos
 * entfernen.
 *
 * Ist der Zugang bereits Kunde, bleibt er ohne `?account=1` bestehen und nur
 * der Lead-Eintrag geht weg. Dann bleibt aber auch die E-Mail-Adresse
 * vergeben: Sie hängt am Nutzer, nicht am Lead, und jeder Selbsteintrag mit
 * ihr scheitert an „gehört bereits zu einem anderen Zugang“. Mit
 * `?account=1` geht der Kundenzugang mit — der Admin-Bereich fragt das
 * ausdrücklich ab, statt die Adresse stillschweigend belegt zu lassen.
 */
adminApi.delete('/leads/:id', async (c) => {
  const db = getDb(c.env)
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param('id'))).limit(1)
  if (!lead) return c.json({ error: 'Lead not found.' }, 404)

  const withCustomer = c.req.query('account') === '1'
  let account = false
  if (lead.customerId) {
    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, lead.customerId))
      .limit(1)
    if (customer && (!customer.convertedAt || withCustomer)) {
      await deleteCustomerAccount(c.env, customer.id)
      account = true
    }
  }
  if (!account) await db.delete(schema.leads).where(eq(schema.leads.id, lead.id))

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'lead.deleted',
    entity: 'lead',
    entityId: lead.id,
    payload: { name: lead.fullName, email: lead.email, account },
  })
  return c.json({ ok: true, account })
})

/** Kundenzugang restlos löschen — samt Projekten, Ordnern, Dateien und Leads. */
adminApi.delete('/customers/:id', async (c) => {
  const summary = await deleteCustomerAccount(c.env, c.req.param('id'))
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'customer.deleted',
    entity: 'customer',
    entityId: c.req.param('id'),
    payload: summary,
  })
  return c.json({ ok: true, ...summary })
})

/**
 * Clipper löschen. Seine bereits gelieferten Videos bleiben beim Kunden,
 * seine Projekte verlieren ihre Zuordnung und warten auf einen neuen
 * Bearbeiter.
 */
adminApi.delete('/clippers/:id', async (c) => {
  const ok = await deleteClipperAccount(c.env, c.req.param('id'))
  if (!ok) return c.json({ error: 'Clipper not found.' }, 404)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clipper.deleted',
    entity: 'clipper',
    entityId: c.req.param('id'),
  })
  return c.json({ ok: true })
})

/**
 * Creator löschen — mit eigenen Kampagnen, Dateien und verbundenen Accounts
 * (siehe `deleteCreatorAccount`). Geschnittene Clips in fremden Kampagnen
 * bleiben beim Kunden.
 */
adminApi.delete('/creators/:id', async (c) => {
  const summary = await deleteCreatorAccount(c.env, c.req.param('id'))
  if (!summary) return c.json({ error: 'Creator not found.' }, 404)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'creator.deleted',
    entity: 'creator',
    entityId: c.req.param('id'),
    payload: { ...summary },
  })
  return c.json({ ok: true, ...summary })
})

adminApi.post('/clippers', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const displayName = str(body.name, 120)
  const email = str(body.email, 190).toLowerCase()
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return c.json({ error: 'Name and a valid email address are required.' }, 400)
  }

  const db = getDb(c.env)
  const ts = nowSec()
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)

  if (user && user.role !== 'clipper') {
    return c.json({ error: 'This address already belongs to another role.' }, 400)
  }
  if (!user) {
    const id = uid()
    await db.insert(schema.users).values({
      id,
      email,
      role: 'clipper',
      fullName: displayName,
      createdAt: ts,
    })
    ;[user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  }

  let [clipper] = await db
    .select()
    .from(schema.clippers)
    .where(eq(schema.clippers.userId, user.id))
    .limit(1)
  if (!clipper) {
    const id = uid()
    await db.insert(schema.clippers).values({
      id,
      userId: user.id,
      displayName,
      status: 'eingeladen',
      invitedAt: ts,
      createdAt: ts,
    })
    ;[clipper] = await db.select().from(schema.clippers).where(eq(schema.clippers.id, id)).limit(1)
  } else {
    await db
      .update(schema.clippers)
      .set({ displayName, invitedAt: ts })
      .where(eq(schema.clippers.id, clipper.id))
  }

  const code = await issueLoginCode(c.env, email)
  c.executionCtx.waitUntil(mailClipperInvite(c.env, { email, displayName, code }))

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'clipper.invited',
    entity: 'clipper',
    entityId: clipper.id,
    payload: { email },
  })
  return c.json({ ok: true, id: clipper.id })
})

/**
 * Login-Code erneut zustellen — für Kunden wie für Clipper, aber nie für
 * ein Admin-Konto: das meldet sich ausschließlich mit Passwort an.
 */
adminApi.post('/users/:id/resend', async (c) => {
  const db = getDb(c.env)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param('id'))).limit(1)
  if (!user) return c.json({ error: 'User not found.' }, 404)
  if (user.role === 'admin') {
    return c.json({ error: 'Admin accounts sign in with a password, not a code.' }, 400)
  }

  const code = await issueLoginCode(c.env, user.email)
  c.executionCtx.waitUntil(
    mailLoginCode(c.env, {
      email: user.email,
      displayName: user.fullName,
      code,
    }),
  )
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'user.code_resent',
    entity: 'user',
    entityId: user.id,
  })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------ Projekte

   Ein Kunde hat oft mehrere Vorhaben nebeneinander — Restaurant, Personal
   Brand, Software-Firma. Jedes ist ein eigenes Projekt mit eigenem Codename,
   eigenem Rohmaterial-Ordner und eigenen Clippern.
   -------------------------------------------------------------------------- */

adminApi.post('/projects', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const customerId = str(body.customerId, 60)
  const name = str(body.name, 120)
  if (!customerId || !name) return c.json({ error: 'Customer and campaign name are required.' }, 400)

  const [customer] = await getDb(c.env)
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1)
  if (!customer) return c.json({ error: 'Customer not found.' }, 404)

  const project = await createProject(c.env, { customerId, name })
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.created',
    entity: 'project',
    entityId: project.id,
    payload: {
      customerId,
      name,
    },
  })
  return c.json({ ok: true, ...project })
})

/**
 * Projekt löschen — mit allem, was daran hängt.
 *
 * Der Kunde darf sein eigenes Projekt nur löschen, solange es leer ist; hier
 * gilt das ausdrücklich nicht. Ein Testprojekt mit ein paar hochgeladenen
 * Dateien muss in einem Zug verschwinden können, sonst bleibt es für immer
 * stehen. Was gelöscht wird, steht vorher in der Rückfrage.
 */
adminApi.delete('/projects/:id', async (c) => {
  const projectId = c.req.param('id')
  const [project] = await getDb(c.env)
    .select({ name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)

  const summary = await deleteProject(c.env, projectId)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.deleted',
    entity: 'project',
    entityId: projectId,
    payload: { name: project.name, files: summary.files, bytes: summary.bytes },
  })
  return c.json({ ok: true, files: summary.files, bytes: summary.bytes })
})

/* ------------------------------------------------ Kampagnen-Thumbnail

   Eigenes Bild je Kampagne (siehe lib/thumbs.ts). Admin hier, Kunde und
   Creator für ihre eigenen Kampagnen unter /api/app — derselbe Ablauf:

     POST   …/thumb        → { key, url }   signierte Adresse, Browser lädt hoch
     POST   …/thumb/done   { key }          prüfen und als Thumbnail setzen
     DELETE …/thumb                          zurück zum automatischen Bild   */

const THUMB_ERRORS_EN: Record<string, string> = {
  invalid: 'Invalid upload.',
  missing: 'The image did not arrive, please try again.',
  too_large: 'The image is too large.',
}

async function adminProject(c: any) {
  const [project] = await getDb(c.env)
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, c.req.param('id')))
    .limit(1)
  return project ?? null
}

adminApi.post('/projects/:id/thumb', needsR2, async (c) => {
  const project = await adminProject(c)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)
  return c.json(await startCustomThumb(c.env, project))
})

adminApi.post('/projects/:id/thumb/done', needsR2, async (c) => {
  const project = await adminProject(c)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const result = await finishCustomThumb(c.env, project, str(body.key, 300))
  if (!result.ok) return c.json({ error: THUMB_ERRORS_EN[result.error] ?? 'Upload failed.' }, 400)
  await audit(c.env, { actorId: c.get('user').id, action: 'project.thumb_set', entity: 'project', entityId: project.id })
  return c.json({ ok: true })
})

adminApi.delete('/projects/:id/thumb', async (c) => {
  const project = await adminProject(c)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)
  await removeCustomThumb(c.env, project)
  await audit(c.env, { actorId: c.get('user').id, action: 'project.thumb_removed', entity: 'project', entityId: project.id })
  return c.json({ ok: true })
})

/**
 * Preisstaffelung eines Clippers oder Creators festlegen — die komplette
 * Liste ersetzt die bisherige; eine leere Liste nimmt sie zurück (dann
 * sieht er wieder „In Kürze wird Nikki Media eine Preisstaffelung bekannt
 * geben.“).
 *
 *   PUT /users/:id/pay-tiers  { tiers: [{ minViews: "100000", amount: "200" }, …] }
 */
adminApi.put('/users/:id/pay-tiers', async (c) => {
  const userId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const [user] = await getDb(c.env).select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user || (user.role !== 'clipper' && user.role !== 'creator')) {
    return c.json({ error: 'Pay tiers exist for clippers and creators only.' }, 404)
  }
  const parsed = parsePayTiers(body.tiers)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)

  await setPayTiers(c.env, userId, parsed.tiers)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'pay_tiers.set',
    entity: 'user',
    entityId: userId,
    payload: { tiers: parsed.tiers },
  })
  return c.json({ ok: true, tiers: parsed.tiers })
})

/**
 * Das Team einer Kampagne — beliebig viele Clipper und Creator. Der einzige
 * Weg, auf dem eine Kampagne Bearbeiter bekommt; Clipper und Creator können
 * sich selbst nichts nehmen.
 *
 *   POST   /projects/:id/team           { userId }  hinzufügen
 *   DELETE /projects/:id/team/:userId               herausnehmen
 *
 * Ein Creator schneidet UND verbreitet (siehe `addToTeam`).
 */
adminApi.post('/projects/:id/team', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const projectId = c.req.param('id')
  const userId = str(body.userId, 60)
  if (!userId) return c.json({ error: 'Pick a clipper or creator.' }, 400)

  const result = await addToTeam(c.env, projectId, userId)
  if (!result.ok) return c.json({ error: result.error }, 400)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.team_added',
    entity: 'project',
    entityId: projectId,
    payload: { userId, cuts: result.cuts, distributes: result.distributes },
  })
  return c.json(result)
})

adminApi.delete('/projects/:id/team/:userId', async (c) => {
  const projectId = c.req.param('id')
  const userId = c.req.param('userId')
  if (!(await removeFromTeam(c.env, projectId, userId))) {
    return c.json({ error: 'This person is not on the campaign team.' }, 404)
  }
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.team_removed',
    entity: 'project',
    entityId: projectId,
    payload: { userId },
  })
  return c.json({ ok: true })
})

/**
 * Nur Schnitt: einen Bearbeiter (Clipper-ID, auch die eines Creators)
 * hinzufügen oder herausnehmen — ohne die Verbreitung anzufassen.
 */
adminApi.post('/projects/:id/workers', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const projectId = c.req.param('id')
  const clipperId = str(body.clipperId, 60)
  if (!clipperId) return c.json({ error: 'Pick a clipper.' }, 400)
  const result = await assignWorker(c.env, projectId, clipperId)
  if (!result.ok) return c.json({ error: result.error }, 400)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.assigned',
    entity: 'project',
    entityId: projectId,
    payload: { clipperId, created: result.created, notified: result.notified },
  })
  return c.json(result)
})

adminApi.delete('/projects/:id/workers/:clipperId', async (c) => {
  const projectId = c.req.param('id')
  const clipperId = c.req.param('clipperId')
  if (!(await unassignWorker(c.env, projectId, clipperId))) {
    return c.json({ error: 'This clipper is not assigned to the campaign.' }, 404)
  }
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.unassigned',
    entity: 'project',
    entityId: projectId,
    payload: { clipperId },
  })
  return c.json({ ok: true })
})

/**
 * Einen Creator einer Kampagne zum Verbreiten zuordnen. Creator sehen nur
 * die Kampagnen, die ihnen hier zugeordnet werden — weder welche es sonst
 * gibt noch wie viele. Ob er darf, prüft `assignDistribution`.
 */
adminApi.post('/projects/:id/creators', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const projectId = c.req.param('id')
  const creatorId = str(body.creatorId, 60)
  if (!creatorId) return c.json({ error: 'Pick a creator.' }, 400)

  const result = await assignDistribution(c.env, projectId, creatorId)
  if (!result.ok) return c.json({ error: result.error }, 400)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'distribution.assigned',
    entity: 'project',
    entityId: projectId,
    payload: { creatorId, created: result.created },
  })
  return c.json({ ok: true, created: result.created })
})

/**
 * Einen Creator aus einer Kampagne nehmen. Was er schon gepostet hat, bleibt
 * auf seinen Kanälen; neue Clips gehen nicht mehr raus.
 */
adminApi.delete('/projects/:id/creators/:creatorId', async (c) => {
  const projectId = c.req.param('id')
  const creatorId = c.req.param('creatorId')
  if (!(await leaveDistribution(c.env, projectId, creatorId))) {
    return c.json({ error: 'This creator does not distribute this campaign.' }, 404)
  }

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'distribution.unassigned',
    entity: 'project',
    entityId: projectId,
    payload: { creatorId },
  })
  return c.json({ ok: true })
})

adminApi.post('/projects/:id/freigeben', async (c) => {
  const ok = await releaseProject(c.env, c.req.param('id'))
  if (!ok) return c.json({ error: 'Campaign not found.' }, 404)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.released',
    entity: 'project',
    entityId: c.req.param('id'),
  })
  return c.json({ ok: true })
})

adminApi.post('/projects/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  const name = str(body.name, 120)
  if (name) patch.name = name

  if (typeof body.status === 'string') {
    if (!['aktiv', 'pausiert', 'beendet'].includes(body.status)) {
      return c.json({ error: 'Unknown status.' }, 400)
    }
    patch.status = body.status
  }
  if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change.' }, 400)

  await getDb(c.env)
    .update(schema.projects)
    .set(patch)
    .where(eq(schema.projects.id, c.req.param('id')))
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.updated',
    entity: 'project',
    entityId: c.req.param('id'),
    payload: patch,
  })
  return c.json({ ok: true })
})

/**
 * Adresse zum Verbinden EINES Social-Accounts eines Projekts.
 *
 * Bewusst je Plattform und beliebig oft aufrufbar: ein Projekt bekommt
 * mehrere Instagram-, TikTok- und YouTube-Accounts, und jeder braucht seine
 * eigene Zustimmung. Der passende Steckplatz beim Anbieter entsteht dabei
 * von allein — ein freier wird wiederverwendet, sonst kommt der nächste.
 *
 * Das ist der einzige Handgriff, der von Hand bleibt.
 */
adminApi.post('/projects/:id/connect/:platform', async (c) => {
  const projectId = c.req.param('id')
  const platform = c.req.param('platform')

  if (!isConnectable(platform)) {
    return c.json({ error: 'Unknown platform.' }, 400)
  }

  const [project] = await getDb(c.env)
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)

  /*
   * Instagram wird ausschließlich direkt verbunden. Der frühere Umweg über
   * den Facebook-Anmeldeweg ist entfallen: die Konten hier hängen an keiner
   * Facebook-Seite, also gäbe es dort nichts auszuwählen.
   */
  try {
    const url = await connectUrlForProject(
      c.env,
      projectId,
      platform,
      `${c.env.APP_URL}/admin/projekte/${projectId}`,
      // Der Administrator verbindet über die Obergrenze hinaus (siehe `ACCOUNT_LIMIT`).
      { byAdmin: true },
    )
    await audit(c.env, {
      actorId: c.get('user').id,
      action: 'publish.connect',
      entity: 'project',
      entityId: projectId,
      payload: { platform },
    })
    return c.json({ ok: true, url })
  } catch (err) {
    console.error('[admin] Verbindungslink fehlgeschlagen', projectId, platform, err)
    return c.json({ error: `Could not create connection link: ${String(err).slice(0, 200)}` }, 502)
  }
})

/** Accounts eines Projekts frisch vom Anbieter holen und den Spiegel pflegen. */
adminApi.post('/projects/:id/sync-accounts', async (c) => {
  const projectId = c.req.param('id')
  try {
    const count = await syncAccounts(c.env, projectId)
    return c.json({ ok: true, count })
  } catch (err) {
    console.error('[admin] Abgleich fehlgeschlagen', projectId, err)
    return c.json({ error: 'Sync failed.' }, 502)
  }
})

/**
 * Die rote Meldung am Projekt wegklicken.
 *
 * Sie hält den letzten gescheiterten Verbindungsversuch fest und verschwand
 * bisher nur, wenn auf derselben Plattform einer klappte. Ein längst
 * erledigter Fehler blieb damit sichtbar stehen. Gelöscht wird nur die
 * Anzeige — am Zustand der Verbindungen ändert das nichts.
 */
adminApi.delete('/projects/:id/publish-error', async (c) => {
  await getDb(c.env)
    .update(schema.projects)
    .set({ publishError: null, publishTriedAt: null })
    .where(eq(schema.projects.id, c.req.param('id')))
  return c.json({ ok: true })
})

/**
 * Einen verbundenen Account wieder trennen — auf unserer Seite ausgelöst,
 * nicht bei Zernio von Hand. Der Steckplatz bleibt leer stehen und wird beim
 * nächsten Verbinden dieser Plattform automatisch wiederverwendet.
 */
adminApi.delete('/projects/:id/accounts/:accountId', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')

  const ok = await disconnectAccountFromProject(c.env, projectId, accountId)
  if (!ok) return c.json({ error: 'Account not found.' }, 404)

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'publish.account.disconnected',
    entity: 'project',
    entityId: projectId,
    payload: { accountId },
  })
  return c.json({ ok: true })
})

/**
 * Verbreitung über Creator für ein Projekt ein- oder ausschalten — derselbe
 * Schalter, den der Kunde auf seiner Projektseite hat. Der Administrator
 * setzt ihn etwa, wenn ein Kunde die Verbreitung am Telefon zusagt.
 */
adminApi.patch('/projects/:id/distribution', async (c) => {
  const projectId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'Expected { enabled: true | false }.' }, 400)

  const db = getDb(c.env)
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)

  await db
    .update(schema.projects)
    .set({ creatorDistribution: body.enabled ? 1 : 0 })
    .where(eq(schema.projects.id, projectId))
  if (body.enabled) c.executionCtx.waitUntil(distributeWithTeamCreators(c.env, projectId))
  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'project.distribution',
    entity: 'project',
    entityId: projectId,
    payload: { enabled: body.enabled, by: 'admin' },
  })
  return c.json({ ok: true, enabled: body.enabled })
})

/**
 * „Refresh numbers“ — die Zahlen EINES Projekts sofort bei Zernio abfragen,
 * statt auf den Viertelstundenlauf zu warten. Neue Posts des Projekts kommen
 * dabei gleich mit in den Zeitplan.
 *
 * Ein Doppeltipp kostet keine Abrufe: `syncProjectMetrics` belegt die Posts,
 * die es fragt — ein zweiter Klick oder der gleichzeitige Cron lassen sie
 * liegen —, und fragt nichts aus den letzten fünf Minuten (X nichts aus den
 * letzten sechs Stunden, dort kostet jeder Abruf Geld). Die Seite sperrt den
 * Knopf zusätzlich, bis die Antwort da ist. Höchstens 60 Abrufe je Klick;
 * bei größeren Projekten deckt der nächste Klick den Rest.
 *
 * Auch während einer 402-Pause erlaubt: ein Klick soll zeigen dürfen, dass
 * sie vorbei ist. `paused` sagt der Seite, wenn nicht.
 */
adminApi.post('/projects/:id/metrics/refresh', async (c) => {
  const projectId = c.req.param('id')
  const [project] = await getDb(c.env)
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.json({ error: 'Campaign not found.' }, 404)

  // Ohne Schlüssel liefe `syncProjectMetrics` still ins Leere — und der Knopf
  // meldete „nichts fällig“, obwohl schlicht nichts gefragt werden KANN.
  if (!publishingReady(c.env)) {
    return c.json({ error: 'Zernio is not configured (ZERNIO_API_KEY missing), there is nothing to ask.' }, 503)
  }

  try {
    const result = await syncProjectMetrics(c.env, projectId)
    // Dazu die extern geposteten Videos der Accounts dieser Kampagne, sofort.
    // Ein Fehler dort hält die Zahlen der eigenen Posts nicht auf.
    let external = 0
    try {
      external = (await syncExternalPosts(c.env, { projectId, force: true })).posts
    } catch (err) {
      console.error('[admin] Externe Posts nicht abgeglichen', projectId, err)
    }
    await audit(c.env, {
      actorId: c.get('user').id,
      action: 'metrics.refresh',
      entity: 'project',
      entityId: projectId,
      payload: { ...result, external },
    })
    // Wie viele Posts des Projekts überhaupt im Zeitplan stehen — nach dem
    // Lauf, der neue gleich aufnimmt. Bei 0 hieße „nichts fällig“ etwas
    // Falsches: es gibt schlicht noch keinen Post, nach dem man fragen kann.
    const tracked = result.fetched ? null : (await syncOverview(c.env, projectId)).total
    return c.json({ ok: true, fetched: result.fetched, updated: result.updated, paused: result.paused, tracked, external })
  } catch (err) {
    console.error('[admin] Zahlen nicht abgeglichen', projectId, err)
    return c.json({ error: 'Refreshing the numbers failed.' }, 502)
  }
})

/*
 * Rohmaterial und fertige Clips für den Admin-Bereich.
 *
 * Ohne `?download=1` kommt eine Adresse ZUM ANSEHEN zurück, mit ihr eine
 * zum Herunterladen. Vorher gab es nur den Download: Jason musste jede
 * einzelne Datei auf die Platte laden, um zu sehen, was ein Kunde
 * hochgeladen hat — bei einem Archiv mit Stunden an Material ist das keine
 * Sichtung, sondern ein Nachmittag. Der Unterschied zwischen beiden ist
 * allein der `Content-Disposition`-Kopf in der signierten Adresse.
 */
adminApi.get('/assets/:id/url', async (c) => {
  const [row] = await getDb(c.env)
    .select({ raw: schema.rawAssets })
    .from(schema.rawAssets)
    .where(eq(schema.rawAssets.id, c.req.param('id')))
    .limit(1)
  if (!row) return c.json({ error: 'File not found.' }, 404)
  const download = c.req.query('download') === '1'
  return c.json({
    url: await presignGet(c.env, row.raw.r2Key, download ? row.raw.filename : undefined),
  })
})

adminApi.get('/deliverables/:id/url', async (c) => {
  const [row] = await getDb(c.env)
    .select({ d: schema.deliverables })
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, c.req.param('id')))
    .limit(1)
  if (!row) return c.json({ error: 'Video not found.' }, 404)
  const download = c.req.query('download') === '1'
  return c.json({
    url: await presignGet(c.env, row.d.r2Key, download ? row.d.filename : undefined),
  })
})

/**
 * Signierte Adressen für VIELE Kacheln auf einmal.
 *
 * Warum gebündelt und nicht je Kachel ein Aufruf: Ein Projektordner hat
 * schnell dreistellig viele Clips. Einzeln abgefragt wären das ebenso viele
 * Rundreisen, und beim Rendern der Seite alle im Voraus zu signieren hieße,
 * für jede Datei zu rechnen, die der Administrator nie ansieht. Die Seite
 * fragt deshalb erst, wenn eine Kachel ins Bild scrollt — und dann für alle
 * Kacheln, die gerade zusammenkommen.
 *
 * Die Antwort trennt zwei Fälle, und diese Trennung ist der eigentliche
 * Punkt:
 *
 *   thumbs   Es gibt ein Vorschaubild. Ein JPEG von wenigen Dutzend
 *            Kilobyte, mehr fasst der Browser nicht an. Der Regelfall.
 *   sources  Es gibt noch keins und es wurde auch noch nicht vergeblich
 *            versucht — die Kachel darf eines erzeugen und muss dafür an
 *            die Originaldatei. Das betrifft nur Material von vor dieser
 *            Änderung und läuft im Browser streng nacheinander ab.
 *
 * Wer in keiner der beiden Listen steht, bleibt ohne Bild: Der Versuch lief
 * schon einmal und ging nicht. Diese Datei ein zweites Mal herunterzuladen
 * brächte nichts.
 *
 * Die Obergrenze schützt die CPU-Zeit des Workers: Signieren ist Krypto, und
 * eine Anfrage mit tausend IDs wäre eine Einladung, ihn stehen zu lassen.
 */
const URL_BATCH_MAX = 60

adminApi.post('/media/urls', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ids = (list: unknown) =>
    Array.isArray(list) ? [...new Set(list.map((v) => str(v, 40)).filter(Boolean))].slice(0, URL_BATCH_MAX) : []

  const assetIds = ids(body.assets)
  const deliverableIds = ids(body.deliverables)
  if (!assetIds.length && !deliverableIds.length) return c.json({ thumbs: {}, sources: {} })

  const db = getDb(c.env)
  const thumbs: Record<string, string> = {}
  const sources: Record<string, string> = {}

  const rows = assetIds.length
    ? await db
        .select({
          id: schema.rawAssets.id,
          key: schema.rawAssets.r2Key,
          thumb: schema.rawAssets.thumbKey,
          tried: schema.rawAssets.thumbTriedAt,
        })
        .from(schema.rawAssets)
        .where(inArray(schema.rawAssets.id, assetIds))
    : []
  const clips = deliverableIds.length
    ? await db
        .select({
          id: schema.deliverables.id,
          key: schema.deliverables.r2Key,
          thumb: schema.deliverables.thumbnailKey,
          tried: schema.deliverables.thumbTriedAt,
        })
        .from(schema.deliverables)
        .where(inArray(schema.deliverables.id, deliverableIds))
    : []

  for (const row of [...rows, ...clips]) {
    if (row.thumb) thumbs[row.id] = await presignGet(c.env, row.thumb)
    else if (!row.tried) sources[row.id] = await presignGet(c.env, row.key)
  }
  return c.json({ thumbs, sources })
})

/* Nachträglich erzeugte Bilder — für Material, das vor dieser Änderung
   hochgeladen wurde und deshalb keins mitbekommen hat. */
mountThumbRoutes(adminApi, '/media/thumb', 'File not found.', async (c, body) => {
  const id = str(body.id, 60)
  if (!id) return null
  const db = getDb(c.env)

  if (str(body.kind, 10) === 'reel') {
    const [row] = await db
      .select({ id: schema.deliverables.id, key: schema.deliverables.r2Key })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.id, id))
      .limit(1)
    return row ? { kind: 'reel', id: row.id, r2Key: row.key } : null
  }

  const [row] = await db
    .select({ id: schema.rawAssets.id, key: schema.rawAssets.r2Key })
    .from(schema.rawAssets)
    .where(eq(schema.rawAssets.id, id))
    .limit(1)
  return row ? { kind: 'raw', id: row.id, r2Key: row.key } : null
})

/**
 * Eigenes Passwort ändern. Das aktuelle Passwort ist Pflicht — eine gekaperte
 * Sitzung allein soll nicht reichen, um den Zugang zu übernehmen.
 */
adminApi.post('/password', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const current = String(body.current ?? '')
  const next = String(body.next ?? '')
  const user = c.get('user')

  if (next.length < PASSWORD_MIN) {
    return c.json({ error: `The new password needs at least ${PASSWORD_MIN} characters.` }, 400)
  }
  if (next === current) {
    return c.json({ error: 'The new password is identical to the old one.' }, 400)
  }

  const check = await verifyPasswordLogin(c.env, user.email, current)
  if (!check.ok) {
    return c.json(
      {
        error:
          check.reason === 'gesperrt'
            ? `Too many failed attempts. Please try again in ${check.retryInMin ?? 30} minutes.`
            : 'The current password is incorrect.',
      },
      400,
    )
  }

  await setPassword(c.env, user.id, next)
  await audit(c.env, {
    actorId: user.id,
    action: 'password.changed',
    entity: 'user',
    entityId: user.id,
  })
  return c.json({ ok: true })
})

/* ------------------------------------------------- Agenturen (/admin/agenturen)

   Cooperation-Codes erstellen und löschen, Agenturen freigeben, sperren,
   umstufen und löschen, Creator-Buchungen bestätigen (siehe lib/agency.ts).
   -------------------------------------------------------------------------- */

adminApi.post('/cooperation-codes', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const note = str(body.note, 120) || null
  const created = await createCooperationCode(c.env, { note, createdBy: user.id })
  await audit(c.env, { actorId: user.id, action: 'agency.code_created', entity: 'cooperation_code', entityId: created.id, payload: { note } })
  return c.json({ ok: true, ...created })
})

/** Nur unbenutzte Codes — ein eingelöster bleibt als Nachweis stehen. */
adminApi.delete('/cooperation-codes/:id', async (c) => {
  const db = getDb(c.env)
  const deleted = await db
    .delete(schema.cooperationCodes)
    .where(and(eq(schema.cooperationCodes.id, c.req.param('id')), isNull(schema.cooperationCodes.usedAt)))
    .returning({ id: schema.cooperationCodes.id })
  if (!deleted.length) return c.json({ error: 'Only unused codes can be deleted.' }, 400)
  await audit(c.env, { actorId: c.get('user').id, action: 'agency.code_deleted', entity: 'cooperation_code', entityId: c.req.param('id') })
  return c.json({ ok: true })
})

/**
 * Zugang freigeben oder sperren, warm oder kalt setzen.
 *
 *   access: true   öffnet das Schloss (wirksam, sobald das Briefing da ist)
 *   access: false  sperrt — auch einen warmen Lead
 *   warm: true     warm; mit Briefing sofort freigeschaltet, wie mit Code
 *   warm: false    kalt — und damit gesperrt
 *
 * Wird der Zugang dadurch wirksam, bekommt die Agentur eine Mail.
 */
adminApi.post('/agencies/:id', async (c) => {
  const db = getDb(c.env)
  const [lead] = await db.select().from(schema.agencyLeads).where(eq(schema.agencyLeads.id, c.req.param('id'))).limit(1)
  if (!lead) return c.json({ error: 'Agency not found.' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const ts = nowSec()

  const patch: Partial<typeof schema.agencyLeads.$inferInsert> = {}
  if (typeof body.warm === 'boolean') {
    patch.warm = body.warm ? 1 : 0
    if (body.warm && lead.briefedAt && !lead.accessAt) patch.accessAt = ts
    if (!body.warm) patch.accessAt = null
  }
  if (typeof body.access === 'boolean') patch.accessAt = body.access ? (lead.accessAt ?? ts) : null
  if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change.' }, 400)

  await db.update(schema.agencyLeads).set(patch).where(eq(schema.agencyLeads.id, lead.id))
  const before = agencyUnlocked(lead)
  const after = agencyUnlocked({ ...lead, ...patch })

  await audit(c.env, {
    actorId: c.get('user').id,
    action: 'agency.updated',
    entity: 'agency',
    entityId: lead.id,
    payload: { ...body, unlocked: after },
  })

  if (!before && after) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, lead.userId)).limit(1)
    if (user) c.executionCtx.waitUntil(mailAgencyUnlocked(c.env, { email: user.email, fullName: user.fullName }))
  }
  return c.json({ ok: true, unlocked: after })
})

adminApi.delete('/agencies/:id', async (c) => {
  const db = getDb(c.env)
  const [lead] = await db.select().from(schema.agencyLeads).where(eq(schema.agencyLeads.id, c.req.param('id'))).limit(1)
  if (!lead) return c.json({ error: 'Agency not found.' }, 404)
  const ok = await deleteAgencyAccount(c.env, lead.userId)
  if (!ok) return c.json({ error: 'Agency not found.' }, 404)
  await audit(c.env, { actorId: c.get('user').id, action: 'agency.deleted', entity: 'agency', entityId: lead.id })
  return c.json({ ok: true })
})

/** Creator-Buchung bestätigen (Creator kommt ins Team) oder ablehnen. */
adminApi.post('/bookings/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.accept !== 'boolean') return c.json({ error: 'Invalid request.' }, 400)
  const result = await decideBooking(c.env, c.req.param('id'), body.accept)
  if (!result.ok) return c.json({ error: result.error }, 400)
  await audit(c.env, {
    actorId: c.get('user').id,
    action: body.accept ? 'agency.booking_confirmed' : 'agency.booking_declined',
    entity: 'booking',
    entityId: c.req.param('id'),
  })
  return c.json({ ok: true })
})

apiRoutes.route('/admin', adminApi)

/* ==========================================================================
   CLIPPER
   ========================================================================== */

const workApi = new Hono<AppEnv>()
/*
 * Clipper UND Creator: Wer Kampagnen sucht, nimmt sie über dieselben Wege an
 * wie ein Clipper — mit seiner Zeile in `clippers`. Die Antworten sind für
 * beide deutsch und sagen „Kampagne“.
 */
workApi.use('*', requireRole('clipper', 'creator'))

/** Wie needsR2 — mit der Meldung für Clipper und Creator. */
const needsR2Worker = async (c: any, next: () => Promise<void>) => {
  if (!r2Ready(c.env)) return c.json({ error: R2_MISSING_WORKER }, 503)
  await next()
}
workApi.use('/uploads/*', needsR2Worker)
workApi.use('/assets/:id/url', needsR2Worker)

/**
 * Rohmaterial herunterladen — nur aus zugeordneten Projekten und ohne dass
 * die Antwort irgendetwas über den Kunden verrät.
 */
workApi.get('/assets/:id/url', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.json({ error: 'Kein Zugriff.' }, 403)

  const [row] = await getDb(c.env)
    .select({ raw: schema.rawAssets, projectId: schema.folders.projectId })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(and(eq(schema.rawAssets.id, c.req.param('id')), isNull(schema.rawAssets.deletedAt)))
    .limit(1)

  if (!row?.projectId || !(await clipperHasProject(c.env, clipper.id, row.projectId))) {
    return c.json({ error: 'Datei nicht gefunden.' }, 404)
  }
  return c.json({ url: await presignGet(c.env, row.raw.r2Key, row.raw.filename) })
})

workApi.post('/uploads/init', async (c) => {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper) return c.json({ error: 'Kein Zugriff.' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const projectId = str(body.projectId, 60)
  const filename = safeFilename(str(body.filename, 200))
  // 2200 Zeichen ist die Caption-Grenze von Instagram und TikTok. Was
  // darüber steht, könnte ohnehin niemand veröffentlichen.
  const caption = str(body.caption, 2200).trim()
  const size = Math.max(0, Number(body.size) || 0)

  if (!(await clipperHasProject(c.env, clipper.id, projectId))) {
    return c.json({ error: 'Kampagne nicht gefunden.' }, 404)
  }
  /*
   * Ohne Caption geht der Clip nicht raus — das ist keine Formsache.
   * TikTok weist einen Beitrag ohne Text ab, und genau daran scheiterte der
   * erste echte Clip, während Instagram ihn stumm annahm. Die Prüfung steht
   * hier und nicht nur im Browser: das Feld ist auch über die API erreichbar.
   */
  if (!caption) {
    return c.json(
      {
        error: 'Bitte schreib eine Caption, sie wird mit dem Clip veröffentlicht.',
      },
      400,
    )
  }
  if (!isAllowedFile(filename) || !isVideo(filename)) {
    return c.json(
      {
        error: 'Bitte lade ein Video hoch (mp4, mov, avi, mkv, webm).',
      },
      400,
    )
  }

  const [project] = await getDb(c.env)
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return c.json({ error: 'Kampagne nicht gefunden.' }, 404)

  const resumed = await resumeUpload(c.env, {
    table: 'deliverables',
    projectId,
    clipperId: clipper.id,
    filename,
    size,
  })
  if (resumed) return c.json(resumed)

  const key = `${project.customerId}/deliverables/${crypto.randomUUID()}-${filename}`
  const id = uid()
  const multipart = size >= MULTIPART_THRESHOLD
  const uploadParts = multipart
    ? { uploadId: await createMultipartUpload(c.env, key, mimeFor(filename)), partSize: PART_SIZE }
    : null

  await getDb(c.env).insert(schema.deliverables).values({
    id,
    projectId,
    clipperId: clipper.id,
    r2Key: key,
    filename,
    caption,
    bytes: size,
    uploadStatus: 'uploading',
    uploadParts: uploadParts ? JSON.stringify(uploadParts) : null,
    createdAt: nowSec(),
  })

  return c.json(
    multipart
      ? { assetId: id, mode: 'multipart', uploadId: uploadParts!.uploadId, partSize: PART_SIZE }
      : { assetId: id, mode: 'single', url: await presignPut(c.env, key) },
  )
})

/* Auch der Clipper erzeugt das Bild aus seiner lokalen Datei — der
   fertige Clip bekommt seine Kachel damit schon beim Hochladen. */
mountThumbRoutes(workApi, '/uploads/thumb', 'Upload nicht gefunden.', async (c, body) => {
  const row = await ownedDeliverable(c, str(body.assetId, 60))
  return row ? { kind: 'reel', id: row.id, r2Key: row.r2Key } : null
})

workApi.post('/uploads/part', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const row = await ownedDeliverable(c, str(body.assetId, 60))
  if (!row) return c.json({ error: 'Upload nicht gefunden.' }, 404)

  const meta = JSON.parse(row.uploadParts ?? '{}')
  const partNumber = Number(body.partNumber)
  if (!meta.uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return c.json({ error: 'Ungültiger Teil.' }, 400)
  }
  return c.json({ url: await presignPart(c.env, row.r2Key, meta.uploadId, partNumber) })
})

workApi.post('/uploads/complete', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const row = await ownedDeliverable(c, str(body.assetId, 60))
  if (!row) return c.json({ error: 'Upload nicht gefunden.' }, 404)

  const meta = JSON.parse(row.uploadParts ?? 'null')
  if (meta?.uploadId) {
    const parts = Array.isArray(body.parts)
      ? body.parts.map((p: any) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
      : []
    if (!parts.length) return c.json({ error: 'Keine Teile übermittelt.' }, 400)
    await completeMultipartUpload(c.env, row.r2Key, meta.uploadId, parts)
  }

  const db = getDb(c.env)
  const bytes = await objectSize(c.env, row.r2Key)
  await db
    .update(schema.deliverables)
    .set({ uploadStatus: 'complete', bytes, uploadParts: null })
    .where(eq(schema.deliverables.id, row.id))

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, row.projectId))
    .limit(1)
  const [customerRow] = await db
    .select({ email: schema.users.email, role: schema.users.role })
    .from(schema.customers)
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(eq(schema.customers.id, project!.customerId))
    .limit(1)

  await addStorage(c.env, project!.customerId, bytes)
  await audit(c.env, {
    actorId: user.id,
    action: 'deliverable.uploaded',
    entity: 'deliverable',
    entityId: row.id,
    payload: { projectId: row.projectId, filename: row.filename, bytes },
  })

  c.executionCtx.waitUntil(
    Promise.all([
      // Nur Kunden bekommen die Mail „Dein Video ist fertig“. Ein Creator gibt
      // Material in seine eigene Kampagne — die fertigen Clips sieht er nicht.
      customerRow?.role === 'customer'
        ? mailDeliverableCustomer(c.env, {
            to: customerRow.email,
            projectName: project!.name,
            filename: row.filename,
            caption: row.caption,
          })
        : Promise.resolve(false),
      mailDeliverableAdmin(c.env, {
        projectName: project!.name,
        clipper: user.fullName,
        filename: row.filename,
      }),
      /*
       * Hier startet die Veröffentlichung: das fertige Video geht sofort an
       * alle Social-Accounts, die dem Projekt zugeordnet sind. Keine Freigabe,
       * kein Warten, keine Caption.
       *
       * Bewusst im selben `waitUntil` wie die E-Mails — der Clipper bekommt
       * seine Antwort, sobald die Datei liegt, und wartet nie auf die
       * Gegenseite. `publishDeliverable` wirft nie; jeder Ausgang landet als
       * Zustand am Deliverable und ist in beiden Oberflächen sichtbar.
       */
      publishDeliverable(c.env, row.id).catch((err) => {
        console.error('[publish] unerwarteter Fehler', row.id, err)
        return null
      }),
      /*
       * Hat der Kunde die Kampagne für Creator freigegeben, erfahren alle
       * beigetretenen Creator von dem neuen Clip. Gepostet wird bei ihnen
       * erst nach ihrer eigenen Freigabe — die Mail führt genau dorthin.
       *
       * Nur bei einer aktiven Kampagne: eine pausierte oder beendete nimmt
       * keine Freigaben an (siehe `/clips/:id/approve`). Die Mail verspräche
       * dort „mit Freigeben & posten geht er raus“, und die Seite dahinter
       * zeigte einen gesperrten Knopf.
       */
      project!.creatorDistribution === 1 && project!.status === 'aktiv'
        ? notifyDistributionCreators(c.env, {
            projectId: project!.id,
            projectName: project!.name,
            caption: row.caption,
            uploaderUserId: user.id,
          }).catch((err) => {
            console.error('[mail] Creator-Benachrichtigung fehlgeschlagen', row.id, err)
            return null
          })
        : Promise.resolve(null),
    ]),
  )

  return c.json({ ok: true })
})

/**
 * „Neuer Clip zum Freigeben“ an jeden beigetretenen Creator.
 *
 * Eine Mail je Creator statt einer an alle: sonst sähe jeder die Adressen
 * der anderen. Nacheinander statt gleichzeitig, damit der Mailversand bei
 * vielen Creatorn nicht an seine Ratenbegrenzung stößt — es läuft ohnehin
 * im Hintergrund. Wer den Clip selbst hochgeladen hat (ein Creator, der die
 * Kampagne zugleich angenommen hat), bekommt keine Mail über seinen eigenen
 * Clip.
 */
async function notifyDistributionCreators(
  env: AppEnv['Bindings'],
  o: { projectId: string; projectName: string; caption: string | null; uploaderUserId: string },
): Promise<number> {
  let sent = 0
  for (const creator of await campaignCreatorsOf(env, o.projectId)) {
    if (creator.userId === o.uploaderUserId) continue
    const ok = await mailClipForApproval(env, {
      to: creator.email,
      fullName: creator.fullName,
      projectId: o.projectId,
      projectName: o.projectName,
      caption: o.caption,
    })
    if (ok) sent++
  }
  return sent
}

async function ownedDeliverable(c: any, id: string) {
  const clipper = await clipperForUser(c.env, c.get('user').id)
  if (!clipper || !id) return null
  const [row] = await getDb(c.env)
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.id, id), eq(schema.deliverables.clipperId, clipper.id)))
    .limit(1)
  return row ?? null
}

apiRoutes.route('/work', workApi)

/* ==========================================================================
   FORTSETZEN ABGEBROCHENER UPLOADS
   ========================================================================== */

interface ResumeQuery {
  table: 'raw_assets' | 'deliverables'
  folderId?: string
  projectId?: string
  clipperId?: string
  filename: string
  size: number
}

/**
 * Sucht einen offenen Multipart-Upload derselben Datei und liefert die bereits
 * bei R2 angekommenen Parts zurück. Findet sich keiner — oder ist der Upload
 * bei R2 abgelaufen —, wird `null` zurückgegeben und ganz normal neu begonnen.
 */
async function resumeUpload(env: AppEnv['Bindings'], q: ResumeQuery) {
  const where =
    q.table === 'raw_assets'
      ? { sql: `folder_id = ?1 AND filename = ?2`, args: [q.folderId, q.filename] }
      : {
          sql: `project_id = ?1 AND clipper_id = ?3 AND filename = ?2`,
          args: [q.projectId, q.filename, q.clipperId],
        }

  const row = await env.DB.prepare(
    `SELECT id, r2_key, upload_parts FROM ${q.table}
      WHERE ${where.sql} AND upload_status = 'uploading' AND upload_parts IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(...where.args)
    .first<{ id: string; r2_key: string; upload_parts: string }>()

  if (!row) return null

  let meta: { uploadId?: string; partSize?: number }
  try {
    meta = JSON.parse(row.upload_parts)
  } catch {
    return null
  }
  if (!meta.uploadId || !meta.partSize) return null

  try {
    const done = await listParts(env, row.r2_key, meta.uploadId)
    return {
      assetId: row.id,
      mode: 'multipart' as const,
      uploadId: meta.uploadId,
      partSize: meta.partSize,
      done: done.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      resumed: true,
    }
  } catch {
    // Upload bei R2 nicht mehr vorhanden — Datensatz verwerfen und neu starten.
    await env.DB.prepare(`UPDATE ${q.table} SET upload_status = 'aborted' WHERE id = ?1`)
      .bind(row.id)
      .run()
    return null
  }
}
