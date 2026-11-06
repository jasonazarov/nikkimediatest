import type { AgencyCampaign, AgencyClip } from '../views/collaboration'
import type { ViralClip } from './viral'

/* ==========================================================================
   Use Cases im Dashboard der Demo-Agentur (Vorgabe des Auftraggebers, November 2026)

   Die Case Studies der Startseite (DinDrop, Max Tornow, Caspian Blue,
   Levantine Istanbul, Panperium) erscheinen bei theguardians als Kampagnen:
   in „Neueste Kampagnen“ und „Kampagnen“, in der Views-Grafik, bei
   „Kampagnen nach Views“, „Plattformen“ und „Virale Clips“ und auf einer
   eigenen Kampagnenseite mit den Reels.

   Die Videos liefen NICHT über die Plattform, also gibt es dazu keine Zeilen
   in der Datenbank. Wie das übrige Demo-Netzwerk (lib/demo.ts) stehen die
   Use Cases deshalb hier im Code: die Gesamtzahlen von der Startseite, auf
   die echten Reels verteilt (Vorschaubilder unter /img/cases). Nichts davon
   landet in der Datenbank, im Admin oder bei echten Agenturen.

   Neuer Use Case: Eintrag in USE_CASES, Vorschaubilder nach
   public/img/cases/<account>-<reel>.jpg.
   ========================================================================== */

interface UseCase {
  slug: string
  name: string
  handle: string
  /** Views gesamt, wie auf der Startseite. */
  views: number
  /** Reels: [ID bei Instagram, Anteil an den Views, vor wie vielen Tagen veröffentlicht] */
  reels: [string, number, number][]
}

const USE_CASES: UseCase[] = [
  {
    slug: 'dindrop', name: 'DinDrop', handle: 'dindrop7', views: 100_000_000,
    reels: [['DZlBQOrgilt', 30, 12], ['DbLpapmA_Bw', 26, 19], ['DbbJyZgIUjl', 19, 6], ['DPRDIqUiIeB', 14, 64], ['DM-7GyZIkb0', 11, 98]],
  },
  {
    slug: 'max-tornow', name: 'Max Tornow', handle: 'max_tornow_business', views: 70_000_000,
    reels: [['C_PxECKAj61', 41, 23], ['C8pRTW6MinC', 27, 41], ['DCHhYijJK4b', 21, 77], ['C1xEPryiQ4t', 11, 132]],
  },
  {
    slug: 'caspian-blue', name: 'Caspian Blue', handle: 'caspianbluecaviar', views: 40_000_000,
    reels: [['DQ4ga9SDEnj', 35, 9], ['DP_uoY6jFCU', 28, 27], ['DMzr3__qHsw', 22, 55], ['DKZ-ra1qDiR', 15, 109]],
  },
  {
    slug: 'levantine-istanbul', name: 'Levantine Istanbul', handle: 'levantine_istanbul', views: 3_000_000,
    reels: [['Da2pgoToIw_', 31, 4], ['DUTFpaeiMZA', 24, 33], ['DEUXjpeIHPR', 19, 71], ['DBQxgMHAw1U', 15, 96], ['C9406cJIC_D', 11, 140]],
  },
  {
    slug: 'panperium', name: 'Panperium', handle: 'panperium', views: 450_000,
    reels: [['DZvEvMPNa15', 30, 3], ['DZurxhPjezN', 25, 14], ['DZfCoAoNLUi', 20, 25], ['DZF78B8je1g', 15, 47], ['DbGw3_SCDud', 10, 88]],
  },
]

const DAY = 86400
const PREFIX = 'usecase-'

export interface ShowcaseClip {
  id: string
  campaignId: string
  campaign: string
  handle: string
  reel: string
  url: string
  image: string
  views: number
  likes: number
  comments: number
  shares: number
  /** Veröffentlicht (Unix-Sekunden), relativ zu `now`, damit die Grafik nicht veraltet. */
  publishedAt: number
}

/** Nur die Demo-Agentur bekommt die Use Cases. */
export const showsShowcase = (user: { role: string; demo?: number | null }) => user.role === 'agency' && user.demo === 1

export const isShowcaseId = (id: string) => id.startsWith(PREFIX) && USE_CASES.some((u) => PREFIX + u.slug === id)

/** Alle Reels aller Use Cases, nach Views absteigend. */
export function showcaseClips(now = Math.floor(Date.now() / 1000)): ShowcaseClip[] {
  const out: ShowcaseClip[] = []
  for (const u of USE_CASES) {
    const sum = u.reels.reduce((s, r) => s + r[1], 0)
    let rest = u.views
    u.reels.forEach(([reel, share, daysAgo], k) => {
      const views = k === u.reels.length - 1 ? rest : Math.round((u.views * share) / sum)
      rest -= views
      out.push({
        id: `${PREFIX}${u.slug}-${k}`,
        campaignId: PREFIX + u.slug,
        campaign: u.name,
        handle: u.handle,
        reel,
        url: `https://www.instagram.com/${u.handle}/p/${reel}/`,
        image: `/img/cases/${u.handle}-${reel}.jpg`,
        views,
        likes: Math.round(views / 25),
        comments: Math.round(views / 900),
        shares: Math.round(views / 400),
        publishedAt: now - daysAgo * DAY - 15 * 3600,
      })
    })
  }
  return out.sort((a, b) => b.views - a.views)
}

/** Die Use Cases als Kampagnenkarten (Band „Eigene Kampagne“, wie in der Vorschau). */
export function showcaseCampaigns(): AgencyCampaign[] {
  return USE_CASES.map((u) => ({
    id: PREFIX + u.slug,
    name: u.name,
    status: 'aktiv',
    own: true,
    thumb: { kind: 'image', src: `/img/cases/${u.handle}-${u.reels[0][0]}.jpg` } as const,
    clips: u.reels.length,
    views: u.views,
    clippers: 0,
    creators: 0,
  }))
}

/** Eine Kampagne mit ihren Reels für die Kampagnenseite. */
export function showcaseCampaign(id: string, now = Math.floor(Date.now() / 1000)): { campaign: AgencyCampaign; clips: AgencyClip[] } | null {
  const campaign = showcaseCampaigns().find((c) => c.id === id)
  if (!campaign) return null
  const clips = showcaseClips(now)
    .filter((c) => c.campaignId === id)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .map((c) => ({
      id: c.id,
      filename: `${c.handle}-${c.reel}.mp4`,
      caption: `@${c.handle}`,
      createdAt: c.publishedAt,
      posterUrl: c.image,
      previewUrl: '',
      views: c.views,
    }))
  return { campaign, clips }
}

/** Link zum Reel bei Instagram — Abspielen und Herunterladen gehen bei Use Cases dorthin. */
export const showcaseClipUrl = (clipId: string): string | null => showcaseClips().find((c) => c.id === clipId)?.url ?? null

/** Für „Virale Clips“: dieselbe Form wie die echten. */
export const showcaseViral = (): ViralClip[] =>
  showcaseClips().map((c) => ({
    id: c.id,
    campaign: c.campaign,
    views: c.views,
    likes: c.likes,
    shares: c.shares,
    comments: c.comments,
    platforms: ['instagram'],
    url: c.url,
    handle: c.handle,
    thumb: c.image,
  }))
