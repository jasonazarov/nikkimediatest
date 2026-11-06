import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb, nowSec, uid, schema } from './db'
import { INDUSTRIES, addToTeam, customerForUser, deleteCustomerAccount } from './domain'
import type { Env } from './types'
import type { AgencyLead } from '../db/schema'

/* ==========================================================================
   Agenturen aus allen Branchen — /brands und /collaboration

   Die Vorgabe des Auftraggebers: Konkurrenten dürfen sich NICHT eintragen und
   dann unbegrenzt in Kampagnen, Creator und Clipper hineinsehen. Deshalb gibt
   es zwei Sorten Leads:

     kalt   Eintrag ohne Cooperation-Code. Sieht im Collaboration-Bereich nur
            gesperrte Menüpunkte — bis der Administrator ihn freigibt.
     warm   Eintrag (oder spätere Einlösung im Dashboard) MIT einem
            Cooperation-Code. Den vergibt der Administrator nach einem
            Erstgespräch; jeder Code gilt genau einmal.

   Beide füllen nach dem Login das Briefing aus („Kampagne starten“). Zugang
   hat erst, wer freigegeben ist (`access_at`) UND das Briefing abgeschickt
   hat (`briefed_at`). Ein warmer Lead wird mit dem Briefing freigegeben, ein
   kalter vom Administrator.

   Auch jede WEITERE Kampagne entsteht über dieses Briefing (/collaboration/neu)
   — nie über ein bloßes Namensfeld. Views, Budget und Auftrag hängen an der
   Kampagne selbst (`projects.briefing_*`).

   Was „Zugang“ heißt: alle Kampagnen mit ihren fertigen Clips (ansehen und
   herunterladen), alle Creator und Clipper — OHNE Rohmaterial, Cloud-Links,
   Kundennamen und Kontaktdaten. Dazu die eigenen Kampagnen mit Uploads und
   das Buchen von Creatorn (Bestätigung durch den Administrator).
   ========================================================================== */

/* ------------------------------------------------- Auswahllisten (Stepper) */

/** Schritt 1 — Plattformen, Mehrfachauswahl. Logos unter /img/platforms/<value>.svg. */
export const AGENCY_PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', subtitle: 'For You Page' },
  { value: 'youtube', label: 'YT Shorts', subtitle: 'YouTube Shorts' },
  { value: 'instagram', label: 'Instagram', subtitle: 'Reels' },
  { value: 'facebook', label: 'Facebook', subtitle: 'Reels' },
] as const

/** Schritt 2 — gibt es Kunden, die sich für Clipping interessieren? */
export const AGENCY_CLIENTS = [
  { value: 'einer', label: 'Einen Kunden', labelEn: 'One client' },
  { value: 'mehrere', label: 'Mehrere Kunden', labelEn: 'Several clients' },
] as const

/** Antworten von vor Oktober 2026 (Ja/Nein) — nur noch zur Anzeige. */
const LEGACY_CLIENTS = [
  { value: 'ja', label: 'Ja', labelEn: 'Yes' },
  { value: 'nein', label: 'Nein', labelEn: 'No' },
] as const

/**
 * Schritt 3 — was für eine Agentur sich einträgt. „Andere Agentur“ öffnet
 * ein Textfeld. Angesprochen werden nur Agenturen (Vorgabe des Auftraggebers,
 * Oktober 2026); „Brand-Owner“ und das bloße „Agentur“ von davor stehen in
 * LEGACY_KINDS, damit ältere Einträge im Admin lesbar bleiben.
 */
export const AGENCY_KINDS = [
  { value: 'marketing', label: 'Marketing-Agentur', subtitle: 'Marketing und Werbung für eure Kunden' },
  { value: 'social_media', label: 'Social-Media-Agentur', subtitle: 'Social Media und Content für eure Kunden' },
  { value: 'sonstiges', label: 'Andere Agentur', subtitle: 'Eine andere Art Agentur, kurz beschreiben' },
] as const

