import type { User } from '../db/schema'
import { r2Ready } from './r2'
import { signThumb } from './thumbs'
import type { Env } from './types'
import { showcaseViral, showsShowcase } from './showcase'

/**
 * „Virale Clips“ — die Clips mit den meisten Views, für das Feld oben in
 * jeder Übersicht (layout.ts → /assets/viral.js → GET /api/viral-clips).
 *
 * Gelesen wird `post_metrics` (dieselben Zahlen wie überall, Views wie
 * `viewsOf` in metrics.ts), dazu die extern geposteten Videos der
 * Kampagnen-Accounts (`external_posts`, je Video ein Clip). Wer was sieht,
 * folgt den Regeln des Projekts:
 *
 *   admin     alle Clips
 *   customer  Clips der eigenen Kampagnen
 *   agency    Clips der eigenen Kampagnen — nie fremde, nie Kundennamen
 *   clipper   Clips, die er selbst geliefert hat — nur Kampagnenname, keine Accounts
 *   creator   eigene Kampagnen, selbst gelieferte Clips und die eigene Verbreitung
 *
 * Accountnamen gibt es nur für Admin, Kunde und Agentur (eigene Kampagnen).
 * Clipper sehen „nur Zahlen, ohne Accountnamen“ (README), Creator ebenso.
 */

export interface ViralClip {
  id: string
  campaign: string
  views: number
  likes: number
  shares: number
  comments: number
  platforms: string[]
  /** Link zum stärksten Post dieses Clips — nur, wo Accountdaten sichtbar sein dürfen. */
  url: string | null
  /** @handle des stärksten Posts — ebenso. */
  handle: string | null
  thumb: string | null
}

const VIEWS = `(case when pm.views > 0 then pm.views else pm.impressions end)`

interface Row {
  id: string
  campaign: string
  project_id: string
  thumbnail_key: string | null
  views: number
  likes: number
  shares: number
  comments: number
  platforms: string | null
  url: string | null
  handle: string | null
}

/** Die IDs hinter einem Login — direkt per SQL, damit sich die Abfrage ohne Worker testen lässt. */
const idOf = async (env: Env, table: 'customers' | 'clippers' | 'creators', userId: string) =>
  ((await env.DB.prepare(`SELECT id FROM ${table} WHERE user_id = ? LIMIT 1`).bind(userId).first()) as { id: string } | null)

/**
 * Wessen Posts ein Login sieht — als WHERE-Teil über `post_metrics pm`,
 * `deliverables d` und `projects p`. Dieselbe Eingrenzung nutzen „Virale
 * Clips“ und die Views-Analyse (lib/analytics.ts). `null` heißt: nichts.
 */
export interface PostScope {
  where: string
  binds: unknown[]
  /** Accountnamen und Links dürfen gezeigt werden (Admin, Kunde, Agentur). */
  showAccounts: boolean
  /** Eingrenzung allein über Kampagnen (Admin, Kunde, Agentur) — dann taugen Tagesstände je Kampagne. */
  projectScoped: boolean
  /**
   * Dieselbe Eingrenzung NUR über `projects p`, für extern gepostete Videos
   * (`external_posts`), die keinen Clip und keinen Clipper haben. Sie gehören
   * zu den Kampagnen des Besitzers: Admin alle, Kunde und Agentur ihre, Creator
   * ihre eigenen. Clipper sehen sie nicht. `null` heißt: keine.
   */
  projectWhere: string | null
  projectBinds: unknown[]
}

export async function postScopeFor(env: Env, user: User): Promise<PostScope | null> {
  switch (user.role) {
    case 'admin':
      return { where: '1 = 1', binds: [], showAccounts: true, projectScoped: true, projectWhere: '1 = 1', projectBinds: [] }
    case 'customer':
    case 'agency': {
      const customer = await idOf(env, 'customers', user.id)
      if (!customer) return null
      return {
        where: 'p.customer_id = ?',
        binds: [customer.id],
        showAccounts: true,
        projectScoped: true,
        projectWhere: 'p.customer_id = ?',
        projectBinds: [customer.id],
      }
    }
    case 'clipper': {
      const clipper = await idOf(env, 'clippers', user.id)
      if (!clipper) return null
      return { where: 'd.clipper_id = ?', binds: [clipper.id], showAccounts: false, projectScoped: false, projectWhere: null, projectBinds: [] }
    }
    case 'creator': {
      const [customer, clipper, creator] = await Promise.all([
        idOf(env, 'customers', user.id),
        idOf(env, 'clippers', user.id),
        idOf(env, 'creators', user.id),
      ])
      const any: string[] = []
      const binds: unknown[] = []
      if (customer) (any.push('p.customer_id = ?'), binds.push(customer.id))
      if (clipper) (any.push('d.clipper_id = ?'), binds.push(clipper.id))
      if (creator) (any.push('pm.creator_id = ?'), binds.push(creator.id))
      if (!any.length) return null
      return {
        where: `(${any.join(' OR ')})`,
        binds,
        showAccounts: false,
        projectScoped: false,
        projectWhere: customer ? 'p.customer_id = ?' : null,
        projectBinds: customer ? [customer.id] : [],
      }
    }
    default:
      return null
  }
}

