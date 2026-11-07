#!/usr/bin/env node
/**
 * Fachartikel aus docs/fachartikel/*.md in die Datenbank laden.
 *
 *   node scripts/fachartikel-import.mjs --abgleich   → live abgleichen (so ruft es live-bringen.sh auf)
 *   node scripts/fachartikel-import.mjs              → live, UNVERÖFFENTLICHT, Vorhandenes bleibt
 *   node scripts/fachartikel-import.mjs --local      → dasselbe in der lokalen Vorschau-Datenbank
 *
 * --abgleich (seit November 2026, Vorgabe des Auftraggebers: nicht bei jedem Livegang
 * erneut fragen, nichts kaputt machen) vergleicht jeden Artikel mit der Live-Fassung:
 *   neu           gibt es live noch nicht              → wird veröffentlicht
 *   neue Fassung  live steht eine ÄLTERE Fassung aus der Git-Historie dieser Datei
 *                                                      → Text wird ersetzt, Sichtbarkeit bleibt
 *   aktuell       live steht genau diese Fassung      → nichts zu tun
 *   im Admin bearbeitet   live steht ein Text, den es in der Historie nie gab
 *                                                      → bleibt UNANGETASTET
 * Nur wenn es neue oder neue Fassungen gibt, fragt das Skript (j/n). Sonst meldet es
 * „alles aktuell“ und schreibt nichts. Was im Admin ausgeblendet wurde, bleibt ausgeblendet;
 * im Admin selbst angelegte Artikel (andere Adressen) werden nie angefasst. Zwischen Abfrage
 * und Schreiben schützt `updated_at`: Wer genau dann im Admin speichert, wird nicht überschrieben.
 *
 * Ältere Zusätze für Hand-Läufe (überschreiben OHNE Rücksicht auf Admin-Änderungen):
 *   --veroeffentlichen   Artikel sofort veröffentlichen (published = 1)
 *   --ersetzen           vorhandene Artikel derselben Adresse durch die Fassung aus
 *                        docs/fachartikel ersetzen (Titel, Kurzfassung, Text, Autor)
 *
 * Live fragt das Skript vor dem Schreiben einmal nach (j/n); --ja überspringt das.
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
const argv = process.argv
const local = argv.includes('--local')
const sync = argv.includes('--abgleich') || argv.includes('--sync')
const publish = argv.includes('--veroeffentlichen') || argv.includes('--publish')
const replace = argv.includes('--ersetzen') || argv.includes('--update')
const skipAsk = argv.includes('--ja')
const LIMITS = { title: 160, excerpt: 400, body: 30_000, author: 80 }
const where = local ? ['--local', '--persist-to', join(root, '.wrangler/preview-state')] : ['--remote']
const target = local ? 'lokale Vorschau' : 'LIVE (nikkimedia.co)'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Liest eine Artikeldatei; `strict` prüft Pflichtfelder und Längen (nur für die aktuelle Fassung). */
function parse(raw, name, strict = true) {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) {
    if (strict) throw new Error(`${name}: Kopf zwischen „---“ fehlt.`)
    return null
  }
  const meta = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
  const a = { slug: meta.slug, title: meta.title, excerpt: meta.excerpt, body: m[2].trim(), author: meta.author || 'Jason Azarov' }
  if (!strict) return a
  for (const k of ['title', 'slug', 'excerpt']) if (!a[k]) throw new Error(`${name}: ${k} fehlt.`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) throw new Error(`${name}: ungültige Adresse ${a.slug}`)
  for (const [k, max] of Object.entries(LIMITS)) {
    if ((a[k] ?? '').length > max) throw new Error(`${name}: ${k} zu lang (${a[k].length} > ${max}).`)
  }
  return a
}

/** Gleicher Inhalt? So normalisiert, wie der Admin-Editor speichert (parseArticle in lib/articles.ts). */
const norm = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim()
const same = (a, b) => ['title', 'excerpt', 'body', 'author'].every((k) => norm(a[k]) === norm(b[k]))

