/* ==========================================================================
   TELEFONNUMMERN — Vorwahl und Nummer, getrennt erfasst

   Warum das eine eigene Datei ist: Die Nummer eines Leads wird an vier
   Stellen erfasst oder berichtigt (Stepper, Lead, Kunde, Clipper) und an
   ebenso vielen Stellen angezeigt. Ohne gemeinsame Regel steht am Ende in
   der Datenbank „0676 5990071“ neben „+43 676 5990071“ neben
   „0043 676/5990071“ — und der Anrufknopf im Admin-Bereich führt bei zwei
   von dreien ins Leere, weil eine Nummer ohne Ländervorwahl vom Handy des
   Anrufers aus gar nicht erreichbar ist.

   Deshalb gilt hier genau EIN gespeichertes Format:

       +<Ländervorwahl> <Nummer ohne führende Null>      z. B. "+43 6765990071"

   Die führende Null ist eine INLÄNDISCHE Verkehrsausscheidungsziffer. Wer
   „+43 0676…“ wählt, erreicht niemanden. Sie fällt deshalb beim Zusammensetzen
   weg — genau dort, wo der Nutzer sie am ehesten mit eintippt.
   ========================================================================== */

/** [ISO-Code, Vorwahl, deutscher Name, englischer Name] */
export type Country = readonly [iso: string, dial: string, de: string, en: string]

/** Vorbelegung des Auswahlfelds. DACH ist der Markt, Deutschland der größte Teil. */
export const DEFAULT_DIAL = '+49'

/**
 * Alle Länder mit ihrer internationalen Vorwahl.
 *
 * Deutschland, Österreich und die Schweiz stehen vorne — sie machen den
 * Großteil der Anfragen aus, und wer sie in einer alphabetischen Liste von
 * knapp 200 Einträgen suchen muss, scrollt bei jedem Formular. Der Rest folgt
 * alphabetisch nach dem deutschen Namen.
 */
