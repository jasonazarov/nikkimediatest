import {
  CREATOR_NAV,
  assignBanner,
  badge,
  campaignCard,
  campaignGrid,
  dateDE,
  dateTimeDE,
  emptyState,
  esc,
  jsonScript,
  kpiBar,
  linkBtn,
  originBadge,
  type CampaignOrigin,
  pageTitle,
  payTierTable,
  shell,
  type Kpi,
  type PayTierView,
  type ThumbView,
  ASSIGN_HEADLINE,
  campHero,
} from './layout'
import { CREATOR_CAMPAIGN_AREA } from './app'
import { campaignHero, countHead, glyph, kpiLine, reachKpis, reachStamp, statusBadge, viewsMeta } from './work'
import {
  CREATOR_PLATFORMS,
  adOpennessLabel,
  creatorGoalLabel,
  creatorPlatformLabel,
  followersLabel,
  views30dLabel,
  viewsTotalLabel,
} from '../lib/domain'
import {
  CONNECTABLE,
  MANUAL_PLATFORMS,
  PUBLISH_STATUS,
  platformLabel,
  platformLines,
  publishStatusLabel,
  publishStillRunning,
  readManualPosts,
  type ManualPlatform,
} from '../lib/publisher'
import { formatCompact, metricStrip, metricsPausedNote } from './metrics'
import type { MetricRow, MetricTotals, MetricTotalsWithCreators } from '../lib/metrics'
import type { User } from '../db/schema'

/**
 * Kampagnen-Dashboard der Creator (/kampagnen) — DEUTSCH, durchgehend
 * „Kampagne“ statt Projekt oder Job.
 *
 * Diese Datei liefert die Seiten, die es nur für Creator gibt: die
 * Übersicht, „Meine Accounts“ und „Verbreiten“. „Zugeordnete Kampagnen“ samt
 * Kampagnenseiten und der Upload fertiger Clips sind die Seiten des
 * Clipper-Bereichs (views/work.ts mit CREATOR_WORK_AREA), „Meine Kampagnen“
 * samt Ordnern die des Kundenbereichs (views/app.ts mit
 * CREATOR_CAMPAIGN_AREA).
 *
 * Die Übersicht seit Oktober 2026, von oben nach unten (Vorgabe des
 * Auftraggebers): Titel, Preisstaffelung, die AKTIVEN zugeordneten
 * Kampagnen als große Karten mit Thumbnail — je Karte die Rolle
 * (Schneiden / Verbreiten, ein Creator kann beides) —, dann die Kennzahlen
 * als EINE schmale Zeile, darunter die eigenen Kampagnen und das Profil.
 *
 * Offene Kampagnen anderer stehen nirgends — weder welche es gibt noch wie
 * viele. Ein Creator sieht nur, was der Administrator ihm zugeordnet hat;
 * solange ihm gar nichts zugeordnet ist (weder zum Schneiden noch zum
 * Verbreiten) und er auch keine eigene hat, steht oben „NIKKI MEDIA wird dir
 * in Kürze eine Kampagne zuordnen.“ (`assignBanner`). Mit der ersten
 * Kampagne — zugeordnet oder eigene — verschwindet sie.
 *
 * Wer eine Kampagne nur VERBREITET, sieht weder Rohmaterial noch Cloud-Links
 * — auch nicht im Thumbnail (`campaignThumbs(…, { full: false })`).
 */

/** Eine Kampagne in den Kurzlisten der Übersicht. */
export interface CampaignRow {
  id: string
  name: string
  createdAt: number
  /** Fertig hochgeladene Dateien — gezählt wie in `hasMaterial` (domain.ts). */
  files: number
  links: number
  thumb?: ThumbView
}

/**
 * Eine Kampagne, die dem Creator zugeordnet ist — zum Schneiden
 * (`project_workers`), zum Verbreiten (`campaign_creators`) oder beides.
 */
export interface AssignedCampaignRow {
  id: string
  name: string
  /** projects.status — aktiv, pausiert oder beendet. */
  status: string
  cuts: boolean
  distributes: boolean
  /** Rohmaterial — nur gezählt, wenn er schneidet (sonst sieht er keins). */
  files: number
  links: number
  /** Seine fertig hochgeladenen Clips darin (nur beim Schneiden). */
  delivered: number
  /** Fertige Clips der Kampagne, die er verbreiten kann (nur beim Verbreiten). */
  readyClips: number
  thumb?: ThumbView
  /** Was SEINE Clips darin erreicht haben (`totalsForClipper`). */
  cutMetrics?: MetricTotals
  /** Was SEINE Posts darin erreicht haben (`totalsForCreatorDistribution`). */
  distMetrics?: MetricTotals
}

/** Eine eigene Kampagne — zusätzlich, ob sie schon jemandem zugeordnet ist. */
export interface OwnCampaignRow extends CampaignRow {
  taken: boolean
  /** projects.status — aktiv, pausiert oder beendet (setzt der Administrator). */
  status: string
  /** Zahlen aller Posts dieser Kampagne (`totalsForProjects`) — fehlt, solange es keine gibt. */
  metrics?: MetricTotals
}

/** Die Angaben aus dem Stepper, bereits aus dem JSON der Datenbank gelesen. */
export interface CreatorProfile {
  goal: string
  platforms: string[]
  handles: Record<string, string>
  openToAds: string
  followers: string
  viewsTotal: string
  views30d: string
}

/* ---------------------------------------------------------------- Helfer */

/** Nur bekannte Plattformen bekommen ein Logo — der Dateiname kommt aus der Datenbank. */
const PLATFORM_KEYS = new Set<string>(CREATOR_PLATFORMS.map((p) => p.value))

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

/** „3 Dateien“, „1 Link“ — nur die Teile, die es gibt, als Angaben für `campaignCard.meta` (schon escaped). */
const materialParts = (files: number, links: number) =>
  [files ? plural(files, 'Datei', 'Dateien') : '', links ? plural(links, 'Link', 'Links') : ''].filter(Boolean).map(esc)

/** Die Unterzeile hängt daran, was der Creator bei der Anmeldung wollte. */
const SUBTITLE: Record<string, string> = {
  suchen: 'NIKKI MEDIA ordnet dir Kampagnen zu, du machst daraus Clips und lädst sie hier hoch.',
  haben: 'Leg deine Kampagnen an und lade dein Rohmaterial hoch, die Clipper und Creator machen daraus Clips.',
  beides: 'NIKKI MEDIA ordnet dir Kampagnen zu, und du legst deine eigenen an, beides an einem Ort.',
}

/** Das Ziel aus der Anmeldung als Satz — „Beides“ allein sagt im Profil nichts. */
const GOAL_LINE: Record<string, string> = {
  suchen: 'Du suchst Kampagnen.',
  haben: 'Du hast eigene Kampagnen.',
  beides: 'Du suchst Kampagnen und hast eigene.',
}

/**
 * Stand einer eigenen Kampagne, in der Reihenfolge, in der sie ihn
 * durchläuft: erst Material, dann ordnet NIKKI MEDIA sie einem Bearbeiter zu.
 */
const ownStatus = (c: OwnCampaignRow) =>
  c.status === 'pausiert'
    ? badge('Pausiert', 'amber')
    : c.status === 'beendet'
      ? badge('Beendet', 'grey')
      : c.taken
        ? badge('In Bearbeitung', 'green')
        : c.files || c.links
          ? badge('Wartet auf Clipper', 'blue')
          : badge('Wartet auf Material', 'amber')

const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`

/** Leerzustand in einem Abschnitt — kleiner als `emptyState`. */
const smallEmpty = (title: string, text: string, action = '') => `
          <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <p class="font-display font-bold">${esc(title)}</p>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">${esc(text)}</p>
            ${action ? `<div class="mt-4">${action}</div>` : ''}
          </div>`

/**
 * Die Rolle in einer Kampagne als Pille auf dem Thumbnail — ein Creator kann
 * schneiden UND verbreiten, dann stehen beide da.
 */
const ROLE = {
  cut: { label: 'Schneiden', icon: 'scissors', tone: 'text-brand' },
  dist: { label: 'Verbreiten', icon: 'share', tone: 'text-violet-700' },
} as const
const rolePill = (role: keyof typeof ROLE) =>
  `<span class="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm ring-1 ring-black/5 ${ROLE[role].tone}">${glyph(
    ROLE[role].icon,
    'h-3 w-3',
  )}${ROLE[role].label}</span>`

/** Kleiner Textlink mit Glyphe — für die Fußzeile der Karten. */
const cardAction = (label: string, href: string, icon: Parameters<typeof glyph>[0]) =>
  `<a href="${esc(href)}" class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-2">${glyph(icon, 'h-4 w-4')}${esc(label)}</a>`

const cutHref = (id: string) => `/kampagnen/kampagne/${encodeURIComponent(id)}`
const distHref = (id: string) => `/kampagnen/verbreiten/${encodeURIComponent(id)}`

/**
 * Eine zugeordnete Kampagne als große Karte. Wer schneidet, landet auf der
 * Kampagnenseite mit dem Rohmaterial; wer nur verbreitet, bei den fertigen
 * Clips. Wer beides tut, hat unten beide Wege.
 */
