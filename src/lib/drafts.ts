/**
 * Angefangene Kampagnen-Formulare (Vorgabe des Auftraggebers, November 2026).
 *
 * „Neue Kampagne“ im Kunden-Dashboard (/app/neu) speichert jede gewählte
 * Angabe sofort als Entwurf, auch ohne Absenden. So gehen Laufzeit und
 * gewünschte Reichweite nicht verloren, wenn jemand abspringt:
 *
 *   nach 2 Stunden    Meldung an ADMIN_EMAIL („begonnen, nicht abgeschlossen“)
 *   nach 24 Stunden   freundliche Erinnerung an den Kunden mit Link zurück
 *
 * Beides genau einmal je Entwurf, im Viertelstundentakt (src/index.ts).
 * Wird abgeschickt, gilt der Entwurf als erledigt (submitted_at, project_id).
 * Öffnet der Kunde das Formular wieder, steht der Entwurf schon drin.
 * Im Admin erscheint alles im Verlauf beim Kunden (lib/crm.ts).
 */
import { nowSec, uid } from './db'
import { isValidDuration, isValidViews } from './agency'
import { mailDraftAbandonedAdmin, mailDraftReminderCustomer } from './mail'
import type { Env } from './types'

export const DRAFT_ADMIN_AFTER_SEC = 2 * 3600
export const DRAFT_REMIND_AFTER_SEC = 24 * 3600

export interface Draft {
  id: string
  name: string | null
  durationDays: number | null
  views: number | null
  startedAt: number
  updatedAt: number
}

interface DraftRow {
  id: string
  name: string | null
  duration_days: number | null
  views: number | null
  started_at: number
  updated_at: number
}

const toDraft = (r: DraftRow): Draft => ({
  id: r.id,
  name: r.name,
  durationDays: r.duration_days,
  views: r.views,
  startedAt: r.started_at,
  updatedAt: r.updated_at,
})

/** Der offene (nicht abgeschickte) Entwurf eines Nutzers, der jüngste. */
export async function openDraft(env: Env, userId: string): Promise<Draft | null> {
  const r = (await env.DB.prepare(
    'SELECT id, name, duration_days, views, started_at, updated_at FROM campaign_drafts WHERE user_id = ? AND submitted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(userId)
    .first()) as DraftRow | null
  return r ? toDraft(r) : null
}

/** Ungültige Werte werden verworfen statt abgelehnt: ein Entwurf darf unvollständig sein. */
export function cleanDraft(body: Record<string, unknown>): { name: string | null; durationDays: number | null; views: number | null } {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null
  const d = Number(body.durationDays)
  const v = Number(body.views)
  return { name, durationDays: isValidDuration(d) ? d : null, views: isValidViews(v) ? v : null }
}

/** Speichert den Entwurf (legt ihn beim ersten Mal an). Ganz leer: nichts. */
export async function saveDraft(env: Env, userId: string, customerId: string, body: Record<string, unknown>, ts = nowSec()) {
  const d = cleanDraft(body)
  if (!d.name && !d.durationDays && !d.views) return null
  const open = await openDraft(env, userId)
  if (open) {
    await env.DB.prepare('UPDATE campaign_drafts SET name = ?, duration_days = ?, views = ?, updated_at = ? WHERE id = ?')
      .bind(d.name, d.durationDays, d.views, ts, open.id)
      .run()
    return open.id
  }
  const id = uid()
  await env.DB.prepare(
    'INSERT INTO campaign_drafts (id, user_id, customer_id, name, duration_days, views, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, userId, customerId, d.name, d.durationDays, d.views, ts, ts)
    .run()
  return id
}

/** Abgeschickt: der offene Entwurf gehört jetzt zu dieser Kampagne. */
export async function submitDraft(env: Env, userId: string, projectId: string, ts = nowSec()) {
  await env.DB.prepare('UPDATE campaign_drafts SET submitted_at = ?, project_id = ?, updated_at = ? WHERE user_id = ? AND submitted_at IS NULL')
    .bind(ts, projectId, ts, userId)
    .run()
}

interface DueRow extends DraftRow {
  customer_id: string | null
  full_name: string
  email: string
  phone: string | null
  company: string | null
  demo: number
}

const DUE_SQL = `SELECT d.id, d.name, d.duration_days, d.views, d.started_at, d.updated_at, d.customer_id,
                        u.full_name, u.email, u.phone, u.demo, c.company
                   FROM campaign_drafts d
                   JOIN users u ON u.id = d.user_id
                   LEFT JOIN customers c ON c.id = d.customer_id
                  WHERE d.submitted_at IS NULL AND d.updated_at <= ? AND d.%COL% IS NULL
                  ORDER BY d.updated_at LIMIT 20`

const fmtDuration = (d: number | null) => (d ? `${d} Tage` : 'noch nicht gewählt')
const fmtViews = (v: number | null) => (v ? `${v.toLocaleString('de-DE')} Views` : 'noch nicht gewählt')

/**
 * Im Viertelstundentakt: fällige Meldungen an den Admin und Erinnerungen an
 * Kunden verschicken, je Entwurf genau einmal. Demo-Konten bekommen keine Mail
 * (send() filtert ihre Adressen), werden aber trotzdem abgehakt.
 */
export async function processDrafts(env: Env, ts = nowSec()): Promise<{ admin: number; reminded: number }> {
  let admin = 0
  let reminded = 0
  const adminDue = ((await env.DB.prepare(DUE_SQL.replace('%COL%', 'admin_notified_at')).bind(ts - DRAFT_ADMIN_AFTER_SEC).all()).results ??
    []) as unknown as DueRow[]
  for (const r of adminDue) {
    if (!r.demo) {
      await mailDraftAbandonedAdmin(env, {
        customerId: r.customer_id,
        campaign: r.name || '(noch ohne Namen)',
        fullName: r.full_name,
        company: r.company,
        email: r.email,
        phone: r.phone,
        duration: fmtDuration(r.duration_days),
        views: fmtViews(r.views),
        startedAt: r.started_at,
      }).catch(() => false)
    }
    await env.DB.prepare('UPDATE campaign_drafts SET admin_notified_at = ? WHERE id = ?').bind(ts, r.id).run()
    admin++
  }
  const remindDue = ((await env.DB.prepare(DUE_SQL.replace('%COL%', 'reminded_at')).bind(ts - DRAFT_REMIND_AFTER_SEC).all()).results ??
    []) as unknown as DueRow[]
  for (const r of remindDue) {
    if (!r.demo) {
      await mailDraftReminderCustomer(env, {
        to: r.email,
        firstName: r.full_name.split(' ')[0] || r.full_name,
        campaign: r.name,
        duration: r.duration_days ? `${r.duration_days} Tage` : null,
        views: r.views ? `${r.views.toLocaleString('de-DE')} Views` : null,
      }).catch(() => false)
    }
    await env.DB.prepare('UPDATE campaign_drafts SET reminded_at = ? WHERE id = ?').bind(ts, r.id).run()
    reminded++
  }
  return { admin, reminded }
}
