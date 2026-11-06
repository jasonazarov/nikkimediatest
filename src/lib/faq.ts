import type { Env } from './types'

/**
 * Wissensbasis des FAQ-Agenten.
 *
 * EINE Quelle für zwei Dinge: die FAQ-Abschnitte der Gold-Landingpages
 * (views/gold-pages.ts) und die Antworten des Agenten (POST /api/agent/faq).
 * Was hier steht, sagt der Agent; was hier nicht steht, beantwortet er nicht,
 * sondern verweist auf Jason. Neue Fragen also HIER ergänzen.
 *
 * Die Texte der Kunden- und Agentur-FAQ sind wörtlich von `/` und `/brands`
 * übernommen. Neu sind nur: Preis-Richtwert (Vorgabe des Auftraggebers,
 * November 2026: 1 Mio. Views = 5.000 €), Marktplatz, Investoren,
 * Personal Brands.
 */

export type FaqAudience = 'kunden' | 'agenturen' | 'investoren' | 'personal-brands' | 'clipper' | 'creator'

export interface FaqEntry {
  id: string
  q: string
  a: string
  /** Suchwörter, die in der Frage selbst nicht vorkommen (Synonyme, Umgangssprache). */
  keys: string[]
  /** Auf welchen Seiten die Frage im FAQ-Abschnitt steht. Der Agent kennt immer alle. */
  on: FaqAudience[]
}

/** Preis pro einer Million Views in Euro — Richtwert für Slider und Agent. */
export const PRICE_PER_MILLION_EUR = 5000

