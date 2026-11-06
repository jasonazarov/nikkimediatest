import {
  CREATOR_NAV,
  CUSTOMER_NAV,
  badge,
  campaignCard,
  campaignGrid,
  campaignThumb,
  dateDE,
  emptyState,
  esc,
  formatEuro,
  jsonScript,
  kpiBar,
  originBadge,
  sectionHead,
  shell,
  thumbUploadButtons,
  type Kpi,
  type NavItem,
  type ThumbView,
  quickActions,
  howItWorks,
  upsellSection,
  type PushArea,
} from './layout'
import { formatBytes } from '../lib/r2'
import { DEFAULT_DIAL, dialOptions, splitPhone } from '../lib/phone'
import { linkHost } from '../lib/domain'
import { agencyPackageLabel, agencyPlatformLabel, pricePerThousandCents, projectBriefing, viewsShort, type Briefing } from '../lib/agency'
import { cloudProvider } from '../lib/thumbs'
import { CONNECTABLE, PUBLISH_STATUS, platformLabel } from '../lib/publisher'
import { formatCompact, metricRows, metricStrip, metricsPausedNote } from './metrics'
import type { MetricRow, MetricTotals, MetricTotalsWithCreators } from '../lib/metrics'
import type { Customer, Folder, Project, ProjectLink, RawAsset, User } from '../db/schema'

/* ==========================================================================
   0 — BEREICH: KAMPAGNEN DES KUNDEN ODER EIGENE KAMPAGNEN EINES CREATORS

   Kampagnenliste und Dateiverwaltung gibt es zweimal: im Kundenbereich
   (/app) und für die eigenen Kampagnen eines Creators (/kampagnen/meine).
   Daten, API und Bedienung sind dieselben — ein Creator hat dafür eine
   eigene Zeile in `customers`. Technisch ist eine Kampagne nach wie vor ein
   Projekt (`projects`, Adressen /app/projekt/:id); sichtbar heißt sie seit
   Oktober 2026 in beiden Bereichen „Kampagne“.

   Was sich unterscheidet, steht hier: Navigation, Adressen, wohin fertige
   Clips gehen, und die Texte — Kunden lesen „die Clipper“, ein Creator „die
   Clipper und Creator“; Kunden verbinden ihre Accounts je Kampagne, ein
   Creator einmal für alle. Die Texte stehen als vollständige Sätze im Objekt
   und werden nicht aus Bausteinen zusammengesetzt. Alle Texte sind fertiges
   HTML aus diesem Code, keine Eingaben.
   ========================================================================== */

export interface CustomerAreaText {
  /** Seitentitel und Überschrift der Liste, zugleich erster Brotkrumen. */
  listTitle: string
  /** Erklärzeile unter der Überschrift der Liste (HTML). */
  listIntro: string
  /** Knopf über der Liste und Titel des Modals beim Anlegen. */
  newItem: string
  /** Gestrichelte Karte am Ende der Liste. */
  addAnother: string
  /** Leerzustand ohne eine einzige Kampagne. */
  emptyTitle: string
  emptyText: string
  /** Die drei Schritte unter dem Leerzustand, ohne Nummer. */
  steps: [string, string, string]
  /** Modal: Erklärzeile, Platzhalter im Namensfeld, Knopf beim Anlegen. */
  nameHint: string
  namePlaceholder: string
  createButton: string
  renameTitle: string
  deleteTitle: string
  deleteConfirm: string
  /**
   * Zusatz zur Lösch-Abfrage, wenn an der Kampagne Social-Accounts hängen —
   * sie werden beim Löschen getrennt (`releaseAtProvider`). `many` trägt `{n}`.
   */
  deleteAccountsNote: { one: string; many: string }
  /** Knopf in der Dateiansicht zurück zur Liste. */
  backToList: string
  /** Überschrift der Wahl „hochladen oder verlinken“ in einer leeren Kampagne. */
  materialQuestion: string
  /** Erklärzeile über den Cloud-Links der Kampagne. */
  linksIntro: string
  /** Erklärtext der Karte „Cloud-Link einfügen“ in der Wahl. */
  linkChoiceText: string
  /** Hinweis zur Freigabe im Modal „Cloud-Link hinzufügen“. */
  linkShareHint: string
  /** Hinweis über den Ordnern der Kampagne (HTML). */
  openFolderHint: string
  /** Hinweis im Modal „Neuer Ordner“ — bekommt den Namen schon escaped. */
  folderBelongsTo: (nameHtml: string) => string
  /** Schalter „Verbreitung über Creator“ auf der Kampagnenseite: Beschriftung und Erklärung. */
  distributionLabel: string
  distributionText: string
  /** Erklärzeile unter den Zahlen der Kampagne. */
  metricsIntro: string
  /** Beschriftung des Anteils, der über (andere) Creator lief — Liste und Kampagnenseite. */
  metricsViaCreators: string
  /**
   * Verweis auf die Zahlen je Clip und Account (HTML) — leer, wo es keine
   * Clip-Ansicht gibt: Ein Creator sieht die fertigen Clips seiner eigenen
   * Kampagnen nicht, also auch keine Zeilen je Clip.
   */
  metricsDetail: string
}

export interface CustomerArea {
  nav: NavItem[]
  /** Aktiver Menüpunkt. */
  active: string
  /** Die Liste aller Kampagnen. */
  home: string
  projectHref: (id: string) => string
  folderHref: (id: string) => string
  /**
   * Gesetzt bei Agenturen: „Neue Kampagne“ führt dorthin (zum Briefing) statt
   * ein Namensfeld zu öffnen. Eine Agentur legt keine Kampagne ohne Views,
   * Budget und Auftrag an (Vorgabe des Auftraggebers).
   */
  newHref?: string
  /**
   * Nach dem Anlegen direkt hinein? Kunden bleiben auf der Liste (so war es
   * immer), ein Creator landet gleich in der neuen Kampagne — dort fragt sie
   * nach dem Material, ohne das sie für niemanden sichtbar wird.
   */
  openAfterCreate: boolean
  /**
   * Wohin fertige Clips automatisch gehen.
   *
   *   'project'  an die Accounts, die der Kunde an DIESER Kampagne verbindet —
   *              die Kampagnenseite hat Knöpfe zum Verbinden und Trennen.
   *   'creator'  an die Accounts des Creators selbst. Die verbindet er einmal
   *              unter /kampagnen/accounts für alle Kampagnen (abgerechnet
   *              wird je verbundenem Account — je Kampagne neu verbinden
   *              hieße doppelte Kosten). Die Kampagne zeigt sie nur an.
   */
  accounts: 'project' | 'creator'
  /**
   * Seite mit den fertigen Clips — nur im Kundenbereich. Ein Creator sieht
   * die fertigen Clips seiner eigenen Kampagnen nicht; ohne Adresse fehlt
   * deshalb auch ihre Zahl in den Kennzahlen.
   */
  videosHref?: string
  text: CustomerAreaText
}

/** Der Kundenbereich. */
export const CUSTOMER_AREA: CustomerArea = {
  nav: CUSTOMER_NAV,
  active: '/app',
  home: '/app',
  projectHref: (id) => `/app/projekt/${id}`,
  folderHref: (id) => `/app/ordner/${id}`,
  openAfterCreate: false,
  accounts: 'project',
  videosHref: '/app/videos',
  text: {
    listTitle: 'Meine Kampagnen',
    listIntro:
      'Lege für jedes Vorhaben eine Kampagne an. Darin liegt dein Rohmaterial, hochgeladen in Ordnern oder als Link zu deiner Cloud.',
    newItem: 'Neue Kampagne',
    addAnother: 'Weitere Kampagne anlegen',
    emptyTitle: 'Jetzt deine Kampagne anlegen',
    emptyText:
      'In jeder Kampagne kannst du beliebig Ordner erstellen und dann deine Videos hochladen, ähnlich wie bei Google&nbsp;Drive, nur einfacher. Liegt dein Material schon in einer Cloud, reicht auch der Link zum Ordner.',
    steps: ['Kampagne anlegen', 'Ordner darin erstellen', 'Videos hochladen'],
    nameHint: 'Gib der Kampagne einen Namen, den du wiedererkennst.',
    namePlaceholder: 'z. B. Sommer-Aktion',
    createButton: 'Anlegen',
    renameTitle: 'Kampagne umbenennen',
    deleteTitle: 'Kampagne löschen',
    deleteConfirm: 'Kampagne endgültig löschen? Das geht nur, solange sie keine Dateien und keine Cloud-Links enthält.',
    deleteAccountsNote: {
      one: 'Der verbundene Social-Account dieser Kampagne wird dabei getrennt, fertige Clips gehen dann nicht mehr dorthin.',
      many: 'Die {n} verbundenen Social-Accounts dieser Kampagne werden dabei getrennt, fertige Clips gehen dann nicht mehr dorthin.',
    },
    backToList: 'Alle Kampagnen',
    materialQuestion: 'Wie kommt dein Rohmaterial in die Kampagne?',
    linksIntro:
      'Dein Rohmaterial liegt in Google Drive, Dropbox, iCloud oder einer anderen Cloud? Füge hier den Link zum Ordner ein, die Clipper öffnen ihn direkt.',
    linkChoiceText:
      'Dein Rohmaterial liegt in Google Drive, Dropbox, iCloud oder einer anderen Cloud? Füge den Link zum Ordner ein, die Clipper öffnen ihn direkt.',
    linkShareHint:
      'Google Drive, Dropbox, iCloud, OneDrive, WeTransfer und Co. Stell die Freigabe so ein, dass jeder mit dem Link den Ordner öffnen kann, sonst kommen die Clipper nicht an dein Material.',
    openFolderHint:
      'Öffne einen Ordner dieser Kampagne, um Dateien hochzuladen. Mit <strong>Neuer Ordner</strong> legst du weitere an.',
    folderBelongsTo: (name) =>
      `Der Ordner gehört zur Kampagne „${name}“: daran hängt, welches Team das Material bearbeitet.`,
    distributionLabel: 'Clips zusätzlich über Creator verbreiten',
    distributionText:
      'Creator, die NIKKI MEDIA dafür auswählt, sehen die fertigen Clips dieser Kampagne und posten sie nach ihrer Freigabe auf ihren eigenen Kanälen. Deine verbundenen Accounts bekommen jeden Clip weiterhin automatisch.',
    metricsIntro:
      'Was die fertigen Clips dieser Kampagne auf allen Kanälen erreicht haben, deine Accounts und die Verbreitung über Creator zusammen.',
    metricsViaCreators: 'Davon über Creator',
    metricsDetail:
      'Die Zahlen je Clip und Account stehen unter <a href="/app/videos" class="font-semibold text-brand hover:text-brand-2">Fertige Videos</a>.',
  },
}

/**
 * Die eigenen Kampagnen eines Creators. Eine Kampagne ist technisch ein
 * Projekt in seinem Arbeitsbereich: Er lädt Rohmaterial hoch oder verlinkt
 * es, und die Clipper und Creator machen daraus Clips.
 */
