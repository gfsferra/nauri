import { z } from 'zod'
import { uuidSchema } from './primitives'

/**
 * Regra de categoria: "lançamentos com esta descrição vão sempre para esta
 * categoria". Vale para o que já existe (no momento em que a regra é criada)
 * e para o que o Open Finance trouxer depois.
 *
 * A comparação é pela descrição normalizada, não pelo texto cru: o banco
 * manda "PADARIA SÃO JOÃO", "Padaria Sao Joao" e "PADARIA SAO JOAO 2/3"
 * para a mesma padaria.
 */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Parcela ("2/4", "02/10", "parc 2/4", "parcela 2 de 4"): a compra é a mesma.
    .replace(/\b(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cria (ou troca) a regra a partir de um lançamento: a descrição dele vira o padrão. */
export const categoryRuleCreateSchema = z.object({
  transactionId: uuidSchema,
  categoryId: uuidSchema,
})

export type CategoryRuleCreate = z.infer<typeof categoryRuleCreateSchema>

/**
 * A categoria que a regra manda usar, ou null quando nenhuma regra vale.
 * `rules` é indexado por `ruleKey`.
 */
export function ruleKey(kind: 'expense' | 'income', pattern: string): string {
  return `${kind}:${pattern}`
}

export function categoryFromRules(
  rules: ReadonlyMap<string, string>,
  kind: 'expense' | 'income',
  description: string,
): string | null {
  const pattern = normalizeDescription(description)
  if (!pattern) return null
  return rules.get(ruleKey(kind, pattern)) ?? null
}

/**
 * Os lançamentos que a regra nova alcança: mesma descrição normalizada e
 * ainda numa categoria diferente da escolhida (os que já estão certos ficam
 * como estão, e não contam como "atualizados").
 */
export function idsMatchingRule(
  rows: readonly { id: string; description: string; categoryId: string }[],
  pattern: string,
  categoryId: string,
): string[] {
  if (!pattern) return []
  return rows
    .filter((r) => r.categoryId !== categoryId && normalizeDescription(r.description) === pattern)
    .map((r) => r.id)
}