function assignedCard(c: AssignedCampaignRow): string {
  const meta = [
    ...(c.cuts ? (c.files || c.links ? materialParts(c.files, c.links) : ['Noch kein Rohmaterial']) : []),
    ...(c.cuts && c.delivered ? [esc(plural(c.delivered, 'Clip geliefert', 'Clips geliefert'))] : []),
    ...(c.distributes ? [esc(c.readyClips ? plural(c.readyClips, 'fertiger Clip', 'fertige Clips') : 'Noch keine Clips')] : []),
    ...viewsMeta(c.cutMetrics, 'Views deiner Clips', 'scissors'),
    ...viewsMeta(c.distMetrics, 'Views deiner Posts', 'share'),
  ]
  const actions = [
    c.cuts ? cardAction('Clip hochladen', `/kampagnen/upload?projekt=${encodeURIComponent(c.id)}`, 'upload') : '',
    c.distributes ? cardAction(c.cuts ? 'Clips verbreiten' : 'Clips ansehen & freigeben', distHref(c.id), 'share') : '',
  ].filter(Boolean)
  return campaignCard({
    href: c.cuts ? cutHref(c.id) : distHref(c.id),
    name: c.name,
    thumb: c.thumb,
    origin: { kind: 'assigned' },
    corner: (c.cuts ? rolePill('cut') : '') + (c.distributes ? rolePill('dist') : '') + statusBadge(c.status),
    meta,
    footer: `<div class="flex flex-wrap items-center gap-x-5 gap-y-2">${actions.join('')}</div>`,
  })
}

/** Eine eigene Kampagne als große Karte. */
const ownCard = (c: OwnCampaignRow) =>
  campaignCard({
    href: CREATOR_CAMPAIGN_AREA.projectHref(c.id),
    name: c.name,
    thumb: c.thumb,
    origin: { kind: 'own' },
    eyebrow: `Von dir angelegt am ${dateDE(c.createdAt)}`,
    corner: ownStatus(c),
    meta: [...(c.files || c.links ? materialParts(c.files, c.links) : ['Noch kein Rohmaterial']), ...viewsMeta(c.metrics, 'Views aller Posts')],
  })

/** Raster für Karten in einer schmaleren Spalte — höchstens zwei nebeneinander. */
const narrowGrid = (cards: string[]) => `<div class="grid gap-5 sm:grid-cols-2">${cards.join('')}</div>`

const hasNumbers = (t: MetricTotals | undefined): t is MetricTotals => Boolean(t && t.posts > 0)

/**
 * Eine Zeile unter der Überschrift, die keinen Zweifel lässt, woher die
 * Kampagnen darunter kommen — Vorgabe des Auftraggebers.
 */
const originNote = (origin: CampaignOrigin) =>
  `<p class="-mt-1 mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">${originBadge(origin)}<span>${
    origin === 'own'
      ? 'Von dir angelegt: dein Rohmaterial, deine Kampagne.'
      : 'Von NIKKI MEDIA zugewiesen, sie gehören Kunden oder anderen Creatorn, nicht dir.'
  }</span></p>`

const allAssignedLink = `<a href="/kampagnen/finden" class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-2">Alle zugewiesenen Kampagnen ${arrow}</a>`

/* ---------------------------------------------------------- Übersicht */

