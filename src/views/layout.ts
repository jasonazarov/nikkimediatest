import type { Role, User } from '../db/schema'

export const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Für Werte, die in ein <script>-Tag als JSON eingebettet werden. */
export const jsonScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

/**
 * Zwei Sprachen, streng nach Rolle getrennt:
 *
 *   Administration (Jason)  Englisch
 *   Kundenbereich           Deutsch
 *   Clipper-Bereich         Deutsch
 *   Kampagnen (Creator)     Deutsch
 *   Collaboration (Agentur) Deutsch
 *
 * Seit Oktober 2026 ist nur noch die Administration englisch. Der
 * Clipper-Bereich ist — wie Landingpage und E-Mails der Clipper — auf
 * Wunsch des Auftraggebers durchgehend deutsch.
 */
export type Lang = 'de' | 'en'

export const dateDE = (unix: number | null | undefined): string => {
  if (!unix) return '–'
  return new Date(unix * 1000).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Uhrzeiten immer in der Zeit des Geschäfts. Der Worker läuft in UTC — ohne
 * Zeitzone stünde „Stand: 07:15“, wo in Wien und Berlin schon 09:15 ist.
 */
const TIME_ZONE = 'Europe/Berlin'

export const dateTimeDE = (unix: number | null | undefined): string => {
  if (!unix) return '–'
  return new Date(unix * 1000).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  })
}

export const dateEN = (unix: number | null | undefined): string => {
  if (!unix) return '–'
  return new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export const dateTimeEN = (unix: number | null | undefined): string => {
  if (!unix) return '–'
  // Mit Zonenkürzel: Clipper sitzen nicht unbedingt in Mitteleuropa.
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
    timeZoneName: 'short',
  })
}

export interface NavItem {
  href: string
  label: string
  icon: string
  /** Kleine Zeile unter der Beschriftung, z. B. „von dir angelegt“. */
  hint?: string
  /** Gesperrt: Schloss rechts neben der Beschriftung (Collaboration-Bereich der Agenturen). */
  locked?: boolean
}

const ICONS: Record<string, string> = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  film: '<path d="M4 4h16v16H4z"/><path d="M8 4v16M16 4v16M4 9h16M4 15h16"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  inbox: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7H3v-7l2-7Z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5M12 4v12"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
}

/** Kleines Schloss für gesperrte Menüpunkte und Karten. */
export const LOCK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'

