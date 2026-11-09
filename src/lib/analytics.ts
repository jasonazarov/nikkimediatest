import type { User } from '../db/schema'
import { postScopeFor } from './viral'
import type { Env } from './types'
import { SHOWCASE_LIVE, showcaseClips, showcaseDailyRows, showcaseViewsRows, showsShowcase } from './showcase'

/**
 * Views-Analyse für die Grafik oben in jeder Übersicht und auf
 * /admin/analytics (assets/views.js → GET /api/views-analytics).
 *
 * Nur lesend: Grundlage sind dieselben Zahlen wie überall (`post_metrics`,
 * Views wie `viewsOf` in metrics.ts) und das Veröffentlichungsdatum aus
 * `metrics_sync`, dazu die extern geposteten Videos der Kampagnen-Accounts
 * (`external_posts`, mit ihrem eigenen Veröffentlichungstag). Die Kurve zeigt deshalb, wie
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

  // Eine Liste aller Posts im Bereich: über uns veröffentlichte (`post_metrics`)
  // und extern gepostete Videos der Kampagnen-Accounts (`external_posts`, je
  // Video ein Clip). Fehlt die Tabelle noch (Migration 0029), ohne sie.
  const own = `SELECT pm.project_id AS project_id, pm.deliverable_id AS clip, pm.platform AS platform, ${VIEWS} AS v,
         pm.likes AS likes, pm.comments AS comments, pm.shares AS shares, pm.synced_at AS synced_at,
         COALESCE(ms.published_at, pm.synced_at) AS at
       FROM post_metrics pm
       JOIN deliverables d ON d.id = pm.deliverable_id
       JOIN projects p ON p.id = pm.project_id
       LEFT JOIN metrics_sync ms ON ms.post_id = pm.post_id
       WHERE ${scope.where}`
  const ext = `SELECT ep.project_id, 'x:' || ep.post_id || ':' || ep.account_id, ep.platform,
         (CASE WHEN ep.views > 0 THEN ep.views ELSE ep.impressions END), ep.likes, ep.comments, ep.shares,
         ep.synced_at, ep.published_at
       FROM external_posts ep
       JOIN projects p ON p.id = ep.project_id
       WHERE ${scope.projectWhere}`

  const read = (withExternal: boolean) => {
    const cte = `WITH posts AS (${withExternal ? `${own} UNION ALL ${ext}` : own})`
    const b = withExternal ? [...scope.binds, ...scope.projectBinds] : scope.binds
    return Promise.all([
      env.DB.prepare(
        `${cte} SELECT COALESCE(SUM(v),0) AS views, COALESCE(SUM(likes),0) AS likes, COALESCE(SUM(comments),0) AS comments,
                COALESCE(SUM(shares),0) AS shares, COUNT(*) AS posts, COUNT(DISTINCT clip) AS clips,
                COUNT(DISTINCT project_id) AS campaigns, MAX(synced_at) AS synced_at FROM posts`,
      ).bind(...b).first() as Promise<Record<string, number | null> | null>,
      // Veröffentlicht laut Zeitplan; fehlt der Eintrag, gilt der erste Stand der Zahlen.
      env.DB.prepare(`${cte} SELECT at, v FROM posts`).bind(...b).all(),
      env.DB.prepare(
        `${cte} SELECT p.id AS id, p.name AS name, SUM(posts.v) AS views, COUNT(*) AS posts, COUNT(DISTINCT posts.clip) AS clips
         FROM posts JOIN projects p ON p.id = posts.project_id
         GROUP BY p.id HAVING SUM(posts.v) > 0 ORDER BY views DESC LIMIT 12`,
      ).bind(...b).all(),
      env.DB.prepare(
        `${cte} SELECT platform, SUM(v) AS views FROM posts GROUP BY platform HAVING SUM(v) > 0 ORDER BY views DESC`,
      ).bind(...b).all(),
    ])
  }

  let rows: Awaited<ReturnType<typeof read>>
  if (scope.projectWhere) {
    try {
      rows = await read(true)
    } catch (err) {
      console.error('[analytics] Externe Posts nicht gelesen', err)
      rows = await read(false)
    }
  } else {
    rows = await read(false)
  }
  const [totals, byDay, byCampaign, byPlatform] = rows

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
