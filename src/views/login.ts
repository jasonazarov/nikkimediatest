import { esc, type Lang } from './layout'

interface LoginOptions {
  /**
   * 'email'    = Adresse eingeben (Kunden, Clipper, Admin)
   * 'code'     = achtstelligen Code eingeben
   * 'passwort' = Admin-Login mit Passwort, eigene Seite /login/admin
   * 'demo'     = Demo-Konten (Agentur, Creator, Clipper) mit Passwort, /login/demo (deutsch)
   */
  stage: 'email' | 'code' | 'passwort' | 'demo'
  email?: string
  error?: string
  notice?: string
  next?: string
  /**
   * Sprache der Seite. Englisch ist nur noch der Passwort-Login der
   * Administration; Kunden, Clipper und Creator melden sich auf Deutsch an.
   */
  lang?: Lang
}

/** Alle sichtbaren Texte der Anmeldeseite, je Sprache einmal. */
const TEXT = {
  de: {
    title: 'Login',
    headEmail: 'Einloggen',
    headCode: 'Code eingeben',
    headAdmin: 'Administration',
    subEmail: 'Gib deine E-Mail-Adresse ein, der Rest kommt per Mail.',
    subCode: 'Trage den Code aus der E-Mail ein.',
    subAdmin: 'Anmeldung mit Passwort. Nur für das Admin-Konto.',
    labelEmail: 'E-Mail-Adresse',
    labelCode: 'Dein achtstelliger Code',
    labelPassword: 'Passwort',
    requestCode: 'Code anfordern',
    signIn: 'Einloggen',
    noPassword: 'Wir schicken dir einen achtstelligen Code per E-Mail. Ein Passwort brauchst du nicht.',
    sentTo: (mail: string) => `Gesendet an <strong>${esc(mail)}</strong> · 30 Minuten gültig`,
    newCode: 'Neuen Code anfordern',
    insteadCode: 'Stattdessen Code per E-Mail',
    footer: 'Noch kein Zugang?',
    footerLink: 'Videos hochladen',
    footerHref: '/#stepper',
  },
  en: {
    title: 'Login',
    headEmail: 'Log in',
    headCode: 'Enter your code',
    headAdmin: 'Administration',
    subEmail: 'Enter your email address, the rest arrives by mail.',
    subCode: 'Enter the code from the email.',
    subAdmin: 'Sign in with a password. Admin account only.',
    labelEmail: 'Email address',
    labelCode: 'Your eight-digit code',
    labelPassword: 'Password',
    requestCode: 'Send me a code',
    signIn: 'Log in',
    noPassword: 'We will email you an eight-digit code. You never need a password.',
    sentTo: (mail: string) => `Sent to <strong>${esc(mail)}</strong> · valid for 30 minutes`,
    newCode: 'Request a new code',
    insteadCode: 'Use an email code instead',
    footer: 'No access yet?',
    footerLink: 'Become a clipper',
    footerHref: '/clipper',
  },
} as const

/**
 * Der reguläre Login läuft für Kunden und Clipper gleich und ohne Passwort:
 * E-Mail eingeben, achtstelligen Code aus der Mail eintragen.
 *
 * Davon getrennt liegt der Passwort-Login für das Admin-Konto — erreichbar
 * unter /login/admin und direkt unter /admin.
 */
