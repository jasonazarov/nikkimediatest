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
import { breadcrumbs, geoHead, ldGraph, OG_IMAGE, ORGANIZATION, SITE } from './seo'


const dateLong = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
const iso = (unix: number) => new Date(unix * 1000).toISOString()
export const articleUrl = (a: Pick<Article, 'slug'>) => `${SITE}/fachartikel/${a.slug}`

/** „Was kostet Clipping?“ → „was-kostet-clipping“ (Sprungmarken im Inhaltsverzeichnis). */
const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'abschnitt'

/**
 * Inline-Formatierung NACH dem Escapen: **fett**, *kursiv*, [Text](https://…).
 * Links nur mit http(s), externe öffnen in neuem Tab ohne Verweis-Weitergabe.
 */
function inline(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_m, label: string, href: string) =>
      href.startsWith('/') || href.startsWith(SITE)
        ? `<a href="${href}">${label}</a>`
        : `<a href="${href}" target="_blank" rel="noopener">${label}</a>`,
    )
}

/**
 * Artikeltext → HTML. Bewusst schlicht und vollständig escaped:
 *   Leerzeile = neuer Absatz · „## “ / „### “ = Zwischenüberschrift
 *   „- “ = Liste · „1. “ = nummerierte Liste · „> “ = Zitat/Merksatz
 *   **fett** · *kursiv* · [Linktext](https://…)
 * Zwischenüberschriften bekommen eine Sprungmarke für das Inhaltsverzeichnis.
 */
export function articleBodyHtml(body: string): string {
  const used = new Set<string>()
  const id = (text: string) => {
    let base = anchor(text)
    let n = 2
    let out = base
    while (used.has(out)) out = `${base}-${n++}`
    used.add(out)
    return out
  }
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('### ')) return `<h3>${inline(block.slice(4).trim())}</h3>`
      if (block.startsWith('## ')) {
        const t = block.slice(3).trim()
        return `<h2 id="${id(t)}">${inline(t)}</h2>`
      }
      const lines = block.split('\n')
      if (lines.every((l) => /^[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`
      }
      if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`
      }
      if (lines.every((l) => /^>\s?/.test(l))) {
        return `<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`
    })
    .join('\n')
}

/** Die Zwischenüberschriften (## …) für das Inhaltsverzeichnis, mit denselben Sprungmarken. */
function tocOf(body: string): { id: string; text: string }[] {
  const used = new Set<string>()
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.startsWith('## '))
    .map((b) => {
      const text = b.slice(3).trim()
      let out = anchor(text)
      let n = 2
      const base = out
      while (used.has(out)) out = `${base}-${n++}`
      used.add(out)
      return { id: out, text: text.replace(/\*\*|\*/g, '') }
    })
}

/** Lesezeit bei 220 Wörtern pro Minute, mindestens eine Minute. */
const readingMinutes = (a: Article) => Math.max(1, Math.round(`${a.excerpt} ${a.body}`.split(/\s+/).filter(Boolean).length / 220))

const articleItem = (a: Article) => `
        <li class="g-art">
          <time datetime="${iso(a.publishedAt)}">${esc(dateLong(a.publishedAt))} · ${readingMinutes(a)} Min. Lesezeit</time>
          <a href="/fachartikel/${esc(a.slug)}"><b>${esc(a.title)}</b></a>
          <p>${esc(a.excerpt)}</p>
        </li>`

/** Artikel als Karte im Raster der Übersicht (Blog). */
const articleCard = (a: Article, featured = false) => `
        <li class="g-post${featured ? ' g-post--lead' : ''}">
          <a href="/fachartikel/${esc(a.slug)}">
            <span class="g-post__meta"><time datetime="${iso(a.publishedAt)}">${esc(dateLong(a.publishedAt))}</time> · ${readingMinutes(a)} Min.</span>
            <${featured ? 'h2' : 'h3'} class="g-post__title">${esc(a.title)}</${featured ? 'h2' : 'h3'}>
            <span class="g-post__excerpt">${esc(a.excerpt)}</span>
            <span class="g-post__more">Weiterlesen <span aria-hidden="true">→</span></span>
          </a>
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

function goldDocument(o: {
  title: string
  description: string
  path: string
  body: string
  /** Knoten für den JSON-LD-Graphen; Organisation und Breadcrumbs kommen dazu. */
  ld: unknown[]
  crumbs: { name: string; path: string }[]
  article?: Article
}): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="${SITE}${o.path}">
${geoHead(o.path)}
<meta property="og:type" content="${o.article ? 'article' : 'website'}">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Nikki Media">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
${
  o.article
    ? `<meta property="article:published_time" content="${iso(o.article.publishedAt)}">
