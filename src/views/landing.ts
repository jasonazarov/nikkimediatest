/* eslint-disable */
/**
 * Landingpage — serverseitig gerendert.
 *
 * Ursprung ist die bestehende Nikki-Media-Seite; umgebaut wurde:
 *   · sämtliche WhatsApp-Verweise entfernt, alle CTAs zeigen auf #stepper
 *   · "Instagram und TikTok" → "Instagram, TikTok, YouTube und Facebook"
 *   · fünfstufiges Anfrage-Formular (#stepper) im Hero, POST /api/leads
 *
 * Styles: /assets/site.css · Verhalten: /assets/site.js + /assets/stepper.js
 */
import { breadcrumbs, clippingService, geoHead, ldGraph, ORGANIZATION } from './seo'
import { INDUSTRIES } from '../lib/domain'
import { DEFAULT_DIAL, dialOptions } from '../lib/phone'
import { esc, jsonScript } from './layout'

/**
 * Schritt 2 — Branche. Dieselbe Liste, gegen die /api/leads prüft, und
 * dieselbe Frage („Nische“) wie im Creator-Stepper unter /creator.
 */
const industryChips = (): string =>
  INDUSTRIES.map(
    (n) => `
              <label class="opt opt--chip"><input type="radio" name="industry" value="${esc(n)}"><span>${esc(n)}</span></label>`,
  ).join('')

/** Texte und Ziel des Steppers — das Verhalten steckt in /assets/stepper.js. */
export const LEAD_STEPPER_CONFIG = {
  endpoint: '/api/leads',
  redirect: '/app',
  titles: ['Plattformen', 'Branche', 'Rohmaterial', 'Videos/Monat', 'Kontakt'],
  stepLabel: 'Schritt {n} von {total} · {title}',
  submitText: 'Jetzt zum Upload-Dashboard',
  sendingText: 'Einen Moment …',
  errors: {
    pick: 'Bitte triff zuerst eine Auswahl.',
    contact: 'Bitte fülle Name, E-Mail, Vorwahl und Telefonnummer aus und stimme der Datenschutzerklärung zu.',
    link: 'Bitte gib einen vollständigen Link ein, der mit https:// beginnt, oder lass das Feld leer.',
    tooMany: 'Zu viele Anfragen von dieser Verbindung. Bitte versuche es später erneut.',
    generic: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
  },
  loadTexts: [
    [0, 'Wir richten deinen Zugang ein …'],
    [30, 'Dein Upload-Dashboard wird vorbereitet …'],
    [55, 'Gleich kannst du dein Rohmaterial hochladen …'],
    [78, 'Letzte Einstellungen …'],
    [99, 'Fertig, es geht los!'],
  ],
}

/** `articlesHtml`: Block „Fachartikel“ (views/gold-articles.ts) — leer, solange es keine gibt. */
export const landingPage = (articlesHtml = ''): string => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clipping-Agentur DACH | Millionen organische Views | Nikki Media</title>
<meta name="description" content="Clipping-Agentur für Deutschland, Österreich und die Schweiz: Clipper machen aus deinem Rohmaterial virale Kurzvideos. Abgerechnet pro 1.000 echte Views.">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="https://nikkimedia.co/">
${geoHead('/')}

<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:title" content="Nikki Media | Clipping-Agentur für den DACH-Raum">
<meta property="og:description" content="Hunderte Clipper posten deine Marke auf Instagram, TikTok, YouTube und Facebook. Millionen organische Views: zum festen Preis pro 1.000 Views.">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23000'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='15' font-weight='bold' fill='%232fe08c' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">

${ldGraph(
  ORGANIZATION,
  clippingService('Clipping für Unternehmen und Marken', 'Clipper schneiden aus dem Rohmaterial von Unternehmen und Marken virale 9:16-Clips und posten sie über viele Accounts auf TikTok, Instagram, YouTube und Facebook.', 'Unternehmen und Marken'),
  breadcrumbs([{ name: 'Nikki Media', path: '/' }]),
)}
</head>
<body class="page-home">

<!-- ══════════════════════════════════════════════════════════════════════
     NAV
     ══════════════════════════════════════════════════════════════════ -->
<header class="nav">
  <div class="wrap nav__inner">
    <a class="logo" href="/" aria-label="Nikki Media, Startseite">
      <span class="logo__mark" aria-hidden="true">NM</span>
      <span class="logo__text">NIKKI MEDIA<small>Clipping-Agentur</small></span>
    </a>

    <!-- Dasselbe Menü auf allen drei Landingpages (/, /clipper, /creator) und
         im mobilen Menü: genau diese vier Punkte in dieser Reihenfolge. Die
         Abschnitte der Seite erreicht man über die Knöpfe rechts und den Footer. -->
    <nav class="nav__links" aria-label="Hauptnavigation">
      <a href="#case-studies">Case Studies</a>
      <a href="/clipper">Clipper werden</a>
      <a href="/creator">Creator werden</a>
      <a href="/brands">Für Agenturen</a>
      <a href="/creator">Kampagne starten</a>
    </nav>

    <div class="nav__actions">
      <a class="btn btn--ghost btn--sm" href="#ablauf">Wie es funktioniert</a>
      <a class="btn btn--primary btn--sm" href="#stepper">Videos hochladen</a>
      <a class="btn btn--ghost btn--sm nav__login" href="/login">Login</a>
      <button class="nav__burger" aria-label="Menü öffnen" aria-expanded="false" aria-controls="mobilemenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="nav__mobile" id="mobilemenu">
  <a href="#case-studies">Case Studies</a>
  <a href="/clipper">Clipper werden</a>
  <a href="/creator">Creator werden</a>
  <a href="/brands">Für Agenturen</a>
  <a href="/creator">Kampagne starten</a>
  <a href="/login">Login</a>
  <a class="btn btn--primary" href="#stepper">Jetzt Videos hochladen</a>
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
      <span class="eyebrow">Clipping-Agentur aus dem DACH-Raum</span>
      <h1 class="h-display">Millionen Aufrufe.<br><span class="grad">Durch Clipping.</span></h1>
      <div class="hero__kicker">Organisch · Planbar · Viral</div>
    </div>

    <!-- Bühne: das Formular ist der Mittelpunkt des Heros. Halo und Sockel
         liegen hinter der Karte und heben sie vom Hintergrund ab. -->
    <div class="hero__stage rv" data-rv-delay="90">
      <span class="hero__stage-halo" aria-hidden="true"></span>
      <span class="hero__stage-badge"><span class="hero__stage-badge-ic" aria-hidden="true">📤</span>Videos hochladen</span>

      ${leadStepper()}

      <p class="hero__note">
        <span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        Zwei Minuten Formular: danach meldet sich Jason persönlich.
      </p>
    </div>

    <div class="hero__support rv" data-rv-delay="60">
      <p class="lead hero__lead">
        Nutze die Power unserer Clipper-Armee: Massen an Accounts, die virale Kurzvideos für
        deine Marke erstellen und posten. Wir schneiden aus deinem Rohmaterial 9:16-Clips und
        laden sie auf Instagram, TikTok, YouTube und Facebook hoch, zu einem vorab vereinbarten Preis pro 1.000 Views.
      </p>

      <ul class="hero__usps">
        <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Überflutung durch Omnipräsenz</li>
        <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Fester Preis pro 1.000 Views, vorab fixiert</li>
        <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Abrechnung nach tatsächlich erreichten Views</li>
        <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Unsere Clipper erstellen deine Videos, kostenlos</li>
        <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Relevante Zielgruppen im DACH-Raum und international</li>
      </ul>
    </div>

    <!-- Live-Leiste: früher die Karte rechts neben dem Formular, jetzt ein
         flaches Band unter der Bühne — es nimmt dem Formular keine Breite. -->
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

      <div class="livebar__stats">
        <div><span data-count="5000" data-suffix="+">0</span><small>aktive Clipper</small></div>
        <div><span data-count="9800" data-suffix="+">0</span><small>Clips pro Monat</small></div>
        <div><span data-count="1" data-dec="0" data-suffix=" Mrd.">0</span><small>Views gesamt</small></div>
      </div>
    </div>

  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     FORYOU-PAGE VERGLEICH
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--tight">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <h2 class="h2">So sieht die For-You-Page deiner Zielgruppe aus …</h2>
      <p class="lead">… nach der Zusammenarbeit mit uns. <strong style="color:var(--text)">(natürlich mit deinen Videos)</strong></p>
    </div>

    <div class="feedcompare rv">
      <div>
        <div class="feedcompare__cap">Vorher<small>Deine Marke taucht nirgends auf</small></div>
        <div class="phone">
          <div class="phone__screen">
            <span class="phone__notch" aria-hidden="true"></span>
            <div class="feedgrid" aria-hidden="true">
              <div class="tile" style="background:linear-gradient(160deg,#38443e,#212a25)"><span>@random</span></div>
              <div class="tile" style="background:linear-gradient(160deg,#4a4048,#26212a)"><span>@fyp</span></div>
              <div class="tile" style="background:linear-gradient(160deg,#424b47,#232926)"><span>@viral</span></div>
              <div class="tile" style="background:linear-gradient(160deg,#464049,#252029)"><span>@daily</span></div>
              <div class="tile" style="background:linear-gradient(160deg,#414a46,#222926)"><span>@clips</span></div>
              <div class="tile" style="background:linear-gradient(160deg,#474149,#26222a)"><span>@feed</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="feedcompare__arrow" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>

      <div>
        <div class="feedcompare__cap">Nachher<small>Omnipräsenz: überall deine Clips</small></div>
        <div class="phone">
          <div class="phone__screen">
            <span class="phone__notch" aria-hidden="true"></span>
            <!-- Illustration: echte Clip-Cover aus laufenden Kampagnen, in
                 Markenfarbe eingefärbt — hier stehen später deine Videos. -->
            <div class="feedgrid" aria-hidden="true">
              <div class="tile tile--real" style="background:linear-gradient(160deg,#47f7a2,#166740)"><img src="/img/cases/levantine_istanbul-DUTFpaeiMZA.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
              <div class="tile tile--real" style="background:linear-gradient(160deg,#2de38b,#223e30)"><img src="/img/cases/dindrop7-DM-7GyZIkb0.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
              <div class="tile tile--real" style="background:linear-gradient(160deg,#51f8a7,#1a764a)"><img src="/img/cases/caspianbluecaviar-DQ4ga9SDEnj.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
              <div class="tile tile--real" style="background:linear-gradient(160deg,#26c277,#1c3428)"><img src="/img/cases/levantine_istanbul-Da2pgoToIw_.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
              <div class="tile tile--real" style="background:linear-gradient(160deg,#62f8b0,#1f8a56)"><img src="/img/cases/panperium-DZurxhPjezN.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
              <div class="tile tile--real" style="background:linear-gradient(160deg,#31d988,#234334)"><img src="/img/cases/max_tornow_business-C1xEPryiQ4t.jpg" alt="" loading="lazy" decoding="async" width="270" height="480"><span>DEINE MARKE</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     MARQUEE — Marken, für die wir clippen
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--tight" style="padding-top:0">
  <div class="wrap">
    <p class="rv" style="text-align:center;font-size:.8rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-soft);margin-bottom:26px">
      Marken &amp; Creator, für die wir bereits clippen
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
  <div class="clipwall rv" aria-label="Ausschnitt aus den Clips, die wir aktuell ausrollen">
    <div class="clipwall__row">
      <div class="clipwall__track" data-speed="23">
        <a class="clipwall__card" href="https://www.instagram.com/dindrop7/reel/DM-7GyZIkb0/" target="_blank" rel="noopener">
          <img src="/img/cases/dindrop7-DM-7GyZIkb0.jpg" alt="Clip von @dindrop7" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>DinDrop</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/levantine_istanbul/reel/Da2pgoToIw_/" target="_blank" rel="noopener">
          <img src="/img/cases/levantine_istanbul-Da2pgoToIw_.jpg" alt="Clip von @levantine_istanbul" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Levantine</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/caspianbluecaviar/reel/DQ4ga9SDEnj/" target="_blank" rel="noopener">
          <img src="/img/cases/caspianbluecaviar-DQ4ga9SDEnj.jpg" alt="Clip von @caspianbluecaviar" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/caspianbluecaviar.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Caspian Blue</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/max_tornow_business/reel/C1xEPryiQ4t/" target="_blank" rel="noopener">
          <img src="/img/cases/max_tornow_business-C1xEPryiQ4t.jpg" alt="Clip von @max_tornow_business" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Max Tornow</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/panperium/p/DZurxhPjezN/" target="_blank" rel="noopener">
          <img src="/img/cases/panperium-DZurxhPjezN.jpg" alt="Beitrag von @panperium" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Panperium</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/levantine_istanbul/reel/DUTFpaeiMZA/" target="_blank" rel="noopener">
          <img src="/img/cases/levantine_istanbul-DUTFpaeiMZA.jpg" alt="Clip von @levantine_istanbul" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Levantine</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/dindrop7/reel/DPRDIqUiIeB/" target="_blank" rel="noopener">
          <img src="/img/cases/dindrop7-DPRDIqUiIeB.jpg" alt="Clip von @dindrop7" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>DinDrop</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/caspianbluecaviar/reel/DMzr3__qHsw/" target="_blank" rel="noopener">
          <img src="/img/cases/caspianbluecaviar-DMzr3__qHsw.jpg" alt="Clip von @caspianbluecaviar" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/caspianbluecaviar.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Caspian Blue</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/panperium/reel/DZfCoAoNLUi/" target="_blank" rel="noopener">
          <img src="/img/cases/panperium-DZfCoAoNLUi.jpg" alt="Clip von @panperium" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Panperium</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/levantine_istanbul/reel/DEUXjpeIHPR/" target="_blank" rel="noopener">
          <img src="/img/cases/levantine_istanbul-DEUXjpeIHPR.jpg" alt="Clip von @levantine_istanbul" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Levantine</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/dindrop7/reel/DbLpapmA_Bw/" target="_blank" rel="noopener">
          <img src="/img/cases/dindrop7-DbLpapmA_Bw.jpg" alt="Clip von @dindrop7" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>DinDrop</span></span>
        </a>
      </div>
    </div>
    <div class="clipwall__row clipwall__row--rev">
      <div class="clipwall__track" data-speed="19">
        <a class="clipwall__card" href="https://www.instagram.com/caspianbluecaviar/reel/DKZ-ra1qDiR/" target="_blank" rel="noopener">
          <img src="/img/cases/caspianbluecaviar-DKZ-ra1qDiR.jpg" alt="Clip von @caspianbluecaviar" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/caspianbluecaviar.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Caspian Blue</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/panperium/p/DZF78B8je1g/" target="_blank" rel="noopener">
          <img src="/img/cases/panperium-DZF78B8je1g.jpg" alt="Beitrag von @panperium" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Panperium</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/levantine_istanbul/reel/DBQxgMHAw1U/" target="_blank" rel="noopener">
          <img src="/img/cases/levantine_istanbul-DBQxgMHAw1U.jpg" alt="Clip von @levantine_istanbul" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Levantine</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/dindrop7/reel/DbbJyZgIUjl/" target="_blank" rel="noopener">
          <img src="/img/cases/dindrop7-DbbJyZgIUjl.jpg" alt="Clip von @dindrop7" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>DinDrop</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/max_tornow_business/reel/C8pRTW6MinC/" target="_blank" rel="noopener">
          <img src="/img/cases/max_tornow_business-C8pRTW6MinC.jpg" alt="Clip von @max_tornow_business" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Max Tornow</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/panperium/reel/DZvEvMPNa15/" target="_blank" rel="noopener">
          <img src="/img/cases/panperium-DZvEvMPNa15.jpg" alt="Clip von @panperium" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Panperium</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/levantine_istanbul/reel/C9406cJIC_D/" target="_blank" rel="noopener">
          <img src="/img/cases/levantine_istanbul-C9406cJIC_D.jpg" alt="Clip von @levantine_istanbul" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Levantine</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/dindrop7/reel/DZlBQOrgilt/" target="_blank" rel="noopener">
          <img src="/img/cases/dindrop7-DZlBQOrgilt.jpg" alt="Clip von @dindrop7" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>DinDrop</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/max_tornow_business/reel/C_PxECKAj61/" target="_blank" rel="noopener">
          <img src="/img/cases/max_tornow_business-C_PxECKAj61.jpg" alt="Clip von @max_tornow_business" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Max Tornow</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/panperium/p/DbGw3_SCDud/" target="_blank" rel="noopener">
          <img src="/img/cases/panperium-DbGw3_SCDud.jpg" alt="Beitrag von @panperium" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Panperium</span></span>
        </a>
        <a class="clipwall__card" href="https://www.instagram.com/max_tornow_business/reel/DCHhYijJK4b/" target="_blank" rel="noopener">
          <img src="/img/cases/max_tornow_business-DCHhYijJK4b.jpg" alt="Clip von @max_tornow_business" loading="lazy" decoding="async" width="270" height="480">
          <span class="clipwall__tag"><img class="clipwall__av" src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="18" height="18"><span>Max Tornow</span></span>
        </a>
      </div>
    </div>
  </div>

  <div class="wrap">
    <p class="clipwall__note rv">
      Jede Kachel ist ein echter Beitrag aus einem laufenden Account, antippen und direkt auf Instagram ansehen.
    </p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     DAS PROBLEM
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="das-problem">
  <div class="wrap">
    <div class="problem__layout">
      <div class="problem__copy rv">
        <span class="eyebrow">Das Problem</span>
        <h2 class="h2" style="margin-top:18px">Während andere Ads laufen lassen, lässt du den Algorithmus laufen.</h2>
        <p class="lead" style="margin-top:20px">
          Meta Ads verbrennen Budget, Influencer kosten ein Vermögen, und virale Erfolge
          sind reine Glückssache.
        </p>
        <p class="lead">
          Clipper haben das Internet erobert. Wir bringen dieses Modell in den
          deutschsprachigen Raum, und stecken hinter den viralen Clipping-Accounts,
          die dir auf Instagram, TikTok, YouTube und Facebook immer und immer wieder angezeigt werden.
        </p>
        <p class="lead">
          Massen an Accounts posten deine Marke auf Instagram, TikTok, YouTube und Facebook. Du bekommst
          Millionen organischer Views, ohne eigenes Posting. Und du zahlst nur für
          tatsächlich erreichte Views.
        </p>
        <div class="btn-row" style="margin-top:30px">
          <a class="btn btn--primary" href="#stepper">Jetzt Social Media überfluten</a>
        </div>
      </div>

      <div class="rv" data-rv-delay="100">
        <p style="font-size:.78rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--on-dark-soft);margin-bottom:16px">
          Werbeeinblendungen pro 1.000 US-Dollar · Rechenbeispiel
        </p>
        <div class="vs" data-bars>
          <div class="vs__row">
            <b>Meta Ads</b>
            <span class="vs__bar"><i data-bar="58.85" data-bar-axis="x"></i></span>
            <span class="vs__val">≈ 122.100</span>
          </div>
          <div class="vs__row">
            <b>TikTok Ads</b>
            <span class="vs__bar"><i data-bar="100" data-bar-axis="x"></i></span>
            <span class="vs__val">≈ 207.500</span>
          </div>
          <div class="vs__row">
            <b>Influencer-Deal</b>
            <span class="vs__bar"><i data-bar="31" data-bar-axis="x"></i></span>
            <span class="vs__val">Individuell*</span>
          </div>
          <div class="vs__row vs__row--win">
            <b>Nikki Media</b>
            <span class="vs__bar"><i data-bar="100" data-bar-axis="x"></i></span>
            <span class="vs__val">Individuell*</span>
          </div>
        </div>
        <p class="muted" style="font-size:.76rem;margin-top:14px">
          Beispielwerte auf Basis veröffentlichter CPM-Benchmarks von Meta und Co. Unser Ziel: günstigere Reichweite mit besseren Resultaten als marktübliche Ads.
          Deinen konkreten CPM legen wir vor Kampagnenstart gemeinsam fest.
          Meta/TikTok: berechnet aus den internationalen 2025-Benchmarks von
          <a href="https://www.guptamedia.com/social-media-ads-cost" target="_blank" rel="noopener">Gupta Media (Stand Oktober 2025)</a>,
          keine aktuellen DACH-Preise. Werbeeinblendungen sind keine organischen Video-Views.
          *Influencer und Nikki Media: individuell vereinbart; diese Balken sind schematisch und zeigen keine gemessene Reichweite.
        </p>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     WARUM CLIPPING — 4 Feature-Cards
     ══════════════════════════════════════════════════════════════════ -->
