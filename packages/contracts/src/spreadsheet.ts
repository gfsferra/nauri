import { safeParseDateToIso, type DayOrder } from './dates'
import { safeParseAmountToCents, type MoneyLocale } from './money'
import type { ImportRow } from './import'
import type { Kind } from './primitives'

/**
 * Traduz a planilha para lançamentos.
 *
 * O layout de origem tem gastos e ganhos lado a lado — as colunas A e B da
 * planilha original —, então o mapeamento é declarado por tipo: um bloco de
 * colunas para gasto, outro para ganho, lidos da MESMA linha do arquivo.
 * Uma linha pode render zero, um ou dois lançamentos.
 */
export type ColumnMap = {
  date: string
  amount: string
  description?: string
  category?: string
  /** Usada quando a planilha não tem coluna de categoria para aquele bloco. */
  fallbackCategory: string
}

export type SheetMapping = {
  expense?: ColumnMap
  income?: ColumnMap
}

export type ParseOptions = {
  locale?: MoneyLocale
  dayOrder?: DayOrder
}

export type RowError = {
  /** Numeração da linha como o usuário vê na planilha (1 = cabeçalho). */
  line: number
  kind: Kind
  column: string
  value: string
  reason: string
}

export type SheetResult = {
  rows: ImportRow[]
  errors: RowError[]
  /** Linhas em branco no bloco — normais numa planilha, não são erro. */
  emptyRows: number
}

/**
 * Converte as linhas cruas (já lidas do CSV) em lançamentos válidos.
 *
 * Nunca lança: uma linha ruim vira um item em `errors` e o resto segue. Numa
 * importação de anos de histórico, abortar tudo por causa de uma célula
 * digitada errada em 2019 seria o pior comportamento possível.
 */
export function buildRowsFromSheet(
  raw: Array<Record<string, string>>,
  mapping: SheetMapping,
  options: ParseOptions = {},
): SheetResult {
  const { locale = 'auto', dayOrder = 'auto' } = options
  const rows: ImportRow[] = []
  const errors: RowError[] = []
  let emptyRows = 0

  raw.forEach((record, index) => {
    const line = index + 2 // +1 pelo cabeçalho, +1 porque planilha conta de 1

    for (const kind of ['expense', 'income'] as const) {
      const map = mapping[kind]
      if (!map) continue

      const rawDate = (record[map.date] ?? '').trim()
      const rawAmount = (record[map.amount] ?? '').trim()

      // Bloco vazio: a planilha tem gasto nesta linha mas não ganho, ou vice-versa.
      if (rawDate === '' && rawAmount === '') {
        emptyRows++
        continue
      }

      const date = safeParseDateToIso(rawDate, dayOrder)
      if (!date.ok) {
        errors.push({ line, kind, column: map.date, value: rawDate, reason: date.error })
        continue
      }

      const amount = safeParseAmountToCents(rawAmount, locale)
      if (!amount.ok) {
        errors.push({ line, kind, column: map.amount, value: rawAmount, reason: amount.error })
        continue
      }

      // Planilha costuma lançar gasto como negativo. O sinal já está no `kind`,
      // então o valor é sempre guardado positivo.
      const amountCents = Math.abs(amount.cents)
      if (amountCents === 0) {
        errors.push({
          line,
          kind,
          column: map.amount,
          value: rawAmount,
          reason: 'Valor zerado',
        })
        continue
      }

      const category = map.category ? (record[map.category] ?? '').trim() : ''

      rows.push({
        kind,
        occurredOn: date.date,
        amountCents,
        description: map.description ? (record[map.description] ?? '').trim().slice(0, 200) : '',
        categoryName: category || map.fallbackCategory,
      })
    }
  })

  return { rows, errors, emptyRows }
}

/**
 * Palpite inicial do mapeamento a partir dos nomes de coluna.
 *
 * É só um ponto de partida: a tela mostra o preview e deixa corrigir. Errar o
 * palpite é barato, errar a importação silenciosamente não é.
 */
export function guessColumns(headers: string[]): Partial<Record<keyof ColumnMap, string>> {
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(h.trim().toLowerCase())))

  return {
    date: find([/^data/, /\bdata\b/, /^date/, /dia/]),
    amount: find([/valor/, /^r\$/, /pre[çc]o/, /quantia/, /amount/]),
    description: find([/descri/, /hist[óo]rico/, /detalhe/, /observa/]),
    category: find([/categor/, /tipo/, /classific/]),
  }
}
