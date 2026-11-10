import { zValidator } from '@hono/zod-validator'
import { recurrenceCreateSchema, recurrenceUpdateSchema } from '@nauri/contracts'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { categories, recurrences, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { requireAuth } from '../middleware.js'

const idParam = z.object({ id: z.uuid() })

export const recurrencesRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const rows = await c
      .get('db')
      .select({
        id: recurrences.id,
        kind: recurrences.kind,
        categoryId: recurrences.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        description: recurrences.description,
        amountCents: recurrences.amountCents,
        frequency: recurrences.frequency,
        dayOfMonth: recurrences.dayOfMonth,
        weekday: recurrences.weekday,
        monthOfYear: recurrences.monthOfYear,
        startOn: recurrences.startOn,
        endOn: recurrences.endOn,
        isActive: recurrences.isActive,
      })
      .from(recurrences)
      .innerJoin(categories, eq(categories.id, recurrences.categoryId))
      .where(eq(recurrences.userId, c.get('userId')))
      .orderBy(asc(recurrences.description))
    return c.json(rows)
  })

  .post('/', zValidator('json', recurrenceCreateSchema), async (c) => {
    const body = c.req.valid('json')
    const userId = c.get('userId')

    const [category] = await c
      .get('db')
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, body.categoryId), eq(categories.userId, userId)))
      .limit(1)
    if (!category) return c.json({ error: 'Categoria não encontrada' }, 404)
    if (category.kind !== body.kind) {
      return c.json({ error: 'A categoria não é do mesmo tipo da recorrência' }, 400)
    }

    // A união discriminada garante que só os campos da frequência escolhida
    // chegam preenchidos; os outros vão NULL de propósito.
    const [row] = await c
      .get('db')
      .insert(recurrences)
      .values({
        userId,
        kind: body.kind,
        categoryId: body.categoryId,
        description: body.description,
        amountCents: body.amountCents,
        frequency: body.frequency,
        dayOfMonth: 'dayOfMonth' in body ? body.dayOfMonth : null,
        weekday: 'weekday' in body ? body.weekday : null,
        monthOfYear: 'monthOfYear' in body ? body.monthOfYear : null,
        startOn: body.startOn,
        endOn: body.endOn ?? null,
      })
      .returning()
    return c.json(row, 201)
  })

  .patch(
    '/:id',
    zValidator('param', idParam),
    zValidator('json', recurrenceUpdateSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const [row] = await c
        .get('db')
        .update(recurrences)
        .set(c.req.valid('json'))
        .where(and(eq(recurrences.id, id), eq(recurrences.userId, c.get('userId'))))
        .returning()
      return row ? c.json(row) : c.json({ error: 'Recorrência não encontrada' }, 404)
    },
  )

  .delete(
    '/:id',
    zValidator('param', idParam),
    zValidator('query', z.object({ keepGenerated: z.enum(['true', 'false']).default('true') })),
    async (c) => {
      const { id } = c.req.valid('param')
      const { keepGenerated } = c.req.valid('query')
      const userId = c.get('userId')
      const db = c.get('db')

      // Por padrão o histórico já lançado permanece: apagar a regra do salário
      // não deveria apagar os salários que você de fato recebeu. A FK usa
      // ON DELETE SET NULL, então eles viram lançamentos comuns.
      if (keepGenerated === 'false') {
        await db
          .delete(transactions)
          .where(and(eq(transactions.recurrenceId, id), eq(transactions.userId, userId)))
      }

      const [row] = await db
        .delete(recurrences)
        .where(and(eq(recurrences.id, id), eq(recurrences.userId, userId)))
        .returning({ id: recurrences.id })
      return row ? c.json({ ok: true }) : c.json({ error: 'Recorrência não encontrada' }, 404)
    },
  )
