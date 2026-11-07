import {
  CREATOR_NAV,
  WORK_NAV,
  assignBanner,
  badge,
  campaignCard,
  campaignGrid,
  campaignThumb,
  dateDE,
  dateTimeDE,
  esc,
  jsonScript,
  kpiBar,
  originBadge,
  pageTitle,
  payTierTable,
  sectionHead,
  shell,
  type Kpi,
  type Lang,
  type NavItem,
  type PayTierView,
  type ThumbView,
  ASSIGN_HEADLINE,
  campHero,
  howItWorks,
} from './layout'
import { formatBytes } from '../lib/r2'
import { PUBLISH_STATUS, platformLabel, publishStatusLabel, readTargets } from '../lib/publisher'
import { linkHost } from '../lib/domain'
import { cloudProvider } from '../lib/thumbs'
import { formatCompact, metricStrip, metricsPausedNote } from './metrics'
import type { MetricTotals } from '../lib/metrics'
import type { ProjectLink, User } from '../db/schema'

/**
 * Arbeitsbereich — zugeordnete Kampagnen, Kampagnenseite, Upload fertiger Clips.
 *
 * Dieselben drei Seiten dienen zwei Rollen, beide auf Deutsch und beide mit
 * dem Wort „Kampagne“:
 *
 *   Clipper  /work        sie schneiden die Kampagnen der Kunden
 *   Creator  /kampagnen   schneiden ebenso — und verbreiten (views/campaigns.ts)
 *
 * Bis Oktober 2026 hieß es im Clipper-Bereich „Projekt“; auf Wunsch des
 * Auftraggebers steht seitdem überall „Kampagne“. Die Adressen bleiben
 * (/work/projekt/:id) — bestehende Links und Mails zeigen weiter dorthin.
 * Creator bekommen Kampagnen über genau dieselben Wege zugeordnet (ihre
 * Zeile in `clippers`, `project_workers`) und sehen dieselben Seiten.
 *
 * Aufbau seit Oktober 2026 (Linie in layout.ts): ganz oben die
 * Preisstaffelung (`payTierTable`), dann GROSS die Kampagnen als Karten mit
 * Thumbnail, Cloud-Links als große Link-Karten, Rohmaterial und Clips als
 * große Kacheln — die Kennzahlen nur noch KLEIN als eine Zeile (`kpiBar`).
 *
 * Offene Kampagnen gibt es hier nicht: Clipper und Creator sehen nur, was der
 * Administrator ihnen zugeordnet hat. Solange ihnen gar nichts zugeordnet
 * ist, steht oben „NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen.“
 * (`assignBanner`) — mit der ersten Zuordnung verschwindet die Zeile.
 * Was sich je Rolle unterscheidet — Wortschatz, Navigation, Adressen —,
 * steckt in einer `WorkArea`; die Texte stehen im Wörterbuch `TEXT`, je
 * Rolle ein Eintrag (`WorkArea.kind`).
 *
 * WICHTIG: In diesem Bereich taucht niemals ein Kunden- oder Firmenname auf.
 * Eine Kampagne erscheint mit dem Namen, den der Kunde ihr gegeben hat — mehr
 * nicht. Thumbnails sind erlaubt: sie zeigen das Material, nicht den Kunden.
 *
 * Dasselbe gilt für die Zahlen aus Zernio: hier stehen nur SUMMEN — je
 * Kampagne, je Clip, für den ganzen Bereich. Nie `metricRows`, nie ein
 * @Accountname, nie ein Link zum Beitrag. Der Account, auf dem ein Clip
 * läuft, ist der Account des Kunden; sein Name oder ein Link dorthin
 * verriete, wer hinter der Kampagne steht.
 */

/** Wessen Bereich — wählt den Wortschatz aus `TEXT`. */
export type WorkKind = 'clipper' | 'creator'

/** Was die Seiten je Rolle unterscheidet. */
export interface WorkArea {
  kind: WorkKind
  /** Sprache für Zahlen, Größen und Status — für beide Rollen Deutsch. */
  lang: Lang
  nav: NavItem[]
  /** Startseite: die zugeordneten Kampagnen. */
  home: string
  /** Hervorgehobener Navigationspunkt auf Startseite und Kampagnenseite. */
  active: string
  projectHref: (id: string) => string
  uploadHref: string
  /**
   * Vorschaubild einer Rohmaterial-Datei bzw. eines eigenen Clips (`clip`
   * mit `?video=1`: der Clip selbst) — hinter der Zugriffsprüfung in
   * routes/work.ts (`workPreview`).
   */
  previewHref: (kind: 'rohmaterial' | 'clip', id: string) => string
}

export const CLIPPER_WORK_AREA: WorkArea = {
  kind: 'clipper',
  lang: 'de',
  nav: WORK_NAV,
  home: '/work',
  active: '/work',
  projectHref: (id) => `/work/projekt/${encodeURIComponent(id)}`,
  uploadHref: '/work/upload',
  previewHref: (kind, id) => `/work/vorschau/${kind}/${encodeURIComponent(id)}`,
}

/**
 * Creator: „Zugeordnete Kampagnen“ ist die Startseite dieses Teils. Die Uploads
 * laufen trotzdem über /api/work/… — dieselben Endpunkte wie beim Clipper,
 * dort für beide Rollen freigegeben.
 */
export const CREATOR_WORK_AREA: WorkArea = {
  kind: 'creator',
  lang: 'de',
  nav: CREATOR_NAV,
  home: '/kampagnen/finden',
  active: '/kampagnen/finden',
  projectHref: (id) => `/kampagnen/kampagne/${encodeURIComponent(id)}`,
  uploadHref: '/kampagnen/upload',
  previewHref: (kind, id) => `/kampagnen/vorschau/${kind}/${encodeURIComponent(id)}`,
}

/* ------------------------------------------------------------- Wörterbuch */

/** Einzahl und Mehrzahl. */
type Noun = [one: string, many: string]

interface WorkText {
  file: Noun
  link: Noun
  folder: Noun
  campaign: Noun

  /* Startseite */
  homeTitle: string
  homeSubtitle: string
  ownHeading: string
  /** Nur Creator: zugeordnet, aber nichts zum Schneiden (nur Verbreiten). */
  noCutTitle: string
  noCutText: string

  /* Kampagnenseite */
  back: string
  cloudLinks: string
  cloudLinksHint: string
  openLink: string
  download: string
  downloadFailed: string
  rawHeading: string
  folderNoUploads: string
  folderEmpty: string
  subtitleFiles: string
  subtitleBoth: string
  subtitleLinks: string
  uploadFinished: string
  noUploadsTitle: string
  noUploadsText: string
  noFootageTitle: string
  noFootageText: string
  clipsHeading: string
  clipsEmptyTitle: string
  clipsEmptyText: string

