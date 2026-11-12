import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  primaryKey,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/* ─────────────────────────── Better Auth ─────────────────────────── */
/* Formato exigido pela biblioteca; não alterar nomes de coluna.       */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    /** Exigido pelo Better Auth 1.7: identifica o emissor da credencial. */
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('account_issuer_account_id_uq').on(t.issuer, t.accountId),
    index('account_user_idx').on(t.userId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/**
 * Contadores do rate limit do Better Auth (`rateLimit.storage: 'database'`).
 * No banco a checagem e o incremento são atômicos, então o limite é exato. O
 * binding de rate limit da Cloudflare conta por data center e de forma
 * aproximada, e deixava passar dezenas de tentativas.
 */
export const rateLimit = pgTable(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    /** IP + rota, montado pelo Better Auth. */
    key: text('key').notNull().unique(),
    count: integer('count').notNull(),
    /** Epoch em ms. */
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  // A limpeza periódica apaga por `last_request`.
  (t) => [index('rate_limit_last_request_idx').on(t.lastRequest)],
)

/* ──────────────────────────── Domínio ───────────────────────────── */

/*
 * As chaves primárias usam `uuidv7()` (nativo no Postgres 18) em vez de
 * `gen_random_uuid()`. UUIDv7 é ordenado no tempo, e a paginação por keyset
 * ordena por `(occurred_on DESC, id DESC)`: com v4, dois lançamentos no mesmo
 * dia se desempatam por acaso; com v7, por ordem de digitação — que é o que o
 * usuário espera ver. O ganho de localidade de índice é bônus, e só apareceria
 * na casa dos milhões de linhas.
 */

/** O que substitui as duas colunas da planilha por uma tabela só. */
export const kindEnum = pgEnum('kind', ['expense', 'income'])

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: kindEnum('kind').notNull(),
    color: text('color').notNull().default('#94a3b8'),
    icon: text('icon'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Mercado" e "mercado" são a mesma categoria — a importação depende disso
    // para não criar duplicata a cada variação de caixa vinda da planilha.
    uniqueIndex('categories_user_kind_name_uq').on(t.userId, t.kind, sql`lower(${t.name})`),
    // Alvo da FK composta em transactions. Redundante como chave,
    // essencial como referência.
    unique('categories_id_kind_uq').on(t.id, t.kind),
    index('categories_user_idx').on(t.userId),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: kindEnum('kind').notNull(),
    /**
     * DATE, não timestamp: um gasto "do dia 5" é uma data de calendário. Com
     * timestamp, uma compra às 23h em São Paulo é lida como o dia seguinte em
     * UTC — e na virada do ano iria para o ano errado.
     */
    occurredOn: date('occurred_on').notNull(),
    /** Centavos inteiros. Nunca `numeric`, nunca `real`. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    description: text('description').notNull().default(''),
    categoryId: uuid('category_id').notNull(),
    /** ID da transação na Pluggy, quando veio do Open Finance. */
    externalId: text('external_id'),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'set null',
    }),
    /** Compra do cartão que ainda não fechou na fatura (Open Finance). */
    isPending: boolean('is_pending').notNull().default(false),
    /**
     * Parcela de compra parcelada no cartão (Open Finance). Nem toda parcela
     * traz "2/4" na descrição; sem isto, a previsão de contas fixas confundiria
     * uma compra parcelada com uma assinatura.
     */
    isInstallment: boolean('is_installment').notNull().default(false),
    /**
     * Dia que conta para o orçamento, quando difere de `occurredOn`. A compra
     * no cartão pesa no mês anterior ao vencimento da fatura dela, que é o mês
     * cujo salário paga essa fatura: a parcela de 31/10 na fatura que vence em
     * 9/12 conta em novembro (vira 1/11 aqui). Null = o próprio `occurredOn`.
     * Toda soma por mês usa `budgetDate` (abaixo), nunca `occurredOn` direto.
     */
    budgetOn: date('budget_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // O banco recusa vincular um gasto a uma categoria de receita. A coerência
    // deixa de depender de lembrarmos de validar em cada rota.
    foreignKey({
      columns: [t.categoryId, t.kind],
      foreignColumns: [categories.id, categories.kind],
      name: 'transactions_category_kind_fk',
    }),
    // Idempotência do Open Finance: a mesma transação do banco nunca entra
    // duas vezes, nem com duas sincronizações rodando ao mesmo tempo. NULLs são
    // distintos, então lançamentos manuais não colidem.
    uniqueIndex('transactions_user_external_uq').on(t.userId, t.externalId),
    index('transactions_user_date_idx').on(t.userId, t.occurredOn.desc()),
    index('transactions_user_budget_idx').on(t.userId, sql`coalesce(${t.budgetOn}, ${t.occurredOn})`),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
    check('transactions_amount_positive', sql`${t.amountCents} > 0`),
  ],
)