export const CREATOR_CAMPAIGN_AREA: CustomerArea = {
  nav: CREATOR_NAV,
  active: '/kampagnen/meine',
  home: '/kampagnen/meine',
  projectHref: (id) => `/kampagnen/meine/${id}`,
  folderHref: (id) => `/kampagnen/ordner/${id}`,
  openAfterCreate: true,
  accounts: 'creator',
  text: {
    listTitle: 'Meine Kampagnen',
    listIntro:
      'Deine EIGENEN Kampagnen: von dir angelegt. Darin lädst du dein Rohmaterial hoch oder fügst Cloud-Links ein, die Clipper und Creator machen daraus Clips. Kampagnen, die dir NIKKI MEDIA zuweist, stehen getrennt unter <a href="/kampagnen/finden" class="font-semibold text-brand hover:underline">„Zugewiesene Kampagnen“</a>.',
    newItem: 'Neue Kampagne',
    addAnother: 'Weitere Kampagne anlegen',
    emptyTitle: 'Jetzt deine Kampagne anlegen',
    emptyText:
      'In jeder Kampagne kannst du beliebig Ordner erstellen und dein Rohmaterial hochladen, ähnlich wie bei Google&nbsp;Drive, nur einfacher. Liegt dein Material schon in einer Cloud, reicht auch der Link zum Ordner. Die Clipper und Creator machen daraus Clips.',
    steps: ['Kampagne anlegen', 'Ordner darin erstellen', 'Videos hochladen'],
    nameHint: 'Gib der Kampagne einen Namen, den du wiedererkennst.',
    namePlaceholder: 'z. B. Podcast-Highlights',
    createButton: 'Kampagne anlegen',
    renameTitle: 'Kampagne umbenennen',
    deleteTitle: 'Kampagne löschen',
    deleteConfirm: 'Kampagne endgültig löschen? Das geht nur, solange sie keine Dateien und keine Cloud-Links enthält.',
    deleteAccountsNote: {
      one: 'Der Social-Account, der direkt an dieser Kampagne verbunden ist, wird dabei getrennt. Deine Accounts unter „Meine Accounts“ bleiben verbunden.',
      many: 'Die {n} Social-Accounts, die direkt an dieser Kampagne verbunden sind, werden dabei getrennt. Deine Accounts unter „Meine Accounts“ bleiben verbunden.',
    },
    backToList: 'Alle Kampagnen',
    materialQuestion: 'Wie kommt dein Rohmaterial in die Kampagne?',
    linksIntro:
      'Dein Rohmaterial liegt in Google Drive, Dropbox, iCloud oder einer anderen Cloud? Füge hier den Link zum Ordner ein, die Clipper und Creator öffnen ihn direkt.',
    linkChoiceText:
      'Dein Rohmaterial liegt in Google Drive, Dropbox, iCloud oder einer anderen Cloud? Füge den Link zum Ordner ein, die Clipper und Creator öffnen ihn direkt.',
    linkShareHint:
      'Google Drive, Dropbox, iCloud, OneDrive, WeTransfer und Co. Stell die Freigabe so ein, dass jeder mit dem Link den Ordner öffnen kann, sonst kommen die Clipper und Creator nicht an dein Material.',
    openFolderHint:
      'Öffne einen Ordner dieser Kampagne, um Dateien hochzuladen. Mit <strong>Neuer Ordner</strong> legst du weitere an.',
    folderBelongsTo: (name) =>
      `Der Ordner gehört zur Kampagne „${name}“: wem NIKKI MEDIA sie zuordnet, der sieht das Material darin.`,
    distributionLabel: 'Clips zusätzlich über andere Creator verbreiten',
    distributionText:
      'Creator, die NIKKI MEDIA dafür auswählt, sehen die fertigen Clips dieser Kampagne und posten sie nach ihrer Freigabe auf ihren eigenen Kanälen. Deine eigenen Accounts bekommen jeden Clip weiterhin automatisch.',
    metricsIntro:
      'Was die fertigen Clips dieser Kampagne auf allen Kanälen erreicht haben, deine Accounts und die Verbreitung über andere Creator zusammen.',
    metricsViaCreators: 'Davon über andere Creator',
    metricsDetail: '',
  },
}

/**
 * Text als JavaScript-String in einfachen Anführungszeichen — für die Texte
 * oben im eingebetteten Skript. `<` wird maskiert, damit kein Text das
 * <script>-Tag schließen kann.
 */
const jsText = (s: string) =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/</g, '\\x3c')}'`

/** „1 Datei“ / „14 Dateien“ — Zahl mit Tausenderpunkt, Wort in der passenden Form. */
const count = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

/** Beschriftung zur Zahl in `kpiBar` — Einzahl nur bei genau eins. */
const kpi = (n: number, one: string, many: string): Kpi => ({
  value: n.toLocaleString('de-DE'),
  label: n === 1 ? one : many,
})

/** Pausiert und beendet stehen als kleines Abzeichen auf dem Thumbnail; laufende brauchen keins. */
const statusBadge = (status: string) =>
  status === 'pausiert' ? badge('Pausiert', 'amber') : status === 'beendet' ? badge('Beendet', 'grey') : ''

/* Kleine Glyphen für Knöpfe — 24er-Raster wie die Navigation. */
const svg = (path: string, cls = 'h-4 w-4', width = '1.8') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${path}</svg>`
const PLUS = '<path d="M12 5v14M5 12h14"/>'
const PENCIL = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
const TRASH = '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
const UPLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5M12 4v12"/>'
const NEW_FOLDER = '<path d="M12 10v6M9 13h6"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'
const LINK =
  '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>'
const EXTERNAL = '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
const BACK = '<path d="m15 18-6-6 6-6"/>'

const linkIcon = (cls: string) => svg(LINK, cls)

/**
 * Knöpfe auf einer Kachel: auf Geräten mit Maus erst beim Überfahren
 * sichtbar, auf Touch-Geräten immer — dort gibt es kein Überfahren.
 */
const HOVER_REVEAL =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100'

const BTN_PRIMARY =
  'inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-2'
const BTN_GHOST =
  'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-brand hover:text-brand'

/**
 * Das Briefing einer Agentur-Kampagne als kleine Zeile: Views, Budget, Preis
 * pro 1.000 Views, dazu Auftrag, Bereich und Plattformen, soweit angegeben.
 * Steht auf der Kampagnenseite unter /collaboration.
 */
export function briefingStrip(b: Briefing): string {
  const cell = (label: string, value: string) => `
        <div class="min-w-0 px-4 py-2.5">
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-amber-700/80">${esc(label)}</dt>
          <dd class="mt-0.5 font-display text-sm font-extrabold text-slate-900">${esc(value)}</dd>
        </div>`
  return `<dl class="flex flex-wrap divide-x divide-amber-200/70 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50 to-white ring-1 ring-inset ring-amber-200" data-briefing-info>
        ${cell('Views', `${viewsShort(b.views)} Views`)}
        ${cell('Budget', formatEuro(b.budgetCents))}
        ${cell('Pro 1.000 Views', formatEuro(pricePerThousandCents(b)))}
        ${b.pkg ? cell('Auftrag', agencyPackageLabel(b.pkg)) : ''}
        ${b.niche ? cell('Bereich', b.niche) : ''}
        ${b.platforms.length ? cell('Plattformen', b.platforms.map(agencyPlatformLabel).join(', ')) : ''}
      </dl>`
}

/* ==========================================================================
   1 — MEINE KAMPAGNEN

   Die oberste Ebene ist bewusst die Kampagne und nicht der Ordner: Eine
   Kampagne ist das, was als Job an die Clipper geht. Ordner gibt es nur
   innerhalb einer Kampagne — ein Ordner ohne Kampagne wäre für niemanden
   sichtbar außer dem Kunden selbst.

   Seit Oktober 2026 wie bei YouTube: jede Kampagne als große Karte mit
   Thumbnail (`campaignCard`), die Kennzahlen klein in einer Zeile darüber
   (`kpiBar`), die Zahlen je Kampagne klein im Fuß der Karte.
   ========================================================================== */

export interface ProjectCard extends Project {
  folderCount: number
  fileCount: number
  bytes: number
  /** Cloud-Links an der Kampagne — zählen genauso als Material wie Dateien. */
  linkCount: number
  /**
   * Social-Accounts, die direkt an dieser Kampagne hängen. Sie werden beim
   * Löschen getrennt — das sagt die Lösch-Abfrage, aber nur, wenn es welche
   * gibt. Die Accounts eines Creators hängen an ihm, nicht hier.
   */
  accountCount: number
  /** Summen aus Zernio über alle Posts — fehlt, solange es keine Zahlen gibt. */
  metrics?: MetricTotalsWithCreators
  /** Thumbnail aus `campaignThumbs` — fehlt es, zeigt die Karte die Initialen. */
  thumb?: ThumbView
}

/**
 * Der Anteil „davon über Creator“ als eine Zeile unter den Zahlen — nur,
 * wenn es ihn gibt. Eine volle zweite Leiste wäre in der Karte zu viel; die
 * steht auf der Kampagnenseite.
 */
function viaCreatorsLine(label: string, t: MetricTotalsWithCreators | undefined): string {
  if (!t || t.viaCreators.posts <= 0) return ''
  return `<p class="mt-1 text-[11px] text-slate-500">${esc(label)}: <span class="font-semibold tabular-nums text-slate-700" title="${esc(
    t.viaCreators.views.toLocaleString('de-DE'),
  )} Views">${esc(formatCompact(t.viaCreators.views, 'de'))}</span> Views</p>`
}

/** Summe einer Kennzahl über alle Kampagnen mit Zahlen — null, wenn keine welche hat. */
function sumMetric(list: (MetricTotals | undefined)[], key: 'views' | 'likes'): number | null {
  const filled = list.filter((t): t is MetricTotals => Boolean(t && t.posts > 0))
  return filled.length ? filled.reduce((s, t) => s + t[key], 0) : null
}

