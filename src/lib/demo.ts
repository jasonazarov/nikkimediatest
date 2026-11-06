import { CLIPPER_AVAILABILITY, CLIPPER_EXPERIENCE, CREATOR_AD_OPENNESS, CREATOR_FOLLOWERS, CREATOR_VIEWS_30D, INDUSTRIES } from './domain'
import type { AgencyCampaign, AgencyClip, AgencyClipper, AgencyCreator } from '../views/collaboration'

/* ==========================================================================
   Demo-Konten (Vorgabe des Auftraggebers)

   theguardians          Agentur. Das Collaboration-Dashboard zeigt das
                         NETZWERK mit erfundenen Zahlen:
                         347.837 Clips · 1 Mrd. Views · 5.000 Clipper ·
                         200 Creator · 500 Kampagnen
   theguardianscreator   Creator, ganz regulär
   theguardiansclipper   Clipper, ganz regulär

   Das Netzwerk (fremde Kampagnen, Creator, Clipper, Clips) entsteht hier aus
   Namenslisten und einer Hash-Funktion: bei jedem Aufruf identisch, ohne
   Accounts, ohne Zeilen in der Datenbank, ohne Bilder (Vorschauen sind die
   Case-Study-Bilder unter /img/cases). Kein einziger Fake-Clipper taucht im
   Admin, bei der Team-Zuordnung oder bei echten Agenturen auf.

   ECHT sind dagegen die eigenen Kampagnen der Demo-Agentur und die beiden
   Demo-Konten für Creator und Clipper. Sie stehen in den Listen der
   Demo-Agentur ganz oben, und nur sie lassen sich dort buchen bzw.
   zuweisen: Die Buchung des Demo-Creators ist sofort bestätigt, der
   Demo-Clipper wird direkt ins Team geholt. Beide sehen die Kampagne danach
   in ihrem Dashboard und arbeiten daran wie jeder andere.

   Alle Demo-Konten tragen `users.demo = 1` (Migration 0022): Anmeldung mit
   E-Mail und Passwort unter /login/demo, keine Mails an ihre Adressen
   (@demo.nikkimedia.co), für echte Agenturen unsichtbar. Die Agentur trägt
   zusätzlich `agency_leads.demo = 1` (0021). Angelegt bzw. die Passwörter
   neu gesetzt werden alle drei mit `node scripts/demo-account.mjs`.
   ========================================================================== */

export const DEMO_TOTALS = {
  clips: 347_837,
  views: 1_000_000_000,
  clippers: 5_000,
  creators: 200,
  campaigns: 500,
} as const

/** Antwort auf Buchen oder Zuweisen bei einem erfundenen Eintrag des Demo-Netzwerks. */
export const DEMO_EXAMPLE =
  'Das ist ein Beispiel aus dem Demo-Netzwerk. Buchen und zuweisen lassen sich hier der Demo-Creator und der Demo-Clipper.'

/** Kampagnen-IDs des Demo-Kontos — nie eine echte Projekt-ID. */
export const isDemoCampaignId = (id: string) => /^demo-\d+$/.test(id)

/* -------------------------------------------------------------- Zufall */

/** Fester Hash statt Zufall: dieselbe Zahl liefert immer dasselbe Ergebnis. */
function hash(n: number, salt: number): number {
  let x = Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return (x ^ (x >>> 16)) >>> 0
}

const pick = <T,>(list: readonly T[], n: number, salt: number): T => list[hash(n, salt) % list.length]

/**
 * Verteilt eine Gesamtzahl exakt auf Gewichte — die Summe der Teile ist
 * genau `total`. So ergeben die 500 Kampagnen zusammen wirklich 347.837
 * Clips und 1 Mrd. Views.
 */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  const parts = weights.map((w) => Math.floor((total * w) / sum))
  let rest = total - parts.reduce((s, p) => s + p, 0)
  for (let i = 0; rest > 0; i = (i + 1) % parts.length, rest--) parts[i]++
  return parts
}

