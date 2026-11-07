import { ADMIN_NAV, badge, card, dateEN, dateTimeEN, emptyState, esc, formatEuro, kpiBar, pageTitle, sectionHead, shell } from './layout'
import { formatPhone, telHref } from '../lib/phone'
import { pushPopupSection } from './admin-push'
import {
  BOOKING_STATUS_LABEL,
  agencyClientsLabelEn,
  agencyFootageLabel,
  agencyKindLabel,
  agencyPackageLabel,
  agencyPlatformLabel,
  agencySocials,
  agencySourceLabel,
  agencyUnlocked,
  viewsShort,
  type Briefing,
} from '../lib/agency'
import type { AgencyLead, CooperationCode, User } from '../db/schema'

/*
 * Administration der Agenturen (/admin/agenturen) — englisch wie der ganze
 * Admin-Bereich. Ausnahmen sind die vom Auftraggeber vorgegebenen Wörter:
 * der Menüpunkt „Agenturen“ und der Knopf „+ Cooperation-Code erstellen“.
 *
 * Kalt oder warm entscheidet der Cooperation-Code (siehe lib/agency.ts).
 * Hier entstehen die Codes, hier wird ein kalter Lead freigegeben, ein
 * warmer gesperrt, und hier werden Creator-Buchungen bestätigt.
 */

export interface AgencyRow {
  lead: AgencyLead
  fullName: string
  email: string
  phone: string | null
  code: string | null
}

export interface CodeRow {
  code: CooperationCode
  usedByName: string | null
  usedByLeadId: string | null
}

export interface BookingRow {
  id: string
  /** Creator- oder Clipper-Buchung (Migration 0028). */
  kind: 'creator' | 'clipper'
  status: string
  message: string | null
  createdAt: number
  /** Name und Id des Creators bzw. Clippers. */
  creatorName: string
  creatorId: string
  projectId: string
  projectName: string
  agencyName: string
  agencyLeadId: string | null
}

/** Warm oder kalt — die zentrale Unterscheidung, groß und farbig. */
export const leadTypeBadge = (warm: boolean) =>
  warm
    ? `<span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm" data-lead-type="warm">🔥 Warm lead</span>`
    : `<span class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800 ring-1 ring-inset ring-sky-200" data-lead-type="cold">❄ Cold lead</span>`

/** Was der Lead gerade sieht. */
export function accessBadge(lead: AgencyLead): string {
  if (agencyUnlocked(lead)) return badge('Access open', 'green')
  if (!lead.briefedAt) return lead.accessAt || lead.warm ? badge('Awaiting briefing', 'amber') : badge('Locked · no briefing', 'grey')
  return badge('Locked', 'red')
}

const briefingLine = (lead: AgencyLead) =>
  lead.briefedAt
    ? `${esc(viewsShort(lead.viewsTarget))} views · ${esc(lead.budgetCents ? formatEuro(lead.budgetCents) : '–')}<br><span class="text-xs text-slate-500">${esc(
        agencyPackageLabel(lead.package),
      )}</span>`
    : '<span class="text-slate-400">–</span>'

/** Die Knöpfe zum Freigeben, Sperren, Umstufen und Löschen — Liste und Detailseite. */
function leadActions(r: AgencyRow, compact: boolean): string {
  const l = r.lead
  const size = compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
  const open = Boolean(l.accessAt)
  return `<div class="flex flex-wrap ${compact ? 'justify-end' : ''} gap-2">
      <button type="button" data-agency="${esc(l.id)}" data-set="access" data-value="${open ? '0' : '1'}"
              class="rounded-lg font-bold transition ${size} ${
                open
                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }">${open ? 'Lock access' : 'Grant access'}</button>
      <button type="button" data-agency="${esc(l.id)}" data-set="warm" data-value="${l.warm ? '0' : '1'}"
              class="rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 transition hover:border-slate-400 ${size}">${
                l.warm ? 'Mark as cold' : 'Mark as warm'
              }</button>
      ${
        compact
          ? ''
          : `<button type="button" data-agency-delete="${esc(l.id)}" data-email="${esc(r.email)}"
                     class="rounded-lg border border-red-200 bg-white font-semibold text-red-600 transition hover:bg-red-50 ${size}">Delete</button>`
      }
    </div>`
}

