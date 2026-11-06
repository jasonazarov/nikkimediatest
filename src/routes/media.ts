import { Hono } from 'hono'
import { currentUser } from '../lib/auth'
import { r2Ready } from '../lib/r2'
import { campaignThumbKey, signThumb, thumbAccess } from '../lib/thumbs'
import type { AppEnv } from '../lib/types'

/**
 * Bilder hinter einer Zugriffsprüfung. Jede Rolle hat ihr eigenes
 * Sitzungs-Cookie; geprüft wird jede vorhandene Sitzung — wer als Admin und
 * als Creator im selben Browser angemeldet ist, sieht, was die stärkere
 * Rolle sehen darf.
 */
export const mediaRoutes = new Hono<AppEnv>()

/** Das Thumbnail einer Kampagne (siehe lib/thumbs.ts) — Weiterleitung auf eine signierte R2-Adresse. */
mediaRoutes.get('/kampagne/:id/thumb', async (c) => {
  const projectId = c.req.param('id')
  let access: 'full' | 'limited' | null = null
  for (const role of ['admin', 'customer', 'creator', 'clipper', 'agency'] as const) {
    const user = await currentUser(c.env, c, role)
    if (!user) continue
    const found = await thumbAccess(c.env, user, projectId)
    if (found === 'full') {
      access = 'full'
      break
    }
    if (found) access = found
  }
  if (!access || !r2Ready(c.env)) return c.text('Nicht gefunden', 404)

  const key = await campaignThumbKey(c.env, projectId, access === 'full')
  if (!key) return c.text('Nicht gefunden', 404)

  // Kürzer zwischengespeichert, als die signierte Adresse gilt.
  c.header('Cache-Control', 'private, max-age=1800')
  return c.redirect(await signThumb(c.env, key), 302)
})
