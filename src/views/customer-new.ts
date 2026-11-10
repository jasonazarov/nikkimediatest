/*
 * „Neue Kampagne“ im Kunden-Dashboard (/app/neu), Vorgabe des Auftraggebers,
 * November 2026: dasselbe Glas-Fenster wie bei den Agenturen, aber mit den
 * Fragen des Kunden. Name, Laufzeit (30/60/90 Tage), Reichweite (Views),
 * Übersicht. Erst beim Absenden entsteht die Kampagne
 * (POST /api/app/projects mit durationDays und views); Laufzeit und Reichweite
 * hängen an der Kampagne und gehen zusätzlich per Mail an ADMIN_EMAIL. Danach
 * öffnet sich die Kampagne mit dem Glückwunsch-Popup (?angelegt=1, shell()).
 *
 * Kein fester Preis, nur der Hinweis „CPM ~5 €“ (Vorgabe des Auftraggebers).
 *
 * Jede Angabe wird schon beim Ausfüllen als Entwurf gespeichert
 * (PUT /api/app/campaign-draft, lib/drafts.ts) und beim nächsten Öffnen
 * wieder eingesetzt. Nicht abgeschickt: nach 2 Stunden Meldung an den Admin,
 * nach 24 Stunden Erinnerung an den Kunden.
 */
import type { User } from '../db/schema'
import { CAMPAIGN_DURATIONS } from '../lib/agency'
import type { Draft } from '../lib/drafts'
import { CUSTOMER_AREA } from './app'
import { stationsBar, viewsControl } from './form-window'
import { esc, jsonScript, pageTitle, shell } from './layout'

