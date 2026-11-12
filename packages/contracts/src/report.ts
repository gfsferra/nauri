import { z } from 'zod'
import { isoDateSchema, kindSchema, monthSchema, uuidSchema } from './primitives'

/** Saldo pode ser negativo — por isso `int()` sem `positive()`. */
export const summarySchema = z.object({
  month: monthSchema,
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  /** Só o que já aconteceu; a previsão vem à parte. */
  balanceCents: z.number().int(),
  /** Salário previsto que ainda não caiu no mês (zero em mês passado). */
  forecastIncomeCents: z.number().int(),
  /** Contas fixas (assinaturas etc.) previstas que ainda não cobraram no mês. */
  forecastExpenseCents: z.number().int(),
  forecast: z.array(
    z.object({
      occurredOn: isoDateSchema,
      kind: kindSchema,
      amountCents: z.number().int(),
      description: z.string(),
      categoryName: z.string(),
      categoryColor: z.string().nullable(),
      categoryIcon: z.string().nullable(),
    }),
  ),
})

export const byCategoryRowSchema = z.object({
  categoryId: uuidSchema,
  categoryName: z.string(),
  categoryColor: z.string(),
  categoryIcon: z.string().nullable(),
  kind: kindSchema,
  totalCents: z.number().int(),
  transactionCount: z.number().int(),
})

export const monthlyRowSchema = z.object({
  month: monthSchema,
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  balanceCents: z.number().int(),
})

export const summaryQuerySchema = z.object({ month: monthSchema })

export const byCategoryQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  kind: kindSchema.optional(),
})

export const monthlyQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
})

export type Summary = z.infer<typeof summarySchema>
export type ByCategoryRow = z.infer<typeof byCategoryRowSchema>
export type MonthlyRow = z.infer<typeof monthlyRowSchema>