export function overviewPage(o: {
  user: User
  profile: CreatorProfile
  /** Preisstaffelung dieses Creators (`payTiersOf`) — bei jedem Aufruf frisch. */
  tiers: PayTierView[]
  /** Zugeordnete AKTIVE Kampagnen — groß ganz oben. */
  active: AssignedCampaignRow[]
  /** Zugeordnete, die pausiert oder beendet sind — weiter unten, damit er sie nicht aus den Augen verliert. */
  inactive: AssignedCampaignRow[]
  counts: {
    own: number
    /** Kampagnen, die ihm zum Bearbeiten zugeordnet sind. */
    taken: number
    /** Kunden-Kampagnen, die ihm zum Verbreiten zugeordnet sind (siehe `distributionCampaigns`). */
    distribute: number
  }
  /** Verbundene Social-Accounts des Creators. */
  accounts: number
  /** Die neuesten eigenen Kampagnen. */
  own: OwnCampaignRow[]
  /**
   * Echte Zahlen aus Zernio. `own`: alle Posts aller eigenen Kampagnen
   * zusammen, auch die über andere Creator; `clips`: seine geschnittenen
   * Clips; `distribution`: nur seine eigenen Posts in fremden Kampagnen.
   * Fehlt, solange es keine gibt.
   */
  metrics: {
    own?: MetricTotalsWithCreators
    clips?: MetricTotals
    distribution?: MetricTotals
    /** `metricsPausedUntil` — solange gesetzt, steht der Hinweis bei den Zahlen. */
    pausedUntil: number | null
  }
}): string {
  const p = o.profile
  const campaignText = CREATOR_CAMPAIGN_AREA.text

  /* „NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen.“ NUR, solange er
     gar keine Kampagne hat — weder zugeordnet (Schneiden, Verbreiten, auch
     pausiert) noch eine eigene. Hat er eine, verschwindet die Zeile
     komplett (Vorgabe des Auftraggebers). Wer nur eigene Kampagnen will
     (Ziel „haben“), sucht nichts und bekommt sie nie. */
  const seeking = p.goal !== 'haben'
  const hasCampaign = o.active.length + o.inactive.length + o.counts.own > 0
  const banner = seeking && !hasCampaign ? assignBanner() : ''

  const active = o.active.length
    ? countHead('Zugewiesene Kampagnen', o.active.length, allAssignedLink) +
      originNote('assigned') +
      campaignGrid(o.active.map(assignedCard))
    : ''

  /* Die Zahlen als EINE Zeile: Kampagnen zählen, dann die Views — getrennt
     nach dem, was sie messen. Eigene Kampagnen (alle Posts, auch über
     Creator), seine geschnittenen Clips, seine Posts in fremden Kampagnen.
     Zusammengezählt ergäben sie eine Zahl, die keine Frage beantwortet. */
  const m = o.metrics
  const viaCreators = m.own?.viaCreators
  const views: Kpi[] = [
    ...(hasNumbers(m.own)
      ? [
          {
            value: formatCompact(m.own.views, 'de'),
            label: 'Views eigene',
            hint: viaCreators && viaCreators.posts > 0 ? `davon ${formatCompact(viaCreators.views, 'de')} über Creator` : undefined,
          },
        ]
      : []),
    ...(hasNumbers(m.clips) ? [{ value: formatCompact(m.clips.views, 'de'), label: 'Views deiner Clips' }] : []),
    ...(hasNumbers(m.distribution) ? [{ value: formatCompact(m.distribution.views, 'de'), label: 'Views Verbreitung' }] : []),
  ]
  const synced = [m.own, m.clips, m.distribution]
    .filter(hasNumbers)
    .reduce<number | null>((max, t) => (t.syncedAt !== null && (max === null || t.syncedAt > max) ? t.syncedAt : max), null)
  const paused = metricsPausedNote(m.pausedUntil, 'de')
  const kpis = kpiLine(
    'Deine Zahlen',
    [
      { value: o.active.length.toLocaleString('de-DE'), label: 'Zugewiesen' },
      { value: o.counts.own.toLocaleString('de-DE'), label: 'Eigene' },
      { value: o.accounts.toLocaleString('de-DE'), label: o.accounts === 1 ? 'Account' : 'Accounts' },
      ...(views.length ? views : [{ value: '–', label: 'Views', hint: 'noch keine Zahlen' }]),
    ],
    (synced ? `<p class="mt-1.5 text-[11px] text-slate-400">Stand: ${esc(dateTimeDE(synced))}</p>` : '') +
      (paused ? `<div class="mt-2">${paused}</div>` : ''),
    o.active.length || banner ? 'mt-9' : 'mt-0',
  )

  /* „Neue Kampagne“ ist ein Link auf die Liste und öffnet mit JavaScript
     gleich hier das Namensfeld — danach geht es direkt in die neue
     Kampagne, wie beim Anlegen unter „Meine Kampagnen“. */
  const newButton = linkBtn(esc(campaignText.newItem), CREATOR_CAMPAIGN_AREA.home, 'primary', 'data-new-campaign')

  const ownSection = `
        <section>
          ${countHead('Meine Kampagnen', o.counts.own, newButton)}
          ${originNote('own')}
          ${
            o.own.length
              ? narrowGrid(o.own.map(ownCard)) +
                (o.counts.own > o.own.length
                  ? `<a href="${esc(CREATOR_CAMPAIGN_AREA.home)}" class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-2">Alle ${esc(
                      o.counts.own,
                    )} Kampagnen ansehen ${arrow}</a>`
                  : '')
              : smallEmpty(
                  'Noch keine eigene Kampagne',
                  'Leg eine Kampagne an und lade dein Rohmaterial hoch oder füge einen Cloud-Link ein, die Clipper und Creator machen daraus Clips.',
                )
          }
        </section>`

  const inactiveSection = o.inactive.length
    ? `
        <section>
          ${countHead('Zugewiesen · pausiert oder beendet', o.inactive.length)}
          ${narrowGrid(o.inactive.map(assignedCard))}
        </section>`
    : ''

  /* Profil-Kurzinfo: die Angaben aus der Anmeldung. Der Handle steht als
     Text mit @ davor — bewusst kein Link, wie im Admin-Bereich: jede
     Plattform baut ihre Profiladressen anders. */
  const platformRows = p.platforms.length
    ? `<ul class="space-y-2">${p.platforms
        .map((key) => {
          const handle = p.handles[key]
          return `
                <li class="flex min-w-0 items-center gap-2 text-sm">
                  ${
                    PLATFORM_KEYS.has(key)
                      ? `<img src="/img/platforms/${esc(key)}.svg" alt="" width="18" height="18" loading="lazy" class="h-[18px] w-[18px] shrink-0">`
                      : ''
                  }
                  <span class="shrink-0 font-medium text-slate-700">${esc(creatorPlatformLabel(key))}</span>
                  ${handle ? `<span class="truncate text-slate-500">@${esc(handle.replace(/^@+/, ''))}</span>` : ''}
                </li>`
        })
        .join('')}
              </ul>`
    : '<p class="text-sm text-slate-400">Keine Plattform angegeben.</p>'

  const fact = (label: string, value: string) => `
              <div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2.5 text-sm">
                <dt class="text-slate-500">${esc(label)}</dt>
                <dd class="text-right font-semibold text-slate-800">${esc(value)}</dd>
              </div>`

  /* Verbundene Accounts gehören ins Profil: sie sind das, worauf seine
     eigenen Kampagnen automatisch laufen. Ohne einen einzigen steht hier
     die Aufforderung — sonst merkt er erst am ersten fertigen Clip, dass
     nichts rausging. */
  const accountsLink = o.accounts
    ? `
          <a href="/kampagnen/accounts" class="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:border-brand">
            <span class="min-w-0">
              <span class="block font-semibold text-slate-800">${esc(plural(o.accounts, 'Account', 'Accounts'))} verbunden</span>
              <span class="block text-xs text-slate-500">Fertige Clips deiner Kampagnen gehen automatisch darauf.</span>
            </span>
            <span class="shrink-0 text-brand">${arrow}</span>
          </a>`
    : `
          <a href="/kampagnen/accounts" class="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm transition hover:border-amber-300">
            <span class="min-w-0">
              <span class="block font-semibold text-amber-900">Noch kein Account verbunden</span>
              <span class="block text-xs text-amber-800/80">Verbinde deine Kanäle, damit fertige Clips automatisch rausgehen.</span>
            </span>
            <span class="shrink-0 text-amber-700">${arrow}</span>
          </a>`

  const profileCard = `
        <aside class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="font-display text-lg font-bold">Dein Profil</h2>
          <p class="mt-0.5 text-sm text-slate-500">${esc(GOAL_LINE[p.goal] ?? creatorGoalLabel(p.goal))}</p>
          <div class="mt-4">${platformRows}</div>
          ${accountsLink}
          <dl class="mt-4">
            ${fact('Follower', followersLabel(p.followers))}
            ${fact('Views (30 Tage)', views30dLabel(p.views30d))}
            ${fact('Views insgesamt', viewsTotalLabel(p.viewsTotal))}
            ${fact('Werbung', adOpennessLabel(p.openToAds))}
          </dl>
        </aside>`

  const modal = `
      <!-- Modal: Neue Kampagne -->
      <div id="campaign-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 class="font-display text-lg font-bold">${esc(campaignText.newItem)}</h2>
          <p class="mt-1 text-sm text-slate-500">${esc(campaignText.nameHint)}</p>
          <input id="campaign-name" type="text" maxlength="80" placeholder="${esc(campaignText.namePlaceholder)}"
                 class="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          <p id="campaign-error" class="mt-2 hidden text-sm font-medium text-red-600"></p>
          ${
            o.accounts
              ? ''
              : `<p class="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">Tipp: Verbinde unter <a href="/kampagnen/accounts" class="font-semibold underline">Meine Accounts</a> deine Kanäle: dann gehen die fertigen Clips dieser Kampagne automatisch darauf.</p>`
          }
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-modal class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Abbrechen</button>
            <button type="button" id="campaign-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-40">${esc(
              campaignText.createButton,
            )}</button>
          </div>
        </div>
      </div>`

  /* Kampagnen-Kopf im Aufbau der Agentur (Vorgabe des Auftraggebers, November 2026),
     unter der Preisstaffelung, die ganz oben bleiben muss. Links die wichtigste
     Kampagne mit ihren Knöpfen, rechts „Neue Kampagne erstellen“. */
  const newSide = {
    attrs: 'data-new-campaign',
    title: 'Neue Kampagne erstellen',
    text: 'Name eingeben, Rohmaterial hochladen. Clipper und Creator machen daraus Clips für deine Kanäle.',
    cta: 'Kampagne anlegen',
    icon: 'plus' as const,
  }
  const accountsBtn = { href: '/kampagnen/accounts', label: 'Meine Accounts' }
  const viewsStat = (...list: (MetricTotals | undefined)[]) => {
    const filled = list.filter(hasNumbers)
    return filled.length ? [{ value: formatCompact(filled.reduce((n, t) => n + t.views, 0), 'de'), label: 'Views', valueFirst: true }] : []
  }
  const a = o.active[0]
  const mine = o.own[0]
  const hero = a
    ? campHero({
        eyebrow: 'Zugewiesene Kampagne',
        chip: a.cuts && a.distributes ? 'Schneiden & Verbreiten' : a.cuts ? 'Schneiden' : 'Verbreiten',
        title: a.name,
        stats: [
          ...(a.cuts ? [{ value: String(a.delivered), label: a.delivered === 1 ? 'Clip geliefert' : 'Clips geliefert', valueFirst: true }] : []),
          ...(a.distributes ? [{ value: String(a.readyClips), label: a.readyClips === 1 ? 'Clip zum Verbreiten' : 'Clips zum Verbreiten', valueFirst: true }] : []),
          ...viewsStat(a.cutMetrics, a.distMetrics),
        ],
        primary: a.cuts
          ? { href: `/kampagnen/upload?projekt=${encodeURIComponent(a.id)}`, label: 'Clips hochladen', icon: 'upload' }
          : { href: distHref(a.id), label: 'Clips verbreiten' },
        ghosts: [
          ...(a.cuts && a.distributes ? [{ href: distHref(a.id), label: 'Verbreiten' }] : []),
          { href: a.cuts ? cutHref(a.id) : distHref(a.id), label: 'Kampagne öffnen' },
          accountsBtn,
        ],
        more: { href: '/kampagnen/finden', label: o.active.length > 1 ? `Alle ${o.active.length} zugewiesenen →` : 'Alle zugewiesenen →' },
        side: newSide,
      })
    : mine
      ? campHero({
          eyebrow: 'Deine Kampagne',
          chip: 'Eigene Kampagne',
          title: mine.name,
          stats: viewsStat(mine.metrics),
          primary: { href: CREATOR_CAMPAIGN_AREA.projectHref(mine.id), label: 'Material hochladen', icon: 'upload' },
          ghosts: [accountsBtn],
          more: { href: CREATOR_CAMPAIGN_AREA.home, label: 'Alle meine Kampagnen →' },
          side: newSide,
        })
      : banner
        ? campHero({
            eyebrow: 'Deine Kampagne',
            title: ASSIGN_HEADLINE,
            text: 'Du bekommst eine E-Mail, sobald eine Kampagne für dich bereitsteht. Bis dahin: verbinde deine Kanäle, damit fertige Clips automatisch rausgehen.',
            ghosts: [accountsBtn],
            mainAttrs: 'data-assign-headline',
            side: newSide,
          })
        : campHero({
            eyebrow: 'Deine Kampagne',
            title: 'Starte deine erste Kampagne',
            text: 'Leg eine Kampagne an und lade dein Rohmaterial hoch. Clipper und Creator machen daraus Clips.',
            ghosts: [accountsBtn],
            side: newSide,
          })

  const body =
    pageTitle('Dein Kampagnen-Dashboard', SUBTITLE[p.goal] ?? SUBTITLE.beides) +
    payTierTable(o.tiers, 'mb-8') +
    hero +
    active +
    kpis +
    `
      <div class="mt-10 grid items-start gap-6 lg:grid-cols-3">
        <div class="min-w-0 space-y-10 lg:col-span-2">${ownSection}${inactiveSection}
        </div>
        ${profileCard}
      </div>` +
    modal

  return shell({
    title: 'Übersicht',
    user: o.user,
    nav: CREATOR_NAV,
    active: '/kampagnen',
    body,
    script: `
(function () {
  var modal = document.getElementById('campaign-modal');
  var input = document.getElementById('campaign-name');
  var error = document.getElementById('campaign-error');
  var save = document.getElementById('campaign-save');
  var target = ${jsonScript(CREATOR_CAMPAIGN_AREA.projectHref(''))};

  function open(e) {
    e.preventDefault();
    input.value = '';
    error.classList.add('hidden');
    save.disabled = false;
    modal.classList.remove('hidden'); modal.classList.add('flex');
    input.focus();
  }
  function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  function fail(message) {
    error.textContent = message;
    error.classList.remove('hidden');
    save.disabled = false;
  }

  function create() {
    // Enter läuft am gesperrten Knopf vorbei — sonst legt ein Doppeltipp zwei Kampagnen an.
    if (save.disabled) return;
    var name = input.value.trim();
    if (!name) return fail(${jsonScript('Bitte gib einen Namen ein.')});
    error.classList.add('hidden');
    save.disabled = true;
    fetch('/api/app/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.id) throw new Error(res.d.error || ${jsonScript('Das hat nicht geklappt.')});
        /* Direkt in die neue Kampagne — dort fragt sie nach dem Material,
           ohne das sie für niemanden sichtbar wird. */
        window.location.href = target + encodeURIComponent(res.d.id);
      })
      .catch(function (e) { fail(e.message); });
  }

  document.querySelectorAll('[data-new-campaign]').forEach(function (el) { el.addEventListener('click', open); });
  document.querySelectorAll('[data-close-modal]').forEach(function (b) { b.addEventListener('click', close); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  save.addEventListener('click', create);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); });
})();`,
  })
}

/* ------------------------------------------------- Gemeinsame Bausteine */

/** Logo einer bekannten Plattform. Unbekannte bekommen keins — der Name kommt aus der Datenbank. */
const platformLogo = (key: string, size = 22) =>
  PLATFORM_KEYS.has(key)
    ? `<img src="/img/platforms/${esc(key)}.svg" alt="" width="${size}" height="${size}" loading="lazy" class="shrink-0" style="width:${size}px;height:${size}px">`
    : ''

