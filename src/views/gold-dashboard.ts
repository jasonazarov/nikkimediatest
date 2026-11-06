/**
 * Dashboard-Seiten des Gold-Marktplatzes (November 2026):
 *
 *   (upsellSection steht in layout.ts — es gehört zum Grundgerüst der Übersicht)
 *   agencyPricesPage()     /collaboration/preise — Marge der Agentur auf unsere Preise
 *   adminArticlesPage()    /admin/fachartikel — Liste
 *   adminArticleEditPage() /admin/fachartikel/neu und /admin/fachartikel/:id
 *   adminUpsellsPage()     /admin/upsells — Anfragen aus den Dashboards
 *
 * Admin englisch (Vorgabe), alles andere deutsch. Keine langen
 * Gedankenstriche in sichtbaren Texten.
 */
import type { User } from '../db/schema'
import type { Article } from '../lib/articles'
import { ARTICLE_LIMITS } from '../lib/articles'
import { MARGIN_MAX_PCT, PRICE_PER_THOUSAND_CENTS, UPSELL_PERCENTS, withMargin, type UpsellCampaign, type UpsellRow } from '../lib/upsell'
import { agencyNav } from './collaboration'
import {
  ADMIN_NAV,
  badge,
  card,
  dateEN,
  emptyState,
  esc,
  formatEuro,
  formatViews,
  jsonScript,
  pageTitle,
  shell,
} from './layout'

/* ------------------------------------------------------------- Upsell */

/* ------------------------------------------------- Agentur: Preise & Marge */

const MARGIN_STEPS = [0, 10, 20, 30, 50, 75, 100]

