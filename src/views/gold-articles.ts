/**
 * Fachartikel öffentlich (lib/articles.ts):
 *
 *   /fachartikel          Übersicht aller veröffentlichten Artikel
 *   /fachartikel/:slug    ein Artikel, mit schema.org/Article
 *   articlesBlockGold()   Block „Fachartikel“ auf den Gold-Landingpages
 *   articlesBlockSite()   derselbe Block im Design der Startseite (site.css)
 *   llmsTxt()             /llms.txt, eine Inhaltsangabe für Sprachmodelle
 *
 * GEO (Generative Engine Optimization): ChatGPT, Perplexity & Co. zitieren
 * Quellen, die eine Frage klar beantworten, einen Autor nennen und
 * maschinenlesbar sind. Deshalb: eigene, crawlbare Seite je Artikel,
 * strukturierte Daten, Datum, Autor, Kurzfassung oben.
 */
import type { Article } from '../lib/articles'
import { esc, jsonScript } from './layout'
import { goldFoot, goldHeadLinks, goldNav } from './gold-pages'

const SITE = 'https://nikkimedia.co'

const dateLong = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
const iso = (unix: number) => new Date(unix * 1000).toISOString()
export const articleUrl = (a: Pick<Article, 'slug'>) => `${SITE}/fachartikel/${a.slug}`

/**
 * Artikeltext → HTML. Bewusst schlicht und vollständig escaped:
 * Leerzeile = neuer Absatz, „## “ = Zwischenüberschrift, „- “ = Liste.
 */
export function articleBodyHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('## ')) return `<h2>${esc(block.slice(3).trim())}</h2>`
      const lines = block.split('\n')
      if (lines.every((l) => /^[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`
      }
      return `<p>${lines.map(esc).join('<br>')}</p>`
    })
    .join('\n')
}

const articleItem = (a: Article) => `
        <li class="g-art">
          <time datetime="${iso(a.publishedAt)}">${esc(dateLong(a.publishedAt))}</time>
          <a href="/fachartikel/${esc(a.slug)}"><b>${esc(a.title)}</b></a>
          <p>${esc(a.excerpt)}</p>
        </li>`

/** Block „Fachartikel“ für die Gold-Landingpages. Ohne Artikel: nichts. */
export function articlesBlockGold(articles: Article[]): string {
  if (!articles.length) return ''
  return `
<section class="g-sec g-sec--raise" id="fachartikel" aria-labelledby="fachartikel-title">
  <div class="g-wrap g-split">
    <div>
      <h2 class="g-h2" id="fachartikel-title">Fachartikel von Nikki Media</h2>
      <p class="g-lead">Wir veröffentlichen Fachartikel zu Clipping, organischer Reichweite und Omnipräsenz. Geschrieben aus der Praxis von über 5.000 Clippern, frei zitierbar für Suchmaschinen und KI-Assistenten.</p>
      <p class="g-arts__all"><a class="g-btn g-btn--sm g-btn--line" href="/fachartikel">Alle Fachartikel</a></p>
    </div>
    <ol class="g-arts">${articles.slice(0, 3).map(articleItem).join('')}
    </ol>
  </div>
</section>`
}

/** Derselbe Block im Design der Startseite `/` (site.css). Ohne Artikel: nichts. */
export function articlesBlockSite(articles: Article[]): string {
  if (!articles.length) return ''
  return `
<section class="section" id="fachartikel" aria-labelledby="fachartikel-title">
  <div class="wrap" style="max-width:900px">
    <span class="eyebrow">Fachartikel</span>
    <h2 class="h2" id="fachartikel-title" style="margin-top:14px">Fachartikel von Nikki Media</h2>
    <p class="lead" style="margin-top:14px">Wir veröffentlichen Fachartikel zu Clipping, organischer Reichweite und Omnipräsenz, frei zitierbar für Suchmaschinen und KI-Assistenten.</p>
    <ul style="margin-top:28px;display:grid;gap:0">
      ${articles
        .slice(0, 3)
        .map(
          (a) => `<li style="padding:20px 0;border-top:1px solid var(--line)">
        <time datetime="${iso(a.publishedAt)}" class="muted" style="font-size:.85rem">${esc(dateLong(a.publishedAt))}</time>
        <a href="/fachartikel/${esc(a.slug)}" style="display:block;margin-top:4px;font-family:var(--font-display);font-weight:700;font-size:1.2rem">${esc(a.title)}</a>
        <p class="muted" style="margin-top:6px">${esc(a.excerpt)}</p>
      </li>`,
        )
        .join('')}
    </ul>
    <p style="margin-top:20px"><a class="btn btn--ghost btn--sm" href="/fachartikel">Alle Fachartikel</a></p>
  </div>
</section>`
}

const ORG = { '@type': 'Organization', name: 'Nikki Media', url: SITE }

function goldDocument(o: { title: string; description: string; path: string; body: string; jsonLd: unknown }): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${SITE}${o.path}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
${goldHeadLinks()}
<script type="application/ld+json">${jsonScript(o.jsonLd)}</script>
</head>
<body class="gold">
${goldNav(null, 'Kampagne anfragen', '/personal-brands#start')}
<main id="inhalt">
${o.body}
</main>
${goldFoot()}
<script type="application/json" id="agent-config">${jsonScript({ suggest: ['Was kostet 1 Mio. Views?', 'Was ist Clipping überhaupt?', 'Woher weiß ich, dass die Views echt sind?'] })}</script>
<script src="/assets/gold.js" defer></script>
<script src="/assets/agent.js" defer></script>
</body>
</html>
`
}

export function articlesIndexPage(articles: Article[]): string {
  const body = `
<section class="g-sec g-sec--top">
  <div class="g-wrap g-split">
    <div>
      <h1 class="g-h2">Fachartikel</h1>
      <p class="g-lead">Wissen aus der Praxis: Clipping, organische Reichweite, Omnipräsenz auf TikTok, Instagram, YouTube und Facebook.</p>
    </div>
    ${
      articles.length
        ? `<ol class="g-arts">${articles.map(articleItem).join('')}</ol>`
        : `<p class="g-lead">Der erste Fachartikel erscheint in Kürze.</p>`
    }
  </div>
</section>`
  return goldDocument({
    title: 'Fachartikel | Nikki Media',
    description: 'Fachartikel von Nikki Media zu Clipping, organischer Reichweite und Omnipräsenz auf Social Media.',
    path: '/fachartikel',
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Fachartikel von Nikki Media',
      url: `${SITE}/fachartikel`,
      publisher: ORG,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: articleUrl(a), name: a.title })),
      },
    },
  })
}