/** Rückmeldung oben auf der Seite — grün oder rot. */
const flashBox = (f?: { ok?: string; error?: string }) =>
  f?.error
    ? `
      <div role="alert" class="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">${esc(f.error)}</div>`
    : f?.ok
      ? `
      <div role="status" class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">${esc(f.ok)}</div>`
      : ''

/** Hinweis mit Knopf — für „noch kein Account verbunden“ und Ähnliches. */
const noticeBox = (title: string, text: string, action = '') => `
      <div class="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-semibold text-amber-900">${esc(title)}</p>
          <p class="mt-0.5 text-sm text-amber-800/90">${esc(text)}</p>
        </div>
        ${action ? `<div class="shrink-0">${action}</div>` : ''}
      </div>`

/** Platz für Fehler aus den Knöpfen der Seite — ersetzt `alert()`, das auf dem Handy den Fluss unterbricht. */
const pageError = `
      <div id="page-error" role="alert" class="mb-6 hidden rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700"></div>`

const NO_ACCOUNTS_TITLE = 'Noch kein Account verbunden'
const NO_ACCOUNTS_TEXT =
  'Clips kannst du erst posten, wenn mindestens einer deiner Kanäle verbunden ist. Das geht einmal und gilt dann für alle Kampagnen.'

/** „Twitch“, „Twitch und Snapchat“, „A, B und C“ — doppelte Einträge zählen einmal. */
const andList = (items: string[]) => {
  const list = [...new Set(items)]
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : (list[0] ?? '')
}

/**
 * Hinweis oben auf „Verbreiten“ und den Kampagnenseiten, solange kein
 * Account verbunden ist.
 *
 * Zwei Fälle, auf beiden Seiten gleich unterschieden: Wer Twitch oder
 * Snapchat im Profil hat, kann auch ohne Account freigeben — dann selbst
 * posten und den Link eintragen. Ihm „Clips kannst du erst posten, wenn …“
 * zu sagen, wäre falsch und schickte ihn auf einen Umweg. Genannt werden nur
 * die Plattformen aus SEINEM Profil: wer nur Twitch angegeben hat, hat auf
 * Snapchat keinen Kanal, und dort gibt es für ihn auch kein Link-Feld.
 */
function accountsNotice(accounts: number, manualPlatforms: ManualPlatform[]): string {
  if (accounts) return ''
  if (manualPlatforms.length) {
    return noticeBox(
      'Automatisch posten',
      `Auf ${andList(manualPlatforms.map(platformLabel))} postest du selbst und trägst danach den Link beim Clip ein. Für automatisches Posten verbinde einen Account.`,
      linkBtn('Accounts verbinden', '/kampagnen/accounts', 'ghost'),
    )
  }
  return noticeBox(NO_ACCOUNTS_TITLE, NO_ACCOUNTS_TEXT, linkBtn('Accounts verbinden', '/kampagnen/accounts', 'primary'))
}

/**
 * Gemeinsames JavaScript der Creator-Seiten: Anfragen an die API und die
 * Fehleranzeige. Ein Fehler der API kommt als `Error` mit der deutschen
 * Meldung aus der Antwort an; was sie sonst mitgibt (etwa den Link zu
 * „Meine Accounts“), hängt an `error.data`.
 *
 * `pageshow` gibt gesperrte Knöpfe wieder frei, wenn der Browser die Seite
 * aus dem Verlauf zurückholt (Zurück-Taste vom Anbieter beim Verbinden) —
 * sonst stünde dort ein grauer Knopf, der nie wieder reagiert.
 */
const CLIENT_JS = `
  var errorBox = document.getElementById('page-error');
  function showError(message) {
    if (!errorBox) { window.alert(message); return; }
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function hideError() { if (errorBox) errorBox.classList.add('hidden'); }
  function send(url, method, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error(res.d.error || ${jsonScript('Das hat nicht geklappt. Bitte versuch es noch einmal.')});
          err.data = res.d;
          throw err;
        }
        return res.d;
      });
  }
  /* Doppeltipp-Schutz: ein Knopf, der schon arbeitet, nimmt keinen zweiten Klick an. */
  function busy(btn, text) {
    if (btn.disabled || btn.getAttribute('data-busy')) return false;
    btn.disabled = true;
    btn.setAttribute('data-busy', '1');
    btn.setAttribute('data-label', btn.innerHTML);
    if (text) btn.textContent = text;
    return true;
  }
  function idle(btn) {
    btn.disabled = false;
    btn.removeAttribute('data-busy');
    if (btn.hasAttribute('data-label')) btn.innerHTML = btn.getAttribute('data-label');
  }
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.querySelectorAll('[data-busy]').forEach(idle);
  });`

/* ---------------------------------------------------------- Meine Accounts */

/** Ein verbundener Account, wie ihn die Seite braucht. */
export interface ConnectedAccount {
  id: string
  platform: string
  username: string | null
  displayName: string | null
}

/**
 * Was beim Verbinden passiert und wie gepostet wird — je Plattform ein Satz.
 * Facebook und LinkedIn fragen nach der Zustimmung noch, WOHIN gepostet
 * wird; das soll niemanden überraschen.
 */
const CONNECT_HINT: Record<string, string> = {
  instagram: 'Als Reel, auch im Profil-Feed.',
  tiktok: 'Öffentlich auf deinem Profil.',
  youtube: 'Öffentlich auf deinem Kanal, die erste Zeile der Bildunterschrift wird zum Titel.',
  twitter: 'Als Post mit Video.',
  facebook: 'Als Video auf einer Facebook-Seite, welche, wählst du beim Verbinden.',
  linkedin: 'Auf deinem Profil oder einer Unternehmensseite, das wählst du beim Verbinden.',
}

/** Name eines Accounts für Listen: @handle, sonst der Anzeigename, sonst die Plattform. */
const accountName = (a: ConnectedAccount) =>
  a.username ? `@${a.username.replace(/^@+/, '')}` : a.displayName || platformLabel(a.platform)

