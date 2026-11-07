#!/usr/bin/env node
/**
 * Fachartikel-Entwürfe aus docs/fachartikel/*.md in die Datenbank laden,
 * UNVERÖFFENTLICHT (published = 0). Danach im Admin unter „Fachartikel“
 * prüfen, anpassen und mit dem Häkchen „Published“ freischalten.
 *
 *   node scripts/fachartikel-import.mjs            → live (nikkimedia.co)
 *   node scripts/fachartikel-import.mjs --local    → lokale Vorschau-Datenbank
 *
 * Gibt es eine Adresse (slug) schon, bleibt der vorhandene Artikel unberührt
 * (INSERT OR IGNORE). Ein zweiter Lauf überschreibt also keine Änderungen.
 *
 * Zusätze (Vorgabe des Auftraggebers, November 2026: „so wie in der Demo“):
 *   --veroeffentlichen   Artikel sofort veröffentlichen (published = 1)
 *   --ersetzen           vorhandene Artikel derselben Adresse durch die Fassung aus
 *                        docs/fachartikel ersetzen (Titel, Kurzfassung, Text, Autor)
 *
 *   node scripts/fachartikel-import.mjs --veroeffentlichen --ersetzen   → wie in der Demo, live
 *
 * Live fragt das Skript vor dem Schreiben einmal nach (j/n).
 * Format der Dateien: Kopf zwischen „---“ (title, slug, excerpt, author),
 * darunter der Text im Format des Editors (## , ### , - , 1. , > , **fett**, [Text](/pfad)).
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname
const dir = join(root, 'docs/fachartikel')
const local = process.argv.includes('--local')
const publish = process.argv.includes('--veroeffentlichen') || process.argv.includes('--publish')
const replace = process.argv.includes('--ersetzen') || process.argv.includes('--update')
const LIMITS = { title: 160, excerpt: 400, body: 30_000, author: 80 }

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const files = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort()
if (!files.length) throw new Error('Keine Entwürfe in docs/fachartikel gefunden.')

const now = Math.floor(Date.now() / 1000)
const slugs = []
const rows = files.map((f, i) => {
  const raw = readFileSync(join(dir, f), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`${f}: Kopf zwischen „---“ fehlt.`)
  const meta = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
  const body = m[2].trim()
  for (const k of ['title', 'slug', 'excerpt']) if (!meta[k]) throw new Error(`${f}: ${k} fehlt.`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) throw new Error(`${f}: ungültige Adresse ${meta.slug}`)
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = k === 'body' ? body : meta[k] ?? ''
    if (v.length > max) throw new Error(`${f}: ${k} zu lang (${v.length} > ${max}).`)
  }
  slugs.push(meta.slug)
  // Reihenfolge der Dateien = Reihenfolge im Blog (neuester zuerst = Datei 01).
  const ts = now - i * 60
  const values = `VALUES (${q(randomUUID())}, ${q(meta.slug)}, ${q(meta.title)}, ${q(meta.excerpt)}, ${q(body)}, NULL, ${q(meta.author || 'Jason Azarov')}, ${publish ? 1 : 0}, ${ts}, ${ts}, ${ts})`
  const cols = 'INTO articles (id, slug, title, excerpt, body, source_url, author, published, published_at, created_at, updated_at)'
  if (!replace) return `INSERT OR IGNORE ${cols}\n${values};`
  // Ersetzen: Inhalt neu, Datum der Veröffentlichung bleibt; veröffentlicht wird nur mit --veroeffentlichen.
  return `INSERT ${cols}\n${values}\nON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, author = excluded.author, updated_at = ${ts}${
    publish ? ', published = 1' : ''
  };`
})

// Welche Adressen gibt es schon? Diese Artikel werden nicht angefasst, das sagen wir vorher.
const where = local ? ['--local', '--persist-to', join(root, '.wrangler/preview-state')] : ['--remote']
let existing = new Set()
try {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'nikki-media', ...where, '--json', '--command', 'SELECT slug FROM articles'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, CI: '1' },
  })
  existing = new Set(JSON.parse(out.slice(out.indexOf('[')))[0].results.map((r) => r.slug))
} catch {
  console.log('Hinweis: vorhandene Artikel ließen sich nicht abfragen, Import läuft trotzdem (vorhandene bleiben unberührt).')
}
const skipped = replace ? [] : slugs.filter((s) => existing.has(s))
const replaced = replace ? slugs.filter((s) => existing.has(s)) : []
if (skipped.length) console.log(`Schon vorhanden, bleiben unverändert: ${skipped.join(', ')}`)
if (replaced.length) console.log(`Schon vorhanden, werden durch die neue Fassung ersetzt: ${replaced.join(', ')}`)

const sqlFile = join(mkdtempSync(join(tmpdir(), 'fachartikel-')), 'import.sql')
writeFileSync(sqlFile, rows.join('\n') + '\n')
console.log(`${files.length - skipped.length} Artikel → ${local ? 'lokale Vorschau' : 'LIVE (nikkimedia.co)'}, ${publish ? 'VERÖFFENTLICHT' : 'unveröffentlicht'}.`)
if (!local) {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = (await rl.question('Weiter? (j/n) ')).trim().toLowerCase()
  rl.close()
  if (!['j', 'ja', 'y', 'yes'].includes(a)) { console.log('Abgebrochen, nichts geschrieben.'); process.exit(1) }
}
const args = ['wrangler', 'd1', 'execute', 'nikki-media', ...where, '--file', sqlFile]
execFileSync('npx', args, { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' } })
console.log(publish
  ? '\nFertig. Die Artikel stehen unter /fachartikel und im Admin unter „Fachartikel“.'
  : '\nFertig. Im Admin unter „Fachartikel“ prüfen und mit „Published“ freischalten.')
