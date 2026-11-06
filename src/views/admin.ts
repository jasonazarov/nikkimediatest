import {
  ADMIN_NAV,
  badge,
  btn,
  campaignCard,
  originBadge,
  type CampaignOrigin,
  campaignGrid,
  campaignThumb,
  card,
  dateEN,
  dateTimeEN,
  emptyState,
  esc,
  formatEuro,
  formatViews,
  jsonScript,
  kpiBar,
  pageTitle,
  payTierTable,
  sectionHead,
  shell,
  thumbUploadButtons,
  viewsSection,
  type Kpi,
  type PayTierView,
  type ThumbView,
  quickActions,
} from './layout'
import { formatBytes } from '../lib/r2'
import { dialOptions, formatPhone, splitPhone, telHref } from '../lib/phone'
import {
  CREATOR_PLATFORMS,
  LEAD_STATUS,
  PAY_TIERS_MAX,
  adOpennessLabel,
  availabilityLabel,
  creatorGoalLabel,
  creatorPlatformLabel,
  experienceLabel,
  followersLabel,
  footageLabel,
  linkHost,
  platformLabel,
  views30dLabel,
  viewsTotalLabel,
  workStatusLabel,
  type TeamMember,
} from '../lib/domain'
import { CONNECTABLE, PLATFORM_LABEL, PUBLISH_STATUS, platformLines, publishStatusLabel } from '../lib/publisher'
import { formatCompact, metricStrip, metricsPausedNote } from './metrics'
import type { MetricRow, MetricTotals, MetricTotalsWithCreators, SyncOverview } from '../lib/metrics'
import type { Lead, Role, User } from '../db/schema'
import { agencyPackageLabel, agencyPlatformLabel, pricePerThousandCents, viewsShort, type Briefing } from '../lib/agency'

/*
 * Administration — englisch, wie der ganze Admin-Bereich (siehe `langFor`
 * in layout.ts).
 *
 * Linie seit Oktober 2026: Kennzahlen stehen KLEIN in einer schmalen Zeile
 * (`kpiBar`), groß ist, woran gearbeitet wird — Kampagnen als Karten mit
 * Thumbnail, Clips und Rohmaterial als große Kacheln. Was früher „Project“
 * hieß, heißt in der Oberfläche „Campaign“; die Adressen (/admin/projekte)
 * und die gespeicherten Werte bleiben, wie sie sind.
 *
 * Jede Kampagne hat ein TEAM aus beliebig vielen Clippern und Creatorn
 * (`project_workers` für den Schnitt, `campaign_creators` für die
 * Verbreitung). Zusammengestellt wird es ausschließlich hier.
 */
/*
 * Die gespeicherten Werte (LEAD_STATUS, Kampagnen- und Clipper-Status)
 * bleiben deutsch — sie stecken tief in domain.ts, api.ts und auth.ts. Nur
 * die Anzeige hier wird übersetzt, damit an der Datenbank und der
 * Geschäftslogik nichts angefasst werden muss.
 */
const STATUS_TONE: Record<string, 'blue' | 'green' | 'grey' | 'amber' | 'red'> = {
  Neu: 'blue',
  Kontaktiert: 'amber',
  'Nicht erreicht': 'grey',
  'Termin vereinbart': 'amber',
  'Angebot raus': 'amber',
  Gewonnen: 'green',
  Abgelehnt: 'red',
  Verloren: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  Neu: 'New',
  Kontaktiert: 'Contacted',
  'Nicht erreicht': 'Unreachable',
  'Termin vereinbart': 'Meeting booked',
  'Angebot raus': 'Proposal sent',
  Gewonnen: 'Won',
  Abgelehnt: 'Declined',
  Verloren: 'Lost',
}
const statusLabel = (s: string) => STATUS_LABEL[s] ?? s

const PROJECT_STATUS_LABEL: Record<string, string> = {
  aktiv: 'Active',
  pausiert: 'Paused',
  beendet: 'Ended',
}
const projectStatusLabel = (s: string) => PROJECT_STATUS_LABEL[s] ?? s

/* „eingeladen“ heißt: noch nie eingeloggt. Angezeigt als „Pending“, weil
   „Invited“ schon die Herkunft benennt (Einladung statt Selbsteintrag) —
   zweimal dasselbe Wort in einer Zeile mit zwei Bedeutungen wäre ein Rätsel. */
const CLIPPER_STATUS_LABEL: Record<string, string> = {
  aktiv: 'Active',
  eingeladen: 'Pending',
}
const clipperStatusLabel = (s: string) => CLIPPER_STATUS_LABEL[s] ?? s

/**
 * Die vier personenbezogenen Felder — Name, Firma, Adresse, Telefon.
 *
 * Sie stehen an drei Stellen (Lead, Kunde, Kampagnenseite) und müssen überall
 * dasselbe können. Einmal geschrieben, dreimal benutzt: `prefix` hält die
 * IDs auseinander, wenn zwei Formulare auf derselben Seite liegen.
 */
export function contactFields(prefix: string, v: {
  fullName?: string
  company?: string | null
  email?: string
  phone?: string | null
} = {}): string {
  const field = (key: string, label: string, type: string, value: string, hint = '') => `
          <label class="mt-3 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">${esc(label)}</span>
            <input id="${prefix}-${key}" type="${type}" value="${esc(value)}" maxlength="190"
                   class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
            ${hint ? `<span class="mt-1 block text-xs text-slate-400">${esc(hint)}</span>` : ''}
          </label>`

  /*
   * Das Telefon steht in ZWEI Feldern: Ländervorwahl und Nummer.
   *
   * Der Grund steht am Anrufknopf: Eine Nummer ohne Ländervorwahl lässt sich
   * vom Handy aus nicht wählen. Getrennt erfasst kann die Vorwahl nicht mehr
   * fehlen — und sie kann auch nicht mehr in der Nummer versacken („0043“,
   * „0 676“, „+43 0676“ standen früher alle nebeneinander in der Datenbank).
   */
  const { dial, national } = splitPhone(v.phone)
  const phoneField = `
          <div class="mt-3">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Phone</span>
            <div class="flex gap-2">
              <select id="${prefix}-dial" aria-label="Country code"
                      class="w-36 shrink-0 rounded-xl border border-slate-300 bg-white px-2 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
                ${dialOptions(dial, 'en')}
              </select>
              <input id="${prefix}-phone" type="tel" value="${esc(national)}" maxlength="40" inputmode="numeric"
                     class="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
            </div>
            <span class="mt-1 block text-xs ${
              // Genau die Nummern aus der Zeit vor der Trennung — sie sind vom
              // Handy aus nicht wählbar, solange niemand die Vorwahl nachträgt.
              national && !dial ? 'font-semibold text-amber-600' : 'text-slate-400'
            }">${
              national && !dial
                ? 'No country code stored, pick one, otherwise the call button dials nothing.'
                : 'Number without the leading zero, the country code is on the left.'
            }</span>
          </div>`

  return (
    field('name', 'Name', 'text', v.fullName ?? '') +
    field('company', 'Company', 'text', v.company ?? '', 'Optional.') +
    field('email', 'Email', 'email', v.email ?? '', 'This is also the login address.') +
    phoneField
  )
}

/**
 * Die Telefonnummer als Anrufknopf — überall dort, wo sie im Admin-Bereich
 * steht. Ohne Nummer bleibt es bei einem Strich statt eines toten Links.
 */
export const phoneLink = (phone: string | null | undefined, extra = ''): string => {
  const href = telHref(phone)
  if (!href) return '<span class="text-slate-400">–</span>'
  return `<a href="tel:${esc(href)}" class="${extra}">${esc(formatPhone(phone))}</a>`
}

/** „3 self sign-ups in the last 7 days“ — Übersicht und Clipper-Seite sagen es gleich. */
const signupHint = (n: number) => `${n} self sign-up${n === 1 ? '' : 's'} in the last 7 days`

/* --------------------------------------------------------------------------
   Echte Zahlen aus Zernio — was nur die Administration dazu sieht

   Die Bausteine selbst (Leiste, Tabelle, Kacheln) stehen in views/metrics.ts
   und sind für alle Bereiche dieselben. Hier kommt dazu, was nur hier steht:
   der Stand des Abgleichs und der Knopf „Refresh numbers“.
   -------------------------------------------------------------------------- */

/**
 * Wie es um den Abgleich steht: wie viele Posts im Zeitplan stehen, wie der
 * letzte Abruf je Post ausging und wann zuletzt überhaupt gefragt wurde.
 *
 * „unknown“ (Zernio kennt den Post nicht) steht getrennt von „failed“ (auf
 * der Plattform gescheitert) — das eine ist ein Fall für Zernio, das andere
 * einer für den Account. Nullen bleiben weg, sie sagen nichts.
 */
function syncSummary(s: SyncOverview, scope: 'all' | 'project'): string {
  if (!s.total) {
    return `<p class="text-xs text-slate-400">${
      scope === 'all'
        ? 'No posts tracked yet, they join the schedule within an hour of being published.'
        : 'No posts of this campaign tracked yet, they join the schedule within an hour of being published, or right away with “Refresh numbers”.'
    }</p>`
  }
  const parts = [
    s.ok ? badge(`${s.ok} ok`, 'green') : '',
    s.pending ? `<span title="Never asked yet, or Zernio is still collecting the numbers.">${badge(`${s.pending} pending`, 'blue')}</span>` : '',
    s.failed ? `<span title="Publishing failed on every platform, there is nothing to count.">${badge(`${s.failed} failed`, 'red')}</span>` : '',
    s.unknown ? `<span title="Zernio does not know this post (404).">${badge(`${s.unknown} unknown`, 'grey')}</span>` : '',
  ].join('')
  return `<div class="flex flex-wrap items-center gap-1.5">${parts}</div>
          <p class="mt-1.5 text-[11px] text-slate-400">${s.total} ${s.total === 1 ? 'post' : 'posts'} tracked · Last fetch ${esc(
            dateTimeEN(s.lastAt),
          )}</p>`
}

/**
 * Der 402-Hinweis über einer Liste mit Zahlen — leer, solange der Abgleich
 * läuft. Clipper- und Creator-Liste zeigen Reichweite wie die Kampagnen; ohne
 * ihn sähen eingefrorene Zahlen dort aus wie frische.
 */
const pausedBox = (until: number | null | undefined) => {
  const note = metricsPausedNote(until ?? null, 'en', { admin: true })
  return note ? `<div class="mb-5">${note}</div>` : ''
}

/** Der Knopf „Refresh numbers“ — Verhalten in `REFRESH_METRICS_SCRIPT`. */
const refreshMetricsButton = (projectId: string, label: string) =>
  `<button type="button" data-refreshmetrics="${esc(projectId)}" aria-label="${esc(`Refresh numbers of ${label}`)}"
                  title="Ask Zernio for this campaign's numbers right now instead of waiting for the next scheduled run"
                  class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60">Refresh numbers</button>`

/**
 * „Refresh numbers“ auf der Kampagnenseite.
 *
 * Doppeltipp-Schutz: Ein Klick sperrt ALLE Knöpfe dieser Art, bis die Antwort
 * da ist und die Seite neu lädt. Sonst bräche das Neuladen nach dem ersten
 * Abgleich einen zweiten mittendrin ab. Doppelt abgefragt würde
 * ohnehin nichts — der Server belegt die Posts, die er fragt, und fragt
 * nichts aus den letzten fünf Minuten —, aber ein zweiter Klick soll gar
 * nicht erst eine leere Runde drehen.
 *
 * Das Ergebnis steht kurz im Knopf, dann lädt die Seite mit den neuen Zahlen.
 */
const REFRESH_METRICS_SCRIPT = `
(function () {
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-refreshmetrics]'));
  var busy = false;
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      buttons.forEach(function (b) { b.disabled = true; });
      btn.textContent = 'Refreshing \\u2026';
      fetch('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-refreshmetrics')) + '/metrics/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'Refreshing the numbers failed.');
          return d;
        });
      }).then(function (d) {
        btn.textContent = d.paused
          ? 'Zernio returned 402 \\u2014 paused'
          : d.fetched
            ? d.fetched + ' fetched \\u00b7 ' + (d.updated || 0) + ' updated'
            : d.tracked === 0
              ? 'No posts of this campaign yet'
              : 'Nothing due \\u2014 asked within the last minutes';
        window.setTimeout(function () { window.location.reload(); }, 1200);
      }).catch(function (e) {
        window.alert(e.message);
        busy = false;
        buttons.forEach(function (b) { b.disabled = false; });
        btn.textContent = 'Refresh numbers';
      });
    });
  });
})();`

/*
 * `kpiBar` aus layout.ts mit richtiger Einzahl: „1 campaign“ statt
 * „1 campaigns“. Die Beschriftungen stehen hier in der Mehrzahl; bei genau
 * einem Stück nimmt die Leiste die Einzahl aus dieser Liste.
 */
const SINGULAR: Record<string, string> = {
  Campaigns: 'Campaign',
  'Active campaigns': 'Active campaign',
  'Own campaigns': 'Own campaign',
  'Campaigns cut': 'Campaign cut',
  'Campaigns distributed': 'Campaign distributed',
  Files: 'File',
  Folders: 'Folder',
  'Cloud links': 'Cloud link',
  Clips: 'Clip',
  'Clips delivered': 'Clip delivered',
  'Clips published': 'Clip published',
  Customers: 'Customer',
  Clippers: 'Clipper',
  Creators: 'Creator',
  'New leads': 'New lead',
  Posts: 'Post',
  Accounts: 'Account',
  Enquiries: 'Enquiry',
  'Uploads today': 'Upload today',
  'Sign-ups': 'Sign-up',
  Views: 'View',
  Likes: 'Like',
  Comments: 'Comment',
  Shares: 'Share',
}
const kpis = (items: Kpi[], extra = '') =>
  kpiBar(
    items.map((k) => (k.value === '1' && SINGULAR[k.label] ? { ...k, label: SINGULAR[k.label] } : k)),
    extra,
  )

/* ==========================================================================
   0 — BAUSTEINE FÜR KAMPAGNEN, TEAMS UND PERSONEN

   Was mehrere Seiten gleich zeigen: die Kampagnenkarte (Übersicht,
   Kampagnenliste, Kunde, Profile), die Team-Chips und die Avatare.
   ========================================================================== */

const statusTone = (s: string): 'green' | 'amber' | 'grey' =>
  s === 'aktiv' ? 'green' : s === 'pausiert' ? 'amber' : 'grey'
const statusBadge = (s: string) => badge(projectStatusLabel(s), statusTone(s))

/** „Campaign“ / „Campaigns“ samt Zahl — die Oberfläche sagt nirgends mehr „project“. */
const campaignsLabel = (n: number) => `${n} ${n === 1 ? 'campaign' : 'campaigns'}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Wem eine Kampagne gehört — ein Kunde oder ein Creator mit eigener Kampagne. */
export interface CampaignOwner {
  customerId: string
  userId: string
  role: Role
  /** Firma, sonst Name. */
  label: string
  fullName: string
  email: string
  /** Wohin der Name führt — Kunde oder Creator-Profil. */
  href: string
}

/**
 * Eine Kampagne, wie sie Karten und Listen im Admin-Bereich brauchen —
 * gebaut in routes/admin.ts (`campaignSummaries`), für viele Kampagnen in
 * wenigen gruppierten Abfragen.
 */
export interface AdminCampaign {
  id: string
  name: string
  status: string
  createdAt: number
  owner: CampaignOwner
  thumb: ThumbView
  /** Alle, die daran arbeiten — schneiden und/oder verbreiten. */
  team: TeamMember[]
  /** Fertig hochgeladene Dateien ohne Papierkorb, und ihre Größe. */
  files: number
  bytes: number
  links: number
  /** Fertige Clips. */
  clips: number
  /** Bis zu drei Dateinamen, neueste zuerst — die Vorschau auf der Karte. */
  fileNames: string[]
  /** Die Anbieter der Cloud-Links (bis zu zwei), älteste zuerst. */
  linkHosts: string[]
  creatorDistribution: boolean
  publishError: string | null
}

/** Nutzer-ID → Profil im Admin-Bereich (`/admin/clipper/…` bzw. `/admin/creator/…`). */
export type ProfileLinks = Map<string, string>

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '·'

/*
 * Clipper violett, Creator pink — dieselben Farben wie ihre Landingpages
 * (/clipper, /creator). So sind beide im Team auf einen Blick zu trennen.
 */
const ROLE_STYLE = {
  clipper: { chip: 'bg-violet-50 text-violet-900 ring-violet-200', dot: 'bg-violet-600', label: 'Clipper' },
  creator: { chip: 'bg-pink-50 text-pink-900 ring-pink-200', dot: 'bg-pink-600', label: 'Creator' },
} as const

const avatar = (name: string, role: 'clipper' | 'creator', size = 'h-6 w-6 text-[10px]') =>
  `<span class="grid ${size} shrink-0 place-items-center rounded-full ${ROLE_STYLE[role].dot} font-bold text-white" aria-hidden="true">${esc(
    initialsOf(name),
  )}</span>`

const SCISSORS_PATH = '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'
const MEGAPHONE_PATH = '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'
const glyph = (path: string, cls = 'h-3.5 w-3.5') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls} shrink-0" aria-hidden="true">${path}</svg>`
const FILM_PATH = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'
const LINK_PATH = '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'

/** Was jemand in einer Kampagne tut — als Text für Tooltips und Screenreader. */
const roleWords = (m: { role: 'clipper' | 'creator'; cuts: boolean; distributes: boolean }) =>
  [ROLE_STYLE[m.role].label, m.cuts ? 'cuts' : '', m.distributes ? 'distributes' : ''].filter(Boolean).join(' · ')

/**
 * Ein Mitglied als kleiner Chip: Avatar, Name, Schere fürs Schneiden,
 * Megafon fürs Verbreiten. Mit Profil-Adresse wird der Chip zum Link.
 */
function teamChip(m: TeamMember, href?: string): string {
  const inner = `${avatar(m.name, m.role)}
            <span class="max-w-[9rem] truncate">${esc(m.name)}</span>
            ${m.cuts ? glyph(SCISSORS_PATH) : ''}${m.distributes ? glyph(MEGAPHONE_PATH) : ''}
            <span class="sr-only">(${esc(roleWords(m))})</span>`
  const cls = `inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold ring-1 ring-inset ${ROLE_STYLE[m.role].chip}`
  return href
    ? `<a href="${esc(href)}" title="${esc(`${m.name} · ${roleWords(m)}`)}" class="${cls} transition hover:brightness-95">${inner}</a>`
    : `<span title="${esc(`${m.name} · ${roleWords(m)}`)}" class="${cls}">${inner}</span>`
}

/** Die Legende zu den Chips — einmal je Seite, über den Karten. */
const teamLegend = () => `
        <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full ${ROLE_STYLE.clipper.dot}"></span>Clipper</span>
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full ${ROLE_STYLE.creator.dot}"></span>Creator</span>
          <span class="inline-flex items-center gap-1">${glyph(SCISSORS_PATH)}cuts</span>
          <span class="inline-flex items-center gap-1">${glyph(MEGAPHONE_PATH)}distributes</span>
        </p>`

/** Die Rolle als Abzeichen — „Clipper“ violett, „Creator“ pink. */
const roleBadge = (role: 'clipper' | 'creator') =>
  `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${ROLE_STYLE[role].chip}">${ROLE_STYLE[role].label}</span>`

/** „Cuts“ / „Distributes“ als Abzeichen mit Glyphe. */
const doesBadge = (what: 'cuts' | 'distributes') =>
  `<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">${glyph(
    what === 'cuts' ? SCISSORS_PATH : MEGAPHONE_PATH,
  )}${what === 'cuts' ? 'Cuts' : 'Distributes'}</span>`

/** Material einer Kampagne in einer Zeile — „14 files · 1.6 GB“ usw. */
const filesLabel = (c: { files: number; bytes: number }) =>
  c.files ? `${plural(c.files, 'file', 'files')} · ${formatBytes(c.bytes)}` : 'No files'

/**
 * Was in der Kampagne liegt, als kleine Vorschau unter der Karte: bis zu
 * drei Dateinamen und zwei Cloud-Anbieter. Ist es mehr, führt „See all“
 * direkt auf die Kampagne, zum Material.
 */
function materialPreview(c: AdminCampaign): string {
  if (!c.files && !c.links) {
    return `<p class="text-xs text-slate-400">No footage or cloud link yet.</p>`
  }
  const items = [
    ...c.fileNames.map(
      (n) => `<li class="flex min-w-0 items-center gap-1.5">${glyph(FILM_PATH, 'h-3.5 w-3.5 text-slate-400')}<span class="truncate">${esc(n)}</span></li>`,
    ),
    ...c.linkHosts.map(
      (h) => `<li class="flex min-w-0 items-center gap-1.5">${glyph(LINK_PATH, 'h-3.5 w-3.5 text-brand')}<span class="truncate font-medium text-slate-700">${esc(h)}</span></li>`,
    ),
  ].join('')
  const more = c.files > c.fileNames.length || c.links > c.linkHosts.length
  return `<ul class="space-y-0.5 text-xs text-slate-600">${items}</ul>
            ${
              more
                ? `<a href="/admin/projekte/${esc(c.id)}#material" class="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">See all: ${esc(
                    [c.files ? plural(c.files, 'file', 'files') : '', c.links ? plural(c.links, 'link', 'links') : ''].filter(Boolean).join(' · '),
                  )} →</a>`
                : ''
            }`
}

/** Das Team unter der Karte — oder der deutliche Hinweis, dass noch keins da ist. */
function teamPreview(c: AdminCampaign, links: ProfileLinks): string {
  if (!c.team.length) {
    return `<a href="/admin/projekte/${esc(c.id)}#team"
               class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4 shrink-0" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></svg>
              No team yet · assign when ready
            </a>`
  }
  return `<div class="flex flex-wrap gap-1.5">${c.team.map((m) => teamChip(m, links.get(m.userId))).join('')}</div>`
}

/**
 * Die Kampagne als große Karte — von wem sie kommt, Status, Material, Team.
 * `extra` steht ganz unten in der Karte (z. B. Rolle und „Remove“ auf einem
 * Profil), außerhalb des Links.
 */
/**
 * `origin`: Herkunft aus Sicht der Seite. Ohne Angabe trägt die eigene
 * Kampagne eines Creators „Creator's own“; im Profil eines Clippers oder
 * Creators heißt eine Team-Kampagne „Assigned“ — damit eigene und
 * zugewiesene Kampagnen nie verwechselt werden (Vorgabe des Auftraggebers).
 */
function adminCampaignCard(
  c: AdminCampaign,
  links: ProfileLinks,
  extra = '',
  origin: CampaignOrigin | null = c.owner.role === 'creator' ? 'own' : null,
): string {
  return campaignCard({
    href: `/admin/projekte/${c.id}`,
    name: c.name,
    thumb: c.thumb,
    origin: origin ? { kind: origin, lang: 'en' } : undefined,
    eyebrow: c.owner.role === 'creator' ? `Creator: ${c.owner.fullName}` : c.owner.label,
    corner:
      statusBadge(c.status) +
      (c.publishError ? `<span title="${esc(c.publishError)}">${badge('Connection failed', 'red')}</span>` : ''),
    meta: [
      `Created ${esc(dateEN(c.createdAt))}`,
      esc(filesLabel(c)),
      esc(plural(c.links, 'cloud link', 'cloud links')),
      esc(plural(c.clips, 'clip', 'clips')),
    ],
    footer: `
            <div class="space-y-3">
              <div>
                <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Team</p>
                ${teamPreview(c, links)}
              </div>
              <div class="rounded-xl bg-slate-50 px-3 py-2.5">
                <p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Material</p>
                ${materialPreview(c)}
              </div>
              ${extra}
            </div>`,
  })
}

/* --------------------------------------------- Player für Clips und Material

   Ein Element für alles, was auf einer Seite angesehen werden kann:
   Rohmaterial wie fertiger Clip, Video wie Bild. Das Verhalten steckt in
   `mediaScript` weiter unten. */

const VIEWER_HTML = `
      <div id="viewer" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/90 p-4" data-close-viewer>
        <div class="w-full max-w-4xl">
          <div class="mb-3 flex items-center justify-between gap-3 text-white">
            <span class="min-w-0">
              <span id="viewer-name" class="block truncate font-semibold"></span>
              <span id="viewer-pos" class="block text-xs text-white/60"></span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <button type="button" id="viewer-dl" class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">Download</button>
              <button type="button" data-close-viewer-btn class="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20" aria-label="Close">✕</button>
            </span>
          </div>
          <div class="relative">
            <div id="viewer-slot" class="grid min-h-[40vh] place-items-center overflow-hidden rounded-2xl bg-black"></div>
            <button type="button" id="viewer-prev" aria-label="Previous"
                    class="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-2xl text-white transition hover:bg-black/80">‹</button>
            <button type="button" id="viewer-next" aria-label="Next"
                    class="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-2xl text-white transition hover:bg-black/80">›</button>
          </div>
        </div>
      </div>

      <!-- Erzeugt fehlende Vorschaubilder aus dem Original. Bewusst OHNE
           defer: das Skript der Seitenhülle läuft direkt danach und braucht
           window.NMPoster bereits. -->
      <script src="/assets/poster.js"></script>`

/** Gemeinsamer fetch-Helfer für alle Seiten-Skripte: JSON hin, JSON zurück, `error` als Ausnahme. */
const SEND_JS = `
  function send(url, method, payload) {
    return fetch(url, {
      method: method,
      headers: { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'That did not work.');
        return d;
      });
    });
  }`