  /* Upload */
  uploadTitle: string
  uploadSubtitle: string
  project: string
  noneTakenOption: string
  caption: string
  required: string
  captionPlaceholder: string
  captionHelp: string
  drop: string
  myUploads: string
  uploaded: string
  incomplete: string
  uploadsEmptyTitle: string
  uploadsEmptyText: string
  noJob: string
  captionMissing: string
  waiting: string
  uploading: string
  done: string

  /* Zahlen — nur Summen, siehe Kopf der Datei */
  reachTitle: string
  reachHere: string
  clipsDelivered: (n: number) => string
}

/*
 * Beide Einträge sind deutsch, duzen und sagen „Kampagne“. Der Unterschied
 * ist klein: Clipper liefern „fertige Videos“ für die Kampagnen der Kunden,
 * Creator „Clips“. Die Überschriften „Meine Kampagnen“ und „Fertige Videos
 * hochladen“ entsprechen den Punkten in `WORK_NAV`.
 */
const TEXT: Record<WorkKind, WorkText> = {
  clipper: {
    file: ['Datei', 'Dateien'],
    link: ['Link', 'Links'],
    folder: ['Ordner', 'Ordner'],
    campaign: ['Kampagne', 'Kampagnen'],

    homeTitle: 'Meine Kampagnen',
    homeSubtitle: 'Jede Kampagne wird dir persönlich zugeordnet, du bekommst eine E-Mail, sobald eine für dich bereitsteht.',
    ownHeading: 'Kampagnen, an denen du arbeitest',
    noCutTitle: 'Keine Kampagne zum Schneiden',
    noCutText: 'Sobald dir NIKKI MEDIA eine Kampagne zum Schneiden zuordnet, erscheint sie hier.',

    back: '← Zurück zu meinen Kampagnen',
    cloudLinks: 'Cloud-Links',
    cloudLinksHint: 'Rohmaterial in einem Cloud-Ordner, öffne den Link, um es anzusehen oder herunterzuladen.',
    openLink: 'Link öffnen',
    download: 'Herunterladen',
    downloadFailed: 'Download nicht möglich.',
    rawHeading: 'Rohmaterial',
    folderNoUploads: 'In diesem Ordner liegen keine hochgeladenen Dateien.',
    folderEmpty: 'In diesem Ordner liegt noch kein Rohmaterial.',
    subtitleFiles: 'Lade das Rohmaterial herunter und leg mit dem Schnitt los.',
    subtitleBoth: 'Lade das Rohmaterial herunter oder öffne die Cloud-Links und leg mit dem Schnitt los.',
    subtitleLinks: 'Öffne die Cloud-Links, hol dir das Rohmaterial und leg mit dem Schnitt los.',
    uploadFinished: 'Fertiges Video hochladen',
    noUploadsTitle: 'Keine hochgeladenen Dateien',
    noUploadsText:
      'Das Rohmaterial für diese Kampagne liegt in den Cloud-Links oben. Was der Kunde später noch hochlädt, erscheint ebenfalls hier.',
    noFootageTitle: 'Noch kein Rohmaterial',
    noFootageText: 'Es erscheint hier, sobald der Kunde etwas hochlädt.',
    clipsHeading: 'Deine fertigen Videos',
    clipsEmptyTitle: 'Noch kein Video geliefert',
    clipsEmptyText: 'Die Videos, die du für diese Kampagne hochlädst, erscheinen hier mit ihrem Status.',

    uploadTitle: 'Fertige Videos hochladen',
    uploadSubtitle: 'Kampagne wählen und hochladen, der Kunde und Jason werden automatisch benachrichtigt.',
    project: 'Kampagne',
    noneTakenOption: 'Noch keine Kampagne zugewiesen',
    caption: 'Caption',
    required: '(Pflichtfeld)',
    captionPlaceholder: 'Der Text, der mit dem Clip veröffentlicht wird',
    captionHelp:
      'Wird mit dem Video auf jeder verbundenen Plattform veröffentlicht. TikTok lehnt einen Clip ohne Caption ab. Lädst du mehrere Dateien auf einmal hoch, bekommen alle diese Caption.',
    drop: 'Video hierher ziehen oder Datei auswählen',
    myUploads: 'Meine Uploads',
    uploaded: 'hochgeladen',
    incomplete: 'unvollständig',
    uploadsEmptyTitle: 'Noch keine Uploads',
    uploadsEmptyText: 'Die Videos, die du hochlädst, erscheinen hier mit ihrem Status.',
    noJob: 'Dir ist noch keine Kampagne zugewiesen.',
    captionMissing: 'Bitte schreib eine Caption, sie wird mit dem Clip veröffentlicht.',
    waiting: 'wartet …',
    uploading: 'lädt hoch …',
    done: 'fertig',

    reachTitle: 'Reichweite deiner Clips',
    reachHere: 'Deine Clips in dieser Kampagne',
    clipsDelivered: (n) => (n === 1 ? '1 Clip geliefert' : `${n.toLocaleString('de-DE')} Clips geliefert`),
  },

  creator: {
    file: ['Datei', 'Dateien'],
    link: ['Link', 'Links'],
    folder: ['Ordner', 'Ordner'],
    campaign: ['Kampagne', 'Kampagnen'],

    homeTitle: 'Zugewiesene Kampagnen',
    homeSubtitle: 'Jede Kampagne wird dir persönlich zugewiesen, du bekommst eine E-Mail, sobald eine für dich bereitsteht.',
    ownHeading: 'Kampagnen, die du schneidest',
    noCutTitle: 'Keine Kampagne zum Schneiden',
    noCutText:
      'Dir sind gerade nur Kampagnen zum Verbreiten zugewiesen, du findest sie unter „Verbreiten“. Kampagnen zum Schneiden erscheinen hier.',

    back: '← Zurück zu den zugewiesenen Kampagnen',
    cloudLinks: 'Cloud-Links',
    cloudLinksHint: 'Rohmaterial in einem Cloud-Ordner, öffne den Link, um es anzusehen oder herunterzuladen.',
    openLink: 'Link öffnen',
    download: 'Herunterladen',
    downloadFailed: 'Download nicht möglich.',
    rawHeading: 'Rohmaterial',
    folderNoUploads: 'In diesem Ordner liegen keine hochgeladenen Dateien.',
    folderEmpty: 'In diesem Ordner liegt noch kein Rohmaterial.',
    subtitleFiles: 'Lade das Rohmaterial herunter und leg los.',
    subtitleBoth: 'Lade das Rohmaterial herunter oder öffne die Cloud-Links und leg los.',
    subtitleLinks: 'Öffne die Cloud-Links, hol dir das Rohmaterial und leg los.',
    uploadFinished: 'Fertigen Clip hochladen',
    noUploadsTitle: 'Keine hochgeladenen Dateien',
    noUploadsText:
      'Das Rohmaterial dieser Kampagne liegt in den Cloud-Links oben. Was später noch hochgeladen wird, erscheint ebenfalls hier.',
    noFootageTitle: 'Noch kein Rohmaterial',
    noFootageText: 'Es erscheint hier, sobald etwas hochgeladen wird.',
    clipsHeading: 'Deine fertigen Clips',
    clipsEmptyTitle: 'Noch kein Clip geliefert',
    clipsEmptyText: 'Die Clips, die du für diese Kampagne hochlädst, erscheinen hier mit ihrem Status.',

    uploadTitle: 'Fertige Clips hochladen',
    uploadSubtitle: 'Kampagne wählen und hochladen, wer benachrichtigt werden muss, erfährt es automatisch.',
    project: 'Kampagne',
    noneTakenOption: 'Noch keine Kampagne zugewiesen',
    caption: 'Caption',
    required: '(Pflichtfeld)',
    captionPlaceholder: 'Der Text, der mit dem Clip veröffentlicht wird',
    captionHelp:
      'Wird mit dem Clip auf jeder verbundenen Plattform veröffentlicht. TikTok lehnt einen Clip ohne Caption ab. Lädst du mehrere Dateien auf einmal hoch, bekommen alle diese Caption.',
    drop: 'Video hierher ziehen oder Datei auswählen',
    myUploads: 'Meine Uploads',
    uploaded: 'hochgeladen',
    incomplete: 'unvollständig',
    uploadsEmptyTitle: 'Noch keine Uploads',
    uploadsEmptyText: 'Die Clips, die du hochlädst, erscheinen hier mit ihrem Status.',
    noJob: 'Dir ist noch keine Kampagne zugewiesen.',
    captionMissing: 'Bitte schreib eine Caption, sie wird mit dem Clip veröffentlicht.',
    waiting: 'wartet …',
    uploading: 'lädt hoch …',
    done: 'fertig',

    reachTitle: 'Reichweite deiner Clips',
    reachHere: 'Deine Clips in dieser Kampagne',
    clipsDelivered: (n) => (n === 1 ? '1 Clip geliefert' : `${n.toLocaleString('de-DE')} Clips geliefert`),
  },
}

