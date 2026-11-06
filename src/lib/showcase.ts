/**
 * Use Cases im Dashboard der Demo-Agentur (Vorgabe des Auftraggebers, November 2026).
 *
 * Die Accounts der Case Studies auf der Startseite (DinDrop, Caspian Blue,
 * Max Tornow, Levantine Istanbul, Panperium) sind über Zernio angebunden und
 * hängen an echten Kampagnen. Die Demo-Agentur (`users.demo = 1`, Rolle
 * `agency`) sieht genau diese Kampagnen als Kampagnen in ihrem Dashboard:
 * in den Listen, in der Views-Grafik, bei „Virale Clips“ und auf der
 * Kampagnenseite, nur zum Ansehen. Die Zahlen sind die echten aus dem
 * Viertelstunden-Abgleich (lib/metrics.ts) und laufen von selbst weiter.
 *
 * Gefunden werden die Kampagnen über die Accountnamen der veröffentlichten
 * Posts (`post_metrics.username`), nicht über Kampagnen-IDs: Wie sie im Admin
 * heißen, spielt keine Rolle. Angezeigt wird immer der Markenname von der
 * Startseite, nie der interne Kampagnenname (der kann einen Kundennamen tragen).
 *
 * Nie zu sehen: Rohmaterial, Cloud-Links, Briefing, Kontaktdaten der Kunden.
 * Echte Agenturen sehen davon nichts.
 */

import type { Env } from './types'

/** Account (wie bei Instagram, klein geschrieben) → Name auf der Startseite. */
export const SHOWCASE_ACCOUNTS: Record<string, string> = {
  dindrop7: 'DinDrop',
  caspianbluecaviar: 'Caspian Blue',
  max_tornow_business: 'Max Tornow',
  levantine_istanbul: 'Levantine Istanbul',
  panperium: 'Panperium',
}

/** Nur die Demo-Agentur bekommt die Use Cases. */
export const showsShowcase = (user: { role: string; demo?: number | null }) => user.role === 'agency' && user.demo === 1

/**
 * Kampagne → angezeigter Name, für alle Kampagnen mit Posts der Use-Case-Accounts.
 * Mehrere Kampagnen derselben Marke heißen „DinDrop“, „DinDrop 2“ und so weiter.
 */
export async function showcaseCampaigns(env: Env): Promise<Map<string, string>> {
  const handles = Object.keys(SHOWCASE_ACCOUNTS)
  const { results } = await env.DB.prepare(
    `SELECT project_id, LOWER(TRIM(username, '@ ')) AS handle, COUNT(*) AS n
     FROM post_metrics
     WHERE LOWER(TRIM(username, '@ ')) IN (${handles.map(() => '?').join(',')})
     GROUP BY project_id, handle
     ORDER BY project_id`,
  )
    .bind(...handles)
    .all()

  // Je Kampagne die Marke mit den meisten Posts.
  const best = new Map<string, { handle: string; n: number }>()
  for (const r of (results ?? []) as { project_id: string; handle: string; n: number }[]) {
    const cur = best.get(r.project_id)
    if (!cur || Number(r.n) > cur.n) best.set(r.project_id, { handle: r.handle, n: Number(r.n) })
  }

  const used = new Map<string, number>()
  const out = new Map<string, string>()
  for (const [projectId, { handle }] of best) {
    const base = SHOWCASE_ACCOUNTS[handle] ?? handle
    const k = (used.get(base) ?? 0) + 1
    used.set(base, k)
    out.set(projectId, k === 1 ? base : `${base} ${k}`)
  }
  return out
}

/** Wie `showcaseCampaigns`, aber leer für alle außer der Demo-Agentur — und nie ein Fehler. */
export async function showcaseFor(env: Env, user: { role: string; demo?: number | null }): Promise<Map<string, string>> {
  if (!showsShowcase(user)) return new Map()
  return showcaseCampaigns(env).catch(() => new Map())
}
