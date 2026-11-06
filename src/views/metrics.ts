import { esc, dateTimeDE, dateTimeEN, type Lang } from './layout'
import { platformLabel } from '../lib/publisher'
import type { MetricRow, MetricTotals } from '../lib/metrics'

/* --------------------------------------------------------------------------
   Zahlen aus Zernio — die Darstellung

   Ein Baustein für alle Bereiche: Kunde, Clipper und Creator sehen ihn auf
   Deutsch, die Administration auf Englisch (siehe `Lang` in layout.ts). Die
   Zahlen kommen aus lib/metrics.ts; hier wird nur gezeichnet.

   Solange für etwas keine Zahlen da sind, steht dort „Noch keine Zahlen“ —
   nie eine 0. Eine 0 hieße „niemand hat es gesehen“, und das stimmt in den
   ersten Stunden nach dem Posten fast nie: Zernio holt die Zahlen nur in
   Abständen von den Plattformen.
   -------------------------------------------------------------------------- */

const LOCALE: Record<Lang, string> = { de: 'de-DE', en: 'en-US' }

/** Ab hier wird gekürzt. Darunter steht die volle Zahl, sie passt noch in jede Zeile. */
const COMPACT_FROM = 10_000

const UNITS: Record<Lang, [number, string][]> = {
  de: [
    [1e9, ' Mrd.'],
    [1e6, ' Mio.'],
    [1e3, ' Tsd.'],
  ],
  en: [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ],
}

/**
 * Kompakte Zahl: 12,3 Tsd. / 1,2 Mio. (de) bzw. 12.3K / 1.2M (en).
 *
 * Von Hand statt `Intl.NumberFormat({ notation: 'compact' })`: die deutsche
 * Kurzform kürzt Tausender gar nicht ab („12.345“), und welche Endungen die
 * ICU-Daten des Workers kennen, soll nicht über die Anzeige entscheiden.
 * Abgeschnitten statt gerundet — 999.960 wird „999 Tsd.“, nicht „1.000 Tsd.“.
 */
export function formatCompact(n: number | null | undefined, lang: Lang): string {
  const value = Math.max(0, Math.round(Number(n) || 0))
  const locale = LOCALE[lang]
  if (value < COMPACT_FROM) return value.toLocaleString(locale)
  for (const [divisor, suffix] of UNITS[lang]) {
    if (value < divisor) continue
    const scaled = value / divisor
    const digits = scaled < 100 ? 1 : 0
    const cut = Math.floor(scaled * 10 ** digits) / 10 ** digits
    return cut.toLocaleString(locale, { maximumFractionDigits: digits }) + suffix
  }
  return value.toLocaleString(locale)
}

/** Volle Zahl mit Tausendertrennung — für den Tooltip hinter der Kurzform. */
const formatFull = (n: number, lang: Lang) => Math.max(0, Math.round(n)).toLocaleString(LOCALE[lang])

const TEXT = {
  de: {
    views: 'Views',
    likes: 'Likes',
    comments: 'Kommentare',
    shares: 'Shares',
    none: 'Noch keine Zahlen',
    updated: 'Stand:',
    account: 'Account',
    creator: 'Creator',
    posts: (n: number) => (n === 1 ? '1 Post' : `${formatFull(n, 'de')} Posts`),
    paused: (d: string) => `Die Zahlen werden gerade nicht aktualisiert (bis ${d}). Bisherige Werte bleiben stehen.`,
    pausedAdmin: (d: string) =>
      `Zahlen ruhen bis ${d}: Zernio meldet 402 (Tarif ohne Analytics). Bisherige Werte bleiben stehen.`,
  },
  en: {
    views: 'Views',
    likes: 'Likes',
    comments: 'Comments',
    shares: 'Shares',
    none: 'No numbers yet',
    updated: 'Updated',
    account: 'Account',
    creator: 'creator',
    posts: (n: number) => (n === 1 ? '1 post' : `${formatFull(n, 'en')} posts`),
    paused: (d: string) => `Numbers are not being updated right now (until ${d}). Existing values stay.`,
    pausedAdmin: (d: string) =>
      `Numbers paused until ${d}: Zernio returned 402 (no analytics on the plan). Existing values stay.`,
  },
}

const stamp = (unix: number | null | undefined, lang: Lang) => (lang === 'de' ? dateTimeDE(unix) : dateTimeEN(unix))

