import { z } from 'zod'
import { amountCentsSchema, monthSchema, uuidSchema } from './primitives'

export const budgetUpsertSchema = z.object({
  categoryId: uuidSchema,
  month: monthSchema,
  limitCents: amountCentsSchema,
})

export const budgetSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  categoryName: z.string(),
  categoryColor: z.string(),
  month: monthSchema,
  limitCents: z.number().int(),
  /** Quanto já foi gasto na categoria dentro do mês — calculado, não guardado. */
  spentCents: z.number().int(),
})

export type BudgetUpsert = z.infer<typeof budgetUpsertSchema>
export type Budget = z.infer<typeof budgetSchema>
