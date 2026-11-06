import {
  LOCK_SVG,
  badge,
  campaignCard,
  campaignGrid,
  campaignThumb,
  card,
  dateDE,
  emptyState,
  esc,
  formatEuro,
  formatViews,
  jsonScript,
  kpiBar,
  originBadge,
  pageTitle,
  sectionHead,
  shell,
  type NavItem,
  type ThumbView,
} from './layout'
import { CUSTOMER_AREA, briefingStrip, type CustomerArea } from './app'
import {
  AGENCY_PACKAGES,
  AGENCY_PLATFORMS,
  BOOKING_STATUS_LABEL,
  VIEW_STEPS,
  agencyPackageLabel,
  viewsShort,
  type Briefing,
  PRICE_RANGES,
  DEFAULT_PRICE_RANGE,
  priceRule,
  priceRangeFor,
} from '../lib/agency'
import { INDUSTRIES, creatorPlatformLabel } from '../lib/domain'
import { formatCompact } from './metrics'
import type { AgencyLead, User } from '../db/schema'

/* ==========================================================================
   Collaboration-Dashboard der Agenturen (/collaboration) — deutsch.

   Drei Zustände, in dieser Reihenfolge (siehe lib/agency.ts):

     1. Briefing fehlt     Die Übersicht IST das Briefing: Views, Budget,
                           Auftrag, „Kampagne starten“. Alles andere ist
                           gesperrt (Schloss im Menü).
     2. kalt, gesperrt     „NIKKI MEDIA meldet sich bei dir.“ — groß. Dazu
                           das Feld, um einen Cooperation-Code einzulösen.
     3. freigeschaltet     Alle Kampagnen mit ihren Clips, alle Creator und
                           Clipper, die eigenen Kampagnen und die Buchungen.

   Was ein freigeschalteter Lead NIE sieht: Rohmaterial und Cloud-Links
   fremder Kampagnen, Kundennamen, E-Mail-Adressen und Telefonnummern.
   ========================================================================== */

/** Das Menü — gesperrte Punkte tragen ein Schloss. */
export function agencyNav(locked: boolean): NavItem[] {
  return [
    { href: '/collaboration', label: 'Übersicht', icon: 'grid', group: 'Collaboration' },
    { href: '/collaboration/kampagnen', label: 'Kampagnen', icon: 'film', locked, group: 'Marktplatz' },
    { href: '/collaboration/creator', label: 'Creator', icon: 'star', locked, group: 'Marktplatz' },
    { href: '/collaboration/clipper', label: 'Clipper', icon: 'scissors', locked, group: 'Marktplatz' },
    { href: '/collaboration/meine', label: 'Meine Kampagnen', icon: 'folder', hint: 'Material hochladen', locked, group: 'Deine Agentur' },
    { href: '/collaboration/buchungen', label: 'Buchungen', icon: 'calendar', locked, group: 'Deine Agentur' },
    // Marge der Agentur auf unsere Preise (views/gold-dashboard.ts, lib/upsell.ts).
    { href: '/collaboration/preise', label: 'Preise & Marge', icon: 'tag', locked, group: 'Deine Agentur' },
  ]
}

/**
 * Die EIGENEN Kampagnen einer Agentur — dieselben Seiten wie im Kundenbereich
 * (Ordner, Uploads, Cloud-Links, Social-Accounts), nur unter /collaboration.
 * Erreichbar erst, wenn der Zugang freigeschaltet ist.
 */
/** Jede neue Kampagne einer Agentur beginnt mit dem Briefing — nie mit einem bloßen Namensfeld. */
export const AGENCY_NEW_CAMPAIGN = '/collaboration/neu'

export const AGENCY_CAMPAIGN_AREA: CustomerArea = {
  nav: agencyNav(false),
  active: '/collaboration/meine',
  home: '/collaboration/meine',
  projectHref: (id) => `/collaboration/meine/${id}`,
  folderHref: (id) => `/collaboration/ordner/${id}`,
  newHref: AGENCY_NEW_CAMPAIGN,
  openAfterCreate: true,
  accounts: 'project',
  text: {
    ...CUSTOMER_AREA.text,
    listIntro:
      'Deine EIGENEN Kampagnen: für dich oder für deine Kunden. Darin lädst du das Rohmaterial hoch oder fügst Cloud-Links ein; unsere Clipper und Creator machen daraus Clips. Alle Kampagnen von NIKKI MEDIA stehen unter <a href="/collaboration/kampagnen" class="font-semibold text-brand hover:underline">„Kampagnen“</a>.',
    namePlaceholder: 'z. B. Kunde Sommer-Launch',
    metricsDetail:
      'Die fertigen Clips dieser Kampagne siehst du unter <a href="/collaboration/kampagnen" class="font-semibold text-brand hover:text-brand-2">Kampagnen</a>: dort kannst du sie ansehen und herunterladen.',
  },
}

/* ------------------------------------------------------------- Bausteine */

const GOLD_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9cf6c8] via-[#2fe08c] to-[#17a865] px-6 py-3 text-sm font-extrabold text-[#02160c] shadow-lg shadow-emerald-900/30 transition hover:brightness-105 disabled:opacity-40'

/**
 * Blättern in langen Listen (`?seite=N`). `base` trägt schon alle anderen
 * Parameter; ohne zweite Seite steht hier nichts.
 */
function pager(base: string, page: number, pages: number): string {
  if (pages <= 1) return ''
  const href = (n: number) => `${base}${base.includes('?') ? '&' : '?'}seite=${n}`
  const link = (n: number, label: string, on: boolean) =>
    on
      ? `<a href="${esc(href(n))}" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">${label}</a>`
      : `<span class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-300">${label}</span>`
  return `<nav class="mt-8 flex items-center justify-center gap-3" aria-label="Seiten">
      ${link(page - 1, '← Zurück', page > 1)}
      <span class="text-sm text-slate-500">Seite <b class="text-slate-800">${formatViews(page)}</b> von ${formatViews(pages)}</span>
      ${link(page + 1, 'Weiter →', page < pages)}
    </nav>`
}

/** Die Einträge einer Seite — und wie viele Seiten es gibt. */
function pageSlice<T>(list: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(1, page), pages)
  return { items: list.slice((p - 1) * size, p * size), page: p, pages }
}

const agencyShell = (o: { title: string; user: User; locked: boolean; active: string; body: string; script?: string }) =>
  shell({ title: o.title, user: o.user, nav: agencyNav(o.locked), active: o.active, body: o.body, script: o.script })

/** Die drei Angaben aus dem Briefing als kleine Zeile. */
function briefingChips(lead: AgencyLead): string {
  const chip = (label: string, value: string) =>
    `<span class="inline-flex flex-col rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-inset ring-white/15">
       <small class="text-[10px] font-semibold uppercase tracking-wider text-white/60">${esc(label)}</small>
       <b class="font-display text-base font-extrabold">${esc(value)}</b>
     </span>`
  return `<div class="mt-6 flex flex-wrap justify-center gap-2.5">
      ${chip('Views', `${viewsShort(lead.viewsTarget)} Views`)}
      ${chip('Budget', lead.budgetCents ? formatEuro(lead.budgetCents) : '–')}
      ${chip('Auftrag', agencyPackageLabel(lead.package))}
    </div>`
}

/** Was hinter den Schlössern wartet — vier gesperrte Karten. */
function lockedPreview(): string {
  const items: [string, string][] = [
    ['Kampagnen', 'Alle laufenden Kampagnen von NIKKI MEDIA mit ihren fertigen Clips, ansehen und herunterladen.'],
    ['Creator', 'Unser Netzwerk aus Influencern und UGC-Creatorn, direkt für deine Kampagnen buchen.'],
    ['Clipper', 'Die Clipping-Armee hinter den viralen Accounts, wer schneidet, auf welchen Plattformen.'],
    ['Meine Kampagnen', 'Eigene Kampagnen anlegen, Rohmaterial hochladen oder Cloud-Links einfügen.'],
  ]
  return `<div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${items
        .map(
          ([title, text]) => `<div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-locked-card>
          <div class="pointer-events-none select-none blur-[1.5px]">
            <div class="h-24 rounded-xl bg-gradient-to-br from-slate-200 via-slate-100 to-amber-100"></div>
            <p class="mt-3 h-3 w-2/3 rounded bg-slate-200"></p>
            <p class="mt-2 h-3 w-1/2 rounded bg-slate-100"></p>
          </div>
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-white/70 px-5 text-center backdrop-blur-[1px]">
            <span class="grid h-11 w-11 place-items-center rounded-full bg-[#04100a] text-brand-2 shadow">${LOCK_SVG.replace('h-4 w-4', 'h-5 w-5')}</span>
            <p class="mt-2.5 font-display text-base font-extrabold">${esc(title)}</p>
            <p class="mt-1 text-xs text-slate-500">${esc(text)}</p>
          </div>
        </div>`,
        )
        .join('')}
    </div>`
}

