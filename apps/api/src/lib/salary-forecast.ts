import { addDays, clampDayToMonth, makeIso, parseIsoParts, type IsoDate, type Month } from '@nauri/contracts'

/**
 * Previsão do salário a partir dos salários reais que vieram do banco.
 *
 * O salário costuma cair em "parcelas" fixas no mês (adiantamento por volta
 * do dia 15 e o restante no fim do mês, por exemplo). Cada parcela que se
 * repetiu nos últimos meses vira uma previsão para os meses que ainda não
 * receberam aquela parcela, com o dia e o valor do último pagamento. Quando o
 * salário de verdade cai, a previsão daquele mês some sozinha. Nada é
 * gravado: é calculado a cada leitura.
 */

export interface SalaryPayment {
  occurredOn: IsoDate
  amountCents: number
}

export interface SalarySlot {
  /** Dia do mês do último pagamento desta parcela. */
  day: number
  /** Valor do último pagamento desta parcela. */
  amountCents: number
}

export interface ForecastEntry {
  occurredOn: IsoDate
  amountCents: number
}

/** Quanto voltar para descobrir as parcelas: cerca de três meses. */
export const LOOKBACK_DAYS = 100

/** Distância máxima, em dias, para um pagamento contar como a mesma parcela. */
export const SLOT_TOLERANCE_DAYS = 5

/** Uma parcela só vira previsão depois de aparecer pelo menos esta quantidade de vezes. */
const MIN_OCCURRENCES = 2

/**
 * Distância entre dois dias do mês dando a volta: o dia 30 e o dia 1 estão a
 * um dia um do outro (o salário do fim do mês às vezes cai no dia 1).
 */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 31 - d)
}

/** As parcelas recorrentes do salário, pelos pagamentos dos últimos `LOOKBACK_DAYS`. */
export function salarySlots(payments: SalaryPayment[], today: IsoDate): SalarySlot[] {
  const since = addDays(today, -LOOKBACK_DAYS)
  const recent = payments
    .filter((p) => p.occurredOn > since && p.occurredOn <= today)
    // Do mais novo para o mais antigo: o primeiro de cada parcela define o
    // dia e o valor previstos.
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))

  const slots: Array<SalarySlot & { count: number }> = []
  for (const p of recent) {
    const day = parseIsoParts(p.occurredOn).day
    const slot = slots.find((s) => dayDistance(s.day, day) <= SLOT_TOLERANCE_DAYS)
    if (slot) slot.count++
    else slots.push({ day, amountCents: p.amountCents, count: 1 })
  }

  return slots
    .filter((s) => s.count >= MIN_OCCURRENCES)
    .map(({ day, amountCents }) => ({ day, amountCents }))
    .sort((a, b) => a.day - b.day)
}

/**
 * Previsão de um mês: as parcelas que ainda não caíram. Mês passado não tem
 * previsão (o que não veio, não veio). No mês atual, a parcela atrasada
 * continua prevista até cair.
 *
 * @param received salários reais já lançados no mês (`month`).
 */
export function forecastForMonth(
  slots: SalarySlot[],
  received: SalaryPayment[],
  month: Month,
  today: IsoDate,
): ForecastEntry[] {
  if (month < today.slice(0, 7)) return []
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]

  const pending = slots.filter(
    (slot) =>
      !received.some(
        (p) =>
          p.occurredOn.startsWith(month) &&
          dayDistance(parseIsoParts(p.occurredOn).day, slot.day) <= SLOT_TOLERANCE_DAYS,
      ),
  )

  return pending.map((slot) => ({
    occurredOn: makeIso(year, monthNumber, clampDayToMonth(year, monthNumber, slot.day)),
    amountCents: slot.amountCents,
  }))
}
