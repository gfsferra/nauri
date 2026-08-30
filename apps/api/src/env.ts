import type { createDb } from './db/client.js'
import type { createAuth } from './lib/auth.js'

/** Bindings do Worker — vêm de `.dev.vars` no dev e de secrets no deploy. */
export type Env = {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  /** URL pública da própria API, usada para montar os links dos e-mails. */
  BETTER_AUTH_URL: string
  /** URL do app web, para onde os e-mails de verificação redirecionam. */
  APP_URL: string
  RESEND_API_KEY: string
  MAIL_FROM: string
  /** 'open' libera cadastro; 'invite' exige INVITE_CODE. Ver Fase 7 do plano. */
  SIGNUP_MODE?: 'open' | 'invite'
  INVITE_CODE?: string
}

export type Variables = {
  db: ReturnType<typeof createDb>
  auth: ReturnType<typeof createAuth>
  userId: string
}

export type AppContext = { Bindings: Env; Variables: Variables }