/* ---------------------------------------------------------- Namenslisten */

const FIRST = [
  'Lukas', 'Leon', 'Finn', 'Jonas', 'Noah', 'Elias', 'Paul', 'Ben', 'Luis', 'Felix',
  'Max', 'Henry', 'Emil', 'Anton', 'Theo', 'Jakob', 'David', 'Julian', 'Moritz', 'Tim',
  'Niklas', 'Jan', 'Tom', 'Erik', 'Samuel', 'Leo', 'Milan', 'Aaron', 'Can', 'Deniz',
  'Luca', 'Mats', 'Ole', 'Fabian', 'Simon', 'Kevin', 'Marco', 'Arda', 'Yusuf', 'Adrian',
  'Emma', 'Mia', 'Hannah', 'Lina', 'Lea', 'Clara', 'Marie', 'Sophie', 'Lena', 'Anna',
  'Laura', 'Emilia', 'Ella', 'Leonie', 'Amelie', 'Sarah', 'Julia', 'Nina', 'Lisa', 'Paula',
  'Johanna', 'Mila', 'Ida', 'Greta', 'Elif', 'Selin', 'Aylin', 'Jana', 'Vanessa', 'Melina',
  'Zoe', 'Luisa', 'Nele', 'Carla', 'Alina', 'Valentina', 'Elena', 'Tara', 'Noemi', 'Yara',
] as const

const LAST = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
  'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Braun', 'Zimmermann', 'Krüger',
  'Hofmann', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Huber', 'Kaiser',
  'Fuchs', 'Peters', 'Lang', 'Scholz', 'Möller', 'Weiß', 'Jung', 'Hahn', 'Vogel', 'Friedrich',
  'Keller', 'Günther', 'Frank', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann', 'Franke',
  'Albrecht', 'Graf', 'Brandt', 'Schuster', 'Kraus', 'Böhm', 'Simon', 'Vogt', 'Haas', 'Sommer',
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Novak', 'Horvat', 'Gruber', 'Steiner', 'Moser', 'Brunner',
] as const

const NAME_SPACE = FIRST.length * LAST.length // 5.600 ≥ 5.000

/**
 * Name Nummer `i` — über eine Permutation (2971 ist teilerfremd zu 5.600),
 * damit nicht hundert „… Müller“ hintereinander stehen. Bis 5.600 ist jeder
 * Name einmalig.
 */
function personName(i: number, offset = 0): { first: string; last: string } {
  const j = ((i + offset) * 2971) % NAME_SPACE
  return { first: FIRST[j % FIRST.length], last: LAST[Math.floor(j / FIRST.length)] }
}

const ascii = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/[^a-z0-9]/g, '')

/** Branchen ohne „Sonstiges“ — für Kampagnen und Creator-Nischen. */
const NICHES = INDUSTRIES.filter((n) => n !== 'Sonstiges')

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook'] as const

/** Eine nicht leere Auswahl aus PLATFORMS. */
function platformsOf(i: number, salt: number): string[] {
  const mask = 1 + (hash(i, salt) % 15)
  return PLATFORMS.filter((_, k) => mask & (1 << k))
}

/** Die vorhandenen Case-Study-Bilder (public/img/cases) — keine neuen Bilder. */
const CASE_IMAGES = [
  'caspianbluecaviar-DKZ-ra1qDiR', 'caspianbluecaviar-DMzr3__qHsw', 'caspianbluecaviar-DP_uoY6jFCU',
  'caspianbluecaviar-DQ4ga9SDEnj', 'dindrop7-DM-7GyZIkb0', 'dindrop7-DPRDIqUiIeB', 'dindrop7-DZlBQOrgilt',
  'dindrop7-DbLpapmA_Bw', 'dindrop7-DbbJyZgIUjl', 'levantine_istanbul-C9406cJIC_D',
  'levantine_istanbul-DBQxgMHAw1U', 'levantine_istanbul-DEUXjpeIHPR', 'levantine_istanbul-DUTFpaeiMZA',
  'levantine_istanbul-Da2pgoToIw_', 'max_tornow_business-C1xEPryiQ4t', 'max_tornow_business-C8pRTW6MinC',
  'max_tornow_business-C_PxECKAj61', 'max_tornow_business-DCHhYijJK4b', 'panperium-DZF78B8je1g',
  'panperium-DZfCoAoNLUi', 'panperium-DZurxhPjezN', 'panperium-DZvEvMPNa15', 'panperium-DbGw3_SCDud',
] as const