/** Cooperation-Code nachträglich einlösen — für kalte Leads nach dem Erstgespräch. */
function codeRedeemBox(): string {
  return `<section class="mx-auto mt-8 max-w-xl rounded-2xl p-5 nmw-brand-glass nmw-brand-glass--soft" id="code-einloesen">
      <div class="flex items-start gap-3">
        <span class="nmw-brand-glass grid h-10 w-10 shrink-0 place-items-center rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="font-display text-base font-extrabold">Du hast einen Cooperation-Code?</h3>
          <p class="mt-0.5 text-sm text-slate-600">Für exklusive Kunden nach einem Erstgespräch, damit schaltest du dein Dashboard sofort frei.</p>
          <form class="mt-3 flex flex-col gap-2 sm:flex-row" data-redeem>
            <input name="code" required maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. K7M2QX"
                   class="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[.18em] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:border-amber-500 focus:ring-4 focus:ring-amber-200">
            <button class="${GOLD_BTN} !px-5 !py-2.5">Einlösen</button>
          </form>
          <p class="mt-2 hidden text-sm font-semibold text-red-700" data-redeem-error></p>
        </div>
      </div>
    </section>`
}

const REDEEM_JS = `
  document.querySelectorAll('[data-redeem]').forEach(function (form) {
    var err = form.parentNode.querySelector('[data-redeem-error]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button');
      btn.disabled = true;
      err.classList.add('hidden');
      fetch('/api/collaboration/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: form.code.value })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Das hat nicht geklappt.');
          window.location.href = res.d.redirect || '/collaboration';
        })
        .catch(function (e2) {
          btn.disabled = false;
          err.textContent = e2.message;
          err.classList.remove('hidden');
        });
    });
  });`

/* ---------------------------------------------------------- 1 — Briefing */

/**
 * Das Briefing nach dem ersten Login, „Kampagne starten“: Views, Budget,
 * Auftrag. Legt die erste Kampagne an; alles andere ist bis dahin gesperrt.
 * Jede weitere Kampagne entsteht über `newCampaignPage`.
 */
export function briefingPage(o: { user: User; lead: AgencyLead }): string {
  const first = o.user.fullName.split(' ')[0]
  const titles = ['Views', 'Budget', 'Auftrag']
  const total = titles.length
  const ticks = VIEW_STEPS.map((v) => `<span>${esc(viewsShort(v))}</span>`).join('')
  const packages = AGENCY_PACKAGES.map(
    (p, i) => `
          <label class="group relative block cursor-pointer">
            <input type="radio" name="package" value="${esc(p.value)}" class="peer sr-only">
            <span class="flex h-full flex-col rounded-2xl border-2 border-white/15 bg-white/5 p-5 transition peer-checked:border-brand peer-checked:bg-brand/10 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40 group-hover:border-white/30">
              <span class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-brand-2">Paket ${i + 1}</span>
              <b class="mt-1.5 font-display text-lg font-extrabold leading-snug">${esc(p.label)}</b>
              <small class="mt-1.5 text-sm leading-relaxed text-white/65">${esc(p.subtitle)}</small>
            </span>
            <span class="absolute right-4 top-4 hidden h-6 w-6 place-items-center rounded-full bg-brand text-[#02160c] peer-checked:grid">
              <svg viewBox="0 0 12 12" fill="none" class="h-3.5 w-3.5"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </label>`,
  ).join('')

  const body = `
      ${pageTitle(`Willkommen, ${first}!`, 'Starte jetzt deine Kampagne, drei kurze Angaben, dann geht es los.')}

      <section class="overflow-hidden rounded-3xl bg-gradient-to-br from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 text-white shadow-xl" id="briefing">
        <form class="p-6 sm:p-10" data-briefing novalidate>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs font-bold uppercase tracking-[.16em] text-brand-2" data-step-label>Schritt 1 von ${total} · Views</span>
            <span class="flex gap-1.5" aria-hidden="true">${titles
              .map((_, i) => i + 1)
              .map((n) => `<i class="h-1.5 w-8 rounded-full ${n === 1 ? 'bg-brand' : 'bg-white/15'}" data-dot="${n}"></i>`)
              .join('')}</span>
          </div>

          <!-- Schritt 1 — Views -->
          <fieldset class="mt-8" data-step="1">
            <legend class="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Wie viele Views möchtest du in Auftrag geben?</legend>
            <p class="mt-6 text-center font-display text-5xl font-extrabold tracking-tight text-brand-2 sm:text-6xl"><span data-views-out>${esc(
              viewsShort(VIEW_STEPS[3]),
            )}</span><small class="ml-2 text-xl font-bold text-white/70">Views</small></p>
            <input type="range" name="viewsStep" min="0" max="${VIEW_STEPS.length - 1}" step="1" value="3"
                   class="mt-8 w-full cursor-pointer accent-brand" aria-label="Gewünschte Views">
            <div class="mt-2 flex justify-between text-[11px] font-semibold text-white/50 sm:text-xs">${ticks}</div>
          </fieldset>

          <!-- Schritt 2 — Budget -->
          <fieldset class="mt-8 hidden" data-step="2">
            <legend class="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Wie viel Budget möchtest du für die Views zur Verfügung stellen?</legend>
            <label class="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl bg-white px-5 py-4 text-slate-900 shadow-inner ring-4 ring-transparent focus-within:ring-brand/50">
              <input type="text" name="budget" inputmode="decimal" autocomplete="off" maxlength="16" placeholder="z. B. 5.000"
                     class="min-w-0 flex-1 bg-transparent font-display text-3xl font-extrabold outline-none placeholder:text-slate-300">
              <span class="font-display text-3xl font-extrabold text-slate-400">€</span>
            </label>
            <p class="mx-auto mt-4 max-w-md text-center text-sm text-white/70" data-budget-hint>Dein Budget für die gewählten Views.</p>
          </fieldset>

          <!-- Schritt 3 — Auftrag -->
          <fieldset class="mt-8 hidden" data-step="3">
            <legend class="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Was möchtest du beauftragen?</legend>
            <div class="mt-6 grid gap-3 lg:grid-cols-3">${packages}
            </div>
          </fieldset>

          <p class="mt-6 hidden rounded-xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200 ring-1 ring-inset ring-red-400/30" data-error role="alert"></p>

          <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button type="button" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white invisible" data-back>Zurück</button>
            <div class="flex gap-3">
              <button type="button" class="rounded-xl bg-white px-6 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-amber-50" data-next>Weiter</button>
              <button type="submit" class="${GOLD_BTN} hidden" data-submit>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                Kampagne starten
              </button>
            </div>
          </div>
        </form>
      </section>


      <div class="mt-10 text-center">
        <p class="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Das wartet nach dem Start auf dich</p>
      </div>
      ${lockedPreview()}`

  const script = `
(function () {
  var STEPS = ${jsonScript(VIEW_STEPS)};
  /* Unsere Preise für den Bereich dieser Agentur (lib/agency.ts); der Server prüft dasselbe. */
  var NICHE = ${jsonScript(o.lead.niche ?? '')}, RANGE = ${jsonScript(priceRangeFor(o.lead.niche))}, NAMED = ${jsonScript(Boolean(o.lead.niche && PRICE_RANGES[o.lead.niche]))};
  var form = document.querySelector('[data-briefing]');
  var titles = ${jsonScript(titles)};
  var step = 1, TOTAL = titles.length, sending = false;
  var ENDPOINT = '/api/collaboration/briefing';
  var out = form.querySelector('[data-views-out]');
  var range = form.viewsStep;
  var err = form.querySelector('[data-error]');
  var short = function (n) {
    return n >= 1000000 ? (n / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio.' : Math.round(n / 1000) + 'K';
  };
  range.addEventListener('input', function () { out.textContent = short(STEPS[Number(range.value)]); });

  function budgetEuro() {
    var raw = String(form.budget.value || '').replace(/[€\\s]/g, '');
    if (!raw) return 0;
    if (raw.indexOf(',') >= 0) raw = raw.replace(/\\./g, '').replace(',', '.');
    else if (/^\\d{1,3}(\\.\\d{3})+$/.test(raw)) raw = raw.replace(/\\./g, '');
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function picked() { var el = form.querySelector('input[name="package"]:checked'); return el ? el.value : ''; }
  function problem(n) {
    if (n === 2 && !(budgetEuro() >= 1)) return 'Bitte gib dein Budget in Euro ein.';
    if (n === 2) { var b = bounds(), c = Math.round(budgetEuro() * 100); if (c < b.min || (b.max != null && c > b.max)) return 'Bitte passe dein Budget an. ' + ruleText(); }
    if (n === 3 && !picked()) return 'Bitte wähle, was du beauftragen möchtest.';
    return '';
  }
  var euro = function (n, cents) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) + ' €';
  };
  function bounds() {
    var v = STEPS[Number(range.value)];
    return { min: Math.round(v * RANGE.min / 1000), max: RANGE.max == null ? null : Math.round(v * RANGE.max / 1000) };
  }
  function ruleText() {
    var b = bounds(), v = short(STEPS[Number(range.value)]) + ' Views', who = NAMED ? 'Für ' + NICHE : 'Unser Preis';
    if (RANGE.max === RANGE.min) return who + ': ' + euro(RANGE.min / 100, true) + ' pro 1.000 Views. Für ' + v + ' sind das ' + euro(b.min / 100, false) + '.';
    if (RANGE.max == null) return who + ': ab ' + euro(RANGE.min / 100, true) + ' pro 1.000 Views. Für ' + v + ' also ab ' + euro(b.min / 100, false) + '.';
    return who + ': ' + euro(RANGE.min / 100, true) + ' bis ' + euro(RANGE.max / 100, true) + ' pro 1.000 Views. Für ' + v + ' also ' + euro(b.min / 100, false) + ' bis ' + euro(b.max / 100, false) + '.';
  }
  function prepareBudget() {
    var b = bounds(), c = Math.round(budgetEuro() * 100), fixed = b.max === b.min;
    if (!c || c < b.min || (b.max != null && c > b.max)) form.budget.value = (b.min / 100).toLocaleString('de-DE');
    form.budget.readOnly = fixed;
    form.querySelector('[data-budget-hint]').textContent = ruleText() + (fixed ? ' Der Preis ist fest.' : '');
  }
  function show(message) { err.textContent = message || ''; err.classList.toggle('hidden', !message); }
  function render() {
    form.querySelectorAll('[data-step]').forEach(function (f) { f.classList.toggle('hidden', Number(f.getAttribute('data-step')) !== step); });
    form.querySelectorAll('[data-dot]').forEach(function (d) {
      var on = Number(d.getAttribute('data-dot')) <= step;
      d.classList.toggle('bg-brand', on); d.classList.toggle('bg-white/15', !on);
    });
    form.querySelector('[data-step-label]').textContent = 'Schritt ' + step + ' von ' + TOTAL + ' · ' + titles[step - 1];
    form.querySelector('[data-back]').classList.toggle('invisible', step === 1);
    form.querySelector('[data-next]').classList.toggle('hidden', step === TOTAL);
    form.querySelector('[data-submit]').classList.toggle('hidden', step !== TOTAL);
    form.querySelector('[data-submit]').disabled = sending;
  }
  form.querySelector('[data-next]').addEventListener('click', function () {
    var p = problem(step); if (p) { show(p); return; }
    show(''); step = Math.min(step + 1, TOTAL); render();
    if (step === 2) { prepareBudget(); if (!form.budget.readOnly) form.budget.focus(); }
  });
  form.querySelector('[data-back]').addEventListener('click', function () { show(''); step = Math.max(step - 1, 1); render(); });
  form.budget.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); form.querySelector('[data-next]').click(); }
  });

  // Schon beim Tippen, nicht erst bei \`change\` (feuert beim Klick auf „Weiter“
  // und ließe den Knopf zwischen Drücken und Loslassen nach oben rutschen).
  form.addEventListener('input', function () { show(''); });
  form.addEventListener('change', function () { show(''); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    for (var n = 1; n <= TOTAL; n++) { var p = problem(n); if (p) { step = n; render(); show(p); return; } }
    sending = true; render();
    var data = { views: STEPS[Number(range.value)], budget: budgetEuro(), package: picked() };
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat leider nicht geklappt.');
        window.location.href = res.d.redirect || '/collaboration';
      })
      .catch(function (e2) { sending = false; render(); show(e2.message); });
  });
  render();
})();`

  return agencyShell({ title: 'Kampagne starten', user: o.user, locked: true, active: '/collaboration', body, script })
}

