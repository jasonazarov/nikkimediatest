/* eslint-disable */
/**
 * Clipper-Landingpage (/clipper) — serverseitig gerendert, durchgehend Deutsch
 * (Du-Form wie auf den übrigen Landingpages).
 *
 * Inhalt aus dem gelieferten Clipper-Funnel; die Bausteine (Nav, Hero,
 * Stepper, Ladeschirm, Footer) sind dieselben wie auf der Kunden-Startseite
 * (src/views/landing.ts). `theme-clipper` am <body> schaltet den Akzent auf
 * Violett, `page-home` hält die Navigation über dem dunklen Hero hell.
 *
 * Der Stepper schickt an POST /api/clippers. Seine Antwortmöglichkeiten kommen
 * aus domain.ts — aus denselben Listen, gegen die der Server prüft. Ein Wert,
 * der hier steht, wird dort also immer angenommen. Angezeigt werden deren
 * deutsche Texte (`labelDe`/`subtitleDe`); `label` bleibt Englisch für den
 * Admin-Bereich.
 *
 * Styles: /assets/site.css · Verhalten: /assets/site.js + /assets/stepper.js
 */
import { breadcrumbs, clippingService, geoHead, ldGraph, ORGANIZATION } from './seo'
import { CLIPPER_AVAILABILITY, CLIPPER_EXPERIENCE, CLIPPER_WORK_STATUS, PLATFORMS } from '../lib/domain'
import { DEFAULT_DIAL, dialOptions } from '../lib/phone'
import { esc, jsonScript } from './layout'

/** Anmeldung direkt in den Clipper-Bereich (ohne `lang=en` — also Deutsch). */
const LOGIN_URL = '/login?next=%2Fwork'

/** Texte und Ziel des Steppers — das Verhalten steckt in /assets/stepper.js. */
const STEPPER_CONFIG = {
  endpoint: '/api/clippers',
  redirect: '/work',
  titles: ['Plattformen', 'Arbeitssituation', 'Erfahrung', 'Verfügbarkeit', 'Kontakt'],
  stepLabel: 'Schritt {n} von {total} · {title}',
  submitText: 'Jetzt als Clipper starten',
  sendingText: 'Einen Moment …',
  errors: {
    pick: 'Bitte triff zuerst eine Auswahl.',
    contact: 'Bitte fülle Name, E-Mail, Vorwahl und Telefonnummer aus und stimme der Datenschutzerklärung zu.',
    link: 'Bitte gib einen vollständigen Link ein, der mit https:// beginnt, oder lass das Feld leer.',
    tooMany: 'Zu viele Anfragen von dieser Verbindung. Bitte versuche es später erneut.',
    generic: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
  },
  loadTexts: [
    [0, 'Wir richten deinen Clipper-Zugang ein …'],
    [30, 'Dein Dashboard wird vorbereitet …'],
    [55, 'Wir schicken dir deinen Login-Code …'],
    [78, 'Letzter Feinschliff …'],
    [99, 'Schau in dein Postfach, dein Code ist unterwegs!'],
  ],
  loadStyle: 'countdown',
}

/* ------------------------------------------------------------ Bausteine */

/** Eine Antwortmöglichkeit im Stepper, wie sie in domain.ts steht — mit ihrem deutschen Text. */
interface Choice {
  value: string
  labelDe: string
  subtitleDe?: string
}