/** „Send login code“ — auf Listen und Profilen derselbe Knopf. */
const RESEND_JS = (label: string) => `
  document.querySelectorAll('[data-resend]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = 'Sending \\u2026';
      fetch('/api/admin/users/' + btn.getAttribute('data-resend') + '/resend', { method: 'POST' })
        .then(function (r) { if (!r.ok) throw new Error('Sending failed.'); btn.textContent = 'Sent'; })
        .catch(function (e) { btn.textContent = e.message; })
        .then(function () { window.setTimeout(function () { btn.disabled = false; btn.textContent = ${JSON.stringify(label)}; }, 2500); });
    });
  });`

/**
 * Jemanden aus dem Team einer Kampagne nehmen — von der Kampagne aus wie vom
 * Profil aus derselbe Weg (`DELETE /api/admin/projects/:id/team/:userId`).
 */
const TEAM_REMOVE_JS = `
  document.querySelectorAll('[data-team-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var who = btn.getAttribute('data-name');
      var what = btn.getAttribute('data-label');
      if (!window.confirm('Remove ' + who + ' from "' + what + '"? They lose access to its material and are told by email. Clips already delivered or posted stay.')) return;
      btn.disabled = true;
      send('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-project')) + '/team/' + encodeURIComponent(btn.getAttribute('data-team-remove')), 'DELETE')
        .then(function () { window.location.reload(); })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });`

/* ==========================================================================
   1 — ÜBERSICHT

   Oben die Zahlen, klein in zwei Zeilen. Darunter groß, was Arbeit macht:
   Kampagnen, die auf ein Team warten, die neuesten Kampagnen, die neuesten
   Clips und die letzten Anfragen.
   ========================================================================== */

/**
 * Reichweite über alles in einer Zeile — echte Zahlen aus Zernio. Die
 * Hauptzahlen enthalten ALLE Posts (automatische Ziele der Kampagnen und
 * Verbreitung über Creator); „via creators“ ist der Anteil daran. Dazu der
 * Stand des Abgleichs: ohne ihn ließe sich nicht unterscheiden, ob eine
 * kleine Zahl wenig Reichweite heißt oder nur, dass Zernio noch nicht
 * nachgeliefert hat.
 */
function reachBar(r: { totals: MetricTotalsWithCreators; sync: SyncOverview; pausedUntil: number | null }): string {
  const t = r.totals
  const has = t.posts > 0
  const n = (v: number) => (has ? formatCompact(v, 'en') : '–')
  const paused = metricsPausedNote(r.pausedUntil, 'en', { admin: true })
  return `
      <div class="mt-7 flex flex-col gap-3">
        <h2 class="nmw-section-title">Reach <span class="font-sans text-sm font-normal tracking-normal text-slate-400">· real numbers from Zernio</span></h2>
        ${kpis([
          { label: 'Views', value: n(t.views) },
          { label: 'Likes', value: n(t.likes) },
          { label: 'Comments', value: n(t.comments) },
          { label: 'Shares', value: n(t.shares) },
          { label: 'Via creators', value: n(t.viaCreators.views), hint: 'views' },
          { label: 'Posts', value: String(t.posts) },
        ])}
      </div>
      <div class="mt-2 px-1">${syncSummary(r.sync, 'all')}</div>
      ${paused ? `<div class="mt-2">${paused}</div>` : ''}`
}

/** Ein fertiger Clip in den Übersichten — mit Kampagne und Cutter. */
function clipTile(r: ProjectReel): string {
  return mediaTile({
    id: r.id,
    kind: 'reel',
    name: r.caption || r.filename,
    video: /\.(mp4|mov|avi|mkv|webm)$/i.test(r.filename),
    meta: [r.projectName ? esc(r.projectName) : '', r.clipper ? esc(r.clipper) : '', esc(dateEN(r.createdAt))].filter(Boolean).join(' · '),
    ratio: 'aspect-[9/16]',
    footer: `<div class="border-t border-slate-100 px-3 py-2.5">${reelPublishBadge(r)}${
      r.projectId
        ? `<a href="/admin/projekte/${esc(r.projectId)}#clips" class="mt-1.5 block truncate text-[11px] font-semibold text-brand hover:underline">Open campaign →</a>`
        : ''
    }</div>`,
  })
}

const clipGrid = (clips: ProjectReel[]) =>
  `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">${clips.map(clipTile).join('')}</div>`

export function overviewPage(o: {
  user: User
  newLeads: number
  customers: number
  activeCampaigns: number
  clippers: number
  /** Selbsteinträge über /clipper in den letzten sieben Tagen. */
  clipperSignups: number
  creators: number
  /** Selbsteinträge über /creator in den letzten sieben Tagen. */
  creatorSignups: number
  storageBytes: number
  uploadsToday: number
  /** Verbundene Social-Accounts und die geschätzten Kosten dafür beim Anbieter. */
  accounts: { projectAccounts: number; creatorAccounts: number; total: number; monthlyUsd: number }
  /** Echte Zahlen über alle Kampagnen, Stand des Abgleichs und eine laufende 402-Pause. */
  reach: { totals: MetricTotalsWithCreators; sync: SyncOverview; pausedUntil: number | null }
  recentLeads: Lead[]
  /** Aktive Kampagnen ohne Team — Material zuerst, die brauchen am dringendsten jemanden. */
  waiting: AdminCampaign[]
  /** Die neuesten Kampagnen. */
  latest: AdminCampaign[]
  /** Die neuesten fertigen Clips über alle Kampagnen. */
  clips: ProjectReel[]
  links: ProfileLinks
}): string {
  const rows = o.recentLeads
    .map(
      (l) => `
              <tr class="border-t border-slate-100">
                <td class="px-5 py-3 font-medium"><a href="/admin/leads/${l.id}" class="hover:text-brand">${esc(
                  l.fullName,
                )}</a></td>
                <td class="py-3 pr-3 text-slate-500">${esc(l.company ?? '–')}</td>
                <td class="py-3 pr-3">${badge(statusLabel(l.status), STATUS_TONE[l.status] ?? 'grey')}</td>
                <td class="py-3 pr-5 whitespace-nowrap text-slate-500">${dateEN(l.createdAt)}</td>
              </tr>`,
    )
    .join('')

  const week = (n: number) => (n ? `+${n} this week` : undefined)
  const numbers: Kpi[] = [
    { label: 'New leads', value: String(o.newLeads), hint: '7 days' },
    { label: 'Customers', value: String(o.customers) },
    { label: 'Clippers', value: String(o.clippers), hint: week(o.clipperSignups) },
    { label: 'Creators', value: String(o.creators), hint: week(o.creatorSignups) },
    { label: 'Active campaigns', value: String(o.activeCampaigns) },
    { label: 'Without team', value: String(o.waiting.length) },
    { label: 'Storage', value: formatBytes(o.storageBytes) },
    { label: 'Uploads today', value: String(o.uploadsToday) },
    { label: 'Accounts', value: String(o.accounts.total), hint: `≈ $${o.accounts.monthlyUsd.toLocaleString('en-US')}/mo` },
  ]

  const waitingIds = new Set(o.waiting.slice(0, 6).map((c) => c.id))
  const latest = o.latest.filter((c) => !waitingIds.has(c.id)).slice(0, 6)

  const body =
    pageTitle('Overview', 'The current state at a glance.') +
    quickActions([
      { label: 'Campaigns', href: '/admin/projekte', icon: 'film', primary: true },
      { label: 'Leads', href: '/admin/leads', icon: 'inbox' },
      { label: 'New article', href: '/admin/fachartikel/neu', icon: 'doc' },
      { label: 'Cooperation codes', href: '/admin/agenturen#codes', icon: 'briefcase' },
    ]) +
    `<h2 class="nmw-section-title mb-3">Marketplace</h2>` +
    kpis(numbers) +
    `<p class="mt-1.5 px-1 text-[11px] text-slate-400">${signupHint(o.clipperSignups)} (clippers) · ${signupHint(
      o.creatorSignups,
    )} (creators) · Accounts: ${o.accounts.projectAccounts} on campaigns, ${o.accounts.creatorAccounts} on creators: Zernio bills per account: 1–2 free · 3–10 $6 · 11–100 $3 · 101+ $1 each.</p>` +
    reachBar(o.reach) +
    sectionHead(
      'Without team yet',
      `<a href="/admin/projekte?team=none" class="shrink-0 text-sm font-semibold text-brand hover:underline">All without team →</a>`,
    ) +
    (o.waiting.length
      ? `<p class="-mt-1 mb-4 text-sm text-slate-500">Active campaigns without clippers or creators yet. Nothing is required: assign a team whenever you are ready.</p>` +
        campaignGrid(o.waiting.slice(0, 6).map((c) => adminCampaignCard(c, o.links)))
      : `<p class="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">Every active campaign has a team.</p>`) +
    sectionHead('Latest campaigns', `<a href="/admin/projekte" class="shrink-0 text-sm font-semibold text-brand hover:underline">All campaigns →</a>`) +
    (latest.length
      ? campaignGrid(latest.map((c) => adminCampaignCard(c, o.links)))
      : o.waiting.length
        ? `<p class="text-sm text-slate-500">No other campaigns yet.</p>`
        : emptyState('No campaigns yet', 'As soon as a customer or creator creates a campaign, it appears here.')) +
    sectionHead('Latest clips') +
    (o.clips.length
      ? clipGrid(o.clips)
      : emptyState('No finished clips yet', 'Clips the teams deliver show up here, newest first.')) +
    sectionHead('Recently received', `<a href="/admin/leads" class="shrink-0 text-sm font-semibold text-brand hover:underline">All leads →</a>`) +
    (o.recentLeads.length
      ? `<div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
               <table class="w-full text-left text-sm">
                 <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                   <tr><th class="px-5 py-3 font-semibold">Name</th><th class="py-3 pr-3 font-semibold">Company</th><th class="py-3 pr-3 font-semibold">Status</th><th class="py-3 pr-5 font-semibold">Date</th></tr>
                 </thead>
                 <tbody>${rows}</tbody>
               </table>
             </div>`
      : emptyState('No leads yet', 'As soon as someone fills out the form, the lead appears here.')) +
    (o.clips.length ? VIEWER_HTML : '')

  return shell({
    title: 'Overview',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin',
    body,
    script: o.clips.length ? mediaScript : undefined,
  })
}

/* ==========================================================================
   1b — ANALYTICS

   Die Views-Grafik groß: alle Kampagnen, Zeitraum „All time“, zwölf
   Kampagnen in der Rangliste. Daten wie auf der Übersicht über
   GET /api/views-analytics (lib/analytics.ts).
   ========================================================================== */

export function analyticsPage(o: { user: User }): string {
  return shell({
    title: 'Analytics',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/analytics',
    body: pageTitle('Analytics', 'Views of every campaign we run, from real Zernio numbers.') + viewsSection('admin', 'en', 'full'),
    analytics: true,
  })
}

/* ==========================================================================
   2 — LEADS
   ========================================================================== */

/** Ein Lead plus die Information, ob sein Zugang schon Kunde ist. */
export interface LeadRow extends Lead {
  converted: boolean
  /**
   * Weitere Anfragen derselben Adresse. Sie teilen sich den Zugang mit
   * diesem Lead und stehen deshalb nicht als eigene Zeile in der Liste.
   */
  others: Lead[]
}

/** „2 enquiries“ — Anzahl der Anfragen, die an einem Zugang hängen. */
export function enquiriesLabel(n: number): string {
  return n === 1 ? '1 enquiry' : `${n} enquiries`
}

/**
 * Rückfrage vor dem Löschen eines Leads — für Liste und Detailseite gleich.
 *
 * Gibt den Zusatz für `DELETE /api/admin/leads/:id` zurück, oder `null` für
 * „abbrechen“. Ist der Zugang schon Kunde, wird ausdrücklich gefragt, ob er
 * mitgeht: Früher ging dann nur der Lead-Eintrag weg, der Zugang blieb — und
 * mit ihm die E-Mail-Adresse. Jeder Selbsteintrag damit scheiterte danach an
 * „gehört bereits zu einem anderen Zugang“, obwohl in der Liste nichts mehr
 * stand.
 */
const LEAD_DELETE_JS = `
  function leadDeleteQuery(converted, email, others) {
    var more = others > 0 ? ' This includes ' + (others === 1 ? 'the other enquiry' : 'the ' + others + ' other enquiries') + ' from ' + email + '.' : '';
    if (!converted) {
      return window.confirm('Delete this lead for good? Its account, campaigns, folders and files all disappear with it.' + more) ? '' : null;
    }
    if (window.confirm('This lead is already a customer. Delete the lead AND the customer account with all its campaigns and files?' + more + '\\n\\nThis frees ' + email + ' for a new signup. Cancel keeps the account.')) {
      return '?account=1';
    }
    return window.confirm('Delete only the lead entry instead? The customer account stays, and ' + email + ' remains taken.') ? '' : null;
  }`

export function leadsPage(o: {
  user: User
  leads: LeadRow[]
  filterStatus: string
  search: string
}): string {
  const statusSelect = (lead: Lead) =>
    `<select data-status="${lead.id}" class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand">
      ${LEAD_STATUS.map(
        (s) => `<option value="${esc(s)}"${s === lead.status ? ' selected' : ''}>${esc(statusLabel(s))}</option>`,
      ).join('')}
    </select>`

  /**
   * Die Antworten aus dem Formular — Plattformen, Branche, Menge, Rohmaterial.
   *
   * Sie stehen NICHT in der Zeile, sondern in einer Zeile darunter, die das
   * „i“ aufklappt. Sie sind beim Durchsehen der Liste nie die Frage; gefragt
   * ist, wer angefragt hat und wie es weitergeht. Als eigene Spalten haben
   * sie die Tabelle so breit gemacht, dass der Löschen-Knopf rechts aus dem
   * Bild fiel und man waagerecht scrollen musste, um ihn zu erreichen.
   */
  const detailRow = (l: LeadRow) => {
    const platforms: string[] = JSON.parse(l.platforms || '[]')
    const item = (label: string, value: string) => `
                    <div>
                      <dt class="text-xs uppercase tracking-wide text-slate-400">${esc(label)}</dt>
                      <dd class="mt-0.5 font-semibold">${esc(value)}</dd>
                    </div>`
    return `
              <tr class="hidden border-t border-slate-100 bg-slate-50/70" data-detail="${l.id}">
                <td colspan="6" class="px-5 py-4">
                  <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    ${item('Platforms', platforms.map(platformLabel).join(', ') || '–')}
                    ${item('Industry', l.industry)}
                    ${item('Videos per month', l.budgetRange)}
                    ${item('Raw footage', footageLabel(l.footageAmount))}
                    ${item('Email', l.email)}
                    ${item('Phone', formatPhone(l.phone))}
                    ${item('Company', l.company ?? '–')}
                    ${item('Received', dateTimeEN(l.createdAt))}
                  </dl>
                  ${
                    l.notes
                      ? `<p class="mt-4 whitespace-pre-line rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">${esc(
                          l.notes,
                        )}</p>`
                      : ''
                  }
                  ${otherEnquiries(l)}
                  <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                    <a href="/admin/leads/${l.id}" class="inline-flex text-sm font-semibold text-brand hover:underline">Open full view →</a>
                    ${
                      l.converted && l.customerId
                        ? `<a href="/admin/kunden/${l.customerId}" class="inline-flex text-sm font-semibold text-emerald-700 hover:underline">Open customer account →</a>`
                        : ''
                    }
                  </div>
                </td>
              </tr>`
  }

  /**
   * Die übrigen Anfragen derselben Adresse — als Liste im aufgeklappten
   * Bereich. Sie sind kein eigener Kunde: Status, Kundenschalter und
   * Löschen wirken auf den gemeinsamen Zugang.
   */
  const otherEnquiries = (l: LeadRow) =>
    l.others.length
      ? `<div class="mt-4 rounded-xl bg-white px-4 py-3 ring-1 ring-inset ring-amber-200">
                    <p class="text-xs font-semibold uppercase tracking-wide text-amber-800">Also from ${esc(l.email)}: same account</p>
                    <p class="mt-1 text-xs text-slate-500">One e-mail address is one account. These enquiries share it, so they appear once in this list and once under "Customers".</p>
                    <ul class="mt-2 divide-y divide-slate-100 text-sm">
                      ${l.others
                        .map(
                          (x) => `<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <a href="/admin/leads/${x.id}" class="font-semibold hover:text-brand">${esc(x.fullName)}</a>
                        <span class="text-slate-500">${esc(x.company ?? '–')}</span>
                        <span class="text-slate-400">${dateEN(x.createdAt)}</span>
                        ${badge(statusLabel(x.status), STATUS_TONE[x.status] ?? 'grey')}
                      </li>`,
                        )
                        .join('')}
                    </ul>
                  </div>`
      : ''

  const rows = o.leads
    .map(
      (l) => `
              <tr class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-5 py-3">
                  <a href="/admin/leads/${l.id}" class="block truncate font-semibold hover:text-brand">${esc(
                    l.fullName,
                  )}</a>
                  <span class="block truncate text-xs text-slate-500">${esc(
                    l.company || l.email,
                  )}</span>
                  ${
                    l.others.length
                      ? `<button type="button" data-info-badge="${l.id}" title="Same e-mail address, one shared account"
                                 class="mt-1 inline-flex max-w-full truncate rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">${enquiriesLabel(
                          l.others.length + 1,
                        )} · one account</button>`
                      : ''
                  }
                </td>
                <td class="hidden py-3 pr-3 md:table-cell">
                  <a href="mailto:${esc(l.email)}" class="block truncate text-slate-500 hover:text-brand">${esc(
                    l.email,
                  )}</a>
                  <a href="tel:${esc(telHref(l.phone))}" class="block truncate text-xs text-slate-400 hover:text-brand">${esc(
                    formatPhone(l.phone),
                  )}</a>
                </td>
                <td class="hidden py-3 pr-3 whitespace-nowrap text-slate-500 lg:table-cell">${dateEN(
                  l.createdAt,
                )}</td>
                <td class="py-3 pr-3">${statusSelect(l)}</td>
                <td class="py-3 pr-3">
                  <button type="button" data-convert="${l.id}" data-on="${l.converted ? '1' : '0'}"
                          title="${l.converted ? 'Is a customer: click to demote' : 'Make customer'}"
                          class="w-full truncate rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                            l.converted
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
                              : 'bg-brand text-white hover:bg-brand-2'
                          }">${l.converted ? 'Customer ✓' : 'Make customer'}</button>
                </td>
                <td class="py-3 pr-4">
                  <div class="flex items-center justify-end gap-1">
                    <button type="button" data-info="${l.id}" title="Show answers from the form"
                            aria-label="Show details"
                            class="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-sm font-bold text-slate-600 transition hover:border-brand hover:text-brand">i</button>
                    <button type="button" data-del-lead="${l.id}" data-converted="${
                      l.converted ? '1' : '0'
                    }" data-email="${esc(l.email)}" data-others="${l.others.length}" title="Delete lead" aria-label="Delete lead"
                            class="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                    </button>
                  </div>
                </td>
              </tr>${detailRow(l)}`,
    )
    .join('')

  const body =
    pageTitle(
      'Leads',
      'All enquiries from the form, one row per e-mail address. A lead is not yet a customer, you promote them explicitly here.',
    ) +
    `
      <form method="get" class="mb-5 flex flex-wrap gap-3">
        <input type="search" name="q" value="${esc(o.search)}" placeholder="Search name, company, email or phone"
               class="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
        <select name="status" class="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand">
          <option value="">All statuses</option>
          ${LEAD_STATUS.map(
            (s) => `<option value="${esc(s)}"${s === o.filterStatus ? ' selected' : ''}>${esc(statusLabel(s))}</option>`,
          ).join('')}
        </select>
        <button class="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2">Filter</button>
        ${
          o.search || o.filterStatus
            ? `<a href="/admin/leads" class="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold hover:border-slate-400">Reset</a>`
            : ''
        }
      </form>

      ${
        o.leads.length
          ? `<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
               <!-- table-fixed + feste Spaltenbreiten: die Zeile passt sich der
                    Fensterbreite an, statt sie zu sprengen. Lange E-Mails und
                    Firmennamen werden abgeschnitten, nicht ausgeklappt. -->
               <table class="w-full table-fixed text-left text-sm">
                 <colgroup>
                   <col class="w-[26%] md:w-[22%]">
                   <col class="hidden md:table-column md:w-[24%]">
                   <col class="hidden lg:table-column lg:w-[10%]">
                   <col class="w-[26%] md:w-[18%]">
                   <col class="w-[26%] md:w-[14%]">
                   <col class="w-[22%] md:w-[12%]">
                 </colgroup>
                 <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                   <tr>
                     <th class="px-5 py-3 font-semibold">Lead</th>
                     <th class="hidden py-3 pr-3 font-semibold md:table-cell">Contact</th>
                     <th class="hidden py-3 pr-3 font-semibold lg:table-cell">Date</th>
                     <th class="py-3 pr-3 font-semibold">Status</th>
                     <th class="py-3 pr-3 font-semibold">Customer</th>
                     <th class="py-3 pr-4 text-right font-semibold">Action</th>
                   </tr>
                 </thead>
                 <tbody>${rows}</tbody>
               </table>
             </div>
             <p class="mt-3 text-xs text-slate-400">The "i" expands platforms, industry, volume and raw footage.</p>`
          : emptyState('No matches', 'There are no leads for this filter.')
      }`

  return shell({
    title: 'Leads',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/leads',
    body,
    script: `
(function () {${LEAD_DELETE_JS}

  /* Expand and collapse the answers from the form. */
  document.querySelectorAll('[data-info]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = document.querySelector('[data-detail="' + btn.getAttribute('data-info') + '"]');
      if (!row) return;
      var open = !row.classList.contains('hidden');
      row.classList.toggle('hidden', open);
      btn.classList.toggle('border-brand', !open);
      btn.classList.toggle('text-brand', !open);
    });
  });
  /* "2 enquiries · one account" opens the same section as the "i". */
  document.querySelectorAll('[data-info-badge]').forEach(function (badge) {
    badge.addEventListener('click', function () {
      var btn = document.querySelector('[data-info="' + badge.getAttribute('data-info-badge') + '"]');
      if (btn) btn.click();
    });
  });

  document.querySelectorAll('[data-status]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var id = sel.getAttribute('data-status');
      sel.disabled = true;
      fetch('/api/admin/leads/' + id, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: sel.value })
      }).then(function (r) {
        if (!r.ok) throw new Error('Status could not be saved.');
        sel.classList.add('border-emerald-400');
        window.setTimeout(function () { sel.classList.remove('border-emerald-400'); }, 1200);
      }).catch(function (err) { window.alert(err.message); })
        .then(function () { sel.disabled = false; });
    });
  });

  /* Promote a lead to customer — or demote it again. */
  document.querySelectorAll('[data-convert]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('data-on') === '1';
      if (on && !window.confirm('Demote this customer back to "lead"? They disappear from the customer list, their data stays intact.')) return;
      btn.disabled = true;
      fetch('/api/admin/leads/' + btn.getAttribute('data-convert') + '/kunde', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ converted: !on })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Change failed.');
          window.location.reload();
        })
        .catch(function (err) { window.alert(err.message); btn.disabled = false; });
    });
  });

  /*
   * Delete a lead — including its account, as long as it is not yet a customer.
   * Is it a customer, ask whether the account goes too: the e-mail address
   * belongs to the account, not the lead, and stays taken while it exists.
   */
  document.querySelectorAll('[data-del-lead]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var query = leadDeleteQuery(
        btn.getAttribute('data-converted') === '1',
        btn.getAttribute('data-email'),
        Number(btn.getAttribute('data-others'))
      );
      if (query === null) return;
      btn.disabled = true;
      fetch('/api/admin/leads/' + btn.getAttribute('data-del-lead') + query, { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); window.location.reload(); })
        .catch(function (err) { window.alert(err.message); btn.disabled = false; });
    });
  });
})();`,
  })
}

