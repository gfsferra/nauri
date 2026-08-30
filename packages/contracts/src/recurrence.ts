import { z } from 'zod'
import {
  amountCentsSchema,
  descriptionSchema,
  isoDateSchema,
  kindSchema,
  uuidSchema,
} from './primitives'

const recurrenceBase = z.object({
  kind: kindSchema,
  categoryId: uuidSchema,
  description: descriptionSchema.min(1, 'Descreva o lançamento recorrente'),
  amountCents: amountCentsSchema,
  startOn: isoDateSchema,
  endOn: isoDateSchema.nullish(),
})

/**
 * União discriminada em vez de um punhado de campos opcionais: assim é
 * impossível cadastrar uma recorrência semanal com "dia 31 do mês".
 */
export const recurrenceCreateSchema = z
  .discriminatedUnion('frequency', [
    recurrenceBase.extend({
      frequency: z.literal('monthly'),
      dayOfMonth: z.number().int().min(1).max(31),
    }),
    recurrenceBase.extend({
      frequency: z.literal('weekly'),
      /** 0 = domingo … 6 = sábado */
      weekday: z.number().int().min(0).max(6),
    }),
    recurrenceBase.extend({
      frequency: z.literal('yearly'),
      monthOfYear: z.number().int().min(1).max(12),
      dayOfMonth: z.number().int().min(1).max(31),
    }),
  ])
  .refine((r) => !r.endOn || r.endOn >= r.startOn, {
    message: 'A data final deve ser igual ou posterior à inicial',
    path: ['endOn'],
  })

export const recurrenceUpdateSchema = z.object({
  description: descriptionSchema.min(1).optional(),
  amountCents: amountCentsSchema.optional(),
  categoryId: uuidSchema.optional(),
  endOn: isoDateSchema.nullish(),
  isActive: z.boolean().optional(),
})

export const recurrenceSchema = z.object({
  id: uuidSchema,
  kind: kindSchema,
  categoryId: uuidSchema,
  description: z.string(),
  amountCents: z.number().int(),
  frequency: z.enum(['monthly', 'weekly', 'yearly']),
  dayOfMonth: z.number().int().nullable(),
  weekday: z.number().int().nullable(),
  monthOfYear: z.number().int().nullable(),
  startOn: isoDateSchema,
  endOn: isoDateSchema.nullable(),
  isActive: z.boolean(),
})

export type RecurrenceCreate = z.infer<typeof recurrenceCreateSchema>
export type RecurrenceUpdate = z.infer<typeof recurrenceUpdateSchema>
export type Recurrence = z.infer<typeof recurrenceSchema>
export type Frequency = Recurrence['frequency']