export function agencyPricesPage(o: { user: User; marginPct: number; campaigns: UpsellCampaign[] }): string {
  const m = o.marginPct
  const sample = [1_000_000, 3_000_000, 5_000_000, 10_000_000]
  const row = (views: number, perThousand: number) => {
    const ours = Math.round((views * perThousand) / 1000)
    const client = withMargin(ours, m)
    return `<tr>
              <td class="py-3 pr-4 font-semibold">${esc(formatViews(views))}</td>
              <td class="py-3 pr-4 tabular-nums">${esc(formatEuro(ours))}</td>
              <td class="py-3 pr-4 font-display text-base font-extrabold tabular-nums text-brand" data-client="${ours}">${esc(formatEuro(client))}</td>
              <td class="py-3 tabular-nums text-emerald-600" data-gain="${ours}">${esc(formatEuro(client - ours))}</td>
            </tr>`
  }
  const head = `<thead><tr class="text-left text-xs font-semibold text-slate-500">
              <th class="pb-2 pr-4">Views</th><th class="pb-2 pr-4">Unser Preis</th><th class="pb-2 pr-4">Euer Kundenpreis</th><th class="pb-2">Eure Marge</th>
            </tr></thead>`

  const body =
    pageTitle('Preise & Marge', 'Setzt eure Marge auf unsere Preise. Wir berechnen euch weiter unseren Preis, euer Kundenpreis ist nur für euch sichtbar.') +
    `
      <div class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        ${card(`
          <h2 class="font-display text-lg font-extrabold">Eure Marge</h2>
          <p class="mt-1 text-sm text-slate-500">Aufschlag in Prozent auf unseren Preis.</p>
          <div class="mt-5 flex items-center gap-3">
            <input id="margin-pct" type="number" inputmode="numeric" min="0" max="${MARGIN_MAX_PCT}" step="1" value="${m}"
                   class="w-28 rounded-xl border border-slate-300 px-4 py-3 text-right font-display text-2xl font-extrabold outline-none focus:border-brand" aria-label="Marge in Prozent">
            <span class="font-display text-2xl font-extrabold text-slate-500">%</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Schnellauswahl">
            ${MARGIN_STEPS.map((s) => `<button type="button" data-margin-step="${s}" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand hover:text-brand">${s} %</button>`).join('')}
          </div>
          <button id="margin-save" type="button" class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-2">Marge speichern</button>
          <p id="margin-msg" class="mt-3 hidden rounded-xl px-4 py-3 text-sm font-medium" role="status"></p>
          <p class="mt-4 text-xs leading-relaxed text-slate-400">Die Marge ändert nichts an euren Aufträgen bei NIKKI MEDIA. Sie rechnet nur aus, was ihr eurem Kunden nennt, hier und bei „Mehr Reichweite“ in der Übersicht.</p>
        `)}

        <div class="space-y-6">
          ${card(`
            <h2 class="font-display text-lg font-extrabold">Richtwert</h2>
            <p class="mt-1 text-sm text-slate-500">Unser Preis: ${esc(formatEuro(PRICE_PER_THOUSAND_CENTS))} pro 1.000 Views, also ${esc(formatEuro(PRICE_PER_THOUSAND_CENTS * 1000))} pro Million.</p>
            <div class="mt-4 overflow-x-auto"><table class="w-full text-sm">${head}<tbody class="divide-y divide-slate-100">
              ${sample.map((v) => row(v, PRICE_PER_THOUSAND_CENTS)).join('')}
            </tbody></table></div>
          `)}
          ${card(`
            <h2 class="font-display text-lg font-extrabold">Eure Kampagnen</h2>
            <p class="mt-1 text-sm text-slate-500">Zu den Konditionen aus eurem Briefing (Budget geteilt durch Views).</p>
            ${
              o.campaigns.length
                ? `<div class="mt-4 overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs font-semibold text-slate-500">
                    <th class="pb-2 pr-4">Kampagne</th><th class="pb-2 pr-4">Views</th><th class="pb-2 pr-4">Unser Preis</th><th class="pb-2 pr-4">Euer Kundenpreis</th><th class="pb-2">Eure Marge</th>
                  </tr></thead><tbody class="divide-y divide-slate-100">
                  ${o.campaigns
                    .map((c) => {
                      const ours = Math.round((c.baseViews * c.perThousandCents) / 1000)
                      const client = withMargin(ours, m)
                      return `<tr>
                      <td class="py-3 pr-4 font-semibold">${esc(c.name)}${c.baseSource === 'briefing' ? '' : ' <span class="text-xs font-normal text-slate-400">(Richtwert)</span>'}</td>
                      <td class="py-3 pr-4 tabular-nums">${esc(formatViews(c.baseViews))}</td>
                      <td class="py-3 pr-4 tabular-nums">${esc(formatEuro(ours))}</td>
                      <td class="py-3 pr-4 font-display text-base font-extrabold tabular-nums text-brand" data-client="${ours}">${esc(formatEuro(client))}</td>
                      <td class="py-3 tabular-nums text-emerald-600" data-gain="${ours}">${esc(formatEuro(client - ours))}</td>
                    </tr>`
                    })
                    .join('')}
                  </tbody></table></div>`
                : `<p class="mt-4 text-sm text-slate-500">Noch keine laufende Kampagne. Legt eine unter „Neue Kampagne erstellen“ in der Übersicht an.</p>`
            }
          `)}
        </div>
      </div>`

  const script = `
(function () {
  var input = document.getElementById('margin-pct');
  var save = document.getElementById('margin-save');
  var msg = document.getElementById('margin-msg');
  var MAX = ${MARGIN_MAX_PCT};
  var euro = function (c) { return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; };
  function pct() { var v = Math.round(Number(input.value)); return isFinite(v) ? Math.min(MAX, Math.max(0, v)) : 0; }
  function render() {
    var p = pct();
    document.querySelectorAll('[data-client]').forEach(function (el) {
      var ours = Number(el.getAttribute('data-client'));
      el.textContent = euro(Math.round(ours * (1 + p / 100)));
    });
    document.querySelectorAll('[data-gain]').forEach(function (el) {
      var ours = Number(el.getAttribute('data-gain'));
      el.textContent = euro(Math.round(ours * (1 + p / 100)) - ours);
    });
  }
  function show(text, good) {
    msg.textContent = text;
    msg.className = 'mt-3 rounded-xl px-4 py-3 text-sm font-medium ' + (good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700');
  }
  input.addEventListener('input', render);
  document.querySelectorAll('[data-margin-step]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.getAttribute('data-margin-step'); render(); });
  });
  save.addEventListener('click', function () {
    var v = Number(input.value);
    if (!isFinite(v) || v < 0 || v > MAX) { show('Bitte gib eine Marge zwischen 0 und ' + MAX + ' % ein.', false); return; }
    save.disabled = true;
    fetch('/api/agency/margin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pct: v }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Das hat nicht geklappt.');
        input.value = res.d.pct; render();
        show('Gespeichert: ' + res.d.pct + ' % Marge.', true);
      })
      .catch(function (e) { show(e.message, false); })
      .then(function () { save.disabled = false; });
  });
})();`

  return shell({ title: 'Preise & Marge', user: o.user, nav: agencyNav(false), active: '/collaboration/preise', body, script })
}

