/* eslint-disable */
/**
 * Landingpage für Agenturen aus allen Branchen (/brands) — serverseitig
 * gerendert, durchgehend Deutsch, B2B. Angesprochen werden durchgehend
 * Agenturen und ihre Kunden, nie „Marken“ oder „Brand-Owner“ (Vorgabe des
 * Auftraggebers).
 *
 * Das Angebot: NIKKI MEDIA arbeitet als Clipping-Agentur im Hintergrund für
 * Marketing- und Social-Media-Agenturen — schneidet, lädt hoch und verbreitet
 * für deren Kunden. Ohne Zahlen, auf Wunsch des Auftraggebers.
 *
 * Bausteine (Nav, Hero, Stepper, Ladeschirm, Footer) wie auf /, /clipper und
 * /creator. `theme-brands` am <body> schaltet den Akzent auf Gold.
 *
 * Der Stepper schickt an POST /api/agencies. Ganz am Ende steht das Feld
 * „Cooperation-Code“: wer ihn nach einem Erstgespräch bekommen hat, ist ein
 * WARMER Lead und hat nach dem Briefing sofort Zugang zu Kampagnen, Creatorn
 * und Clippern; ohne Code ist er KALT (siehe lib/agency.ts).
 *
 * Styles: /assets/site.css · Verhalten: /assets/site.js + /assets/stepper.js
 */
import { breadcrumbs, clippingService, geoHead, ldGraph, ORGANIZATION } from './seo'
import { INDUSTRIES } from '../lib/domain'
import { AGENCY_CLIENTS, AGENCY_FOOTAGE, AGENCY_KINDS, AGENCY_PLATFORMS, AGENCY_SOCIALS, AGENCY_SOURCES } from '../lib/agency'
import { DEFAULT_DIAL, dialOptions } from '../lib/phone'
import { clipwallRows } from './creator-landing'
import { esc, jsonScript } from './layout'

/** Anmeldung direkt ins Collaboration-Dashboard. */
const LOGIN_URL = '/login?next=%2Fcollaboration'

export const AGENCY_STEPPER_CONFIG = {
  endpoint: '/api/agencies',
  redirect: '/collaboration',
  titles: ['Plattformen', 'Kunden', 'Wer seid ihr?', 'Aufmerksam geworden', 'Nische', 'Social Media', 'Rohmaterial', 'Kontakt'],
  stepLabel: 'Schritt {n} von {total} · {title}',
  submitText: 'Kooperation anfragen',
  sendingText: 'Einen Moment …',
  errors: {
    pick: 'Bitte triff zuerst eine Auswahl.',
    contact:
      'Bitte fülle alle Pflichtfelder aus, Name, E-Mail, Vorwahl und Telefonnummer (bei „Sonstiges“ auch die Beschreibung), und stimme der Datenschutzerklärung zu.',
    link: 'Bitte gib einen vollständigen Link ein, der mit https:// beginnt, oder lass das Feld leer.',
    tooMany: 'Zu viele Anfragen von dieser Verbindung. Bitte versuche es später erneut.',
    generic: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
  },
  loadTexts: [
    [0, 'Wir richten euer Collaboration-Dashboard ein …'],
    [30, 'Eure Angaben werden hinterlegt …'],
    [55, 'Euer Zugang wird vorbereitet …'],
    [78, 'Wir schicken dir deinen Code …'],
    [99, 'Fast geschafft: dein Code ist unterwegs!'],
  ],
  loadStyle: 'percent',
}

/* ------------------------------------------------------------ Bausteine */

interface Choice {
  value: string
  label: string
  subtitle?: string
}

const CHECK = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const TICK = `<span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`

const FAQ_ICON = `<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`

