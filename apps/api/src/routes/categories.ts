import { zValidator } from '@hono/zod-validator'
import { categoryCreateSchema, categoryUpdateSchema } from '@nauri/contracts'
import { and, asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { categories, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { requireAuth } from '../middleware.js'

const idParam = z.object({ id: z.uuid() })

export const categoriesRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const rows = await c
      .get('db')
      .select()
      .from(categories)
      .where(eq(categories.userId, c.get('userId')))
      .orderBy(asc(categories.kind), asc(categories.name))
    return c.json(rows)
  })

  .post('/', zValidator('json', categoryCreateSchema), async (c) => {
    const body = c.req.valid('json')
    try {
      const [row] = await c
        .get('db')
        .insert(categories)
        .values({ ...body, userId: c.get('userId') })
        .returning()
      return c.json(row, 201)
    } catch (error) {
      // O índice único é case-insensitive: "Mercado" e "mercado" colidem de propósito.
      if (isUniqueViolation(error)) {
        return c.json({ error: 'Já existe uma categoria com esse nome' }, 409)
      }
      throw error
    }
  })

  .patch(
    '/:id',
    zValidator('param', idParam),
    zValidator('json', categoryUpdateSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const [row] = await c
        .get('db')
        .update(categories)
        .set(c.req.valid('json'))
        // O filtro por userId é o que impede editar categoria alheia mesmo
        // conhecendo o id.
        .where(and(eq(categories.id, id), eq(categories.userId, c.get('userId'))))
        .returning()
      return row ? c.json(row) : c.json({ error: 'Categoria não encontrada' }, 404)
    },
  )

  .delete('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const db = c.get('db')

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.categoryId, id), eq(transactions.userId, userId)))

    // Apagar categoria com histórico apagaria o passado junto. Arquivar mantém
    // os relatórios antigos íntegros e some da lista de lançamento.
    if (count > 0) {
      return c.json(
        {
          error: `Esta categoria tem ${count} lançamento(s). Arquive-a em vez de excluir.`,
          transactionCount: count,
        },
        409,
      )
    }

    const [row] = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning()
    return row ? c.json({ ok: true }) : c.json({ error: 'Categoria não encontrada' }, 404)
  })

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