export const COUNTRIES: readonly Country[] = [
  ['DE', '+49', 'Deutschland', 'Germany'],
  ['AT', '+43', 'Österreich', 'Austria'],
  ['CH', '+41', 'Schweiz', 'Switzerland'],
  ['AF', '+93', 'Afghanistan', 'Afghanistan'],
  ['EG', '+20', 'Ägypten', 'Egypt'],
  ['AL', '+355', 'Albanien', 'Albania'],
  ['DZ', '+213', 'Algerien', 'Algeria'],
  ['AD', '+376', 'Andorra', 'Andorra'],
  ['AO', '+244', 'Angola', 'Angola'],
  ['AG', '+1268', 'Antigua und Barbuda', 'Antigua & Barbuda'],
  ['GQ', '+240', 'Äquatorialguinea', 'Equatorial Guinea'],
  ['AR', '+54', 'Argentinien', 'Argentina'],
  ['AM', '+374', 'Armenien', 'Armenia'],
  ['AW', '+297', 'Aruba', 'Aruba'],
  ['AZ', '+994', 'Aserbaidschan', 'Azerbaijan'],
  ['ET', '+251', 'Äthiopien', 'Ethiopia'],
  ['AU', '+61', 'Australien', 'Australia'],
  ['BS', '+1242', 'Bahamas', 'Bahamas'],
  ['BH', '+973', 'Bahrain', 'Bahrain'],
  ['BD', '+880', 'Bangladesch', 'Bangladesh'],
  ['BB', '+1246', 'Barbados', 'Barbados'],
  ['BY', '+375', 'Belarus', 'Belarus'],
  ['BE', '+32', 'Belgien', 'Belgium'],
  ['BZ', '+501', 'Belize', 'Belize'],
  ['BJ', '+229', 'Benin', 'Benin'],
  ['BM', '+1441', 'Bermuda', 'Bermuda'],
  ['BT', '+975', 'Bhutan', 'Bhutan'],
  ['BO', '+591', 'Bolivien', 'Bolivia'],
  ['BA', '+387', 'Bosnien und Herzegowina', 'Bosnia & Herzegovina'],
  ['BW', '+267', 'Botsuana', 'Botswana'],
  ['BR', '+55', 'Brasilien', 'Brazil'],
  ['BN', '+673', 'Brunei Darussalam', 'Brunei'],
  ['BG', '+359', 'Bulgarien', 'Bulgaria'],
  ['BF', '+226', 'Burkina Faso', 'Burkina Faso'],
  ['BI', '+257', 'Burundi', 'Burundi'],
  ['CV', '+238', 'Cabo Verde', 'Cape Verde'],
  ['CL', '+56', 'Chile', 'Chile'],
  ['CN', '+86', 'China', 'China'],
  ['CR', '+506', 'Costa Rica', 'Costa Rica'],
  ['CI', '+225', 'Côte d’Ivoire', 'Côte d’Ivoire'],
  ['CW', '+599', 'Curaçao', 'Curaçao'],
  ['DK', '+45', 'Dänemark', 'Denmark'],
  ['DM', '+1767', 'Dominica', 'Dominica'],
  ['DO', '+1809', 'Dominikanische Republik', 'Dominican Republic'],
  ['DJ', '+253', 'Dschibuti', 'Djibouti'],
  ['EC', '+593', 'Ecuador', 'Ecuador'],
  ['SV', '+503', 'El Salvador', 'El Salvador'],
  ['ER', '+291', 'Eritrea', 'Eritrea'],
  ['EE', '+372', 'Estland', 'Estonia'],
  ['SZ', '+268', 'Eswatini', 'Eswatini'],
  ['FJ', '+679', 'Fidschi', 'Fiji'],
  ['FI', '+358', 'Finnland', 'Finland'],
  ['FR', '+33', 'Frankreich', 'France'],
  ['GA', '+241', 'Gabun', 'Gabon'],
  ['GM', '+220', 'Gambia', 'Gambia'],
  ['GE', '+995', 'Georgien', 'Georgia'],
  ['GH', '+233', 'Ghana', 'Ghana'],
  ['GI', '+350', 'Gibraltar', 'Gibraltar'],
  ['GD', '+1473', 'Grenada', 'Grenada'],
  ['GR', '+30', 'Griechenland', 'Greece'],
  ['GL', '+299', 'Grönland', 'Greenland'],
  ['GT', '+502', 'Guatemala', 'Guatemala'],
  ['GN', '+224', 'Guinea', 'Guinea'],
  ['GW', '+245', 'Guinea-Bissau', 'Guinea-Bissau'],
  ['GY', '+592', 'Guyana', 'Guyana'],
  ['HT', '+509', 'Haiti', 'Haiti'],
  ['HN', '+504', 'Honduras', 'Honduras'],
  ['IN', '+91', 'Indien', 'India'],
  ['ID', '+62', 'Indonesien', 'Indonesia'],
  ['IQ', '+964', 'Irak', 'Iraq'],
  ['IR', '+98', 'Iran', 'Iran'],
  ['IE', '+353', 'Irland', 'Ireland'],
  ['IS', '+354', 'Island', 'Iceland'],
  ['IL', '+972', 'Israel', 'Israel'],
  ['IT', '+39', 'Italien', 'Italy'],
  ['JM', '+1876', 'Jamaika', 'Jamaica'],
  ['JP', '+81', 'Japan', 'Japan'],
  ['YE', '+967', 'Jemen', 'Yemen'],
  ['JO', '+962', 'Jordanien', 'Jordan'],
  ['KY', '+1345', 'Kaimaninseln', 'Cayman Islands'],
  ['KH', '+855', 'Kambodscha', 'Cambodia'],
  ['CM', '+237', 'Kamerun', 'Cameroon'],
  ['CA', '+1', 'Kanada', 'Canada'],
  ['KZ', '+7', 'Kasachstan', 'Kazakhstan'],
  ['QA', '+974', 'Katar', 'Qatar'],
  ['KE', '+254', 'Kenia', 'Kenya'],
  ['KG', '+996', 'Kirgisistan', 'Kyrgyzstan'],
  ['CO', '+57', 'Kolumbien', 'Colombia'],
  ['KM', '+269', 'Komoren', 'Comoros'],
  ['CG', '+242', 'Kongo-Brazzaville', 'Congo - Brazzaville'],
  ['CD', '+243', 'Kongo-Kinshasa', 'Congo - Kinshasa'],
  ['HR', '+385', 'Kroatien', 'Croatia'],
  ['CU', '+53', 'Kuba', 'Cuba'],
  ['KW', '+965', 'Kuwait', 'Kuwait'],
  ['LA', '+856', 'Laos', 'Laos'],
  ['LS', '+266', 'Lesotho', 'Lesotho'],
  ['LV', '+371', 'Lettland', 'Latvia'],
  ['LB', '+961', 'Libanon', 'Lebanon'],
  ['LR', '+231', 'Liberia', 'Liberia'],
  ['LY', '+218', 'Libyen', 'Libya'],
  ['LI', '+423', 'Liechtenstein', 'Liechtenstein'],
  ['LT', '+370', 'Litauen', 'Lithuania'],
  ['LU', '+352', 'Luxemburg', 'Luxembourg'],
  ['MG', '+261', 'Madagaskar', 'Madagascar'],
  ['MW', '+265', 'Malawi', 'Malawi'],
  ['MY', '+60', 'Malaysia', 'Malaysia'],
  ['MV', '+960', 'Malediven', 'Maldives'],
  ['ML', '+223', 'Mali', 'Mali'],
  ['MT', '+356', 'Malta', 'Malta'],
  ['MA', '+212', 'Marokko', 'Morocco'],
  ['MR', '+222', 'Mauretanien', 'Mauritania'],
  ['MU', '+230', 'Mauritius', 'Mauritius'],
  ['MX', '+52', 'Mexiko', 'Mexico'],
  ['MC', '+377', 'Monaco', 'Monaco'],
  ['MN', '+976', 'Mongolei', 'Mongolia'],
  ['ME', '+382', 'Montenegro', 'Montenegro'],
  ['MZ', '+258', 'Mosambik', 'Mozambique'],
  ['MM', '+95', 'Myanmar', 'Myanmar (Burma)'],
  ['NA', '+264', 'Namibia', 'Namibia'],
  ['NP', '+977', 'Nepal', 'Nepal'],
  ['NZ', '+64', 'Neuseeland', 'New Zealand'],
  ['NI', '+505', 'Nicaragua', 'Nicaragua'],
  ['NL', '+31', 'Niederlande', 'Netherlands'],
  ['NE', '+227', 'Niger', 'Niger'],
  ['NG', '+234', 'Nigeria', 'Nigeria'],
  ['MK', '+389', 'Nordmazedonien', 'North Macedonia'],
  ['NO', '+47', 'Norwegen', 'Norway'],
  ['OM', '+968', 'Oman', 'Oman'],
  ['PK', '+92', 'Pakistan', 'Pakistan'],
  ['PS', '+970', 'Palästinensische Autonomiegebiete', 'Palestinian Territories'],
  ['PA', '+507', 'Panama', 'Panama'],
  ['PG', '+675', 'Papua-Neuguinea', 'Papua New Guinea'],
  ['PY', '+595', 'Paraguay', 'Paraguay'],
  ['PE', '+51', 'Peru', 'Peru'],
  ['PH', '+63', 'Philippinen', 'Philippines'],
  ['PL', '+48', 'Polen', 'Poland'],
  ['PT', '+351', 'Portugal', 'Portugal'],
  ['PR', '+1787', 'Puerto Rico', 'Puerto Rico'],
  ['MD', '+373', 'Republik Moldau', 'Moldova'],
  ['RW', '+250', 'Ruanda', 'Rwanda'],
  ['RO', '+40', 'Rumänien', 'Romania'],
  ['RU', '+7', 'Russland', 'Russia'],
  ['ZM', '+260', 'Sambia', 'Zambia'],
  ['WS', '+685', 'Samoa', 'Samoa'],
  ['SM', '+378', 'San Marino', 'San Marino'],
  ['SA', '+966', 'Saudi-Arabien', 'Saudi Arabia'],
  ['SE', '+46', 'Schweden', 'Sweden'],
  ['SN', '+221', 'Senegal', 'Senegal'],
  ['RS', '+381', 'Serbien', 'Serbia'],
  ['SC', '+248', 'Seychellen', 'Seychelles'],
  ['SL', '+232', 'Sierra Leone', 'Sierra Leone'],
  ['ZW', '+263', 'Simbabwe', 'Zimbabwe'],
  ['SG', '+65', 'Singapur', 'Singapore'],
  ['SK', '+421', 'Slowakei', 'Slovakia'],
  ['SI', '+386', 'Slowenien', 'Slovenia'],
  ['SO', '+252', 'Somalia', 'Somalia'],
  ['HK', '+852', 'Sonderverwaltungsregion Hongkong', 'Hong Kong SAR China'],
  ['MO', '+853', 'Sonderverwaltungsregion Macau', 'Macao SAR China'],
  ['ES', '+34', 'Spanien', 'Spain'],
  ['LK', '+94', 'Sri Lanka', 'Sri Lanka'],
  ['KN', '+1869', 'St. Kitts und Nevis', 'St. Kitts & Nevis'],
  ['LC', '+1758', 'St. Lucia', 'St. Lucia'],
  ['VC', '+1784', 'St. Vincent und die Grenadinen', 'St. Vincent & Grenadines'],
  ['ZA', '+27', 'Südafrika', 'South Africa'],
  ['SD', '+249', 'Sudan', 'Sudan'],
  ['KR', '+82', 'Südkorea', 'South Korea'],
  ['SS', '+211', 'Südsudan', 'South Sudan'],
  ['SR', '+597', 'Suriname', 'Suriname'],
  ['SY', '+963', 'Syrien', 'Syria'],
  ['TJ', '+992', 'Tadschikistan', 'Tajikistan'],
  ['TW', '+886', 'Taiwan', 'Taiwan'],
  ['TZ', '+255', 'Tansania', 'Tanzania'],
  ['TH', '+66', 'Thailand', 'Thailand'],
  ['TG', '+228', 'Togo', 'Togo'],
  ['TO', '+676', 'Tonga', 'Tonga'],
  ['TT', '+1868', 'Trinidad und Tobago', 'Trinidad & Tobago'],
  ['TD', '+235', 'Tschad', 'Chad'],
  ['CZ', '+420', 'Tschechien', 'Czechia'],
  ['TN', '+216', 'Tunesien', 'Tunisia'],
  ['TR', '+90', 'Türkei', 'Türkiye'],
  ['TM', '+993', 'Turkmenistan', 'Turkmenistan'],
  ['UG', '+256', 'Uganda', 'Uganda'],
  ['UA', '+380', 'Ukraine', 'Ukraine'],
  ['HU', '+36', 'Ungarn', 'Hungary'],
  ['UY', '+598', 'Uruguay', 'Uruguay'],
  ['UZ', '+998', 'Usbekistan', 'Uzbekistan'],
  ['VE', '+58', 'Venezuela', 'Venezuela'],
  ['AE', '+971', 'Vereinigte Arabische Emirate', 'United Arab Emirates'],
  ['US', '+1', 'Vereinigte Staaten', 'United States'],
  ['GB', '+44', 'Vereinigtes Königreich', 'United Kingdom'],
  ['VN', '+84', 'Vietnam', 'Vietnam'],
  ['CF', '+236', 'Zentralafrikanische Republik', 'Central African Republic'],
  ['CY', '+357', 'Zypern', 'Cyprus'],
]

