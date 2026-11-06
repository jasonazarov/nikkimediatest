import { Hono } from 'hono'
import { clipperLandingPage } from '../views/clipper'
import { creatorLandingPage } from '../views/creator-landing'
import { brandsLandingPage } from '../views/brands-landing'
import { landingPage } from '../views/landing'
import { agenturenPage, investorenPage, personalBrandsPage } from '../views/gold-pages'
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
publicRoutes.get('/agenturen', async (c) => c.html(agenturenPage(await safeArticles(c.env, 3)), 200, fresh))
publicRoutes.get('/personal-brands', async (c) => c.html(personalBrandsPage(await safeArticles(c.env, 3)), 200, fresh))
publicRoutes.get('/investoren', async (c) => c.html(investorenPage(await safeArticles(c.env, 3)), 200, fresh))

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
  <url><loc>${c.env.APP_URL}/</loc><priority>1.0</priority></url>
  <url><loc>${c.env.APP_URL}/clipper</loc><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/creator</loc><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/brands</loc><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/agenturen</loc><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/personal-brands</loc><priority>0.8</priority></url>
  <url><loc>${c.env.APP_URL}/investoren</loc><priority>0.6</priority></url>
  <url><loc>${c.env.APP_URL}/fachartikel</loc><priority>0.7</priority></url>
${articles.map((a) => `  <url><loc>${articleUrl(a)}</loc><lastmod>${new Date(a.updatedAt * 1000).toISOString().slice(0, 10)}</lastmod><priority>0.7</priority></url>`).join('\n')}
  <url><loc>${c.env.APP_URL}/impressum</loc><priority>0.2</priority></url>
  <url><loc>${c.env.APP_URL}/datenschutz</loc><priority>0.2</priority></url>
</urlset>
`,
    200,
    { 'content-type': 'application/xml; charset=utf-8' },
  )
})