<section class="section" id="warum-clipping">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">Warum Clipping</span>
      <h2 class="h2">Maximale Omnipräsenz für dein Unternehmen.</h2>
      <p class="lead">
        Clipping erobert den deutschsprachigen Markt im Sturm. Hier ist, warum es dich
        an die Spitze deiner Nische trägt.
      </p>
    </div>

    <div class="fcards">

      <!-- 01 — CPM -->
      <article class="card-dark rv">
        <div class="fcard__inner">
          <div class="fcard__copy">
            <span class="eyebrow">01 · Fester Preis pro 1.000 Views</span>
            <h3>Herkömmliche Werbung ist teuer und ineffizient.</h3>
            <p>
              Du zahlst einen festen Preis pro 1.000 organische Views. Unser Ziel: günstigere Reichweite
              mit besseren Resultaten als marktübliche Ads. Deinen Preis legen wir vor der Kampagne fest. Du weißt
              vorher genau, was du bekommst. Nur Content, der performt, kostet dich etwas.
            </p>
          </div>
          <div class="fcard__viz">
            <div class="cpm" data-bars>
              <p class="cpm__legend"><b>CPM</b> = Kosten pro 1.000 Werbeeinblendungen · internationale Benchmarks in US-Dollar</p>
              <div class="cpm__chart">
                <div class="cpm__axis"><span>12 $</span><span>9 $</span><span>6 $</span><span>3 $</span><span>0 $</span></div>
                <div class="cpm__bars" data-bars>
                  <div class="cpm__bar"><span>8,19 $</span><i data-bar="68.25"></i></div>
                  <div class="cpm__bar"><span>4,82 $</span><i data-bar="40.17"></i></div>
                  <div class="cpm__bar cpm__bar--win"><span>Tonnenweise günstiger*</span><i data-bar="10"></i></div>
                </div>
              </div>
              <div class="cpm__labels">
                <div>Meta</div><div>TikTok</div><div class="is-win">NIKKI MEDIA</div>
              </div>
              <p class="cpm__legend">Quelle: <a href="https://www.guptamedia.com/social-media-ads-cost" target="_blank" rel="noopener">Gupta Media</a>, 2025-Durchschnitt, Stand Oktober 2025; keine festen Tarife oder aktuellen DACH-Preise. Kosten variieren nach Zielgruppe, Kampagnenziel und Zeitraum. *Unser Anspruch; Preis pro 1.000 organische Views individuell vereinbart. Nikki-Media-Balken schematisch, kein gemessener CPM-Vergleich.</p>
            </div>
          </div>
        </div>
      </article>

      <!-- 02 — Netzwerk-Effekt (DACH-Karte) -->
      <article class="card-dark fcard--rev rv">
        <div class="fcard__inner">
          <div class="fcard__copy">
            <span class="eyebrow">02 · Netzwerk-Effekt-Marketing</span>
            <h3>Sei überall gleichzeitig.</h3>
            <p>
              Netzwerk-Effekt-Marketing: Mit Tausenden von Clippern aus unserem Netzwerk, die den Content unserer Kunden verbreiten,
              überschwemmst du den Social-Media-Feed deiner Zielgruppe. Dein Logo, dein Produkt,
              dein Song taucht überall auf, in Deutschland, Österreich und der Schweiz.
              Echte Omnipräsenz, virale Sensation.
            </p>
          </div>

          <div class="fcard__viz">
            <div class="dachmap">
              <svg class="dachmap__svg" viewBox="0 0 1000 1283" role="img" aria-label="Karte von Deutschland, Österreich und der Schweiz mit aktiven Clippern">
