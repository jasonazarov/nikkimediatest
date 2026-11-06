/**
 * Rechtstexte. Angepasst an den neuen Stand: Anfrageformular, Nutzerkonten,
 * Session-Cookie, Datei-Uploads nach R2, E-Mail-Versand über Resend.
 * WhatsApp kommt nicht mehr vor.
 */

const shell = (title: string, description: string, body: string) => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Nikki Media</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#000000">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/glass.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='Arial,sans-serif' font-size='15' font-weight='bold' fill='white' text-anchor='middle'%3ENM%3C/text%3E%3C/svg%3E">
</head>
<body>

<header class="nav">
  <div class="wrap nav__inner">
    <a class="logo" href="/">
      <span class="logo__mark" aria-hidden="true">NM</span>
      <span class="logo__text">NIKKI MEDIA<small>Clipping-Agentur</small></span>
    </a>
    <div class="nav__actions">
      <a class="btn btn--ghost btn--sm" href="/">Zurück zur Startseite</a>
    </div>
  </div>
</header>

<main class="section">
  <div class="wrap">
    <div class="legal">
${body}
    </div>
  </div>
</main>

<footer class="footer">
  <div class="wrap">
    <div class="footer__bottom" style="margin-top:0;border-top:0">
      <span>© <span data-year>2026</span> Nikki Media. Alle Rechte vorbehalten.</span>
      <nav aria-label="Rechtliches">
        <a href="/">Startseite</a>
        <a href="/impressum">Impressum</a>
        <a href="/datenschutz">Datenschutz</a>
      </nav>
    </div>
  </div>
</footer>