export function projectsPage(o: {
  user: User
  projects: ProjectCard[]
  area?: CustomerArea
  /** `metricsPausedUntil` — solange Zernio keine Zahlen liefert, steht ein Hinweis über der Liste. */
  metricsPausedUntil?: number | null
  /** Fertige Clips über alle Kampagnen — nur, wo `area.videosHref` gesetzt ist. */
  clipCount?: number
}): string {
  const area = o.area ?? CUSTOMER_AREA
  const t = area.text
  const pausedNote = o.projects.length ? metricsPausedNote(o.metricsPausedUntil ?? null, 'de') : ''

  // Beim Creator trägt jede Karte fest „Eigene Kampagne“ — zur Abgrenzung
  // von den zugewiesenen (Vorgabe des Auftraggebers).
  const isCreator = area === CREATOR_CAMPAIGN_AREA
  const cards = o.projects.map((p) =>
    campaignCard({
      href: area.projectHref(p.id),
      name: p.name,
      thumb: p.thumb,
      origin: isCreator ? { kind: 'own' } : undefined,
      eyebrow: `${isCreator ? 'Von dir angelegt am' : 'Angelegt am'} ${dateDE(p.createdAt)}`,
      meta: [
        esc(count(p.folderCount, 'Ordner', 'Ordner')),
        esc(count(p.fileCount, 'Datei', 'Dateien')),
        esc(formatBytes(p.bytes)),
        ...(p.linkCount ? [esc(count(p.linkCount, 'Cloud-Link', 'Cloud-Links'))] : []),
      ],
      corner: statusBadge(p.status),
      // Außerhalb des Links: Umbenennen und Löschen öffnen nicht zugleich die Kampagne.
      footer: `
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                ${metricStrip(p.metrics, 'de', { size: 'sm' })}
                ${viaCreatorsLine(t.metricsViaCreators, p.metrics)}
              </div>
              <div class="-mr-1.5 -mt-1 flex shrink-0 gap-0.5">
                <button type="button" data-rename-project="${esc(p.id)}" data-name="${esc(p.name)}" title="${esc(t.renameTitle)}" aria-label="${esc(t.renameTitle)}"
                        class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">${svg(PENCIL)}</button>
                <button type="button" data-del-project="${esc(p.id)}" data-accounts="${esc(p.accountCount)}" title="${esc(t.deleteTitle)}" aria-label="${esc(t.deleteTitle)}"
                        class="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600">${svg(TRASH)}</button>
              </div>
            </div>`,
    }),
  )

  /* Wo `area.newHref` gesetzt ist (Agenturen), öffnet „Neue Kampagne“ kein
     Namensfeld, sondern führt zum Briefing. Gleiche Optik, nur ein Link. */
  const opener = (cls: string, inner: string, id?: string) =>
    area.newHref
      ? `<a href="${esc(area.newHref)}"${id ? ` id="${id}"` : ''} class="${cls}">${inner}</a>`
      : `<button type="button"${id ? ` id="${id}"` : ' data-open-new-project'} class="${cls}">${inner}</button>`

  const addCard = opener(
    'flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-6 text-slate-500 transition hover:border-brand hover:bg-white hover:text-brand',
    `
            <span class="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 transition">${svg(PLUS, 'h-7 w-7', '1.6')}</span>
            <span class="font-display text-base font-bold">${t.addAnother}</span>`,
  )

  /* Kennzahlen klein in einer Zeile — die Kampagnen selbst sind das Große. */
  const totals = o.projects.reduce(
    (s, p) => ({ files: s.files + p.fileCount, bytes: s.bytes + p.bytes, links: s.links + p.linkCount }),
    { files: 0, bytes: 0, links: 0 },
  )
  const kpis: Kpi[] = [
    kpi(o.projects.length, 'Kampagne', 'Kampagnen'),
    kpi(totals.files, 'Datei', 'Dateien'),
    { value: formatBytes(totals.bytes), label: 'Speicher' },
    kpi(totals.links, 'Cloud-Link', 'Cloud-Links'),
  ]
  if (area.videosHref && o.clipCount !== undefined) kpis.push(kpi(o.clipCount, 'Fertiges Video', 'Fertige Videos'))
  const views = sumMetric(
    o.projects.map((p) => p.metrics),
    'views',
  )
  if (views !== null) kpis.push({ value: formatCompact(views, 'de'), label: 'Views' })

  const body = `
      <header class="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${t.listTitle}</h1>
          <p class="mt-1.5 max-w-2xl text-slate-500">${t.listIntro}</p>
        </div>
        ${opener(`${BTN_PRIMARY} px-5`, `${svg(PLUS)} ${t.newItem}`, 'new-project')}
      </header>

      ${o.projects.length ? kpiBar(kpis, 'mb-6') : ''}
      ${area.home === '/app' ? quickActions([
        ...(area.videosHref ? [{ label: 'Fertige Videos', href: area.videosHref, icon: 'film', primary: true }] : []),
        { label: 'Mehr Reichweite', href: '#mehr-reichweite', icon: 'trend' },
        { label: 'Einstellungen', href: '/app/einstellungen', icon: 'cog' },
      ]) : ''}
      ${pausedNote ? `<div class="mb-5">${pausedNote}</div>` : ''}

      ${
        o.projects.length
          ? campaignGrid([...cards, addCard])
          : /* Der Kunde kommt frisch aus dem Formular und sieht hier zum ersten
               Mal seinen Bereich. Statt einer leeren Fläche steht die Einladung
               samt Erklärung der Hierarchie: Kampagne → Ordner → Videos. */
            opener(
              'group block w-full rounded-3xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center transition hover:border-brand hover:bg-blue-50/40',
              `
               <span class="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-brand text-white transition group-hover:bg-brand-2">
                 ${svg(PLUS, 'h-10 w-10', '2')}
               </span>
               <span class="mt-6 block font-display text-2xl font-extrabold tracking-tight">${t.emptyTitle}</span>
               <span class="mx-auto mt-3 block max-w-xl text-[15px] leading-relaxed text-slate-500">
                 ${t.emptyText}
               </span>
               <span class="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                 <span class="rounded-full bg-slate-100 px-3 py-1.5">1 · ${t.steps[0]}</span>
                 <span class="text-slate-300">→</span>
                 <span class="rounded-full bg-slate-100 px-3 py-1.5">2 · ${t.steps[1]}</span>
                 <span class="text-slate-300">→</span>
                 <span class="rounded-full bg-slate-100 px-3 py-1.5">3 · ${t.steps[2]}</span>
               </span>`,
            )
      }

      <!-- Modal: Neue Kampagne / Umbenennen -->
      <div id="project-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="project-modal-title" class="font-display text-lg font-bold">${t.newItem}</h2>
          <p class="mt-1 text-sm text-slate-500">${t.nameHint}</p>
          <input id="project-name" type="text" maxlength="80" placeholder="${esc(t.namePlaceholder)}"
                 class="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          <p id="project-error" class="mt-2 hidden text-sm font-medium text-red-600"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-modal class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Abbrechen</button>
            <button type="button" id="project-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">${t.createButton}</button>
          </div>
        </div>
      </div>
      ${area.home === '/app' ? howItWorks('So funktioniert NIKKI MEDIA', 'Du zahlst nur für echte Views', [
        { title: 'Material hochladen', text: 'Lege eine Kampagne an und lade dein Rohmaterial hoch, als Datei oder als Link zu deiner Cloud.', icon: 'upload' },
        { title: 'Clipper verbreiten', text: 'Unser Netzwerk aus Clippern und Creatorn schneidet kurze Clips und postet sie auf TikTok, Instagram und YouTube.', icon: 'scissors' },
        { title: 'Echte Views zählen', text: 'Die Zahlen kommen direkt von den Plattformen. Abgerechnet wird nach erreichten Views, nicht nach Aufwand.', icon: 'trend' },
      ]) : ''}`

  return shell({
    title: t.listTitle,
    user: o.user,
    nav: area.nav,
    active: area.active,
    body,
    script: `
(function () {
  var modal = document.getElementById('project-modal');
  var title = document.getElementById('project-modal-title');
  var input = document.getElementById('project-name');
  var error = document.getElementById('project-error');
  var save = document.getElementById('project-save');
  var editing = null;

  function open(id, name) {
    editing = id || null;
    title.textContent = editing ? ${jsText(t.renameTitle)} : ${jsText(t.newItem)};
    save.textContent = editing ? 'Speichern' : ${jsText(t.createButton)};
    input.value = name || '';
    error.classList.add('hidden');
    save.disabled = false;
    modal.classList.remove('hidden'); modal.classList.add('flex');
    input.focus();
  }
  function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

  function api(method, url, payload) {
    return fetch(url, {
      method: method,
      headers: payload ? { 'content-type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
        return data;
      });
    });
  }

  // Bei Agenturen ist „Neue Kampagne“ ein Link zum Briefing — dann gibt es hier nichts zu binden.
  ${area.newHref ? '' : `document.getElementById('new-project').addEventListener('click', function () { open(null, ''); });`}
  document.querySelectorAll('[data-open-new-project]').forEach(function (el) {
    el.addEventListener('click', function () { open(null, ''); });
  });
  document.querySelectorAll('[data-close-modal]').forEach(function (b) { b.addEventListener('click', close); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  document.querySelectorAll('[data-rename-project]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      open(btn.getAttribute('data-rename-project'), btn.getAttribute('data-name'));
    });
  });

  save.addEventListener('click', function () {
    // Doppeltipp-Schutz: bis zur Antwort bleibt der Knopf gesperrt — sonst
    // entstehen zwei Kampagnen mit demselben Namen.
    if (save.disabled) return;
    var name = input.value.trim();
    if (!name) { error.textContent = 'Bitte gib einen Namen ein.'; error.classList.remove('hidden'); return; }
    save.disabled = true;
    var req = editing
      ? api('POST', '/api/app/projects/' + editing, { name: name })
      : api('POST', '/api/app/projects', { name: name });
    req.then(${
      area.openAfterCreate
        ? `function (data) {
      // Neu angelegt: direkt hinein, dort geht es mit dem Material weiter.
      if (!editing && data.id) {
        window.location.href = ${jsText(area.projectHref('{id}'))}.replace('{id}', encodeURIComponent(data.id));
        return;
      }
      window.location.reload();
    }`
        : `function () { window.location.reload(); }`
    })
       .catch(function (err) { error.textContent = err.message; error.classList.remove('hidden'); save.disabled = false; });
  });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save.click(); });

  /* Verbundene Accounts gehen beim Löschen mit (beim Anbieter getrennt) —
     das soll niemanden überraschen. Ohne Accounts bleibt die Abfrage kurz. */
  function deleteQuestion(btn) {
    var n = parseInt(btn.getAttribute('data-accounts') || '0', 10) || 0;
    if (!n) return ${jsText(t.deleteConfirm)};
    var note = n === 1 ? ${jsText(t.deleteAccountsNote.one)} : ${jsText(t.deleteAccountsNote.many)}.replace('{n}', String(n));
    return ${jsText(t.deleteConfirm)} + '\\n\\n' + note;
  }

  document.querySelectorAll('[data-del-project]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm(deleteQuestion(btn))) return;
      api('DELETE', '/api/app/projects/' + btn.getAttribute('data-del-project'))
        .then(function () { window.location.reload(); })
        .catch(function (err) { window.alert(err.message); });
    });
  });
})();`,
  })
}

/* ==========================================================================
   2 — ORDNER, CLOUD-LINKS UND DATEIEN INNERHALB EINER KAMPAGNE

   Oben ein großer Kopf mit dem Thumbnail der Kampagne — dort lässt sich auch
   ein eigenes hochladen, das dann fest für die Kampagne gilt (bei Kunde,
   Creator und Admin gleich). Darunter Ordner und Cloud-Links als große
   Kacheln, in einem Ordner die Dateien ebenso. Kennzahlen und Reichweite
   stehen klein im Kopf.
   ========================================================================== */

export interface FilesView {
  user: User
  customer: Customer
  /** Die Kampagne, in der wir uns bewegen. */
  project: Project
  /** null = Kampagnenseite (oberste Ebene) */
  folder: Folder | null
  breadcrumb: Folder[]
  folders: (Folder & { fileCount: number; bytes: number })[]
  assets: RawAsset[]
  /**
   * Signierte Adressen der Vorschaubilder je Datei (`raw_assets.thumb_key`) —
   * kleine JPEGs. Fehlt eine, zeigt die Kachel ein Symbol.
   */
  assetThumbs?: Record<string, string>
  /** Cloud-Links der Kampagne — nur auf der Kampagnenseite befüllt. */
  links: ProjectLink[]
  trash: { folders: Folder[]; assets: RawAsset[] }
  showTrash: boolean
  /** Accounts und Verbreitung — nur auf der Kampagnenseite befüllt. */
  publishing?: PublishingView
  /**
   * Zahlen aus Zernio — nur auf der Kampagnenseite befüllt. `totals` fehlt,
   * solange es für die Kampagne keine Zahlen gibt.
   */
  metrics?: { totals?: MetricTotalsWithCreators; pausedUntil: number | null }
  /** Thumbnail der Kampagne (`campaignThumbs`) — nur auf der Kampagnenseite. */
  thumb?: ThumbView
  /**
   * Bestand der ganzen Kampagne, auch in Unterordnern — nur auf der
   * Kampagnenseite. `clips` nur, wo es eine Seite mit fertigen Clips gibt.
   */
  stats?: { folders: number; files: number; bytes: number; clips?: number }
}

/**
 * Was die Kampagnenseite über die Veröffentlichung zeigt. Welche Accounts
 * gemeint sind, entscheidet `area.accounts`: die der Kampagne oder die des
 * Creators, dem die Kampagne gehört.
 */
export interface PublishingView {
  accounts: { id: string; platform: string; username: string | null; displayName: string | null }[]
  /** Ist die Anbindung eingerichtet? Ohne sie gibt es nichts zu verbinden. */
  ready: boolean
  /** Rückmeldung nach der Rückkehr aus dem Verbinden — grün oder rot. */
  flash?: { ok?: string; error?: string }
  /** `projects.creator_distribution` — Standard aus. */
  distribution: boolean
  /** Wie viele Creator NIKKI MEDIA der Verbreitung zugeordnet hat. */
  creators: number
}

