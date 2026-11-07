/**
 * Die Gold-Landingpages (November 2026, Vorgabe des Auftraggebers):
 *
 *   /agenturen        Agenturen, die ihre Kunden mitbringen   → Stepper /api/agencies (wie /brands)
 *   /personal-brands  Personal Brands, die Omnipräsenz wollen → Stepper /api/leads (wie /)
 *   /investoren       Investoren                             → Formular /api/investors
 *
 * Schwarz-Gold, aufgebaut wie ein Dashboard: Der Hero IST die Oberfläche der
 * Plattform, mit dem Views-Regler (1 Mio. Views = 5.000 €) an der Stelle,
 * wo sonst das Guthaben steht. Die Formulare sind dieselben Bausteine wie auf
 * `/` und `/brands` (`leadStepper`, `agencyStepper`), dieselben Endpunkte,
 * dieselbe Weiterleitung, derselbe Ladeschirm. Kein neuer Ablauf, keine
 * zweite Wahrheit.
 *
 * Styles: /assets/site.css (Formular, Ladeschirm) + /assets/gold.css
 * Verhalten: /assets/gold.js (Regler, Marge, Investorenformular),
 *            /assets/stepper.js, /assets/agent.js (FAQ-Agent)
 *
 * Keine langen Gedankenstriche in sichtbaren Texten (Vorgabe, siehe CLAUDE.md).
 */
import { AURORA } from './aurora'
import { breadcrumbs, clippingService, faqPage, geoHead, ldGraph, ORGANIZATION } from './seo'
import { DEFAULT_DIAL, dialOptions } from '../lib/phone'
import { PRICE_PER_MILLION_EUR, faqFor, type FaqAudience } from '../lib/faq'
import { INVESTOR_KINDS, INVESTOR_TICKETS } from '../lib/investors'
import { AGENCY_STEPPER_CONFIG, agencyLoadscreen, agencyStepper } from './brands-landing'
import { LEAD_STEPPER_CONFIG, leadLoadscreen, leadStepper } from './landing'
import { esc, jsonScript } from './layout'
import type { Article } from '../lib/articles'
import { articlesBlockGold } from './gold-articles'

/* ------------------------------------------------------------ Bausteine */