/* ------------------------------------------------ 1b — Neue Kampagne */

/**
 * „Neue Kampagne“ (/collaboration/neu), Vorgabe des Auftraggebers in dieser
 * Reihenfolge: Name, Bereich, Plattformen, Views, Budget. Zum Schluss steht,
 * was 1.000 Views bei diesem Budget kosten, und dass „Kampagne starten“ ein
 * verbindlicher Auftrag ist (Häkchen Pflicht). Schickt an
 * POST /api/collaboration/campaigns.
 */
export function newCampaignPage(o: { user: User }): string {
  const titles = ['Name', 'Bereich', 'Plattformen', 'Views', 'Budget', 'Übersicht']
  const ticks = VIEW_STEPS.map((v) => `<span>${esc(viewsShort(v))}</span>`).join('')
  const legend = (text: string) => `<legend class="font-display text-2xl font-extrabold leading-tight sm:text-3xl">${esc(text)}</legend>`
  const niches = INDUSTRIES.map(
    (n) => `
            <label class="cursor-pointer">
              <input type="radio" name="niche" value="${esc(n)}" class="peer sr-only">
              <span class="inline-flex rounded-full border-2 border-white/15 bg-white/5 px-4 py-2 text-sm font-bold transition hover:border-white/30 peer-checked:border-brand peer-checked:bg-brand/15 peer-checked:text-brand-2 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40">${esc(n)}</span>
            </label>`,
  ).join('')
  const platforms = AGENCY_PLATFORMS.map(
    (p) => `
            <label class="group relative block cursor-pointer">
              <input type="checkbox" name="platforms" value="${esc(p.value)}" class="peer sr-only">
              <span class="flex h-full flex-col items-center rounded-2xl border-2 border-white/15 bg-white/5 px-4 py-5 text-center transition group-hover:border-white/30 peer-checked:border-brand peer-checked:bg-brand/10 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40">
                <span class="grid h-12 w-12 place-items-center rounded-xl bg-white"><img src="/img/platforms/${esc(p.value)}.svg" alt="" class="h-7 w-7"></span>
                <b class="mt-3 font-display text-base font-extrabold">${esc(p.label)}</b>
                <small class="text-xs text-white/60">${esc(p.subtitle)}</small>
              </span>
              <span class="absolute right-3 top-3 hidden h-6 w-6 place-items-center rounded-full bg-brand text-[#02160c] peer-checked:grid">
                <svg viewBox="0 0 12 12" fill="none" class="h-3.5 w-3.5"><path d="M2 6.4 4.6 9 10 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </label>`,
  ).join('')
  const sumRow = (label: string, key: string) => `
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <dt class="text-sm text-white/60">${esc(label)}</dt>
                <dd class="font-display text-base font-extrabold" data-sum="${key}"></dd>
              </div>`

  const body = `
      <a href="${esc(AGENCY_CAMPAIGN_AREA.home)}" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Meine Kampagnen</a>
      ${pageTitle('Neue Kampagne erstellen', 'Name, Bereich, Plattformen, Views und Budget. Danach siehst du, was 1.000 Views für deine Kampagne kosten.')}

      <section class="overflow-hidden rounded-3xl bg-gradient-to-br from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 text-white shadow-xl" id="neue-kampagne">
        <form class="p-6 sm:p-10" data-new-campaign novalidate>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs font-bold uppercase tracking-[.16em] text-brand-2" data-step-label>Schritt 1 von ${titles.length} · Name</span>
            <span class="flex gap-1.5" aria-hidden="true">${titles
              .map((_, i) => `<i class="h-1.5 w-6 rounded-full sm:w-8 ${i === 0 ? 'bg-brand' : 'bg-white/15'}" data-dot="${i + 1}"></i>`)
              .join('')}</span>
          </div>

          <!-- Schritt 1: Name -->
          <fieldset class="mt-8" data-step="1">
            ${legend('Wie soll die Kampagne heißen?')}
            <label class="mx-auto mt-8 flex max-w-xl items-center rounded-2xl bg-white px-5 py-4 text-slate-900 shadow-inner ring-4 ring-transparent focus-within:ring-brand/50">
              <input type="text" name="campaignName" autocomplete="off" maxlength="80" placeholder="${esc(AGENCY_CAMPAIGN_AREA.text.namePlaceholder)}"
                     class="min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold outline-none placeholder:text-slate-300">
            </label>
            <p class="mt-3 text-center text-sm text-white/60">Ein Name, an dem du die Kampagne wiedererkennst, zum Beispiel der Name deines Kunden.</p>
          </fieldset>

          <!-- Schritt 2: Bereich -->
          <fieldset class="mt-8 hidden" data-step="2">
            ${legend('In welchem Bereich ist die Kampagne?')}
            <div class="mt-6 flex flex-wrap gap-2.5">${niches}
            </div>
          </fieldset>

          <!-- Schritt 3: Plattformen -->
          <fieldset class="mt-8 hidden" data-step="3">
            ${legend('Auf welchen Plattformen soll die Kampagne laufen?')}
            <p class="mt-2 text-sm text-white/60">Mehrfachauswahl möglich, mindestens eine.</p>
            <div class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">${platforms}
            </div>
          </fieldset>

          <!-- Schritt 4: Views -->
          <fieldset class="mt-8 hidden" data-step="4">
            ${legend('Wie viele Views möchtest du in Auftrag geben?')}
            <p class="mt-6 text-center font-display text-5xl font-extrabold tracking-tight text-brand-2 sm:text-6xl"><span data-views-out>${esc(
              viewsShort(VIEW_STEPS[3]),
            )}</span><small class="ml-2 text-xl font-bold text-white/70">Views</small></p>
            <input type="range" name="viewsStep" min="0" max="${VIEW_STEPS.length - 1}" step="1" value="3"
                   class="mt-8 w-full cursor-pointer accent-brand" aria-label="Gewünschte Views">
            <div class="mt-2 flex justify-between text-[11px] font-semibold text-white/50 sm:text-xs">${ticks}</div>
          </fieldset>

          <!-- Schritt 5: Budget -->
          <fieldset class="mt-8 hidden" data-step="5">
            ${legend('Wie viel Budget möchtest du für diese Kampagne in Auftrag geben?')}
            <label class="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl bg-white px-5 py-4 text-slate-900 shadow-inner ring-4 ring-transparent focus-within:ring-brand/50">
              <input type="text" name="budget" inputmode="decimal" autocomplete="off" maxlength="16" placeholder="z. B. 5.000"
                     class="min-w-0 flex-1 bg-transparent font-display text-3xl font-extrabold outline-none placeholder:text-slate-300">
              <span class="font-display text-3xl font-extrabold text-slate-400">€</span>
            </label>
            <p class="mx-auto mt-4 max-w-md text-center text-sm text-white/70" data-budget-hint></p>
          </fieldset>

          <!-- Schritt 6: Übersicht, Preis pro 1.000 Views, verbindlicher Auftrag -->
          <fieldset class="mt-8 hidden" data-step="6">
            ${legend('Deine Kampagne im Überblick')}
            <div class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <dl class="divide-y divide-white/10 rounded-2xl bg-white/5 px-5 ring-1 ring-inset ring-white/10">
                ${sumRow('Kampagne', 'name')}
                ${sumRow('Bereich', 'niche')}
                ${sumRow('Plattformen', 'platforms')}
                ${sumRow('Views', 'views')}
                ${sumRow('Budget', 'budget')}
              </dl>
              <div class="flex flex-col justify-center rounded-2xl p-6 nmw-brand-glass">
                <p class="text-xs font-bold uppercase tracking-[.16em]">Preis pro 1.000 Views</p>
                <p class="mt-1 font-display text-4xl font-extrabold tracking-tight" data-sum="perThousand"></p>
                <p class="mt-2 text-sm font-semibold" data-sum="sentence"></p>
              </div>
            </div>
            <div class="mt-6 rounded-2xl bg-white/5 p-5 ring-1 ring-inset ring-white/10">
              <p class="text-sm leading-relaxed text-white/75">
                <b class="text-white">Rechtsverbindlicher Auftrag:</b> Mit „Kampagne starten“ beauftragst du NIKKI MEDIA verbindlich mit
                dieser Kampagne zu den oben genannten Konditionen (Views und Budget).
              </p>
              <label class="mt-4 flex cursor-pointer items-start gap-3 text-sm font-semibold">
                <input type="checkbox" name="binding" class="mt-0.5 h-5 w-5 shrink-0 accent-brand">
                <span>Ich beauftrage diese Kampagne verbindlich.</span>
              </label>
            </div>
          </fieldset>

          <p class="mt-6 hidden rounded-xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200 ring-1 ring-inset ring-red-400/30" data-error role="alert"></p>

          <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button type="button" class="invisible rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white" data-back>Zurück</button>
            <div class="flex gap-3">
              <button type="button" class="rounded-xl bg-white px-6 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-amber-50" data-next>Weiter</button>
              <button type="submit" class="${GOLD_BTN} hidden" data-submit>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                Kampagne starten
              </button>
            </div>
          </div>
        </form>
      </section>`

  const script = `
(function () {
  var STEPS = ${jsonScript(VIEW_STEPS)};
  /* Unsere Preise je Bereich (lib/agency.ts, PRICE_RANGES); der Server prüft dasselbe. */
  var RANGES = ${jsonScript(PRICE_RANGES)}, DEFAULT_RANGE = ${jsonScript(DEFAULT_PRICE_RANGE)};
  var LABELS = ${jsonScript(Object.fromEntries(AGENCY_PLATFORMS.map((p) => [p.value, p.label])))};
  var titles = ${jsonScript(titles)};
  var form = document.querySelector('[data-new-campaign]');
  var step = 1, TOTAL = titles.length, sending = false;
  var range = form.viewsStep;
  var err = form.querySelector('[data-error]');
  var short = function (n) {
    return n >= 1000000 ? (n / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio.' : Math.round(n / 1000) + 'K';
  };
  var euro = function (n, cents) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) + ' €';
  };
  range.addEventListener('input', function () { form.querySelector('[data-views-out]').textContent = short(STEPS[Number(range.value)]); });

  function budgetEuro() {
    var raw = String(form.budget.value || '').replace(/[€\\s]/g, '');
    if (!raw) return 0;
    if (raw.indexOf(',') >= 0) raw = raw.replace(/\\./g, '').replace(',', '.');
    else if (/^\\d{1,3}(\\.\\d{3})+$/.test(raw)) raw = raw.replace(/\\./g, '');
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function niche() { var el = form.querySelector('input[name="niche"]:checked'); return el ? el.value : ''; }
  function platforms() {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="platforms"]:checked')).map(function (el) { return el.value; });
  }
  function problem(n) {
    if (n === 1 && !form.campaignName.value.trim()) return 'Bitte gib der Kampagne einen Namen.';
    if (n === 2 && !niche()) return 'Bitte wähle den Bereich der Kampagne.';
    if (n === 3 && !platforms().length) return 'Bitte wähle mindestens eine Plattform.';
    if (n === 5 && !(budgetEuro() >= 1)) return 'Bitte gib dein Budget in Euro ein.';
    if (n === 5) { var b = bounds(), c = Math.round(budgetEuro() * 100); if (c < b.min || (b.max != null && c > b.max)) return 'Bitte passe dein Budget an. ' + ruleText(); }
    if (n === 6 && !form.binding.checked) return 'Bitte bestätige, dass du die Kampagne verbindlich beauftragst.';
    return '';
  }
  function summary() {
    var views = STEPS[Number(range.value)], budget = budgetEuro();
    var set = function (key, text) { form.querySelector('[data-sum="' + key + '"]').textContent = text; };
    set('name', form.campaignName.value.trim());
    set('niche', niche());
    set('platforms', platforms().map(function (p) { return LABELS[p] || p; }).join(', '));
    set('views', short(views) + ' Views');
    set('budget', euro(budget, false));
    set('perThousand', euro(Math.round(budget * 100000 / views) / 100, true));
    set('sentence', short(views) + ' Views für ' + euro(budget, false));
  }
  function rangeFor() { return RANGES[niche()] || DEFAULT_RANGE; }
  function bounds() {
    var r = rangeFor(), v = STEPS[Number(range.value)];
    return { min: Math.round(v * r.min / 1000), max: r.max == null ? null : Math.round(v * r.max / 1000) };
  }
  function ruleText() {
    var r = rangeFor(), b = bounds(), v = short(STEPS[Number(range.value)]) + ' Views';
    var who = RANGES[niche()] ? 'Für ' + niche() : 'Unser Preis';
    if (r.max === r.min) return who + ': ' + euro(r.min / 100, true) + ' pro 1.000 Views. Für ' + v + ' sind das ' + euro(b.min / 100, false) + '.';
    if (r.max == null) return who + ': ab ' + euro(r.min / 100, true) + ' pro 1.000 Views. Für ' + v + ' also ab ' + euro(b.min / 100, false) + '.';
    return who + ': ' + euro(r.min / 100, true) + ' bis ' + euro(r.max / 100, true) + ' pro 1.000 Views. Für ' + v + ' also ' + euro(b.min / 100, false) + ' bis ' + euro(b.max / 100, false) + '.';
  }
  /* Beim Budget-Schritt: Hinweis zeigen, Budget passend vorausfüllen, fester Preis = Feld gesperrt. */
  function prepareBudget() {
    var b = bounds(), c = Math.round(budgetEuro() * 100), fixed = b.max === b.min;
    if (!c || c < b.min || (b.max != null && c > b.max)) form.budget.value = (b.min / 100).toLocaleString('de-DE');
    form.budget.readOnly = fixed;
    form.querySelector('[data-budget-hint]').textContent = ruleText() + (fixed ? ' Der Preis ist fest.' : '');
  }
  function show(message) { err.textContent = message || ''; err.classList.toggle('hidden', !message); }
  function render() {
    form.querySelectorAll('[data-step]').forEach(function (f) { f.classList.toggle('hidden', Number(f.getAttribute('data-step')) !== step); });
    form.querySelectorAll('[data-dot]').forEach(function (d) {
      var on = Number(d.getAttribute('data-dot')) <= step;
      d.classList.toggle('bg-brand', on); d.classList.toggle('bg-white/15', !on);
    });
    form.querySelector('[data-step-label]').textContent = 'Schritt ' + step + ' von ' + TOTAL + ' · ' + titles[step - 1];
    form.querySelector('[data-back]').classList.toggle('invisible', step === 1);
    form.querySelector('[data-next]').classList.toggle('hidden', step === TOTAL);
    form.querySelector('[data-submit]').classList.toggle('hidden', step !== TOTAL);
    form.querySelector('[data-submit]').disabled = sending;
    if (step === TOTAL) summary();
  }
  function next() {
    var p = problem(step); if (p) { show(p); return; }
    show(''); step = Math.min(step + 1, TOTAL); render();
    if (step === 5) { prepareBudget(); if (!form.budget.readOnly) form.budget.focus(); }
  }
  form.querySelector('[data-next]').addEventListener('click', next);
  form.querySelector('[data-back]').addEventListener('click', function () { show(''); step = Math.max(step - 1, 1); render(); });
  // Der Bereich ist eine einzige Wahl: nach dem Klick geht es von selbst weiter.
  form.querySelectorAll('input[name="niche"]').forEach(function (el) { el.addEventListener('change', function () { if (step === 2) next(); }); });
  [form.campaignName, form.budget].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
  });
  form.addEventListener('input', function () { show(''); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    for (var n = 1; n <= TOTAL; n++) { var p = problem(n); if (p) { step = n; render(); show(p); return; } }
    sending = true; render();
    fetch('/api/collaboration/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.campaignName.value.trim(),
        niche: niche(),
        platforms: platforms(),
        views: STEPS[Number(range.value)],
        budget: budgetEuro(),
        binding: form.binding.checked
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat leider nicht geklappt.');
        window.location.href = res.d.redirect || '/collaboration/meine';
      })
      .catch(function (e2) { sending = false; render(); show(e2.message); });
  });
  render();
  form.campaignName.focus();
})();`

  return agencyShell({ title: 'Neue Kampagne', user: o.user, locked: false, active: AGENCY_CAMPAIGN_AREA.active, body, script })
}