const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 shrink-0">${
    ICONS[name] ?? ICONS.grid
  }</svg>`

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administration',
  customer: 'Kundenbereich',
  clipper: 'Clipping Area',
  creator: 'Kampagnen',
  agency: 'Collaboration',
}

/** Nur die Administration arbeitet auf Englisch — alle anderen auf Deutsch. */
export const langFor = (role: Role): Lang => (role === 'admin' ? 'en' : 'de')

export interface ShellOptions {
  title: string
  user: User
  nav: NavItem[]
  active: string
  body: string
  /** Zusätzliches JS am Seitenende. */
  script?: string
  /** Seite trägt selbst eine `viewsSection` (z. B. /admin/analytics) — lädt assets/views.js. */
  analytics?: boolean
}

/** Vorschläge des FAQ-Agenten je Bereich (assets/agent.js). Admin bekommt keinen Agenten. */
const AGENT_SUGGEST: Partial<Record<Role, string[]>> = {
  customer: ['Wie schnell sehe ich Ergebnisse?', 'Woher weiß ich, dass die Views echt sind?', 'Was kostet 1 Mio. Views?'],
  agency: ['Was ist ein Cooperation-Code?', 'Wie verdienen wir als Agentur daran?', 'Arbeitet ihr white label?'],
  clipper: ['Wer sind die Clipper?', 'Wie werde ich Clipper oder Creator?', 'Woher weiß ich, dass die Views echt sind?'],
  creator: ['Was bedeutet Marktplatz bei NIKKI MEDIA?', 'Woher weiß ich, dass die Views echt sind?', 'Auf welchen Plattformen wird gepostet?'],
}

/**
 * Wo das Feld „Virale Clips“ steht (assets/viral.js → GET /api/viral-clips).
 * Nur auf der Übersicht (erster Menüpunkt) und nie bei gesperrtem Zugang.
 * Clipper und Creator haben ganz oben ihre Preisstaffelung (Vorgabe) — bei
 * ihnen steht das Feld deshalb UNTER dem Seiteninhalt, sonst darüber.
 */
const viralPlacement = (o: ShellOptions): 'top' | 'bottom' | null => {
  if (!o.nav.length || o.active !== o.nav[0].href) return null
  if (o.nav.some((n) => n.locked)) return null
  return o.user.role === 'clipper' || o.user.role === 'creator' ? 'bottom' : 'top'
}

/** Platzhalter auf der Übersicht; assets/upsell.js füllt ihn über GET /api/upsell. */
export const upsellSection = (area: 'customer' | 'agency') => `
      <section class="nmu" id="mehr-reichweite" data-upsell data-area="${area}" aria-labelledby="nmu-title">
        <div class="nmu__head">
          <div>
            <h2 id="nmu-title" class="nmu__title">Mehr Reichweite für deine Kampagne</h2>
            <p class="nmu__sub">${
              area === 'agency'
                ? 'Mehr Views zu den Konditionen der Kampagne. Euer Kundenpreis enthält eure Marge aus „Preise &amp; Marge“.'
                : 'Mehr Views zu den Konditionen deiner Kampagne. Ein Klick ist eine Anfrage, Jason bestätigt sie persönlich.'
            }</p>
          </div>
        </div>
        <div class="nmu__body" data-upsell-body><p class="nmu__empty">Wird geladen …</p></div>
      </section>`


/**
 * Platzhalter der Views-Grafik; assets/views.js füllt ihn über
 * GET /api/views-analytics (lib/analytics.ts). `full` ist die große Fassung
 * auf /admin/analytics: zwölf statt sechs Kampagnen, Zeitraum „Gesamt“.
 */
export const viewsSection = (role: Role, lang: Lang, variant: 'overview' | 'full' = 'overview') => `
      <section class="nmx" id="views" data-views-analytics data-area="${role}" data-lang="${lang}" data-variant="${variant}" aria-label="Views">
        <div data-views-body><p class="nmx__empty">${lang === 'en' ? 'Loading …' : 'Wird geladen …'}</p></div>
      </section>`

const viralSection = (role: Role, lang: Lang) => `
      <section class="nmv" id="virale-clips" data-viral-clips data-area="${role}" aria-labelledby="nmv-title">
        <div class="nmv__head">
          <h2 id="nmv-title" class="nmv__title">${lang === 'en' ? 'Most viral clips' : 'Virale Clips'}</h2>
          <p class="nmv__sub">${lang === 'en' ? 'Top clips by views across all published posts.' : 'Deine Clips mit den meisten Views, aus allen veröffentlichten Posts.'}</p>
        </div>
        <div class="nmv__row" data-viral-list data-lang="${lang}"><p class="nmv__empty">${lang === 'en' ? 'Loading …' : 'Wird geladen …'}</p></div>
      </section>`

/**
 * Views-Grafik, „Virale Clips“ und „Mehr Reichweite“ stehen oben in der
 * Übersicht. Beginnt die Seite mit ihrer Überschrift (`pageTitle`), kommen
 * sie direkt darunter, sonst ganz nach oben.
 */
function withTopSections(body: string, top: string): string {
  if (!top) return body
  const head = body.match(/^\s*<header class="mb-7">[\s\S]*?<\/header>/)
  return head ? head[0] + top + body.slice(head[0].length) : top + body
}

/**
 * Gemeinsames Grundgerüst für alle Dashboards (/app, /admin, /work,
 * /kampagnen, /collaboration). Seit November 2026 Liquid Glass in
 * Grün-Schwarz, Aufbau angelehnt an Whop: schwebende Glas-Seitenleiste,
 * Kopfzeile mit Seitentitel und Sprung-Suche, darunter der Inhalt. Die Seiten selbst sind unverändert —
 * ihre hellen Tailwind-Klassen färbt /assets/dash-glass.css um (html.nmd).
 * Tailwind kommt per CDN — kein Build-Schritt, wie vorgegeben.
 */
export function shell(o: ShellOptions): string {
  const initials = o.user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()

  // Die Sprache hängt allein an der Rolle. Das lang-Attribut ist dabei mehr
  // als Deko: /assets/upload.js liest es aus und meldet den Upload-Fortschritt
  // in derselben Sprache wie die Seite drumherum.
  const lang = langFor(o.user.role)
  const logout = lang === 'en' ? 'Log out' : 'Abmelden'
  const menuLabel = lang === 'en' ? 'Menu' : 'Menü'
  const searchLabel = lang === 'en' ? 'Jump to …' : 'Springe zu …'
  const viral = viralPlacement(o)
  const suggest = AGENT_SUGGEST[o.user.role]
  // „Mehr Reichweite“ (lib/upsell.ts): auf der Übersicht von Kunde und Agentur, nie bei gesperrtem Zugang.
  const upsell: 'customer' | 'agency' | null =
    viral && (o.user.role === 'customer' || o.user.role === 'agency') ? o.user.role : null

  const navLinks = o.nav
    .map((item) => {
      const on = item.href === o.active
      return `<a href="${item.href}" class="nmd-nav${on ? ' is-on' : ''}"${on ? ' aria-current="page"' : ''}${
        item.locked ? ' data-locked' : ''
      } data-nav-label="${esc(item.label)}">${icon(item.icon)}${
        item.hint
          ? `<span class="nmd-nav__txt"><span>${esc(item.label)}</span><small>${esc(item.hint)}</small></span>`
          : `<span class="nmd-nav__txt"><span>${esc(item.label)}</span></span>`
      }${item.locked ? `<span class="nmd-nav__lock" title="Gesperrt">${LOCK_SVG}</span>` : ''}</a>`
    })
    .join('\n        ')

  return `<!DOCTYPE html>
