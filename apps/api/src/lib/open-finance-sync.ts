import { addDays, todayInTimezone } from '@nauri/contracts'
import { and, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { bankAccounts, bankConnections, categories, openFinanceIgnored, transactions } from '../db/schema.js'
import type { Env } from '../env.js'
import {
  bankCodeOf,
  bankLabelOf,
  HISTORY_DAYS,
  mapPluggyTransaction,
  openCardBill,
  upcomingInstallments,
  planManualSync,
  planSync,
  type MappedTransaction,
  type PluggyAccountType,
  type PluggyTransaction,
  type SkipReason,
} from './open-finance.js'
import { createPluggyClient, type PluggyAccount, type PluggyClient, type PluggyItem } from './pluggy.js'

/**
 * Sincronização do Open Finance (Meu Pluggy → Nauri).
 *
 * Roda de hora em hora (Cron Trigger) e pelo botão "Sincronizar agora". No
 * Meu Pluggy cada banco é uma conexão (item) separada; cada execução processa
 * UMA janela de datas por conexão (ver `planSync`): a leitura recente quando
 * a Pluggy tem dado novo, ou uma fatia de um mês do histórico. Assim nenhuma
 * execução carrega 12 meses de uma vez, o que estouraria os 10 ms de CPU do
 * plano gratuito do Workers.
 */

export interface OpenFinanceConfig {
  clientId: string
  clientSecret: string
  /** Uma conexão por banco. `PLUGGY_ITEM_ID` aceita vários IDs separados por vírgula. */
  itemIds: string[]
  userId: string
}

/** O recurso só existe com as quatro variáveis configuradas. */
export function openFinanceConfig(env: Env): OpenFinanceConfig | null {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_ID, OPEN_FINANCE_USER_ID } = env
  const itemIds = (PLUGGY_ITEM_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || itemIds.length === 0 || !OPEN_FINANCE_USER_ID) return null
  return {
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
    itemIds,
    userId: OPEN_FINANCE_USER_ID,
  }
}

export interface ConnectionSyncResult {
  itemId: string
  plan: 'idle' | 'recent' | 'backfill'
  from?: string
  to?: string
  inserted: number
  updated: number
  removedPending: number
  skipped: Partial<Record<SkipReason | 'ignored', number>>
  /** Falha só desta conexão; as outras seguem. */
  error?: string
}

export interface SyncResult {
  connections: ConnectionSyncResult[]
}

type Connection = typeof bankConnections.$inferSelect

export async function syncOpenFinance(
  db: Db,
  config: OpenFinanceConfig,
  options: { manual?: boolean; now?: Date; client?: PluggyClient } = {},
): Promise<SyncResult> {
  const now = options.now ?? new Date()
  const today = todayInTimezone(now)

  const connections: Connection[] = []
  for (const itemId of config.itemIds) connections.push(await ensureConnection(db, config.userId, itemId, today))

  // Primeiro o estado e as contas de TODAS as conexões: a regra das
  // transferências entre contas do titular precisa saber quais bancos estão
  // conectados. Se uma conexão não responde, nada é importado nesta rodada,
  // senão um repasse vindo dela entraria como receita e contaria duas vezes.
  const remote: Array<{ connection: Connection; item: PluggyItem; accounts: PluggyAccount[] }> = []
  let client: PluggyClient
  try {
    client = options.client ?? (await createPluggyClient(config.clientId, config.clientSecret))
  } catch (error) {
    await recordError(db, connections, error)
    throw error
  }
  for (const connection of connections) {
    try {
      const item = await client.item(connection.itemId)
      const accounts = await client.accounts(connection.itemId)
      remote.push({ connection, item, accounts })
    } catch (error) {
      await recordError(db, [connection], error)
      throw error
    }
  }
  const connectedBanks = new Set(
    remote.flatMap((r) => r.accounts.map((a) => bankCodeOf(a.bankData?.transferNumber))).filter((c) => c !== null),
  )

  const categoryIds = await loadCategoryIds(db, config.userId)
  const ignored = new Set(
    (
      await db
        .select({ externalId: openFinanceIgnored.externalId })
        .from(openFinanceIgnored)
        .where(eq(openFinanceIgnored.userId, config.userId))
    ).map((r) => r.externalId),
  )

  const results: ConnectionSyncResult[] = []
  let firstError: unknown = null
  for (const r of remote) {
    try {
      results.push(
        await syncConnection(db, client, {
          ...r,
          userId: config.userId,
          manual: options.manual ?? false,
          now,
          today,
          connectedBanks,
          categoryIds,
          ignored,
        }),
      )
    } catch (error) {
      await recordError(db, [r.connection], error)
      firstError ??= error
      results.push({
        itemId: r.connection.itemId,
        plan: 'idle',
        inserted: 0,
        updated: 0,
        removedPending: 0,
        skipped: {},
        error: errorMessage(error),
      })
    }
  }
  // Uma conexão com problema não derruba as outras; só falha de vez se
  // nenhuma funcionou.
  if (firstError && results.every((r) => r.error)) throw firstError
  return { connections: results }
}