<meta property="article:modified_time" content="${iso(o.article.updatedAt)}">
<meta property="article:author" content="${esc(o.article.author)}">
<meta name="author" content="${esc(o.article.author)}">`
    : ''
}
<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="Kurzfassung für Sprachmodelle">
${goldHeadLinks()}
${ldGraph(ORGANIZATION, breadcrumbs(o.crumbs), ...o.ld)}
</head>
<body class="gold">
${goldNav(null, 'Kampagne anfragen', '/#stepper')}
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

/** Sichtbare Brotkrumen, passend zur BreadcrumbList im JSON-LD. */
const crumbNav = (items: { name: string; path: string }[]) => `
    <nav class="g-crumbs" aria-label="Brotkrumen"><ol>${items
      .map((it, i) =>
        i === items.length - 1
          ? `<li aria-current="page">${esc(it.name)}</li>`
          : `<li><a href="${esc(it.path)}">${esc(it.name)}</a></li>`,
      )
      .join('')}</ol></nav>`

/** Titel ohne Anhängsel, wenn er sonst über 65 Zeichen käme (Suchergebnis schneidet ab). */
const seoTitle = (t: string) => (t.length + 14 <= 65 ? `${t} | Nikki Media` : t)

/** Aufruf zum Handeln am Ende jedes Artikels (Marktplatz: alle vier Seiten). */
const articleCta = `
    <aside class="g-cta-box" aria-label="Mit Nikki Media starten">
      <p class="g-cta-box__eyebrow">Nikki Media</p>
      <p class="g-cta-box__title">Reichweite, die du nur nach echten Views bezahlst.</p>
      <p class="g-cta-box__text">Über 5.000 Clipper im DACH-Raum. Abgerechnet nach echten Views: ~5 € pro 1.000 Views.</p>
      <div class="g-cta-box__row">
        <a class="g-btn g-btn--gold g-btn--sm" href="/#stepper">Kampagne anfragen</a>
        <a class="g-btn g-btn--sm g-btn--line" href="/brands#stepper">Für Agenturen</a>
        <a class="g-btn g-btn--sm g-btn--line" href="/clipper#stepper">Clipper werden</a>
        <a class="g-btn g-btn--sm g-btn--line" href="/creator#stepper">Creator werden</a>
      </div>
    </aside>`

export function articlesIndexPage(articles: Article[]): string {
  const crumbs = [
    { name: 'Nikki Media', path: '/' },
    { name: 'Fachartikel', path: '/fachartikel' },
  ]
  const [lead, ...rest] = articles
  const body = `
<section class="g-sec g-sec--top g-blog">
  <div class="g-wrap">
    ${crumbNav(crumbs)}
    <header class="g-blog__head">
      <p class="g-blog__eyebrow">Blog · Wissen aus der Praxis</p>
      <h1 class="g-h2">Fachartikel zu Clipping und organischer Reichweite</h1>
      <p class="g-lead">Wie Clipping funktioniert, was Reichweite kostet und wie Marken, Agenturen und Personal Brands im DACH-Raum omnipräsent werden. Geschrieben aus der Praxis von über 5.000 Clippern.</p>
    </header>
    ${
      articles.length
        ? `<h2 class="g-blog__sub">Neueste Fachartikel</h2>
    <ol class="g-posts">${articleCard(lead, true).replace('<h2 class="g-post__title">', '<h3 class="g-post__title">').replace('</h2>', '</h3>')}${rest.map((a) => articleCard(a)).join('')}</ol>`
        : `<h2 class="g-blog__sub">Bald hier</h2><p class="g-lead">Der erste Fachartikel erscheint in Kürze.</p>`
    }
  </div>