const VIDEO_FILE = /\.(mp4|mov|avi|mkv|webm)$/i

/** Dateiendung als kleines Etikett auf der Kachel („MP4“). */
const extOf = (name: string) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? '').toUpperCase()

/** Großer, zweifarbiger Ordner für die Kacheln. */
const FOLDER_ART = `<svg viewBox="0 0 64 52" class="h-16 w-20 drop-shadow-sm transition duration-300 group-hover:scale-105 sm:h-20 sm:w-24" aria-hidden="true">
      <path d="M4 8a6 6 0 0 1 6-6h13.5a4 4 0 0 1 2.8 1.2L31 8h23a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z" fill="#17a865"/>
      <path d="M4 17a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v27a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z" fill="#2fe08c"/>
      <path d="M4 17a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v2H4Z" fill="#fff" opacity=".18"/>
    </svg>`

/** Ein Ordner als große Kachel; der Papierkorb-Knopf liegt außerhalb des Links. */
function folderTile(area: CustomerArea, f: FilesView['folders'][number]): string {
  return `
          <article class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
            <a href="${esc(area.folderHref(f.id))}" class="block focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
              <div class="grid aspect-[4/3] place-items-center bg-gradient-to-br from-blue-50 via-white to-slate-100">${FOLDER_ART}</div>
              <div class="border-t border-slate-100 px-4 py-3">
                <p class="truncate font-display text-base font-bold group-hover:text-brand" title="${esc(f.name)}">${esc(f.name)}</p>
                <p class="mt-0.5 text-xs text-slate-500">${esc(count(f.fileCount, 'Datei', 'Dateien'))} · ${esc(formatBytes(f.bytes))}</p>
              </div>
            </a>
            <button type="button" data-del-folder="${esc(f.id)}" title="In den Papierkorb" aria-label="Ordner in den Papierkorb"
                    class="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-slate-400 shadow-sm ring-1 ring-slate-200 transition hover:text-red-600 ${HOVER_REVEAL}">
              ${svg(TRASH)}
            </button>
          </article>`
}

/** Gestrichelte Kachel am Ende einer Reihe — „Neuer Ordner“ oder „Cloud-Link hinzufügen“. */
const addTile = (attr: string, icon: string, label: string, hint: string, aspect: string) => `
          <button type="button" ${attr}
                  class="group flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 text-slate-500 transition hover:border-brand hover:bg-white hover:text-brand">
            <span class="grid ${aspect} w-full place-items-center">
              <span class="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 transition group-hover:bg-blue-50">${icon}</span>
            </span>
            <span class="w-full px-4 pb-3 text-left">
              <span class="block font-display text-base font-bold">${label}</span>
              <span class="mt-0.5 block text-xs text-slate-400">${hint}</span>
            </span>
          </button>`

/**
 * Ein Cloud-Link als große Karte mit dem Symbol des Anbieters — wie das
 * Thumbnail einer Kampagne, die nur einen Link hat. Unbekannte Anbieter
 * zeigen eine Weltkugel und daneben klein ihr Favicon. Die URL ist
 * serverseitig auf https geprüft (normalizeCloudLink) und wird trotzdem
 * escaped.
 */
function linkCard(l: ProjectLink): string {
  const host = linkHost(l.url)
  const provider = cloudProvider(host)
  const art = provider.bundled ? `/img/cloud/${provider.id}.svg` : '/img/cloud/web.svg'
  const favicon = provider.bundled
    ? ''
    : `<img src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico" alt="" width="16" height="16" loading="lazy" class="h-4 w-4 shrink-0 rounded-sm" onerror="this.remove()">`
  return `
          <article class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="block focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
              <div class="relative grid aspect-video place-items-center bg-gradient-to-br from-white via-slate-50 to-slate-200">
                <img src="${esc(art)}" alt="" loading="lazy" decoding="async" class="h-12 w-12 object-contain drop-shadow-sm transition duration-300 group-hover:scale-105 sm:h-16 sm:w-16 xl:h-20 xl:w-20"
                     onerror="this.onerror=null;this.src='/img/cloud/web.svg'">
                <span class="absolute bottom-2.5 left-3 hidden items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm sm:inline-flex">
                  ${svg(EXTERNAL, 'h-3 w-3', '2')} Öffnen
                </span>
              </div>
              <div class="border-t border-slate-100 px-4 py-3">
                <p class="flex min-w-0 items-center gap-1.5 font-display text-base font-bold group-hover:text-brand">${favicon}<span class="truncate">${esc(
                  provider.bundled ? provider.label : host,
                )}</span></p>
                <p class="mt-0.5 truncate text-xs text-slate-500" title="${esc(l.url)}">${esc(l.url)}</p>
              </div>
            </a>
            <button type="button" data-del-link="${esc(l.id)}" title="Link entfernen"
                    class="absolute right-2 top-2 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-red-50 ${HOVER_REVEAL}">Entfernen</button>
          </article>`
}

/**
 * Eine Datei als große Kachel: Vorschaubild (oder Symbol) im Format 16:9,
 * darunter Name, Größe und Datum. Das Bild öffnet die Vorschau, darunter
 * stehen Download und Löschen.
 */
function fileTile(a: RawAsset, thumb: string | undefined): string {
  const video = VIDEO_FILE.test(a.filename)
  const glyph = video
    ? `<span class="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur-sm transition group-hover:scale-110">
         <svg viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-5 w-5" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>
       </span>`
    : svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-4 4 3 3-2 4 3"/>', 'h-10 w-10 text-white/60', '1.5')
  const ext = extOf(a.filename)
  return `
          <article data-file class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-lg">
            <button type="button" data-open-file="${esc(a.id)}" title="Ansehen"
                    class="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-[#0b0a07] via-[#2a2110] to-[#4a3810] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
              ${
                thumb
                  ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onerror="this.remove()">`
                  : ''
              }
              <span class="absolute inset-0 grid place-items-center">${glyph}</span>
              ${ext ? `<span class="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">${esc(ext)}</span>` : ''}
            </button>
            <div class="flex min-w-0 flex-1 flex-col px-3.5 py-3">
              <p class="truncate text-sm font-semibold" data-name title="${esc(a.filename)}">${esc(a.filename)}</p>
              <p class="mt-0.5 text-xs text-slate-500">${esc(formatBytes(a.bytes))} · ${dateDE(a.createdAt)}</p>
              <div class="-mx-1.5 mt-auto flex flex-wrap items-center gap-0.5 pt-2">
                <button type="button" data-download-file="${esc(a.id)}" class="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Download</button>
                <button type="button" data-del-file="${esc(a.id)}" class="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Löschen</button>
              </div>
            </div>
          </article>`
}

/* ------------------------------------------- Veröffentlichung der Kampagne

   Ein fertiger Clip geht ohne weiteren Klick auf die verbundenen Accounts —
   das ist der Sinn der ganzen Anbindung. Ohne Account bleibt er dagegen
   still liegen. Deshalb steht beides auf der Kampagnenseite und nicht in
   einem Einstellungsmenü: welche Accounts dranhängen, und der Weg, weitere
   zu verbinden. */

/** Plattformlogo als Bild — die Dateien liegen unter /img/platforms/<plattform>.svg. */
const platformLogo = (platform: string, cls = 'h-5 w-5') =>
  `<img src="/img/platforms/${esc(platform)}.svg" alt="" width="20" height="20" loading="lazy" class="${cls} shrink-0">`

/** Nur Plattformen, für die es ein Logo gibt — der Name kommt aus der Datenbank. */
const LOGO_PLATFORMS = new Set<string>([...CONNECTABLE, 'twitch', 'snapchat'])

function accountRows(accounts: PublishingView['accounts'], removable: boolean): string {
  return accounts
    .map((a) => {
      const handle = a.username ? `@${a.username.replace(/^@+/, '')}` : a.displayName || '–'
      return `
            <li class="flex items-center gap-3 py-3">
              ${LOGO_PLATFORMS.has(a.platform) ? platformLogo(a.platform, 'h-6 w-6') : ''}
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-bold">${esc(handle)}</span>
                <span class="block truncate text-xs text-slate-500">${esc(platformLabel(a.platform))}</span>
              </span>
              ${
                removable
                  ? `<button type="button" data-disconnect-account="${esc(a.id)}"
                             data-label="${esc(`${platformLabel(a.platform)} ${handle}`)}"
                             class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Trennen</button>`
                  : ''
              }
            </li>`
    })
    .join('')
}

/**
 * Social-Accounts und Verbreitung auf der Kampagnenseite — nebeneinander,
 * wo Platz ist.
 *
 * Kunden verbinden ihre Accounts hier selbst — je Plattform beliebig oft,
 * jeder Account braucht seine eigene Zustimmung. Ein Creator sieht in seiner
 * eigenen Kampagne nur, welche seiner Accounts den Clip bekommen; verbunden
 * werden sie einmal für alle Kampagnen unter „Meine Accounts“.
 */
function publishingBlock(area: CustomerArea, p: PublishingView): string {
  const t = area.text

  const flash = p.flash?.ok
    ? `<div class="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">${esc(p.flash.ok)}</div>`
    : p.flash?.error
      ? `<div class="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 ring-1 ring-inset ring-red-200">${esc(p.flash.error)}</div>`
      : ''

  const accounts =
    area.accounts === 'project'
      ? `
      <section id="social" class="min-w-0 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-display text-lg font-bold">Social-Accounts</h3>
            <p class="mt-1 text-sm text-slate-500">Fertige Clips gehen automatisch auf diese Accounts, sobald ein Clipper einen Clip abliefert, ohne weiteren Klick von dir.</p>
          </div>
          ${
            /* Auch ohne verbundenen Account: genau dann fehlt einer womöglich,
               weil die Rückkehr aus dem Verbinden nicht ankam (Fenster zu früh
               geschlossen, Rückkehr gedrosselt). Der Abgleich holt ihn. */
            p.ready
              ? `<button type="button" data-sync-accounts title="Stand der verbundenen Accounts neu laden"
                         class="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:border-brand hover:text-brand">Aktualisieren</button>`
              : ''
          }
        </div>
        ${flash}
        ${
          p.accounts.length
            ? `<ul class="mt-3 divide-y divide-slate-100">${accountRows(p.accounts, true)}</ul>`
            : `<p class="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                 Noch kein Account verbunden. Fertige Clips findest du trotzdem unter <strong>Fertige Videos</strong>: gepostet wird erst, wenn hier ein Account hängt.
               </p>`
        }
        ${
          p.ready
            ? `<div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                 ${CONNECTABLE.map(
                   (pl) => `
                 <button type="button" data-connect-platform="${esc(pl)}"
                         class="flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left text-sm font-semibold transition hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60">
                   ${platformLogo(pl)}
                   <span data-connect-label>${esc(platformLabel(pl))} verbinden</span>
                 </button>`,
                 ).join('')}
               </div>
               <p class="mt-3 text-xs leading-relaxed text-slate-400">
                 <strong class="font-semibold text-slate-500">Mehrere Accounts derselben Plattform?</strong>
                 Einfach noch einmal auf „verbinden“ klicken. Instagram verbindet immer den Account, mit dem du gerade angemeldet bist,
                 melde dich dort vorher ab oder nutze ein privates Browserfenster. Bei Facebook und LinkedIn wählst du die Seite im nächsten Schritt aus.
               </p>`
            : `<p class="mt-4 text-sm text-slate-500">Das Verbinden ist gerade nicht verfügbar. Bitte versuch es später noch einmal.</p>`
        }
      </section>`
      : `
      <section id="social" class="min-w-0 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-display text-lg font-bold">Deine Accounts</h3>
            <p class="mt-1 text-sm text-slate-500">Fertige Clips gehen automatisch auf deine verbundenen Accounts.</p>
          </div>
          ${
            p.accounts.length
              ? `<a href="/kampagnen/accounts" class="shrink-0 text-sm font-semibold text-brand hover:text-brand-2">Accounts verwalten →</a>`
              : ''
          }
        </div>
        ${
          p.accounts.length
            ? `<ul class="mt-3 divide-y divide-slate-100">${accountRows(p.accounts, false)}</ul>`
            : `<div class="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                 Du hast noch keinen Account verbunden, fertige Clips dieser Kampagne gehen dann nirgendwohin.
                 Verbinde deine Kanäle einmal, sie gelten für alle deine Kampagnen.
               </div>
               <a href="/kampagnen/accounts" class="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-2">Accounts verbinden</a>`
        }
      </section>`

  /*
   * Verbreitung über Creator — Standard aus: ohne ausdrückliche Zustimmung
   * landet kein Clip auf fremden Kanälen. Die Creator ordnet NIKKI MEDIA zu.
   * Ihre Zahl steht auch bei ausgeschaltetem Schalter da; wer zugeordnet
   * ist, bleibt es und postet ab dem Wiedereinschalten weiter.
   */
  const n = p.creators
  const joined = n
    ? `${n} Creator ${n === 1 ? 'ist' : 'sind'} zugeordnet.`
    : 'Noch kein Creator zugeordnet. NIKKI MEDIA wählt sie für dich aus.'
  const distribution = `
      <section class="min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label class="flex cursor-pointer items-start justify-between gap-4">
          <span class="min-w-0">
            <span class="block font-display text-lg font-bold">${esc(t.distributionLabel)}</span>
            <span class="mt-1 block text-sm text-slate-500">${esc(t.distributionText)}</span>
            <span class="mt-3 inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">${esc(joined)}</span>${
              n && !p.distribution
                ? `<span class="mt-2 block text-xs text-slate-500">Solange der Schalter aus ist, posten sie nichts.</span>`
                : ''
            }
          </span>
          <input type="checkbox" id="distribution-toggle" class="peer sr-only" ${p.distribution ? 'checked' : ''}>
          <span aria-hidden="true"
                class="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:after:translate-x-5"></span>
        </label>
        <p id="distribution-error" class="mt-2 hidden text-sm font-medium text-red-600"></p>
      </section>`

  return `
      ${sectionHead('Veröffentlichung')}
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">${accounts}${distribution}</div>`
}