const LEGACY_KINDS = [
  { value: 'brand_owner', label: 'Brand-Owner' },
  { value: 'agentur', label: 'Agentur' },
] as const

/** Schritt 4 — wie die Agentur auf uns aufmerksam wurde. */
export const AGENCY_SOURCES = [
  { value: 'ads', label: 'Ads' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'google', label: 'Google Search' },
  { value: 'empfehlung', label: 'Weiterempfehlung' },
] as const

/** Schritt 6 — die Social-Media-Kanäle, alle freiwillig. */
export const AGENCY_SOCIALS = [
  { value: 'tiktok', label: 'TikTok', placeholder: '@deineagentur', logo: true },
  { value: 'instagram', label: 'Instagram', placeholder: '@deineagentur', logo: true },
  { value: 'youtube', label: 'YouTube', placeholder: '@deineagentur', logo: true },
  { value: 'facebook', label: 'Facebook', placeholder: 'facebook.com/deineagentur', logo: true },
  { value: 'website', label: 'Website', placeholder: 'deineagentur.de', logo: false },
] as const

/** Schritt 7 — wie viel Rohmaterial es gibt. */
export const AGENCY_FOOTAGE = [
  { value: 'viel', label: 'Viel', subtitle: 'Es liegt reichlich Material bereit' },
  { value: 'keins', label: 'Noch keines', subtitle: 'Wollen das zusätzlich über euch machen' },
] as const

/** Briefing — was beauftragt wird. */
export const AGENCY_PACKAGES = [
  {
    value: 'armee',
    label: 'Clipping Armee',
    subtitle: 'Unser Netzwerk aus Clippern schneidet und verbreitet auf breiter Front.',
  },
  {
    value: 'armee_influencer',
    label: 'Clipping Armee + Influencer',
    subtitle: 'Dazu Creator, die eure Clips auf ihren eigenen Kanälen ausspielen.',
  },
  {
    value: 'armee_influencer_ugc',
    label: 'Clipping Armee + Influencer + UGC',
    subtitle: 'Das volle Paket: inklusive neuem UGC-Content von echten Creatorn.',
  },
] as const

/**
 * Briefing — die Stufen des Views-Reglers, von 100.000 bis 10 Millionen.
 * Vom Auftraggeber so freigegeben.
 */
export const VIEW_STEPS = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000] as const

const labelIn = (list: readonly { value: string; label: string }[], value: string | null | undefined) =>
  list.find((o) => o.value === value)?.label ?? value ?? '–'

export const agencyPlatformLabel = (v: string) => labelIn(AGENCY_PLATFORMS, v)
export const agencyClientsLabel = (v: string | null | undefined) => labelIn([...AGENCY_CLIENTS, ...LEGACY_CLIENTS], v)
/** Englisch für den Admin-Bereich. */
export const agencyClientsLabelEn = (v: string | null | undefined) =>
  [...AGENCY_CLIENTS, ...LEGACY_CLIENTS].find((o) => o.value === v)?.labelEn ?? (v || '–')
export const agencySourceLabel = (v: string) => labelIn(AGENCY_SOURCES, v)
export const agencyFootageLabel = (v: string) => labelIn(AGENCY_FOOTAGE, v)
export const agencyPackageLabel = (v: string | null | undefined) => labelIn(AGENCY_PACKAGES, v)
export const agencySocialLabel = (v: string) => labelIn(AGENCY_SOCIALS, v)

/** „Marketing-Agentur“, … — bei „Andere Agentur“ der selbst eingetragene Text. */
export const agencyKindLabel = (lead: { kind: string; kindOther: string | null }) =>
  lead.kind === 'sonstiges' && lead.kindOther
    ? `Andere: ${lead.kindOther}`
    : labelIn([...AGENCY_KINDS, ...LEGACY_KINDS], lead.kind)

