import { CODE_TTL_MIN } from './auth'
import type { Env } from './types'

/**
 * Alle E-Mails laufen über Resend. Versandfehler dürfen einen Request nie
 * scheitern lassen — ein Lead ist wichtiger als seine Benachrichtigung.
 * Deshalb loggt `send` Fehler und wirft nicht.
 */

interface Mail {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

/**
 * Adressen der Demo-Konten (siehe lib/demo.ts). Sie haben kein Postfach: die
 * theguardians-Konten (@demo.nikkimedia.co) und Jasons Demo-Konten
 * (@nikki-mediademo….com, scripts/demo-account.mjs --jason).
 */
export const isDemoAddress = (email: string) => /@(demo\.nikkimedia\.co|nikki-mediademo[a-z]+\.com)$/i.test(email.trim())

export async function send(env: Env, mail: Mail): Promise<boolean> {
  // Demo-Konten (@demo.nikkimedia.co) haben kein Postfach: nichts verschicken,
  // statt Rückläufer zu sammeln. Als „verschickt“ melden, damit kein Alarm losgeht.
  const recipients = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter((to) => !isDemoAddress(to))
  if (!recipients.length) return true
  mail = { ...mail, to: recipients }
  if (!env.RESEND_API_KEY) {
    console.warn('[mail] RESEND_API_KEY fehlt: E-Mail nicht versendet:', mail.subject)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        subject: mail.subject,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      console.error('[mail] Resend', res.status, (await res.text()).slice(0, 300))
      return false
    }
    return true
  } catch (err) {
    console.error('[mail] Ausnahme', err)
    return false
  }
}

/* ------------------------------------------------------------- Bausteine */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Alle Mails sind deutsch — an Jason, Kunden, Creator und seit Oktober 2026
 * auch an die Clipper. Was sich zwischen Clipper und Creator unterscheidet,
 * ist nur der Wortschatz und das Ziel der Knöpfe (siehe `WorkerArea`).
 */
const TAGLINE = 'Nikki Media · Clipping-Agentur für den DACH-Raum'

function layout(env: Env, title: string, body: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    title,
  )}</title></head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0a0f1e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(10,15,30,.08)">
        <tr><td style="background:#0a0f1e;padding:24px 28px">
          <span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:10px;background:#2563eb;color:#fff;font-weight:800;font-size:13px">NM</span>
          <span style="color:#fff;font-weight:800;letter-spacing:.08em;font-size:14px;margin-left:10px">NIKKI MEDIA</span>
        </td></tr>
        <tr><td style="padding:32px 28px">${body}</td></tr>
        <tr><td style="padding:20px 28px;background:#f6f8fb;color:#7b8798;font-size:12px;line-height:1.6">
          ${esc(TAGLINE)}<br>
          <a href="${env.APP_URL}" style="color:#2563eb;text-decoration:none">${esc(
            env.APP_URL.replace(/^https?:\/\//, ''),
          )}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

const h1 = (t: string) => `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${esc(t)}</h1>`
const p = (t: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3d4657">${t}</p>`
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:12px">${esc(
    label,
  )}</a></p>`
const codeBox = (code: string) =>
  `<div style="margin:20px 0;padding:18px;border:1px solid #dfe4ee;border-radius:14px;background:#f6f8fb;text-align:center">
     <div style="font-size:12px;color:#7b8798;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Dein Login-Code</div>
     <div style="font-size:30px;font-weight:800;letter-spacing:.28em;color:#0a0f1e">${esc(code)}</div>
   </div>`
const dl = (rows: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;font-size:14px">
    ${rows
      .map(
        ([k, v]) =>
          `<tr>
             <td style="padding:7px 12px 7px 0;color:#7b8798;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef1f6">${esc(
               k,
             )}</td>
             <td style="padding:7px 0;font-weight:600;border-bottom:1px solid #eef1f6">${esc(v)}</td>
           </tr>`,
      )
      .join('')}
   </table>`

/* ------------------------------------------------------------- Vorlagen */

/**
 * Knopf für Mails, die den Code bereits enthalten: Er führt direkt auf das
 * Code-Feld, mit ausgefüllter Adresse.
 *
 * Vorher zeigte er auf `/login`, also auf das Feld „E-Mail-Adresse" mit dem
 * Knopf „Code anfordern" darunter. Wer aus der Mail kam, forderte damit fast
 * zwangsläufig einen zweiten Code an — und hatte den Code, den er gerade
 * gelesen hatte, damit selbst entwertet.
 */
const codeLoginLink = (env: Env, email: string) =>
  `${env.APP_URL}/login/code?email=${encodeURIComponent(email)}`

/** 1 — Lead eingetragen → Kunde */
export function mailLeadCustomer(
  env: Env,
  o: { fullName: string; email: string; code: string; linkNotAdded?: boolean },
) {
  const link = codeLoginLink(env, o.email)
  return send(env, {
    to: o.email,
    subject: 'Deine Anfrage bei Nikki Media',
    html: layout(
      env,
      'Deine Anfrage bei Nikki Media',
      h1(`Hallo ${o.fullName.split(' ')[0]},`) +
        p('danke für deine Anfrage. Wir haben alles erhalten und melden uns in Kürze bei dir.') +
        p(
          'Wir haben dir außerdem direkt deinen Zugang eingerichtet, dort legst du deine Kampagnen an, lädst darin dein Rohmaterial hoch und findest später deine fertigen Videos.',
        ) +
        (o.linkNotAdded
          ? p(
              'Deinen Cloud-Link haben wir erhalten. Weil es zu deiner Adresse schon einen Zugang gibt, tragen wir ihn dort nicht ungefragt ein, füge ihn nach dem Login in deiner Kampagne über „Cloud-Link hinzufügen“ ein.',
            )
          : '') +
        codeBox(o.code) +
        button(link, 'Zu meinem Bereich') +
        p(
          '<strong>So funktioniert der Login:</strong><br>1. Knopf oben antippen<br>2. Achtstelligen Code aus dieser E-Mail eintragen',
        ) +
        p(
          `Der Code ist ${CODE_TTL_MIN} Minuten gültig. Danach forderst du auf der Login-Seite einfach einen neuen an, ein Passwort brauchst du nie.`,
        ),
    ),
  })
}

