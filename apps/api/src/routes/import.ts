import { zValidator } from '@hono/zod-validator'
import { importCommitSchema } from '@nauri/contracts'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { categories, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { requireAuth } from '../middleware.js'

/**
 * Recebe linhas JÁ normalizadas pelo cliente.
 *
 * O CSV é lido no app, não aqui: o preview fica instantâneo, o arquivo nunca
 * sobe, e o parsing não disputa o teto de CPU por requisição do Worker. Esta
 * rota só cuida do que exige o banco — resolver categorias por nome, remover
 * duplicatas e gravar.
 */
export const importRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .post('/commit', zValidator('json', importCommitSchema), async (c) => {
    const { rows, skipDuplicates } = c.req.valid('json')
    const userId = c.get('userId')
    const db = c.get('db')

    // 1. Resolve categorias por nome, criando as que faltam.
    //    A comparação é case-insensitive porque o índice único também é: a
    //    planilha costuma alternar "Mercado" e "mercado" ao longo dos anos.
    const wanted = new Map<string, { name: string; kind: 'expense' | 'income' }>()
    for (const row of rows) {
      wanted.set(`${row.kind}:${row.categoryName.toLowerCase()}`, {
        name: row.categoryName,
        kind: row.kind,
      })
    }

    const existing = await db
      .select({ id: categories.id, name: categories.name, kind: categories.kind })
      .from(categories)
      .where(eq(categories.userId, userId))

    const byKey = new Map(existing.map((cat) => [`${cat.kind}:${cat.name.toLowerCase()}`, cat.id]))

    const missing = [...wanted.entries()].filter(([key]) => !byKey.has(key))
    const categoriesCreated: string[] = []
    if (missing.length > 0) {
      const created = await db
        .insert(categories)
        .values(missing.map(([, v]) => ({ userId, name: v.name, kind: v.kind })))
        .onConflictDoNothing()
        .returning({ id: categories.id, name: categories.name, kind: categories.kind })
      for (const cat of created) {
        byKey.set(`${cat.kind}:${cat.name.toLowerCase()}`, cat.id)
        categoriesCreated.push(cat.name)
      }
    }

    // 2. Descarta o que já existe. Reimportar a mesma planilha (ou um recorte
    //    que se sobrepõe ao anterior) não deve dobrar o histórico.
    let seen = new Set<string>()
    if (skipDuplicates) {
      const dates = rows.map((r) => r.occurredOn).sort()
      const known = await db
        .select({
          kind: transactions.kind,
          occurredOn: transactions.occurredOn,
          amountCents: transactions.amountCents,
          description: transactions.description,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.occurredOn, dates[0]!),
            lte(transactions.occurredOn, dates.at(-1)!),
          ),
        )
      seen = new Set(
        known.map((t) => `${t.kind}|${t.occurredOn}|${t.amountCents}|${t.description}`),
      )
    }

    const toInsert: Array<typeof transactions.$inferInsert> = []
    let skipped = 0
    for (const row of rows) {
      const key = `${row.kind}|${row.occurredOn}|${row.amountCents}|${row.description}`
      // Duplicata dentro do próprio lote também conta.
      if (skipDuplicates && seen.has(key)) {
        skipped++
        continue
      }
      seen.add(key)
      const categoryId = byKey.get(`${row.kind}:${row.categoryName.toLowerCase()}`)
      if (!categoryId) {
        skipped++
        continue
      }
      toInsert.push({
        userId,
        kind: row.kind,
        occurredOn: row.occurredOn,
        amountCents: row.amountCents,
        description: row.description,
        categoryId,
      })
    }

    if (toInsert.length > 0) {
      await db.insert(transactions).values(toInsert)
    }

    return c.json({ inserted: toInsert.length, skipped, categoriesCreated })
  })