/* ------------------------------------------------------- Admin: Articles */

const inputCls =
  'w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15'

export function adminArticlesPage(o: { user: User; articles: Article[] }): string {
  const now = Math.floor(Date.now() / 1000)
  const body =
    pageTitle('Fachartikel', 'Articles appear on /fachartikel, in the “Fachartikel” block of the landing pages, in the sitemap and in /llms.txt.') +
    `<div class="mb-6 flex flex-wrap gap-3">
        <a href="/admin/fachartikel/neu" class="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-2">+ New article</a>
        <a href="/fachartikel" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400">Open public page</a>
      </div>` +
    (o.articles.length
      ? card(
          `<ul class="divide-y divide-slate-100">${o.articles
            .map((a) => {
              const state = !a.published ? badge('Draft', 'grey') : a.publishedAt > now ? badge('Scheduled', 'amber') : badge('Live', 'green')
              return `<li class="flex flex-wrap items-center justify-between gap-3 py-4">
                <div class="min-w-0">
                  <a href="/admin/fachartikel/${esc(a.id)}" class="font-display text-base font-extrabold hover:text-brand">${esc(a.title)}</a>
                  <p class="mt-0.5 text-xs text-slate-500">/fachartikel/${esc(a.slug)} · ${esc(dateEN(a.publishedAt))}${a.sourceUrl ? ' · external source' : ''}</p>
                </div>
                <div class="flex items-center gap-3">${state}<a href="/admin/fachartikel/${esc(a.id)}" class="text-sm font-semibold text-brand hover:underline">Edit</a></div>
              </li>`
            })
            .join('')}</ul>`,
        )
      : emptyState('No articles yet', 'Write the first article. Short and specific works best: one question, one clear answer.', `<a href="/admin/fachartikel/neu" class="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">+ New article</a>`))
  return shell({ title: 'Fachartikel', user: o.user, nav: ADMIN_NAV, active: '/admin/fachartikel', body })
}

/** `datetime-local` braucht „2026-11-05T14:30“ in Ortszeit Berlin. */
const localInput = (unix: number) => {
  const d = new Date(unix * 1000)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return parts.replace(' ', 'T')
}