/* ------------------------------------------ 2 — kalt: wir melden uns */

export const CONTACT_HEADLINE = 'NIKKI MEDIA meldet sich bei dir.'

export function waitingPage(o: { user: User; lead: AgencyLead }): string {
  const body = `
      <section class="overflow-hidden rounded-3xl bg-gradient-to-br from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 px-6 py-14 text-center text-white shadow-xl sm:px-12 sm:py-20" data-contact-headline>
        <span class="nmw-brand-glass mx-auto grid h-16 w-16 place-items-center rounded-2xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>
        </span>
        <h1 class="mx-auto mt-7 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">${esc(CONTACT_HEADLINE)}</h1>
        <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
          Danke für dein Briefing, deine Kampagne ist bei uns angekommen. Wir setzen uns persönlich mit dir in Verbindung,
          besprechen die Details und schalten dein Collaboration-Dashboard frei, sobald die Zusammenarbeit steht.
        </p>
        ${briefingChips(o.lead)}
      </section>

      ${codeRedeemBox()}

      <div class="mt-10 text-center">
        <p class="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Nach der Freischaltung</p>
      </div>
      ${lockedPreview()}`

  return agencyShell({
    title: 'Wir melden uns',
    user: o.user,
    locked: true,
    active: '/collaboration',
    body,
    script: `(function () {${REDEEM_JS}\n})();`,
  })
}