/** 2 — Lead eingetragen → Jason */
export function mailLeadAdmin(
  env: Env,
  o: {
    fullName: string
    company?: string | null
    email: string
    phone: string
    platforms: string[]
    industry: string
    footageAmount: string
    budgetRange: string
    /** „Wie bist du auf uns aufmerksam geworden?“ (Klartext) */
    source?: string
    cloudLink?: string | null
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Neuer Lead: ${o.fullName}${o.company ? ` (${o.company})` : ''}`,
    html: layout(
      env,
      'Neuer Lead',
      h1('Neuer Lead über die Website') +
        dl([
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone],
          ['Plattformen', o.platforms.join(', ')],
          ['Branche', o.industry],
          ['Rohmaterial', o.footageAmount],
          ['Videos pro Monat', o.budgetRange],
          ['Aufmerksam durch', o.source || '–'],
          ['Cloud-Link', o.cloudLink || '–'],
        ]) +
        button(`${env.APP_URL}/admin/leads`, 'Im Admin-Bereich öffnen'),
    ),
  })
}

/* --------------------------------------------------------------------------
   Post an Clipper und Creator — beide deutsch.

   Dieselbe Mail geht an zwei Bereiche: Clipper arbeiten unter /work,
   Creator in ihrem Kampagnen-Dashboard — beide an „Kampagnen“.
   -------------------------------------------------------------------------- */

/** Wer die Job-Mail bekommt — bestimmt Wortschatz und Ziel der Knöpfe. */
export type WorkerArea = 'clipper' | 'creator'

interface AreaWords {
  /** „Kampagne“ */
  item: string
  /** „die Kampagne“ */
  theItem: string
  /** „der Kampagne“ */
  inItem: string
  /** „deinem Clipper-Dashboard“ / „deinem Kampagnen-Dashboard“ */
  dashboard: string
  home: string
  itemHref: (id: string) => string
  /** „Zu meinen Kampagnen“ */
  toList: string
}

const AREA: Record<WorkerArea, AreaWords> = {
  clipper: {
    item: 'Kampagne',
    theItem: 'die Kampagne',
    inItem: 'der Kampagne',
    dashboard: 'deinem Clipper-Dashboard',
    home: '/work',
    itemHref: (id) => `/work/projekt/${id}`,
    toList: 'Zu meinen Kampagnen',
  },
  creator: {
    item: 'Kampagne',
    theItem: 'die Kampagne',
    inItem: 'der Kampagne',
    dashboard: 'deinem Kampagnen-Dashboard',
    home: '/kampagnen/finden',
    itemHref: (id) => `/kampagnen/kampagne/${id}`,
    toList: 'Zu meinen Kampagnen',
  },
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** 3 — Kunde hat hochgeladen → Clipper, der den Job angenommen hat */
export function mailUploadClipper(
  env: Env,
  o: { to: string[]; projectName: string; folderName: string; count: number; area?: WorkerArea },
) {
  if (!o.to.length) return Promise.resolve(false)
  const w = AREA[o.area ?? 'clipper']
  return send(env, {
    to: o.to,
    subject: `Neues Rohmaterial: ${o.projectName}`,
    html: layout(
      env,
      'Neues Rohmaterial',
      h1('Neues Rohmaterial ist da') +
        p(
          `${o.count} ${o.count === 1 ? 'neue Datei liegt' : 'neue Dateien liegen'} in ${w.inItem} <strong>${esc(
            o.projectName,
          )}</strong>, im Ordner „${esc(o.folderName)}“.`,
        ) +
        button(`${env.APP_URL}${w.home}`, 'Material ansehen'),
    ),
  })
}

/** 3b — Kunde hat einen Cloud-Link ergänzt → Clipper, der den Job angenommen hat */
export function mailLinkAddedClipper(env: Env, o: { to: string[]; projectName: string; area?: WorkerArea }) {
  if (!o.to.length) return Promise.resolve(false)
  const w = AREA[o.area ?? 'clipper']
  return send(env, {
    to: o.to,
    subject: `Neuer Cloud-Link: ${o.projectName}`,
    html: layout(
      env,
      'Neuer Cloud-Link',
      h1('Neuer Cloud-Link ist da') +
        p(
          `In ${w.inItem} <strong>${esc(o.projectName)}</strong> liegt ein neuer Link zu einem Cloud-Ordner mit Rohmaterial.`,
        ) +
        button(`${env.APP_URL}${w.home}`, `${w.item} öffnen`),
    ),
  })
}

/** 4 — Clipper eingeladen */
export function mailClipperInvite(
  env: Env,
  o: { email: string; displayName: string; code: string },
) {
  return send(env, {
    to: o.email,
    subject: 'Deine Einladung in die Clipping Area von Nikki Media',
    html: layout(
      env,
      'Einladung',
      h1(`Hallo ${o.displayName.split(' ')[0]},`) +
        p(
          'du wurdest als Clipper in die Clipping Area von Nikki Media eingeladen. Dort findest du das Rohmaterial deiner Kampagnen und lädst deine fertigen Videos hoch.',
        ) +
        codeBox(o.code) +
        button(codeLoginLink(env, o.email), 'Jetzt einloggen') +
        p(
          `Der Code ist ${CODE_TTL_MIN} Minuten gültig. Danach forderst du auf der Login-Seite einfach einen neuen an, ein Passwort brauchst du nie.`,
        ),
    ),
  })
}

/** 4a — Clipper hat sich über /clipper selbst eingetragen → Clipper */
export function mailClipperWelcome(env: Env, o: { email: string; fullName: string; code: string }) {
  return send(env, {
    to: o.email,
    subject: 'Willkommen bei Nikki Media, dein Clipper-Dashboard ist bereit',
    html: layout(
      env,
      'Willkommen',
      h1(`Hallo ${o.fullName.split(' ')[0]},`) +
        p(
          'du bist dabei. Dein Clipper-Dashboard ist eingerichtet. NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen, du bekommst eine E-Mail, sobald eine für dich bereitsteht. Dann lädst du das Rohmaterial herunter, schneidest deine Clips und lädst sie direkt dort hoch.',
        ) +
        codeBox(o.code) +
        button(codeLoginLink(env, o.email), 'Zu meinem Dashboard') +
        p(
          `Der Code ist ${CODE_TTL_MIN} Minuten gültig. Danach forderst du auf der Login-Seite einfach einen neuen an, ein Passwort brauchst du nie.`,
        ),
    ),
  })
}

/** 4b — Clipper hat sich über /clipper selbst eingetragen → Jason */
export function mailClipperSignupAdmin(
  env: Env,
  o: {
    fullName: string
    email: string
    phone: string
    platforms: string[]
    workStatus: string
    experience: string
    availability: string
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Neuer Clipper: ${o.fullName}`,
    html: layout(
      env,
      'Neuer Clipper',
      h1('Neuer Clipper über /clipper') +
        p('Der Zugang ist bereits eingerichtet und aktiv. Kampagnen bekommt er nur, wenn du sie ihm unter „Campaigns“ zuordnest.') +
        dl([
          ['Name', o.fullName],
          ['E-Mail', o.email],
          ['Telefon', o.phone],
          ['Plattformen', o.platforms.join(', ')],
          ['Arbeitsstatus', o.workStatus],
          ['Erfahrung', o.experience],
          ['Verfügbarkeit', o.availability],
        ]) +
        button(`${env.APP_URL}/admin/clipper`, 'Im Admin-Bereich öffnen'),
    ),
  })
}

