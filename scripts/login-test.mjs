#!/usr/bin/env node
/*
 * Login-Test — spielt jeden Anmeldeweg gegen einen echten Worker durch.
 *
 * Läuft in `npm run ship` VOR dem Deploy. Fällt eine Prüfung durch, gibt es
 * keinen Deploy. Der Anlass ist der Fehler vom 31.08.2026: Ein Clipper
 * sah „There is no valid code", obwohl die Anmeldung im selben Moment
 * durchgelaufen war — bemerkt hat es niemand, weil nichts den Weg je
 * automatisch gegangen ist.
 *
 * Der Test startet `wrangler dev` mit einer EIGENEN lokalen Datenbank
 * (--persist-to), fasst also weder die Live-Daten noch den Entwicklungsstand
 * auf der Platte an. Codes werden direkt in die Tabelle gelegt, ihr Hash mit
 * demselben Verfahren wie im Worker gerechnet — so ist der Klartext bekannt,
 * ohne eine Mail zu verschicken.
 *
 *     npm test
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, renameSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DEMO_CLIPPER_EMAIL, DEMO_CREATOR_EMAIL, DEMO_EMAIL, JASON_DEMO, demoAccountSql, jasonDemoSql } from './demo-account.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE = join(ROOT, '.wrangler', 'login-test-state')

/**
 * Ein freier Port statt einer festen Nummer. Bleibt aus einem abgebrochenen
 * Lauf ein workerd übrig, hält der die feste Nummer weiter besetzt — der
 * nächste Test scheiterte dann an etwas, das mit dem Login nichts zu tun hat.
 */
const PORT = await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})
const BASE = `http://127.0.0.1:${PORT}`
const SECRET = 'login-test-pepper'
const ADMIN_PW = 'test-passwort-123'

const DEV_VARS = join(ROOT, '.dev.vars')
const DEV_VARS_BACKUP = join(ROOT, '.dev.vars.login-test-backup')

const CLIPPER = 'clipper@login-test.local'
const CUSTOMER = 'kunde@login-test.local'
const ADMIN = 'admin@login-test.local'
const UNBEKANNT = 'niemand@login-test.local'

/* ------------------------------------------------------------- Werkzeuge */

let bestanden = 0
const durchgefallen = []

function pruefe(name, ok, detail) {
  if (ok) {
    bestanden++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    durchgefallen.push(name)
    console.log(`  \x1b[31m✘ ${name}${detail ? ` — ${detail}` : ''}\x1b[0m`)
  }
}

const hashCode = (email, code) =>
  createHmac('sha256', SECRET).update(`code:${email}:${code}`).digest('hex')

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256')
  return `pbkdf2$sha256$100000$${salt.toString('hex')}$${hash.toString('hex')}`
}

function d1(sql) {
  const run = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'nikki-media', '--local', '--persist-to', STATE, '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8' },
  )
  const out = run.stdout ?? ''
  const start = out.indexOf('[')
  if (run.status !== 0 || start < 0) {
    throw new Error(`D1 fehlgeschlagen: ${sql}\n${out}\n${run.stderr ?? ''}`)
  }
  return JSON.parse(out.slice(start))[0].results
}

const zaehle = (sql) => Number(d1(sql)[0]?.n ?? 0)

const jetzt = () => Math.floor(Date.now() / 1000)

/**
 * `wrangler dev` lädt sich neu, wenn es eine Dateiänderung sieht — und die
 * lokale Datenbank ändert sich in diesem Test dauernd. Trifft eine Anfrage
 * genau dieses Fenster, kommt „fetch failed" zurück, ohne dass am Worker
 * etwas falsch wäre. Deshalb wird ein Verbindungsfehler wiederholt; eine
 * Antwort — auch eine fehlerhafte — wird nie wiederholt.
 */