export function loginPage(o: LoginOptions): string {
  const lang: Lang = o.lang ?? 'de'
  const t = TEXT[lang]

  const nextField = o.next ? `<input type="hidden" name="next" value="${esc(o.next)}">` : ''
  // Die Sprache muss über den Formularversand hinweg erhalten bleiben.
  const langField = lang === 'en' ? `<input type="hidden" name="lang" value="en">` : ''
  const langQuery = lang === 'en' ? 'lang=en&' : ''

  const form =
    o.stage === 'email'
      ? `
        <form method="post" action="/login" class="space-y-4">
          ${nextField}${langField}
          <div>
            <label for="email" class="mb-1.5 block text-sm font-semibold text-slate-600">${esc(
              t.labelEmail,
            )}</label>
            <input id="email" name="email" type="email" required autofocus autocomplete="email" inputmode="email"
                   value="${esc(o.email ?? '')}" placeholder="${lang === 'en' ? 'you@studio.com' : 'du@firma.de'}"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <button class="w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-2">
            ${esc(t.requestCode)}
          </button>
          <p class="text-center text-xs text-slate-500">${esc(t.noPassword)}</p>
        </form>`
      : o.stage === 'code'
      ? `
        <form method="post" action="/login/code" class="space-y-4">
          ${nextField}${langField}
          <input type="hidden" name="email" value="${esc(o.email ?? '')}">
          <div>
            <label for="code" class="mb-1.5 block text-sm font-semibold text-slate-600">${esc(
              t.labelCode,
            )}</label>
            <input id="code" name="code" type="text" required autofocus inputmode="numeric"
                   maxlength="11" autocomplete="one-time-code" placeholder="12345678" pattern="[0-9 -]*"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[.35em] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <button class="w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-2">
            ${esc(t.signIn)}
          </button>
          <p class="text-center text-xs text-slate-500">${t.sentTo(o.email ?? '')}</p>
          <p class="text-center text-xs">
            <a href="/login?${langQuery}email=${encodeURIComponent(
              o.email ?? '',
            )}" class="font-semibold text-brand hover:underline">${esc(t.newCode)}</a>
          </p>
        </form>`
      : o.stage === 'demo'
      ? `
        <form method="post" action="/login/demo" class="space-y-4">
          <div>
            <label for="email" class="mb-1.5 block text-sm font-semibold text-slate-600">E-Mail-Adresse</label>
            <input id="email" name="email" type="email" required ${o.email ? '' : 'autofocus'} autocomplete="username" inputmode="email"
                   value="${esc(o.email ?? '')}"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <div>
            <label for="password" class="mb-1.5 block text-sm font-semibold text-slate-600">Passwort</label>
            <input id="password" name="password" type="password" required ${o.email ? 'autofocus' : ''} autocomplete="current-password"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <button class="w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-2">
            Einloggen
          </button>
        </form>`
      : `
        <form method="post" action="/login/admin" class="space-y-4">
          ${nextField}
          <div>
            <label for="email" class="mb-1.5 block text-sm font-semibold text-slate-600">Email address</label>
            <input id="email" name="email" type="email" required ${
              o.email ? '' : 'autofocus'
            } autocomplete="username" inputmode="email"
                   value="${esc(o.email ?? '')}" placeholder="admin@nikkimedia.co"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <div>
            <label for="password" class="mb-1.5 block text-sm font-semibold text-slate-600">Password</label>
            <input id="password" name="password" type="password" required ${
              o.email ? 'autofocus' : ''
            } autocomplete="current-password"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15">
          </div>
          <button class="w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-2">
            Log in
          </button>
          ${
            // Der Code-Weg steht Admins nicht offen — der Hinweis erscheint
            // deshalb nur, wenn hier gar nicht der Admin-Bereich das Ziel ist.
            o.next?.startsWith('/admin')
              ? ''
              : `<p class="text-center text-xs">
            <a href="/login" class="font-semibold text-brand hover:underline">Use an email code instead</a>
          </p>`
          }
        </form>`

  const heading =
    o.stage === 'email' ? t.headEmail : o.stage === 'code' ? t.headCode : o.stage === 'demo' ? 'Demo-Zugang' : t.headAdmin
  const sub =
    o.stage === 'email'
      ? t.subEmail
      : o.stage === 'code'
        ? t.subCode
        : o.stage === 'demo'
          ? 'Anmeldung mit E-Mail und Passwort für Demo-Konten.'
          : t.subAdmin

  return `<!DOCTYPE html>
<html lang="${lang}" class="h-full nmd">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)} | Nikki Media</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/tw.css">
<!-- Schwarz-Gold wie die Dashboards: dieselbe Umfärbung (html.nmd). -->
<link rel="stylesheet" href="/assets/dash-glass.css">
</head>
<body class="grid min-h-full place-items-center bg-ink px-4 py-10 font-sans text-slate-900">
  <div class="w-full max-w-sm">
    <a href="/" class="mb-7 flex items-center justify-center gap-3 text-white">
      <span class="nmd-brand__mark" aria-hidden="true">N</span>
      <span class="font-display text-lg font-extrabold">Nikki Media</span>
    </a>

    <div class="rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
      <h1 class="font-display text-xl font-extrabold">${esc(heading)}</h1>
      <p class="mt-1 mb-5 text-sm text-slate-500">${esc(sub)}</p>

      ${
        o.error
          ? `<p class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">${esc(
              o.error,
            )}</p>`
          : ''
      }
      ${
        o.notice
          ? `<p class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">${esc(
              o.notice,
            )}</p>`
          : ''
      }
      ${form}
    </div>

    <p class="mt-6 text-center text-xs text-slate-400">
      ${esc(t.footer)} <a href="${t.footerHref}" class="font-semibold text-white hover:underline">${esc(
        t.footerLink,
      )}</a>
    </p>
  </div>

<script>
  /*
   * Ein zweiter Tipp auf den Knopf, während der erste noch unterwegs ist,
   * schickte den Code ein zweites Mal ab — und die zweite Antwort, eine
   * Fehlermeldung, überschrieb die geglückte Anmeldung auf dem Bildschirm.
   * Nach dem Absenden ist der Knopf deshalb gesperrt.
   *
   * Beim Zurückblättern gibt der Browser die Seite unverändert aus dem
   * Verlauf zurück — dann muss der Knopf wieder benutzbar sein.
   */
  (function () {
    var form = document.querySelector('form')
    if (!form) return
    var button = form.querySelector('button')

    form.addEventListener('submit', function () {
      if (!button) return
      // Erst nach dem Absenden sperren, sonst schluckt der Browser den Versand.
      setTimeout(function () {
        button.disabled = true
        button.classList.add('opacity-60')
      }, 0)
    })

    window.addEventListener('pageshow', function () {
      if (!button) return
      button.disabled = false
      button.classList.remove('opacity-60')
    })
  })()
</script>
</body>
</html>`
}
