import type { User } from '../db/schema'

export interface Env {
  DB: D1Database
  /** Optional: erst verfügbar, wenn R2 im Cloudflare-Account aktiviert ist. */
  MEDIA?: R2Bucket
  ASSETS: Fetcher

  // vars (wrangler.toml)
  APP_URL: string
  MAIL_FROM: string
  ADMIN_EMAIL: string
  ADMIN_NAME: string
  R2_BUCKET: string
  R2_PUBLIC_ACCOUNT_ID: string
  STORAGE_WARN_BYTES: string

  // secrets (wrangler secret put)
  AUTH_SECRET: string
  RESEND_API_KEY: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  /** API-Schlüssel des Veröffentlichungsanbieters. Fehlt er, ruht die Anbindung. */
  ZERNIO_API_KEY?: string
  /** Selbst gewählt und beim Anbieter hinterlegt — signiert die Webhooks. */
  ZERNIO_WEBHOOK_SECRET?: string
  /**
   * Optional: Anthropic-Schlüssel für den FAQ-Agenten (lib/faq.ts). Ohne ihn
   * antwortet der Agent per Abgleich mit der FAQ, ganz ohne Sprachmodell.
   */
  ANTHROPIC_API_KEY?: string
  /** Optional: Modellname für den Agenten, Standard `claude-haiku-5-5`. */
  AGENT_MODEL?: string
}

export type Variables = {
  user: User
}

export type AppEnv = { Bindings: Env; Variables: Variables }
