/**
 * Login ins CRM: ein Passwort (Secret ADMIN_PASSWORD), Sitzung als Zufallswert
 * im Cookie, in der Datenbank nur sein Hash. Fünf Fehlversuche je Verbindung
 * in 15 Minuten, danach ist bis zum Ablauf der 15 Minuten Ruhe.
 */
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { randomToken, sameSecret, sha256, type Env } from './util'

export const COOKIE = 'mb_crm'
const SESSION_DAYS = 30
export const MAX_FAILS = 5
const FAIL_WINDOW_MS = 15 * 60 * 1000

type C = Context<{ Bindings: Env }>

export async function currentSession(c: C): Promise<boolean> {
  const token = getCookie(c, COOKIE)
  if (!token) return false
  const row = await c.env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256('s:' + token))
    .first<{ expires_at: number }>()
  return !!row && row.expires_at > Date.now()
}

export async function recentFails(env: Env, ipHash: string, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND at > ?')
    .bind(ipHash, now - FAIL_WINDOW_MS)
    .first<{ n: number }>()
  return r?.n ?? 0
}

export type LoginResult = 'ok' | 'falsch' | 'gesperrt' | 'nicht-eingerichtet'

export async function login(c: C, password: string, ipHash: string): Promise<LoginResult> {
  const env = c.env
  if (!env.ADMIN_PASSWORD) return 'nicht-eingerichtet'
  const now = Date.now()
  if ((await recentFails(env, ipHash, now)) >= MAX_FAILS) return 'gesperrt'

  if (!(await sameSecret(password, env.ADMIN_PASSWORD))) {
    await env.DB.prepare('INSERT INTO login_attempts (ip_hash, at) VALUES (?, ?)').bind(ipHash, now).run()
    return (await recentFails(env, ipHash, now)) >= MAX_FAILS ? 'gesperrt' : 'falsch'
  }

  const token = randomToken()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256('s:' + token), now, now + SESSION_DAYS * 86400_000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ? OR at < ?').bind(ipHash, now - FAIL_WINDOW_MS),
  ])
  setCookie(c, COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    maxAge: SESSION_DAYS * 86400,
  })
  return 'ok'
}

export async function logout(c: C): Promise<void> {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256('s:' + token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
}

/**
 * Formulare im CRM ändern Daten. Ein Formular von einer fremden Seite darf das
 * nicht: Kommt eine Herkunft mit, muss sie diese Seite sein.
 */
export function sameOrigin(c: C): boolean {
  const origin = c.req.header('origin')
  if (!origin) return true
  return origin === new URL(c.req.url).origin
}
