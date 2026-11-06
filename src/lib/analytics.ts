import type { User } from '../db/schema'
import { postScopeFor } from './viral'
import type { Env } from './types'
import { SHOWCASE_LIVE, showcaseClips, showcaseDailyRows, showcaseViewsRows, showsShowcase } from './showcase'

/**
 * Views-Analyse für die Grafik oben in jeder Übersicht und auf
 * /admin/analytics (assets/views.js → GET /api/views-analytics).
 *
 * Nur lesend, ohne neue Tabelle: Grundlage sind dieselben Zahlen wie überall
 * (`post_metrics`, Views wie `viewsOf` in metrics.ts) und das
 * Veröffentlichungsdatum aus `metrics_sync`. Die Kurve zeigt deshalb, wie
 * viele Views die Clips gesammelt haben, aufsummiert nach dem Tag ihrer
 * Veröffentlichung. Sie wächst an Tagen, an denen Clips rausgingen, die
 * heute viele Views haben. Ein Verlauf „Stand je Tag“ bräuchte tägliche
 * Schnappschüsse und damit eine Migration; das ist bewusst nicht Teil dieser
 * rein optischen Stufe.
 *
 * Wer was sieht, folgt `postScopeFor` (lib/viral.ts), also denselben Regeln
 * wie „Virale Clips“.
 */

export interface AnalyticsCampaign {
  id: string
  name: string
  views: number
  posts: number
  clips: number
}

export interface ViewsAnalytics {
  total: number
  likes: number
  comments: number
  shares: number
  posts: number
  clips: number
  campaigns: number
  /** Jüngster Stand der Zahlen (Unix-Sekunden). */
  syncedAt: number | null
  /** Ein Punkt je Tag (UTC, JJJJ-MM-TT), Views aufsummiert bis einschließlich dieses Tages. */
  series: { day: string; views: number }[]
  /** Kampagnen nach Views, höchstens 12. */
  top: AnalyticsCampaign[]
  /** Views je Plattform, absteigend. */
  platforms: { platform: string; views: number }[]
  /** Nur Demo-Agentur: Live-Zähler und Reiter „Live“ (lib/showcase.ts, assets/views.js). */
  live?: { minPerMinute: number; maxPerMinute: number }
}

const VIEWS = `(case when pm.views > 0 then pm.views else pm.impressions end)`
const DAY = 86400
/** Längster Zeitraum der Kurve. Ältere Views stecken im ersten Punkt. */
const MAX_DAYS = 365

const empty = (): ViewsAnalytics => ({
  total: 0, likes: 0, comments: 0, shares: 0, posts: 0, clips: 0, campaigns: 0,
  syncedAt: null, series: [], top: [], platforms: [],
})

const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10)

