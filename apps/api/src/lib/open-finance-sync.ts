import { addDays, todayInTimezone } from '@nauri/contracts'
import { and, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { bankAccounts, bankConnections, categories, openFinanceIgnored, transactions } from '../db/schema.js'
import type { Env } from '../env.js'
import {
  HISTORY_DAYS,
  mapPluggyTransaction,
  planSync,
  type MappedTransaction,
  type PluggyAccountType,
  type PluggyTransaction,
  type SkipReason,
} from './open-finance.js'
import { createPluggyClient, type PluggyClient } from './pluggy.js'

/**
 * Sincronização do Open Finance (Meu Pluggy → Nauri).
 *
 * Roda de hora em hora (Cron Trigger) e pelo botão "Sincronizar agora". Cada
 * execução processa UMA janela de datas (ver `planSync`): a leitura recente
 * quando a Pluggy tem dado novo, ou uma fatia de um mês do histórico. Assim
 * nenhuma execução carrega 12 meses de uma vez, o que estouraria os 10 ms de
 * CPU do plano gratuito do Workers.
 */

export interface OpenFinanceConfig {
  clientId: string
  clientSecret: string
  itemId: string
  userId: string
}

/** O recurso só existe com as quatro variáveis configuradas. */
export function openFinanceConfig(env: Env): OpenFinanceConfig | null {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_ID, OPEN_FINANCE_USER_ID } = env
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || !PLUGGY_ITEM_ID || !OPEN_FINANCE_USER_ID) return null
  return {
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
    itemId: PLUGGY_ITEM_ID,
    userId: OPEN_FINANCE_USER_ID,
  }
}

export interface SyncResult {
  plan: 'idle' | 'recent' | 'backfill'
  from?: string
  to?: string
  inserted: number
  updated: number
  removedPending: number
  skipped: Partial<Record<SkipReason | 'ignored', number>>
}

export async function syncOpenFinance(
  db: Db,
  config: OpenFinanceConfig,
  options: { force?: boolean; now?: Date; client?: PluggyClient } = {},
): Promise<SyncResult> {
  const now = options.now ?? new Date()
  const today = todayInTimezone(now)

  const connection = await ensureConnection(db, config, today)

  try {
    const client = options.client ?? (await createPluggyClient(config.clientId, config.clientSecret))
    const item = await client.item(config.itemId)

    const plan = planSync(
      {
        syncFrom: connection.syncFrom,
        backfillCursor: connection.backfillCursor,
        providerUpdatedAt: connection.providerUpdatedAt?.toISOString() ?? null,
      },
      item.lastUpdatedAt,
      today,
      options.force,
    )

    const result: SyncResult = { plan: plan.kind, inserted: 0, updated: 0, removedPending: 0, skipped: {} }
    const statusUpdate = {
      status: item.status,
      consentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
      lastError: null,
    }

    if (plan.kind === 'idle') {
      await db.update(bankConnections).set(statusUpdate).where(eq(bankConnections.id, connection.id))
      return result
    }

    result.from = plan.from
    result.to = plan.to

    const accounts = await upsertAccounts(db, config, connection.id, await client.accounts(config.itemId))
    const categoryIds = await loadCategoryIds(db, config.userId)
    const ignored = new Set(
      (
        await db
          .select({ externalId: openFinanceIgnored.externalId })
          .from(openFinanceIgnored)
          .where(eq(openFinanceIgnored.userId, config.userId))
      ).map((r) => r.externalId),
    )

    for (const account of accounts) {
      const fetched = await client.transactions(account.externalId, plan.from, plan.to)
      await applyTransactions(db, {
        userId: config.userId,
        account,
        fetched,
        today,
        ignored,
        categoryIds,
        // Só a leitura recente reconcilia pendentes: é a janela em que uma
        // compra pendente vira definitiva (às vezes com outro ID).
        reconcileWindow: plan.kind === 'recent' ? { from: plan.from, to: plan.to } : null,
        result,
      })
    }

    await db
      .update(bankConnections)
      .set({
        ...statusUpdate,
        ...(plan.kind === 'recent'
          ? {
              providerUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
              lastSyncedAt: now,
              backfillCursor: plan.from < connection.backfillCursor ? plan.from : connection.backfillCursor,
            }
          : { backfillCursor: plan.from }),
      })
      .where(eq(bankConnections.id, connection.id))

    return result
  } catch (error) {
    await db
      .update(bankConnections)
      .set({ lastError: error instanceof Error ? error.message.slice(0, 500) : String(error) })
      .where(eq(bankConnections.id, connection.id))
    throw error
  }
}

async function ensureConnection(db: Db, config: OpenFinanceConfig, today: string) {
  await db
    .insert(bankConnections)
    .values({
      userId: config.userId,
      itemId: config.itemId,
      syncFrom: addDays(today, -HISTORY_DAYS),
      // Nada importado ainda: o histórico começa a partir de hoje, para trás.
      backfillCursor: today,
    })
    .onConflictDoNothing({ target: bankConnections.itemId })

  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.itemId, config.itemId))
    .limit(1)
  return connection!
}

interface AccountRow {
  id: string
  externalId: string
  type: PluggyAccountType
}

