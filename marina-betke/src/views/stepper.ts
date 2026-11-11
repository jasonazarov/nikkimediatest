/**
 * Der Stepper auf /terminbuchung/.
 *
 * Aufbau wie das Stepper-Formular von Nikki Media (Karte mit „Schritt n von
 * 6 · Titel“, Punkten, Fortschrittsbalken, Antwort-Kacheln, Zurück/Weiter,
 * Ladebildschirm nach dem Absenden), Fragen, Texte und Optik von
 * marinabetke.de. Das Verhalten steckt in /assets/js/stepper.js, die Styles in
 * /assets/css/stepper.css. Fragen und Antworten kommen aus lib/fragen.ts.
 */
import {
  BUDGET, ERREICHBAR, INTEL, KONTAKT_MAIL, KRISE, PREISE, SITUATION, START, VORWAHLEN, WA_NUMMER, WOHER, type Antwort,
} from '../lib/fragen'
import { esc, jsonScript } from '../lib/util'

const ARROW = `<i class="btn__chip" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></i>`
const CHECK = `<span class="opt__check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
const BACK = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>`

export const STEP_TITLES = ['Sicherheit', 'Deine Situation', 'Zeitpunkt', 'Rahmen', 'Erreichbarkeit', 'Kontakt']

const STEPPER_CONFIG = {
  endpoint: '/api/leads',
  titles: STEP_TITLES,
  stepLabel: 'Schritt {n} von {total} · {title}',
  submitText: 'Gespräch anfragen',
  sendingText: 'Wird gesendet …',
  wa: WA_NUMMER,
  mail: KONTAKT_MAIL,
  intel: INTEL,
  erreichbarText: {
    vormittags: 'am liebsten vormittags',
    nachmittags: 'am liebsten nachmittags',
    abends: 'am liebsten abends',
    egal: 'so bald wie möglich',
  },
  errors: {
    pick: 'Bitte wähl zuerst eine Antwort.',
    vorname: 'Bitte gib deinen Vornamen ein.',
    telefon: 'Bitte wähl dein Land und gib deine Handynummer ein, zum Beispiel 151 23456789.',
    email: 'Bitte prüf deine E-Mail-Adresse oder lass das Feld leer.',
    einwilligung: 'Ohne dein Häkchen kann ich deine Anfrage nicht speichern.',
    tooMany: 'Von dieser Verbindung kamen gerade sehr viele Anfragen. Schreib mir bitte direkt per WhatsApp.',
    generic: 'Deine Anfrage ist gerade nicht bei mir angekommen. Prüf kurz deine Verbindung und tippe noch einmal auf „Gespräch anfragen“. Oder schreib mir direkt per WhatsApp.',
  },
  loadTexts: [
    [0, 'Deine Antworten werden übertragen …'],
    [35, 'Deine Anfrage geht an Marina …'],
    [70, 'Gleich geschafft …'],
    [99, 'Angekommen.'],
  ],
}

function options(name: string, list: Antwort[]): string {
  return list
    .map(
      (a) => `
            <label class="opt"><input type="radio" name="${esc(name)}" value="${esc(a.value)}"${a.exit ? ` data-exit="${esc(a.exit)}"` : ''}><span class="opt__box"><b>${esc(a.label)}</b>${a.small ? `<small>${esc(a.small)}</small>` : ''}${CHECK}</span></label>`,
    )
    .join('')
}

const SPRACHNACHRICHT = `<div class="sprach-preis">
              <blockquote class="sprach-mini__zitat">„Heute Morgen bin ich aufgewacht und hab gedacht, ey Mann, sie spukt nicht mehr im Kopf rum.“</blockquote>
              <figure class="sprach-mini" data-sprach>
                <button type="button" class="sprach__knopf" aria-label="Sprachnachricht abspielen" data-sprach-knopf>
                  <svg class="sprach__play" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
                  <svg class="sprach__pause" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>
                </button>
                <div class="sprach__spur">
                  <figcaption class="sprach-mini__titel">Stefan nach dem Hypnose-Startprozess, per Sprachnachricht</figcaption>
                  <input type="range" class="sprach__regler" min="0" max="143" step="1" value="0" aria-label="Position in der Sprachnachricht" data-sprach-regler>
                  <div class="sprach__zeit"><span data-sprach-jetzt>0:00</span><span>2:23</span></div>
                </div>
                <audio preload="none" src="/assets/audio/sprachnachricht-klient.m4a" data-sprach-audio></audio>
              </figure>
            </div>`