/* --------------------------------------------------------------------------
   Creator-Post — durchgehend deutsch, mit dem Wort „Kampagne“.
   -------------------------------------------------------------------------- */

/** 4g — Creator hat sich über /creator selbst eingetragen → Creator */
export function mailCreatorWelcome(env: Env, o: { email: string; fullName: string; code: string }) {
  return send(env, {
    to: o.email,
    subject: 'Willkommen bei Nikki Media, dein Kampagnen-Dashboard ist bereit',
    html: layout(
      env,
      'Willkommen',
      h1(`Hallo ${o.fullName.split(' ')[0]},`) +
        p(
          'dein Kampagnen-Dashboard ist eingerichtet. NIKKI MEDIA wird dir in Kürze eine Kampagne zuordnen, du bekommst eine E-Mail, sobald eine für dich bereitsteht. Eigene Kampagnen lädst du dort ebenfalls hoch: Rohmaterial oder einen Link zu deinem Cloud-Ordner.',
        ) +
        codeBox(o.code) +
        button(codeLoginLink(env, o.email), 'Zu meinem Kampagnen-Dashboard') +
        p(
          `Der Code ist ${CODE_TTL_MIN} Minuten gültig. Danach forderst du auf der Login-Seite einfach einen neuen an, ein Passwort brauchst du nie.`,
        ),
    ),
  })
}

/** 4h — Creator hat sich über /creator selbst eingetragen → Jason */
export function mailCreatorSignupAdmin(
  env: Env,
  o: {
    fullName: string
    email: string
    phone: string
    goal: string
    niche: string
    platforms: string[]
    handles: string[]
    openToAds: string
    followers: string
    viewsTotal: string
    views30d: string
    /** „Wie bist du auf uns aufmerksam geworden?“ (Klartext) */
    source?: string
    cloudLink: string | null
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Neuer Creator: ${o.fullName}`,
    html: layout(
      env,
      'Neuer Creator',
      h1('Neuer Creator über /creator') +
        p('Der Zugang ist bereits eingerichtet und aktiv.') +
        dl([
          ['Name', o.fullName],
          ['E-Mail', o.email],
          ['Telefon', o.phone],
          ['Ziel', o.goal],
          ['Nische', o.niche],
          ['Plattformen', o.platforms.join(', ')],
          ['Handles', o.handles.join(', ') || '–'],
          ['Offen für Werbung', o.openToAds],
          ['Follower', o.followers],
          ['Views insgesamt', o.viewsTotal],
          ['Views letzte 30 Tage', o.views30d],
          ['Aufmerksam durch', o.source || '–'],
          ['Cloud-Link', o.cloudLink || '–'],
        ]) +
        button(`${env.APP_URL}/admin/creator`, 'Im Admin-Bereich öffnen'),
    ),
  })
}

/* --------------------------------------------------------------------------
   Jobs — der Administrator ordnet zu

   Offene Projekte werden nirgends ausgeschrieben. Der Administrator erfährt,
   dass eines auf seine Zuordnung wartet; der Bearbeiter erfährt es erst,
   wenn es ihm zugeordnet ist.
   -------------------------------------------------------------------------- */

/**
 * 4c — Ein Projekt hat Material und ist noch niemandem zugeordnet → Jason.
 *
 * Außer ihm sieht es niemand. Ohne diese Mail bliebe es liegen, bis er
 * zufällig in die Projektliste schaut.
 */
export function mailJobWaitingAdmin(env: Env, o: { projectId: string; projectName: string; customer: string }) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    subject: `Zuordnung nötig: ${o.projectName}`,
    html: layout(
      env,
      'Zuordnung nötig',
      h1('Eine Kampagne wartet auf ihr Team') +
        p(
          'In der Kampagne liegt jetzt Material (Datei oder Cloud-Link). Clipper und Creator sehen es erst, wenn du sie jemandem zuordnest.',
        ) +
        dl([
          ['Kampagne', o.projectName],
          ['Kunde', o.customer],
        ]) +
        button(`${env.APP_URL}/admin/projekte/${encodeURIComponent(o.projectId)}#team`, 'Team zuordnen'),
    ),
  })
}

