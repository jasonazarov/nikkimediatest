import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { getDb, nowSec, uid, schema } from './db'
import { releaseAtProvider, releaseCreatorAtProvider } from './publisher'
import { deleteObject, formatBytes, r2Ready } from './r2'
import {
  mailDistributionAssigned,
  mailJobAssigned,
  mailJobWaitingAdmin,
  mailJobWithdrawn,
  mailStorageWarning,
  type WorkerArea,
} from './mail'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Env } from './types'
import type { Role } from '../db/schema'

/* ------------------------------------------------- Auswahllisten (Stepper) */

export const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', subtitle: 'Reels' },
  { value: 'tiktok', label: 'TikTok', subtitle: 'For You Page' },
  { value: 'youtube', label: 'YouTube', subtitle: 'Shorts' },
  { value: 'facebook', label: 'Facebook', subtitle: 'Reels' },
] as const

export const INDUSTRIES = [
  'Gastronomie',
  'E-Commerce',
  'Coaches & Berater',
  'Personal Brands',
  'Musiker & Künstler',
  'Immobilien',
  'Beauty & Ästhetik',
  'Fitness & Sport',
  'MMA',
  'B2B-Services',
  'SaaS & Tech',
  'Fintech',
  'Entertainment',
  'Sonstiges',
] as const

export const FOOTAGE = [
  { value: 'viel', label: 'Viel', subtitle: 'Archiv mit Stunden an Material' },
  { value: 'wenig', label: 'Wenig', subtitle: 'ein paar Clips und Fotos' },
  { value: 'nichts', label: 'Noch nichts', subtitle: 'wir brauchen Content-Vorgaben' },
] as const

/**
 * Schritt 4 fragt nicht mehr nach Geld, sondern nach der geplanten Menge an
 * Videos pro Monat. Das Feld heißt in der Datenbank weiterhin `budget_range` —
 * ein Umbenennen würde die bereits gespeicherten Leads verlieren. Ältere
 * Einträge tragen dort also noch Beträge; die Anzeige gibt den Rohwert aus und
 * bleibt damit auch für sie richtig.
 */
export const BUDGETS = [
  'Bis zu 100',
  'Bis zu 250',
  'Bis zu 500',
  'Über 1000',
] as const

export const LEAD_STATUS = [
  'Neu',
  'Kontaktiert',
  'Nicht erreicht',
  'Termin vereinbart',
  'Angebot raus',
  'Gewonnen',
  'Abgelehnt',
  'Verloren',
] as const

export type LeadStatus = (typeof LEAD_STATUS)[number]

export const platformLabel = (value: string) =>
  PLATFORMS.find((p) => p.value === value)?.label ?? value

export const footageLabel = (value: string) => FOOTAGE.find((f) => f.value === value)?.label ?? value

/* ------------------------------------------ Auswahllisten (Clipper-Stepper)

   `value` ist der Schlüssel in der Datenbank (`clipper_applications`).
   Zwei Texte je Antwort: `labelDe`/`subtitleDe` stehen auf der deutschen
   Clipper-Landingpage (/clipper), `label`/`subtitle` bleiben Englisch für den
   englischen Admin-Bereich (workStatusLabel & Co. unten lesen `label`). */

export const CLIPPER_WORK_STATUS = [
  {
    value: 'full_time',
    label: 'Full-time',
    subtitle: 'employed or self-employed',
    labelDe: 'Vollzeit',
    subtitleDe: 'angestellt oder selbstständig',
  },
  {
    value: 'part_time',
    label: 'Part-time',
    subtitle: 'alongside something else',
    labelDe: 'Teilzeit',
    subtitleDe: 'neben Job, Studium oder Ausbildung',
  },
  {
    value: 'job_seeking',
    label: 'Looking for work',
    subtitle: 'open to something new',
    labelDe: 'Auf Jobsuche',
    subtitleDe: 'offen für etwas Neues',
  },
] as const

export const CLIPPER_EXPERIENCE = [
  {
    value: 'professional',
    label: 'Yes, professionally',
    subtitle: 'I already edit for clients or my own accounts',
    labelDe: 'Ja, beruflich',
    subtitleDe: 'ich schneide schon für Kunden oder eigene Accounts',
  },
  {
    value: 'hobby',
    label: 'Yes, as a hobby',
    subtitle: 'CapCut, Premiere & co. feel familiar',
    labelDe: 'Ja, als Hobby',
    subtitleDe: 'CapCut, Premiere & Co. sind mir vertraut',
  },
  {
    value: 'none',
    label: 'Not yet, but I learn fast',
    subtitle: 'no experience so far',
    labelDe: 'Noch nicht, aber ich lerne schnell',
    subtitleDe: 'bisher keine Erfahrung',
  },
] as const

export const CLIPPER_AVAILABILITY = [
  { value: 'up_to_10', label: 'Up to 10 hours a week', labelDe: 'Bis zu 10 Stunden pro Woche' },
  { value: '10_to_20', label: '10–20 hours a week', labelDe: '10–20 Stunden pro Woche' },
  { value: '20_plus', label: '20+ hours a week', labelDe: 'Mehr als 20 Stunden pro Woche' },
] as const

const labelIn = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((o) => o.value === value)?.label ?? value

export const workStatusLabel = (value: string) => labelIn(CLIPPER_WORK_STATUS, value)
export const experienceLabel = (value: string) => labelIn(CLIPPER_EXPERIENCE, value)
export const availabilityLabel = (value: string) => labelIn(CLIPPER_AVAILABILITY, value)

/* ------------------------------------------ Auswahllisten (Creator-Stepper)

   Deutsch wie der ganze Creator-Bereich. `value` ist der Schlüssel in der
   Datenbank (`creators`), `label` steht auf der Seite und im Admin-Bereich. */

/** Was der Creator bei uns will — Kampagnen annehmen, eigene hochladen oder beides. */
export const CREATOR_GOALS = [
  { value: 'suchen', label: 'Ich suche Kampagnen', subtitle: 'Aufträge annehmen und damit Geld verdienen' },
  { value: 'haben', label: 'Ich habe Kampagnen', subtitle: 'mein Material hochladen und daraus Clips machen lassen' },
  { value: 'beides', label: 'Beides', subtitle: 'Kampagnen annehmen und eigene hochladen' },
] as const

/**
 * Plattformen des Creator-Steppers. Mehr als bei Kunden und Clippern: ein
 * Creator hat seine Reichweite oft auch auf X, Snapchat, Twitch oder
 * LinkedIn. Die Werte folgen den Schlüsseln des Veröffentlichungsanbieters
 * (X heißt dort `twitter`).
 */
export const CREATOR_PLATFORMS = [
  { value: 'instagram', label: 'Instagram', subtitle: 'Reels & Posts' },
  { value: 'tiktok', label: 'TikTok', subtitle: 'For You Page' },
  { value: 'youtube', label: 'YouTube', subtitle: 'Shorts & Videos' },
  { value: 'facebook', label: 'Facebook', subtitle: 'Reels' },
  { value: 'twitter', label: 'X', subtitle: 'Posts & Videos' },
  { value: 'snapchat', label: 'Snapchat', subtitle: 'Spotlight & Stories' },
  { value: 'twitch', label: 'Twitch', subtitle: 'Streams & Clips' },
  { value: 'linkedin', label: 'LinkedIn', subtitle: 'Posts & Videos' },
] as const

export const CREATOR_AD_OPENNESS = [
  { value: 'ja', label: 'Ja, gerne', subtitle: 'Kundenanfragen passen gut in meinen Content' },
  { value: 'vielleicht', label: 'Kommt drauf an', subtitle: 'je nach Marke und Kampagne' },
  { value: 'nein', label: 'Eher nicht', subtitle: 'ich möchte keine Werbung einbauen' },
] as const

export const CREATOR_FOLLOWERS = [
  { value: 'unter_1k', label: 'Unter 1.000' },
  { value: '1k_10k', label: '1.000 – 10.000' },
  { value: '10k_50k', label: '10.000 – 50.000' },
  { value: '50k_100k', label: '50.000 – 100.000' },
  { value: '100k_1m', label: '100.000 – 1 Mio.' },
  { value: 'ueber_1m', label: 'Über 1 Mio.' },
] as const

export const CREATOR_VIEWS_TOTAL = [
  { value: 'unter_10k', label: 'Unter 10.000' },
  { value: '10k_100k', label: '10.000 – 100.000' },
  { value: '100k_1m', label: '100.000 – 1 Mio.' },
  { value: '1m_10m', label: '1 – 10 Mio.' },
  { value: 'ueber_10m', label: 'Über 10 Mio.' },
] as const

export const CREATOR_VIEWS_30D = [
  { value: 'unter_10k', label: 'Unter 10.000' },
  { value: '10k_100k', label: '10.000 – 100.000' },
  { value: '100k_500k', label: '100.000 – 500.000' },
  { value: '500k_1m', label: '500.000 – 1 Mio.' },
  { value: 'ueber_1m', label: 'Über 1 Mio.' },
] as const