/** Ein gesperrter Menüpunkt — was fehlt und wie es weitergeht. */
export function lockedPage(o: { user: User; lead: AgencyLead; title: string; active: string }): string {
  const briefed = Boolean(o.lead.briefedAt)
  const body = `
      ${pageTitle(o.title)}
      <section class="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm" data-locked-page>
        <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#04100a] text-brand-2 shadow-lg">${LOCK_SVG.replace(
          'h-4 w-4',
          'h-7 w-7',
        )}</span>
        <h2 class="mx-auto mt-6 max-w-xl font-display text-2xl font-extrabold sm:text-3xl">Dieser Bereich ist noch gesperrt.</h2>
        <p class="mx-auto mt-3 max-w-lg text-slate-500">${
          briefed
            ? 'NIKKI MEDIA meldet sich bei dir und schaltet dein Dashboard frei, sobald die Zusammenarbeit steht. Mit einem Cooperation-Code geht es sofort.'
            : 'Starte zuerst deine Kampagne, drei kurze Angaben in der Übersicht.'
        }</p>
        <div class="mt-7">
          <a href="/collaboration" class="${GOLD_BTN}">${briefed ? 'Zur Übersicht' : 'Kampagne starten'}</a>
        </div>
      </section>
      ${briefed ? codeRedeemBox() : ''}`
  return agencyShell({
    title: o.title,
    user: o.user,
    locked: true,
    active: o.active,
    body,
    script: briefed ? `(function () {${REDEEM_JS}\n})();` : undefined,
  })
}

/* ------------------------------------------------- 3 — freigeschaltet */

export interface AgencyCampaign {
  id: string
  name: string
  thumb?: ThumbView
  own: boolean
  status: string
  clips: number
  views: number
  clippers: number
  creators: number
}

export interface AgencyCreator {
  id: string
  name: string
  niche: string | null
  platforms: string[]
  handles: Record<string, string>
  followers: string
  views30d: string
  openToAds: string
  campaigns: number
  pending: boolean
  /** Demo-Konto: erfundene Handles — nie verlinken, sie könnten echten Fremden gehören. */
  demo?: boolean
}

export interface AgencyClipper {
  id: string
  name: string
  platforms: string[]
  experience: string | null
  availability: string | null
  campaigns: number
  clips: number
  /** Nur Demo-Agentur: der Demo-Clipper lässt sich direkt einer eigenen Kampagne zuweisen. */
  assignable?: boolean
}

export interface AgencyClip {
  id: string
  filename: string
  caption: string | null
  createdAt: number
  posterUrl: string
  previewUrl: string
  views: number
}

export interface AgencyBooking {
  id: string
  creatorName: string
  projectName: string
  status: string
  message: string | null
  createdAt: number
}