/**
 * 4c — Der Job gehört dir.
 *
 * Geht an den Clipper oder Creator, dem der Administrator das Projekt
 * zugeordnet hat — sobald darin Material liegt.
 */
export function mailJobAssigned(
  env: Env,
  o: { email: string; displayName: string; projectName: string; projectId: string; area?: WorkerArea },
) {
  const w = AREA[o.area ?? 'clipper']
  return send(env, {
    to: o.email,
    subject: `NIKKI MEDIA hat dir eine Kampagne zugeordnet: ${o.projectName}`,
    html: layout(
      env,
      'Neue Kampagne für dich',
      h1(`Hallo ${o.displayName.split(' ')[0]},`) +
        p(
          `<strong>${esc(o.projectName)}</strong> ist dir zugeordnet. ${cap(
            w.theItem,
          )} liegt jetzt in ${w.dashboard}: dort lädst du das Rohmaterial herunter und deine fertigen Clips hoch.`,
        ) +
        button(`${env.APP_URL}${w.itemHref(o.projectId)}`, `${w.item} öffnen`),
    ),
  })
}

/**
 * 4f — Der Job ist nicht mehr deiner.
 *
 * Geht an den Clipper, dem der Administrator ein Projekt wieder abgenommen
 * hat. Ohne diese Mail merkt er es erst, wenn das Projekt kommentarlos aus
 * seinem Arbeitsbereich verschwunden ist — und hält es für einen Fehler.
 */
export function mailJobWithdrawn(
  env: Env,
  o: { email: string; displayName: string; projectName: string; area?: WorkerArea },
) {
  const w = AREA[o.area ?? 'clipper']
  return send(env, {
    to: o.email,
    subject: `${w.item} nicht mehr zugeordnet: ${o.projectName}`,
    html: layout(
      env,
      `${w.item} nicht mehr zugeordnet`,
      h1(`Hallo ${o.displayName.split(' ')[0]},`) +
        p(
          `<strong>${esc(
            o.projectName,
          )}</strong> ist dir nicht mehr zugeordnet. Was du schon geliefert hast, bleibt beim Auftraggeber.`,
        ) +
        button(`${env.APP_URL}${w.home}`, w.toList),
    ),
  })
}

/**
 * 4c — Login-Code auf Anforderung.
 *
 * Denselben Weg gehen Kunden, Clipper und Creator — alle auf Deutsch.
 */
export function mailLoginCode(
  env: Env,
  o: { email: string; displayName: string; code: string },
) {
  const first = o.displayName.split(' ')[0]
  const link = codeLoginLink(env, o.email)

  return send(env, {
    to: o.email,
    subject: `Dein Login-Code: ${o.code}`,
    html: layout(
      env,
      'Dein Login-Code',
      h1(`Hallo ${first},`) +
        p(`hier ist dein Login-Code. Gib ihn auf der Login-Seite ein, er ist ${CODE_TTL_MIN} Minuten gültig.`) +
        codeBox(o.code) +
        button(link, 'Einloggen') +
        p('Du hast keinen Login angefordert? Dann ignoriere diese E-Mail einfach.'),
    ),
  })
}

/**
 * Der Versand des Login-Codes hat nicht geklappt → Meldung an Jason.
 *
 * Für den Wartenden sieht ein kaputter Mailversand aus wie eine langsame
 * Mail: Er sitzt vor „der Code ist unterwegs" und wartet auf etwas, das nie
 * kommt. Diese Mail ist der Alarm dazu. Dass sie über denselben Anbieter
 * läuft und im schlimmsten Fall selbst hängen bleibt, ist kein Einwand — der
 * tägliche Selbsttest greift dann.
 */
export function mailLoginTrouble(env: Env, betroffen: string) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    subject: 'ACHTUNG: Login-Code konnte nicht verschickt werden',
    html: layout(
      env,
      'Login-Code nicht verschickt',
      h1('Ein Login-Code ist nicht rausgegangen') +
        p(`Betroffen: <strong>${esc(betroffen)}</strong>`) +
        p(
          'Der Anbieter hat den Versand abgelehnt oder war nicht erreichbar. Wer sich gerade anmelden will, wartet auf eine Mail, die nicht kommt. Bitte den Resend-Zugang prüfen (API-Schlüssel, Absenderdomain).',
        ),
    ),
  })
}

/**
 * Der Selbsttest der Anmeldung ist gescheitert → Meldung an Jason.
 *
 * Höchstens eine Mail je Stunde (gedrosselt in `index.ts`), damit ein
 * anhaltender Fehler nicht das Postfach füllt.
 */