/* ---------------------------------------------------------------- Helfer */

const plural = (n: number, [one, many]: Noun) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

/** Text als JS-Stringliteral für das eingebettete Skript. */
const js = (text: string) => jsonScript(text)

/**
 * Die URL ohne „https://“ und „www.“, lange Adressen am Ende gekürzt. Der
 * volle Link steckt im Button und im Tooltip — hier soll nur erkennbar sein,
 * welcher Ordner gemeint ist.
 */
const shortUrl = (url: string, max = 64) => {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  return bare.length > max ? `${bare.slice(0, max - 1)}…` : bare
}

const svg = (cls: string, paths: string, stroke = '1.8') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${paths}</svg>`

/** Kleine Glyphen — exportiert für views/campaigns.ts, damit beide Bereiche gleich aussehen. */
export const GLYPH = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  share: '<path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5M12 4v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none"/>',
} as const

export const glyph = (name: keyof typeof GLYPH, cls = 'h-3.5 w-3.5 shrink-0') => svg(cls, GLYPH[name], '2')

/** Hat diese Summe überhaupt Zahlen? Eine leere Map liefert `undefined`. */
const hasNumbers = (t: MetricTotals | undefined): t is MetricTotals => Boolean(t && t.posts > 0)

/**
 * Die vier Zahlen als Einträge für `kpiBar`. Ohne Zahlen EIN Eintrag „—“
 * mit „noch keine Zahlen“ — nie eine Reihe Nullen (siehe views/metrics.ts).
 */
export function reachKpis(t: MetricTotals | undefined, lang: Lang, prefix = ''): Kpi[] {
  if (!hasNumbers(t)) return [{ value: '–', label: `${prefix}Views`, hint: lang === 'de' ? 'noch keine Zahlen' : 'no numbers yet' }]
  return [
    { value: formatCompact(t.views, lang), label: `${prefix}Views` },
    { value: formatCompact(t.likes, lang), label: 'Likes' },
    { value: formatCompact(t.comments, lang), label: lang === 'de' ? 'Kommentare' : 'Comments' },
    { value: formatCompact(t.shares, lang), label: 'Shares' },
  ]
}

/** „12 Posts · Stand: 14.10.2026, 09:15“ unter einer Kennzahlenzeile — leer ohne Zahlen. */
export function reachStamp(t: MetricTotals | undefined): string {
  if (!hasNumbers(t)) return ''
  const posts = t.posts === 1 ? '1 Post' : `${t.posts.toLocaleString('de-DE')} Posts`
  return `<p class="mt-1.5 text-[11px] text-slate-400">${esc(posts)} · Stand: ${esc(dateTimeDE(t.syncedAt))}</p>`
}

/**
 * Views als kleine Angabe in einer Karte (`campaignCard.meta`) — mit Glyphe,
 * die volle Bedeutung im Tooltip. Leer ohne Zahlen.
 */
export function viewsMeta(t: MetricTotals | undefined, title: string, icon: keyof typeof GLYPH = 'eye'): string[] {
  if (!hasNumbers(t)) return []
  return [
    `<span class="inline-flex items-center gap-1" title="${esc(`${title}: ${t.views.toLocaleString('de-DE')}`)}">${glyph(icon, 'h-3.5 w-3.5 text-slate-400')}<b class="font-semibold tabular-nums text-slate-700">${esc(
      formatCompact(t.views, 'de'),
    )}</b> Views</span>`,
  ]
}

/** Kennzahlenzeile mit kleiner Überschrift davor — eine Zeile, nie große Kacheln. */
export function kpiLine(caption: string, items: Kpi[], foot = '', extra = 'mt-9'): string {
  return `
      <section class="${extra}" aria-label="${esc(caption)}">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 class="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">${esc(caption)}</h2>
          ${kpiBar(items, 'min-w-0')}
        </div>
        ${foot}
      </section>`
}

/** Status einer Kampagne als Abzeichen — „aktiv“ braucht keins. */
export const statusBadge = (status: string) =>
  status === 'pausiert' ? badge('Pausiert', 'amber') : status === 'beendet' ? badge('Beendet', 'grey') : ''

/**
 * Großer Kopf einer Kampagne: Thumbnail links (auf dem Handy oben), daneben
 * Name, Unterzeile, die Kennzahlen als schmale Zeile und die Knöpfe.
 * Exportiert für die Kampagnenseiten der Creator (views/campaigns.ts).
 */
export function campaignHero(o: {
  thumb?: ThumbView
  name: string
  /** Kleine Zeile über dem Namen — fertiges HTML (Abzeichen, Rolle …). */
  eyebrow?: string
  subtitle?: string
  /** Fertiges HTML, meist `kpiBar` (+ `reachStamp`). */
  kpis?: string
  actions?: string
}): string {
  return `
      <section class="mb-9 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div class="relative">${campaignThumb(o.thumb, o.name, 'md:h-full md:min-h-[15rem] md:aspect-auto')}</div>
        <div class="flex min-w-0 flex-col justify-center gap-4 p-5 sm:p-7">
          <div class="min-w-0">
            ${o.eyebrow ? `<div class="mb-2 flex flex-wrap items-center gap-2">${o.eyebrow}</div>` : ''}
            <h1 class="break-words font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(o.name)}</h1>
            ${o.subtitle ? `<p class="mt-1.5 text-slate-500">${esc(o.subtitle)}</p>` : ''}
          </div>
          ${o.kpis ? `<div class="min-w-0">${o.kpis}</div>` : ''}
          ${o.actions ? `<div class="flex flex-wrap gap-2">${o.actions}</div>` : ''}
        </div>
      </section>`
}

/**
 * Abschnittsüberschrift mit Zähler — dieselbe Optik wie `sectionHead`
 * (layout.ts), die Zahl als kleine Pille direkt hinter dem Titel.
 */
export const countHead = (title: string, count: number, aside = '') => `
        <div class="mb-3 mt-9 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 first:mt-0">
          <h2 class="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">${esc(title)}<span class="rounded-full bg-slate-200/80 px-2 py-0.5 font-sans text-xs font-bold tabular-nums text-slate-600">${esc(
            count.toLocaleString('de-DE'),
          )}</span></h2>
          ${aside}
        </div>`

/** Knopf-Optik für Links in Karten und Köpfen. */
const actionLink = (label: string, href: string, variant: 'primary' | 'ghost' = 'primary', icon?: keyof typeof GLYPH) =>
  `<a href="${esc(href)}" class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
    variant === 'primary' ? 'bg-brand text-white hover:bg-brand-2' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
  }">${icon ? glyph(icon, 'h-4 w-4 shrink-0') : ''}${esc(label)}</a>`