const campaignCardOf = (c: AgencyCampaign) =>
  campaignCard({
    href: `/collaboration/kampagne/${c.id}`,
    name: c.name,
    thumb: c.thumb,
    origin: c.own ? { kind: 'own' } : undefined,
    eyebrow: c.status === 'beendet' ? 'Beendet' : 'Aktive Kampagne',
    meta: [
      `${formatViews(c.clips)} ${c.clips === 1 ? 'Clip' : 'Clips'}`,
      `${formatViews(c.views)} Views`,
      `${c.clippers} Clipper · ${c.creators} Creator`,
    ],
  })

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '·'

const PROFILE_URL: Record<string, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  snapchat: (h) => `https://www.snapchat.com/add/${h}`,
  twitch: (h) => `https://www.twitch.tv/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
}

const platformIcon = (p: string, size = 'h-4 w-4') =>
  `<img src="/img/platforms/${esc(p)}.svg" alt="" class="${size}" loading="lazy" decoding="async">`

/**
 * Ein Creator als Karte. `action`: 'book' öffnet die Buchungsmaske (nur auf
 * der Creator-Seite), 'link' führt dorthin, 'needs-campaign' heißt: ohne
 * eigene Kampagne gibt es nichts, wofür gebucht werden könnte.
 */
function creatorCard(c: AgencyCreator, action: 'book' | 'link' | 'needs-campaign'): string {
  const handles = c.platforms
    .map((p) => {
      const h = c.handles[p]
      const label = h ? `@${h}` : creatorPlatformLabel(p)
      const href = h && PROFILE_URL[p] && !c.demo ? PROFILE_URL[p](encodeURIComponent(h)) : ''
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">${platformIcon(p, 'h-3.5 w-3.5')}<span class="truncate">${esc(label)}</span></a>`
        : `<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">${platformIcon(p, 'h-3.5 w-3.5')}${esc(label)}</span>`
    })
    .join('')
  return `
        <article id="creator-${esc(c.id)}" class="flex scroll-mt-6 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg target:ring-4 target:ring-amber-300" data-creator="${esc(c.id)}">
          <div class="flex items-center gap-3">
            <span class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-700 font-display text-lg font-extrabold text-white">${esc(
              initials(c.name),
            )}</span>
            <div class="min-w-0">
              <h3 class="truncate font-display text-lg font-extrabold">${esc(c.name)}</h3>
              <p class="truncate text-xs font-semibold uppercase tracking-wider text-pink-600">${esc(c.niche || 'Creator')}</p>
            </div>
          </div>
          <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-xl bg-slate-50 px-3 py-2"><dt class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Follower</dt><dd class="font-bold">${esc(c.followers)}</dd></div>
            <div class="rounded-xl bg-slate-50 px-3 py-2"><dt class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Views · 30 Tage</dt><dd class="font-bold">${esc(c.views30d)}</dd></div>
          </dl>
          <div class="mt-3 flex flex-wrap gap-1.5">${handles}</div>
          <p class="mt-3 text-xs text-slate-500">Werbung: ${esc(c.openToAds)} · ${c.campaigns} ${c.campaigns === 1 ? 'Kampagne' : 'Kampagnen'} verbreitet</p>
          <div class="mt-auto pt-4">${
            c.pending
              ? `<span class="inline-flex w-full items-center justify-center rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 ring-1 ring-inset ring-amber-200">Buchung angefragt</span>`
              : action === 'book'
                ? `<button type="button" data-book="${esc(c.id)}" data-name="${esc(c.name)}" class="${GOLD_BTN} w-full !py-2.5">Creator buchen</button>`
                : action === 'link'
                  ? `<a href="/collaboration/creator#creator-${esc(c.id)}" class="${GOLD_BTN} w-full !py-2.5">Creator buchen</a>`
                  : `<a href="${esc(AGENCY_NEW_CAMPAIGN)}" class="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400">Erst eigene Kampagne anlegen</a>`
          }</div>
        </article>`
}

export function overviewPage(o: {
  user: User
  lead: AgencyLead
  campaigns: AgencyCampaign[]
  creators: AgencyCreator[]
  clipperCount: number
  ownCount: number
  pendingBookings: number
  /** Clips und Views über alle sichtbaren Kampagnen. */
  totals: { clips: number; views: number }
  justUnlocked: boolean
}): string {
  const first = o.user.fullName.split(' ')[0]
  const latest = o.campaigns.slice(0, 6)
  const body = `
      ${
        o.justUnlocked
          ? `<div class="mb-6 flex items-start gap-3 rounded-2xl px-5 py-4 nmw-brand-glass nmw-brand-glass--soft" data-unlocked>
               <span class="text-2xl" aria-hidden="true">🎉</span>
               <div><p class="font-display text-lg font-extrabold">Dein Zugang ist freigeschaltet.</p>
               <p class="text-sm text-slate-600">Ab sofort siehst du alle Kampagnen, Creator und Clipper von NIKKI MEDIA.</p></div>
             </div>`
          : ''
      }
      ${pageTitle(`Hallo ${first}`, 'Alle Kampagnen, Creator und Clipper von NIKKI MEDIA, und deine eigenen Kampagnen.')}

      ${kpiBar(
        [
          { label: 'Kampagnen', value: formatViews(o.campaigns.length) },
          { label: 'Clips', value: formatViews(o.totals.clips) },
          { label: 'Views', value: formatCompact(o.totals.views, 'de') },
          { label: 'Clipper', value: formatViews(o.clipperCount) },
          { label: 'Creator', value: formatViews(o.creators.length) },
          { label: 'Eigene Kampagnen', value: formatViews(o.ownCount) },
          { label: 'Offene Buchungen', value: formatViews(o.pendingBookings) },
        ],
        'mb-6',
      )}

      <section class="mb-4 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm lg:flex-row lg:items-center lg:justify-between" data-campaign-ctas>
        <div>
          <p class="font-display text-lg font-extrabold">Deine Kampagnen</p>
          <p class="mt-0.5 text-sm text-slate-500">Starte eine neue Kampagne oder öffne alle, die du schon angelegt hast.</p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a href="${esc(AGENCY_NEW_CAMPAIGN)}" class="${GOLD_BTN}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" class="h-4 w-4"><path d="M12 5v14M5 12h14"/></svg>
            Neue Kampagne erstellen
          </a>
          <a href="${esc(AGENCY_CAMPAIGN_AREA.home)}" class="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 transition hover:border-slate-400">Alle meine Kampagnen</a>
        </div>
      </section>

      <section class="flex flex-col gap-5 rounded-2xl bg-gradient-to-r from-[#010302] via-[#041a0f] to-[#0a4527] ring-1 ring-inset ring-[#2fe08c]/25 px-6 py-6 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-2">Deine Kampagne</p>
          <p class="mt-1 font-display text-xl font-extrabold">${esc(agencyPackageLabel(o.lead.package))}</p>
          <p class="mt-1 text-sm text-white/70">${esc(viewsShort(o.lead.viewsTarget))} Views · Budget ${esc(
            o.lead.budgetCents ? formatEuro(o.lead.budgetCents) : '–',
          )}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <a href="/collaboration/meine" class="${GOLD_BTN}">Material hochladen</a>
          <a href="/collaboration/creator" class="inline-flex items-center rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white ring-1 ring-inset ring-white/20 hover:bg-white/15">Creator buchen</a>
        </div>
      </section>

      ${sectionHead('Neueste Kampagnen', `<a href="/collaboration/kampagnen" class="text-sm font-semibold text-brand hover:underline">Alle Kampagnen →</a>`)}
      ${
        latest.length
          ? campaignGrid(latest.map(campaignCardOf))
          : emptyState('Noch keine Kampagnen', 'Sobald Kampagnen laufen, stehen sie hier.')
      }

      ${sectionHead('Creator im Netzwerk', `<a href="/collaboration/creator" class="text-sm font-semibold text-brand hover:underline">Alle Creator →</a>`)}
      ${
        o.creators.length
          ? `<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">${o.creators
              .slice(0, 4)
              .map((c) => creatorCard(c, o.ownCount > 0 ? 'link' : 'needs-campaign'))
              .join('')}</div>`
          : emptyState('Noch keine Creator', 'Sobald Creator im Netzwerk sind, stehen sie hier.')
      }`

  return agencyShell({
    title: 'Übersicht',
    user: o.user,
    locked: false,
    active: '/collaboration',
    body,
  })
}