export async function viralClipsFor(env: Env, user: User, limit = 8): Promise<ViralClip[]> {
  // Demo-Agentur: die Reels der Use Cases von der Startseite dazu (lib/showcase.ts).
  if (showsShowcase(user)) {
    const own = await realViralClipsFor(env, user, limit)
    return [...own, ...showcaseViral()].sort((a, b) => b.views - a.views).slice(0, Math.max(1, Math.min(24, limit)))
  }
  return realViralClipsFor(env, user, limit)
}

async function realViralClipsFor(env: Env, user: User, limit: number): Promise<ViralClip[]> {
  const scope = await postScopeFor(env, user)
  if (!scope) return []
  const where = [scope.where]
  const binds = scope.binds
  const showAccounts = scope.showAccounts

  // Erst je Clip summieren, dann den stärksten Post dazuholen (für Link und @handle).
  const sql = `
    WITH scoped AS (
      SELECT pm.deliverable_id, pm.platform, pm.url, pm.username,
             ${VIEWS} AS v, pm.likes, pm.shares, pm.comments
      FROM post_metrics pm
      JOIN deliverables d ON d.id = pm.deliverable_id
      JOIN projects p ON p.id = pm.project_id
      WHERE ${where.join(' AND ')}
    ),
    totals AS (
      SELECT deliverable_id, SUM(v) AS views, SUM(likes) AS likes, SUM(shares) AS shares,
             SUM(comments) AS comments, GROUP_CONCAT(DISTINCT platform) AS platforms
      FROM scoped GROUP BY deliverable_id
      HAVING SUM(v) > 0
      ORDER BY views DESC
      LIMIT ${Math.max(1, Math.min(24, limit))}
    )
    SELECT t.deliverable_id AS id, p.name AS campaign, p.id AS project_id, d.thumbnail_key,
           t.views, t.likes, t.shares, t.comments, t.platforms,
           (SELECT s.url FROM scoped s WHERE s.deliverable_id = t.deliverable_id ORDER BY s.v DESC LIMIT 1) AS url,
           (SELECT s.username FROM scoped s WHERE s.deliverable_id = t.deliverable_id ORDER BY s.v DESC LIMIT 1) AS handle
    FROM totals t
    JOIN deliverables d ON d.id = t.deliverable_id
    JOIN projects p ON p.id = d.project_id
    ORDER BY t.views DESC`

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all()
  const rows = (results ?? []) as unknown as Row[]
  const lim = Math.max(1, Math.min(24, limit))
  const external = await externalViral(env, scope, lim)

  const canSign = r2Ready(env)
  const own = await Promise.all(
    rows.map(async (r) => {
      let thumb: string | null = null
      if (r.thumbnail_key && canSign) {
        try {
          thumb = await signThumb(env, r.thumbnail_key)
        } catch {
          thumb = null
        }
      }
      // Ohne eigenes Vorschaubild: das Thumbnail der Kampagne (mit Zugriffsprüfung in routes/media.ts).
      if (!thumb) thumb = `/media/kampagne/${encodeURIComponent(r.project_id)}/thumb`
      return {
        id: r.id,
        campaign: r.campaign,
        views: Number(r.views) || 0,
        likes: Number(r.likes) || 0,
        shares: Number(r.shares) || 0,
        comments: Number(r.comments) || 0,
        platforms: (r.platforms ?? '').split(',').filter(Boolean),
        url: showAccounts ? r.url : null,
        handle: showAccounts ? r.handle : null,
        thumb,
      }
    }),
  )
  if (!external.length) return own
  return [...own, ...external].sort((a, b) => b.views - a.views).slice(0, lim)
}

const EXT_VIEWS = `(CASE WHEN ep.views > 0 THEN ep.views ELSE ep.impressions END)`

/**
 * Extern gepostete Videos als eigene Clips (lib/metrics.ts, „Extern gepostete
 * Videos“). Vorschaubild: das Cover von der Plattform, sonst das der Kampagne.
 * Fehlt die Tabelle noch (Migration 0029), gibt es schlicht keine.
 */
async function externalViral(env: Env, scope: PostScope, limit: number): Promise<ViralClip[]> {
  if (!scope.projectWhere) return []
  try {
    const { results } = await env.DB.prepare(
      `SELECT ep.post_id, ep.account_id, ep.platform, ep.url, ep.username, ep.thumb_url,
              p.id AS project_id, p.name AS campaign, ${EXT_VIEWS} AS views, ep.likes, ep.shares, ep.comments
       FROM external_posts ep JOIN projects p ON p.id = ep.project_id
       WHERE ${scope.projectWhere} AND ${EXT_VIEWS} > 0
       ORDER BY views DESC LIMIT ?`,
    )
      .bind(...scope.projectBinds, limit)
      .all()
    return ((results ?? []) as Record<string, unknown>[]).map((r) => ({
      id: `x:${r.post_id}:${r.account_id}`,
      campaign: String(r.campaign ?? ''),
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0,
      shares: Number(r.shares) || 0,
      comments: Number(r.comments) || 0,
      platforms: r.platform ? [String(r.platform)] : [],
      url: scope.showAccounts && r.url ? String(r.url) : null,
      handle: scope.showAccounts && r.username ? String(r.username) : null,
      thumb: r.thumb_url ? String(r.thumb_url) : `/media/kampagne/${encodeURIComponent(String(r.project_id))}/thumb`,
    }))
  } catch (err) {
    console.error('[viral] Externe Posts nicht gelesen', err)
    return []
  }
}