export function leadDetailPage(o: {
  user: User
  lead: Lead
  /**
   * Der Zugang, der mit diesem Lead entstanden ist. `converted` sagt, ob Jason
   * ihn zum Kunden erklärt hat — von allein wird das nie wahr.
   */
  customer:
    | {
        id: string
        label: string
        converted: boolean
        projects: { id: string; name: string; status: string }[]
      }
    | null
  /** Weitere Anfragen derselben Adresse — derselbe Zugang. */
  others: Lead[]
}): string {
  const platforms: string[] = JSON.parse(o.lead.platforms || '[]')
  const row = (label: string, value: string) => `
            <div class="flex gap-4 border-b border-slate-100 py-3 last:border-0">
              <dt class="w-44 shrink-0 text-sm text-slate-500">${esc(label)}</dt>
              <dd class="text-sm font-semibold">${esc(value)}</dd>
            </div>`

  const body =
    `<a href="/admin/leads" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to all leads</a>` +
    pageTitle(o.lead.fullName, `Received on ${dateTimeEN(o.lead.createdAt)}`) +
    `
      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="mb-2 font-display text-lg font-bold">Answers from the form</h2>
            <dl>
              ${row('Platforms', platforms.map(platformLabel).join(', ') || '–')}
              ${row('Industry', o.lead.industry)}
              ${row('Raw footage', footageLabel(o.lead.footageAmount))}
              ${row('Videos per month', o.lead.budgetRange)}
            </dl>
          </div>

          <!--
            Die personenbezogenen Daten — änderbar, nicht in Stein.

            Sie kommen aus einem Formular, das der Interessent selbst ausgefüllt
            hat: da steht regelmäßig ein Tippfehler in der Adresse, eine Nummer
            ohne Vorwahl oder ein Name in Kleinschreibung. Bisher war nichts
            davon zu berichtigen.
          -->
          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="font-display text-lg font-bold">Contact data</h2>
            <p class="mt-1 text-sm text-slate-500">${
              o.customer
                ? 'Changes apply to the linked account as well, the email address is also its login address.'
                : 'This lead has no account yet, so the change only affects this entry.'
            }</p>
            ${contactFields('lc', {
              fullName: o.lead.fullName,
              company: o.lead.company,
              email: o.lead.email,
              phone: o.lead.phone,
            })}
            <div class="mt-4 flex items-center gap-3">
              <button type="button" id="lc-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-2">Save contact data</button>
              <span id="lc-msg" class="text-sm font-semibold"></span>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <!-- Der Lead hat mit dem Absenden einen eigenen Zugang bekommen —
               aber keinen Kundenstatus. Ob er Kunde wird, entscheidet allein
               Jason mit dem Schalter hier. -->
          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="font-display text-lg font-bold">Customer?</h2>
            ${
              o.others.length
                ? `<div class="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-inset ring-amber-200">
                     <p class="font-semibold text-amber-800">${enquiriesLabel(o.others.length + 1)} from ${esc(o.lead.email)}: one account</p>
                     <p class="mt-1 text-xs text-amber-800/80">The customer switch and deleting the account apply to all of them.</p>
                     <ul class="mt-2 space-y-1">
                       ${o.others
                         .map(
                           (x) => `<li><a href="/admin/leads/${x.id}" class="font-semibold hover:text-brand">${esc(
                             x.fullName,
                           )}</a> <span class="text-slate-500">${esc(x.company ?? '–')} · ${dateEN(x.createdAt)}</span></li>`,
                         )
                         .join('')}
                     </ul>
                   </div>`
                : ''
            }
            ${
              o.customer
                ? `<p class="mt-1 text-sm text-slate-500">${
                    o.customer.converted
                      ? 'Confirmed by you: this account is listed under "Customers".'
                      : 'Still just a lead. Only your click turns it into a customer.'
                  }</p>
                   <p class="mt-3 font-semibold">${esc(o.customer.label)}</p>
                   <ul class="mt-2 space-y-1 text-sm text-slate-500">
                     ${
                       o.customer.projects.length
                         ? o.customer.projects
                             .map(
                               // Der Weg zum Rohmaterial dieses Leads: je Kampagne eine
                               // Seite mit allem, was hochgeladen wurde.
                               (p) => `<li><a href="/admin/projekte/${p.id}" class="font-semibold hover:text-brand">${esc(
                                 p.name,
                               )}</a>: ${esc(projectStatusLabel(p.status))}</li>`,
                             )
                             .join('')
                         : '<li>No campaigns yet: the lead creates those in their own area, or you create one on the account page.</li>'
                     }
                   </ul>
                   <button type="button" id="convert" data-on="${o.customer.converted ? '1' : '0'}"
                           class="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                             o.customer.converted
                               ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                               : 'bg-brand text-white hover:bg-brand-2'
                           }">${o.customer.converted ? 'Demote to lead' : 'Make customer'}</button>
                   <div class="mt-2 flex flex-wrap gap-2">
                     <a href="/admin/kunden/${o.customer.id}" class="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold hover:border-slate-400">Open account</a>
                     <a href="/admin/projekte" class="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold hover:border-slate-400">Campaigns</a>
                   </div>`
                : `<p class="mt-1 text-sm text-slate-500">This lead has no account, it cannot be promoted to a customer.</p>`
            }
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="font-display text-lg font-bold">Status</h2>
            <select id="status" class="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand">
              ${LEAD_STATUS.map(
                (s) => `<option value="${esc(s)}"${s === o.lead.status ? ' selected' : ''}>${esc(statusLabel(s))}</option>`,
              ).join('')}
            </select>
            <div class="mt-5 flex gap-2">
              <a href="mailto:${esc(o.lead.email)}" class="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold hover:border-slate-400">Email</a>
              <!-- Die Nummer steht mit Ländervorwahl in der Datenbank, also
                   genügt hier ein tel:-Link — er wählt aus jedem Netz. -->
              <a href="tel:${esc(telHref(o.lead.phone))}" class="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-semibold hover:border-slate-400">Call
                <span class="block truncate text-[11px] font-normal text-slate-400">${esc(
                  formatPhone(o.lead.phone),
                )}</span>
              </a>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="font-display text-lg font-bold">Notes</h2>
            <textarea id="notes" rows="8" placeholder="Call notes, agreements, next steps …"
                      class="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">${esc(
                        o.lead.notes ?? '',
                      )}</textarea>
            <div class="mt-3 flex items-center gap-3">
              <button type="button" id="save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-2">Save</button>
              <span id="msg" class="text-sm font-semibold"></span>
            </div>
          </div>

          <div class="rounded-2xl border border-red-200 bg-red-50/60 p-6">
            <h2 class="font-display text-lg font-bold text-red-700">Delete</h2>
            <p class="mt-1 text-sm text-red-700/80">
              ${
                o.customer?.converted
                  ? `Already a customer: you choose whether the customer account with its campaigns and files goes too. As long as it exists, ${esc(o.lead.email)} stays taken.`
                  : 'Removes the lead including its account, campaigns, folders and files. This cannot be undone.'
              }
            </p>
            <button type="button" id="delete-lead" data-converted="${o.customer?.converted ? '1' : '0'}" data-email="${esc(o.lead.email)}" data-others="${o.others.length}" class="mt-4 w-full rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100">Delete lead</button>
          </div>
        </div>
      </div>`

  return shell({
    title: o.lead.fullName,
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/leads',
    body,
    script: `
(function () {${LEAD_DELETE_JS}

  var msg = document.getElementById('msg');
  function save(payload, quiet) {
    return fetch('/api/admin/leads/${o.lead.id}', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('Save failed.');
      if (!quiet) { msg.textContent = 'Saved.'; msg.className = 'text-sm font-semibold text-emerald-600'; }
    }).catch(function (err) { msg.textContent = err.message; msg.className = 'text-sm font-semibold text-red-600'; });
  }
  document.getElementById('status').addEventListener('change', function (e) { save({ status: e.target.value }, true); });
  document.getElementById('save').addEventListener('click', function () {
    msg.textContent = 'Saving …'; msg.className = 'text-sm font-semibold text-slate-500';
    save({ notes: document.getElementById('notes').value });
  });

  var lcMsg = document.getElementById('lc-msg');
  document.getElementById('lc-save').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    lcMsg.textContent = 'Saving …';
    lcMsg.className = 'text-sm font-semibold text-slate-500';
    fetch('/api/admin/leads/${o.lead.id}', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: document.getElementById('lc-name').value,
        company: document.getElementById('lc-company').value,
        email: document.getElementById('lc-email').value,
        phoneDial: document.getElementById('lc-dial').value,
        phone: document.getElementById('lc-phone').value
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Save failed.');
        window.location.reload();
      }); })
      .catch(function (e) {
        lcMsg.textContent = e.message;
        lcMsg.className = 'text-sm font-semibold text-red-600';
        btn.disabled = false;
      });
  });

  var convert = document.getElementById('convert');
  if (convert) {
    convert.addEventListener('click', function () {
      var on = convert.getAttribute('data-on') === '1';
      if (on && !window.confirm('Demote back to "lead"? The account disappears from the customer list, the data stays.')) return;
      convert.disabled = true;
      fetch('/api/admin/leads/${o.lead.id}/kunde', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ converted: !on })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Change failed.');
          window.location.reload();
        })
        .catch(function (e) { window.alert(e.message); convert.disabled = false; });
    });
  }

  document.getElementById('delete-lead').addEventListener('click', function () {
    var query = leadDeleteQuery(
      this.getAttribute('data-converted') === '1',
      this.getAttribute('data-email'),
      Number(this.getAttribute('data-others'))
    );
    if (query === null) return;
    fetch('/api/admin/leads/${o.lead.id}' + query, { method: 'DELETE' })
      .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); window.location.href = '/admin/leads'; })
      .catch(function (e) { window.alert(e.message); });
  });
})();`,
  })
}

/* ==========================================================================
   3 — KUNDEN
   ========================================================================== */

export interface CustomerCampaign {
  id: string
  name: string
  status: string
  /** Wer daran arbeitet — leer heißt: noch niemand, sichtbar nur hier. */
  team: TeamMember[]
}

export interface CustomerRow {
  customerId: string
  userId: string
  /**
   * `customer` — oder `creator`: Der Arbeitsbereich für die eigenen
   * Kampagnen eines Creators ist ebenfalls eine Zeile in `customers`. Die
   * Kundenliste zeigt ihn nie, die Detailseite schon.
   */
  role: Role
  company: string | null
  fullName: string
  email: string
  phone: string | null
  /** Ein Kunde kann mehrere Kampagnen haben — Restaurant, Personal Brand, … */
  projects: CustomerCampaign[]
  storageBytes: number
  /** Gesetzt, sobald der Administrator den Zugang zum Kunden erklärt hat. */
  convertedAt: number | null
  lastUpload: number | null
  /** Lead-Einträge an diesem Zugang — eine Adresse kann mehrmals anfragen. */
  enquiries: number
}

/** Wem eine neue Kampagne gehören kann — Kunde oder Creator-Arbeitsbereich. */
export interface OwnerOption {
  customerId: string
  label: string
}

/**
 * Dialog „New campaign“. Mit mehreren Besitzern steht eine Auswahl darin,
 * mit genau einem (Kundenseite) nur sein Name.
 */
function newCampaignModal(owners: OwnerOption[]): string {
  const single = owners.length === 1 ? owners[0] : null
  return `
      <div id="np-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="np-title">
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="np-title" class="font-display text-lg font-bold">New campaign</h2>
          <p class="mt-1 text-sm text-slate-500">The raw footage folder is created automatically. A team is optional: assign clippers or creators whenever you are ready, on the campaign page.</p>
          ${
            single
              ? `<p class="mt-4 text-sm">For <strong>${esc(single.label)}</strong></p>
                 <input type="hidden" id="np-owner" value="${esc(single.customerId)}">`
              : `<label class="mt-4 block">
                   <span class="mb-1.5 block text-sm font-semibold text-slate-600">Customer or creator</span>
                   <select id="np-owner" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
                     <option value="">Choose …</option>
                     ${owners.map((ow) => `<option value="${esc(ow.customerId)}">${esc(ow.label)}</option>`).join('')}
                   </select>
                 </label>`
          }
          <label class="mt-3 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Campaign name</span>
            <input id="np-name" type="text" maxlength="120" placeholder="e.g. Restaurant, Personal Brand, SaaS"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          </label>
          <p id="np-err" class="mt-2 hidden text-sm font-medium text-red-600" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-np class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Cancel</button>
            <button type="button" id="np-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">Create campaign</button>
          </div>
        </div>
      </div>`
}

/** Öffnen, Schließen und Anlegen — zu `newCampaignModal`; braucht `send`. Nach dem Anlegen geht es direkt in die neue Kampagne. */
const NEW_CAMPAIGN_JS = `
  (function () {
    var modal = document.getElementById('np-modal');
    if (!modal) return;
    var err = document.getElementById('np-err');
    var name = document.getElementById('np-name');
    var owner = document.getElementById('np-owner');
    function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.querySelectorAll('[data-newcampaign]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pre = btn.getAttribute('data-newcampaign');
        if (pre && owner.tagName === 'SELECT') owner.value = pre;
        err.classList.add('hidden');
        name.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        (owner.tagName === 'SELECT' && !owner.value ? owner : name).focus();
      });
    });
    document.querySelectorAll('[data-close-np]').forEach(function (b) { b.addEventListener('click', close); });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('np-save').click(); });
    document.getElementById('np-save').addEventListener('click', function () {
      var btn = this;
      function fail(text) { err.textContent = text; err.classList.remove('hidden'); }
      if (!owner.value) return fail('Please choose the customer or creator.');
      if (!name.value.trim()) return fail('Please enter a campaign name.');
      btn.disabled = true;
      send('/api/admin/projects', 'POST', { customerId: owner.value, name: name.value.trim() })
        .then(function (d) { window.location.href = d.id ? '/admin/projekte/' + encodeURIComponent(d.id) : window.location.href; })
        .catch(function (e) { fail(e.message); btn.disabled = false; });
    });
  })();`

/** Kampagne löschen — mit allem, was daran hängt. Braucht `send` nicht, nur `fetch`. */
const DELETE_CAMPAIGN_JS = (after: 'reload' | 'list') => `
  document.querySelectorAll('[data-del-project]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var files = Number(btn.getAttribute('data-files') || 0);
      var question = 'Delete campaign "' + btn.getAttribute('data-label') + '" for good?';
      question += files
        ? '\\n\\n' + files + ' uploaded file(s), all finished clips and the publishing channel disappear with it. This cannot be undone.'
        : '\\n\\nThe raw footage folder, all finished clips and the publishing channel disappear with it.';
      if (!window.confirm(question)) return;
      btn.disabled = true;
      fetch('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-del-project')), { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); ${after === 'list' ? "window.location.href = '/admin/projekte';" : 'window.location.reload();'} })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });`

/** Die Kampagnen eines Kunden als kleine Chips in der Tabelle — mit Team oder „no team“. */
function customerCampaignChips(r: CustomerRow): string {
  if (!r.projects.length) return '<span class="text-xs text-slate-400">–</span>'
  return r.projects
    .map(
      (p) => `<a href="/admin/projekte/${esc(p.id)}" class="mb-1 mr-1 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs transition hover:bg-slate-200">
                        <span class="truncate font-semibold">${esc(p.name)}</span>
                        <span class="truncate ${p.team.length ? 'text-emerald-700' : 'text-amber-700'}">${esc(
                          p.team.length ? p.team.map((m) => m.name).join(', ') : 'no team',
                        )}</span>
                      </a>`,
    )
    .join('')
}

export function customersPage(o: { user: User; customers: CustomerRow[] }): string {
  const rows = o.customers
    .map((r) => {
      return `
              <tr class="border-t border-slate-100 align-top hover:bg-slate-50">
                <td class="px-5 py-3">
                  <a href="/admin/kunden/${r.customerId}" class="font-semibold hover:text-brand">${esc(
                    r.company || r.fullName,
                  )}</a>
                  <span class="block text-xs text-slate-500">${esc(r.email)}</span>
                  ${
                    r.enquiries
                      ? `<a href="/admin/leads?q=${encodeURIComponent(r.email)}" class="text-xs font-semibold ${
                          r.enquiries > 1 ? 'text-amber-700' : 'text-slate-400'
                        } hover:text-brand">${enquiriesLabel(r.enquiries)}${r.enquiries > 1 ? ' · one account' : ''} →</a>`
                      : ''
                  }
                </td>
                <td class="py-3 pr-3">${customerCampaignChips(r)}</td>
                <td class="py-3 pr-3 whitespace-nowrap text-slate-500">${formatBytes(r.storageBytes)}</td>
                <td class="py-3 pr-3 whitespace-nowrap text-slate-500">${dateEN(r.lastUpload)}</td>
                <td class="py-3 pr-5 text-right whitespace-nowrap">
                  <button type="button" data-resend="${r.userId}" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-blue-50">Send login code</button>
                  <button type="button" data-del-customer="${r.customerId}" data-label="${esc(
                    r.company || r.fullName,
                  )}" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                </td>
              </tr>`
    })
    .join('')

  const campaigns = o.customers.reduce((n, r) => n + r.projects.length, 0)
  const withoutTeam = o.customers.reduce((n, r) => n + r.projects.filter((p) => !p.team.length).length, 0)
  const body =
    pageTitle(
      'Customers',
      'Only leads you have explicitly promoted to customer, one row per account. Several enquiries from the same e-mail address share one account. Next to each campaign is its team.',
    ) +
    (o.customers.length
      ? kpis(
          [
            { label: 'Customers', value: String(o.customers.length) },
            { label: 'Campaigns', value: String(campaigns) },
            { label: 'Without team', value: String(withoutTeam) },
            { label: 'Storage', value: formatBytes(o.customers.reduce((n, r) => n + r.storageBytes, 0)) },
          ],
          'mb-5',
        ) +
        `<div class="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
           <table class="w-full min-w-[800px] text-left text-sm">
             <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
               <tr><th class="px-5 py-3 font-semibold">Customer</th><th class="py-3 pr-3 font-semibold">Campaigns &amp; team</th>
                   <th class="py-3 pr-3 font-semibold">Storage</th>
                   <th class="py-3 pr-3 font-semibold">Last upload</th><th class="py-3 pr-5"><span class="sr-only">Actions</span></th></tr>
             </thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`
      : emptyState(
          'No customers yet',
          'A lead only becomes a customer once you promote them under "Leads". Until then it only appears there.',
        ))

  return shell({
    title: 'Customers',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/kunden',
    body,
    script: `
(function () {${RESEND_JS('Send login code')}

  document.querySelectorAll('[data-del-customer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('Delete "' + btn.getAttribute('data-label') + '" for good? Its account, campaigns, folders, files and the related lead entries all disappear.')) return;
      btn.disabled = true;
      fetch('/api/admin/customers/' + btn.getAttribute('data-del-customer'), { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); window.location.reload(); })
        .catch(function (err) { window.alert(err.message); btn.disabled = false; });
    });
  });
})();`,
  })
}

export function customerDetailPage(o: {
  user: User
  customer: CustomerRow
  /** Die Kampagnen dieses Kunden als Karten — mit Thumbnail, Team und Material. */
  campaigns: AdminCampaign[]
  links: ProfileLinks
  /** Bei einem Creator-Arbeitsbereich: sein Profil. */
  creatorHref?: string | null
  folders: {
    id: string
    name: string
    deletedAt: number | null
    projectId: string | null
    projectName: string | null
    files: { id: string; filename: string; bytes: number; createdAt: number; video: boolean }[]
  }[]
}): string {
  /*
   * Die personenbezogenen Daten des Kunden — hier änderbar.
   *
   * Sie stammen aus dem Formular, das der Kunde als Lead ausgefüllt hat, und
   * waren ab dem Absenden unantastbar: eine falsch getippte Adresse blieb
   * falsch, ein Namenswechsel ließ sich nicht nachtragen. Die Änderung wandert
   * bis in die Lead-Einträge, damit nicht zwei Stellen Verschiedenes behaupten.
   */
  const contactBlock = `
        <div class="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="font-display text-lg font-bold">Contact data</h2>
          <p class="text-sm text-slate-500">The email address is also this account's login address: the next login code goes to the new one. The lead entries behind this account follow along.</p>
          <div class="max-w-md">
            ${contactFields('cc', {
              fullName: o.customer.fullName,
              company: o.customer.company,
              email: o.customer.email,
              phone: o.customer.phone,
            })}
            <div class="mt-4 flex items-center gap-3">
              <button type="button" id="cc-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-2">Save contact data</button>
              <span id="cc-msg" class="text-sm font-semibold" role="status"></span>
            </div>
          </div>
        </div>`

  const cards = o.campaigns.map((c) =>
    adminCampaignCard(
      c,
      o.links,
      `<div class="flex justify-end">
         <button type="button" data-del-project="${esc(c.id)}" data-label="${esc(c.name)}" data-files="${c.files}"
                 class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50">Delete campaign</button>
       </div>`,
    ),
  )

  const folderBlocks = o.folders
    .map(
      (f) => `
          <div class="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <h3 class="flex min-w-0 flex-wrap items-center gap-2 font-display font-bold"><span class="truncate">${esc(f.name)}</span> ${
                f.deletedAt ? badge('in trash', 'red') : ''
              }${
                // Mit mehreren Kampagnen je Kunde muss sichtbar sein, wohin ein
                // Ordner gehört — daran hängt, welches Team ihn sieht.
                f.projectName ? ` ${badge(f.projectName, 'blue')}` : ''
              }</h3>
              <span class="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                ${plural(f.files.length, 'file', 'files')}
                ${
                  f.projectId
                    ? `<a href="/admin/projekte/${f.projectId}#material" class="font-semibold text-brand hover:underline">Open as gallery →</a>`
                    : ''
                }
              </span>
            </div>
            ${
              f.files.length
                ? `<ul class="divide-y divide-slate-100 text-sm">
                     ${f.files
                       .map(
                         (file) => `<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5">
                            <span class="min-w-0 truncate">${esc(file.filename)}</span>
                            <span class="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                              ${formatBytes(file.bytes)} · ${dateEN(file.createdAt)}
                              <!-- Ansehen steht vor Herunterladen: Um zu prüfen, was ein
                                   Kunde geliefert hat, muss niemand Gigabytes auf die
                                   eigene Platte holen. -->
                              <button type="button" data-view="${file.id}" data-name="${esc(
                                file.filename,
                              )}" data-video="${
                                file.video ? '1' : '0'
                              }" class="rounded-lg px-2 py-1 font-semibold text-brand hover:bg-blue-50">View</button>
                              <button type="button" data-dl="${file.id}" class="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100">Download</button>
                            </span>
                          </li>`,
                       )
                       .join('')}
                   </ul>`
                : `<p class="px-5 py-4 text-sm text-slate-500">This folder is empty.</p>`
            }
          </div>`,
    )
    .join('')

  /* Der Arbeitsbereich eines Creators sieht technisch aus wie der eines
     Kunden. Er wird aber nie zum Kunden erklärt — der Hinweis „lead only“
     wäre hier falsch, und zurück geht es zum Creator. */
  const creator = o.customer.role === 'creator'
  const files = o.folders.reduce((n, f) => n + (f.deletedAt ? 0 : f.files.length), 0)
  const body =
    (creator
      ? `<a href="${esc(o.creatorHref || '/admin/creator')}" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to the creator</a>`
      : `<a href="/admin/kunden" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to all customers</a>`) +
    pageTitle(
      o.customer.company || o.customer.fullName,
      `${o.customer.email}${
        creator ? ' · creator workspace' : o.customer.convertedAt ? '' : ' · not yet a confirmed customer, lead only'
      }`,
    ) +
    kpis([
      { label: creator ? 'Own campaigns' : 'Campaigns', value: String(o.customer.projects.length) },
      { label: 'Without team', value: String(o.campaigns.filter((c) => !c.team.length).length) },
      { label: 'Files', value: String(files) },
      { label: 'Storage', value: formatBytes(o.customer.storageBytes) },
      { label: 'Last upload', value: dateEN(o.customer.lastUpload) },
      ...(creator ? [] : [{ label: 'Enquiries', value: String(o.customer.enquiries) }]),
    ]) +
    sectionHead(
      creator ? 'Own campaigns' : 'Campaigns',
      `<button type="button" data-newcampaign="${esc(o.customer.customerId)}"
               class="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-2">+ New campaign</button>`,
    ) +
    (o.campaigns.length
      ? campaignGrid(cards)
      : emptyState('No campaign yet', creator ? 'This creator has not created a campaign yet.' : 'This customer has not created a campaign yet, you can create one for them.')) +
    contactBlock +
    `<div class="mb-3 mt-9">
       <h2 class="font-display text-lg font-bold">Raw footage</h2>
       <p class="text-sm text-slate-500">Every folder of this account. “View” plays the file right here; each campaign page shows everything as large tiles.</p>
     </div>` +
    (o.folders.length
      ? `<div class="space-y-5">${folderBlocks}</div>`
      : emptyState('No folders yet', 'Nothing uploaded yet.')) +
    newCampaignModal([{ customerId: o.customer.customerId, label: o.customer.company || o.customer.fullName }]) +
    `
      <div id="preview" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/85 p-4" data-close-preview>
        <div class="w-full max-w-3xl">
          <p id="preview-name" class="mb-3 truncate font-semibold text-white"></p>
          <div id="preview-slot" class="grid min-h-[30vh] place-items-center overflow-hidden rounded-2xl bg-black"></div>
          <button type="button" data-close-preview-btn class="mx-auto mt-4 block rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">Close</button>
        </div>
      </div>`

  return shell({
    title: o.customer.company || o.customer.fullName,
    user: o.user,
    nav: ADMIN_NAV,
    active: creator ? '/admin/creator' : '/admin/kunden',
    body,
    script: `