const svg = (d: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`

const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  film: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>'),
  flame: svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.5 2 2.5 0-3 .5-5.5 1-8Z"/>'),
  card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>'),
  cut: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'),
  brief: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>'),
  upload: svg('<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'),
  arrow: svg('<path d="M9 6l6 6-6 6"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7"/>', ' stroke-width="2.2"'),
}

/** Echte Kampagnen von nikkimedia.co (Case Studies dort), Werte wie dort angegeben. */
const SHOWCASE = [
  { handle: 'dindrop7', img: '/img/cases/dindrop7-DbLpapmA_Bw.jpg', views: 'über 100 Mio.', niche: 'Creator-Brand' },
  { handle: 'max_tornow_business', img: '/img/cases/max_tornow_business-DCHhYijJK4b.jpg', views: '31,4 Mio.', niche: 'Business-Mentor' },
  { handle: 'caspianbluecaviar', img: '/img/cases/caspianbluecaviar-DMzr3__qHsw.jpg', views: 'über 40 Mio.', niche: 'Luxus-Food' },
  { handle: 'levantine_istanbul', img: '/img/cases/levantine_istanbul-DBQxgMHAw1U.jpg', views: '3 Mio.', niche: 'Gastronomie' },
]

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
const views = (millions: number) => Math.round(millions * 1_000_000).toLocaleString('de-DE')

/**
 * Die Kurve im Dashboard. Dieselbe Formel steckt in /assets/gold.js — dort
 * wird sie beim Ziehen am Regler neu gezeichnet, hier für den ersten Stand
 * (und für Browser ohne JavaScript).
 */
export function reachChart(millions: number, max = 50): { line: string; area: string } {
  const n = 28
  const w = 600
  const floor = 210
  const h = 78 + 110 * Math.pow(Math.min(millions, max) / max, 0.55)
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ease = 1 - Math.pow(1 - t, 1.8)
    const wobble = (Math.sin(i * 1.7) * 5 + Math.sin(i * 0.63) * 4) * (0.4 + t * 0.6)
    pts.push([+(t * w).toFixed(1), +(floor - 8 - h * ease + wobble).toFixed(1)])
  }
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  return { line, area: `${line} L${w} 230 L0 230 Z` }
}

/* ------------------------------------------------------------ Dashboard */

type Variant = 'agenturen' | 'personal-brands' | 'investoren'

interface MockCopy {
  workspace: string
  label: string
  actions: { label: string; href: string; icon: string; primary?: boolean }[]
}

const MOCK: Record<Variant, MockCopy> = {
  agenturen: {
    workspace: 'Collaboration',
    label: 'Reichweite für euren Kunden',
    actions: [
      { label: 'Kunden eintragen', href: '#start', icon: I.brief, primary: true },
      { label: 'Rohmaterial hochladen', href: '#start', icon: I.upload },
      { label: 'Creator buchen', href: '#start', icon: I.star },
    ],
  },
  'personal-brands': {
    workspace: 'Kundenbereich',
    label: 'Reichweite in Auftrag',
    actions: [
      { label: 'Kampagne anfragen', href: '#start', icon: I.send, primary: true },
      { label: 'Rohmaterial hochladen', href: '#start', icon: I.upload },
      { label: 'Fragen stellen', href: '#frage', icon: I.chat },
    ],
  },
  investoren: {
    workspace: 'Administration',
    label: 'Volumen einer Kampagne',
    actions: [
      { label: 'Gespräch anfragen', href: '#start', icon: I.send, primary: true },
      { label: 'Marktplatz verstehen', href: '#marktplatz', icon: I.chart },
      { label: 'Fragen stellen', href: '#frage', icon: I.chat },
    ],
  },
}

const sideItem = (icon: string, label: string, on = false, tag = '') =>
  `<span class="g-app__nav${on ? ' is-on' : ''}">${icon}<span>${esc(label)}</span>${tag ? `<em>${esc(tag)}</em>` : ''}</span>`

function rightCard(variant: Variant): string {
  if (variant === 'agenturen') {
    return `<div class="g-card g-margin" data-margin>
        <p class="g-card__title">Eure Marge</p>
        <label class="g-margin__row" for="g-resale">
          <span>Euer Preis pro 1.000 Views</span>
          <span class="g-margin__in"><input id="g-resale" type="number" inputmode="decimal" min="5" max="100" step="0.5" value="8" data-margin-input> €</span>
        </label>
        <div class="g-margin__row"><span>Unser Preis pro 1.000 Views</span><b>5 €</b></div>
        <div class="g-margin__sum"><span>Bleibt bei euch</span><b data-margin-out>${euro(3 * 3000)}</b></div>
        <p class="g-card__note">Gerechnet auf die Views am Regler.</p>
      </div>`
  }
  return `<div class="g-card">
        <p class="g-card__title">Netzwerk</p>
        <dl class="g-stats">
          <div><dt>Clipper</dt><dd>5.000+</dd></div>
          <div><dt>Organische Views</dt><dd>1 Mrd.</dd></div>
          <div><dt>Clips pro Monat</dt><dd>9.800+</dd></div>
        </dl>
      </div>`
}

function dashboard(variant: Variant): string {
  const m = MOCK[variant]
  const start = 3
  const chart = reachChart(start)
  const price = start * PRICE_PER_MILLION_EUR
  return `
  <div class="g-app" data-reach data-price-per-million="${PRICE_PER_MILLION_EUR}">
    <div class="g-app__rail" aria-hidden="true">
      <span class="g-app__ws-btn">${I.user}</span>
      <span class="g-app__ws-btn is-on">N</span>
      <span class="g-app__ws-btn">${I.plus}</span>
    </div>

    <div class="g-app__side" aria-hidden="true">
      <p class="g-app__group">Nikki Media</p>
      ${sideItem(I.home, 'Startseite', true)}
      ${sideItem(I.chart, 'Analytics')}
      ${sideItem(I.film, 'Kampagnen')}
      ${sideItem(I.flame, 'Virale Clips', false, 'Neu')}
      ${sideItem(I.card, 'Zahlungen')}
      <p class="g-app__group">Marktplatz</p>
      ${sideItem(I.cut, 'Clipper')}
      ${sideItem(I.star, 'Creator')}
      ${sideItem(I.brief, 'Agenturen')}
      <p class="g-app__group">Betrieb</p>
      ${sideItem(I.upload, 'Rohmaterial')}
      ${sideItem(I.chat, 'Support')}
      <span class="g-app__me">${esc(m.workspace)}</span>
    </div>

    <div class="g-app__main">
      <div class="g-app__top" aria-hidden="true">
        <span class="g-app__search">${I.search}<span>Nikki Media durchsuchen</span><kbd>⌘K</kbd></span>
        <span class="g-app__icons">${I.chat}${I.bell}<span class="g-app__avatar">NM</span></span>
      </div>

      <div class="g-app__body">
        <section class="g-app__center">
          <div class="g-app__head">
            <div>
              <p class="g-app__label">${esc(m.label)}</p>
              <p class="g-app__big"><output data-reach-views for="g-reach">${views(start)}</output> <span>Views</span></p>
            </div>
            <div class="g-pill">
              <span class="g-pill__coin" aria-hidden="true"></span>
              <span><b data-reach-price>${euro(price)}</b><small>5 € pro 1.000 Views</small></span>
            </div>
          </div>

          <svg class="g-chart" viewBox="0 0 600 230" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="g-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#2FE08C" stop-opacity=".34"/>
                <stop offset="1" stop-color="#2FE08C" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path data-reach-area d="${chart.area}" fill="url(#g-fill)"/>
            <path data-reach-line d="${chart.line}" fill="none" stroke="#5EEAA6" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
            <line x1="0" y1="229" x2="600" y2="229" stroke="rgba(238, 247, 241,.14)" stroke-dasharray="2 5"/>
          </svg>

          <div class="g-slider">
            <label for="g-reach">Wie viele Views willst du in Auftrag geben?</label>
            <input id="g-reach" type="range" min="1" max="50" step="1" value="${start}" data-reach-input
                   aria-valuetext="${start} Millionen Views, ${euro(price)}">
            <div class="g-slider__scale" aria-hidden="true"><span>1 Mio.</span><span>10 Mio.</span><span>25 Mio.</span><span>50 Mio.</span></div>
          </div>

          <div class="g-app__actions">
            ${m.actions
              .map(
                (a) =>
                  `<a class="g-act${a.primary ? ' g-act--gold' : ''}" href="${a.href}"${a.primary ? ' data-reach-cta' : ''}>${a.icon}<span>${esc(a.label)}</span></a>`,
              )
              .join('')}
          </div>
        </section>

        <aside class="g-app__right">
          <div class="g-card">
            <p class="g-card__title">Virale Clips ${I.arrow}</p>
            <ul class="g-viral">
              ${SHOWCASE.slice(0, 3)
                .map(
                  (s) => `<li>
                <img src="${s.img}" alt="" width="44" height="78" loading="lazy" decoding="async">
                <span><b>@${esc(s.handle)}</b><small>${esc(s.niche)}</small></span>
                <strong>${esc(s.views)}</strong>
              </li>`,
                )
                .join('')}
            </ul>
            <p class="g-card__note">Organische Views echter Kampagnen.</p>
          </div>
          ${rightCard(variant)}
        </aside>
      </div>
    </div>
  </div>`
}


/* ---------------------------------------------- Rahmen für alle Gold-Seiten */

/** Fonts, Stylesheets und Favicon — für Landingpages UND Artikelseiten. */
export const goldHeadLinks = () => `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/gold.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`

/** Kopfzeile. `active` markiert den Menüpunkt, `cta` ist der goldene Knopf rechts. */
export const goldNav = (active: string | null, cta: string, ctaHref = '#start') => `<a class="g-skip" href="${ctaHref}">Zum Inhalt springen</a>

<header class="g-nav">
  <div class="g-wrap g-nav__in">
    <a class="g-logo" href="/" aria-label="Nikki Media, Startseite">
      <span class="g-logo__mark" aria-hidden="true">N</span>
      <span>Nikki Media</span>
    </a>
    <nav class="g-nav__links" aria-label="Hauptnavigation">
      ${NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('')}
    </nav>
    <div class="g-nav__right">
      <a class="g-nav__login" href="/login">Login</a>
      <a class="g-btn g-btn--gold g-btn--sm" href="${ctaHref}">${esc(cta)}</a>
      <button class="g-nav__burger" type="button" aria-label="Menü öffnen" aria-expanded="false" aria-controls="g-mobile" data-burger>
        <span></span><span></span>
      </button>
    </div>
  </div>
  <nav class="g-mobile" id="g-mobile" hidden aria-label="Menü">
    ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    <a href="/login">Login</a>
  </nav>
</header>`

export const goldFoot = () => `<footer class="g-foot">
  <div class="g-wrap g-foot__in">
    <a class="g-logo" href="/"><span class="g-logo__mark" aria-hidden="true">N</span><span>Nikki Media</span></a>
    <nav aria-label="Seiten">
      <a href="/">Startseite</a>
      ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
      <a href="/impressum">Impressum</a>
      <a href="/datenschutz">Datenschutz</a>
    </nav>
    <p>© <span data-year>2026</span> Nikki Media. Der Marktplatz für organische Reichweite.</p>
  </div>
</footer>`

/* ------------------------------------------------------------ Rahmen */

const NAV: { href: string; label: string; key?: Variant }[] = [
  // Wie das Menü der Landingpages. /agenturen, /personal-brands und /investoren sind seit
  // November 2026 nicht mehr auf der Seite (Weiterleitung in routes/public.ts).
  { href: '/#case-studies', label: 'Case Studies' },
  { href: '/fachartikel', label: 'Fachartikel' },
  { href: '/clipper', label: 'Clipper werden' },
  { href: '/creator', label: 'Creator werden' },
  { href: '/brands', label: 'Für Agenturen' },
]

interface PageOptions {
  variant: Variant
  title: string
  description: string
  h1: string
  lead: string
  cta: string
  sections: string
  faqAudience: FaqAudience
  /** Formular-Teil: Markup, Ladeschirm und Stepper-Konfiguration (oder nichts für das Investorenformular). */
  form: { html: string; loadscreen?: string; config?: unknown }
  suggest: string[]
  /** Veröffentlichte Fachartikel — der Block „Fachartikel“ erscheint nur, wenn es welche gibt. */
  articles?: Article[]
}

const faqBlock = (audience: FaqAudience) => `
<section class="g-sec" id="faq">
  <div class="g-wrap g-faq">
    <div class="g-faq__head">
      <h2 class="g-h2">Häufige Fragen</h2>
      <p class="g-lead">Noch etwas offen? Unten rechts beantwortet dir unser Assistent jede Frage aus dieser Liste sofort.</p>
    </div>
    <div class="g-faq__list">
      ${faqFor(audience)
        .map(
          (f) => `<details class="g-faq__i" id="faq-${esc(f.id)}">
        <summary>${esc(f.q)}<span aria-hidden="true">${I.plus}</span></summary>
        <p>${esc(f.a)}</p>
      </details>`,
        )
        .join('')}
    </div>
  </div>
</section>`

/** Zielgruppe der Leistung im JSON-LD (seo.ts). */
const SERVICE_AUDIENCE: Record<Variant, string> = {
  agenturen: 'Agenturen',
  'personal-brands': 'Personal Brands',
  investoren: 'Investoren und Auftraggeber',
}

export function goldPage(o: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="https://nikkimedia.co/${o.variant}">
${geoHead(`/${o.variant}`)}
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
${goldHeadLinks()}
${ldGraph(
  ORGANIZATION,
  clippingService(o.title.split(' | ')[0], o.description, SERVICE_AUDIENCE[o.variant]),
  faqPage(o.faqAudience, `/${o.variant}`),
  breadcrumbs([{ name: 'Nikki Media', path: '/' }, { name: o.title.split(':')[0], path: `/${o.variant}` }]),
)}
</head>
<body class="gold page-home theme-brands g-${o.variant}">
${AURORA}

${goldNav(o.variant, o.cta)}

<main>
<section class="g-hero">
  <div class="g-wrap">
    <div class="g-hero__copy">
      <h1 class="g-h1">${o.h1}</h1>
      <p class="g-lead g-hero__lead">${esc(o.lead)}</p>
    </div>
    ${dashboard(o.variant)}
  </div>
</section>

${o.sections}

<section class="g-sec g-sec--form" id="start">
  <div class="g-wrap g-form">
    ${o.form.html}
  </div>
</section>

${articlesBlockGold(o.articles ?? [])}

${faqBlock(o.faqAudience)}
</main>

${goldFoot()}

${o.form.loadscreen ?? ''}
${o.form.config ? `<script type="application/json" id="stepper-config">${jsonScript(o.form.config)}</script>` : ''}
<script type="application/json" id="agent-config">${jsonScript({ suggest: o.suggest, theme: 'gold' })}</script>
<script src="/assets/gold.js" defer></script>
${o.form.config ? '<script src="/assets/stepper.js" defer></script>' : ''}
<script src="/assets/agent.js" defer></script>
</body>
</html>
`
}

