/* eslint-disable */
/**
 * Creator-Landingpage (/creator) — serverseitig gerendert, durchgehend Deutsch.
 *
 * Für Influencer und UGC-Creator, die Kampagnen SUCHEN (annehmen und damit
 * verdienen), Kampagnen HABEN (eigenes Material hochladen, Clipper machen
 * daraus Clips) — oder beides. Die Bausteine (Nav, Hero, Stepper, Ladeschirm,
 * Footer) sind dieselben wie auf der Kunden-Startseite (src/views/landing.ts)
 * und der Clipper-Seite (src/views/clipper.ts). `theme-creator` am <body>
 * schaltet den Akzent auf Pink, `page-home` hält die Navigation über dem
 * dunklen Hero hell.
 *
 * Der Stepper schickt an POST /api/creators. Seine Antwortmöglichkeiten kommen
 * aus domain.ts — aus denselben Listen, gegen die der Server prüft. Ein Wert,
 * der hier steht, wird dort also immer angenommen.
 *
 * Styles: /assets/site.css · Verhalten: /assets/site.js + /assets/stepper.js
 */
import { AURORA } from './aurora'
import { breadcrumbs, clippingService, geoHead, ldGraph, ORGANIZATION } from './seo'
import {
  CREATOR_AD_OPENNESS,
  CREATOR_FOLLOWERS,
  CREATOR_GOALS,
  CREATOR_PLATFORMS,
  CREATOR_VIEWS_30D,
  CREATOR_VIEWS_TOTAL,
  INDUSTRIES,
} from '../lib/domain'
import { DEFAULT_DIAL, dialOptions } from '../lib/phone'
import { AGENCY_SOURCES } from '../lib/agency'
import { esc, jsonScript } from './layout'

/** Anmeldung direkt ins Kampagnen-Dashboard. */
const LOGIN_URL = '/login?next=%2Fkampagnen'

/** „Wie bist du auf uns aufmerksam geworden?“: dieselbe Liste wie im Agentur-Formular (/brands). */
const sourceOptions = (): string =>
  AGENCY_SOURCES.map(
    (o) => `
              <label class="opt"><input type="radio" name="source" value="${esc(o.value)}"><span><b>${esc(o.label)}</b></span></label>`,
  ).join('')

/** Texte und Ziel des Steppers — das Verhalten steckt in /assets/stepper.js. */
const STEPPER_CONFIG = {
  endpoint: '/api/creators',
  redirect: '/kampagnen',
  titles: ['Ziel', 'Plattformen', 'Nische', 'Werbung', 'Follower', 'Views', 'Letzte 30 Tage', 'Woher', 'Handles', 'Kontakt'],
  stepLabel: 'Schritt {n} von {total} · {title}',
  submitText: 'Zum Kampagnen-Dashboard',
  sendingText: 'Einen Moment …',
  errors: {
    pick: 'Bitte triff zuerst eine Auswahl.',
    // Kommt in Schritt 9 (Handles) wie in Schritt 10 (Kontakt) — deshalb allgemein gehalten.
    contact: 'Bitte fülle alle Pflichtfelder aus, Handles, Name, E-Mail, Vorwahl und Telefonnummer, und stimme der Datenschutzerklärung zu.',
    link: 'Bitte gib einen vollständigen Link ein, der mit https:// beginnt, oder lass das Feld leer.',
    tooMany: 'Zu viele Anfragen von dieser Verbindung. Bitte versuche es später erneut.',
    generic: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
  },
  // Die letzte Stufe kündigt den Code an: Creator bestätigen ihre Adresse mit
  // dem Code aus der Willkommens-Mail, erst danach öffnet sich das Dashboard.
  loadTexts: [
    [0, 'Wir richten deinen Creator-Zugang ein …'],
    [30, 'Dein Kampagnen-Dashboard wird vorbereitet …'],
    [55, 'Deine Plattformen werden hinterlegt …'],
    [78, 'Wir schicken dir deinen Code …'],
    [99, 'Fast geschafft: dein Code ist unterwegs!'],
  ],
  loadStyle: 'percent',
}

/* ------------------------------------------------------------ Bausteine */

/** Eine Antwortmöglichkeit im Stepper, wie sie in domain.ts steht. */
interface Choice {
  value: string
  label: string
  subtitle?: string
}

/** Häkchen in einer gewählten Plattform-Kachel. */
const CHECK = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** Haken vor Listenpunkten. */
const TICK = `<span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`

/** Plus-Zeichen, das sich beim Aufklappen einer FAQ dreht. */
const FAQ_ICON = `<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`

/** Pfeil hinter Textlinks. */
const ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** Lupe — Karte „Kampagnen finden“. */
const ICON_FIND = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`

/** Pfeil nach oben in eine Ablage — Karte „Kampagnen hochladen“. */
const ICON_UPLOAD = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15v2.2A2.8 2.8 0 0 0 7.3 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`

/** Alle Plattformnamen als Fließtext: „Instagram, TikTok, … und LinkedIn“. */
const platformNames = (): string => {
  const names = CREATOR_PLATFORMS.map((p) => p.label)
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
}