export const creatorGoalLabel = (value: string) => labelIn(CREATOR_GOALS, value)
export const creatorPlatformLabel = (value: string) => labelIn(CREATOR_PLATFORMS, value)
export const adOpennessLabel = (value: string) => labelIn(CREATOR_AD_OPENNESS, value)
export const followersLabel = (value: string) => labelIn(CREATOR_FOLLOWERS, value)
export const viewsTotalLabel = (value: string) => labelIn(CREATOR_VIEWS_TOTAL, value)
export const views30dLabel = (value: string) => labelIn(CREATOR_VIEWS_30D, value)

/* ------------------------------------------------------------- Speicher */

/** Speicherbilanz eines Kunden fortschreiben (delta darf negativ sein). */
export async function addStorage(env: Env, customerId: string, delta: number): Promise<void> {
  await getDb(env)
    .update(schema.customers)
    .set({ storageBytes: sql`MAX(0, ${schema.customers.storageBytes} + ${delta})` })
    .where(eq(schema.customers.id, customerId))
}

/**
 * Prüft die Schwelle (Standard 100 GB) und warnt Jason genau einmal pro Kunde.
 * Wird beim Upload-Abschluss und zusätzlich per Cron aufgerufen.
 */
export async function checkStorageWarning(env: Env, customerId: string): Promise<void> {
  const db = getDb(env)
  const limit = Number(env.STORAGE_WARN_BYTES || 107374182400)
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1)

  if (!customer || customer.storageWarnedAt || customer.storageBytes <= limit) return

  await db
    .update(schema.customers)
    .set({ storageWarnedAt: nowSec() })
    .where(eq(schema.customers.id, customerId))

  await mailStorageWarning(env, {
    company: customer.company,
    customerId: customer.id,
    used: formatBytes(customer.storageBytes),
    limit: formatBytes(limit),
  })
}

/* ------------------------------------------------------- Zugänge anlegen */

/**
 * Ergebnis eines Selbsteintrags.
 *
 * `created` entscheidet, wie es danach weitergeht: Gab es die Adresse schon,
 * schreibt das Formular nichts in den Zugang und es gibt keine Sitzung, nur
 * einen Login-Code an die Adresse — sonst könnte jeder, der eine fremde
 * Adresse kennt, sich über das Formular in deren Zugang setzen.
 *
 * `fullName` ist der GESPEICHERTE Name — bei einem bestehenden Zugang also
 * nicht der aus dem Formular. Mails an eine fremde Adresse sprechen deren
 * Inhaber an, nicht den, der sie eingetippt hat.
 *
 * `other_role`: Die Adresse gehört bereits zu einer anderen Rolle. Eine
 * E-Mail-Adresse steht in diesem System für genau eine Rolle (siehe
 * `users_email_unique`), ein zweiter Zugang daneben ist nicht vorgesehen.
 */
export type Provisioned<T> =
  | ({ ok: true; userId: string; fullName: string; created: boolean } & T)
  | { ok: false; reason: 'other_role' }

/**
 * Gehört die Adresse schon einem Zugang mit ANDERER Rolle? Nur lesend: Die
 * Selbsteinträge fragen das, bevor sie den Zähler je Verbindung belasten —
 * ein Versuch, der daran scheitert, legt nichts an und verschickt nichts.
 */
export async function emailHeldByOtherRole(env: Env, email: string, role: Role): Promise<boolean> {
  const [user] = await getDb(env)
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .limit(1)
  return !!user && user.role !== role
}

/** Findet oder erzeugt den Nutzer zu einer Adresse — streng für genau eine Rolle. */
async function provisionUser(
  env: Env,
  role: Role,
  o: { email: string; fullName: string; phone: string },
): Promise<Provisioned<{}>> {
  const db = getDb(env)
  const email = o.email.trim().toLowerCase()

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (user) {
    if (user.role !== role) return { ok: false, reason: 'other_role' }
    return { ok: true, userId: user.id, fullName: user.fullName, created: false }
  }

  const id = uid()
  await db.insert(schema.users).values({
    id,
    email,
    role,
    fullName: o.fullName,
    phone: o.phone,
    createdAt: nowSec(),
  })
  return { ok: true, userId: id, fullName: o.fullName, created: true }
}

/**
 * Legt Nutzer und Kundenzugang an. Existiert der Nutzer bereits, wird er
 * wiederverwendet, damit ein zweiter Lead kein Duplikat erzeugt.
 *
 * Hier entsteht bewusst KEIN Projekt. Ein automatisch angelegtes Projekt
 * müsste einen Namen erfinden — der Firmenname aus dem Formular —, und der
 * ist fast nie der Name, den der Kunde seinem Vorhaben geben will. Die
 * einzige Ausnahme ist ein Cloud-Link im Formular: der braucht ein Projekt,
 * an dem er hängt (siehe POST /api/leads).
 */
export async function provisionCustomer(
  env: Env,
  o: { email: string; fullName: string; phone: string; company?: string | null },
): Promise<Provisioned<{ customerId: string }>> {
  const user = await provisionUser(env, 'customer', o)
  if (!user.ok) return user

  const existing = await customerForUser(env, user.userId)
  if (existing) return { ...user, customerId: existing.id }

  const id = uid()
  await getDb(env).insert(schema.customers).values({
    id,
    userId: user.userId,
    company: o.company ?? null,
    storageBytes: 0,
    createdAt: nowSec(),
  })
  return { ...user, customerId: id }
}

/**
 * Legt Nutzer und Clipper-Zugang an — der Selbsteintrag über /clipper.
 *
 * Ein neuer Zugang startet wie ein eingeladener als `eingeladen` und wird mit
 * dem ersten Code-Login `aktiv` (siehe `completeLogin`) — der Code aus der
 * Willkommens-Mail bestätigt die Adresse. Jobs bekommt er, sobald der
 * Administrator ihm einen zuordnet.
 */
export async function provisionClipper(
  env: Env,
  o: { email: string; fullName: string; phone: string },
): Promise<Provisioned<{ clipperId: string }>> {
  const user = await provisionUser(env, 'clipper', o)
  if (!user.ok) return user

  const existing = await clipperForUser(env, user.userId)
  if (existing) return { ...user, clipperId: existing.id }

  const id = uid()
  await getDb(env).insert(schema.clippers).values({
    id,
    userId: user.userId,
    displayName: o.fullName,
    status: 'eingeladen',
    createdAt: nowSec(),
  })
  return { ...user, clipperId: id }
}

/**
 * Legt Nutzer und Creator-Zugang an — der Selbsteintrag über /creator.
 *
 * Ein Creator braucht drei Zeilen, und alle drei entstehen hier zusammen:
 *
 *   creators    seine Angaben aus dem Stepper
 *   customers   sein Arbeitsbereich für EIGENE Kampagnen — dieselben
 *               Projekte, Ordner und Uploads wie bei einem Kunden, nur unter
 *               dem Wort „Kampagne“. Bleibt ohne `converted_at`, taucht also
 *               nie in der Kundenliste auf.
 *   clippers    sein Bearbeiterprofil — darüber bekommt er Kampagnen
 *               zugeordnet (`project_workers`) und liefert fertige Clips
 *               ab, genau wie ein Clipper.
 *
 * Gab es den Zugang schon, bleiben seine Angaben unangetastet — der Eintrag
 * kann von jemandem stammen, der nur die Adresse kennt. Fehlende Zeilen
 * werden ergänzt, bestehende wiederverwendet.
 *
 * Das Bearbeiterprofil startet wie beim Clipper als `eingeladen` und wird
 * mit dem ersten Code-Login `aktiv` (siehe `completeLogin`).
 */
export async function provisionCreator(
  env: Env,
  o: {
    email: string
    fullName: string
    phone: string
    profile: {
      goal: string
      niche: string
      platforms: string[]
      openToAds: string
      followers: string
      viewsTotal: string
      views30d: string
      handles: Record<string, string>
      source?: string | null
    }
  },
): Promise<Provisioned<{ creatorId: string; customerId: string; clipperId: string }>> {
  const user = await provisionUser(env, 'creator', o)
  if (!user.ok) return user

  const db = getDb(env)
  const ts = nowSec()
  const values = {
    goal: o.profile.goal,
    niche: o.profile.niche,
    platforms: JSON.stringify(o.profile.platforms),
    openToAds: o.profile.openToAds,
    followers: o.profile.followers,
    viewsTotal: o.profile.viewsTotal,
    views30d: o.profile.views30d,
    handles: JSON.stringify(o.profile.handles),
    source: o.profile.source || null,
  }

  const existingCreator = await creatorForUser(env, user.userId)
  const creatorId = existingCreator?.id ?? uid()
  if (!existingCreator) {
    await db.insert(schema.creators).values({ id: creatorId, userId: user.userId, ...values, createdAt: ts })
  }

  const existingCustomer = await customerForUser(env, user.userId)
  const customerId = existingCustomer?.id ?? uid()
  if (!existingCustomer) {
    await db.insert(schema.customers).values({ id: customerId, userId: user.userId, storageBytes: 0, createdAt: ts })
  }

  const existingClipper = await clipperForUser(env, user.userId)
  const clipperId = existingClipper?.id ?? uid()
  if (!existingClipper) {
    await db.insert(schema.clippers).values({
      id: clipperId,
      userId: user.userId,
      displayName: user.fullName,
      status: 'eingeladen',
      createdAt: ts,
    })
  }

  return { ...user, creatorId, customerId, clipperId }
}