/* ------------------------------------------------------------ Abschnitte */

/** Ein echter Ablauf, deshalb nummeriert. */
const steps = (items: [string, string][]) => `
      <ol class="g-steps">
        ${items.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}
      </ol>`

const ticks = (items: string[]) => `
      <ul class="g-ticks">
        ${items.map((t) => `<li>${I.check}<span>${esc(t)}</span></li>`).join('')}
      </ul>`

const caseWall = () => `
      <div class="g-cases">
        ${SHOWCASE.map(
          (s) => `<figure class="g-case">
          <img src="${s.img}" alt="Clip von @${esc(s.handle)}" width="360" height="640" loading="lazy" decoding="async">
          <figcaption><b>${esc(s.views)}</b><span>@${esc(s.handle)}</span></figcaption>
        </figure>`,
        ).join('')}
      </div>`

/** Die vier Seiten des Marktplatzes. */
const marketplaceGrid = (highlight?: string) => {
  const sides: [string, string, string, string][] = [
    ['auftraggeber', 'Auftraggeber', 'Unternehmen und Personal Brands buchen Views und laden ihr Rohmaterial ins eigene Dashboard.', '/personal-brands'],
    ['agenturen', 'Agenturen', 'Bringen ihre Kunden mit, buchen Reichweite für sie und behalten Kundenbeziehung und Marge.', '/agenturen'],
    ['clipper', 'Clipper', 'Über 5.000 Cutter schneiden Hooks, Untertitel und 9:16-Clips und posten über eigene Accounts.', '/clipper'],
    ['creator', 'Creator', 'Verbreiten freigegebene Clips über ihre Reichweite und starten eigene Kampagnen.', '/creator'],
  ]
  return `
      <div class="g-market">
        ${sides
          .map(
            ([key, title, text, href]) => `<a class="g-market__i${key === highlight ? ' is-on' : ''}" href="${href}">
          <b>${esc(title)}</b><span>${esc(text)}</span>
        </a>`,
          )
          .join('')}
      </div>`
}

