/**
 * Die Fragen des Steppers auf /terminbuchung/ und ihre Antworten.
 *
 * EINE Quelle für drei Stellen: das Formular (views/stepper.ts), die Prüfung
 * auf dem Server (routes/leads.ts) und die Anzeige im CRM (views/admin.ts).
 * Wer eine Antwort ergänzt oder umbenennt, ändert sie nur hier.
 *
 * Wortlaut der vier Fragen wie auf marinabetke.de/terminbuchung/.
 */

export interface Antwort {
  value: string
  label: string
  /** Zusatzzeile unter der Antwort */
  small?: string
  /** Kurzform im CRM */
  crm?: string
  /** Diese Antwort beendet den Stepper mit einem eigenen Abschluss (kein Lead). */
  exit?: 'krise' | 'budget'
}

export const KRISE: Antwort[] = [
  { value: 'nein', label: 'Nein' },
  { value: 'ja', label: 'Ja', exit: 'krise' },
]

export const SITUATION: Antwort[] = [
  { value: 'beziehung', label: 'Noch in der Beziehung und es zieht mich runter', crm: 'Noch in der Beziehung' },
  { value: 'getrennt', label: 'Getrennt und komme nicht los', crm: 'Getrennt, kommt nicht los' },
  { value: 'onoff', label: 'Mal zusammen, mal getrennt', crm: 'Mal zusammen, mal getrennt' },
  { value: 'anderes', label: 'Ein anderes Thema', small: 'Gedankenkarussell, Selbstwert, Einsamkeit', crm: 'Anderes Thema' },
]

export const START: Antwort[] = [
  { value: 'sofort', label: 'So schnell wie möglich', crm: 'Sofort' },
  { value: 'wochen', label: 'In den nächsten Wochen', crm: 'In den nächsten Wochen' },
  { value: 'informieren', label: 'Ich will mich erst mal informieren', crm: 'Erst informieren' },
]

export const BUDGET: Antwort[] = [
  { value: 'ja', label: 'Ja', crm: 'Passt' },
  { value: 'raten', label: 'Ja, mit Ratenzahlung', crm: 'Passt mit Raten' },
  { value: 'nein', label: 'Nein, aktuell nicht', exit: 'budget' },
]

/** Ersetzt die Kalenderwahl der alten Seite: Marina meldet sich per WhatsApp. */
export const ERREICHBAR: Antwort[] = [
  { value: 'vormittags', label: 'Vormittags', small: '9 bis 12 Uhr' },
  { value: 'nachmittags', label: 'Nachmittags', small: '12 bis 17 Uhr' },
  { value: 'abends', label: 'Abends', small: 'ab 17 Uhr' },
  { value: 'egal', label: 'Ist mir egal', small: 'Hauptsache bald' },
]

export const WOHER: Antwort[] = [
  { value: 'instagram', label: 'Instagram-Video' },
  { value: 'anzeige', label: 'Anzeige' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'empfehlung', label: 'Empfehlung' },
  { value: 'anderes', label: 'Anderes' },
]

/** Ein Satz aus der Welt der Person, bevor die Frage nach dem Zeitpunkt kommt. */
export const INTEL: Record<string, string> = {
  beziehung: 'Noch drin und es zieht dich runter: Das ist der Fall, in dem Verstehen am wenigsten hilft, weil jeder Tag neues Material liefert.',
  getrennt: 'Getrennt und kommst nicht los: Das ist der Fall, bei dem der Kopf fertig ist und der Körper nicht. Ich nenne das den Nachhall, und genau da setze ich an.',
  onoff: 'Mal zusammen, mal getrennt: Das ist das Muster mit dem stärksten Sog. Nicht, weil du schwach bist, sondern weil es so gebaut ist.',
  anderes: 'Gedankenkarussell, Selbstwert, Einsamkeit: Auch dafür ist das Gespräch da. Ich sage dir offen, ob mein Rahmen passt.',
}

export const PREISE = [
  { name: 'Hypnose-Startprozess', detail: '2 Sitzungen', preis: '2.184,00 €' },
  { name: 'Endlich Loslassen', detail: '4 Sitzungen, 4 bis 6 Wochen', preis: '3.840,00 €' },
  { name: 'Zurück zu Dir', detail: '6 Sitzungen, 8 bis 12 Wochen', preis: '6.180,00 €' },
]

/** Ländervorwahlen wie auf der alten Terminseite. */
export const VORWAHLEN: [string, string][] = [
  ['49', '🇩🇪 +49 Deutschland'], ['43', '🇦🇹 +43 Österreich'], ['41', '🇨🇭 +41 Schweiz'],
  ['423', '🇱🇮 +423 Liechtenstein'], ['352', '🇱🇺 +352 Luxemburg'], ['39', '🇮🇹 +39 Italien'],
  ['31', '🇳🇱 +31 Niederlande'], ['32', '🇧🇪 +32 Belgien'], ['33', '🇫🇷 +33 Frankreich'],
  ['34', '🇪🇸 +34 Spanien'], ['351', '🇵🇹 +351 Portugal'], ['45', '🇩🇰 +45 Dänemark'],
  ['46', '🇸🇪 +46 Schweden'], ['47', '🇳🇴 +47 Norwegen'], ['48', '🇵🇱 +48 Polen'],
  ['420', '🇨🇿 +420 Tschechien'], ['36', '🇭🇺 +36 Ungarn'], ['40', '🇷🇴 +40 Rumänien'],
  ['385', '🇭🇷 +385 Kroatien'], ['30', '🇬🇷 +30 Griechenland'], ['90', '🇹🇷 +90 Türkei'],
  ['44', '🇬🇧 +44 Großbritannien'], ['353', '🇮🇪 +353 Irland'], ['1', '🇺🇸 +1 USA/Kanada'],
  ['52', '🇲🇽 +52 Mexiko'], ['55', '🇧🇷 +55 Brasilien'], ['971', '🇦🇪 +971 VAE'],
  ['66', '🇹🇭 +66 Thailand'], ['61', '🇦🇺 +61 Australien'], ['27', '🇿🇦 +27 Südafrika'],
]

/** Version des Einwilligungstextes; steht an jedem Lead. Bei Textänderung hochzählen. */
export const EINWILLIGUNG_VERSION = '2026-11-11'

export const WA_NUMMER = '491776661503'
export const KONTAKT_MAIL = 'hypnose@marinabetke.de'

/** Status im CRM, in Reihenfolge der Pipeline. */
export const STATUS = [
  { value: 'neu', label: 'Neu' },
  { value: 'kontaktiert', label: 'Kontaktiert' },
  { value: 'termin', label: 'Termin vereinbart' },
  { value: 'klient', label: 'Klient' },
  { value: 'verloren', label: 'Kein Interesse' },
] as const

export type Status = (typeof STATUS)[number]['value']

export const isStatus = (v: unknown): v is Status => STATUS.some((s) => s.value === v)

/** Erlaubter Wert einer Liste, sonst null. Antworten mit Ausgang zählen nicht als Lead. */
export function pick(list: Antwort[], v: unknown): string | null {
  const a = list.find((x) => x.value === v)
  return a && !a.exit ? a.value : null
}

/** Anzeige im CRM: Kurzform, sonst Antworttext, sonst der rohe Wert. */
export function label(list: Antwort[] | readonly { value: string; label: string }[], v: string | null | undefined): string {
  if (!v) return '–'
  const a = (list as Antwort[]).find((x) => x.value === v)
  return a ? a.crm ?? a.label : v
}