/**
 * Legt Nutzer und Arbeitsbereich einer Agentur an — der Selbsteintrag über
 * /brands. Die Angaben aus dem Stepper (`agency_leads`) schreibt die Route,
 * und zwar nur für einen NEUEN Zugang: wer eine fremde Adresse kennt, darf
 * nichts in deren Zugang hineinschreiben.
 *
 * Der Arbeitsbereich (`customers`) trägt die eigenen Kampagnen der Agentur —
 * dieselben Projekte, Ordner und Uploads wie bei Kunden. Er bleibt ohne
 * `converted_at` und taucht deshalb nie in der Kundenliste auf.
 */
export async function provisionAgency(
  env: Env,
  o: { email: string; fullName: string; phone: string; company?: string | null },
): Promise<Provisioned<{ customerId: string }>> {
  const user = await provisionUser(env, 'agency', o)
  if (!user.ok) return user

  const existing = await customerForUser(env, user.userId)
  if (existing) return { ...user, customerId: existing.id }

  const id = uid()
  await getDb(env).insert(schema.customers).values({
    id,
    userId: user.userId,
    company: o.company ?? null,
    storageBytes: 0,
    createdAt: nowSec(),
  })
  return { ...user, customerId: id }
}

/* ------------------------------------------------------------- Hilfsdaten */

/** Kunden-Datensatz zum eingeloggten Nutzer. */
export async function customerForUser(env: Env, userId: string) {
  const [row] = await getDb(env)
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.userId, userId))
    .limit(1)
  return row ?? null
}

export async function creatorForUser(env: Env, userId: string) {
  const [row] = await getDb(env)
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.userId, userId))
    .limit(1)
  return row ?? null
}

export async function clipperForUser(env: Env, userId: string) {
  const [row] = await getDb(env)
    .select()
    .from(schema.clippers)
    .where(eq(schema.clippers.userId, userId))
    .limit(1)
  return row ?? null
}

/** Erstes Projekt eines Kunden — Rückfallebene, wenn keins bestimmt ist. */
export async function primaryProject(env: Env, customerId: string) {
  const [row] = await getDb(env)
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.customerId, customerId))
    .orderBy(schema.projects.createdAt)
    .limit(1)
  return row ?? null
}

/** Alle Projekte eines Kunden, ältestes zuerst. */
export async function projectsOf(env: Env, customerId: string) {
  return getDb(env)
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.customerId, customerId))
    .orderBy(schema.projects.createdAt)
}

/**
 * Legt ein weiteres Projekt für einen bestehenden Kunden an.
 *
 * Ein Kunde hat oft mehrere Vorhaben nebeneinander — Restaurant, Personal
 * Brand, Software-Firma. Jedes davon ist ein eigenes Projekt mit eigenem
 * Rohmaterial und eigenem Clipper; nur so sieht ein Cutter, der am
 * Restaurant arbeitet, nicht das Material der Software-Firma.
 *
 * Zum Projekt gehört von Anfang an ein Wurzelordner. Ohne ihn hätte der Kunde
 * keinen Ort, an den er das Rohmaterial dieses Projekts legen könnte.
 *
 * `folderName` steuert dessen Namen. Er ist standardmäßig der Projektname —
 * bei mehreren Projekten braucht der Kunde diese Unterscheidung. Beim
 * allerersten Projekt eines Kunden trägt er dagegen den neutralen Namen
 * „Rohmaterial“: ein Ordner, der genauso heißt wie das Projekt, das ihn
 * enthält, sagt nichts.
 *
 * Vergeben wird dabei NICHTS: ein neues Projekt sieht kein Clipper und kein
 * Creator, bis der Administrator es jemandem zuordnet (`assignProject`).
 * Benachrichtigt wird auch noch niemand — der Ordner ist in diesem Moment
 * leer. Die Mail an den Administrator folgt erst, wenn tatsächlich Material
 * ankommt, eine Datei oder ein Cloud-Link (siehe `notifyMaterialAdded`).
 */
export async function createProject(
  env: Env,
  o: { customerId: string; name: string; folderName?: string },
): Promise<{ id: string; folderId: string }> {
  const db = getDb(env)
  const ts = nowSec()
  const id = uid()
  const folderId = uid()

  await db.insert(schema.projects).values({
    id,
    customerId: o.customerId,
    name: o.name,
    status: 'aktiv',
    createdAt: ts,
  })

  await db.insert(schema.folders).values({
    id: folderId,
    customerId: o.customerId,
    projectId: id,
    name: o.folderName ?? o.name,
    parentId: null,
    createdAt: ts,
  })

  /*
   * Beim Anbieter passiert an dieser Stelle bewusst NICHTS mehr.
   *
   * Früher entstand hier ein Team, weil dort ein Team die Voraussetzung zum
   * Veröffentlichen war. Heute entstehen die Steckplätze erst beim
   * Verbinden eines Accounts — vorher gäbe es nichts zu füllen, und ein
   * leerer Container wird von der Gegenseite ohnehin abgewiesen.
   *
   * Das Projekt ist damit sofort vollständig benutzbar, ohne von einem
   * fremden Dienst abzuhängen.
   */
  return { id, folderId }
}

/* ==========================================================================
   JOBS — der Administrator ordnet jedes Projekt einzeln zu

   Clipper und Creator, die Aufträge suchen, sehen KEINE offenen Projekte:
   weder welche es gibt noch wie viele. Ihr Arbeitsbereich zeigt nur, was
   ihnen zugeordnet ist, darüber „NIKKI MEDIA wird dir in Kürze eine
   Kampagne zuordnen.“ Rohmaterial und Cloud-Links eines Projekts sieht
   außer dem Besitzer nur der Administrator — und nach der Zuordnung die
   Bearbeiter, denen er das Projekt gegeben hat (`clipperHasProject`).

   Seit Oktober 2026 hat eine Kampagne beliebig viele Bearbeiter
   (`project_workers`) — Clipper wie Creator, so viele der Administrator
   will. Ein Creator kann dabei schneiden UND verbreiten (`addToTeam`).

   Es gibt keinen Weg, an dem ein Projekt von selbst bei jemandem landet:
   kein Annehmen, keine Ausschreibung per Mail an alle. Die einzige Stelle,
   an der ein Projekt einen Bearbeiter bekommt, ist `assignWorker`.

   Damit nichts unbemerkt liegen bleibt, bekommt der Administrator eine Mail,
   sobald in einem noch nicht zugeordneten Projekt das erste Material liegt
   (`notifyMaterialAdded`).
   ========================================================================== */

/**
 * Alle Clipper mit Namen und Adresse — eingeladene zählen mit. Creator
 * stehen ebenfalls darin: sie haben dieselbe Zeile in `clippers` und können
 * genauso Projekte zugeordnet bekommen.
 */
export async function allClippers(env: Env) {
  return getDb(env)
    .select({
      id: schema.clippers.id,
      displayName: schema.clippers.displayName,
      email: schema.users.email,
      userId: schema.users.id,
      role: schema.users.role,
      verifiedAt: schema.users.verifiedAt,
    })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .orderBy(schema.clippers.displayName)
}

/** Jemand, der Jobs bearbeiten kann — ein Clipper oder ein Creator. */
export type Worker = Awaited<ReturnType<typeof allClippers>>[number]

/**
 * Clipper und Creator bekommen ihre Post auf Deutsch — Clipper mit
 * „Projekt“ und Knöpfen nach /work, Creator mit „Kampagne“.
 */
export const workerArea = (w: { role: string }): WorkerArea => (w.role === 'creator' ? 'creator' : 'clipper')

/**
 * Wer ein Projekt zugeordnet bekommen kann: alle Clipper und Creator — außer
 * dem, dem das Projekt selbst gehört. Ein Creator bearbeitet seine eigene
 * Kampagne nicht selbst.
 */
export async function workersFor(env: Env, projectId: string): Promise<Worker[]> {
  const [owner] = await getDb(env)
    .select({ userId: schema.customers.userId })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  return (await allClippers(env)).filter((w) => w.userId !== owner?.userId)
}

/**
 * SQL-Bedingung „in diesem Projekt liegt Material“: mindestens eine fertig
 * hochgeladene Datei oder mindestens ein Cloud-Link. Genau das macht aus
 * einem Projekt einen Job — ein leerer Ordner ist noch keiner.
 */
const hasMaterial = (projectId: unknown) => sql`(
  EXISTS (SELECT 1 FROM ${schema.projectLinks} WHERE ${schema.projectLinks.projectId} = ${projectId})
  OR EXISTS (
    SELECT 1 FROM ${schema.rawAssets}
    INNER JOIN ${schema.folders} ON ${schema.folders.id} = ${schema.rawAssets.folderId}
    WHERE ${schema.folders.projectId} = ${projectId}
      AND ${schema.rawAssets.uploadStatus} = 'complete'
      AND ${schema.rawAssets.deletedAt} IS NULL
  )
)`

