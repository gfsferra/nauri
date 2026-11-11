import { addDays, addMonthsToMonth, currentMonth, monthBounds, todayInTimezone } from '@nauri/contracts'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  bankAccounts,
  bankConnections,
  budgetDate,
  investmentMovements,
  investments,
  transactions,
  wealthSnapshots,
} from '../db/schema.js'
import type { AppContext } from '../env.js'
import { toCents } from '../lib/cents.js'
import { monthlyFlows, portfolioSummary, savingsSummary } from '../lib/investments.js'
import { bankLabelOf } from '../lib/open-finance.js'
import { openFinanceConfig } from '../lib/open-finance-sync.js'
import { requireAuth } from '../middleware.js'

/** Meses do gráfico do "guardado". A Pluggy devolve 12 meses de movimentações. */
const FLOW_MONTHS = 12

/**
 * A aba Investimentos. Como o resto do Open Finance, só existe para o dono da
 * conexão (`OPEN_FINANCE_USER_ID`); para os outros responde `enabled: false`
 * e o app esconde a aba.
 */
export const investmentsRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const config = openFinanceConfig(c.env)
    const userId = c.get('userId')
    if (!config || config.userId !== userId) return c.json({ enabled: false as const })
    const db = c.get('db')

    // Só as conexões configuradas agora: um item tirado de PLUGGY_ITEM_ID
    // deixa de contar, mesmo com os dados ainda no banco.
    const connections = await db
      .select({ id: bankConnections.id, investmentsSyncedAt: bankConnections.investmentsSyncedAt })
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, userId), inArray(bankConnections.itemId, config.itemIds)))
    const connectionIds = connections.map((r) => r.id)
    if (connectionIds.length === 0) return c.json({ enabled: true as const, connected: false as const })

    const today = todayInTimezone()
    const month = currentMonth()

    const firstMonth = addMonthsToMonth(month, -(FLOW_MONTHS - 1))

    const [rows, movements, accounts, history, totals] = await Promise.all([
      db
        .select()
        .from(investments)
        .where(and(eq(investments.userId, userId), inArray(investments.connectionId, connectionIds))),
      db
        .select({
          type: investmentMovements.type,
          occurredOn: investmentMovements.occurredOn,
          amountCents: investmentMovements.amountCents,
          netAmountCents: investmentMovements.netAmountCents,
        })
        .from(investmentMovements)
        .innerJoin(investments, eq(investments.id, investmentMovements.investmentId))
        .where(
          and(
            eq(investmentMovements.userId, userId),
            inArray(investments.connectionId, connectionIds),
            gte(investmentMovements.occurredOn, `${addDays(today, -400).slice(0, 7)}-01`),
          ),
        ),
      db
        .select({
          name: bankAccounts.name,
          type: bankAccounts.type,
          balanceCents: bankAccounts.balanceCents,
          billAmountCents: bankAccounts.billAmountCents,
        })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.userId, userId), inArray(bankAccounts.connectionId, connectionIds))),
      db
        .select()
        .from(wealthSnapshots)
        .where(and(eq(wealthSnapshots.userId, userId), gte(wealthSnapshots.day, addDays(today, -365))))
        .orderBy(asc(wealthSnapshots.day)),
      // Entradas e saídas por mês, com a mesma data de orçamento da Início e
      // dos relatórios (a compra no cartão conta no mês que paga a fatura).
      db
        .select({
          month: sql<string>`to_char(${budgetDate}, 'YYYY-MM')`,
          income: sql`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'income'), 0)`,
          expense: sql`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'expense'), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(budgetDate, monthBounds(firstMonth).from),
            lte(budgetDate, monthBounds(month).to),
          ),
        )
        .groupBy(sql`to_char(${budgetDate}, 'YYYY-MM')`),
    ])

    const portfolio = portfolioSummary(rows)
    // Quando o banco atualizou os números, não quando o Nauri os leu: a leitura
    // é de hora em hora, mas o dado é o da atualização diária da Pluggy. Vale
    // a conexão mais atrasada, para "há 2 h" não esconder uma parada.
    const synced = connections.map((c) => c.investmentsSyncedAt).filter((d) => d !== null)
    const updatedAt =
      synced.length === connections.length && synced.length > 0
        ? new Date(Math.min(...synced.map((d) => d.getTime())))
        : null
    const monthly = monthlyFlows(movements, month, FLOW_MONTHS)
    const savings = savingsSummary(
      monthly,
      totals.map((t) => ({ month: t.month, incomeCents: toCents(t.income), expenseCents: toCents(t.expense) })),
      portfolio.totalCents,
      month,
    )

    const checking = accounts.filter((a) => a.type === 'BANK')
    const accountsCents = checking.reduce((s, a) => s + (a.balanceCents ?? 0), 0)
    const cardBillCents = accounts
      .filter((a) => a.type === 'CREDIT')
      .reduce((s, a) => s + (a.billAmountCents ?? 0), 0)

    return c.json({
      enabled: true as const,
      connected: true as const,
      updatedAt: updatedAt?.toISOString() ?? null,
      portfolio,
      /** O mês corrente é o último da série. */
      monthly,
      savings,
      netWorth: {
        totalCents: accountsCents + portfolio.totalCents - cardBillCents,
        accountsCents,
        investmentsCents: portfolio.totalCents,
        cardBillCents,
        accounts: checking.map((a) => ({ bank: bankLabelOf(a.name), balanceCents: a.balanceCents ?? 0 })),
      },
      history: history.map((h) => ({
        day: h.day,
        investmentsCents: h.investmentsCents,
        netWorthCents: h.accountsCents + h.investmentsCents - h.cardBillCents,
      })),
    })
  })