/**
 * Reichweite im Kopf der Kampagne: eine schmale Zeile über alle Posts,
 * darunter klein der Anteil über Creator, wenn es ihn gibt.
 *
 * Nur Summen, keine Zeilen je Clip — auch für Kunden nicht: die stehen unter
 * „Fertige Videos“ neben dem Clip, zu dem sie gehören. Ein Creator sieht in
 * seiner eigenen Kampagne ohnehin nur die Summen (er sieht deren fertige
 * Clips nicht), `metricsDetail` ist für ihn leer.
 */
function reachBlock(area: CustomerArea, m: NonNullable<FilesView['metrics']>): string {
  const t = area.text
  const via = m.totals && m.totals.viaCreators.posts > 0 ? m.totals.viaCreators : undefined
  const paused = metricsPausedNote(m.pausedUntil, 'de')
  const num = (n: number) =>
    `<b class="font-semibold tabular-nums text-slate-700" title="${esc(n.toLocaleString('de-DE'))}">${esc(formatCompact(n, 'de'))}</b>`
  /* Der Anteil über Creator als EINE Zeile — eine zweite volle Leiste wäre
     im Kopf zu viel. */
  const viaLine = via
    ? `<p class="mt-2 border-t border-slate-200/70 pt-2 text-xs text-slate-500">${esc(t.metricsViaCreators)}: ${num(via.views)} Views · ${num(
        via.likes,
      )} Likes · ${num(via.comments)} Kommentare · ${num(via.shares)} Shares</p>`
    : ''
  return `
          <div class="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Reichweite
              <span class="cursor-help text-slate-400" title="${esc(t.metricsIntro)}" aria-label="${esc(t.metricsIntro)}">${svg(
                '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
                'h-3.5 w-3.5',
                '2',
              )}</span>
            </p>
            ${metricStrip(m.totals, 'de', { size: 'md' })}
            ${viaLine}
            ${paused ? `<div class="mt-2">${paused}</div>` : ''}
            ${t.metricsDetail ? `<p class="mt-1.5 text-xs text-slate-400">${t.metricsDetail}</p>` : ''}
          </div>`
}