<html lang="${lang}" class="h-full nmd">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)} | Nikki Media</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23000'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='14' font-weight='bold' fill='%232fe08c' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: { extend: {
      fontFamily: { sans: ['Geist','Inter','system-ui','sans-serif'], display: ['"Bricolage Grotesque"','Geist','system-ui','sans-serif'] },
      colors: { ink: '#000000', panel: '#060c09', brand: { DEFAULT: '#2fe08c', 2: '#5eeaa6' } }
    } }
  }
</script>
<link rel="stylesheet" href="/assets/dash-glass.css">
<style>
  body { -webkit-font-smoothing: antialiased; }
  [x-cloak] { display: none; }
</style>
</head>
<body class="h-full font-sans nmd-body">

<div class="nmd-frame">

  <!-- Seitenleiste -->
  <aside class="nmd-side">
    <div class="nmd-side__top">
      <a href="/" class="nmd-brand">
        <span class="nmd-brand__mark" aria-hidden="true">N</span>
        <span class="nmd-brand__txt">Nikki Media<small>${esc(ROLE_LABEL[o.user.role])}</small></span>
      </a>
      <button type="button" class="nmd-burger" aria-label="${esc(menuLabel)}" aria-controls="sidenav" aria-expanded="false"
        onclick="var n=document.getElementById('sidenav');n.classList.toggle('hidden');this.setAttribute('aria-expanded',String(!n.classList.contains('hidden')))">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>

    <nav id="sidenav" class="hidden lg:block nmd-side__nav">
      <p class="nmd-group">${esc(ROLE_LABEL[o.user.role])}</p>
        ${navLinks}

      <div class="nmd-me">
        <div class="nmd-me__row">
          <span class="nmd-me__av">${esc(initials)}</span>
          <span class="min-w-0">
            <span class="nmd-me__name">${esc(o.user.fullName)}</span>
            ${o.user.role === 'clipper' ? '' : `<span class="nmd-me__mail">${esc(o.user.email)}</span>`}
          </span>
        </div>
        <form method="post" action="/logout">
          <input type="hidden" name="area" value="${o.user.role}">
          <button class="nmd-logout">${esc(logout)}</button>
        </form>
      </div>
    </nav>
  </aside>

  <!-- Inhalt -->
  <div class="nmd-main">
    <header class="nmd-top">
      <p class="nmd-crumb"><span>${esc(ROLE_LABEL[o.user.role])}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><b>${esc(o.title)}</b></p>
      <span class="nmd-top__right">
      <label class="nmd-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" placeholder="${esc(searchLabel)}" aria-label="${esc(searchLabel)}" data-nav-search autocomplete="off">
        <kbd>/</kbd>
      </label>
        <span class="nmd-me__av" aria-hidden="true">${esc(initials)}</span>
      </span>
    </header>
    <main class="nmd-content">
      <div class="mx-auto max-w-7xl">
