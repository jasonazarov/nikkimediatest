/**
 * SEO und GEO für alle öffentlichen Seiten (November 2026, nur Darstellung).
 *
 *   SEO  Google & Bing: Canonical, hreflang, Vorschaubild, strukturierte Daten
 *   GEO  zweifach gemeint und beides abgedeckt:
 *        1. Geografie: Ausrichtung auf Deutschland, Österreich und die Schweiz
 *           (hreflang de-DE / de-AT / de-CH, `areaServed`, Sprache de)
 *        2. Generative Engine Optimization: ChatGPT, Perplexity, Google AI
 *           Overviews & Co. zitieren Seiten mit klarer Entität (Organization),
 *           Fakten (Preis, Netzwerk), FAQ und Autor. Dazu /llms.txt und
 *           ausdrücklich erlaubte KI-Crawler in /robots.txt (routes/public.ts).
 *
 * Geprüft wird das mit `python3 tools/seo_audit.py`.
 *
 * Eine Domain, eine Sprache: Alle drei hreflang-Varianten zeigen auf dieselbe
 * Adresse. Das ist gültig und sagt Suchmaschinen, dass die Seite für den
 * ganzen DACH-Raum gedacht ist, statt nur für Deutschland.
 */
import { jsonScript } from './layout'
import { faqFor, PRICE_PER_MILLION_EUR, type FaqAudience } from '../lib/faq'

export const SITE = 'https://nikkimedia.co'

/** Vorschaubild für geteilte Links (1200 × 630, erzeugt von tools/og_image.py). */
export const OG_IMAGE = `${SITE}/img/og/nikki-media.png`

const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Zusätzliche Kopfzeilen jeder öffentlichen Seite. Steht direkt hinter
 * `<link rel="canonical">`; `path` beginnt mit „/“.
 */
export function geoHead(path: string, o: { image?: string; imageAlt?: string } = {}): string {
  const url = SITE + path
  const image = o.image ?? OG_IMAGE
  return `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="alternate" hreflang="de-DE" href="${attr(url)}">
<link rel="alternate" hreflang="de-AT" href="${attr(url)}">
<link rel="alternate" hreflang="de-CH" href="${attr(url)}">
<link rel="alternate" hreflang="de" href="${attr(url)}">
<link rel="alternate" hreflang="x-default" href="${attr(url)}">
<meta property="og:url" content="${attr(url)}">
<meta property="og:image" content="${attr(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${attr(o.imageAlt ?? 'Nikki Media, Clipping-Agentur für den DACH-Raum')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${attr(image)}">`
}

const DACH = [
  { '@type': 'Country', name: 'Deutschland', identifier: 'DE' },
  { '@type': 'Country', name: 'Österreich', identifier: 'AT' },
  { '@type': 'Country', name: 'Schweiz', identifier: 'CH' },
]

/** Die Entität „Nikki Media“, auf jeder Seite gleich (@id verbindet sie). */
export const ORGANIZATION = {
  '@type': ['Organization', 'ProfessionalService'],
  '@id': `${SITE}/#organization`,
  name: 'Nikki Media',
  alternateName: 'NIKKI MEDIA',
  url: `${SITE}/`,
  logo: `${SITE}/img/og/logo.png`,
  image: OG_IMAGE,
  description:
    'Clipping-Agentur und Marktplatz für organische Reichweite im DACH-Raum. Über 5.000 Clipper schneiden aus Rohmaterial Kurzvideos und posten sie auf TikTok, Instagram, YouTube und Facebook. Abgerechnet wird nach erreichten Views.',
  areaServed: DACH,
  knowsLanguage: 'de',
  founder: { '@type': 'Person', '@id': `${SITE}/#jason-azarov`, name: 'Jason Azarov', jobTitle: 'Gründer' },
  telephone: '+43 676 5990071',
  // Büro Wien, genau wie im Google-Unternehmensprofil und im Impressum (Vorgabe des Auftraggebers,
  // November 2026). Seit 09.11.2026 die einzige Adresse im Impressum (Dubai entfernt).
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Darwingasse 6',
    postalCode: '1020',
    addressLocality: 'Wien',
    addressCountry: 'AT',
  },
  priceRange: '€€',
  knowsAbout: [
    'Clipping',
    'Content Clipping',
    'Kurzvideos',
    'Organische Reichweite',
    'TikTok Marketing',
    'Instagram Reels',
    'YouTube Shorts',
    'Influencer Marketing',
    'Personal Branding',
  ],
}

/** Die Leistung „Clipping“ mit Richtpreis: eine Zahl, die KI-Assistenten zitieren können. */
export function clippingService(name: string, description: string, audience: string) {
  return {
    '@type': 'Service',
    '@id': `${SITE}/#service-${audience.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    name,
    serviceType: 'Content Clipping',
    description,
    provider: { '@id': ORGANIZATION['@id'] },
    areaServed: DACH,
    audience: { '@type': 'BusinessAudience', audienceType: audience },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: PRICE_PER_MILLION_EUR,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: PRICE_PER_MILLION_EUR,
        priceCurrency: 'EUR',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1_000_000, unitText: 'Views' },
      },
      description: 'Richtwert: 1 Million organische Views kosten 5.000 €. Abgerechnet wird nach erreichten Views.',
    },
  }
}

/** FAQ als FAQPage, aus derselben Wissensbasis wie der sichtbare FAQ-Block (lib/faq.ts). */
export function faqPage(audience: FaqAudience, path: string) {
  return {
    '@type': 'FAQPage',
    '@id': `${SITE}${path}#faq`,
    mainEntity: faqFor(audience).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE + it.path })),
  }
}

/** Ein JSON-LD-Block mit @graph, sicher eingebettet. */
export const ldGraph = (...nodes: unknown[]) =>
  `<script type="application/ld+json">${jsonScript({ '@context': 'https://schema.org', '@graph': nodes })}</script>`