/* ────────────────────────── Open Finance ─────────────────────────── */
/*
 * Via Meu Pluggy, o plano gratuito de uso pessoal da Pluggy: só o titular da
 * conexão (a conta do dono, `OPEN_FINANCE_USER_ID`) recebe dados do banco.
 * Ver lib/open-finance-sync.ts.
 */

export const bankConnections = pgTable('bank_connections', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** ID da conexão (item) na Pluggy. */
  itemId: text('item_id').notNull().unique(),
  /** Status da conexão na Pluggy (UPDATED, LOGIN_ERROR, OUTDATED...). */
  status: text('status').notNull().default('PENDING'),
  consentExpiresAt: timestamp('consent_expires_at', { withTimezone: true }),
  /** `lastUpdatedAt` da Pluggy na última leitura recente: diz se há dado novo. */
  providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  /** Data mais antiga a importar. */
  syncFrom: date('sync_from').notNull(),
  /** Data mais antiga já importada; igual a `sync_from` quando o histórico terminou. */
  backfillCursor: date('backfill_cursor').notNull(),
  lastError: text('last_error'),
  /** `lastUpdatedAt` da Pluggy na última leitura dos investimentos (uma vez por atualização dela). */
  investmentsSyncedAt: timestamp('investments_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export interface UpcomingInstallment {
  externalId: string
  occurredOn: string
  /** Ver `transactions.budgetOn`. Ausente nas leituras antigas. */
  budgetOn?: string | null
  amountCents: number
  description: string
  categoryName: string
}

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** ID da conta na Pluggy. */
    externalId: text('external_id').notNull().unique(),
    /** BANK (conta corrente) ou CREDIT (cartão): o sinal dos valores muda entre os dois. */
    type: text('type').notNull(),
    name: text('name').notNull(),
    /** Conta corrente: saldo na última leitura (pode ser negativo). Cartão: o limite usado. */
    balanceCents: bigint('balance_cents', { mode: 'number' }),
    /** Cartão: valor da fatura em aberto (a próxima a vencer), na última leitura. */
    billAmountCents: bigint('bill_amount_cents', { mode: 'number' }),
    /** Cartão: vencimento da fatura em aberto. */
    billDueOn: date('bill_due_on'),
    /**
     * Cartão: parcelas futuras já conhecidas, que viram previsão no mês de
     * cada uma. `[{ externalId, occurredOn, amountCents, description, categoryName }]`.
     */
    upcomingInstallments: jsonb('upcoming_installments').$type<UpcomingInstallment[]>(),
    /** Quando a fatura e as parcelas acima foram lidas. */
    billUpdatedAt: timestamp('bill_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bank_accounts_user_idx').on(t.userId)],
)

/**
 * Transações do Open Finance que o usuário apagou. Sem isto, a próxima
 * sincronização traria de volta o que ele tirou de propósito.
 */
export const openFinanceIgnored = pgTable(
  'open_finance_ignored',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.externalId] })],
)

/**
 * "Lançamentos com esta descrição vão sempre para esta categoria." O padrão é
 * a descrição normalizada (`normalizeDescription` em @nauri/contracts). A
 * sincronização do Open Finance aplica a regra em todo lançamento novo; os que
 * já existiam são trocados quando a regra é criada.
 */