/* ------------------------------------------------------------ /agenturen */

export const agenturenPage = (articles: Article[] = []): string =>
  goldPage({
    articles,
    variant: 'agenturen',
    title: 'Clipping für Agenturen: Reichweite für eure Kunden | Nikki Media',
    description:
      'Bringt eure Kunden zu Nikki Media: Über 5.000 Clipper sorgen für Omnipräsenz auf TikTok, Instagram und YouTube. 1 Mio. Views ab 5.000 €, ihr behaltet die Marge.',
    h1: 'Ihr bringt die Kunden.<br>Wir bringen die Omnipräsenz.',
    lead:
      'Euer Kunde will Reichweite, ihr wollt kein Clipping-Team aufbauen. Bei uns bucht ihr Views wie Ware: Über 5.000 Clipper und unsere Creator schneiden, posten und verbreiten. Die Kundenbeziehung und die Marge bleiben bei euch.',
    cta: 'Kooperation anfragen',
    faqAudience: 'agenturen',
    suggest: ['Was kostet 1 Mio. Views?', 'Arbeitet ihr white label?', 'Was ist ein Cooperation-Code?'],
    sections: `
<section class="g-sec">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2">So läuft eine Kampagne für euren Kunden</h2>
      <p class="g-lead">Vom ersten Briefing bis zum viralen Clip bleibt alles in eurem Collaboration-Dashboard dokumentiert.</p>
    </div>
    ${steps([
      ['Kunden eintragen', 'Formular unten ausfüllen, Adresse per Code bestätigen. Im Briefing nennt ihr Views, Budget und Plattformen.'],
      ['Material liefern', 'Rohmaterial hochladen oder einen Cloud-Link hinterlegen. Hat euer Kunde keins, produzieren unsere Creator es mit.'],
      ['Team wird zugeordnet', 'NIKKI MEDIA stellt Clipper und Creator für die Kampagne zusammen und wärmt die Accounts in der Nische auf.'],
      ['Reichweite messen', 'Jeder veröffentlichte Clip kommt mit echten Zahlen ins Dashboard, die viralsten ganz oben.'],
    ])}
  </div>
</section>

<section class="g-sec g-sec--raise">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2">Was euer Dashboard freischaltet</h2>
      <p class="g-lead">Mit Cooperation-Code sofort nach dem Briefing, ohne Code nach einem kurzen Gespräch mit unserem Team.</p>
    </div>
    ${ticks([
      'Alle Kampagnen mit fertigen Clips ansehen und herunterladen',
      'Eigene Kampagnen anlegen, mit Upload und Briefing',
      'Creator aus dem Netzwerk für euren Kunden buchen',
      'Clipper und Creator des Netzwerks einsehen',
      'Auf Wunsch komplett im Hintergrund, unter eurem Namen',
    ])}
  </div>
</section>

<section class="g-sec" id="marktplatz">
  <div class="g-wrap">
    <h2 class="g-h2 g-h2--narrow">Ein Marktplatz, auf dem ihr den Kunden mitbringt</h2>
    ${marketplaceGrid('agenturen')}
  </div>
</section>`,
    form: {
      html: `<div class="g-form__copy">
      <h2 class="g-h2">Kooperation anfragen</h2>
      <p class="g-lead">Acht kurze Schritte. Danach bestätigst du deine Adresse per Code und startest im Dashboard die erste Kampagne für euren Kunden.</p>
      ${ticks(['Mit Cooperation-Code: sofort freigeschaltet', 'Ohne Code: Freigabe nach persönlichem Gespräch', 'Kein Konkurrent sieht eure Kunden oder Kampagnen'])}
    </div>
    <div class="g-form__card">${agencyStepper()}</div>`,
      loadscreen: agencyLoadscreen(),
      config: AGENCY_STEPPER_CONFIG,
    },
  })