const caseImage = (n: number, salt: number) => `/img/cases/${pick(CASE_IMAGES, n, salt)}.jpg`

const CAPTIONS = [
  'Das hat niemand erwartet',
  'Drei Fehler, die fast jeder macht',
  'So läuft es hinter den Kulissen',
  'Der beste Moment des Tages',
  'Warum das gerade überall auftaucht',
  'Vorher vs. nachher',
  'Das sagt keiner laut',
  '60 Sekunden, die sich lohnen',
  'Die Reaktion am Ende',
  'Darauf hat die Community gewartet',
  'Ein Detail, das alles ändert',
  'Die ehrliche Antwort',
] as const

const now = () => Math.floor(Date.now() / 1000)

/* ------------------------------------------------------------- Clipper */

let clipperCache: AgencyClipper[] | null = null

/** Alle 5.000 erfundenen Clipper, einmal je Worker erzeugt, danach aus dem Speicher. */
export function demoClippers(): AgencyClipper[] {
  if (clipperCache) return clipperCache
  const n = DEMO_TOTALS.clippers
  const clips = distribute(
    DEMO_TOTALS.clips,
    Array.from({ length: n }, (_, i) => 1 + (hash(i, 11) % 140)),
  )
  clipperCache = Array.from({ length: n }, (_, i) => {
    const { first, last } = personName(i)
    return {
      id: `demo-clipper-${i}`,
      name: `${first} ${last}`,
      platforms: platformsOf(i, 3),
      experience: pick(CLIPPER_EXPERIENCE, i, 5).labelDe,
      availability: pick(CLIPPER_AVAILABILITY, i, 6).labelDe,
      campaigns: 1 + (hash(i, 7) % 24),
      clips: clips[i],
    }
  })
  return clipperCache
}

/* ------------------------------------------------------------- Creator */

let creatorCache: AgencyCreator[] | null = null

/** Vorwiegend große Reichweiten — die Auswahl gewichtet nach oben. */
const FOLLOWER_POOL = ['10k_50k', '50k_100k', '50k_100k', '100k_1m', '100k_1m', '100k_1m', 'ueber_1m'] as const
const VIEWS30_POOL = ['100k_500k', '500k_1m', '500k_1m', 'ueber_1m', 'ueber_1m'] as const
const AD_POOL = ['ja', 'ja', 'ja', 'vielleicht'] as const

/** Alle 200 erfundenen Creator. `demo: true`: Die Handles sind erfunden und werden nicht verlinkt. */
export function demoCreators(): AgencyCreator[] {
  if (creatorCache) return creatorCache
  const label = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v
  creatorCache = Array.from({ length: DEMO_TOTALS.creators }, (_, i) => {
    const { first, last } = personName(i, 2_300)
    const platforms = platformsOf(i, 21)
    const base = `${ascii(first)}${pick(['.', '_', ''], i, 22)}${ascii(last)}`
    const handles: Record<string, string> = {}
    for (const p of platforms) handles[p] = base
    return {
      id: `demo-creator-${i}`,
      name: `${first} ${last}`,
      niche: pick(NICHES, i, 23),
      platforms,
      handles,
      followers: label(CREATOR_FOLLOWERS, pick(FOLLOWER_POOL, i, 24)),
      views30d: label(CREATOR_VIEWS_30D, pick(VIEWS30_POOL, i, 25)),
      openToAds: label(CREATOR_AD_OPENNESS, pick(AD_POOL, i, 26)),
      campaigns: 1 + (hash(i, 27) % 30),
      pending: false,
      demo: true,
    }
  })
  return creatorCache
}