export function accountsPage(o: {
  user: User
  accounts: ConnectedAccount[]
  /** Plattformen aus der Anmeldung — entscheidet über den Hinweis bei Twitch und Snapchat. */
  profilePlatforms: string[]
  /** Ergebnis der Rückkehr aus dem Verbinden (`absorbConnectReturn`). */
  flash?: { ok?: string; error?: string }
  /** Ist die Anbindung eingerichtet? Ohne sie sind die Knöpfe gesperrt. */
  ready: boolean
}): string {
  const cards = CONNECTABLE.map((key) => {
    const label = platformLabel(key)
    const mine = o.accounts.filter((a) => a.platform === key)
    const rows = mine.length
      ? `<ul class="mt-4 space-y-2">${mine
          .map((a) => {
            const name = accountName(a)
            return `
                <li class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-200">
                  <span class="min-w-0">
                    <span class="block truncate font-semibold text-slate-800">${esc(name)}</span>
                    ${
                      a.username && a.displayName
                        ? `<span class="block truncate text-xs text-slate-500">${esc(a.displayName)}</span>`
                        : ''
                    }
                  </span>
                  <button type="button" data-disconnect="${esc(a.id)}" data-name="${esc(`${label} ${name}`)}"
                          class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40">Trennen</button>
                </li>`
          })
          .join('')}
              </ul>`
      : '<p class="mt-4 text-sm text-slate-400">Noch nicht verbunden.</p>'

    return `
          <div class="flex flex-col rounded-2xl border ${mine.length ? 'border-emerald-200' : 'border-slate-200'} bg-white p-5 shadow-sm">
            <div class="flex items-center gap-3">
              <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-200">${platformLogo(key, 26)}</span>
              <h2 class="font-display text-lg font-extrabold tracking-tight">${esc(label)}</h2>
              ${mine.length ? `<span class="ml-auto">${badge(`${mine.length} verbunden`, 'green')}</span>` : ''}
            </div>
            <p class="mt-1.5 text-xs text-slate-500">${esc(CONNECT_HINT[key] ?? '')}</p>
            ${rows}
            <div class="mt-auto pt-4">
              <button type="button" data-connect="${esc(key)}" ${o.ready ? '' : 'disabled'}
                      class="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
                        mine.length
                          ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                          : 'bg-brand text-white hover:bg-brand-2'
                      }">${mine.length ? 'Weiteren Account verbinden' : `${esc(label)} verbinden`}</button>
            </div>
          </div>`
  }).join('')

  /* Twitch und Snapchat stehen trotzdem da: viele Creator haben dort ihre
     Reichweite, und ohne Erklärung sähe es aus, als hätten wir sie vergessen. */
  const manual = MANUAL_PLATFORMS.map((key) => {
    const inProfile = o.profilePlatforms.includes(key)
    return `
          <div class="flex items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-200">${platformLogo(key, 26)}</span>
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-display font-bold">${esc(platformLabel(key))} ${
                inProfile ? badge('In deinem Profil', 'blue') : ''
              }</p>
              <p class="mt-1 text-sm text-slate-500">${
                inProfile
                  ? 'Hierhin kann nicht automatisch gepostet werden. Poste den Clip selbst und trag danach unter „Verbreiten“ beim Clip den Link zu deinem Beitrag ein, so ist festgehalten, wo der Clip läuft.'
                  : 'Hierhin kann nicht automatisch gepostet werden. Das Feld für den Link zu deinem Beitrag gibt es für Plattformen aus deinem Profil.'
              }</p>
            </div>
          </div>`
  }).join('')

  const body =
    pageTitle(
      'Meine Accounts',
      'Einmal verbinden, überall nutzen, für deine eigenen Kampagnen und für alle, die du verbreitest.',
    ) +
    kpiBar(
      [
        { value: o.accounts.length.toLocaleString('de-DE'), label: o.accounts.length === 1 ? 'Account verbunden' : 'Accounts verbunden' },
        {
          value: `${CONNECTABLE.filter((k) => o.accounts.some((a) => a.platform === k)).length} / ${CONNECTABLE.length}`,
          label: 'Plattformen',
        },
      ],
      'mb-7 w-fit max-w-full',
    ) +
    flashBox(o.flash) +
    pageError +
    (o.ready
      ? ''
      : noticeBox(
          'Verbinden ist gerade nicht möglich',
          'Die Anbindung an die Plattformen wird gerade eingerichtet. Schau bitte später wieder vorbei.',
        )) +
    `
      <div class="mb-7 grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <p class="font-semibold text-slate-900">Deine eigenen Kampagnen</p>
          <p class="mt-0.5">Fertige Clips gehen automatisch auf alle Accounts, die hier verbunden sind.</p>
        </div>
        <div>
          <p class="font-semibold text-slate-900">Kampagnen, die du verbreitest</p>
          <p class="mt-0.5">Ein Clip geht erst raus, wenn du ihn unter <a href="/kampagnen/verbreiten" class="font-semibold text-brand hover:text-brand-2">Verbreiten</a> mit „Freigeben &amp; posten“ freigibst.</p>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}
      </div>

      <h2 class="mb-3 mt-10 font-display text-xl font-extrabold tracking-tight">Ohne automatisches Posten</h2>
      <div class="grid gap-4 sm:grid-cols-2">${manual}
      </div>

      <p class="mt-8 text-sm text-slate-500">
        Mehrere Accounts derselben Plattform? Melde dich vor dem nächsten Verbinden bei der Plattform ab und mit dem anderen Account an, sonst zeigt sie wieder denselben.
      </p>
      <p class="mt-2 text-sm text-slate-500">
        Gerade verbunden, aber der Account fehlt hier?
        <button type="button" data-sync ${o.ready ? '' : 'disabled'} class="font-semibold text-brand hover:text-brand-2 disabled:opacity-40">Jetzt abgleichen</button>
      </p>`

  return shell({
    title: 'Meine Accounts',
    user: o.user,
    nav: CREATOR_NAV,
    active: '/kampagnen/accounts',
    body,
    script: `
(function () {${CLIENT_JS}

  /* Die Rückkehr aus dem Verbinden trägt ihre Angaben in der Adresse. Die
     sind verarbeitet — ohne sie zeigt ein Neuladen nicht dieselbe Meldung
     noch einmal. */
  if (/[?&](connected|error)=/.test(window.location.search) && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  document.querySelectorAll('[data-connect]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!busy(btn, ${jsonScript('Einen Moment …')})) return;
      hideError();
      send('/api/creator/accounts/connect/' + encodeURIComponent(btn.getAttribute('data-connect')), 'POST')
        .then(function (d) {
          if (!d.url) throw new Error(${jsonScript('Der Link zum Verbinden fehlt. Bitte versuch es noch einmal.')});
          // Im selben Fenster: der Anbieter schickt danach hierher zurück.
          window.location.href = d.url;
        })
        .catch(function (e) { idle(btn); showError(e.message); });
    });
  });

  document.querySelectorAll('[data-disconnect]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (!window.confirm(${jsonScript('„')} + btn.getAttribute('data-name') + ${jsonScript('“ trennen? Clips gehen dann nicht mehr auf diesen Account. Du kannst ihn jederzeit wieder verbinden.')})) return;
      if (!busy(btn, ${jsonScript('Trennt …')})) return;
      hideError();
      send('/api/creator/accounts/' + encodeURIComponent(btn.getAttribute('data-disconnect')), 'DELETE')
        .then(function () { window.location.reload(); })
        .catch(function (e) { idle(btn); showError(e.message); });
    });
  });

  document.querySelectorAll('[data-sync]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!busy(btn, ${jsonScript('Gleicht ab …')})) return;
      hideError();
      send('/api/creator/accounts/sync', 'POST')
        .then(function () { window.location.reload(); })
        .catch(function (e) { idle(btn); showError(e.message); });
    });
  });
})();`,
  })
}

/* --------------------------------------------------------------- Verbreiten */

/**
 * Eine Kunden-Kampagne in der Liste „Verbreiten“ — nur der Name, keine
 * Kundendaten. In der Liste stehen nur Kampagnen, die der Administrator
 * diesem Creator zugeordnet hat; `joined`/`joinedAt` heißen noch wie zu der
 * Zeit, als Creator selbst beitraten (Spalte `campaign_creators.joined_at`).
 */
export interface DistributionRow {
  id: string
  name: string
  createdAt: number
  /** Fertige Clips darin. */
  clips: number
  joined: boolean
  joinedAt: number | null
  /** projects.status — zugeordnete Kampagnen bleiben sichtbar, auch wenn sie pausiert sind. */
  status: string
  /** Was SEINE Posts in dieser Kampagne erreicht haben (`perProject`) — fehlt ohne Zahlen. */
  metrics?: MetricTotals
  /** Thumbnail — für Kampagnen, die er nur verbreitet, ohne Rohmaterial und Links (`full: false`). */
  thumb?: ThumbView
}

const clipCount = (n: number) => (n ? plural(n, 'fertiger Clip', 'fertige Clips') : 'Noch keine Clips')

/**
 * „Zugewiesene Kampagnen“ — ALLES, was NIKKI MEDIA dem Creator zugewiesen
 * hat: zum Schneiden, zum Verbreiten oder beides, je Kampagne eine Karte mit
 * ihren Rollen. Eigene Kampagnen stehen hier bewusst NICHT — die haben ihren
 * eigenen Menüpunkt „Meine Kampagnen“. Jede Karte trägt die Plakette
 * „Zugewiesene Kampagne“, damit nie ein Zweifel bleibt (Vorgabe des
 * Auftraggebers).
 */
export function assignedListPage(o: {
  user: User
  tiers: PayTierView[]
  active: AssignedCampaignRow[]
  inactive: AssignedCampaignRow[]
  /** Eigene Kampagnen — hat er eine, entfällt „… zuordnen.“ (siehe Übersicht). */
  ownCount: number
  /** Ziel ≠ „haben“: er sucht zugewiesene Kampagnen. */
  seeking: boolean
}): string {
  const nothing = !o.active.length && !o.inactive.length
  const toOwn = linkBtn('Zu „Meine Kampagnen“', CREATOR_CAMPAIGN_AREA.home, 'ghost')
  const body =
    pageTitle(
      'Zugewiesene Kampagnen',
      'Diese Kampagnen hat dir NIKKI MEDIA zugewiesen, zum Schneiden, zum Verbreiten oder beides. Deine eigenen Kampagnen findest du unter „Meine Kampagnen“.',
    ) +
    payTierTable(o.tiers, 'mb-8') +
    (nothing
      ? o.seeking && !o.ownCount
        ? assignBanner()
        : smallEmpty(
            'Noch keine zugewiesene Kampagne',
            'Sobald dir NIKKI MEDIA eine Kampagne zuweist, erscheint sie hier, du bekommst dazu eine E-Mail.',
            o.ownCount ? toOwn : '',
          )
      : '') +
    (o.active.length
      ? `<section>
          ${countHead('Aktiv', o.active.length)}
          ${originNote('assigned')}
          ${campaignGrid(o.active.map(assignedCard))}
        </section>`
      : '') +
    (o.inactive.length
      ? `<section>
          ${countHead('Pausiert oder beendet', o.inactive.length)}
          ${narrowGrid(o.inactive.map(assignedCard))}
        </section>`
      : '')

  return shell({
    title: 'Zugewiesene Kampagnen',
    user: o.user,
    nav: CREATOR_NAV,
    active: '/kampagnen/finden',
    body,
  })
}

/**
 * Seine Verbreitung als EINE schmale Kennzahlenzeile — über der Liste unter
 * den Karten, auf einer Kampagnenseite im Kopf.
 *
 * Steht nur da, wo es etwas zu messen gibt oder bald geben wird: mit Zahlen
 * oder sobald ihm eine Kampagne zugeordnet ist. Wer noch keine hat, bekommt
 * keine Zeile „noch keine Zahlen“.
 */
function distributionFoot(total: MetricTotals | undefined, pausedUntil: number | null): string {
  const paused = metricsPausedNote(pausedUntil, 'de')
  return reachStamp(total) + (paused ? `<div class="mt-2">${paused}</div>` : '')
}

