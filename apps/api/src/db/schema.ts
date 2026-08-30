import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
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
export const frequencyEnum = pgEnum('frequency', ['monthly', 'weekly', 'yearly'])

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
    // Alvo da FK composta em transactions/recurrences. Redundante como chave,
    // essencial como referência.
    unique('categories_id_kind_uq').on(t.id, t.kind),
    index('categories_user_idx').on(t.userId),
  ],
)

export const recurrences = pgTable(
  'recurrences',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: kindEnum('kind').notNull(),
    categoryId: uuid('category_id').notNull(),
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    frequency: frequencyEnum('frequency').notNull(),
    dayOfMonth: smallint('day_of_month'),
    weekday: smallint('weekday'),
    monthOfYear: smallint('month_of_year'),
    startOn: date('start_on').notNull(),
    endOn: date('end_on'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.categoryId, t.kind],
      foreignColumns: [categories.id, categories.kind],
      name: 'recurrences_category_kind_fk',
    }),
    index('recurrences_user_active_idx').on(t.userId, t.isActive),
    check('recurrences_amount_positive', sql`${t.amountCents} > 0`),
    check('recurrences_period', sql`${t.endOn} IS NULL OR ${t.endOn} >= ${t.startOn}`),
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
    recurrenceId: uuid('recurrence_id').references(() => recurrences.id, {
      onDelete: 'set null',
    }),
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
    // Idempotência da geração de recorrentes: duas requisições simultâneas
    // abrindo o mesmo mês não conseguem lançar o salário duas vezes.
    // NULLs são distintos no Postgres, então lançamentos manuais não colidem.
    uniqueIndex('transactions_recurrence_occurrence_uq').on(t.recurrenceId, t.occurredOn),
    index('transactions_user_date_idx').on(t.userId, t.occurredOn.desc()),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
    check('transactions_amount_positive', sql`${t.amountCents} > 0`),
  ],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** Sempre o dia 1 do mês de competência. */
    month: date('month').notNull(),
    limitCents: bigint('limit_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('budgets_user_category_month_uq').on(t.userId, t.categoryId, t.month),
    check('budgets_limit_positive', sql`${t.limitCents} > 0`),
    check('budgets_month_is_first_day', sql`date_part('day', ${t.month}) = 1`),
  ],
)

export type User = typeof user.$inferSelect
export type Category = typeof categories.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Recurrence = typeof recurrences.$inferSelect
export type Budget = typeof budgets.$inferSelect