export function mailLoginBroken(env: Env, fehler: { name: string; detail?: string }[]) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    subject: 'ACHTUNG: Der Login funktioniert nicht',
    html: layout(
      env,
      'Login gestört',
      h1('Der Selbsttest der Anmeldung ist gescheitert') +
        p('Diese Prüfungen sind durchgefallen:') +
        `<ul style="margin:0 0 18px;padding-left:20px;color:#b91c1c;font-size:15px;line-height:1.6">${fehler
          .map((f) => `<li><strong>${esc(f.name)}</strong>${f.detail ? `: ${esc(f.detail)}` : ''}</li>`)
          .join('')}</ul>` +
        p(
          'Der vollständige Bericht steht im Admin-Bereich unter <code>/api/admin/health/login</code>. Solange etwas davon rot ist, kommt womöglich niemand mehr in seinen Bereich.',
        ),
    ),
  })
}

/** 5a — Fertiges Video hochgeladen → Kunde */
export function mailDeliverableCustomer(
  env: Env,
  o: { to: string; projectName: string; filename: string; caption?: string | null },
) {
  return send(env, {
    to: o.to,
    subject: `Neues Video für ${o.projectName} ist fertig`,
    html: layout(
      env,
      'Neues Video',
      h1('Dein neues Video ist da') +
        p(`Für <strong>${esc(o.projectName)}</strong> wurde ein fertiges Video hochgeladen.`) +
        (o.caption ? p(`„${esc(o.caption)}“`) : '') +
        button(`${env.APP_URL}/app/videos`, 'Video ansehen'),
    ),
  })
}

/** 5b — Fertiges Video hochgeladen → Jason */
export function mailDeliverableAdmin(
  env: Env,
  o: { projectName: string; clipper: string; filename: string },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    subject: `Neues Deliverable: ${o.projectName}`,
    html: layout(
      env,
      'Neues Deliverable',
      h1('Neues fertiges Video') +
        dl([
          ['Kampagne', o.projectName],
          ['Clipper', o.clipper],
          ['Datei', o.filename],
        ]) +
        button(`${env.APP_URL}/admin/kunden`, 'Im Admin-Bereich ansehen'),
    ),
  })
}

/**
 * 5b — Der Administrator hat einen Creator einer Kampagne zum Verbreiten
 * zugeordnet. Die Mail führt direkt zu den Clips dieser Kampagne.
 */
export function mailDistributionAssigned(
  env: Env,
  o: { to: string; fullName: string; projectId: string; projectName: string },
) {
  return send(env, {
    to: o.to,
    subject: `NIKKI MEDIA hat dir eine Kampagne zugeordnet: ${o.projectName}`,
    html: layout(
      env,
      'Neue Kampagne zum Verbreiten',
      h1(`Hallo ${esc(o.fullName.split(' ')[0] || o.fullName)},`) +
        p(
          `NIKKI MEDIA hat dir die Kampagne <strong>${esc(
            o.projectName,
          )}</strong> zum Verbreiten zugeordnet. Sieh dir die fertigen Clips an, mit „Freigeben &amp; posten“ geht ein Clip auf deine verbundenen Kanäle.`,
        ) +
        button(`${env.APP_URL}/kampagnen/verbreiten/${encodeURIComponent(o.projectId)}`, 'Kampagne öffnen') +
        p('Ohne deine Freigabe wird nichts gepostet.'),
    ),
  })
}

/**
 * 5c — Fertiges Video in einer freigegebenen Kampagne → jeder beigetretene
 * Creator, einzeln.
 *
 * Der Clip geht bei ihm erst nach seinem Klick auf „Freigeben & posten“
 * raus. Deshalb sagt die Mail das ausdrücklich: ohne Freigabe passiert
 * nichts. Der Knopf führt direkt zu den Clips dieser Kampagne.
 */
export function mailClipForApproval(
  env: Env,
  o: { to: string; fullName: string; projectId: string; projectName: string; caption?: string | null },
) {
  return send(env, {
    to: o.to,
    subject: `Neuer Clip zum Freigeben: ${o.projectName}`,
    html: layout(
      env,
      'Neuer Clip zum Freigeben',
      h1('Neuer Clip zum Freigeben') +
        p(
          `Hallo ${esc(o.fullName.split(' ')[0] || o.fullName)}, in der Kampagne <strong>${esc(
            o.projectName,
          )}</strong> ist ein neuer Clip fertig. Sieh ihn dir an, mit „Freigeben &amp; posten“ geht er auf deine verbundenen Kanäle.`,
        ) +
        (o.caption ? p(`„${esc(o.caption)}“`) : '') +
        button(`${env.APP_URL}/kampagnen/verbreiten/${encodeURIComponent(o.projectId)}`, 'Clip ansehen') +
        p('Ohne deine Freigabe wird nichts gepostet.'),
    ),
  })
}

/** 6 — Speicher über Schwellwert → Jason */
export function mailStorageWarning(
  env: Env,
  o: { customerId: string; company?: string | null; used: string; limit: string },
) {
  const who = o.company || 'Ein Kunde ohne Firmenangabe'
  return send(env, {
    to: env.ADMIN_EMAIL,
    subject: `Speicherwarnung: ${who} über ${o.limit}`,
    html: layout(
      env,
      'Speicherwarnung',
      h1('Ein Kunde überschreitet das Speicherlimit') +
        dl([
          ['Kunde', who],
          ['Belegt', o.used],
          ['Schwelle', o.limit],
        ]) +
        p('Diese Warnung wird pro Kunde nur einmal verschickt.') +
        button(`${env.APP_URL}/admin/kunden/${o.customerId}`, 'Kunden ansehen'),
    ),
  })
}

