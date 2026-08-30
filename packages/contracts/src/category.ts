import { z } from 'zod'
import { hexColorSchema, kindSchema, uuidSchema } from './primitives'

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(60),
  kind: kindSchema,
  color: hexColorSchema.default('#94a3b8'),
  icon: z.string().trim().max(40).optional(),
})

/** O `kind` não é editável: mudá-lo invalidaria todas as transações já ligadas. */
export const categoryUpdateSchema = categoryCreateSchema
  .omit({ kind: true })
  .partial()
  .extend({ isArchived: z.boolean().optional() })

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: kindSchema,
  color: z.string(),
  icon: z.string().nullable(),
  isArchived: z.boolean(),
})

export type CategoryCreate = z.infer<typeof categoryCreateSchema>
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>
export type Category = z.infer<typeof categorySchema>