const ACTIONS_JS = `
  function call(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'That did not work.');
        return d;
      });
    });
  }
  document.querySelectorAll('[data-agency][data-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-set');
      var on = btn.getAttribute('data-value') === '1';
      var body = {}; body[key] = on;
      btn.disabled = true;
      call('POST', '/api/admin/agencies/' + btn.getAttribute('data-agency'), body)
        .then(function () { window.location.reload(); })
        .catch(function (e) { btn.disabled = false; window.alert(e.message); });
    });
  });
  document.querySelectorAll('[data-agency-delete]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('Delete this agency for good? Its account, own campaigns, files and bookings disappear with it. ' + btn.getAttribute('data-email') + ' becomes free for a new signup.')) return;
      btn.disabled = true;
      call('DELETE', '/api/admin/agencies/' + btn.getAttribute('data-agency-delete'))
        .then(function () { window.location.href = '/admin/agenturen'; })
        .catch(function (e) { btn.disabled = false; window.alert(e.message); });
    });
  });
  document.querySelectorAll('[data-booking]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var accept = btn.getAttribute('data-accept') === '1';
      if (!accept && !window.confirm('Decline this booking?')) return;
      btn.disabled = true;
      call('POST', '/api/admin/bookings/' + btn.getAttribute('data-booking'), { accept: accept })
        .then(function () { window.location.reload(); })
        .catch(function (e) { btn.disabled = false; window.alert(e.message); });
    });
  });`

function bookingList(rows: BookingRow[], showAgency: boolean): string {
  if (!rows.length) return '<p class="text-sm text-slate-400">No bookings yet.</p>'
  const tone = (s: string) => (s === 'bestaetigt' ? 'green' : s === 'abgelehnt' ? 'red' : 'amber') as 'green' | 'red' | 'amber'
  const label: Record<string, string> = { angefragt: 'Requested', bestaetigt: 'Confirmed', abgelehnt: 'Declined' }
  return `<ul class="divide-y divide-slate-100">${rows
    .map(
      (b) => `<li class="flex flex-wrap items-center justify-between gap-3 py-3" data-booking-row="${esc(b.id)}">
        <div class="min-w-0">
          <p class="font-semibold"><span class="mr-1.5 inline-flex rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${
            b.kind === 'creator' ? 'bg-pink-50 text-pink-700 ring-pink-200' : 'bg-violet-50 text-violet-700 ring-violet-200'
          }">${b.kind === 'creator' ? 'Creator' : 'Clipper'}</span><a href="/admin/${b.kind === 'creator' ? 'creator' : 'clipper'}/${esc(b.creatorId)}" class="hover:text-brand">${esc(b.creatorName)}</a>
            <span class="font-normal text-slate-400">for</span> <a href="/admin/projekte/${esc(b.projectId)}" class="hover:text-brand">${esc(b.projectName)}</a>
            ${
              showAgency
                ? `<span class="font-normal text-slate-400">·</span> ${
                    b.agencyLeadId
                      ? `<a href="/admin/agenturen/${esc(b.agencyLeadId)}" class="hover:text-brand">${esc(b.agencyName)}</a>`
                      : esc(b.agencyName)
                  }`
                : ''
            }</p>
          <p class="text-xs text-slate-500">${dateTimeEN(b.createdAt)}${b.message ? ` · „${esc(b.message)}“` : ''}</p>
        </div>
        ${
          b.status === 'angefragt'
            ? `<div class="flex gap-2">
                 <button type="button" data-booking="${esc(b.id)}" data-accept="1" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">Confirm &amp; add to team</button>
                 <button type="button" data-booking="${esc(b.id)}" data-accept="0" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">Decline</button>
               </div>`
            : badge(label[b.status] ?? BOOKING_STATUS_LABEL[b.status] ?? b.status, tone(b.status))
        }
      </li>`,
    )
    .join('')}</ul>`
}

/* ------------------------------------------------------------- Liste */