/** Freundlicher Leerzustand in einem Abschnitt — kleiner als `emptyState`. */
const smallEmpty = (title: string, text: string, action = '') => `
          <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-center">
            <p class="font-display font-bold">${esc(title)}</p>
            <p class="mx-auto mt-1.5 max-w-md text-sm text-slate-500">${esc(text)}</p>
            ${action ? `<div class="mt-4">${action}</div>` : ''}
          </div>`

/** Dateiendung groß auf der Kachel — „MP4“, „MOV“. */
const extOf = (filename: string) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(filename)
  return m ? m[1].toUpperCase() : 'VIDEO'
}

/* ------------------------------------------------------------- Startseite */

export interface WorkProject {
  id: string
  name: string
  /** projects.status — aktiv, pausiert oder beendet. */
  status: string
  folders: number
  files: number
  bytes: number
  /** Cloud-Links an der Kampagne — Material genauso wie hochgeladene Dateien. */
  links: number
  /** Fertig hochgeladene Clips DIESES Bearbeiters in der Kampagne. */
  clips: number
  thumb?: ThumbView
  /**
   * Was die Clips DIESES Bearbeiters in der Kampagne erreicht haben — nicht
   * die ganze Kampagne: Clips anderer gehen ihn nichts an. Fehlt ohne Zahlen.
   */
  metrics?: MetricTotals
}

/**
 * Startseite des Arbeitsbereichs, von oben nach unten:
 *
 *   Titel
 *   Preisstaffelung — immer, ohne Stufen mit dem Platzhaltertext
 *   „NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen.“ — NUR solange
 *     ihm gar nichts zugeordnet ist (`assigned`)
 *   die zugeordneten Kampagnen als große Karten mit Thumbnail
 *   die Reichweite seiner Clips als EINE schmale Zeile
 *
 * Offene Kampagnen stehen hier NIE — weder welche es gibt noch wie viele.
 * Zugeordnet wird ausschließlich vom Administrator.
 */
export function projectsPage(
  o: {
    user: User
    projects: WorkProject[]
    /** Preisstaffelung dieser Person (`payTiersOf`) — bei jedem Aufruf frisch. */
    tiers: PayTierView[]
    /**
     * Ist ihm überhaupt etwas zugeordnet? Beim Creator zählt auch eine
     * Kampagne zum Verbreiten. Ohne Angabe: ob hier Kampagnen stehen.
     */
    assigned?: boolean
    /** Alle Clips dieses Bearbeiters zusammen (`totalsForClipper`). */
    reach?: MetricTotals
    /** `metricsPausedUntil` — solange der Abgleich ruht, steht ein Hinweis bei den Zahlen. */
    metricsPausedUntil?: number | null
  },
  area: WorkArea = CLIPPER_WORK_AREA,
): string {
  const t = TEXT[area.kind]
  const assigned = o.assigned ?? o.projects.length > 0

  // Aktive zuerst; pausierte und beendete bleiben sichtbar, stehen aber hinten.
  const order = (s: string) => (s === 'aktiv' ? 0 : s === 'pausiert' ? 1 : 2)
  const projects = [...o.projects].sort((a, b) => order(a.status) - order(b.status))

  const cards = projects.map((p) =>
    campaignCard({
      href: area.projectHref(p.id),
      name: p.name,
      thumb: p.thumb,
      eyebrow: [plural(p.folders, t.folder), p.bytes ? formatBytes(p.bytes, area.lang) : ''].filter(Boolean).join(' · '),
      corner: statusBadge(p.status),
      meta: [
        esc(p.files || !p.links ? plural(p.files, t.file) : ''),
        p.links ? esc(plural(p.links, t.link)) : '',
        p.clips ? esc(t.clipsDelivered(p.clips)) : '',
        ...viewsMeta(p.metrics, 'Views deiner Clips'),
      ].filter(Boolean),
      footer: `<a href="${esc(`${area.uploadHref}?projekt=${encodeURIComponent(p.id)}`)}" class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-2">${glyph(
        'upload',
        'h-4 w-4',
      )}${esc(t.uploadFinished)}</a>`,
    }),
  )

  const list = projects.length
    ? countHead(t.ownHeading, projects.length) + campaignGrid(cards)
    : assigned
      ? smallEmpty(t.noCutTitle, t.noCutText, area.kind === 'creator' ? actionLink('Zu „Verbreiten“', '/kampagnen/verbreiten', 'ghost') : '')
      : ''

  /* Die Reichweite erst, wenn es etwas zu zeigen gibt — eine zugeordnete
     Kampagne oder schon Zahlen. Wer gerade erst angefangen hat, sähe sonst
     eine Zeile Striche unter dem einzigen, was ihn interessiert. */
  const showReach = projects.length > 0 || hasNumbers(o.reach)
  const totalClips = projects.reduce((n, p) => n + p.clips, 0)
  const paused = showReach ? metricsPausedNote(o.metricsPausedUntil ?? null, area.lang) : ''
  const reach = showReach
    ? kpiLine(
        t.reachTitle,
        [
          { value: projects.length.toLocaleString('de-DE'), label: projects.length === 1 ? t.campaign[0] : t.campaign[1] },
          { value: totalClips.toLocaleString('de-DE'), label: 'Clips geliefert' },
          ...reachKpis(o.reach, area.lang),
        ],
        reachStamp(o.reach) + (paused ? `<div class="mt-2">${paused}</div>` : ''),
      )
    : ''

  /* Clipper: Kampagnen-Kopf im Aufbau der Agentur (Vorgabe des Auftraggebers, November 2026),
     unter der Preisstaffelung. Links die Kampagne, an der er arbeitet, rechts seine Hauptaktion:
     ein fertiges Video hochladen. Neue Kampagnen legt ein Clipper nicht an, die ordnet NIKKI MEDIA zu. */
  const STATUS: Record<string, string> = { aktiv: 'Aktiv', pausiert: 'Pausiert', beendet: 'Beendet' }
  const main = projects[0]
  const hero =
    area.kind !== 'clipper'
      ? ''
      : main
        ? campHero({
            eyebrow: 'Deine Kampagne',
            chip: STATUS[main.status] ?? main.status,
            title: main.name,
            stats: [
              { value: String(main.clips), label: main.clips === 1 ? 'Clip geliefert' : 'Clips geliefert', valueFirst: true },
              ...(hasNumbers(main.metrics) ? [{ value: formatCompact(main.metrics.views, 'de'), label: 'Views deiner Clips', valueFirst: true }] : []),
              { label: 'Rohmaterial', value: main.files || main.links ? [main.files ? plural(main.files, t.file) : '', main.links ? plural(main.links, t.link) : ''].filter(Boolean).join(', ') : 'folgt' },
            ],
            primary: { href: area.projectHref(main.id), label: 'Rohmaterial ansehen' },
            more: projects.length > 1 ? { href: '#meine-kampagnen', label: `Alle ${projects.length} Kampagnen ↓` } : undefined,
            side: {
              href: `${area.uploadHref}?projekt=${encodeURIComponent(main.id)}`,
              title: t.uploadFinished,
              text: 'Clip schneiden, hochladen, fertig. NIKKI MEDIA prüft ihn und bringt ihn online.',
              cta: 'Video hochladen',
              icon: 'upload',
            },
          })
        : campHero({
            eyebrow: 'Deine Kampagne',
            title: ASSIGN_HEADLINE,
            text: 'Du bekommst eine E-Mail, sobald das Rohmaterial für dich bereitsteht. Wie du mit Clips verdienst, steht weiter unten.',
            mainAttrs: 'data-assign-headline',
          })

  const body =
    pageTitle(t.homeTitle, t.homeSubtitle) +
    payTierTable(o.tiers, 'mb-8') +
    hero +
    (assigned || area.kind === 'clipper' ? '' : assignBanner()) +
    (list ? `<div id="meine-kampagnen">${list}</div>` : '') +
    reach +
    (area.kind === 'clipper' && !assigned
      ? howItWorks('Clipping Area', 'So verdienst du mit Clips', [
          { title: 'Kampagne zugeordnet bekommen', text: 'NIKKI MEDIA ordnet dir eine Kampagne zu. Du bekommst eine E-Mail, sobald das Rohmaterial bereitsteht.', icon: 'inbox' },
          { title: 'Clips schneiden und hochladen', text: 'Schneide kurze, starke Clips aus dem Material und lade sie hier als fertige Videos hoch.', icon: 'scissors' },
          { title: 'Views werden zu Verdienst', text: 'Die Views deiner Clips kommen direkt von den Plattformen. Was du verdienst, zeigt deine Preisstaffelung oben.', icon: 'trend' },
        ])
      : '')

  return shell({
    title: t.homeTitle,
    user: o.user,
    nav: area.nav,
    active: area.active,
    body,
  })
}

