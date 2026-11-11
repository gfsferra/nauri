import { zValidator } from '@hono/zod-validator'
import {
  byCategoryQuerySchema,
  monthlyQuerySchema,
  summaryQuerySchema,
} from '@nauri/contracts'
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bankAccounts, categories, transactions } from '../db/schema.js'
import type { AppContext } from '../env.js'
import { addDays, addMonthsToMonth, currentMonth, monthBounds, todayInTimezone } from '@nauri/contracts'
import { toCents } from '../lib/cents.js'
import { materializeRecurrences } from '../lib/materialize.js'
import { forecastExpensesForMonth, RECURRING_LOOKBACK_DAYS, recurringSeries } from '../lib/recurring-forecast.js'
import { forecastForMonth, LOOKBACK_DAYS, salarySlots } from '../lib/salary-forecast.js'
import type { Db } from '../db/client.js'
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
    const db = c.get('db')
    const userId = c.get('userId')
    const forecast = [
      ...(await salaryForecast(db, userId, month)),
      ...(await recurringExpenseForecast(db, userId, month)),
      ...(await installmentForecast(db, userId, month)),
    ].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
    const sumOf = (kind: 'income' | 'expense') =>
      forecast.filter((f) => f.kind === kind).reduce((sum, f) => sum + f.amountCents, 0)
    return c.json({
      month,
      incomeCents,
      expenseCents,
      /** Só o que já aconteceu. A tela soma a previsão à parte, com aviso. */
      balanceCents: incomeCents - expenseCents,
      forecastIncomeCents: sumOf('income'),
      forecastExpenseCents: sumOf('expense'),
      forecast,
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

/**
 * Salário previsto do mês (ver `lib/salary-forecast.ts`). Só olha salários
 * que vieram do banco (Open Finance): quem lança à mão já tem a recorrência.
 */
async function salaryForecast(db: Db, userId: string, month: string) {
  const today = todayInTimezone()
  if (month < today.slice(0, 7)) return []
  const { from, to } = monthBounds(month)
  const since = addDays(today, -LOOKBACK_DAYS)

  const rows = await db
    .select({ occurredOn: transactions.occurredOn, amountCents: transactions.amountCents })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'income'),
        isNotNull(transactions.externalId),
        eq(categories.name, 'Salário'),
        gte(transactions.occurredOn, since < from ? since : from),
        lte(transactions.occurredOn, to),
      ),
    )
  const payments = rows.map((r) => ({ occurredOn: r.occurredOn, amountCents: toCents(r.amountCents) }))

  const slots = salarySlots(payments, today)
  return forecastForMonth(
    slots,
    payments.filter((p) => p.occurredOn >= from && p.occurredOn <= to),
    month,
    today,
  ).map((f) => ({
    ...f,
    kind: 'income' as const,
    description: 'Salário previsto',
    categoryName: 'Salário',
  }))
}

/**
 * Contas fixas previstas do mês (ver `lib/recurring-forecast.ts`): assinaturas
 * e outras cobranças mensais que vieram do banco.
 */
async function recurringExpenseForecast(db: Db, userId: string, month: string) {
  const today = todayInTimezone()
  if (month < today.slice(0, 7)) return []
  const { from, to } = monthBounds(month)
  const since = addDays(today, -RECURRING_LOOKBACK_DAYS)

  const rows = await db
    .select({
      occurredOn: transactions.occurredOn,
      amountCents: transactions.amountCents,
      description: transactions.description,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, 'expense'),
        isNotNull(transactions.externalId),
        // Parcela não é conta fixa: tem fim, e já entra pela previsão de parcelas.
        eq(transactions.isInstallment, false),
        gte(transactions.occurredOn, since < from ? since : from),
        lte(transactions.occurredOn, to),
      ),
    )
  const payments = rows.map((r) => ({ ...r, amountCents: toCents(r.amountCents) }))

  return forecastExpensesForMonth(
    recurringSeries(payments, today),
    payments.filter((p) => p.occurredOn >= from && p.occurredOn <= to),
    month,
    today,
  ).map((f) => ({ ...f, kind: 'expense' as const }))
}

/**
 * Parcelas futuras do cartão que caem no mês, lidas na última sincronização
 * (`bank_accounts.upcoming_installments`). A que já virou lançamento sai.
 */
async function installmentForecast(db: Db, userId: string, month: string) {
  const today = todayInTimezone()
  if (month < today.slice(0, 7)) return []
  const accounts = await db
    .select({ upcoming: bankAccounts.upcomingInstallments })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), isNotNull(bankAccounts.upcomingInstallments)))
  const due = accounts
    .flatMap((a) => a.upcoming ?? [])
    .filter((i) => i.occurredOn.startsWith(month) && i.occurredOn > today)
  if (due.length === 0) return []

  const imported = new Set(
    (
      await db
        .select({ externalId: transactions.externalId })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(
              transactions.externalId,
              due.map((i) => i.externalId),
            ),
          ),
        )
    ).map((r) => r.externalId),
  )
  return due
    .filter((i) => !imported.has(i.externalId))
    .map((i) => ({
      occurredOn: i.occurredOn,
      amountCents: i.amountCents,
      description: i.description,
      categoryName: i.categoryName,
      kind: 'expense' as const,
    }))
}