export function campaignsPage(o: { user: User; campaigns: AgencyCampaign[]; filter: 'alle' | 'eigene'; page: number }): string {
  const all = o.filter === 'eigene' ? o.campaigns.filter((c) => c.own) : o.campaigns
  const { items: list, page, pages } = pageSlice(all, o.page, 48)
  const chip = (key: 'alle' | 'eigene', label: string, n: number) =>
    `<a href="/collaboration/kampagnen${key === 'eigene' ? '?filter=eigene' : ''}" class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      o.filter === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-slate-300'
    }">${esc(label)}<span class="text-xs opacity-70">${n}</span></a>`
  const body = `
      ${pageTitle('Kampagnen', 'Alle Kampagnen von NIKKI MEDIA mit ihren fertigen Clips, öffne eine Kampagne, um die Clips anzusehen und herunterzuladen.')}
      <div class="mb-5 flex flex-wrap gap-2">
        ${chip('alle', 'Alle', o.campaigns.length)}
        ${chip('eigene', 'Eigene', o.campaigns.filter((c) => c.own).length)}
      </div>
      ${list.length ? campaignGrid(list.map(campaignCardOf)) : emptyState('Keine Kampagnen', 'Für diesen Filter gibt es noch keine Kampagnen.')}
      ${pager(`/collaboration/kampagnen${o.filter === 'eigene' ? '?filter=eigene' : ''}`, page, pages)}`
  return agencyShell({ title: 'Kampagnen', user: o.user, locked: false, active: '/collaboration/kampagnen', body })
}

export function campaignPage(o: {
  user: User
  campaign: AgencyCampaign
  /** Das Briefing — nur bei eigenen Kampagnen. */
  briefing: Briefing | null
  team: { name: string; role: 'clipper' | 'creator' }[]
  clips: AgencyClip[]
  /** Fertige Clips, die nicht als Kachel dastehen (Demo-Konto zeigt die neuesten zwölf). */
  moreClips?: number
  manageHref: string | null
}): string {
  const c = o.campaign
  const clipTiles = o.clips
    .map((v) => {
      const picture = v.posterUrl
        ? `<img src="${esc(v.posterUrl)}" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" onerror="this.remove()">`
        : v.previewUrl
          ? `<video src="${esc(v.previewUrl)}#t=0.4" preload="metadata" muted playsinline class="absolute inset-0 h-full w-full object-cover"></video>`
          : ''
      return `
        <article class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-clip="${esc(v.id)}">
          <button type="button" data-play="${esc(v.id)}" class="relative block aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-[#0b0a07] to-[#8e6a1f]" title="Ansehen">
            ${picture}
            <span class="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
              <span class="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-slate-900 shadow-lg">
                <svg viewBox="0 0 24 24" fill="currentColor" class="ml-1 h-6 w-6"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </span>
          </button>
          <div class="p-3">
            <p class="truncate text-sm font-semibold" title="${esc(v.filename)}">${esc(v.caption || v.filename)}</p>
            <p class="mt-0.5 text-xs text-slate-500">${dateDE(v.createdAt)} · ${formatViews(v.views)} Views</p>
            <button type="button" data-download="${esc(v.id)}" class="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:border-brand hover:text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Herunterladen
            </button>
          </div>
        </article>`
    })
    .join('')

  const team = o.team.length
    ? o.team
        .map(
          (m) =>
            `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
              m.role === 'creator' ? 'bg-pink-50 text-pink-700 ring-pink-200' : 'bg-violet-50 text-violet-700 ring-violet-200'
            }">${esc(m.name)}<small class="opacity-70">${m.role === 'creator' ? 'Creator' : 'Clipper'}</small></span>`,
        )
        .join('')
    : '<span class="text-sm text-slate-400">Noch kein Team zugeordnet.</span>'

  const body = `
      <a href="/collaboration/kampagnen" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Alle Kampagnen</a>
      <section class="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-center">
        <div class="overflow-hidden rounded-2xl shadow-sm">${campaignThumb(c.thumb, c.name)}</div>
        <div>
          ${c.own ? originBadge('own') : ''}
          <h1 class="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(c.name)}</h1>
          ${kpiBar(
            [
              { label: c.clips === 1 ? 'Clip' : 'Clips', value: formatViews(c.clips) },
              { label: 'Views', value: formatViews(c.views) },
              { label: 'Clipper', value: String(c.clippers) },
              { label: 'Creator', value: String(c.creators) },
            ],
            'mt-4',
          )}
          ${o.briefing ? `<div class="mt-4">${briefingStrip(o.briefing)}</div>` : ''}
          <div class="mt-4 flex flex-wrap gap-1.5">${team}</div>
          ${
            o.manageHref
              ? `<a href="${esc(o.manageHref)}" class="mt-5 ${GOLD_BTN}">Material &amp; Ordner verwalten</a>`
              : ''
          }
        </div>
      </section>

      ${sectionHead('Fertige Clips')}
      ${
        o.clips.length
          ? `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">${clipTiles}</div>${
              o.moreClips && o.moreClips > 0
                ? `<p class="mt-5 text-center text-sm font-semibold text-slate-500">+ ${formatViews(o.moreClips)} weitere Clips</p>`
                : ''
            }`
          : emptyState('Noch keine fertigen Clips', 'Sobald die Clipper Clips abliefern, stehen sie hier, zum Ansehen und Herunterladen.')
      }

      <div class="fixed inset-0 z-50 hidden items-center justify-center bg-black/80 p-4" data-player>
        <div class="relative w-full max-w-md">
          <button type="button" data-player-close class="absolute -top-11 right-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10">Schließen ✕</button>
          <video controls playsinline class="max-h-[80vh] w-full rounded-2xl bg-black" data-player-video></video>
        </div>
      </div>`

  const script = `
(function () {
  var box = document.querySelector('[data-player]');
  var video = box.querySelector('[data-player-video]');
  function url(id, download) {
    return fetch('/api/collaboration/clips/' + encodeURIComponent(id) + '/url' + (download ? '?download=1' : ''))
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Nicht verfügbar.'); return d.url; }); });
  }
  function close() { video.pause(); video.removeAttribute('src'); box.classList.add('hidden'); box.classList.remove('flex'); }
  document.querySelectorAll('[data-play]').forEach(function (b) {
    b.addEventListener('click', function () {
      url(b.getAttribute('data-play'), false).then(function (u) {
        video.src = u; box.classList.remove('hidden'); box.classList.add('flex'); video.play().catch(function () {});
      }).catch(function (e) { window.alert(e.message); });
    });
  });
  document.querySelectorAll('[data-download]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      url(b.getAttribute('data-download'), true).then(function (u) { window.location.href = u; })
        .catch(function (e) { window.alert(e.message); })
        .then(function () { b.disabled = false; });
    });
  });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  box.querySelector('[data-player-close]').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();`

  return agencyShell({ title: c.name, user: o.user, locked: false, active: '/collaboration/kampagnen', body, script })
}

export function creatorsPage(o: {
  user: User
  creators: AgencyCreator[]
  ownCampaigns: { id: string; name: string }[]
  page: number
}): string {
  const canBook = o.ownCampaigns.length > 0
  const { items, page, pages } = pageSlice(o.creators, o.page, 48)
  const body = `
      ${pageTitle('Creator', 'Unser Netzwerk aus Influencern und UGC-Creatorn. Buche einen Creator für eine deiner Kampagnen. NIKKI MEDIA bestätigt die Buchung und bringt ihn in dein Team.')}
      ${
        o.creators.length
          ? `<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">${items.map((c) => creatorCard(c, canBook ? 'book' : 'needs-campaign')).join('')}</div>
      ${pager('/collaboration/creator', page, pages)}`
          : emptyState('Noch keine Creator', 'Sobald Creator im Netzwerk sind, stehen sie hier.')
      }

      <div class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4" data-book-modal>
        <form class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" data-book-form>
          <h2 class="font-display text-xl font-extrabold">Creator buchen</h2>
          <p class="mt-1 text-sm text-slate-500"><b data-book-name></b> für eine deiner Kampagnen. NIKKI MEDIA bestätigt die Buchung und bringt den Creator in dein Team.</p>
          <label class="mt-5 block text-sm font-semibold">Kampagne
            <select name="projectId" class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand">
              ${o.ownCampaigns.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-4 block text-sm font-semibold">Nachricht <span class="font-normal text-slate-400">(optional)</span>
            <textarea name="message" rows="3" maxlength="1000" placeholder="Was soll der Creator für dich machen?" class="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand"></textarea>
          </label>
          <p class="mt-3 hidden text-sm font-semibold text-red-700" data-book-error></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-book-cancel class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Abbrechen</button>
            <button class="${GOLD_BTN} !py-2.5">Buchung anfragen</button>
          </div>
        </form>
      </div>`

  const script = `
(function () {
  var modal = document.querySelector('[data-book-modal]');
  var form = modal.querySelector('[data-book-form]');
  var err = form.querySelector('[data-book-error]');
  var creatorId = '';
  function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  document.querySelectorAll('[data-book]').forEach(function (b) {
    b.addEventListener('click', function () {
      creatorId = b.getAttribute('data-book');
      form.querySelector('[data-book-name]').textContent = b.getAttribute('data-name');
      err.classList.add('hidden');
      modal.classList.remove('hidden'); modal.classList.add('flex');
    });
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  form.querySelector('[data-book-cancel]').addEventListener('click', close);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button:not([type])');
    btn.disabled = true;
    fetch('/api/collaboration/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorId: creatorId, projectId: form.projectId.value, message: form.message.value })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat nicht geklappt.');
        window.location.href = '/collaboration/buchungen?neu=' + (res.d.confirmed ? 'bestaetigt' : '1');
      })
      .catch(function (e2) { btn.disabled = false; err.textContent = e2.message; err.classList.remove('hidden'); });
  });
})();`

  return agencyShell({ title: 'Creator', user: o.user, locked: false, active: '/collaboration/creator', body, script })
}