(function () {${SEND_JS}${NEW_CAMPAIGN_JS}${DELETE_CAMPAIGN_JS('reload')}

  document.querySelectorAll('[data-dl]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fetch('/api/admin/assets/' + btn.getAttribute('data-dl') + '/url?download=1')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.url) window.location.href = d.url; });
    });
  });

  /* ---- Ansehen statt herunterladen ---- */
  var preview = document.getElementById('preview');
  var slot = document.getElementById('preview-slot');
  var pname = document.getElementById('preview-name');

  function closePreview() {
    preview.classList.add('hidden'); preview.classList.remove('flex'); slot.innerHTML = '';
  }
  preview.addEventListener('click', function (e) { if (e.target === preview) closePreview(); });
  document.querySelectorAll('[data-close-preview-btn]').forEach(function (b) { b.addEventListener('click', closePreview); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      pname.textContent = btn.getAttribute('data-name') || '';
      slot.innerHTML = '<p class="p-8 text-sm text-white/60">Loading \\u2026</p>';
      preview.classList.remove('hidden'); preview.classList.add('flex');
      fetch('/api/admin/assets/' + btn.getAttribute('data-view') + '/url')
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.url) throw new Error(d.error || 'This file cannot be opened.');
          return d.url;
        }); })
        .then(function (url) {
          slot.innerHTML = btn.getAttribute('data-video') === '1'
            ? '<video src="' + url + '" controls autoplay playsinline class="max-h-[75vh] w-full bg-black"></video>'
            : '<img src="' + url + '" alt="" class="max-h-[75vh] w-full object-contain">';
        })
        .catch(function (err) { slot.innerHTML = '<p class="p-8 text-sm text-red-300">' + err.message + '</p>'; });
    });
  });

  var ccMsg = document.getElementById('cc-msg');
  document.getElementById('cc-save').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    ccMsg.textContent = 'Saving \\u2026';
    ccMsg.className = 'text-sm font-semibold text-slate-500';
    fetch('/api/admin/customers/${o.customer.customerId}', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: document.getElementById('cc-name').value,
        company: document.getElementById('cc-company').value,
        email: document.getElementById('cc-email').value,
        phoneDial: document.getElementById('cc-dial').value,
        phone: document.getElementById('cc-phone').value
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Save failed.');
        window.location.reload();
      }); })
      .catch(function (e) {
        ccMsg.textContent = e.message;
        ccMsg.className = 'text-sm font-semibold text-red-600';
        btn.disabled = false;
      });
  });
})();`,
  })
}

/* ------------------------------------------------ Bewerbung und Creator-Daten */

/** Die neueste Bewerbung über /clipper — die Werte so, wie sie gespeichert sind. */
export interface ClipperApplicationInfo {
  /** Plattform-Schlüssel, z. B. ["instagram","tiktok"] — siehe PLATFORMS. */
  platforms: string[]
  workStatus: string
  experience: string
  availability: string
  createdAt: number
}

export interface ClipperRow {
  id: string
  userId: string
  displayName: string
  email: string
  phone: string | null
  status: string
  projects: number
  uploads: number
  invitedAt: number | null
  /** null heißt: eingeladen, nicht selbst eingetragen. */
  application: ClipperApplicationInfo | null
  /**
   * Was seine gelieferten Clips erreicht haben — alle Posts, auch die über
   * Creator verbreiteten. Fehlt, solange es keine Zahlen gibt.
   */
  reach?: MetricTotals
}

/**
 * Was ein Clipper beim Selbsteintrag angegeben hat — eine kompakte Zeile
 * unter dem Namen statt vier weiterer Spalten, die bei eingeladenen
 * Clippern ohnehin leer blieben.
 */
function applicationDetails(a: ClipperApplicationInfo): string {
  const item = (label: string, value: string, title = '') => `
                    <div class="flex gap-1 whitespace-nowrap"${title ? ` title="${esc(title)}"` : ''}>
                      <dt class="text-slate-400">${esc(label)}</dt>
                      <dd class="font-medium text-slate-600">${esc(value)}</dd>
                    </div>`
  return `
                  <dl class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">${
                    item('Platforms', a.platforms.length ? a.platforms.map(platformLabel).join(', ') : '–') +
                    item('Work status', workStatusLabel(a.workStatus)) +
                    item('Experience', experienceLabel(a.experience)) +
                    item('Availability', availabilityLabel(a.availability)) +
                    item('Applied', dateEN(a.createdAt), dateTimeEN(a.createdAt))
                  }
                  </dl>`
}

/*
 * Die Beschriftungen in domain.ts sind deutsch — sie stehen im Stepper unter
 * /creator. Der Admin-Bereich ist englisch, also übersetzt er hier, so wie
 * oben bei den Lead-Status. Ein Schlüssel, den diese Tabellen (noch) nicht
 * kennen, fällt auf die deutsche Beschriftung zurück statt auf einen leeren
 * Platz.
 */
const CREATOR_GOAL_EN: Record<string, string> = {
  suchen: 'Looking for campaigns',
  haben: 'Has own campaigns',
  beides: 'Both',
}
const AD_OPENNESS_EN: Record<string, string> = {
  ja: 'Yes',
  vielleicht: 'Depends',
  nein: 'Rather not',
}
const AD_OPENNESS_TONE: Record<string, 'green' | 'amber' | 'grey'> = {
  ja: 'green',
  vielleicht: 'amber',
  nein: 'grey',
}
const FOLLOWERS_EN: Record<string, string> = {
  unter_1k: 'Under 1k',
  '1k_10k': '1k – 10k',
  '10k_50k': '10k – 50k',
  '50k_100k': '50k – 100k',
  '100k_1m': '100k – 1M',
  ueber_1m: 'Over 1M',
}
const VIEWS_TOTAL_EN: Record<string, string> = {
  unter_10k: 'Under 10k',
  '10k_100k': '10k – 100k',
  '100k_1m': '100k – 1M',
  '1m_10m': '1M – 10M',
  ueber_10m: 'Over 10M',
}
const VIEWS_30D_EN: Record<string, string> = {
  unter_10k: 'Under 10k',
  '10k_100k': '10k – 100k',
  '100k_500k': '100k – 500k',
  '500k_1m': '500k – 1M',
  ueber_1m: 'Over 1M',
}
const inEnglish = (map: Record<string, string>, value: string, fallback: (v: string) => string) =>
  map[value] ?? fallback(value)

/** Nur bekannte Plattformen bekommen ein Logo — der Dateiname kommt aus der Datenbank. */
const CREATOR_PLATFORM_KEYS = new Set<string>(CREATOR_PLATFORMS.map((p) => p.value))

/**
 * Plattformen mit Handle, eine je Zeile. Der Handle steht als Text mit @
 * davor — bewusst kein Link: Er ist eine unbestätigte Selbstauskunft, und
 * jede Plattform baut ihre Profiladressen anders.
 */
function creatorPlatforms(r: CreatorRow): string {
  if (!r.platforms.length) return '<span class="text-slate-400">–</span>'
  return `<ul class="space-y-1">${r.platforms
    .map((p) => {
      const handle = r.handles[p]
      return `
                    <li class="flex items-center gap-1.5 whitespace-nowrap">
                      ${
                        CREATOR_PLATFORM_KEYS.has(p)
                          ? `<img src="/img/platforms/${esc(p)}.svg" alt="" width="16" height="16" loading="lazy" class="h-4 w-4 shrink-0">`
                          : ''
                      }
                      <span class="font-medium text-slate-700">${esc(creatorPlatformLabel(p))}</span>
                      ${
                        handle
                          ? `<span class="text-slate-500">@${esc(handle.replace(/^@+/, ''))}</span>`
                          : '<span class="text-xs text-slate-400">no handle</span>'
                      }
                    </li>`
    })
    .join('')}
                  </ul>`
}

/**
 * Die verbundenen Accounts eines Creators: Zahl und Liste. Anders als die
 * Plattformen links (eine Selbstauskunft aus der Anmeldung) sind das echte,
 * beim Anbieter verbundene Konten — jedes kostet dort Geld, und an ihnen
 * hängt, ob seine Kampagnen-Clips irgendwo landen.
 */
function creatorAccounts(r: CreatorRow): string {
  if (!r.socialAccounts.length) return '<span class="text-xs text-slate-400">No connected accounts</span>'
  return `<span class="block text-xs font-semibold text-slate-600">${r.socialAccounts.length} connected</span>
                  <ul class="mt-1 space-y-1">${r.socialAccounts
                    .map(
                      (a) => `
                    <li class="flex items-center gap-1.5 whitespace-nowrap">
                      ${
                        (CONNECTABLE as readonly string[]).includes(a.platform)
                          ? `<img src="/img/platforms/${esc(a.platform)}.svg" alt="" width="16" height="16" loading="lazy" class="h-4 w-4 shrink-0">`
                          : ''
                      }
                      <span class="text-slate-600">${esc(
                        a.username ? `@${a.username.replace(/^@+/, '')}` : a.displayName || PLATFORM_LABEL[a.platform] || a.platform,
                      )}</span>
                    </li>`,
                    )
                    .join('')}
                  </ul>`
}

/**
 * Echte Reichweite eines Creators: zuerst seine Verbreitung — das, wofür er
 * hier steht —, darunter, nur wenn es Zahlen gibt, die Clips, die er für
 * fremde Kampagnen selbst geschnitten hat (alle Posts dieser Clips, wie bei
 * den Clippern). Die beiden sind keine Teile einer Summe: verbreitet er einen
 * Clip, den er selbst geschnitten hat, stehen dessen Posts in beiden.
 */
function creatorReach(r: CreatorRow): string {
  return `<div class="space-y-2">
                    ${metricStrip(r.distributionReach, 'en', { label: 'Distribution' })}
                    ${r.editedReach?.posts ? metricStrip(r.editedReach, 'en', { label: 'Clips edited' }) : ''}
                  </div>`
}

/* --------------------------------------------------------- Preisstaffelung

   Je Clipper und Creator legt der Administrator fest, was ab welcher
   Reichweite verdient wird. Jede Zeile hat genau zwei Felder — „Pro
   erreichte Views“ und „Verdientes Geld“ —, beide starten leer (nur
   Platzhalter). Geprüft wird auf dem Server (`parsePayTiers`), seine
   Meldung steht direkt unter dem Formular. Daneben die Vorschau genau so,
   wie der Clipper bzw. Creator die Staffel oben in seiner Übersicht sieht. */

/** „200“ bzw. „200,50“ — so, wie der Administrator den Betrag eintippen würde. */
const euroInput = (cents: number) =>
  (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

const tierInput =
  'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15'

/** Eine Zeile der Staffel. Ohne Werte (neue Zeile) stehen nur die Platzhalter darin. */
function tierRow(views = '', amount = ''): string {
  return `<li data-tier-row class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <label class="block min-w-0">
                <span class="mb-1 block text-[11px] font-semibold text-slate-500 sm:sr-only">From views (Pro erreichte Views), tier <span data-n></span></span>
                <input type="text" inputmode="numeric" autocomplete="off" data-tier-views value="${esc(views)}" placeholder="100.000" class="${tierInput}">
              </label>
              <label class="block min-w-0">
                <span class="mb-1 block text-[11px] font-semibold text-slate-500 sm:sr-only">Earned money (Verdientes Geld) in €, tier <span data-n></span></span>
                <span class="relative block">
                  <input type="text" inputmode="decimal" autocomplete="off" data-tier-amount value="${esc(amount)}" placeholder="200" class="${tierInput} pr-8">
                  <span class="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-semibold text-slate-400" aria-hidden="true">€</span>
                </span>
              </label>
              <button type="button" data-tier-remove aria-label="Remove this tier" title="Remove this tier"
                      class="grid h-[42px] w-10 place-items-center rounded-xl border border-slate-300 bg-white text-lg font-bold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">×</button>
            </li>`
}

/**
 * Der Editor „Preisstaffelung“ für EINE Person, mit Vorschau. Gespeichert wird
 * die komplette Liste (`PUT /api/admin/users/:id/pay-tiers`); eine leere Liste
 * nimmt die Staffel zurück.
 */
function payTierEditor(o: { userId: string; name: string; tiers: PayTierView[] }): string {
  const rows = o.tiers.length
    ? o.tiers.map((t) => tierRow(formatViews(t.minViews), euroInput(t.amountCents))).join('')
    : tierRow()
  return `
      <section id="pay-tiers" class="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="pay-tiers-title">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="pay-tiers-title" class="font-display text-xl font-extrabold tracking-tight">Preisstaffelung</h2>
            <p class="mt-1 max-w-2xl text-sm text-slate-500">Pay scale for ${esc(o.name)}: from how many views (“Pro erreichte Views”) they earn how much (“Verdientes Geld”). Fill in both fields of every row. ${esc(o.name)} sees the scale at the very top of their dashboard.</p>
          </div>
          ${o.tiers.length ? badge(`${plural(o.tiers.length, 'tier', 'tiers')} set`, 'green') : badge('Not set yet', 'grey')}
        </div>
        <div class="mt-5 space-y-6">
          <form data-paytiers="${esc(o.userId)}" data-name="${esc(o.name)}" novalidate class="min-w-0 max-w-2xl">
            <div class="mb-1.5 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid" aria-hidden="true">
              <span>From views <span class="normal-case tracking-normal text-slate-400">(Pro erreichte Views)</span></span>
              <span>Earned money <span class="normal-case tracking-normal text-slate-400">(Verdientes Geld)</span></span>
              <span></span>
            </div>
            <ol data-tier-rows class="space-y-2">${rows}</ol>
            <p data-tier-empty class="hidden rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">No tiers. Saving now removes the pay scale: ${esc(o.name)} then sees “In Kürze wird Nikki Media eine Preisstaffelung bekannt geben.”</p>
            <template id="tier-row">${tierRow()}</template>
            <p data-tier-error class="mt-3 hidden rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200" role="alert"></p>
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" data-tier-add class="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand disabled:opacity-40">+ Add tier</button>
              <button type="submit" data-tier-save class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2 disabled:opacity-40">Save pay scale</button>
              ${
                o.tiers.length
                  ? `<button type="button" data-tier-clear class="rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">Remove pay scale</button>`
                  : ''
              }
              <span data-tier-msg class="text-sm font-semibold text-slate-500" role="status"></span>
            </div>
            <p class="mt-2 text-xs text-slate-400">Up to ${PAY_TIERS_MAX} tiers. Views as a whole number (100.000), money in euros (200 or 200,50). Rows are sorted by views when saved.</p>
          </form>
          <div class="min-w-0">
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Preview: exactly what ${esc(o.name)} sees</p>
            ${payTierTable(o.tiers, '')}
            ${o.tiers.length ? '' : `<p class="mt-2 text-xs text-slate-400">The preview shows the saved state and updates after saving.</p>`}
          </div>
        </div>
      </section>`
}

const PAY_TIER_JS = `
  (function () {
    var form = document.querySelector('[data-paytiers]');
    if (!form) return;
    var MAX = ${PAY_TIERS_MAX};
    var list = form.querySelector('[data-tier-rows]');
    var tpl = document.getElementById('tier-row');
    var addBtn = form.querySelector('[data-tier-add]');
    var saveBtn = form.querySelector('[data-tier-save]');
    var clearBtn = form.querySelector('[data-tier-clear]');
    var err = form.querySelector('[data-tier-error]');
    var msg = form.querySelector('[data-tier-msg]');
    var empty = form.querySelector('[data-tier-empty]');
    var name = form.getAttribute('data-name');

    function rows() { return Array.prototype.slice.call(list.querySelectorAll('[data-tier-row]')); }
    function sync() {
      var all = rows();
      addBtn.disabled = all.length >= MAX;
      empty.classList.toggle('hidden', all.length > 0);
      all.forEach(function (r, i) {
        r.querySelectorAll('[data-n]').forEach(function (el) { el.textContent = String(i + 1); });
        r.querySelector('[data-tier-views]').setAttribute('aria-label', 'Tier ' + (i + 1) + ': from views (Pro erreichte Views)');
        r.querySelector('[data-tier-amount]').setAttribute('aria-label', 'Tier ' + (i + 1) + ': earned money in euros (Verdientes Geld)');
        r.querySelector('[data-tier-remove]').setAttribute('aria-label', 'Remove tier ' + (i + 1));
      });
    }
    function mark(index) {
      rows().forEach(function (r, i) {
        r.querySelectorAll('input').forEach(function (el) {
          el.classList.toggle('border-red-400', i === index);
          el.classList.toggle('bg-red-50', i === index);
        });
      });
    }
    addBtn.addEventListener('click', function () {
      if (rows().length >= MAX) return;
      var node = tpl.content.firstElementChild.cloneNode(true);
      list.appendChild(node);
      sync();
      node.querySelector('input').focus();
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tier-remove]');
      if (!b) return;
      b.closest('[data-tier-row]').remove();
      sync();
      var first = list.querySelector('input');
      (first || addBtn).focus();
    });
    function save(tiers, button) {
      err.classList.add('hidden');
      mark(-1);
      msg.textContent = 'Saving \\u2026';
      button.disabled = true;
      fetch('/api/admin/users/' + encodeURIComponent(form.getAttribute('data-paytiers')) + '/pay-tiers', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tiers: tiers })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'Saving failed.');
          msg.textContent = 'Saved.';
          window.location.hash = 'pay-tiers';
          window.location.reload();
        });
      }).catch(function (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
        msg.textContent = '';
        button.disabled = false;
        var m = /^Row (\\d+)/.exec(e.message);
        if (m) mark(Number(m[1]) - 1);
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var tiers = rows().map(function (r) {
        return { minViews: r.querySelector('[data-tier-views]').value, amount: r.querySelector('[data-tier-amount]').value };
      });
      if (!tiers.length && !window.confirm('No tiers left. Save anyway? This removes the pay scale of ' + name + '.')) return;
      save(tiers, saveBtn);
    });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (!window.confirm('Remove the pay scale of ' + name + '? They then see \\u201eIn K\\u00fcrze wird Nikki Media eine Preisstaffelung bekannt geben.\\u201c')) return;
      save([], clearBtn);
    });
    sync();
  })();`

/* ---------------------------------------------------- Zuordnen vom Profil aus */

/** Eine Kampagne, der jemand vom Profil aus zugeordnet werden kann. */
export interface AssignableCampaign {
  id: string
  name: string
  status: string
  owner: string
}

/**
 * „Assign to campaign“ — alle Kampagnen, in denen die Person noch nicht ist,
 * nach Status gruppiert. Derselbe Weg wie von der Kampagne aus
 * (`POST /api/admin/projects/:id/team`).
 */
function assignControl(userId: string, name: string, list: AssignableCampaign[]): string {
  if (!list.length) {
    return `<p class="text-sm text-slate-500">${esc(name)} is already on every campaign.</p>`
  }
  const group = (status: string, label: string) => {
    const items = list.filter((c) => c.status === status)
    return items.length
      ? `<optgroup label="${esc(label)}">${items
          .map((c) => `<option value="${esc(c.id)}">${esc(`${c.name} · ${c.owner}`)}</option>`)
          .join('')}</optgroup>`
      : ''
  }
  const other = list.filter((c) => !['aktiv', 'pausiert', 'beendet'].includes(c.status))
  return `
        <form data-assign-user="${esc(userId)}" data-name="${esc(name)}" class="flex min-w-0 flex-wrap items-center gap-2">
          <label for="assign-campaign" class="sr-only">Assign ${esc(name)} to a campaign</label>
          <select id="assign-campaign" class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 sm:w-80 sm:flex-none">
            <option value="">Assign to campaign …</option>
            ${group('aktiv', 'Active')}${group('pausiert', 'Paused')}${group('beendet', 'Ended')}${
              other.length ? `<optgroup label="Other">${other.map((c) => `<option value="${esc(c.id)}">${esc(`${c.name} · ${c.owner}`)}</option>`).join('')}</optgroup>` : ''
            }
          </select>
          <button type="submit" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2 disabled:opacity-40">Assign</button>
          <p data-assign-msg class="hidden w-full text-sm font-semibold text-red-600" role="alert"></p>
        </form>`
}

const ASSIGN_JS = `
  document.querySelectorAll('[data-assign-user]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var sel = form.querySelector('select');
      var btn = form.querySelector('button');
      var msg = form.querySelector('[data-assign-msg]');
      msg.classList.add('hidden');
      if (!sel.value) { msg.textContent = 'Pick a campaign first.'; msg.classList.remove('hidden'); sel.focus(); return; }
      btn.disabled = true;
      send('/api/admin/projects/' + encodeURIComponent(sel.value) + '/team', 'POST', { userId: form.getAttribute('data-assign-user') })
        .then(function () { window.location.hash = 'campaigns'; window.location.reload(); })
        .catch(function (err) { msg.textContent = err.message; msg.classList.remove('hidden'); btn.disabled = false; });
    });
  });`

/** Unter einer Kampagnenkarte auf dem Profil: was die Person dort tut, und „Remove“. */
function roleFooter(c: AdminCampaign, person: { userId: string; name: string }, role: { cuts: boolean; distributes: boolean }) {
  return `<div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span class="flex flex-wrap gap-1.5">${role.cuts ? doesBadge('cuts') : ''}${role.distributes ? doesBadge('distributes') : ''}</span>
            <button type="button" data-team-remove="${esc(person.userId)}" data-project="${esc(c.id)}"
                    data-name="${esc(person.name)}" data-label="${esc(c.name)}"
                    class="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50">Remove from team</button>
          </div>`
}

/* ==========================================================================
   4 — CLIPPER
   ========================================================================== */

export interface ClipperRow {
  id: string
  userId: string
  displayName: string
  email: string
  phone: string | null
  status: string
  /** Kampagnen, in deren Team er schneidet (`project_workers`). */
  projects: number
  uploads: number
  invitedAt: number | null
  /** null heißt: eingeladen, nicht selbst eingetragen. */
  application: ClipperApplicationInfo | null
  /**
   * Was seine gelieferten Clips erreicht haben — alle Posts, auch die über
   * Creator verbreiteten. Fehlt, solange es keine Zahlen gibt.
   */
  reach?: MetricTotals
  /** Stufen seiner Preisstaffelung — 0 heißt: noch keine festgelegt. */
  payTiers: number
}

/** Kleine Zeile „2 campaigns · 3 clips · 12K views“ in einer Personenkarte. */
const personFacts = (items: string[]) =>
  `<p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">${items
    .map((m, i) => `${i ? '<span class="text-slate-300">·</span>' : ''}<span>${m}</span>`)
    .join('')}</p>`

const payScaleBadge = (n: number) =>
  n ? badge(`Pay scale · ${plural(n, 'tier', 'tiers')}`, 'green') : badge('No pay scale', 'grey')

/** Edit-Dialog für Name, Adresse und Telefon — auf Liste und Profil derselbe. */
const CLIPPER_EDIT_MODAL = `
      <div id="ecl-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="ecl-title">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="ecl-title" class="font-display text-lg font-bold">Edit contact data</h2>
          <p class="mt-1 text-sm text-slate-500">The name is what customers and you see on every campaign. The email address is also the login address, the next login code goes to the new one.</p>
          <label class="mt-4 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Name</span>
            <input id="ecl-name" type="text" maxlength="120" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          </label>
          <label class="mt-3 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Email</span>
            <input id="ecl-mail" type="email" maxlength="190" class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          </label>
          <div class="mt-3">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Phone</span>
            <div class="flex gap-2">
              <select id="ecl-dial" aria-label="Country code"
                      class="w-36 shrink-0 rounded-xl border border-slate-300 bg-white px-2 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
                ${dialOptions('', 'en')}
              </select>
              <input id="ecl-phone" type="tel" maxlength="40" inputmode="numeric" aria-label="Phone number" class="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
            </div>
            <span class="mt-1 block text-xs text-slate-400">Number without the leading zero, the country code is on the left.</span>
          </div>
          <p id="ecl-err" class="mt-2 hidden text-sm font-medium text-red-600" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-ecl class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Cancel</button>
            <button type="button" id="ecl-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">Save</button>
          </div>
        </div>
      </div>`

/** Der Knopf, der `CLIPPER_EDIT_MODAL` mit den Werten einer Person öffnet. */
const editButton = (clipperId: string, name: string, email: string, phone: string | null, cls: string) =>
  `<button type="button" data-edit-clipper="${esc(clipperId)}" data-name="${esc(name)}" data-email="${esc(email)}"
           data-dial="${esc(splitPhone(phone).dial)}" data-national="${esc(splitPhone(phone).national)}" class="${cls}">Edit</button>`

const CLIPPER_EDIT_JS = `
  (function () {
    var ef = document.getElementById('ecl-modal');
    if (!ef) return;
    var eclErr = document.getElementById('ecl-err');
    var eclId = null;
    function eclClose() { ef.classList.add('hidden'); ef.classList.remove('flex'); }
    document.querySelectorAll('[data-edit-clipper]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        eclId = btn.getAttribute('data-edit-clipper');
        document.getElementById('ecl-name').value = btn.getAttribute('data-name') || '';
        document.getElementById('ecl-mail').value = btn.getAttribute('data-email') || '';
        document.getElementById('ecl-dial').value = btn.getAttribute('data-dial') || '';
        document.getElementById('ecl-phone').value = btn.getAttribute('data-national') || '';
        eclErr.classList.add('hidden');
        ef.classList.remove('hidden');
        ef.classList.add('flex');
        document.getElementById('ecl-name').focus();
      });
    });
    document.querySelectorAll('[data-close-ecl]').forEach(function (b) { b.addEventListener('click', eclClose); });
    ef.addEventListener('click', function (e) { if (e.target === ef) eclClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ef.classList.contains('hidden')) eclClose(); });
    document.getElementById('ecl-save').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      send('/api/admin/clippers/' + encodeURIComponent(eclId), 'POST', {
        name: document.getElementById('ecl-name').value,
        email: document.getElementById('ecl-mail').value,
        phoneDial: document.getElementById('ecl-dial').value,
        phone: document.getElementById('ecl-phone').value
      }).then(function () { window.location.reload(); })
        .catch(function (e) { eclErr.textContent = e.message; eclErr.classList.remove('hidden'); btn.disabled = false; });
    });
  })();`

const CLIPPER_DELETE_JS = (after: 'reload' | 'list') => `
  document.querySelectorAll('[data-del-clipper]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('Delete "' + btn.getAttribute('data-label') + '" for good? Their account disappears and they leave every campaign team. Clips already delivered stay with the customer.')) return;
      btn.disabled = true;
      fetch('/api/admin/clippers/' + encodeURIComponent(btn.getAttribute('data-del-clipper')), { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); ${after === 'list' ? "window.location.href = '/admin/clipper';" : 'window.location.reload();'} })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });`

/**
 * Creator löschen. Anders als beim Clipper verschwinden hier auch seine
 * EIGENEN Kampagnen samt Dateien und seine verbundenen Accounts — das sagt
 * die Rückfrage ausdrücklich.
 */
const CREATOR_DELETE_JS = (after: 'reload' | 'list') => `
  document.querySelectorAll('[data-del-creator]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var own = Number(btn.getAttribute('data-own') || 0);
      var question = 'Delete creator "' + btn.getAttribute('data-label') + '" for good?\\n\\n'
        + 'Their account disappears, they leave every campaign team and their connected social accounts are disconnected.'
        + (own ? '\\n\\nTheir ' + own + ' own campaign' + (own === 1 ? '' : 's') + ', with all folders, files and finished videos, ' + (own === 1 ? 'is' : 'are') + ' deleted as well.' : '')
        + '\\n\\nClips they cut for other customers stay with those customers.';
      if (!window.confirm(question)) return;
      btn.disabled = true;
      fetch('/api/admin/creators/' + encodeURIComponent(btn.getAttribute('data-del-creator')), { method: 'DELETE' })
        .then(function (r) { if (!r.ok) throw new Error('Delete failed.'); ${after === 'list' ? "window.location.href = '/admin/creator';" : 'window.location.reload();'} })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });`

const smallAction = 'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition'

export function clippersPage(o: {
  user: User
  clippers: ClipperRow[]
  /** Selbsteinträge über /clipper in den letzten sieben Tagen. */
  recentSignups: number
  /** Bis wann Zernio die Analytics verweigert (402) — null, wenn der Abgleich läuft. */
  metricsPausedUntil?: number | null
}): string {
  const cards = o.clippers
    .map(
      (cl) => `
        <article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
          <a href="/admin/clipper/${esc(cl.id)}" class="block flex-1 p-5 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" aria-label="Open the profile of ${esc(cl.displayName)}">
            <div class="flex items-start gap-3">
              ${avatar(cl.displayName, 'clipper', 'h-12 w-12 text-base')}
              <div class="min-w-0 flex-1">
                <h3 class="truncate font-display text-lg font-extrabold tracking-tight group-hover:text-brand">${esc(cl.displayName)}</h3>
                <p class="truncate text-xs text-slate-500">${esc(cl.email)}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span${cl.status === 'aktiv' ? '' : ' title="Has not logged in yet."'}>${badge(clipperStatusLabel(cl.status), cl.status === 'aktiv' ? 'green' : 'amber')}</span>
                  ${cl.application ? badge('Self sign-up', 'blue') : badge('Invited', 'grey')}
                  ${payScaleBadge(cl.payTiers)}
                </div>
              </div>
            </div>
            ${personFacts([
              `<b class="font-semibold text-slate-900">${esc(campaignsLabel(cl.projects))}</b>`,
              esc(plural(cl.uploads, 'clip', 'clips')),
              cl.reach?.posts ? `${esc(formatCompact(cl.reach.views, 'en'))} views` : 'no numbers yet',
            ])}
            ${cl.application ? applicationDetails(cl.application) : ''}
            <span class="mt-3 inline-flex text-xs font-bold text-brand">Open profile →</span>
          </a>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
            <span class="min-w-0 truncate text-xs text-slate-500">${cl.phone ? phoneLink(cl.phone, 'font-semibold hover:text-brand') : ''}</span>
            <span class="flex flex-wrap gap-1">
              ${editButton(cl.id, cl.displayName, cl.email, cl.phone, `${smallAction} text-slate-600 hover:bg-slate-100`)}
              <button type="button" data-resend="${esc(cl.userId)}" class="${smallAction} text-brand hover:bg-blue-50">Resend code</button>
              <button type="button" data-del-clipper="${esc(cl.id)}" data-label="${esc(cl.displayName)}" class="${smallAction} text-red-600 hover:bg-red-50">Delete</button>
            </span>
          </div>
        </article>`,
    )
    .join('')

  const active = o.clippers.filter((c) => c.status === 'aktiv').length
  const body =
    `<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
       <div class="min-w-0">
         <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Clippers</h1>
         <p class="mt-1.5 max-w-3xl text-slate-500">Invite clippers or let them sign up at
           <a href="/clipper" target="_blank" rel="noopener noreferrer" class="font-semibold text-brand hover:underline">/clipper</a>.
           Clippers never see open campaigns, you put every campaign team together. Open a clipper for their numbers, campaigns and pay scale.</p>
       </div>
       <button type="button" id="invite" class="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2">Invite clipper</button>
     </header>` +
    (o.clippers.length
      ? kpis(
          [
            { label: 'Clippers', value: String(o.clippers.length) },
            { label: 'Active', value: String(active) },
            { label: 'Pending', value: String(o.clippers.length - active) },
            { label: 'Sign-ups', value: String(o.recentSignups), hint: '7 days' },
            { label: 'With pay scale', value: String(o.clippers.filter((c) => c.payTiers).length) },
            { label: 'Clips', value: String(o.clippers.reduce((n, c) => n + c.uploads, 0)) },
          ],
          'mb-5',
        )
      : '') +
    pausedBox(o.clippers.length ? o.metricsPausedUntil : null) +
    (o.clippers.length
      ? `<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">${cards}</div>`
      : emptyState(
          'No clippers yet',
          'Invite your first clipper or share the sign-up page at /clipper, either way they confirm their email with a login code. Campaigns reach them only when you add them to a team.',
        )) +
    `
      <div id="invite-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="inv-title">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="inv-title" class="font-display text-lg font-bold">Invite clipper</h2>
          <p class="mt-1 text-sm text-slate-500">They receive an email with a login link and an eight-digit code. Then add them to campaign teams.</p>
          <label class="mt-4 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Name</span>
            <input id="inv-name" type="text" maxlength="120" class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          </label>
          <label class="mt-3 block">
            <span class="mb-1.5 block text-sm font-semibold text-slate-600">Email</span>
            <input id="inv-mail" type="email" maxlength="190" class="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          </label>
          <p id="inv-err" class="mt-2 hidden text-sm font-medium text-red-600" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Cancel</button>
            <button type="button" id="inv-send" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">Send invite</button>
          </div>
        </div>
      </div>` +
    CLIPPER_EDIT_MODAL

  return shell({
    title: 'Clippers',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/clipper',
    body,
    script: `
(function () {${SEND_JS}
  var modal = document.getElementById('invite-modal');
  var err = document.getElementById('inv-err');
  function open() { modal.classList.remove('hidden'); modal.classList.add('flex'); err.classList.add('hidden'); document.getElementById('inv-name').focus(); }
  function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

  document.getElementById('invite').addEventListener('click', open);
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  document.getElementById('inv-send').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    send('/api/admin/clippers', 'POST', { name: document.getElementById('inv-name').value, email: document.getElementById('inv-mail').value })
      .then(function () { window.location.reload(); })
      .catch(function (e) { err.textContent = e.message; err.classList.remove('hidden'); btn.disabled = false; });
  });
${RESEND_JS('Resend code')}${CLIPPER_EDIT_JS}${CLIPPER_DELETE_JS('reload')}
})();`,
  })
}

