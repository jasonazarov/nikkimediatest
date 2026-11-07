import { Hono } from 'hono'
import { clipperLandingPage } from '../views/clipper'
import { creatorLandingPage } from '../views/creator-landing'
import { brandsLandingPage } from '../views/brands-landing'
import { landingPage } from '../views/landing'
// agenturenPage, personalBrandsPage, investorenPage (views/gold-pages.ts) sind seit November 2026 nicht mehr eingebunden.
import { articlePage, articlesBlockSite, articlesIndexPage, articleUrl, llmsTxt } from '../views/gold-articles'
import { articleBySlug, publishedArticles, type Article } from '../lib/articles'
import { datenschutzPage, impressumPage } from '../views/legal'
import type { AppEnv } from '../lib/types'

export const publicRoutes = new Hono<AppEnv>()

/**
 * Veröffentlichte Fachartikel für die öffentlichen Seiten. Fehler (etwa,
 * wenn Migration 0023 noch nicht eingespielt ist) dürfen keine Landingpage
 * kippen: dann gibt es einfach keinen Block „Fachartikel“.
 */
async function safeArticles(env: AppEnv['Bindings'], limit = 50): Promise<Article[]> {
  try {
    return await publishedArticles(env, limit)
  } catch (err) {
    console.error('[articles] nicht lesbar', err)
    return []
  }
}

/** Landingpage — komplett serverseitig gerendert, inklusive Stepper. */
publicRoutes.get('/', async (c) =>
  c.html(landingPage(articlesBlockSite(await safeArticles(c.env, 3))), 200, { 'cache-control': 'public, max-age=0, must-revalidate' }),
)

/** Clipper-Landingpage — Deutsch, Stepper schickt an POST /api/clippers. */
publicRoutes.get('/clipper', (c) =>
  c.html(clipperLandingPage(), 200, { 'cache-control': 'public, max-age=0, must-revalidate' }),
)

/** Creator-Landingpage — Deutsch, Stepper schickt an POST /api/creators. */
publicRoutes.get('/creator', (c) =>
  c.html(creatorLandingPage(), 200, { 'cache-control': 'public, max-age=0, must-revalidate' }),
)

/** Landingpage für Agenturen, Marken und Brand-Owner — Stepper schickt an POST /api/agencies. */
publicRoutes.get('/brands', (c) =>
  c.html(brandsLandingPage(), 200, { 'cache-control': 'public, max-age=0, must-revalidate' }),
)

/*
 * Gold-Landingpages (views/gold-pages.ts). Dieselben Formulare wie `/brands`
 * (Agenturen → /api/agencies) und `/` (Personal Brands → /api/leads),
 * dazu das Investorenformular (→ /api/investors).
 */
const fresh = { 'cache-control': 'public, max-age=0, must-revalidate' }
/*
 * /agenturen, /personal-brands und /investoren sind seit November 2026 nicht mehr auf der
 * Seite (Vorgabe des Auftraggebers). Wer eine alte Adresse aufruft, landet beim passenden
 * Formular: Agenturen auf /brands, alle anderen auf der Startseite. Der Code der Seiten
 * bleibt in views/gold-pages.ts, Archiv als ZIP unter archiv/landingpages/.
 */
publicRoutes.get('/agenturen', (c) => c.redirect('/brands#stepper', 301))
publicRoutes.get('/personal-brands', (c) => c.redirect('/#stepper', 301))
publicRoutes.get('/investoren', (c) => c.redirect('/', 301))

/* Fachartikel (lib/articles.ts, views/gold-articles.ts) — gepflegt unter /admin/fachartikel. */
publicRoutes.get('/fachartikel', async (c) => c.html(articlesIndexPage(await safeArticles(c.env)), 200, fresh))
publicRoutes.get('/fachartikel/:slug', async (c) => {
  let article: Article | null = null
  try {
    article = await articleBySlug(c.env, c.req.param('slug'))
  } catch (err) {
    console.error('[articles] nicht lesbar', err)
  }
  if (!article) return c.notFound()
  return c.html(articlePage(article, await safeArticles(c.env, 4)), 200, fresh)
})
publicRoutes.get('/llms.txt', async (c) =>
  c.text(llmsTxt(await safeArticles(c.env)), 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' }),
)

publicRoutes.get('/impressum', (c) => c.html(impressumPage()))
publicRoutes.get('/datenschutz', (c) => c.html(datenschutzPage()))

/*
 * Impressum und Datenschutz tragen „noindex“ und stehen deshalb nicht mehr in
 * der Sitemap (beides zusammen widerspricht sich für Suchmaschinen).
 */
/** Letzte inhaltliche Änderung der Landingpages, für <lastmod> in der Sitemap. */
const SITE_UPDATED = '2026-11-06'

/* /blog ist die Adresse, die Leute tippen; der Blog heißt Fachartikel. */
publicRoutes.get('/blog', (c) => c.redirect('/fachartikel', 301))
publicRoutes.get('/blog/:slug', (c) => c.redirect(`/fachartikel/${encodeURIComponent(c.req.param('slug'))}`, 301))

publicRoutes.get('/robots.txt', (c) =>
  c.text(
    `User-agent: *
Allow: /
Disallow: /app
Disallow: /admin
Disallow: /work
Disallow: /kampagnen
Disallow: /collaboration
Disallow: /login
Disallow: /api

# GEO: KI-Suchdienste dürfen die öffentlichen Seiten lesen und zitieren.
# Dieselben Sperren wie oben, damit Dashboards nie in Antworten landen.
${['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot']
  .map((bot) => `User-agent: ${bot}\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /work\nDisallow: /kampagnen\nDisallow: /collaboration\nDisallow: /login\nDisallow: /api\n`)
  .join('\n')}
# Kurzfassung für Sprachmodelle: ${c.env.APP_URL}/llms.txt

Sitemap: ${c.env.APP_URL}/sitemap.xml
`,
    200,
    { 'content-type': 'text/plain; charset=utf-8' },
  ),
)

publicRoutes.get('/sitemap.xml', async (c) => {
  const articles = await safeArticles(c.env, 200)
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${c.env.APP_URL}/</loc><lastmod>${SITE_UPDATED}</lastmod><priority>1.0</priority></url>
  <url><loc>${c.env.APP_URL}/clipper</loc><lastmod>${SITE_UPDATED}</lastmod><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/creator</loc><lastmod>${SITE_UPDATED}</lastmod><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/brands</loc><lastmod>${SITE_UPDATED}</lastmod><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/fachartikel</loc><lastmod>${articles[0] ? new Date(Math.max(...articles.map((a) => a.updatedAt)) * 1000).toISOString().slice(0, 10) : SITE_UPDATED}</lastmod><priority>0.7</priority></url>
${articles.map((a) => `  <url><loc>${articleUrl(a)}</loc><lastmod>${new Date(a.updatedAt * 1000).toISOString().slice(0, 10)}</lastmod><priority>0.7</priority></url>`).join('\n')}
</urlset>
`,
    200,
    { 'content-type': 'application/xml; charset=utf-8' },
  )
})