const GUIDE = 'https://alfima.com/marinabetke/klarheitsguide'

export const stepper = (): string => {
  const total = STEP_TITLES.length
  return `<div class="stepper" id="fragen" data-stepper>
      <noscript><p class="stepper__noscript">Die Fragen brauchen JavaScript. Du erreichst mich auch per E-Mail an <a href="mailto:${KONTAKT_MAIL}">${KONTAKT_MAIL}</a>.</p></noscript>
      <form class="stepper__card" data-form novalidate autocomplete="on">

        <div class="stepper__head" data-head>
          <div class="stepper__meta">
            <span class="stepper__label" data-step-label aria-live="polite">Schritt 1 von ${total} · ${esc(STEP_TITLES[0])}</span>
            <span class="stepper__dots" aria-hidden="true">${STEP_TITLES.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</span>
          </div>
          <div class="stepper__bar" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="1" aria-label="Fortschritt">
            <i data-step-bar style="width:${Math.round(100 / total)}%"></i>
          </div>
        </div>

        <!-- Schritt 1: Sicherheit. Kommt zuerst, damit jemand in Not sofort die passende Hilfe findet. -->
        <fieldset class="stepper__panel is-active" data-panel="1" data-require="krise">
          <legend class="stepper__q" tabindex="-1">Bist du gerade in einer akuten Krise oder fühlst dich nicht sicher?</legend>
          <p class="stepper__hint">Diese Frage kommt zuerst, damit du sofort die passende Hilfe findest.</p>
          <div class="opts opts--2">${options('krise', KRISE)}
          </div>
        </fieldset>

        <!-- Schritt 2: Situation -->
        <fieldset class="stepper__panel" data-panel="2" data-require="situation" hidden>
          <legend class="stepper__q" tabindex="-1">Worum geht es bei dir gerade?</legend>
          <div class="opts opts--2">${options('situation', SITUATION)}
          </div>
        </fieldset>

        <!-- Schritt 3: Zeitpunkt, mit einem Satz zur gewählten Situation -->
        <fieldset class="stepper__panel" data-panel="3" data-require="start" hidden>
          <legend class="stepper__q" tabindex="-1">Wann willst du anfangen, etwas zu verändern?</legend>
          <p class="stepper__intel" data-intel hidden></p>
          <div class="opts opts--3">${options('start', START)}
          </div>
        </fieldset>

        <!-- Schritt 4: finanzieller Rahmen -->
        <fieldset class="stepper__panel" data-panel="4" data-require="budget" hidden>
          <legend class="stepper__q" tabindex="-1">Passt dieser finanzielle Rahmen grundsätzlich für dich?</legend>
          <p class="stepper__hint">Das Kennenlerngespräch ist kostenlos, du kaufst hier nichts. Alle Preise sind Endpreise, Ratenzahlung über Klarna ist möglich.</p>
          <ul class="stepper__preise" aria-label="Die 3 Wege">${PREISE.map(
            (p) => `
            <li><span><b>${esc(p.name)}</b><small>${esc(p.detail)}</small></span><b>${esc(p.preis)}</b></li>`,
          ).join('')}
          </ul>
          <div class="opts opts--3">${options('budget', BUDGET)}
          </div>
          <p class="stepper__hint stepper__hint--after">Du wählst hier noch kein Programm. Welcher Weg für dich sinnvoll ist, klären wir im Gespräch. <a href="/preise/" target="_blank" rel="noopener">Die 3 Wege im Detail</a></p>
          ${SPRACHNACHRICHT}
        </fieldset>

        <!-- Schritt 5: Erreichbarkeit. Ersetzt die Kalenderwahl: Marina meldet sich per WhatsApp. -->
        <fieldset class="stepper__panel" data-panel="5" data-require="erreichbar" hidden>
          <legend class="stepper__q" tabindex="-1">Wann erreiche ich dich am besten?</legend>
          <p class="stepper__hint">Ich melde mich per WhatsApp bei dir, und wir finden zusammen deinen Termin.</p>
          <div class="opts opts--4">${options('erreichbar', ERREICHBAR)}
          </div>
        </fieldset>

        <!-- Schritt 6: Kontakt -->
        <fieldset class="stepper__panel" data-panel="6" hidden>
          <legend class="stepper__q" tabindex="-1">Wie erreiche ich dich?</legend>
          <div class="fields">
            <label class="field">
              <span class="field__l">Vorname</span>
              <input type="text" name="vorname" required maxlength="40" autocomplete="given-name" autocapitalize="words" enterkeyhint="next">
            </label>
            <div class="field">
              <span class="field__l" id="tel-label">Handynummer für WhatsApp</span>
              <div class="phonebox">
                <select name="vorwahl" class="phonebox__dial" aria-label="Ländervorwahl" autocomplete="tel-country-code">${VORWAHLEN.map(
                  ([v, l]) => `<option value="${esc(v)}"${v === '49' ? ' selected' : ''}>${esc(l)}</option>`,
                ).join('')}</select>
                <input type="tel" name="telefon" required inputmode="tel" autocomplete="tel-national" maxlength="24" placeholder="151 23456789" aria-labelledby="tel-label" enterkeyhint="next">
              </div>
              <span class="field__hint">Darauf schicke ich dir per WhatsApp meine Nachricht zum Termin.</span>
            </div>
            <label class="field">
              <span class="field__l">E-Mail <em>(freiwillig)</em></span>
              <input type="email" name="email" maxlength="120" autocomplete="email" inputmode="email" enterkeyhint="next">
            </label>
            <label class="field">
              <span class="field__l">Wodurch bist du auf mich gestoßen? <em>(freiwillig)</em></span>
              <select name="woher" class="field__select">
                <option value="">Bitte wählen</option>${WOHER.map((w) => `<option value="${esc(w.value)}">${esc(w.label)}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
          <label class="check">
            <input type="checkbox" name="einwilligung" required>
            <span>Ich willige ausdrücklich ein, dass Marina Betke meine Angaben zu meiner persönlichen Situation und gegebenenfalls meiner Befindlichkeit verarbeitet, um meine Gesprächsanfrage zu prüfen, das Gespräch vorzubereiten und einen Termin mit mir zu vereinbaren, auch per E-Mail und per WhatsApp an meine Handynummer. Ich kann meine Einwilligung jederzeit mit Wirkung für die Zukunft über ${KONTAKT_MAIL} widerrufen. Weitere Infos in der <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a>.</span>
          </label>
        </fieldset>

        <div class="stepper__err" data-error hidden role="alert"><p data-error-text></p><a class="stepper__err-wa" data-error-wa href="https://wa.me/${WA_NUMMER}" target="_blank" rel="noopener" hidden>Per WhatsApp schreiben</a></div>

        <div class="stepper__nav">
          <button type="button" class="stepper__back" data-back hidden>${BACK}Zurück</button>
          <button type="button" class="btn stepper__next" data-next disabled>${ARROW}<span>Weiter</span></button>
          <button type="submit" class="btn stepper__next" data-submit hidden>${ARROW}<span data-submit-text>Gespräch anfragen</span></button>
        </div>
      </form>

      <!-- Ausgang „Ja“ bei der Krisenfrage: keine Anfrage, sondern sofortige Hilfe. -->
      <section class="stepper__end stepper__end--krise" data-end="krise" hidden>
        <h2 class="stepper__q" tabindex="-1">Danke, dass du das ehrlich sagst.</h2>
        <p>Für akute Unterstützung ist eine Anfrage bei mir gerade nicht der richtige Weg. Bitte wende dich jetzt an Menschen, die sofort für dich da sind.</p>
        <ul class="stepper__hilfe">
          <li><span>Bei unmittelbarer Gefahr</span><a href="tel:112">112</a></li>
          <li><span>TelefonSeelsorge, kostenlos und rund um die Uhr</span><a href="tel:08001110111">0800 111 0 111</a> oder <a href="tel:116123">116 123</a></li>
          <li><span>Ärztlicher Bereitschaftsdienst</span><a href="tel:116117">116 117</a></li>
        </ul>
        <p class="stepper__small">Du musst das nicht allein schaffen.</p>
        <button type="button" class="stepper__back" data-end-back>${BACK}Zurück zur Frage</button>
      </section>

      <!-- Ausgang „Nein, aktuell nicht“ beim finanziellen Rahmen -->
      <section class="stepper__end" data-end="budget" hidden>
        <h2 class="stepper__q" tabindex="-1">Danke dir.</h2>
        <p>Eine persönliche Begleitung ist gerade finanziell nicht drin. Das sagt nichts darüber, wie ernst dir dein Thema ist.</p>
        <div data-fuer="beziehung">
          <p>Ein kleinerer Schritt, mit dem du jetzt schon anfangen kannst: Der Klarheitsguide hilft dir zu verstehen, was in deiner Beziehung passiert ist, und Schuldumkehr, Selbstzweifel und das ständige Grübeln einzuordnen. Rund 45 Seiten als PDF, sofort zum Download, 38,40 € einmalig.</p>
          <a class="btn stepper__cta" href="${GUIDE}" target="_blank" rel="noopener">${ARROW}Klarheitsguide ansehen</a>
        </div>
        <div data-fuer="anderes">
          <p>Wenn sich deine Situation ändert, kommst du einfach wieder.</p>
        </div>
        <button type="button" class="stepper__back" data-end-back>${BACK}Zurück zur Frage</button>
      </section>

      <!-- Abgeschickt: steht im CRM -->
      <section class="stepper__end stepper__end--ok" data-end="ok" hidden>
        <span class="stepper__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg></span>
        <h2 class="stepper__q" tabindex="-1">Deine Anfrage ist angekommen, <span data-name></span>.</h2>
        <p>Ich melde mich per WhatsApp unter <strong data-tel></strong> bei dir, <span data-erreichbar></span>, und wir finden zusammen deinen Termin für das kostenlose Kennenlerngespräch.</p>
        <p class="stepper__nr">Deine Anfrage-Nr. <strong data-nr></strong></p>
        <a class="btn stepper__wa stepper__cta" data-wa href="https://wa.me/${WA_NUMMER}" target="_blank" rel="noopener">${ARROW}Lieber gleich selbst per WhatsApp schreiben</a>
        <p class="stepper__small" data-guide hidden>Du willst dich vorher schon einlesen? Der <a href="${GUIDE}" target="_blank" rel="noopener">Klarheitsguide</a> erklärt Schuldumkehr, Selbstzweifel und das ständige Grübeln auf rund 45 Seiten (38,40 €). Für das Gespräch brauchst du ihn nicht.</p>
        <p class="stepper__small">Das Gespräch dauert bis zu 60 Minuten, läuft per WhatsApp-Videoanruf und ist kostenlos. Bezahlt wird erst, wenn du danach mit mir arbeiten willst.</p>
        <p class="stepper__small">Vorher eine Frage? Schreib mir an <a data-mail href="mailto:${KONTAKT_MAIL}">${KONTAKT_MAIL}</a>.</p>
      </section>
    </div>

    <!-- Ladebildschirm nach dem Absenden, wie bei Nikki Media -->
    <div class="loadscreen" data-loadscreen hidden role="status" aria-live="polite">
      <div class="loadscreen__in">
        <span class="loadscreen__mark" aria-hidden="true">
          <svg class="loadscreen__ring" viewBox="0 0 120 120">
            <circle class="loadscreen__ring-track" cx="60" cy="60" r="52"></circle>
            <circle class="loadscreen__ring-arc" cx="60" cy="60" r="52" data-loadscreen-arc></circle>
          </svg>
          <span class="loadscreen__pct" data-loadscreen-pct>0%</span>
        </span>
        <p class="loadscreen__brand">Marina Betke</p>
        <h2 class="loadscreen__title">Deine Anfrage wird gesendet</h2>
        <p class="loadscreen__sub" data-loadscreen-step>Deine Antworten werden übertragen …</p>
        <div class="loadscreen__bar" aria-hidden="true"><i data-loadscreen-bar style="width:0%"></i></div>
      </div>
    </div>
    <script type="application/json" id="stepper-config">${jsonScript(STEPPER_CONFIG)}</script>`
}
