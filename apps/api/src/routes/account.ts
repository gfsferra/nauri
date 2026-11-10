import { zValidator } from '@hono/zod-validator'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { budgets, categories, recurrences, transactions, user } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { centsToDecimalString } from '@nauri/contracts'
import { requireAuth } from '../middleware.js'

/**
 * Direitos do titular sob a LGPD (art. 18): portabilidade e eliminação.
 *
 * Guardando dado financeiro de terceiros, sair tem que ser tão fácil quanto
 * entrar — e a exportação não pode ser um resumo, precisa ser tudo.
 */
export const accountRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get(
    '/export',
    zValidator('query', z.object({ format: z.enum(['json', 'csv']).default('json') })),
    async (c) => {
      const userId = c.get('userId')
      const db = c.get('db')

      const [me] = await db
        .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)

      const [myCategories, myTransactions, myRecurrences, myBudgets] = await Promise.all([
        db.select().from(categories).where(eq(categories.userId, userId)),
        db
          .select()
          .from(transactions)
          .where(eq(transactions.userId, userId))
          .orderBy(asc(transactions.occurredOn)),
        db.select().from(recurrences).where(eq(recurrences.userId, userId)),
        db.select().from(budgets).where(eq(budgets.userId, userId)),
      ])

      if (c.req.valid('query').format === 'csv') {
        const byId = new Map(myCategories.map((cat) => [cat.id, cat.name]))
        const header = 'data,tipo,categoria,descricao,valor\n'
        const body = myTransactions
          .map((t) =>
            [
              t.occurredOn,
              t.kind === 'expense' ? 'gasto' : 'ganho',
              csvField(byId.get(t.categoryId) ?? ''),
              csvField(t.description),
              centsToDecimalString(t.amountCents),
            ].join(','),
          )
          .join('\n')
        return new Response(header + body, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="nauri.csv"',
          },
        })
      }

      return c.json({
        exportadoEm: new Date().toISOString(),
        usuario: me,
        categorias: myCategories,
        lancamentos: myTransactions,
        recorrencias: myRecurrences,
        orcamentos: myBudgets,
      })
    },
  )

  /**
   * Exclusão definitiva. Todo o resto sai por ON DELETE CASCADE a partir de
   * `user` — incluindo as sessões, o que derruba o acesso na hora.
   *
   * Exigir o e-mail digitado evita que um toque errado apague anos de histórico.
   */
  .delete('/', zValidator('json', z.object({ confirmEmail: z.email() })), async (c) => {
    const userId = c.get('userId')
    const db = c.get('db')

    const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
    if (!me) return c.json({ error: 'Conta não encontrada' }, 404)

    if (me.email.toLowerCase() !== c.req.valid('json').confirmEmail.toLowerCase()) {
      return c.json({ error: 'O e-mail digitado não confere com o da conta' }, 400)
    }

    await db.delete(user).where(eq(user.id, userId))
    return c.json({ ok: true })
  })

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