/** Ob in einem Projekt bereits Material liegt — Dateien oder Cloud-Links. */
export async function projectHasMaterial(env: Env, projectId: string): Promise<boolean> {
  const [row] = await getDb(env)
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), hasMaterial(projectId)))
    .limit(1)
  return !!row
}

/**
 * Die Job-Mail, sobald ein Projekt Material hat. Wird nach jedem
 * abgeschlossenen Upload und nach jedem neuen Cloud-Link aufgerufen.
 *
 *   · Bearbeiter zugeordnet → jeder von ihnen erfährt GENAU EINMAL, dass er
 *                             loslegen kann (`project_workers.notified_at`)
 *   · noch niemand          → der Administrator erfährt einmal, dass ein
 *                             Projekt auf seine Zuordnung wartet
 *                             (`projects.job_notified_at`); sonst bliebe es
 *                             unbemerkt liegen, denn sehen kann es außer ihm
 *                             niemand
 */
export async function notifyMaterialAdded(env: Env, projectId: string): Promise<void> {
  const db = getDb(env)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)
  if (!project) return

  const workers = await workersOfProject(env, projectId)
  const pending = workers.filter((w) => !w.notifiedAt)
  if (workers.length && !pending.length) return
  if (!workers.length && project.jobNotifiedAt) return
  if (!(await projectHasMaterial(env, projectId))) return

  if (workers.length) {
    for (const w of pending) {
      await mailJobAssigned(env, {
        email: w.email,
        displayName: w.displayName,
        projectName: project.name,
        projectId,
        area: workerArea(w),
      })
      await db
        .update(schema.projectWorkers)
        .set({ notifiedAt: nowSec() })
        .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.projectWorkers.clipperId, w.id)))
    }
    return
  }

  const [owner] = await db
    .select({ company: schema.customers.company, fullName: schema.users.fullName, role: schema.users.role })
    .from(schema.customers)
    .innerJoin(schema.users, eq(schema.users.id, schema.customers.userId))
    .where(eq(schema.customers.id, project.customerId))
    .limit(1)
  await mailJobWaitingAdmin(env, {
    projectId,
    projectName: project.name,
    customer: owner
      ? `${owner.company || owner.fullName}${owner.role === 'creator' ? ' (Creator)' : owner.role === 'agency' ? ' (Agentur)' : ''}`
      : '–',
  })
  await db.update(schema.projects).set({ jobNotifiedAt: nowSec() }).where(eq(schema.projects.id, projectId))
}

/**
 * Die Bearbeiter einer Kampagne — Clipper und Creator, in der Reihenfolge,
 * in der der Administrator sie zugeordnet hat.
 */
export async function workersOfProject(env: Env, projectId: string) {
  return getDb(env)
    .select({
      id: schema.clippers.id,
      userId: schema.users.id,
      displayName: schema.clippers.displayName,
      email: schema.users.email,
      role: schema.users.role,
      assignedAt: schema.projectWorkers.assignedAt,
      notifiedAt: schema.projectWorkers.notifiedAt,
    })
    .from(schema.projectWorkers)
    .innerJoin(schema.clippers, eq(schema.clippers.id, schema.projectWorkers.clipperId))
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(eq(schema.projectWorkers.projectId, projectId))
    .orderBy(schema.projectWorkers.assignedAt)
}

/**
 * Einen Clipper oder Creator einer Kampagne zuordnen — zusätzlich zu allen,
 * die schon daran arbeiten. Die EINZIGE Stelle, an der ein Projekt einen
 * Bearbeiter bekommt; aufgerufen wird sie nur vom Administrator.
 *
 * Gemailt wird nur, wenn im Projekt schon Material liegt — sonst holt
 * `notifyMaterialAdded` die Mail beim ersten Upload oder Link nach.
 */
export async function assignWorker(
  env: Env,
  projectId: string,
  clipperId: string,
): Promise<{ ok: true; created: boolean; notified: boolean } | { ok: false; error: string }> {
  const db = getDb(env)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)
  if (!project) return { ok: false, error: 'Campaign not found.' }

  const [next] = await db
    .select({
      id: schema.clippers.id,
      displayName: schema.clippers.displayName,
      email: schema.users.email,
      role: schema.users.role,
    })
    .from(schema.clippers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
    .where(eq(schema.clippers.id, clipperId))
    .limit(1)
  if (!next) return { ok: false, error: 'Clipper not found.' }

  // Seine eigene Kampagne bearbeitet ein Creator nicht selbst (`workersFor`).
  if (!(await workersFor(env, projectId)).some((w) => w.id === clipperId)) {
    return { ok: false, error: 'A creator cannot work on their own campaign.' }
  }

  const inserted = await db
    .insert(schema.projectWorkers)
    .values({ projectId, clipperId, assignedAt: nowSec() })
    .onConflictDoNothing()
    .returning({ id: schema.projectWorkers.clipperId })
  if (!inserted.length) return { ok: true, created: false, notified: false }

  const ready = await projectHasMaterial(env, projectId)
  if (ready) {
    await mailJobAssigned(env, {
      email: next.email,
      displayName: next.displayName,
      projectName: project.name,
      projectId,
      area: workerArea(next),
    })
    await db
      .update(schema.projectWorkers)
      .set({ notifiedAt: nowSec() })
      .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.projectWorkers.clipperId, clipperId)))
  }
  return { ok: true, created: true, notified: ready }
}

/**
 * Einen Bearbeiter aus einer Kampagne nehmen. Er erfährt es per Mail —
 * sonst verschwände die Kampagne kommentarlos aus seinem Bereich. Was er
 * schon geliefert hat, bleibt beim Auftraggeber.
 */
export async function unassignWorker(env: Env, projectId: string, clipperId: string): Promise<boolean> {
  const db = getDb(env)
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)
  if (!project) return false
  const who = (await workersOfProject(env, projectId)).find((w) => w.id === clipperId)
  if (!who) return false

  await db
    .delete(schema.projectWorkers)
    .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.projectWorkers.clipperId, clipperId)))
  await mailJobWithdrawn(env, {
    email: who.email,
    displayName: who.displayName,
    projectName: project.name,
    area: workerArea(who),
  })
  return true
}

/** Alle Bearbeiter aus einer Kampagne nehmen — jeder erfährt es per Mail. */
export async function releaseProject(env: Env, projectId: string): Promise<boolean> {
  const [project] = await getDb(env)
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return false
  for (const w of await workersOfProject(env, projectId)) await unassignWorker(env, projectId, w.id)
  return true
}

/**
 * Die Bearbeiter-Zeile in `clippers` zu einem Nutzer — für Creator wird sie
 * angelegt, falls sie (aus Altbeständen) fehlt. Über sie bekommt ein Creator
 * Kampagnen zum Schneiden zugeordnet.
 */
async function workerRowFor(env: Env, user: { id: string; fullName: string; role: string }) {
  const db = getDb(env)
  const [row] = await db
    .select({ id: schema.clippers.id })
    .from(schema.clippers)
    .where(eq(schema.clippers.userId, user.id))
    .limit(1)
  if (row) return row.id
  if (user.role !== 'creator') return null
  const id = uid()
  await db.insert(schema.clippers).values({
    id,
    userId: user.id,
    displayName: user.fullName,
    status: 'aktiv',
    createdAt: nowSec(),
  })
  return id
}

/**
 * Jemanden ins Team einer Kampagne holen — die Aktion hinter „Hinzufügen“
 * im Admin-Bereich.
 *
 *   · Clipper → schneidet (`project_workers`)
 *   · Creator → schneidet UND verbreitet: er kommt zusätzlich in
 *               `campaign_creators`, sofern die Kampagne für Creator
 *               freigegeben ist (`creator_distribution`). Ohne diese
 *               Zustimmung des Kunden landet kein Clip auf fremden Kanälen.
 */
export async function addToTeam(
  env: Env,
  projectId: string,
  userId: string,
): Promise<{ ok: true; cuts: boolean; distributes: boolean } | { ok: false; error: string }> {
  const db = getDb(env)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user || (user.role !== 'clipper' && user.role !== 'creator')) {
    return { ok: false, error: 'Only clippers and creators can join a campaign team.' }
  }
  const clipperId = await workerRowFor(env, user)
  if (!clipperId) return { ok: false, error: 'Clipper not found.' }

  const assigned = await assignWorker(env, projectId, clipperId)
  if (!assigned.ok) return assigned

  let distributes = false
  if (user.role === 'creator') {
    const creator = await creatorForUser(env, user.id)
    if (creator) {
      const dist = await assignDistribution(env, projectId, creator.id)
      distributes = dist.ok || (await creatorJoined(env, projectId, creator.id))
    }
  }
  return { ok: true, cuts: true, distributes }
}

/**
 * Wird die Verbreitung einer Kampagne eingeschaltet (vom Kunden oder vom
 * Administrator), verbreiten ab sofort auch alle Creator, die schon im Team
 * sind — ein Creator „kann alles machen“. Wer schon verbreitet, bleibt
 * unberührt; jeder neu hinzugekommene bekommt seine Mail.
 */
