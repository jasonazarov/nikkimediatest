import type { User } from '../db/schema'
import { nowSec, uid } from './db'
import type { Env } from './types'

/**
 * Upsells „Mehr Reichweite“ und die Marge der Agenturen (Migration 0023).
 *
 * Upsell: Auf der Übersicht von Kunde (erst nach `converted_at`, also nicht
 * für bloße Leads) und Agentur (nur freigeschaltet) steht je laufender
 * Kampagne das Angebot +10 %, +25 % oder +50 % Views. Ein Klick ist eine
 * ANFRAGE, kein Auftrag: Sie landet unter /admin/upsells und per Mail bei
 * ADMIN_EMAIL, Jason bestätigt persönlich. Kein Zahlungsweg, kein Eingriff
 * in Kampagne, Team oder Veröffentlichung.
 *
 * Preis je 1.000 Views: der Preis aus dem Briefing der Kampagne (Agenturen,
 * Budget ÷ Views), sonst der Richtwert 5 € (`PRICE_PER_THOUSAND_CENTS`).
 * Basis: die Views aus dem Briefing, sonst die bisher erreichten Views,
 * sonst 1 Mio. — so hat jede Kampagne ein Angebot.
 *
 * Marge: Agenturen setzen in /collaboration/preise einen Aufschlag in
 * Prozent. Er ändert KEINEN Preis, den wir berechnen; er rechnet nur den
 * Kundenpreis aus, den die Agentur ihrem Kunden nennt.
 */

export const UPSELL_PERCENTS = [10, 25, 50] as const
export type UpsellPercent = (typeof UPSELL_PERCENTS)[number]

/** Richtwert: 5.000 € je Mio. Views = 500 Cent je 1.000 Views. */
export const PRICE_PER_THOUSAND_CENTS = 500
export const DEFAULT_BASE_VIEWS = 1_000_000
export const MARGIN_MAX_PCT = 300

export type UpsellArea = 'customer' | 'agency'

export interface UpsellOffer {
  percent: UpsellPercent
  extraViews: number
  priceCents: number
  /** Nur Agenturen: Preis inkl. ihrer Marge. */
  clientPriceCents: number | null
  /** Offene Anfrage für genau dieses Angebot? */
  pending: boolean
}

export interface UpsellCampaign {
  id: string
  name: string
  status: string
  baseViews: number
  baseSource: 'briefing' | 'reached' | 'default'
  perThousandCents: number
  offers: UpsellOffer[]
}

/** Kundenpreis einer Agentur: unser Preis plus ihr Aufschlag, auf volle Cent gerundet. */
export const withMargin = (cents: number, marginPct: number) => Math.round(cents * (1 + marginPct / 100))

/** Preis für eine Anzahl Views zum Preis je 1.000 Views. */
export const priceFor = (views: number, perThousandCents: number) => Math.round((views * perThousandCents) / 1000)

/** Extra-Views auf glatte 1.000 gerundet — „+25 % von 1.234.567“ wird 309.000. */
export const extraViewsFor = (base: number, percent: number) => Math.max(1000, Math.round((base * percent) / 100 / 1000) * 1000)

interface CustomerRow {
  id: string
  margin_pct: number
  converted_at: number | null
}

async function customerOf(env: Env, userId: string): Promise<CustomerRow | null> {
  return (await env.DB.prepare('SELECT id, margin_pct, converted_at FROM customers WHERE user_id = ? LIMIT 1').bind(userId).first()) as CustomerRow | null
}

export async function marginOf(env: Env, user: User): Promise<number> {
  if (user.role !== 'agency') return 0
  const c = await customerOf(env, user.id)
  return c ? Number(c.margin_pct) || 0 : 0
}