export const FAQ: FaqEntry[] = [
  {
    id: 'was-ist-clipping',
    q: 'Was genau ist Clipping überhaupt?',
    a: 'Aus deinem bereits vorhandenen Rohmaterial entstehen kurze, native Clips im 9:16-Format. Diese werden von hunderten Fan-Accounts gleichzeitig auf Instagram, TikTok, YouTube und Facebook gepostet. So erzeugst du maximale organische Reichweite, ganz ohne selbst zu posten.',
    keys: ['clip', 'clipping', 'clippen', 'funktioniert', 'erklaer', 'prinzip', 'kurzvideo', 'reels', 'shorts'],
    on: ['kunden', 'personal-brands', 'agenturen'],
  },
  {
    id: 'preis',
    q: 'Was kostet eine Kampagne?',
    a: `Unser Richtwert: 1 Million organische Views kosten ${PRICE_PER_MILLION_EUR.toLocaleString('de-DE')} €, also 5 € pro 1.000 Views. Mit dem Regler auf der Seite siehst du sofort, was deine Wunsch-Reichweite kostet. Den finalen Preis halten wir vor dem Start schriftlich fest, abgerechnet wird nur nach tatsächlich erreichten Views.`,
    keys: ['preis', 'kosten', 'kostet', 'teuer', 'euro', 'budget', 'cpm', 'tausend', 'million', 'angebot', 'abrechnung', 'bezahlen', 'zahlen', 'price'],
    on: ['kunden', 'personal-brands', 'agenturen'],
  },
  {
    id: 'branchen',
    q: 'Für welche Branchen funktioniert Clipping?',
    a: 'Von Gastronomie, E-Commerce und Immobilien über Beauty und Musik bis Coaching, Business und B2B. Entscheidend ist nicht die Branche, sondern die passende Nische und wie gut sich dein Content clippen lässt. Du willst wissen, ob wir mit deinem Material arbeiten können? Frag uns einfach über das Formular.',
    keys: ['branche', 'nische', 'gastronomie', 'immobilien', 'coaching', 'ecommerce', 'b2b', 'beauty', 'musik', 'passt'],
    on: ['kunden', 'agenturen'],
  },
  {
    id: 'zielgruppe',
    q: 'Wird wirklich meine Zielgruppe erreicht?',
    a: 'Ja. Anders gehen Videos gar nicht viral. Deswegen sieht auch ein 40-jähriger Immobilienunternehmer keine Make-up-Tutorials auf TikTok. Zusätzlich nutzen wir Algorithmus-Triggering: Jeder neu erstellte Account wird vor dem ersten Post in deiner Nische „aufgewärmt“, bis seine For-You-Page wie die deiner Wunschkunden aussieht. Erst dann wird gepostet.',
    keys: ['zielgruppe', 'kunden', 'algorithmus', 'aufwaermen', 'relevant', 'richtigen', 'foryou', 'fyp', 'targeting'],
    on: ['kunden', 'personal-brands', 'agenturen'],
  },
  {
    id: 'dach',
    q: 'Wie wird sichergestellt, dass die Views aus dem DACH-Raum kommen?',
    a: 'Unser Team für DACH-Kunden sitzt in Deutschland, Österreich und der Schweiz. Für internationale Kunden arbeiten englischsprachige Clipper aus der EU. Jeder Account wird vorab in deiner Zielregion und Nische aufgewärmt. So bekommst du geografisch relevante Reichweite statt wahlloser Views aus aller Welt.',
    keys: ['dach', 'deutschland', 'oesterreich', 'schweiz', 'region', 'international', 'land', 'laender', 'englisch'],
    on: ['kunden', 'agenturen'],
  },
  {
    id: 'ads',
    q: 'Was ist der Unterschied zu Meta- oder TikTok-Ads?',
    a: 'Ads werden übersprungen: organischer Content wird angeschaut. Du zahlst nur für echte Reichweite, Videos gehen nur viral, wenn sie deine Zielgruppe treffen, und sie laufen auch nach Budgetende kostenlos weiter.',
    keys: ['ads', 'werbung', 'meta', 'facebookads', 'anzeigen', 'unterschied', 'besser', 'paid', 'organisch'],
    on: ['kunden', 'personal-brands'],
  },
  {
    id: 'material',
    q: 'Brauche ich eigenes Videomaterial?',
    a: 'Kaum. Aus wenigen Minuten Rohmaterial entstehen hunderte Clips über viele Accounts. Entscheidend ist nicht die Menge, sondern wie geclippt wird und ob die Zielgruppe passt. Auf Wunsch geben wir gezielte Content-Vorgaben, oder wir arbeiten ganz ohne dein Material.',
    keys: ['rohmaterial', 'material', 'videos', 'video', 'footage', 'podcast', 'aufnahmen', 'drehen', 'filmen', 'hochladen', 'upload'],
    on: ['kunden', 'personal-brands'],
  },
  {
    id: 'plattformen',
    q: 'Auf welchen Plattformen wird gepostet?',
    a: 'Auf Instagram, TikTok, YouTube und Facebook, dort, wo Kurzvideos im 9:16-Format aktuell die größte organische Reichweite erzielen. Als Reels, Shorts und auf der For-You-Page.',
    keys: ['plattform', 'plattformen', 'instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'snapchat', 'wo'],
    on: ['kunden', 'personal-brands', 'agenturen'],
  },
  {
    id: 'echt',
    q: 'Woher weiß ich, dass die Views echt sind?',
    a: 'Über drei Mechanismen: automatische Prüfung des View-Verlaufs und des Verhältnisses aus Likes, Shares, Kommentaren und Saves, eine manuelle Kontrolle jedes Videos sowie einen Insights-Nachweis per Screen-Recording bei jedem Video über 10.000 Views. Diese Nachweise stellen wir dir zur Verfügung. Im Dashboard siehst du die Zahlen jedes veröffentlichten Clips.',
    keys: ['echt', 'fake', 'bots', 'nachweis', 'beweis', 'insights', 'kontrolle', 'gekauft', 'seriös', 'serioes'],
    on: ['kunden', 'agenturen', 'investoren'],
  },
  {
    id: 'garantie',
    q: 'Gibt es eine Garantie?',
    a: 'Ja, im Vertrag steht eine konkrete, garantierte Anzahl organischer Views, berechnet aus deinem CPM und deinem Budget. Unsere Clipper posten so lange, bis das Budget verbraucht ist. Das halten wir dir schriftlich fest.',
    keys: ['garantie', 'garantiert', 'sicher', 'vertrag', 'risiko', 'versprechen'],
    on: ['kunden', 'personal-brands'],
  },
  {
    id: 'nicht-viral',
    q: 'Was passiert, wenn ein Video nicht viral geht?',
    a: 'Dann kostet es dich nichts, du zahlst ausschließlich für tatsächliche Views. Ein neuer Account und Videos ohne Views bringen dir nichts, deswegen zahlst du dafür auch nicht.',
    keys: ['viral', 'floppt', 'flop', 'keine', 'erfolglos', 'schlecht', 'laeuft'],
    on: ['kunden', 'personal-brands'],
  },
  {
    id: 'clipper',
    q: 'Wer sind die Clipper?',
    a: 'Ein wachsendes Netzwerk aus über 5.000 Cuttern und Creatorn, die für deine Marke eigene Clips schneiden und über eigene Accounts posten. Sie werden rein leistungsbasiert bezahlt, verdienen also nur, wenn ihre Videos echte Reichweite bringen.',
    keys: ['clipper', 'cutter', 'editor', 'netzwerk', 'armee', 'leute', 'accounts', 'fanpages', 'fanaccounts', 'postet', 'posten', 'poster'],
    on: ['kunden', 'personal-brands', 'agenturen', 'investoren'],
  },
  {
    id: 'tempo',
    q: 'Wie schnell sehe ich erste Ergebnisse?',
    a: 'Die Accounts gehen direkt nach dem Setup live. Die ersten Videos werden nach der 2–3-tägigen Aufwärmphase gepostet. Eine Kampagne läuft in der Regel über 30, 60 oder 90 Tage, in dieser Zeit wird kontinuierlich gepostet, ausgewertet und das Erfolgreiche hochskaliert.',
    keys: ['schnell', 'dauer', 'dauert', 'wann', 'ergebnisse', 'start', 'zeit', 'tage', 'laufzeit', 'lange'],
    on: ['kunden', 'personal-brands', 'agenturen'],
  },
  {
    id: 'ablauf',
    q: 'Wie läuft der Start ab?',
    a: 'In vier Schritten: Anfrage über das Formular, Strategiegespräch mit Beispielen und Case Studies (45 Minuten), Onboarding und Setup, dann geht die Kampagne live. Danach posten unsere Clipper, bis dein Budget ausgeschöpft ist.',
    keys: ['ablauf', 'starten', 'anfangen', 'onboarding', 'schritte', 'loslegen', 'anmelden', 'formular', 'gespraech'],
    on: ['kunden', 'personal-brands'],
  },
  {
    id: 'personal-brand',
    q: 'Funktioniert das auch für Personal Brands?',
    a: 'Gerade für Personal Brands. Dein Gesicht, deine Stimme, deine Aussagen: Clipping macht aus einem Podcast, Interview oder Livestream hunderte Clips, die über viele Accounts gleichzeitig laufen. So entsteht Omnipräsenz, deine Zielgruppe sieht dich überall, ohne dass du selbst täglich postest.',
    keys: ['personal', 'brand', 'personalbrand', 'influencer', 'coach', 'speaker', 'unternehmer', 'gesicht', 'omnipraesenz', 'bekannt', 'reichweite'],
    on: ['personal-brands'],
  },
  {
    id: 'agentur-was',
    q: 'Was übernimmt NIKKI MEDIA für unsere Agentur?',
    a: 'Alles, was zwischen Rohmaterial und Reichweite liegt: Schnitt, Untertitel, Hooks, Upload und Verbreitung über unser Netzwerk aus Clippern und Creatorn. Ihr bringt den Kunden und das Material, oder lasst das Material von uns produzieren. Wir liefern die Clips und die Sichtbarkeit.',
    keys: ['agentur', 'agenturen', 'partner', 'kooperation', 'zusammenarbeit', 'reseller', 'uebernehmt', 'leistung', 'leistungen'],
    on: ['agenturen'],
  },
  {
    id: 'whitelabel',
    q: 'Treten wir gegenüber unseren Kunden als NIKKI MEDIA in Erscheinung?',
    a: 'Nur, wenn ihr das wollt. Wir arbeiten auf Wunsch komplett im Hintergrund: Die Kundenbeziehung bleibt bei euch, die Ergebnisse präsentiert ihr unter eurem Namen.',
    keys: ['whitelabel', 'white', 'label', 'hintergrund', 'name', 'kundenbeziehung', 'anonym', 'eigener'],
    on: ['agenturen'],
  },
  {
    id: 'coop-code',
    q: 'Was ist ein Cooperation-Code?',
    a: 'Ein persönlicher Zugangscode für ausgewählte Partner. Ihr bekommt ihn nach einem Erstgespräch mit unserem Team. Wer ihn im Formular einträgt, erhält nach dem Briefing sofort vollen Einblick in unser Collaboration-Dashboard, laufende Kampagnen, Creator und Clipper. Jeder Code gilt genau einmal. Ohne Code könnt ihr euch trotzdem eintragen, dann schaltet unser Team euren Zugang nach einem Gespräch frei.',
    keys: ['code', 'cooperation', 'zugang', 'freischalten', 'freigabe', 'einladung', 'ohne'],
    on: ['agenturen'],
  },
  {
    id: 'agentur-preis',
    q: 'Wie verdienen wir als Agentur daran?',
    a: 'Ihr verkauft Reichweite an eure Kunden, wir liefern sie zum Richtwert von 5.000 € pro Million Views. Die Differenz zu eurem Kundenpreis ist eure Marge. Konditionen für Partner mit mehreren Kunden besprechen wir persönlich.',
    keys: ['marge', 'verdienen', 'provision', 'weiterverkaufen', 'resell', 'kundenpreis', 'konditionen', 'rabatt'],
    on: ['agenturen'],
  },
  {
    id: 'marktplatz',
    q: 'Was bedeutet Marktplatz bei NIKKI MEDIA?',
    a: 'Auf einer Plattform treffen sich vier Seiten: Unternehmen und Personal Brands, die Kampagnen in Auftrag geben, Agenturen, die ihre Kunden mitbringen, Clipper, die schneiden und posten, und Creator, die Clips über ihre eigenen Accounts verbreiten. Jede Seite hat ihr eigenes Dashboard, NIKKI MEDIA ordnet die Kampagnen zu.',
    keys: ['marktplatz', 'marketplace', 'dashboard', 'seiten', 'vier'],
    on: ['investoren', 'agenturen'],
  },
  {
    id: 'clipper-werden',
    q: 'Wie werde ich Clipper oder Creator?',
    a: 'Über nikkimedia.co/clipper bzw. nikkimedia.co/creator. Nach dem Eintrag bestätigst du deine Adresse per Code und landest in deinem Dashboard. Kampagnen ordnet dir NIKKI MEDIA zu, bezahlt wird nach einer Preisstaffelung pro erreichten Views.',
    keys: ['werden', 'mitmachen', 'job', 'geld', 'nebenjob', 'bewerben', 'verdienst', 'creator', 'ugc'],
    on: ['clipper', 'creator'],
  },
  {
    id: 'investieren',
    q: 'Kann ich in NIKKI MEDIA investieren?',
    a: 'Gespräche mit Investoren führt Jason Azarov persönlich. Trag dich über das Formular auf nikkimedia.co/investoren ein, dann bekommst du einen Termin. Unterlagen gibt es erst nach dem Erstgespräch und einer Vertraulichkeitsvereinbarung.',
    keys: ['investieren', 'investor', 'investoren', 'beteiligung', 'anteile', 'einsteigen', 'kapital', 'finanzierung', 'runde', 'pitch', 'deck', 'bewertung'],
    on: ['investoren'],
  },
  {
    id: 'investor-modell',
    q: 'Womit verdient NIKKI MEDIA Geld?',
    a: 'Mit verkauften Views: Auftraggeber zahlen pro erreichter Reichweite, Clipper und Creator werden leistungsbasiert aus diesem Budget vergütet. Das Netzwerk aus über 5.000 Clippern wächst mit jeder Kampagne, die Plattform mit Login und eigenem Admin-Dashboard dokumentiert jeden Schritt. Zahlen zu Umsatz und Marge besprechen wir im Erstgespräch.',
    keys: ['geschaeftsmodell', 'umsatz', 'marge', 'modell', 'geld', 'verdient', 'skalierung', 'wachstum', 'zahlen'],
    on: ['investoren'],
  },
]

export const faqFor = (audience: FaqAudience): FaqEntry[] => FAQ.filter((f) => f.on.includes(audience))

/* ------------------------------------------------------------- Abgleich */

const STOP = new Set(
  'der die das den dem des ein eine einer eines einem einen und oder aber ich du ihr wir sie es mein meine dein deine euer eure unser unsere ist sind bin bist war wird werden wurde kann koennen konnte muss muessen soll sollen will wollen mit fuer von zu zum zur im in am an auf aus bei nach ueber unter wie was wer wo wann warum welche welcher welches auch noch nur schon sehr mal man mir mich dir dich uns euch ihm ihn ihnen hat habe haben hast gibt gib es ja nein nicht kein keine bitte hallo hi hey danke denn dann so als wenn ob eigentlich genau'
    .split(' '),
)

/** Kleinbuchstaben, Umlaute ausgeschrieben, nur Buchstaben und Ziffern. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')

/** Grobe Stammform: deutsche Endungen ab, damit „Kosten“ und „kostet“ zusammenfinden. */
const stem = (w: string) => (w.length > 5 ? w.replace(/(ungen|ung|en|er|es|et|e|n|s)$/, '') : w)

const tokens = (s: string) =>
  fold(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)

const INDEX = FAQ.map((f) => ({
  entry: f,
  keys: new Set(f.keys.map((k) => stem(fold(k).replace(/ /g, '')))),
  q: new Set(tokens(f.q)),
  a: new Set(tokens(f.a)),
}))

const hit = (set: Set<string>, t: string) => {
  if (set.has(t)) return true
  if (t.length < 5) return false
  for (const s of set) if (s.length >= 5 && (s.startsWith(t) || t.startsWith(s))) return true
  return false
}

export interface FaqMatch {
  entry: FaqEntry
  score: number
}

/** Die passendsten Einträge, bester zuerst. Ohne Treffer: leere Liste. */
export function matchFaq(question: string, limit = 3): FaqMatch[] {
  const qs = tokens(question)
  if (!qs.length) return []
  return INDEX.map((i) => {
    let score = 0
    for (const t of qs) {
      if (hit(i.keys, t)) score += 3
      else if (hit(i.q, t)) score += 2
      else if (hit(i.a, t)) score += 0.5
    }
    return { entry: i.entry, score: score / Math.sqrt(qs.length) }
  })
    .filter((m) => m.score >= 1.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/* ------------------------------------------------------------- Antwort */

export interface AgentAnswer {
  answer: string
  /** Woher die Antwort stammt — `faq` ohne Sprachmodell, `ai` mit. */
  source: 'faq' | 'ai' | 'fallback'
  /** IDs der passenden FAQ-Einträge, damit die Seite sie verlinken kann. */
  related: { id: string; q: string }[]
}

export const AGENT_FALLBACK =
  'Dazu habe ich keine feste Antwort. Trag dich einfach über das Formular ein, Jason meldet sich persönlich bei dir.'

const knowledge = () => FAQ.map((f) => `F: ${f.q}\nA: ${f.a}`).join('\n\n')

/**
 * Mit Sprachmodell, wenn `ANTHROPIC_API_KEY` gesetzt ist — es formuliert
 * frei, darf aber nur, was in der Wissensbasis steht. Ohne Schlüssel oder
 * bei jedem Fehler antwortet der Abgleich oben. Ein Ausfall des Modells
 * darf den Agenten nie stumm machen.
 */
export async function answerQuestion(env: Env, question: string): Promise<AgentAnswer> {
  const matches = matchFaq(question)
  const related = matches.map((m) => ({ id: m.entry.id, q: m.entry.q }))

  if (env.ANTHROPIC_API_KEY) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 9000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.AGENT_MODEL || 'claude-haiku-5-5',
          max_tokens: 350,
          system:
            'Du bist der Assistent von NIKKI MEDIA, einer Clipping-Agentur und einem Marktplatz für Clipper, Creator, Auftraggeber und Agenturen. ' +
            'Antworte auf Deutsch, per Du, in höchstens vier Sätzen, ohne Aufzählungen und ohne Gedankenstriche. ' +
            'Nutze AUSSCHLIESSLICH die Fakten aus der Wissensbasis unten. Erfinde keine Zahlen, Preise, Namen oder Zusagen. ' +
            `Steht die Antwort nicht darin, antworte genau: „${AGENT_FALLBACK}“\n\nWISSENSBASIS\n\n${knowledge()}`,
          messages: [{ role: 'user', content: question }],
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { content?: { type: string; text?: string }[] }
        const text = (data.content ?? [])
          .map((b) => (b.type === 'text' ? b.text ?? '' : ''))
          .join('')
          .trim()
        if (text) return { answer: text, source: 'ai', related }
      } else {
        console.error('[agent] Modell', res.status, (await res.text()).slice(0, 200))
      }
    } catch (err) {
      console.error('[agent] Ausnahme', err)
    } finally {
      clearTimeout(timer)
    }
  }

  if (matches.length) return { answer: matches[0].entry.a, source: 'faq', related: related.slice(1) }
  return { answer: AGENT_FALLBACK, source: 'fallback', related: [] }
}
