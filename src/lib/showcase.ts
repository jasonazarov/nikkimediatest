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
  /** Hauptaccount bei Instagram. */
  handle: string
  /** Views gesamt, wie auf der Startseite. */
  views: number
  /**
   * Reels: [Shortcode, Views laut Auftraggeber (null = nicht bekannt), Account (null = nicht bekannt)].
   * NUR echte Zahlen eintragen. Reels ohne Zahl stehen auf der Kampagnenseite ohne Views
   * und zählen nicht bei „Virale Clips“.
   */
  reels: [string, number | null, string | null][]
}

/* Views je Reel: Angaben des Auftraggebers vom 06.11.2026. */
const USE_CASES: UseCase[] = [
  {
    slug: 'dindrop', name: 'DinDrop', handle: 'dindrop7', views: 100_000_000,
    reels: [
      ['DRSI7B3CI1M', 35_400_000, 'dindrop7'], ['DNF5zC7o66_', 11_600_000, 'dindrop7'], ['DY77rgqAHmj', 500_000, 'dindrop7'],
      ['DM-7GyZIkb0', null, 'dindrop7'], ['DPRDIqUiIeB', null, 'dindrop7'], ['DZlBQOrgilt', null, 'dindrop7'],
      ['DbLpapmA_Bw', null, 'dindrop7'], ['DbbJyZgIUjl', null, 'dindrop7'],
    ],
  },
  {
    slug: 'max-tornow', name: 'Max Tornow', handle: 'max_tornow_business', views: 70_000_000,
    reels: [
      ['C1xEPryiQ4t', 13_100_000, 'max_tornow_business'], ['C0hXUyfixJt', 821_000, null],
      ['C8pRTW6MinC', null, 'max_tornow_business'], ['C_PxECKAj61', null, 'max_tornow_business'], ['DCHhYijJK4b', null, 'max_tornow_business'],
    ],
  },
  {
    slug: 'caspian-blue', name: 'Caspian Blue', handle: 'caspianbluecaviar', views: 40_000_000,
    reels: [
      ['DKZ-ra1qDiR', 6_400_000, 'caspianbluecaviar'], ['DaIZcxnqCPw', 475_000, 'caspianbluecaviar'],
      ['DQ4ga9SDEnj', null, 'caspianbluecaviar'], ['DP_uoY6jFCU', null, 'caspianbluecaviar'], ['DMzr3__qHsw', null, 'caspianbluecaviar'],
    ],
  },
  {
    slug: 'levantine-istanbul', name: 'Levantine Istanbul', handle: 'levantine_istanbul', views: 3_000_000,
    reels: [
      ['Da2pgoToIw_', null, 'levantine_istanbul'], ['DUTFpaeiMZA', null, 'levantine_istanbul'], ['DEUXjpeIHPR', null, 'levantine_istanbul'],
      ['DBQxgMHAw1U', null, 'levantine_istanbul'], ['C9406cJIC_D', null, 'levantine_istanbul'],
    ],
  },
  {
    slug: 'panperium', name: 'Panperium', handle: 'panperium', views: 450_000,
    reels: [
      ['DZvEvMPNa15', null, 'panperium'], ['DZurxhPjezN', null, 'panperium'], ['DZfCoAoNLUi', null, 'panperium'],
      ['DZF78B8je1g', null, 'panperium'], ['DbGw3_SCDud', null, 'panperium'],
    ],
  },
]

/** Vorschaubilder, die unter /img/cases liegen (<account>-<shortcode>.jpg). */
const IMAGES = new Set([
  'dindrop7-DRSI7B3CI1M', 'dindrop7-DNF5zC7o66_', 'dindrop7-DY77rgqAHmj', 'dindrop7-DM-7GyZIkb0', 'dindrop7-DPRDIqUiIeB', 'dindrop7-DZlBQOrgilt', 'dindrop7-DbLpapmA_Bw', 'dindrop7-DbbJyZgIUjl',
  'max_tornow_business-C1xEPryiQ4t', 'max_tornow_business-C0hXUyfixJt', 'max_tornow_business-C8pRTW6MinC', 'max_tornow_business-C_PxECKAj61', 'max_tornow_business-DCHhYijJK4b',
  'caspianbluecaviar-DKZ-ra1qDiR', 'caspianbluecaviar-DaIZcxnqCPw', 'caspianbluecaviar-DMzr3__qHsw', 'caspianbluecaviar-DP_uoY6jFCU', 'caspianbluecaviar-DQ4ga9SDEnj',
  'levantine_istanbul-C9406cJIC_D', 'levantine_istanbul-DBQxgMHAw1U', 'levantine_istanbul-DEUXjpeIHPR', 'levantine_istanbul-DUTFpaeiMZA',
  'levantine_istanbul-Da2pgoToIw_', 'panperium-DZF78B8je1g', 'panperium-DZfCoAoNLUi', 'panperium-DZurxhPjezN', 'panperium-DZvEvMPNa15',
  'panperium-DbGw3_SCDud',
])

const PREFIX = 'usecase-'
const SHORTCODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Veröffentlichungszeit aus dem Shortcode: Instagram-IDs tragen ab Bit 23 die
 * Millisekunden seit 2011-08-24 21:07:01.721 UTC. Kein Abruf nötig, kein Raten.
 */