async function syncConnection(
  db: Db,
  client: PluggyClient,
  ctx: {
    connection: Connection
    item: PluggyItem
    accounts: PluggyAccount[]
    userId: string
    manual: boolean
    now: Date
    today: string
    connectedBanks: ReadonlySet<string>
    categoryIds: Map<string, string>
    ignored: Set<string>
  },
): Promise<ConnectionSyncResult> {
  const { connection, item, today } = ctx

  const state = {
    syncFrom: connection.syncFrom,
    backfillCursor: connection.backfillCursor,
    providerUpdatedAt: connection.providerUpdatedAt?.toISOString() ?? null,
  }
  const plan = ctx.manual
    ? planManualSync(state, item.lastUpdatedAt, today)
    : planSync(state, item.lastUpdatedAt, today)

  const result: ConnectionSyncResult = {
    itemId: connection.itemId,
    plan: plan.kind,
    inserted: 0,
    updated: 0,
    removedPending: 0,
    skipped: {},
  }
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

  const accounts = await upsertAccounts(db, ctx.userId, connection.id, ctx.accounts)
  for (const account of accounts) {
    const fetched = await client.transactions(account.externalId, plan.from, plan.to)
    await applyTransactions(db, {
      userId: ctx.userId,
      account,
      fetched,
      today,
      connectedBanks: ctx.connectedBanks,
      ignored: ctx.ignored,
      categoryIds: ctx.categoryIds,
      // Só a leitura recente reconcilia pendentes: é a janela em que uma
      // compra pendente vira definitiva (às vezes com outro ID).
      reconcileWindow: plan.kind === 'recent' ? { from: plan.from, to: plan.to } : null,
      result,
    })
    // Fatura em aberto e parcelas futuras: relidas junto com o dado novo.
    if (plan.kind === 'recent' && account.type === 'CREDIT') {
      const remote = ctx.accounts.find((a) => a.id === account.externalId)
      await refreshCardBill(db, client, account, remote, today, ctx.connectedBanks, ctx.now)
    }
  }

  await db
    .update(bankConnections)
    .set({
      ...statusUpdate,
      ...(plan.kind === 'recent'
        ? {
            providerUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
            lastSyncedAt: ctx.now,
            backfillCursor: plan.from < connection.backfillCursor ? plan.from : connection.backfillCursor,
          }
        : { backfillCursor: plan.from }),
    })
    .where(eq(bankConnections.id, connection.id))

  return result
}

/**
 * Lê a fatura em aberto e as parcelas futuras do cartão (ver `openCardBill` e
 * `upcomingInstallments`). Uma leitura a mais, de dois meses atrás até pouco
 * mais de um ano à frente, que é até onde vão as parcelas.
 */
async function refreshCardBill(
  db: Db,
  client: PluggyClient,
  account: AccountRow,
  remote: PluggyAccount | undefined,
  today: string,
  connectedBanks: ReadonlySet<string>,
  now: Date,
) {
  const fetched = await client.transactions(account.externalId, addDays(today, -62), addDays(today, 400))
  const dueDate = remote?.creditData?.balanceDueDate
  const dueDay = dueDate ? Number(dueDate.slice(8, 10)) || null : null
  const bill = openCardBill(fetched, dueDay, today)
  await db
    .update(bankAccounts)
    .set({
      billAmountCents: bill?.amountCents ?? null,
      billDueOn: bill?.dueOn ?? null,
      upcomingInstallments: upcomingInstallments(fetched, today, connectedBanks).map((m) => ({
        externalId: m.externalId,
        occurredOn: m.occurredOn,
        budgetOn: m.budgetOn,
        amountCents: m.amountCents,
        description: m.description,
        categoryName: m.categoryName,
      })),
      billUpdatedAt: now,
    })
    .where(eq(bankAccounts.id, account.id))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error)
}

async function recordError(db: Db, connections: Connection[], error: unknown) {
  if (connections.length === 0) return
  await db
    .update(bankConnections)
    .set({ lastError: errorMessage(error) })
    .where(
      inArray(
        bankConnections.id,
        connections.map((c) => c.id),
      ),
    )
}

