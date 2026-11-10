#!/usr/bin/env node
/**
 * Ein Agentur-Konto mit E-Mail und Passwort anlegen, oder sein Passwort neu setzen.
 *
 * Vorgabe des Auftraggebers (November 2026): manche Agenturen melden sich mit
 * E-Mail und Passwort an statt mit dem Code per Mail. Das Konto ist ein ganz
 * normaler KALTER Lead, wie nach einem Eintrag auf /brands ohne Cooperation-Code:
 * nach dem Login das Briefing, danach „NIKKI MEDIA meldet sich bei dir“, bis der
 * Administrator es unter „Agenturen“ warm setzt oder freigibt. KEIN Demo-Konto
 * (users.demo = 0): kein erfundenes Netzwerk, echte Mails.
 *
 *     node scripts/agentur-konto.mjs <email> ["Name"]            live (D1 remote)
 *     node scripts/agentur-konto.mjs <email> ["Name"] --local    lokale Datenbank
 *
 * Das Passwort kommt aus AGENTUR_PASSWORT, sonst fragt das Skript danach (die
 * Eingabe bleibt unsichtbar). Es steht nirgends im Repo; in der Datenbank steht nur
 * der Hash (PBKDF2-SHA256, dasselbe Format wie hashPassword in src/lib/auth.ts).
 * Angemeldet wird unter https://nikkimedia.co/login: die Seite leitet die Adresse
 * zum Passwort-Feld (/login/passwort), ein Code wird nicht verschickt.
 *
 * Mehrfach ausführen ist unbedenklich: was schon da ist, bleibt, nur das Passwort
 * wird ersetzt. Gehört die Adresse schon einem anderen Zugang (Kunde, Clipper,
 * Creator, Admin, Demo), bricht das Skript ab und ändert nichts.
 */
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASSWORD_MIN = 10

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256')
  return `pbkdf2$sha256$100000$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** SQL-Text in Anführungszeichen, einfache Anführungszeichen verdoppelt. */
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

/** Alle Anweisungen auf einmal. Legt nur an, was fehlt, und setzt das Passwort. */
export function agencyAccountSql(email, name, password, ts = Math.floor(Date.now() / 1000)) {
  const mail = email.trim().toLowerCase()
  const hash = hashPassword(password)
  const user = `(SELECT id FROM users WHERE email = ${q(mail)} AND role = 'agency' AND demo = 0)`
  const customer = `(SELECT id FROM customers WHERE user_id = ${user})`
  return `
INSERT INTO users (id, email, role, full_name, phone, password_hash, password_set_at, verified_at, created_at, demo)
  SELECT '${randomUUID()}', ${q(mail)}, 'agency', ${q(name)}, NULL, '${hash}', ${ts}, ${ts}, ${ts}, 0
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${q(mail)});
UPDATE users SET password_hash = '${hash}', password_set_at = ${ts} WHERE email = ${q(mail)} AND role = 'agency' AND demo = 0;
INSERT INTO customers (id, user_id, company, storage_bytes, created_at)
  SELECT '${randomUUID()}', ${user}, ${q(name)}, 0, ${ts}
  WHERE ${user} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE user_id = ${user});
INSERT INTO agency_leads (id, user_id, customer_id, company, kind, kind_other, has_clients, platforms, source, niche, socials,
                          footage, warm, access_at, briefed_at, demo, created_at)
  SELECT '${randomUUID()}', ${user}, ${customer}, ${q(name)}, 'sonstiges', 'Vom Admin angelegt (Login mit Passwort)', NULL,
         '[]', 'admin', '', '{}', '', 0, NULL, NULL, 0, ${ts}
  WHERE ${user} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agency_leads WHERE user_id = ${user});`
}

/** Eingabe ohne Echo (für das Passwort). Ohne Terminal: erste Zeile von stdin. */
function ask(prompt) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(prompt)
    if (!stdin.isTTY) {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (d) => (buf += d))
      stdin.on('end', () => resolve(buf.split(/\r?\n/)[0]))
      return
    }
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          stdout.write('\n')
          process.exit(1)
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

function d1(targetArgs, command, json = false) {
  return spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'nikki-media', ...targetArgs, ...(json ? ['--json'] : []), '--command', command],
    { cwd: ROOT, encoding: 'utf8' },
  )
}

async function main() {
  const args = process.argv.slice(2)
  const local = args.includes('--local')
  const persistAt = args.indexOf('--persist-to')
  const positional = args.filter((a, i) => !a.startsWith('--') && !(persistAt >= 0 && i === persistAt + 1))
  const email = (positional[0] ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    console.error('Bitte die E-Mail-Adresse angeben:  node scripts/agentur-konto.mjs agentur@beispiel.de ["Name"]')
    process.exit(1)
  }
  const fromMail = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  const name = (positional[1] ?? '').trim() || fromMail.charAt(0).toUpperCase() + fromMail.slice(1)
  const targetArgs = local
    ? ['--local', ...(persistAt >= 0 ? ['--persist-to', args[persistAt + 1]] : [])]
    : ['--remote']

  // Gehört die Adresse schon einem anderen Zugang? Dann nichts anfassen.
  const check = d1(targetArgs, `SELECT role, demo FROM users WHERE email = ${q(email)};`, true)
  if (check.status !== 0) {
    console.error(check.stdout, check.stderr)
    process.exit(1)
  }
  const existing = JSON.parse(check.stdout)?.[0]?.results?.[0]
  if (existing && (existing.role !== 'agency' || existing.demo === 1)) {
    console.error(`✘ ${email} gehört schon einem anderen Zugang (${existing.role}${existing.demo === 1 ? ', Demo' : ''}). Nichts geändert.`)
    process.exit(1)
  }

  const password = process.env.AGENTUR_PASSWORT ?? (await ask(`Passwort für ${email}: `))
  if (password.length < PASSWORD_MIN) {
    console.error(`✘ Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen. Nichts geändert.`)
    process.exit(1)
  }

  const run = d1(targetArgs, agencyAccountSql(email, name, password))
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr)
    process.exit(1)
  }
  console.log(`\n✓ Agentur-Konto ${existing ? 'gab es schon, neues Passwort gesetzt' : 'angelegt'} (${local ? 'lokal' : 'live'}): ${email}`)
  console.log('  Kalter Lead: nach dem Login das Briefing, Freischaltung im Admin unter „Agenturen“.')
  console.log(`  Login: ${local ? 'http://localhost:8080' : 'https://nikkimedia.co'}/login  (E-Mail eingeben, dann Passwort)\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