/* ------------------------------------------------------- /personal-brands */

export const personalBrandsPage = (articles: Article[] = []): string =>
  goldPage({
    articles,
    variant: 'personal-brands',
    title: 'Personal Brand Clipping: Omnipräsenz im Feed | Nikki Media',
    description:
      'Dein Gesicht in jedem Feed: Nikki Media macht aus Podcasts, Interviews und Livestreams hunderte Clips über viele Accounts. 1 Mio. Views ab 5.000 €.',
    h1: 'Dein Gesicht.<br>In jedem Feed.',
    lead:
      'Aus einem Podcast, einem Interview oder einem Livestream schneiden unsere Clipper hunderte Clips und posten sie über viele Accounts gleichzeitig. Deine Zielgruppe sieht dich überall, du postest nichts selbst und zahlst nur für echte Views.',
    cta: 'Kampagne anfragen',
    faqAudience: 'personal-brands',
    suggest: ['Was kostet 1 Mio. Views?', 'Brauche ich eigenes Material?', 'Wie schnell sehe ich Ergebnisse?'],
    sections: `
<section class="g-sec">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2">Aus einer Aufnahme wird Omnipräsenz</h2>
      <p class="g-lead">Reichweite durch Wiederholung: Wer dich auf zehn Accounts sieht, merkt sich deinen Namen.</p>
    </div>
    ${steps([
      ['Material hochladen', 'Ein paar Minuten Rohmaterial reichen, direkt ins eigene Dashboard oder als Cloud-Link.'],
      ['Clipper schneiden', 'Starke Aussagen werden zu 9:16-Clips mit Hook in den ersten Sekunden und Untertiteln.'],
      ['Accounts posten', 'Hunderte Accounts, vorher in deiner Nische aufgewärmt, spielen die Clips deiner Zielgruppe aus.'],
      ['Du siehst, was viral geht', 'Views, Likes und Shares jedes Clips, die stärksten ganz oben in deiner Übersicht.'],
    ])}
  </div>
</section>

<section class="g-sec g-sec--raise">
  <div class="g-wrap">
    <h2 class="g-h2 g-h2--narrow">Echte Kampagnen, echte Reichweite</h2>
    ${caseWall()}
  </div>
</section>`,
    form: {
      html: `<div class="g-form__copy">
      <h2 class="g-h2">Kampagne anfragen</h2>
      <p class="g-lead">Fünf kurze Schritte, danach landest du direkt in deinem Dashboard und kannst Rohmaterial hochladen. Jason meldet sich persönlich.</p>
      ${ticks(['Fester Preis pro 1.000 Views, vorab schriftlich', 'Abrechnung nur nach erreichten Views', 'Clips erstellen unsere Clipper für dich'])}
    </div>
    <div class="g-form__card">${leadStepper()}</div>`,
      loadscreen: leadLoadscreen(),
      config: LEAD_STEPPER_CONFIG,
    },
  })