/** Symbole der Leistungs-Karten — schlicht, eine Linie, im Akzent. */
const SVG = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`

const ICONS = {
  cut: SVG('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
  upload: SVG('<path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2"/><path d="M4.5 15v2.2A2.8 2.8 0 0 0 7.3 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15"/>'),
  army: SVG('<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 15.2a4.2 4.2 0 0 1 6 3.8"/>'),
  star: SVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'),
  camera: SVG('<rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3"/>'),
  chart: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  shield: SVG('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'),
  key: SVG('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  handshake: SVG('<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11l-3 3-2-2 4-4h3l4 4"/><path d="M3 11l4-4 3 1M3 11l6 6 1.5-1.5"/>'),
}

/** Schritt 1: Plattformen, Mehrfachauswahl. */
const platformTiles = (): string =>
  AGENCY_PLATFORMS.map(
    (p) => `
              <label class="plat__tile">
                <input type="checkbox" name="platforms" value="${esc(p.value)}">
                <span class="plat__box">
                  <span class="plat__logo"><img src="/img/platforms/${esc(p.value)}.svg" alt="" width="34" height="34" loading="lazy" decoding="async"></span>
                  <b>${esc(p.label)}</b>
                  <small>${esc(p.subtitle)}</small>
                  <span class="plat__check" aria-hidden="true">${CHECK}</span>
                </span>
              </label>`,
  ).join('')

/** Einzelauswahl — stepper.js springt nach dem Klick von selbst weiter, wenn der Schritt nur daraus besteht. */
const radioOptions = (name: string, choices: readonly Choice[]): string =>
  choices
    .map(
      (o) => `
              <label class="opt"><input type="radio" name="${esc(name)}" value="${esc(o.value)}"><span><b>${esc(o.label)}</b>${
                o.subtitle ? `<small>${esc(o.subtitle)}</small>` : ''
              }</span></label>`,
    )
    .join('')

/** Schritt 5: dieselbe Nischen-Liste wie auf / und /creator. */
const nicheChips = (): string =>
  INDUSTRIES.map(
    (n) => `
              <label class="opt opt--chip"><input type="radio" name="niche" value="${esc(n)}"><span>${esc(n)}</span></label>`,
  ).join('')

/** Schritt 6: je Kanal ein freiwilliges Feld. */
const socialFields = (): string =>
  AGENCY_SOCIALS.map(
    (s) => `
              <label class="field">
                <span class="field__l">${
                  s.logo
                    ? `<img src="/img/platforms/${esc(s.value)}.svg" alt="" width="16" height="16" loading="lazy" decoding="async">`
                    : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
                }${esc(s.label)} <em>(optional)</em></span>
                <input type="text" name="social_${esc(s.value)}" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(s.placeholder)}">
              </label>`,
  ).join('')

/** Leistungen — was NIKKI MEDIA für die Kunden einer Agentur übernimmt. */
const SERVICES: readonly { icon: keyof typeof ICONS; tag: string; title: string; text: string }[] = [
  {
    icon: 'cut',
    tag: 'Schnitt & Editing',
    title: 'Aus Rohmaterial werden Clips, die hängen bleiben.',
    text: 'Podcasts, Interviews, Produktvideos, Livestreams: Unsere Clipper finden die stärksten Momente und schneiden daraus Kurzvideos im Hochformat, mit Hook, Untertiteln und Tempo.',
  },
  {
    icon: 'upload',
    tag: 'Upload & Distribution',
    title: 'Wir posten. Überall, wo eure Kunden gesehen werden wollen.',
    text: 'TikTok, YouTube Shorts, Instagram und Facebook, ausgespielt über ein ganzes Netzwerk an Accounts statt über einen einzigen Kanal. Ihr müsst nichts hochladen, nichts planen, nichts nachhalten.',
  },
  {
    icon: 'army',
    tag: 'Clipping-Armee',
    title: 'Eine ganze Armee statt eines einzelnen Editors.',
    text: 'Viele Clipper arbeiten parallel für denselben Kunden. Das Ergebnis ist Omnipräsenz: Euer Kunde taucht immer wieder im Feed auf, organisch, nicht als Werbeanzeige.',
  },
  {
    icon: 'star',
    tag: 'Influencer',
    title: 'Creator, die eure Clips auf ihre Kanäle bringen.',
    text: 'Auf Wunsch spielen ausgewählte Creator aus unserem Netzwerk die Clips zusätzlich auf ihren eigenen Profilen aus, mit echter Community und echtem Vertrauen.',
  },
  {
    icon: 'camera',
    tag: 'UGC',
    title: 'Noch kein Material? Dann produzieren wir es.',
    text: 'Authentischer User-Generated-Content von echten Creatorn: Produkt in der Hand, Erfahrung im Gesicht. Der Stoff, aus dem unsere Clipper anschließend die viralen Momente schneiden.',
  },
  {
    icon: 'chart',
    tag: 'Reporting',
    title: 'Ein Dashboard für jede Kampagne.',
    text: 'Clips, Kanäle und Ergebnisse jeder Kampagne an einem Ort, so habt ihr für jedes Kundengespräch die passenden Zahlen griffbereit, ohne sie selbst zusammensuchen zu müssen.',
  },
]

const serviceCards = (): string =>
  SERVICES.map(
    (s, i) => `
      <article class="cpath rv"${i % 3 ? ` data-rv-delay="${(i % 3) * 70}"` : ''}>
        <span class="cpath__ic">${ICONS[s.icon]}</span>
        <span class="cpath__tag">${esc(s.tag)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.text)}</p>
      </article>`,
  ).join('')

/** Häufige Fragen — reiner Text, wird beim Rendern escaped. Bewusst ohne Zahlen. */
const FAQ: readonly (readonly [question: string, answer: string])[] = [
  [
    'Was genau übernimmt NIKKI MEDIA für unsere Agentur?',
    'Alles, was zwischen Rohmaterial und Reichweite liegt: Schnitt, Untertitel, Hooks, Upload und Verbreitung über unser Netzwerk aus Clippern und Creatorn. Ihr bringt den Kunden und das Material, oder lasst das Material von uns produzieren. Wir liefern die Clips und die Sichtbarkeit.',
  ],
  [
    'Treten wir gegenüber unseren Kunden als NIKKI MEDIA in Erscheinung?',
    'Nur, wenn ihr das wollt. Wir arbeiten auf Wunsch komplett im Hintergrund: Die Kundenbeziehung bleibt bei euch, die Ergebnisse präsentiert ihr unter eurem Namen.',
  ],
  [
    'Was ist ein Cooperation-Code?',
    'Ein persönlicher Zugangscode für ausgewählte Partner. Ihr bekommt ihn nach einem Erstgespräch mit unserem Team. Wer ihn im Formular einträgt, erhält nach dem Briefing sofort vollen Einblick in unser Collaboration-Dashboard, laufende Kampagnen, Creator und Clipper. Jeder Code gilt genau einmal.',
  ],
  [
    'Wir haben noch keinen Code, können wir uns trotzdem eintragen?',
    'Ja, unbedingt. Füllt das Formular einfach ohne Code aus und startet im Dashboard eure Kampagne. Unser Team meldet sich persönlich bei euch, bespricht die Zusammenarbeit und schaltet euren Zugang frei.',
  ],
  [
    'Was ist die Clipping-Armee?',
    'Statt eines einzelnen Editors arbeiten viele Clipper parallel für einen Kunden. Jeder schneidet eigene Clips und spielt sie über eigene Accounts aus. So entsteht Präsenz auf breiter Front, genau der Effekt, mit dem Creator und Unternehmen auf Social Media gerade überall auftauchen.',
  ],
  [
    'Unser Kunde hat noch kein Rohmaterial. Geht das trotzdem?',
    'Ja. Wählt im Formular „Noch keines“, dann produzieren wir das Material über unsere Creator und UGC-Produktion gleich mit. Aus diesem Material entstehen anschließend die Clips.',
  ],
  [
    'Für welche Plattformen arbeitet ihr?',
    'TikTok, YouTube Shorts, Instagram und Facebook. Im Formular wählt ihr, wo euer Kunde viral gehen soll, mehrere Plattformen auf einmal sind ausdrücklich erwünscht.',
  ],
  [
    'Wie wird abgerechnet?',
    'Individuell. Im Briefing nennt ihr, wie viele Views ihr anpeilt und welches Budget ihr dafür einplant. Darauf abgestimmt bekommt ihr ein Angebot, das zu euch und euren Kunden passt.',
  ],
  [
    'Wie schnell kann es losgehen?',
    'Sofort. Formular ausfüllen, Adresse mit dem Code aus unserer Willkommens-Mail bestätigen, Kampagne im Dashboard starten, den Rest besprechen wir persönlich mit euch.',
  ],
]

const faqItems = (): string =>
  FAQ.map(
    ([question, answer]) => `
      <details class="faq__i">
        <summary class="faq__q">${esc(question)}${FAQ_ICON}</summary>
        <div class="faq__a"><p>${esc(answer)}</p></div>
      </details>`,
  ).join('\n')

/* ---------------------------------------------------------------- Seite */

export const brandsLandingPage = (): string => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clipping für Agenturen und ihre Kunden | Nikki Media</title>
<meta name="description" content="Die Clipping-Agentur hinter eurer Agentur: Nikki Media schneidet, postet und verbreitet Kurzvideos für eure Kunden, im Hintergrund und nach euren Vorgaben.">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="https://nikkimedia.co/brands">
${geoHead('/brands')}

<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:url" content="https://nikkimedia.co/brands">
<meta property="og:title" content="Nikki Media für Agenturen">
<meta property="og:description" content="Eure Kunden gehen viral, wir liefern im Hintergrund. Schnitt, Upload und Reichweite über eine ganze Clipping-Armee.">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='15' font-weight='bold' fill='white' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">

${ldGraph(
  ORGANIZATION,
  clippingService('Clipping für Agenturen', 'Nikki Media liefert Agenturen Reichweite für ihre Kunden: Schnitt, Upload und Verbreitung von Kurzvideos über ein Netzwerk aus Clippern und Creatorn.', 'Agenturen'),
  breadcrumbs([{ name: 'Nikki Media', path: '/' }, { name: 'Für Agenturen', path: '/brands' }]),
)}
</head>
<body class="page-home theme-brands">

<!-- ══════════════════════════════════════════════════════════════════════
     NAV
     ══════════════════════════════════════════════════════════════════ -->
<header class="nav">
  <div class="wrap nav__inner">
    <a class="logo" href="/" aria-label="Nikki Media, Startseite">
      <span class="logo__mark" aria-hidden="true">NM</span>
      <span class="logo__text">NIKKI MEDIA<small>Für Agenturen</small></span>
    </a>

    <!-- Dasselbe Menü wie auf /, /clipper und /creator. -->
    <nav class="nav__links" aria-label="Hauptnavigation">
      <a href="/#case-studies">Case Studies</a>
      <a href="/clipper">Clipper werden</a>
      <a href="/creator">Creator werden</a>
      <a href="/brands" aria-current="page">Für Agenturen</a>
      <a href="/creator">Kampagne starten</a>
    </nav>

    <div class="nav__actions">
      <a class="btn btn--primary btn--sm" href="#stepper"><span>Kooperation anfragen</span></a>
      <a class="btn btn--ghost btn--sm nav__login" href="${esc(LOGIN_URL)}">Login</a>
      <button class="nav__burger" aria-label="Menü öffnen" aria-expanded="false" aria-controls="mobilemenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="nav__mobile" id="mobilemenu">
  <a href="/#case-studies">Case Studies</a>
  <a href="/clipper">Clipper werden</a>
  <a href="/creator">Creator werden</a>
  <a href="/brands" aria-current="page">Für Agenturen</a>
  <a href="/creator">Kampagne starten</a>
  <a href="${esc(LOGIN_URL)}">Login</a>
  <a class="btn btn--primary" href="#stepper">Kooperation anfragen</a>
</div>

<main>

<!-- ══════════════════════════════════════════════════════════════════════
     HERO
     ══════════════════════════════════════════════════════════════════ -->
<section class="hero">
  <div class="hero__glow" aria-hidden="true"></div>
  <div class="hero__grid-bg" aria-hidden="true"></div>
  <div class="hero__beam" aria-hidden="true"></div>

  <div class="wrap">

    <div class="hero__head rv">
      <span class="eyebrow">Für Agenturen aus allen Branchen · B2B</span>
      <h1 class="h-display">Eure Kunden gehen viral.<br><span class="grad">Wir liefern im Hintergrund.</span></h1>
      <p class="hero__claim">Leise im Hintergrund, laut im Feed.</p>
      <div class="hero__kicker">Clipping-Armee · Influencer · UGC</div>
    </div>

    <div class="hero__stage rv" data-rv-delay="90">
      <span class="hero__stage-halo" aria-hidden="true"></span>
      <span class="hero__stage-badge"><span class="hero__stage-badge-ic" aria-hidden="true">🤝</span>Kooperation für Agenturen</span>

      ${agencyStepper()}

      <p class="hero__note">
        ${TICK}
        Formular ausfüllen, Adresse per Code bestätigen, und im Collaboration-Dashboard eure erste Kampagne starten.
      </p>
    </div>

    <div class="hero__support rv" data-rv-delay="60">
      <p class="lead hero__lead">
        NIKKI MEDIA ist eure Clipping-Agentur, die hinter den Kulissen die Anfragen eurer Kunden
        für euch bearbeitet. Ihr bringt die Kunden und das Material, wir schneiden, posten und
        verbreiten die Clips über eine ganze Armee aus Clippern und Creatorn. Ihr baut euer
        Angebot aus, ohne ein einziges neues Teammitglied einzustellen.
      </p>

      <ul class="hero__usps">
        <li>${TICK} Eure Kundenbeziehung bleibt eure, wir arbeiten diskret im Hintergrund</li>
        <li>${TICK} Schnitt, Untertitel, Upload: fertige Kurzvideos im Hochformat</li>
        <li>${TICK} Clipping-Armee statt Einzelkämpfer: skaliert mit euren Kunden</li>
        <li>${TICK} Influencer und UGC auf Wunsch gleich mit dazu</li>
        <li>${TICK} Persönlicher Ansprechpartner aus dem DACH-Raum</li>
      </ul>
    </div>

  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     KAMPAGNEN-BEISPIELE
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--tight" style="padding-top:0">
  <div class="wrap">
    <p class="rv" style="text-align:center;font-size:.8rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-soft);margin-bottom:26px">
      Kampagnen, die gerade durch unser Netzwerk laufen
    </p>
  </div>
  <div class="clipwall rv" aria-label="Ausschnitt aus Kampagnen-Clips unseres Netzwerks">${clipwallRows()}
  </div>
  <div class="wrap">
    <p class="clipwall__note rv">
      Jede Kachel ist ein echter Beitrag aus einer Kampagne, genau so sehen die Clips aus, die wir für eure Kunden produzieren.
    </p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     DAS ANGEBOT
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="angebot">
  <div class="wrap">
    <div class="problem__layout">
      <div class="problem__copy rv">
        <span class="eyebrow">Das Angebot</span>
        <h2 class="h2" style="margin-top:18px">Ihr verkauft Reichweite. Wir produzieren sie.</h2>
        <p class="lead" style="margin-top:20px">
          Eure Kunden wollen auf TikTok, YouTube Shorts und Instagram viral werden, und das jeden
          Tag, nicht nur einmal im Monat. Dafür braucht es Masse, Tempo und ein Gespür für den
          Algorithmus. Genau das ist unser Handwerk.
        </p>
        <p class="lead">
          Als Clipping-Agentur übernehmen wir die Aufträge eurer Kunden komplett: Wir sichten das
          Rohmaterial, schneiden die stärksten Momente, produzieren sie in Masse und spielen die
          Clips über unser Clipping-Netzwerk aus. Ihr steuert, wir liefern, und euer Kunde sieht
          vor allem eines: Ergebnisse.
        </p>
        <div class="btn-row" style="margin-top:30px">
          <a class="btn btn--primary" href="#stepper">Kooperation anfragen</a>
        </div>
      </div>

      <div class="rv" data-rv-delay="100">
        <ol class="cflow cflow--dark">
          <li><b>Ihr bringt den Kunden</b><span>Kunde, Ziel und Material, oder nur den Kunden, wenn das Material erst entstehen soll.</span></li>
          <li><b>Wir schneiden und posten</b><span>Unsere Clipping-Armee macht daraus Kurzvideos und spielt sie auf allen gewünschten Plattformen aus.</span></li>
          <li><b>Ihr glänzt beim Kunden</b><span>Mehr Sichtbarkeit, mehr Reichweite, mehr Umsatz, mit eurem Namen auf dem Ergebnis.</span></li>
        </ol>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     LEISTUNGEN
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--surface" id="leistungen">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">Leistungen</span>
      <h2 class="h2">Alles, was zwischen Rohmaterial und Reichweite liegt.</h2>
      <p class="lead">Bucht einzelne Bausteine oder das volle Paket, für einen Kunden oder für euer ganzes Portfolio.</p>
    </div>

    <div class="cpaths cpaths--3">${serviceCards()}
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     WARUM AGENTUREN MIT UNS ARBEITEN
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="warum">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">Warum Agenturen mit uns arbeiten</span>
      <h2 class="h2">Neue Leistung im Portfolio. Ab morgen.</h2>
      <p class="lead">Clipping ist das Format der Stunde, und mit uns bietet ihr es an, ohne es selbst aufbauen zu müssen.</p>
    </div>

    <div class="cpaths">
      <article class="cpath rv">
        <span class="cpath__ic">${ICONS.handshake}</span>
        <span class="cpath__tag">Für Agenturen</span>
        <h3>Mehr Umsatz je Kunde, ohne mehr Personal.</h3>
        <p>Ihr erweitert euer Angebot um Clipping, Influencer und UGC, ohne Editoren zu suchen, einzuarbeiten und auszulasten.</p>
        <ul>
          <li>${TICK} Kein Recruiting, kein Onboarding, keine Leerlaufzeiten</li>
          <li>${TICK} Skaliert mit jedem neuen Kunden einfach mit</li>
          <li>${TICK} Auf Wunsch komplett unter eurem Namen</li>
        </ul>
      </article>

      <article class="cpath rv" data-rv-delay="80">
        <span class="cpath__ic">${ICONS.shield}</span>
        <span class="cpath__tag">Für eure Kunden</span>
        <h3>Omnipräsenz statt Werbebudget-Roulette.</h3>
        <p>Organische Reichweite über viele Accounts gleichzeitig, eure Kunden tauchen dort auf, wo ihre Zielgruppe jeden Tag scrollt.</p>
        <ul>
          <li>${TICK} Organisch statt Anzeige, und dadurch glaubwürdig</li>
          <li>${TICK} Ein Team für Schnitt, Upload und Verbreitung</li>
          <li>${TICK} Alle Clips und Ergebnisse in einem Dashboard</li>
        </ul>
      </article>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     COOPERATION-CODE — der exklusive Zugang
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="cooperation-code">
  <div class="wrap">
    <div class="problem__layout">
      <div class="problem__copy rv">
        <span class="eyebrow">Exklusiv für Partner</span>
        <h2 class="h2" style="margin-top:18px">Der Cooperation-Code öffnet alle Türen.</h2>
        <p class="lead" style="margin-top:20px">
          Unser Netzwerk ist unser wertvollstes Gut, deshalb zeigen wir es nicht jedem.
          Nach einem persönlichen Erstgespräch erhalten ausgewählte Partner einen
          Cooperation-Code.
        </p>
        <p class="lead">
          Mit diesem Code öffnet sich euer Collaboration-Dashboard vollständig: Einblick in
          laufende Kampagnen, direkter Zugriff auf unsere Creator und Clipper, Buchung mit
          einem Klick. Ohne Code meldet sich unser Team persönlich bei euch, und schaltet
          euch frei, sobald die Zusammenarbeit steht.
        </p>
        <div class="btn-row" style="margin-top:30px">
          <a class="btn btn--primary" href="#stepper">Jetzt eintragen</a>
        </div>
      </div>

      <div class="rv" data-rv-delay="100">
        <div class="coopcard" aria-hidden="true">
          <span class="coopcard__ic">${ICONS.key}</span>
          <span class="coopcard__label">Cooperation-Code</span>
          <span class="coopcard__code"><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i></span>
          <ul class="coopcard__list">
            <li>${TICK} Alle Kampagnen im Blick</li>
            <li>${TICK} Creator und Clipper direkt buchen</li>
            <li>${TICK} Clips ansehen und herunterladen</li>
            <li>${TICK} Eigenes Material hochladen</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     SO LÄUFT EINE KOOPERATION
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="ablauf">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">So läuft eine Kooperation</span>
      <h2 class="h2">Vom ersten Gespräch zur viralen Kampagne.</h2>
      <p class="lead">Kein langes Hin und Her, ihr wisst bei jedem Schritt, woran ihr seid.</p>
    </div>

    <ol class="cflow cflow--grid">
      <li><b>Formular ausfüllen</b><span>Plattformen, Nische, Kanäle und Material, damit wir wissen, für wen wir arbeiten.</span></li>
      <li><b>Adresse bestätigen</b><span>Code aus der Willkommens-Mail eingeben, euer Collaboration-Dashboard öffnet sich.</span></li>
      <li><b>Kampagne starten</b><span>Ziel, Budget und Umfang festlegen: Clipping-Armee, Influencer oder das volle Paket mit UGC.</span></li>
      <li><b>Clips gehen live</b><span>Wir schneiden, posten und verbreiten, ihr verfolgt alles im Dashboard und präsentiert die Ergebnisse.</span></li>
    </ol>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     GRÜNDER
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--surface" id="gruender">
  <div class="wrap">
    <div class="founder">
      <div class="founder__media rv">
        <div class="founder__frame">
          <img src="/img/jason-azarov.jpg" alt="Jason Azarov, Gründer von Nikki Media" width="800" height="880" loading="lazy" data-photo>
          <div class="founder__fallback" hidden>
            <span class="ini" aria-hidden="true">JA</span>
            <b>Jason Azarov</b>
            <small>Gründer &amp; Inhaber von Nikki Media</small>
          </div>
        </div>
        <div class="founder__badge">
          <span class="ic" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M5 8h14M5 16h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <span><b>DACH</b><small>Deutschland · Österreich · Schweiz</small></span>
        </div>
      </div>

      <div class="founder__copy rv" data-rv-delay="100">
        <span class="eyebrow">Der Gründer</span>
        <h2 class="h2">Ein Partner, kein Dienstleister von der Stange.</h2>
        <p>
          Hinter Nikki Media steht Jason Azarov. Er und sein Team bringen die Kunden von Agenturen
          mit den Clippern und Creatorn zusammen, die sie sichtbar machen, und arbeiten dabei Seite
          an Seite mit Agenturen aus allen Branchen im gesamten deutschsprachigen Raum.
        </p>
        <p>
          Jede Kooperation beginnt mit einem persönlichen Gespräch: Wir hören zu, verstehen eure
          Kunden und bauen gemeinsam ein Setup, das zu eurem Geschäftsmodell passt.
        </p>

        <blockquote class="founder__quote">
          „Agenturen kennen ihre Kunden am besten. Wir sorgen dafür, dass diese Kunden überall
          gesehen werden, leise im Hintergrund, laut im Feed.“
        </blockquote>

        <div class="founder__sign">
          <span><b>Jason Azarov</b><small>Gründer &amp; Inhaber, Nikki Media</small></span>
          <a class="btn btn--primary btn--sm" href="#stepper">Kooperation anfragen</a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     FAQ
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="faq">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">FAQ</span>
      <h2 class="h2">Häufige Fragen von Agenturen</h2>
      <p class="lead">Kooperation, Cooperation-Code, Abrechnung: alles Wichtige auf einen Blick.</p>
    </div>

    <div class="faq rv">${faqItems()}
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     FINALER CTA
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark finalcta">
  <div class="wrap">
    <div class="finalcta__box rv">
      <span class="eyebrow">Für Agenturen aus allen Branchen</span>
      <h2 class="h2">Lasst uns eure Kunden groß machen.</h2>
      <p class="lead">
        Tragt euch ein, startet eure erste Kampagne im Collaboration-Dashboard, und wir
        kümmern uns um alles, was danach kommt.
      </p>
      <div class="btn-row">
        <a class="btn btn--primary btn--lg" href="#stepper">Kooperation anfragen</a>
        <a class="btn btn--ghost btn--lg" href="#leistungen">Leistungen ansehen</a>
      </div>
      <p class="finalcta__mini">+43 676 5990071 · Persönlicher Ansprechpartner für jede Agentur</p>

      <div class="niches">
        <span class="niche">Marketing-Agenturen</span>
        <span class="niche">Social-Media-Agenturen</span>
        <span class="niche">Werbeagenturen</span>
        <span class="niche">Performance-Agenturen</span>
        <span class="niche">Content-Agenturen</span>
        <span class="niche">Clipping-Armee</span>
        <span class="niche">Influencer</span>
        <span class="niche">UGC</span>
      </div>
    </div>
  </div>
</section>

</main>

<!-- ══════════════════════════════════════════════════════════════════════
     FOOTER
     ══════════════════════════════════════════════════════════════════ -->
<footer class="footer">
  <div class="wrap">
    <div class="footer__top">
      <div>
        <a class="logo" href="/">
          <span class="logo__mark" aria-hidden="true">NM</span>
          <span class="logo__text">NIKKI MEDIA<small>Für Agenturen</small></span>
        </a>
        <p class="footer__about">
          Die Clipping-Agentur hinter eurer Agentur: Schnitt, Upload und Verbreitung von
          Kurzvideos für eure Kunden, über eine ganze Clipping-Armee, Influencer und UGC.
        </p>
      </div>

      <div>
        <h4>Auf dieser Seite</h4>
        <div class="footer__list">
          <a href="#angebot">Das Angebot</a>
          <a href="#leistungen">Leistungen</a>
          <a href="#cooperation-code">Cooperation-Code</a>
          <a href="#faq">FAQ</a>
          <a href="${esc(LOGIN_URL)}">Login</a>
        </div>
      </div>

      <div>
        <h4>Nikki Media</h4>
        <div class="footer__list">
          <a href="/">Für Kunden</a>
          <a href="/clipper">Clipper werden</a>
          <a href="/creator">Creator werden</a>
        </div>
      </div>

      <div>
        <h4>Kontakt</h4>
        <div class="footer__list">
          <a href="tel:+436765990071">Telefon: +43 676 5990071</a>
          <span>Jason Azarov · Gründer</span>
          <span>Deutschland · Österreich · Schweiz</span>
        </div>
      </div>
    </div>

    <div class="footer__bottom">
      <span>© <span data-year>2026</span> Nikki Media. Alle Rechte vorbehalten.</span>
      <nav aria-label="Rechtliches">
        <a href="/impressum">Impressum</a>
        <a href="/datenschutz">Datenschutz</a>
      </nav>
    </div>
  </div>
</footer>

<a class="cta-float" href="#stepper" aria-label="Kooperation anfragen">
  <span class="cta-float__in">
    <span class="cta-float__ic" aria-hidden="true">${ICONS.handshake}</span>
    <span>Kooperation anfragen</span>
    <span class="cta-float__ar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </span>
</a>

${agencyLoadscreen()}

<script type="application/json" id="stepper-config">${jsonScript(AGENCY_STEPPER_CONFIG)}</script>
<script src="/assets/site.js" defer></script>
<script src="/assets/stepper.js" defer></script>
</body>
</html>
`