export async function distributeWithTeamCreators(env: Env, projectId: string): Promise<number> {
  let added = 0
  for (const w of await workersOfProject(env, projectId)) {
    if (w.role !== 'creator') continue
    const creator = await creatorForUser(env, w.userId)
    if (!creator) continue
    const result = await assignDistribution(env, projectId, creator.id)
    if (result.ok && result.created) added++
  }
  return added
}

/** Jemanden aus dem Team einer Kampagne nehmen — Schnitt und Verbreitung. */
export async function removeFromTeam(env: Env, projectId: string, userId: string): Promise<boolean> {
  const db = getDb(env)
  const [row] = await db
    .select({ id: schema.clippers.id })
    .from(schema.clippers)
    .where(eq(schema.clippers.userId, userId))
    .limit(1)
  const cut = row ? await unassignWorker(env, projectId, row.id) : false
  const creator = await creatorForUser(env, userId)
  const dist = creator ? await leaveDistribution(env, projectId, creator.id) : false
  return cut || dist
}

/** Ein Mitglied im Team einer Kampagne — wie es der Admin-Bereich zeigt. */
export interface TeamMember {
  userId: string
  name: string
  role: 'clipper' | 'creator'
  /** Schneidet: sieht das Rohmaterial und liefert Clips. */
  cuts: boolean
  /** Verbreitet: stellt fertige Clips auf seine eigenen Kanäle. */
  distributes: boolean
}

/**
 * Das Team je Kampagne — Bearbeiter (`project_workers`) und verbreitende
 * Creator (`campaign_creators`) zusammengeführt, ein Eintrag je Person. In
 * Stücken, weil D1 höchstens 100 Parameter je Abfrage bindet.
 */
export async function teamsByProject(env: Env, projectIds: string[]): Promise<Map<string, TeamMember[]>> {
  const db = getDb(env)
  const out = new Map<string, Map<string, TeamMember>>()
  const member = (projectId: string, userId: string, name: string, role: string) => {
    const team = out.get(projectId) ?? new Map<string, TeamMember>()
    out.set(projectId, team)
    const m = team.get(userId) ?? {
      userId,
      name,
      role: role === 'creator' ? 'creator' : 'clipper',
      cuts: false,
      distributes: false,
    }
    team.set(userId, m)
    return m
  }
  for (let i = 0; i < projectIds.length; i += 90) {
    const ids = projectIds.slice(i, i + 90)
    const cutting = await db
      .select({
        projectId: schema.projectWorkers.projectId,
        userId: schema.users.id,
        name: schema.users.fullName,
        role: schema.users.role,
      })
      .from(schema.projectWorkers)
      .innerJoin(schema.clippers, eq(schema.clippers.id, schema.projectWorkers.clipperId))
      .innerJoin(schema.users, eq(schema.users.id, schema.clippers.userId))
      .where(inArray(schema.projectWorkers.projectId, ids))
      .orderBy(schema.projectWorkers.assignedAt)
    for (const r of cutting) member(r.projectId, r.userId, r.name, r.role).cuts = true

    const distributing = await db
      .select({
        projectId: schema.campaignCreators.projectId,
        userId: schema.users.id,
        name: schema.users.fullName,
      })
      .from(schema.campaignCreators)
      .innerJoin(schema.creators, eq(schema.creators.id, schema.campaignCreators.creatorId))
      .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
      .where(inArray(schema.campaignCreators.projectId, ids))
      .orderBy(schema.campaignCreators.joinedAt)
    for (const r of distributing) member(r.projectId, r.userId, r.name, 'creator').distributes = true
  }
  return new Map([...out].map(([id, team]) => [id, [...team.values()]]))
}

/**
 * Die Kampagnen eines Clippers oder Creators mit seiner Rolle darin — für
 * sein Profil im Admin-Bereich.
 */
export async function campaignsOfUser(env: Env, userId: string) {
  const db = getDb(env)
  const cutting = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      status: schema.projects.status,
      assignedAt: schema.projectWorkers.assignedAt,
    })
    .from(schema.projectWorkers)
    .innerJoin(schema.clippers, eq(schema.clippers.id, schema.projectWorkers.clipperId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectWorkers.projectId))
    .where(eq(schema.clippers.userId, userId))
  const creator = await creatorForUser(env, userId)
  const distributing = creator
    ? await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          status: schema.projects.status,
          assignedAt: schema.campaignCreators.joinedAt,
        })
        .from(schema.campaignCreators)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.campaignCreators.projectId))
        .where(eq(schema.campaignCreators.creatorId, creator.id))
    : []
  const byId = new Map<string, { id: string; name: string; status: string; assignedAt: number; cuts: boolean; distributes: boolean }>()
  for (const r of cutting) byId.set(r.id, { ...r, cuts: true, distributes: false })
  for (const r of distributing) {
    const m = byId.get(r.id) ?? { ...r, cuts: false, distributes: false }
    m.distributes = true
    byId.set(r.id, m)
  }
  return [...byId.values()].sort((a, b) => b.assignedAt - a.assignedAt)
}

/**
 * Name, Adresse und Telefonnummer eines Zugangs ändern.
 *
 * Die E-Mail-Adresse ist zugleich die Anmeldung — sie ist in `users` eindeutig
 * und muss es bleiben. Zeigt sie schon auf ein anderes Konto, bricht das hier
 * ab, statt einen Datenbankfehler durchzureichen, den niemand lesen kann.
 *
 * Laufende Sitzungen hängen an der Nutzer-ID, nicht an der Adresse: wer
 * gerade eingeloggt ist, bleibt es auch nach der Änderung. Der nächste
 * Login-Code geht dann an die neue Adresse.
 */
export async function updateUserIdentity(
  env: Env,
  userId: string,
  patch: { fullName?: string; email?: string; phone?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb(env)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user) return { ok: false, error: 'User not found.' }

  const set: Record<string, unknown> = {}

  if (patch.fullName !== undefined) {
    const name = patch.fullName.trim()
    if (!name) return { ok: false, error: 'The name cannot be empty.' }
    set.fullName = name.slice(0, 120)
  }

  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      return { ok: false, error: 'That is not a valid email address.' }
    }
    if (email !== user.email) {
      const [clash] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
      if (clash) return { ok: false, error: 'Another account already uses this email address.' }
      set.email = email
    }
  }

  if (patch.phone !== undefined) {
    const phone = (patch.phone ?? '').trim()
    set.phone = phone ? phone.slice(0, 60) : null
  }

  if (Object.keys(set).length) {
    await db.update(schema.users).set(set).where(eq(schema.users.id, userId))
  }
  return { ok: true }
}

/** Projekt eines bestimmten Kunden — oder null, wenn es ihm nicht gehört. */
export async function projectOfCustomer(env: Env, customerId: string, projectId: string) {
  const [row] = await getDb(env)
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.customerId, customerId)))
    .limit(1)
  return row ?? null
}

/**
 * Das Projekt, zu dem ein Ordner gehört.
 *
 * Ordner aus der Anfangszeit haben noch kein Projekt hinterlegt — für die
 * fällt die Antwort auf das erste Projekt des Kunden zurück, so wie es
 * damals gemeint war.
 */
export async function projectForFolder(
  env: Env,
  folder: { projectId: string | null; customerId: string },
) {
  if (folder.projectId) {
    const [row] = await getDb(env)
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, folder.projectId))
      .limit(1)
    if (row) return row
  }
  return primaryProject(env, folder.customerId)
}

/**
 * Prüft, ob ein Clipper (oder Creator über seine Clipper-ID) an einem
 * Projekt arbeiten darf: Wen der Administrator dem Projekt zugeordnet hat,
 * der sieht das Material — sonst kein Clipper und kein Creator.
 */
export async function clipperHasProject(
  env: Env,
  clipperId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await getDb(env)
    .select({ id: schema.projectWorkers.projectId })
    .from(schema.projectWorkers)
    .where(and(eq(schema.projectWorkers.projectId, projectId), eq(schema.projectWorkers.clipperId, clipperId)))
    .limit(1)
  return Boolean(row)
}

/** Die Projekte, die einem Clipper zugeordnet sind. */
export async function projectsOfClipper(env: Env, clipperId: string) {
  return getDb(env)
    .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
    .from(schema.projectWorkers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectWorkers.projectId))
    .where(eq(schema.projectWorkers.clipperId, clipperId))
    .orderBy(schema.projects.name)
}

/**
 * Wer über neues Rohmaterial informiert wird: alle Bearbeiter des Projekts,
 * getrennt nach Bereich (Clipper bekommen „Kampagne“ mit Knopf nach /work,
 * Creator mit Knopf in ihr Kampagnen-Dashboard). Ist noch niemand
 * zugeordnet, gibt es niemanden zu benachrichtigen — den Administrator hat
 * `notifyMaterialAdded` schon beim ersten Material informiert.
 */
export async function workerRecipients(
  env: Env,
  projectId: string,
): Promise<{ to: string[]; area: WorkerArea }[]> {
  const groups = new Map<WorkerArea, string[]>()
  for (const w of await workersOfProject(env, projectId)) {
    const area = workerArea(w)
    groups.set(area, [...(groups.get(area) ?? []), w.email])
  }
  return [...groups].map(([area, to]) => ({ area, to }))
}