/**
 * Flagge aus dem ISO-Code: zwei Regional Indicator Symbols.
 *
 * Berechnet statt eingetippt — 193 Emoji im Quelltext sind 193 Gelegenheiten
 * für einen falsch kopierten Codepoint, und die Rechnung ist eine Zeile.
 */
export const flagOf = (iso: string): string =>
  String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))

/** Nur Ziffern. */
const digitsOf = (value: string) => value.replace(/\D/g, '')

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Die Vorwahlen, nach Länge absteigend — Grundlage jeder Zerlegung.
 *
 * Die Reihenfolge ist der ganze Trick: „+1268“ (Antigua) muss vor „+1“ (USA)
 * geprüft werden, sonst landet jede karibische Nummer bei den Vereinigten
 * Staaten. Innerhalb des nordamerikanischen Nummernraums sind diese Codes
 * echte Vorwahlen, die es in den USA kein zweites Mal gibt — die längste
 * Übereinstimmung ist deshalb immer die richtige.
 */
const DIALS_BY_LENGTH: readonly string[] = [...new Set(COUNTRIES.map((c) => c[1]))].sort(
  (a, b) => b.length - a.length,
)

const KNOWN_DIALS = new Set(DIALS_BY_LENGTH)

/** Ist das eine Vorwahl, die es wirklich gibt? */
export const isKnownDial = (dial: string): boolean => KNOWN_DIALS.has(dial.trim())

