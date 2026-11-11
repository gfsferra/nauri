import { zValidator } from '@hono/zod-validator'
import { budgetUpsertSchema } from '@nauri/contracts'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { budgetDate, budgets, categories, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { toCents } from '../lib/cents.js'
import { monthBounds } from '@nauri/contracts'
import { requireAuth } from '../middleware.js'

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })

export const budgetsRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  /**
   * Devolve o teto e o quanto já foi consumido no mês.
   *
   * O gasto é somado na hora, não guardado numa coluna: um total materializado
   * ficaria defasado a cada lançamento editado ou apagado, e a soma com índice
   * é barata.
   */
  .get('/', zValidator('query', monthQuery), async (c) => {
    const { month } = c.req.valid('query')
    const { from, to } = monthBounds(month)
    const userId = c.get('userId')

    const rows = await c
      .get('db')
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        limitCents: budgets.limitCents,
        spent: sql`(
          SELECT COALESCE(SUM(${transactions.amountCents}), 0)
          FROM ${transactions}
          WHERE ${transactions.userId} = ${userId}
            AND ${transactions.categoryId} = ${budgets.categoryId}
            AND ${budgetDate} BETWEEN ${from} AND ${to}
        )`,
      })
      .from(budgets)
      .innerJoin(categories, eq(categories.id, budgets.categoryId))
      .where(and(eq(budgets.userId, userId), eq(budgets.month, from)))

    return c.json(
      rows.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        month,
        limitCents: r.limitCents,
        spentCents: toCents(r.spent),
      })),
    )
  })

  /** PUT em vez de POST: definir o teto duas vezes é a mesma operação. */
  .put('/', zValidator('json', budgetUpsertSchema), async (c) => {
    const { categoryId, month, limitCents } = c.req.valid('json')
    const userId = c.get('userId')
    const firstDay = monthBounds(month).from

    const [category] = await c
      .get('db')
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1)
    if (!category) return c.json({ error: 'Categoria não encontrada' }, 404)
    if (category.kind !== 'expense') {
      return c.json({ error: 'Orçamento só faz sentido em categoria de gasto' }, 400)
    }

    const [row] = await c
      .get('db')
      .insert(budgets)
      .values({ userId, categoryId, month: firstDay, limitCents })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.month],
        set: { limitCents },
      })
      .returning()
    return c.json(row)
  })

  .delete('/:id', zValidator('param', z.object({ id: z.uuid() })), async (c) => {
    const [row] = await c
      .get('db')
      .delete(budgets)
      .where(
        and(eq(budgets.id, c.req.valid('param').id), eq(budgets.userId, c.get('userId'))),
      )
      .returning({ id: budgets.id })
    return row ? c.json({ ok: true }) : c.json({ error: 'Orçamento não encontrado' }, 404)
  })