const SUBMIT_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9cf6c8] via-[#2fe08c] to-[#17a865] px-6 py-3 text-sm font-extrabold text-[#02160c] shadow-lg shadow-emerald-900/30 transition hover:brightness-105 disabled:opacity-40'

export function customerNewCampaignPage(o: { user: User; draft?: Draft | null }): string {
  const d = o.draft ?? null
  const titles = ['Name', 'Laufzeit', 'Reichweite', 'Übersicht']
  const legend = (text: string) => `<legend class="font-display text-2xl font-extrabold leading-tight sm:text-3xl">${esc(text)}</legend>`
  const durations = CAMPAIGN_DURATIONS.map(
    (d) => `
              <label class="group relative block cursor-pointer">
                <input type="radio" name="durationDays" value="${d}" class="peer sr-only"${o.draft?.durationDays === d ? ' checked' : ''}>
                <span class="nmg-choice flex h-full flex-col items-center rounded-2xl px-4 py-6 text-center">
                  <b class="font-display text-4xl font-extrabold">${d}</b>
                  <small class="mt-1 text-sm text-white/60">Tage</small>
                </span>
              </label>`,
  ).join('')
  const sumRow = (label: string, key: string) => `
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <dt class="text-sm text-white/60">${esc(label)}</dt>
                <dd class="font-display text-base font-extrabold" data-sum="${key}">–</dd>
              </div>`

  const body = `
      <a href="${esc(CUSTOMER_AREA.home)}" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← Meine Kampagnen</a>
      ${pageTitle('Neue Kampagne erstellen', 'Name, Laufzeit und Reichweite. Danach legen wir deine Kampagne an.')}
      ${
        d
          ? `<p class="mb-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/70 ring-1 ring-inset ring-white/10" data-draft-note>Deine Angaben von zuletzt sind gespeichert. Du musst nur noch abschicken.</p>`
          : ''
      }

      <section class="nmg text-white" id="neue-kampagne">
        <form class="p-6 sm:p-10" data-customer-campaign novalidate>
          ${stationsBar(titles)}

          <fieldset class="nmg-sec" data-step="1" id="abschnitt-1">
            ${legend('Wie soll die Kampagne heißen?')}
            <label class="nmg-field mx-auto mt-8 flex max-w-xl items-center">
              <input type="text" name="campaignName" autocomplete="off" maxlength="80" placeholder="${esc(CUSTOMER_AREA.text.namePlaceholder)}" value="${esc(d?.name ?? '')}"
                     class="min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold outline-none">
            </label>
            <p class="mt-3 text-center text-sm text-white/60">Ein Name, an dem du die Kampagne wiedererkennst.</p>
          </fieldset>

          <fieldset class="nmg-sec" data-step="2" id="abschnitt-2">
            ${legend('Wie lange soll die Clipping-Kampagne laufen?')}
            <div class="mt-8 grid grid-cols-3 gap-3">${durations}
            </div>
          </fieldset>

          <fieldset class="nmg-sec" data-step="3" id="abschnitt-3">
            ${legend('Wie viel Reichweite möchtest du?')}
            ${viewsControl()}
          </fieldset>

          <fieldset class="nmg-sec" data-step="4" id="abschnitt-4">
            ${legend('Deine Kampagne im Überblick')}
            <dl class="mt-6 divide-y divide-white/10 rounded-2xl bg-white/5 px-5 ring-1 ring-inset ring-white/10">
              ${sumRow('Kampagne', 'name')}
              ${sumRow('Laufzeit', 'duration')}
              ${sumRow('Reichweite', 'views')}
              ${sumRow('CPM', 'cpm')}
            </dl>
            <p class="mt-4 text-sm text-white/60">Nach dem Erstellen lädst du dein Rohmaterial hoch oder fügst einen Cloud-Link ein. NIKKI MEDIA meldet sich zu Start und Abrechnung.</p>
          </fieldset>

          <p class="mt-6 hidden rounded-xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200 ring-1 ring-inset ring-red-400/30" data-error role="alert"></p>

          <div class="mt-8 flex justify-end">
            <button type="submit" class="${SUBMIT_BTN} nmg-submit" data-submit>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              Kampagne erstellen
            </button>
          </div>
        </form>
      </section>`

  const script = `
(function () {
  var form = document.querySelector('[data-customer-campaign]');
  var range = form.viewsStep, err = form.querySelector('[data-error]'), sending = false;
  var PROJECT_HREF = ${jsonScript(CUSTOMER_AREA.projectHref('{id}'))};
  var DRAFT_VIEWS = ${jsonScript(d?.views ?? null)};
  // Reichweite zählt erst als Angabe, wenn der Regler bewegt wurde (oder schon im Entwurf stand).
  var viewsTouched = DRAFT_VIEWS !== null;
  if (viewsTouched) range.value = String(DRAFT_VIEWS);
  // Entwurf speichern, kurz nach jeder Änderung (lib/drafts.ts). Fehler bleiben still.
  var saveTimer = 0, lastSaved = '';
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (sending) return;
      var data = { name: form.campaignName.value.trim(), durationDays: duration() || null, views: viewsTouched ? Number(range.value) : null };
      var json = JSON.stringify(data);
      if (json === lastSaved || (!data.name && !data.durationDays && !data.views)) return;
      lastSaved = json;
      fetch('/api/app/campaign-draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json, keepalive: true }).catch(function () {});
    }, 900);
  }
  range.addEventListener('input', function () { viewsTouched = true; });
  function duration() { var el = form.querySelector('input[name="durationDays"]:checked'); return el ? Number(el.value) : 0; }
  function show(m) { err.textContent = m || ''; err.classList.toggle('hidden', !m); }
  function update() {
    var v = Number(range.value);
    form.querySelector('[data-views-out]').textContent = v.toLocaleString('de-DE');
    range.style.setProperty('--p', ((v - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100) + '%');
    form.querySelector('[data-views-est]').innerHTML = '<span>CPM <b>~5 €</b> · Kosten je 1.000 Views</span>';
    var set = function (k, t) { form.querySelector('[data-sum="' + k + '"]').textContent = t; };
    set('name', form.campaignName.value.trim() || '–');
    set('duration', duration() ? duration() + ' Tage' : '–');
    set('views', v.toLocaleString('de-DE') + ' Views');
    set('cpm', '~5 € je 1.000 Views');
  }
  function problem(n) {
    if (n === 1 && !form.campaignName.value.trim()) return 'Bitte gib der Kampagne einen Namen.';
    if (n === 2 && !duration()) return 'Bitte wähle die Laufzeit: 30, 60 oder 90 Tage.';
    return '';
  }
  function jumpTo(n, quiet) {
    var f = form.querySelector('fieldset[data-step="' + n + '"]');
    if (!f) return;
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (quiet) return;
    var m = f.querySelector('.nmg-miss');
    if (!m) { m = document.createElement('p'); m.className = 'nmg-miss'; m.setAttribute('role', 'alert'); f.appendChild(m); }
    m.textContent = err.textContent;
    f.classList.add('is-missing');
    setTimeout(function () { f.classList.remove('is-missing'); if (m.parentNode) m.parentNode.removeChild(m); }, 4000);
  }
  var stationLinks = form.querySelectorAll('[data-station]');
  function stations() {
    var cur = 0;
    form.querySelectorAll('fieldset[data-step]').forEach(function (f, i) { if (f.getBoundingClientRect().top < 260) cur = i; });
    stationLinks.forEach(function (a, i) {
      a.classList.toggle('is-done', i < cur); a.classList.toggle('is-now', i === cur);
      a.querySelector('i').textContent = i < cur ? '✓' : String(i + 1);
    });
  }
  window.addEventListener('scroll', stations, { passive: true });
  stationLinks.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); jumpTo(Number(a.getAttribute('data-station')), true); }); });
  form.addEventListener('input', function () { show(''); update(); saveDraft(); });
  form.addEventListener('change', function () { update(); saveDraft(); });
  form.campaignName.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    for (var n = 1; n <= 2; n++) { var p = problem(n); if (p) { show(p); jumpTo(n); return; } }
    sending = true; form.querySelector('[data-submit]').disabled = true;
    fetch('/api/app/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.campaignName.value.trim(), durationDays: duration(), views: Number(range.value) })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat leider nicht geklappt.');
        // Die Kampagne öffnet sich mit dem Glückwunsch-Popup (shell(), ?angelegt=1).
        window.location.href = PROJECT_HREF.replace('{id}', encodeURIComponent(res.d.id)) + '?angelegt=1';
      })
      .catch(function (e2) { sending = false; form.querySelector('[data-submit]').disabled = false; show(e2.message); });
  });
  update(); stations();
  if (!form.campaignName.value) form.campaignName.focus();
})();`

  return shell({ title: 'Neue Kampagne', user: o.user, nav: CUSTOMER_AREA.nav, active: CUSTOMER_AREA.active, body, script })
}