export function distributionListPage(o: {
  user: User
  campaigns: DistributionRow[]
  /** Verbundene Accounts — ohne einen steht oben die Aufforderung zum Verbinden. */
  accounts: number
  /** Twitch/Snapchat aus seinem Profil — entscheidet, welcher Hinweis ohne Account oben steht. */
  manualPlatforms: ManualPlatform[]
  /** Warum der Creator hier gelandet ist, falls eine Kampagne nicht (mehr) verfügbar war. */
  notice?: string
  /**
   * Kampagnen, die er SCHNEIDET — auch das ist eine Zuordnung: mit einer
   * davon steht hier nicht mehr „NIKKI MEDIA wird dir in Kürze eine
   * Kampagne zuordnen.“, sondern nur, dass es zum Verbreiten noch nichts gibt.
   */
  cutAssignments: number
  /** Eigene Kampagnen — hat er eine, entfällt die Zeile „… zuordnen.“ ebenfalls. */
  ownCampaigns?: number
  /**
   * Seine Verbreitung über alle Kampagnen (`totalsForCreatorDistribution`) —
   * auch über solche, die ihm nicht mehr zugeordnet sind: was er gepostet hat,
   * läuft auf seinen Kanälen weiter.
   */
  total?: MetricTotals
  /** `metricsPausedUntil` — solange gesetzt, steht der Hinweis bei den Zahlen. */
  pausedUntil?: number | null
}): string {
  const cards = o.campaigns.map((c) =>
    campaignCard({
      href: distHref(c.id),
      name: c.name,
      thumb: c.thumb,
      eyebrow: `Zugewiesen am ${dateDE(c.joinedAt)}`,
      origin: { kind: 'assigned' },
      corner: rolePill('dist') + statusBadge(c.status),
      meta: [esc(clipCount(c.clips)), ...viewsMeta(c.metrics, 'Views deiner Posts', 'share')],
      footer: cardAction('Clips ansehen & freigeben', distHref(c.id), 'share'),
    }),
  )

  /* Wie bei den Kampagnen zum Bearbeiten: was es sonst an freigegebenen
     Kampagnen gibt, steht hier nicht — weder welche noch wie viele. Solange
     ihm gar nichts zugeordnet ist, steht hier „NIKKI MEDIA wird dir in
     Kürze eine Kampagne zuordnen.“ */
  const nothing = !o.campaigns.length && !o.cutAssignments && !o.ownCampaigns
  const showNumbers = o.campaigns.length > 0 || hasNumbers(o.total)
  const body =
    pageTitle(
      'Kampagnen verbreiten',
      'NIKKI MEDIA ordnet dir Kampagnen zum Verbreiten zu. Sieh dir die fertigen Clips an und stell die passenden mit einem Klick auf deine Kanäle.',
    ) +
    (o.notice ? flashBox({ error: o.notice }) : '') +
    pageError +
    accountsNotice(o.accounts, o.manualPlatforms) +
    (nothing ? assignBanner() : '') +
    (o.campaigns.length
      ? `<section>
          ${countHead('Dir zugewiesen', o.campaigns.length)}
          ${campaignGrid(cards)}
        </section>`
      : nothing
        ? ''
        : smallEmpty(
            'Noch keine Kampagne zum Verbreiten',
            'Sobald dir NIKKI MEDIA eine Kampagne zum Verbreiten zuordnet, erscheint sie hier, mit allen fertigen Clips.',
            linkBtn('Zu deinen Kampagnen', '/kampagnen', 'ghost'),
          )) +
    (showNumbers
      ? kpiLine('Deine Verbreitung insgesamt', reachKpis(o.total, 'de'), distributionFoot(o.total, o.pausedUntil ?? null))
      : '')

  return shell({
    title: 'Verbreiten',
    user: o.user,
    nav: CREATOR_NAV,
    active: '/kampagnen/verbreiten',
    body,
    script: `
(function () {${CLIENT_JS}

  /* Der Hinweis „steht nicht (mehr) zur Verbreitung bereit“ kommt über
     ?hinweis=weg. Er gilt für den einen Aufruf — bliebe der Zusatz in der
     Adresse, stünde der rote Kasten bei jedem Neuladen wieder da. */
  if (/[?&]hinweis=/.test(window.location.search) && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }
})();`,
  })
}

/** Ein fertiger Clip einer verbreiteten Kampagne, samt Freigabe dieses Creators. */
export interface DistributionClip {
  id: string
  filename: string
  caption: string | null
  createdAt: number
  /** NULL heißt: noch nicht freigegeben. */
  approval: {
    decidedAt: number
    publishStatus: string | null
    publishTargets: string | null
    manualPosts: string | null
  } | null
  /**
   * Was SEINE Posts dieses Clips erreicht haben (creatorId = er): die Summe
   * und eine Zeile je Account. Posts über die automatischen Ziele der
   * Kampagne oder über andere Creator gehören nicht hierher — die Accounts
   * dahinter gehen ihn nichts an.
   */
  metrics?: { totals?: MetricTotals; rows?: MetricRow[] }
}

/** Text für eine Freigabe, die er selbst postet — Abzeichen und Knopf nach dem Freigeben. */
const MANUAL_DONE = 'Freigegeben: poste selbst und trag den Link ein'

/**
 * Stand einer Freigabe als Abzeichen. Ohne Stand ist die Freigabe frisch und
 * der Versand läuft an.
 *
 * „Selbst posten“ (`PUBLISH_STATUS.manual`) ist kein Mangel, sondern der
 * vorgesehene Weg ohne Account: blau, mit dem, was jetzt zu tun ist.
 *
 * `manualOnly`: der Creator hat keinen verbindbaren Account, aber Twitch oder
 * Snapchat im Profil. Ältere Freigaben aus der Zeit vor „Selbst posten“
 * stehen dann auf „wartet auf verbundene Accounts“ — auch das wäre dort ein
 * Rätsel. `retrying`: gescheitert, aber der Nachhol-Lauf versucht es noch.
 */
function approvalBadge(status: string | null, o: { manualOnly?: boolean; retrying?: boolean } = {}): string {
  if (!status) return badge('Freigegeben: wird gesendet …', 'blue')
  if (status === PUBLISH_STATUS.manual || (status === PUBLISH_STATUS.waitingForAccounts && o.manualOnly)) {
    return badge(MANUAL_DONE, 'blue')
  }
  if (status === PUBLISH_STATUS.failed && o.retrying) return badge('Fehlgeschlagen: wird erneut versucht', 'amber')
  const raw = publishStatusLabel(status, 'de')
  const label = raw.charAt(0).toUpperCase() + raw.slice(1)
  switch (status) {
    case PUBLISH_STATUS.posted:
      return badge(label, 'green')
    case PUBLISH_STATUS.scheduled:
      return badge(label, 'blue')
    case PUBLISH_STATUS.partial:
    case PUBLISH_STATUS.waitingForAccounts:
      return badge(label, 'amber')
    default:
      return badge(label, 'red')
  }
}