</section>`
  return goldDocument({
    title: 'Fachartikel zu Clipping & Reichweite | Nikki Media',
    description:
      'Fachartikel von Nikki Media: Clipping, organische Reichweite und Omnipräsenz auf TikTok, Instagram und YouTube, für Marken und Agenturen im DACH-Raum.',
    path: '/fachartikel',
    body,
    crumbs,
    ld: [
      {
        '@type': ['CollectionPage', 'Blog'],
        '@id': `${SITE}/fachartikel#blog`,
        name: 'Fachartikel von Nikki Media',
        url: `${SITE}/fachartikel`,
        inLanguage: 'de',
        publisher: { '@id': ORGANIZATION['@id'] },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: articleUrl(a), name: a.title })),
        },
      },
    ],
  })
}

export function articlePage(a: Article, more: Article[]): string {
  const others = more.filter((m) => m.id !== a.id).slice(0, 3)
  const toc = a.body ? tocOf(a.body) : []
  const minutes = readingMinutes(a)
  const crumbs = [
    { name: 'Nikki Media', path: '/' },
    { name: 'Fachartikel', path: '/fachartikel' },
    { name: a.title, path: `/fachartikel/${a.slug}` },
  ]
  const isJason = /jason azarov/i.test(a.author)
  const body = `
<article class="g-sec g-sec--top">
  <div class="g-wrap g-doc">
    ${crumbNav(crumbs)}
    <p class="g-doc__meta"><time datetime="${iso(a.publishedAt)}">${esc(dateLong(a.publishedAt))}</time><span aria-hidden="true">·</span><span>${minutes} Min. Lesezeit</span>${
      a.updatedAt - a.publishedAt > 86400 ? `<span aria-hidden="true">·</span><span>Aktualisiert am <time datetime="${iso(a.updatedAt)}">${esc(dateLong(a.updatedAt))}</time></span>` : ''
    }</p>
    <h1 class="g-h2 g-doc__title">${esc(a.title)}</h1>
    <div class="g-doc__answer" role="note">
      <p class="g-doc__answer-label">Kurz gesagt</p>
      <p class="g-doc__lead">${esc(a.excerpt)}</p>
    </div>
    <p class="g-doc__by">Von <span>${esc(a.author)}</span>, Nikki Media</p>
    ${
      toc.length >= 2
        ? `<nav class="g-toc" aria-label="Inhalt"><p class="g-toc__title">Inhalt</p><ol>${toc
            .map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`)
            .join('')}</ol></nav>`
        : ''
    }
    ${a.body ? `<div class="g-doc__body">${articleBodyHtml(a.body)}</div>` : ''}
    ${a.sourceUrl ? `<p class="g-doc__src"><a class="g-btn g-btn--gold g-btn--sm" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${a.body ? 'Zur Originalquelle' : 'Artikel lesen'}</a></p>` : ''}
    <aside class="g-author" aria-label="Über den Autor">
      <span class="g-author__av" aria-hidden="true">${esc(
        a.author
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] ?? '')
          .join('')
          .toUpperCase(),
      )}</span>
      <div>
        <p class="g-author__name">${esc(a.author)}</p>
        <p class="g-author__bio">${
          isJason
            ? 'Gründer von Nikki Media, der Clipping-Agentur und dem Marktplatz für organische Reichweite im DACH-Raum. Schreibt über Clipping, Kurzvideo-Strategie und Omnipräsenz.'
            : 'Schreibt für Nikki Media über Clipping, Kurzvideo-Strategie und organische Reichweite.'
        }</p>
      </div>
    </aside>
    ${articleCta}
  </div>