${withTopSections(o.body, (viral === 'top' ? viewsSection(o.user.role, lang) + viralSection(o.user.role, lang) : '') + (upsell ? upsellSection(upsell) : ''))}
${viral === 'bottom' ? viewsSection(o.user.role, lang) + viralSection(o.user.role, lang) : ''}
      </div>
    </main>
  </div>
</div>

<script>
/* Sprung-Suche: filtert die Menüpunkte, Enter öffnet den ersten Treffer, „/“ setzt den Fokus. */
(function () {
  var box = document.querySelector('[data-nav-search]');
  if (!box) return;
  var links = [].slice.call(document.querySelectorAll('#sidenav [data-nav-label]'));
  var nav = document.getElementById('sidenav');
  box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    if (q && nav.classList.contains('hidden')) nav.classList.remove('hidden');
    links.forEach(function (a) { a.hidden = !!q && a.getAttribute('data-nav-label').toLowerCase().indexOf(q) < 0; });
  });
  box.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var hit = links.filter(function (a) { return !a.hidden; })[0];
    if (hit) { e.preventDefault(); location.href = hit.href; }
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === '/' && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) { e.preventDefault(); box.focus(); }
  });
})();
</script>
<script src="/assets/thumb.js" defer></script>
${viral ? '<script src="/assets/viral.js" defer></script>\n<script src="/assets/views.js" defer></script>' : ''}
${o.analytics ? '<script src="/assets/views.js" defer></script>' : ''}
${upsell ? '<script src="/assets/upsell.js" defer></script>' : ''}
${suggest ? `<script type="application/json" id="agent-config">${jsonScript({ suggest })}</script>\n<script src="/assets/agent.js" defer></script>` : ''}
${o.script ? `<script>\n${o.script}\n</script>` : ''}
</body>
</html>`
}

/* ------------------------------------------------------------- Bausteine */

export const pageTitle = (title: string, subtitle?: string) => `
      <header class="mb-7">
        <h1 class="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(title)}</h1>
        ${subtitle ? `<p class="mt-1.5 text-slate-500">${esc(subtitle)}</p>` : ''}
      </header>`

export const card = (inner: string, extra = '') =>
  `<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${extra}">${inner}</div>`

export const statTile = (label: string, value: string, hint?: string) => `
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">${esc(label)}</p>
          <p class="mt-2 font-display text-3xl font-extrabold">${esc(value)}</p>
          ${hint ? `<p class="mt-1 text-xs text-slate-400">${esc(hint)}</p>` : ''}
        </div>`

export const emptyState = (title: string, text: string, action = '') => `
        <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p class="font-display text-lg font-bold">${esc(title)}</p>
          <p class="mx-auto mt-2 max-w-md text-sm text-slate-500">${esc(text)}</p>
          ${action}
        </div>`

/**
 * Die Zeile, die Clipper und Creator statt offener Projekte sehen. Wer
 * Aufträge sucht, erfährt weder, welche Kampagnen es gibt, noch wie viele —
 * zugeordnet wird ausschließlich vom Administrator. Der Wortlaut ist vom
 * Auftraggeber vorgegeben.
 */
export const ASSIGN_HEADLINE = 'NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen.'

export const assignBanner = (extraClass = 'mb-9') => `
        <section class="${extraClass} rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm" data-assign-headline>
          <span class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          </span>
          <h2 class="mx-auto mt-4 max-w-xl font-display text-xl font-extrabold sm:text-2xl">${esc(ASSIGN_HEADLINE)}</h2>
        </section>`

export const btn = (
  label: string,
  attrs = '',
  variant: 'primary' | 'ghost' | 'danger' = 'primary',
) => {
  const styles = {
    primary: 'bg-brand text-white hover:bg-brand-2',
    ghost: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400',
    danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  }[variant]
  return `<button ${attrs} class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${styles}">${label}</button>`
}

export const linkBtn = (
  label: string,
  href: string,
  variant: 'primary' | 'ghost' = 'primary',
  attrs = '',
) => {
  const styles =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand-2'
      : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
  return `<a href="${href}" ${attrs} class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${styles}">${label}</a>`
}