/** Schritt 2: Mehrfachauswahl, eine Kachel je Plattform. */
const platformTiles = (): string =>
  CREATOR_PLATFORMS.map(
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

/** Einzelauswahl — stepper.js springt nach dem Klick von selbst weiter. */
const radioOptions = (name: string, choices: readonly Choice[]): string =>
  choices
    .map(
      (o) => `
              <label class="opt"><input type="radio" name="${esc(name)}" value="${esc(o.value)}"><span><b>${esc(o.label)}</b>${
                o.subtitle ? `<small>${esc(o.subtitle)}</small>` : ''
              }</span></label>`,
    )
    .join('')

/**
 * Schritt 3: die Nische — dieselbe Frage und dieselbe Liste wie im Stepper
 * der Kunden-Startseite (dort „Branche“).
 */
const nicheChips = (): string =>
  INDUSTRIES.map(
    (n) => `
              <label class="opt opt--chip"><input type="radio" name="niche" value="${esc(n)}"><span>${esc(n)}</span></label>`,
  ).join('')

/**
 * Schritt 8: je Plattform ein Handle-Feld. Sichtbar (und damit Pflicht und
 * Teil der Nutzlast) ist nur, was in Schritt 2 angehakt wurde — das regelt
 * `data-show-if` in stepper.js.
 */
const handleFields = (): string =>
  CREATOR_PLATFORMS.map(
    (p) => `
              <label class="field" data-show-if="platforms:${esc(p.value)}" hidden>
                <span class="field__l"><img src="/img/platforms/${esc(p.value)}.svg" alt="" width="16" height="16" loading="lazy" decoding="async">${esc(p.label)} <i>*</i></span>
                <input type="text" name="handle_${esc(p.value)}" required maxlength="100" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@deinname">
              </label>`,
  ).join('')

/** Kurzname je Instagram-Account für das Etikett auf der Kachel. */
const CLIP_ACCOUNTS = {
  caspianbluecaviar: 'Caspian Blue',
  dindrop7: 'DinDrop',
  levantine_istanbul: 'Levantine',
  max_tornow_business: 'Max Tornow',
  panperium: 'Panperium',
} as const

/** Ein Beitrag bei Instagram: Account, Art (`reel` oder `p` für Post) und ID. */
type Clip = readonly [account: keyof typeof CLIP_ACCOUNTS, kind: 'reel' | 'p', id: string]

/**
 * Kampagnen-Beispiele: echte Cover aus laufenden Kampagnen, zwei gegenläufige
 * Reihen. Die Bilder liegen unter /img/cases/<account>-<id>.jpg.
 */
const CLIPWALL: readonly { speed: number; reverse: boolean; clips: readonly Clip[] }[] = [
  {
    speed: 22,
    reverse: false,
    clips: [
      ['panperium', 'reel', 'DZfCoAoNLUi'],
      ['dindrop7', 'reel', 'DbLpapmA_Bw'],
      ['levantine_istanbul', 'reel', 'DEUXjpeIHPR'],
      ['caspianbluecaviar', 'reel', 'DMzr3__qHsw'],
      ['max_tornow_business', 'reel', 'C8pRTW6MinC'],
      ['dindrop7', 'reel', 'DPRDIqUiIeB'],
      ['panperium', 'p', 'DZurxhPjezN'],
      ['levantine_istanbul', 'reel', 'DUTFpaeiMZA'],
    ],
  },
  {
    speed: 18,
    reverse: true,
    clips: [
      ['caspianbluecaviar', 'reel', 'DKZ-ra1qDiR'],
      ['levantine_istanbul', 'reel', 'C9406cJIC_D'],
      ['dindrop7', 'reel', 'DbbJyZgIUjl'],
      ['max_tornow_business', 'reel', 'C_PxECKAj61'],
      ['panperium', 'reel', 'DZvEvMPNa15'],
      ['caspianbluecaviar', 'reel', 'DP_uoY6jFCU'],
      ['dindrop7', 'reel', 'DZlBQOrgilt'],
      ['max_tornow_business', 'reel', 'DCHhYijJK4b'],
    ],
  },
]

const clipCard = ([account, kind, id]: Clip): string => `
        <a class="clipwall__card" href="https://www.instagram.com/${esc(account)}/${kind}/${esc(id)}/" target="_blank" rel="noopener noreferrer">
          <img src="/img/cases/${esc(account)}-${esc(id)}.jpg" alt="${kind === 'p' ? 'Beitrag' : 'Clip'} von @${esc(account)}" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/${esc(account)}.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>${esc(CLIP_ACCOUNTS[account])}</span></span>
        </a>`

export const clipwallRows = (): string =>
  CLIPWALL.map(
    (row) => `
    <div class="clipwall__row${row.reverse ? ' clipwall__row--rev' : ''}">
      <div class="clipwall__track" data-speed="${row.speed}">${row.clips.map(clipCard).join('')}
      </div>
    </div>`,
  ).join('')

/** Illustration „Kampagne hochladen“: echte Cover, im Akzent eingefärbt. */
const FEED_TILES: readonly string[] = [
  'levantine_istanbul-Da2pgoToIw_',
  'dindrop7-DM-7GyZIkb0',
  'caspianbluecaviar-DQ4ga9SDEnj',
  'panperium-DbGw3_SCDud',
  'max_tornow_business-C1xEPryiQ4t',
  'dindrop7-DbbJyZgIUjl',
]

const feedTiles = (): string =>
  FEED_TILES.map(
    (file) => `
              <div class="tile tile--real"><img src="/img/cases/${esc(file)}.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE KAMPAGNE</span></div>`,
  ).join('')

/** Häufige Fragen — reiner Text, wird beim Rendern escaped. */
const FAQ: readonly (readonly [question: string, answer: string])[] = [
  [
    'Was ist eine Kampagne bei Nikki Media?',
    'Eine Kampagne ist ein Auftrag mit Material: Eine Marke oder ein Creator lädt Rohmaterial hoch oder hinterlegt einen Cloud-Link, daraus entstehen Kurzvideos für Social Media. Als Creator kannst du Kampagnen annehmen, eigene Kampagnen hochladen oder beides.',
  ],
  [
    'Wie verdiene ich mit Kampagnen Geld?',
    'NIKKI MEDIA ordnet dir passende Kampagnen direkt in dein Kampagnen-Dashboard zu. Dort holst du dir das Material, machst daraus deinen Content und lädst die fertigen Clips hoch. Wie du für eine Kampagne vergütet wirst, besprechen wir vor dem Start mit dir, du weißt also immer vorher, woran du bist.',
  ],
  [
    'Muss ich Werbung in meinen Content einbauen?',
    'Nein. Im Formular sagst du uns, wie offen du für Kundenanfragen als Werbung bist. Werbekampagnen ordnen wir dir nur zu, wenn du dafür offen bist, nichts landet ungefragt in deinem Content.',
  ],
  [
    'Wie viele Follower brauche ich?',
    'Es gibt keine feste Untergrenze. Deine Angaben zu Followern und Views helfen uns nur, dir passende Kampagnen zu zeigen, eintragen kannst du dich auch mit einer kleineren, engagierten Community.',
  ],
  [
    'Welche Plattformen kann ich angeben?',
    `${platformNames()}. Wähle im Formular alle Plattformen aus, auf denen du einen Account hast, und gib je Plattform deinen Handle an.`,
  ],
  [
    'Wie lade ich eine eigene Kampagne hoch?',
    'Im Dashboard unter „Meine Kampagnen“ legst du eine Kampagne an und lädst deine Videos direkt hoch, oder fügst einen Link zu Google Drive, Dropbox, iCloud, OneDrive oder WeTransfer ein. Sobald Material in der Kampagne liegt, sehen sie unsere Clipper, sie schneiden daraus kurze 9:16-Clips und bringen sie auf Instagram, TikTok, YouTube und Facebook.',
  ],
  [
    'Was kostet mich das?',
    'Die Anmeldung und dein Kampagnen-Dashboard sind kostenlos. Wenn du eigene Kampagnen hochlädst, besprechen wir die Konditionen persönlich mit dir.',
  ],
  [
    'Wie schnell kann ich loslegen?',
    'Sofort: Nach dem Formular bestätigst du deine E-Mail-Adresse mit dem Code aus unserer Willkommens-Mail, danach öffnet sich dein Kampagnen-Dashboard. Unser Team meldet sich zusätzlich zeitnah bei dir.',
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

export const creatorLandingPage = (): string => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Für Creator: Kampagnen finden &amp; Clips machen lassen | Nikki Media</title>
<meta name="description" content="Für Influencer und UGC-Creator im DACH-Raum: Kampagnen von Marken annehmen oder aus deinem eigenen Material Clips machen lassen, die Millionen erreichen.">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="https://nikkimedia.co/creator">
${geoHead('/creator')}

<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:url" content="https://nikkimedia.co/creator">
<meta property="og:title" content="Nikki Media für Creator | Kampagnen finden &amp; hochladen">
<meta property="og:description" content="Kampagnen annehmen und damit verdienen, oder eigenes Material hochladen und daraus Clips machen lassen. Für Influencer und UGC-Creator im DACH-Raum.">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='15' font-weight='bold' fill='white' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">

${ldGraph(
  ORGANIZATION,
  clippingService('Clipping für Creator', 'Creator lassen aus ihrem eigenen Material Clips schneiden und über das Netzwerk von Nikki Media verbreiten, oder verbreiten Kampagnen von Marken.', 'Creator und Influencer'),
  breadcrumbs([{ name: 'Nikki Media', path: '/' }, { name: 'Creator werden', path: '/creator' }]),
)}
</head>
<body class="page-home theme-creator">
${AURORA}

<!-- ══════════════════════════════════════════════════════════════════════
     NAV
     ══════════════════════════════════════════════════════════════════ -->
<header class="nav">
  <div class="wrap nav__inner">
    <a class="logo" href="/" aria-label="Nikki Media, Startseite">
      <span class="logo__mark" aria-hidden="true">NM</span>
      <span class="logo__text">NIKKI MEDIA<small>Für Creator</small></span>
    </a>

    <!-- Dasselbe Menü wie auf / und /clipper (siehe landing.ts). -->
    <nav class="nav__links" aria-label="Hauptnavigation">
      <a href="/#case-studies">Case Studies</a>
      <a href="/fachartikel">Fachartikel</a>
      <a href="/clipper">Clipper werden</a>
      <a href="/creator" aria-current="page">Creator werden</a>
      <a href="/brands">Für Agenturen</a>
      <a href="/creator">Kampagne starten</a>
    </nav>

    <div class="nav__actions">
      <a class="btn btn--primary btn--sm" href="#stepper"><span><span class="hide-xs">Kampagnen-</span>Zugang sichern</span></a>
      <a class="btn btn--ghost btn--sm nav__login" href="${esc(LOGIN_URL)}">Login</a>
      <button class="nav__burger" aria-label="Menü öffnen" aria-expanded="false" aria-controls="mobilemenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="nav__mobile" id="mobilemenu">
  <a href="/#case-studies">Case Studies</a>
  <a href="/fachartikel">Fachartikel</a>
  <a href="/clipper">Clipper werden</a>
  <a href="/creator" aria-current="page">Creator werden</a>
  <a href="/brands">Für Agenturen</a>
  <a href="/creator">Kampagne starten</a>
  <a href="${esc(LOGIN_URL)}">Login</a>
  <a class="btn btn--primary" href="#stepper">Kampagnen-Zugang sichern</a>
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
      <span class="eyebrow">Für Influencer &amp; UGC-Creator · Deutschland · Österreich · Schweiz</span>
      <h1 class="h-display">Kampagnen annehmen.<br><span class="grad">Oder eigene starten.</span></h1>
      <div class="hero__kicker">Kampagnen · Clips · Reichweite</div>
    </div>

    <!-- Bühne: das Formular ist der Mittelpunkt des Heros. Halo und Sockel
         liegen hinter der Karte und heben sie vom Hintergrund ab. -->
    <div class="hero__stage rv" data-rv-delay="90">
      <span class="hero__stage-halo" aria-hidden="true"></span>
      <span class="hero__stage-badge"><span class="hero__stage-badge-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="m3 8 3.5-4.5M10 8l3.5-4.5M17 8l3.5-4.5M3 8h18"/></svg></span>Kampagnen-Zugang für Creator</span>

      <div class="stepper" id="stepper">
        <form class="stepper__card" id="creatorform" novalidate autocomplete="on">

          <div class="stepper__head">
            <div class="stepper__meta">
              <span data-step-label>Schritt 1 von 10 · Ziel</span>
              <span class="stepper__dots" aria-hidden="true">
                <i class="is-on"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </span>
            </div>
            <div class="stepper__bar" role="progressbar" aria-valuemin="1" aria-valuemax="10" aria-valuenow="1" aria-label="Fortschritt">
              <i data-step-bar style="width:10%"></i>
            </div>
          </div>

          <!-- Schritt 1 — Ziel: Kampagnen suchen, haben oder beides -->
          <fieldset class="stepper__panel is-active" data-panel="1" data-require="goal">
            <legend class="stepper__q">Was möchtest du?</legend>
            <div class="opts">${radioOptions('goal', CREATOR_GOALS)}
            </div>
          </fieldset>

          <!-- Schritt 2 — Plattformen (Mehrfachauswahl) -->
          <fieldset class="stepper__panel" data-panel="2" data-require="platforms" hidden>
            <legend class="stepper__q">Auf welchen Plattformen hast du deine Accounts?</legend>
            <p class="stepper__hint">Mehrfachauswahl möglich: mindestens eine.</p>
            <div class="plat">${platformTiles()}
            </div>
          </fieldset>

          <!-- Schritt 3 — Nische: dieselbe Frage wie auf der Kunden-Startseite -->
          <fieldset class="stepper__panel" data-panel="3" data-require="niche" hidden>
            <legend class="stepper__q">In welcher Nische bist du tätig?</legend>
            <div class="opts opts--chips">${nicheChips()}
            </div>
          </fieldset>

          <!-- Schritt 4 — Offenheit für Werbung -->
          <fieldset class="stepper__panel" data-panel="4" data-require="openToAds" hidden>
            <legend class="stepper__q">Bist du offen, unsere Kundenanfragen in deinen Content als Werbung einzubauen?</legend>
            <div class="opts">${radioOptions('openToAds', CREATOR_AD_OPENNESS)}
            </div>
          </fieldset>

          <!-- Schritt 5 — Follower insgesamt -->
          <fieldset class="stepper__panel" data-panel="5" data-require="followers" hidden>
            <legend class="stepper__q">Wie viele Follower hast du insgesamt auf deinen Social-Media-Kanälen?</legend>
            <div class="opts">${radioOptions('followers', CREATOR_FOLLOWERS)}
            </div>
          </fieldset>

          <!-- Schritt 6 — Views allgemein -->
          <fieldset class="stepper__panel" data-panel="6" data-require="viewsTotal" hidden>
            <legend class="stepper__q">Wie viele Views hast du allgemein auf deinen Social-Media-Plattformen?</legend>
            <div class="opts">${radioOptions('viewsTotal', CREATOR_VIEWS_TOTAL)}
            </div>
          </fieldset>

          <!-- Schritt 7 — Views der letzten 30 Tage -->
          <fieldset class="stepper__panel" data-panel="7" data-require="views30d" hidden>
            <legend class="stepper__q">Wie viele Views hattest du in den letzten 30 Tagen?</legend>
            <div class="opts">${radioOptions('views30d', CREATOR_VIEWS_30D)}
            </div>
          </fieldset>

          <!-- Schritt 8 — Woher: dieselbe Frage und Liste wie auf /brands (AGENCY_SOURCES) -->
          <fieldset class="stepper__panel" data-panel="8" data-require="source" hidden>
            <legend class="stepper__q">Wie bist du auf uns aufmerksam geworden?</legend>
            <div class="opts">${sourceOptions()}
            </div>
          </fieldset>

          <!-- Schritt 9 — Handles: nur die Felder der in Schritt 2 gewählten
               Plattformen sind sichtbar und Pflicht. -->
          <fieldset class="stepper__panel" data-panel="9" hidden>
            <legend class="stepper__q">Gib deine Social-Media-Handles an, wir melden uns zeitnah bei dir.</legend>
            <p class="stepper__hint">Ein Feld je gewählter Plattform, mit oder ohne @.</p>
            <div class="fields">${handleFields()}
            </div>
          </fieldset>

          <!-- Schritt 10 — Kontaktdaten -->
          <fieldset class="stepper__panel" data-panel="10" hidden>
            <legend class="stepper__q">Wohin dürfen wir deinen Zugang schicken?</legend>
            <div class="fields">
              <label class="field">
                <span class="field__l">Vor- und Nachname <i>*</i></span>
                <input type="text" name="fullName" required minlength="2" autocomplete="name" placeholder="Max Mustermann">
              </label>
              <label class="field">
                <span class="field__l">E-Mail <i>*</i></span>
                <input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="max@beispiel.de">
              </label>
              <!--
                Telefon in ZWEI Feldern: links die Ländervorwahl, rechts die
                Nummer — wie auf der Kunden-Startseite. Nur so entsteht eine
                Nummer, die aus dem Admin-Bereich heraus direkt anrufbar ist.
              -->
              <div class="field field--wide">
                <span class="field__l" id="phone-label">Telefon <i>*</i></span>
                <div class="phonebox">
                  <select name="phoneDial" class="phonebox__dial" aria-label="Ländervorwahl" autocomplete="tel-country-code">
                    ${dialOptions(DEFAULT_DIAL, 'de')}
                  </select>
                  <!-- Nur Ziffern: inputmode="numeric" holt auf dem Handy den
                       Zifferblock, pattern greift bei der Browser-Prüfung,
                       stepper.js filtert Buchstaben schon beim Tippen weg. -->
                  <input type="tel" name="phone" required autocomplete="tel-national" inputmode="numeric"
                         aria-labelledby="phone-label" pattern="[0-9 ]{4,}" maxlength="24" placeholder="170 1234567">
                </div>
                <span class="field__hint">Ohne führende 0: die Vorwahl steht links.</span>
              </div>
              <!-- Nur für Creator mit eigenen Kampagnen: Wer sein Rohmaterial
                   in einem Cloud-Ordner liegen hat, gibt hier den Link an.
                   Daraus entsteht sofort die erste Kampagne. -->
              <label class="field field--wide" data-show-if="goal:haben,beides" hidden>
                <span class="field__l">Link zu deinem Rohmaterial <em>(optional)</em></span>
                <input type="url" name="cloudLink" inputmode="url" autocomplete="url" maxlength="2000" placeholder="https://drive.google.com/…">
                <span class="field__hint">Google Drive, Dropbox, iCloud, OneDrive, WeTransfer … Daraus wird direkt deine erste Kampagne. Dateien kannst du danach auch im Dashboard hochladen.</span>
              </label>
            </div>

            <!-- Honeypot: für Menschen unsichtbar, Bots füllen ihn aus. -->
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
            <button type="submit" class="btn btn--primary" data-submit hidden>Zum Kampagnen-Dashboard</button>
          </div>
        </form>
      </div>

      <p class="hero__note">
        ${TICK}
        Zwei Minuten Formular: Adresse mit dem Code aus der Willkommens-Mail bestätigen, und dein Kampagnen-Dashboard öffnet sich.
      </p>
    </div>

    <div class="hero__support rv" data-rv-delay="60">
      <p class="lead hero__lead">
        Nikki Media bringt Creator und Kampagnen zusammen: Nimm Kampagnen von Marken an und
        verdiene mit deinem Content, oder lade deine eigene Kampagne hoch, und unsere Clipper
        machen aus deinem Material Kurzvideos für Instagram, TikTok, YouTube &amp; Co.
        Oder beides, mit einem einzigen Zugang.
      </p>

      <ul class="hero__usps">
        <li>${TICK} Kampagnen von Marken: von NIKKI MEDIA direkt in dein Dashboard zugeordnet</li>
        <li>${TICK} Eigene Kampagnen hochladen: Clipper machen daraus Clips</li>
        <li>${TICK} Du entscheidest, welche Werbung zu deinem Content passt</li>
        <li>${TICK} Von Instagram bis LinkedIn, alle großen Plattformen</li>
        <li>${TICK} Persönlicher Ansprechpartner aus dem DACH-Raum</li>
      </ul>
    </div>

  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     KAMPAGNEN-BEISPIELE — echte Cover aus laufenden Kampagnen
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--tight" style="padding-top:0">
  <div class="wrap">
    <p class="rv" style="text-align:center;font-size:.8rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-soft);margin-bottom:26px">
      Kampagnen, die gerade durch unser Netzwerk laufen
    </p>
  </div>
  <div class="marquee rv">
    <div class="marquee__track" data-speed="48">
      <span class="chip"><i class="chip__ini chip__ini--photo"><img src="/img/avatars/caspianbluecaviar.jpg" alt="" loading="lazy" decoding="async" width="30" height="30">CB</i><b>Caspian Blue Caviar<small>Luxus-Delikatessen</small></b></span>
      <span class="chip"><i class="chip__ini chip__ini--photo"><img src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="30" height="30">DD</i><b>DinDrop<small>Creator-Brand</small></b></span>
      <span class="chip"><i class="chip__ini chip__ini--photo"><img src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="30" height="30">PP</i><b>Panperium<small>Luxury-Lifestyle</small></b></span>
      <span class="chip"><i class="chip__ini chip__ini--photo"><img src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="30" height="30">MT</i><b>Max Tornow<small>Business-Mentor</small></b></span>
      <span class="chip"><i class="chip__ini chip__ini--photo"><img src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="30" height="30">LV</i><b>Levantine Istanbul<small>Fire Cuisine Bar</small></b></span>
    </div>
  </div>

  <!-- Clip-Wall: jede Kachel verlinkt auf den Original-Beitrag bei Instagram. -->
  <div class="clipwall rv" aria-label="Ausschnitt aus Kampagnen-Clips unseres Netzwerks">${clipwallRows()}
  </div>

  <div class="wrap">
    <p class="clipwall__note rv">
      Jede Kachel ist ein echter Beitrag aus einer Kampagne, so sieht Content aus, der durch unser Netzwerk geht.
    </p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     ZWEI WEGE — Kampagnen finden oder Kampagnen hochladen
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--surface" id="zwei-wege">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">Zwei Wege, ein Kampagnen-Dashboard</span>
      <h2 class="h2">Kampagnen suchen, Kampagnen haben, oder beides.</h2>
      <p class="lead">Du entscheidest im ersten Schritt des Formulars, wofür du Nikki Media nutzt. Beides geht mit demselben Zugang.</p>
    </div>

    <div class="cpaths">
      <article class="cpath rv">
        <span class="cpath__ic">${ICON_FIND}</span>
        <span class="cpath__tag">Kampagnen finden</span>
        <h3>Du suchst Kampagnen?</h3>
        <p>Nimm Kampagnen von Marken an und verdiene mit dem, was du ohnehin am besten kannst: Content für deine Community.</p>
        <ul>
          <li>${TICK} NIKKI MEDIA ordnet dir passende Kampagnen zu</li>
          <li>${TICK} Material direkt im Dashboard herunterladen</li>
          <li>${TICK} Nur Kampagnen, die zu deinem Content passen</li>
        </ul>
        <div class="cpath__more">
          <a class="btn btn--ghost btn--sm" href="#kampagnen-finden">So verdienst du ${ARROW}</a>
        </div>
      </article>

      <article class="cpath rv" data-rv-delay="80">
        <span class="cpath__ic">${ICON_UPLOAD}</span>
        <span class="cpath__tag">Kampagnen hochladen</span>
        <h3>Du hast Kampagnen?</h3>
        <p>Lade dein Rohmaterial hoch, unsere Clipper machen daraus Kurzvideos und bringen deine Kampagne weit über deine eigene Community hinaus.</p>
        <ul>
          <li>${TICK} Videos hochladen oder Cloud-Link einfügen</li>
          <li>${TICK} Clipper schneiden daraus 9:16-Clips</li>
          <li>${TICK} Ausgespielt auf Instagram, TikTok, YouTube und Facebook</li>
        </ul>
        <div class="cpath__more">
          <a class="btn btn--ghost btn--sm" href="#kampagnen-hochladen">So wird dein Material zu Clips ${ARROW}</a>
        </div>
      </article>
    </div>

    <p class="cpaths__note rv">Oder beides: Kampagnen annehmen <b>und</b> eigene hochladen: alles in einem Kampagnen-Dashboard.</p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     KAMPAGNEN FINDEN — so verdienst du
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="kampagnen-finden">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">Kampagnen finden</span>
      <h2 class="h2">So verdienst du mit Kampagnen.</h2>
      <p class="lead">Marken bringen das Material, du bringst deine Reichweite. Im Kampagnen-Dashboard findest du alles an einem Ort.</p>
    </div>

    <div class="steps steps--3">
      <article class="step rv">
        <div class="step__n">01</div>
        <div class="step__meta">Kampagnen finden</div>
        <h3>Kampagne zugeordnet bekommen</h3>
        <p>NIKKI MEDIA ordnet dir eine passende Kampagne zu, mit Material, das du direkt verwenden kannst. Du bekommst eine E-Mail, sobald sie bereitsteht.</p>
      </article>

      <article class="step rv" data-rv-delay="80">
        <div class="step__n">02</div>
        <div class="step__meta">ein Klick</div>
        <h3>Material holen</h3>
        <p>Die Kampagne liegt in deinem Dashboard. Das Rohmaterial lädst du direkt dort herunter, kein Suchen in Mails und Chats.</p>
      </article>

      <article class="step rv" data-rv-delay="160">
        <div class="step__n">03</div>
        <div class="step__meta">Das Ergebnis</div>
        <h3>Posten &amp; verdienen</h3>
        <p>Du machst aus dem Material deinen Content und lädst die fertigen Clips im Dashboard hoch, veröffentlicht wird auf deinen Kanälen. Die Vergütung besprechen wir vor dem Start mit dir.</p>
      </article>
    </div>

    <div class="btn-row" style="margin-top:36px">
      <a class="btn btn--primary btn--lg" href="#stepper">Kampagnen-Zugang sichern</a>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     KAMPAGNEN HOCHLADEN — so wird dein Material zu Clips
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="kampagnen-hochladen">
  <div class="wrap">
    <div class="problem__layout">
      <div class="rv">
        <span class="eyebrow">Kampagnen hochladen</span>
        <h2 class="h2" style="margin-top:18px">So wird dein Material zu Clips.</h2>
        <p class="lead" style="margin-top:16px">
          Du hast mehr Material, als du je selbst posten kannst? Lade es als Kampagne hoch,
          unsere Clipper machen daraus Kurzvideos und spielen sie über ihre Accounts aus.
        </p>

        <ol class="cflow">
          <li><b>Kampagne anlegen &amp; Material hochladen</b><span>Unter „Meine Kampagnen“ Videos direkt hochladen oder einen Link zu Google Drive, Dropbox, iCloud, OneDrive oder WeTransfer einfügen.</span></li>
          <li><b>Clipper schneiden daraus Clips</b><span>Sobald Material in deiner Kampagne liegt, sehen sie unsere Clipper und machen daraus kurze 9:16-Clips.</span></li>
          <li><b>Deine Kampagne geht raus</b><span>Die Clips laufen auf Instagram, TikTok, YouTube und Facebook, und erreichen Menschen weit über deine Community hinaus.</span></li>
        </ol>

        <div class="btn-row" style="margin-top:30px">
          <a class="btn btn--primary" href="#stepper">Eigene Kampagne hochladen</a>
        </div>
      </div>

      <div class="rv" data-rv-delay="100">
        <div class="phone">
          <div class="phone__screen">
            <span class="phone__notch" aria-hidden="true"></span>
            <!-- Illustration: echte Clip-Cover aus laufenden Kampagnen, im
                 Akzent eingefärbt — hier stehen später deine Clips. -->
            <div class="feedgrid" aria-hidden="true">${feedTiles()}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     SO FUNKTIONIERT'S
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="so-funktionierts">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">So funktioniert's</span>
      <h2 class="h2">In drei Schritten zu deinem Kampagnen-Dashboard.</h2>
      <p class="lead">Kein Papierkram, kein Warten auf eine Freigabe, dein Zugang steht, sobald du deine Adresse bestätigt hast.</p>
    </div>

    <div class="steps steps--3">
      <article class="step rv">
        <div class="step__n">01</div>
        <div class="step__meta">2 Min · unverbindlich</div>
        <h3>Formular ausfüllen</h3>
        <p>Ziel, Plattformen, Reichweite und deine Handles, damit wir wissen, welche Kampagnen zu dir passen.</p>
        <div class="step__cta">
          <a class="btn btn--primary btn--sm" href="#stepper">Kampagnen-Zugang sichern</a>
        </div>
      </article>

      <article class="step rv" data-rv-delay="80">
        <div class="step__n">02</div>
        <div class="step__meta">ein Code per Mail</div>
        <h3>Adresse bestätigen</h3>
        <p>Du bekommst eine Willkommens-Mail mit deinem Code. Einmal eingeben, und deine E-Mail-Adresse ist bestätigt.</p>
      </article>

      <article class="step rv" data-rv-delay="160">
        <div class="step__n">03</div>
        <div class="step__meta">sofort</div>
        <h3>Loslegen</h3>
        <p>Dein Kampagnen-Dashboard öffnet sich: zugeordnete Kampagnen bearbeiten, eigene Kampagnen hochladen, oder beides.</p>
      </article>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     GRÜNDER — Jason Azarov

     ▸ Foto: /img/jason-azarov.jpg  (Porträt, mindestens 800×880 px)
       Fehlt die Datei, zeigt die Seite automatisch einen sauberen Platzhalter.
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="gruender">
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
        <h2 class="h2">Hinter Nikki Media steht Jason Azarov.</h2>
        <p>
          Jason und sein Team arbeiten mit Marken aus dem gesamten deutschsprachigen Raum,
          und bringen deren Kampagnen mit den Creatorn und Clippern zusammen, die sie
          sichtbar machen.
        </p>
        <p>
          Statt einer anonymen Plattform bekommst du bei uns einen persönlichen Ansprechpartner:
          Wir sagen dir ehrlich, welche Kampagnen zu deinem Content passen, und kümmern uns
          darum, dass dein eigenes Material in guten Händen ist.
        </p>

        <blockquote class="founder__quote">
          „Die stärksten Kampagnen entstehen dort, wo Marken und Creator zusammenpassen.
          Genau dafür haben wir den Creator-Bereich gebaut.“
        </blockquote>

        <div class="founder__sign">
          <span><b>Jason Azarov</b><small>Gründer &amp; Inhaber, Nikki Media</small></span>
          <a class="btn btn--primary btn--sm" href="#stepper">Kampagnen-Zugang sichern</a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     FAQ
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--surface" id="faq">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">FAQ</span>
      <h2 class="h2">Häufige Fragen</h2>
      <p class="lead">Alles Wichtige zu Kampagnen, Vergütung und deinem Zugang, auf einen Blick.</p>
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
      <span class="eyebrow">Für Influencer &amp; UGC-Creator</span>
      <h2 class="h2">Deine nächste Kampagne wartet schon.</h2>
      <p class="lead">
        Ob du Kampagnen suchst, eigene Kampagnen hast oder beides: Trag dich in zwei Minuten
        ein, bestätige deine Adresse mit dem Code aus der Willkommens-Mail, und dein
        Kampagnen-Dashboard steht bereit.
      </p>
      <div class="btn-row">
        <a class="btn btn--primary btn--lg" href="#stepper">Kampagnen-Zugang sichern</a>
        <a class="btn btn--ghost btn--lg" href="#zwei-wege">Beide Wege ansehen</a>
      </div>
      <p class="finalcta__mini">+43 676 5990071 · Antwort meist innerhalb weniger Stunden</p>

      <div class="niches">
        <span class="niche">Influencer</span>
        <span class="niche">UGC-Creator</span>
        <span class="niche">Streamer</span>
        <span class="niche">Podcaster</span>
        <span class="niche">Personal Brands</span>
        <span class="niche">Musiker &amp; Künstler</span>
        <span class="niche">Kampagnen annehmen</span>
        <span class="niche">Eigene Kampagnen hochladen</span>
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
          <span class="logo__text">NIKKI MEDIA<small>Für Creator</small></span>
        </a>
        <p class="footer__about">
          Nikki Media bringt Creator und Kampagnen zusammen: Kampagnen von Marken annehmen
          und damit verdienen, oder eigenes Material hochladen und daraus Clips machen lassen.
        </p>
      </div>

      <div>
        <h4>Auf dieser Seite</h4>
        <div class="footer__list">
          <a href="#kampagnen-finden">Kampagnen finden</a>
          <a href="#kampagnen-hochladen">Kampagnen hochladen</a>
          <a href="#so-funktionierts">So funktioniert's</a>
          <a href="#faq">FAQ</a>
          <a href="${esc(LOGIN_URL)}">Login</a>
        </div>
      </div>

      <div>
        <h4>Nikki Media</h4>
        <div class="footer__list">
          <a href="/">Für Marken</a>
          <a href="/clipper">Clipper werden</a>
          <a href="/brands">Für Agenturen</a>
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

<a class="cta-float" href="#stepper" aria-label="Kampagnen-Zugang sichern">
  <span class="cta-float__in">
    <span class="cta-float__ic" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15v2.2A2.8 2.8 0 0 0 7.3 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
    </span>
    <span>Kampagnen-Zugang sichern</span>
    <span class="cta-float__ar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </span>
</a>

<!-- ==========================================================================
     Ladeschirm nach dem Absenden des Formulars

     Liegt bewusst als letztes Element direkt im Body und nicht im Hero: ein
     fixiertes Element würde innerhalb des Heros an dessen Transform hängen und
     dann nur einen Ausschnitt abdecken. Das große Feld zeigt Prozent
     (loadStyle: 'percent'), deshalb steht dort anfangs 0 %.
     ========================================================================== -->
<div class="loadscreen" data-loadscreen hidden role="status" aria-live="polite">
  <div class="loadscreen__bg" aria-hidden="true"></div>
  <div class="loadscreen__in">
    <span class="loadscreen__mark" aria-hidden="true">
      <svg class="loadscreen__ring" viewBox="0 0 120 120">
        <circle class="loadscreen__ring-track" cx="60" cy="60" r="52"></circle>
        <circle class="loadscreen__ring-arc" cx="60" cy="60" r="52" data-loadscreen-arc></circle>
      </svg>
      <span class="loadscreen__pct" data-loadscreen-pct>0%</span>
    </span>

    <h2 class="loadscreen__title">Dein Kampagnen-Dashboard wird eingerichtet</h2>
    <p class="loadscreen__sub" data-loadscreen-step>Wir richten deinen Creator-Zugang ein …</p>

    <div class="loadscreen__bar" aria-hidden="true"><i data-loadscreen-bar style="width:0%"></i></div>

    <span class="loadscreen__dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>
</div>

<script type="application/json" id="stepper-config">${jsonScript(STEPPER_CONFIG)}</script>
<script src="/assets/site.js" defer></script>
<script src="/assets/stepper.js" defer></script>
</body>
</html>
`