/* Kleine Glyphen, 24er-Raster wie die Navigation in layout.ts. */
const ICON_PATHS = {
  views: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  likes:
    '<path d="M12 20s-7-4.4-8.8-8.6C1.9 8.3 3.9 5 7.1 5c1.9 0 3.4 1 4.9 2.8C13.5 6 15 5 16.9 5c3.2 0 5.2 3.3 3.9 6.4C19 15.6 12 20 12 20Z"/>',
  comments: '<path d="M21 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/>',
  shares: '<path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/>',
} as const

type MetricKey = keyof typeof ICON_PATHS
const KEYS: MetricKey[] = ['views', 'likes', 'comments', 'shares']

const icon = (key: MetricKey, size: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${size} shrink-0" aria-hidden="true">${ICON_PATHS[key]}</svg>`

/** Hat diese Summe überhaupt Zahlen? Eine leere Map liefert `undefined`. */
const hasNumbers = (t: MetricTotals | undefined): t is MetricTotals => Boolean(t && t.posts > 0)

/**
 * Views · Likes · Kommentare · Shares in einer Zeile, darunter der Stand.
 *
 * `sm` für Listen und Karten (nur Glyphe und Zahl, die Bezeichnung steht im
 * Tooltip und für Screenreader), `md` für Kopfbereiche (mit Bezeichnung).
 * `label` setzt eine kleine Überschrift davor, etwa „Davon über Creator“.
 */
export function metricStrip(
  t: MetricTotals | undefined,
  lang: Lang,
  opts: { size?: 'sm' | 'md'; label?: string } = {},
): string {
  const tx = TEXT[lang]
  const size = opts.size ?? 'sm'
  const heading = opts.label
    ? `<p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">${esc(opts.label)}</p>`
    : ''

  if (!hasNumbers(t)) {
    return `<div class="metric-strip relative">${heading}<p class="text-xs text-slate-400">${esc(tx.none)}</p></div>`
  }

  const md = size === 'md'
  const items = KEYS.map((key) => {
    const value = t[key]
    const label = tx[key]
    return `<li class="inline-flex items-center gap-1.5" title="${esc(`${label}: ${formatFull(value, lang)}`)}">
          ${icon(key, md ? 'h-4 w-4 text-slate-400' : 'h-3.5 w-3.5 text-slate-400')}
          <span class="font-semibold tabular-nums text-slate-800">${esc(formatCompact(value, lang))}</span>
          ${md ? `<span class="text-slate-500">${esc(label)}</span>` : `<span class="sr-only">${esc(label)}</span>`}
        </li>`
  }).join('')

  return `<div class="metric-strip relative">${heading}
        <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 ${md ? 'text-sm' : 'text-xs'}">${items}</ul>
        <p class="mt-1 text-[11px] text-slate-400">${esc(tx.posts(t.posts))} · ${esc(tx.updated)} ${esc(stamp(t.syncedAt, lang))}</p>
      </div>`
}

/** Plattformen, für die unter /img/platforms ein Logo liegt. */
const LOGOS = new Set(['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'linkedin', 'snapchat', 'twitch'])

/**
 * Ein Link nur, wenn er sicher ist: https und sonst nichts. Die Adresse
 * kommt von der Plattform über Zernio — `javascript:` oder `http:` gehören
 * nicht in ein `href`.
 */
const safeHttps = (url: string | null): string | null => {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Account-Spalte: Logo, @name (als Link zum Beitrag, wenn es einen gibt). */
function accountCell(r: MetricRow, lang: Lang, markCreators: boolean): string {
  const logo = LOGOS.has(r.platform)
    ? `<img src="/img/platforms/${esc(r.platform)}.svg" alt="" width="16" height="16" loading="lazy" class="h-4 w-4 shrink-0">`
    : ''
  const name = r.username ? `@${r.username.replace(/^@+/, '')}` : platformLabel(r.platform)
  const href = safeHttps(r.url)
  const nameHtml = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="truncate font-medium text-slate-700 hover:text-brand hover:underline">${esc(name)}</a>`
    : `<span class="truncate font-medium text-slate-700">${esc(name)}</span>`
  const badge =
    markCreators && r.creatorId
      ? `<span class="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">${esc(TEXT[lang].creator)}</span>`
      : ''
  return `<span class="flex min-w-0 items-center gap-1.5" title="${esc(platformLabel(r.platform))}">${logo}${nameHtml}${badge}</span>`
}

/**
 * Kleine Tabelle je Account unter einem Clip.
 *
 * `markCreators` hängt an Zeilen aus der Verbreitung über Creator ein kleines
 * Abzeichen — sinnvoll, wo beide Wege nebeneinander stehen (Kunde, Admin),
 * nicht auf der Seite eines Creators, wo jede Zeile seine eigene ist.
 */
export function metricRows(
  rows: MetricRow[] | undefined,
  lang: Lang,
  /** `stamp: false`, wo direkt daneben schon ein `metricStrip` den Stand nennt. */
  opts: { markCreators?: boolean; stamp?: boolean } = {},
): string {
  const tx = TEXT[lang]
  if (!rows?.length) return `<p class="text-xs text-slate-400">${esc(tx.none)}</p>`

  const latest = rows.reduce((max, r) => (r.syncedAt > max ? r.syncedAt : max), 0)
  const num = (n: number) =>
    `<td class="px-2 py-1.5 text-right tabular-nums text-slate-700" title="${esc(formatFull(n, lang))}">${esc(formatCompact(n, lang))}</td>`
  const head = (label: string, key?: MetricKey) =>
    `<th scope="col" class="px-2 py-1.5 ${key ? 'text-right' : 'text-left'} font-semibold">${
      key ? `<span class="inline-flex items-center gap-1" title="${esc(label)}">${icon(key, 'h-3.5 w-3.5')}<span class="hidden sm:inline">${esc(label)}</span><span class="sr-only sm:hidden">${esc(label)}</span></span>` : esc(label)
    }</th>`

  // `relative`: die `sr-only`-Bezeichnungen sind absolut positioniert und
  // würden sonst aus dem Scrollbereich ausbrechen — die ganze Seite liefe
  // auf dem Handy seitlich über.
  return `<div class="relative overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-[11px] uppercase tracking-wider text-slate-500">
            <tr>${head(tx.account)}${KEYS.map((k) => head(tx[k], k)).join('')}</tr>
          </thead>
          <tbody>${rows
            .map(
              (r) => `
            <tr class="border-t border-slate-100">
              <td class="max-w-[10rem] px-2 py-1.5 sm:max-w-[14rem]">${accountCell(r, lang, Boolean(opts.markCreators))}</td>
              ${num(r.views)}${num(r.likes)}${num(r.comments)}${num(r.shares)}
            </tr>`,
            )
            .join('')}
          </tbody>
        </table>
        ${opts.stamp === false ? '' : `<p class="mt-1 px-2 text-[11px] text-slate-400">${esc(tx.updated)} ${esc(stamp(latest || null, lang))}</p>`}
      </div>`
}

/**
 * Vier Kacheln für Übersichten — derselbe Aufbau wie `statTile` in layout.ts,
 * auf dem Handy eine Stufe kleiner: zwei Kacheln nebeneinander lassen für
 * „72,2 Tsd.“ in voller Größe keinen Platz, die Zahl bräche um.
 * Ohne Zahlen stehen Striche darin und darunter „Noch keine Zahlen“.
 */
export function metricTiles(t: MetricTotals | undefined, lang: Lang): string {
  const tx = TEXT[lang]
  const filled = hasNumbers(t)
  const tiles = KEYS.map(
    (key) => `
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">${icon(key, 'h-4 w-4')}${esc(tx[key])}</p>
          <p class="mt-2 whitespace-nowrap font-display text-2xl font-extrabold tabular-nums sm:text-3xl"${
            filled ? ` title="${esc(formatFull(t[key], lang))}"` : ''
          }>${filled ? esc(formatCompact(t[key], lang)) : '–'}</p>
        </div>`,
  ).join('')
  const foot = filled ? `${tx.posts(t.posts)} · ${tx.updated} ${stamp(t.syncedAt, lang)}` : tx.none
  return `<div>
        <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">${tiles}</div>
        <p class="mt-2 text-xs text-slate-400">${esc(foot)}</p>
      </div>`
}

/**
 * Hinweis, solange der Abgleich wegen 402 ruht (`metricsPausedUntil`).
 * Leer, wenn er läuft — die Seite kann ihn also bedingungslos einsetzen.
 *
 * Ohne `admin` ein neutraler Satz: Anbieter, Statuscode und Tarif gehen
 * Kunden, Clipper und Creator nichts an. Nur die Admin-Seiten setzen `admin: true` und bekommen den Grund dazu.
 */
export function metricsPausedNote(until: number | null, lang: Lang, opts: { admin?: boolean } = {}): string {
  if (!until) return ''
  const text = opts.admin ? TEXT[lang].pausedAdmin : TEXT[lang].paused
  return `<p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">${esc(
    text(stamp(until, lang)),
  )}</p>`
}