/** Speichert den Aufschlag einer Agentur. Ganze Prozent, 0 bis 300. */
export async function setMargin(env: Env, user: User, raw: unknown): Promise<number | { error: string }> {
  if (user.role !== 'agency') return { error: 'Nur Agenturen können eine Marge festlegen.' }
  const pct = Math.round(Number(raw))
  if (!Number.isFinite(pct) || pct < 0 || pct > MARGIN_MAX_PCT) {
    return { error: `Bitte gib eine Marge zwischen 0 und ${MARGIN_MAX_PCT} % ein.` }
  }
  const c = await customerOf(env, user.id)
  if (!c) return { error: 'Für diesen Zugang gibt es noch keinen Arbeitsbereich.' }
  await env.DB.prepare('UPDATE customers SET margin_pct = ? WHERE id = ?').bind(pct, c.id).run()
  return pct
}

interface ProjectRow {
  id: string
  name: string
  status: string
  briefing_views: number | null
  briefing_budget_cents: number | null
  reached: number | null
}

/** Die Angebote je laufender Kampagne des Nutzers (Kunde oder Agentur). Beendete Kampagnen fehlen. */
export async function upsellCampaigns(env: Env, user: User): Promise<{ marginPct: number; campaigns: UpsellCampaign[] }> {
  if (user.role !== 'customer' && user.role !== 'agency') return { marginPct: 0, campaigns: [] }
  const customer = await customerOf(env, user.id)
  if (!customer) return { marginPct: 0, campaigns: [] }
  // Leads ohne Auftrag bekommen kein Upsell — erst, wenn der Admin sie zum Kunden erklärt hat.
  if (user.role === 'customer' && !customer.converted_at) return { marginPct: 0, campaigns: [] }
  const marginPct = user.role === 'agency' ? Number(customer.margin_pct) || 0 : 0

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.status, p.briefing_views, p.briefing_budget_cents,
            (SELECT SUM(CASE WHEN pm.views > 0 THEN pm.views ELSE pm.impressions END)
               FROM post_metrics pm WHERE pm.project_id = p.id) AS reached
       FROM projects p
      WHERE p.customer_id = ? AND p.status <> 'beendet'
      ORDER BY p.created_at DESC
      LIMIT 30`,
  )
    .bind(customer.id)
    .all()
  const rows = (results ?? []) as ProjectRow[]
  if (!rows.length) return { marginPct, campaigns: [] }

  const open = new Set<string>()
  const { results: pend } = await env.DB.prepare(
    `SELECT project_id, percent FROM upsell_requests WHERE user_id = ? AND status = 'offen'`,
  )
    .bind(user.id)
    .all()
  for (const r of (pend ?? []) as { project_id: string; percent: number }[]) open.add(`${r.project_id}:${r.percent}`)

  const campaigns = rows.map((r): UpsellCampaign => {
    const briefViews = Number(r.briefing_views) || 0
    const briefBudget = Number(r.briefing_budget_cents) || 0
    const reached = Number(r.reached) || 0
    const baseSource: UpsellCampaign['baseSource'] = briefViews ? 'briefing' : reached >= 10_000 ? 'reached' : 'default'
    const baseViews = baseSource === 'briefing' ? briefViews : baseSource === 'reached' ? reached : DEFAULT_BASE_VIEWS
    const perThousandCents =
      briefViews && briefBudget ? Math.max(1, Math.round((briefBudget * 1000) / briefViews)) : PRICE_PER_THOUSAND_CENTS
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      baseViews,
      baseSource,
      perThousandCents,
      offers: UPSELL_PERCENTS.map((percent) => {
        const extraViews = extraViewsFor(baseViews, percent)
        const priceCents = priceFor(extraViews, perThousandCents)
        return {
          percent,
          extraViews,
          priceCents,
          clientPriceCents: user.role === 'agency' ? withMargin(priceCents, marginPct) : null,
          pending: open.has(`${r.id}:${percent}`),
        }
      }),
    }
  })
  return { marginPct, campaigns }
}

export interface CreatedUpsell {
  id: string
  campaign: UpsellCampaign
  offer: UpsellOffer
}

/**
 * Legt eine Anfrage an. Prüft, dass die Kampagne dem Nutzer gehört und
 * läuft, und dass dasselbe Angebot nicht schon offen ist (Doppelklick,
 * zweiter Tab). Preise werden HIER neu gerechnet, nie aus dem Browser übernommen.
 */
export async function createUpsell(
  env: Env,
  user: User,
  projectId: unknown,
  percentRaw: unknown,
): Promise<CreatedUpsell | { error: string; status: number }> {
  const percent = Number(percentRaw) as UpsellPercent
  if (!UPSELL_PERCENTS.includes(percent)) return { error: 'Bitte wähle +10 %, +25 % oder +50 %.', status: 400 }
  if (typeof projectId !== 'string' || !projectId) return { error: 'Bitte wähle eine Kampagne.', status: 400 }

  const { campaigns, marginPct } = await upsellCampaigns(env, user)
  const campaign = campaigns.find((c) => c.id === projectId)
  if (!campaign) return { error: 'Diese Kampagne gibt es nicht oder sie ist beendet.', status: 404 }
  const offer = campaign.offers.find((o) => o.percent === percent)!
  if (offer.pending) return { error: 'Diese Anfrage liegt schon bei uns. Jason meldet sich bei dir.', status: 409 }

  const id = uid()
  await env.DB.prepare(
    `INSERT INTO upsell_requests (id, project_id, user_id, percent, base_views, extra_views, price_cents, client_price_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?)`,
  )
    .bind(
      id,
      campaign.id,
      user.id,
      percent,
      campaign.baseViews,
      offer.extraViews,
      offer.priceCents,
      user.role === 'agency' ? withMargin(offer.priceCents, marginPct) : null,
      nowSec(),
    )
    .run()
  return { id, campaign, offer: { ...offer, pending: true } }
}

export const UPSELL_STATUS = ['offen', 'bestätigt', 'abgelehnt'] as const
export type UpsellStatus = (typeof UPSELL_STATUS)[number]

export interface UpsellRow {
  id: string
  projectId: string
  projectName: string
  userName: string
  userEmail: string
  role: string
  percent: number
  baseViews: number
  extraViews: number
  priceCents: number
  clientPriceCents: number | null
  status: string
  createdAt: number
  doneAt: number | null
}

/** Alle Anfragen für den Admin, offene zuerst. */
export async function allUpsells(env: Env): Promise<UpsellRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.project_id, p.name AS project_name, us.full_name, us.email, us.role, u.percent, u.base_views,
            u.extra_views, u.price_cents, u.client_price_cents, u.status, u.created_at, u.done_at
       FROM upsell_requests u
       JOIN projects p ON p.id = u.project_id
       JOIN users us ON us.id = u.user_id
      ORDER BY (u.status = 'offen') DESC, u.created_at DESC
      LIMIT 300`,
  ).all()
  return ((results ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: String(r.project_name),
    userName: String(r.full_name),
    userEmail: String(r.email),
    role: String(r.role),
    percent: Number(r.percent),
    baseViews: Number(r.base_views),
    extraViews: Number(r.extra_views),
    priceCents: Number(r.price_cents),
    clientPriceCents: r.client_price_cents == null ? null : Number(r.client_price_cents),
    status: String(r.status),
    createdAt: Number(r.created_at),
    doneAt: r.done_at == null ? null : Number(r.done_at),
  }))
}

export async function setUpsellStatus(env: Env, id: string, status: unknown): Promise<boolean | { error: string }> {
  if (!UPSELL_STATUS.includes(status as UpsellStatus)) return { error: 'Unbekannter Status.' }
  const r = await env.DB.prepare('UPDATE upsell_requests SET status = ?, done_at = ? WHERE id = ?')
    .bind(status, status === 'offen' ? null : nowSec(), id)
    .run()
  return Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0
}