/**
 * Vorwahl und Nummer zu einer speicherbaren Nummer zusammensetzen.
 *
 * Gutmütig gegenüber dem, was Menschen tippen: Wer die komplette Nummer mit
 * „+“ oder „00“ ins zweite Feld schreibt, bekommt sie so übernommen — dann
 * trägt sie ihre Vorwahl schon selbst, und die aus dem Auswahlfeld wäre
 * doppelt.
 */
export function composePhone(dial: string | null | undefined, national: string | null | undefined): string {
  const raw = String(national ?? '').trim()

  // Komplette internationale Nummer im Nummernfeld — Auswahlfeld ignorieren.
  if (/^(\+|00)\d/.test(raw)) {
    const digits = digitsOf(raw.replace(/^00/, ''))
    return digits ? `+${digits}` : ''
  }

  const code = normalizeDial(dial)

  /*
   * Ohne Vorwahl wird keine erfunden.
   *
   * Aus „0170…" ein „+170…" zu machen wäre eine Nummer, die es nirgends
   * gibt — schlimmer als gar keine, weil sie wählbar AUSSIEHT. Die Ziffern
   * bleiben deshalb, wie sie sind; die Prüfung am Formular weist sie ab, und
   * ein Altbestand ohne Vorwahl bleibt unverändert stehen, bis ihn jemand
   * berichtigt.
   */
  if (!code) return digitsOf(raw)

  return raw ? `${code} ${digitsOf(raw).replace(/^0+/, '')}`.trim() : ''
}