async function upsertAccounts(
  db: Db,
  config: OpenFinanceConfig,
  connectionId: string,
  accounts: Array<{ id: string; type: PluggyAccountType; name: string }>,
): Promise<AccountRow[]> {
  if (accounts.length === 0) return []
  const rows = await db
    .insert(bankAccounts)
    .values(
      accounts.map((a) => ({
        connectionId,
        userId: config.userId,
        externalId: a.id,
        type: a.type,
        name: a.name,
      })),
    )
    .onConflictDoUpdate({ target: bankAccounts.externalId, set: { name: sql`excluded.name` } })
    .returning({ id: bankAccounts.id, externalId: bankAccounts.externalId, type: bankAccounts.type })
  return rows.map((r) => ({ ...r, type: r.type as PluggyAccountType }))
}

/** `kind:nome em minúsculas` → id, igual à importação de planilha. */
async function loadCategoryIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.userId, userId))
  return new Map(rows.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]))
}

/**
 * Garante as categorias que faltam (o usuário pode ter renomeado ou apagado
 * uma padrão) e devolve o id de cada lançamento.
 */
async function resolveCategories(
  db: Db,
  userId: string,
  mapped: MappedTransaction[],
  categoryIds: Map<string, string>,
) {
  const missing = new Map<string, { name: string; kind: 'expense' | 'income' }>()
  for (const m of mapped) {
    const key = `${m.kind}:${m.categoryName.toLowerCase()}`
    if (!categoryIds.has(key)) missing.set(key, { name: m.categoryName, kind: m.kind })
  }
  if (missing.size === 0) return
  await db
    .insert(categories)
    .values([...missing.values()].map((c) => ({ userId, name: c.name, kind: c.kind })))
    .onConflictDoNothing()
  const fresh = await loadCategoryIds(db, userId)
  for (const [key, id] of fresh) categoryIds.set(key, id)
}

async function applyTransactions(
  db: Db,
  ctx: {
    userId: string
    account: AccountRow
    fetched: PluggyTransaction[]
    today: string
    ignored: Set<string>
    categoryIds: Map<string, string>
    reconcileWindow: { from: string; to: string } | null
    result: SyncResult
  },
) {
  const { userId, account, fetched, today, ignored, categoryIds, result } = ctx

  const mapped: MappedTransaction[] = []
  for (const tx of fetched) {
    if (ignored.has(tx.id)) {
      result.skipped.ignored = (result.skipped.ignored ?? 0) + 1
      continue
    }
    const r = mapPluggyTransaction(tx, account.type, today)
    if (r.ok) mapped.push(r.value)
    else result.skipped[r.reason] = (result.skipped[r.reason] ?? 0) + 1
  }

  if (mapped.length > 0) {
    await resolveCategories(db, userId, mapped, categoryIds)
    const rows = await db
      .insert(transactions)
      .values(
        mapped.map((m) => ({
          userId,
          kind: m.kind,
          occurredOn: m.occurredOn,
          amountCents: m.amountCents,
          description: m.description,
          categoryId: categoryIds.get(`${m.kind}:${m.categoryName.toLowerCase()}`)!,
          externalId: m.externalId,
          bankAccountId: account.id,
          isPending: m.isPending,
        })),
      )
      // Já existe: atualiza só o que o banco pode mudar. Categoria e descrição
      // ficam como o usuário deixou; o tipo nunca muda (a FK composta com a
      // categoria recusaria).
      .onConflictDoUpdate({
        target: [transactions.userId, transactions.externalId],
        set: {
          amountCents: sql`excluded.amount_cents`,
          occurredOn: sql`excluded.occurred_on`,
          isPending: sql`excluded.is_pending`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${transactions.amountCents} <> excluded.amount_cents
          OR ${transactions.occurredOn} <> excluded.occurred_on
          OR ${transactions.isPending} <> excluded.is_pending`,
      })
      // xmax = 0 só numa linha recém-inserida: separa inserção de atualização.
      .returning({ inserted: sql<boolean>`xmax = 0` })
    for (const r of rows) {
      if (r.inserted) result.inserted++
      else result.updated++
    }
  }

  // Compra pendente que sumiu da Pluggy foi substituída pela definitiva (que
  // pode vir com outro ID) ou cancelada. Sem lista do lado da Pluggy, não
  // apaga nada: uma resposta vazia por instabilidade não pode limpar tudo.
  const window = ctx.reconcileWindow
  if (window && fetched.length > 0) {
    const removed = await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.bankAccountId, account.id),
          eq(transactions.isPending, true),
          gte(transactions.occurredOn, window.from),
          lte(transactions.occurredOn, window.to),
          notInArray(
            transactions.externalId,
            fetched.map((t) => t.id),
          ),
        ),
      )
      .returning({ id: transactions.id })
    result.removedPending += removed.length
  }
}

/** Para a tela: estado da conexão e contas do dono. */
export async function openFinanceStatus(db: Db, config: OpenFinanceConfig) {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.itemId, config.itemId))
    .limit(1)
  if (!connection) return { connected: false as const }

  const accounts = await db
    .select({ name: bankAccounts.name, type: bankAccounts.type })
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connection.id))

  const [counts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, config.userId),
        inArray(
          transactions.bankAccountId,
          db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.connectionId, connection.id)),
        ),
      ),
    )

  return {
    connected: true as const,
    status: connection.status,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    consentExpiresAt: connection.consentExpiresAt?.toISOString() ?? null,
    historyComplete: connection.backfillCursor <= connection.syncFrom,
    historyFrom: connection.backfillCursor,
    lastError: connection.lastError,
    accounts,
    importedCount: counts?.total ?? 0,
  }
}