export function publishedAtOf(shortcode: string): number {
  let id = 0n
  for (const ch of shortcode) id = id * 64n + BigInt(SHORTCODE.indexOf(ch))
  return Math.floor(Number((id >> 23n) + 1314220021721n) / 1000)
}

export interface ShowcaseClip {
  id: string
  campaignId: string
  campaign: string
  /** Account, wenn bekannt. */
  handle: string | null
  reel: string
  url: string
  image: string | null
  /** Views laut Auftraggeber; null = nicht bekannt. */
  views: number | null
  likes: number
  comments: number
  shares: number
  publishedAt: number
}

/** Nur die Demo-Agentur bekommt die Use Cases. */
export const showsShowcase = (user: { role: string; demo?: number | null }) => user.role === 'agency' && user.demo === 1

export const isShowcaseId = (id: string) => id.startsWith(PREFIX) && USE_CASES.some((u) => PREFIX + u.slug === id)

/** Alle Reels aller Use Cases: bekannte Views zuerst, absteigend. */
export function showcaseClips(): ShowcaseClip[] {
  const out: ShowcaseClip[] = []
  for (const u of USE_CASES) {
    u.reels.forEach(([reel, views, handle], k) => {
      // Bild unter dem Account des Reels, sonst unter dem Hauptaccount des Use Case.
      const key = [handle, u.handle].find((h) => h && IMAGES.has(`${h}-${reel}`))
      const img = key ? `/img/cases/${key}-${reel}.jpg` : null
      out.push({
        id: `${PREFIX}${u.slug}-${k}`,
        campaignId: PREFIX + u.slug,
        campaign: u.name,
        handle,
        reel,
        url: `https://www.instagram.com/reel/${reel}/`,
        image: img,
        views,
        // Likes, Kommentare und Shares sind nicht bekannt: 0 statt geschätzt.
        likes: 0,
        comments: 0,
        shares: 0,
        publishedAt: publishedAtOf(reel),
      })
    })
  }
  return out.sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.publishedAt - a.publishedAt)
}

/**
 * Views je Use Case für die Grafik: jedes Reel mit bekannter Zahl an seinem
 * Tag, der Rest bis zur Gesamtzahl der Startseite als ein Posten am Anfang
 * des Zeitraums (seine Tage sind nicht bekannt).
 */
export function showcaseViewsRows(): { campaignId: string; campaign: string; views: number; at: number | null; known: boolean }[] {
  const out: { campaignId: string; campaign: string; views: number; at: number | null; known: boolean }[] = []
  const clips = showcaseClips()
  for (const u of USE_CASES) {
    let known = 0
    for (const c of clips.filter((x) => x.campaignId === PREFIX + u.slug && x.views !== null)) {
      known += c.views!
      out.push({ campaignId: c.campaignId, campaign: c.campaign, views: c.views!, at: c.publishedAt, known: true })
    }
    if (u.views > known) out.push({ campaignId: PREFIX + u.slug, campaign: u.name, views: u.views - known, at: null, known: false })
  }
  return out
}

const thumbOf = (u: UseCase) => {
  const r = u.reels.find(([reel, , h]) => h && IMAGES.has(`${h}-${reel}`))
  return r ? ({ kind: 'image', src: `/img/cases/${r[2]}-${r[0]}.jpg` } as const) : ({ kind: 'none' } as const)
}

/** Die Use Cases als Kampagnenkarten (Band „Eigene Kampagne“, wie in der Vorschau). */
export function showcaseCampaigns(): AgencyCampaign[] {
  return USE_CASES.map((u) => ({
    id: PREFIX + u.slug,
    name: u.name,
    status: 'aktiv',
    own: true,
    thumb: thumbOf(u),
    clips: u.reels.length,
    views: u.views,
    clippers: 0,
    creators: 0,
  }))
}

/** Eine Kampagne mit ihren Reels für die Kampagnenseite. */
export function showcaseCampaign(id: string): { campaign: AgencyCampaign; clips: AgencyClip[] } | null {
  const campaign = showcaseCampaigns().find((c) => c.id === id)
  if (!campaign) return null
  // Reels mit Zahl zuerst (nach Views), dann die übrigen nach Datum.
  const clips = showcaseClips()
    .filter((c) => c.campaignId === id)
    .map((c) => ({
      id: c.id,
      filename: `${c.reel}.mp4`,
      caption: c.handle ? `@${c.handle}` : campaign.name,
      createdAt: c.publishedAt,
      posterUrl: c.image ?? '',
      previewUrl: '',
      // -1: Views nicht bekannt, die Kachel zeigt dann keine Zahl.
      views: c.views ?? -1,
    }))
  return { campaign, clips }
}

/** Link zum Reel bei Instagram — Abspielen und Herunterladen gehen bei Use Cases dorthin. */
export const showcaseClipUrl = (clipId: string): string | null => showcaseClips().find((c) => c.id === clipId)?.url ?? null

/** Für „Virale Clips“: dieselbe Form wie die echten. */
export const showcaseViral = (): ViralClip[] =>
  showcaseClips()
    .filter((c) => c.views !== null)
    .map((c) => ({
    id: c.id,
    campaign: c.campaign,
    views: c.views!,
    likes: c.likes,
    shares: c.shares,
    comments: c.comments,
    platforms: ['instagram'],
    url: c.url,
    handle: c.handle,
    thumb: c.image,
  }))