async function hole(pfad, init) {
  let letzter
  for (let versuch = 0; versuch < 20; versuch++) {
    try {
      // Ohne Zeitgrenze bleibt eine Anfrage an einen Port, auf dem gerade
      // niemand horcht, in manchen Umgebungen ewig hängen — der Test liefe
      // dann nie zu Ende, statt zu scheitern.
      return await fetch(`${BASE}${pfad}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        ...init,
      })
    } catch (err) {
      letzter = err
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw letzter
}

async function post(pfad, felder, cookie) {
  return hole(pfad, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(felder).toString(),
  })
}

/** Legt einen Code mit bekanntem Klartext direkt in die Tabelle. */
function legeCode(email, code, { alterSek = 0, gueltigSek = 1800 } = {}) {
  const ts = jetzt() - alterSek
  d1(
    `INSERT INTO login_codes (id,email,code_hash,expires_at,attempts,created_at)
     VALUES ('${randomBytes(8).toString('hex')}','${email}','${hashCode(email, code)}',${ts + gueltigSek},0,${ts});`,
  )
}

/* ------------------------------------------------------------ Vorbereiten */

function aufraeumen(server) {
  // `wrangler dev` startet workerd als eigenen Prozess. Nur den Vater zu
  // beenden ließe das Kind mit dem Port zurück — deshalb die ganze Gruppe.
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      try {
        server.kill('SIGKILL')
      } catch {}
    }
  }
  try {
    unlinkSync(DEV_VARS)
  } catch {}
  if (existsSync(DEV_VARS_BACKUP)) renameSync(DEV_VARS_BACKUP, DEV_VARS)
  try {
    rmSync(STATE, { recursive: true, force: true })
  } catch {}
}

async function warteAufServer() {
  for (let versuch = 0; versuch < 60; versuch++) {
    try {
      const res = await fetch(`${BASE}/login`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      })
      if (res.status === 200) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/* ----------------------------------------------------------------- Ablauf */

let server = null
let protokoll = ''
try {
  console.log('\n\x1b[1m▸ Login-Test — eigener Worker, eigene Datenbank\x1b[0m')

  if (existsSync(DEV_VARS)) renameSync(DEV_VARS, DEV_VARS_BACKUP)
  writeFileSync(DEV_VARS, `AUTH_SECRET = "${SECRET}"\n`)
  rmSync(STATE, { recursive: true, force: true })

  const migration = spawnSync(
    'npx',
    ['wrangler', 'd1', 'migrations', 'apply', 'nikki-media', '--local', '--persist-to', STATE],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (migration.status !== 0) throw new Error(`Migrationen fehlgeschlagen:\n${migration.stdout}${migration.stderr}`)

  const ts = jetzt()
  d1(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('u-clip','${CLIPPER}','clipper','Test Clipper',${ts});`)
  d1(`INSERT INTO clippers (id,user_id,display_name,status,created_at) VALUES ('c-1','u-clip','Test Clipper','aktiv',${ts});`)
  d1(`INSERT INTO users (id,email,role,full_name,created_at) VALUES ('u-kunde','${CUSTOMER}','customer','Test Kunde',${ts});`)
  d1(`INSERT INTO users (id,email,role,full_name,password_hash,created_at) VALUES ('u-admin','${ADMIN}','admin','Test Admin','${hashPassword(ADMIN_PW)}',${ts});`)

  server = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', STATE], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  server.stdout.on('data', (d) => (protokoll += d))
  server.stderr.on('data', (d) => (protokoll += d))

  if (!(await warteAufServer())) throw new Error(`Worker kam nicht hoch:\n${protokoll.slice(-2000)}`)

  /* ---------------------------------------------------- 1. Code anfordern */
  console.log('\n  \x1b[1mCode anfordern\x1b[0m')

  const seite = await hole('/login')
  pruefe('Anmeldeseite antwortet', seite.status === 200, `HTTP ${seite.status}`)

  const angefordert = await post('/login', { email: CLIPPER })
  const ziel = angefordert.headers.get('location') ?? ''
  pruefe('Adresse abschicken leitet weiter (Post/Redirect/Get)', angefordert.status === 303, `HTTP ${angefordert.status}`)
  pruefe('Weiterleitung zeigt auf die Code-Seite', ziel.startsWith('/login/code?'), ziel)
  pruefe('Clipper bekommt die deutsche Seite', !ziel.includes('lang=en'), ziel)
  pruefe('Genau ein Code wurde ausgestellt', zaehle(`SELECT count(*) AS n FROM login_codes WHERE email='${CLIPPER}';`) === 1)

  for (let i = 0; i < 3; i++) await hole(ziel)
  pruefe(
    'Neuladen der Code-Seite stellt KEINEN neuen Code aus',
    zaehle(`SELECT count(*) AS n FROM login_codes WHERE email='${CLIPPER}';`) === 1,
  )

  const unbekannt = await post('/login', { email: UNBEKANNT })
  pruefe('Unbekannte Adresse bekommt dieselbe Antwort', unbekannt.status === 303, `HTTP ${unbekannt.status}`)
  pruefe('Für Unbekannte wird kein Code erzeugt', zaehle(`SELECT count(*) AS n FROM login_codes WHERE email='${UNBEKANNT}';`) === 0)

  const adminCode = await post('/login', { email: ADMIN })
  pruefe('Admin bekommt keinen Code (nur Passwort)', zaehle(`SELECT count(*) AS n FROM login_codes WHERE email='${ADMIN}';`) === 0, `HTTP ${adminCode.status}`)

  /* ------------------------------------------------------ 2. Code einlösen */
  console.log('\n  \x1b[1mCode einlösen\x1b[0m')

  d1(`DELETE FROM login_codes; DELETE FROM rate_limits; DELETE FROM sessions;`)
  legeCode(CLIPPER, '12345678')

  const rein = await post('/login/code', { email: CLIPPER, code: '12345678' })
  const cookie = (rein.headers.get('set-cookie') ?? '').split(';')[0]
  pruefe('Richtiger Code führt ins Dashboard', rein.status === 302 && rein.headers.get('location') === '/work', `HTTP ${rein.status} → ${rein.headers.get('location')}`)
  pruefe('Sitzung wird gesetzt', cookie.startsWith('nm_session_clipper='), cookie)

  const zweitesMal = await post('/login/code', { email: CLIPPER, code: '12345678' })
  pruefe('Derselbe Code ein zweites Mal (Doppeltipp)', zweitesMal.status === 302, `HTTP ${zweitesMal.status}`)

  const mitSitzung = await post('/login/code', { email: CLIPPER, code: '12345678' }, cookie)
  pruefe('Zurück-Taste mit bestehender Sitzung', mitSitzung.status === 303 && mitSitzung.headers.get('location') === '/work', `HTTP ${mitSitzung.status}`)

  const mitLeerzeichen = await post('/login/code', { email: CLIPPER, code: '1234 5678' })
  pruefe('Eingefügter Code mit Leerzeichen', mitLeerzeichen.status === 302, `HTTP ${mitLeerzeichen.status}`)

  const grossGeschrieben = await post('/login/code', { email: CLIPPER.toUpperCase(), code: '12345678' })
  pruefe('Adresse in Großbuchstaben findet dasselbe Konto', grossGeschrieben.status === 302, `HTTP ${grossGeschrieben.status}`)

  legeCode(CLIPPER, '87654321')
  const alter = await post('/login/code', { email: CLIPPER, code: '12345678' })
  const neuer = await post('/login/code', { email: CLIPPER, code: '87654321' })
  pruefe('Älterer Code gilt neben dem neuen weiter', alter.status === 302, `HTTP ${alter.status}`)
  pruefe('Neuer Code gilt', neuer.status === 302, `HTTP ${neuer.status}`)

  const kunde = 'k'
  d1(`DELETE FROM login_codes; DELETE FROM rate_limits;`)
  legeCode(CUSTOMER, '11223344')
  const kundeRein = await post('/login/code', { email: CUSTOMER, code: '11223344' })
  pruefe(`Kunde kommt in seinen Bereich`, kundeRein.status === 302 && kundeRein.headers.get('location') === '/app', `HTTP ${kundeRein.status} → ${kundeRein.headers.get('location')}${kunde}`)

  /* ------------------------------------------------------ 3. Abwehr steht */
  console.log('\n  \x1b[1mAbwehr\x1b[0m')

  d1(`DELETE FROM login_codes; DELETE FROM rate_limits; DELETE FROM sessions;`)
  legeCode(CLIPPER, '55556666')

  const leer = await post('/login/code', { email: CLIPPER, code: '' })
  pruefe('Leeres Feld wird abgewiesen', (await leer.text()).includes('stimmt nicht'), `HTTP ${leer.status}`)
  pruefe(
    'Leeres Feld kostet keinen Versuch',
    zaehle(`SELECT COALESCE(SUM(attempts),0) AS n FROM login_codes WHERE email='${CLIPPER}';`) === 0,
  )

  // Mit `lang=en` wie in Clipper-Mails von vor Oktober 2026: die Seite bleibt deutsch.
  const falsch = await post('/login/code', { email: CLIPPER, code: '00000000', lang: 'en' })
  pruefe('Falscher Code wird abgewiesen (deutsch, auch mit altem lang=en)', (await falsch.text()).includes('stimmt nicht'), `HTTP ${falsch.status}`)
  pruefe(
    'Falscher Code kostet einen Versuch',
    zaehle(`SELECT COALESCE(SUM(attempts),0) AS n FROM login_codes WHERE email='${CLIPPER}';`) === 1,
  )

  let gesperrt = false
  for (let i = 1; i <= 4; i++) {
    const antwort = await post('/login/code', { email: CLIPPER, code: `0000000${i}` })
    if ((await antwort.text()).includes('Zu viele Fehlversuche')) gesperrt = true
  }
  pruefe('Fünf Fehlversuche sperren', gesperrt)
  const trotzSperre = await post('/login/code', { email: CLIPPER, code: '55556666' })
  pruefe('Sperre gilt auch für den richtigen Code', (await trotzSperre.text()).includes('Zu viele Fehlversuche'))

  d1(`DELETE FROM login_codes; DELETE FROM rate_limits;`)
  legeCode(CLIPPER, '99998888', { alterSek: 3600, gueltigSek: 1800 })
  const abgelaufen = await post('/login/code', { email: CLIPPER, code: '99998888' })
  pruefe('Abgelaufener Code wird abgewiesen', (await abgelaufen.text()).includes('abgelaufen'))

  d1(`DELETE FROM login_codes; DELETE FROM rate_limits;`)
  legeCode(ADMIN, '77776666')
  const adminPerCode = await post('/login/code', { email: ADMIN, code: '77776666' })
  pruefe('Admin kommt auch mit gültigem Code nicht per Code hinein', adminPerCode.status === 200, `HTTP ${adminPerCode.status}`)

  /* ------------------------------------------- 4. Passwort und Zutrittswege */
  console.log('\n  \x1b[1mPasswort-Login und geschützte Bereiche\x1b[0m')

  d1(`DELETE FROM rate_limits;`)
  const adminRein = await post('/login/admin', { email: ADMIN, password: ADMIN_PW })
  pruefe('Admin meldet sich mit Passwort an', adminRein.status === 302 && adminRein.headers.get('location') === '/admin', `HTTP ${adminRein.status} → ${adminRein.headers.get('location')}`)

  const falschesPw = await post('/login/admin', { email: ADMIN, password: 'daneben' })
  pruefe('Falsches Passwort wird abgewiesen', falschesPw.status === 200)

  const work = await hole('/work')
  pruefe(
    'Ohne Sitzung führt /work auf die (deutsche) Anmeldeseite',
    work.status === 302 && (work.headers.get('location') ?? '').startsWith('/login') && !(work.headers.get('location') ?? '').includes('lang=en'),
    `${work.status} → ${work.headers.get('location')}`,
  )

  const app = await hole('/app')
  pruefe('Ohne Sitzung führt /app auf die Anmeldeseite', app.status === 302 && (app.headers.get('location') ?? '').startsWith('/login'), `${app.status}`)

  const adminSeite = await hole('/admin')
  pruefe('Ohne Sitzung zeigt /admin das Passwortfeld', adminSeite.status === 401, `HTTP ${adminSeite.status}`)

  /* ------------------------------------------------ 5. Selbst-Registrierung */
  console.log('\n  \x1b[1mSelbst-Registrierung über die Stepper\x1b[0m')

  const json = (pfad, daten) =>
    hole(pfad, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(daten),
    })
  const sitzungAus = (antwort, rolle) =>
    (antwort.headers.get('set-cookie') ?? '').split(/,(?=\s*nm_)/).some((c) => c.trim().startsWith(`nm_session_${rolle}=`))

  const NEU_CLIPPER = 'neu-clipper@login-test.local'
  const clipperDaten = {
    platforms: ['tiktok', 'instagram'],
    workStatus: 'part_time',
    experience: 'hobby',
    availability: '10_to_20',
    fullName: 'Neu Clipper',
    email: NEU_CLIPPER,
    phoneDial: '+49',
    phone: '170 1234567',
    website: '',
    privacy: true,
  }

  d1(`DELETE FROM rate_limits;`)
  const clipperNeu = await json('/api/clippers', clipperDaten)
  const clipperNeuBody = await clipperNeu.json().catch(() => ({}))
  // Clipper sehen fremdes Rohmaterial — deshalb erst die Adresse per Code
  // bestätigen, dann das Dashboard. Keine Sitzung vor dem Code.
  pruefe(
    'Neuer Clipper bestätigt zuerst seine Adresse (Code-Eingabe, Ziel /work)',
    clipperNeu.status === 200 && String(clipperNeuBody.redirect).startsWith('/login/code?') && String(clipperNeuBody.redirect).includes('next=%2Fwork'),
    `HTTP ${clipperNeu.status} → ${JSON.stringify(clipperNeuBody)}`,
  )
  pruefe('Ohne Code gibt es keine Clipper-Sitzung', !sitzungAus(clipperNeu, 'clipper'))
  pruefe(
    'Zugang und Angaben sind gespeichert',
    zaehle(`SELECT count(*) AS n FROM clippers c JOIN users u ON u.id = c.user_id JOIN clipper_applications a ON a.clipper_id = c.id WHERE u.email='${NEU_CLIPPER}' AND u.role='clipper' AND a.availability='10_to_20';`) === 1,
  )
  legeCode(NEU_CLIPPER, '24681357')
  const clipperCode = await post('/login/code', { email: NEU_CLIPPER, code: '24681357', next: '/work' })
  pruefe(
    'Mit dem Code landet der neue Clipper in /work',
    clipperCode.status === 302 && clipperCode.headers.get('location') === '/work' && sitzungAus(clipperCode, 'clipper'),
    `HTTP ${clipperCode.status} → ${clipperCode.headers.get('location')}`,
  )
  pruefe(
    'Nach dem Code ist der Zugang aktiv und bestätigt',
    zaehle(`SELECT count(*) AS n FROM clippers c JOIN users u ON u.id = c.user_id WHERE u.email='${NEU_CLIPPER}' AND c.status='aktiv' AND u.verified_at IS NOT NULL;`) === 1,
  )

  const clipperNochmal = await json('/api/clippers', clipperDaten)
  const clipperNochmalBody = await clipperNochmal.json().catch(() => ({}))
  pruefe(
    'Bekannte Adresse bekommt KEINE Sitzung, sondern die Code-Eingabe',
    clipperNochmal.status === 200 && String(clipperNochmalBody.redirect).startsWith('/login/code?') && !sitzungAus(clipperNochmal, 'clipper'),
    `HTTP ${clipperNochmal.status} → ${JSON.stringify(clipperNochmalBody)}`,
  )
  pruefe(
    'Bekannte Adresse schreibt keine zweite Bewerbung',
    zaehle(`SELECT count(*) AS n FROM clipper_applications a JOIN clippers c ON c.id = a.clipper_id JOIN users u ON u.id = c.user_id WHERE u.email='${NEU_CLIPPER}';`) === 1,
  )

  const NEU_KUNDE = 'neu-kunde@login-test.local'
  const kundenDaten = {
    platforms: ['instagram'],
    industry: 'Gastronomie',
    footage: 'viel',
    budget: 'Bis zu 100',
    fullName: 'Neu Kunde',
    company: '',
    email: NEU_KUNDE,
    phoneDial: '+49',
    phone: '170 7654321',
    cloudLink: 'https://drive.google.com/drive/folders/test',
    website: '',
    privacy: true,
  }
  const kundeNeu = await json('/api/leads', kundenDaten)
  const kundeNeuBody = await kundeNeu.json().catch(() => ({}))
  pruefe('Neuer Kunde mit Cloud-Link landet in seinem ersten Projekt', kundeNeu.status === 200 && String(kundeNeuBody.redirect).startsWith('/app/projekt/'), `HTTP ${kundeNeu.status} → ${JSON.stringify(kundeNeuBody)}`)
  pruefe('Neuer Kunde ist sofort eingeloggt', sitzungAus(kundeNeu, 'customer'))
  pruefe(
    'Der Cloud-Link hängt am neuen Projekt',
    zaehle(`SELECT count(*) AS n FROM project_links l JOIN projects p ON p.id = l.project_id JOIN customers c ON c.id = p.customer_id JOIN users u ON u.id = c.user_id WHERE u.email='${NEU_KUNDE}';`) === 1,
  )

  // „Neue Kampagne“ im Kunden-Dashboard: Laufzeit und Reichweite hängen an der Kampagne
  const kundeCookie = (kundeNeu.headers.get('set-cookie') ?? '').split(/,(?=\s*nm_)/).map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('nm_session_customer=')) ?? ''
  const kundePost = (daten) => hole('/api/app/projects', { method: 'POST', headers: { 'content-type': 'application/json', cookie: kundeCookie }, body: JSON.stringify(daten) })
  const formularSeite = await hole('/app/neu', { headers: { cookie: kundeCookie } })
  pruefe('Kunde: Formular „Neue Kampagne“ ist erreichbar', formularSeite.status === 200 && (await formularSeite.text()).includes('data-customer-campaign'), `HTTP ${formularSeite.status}`)
  const falscheLaufzeit = await kundePost({ name: 'Herbst', durationDays: 45, views: 1000000 })
  const falscheViews = await kundePost({ name: 'Herbst', durationDays: 60, views: 1234567 })
  pruefe('Kunde: falsche Laufzeit und Reichweite werden abgewiesen', falscheLaufzeit.status === 400 && falscheViews.status === 400, `HTTP ${falscheLaufzeit.status}/${falscheViews.status}`)
  const kundeKampagne = await kundePost({ name: 'Herbst-Aktion', durationDays: 60, views: 2350000 })
  const kundeKampagneBody = await kundeKampagne.json().catch(() => ({}))
  pruefe(
    'Kunde: Kampagne mit Laufzeit 60 Tage und 2.350.000 Views ist angelegt',
    kundeKampagne.status === 200 &&
      zaehle(`SELECT count(*) AS n FROM projects WHERE id='${kundeKampagneBody.id}' AND briefing_duration_days=60 AND briefing_views=2350000;`) === 1,
    `HTTP ${kundeKampagne.status} → ${JSON.stringify(kundeKampagneBody)}`,
  )

  const kundeNochmal = await json('/api/leads', { ...kundenDaten, cloudLink: 'https://evil.example/fremd' })
  const kundeNochmalBody = await kundeNochmal.json().catch(() => ({}))
  pruefe(
    'Bekannte Kundenadresse bekommt KEINE Sitzung',
    kundeNochmal.status === 200 && String(kundeNochmalBody.redirect).startsWith('/login/code?') && !sitzungAus(kundeNochmal, 'customer'),
    `HTTP ${kundeNochmal.status} → ${JSON.stringify(kundeNochmalBody)}`,
  )
  pruefe(
    'Fremdes Formular legt im bestehenden Konto kein Projekt und keinen Link an',
    zaehle(`SELECT count(*) AS n FROM project_links WHERE url LIKE 'https://evil.example/%';`) === 0,
  )

  // Wer eine Adresse VOR ihrem Inhaber einträgt, bekommt als neuer Kunde
  // sofort eine Sitzung — die fällt weg, sobald der Inhaber sich mit Code meldet.
  const vorab = await json('/api/leads', { ...kundenDaten, email: 'vorab@login-test.local', cloudLink: '' })
  const vorabCookie = (vorab.headers.get('set-cookie') ?? '').split(';')[0]
  legeCode('vorab@login-test.local', '13572468')
  await post('/login/code', { email: 'vorab@login-test.local', code: '13572468' })
  const vorabDanach = await hole('/app', { headers: { cookie: vorabCookie } })
  pruefe(
    'Sitzung von vor dem ersten Code-Login wird verworfen',
    vorabCookie.startsWith('nm_session_customer=') && vorabDanach.status === 302,
    `${vorabCookie.slice(0, 24)} → HTTP ${vorabDanach.status}`,
  )

  d1(`DELETE FROM rate_limits;`)
  const fremdeRolle = await json('/api/leads', { ...kundenDaten, email: NEU_CLIPPER, cloudLink: '' })
  pruefe('Clipper-Adresse im Kunden-Formular wird abgewiesen', fremdeRolle.status === 400, `HTTP ${fremdeRolle.status}`)

  const httpLink = await json('/api/leads', { ...kundenDaten, email: 'link@login-test.local', cloudLink: 'http://drive.google.com/x' })
  pruefe('Cloud-Link ohne https wird abgewiesen', httpLink.status === 400, `HTTP ${httpLink.status}`)

  // Ein Sitzungs-Cookie, dessen Rollenname es nicht (mehr) gibt, wird
  // übernommen statt verworfen — sonst wäre nach jeder Umbenennung einer
  // Rolle jeder ausgeloggt.
  const altToken = randomBytes(32).toString('hex')
  const altHash = createHmac('sha256', SECRET).update(`session:${altToken}`).digest('hex')
  d1(`INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES ('s-alt','u-clip','${altHash}',${jetzt() + 3600},${jetzt()});`)
  const altCookie = await hole('/work', { headers: { cookie: `nm_session_altrolle=${altToken}` } })
  pruefe(
    'Alt-Cookie mit unbekanntem Rollennamen bleibt gültig und wird umgezogen',
    altCookie.status === 200 && sitzungAus(altCookie, 'clipper'),
    `HTTP ${altCookie.status}`,
  )

  // Creator: wie Clipper erst die Adresse per Code bestätigen. Mit Cloud-Link
  // entsteht die erste eigene Kampagne, in der er nach dem Code landet.
  d1(`DELETE FROM rate_limits;`)
  const NEU_CREATOR = 'neu-creator@login-test.local'
  const creatorDaten = {
    goal: 'beides',
    niche: 'Fitness & Sport',
    platforms: ['instagram', 'twitch'],
    handle_instagram: '@neucreator',
    handle_twitch: 'neucreator_live',
    openToAds: 'ja',
    followers: '10k_50k',
    viewsTotal: '100k_1m',
    views30d: '10k_100k',
    fullName: 'Neu Creator',
    email: NEU_CREATOR,
    phoneDial: '+49',
    phone: '170 1112223',
    cloudLink: 'https://drive.google.com/drive/folders/creator',
    website: '',
    privacy: true,
  }
  const creatorNeu = await json('/api/creators', creatorDaten)
  const creatorNeuBody = await creatorNeu.json().catch(() => ({}))
  const creatorZiel = new URLSearchParams(String(creatorNeuBody.redirect ?? '').split('?')[1] ?? '').get('next') ?? ''
  pruefe(
    'Neuer Creator bestätigt zuerst seine Adresse (Code-Eingabe, Ziel erste Kampagne)',
    creatorNeu.status === 200 && String(creatorNeuBody.redirect).startsWith('/login/code?') && creatorZiel.startsWith('/kampagnen/meine/'),
    `HTTP ${creatorNeu.status} → ${JSON.stringify(creatorNeuBody)}`,
  )
  pruefe('Ohne Code gibt es keine Creator-Sitzung', !sitzungAus(creatorNeu, 'creator'))
  pruefe(
    'Creator hat Profil, Kampagnen-Bereich, Bearbeiterprofil und den Cloud-Link',
    zaehle(`SELECT count(*) AS n FROM users u JOIN creators cr ON cr.user_id = u.id JOIN customers cu ON cu.user_id = u.id JOIN clippers cl ON cl.user_id = u.id JOIN projects p ON p.customer_id = cu.id JOIN project_links l ON l.project_id = p.id WHERE u.email='${NEU_CREATOR}' AND u.role='creator' AND cr.followers='10k_50k' AND cr.niche='Fitness & Sport' AND cr.handles LIKE '%neucreator%' AND cl.status='eingeladen';`) === 1,
  )
  legeCode(NEU_CREATOR, '97531864')
  const creatorCode = await post('/login/code', { email: NEU_CREATOR, code: '97531864', next: creatorZiel })
  const creatorCookie = (creatorCode.headers.get('set-cookie') ?? '').split(/,(?=\s*nm_)/).map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('nm_session_creator=')) ?? ''
  pruefe(
    'Mit dem Code landet der Creator in seiner ersten Kampagne',
    creatorCode.status === 302 && creatorCode.headers.get('location') === creatorZiel && !!creatorCookie,
    `HTTP ${creatorCode.status} → ${creatorCode.headers.get('location')}`,
  )
  pruefe(
    'Nach dem Code ist der Creator aktiv und bestätigt',
    zaehle(`SELECT count(*) AS n FROM clippers c JOIN users u ON u.id = c.user_id WHERE u.email='${NEU_CREATOR}' AND c.status='aktiv' AND u.verified_at IS NOT NULL;`) === 1,
  )
  const kampagnen = await hole('/kampagnen', { headers: { cookie: creatorCookie } })
  const kampagnenHtml = await kampagnen.text()
  pruefe('Creator sieht „Dein Kampagnen-Dashboard“', kampagnen.status === 200 && kampagnenHtml.includes('Dein Kampagnen-Dashboard'), `HTTP ${kampagnen.status}`)
  const creatorImKundenbereich = await hole('/app', { headers: { cookie: creatorCookie } })
  pruefe('Creator-Sitzung öffnet nicht den Kundenbereich', creatorImKundenbereich.status === 302, `HTTP ${creatorImKundenbereich.status}`)
  const creatorImClipperbereich = await hole('/work', { headers: { cookie: creatorCookie } })
  pruefe('Creator-Sitzung öffnet nicht den Clipper-Bereich', creatorImClipperbereich.status !== 200, `HTTP ${creatorImClipperbereich.status}`)

  const creatorNochmal = await json('/api/creators', { ...creatorDaten, followers: 'ueber_1m', cloudLink: 'https://evil.example/creator' })
  const creatorNochmalBody = await creatorNochmal.json().catch(() => ({}))
  pruefe(
    'Bekannte Creator-Adresse bekommt KEINE Sitzung und ändert nichts',
    creatorNochmal.status === 200 &&
      String(creatorNochmalBody.redirect).startsWith('/login/code?') &&
      !sitzungAus(creatorNochmal, 'creator') &&
      zaehle(`SELECT count(*) AS n FROM creators cr JOIN users u ON u.id = cr.user_id WHERE u.email='${NEU_CREATOR}' AND cr.followers='10k_50k';`) === 1 &&
      zaehle(`SELECT count(*) AS n FROM project_links WHERE url LIKE 'https://evil.example/%';`) === 0,
    `HTTP ${creatorNochmal.status} → ${JSON.stringify(creatorNochmalBody)}`,
  )
  const creatorAlsClipper = await json('/api/clippers', { ...clipperDaten, email: NEU_CREATOR })
  pruefe('Creator-Adresse im Clipper-Formular wird abgewiesen', creatorAlsClipper.status === 400, `HTTP ${creatorAlsClipper.status}`)

  // Fehlversuche zählen nicht gegen die Obergrenze: Wer mehrmals an einer
  // vergebenen Adresse oder einem leeren Feld scheitert, saß früher danach
  // eine Stunde vor „Zu viele Anfragen von dieser Verbindung“.
  d1(`DELETE FROM rate_limits;`)
  for (let i = 0; i < 12; i++) await json('/api/creators', { ...creatorDaten, email: CUSTOMER })
  for (let i = 0; i < 12; i++) await json('/api/creators', { ...creatorDaten, fullName: '' })
  const nachFehlversuchen = await json('/api/creators', {
    ...creatorDaten,
    email: 'nach-fehlversuchen@login-test.local',
    cloudLink: '',
  })
  pruefe('Fehlversuche sperren den Creator-Eintrag nicht', nachFehlversuchen.status === 200, `HTTP ${nachFehlversuchen.status}`)

  /* ------------------------------------------------------ 5b. Agenturen */
  //
  // /brands: kalt ohne Cooperation-Code, warm mit. Jeder Code gilt genau
  // einmal. Beide bestätigen ihre Adresse per Code und füllen das Briefing
  // aus; nur der warme Lead ist danach freigeschaltet.
  console.log('\n  \x1b[1mAgenturen (/brands)\x1b[0m')

  d1(`DELETE FROM rate_limits;`)
  d1(`INSERT INTO cooperation_codes (id,code,created_at) VALUES ('cc-test','WARM42',${jetzt()});`)
  const KALT = 'kalt@agentur-test.local'
  const WARM = 'warm@agentur-test.local'
  const agenturDaten = {
    platforms: ['tiktok', 'instagram'],
    clients: 'mehrere',
    kind: 'marketing',
    source: 'google',
    niche: 'E-Commerce',
    social_instagram: '@marke',
    footage: 'viel',
    footageLink: 'https://drive.google.com/drive/folders/agentur',
    fullName: 'Kalte Agentur',
    company: 'Kalt GmbH',
    email: KALT,
    phoneDial: '+49',
    phone: '170 5556667',
    cooperationCode: '',
    website: '',
    privacy: true,
  }
  const agenturZiel = (body) => new URLSearchParams(String(body.redirect ?? '').split('?')[1] ?? '').get('next') ?? ''
  const agenturSitzung = (antwort) =>
    (antwort.headers.get('set-cookie') ?? '').split(/,(?=\s*nm_)/).map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('nm_session_agency=')) ?? ''
  const agenturHole = (pfad, cookie, daten) =>
    hole(pfad, daten ? { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(daten) } : { headers: { cookie } })

  const kalt = await json('/api/agencies', agenturDaten)
  const kaltBody = await kalt.json().catch(() => ({}))
  pruefe(
    'Kalte Agentur bestätigt zuerst ihre Adresse (Ziel /collaboration, keine Sitzung)',
    kalt.status === 200 && String(kaltBody.redirect).startsWith('/login/code?') && agenturZiel(kaltBody) === '/collaboration' && !sitzungAus(kalt, 'agency'),
    `HTTP ${kalt.status} → ${JSON.stringify(kaltBody)}`,
  )
  pruefe(
    'Ohne Code ist die Agentur ein kalter Lead',
    zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN users u ON u.id = a.user_id WHERE u.email='${KALT}' AND u.role='agency' AND a.warm=0 AND a.access_at IS NULL;`) === 1,
  )

  pruefe(
    'Die zweite Frage („Kunden mit Interesse an Clipping?“) wird gespeichert',
    zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN users u ON u.id = a.user_id WHERE u.email='${KALT}' AND a.has_clients='mehrere';`) === 1,
  )
  const ohneKunden = await json('/api/agencies', { ...agenturDaten, email: 'ohne@agentur-test.local', clients: '' })
  pruefe('Ohne Antwort auf die Kunden-Frage wird nichts angelegt', ohneKunden.status === 400, `HTTP ${ohneKunden.status}`)

  const falscherCode = await json('/api/agencies', { ...agenturDaten, email: 'falsch@agentur-test.local', cooperationCode: 'ZZZZZZ' })
  pruefe(
    'Falscher Cooperation-Code wird abgewiesen und legt nichts an',
    falscherCode.status === 400 && zaehle(`SELECT count(*) AS n FROM users WHERE email='falsch@agentur-test.local';`) === 0,
    `HTTP ${falscherCode.status}`,
  )

  const warm = await json('/api/agencies', { ...agenturDaten, email: WARM, fullName: 'Warme Agentur', cooperationCode: 'warm-42' })
  pruefe(
    'Mit Cooperation-Code ist die Agentur ein warmer Lead, der Code ist verbraucht',
    warm.status === 200 &&
      zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN users u ON u.id = a.user_id JOIN cooperation_codes c ON c.id = a.code_id WHERE u.email='${WARM}' AND a.warm=1 AND c.used_at IS NOT NULL AND c.used_by = u.id;`) === 1,
    `HTTP ${warm.status}`,
  )
  const zweimal = await json('/api/agencies', { ...agenturDaten, email: 'zweiter@agentur-test.local', cooperationCode: 'WARM42' })
  pruefe('Derselbe Code gilt kein zweites Mal', zweimal.status === 400, `HTTP ${zweimal.status}`)

  legeCode(WARM, '24681357')
  const warmLogin = await post('/login/code', { email: WARM, code: '24681357', next: '/collaboration' })
  const warmCookie = agenturSitzung(warmLogin)
  pruefe('Mit dem Code landet die Agentur im Collaboration-Dashboard', warmLogin.status === 302 && warmLogin.headers.get('location') === '/collaboration' && !!warmCookie, `HTTP ${warmLogin.status}`)
  const briefingSeite = await (await agenturHole('/collaboration', warmCookie)).text()
  pruefe('Erst kommt das Briefing („Wie viele Views …“)', briefingSeite.includes('Wie viele Views möchtest du in Auftrag geben?'))
  const vorBriefing = await (await agenturHole('/collaboration/kampagnen', warmCookie)).text()
  pruefe('Vor dem Briefing ist auch ein warmer Lead gesperrt', vorBriefing.includes('data-locked-page'))
  const warmBriefing = await agenturHole('/api/collaboration/briefing', warmCookie, { views: 1000000, budget: 5000, package: 'armee_influencer' })
  const warmBriefingBody = await warmBriefing.json().catch(() => ({}))
  pruefe('Warmer Lead ist nach dem Briefing freigeschaltet', warmBriefing.status === 200 && warmBriefingBody.unlocked === true, JSON.stringify(warmBriefingBody))
  const warmKampagnen = await (await agenturHole('/collaboration/kampagnen', warmCookie)).text()
  pruefe('Freigeschaltet: Kampagnen ohne Schloss', !warmKampagnen.includes('data-locked-page') && warmKampagnen.includes('Alle Kampagnen von NIKKI MEDIA'))
  pruefe(
    'Das Briefing legt die erste Kampagne samt Link an',
    zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN projects p ON p.id = a.project_id JOIN project_links l ON l.project_id = p.id JOIN users u ON u.id = a.user_id WHERE u.email='${WARM}';`) === 1,
  )
  pruefe(
    'Das Briefing hängt an der ersten Kampagne',
    zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN projects p ON p.id = a.project_id JOIN users u ON u.id = a.user_id WHERE u.email='${WARM}' AND p.briefing_views=1000000 AND p.briefing_budget_cents=500000 AND p.briefing_package='armee_influencer';`) === 1,
  )

  // Jede weitere Kampagne beginnt mit dem Briefing — „Neue Kampagne“ ist ein
  // Link dorthin, kein Namensfeld, und der alte Weg ist für Agenturen zu.
  const meine = await (await agenturHole('/collaboration/meine', warmCookie)).text()
  pruefe(
    '„Neue Kampagne“ führt zum Briefing',
    meine.includes('<a href="/collaboration/neu" id="new-project"') && !/<button[^>]*data-open-new-project/.test(meine),
  )
  const neuSeite = await (await agenturHole('/collaboration/neu', warmCookie)).text()
  pruefe(
    'Neue Kampagne: Name, Bereich, Plattformen, Views, Budget, verbindlich',
    ['Wie soll die Kampagne heißen?', 'In welchem Bereich ist die Kampagne?', 'Auf welchen Plattformen soll die Kampagne laufen?',
      'Wie viele Views möchtest du in Auftrag geben?', 'Wie viel Budget möchtest du für diese Kampagne in Auftrag geben?',
      'Preis pro 1.000 Views', 'Rechtsverbindlicher Auftrag'].every((t) => neuSeite.includes(t)),
  )
  const ohneBriefing = await agenturHole('/api/app/projects', warmCookie, { name: 'Ohne Briefing' })
  pruefe('Agentur legt keine Kampagne ohne Briefing an', ohneBriefing.status === 403, `HTTP ${ohneBriefing.status}`)
  const neueKampagne = { name: 'Kunde Sommer', niche: 'Gastronomie', platforms: ['tiktok', 'instagram'], views: 500000, budget: '2500', binding: true }
  // Unser Preis (lib/agency.ts): für alle Bereiche fest 5 € je 1.000 Views (5.000 € pro 1 Mio.).
  const zuBillig = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, budget: '2000' })
  const zuTeuer = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, budget: '3000' })
  const pbFalsch = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, niche: 'Personal Brands', views: 1000000, budget: '6000' })
  const sonstZuBillig = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, niche: 'Fitness & Sport', budget: '2000' })
  pruefe(
    'Budget abweichend vom Preis 5 € je 1.000 Views wird abgewiesen, in jedem Bereich',
    zuBillig.status === 400 && zuTeuer.status === 400 && pbFalsch.status === 400 && sonstZuBillig.status === 400,
    `HTTP ${zuBillig.status}/${zuTeuer.status}/${pbFalsch.status}/${sonstZuBillig.status}`,
  )
  const ohneName = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, name: '' })
  const unverbindlich = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, binding: false })
  const ohnePlattform = await agenturHole('/api/collaboration/campaigns', warmCookie, { ...neueKampagne, platforms: [] })
  pruefe(
    'Neue Kampagne braucht Name, Plattform und die verbindliche Bestätigung',
    ohneName.status === 400 && unverbindlich.status === 400 && ohnePlattform.status === 400,
    `HTTP ${ohneName.status}/${unverbindlich.status}/${ohnePlattform.status}`,
  )
  const zweite = await agenturHole('/api/collaboration/campaigns', warmCookie, neueKampagne)
  const zweiteBody = await zweite.json().catch(() => ({}))
  pruefe(
    'Weitere Kampagne entsteht mit ihrem Briefing',
    zweite.status === 200 &&
      String(zweiteBody.redirect) === `/collaboration/meine/${zweiteBody.id}?angelegt=1` &&
      zaehle(`SELECT count(*) AS n FROM projects WHERE id='${String(zweiteBody.id).replace(/'/g, '')}' AND name='Kunde Sommer' AND briefing_views=500000 AND briefing_budget_cents=250000 AND briefing_niche='Gastronomie' AND briefing_platforms='["tiktok","instagram"]';`) === 1,
    `HTTP ${zweite.status} → ${JSON.stringify(zweiteBody)}`,
  )
  const zweiteSeite = await (await agenturHole(`/collaboration/meine/${zweiteBody.id}`, warmCookie)).text()
  pruefe('Die Kampagnenseite zeigt das Briefing samt Preis pro 1.000 Views', zweiteSeite.includes('data-briefing-info') && zweiteSeite.includes('500K Views') && zweiteSeite.includes('5 €'))

  const agenturImKundenbereich = await agenturHole('/app', warmCookie)
  pruefe('Agentur-Sitzung öffnet nicht den Kundenbereich', agenturImKundenbereich.status === 302, `HTTP ${agenturImKundenbereich.status}`)

  legeCode(KALT, '13572468')
  const kaltCookie = agenturSitzung(await post('/login/code', { email: KALT, code: '13572468', next: '/collaboration' }))
  const kaltBriefing = await agenturHole('/api/collaboration/briefing', kaltCookie, { views: 250000, budget: '1250', package: 'armee' })
  const kaltBriefingBody = await kaltBriefing.json().catch(() => ({}))
  pruefe('Kalter Lead bleibt nach dem Briefing gesperrt', kaltBriefing.status === 200 && kaltBriefingBody.unlocked === false, JSON.stringify(kaltBriefingBody))
  const kaltSeite = await (await agenturHole('/collaboration', kaltCookie)).text()
  pruefe('Kalter Lead sieht „NIKKI MEDIA meldet sich bei dir.“', kaltSeite.includes('NIKKI MEDIA meldet sich bei dir.'))
  const kaltCreator = await (await agenturHole('/collaboration/creator', kaltCookie)).text()
  pruefe('Kalter Lead sieht keine Creator', kaltCreator.includes('data-locked-page') && !kaltCreator.includes('data-creator='))
  const kaltUpload = await agenturHole('/api/app/projects', kaltCookie, { name: 'Versuch' })
  pruefe('Kalter Lead kann nichts anlegen oder hochladen', kaltUpload.status === 403, `HTTP ${kaltUpload.status}`)
  const kaltNeu = await agenturHole('/api/collaboration/campaigns', kaltCookie, { ...neueKampagne, name: 'Versuch' })
  pruefe('Kalter Lead startet keine weitere Kampagne', kaltNeu.status === 403, `HTTP ${kaltNeu.status}`)

  /* -------------------------------------------------- 5c. Demo-Konten */
  //
  // theguardians (Agentur, erfundenes Netzwerk, echte eigene Kampagnen),
  // theguardianscreator und theguardiansclipper (ganz regulär). Passwort-
  // Login nur für Demo-Konten; die Demo-Agentur bucht den Demo-Creator
  // (sofort bestätigt) und weist den Demo-Clipper zu.
  console.log('\n  \x1b[1mDemo-Konten\x1b[0m')

  d1(`DELETE FROM rate_limits;`)
  const DEMO_PW = 'Demo-Test-4711'
  d1(demoAccountSql(DEMO_PW))
  pruefe(
    'Demo-Konten sind angelegt (Agentur freigeschaltet, alle demo=1)',
    zaehle(`SELECT count(*) AS n FROM agency_leads a JOIN users u ON u.id = a.user_id WHERE u.email='${DEMO_EMAIL}' AND a.demo=1 AND a.access_at IS NOT NULL;`) === 1 &&
      zaehle(`SELECT count(*) AS n FROM users WHERE demo=1 AND email IN ('${DEMO_EMAIL}','${DEMO_CREATOR_EMAIL}','${DEMO_CLIPPER_EMAIL}');`) === 3,
  )
  const sitzungFuer = (antwort, rolle) =>
    (antwort.headers.get('set-cookie') ?? '').split(/,(?=\s*nm_)/).map((c) => c.trim().split(';')[0]).find((c) => c.startsWith(`nm_session_${rolle}=`)) ?? ''
  const demoFalsch = await post('/login/demo', { email: DEMO_EMAIL, password: 'falsch' })
  pruefe('Demo: falsches Passwort wird abgewiesen', demoFalsch.status === 200 && !sitzungAus(demoFalsch, 'agency'), `HTTP ${demoFalsch.status}`)
  const fremdDemo = await post('/login/demo', { email: WARM, password: DEMO_PW })
  pruefe('Demo-Login öffnet kein echtes Konto', fremdDemo.status === 200 && !sitzungAus(fremdDemo, 'agency'), `HTTP ${fremdDemo.status}`)
  const demoLogin = await post('/login/demo', { email: DEMO_EMAIL, password: DEMO_PW })
  const demoCookie = sitzungFuer(demoLogin, 'agency')
  pruefe(
    'Demo-Agentur: E-Mail + Passwort führen ins Collaboration-Dashboard',
    demoLogin.status === 302 && demoLogin.headers.get('location') === '/collaboration' && !!demoCookie,
    `HTTP ${demoLogin.status}`,
  )
  const demoCode = await post('/login', { email: DEMO_EMAIL, next: '/collaboration' })
  pruefe(
    'Demo: Code-Login leitet zum Passwort-Login',
    demoCode.status === 303 && String(demoCode.headers.get('location')).startsWith('/login/demo'),
    `HTTP ${demoCode.status} → ${demoCode.headers.get('location')}`,
  )
  // Jasons eigene Demo-Konten: je Dashboard eines, festes Passwort, kein Code per Mail
  const JASON_PW = 'Jason-Test-9899!$$'
  d1(jasonDemoSql(JASON_PW))
  pruefe(
    'Jasons Demo-Konten sind angelegt (4 Rollen, alle demo=1, Kunde freigegeben)',
    zaehle(`SELECT count(*) AS n FROM users WHERE demo=1 AND email IN ('${Object.values(JASON_DEMO).join("','")}');`) === 4 &&
      zaehle(`SELECT count(*) AS n FROM customers c JOIN users u ON u.id = c.user_id WHERE u.email='${JASON_DEMO.customer}' AND c.converted_at IS NOT NULL;`) === 1,
  )
  const ziele = { agency: '/collaboration', creator: '/kampagnen', customer: '/app', clipper: '/work' }
  let jasonOk = true, jasonInfo = ''
  for (const [rolle, mail] of Object.entries(JASON_DEMO)) {
    const r = await post('/login/demo', { email: mail, password: JASON_PW })
    const ok = r.status === 302 && r.headers.get('location') === ziele[rolle] && !!sitzungFuer(r, rolle)
    if (!ok) { jasonOk = false; jasonInfo += `${rolle}: HTTP ${r.status} → ${r.headers.get('location')} ` }
  }
  pruefe('Jasons Demo-Konten: E-Mail + Passwort führen ins jeweilige Dashboard', jasonOk, jasonInfo)
  const jasonCode = await post('/login', { email: JASON_DEMO.customer, next: '/app' })
  pruefe(
    'Jasons Demo-Konten: Code-Login schickt keinen Code, sondern zum Passwort-Login',
    jasonCode.status === 303 && String(jasonCode.headers.get('location')).startsWith('/login/demo'),
    `HTTP ${jasonCode.status} → ${jasonCode.headers.get('location')}`,
  )

  const demoUebersicht = await (await agenturHole('/collaboration', demoCookie)).text()
  pruefe(
    'Demo: Übersicht mit den Zahlen und „Neue Kampagne erstellen“',
    ['>500<', '>347.837<', '>1 Mrd.<', '>5.000<', '>200<', 'Neue Kampagne erstellen', 'Alle meine Kampagnen'].every((t) => demoUebersicht.includes(t)),
  )
  const demoClipperSeite = await (await agenturHole('/collaboration/clipper?seite=100', demoCookie)).text()
  pruefe('Demo: 5.000 Clipper auf 100 Seiten', demoClipperSeite.includes('</b> von 100</span>'))
  const demoKampagne = await agenturHole('/collaboration/kampagne/demo-1', demoCookie)
  pruefe('Demo: erfundene Kampagne mit Clips', demoKampagne.status === 200 && (await demoKampagne.text()).includes('weitere Clips'), `HTTP ${demoKampagne.status}`)

  const demoProjekt = d1(
    `SELECT p.id FROM projects p JOIN customers c ON c.id = p.customer_id JOIN users u ON u.id = c.user_id WHERE u.email='${DEMO_EMAIL}' AND p.name='Fitness-Launch Herbst';`,
  )[0]?.id
  const demoCreatorId = d1(`SELECT cr.id FROM creators cr JOIN users u ON u.id = cr.user_id WHERE u.email='${DEMO_CREATOR_EMAIL}';`)[0]?.id
  const demoClipperId = d1(`SELECT cl.id FROM clippers cl JOIN users u ON u.id = cl.user_id WHERE u.email='${DEMO_CLIPPER_EMAIL}';`)[0]?.id
  const fiktiv = await agenturHole('/api/collaboration/bookings', demoCookie, { creatorId: 'demo-creator-0', projectId: demoProjekt })
  pruefe('Demo: erfundene Creator lassen sich nicht buchen', fiktiv.status === 403, `HTTP ${fiktiv.status}`)
  const buchung = await agenturHole('/api/collaboration/bookings', demoCookie, { creatorId: demoCreatorId, projectId: demoProjekt })
  const buchungBody = await buchung.json().catch(() => ({}))
  pruefe(
    'Demo: Buchung des Demo-Creators ist sofort bestätigt, er ist im Team',
    buchung.status === 200 && buchungBody.confirmed === true &&
      zaehle(`SELECT count(*) AS n FROM project_workers pw JOIN clippers cl ON cl.id = pw.clipper_id JOIN users u ON u.id = cl.user_id WHERE pw.project_id='${demoProjekt}' AND u.email='${DEMO_CREATOR_EMAIL}';`) === 1,
    `HTTP ${buchung.status} → ${JSON.stringify(buchungBody)}`,
  )
  const zuweisung = await agenturHole('/api/collaboration/assign-clipper', demoCookie, { clipperId: demoClipperId, projectId: demoProjekt })
  pruefe(
    'Demo: Demo-Clipper lässt sich zuweisen',
    zuweisung.status === 200 &&
      zaehle(`SELECT count(*) AS n FROM project_workers WHERE project_id='${demoProjekt}' AND clipper_id='${demoClipperId}';`) === 1,
    `HTTP ${zuweisung.status}`,
  )
  const echteZuweisung = await agenturHole('/api/collaboration/assign-clipper', warmCookie, { clipperId: demoClipperId, projectId: zweiteBody.id })
  pruefe('Echte Agenturen weisen keine Clipper zu', echteZuweisung.status === 403, `HTTP ${echteZuweisung.status}`)

  // Clipper buchen (Migration 0028): wie Creator nur eine Anfrage; ins Team erst mit der Bestätigung im Admin.
  const clipperBuchung = await agenturHole('/api/collaboration/bookings', warmCookie, { clipperId: 'c-1', projectId: zweiteBody.id, message: 'Hooks zuerst' })
  const clipperBuchungBody = await clipperBuchung.json().catch(() => ({}))
  const clipperBuchungId = String(clipperBuchungBody.id ?? '').replace(/'/g, '')
  pruefe(
    'Echte Agentur bucht einen Clipper: Anfrage, noch nicht im Team',
    clipperBuchung.status === 200 && !clipperBuchungBody.confirmed &&
      zaehle(`SELECT count(*) AS n FROM clipper_bookings WHERE id='${clipperBuchungId}' AND status='angefragt' AND clipper_id='c-1';`) === 1 &&
      zaehle(`SELECT count(*) AS n FROM project_workers WHERE project_id='${zweiteBody.id}' AND clipper_id='c-1';`) === 0,
    `HTTP ${clipperBuchung.status} → ${JSON.stringify(clipperBuchungBody)}`,
  )
  const clipperDoppelt = await agenturHole('/api/collaboration/bookings', warmCookie, { clipperId: 'c-1', projectId: zweiteBody.id })
  pruefe('Denselben Clipper nicht zweimal für dieselbe Kampagne buchen', clipperDoppelt.status === 409, `HTTP ${clipperDoppelt.status}`)
  const demoClipperEcht = await agenturHole('/api/collaboration/bookings', warmCookie, { clipperId: demoClipperId, projectId: zweiteBody.id })
  pruefe('Echte Agentur bucht keine Demo-Clipper', demoClipperEcht.status === 404, `HTTP ${demoClipperEcht.status}`)
  const fiktiverClipper = await agenturHole('/api/collaboration/bookings', demoCookie, { clipperId: 'demo-clipper-0', projectId: demoProjekt })
  pruefe('Demo: erfundene Clipper lassen sich nicht buchen', fiktiverClipper.status === 403, `HTTP ${fiktiverClipper.status}`)
  d1(`DELETE FROM rate_limits;`)
  const adminBuchung = ((await post('/login/admin', { email: ADMIN, password: ADMIN_PW })).headers.get('set-cookie') ?? '').split(';')[0]
  const clipperBestaetigt = await hole(`/api/admin/bookings/${clipperBuchungId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminBuchung },
    body: JSON.stringify({ accept: true }),
  })
  pruefe(
    'Admin bestätigt die Clipper-Buchung, der Clipper ist im Team',
    clipperBestaetigt.status === 200 &&
      zaehle(`SELECT count(*) AS n FROM clipper_bookings WHERE id='${clipperBuchungId}' AND status='bestaetigt';`) === 1 &&
      zaehle(`SELECT count(*) AS n FROM project_workers WHERE project_id='${zweiteBody.id}' AND clipper_id='c-1';`) === 1,
    `HTTP ${clipperBestaetigt.status}`,
  )
  const buchungsSeite = await (await agenturHole('/collaboration/buchungen', warmCookie)).text()
  pruefe('Buchungen der Agentur zeigen die Clipper-Buchung', buchungsSeite.includes('Test Clipper') && buchungsSeite.includes('Bestätigt'))

  const creatorLogin = await post('/login/demo', { email: DEMO_CREATOR_EMAIL, password: DEMO_PW })
  const demoCreatorCookie = sitzungFuer(creatorLogin, 'creator')
  const creatorSeite = await (await hole('/kampagnen/finden', { headers: { cookie: demoCreatorCookie } })).text()
  pruefe('Demo-Creator meldet sich an und sieht die Kampagne', creatorLogin.status === 302 && !!demoCreatorCookie && creatorSeite.includes('Fitness-Launch Herbst'), `HTTP ${creatorLogin.status}`)
  const clipperLogin = await post('/login/demo', { email: DEMO_CLIPPER_EMAIL, password: DEMO_PW })
  const demoClipperCookie = sitzungFuer(clipperLogin, 'clipper')
  const clipperSeite = await (await hole('/work', { headers: { cookie: demoClipperCookie } })).text()
  pruefe('Demo-Clipper meldet sich an und sieht die Kampagne', clipperLogin.status === 302 && !!demoClipperCookie && clipperSeite.includes('Fitness-Launch Herbst'), `HTTP ${clipperLogin.status}`)

  const echteCreator = await (await agenturHole('/collaboration/creator', warmCookie)).text()
  const echteClipper = await (await agenturHole('/collaboration/clipper', warmCookie)).text()
  pruefe(
    'Echte Agentur sieht weder erfundene noch Demo-Konten',
    !echteClipper.includes('</b> von 100</span>') && !echteClipper.includes('theguardiansclipper') && !echteCreator.includes('theguardianscreator'),
  )

  /* -------------------------------------------------------- 6. Selbsttest */
  console.log('\n  \x1b[1mSelbsttest der Anmeldung\x1b[0m')

  d1(`DELETE FROM rate_limits;`)
  const adminSitzung = (
    (await post('/login/admin', { email: ADMIN, password: ADMIN_PW })).headers.get('set-cookie') ?? ''
  ).split(';')[0]
  const health = await hole('/api/admin/health/login', { headers: { cookie: adminSitzung } })
  const bericht = await health.json().catch(() => ({}))
  const gescheitert = (bericht.checks ?? []).filter((c) => !c.ok).map((c) => c.name)
  // Ohne RESEND_API_KEY meldet der Selbsttest hier zurecht einen Fehler —
  // alles andere muss stehen.
  pruefe(
    'Selbsttest prüft den Anmeldeweg',
    (bericht.checks ?? []).length >= 7 && gescheitert.every((n) => n === 'Mailversand eingerichtet'),
    gescheitert.join(', '),
  )

  // Um 07:00 UTC feuern beide Cron-Zeitpläne zugleich, der Selbsttest lief
  // dann zweimal parallel. Teilten sich beide Läufe eine Testadresse, räumte
  // der eine dem anderen die Codes weg — falscher Alarm, jeden Morgen.
  const parallel = await Promise.all(
    [1, 2, 3, 4, 5, 6].map(async () => {
      const res = await hole('/api/admin/health/login', { headers: { cookie: adminSitzung } })
      const b = await res.json().catch(() => ({}))
      return (b.checks ?? []).filter((c) => !c.ok && c.name !== 'Mailversand eingerichtet').map((c) => c.name)
    }),
  )
  pruefe('Mehrere Selbsttests gleichzeitig stören sich nicht', parallel.every((f) => f.length === 0), parallel.flat().join(', '))
} catch (err) {
  durchgefallen.push(String(err))
  console.log(`\n\x1b[31m✘ ${err}\x1b[0m`)
} finally {
  aufraeumen(server)
}

console.log('')
if (durchgefallen.length) {
  // Die Ausgabe des Workers ist bei einem Fehlschlag das Erste, was man
  // sehen will — sonst rät man an einer 500 herum.
  const spur = protokoll.trim().split('\n').slice(-25).join('\n')
  if (spur) console.log(`\x1b[2m── Worker-Ausgabe ──\n${spur}\n\x1b[0m`)
  console.log(`\x1b[31m\x1b[1m✘ Login-Test: ${durchgefallen.length} Prüfung(en) durchgefallen, ${bestanden} bestanden\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m\x1b[1m✓ Login-Test: alle ${bestanden} Prüfungen bestanden\x1b[0m\n`)
process.exit(0)
