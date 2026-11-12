import { z } from 'zod'
import {
  amountCentsSchema,
  descriptionSchema,
  isoDateSchema,
  kindSchema,
  uuidSchema,
} from './primitives'

export const transactionCreateSchema = z.object({
  kind: kindSchema,
  occurredOn: isoDateSchema,
  amountCents: amountCentsSchema,
  description: descriptionSchema.default(''),
  categoryId: uuidSchema,
})

/**
 * `kind` fica de fora: trocar o tipo de um lançamento já existente exigiria
 * trocar a categoria junto (a FK composta no banco recusaria o par incoerente).
 * Apagar e relançar é mais honesto que um update que falha pela metade.
 */
export const transactionUpdateSchema = transactionCreateSchema
  .omit({ kind: true })
  .partial()

export const transactionSchema = z.object({
  id: uuidSchema,
  kind: kindSchema,
  occurredOn: isoDateSchema,
  amountCents: z.number().int(),
  description: z.string(),
  categoryId: uuidSchema,
})

export const transactionListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  kind: kindSchema.optional(),
  categoryId: uuidSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type TransactionCreate = z.infer<typeof transactionCreateSchema>
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>