/** Ein Profil-Kopf: großer Avatar, Name, Abzeichen, Kontakt, Daten, Knöpfe. */
function profileHeader(o: {
  name: string
  role: 'clipper' | 'creator'
  badges: string
  email: string
  phone: string | null
  facts: { label: string; value: string; title?: string }[]
  actions: string
  extra?: string
}): string {
  return `
      <section class="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div class="flex flex-wrap items-start gap-4">
          ${avatar(o.name, o.role, 'h-16 w-16 text-xl')}
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold uppercase tracking-wider ${o.role === 'creator' ? 'text-pink-600' : 'text-violet-600'}">${ROLE_STYLE[o.role].label}</p>
            <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(o.name)}</h1>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">${o.badges}</div>
            <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <a href="mailto:${esc(o.email)}" class="min-w-0 truncate font-semibold text-slate-700 hover:text-brand">${esc(o.email)}</a>
              ${o.phone ? phoneLink(o.phone, 'font-semibold text-slate-700 hover:text-brand') : ''}
            </p>
          </div>
          <div class="flex w-full flex-wrap gap-2 sm:w-auto">${o.actions}</div>
        </div>
        <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm lg:grid-cols-4">
          ${o.facts
            .map(
              (f) => `<div class="min-w-0"${f.title ? ` title="${esc(f.title)}"` : ''}>
            <dt class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">${esc(f.label)}</dt>
            <dd class="mt-0.5 font-semibold text-slate-700">${f.value}</dd>
          </div>`,
            )
            .join('')}
        </dl>
        ${o.extra ?? ''}
      </section>`
}

const ghostAction = 'rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand'
const dangerAction = 'rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50'

/** Seine Kampagnen auf dem Profil — groß, mit Rolle und „Remove from team“. */
function profileCampaigns(o: {
  title: string
  intro: string
  person: { userId: string; name: string }
  campaigns: AdminCampaign[]
  roles: Map<string, { cuts: boolean; distributes: boolean }>
  links: ProfileLinks
  assign?: string
  empty: string
}): string {
  return (
    `<div id="campaigns" class="scroll-mt-6">` +
    sectionHead(o.title) +
    `<div class="-mt-1 mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
       <p class="min-w-0 max-w-2xl text-sm text-slate-500">${esc(o.intro)}</p>
       ${o.assign ?? ''}
     </div>` +
    (o.campaigns.length
      ? campaignGrid(
          o.campaigns.map((c) =>
            adminCampaignCard(c, o.links, roleFooter(c, o.person, o.roles.get(c.id) ?? { cuts: true, distributes: false }), 'assigned'),
          ),
        )
      : emptyState('No campaigns yet', o.empty)) +
    `</div>`
  )
}

/** Die zuletzt gelieferten Clips einer Person — groß, mit Kampagne und Stand. */
function profileClips(clips: ProjectReel[], name: string): string {
  return (
    sectionHead('Recent clips') +
    (clips.length
      ? clipGrid(clips)
      : emptyState('No clips yet', `Clips ${name} delivers show up here, with campaign, date and where they went.`))
  )
}

export function clipperProfilePage(o: {
  user: User
  clipper: {
    id: string
    userId: string
    displayName: string
    email: string
    phone: string | null
    status: string
    invitedAt: number | null
    createdAt: number
    verifiedAt: number | null
    lastLoginAt: number | null
  }
  application: ClipperApplicationInfo | null
  campaigns: AdminCampaign[]
  roles: Map<string, { cuts: boolean; distributes: boolean }>
  assignable: AssignableCampaign[]
  clips: ProjectReel[]
  stats: { delivered: number; published: number }
  /** Was seine Clips erreicht haben — alle Posts, auch über Creator. */
  totals?: MetricTotals
  payTiers: PayTierView[]
  links: ProfileLinks
  metricsPausedUntil?: number | null
}): string {
  const cl = o.clipper
  const t = o.totals
  const n = (v: number | undefined) => (t?.posts ? formatCompact(v ?? 0, 'en') : '–')
  const person = { userId: cl.userId, name: cl.displayName }

  const body =
    `<a href="/admin/clipper" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to all clippers</a>` +
    profileHeader({
      name: cl.displayName,
      role: 'clipper',
      badges:
        `<span${cl.status === 'aktiv' ? '' : ' title="Has not logged in yet."'}>${badge(clipperStatusLabel(cl.status), cl.status === 'aktiv' ? 'green' : 'amber')}</span>` +
        (o.application ? badge('Self sign-up', 'blue') : badge('Invited', 'grey')) +
        (cl.verifiedAt ? badge('Email verified', 'green') : badge('Email not verified', 'amber')) +
        payScaleBadge(o.payTiers.length),
      email: cl.email,
      phone: cl.phone,
      facts: [
        { label: 'Joined', value: esc(dateEN(cl.createdAt)), title: dateTimeEN(cl.createdAt) },
        { label: o.application ? 'Signed up' : 'Invited', value: esc(dateEN(o.application?.createdAt ?? cl.invitedAt ?? cl.createdAt)) },
        { label: 'Last login', value: esc(cl.lastLoginAt ? dateTimeEN(cl.lastLoginAt) : 'Never') },
        { label: 'Campaigns', value: esc(String(o.campaigns.length)) },
      ],
      actions:
        editButton(cl.id, cl.displayName, cl.email, cl.phone, ghostAction) +
        `<button type="button" data-resend="${esc(cl.userId)}" class="${ghostAction}">Resend code</button>` +
        `<button type="button" data-del-clipper="${esc(cl.id)}" data-label="${esc(cl.displayName)}" class="${dangerAction}">Delete</button>`,
      extra: o.application
        ? `<div class="mt-4 rounded-xl bg-slate-50 px-4 py-3">
             <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Answers from the sign-up at /clipper</p>
             ${applicationDetails(o.application)}
           </div>`
        : '',
    }) +
    kpis([
      { label: 'Campaigns', value: String(o.campaigns.length) },
      { label: 'Clips delivered', value: String(o.stats.delivered) },
      { label: 'Clips published', value: String(o.stats.published) },
      { label: 'Views', value: n(t?.views) },
      { label: 'Likes', value: n(t?.likes) },
      { label: 'Comments', value: n(t?.comments) },
      { label: 'Shares', value: n(t?.shares) },
    ]) +
    `<p class="mt-1.5 px-1 text-[11px] text-slate-400">${
      t?.posts
        ? `Real numbers from Zernio across ${esc(plural(t.posts, 'post', 'posts'))} of the clips ${esc(cl.displayName)} delivered: creator distribution included. Updated ${esc(dateTimeEN(t.syncedAt))}.`
        : 'No numbers yet: they arrive once the first clip is published.'
    }</p>` +
    (o.metricsPausedUntil ? `<div class="mt-3">${metricsPausedNote(o.metricsPausedUntil, 'en', { admin: true })}</div>` : '') +
    profileCampaigns({
      title: 'Assigned campaigns',
      intro: `Every campaign ${cl.displayName} is on. Assign more here: they get an email as soon as the campaign has footage.`,
      person,
      campaigns: o.campaigns,
      roles: o.roles,
      links: o.links,
      assign: assignControl(cl.userId, cl.displayName, o.assignable),
      empty: `${cl.displayName} is not on any campaign yet. Use “Assign to campaign” above.`,
    }) +
    payTierEditor({ userId: cl.userId, name: cl.displayName, tiers: o.payTiers }) +
    profileClips(o.clips, cl.displayName) +
    CLIPPER_EDIT_MODAL +
    (o.clips.length ? VIEWER_HTML : '')

  return shell({
    title: cl.displayName,
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/clipper',
    body,
    script:
      `
(function () {${SEND_JS}${RESEND_JS('Resend code')}${CLIPPER_EDIT_JS}${CLIPPER_DELETE_JS('list')}${TEAM_REMOVE_JS}${ASSIGN_JS}${PAY_TIER_JS}
})();` + (o.clips.length ? mediaScript : ''),
  })
}

/* ==========================================================================
   4b — CREATOR

   Influencer und UGC-Creator aus /creator. Sie stehen hier und nirgends
   sonst — nicht unter „Customers“, obwohl sie eigene Kampagnen mitbringen,
   und nicht unter „Clippers“, obwohl sie Kampagnen-Teams angehören.
   ========================================================================== */

export interface CreatorRow {
  creatorId: string
  userId: string
  /** Der Arbeitsbereich für die eigenen Kampagnen — führt zu Ordnern und Material. */
  customerId: string | null
  fullName: string
  email: string
  phone: string | null
  /** Ob die Adresse schon mit einem Code bestätigt wurde. */
  verified: boolean
  /** Die Werte so, wie sie gespeichert sind — Schlüssel aus den CREATOR_*-Listen. */
  goal: string
  /** Nische aus INDUSTRIES (deutsch, wie bei den Leads) — null bei älteren Creatorn. */
  niche: string | null
  platforms: string[]
  /** `{ plattform: handle }`, ohne führendes @. */
  handles: Record<string, string>
  openToAds: string
  followers: string
  viewsTotal: string
  views30d: string
  /** Eigene Kampagnen — Kampagnen in seinem Arbeitsbereich. */
  ownCampaigns: number
  /** Fremde Kampagnen, die er schneidet (`project_workers` über seine Clipper-Zeile). */
  acceptedCampaigns: number
  /** Fremde Kampagnen, die er verbreitet (`campaign_creators`). */
  joinedCampaigns: number
  /** Was seine Verbreitung erreicht hat — nur seine eigenen Posts. Fehlt ohne Zahlen. */
  distributionReach?: MetricTotals
  /** Was die Clips erreicht haben, die er für fremde Kampagnen geschnitten hat. Fehlt ohne Zahlen. */
  editedReach?: MetricTotals
  /** Seine verbundenen Social-Accounts — gelten für alle seine Kampagnen. */
  socialAccounts: { id: string; platform: string; username: string | null; displayName: string | null }[]
  createdAt: number
  /** Stufen seiner Preisstaffelung — 0 heißt: noch keine festgelegt. */
  payTiers: number
}

export function creatorsPage(o: {
  user: User
  creators: CreatorRow[]
  /** Selbsteinträge über /creator in den letzten sieben Tagen. */
  recentSignups: number
  /** Bis wann Zernio die Analytics verweigert (402) — null, wenn der Abgleich läuft. */
  metricsPausedUntil?: number | null
}): string {
  const cards = o.creators
    .map(
      (r) => `
        <article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
          <a href="/admin/creator/${esc(r.creatorId)}" class="block flex-1 p-5 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" aria-label="Open the profile of ${esc(r.fullName)}">
            <div class="flex items-start gap-3">
              ${avatar(r.fullName, 'creator', 'h-12 w-12 text-base')}
              <div class="min-w-0 flex-1">
                <h3 class="truncate font-display text-lg font-extrabold tracking-tight group-hover:text-brand">${esc(r.fullName)}</h3>
                <p class="truncate text-xs text-slate-500">${esc(r.email)}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  ${r.verified ? '' : `<span title="Has not confirmed the email address with a login code yet.">${badge('Pending', 'amber')}</span>`}
                  ${badge(`Ads: ${inEnglish(AD_OPENNESS_EN, r.openToAds, adOpennessLabel)}`, AD_OPENNESS_TONE[r.openToAds] ?? 'grey')}
                  ${payScaleBadge(r.payTiers)}
                </div>
              </div>
            </div>
            <p class="mt-3 text-xs text-slate-600"><span class="font-semibold text-slate-800">${esc(inEnglish(CREATOR_GOAL_EN, r.goal, creatorGoalLabel))}</span>${
              r.niche ? ` · ${esc(r.niche)}` : ''
            } · ${esc(inEnglish(FOLLOWERS_EN, r.followers, followersLabel))} followers</p>
            ${personFacts([
              `<b class="font-semibold text-slate-900">${r.ownCampaigns} own</b>`,
              `cuts ${r.acceptedCampaigns}`,
              `distributes ${r.joinedCampaigns}`,
              r.distributionReach?.posts ? `${esc(formatCompact(r.distributionReach.views, 'en'))} views` : 'no numbers yet',
            ])}
            <div class="mt-3 text-xs">${creatorPlatforms(r)}</div>
            <div class="mt-3 text-xs">${creatorAccounts(r)}</div>
            <span class="mt-3 inline-flex text-xs font-bold text-brand">Open profile →</span>
          </a>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
            <span class="min-w-0 truncate text-xs text-slate-400" title="${esc(dateTimeEN(r.createdAt))}">Signed up ${dateEN(r.createdAt)}</span>
            <span class="flex items-center gap-1">
              <button type="button" data-resend="${esc(r.userId)}" class="${smallAction} text-brand hover:bg-blue-50">Send login code</button>
              <button type="button" data-del-creator="${esc(r.creatorId)}" data-label="${esc(r.fullName)}" data-own="${r.ownCampaigns}" class="${smallAction} text-red-600 hover:bg-red-50">Delete</button>
            </span>
          </div>
        </article>`,
    )
    .join('')

  const body =
    `<header class="mb-6">
       <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Creators</h1>
       <p class="mt-1.5 max-w-3xl text-slate-500">Influencers and UGC creators who signed up at
         <a href="/creator" target="_blank" rel="noopener noreferrer" class="font-semibold text-brand hover:underline">/creator</a>.
         They bring their own campaigns and join campaign teams, cutting, distributing or both.
         Followers and views are their own statements from sign-up; reach is real numbers from Zernio.</p>
     </header>` +
    (o.creators.length
      ? kpis(
          [
            { label: 'Creators', value: String(o.creators.length) },
            { label: 'Verified', value: String(o.creators.filter((r) => r.verified).length) },
            { label: 'Sign-ups', value: String(o.recentSignups), hint: '7 days' },
            { label: 'With pay scale', value: String(o.creators.filter((r) => r.payTiers).length) },
            { label: 'Own campaigns', value: String(o.creators.reduce((n, r) => n + r.ownCampaigns, 0)) },
            { label: 'Accounts', value: String(o.creators.reduce((n, r) => n + r.socialAccounts.length, 0)) },
          ],
          'mb-5',
        )
      : '') +
    pausedBox(o.creators.length ? o.metricsPausedUntil : null) +
    (o.creators.length
      ? `<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">${cards}</div>`
      : emptyState(
          'No creators yet',
          'Share the sign-up page at /creator, creators confirm their email with a login code and then land in their campaign dashboard.',
        ))

  return shell({
    title: 'Creators',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/creator',
    body,
    script: `
(function () {${RESEND_JS('Send login code')}${CREATOR_DELETE_JS('reload')}
})();`,
  })
}

export function creatorProfilePage(o: {
  user: User
  creator: CreatorRow
  lastLoginAt: number | null
  /** Seine Zeile in `clippers` — darüber schneidet er; null bei Altbeständen ohne. */
  clipperId: string | null
  own: AdminCampaign[]
  team: AdminCampaign[]
  roles: Map<string, { cuts: boolean; distributes: boolean }>
  assignable: AssignableCampaign[]
  clips: ProjectReel[]
  stats: { delivered: number; published: number }
  payTiers: PayTierView[]
  links: ProfileLinks
  metricsPausedUntil?: number | null
}): string {
  const r = o.creator
  const person = { userId: r.userId, name: r.fullName }
  const cut = [...o.roles.values()].filter((x) => x.cuts).length
  const distributed = [...o.roles.values()].filter((x) => x.distributes).length
  const d = r.distributionReach
  const e = r.editedReach

  const body =
    `<a href="/admin/creator" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to all creators</a>` +
    profileHeader({
      name: r.fullName,
      role: 'creator',
      badges:
        (r.verified ? badge('Email verified', 'green') : badge('Pending', 'amber')) +
        badge(`Open to ads: ${inEnglish(AD_OPENNESS_EN, r.openToAds, adOpennessLabel)}`, AD_OPENNESS_TONE[r.openToAds] ?? 'grey') +
        payScaleBadge(o.payTiers.length),
      email: r.email,
      phone: r.phone,
      facts: [
        { label: 'Goal', value: esc(inEnglish(CREATOR_GOAL_EN, r.goal, creatorGoalLabel)) },
        { label: 'Niche', value: esc(r.niche || '–') },
        { label: 'Followers', value: esc(inEnglish(FOLLOWERS_EN, r.followers, followersLabel)) },
        {
          label: 'Views (own statement)',
          value: `${esc(inEnglish(VIEWS_TOTAL_EN, r.viewsTotal, viewsTotalLabel))} total · ${esc(inEnglish(VIEWS_30D_EN, r.views30d, views30dLabel))} in 30 days`,
        },
        { label: 'Signed up', value: esc(dateEN(r.createdAt)), title: dateTimeEN(r.createdAt) },
        { label: 'Last login', value: esc(o.lastLoginAt ? dateTimeEN(o.lastLoginAt) : 'Never') },
        { label: 'Platforms & handles', value: `<div class="font-normal">${creatorPlatforms(r)}</div>` },
        { label: 'Connected accounts', value: `<div class="font-normal">${creatorAccounts(r)}</div>` },
      ],
      actions:
        (o.clipperId ? editButton(o.clipperId, r.fullName, r.email, r.phone, ghostAction) : '') +
        `<button type="button" data-resend="${esc(r.userId)}" class="${ghostAction}">Send login code</button>` +
        (r.customerId ? `<a href="/admin/kunden/${esc(r.customerId)}" class="${ghostAction}">Workspace &amp; footage</a>` : '') +
        `<button type="button" data-del-creator="${esc(r.creatorId)}" data-label="${esc(r.fullName)}" data-own="${o.own.length}" class="${dangerAction}">Delete</button>`,
    }) +
    kpis([
      { label: 'Own campaigns', value: String(o.own.length) },
      { label: 'Campaigns cut', value: String(cut) },
      { label: 'Campaigns distributed', value: String(distributed) },
      { label: 'Distribution views', value: d?.posts ? formatCompact(d.views, 'en') : '–' },
      { label: 'Edited clips views', value: e?.posts ? formatCompact(e.views, 'en') : '–' },
      { label: 'Clips delivered', value: String(o.stats.delivered) },
      { label: 'Published', value: String(o.stats.published) },
    ]) +
    `<div class="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
       ${metricStrip(d, 'en', { label: 'Distribution: their own posts' })}
       ${metricStrip(e, 'en', { label: 'Clips they cut: every post' })}
     </div>` +
    (o.metricsPausedUntil ? `<div class="mt-3">${metricsPausedNote(o.metricsPausedUntil, 'en', { admin: true })}</div>` : '') +
    profileCampaigns({
      title: 'Assigned campaigns',
      intro: `Assigned by you: campaigns of customers or other creators that ${r.fullName} cuts or distributes. They are NOT ${r.fullName}’s own. A creator added to a team cuts, and distributes too while the campaign has creator distribution on.`,
      person,
      campaigns: o.team,
      roles: o.roles,
      links: o.links,
      assign: assignControl(r.userId, r.fullName, o.assignable),
      empty: `${r.fullName} is not on any other campaign yet. Use “Assign to campaign” above.`,
    }) +
    sectionHead(
      'Own campaigns: created by the creator',
      r.customerId ? `<a href="/admin/kunden/${esc(r.customerId)}" class="shrink-0 text-sm font-semibold text-brand hover:underline">Workspace →</a>` : '',
    ) +
    `<p class="-mt-1 mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">${originBadge('own', 'en')}<span>Campaigns ${esc(r.fullName)} created themselves. Their finished clips go to ${esc(r.fullName)}’s own accounts automatically.</span></p>` +
    (o.own.length
      ? campaignGrid(o.own.map((c) => adminCampaignCard(c, o.links, '', 'own')))
      : emptyState('No own campaigns', `${r.fullName} has not created a campaign yet.`)) +
    payTierEditor({ userId: r.userId, name: r.fullName, tiers: o.payTiers }) +
    profileClips(o.clips, r.fullName) +
    (o.clipperId ? CLIPPER_EDIT_MODAL : '') +
    (o.clips.length ? VIEWER_HTML : '')

  return shell({
    title: r.fullName,
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/creator',
    body,
    script:
      `
(function () {${SEND_JS}${RESEND_JS('Send login code')}${CLIPPER_EDIT_JS}${TEAM_REMOVE_JS}${ASSIGN_JS}${PAY_TIER_JS}${CREATOR_DELETE_JS('list')}
})();` + (o.clips.length ? mediaScript : ''),
  })
}