export function filesPage(v: FilesView & { area?: CustomerArea }): string {
  const area = v.area ?? CUSTOMER_AREA
  const t = area.text
  const here = v.folder ? area.folderHref(v.folder.id) : area.projectHref(v.project.id)
  const root = !v.folder
  // „Kampagne pushen“ auf der Kampagnenseite (lib/upsell.ts); upsell.js blendet es aus, wo es nichts anzubieten gibt.
  const role = v.user.role
  const pushHere = root && (role === 'customer' || role === 'agency' || role === 'creator')

  const crumbs =
    `<a href="${esc(area.home)}" class="hover:text-brand">${t.listTitle}</a>` +
    ` <span class="text-slate-300">/</span> ` +
    (v.folder
      ? `<a href="${esc(area.projectHref(v.project.id))}" class="hover:text-brand">${esc(v.project.name)}</a>`
      : `<span class="font-semibold text-slate-700">${esc(v.project.name)}</span>`) +
    v.breadcrumb
      .map(
        (f, i) =>
          ` <span class="text-slate-300">/</span> ` +
          (i === v.breadcrumb.length - 1
            ? `<span class="font-semibold text-slate-700">${esc(f.name)}</span>`
            : `<a href="${esc(area.folderHref(f.id))}" class="hover:text-brand">${esc(f.name)}</a>`),
      )
      .join('')

  const newFolderButton = `
            <button type="button" id="new-folder" class="${BTN_PRIMARY}">
              ${svg(NEW_FOLDER)}
              Neuer Ordner
            </button>`
  const addLinkButton = `
            <button type="button" data-open-link class="${BTN_GHOST}">
              ${linkIcon('h-4 w-4')}
              Cloud-Link hinzufügen
            </button>`

  /* Eine frische Kampagne ohne Material bekommt die Reichweite noch nicht —
     eine leere Zahlenzeile über der Frage nach dem Rohmaterial lenkte nur
     ab, und Clips kann es dort noch keine geben. */
  const fresh = root && !v.folders.length && !v.links.length
  const reach = root && v.metrics && (v.metrics.totals || !fresh) ? reachBlock(area, v.metrics) : ''

  /* ------------------------------------------------------------- Kopf */
  let header: string
  if (root) {
    const s = v.stats ?? {
      folders: v.folders.length,
      files: v.folders.reduce((n, f) => n + f.fileCount, 0),
      bytes: v.folders.reduce((n, f) => n + f.bytes, 0),
    }
    const kpis: Kpi[] = [
      kpi(s.folders, 'Ordner', 'Ordner'),
      kpi(s.files, 'Datei', 'Dateien'),
      { value: formatBytes(s.bytes), label: 'Speicher' },
      kpi(v.links.length, 'Cloud-Link', 'Cloud-Links'),
    ]
    if (area.videosHref && s.clips !== undefined) kpis.push(kpi(s.clips, 'Fertiges Video', 'Fertige Videos'))
    const hasCustom = Boolean(v.project.thumbKey)
    // Agentur-Kampagnen tragen ihr Briefing (Views, Budget, Auftrag).
    const briefing = projectBriefing(v.project)
    header = `
      <a href="${esc(area.home)}" class="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-brand">${svg(BACK)}${t.backToList}</a>
      <section class="mb-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div class="grid gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-7">
          <div class="min-w-0">
            <div class="group overflow-hidden rounded-2xl ring-1 ring-slate-200">${campaignThumb(v.thumb, v.project.name)}</div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
              ${thumbUploadButtons(`/api/app/projects/${encodeURIComponent(v.project.id)}/thumb`, { lang: 'de', hasCustom })}
              <span class="text-[11px] text-slate-400">${
                hasCustom ? 'Eigenes Thumbnail: gilt fest für diese Kampagne.' : 'Automatisch aus deinem Material.'
              }</span>
            </div>
          </div>
          <div class="flex min-w-0 flex-col px-1 pb-1 lg:py-2 lg:pr-3">
            <nav class="truncate text-xs text-slate-400">${crumbs}</nav>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 class="min-w-0 break-words font-display text-2xl font-extrabold tracking-tight sm:text-4xl">${esc(v.project.name)}</h1>
              ${area === CREATOR_CAMPAIGN_AREA ? originBadge('own') : ''}
              ${statusBadge(v.project.status)}
            </div>
            <p class="mt-1 text-sm text-slate-500">${area === CREATOR_CAMPAIGN_AREA ? 'Von dir angelegt am' : 'Angelegt am'} ${dateDE(v.project.createdAt)}</p>
            ${briefing ? `<div class="mt-4 self-start">${briefingStrip(briefing)}</div>` : ''}
            ${kpiBar(kpis, 'mt-4 self-start')}
            ${reach}
            <div class="mt-5 flex flex-wrap gap-2 lg:mt-auto lg:pt-5">
              ${newFolderButton}
              ${addLinkButton}
            </div>
          </div>
        </div>
      </section>`
  } else {
    const bytes = v.assets.reduce((n, a) => n + a.bytes, 0)
    const kpis: Kpi[] = [kpi(v.assets.length, 'Datei', 'Dateien'), { value: formatBytes(bytes), label: 'Speicher' }]
    if (v.folders.length) kpis.push(kpi(v.folders.length, 'Unterordner', 'Unterordner'))
    const parent = v.breadcrumb.length > 1 ? v.breadcrumb[v.breadcrumb.length - 2] : null
    header = `
      <a href="${esc(parent ? area.folderHref(parent.id) : area.projectHref(v.project.id))}" class="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-brand">${svg(BACK)}${esc(
        parent ? parent.name : v.project.name,
      )}</a>
      <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <nav class="text-xs text-slate-400">${crumbs}</nav>
          <h1 class="mt-1.5 break-words font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(v.folder!.name)}</h1>
          <div class="mt-3 flex">${kpiBar(kpis)}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          ${newFolderButton}
        </div>
      </header>`
  }

  /* ------------------------------------------------ Ordner und Links */
  const folderGrid = (tiles: string) => `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">${tiles}</div>`

  const foldersSection = (withAddTile: boolean) => `
      ${sectionHead('Ordner', v.folders.length ? `<span class="text-xs font-semibold text-slate-400">${esc(count(v.folders.length, 'Ordner', 'Ordner'))}</span>` : '')}
      ${
        root
          ? `<p class="-mt-1 mb-4 text-sm text-slate-500">${
              v.folders.length
                ? t.openFolderHint
                : 'Du möchtest Dateien lieber direkt hochladen? Lege mit <strong>Neuer Ordner</strong> einen Ordner an: darin lädst du sie hoch.'
            }</p>`
          : ''
      }
      ${folderGrid(
        v.folders.map((f) => folderTile(area, f)).join('') +
          (withAddTile
            ? addTile('data-new-folder', svg(NEW_FOLDER, 'h-6 w-6', '1.6'), 'Neuer Ordner', 'Zum Beispiel nach Monat oder Drehtag', 'aspect-[4/3]')
            : ''),
      )}`

  const linksSection = `
      ${sectionHead('Cloud-Links', v.links.length ? `<span class="text-xs font-semibold text-slate-400">${esc(count(v.links.length, 'Link', 'Links'))}</span>` : '')}
      <p class="-mt-1 mb-4 text-sm text-slate-500">${t.linksIntro}</p>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        ${v.links.map(linkCard).join('')}
        ${addTile('data-open-link', linkIcon('h-6 w-6'), 'Cloud-Link hinzufügen', 'Google Drive, Dropbox, iCloud, WeTransfer …', 'aspect-video')}
      </div>`

  /* Eine frische Kampagne ohne Ordner und ohne Links: Statt einer leeren
     Fläche stehen beide Wege nebeneinander — hochladen oder verlinken. */
  const startChoice = `
      <div class="mb-5 mt-10 text-center">
        <h2 class="font-display text-xl font-extrabold tracking-tight">${t.materialQuestion}</h2>
        <p class="mt-1.5 text-[15px] text-slate-500">Lade es hier hoch oder füge einen Link zu deiner Cloud ein, beides geht, auch zusammen.</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <button type="button" id="empty-new-folder"
                class="group block w-full rounded-3xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-brand hover:bg-blue-50/40">
          <span class="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white transition group-hover:bg-brand-2">
            ${svg(UPLOAD, 'h-8 w-8', '2')}
          </span>
          <span class="mt-5 block font-display text-xl font-extrabold tracking-tight">Videos hochladen</span>
          <span class="mx-auto mt-3 block max-w-sm text-[15px] leading-relaxed text-slate-500">
            Lege einen Ordner an, zum Beispiel nach Monat oder Drehtag, und lade dein Rohmaterial darin hoch.
          </span>
        </button>
        <button type="button" data-open-link
                class="group block w-full rounded-3xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-brand hover:bg-blue-50/40">
          <span class="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white transition group-hover:bg-brand-2">
            ${linkIcon('h-8 w-8')}
          </span>
          <span class="mt-5 block font-display text-xl font-extrabold tracking-tight">Cloud-Link einfügen</span>
          <span class="mx-auto mt-3 block max-w-sm text-[15px] leading-relaxed text-slate-500">
            ${t.linkChoiceText}
          </span>
        </button>
      </div>`

  let material: string
  if (root) {
    /* Was es schon gibt, steht oben: Liegt das Material nur als Link vor,
       kommen die Links zuerst, sonst die Ordner. */
    material = fresh
      ? startChoice
      : v.folders.length
        ? foldersSection(true) + linksSection
        : linksSection + foldersSection(true)
  } else {
    material = `
      <div id="dropzone" class="dropzone cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-brand">
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-brand">${svg(UPLOAD, 'h-7 w-7', '1.6')}</span>
        <p class="mt-3 font-display text-lg font-bold">Videos hierher ziehen oder auswählen</p>
        <p class="mt-1 text-sm text-slate-500">mp4, mov, avi, mkv, webm, jpg, png, auch mehrere auf einmal</p>
        <input type="file" id="filepicker" multiple accept=".mp4,.mov,.avi,.mkv,.webm,.jpg,.jpeg,.png" class="hidden">
      </div>
      <ul id="queue" class="mt-3 space-y-2"></ul>
      ${v.folders.length ? foldersSection(false) : ''}
      ${sectionHead('Dateien', v.assets.length ? `<span class="text-xs font-semibold text-slate-400">${esc(count(v.assets.length, 'Datei', 'Dateien'))}</span>` : '')}
      ${
        v.assets.length
          ? `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">${v.assets
              .map((a) => fileTile(a, v.assetThumbs?.[a.id]))
              .join('')}</div>`
          : `<p class="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-8 text-center text-sm text-slate-500">Dieser Ordner ist noch leer.</p>`
      }`
  }

  const publishingSections = v.publishing ? `<div class="mt-12">${publishingBlock(area, v.publishing)}</div>` : ''

  const linkModal = `
      <!-- Modal: Cloud-Link hinzufügen -->
      <div id="link-modal" data-modal class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h2 class="font-display text-lg font-bold">Cloud-Link hinzufügen</h2>
          <p class="mt-1 text-sm text-slate-500">Füge den Link zu dem Ordner ein, in dem dein Rohmaterial liegt.</p>
          <input id="link-url" type="url" inputmode="url" maxlength="2000" autocomplete="off" spellcheck="false"
                 placeholder="https://drive.google.com/…"
                 class="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          <p class="mt-1.5 text-xs text-slate-400">${t.linkShareHint}</p>
          <p id="link-error" class="mt-2 hidden text-sm font-medium text-red-600"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-modal class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Abbrechen</button>
            <button type="button" id="link-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-wait disabled:opacity-60">Hinzufügen</button>
          </div>
        </div>
      </div>`

  const trashCount = v.trash.folders.length + v.trash.assets.length
  const trashList = trashCount
    ? `<details class="group/trash mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span class="inline-flex items-center gap-2 font-display text-base font-bold">
            ${svg(TRASH, 'h-4 w-4 text-slate-400')}
            Papierkorb
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">${trashCount}</span>
          </span>
          <span class="text-sm text-slate-500">Gelöschtes bleibt 30 Tage erhalten und lässt sich zurückholen.</span>
          <span class="ml-auto text-xs font-semibold text-brand group-open/trash:hidden">Anzeigen</span>
          <span class="ml-auto hidden text-xs font-semibold text-brand group-open/trash:inline">Ausblenden</span>
        </summary>
        <ul class="divide-y divide-slate-100 border-t border-slate-100 px-5 text-sm">
          ${v.trash.folders
            .map(
              (f) => `<li class="flex items-center justify-between gap-3 py-2.5">
                <span class="min-w-0 truncate"><span class="mr-2 text-slate-400">Ordner</span>${esc(f.name)}</span>
                <button type="button" data-restore-folder="${esc(f.id)}" class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-blue-50">Wiederherstellen</button>
              </li>`,
            )
            .join('')}
          ${v.trash.assets
            .map(
              (a) => `<li class="flex items-center justify-between gap-3 py-2.5">
                <span class="min-w-0 truncate"><span class="mr-2 text-slate-400">Datei</span>${esc(a.filename)}</span>
                <button type="button" data-restore-file="${esc(a.id)}" class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-blue-50">Wiederherstellen</button>
              </li>`,
            )
            .join('')}
        </ul>
      </details>`
    : ''

  const body = `
      ${header}
      ${pushHere ? upsellSection(role as PushArea, v.project.id) : ''}

      ${material}

      ${publishingSections}

      ${trashList}

      <!-- Modal: Neuer Ordner -->
      <div id="folder-modal" data-modal class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 class="font-display text-lg font-bold">Neuer Ordner</h2>
          <p class="mt-1 text-sm text-slate-500">Gib dem Ordner einen Namen, den du wiedererkennst.</p>
          <input id="folder-name" type="text" maxlength="80" placeholder="z. B. Rohmaterial Januar"
                 class="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
          <p class="mt-1.5 text-xs text-slate-400">${t.folderBelongsTo(esc(v.project.name))}</p>
          <p id="folder-error" class="mt-2 hidden text-sm font-medium text-red-600"></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-close-modal class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-400">Abbrechen</button>
            <button type="button" id="folder-save" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">Anlegen</button>
          </div>
        </div>
      </div>

      ${v.folder ? '' : linkModal}

      <!-- Modal: Vorschau -->
      <div id="preview-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/80 p-4" data-close-preview>
        <div class="w-full max-w-3xl">
          <div id="preview-slot" class="overflow-hidden rounded-2xl bg-black"></div>
          <button type="button" data-close-preview class="mx-auto mt-4 block rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">Schließen</button>
        </div>
      </div>

      <script src="/assets/poster.js"></script>
      <script src="/assets/upload.js" defer></script>`

  return shell({
    title: v.folder ? v.folder.name : v.project.name,
    user: v.user,
    nav: area.nav,
    active: area.active,
    body,
    script: filesScript(v.folder?.id ?? null, v.project.id, here),
    push: pushHere,
  })
}