/* ------------------------------------------------------------ Kampagnen */

interface DemoCampaignFull extends AgencyCampaign {
  index: number
}

let campaignCache: DemoCampaignFull[] | null = null

/**
 * Die 500 Kampagnen des Demo-Netzwerks, neueste zuerst, die beendeten am
 * Ende. Clips und Views ergeben zusammen genau DEMO_TOTALS. Namen bewusst
 * neutral („Gastronomie · Kampagne 214“): Erfundene Firmennamen könnten
 * echten Firmen gehören.
 */
function allDemoCampaigns(): DemoCampaignFull[] {
  if (campaignCache) return campaignCache
  const n = DEMO_TOTALS.campaigns
  const clipWeights = Array.from({ length: n }, (_, i) => 20 + (hash(i, 31) % 200))
  const clips = distribute(DEMO_TOTALS.clips, clipWeights)
  const views = distribute(
    DEMO_TOTALS.views,
    clipWeights.map((w, i) => w * (40 + (hash(i, 32) % 120))),
  )
  campaignCache = Array.from({ length: n }, (_, i) => ({
    index: i,
    id: `demo-${i + 1}`,
    name: `${pick(NICHES, i, 33)} · Kampagne ${n - i}`,
    status: i < 440 ? 'aktiv' : 'beendet',
    own: false,
    thumb: { kind: 'image', src: caseImage(i, 34) } as const,
    clips: clips[i],
    views: views[i],
    clippers: 5 + (hash(i, 35) % 60),
    creators: hash(i, 36) % 7,
  }))
  return campaignCache
}

/**
 * Die erfundenen Kampagnen, so viele, dass sie mit den echten eigenen der
 * Demo-Agentur zusammen DEMO_TOTALS.campaigns ergeben.
 */
export const demoCampaigns = (count: number = DEMO_TOTALS.campaigns): AgencyCampaign[] =>
  allDemoCampaigns().slice(0, Math.max(0, count))

export function demoCampaign(id: string): DemoCampaignFull | null {
  if (!isDemoCampaignId(id)) return null
  return allDemoCampaigns()[Number(id.slice(5)) - 1] ?? null
}

/** Das Team einer Kampagne — die ersten Namen, der Rest steht als Zahl in den Kennzahlen. */
export function demoTeam(c: DemoCampaignFull): { name: string; role: 'clipper' | 'creator' }[] {
  const clippers = demoClippers()
  const creators = demoCreators()
  const team: { name: string; role: 'clipper' | 'creator' }[] = []
  for (let k = 0; k < Math.min(c.creators, 3); k++) {
    team.push({ name: creators[hash(c.index * 10 + k, 41) % creators.length].name, role: 'creator' })
  }
  for (let k = 0; k < Math.min(c.clippers, 9); k++) {
    team.push({ name: clippers[hash(c.index * 10 + k, 42) % clippers.length].name, role: 'clipper' })
  }
  return team
}

/** Die neuesten zwölf Clips einer Kampagne — mit Case-Study-Bildern als Vorschau. */
export function demoClips(c: DemoCampaignFull): AgencyClip[] {
  const shown = Math.min(12, c.clips)
  const views = distribute(Math.round(c.views * 0.04), Array.from({ length: shown }, (_, k) => 1 + (hash(c.index * 100 + k, 43) % 50)))
  return Array.from({ length: shown }, (_, k) => ({
    id: `demo-clip-${c.index}-${k}`,
    filename: `clip-${c.clips - k}.mp4`,
    caption: pick(CAPTIONS, c.index * 100 + k, 44),
    createdAt: now() - k * 9_000 - (hash(c.index * 100 + k, 45) % 9_000),
    posterUrl: caseImage(c.index * 100 + k, 46),
    previewUrl: '',
    views: views[k],
  }))
}