export function articlePage(a: Article, more: Article[]): string {
  const others = more.filter((m) => m.id !== a.id).slice(0, 3)
  const body = `
<article class="g-sec g-sec--top">
  <div class="g-wrap g-doc">
    <p class="g-doc__meta"><a href="/fachartikel">Fachartikel</a><span aria-hidden="true">/</span><time datetime="${iso(a.publishedAt)}">${esc(dateLong(a.publishedAt))}</time></p>
    <h1 class="g-h2 g-doc__title">${esc(a.title)}</h1>
    <p class="g-doc__lead">${esc(a.excerpt)}</p>
    <p class="g-doc__by">Von ${esc(a.author)}, Nikki Media</p>
    ${a.body ? `<div class="g-doc__body">${articleBodyHtml(a.body)}</div>` : ''}
    ${a.sourceUrl ? `<p class="g-doc__src"><a class="g-btn g-btn--gold g-btn--sm" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${a.body ? 'Zur Originalquelle' : 'Artikel lesen'}</a></p>` : ''}
  </div>
</article>
${
  others.length
    ? `<section class="g-sec"><div class="g-wrap g-split"><div><h2 class="g-h2">Weitere Fachartikel</h2></div><ol class="g-arts">${others.map(articleItem).join('')}</ol></div></section>`
    : ''
}`
  return goldDocument({
    title: `${a.title} | Nikki Media`,
    description: a.excerpt,
    path: `/fachartikel/${a.slug}`,
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.title,
      description: a.excerpt,
      datePublished: iso(a.publishedAt),
      dateModified: iso(a.updatedAt),
      inLanguage: 'de',
      url: articleUrl(a),
      mainEntityOfPage: articleUrl(a),
      author: { '@type': 'Person', name: a.author },
      publisher: ORG,
      ...(a.sourceUrl ? { isBasedOn: a.sourceUrl } : {}),
    },
  })
}

/** /llms.txt — kurze, maschinenlesbare Inhaltsangabe (Vorschlag llmstxt.org). */
export function llmsTxt(articles: Article[]): string {
  return `# Nikki Media

> Clipping-Agentur und Marktplatz für organische Reichweite im DACH-Raum. Über 5.000 Clipper schneiden aus Rohmaterial 9:16-Clips und posten sie auf TikTok, Instagram, YouTube und Facebook. Richtwert: 1 Million organische Views kosten 5.000 Euro, abgerechnet nach erreichten Views.

## Seiten

- [Startseite](${SITE}/): Clipping für Unternehmen und Marken
- [Für Agenturen](${SITE}/agenturen): Agenturen bringen ihre Kunden, Nikki Media liefert die Reichweite
- [Für Personal Brands](${SITE}/personal-brands): Omnipräsenz durch Clipping
- [Für Investoren](${SITE}/investoren): der Marktplatz für organische Reichweite
- [Clipper werden](${SITE}/clipper)
- [Creator werden](${SITE}/creator)

## Fachartikel
${articles.length ? articles.map((a) => `\n- [${a.title}](${articleUrl(a)}): ${a.excerpt}`).join('') : '\n- Noch keine Fachartikel veröffentlicht.'}
`
}