const filesScript = (folderId: string | null, projectId: string, here: string) => `
(function () {
  var FOLDER_ID = ${jsonScript(folderId)};
  var PROJECT_ID = ${jsonScript(projectId)};
  var uploadedSinceEntry = 0;

  function api(method, url, payload) {
    return fetch(url, {
      method: method,
      headers: payload ? { 'content-type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
        return data;
      });
    });
  }

  /* ---- Modals ----
     Jedes Modal schließt über seinen eigenen Abbrechen-Knopf, einen Klick
     daneben oder Escape. */
  function showModal(m) { m.classList.remove('hidden'); m.classList.add('flex'); }
  function hideModal(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  document.querySelectorAll('[data-modal]').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) hideModal(m); });
    m.querySelectorAll('[data-close-modal]').forEach(function (b) {
      b.addEventListener('click', function () { hideModal(m); });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('[data-modal]').forEach(function (m) { hideModal(m); });
  });

  /* ---- Neuer Ordner ---- */
  var folderModal = document.getElementById('folder-modal');
  var nameInput = document.getElementById('folder-name');
  var folderError = document.getElementById('folder-error');

  function openFolderModal() {
    showModal(folderModal);
    folderError.classList.add('hidden'); nameInput.value = ''; nameInput.focus();
  }

  document.getElementById('new-folder').addEventListener('click', openFolderModal);
  var emptyNewFolder = document.getElementById('empty-new-folder');
  if (emptyNewFolder) emptyNewFolder.addEventListener('click', openFolderModal);
  // Die gestrichelte Kachel am Ende der Ordner.
  document.querySelectorAll('[data-new-folder]').forEach(function (el) { el.addEventListener('click', openFolderModal); });

  document.getElementById('folder-save').addEventListener('click', function () {
    var name = nameInput.value.trim();
    if (!name) { folderError.textContent = 'Bitte gib einen Namen ein.'; folderError.classList.remove('hidden'); return; }
    // Die Kampagne steht fest — wir sind in ihrer Ansicht. Unterordner erben
    // sie ohnehin über den Elternordner.
    api('POST', '/api/app/folders', { name: name, parentId: FOLDER_ID, projectId: PROJECT_ID })
      .then(function () { window.location.reload(); })
      .catch(function (err) { folderError.textContent = err.message; folderError.classList.remove('hidden'); });
  });
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('folder-save').click(); });

  /* ---- Cloud-Links (nur auf der Kampagnenseite) ---- */
  var linkModal = document.getElementById('link-modal');
  if (linkModal) setupLinks();

  function setupLinks() {
    var input = document.getElementById('link-url');
    var error = document.getElementById('link-error');
    var save = document.getElementById('link-save');

    function fail(message) { error.textContent = message; error.classList.remove('hidden'); }

    document.querySelectorAll('[data-open-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        error.classList.add('hidden'); input.value = '';
        showModal(linkModal); input.focus();
      });
    });

    save.addEventListener('click', function () {
      if (save.disabled) return;
      var url = input.value.trim();
      if (!url) { fail('Bitte füge einen Link ein.'); return; }
      // Ein Link ohne Protokoll („drive.google.com/…“) ist mit https gemeint;
      // geprüft wird ohnehin auf dem Server.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;

      // Doppeltipp-Schutz: bis zur Antwort bleibt der Knopf gesperrt.
      save.disabled = true; save.textContent = 'Wird hinzugefügt …';
      error.classList.add('hidden');
      api('POST', '/api/app/projects/' + PROJECT_ID + '/links', { url: url })
        .then(function () { window.location.reload(); })
        .catch(function (err) {
          fail(err.message);
          save.disabled = false; save.textContent = 'Hinzufügen';
        });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); save.click(); }
    });
  }

  /* ---- Löschen / Wiederherstellen ---- */
  function bind(selector, run) {
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        // Knöpfe auf einer Kachel liegen neben deren Link — nichts davon öffnet sie.
        e.preventDefault();
        run(btn.getAttribute(selector.replace(/[\\[\\]]/g, '')))
          .then(function () { window.location.reload(); })
          // Ein abgebrochener Dialog lehnt mit leerer Meldung ab — kein Alert.
          .catch(function (err) { if (err.message) window.alert(err.message); });
      });
    });
  }
  bind('[data-del-folder]', function (id) {
    if (!window.confirm('Ordner in den Papierkorb legen? Du kannst ihn 30 Tage lang zurückholen.')) return Promise.reject(new Error(''));
    return api('DELETE', '/api/app/folders/' + id);
  });
  bind('[data-restore-folder]', function (id) { return api('POST', '/api/app/folders/' + id + '/restore'); });
  bind('[data-del-file]', function (id) {
    if (!window.confirm('Datei in den Papierkorb legen?')) return Promise.reject(new Error(''));
    return api('DELETE', '/api/app/assets/' + id);
  });
  bind('[data-restore-file]', function (id) { return api('POST', '/api/app/assets/' + id + '/restore'); });
  bind('[data-del-link]', function (id) {
    if (!window.confirm('Diesen Link entfernen?')) return Promise.reject(new Error(''));
    return api('DELETE', '/api/app/links/' + id);
  });

  /* ---- Social-Accounts und Verbreitung (nur auf der Kampagnenseite) ---- */

  /* Zurück aus dem Verbinden: Die Rückmeldung steht schon auf der Seite.
     Die angehängten Parameter verschwinden aus der Adresse — sonst würde
     jedes Neuladen (auch das nach „Trennen“) die Rückkehr ein zweites Mal
     auswerten. Danach rollt die Seite zum Abschnitt mit der Meldung. */
  if (/[?&](connected|error)=/.test(window.location.search)) {
    if (window.history.replaceState) window.history.replaceState(null, '', window.location.pathname);
    var social = document.getElementById('social');
    if (social) social.scrollIntoView({ block: 'start' });
  }

  var connectButtons = document.querySelectorAll('[data-connect-platform]');
  connectButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Doppeltipp-Schutz: bis zur Weiterleitung bleiben alle Knöpfe gesperrt —
      // sonst entstehen zwei Verbindungsversuche nebeneinander.
      if (btn.disabled) return;
      connectButtons.forEach(function (b) { b.disabled = true; });
      var label = btn.querySelector('[data-connect-label]');
      var before = label.textContent;
      label.setAttribute('data-before', before);
      label.textContent = 'Wird geöffnet …';
      api('POST', '/api/app/projects/' + PROJECT_ID + '/connect/' + btn.getAttribute('data-connect-platform'))
        // Im selben Fenster: Nach der Zustimmung kommt der Kunde genau hierher
        // zurück und sieht die Rückmeldung. Ein neues Fenster nach einer
        // Netzanfrage würde der Browser ohnehin meist blockieren.
        .then(function (d) { window.location.href = d.url; })
        .catch(function (err) {
          window.alert(err.message);
          label.textContent = before;
          connectButtons.forEach(function (b) { b.disabled = false; });
        });
    });
  });

  /* Zurück-Taste beim Anbieter: der Browser holt die Seite samt gesperrter
     Knöpfe aus dem Verlauf (bfcache). Ohne das stünden alle Knöpfe grau auf
     „Wird geöffnet …“, bis jemand von Hand neu lädt. Dasselbe wie in den
     Creator-Seiten (CLIENT_JS in views/campaigns.ts). */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    connectButtons.forEach(function (b) {
      b.disabled = false;
      var l = b.querySelector('[data-connect-label]');
      if (l && l.getAttribute('data-before')) l.textContent = l.getAttribute('data-before');
    });
  });

  document.querySelectorAll('[data-disconnect-account]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('„' + btn.getAttribute('data-label') + '“ trennen? Fertige Clips gehen dann nicht mehr auf diesen Account. Du kannst ihn jederzeit wieder verbinden.')) return;
      btn.disabled = true;
      api('DELETE', '/api/app/projects/' + PROJECT_ID + '/accounts/' + encodeURIComponent(btn.getAttribute('data-disconnect-account')))
        .then(function () { window.location.reload(); })
        .catch(function (err) { window.alert(err.message); btn.disabled = false; });
    });
  });

  var syncButton = document.querySelector('[data-sync-accounts]');
  if (syncButton) syncButton.addEventListener('click', function () {
    if (syncButton.disabled) return;
    syncButton.disabled = true; syncButton.textContent = 'Lädt …';
    api('POST', '/api/app/projects/' + PROJECT_ID + '/sync-accounts')
      .then(function () { window.location.reload(); })
      .catch(function (err) { window.alert(err.message); syncButton.disabled = false; syncButton.textContent = 'Aktualisieren'; });
  });

  var distribution = document.getElementById('distribution-toggle');
  if (distribution) distribution.addEventListener('change', function () {
    var error = document.getElementById('distribution-error');
    var wanted = distribution.checked;
    distribution.disabled = true;
    error.classList.add('hidden');
    api('PATCH', '/api/app/projects/' + PROJECT_ID + '/distribution', { enabled: wanted })
      .then(function () { window.location.reload(); })
      .catch(function (err) {
        // Der Schalter springt zurück — er zeigt nie einen Stand, der nicht gespeichert ist.
        distribution.checked = !wanted;
        distribution.disabled = false;
        error.textContent = err.message; error.classList.remove('hidden');
      });
  });

  /* ---- Ansehen / Download ---- */
  var preview = document.getElementById('preview-modal');
  var slot = document.getElementById('preview-slot');
  function closePreview() { preview.classList.add('hidden'); preview.classList.remove('flex'); slot.innerHTML = ''; }
  document.querySelectorAll('[data-close-preview]').forEach(function (el) {
    el.addEventListener('click', function (e) { if (e.target === el) closePreview(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !preview.classList.contains('hidden')) closePreview(); });

  document.querySelectorAll('[data-open-file]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-open-file');
      api('GET', '/api/app/assets/' + id + '/url').then(function (d) {
        if (!d.url) throw new Error('Vorschau nicht verfügbar.');
        var tile = btn.closest('[data-file]');
        var nameEl = tile && tile.querySelector('[data-name]');
        var name = nameEl ? nameEl.textContent : '';
        slot.innerHTML = /\\.(mp4|mov|webm|mkv|avi)$/i.test(name)
          ? '<video src="' + d.url + '" controls autoplay playsinline class="max-h-[75vh] w-full"></video>'
          : '<img src="' + d.url + '" alt="" class="max-h-[75vh] w-full object-contain">';
        preview.classList.remove('hidden'); preview.classList.add('flex');
      }).catch(function (err) { window.alert(err.message); });
    });
  });

  document.querySelectorAll('[data-download-file]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      api('GET', '/api/app/assets/' + btn.getAttribute('data-download-file') + '/url?download=1')
        .then(function (d) { if (d.url) window.location.href = d.url; })
        .catch(function (err) { window.alert(err.message); });
    });
  });

  /* ---- Upload ---- */
  var zone = document.getElementById('dropzone');
  if (!zone) return;
  var picker = document.getElementById('filepicker');
  var queue = document.getElementById('queue');

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
    var rows = [];
    Array.prototype.forEach.call(files, function (file) {
      var li = document.createElement('li');
      li.className = 'rounded-xl border border-slate-200 bg-white px-4 py-3';
      li.innerHTML =
        '<div class="flex items-center justify-between gap-3 text-sm">' +
          '<span class="truncate font-medium">' + file.name.replace(/[<>&]/g, '') + '</span>' +
          '<span class="shrink-0 text-xs text-slate-500" data-state>wartet …</span>' +
        '</div>' +
        '<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><i class="block h-full w-0 rounded-full bg-brand transition-[width]" data-fill></i></div>';
      queue.appendChild(li);
      rows.push(li);
    });

    window.NMUpload.uploadAll(files, {
      init: '/api/app/uploads/init',
      part: '/api/app/uploads/part',
      complete: '/api/app/uploads/complete',
      abort: '/api/app/uploads/abort',
      thumb: '/api/app/uploads/thumb'
    }, { folderId: FOLDER_ID }, {
      onStart: function (i) { rows[i].querySelector('[data-state]').textContent = 'lädt …'; },
      onProgress: function (i, loaded, total) {
        var pct = total ? Math.round((loaded / total) * 100) : 0;
        rows[i].querySelector('[data-fill]').style.width = pct + '%';
        rows[i].querySelector('[data-state]').textContent = pct + ' %';
      },
      onDone: function (i) {
        uploadedSinceEntry++;
        rows[i].querySelector('[data-fill]').style.width = '100%';
        rows[i].querySelector('[data-state]').textContent = 'fertig';
        rows[i].querySelector('[data-state]').className = 'shrink-0 text-xs font-semibold text-emerald-600';
      },
      onError: function (i, file, err) {
        rows[i].querySelector('[data-state]').textContent = err.message;
        rows[i].querySelector('[data-state]').className = 'shrink-0 text-xs font-semibold text-red-600';
        rows[i].querySelector('[data-fill]').className = 'block h-full rounded-full bg-red-400';
      },
      onFinish: function () { window.setTimeout(function () { window.location.href = ${jsonScript(here)}; }, 900); }
    });
  }

  /* Beim Verlassen des Ordners wird das Team dieser Kampagne informiert. */
  function notifyLeave() {
    if (!uploadedSinceEntry || !FOLDER_ID) return;
    var payload = JSON.stringify({ count: uploadedSinceEntry });
    uploadedSinceEntry = 0;
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/app/folders/' + FOLDER_ID + '/notify', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/app/folders/' + FOLDER_ID + '/notify', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true
      });
    }
  }
  window.addEventListener('pagehide', notifyLeave);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') notifyLeave(); });
})();`

/* ==========================================================================
   3 — FERTIGE VIDEOS

   Die Clips als große Hochkant-Kacheln (9:16) mit Vorschaubild, darunter
   Titel, Kampagne und klein die Zahlen. Die Tabelle je Account steht nicht
   mehr in der Karte, sondern im Player daneben: Sie braucht mit fünf
   Spalten rund 500 px, die eine Kachel nie hat — und groß sollen die Videos
   sein, nicht die Zahlen.
   ========================================================================== */

export interface VideoCard {
  id: string
  filename: string
  caption: string | null
  projectName: string
  createdAt: number
  seenByCustomer: number
  /**
   * Signiert, 1 h gültig: das Vorschaubild des Clips (`thumbnail_key`). Ist
   * keins da, bleibt es leer und `previewUrl` springt ein.
   */
  posterUrl?: string
  /**
   * Signiert, 1 h gültig: der Clip selbst — nur, wenn es kein Vorschaubild
   * gibt; dann dient sein erstes Frame als Titelbild. Leer ohne Speicher.
   */
  previewUrl: string
  /** deliverables.publish_status — entscheidet, ob dort Zahlen kommen werden. */
  publishStatus: string | null
  /** Summen aus Zernio über alle Posts des Clips — fehlt ohne Zahlen. */
  metrics?: MetricTotals
  /** Eine Zeile je Account, auch die über Creator — fehlt ohne Zahlen. */
  metricRows?: MetricRow[]
}

/**
 * Stände, nach denen ein Clip draußen ist oder gleich sein wird — nur dort
 * kommen Zahlen. Ein abgewiesener, zu großer oder nie gesendeter Clip bekäme
 * sonst „Noch keine Zahlen“: ein Versprechen, das nie eingelöst wird. Zahlen,
 * die da sind, stehen immer — auch wenn nur ein Creator den Clip verbreitet hat.
 */
const NUMBERS_EXPECTED = new Set<string>([PUBLISH_STATUS.posted, PUBLISH_STATUS.partial, PUBLISH_STATUS.scheduled])