export function adminArticleEditPage(o: { user: User; article: Article | null }): string {
  const a = o.article
  const field = (id: string, label: string, control: string, hint = '') => `
        <div>
          <label for="${id}" class="mb-1.5 block text-sm font-semibold text-slate-600">${esc(label)}</label>
          ${control}
          ${hint ? `<p class="mt-1.5 text-xs text-slate-400">${esc(hint)}</p>` : ''}
        </div>`
  const body =
    pageTitle(a ? 'Edit article' : 'New article', a ? `/fachartikel/${a.slug}` : 'Published articles are public immediately.') +
    `<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      ${card(`
        <p id="art-msg" class="mb-4 hidden rounded-xl px-4 py-3 text-sm font-medium" role="status"></p>
        <div class="space-y-5">
          ${field('art-title', 'Title', `<input id="art-title" maxlength="${ARTICLE_LIMITS.title}" class="${inputCls}" value="${esc(a?.title ?? '')}">`, 'Phrase it like a question people ask, e.g. “Was kostet Clipping 2026?”')}
          ${field('art-excerpt', 'Summary', `<textarea id="art-excerpt" rows="3" maxlength="${ARTICLE_LIMITS.excerpt}" class="${inputCls}">${esc(a?.excerpt ?? '')}</textarea>`, 'One or two sentences that answer the title directly. AI assistants quote this first.')}
          ${field('art-body', 'Article text', `<textarea id="art-body" rows="16" maxlength="${ARTICLE_LIMITS.body}" class="${inputCls} font-mono text-sm">${esc(a?.body ?? '')}</textarea>`, 'Blank line = new paragraph · “## ” = subheading · “- ” = list item. Optional if you link an external article.')}
          ${field('art-url', 'External article (optional)', `<input id="art-url" type="url" maxlength="${ARTICLE_LIMITS.url}" placeholder="https://…" class="${inputCls}" value="${esc(a?.sourceUrl ?? '')}">`, 'E.g. a guest article in a trade magazine. Must start with https://.')}
        </div>
      `)}
      <div class="space-y-6">
        ${card(`
          <div class="space-y-5">
            ${field('art-slug', 'Address', `<input id="art-slug" maxlength="90" class="${inputCls}" value="${esc(a?.slug ?? '')}" placeholder="from title">`, '/fachartikel/…')}
            ${field('art-author', 'Author', `<input id="art-author" maxlength="${ARTICLE_LIMITS.author}" class="${inputCls}" value="${esc(a?.author ?? 'Jason Azarov')}">`)}
            ${field('art-date', 'Publish date', `<input id="art-date" type="datetime-local" class="${inputCls}" value="${esc(localInput(a?.publishedAt ?? Math.floor(Date.now() / 1000)))}">`, 'Berlin time. A future date schedules the article.')}
            <label class="flex items-center gap-3 text-sm font-semibold"><input id="art-published" type="checkbox" class="h-5 w-5 accent-amber-400" ${!a || a.published ? 'checked' : ''}> Published</label>
            <button id="art-save" type="button" class="inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-2">${a ? 'Save changes' : 'Publish article'}</button>
            ${a ? `<a href="/fachartikel/${esc(a.slug)}" target="_blank" rel="noopener" class="block text-center text-sm font-semibold text-brand hover:underline">View live</a>` : ''}
          </div>
        `)}
        ${a ? card(`<button id="art-delete" type="button" class="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">Delete article</button>`) : ''}
        <a href="/admin/fachartikel" class="block text-sm font-semibold text-slate-500 hover:text-slate-800">Back to all articles</a>
      </div>
    </div>`

  const script = `
(function () {
  var id = ${jsonScript(a?.id ?? null)};
  var msg = document.getElementById('art-msg');
  var save = document.getElementById('art-save');
  function show(t, good) { msg.textContent = t; msg.className = 'mb-4 rounded-xl px-4 py-3 text-sm font-medium ' + (good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'); msg.scrollIntoView({ block: 'nearest' }); }
  function val(i) { return document.getElementById(i).value; }
  save.addEventListener('click', function () {
    var date = val('art-date');
    var payload = {
      title: val('art-title'), excerpt: val('art-excerpt'), body: val('art-body'), sourceUrl: val('art-url'),
      slug: val('art-slug'), author: val('art-author'),
      publishedAt: date ? new Date(date).toISOString() : '',
      published: document.getElementById('art-published').checked
    };
    save.disabled = true;
    fetch(id ? '/api/gold-admin/articles/' + encodeURIComponent(id) : '/api/gold-admin/articles', {
      method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Saving failed.');
        if (!id) { location.href = '/admin/fachartikel/' + encodeURIComponent(res.d.article.id) + '?saved=1'; return; }
        document.getElementById('art-slug').value = res.d.article.slug;
        show('Saved. Live at /fachartikel/' + res.d.article.slug, true);
      })
      .catch(function (e) { show(e.message, false); })
      .then(function () { save.disabled = false; });
  });
  var del = document.getElementById('art-delete');
  if (del) del.addEventListener('click', function () {
    if (!confirm('Delete this article for good?')) return;
    fetch('/api/gold-admin/articles/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) { if (!r.ok) throw new Error(); location.href = '/admin/fachartikel'; })
      .catch(function () { show('Deleting failed.', false); });
  });
  if (/[?&]saved=1/.test(location.search)) show('Article published.', true);
})();`

  return shell({ title: a ? a.title : 'New article', user: o.user, nav: ADMIN_NAV, active: '/admin/fachartikel', body, script })
}