/** „100K“, „2,5 Mio.“ — für Regler und Listen. */
export function viewsShort(n: number | null | undefined): string {
  if (!n) return '–'
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.`
  return `${Math.round(n / 1000).toLocaleString('de-DE')}K`
}

/** Die gespeicherten Social-Kanäle, in der Reihenfolge des Formulars. */
export function agencySocials(lead: { socials: string }): { key: string; label: string; value: string }[] {
  let raw: Record<string, string> = {}
  try {
    raw = JSON.parse(lead.socials || '{}')
  } catch {
    raw = {}
  }
  return AGENCY_SOCIALS.filter((s) => raw[s.value]).map((s) => ({ key: s.value, label: s.label, value: raw[s.value] }))
}

/* ------------------------------------------------------------ Briefing */

/** Höchstens 100 Mio. € — alles darüber ist ein Tippfehler. */
const BUDGET_MAX_CENTS = 100_000_000 * 100

/**
 * Das Briefing einer Kampagne. Die erste Kampagne nach dem Login fragt
 * Views, Budget und Auftrag (`pkg`); Nische und Plattformen kommen dort aus
 * dem Eintrag auf /brands. Jede weitere („Neue Kampagne“) fragt Name,
 * Bereich, Plattformen, Views und Budget — ohne Auftrag.
 */
export interface Briefing {
  views: number
  budgetCents: number
  pkg: string | null
  niche: string | null
  platforms: string[]
}

function parseViewsBudget(body: Record<string, unknown>): { views: number; budgetCents: number } | { error: string } {
  const views = Number(body.views)
  const budgetCents = Math.round(Number(body.budget) * 100)
  if (!(VIEW_STEPS as readonly number[]).includes(views)) return { error: 'Bitte wähle die gewünschten Views.' }
  if (!Number.isFinite(budgetCents) || budgetCents < 100 || budgetCents > BUDGET_MAX_CENTS) {
    return { error: 'Bitte gib dein Budget in Euro ein.' }
  }
  return { views, budgetCents }
}

/** Das erste Briefing nach dem Login: Views, Budget, Auftrag. */
export function parseBriefing(body: Record<string, unknown>): Omit<Briefing, 'niche' | 'platforms'> | { error: string } {
  const vb = parseViewsBudget(body)
  if ('error' in vb) return vb
  const pkg = String(body.package ?? '').trim().slice(0, 40)
  if (!AGENCY_PACKAGES.some((p) => p.value === pkg)) return { error: 'Bitte wähle, was du beauftragen möchtest.' }
  return { ...vb, pkg }
}

/**
 * „Neue Kampagne“: Name, Bereich, Plattformen, Views, Budget — und die
 * ausdrückliche Bestätigung, dass der Auftrag verbindlich ist.
 */
export function parseNewCampaign(body: Record<string, unknown>): (Briefing & { name: string }) | { error: string } {
  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!name) return { error: 'Bitte gib der Kampagne einen Namen.' }
  const niche = String(body.niche ?? '').trim()
  if (!(INDUSTRIES as readonly string[]).includes(niche)) return { error: 'Bitte wähle den Bereich der Kampagne.' }
  const allowed = AGENCY_PLATFORMS.map((p) => p.value as string)
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map(String))].filter((p) => allowed.includes(p))
    : []
  if (!platforms.length) return { error: 'Bitte wähle mindestens eine Plattform.' }
  const vb = parseViewsBudget(body)
  if ('error' in vb) return vb
  if (body.binding !== true) return { error: 'Bitte bestätige, dass du die Kampagne verbindlich beauftragst.' }
  return { name, niche, platforms, pkg: null, ...vb }
}

/** Preis pro 1.000 Views in Cent — Budget geteilt durch die gewünschten Views. */
export const pricePerThousandCents = (b: { views: number; budgetCents: number }) =>
  Math.round((b.budgetCents * 1000) / b.views)

/** Das Briefing, das an einer Kampagne hängt — oder null (Kunden, Creator, Admin). */
export function projectBriefing(p: {
  briefingViews: number | null
  briefingBudgetCents: number | null
  briefingPackage: string | null
  briefingNiche: string | null
  briefingPlatforms: string | null
}): Briefing | null {
  if (!p.briefingViews || !p.briefingBudgetCents) return null
  let platforms: string[] = []
  try {
    platforms = JSON.parse(p.briefingPlatforms || '[]')
  } catch {
    platforms = []
  }
  return {
    views: p.briefingViews,
    budgetCents: p.briefingBudgetCents,
    pkg: p.briefingPackage,
    niche: p.briefingNiche,
    platforms,
  }
}

/* ------------------------------------------------------------- Zugang */

/** Zugang hat, wer freigegeben ist UND das Briefing abgeschickt hat. */
export const agencyUnlocked = (lead: Pick<AgencyLead, 'accessAt' | 'briefedAt'> | null | undefined): boolean =>
  Boolean(lead?.accessAt && lead?.briefedAt)

export async function agencyLeadForUser(env: Env, userId: string): Promise<AgencyLead | null> {
  const [row] = await getDb(env)
    .select()
    .from(schema.agencyLeads)
    .where(eq(schema.agencyLeads.userId, userId))
    .limit(1)
  return row ?? null
}

export async function agencyHasAccess(env: Env, userId: string): Promise<boolean> {
  return agencyUnlocked(await agencyLeadForUser(env, userId))
}

/** Das Demo-Konto (siehe lib/demo.ts) — erfundene Daten, schreibgeschützt. */
export async function isDemoAgency(env: Env, userId: string): Promise<boolean> {
  return Boolean((await agencyLeadForUser(env, userId))?.demo)
}

/* ---------------------------------------------------- Cooperation-Codes */

/**
 * Ohne 0/O und 1/I/L — ein Code wird abgetippt, oft vom Handy aus einer
 * WhatsApp-Nachricht. 31 Zeichen hoch sechs sind knapp 900 Millionen
 * Möglichkeiten; Fehlversuche bremst der Zähler je Verbindung.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const COOP_CODE_LENGTH = 6

/** Großbuchstaben, ohne Leerzeichen und Bindestriche — so wie gespeichert. */
export const normalizeCooperationCode = (raw: unknown): string =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)

function randomCode(): string {
  const buf = new Uint8Array(1)
  let out = ''
  while (out.length < COOP_CODE_LENGTH) {
    crypto.getRandomValues(buf)
    // Gleichverteilt: 248 = 8 · 31, alles darüber wird verworfen.
    if (buf[0] < 248) out += CODE_ALPHABET[buf[0] % CODE_ALPHABET.length]
  }
  return out
}

/** Neuer Code — bei einer (sehr unwahrscheinlichen) Dublette ein neuer Versuch. */
export async function createCooperationCode(
  env: Env,
  o: { note: string | null; createdBy: string },
): Promise<{ id: string; code: string }> {
  const db = getDb(env)
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = uid()
    const code = randomCode()
    try {
      await db.insert(schema.cooperationCodes).values({
        id,
        code,
        note: o.note,
        createdBy: o.createdBy,
        createdAt: nowSec(),
      })
      return { id, code }
    } catch (err) {
      if (attempt === 5) throw err
    }
  }
  throw new Error('Kein freier Code gefunden.')
}

/** Ein noch nicht eingelöster Code — oder null. */
export async function openCooperationCode(env: Env, code: string) {
  if (code.length !== COOP_CODE_LENGTH) return null
  const [row] = await getDb(env)
    .select()
    .from(schema.cooperationCodes)
    .where(and(eq(schema.cooperationCodes.code, code), isNull(schema.cooperationCodes.usedAt)))
    .limit(1)
  return row ?? null
}

/**
 * Löst einen Code ein — in EINER Anweisung. Zwei gleichzeitige Formulare mit
 * demselben Code können ihn so nicht beide bekommen: nur eine Zeile erfüllt
 * `used_at IS NULL`, die zweite Anweisung ändert nichts.
 */
export async function claimCooperationCode(env: Env, code: string, userId: string | null): Promise<string | null> {
  if (code.length !== COOP_CODE_LENGTH) return null
  const row = await env.DB.prepare(
    `UPDATE cooperation_codes SET used_at = ?1, used_by = ?2 WHERE code = ?3 AND used_at IS NULL RETURNING id`,
  )
    .bind(nowSec(), userId, code)
    .first<{ id: string }>()
  return row?.id ?? null
}

/** Gibt einen eingelösten Code zurück — nur, wenn der Eintrag danach doch scheiterte. */
export async function releaseCooperationCode(env: Env, codeId: string): Promise<void> {
  await getDb(env)
    .update(schema.cooperationCodes)
    .set({ usedAt: null, usedBy: null })
    .where(eq(schema.cooperationCodes.id, codeId))
}

/* ----------------------------------------------------------- Buchungen */

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  angefragt: 'Angefragt',
  bestaetigt: 'Bestätigt',
  abgelehnt: 'Abgelehnt',
}

/**
 * Entscheidet über eine Buchungsanfrage — die Aktion im Admin-Bereich.
 *
 * Bestätigt heißt: der Creator kommt ins Team der Kampagne, und zwar über
 * `addToTeam`, denselben Weg wie jede Zuordnung im Admin-Bereich. Die
 * Verbreitung über Creator wird dabei eingeschaltet — wer einen Creator
 * bucht, will, dass er die Clips auf seinen Kanälen ausspielt.
 */
export async function decideBooking(
  env: Env,
  bookingId: string,
  accept: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb(env)
  const [booking] = await db
    .select()
    .from(schema.creatorBookings)
    .where(eq(schema.creatorBookings.id, bookingId))
    .limit(1)
  if (!booking) return { ok: false, error: 'Booking not found.' }

  if (accept) {
    const [creator] = await db
      .select({ userId: schema.creators.userId })
      .from(schema.creators)
      .where(eq(schema.creators.id, booking.creatorId))
      .limit(1)
    if (!creator) return { ok: false, error: 'Creator not found.' }
    await db
      .update(schema.projects)
      .set({ creatorDistribution: 1 })
      .where(eq(schema.projects.id, booking.projectId))
    const added = await addToTeam(env, booking.projectId, creator.userId)
    if (!added.ok) return added
  }

  await db
    .update(schema.creatorBookings)
    .set({ status: accept ? 'bestaetigt' : 'abgelehnt', decidedAt: nowSec() })
    .where(eq(schema.creatorBookings.id, bookingId))
  return { ok: true }
}

/** Die Buchungsanfragen einer Agentur, neueste zuerst. */
export async function bookingsOfAgency(env: Env, userId: string) {
  return getDb(env)
    .select({
      booking: schema.creatorBookings,
      creatorName: schema.users.fullName,
      projectName: schema.projects.name,
    })
    .from(schema.creatorBookings)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.creatorBookings.creatorId))
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.creatorBookings.projectId))
    .where(eq(schema.creatorBookings.agencyUserId, userId))
    .orderBy(desc(schema.creatorBookings.createdAt))
}

/* ------------------------------------------------------------- Löschen */

/**
 * Löscht eine Agentur restlos — Zugang, eigene Kampagnen mit Dateien und
 * verbundenen Accounts (über den Kundenweg, der beim Anbieter trennt),
 * Lead-Angaben und Buchungen (per Kaskade am Nutzer). Ein eingelöster Code
 * bleibt verbraucht.
 */
export async function deleteAgencyAccount(env: Env, userId: string): Promise<boolean> {
  const db = getDb(env)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user || user.role !== 'agency') return false
  const customer = await customerForUser(env, userId)
  if (customer) await deleteCustomerAccount(env, customer.id)
  else await db.delete(schema.users).where(eq(schema.users.id, userId))
  return true
}