/** Nur echte Web-Adressen werden zum Link — der Wert kommt vom Anbieter. */
const isWebUrl = (url: string | undefined): url is string => Boolean(url && /^https?:\/\//i.test(url))

/**
 * Stand je Account: draußen (mit Link), läuft, gescheitert (mit Grund).
 * Ein Wort für alle reicht nicht — Instagram draußen und TikTok abgelehnt ist
 * der Normalfall, nicht die Ausnahme.
 */
function targetList(raw: string | null): string {
  const lines = platformLines(raw)
  if (!lines.length) return ''
  return `<ul class="mt-2 space-y-1 text-xs">${lines
    .map((l) => {
      if (l.state === 'posted') {
        return `<li class="flex flex-wrap items-center gap-1.5 text-emerald-700"><span aria-hidden="true">&check;</span><span class="font-semibold">${esc(l.type)}</span>${
          isWebUrl(l.url)
            ? `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="underline decoration-dotted">ansehen</a>`
            : '<span class="text-emerald-600/80">veröffentlicht</span>'
        }</li>`
      }
      if (l.state === 'failed') {
        return `<li class="text-red-700"><span aria-hidden="true">&times;</span> <span class="font-semibold">${esc(l.type)}</span>${
          l.error ? `<span class="block pl-3.5 text-red-600/90">${esc(l.error)}</span>` : ''
        }</li>`
      }
      return `<li class="text-slate-500"><span aria-hidden="true">&hellip;</span> <span class="font-semibold">${esc(l.type)}</span> läuft</li>`
    })
    .join('')}</ul>`
}

/** Eingabe „Link zum Beitrag“ für eine Plattform ohne Schnittstelle. */
function manualField(clipId: string, platform: ManualPlatform, current: string | undefined): string {
  const label = platformLabel(platform)
  return `
                <div class="mt-3" data-manual-box>
                  <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600" for="m-${esc(clipId)}-${esc(platform)}">
                    ${platformLogo(platform, 14)} Link zum Beitrag auf ${esc(label)}
                  </label>
                  <div class="mt-1 flex gap-2">
                    <input id="m-${esc(clipId)}-${esc(platform)}" type="url" inputmode="url" maxlength="500" value="${esc(current ?? '')}"
                           placeholder="https://${platform === 'twitch' ? 'www.twitch.tv/…' : 'www.snapchat.com/…'}"
                           class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
                    <button type="button" data-manual="${esc(clipId)}" data-platform="${esc(platform)}"
                            class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-40">Speichern</button>
                  </div>
                  <p data-manual-msg class="mt-1 hidden text-xs font-medium"></p>
                  ${
                    current && isWebUrl(current)
                      ? `<a href="${esc(current)}" target="_blank" rel="noopener" class="mt-1 inline-block text-xs font-semibold text-brand hover:text-brand-2">Beitrag öffnen</a>`
                      : ''
                  }
                </div>`
}

/** Die vier Zahlen in der Reihenfolge der Leiste, mit ihrer Bezeichnung. */
const ROW_NUMBERS = [
  ['views', 'Views'],
  ['likes', 'Likes'],
  ['comments', 'Kommentare'],
  ['shares', 'Shares'],
] as const

/** Nur https wird zum Link — die Adresse kommt über Zernio von der Plattform. */
const isHttps = (url: string | null): url is string => Boolean(url && /^https:\/\//i.test(url))

/**
 * Seine Posts je Account — untereinander statt als Tabelle.
 *
 * Die Clip-Karte ist eine schmale Hochkant-Spalte (bis zu drei nebeneinander,
 * 260–330 px breit). Die Tabelle aus `metricRows` braucht für ihre fünf
 * Spalten rund 460 px; Kommentare und Shares lagen dann in einem Scrollbereich
 * der Karte. Hier steht je Account der Name — als Link zu seinem Beitrag, es
 * sind seine eigenen Posts —, darunter die vier Zahlen, die umbrechen dürfen.
 * Den Stand nennt die Leiste darüber.
 */
function accountNumbers(rows: MetricRow[]): string {
  return `<ul class="mt-2 divide-y divide-slate-200">${rows
    .map((r) => {
      const name = r.username ? `@${r.username.replace(/^@+/, '')}` : platformLabel(r.platform)
      const nameHtml = isHttps(r.url)
        ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="truncate font-semibold text-slate-700 hover:text-brand hover:underline">${esc(name)}</a>`
        : `<span class="truncate font-semibold text-slate-700">${esc(name)}</span>`
      const numbers = ROW_NUMBERS.map(([key, label]) => {
        const n = Number(r[key]) || 0
        return `<span title="${esc(`${label}: ${n.toLocaleString('de-DE')}`)}"><span class="font-semibold tabular-nums text-slate-800">${esc(
          formatCompact(n, 'de'),
        )}</span> ${esc(label)}</span>`
      }).join('')
      return `
                      <li class="py-1.5 text-xs">
                        <span class="flex min-w-0 items-center gap-1.5" title="${esc(platformLabel(r.platform))}">${platformLogo(r.platform, 14)}${nameHtml}</span>
                        <span class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">${numbers}</span>
                      </li>`
    })
    .join('')}</ul>`
}

/** Stände, nach denen ein Post draußen ist (oder gleich sein wird) — dort kommen Zahlen. */
const NUMBERS_EXPECTED = new Set<string>([PUBLISH_STATUS.posted, PUBLISH_STATUS.partial, PUBLISH_STATUS.scheduled])

/**
 * „Deine Zahlen“ unter einem freigegebenen Clip: Summe, darunter je Account
 * mit Link zum Beitrag — es sind seine eigenen Posts.
 *
 * Nur wo Zahlen da sind oder kommen werden. Eine Freigabe zum Selbstposten
 * (Twitch, Snapchat) oder eine, die auf Accounts wartet, hat keinen Post bei
 * Zernio; dort stünde „Noch keine Zahlen“ für immer.
 */
function clipNumbers(clip: DistributionClip, status: string | null): string {
  const rows = clip.metrics?.rows
  if (!rows?.length && !(status && NUMBERS_EXPECTED.has(status))) return ''
  return `
                  <div class="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                    ${metricStrip(clip.metrics?.totals, 'de', { label: 'Deine Zahlen' })}
                    ${rows?.length ? accountNumbers(rows) : ''}
                  </div>`
}

export function distributionCampaignPage(o: {
  user: User
  campaign: { id: string; name: string; status: string; createdAt: number }
  clips: DistributionClip[]
  /** Verbundene Accounts — ohne einen kann nichts gepostet werden. */
  accounts: number
  /** Twitch/Snapchat aus seinem Profil — dafür gibt es das Feld „Link zum Beitrag“. */
  manualPlatforms: ManualPlatform[]
  /** Mehr Clips, als die Seite zeigt. */
  truncated: boolean
  /** Seine Verbreitung in dieser Kampagne, über ALLE Clips — auch die, die die Seite nicht mehr zeigt. */
  total?: MetricTotals
  /** `metricsPausedUntil` — solange gesetzt, steht der Hinweis bei den Zahlen. */
  pausedUntil?: number | null
  /** Thumbnail der Kampagne — ohne Rohmaterial und Links, wenn er sie nur verbreitet. */
  thumb?: ThumbView
  /** Schneidet er die Kampagne auch? Dann führt ein Weg zu Rohmaterial und Upload. */
  cuts?: boolean
}): string {
  const c = o.campaign
  const active = c.status === 'aktiv'
  const back = `
      <a href="/kampagnen/verbreiten" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
        Alle Kampagnen zum Verbreiten
      </a>`

  /*
   * Kein verbindbarer Account, aber Twitch oder Snapchat im Profil: dann ist
   * Selbstposten der vorgesehene Weg (siehe „Meine Accounts“), kein Mangel.
   * Dieselbe Unterscheidung trifft die Freigabe-Route (creator-api.ts) — sie
   * hält die Freigabe dann als „Selbst posten“ fest und sendet nichts.
   */
  const manualOnly = !o.accounts && o.manualPlatforms.length > 0

  const cards = o.clips
    .map((clip) => {
      const a = clip.approval
      const posts = readManualPosts(a?.manualPosts)
      const canApprove = !a
      /*
       * „Jetzt posten“ nur für eine Freigabe auf „Selbst posten“, und erst,
       * wenn es einen Account gibt, auf den sie gehen kann. Dieser Stand
       * läuft NIE von allein (der Nachhol-Lauf lässt ihn liegen) — ohne den
       * Knopf käme der Clip nach dem Verbinden nie auf die neuen Kanäle.
       * Alle anderen Stände laufen ohnehin von selbst oder sind erledigt;
       * dort wäre ein Knopf nur Unruhe.
       */
      const canPostNow = Boolean(a && a.publishStatus === PUBLISH_STATUS.manual && o.accounts > 0)
      // Ohne verbindbaren Account wird nichts automatisch gepostet — dann
      // heißt der Knopf, was er tut: freigeben (für Download und Link).
      const approveLabel = manualOnly ? 'Freigeben' : 'Freigeben &amp; posten'

      const caption = clip.caption?.trim()
        ? `
                <p data-caption class="line-clamp-4 cursor-pointer whitespace-pre-line text-sm text-slate-700" title="Antippen für den ganzen Text">${esc(clip.caption.trim())}</p>
                <button type="button" data-copy="${esc(clip.caption.trim())}" class="mt-1.5 self-start text-xs font-semibold text-brand hover:text-brand-2">Text kopieren</button>`
        : '<p class="text-sm italic text-slate-400">Ohne Bildunterschrift</p>'

      const approvalBlock = a
        ? `
                <div class="mt-4 border-t border-slate-100 pt-3">
                  <div class="flex flex-wrap items-center gap-2">${approvalBadge(a.publishStatus, {
                    manualOnly,
                    retrying: publishStillRunning(a.publishStatus, a.publishTargets),
                  })}</div>
                  <p class="mt-1 text-xs text-slate-400">Freigegeben am ${esc(dateTimeDE(a.decidedAt))}</p>
                  ${
                    canPostNow
                      ? '<p class="mt-1 text-xs text-slate-500">Du hast inzwischen einen Account verbunden. Dieser Clip geht nicht von selbst dorthin, mit „Jetzt posten“ schon.</p>'
                      : ''
                  }
                  ${targetList(a.publishTargets)}
                  ${clipNumbers(clip, a.publishStatus)}
                  ${o.manualPlatforms.map((p) => manualField(clip.id, p, posts[p])).join('')}
                  <button type="button" data-download="${esc(clip.id)}" class="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-800">Clip herunterladen</button>
                </div>`
        : ''

      const approveButton = canApprove
        ? `
                <button type="button" data-approve="${esc(clip.id)}" ${active ? '' : 'disabled'}
                        data-done="${esc(manualOnly ? MANUAL_DONE : 'Freigegeben: wird gesendet …')}"
                        class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-2 disabled:opacity-40">${approveLabel}</button>
                <p data-approve-msg class="mt-2 hidden text-xs font-medium text-red-700"></p>`
        : canPostNow
          ? `
                <button type="button" data-post-now="${esc(clip.id)}" ${active ? '' : 'disabled'}
                        class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-2 disabled:opacity-40">Jetzt posten</button>
                <p data-approve-msg class="mt-2 hidden text-xs font-medium text-red-700"></p>`
          : ''

      return `
            <article class="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
              <div class="relative mx-auto aspect-[9/16] max-h-[70vh] w-full bg-gradient-to-b from-slate-800 to-slate-950" data-preview="${esc(clip.id)}">
                <button type="button" data-play class="group absolute inset-0 grid w-full place-items-center text-white transition" aria-label="Clip abspielen">
                  <span class="grid h-16 w-16 place-items-center rounded-full bg-black/40 shadow-lg ring-1 ring-white/30 backdrop-blur transition group-hover:scale-110 group-hover:bg-brand">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="ml-1 h-8 w-8"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>
                  </span>
                </button>
              </div>
              <div class="flex flex-1 flex-col p-4">
                ${caption}
                <p class="mt-2 text-xs text-slate-400">Fertig seit ${esc(dateDE(clip.createdAt))}</p>
                ${approvalBlock}
                <div class="mt-auto">${approveButton}</div>
              </div>
            </article>`
    })
    .join('')

  /*
   * Freigaben, bei denen noch etwas läuft — dann lohnt der Knopf zum
   * Nachsehen. Abgeleitet aus den Zielen, nicht aus dem Sammelstatus:
   * „teilweise veröffentlicht“ kann endgültig sein, „fehlgeschlagen“ noch
   * einen Nachschuss vor sich haben (siehe `publishStillRunning`).
   */
  const pending = o.clips.some(
    (clip) => clip.approval && publishStillRunning(clip.approval.publishStatus, clip.approval.publishTargets),
  )

  /* Kopf wie auf der Kampagnenseite zum Schneiden: großes Thumbnail, die
     Zahlen nur als schmale Zeile. „Freigegeben“ zählt die gezeigten Clips. */
  const approved = o.clips.filter((clip) => clip.approval).length
  const hero = campaignHero({
    thumb: o.thumb,
    name: c.name,
    eyebrow: originBadge('assigned') + rolePill('dist') + (o.cuts ? rolePill('cut') : '') + statusBadge(c.status),
    subtitle: 'Sieh dir die Clips an und gib frei, was auf deine Kanäle soll. Jeder Clip geht erst nach deiner Freigabe raus.',
    kpis:
      kpiBar([
        { value: `${o.clips.length.toLocaleString('de-DE')}${o.truncated ? '+' : ''}`, label: o.clips.length === 1 ? 'fertiger Clip' : 'fertige Clips' },
        { value: approved.toLocaleString('de-DE'), label: 'freigegeben' },
        ...reachKpis(o.total, 'de'),
      ], 'w-fit max-w-full') + distributionFoot(o.total, o.pausedUntil ?? null),
    actions: o.cuts ? linkBtn('Rohmaterial & Upload', cutHref(c.id), 'ghost') : '',
  })

  const body =
    back +
    hero +
    pageError +
    (active
      ? ''
      : noticeBox(
          c.status === 'pausiert' ? 'Diese Kampagne ist pausiert' : 'Diese Kampagne ist beendet',
          'Neue Freigaben sind gerade nicht möglich. Was du schon freigegeben hast, siehst du weiterhin hier.',
        )) +
    accountsNotice(o.accounts, o.manualPlatforms) +
    (pending
      ? `
      <p class="mb-4 text-sm text-slate-500">Der Versand läuft im Hintergrund. <a href="" class="font-semibold text-brand hover:text-brand-2">Stand aktualisieren</a></p>`
      : '') +
    (o.clips.length
      ? `${countHead('Fertige Clips', o.clips.length)}
      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${cards}
      </div>${
        o.truncated
          ? '<p class="mt-5 text-sm text-slate-500">Hier stehen die neuesten Clips dieser Kampagne.</p>'
          : ''
      }`
      : emptyState(
          'Noch kein fertiger Clip',
          'Sobald die Clipper die ersten Clips dieser Kampagne fertig haben, stehen sie hier, und du bekommst eine E-Mail.',
        ))

  return shell({
    title: c.name,
    user: o.user,
    nav: CREATOR_NAV,
    active: '/kampagnen/verbreiten',
    body,
    script: `