export const badge = (text: string, tone: 'blue' | 'green' | 'grey' | 'amber' | 'red' = 'grey') => {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    grey: 'bg-slate-100 text-slate-600 ring-slate-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
  }[tone]
  return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones}">${esc(
    text,
  )}</span>`
}

/* Navigationen je Rolle */

export const CUSTOMER_NAV: NavItem[] = [
  { href: '/app', label: 'Meine Kampagnen', icon: 'folder' },
  { href: '/app/videos', label: 'Fertige Videos', icon: 'film' },
  { href: '/app/einstellungen', label: 'Einstellungen', icon: 'cog' },
]

/** URLs bleiben deutsch (bestehende Links, Lesezeichen) — nur die Beschriftung ist englisch. */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: 'grid' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'trend' },
  { href: '/admin/projekte', label: 'Campaigns', icon: 'film' },
  { href: '/admin/clipper', label: 'Clippers', icon: 'scissors' },
  { href: '/admin/creator', label: 'Creators', icon: 'users' },
  { href: '/admin/kunden', label: 'Customers', icon: 'users' },
  { href: '/admin/leads', label: 'Leads', icon: 'inbox' },
  // Bezeichnung vom Auftraggeber vorgegeben — bewusst deutsch.
  { href: '/admin/agenturen', label: 'Agenturen', icon: 'briefcase' },
  // Gold-Marktplatz (November 2026). „Fachartikel“ auf Wunsch deutsch wie „Agenturen“.
  { href: '/admin/fachartikel', label: 'Fachartikel', icon: 'doc' },
  { href: '/admin/upsells', label: 'Upsells', icon: 'trend' },
  { href: '/admin/passwort', label: 'Password', icon: 'cog' },
]

/**
 * Creator-Navigation — deutsch, rund um das Wort „Kampagne“. Eigene und
 * zugewiesene Kampagnen stehen ausdrücklich getrennt untereinander, jeweils
 * mit einer Zeile, woher sie kommen — Vorgabe des Auftraggebers: es muss
 * immer klar sein, ob eine Kampagne die eigene ist oder zugewiesen wurde.
 * „Meine Accounts“ zuletzt: verbunden wird einmal, danach arbeitet man in
 * den Punkten darüber.
 */
export const CREATOR_NAV: NavItem[] = [
  { href: '/kampagnen', label: 'Übersicht', icon: 'grid' },
  { href: '/kampagnen/meine', label: 'Meine Kampagnen', icon: 'folder', hint: 'von dir angelegt' },
  { href: '/kampagnen/finden', label: 'Zugewiesene Kampagnen', icon: 'inbox', hint: 'von NIKKI MEDIA zugewiesen' },
  { href: '/kampagnen/verbreiten', label: 'Verbreiten', icon: 'film' },
  { href: '/kampagnen/upload', label: 'Clips hochladen', icon: 'upload' },
  { href: '/kampagnen/accounts', label: 'Meine Accounts', icon: 'link' },
]

/** Clipper-Navigation — deutsch, wie der ganze Arbeitsbereich. */
export const WORK_NAV: NavItem[] = [
  { href: '/work', label: 'Meine Kampagnen', icon: 'folder' },
  { href: '/work/upload', label: 'Fertige Videos hochladen', icon: 'upload' },
]

/* ==========================================================================
   Bausteine der Dashboards (Admin, Clipper, Creator, Kunde)

   Linie seit Oktober 2026: Kennzahlen sind KLEIN — eine schmale Zeile oben
   oder seitlich, nie mehr große Kacheln. Groß ist, woran gearbeitet wird:
   Kampagnen, Videos, Ordner — als Karten mit Thumbnail wie bei YouTube.
   ========================================================================== */

/** „100.000“ — Views immer mit Tausenderpunkten. */
export const formatViews = (n: number): string => Math.round(n).toLocaleString('de-DE')

/** „200 €“ bzw. „200,50 €“ — Cent nur, wenn es welche gibt. */
export const formatEuro = (cents: number): string =>
  `${(cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })} €`

export interface Kpi {
  label: string
  value: string
  /** Kleiner Zusatz hinter dem Wert, z. B. „heute“. */
  hint?: string
}

/**
 * Kennzahlen als EINE schmale Zeile — Wert fett, Beschriftung klein
 * daneben, getrennt durch feine Linien. Ersetzt die großen `statTile`-Kacheln.
 */
export const kpiBar = (items: Kpi[], extra = '') => `
        <div class="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-xl border border-slate-200 bg-white/80 px-2 py-1.5 text-sm shadow-sm backdrop-blur ${extra}">
          ${items
            .map(
              (k, i) => `<span class="inline-flex items-baseline gap-1.5 px-2.5 py-1 ${i ? 'sm:border-l sm:border-slate-200' : ''}">
            <b class="font-display text-[15px] font-extrabold tabular-nums text-slate-900">${esc(k.value)}</b>
            <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${esc(k.label)}</span>${
              k.hint ? `<span class="text-[11px] text-slate-400">${esc(k.hint)}</span>` : ''
            }
          </span>`,
            )
            .join('')}
        </div>`

/** Was `campaignThumb` braucht — dieselbe Form wie `CampaignThumb` in lib/thumbs.ts. */
export type ThumbView =
  | { kind: 'image'; src: string }
  | { kind: 'cloud'; host: string; provider: { id: string; label: string; bundled: boolean } }
  | { kind: 'none' }

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '·'

/** Fläche ohne Bild: dunkler Verlauf mit den Initialen der Kampagne. */
const thumbPlaceholder = (name: string) =>
  `<div class="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#010302] via-[#072414] to-[#0f8a52]">
     <span class="font-display text-4xl font-extrabold tracking-tight text-white/90">${esc(initialsOf(name))}</span>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="absolute bottom-3 right-3 h-5 w-5 text-white/40"><path d="M4 4h16v16H4z"/><path d="M8 4v16M16 4v16M4 9h16M4 15h16"/></svg>
   </div>`

/**
 * Das Thumbnail einer Kampagne im Format 16:9.
 *
 *   image  Bild (eigenes, aus dem Rohmaterial oder aus einem Clip)
 *   cloud  Symbol des Cloud-Anbieters, groß, auf heller Fläche
 *   none   Initialen auf dunklem Verlauf
 *
 * Lädt ein Bild nicht (gelöscht, kein Zugriff), springt die Fläche mit den
 * Initialen ein.
 */
export function campaignThumb(thumb: ThumbView | undefined, name: string, extra = ''): string {
  const frame = `relative aspect-video w-full overflow-hidden bg-slate-200 ${extra}`
  if (thumb?.kind === 'image') {
    return `<div class="${frame}">
      ${thumbPlaceholder(name)}
      <img src="${esc(thumb.src)}" alt="" loading="lazy" decoding="async"
           class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
           onerror="this.remove()">
    </div>`
  }
  if (thumb?.kind === 'cloud') {
    // Bekannte Anbieter mit eigenem Symbol, groß. Bei unbekannten wäre ein
    // auf 80 px gezogenes Favicon verschwommen — dort steht die Weltkugel
    // groß und das Favicon klein daneben.
    const main = thumb.provider.bundled
      ? `<img src="/img/cloud/${esc(thumb.provider.id)}.svg" alt="" loading="lazy" decoding="async" class="h-20 w-20 object-contain drop-shadow-sm sm:h-24 sm:w-24">`
      : `<span class="relative">
          <img src="/img/cloud/web.svg" alt="" class="h-20 w-20 opacity-80 sm:h-24 sm:w-24">
          <img src="https://icons.duckduckgo.com/ip3/${esc(encodeURIComponent(thumb.host))}.ico" alt="" loading="lazy" decoding="async"
               class="absolute -bottom-1 -right-1 h-8 w-8 rounded-lg bg-white p-1 shadow" onerror="this.remove()">
        </span>`
    return `<div class="${frame} grid place-items-center bg-gradient-to-br from-white via-slate-50 to-slate-200">
      ${main}
      <span class="absolute bottom-2.5 left-3 inline-flex max-w-[85%] items-center gap-1.5 truncate rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3 w-3 shrink-0"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
        <span class="truncate">${esc(thumb.provider.bundled ? thumb.provider.label : thumb.host)}</span>
      </span>
    </div>`
  }
  return `<div class="${frame}">${thumbPlaceholder(name)}</div>`
}

/**
 * Woher eine Kampagne kommt — für Creator (und den Admin-Bereich) muss das
 * auf einen Blick feststehen:
 *   own       die eigene Kampagne des Creators (von ihm angelegt)
 *   assigned  von NIKKI MEDIA zugewiesen (gehört einem Kunden oder anderen Creator)
 */
export type CampaignOrigin = 'own' | 'assigned'

const ORIGIN_TEXT: Record<Lang, Record<CampaignOrigin, string>> = {
  de: { own: 'Eigene Kampagne', assigned: 'Zugewiesene Kampagne' },
  en: { own: "Creator's own", assigned: 'Assigned' },
}

const ORIGIN_ICON: Record<CampaignOrigin, string> = {
  own: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  assigned: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7H3v-7l2-7Z"/>',
}

/**
 * Die Herkunft als kräftige Plakette — grün für eigene, blau für
 * zugewiesene Kampagnen. Steht auf dem Thumbnail jeder Karte (`origin` in
 * `campaignCard`) und im Kopf jeder Kampagnenseite.
 */
export function originBadge(origin: CampaignOrigin, lang: Lang = 'de', extra = ''): string {
  const tone = origin === 'own' ? 'bg-emerald-600 ring-emerald-700/30' : 'bg-indigo-600 ring-indigo-700/30'
  return `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ${tone} ${extra}" data-origin="${origin}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0">${ORIGIN_ICON[origin]}</svg>${esc(
        ORIGIN_TEXT[lang][origin],
      )}</span>`
}

/** Die Herkunft als durchgehendes Farbband über dem Bild einer Karte. */
const originStrip = (origin: CampaignOrigin, lang: Lang) =>
  `<div class="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white ${
    origin === 'own' ? 'bg-emerald-600' : 'bg-indigo-600'
  }" data-origin="${origin}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0">${ORIGIN_ICON[origin]}</svg>${esc(
        ORIGIN_TEXT[lang][origin],
      )}</div>`

export interface CampaignCardOptions {
  href: string
  name: string
  thumb?: ThumbView
  /** Herkunft — erscheint als Farbband über dem Bild (grün eigene, blau zugewiesene). */
  origin?: { kind: CampaignOrigin; lang?: Lang }
  /** Kleine Zeile über dem Namen, z. B. Kunde oder Status. */
  eyebrow?: string
  /** Kleine Angaben unter dem Namen, durch „·“ getrennt (schon fertiges HTML erlaubt). */
  meta?: string[]
  /** Fertiges HTML oben rechts auf dem Bild, z. B. ein `badge`. */
  corner?: string
  /** Fertiges HTML unter der Karte, außerhalb des Links (Knöpfe, Team …). */
  footer?: string
}

/**
 * Eine Kampagne als große Karte — Thumbnail oben, Name groß darunter. Die
 * ganze Karte ist ein Link; `footer` steht außerhalb davon, damit Knöpfe
 * darin nicht zugleich die Karte öffnen.
 */
export const campaignCard = (o: CampaignCardOptions) => `
        <article class="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
          <a href="${esc(o.href)}" class="block focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
            ${o.origin ? originStrip(o.origin.kind, o.origin.lang ?? 'de') : ''}
            <div class="relative">
              ${campaignThumb(o.thumb, o.name)}
              ${o.corner ? `<div class="absolute right-2.5 top-2.5 flex flex-wrap justify-end gap-1.5">${o.corner}</div>` : ''}
            </div>
            <div class="px-4 pb-3 pt-3.5">
              ${o.eyebrow ? `<p class="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">${esc(o.eyebrow)}</p>` : ''}
              <h3 class="mt-0.5 line-clamp-2 font-display text-lg font-extrabold leading-snug tracking-tight text-slate-900 group-hover:text-brand">${esc(o.name)}</h3>
              ${
                o.meta?.length
                  ? `<p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">${o.meta
                      .map((m, i) => `${i ? '<span class="text-slate-300">·</span>' : ''}<span>${m}</span>`)
                      .join('')}</p>`
                  : ''
              }
            </div>
          </a>
          ${o.footer ? `<div class="mt-auto border-t border-slate-100 px-4 py-3">${o.footer}</div>` : ''}
        </article>`

/** Raster für `campaignCard` — groß: höchstens drei nebeneinander. */
export const campaignGrid = (cards: string[], extra = '') =>
  `<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${extra}">${cards.join('')}</div>`