/** Das Formular als Baustein: auch die neuen Landingpages (views/gold-pages.ts) nutzen genau dieses Markup. */
export const agencyStepper = (): string => `<div class="stepper" id="stepper">
        <form class="stepper__card" id="brandform" novalidate autocomplete="on">

          <div class="stepper__head">
            <div class="stepper__meta">
              <span data-step-label>Schritt 1 von 8 · Plattformen</span>
              <span class="stepper__dots" aria-hidden="true">
                <i class="is-on"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </span>
            </div>
            <div class="stepper__bar" role="progressbar" aria-valuemin="1" aria-valuemax="8" aria-valuenow="1" aria-label="Fortschritt">
              <i data-step-bar style="width:13%"></i>
            </div>
          </div>

          <!-- Schritt 1 — Plattformen (Mehrfachauswahl) -->
          <fieldset class="stepper__panel is-active" data-panel="1" data-require="platforms">
            <legend class="stepper__q">Auf welcher Plattform möchtest du viral gehen?</legend>
            <p class="stepper__hint">Mehrfachauswahl möglich: mindestens eine.</p>
            <div class="plat">${platformTiles()}
            </div>
          </fieldset>

          <!-- Schritt 2 — Kunden mit Interesse an Clipping (Ja / Nein) -->
          <fieldset class="stepper__panel" data-panel="2" data-require="clients" hidden>
            <legend class="stepper__q">Hast du einen Kunden oder mehrere, die sich für Clipping interessieren?</legend>
            <div class="opts">${radioOptions('clients', AGENCY_CLIENTS)}
            </div>
          </fieldset>

          <!-- Schritt 3 — Wer sich einträgt; „Sonstiges“ öffnet ein Textfeld -->
          <fieldset class="stepper__panel" data-panel="3" data-require="kind" hidden>
            <legend class="stepper__q">Was für eine Agentur seid ihr?</legend>
            <div class="opts">${radioOptions('kind', AGENCY_KINDS)}
            </div>
            <div class="fields" style="margin-top:14px">
              <label class="field field--wide" data-show-if="kind:sonstiges" hidden>
                <span class="field__l">Was für eine Agentur seid ihr? <i>*</i></span>
                <input type="text" name="kindOther" required minlength="2" maxlength="120" placeholder="z. B. Performance-, Werbe- oder Content-Agentur">
              </label>
            </div>
          </fieldset>

          <!-- Schritt 4 — Woher -->
          <fieldset class="stepper__panel" data-panel="4" data-require="source" hidden>
            <legend class="stepper__q">Wie bist du auf uns aufmerksam geworden?</legend>
            <div class="opts">${radioOptions('source', AGENCY_SOURCES)}
            </div>
          </fieldset>

          <!-- Schritt 5 — Nische: dieselbe Liste wie auf / und /creator -->
          <fieldset class="stepper__panel" data-panel="5" data-require="niche" hidden>
            <legend class="stepper__q">Für welche Nische werden die Clipping-Services gebraucht?</legend>
            <div class="opts opts--chips">${nicheChips()}
            </div>
          </fieldset>

          <!-- Schritt 6 — Social-Media-Kanäle, alle freiwillig -->
          <fieldset class="stepper__panel" data-panel="6" hidden>
            <legend class="stepper__q">Deine Social-Media-Kanäle</legend>
            <p class="stepper__hint">Alle Felder freiwillig: mit oder ohne @.</p>
            <div class="fields">${socialFields()}
            </div>
          </fieldset>

          <!-- Schritt 7 — Rohmaterial, dazu optional ein Link -->
          <fieldset class="stepper__panel" data-panel="7" data-require="footage" hidden>
            <legend class="stepper__q">Wie viel Rohmaterial hast du?</legend>
            <div class="opts">${radioOptions('footage', AGENCY_FOOTAGE)}
            </div>
            <div class="fields" style="margin-top:14px">
              <label class="field field--wide">
                <span class="field__l">Link zu deinem Rohmaterial <em>(optional)</em></span>
                <input type="url" name="footageLink" inputmode="url" autocomplete="url" maxlength="2000" placeholder="https://drive.google.com/…">
                <span class="field__hint">Google Drive, Dropbox, iCloud, OneDrive, WeTransfer … Wir hängen ihn an deine erste Kampagne.</span>
              </label>
            </div>
          </fieldset>

          <!-- Schritt 8 — Kontaktdaten, zuletzt der Cooperation-Code -->
          <fieldset class="stepper__panel" data-panel="8" hidden>
            <legend class="stepper__q">Wohin dürfen wir euren Zugang schicken?</legend>
            <div class="fields">
              <label class="field">
                <span class="field__l">Vor- und Nachname <i>*</i></span>
                <input type="text" name="fullName" required minlength="2" autocomplete="name" placeholder="Max Mustermann">
              </label>
              <label class="field">
                <span class="field__l">Firma <em>(optional)</em></span>
                <input type="text" name="company" autocomplete="organization" placeholder="Musteragentur GmbH">
              </label>
              <label class="field">
                <span class="field__l">E-Mail <i>*</i></span>
                <input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="max@agentur.de">
              </label>
              <div class="field field--wide">
                <span class="field__l" id="phone-label">Telefon <i>*</i></span>
                <div class="phonebox">
                  <select name="phoneDial" class="phonebox__dial" aria-label="Ländervorwahl" autocomplete="tel-country-code">
                    ${dialOptions(DEFAULT_DIAL, 'de')}
                  </select>
                  <input type="tel" name="phone" required autocomplete="tel-national" inputmode="numeric"
                         aria-labelledby="phone-label" pattern="[0-9 ]{4,}" maxlength="24" placeholder="170 1234567">
                </div>
                <span class="field__hint">Ohne führende 0: die Vorwahl steht links.</span>
              </div>
              <!-- Cooperation-Code: macht aus dem Eintrag einen WARMEN Lead. -->
              <label class="field field--wide field--coop">
                <span class="field__l">Cooperation-Code <em>(optional)</em></span>
                <input type="text" name="cooperationCode" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false"
                       placeholder="Für exklusive Kunden nach einem Erstgespräch">
              </label>
            </div>

            <div class="hp" aria-hidden="true">
              <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
            </div>

            <label class="check">
              <input type="checkbox" name="privacy" required>
              <span>Ich stimme der <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a> zu. <i>*</i></span>
            </label>
          </fieldset>

          <p class="stepper__err" data-error hidden role="alert"></p>

          <div class="stepper__nav">
            <button type="button" class="btn btn--ghost btn--sm" data-back hidden>Zurück</button>
            <button type="button" class="btn btn--primary" data-next disabled>Weiter</button>
            <button type="submit" class="btn btn--primary" data-submit hidden>Kooperation anfragen</button>
          </div>
        </form>
      </div>`

/** Ladeschirm nach dem Absenden, passend zu diesem Formular. */
export const agencyLoadscreen = (): string => `<div class="loadscreen" data-loadscreen hidden role="status" aria-live="polite">
  <div class="loadscreen__bg" aria-hidden="true"></div>
  <div class="loadscreen__in">
    <span class="loadscreen__mark" aria-hidden="true">
      <svg class="loadscreen__ring" viewBox="0 0 120 120">
        <circle class="loadscreen__ring-track" cx="60" cy="60" r="52"></circle>
        <circle class="loadscreen__ring-arc" cx="60" cy="60" r="52" data-loadscreen-arc></circle>
      </svg>
      <span class="loadscreen__pct" data-loadscreen-pct>0%</span>
    </span>

    <h2 class="loadscreen__title">Euer Collaboration-Dashboard wird eingerichtet</h2>
    <p class="loadscreen__sub" data-loadscreen-step>Wir richten euer Collaboration-Dashboard ein …</p>

    <div class="loadscreen__bar" aria-hidden="true"><i data-loadscreen-bar style="width:0%"></i></div>

    <span class="loadscreen__dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>
</div>`
