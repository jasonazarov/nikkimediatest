#!/usr/bin/env node
/**
 * Die Demo-Konten anlegen, oder ihre Passwörter neu setzen. Siehe
 * src/lib/demo.ts:
 *
 *   theguardians          Agentur: Netzwerk mit erfundenen Zahlen, dazu zwei
 *                         echte eigene Kampagnen
 *   theguardianscreator   Creator, ganz regulär
 *   theguardiansclipper   Clipper, ganz regulär
 *
 *     node scripts/demo-account.mjs            live (D1 remote)
 *     node scripts/demo-account.mjs --local    lokale Datenbank (wrangler dev)
 *
 * Die Passwörter kommen aus DEMO_PASSWORD (dann für alle drei dasselbe) bzw.
 * DEMO_PASSWORD_AGENCY / _CREATOR / _CLIPPER, sonst wird je Konto ein neues
 * erzeugt. Sie werden einmal ausgegeben und
 * nirgends gespeichert; in der Datenbank steht nur der Hash (PBKDF2-SHA256,
 * dasselbe Format wie hashPassword in src/lib/auth.ts).
 *
 * Mehrfach ausführen ist unbedenklich: Was schon da ist, bleibt; nur die
 * Passwörter werden ersetzt. Angemeldet wird unter https://nikkimedia.co/login/demo.
 */
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

export const DEMO_EMAIL = 'theguardians@demo.nikkimedia.co'
export const DEMO_CREATOR_EMAIL = 'theguardianscreator@demo.nikkimedia.co'
export const DEMO_CLIPPER_EMAIL = 'theguardiansclipper@demo.nikkimedia.co'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Ohne 0/O und 1/l/I: Das Passwort wird abgetippt. */
function newPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join('')
}

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256')
  return `pbkdf2$sha256$100000$${salt.toString('hex')}$${hash.toString('hex')}`
}

const userOf = (email, role) => `(SELECT id FROM users WHERE email = '${email}' AND role = '${role}')`

/** Nutzer anlegen (falls neu), Passwort setzen, als Demo markieren. */
function userSql(email, role, name, password, ts) {
  const hash = hashPassword(password)
  return `
INSERT INTO users (id, email, role, full_name, phone, password_hash, password_set_at, verified_at, created_at, demo)
  SELECT '${randomUUID()}', '${email}', '${role}', '${name}', NULL, '${hash}', ${ts}, ${ts}, ${ts}, 1
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '${email}');
UPDATE users SET password_hash = '${hash}', password_set_at = ${ts}, demo = 1 WHERE email = '${email}' AND role = '${role}';`
}

/** Arbeitsbereich (Kampagnen, Ordner, Uploads), wie ihn Agenturen und Creator haben. */
function customerSql(user, company, ts) {
  return `
INSERT INTO customers (id, user_id, company, storage_bytes, created_at)
  SELECT '${randomUUID()}', ${user}, ${company ? `'${company}'` : 'NULL'}, 0, ${ts}
  WHERE ${user} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE user_id = ${user});`
}

/** Bearbeiterprofil, darüber bekommen Clipper und Creator Kampagnen zugeordnet. */
function clipperRowSql(user, name, ts) {
  return `
INSERT INTO clippers (id, user_id, display_name, status, created_at)
  SELECT '${randomUUID()}', ${user}, '${name}', 'aktiv', ${ts}
  WHERE ${user} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clippers WHERE user_id = ${user});`
}

/** Eine echte Kampagne der Demo-Agentur, samt Briefing und Startordner. */
function campaignSql(customer, name, b, ts) {
  const project = `(SELECT id FROM projects WHERE customer_id = ${customer} AND name = '${name}')`
  return `
INSERT INTO projects (id, customer_id, name, status, creator_distribution, briefing_views, briefing_budget_cents,
                      briefing_niche, briefing_platforms, created_at)
  SELECT '${randomUUID()}', ${customer}, '${name}', 'aktiv', 0, ${b.views}, ${b.budgetCents}, '${b.niche}', '${JSON.stringify(b.platforms)}', ${ts}
  WHERE ${customer} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE customer_id = ${customer} AND name = '${name}');
INSERT INTO folders (id, customer_id, project_id, name, parent_id, created_at)
  SELECT '${randomUUID()}', ${customer}, ${project}, 'Rohmaterial', NULL, ${ts}
  WHERE ${project} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM folders WHERE project_id = ${project});`
}