/* --------------------------------------------------------------------------
   Agenturen aus allen Branchen — /brands und /collaboration (deutsch)
   -------------------------------------------------------------------------- */

/** 6a — Agentur hat sich über /brands eingetragen → Agentur */
export function mailAgencyWelcome(env: Env, o: { email: string; fullName: string; code: string }) {
  return send(env, {
    to: o.email,
    subject: 'Willkommen bei Nikki Media, dein Collaboration-Dashboard',
    html: layout(
      env,
      'Willkommen',
      h1(`Hallo ${o.fullName.split(' ')[0]},`) +
        p(
          'schön, dass ihr mit NIKKI MEDIA zusammenarbeiten wollt. Dein Collaboration-Dashboard ist eingerichtet. Bestätige deine Adresse mit dem Code unten, danach startest du dort deine erste Kampagne.',
        ) +
        codeBox(o.code) +
        button(codeLoginLink(env, o.email), 'Zum Collaboration-Dashboard') +
        p(
          `Der Code ist ${CODE_TTL_MIN} Minuten gültig. Danach forderst du auf der Login-Seite einfach einen neuen an, ein Passwort brauchst du nie.`,
        ),
    ),
  })
}

/** 6b — Agentur hat sich über /brands eingetragen → Jason */
export function mailAgencySignupAdmin(
  env: Env,
  o: {
    leadId: string
    warm: boolean
    code: string | null
    fullName: string
    company: string | null
    email: string
    phone: string
    kind: string
    clients: string
    platforms: string[]
    source: string
    niche: string
    socials: string[]
    footage: string
    footageLink: string | null
  },
) {
  const tag = o.warm ? 'WARMER LEAD' : 'Kalter Lead'
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `${o.warm ? '🔥 ' : ''}${tag} über /brands: ${o.company || o.fullName}`,
    html: layout(
      env,
      tag,
      h1(o.warm ? '🔥 Warmer Lead über /brands' : 'Neuer kalter Lead über /brands') +
        p(
          o.warm
            ? `Eingetragen mit dem Cooperation-Code <strong>${esc(o.code ?? '')}</strong>. Sobald die erste Kampagne angelegt ist, hat der Lead Zugang zu Kampagnen, Creatorn und Clippern.`
            : 'Ohne Cooperation-Code: der Zugang bleibt gesperrt, bis du ihn im Admin-Bereich unter „Agenturen“ freigibst.',
        ) +
        dl([
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone],
          ['Art', o.kind],
          ['Kunden mit Interesse an Clipping', o.clients],
          ['Plattformen', o.platforms.join(', ')],
          ['Aufmerksam durch', o.source],
          ['Nische', o.niche],
          ['Social Media', o.socials.join(', ') || '–'],
          ['Rohmaterial', o.footage],
          ['Link zum Rohmaterial', o.footageLink || '–'],
        ]) +
        button(`${env.APP_URL}/admin/agenturen/${o.leadId}`, 'Im Admin-Bereich öffnen'),
    ),
  })
}