/* ------------------------------------------------ Plattformen und ihre Zeichen */

/** Werte bleiben deutsch (siehe Hinweis oben), nur die Anzeige ist englisch. */
const PROJECT_STATUS = ['aktiv', 'pausiert', 'beendet'] as const

/**
 * Die Plattformen, die eine Kampagne verbinden kann — in dieser Reihenfolge.
 *
 * Abgeleitet aus `CONNECTABLE` statt von Hand gepflegt: eine neue Plattform
 * in zernio.ts bekommt hier ihre Spalte von allein, statt still zu fehlen
 * (so blieben Facebook und LinkedIn anfangs unsichtbar).
 */
const CONNECT_PLATFORMS = CONNECTABLE.map((key) => ({ key, label: PLATFORM_LABEL[key] ?? key }))

/*
 * Die Markenzeichen in ihren ECHTEN Farben — Instagram mit seinem Verlauf,
 * TikTok mit dem versetzten Cyan/Rot, YouTube in Rot, X in Schwarz.
 *
 * Ein eingefärbtes Logo ist auf einen Blick erkennbar, ein einfarbiges muss
 * man lesen. Genau darum geht es in dieser Spaltenansicht.
 *
 * Die Pfade sind transparent: kein Hintergrundkasten, keine weiße Fläche —
 * die Glyphe selbst trägt die Farbe und sitzt direkt auf dem Untergrund der
 * Kachel.
 */
const IG_PATH =
  'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793 0 1.44.645 1.44 1.439z'

const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'

/**
 * Der Verlauf des Instagram-Zeichens steht EINMAL im Dokument und wird von
 * jedem Icon per `url(#…)` benutzt. Ihn je Icon zu wiederholen hieße: bei
 * zwanzig Kampagnen zwanzig gleiche Verläufe und zwanzigmal dieselbe ID —
 * ungültiges HTML für nichts.
 */
export const PLATFORM_ICON_DEFS = `
      <svg width="0" height="0" aria-hidden="true" class="absolute">
        <defs>
          <linearGradient id="nm-ig" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#FFD521"/>
            <stop offset="25%" stop-color="#F50000"/>
            <stop offset="60%" stop-color="#B900B4"/>
            <stop offset="100%" stop-color="#7638FA"/>
          </linearGradient>
        </defs>
      </svg>`

const PLATFORM_ICON: Record<string, (cls: string) => string> = {
  instagram: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico"><path fill="url(#nm-ig)" d="${IG_PATH}"/></svg>`,
  // Das versetzte Cyan/Rot IST das TikTok-Zeichen — dreimal derselbe Pfad,
  // zweimal verschoben, schwarz zuoberst.
  tiktok: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico">` +
    `<path fill="#25F4EE" transform="translate(-1.1 -0.6)" d="${TIKTOK_PATH}"/>` +
    `<path fill="#FE2C55" transform="translate(1.1 0.6)" d="${TIKTOK_PATH}"/>` +
    `<path fill="#000000" d="${TIKTOK_PATH}"/>` +
    `</svg>`,
  youtube: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico">` +
    `<path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>` +
    `<path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>` +
    `</svg>`,
  twitter: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico"><path fill="#000000" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  // Dieselben Glyphen wie unter /img/platforms — Facebook-Blau, LinkedIn-Blau.
  facebook: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico"><path fill="#0866FF" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>`,
  linkedin: (cls) =>
    `<svg viewBox="0 0 24 24" class="${cls} shrink-0 nm-brand-ico"><path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
}

const platformIcon = (platform: string, cls = 'h-5 w-5') =>
  PLATFORM_ICON[platform]?.(cls) ?? ''


/* ==========================================================================
   5 — KAMPAGNEN

   Alle Kampagnen aller Kunden und Creator als große Karten: von wem sie
   kommen, wer im Team ist, was an Material drinliegt. Hier entstehen neue
   Kampagnen; zusammengestellt wird das Team auf der Kampagnenseite.

   Die Zuordnung ist reine Handarbeit des Administrators: Clipper und
   Creator sehen keine offenen Kampagnen und können sich nichts selbst nehmen.
   ========================================================================== */

/** Die Filter der Kampagnenliste — so, wie sie in der Adresse stehen. */
export interface CampaignFilter {
  /** '' | aktiv | pausiert | beendet */
  status: string
  /** '' | none — „none“: ohne Team */
  team: string
  /** '' | creator — nur Kampagnen von Creatorn */
  owner: string
  q: string
}

export function campaignsPage(o: {
  user: User
  /** Die gefilterten Kampagnen, neueste zuerst. */
  campaigns: AdminCampaign[]
  /** Alle Kampagnen ohne Filter — für die Zahlen und die Filter-Chips. */
  all: AdminCampaign[]
  filter: CampaignFilter
  owners: OwnerOption[]
  links: ProfileLinks
  /** Rückmeldung nach dem Verbinden eines Accounts (alte Rücksprungadresse). */
  flash?: { ok?: string; error?: string }
  /** Bis wann Zernio die Analytics verweigert (402) — null, wenn der Abgleich läuft. */
  metricsPausedUntil?: number | null
}): string {
  const f = o.filter
  const all = o.all
  const count = (p: (c: AdminCampaign) => boolean) => all.filter(p).length

  const flashBox = o.flash?.ok
    ? `<div class="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200" role="status">${esc(o.flash.ok)}</div>`
    : o.flash?.error
      ? `<div class="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 ring-1 ring-inset ring-red-200" role="alert">${esc(o.flash.error)}</div>`
      : ''

  /*
   * Filter als Chips — je einer gilt, die Suche bleibt dabei stehen. Die
   * Zahl im Chip ist die Zahl OHNE Suche: sie sagt, wie viele es gibt, nicht
   * wie viele gerade passen.
   */
  const href = (next: Partial<CampaignFilter>) => {
    const p = new URLSearchParams()
    const merged = { status: '', team: '', owner: '', q: f.q, ...next }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return `/admin/projekte${s ? `?${s}` : ''}`
  }
  const chip = (label: string, n: number, on: boolean, to: Partial<CampaignFilter>, tone = '') =>
    `<a href="${esc(href(to))}"${on ? ' aria-current="page"' : ''}
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
          on ? 'bg-slate-900 text-white ring-slate-900' : `bg-white text-slate-600 ring-slate-200 hover:ring-slate-400 ${tone}`
        }">${esc(label)}<span class="${on ? 'text-white/70' : 'text-slate-400'} tabular-nums">${n}</span></a>`
  const none = !f.status && !f.team && !f.owner
  const chips = [
    chip('All', all.length, none, {}),
    chip('Active', count((c) => c.status === 'aktiv'), f.status === 'aktiv', { status: 'aktiv' }),
    chip('Paused', count((c) => c.status === 'pausiert'), f.status === 'pausiert', { status: 'pausiert' }),
    chip('Ended', count((c) => c.status === 'beendet'), f.status === 'beendet', { status: 'beendet' }),
    chip('No team', count((c) => !c.team.length), f.team === 'none', { team: 'none' }, 'text-amber-800'),
    chip('Creator campaigns', count((c) => c.owner.role === 'creator'), f.owner === 'creator', { owner: 'creator' }),
  ].join('')

  const filterBar = `
      <div class="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter campaigns" class="flex flex-wrap gap-1.5">${chips}</nav>
        <form method="get" role="search" class="flex w-full gap-2 lg:w-auto">
          ${f.status ? `<input type="hidden" name="status" value="${esc(f.status)}">` : ''}
          ${f.team ? `<input type="hidden" name="team" value="${esc(f.team)}">` : ''}
          ${f.owner ? `<input type="hidden" name="owner" value="${esc(f.owner)}">` : ''}
          <label for="campaign-search" class="sr-only">Search campaigns</label>
          <input id="campaign-search" type="search" name="q" value="${esc(f.q)}" autocomplete="off"
                 placeholder="Search campaign, customer or person"
                 class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 lg:w-80">
          <button class="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700">Search</button>
          ${f.q ? `<a href="${esc(href({ ...f, q: '' }))}" class="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold transition hover:border-slate-400">Reset</a>` : ''}
        </form>
      </div>`

  const filtered = f.q || !none
  const body =
    `<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
       <div class="min-w-0">
         <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Campaigns</h1>
         <p class="mt-1.5 max-w-3xl text-slate-500">Every campaign of every customer and creator, who it comes from, who is on the team and what footage is in it. Clippers and creators never see open campaigns: you put each team together.</p>
       </div>
       ${
         o.owners.length
           ? `<button type="button" data-newcampaign="" class="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2">+ New campaign</button>`
           : ''
       }
     </header>` +
    kpis(
      [
        { label: 'Campaigns', value: String(all.length) },
        { label: 'Active', value: String(count((c) => c.status === 'aktiv')) },
        { label: 'Without team', value: String(count((c) => !c.team.length)) },
        { label: 'Files', value: String(all.reduce((n, c) => n + c.files, 0)) },
        { label: 'Cloud links', value: String(all.reduce((n, c) => n + c.links, 0)) },
        { label: 'Clips', value: String(all.reduce((n, c) => n + c.clips, 0)) },
      ],
      'mb-4',
    ) +
    flashBox +
    (o.metricsPausedUntil ? `<div class="mb-4">${metricsPausedNote(o.metricsPausedUntil, 'en', { admin: true })}</div>` : '') +
    (all.length ? filterBar : '') +
    (o.campaigns.length
      ? `<div class="mb-4 flex flex-wrap items-center justify-between gap-2">${
          filtered ? `<p class="text-sm text-slate-500">${o.campaigns.length} of ${all.length} campaigns${f.q ? ` match “${esc(f.q)}”` : ''}.</p>` : '<span></span>'
        }${teamLegend()}</div>` + campaignGrid(o.campaigns.map((c) => adminCampaignCard(c, o.links)))
      : filtered && all.length
        ? emptyState('No matches', f.q ? `No campaign, customer or team member matches “${f.q}” with this filter.` : 'No campaign fits this filter.', `<a href="/admin/projekte" class="mt-4 inline-flex text-sm font-semibold text-brand hover:underline">Show all campaigns</a>`)
        : emptyState(
            'No campaigns yet',
            'As soon as a customer or creator creates their first campaign, it appears here. You can also create one yourself.',
          )) +
    (o.owners.length ? newCampaignModal(o.owners) : '')

  return shell({
    title: 'Campaigns',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/projekte',
    body,
    script: `
(function () {${SEND_JS}${NEW_CAMPAIGN_JS}

  /* Zurück aus dem Verbinden (alte Rücksprungadresse): Die Meldung steht schon
     oben. Die angehängten Parameter verschwinden aus der Adresse — sonst
     wertete jedes Neuladen die Rückkehr erneut aus. */
  if (/[?&](connected|error)=/.test(window.location.search) && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }
})();`,
  })
}

/* ==========================================================================
   6 — EINE KAMPAGNE: TEAM, MATERIAL, FERTIGE CLIPS, VERÖFFENTLICHUNG

   Die Seite zeigt der Administration, was das Team sieht — und zusätzlich,
   was daraus geworden ist. Oben das Thumbnail und die Eckdaten, darunter das
   Team (der wichtigste Block: hier bekommt eine Kampagne ihre Clipper und
   Creator), dann das Material als große Kacheln, die fertigen Clips mit
   ihren Zahlen und zuletzt die verbundenen Accounts.

   Rohmaterial läuft komplett im Browser: Vorschaubild je Datei, Klick
   öffnet den Player, Pfeiltasten gehen weiter zur nächsten Aufnahme. Wer
   wissen will, ob brauchbares Material geliefert wurde, muss nichts auf die
   eigene Platte laden.

   Die signierten Adressen holt die Seite NICHT beim Rendern, sondern erst,
   wenn eine Kachel ins Bild scrollt — gebündelt über /api/admin/media/urls.
   Begründung steht dort.
   ========================================================================== */

/** Eine Datei aus dem Rohmaterial. */
export interface ProjectMediaFile {
  id: string
  filename: string
  bytes: number
  createdAt: number
  /** Video oder Bild — entscheidet, was als Vorschau eingehängt wird. */
  video: boolean
}

/** Ein Ordner der Kampagne, mit vollem Pfad statt bloßem Namen. */
export interface ProjectMediaFolder {
  id: string
  /** „Rohmaterial“ oder „Rohmaterial / Januar“ — die Stelle in der Kampagne. */
  path: string
  files: ProjectMediaFile[]
  bytes: number
}

/** Ein fertiger Clip — auf der Kampagnenseite, in der Übersicht und auf Profilen. */
export interface ProjectReel {
  id: string
  filename: string
  caption: string | null
  bytes: number
  createdAt: number
  clipper: string | null
  uploadStatus: string
  publishStatus: string | null
  publishTargets: string | null
  /** Summe aller Posts dieses Clips — fehlt ohne Zahlen. */
  reach?: MetricTotals
  /** Die Zeilen je Account, automatische Ziele zuerst, dann je Creator. */
  reachRows?: MetricRow[]
  /** Außerhalb der Kampagnenseite: zu welcher Kampagne der Clip gehört. */
  projectId?: string
  projectName?: string
}

/** Ein geteilter Cloud-Ordner (Google Drive, Dropbox, iCloud …). */
export interface ProjectCloudLink {
  id: string
  url: string
  createdAt: number
  /** Der Anbieter dahinter (`cloudProvider` in lib/thumbs.ts) — bestimmt das große Symbol der Kachel. */
  provider?: { id: string; label: string; bundled: boolean }
}

/**
 * Wohin ein fertiger Clip gegangen ist — je Account, nicht nur als Wort.
 *
 * Ein Post geht an alle verbundenen Accounts gleichzeitig, und die können
 * unterschiedlich ausgehen. „veröffentlicht“ allein verschweigt genau den
 * Fall, der Arbeit macht: draußen auf Instagram, abgewiesen bei TikTok.
 */
function reelPublishBadge(r: ProjectReel): string {
  if (r.uploadStatus !== 'complete') return badge('upload incomplete', 'amber')

  const label = publishStatusLabel(r.publishStatus, 'en')
  const detail = platformLines(r.publishTargets)
    .map((p) => {
      const name = esc(p.type)
      if (p.state === 'posted') {
        // Nur https wird zum Link — die Adresse kommt vom Anbieter, und ein
        // `javascript:` liefe hier mit den Rechten der Administration.
        return p.url && /^https:\/\//i.test(p.url)
          ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" class="text-emerald-600 underline decoration-dotted">${name} &check;</a>`
          : `<span class="text-emerald-600">${name} &check;</span>`
      }
      if (p.state === 'failed') {
        return `<span class="text-red-600" title="${esc(p.error ?? '')}">${name} &times;</span>`
      }
      return `<span class="text-slate-400">${name} &hellip;</span>`
    })
    .join(' &middot; ')

  const tone =
    r.publishStatus === PUBLISH_STATUS.posted
      ? 'green'
      : r.publishStatus === PUBLISH_STATUS.scheduled
        ? 'blue'
        : r.publishStatus === PUBLISH_STATUS.partial || r.publishStatus === PUBLISH_STATUS.waitingForAccounts
          ? 'amber'
          : r.publishStatus
            ? 'red'
            : 'grey'

  return (
    (r.publishStatus ? badge(label, tone) : badge('not published yet', 'grey')) +
    (detail ? `<span class="mt-1.5 block text-[11px] leading-relaxed">${detail}</span>` : '')
  )
}

/** Die vier Zahlen in der Reihenfolge der Leiste, mit ihrer Bezeichnung. */
const REACH_NUMBERS = [
  ['views', 'Views'],
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['shares', 'Shares'],
] as const

/** Stände, nach denen ein Clip draußen ist oder gleich sein wird — nur dort kommen Zahlen. */
const NUMBERS_EXPECTED = new Set<string>([PUBLISH_STATUS.posted, PUBLISH_STATUS.partial, PUBLISH_STATUS.scheduled])

/**
 * Die Posts eines Clips je Account — untereinander statt als Tabelle.
 *
 * Die Kachel der Galerie ist 150–220 px breit (bis zu fünf nebeneinander).
 * Die Tabelle aus `metricRows` braucht für ihre fünf Spalten rund 500 px;
 * aufgeklappt standen dort nur die Namen, alle Zahlen lagen im Scrollbereich.
 * Hier steht je Account der Name — als Link zum Beitrag (nur https), mit
 * Abzeichen, wenn der Post über einen Creator lief —, darunter die vier
 * Zahlen, die umbrechen dürfen.
 */
function reachAccountList(rows: MetricRow[]): string {
  return `<ul class="divide-y divide-slate-100">${rows
    .map((r) => {
      const name = r.username ? `@${r.username.replace(/^@+/, '')}` : (PLATFORM_LABEL[r.platform] ?? r.platform)
      const href = r.url && /^https:\/\//i.test(r.url) ? r.url : null
      const nameHtml = href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="truncate font-semibold text-slate-700 hover:text-brand hover:underline">${esc(name)}</a>`
        : `<span class="truncate font-semibold text-slate-700">${esc(name)}</span>`
      const logo = (CONNECTABLE as readonly string[]).includes(r.platform)
        ? `<img src="/img/platforms/${esc(r.platform)}.svg" alt="" width="14" height="14" loading="lazy" class="h-3.5 w-3.5 shrink-0">`
        : ''
      const creator = r.creatorId
        ? '<span class="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">creator</span>'
        : ''
      const numbers = REACH_NUMBERS.map(([key, label]) => {
        const n = Number(r[key]) || 0
        return `<span title="${esc(`${label}: ${n.toLocaleString('en-US')}`)}"><span class="font-semibold tabular-nums text-slate-800">${esc(
          formatCompact(n, 'en'),
        )}</span> ${esc(label)}</span>`
      }).join('')
      return `
                         <li class="py-1.5">
                           <span class="flex min-w-0 items-center gap-1.5" title="${esc(PLATFORM_LABEL[r.platform] ?? r.platform)}">${logo}${nameHtml}${creator}</span>
                           <span class="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-slate-500">${numbers}</span>
                         </li>`
    })
    .join('')}</ul>`
}

/**
 * Was ein fertiger Clip erreicht hat: die Summe aller Posts, darunter die
 * Posts je Account — mit Link zum Beitrag und markiert, was über Creator lief.
 *
 * Die Liste klappt auf, statt offen zu stehen: Die Kachel ist eine schmale
 * Hochkant-Spalte, und beim Durchsehen der Clips ist die Summe die Frage,
 * nicht jeder Account.
 *
 * „No numbers yet“ nur, wo welche kommen werden. Ein Clip, dessen Upload nie
 * fertig wurde oder dessen Veröffentlichung scheiterte, bekommt gar keinen
 * Block statt eines Versprechens, das auf etwas warten ließe — was dort
 * schiefging, sagt das Abzeichen darüber. Zahlen, die da sind, stehen immer.
 */
function reelReach(r: ProjectReel): string {
  if (r.uploadStatus !== 'complete') return ''
  if (!r.reach && !(r.publishStatus && NUMBERS_EXPECTED.has(r.publishStatus))) return ''
  const rows = r.reachRows ?? []
  return `<div class="border-t border-slate-100 px-3 py-2.5">
              ${metricStrip(r.reach, 'en')}
              ${
                rows.length
                  ? `<details class="mt-2">
                       <summary class="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-brand">Per account (${rows.length})</summary>
                       <div class="mt-1 text-[11px]">${reachAccountList(rows)}</div>
                     </details>`
                  : ''
              }
            </div>`
}

/**
 * Das Zeichen über der Vorschau — Abspielen beim Video, Lupe beim Bild.
 *
 * Ein Abspieldreieck über einem Foto verspricht etwas, das dort nicht kommt.
 */
const tileOverlay = (video: boolean) => `
              <span class="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/5">
                ${
                  video
                    ? `<svg viewBox="0 0 24 24" fill="currentColor" class="h-10 w-10 text-white/90 drop-shadow"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-9 w-9 text-white/90 drop-shadow"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>`
                }
              </span>`

const downloadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/></svg>`

/**
 * Eine Kachel — Vorschau, Name, Größe, Datum, Download.
 *
 * Die Vorschau ist IMMER ein <img>, auch beim Video. Das ist der Kern der
 * Sache: Früher stand hier ein <video>, das auf die Originaldatei zeigte.
 * Zwanzig Kacheln bedeuteten damit zwanzig Rohaufnahmen von je mehreren
 * hundert Megabyte, die der Browser gleichzeitig anfasste, um daraus je ein
 * Bildchen zu gewinnen — die Seite ruckelte, und der Clip, den Jason dann
 * wirklich ansehen wollte, teilte sich die Leitung mit ihnen allen. Jetzt
 * lädt eine Kachel ein JPEG von wenigen Dutzend Kilobyte, und das Original
 * wird erst angefasst, wenn der Player aufgeht.
 *
 * Das Bild trägt nur `data-media`, keine Adresse. Die kommt nach, sobald die
 * Kachel im Bild ist; bis dahin steht dort das Symbol im dunklen Feld.
 */
function mediaTile(o: {
  id: string
  kind: 'raw' | 'reel'
  name: string
  video: boolean
  /** Fertiges HTML: Größe, Datum und — bei Clips — der Name des Cutters. */
  meta: string
  ratio: string
  /** Ebenfalls fertiges HTML, z. B. der Veröffentlichungsstand eines Clips. */
  footer?: string
}): string {
  return `
          <div class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand hover:shadow-md">
            <button type="button" data-open="${o.id}" data-kind="${o.kind}" data-video="${
              o.video ? '1' : '0'
            }" data-name="${esc(o.name)}" class="block w-full text-left">
              <span class="relative block ${o.ratio} overflow-hidden bg-slate-900">
                <img data-media="${o.id}" data-kind-of="${o.kind}" data-is-video="${
                  o.video ? '1' : '0'
                }" alt="" style="opacity:0" class="h-full w-full object-cover transition-opacity duration-200">
                ${tileOverlay(o.video)}
              </span>
              <span class="block px-3 py-2.5">
                <span class="block truncate text-xs font-semibold text-slate-800">${esc(o.name)}</span>
                <span class="mt-0.5 block truncate text-[11px] text-slate-500">${o.meta}</span>
              </span>
            </button>
            <button type="button" data-dl="${o.id}" data-kind="${o.kind}" title="Download this file" aria-label="Download this file"
                    class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/50 text-white transition hover:bg-black/70 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
              ${downloadIcon}
            </button>
            ${o.footer ?? ''}
          </div>`
}

/**
 * Die Adresse ohne „https://“ und, wenn sie lang ist, in der Mitte gekürzt:
 * Anfang (Anbieter, Ordner) und Ende (Freigabe-ID) tragen die Information.
 * Die volle Adresse steht im Tooltip.
 */