export async function viewsAnalyticsFor(env: Env, user: User, now = Math.floor(Date.now() / 1000)): Promise<ViewsAnalytics> {
  // Demo-Agentur: die Use Cases von der Startseite zählen mit (lib/showcase.ts).
  const extra = showsShowcase(user) ? showcaseViewsRows() : []
  const scope = await postScopeFor(env, user)
  if (!scope && !extra.length) return empty()
  if (!scope) return build(empty(), [], [], [], extra, now)

  const from = `FROM post_metrics pm
      JOIN deliverables d ON d.id = pm.deliverable_id
      JOIN projects p ON p.id = pm.project_id
      WHERE ${scope.where}`
  const b = scope.binds

  const [totals, byDay, byCampaign, byPlatform] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(${VIEWS}),0) AS views, COALESCE(SUM(pm.likes),0) AS likes, COALESCE(SUM(pm.comments),0) AS comments,
              COALESCE(SUM(pm.shares),0) AS shares, COUNT(*) AS posts, COUNT(DISTINCT pm.deliverable_id) AS clips,
              COUNT(DISTINCT pm.project_id) AS campaigns, MAX(pm.synced_at) AS synced_at ${from}`,
    ).bind(...b).first() as Promise<Record<string, number | null> | null>,
    // Veröffentlicht laut Zeitplan; fehlt der Eintrag, gilt der erste Stand der Zahlen.
    env.DB.prepare(
      `SELECT COALESCE(ms.published_at, pm.synced_at) AS at, ${VIEWS} AS v
       FROM post_metrics pm
       JOIN deliverables d ON d.id = pm.deliverable_id
       JOIN projects p ON p.id = pm.project_id
       LEFT JOIN metrics_sync ms ON ms.post_id = pm.post_id
       WHERE ${scope.where}`,
    ).bind(...b).all(),
    env.DB.prepare(
      `SELECT p.id AS id, p.name AS name, SUM(${VIEWS}) AS views, COUNT(*) AS posts, COUNT(DISTINCT pm.deliverable_id) AS clips
       ${from} GROUP BY p.id HAVING SUM(${VIEWS}) > 0 ORDER BY views DESC LIMIT 12`,
    ).bind(...b).all(),
    env.DB.prepare(
      `SELECT pm.platform AS platform, SUM(${VIEWS}) AS views ${from} GROUP BY pm.platform HAVING SUM(${VIEWS}) > 0 ORDER BY views DESC`,
    ).bind(...b).all(),
  ])

  const out = empty()
  if (totals) {
    out.total = Number(totals.views) || 0
    out.likes = Number(totals.likes) || 0
    out.comments = Number(totals.comments) || 0
    out.shares = Number(totals.shares) || 0
    out.posts = Number(totals.posts) || 0
    out.clips = Number(totals.clips) || 0
    out.campaigns = Number(totals.campaigns) || 0
    out.syncedAt = totals.synced_at ? Number(totals.synced_at) : null
  }
  return build(
    out,
    (byDay.results ?? []) as { at: number; v: number }[],
    ((byCampaign.results ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      views: Number(r.views) || 0,
      posts: Number(r.posts) || 0,
      clips: Number(r.clips) || 0,
    })),
    ((byPlatform.results ?? []) as Record<string, unknown>[]).map((r) => ({
      platform: String(r.platform ?? ''),
      views: Number(r.views) || 0,
    })),
    extra,
    now,
  )
}

/**
 * Kurve, Kampagnen und Plattformen aus den Zahlen der Datenbank, dazu die
 * Use Cases der Demo-Agentur (`extra`, lib/showcase.ts), wie echte Clips gezählt.
 */
function build(
  out: ViewsAnalytics,
  dayRows: { at: number; v: number }[],
  top: AnalyticsCampaign[],
  platforms: { platform: string; views: number }[],
  extra: ReturnType<typeof showcaseViewsRows>,
  now: number,
): ViewsAnalytics {
  if (extra.length) {
    // Reels je Use Case (auch die ohne bekannte Zahl) für Clips und Posts.
    const reels = new Map<string, number>()
    for (const c of showcaseClips()) reels.set(c.campaignId, (reels.get(c.campaignId) ?? 0) + 1)
    const camps = new Map<string, AnalyticsCampaign>()
    let views = 0
    for (const r of extra) {
      views += r.views
      const n = reels.get(r.campaignId) ?? 0
      const k = camps.get(r.campaignId) ?? { id: r.campaignId, name: r.campaign, views: 0, posts: n, clips: n }
      k.views += r.views
      camps.set(r.campaignId, k)
    }
    const nReels = [...camps.values()].reduce((s, k) => s + k.clips, 0)
    // Kurve: der freigegebene gleichmäßige Tagesverlauf statt einzelner Reel-Tage (lib/showcase.ts).
    dayRows.push(...showcaseDailyRows(now, MAX_DAYS))
    out.live = { ...SHOWCASE_LIVE }
    out.total += views
    out.posts += nReels
    out.clips += nReels
    out.campaigns += camps.size
    out.syncedAt = out.syncedAt ?? now
    top = [...top, ...camps.values()].sort((a, b) => b.views - a.views).slice(0, 12)
    const ig = platforms.find((p) => p.platform === 'instagram')
    if (ig) ig.views += views
    else platforms.push({ platform: 'instagram', views })
    platforms.sort((a, b) => b.views - a.views)
  }

  // Tagessummen, dann aufsummiert über jeden Tag bis heute (auch Tage ohne Clips).
  const perDay = new Map<string, number>()
  const firstAllowed = now - (MAX_DAYS - 1) * DAY
  let first = now
  for (const r of dayRows) {
    const at = Math.max(Number(r.at) || now, firstAllowed)
    if (at < first) first = at
    const key = isoDay(Math.min(at, now))
    perDay.set(key, (perDay.get(key) ?? 0) + (Number(r.v) || 0))
  }
  if (perDay.size) {
    // Mindestens 30 Tage, damit die Kurve nicht aus zwei Punkten besteht.
    const start = Math.min(first, now - 29 * DAY)
    let run = 0
    for (let t = start - (start % DAY); t <= now; t += DAY) {
      const key = isoDay(t)
      run += perDay.get(key) ?? 0
      out.series.push({ day: key, views: run })
    }
  }
  out.top = top
  out.platforms = platforms
  return out
}
