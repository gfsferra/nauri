import { z } from 'zod'
import {
  amountCentsSchema,
  descriptionSchema,
  isoDateSchema,
  kindSchema,
} from './primitives'

/**
 * O CSV é lido e normalizado no cliente; aqui já chegam linhas válidas.
 * A categoria vem por NOME (é o que existe na planilha) e é criada sob demanda.
 */
export const importRowSchema = z.object({
  kind: kindSchema,
  occurredOn: isoDateSchema,
  amountCents: amountCentsSchema,
  description: descriptionSchema.default(''),
  categoryName: z.string().trim().min(1).max(60),
})

export const importCommitSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(500),
  /** Pula linhas idênticas a lançamentos já existentes (reimportar é seguro). */
  skipDuplicates: z.boolean().default(true),
})

export const importResultSchema = z.object({
  inserted: z.number().int(),
  skipped: z.number().int(),
  categoriesCreated: z.array(z.string()),
})

export type ImportRow = z.infer<typeof importRowSchema>
export type ImportCommit = z.infer<typeof importCommitSchema>
export type ImportResult = z.infer<typeof importResultSchema>