/** Häkchen in einer gewählten Plattform-Kachel. */
const CHECK = `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** Haken vor Listenpunkten im Hero. */
const TICK = `<span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`

/** Plus-Zeichen, das sich beim Aufklappen einer FAQ dreht. */
const FAQ_ICON = `<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`

/** Schritt 1: Mehrfachauswahl, eine Kachel je Plattform. */
const platformTiles = (): string =>
  PLATFORMS.map(
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

/** Schritte 2–4: Einzelauswahl — stepper.js springt nach dem Klick von selbst weiter. */
const radioOptions = (name: string, choices: readonly Choice[]): string =>
  choices
    .map(
      (o) => `
              <label class="opt"><input type="radio" name="${name}" value="${esc(o.value)}"><span><b>${esc(o.labelDe)}</b>${
                o.subtitleDe ? `<small>${esc(o.subtitleDe)}</small>` : ''
              }</span></label>`,
    )
    .join('')

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
 * Clip-Wall: echte Cover aus den laufenden Kampagnen, zwei gegenläufige
 * Reihen. Aus jedem Eintrag entstehen Link, Cover und Etikett — die Bilder
 * liegen unter /img/cases/<account>-<id>.jpg.
 */
const CLIPWALL: readonly { speed: number; reverse: boolean; clips: readonly Clip[] }[] = [
  {
    speed: 23,
    reverse: false,
    clips: [
      ['dindrop7', 'reel', 'DM-7GyZIkb0'],
      ['levantine_istanbul', 'reel', 'Da2pgoToIw_'],
      ['caspianbluecaviar', 'reel', 'DQ4ga9SDEnj'],
      ['max_tornow_business', 'reel', 'C1xEPryiQ4t'],
      ['panperium', 'p', 'DZurxhPjezN'],
      ['levantine_istanbul', 'reel', 'DUTFpaeiMZA'],
      ['dindrop7', 'reel', 'DPRDIqUiIeB'],
      ['caspianbluecaviar', 'reel', 'DMzr3__qHsw'],
      ['panperium', 'reel', 'DZfCoAoNLUi'],
      ['levantine_istanbul', 'reel', 'DEUXjpeIHPR'],
      ['dindrop7', 'reel', 'DbLpapmA_Bw'],
    ],
  },
  {
    speed: 19,
    reverse: true,
    clips: [
      ['caspianbluecaviar', 'reel', 'DKZ-ra1qDiR'],
      ['panperium', 'p', 'DZF78B8je1g'],
      ['levantine_istanbul', 'reel', 'DBQxgMHAw1U'],
      ['dindrop7', 'reel', 'DbbJyZgIUjl'],
      ['max_tornow_business', 'reel', 'C8pRTW6MinC'],
      ['panperium', 'reel', 'DZvEvMPNa15'],
      ['levantine_istanbul', 'reel', 'C9406cJIC_D'],
      ['dindrop7', 'reel', 'DZlBQOrgilt'],
      ['max_tornow_business', 'reel', 'C_PxECKAj61'],
      ['panperium', 'p', 'DbGw3_SCDud'],
      ['max_tornow_business', 'reel', 'DCHhYijJK4b'],
    ],
  },
]

const clipCard = ([account, kind, id]: Clip): string => `
        <a class="clipwall__card" href="https://www.instagram.com/${esc(account)}/${kind}/${esc(id)}/" target="_blank" rel="noopener noreferrer">
          <img src="/img/cases/${esc(account)}-${esc(id)}.jpg" alt="${kind === 'p' ? 'Post' : 'Clip'} von @${esc(account)}" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/${esc(account)}.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>${esc(CLIP_ACCOUNTS[account])}</span></span>
        </a>`

const clipwallRows = (): string =>
  CLIPWALL.map(
    (row) => `
    <div class="clipwall__row${row.reverse ? ' clipwall__row--rev' : ''}">
      <div class="clipwall__track" data-speed="${row.speed}">${row.clips.map(clipCard).join('')}
      </div>
    </div>`,
  ).join('')

/** Häufige Fragen — reiner Text, wird beim Rendern escaped. */
const FAQ: readonly (readonly [question: string, answer: string])[] = [
  [
    'Brauche ich Erfahrung, um Clipper zu werden?',
    'Nein. Wenn du ein Video anschauen und posten kannst, kannst du sofort loslegen. Alles andere zeigt dir unser Team Schritt für Schritt.',
  ],
  [
    'Wie viel kann ich als Clipper verdienen?',
    'Du wirst pro 1.000 Views bezahlt, wie viel es am Ende genau ist, hängt davon ab, wie viele Videos du postest und wie viel Zeit du investierst. Die Zahlen gehen wir beim Onboarding gemeinsam mit dir durch.',
  ],
  [
    'Wie und wann werde ich bezahlt?',
    'Deinen Satz legen wir beim Onboarding gemeinsam fest. Ausgezahlt wird nach den Views, die du tatsächlich erreichst, völlig transparent in deinem eigenen Dashboard.',
  ],
  [
    'Brauche ich eigene Follower oder einen eigenen Account?',
    'Nein. Du bekommst Zugang zu Videomaterial und Accounts aus unserem Netzwerk, eigene Reichweite oder eigenes Material musst du nicht mitbringen.',
  ],
  [
    'Auf welchen Plattformen arbeite ich?',
    'Instagram, TikTok, YouTube und Facebook, im Anmeldeformular wählst du die Plattformen aus, auf denen du schon aktiv bist.',
  ],
  [
    'Wie viel Zeit muss ich investieren?',
    'Das entscheidest ganz allein du, ob ein paar Stunden oder mehr als 20 Stunden pro Woche, du bestimmst das Tempo. Mehr Zeit bedeutet meist auch höhere Auszahlungen.',
  ],
  [
    'Ist das ein Nebenjob, oder kann ich davon leben?',
    'Beides ist möglich. Ob Vollzeit, Teilzeit oder als Zusatzverdienst, während du einen Job suchst, genau das fragt das Anmeldeformular ab, damit wir dir die passenden Projekte zuordnen können.',
  ],
  [
    'Brauche ich eigenes Equipment oder eigene Software?',
    'Nein, für den Start reicht ein Smartphone. Wenn du schon Erfahrung im Videoschnitt hast, kannst du zusätzlich besser bezahlte Projekte übernehmen.',
  ],
  [
    'Wie schnell kann ich anfangen?',
    'Dein Dashboard steht direkt nach der Anmeldung bereit, und unser Team meldet sich meist noch am selben Tag. Nach einem kurzen Onboarding legst du mit deinen ersten Videos los.',
  ],
  [
    'Wie läuft die Anmeldung ab?',
    'In drei Schritten: Formular oben ausfüllen (2 Minuten) → Onboarding mit unserem Team → erste Videos anschauen, posten und verdienen.',
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

export const clipperLandingPage = (): string => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clipper werden: bezahlt pro 1.000 Views | Nikki Media</title>
<meta name="description" content="Werde Clipper bei Nikki Media: Schneide kurze Videos, poste sie auf TikTok, Instagram, YouTube und Facebook und verdiene pro 1.000 Views. Ohne Erfahrung.">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="https://nikkimedia.co/clipper">
${geoHead('/clipper')}

<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:url" content="https://nikkimedia.co/clipper">
<meta property="og:title" content="Nikki Media | Clipper werden">
<meta property="og:description" content="Bezahlt pro 1.000 Views: Schneide kurze Videos und poste sie auf Instagram, TikTok, YouTube und Facebook. Keine Erfahrung nötig.">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='15' font-weight='bold' fill='white' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">

${ldGraph(
  ORGANIZATION,
  breadcrumbs([{ name: 'Nikki Media', path: '/' }, { name: 'Clipper werden', path: '/clipper' }]),
)}
</head>
<body class="page-home theme-clipper">

<!-- ══════════════════════════════════════════════════════════════════════
     NAV
     ══════════════════════════════════════════════════════════════════ -->
<header class="nav">
  <div class="wrap nav__inner">
    <a class="logo" href="/" aria-label="Nikki Media, Startseite">
      <span class="logo__mark" aria-hidden="true">NM</span>
      <span class="logo__text">NIKKI MEDIA<small>Clipper-Netzwerk</small></span>
    </a>

    <!-- Dasselbe Menü wie auf / und /creator (siehe landing.ts). -->
    <nav class="nav__links" aria-label="Hauptnavigation">
      <a href="/#case-studies">Case Studies</a>
      <a href="/clipper" aria-current="page">Clipper werden</a>
      <a href="/creator">Creator werden</a>
      <a href="/brands">Für Agenturen</a>
      <a href="/creator">Kampagne starten</a>
    </nav>

    <div class="nav__actions">
      <a class="btn btn--ghost btn--sm" href="#ablauf">Wie es funktioniert</a>
      <a class="btn btn--primary btn--sm" href="#stepper">Jetzt starten</a>
      <a class="btn btn--ghost btn--sm nav__login" href="${esc(LOGIN_URL)}">Login</a>
      <button class="nav__burger" aria-label="Menü öffnen" aria-expanded="false" aria-controls="mobilemenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="nav__mobile" id="mobilemenu">
  <a href="/#case-studies">Case Studies</a>
  <a href="/clipper" aria-current="page">Clipper werden</a>
  <a href="/creator">Creator werden</a>
  <a href="/brands">Für Agenturen</a>
  <a href="/creator">Kampagne starten</a>
  <a href="${esc(LOGIN_URL)}">Login</a>
  <a class="btn btn--primary" href="#stepper">Jetzt als Clipper starten</a>
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
      <span class="eyebrow"><span>Clipper-Netzwerk · <span class="only-wide">Deutschland · Österreich · Schweiz</span><span class="only-sm">DACH-Raum</span></span></span>
      <h1 class="h-display">Nikki Media bezahlt Clipper<br class="br-wide"> fürs <span class="grad">Anschauen und Posten</span>.</h1>
      <div class="hero__kicker"><span class="kicker__txt"><span>Keine Erfahrung nötig</span><i aria-hidden="true">·</i><span>Flexibel</span><i aria-hidden="true">·</i><span>Bezahlt pro 1.000 Views</span></span></div>
    </div>

    <!-- Bühne: das Formular ist der Mittelpunkt des Heros. Halo und Sockel
         liegen hinter der Karte und heben sie vom Hintergrund ab. -->
    <div class="hero__stage rv" data-rv-delay="90">
      <span class="hero__stage-halo" aria-hidden="true"></span>
      <span class="hero__stage-badge"><span class="hero__stage-badge-ic" aria-hidden="true">📤</span>Als Clipper Geld verdienen</span>

      <div class="stepper" id="stepper">
        <form class="stepper__card" id="clipperform" novalidate autocomplete="on">

          <div class="stepper__head">
            <div class="stepper__meta">
              <span data-step-label>Schritt 1 von 5 · Plattformen</span>
              <span class="stepper__dots" aria-hidden="true">
                <i class="is-on"></i><i></i><i></i><i></i><i></i>
              </span>
            </div>
            <div class="stepper__bar" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="1" aria-label="Fortschritt">
              <i data-step-bar style="width:20%"></i>
            </div>
          </div>

          <!-- Schritt 1 — Plattformen (Mehrfachauswahl) -->
          <fieldset class="stepper__panel is-active" data-panel="1" data-require="platforms">
            <legend class="stepper__q">Auf welchen Plattformen bist du schon aktiv?</legend>
            <p class="stepper__hint">Wähl so viele, wie du möchtest, mindestens eine.</p>
            <div class="plat">${platformTiles()}
            </div>
          </fieldset>

          <!-- Schritt 2 — Arbeitsstatus -->
          <fieldset class="stepper__panel" data-panel="2" data-require="workStatus" hidden>
            <legend class="stepper__q">Wie sieht deine aktuelle Arbeitssituation aus?</legend>
            <div class="opts">${radioOptions('workStatus', CLIPPER_WORK_STATUS)}
            </div>
          </fieldset>

          <!-- Schritt 3 — Erfahrung mit Video-Schnitt -->
          <fieldset class="stepper__panel" data-panel="3" data-require="experience" hidden>
            <legend class="stepper__q">Hast du schon Erfahrung mit Videoschnitt?</legend>
            <div class="opts">${radioOptions('experience', CLIPPER_EXPERIENCE)}
            </div>
          </fieldset>

          <!-- Schritt 4 — wöchentliche Verfügbarkeit -->
          <fieldset class="stepper__panel" data-panel="4" data-require="availability" hidden>
            <legend class="stepper__q">Wie viel Zeit kannst du pro Woche investieren?</legend>
            <div class="opts">${radioOptions('availability', CLIPPER_AVAILABILITY)}
            </div>
          </fieldset>

          <!-- Schritt 5 — Kontaktdaten -->
          <fieldset class="stepper__panel" data-panel="5" hidden>
            <legend class="stepper__q">Wohin sollen wir deinen Zugang schicken?</legend>
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
            <button type="submit" class="btn btn--primary" data-submit hidden>Jetzt als Clipper starten</button>
          </div>
        </form>
      </div>

      <p class="hero__note">
        ${TICK}
        Zwei Minuten fürs Formular, bestätige deine E-Mail-Adresse mit dem Code, den wir dir schicken, und dein Dashboard öffnet sich.
      </p>
    </div>

    <div class="hero__support rv" data-rv-delay="60">
      <p class="lead hero__lead">
        Werde Teil unseres Clipper-Netzwerks: Du bekommst fertiges Videomaterial, schaust es dir an,
        postest es auf Instagram, TikTok, YouTube oder Facebook, und wirst pro 1.000 Views bezahlt.
        Keine Erfahrung, kein eigenes Equipment, kein Risiko.
      </p>

      <ul class="hero__usps">
        <li>${TICK} Fester Satz pro 1.000 Views, vorab vereinbart</li>
        <li>${TICK} Keine Erfahrung nötig: unser Team arbeitet dich ein</li>
        <li>${TICK} Videomaterial wird gestellt: du musst nie selbst etwas filmen</li>
        <li>${TICK} Flexibel: arbeite, wann und so viel du willst</li>
        <li>${TICK} Teil eines riesigen, aktiven Netzwerks mit echten, etablierten Kunden</li>
      </ul>
    </div>

    <!-- Live-Leiste: ein flaches Band unter der Bühne — es nimmt dem
         Formular keine Breite. -->
    <div class="livebar rv" data-rv-delay="120">
      <div class="livebar__now">
        <div class="livebar__top">
          <span class="live-dot"><i aria-hidden="true"></i> Live</span>
          <span class="livebar__net">Netzwerk DACH</span>
        </div>
        <div class="livebar__num" data-live-counter>0</div>
        <p class="livebar__label">Views heute durch das Netzwerk</p>
      </div>

      <div class="livebar__bars" aria-hidden="true">
        <i style="height:44%;animation-delay:-.1s"></i><i style="height:66%;animation-delay:-.5s"></i>
        <i style="height:38%;animation-delay:-1.1s"></i><i style="height:82%;animation-delay:-.3s"></i>
        <i style="height:56%;animation-delay:-.9s"></i><i style="height:94%;animation-delay:-1.4s"></i>
        <i style="height:48%;animation-delay:-.7s"></i><i style="height:72%;animation-delay:-1.9s"></i>
        <i style="height:60%;animation-delay:-.2s"></i><i style="height:88%;animation-delay:-1.6s"></i>
        <i style="height:40%;animation-delay:-2.2s"></i><i style="height:76%;animation-delay:-.6s"></i>
      </div>

      <!-- Kennzahlen im deutschen Format: site.js setzt wegen lang="de" den
           Tausenderpunkt („5.000+“), Milliarden stehen als „Mrd.“ da —
           wie auf der Kunden-Startseite. -->
      <div class="livebar__stats">
        <div><span data-count="5000" data-suffix="+">0</span><small>aktive Clipper</small></div>
        <div><span data-count="50000" data-suffix="+">0</span><small>Clips pro Monat</small></div>
        <div><span data-count="1" data-suffix=" Mrd.+">0</span><small>Views gesamt</small></div>
      </div>
    </div>

  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     MARQUEE — riesiges Netzwerk, echte Bestandskunden
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--tight" style="padding-top:0">
  <div class="wrap">
    <p class="rv" style="text-align:center;font-size:.8rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-soft);margin-bottom:26px">
      Ein riesiges Clipper-Netzwerk: aktiv im Einsatz für diese Kunden
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

  <!-- Clip-Wall: echte Cover aus den laufenden Kampagnen, jede Kachel
       verlinkt auf den Original-Beitrag bei Instagram. -->
  <div class="clipwall rv" aria-label="Eine Auswahl der Clips, die gerade durch unser Netzwerk laufen">${clipwallRows()}
  </div>

  <div class="wrap">
    <p class="clipwall__note rv">
      Jede Kachel ist ein echter Beitrag, der gerade durch unser Netzwerk läuft, und einem unserer Clipper eine Auszahlung bringt.
    </p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     SO EINFACH VERDIENST DU
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="so-einfach">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">So einfach geht’s</span>
      <h2 class="h2">Videos anschauen, posten, bezahlt werden.</h2>
      <p class="lead">Keine Erfahrung, kein Risiko, keine versteckten Hürden, nur ein klarer Weg zu deiner ersten Auszahlung.</p>
    </div>

    <div class="steps">
      <article class="step rv">
        <div class="step__n">01</div>
        <h3>Keine Erfahrung nötig</h3>
        <p>Du musst kein Profi im Videoschnitt sein. Wenn du ein Video anschauen und posten kannst, kannst du bei uns starten.</p>
      </article>

      <article class="step rv" data-rv-delay="80">
        <div class="step__n">02</div>
        <h3>Unser Team arbeitet dich ein</h3>
        <p>Klare Vorgaben, eine feste Ansprechperson, alles Schritt für Schritt erklärt, mit deinen Fragen bist du nie allein.</p>
      </article>

      <article class="step rv" data-rv-delay="160">
        <div class="step__n">03</div>
        <h3>Bezahlt pro 1.000 Views</h3>
        <p>Für jedes Video, das du anschaust und postest, bekommst du einen festen Betrag pro 1.000 Views, ganz ohne Verhandeln.</p>
      </article>
    </div>

    <div class="btn-row" style="justify-content:center;margin-top:36px">
      <a class="btn btn--primary btn--lg" href="#stepper">Jetzt als Clipper starten</a>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     ABLAUF
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="ablauf">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">So funktioniert’s</span>
      <h2 class="h2">Von der Anmeldung zur ersten Auszahlung.</h2>
      <p class="lead">Klar, schnell, ohne Vorkenntnisse, unser Team begleitet dich bei jedem Schritt.</p>
    </div>

    <div class="steps">
      <article class="step rv">
        <div class="step__n">01</div>
        <div class="step__meta">2 Min · unverbindlich</div>
        <h3>Anmelden</h3>
        <p>Füll das Formular aus, das dauert zwei Minuten. Bestätige deine E-Mail-Adresse mit dem Code, den wir dir schicken, und dein Dashboard öffnet sich; unser Team meldet sich, meist noch am selben Tag.</p>
        <div class="step__cta">
          <a class="btn btn--primary btn--sm" href="#stepper">Jetzt als Clipper starten</a>
        </div>
      </article>

      <article class="step rv" data-rv-delay="80">
        <div class="step__n">02</div>
        <div class="step__meta">wir übernehmen</div>
        <h3>Onboarding mit unserem Team</h3>
        <p>Wir richten deinen Zugang ein und zeigen dir genau, wie Anschauen, Posten und Auszahlung funktionieren: Schritt für Schritt.</p>
      </article>

      <article class="step rv" data-rv-delay="160">
        <div class="step__n">03</div>
        <div class="step__meta">Das Ergebnis</div>
        <h3>Erste Videos, erste Auszahlung</h3>
        <p>Du schaust Videos an, postest sie, und wirst pro 1.000 Views bezahlt. Ganz ohne Risiko für dich.</p>
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
          <span><b>100 %</b><small>Fokus auf den DACH-Raum</small></span>
        </div>
      </div>

      <div class="founder__copy rv" data-rv-delay="100">
        <span class="eyebrow">Der Gründer</span>
        <h2 class="h2">Hinter Nikki Media steht Jason Azarov.</h2>
        <p>
          Jason hat das Clipper-Netzwerk von Nikki Media im gesamten deutschsprachigen Raum
          aufgebaut. Statt Agentur-Floskeln bekommst du von ihm und seinem Team eine ehrliche
          Antwort darauf, wie viel du mit Clipping realistisch verdienen kannst, und wie schnell
          du loslegen kannst.
        </p>
        <p>
          Unser Team ist über Deutschland und Österreich verteilt und betreut jeden neuen Clipper
          persönlich: welches Video sich lohnt, welcher Hook in den ersten 1,5 Sekunden zieht und
          wann ein Post bereit ist, live zu gehen.
        </p>

        <blockquote class="founder__quote">
          „Jeder kann Clipper werden, man muss nur wissen, wie man ein Video anschaut und postet.
          Genau dabei unterstützen wir dich, jeden einzelnen Tag.“
        </blockquote>

        <div class="founder__sign">
          <span><b>Jason Azarov</b><small>Gründer &amp; Inhaber, Nikki Media</small></span>
          <a class="btn btn--primary btn--sm" href="#stepper">Jetzt als Clipper starten</a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     ZAHLEN — deutsches Zahlenformat, siehe Live-Leiste
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark section--tight">
  <div class="wrap">
    <div class="statband rv">
      <div class="statband__i"><b data-count="1" data-suffix=" Mrd.+">0</b><small>organische Views insgesamt</small></div>
      <div class="statband__i"><b data-count="5000" data-suffix="+">0</b><small>aktive Clipper im Netzwerk</small></div>
      <div class="statband__i"><b data-count="50000" data-suffix="+">0</b><small>Clips pro Monat</small></div>
      <div class="statband__i"><b data-count="480000" data-suffix=" €">0</b><small>bereits an Clipper ausgezahlt</small></div>
    </div>
    <p class="muted rv" style="text-align:center;font-size:.78rem;margin-top:28px">
      Netzwerk-Kennzahlen, Stand <span data-year>2026</span>. Deine konkreten Auszahlungen vereinbaren wir vor dem Start mit dir.
    </p>
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
      <p class="lead">Alles, was du für deinen Start als Clipper bei Nikki Media wissen musst, auf einen Blick.</p>
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
      <span class="eyebrow">Clipping ist im DACH-Raum noch brandneu</span>
      <h2 class="h2">Dein nächstes Video könnte dein erstes bezahltes sein.</h2>
      <p class="lead">
        Tausende Clipper in unserem Netzwerk schauen und posten schon heute Videos für echte,
        etablierte Kunden, und werden dafür bezahlt. Melde dich in zwei Minuten an; um den Rest
        kümmert sich unser Team: Onboarding, Material und Schulung.
      </p>
      <div class="btn-row">
        <a class="btn btn--primary btn--lg" href="#stepper">Jetzt als Clipper starten</a>
        <a class="btn btn--ghost btn--lg" href="#gruender">Wer steckt dahinter?</a>
      </div>
      <p class="finalcta__mini">+43 676 5990071 · Antwort meist innerhalb weniger Stunden</p>

      <div class="niches">
        <span class="niche">Instagram</span>
        <span class="niche">TikTok</span>
        <span class="niche">YouTube</span>
        <span class="niche">Facebook</span>
        <span class="niche">Keine Erfahrung nötig</span>
        <span class="niche">Flexibel</span>
        <span class="niche">Bezahlt pro 1.000 Views</span>
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
          <span class="logo__text">NIKKI MEDIA<small>Clipper-Netzwerk</small></span>
        </a>
        <p class="footer__about">
          Nikki Media bezahlt Clipper dafür, Videos anzuschauen und zu posten, keine Erfahrung
          nötig, unser Team arbeitet dich ein, und du wirst pro 1.000 Views bezahlt.
        </p>
      </div>

      <div>
        <h4>Auf dieser Seite</h4>
        <div class="footer__list">
          <a href="#so-einfach">So einfach geht’s</a>
          <a href="#ablauf">Ablauf</a>
          <a href="#gruender">Gründer</a>
          <a href="#faq">FAQ</a>
          <a href="${esc(LOGIN_URL)}">Login</a>
        </div>
      </div>

      <div>
        <h4>Nikki Media</h4>
        <div class="footer__list">
          <a href="/">Für Marken</a>
          <a href="/creator">Für Creator</a>
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

<a class="cta-float" href="#stepper" aria-label="Jetzt als Clipper starten">
  <span class="cta-float__in">
    <span class="cta-float__ic" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15v2.2A2.8 2.8 0 0 0 7.3 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
    </span>
    <span>Jetzt als Clipper starten</span>
    <span class="cta-float__ar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </span>
</a>

<!-- ==========================================================================
     Ladeschirm nach dem Absenden des Formulars

     Liegt bewusst als letztes Element direkt im Body und nicht im Hero: ein
     fixiertes Element würde innerhalb des Heros an dessen Transform hängen und
     dann nur einen Ausschnitt abdecken. Das große Feld zählt 3 → 2 → 1
     herunter (loadStyle: 'countdown'), deshalb steht dort anfangs die 3.
     ========================================================================== -->
<div class="loadscreen" data-loadscreen hidden role="status" aria-live="polite">
  <div class="loadscreen__bg" aria-hidden="true"></div>
  <div class="loadscreen__in">
    <span class="loadscreen__mark" aria-hidden="true">
      <svg class="loadscreen__ring" viewBox="0 0 120 120">
        <circle class="loadscreen__ring-track" cx="60" cy="60" r="52"></circle>
        <circle class="loadscreen__ring-arc" cx="60" cy="60" r="52" data-loadscreen-arc></circle>
      </svg>
      <span class="loadscreen__pct" data-loadscreen-pct>3</span>
    </span>

    <h2 class="loadscreen__title">Dein Clipper-Dashboard wird eingerichtet</h2>
    <p class="loadscreen__sub" data-loadscreen-step>Wir richten deinen Clipper-Zugang ein …</p>

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