/* ------------------------------------------------------------ /investoren */

const investorForm = () => `
    <form class="stepper__card g-invest" data-investor-form novalidate>
      <div class="fields">
        <label class="field"><span class="field__l">Name <i>*</i></span><input name="fullName" required autocomplete="name" maxlength="120"></label>
        <label class="field"><span class="field__l">Firma oder Fonds <em>(optional)</em></span><input name="company" autocomplete="organization" maxlength="160"></label>
        <label class="field"><span class="field__l">E-Mail <i>*</i></span><input type="email" name="email" required autocomplete="email" maxlength="200"></label>
        <div class="field">
          <span class="field__l" id="inv-phone">Telefon <i>*</i></span>
          <div class="phonebox">
            <select name="phoneDial" class="phonebox__dial" aria-label="Ländervorwahl" autocomplete="tel-country-code">${dialOptions(DEFAULT_DIAL, 'de')}</select>
            <input type="tel" name="phone" required autocomplete="tel-national" inputmode="numeric" aria-labelledby="inv-phone" pattern="[0-9 ]{4,}" maxlength="24" placeholder="170 1234567">
          </div>
        </div>
        <fieldset class="g-invest__group">
          <legend class="field__l">Wer investiert? <i>*</i></legend>
          <div class="opts">${INVESTOR_KINDS.map((k) => `<label class="opt opt--chip"><input type="radio" name="kind" value="${esc(k)}" required><span>${esc(k)}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="g-invest__group">
          <legend class="field__l">Ticketgröße <i>*</i></legend>
          <div class="opts">${INVESTOR_TICKETS.map((t) => `<label class="opt opt--chip"><input type="radio" name="ticket" value="${esc(t)}" required><span>${esc(t)}</span></label>`).join('')}</div>
        </fieldset>
        <label class="field"><span class="field__l">Nachricht <em>(optional)</em></span><textarea name="message" rows="3" maxlength="2000"></textarea></label>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="g-hp" aria-hidden="true">
      </div>
      <label class="check"><input type="checkbox" name="privacy" required><span>Ich habe die <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen und stimme zu. <i>*</i></span></label>
      <p class="stepper__err" data-error hidden role="alert"></p>
      <p class="g-invest__ok" data-ok hidden role="status">Danke. Jason meldet sich persönlich bei dir, um einen Termin zu vereinbaren.</p>
      <div class="stepper__nav"><button class="btn btn--primary" type="submit" data-submit>Gespräch anfragen</button></div>
    </form>`

export const investorenPage = (articles: Article[] = []): string =>
  goldPage({
    articles,
    variant: 'investoren',
    title: 'Investoren: Marktplatz für organische Reichweite | Nikki Media',
    description:
      'Nikki Media verbindet Auftraggeber, Agenturen, über 5.000 Clipper und Creator auf einer Plattform. Gespräche mit Investoren führt Gründer Jason Azarov persönlich.',
    h1: 'Der Marktplatz für<br>organische Reichweite.',
    lead:
      'Unternehmen, Personal Brands und Agenturen kaufen Views. Über 5.000 Clipper und unsere Creator liefern sie, bezahlt nach Leistung. Dazwischen steht eine eigene Plattform mit Login, die jeden Schritt dokumentiert.',
    cta: 'Gespräch anfragen',
    faqAudience: 'investoren',
    suggest: ['Womit verdient ihr Geld?', 'Was bedeutet Marktplatz?', 'Woher weiß ich, dass die Views echt sind?'],
    sections: `