/** „49“, „+49 “, „0049“ → „+49“. Unbrauchbares → leerer String. */
export function normalizeDial(dial: string | null | undefined): string {
  const digits = digitsOf(String(dial ?? '').replace(/^00/, ''))
  return digits ? `+${digits}` : ''
}

/**
 * Eine gespeicherte Nummer wieder in Vorwahl und Nummer zerlegen —
 * für jedes Formular, das sie zum Berichtigen anzeigt.
 *
 * Nummern aus der Zeit vor dieser Trennung tragen keine Ländervorwahl. Sie
 * kommen als Nummer ohne Vorwahl zurück; das Auswahlfeld steht dann auf der
 * Vorbelegung, und der Administrator sieht auf einen Blick, dass hier noch
 * etwas fehlt.
 */
export function splitPhone(phone: string | null | undefined): { dial: string; national: string } {
  const raw = String(phone ?? '').trim()
  if (!raw) return { dial: '', national: '' }

  const international = /^(\+|00)/.test(raw)
  const digits = digitsOf(raw.replace(/^00/, ''))
  if (!international || !digits) return { dial: '', national: digitsOf(raw) }

  for (const dial of DIALS_BY_LENGTH) {
    const code = dial.slice(1)
    if (digits.startsWith(code)) return { dial, national: digits.slice(code.length) }
  }
  return { dial: '', national: digits }
}

