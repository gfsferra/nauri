import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import type { AppContext } from './env.js'
import { withServices } from './middleware.js'
import { accountRoute } from './routes/account.js'
import { budgetsRoute } from './routes/budgets.js'
import { categoriesRoute } from './routes/categories.js'
import { importRoute } from './routes/import.js'
import { recurrencesRoute } from './routes/recurrences.js'
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

/**
 * Rate limit nas rotas de autenticação: são as únicas que respondem
 * diferente para senha certa e senha errada, ou seja, as únicas que valem a
 * pena martelar. Usa o binding nativo do Cloudflare; se ele não estiver
 * configurado (dev local), deixa passar em vez de quebrar.
 */
const authRateLimit = createMiddleware<AppContext>(async (c, next) => {
  const limiter = (c.env as Record<string, unknown>).AUTH_RATE_LIMITER as
    | { limit(o: { key: string }): Promise<{ success: boolean }> }
    | undefined
  if (!limiter) return next()

  const key = c.req.header('cf-connecting-ip') ?? 'desconhecido'
  const { success } = await limiter.limit({ key })
  if (!success) {
    return c.json({ code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Tente de novo em um minuto.' }, 429)
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
app.use('/api/auth/sign-in/*', authRateLimit)
app.use('/api/auth/sign-up/*', authRateLimit)
app.use('/api/auth/request-password-reset', authRateLimit)

app.on(['GET', 'POST'], '/api/auth/*', (c) => c.get('auth').handler(c.req.raw))

app.get('/health', (c) => c.json({ ok: true }))

const routes = app
  .route('/api/categories', categoriesRoute)
  .route('/api/transactions', transactionsRoute)
  .route('/api/reports', reportsRoute)
  .route('/api/recurrences', recurrencesRoute)
  .route('/api/budgets', budgetsRoute)
  .route('/api/import', importRoute)
  .route('/api/account', accountRoute)

app.onError((error, c) => {
  console.error('Erro não tratado:', error)
  // Mensagem genérica de propósito: detalhe de erro de banco não vaza para o cliente.
  return c.json({ error: 'Erro interno' }, 500)
})

/** Tipo consumido pelo cliente RPC do app — é o que dá tipagem ponta a ponta. */
export type AppType = typeof routes

export default app