<defs>
<linearGradient id="dachFill" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0%" stop-color="#8ff3bf" stop-opacity=".95"/><stop offset="55%" stop-color="#2fe08c" stop-opacity=".88"/><stop offset="100%" stop-color="#17a865" stop-opacity=".9"/>
</linearGradient>
<linearGradient id="dachFillAt" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0%" stop-color="#7eeeb4" stop-opacity=".93"/><stop offset="100%" stop-color="#14995c" stop-opacity=".9"/>
</linearGradient>
<linearGradient id="dachFillCh" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0%" stop-color="#74ebad" stop-opacity=".93"/><stop offset="100%" stop-color="#128c54" stop-opacity=".9"/>
</linearGradient>
</defs>
<g class="dach-c dach-de">
<path class="dach-r" data-n="Baden-Württemberg" id="r-de-baden-wuerttemberg" d="M338.1 762.9 337.0 774.4 340.0 775.4 343.8 769.9 345.4 775.3 350.7 769.8 354.3 773.2 354.0 779.7 358.1 786.1 353.3 793.2 356.8 794.6 361.6 789.1 360.2 792.6 362.7 792.5 363.4 802.9 370.4 802.8 374.6 794.4 376.2 799.3 379.7 799.2 377.4 807.6 383.4 814.4 378.5 816.5 380.1 820.4 378.1 821.9 381.6 823.3 382.6 829.4 378.8 832.6 380.8 833.1 379.9 839.9 391.4 847.5 387.0 853.5 391.0 854.4 391.1 861.2 400.1 862.5 409.0 874.6 406.6 878.5 409.0 880.5 406.5 886.3 408.5 891.2 405.0 896.0 412.3 907.3 405.0 910.6 407.4 906.3 404.5 905.7 399.6 911.5 398.6 906.6 392.7 904.7 391.2 910.0 397.1 917.3 394.7 917.7 396.1 928.4 388.8 929.7 389.7 932.2 383.9 936.7 371.8 937.1 372.3 941.0 366.0 947.4 374.4 960.3 376.0 973.4 380.9 984.0 380.4 994.7 375.7 1002.6 378.1 1005.4 377.7 1012.7 375.3 1014.2 380.1 1020.9 374.3 1024.8 378.7 1028.2 379.6 1039.3 375.8 1039.4 374.8 1044.2 370.6 1037.5 365.4 1042.3 354.9 1039.0 346.5 1048.2 330.9 1050.9 325.0 1042.4 309.0 1039.3 285.5 1020.3 297.0 1031.4 300.8 1040.4 295.9 1042.3 280.9 1030.1 282.5 1032.4 276.6 1032.2 282.2 1036.9 272.2 1042.1 269.0 1038.4 270.7 1035.3 265.0 1030.9 261.8 1033.8 264.1 1038.9 258.0 1036.7 258.2 1027.8 254.7 1028.2 251.8 1022.7 249.5 1027.8 248.6 1022.9 244.2 1021.5 244.8 1024.8 235.9 1027.3 229.9 1039.0 235.8 1043.6 247.0 1039.3 249.4 1042.6 246.6 1043.1 245.6 1049.2 240.0 1044.3 234.6 1048.5 237.8 1051.1 232.8 1052.9 223.4 1052.4 220.1 1047.4 212.6 1045.8 202.4 1054.0 190.0 1055.7 185.3 1050.0 179.2 1049.9 166.1 1057.3 162.9 1054.0 167.0 1052.9 166.2 1050.1 160.8 1051.7 153.5 1041.4 156.4 1012.9 162.0 1000.9 157.4 992.8 158.2 981.7 165.8 968.7 168.2 958.2 172.7 954.6 171.7 945.6 177.9 930.5 177.9 920.1 192.2 898.6 202.4 892.6 212.0 872.1 220.5 865.9 226.3 853.2 228.5 835.3 237.5 826.4 233.9 822.2 237.8 818.6 238.1 814.2 235.2 814.3 239.0 807.8 233.5 806.6 235.4 803.5 231.2 793.0 232.1 788.5 246.2 796.6 249.1 793.0 246.9 784.8 255.4 782.9 254.0 789.3 258.1 797.0 273.1 798.4 271.2 803.3 266.7 803.0 267.7 807.8 264.3 810.9 269.3 812.6 277.7 805.2 277.7 798.3 293.2 797.2 289.7 793.8 291.1 788.8 304.1 788.4 309.0 779.0 317.9 780.5 318.8 771.5 316.3 769.0 313.3 772.5 315.3 769.5 308.3 768.0 310.8 767.5 309.7 764.1 325.9 761.5 331.5 767.5 331.3 762.5 338.1 762.9Z"/>
<path class="dach-r" data-n="Bayern" id="r-de-bayern" d="M380.1 658.0 386.2 657.5 388.8 663.1 397.5 665.7 403.6 675.3 402.6 679.4 408.2 678.4 411.3 685.0 421.0 688.0 421.6 702.2 431.3 705.7 432.3 699.1 442.7 699.0 430.8 689.0 431.2 683.9 440.7 679.8 450.1 679.8 455.2 686.3 455.1 683.3 459.1 686.3 465.1 683.3 469.1 688.3 467.7 693.8 477.2 696.8 479.8 683.2 476.8 668.0 483.5 666.4 485.5 661.9 492.6 662.8 491.6 671.5 494.1 675.5 497.1 674.0 500.6 682.1 506.8 678.0 523.6 675.4 527.1 679.4 536.9 674.8 540.7 679.4 540.5 685.0 553.0 690.3 554.0 694.5 549.6 698.2 559.4 706.3 559.4 717.6 564.8 720.3 564.4 724.3 584.6 734.6 583.4 740.8 589.7 742.6 585.7 754.5 583.2 754.9 583.1 761.0 577.1 765.7 580.7 772.2 588.0 774.8 587.8 782.2 591.2 783.3 593.2 794.1 598.2 795.8 597.1 802.6 599.5 809.0 608.1 813.3 610.2 819.7 624.9 820.2 631.9 825.5 632.3 830.9 644.6 843.3 644.6 847.3 654.7 850.5 664.0 859.6 665.8 870.2 672.1 874.4 673.3 870.7 680.1 870.6 687.3 881.9 694.2 883.0 701.5 896.6 697.3 903.2 700.7 913.8 699.3 920.4 693.2 928.5 672.7 919.6 666.8 923.8 668.4 930.2 664.6 948.3 653.8 957.8 636.8 960.9 617.5 971.0 607.5 982.3 629.1 1016.6 621.3 1032.3 630.3 1032.5 636.0 1037.4 638.1 1044.2 633.1 1051.2 633.6 1062.7 630.1 1066.5 611.6 1054.2 610.0 1051.6 613.9 1047.1 609.1 1043.4 610.1 1039.4 594.7 1039.0 592.3 1044.8 586.1 1045.5 580.0 1036.2 564.6 1039.4 564.2 1031.2 557.3 1036.5 560.3 1049.0 543.6 1046.4 529.7 1051.9 510.6 1049.4 505.8 1060.5 493.3 1060.4 489.0 1065.7 492.1 1069.1 485.0 1068.3 479.1 1076.1 474.8 1076.0 476.7 1070.4 453.4 1075.4 448.9 1064.9 443.4 1064.9 448.2 1060.0 445.2 1057.2 435.5 1060.0 420.6 1052.6 417.2 1057.4 406.0 1051.1 406.1 1062.4 408.7 1063.7 409.4 1070.7 406.1 1077.6 402.3 1078.1 396.5 1087.4 383.2 1091.6 388.2 1075.8 376.8 1080.7 374.4 1073.4 376.7 1072.5 376.4 1067.6 368.2 1063.8 366.0 1055.6 357.5 1058.1 352.2 1055.5 351.2 1049.6 345.5 1056.8 335.2 1052.5 338.9 1047.5 347.4 1047.7 354.9 1039.0 365.4 1042.3 370.6 1037.5 374.8 1044.2 375.8 1039.4 379.6 1039.3 378.7 1028.2 374.3 1024.8 380.1 1020.9 375.3 1014.2 377.7 1012.7 378.1 1005.4 375.7 1002.6 380.4 994.7 380.9 984.0 376.0 973.4 374.4 960.3 366.0 947.4 372.3 941.0 371.8 937.1 383.9 936.7 389.7 932.2 388.8 929.7 396.1 928.4 394.7 917.7 397.1 917.3 391.2 910.0 392.7 904.7 398.6 906.6 399.6 911.5 404.5 905.7 407.4 906.3 405.0 910.6 412.3 907.3 405.0 896.0 408.5 891.2 406.5 886.3 409.0 880.5 406.6 878.5 409.0 874.6 400.1 862.5 391.1 861.2 391.0 854.4 387.0 853.5 391.4 847.5 379.9 839.9 380.8 833.1 378.8 832.6 382.6 829.4 381.6 823.3 378.1 821.9 380.1 820.4 378.5 816.5 383.4 814.4 377.4 807.6 379.7 799.2 376.2 799.3 374.6 794.4 370.4 802.8 364.9 803.4 361.9 801.4 361.6 789.1 356.8 794.6 353.3 793.2 358.1 785.6 351.7 769.8 345.9 775.3 343.8 769.9 339.0 775.4 336.5 773.4 338.6 761.4 331.3 762.5 331.5 767.5 325.9 761.5 314.7 762.6 308.3 768.0 315.3 769.5 312.3 770.5 314.3 773.0 317.3 769.5 319.3 774.0 317.9 780.5 309.0 779.0 302.1 789.3 292.6 789.8 288.1 785.9 291.5 780.4 289.9 774.0 295.8 767.0 291.8 765.1 294.3 760.1 290.8 760.7 290.7 753.7 285.7 753.4 284.4 734.0 287.4 733.4 285.8 727.0 281.2 725.6 284.6 717.6 293.7 715.8 296.7 716.7 296.4 720.7 302.3 712.5 314.4 714.9 318.0 721.9 326.7 720.2 327.9 710.1 325.4 709.1 325.1 700.0 339.0 701.3 336.9 699.3 338.3 696.3 346.3 690.6 346.4 676.2 358.3 678.7 364.9 675.5 375.0 659.1 380.1 658.0Z"/>
<path class="dach-r" data-n="Berlin" id="r-de-berlin" d="M643.0 372.3 647.7 374.0 649.0 367.7 652.6 368.3 653.8 363.6 661.1 368.5 670.2 364.5 668.7 362.9 670.8 360.8 674.9 365.7 673.7 373.1 686.6 381.9 682.7 390.2 695.7 394.8 686.4 408.8 685.5 403.5 671.3 401.0 670.4 397.3 666.1 398.8 666.5 403.5 650.9 397.4 641.2 401.9 637.1 397.6 644.3 385.1 639.6 382.8 643.0 372.3Z"/>
<path class="dach-r" data-n="Brandenburg" id="r-de-brandenburg" d="M705.3 241.4 708.6 253.1 736.7 252.0 736.3 260.5 724.5 276.3 738.2 276.7 743.6 268.8 752.3 266.9 754.8 276.2 747.7 288.0 749.5 294.4 747.6 303.0 728.2 319.7 729.3 331.4 726.3 337.1 745.4 348.7 756.3 363.3 771.3 374.4 767.9 381.1 770.6 385.9 761.7 400.6 766.5 412.7 765.4 415.8 776.5 422.6 773.9 439.6 780.2 446.4 774.9 470.1 766.6 479.7 779.9 503.5 780.0 512.4 775.3 513.0 773.6 519.8 765.3 516.8 745.5 526.7 729.1 520.6 723.8 527.4 725.1 529.6 720.1 529.6 722.8 534.1 717.1 544.4 713.3 540.9 696.6 546.1 677.6 545.0 665.6 533.3 663.4 537.3 658.2 535.2 653.9 542.8 649.2 541.1 648.3 536.5 645.7 536.9 648.6 526.2 646.7 518.9 634.5 506.2 646.2 496.6 640.9 478.3 643.1 474.7 633.2 475.0 633.8 470.9 627.5 470.7 626.5 466.0 617.1 466.3 616.7 461.6 611.4 462.6 601.5 455.6 589.9 459.5 583.7 452.1 580.0 454.6 561.4 433.4 568.3 425.6 564.2 421.4 569.7 408.3 567.6 406.2 569.3 399.9 566.7 398.3 571.6 389.4 563.2 382.9 560.0 387.0 557.3 385.4 559.0 381.7 555.3 382.7 558.5 375.9 557.6 368.5 563.5 368.0 563.1 359.5 559.9 355.8 561.1 347.3 564.9 344.1 562.9 335.0 528.8 328.1 527.2 325.4 529.4 321.7 515.5 317.7 515.0 313.4 510.2 312.8 510.8 308.5 500.6 307.8 495.2 302.9 485.5 306.6 479.0 299.5 489.8 298.5 489.9 294.2 502.3 296.5 505.6 290.7 504.5 283.6 510.5 279.4 527.8 281.8 525.1 278.0 544.6 270.7 546.9 261.0 557.1 265.5 562.5 262.9 565.1 267.8 576.9 270.8 581.1 278.4 600.4 277.8 600.8 281.5 608.3 282.3 606.6 286.0 608.8 287.7 627.0 285.9 624.2 289.6 627.4 291.3 639.5 279.8 644.9 278.3 649.0 283.2 655.2 274.2 664.2 278.8 667.1 271.3 674.7 268.3 676.7 256.5 683.2 255.0 690.6 244.5 701.0 242.1 696.7 239.8 697.5 233.3 700.0 239.3 705.3 241.4Z"/>
<path class="dach-r" data-n="Bremen" id="r-de-bremen" d="M280.4 295.6 277.2 296.2 281.0 299.9 278.4 301.0 280.2 306.9 276.0 311.9 270.0 307.8 265.9 310.6 262.0 305.9 258.3 308.7 249.2 290.2 237.1 281.0 246.8 282.7 246.4 287.1 266.8 290.1 269.6 294.3 277.1 291.3 280.4 295.6Z"/>
<path class="dach-r" data-n="Hamburg" id="r-de-hamburg" d="M374.7 209.6 385.7 206.3 380.9 213.9 388.3 221.9 381.9 233.3 397.2 249.4 390.0 255.4 383.9 254.9 373.1 245.3 368.1 251.9 360.3 252.5 361.4 247.6 356.4 250.4 347.9 239.1 348.4 231.9 344.5 231.4 347.6 221.2 353.3 227.6 360.4 217.8 374.8 213.9 374.7 209.6Z"/>
<path class="dach-r" data-n="Hessen" id="r-de-hessen" d="M325.0 508.5 336.2 507.7 341.5 515.3 332.9 523.7 337.6 530.7 337.8 537.9 331.3 541.7 330.4 548.0 345.1 554.6 348.6 548.8 345.6 551.5 342.9 544.9 352.8 538.6 357.1 544.2 356.0 538.6 360.8 538.0 366.2 556.6 373.5 557.7 375.1 564.9 389.1 570.2 387.1 579.9 383.4 575.3 379.3 576.8 384.0 579.9 381.5 588.6 387.7 592.8 382.1 596.8 372.2 594.2 370.2 598.8 374.4 603.4 364.0 603.3 364.0 606.4 367.6 604.9 366.6 609.0 369.7 606.9 373.9 612.1 370.3 614.6 370.4 619.2 364.2 620.7 364.7 626.3 361.6 628.8 363.2 632.4 357.5 645.5 363.8 647.1 364.3 641.5 372.7 640.6 375.9 646.7 371.8 649.3 373.9 657.0 371.9 665.8 365.4 675.0 355.2 678.7 347.4 675.2 345.8 692.1 338.3 696.3 336.9 699.3 339.0 701.3 325.1 700.0 325.4 709.1 327.9 710.1 326.7 720.2 318.0 721.9 314.4 714.9 302.3 712.5 296.4 720.7 296.7 716.7 293.7 715.8 283.1 720.1 281.2 726.6 285.8 727.0 287.4 733.4 284.4 734.0 285.7 753.4 290.7 753.7 290.8 760.7 294.3 760.1 291.8 765.1 295.8 767.0 289.9 774.0 291.5 780.4 288.0 783.4 291.1 788.8 289.7 793.8 293.2 797.2 277.7 798.3 277.7 805.2 265.8 812.7 266.7 803.0 271.2 803.3 273.1 798.4 258.1 797.0 254.0 789.3 255.4 782.9 246.9 784.8 249.1 793.0 243.2 796.8 229.0 784.2 226.2 774.5 237.0 764.0 232.0 764.3 228.3 757.0 229.3 753.0 225.1 748.7 224.9 738.2 218.7 730.5 211.1 728.4 185.1 736.7 176.2 725.6 183.5 715.3 189.7 718.9 190.1 713.8 185.9 709.8 187.8 705.2 195.4 701.0 199.0 704.0 201.4 701.4 199.3 696.3 206.9 695.6 202.0 682.0 193.4 676.6 197.4 671.9 194.5 666.9 195.8 661.3 199.7 657.0 208.9 657.8 209.9 651.1 205.1 640.8 210.4 632.6 206.3 624.9 218.7 612.6 227.9 615.7 235.8 608.4 235.4 601.3 243.0 594.4 239.7 590.9 241.5 583.1 258.6 581.5 256.4 578.0 262.9 567.9 260.1 560.3 247.1 562.2 244.7 556.6 255.9 544.3 278.0 542.6 278.9 536.8 276.3 536.9 274.0 529.7 280.8 525.8 290.9 527.1 291.5 534.9 301.5 532.5 314.5 514.0 311.5 511.0 323.8 504.9 325.0 508.5Z"/>
<path class="dach-r" data-n="Mecklenburg-Vorpommern" id="r-de-mecklenburg-vorpommern" d="M587.3 96.1 599.0 102.4 625.7 103.1 611.8 107.5 597.4 105.0 592.2 108.2 593.6 111.2 580.0 111.9 573.4 122.7 575.4 126.7 573.7 128.7 582.1 131.3 577.7 126.6 588.6 117.9 590.2 111.8 593.5 115.1 600.3 110.1 599.2 107.5 604.2 108.1 603.3 109.5 605.9 113.1 610.5 109.3 612.5 116.9 630.7 102.9 631.2 109.2 637.1 113.7 635.6 116.9 638.2 126.3 653.8 133.3 659.0 141.4 656.6 144.4 665.1 142.2 662.2 147.0 664.7 144.9 668.6 154.7 672.5 155.5 671.4 149.8 689.4 142.7 699.0 152.8 693.6 163.8 708.3 179.6 700.6 187.8 710.4 181.6 707.6 169.6 712.8 169.6 712.3 177.8 714.4 173.6 719.5 176.7 719.9 168.6 713.6 158.7 708.1 158.6 709.2 162.9 703.9 168.2 705.3 162.2 703.5 160.9 695.8 165.3 699.5 153.5 694.0 144.6 698.7 141.7 704.6 153.1 717.0 160.1 735.0 178.4 732.0 180.6 734.7 187.9 719.2 186.8 707.0 191.8 699.0 189.0 719.2 204.2 740.3 206.5 734.5 211.9 739.5 212.4 740.9 222.0 744.0 224.2 742.1 235.3 748.4 247.4 751.9 266.3 743.6 268.8 738.2 276.7 724.5 276.3 736.3 260.5 736.7 252.0 708.6 253.1 705.3 241.1 700.0 239.3 697.5 233.3 696.7 239.8 701.0 242.1 690.6 244.5 683.2 255.0 676.7 256.5 674.7 268.3 667.1 271.3 664.2 278.8 655.2 274.2 649.0 283.2 644.9 278.3 639.5 279.8 627.4 291.3 624.2 289.6 627.0 285.9 608.8 287.7 606.6 286.0 608.3 282.3 600.8 281.5 600.4 277.8 581.1 278.4 576.9 270.8 565.1 267.8 562.5 262.9 557.1 265.5 546.9 261.0 544.6 270.7 538.1 275.5 533.2 274.3 531.0 278.6 525.1 278.0 527.8 281.8 520.2 283.3 510.5 279.4 503.4 284.7 505.6 290.7 502.3 296.5 489.9 294.2 488.8 298.5 471.5 294.5 472.6 288.1 461.3 280.8 454.8 265.6 448.3 263.2 441.3 269.3 430.0 259.1 420.3 259.9 424.0 246.6 440.1 239.0 440.0 229.8 448.7 229.1 450.7 215.5 434.3 204.7 433.1 191.6 435.2 185.6 444.5 178.8 446.7 182.7 452.2 181.2 445.6 179.3 446.2 174.6 470.9 165.8 477.8 170.3 477.8 177.8 484.4 174.2 494.8 182.8 497.3 172.8 493.8 173.9 493.9 168.5 492.5 173.9 489.0 173.2 488.1 168.5 498.1 164.7 495.9 171.9 497.9 172.8 500.4 163.4 505.0 163.3 509.6 154.9 507.7 152.9 501.5 160.9 500.9 157.5 514.6 145.4 529.4 146.6 549.7 141.0 550.1 145.6 553.0 145.9 554.5 142.6 550.4 141.3 571.6 123.9 587.3 96.1ZM666.2 66.1 661.6 73.5 665.5 82.1 688.0 84.4 687.0 90.7 678.4 99.5 681.9 108.0 687.5 108.6 695.6 117.4 691.2 122.1 691.9 127.6 685.1 124.1 690.1 119.7 682.0 121.2 688.3 116.3 682.2 119.1 679.4 115.7 668.5 118.3 663.2 127.9 659.6 128.1 665.3 130.3 663.1 135.4 654.2 130.9 656.9 131.8 658.1 126.9 652.4 130.5 646.3 128.1 645.8 124.1 641.1 126.2 645.0 123.5 638.9 118.9 640.0 113.0 651.7 111.3 647.3 104.3 642.0 104.4 652.2 96.9 648.7 95.9 649.0 92.1 642.7 93.2 641.4 86.8 651.1 86.0 655.5 91.7 654.8 86.0 661.0 81.9 658.3 86.5 661.7 85.0 664.8 94.7 672.9 96.6 672.6 86.5 663.3 82.9 661.1 76.6 650.1 85.0 653.5 71.9 642.9 85.0 650.7 69.8 666.2 66.1ZM640.8 78.0 642.7 81.9 638.6 81.3 639.1 88.2 634.5 100.1 637.4 80.3 640.8 78.0Z"/>
<path class="dach-r" data-n="Niedersachsen" id="r-de-niedersachsen" d="M253.9 184.0 260.5 191.3 271.5 193.5 283.1 192.3 290.0 185.2 306.7 187.4 325.7 212.1 329.2 223.4 348.4 231.9 347.9 239.1 356.4 250.4 359.7 246.0 361.9 249.2 360.3 252.5 367.0 252.4 373.1 245.3 383.9 254.9 397.2 249.9 418.8 260.5 430.0 259.1 441.3 269.3 449.4 263.3 454.8 265.6 461.3 280.8 472.6 288.1 471.5 294.5 478.5 295.7 483.9 305.5 495.2 302.9 507.6 309.5 504.3 314.9 500.0 314.3 499.4 322.8 483.2 332.3 458.9 326.6 454.6 327.6 450.3 335.5 435.0 335.5 437.6 354.3 440.7 353.9 448.5 370.6 453.4 368.4 449.6 376.4 456.2 387.0 450.8 387.0 449.8 391.7 462.1 403.8 454.2 409.0 463.3 424.8 457.0 428.9 461.2 433.1 459.7 437.8 450.9 441.8 453.1 448.7 428.5 449.3 417.4 455.3 425.4 462.3 421.7 464.9 425.4 470.2 418.6 477.7 418.6 487.3 423.4 490.9 429.7 506.8 424.0 510.2 426.2 518.8 421.0 516.2 413.8 519.8 401.3 515.0 398.9 523.8 389.1 531.0 385.5 529.4 380.9 535.0 382.5 536.6 373.2 535.5 363.5 543.7 360.8 538.0 356.0 538.6 357.1 544.2 352.8 538.6 342.9 544.9 345.6 551.5 348.6 548.8 345.1 554.6 330.4 548.0 331.3 541.7 337.8 537.9 337.6 530.7 332.9 523.7 341.5 515.3 336.2 507.7 314.8 506.2 317.2 498.9 315.4 490.7 320.8 485.9 319.6 479.2 322.1 477.1 311.3 477.3 312.1 471.5 305.8 467.0 306.1 461.2 297.2 459.8 299.2 457.1 297.0 451.9 298.4 446.6 293.6 443.6 295.5 439.3 283.4 438.1 280.5 429.2 285.8 431.1 285.1 425.3 288.3 424.2 278.6 417.0 292.3 399.7 290.0 393.9 293.6 389.0 289.8 385.9 286.1 385.5 276.5 399.6 269.1 401.4 256.4 400.7 255.9 385.3 251.6 381.2 238.9 383.7 232.4 392.9 221.2 391.2 222.0 399.1 233.3 405.1 235.7 411.9 233.6 426.7 240.0 430.3 229.9 441.1 218.2 437.7 211.8 446.3 197.6 447.1 192.6 451.6 184.9 444.6 195.6 440.5 196.4 432.3 186.2 428.6 190.9 417.6 188.6 413.5 193.8 412.6 189.4 404.5 170.4 399.8 168.2 392.0 161.2 389.2 158.2 395.6 160.9 397.1 158.9 403.4 133.9 419.4 114.1 422.3 110.6 415.1 114.8 402.5 108.5 390.2 103.7 394.8 83.1 388.0 80.5 377.8 87.9 376.5 84.0 372.9 85.7 364.8 112.5 366.4 116.2 336.2 130.7 314.4 130.3 299.9 127.7 296.1 133.4 290.5 132.7 285.2 131.6 280.3 125.8 279.5 129.6 266.3 110.3 265.4 107.9 261.7 112.3 240.4 110.9 236.7 119.6 236.8 115.8 230.3 121.7 222.8 135.5 214.7 154.0 216.4 196.2 210.7 198.7 220.8 204.4 220.7 209.8 233.6 208.3 239.5 200.4 240.7 201.2 246.7 216.7 256.2 222.3 246.4 222.3 238.3 214.9 238.5 218.4 225.5 239.6 233.3 243.2 237.8 239.9 241.4 244.4 238.9 236.8 213.1 243.3 192.6 253.9 184.0ZM87.3 224.2 91.6 226.5 83.8 229.3 86.2 233.2 75.9 227.2 87.3 224.2Z"/>
<path class="dach-r" data-n="Nordrhein-Westfalen" id="r-de-nordrhein-westfalen" d="M252.7 382.2 255.9 385.3 256.4 400.7 259.1 401.7 276.5 399.6 286.1 385.5 293.0 388.0 289.3 406.2 284.1 407.9 278.6 417.0 288.3 424.2 285.1 425.3 285.8 431.1 280.5 429.2 283.4 438.1 295.5 439.3 293.6 443.6 298.4 446.6 297.0 451.9 299.2 457.1 297.2 459.8 306.1 461.2 305.8 467.0 312.1 471.5 311.3 477.3 322.1 477.1 319.6 479.2 320.8 485.9 315.0 492.8 317.2 498.9 314.8 506.2 320.9 506.5 311.5 511.0 314.5 514.0 301.5 532.5 291.5 534.9 291.4 527.6 285.3 524.2 274.0 529.7 276.3 536.9 278.9 536.8 278.0 542.6 255.9 544.3 249.7 549.7 244.2 558.2 247.1 562.2 259.0 558.7 262.9 567.9 256.4 578.0 258.6 581.5 241.5 583.1 239.7 590.9 243.0 594.4 235.4 601.3 235.8 608.4 227.9 615.7 218.7 612.6 206.3 624.9 210.4 632.1 208.1 638.2 199.4 637.6 192.6 627.2 192.5 617.5 180.4 612.6 182.2 606.4 177.4 604.1 171.9 607.5 174.5 617.5 165.5 621.1 167.7 625.1 165.4 628.3 141.1 635.4 137.6 646.3 127.0 648.5 126.3 645.0 121.1 651.9 112.9 651.4 102.1 657.6 102.3 661.2 98.3 661.9 99.8 670.0 96.3 672.3 91.0 666.9 86.5 669.2 91.4 685.3 82.5 688.0 79.7 683.4 76.8 687.0 73.9 681.0 60.2 687.5 61.1 683.9 55.2 680.6 56.2 689.1 50.6 681.2 53.7 672.2 49.8 665.7 40.6 664.5 36.1 657.9 45.3 648.9 36.2 648.2 36.2 643.2 31.5 636.3 23.6 634.0 22.2 627.2 18.0 624.4 23.5 621.7 22.9 617.5 27.6 617.3 28.3 607.0 22.5 605.4 23.8 598.5 12.8 599.2 10.0 589.2 18.5 591.5 22.5 583.2 36.1 575.1 33.7 572.2 37.9 569.7 29.1 572.0 27.9 562.4 41.3 545.5 39.9 524.5 29.0 512.2 31.5 504.4 24.5 502.0 25.5 496.6 18.0 493.1 21.6 489.3 18.7 480.4 27.1 475.8 35.8 478.6 30.5 472.4 34.9 470.1 57.4 481.3 56.1 474.4 62.9 477.2 81.3 468.0 85.6 471.0 93.9 461.6 93.7 457.4 81.8 451.1 82.0 446.3 85.6 446.1 87.9 439.7 97.2 438.7 107.6 424.4 121.8 418.8 133.9 419.4 158.9 403.4 160.9 397.1 158.2 395.6 161.2 389.2 168.2 392.0 170.4 399.8 189.4 404.5 193.8 412.6 188.6 413.5 190.9 417.6 186.2 428.6 197.0 433.8 194.8 434.6 195.6 440.5 184.9 444.6 187.8 449.7 211.8 446.3 218.2 437.7 229.9 441.1 240.0 430.3 233.6 426.7 235.7 411.9 233.3 405.1 222.0 399.1 220.7 391.7 232.4 392.9 238.9 383.7 252.7 382.2Z"/>
<path class="dach-r" data-n="Rheinland-Pfalz" id="r-de-rheinland-pfalz" d="M177.4 604.1 182.2 606.4 180.4 612.6 192.5 617.5 192.6 627.2 199.4 637.6 205.3 637.2 207.0 649.6 210.0 652.2 207.1 659.9 199.7 657.0 195.8 661.3 194.5 666.9 197.4 671.9 193.4 676.6 202.0 682.0 206.9 695.6 199.3 696.3 201.4 701.4 199.0 704.0 195.4 701.0 187.8 705.2 185.9 709.8 190.1 713.8 189.7 718.9 183.5 715.3 176.2 725.6 185.1 736.7 217.2 729.1 224.9 738.2 225.1 748.7 229.3 753.0 228.3 757.0 232.0 764.3 237.0 764.0 226.2 774.5 232.1 788.5 231.2 793.0 235.4 803.5 233.5 806.6 239.0 807.8 235.2 814.3 238.1 814.2 237.8 818.6 233.9 822.2 237.5 826.4 228.9 834.3 226.3 853.2 215.8 870.6 202.7 867.9 189.3 859.0 183.3 862.0 177.4 858.0 166.2 860.4 154.1 853.6 150.6 844.1 138.7 843.8 133.4 833.8 141.5 827.6 143.5 816.2 133.5 813.7 130.2 807.9 135.0 802.7 132.7 798.4 135.1 794.3 132.5 793.9 131.7 787.5 126.8 790.2 110.7 780.3 74.0 797.2 54.0 793.5 52.7 790.0 57.4 784.2 58.0 777.7 66.0 769.9 67.0 758.5 56.3 757.0 52.7 752.4 48.3 754.9 48.0 750.9 41.7 747.3 40.2 739.3 35.3 739.0 29.7 724.6 33.9 709.2 37.6 707.1 35.9 700.7 45.1 696.8 47.3 689.6 57.7 689.1 54.2 681.1 61.1 683.9 60.2 687.5 73.9 681.0 76.8 687.0 79.7 683.4 82.5 688.0 91.4 685.3 86.5 669.2 91.0 666.9 96.3 672.3 99.8 670.0 98.3 661.9 102.3 661.2 102.1 657.6 112.9 651.4 121.1 651.9 126.3 645.0 127.0 648.5 137.6 646.3 141.1 635.4 165.4 628.3 167.7 625.1 165.5 621.1 174.5 617.5 171.9 607.5 177.4 604.1Z"/>
<path class="dach-r" data-n="Saarland" id="r-de-saarland" d="M111.3 780.7 126.8 790.2 131.7 787.5 132.5 793.9 135.1 794.3 132.7 798.4 135.0 802.7 130.2 807.9 133.5 813.7 143.5 816.2 141.5 827.6 133.4 833.8 139.5 847.2 125.2 851.2 116.5 846.0 113.0 851.5 110.9 841.5 101.4 836.9 94.1 838.0 95.9 842.8 93.6 846.4 85.2 844.6 79.1 829.2 70.2 820.1 73.2 817.7 67.6 808.7 58.6 803.3 52.0 804.6 53.4 793.5 74.0 797.2 102.8 781.3 111.3 780.7Z"/>
<path class="dach-r" data-n="Sachsen-Anhalt" id="r-de-sachsen-anhalt" d="M510.2 311.7 515.0 313.4 515.5 317.7 529.4 321.7 527.2 325.4 528.8 328.1 562.9 335.0 564.9 344.1 561.1 347.3 559.9 355.8 563.1 359.5 563.5 368.0 557.6 368.5 558.5 375.9 555.3 382.7 559.0 381.7 557.3 385.4 560.0 387.0 563.2 382.9 571.6 389.4 566.7 398.3 569.3 399.9 567.6 406.2 569.7 408.3 564.2 421.4 568.3 425.6 561.4 433.4 566.5 442.4 580.0 454.6 584.8 452.6 589.9 459.5 601.5 455.6 611.4 462.6 616.7 461.6 617.1 466.3 626.5 466.0 627.5 470.7 633.8 470.9 633.2 475.0 643.1 474.7 640.9 478.3 646.2 496.6 632.4 507.7 630.4 503.5 625.1 507.5 615.3 501.6 610.4 506.7 602.6 504.4 598.3 510.6 563.7 517.6 560.0 522.7 560.4 528.8 555.7 531.8 559.7 537.6 559.6 550.4 555.9 551.8 560.9 566.2 558.3 570.8 561.4 570.8 560.3 576.4 563.9 578.0 562.3 580.5 567.9 583.1 564.7 590.2 568.9 591.3 562.5 603.8 558.9 598.7 543.9 600.0 540.3 596.5 541.3 593.9 532.0 587.8 521.6 590.3 513.4 580.5 496.3 581.0 496.4 569.7 487.1 565.6 497.0 554.8 490.3 548.6 489.8 542.9 483.6 539.3 454.6 538.4 456.2 536.9 452.6 536.4 453.1 529.6 450.0 527.0 451.1 521.8 445.4 515.6 450.0 513.5 449.0 510.3 429.7 506.8 423.4 490.9 418.6 487.3 418.6 477.7 425.4 470.2 421.7 464.9 425.4 462.3 419.5 459.6 417.9 454.3 423.2 454.9 428.5 449.3 453.1 448.7 450.9 441.8 459.7 437.8 461.2 433.1 457.0 428.9 463.3 424.8 454.2 409.0 462.1 403.8 449.8 391.7 450.8 387.0 456.2 387.0 449.6 376.4 453.4 368.4 448.5 370.6 440.7 353.9 437.6 354.3 435.0 335.5 450.3 335.5 454.6 327.6 458.9 326.6 483.2 332.3 499.4 322.8 500.5 313.7 511.9 309.6 510.2 311.7Z"/>
<path class="dach-r" data-n="Sachsen" id="r-de-sachsen" d="M618.4 502.7 625.1 507.5 630.4 503.5 637.5 512.0 643.7 513.1 643.1 518.3 648.7 523.6 645.7 536.9 648.3 536.5 649.2 541.1 653.9 542.8 658.2 535.2 663.4 537.3 665.6 533.3 677.6 545.0 696.6 546.1 713.3 540.9 717.1 544.4 722.8 534.1 720.1 529.6 725.1 529.6 723.8 527.4 729.1 520.6 745.5 526.7 765.3 516.8 773.6 519.8 775.7 513.0 780.0 523.5 794.8 527.8 799.5 533.3 799.8 547.1 805.1 553.3 805.9 563.0 796.6 597.4 787.0 611.1 785.7 619.8 768.9 616.2 772.4 605.5 764.4 606.8 767.5 597.8 759.4 593.9 759.4 589.1 758.4 593.4 750.3 595.1 741.3 588.7 737.2 599.9 750.6 604.2 748.1 611.6 737.9 611.9 720.9 623.7 711.9 623.3 706.7 626.0 707.0 631.6 702.8 635.0 676.6 635.7 674.6 646.3 669.4 651.7 661.5 645.2 657.3 653.7 650.6 652.2 646.0 664.8 631.9 663.7 631.4 671.8 627.0 676.5 614.1 670.5 603.4 678.8 595.5 675.9 587.0 678.5 585.0 685.4 573.7 695.3 570.6 708.4 566.7 708.0 566.8 701.9 562.5 698.4 564.1 695.4 559.1 694.9 559.0 689.0 552.5 690.4 540.0 684.5 540.7 679.4 532.9 672.3 538.5 670.7 539.6 666.2 531.6 658.6 543.7 645.8 545.5 657.0 556.4 653.9 555.6 646.8 566.5 645.7 571.4 639.1 563.2 631.0 568.4 626.1 564.9 620.5 581.3 617.3 585.0 610.4 600.0 606.2 596.1 596.0 588.9 595.8 590.0 592.3 587.4 593.2 587.0 587.1 582.9 583.9 562.3 580.5 563.9 578.0 560.3 576.4 561.4 570.8 558.3 570.8 560.9 566.2 555.9 551.8 559.6 550.4 559.7 537.6 555.7 531.8 560.4 528.8 559.4 523.7 563.7 517.6 618.4 502.7Z"/>
<path class="dach-r" data-n="Schleswig-Holstein" id="r-de-schleswig-holstein" d="M461.4 88.6 475.6 92.8 482.5 108.4 465.6 108.3 463.5 101.9 456.1 102.6 456.8 94.6 461.4 88.6ZM230.2 11.9 233.2 16.1 225.5 23.5 226.7 33.3 232.1 37.1 265.3 31.2 301.2 40.3 306.2 48.4 317.1 42.6 319.4 50.5 334.9 37.3 334.0 44.0 350.4 49.2 354.8 55.4 360.3 54.2 360.4 49.2 364.6 51.8 371.5 68.0 367.0 63.6 363.1 67.9 362.7 74.7 348.5 81.7 344.2 89.6 363.1 75.3 364.0 67.8 371.4 68.3 370.9 86.2 354.6 98.7 357.1 101.7 379.5 96.0 385.8 100.4 383.1 103.6 385.1 110.2 381.3 113.3 379.9 121.9 384.5 119.5 383.9 114.5 388.3 106.7 396.1 103.4 420.9 114.3 429.7 122.9 436.9 121.9 449.1 111.4 466.4 110.1 460.4 115.5 463.4 138.8 444.8 155.0 438.3 153.9 433.7 160.9 436.8 168.6 444.7 170.2 445.6 179.3 452.2 181.2 446.7 182.7 444.5 178.8 435.2 185.6 433.1 191.6 434.3 204.7 450.7 215.5 448.7 229.1 440.0 229.8 440.1 239.0 424.0 246.6 422.5 257.3 418.8 260.5 396.2 249.9 397.7 247.2 383.1 236.5 382.3 228.5 386.8 227.9 385.6 223.6 388.3 221.9 380.9 213.9 385.7 207.9 384.0 205.2 375.8 208.0 374.8 213.9 368.7 213.4 367.6 218.3 360.4 217.8 353.3 227.6 347.6 221.2 344.5 231.4 340.1 230.5 329.2 223.4 325.7 212.1 306.7 187.4 277.3 182.5 266.0 164.5 278.5 162.9 280.4 159.0 275.3 148.6 269.4 150.0 264.9 142.2 267.4 130.8 273.2 129.6 277.5 121.7 269.7 128.3 268.1 125.3 268.3 129.1 266.3 124.9 250.8 127.7 245.1 122.2 247.3 115.0 254.4 115.1 247.7 110.7 270.0 108.1 283.7 97.8 280.0 90.7 273.7 99.5 264.8 98.2 264.7 94.1 270.5 89.6 272.1 79.9 265.4 79.2 267.9 76.6 266.2 71.9 254.5 59.3 255.0 53.3 246.1 35.9 231.0 41.7 221.8 37.6 223.7 39.2 220.9 41.1 220.7 57.5 219.1 56.0 220.7 32.3 230.2 11.9ZM241.7 55.4 246.5 60.9 244.0 66.8 229.3 63.0 231.4 57.3 241.7 55.4Z"/>
<path class="dach-r" data-n="Thüringen" id="r-de-thueringen" d="M435.5 506.6 450.1 511.9 445.4 515.6 451.1 521.8 450.0 527.0 453.1 529.6 452.6 536.4 456.2 536.9 454.6 538.4 483.6 539.3 489.8 542.9 490.3 548.6 497.0 554.8 487.1 565.6 496.4 569.7 497.9 573.3 494.8 576.4 497.8 582.1 513.4 580.5 521.6 590.3 532.0 587.8 541.3 593.9 540.3 596.5 543.9 600.0 558.9 598.7 562.0 603.8 568.8 592.8 564.7 590.2 567.9 583.1 582.9 583.9 587.0 587.1 587.4 593.2 590.0 592.3 588.9 595.8 596.1 596.0 600.0 606.7 585.0 610.4 581.3 617.3 564.9 620.5 568.4 626.1 563.2 631.0 566.3 631.0 566.2 637.1 570.8 641.1 566.5 645.7 560.3 644.7 559.7 648.3 556.1 646.3 554.9 652.9 557.0 653.4 547.6 657.0 544.5 655.5 544.7 646.8 541.1 647.4 536.3 656.5 531.6 658.6 539.6 666.7 537.6 667.2 538.5 670.7 532.9 672.3 536.4 674.3 530.7 677.9 526.6 679.4 523.1 675.4 500.6 682.1 497.1 674.0 494.1 675.5 491.6 671.5 492.6 662.8 485.5 661.9 483.5 666.4 476.8 668.0 479.8 683.2 477.2 696.8 467.7 693.8 469.1 688.3 465.1 683.3 459.1 686.3 455.1 683.3 455.2 686.3 450.1 679.8 444.6 679.3 430.7 684.9 431.8 690.0 442.2 696.0 442.2 700.0 432.3 699.1 431.8 705.7 422.1 702.7 421.0 688.0 411.3 685.0 408.2 678.4 402.6 679.4 403.6 675.3 397.5 665.7 379.6 656.0 371.9 662.7 373.9 657.0 371.8 649.3 376.0 648.3 372.7 640.6 364.3 641.5 363.8 647.1 357.5 645.5 363.2 632.4 361.6 628.8 364.7 626.3 364.2 620.7 370.4 619.2 370.3 614.6 373.9 612.1 369.7 606.9 366.6 609.0 367.6 604.9 364.0 606.4 364.0 603.3 374.4 603.4 370.2 598.8 372.2 594.2 386.2 595.8 386.1 590.2 381.5 588.6 384.0 579.9 379.3 576.8 383.4 575.3 387.1 579.9 389.1 571.2 375.1 564.9 373.5 557.7 366.2 556.6 361.9 544.7 373.2 535.5 382.5 536.6 380.9 535.0 385.5 529.4 394.8 527.9 400.4 521.8 401.3 515.0 425.7 519.4 424.0 510.2 435.5 506.6Z"/>
</g>
<g class="dach-c dach-at">
<path class="dach-r" data-n="Vorarlberg" id="r-at-vorarlberg" d="M379.9 1122.2 379.6 1124.3 381.6 1125.2 382.1 1128.0 380.8 1128.1 378.7 1133.8 376.8 1135.2 380.8 1144.9 377.4 1146.2 375.8 1143.6 373.4 1143.6 369.8 1138.4 357.5 1134.2 357.3 1129.5 358.8 1127.3 357.5 1123.2 353.5 1124.1 349.5 1121.0 346.3 1121.2 340.2 1118.1 336.7 1119.3 334.1 1118.2 336.4 1115.3 335.3 1106.6 333.7 1106.6 331.2 1103.5 332.2 1099.8 329.6 1097.0 330.7 1095.2 327.5 1091.4 332.5 1085.4 334.0 1081.0 338.9 1078.5 339.9 1075.9 338.0 1073.7 337.5 1069.8 338.7 1068.2 334.1 1065.8 332.9 1066.3 330.2 1061.4 345.0 1057.6 348.8 1050.0 352.6 1050.7 352.3 1055.9 357.3 1058.3 357.8 1055.8 361.5 1058.2 363.1 1057.1 365.2 1057.9 368.2 1064.2 371.5 1063.4 374.4 1067.6 376.0 1067.1 377.2 1070.9 374.4 1073.8 376.9 1080.6 378.6 1077.9 383.0 1078.5 382.9 1076.6 385.2 1076.2 386.7 1077.3 387.9 1076.2 388.8 1078.2 385.6 1084.2 387.0 1086.2 383.2 1090.3 387.5 1093.6 385.4 1095.7 386.7 1099.9 385.3 1101.1 387.5 1106.9 380.8 1113.6 379.9 1117.8 381.9 1119.7 379.9 1122.2Z"/>
<path class="dach-r" data-n="Tirol" id="r-at-tirol" d="M603.7 1159.5 601.9 1169.5 597.6 1170.1 596.7 1168.9 591.3 1170.2 586.7 1166.8 580.4 1165.5 574.7 1161.2 572.9 1154.5 566.6 1153.5 566.5 1149.5 568.5 1147.1 567.2 1143.1 565.7 1140.7 562.4 1140.1 560.8 1142.0 558.4 1137.9 555.8 1137.5 556.5 1133.8 553.9 1131.5 552.4 1125.2 554.7 1122.8 559.7 1122.5 560.7 1118.5 571.9 1112.0 573.4 1107.9 576.6 1106.5 577.7 1107.7 582.3 1107.5 583.9 1105.8 587.2 1106.7 589.9 1109.7 591.1 1108.6 595.4 1110.5 602.8 1116.9 603.6 1119.8 608.4 1120.3 604.9 1126.9 606.5 1131.0 614.6 1137.1 614.9 1143.6 625.6 1151.5 625.8 1152.9 622.8 1155.9 620.0 1154.3 614.9 1157.8 611.0 1157.0 603.7 1159.5ZM422.4 1143.2 416.5 1146.3 416.2 1145.0 409.0 1144.4 408.6 1140.7 410.7 1133.9 405.5 1131.5 405.3 1129.1 402.0 1125.9 398.5 1127.1 396.7 1131.8 395.1 1132.3 395.8 1135.4 394.0 1136.1 389.2 1134.6 388.4 1142.9 385.0 1142.9 382.9 1144.9 380.8 1144.9 376.8 1135.2 378.7 1133.8 380.8 1128.1 382.1 1128.0 381.6 1125.2 379.6 1124.3 381.9 1119.7 379.8 1116.0 387.5 1106.9 385.3 1101.1 386.7 1099.9 385.4 1095.7 387.5 1093.6 383.7 1091.5 388.4 1091.4 396.9 1087.0 402.7 1077.8 406.2 1077.3 406.3 1073.1 409.5 1070.8 408.5 1064.2 406.5 1063.7 405.7 1061.5 407.7 1054.8 410.7 1056.8 418.0 1057.6 420.1 1053.0 434.1 1057.5 435.7 1060.2 445.5 1057.2 446.9 1059.7 443.8 1062.3 443.9 1064.3 449.7 1064.5 449.2 1066.1 453.6 1071.0 452.5 1074.8 463.8 1075.5 472.9 1070.5 476.8 1070.7 474.4 1075.2 478.7 1075.1 480.2 1073.9 480.3 1071.3 484.2 1068.6 491.7 1069.1 490.6 1066.3 488.9 1066.2 491.2 1061.7 493.5 1059.7 494.1 1061.0 504.8 1060.1 507.7 1051.5 510.7 1049.9 512.2 1051.2 522.4 1050.3 528.6 1051.4 529.3 1048.8 543.0 1046.1 543.6 1047.6 547.5 1046.7 553.1 1048.4 557.4 1047.3 557.4 1049.0 559.5 1048.3 556.0 1036.1 561.6 1033.9 563.6 1030.9 564.9 1032.0 563.0 1037.3 564.2 1038.9 570.3 1036.8 573.5 1038.3 580.1 1036.8 580.2 1039.6 585.2 1045.9 588.5 1044.4 591.8 1044.9 591.8 1048.5 599.8 1051.9 596.4 1055.6 598.7 1057.2 599.6 1061.2 602.6 1064.8 596.8 1066.5 597.2 1070.1 592.1 1075.8 585.8 1075.6 583.8 1077.6 585.1 1081.6 583.4 1084.3 580.3 1084.0 574.4 1086.2 571.0 1084.0 567.6 1084.0 564.8 1087.4 560.9 1086.2 554.4 1089.2 551.8 1086.8 548.7 1090.8 551.4 1095.3 549.1 1101.0 550.0 1107.3 553.0 1112.0 553.7 1115.7 552.2 1116.6 550.6 1116.0 548.5 1118.4 536.1 1121.2 527.7 1126.8 522.9 1126.9 519.9 1129.9 516.8 1126.8 512.7 1127.0 509.5 1124.2 501.8 1128.0 499.6 1125.4 496.6 1124.5 491.3 1130.2 488.2 1129.7 486.2 1127.2 482.9 1126.9 476.0 1129.8 469.3 1130.3 468.5 1134.3 465.1 1134.7 463.3 1137.6 463.9 1139.9 461.3 1144.2 462.3 1148.5 459.4 1150.3 457.0 1155.7 447.9 1154.5 444.9 1156.1 441.2 1153.7 438.9 1154.5 437.3 1152.5 431.6 1152.8 431.3 1151.6 434.6 1148.5 433.7 1147.1 431.0 1146.6 426.2 1141.8 422.4 1143.2ZM407.7 1054.8 405.8 1053.0 406.0 1051.2 409.0 1050.8 409.3 1052.8 407.7 1054.8Z"/>
<path class="dach-r" data-n="Wien" id="r-at-wien" d="M921.0 980.7 917.4 979.5 916.3 981.9 912.4 980.0 908.2 980.8 907.4 978.2 908.6 977.5 906.4 977.3 905.0 975.2 907.2 971.1 905.3 968.4 907.3 963.0 910.2 966.4 911.5 966.2 914.3 962.2 920.8 960.7 922.4 956.1 926.4 955.7 927.5 959.4 930.4 961.6 931.0 959.3 932.8 959.6 934.4 963.0 936.7 963.2 935.8 974.4 938.6 976.1 939.2 979.8 933.8 976.8 927.1 979.5 927.2 981.8 921.0 980.7Z"/>
<path class="dach-r" data-n="Kärnten" id="r-at-kaernten" d="M753.3 1196.5 742.3 1198.0 740.1 1196.4 736.1 1197.8 734.3 1196.5 729.0 1197.4 726.1 1192.3 720.0 1190.2 716.1 1191.7 707.9 1186.6 698.1 1188.5 682.7 1184.0 678.3 1184.4 677.7 1182.9 673.4 1183.1 672.5 1180.9 665.5 1181.9 661.0 1179.3 656.7 1182.6 650.7 1181.7 649.5 1182.7 643.4 1178.1 623.0 1175.5 616.0 1176.1 614.3 1175.4 614.6 1173.2 609.3 1170.8 605.4 1172.3 601.9 1169.5 603.7 1159.5 611.0 1157.0 614.9 1157.8 620.0 1154.3 622.8 1155.9 625.8 1152.9 625.6 1151.5 614.9 1143.6 614.6 1137.1 606.5 1131.0 604.9 1126.9 608.4 1120.3 603.6 1119.8 602.8 1116.9 598.9 1113.3 600.1 1112.3 599.7 1110.3 605.4 1109.2 606.0 1113.2 613.1 1113.5 614.5 1115.4 621.7 1115.5 625.7 1121.0 629.0 1120.3 635.1 1124.2 635.7 1122.5 650.3 1119.5 650.4 1114.8 652.8 1113.8 661.7 1114.2 664.0 1117.1 665.8 1115.6 668.5 1115.7 679.2 1119.3 684.1 1118.9 684.8 1120.8 688.3 1120.9 689.0 1125.2 695.7 1128.9 696.0 1132.0 699.5 1136.3 702.4 1137.5 716.1 1129.7 716.8 1125.7 721.8 1124.3 727.1 1118.0 729.6 1119.3 733.1 1116.3 736.0 1122.6 737.3 1121.5 747.1 1122.7 748.8 1124.3 749.1 1128.5 752.9 1125.9 755.2 1126.5 755.5 1124.5 756.5 1125.0 758.3 1122.8 761.3 1124.8 766.4 1124.4 769.0 1126.2 770.1 1124.2 776.2 1123.9 788.9 1119.8 789.1 1121.7 794.0 1125.9 799.5 1128.3 804.7 1137.4 803.1 1141.2 804.1 1145.7 802.0 1147.9 800.3 1153.3 805.1 1155.3 806.1 1161.4 804.5 1167.9 808.0 1170.1 803.8 1171.5 800.6 1176.5 798.5 1172.5 795.5 1174.6 795.7 1176.3 791.1 1175.8 787.0 1183.8 786.6 1188.1 783.7 1189.4 779.9 1188.6 778.9 1190.4 777.6 1189.3 776.3 1193.9 766.5 1198.2 765.8 1204.8 764.6 1205.1 760.9 1198.9 758.3 1200.3 754.3 1199.2 753.3 1196.5Z"/>
<path class="dach-r" data-n="Burgenland" id="r-at-burgenland" d="M894.9 1145.0 894.3 1146.5 888.9 1146.9 890.1 1141.6 895.6 1134.1 897.4 1134.3 899.8 1127.1 902.6 1127.1 896.8 1116.7 899.1 1105.6 891.8 1077.5 894.5 1076.8 896.5 1073.6 897.3 1076.1 898.2 1075.4 898.0 1072.9 908.6 1071.3 915.5 1066.2 918.7 1059.9 916.5 1056.5 916.4 1053.6 917.8 1049.4 921.2 1046.4 921.6 1043.6 920.2 1038.9 916.1 1037.9 914.5 1032.5 915.6 1025.3 912.6 1024.5 913.2 1022.2 916.0 1022.4 916.6 1025.3 919.5 1022.6 922.9 1017.8 919.4 1014.5 923.0 1012.8 924.0 1013.5 925.6 1008.7 928.5 1005.9 934.3 1004.7 939.6 1011.8 944.8 1004.4 949.9 1001.8 950.2 995.9 961.1 993.6 965.1 988.0 968.8 988.6 969.1 990.8 973.4 992.1 973.4 994.0 974.9 993.6 977.5 987.9 973.5 984.3 975.9 983.2 976.7 985.5 979.2 986.5 981.8 982.0 984.1 984.5 982.7 986.2 982.1 990.0 983.7 991.5 982.6 993.8 983.9 994.8 985.6 993.4 990.0 996.6 984.3 1001.2 986.2 1002.5 983.9 1005.9 985.8 1006.8 983.4 1013.7 977.6 1014.5 977.0 1015.9 980.5 1018.4 982.3 1022.2 980.5 1024.1 982.2 1032.6 984.1 1035.2 964.9 1037.5 964.5 1033.4 961.1 1038.5 954.3 1038.6 951.8 1031.7 946.3 1030.9 944.3 1028.6 942.1 1028.4 936.8 1029.6 935.8 1031.5 937.2 1033.3 932.4 1035.8 930.4 1038.6 928.1 1036.7 927.7 1039.6 925.8 1040.8 932.4 1044.0 934.1 1043.3 938.9 1046.6 945.9 1046.2 947.9 1051.4 946.8 1053.1 948.6 1054.1 950.5 1059.0 945.9 1061.9 947.4 1065.3 946.7 1067.7 940.3 1071.9 939.2 1074.0 934.1 1073.5 932.3 1076.1 931.7 1074.0 927.9 1074.0 928.9 1079.0 926.9 1080.9 929.4 1083.0 931.7 1090.2 930.8 1092.4 926.6 1094.0 927.6 1094.2 927.1 1099.2 925.4 1099.7 926.4 1102.3 928.6 1101.9 928.7 1107.8 934.1 1106.9 935.2 1109.7 932.6 1110.2 932.7 1111.9 929.6 1113.3 931.5 1117.2 934.4 1118.1 927.3 1122.2 928.1 1123.1 929.5 1121.8 933.4 1125.5 931.2 1126.7 928.4 1125.4 926.3 1126.8 925.0 1125.3 921.6 1126.1 919.6 1124.6 919.0 1126.1 915.5 1126.1 914.3 1124.2 913.2 1130.7 906.4 1133.6 904.8 1137.8 894.9 1145.0Z"/>
<path class="dach-r" data-n="Oberösterreich" id="r-at-oberoesterreich" d="M689.0 1051.8 692.6 1052.1 694.4 1055.2 693.5 1056.5 694.8 1059.4 691.0 1065.4 691.5 1066.8 679.6 1065.2 671.3 1060.3 670.3 1053.2 672.6 1051.4 674.2 1046.8 670.8 1043.8 676.6 1034.4 666.6 1031.2 669.1 1025.1 673.5 1026.9 675.2 1026.4 674.7 1023.7 670.9 1024.5 670.7 1023.3 667.8 1022.8 662.9 1024.0 658.7 1021.6 655.8 1021.6 653.9 1020.2 654.2 1015.1 652.2 1011.5 653.1 1003.3 655.4 1002.1 659.9 1005.2 661.0 1001.0 654.9 998.0 655.1 996.4 646.0 1000.8 641.3 1000.7 639.5 997.9 633.7 995.7 632.8 992.6 626.2 994.3 623.5 992.7 621.1 994.4 619.3 998.6 616.6 997.8 615.6 995.1 607.3 986.1 608.3 980.7 609.9 981.4 611.4 978.3 613.8 977.5 617.8 971.1 624.8 970.2 630.3 964.1 636.7 961.2 644.3 959.0 650.8 959.3 664.1 948.9 666.6 941.9 665.8 938.1 668.4 930.9 666.8 924.5 670.0 924.9 673.1 920.3 678.0 924.1 681.3 923.4 691.9 930.5 693.8 927.9 694.3 923.7 695.6 925.2 698.3 922.5 698.3 919.3 700.4 916.6 699.6 906.6 701.4 905.9 699.4 905.8 698.3 903.8 701.6 896.5 704.9 897.3 711.7 904.0 715.8 904.8 718.6 908.9 720.8 909.5 720.6 911.5 716.5 913.9 719.5 915.9 720.3 918.5 723.9 920.1 727.1 919.4 739.0 921.6 744.5 925.4 746.2 923.1 749.3 922.8 749.1 920.1 752.9 920.6 754.9 915.0 754.1 913.4 756.8 913.3 759.3 916.8 763.7 918.3 768.2 915.3 770.0 918.5 771.7 917.8 773.2 921.5 777.4 921.9 779.5 925.3 780.6 924.0 783.5 924.3 793.5 929.2 795.5 931.5 791.0 935.0 791.6 938.0 797.1 942.3 797.8 943.9 796.5 946.1 798.6 946.4 799.3 948.1 797.5 955.3 801.2 955.8 801.7 964.1 798.2 968.9 800.1 971.6 797.6 967.8 792.5 967.1 790.3 967.9 787.5 972.8 779.8 975.0 777.7 974.2 775.3 977.0 771.4 974.6 766.9 969.0 760.8 966.5 758.1 968.6 756.2 978.2 758.4 983.1 755.3 985.9 755.2 991.8 758.4 997.7 770.3 1004.8 776.7 1007.1 778.8 1005.8 781.5 1010.3 781.8 1014.0 777.2 1016.8 778.3 1019.1 777.5 1021.6 779.1 1023.4 777.4 1024.6 779.7 1029.9 776.1 1027.7 771.7 1032.9 768.9 1032.3 761.7 1034.5 760.5 1038.6 758.0 1038.5 754.1 1042.0 750.1 1042.3 749.6 1044.5 743.9 1048.1 738.5 1047.8 734.9 1043.7 735.7 1042.6 733.4 1042.3 731.0 1044.2 720.0 1046.9 720.4 1040.4 716.5 1036.1 708.6 1035.6 703.4 1032.7 702.6 1034.4 696.2 1033.9 690.2 1041.8 689.0 1051.8Z"/>
<path class="dach-r" data-n="Niederösterreich" id="r-at-niederoesterreich" d="M911.2 1068.6 908.6 1071.3 904.1 1071.9 900.7 1068.0 898.9 1059.2 894.9 1061.7 894.9 1063.7 891.5 1060.3 881.7 1058.1 879.5 1052.8 875.9 1053.3 877.1 1047.0 875.4 1046.8 873.7 1044.2 870.2 1043.7 867.5 1045.0 865.3 1043.1 864.8 1034.9 862.9 1034.6 861.3 1036.4 859.0 1033.9 857.6 1034.2 855.5 1029.6 847.0 1030.2 846.4 1027.5 842.4 1027.2 840.0 1024.4 838.2 1025.3 837.5 1021.9 835.3 1020.3 828.4 1020.6 827.5 1024.4 821.3 1023.8 819.7 1029.3 814.1 1028.7 813.8 1030.1 810.1 1030.9 807.2 1030.9 805.4 1029.4 800.0 1030.6 796.1 1034.9 791.7 1034.2 790.1 1031.0 788.5 1031.8 786.6 1030.5 782.2 1032.8 777.4 1024.6 779.1 1023.4 777.5 1021.6 778.3 1019.1 777.2 1016.8 782.4 1013.0 778.8 1005.8 776.7 1007.1 768.3 1004.0 761.7 998.7 758.4 997.7 755.2 991.8 755.3 985.9 758.4 983.1 756.2 978.2 757.3 971.2 758.1 968.6 760.8 966.5 766.9 969.0 771.4 974.6 775.3 977.0 777.7 974.2 779.8 975.0 787.5 972.8 790.3 967.9 792.5 967.1 797.6 967.8 800.1 971.6 798.2 968.9 801.7 964.1 801.2 955.8 797.5 955.3 799.3 948.1 798.6 946.4 796.5 946.1 797.8 943.9 797.1 942.3 791.6 938.0 791.0 935.0 795.5 931.5 786.0 925.2 781.8 923.8 779.5 925.3 775.6 921.1 778.2 918.8 777.4 912.5 778.8 907.5 785.7 901.5 785.7 895.7 792.1 895.4 798.5 898.3 800.7 896.0 798.6 894.4 801.3 880.2 800.3 870.2 804.3 863.6 807.5 864.3 808.0 866.4 816.2 867.7 816.3 874.1 821.9 871.6 825.1 872.5 827.7 868.4 830.3 869.5 831.2 868.4 834.3 868.8 839.7 872.8 843.1 872.7 846.0 874.8 847.0 877.7 859.1 881.8 862.5 885.4 867.8 885.9 870.1 882.9 875.1 882.6 877.5 885.9 882.3 887.7 883.6 890.3 884.8 889.8 884.8 892.1 888.7 895.5 898.2 900.0 918.4 901.7 918.8 900.3 920.5 902.2 922.5 901.9 927.0 897.3 929.6 891.5 934.0 892.4 936.2 890.9 940.7 895.0 945.8 894.7 947.8 896.5 948.5 902.3 952.5 901.1 956.6 904.4 967.9 904.1 972.1 926.5 970.9 929.5 968.5 930.9 968.6 932.9 967.2 932.6 963.0 938.8 964.1 943.0 962.3 950.5 968.0 954.9 966.9 956.9 971.9 963.9 971.4 966.9 974.0 975.0 978.4 979.0 981.0 978.7 981.6 983.1 979.6 984.2 979.2 986.5 976.7 985.5 975.9 983.2 973.5 984.3 977.5 987.9 974.9 993.6 973.4 994.0 973.4 992.1 969.1 990.8 968.8 988.6 966.5 987.7 962.7 990.2 961.1 993.6 950.2 995.9 949.9 1001.8 944.8 1004.4 939.1 1012.1 934.3 1004.7 931.5 1004.8 927.2 1006.8 924.0 1013.5 923.0 1012.8 919.4 1014.5 922.9 1017.8 922.0 1019.8 916.6 1025.3 916.0 1022.4 914.0 1021.8 912.6 1024.5 915.6 1025.3 914.8 1034.2 916.1 1037.9 920.2 1038.9 921.2 1046.4 917.8 1049.4 916.4 1053.6 916.5 1056.5 918.7 1059.9 915.5 1066.2 911.2 1068.6Z"/>
<path class="dach-r" data-n="Steiermark" id="r-at-steiermark" d="M808.0 1170.1 804.5 1167.9 806.1 1161.4 805.1 1155.3 800.3 1153.3 802.0 1147.9 804.1 1145.7 803.1 1141.2 804.7 1137.4 799.5 1128.3 794.0 1125.9 789.1 1121.7 788.9 1119.8 776.2 1123.9 770.1 1124.2 769.0 1126.2 766.4 1124.4 761.3 1124.8 758.3 1122.8 756.5 1125.0 755.5 1124.5 755.2 1126.5 752.9 1125.9 749.1 1128.5 748.8 1124.3 747.1 1122.7 737.3 1121.5 736.0 1122.6 733.1 1116.3 729.6 1119.3 727.1 1118.0 721.8 1124.3 716.8 1125.7 716.1 1129.7 712.8 1130.6 710.9 1133.5 706.9 1134.4 705.3 1136.4 702.4 1137.5 696.9 1133.1 699.3 1132.1 703.8 1126.4 703.7 1123.4 707.5 1117.0 705.0 1113.1 706.2 1111.4 710.7 1108.5 711.6 1110.0 714.5 1109.7 714.9 1107.8 708.6 1104.0 702.5 1096.6 704.1 1095.0 700.2 1091.9 700.4 1088.5 694.8 1092.0 694.0 1090.7 691.2 1090.7 690.5 1092.8 681.5 1089.8 677.7 1072.5 680.2 1067.0 679.6 1065.2 691.5 1066.8 691.0 1065.4 694.8 1059.4 693.5 1056.5 694.4 1055.2 692.6 1052.1 689.0 1051.8 689.0 1046.1 690.9 1040.1 692.7 1039.6 696.2 1033.9 702.6 1034.4 703.4 1032.7 708.6 1035.6 716.5 1036.1 720.4 1040.4 720.0 1046.9 731.0 1044.2 733.4 1042.3 735.7 1042.6 734.9 1043.7 738.5 1047.8 743.9 1048.1 749.6 1044.5 750.1 1042.3 754.1 1042.0 758.0 1038.5 760.5 1038.6 761.7 1034.5 768.9 1032.3 771.7 1032.9 776.1 1027.7 782.2 1032.8 786.6 1030.5 788.5 1031.8 790.1 1031.0 791.7 1034.2 796.1 1034.9 800.0 1030.6 805.4 1029.4 807.2 1030.9 810.1 1030.9 813.8 1030.1 814.1 1028.7 819.7 1029.3 821.3 1023.8 827.5 1024.4 828.4 1020.6 835.3 1020.3 837.5 1021.9 838.2 1025.3 840.0 1024.4 842.4 1027.2 846.4 1027.5 847.0 1030.2 855.5 1029.6 857.6 1034.2 859.0 1033.9 861.3 1036.4 862.9 1034.6 864.8 1034.9 865.3 1043.1 867.5 1045.0 870.2 1043.7 873.7 1044.2 875.4 1046.8 877.1 1047.0 875.9 1053.3 879.5 1052.8 881.7 1058.1 891.5 1060.3 894.9 1063.7 894.9 1061.7 898.9 1059.2 900.7 1068.0 904.1 1071.9 898.0 1072.9 897.3 1076.1 896.5 1073.6 891.8 1078.5 899.1 1105.6 896.8 1116.7 902.6 1127.1 899.8 1127.1 897.4 1134.3 895.6 1134.1 890.1 1141.6 888.0 1147.9 889.0 1149.9 887.9 1157.4 892.9 1165.9 892.5 1169.6 878.6 1161.5 874.5 1161.3 869.2 1164.1 858.8 1163.3 859.2 1164.9 857.4 1166.4 854.0 1165.3 849.8 1167.8 849.6 1172.6 843.4 1175.2 841.4 1171.3 838.3 1169.7 827.9 1170.1 822.9 1171.7 815.0 1169.1 813.8 1170.3 812.0 1169.1 809.5 1171.0 808.0 1170.1Z"/>
<path class="dach-r" data-n="Salzburg" id="r-at-salzburg" d="M698.3 1132.2 696.9 1133.1 695.7 1128.9 689.0 1125.2 688.3 1120.9 668.5 1115.7 665.8 1115.6 664.0 1117.1 661.7 1114.2 659.5 1113.6 650.4 1114.8 650.3 1119.5 635.7 1122.5 635.1 1124.2 629.0 1120.3 625.7 1121.0 621.7 1115.5 614.5 1115.4 613.1 1113.5 606.0 1113.2 605.4 1109.2 599.7 1110.3 600.1 1112.3 598.9 1113.3 592.9 1109.1 589.9 1109.7 587.2 1106.7 583.9 1105.8 582.3 1107.5 577.7 1107.7 576.6 1106.5 573.4 1107.9 573.0 1111.1 566.5 1114.1 564.6 1116.7 562.8 1117.1 558.0 1114.2 553.7 1115.7 552.8 1114.1 549.1 1101.0 551.4 1095.3 548.5 1091.5 551.8 1086.8 554.4 1089.2 560.9 1086.2 564.8 1087.4 567.6 1084.0 571.0 1084.0 574.4 1086.2 580.3 1084.0 582.7 1084.6 584.9 1082.8 583.5 1078.9 585.8 1075.6 592.1 1075.8 597.2 1070.1 596.8 1066.5 602.6 1064.8 599.6 1061.2 598.7 1057.2 596.4 1055.6 599.8 1051.9 591.8 1048.5 591.8 1044.9 594.3 1039.8 598.2 1040.1 599.7 1038.7 606.6 1039.3 609.7 1044.9 613.5 1047.6 612.0 1047.8 609.6 1051.8 610.9 1054.7 615.4 1056.0 615.8 1058.0 620.8 1062.4 626.2 1065.3 627.5 1064.4 628.8 1066.6 632.9 1063.0 631.4 1057.8 633.6 1054.6 632.3 1052.1 634.9 1050.4 635.0 1047.6 637.2 1044.8 635.5 1037.8 629.6 1033.3 627.6 1035.3 622.9 1035.0 620.4 1032.7 628.9 1017.9 623.4 1005.6 621.0 1003.0 617.5 1001.8 616.6 997.8 619.3 998.6 623.3 992.7 626.2 994.3 632.8 992.6 633.7 995.7 639.5 997.9 641.3 1000.7 646.0 1000.8 655.1 996.4 654.9 998.0 661.0 1001.0 659.9 1005.2 655.4 1002.1 653.1 1003.3 652.2 1011.5 654.2 1015.1 653.9 1020.2 662.9 1024.0 667.8 1022.8 670.7 1023.3 670.9 1024.5 674.7 1023.7 675.2 1026.4 673.5 1026.9 669.1 1025.1 666.6 1031.2 676.6 1034.4 670.8 1043.8 674.2 1046.8 672.6 1051.4 670.3 1053.2 670.1 1058.1 673.5 1062.4 679.6 1065.2 680.2 1067.0 677.7 1072.5 680.8 1082.4 680.6 1088.5 683.6 1091.0 690.5 1092.8 691.2 1090.7 694.0 1090.7 694.8 1092.0 700.4 1088.5 700.2 1091.9 704.1 1095.0 702.5 1096.6 708.6 1104.0 714.9 1107.8 714.5 1109.7 710.0 1108.7 705.0 1113.1 707.5 1117.0 703.7 1123.4 703.8 1126.4 698.3 1132.2Z"/>
</g>
<g class="dach-c dach-ch">
<path class="dach-r" data-n="Vaud" id="r-ch-vaud" d="M86.8 1149.0 96.2 1159.7 101.0 1144.6 96.4 1137.6 99.0 1135.5 106.9 1146.0 101.4 1160.6 91.0 1171.8 91.5 1177.5 96.8 1181.7 93.2 1187.9 102.7 1189.1 107.8 1196.3 128.6 1182.6 125.7 1198.4 127.2 1210.9 122.0 1220.5 111.3 1227.9 92.4 1198.6 66.5 1195.2 48.7 1202.8 38.4 1216.5 33.4 1213.9 32.1 1212.4 34.7 1205.7 26.7 1200.0 33.1 1182.1 33.2 1177.5 59.0 1155.6 61.1 1144.9 82.5 1135.1 88.9 1144.8 86.8 1149.0ZM114.6 1137.5 112.0 1143.1 101.7 1132.0 108.2 1127.7 112.5 1128.9 114.6 1137.5Z"/>
<path class="dach-r" data-n="Valais" id="r-ch-valais" d="M236.3 1185.9 229.5 1190.8 228.2 1195.4 221.4 1199.9 218.6 1207.5 203.3 1218.3 208.3 1227.8 207.6 1233.7 198.1 1240.5 194.4 1251.4 186.5 1254.0 183.0 1262.6 156.8 1254.9 142.4 1264.1 133.6 1262.8 124.2 1268.8 117.6 1268.4 111.9 1261.9 103.7 1246.3 98.0 1245.4 98.4 1237.3 90.7 1232.7 95.3 1217.8 89.0 1208.4 92.4 1198.6 111.3 1227.9 122.0 1220.5 127.2 1210.9 132.7 1206.9 153.0 1204.9 162.8 1197.3 170.5 1199.3 188.8 1189.8 196.5 1182.2 217.3 1185.4 224.8 1180.5 230.4 1170.1 231.1 1181.1 236.3 1185.9Z"/>
<path class="dach-r" data-n="Genève" id="r-ch-geneve" d="M40.2 1213.1 46.4 1220.7 45.6 1224.1 33.7 1233.7 17.3 1235.6 19.6 1226.3 30.8 1220.4 32.1 1212.4 38.4 1216.5 40.2 1213.1Z"/>
<path class="dach-r" data-n="Bern" id="r-ch-bern" d="M123.1 1089.2 156.5 1084.9 139.8 1097.9 141.8 1102.8 146.7 1105.0 143.6 1113.5 147.6 1114.4 154.7 1106.3 164.3 1104.6 162.3 1090.8 179.6 1092.1 184.6 1105.9 184.1 1119.7 190.4 1127.0 184.5 1136.4 183.7 1144.6 193.2 1153.8 199.1 1153.0 219.2 1156.7 226.8 1153.0 233.8 1155.9 230.4 1170.1 224.8 1180.5 217.3 1185.4 196.5 1182.2 188.8 1189.8 170.5 1199.3 162.8 1197.3 153.0 1204.9 132.7 1206.9 127.2 1210.9 125.7 1198.4 128.6 1182.6 134.9 1177.6 140.0 1168.0 133.8 1156.1 138.4 1141.9 125.9 1138.3 126.5 1126.1 111.4 1128.6 111.4 1123.0 114.9 1118.0 113.8 1113.2 110.4 1110.7 99.2 1113.0 95.9 1104.9 107.4 1102.8 123.1 1089.2Z"/>
<path class="dach-r" data-n="Freiburg" id="r-ch-freiburg" d="M138.4 1141.9 133.8 1156.1 140.0 1168.0 134.9 1177.6 107.8 1196.3 102.7 1189.1 93.2 1187.9 96.8 1181.7 91.5 1177.5 91.0 1171.8 101.4 1160.6 106.9 1146.0 99.0 1135.5 101.7 1132.0 112.0 1143.1 114.6 1137.5 112.5 1128.9 126.5 1126.1 125.9 1138.3 138.4 1141.9ZM101.0 1144.6 96.2 1159.7 86.8 1149.0 96.4 1137.6 101.0 1144.6ZM90.4 1159.6 87.0 1163.7 84.6 1160.4 88.5 1155.8 90.4 1159.6Z"/>
<path class="dach-r" data-n="Solothurn" id="r-ch-solothurn" d="M164.9 1077.2 175.1 1081.9 188.3 1073.7 191.1 1067.8 196.2 1075.6 195.8 1080.7 191.8 1084.6 186.0 1084.0 179.6 1092.1 162.3 1090.8 164.3 1104.6 154.7 1106.3 147.6 1114.4 143.6 1113.5 146.7 1105.0 141.8 1102.8 139.8 1097.9 156.5 1084.9 155.9 1081.9 145.9 1077.5 158.1 1072.3 164.3 1064.1 167.9 1067.5 164.9 1077.2ZM153.2 1066.9 145.4 1073.1 140.6 1073.1 141.1 1070.8 146.3 1068.9 152.3 1061.7 153.2 1066.9Z"/>
<path class="dach-r" data-n="Neuchâtel" id="r-ch-neuchtel" d="M111.4 1128.6 108.2 1127.7 101.7 1132.0 88.9 1144.8 82.5 1135.1 61.1 1144.9 61.0 1132.8 76.5 1125.1 95.7 1105.0 99.2 1113.0 110.4 1110.7 113.8 1113.2 114.9 1118.0 111.4 1123.0 111.4 1128.6Z"/>
<path class="dach-r" data-n="Jura" id="r-ch-jura" d="M119.3 1061.7 124.5 1069.4 136.3 1069.8 145.9 1077.5 155.9 1081.9 156.5 1084.9 123.1 1089.2 107.4 1102.8 95.7 1105.0 109.4 1083.4 100.6 1079.0 102.7 1070.6 110.1 1061.5 119.3 1061.7Z"/>
<path class="dach-r" data-n="Basel-Stadt" id="r-ch-basel-stadt" d="M163.0 1054.2 159.6 1058.2 156.2 1053.8 159.1 1050.5 163.0 1054.2Z"/>
<path class="dach-r" data-n="Basel-Landschaft" id="r-ch-basel-landschaft" d="M140.6 1073.1 145.4 1073.1 153.2 1066.9 152.3 1061.7 156.2 1053.8 159.6 1058.2 163.0 1054.2 177.2 1061.6 182.5 1058.9 191.1 1067.8 188.3 1073.7 175.1 1081.9 164.9 1077.2 167.9 1067.5 164.3 1064.1 158.1 1072.3 145.9 1077.5 140.6 1073.1ZM140.6 1073.1 136.3 1069.8 141.1 1070.8 140.6 1073.1ZM146.0 1069.0 144.5 1069.0 146.6 1067.0 146.0 1069.0Z"/>
<path class="dach-r" data-n="Aargau" id="r-ch-aargau" d="M231.8 1053.4 226.5 1063.2 230.3 1080.7 230.6 1108.1 225.6 1105.8 218.0 1090.2 211.4 1096.9 192.8 1090.8 189.3 1095.0 180.8 1096.1 179.6 1092.1 186.0 1084.0 191.8 1084.6 195.8 1080.7 196.2 1075.6 182.5 1058.9 177.2 1061.6 170.0 1057.0 185.6 1051.0 188.1 1055.0 198.2 1055.2 214.0 1047.0 231.8 1053.4Z"/>
<path class="dach-r" data-n="Zürich" id="r-ch-zuerich" d="M253.0 1038.3 261.9 1044.0 260.7 1049.5 270.6 1058.8 279.4 1085.4 275.3 1092.2 266.0 1094.6 265.0 1097.9 256.9 1100.3 254.9 1105.2 244.9 1098.6 233.8 1098.3 230.5 1094.4 230.3 1080.7 226.5 1063.2 231.8 1053.4 239.8 1045.9 243.7 1049.3 241.6 1051.4 242.9 1054.7 246.5 1048.5 247.5 1040.3 253.0 1038.3Z"/>
<path class="dach-r" data-n="Glarus" id="r-ch-glarus" d="M303.3 1136.7 292.0 1143.8 286.4 1143.4 281.0 1150.0 271.0 1149.8 277.0 1141.5 276.0 1136.2 278.3 1131.6 273.3 1122.8 282.0 1103.9 297.5 1110.9 296.1 1120.4 302.2 1124.2 303.3 1136.7Z"/>
<path class="dach-r" data-n="Schaffhausen" id="r-ch-schaffhausen" d="M247.5 1040.3 238.5 1042.9 231.7 1039.2 231.1 1036.3 239.1 1026.5 248.1 1023.3 256.1 1031.5 256.2 1035.0 247.5 1040.3ZM265.5 1033.7 270.8 1042.2 263.9 1039.5 262.7 1034.7 265.5 1033.7ZM246.5 1048.5 242.9 1054.7 241.6 1051.4 246.5 1048.5Z"/>
<path class="dach-r" data-n="Appenzell Ausserrhoden" id="r-ch-appenzell-ausserrhoden" d="M334.9 1070.2 329.4 1070.9 325.8 1075.6 325.3 1081.7 313.9 1077.9 309.6 1085.9 311.4 1094.2 300.8 1090.5 299.5 1080.7 302.8 1075.6 317.1 1074.1 328.8 1066.8 334.9 1070.2Z"/>
<path class="dach-r" data-n="Appenzell Innerrhoden" id="r-ch-appenzell-innerrhoden" d="M320.7 1092.8 311.4 1094.2 309.6 1085.9 313.9 1077.9 325.3 1081.7 320.7 1092.8ZM330.7 1074.9 325.8 1075.6 329.4 1070.9 334.9 1070.2 330.7 1074.9Z"/>
<path class="dach-r" data-n="St. Gallen" id="r-ch-st-gallen" d="M330.2 1056.7 331.9 1064.4 338.2 1071.1 338.4 1078.0 334.6 1080.7 327.7 1091.5 324.4 1102.5 326.0 1112.7 323.0 1119.4 328.0 1128.3 320.8 1140.9 303.3 1136.7 302.2 1124.2 296.1 1120.4 297.5 1110.9 282.0 1103.9 276.5 1098.8 265.0 1097.9 266.0 1094.6 275.3 1092.2 279.4 1085.4 276.7 1078.0 284.3 1063.5 305.5 1065.0 310.1 1058.9 316.5 1064.1 324.7 1055.5 330.2 1056.7Z"/>
<path class="dach-r" data-n="Graubünden" id="r-ch-graubuenden" d="M381.1 1145.0 387.5 1142.9 389.8 1136.0 401.1 1126.7 410.0 1134.2 409.3 1144.5 402.3 1166.8 410.0 1175.2 407.8 1185.5 395.0 1182.9 388.6 1173.2 377.7 1176.6 373.3 1185.8 372.5 1194.4 382.0 1200.9 378.4 1208.7 382.9 1218.7 380.8 1222.8 373.2 1222.6 364.6 1204.7 335.2 1215.6 328.4 1212.7 322.3 1204.5 321.2 1189.9 317.4 1192.4 307.9 1189.8 304.2 1196.1 307.0 1210.8 303.2 1222.9 295.5 1230.9 290.0 1225.6 287.1 1216.5 290.1 1199.4 284.0 1187.3 284.0 1177.3 275.9 1174.4 267.8 1180.8 253.7 1179.4 252.3 1172.0 254.3 1165.3 265.5 1158.2 271.0 1149.8 281.0 1150.0 286.4 1143.4 292.0 1143.8 303.3 1136.7 320.8 1140.9 328.0 1128.3 323.0 1119.4 334.4 1118.3 357.3 1124.3 358.2 1133.5 376.1 1145.2 381.1 1145.0Z"/>
<path class="dach-r" data-n="Thurgau" id="r-ch-thurgau" d="M263.9 1039.5 270.8 1042.2 284.8 1038.4 314.6 1046.1 324.7 1055.5 316.5 1064.1 310.1 1058.9 305.5 1065.0 284.3 1063.5 276.7 1078.0 270.6 1058.8 260.7 1049.5 261.9 1044.0 253.0 1038.3 263.9 1039.5Z"/>
<path class="dach-r" data-n="Luzern" id="r-ch-luzern" d="M230.6 1108.1 236.5 1110.7 237.6 1113.3 232.8 1116.3 237.0 1123.2 235.5 1126.5 226.7 1124.8 214.7 1129.4 201.4 1140.1 199.1 1153.0 193.2 1153.8 183.7 1144.6 184.5 1136.4 190.4 1127.0 184.1 1119.7 184.6 1105.9 180.8 1096.1 189.3 1095.0 192.8 1090.8 211.4 1096.9 218.0 1090.2 225.6 1105.8 230.6 1108.1Z"/>
<path class="dach-r" data-n="Uri" id="r-ch-uri" d="M276.0 1136.2 277.0 1141.5 265.5 1158.2 254.3 1165.3 252.3 1172.0 253.7 1179.4 241.9 1179.3 236.3 1185.9 231.1 1181.1 230.4 1170.1 233.8 1155.9 236.8 1153.8 236.4 1139.0 241.8 1134.4 244.2 1127.3 256.9 1135.5 265.5 1134.5 269.5 1139.6 276.0 1136.2Z"/>
<path class="dach-r" data-n="Schwyz" id="r-ch-schwyz" d="M282.0 1103.9 273.3 1122.8 278.3 1131.6 276.0 1136.2 269.5 1139.6 265.5 1134.5 256.9 1135.5 244.2 1127.3 238.2 1128.9 235.5 1126.5 237.0 1123.2 232.8 1116.3 237.6 1113.3 249.2 1114.2 256.9 1100.3 265.0 1097.9 276.5 1098.8 282.0 1103.9Z"/>
<path class="dach-r" data-n="Obwalden" id="r-ch-obwalden" d="M226.8 1153.0 219.2 1156.7 199.1 1153.0 201.4 1140.1 214.7 1129.4 220.9 1130.3 223.7 1136.8 223.3 1148.2 226.8 1153.0ZM236.8 1153.8 233.8 1155.9 229.1 1155.1 227.8 1144.2 235.8 1144.4 236.8 1153.8Z"/>
<path class="dach-r" data-n="Nidwalden" id="r-ch-nidwalden" d="M235.5 1126.5 238.2 1128.9 244.2 1127.3 241.8 1134.4 236.4 1139.0 235.8 1144.4 227.8 1144.2 229.1 1155.1 223.3 1148.2 223.7 1136.8 220.9 1130.3 214.7 1129.4 226.7 1124.8 235.5 1126.5Z"/>
<path class="dach-r" data-n="Zug" id="r-ch-zug" d="M254.9 1105.2 249.2 1114.2 237.6 1113.3 236.5 1110.7 230.6 1108.1 230.5 1094.4 233.8 1098.3 244.9 1098.6 254.9 1105.2Z"/>
<path class="dach-r" data-n="Ticino" id="r-ch-ticino" d="M295.5 1230.9 283.1 1247.6 282.4 1258.1 288.2 1265.2 285.1 1272.1 274.0 1273.3 276.0 1268.2 271.9 1258.0 263.9 1252.5 267.7 1243.1 259.5 1238.1 256.8 1240.0 248.5 1236.6 235.2 1221.7 232.7 1215.1 234.9 1197.6 228.2 1195.4 229.5 1190.8 241.9 1179.3 267.8 1180.8 275.9 1174.4 284.0 1177.3 284.0 1187.3 290.1 1199.4 287.1 1216.5 290.0 1225.6 295.5 1230.9Z"/>
</g>
<g>
<circle class="dach-city dach-city--glow" data-c="Hamburg" cx="367.6" cy="234.2" r="3.4"/>
<circle class="dach-city dach-city--glow" data-c="Berlin" class-x="" cx="663.7" cy="383.0" r="3.4"/>
<circle class="dach-city" data-c="Bremen" cx="264.3" cy="302.5" r="2.6"/>
<circle class="dach-city" data-c="Hannover" cx="345.0" cy="404.3" r="2.6"/>
<circle class="dach-city" data-c="Dortmund" cx="148.8" cy="525.5" r="2.6"/>
<circle class="dach-city" data-c="Essen" cx="108.8" cy="532.4" r="2.6"/>
<circle class="dach-city" data-c="Düsseldorf" cx="88.0" cy="564.4" r="2.6"/>
<circle class="dach-city dach-city--glow" data-c="Köln" cx="104.5" cy="604.5" r="3.4"/>
<circle class="dach-city dach-city--glow" data-c="Frankfurt" cx="253.9" cy="717.9" r="3.4"/>
<circle class="dach-city" data-c="Leipzig" cx="574.3" cy="549.1" r="2.6"/>
<circle class="dach-city" data-c="Dresden" cx="693.2" cy="589.3" r="2.6"/>
<circle class="dach-city" data-c="Nürnberg" cx="462.3" cy="806.6" r="2.6"/>
<circle class="dach-city" data-c="Stuttgart" cx="297.3" cy="895.5" r="2.6"/>
<circle class="dach-city dach-city--glow" data-c="München" cx="505.7" cy="979.3" r="3.4"/>
<circle class="dach-city" data-c="Mannheim" cx="235.6" cy="801.3" r="2.6"/>
<circle class="dach-city" data-c="Rostock" cx="554.3" cy="154.8" r="2.6"/>
<circle class="dach-city" data-c="Kiel" cx="380.6" cy="120.6" r="2.6"/>
<circle class="dach-city" data-c="Magdeburg" cx="510.0" cy="438.4" r="2.6"/>
<circle class="dach-city" data-c="Erfurt" cx="457.9" cy="599.0" r="2.6"/>
<circle class="dach-city" data-c="Saarbrücken" cx="107.6" cy="834.6" r="2.6"/>
<circle class="dach-city" data-c="Freiburg" cx="181.8" cy="998.8" r="2.6"/>
<circle class="dach-city" data-c="Münster" cx="162.7" cy="462.4" r="2.6"/>
<circle class="dach-city" data-c="Kassel" cx="325.1" cy="553.3" r="2.6"/>
<circle class="dach-city" data-c="Augsburg" cx="446.6" cy="949.3" r="2.6"/>
<circle class="dach-city dach-city--glow" data-c="Wien" cx="921.6" cy="970.2" r="3.4"/>
<circle class="dach-city dach-city--glow" data-c="Graz" cx="840.8" cy="1117.1" r="3.4"/>
<circle class="dach-city" data-c="Linz" cx="741.0" cy="957.1" r="2.6"/>
<circle class="dach-city" data-c="Salzburg" cx="633.3" cy="1022.1" r="2.6"/>
<circle class="dach-city" data-c="Innsbruck" cx="490.0" cy="1091.6" r="2.6"/>
<circle class="dach-city" data-c="Klagenfurt" cx="742.7" cy="1174.2" r="2.6"/>
<circle class="dach-city" data-c="Bregenz" cx="346.8" cy="1062.1" r="2.6"/>
<circle class="dach-city" data-c="St. Pölten" cx="856.5" cy="971.5" r="2.6"/>
<circle class="dach-city dach-city--glow" data-c="Zürich" cx="241.7" cy="1077.5" r="3.4"/>
<circle class="dach-city dach-city--glow" data-c="Genf" cx="33.3" cy="1227.1" r="3.4"/>
<circle class="dach-city dach-city--glow" data-c="Basel" cx="159.2" cy="1054.4" r="3.4"/>
<circle class="dach-city" data-c="Bern" cx="147.1" cy="1132.4" r="2.6"/>
<circle class="dach-city" data-c="Lausanne" cx="75.9" cy="1186.9" r="2.6"/>
<circle class="dach-city" data-c="Luzern" cx="221.7" cy="1119.7" r="2.6"/>
<circle class="dach-city" data-c="St. Gallen" cx="314.6" cy="1072.3" r="2.6"/>
<circle class="dach-city" data-c="Lugano" cx="277.3" cy="1252.2" r="2.6"/>
</g>
</svg>

              <!-- Flaggen-Pins -->
              <span class="mappin" style="left:50%;top:37%" aria-hidden="true">
                <svg viewBox="0 0 3 3"><rect width="3" height="1" y="0" fill="#000"/><rect width="3" height="1" y="1" fill="#DD0000"/><rect width="3" height="1" y="2" fill="#FFCE00"/></svg>
              </span>
              <span class="mappin" style="left:79%;top:79%" aria-hidden="true">
                <svg viewBox="0 0 3 3"><rect width="3" height="1" y="0" fill="#ED2939"/><rect width="3" height="1" y="1" fill="#fff"/><rect width="3" height="1" y="2" fill="#ED2939"/></svg>
              </span>
              <!-- Schweiz: geografische Mitte (Älggi-Alp, 46,80° N / 8,23° O) —
                   in Kartenkoordinaten x 215 / y 1151 von 1000 × 1283, deckt
                   sich mit dem Flächenschwerpunkt der Umrisse. -->
              <span class="mappin" style="left:21.5%;top:89.7%" aria-hidden="true">
                <svg viewBox="0 0 32 32"><rect width="32" height="32" fill="#D52B1E"/><rect x="13" y="6" width="6" height="20" fill="#fff"/><rect x="6" y="13" width="20" height="6" fill="#fff"/></svg>
              </span>

              <!-- Kennzahlen -->
              <span class="maptag maptag--de">
                <span class="maptag__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg></span>
                <span><b data-count="113.2" data-dec="1" data-suffix=" M">0</b><small>Views in Deutschland</small></span>
              </span>

              <span class="maptag maptag--at">
                <span class="maptag__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg></span>
                <span><b data-count="11.2" data-dec="1" data-suffix=" M">0</b><small>Views in Österreich</small></span>
              </span>

              <span class="maptag maptag--ch">
                <span class="maptag__ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg></span>
                <span><b data-count="33.7" data-dec="1" data-suffix=" M">0</b><small>Views in der Schweiz</small></span>
              </span>

              <!-- Live-Anzeige: springt von Stadt zu Stadt (site.js, „Karte:
                   Live-Anzeige“). Städte und Lage kommen aus den Punkten der
                   Karte (data-c, cx, cy); die Karte selbst bleibt stehen.
                   Ohne JavaScript steht sie fest unten rechts. -->
              <span class="mapping" data-mapping aria-hidden="true"></span>
              <span class="maplive" data-maplive aria-hidden="true">
                <i class="maplive__dot"></i>
                <span class="maplive__txt"><b data-maplive-city>Genf</b><span data-maplive-msg>852 Clipper im Netzwerk</span></span>
              </span>
            </div>
          </div>
        </div>
      </article>

      <!-- 03 — Algorithmus-Triggering -->
      <article class="card-dark rv">
        <div class="fcard__inner">
          <div class="fcard__copy">
            <span class="eyebrow">03 · Algorithmus-Triggering</span>
            <h3>Garantierte Zielgruppenrelevanz.</h3>
            <p>
              Unser Team für Kunden aus der DACH-Region sitzt ausschließlich im deutschsprachigen Raum,
              in Deutschland, Österreich und der Schweiz. Für Kunden auf dem internationalen Markt
              arbeiten englischsprachige Clipper aus der EU. Jeder neue Account wird vor dem ersten Post in deiner Nische
              „aufgewärmt“, bis seine For-You-Page wie die deiner Wunschkunden aussieht.
              Erst dann wird gepostet. So spielt der Algorithmus deine Videos genau den
              richtigen Leuten aus.
            </p>
          </div>
          <div class="fcard__viz">
            <div class="targeting">
              <div class="tmarket">
                <span class="tmarket__av" aria-hidden="true"><i></i><i></i><i></i></span>
                <span><b>Markt 1</b><small>Streuverlust · irrelevant</small></span>
              </div>
              <div class="tmarket tmarket--you">
                <span class="tmarket__av" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <span><b>Dein Markt</b><small>DACH · exakt deine Nische</small></span>
                <span class="tmarket__badge">Aufgewärmt</span>
              </div>
              <div class="tmarket">
                <span class="tmarket__av" aria-hidden="true"><i></i><i></i><i></i></span>
                <span><b>Markt 3</b><small>Streuverlust · irrelevant</small></span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- 04 — Edits aus Rohmaterial -->
      <article class="card-dark fcard--rev rv">
        <div class="fcard__inner">
          <div class="fcard__copy">
            <span class="eyebrow">04 · Gratis Edits aus deinem Rohmaterial</span>
            <h3>Automatische Content-Erstellung.</h3>
            <p>
              Statt selbst hunderte Videos zu produzieren, lässt du unsere Clipper für dich
              arbeiten. Aus deinem bereits vorhandenen Rohmaterial schneiden sie einzigartige
              Clips im 9:16-Format und posten sie auf Instagram, TikTok, YouTube und Facebook. Täglich frischer
              Content: ohne eigenes Team, ohne Mehraufwand für dich.
            </p>
          </div>
          <div class="fcard__viz">
            <div class="reformat">
              <div class="reformat__src">
                <span class="reformat__crop" aria-hidden="true"></span>
              </div>
              <div class="reformat__flow"><span aria-hidden="true"></span> wird zu hunderten 9:16-Clips <span aria-hidden="true"></span></div>
              <div class="reformat__out">
                <div class="reformat__clip" style="background:linear-gradient(160deg,#37e892,#166740)"><b>Reels</b><em aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></em></div>
                <div class="reformat__clip" style="background:linear-gradient(160deg,#26c277,#1c3428)"><b>TikTok</b><em aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></em></div>
                <div class="reformat__clip" style="background:linear-gradient(160deg,#51f8a7,#1a764a)"><b>Shorts</b><em aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></em></div>
                <div class="reformat__clip" style="background:linear-gradient(160deg,#31d988,#234334)"><b>Facebook</b><em aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></em></div>
              </div>
            </div>
          </div>
        </div>
      </article>

    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     CASE STUDIES

     ▸ So fügst du echte Instagram-Inhalte hinzu:
       Jede Kachel im Widget verlinkt auf einen Reel. Trage in href einfach
       die echte Reel-URL ein (https://www.instagram.com/reel/SHORTCODE/).
       Im Abschnitt „Live von Instagram“ weiter unten steuert data-embed,
       welcher Beitrag als echtes Instagram-Embed geladen wird:
         Reel:   https://www.instagram.com/reel/SHORTCODE/embed/
         Profil: https://www.instagram.com/BENUTZERNAME/embed/
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--surface" id="case-studies">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">Case Studies</span>
      <h2 class="h2">Echte Accounts. Echte Clips. Echte Reichweite.</h2>
      <p class="lead">
        Influencer, Luxus-Food-Brands, Restaurant-Marken, digitale Produkte, Dienstleistungen vor Ort,
        Musiker und Co.: Für diese Kunden schneiden unsere Clipper täglich Kurzvideos und rollen sie aus.
        Alle Zahlen beziehen sich auf den jeweiligen Kampagnenzeitraum.
      </p>
    </div>

    <div class="cases">

      <!-- ─── Case 1 · DinDrop ─────────────────────────────────────────── -->
      <!-- Hinweis: Branchen-Bezeichnung bewusst neutral gehalten —
           bitte bei Bedarf durch die exakte Positionierung ersetzen. -->
      <article class="case rv">
        <div class="case__inner">
          <div class="case__copy">
            <span class="case__tag">Creator-Brand &amp; Drops</span>
            <h3>DinDrop: aus einem Dreh werden hundert Clips</h3>
            <p>
              Bei DinDrop lag das Potenzial im Archiv: Stundenlanges Rohmaterial, aus dem nie
              genug herausgeholt wurde. Unsere Clipper haben daraus ein tägliches Volumen an
              9:16-Clips gebaut, jeder mit eigenem Hook, eigenem Cut und eigenem Sound.
              Statt eines Posts pro Woche laufen jetzt dutzende Clips pro Tag.
            </p>
            <ul class="case__bullets">
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Archiv-Rohmaterial in tägliches Clip-Volumen verwandelt</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Trend-Sounds &amp; Formate wöchentlich nachgesteuert</li>
            </ul>
            <div class="case__stats">
              <div class="case__stat"><b data-count="100" data-prefix="über " data-suffix=" Mio.">0</b><small>organische Views</small></div>
            </div>
            <a class="case__link" href="https://www.instagram.com/dindrop7/" target="_blank" rel="noopener">
              @dindrop7 auf Instagram ansehen
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>

          <div class="case__widget">
            <div class="igw">
              <div class="igw__head">
                <span class="igw__av"><span><img src="/img/avatars/dindrop7.jpg" alt="Profilbild von @dindrop7" loading="lazy" decoding="async" width="52" height="52">DD</span></span>
                <span class="igw__id"><b>dindrop7</b><small>Creator-Brand · Drops &amp; Content</small></span>
                <span class="igw__ig" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>
                </span>
              </div>

              <div class="igw__meta">
                <div><b>über 100 Mio.</b><small>Views</small></div>
              </div>

              <div class="igw__grid">
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/dindrop7/reel/DM-7GyZIkb0/" target="_blank" rel="noopener" aria-label="Reel von @dindrop7 auf Instagram ansehen">
                    <img src="/img/cases/dindrop7-DM-7GyZIkb0.jpg" alt="Vorschaubild eines Reels von @dindrop7" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/dindrop7/reel/DPRDIqUiIeB/" target="_blank" rel="noopener" aria-label="Reel von @dindrop7 auf Instagram ansehen">
                    <img src="/img/cases/dindrop7-DPRDIqUiIeB.jpg" alt="Vorschaubild eines Reels von @dindrop7" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/dindrop7/reel/DbbJyZgIUjl/" target="_blank" rel="noopener" aria-label="Reel von @dindrop7 auf Instagram ansehen">
                    <img src="/img/cases/dindrop7-DbbJyZgIUjl.jpg" alt="Vorschaubild eines Reels von @dindrop7" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
              </div>

              <div class="igw__foot">
                <small>Kampagne läuft · täglich neue Clips</small>
                <a href="https://www.instagram.com/dindrop7/" target="_blank" rel="noopener">Profil öffnen</a>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ─── Case 2 · Caspian Blue Caviar ─────────────────────────────── -->
      <article class="case case--rev rv">
        <div class="case__inner">
          <div class="case__copy">
            <span class="case__tag">Luxus-Food &amp; Delikatessen</span>
            <h3>Caspian Blue: Kaviar als Kino für die Augen</h3>
            <p>
              Kaviar verkauft sich über Textur, Glanz und Inszenierung, genau das lässt sich
              in Kurzvideos perfekt transportieren. Aus dem Rohmaterial der Marke haben wir
              Slow-Motion-Edits, Serving-Shots und Unboxing-Sequenzen geschnitten.
            </p>
            <ul class="case__bullets">
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ASMR- &amp; Slow-Motion-Edits aus vorhandenem Material</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Hook-Testing über mehrere Varianten pro Clip</li>
            </ul>
            <div class="case__stats">
              <div class="case__stat"><b data-count="40" data-prefix="über " data-suffix=" Mio.">0</b><small>organische Views</small></div>
            </div>
            <a class="case__link" href="https://www.instagram.com/caspianbluecaviar/" target="_blank" rel="noopener">
              @caspianbluecaviar auf Instagram ansehen
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>

          <div class="case__widget">
            <div class="igw">
              <div class="igw__head">
                <span class="igw__av"><span><img src="/img/avatars/caspianbluecaviar.jpg" alt="Profilbild von @caspianbluecaviar" loading="lazy" decoding="async" width="52" height="52">CB</span></span>
                <span class="igw__id">
                  <b>caspianbluecaviar
                  </b>
                  <small>Caspian Blue Caviar · Fine Dining</small>
                </span>
                <span class="igw__ig" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>
                </span>
              </div>

              <div class="igw__meta">
                <div><b>über 40 Mio.</b><small>Views</small></div>
              </div>

              <div class="igw__grid">
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/caspianbluecaviar/reel/DQ4ga9SDEnj/" target="_blank" rel="noopener" aria-label="Reel von @caspianbluecaviar auf Instagram ansehen">
                    <img src="/img/cases/caspianbluecaviar-DQ4ga9SDEnj.jpg" alt="Vorschaubild eines Reels von @caspianbluecaviar" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/caspianbluecaviar/reel/DKZ-ra1qDiR/" target="_blank" rel="noopener" aria-label="Reel von @caspianbluecaviar auf Instagram ansehen">
                    <img src="/img/cases/caspianbluecaviar-DKZ-ra1qDiR.jpg" alt="Vorschaubild eines Reels von @caspianbluecaviar" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/caspianbluecaviar/reel/DMzr3__qHsw/" target="_blank" rel="noopener" aria-label="Reel von @caspianbluecaviar auf Instagram ansehen">
                    <img src="/img/cases/caspianbluecaviar-DMzr3__qHsw.jpg" alt="Vorschaubild eines Reels von @caspianbluecaviar" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
              </div>

              <div class="igw__foot">
                <small>Kampagne läuft · täglich neue Clips</small>
                <a href="https://www.instagram.com/caspianbluecaviar/" target="_blank" rel="noopener">Profil öffnen</a>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ─── Case 3 · Max Tornow ──────────────────────────────────────── -->
      <article class="case rv">
        <div class="case__inner">
          <div class="case__copy">
            <span class="case__tag">Business-Mentor &amp; Info-Business</span>
            <h3>Max Tornow: Talking-Head-Content, tausendfach ausgespielt</h3>
            <p>
              Coaching-Content lebt von Aussagen, nicht von Bildern. Aus langen Interviews,
              Calls und Trainings haben wir die stärksten Passagen herausgeschnitten,
              untertitelt und als Reels ausgerollt. Genau die Clips, die eine Zielgruppe
              anziehen, die wirklich kaufbereit ist, statt reiner Reichweite.
            </p>
            <ul class="case__bullets">
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Long-Form-Material zu Statement-Clips verdichtet</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Automatische Untertitel &amp; Retention-Schnitt</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Accounts vorgewärmt auf Business- &amp; Online-Business-Nische</li>
            </ul>
            <div class="case__stats">
              <div class="case__stat"><b data-count="70" data-suffix=" Mio.">0</b><small>organische Views (2 Accounts)</small></div>
            </div>
            <div class="case__links" style="margin-top:20px;display:flex;flex-wrap:wrap;gap:10px 24px">
              <a class="case__link" style="margin-top:0" href="https://www.instagram.com/max_tornow_business/" target="_blank" rel="noopener">
                @max_tornow_business auf Instagram ansehen
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
              <a class="case__link" style="margin-top:0" href="https://www.instagram.com/max_tornow/" target="_blank" rel="noopener">
                @max_tornow auf Instagram ansehen
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
            </div>
          </div>

          <div class="case__widget">
            <div class="igw">
              <div class="igw__head">
                <span class="igw__av"><span><img src="/img/avatars/max_tornow_business.jpg" alt="Profilbild von @max_tornow_business" loading="lazy" decoding="async" width="52" height="52">MT</span></span>
                <span class="igw__id"><b>max_tornow_business</b><small>Max Tornow · Business-Mentor</small></span>
                <span class="igw__ig" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>
                </span>
              </div>

              <div class="igw__meta">
                <div><b>31,4 Mio.</b><small>Views</small></div>
              </div>

              <div class="igw__grid">
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/max_tornow_business/reel/DCHhYijJK4b/" target="_blank" rel="noopener" aria-label="Reel von @max_tornow_business auf Instagram ansehen">
                    <img src="/img/cases/max_tornow_business-DCHhYijJK4b.jpg" alt="Vorschaubild eines Reels von @max_tornow_business" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/max_tornow_business/reel/C8pRTW6MinC/" target="_blank" rel="noopener" aria-label="Reel von @max_tornow_business auf Instagram ansehen">
                    <img src="/img/cases/max_tornow_business-C8pRTW6MinC.jpg" alt="Vorschaubild eines Reels von @max_tornow_business" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/max_tornow_business/reel/C_PxECKAj61/" target="_blank" rel="noopener" aria-label="Reel von @max_tornow_business auf Instagram ansehen">
                    <img src="/img/cases/max_tornow_business-C_PxECKAj61.jpg" alt="Vorschaubild eines Reels von @max_tornow_business" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
              </div>

              <div class="igw__foot">
                <small>Kampagne läuft · täglich neue Clips</small>
                <a href="https://www.instagram.com/max_tornow_business/" target="_blank" rel="noopener">Profil öffnen</a>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ─── Case 4 · Levantine Istanbul ──────────────────────────────── -->
      <article class="case case--rev rv">
        <div class="case__inner">
          <div class="case__copy">
            <span class="case__tag">Gastronomie &amp; Restaurant</span>
            <h3>Levantine Istanbul: Feuer, Fleisch und volle Tische</h3>
            <p>
              Ein Restaurant lebt davon, gesehen zu werden. Für die Fire Cuisine Bar in Istanbul
              haben wir aus Küchen- und Grill-Aufnahmen Clips gebaut, die genau das auslösen,
              was Gastronomie braucht: Appetit. Flammen, Anschnitt, Servier-Moment: kurz
              geschnitten, laut, und über Food-Accounts breit ausgerollt.
            </p>
            <ul class="case__bullets">
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Food-Cinematics aus vorhandenem Küchen-Material</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Geo-Targeting auf Gäste in Reichweite des Lokals</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Reservierungs-CTA in Caption und Profil</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Von 0 auf 70 Tsd. Follower aufgebaut: insgesamt 3 Mio. Views</li>
            </ul>
            <div class="case__stats">
              <div class="case__stat"><b data-count="3" data-suffix=" Mio.">0</b><small>organische Views</small></div>
            </div>
            <a class="case__link" href="https://www.instagram.com/levantine_istanbul/" target="_blank" rel="noopener">
              @levantine_istanbul auf Instagram ansehen
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>

          <div class="case__widget">
            <div class="igw">
              <div class="igw__head">
                <span class="igw__av"><span><img src="/img/avatars/levantine_istanbul.jpg" alt="Profilbild von @levantine_istanbul" loading="lazy" decoding="async" width="52" height="52">LV</span></span>
                <span class="igw__id"><b>levantine_istanbul</b><small>Levantine Fire Cuisine Bar · Istanbul</small></span>
                <span class="igw__ig" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>
                </span>
              </div>

              <div class="igw__meta">
                <div><b>3 Mio.</b><small>Views</small></div>
              </div>

              <div class="igw__grid">
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/levantine_istanbul/reel/DEUXjpeIHPR/" target="_blank" rel="noopener" aria-label="Reel von @levantine_istanbul auf Instagram ansehen">
                    <img src="/img/cases/levantine_istanbul-DEUXjpeIHPR.jpg" alt="Vorschaubild eines Reels von @levantine_istanbul" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/levantine_istanbul/reel/DBQxgMHAw1U/" target="_blank" rel="noopener" aria-label="Reel von @levantine_istanbul auf Instagram ansehen">
                    <img src="/img/cases/levantine_istanbul-DBQxgMHAw1U.jpg" alt="Vorschaubild eines Reels von @levantine_istanbul" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/levantine_istanbul/reel/C9406cJIC_D/" target="_blank" rel="noopener" aria-label="Reel von @levantine_istanbul auf Instagram ansehen">
                    <img src="/img/cases/levantine_istanbul-C9406cJIC_D.jpg" alt="Vorschaubild eines Reels von @levantine_istanbul" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
              </div>

              <div class="igw__foot">
                <small>Kampagne läuft · täglich neue Clips</small>
                <a href="https://www.instagram.com/levantine_istanbul/" target="_blank" rel="noopener">Profil öffnen</a>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ─── Case 5 · Panperium ───────────────────────────────────────── -->
      <!-- Branchen-Bezeichnung an den tatsächlichen Account angeglichen:
           @panperium ist eine Luxury-Lifestyle-/Trading-Marke, keine Food-Marke. -->
      <article class="case rv">
        <div class="case__inner">
          <div class="case__copy">
            <span class="case__tag">Luxury-Lifestyle &amp; Trading</span>
            <h3>Panperium: Produktvideos, die man nicht wegwischt</h3>
            <p>
              Produkte verkaufen sich in Kurzvideos über die ersten 1,5 Sekunden. Für Panperium
              haben wir jeden Clip auf den Hook hin gebaut: harter Einstieg, klarer Fokus aufs
              Produkt, sauberer Loop am Ende. Dazu ein Account-Netz, das dieselbe Nische
              bespielt, damit die Zielgruppe die Marke immer wieder sieht.
            </p>
            <ul class="case__bullets">
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Hook-first-Schnitt für maximale Watchtime</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Loop-Endings für höhere Wiedergabe-Raten</li>
              <li><span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Wiedererkennung durch Omnipräsenz in einer Nische</li>
            </ul>
            <div class="case__stats">
              <div class="case__stat"><b data-count="450000" data-prefix="rund ">0</b><small>organische Views</small></div>
            </div>
            <a class="case__link" href="https://www.instagram.com/panperium/" target="_blank" rel="noopener">
              @panperium auf Instagram ansehen
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>

          <div class="case__widget">
            <div class="igw">
              <div class="igw__head">
                <span class="igw__av"><span><img src="/img/avatars/panperium.jpg" alt="Profilbild von @panperium" loading="lazy" decoding="async" width="52" height="52">PP</span></span>
                <span class="igw__id"><b>panperium</b><small>Luxury-Lifestyle-Brand</small></span>
                <span class="igw__ig" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>
                </span>
              </div>

              <div class="igw__meta">
                <div><b>rund 450.000</b><small>Views</small></div>
              </div>

              <div class="igw__grid">
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/panperium/reel/DZfCoAoNLUi/" target="_blank" rel="noopener" aria-label="Reel von @panperium auf Instagram ansehen">
                    <img src="/img/cases/panperium-DZfCoAoNLUi.jpg" alt="Vorschaubild eines Reels von @panperium" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
                <!-- Mittlere Kachel: @panperium hat aktuell nur zwei Reels — hier steht
                     deshalb ein echter Feed-Beitrag statt eines dritten Reels. -->
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/panperium/p/DZurxhPjezN/" target="_blank" rel="noopener" aria-label="Beitrag von @panperium auf Instagram ansehen">
                    <img src="/img/cases/panperium-DZurxhPjezN.jpg" alt="Vorschaubild eines Beitrags von @panperium" loading="lazy" decoding="async" width="360" height="640">
                  </a>
                </div>
                <div class="igw__cell">
                  <a class="igw__poster igw__poster--photo" href="https://www.instagram.com/panperium/reel/DZvEvMPNa15/" target="_blank" rel="noopener" aria-label="Reel von @panperium auf Instagram ansehen">
                    <img src="/img/cases/panperium-DZvEvMPNa15.jpg" alt="Vorschaubild eines Reels von @panperium" loading="lazy" decoding="async" width="360" height="640">
                    <span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 12 12" fill="#fff"><path d="M3 1.5v9l7-4.5-7-4.5Z"/></svg></span>
                  </a>
                </div>
              </div>

              <div class="igw__foot">
                <small>Kampagne läuft · täglich neue Clips</small>
                <a href="https://www.instagram.com/panperium/" target="_blank" rel="noopener">Profil öffnen</a>
              </div>
            </div>
          </div>
        </div>
      </article>

    </div>

    <!-- ─── Live von Instagram ───────────────────────────────────────── -->
    <div class="iglive rv">
      <div class="section-head" style="max-width:640px">
        <span class="eyebrow">Live von Instagram</span>
        <h3 class="h3" style="margin-top:16px">Direkt aus den Accounts, nicht nachgebaut.</h3>
        <p class="lead" style="margin-top:12px;font-size:1rem">
          Die folgenden Beiträge werden live von Instagram geladen. Zieh zur Seite,
          um alle Case Studies zu sehen.
        </p>
      </div>

      <div class="iglive__scroller" role="region" aria-label="Instagram-Beiträge unserer Case Studies" tabindex="0">

        <div class="igembed" data-embed="https://www.instagram.com/reel/DKZ-ra1qDiR/embed/" data-handle="@caspianbluecaviar" data-link="https://www.instagram.com/caspianbluecaviar/reel/DKZ-ra1qDiR/" data-embed-title="Instagram-Reel von caspianbluecaviar">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/caspianbluecaviar.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@caspianbluecaviar</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

        <div class="igembed" data-embed="https://www.instagram.com/reel/DEUXjpeIHPR/embed/" data-handle="@levantine_istanbul" data-link="https://www.instagram.com/levantine_istanbul/reel/DEUXjpeIHPR/" data-embed-title="Instagram-Reel von levantine_istanbul">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@levantine_istanbul</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

        <div class="igembed" data-embed="https://www.instagram.com/reel/DCHhYijJK4b/embed/" data-handle="@max_tornow_business" data-link="https://www.instagram.com/max_tornow_business/reel/DCHhYijJK4b/" data-embed-title="Instagram-Reel von max_tornow_business">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/max_tornow_business.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@max_tornow_business</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

        <div class="igembed" data-embed="https://www.instagram.com/reel/DM-7GyZIkb0/embed/" data-handle="@dindrop7" data-link="https://www.instagram.com/dindrop7/reel/DM-7GyZIkb0/" data-embed-title="Instagram-Reel von dindrop7">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/dindrop7.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@dindrop7</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

        <div class="igembed" data-embed="https://www.instagram.com/reel/DZvEvMPNa15/embed/" data-handle="@panperium" data-link="https://www.instagram.com/panperium/reel/DZvEvMPNa15/" data-embed-title="Instagram-Reel von panperium">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/panperium.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@panperium</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

        <div class="igembed" data-embed="https://www.instagram.com/reel/DBQxgMHAw1U/embed/" data-handle="@levantine_istanbul" data-link="https://www.instagram.com/levantine_istanbul/reel/DBQxgMHAw1U/" data-embed-title="Instagram-Reel von levantine_istanbul">
          <div class="igembed__ph"><img class="igembed__av" src="/img/avatars/levantine_istanbul.jpg" alt="" loading="lazy" decoding="async" width="46" height="46"><b>@levantine_istanbul</b><span>Beitrag wird von Instagram geladen …</span></div>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     ABLAUF
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark" id="ablauf">
  <div class="wrap">
    <div class="section-head rv">
      <span class="eyebrow">So funktioniert's</span>
      <h2 class="h2">Von der Nachricht zur viralen Kampagne.</h2>
      <p class="lead">Klar, schnell, ohne Aufwand für dich, wir übernehmen den Rest.</p>
    </div>

    <div class="steps">
      <article class="step rv">
        <div class="step__n">01</div>
        <div class="step__meta">2 Min · unverbindlich</div>
        <h3>Anfrage senden</h3>
        <p>Formular ausfüllen, dauert 2 Minuten. Danach meldet sich Jason, meist noch am selben Tag.</p>
        <div class="step__cta">
          <a class="btn btn--primary btn--sm" href="#stepper">Jetzt Videos hochladen</a>
        </div>
      </article>

      <article class="step rv" data-rv-delay="80">
        <div class="step__n">02</div>
        <div class="step__meta">45 Min · Videocall</div>
        <h3>Strategiegespräch</h3>
        <p>Konkrete Beispiele, Einblick in unser Clipper-Netzwerk, passende Case Studies und ein Vorschlag für deinen CPM.</p>
      </article>

      <article class="step rv" data-rv-delay="160">
        <div class="step__n">03</div>
        <div class="step__meta">wir übernehmen</div>
        <h3>Onboarding &amp; Setup</h3>
        <p>Wir richten dein Projekt ein, erstellen die Fan-Accounts und wärmen sie in deiner Nische auf: 2 bis 3 Tage.</p>
      </article>

      <article class="step rv" data-rv-delay="240">
        <div class="step__n">04</div>
        <div class="step__meta">Das Ergebnis</div>
        <h3>Kampagne geht live</h3>
        <p>Hunderte Clips überfluten Instagram, TikTok, YouTube und Facebook: Millionen organische Views, ganz ohne eigenes Posting.</p>
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
          <span><b>100 %</b><small>Fokus auf deine Zielgruppe</small></span>
        </div>
      </div>

      <div class="founder__copy rv" data-rv-delay="100">
        <span class="eyebrow">Der Gründer</span>
        <h2 class="h2">Hinter Nikki Media steht Jason Azarov.</h2>
        <p>
          Jason betreut Kunden aus dem gesamten deutschsprachigen Raum, von der Gastronomie
          über E-Commerce bis zu Coaches und Personal Brands. Statt Agentur-Floskeln bekommst
          du bei ihm eine klare Antwort darauf, ob sich dein Content clippen lässt und welche
          Reichweite realistisch ist.
        </p>
        <p>
          Unser Team für DACH-Kunden ist über Deutschland, Österreich und die Schweiz verteilt. Für internationale Kunden arbeiten englischsprachige Clipper aus der EU. Alle Clipper kennen die
          Plattformen aus der Praxis: Sie wissen, welcher Hook in den ersten 1,5 Sekunden
          funktioniert, welcher Sound gerade läuft und wann ein Account bereit ist,
          zu posten.
        </p>

        <blockquote class="founder__quote">
          „Die beste Werbung ist die, die niemand als Werbung erkennt. Genau das machen wir,
          jeden Tag, hundertfach, für den deutschsprachigen Markt.“
        </blockquote>

        <div class="founder__sign">
          <span><b>Jason Azarov</b><small>Gründer &amp; Inhaber, Nikki Media</small></span>
          <a class="btn btn--primary btn--sm" href="#stepper">Anfrage an Jason senden</a>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     ZAHLEN
     ══════════════════════════════════════════════════════════════════ -->
<section class="section section--dark section--tight">
  <div class="wrap">
    <div class="statband rv">
      <div class="statband__i"><b data-count="1" data-suffix=" Mrd.">0</b><small>organische Views insgesamt</small></div>
      <div class="statband__i"><b data-count="5000" data-suffix="+">0</b><small>aktive Clipper im Netzwerk</small></div>
      <div class="statband__i"><b data-count="9800" data-suffix="+">0</b><small>Clips pro Monat</small></div>
      <div class="statband__i"><b>Individuell</b><small>Preis pro 1.000 organische Views</small></div>
    </div>
    <p class="muted rv" style="text-align:center;font-size:.78rem;margin-top:28px">
      Netzwerk-Kennzahlen, Stand <span data-year>2026</span>. Deine konkreten Zahlen legen wir vor Kampagnenstart gemeinsam fest.
    </p>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     FAQ
     ══════════════════════════════════════════════════════════════════ -->
${articlesHtml}<section class="section section--surface" id="faq">
  <div class="wrap">
    <div class="section-head section-head--center rv">
      <span class="eyebrow">FAQ</span>
      <h2 class="h2">Häufige Fragen</h2>
      <p class="lead">Alles Wichtige zu Clipping, Reichweite und Ablauf, auf einen Blick.</p>
    </div>

    <div class="faq rv">
      <details class="faq__i">
        <summary class="faq__q">Was genau ist Clipping überhaupt?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Aus deinem bereits vorhandenen Rohmaterial entstehen kurze, native Clips im 9:16-Format. Diese werden von hunderten Fan-Accounts gleichzeitig auf Instagram, TikTok, YouTube und Facebook gepostet. So erzeugst du maximale organische Reichweite, ganz ohne selbst zu posten.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Für welche Branchen funktioniert Clipping?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Von Gastronomie, E-Commerce und Immobilien über Beauty und Musik bis Coaching, Business und B2B. Entscheidend ist nicht die Branche, sondern die passende Nische und wie gut sich dein Content clippen lässt. Du willst wissen, ob wir mit deinem Material arbeiten können? Frag uns einfach über das Formular oben.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Wird wirklich meine Zielgruppe erreicht?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Ja. Anders gehen Videos gar nicht viral. Deswegen sieht auch ein 40-jähriger Immobilienunternehmer keine Make-up-Tutorials auf TikTok.</p><p>Zusätzlich nutzen wir Algorithmus-Triggering: Jeder neu erstellte Account wird vor dem ersten Post in deiner Nische „aufgewärmt“, bis seine For-You-Page wie die deiner Wunschkunden aussieht. Erst dann wird gepostet, so spielt der Algorithmus die Videos genau den richtigen Leuten aus.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Wie wird sichergestellt, dass die Views aus dem DACH-Raum kommen?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Unser Team für DACH-Kunden sitzt in Deutschland, Österreich und der Schweiz. Für internationale Kunden arbeiten englischsprachige Clipper aus der EU. Jeder Account wird vorab in deiner Zielregion und Nische aufgewärmt. So bekommst du geografisch relevante Reichweite statt wahlloser Views aus aller Welt.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Was ist der Unterschied zu Meta- oder TikTok-Ads?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Ads werden übersprungen: organischer Content wird angeschaut. Du zahlst nur für echte Reichweite, Videos gehen nur viral, wenn sie deine Zielgruppe treffen, und sie laufen auch nach Budgetende kostenlos weiter.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Brauche ich eigenes Videomaterial?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Kaum. Aus wenigen Minuten Rohmaterial entstehen hunderte Clips über viele Accounts. Entscheidend ist nicht die Menge, sondern wie geclippt wird und ob die Zielgruppe passt. Auf Wunsch geben wir gezielte Content-Vorgaben, oder wir arbeiten ganz ohne dein Material.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Auf welchen Plattformen wird gepostet?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Auf Instagram, TikTok, YouTube und Facebook, dort, wo Kurzvideos im 9:16-Format aktuell die größte organische Reichweite erzielen. Als Reels, Shorts und auf der For-You-Page: Jeder Clip wird für alle vier Plattformen ausgespielt.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Woher weiß ich, dass die Views echt sind?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Über drei Mechanismen: automatische Prüfung des View-Verlaufs und des Verhältnisses aus Likes, Shares, Kommentaren und Saves, eine manuelle Kontrolle jedes Videos sowie einen Insights-Nachweis per Screen-Recording bei jedem Video über 10.000 Views. Diese Nachweise stellen wir dir zur Verfügung.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Gibt es eine Garantie?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Ja, im Vertrag steht eine konkrete, garantierte Anzahl organischer Views, berechnet aus deinem CPM und deinem Budget. Unsere Clipper posten so lange, bis das Budget verbraucht ist. Das halten wir dir schriftlich fest.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Was passiert, wenn ein Video nicht viral geht?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Dann kostet es dich nichts, du zahlst ausschließlich für tatsächliche Views. Ein neuer Account und Videos ohne Views bringen dir nichts, deswegen zahlst du dafür auch nicht.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Wer sind die Clipper?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Ein wachsendes Netzwerk aus Cuttern und Creatorn im deutschsprachigen Raum, die für deine Marke eigene Clips schneiden und posten. Sie werden rein leistungsbasiert bezahlt, verdienen also nur, wenn ihre Videos echte Reichweite bringen.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Wie schnell sehe ich erste Ergebnisse?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>Die Accounts gehen direkt nach dem Setup live. Die ersten Videos werden nach der 2–3-tägigen Aufwärmphase gepostet. Eine Kampagne läuft in der Regel über 30, 60 oder 90 Tage, in dieser Zeit wird kontinuierlich gepostet, ausgewertet und das Erfolgreiche hochskaliert.</p></div>
      </details>

      <details class="faq__i">
        <summary class="faq__q">Wie läuft der Start ab?<span class="faq__ic" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></summary>
        <div class="faq__a"><p>In vier Schritten: Anfrage über das Formular oben → Strategiegespräch mit Beispielen und Case Studies (45 Min) → Onboarding und Setup → Kampagne geht live. Danach posten unsere Clipper, bis dein Budget ausgeschöpft ist.</p></div>
      </details>
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
      <h2 class="h2">Deine beste Ad postest du nicht selbst.</h2>
      <p class="lead">
        Es gibt hunderte Clipper, die nur darauf warten, für deine Marke viralen Content zu
        posten. Bring dein Rohmaterial mit, wir übernehmen Kampagnen-Setup,
        Account-Aufbau, Schnitt und das Ausrollen auf Instagram, TikTok, YouTube und Facebook.
      </p>
      <div class="btn-row">
        <a class="btn btn--primary btn--lg" href="#stepper">Jetzt Videos hochladen</a>
        <a class="btn btn--ghost btn--lg" href="#case-studies">Case Studies ansehen</a>
      </div>
      <p class="finalcta__mini">+43 676 5990071 · Antwort meist innerhalb weniger Stunden</p>

      <div class="niches">
        <span class="niche">Gastronomie</span>
        <span class="niche">E-Commerce</span>
        <span class="niche">Coaches &amp; Berater</span>
        <span class="niche">Personal Brands</span>
        <span class="niche">Musiker &amp; Künstler</span>
        <span class="niche">Immobilien</span>
        <span class="niche">Beauty &amp; Ästhetik</span>
        <span class="niche">Fitness &amp; Sport</span>
        <span class="niche">B2B-Services</span>
        <span class="niche">SaaS &amp; Tech</span>
        <span class="niche">Fintech</span>
        <span class="niche">Entertainment</span>
        <span class="niche">Sonstiges</span>
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
          <span class="logo__text">NIKKI MEDIA<small>Clipping-Agentur</small></span>
        </a>
        <p class="footer__about">
          Clipping-Agentur für den deutschsprachigen Raum: Wir verwandeln dein Rohmaterial in
          virale 9:16-Clips und rollen sie über Massen an Accounts auf Instagram, TikTok, YouTube und Facebook aus,
          für planbare, organische Reichweite.
        </p>
      </div>

      <div>
        <h4>Seite</h4>
        <div class="footer__list">
          <a href="#warum-clipping">Warum Clipping</a>
          <a href="#case-studies">Case Studies</a>
          <a href="#ablauf">Ablauf</a>
          <a href="#gruender">Gründer</a>
          <a href="#faq">FAQ</a>
          <a href="/login">Login</a>
        </div>
      </div>

      <div>
        <h4>Mitmachen</h4>
        <div class="footer__list">
          <a href="/clipper">Clipper werden</a>
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

<a class="cta-float" href="#stepper" aria-label="Jetzt Videos hochladen">
  <span class="cta-float__in">
    <span class="cta-float__ic" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15v2.2A2.8 2.8 0 0 0 7.3 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>
    </span>
    <span>Jetzt Videos hochladen</span>
    <span class="cta-float__ar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </span>
</a>

<!-- ==========================================================================
     Ladeschirm nach dem Absenden des Formulars

     Liegt bewusst als letztes Element direkt im Body und nicht im Hero: ein
     fixiertes Element würde innerhalb des Heros an dessen Transform hängen und
     dann nur einen Ausschnitt abdecken. Hier deckt es den ganzen Bildschirm ab
     — auf dem Handy wie am Desktop. Sichtbar wird es, sobald stepper.js beim
     Klick auf den CTA das hidden-Attribut entfernt.
     ========================================================================== -->
${leadLoadscreen()}

<script type="application/json" id="stepper-config">${jsonScript(LEAD_STEPPER_CONFIG)}</script>
<script src="/assets/site.js" defer></script>
<script src="/assets/stepper.js" defer></script>
</body>
</html>
`

/** Das Formular als Baustein: auch die neuen Landingpages (views/gold-pages.ts) nutzen genau dieses Markup. */
export const leadStepper = (): string => `<div class="stepper" id="stepper">
        <form class="stepper__card" id="leadform" novalidate autocomplete="on">

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
            <legend class="stepper__q">Auf welchen Plattformen willst du viral gehen?</legend>
            <p class="stepper__hint">Mehrfachauswahl möglich: mindestens eine.</p>
            <div class="plat">
              <label class="plat__tile">
                <input type="checkbox" name="platforms" value="instagram">
                <span class="plat__box">
                  <span class="plat__logo"><img src="/img/platforms/instagram.svg" alt="" width="34" height="34" loading="lazy" decoding="async"></span>
                  <b>Instagram</b>
                  <small>Reels</small>
                  <span class="plat__check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </span>
              </label>
              <label class="plat__tile">
                <input type="checkbox" name="platforms" value="tiktok">
                <span class="plat__box">
                  <span class="plat__logo"><img src="/img/platforms/tiktok.svg" alt="" width="34" height="34" loading="lazy" decoding="async"></span>
                  <b>TikTok</b>
                  <small>For You Page</small>
                  <span class="plat__check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </span>
              </label>
              <label class="plat__tile">
                <input type="checkbox" name="platforms" value="youtube">
                <span class="plat__box">
                  <span class="plat__logo"><img src="/img/platforms/youtube.svg" alt="" width="34" height="34" loading="lazy" decoding="async"></span>
                  <b>YouTube</b>
                  <small>Shorts</small>
                  <span class="plat__check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </span>
              </label>
              <label class="plat__tile">
                <input type="checkbox" name="platforms" value="facebook">
                <span class="plat__box">
                  <span class="plat__logo"><img src="/img/platforms/facebook.svg" alt="" width="34" height="34" loading="lazy" decoding="async"></span>
                  <b>Facebook</b>
                  <small>Reels</small>
                  <span class="plat__check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </span>
              </label>
            </div>
          </fieldset>

          <!-- Schritt 2 — Branche -->
          <fieldset class="stepper__panel" data-panel="2" data-require="industry" hidden>
            <legend class="stepper__q">In welcher Branche bist du?</legend>
            <div class="opts opts--chips">${industryChips()}
            </div>
          </fieldset>

          <!-- Schritt 3 — Rohmaterial -->
          <fieldset class="stepper__panel" data-panel="3" data-require="footage" hidden>
            <legend class="stepper__q">Wie viel Rohmaterial hast du?</legend>
            <div class="opts">
              <label class="opt"><input type="radio" name="footage" value="viel"><span><b>Viel</b><small>Archiv mit Stunden an Material</small></span></label>
              <label class="opt"><input type="radio" name="footage" value="wenig"><span><b>Wenig</b><small>ein paar Clips und Fotos</small></span></label>
              <label class="opt"><input type="radio" name="footage" value="nichts"><span><b>Noch nichts</b><small>wir brauchen Content-Vorgaben</small></span></label>
            </div>
          </fieldset>

          <!-- Schritt 4 — geplante Videomenge pro Monat -->
          <fieldset class="stepper__panel" data-panel="4" data-require="budget" hidden>
            <legend class="stepper__q">Bis zu wie viele Videos im Monat willst du insgesamt posten?</legend>
            <div class="opts">
              <label class="opt"><input type="radio" name="budget" value="Bis zu 100"><span><b>Bis zu 100</b></span></label>
              <label class="opt"><input type="radio" name="budget" value="Bis zu 250"><span><b>Bis zu 250</b></span></label>
              <label class="opt"><input type="radio" name="budget" value="Bis zu 500"><span><b>Bis zu 500</b></span></label>
              <label class="opt"><input type="radio" name="budget" value="Über 1000"><span><b>Über 1000</b></span></label>
            </div>
          </fieldset>

          <!-- Schritt 5 — Kontaktdaten -->
          <fieldset class="stepper__panel" data-panel="5" hidden>
            <legend class="stepper__q">Wohin dürfen wir antworten?</legend>
            <div class="fields">
              <label class="field">
                <span class="field__l">Vor- und Nachname <i>*</i></span>
                <input type="text" name="fullName" required minlength="2" autocomplete="name" placeholder="Max Mustermann">
              </label>
              <label class="field">
                <span class="field__l">Firma <em>(optional)</em></span>
                <input type="text" name="company" autocomplete="organization" placeholder="Musterfirma GmbH">
              </label>
              <label class="field">
                <span class="field__l">E-Mail <i>*</i></span>
                <input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="max@musterfirma.de">
              </label>
              <!--
                Telefon in ZWEI Feldern: links die Ländervorwahl, rechts die
                Nummer. Beides zusammen ergibt eine Nummer, die Jason aus dem
                Admin-Bereich heraus direkt anrufen kann — eine Nummer ohne
                Ländervorwahl ist vom Handy des Anrufers aus schlicht nicht
                erreichbar, und genau das kam bei einem einzigen Feld
                regelmäßig heraus.
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
              <!-- Nicht jeder hat sein Rohmaterial am selben Gerät: Wer es in
                   einem Cloud-Ordner liegen hat, gibt hier den Link an. Daraus
                   entsteht sofort ein erstes Projekt, das die Clipper sehen. -->
              <label class="field field--wide">
                <span class="field__l">Link zu deinem Rohmaterial <em>(optional)</em></span>
                <input type="url" name="cloudLink" inputmode="url" autocomplete="url" maxlength="2000" placeholder="https://drive.google.com/…">
                <span class="field__hint">Google Drive, Dropbox, iCloud, OneDrive, WeTransfer … Dateien kannst du danach auch direkt hochladen.</span>
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
            <button type="submit" class="btn btn--primary" data-submit hidden>Jetzt zum Upload-Dashboard</button>
          </div>
        </form>
      </div>`

/** Ladeschirm nach dem Absenden, passend zu diesem Formular. */
export const leadLoadscreen = (): string => `<div class="loadscreen" data-loadscreen hidden role="status" aria-live="polite">
  <div class="loadscreen__bg" aria-hidden="true"></div>
  <div class="loadscreen__in">
    <span class="loadscreen__mark" aria-hidden="true">
      <svg class="loadscreen__ring" viewBox="0 0 120 120">
        <circle class="loadscreen__ring-track" cx="60" cy="60" r="52"></circle>
        <circle class="loadscreen__ring-arc" cx="60" cy="60" r="52" data-loadscreen-arc></circle>
      </svg>
      <span class="loadscreen__pct" data-loadscreen-pct>0%</span>
    </span>

    <h2 class="loadscreen__title">Dein Dashboard wird geladen</h2>
    <p class="loadscreen__sub" data-loadscreen-step>Wir richten deinen Zugang ein …</p>

    <div class="loadscreen__bar" aria-hidden="true"><i data-loadscreen-bar style="width:0%"></i></div>

    <span class="loadscreen__dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>
</div>`
