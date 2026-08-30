import { zValidator } from '@hono/zod-validator'
import {
  byCategoryQuerySchema,
  monthlyQuerySchema,
  summaryQuerySchema,
} from '@financas/contracts'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { categories, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { addMonthsToMonth, currentMonth, monthBounds } from '@financas/contracts'
import { toCents } from '../lib/cents.js'
import { materializeRecurrences } from '../lib/materialize.js'
import { requireAuth } from '../middleware.js'

/**
 * Agregação roda no SQL, não em JavaScript.
 *
 * Trazer o extrato inteiro para somar no Worker fica lento com poucos milhares
 * de linhas, e o free tier tem teto de CPU por requisição. O banco soma isso
 * com um índice.
 */
export const reportsRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/summary', zValidator('query', summaryQuerySchema), async (c) => {
    const { month } = c.req.valid('query')
    const { from, to } = monthBounds(month)

    // O total do mês precisa já contar o salário e as contas fixas, mesmo que
    // ninguém tenha aberto a lista de lançamentos ainda.
    await materializeRecurrences(c.get('db'), c.get('userId'), from, to)

    const [row] = await c
      .get('db')
      .select({
        income: sql`COALESCE(SUM(${transactions.amountCents}) FILTER (WHERE ${transactions.kind} = 'income'), 0)`,
        expense: sql`COALESCE(SUM(${transactions.amountCents}) FILTER (WHERE ${transactions.kind} = 'expense'), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, c.get('userId')),
          gte(transactions.occurredOn, from),
          lte(transactions.occurredOn, to),
        ),
      )

    const incomeCents = toCents(row?.income)
    const expenseCents = toCents(row?.expense)
    return c.json({
      month,
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
    })
  })

  .get('/by-category', zValidator('query', byCategoryQuerySchema), async (c) => {
    const { from, to, kind } = c.req.valid('query')

    const filters = [
      eq(transactions.userId, c.get('userId')),
      gte(transactions.occurredOn, from),
      lte(transactions.occurredOn, to),
    ]
    if (kind) filters.push(eq(transactions.kind, kind))

    const rows = await c
      .get('db')
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        categoryColor: categories.color,
        kind: transactions.kind,
        total: sql`SUM(${transactions.amountCents})`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(...filters))
      .groupBy(categories.id, categories.name, categories.color, transactions.kind)
      .orderBy(desc(sql`SUM(${transactions.amountCents})`))

    return c.json(
      rows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        kind: r.kind,
        totalCents: toCents(r.total),
        transactionCount: r.transactionCount,
      })),
    )
  })

  .get('/monthly', zValidator('query', monthlyQuerySchema), async (c) => {
    const { months } = c.req.valid('query')
    const until = currentMonth()
    const since = addMonthsToMonth(until, -(months - 1))

    const rows = await c
      .get('db')
      .select({
        month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
        income: sql`COALESCE(SUM(${transactions.amountCents}) FILTER (WHERE ${transactions.kind} = 'income'), 0)`,
        expense: sql`COALESCE(SUM(${transactions.amountCents}) FILTER (WHERE ${transactions.kind} = 'expense'), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, c.get('userId')),
          gte(transactions.occurredOn, monthBounds(since).from),
          lte(transactions.occurredOn, monthBounds(until).to),
        ),
      )
      .groupBy(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`)

    // Meses sem lançamento precisam aparecer zerados: um gráfico de barras que
    // pula meses vazios distorce a leitura da evolução.
    const found = new Map(rows.map((r) => [r.month, r]))
    const series = Array.from({ length: months }, (_, i) => {
      const month = addMonthsToMonth(since, i)
      const row = found.get(month)
      const incomeCents = toCents(row?.income)
      const expenseCents = toCents(row?.expense)
      return { month, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }
    })

    return c.json(series)
  })