/* --------------------------------------------------------- Kampagnenseite */

export interface WorkFile {
  id: string
  filename: string
  bytes: number
  createdAt: number
  /** Gibt es ein Vorschaubild (`raw_assets.thumb_key`)? */
  poster: boolean
}

/** Eine Rohmaterial-Datei als große Kachel: Vorschaubild, Name, Größe, Download. */
function fileTile(f: WorkFile, area: WorkArea, t: WorkText): string {
  return `
            <article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
              <div class="relative aspect-video overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-[#0b0a07]">
                <div class="absolute inset-0 grid place-items-center text-white/45">
                  <span class="flex flex-col items-center gap-1.5">${glyph('film', 'h-8 w-8')}<span class="text-[11px] font-bold tracking-[.18em]">${esc(extOf(f.filename))}</span></span>
                </div>
                ${
                  f.poster
                    ? `<img src="${esc(area.previewHref('rohmaterial', f.id))}" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" onerror="this.remove()">`
                    : ''
                }
              </div>
              <div class="flex flex-1 flex-col p-3">
                <p class="truncate text-sm font-semibold text-slate-800" title="${esc(f.filename)}">${esc(f.filename)}</p>
                <p class="mt-0.5 text-xs text-slate-500">${esc(formatBytes(f.bytes, area.lang))} · ${esc(dateDE(f.createdAt))}</p>
                <button type="button" data-dl="${esc(f.id)}" class="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-brand transition hover:border-brand hover:bg-blue-50 disabled:opacity-40">${glyph(
                  'download',
                  'h-3.5 w-3.5',
                )}${esc(t.download)}</button>
              </div>
            </article>`
}

/** Großes Ordnersymbol für die Ordner-Kacheln. */
const folderBadge = (size = 'h-12 w-12') =>
  `<span class="grid ${size} shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600">${svg('h-6 w-6', GLYPH.folder, '1.8')}</span>`

export function projectDetailPage(
  o: {
    user: User
    name: string
    projectId: string
    status: string
    thumb?: ThumbView
    folders: { id: string; name: string; files: WorkFile[] }[]
    links: ProjectLink[]
    /** Seine fertigen Clips in dieser Kampagne, neueste zuerst. */
    clips: UploadRow[]
    /**
     * Die Clips dieses Bearbeiters in dieser Kampagne: Summe (fehlt ohne
     * Zahlen), wie viele er geliefert hat, und ob der Abgleich gerade ruht.
     */
    reach?: { totals?: MetricTotals; clips: number; pausedUntil: number | null }
  },
  area: WorkArea = CLIPPER_WORK_AREA,
): string {
  const t = TEXT[area.kind]
  const files = o.folders.reduce((n, f) => n + f.files.length, 0)
  const bytes = o.folders.reduce((n, f) => n + f.files.reduce((m, x) => m + x.bytes, 0), 0)
  const hasFiles = files > 0
  const uploadHref = `${area.uploadHref}?projekt=${encodeURIComponent(o.projectId)}`

  /* Nur Summen — keine Zeile je Account, kein Link (siehe Kopf der Datei).
     Die Reichweite erst, wenn er hier etwas geliefert hat: vor dem ersten
     Clip gibt es nichts zu zählen. */
  const r = o.reach
  const showReach = Boolean(r && (r.clips > 0 || hasNumbers(r.totals)))
  const paused = r && showReach ? metricsPausedNote(r.pausedUntil, area.lang) : ''
  const kpis: Kpi[] = [
    { value: files.toLocaleString('de-DE'), label: files === 1 ? t.file[0] : t.file[1], hint: bytes ? formatBytes(bytes, area.lang) : undefined },
    ...(o.links.length ? [{ value: o.links.length.toLocaleString('de-DE'), label: o.links.length === 1 ? 'Cloud-Link' : 'Cloud-Links' }] : []),
    ...(showReach && r ? [{ value: r.clips.toLocaleString('de-DE'), label: 'Clips geliefert' }, ...reachKpis(r.totals, area.lang)] : []),
  ]

  const subtitle = !o.links.length ? t.subtitleFiles : hasFiles ? t.subtitleBoth : t.subtitleLinks
  const hero = campaignHero({
    thumb: o.thumb,
    name: o.name,
    eyebrow:
      (area.kind === 'creator'
        ? originBadge('assigned')
        : `<span class="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">${esc(t.campaign[0])}</span>`) +
      statusBadge(o.status),
    subtitle,
    kpis:
      kpiBar(kpis, 'w-fit max-w-full') +
      (showReach ? reachStamp(r?.totals) : '') +
      (paused ? `<div class="mt-2">${paused}</div>` : ''),
    actions: actionLink(t.uploadFinished, uploadHref, 'primary', 'upload'),
  })

  /* Cloud-Links hängen an der Kampagne, nicht an einem Ordner — sie stehen
     deshalb über den Ordnern, groß, mit dem Symbol des Anbieters. Die URL ist
     serverseitig auf https geprüft (normalizeCloudLink) und wird trotzdem
     escaped. */
  const links = o.links.length
    ? `
      <section class="mb-10">
        ${countHead(t.cloudLinks, o.links.length)}
        <p class="-mt-1 mb-4 text-sm text-slate-500">${esc(t.cloudLinksHint)}</p>
        <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          ${o.links
            .map((l) => {
              const host = linkHost(l.url)
              const provider = cloudProvider(host)
              return `
          <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
             class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
            ${campaignThumb({ kind: 'cloud', host, provider }, o.name)}
            <span class="flex items-center gap-3 px-4 py-3.5">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-display text-lg font-extrabold tracking-tight text-slate-900 group-hover:text-brand">${esc(
                  provider.bundled ? provider.label : host,
                )}</span>
                <span class="block truncate text-xs text-slate-500" title="${esc(l.url)}">${esc(shortUrl(l.url))}</span>
              </span>
              <span class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white transition group-hover:bg-brand-2">${esc(
                t.openLink,
              )}${glyph('external', 'h-3.5 w-3.5')}</span>
            </span>
          </a>`
            })
            .join('')}
        </div>
      </section>`
    : ''

  /* Ordner groß: bei mehreren zuerst die Ordner-Kacheln (Sprung zum Ordner),
     darunter je Ordner seine Dateien als Kacheln. Liegt das Material nur in
     der Cloud, ist ein leerer Ordner kein Zeichen für fehlendes Material —
     die Leerzustände sagen dann nur, dass nichts HOCHGELADEN wurde. */
  const folderTiles =
    o.folders.length > 1
      ? `
        <div class="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          ${o.folders
            .map(
              (f) => `
          <a href="#ordner-${esc(f.id)}" class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md">
            ${folderBadge('h-14 w-14')}
            <span class="min-w-0">
              <span class="block truncate font-display text-base font-extrabold tracking-tight">${esc(f.name)}</span>
              <span class="block text-xs text-slate-500">${esc(plural(f.files.length, t.file))}</span>
            </span>
          </a>`,
            )
            .join('')}
        </div>`
      : ''

  /* Ein einziger Ordner, der genauso heißt wie der Abschnitt („Rohmaterial“),
     bekommt keinen eigenen Kopf — derselbe Name zweimal untereinander sagt nichts. */
  const soleDefault = o.folders.length === 1 && o.folders[0].name.trim() === t.rawHeading
  const folderBlocks = o.folders
    .map(
      (f) => `
        <section id="ordner-${esc(f.id)}" class="mb-8 scroll-mt-6">
          ${
            soleDefault
              ? ''
              : `<div class="mb-4 flex items-center gap-3">
            ${folderBadge()}
            <div class="min-w-0">
              <h3 class="truncate font-display text-lg font-extrabold tracking-tight">${esc(f.name)}</h3>
              <p class="text-xs text-slate-500">${esc(plural(f.files.length, t.file))}${
                f.files.length ? ` · ${esc(formatBytes(f.files.reduce((n, x) => n + x.bytes, 0), area.lang))}` : ''
              }</p>
            </div>
          </div>`
          }
          ${
            f.files.length
              ? `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">${f.files
                  .map((file) => fileTile(file, area, t))
                  .join('')}</div>`
              : `<p class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500">${esc(
                  o.links.length ? t.folderNoUploads : t.folderEmpty,
                )}</p>`
          }
        </section>`,
    )
    .join('')

  const raw = `
      <section class="mb-10">
        ${
          o.folders.length
            ? countHead(t.rawHeading, files, bytes ? `<span class="text-xs font-semibold text-slate-500">${esc(formatBytes(bytes, area.lang))}</span>` : '')
            : sectionHead(t.rawHeading)
        }
        ${
          o.folders.length
            ? folderTiles + folderBlocks
            : o.links.length
              ? smallEmpty(t.noUploadsTitle, t.noUploadsText)
              : smallEmpty(t.noFootageTitle, t.noFootageText)
        }
      </section>`

  const clips = `
      <section>
        ${countHead(t.clipsHeading, o.clips.length)}
        ${
          o.clips.length
            ? clipGrid(o.clips, area, t, { showCampaign: false })
            : smallEmpty(t.clipsEmptyTitle, t.clipsEmptyText, actionLink(t.uploadFinished, uploadHref, 'ghost', 'upload'))
        }
      </section>`

  const body =
    `<a href="${esc(area.home)}" class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">${esc(t.back)}</a>` +
    hero +
    links +
    raw +
    clips

  return shell({
    title: o.name,
    user: o.user,
    nav: area.nav,
    active: area.active,
    body,
    script: `
(function () {
  document.querySelectorAll('[data-dl]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      fetch('/api/work/assets/' + btn.getAttribute('data-dl') + '/url')
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.d.url) throw new Error(res.d.error || ${js(t.downloadFailed)});
          window.location.href = res.d.url;
        })
        .catch(function (e) { window.alert(e.message); })
        .then(function () { btn.disabled = false; });
    });
  });
})();`,
  })
}

