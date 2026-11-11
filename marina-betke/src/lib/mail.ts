/**
 * Optional: eine Mail an ADMIN_EMAIL bei jeder neuen Anfrage, über Resend
 * (wie bei Nikki Media). Ohne RESEND_API_KEY, ADMIN_EMAIL und MAIL_FROM
 * passiert nichts, und das ist kein Fehler: Die Anfrage steht trotzdem im CRM.
 */
import { BUDGET, ERREICHBAR, SITUATION, START, WOHER, label } from './fragen'
import type { Lead } from './leads'
import { esc, type Env } from './util'

export async function mailNewLead(env: Env, lead: Lead, origin: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL || !env.MAIL_FROM) return
  const link = `${origin}/admin/leads/${lead.nr}`
  const zeilen: [string, string][] = [
    ['Vorname', lead.vorname],
    ['Telefon / WhatsApp', lead.telefon],
    ['E-Mail', lead.email ?? '–'],
    ['Situation', label(SITUATION, lead.situation)],
    ['Anfangen', label(START, lead.start)],
    ['Finanzieller Rahmen', label(BUDGET, lead.budget)],
    ['Erreichbar', label(ERREICHBAR, lead.erreichbar)],
    ['Aufmerksam durch', label(WOHER, lead.woher)],
    ['Video (?q=)', lead.quelle ?? '–'],
  ]
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#142730">
<h2 style="margin:0 0 12px">Neue Anfrage Nr. ${esc(lead.nr)}: ${esc(lead.vorname)}</h2>
<table cellpadding="6" style="border-collapse:collapse">${zeilen
    .map(([k, v]) => `<tr><td style="color:#536067">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
    .join('')}</table>
<p><a href="${esc(link)}" style="color:#965726">Im CRM öffnen</a></p></div>`
  const text = zeilen.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nIm CRM öffnen: ${link}`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.ADMIN_EMAIL],
        subject: `Neue Anfrage Nr. ${lead.nr}: ${lead.vorname}`,
        html,
        text,
      }),
    })
    if (!res.ok) console.error('mail.lead', res.status, (await res.text()).slice(0, 300))
  } catch (err) {
    console.error('mail.lead', String(err))
  }
}
