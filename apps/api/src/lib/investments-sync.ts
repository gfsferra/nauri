import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { bankAccounts, investmentMovements, investments, wealthSnapshots } from '../db/schema.js'
import {
  isActive,
  mapInvestment,
  planMovementFetches,
  mapMovement,
  type MappedMovement,
  type PluggyInvestmentTransaction,
} from './investments.js'
import type { PluggyClient } from './pluggy.js'
import { toCents } from './cents.js'

/**
 * Leitura dos investimentos de uma conexão (ver lib/investments.ts).
 *
 * A Pluggy só muda esses números uma vez por dia, quando a conexão do Meu
 * Pluggy se atualiza, então a leitura roda uma vez por atualização dela, numa
 * execução do cron separada da leitura das transações (ver `syncOpenFinance`).
 *
 * As movimentações saem de uma chamada por investimento, e o plano gratuito do
 * Workers aceita 50 chamadas externas por execução. Por isso só são lidas as
 * das posições ativas (que podem ter aporte ou resgate novo) e das que
 * mudaram desde a última leitura, até `MAX_MOVEMENT_FETCHES` por execução. O
 * que sobrar fica para a próxima, e a conexão só é marcada como lida quando
 * nada sobrou.
 */
export const MAX_MOVEMENT_FETCHES = 20

export interface InvestmentSyncResult {
  positions: number
  movementsFetched: number
  movementsInserted: number
  /** Falso quando ficaram movimentações para a próxima execução. */
  complete: boolean
}

export async function syncInvestments(
  db: Db,
  client: PluggyClient,
  ctx: { userId: string; connectionId: string; itemId: string; now: Date },
): Promise<InvestmentSyncResult> {
  const remote = await client.investments(ctx.itemId)
  if (remote.length === 0) return { positions: 0, movementsFetched: 0, movementsInserted: 0, complete: true }

  const stored = new Map(
    (
      await db
        .select({
          externalId: investments.externalId,
          status: investments.movementsStatus,
          costCents: investments.costCents,
        })
        .from(investments)
        .where(and(eq(investments.userId, ctx.userId), eq(investments.connectionId, ctx.connectionId)))
    ).map((r) => [r.externalId, r]),
  )

  const { toFetch, complete } = planMovementFetches(remote, stored, MAX_MOVEMENT_FETCHES)

  const movementsOf = new Map<string, PluggyInvestmentTransaction[]>()
  for (const inv of toFetch) movementsOf.set(inv.id, await client.investmentTransactions(inv.id))

  const mapped = remote.map((inv) => {
    const m = mapInvestment(inv, movementsOf.get(inv.id) ?? null)
    // Sem movimentações lidas nesta execução, o custo que o preço médio deu
    // na leitura anterior continua valendo.
    if (m.costCents === null && isActive(inv) && !movementsOf.has(inv.id)) {
      m.costCents = stored.get(inv.id)?.costCents ?? null
    }
    return m
  })

  const rows = await db
    .insert(investments)
    .values(
      mapped.map((m) => ({
        ...m,
        userId: ctx.userId,
        connectionId: ctx.connectionId,
        // Só quem teve as movimentações lidas agora avança; o resto fica como estava.
        movementsStatus: movementsOf.has(m.externalId) ? m.status : null,
        updatedAt: ctx.now,
      })),
    )
    .onConflictDoUpdate({
      target: investments.externalId,
      set: {
        name: sql`excluded.name`,
        code: sql`excluded.code`,
        issuer: sql`excluded.issuer`,
        status: sql`excluded.status`,
        movementsStatus: sql`coalesce(excluded.movements_status, ${investments.movementsStatus})`,
        balanceCents: sql`excluded.balance_cents`,
        grossCents: sql`excluded.gross_cents`,
        costCents: sql`excluded.cost_cents`,
        quantity: sql`excluded.quantity`,
        rate: sql`excluded.rate`,
        rateType: sql`excluded.rate_type`,
        fixedAnnualRate: sql`excluded.fixed_annual_rate`,
        dueOn: sql`excluded.due_on`,
        purchaseOn: sql`excluded.purchase_on`,
        positionOn: sql`excluded.position_on`,
        updatedAt: sql`excluded.updated_at`,
      },
      // O ID da Pluggy é único no mundo, mas a linha só pode ser de quem a criou.
      setWhere: eq(investments.userId, ctx.userId),
    })
    .returning({ id: investments.id, externalId: investments.externalId })
  const idOf = new Map(rows.map((r) => [r.externalId, r.id]))

  const movements: Array<MappedMovement & { investmentId: string }> = []
  for (const [externalId, txs] of movementsOf) {
    const investmentId = idOf.get(externalId)
    if (!investmentId) continue
    for (const tx of txs) {
      const m = mapMovement(tx)
      if (m) movements.push({ ...m, investmentId })
    }
  }

  let movementsInserted = 0
  if (movements.length > 0) {
    // Movimentação não muda depois de feita: o que já existe fica como está.
    const inserted = await db
      .insert(investmentMovements)
      .values(movements.map((m) => ({ ...m, userId: ctx.userId })))
      .onConflictDoNothing({ target: investmentMovements.externalId })
      .returning({ id: investmentMovements.id })
    movementsInserted = inserted.length
  }

  return {
    positions: remote.length,
    movementsFetched: toFetch.length,
    movementsInserted,
    complete,
  }
}

/**
 * A foto do dia: investimentos ativos, saldo das contas correntes e faturas em
 * aberto, de todas as conexões do dono. Uma por dia; uma leitura mais nova no
 * mesmo dia substitui a anterior.
 */
export async function writeWealthSnapshot(db: Db, userId: string, connectionIds: string[], day: string) {
  if (connectionIds.length === 0) return
  const [inv] = await db
    .select({ total: sql<string>`coalesce(sum(${investments.balanceCents}), 0)` })
    .from(investments)
    .where(
      and(
        eq(investments.userId, userId),
        inArray(investments.connectionId, connectionIds),
        ne(investments.status, 'TOTAL_WITHDRAWAL'),
      ),
    )
  const [acc] = await db
    .select({
      accounts: sql<string>`coalesce(sum(${bankAccounts.balanceCents}) filter (where ${bankAccounts.type} = 'BANK'), 0)`,
      bills: sql<string>`coalesce(sum(${bankAccounts.billAmountCents}) filter (where ${bankAccounts.type} = 'CREDIT'), 0)`,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), inArray(bankAccounts.connectionId, connectionIds)))

  const values = {
    investmentsCents: toCents(inv?.total),
    accountsCents: toCents(acc?.accounts),
    cardBillCents: toCents(acc?.bills),
  }
  await db
    .insert(wealthSnapshots)
    .values({ userId, day, ...values })
    .onConflictDoUpdate({ target: [wealthSnapshots.userId, wealthSnapshots.day], set: values })
}
