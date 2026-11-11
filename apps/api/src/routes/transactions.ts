import { zValidator } from '@hono/zod-validator'
import {
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from '@nauri/contracts'
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { categories, openFinanceIgnored, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { materializeRecurrences } from '../lib/materialize.js'
import { requireAuth } from '../middleware.js'

const idParam = z.object({ id: z.uuid() })

/**
 * A FK composta garante que a categoria existe e que o tipo bate — mas não que
 * ela seja DESTE usuário. Sem esta checagem, alguém poderia anexar um
 * lançamento à categoria de outra pessoa e descobrir o nome dela pela listagem.
 */
async function findOwnedCategory(db: Db, userId: string, categoryId: string) {
  const [row] = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1)
  return row
}

function encodeCursor(occurredOn: string, id: string): string {
  return btoa(`${occurredOn}|${id}`).replace(/=+$/, '')
}

function decodeCursor(cursor: string): { occurredOn: string; id: string } | null {
  try {
    const [occurredOn, id] = atob(cursor).split('|')
    if (!occurredOn || !id) return null
    return { occurredOn, id }
  } catch {
    return null
  }
}

export const transactionsRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', zValidator('query', transactionListQuerySchema), async (c) => {
    const { from, to, kind, categoryId, cursor, limit } = c.req.valid('query')
    const userId = c.get('userId')

    // Só na primeira página: repetir isso a cada página paginada seria trabalho
    // puro, já que a materialização é idempotente e o período não muda.
    if (from && to && !cursor) {
      await materializeRecurrences(c.get('db'), userId, from, to)
    }

    const filters: SQL[] = [eq(transactions.userId, userId)]
    if (from) filters.push(gte(transactions.occurredOn, from))
    if (to) filters.push(lte(transactions.occurredOn, to))
    if (kind) filters.push(eq(transactions.kind, kind))
    if (categoryId) filters.push(eq(transactions.categoryId, categoryId))

    // Paginação por keyset, não por OFFSET: com OFFSET, lançar algo novo no topo
    // faz a página seguinte repetir um item que já apareceu.
    if (cursor) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return c.json({ error: 'Cursor inválido' }, 400)
      filters.push(
        sql`(${transactions.occurredOn}, ${transactions.id}) < (${decoded.occurredOn}::date, ${decoded.id}::uuid)`,
      )
    }

    const rows = await c
      .get('db')
      .select({
        id: transactions.id,
        kind: transactions.kind,
        occurredOn: transactions.occurredOn,
        amountCents: transactions.amountCents,
        description: transactions.description,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        recurrenceId: transactions.recurrenceId,
        isPending: transactions.isPending,
        fromBank: sql<boolean>`${transactions.externalId} IS NOT NULL`,
      })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(...filters))
      .orderBy(desc(transactions.occurredOn), desc(transactions.id))
      .limit(limit + 1) // uma a mais só para saber se há próxima página

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items.at(-1)

    return c.json({
      items,
      nextCursor: hasMore && last ? encodeCursor(last.occurredOn, last.id) : null,
    })
  })

  .post('/', zValidator('json', transactionCreateSchema), async (c) => {
    const body = c.req.valid('json')
    const userId = c.get('userId')

    const category = await findOwnedCategory(c.get('db'), userId, body.categoryId)
    if (!category) return c.json({ error: 'Categoria não encontrada' }, 404)
    if (category.kind !== body.kind) {
      return c.json(
        { error: `Categoria é de ${category.kind === 'expense' ? 'gasto' : 'ganho'}` },
        400,
      )
    }

    const [row] = await c
      .get('db')
      .insert(transactions)
      .values({ ...body, userId })
      .returning()
    return c.json(row, 201)
  })

  .patch(
    '/:id',
    zValidator('param', idParam),
    zValidator('json', transactionUpdateSchema),
    async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const userId = c.get('userId')
      const db = c.get('db')

      const [existing] = await db
        .select({ kind: transactions.kind })
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .limit(1)
      if (!existing) return c.json({ error: 'Lançamento não encontrado' }, 404)

      if (body.categoryId) {
        const category = await findOwnedCategory(db, userId, body.categoryId)
        if (!category) return c.json({ error: 'Categoria não encontrada' }, 404)
        if (category.kind !== existing.kind) {
          return c.json({ error: 'A categoria não é do mesmo tipo do lançamento' }, 400)
        }
      }

      const [row] = await db
        .update(transactions)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .returning()
      return c.json(row)
    },
  )

  .delete('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const db = c.get('db')
    const [row] = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning({ id: transactions.id, externalId: transactions.externalId })
    if (!row) return c.json({ error: 'Lançamento não encontrado' }, 404)

    // Veio do banco (Open Finance): lembra que foi apagado de propósito, senão
    // a próxima sincronização o traria de volta.
    if (row.externalId) {
      await db
        .insert(openFinanceIgnored)
        .values({ userId, externalId: row.externalId })
        .onConflictDoNothing()
    }
    return c.json({ ok: true })
  })
