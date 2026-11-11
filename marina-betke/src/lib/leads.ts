/**
 * Anfragen aus dem Stepper: prüfen, speichern, lesen.
 *
 * Der Server traut dem Browser nichts: Jede Antwort muss in den Listen aus
 * fragen.ts stehen, Antworten mit Ausgang (Krise, Budget „nein“) ergeben nie
 * einen Lead. Doppelt abgeschickt (Doppeltipp, Zurück-Taste) gibt dieselbe
 * Nummer zurück statt eines zweiten Eintrags.
 */
import { BUDGET, EINWILLIGUNG_VERSION, ERREICHBAR, KRISE, SITUATION, START, WOHER, pick, type Status } from './fragen'
import type { Env } from './util'

export interface Lead {
  id: number
  nr: string
  created_at: number
  updated_at: number
  status: Status
  vorname: string
  telefon: string
  email: string | null
  situation: string
  start: string
  budget: string
  erreichbar: string | null
  woher: string | null
  quelle: string | null
  einwilligung_at: number
  einwilligung_version: string
}

export interface LeadEvent {
  id: number
  lead_id: number
  at: number
  kind: 'angelegt' | 'status' | 'notiz' | 'erneut'
  text: string
}

export interface LeadInput {
  vorname: string
  telefon: string
  email: string | null
  situation: string
  start: string
  budget: string
  erreichbar: string | null
  woher: string | null
  quelle: string | null
}

/** Höchstens so viele Anfragen je Verbindung und Stunde. */
export const LEADS_PER_HOUR = 8
/** Dieselbe Nummer innerhalb dieser Zeit gilt als dieselbe Anfrage. */
const DUP_WINDOW_MS = 30 * 60 * 1000

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

/**
 * Telefon mit Ländervorwahl: „+…“ oder „00…“ gilt wie eingegeben, sonst kommt
 * die gewählte Vorwahl davor und eine führende 0 fällt weg. 9 bis 15 Ziffern.
 */
export function composePhone(vorwahl: unknown, nummer: unknown): string | null {
  const roh = clean(nummer, 30)
  if (!roh) return null
  let tel: string
  if (/^(\+|00)/.test(roh)) {
    tel = '+' + roh.replace(/^(\+|00)/, '').replace(/[^\d ]/g, '').trim()
  } else {
    const vw = typeof vorwahl === 'string' && /^\d{1,4}$/.test(vorwahl) ? vorwahl : '49'
    tel = '+' + vw + ' ' + roh.replace(/[^\d ]/g, '').trim().replace(/^0+/, '')
  }
  tel = tel.replace(/\s+/g, ' ')
  const ziffern = tel.replace(/\D/g, '').length
  return ziffern >= 9 && ziffern <= 15 ? tel : null
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i

export type Parsed = { ok: true; input: LeadInput } | { ok: false; field: string; message: string }

/** Prüft den Körper von POST /api/leads. */
export function parseLead(body: Record<string, unknown>): Parsed {
  if (body.krise !== 'nein' || !pick(KRISE, body.krise)) {
    return { ok: false, field: 'krise', message: 'Bitte beantworte zuerst die Frage nach einer akuten Krise.' }
  }
  const situation = pick(SITUATION, body.situation)
  const start = pick(START, body.start)
  const budget = pick(BUDGET, body.budget)
  if (!situation || !start || !budget) {
    return { ok: false, field: 'fragen', message: 'Bitte beantworte alle 4 Fragen.' }
  }
  const erreichbar = pick(ERREICHBAR, body.erreichbar)
  if (!erreichbar) return { ok: false, field: 'erreichbar', message: 'Bitte sag mir, wann ich dich am besten erreiche.' }

  const vorname = clean(body.vorname, 40)
  if (!vorname) return { ok: false, field: 'vorname', message: 'Bitte gib deinen Vornamen ein.' }

  const telefon = composePhone(body.vorwahl, body.telefon)
  if (!telefon) {
    return { ok: false, field: 'telefon', message: 'Bitte wähl dein Land und gib deine Handynummer ein, zum Beispiel 151 23456789.' }
  }

  const emailRoh = clean(body.email, 120)
  if (emailRoh && !EMAIL_RE.test(emailRoh)) {
    return { ok: false, field: 'email', message: 'Bitte prüf deine E-Mail-Adresse oder lass das Feld leer.' }
  }

  if (body.einwilligung !== true) {
    return { ok: false, field: 'einwilligung', message: 'Ohne dein Häkchen kann ich deine Anfrage nicht speichern.' }
  }

  const q = typeof body.quelle === 'string' ? body.quelle.toLowerCase() : ''
  return {
    ok: true,
    input: {
      vorname,
      telefon,
      email: emailRoh ? emailRoh.toLowerCase() : null,
      situation,
      start,
      budget,
      erreichbar,
      woher: pick(WOHER, body.woher),
      quelle: /^[a-z0-9][a-z0-9-]{0,39}$/.test(q) ? q : null,
    },
  }
}

/** Sechsstellige Anfrage-Nummer, eindeutig. */
async function freshNr(env: Env): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const n = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)
    const nr = String(n)
    const hit = await env.DB.prepare('SELECT 1 FROM leads WHERE nr = ?').bind(nr).first()
    if (!hit) return nr
  }
  throw new Error('Keine freie Anfrage-Nummer gefunden')
}