/** Alle Anweisungen auf einmal: legt nur an, was fehlt, und setzt die Passwörter. */
export function demoAccountSql(passwords) {
  const ts = Math.floor(Date.now() / 1000)
  const pw = typeof passwords === 'string' ? { agency: passwords, creator: passwords, clipper: passwords } : passwords

  // --- Agentur
  const agency = userOf(DEMO_EMAIL, 'agency')
  const agencyCustomer = `(SELECT id FROM customers WHERE user_id = ${agency})`
  let sql = userSql(DEMO_EMAIL, 'agency', 'theguardians', pw.agency, ts) + customerSql(agency, 'theguardians', ts)
  sql += `
INSERT INTO agency_leads (id, user_id, customer_id, company, kind, has_clients, platforms, source, niche, socials,
                          footage, warm, access_at, views_target, budget_cents, package, briefed_at, demo, created_at)
  SELECT '${randomUUID()}', ${agency}, ${agencyCustomer}, 'theguardians', 'marketing', 'mehrere',
         '["tiktok","instagram","youtube","facebook"]', 'empfehlung', 'Entertainment', '{}',
         'viel', 1, ${ts}, 10000000, 5000000, 'armee_influencer_ugc', ${ts}, 1, ${ts}
  WHERE ${agency} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agency_leads WHERE user_id = ${agency});
UPDATE agency_leads SET demo = 1, warm = 1, access_at = COALESCE(access_at, ${ts}), briefed_at = COALESCE(briefed_at, ${ts})
  WHERE user_id = ${agency};`
  sql += campaignSql(agencyCustomer, 'Fitness-Launch Herbst', { views: 1_000_000, budgetCents: 800_000, niche: 'Fitness & Sport', platforms: ['tiktok', 'instagram'] }, ts)
  sql += campaignSql(agencyCustomer, 'Restaurant-Eröffnung', { views: 500_000, budgetCents: 450_000, niche: 'Gastronomie', platforms: ['instagram', 'tiktok', 'facebook'] }, ts - 86_400)

  // --- Creator: Angaben, Arbeitsbereich für eigene Kampagnen, Bearbeiterprofil
  const creator = userOf(DEMO_CREATOR_EMAIL, 'creator')
  sql += userSql(DEMO_CREATOR_EMAIL, 'creator', 'theguardianscreator', pw.creator, ts)
  sql += `
INSERT INTO creators (id, user_id, goal, niche, platforms, open_to_ads, followers, views_total, views_30d, handles, created_at)
  SELECT '${randomUUID()}', ${creator}, 'beides', 'Entertainment', '["instagram","tiktok","youtube"]', 'ja',
         '100k_1m', '1m_10m', '500k_1m', '{}', ${ts}
  WHERE ${creator} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM creators WHERE user_id = ${creator});`
  sql += customerSql(creator, null, ts) + clipperRowSql(creator, 'theguardianscreator', ts)

  // --- Clipper: Bearbeiterprofil und Bewerbung (Plattformen, Erfahrung)
  const clipper = userOf(DEMO_CLIPPER_EMAIL, 'clipper')
  const clipperRow = `(SELECT id FROM clippers WHERE user_id = ${clipper})`
  sql += userSql(DEMO_CLIPPER_EMAIL, 'clipper', 'theguardiansclipper', pw.clipper, ts) + clipperRowSql(clipper, 'theguardiansclipper', ts)
  sql += `
INSERT INTO clipper_applications (id, clipper_id, platforms, work_status, experience, availability, created_at)
  SELECT '${randomUUID()}', ${clipperRow}, '["tiktok","instagram","youtube"]', 'full_time', 'professional', '20_plus', ${ts}
  WHERE ${clipperRow} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clipper_applications WHERE clipper_id = ${clipperRow});`
  return sql
}

function main() {
  const local = process.argv.includes('--local')
  const persistAt = process.argv.indexOf('--persist-to')
  // DEMO_PASSWORD gilt für alle drei; DEMO_PASSWORD_AGENCY / _CREATOR / _CLIPPER
  // je Konto, z. B. um ein schon weitergegebenes Passwort zu behalten.
  const env = process.env
  const pick = (key) => env[`DEMO_PASSWORD_${key}`] || env.DEMO_PASSWORD || newPassword()
  const passwords = { agency: pick('AGENCY'), creator: pick('CREATOR'), clipper: pick('CLIPPER') }
  const target = local
    ? ['--local', ...(persistAt > 0 ? ['--persist-to', process.argv[persistAt + 1]] : [])]
    : ['--remote']
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', 'nikki-media', ...target, '--command', demoAccountSql(passwords)], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr)
    process.exit(1)
  }
  console.log(`\nDemo-Konten bereit (${local ? 'lokal' : 'live'}), Login: https://nikkimedia.co/login/demo\n`)
  console.log(`  Agentur   ${DEMO_EMAIL}   Passwort: ${passwords.agency}`)
  console.log(`  Creator   ${DEMO_CREATOR_EMAIL}   Passwort: ${passwords.creator}`)
  console.log(`  Clipper   ${DEMO_CLIPPER_EMAIL}   Passwort: ${passwords.clipper}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