async function ensureConnection(db: Db, userId: string, itemId: string, today: string) {
  await db
    .insert(bankConnections)
    .values({
      userId,
      itemId,
      syncFrom: addDays(today, -HISTORY_DAYS),
      // Nada importado ainda: o histórico começa a partir de hoje, para trás.
      backfillCursor: today,
    })
    .onConflictDoNothing({ target: bankConnections.itemId })

  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.itemId, itemId))
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
  userId: string,
  connectionId: string,
  accounts: PluggyAccount[],
): Promise<AccountRow[]> {
  if (accounts.length === 0) return []
  const rows = await db
    .insert(bankAccounts)
    .values(
      accounts.map((a) => ({
        connectionId,
        userId,
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
    connectedBanks: ReadonlySet<string>
    ignored: Set<string>
    categoryIds: Map<string, string>
    reconcileWindow: { from: string; to: string } | null
    result: ConnectionSyncResult
  },
) {
  const { userId, account, fetched, today, ignored, categoryIds, result } = ctx

  const mapped: MappedTransaction[] = []
  for (const tx of fetched) {
    if (ignored.has(tx.id)) {
      result.skipped.ignored = (result.skipped.ignored ?? 0) + 1
      continue
    }
    const r = mapPluggyTransaction(tx, account.type, today, ctx.connectedBanks)
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
          isInstallment: m.isInstallment,
          budgetOn: m.budgetOn,
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
          isInstallment: sql`excluded.is_installment`,
          budgetOn: sql`excluded.budget_on`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${transactions.amountCents} <> excluded.amount_cents
          OR ${transactions.occurredOn} <> excluded.occurred_on
          OR ${transactions.isPending} <> excluded.is_pending
          OR ${transactions.isInstallment} <> excluded.is_installment
          OR ${transactions.budgetOn} IS DISTINCT FROM excluded.budget_on`,
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

/**
 * Para a tela: as conexões do dono somadas numa só. A tela mostra uma linha
 * por conta e um aviso; o aviso usa o pior caso (o consentimento que vence
 * primeiro, o histórico mais atrasado, um erro em qualquer conexão).
 */
export async function openFinanceStatus(db: Db, config: OpenFinanceConfig) {
  const connections = await db
    .select()
    .from(bankConnections)
    .where(inArray(bankConnections.itemId, config.itemIds))
  if (connections.length === 0) return { connected: false as const }

  const ids = connections.map((c) => c.id)
  const accounts = await db
    .select({
      connectionId: bankAccounts.connectionId,
      name: bankAccounts.name,
      type: bankAccounts.type,
      billAmountCents: bankAccounts.billAmountCents,
      billDueOn: bankAccounts.billDueOn,
      billUpdatedAt: bankAccounts.billUpdatedAt,
    })
    .from(bankAccounts)
    .where(inArray(bankAccounts.connectionId, ids))

  const [counts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, config.userId),
        inArray(
          transactions.bankAccountId,
          db.select({ id: bankAccounts.id }).from(bankAccounts).where(inArray(bankAccounts.connectionId, ids)),
        ),
      ),
    )

  // O cartão vem com o nome do produto ("ultraviolet-black"); o banco sai da
  // conta corrente da mesma conexão.
  const bankOf = new Map(
    accounts.filter((a) => a.type === 'BANK').map((a) => [a.connectionId, bankLabelOf(a.name)] as const),
  )
  const iso = (d: Date | null) => d?.toISOString() ?? null
  const synced = connections.map((c) => c.lastSyncedAt).filter((d) => d !== null)
  const consents = connections.map((c) => c.consentExpiresAt).filter((d) => d !== null)

  return {
    connected: true as const,
    status: connections.find((c) => c.status !== 'UPDATED')?.status ?? 'UPDATED',
    // A sincronização mais antiga: "há X min" não pode esconder uma conexão parada.
    lastSyncedAt:
      synced.length === connections.length ? iso(new Date(Math.min(...synced.map((d) => d.getTime())))) : null,
    consentExpiresAt: consents.length ? iso(new Date(Math.min(...consents.map((d) => d.getTime())))) : null,
    historyComplete: connections.every((c) => c.backfillCursor <= c.syncFrom),
    historyFrom: connections.map((c) => c.backfillCursor).sort().at(-1)!,
    lastError: connections.find((c) => c.lastError)?.lastError ?? null,
    accounts: accounts.map((a) => ({ name: a.name, type: a.type, bank: bankOf.get(a.connectionId) ?? bankLabelOf(a.name) })),
    /** Fatura em aberto de cada cartão, para a tela inicial. */
    cards: accounts
      .filter((a) => a.type === 'CREDIT' && a.billDueOn !== null && a.billAmountCents !== null)
      .map((a) => ({
        bank: bankOf.get(a.connectionId) ?? bankLabelOf(a.name),
        billAmountCents: a.billAmountCents!,
        billDueOn: a.billDueOn!,
        billUpdatedAt: iso(a.billUpdatedAt),
      })),
    importedCount: counts?.total ?? 0,
  }
}
