import { createMiddleware } from 'hono/factory'
import { createDb, createPool } from './db/client.js'
import type { AppContext } from './env.js'
import { createAuth } from './lib/auth.js'

/**
 * Monta banco e auth para a requisição, e devolve a conexão no fim.
 *
 * Cada requisição do Worker abre seu próprio pool: sem o `end()`, as conexões
 * WebSocket vazariam e o limite do Neon seria atingido em pouco tempo. O
 * `waitUntil` fecha depois da resposta sair, para o usuário não pagar a espera.
 */
export const withServices = createMiddleware<AppContext>(async (c, next) => {
  const pool = createPool(c.env.DATABASE_URL)
  const db = createDb(pool)
  c.set('db', db)
  c.set('auth', createAuth(db, c.env))

  try {
    await next()
  } finally {
    const close = pool.end().catch(() => {})
    // `executionCtx` não existe em todo contexto de teste; aí fecha na hora.
    try {
      c.executionCtx.waitUntil(close)
    } catch {
      await close
    }
  }
})

/**
 * Porteiro de toda rota de domínio.
 *
 * Ele grava `userId` no contexto, e as rotas obtêm o dono do dado SÓ daqui —
 * nunca de um parâmetro ou do corpo da requisição. Num app multiusuário, aceitar
 * `userId` vindo do cliente é o caminho curto para servir o extrato de um
 * usuário a outro.
 */
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const session = await c.get('auth').api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) {
    return c.json({ error: 'Não autenticado' }, 401)
  }
  if (!session.user.emailVerified) {
    return c.json({ error: 'Confirme seu e-mail para continuar' }, 403)
  }
  c.set('userId', session.user.id)
  await next()
})