export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: kindEnum('kind').notNull(),
    pattern: text('pattern').notNull(),
    categoryId: uuid('category_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Como nos lançamentos: uma regra de gasto nunca aponta para categoria de receita.
    foreignKey({
      columns: [t.categoryId, t.kind],
      foreignColumns: [categories.id, categories.kind],
      name: 'category_rules_category_kind_fk',
    }).onDelete('cascade'),
    uniqueIndex('category_rules_user_kind_pattern_uq').on(t.userId, t.kind, t.pattern),
  ],
)

/**
 * Investimentos de cada conexão, como a Pluggy mostrou na última leitura. A
 * Pluggy só dá a foto de hoje; a evolução fica em `wealth_snapshots`.
 * Ver lib/investments.ts.
 */
export const investments = pgTable(
  'investments',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    /** ID do investimento na Pluggy. */
    externalId: text('external_id').notNull().unique(),
    /** FIXED_INCOME, ETF, EQUITY... (tipo da Pluggy). */
    type: text('type').notNull(),
    subtype: text('subtype'),
    name: text('name').notNull(),
    /** Código na bolsa (IVVB11), quando houver. */
    code: text('code'),
    issuer: text('issuer'),
    /** ACTIVE, PENDING ou TOTAL_WITHDRAWAL. */
    status: text('status').notNull(),
    /**
     * O `status` da última vez que as movimentações foram lidas; null se
     * nunca foram. Diferente de `status` = há movimentação por ler (ver
     * `planMovementFetches`). Não dá para usar o próprio `status`: a posição
     * é gravada toda vez, mesmo quando a leitura das movimentações fica para
     * a execução seguinte.
     */
    movementsStatus: text('movements_status'),
    /** Valor líquido: o que cai na conta num resgate hoje, já sem IR e IOF. */
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull(),
    /** Valor bruto, antes dos impostos. */
    grossCents: bigint('gross_cents', { mode: 'number' }).notNull(),
    /** Custo de compra do que segue aplicado; null quando o histórico não explica a posição. */
    costCents: bigint('cost_cents', { mode: 'number' }),
    /** Cotas (bolsa) ou unidades do título. Só para exibir, nunca para somar dinheiro. */
    quantity: doublePrecision('quantity'),
    /** Percentual do indexador (120 = 120% do CDI). */
    rate: doublePrecision('rate'),
    rateType: text('rate_type'),
    fixedAnnualRate: doublePrecision('fixed_annual_rate'),
    dueOn: date('due_on'),
    purchaseOn: date('purchase_on'),
    /** Dia da cotação que a Pluggy usou. */
    positionOn: date('position_on'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('investments_user_idx').on(t.userId)],
)

/** Aportes, resgates e proventos de cada investimento. Alimentam o "guardado no mês". */
export const investmentMovements = pgTable(
  'investment_movements',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    investmentId: uuid('investment_id')
      .notNull()
      .references(() => investments.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull().unique(),
    /** BUY, SELL, INTEREST... (tipo da Pluggy). */
    type: text('type').notNull(),
    occurredOn: date('occurred_on').notNull(),
    /** Valor bruto da operação. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** O que de fato saiu ou voltou para a conta, depois de IR, IOF e taxas. */
    netAmountCents: bigint('net_amount_cents', { mode: 'number' }),
  },
  (t) => [index('investment_movements_user_date_idx').on(t.userId, t.occurredOn)],
)

/**
 * Uma foto por dia do patrimônio, gravada na leitura dos investimentos. É o
 * único jeito de ter a evolução: a Pluggy não guarda valores passados.
 */
export const wealthSnapshots = pgTable(
  'wealth_snapshots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    investmentsCents: bigint('investments_cents', { mode: 'number' }).notNull(),
    /** Soma dos saldos das contas correntes. */
    accountsCents: bigint('accounts_cents', { mode: 'number' }).notNull(),
    /** Soma das faturas em aberto dos cartões. */
    cardBillCents: bigint('card_bill_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

export type User = typeof user.$inferSelect
export type Category = typeof categories.$inferSelect
export type Transaction = typeof transactions.$inferSelect

/** A data que vale para somas por mês: `budget_on` quando houver, senão `occurred_on`. */
export const budgetDate = sql<string>`coalesce(${transactions.budgetOn}, ${transactions.occurredOn})`