/** 6c — Agentur hat „Kampagne starten“ gedrückt → Jason */
export function mailAgencyBriefingAdmin(
  env: Env,
  o: {
    leadId: string
    warm: boolean
    unlocked: boolean
    fullName: string
    company: string | null
    email: string
    phone: string | null
    views: string
    budget: string
    pkg: string
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Kampagne gestartet: ${o.company || o.fullName} (${o.warm ? 'warm' : 'kalt'})`,
    html: layout(
      env,
      'Kampagne gestartet',
      h1('Eine Agentur hat ihre Kampagne gestartet') +
        p(
          o.unlocked
            ? 'Der Zugang ist freigeschaltet, die Agentur sieht jetzt Kampagnen, Creator und Clipper.'
            : 'Kalter Lead: der Zugang bleibt gesperrt. Die Agentur sieht „NIKKI MEDIA meldet sich bei dir“, bitte melde dich bei ihr.',
        ) +
        dl([
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone || '–'],
          ['Lead', o.warm ? 'Warm (Cooperation-Code)' : 'Kalt'],
          ['Gewünschte Views', o.views],
          ['Budget', o.budget],
          ['Auftrag', o.pkg],
        ]) +
        button(`${env.APP_URL}/admin/agenturen/${o.leadId}`, 'Im Admin-Bereich öffnen'),
    ),
  })
}

/**
 * 6c² — Agentur startet eine Kampagne (verbindlich beauftragt) → Jason. Mit
 * `first` die ERSTE Kampagne (seit November 2026 im selben Formular wie jede
 * weitere): dann mit warm/kalt und ob der Zugang jetzt offen ist.
 */
export function mailAgencyCampaignAdmin(
  env: Env,
  o: {
    first?: { warm: boolean; unlocked: boolean }
    leadId: string
    projectId: string
    campaign: string
    fullName: string
    company: string | null
    email: string
    phone: string | null
    niche: string
    platforms: string
    views: string
    budget: string
    perThousand: string
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: o.first
      ? `Kampagne gestartet: ${o.campaign} (${o.company || o.fullName}, ${o.first.warm ? 'warm' : 'kalt'})`
      : `Neue Kampagne: ${o.campaign} (${o.company || o.fullName})`,
    html: layout(
      env,
      o.first ? 'Kampagne gestartet' : 'Neue Kampagne',
      h1(o.first ? 'Eine Agentur hat ihre erste Kampagne gestartet' : 'Eine Agentur hat eine weitere Kampagne gestartet') +
        p(
          o.first
            ? o.first.unlocked
              ? 'Verbindlich beauftragt. Der Zugang ist freigeschaltet, die Agentur sieht jetzt Kampagnen, Creator und Clipper.'
              : 'Verbindlich beauftragt. Kalter Lead: der Zugang bleibt gesperrt. Die Agentur sieht „NIKKI MEDIA meldet sich bei dir“, bitte melde dich bei ihr.'
            : 'Verbindlich beauftragt. Das Briefing hängt an der Kampagne. Sobald Material darin liegt, braucht sie ein Team.',
        ) +
        dl([
          ...(o.first ? ([['Lead', o.first.warm ? 'Warm (Cooperation-Code)' : 'Kalt']] as [string, string][]) : []),
          ['Kampagne', o.campaign],
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone || '–'],
          ['Bereich', o.niche],
          ['Plattformen', o.platforms],
          ['Gewünschte Views', o.views],
          ['Budget', o.budget],
          ['Preis pro 1.000 Views', o.perThousand],
        ]) +
        button(`${env.APP_URL}/admin/projekte/${o.projectId}`, 'Kampagne im Admin-Bereich öffnen') +
        (o.first ? button(`${env.APP_URL}/admin/agenturen/${o.leadId}`, 'Agentur im Admin-Bereich öffnen') : ''),
    ),
  })
}

/** 6d — Der Administrator hat den Zugang freigegeben → Agentur */
export function mailAgencyUnlocked(env: Env, o: { email: string; fullName: string }) {
  return send(env, {
    to: o.email,
    subject: 'Dein Zugang bei Nikki Media ist freigeschaltet',
    html: layout(
      env,
      'Zugang freigeschaltet',
      h1(`Hallo ${o.fullName.split(' ')[0]},`) +
        p(
          'dein Collaboration-Dashboard ist freigeschaltet. Ab sofort siehst du alle Kampagnen, Creator und Clipper von NIKKI MEDIA, lädst dein Material hoch und buchst Creator und Clipper für deine Kampagnen.',
        ) +
        button(`${env.APP_URL}/collaboration`, 'Zum Collaboration-Dashboard'),
    ),
  })
}

/** 6e — Agentur möchte einen Creator buchen → Jason */
export function mailCreatorBookingAdmin(
  env: Env,
  o: { leadId: string; agency: string; email: string; creator: string; campaign: string; message: string | null },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Creator-Buchung: ${o.creator} für ${o.agency}`,
    html: layout(
      env,
      'Creator-Buchung',
      h1('Eine Agentur möchte einen Creator buchen') +
        p('Mit deiner Bestätigung kommt der Creator ins Team der Kampagne, schneiden und verbreiten.') +
        dl([
          ['Agentur', o.agency],
          ['Creator', o.creator],
          ['Kampagne', o.campaign],
          ['Nachricht', o.message || '–'],
        ]) +
        button(`${env.APP_URL}/admin/agenturen/${o.leadId}`, 'Buchung ansehen'),
    ),
  })
}

/** 6f — Agentur möchte einen Clipper buchen → Jason */
export function mailClipperBookingAdmin(
  env: Env,
  o: { leadId: string; agency: string; email: string; clipper: string; campaign: string; message: string | null },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Clipper-Buchung: ${o.clipper} für ${o.agency}`,
    html: layout(
      env,
      'Clipper-Buchung',
      h1('Eine Agentur möchte einen Clipper buchen') +
        p('Mit deiner Bestätigung kommt der Clipper ins Team der Kampagne und schneidet für sie.') +
        dl([
          ['Agentur', o.agency],
          ['Clipper', o.clipper],
          ['Kampagne', o.campaign],
          ['Nachricht', o.message || '–'],
        ]) +
        button(`${env.APP_URL}/admin/agenturen/${o.leadId}`, 'Buchung ansehen'),
    ),
  })
}

/** 7 — Investoren-Anfrage über /investoren → Jason (keine Datenbankzeile, nur Mail + audit_log). */
export function mailInvestorAdmin(
  env: Env,
  o: {
    fullName: string
    email: string
    phone: string
    company: string | null
    kind: string
    ticket: string
    message: string | null
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Investoren-Anfrage: ${o.fullName}${o.company ? ` (${o.company})` : ''} · ${o.ticket}`,
    html: layout(
      env,
      'Investoren-Anfrage',
      h1('Neue Investoren-Anfrage über /investoren') +
        dl([
          ['Name', o.fullName],
          ['Firma / Fonds', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone],
          ['Art', o.kind],
          ['Ticketgröße', o.ticket],
          ['Nachricht', o.message || '–'],
        ]) +
        p('Antworte direkt auf diese Mail, die Antwort geht an den Absender.'),
    ),
  })
}