export function agenciesPage(o: {
  user: User
  rows: AgencyRow[]
  codes: CodeRow[]
  bookings: BookingRow[]
  filter: 'all' | 'warm' | 'cold'
}): string {
  const warm = o.rows.filter((r) => r.lead.warm).length
  const list = o.filter === 'warm' ? o.rows.filter((r) => r.lead.warm) : o.filter === 'cold' ? o.rows.filter((r) => !r.lead.warm) : o.rows
  const openCodes = o.codes.filter((c) => !c.code.usedAt)
  const pending = o.bookings.filter((b) => b.status === 'angefragt')

  const chip = (key: 'all' | 'warm' | 'cold', label: string, n: number) =>
    `<a href="/admin/agenturen${key === 'all' ? '' : `?filter=${key}`}" class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      o.filter === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-slate-300'
    }">${esc(label)}<span class="text-xs opacity-70">${n}</span></a>`

  const codeRows = o.codes
    .map(
      (c) => `<tr class="border-t border-slate-100">
          <td class="px-5 py-3"><code class="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold tracking-[.18em]">${esc(c.code.code)}</code></td>
          <td class="hidden py-3 pr-3 text-slate-600 md:table-cell">${esc(c.code.note || '–')}</td>
          <td class="hidden py-3 pr-3 whitespace-nowrap text-slate-500 lg:table-cell">${dateEN(c.code.createdAt)}</td>
          <td class="py-3 pr-3">${
            c.code.usedAt
              ? `${badge('Used', 'grey')}<span class="mt-1 block truncate text-xs text-slate-500">${
                  c.usedByLeadId
                    ? `<a href="/admin/agenturen/${esc(c.usedByLeadId)}" class="hover:text-brand">${esc(c.usedByName ?? '–')}</a>`
                    : esc(c.usedByName ?? 'deleted lead')
                } · ${dateEN(c.code.usedAt)}</span>`
              : badge('Open', 'green')
          }</td>
          <td class="py-3 pr-4 text-right">${
            c.code.usedAt
              ? ''
              : `<div class="flex justify-end gap-1.5">
                   <button type="button" data-copy="${esc(c.code.code)}" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand">Copy</button>
                   <a href="https://wa.me/?text=${encodeURIComponent(`Dein Cooperation-Code für NIKKI MEDIA: ${c.code.code}: eintragen auf https://nikkimedia.co/brands`)}" target="_blank" rel="noopener" class="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">WhatsApp</a>
                   <button type="button" data-code-delete="${esc(c.code.id)}" class="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                 </div>`
          }</td>
        </tr>`,
    )
    .join('')

  const leadRows = list
    .map(
      (r) => `<tr class="border-t border-slate-100 hover:bg-slate-50 ${r.lead.warm ? 'bg-amber-50/40' : ''}" data-agency-row="${esc(r.lead.id)}">
          <td class="px-5 py-3">
            <a href="/admin/agenturen/${esc(r.lead.id)}" class="block truncate font-semibold hover:text-brand">${esc(r.fullName)}</a>
            <span class="block truncate text-xs text-slate-500">${esc(r.lead.company || agencyKindLabel(r.lead))}</span>
          </td>
          <td class="py-3 pr-3">${leadTypeBadge(Boolean(r.lead.warm))}${r.lead.demo ? ` ${badge('Demo', 'blue')}` : ''}</td>
          <td class="hidden py-3 pr-3 md:table-cell">${accessBadge(r.lead)}</td>
          <td class="hidden py-3 pr-3 text-sm lg:table-cell">${briefingLine(r.lead)}</td>
          <td class="hidden py-3 pr-3 whitespace-nowrap text-slate-500 xl:table-cell">${dateEN(r.lead.createdAt)}</td>
          <td class="py-3 pr-4">${leadActions(r, true)}</td>
        </tr>`,
    )
    .join('')

  const body = `
      ${pageTitle(
        'Agenturen',
        'Leads from /brands. Warm leads signed up with a Cooperation-Code, after their briefing they see all campaigns, creators and clippers. Cold leads stay locked until you grant access.',
      )}

      ${kpiBar(
        [
          { label: 'Leads', value: String(o.rows.length) },
          { label: 'Warm', value: String(warm) },
          { label: 'Cold', value: String(o.rows.length - warm) },
          { label: 'Access open', value: String(o.rows.filter((r) => agencyUnlocked(r.lead)).length) },
          { label: 'Open codes', value: String(openCodes.length) },
          { label: 'Bookings to confirm', value: String(pending.length) },
        ],
        'mb-6',
      )}

      <section class="rounded-2xl p-5 nmw-brand-glass nmw-brand-glass--soft" id="codes">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="font-display text-xl font-extrabold">Cooperation-Codes</h2>
            <p class="mt-1 max-w-2xl text-sm text-slate-600">Six characters, valid exactly once. Send a code to a warm lead after the first call (e.g. via WhatsApp): whoever enters it on /brands, or later in their dashboard, becomes a warm lead.</p>
          </div>
          <form class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" data-code-create>
            <input name="note" maxlength="120" placeholder="For whom? (optional)" class="min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand sm:w-56">
            <button class="whitespace-nowrap rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-brand-2">+ Cooperation-Code erstellen</button>
          </form>
        </div>
        <div class="mt-4 hidden rounded-2xl bg-[#0b0a07] px-5 py-5 text-center text-white" data-code-new>
          <p class="text-xs font-bold uppercase tracking-[.16em] text-amber-300">New Cooperation-Code</p>
          <p class="mt-2 font-mono text-4xl font-extrabold tracking-[.3em]" data-code-value></p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" data-copy-new class="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Copy</button>
            <a href="#" target="_blank" rel="noopener" data-wa-new class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500">Send via WhatsApp</a>
          </div>
        </div>
        ${
          o.codes.length
            ? `<div class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                 <table class="w-full table-fixed text-left text-sm">
                   <colgroup><col class="w-[30%] md:w-[18%]"><col class="hidden md:table-column md:w-[28%]"><col class="hidden lg:table-column lg:w-[12%]"><col class="w-[34%] md:w-[20%]"><col class="w-[36%] md:w-[22%]"></colgroup>
                   <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                     <tr><th class="px-5 py-3 font-semibold">Code</th><th class="hidden py-3 pr-3 font-semibold md:table-cell">Note</th><th class="hidden py-3 pr-3 font-semibold lg:table-cell">Created</th><th class="py-3 pr-3 font-semibold">Status</th><th class="py-3 pr-4 text-right font-semibold">Action</th></tr>
                   </thead>
                   <tbody>${codeRows}</tbody>
                 </table>
               </div>`
            : '<p class="mt-4 text-sm text-slate-400">No codes yet.</p>'
        }
      </section>

      ${
        pending.length
          ? `${sectionHead('Bookings to confirm (creators & clippers)')}${card(bookingList(pending, true))}`
          : ''
      }

      ${sectionHead('Leads', `<div class="flex flex-wrap gap-2">${chip('all', 'All', o.rows.length)}${chip('warm', 'Warm', warm)}${chip('cold', 'Cold', o.rows.length - warm)}</div>`)}
      ${
        list.length
          ? `<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
               <table class="w-full table-fixed text-left text-sm">
                 <colgroup>
                   <col class="w-[34%] md:w-[22%]">
                   <col class="w-[24%] md:w-[14%]">
                   <col class="hidden md:table-column md:w-[16%]">
                   <col class="hidden lg:table-column lg:w-[18%]">
                   <col class="hidden xl:table-column xl:w-[10%]">
                   <col class="w-[42%] md:w-[30%] lg:w-[20%]">
                 </colgroup>
                 <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                   <tr>
                     <th class="px-5 py-3 font-semibold">Lead</th>
                     <th class="py-3 pr-3 font-semibold">Type</th>
                     <th class="hidden py-3 pr-3 font-semibold md:table-cell">Access</th>
                     <th class="hidden py-3 pr-3 font-semibold lg:table-cell">Briefing</th>
                     <th class="hidden py-3 pr-3 font-semibold xl:table-cell">Date</th>
                     <th class="py-3 pr-4 text-right font-semibold">Action</th>
                   </tr>
                 </thead>
                 <tbody>${leadRows}</tbody>
               </table>
             </div>`
          : emptyState('No agencies yet', 'Everyone who signs up on /brands appears here.')
      }`

  const script = `
(function () {${ACTIONS_JS}
  function copy(text, btn) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      var old = btn.textContent; btn.textContent = 'Copied ✓';
      window.setTimeout(function () { btn.textContent = old; }, 1400);
    }).catch(function () { window.prompt('Copy the code:', text); });
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () { copy(b.getAttribute('data-copy'), b); });
  });
  var form = document.querySelector('[data-code-create]');
  var box = document.querySelector('[data-code-new]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button');
    btn.disabled = true;
    call('POST', '/api/admin/cooperation-codes', { note: form.note.value }).then(function (d) {
      box.querySelector('[data-code-value]').textContent = d.code;
      box.querySelector('[data-wa-new]').href = 'https://wa.me/?text=' + encodeURIComponent('Dein Cooperation-Code für NIKKI MEDIA: ' + d.code + ', eintragen auf https://nikkimedia.co/brands');
      box.querySelector('[data-copy-new]').onclick = function () { copy(d.code, this); };
      box.classList.remove('hidden');
      form.note.value = '';
      btn.disabled = false;
      window.setTimeout(function () { window.location.reload(); }, 60000);
    }).catch(function (e2) { btn.disabled = false; window.alert(e2.message); });
  });
  document.querySelectorAll('[data-code-delete]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!window.confirm('Delete this unused code? It can no longer be redeemed.')) return;
      b.disabled = true;
      call('DELETE', '/api/admin/cooperation-codes/' + b.getAttribute('data-code-delete'))
        .then(function () { window.location.reload(); })
        .catch(function (e2) { b.disabled = false; window.alert(e2.message); });
    });
  });
})();`

  return shell({ title: 'Agenturen', user: o.user, nav: ADMIN_NAV, active: '/admin/agenturen', body, script })
}

/* ---------------------------------------------------------- Detailseite */

/** Eine Kampagne der Agentur — mit dem Briefing, über das sie entstand. */
export interface AgencyCampaignRow {
  id: string
  name: string
  createdAt: number
  briefing: Briefing | null
}

export function agencyDetailPage(o: {
  user: User
  row: AgencyRow
  bookings: BookingRow[]
  /** Alle eigenen Kampagnen der Agentur, neueste zuerst. */
  campaigns: AgencyCampaignRow[]
  /** „Kampagne pushen“-Popup: gespeicherter Abstand in Tagen (NULL = Standard). */
  pushPopupDays?: number | null
}): string {
  const l = o.row.lead
  const platforms: string[] = (() => {
    try {
      return JSON.parse(l.platforms || '[]')
    } catch {
      return []
    }
  })()
  const item = (label: string, value: string) => `
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-400">${esc(label)}</dt>
          <dd class="mt-0.5 break-words font-semibold">${value}</dd>
        </div>`
  const socials = agencySocials(l)
  const firstCampaign = o.campaigns.find((p) => p.id === l.projectId)

  const body = `
      <a href="/admin/agenturen" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand">← All agencies</a>
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">${leadTypeBadge(Boolean(l.warm))}${accessBadge(l)}${
            l.demo ? badge('Demo account: invented network, real own campaigns, password login at /login/demo', 'blue') : ''
          }</div>
          <h1 class="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">${esc(o.row.fullName)}</h1>
          <p class="mt-1 text-slate-500">${esc(l.company || '–')} · ${esc(agencyKindLabel(l))}</p>
        </div>
        ${leadActions(o.row, false)}
      </header>

      <div class="grid gap-5 lg:grid-cols-2">
        ${card(`
          <h2 class="font-display text-lg font-bold">From the form</h2>
          <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            ${item('Email', `<a href="mailto:${esc(o.row.email)}" class="hover:text-brand">${esc(o.row.email)}</a>`)}
            ${item('Phone', o.row.phone ? `<a href="tel:${esc(telHref(o.row.phone))}" class="hover:text-brand">${esc(formatPhone(o.row.phone))}</a>` : '–')}
            ${item('Clients interested in clipping', esc(agencyClientsLabelEn(l.hasClients)))}
            ${item('Type', esc(agencyKindLabel(l)))}
            ${item('Platforms', esc(platforms.map(agencyPlatformLabel).join(', ') || '–'))}
            ${item('Found us via', esc(agencySourceLabel(l.source)))}
            ${item('Niche', esc(l.niche))}
            ${item('Raw footage', esc(agencyFootageLabel(l.footage)))}
            ${item(
              'Footage link',
              l.footageLink ? `<a href="${esc(l.footageLink)}" target="_blank" rel="noopener" class="text-brand hover:underline">${esc(l.footageLink)}</a>` : '–',
            )}
            ${item('Social media', socials.length ? socials.map((s) => `${esc(s.label)}: ${esc(s.value)}`).join('<br>') : '–')}
            ${item('Cooperation-Code', o.row.code ? `<code class="font-mono tracking-[.18em]">${esc(o.row.code)}</code>` : '–')}
            ${item('Signed up', esc(dateTimeEN(l.createdAt)))}
          </dl>`)}

        ${card(`
          <h2 class="font-display text-lg font-bold">Briefing</h2>
          ${
            l.briefedAt
              ? `<dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                   ${item('Views', esc(`${viewsShort(l.viewsTarget)} views`))}
                   ${item('Budget', esc(l.budgetCents ? formatEuro(l.budgetCents) : '–'))}
                   ${item('Package', esc(agencyPackageLabel(l.package)))}
                   ${item('Started', esc(dateTimeEN(l.briefedAt)))}
                   ${item(
                     'Own campaign',
                     l.projectId && firstCampaign
                       ? `<a href="/admin/projekte/${esc(l.projectId)}" class="text-brand hover:underline">${esc(firstCampaign.name)}</a>`
                       : '–',
                   )}
                   ${item('Access since', esc(l.accessAt ? dateTimeEN(l.accessAt) : '–'))}
                 </dl>`
              : '<p class="mt-3 text-sm text-slate-500">Not submitted yet: the lead sees the briefing as soon as they log in.</p>'
          }
          <p class="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-inset ring-slate-200">
            Access needs both: an open lock (warm lead, code redeemed or granted by you) <b>and</b> the submitted briefing.
            Marking a lead as cold also locks access.
          </p>`)}
      </div>

      ${sectionHead(`Campaigns (${o.campaigns.length})`)}
      ${
        o.campaigns.length
          ? card(
              `<ul class="divide-y divide-slate-100">${o.campaigns
                .map(
                  (p) => `<li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div class="min-w-0">
                      <a href="/admin/projekte/${esc(p.id)}" class="font-semibold hover:text-brand">${esc(p.name)}</a>
                      <p class="text-xs text-slate-500">Started ${esc(dateEN(p.createdAt))}</p>
                    </div>
                    <p class="text-right text-sm">${
                      p.briefing
                        ? `${esc(`${viewsShort(p.briefing.views)} views`)} · ${esc(formatEuro(p.briefing.budgetCents))}<br><span class="text-xs text-slate-500">${esc(
                            p.briefing.pkg ? agencyPackageLabel(p.briefing.pkg) : p.briefing.niche ?? '',
                          )}</span>`
                        : '<span class="text-xs text-slate-400">No briefing</span>'
                    }</p>
                  </li>`,
                )
                .join('')}</ul>`,
            )
          : emptyState('No campaigns yet', 'Every campaign of this agency starts with its briefing: views, budget and package.')
      }

      ${l.customerId ? pushPopupSection(l.customerId, o.pushPopupDays ?? null, 'agency') : ''}

      ${sectionHead('Bookings (creators & clippers)')}
      ${card(bookingList(o.bookings, false))}`

  return shell({
    title: o.row.fullName,
    user: o.user,
    nav: ADMIN_NAV,
    active: '/admin/agenturen',
    body,
    script: `(function () {${ACTIONS_JS}\n})();`,
  })
}