<section class="g-sec" id="marktplatz">
  <div class="g-wrap">
    <h2 class="g-h2 g-h2--narrow">Vier Seiten, eine Plattform</h2>
    <p class="g-lead g-h2--narrow">Jede Seite hat ihr eigenes Dashboard. NIKKI MEDIA ordnet die Kampagnen zu, niemand sieht fremde Kunden.</p>
    ${marketplaceGrid()}
  </div>
</section>

<section class="g-sec g-sec--raise">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2">Was schon steht</h2>
      <p class="g-lead">Netzwerk-Kennzahlen wie auf nikkimedia.co veröffentlicht, Stand 2026. Alles Weitere im Gespräch.</p>
    </div>
    <dl class="g-facts">
      <div><dt>5.000+</dt><dd>Clipper im Netzwerk</dd></div>
      <div><dt>1 Mrd.</dt><dd>organische Views insgesamt</dd></div>
      <div><dt>9.800+</dt><dd>Clips pro Monat</dd></div>
      <div><dt>6</dt><dd>Plattformen mit automatischer Veröffentlichung</dd></div>
    </dl>
  </div>
</section>

<section class="g-sec">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2">Das Geschäftsmodell in einem Satz</h2>
      <p class="g-lead">Auftraggeber zahlen pro erreichter Reichweite, die Angebotsseite wird aus genau diesem Budget leistungsbasiert vergütet.</p>
    </div>
    ${ticks([
      'Richtwert 5.000 € pro Million Views, vor Start schriftlich fixiert',
      'Clipper und Creator verdienen nach Preisstaffelung pro Views',
      'Echte Zahlen: Abgleich mit den Plattform-Analytics alle 15 Minuten',
      'Eigenes Admin-Dashboard, in dem jede Kampagne dokumentiert ist',
    ])}
  </div>
</section>`,
    form: {
      html: `<div class="g-form__copy">
      <h2 class="g-h2">Gespräch mit Jason Azarov</h2>
      <p class="g-lead">Gründer und Inhaber von Nikki Media. Unterlagen gibt es nach dem Erstgespräch und einer Vertraulichkeitsvereinbarung.</p>
      <p class="g-fine">Diese Seite ist kein Angebot zum Erwerb von Anteilen und keine Anlageberatung.</p>
    </div>
    <div class="g-form__card">${investorForm()}</div>`,
    },
  })