const shortUrl = (url: string, max = 64): string => {
  const bare = url.replace(/^https:\/\//i, '').replace(/\/$/, '')
  return bare.length > max ? `${bare.slice(0, max - 20)}…${bare.slice(-19)}` : bare
}

/* --------------------------------------------------- Seite einer Kampagne */

/** Ein Mitglied, wie die Team-Liste der Kampagnenseite es braucht. */
export interface TeamMemberView extends TeamMember {
  email: string | null
  /** Profil im Admin-Bereich. */
  href?: string
  /** Seine Zeile in `clippers` — fürs Schneiden (`/workers`). */
  clipperId: string | null
  /** Seine Zeile in `creators` — fürs Verbreiten (`/creators`); null bei Clippern. */
  creatorId: string | null
}

/** Wer ins Team geholt werden kann — alle Clipper und Creator außer dem Besitzer und dem Team. */
export interface TeamCandidate {
  userId: string
  name: string
  email: string
  role: 'clipper' | 'creator'
}

type SocialAccount = { id: string; platform: string; username: string | null; displayName: string | null }

/**
 * Das Team einer Kampagne — der wichtigste Block der Seite.
 *
 * Beliebig viele Clipper und Creator. Clipper schneiden. Creator schneiden
 * und verbreiten; beides lässt sich je Creator einzeln an- und abschalten
 * (Schnitt über `project_workers`, Verbreitung über `campaign_creators`).
 * Hinzugefügt wird über eine filterbare Liste mit Häkchen, mehrere auf
 * einmal.
 */
function teamPanel(o: {
  project: { id: string; name: string; status: string; creatorDistribution: boolean }
  ownerRole: Role
  members: TeamMemberView[]
  candidates: TeamCandidate[]
}): string {
  const p = o.project
  const toggle = (m: TeamMemberView, what: 'cuts' | 'distributes') => {
    const on = what === 'cuts' ? m.cuts : m.distributes
    const id = what === 'cuts' ? m.clipperId : m.creatorId
    // Ohne Clipper-Zeile (Altbestand) geht Schneiden nur über „Add to team“.
    if (what === 'cuts' && !id) return ''
    if (what === 'distributes' && !id) return ''
    return `<button type="button" data-role-toggle="${what}" data-on="${on ? '1' : '0'}" data-id="${esc(id ?? '')}"
                    data-name="${esc(m.name)}" aria-pressed="${on ? 'true' : 'false'}"
                    title="${esc(
                      what === 'cuts'
                        ? on ? 'Cuts this campaign: click to stop' : 'Let them cut this campaign too'
                        : on ? 'Distributes the finished clips, click to stop' : 'Let them distribute the finished clips too',
                    )}"
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                      on
                        ? 'bg-slate-900 text-white ring-slate-900 hover:bg-slate-700'
                        : 'bg-white text-slate-500 ring-slate-300 hover:text-slate-800 hover:ring-slate-400'
                    }">${glyph(what === 'cuts' ? SCISSORS_PATH : MEGAPHONE_PATH)}${what === 'cuts' ? 'Cuts' : 'Distributes'}<span class="sr-only">: ${on ? 'on' : 'off'}</span></button>`
  }

  const memberRows = o.members
    .map(
      (m) => `
            <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              ${avatar(m.name, m.role, 'h-10 w-10 text-sm')}
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  ${m.href ? `<a href="${esc(m.href)}" class="truncate font-semibold hover:text-brand">${esc(m.name)}</a>` : `<span class="truncate font-semibold">${esc(m.name)}</span>`}
                  ${roleBadge(m.role)}
                </p>
                ${m.email ? `<p class="truncate text-xs text-slate-500">${esc(m.email)}</p>` : ''}
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                ${m.role === 'creator' ? toggle(m, 'cuts') + toggle(m, 'distributes') : doesBadge('cuts')}
                <button type="button" data-team-remove="${esc(m.userId)}" data-project="${esc(p.id)}"
                        data-name="${esc(m.name)}" data-label="${esc(p.name)}" aria-label="Remove ${esc(m.name)} from the team"
                        class="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-200 transition hover:bg-red-50">Remove</button>
              </div>
            </li>`,
    )
    .join('')

  const candidateRows = o.candidates
    .map(
      (c) => `
              <label data-candidate data-search="${esc(`${c.name} ${c.email} ${c.role}`.toLowerCase())}"
                     class="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-slate-200 transition hover:ring-brand has-[:checked]:bg-blue-50 has-[:checked]:ring-brand">
                <input type="checkbox" value="${esc(c.userId)}" data-name="${esc(c.name)}" class="h-4 w-4 shrink-0 accent-[#2fe08c]">
                ${avatar(c.name, c.role, 'h-8 w-8 text-[11px]')}
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">${esc(c.name)}</span>
                  <span class="block truncate text-xs text-slate-500">${esc(c.email)}</span>
                </span>
                <span class="shrink-0 text-[11px] font-semibold ${c.role === 'creator' ? 'text-pink-700' : 'text-violet-700'}">${ROLE_STYLE[c.role].label}</span>
              </label>`,
    )
    .join('')

  const distributionNote = p.creatorDistribution
    ? p.status === 'aktiv'
      ? 'On: every creator on the team also posts the finished clips on their own channels (switched on automatically, including creators added earlier). Switch “Distributes” off per creator if needed.'
      : 'On, but the campaign is not active, creators post nothing until it is active again.'
    : o.ownerRole === 'creator'
      ? "Off: creators on the team only cut. Finished clips go to the campaign's accounts and the owner's own accounts."
      : 'Off: creators on the team only cut. Finished clips go to the campaign’s own accounts only.'

  return `
      <section id="team" class="mb-8 scroll-mt-6 rounded-2xl border-2 border-brand/25 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="team-title">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 max-w-2xl">
            <p class="text-[11px] font-bold uppercase tracking-wider text-brand">Team · ${o.members.length}</p>
            <h2 id="team-title" class="font-display text-xl font-extrabold tracking-tight sm:text-2xl">Who works on this campaign</h2>
            <p class="mt-1 text-sm text-slate-500">Add as many clippers and creators as you like. Clippers cut. A creator cuts and, while creator distribution is on, also posts the finished clips on their own channels; switch “Cuts” and “Distributes” per creator.</p>
          </div>
          <div class="w-full rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200 sm:w-72">
            <label class="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-700">
              <span class="inline-flex items-center gap-1.5">${glyph(MEGAPHONE_PATH, 'h-4 w-4')}Creator distribution</span>
              <input type="checkbox" data-distribution="${esc(p.id)}" class="peer sr-only"${p.creatorDistribution ? ' checked' : ''}>
              <span aria-hidden="true"
                    class="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:after:translate-x-4"></span>
            </label>
            <p class="mt-1.5 text-xs text-slate-500">${esc(distributionNote)}</p>
          </div>
        </div>

        ${
          o.members.length
            ? `<ul class="mt-4 divide-y divide-slate-100 border-y border-slate-100">${memberRows}</ul>`
            : `<p class="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">No team yet, and that is fine: the campaign is saved and only you can see it. Assign clippers or creators whenever you are ready; they are emailed as soon as there is footage.</p>`
        }
        <p data-role-msg class="mt-2 hidden text-sm font-semibold text-red-600" role="alert"></p>

        <div class="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-display text-base font-bold">Add to the team</h3>
            <span class="text-xs text-slate-500">${plural(o.candidates.length, 'person', 'people')} available</span>
          </div>
          ${
            o.candidates.length
              ? `<label for="team-filter" class="sr-only">Filter clippers and creators</label>
                 <input id="team-filter" type="search" data-team-filter autocomplete="off" placeholder="Filter by name or email"
                        class="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
                 <div role="group" aria-label="Available clippers and creators" class="mt-3 grid max-h-80 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-2">${candidateRows}</div>
                 <p data-team-none class="mt-3 hidden text-sm text-slate-500">Nobody matches this filter.</p>
                 <div class="mt-3 flex flex-wrap items-center gap-3">
                   <button type="button" data-team-add="${esc(p.id)}" disabled
                           class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-40">Add selected</button>
                   <span data-team-msg class="text-sm font-semibold text-slate-500" role="status"></span>
                 </div>`
              : `<p class="mt-2 text-sm text-slate-500">Every clipper and creator is already on this team, invite more under <a href="/admin/clipper" class="font-semibold text-brand hover:underline">Clippers</a>.</p>`
          }
        </div>
      </section>`
}

/** Hinzufügen (mehrere auf einmal), Schnitt/Verbreitung je Creator, Verbreitungs-Schalter. Braucht `send`. */
const TEAM_PANEL_JS = (projectId: string) => `
  (function () {
    var panel = document.getElementById('team');
    if (!panel) return;
    var projectId = ${jsonScript(projectId)};
    var filter = panel.querySelector('[data-team-filter]');
    var addBtn = panel.querySelector('[data-team-add]');
    var msg = panel.querySelector('[data-team-msg]');
    var boxes = Array.prototype.slice.call(panel.querySelectorAll('[data-candidate] input[type=checkbox]'));

    function selected() { return boxes.filter(function (b) { return b.checked; }); }
    function syncButton() {
      var n = selected().length;
      if (!addBtn) return;
      addBtn.disabled = n === 0;
      addBtn.textContent = n ? 'Add ' + n + ' to the team' : 'Add selected';
    }
    boxes.forEach(function (b) { b.addEventListener('change', syncButton); });

    if (filter) filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      panel.querySelectorAll('[data-candidate]').forEach(function (row) {
        var hit = !q || row.getAttribute('data-search').indexOf(q) !== -1;
        row.classList.toggle('hidden', !hit);
        if (hit) shown++;
      });
      panel.querySelector('[data-team-none]').classList.toggle('hidden', shown > 0);
    });

    /* Nacheinander, nicht gleichzeitig: jede Zuordnung kann eine Mail
       auslösen, und eine Fehlermeldung soll beim richtigen Namen stehen. */
    if (addBtn) addBtn.addEventListener('click', function () {
      var list = selected();
      if (!list.length) return;
      addBtn.disabled = true;
      var failed = [];
      var done = 0;
      function next(i) {
        if (i >= list.length) {
          if (failed.length) {
            msg.className = 'text-sm font-semibold text-red-600';
            msg.textContent = (done ? done + ' added. ' : '') + failed.join(' ');
            if (done) window.setTimeout(function () { window.location.reload(); }, 2500);
            else addBtn.disabled = false;
            return;
          }
          window.location.hash = 'team';
          window.location.reload();
          return;
        }
        var box = list[i];
        msg.className = 'text-sm font-semibold text-slate-500';
        msg.textContent = 'Adding ' + box.getAttribute('data-name') + ' \\u2026';
        send('/api/admin/projects/' + encodeURIComponent(projectId) + '/team', 'POST', { userId: box.value })
          .then(function () { done++; })
          .catch(function (e) { failed.push(box.getAttribute('data-name') + ': ' + e.message); })
          .then(function () { next(i + 1); });
      }
      next(0);
    });

    /* Schnitt und Verbreitung je Creator. */
    var roleMsg = panel.querySelector('[data-role-msg]');
    panel.querySelectorAll('[data-role-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var what = btn.getAttribute('data-role-toggle');
        var on = btn.getAttribute('data-on') === '1';
        var id = btn.getAttribute('data-id');
        var who = btn.getAttribute('data-name');
        if (on && !window.confirm(what === 'cuts'
          ? 'Stop ' + who + ' from cutting this campaign? They lose access to the footage and are told by email.'
          : 'Stop ' + who + ' from distributing this campaign? What they already posted stays on their channels.')) return;
        btn.disabled = true;
        roleMsg.classList.add('hidden');
        var base = '/api/admin/projects/' + encodeURIComponent(projectId) + (what === 'cuts' ? '/workers' : '/creators');
        var call = on
          ? send(base + '/' + encodeURIComponent(id), 'DELETE')
          : send(base, 'POST', what === 'cuts' ? { clipperId: id } : { creatorId: id });
        call.then(function () { window.location.hash = 'team'; window.location.reload(); })
          .catch(function (e) { roleMsg.textContent = who + ': ' + e.message; roleMsg.classList.remove('hidden'); btn.disabled = false; });
      });
    });

    panel.querySelectorAll('[data-distribution]').forEach(function (box) {
      box.addEventListener('change', function () {
        var wanted = box.checked;
        box.disabled = true;
        send('/api/admin/projects/' + encodeURIComponent(box.getAttribute('data-distribution')) + '/distribution', 'PATCH', { enabled: wanted })
          .then(function () { window.location.hash = 'team'; window.location.reload(); })
          // Der Schalter springt zurück — er zeigt nie einen Stand, der nicht gespeichert ist.
          .catch(function (e) { window.alert(e.message); box.checked = !wanted; box.disabled = false; });
      });
    });
  })();`

/**
 * Veröffentlichung: welche Social-Accounts an dieser Kampagne hängen und der
 * Weg, weitere zu verbinden.
 *
 * Solange hier nichts steht, geht ein fertiger Clip nirgendwohin — das muss
 * auf einen Blick sichtbar sein und nicht erst auffallen, wenn ein Video
 * still liegen bleibt.
 *
 * Eine Spalte je Plattform, mit dem echten Markenzeichen als Kopf. Jede
 * Spalte hat ihren eigenen „+"-Knopf, beliebig oft klickbar — eine Kampagne
 * bekommt mehrere Accounts derselben Plattform, und jeder braucht seine
 * eigene Zustimmung.
 *
 * Creator-Kampagne: die Accounts des Creators stehen mit in der Spalte, nur
 * zur Ansicht (kein Trennen — das ist seine Sache unter „Meine Accounts“).
 * Und kein „+“: ein Account hier wäre dasselbe Konto ein zweites Mal
 * abgerechnet, und Creator selbst dürfen an der Kampagne ohnehin nicht
 * verbinden.
 */
function publishingSection(o: {
  project: { id: string; publishError: string | null }
  ownedByCreator: boolean
  socialAccounts: SocialAccount[]
  creatorAccounts: SocialAccount[]
}): string {
  const p = o.project
  const columns = CONNECT_PLATFORMS.map((pl) => {
    const accountsOfPlatform = o.socialAccounts.filter((a) => a.platform === pl.key)
    const creatorOfPlatform = o.creatorAccounts.filter((a) => a.platform === pl.key)
    const creatorRows = creatorOfPlatform
      .map(
        (a) => `
                    <li class="flex items-center justify-between gap-1 rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-inset ring-pink-200"
                        title="Connected by the creator, every finished clip goes here automatically">
                      <span class="truncate font-medium text-slate-700">${esc(a.username || a.displayName || '–')}</span>
                      <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-pink-600">creator</span>
                    </li>`,
      )
      .join('')
    const ownRows = accountsOfPlatform
      .map(
        (a) => `
                    <li class="flex items-center justify-between gap-1 rounded-lg bg-white px-2 py-1.5 text-xs ring-1 ring-inset ring-slate-200">
                      <span class="truncate font-medium text-slate-700">${esc(a.username || a.displayName || '–')}</span>
                      <button type="button" data-disconnect="${esc(p.id)}" data-account="${esc(a.id)}"
                              data-label="${esc(`${pl.label} ${a.username || a.displayName || ''}`.trim())}"
                              title="Disconnect this account" aria-label="Disconnect ${esc(`${pl.label} ${a.username || a.displayName || ''}`.trim())}"
                              class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-600">×</button>
                    </li>`,
      )
      .join('')
    const rows = creatorRows + ownRows || `<li class="px-0.5 py-1 text-[11px] leading-snug text-slate-400">No account connected</li>`

    return `
              <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div class="flex items-center justify-between gap-1.5">
                  <span class="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-700">
                    ${platformIcon(pl.key)}
                    <span class="truncate">${esc(pl.label)}</span>
                  </span>
                  ${
                    o.ownedByCreator
                      ? ''
                      : `<button type="button" data-connect="${esc(p.id)}" data-platform="${pl.key}"
                          title="Connect another ${esc(pl.label)} account" aria-label="Connect another ${esc(pl.label)} account"
                          class="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white transition hover:bg-slate-700">+</button>`
                  }
                </div>
                <ul class="mt-2 space-y-1">${rows}</ul>
              </div>`
  }).join('')

  const total = o.socialAccounts.length + o.creatorAccounts.length
  return `
      <section id="publishing" class="mt-10 scroll-mt-6">
        ${sectionHead(
          'Publishing',
          `<button type="button" data-syncaccounts="${esc(p.id)}"
                   class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-brand hover:text-brand">Sync accounts</button>`,
        )}
        <p class="-mt-1 mb-4 text-sm text-slate-500">${
          total
            ? `Every finished clip goes to these ${plural(total, 'account', 'accounts')} automatically.`
            : 'No account connected yet, finished clips go nowhere until one is.'
        }</p>
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div class="grid grid-cols-2 items-start gap-2.5 sm:grid-cols-3 xl:grid-cols-6">${columns}</div>
          ${
            o.ownedByCreator
              ? `<p class="mt-3 text-xs text-slate-500">
                   <strong class="font-semibold text-slate-600">Creator campaign:</strong>
                   every finished clip goes automatically to the accounts the creator connected under “Meine Accounts” (/kampagnen/accounts).
                   They are managed there, not here, connecting the same account on the campaign would be billed twice.
                 </p>`
              : `<p class="mt-3 text-xs text-slate-400">
                   <strong class="font-semibold text-slate-500">Multiple accounts on the same platform:</strong>
                   TikTok and YouTube ask on their own which account is meant.
                   Instagram does not: log out of Instagram first or use a private window,
                   otherwise the account you happen to be logged into always gets connected.
                   For X, do the same if the wrong account ends up connected.
                   Facebook and LinkedIn let you pick the page in the next step.
                 </p>`
          }
          ${
            /*
             * Der letzte gescheiterte Verbindungsversuch — mit einem Weg, ihn
             * wegzuklicken. Ohne den blieb ein längst erledigter Fehler
             * tagelang rot stehen.
             */
            p.publishError
              ? `<div class="mt-3 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-inset ring-red-200">
                   <span><strong class="font-semibold">Last connection attempt failed.</strong> ${esc(p.publishError)}</span>
                   <button type="button" data-clearerror="${esc(p.id)}"
                           title="Dismiss this message" aria-label="Dismiss this message"
                           class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-red-400 transition hover:bg-red-200 hover:text-red-700">×</button>
                 </div>`
              : ''
          }
        </div>
      </section>`
}

/** Verbinden, Abgleichen, Trennen, Fehlermeldung wegklicken. Braucht `send`. */
const PUBLISHING_JS = `
  /* Zurück aus dem Verbinden: Die Meldung steht schon oben. Die angehängten
     Parameter verschwinden aus der Adresse — sonst wertete jedes Neuladen
     (auch das nach „Disconnect“) die Rückkehr erneut aus und trüge einen
     eben getrennten Account wieder ein. */
  if (/[?&](connected|error)=/.test(window.location.search) && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + '#publishing');
  }

  document.querySelectorAll('[data-connect]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = '\\u2026';
      send('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-connect')) +
           '/connect/' + btn.getAttribute('data-platform'), 'POST', {})
        .then(function (d) {
          // Neues Fenster statt Weiterleitung: die Kampagne bleibt offen,
          // sodass sich mehrere Accounts nacheinander verbinden lassen.
          window.open(d.url, '_blank', 'noopener');
          btn.disabled = false;
          btn.innerHTML = label;
        })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; btn.innerHTML = label; });
    });
  });

  document.querySelectorAll('[data-syncaccounts]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Syncing \\u2026';
      send('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-syncaccounts')) + '/sync-accounts', 'POST', {})
        .then(function () { window.location.hash = 'publishing'; window.location.reload(); })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; btn.textContent = 'Sync accounts'; });
    });
  });

  document.querySelectorAll('[data-clearerror]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.parentNode;
      btn.disabled = true;
      fetch('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-clearerror')) + '/publish-error', { method: 'DELETE' })
        .then(function (r) {
          if (!r.ok) throw new Error('Could not dismiss the message.');
          if (box && box.parentNode) box.parentNode.removeChild(box);
        })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });

  document.querySelectorAll('[data-disconnect]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('Disconnect "' + btn.getAttribute('data-label') + '"? Finished clips stop going to this account. You can reconnect it any time.')) return;
      btn.disabled = true;
      send('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-disconnect')) + '/accounts/' + encodeURIComponent(btn.getAttribute('data-account')), 'DELETE')
        .then(function () { window.location.hash = 'publishing'; window.location.reload(); })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });`

/** Ein Cloud-Link als große Kachel — Symbol des Anbieters wie im Thumbnail. */
function cloudLinkTile(l: ProjectCloudLink): string {
  const host = linkHost(l.url) || 'Link'
  const thumb: ThumbView = l.provider
    ? { kind: 'cloud', host, provider: l.provider }
    : { kind: 'cloud', host, provider: { id: 'web', label: host, bundled: false } }
  const safe = /^https:\/\//i.test(l.url)
  const inner = `
            ${campaignThumb(thumb, host)}
            <span class="block px-3 py-2.5">
              <span class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-semibold text-slate-800">${esc(l.provider?.bundled ? l.provider.label : host)}</span>
                ${safe ? '<span class="shrink-0 text-xs font-semibold text-brand">Open ↗</span>' : ''}
              </span>
              <span class="block truncate text-[11px] text-slate-500" title="${esc(l.url)}">${esc(shortUrl(l.url, 48))}</span>
              <span class="block text-[11px] text-slate-400" title="${esc(dateTimeEN(l.createdAt))}">Added ${esc(dateEN(l.createdAt))}</span>
            </span>`
  const cls = 'group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand hover:shadow-md'
  return safe
    ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="${cls} focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" aria-label="Open the shared folder on ${esc(host)} in a new tab">${inner}</a>`
    : `<div class="${cls}">${inner}</div>`
}