(function () {${CLIENT_JS}

  /* ---- Vorschau ----
     Die Adresse kommt erst, wenn ein Clip in Sicht kommt (oder angetippt
     wird) — nicht für alle beim Laden. Sie gilt nur kurz; scheitert das
     Abspielen später daran, holt das Video sich einmal eine neue. */
  function loadPreview(box, play) {
    if (box.getAttribute('data-state')) {
      var existing = box.querySelector('video');
      if (play && existing) existing.play().catch(function () {});
      return;
    }
    box.setAttribute('data-state', 'loading');
    var id = box.getAttribute('data-preview');
    var retried = false;
    function fetchUrl() { return send('/api/creator/clips/' + encodeURIComponent(id) + '/preview', 'GET'); }
    fetchUrl()
      .then(function (d) {
        var video = document.createElement('video');
        video.className = 'absolute inset-0 h-full w-full bg-black object-contain';
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        if (d.poster) video.poster = d.poster;
        // Ohne Vorschaubild zeigt Safari bis zum Abspielen nur Schwarz; der
        // Sprung auf 0,1 s holt das erste Bild. Das Fragment geht nicht mit
        // zum Server, die Signatur bleibt gültig.
        video.src = d.poster ? d.url : d.url + '#t=0.1';
        video.addEventListener('error', function () {
          if (retried) return;
          retried = true;
          var wasPlaying = !video.paused;
          fetchUrl().then(function (n) { video.src = n.url; if (wasPlaying || play) video.play().catch(function () {}); });
        });
        box.innerHTML = '';
        box.appendChild(video);
        box.setAttribute('data-state', 'ready');
        if (play) video.play().catch(function () {});
      })
      .catch(function (e) {
        box.removeAttribute('data-state');
        if (play) showError(e.message);
      });
  }
  var boxes = document.querySelectorAll('[data-preview]');
  boxes.forEach(function (box) {
    var btn = box.querySelector('[data-play]');
    if (btn) btn.addEventListener('click', function () { loadPreview(box, true); });
  });
  if ('IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        seen.unobserve(entry.target);
        loadPreview(entry.target, false);
      });
    }, { rootMargin: '200px' });
    boxes.forEach(function (box) { seen.observe(box); });
  }

  /* ---- Bildunterschrift ---- */
  document.querySelectorAll('[data-caption]').forEach(function (p) {
    p.addEventListener('click', function () { p.classList.toggle('line-clamp-4'); });
  });
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () { btn.textContent = ${jsonScript('Kopiert')}; setTimeout(function () { btn.textContent = ${jsonScript('Text kopieren')}; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { window.prompt(${jsonScript('Text kopieren:')}, text); });
      } else {
        window.prompt(${jsonScript('Text kopieren:')}, text);
      }
    });
  });

  /* ---- Freigeben & posten / Jetzt posten ----
     Der Knopf bleibt nach Erfolg gesperrt: die Seite lädt kurz darauf neu
     und zeigt den Stand je Account. Ein zweiter Klick davor geht ins Leere —
     und schadete auch auf der Gegenseite nicht, die Sperren gegen
     Doppelposts liegen im Versand. */
  function clipAction(btn, path, busyText, doneText, delay) {
    var msg = btn.parentNode.querySelector('[data-approve-msg]');
    btn.addEventListener('click', function () {
      if (!busy(btn, busyText)) return;
      hideError();
      if (msg) msg.classList.add('hidden');
      send('/api/creator/clips/' + encodeURIComponent(btn.getAttribute(path[0])) + path[1], 'POST')
        .then(function (d) {
          btn.textContent = doneText(d);
          setTimeout(function () { window.location.reload(); }, delay);
        })
        .catch(function (e) {
          idle(btn);
          if (!msg) { showError(e.message); return; }
          msg.textContent = e.message + ' ';
          if (e.data && e.data.connect) {
            var link = document.createElement('a');
            link.href = e.data.connect;
            link.className = 'font-semibold underline';
            link.textContent = ${jsonScript('Zu „Meine Accounts“')};
            msg.appendChild(link);
          }
          msg.classList.remove('hidden');
        });
    });
  }
  document.querySelectorAll('[data-approve]').forEach(function (btn) {
    // Ob er selbst postet, weiß der Server am besten (Accounts können sich
    // seit dem Laden der Seite geändert haben) — sonst gilt data-done.
    clipAction(btn, ['data-approve', '/approve'], ${jsonScript('Wird freigegeben …')}, function (d) {
      return d && d.manual ? ${jsonScript(MANUAL_DONE)} : (btn.getAttribute('data-done') || ${jsonScript('Freigegeben: wird gesendet …')});
    }, 2500);
  });
  document.querySelectorAll('[data-post-now]').forEach(function (btn) {
    // Die Route wartet den Versand ab — die Seite kann gleich neu laden.
    clipAction(btn, ['data-post-now', '/post'], ${jsonScript('Wird gesendet …')}, function () {
      return ${jsonScript('Erledigt: Stand wird geladen …')};
    }, 600);
  });

  /* ---- Link zum Beitrag (Twitch, Snapchat) ---- */
  document.querySelectorAll('[data-manual]').forEach(function (btn) {
    var box = btn.closest('[data-manual-box]');
    var input = box.querySelector('input');
    var msg = box.querySelector('[data-manual-msg]');
    function save() {
      if (!busy(btn, ${jsonScript('Speichert …')})) return;
      msg.classList.add('hidden');
      send('/api/creator/clips/' + encodeURIComponent(btn.getAttribute('data-manual')) + '/manual', 'PUT', {
        platform: btn.getAttribute('data-platform'),
        url: input.value
      })
        .then(function (d) {
          idle(btn);
          input.value = d.url || '';
          msg.textContent = d.url ? ${jsonScript('Gespeichert.')} : ${jsonScript('Entfernt.')};
          msg.className = 'mt-1 text-xs font-medium text-emerald-700';
        })
        .catch(function (e) {
          idle(btn);
          msg.textContent = e.message;
          msg.className = 'mt-1 text-xs font-medium text-red-700';
        });
    }
    btn.addEventListener('click', save);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  });

  /* ---- Herunterladen — für Plattformen, auf die er selbst postet ---- */
  document.querySelectorAll('[data-download]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!busy(btn, ${jsonScript('Einen Moment …')})) return;
      send('/api/creator/clips/' + encodeURIComponent(btn.getAttribute('data-download')) + '/preview?download=1', 'GET')
        .then(function (d) { idle(btn); window.location.href = d.url; })
        .catch(function (e) { idle(btn); showError(e.message); });
    });
  });
})();`,
  })
}

/* ------------------------------------------------- Noch nicht eingerichtet */

/**
 * Für einen Creator fehlt eine der drei Zeilen (creators, customers,
 * clippers) — normalerweise legt der Selbsteintrag alle zusammen an. Statt
 * eines Fehlers steht hier eine ruhige Seite; das versteckte Feld meldet nur
 * die Creator-Sitzung ab, eine zweite Sitzung im selben Browser bleibt.
 */
export const settingUpPage = (): string => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Kampagnen-Bereich wird eingerichtet | Nikki Media</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/tw.css"></head>
<body class="grid min-h-screen place-items-center bg-black p-6 text-center font-sans text-white">
  <div>
    <h1 class="text-2xl font-bold">Dein Kampagnen-Bereich wird gerade eingerichtet</h1>
    <p class="mx-auto mt-2 max-w-sm text-slate-400">Dein Zugang steht, nur dein Kampagnen-Bereich ist noch nicht ganz fertig. Schau in ein paar Minuten wieder vorbei, falls es dann noch hakt, meldet sich Jason bei dir.</p>
    <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
      <a href="/kampagnen" class="rounded-xl bg-[#2fe08c] px-5 py-2.5 font-semibold text-[#02160c] hover:bg-[#5eeaa6]">Neu laden</a>
      <form method="post" action="/logout"><input type="hidden" name="area" value="creator"><button class="rounded-xl border border-white/20 px-5 py-2.5 font-semibold text-slate-200 hover:bg-white/10">Abmelden</button></form>
    </div>
  </div>
</body></html>`