/**
 * Der Wert für einen `tel:`-Link — Ziffern und ein führendes Plus, sonst
 * nichts. Leerzeichen und Bindestriche verträgt nicht jedes Telefonprogramm.
 */
export function telHref(phone: string | null | undefined): string {
  const raw = String(phone ?? '').trim()
  if (!raw) return ''
  const digits = digitsOf(raw.replace(/^00/, ''))
  if (!digits) return ''
  return /^(\+|00)/.test(raw) ? `+${digits}` : digits
}

/**
 * Lesbare Fassung für die Anzeige: „+43 6765990071“.
 * Fehlt die Ländervorwahl, wird nichts erfunden — die Nummer steht, wie sie
 * gespeichert ist.
 */
export function formatPhone(phone: string | null | undefined): string {
  const raw = String(phone ?? '').trim()
  if (!raw) return ''
  const { dial, national } = splitPhone(raw)
  return dial ? `${dial} ${national}` : raw
}

/** Genug Ziffern, um eine Nummer sein zu können? */
export const hasEnoughDigits = (phone: string | null | undefined): boolean =>
  digitsOf(String(phone ?? '')).length >= 6

/**
 * Die `<option>`-Liste für das Vorwahl-Auswahlfeld.
 *
 * Der WERT ist immer die Vorwahl, nicht das Land: gespeichert wird „+43“,
 * und zwei Länder mit derselben Vorwahl (Russland und Kasachstan teilen sich
 * „+7“) sind für den Anruf dieselbe Sache.
 */
export function dialOptions(selected: string | null | undefined, lang: 'de' | 'en' = 'de'): string {
  const current = normalizeDial(selected)
  let used = false

  /*
   * Keine stille Vorbelegung, wenn keine Vorwahl gespeichert ist.
   *
   * Das ist kein Schönheitsfehler, sondern der gefährlichste Fall überhaupt:
   * Nummern aus der Zeit vor dieser Trennung tragen keine Ländervorwahl.
   * Stünde das Feld dann auf „+49", würde ein Administrator, der nur den
   * Namen berichtigt und speichert, einer österreichischen Nummer eine
   * deutsche Vorwahl verpassen — und die Nummer wäre kaputt, ohne dass es
   * jemand merkt. Der Platzhalter zwingt zu einer Entscheidung; wird keine
   * getroffen, bleibt die Nummer unverändert (siehe `composePhone`).
   */
  const placeholder = current
    ? ''
    : `<option value="" selected>${lang === 'en' ? 'country code' : 'Vorwahl wählen'}</option>`

  const options = COUNTRIES.map(([iso, dial, de, en]) => {
    // Nur der ERSTE Eintrag einer Vorwahl darf vorausgewählt sein, sonst
    // stünde die Auswahl je nach Browser auf einem anderen Land derselben Nummer.
    const on = !used && dial === current
    if (on) used = true
    /*
     * Reihenfolge im Eintrag: Flagge, Vorwahl, Land.
     *
     * Zusammengeklappt zeigt ein Auswahlfeld nur seinen Anfang, und das Feld
     * ist schmal. Stünde das Land vorn, wäre dort „🇩🇪 Deutschl…" zu lesen und
     * die Vorwahl — das Einzige, worauf es beim Anrufen ankommt — abgeschnitten.
     */
    return `<option value="${dial}"${on ? ' selected' : ''}>${flagOf(iso)} ${dial} ${escapeText(
      lang === 'en' ? en : de,
    )}</option>`
  }).join('')

  /*
   * Eine Vorwahl, die in der Liste nicht vorkommt (alter Datenbestand, Tippfehler
   * in einer früheren Erfassung), bekommt einen eigenen Eintrag. Ohne ihn würde
   * das Auswahlfeld beim Öffnen des Formulars stillschweigend auf Deutschland
   * springen und die Nummer beim Speichern verfälschen.
   */
  const orphan =
    current && !KNOWN_DIALS.has(current)
      ? `<option value="${escapeText(current)}" selected>${escapeText(current)}</option>`
      : ''

  return placeholder + orphan + options
}
