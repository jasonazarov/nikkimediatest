import { nowSec, uid } from './db'
import type { Env } from './types'

/**
 * Fachartikel (Migration 0023). Der Admin legt sie unter /admin/fachartikel
 * von Hand an; öffentlich stehen sie unter /fachartikel, im Block
 * „Fachartikel“ der Landingpages, in der Sitemap und in /llms.txt.
 *
 * Wozu: Sprachmodelle wie ChatGPT zitieren Seiten, die eine Frage klar und
 * mit Fachwissen beantworten (GEO, Generative Engine Optimization). Jede
 * Artikelseite trägt deshalb strukturierte Daten (schema.org/Article),
 * einen Autor und ein Datum. Ob ein Modell einen Artikel tatsächlich
 * anzeigt, entscheidet das Modell — die Seite macht es ihm nur leicht.
 *
 * Bewusst rohes SQL statt Drizzle: so lässt sich die Logik ohne Worker
 * gegen SQLite testen.
 */

export interface Article {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  sourceUrl: string | null
  author: string
  published: boolean
  publishedAt: number
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  source_url: string | null
  author: string
  published: number
  published_at: number
  created_at: number
  updated_at: number
}

const toArticle = (r: Row): Article => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  excerpt: r.excerpt,
  body: r.body,
  sourceUrl: r.source_url,
  author: r.author,
  published: !!r.published,
  publishedAt: Number(r.published_at),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
})

export const ARTICLE_LIMITS = { title: 160, excerpt: 400, body: 30_000, author: 80, url: 500 }

/** „Was kostet Clipping 2026?“ → „was-kostet-clipping-2026“ */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'artikel'
  )
}

export async function publishedArticles(env: Env, limit = 50): Promise<Article[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM articles WHERE published = 1 AND published_at <= ? ORDER BY published_at DESC LIMIT ?',
  )
    .bind(nowSec(), Math.max(1, Math.min(200, limit)))
    .all()
  return ((results ?? []) as unknown as Row[]).map(toArticle)
}

/** Ein veröffentlichter Artikel per Adresse — oder null. */
export async function articleBySlug(env: Env, slug: string): Promise<Article | null> {
  const row = (await env.DB.prepare('SELECT * FROM articles WHERE slug = ? AND published = 1 AND published_at <= ?')
    .bind(slug, nowSec())
    .first()) as Row | null
  return row ? toArticle(row) : null
}

/** Alle Artikel für den Admin, neueste zuerst — auch Entwürfe. */
export async function allArticles(env: Env): Promise<Article[]> {
  const { results } = await env.DB.prepare('SELECT * FROM articles ORDER BY published_at DESC').all()
  return ((results ?? []) as unknown as Row[]).map(toArticle)
}

export async function articleById(env: Env, id: string): Promise<Article | null> {
  const row = (await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first()) as Row | null
  return row ? toArticle(row) : null
}

export interface ArticleInput {
  title: string
  excerpt: string
  body: string
  sourceUrl: string | null
  author: string
  published: boolean
  slug: string
  /** Unix-Sekunden; leer = jetzt. */
  publishedAt: number
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Prüft die Eingabe aus dem Admin-Formular. */
export function parseArticle(body: Record<string, unknown>): ArticleInput | { error: string } {
  const title = str(body.title, ARTICLE_LIMITS.title)
  const excerpt = str(body.excerpt, ARTICLE_LIMITS.excerpt)
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim().slice(0, ARTICLE_LIMITS.body) : ''
  const author = str(body.author, ARTICLE_LIMITS.author) || 'Jason Azarov'
  const rawUrl = str(body.sourceUrl, ARTICLE_LIMITS.url)
  if (!title) return { error: 'Bitte gib einen Titel ein.' }
  if (!excerpt) return { error: 'Bitte gib eine Kurzfassung ein (ein bis zwei Sätze).' }
  if (!text && !rawUrl) return { error: 'Bitte gib einen Artikeltext ein oder verlinke den Artikel.' }
  let sourceUrl: string | null = null
  if (rawUrl) {
    try {
      const u = new URL(rawUrl)
      if (u.protocol !== 'https:') throw new Error()
      sourceUrl = u.toString()
    } catch {
      return { error: 'Der Link muss mit https:// beginnen.' }
    }
  }
  const slug = slugify(str(body.slug, 90) || title)
  let publishedAt = nowSec()
  if (typeof body.publishedAt === 'string' && body.publishedAt) {
    const t = Date.parse(body.publishedAt)
    if (Number.isNaN(t)) return { error: 'Das Datum ist ungültig.' }
    publishedAt = Math.floor(t / 1000)
  }
  return { title, excerpt, body: text, sourceUrl, author, published: body.published !== false, slug, publishedAt }
}

/** Eindeutige Adresse: hängt -2, -3 … an, falls die Adresse schon vergeben ist. */
async function freeSlug(env: Env, wanted: string, ownId: string | null): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? wanted : `${wanted}-${i}`
    const hit = (await env.DB.prepare('SELECT id FROM articles WHERE slug = ?').bind(slug).first()) as { id: string } | null
    if (!hit || hit.id === ownId) return slug
  }
  return `${wanted}-${uid().slice(0, 6)}`
}

export async function createArticle(env: Env, a: ArticleInput): Promise<Article> {
  const id = uid()
  const ts = nowSec()
  const slug = await freeSlug(env, a.slug, null)
  await env.DB.prepare(
    `INSERT INTO articles (id, slug, title, excerpt, body, source_url, author, published, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, slug, a.title, a.excerpt, a.body, a.sourceUrl, a.author, a.published ? 1 : 0, a.publishedAt, ts, ts)
    .run()
  return (await articleById(env, id))!
}

export async function updateArticle(env: Env, id: string, a: ArticleInput): Promise<Article | null> {
  if (!(await articleById(env, id))) return null
  const slug = await freeSlug(env, a.slug, id)
  await env.DB.prepare(
    `UPDATE articles SET slug = ?, title = ?, excerpt = ?, body = ?, source_url = ?, author = ?, published = ?,
            published_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(slug, a.title, a.excerpt, a.body, a.sourceUrl, a.author, a.published ? 1 : 0, a.publishedAt, nowSec(), id)
    .run()
  return articleById(env, id)
}

export async function deleteArticle(env: Env, id: string): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run()
  return Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0
}
