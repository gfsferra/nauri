import { zValidator } from '@hono/zod-validator'
import { categoryRuleCreateSchema, idsMatchingRule, normalizeDescription } from '@nauri/contracts'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { categories, categoryRules, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { requireAuth } from '../middleware.js'

const idParam = z.object({ id: z.uuid() })

/** Postgres aceita no máximo 65.535 parâmetros por consulta: atualiza em lotes. */
const UPDATE_CHUNK = 1000

/**
 * Regras "sempre usar esta categoria para esta descrição". Toda consulta
 * filtra por `user_id`: a regra, o lançamento de origem e a categoria têm que
 * ser do mesmo usuário.
 */
export const categoryRulesRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const rows = await c
      .get('db')
      .select({
        id: categoryRules.id,
        kind: categoryRules.kind,
        pattern: categoryRules.pattern,
        categoryId: categoryRules.categoryId,
      })
      .from(categoryRules)
      .where(eq(categoryRules.userId, c.get('userId')))
    return c.json(rows)
  })

  /**
   * Cria a regra a partir de um lançamento (ou troca a categoria da que já
   * existe para a mesma descrição) e aplica no histórico: os lançamentos com a
   * mesma descrição passam para a categoria escolhida.
   */
  .post('/', zValidator('json', categoryRuleCreateSchema), async (c) => {
    const { transactionId, categoryId } = c.req.valid('json')
    const userId = c.get('userId')
    const db = c.get('db')

    const [source] = await db
      .select({ kind: transactions.kind, description: transactions.description })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .limit(1)
    if (!source) return c.json({ error: 'Lançamento não encontrado' }, 404)

    const pattern = normalizeDescription(source.description)
    if (!pattern) return c.json({ error: 'Lançamento sem descrição não vira regra' }, 400)

    const [category] = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1)
    if (!category) return c.json({ error: 'Categoria não encontrada' }, 404)
    if (category.kind !== source.kind) {
      return c.json({ error: 'A categoria não é do mesmo tipo do lançamento' }, 400)
    }

    const [rule] = await db
      .insert(categoryRules)
      .values({ userId, kind: source.kind, pattern, categoryId })
      .onConflictDoUpdate({
        target: [categoryRules.userId, categoryRules.kind, categoryRules.pattern],
        set: { categoryId, updatedAt: sql`now()` },
      })
      .returning({
        id: categoryRules.id,
        kind: categoryRules.kind,
        pattern: categoryRules.pattern,
        categoryId: categoryRules.categoryId,
      })

    // A normalização (acento, parcela) é a do contrato, em TypeScript: a busca
    // traz os lançamentos do mesmo tipo e o filtro fino acontece aqui.
    const candidates = await db
      .select({ id: transactions.id, description: transactions.description, categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.kind, source.kind)))
    const ids = idsMatchingRule(candidates, pattern, categoryId)

    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      await db
        .update(transactions)
        .set({ categoryId, updatedAt: new Date() })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids.slice(i, i + UPDATE_CHUNK))))
    }

    return c.json({ rule: rule!, updated: ids.length })
  })

  .delete('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param')
    const [row] = await c
      .get('db')
      .delete(categoryRules)
      .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, c.get('userId'))))
      .returning({ id: categoryRules.id })
    return row ? c.json({ ok: true }) : c.json({ error: 'Regra não encontrada' }, 404)
  })
