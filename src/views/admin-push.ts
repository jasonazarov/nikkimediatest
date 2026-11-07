/*
 * Admin-Abschnitt „Push popup“ (Vorgabe des Auftraggebers, November 2026):
 * je Kunde bzw. Agentur einstellen, alle wie viele Tage das Popup
 * „Kampagne pushen“ auf deren Übersicht erscheint (lib/upsell.ts,
 * customers.push_popup_days). Steht beim Kunden (/admin/kunden/:id) und bei
 * der Agentur (/admin/agenturen/:id). Admin ist englisch.
 */
import { PUSH_POPUP_DEFAULT_DAYS, PUSH_POPUP_MAX_DAYS, popupDaysOf } from '../lib/upsell'
import { esc, jsonScript } from './layout'

const PRESETS = [1, 3, 7, 14, 30]

export function pushPopupSection(customerId: string, stored: number | null, who: 'customer' | 'agency' | 'lead'): string {
  // Leads (noch nicht bestätigte Kunden): ohne Einstellung AUS, nicht 7 Tage.
  const lead = who === 'lead'
  const days = lead && stored === null ? 0 : popupDaysOf(stored)
  const on = days > 0
  const shown = on ? days : PUSH_POPUP_DEFAULT_DAYS
  const chips = PRESETS.map(
    (d) => `<button type="button" data-pp-preset="${d}" class="nm-pp-chip rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold transition hover:border-brand">${
      d === 1 ? 'Daily' : `${d} days`
    }${d === PUSH_POPUP_DEFAULT_DAYS ? ' <span class="text-xs font-normal text-slate-400">(default)</span>' : ''}</button>`,
  ).join('')
  return `
        <div class="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" id="push-popup" data-pp="${esc(customerId)}">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-bold">Push popup</h2>
              <p class="text-sm text-slate-500">How often ${who === 'agency' ? 'this agency' : who === 'lead' ? 'this lead' : 'this customer'} sees the “Kampagne pushen” popup on their overview: the three push offers and the days left until the discount expires. It only appears while a campaign is running.${
                lead ? ' <b>Leads are not confirmed customers yet: push offers and the popup are off until you switch them on here.</b>' : ''
              }</p>
            </div>
            <label class="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" data-pp-on class="h-4 w-4 accent-emerald-500"${on ? ' checked' : ''}> Show popup
            </label>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2" data-pp-controls>
            ${chips}
            <label class="ml-1 inline-flex items-center gap-2 text-sm">
              Every <input type="number" min="1" max="${PUSH_POPUP_MAX_DAYS}" step="1" value="${shown}" data-pp-days
                           class="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold"> days
            </label>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" data-pp-save class="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-2">Save popup setting</button>
            <span class="text-sm text-slate-500" data-pp-state></span>
            <span class="text-sm font-semibold" data-pp-msg role="status"></span>
          </div>
        </div>
<script>
(function () {
  var box = document.querySelector('[data-pp]');
  if (!box) return;
  var id = box.getAttribute('data-pp');
  var on = box.querySelector('[data-pp-on]'), input = box.querySelector('[data-pp-days]');
  var msg = box.querySelector('[data-pp-msg]'), state = box.querySelector('[data-pp-state]');
  var DEF = ${jsonScript(PUSH_POPUP_DEFAULT_DAYS)}, MAX = ${jsonScript(PUSH_POPUP_MAX_DAYS)};
  var LEAD = ${jsonScript(lead)};
  function label(d) { return d === 0 ? 'Currently: off' + (LEAD ? ' (default for leads)' : '') : 'Currently: every ' + (d === 1 ? 'day' : d + ' days') + (d === DEF && !LEAD ? ' (default)' : ''); }
  function paint() {
    box.querySelector('[data-pp-controls]').style.opacity = on.checked ? '' : '.45';
    input.disabled = !on.checked;
    var v = Number(input.value);
    box.querySelectorAll('[data-pp-preset]').forEach(function (b) {
      var hit = on.checked && Number(b.getAttribute('data-pp-preset')) === v;
      b.disabled = !on.checked;
      b.style.borderColor = hit ? '#2fe08c' : '';
      b.style.background = hit ? 'rgba(47,224,140,.14)' : '';
    });
  }
  state.textContent = label(${jsonScript(days)});
  box.querySelectorAll('[data-pp-preset]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.getAttribute('data-pp-preset'); msg.textContent = ''; paint(); });
  });
  on.addEventListener('change', function () { msg.textContent = ''; paint(); });
  input.addEventListener('input', function () { msg.textContent = ''; paint(); });
  box.querySelector('[data-pp-save]').addEventListener('click', function () {
    var d = on.checked ? Math.round(Number(input.value)) : 0;
    if (on.checked && !(d >= 1 && d <= MAX)) { msg.textContent = 'Please enter 1 to ' + MAX + ' days.'; msg.style.color = '#f87171'; return; }
    fetch('/api/admin/customers/' + encodeURIComponent(id) + '/push-popup', {
      method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days: d })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Could not save.');
        state.textContent = label(res.j.days === null ? (LEAD ? 0 : DEF) : res.j.days);
        msg.textContent = 'Saved'; msg.style.color = '#2fe08c';
      })
      .catch(function (e) { msg.textContent = e.message; msg.style.color = '#f87171'; });
  });
  paint();
})();
</script>`
}