/** Alle früheren Fassungen einer Datei aus der Git-Historie. */
function history(file) {
  const rel = `docs/fachartikel/${file}`
  let revs = []
  try {
    revs = execFileSync('git', ['log', '--format=%H', '--', rel], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  } catch {
    return []
  }
  return revs
    .map((h) => {
      try {
        return parse(execFileSync('git', ['show', `${h}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 << 20 }), rel, false)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** Fragt die Datenbank ab; liefert die Zeilen oder wirft. */
function query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'nikki-media', ...where, '--json', '--command', sql], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, CI: '1' }, maxBuffer: 256 << 20,
  })
  return JSON.parse(out.slice(out.indexOf('[')))[0].results
}

async function confirm(question) {
  if (local || skipAsk) return true
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = (await rl.question(question)).trim().toLowerCase()
  rl.close()
  return ['j', 'ja', 'y', 'yes'].includes(a)
}

function run(statements) {
  const sqlFile = join(mkdtempSync(join(tmpdir(), 'fachartikel-')), 'import.sql')
  writeFileSync(sqlFile, statements.join('\n') + '\n')
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'nikki-media', ...where, '--file', sqlFile], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' },
  })
}

const COLS = 'INTO articles (id, slug, title, excerpt, body, source_url, author, published, published_at, created_at, updated_at)'

const files = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort()
if (!files.length) throw new Error('Keine Entwürfe in docs/fachartikel gefunden.')
const now = Math.floor(Date.now() / 1000)
// Reihenfolge der Dateien = Reihenfolge im Blog (neuester zuerst = Datei 01).
const articles = files.map((f, i) => ({ file: f, ts: now - i * 60, ...parse(readFileSync(join(dir, f), 'utf8'), f) }))

// ------------------------------------------------------------------ Abgleich
if (sync) {
  let live
  try {
    live = new Map(query('SELECT slug, title, excerpt, body, author, published, updated_at FROM articles').map((r) => [r.slug, r]))
  } catch {
    console.log(`Fachartikel: ${target} ließ sich nicht abfragen. Zur Sicherheit wurde nichts geschrieben.`)
    process.exit(0)
  }
  const fresh = []
  const updated = []
  const current = []
  const edited = []
  const hidden = []
  for (const a of articles) {
    const row = live.get(a.slug)
    if (!row) fresh.push(a)
    else if (same(a, row)) (Number(row.published) ? current : hidden).push(a)
    else if (history(a.file).some((old) => same(old, row))) updated.push({ ...a, row })
    else edited.push(a)
  }
  const list = (xs) => xs.map((a) => `   · ${a.title}`).join('\n')
  if (edited.length) console.log(`Im Admin bearbeitet, bleiben so wie sie sind (${edited.length}):\n${list(edited)}`)
  if (hidden.length) console.log(`Im Admin ausgeblendet, bleiben ausgeblendet (${hidden.length}):\n${list(hidden)}`)
  if (!fresh.length && !updated.length) {
    console.log(`Fachartikel: alle ${current.length + hidden.length + edited.length} sind auf dem neuesten Stand. Nichts zu tun.`)
    process.exit(0)
  }
  if (fresh.length) console.log(`Neu, werden veröffentlicht (${fresh.length}):\n${list(fresh)}`)
  if (updated.length) console.log(`Neue Fassung, Text wird ersetzt (${updated.length}):\n${list(updated)}`)
  if (current.length) console.log(`Schon aktuell, bleiben unberührt: ${current.length}`)
  if (!(await confirm(`Diese ${fresh.length + updated.length} Fachartikel jetzt live einspielen? (j/n) `))) {
    console.log('Fachartikel nicht angefasst.')
    process.exit(0)
  }
  run([
    ...fresh.map(
      (a) =>
        `INSERT OR IGNORE ${COLS}\nVALUES (${q(randomUUID())}, ${q(a.slug)}, ${q(a.title)}, ${q(a.excerpt)}, ${q(a.body)}, NULL, ${q(a.author)}, 1, ${a.ts}, ${a.ts}, ${a.ts});`,
    ),
    // Nur ersetzen, wenn seit der Abfrage niemand im Admin gespeichert hat.
    ...updated.map(
      (a) =>
        `UPDATE articles SET title = ${q(a.title)}, excerpt = ${q(a.excerpt)}, body = ${q(a.body)}, author = ${q(a.author)}, updated_at = ${now}\nWHERE slug = ${q(a.slug)} AND updated_at = ${Number(a.row.updated_at)};`,
    ),
  ])
  console.log('\nFertig. Die Artikel stehen unter /fachartikel und im Admin unter „Fachartikel“.')
  process.exit(0)
}

// ------------------------------------------------------- Hand-Lauf (alte Zusätze)
const rows = articles.map((a) => {
  const values = `VALUES (${q(randomUUID())}, ${q(a.slug)}, ${q(a.title)}, ${q(a.excerpt)}, ${q(a.body)}, NULL, ${q(a.author)}, ${publish ? 1 : 0}, ${a.ts}, ${a.ts}, ${a.ts})`
  if (!replace) return `INSERT OR IGNORE ${COLS}\n${values};`
  // Ersetzen: Inhalt neu, Datum der Veröffentlichung bleibt; veröffentlicht wird nur mit --veroeffentlichen.
  return `INSERT ${COLS}\n${values}\nON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, author = excluded.author, updated_at = ${a.ts}${
    publish ? ', published = 1' : ''
  };`
})

// Welche Adressen gibt es schon? Das sagen wir vorher.
let existing = new Set()
try {
  existing = new Set(query('SELECT slug FROM articles').map((r) => r.slug))
} catch {
  console.log('Hinweis: vorhandene Artikel ließen sich nicht abfragen, Import läuft trotzdem (vorhandene bleiben unberührt).')
}
const slugs = articles.map((a) => a.slug)
const skipped = replace ? [] : slugs.filter((s) => existing.has(s))
const replaced = replace ? slugs.filter((s) => existing.has(s)) : []
if (skipped.length) console.log(`Schon vorhanden, bleiben unverändert: ${skipped.join(', ')}`)
if (replaced.length) console.log(`Schon vorhanden, werden durch die neue Fassung ersetzt: ${replaced.join(', ')}`)
console.log(`${files.length - skipped.length} Artikel → ${target}, ${publish ? 'VERÖFFENTLICHT' : 'unveröffentlicht'}.`)
if (!(await confirm('Weiter? (j/n) '))) {
  console.log('Abgebrochen, nichts geschrieben.')
  process.exit(1)
}
run(rows)
console.log(publish
  ? '\nFertig. Die Artikel stehen unter /fachartikel und im Admin unter „Fachartikel“.'
  : '\nFertig. Im Admin unter „Fachartikel“ prüfen und mit „Published“ freischalten.')