/** Kleine Abschnittsüberschrift über Karten und Listen. */
export const sectionHead = (title: string, aside = '') => `
        <div class="mb-3 mt-9 flex items-end justify-between gap-3 first:mt-0">
          <h2 class="font-display text-xl font-extrabold tracking-tight">${esc(title)}</h2>
          ${aside}
        </div>`

/* ------------------------------------------------------- Preisstaffelung */

/** Eine Stufe der Preisstaffelung — dieselbe Form wie `PayTier` in domain.ts. */
export interface PayTierView {
  minViews: number
  amountCents: number
}

export const PAY_TIERS_PENDING = 'In Kürze wird Nikki Media eine Preisstaffelung bekannt geben.'

/**
 * Die Preisstaffelung als schmale, WAAGRECHTE Tabelle — eine Spalte je
 * Stufe, oben die Views, darunter der Verdienst. Steht ganz oben in der
 * Übersicht von Clipper und Creator, damit sie ihre Verdienstmöglichkeiten
 * immer vor Augen haben. Ohne Stufen steht dort `PAY_TIERS_PENDING`.
 */
export function payTierTable(tiers: PayTierView[], extra = 'mb-6'): string {
  const head = `<div class="flex shrink-0 items-center gap-2.5 pr-4">
            <span class="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-amber-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <h2 class="font-display text-sm font-extrabold uppercase tracking-[.14em]">Preisstaffelung</h2>
          </div>`
  if (!tiers.length) {
    return `<section class="${extra} flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 px-5 py-4 text-white shadow-sm sm:flex-row sm:items-center" data-pay-tiers="pending">
          ${head}
          <p class="text-sm text-white/75">${esc(PAY_TIERS_PENDING)}</p>
        </section>`
  }
  // Auf dem Handy enger, damit vier Stufen ohne Wischen in die Zeile passen.
  const cell = 'whitespace-nowrap px-2 py-1.5 text-center sm:px-4'
  return `<section class="${extra} flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 px-5 py-4 text-white shadow-sm lg:flex-row lg:items-center" data-pay-tiers="set">
          ${head}
          <div class="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
            <table class="text-sm">
              <tr class="border-b border-white/10">
                <th scope="row" class="whitespace-nowrap py-1.5 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:pr-4 sm:text-[11px]">Ab Views</th>
                ${tiers.map((t) => `<td class="${cell} text-[13px] font-semibold tabular-nums text-white/85 sm:text-sm">${esc(formatViews(t.minViews))}</td>`).join('')}
              </tr>
              <tr>
                <th scope="row" class="whitespace-nowrap py-1.5 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:pr-4 sm:text-[11px]">Verdienst</th>
                ${tiers.map((t) => `<td class="${cell} font-display text-sm font-extrabold tabular-nums text-amber-300 sm:text-base">${esc(formatEuro(t.amountCents))}</td>`).join('')}
              </tr>
            </table>
          </div>
        </section>`
}