<script src="/assets/site.js" defer></script>
</body>
</html>`

export const impressumPage = () =>
  shell(
    'Impressum',
    'Impressum und Anbieterkennzeichnung von Nikki Media.',
    `      <h1>Impressum</h1>

      <div class="note">
        <strong>Hinweis für die Redaktion:</strong> Die folgenden Angaben sind Platzhalter.
        Bitte vor dem Livegang durch die vollständigen und rechtsverbindlichen Daten ersetzen
        (Rechtsform, Anschrift, Register- und Umsatzsteuer-Angaben). In Deutschland und
        Österreich besteht Impressumspflicht.
      </div>

      <h2>Angaben gemäß § 5 TMG / § 5 ECG</h2>
      <p>
        Nikki Media<br>
        Inhaber: Jason Azarov<br>
        [Straße und Hausnummer]<br>
        [PLZ und Ort]<br>
        [Land]
      </p>

      <h2>Kontakt</h2>
      <p>
        Telefon: <a href="tel:+436765990071">+43 676 5990071</a><br>
        Anfragen laufen über das <a href="/#stepper">Anfrageformular</a> auf der Startseite.
      </p>

      <h2>Umsatzsteuer-Identifikationsnummer</h2>
      <p>[UID / USt-IdNr. gemäß § 27 a Umsatzsteuergesetz]</p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>Jason Azarov, Anschrift wie oben.</p>

      <h2>Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit:
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener">ec.europa.eu/consumers/odr</a>.
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen,
        die auf eine rechtswidrige Tätigkeit hinweisen.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
        Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
        oder Betreiber der Seiten verantwortlich.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
        dem Urheberrecht. Auf dieser Website eingebundene Instagram-Inhalte sowie genannte Marken-
        und Accountnamen sind Eigentum der jeweiligen Rechteinhaber und werden im Rahmen der
        Referenzdarstellung genannt.
      </p>`,
  )

export const datenschutzPage = () =>
  shell(
    'Datenschutzerklärung',
    'Datenschutzerklärung von Nikki Media: Anfrageformular, Kundenbereich, Datei-Uploads.',
    `      <h1>Datenschutzerklärung</h1>

      <div class="note">
        <strong>Hinweis für die Redaktion:</strong> Diese Erklärung beschreibt den technischen
        Stand dieser Plattform (Anfrageformular, Nutzerkonten mit Login-Code, Datei-Uploads,
        E-Mail-Versand, Instagram-Embeds, Google Fonts). Bitte vor dem Livegang von einer
        fachkundigen Stelle prüfen und um die Verantwortlichen-Daten aus dem Impressum ergänzen.
      </div>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung ist Jason Azarov, Nikki Media.
        Die vollständigen Kontaktdaten findest du im <a href="/impressum">Impressum</a>.
      </p>

      <h2>2. Aufruf dieser Website</h2>
      <p>
        Die Website wird über Cloudflare (Cloudflare, Inc. bzw. Cloudflare Germany GmbH)
        ausgeliefert. Beim Aufruf werden technisch notwendige Daten verarbeitet, die dein
        Browser automatisch übermittelt:
      </p>
      <ul>
        <li>IP-Adresse des anfragenden Geräts</li>
        <li>Datum und Uhrzeit des Zugriffs</li>
        <li>aufgerufene Seite bzw. Datei</li>
        <li>übertragene Datenmenge und Statuscode</li>
        <li>Browsertyp, Betriebssystem und ggf. Referrer</li>
      </ul>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und
        stabilen Betrieb der Website).
      </p>

      <h2>3. Anfrageformular</h2>
      <p>
        Über das Formular auf der Startseite erhebst du selbst: gewünschte Plattformen, Branche,
        Umfang deines Rohmaterials, geplantes Budget sowie Vor- und Nachname, optional die Firma,
        E-Mail-Adresse und Telefonnummer, optional einen Link zu deinem Rohmaterial in einem
        Cloud-Speicher. Diese Angaben verarbeiten wir, um deine Anfrage zu bearbeiten und dir ein
        Angebot zu machen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche
        Maßnahmen).
      </p>
      <p>
        Über das Formular für Clipper (<code>/clipper</code>) erhebst du selbst: Plattformen, mit
        denen du arbeitest, deine aktuelle Tätigkeit, Erfahrung im Video-Schnitt, Verfügbarkeit
        sowie Vor- und Nachname, E-Mail-Adresse und Telefonnummer. Diese Angaben verarbeiten wir,
        um dir einen Zugang einzurichten und dir Aufträge zuzuteilen. Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. b DSGVO.
      </p>
      <p>
        Zur Abwehr automatisierter Einsendungen enthält das Formular ein verstecktes Feld
        („Honeypot“) und wir begrenzen die Zahl der Anfragen pro IP-Adresse. Dabei wird die
        IP-Adresse kurzzeitig in gekürzter Form als Zählmerkmal gespeichert. Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. f DSGVO (Schutz vor Missbrauch).
      </p>

      <h2>4. Kundenbereich und Login</h2>
      <p>
        Mit dem Absenden des Formulars richten wir dir automatisch einen Zugang ein. Der Login
        erfolgt ohne Passwort: Du erhältst per E-Mail einen achtstelligen Code, der 30 Minuten
        gültig ist. Codes speichern wir ausschließlich als Hashwert, niemals im Klartext.
      </p>
      <p>
        Nach erfolgreichem Login setzen wir ein technisch notwendiges Session-Cookie
        (<code>nm_session_…</code> je Bereich, Laufzeit 30 Tage, httpOnly, secure, SameSite=Lax). Es enthält
        ausschließlich eine zufällige Kennung und dient der Anmeldung. Analyse- oder
        Marketing-Cookies setzen wir nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>
      <p>
        Schreibende Aktionen im Kundenbereich protokollieren wir in einem Änderungsprotokoll
        (wer, wann, welche Aktion) zur Nachvollziehbarkeit und Missbrauchsprävention,
        Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h2>5. Datei-Uploads</h2>
      <p>
        Hochgeladene Videos und Bilder speichern wir bei Cloudflare R2. Die Übertragung erfolgt
        direkt aus deinem Browser zum Speicher; Zugriffe darauf laufen über zeitlich begrenzte,
        signierte Links (eine Stunde gültig). Zugriff haben ausschließlich du, die Clipper, die
        an deinem Projekt arbeiten, sowie die Administration von Nikki Media. Gelöschte Dateien liegen
        30 Tage im Papierkorb, bevor sie endgültig entfernt werden.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
      </p>

      <h2>6. E-Mail-Versand</h2>
      <p>
        Für Login-Codes und Benachrichtigungen nutzen wir den Dienst Resend (Resend, Inc.).
        Dabei werden deine E-Mail-Adresse und der Inhalt der jeweiligen Nachricht verarbeitet.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>7. Instagram-Inhalte (Embeds)</h2>
      <p>
        Im Bereich „Case Studies“ binden wir Beiträge und Profile über die offizielle
        Instagram-Einbettungsfunktion ein (Meta Platforms Ireland Limited). Diese Inhalte werden
        in einem iframe geladen, sobald der entsprechende Bereich sichtbar wird. Dabei wird eine
        Verbindung zu Servern von Instagram hergestellt und deine IP-Adresse übermittelt. Bist du
        gleichzeitig bei Instagram eingeloggt, kann Instagram den Besuch deinem Konto zuordnen.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h2>8. Schriftarten (Google Fonts)</h2>
      <p>
        Diese Website lädt die Schriftarten „DM Sans“ und „Inter“ über Google Fonts
        (Google Ireland Limited). Beim Laden wird eine Verbindung zu Google-Servern aufgebaut
        und deine IP-Adresse übertragen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse an einer einheitlichen Darstellung).
      </p>

      <h2>9. Speicherdauer</h2>
      <p>
        Anfragedaten bewahren wir bis zum Abschluss der Bearbeitung und darüber hinaus im Rahmen
        gesetzlicher Aufbewahrungsfristen auf. Login-Codes verfallen nach 30 Minuten, Sitzungen
        nach 30 Tagen. Kommt kein Vertrag zustande, löschen wir die Anfragedaten spätestens nach
        24 Monaten.
      </p>

      <h2>10. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung
        (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit
        (Art. 20 DSGVO) sowie ein Widerspruchsrecht (Art. 21 DSGVO). Außerdem steht dir ein
        Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu.
      </p>

      <h2>11. Änderungen</h2>
      <p>
        Wir passen diese Datenschutzerklärung an, sobald sich die technische Umsetzung der
        Plattform oder die rechtlichen Rahmenbedingungen ändern.
      </p>`,
  )
