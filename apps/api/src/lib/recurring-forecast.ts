import { addDays, clampDayToMonth, makeIso, parseIsoParts, type IsoDate, type Month } from '@nauri/contracts'

/**
 * Previsão das contas que se repetem todo mês (assinaturas, academia, um Pix
 * fixo), a partir dos gastos reais que vieram do banco.
 *
 * Uma série é o mesmo estabelecimento (descrição) cobrado uma vez por mês, no
 * mesmo dia e com valor parecido. Mercado, combustível e farmácia também se
 * repetem, mas com dia e valor soltos: não são conta fixa e ficam de fora.
 * Uma série que parou de cobrar (assinatura cancelada) sai da previsão
 * sozinha. Nada é gravado: é calculado a cada leitura.
 */

export interface ExpensePayment {
  occurredOn: IsoDate
  amountCents: number
  description: string
  categoryName: string
}

export interface RecurringSeries {
  description: string
  categoryName: string
  /** Dia do mês da última cobrança. */
  day: number
  /** Valor da última cobrança. */
  amountCents: number
}

export interface ExpenseForecast {
  occurredOn: IsoDate
  amountCents: number
  description: string
  categoryName: string
}

/** Quanto voltar para descobrir as séries: cerca de quatro meses. */
export const RECURRING_LOOKBACK_DAYS = 120

/** Meses distintos com cobrança, no mínimo, para virar série. */
const MIN_MONTHS = 3

/** Distância máxima entre o dia de cada cobrança e o da última. */
const DAY_TOLERANCE = 5

/** Variação máxima de valor em relação à última cobrança (reajuste, câmbio). */
const AMOUNT_TOLERANCE = 0.25

/** Sem cobrança há mais que isto, a série é dada como encerrada. */
const STALE_DAYS = 45

function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 31 - d)
}

function seriesKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** As contas fixas ativas, pelos gastos dos últimos `RECURRING_LOOKBACK_DAYS`. */
export function recurringSeries(payments: ExpensePayment[], today: IsoDate): RecurringSeries[] {
  const since = addDays(today, -RECURRING_LOOKBACK_DAYS)
  const groups = new Map<string, ExpensePayment[]>()
  for (const p of payments) {
    if (p.occurredOn <= since || p.occurredOn > today) continue
    const key = seriesKey(p.description)
    const group = groups.get(key)
    if (group) group.push(p)
    else groups.set(key, [p])
  }

  const series: RecurringSeries[] = []
  for (const group of groups.values()) {
    const months = new Set(group.map((p) => p.occurredOn.slice(0, 7)))
    // Uma cobrança por mês: duas no mesmo mês já é consumo, não conta fixa.
    if (months.size < MIN_MONTHS || months.size !== group.length) continue

    const latest = group.reduce((a, b) => (b.occurredOn > a.occurredOn ? b : a))
    if (latest.occurredOn < addDays(today, -STALE_DAYS)) continue

    const day = parseIsoParts(latest.occurredOn).day
    const regular = group.every(
      (p) =>
        dayDistance(parseIsoParts(p.occurredOn).day, day) <= DAY_TOLERANCE &&
        Math.abs(p.amountCents - latest.amountCents) <= latest.amountCents * AMOUNT_TOLERANCE,
    )
    if (!regular) continue

    series.push({
      description: latest.description,
      categoryName: latest.categoryName,
      day,
      amountCents: latest.amountCents,
    })
  }
  return series.sort((a, b) => a.day - b.day || a.description.localeCompare(b.description))
}

/**
 * Contas fixas previstas num mês: as que ainda não cobraram. Mês passado não
 * tem previsão. No mês atual, a que já devia ter cobrado há mais de
 * `DAY_TOLERANCE` dias e não cobrou deixa de ser prevista (provavelmente foi
 * cancelada; se cobrar, entra como lançamento normal).
 *
 * @param charged gastos reais já lançados no mês (`month`).
 */
export function forecastExpensesForMonth(
  series: RecurringSeries[],
  charged: ExpensePayment[],
  month: Month,
  today: IsoDate,
): ExpenseForecast[] {
  if (month < today.slice(0, 7)) return []
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const chargedKeys = new Set(charged.filter((p) => p.occurredOn.startsWith(month)).map((p) => seriesKey(p.description)))

  const out: ExpenseForecast[] = []
  for (const s of series) {
    if (chargedKeys.has(seriesKey(s.description))) continue
    const occurredOn = makeIso(year, monthNumber, clampDayToMonth(year, monthNumber, s.day))
    if (occurredOn < addDays(today, -DAY_TOLERANCE)) continue
    out.push({ occurredOn, amountCents: s.amountCents, description: s.description, categoryName: s.categoryName })
  }
  return out
}