</article>
${
  others.length
    ? `<section class="g-sec"><div class="g-wrap"><h2 class="g-blog__sub">Weitere Fachartikel</h2><ol class="g-posts">${others.map((o) => articleCard(o)).join('')}</ol></div></section>`
    : ''
}`
  const words = `${a.excerpt} ${a.body}`.split(/\s+/).filter(Boolean).length
  return goldDocument({
    title: seoTitle(a.title),
    description: a.excerpt.length > 165 ? `${a.excerpt.slice(0, 160).replace(/\s+\S*$/, '')} …` : a.excerpt,
    path: `/fachartikel/${a.slug}`,
    body,
    crumbs,
    article: a,
    ld: [
      {
        '@type': 'Article',
        '@id': `${articleUrl(a)}#article`,
        headline: a.title.slice(0, 110),
        description: a.excerpt,
        datePublished: iso(a.publishedAt),
        dateModified: iso(a.updatedAt),
        inLanguage: 'de',
        url: articleUrl(a),
        mainEntityOfPage: articleUrl(a),
        image: OG_IMAGE,
        wordCount: words,
        timeRequired: `PT${minutes}M`,
        author: isJason
          ? { '@id': `${SITE}/#jason-azarov`, '@type': 'Person', name: a.author, jobTitle: 'Gründer', worksFor: { '@id': ORGANIZATION['@id'] } }
          : { '@type': 'Person', name: a.author, worksFor: { '@id': ORGANIZATION['@id'] } },
        publisher: { '@id': ORGANIZATION['@id'] },
        isPartOf: { '@id': `${SITE}/fachartikel#blog` },
        about: ['Clipping', 'Organische Reichweite', 'Kurzvideos'],
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.g-doc__title', '.g-doc__answer'] },
        ...(a.sourceUrl ? { isBasedOn: a.sourceUrl } : {}),
      },
    ],
  })
}

/** /llms.txt — kurze, maschinenlesbare Inhaltsangabe (Vorschlag llmstxt.org). */
export function llmsTxt(articles: Article[]): string {
  return `# Nikki Media

> Clipping-Agentur und Marktplatz für organische Reichweite im DACH-Raum (Deutschland, Österreich, Schweiz). Über 5.000 Clipper schneiden aus Rohmaterial 9:16-Clips und posten sie über viele Accounts auf TikTok, Instagram, YouTube und Facebook. Richtwert: 1 Million organische Views kosten 5.000 Euro (5 € pro 1.000 Views), abgerechnet nach erreichten Views.

## Fakten

- Angebot: Content Clipping, also Kurzvideos aus vorhandenem Material (Podcasts, Interviews, Livestreams, Produktvideos), verbreitet über ein Netzwerk aus Clippern und Creatorn
- Preis: Richtwert 5.000 € für 1 Million organische Views; der finale Preis wird vor Kampagnenstart schriftlich festgehalten
- Abrechnung: nach tatsächlich erreichten Views; die Zahlen kommen direkt von den Plattformen
- Netzwerk: über 5.000 Clipper (Stand Oktober 2026)
- Plattformen: TikTok, Instagram Reels, YouTube Shorts, Facebook
- Markt: DACH-Raum, Sprache Deutsch
- Büro: Darwingasse 6, 1020 Wien, Österreich
- Gründer: Jason Azarov
- Ablauf: Kampagne anlegen, Rohmaterial im eigenen Dashboard hochladen, Nikki Media ordnet Clipper und Creator zu, Clips werden veröffentlicht, Views werden gezählt

## Marktplatz: vier Seiten

- Auftraggeber und Marken buchen Reichweite: ${SITE}/
- Agenturen bringen ihre Kunden und behalten ihre Marge: ${SITE}/brands
- Personal Brands werden omnipräsent: ${SITE}/
- Clipper verdienen pro 1.000 Views: ${SITE}/clipper
- Creator verbreiten Kampagnen oder lassen eigenes Material clippen: ${SITE}/creator

## Fachartikel
${articles.length ? articles.map((a) => `\n- [${a.title}](${articleUrl(a)}): ${a.excerpt}`).join('') : '\n- Noch keine Fachartikel veröffentlicht.'}

## Kontakt

- Website: ${SITE}/
- Telefon: +43 676 5990071
`
}