export async function recentFromIp(env: Env, ipHash: string, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - 3600_000)
    .first<{ n: number }>()
  return r?.n ?? 0
}

export type Saved = { lead: Lead; duplicate: boolean }

export async function saveLead(env: Env, input: LeadInput, meta: { ipHash: string; userAgent: string }, now = Date.now()): Promise<Saved> {
  // Doppeltipp oder Zurück-Taste: dieselbe Nummer kurz hintereinander ist dieselbe Anfrage.
  const dup = await env.DB.prepare('SELECT * FROM leads WHERE telefon = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(input.telefon, now - DUP_WINDOW_MS)
    .first<Lead>()
  if (dup) {
    await env.DB.prepare('INSERT INTO lead_events (lead_id, at, kind, text) VALUES (?, ?, ?, ?)')
      .bind(dup.id, now, 'erneut', 'Formular noch einmal abgeschickt')
      .run()
    return { lead: dup, duplicate: true }
  }

  const nr = await freshNr(env)
  const lead = await env.DB.prepare(
    `INSERT INTO leads (nr, created_at, updated_at, status, vorname, telefon, email, situation, start, budget,
                        erreichbar, woher, quelle, einwilligung_at, einwilligung_version, ip_hash, user_agent)
     VALUES (?, ?, ?, 'neu', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  )
    .bind(
      nr, now, now, input.vorname, input.telefon, input.email, input.situation, input.start, input.budget,
      input.erreichbar, input.woher, input.quelle, now, EINWILLIGUNG_VERSION, meta.ipHash, meta.userAgent.slice(0, 300),
    )
    .first<Lead>()
  if (!lead) throw new Error('Lead wurde nicht gespeichert')
  await env.DB.prepare('INSERT INTO lead_events (lead_id, at, kind, text) VALUES (?, ?, ?, ?)')
    .bind(lead.id, now, 'angelegt', 'Anfrage über das Formular auf /terminbuchung/')
    .run()
  return { lead, duplicate: false }
}

/* ------------------------------------------------------------------ CRM */

export const leadByNr = (env: Env, nr: string) => env.DB.prepare('SELECT * FROM leads WHERE nr = ?').bind(nr).first<Lead>()

export async function eventsOf(env: Env, leadId: number): Promise<LeadEvent[]> {
  const r = await env.DB.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY at DESC, id DESC').bind(leadId).all<LeadEvent>()
  return r.results ?? []
}

export interface ListFilter {
  status?: Status
  q?: string
  limit?: number
}

export async function listLeads(env: Env, f: ListFilter = {}): Promise<Lead[]> {
  const where: string[] = []
  const bind: unknown[] = []
  if (f.status) {
    where.push('status = ?')
    bind.push(f.status)
  }
  const q = (f.q ?? '').trim()
  if (q) {
    const like = '%' + q.replace(/[%_\\]/g, (c) => '\\' + c) + '%'
    const digits = q.replace(/\D/g, '').replace(/^0+/, '') // „0170 …“ findet „+49 170 …“
    where.push(`(vorname LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR nr = ? OR quelle LIKE ? ESCAPE '\\'` +
      (digits.length >= 4 ? ` OR REPLACE(REPLACE(telefon, ' ', ''), '+', '') LIKE ?` : '') + ')')
    bind.push(like, like, q, like)
    if (digits.length >= 4) bind.push('%' + digits + '%')
  }
  const sql = `SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`
  bind.push(Math.min(f.limit ?? 500, 5000))
  const r = await env.DB.prepare(sql).bind(...bind).all<Lead>()
  return r.results ?? []
}

export async function statusCounts(env: Env): Promise<Record<string, number>> {
  const r = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all<{ status: string; n: number }>()
  const out: Record<string, number> = {}
  for (const row of r.results ?? []) out[row.status] = row.n
  return out
}

export async function countBy(env: Env, column: 'situation' | 'start' | 'budget' | 'erreichbar' | 'woher' | 'quelle'): Promise<{ value: string | null; n: number }[]> {
  const r = await env.DB.prepare(`SELECT ${column} AS value, COUNT(*) AS n FROM leads GROUP BY ${column} ORDER BY n DESC LIMIT 12`).all<{
    value: string | null
    n: number
  }>()
  return r.results ?? []
}

export async function createdSince(env: Env, since: number): Promise<number[]> {
  const r = await env.DB.prepare('SELECT created_at FROM leads WHERE created_at >= ? ORDER BY created_at').bind(since).all<{ created_at: number }>()
  return (r.results ?? []).map((x) => x.created_at)
}

export async function setStatus(env: Env, lead: Lead, status: Status, text: string, now = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, lead.id),
    env.DB.prepare('INSERT INTO lead_events (lead_id, at, kind, text) VALUES (?, ?, ?, ?)').bind(lead.id, now, 'status', text),
  ])
}

export async function addNote(env: Env, lead: Lead, text: string, now = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(now, lead.id),
    env.DB.prepare('INSERT INTO lead_events (lead_id, at, kind, text) VALUES (?, ?, ?, ?)').bind(lead.id, now, 'notiz', text),
  ])
}

/** Endgültig löschen (Auskunfts- und Löschwunsch nach DSGVO). */
export async function deleteLead(env: Env, lead: Lead): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM lead_events WHERE lead_id = ?').bind(lead.id),
    env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(lead.id),
  ])
}