/* -------------------------------------------------- Lead → Kunde und zurück */

/**
 * Erklärt einen Zugang zum Kunden — oder nimmt das zurück.
 *
 * Das ist die einzige Stelle im ganzen System, an der jemand Kunde wird.
 * Automatisch passiert es nirgends: Wer sich einträgt, ist ein Lead mit
 * eigenem Arbeitsbereich, mehr nicht. Ob daraus ein Kunde wird, entscheidet
 * allein der Administrator — nicht jede Anfrage wird ein Auftrag.
 */
export async function setCustomerConverted(env: Env, customerId: string, converted: boolean) {
  await getDb(env)
    .update(schema.customers)
    .set({ convertedAt: converted ? nowSec() : null })
    .where(eq(schema.customers.id, customerId))
}

/* ---------------------------------------------------------------- Löschen */

/**
 * Alle R2-Schlüssel eines Arbeitsbereichs — Rohmaterial, fertige Videos und
 * die Vorschaubilder dazu. Die gehören zur Datei; bleiben sie liegen, zahlt
 * der Bucket für JPEGs, auf die nichts mehr zeigt.
 */
async function keysOfCustomer(env: Env, customerId: string): Promise<string[]> {
  const db = getDb(env)
  const raw = await db
    .select({ key: schema.rawAssets.r2Key, thumb: schema.rawAssets.thumbKey })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(eq(schema.folders.customerId, customerId))
  const done = await db
    .select({ key: schema.deliverables.r2Key, thumb: schema.deliverables.thumbnailKey })
    .from(schema.deliverables)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deliverables.projectId))
    .where(eq(schema.projects.customerId, customerId))
  const covers = await db
    .select({ key: schema.projects.thumbKey })
    .from(schema.projects)
    .where(and(eq(schema.projects.customerId, customerId), isNotNull(schema.projects.thumbKey)))
  return [
    ...[...raw, ...done].flatMap((r) => (r.thumb ? [r.key, r.thumb] : [r.key])),
    ...covers.flatMap((p) => (p.key ? [p.key] : [])),
  ]
}

/** Best effort: fehlende oder bereits gelöschte Objekte sind kein Fehler. */
async function dropObjects(env: Env, keys: string[]) {
  if (!r2Ready(env)) return
  for (const key of keys) {
    try {
      await deleteObject(env, key)
    } catch (err) {
      console.error('[delete] R2-Objekt blieb liegen', key, err)
    }
  }
}

export interface DeletionSummary {
  leads: number
  projects: number
  files: number
}

/**
 * Löscht ein einzelnes Projekt mit allem, was daran hängt: Ordner,
 * Rohmaterial, fertige Videos, Veröffentlichungskanal.
 *
 * Anders als beim Kunden, der sein eigenes Projekt nur löschen darf, solange
 * es leer ist, räumt der Administrator hier ausdrücklich auch volle Projekte
 * ab — sonst gäbe es keinen Weg, ein Testprojekt wieder loszuwerden.
 *
 * Die Dateien verschwinden zuerst aus R2, danach die Zeilen: bricht der
 * Vorgang dazwischen ab, bleibt höchstens ein verwaister Datenbankeintrag
 * übrig statt einer Datei, für die niemand mehr zahlt und die niemand mehr
 * findet. Die Speicherbilanz des Kunden wird um dieselbe Menge zurückgesetzt.
 */
export async function deleteProject(
  env: Env,
  projectId: string,
): Promise<{ ok: boolean; files: number; bytes: number }> {
  const db = getDb(env)
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!project) return { ok: false, files: 0, bytes: 0 }

  const raw = await db
    .select({
      key: schema.rawAssets.r2Key,
      thumb: schema.rawAssets.thumbKey,
      bytes: schema.rawAssets.bytes,
    })
    .from(schema.rawAssets)
    .innerJoin(schema.folders, eq(schema.folders.id, schema.rawAssets.folderId))
    .where(eq(schema.folders.projectId, projectId))
  const done = await db
    .select({
      key: schema.deliverables.r2Key,
      thumb: schema.deliverables.thumbnailKey,
      bytes: schema.deliverables.bytes,
    })
    .from(schema.deliverables)
    .where(eq(schema.deliverables.projectId, projectId))

  const files = [...raw, ...done]
  const bytes = files.reduce((sum, f) => sum + (f.bytes || 0), 0)

  // Die Vorschaubilder gehen mit; gezählt werden sie nicht, sie wiegen nichts.
  await dropObjects(env, [
    ...files.flatMap((f) => (f.thumb ? [f.key, f.thumb] : [f.key])),
    ...(project.thumbKey ? [project.thumbKey] : []),
  ])

  /*
   * Erst beim Anbieter freigeben, dann hier löschen — nie umgekehrt.
   *
   * Unsere Zeilen hängen per `ON DELETE cascade` am Projekt. Sind sie weg,
   * sind auch die Account- und Profil-IDs weg, und die Accounts blieben
   * drüben für immer verbunden. Abgerechnet wird je verbundenem Account und
   * Tag: aus einem gelöschten Projekt würde eine Rechnung, die niemand mehr
   * zuordnen kann.
   */
  await releaseAtProvider(env, projectId)

  // Ordner, Rohmaterial, fertige Videos, Steckplätze und Accounts hängen per
  // `ON DELETE cascade` am Projekt und gehen mit dieser einen Zeile.
  await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
  if (bytes) await addStorage(env, project.customerId, -bytes)

  return { ok: true, files: files.length, bytes }
}

/**
 * Löscht einen Zugang restlos: Nutzer, Arbeitsbereich, Projekte, Ordner,
 * Dateien, fertige Videos, Sitzungen — und die Lead-Einträge, die daran
 * hängen.
 *
 * Der Löschweg läuft über den Nutzer: an ihm hängen alle Tabellen per
 * `ON DELETE cascade`. Nur `leads.customer_id` kaskadiert nicht (sonst nähme
 * ein gelöschter Kunde stillschweigend Leads mit) — die werden deshalb
 * vorher ausdrücklich entfernt.
 */
export async function deleteCustomerAccount(env: Env, customerId: string): Promise<DeletionSummary> {
  const db = getDb(env)
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1)
  if (!customer) return { leads: 0, projects: 0, files: 0 }

  const keys = await keysOfCustomer(env, customerId)
  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.customerId, customerId))
  const leads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(eq(schema.leads.customerId, customerId))

  await dropObjects(env, keys)

  // Auch hier gilt: erst drüben freigeben. Der Löschweg läuft über den
  // Nutzer, und die Kaskade nähme sonst jede Spur zu den verbundenen
  // Accounts mit — die dann unbemerkt weiterlaufen und weiter kosten.
  for (const project of projects) await releaseAtProvider(env, project.id)
  await releaseCreatorOfUser(env, customer.userId)

  await db.delete(schema.leads).where(eq(schema.leads.customerId, customerId))
  await db.delete(schema.users).where(eq(schema.users.id, customer.userId))

  return { leads: leads.length, projects: projects.length, files: keys.length }
}

/**
 * Löscht einen Clipper samt Zugang. Bereits gelieferte Videos bleiben beim
 * Kunden — sie gehören zur Kampagne, nicht zum Clipper; geleert wird nur die
 * Urheber-Spalte.
 *
 * Aus den Teams seiner Kampagnen fällt er heraus (`ON DELETE CASCADE` an
 * `project_workers`); die Kampagnen bleiben und behalten den Rest ihres
 * Teams.
 */
export async function deleteClipperAccount(env: Env, clipperId: string): Promise<boolean> {
  const db = getDb(env)
  const [clipper] = await db
    .select()
    .from(schema.clippers)
    .where(eq(schema.clippers.id, clipperId))
    .limit(1)
  if (!clipper) return false

  // Gehört die Zeile einem Creator, muss auch alles Eigene mit — dafür gibt
  // es den vollständigen Weg.
  const creator = await creatorForUser(env, clipper.userId)
  if (creator) return Boolean(await deleteCreatorAccount(env, creator.id))

  await db
    .update(schema.deliverables)
    .set({ clipperId: null })
    .where(eq(schema.deliverables.clipperId, clipperId))
  await releaseCreatorOfUser(env, clipper.userId)
  await db.delete(schema.users).where(eq(schema.users.id, clipper.userId))
  return true
}

/**
 * Löscht einen Creator samt Zugang — die Aktion „Delete“ im Admin-Bereich.
 *
 * Ein Creator hat drei Zeilen (`creators`, `customers`, `clippers`), und
 * alles daran geht mit:
 *   · seine EIGENEN Kampagnen mit Ordnern, Rohmaterial, fertigen Videos und
 *     Thumbnails (R2 zuerst, dann die Zeilen) — wie beim Kunden
 *   · seine verbundenen Social-Accounts, vorher beim Anbieter getrennt
 *     (Zernio rechnet je verbundenem Account ab)
 *   · seine Plätze in fremden Kampagnen-Teams (Schnitt und Verbreitung)
 *
 * Was er für FREMDE Kampagnen geschnitten hat, bleibt beim jeweiligen
 * Kunden — geleert wird nur die Urheber-Spalte, wie beim Clipper.
 */
