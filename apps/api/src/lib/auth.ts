import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { expo } from '@better-auth/expo'
import { bearer } from 'better-auth/plugins'
import type { Db } from '../db/client.js'
import { account, session, user, verification } from '../db/schema.js'
import type { Env } from '../env.js'
import { button, layout, sendEmail } from './email.js'
import { seedDefaultCategories } from './seed.js'

/**
 * Instância por requisição: num Worker os segredos chegam pelos bindings do
 * request, não por `process.env`, então não existe um singleton de módulo.
 */
export function createAuth(db: Db, env: Env) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
      // Sem isto, uma falha no meio do cadastro deixa usuário órfão.
      transaction: true,
    }),
    trustedOrigins: [env.APP_URL],

    emailAndPassword: {
      enabled: true,
      // Guardando dado financeiro de terceiros, e-mail não confirmado não entra.
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user: u, url }) => {
        await sendEmail(env, {
          to: u.email,
          subject: 'Redefinir sua senha',
          html: layout(
            'Redefinir sua senha',
            `<p>Recebemos um pedido para redefinir a senha da sua conta.</p>
             ${button(url, 'Escolher nova senha')}
             <p style="color:#64748b;font-size:13px">O link vale por 1 hora.</p>`,
          ),
        })
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        // O Better Auth monta o link com `callbackURL=/`, que cai na raiz da
        // API — onde não há rota, e o usuário recém-verificado vê um 404 como
        // primeira tela. Reaproveitamos o token dele e só trocamos o destino.
        const link = new URL(url)
        link.searchParams.set('callbackURL', `${env.APP_URL}/lancamentos`)

        await sendEmail(env, {
          to: u.email,
          subject: 'Confirme seu e-mail',
          html: layout(
            'Confirme seu e-mail',
            `<p>Olá${u.name ? `, ${u.name}` : ''}! Falta um passo para começar a usar suas finanças.</p>
             ${button(link.toString(), 'Confirmar e-mail')}`,
          ),
        })
      },
    },

    databaseHooks: {
      user: {
        create: {
          // Conta nova já nasce com a taxonomia pronta: sem isso o primeiro
          // lançamento exigiria inventar categorias antes de qualquer coisa.
          after: async (created) => {
            await seedDefaultCategories(db, created.id)
          },
        },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 dias: relançar a senha toda semana afasta o uso diário
      updateAge: 60 * 60 * 24,
    },

    // O app web e a API ficam em domínios diferentes (Pages e Workers), então
    // o cookie precisa ser cross-site — e por isso mesmo, obrigatoriamente
    // Secure e HttpOnly.
    advanced: {
      defaultCookieAttributes: { sameSite: 'none', secure: true, httpOnly: true },
    },

    // O app nativo não tem cookie jar: manda a sessão no header Authorization.
    plugins: [
      bearer(),
      // Libera o deep link financas:// como origem confiável do app nativo.
      expo(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