/* ------------------------------------------------------------- Clips */

export interface UploadRow {
  id: string
  projectId: string
  filename: string
  caption: string | null
  projectName: string
  createdAt: number
  bytes: number
  uploadStatus: string
  /** Gibt es ein Vorschaubild (`deliverables.thumbnail_key`)? */
  poster: boolean
  /** Wo der Clip mit der Veröffentlichung steht. NULL = noch nicht angefasst. */
  publishStatus: string | null
  /** Ergebnis je Account als gespeichertes JSON. NULL = noch nichts versucht. */
  publishTargets: string | null
  /**
   * Alle Posts dieses Clips zusammen — automatische Ziele und Verbreitung
   * über Creator (`totalsForDeliverables` ohne Filter). Fehlt ohne Zahlen.
   */
  metrics?: MetricTotals
}

/**
 * Wo ein fertiger Clip mit der Veröffentlichung steht.
 *
 * Ein Clip, der NICHT rausging, zählt hier mehr als einer, der rausging —
 * ist das Format falsch oder noch kein Account verbunden, muss der Clipper
 * das sehen. Stillschweigend geschluckt, hielte er das Video für live.
 */
function publishBadge(u: UploadRow, lang: Lang): string {
  if (u.uploadStatus !== 'complete') return ''

  const label = publishStatusLabel(u.publishStatus, lang)

  /*
   * Ein Post geht an jeden verbundenen Account, und die können verschieden
   * ausgehen — live auf Instagram und von TikTok abgewiesen ist der
   * Normalfall, kein Sonderfall. Ein einzelnes Wort sagt das nicht, deshalb
   * steht jeder Account darunter: fünf TikTok-Accounts sind fünf Ergebnisse.
   *
   * Nur nach PLATTFORM — kein @Name, kein Link zum Beitrag (siehe Kopf der Datei).
   * Die Accounts gehören dem Kunden bzw. dem Creator der Kampagne; Name oder
   * Link verrieten, wer hinter der Kampagne steht. `platformLines` taugt dafür
   * nicht, es hängt den Namen an.
   */
  const detail = Object.values(readTargets(u.publishTargets))
    .filter(Boolean)
    .map((p) => {
      const name = esc(platformLabel(p.platform))
      if (p.state === 'posted') {
        return `<span class="text-emerald-600">${name} &check;</span>`
      }
      if (p.state === 'failed') {
        // Der Grund bleibt — ein falsches Format muss der Clipper sehen. Nennt
        // die Plattform darin den Account, fällt der Name heraus.
        const handle = p.username?.replace(/^@+/, '')
        const why = handle ? (p.error ?? '').split(handle).join('…') : (p.error ?? '')
        return `<span class="text-red-600" title="${esc(why)}">${name} &times;</span>`
      }
      return `<span class="text-slate-400">${name} &hellip;</span>`
    })
    .join(' &middot; ')

  const withDetail = (main: string) =>
    detail ? `${main}<span class="mt-1 block text-xs">${detail}</span>` : main

  switch (u.publishStatus) {
    case PUBLISH_STATUS.posted:
      return withDetail(badge(label, 'green'))
    case PUBLISH_STATUS.scheduled:
      return withDetail(badge(label, 'blue'))
    case PUBLISH_STATUS.partial:
    case PUBLISH_STATUS.waitingForAccounts:
      return withDetail(badge(label, 'amber'))
    case PUBLISH_STATUS.formatUnsupported:
    case PUBLISH_STATUS.tooLarge:
    case PUBLISH_STATUS.failed:
      return withDetail(badge(label, 'red'))
    default:
      return withDetail(`<span class="text-xs text-slate-400">${esc(label)}</span>`)
  }
}