/* -------------------------------------------------------- Admin: Upsells */

const STATUS_EN: Record<string, [string, 'amber' | 'green' | 'grey']> = {
  offen: ['Open', 'amber'],
  bestätigt: ['Confirmed', 'green'],
  abgelehnt: ['Declined', 'grey'],
}

export function adminUpsellsPage(o: { user: User; rows: UpsellRow[] }): string {
  const open = o.rows.filter((r) => r.status === 'offen')
  const sum = open.reduce((s, r) => s + r.priceCents, 0)
  const body =
    pageTitle('Upsells', `Requests for more reach (+${UPSELL_PERCENTS.join(' / +')} %) from customer and agency dashboards. A request is not an order: confirm it with the client first.`) +
    `<p class="mb-6 text-sm text-slate-500"><b class="text-slate-900">${open.length}</b> open · <b class="text-slate-900">${esc(formatEuro(sum))}</b> open volume</p>` +
    (o.rows.length
      ? card(`<div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="text-left text-xs font-semibold text-slate-500">
            <th class="pb-2 pr-4">Date</th><th class="pb-2 pr-4">Campaign</th><th class="pb-2 pr-4">From</th><th class="pb-2 pr-4">Extra</th>
            <th class="pb-2 pr-4">Price</th><th class="pb-2 pr-4">Status</th><th class="pb-2"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
          ${o.rows
            .map((r) => {
              const [label, tone] = STATUS_EN[r.status] ?? [r.status, 'grey']
              return `<tr data-upsell-row="${esc(r.id)}">
              <td class="py-3 pr-4 whitespace-nowrap">${esc(dateEN(r.createdAt))}</td>
              <td class="py-3 pr-4"><a href="/admin/projekte/${esc(r.projectId)}" class="font-semibold hover:text-brand">${esc(r.projectName)}</a></td>
              <td class="py-3 pr-4">${esc(r.userName)}<span class="block text-xs text-slate-500">${r.role === 'agency' ? 'Agency' : 'Customer'} · ${esc(r.userEmail)}</span></td>
              <td class="py-3 pr-4 whitespace-nowrap">+${r.percent} %<span class="block text-xs text-slate-500">${esc(formatViews(r.extraViews))} views</span></td>
              <td class="py-3 pr-4 whitespace-nowrap font-semibold">${esc(formatEuro(r.priceCents))}${r.clientPriceCents != null ? `<span class="block text-xs font-normal text-slate-500">client ${esc(formatEuro(r.clientPriceCents))}</span>` : ''}</td>
              <td class="py-3 pr-4">${badge(label, tone)}</td>
              <td class="py-3 whitespace-nowrap text-right">${
                r.status === 'offen'
                  ? `<button type="button" data-set="bestätigt" class="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">Confirm</button>
                     <button type="button" data-set="abgelehnt" class="ml-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">Decline</button>`
                  : `<button type="button" data-set="offen" class="text-xs font-semibold text-slate-500 hover:text-slate-800">Reopen</button>`
              }</td>
            </tr>`
            })
            .join('')}
          </tbody></table></div>`)
      : emptyState('No upsell requests yet', 'Customers and agencies see the offers on their overview page. Requests show up here and by email.'))

  const script = `
document.querySelectorAll('[data-upsell-row]').forEach(function (row) {
  row.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set]'); if (!b) return;
    b.disabled = true;
    fetch('/api/gold-admin/upsells/' + encodeURIComponent(row.getAttribute('data-upsell-row')), {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: b.getAttribute('data-set') })
    }).then(function (r) { if (!r.ok) throw new Error(); location.reload(); })
      .catch(function () { b.disabled = false; alert('Saving failed. Please try again.'); });
  });
});`
  return shell({ title: 'Upsells', user: o.user, nav: ADMIN_NAV, active: '/admin/upsells', body, script })
}