export async function deleteCreatorAccount(env: Env, creatorId: string): Promise<DeletionSummary | null> {
  const db = getDb(env)
  const [creator] = await db.select().from(schema.creators).where(eq(schema.creators.id, creatorId)).limit(1)
  if (!creator) return null

  const [clipper] = await db
    .select({ id: schema.clippers.id })
    .from(schema.clippers)
    .where(eq(schema.clippers.userId, creator.userId))
    .limit(1)
  if (clipper) {
    await db.update(schema.deliverables).set({ clipperId: null }).where(eq(schema.deliverables.clipperId, clipper.id))
  }

  // Der Kundenweg räumt Dateien und Kampagnen ab, trennt beim Anbieter und
  // löscht am Ende den Nutzer — samt allen Zeilen, die daran hängen.
  const customer = await customerForUser(env, creator.userId)
  if (customer) return deleteCustomerAccount(env, customer.id)

  await releaseCreatorOfUser(env, creator.userId)
  await db.delete(schema.users).where(eq(schema.users.id, creator.userId))
  return { leads: 0, projects: 0, files: 0 }
}

/**
 * Gibt frei, was ein Creator beim Anbieter belegt — falls dieser Nutzer
 * einer ist.
 *
 * Ein Creator hat drei Zeilen (`creators`, `customers`, `clippers`) und
 * lässt sich deshalb über den Kunden- wie über den Clipper-Löschweg
 * entfernen. Beide löschen den Nutzer, und die Kaskade nähme seine
 * Steckplätze und Accounts mit — drüben liefen sie unbemerkt weiter und
 * würden je Account und Monat abgerechnet.
 */
async function releaseCreatorOfUser(env: Env, userId: string): Promise<void> {
  const [creator] = await getDb(env)
    .select({ id: schema.creators.id })
    .from(schema.creators)
    .where(eq(schema.creators.userId, userId))
    .limit(1)
  if (creator) await releaseCreatorAtProvider(env, creator.id)
}

/** Aktive (nicht gelöschte) Ordner eines Kunden. */
export async function foldersOf(env: Env, customerId: string, parentId: string | null) {
  const db = getDb(env)
  return db
    .select()
    .from(schema.folders)
    .where(
      and(
        eq(schema.folders.customerId, customerId),
        isNull(schema.folders.deletedAt),
        parentId === null ? isNull(schema.folders.parentId) : eq(schema.folders.parentId, parentId),
      ),
    )
    .orderBy(schema.folders.name)
}

/* ------------------------------------------------------------ Cloud-Links */

/** Längste Adresse, die angenommen wird — Freigabelinks sind selten länger. */
const CLOUD_LINK_MAX = 2000

/**
 * Prüft und vereinheitlicht einen Cloud-Link. Angenommen wird jede
 * https-Adresse mit einem richtigen Hostnamen — Google Drive, Dropbox,
 * iCloud, OneDrive, WeTransfer, Frame.io oder etwas ganz anderes. `null`
 * heißt: kein gültiger Link.
 *
 * Nur https, weil der Link später in fremden Browsern geöffnet wird: eine
 * `javascript:`- oder `data:`-Adresse darf hier nie durchrutschen.
 */
export function normalizeCloudLink(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (!value || value.length > CLOUD_LINK_MAX) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Der Hostname ohne „www.“ — so steht der Link in der Oberfläche. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Alle Cloud-Links eines Projekts, ältester zuerst. */
export async function linksOf(env: Env, projectId: string) {
  return getDb(env)
    .select()
    .from(schema.projectLinks)
    .where(eq(schema.projectLinks.projectId, projectId))
    .orderBy(schema.projectLinks.createdAt)
}

/**
 * Hängt einen Cloud-Link an ein Projekt. Derselbe Link ein zweites Mal am
 * selben Projekt wird nicht doppelt gespeichert — ein Doppeltipp auf
 * „Hinzufügen“ soll keine zweite Zeile erzeugen.
 */
export async function addProjectLink(
  env: Env,
  o: { projectId: string; url: string; addedBy: string | null },
): Promise<{ id: string; url: string; created: boolean }> {
  const db = getDb(env)
  const [existing] = await db
    .select({ id: schema.projectLinks.id })
    .from(schema.projectLinks)
    .where(and(eq(schema.projectLinks.projectId, o.projectId), eq(schema.projectLinks.url, o.url)))
    .limit(1)
  if (existing) return { id: existing.id, url: o.url, created: false }

  const id = uid()
  await db.insert(schema.projectLinks).values({
    id,
    projectId: o.projectId,
    url: o.url,
    addedBy: o.addedBy,
    createdAt: nowSec(),
  })
  return { id, url: o.url, created: true }
}

/* ------------------------------------------------ Verbreitung über Creator

   Ein Kunde kann eine Kampagne für Creator freigeben
   (`projects.creator_distribution`). Creator treten ihr dann bei und stellen
   fertige Clips nach eigener Freigabe auf ihre Kanäle — den Versand selbst
   übernimmt `publishForCreator` in publisher.ts. Hier steht nur, wer wo
   beigetreten ist und wer überhaupt beitreten darf. */

/**
 * Der Creator, dem eine Kampagne gehört — oder `null` bei einem Kunden.
 *
 * Die Abfrage liegt in publisher.ts, weil der Versand sie braucht (eigene
 * Kampagnen gehen automatisch auf die Accounts ihres Creators) und
 * publisher.ts diese Datei nicht importieren kann, ohne einen Kreis zu
 * schließen — diese Datei importiert schon publisher.ts.
 */
export { ownerCreatorOfProject } from './publisher'

/** Die Creator, die eine Kampagne verbreiten — wer zuerst zugeordnet wurde, zuerst. */
export async function campaignCreatorsOf(env: Env, projectId: string) {
  return getDb(env)
    .select({
      creatorId: schema.creators.id,
      userId: schema.users.id,
      fullName: schema.users.fullName,
      email: schema.users.email,
      /** JSON-Objekt { plattform: handle } — wie `creators.handles`. */
      handles: schema.creators.handles,
      joinedAt: schema.campaignCreators.joinedAt,
    })
    .from(schema.campaignCreators)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.campaignCreators.creatorId))
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.campaignCreators.projectId, projectId))
    .orderBy(schema.campaignCreators.joinedAt)
}

/** Wie viele Creator je Kampagne zugeordnet sind — für Listen mit vielen Projekten. */
export async function campaignCreatorCounts(
  env: Env,
  projectIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  // In Stücken: D1 bindet höchstens 100 Parameter je Abfrage, und die
  // Adminseite fragt für ALLE Projekte auf einmal.
  for (let i = 0; i < projectIds.length; i += 90) {
    const rows = await getDb(env)
      .select({
        projectId: schema.campaignCreators.projectId,
        count: sql<number>`count(*)`,
      })
      .from(schema.campaignCreators)
      .where(inArray(schema.campaignCreators.projectId, projectIds.slice(i, i + 90)))
      .groupBy(schema.campaignCreators.projectId)
    for (const row of rows) out.set(row.projectId, Number(row.count))
  }
  return out
}

/**
 * Die zugeordneten Creator je Kampagne — Name und ID, für die Auswahl im
 * Admin-Bereich. In Stücken wie `campaignCreatorCounts`.
 */
export async function campaignCreatorsByProject(
  env: Env,
  projectIds: string[],
): Promise<Map<string, { creatorId: string; fullName: string }[]>> {
  const out = new Map<string, { creatorId: string; fullName: string }[]>()
  for (let i = 0; i < projectIds.length; i += 90) {
    const rows = await getDb(env)
      .select({
        projectId: schema.campaignCreators.projectId,
        creatorId: schema.campaignCreators.creatorId,
        fullName: schema.users.fullName,
      })
      .from(schema.campaignCreators)
      .innerJoin(schema.creators, eq(schema.creators.id, schema.campaignCreators.creatorId))
      .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
      .where(inArray(schema.campaignCreators.projectId, projectIds.slice(i, i + 90)))
      .orderBy(schema.campaignCreators.joinedAt)
    for (const row of rows) {
      const list = out.get(row.projectId) ?? []
      list.push({ creatorId: row.creatorId, fullName: row.fullName })
      out.set(row.projectId, list)
    }
  }
  return out
}

/** Alle Creator — die Auswahl, mit der der Administrator sie Kampagnen zuordnet. */
export async function allCreators(env: Env) {
  return getDb(env)
    .select({ id: schema.creators.id, userId: schema.creators.userId, fullName: schema.users.fullName })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .orderBy(schema.users.fullName)
}