/**
 * Reichweite eines Clips auf seiner Kachel — nur die Summe.
 *
 * „Noch keine Zahlen“ steht nur dort, wo welche kommen werden: bei einem
 * Clip, der irgendwo draußen ist. Ein abgewiesener oder nie gesendeter Clip
 * bekäme sonst dasselbe Versprechen. Zahlen, die da sind, stehen immer —
 * auch wenn die automatischen Ziele scheiterten und nur ein Creator ihn
 * verbreitet hat.
 */
function reachCell(u: UploadRow, lang: Lang): string {
  if (u.metrics) return metricStrip(u.metrics, lang, { size: 'sm' })
  const out =
    u.uploadStatus === 'complete' &&
    (u.publishStatus === PUBLISH_STATUS.posted || u.publishStatus === PUBLISH_STATUS.partial)
  return out ? metricStrip(undefined, lang, { size: 'sm' }) : ''
}

/**
 * Ein fertiger Clip als große Hochkant-Kachel (9:16) wie ein Short:
 * Vorschaubild, antippen spielt den Clip in einem neuen Tab, darunter Name,
 * Caption, Stand der Veröffentlichung und die Reichweite (nur die Summe).
 */
function clipTile(u: UploadRow, area: WorkArea, t: WorkText, o: { showCampaign: boolean }): string {
  const complete = u.uploadStatus === 'complete'
  const frame = `
              <div class="relative aspect-[9/16] overflow-hidden bg-gradient-to-b from-slate-800 to-slate-950">
                ${complete ? '' : `<div class="absolute inset-0 grid place-items-center text-white/40">${glyph('film', 'h-9 w-9')}</div>`}
                ${
                  u.poster && complete
                    ? `<img src="${esc(area.previewHref('clip', u.id))}" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" onerror="this.remove()">`
                    : ''
                }
                ${
                  complete
                    ? `<span class="absolute inset-0 grid place-items-center"><span class="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/30 backdrop-blur transition group-hover:scale-110 group-hover:bg-brand">${glyph(
                        'play',
                        'ml-0.5 h-6 w-6',
                      )}</span></span>`
                    : ''
                }
                <span class="absolute left-2 top-2">${complete ? '' : badge(t.incomplete, 'amber')}</span>
              </div>`
  return `
            <article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
              ${
                complete
                  ? `<a href="${esc(`${area.previewHref('clip', u.id)}?video=1`)}" target="_blank" rel="noopener" aria-label="${esc(`${u.filename} abspielen`)}" class="block">${frame}</a>`
                  : frame
              }
              <div class="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                ${o.showCampaign ? `<p class="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400" title="${esc(u.projectName)}">${esc(u.projectName)}</p>` : ''}
                <p class="break-all text-sm font-semibold leading-snug text-slate-800">${esc(u.filename)}</p>
                ${u.caption ? `<p class="line-clamp-2 text-xs text-slate-500" title="${esc(u.caption)}">${esc(u.caption)}</p>` : ''}
                <p class="text-[11px] text-slate-400">${esc(formatBytes(u.bytes, area.lang))} · ${esc(dateDE(u.createdAt))}</p>
                <div class="mt-1 text-xs">${publishBadge(u, area.lang)}</div>
                <div class="mt-auto pt-1">${reachCell(u, area.lang)}</div>
              </div>
            </article>`
}

const clipGrid = (rows: UploadRow[], area: WorkArea, t: WorkText, o: { showCampaign: boolean }) =>
  `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">${rows
    .map((u) => clipTile(u, area, t, o))
    .join('')}</div>`

/* ------------------------------------------------------------------ Upload */

export function uploadPage(
  o: {
    user: User
    projects: { id: string; name: string; status: string; thumb?: ThumbView }[]
    selectedProjectId: string | null
    uploads: UploadRow[]
    /** `metricsPausedUntil` — Hinweis über der Liste, solange der Abgleich ruht. */
    metricsPausedUntil?: number | null
  },
  area: WorkArea = CLIPPER_WORK_AREA,
): string {
  const t = TEXT[area.kind]
  const paused = o.uploads.length ? metricsPausedNote(o.metricsPausedUntil ?? null, area.lang) : ''

  /* Die Kampagne wählt man an ihrem Bild — große Kacheln statt einer
     Auswahlliste. Technisch sind es Radioknöpfe (`name="project"`); das
     Skript unten liest den gewählten Wert, alles Weitere (upload.js,
     Endpunkte, Felder) ist unverändert. */
  const picker = o.projects.length
    ? `<div class="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 sm:gap-4">${o.projects
        .map(
          (p) => `
            <label class="relative block cursor-pointer">
              <input type="radio" name="project" value="${esc(p.id)}" class="peer sr-only"${p.id === o.selectedProjectId ? ' checked' : ''}>
              <span class="block overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm transition hover:border-slate-300 peer-checked:border-brand peer-checked:ring-4 peer-checked:ring-brand/15 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30">
                ${campaignThumb(p.thumb, p.name)}
                <span class="flex items-center gap-2 px-3 py-2.5">
                  <span class="line-clamp-2 min-w-0 flex-1 font-display text-sm font-extrabold leading-snug tracking-tight">${esc(p.name)}</span>
                  ${statusBadge(p.status)}
                </span>
              </span>
              <span class="pointer-events-none absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-lg ring-2 ring-white peer-checked:grid">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="h-4 w-4"><path d="m5 12 5 5 9-10"/></svg>
              </span>
            </label>`,
        )
        .join('')}
          </div>`
    : `<p class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500">${esc(t.noneTakenOption)}</p>`

  const step = (n: number, label: string, extra = '') =>
    `<span class="mb-3 flex items-center gap-2.5 text-sm font-bold text-slate-700"><span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-extrabold text-brand">${n}</span>${esc(
      label,
    )}${extra}</span>`

  const body =
    pageTitle(t.uploadTitle, t.uploadSubtitle) +
    `
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <fieldset>
          <legend class="contents">${step(1, t.project)}</legend>
          ${picker}
        </fieldset>

        <label class="mt-7 block">
          ${step(2, t.caption, ` <em class="font-normal not-italic text-red-500">${esc(t.required)}</em>`)}
          <textarea id="caption" rows="3" maxlength="2200" required placeholder="${esc(t.captionPlaceholder)}"
                    class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"></textarea>
          <span class="mt-1.5 block text-xs text-slate-500">${esc(t.captionHelp)}</span>
        </label>

        <div class="mt-7">
          ${step(3, 'Video')}
          <div id="dropzone" class="dropzone cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto h-10 w-10 text-brand"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5M12 4v12"/></svg>
            <p class="mt-3 font-display text-lg font-bold">${esc(t.drop)}</p>
            <p class="mt-1 text-sm text-slate-500">mp4, mov, avi, mkv, webm</p>
            <input type="file" id="filepicker" multiple accept=".mp4,.mov,.avi,.mkv,.webm" class="hidden">
          </div>
          <ul id="queue" class="mt-4 space-y-2"></ul>
        </div>
      </div>

      <section class="mt-10">
        ${countHead(t.myUploads, o.uploads.length)}
        ${paused ? `<div class="mb-3">${paused}</div>` : ''}
        ${o.uploads.length ? clipGrid(o.uploads, area, t, { showCampaign: true }) : smallEmpty(t.uploadsEmptyTitle, t.uploadsEmptyText)}
      </section>

      <script src="/assets/poster.js"></script>
      <script src="/assets/upload.js" defer></script>`

  /* Die Endpunkte bleiben /api/work/… — auch für Creator freigegeben. Die
     Meldungen von upload.js folgen dem lang-Attribut der Seitenhülle. */
  return shell({
    title: t.uploadTitle,
    user: o.user,
    nav: area.nav,
    active: area.uploadHref,
    body,
    script: `
(function () {
  var zone = document.getElementById('dropzone');
  var picker = document.getElementById('filepicker');
  var queue = document.getElementById('queue');
  function chosen() {
    var r = document.querySelector('input[name="project"]:checked');
    return r ? r.value : '';
  }

  zone.addEventListener('click', function () { picker.click(); });
  ['dragenter', 'dragover'].forEach(function (evt) {
    zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
  });
  zone.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) start(e.dataTransfer.files); });
  picker.addEventListener('change', function () { if (picker.files.length) start(picker.files); });

  function start(files) {
    var projectId = chosen();
    if (!projectId) { window.alert(${js(t.noJob)}); picker.value = ''; return; }
    // Ohne Caption nimmt TikTok den Clip nicht an. Hier abfangen statt den
    // Upload laufen zu lassen und erst danach abzuweisen.
    var caption = document.getElementById('caption');
    if (!caption.value.trim()) {
      window.alert(${js(t.captionMissing)});
      caption.focus();
      picker.value = '';
      return;
    }
    var rows = [];
    Array.prototype.forEach.call(files, function (file) {
      var li = document.createElement('li');
      li.className = 'rounded-xl border border-slate-200 px-4 py-3';
      li.innerHTML =
        '<div class="flex items-center justify-between gap-3 text-sm">' +
          '<span class="truncate font-medium">' + file.name.replace(/[<>&]/g, '') + '</span>' +
          '<span class="shrink-0 text-xs text-slate-500" data-state></span>' +
        '</div>' +
        '<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><i class="block h-full w-0 rounded-full bg-brand transition-[width]" data-fill></i></div>';
      li.querySelector('[data-state]').textContent = ${js(t.waiting)};
      queue.appendChild(li);
      rows.push(li);
    });

    window.NMUpload.uploadAll(files, {
      init: '/api/work/uploads/init',
      part: '/api/work/uploads/part',
      complete: '/api/work/uploads/complete',
      thumb: '/api/work/uploads/thumb'
    }, { projectId: projectId, caption: caption.value.trim() }, {
      onStart: function (i) { rows[i].querySelector('[data-state]').textContent = ${js(t.uploading)}; },
      onProgress: function (i, loaded, total) {
        var pct = total ? Math.round((loaded / total) * 100) : 0;
        rows[i].querySelector('[data-fill]').style.width = pct + '%';
        rows[i].querySelector('[data-state]').textContent = pct + ' %';
      },
      onDone: function (i) {
        rows[i].querySelector('[data-fill]').style.width = '100%';
        rows[i].querySelector('[data-state]').textContent = ${js(t.done)};
        rows[i].querySelector('[data-state]').className = 'shrink-0 text-xs font-semibold text-emerald-600';
      },
      onError: function (i, file, err) {
        rows[i].querySelector('[data-state]').textContent = err.message;
        rows[i].querySelector('[data-state]').className = 'shrink-0 text-xs font-semibold text-red-600';
        rows[i].querySelector('[data-fill]').className = 'block h-full rounded-full bg-red-400';
      },
      onFinish: function (ok) { if (ok) window.setTimeout(function () { window.location.reload(); }, 1000); }
    });
  }
})();`,
  })
}
