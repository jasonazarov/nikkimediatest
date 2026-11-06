/**
 * CRM-Verlauf je Kunde im Admin (/admin/kunden/:id), Vorgabe des
 * Auftraggebers, November 2026. Liest nur, was ohnehin gespeichert ist:
 *
 *   Lead-Formular (leads)            Eintrag mit Branche und Budget
 *   Kunde bestätigt (customers)      converted_at
 *   Kampagne begonnen (drafts)       nicht abgeschickt, Meldung, Erinnerung
 *   Kampagne angelegt (projects)     mit Laufzeit und Reichweite
 *   Kampagne pushen (upsell_requests) mit Status
 *
 * Jede Quelle für sich: fehlt eine Tabelle (Migration nicht eingespielt),
 * fehlen nur ihre Einträge, nicht der Verlauf.
 */
import type { Env } from './types'

export type CrmKind = 'lead' | 'converted' | 'draft' | 'campaign' | 'push'

export interface CrmEvent {
  at: number
  kind: CrmKind
  title: string
  detail: string
  /** Hervorgehoben: braucht Aufmerksamkeit (z. B. nicht abgeschickt). */
  attention?: boolean
  href?: string
}

const views = (v: number | null | undefined) => (v ? `${v.toLocaleString('en-US')} views` : null)
const days = (d: number | null | undefined) => (d ? `${d} days` : null)
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')
const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

async function rows<T>(env: Env, sql: string, ...bind: unknown[]): Promise<T[]> {
  try {
    return ((await env.DB.prepare(sql).bind(...bind).all()).results ?? []) as T[]
  } catch {
    return []
  }
}

export async function customerTimeline(env: Env, o: { customerId: string; userId: string }): Promise<CrmEvent[]> {
  const [leads, cust, drafts, projects, pushes] = await Promise.all([
    rows<{ created_at: number; industry: string; budget_range: string; status: string }>(
      env,
      'SELECT created_at, industry, budget_range, status FROM leads WHERE customer_id = ?',
      o.customerId,
    ),
    rows<{ created_at: number; converted_at: number | null }>(env, 'SELECT created_at, converted_at FROM customers WHERE id = ?', o.customerId),
    rows<{
      name: string | null
      duration_days: number | null
      views: number | null
      started_at: number
      updated_at: number
      admin_notified_at: number | null
      reminded_at: number | null
    }>(
      env,
      'SELECT name, duration_days, views, started_at, updated_at, admin_notified_at, reminded_at FROM campaign_drafts WHERE customer_id = ? AND submitted_at IS NULL',
      o.customerId,
    ),
    rows<{ id: string; name: string; created_at: number; briefing_views: number | null; briefing_duration_days: number | null}>(
      env,
      'SELECT id, name, created_at, briefing_views, briefing_duration_days FROM projects WHERE customer_id = ?',
      o.customerId,
    ),
    rows<{ project_id: string; name: string; percent: number; extra_views: number; price_cents: number; status: string; created_at: number }>(
      env,
      `SELECT u.project_id, p.name, u.percent, u.extra_views, u.price_cents, u.status, u.created_at
         FROM upsell_requests u JOIN projects p ON p.id = u.project_id WHERE p.customer_id = ?`,
      o.customerId,
    ),
  ])

  const out: CrmEvent[] = []
  for (const l of leads)
    out.push({ at: l.created_at, kind: 'lead', title: 'Lead form submitted', detail: join(l.industry, l.budget_range && `Budget ${l.budget_range}`) })
  const c = cust[0]
  if (c?.converted_at) out.push({ at: c.converted_at, kind: 'converted', title: 'Confirmed as customer', detail: '' })
  for (const d of drafts)
    out.push({
      at: d.updated_at,
      kind: 'draft',
      title: 'Campaign started, not submitted',
      detail: join(
        d.name ? `“${d.name}”` : 'no name yet',
        days(d.duration_days),
        views(d.views),
        d.admin_notified_at ? 'you were notified' : null,
        d.reminded_at ? 'reminder sent to customer' : null,
      ),
      attention: true,
    })
  for (const p of projects)
    out.push({
      at: p.created_at,
      kind: 'campaign',
      title: `Campaign created: ${p.name}`,
      detail: join(days(p.briefing_duration_days), views(p.briefing_views)),
      href: `/admin/projekte/${p.id}`,
    })
  for (const u of pushes)
    out.push({
      at: u.created_at,
      kind: 'push',
      title: `Push requested: +${u.percent} % on ${u.name}`,
      detail: join(`+${u.extra_views.toLocaleString('en-US')} views`, eur(u.price_cents), u.status === 'offen' ? 'open' : u.status === 'bestätigt' ? 'confirmed' : 'declined'),
      attention: u.status === 'offen',
      href: `/admin/upsells`,
    })
  return out.sort((a, b) => b.at - a.at)
}