/** Ist dieser Creator der Kampagne zugeordnet? */
export async function creatorJoined(env: Env, projectId: string, creatorId: string): Promise<boolean> {
  const [row] = await getDb(env)
    .select({ id: schema.campaignCreators.creatorId })
    .from(schema.campaignCreators)
    .where(
      and(
        eq(schema.campaignCreators.projectId, projectId),
        eq(schema.campaignCreators.creatorId, creatorId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Die Kampagnen, die ein Creator verbreitet: fremde, für Creator
 * freigegebene, aktive Projekte, denen der Administrator ihn zugeordnet hat
 * — samt der Zahl fertiger Clips darin.
 *
 * Was es sonst noch an freigegebenen Kampagnen gibt, sieht er NICHT, weder
 * welche noch wie viele. Zugeordnet wird ausschließlich im Admin-Bereich
 * (`assignDistribution`).
 *
 * Wie im Arbeitsbereich der Clipper erscheint eine Kampagne nur mit ihrem
 * Namen — kein Firmen- oder Kundenname.
 */
export async function distributionCampaigns(env: Env, creatorId: string) {
  const db = getDb(env)
  const [creator] = await db
    .select({ userId: schema.creators.userId })
    .from(schema.creators)
    .where(eq(schema.creators.id, creatorId))
    .limit(1)
  if (!creator) return []

  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      createdAt: schema.projects.createdAt,
      joinedAt: schema.campaignCreators.joinedAt,
      clips: sql<number>`(select count(*) from ${schema.deliverables} where ${schema.deliverables.projectId} = ${schema.projects.id} and ${schema.deliverables.uploadStatus} = 'complete')`,
    })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .innerJoin(
      schema.campaignCreators,
      and(
        eq(schema.campaignCreators.projectId, schema.projects.id),
        eq(schema.campaignCreators.creatorId, creatorId),
      ),
    )
    .where(
      and(
        eq(schema.projects.creatorDistribution, 1),
        eq(schema.projects.status, 'aktiv'),
        // Eigene Kampagnen laufen über seine Zeile in `customers` — derselbe Nutzer.
        ne(schema.customers.userId, creator.userId),
      ),
    )
    .orderBy(desc(schema.campaignCreators.joinedAt))

  return rows.map((r) => ({ ...r, clips: Number(r.clips ?? 0), joined: true }))
}

/**
 * Einen Creator einer Kampagne zum Verbreiten zuordnen — nur durch den
 * Administrator.
 *
 * Nur fremde, freigegebene, aktive Kampagnen: der Kunde muss der
 * Verbreitung zugestimmt haben (`creator_distribution`), und eine eigene
 * Kampagne geht ohnehin automatisch auf die Accounts des Creators. Eine
 * zweite Zuordnung ändert nichts; `created` sagt, ob sie neu war — nur dann
 * geht eine Mail raus.
 */
export async function assignDistribution(
  env: Env,
  projectId: string,
  creatorId: string,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const db = getDb(env)
  const [row] = await db
    .select({
      name: schema.projects.name,
      distribution: schema.projects.creatorDistribution,
      status: schema.projects.status,
      ownerUserId: schema.customers.userId,
    })
    .from(schema.projects)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.projects.customerId))
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  if (!row) return { ok: false, error: 'Campaign not found.' }

  const [creator] = await db
    .select({ userId: schema.creators.userId, email: schema.users.email, fullName: schema.users.fullName })
    .from(schema.creators)
    .innerJoin(schema.users, eq(schema.users.id, schema.creators.userId))
    .where(eq(schema.creators.id, creatorId))
    .limit(1)
  if (!creator) return { ok: false, error: 'Creator not found.' }

  if (row.distribution !== 1) {
    return { ok: false, error: 'Creator distribution is off for this campaign, switch it on first.' }
  }
  if (row.status !== 'aktiv') return { ok: false, error: 'Only active campaigns can be distributed.' }
  if (row.ownerUserId === creator.userId) {
    return { ok: false, error: "This is the creator's own campaign: its clips already go to their accounts." }
  }

  const inserted = await db
    .insert(schema.campaignCreators)
    .values({ projectId, creatorId, joinedAt: nowSec() })
    .onConflictDoNothing()
    .returning({ id: schema.campaignCreators.creatorId })
  const created = inserted.length > 0

  if (created) {
    await mailDistributionAssigned(env, {
      to: creator.email,
      fullName: creator.fullName,
      projectId,
      projectName: row.name,
    })
  }
  return { ok: true, created }
}

/**
 * Einen Creator aus einer Kampagne nehmen — nur durch den Administrator.
 * Bereits gepostete Clips bleiben, wo sie sind; neue gehen ab jetzt nicht
 * mehr raus (das prüft `creatorMayDistribute` vor jedem Senden, auch vor
 * jedem Nachschuss).
 */
export async function leaveDistribution(env: Env, projectId: string, creatorId: string): Promise<boolean> {
  const db = getDb(env)
  const joined = await creatorJoined(env, projectId, creatorId)
  if (!joined) return false
  await db
    .delete(schema.campaignCreators)
    .where(
      and(
        eq(schema.campaignCreators.projectId, projectId),
        eq(schema.campaignCreators.creatorId, creatorId),
      ),
    )
  return true
}

/* --------------------------------------------------------- Preisstaffelung

   Je Clipper und je Creator legt der Administrator fest, was ab welcher
   Reichweite verdient wird: „Ab 100.000 Views → 200 €“. Der Clipper bzw.
   Creator sieht die Staffel ganz oben in seiner Übersicht; solange keine
   festgelegt ist, steht dort „In Kürze wird Nikki Media eine
   Preisstaffelung bekannt geben.“ */

export interface PayTier {
  minViews: number
  amountCents: number
}

/** Höchstens so viele Stufen je Person — mehr passt in keine Zeile. */
export const PAY_TIERS_MAX = 12

/** Die Staffel einer Person, aufsteigend nach Views. Leer: noch keine festgelegt. */
export async function payTiersOf(env: Env, userId: string): Promise<PayTier[]> {
  return getDb(env)
    .select({ minViews: schema.payTiers.minViews, amountCents: schema.payTiers.amountCents })
    .from(schema.payTiers)
    .where(eq(schema.payTiers.userId, userId))
    .orderBy(schema.payTiers.minViews)
}

/** Ob für diese Personen schon eine Staffel steht — für Listen im Admin-Bereich. */
export async function payTierCounts(env: Env, userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (let i = 0; i < userIds.length; i += 90) {
    const rows = await getDb(env)
      .select({ userId: schema.payTiers.userId, n: sql<number>`count(*)` })
      .from(schema.payTiers)
      .where(inArray(schema.payTiers.userId, userIds.slice(i, i + 90)))
      .groupBy(schema.payTiers.userId)
    for (const r of rows) out.set(r.userId, Number(r.n))
  }
  return out
}

/**
 * Prüft die Zeilen aus dem Admin-Formular. Jede Zeile braucht BEIDE Werte:
 * Views als ganze Zahl ab 1, Geld als Betrag in Euro („200“, „200,50“,
 * „1.500“). Dieselbe Views-Schwelle zweimal ist ein Tippfehler.
 */
export function parsePayTiers(input: unknown): { ok: true; tiers: PayTier[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Expected a list of tiers.' }
  if (input.length > PAY_TIERS_MAX) return { ok: false, error: `At most ${PAY_TIERS_MAX} tiers.` }

  const digits = (v: unknown) => String(v ?? '').replace(/[\s.']/g, '')
  const tiers: PayTier[] = []
  for (const [i, row] of input.entries()) {
    const viewsRaw = digits((row as any)?.minViews)
    const amountRaw = String((row as any)?.amount ?? '').trim().replace(/\s|€/g, '')
    if (!viewsRaw || !amountRaw) return { ok: false, error: `Row ${i + 1}: both fields are required.` }
    if (!/^\d{1,12}$/.test(viewsRaw) || Number(viewsRaw) < 1) {
      return { ok: false, error: `Row ${i + 1}: views must be a whole number of at least 1.` }
    }
    // „1.500,50“ → 1500.50 · „1500.5“ → 1500.5 · „200“ → 200
    const normalized = /,\d{1,2}$/.test(amountRaw)
      ? amountRaw.replace(/\./g, '').replace(',', '.')
      : /\.\d{1,2}$/.test(amountRaw)
        ? amountRaw.replace(/,/g, '')
        : amountRaw.replace(/[.,]/g, '')
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) {
      return { ok: false, error: `Row ${i + 1}: enter the amount in euros, e.g. 200 or 200,50.` }
    }
    const amountCents = Math.round(Number(normalized) * 100)
    if (amountCents < 1) return { ok: false, error: `Row ${i + 1}: the amount must be above 0 €.` }
    tiers.push({ minViews: Number(viewsRaw), amountCents })
  }
  tiers.sort((a, b) => a.minViews - b.minViews)
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minViews === tiers[i - 1].minViews) {
      return { ok: false, error: 'Two rows have the same number of views.' }
    }
  }
  return { ok: true, tiers }
}

/** Ersetzt die komplette Staffel einer Person. Eine leere Liste löscht sie. */
export async function setPayTiers(env: Env, userId: string, tiers: PayTier[]): Promise<void> {
  const db = getDb(env)
  const ts = nowSec()
  // In einem Rutsch: nie ein Moment, in dem die halbe Staffel fehlt.
  const items: BatchItem<'sqlite'>[] = [db.delete(schema.payTiers).where(eq(schema.payTiers.userId, userId))]
  for (const t of tiers) {
    items.push(
      db.insert(schema.payTiers).values({ id: uid(), userId, minViews: t.minViews, amountCents: t.amountCents, createdAt: ts }),
    )
  }
  await db.batch(items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
}