/*
 * Die Kachel ist kein einziger großer Knopf: Unter dem Clip stehen Zahlen
 * und der Knopf zur Tabelle je Account, und darin gibt es Links zu den
 * Beiträgen auf den Plattformen — ein Link in einem Knopf ist kein gültiges
 * HTML. Abgespielt wird über das Vorschaubild.
 */
export function videosPage(o: {
  user: User
  videos: VideoCard[]
  /** `metricsPausedUntil` — Hinweis über den Clips, solange der Abgleich ruht. */
  metricsPausedUntil?: number | null
}): string {
  const cards = o.videos
    .map((v) => {
      const title = v.caption || v.filename
      const numbers =
        v.metrics || (v.publishStatus && NUMBERS_EXPECTED.has(v.publishStatus))
          ? `<div class="mt-2">${metricStrip(v.metrics, 'de', { size: 'sm' })}</div>`
          : ''
      const rows = v.metricRows?.length
        ? `<template data-rows-for="${esc(v.id)}">${metricRows(v.metricRows, 'de', { markCreators: true })}</template>`
        : ''
      const picture = v.posterUrl
        ? `<img src="${esc(v.posterUrl)}" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onerror="this.remove()">`
        : v.previewUrl
          ? `<video src="${esc(v.previewUrl)}#t=0.4" preload="metadata" muted playsinline class="absolute inset-0 h-full w-full object-cover"></video>`
          : ''
      return `
          <article class="group flex min-w-0 flex-col">
            <button type="button" data-play="${esc(v.id)}" title="Ansehen"
                    class="relative block aspect-[9/16] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b0a07] via-[#2a2110] to-[#4a3810] shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
              ${picture}
              <span class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent"></span>
              <span class="absolute inset-0 grid place-items-center">
                <span class="grid h-14 w-14 place-items-center rounded-full bg-black/35 text-white ring-1 ring-white/25 backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-black/50">
                  <svg viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-6 w-6" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>
                </span>
              </span>
              ${
                v.seenByCustomer
                  ? ''
                  : `<span data-new class="absolute left-2.5 top-2.5 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white shadow">Neu</span>`
              }
              ${
                v.metrics && v.metrics.posts > 0
                  ? `<span class="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white" title="${esc(
                      `${v.metrics.views.toLocaleString('de-DE')} Views`,
                    )}">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3 w-3" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                       ${esc(formatCompact(v.metrics.views, 'de'))}
                     </span>`
                  : ''
              }
            </button>
            <div class="mt-2.5 min-w-0 px-0.5">
              <p class="line-clamp-2 font-display text-sm font-bold leading-snug" title="${esc(title)}">${esc(title)}</p>
              <p class="mt-0.5 truncate text-xs text-slate-500">${esc(v.projectName)} · ${dateDE(v.createdAt)}</p>
              ${numbers}
              ${
                rows
                  ? `<button type="button" data-play="${esc(v.id)}" class="mt-1.5 text-xs font-semibold text-brand hover:text-brand-2">Zahlen je Account →</button>`
                  : ''
              }
            </div>
            ${rows}
          </article>`
    })
    .join('')

  const pausedNote = o.videos.length ? metricsPausedNote(o.metricsPausedUntil ?? null, 'de') : ''

  const unseen = o.videos.filter((v) => !v.seenByCustomer).length
  const kpis: Kpi[] = [kpi(o.videos.length, 'Clip', 'Clips')]
  if (unseen) kpis.push({ value: unseen.toLocaleString('de-DE'), label: 'Neu' })
  const views = sumMetric(
    o.videos.map((v) => v.metrics),
    'views',
  )
  if (views !== null) {
    kpis.push({ value: formatCompact(views, 'de'), label: 'Views' })
    kpis.push({ value: formatCompact(sumMetric(o.videos.map((v) => v.metrics), 'likes') ?? 0, 'de'), label: 'Likes' })
  }

  const body =
    `
      <header class="mb-5">
        <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Fertige Videos</h1>
        <p class="mt-1.5 text-slate-500">Fertig geschnittene Clips und was sie erreicht haben. Vorschau antippen zum Ansehen und Herunterladen.</p>
      </header>` +
    (o.videos.length ? kpiBar(kpis, 'mb-6') : '') +
    (pausedNote ? `<div class="mb-5">${pausedNote}</div>` : '') +
    (o.videos.length
      ? `<div class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">${cards}</div>`
      : emptyState(
          'Noch keine fertigen Videos',
          'Sobald deine Clips geschnitten sind, tauchen sie hier auf, du bekommst zusätzlich eine E-Mail.',
        )) +
    `
      <div id="player-modal" class="fixed inset-0 z-50 hidden items-center justify-center overflow-y-auto bg-black/85 p-4" data-close-player>
        <div id="player-box" class="my-auto w-full max-w-md">
          <div class="flex flex-col gap-4 md:flex-row md:items-start">
            <div id="player-slot" class="mx-auto w-full max-w-md shrink-0 overflow-hidden rounded-2xl bg-black md:w-[22rem]"></div>
            <section id="player-numbers" class="hidden min-w-0 flex-1 rounded-2xl bg-white p-4">
              <h2 class="mb-2 font-display text-base font-bold">Zahlen je Account</h2>
              <div data-numbers-slot></div>
            </section>
          </div>
          <div class="mt-4 flex justify-center gap-3">
            <button type="button" id="player-download" class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-50">Herunterladen</button>
            <button type="button" data-close-player class="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20">Schließen</button>
          </div>
        </div>
      </div>`

  return shell({
    title: 'Fertige Videos',
    user: o.user,
    nav: CUSTOMER_NAV,
    active: '/app/videos',
    body,
    script: `
(function () {
  var modal = document.getElementById('player-modal');
  var box = document.getElementById('player-box');
  var slot = document.getElementById('player-slot');
  var numbers = document.getElementById('player-numbers');
  var numbersSlot = numbers.querySelector('[data-numbers-slot]');
  var dl = document.getElementById('player-download');
  var current = null;

  function close() {
    modal.classList.add('hidden'); modal.classList.remove('flex'); slot.innerHTML = ''; numbersSlot.innerHTML = ''; current = null;
  }
  document.querySelectorAll('[data-close-player]').forEach(function (el) {
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function message(text) {
    var p = document.createElement('p');
    p.className = 'grid aspect-[9/16] max-h-[65vh] w-full place-items-center px-6 text-center text-sm text-white/70';
    p.textContent = text;
    slot.innerHTML = ''; slot.appendChild(p);
  }

  /* Der Player öffnet sofort — mit der Tabelle je Account daneben, wenn es
     eine gibt. Das Video kommt nach, sobald seine Adresse da ist; fehlt sie,
     steht das im Player statt in einem Alert, die Zahlen bleiben lesbar. */
  document.querySelectorAll('[data-play]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-play');
      current = id;
      var tpl = document.querySelector('template[data-rows-for="' + id + '"]');
      numbersSlot.innerHTML = '';
      if (tpl) {
        numbersSlot.appendChild(tpl.content.cloneNode(true));
        numbers.classList.remove('hidden'); box.classList.add('md:max-w-4xl');
      } else {
        numbers.classList.add('hidden'); box.classList.remove('md:max-w-4xl');
      }
      message('Lädt …');
      dl.disabled = true;
      modal.classList.remove('hidden'); modal.classList.add('flex');

      fetch('/api/app/deliverables/' + id + '/url')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (current !== id) return;
          if (!d.url) throw new Error(d.error || 'Video nicht verfügbar.');
          slot.innerHTML = '<video src="' + d.url + '" controls autoplay playsinline class="max-h-[75vh] w-full"></video>';
          dl.disabled = false;
          var card = btn.closest('article');
          var badge = card && card.querySelector('[data-new]');
          if (badge) badge.remove();
        })
        .catch(function (err) { if (current === id) message(err.message); });
    });
  });

  dl.addEventListener('click', function () {
    if (!current || dl.disabled) return;
    fetch('/api/app/deliverables/' + current + '/url?download=1')
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.url) window.location.href = d.url; });
  });
})();`,
  })
}

/* ==========================================================================
   4 — EINSTELLUNGEN
   ========================================================================== */

export function settingsPage(o: { user: User; customer: Customer; limitBytes: number }): string {
  const pct = Math.min(100, Math.round((o.customer.storageBytes / o.limitBytes) * 100))
  const input =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15'
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500'

  const body = `
      <header class="mb-6">
        <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Einstellungen</h1>
        <p class="mt-1.5 text-slate-500">Deine Kontaktdaten und dein Speicherverbrauch.</p>
      </header>
      <div class="grid gap-5 lg:grid-cols-3">
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 class="font-display text-lg font-bold">Deine Daten</h2>
          <p class="mt-1 text-sm text-slate-500">So erreicht dich NIKKI MEDIA, wenn es um deine Kampagnen geht.</p>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="${label}">Firma</span>
              <input id="f-company" type="text" value="${esc(o.customer.company ?? '')}" maxlength="120" class="${input}">
            </label>
            <label class="block">
              <span class="${label}">Name</span>
              <input id="f-name" type="text" value="${esc(o.user.fullName)}" maxlength="120" class="${input}">
            </label>
            <!-- Vorwahl und Nummer getrennt — dieselbe Aufteilung wie im
                 Anfrageformular, damit die Nummer auch nach einer Änderung
                 hier anrufbar bleibt. -->
            <div class="block">
              <span class="${label}">Telefon</span>
              <div class="flex gap-2">
                <select id="f-dial" aria-label="Ländervorwahl"
                        class="w-32 shrink-0 rounded-xl border border-slate-300 bg-white px-2 py-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 sm:w-36">
                  ${dialOptions(splitPhone(o.user.phone).dial || (o.user.phone ? '' : DEFAULT_DIAL), 'de')}
                </select>
                <input id="f-phone" type="tel" value="${esc(splitPhone(o.user.phone).national)}" maxlength="40" inputmode="numeric"
                       class="${input} min-w-0">
              </div>
              <span class="mt-1 block text-xs text-slate-400">Ohne führende 0: die Vorwahl steht links.</span>
            </div>
            <label class="block">
              <span class="${label}">E-Mail (nicht änderbar)</span>
              <input type="email" value="${esc(o.user.email)}" disabled
                     class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
            </label>
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <button type="button" id="save" class="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-2">Speichern</button>
            <span id="save-msg" class="text-sm font-semibold"></span>
          </div>
        </section>

        <section class="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="font-display text-lg font-bold">Speicher</h2>
          <p class="mt-3 flex items-baseline gap-2">
            <span class="font-display text-2xl font-extrabold tabular-nums">${formatBytes(o.customer.storageBytes)}</span>
            <span class="text-sm text-slate-500">von ${formatBytes(o.limitBytes)}</span>
          </p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <i class="block h-full rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-brand'}" style="width:${pct}%"></i>
          </div>
          <p class="mt-2 text-xs text-slate-400">${pct} % belegt</p>
        </section>
      </div>`

  return shell({
    title: 'Einstellungen',
    user: o.user,
    nav: CUSTOMER_NAV,
    active: '/app/einstellungen',
    body,
    script: `
(function () {
  var msg = document.getElementById('save-msg');
  document.getElementById('save').addEventListener('click', function () {
    msg.textContent = 'Speichert …'; msg.className = 'text-sm font-semibold text-slate-500';
    fetch('/api/app/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        company: document.getElementById('f-company').value,
        fullName: document.getElementById('f-name').value,
        phoneDial: document.getElementById('f-dial').value,
        phone: document.getElementById('f-phone').value
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Speichern fehlgeschlagen.');
        msg.textContent = 'Gespeichert.'; msg.className = 'text-sm font-semibold text-emerald-600';
      })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'text-sm font-semibold text-red-600'; });
  });
})();`,
  })
}