export function clippersPage(o: {
  user: User
  clippers: AgencyClipper[]
  /** Eigene Kampagnen, für die Zuweisung des Demo-Clippers (nur Demo-Agentur). */
  ownCampaigns: { id: string; name: string }[]
  page: number
}): string {
  const { items, page, pages } = pageSlice(o.clippers, o.page, 50)
  const canAssign = o.ownCampaigns.length > 0
  const rows = items
    .map(
      (c) => `
        <article class="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 font-display text-base font-extrabold text-white">${esc(
            initials(c.name),
          )}</span>
          <div class="min-w-0 flex-1">
            <h3 class="truncate font-display text-lg font-extrabold">${esc(c.name)}</h3>
            <div class="mt-1.5 flex flex-wrap gap-1.5">${
              c.platforms.length
                ? c.platforms
                    .map(
                      (p) =>
                        `<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">${platformIcon(p, 'h-3.5 w-3.5')}${esc(creatorPlatformLabel(p))}</span>`,
                    )
                    .join('')
                : '<span class="text-xs text-slate-400">Plattformen folgen</span>'
            }</div>
            <p class="mt-2 text-xs text-slate-500">${[
              c.experience ? `Erfahrung: ${esc(c.experience)}` : '',
              c.availability ? `Verfügbar: ${esc(c.availability)}` : '',
              `${c.campaigns} ${c.campaigns === 1 ? 'Kampagne' : 'Kampagnen'}`,
              `${formatViews(c.clips)} ${c.clips === 1 ? 'Clip' : 'Clips'}`,
            ]
              .filter(Boolean)
              .join(' · ')}</p>${
              c.assignable
                ? canAssign
                  ? `<button type="button" data-assign="${esc(c.id)}" data-name="${esc(c.name)}" class="${GOLD_BTN} mt-3 !py-2">Clipper zuweisen</button>`
                  : `<a href="${esc(AGENCY_NEW_CAMPAIGN)}" class="mt-3 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">Erst eigene Kampagne anlegen</a>`
                : ''
            }
          </div>
        </article>`,
    )
    .join('')
  const body = `
      ${pageTitle('Clipper', 'Die Clipping-Armee von NIKKI MEDIA, wer schneidet und auf welchen Plattformen. Zugeordnet wird von NIKKI MEDIA.')}
      ${o.clippers.length ? kpiBar([{ label: 'Clipper im Netzwerk', value: formatViews(o.clippers.length) }], 'mb-5') : ''}
      ${
        o.clippers.length
          ? `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${rows}</div>
      ${pager('/collaboration/clipper', page, pages)}`
          : emptyState('Noch keine Clipper', 'Sobald Clipper im Netzwerk sind, stehen sie hier.')
      }
      ${
        canAssign
          ? `<div class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4" data-assign-modal>
        <form class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" data-assign-form>
          <h2 class="font-display text-xl font-extrabold">Clipper zuweisen</h2>
          <p class="mt-1 text-sm text-slate-500"><b data-assign-name></b> kommt sofort ins Team der Kampagne und sieht sie in seinem Dashboard.</p>
          <label class="mt-5 block text-sm font-semibold">Kampagne
            <select name="projectId" class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand">
              ${o.ownCampaigns.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
            </select>
          </label>
          <p class="mt-3 hidden text-sm font-semibold text-red-700" data-assign-error></p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" data-assign-cancel class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Abbrechen</button>
            <button class="${GOLD_BTN} !py-2.5">Zuweisen</button>
          </div>
        </form>
      </div>`
          : ''
      }`
  const script = canAssign
    ? `
(function () {
  var modal = document.querySelector('[data-assign-modal]');
  var form = modal.querySelector('[data-assign-form]');
  var err = form.querySelector('[data-assign-error]');
  var clipperId = '';
  function close() { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  document.querySelectorAll('[data-assign]').forEach(function (b) {
    b.addEventListener('click', function () {
      clipperId = b.getAttribute('data-assign');
      form.querySelector('[data-assign-name]').textContent = b.getAttribute('data-name');
      err.classList.add('hidden');
      modal.classList.remove('hidden'); modal.classList.add('flex');
    });
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  form.querySelector('[data-assign-cancel]').addEventListener('click', close);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button:not([type])');
    btn.disabled = true;
    fetch('/api/collaboration/assign-clipper', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clipperId: clipperId, projectId: form.projectId.value })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat nicht geklappt.');
        window.location.href = res.d.redirect || '/collaboration/kampagnen';
      })
      .catch(function (e2) { btn.disabled = false; err.textContent = e2.message; err.classList.remove('hidden'); });
  });
})();`
    : undefined
  return agencyShell({ title: 'Clipper', user: o.user, locked: false, active: '/collaboration/clipper', body, script })
}

export function bookingsPage(o: {
  user: User
  bookings: AgencyBooking[]
  /** Gerade gebucht: angefragt (echte Agentur) oder sofort bestätigt (Demo-Agentur). */
  justBooked: 'requested' | 'confirmed' | null
}): string {
  const tone = (s: string) => (s === 'bestaetigt' ? 'green' : s === 'abgelehnt' ? 'red' : 'amber') as 'green' | 'red' | 'amber'
  const body = `
      ${
        o.justBooked
          ? `<div class="mb-6 rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">${
              o.justBooked === 'confirmed'
                ? 'Deine Buchung ist bestätigt. Der Creator ist im Team der Kampagne und sieht sie in seinem Dashboard.'
                : 'Deine Buchung ist angefragt. NIKKI MEDIA bestätigt sie und meldet sich bei dir.'
            }</div>`
          : ''
      }
      ${pageTitle('Buchungen', 'Deine Creator-Buchungen und ihr Stand.')}
      ${
        o.bookings.length
          ? card(
              `<ul class="divide-y divide-slate-100">${o.bookings
                .map(
                  (b) => `<li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div class="min-w-0">
                      <p class="font-semibold">${esc(b.creatorName)} <span class="font-normal text-slate-400">für</span> ${esc(b.projectName)}</p>
                      <p class="text-xs text-slate-500">${dateDE(b.createdAt)}${b.message ? ` · ${esc(b.message)}` : ''}</p>
                    </div>
                    ${badge(BOOKING_STATUS_LABEL[b.status] ?? b.status, tone(b.status))}
                  </li>`,
                )
                .join('')}</ul>`,
            )
          : emptyState(
              'Noch keine Buchungen',
              'Unter „Creator“ buchst du Creator für deine Kampagnen.',
              `<a href="/collaboration/creator" class="mt-5 ${GOLD_BTN}">Creator ansehen</a>`,
            )
      }`
  return agencyShell({ title: 'Buchungen', user: o.user, locked: false, active: '/collaboration/buchungen', body })
}

/** Ohne Lead-Zeile (Zugang von Hand angelegt) — statt eines Fehlers. */
export function noLeadPage(user: User): string {
  return agencyShell({
    title: 'Collaboration',
    user,
    locked: true,
    active: '/collaboration',
    body: `${pageTitle('Collaboration')}${emptyState(
      'Dein Bereich wird gerade eingerichtet',
      'NIKKI MEDIA meldet sich bei dir, sobald alles bereitsteht.',
    )}`,
  })
}