export function campaignDetailPage(o: {
  user: User
  /** Für Thumbnail und Kopf — dieselbe Form wie auf den Karten. */
  campaign: AdminCampaign
  project: {
    id: string
    name: string
    status: string
    createdAt: number
    thumbKey: string | null
    creatorDistribution: boolean
    publishError: string | null
    /** Bei Agentur-Kampagnen: das Briefing, über das sie entstand. */
    briefing?: Briefing | null
    /** Bei Kunden-Kampagnen aus „Neue Kampagne“: Laufzeit und gewünschte Reichweite. */
    request?: { durationDays: number; views: number | null } | null
  }
  /** `role: 'creator'` heißt: Die Kampagne ist die eigene eines Creators. */
  owner: {
    customerId: string
    label: string
    fullName: string
    company: string | null
    email: string
    phone: string | null
    role: Role
    href: string
  }
  members: TeamMemberView[]
  candidates: TeamCandidate[]
  folders: ProjectMediaFolder[]
  /** Geteilte Cloud-Ordner — Material wie die hochgeladenen Dateien. */
  links: ProjectCloudLink[]
  reels: ProjectReel[]
  /** Dateien im Papierkorb des Besitzers — sie zählen nicht mit, fehlen aber sonst unerklärt. */
  trashedFiles: number
  /** Echte Zahlen der ganzen Kampagne, Stand ihres Abgleichs und eine laufende 402-Pause. */
  reach: { totals?: MetricTotalsWithCreators; sync: SyncOverview; pausedUntil: number | null }
  socialAccounts: SocialAccount[]
  /** Bei einer Creator-Kampagne: die Accounts des Creators (nur zur Ansicht). */
  creatorAccounts: SocialAccount[]
  /** Rückmeldung nach dem Verbinden eines Accounts. */
  flash?: { ok?: string; error?: string }
}): string {
  const p = o.project
  const ownedByCreator = o.owner.role === 'creator'
  const rawFiles = o.folders.reduce((n, f) => n + f.files.length, 0)
  const rawBytes = o.folders.reduce((n, f) => n + f.bytes, 0)
  const lastUpload = o.folders
    .flatMap((f) => f.files.map((file) => file.createdAt))
    .reduce((max, ts) => (ts > max ? ts : max), 0)

  const flashBox = o.flash?.ok
    ? `<div class="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200" role="status">${esc(o.flash.ok)}</div>`
    : o.flash?.error
      ? `<div class="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 ring-1 ring-inset ring-red-200" role="alert">${esc(o.flash.error)}</div>`
      : ''

  const folderBlocks = o.folders
    .map(
      (f) => `
        <section class="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <h3 class="flex min-w-0 items-center gap-2 font-display text-lg font-bold">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6 shrink-0 text-amber-400" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>
              <span class="truncate">${esc(f.path)}</span>
            </h3>
            <span class="text-xs text-slate-500">${plural(f.files.length, 'file', 'files')} · ${formatBytes(f.bytes)}</span>
          </div>
          ${
            f.files.length
              ? `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${f.files
                  .map((file) =>
                    mediaTile({
                      id: file.id,
                      kind: 'raw',
                      name: file.filename,
                      video: file.video,
                      meta: `${formatBytes(file.bytes)} · ${dateEN(file.createdAt)}`,
                      ratio: 'aspect-video',
                    }),
                  )
                  .join('')}</div>`
              : `<p class="text-sm text-slate-500">This folder is empty.</p>`
          }
        </section>`,
    )
    .join('')

  const reelCards = o.reels
    .map((r) =>
      mediaTile({
        id: r.id,
        kind: 'reel',
        name: r.caption || r.filename,
        video: /\.(mp4|mov|avi|mkv|webm)$/i.test(r.filename),
        meta: `${r.clipper ? `${esc(r.clipper)} · ` : ''}${formatBytes(r.bytes)} · ${dateEN(r.createdAt)}`,
        ratio: 'aspect-[9/16]',
        footer: `<div class="border-t border-slate-100 px-3 py-2.5">${reelPublishBadge(r)}</div>${reelReach(r)}`,
      }),
    )
    .join('')

  const paused = metricsPausedNote(o.reach.pausedUntil, 'en', { admin: true })
  const reachSection = `
      <div class="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start">
        ${metricStrip(o.reach.totals, 'en', { label: 'Reach of the whole campaign' })}
        <div class="min-w-0">
          ${
            o.reach.totals?.viaCreators.posts
              ? metricStrip(o.reach.totals.viaCreators, 'en', { label: 'Of which via creators' })
              : `<p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sync</p>`
          }
          ${syncSummary(o.reach.sync, 'project')}
        </div>
        ${refreshMetricsButton(p.id, p.name)}
      </div>
      ${paused ? `<div class="mb-5">${paused}</div>` : ''}`

  const header = `
      <a href="/admin/projekte" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Back to all campaigns</a>
      ${flashBox}
      <section class="mb-6 grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div class="min-w-0">
          <div class="overflow-hidden rounded-xl">${campaignThumb(o.campaign.thumb, p.name)}</div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
            ${thumbUploadButtons(`/api/admin/projects/${p.id}/thumb`, { lang: 'en', hasCustom: Boolean(p.thumbKey) })}
            <span class="text-[11px] text-slate-400">${p.thumbKey ? 'Own thumbnail' : 'Automatic thumbnail'}</span>
          </div>
        </div>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">${
            ownedByCreator ? 'Creator campaign' : 'Customer campaign'
          } · <a href="${esc(o.owner.href)}" class="text-slate-600 hover:text-brand">${esc(ownedByCreator ? o.owner.fullName : o.owner.label)}</a></p>
          <h1 class="mt-1 flex items-start gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span class="min-w-0 break-words">${esc(p.name)}</span>
            <button type="button" data-rename="${esc(p.id)}" data-label="${esc(p.name)}" title="Rename campaign" aria-label="Rename campaign"
                    class="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          </h1>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            ${statusBadge(p.status)}
            ${ownedByCreator ? originBadge('own', 'en') : ''}
            ${p.creatorDistribution ? badge('Creator distribution on', 'blue') : ''}
            <label class="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-500">
              Status
              <select data-status="${esc(p.id)}" class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand">
                ${PROJECT_STATUS.map((s) => `<option value="${s}"${s === p.status ? ' selected' : ''}>${esc(projectStatusLabel(s))}</option>`).join('')}
              </select>
            </label>
          </div>
          <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div class="min-w-0">
              <dt class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">${ownedByCreator ? 'Creator' : 'Customer'}</dt>
              <dd class="mt-0.5 min-w-0">
                <a href="${esc(o.owner.href)}" class="font-semibold hover:text-brand">${esc(ownedByCreator ? o.owner.fullName : o.owner.label)}</a>
                ${!ownedByCreator && o.owner.company ? `<span class="text-slate-500">· ${esc(o.owner.fullName)}</span>` : ''}
                <span class="block truncate"><a href="mailto:${esc(o.owner.email)}" class="text-slate-500 hover:text-brand">${esc(o.owner.email)}</a></span>
                ${telHref(o.owner.phone) ? `<span class="block">${phoneLink(o.owner.phone, 'text-slate-500 hover:text-brand')}</span>` : ''}
                <button type="button" data-editcustomer="${esc(o.owner.customerId)}"
                        data-name="${esc(o.owner.fullName)}" data-company="${esc(o.owner.company ?? '')}"
                        data-email="${esc(o.owner.email)}"
                        data-dial="${esc(splitPhone(o.owner.phone).dial)}"
                        data-national="${esc(splitPhone(o.owner.phone).national)}"
                        class="mt-1 text-xs font-semibold text-brand hover:underline">Edit contact data</button>
              </dd>
            </div>
            <div>
              <dt class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Created</dt>
              <dd class="mt-0.5 font-semibold text-slate-700" title="${esc(dateTimeEN(p.createdAt))}">${esc(dateEN(p.createdAt))}</dd>
              ${
                p.briefing
                  ? `<dt class="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agency briefing</dt>
              <dd class="mt-0.5 font-semibold text-slate-700" data-briefing-info>${esc(`${viewsShort(p.briefing.views)} views`)} · ${esc(
                formatEuro(p.briefing.budgetCents),
              )} · ${esc(formatEuro(pricePerThousandCents(p.briefing)))} per 1,000 views<span class="block text-xs font-normal text-slate-500">${esc(
                [
                  p.briefing.pkg ? agencyPackageLabel(p.briefing.pkg) : '',
                  p.briefing.niche ?? '',
                  p.briefing.platforms.map(agencyPlatformLabel).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · '),
              )}</span></dd>`
                  : ''
              }${
                p.request
                  ? `<dt class="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer request</dt>
              <dd class="mt-0.5 font-semibold text-slate-700" data-request-info>${esc(`${p.request.durationDays} days`)}${
                p.request.views ? ` · ${esc(p.request.views.toLocaleString('en-GB'))} views` : ''
              }<span class="block text-xs font-normal text-slate-500">Runtime and desired reach from the customer's campaign form</span></dd>`
                  : ''
              }
              <dt class="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Team</dt>
              <dd class="mt-1">${
                o.members.length
                  ? `<div class="flex flex-wrap gap-1.5">${o.members.map((m) => teamChip(m, m.href)).join('')}</div>`
                  : `<a href="#team" class="font-semibold text-amber-700 hover:underline">No team yet: assign ↓</a>`
              }</dd>
            </div>
          </dl>
          ${kpis(
            [
              { label: 'Files', value: String(rawFiles) },
              { label: 'Size', value: formatBytes(rawBytes) },
              { label: 'Folders', value: String(o.folders.length) },
              { label: 'Cloud links', value: String(o.links.length) },
              { label: 'Clips', value: String(o.reels.length) },
              { label: 'Last upload', value: lastUpload ? dateEN(lastUpload) : '–' },
              ...(o.trashedFiles ? [{ label: 'In trash', value: String(o.trashedFiles) }] : []),
            ],
            'mt-4',
          )}
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" data-del-project="${esc(p.id)}" data-label="${esc(p.name)}" data-files="${rawFiles}"
                    class="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">Delete campaign</button>
          </div>
        </div>
      </section>`

  const material = `
      <section id="material" class="scroll-mt-6">
        ${sectionHead('Material', `<span class="shrink-0 text-xs text-slate-500">${esc(
          [plural(rawFiles, 'file', 'files'), plural(o.links.length, 'cloud link', 'cloud links')].join(' · '),
        )}</span>`)}
        <p class="-mt-1 mb-4 text-sm text-slate-500">Everything ${ownedByCreator ? 'the creator' : 'the customer'} uploaded or shared: exactly what the team sees. Click a tile to watch it here; no download needed.</p>
        ${
          o.links.length
            ? `<div class="mb-6">
                 <h3 class="mb-3 font-display text-base font-bold">Cloud links</h3>
                 <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">${o.links.map(cloudLinkTile).join('')}</div>
               </div>`
            : ''
        }
        ${
          rawFiles
            ? folderBlocks
            : o.links.length
              ? `<p class="text-sm text-slate-500">No uploaded files yet, the footage is behind the cloud links above.</p>`
              : emptyState('No footage yet', 'It shows up here the moment footage is uploaded or a cloud link is shared.')
        }
        ${o.trashedFiles ? `<p class="mt-2 text-xs text-slate-400">${plural(o.trashedFiles, 'file', 'files')} in the owner’s trash, not counted and not visible to the team.</p>` : ''}
      </section>`

  const clips = `
      <section id="clips" class="mt-10 scroll-mt-6">
        ${sectionHead('Finished clips', `<span class="shrink-0 text-xs text-slate-500">${plural(o.reels.length, 'clip', 'clips')}</span>`)}
        <p class="-mt-1 mb-4 text-sm text-slate-500">What the team delivered, where each clip went and what it reached.</p>
        ${reachSection}
        ${
          o.reels.length
            ? `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">${reelCards}</div>`
            : emptyState('No finished clips yet', 'Clips the team uploads for this campaign appear here.')
        }
      </section>`

  const contactModal = `
      <div id="ec-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="ec-title">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="ec-title" class="font-display text-lg font-bold">Contact data</h2>
          <p class="mt-1 text-sm text-slate-500">
            Applies to the account and to the lead entries behind it.
            The email address is also the login address, the next login code goes to the new one.
          </p>
          ${contactFields('ec')}
          <p id="ec-err" class="mt-2 hidden text-sm font-medium text-red-600" role="alert"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-ec class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Cancel</button>
            <button type="button" id="ec-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">Save</button>
          </div>
        </div>
      </div>`

  const body =
    PLATFORM_ICON_DEFS +
    header +
    teamPanel({ project: p, ownerRole: o.owner.role, members: o.members, candidates: o.candidates }) +
    material +
    clips +
    publishingSection({
      project: p,
      ownedByCreator,
      socialAccounts: o.socialAccounts,
      creatorAccounts: o.creatorAccounts,
    }) +
    contactModal +
    VIEWER_HTML

  const pageJs = `
(function () {${SEND_JS}${TEAM_REMOVE_JS}${DELETE_CAMPAIGN_JS('list')}
${TEAM_PANEL_JS(p.id)}
${PUBLISHING_JS}

  /* ---- Umbenennen ---- */
  document.querySelectorAll('[data-rename]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var current = btn.getAttribute('data-label');
      var next = window.prompt('Campaign name', current);
      if (next === null) return;
      next = next.trim();
      if (!next || next === current) return;
      btn.disabled = true;
      send('/api/admin/projects/' + encodeURIComponent(btn.getAttribute('data-rename')), 'POST', { name: next })
        .then(function () { window.location.reload(); })
        .catch(function (e) { window.alert(e.message); btn.disabled = false; });
    });
  });

  /* ---- Status ---- */
  document.querySelectorAll('[data-status]').forEach(function (sel) {
    var before = sel.value;
    sel.addEventListener('change', function () {
      sel.disabled = true;
      send('/api/admin/projects/' + encodeURIComponent(sel.getAttribute('data-status')), 'POST', { status: sel.value })
        .then(function () { window.location.reload(); })
        .catch(function (e) { window.alert(e.message); sel.value = before; sel.disabled = false; });
    });
  });

  /* ---- Kontaktdaten des Besitzers ---- */
  var ec = document.getElementById('ec-modal');
  var ecErr = document.getElementById('ec-err');
  var ecId = null;
  function ecClose() { ec.classList.add('hidden'); ec.classList.remove('flex'); }
  document.querySelectorAll('[data-editcustomer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ecId = btn.getAttribute('data-editcustomer');
      document.getElementById('ec-name').value = btn.getAttribute('data-name') || '';
      document.getElementById('ec-company').value = btn.getAttribute('data-company') || '';
      document.getElementById('ec-email').value = btn.getAttribute('data-email') || '';
      /* Vorwahl und Nummer kommen getrennt — zerlegt hat sie der Server. */
      document.getElementById('ec-dial').value = btn.getAttribute('data-dial') || '';
      document.getElementById('ec-phone').value = btn.getAttribute('data-national') || '';
      ecErr.classList.add('hidden');
      ec.classList.remove('hidden');
      ec.classList.add('flex');
      document.getElementById('ec-name').focus();
    });
  });
  document.querySelectorAll('[data-close-ec]').forEach(function (b) { b.addEventListener('click', ecClose); });
  ec.addEventListener('click', function (e) { if (e.target === ec) ecClose(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ec.classList.contains('hidden')) ecClose(); });
  document.getElementById('ec-save').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    send('/api/admin/customers/' + encodeURIComponent(ecId), 'POST', {
      fullName: document.getElementById('ec-name').value,
      company: document.getElementById('ec-company').value,
      email: document.getElementById('ec-email').value,
      phoneDial: document.getElementById('ec-dial').value,
      phone: document.getElementById('ec-phone').value
    }).then(function () { window.location.reload(); })
      .catch(function (e) { ecErr.textContent = e.message; ecErr.classList.remove('hidden'); btn.disabled = false; });
  });
})();`

  return shell({
    title: p.name,
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/projekte',
    body,
    script: pageJs + mediaScript + REFRESH_METRICS_SCRIPT,
  })
}

/**
 * Vorschaubilder und der Player.
 *
 * Die eine Regel, an der hier alles hängt: Die ORIGINALDATEI wird erst
 * angefasst, wenn jemand sie wirklich ansehen will.
 *
 * Vorher war das anders, und daran krankte die Seite. Jede Kachel war ein
 * <video> mit der Adresse der Originaldatei; der Browser las Kopfdaten,
 * sprang auf Sekunde 0,4 und decodierte ein Bild — je Kachel, alle
 * gleichzeitig. Bei Rohmaterial sind das zwanzig Dateien von je mehreren
 * hundert Megabyte auf einmal. Die Seite ruckelte, und der Clip, den Jason
 * dann anklickte, bekam von der Leitung nichts mehr ab: „das Video steckt
 * und laggt sehr stark".
 *
 * Was jetzt passiert:
 *
 *   · Kacheln melden sich über einen IntersectionObserver, sobald sie ins
 *     Bild kommen. Die IDs sammeln sich kurz und gehen dann GEBÜNDELT an den
 *     Server — ein Ordner mit hundert Clips kostet so zwei Anfragen statt
 *     hundert. Zurück kommt die Adresse eines JPEG von wenigen Dutzend
 *     Kilobyte.
 *   · Fehlt das JPEG noch — Material von vor dieser Änderung —, erzeugt es
 *     der Browser einmalig aus dem Original und legt es in R2 ab. Das ist
 *     der einzige Fall, in dem hier noch Videodaten fließen, und er läuft
 *     streng nacheinander, eine Datei zur Zeit.
 *   · Solange der Player offen ist, ruht dieses Nacherzeugen vollständig.
 *     Wer ein Video ansieht, soll die ganze Leitung haben.
 *   · Der Player holt seine Adresse jedes Mal frisch. Eine signierte Adresse
 *     gilt eine Stunde; eine Seite, die den Vormittag über offen steht,
 *     hätte sonst Kacheln, die noch da sind, und einen Player, der 403 sagt.
 */
const mediaScript = `
(function () {
  /* So viele Kacheln gehen in einer Anfrage zusammen. Der Server nimmt 60. */
  var BATCH = 24;

  /* Bekannte Vorschaubilder. Der Player nimmt sie als Standbild, damit auf
     dem schwarzen Feld sofort etwas steht, während das Video anläuft. */
  var thumbUrl = {};

  var pending = [];
  var timer = 0;

  function post(url, payload) {
    return fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Preview not available.');
        return d;
      });
    });
  }

  function noop() {}

  /* Erst einblenden, wenn das Bild wirklich steht — sonst blitzt kurz ein
     leerer Rahmen auf. */
  function showImage(el, url) {
    el.addEventListener('load', function () {
      el.style.opacity = '1';
      /* Ein frisch erzeugtes Bild hängt als Blob im Speicher. Sobald es
         gezeichnet ist, wird der Verweis nicht mehr gebraucht. */
      if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
    }, { once: true });
    el.src = url;
  }

  function kindOf(el) { return el.getAttribute('data-kind-of') === 'reel' ? 'reel' : 'raw'; }

  /* ---- Adressen holen ---- */

  function flush() {
    timer = 0;
    if (!pending.length) return;
    var batch = pending.splice(0, BATCH);
    var raw = [], reels = [];
    batch.forEach(function (el) {
      (kindOf(el) === 'reel' ? reels : raw).push(el.getAttribute('data-media'));
    });

    post('/api/admin/media/urls', { assets: raw, deliverables: reels })
      .then(function (d) {
        var thumbs = d.thumbs || {};
        var sources = d.sources || {};
        batch.forEach(function (el) {
          var id = el.getAttribute('data-media');
          if (thumbs[id]) {
            thumbUrl[id] = thumbs[id];
            showImage(el, thumbs[id]);
          } else if (sources[id]) {
            queue.push({ el: el, id: id, source: sources[id] });
            work();
          }
          /* Weder noch heißt: Es wurde schon einmal vergeblich versucht, ein
             Bild zu gewinnen. Die Kachel bleibt beim Symbol — der Player
             öffnet die Datei trotzdem. */
        });
      })
      .catch(noop)
      .then(function () { if (pending.length) schedule(); });
  }

  function schedule() { if (!timer) timer = window.setTimeout(flush, 80); }

  /* ---- Fehlende Vorschaubilder nachträglich erzeugen ----

     Nur für Material von vor dieser Änderung. Hier muss der Browser die
     Originaldatei anfassen — also genau das, was die Seite früher für jede
     Kachel gleichzeitig tat. Deshalb: immer nur EINE Datei, nie während der
     Player offen ist, und das Ergebnis wandert nach R2, damit es beim
     nächsten Aufruf einfach da ist. */

  var queue = [];
  var current = null;
  var paused = false;

  function work() {
    if (current || paused || !queue.length || !window.NMPoster) return;

    var task = queue.shift();
    var el = task.el;
    var body = { kind: kindOf(el), id: task.id };
    var state = { task: task, cancelled: false };
    state.job = window.NMPoster.job(task.source, el.getAttribute('data-is-video') === '1');
    current = state;

    state.job.promise
      .then(function (blob) {
        /* Abgebrochen, weil der Player aufging — kein Ergebnis, kein Vermerk.
           Die Aufgabe liegt schon wieder in der Schlange. */
        if (state.cancelled) return;

        if (!blob) {
          /* Nicht jede Datei lässt sich im Browser decodieren (ProRes, viele
             AVI/MKV). Das wird vermerkt, sonst lüde der nächste Aufruf sie
             wieder herunter, nur um wieder zu scheitern. */
          return post('/api/admin/media/thumb/done', { kind: body.kind, id: body.id, ok: false });
        }

        /* Sofort zeigen — das Bild liegt ja schon hier. */
        showImage(el, URL.createObjectURL(blob));
        return post('/api/admin/media/thumb', body)
          .then(function (d) { return fetch(d.url, { method: 'PUT', body: blob }); })
          .then(function (r) { if (!r.ok) throw new Error('upload failed'); })
          .then(function () { return post('/api/admin/media/thumb/done', body); });
      })
      .catch(noop)
      .then(function () {
        if (current === state) current = null;
        work();
      });
  }

  function pauseWork() {
    paused = true;
    if (!current) return;
    current.cancelled = true;
    queue.unshift(current.task);   // später noch einmal
    current.job.cancel();          // bricht auch die laufende Übertragung ab
  }

  function resumeWork() { paused = false; work(); }

  /* ---- Kacheln beobachten ---- */

  var thumbs = Array.prototype.slice.call(document.querySelectorAll('[data-media]'));

  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        pending.push(entry.target);
        schedule();
      });
    }, { rootMargin: '400px 0px' });
    thumbs.forEach(function (el) { io.observe(el); });
  } else {
    // Ohne Observer eben alles auf einmal — es sind nur Adressen und JPEGs.
    pending = thumbs.slice();
    schedule();
  }

  /* ---- Player ---- */

  var viewer = document.getElementById('viewer');
  var slot = document.getElementById('viewer-slot');
  var nameEl = document.getElementById('viewer-name');
  var posEl = document.getElementById('viewer-pos');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-open]'));
  var index = -1;

  function endpoint(kind, id, download) {
    return '/api/admin/' + (kind === 'reel' ? 'deliverables' : 'assets') + '/' + id + '/url' +
           (download ? '?download=1' : '');
  }

  function show(i) {
    if (i < 0 || i >= items.length) return;
    index = i;
    var btn = items[i];
    var id = btn.getAttribute('data-open');
    var kind = btn.getAttribute('data-kind');
    var isVideo = btn.getAttribute('data-video') === '1';

    /* Ab jetzt gehört die Leitung dem Player. */
    pauseWork();

    var sameKind = items.filter(function (el) { return el.getAttribute('data-kind') === kind; });
    nameEl.textContent = btn.getAttribute('data-name') || '';
    /* Gezählt wird innerhalb der Art: „3 von 12 Rohaufnahmen" — die fertigen
       Clips gehören nicht in dieselbe Reihe, und weitergeblättert wird auch
       nicht dorthin. */
    posEl.textContent = (sameKind.indexOf(btn) + 1) + ' of ' + sameKind.length +
                        (kind === 'reel' ? ' finished clips' : ' raw files');
    slot.innerHTML = '<p class="p-8 text-sm text-white/60">Loading …</p>';
    viewer.classList.remove('hidden');
    viewer.classList.add('flex');

    fetch(endpoint(kind, id, false))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.url) throw new Error(d.error || 'This file cannot be opened.');
        return d.url;
      }); })
      .then(function (url) {
        if (index !== i) return; // inzwischen weitergeblättert
        /* Das Vorschaubild als Standbild: Es liegt im Zwischenspeicher des
           Browsers, steht also sofort, während das Video erst anläuft. */
        var poster = thumbUrl[id] ? ' poster="' + thumbUrl[id].replace(/"/g, '%22') + '"' : '';
        slot.innerHTML = isVideo
          ? '<video src="' + url + '"' + poster + ' controls autoplay playsinline preload="auto" class="max-h-[76vh] w-full bg-black"></video>'
          : '<img src="' + url + '" alt="" class="max-h-[76vh] w-full object-contain">';
      })
      .catch(function (err) {
        slot.innerHTML = '<p class="p-8 text-sm text-red-300">' + (err.message || 'Error') + '</p>';
      });
  }

  function close() {
    viewer.classList.add('hidden');
    viewer.classList.remove('flex');
    /* Leeren beendet auch den laufenden Videostrom — sonst lüde er im
       Verborgenen weiter. */
    slot.innerHTML = '';
    index = -1;
    resumeWork();
  }

  function step(delta) {
    if (index < 0) return;
    var kind = items[index].getAttribute('data-kind');
    /* Weitergeblättert wird innerhalb derselben Art: Rohmaterial führt zum
       nächsten Rohmaterial, nicht mitten in die fertigen Clips. */
    for (var i = index + delta; i >= 0 && i < items.length; i += delta) {
      if (items[i].getAttribute('data-kind') === kind) { show(i); return; }
    }
  }

  items.forEach(function (btn, i) { btn.addEventListener('click', function () { show(i); }); });

  viewer.addEventListener('click', function (e) { if (e.target === viewer) close(); });
  document.querySelectorAll('[data-close-viewer-btn]').forEach(function (b) {
    b.addEventListener('click', close);
  });
  document.getElementById('viewer-prev').addEventListener('click', function () { step(-1); });
  document.getElementById('viewer-next').addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (e) {
    if (viewer.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  document.getElementById('viewer-dl').addEventListener('click', function () {
    if (index < 0) return;
    var btn = items[index];
    window.location.href = endpoint(btn.getAttribute('data-kind'), btn.getAttribute('data-open'), true);
  });

  /* ---- Download einer einzelnen Kachel ---- */

  document.querySelectorAll('[data-dl]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fetch(endpoint(btn.getAttribute('data-kind'), btn.getAttribute('data-dl'), true))
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.url) window.location.href = d.url; })
        .catch(function () { window.alert('Download not possible.'); });
    });
  });
})();`

/* ==========================================================================
   7 — PASSWORT
   ========================================================================== */

/**
 * Passwort des eigenen Admin-Kontos ändern. Bewusst nur für das eigene
 * Konto — Kunden und Clipper setzen ihres selbst oder melden sich
 * weiterhin per E-Mail-Code an.
 */
export function passwordPage(o: { user: User; min: number }): string {
  const field = (id: string, label: string, hint = '') => `
          <div>
            <label for="${id}" class="mb-1.5 block text-sm font-semibold text-slate-600">${esc(label)}</label>
            <input id="${id}" type="password" autocomplete="new-password"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
            ${hint ? `<p class="mt-1.5 text-xs text-slate-400">${esc(hint)}</p>` : ''}
          </div>`

  const body =
    pageTitle('Password', 'Applies to logging in with ' + o.user.email + '.') +
    `
      <div class="max-w-md space-y-5">
        ${card(`
          <p id="pw-msg" class="mb-4 hidden rounded-xl px-4 py-3 text-sm font-medium"></p>
          <div class="space-y-4">
            ${field('pw-current', 'Current password')}
            ${field('pw-new', 'New password', `At least ${o.min} characters.`)}
            ${field('pw-repeat', 'Repeat new password')}
            ${btn('Change password', 'id="pw-save"')}
          </div>`)}

        ${card(`
          <h2 class="font-display text-base font-bold">Where you sign in</h2>
          <dl class="mt-3 space-y-3 text-sm leading-relaxed text-slate-500">
            <div>
              <dt class="font-semibold text-slate-700">With a password: only you</dt>
              <dd><a href="/login/admin" class="font-semibold text-brand hover:underline">/login/admin</a></dd>
            </div>
            <div>
              <dt class="font-semibold text-slate-700">With an email code, all roles</dt>
              <dd>
                <a href="/login" class="font-semibold text-brand hover:underline">/login</a>:
                the code goes to ${esc(o.user.email)} and is valid for 30 minutes.
                This stays your fallback in case you forget the password.
              </dd>
            </div>
          </dl>
          <p class="mt-4 text-xs leading-relaxed text-slate-400">
            Customers and clippers only ever see the code login. Only admin
            accounts can use a password.
          </p>`)}
      </div>`

  return shell({
    title: 'Password',
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/passwort',
    body,
    script: `
(function () {
  var msg = document.getElementById('pw-msg');
  var save = document.getElementById('pw-save');

  function show(text, ok) {
    msg.textContent = text;
    msg.className = 'mb-4 rounded-xl px-4 py-3 text-sm font-medium ' + (ok
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border border-red-200 bg-red-50 text-red-700');
  }

  save.addEventListener('click', function () {
    var current = document.getElementById('pw-current').value;
    var next = document.getElementById('pw-new').value;
    var repeat = document.getElementById('pw-repeat').value;

    if (next !== repeat) return show('The two new passwords do not match.', false);
    if (next.length < ${o.min}) return show('The new password needs at least ${o.min} characters.', false);

    save.disabled = true;
    fetch('/api/admin/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: current, next: next })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Change failed.');
        show('Password changed. The new one applies from now on.', true);
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-repeat').value = '';
      })
      .catch(function (e) { show(e.message, false); })
      .then(function () { save.disabled = false; });
  });
})();`,
  })
}