/** Kunde legt im Dashboard eine Kampagne an (Laufzeit, Reichweite) → Jason. Zusätzlich zum Eintrag aus dem ersten Formular. */
export function mailCustomerCampaignAdmin(
  env: Env,
  o: {
    projectId: string
    campaign: string
    fullName: string
    company: string | null
    email: string
    phone: string | null
    duration: string
    views: string
    /** Wer angelegt hat; Standard Kunde. */
    by?: 'kunde' | 'creator'
    /** Aus dem gemeinsamen Formular (seit November 2026): Bereich, Plattformen, Budget, Preis. */
    niche?: string
    platforms?: string
    budget?: string
    perThousand?: string
  },
) {
  const who = o.by === 'creator' ? 'Creator' : 'Kunde'
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Neue Kampagne (${who}): ${o.campaign} (${o.company || o.fullName})`,
    html: layout(
      env,
      'Neue Kampagne',
      h1(o.by === 'creator' ? 'Ein Creator hat eine Kampagne angelegt' : 'Ein Kunde hat eine Kampagne angelegt') +
        p(
          o.budget
            ? 'Verbindlich beauftragt. Die Angaben hängen an der Kampagne. Sobald Material darin liegt, braucht sie ein Team.'
            : 'Weitere Angaben zu einem bestehenden Kunden. Laufzeit und Reichweite hängen an der Kampagne.',
        ) +
        dl([
          ['Kampagne', o.campaign],
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone || '–'],
          ...(o.niche ? ([['Bereich', o.niche]] as [string, string][]) : []),
          ...(o.platforms ? ([['Plattformen', o.platforms]] as [string, string][]) : []),
          ...(o.duration && o.duration !== '–' ? ([['Laufzeit', o.duration]] as [string, string][]) : []),
          ['Gewünschte Reichweite', o.views],
          ...(o.budget ? ([['Budget', o.budget]] as [string, string][]) : []),
          ...(o.perThousand ? ([['Preis pro 1.000 Views', o.perThousand]] as [string, string][]) : []),
        ]) +
        button(`${env.APP_URL}/admin/projekte/${o.projectId}`, 'Kampagne im Admin öffnen'),
    ),
  })
}

/** Angefangene, nicht abgeschickte Kampagne (lib/drafts.ts, nach 2 Stunden) → Jason */
export function mailDraftAbandonedAdmin(
  env: Env,
  o: {
    customerId: string | null
    campaign: string
    fullName: string
    company: string | null
    email: string
    phone: string | null
    duration: string
    views: string
    startedAt: number
  },
) {
  const started = new Date(o.startedAt * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Kampagne begonnen, nicht abgeschlossen: ${o.company || o.fullName}`,
    html: layout(
      env,
      'Kampagne nicht abgeschlossen',
      h1('Eine Kampagne wurde begonnen, aber nicht abgeschickt') +
        p('Ein Kunde hat „Neue Kampagne“ ausgefüllt und seit 2 Stunden nicht abgeschickt. Das sind seine Angaben bis jetzt. Nach 24 Stunden bekommt er automatisch eine freundliche Erinnerung.') +
        dl([
          ['Kampagne', o.campaign],
          ['Name', o.fullName],
          ['Firma', o.company || '–'],
          ['E-Mail', o.email],
          ['Telefon', o.phone || '–'],
          ['Laufzeit', o.duration],
          ['Gewünschte Reichweite', o.views],
          ['Begonnen', started],
        ]) +
        (o.customerId ? button(`${env.APP_URL}/admin/kunden/${o.customerId}`, 'Kunden im Admin öffnen') : ''),
    ),
  })
}

/** Erinnerung an den Kunden: Kampagne angefangen, nicht abgeschickt (lib/drafts.ts, nach 24 Stunden) */
export function mailDraftReminderCustomer(
  env: Env,
  o: { to: string; firstName: string; campaign: string | null; duration: string | null; views: string | null },
) {
  const rows: [string, string][] = []
  if (o.campaign) rows.push(['Kampagne', o.campaign])
  if (o.duration) rows.push(['Laufzeit', o.duration])
  if (o.views) rows.push(['Reichweite', o.views])
  return send(env, {
    to: o.to,
    subject: 'Deine Kampagne ist fast fertig',
    html: layout(
      env,
      'Deine Kampagne ist fast fertig',
      h1(`Hallo ${o.firstName}, deine Kampagne wartet auf dich`) +
        p('Du hast angefangen, eine neue Kampagne anzulegen. Deine Angaben haben wir gespeichert, du musst nur noch abschicken.') +
        (rows.length ? dl(rows) : '') +
        button(`${env.APP_URL}/app/neu`, 'Kampagne fertigstellen') +
        p('Fragen zu Laufzeit oder Reichweite? Antworte einfach auf diese Mail, wir helfen dir gern.'),
    ),
  })
}

/** 8 — Upsell „Mehr Reichweite“ aus einem Dashboard → Jason */
export function mailUpsellAdmin(
  env: Env,
  o: {
    fullName: string
    email: string
    role: string
    campaign: string
    percent: number
    extraViews: number
    price: string
    /** Preis vor Push-Rabatt, nur wenn es einen gab. */
    listPrice?: string | null
    discountPct?: number
    clientPrice: string | null
  },
) {
  return send(env, {
    to: env.ADMIN_EMAIL,
    replyTo: o.email,
    subject: `Kampagne pushen +${o.percent} % Budget: ${o.campaign} (${o.fullName})`,
    html: layout(
      env,
      'Upsell-Anfrage',
      h1(`Kampagne pushen: +${o.percent} % Budget angefragt`) +
        dl([
          ['Von', `${o.fullName} (${o.role === 'agency' ? 'Agentur' : o.role === 'creator' ? 'Creator, eigene Kampagne' : 'Kunde'})`],
          ['E-Mail', o.email],
          ['Kampagne', o.campaign],
          ['Zusätzliche Views', o.extraViews.toLocaleString('de-DE')],
          ['Zusätzliches Budget', o.discountPct ? `${o.price} (nach ${o.discountPct.toLocaleString('de-DE')} % Push-Rabatt, vorher ${o.listPrice})` : o.price],
          ...(o.clientPrice ? ([['Kundenpreis der Agentur', o.clientPrice]] as [string, string][]) : []),
        ]) +
        button(`${env.APP_URL}/admin/upsells`, 'Im Admin-Bereich öffnen'),
    ),
  })
}
