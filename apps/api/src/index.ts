import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { createDb, createPool } from './db/client.js'
import type { AppContext, Env } from './env.js'
import { openFinanceConfig, syncOpenFinance } from './lib/open-finance-sync.js'
import { translateRateLimit } from './lib/rate-limit.js'
import { withServices } from './middleware.js'
import { accountRoute } from './routes/account.js'
import { categoriesRoute } from './routes/categories.js'
import { investmentsRoute } from './routes/investments.js'
import { openFinanceRoute } from './routes/open-finance.js'
import { reportsRoute } from './routes/reports.js'
import { transactionsRoute } from './routes/transactions.js'

/**
 * Trava de cadastro (Fase 7 do plano).
 *
 * O schema já é multiusuário, mas manter `SIGNUP_MODE=invite` nas primeiras
 * semanas adia a exposição pública enquanto o app amadurece — sem mudar nada na
 * arquitetura, é só uma variável de ambiente.
 */
const signupGate = createMiddleware<AppContext>(async (c, next) => {
  if (c.env.SIGNUP_MODE !== 'invite') return next()
  const code = c.req.header('x-invite-code')
  if (!code || !c.env.INVITE_CODE || code !== c.env.INVITE_CODE) {
    // Mesmo formato de erro do Better Auth ({ code, message }): o cliente dele
    // só repassa `message`, e com outro formato o app mostraria um erro genérico.
    return c.json(
      { code: 'INVITE_REQUIRED', message: 'O cadastro está aberto apenas por convite. Confira o código.' },
      403,
    )
  }
  await next()
})

const app = new Hono<AppContext>()

app.use('*', logger())
app.use('*', withServices)

// Em produção app e API estão na mesma origem e o CORS não entra em jogo. Ele
// fica para o desenvolvimento local, onde o Expo (8081) chama a API (8787). A
// origem precisa ser explícita: `*` é recusado pelo navegador junto com
// `credentials: true`.
app.use('/api/*', (c, next) =>
  cors({
    origin: [c.env.APP_URL],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'x-invite-code'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
)

app.use('/api/auth/sign-up/*', signupGate)

// O rate limit das rotas de autenticação é o do Better Auth, com a contagem no
// banco (ver `rateLimit` em lib/auth.ts). Aqui só traduzimos a resposta 429.
app.on(['GET', 'POST'], '/api/auth/*', async (c) =>
  translateRateLimit(await c.get('auth').handler(c.req.raw)),
)

app.get('/health', (c) => c.json({ ok: true }))

const routes = app
  .route('/api/categories', categoriesRoute)
  .route('/api/transactions', transactionsRoute)
  .route('/api/reports', reportsRoute)
  .route('/api/account', accountRoute)
  .route('/api/open-finance', openFinanceRoute)
  .route('/api/investments', investmentsRoute)

app.onError((error, c) => {
  console.error('Erro não tratado:', error)
  // Mensagem genérica de propósito: detalhe de erro de banco não vaza para o cliente.
  return c.json({ error: 'Erro interno' }, 500)
})

/** Tipo consumido pelo cliente RPC do app — é o que dá tipagem ponta a ponta. */
export type AppType = typeof routes

/**
 * O Worker atende HTTP pelo Hono e, de hora em hora, a sincronização do Open
 * Finance (Cron Trigger em wrangler.jsonc). Cada execução faz uma janela só;
 * ver lib/open-finance-sync.ts.
 */
export default {
  fetch: app.fetch,
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const config = openFinanceConfig(env)
    if (!config) return
    const pool = createPool(env.DATABASE_URL)
    try {
      const result = await syncOpenFinance(createDb(pool), config)
      console.log('Open Finance:', JSON.stringify(result))
    } catch (error) {
      console.error('Falha na sincronização do Open Finance:', error)
    } finally {
      ctx.waitUntil(pool.end().catch(() => {}))
    }
  },
}