/* ------------------------------------------------- eigenes Thumbnail */

/**
 * Knöpfe „Thumbnail hochladen“ / „Entfernen“ — das Verhalten steckt in
 * /assets/thumb.js (verkleinert das Bild im Browser auf 1280 × 720 JPEG,
 * lädt es direkt nach R2 und setzt es). `endpoint` ist z. B.
 * `/api/admin/projects/<id>/thumb` oder `/api/app/projects/<id>/thumb`.
 */
export function thumbUploadButtons(endpoint: string, o: { lang: Lang; hasCustom: boolean }): string {
  const t =
    o.lang === 'en'
      ? { up: o.hasCustom ? 'Replace thumbnail' : 'Upload thumbnail', rm: 'Use automatic', busy: 'Uploading …', fail: 'Upload failed.' }
      : { up: o.hasCustom ? 'Thumbnail ersetzen' : 'Thumbnail hochladen', rm: 'Automatisch verwenden', busy: 'Wird hochgeladen …', fail: 'Das hat nicht geklappt.' }
  const cls = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition'
  return `<span class="inline-flex flex-wrap items-center gap-2" data-thumb-upload="${esc(endpoint)}" data-busy="${esc(t.busy)}" data-fail="${esc(t.fail)}">
      <button type="button" data-thumb-pick class="${cls} border border-slate-300 bg-white text-slate-700 hover:border-slate-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>
        ${esc(t.up)}
      </button>
      ${o.hasCustom ? `<button type="button" data-thumb-remove class="${cls} text-slate-500 hover:text-red-600">${esc(t.rm)}</button>` : ''}
    </span>`
}
