/**
 * Das CRM unter /admin. Aufbau angelehnt an den Admin von Nikki Media
 * (Seitenleiste mit Menügruppen, Kopfzeile mit Sprung-Suche „/“, Stat-Karten,
 * Tabellen, CRM-Verlauf je Lead), in Marinas Farben. Styles: /assets/css/crm.css.
 */
import { BUDGET, ERREICHBAR, KRISE, SITUATION, START, STATUS, WOHER, label, type Status } from '../lib/fragen'
import type { Lead, LeadEvent } from '../lib/leads'
import { ago, dayKey, esc, fmtDate, fmtDateTime, phoneDigits } from '../lib/util'

const CSS_V = '20261111'

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  wa: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
}
const icon = (name: keyof typeof ICON, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`

export const statusLabel = (s: string) => STATUS.find((x) => x.value === s)?.label ?? s
const pill = (s: string) => `<span class="pill pill--${esc(s)}">${esc(statusLabel(s))}</span>`

const head = (title: string) => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} | CRM Marina Betke</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/bricolage-grotesque-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/crm.css?v=${CSS_V}">
<meta name="theme-color" content="#0b2029">
</head>`

/* ------------------------------------------------------------------ Rahmen */

interface ShellOpts {
  title: string
  crumb?: string
  active: 'uebersicht' | 'leads' | 'lead'
  counts: Record<string, number>
  status?: string
  q?: string
  flash?: string
  body: string
}

export function shell(o: ShellOpts): string {
  const total = Object.values(o.counts).reduce((a, b) => a + b, 0)
  const item = (href: string, ic: keyof typeof ICON, text: string, on: boolean, n?: number) =>
    `<a class="nav__item${on ? ' is-on' : ''}" href="${href}">${icon(ic)}<span>${esc(text)}</span>${n !== undefined ? `<b>${n}</b>` : ''}</a>`
  const statusItems = STATUS.map(
    (s) =>
      `<a class="nav__item nav__item--status${o.status === s.value ? ' is-on' : ''}" href="/admin/leads?status=${s.value}"><i class="dot dot--${s.value}"></i><span>${esc(
        s.label,
      )}</span><b>${o.counts[s.value] ?? 0}</b></a>`,
  ).join('')

  return `${head(o.title)}
<body class="crm">
<div class="crm__glow" aria-hidden="true"></div>
<aside class="side" id="sidenav">
  <a class="side__brand" href="/admin">
    <span class="side__mark">MB</span>
    <span><b>Marina Betke</b><small>Lead-CRM</small></span>
  </a>
  <nav class="nav" aria-label="CRM">
    <p class="nav__group">Arbeitsbereich</p>
    ${item('/admin', 'home', 'Übersicht', o.active === 'uebersicht')}
    ${item('/admin/leads', 'users', 'Alle Leads', o.active === 'leads' && !o.status, total)}
    <p class="nav__group">Pipeline</p>
    ${statusItems}
    <p class="nav__group">Werkzeuge</p>
    ${item('/admin/export.csv', 'download', 'Export (CSV)', false)}
    ${item('/terminbuchung/', 'globe', 'Formular ansehen', false)}
  </nav>
  <form method="post" action="/admin/logout" class="side__logout"><button type="submit">${icon('logout')}<span>Abmelden</span></button></form>
</aside>
<div class="main">
  <header class="top">
    <button class="top__menu" type="button" data-menu aria-label="Menü" aria-controls="sidenav">${icon('menu')}</button>
    <p class="top__crumb"><span>CRM</span>${o.crumb ? ` › <b>${esc(o.crumb)}</b>` : ''}</p>
    <form class="top__search" method="get" action="/admin/leads" role="search">
      ${icon('search', 16)}
      <input type="search" name="q" value="${esc(o.q ?? '')}" placeholder="Name, Nummer, Telefon, E-Mail …" aria-label="Leads durchsuchen" data-search>
      <kbd>/</kbd>
    </form>
  </header>
  ${o.flash ? `<p class="flash" role="status">${esc(o.flash)}</p>` : ''}
  <main class="content">
${o.body}
  </main>
</div>
<script>
(function(){
  var s=document.querySelector('[data-search]');
  document.addEventListener('keydown',function(e){
    var t=e.target.tagName;
    if((e.key==='/'&&t!=='INPUT'&&t!=='TEXTAREA'&&t!=='SELECT')||((e.metaKey||e.ctrlKey)&&e.key==='k')){e.preventDefault();s.focus();s.select();}
    if(e.key==='Escape')document.body.classList.remove('nav-open');
  });
  var m=document.querySelector('[data-menu]');
  m.addEventListener('click',function(e){e.stopPropagation();document.body.classList.toggle('nav-open');});
  document.addEventListener('click',function(e){if(document.body.classList.contains('nav-open')&&!e.target.closest('#sidenav'))document.body.classList.remove('nav-open');});
  [].forEach.call(document.querySelectorAll('[data-confirm]'),function(f){
    f.addEventListener('submit',function(e){if(!confirm(f.getAttribute('data-confirm')))e.preventDefault();});
  });
  [].forEach.call(document.querySelectorAll('tr[data-href]'),function(r){
    r.addEventListener('click',function(e){if(e.target.closest('a,button'))return;location.href=r.getAttribute('data-href');});
  });
})();
</script>
</body>
</html>`
}

/* ------------------------------------------------------------------ Login */

export const loginPage = (msg = '', kind: 'error' | 'info' = 'error'): string => `${head('Anmelden')}
<body class="crm crm--login">
<div class="crm__glow" aria-hidden="true"></div>
<main class="login">
  <div class="login__card">
    <span class="side__mark side__mark--big">MB</span>
    <p class="eyebrow">Marina Betke</p>
    <h1>Lead-CRM</h1>
    <p class="muted">Hier landen alle Anfragen aus dem Formular auf der Terminseite.</p>
    ${msg ? `<p class="note note--${kind}" role="alert">${esc(msg)}</p>` : ''}
    <form method="post" action="/admin/login" class="login__form">
      <label for="pw">Passwort</label>
      <input id="pw" type="password" name="password" autocomplete="current-password" required autofocus>
      <button class="button button--full" type="submit">Anmelden ${icon('arrow', 16)}</button>
    </form>
  </div>
</main>
</body>
</html>`

/* ------------------------------------------------------------ Bausteine */

const kpi = (labelText: string, value: string, sub = '', accent = false) =>
  `<div class="kpi${accent ? ' kpi--accent' : ''}"><p>${esc(labelText)}</p><b>${esc(value)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`

const empty = (title: string, text: string) => `<div class="empty">
  <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true"><rect x="10" y="14" width="100" height="58" rx="10" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/><path d="M10 30h100" stroke="currentColor" stroke-width="2" opacity=".35"/><circle cx="60" cy="50" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m66 56 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  <h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
</div>`

const waText = (l: Lead) =>
  `Hallo ${l.vorname}, hier ist Marina. Danke für deine Anfrage (Nr. ${l.nr}) zum kostenlosen Kennenlerngespräch. Wann passt es dir in den nächsten Tagen?`
const waHref = (l: Lead) => `https://wa.me/${phoneDigits(l.telefon)}?text=${encodeURIComponent(waText(l))}`

function leadRows(leads: Lead[]): string {
  return leads
    .map(
      (l) => `<tr data-href="/admin/leads/${esc(l.nr)}">
      <td><a class="lead-name" href="/admin/leads/${esc(l.nr)}"><span class="avatar">${esc(l.vorname.slice(0, 1).toUpperCase())}</span><span><b>${esc(l.vorname)}</b><small>Nr. ${esc(l.nr)}</small></span></a></td>
      <td>${pill(l.status)}</td>
      <td class="nowrap"><a href="${esc(waHref(l))}" target="_blank" rel="noopener" class="tel">${icon('wa', 14)} ${esc(l.telefon)}</a></td>
      <td>${esc(label(SITUATION, l.situation))}</td>
      <td>${esc(label(START, l.start))}</td>
      <td>${esc(label(BUDGET, l.budget))}</td>
      <td>${esc(label(ERREICHBAR, l.erreichbar))}</td>
      <td class="nowrap muted" title="${esc(fmtDateTime(l.created_at))}">${esc(ago(l.created_at))}</td>
    </tr>`,
    )
    .join('')
}

const leadTable = (leads: Lead[]) => `<div class="table-wrap"><table class="table">
  <thead><tr><th>Lead</th><th>Status</th><th>WhatsApp</th><th>Situation</th><th>Anfangen</th><th>Rahmen</th><th>Erreichbar</th><th>Eingang</th></tr></thead>
  <tbody>${leadRows(leads)}</tbody>
</table></div>`

/** Balken je Tag der letzten 30 Tage, serverseitig als SVG. */
function chart(created: number[], now = Date.now()): string {
  const days: { key: string; label: string; n: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const t = now - i * 86400_000
    days.push({ key: dayKey(t), label: fmtDate(t).slice(0, 5), n: 0 })
  }
  const idx = new Map(days.map((d, i) => [d.key, i]))
  for (const t of created) {
    const i = idx.get(dayKey(t))
    if (i !== undefined) days[i].n++
  }
  const max = Math.max(3, ...days.map((d) => d.n))
  const W = 600, H = 150, gap = 4, bw = (W - gap * 29) / 30
  const bars = days
    .map((d, i) => {
      const h = d.n ? Math.max(4, (d.n / max) * (H - 18)) : 2
      const x = i * (bw + gap)
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="${d.n ? 'bar' : 'bar bar--0'}"><title>${esc(d.label)}: ${d.n} ${d.n === 1 ? 'Lead' : 'Leads'}</title></rect>`
    })
    .join('')
  const sum = days.reduce((a, d) => a + d.n, 0)
  return `<div class="card">
  <div class="card__head"><h2>Neue Leads, letzte 30 Tage</h2><span class="muted">${sum} gesamt</span></div>
  <svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Neue Leads je Tag in den letzten 30 Tagen">
    <line x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}" class="axis"/>
    ${bars}
    <text x="0" y="${H + 15}" class="tick">${esc(days[0].label)}</text>
    <text x="${W / 2}" y="${H + 15}" class="tick" text-anchor="middle">${esc(days[15].label)}</text>
    <text x="${W}" y="${H + 15}" class="tick" text-anchor="end">heute</text>
  </svg>
</div>`
}

function breakdown(title: string, rows: { value: string | null; n: number }[], name: (v: string | null) => string): string {
  const total = rows.reduce((a, r) => a + r.n, 0)
  if (!total) return ''
  return `<div class="card">
  <div class="card__head"><h2>${esc(title)}</h2></div>
  <ul class="bars">${rows
    .map((r) => {
      const pct = Math.round((r.n / total) * 100)
      return `<li><span>${esc(name(r.value))}</span><b>${r.n}</b><i style="--w:${pct}%"></i></li>`
    })
    .join('')}</ul>
</div>`
}

/* -------------------------------------------------------------- Übersicht */

export interface OverviewData {
  counts: Record<string, number>
  latest: Lead[]
  byStatus: Record<string, Lead[]>
  created30: number[]
  week: number
  situation: { value: string | null; n: number }[]
  woher: { value: string | null; n: number }[]
  quelle: { value: string | null; n: number }[]
}

export function overviewPage(d: OverviewData, flash = ''): string {
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0)
  const neu = d.counts.neu ?? 0
  const termin = (d.counts.termin ?? 0) + (d.counts.klient ?? 0)
  const klient = d.counts.klient ?? 0
  const rate = total ? Math.round((klient / total) * 100) : 0

  const board = STATUS.map((s) => {
    const list = d.byStatus[s.value] ?? []
    const n = d.counts[s.value] ?? 0
    return `<section class="col">
      <header><i class="dot dot--${s.value}"></i><h3>${esc(s.label)}</h3><b>${n}</b></header>
      ${
        list.length
          ? list
              .map(
                (l) => `<a class="mini" href="/admin/leads/${esc(l.nr)}"><b>${esc(l.vorname)}</b><span>${esc(label(SITUATION, l.situation))}</span><small>${esc(ago(l.created_at))} · ${esc(label(ERREICHBAR, l.erreichbar))}</small></a>`,
              )
              .join('')
          : '<p class="col__empty">Keine</p>'
      }
      ${n > list.length ? `<a class="col__more" href="/admin/leads?status=${s.value}">Alle ${n} anzeigen</a>` : ''}
    </section>`
  }).join('')

  const body = `
    <section class="hero">
      <div class="hero__tile hero__tile--main">
        <p class="eyebrow">Lead-CRM</p>
        <h1>${neu ? `${neu} ${neu === 1 ? 'neue Anfrage wartet' : 'neue Anfragen warten'} auf dich` : 'Alle Anfragen sind bearbeitet'}</h1>
        <p class="muted">Jede Anfrage aus dem Formular auf der Terminseite landet hier: mit den 4 Antworten, der Wunschzeit und der WhatsApp-Nummer.</p>
        <div class="hero__actions">
          <a class="button" href="/admin/leads?status=neu">Neue Leads öffnen ${icon('arrow', 16)}</a>
          <a class="button button--ghost" href="/admin/leads">Alle Leads</a>
        </div>
      </div>
      <a class="hero__tile hero__tile--side" href="/terminbuchung/" target="_blank" rel="noopener">
        ${icon('globe', 28)}
        <b>Formular ansehen</b>
        <span class="muted">So sehen Interessenten den Stepper auf /terminbuchung/.</span>
      </a>
    </section>

    <section class="kpis">
      ${kpi('Leads gesamt', String(total), `${d.week} in den letzten 7 Tagen`)}
      ${kpi('Neu', String(neu), 'noch nicht kontaktiert', neu > 0)}
      ${kpi('Termin vereinbart', String(termin), 'inklusive Klienten')}
      ${kpi('Klienten', String(klient), `${rate} % aller Leads`)}
    </section>

    <div class="card card--flush">
      <div class="card__head card__head--pad"><h2>Pipeline</h2><a href="/admin/leads" class="link">Alle Leads ${icon('arrow', 14)}</a></div>
      <div class="board">${board}</div>
    </div>

    <div class="grid2">
      ${chart(d.created30)}
      ${breakdown('Situation', d.situation, (v) => label(SITUATION, v))}
      ${breakdown('Aufmerksam geworden durch', d.woher, (v) => (v ? label(WOHER, v) : 'Keine Angabe'))}
      ${breakdown('Video-Kennung (?q=)', d.quelle, (v) => v ?? 'Ohne Kennung')}
    </div>

    <div class="card card--flush">
      <div class="card__head card__head--pad"><h2>Neueste Leads</h2><a href="/admin/export.csv" class="link">${icon('download', 14)} CSV</a></div>
      ${d.latest.length ? leadTable(d.latest) : empty('Noch keine Anfragen', 'Sobald jemand das Formular auf /terminbuchung/ abschickt, steht die Anfrage hier.')}
    </div>`

  return shell({ title: 'Übersicht', crumb: 'Übersicht', active: 'uebersicht', counts: d.counts, flash, body })
}

/* ------------------------------------------------------------------ Liste */

export function leadsPage(leads: Lead[], counts: Record<string, number>, filter: { status?: Status; q?: string }): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const chip = (href: string, text: string, n: number, on: boolean) =>
    `<a class="chip${on ? ' is-on' : ''}" href="${href}">${esc(text)} <b>${n}</b></a>`
  const qs = filter.q ? `&q=${encodeURIComponent(filter.q)}` : ''
  const title = filter.status ? statusLabel(filter.status) : 'Alle Leads'
  const body = `
    <div class="page-head">
      <div><p class="eyebrow">Leads</p><h1>${esc(title)}</h1>${filter.q ? `<p class="muted">Suche nach „${esc(filter.q)}“: ${leads.length} ${leads.length === 1 ? 'Treffer' : 'Treffer'}</p>` : ''}</div>
      <a class="button button--ghost" href="/admin/export.csv">${icon('download', 16)} Export</a>
    </div>
    <nav class="chips" aria-label="Nach Status filtern">
      ${chip(`/admin/leads?${qs.slice(1)}`, 'Alle', total, !filter.status)}
      ${STATUS.map((s) => chip(`/admin/leads?status=${s.value}${qs}`, s.label, counts[s.value] ?? 0, filter.status === s.value)).join('')}
    </nav>
    <div class="card card--flush">
      ${leads.length ? leadTable(leads) : empty(filter.q ? 'Nichts gefunden' : 'Keine Leads in diesem Status', filter.q ? 'Probier einen anderen Namen, die Anfrage-Nr. oder die Ziffern der Telefonnummer.' : 'Sobald ein Lead diesen Status bekommt, steht er hier.')}
    </div>`
  return shell({ title, crumb: title, active: 'leads', counts, status: filter.status, q: filter.q, body })
}

/* ------------------------------------------------------------------ Detail */

const EVENT_LABEL: Record<string, string> = { angelegt: 'Anfrage eingegangen', status: 'Status geändert', notiz: 'Notiz', erneut: 'Erneut abgeschickt' }

export function leadPage(l: Lead, events: LeadEvent[], counts: Record<string, number>, flash = ''): string {
  const fact = (k: string, v: string) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
  const body = `
    <a class="back" href="/admin/leads">‹ Alle Leads</a>
    <section class="lead-head">
      <span class="avatar avatar--big">${esc(l.vorname.slice(0, 1).toUpperCase())}</span>
      <div class="lead-head__text">
        <p class="eyebrow">Anfrage Nr. ${esc(l.nr)}</p>
        <h1>${esc(l.vorname)} ${pill(l.status)}</h1>
        <p class="muted">Eingegangen ${esc(fmtDateTime(l.created_at))} (${esc(ago(l.created_at))})</p>
      </div>
      <div class="lead-head__actions">
        <a class="button" href="${esc(waHref(l))}" target="_blank" rel="noopener">${icon('wa', 16)} WhatsApp</a>
        <a class="button button--ghost" href="tel:+${esc(phoneDigits(l.telefon))}">${icon('phone', 16)} Anrufen</a>
        ${l.email ? `<a class="button button--ghost" href="mailto:${esc(l.email)}?subject=${encodeURIComponent('Dein Kennenlerngespräch (Nr. ' + l.nr + ')')}">${icon('mail', 16)} E-Mail</a>` : ''}
      </div>
    </section>

    <div class="detail">
      <div class="detail__main">
        <div class="card">
          <div class="card__head"><h2>Status</h2></div>
          <form method="post" action="/admin/leads/${esc(l.nr)}/status" class="status-pick">
            ${STATUS.map(
              (s) => `<label class="status-pick__opt"><input type="radio" name="status" value="${s.value}"${s.value === l.status ? ' checked' : ''}><span><i class="dot dot--${s.value}"></i>${esc(s.label)}</span></label>`,
            ).join('')}
            <button class="button button--sm" type="submit">Speichern</button>
          </form>
        </div>

        <div class="card">
          <div class="card__head"><h2>Antworten im Formular</h2></div>
          <dl class="facts">
            ${fact('Akute Krise', label(KRISE, 'nein'))}
            ${fact('Situation', label(SITUATION, l.situation))}
            ${fact('Anfangen', label(START, l.start))}
            ${fact('Finanzieller Rahmen', label(BUDGET, l.budget))}
            ${fact('Am besten erreichbar', label(ERREICHBAR, l.erreichbar) + (l.erreichbar ? ` (${ERREICHBAR.find((e) => e.value === l.erreichbar)?.small ?? ''})` : ''))}
            ${fact('Aufmerksam geworden durch', l.woher ? label(WOHER, l.woher) : 'Keine Angabe')}
            ${fact('Video-Kennung (?q=)', l.quelle ?? 'Ohne Kennung')}
          </dl>
        </div>

        <div class="card">
          <div class="card__head"><h2>Verlauf</h2><span class="muted">${events.length} ${events.length === 1 ? 'Eintrag' : 'Einträge'}</span></div>
          <form method="post" action="/admin/leads/${esc(l.nr)}/notiz" class="note-form">
            <textarea name="text" rows="3" maxlength="4000" placeholder="Notiz zum Gespräch, nächster Schritt …" required></textarea>
            <button class="button button--sm" type="submit">Notiz speichern</button>
          </form>
          <ol class="timeline">${events
            .map(
              (e) => `<li class="timeline__item timeline__item--${esc(e.kind)}">
              <i></i>
              <div><p><b>${esc(EVENT_LABEL[e.kind] ?? e.kind)}</b> <small class="muted">${esc(fmtDateTime(e.at))}</small></p>
              <p class="timeline__text">${esc(e.text).replace(/\n/g, '<br>')}</p></div>
            </li>`,
            )
            .join('')}</ol>
        </div>
      </div>

      <aside class="detail__side">
        <div class="card">
          <div class="card__head"><h2>Kontakt</h2></div>
          <dl class="facts facts--stack">
            ${fact('Vorname', l.vorname)}
            ${fact('WhatsApp / Telefon', l.telefon)}
            ${fact('E-Mail', l.email ?? 'Keine Angabe')}
          </dl>
        </div>
        <div class="card">
          <div class="card__head"><h2>Einwilligung</h2></div>
          <p class="muted small">Ausdrücklich eingewilligt am ${esc(fmtDateTime(l.einwilligung_at))}, Textfassung ${esc(l.einwilligung_version)}.</p>
        </div>
        <div class="card card--danger">
          <div class="card__head"><h2>Löschen</h2></div>
          <p class="muted small">Bei Widerruf oder Löschwunsch: entfernt den Lead mit Verlauf endgültig.</p>
          <form method="post" action="/admin/leads/${esc(l.nr)}/loeschen" data-confirm="Lead Nr. ${esc(l.nr)} (${esc(l.vorname)}) endgültig löschen?">
            <button class="button button--danger button--sm" type="submit">${icon('trash', 15)} Endgültig löschen</button>
          </form>
        </div>
      </aside>
    </div>`
  return shell({ title: `${l.vorname} (Nr. ${l.nr})`, crumb: `${l.vorname} · Nr. ${l.nr}`, active: 'lead', counts, flash, body })
}

/* -------------------------------------------------------------------- CSV */

export function leadsCsv(leads: Lead[]): string {
  const cell = (v: unknown) => {
    let s = String(v ?? '')
    if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d ]+$/.test(s)) s = "'" + s // keine Formeln in Excel (Telefonnummern bleiben)
    return '"' + s.replace(/"/g, '""') + '"'
  }
  const head = ['Nr', 'Eingang', 'Status', 'Vorname', 'Telefon', 'E-Mail', 'Situation', 'Anfangen', 'Rahmen', 'Erreichbar', 'Aufmerksam durch', 'Video-Kennung', 'Einwilligung']
  const rows = leads.map((l) =>
    [
      l.nr, fmtDateTime(l.created_at), statusLabel(l.status), l.vorname, l.telefon, l.email ?? '',
      label(SITUATION, l.situation), label(START, l.start), label(BUDGET, l.budget), label(ERREICHBAR, l.erreichbar),
      l.woher ? label(WOHER, l.woher) : '', l.quelle ?? '', `${fmtDateTime(l.einwilligung_at)} (${l.einwilligung_version})`,
    ].map(cell).join(';'),
  )
  return '﻿' + [head.map(cell).join(';'), ...rows].join('\r\n') + '\r\n'
}
