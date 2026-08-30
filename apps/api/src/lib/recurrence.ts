/**
 * Expansão de lançamentos recorrentes (salário, aluguel, assinaturas).
 *
 * Esta função é PURA: dado o mesmo período, devolve exatamente as mesmas datas.
 * É o que permite gerar as ocorrências na leitura, sem cron — a API materializa
 * o que falta quando você abre um mês, e a unicidade
 * `(recurrence_id, occurred_on)` no banco absorve qualquer corrida entre duas
 * requisições simultâneas. Rodar duas vezes não lança o salário duas vezes.
 */

import {
  addDays,
  clampDayToMonth,
  lastDayOfMonth,
  makeIso,
  parseIsoParts,
  toMonth,
  weekdayOf,
  type IsoDate,
} from '@financas/contracts'

export type RecurrenceSpec = {
  frequency: 'monthly' | 'weekly' | 'yearly'
  /** 1–31 para mensal e anual. "Todo dia 31" é encaixado no fim de meses curtos. */
  dayOfMonth: number | null
  /** 0 = domingo … 6 = sábado, para semanal. */
  weekday: number | null
  /** 1–12, para anual. */
  monthOfYear: number | null
  startOn: IsoDate
  endOn: IsoDate | null
}

/** Trava de sanidade: nenhuma janela legítima da UI gera tanta coisa. */
const MAX_OCCURRENCES = 1000

/**
 * Datas geradas dentro de [from, to], já recortadas por `startOn`/`endOn`.
 *
 * Strings AAAA-MM-DD comparam lexicograficamente na mesma ordem que
 * cronologicamente, então os limites são comparação direta de string.
 */
export function occurrencesBetween(
  spec: RecurrenceSpec,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  const start = spec.startOn > from ? spec.startOn : from
  const end = spec.endOn && spec.endOn < to ? spec.endOn : to
  if (start > end) return []

  const out: IsoDate[] = []
  const push = (iso: IsoDate) => {
    if (iso >= start && iso <= end && out.length < MAX_OCCURRENCES) out.push(iso)
  }

  switch (spec.frequency) {
    case 'monthly': {
      const day = spec.dayOfMonth
      if (day == null) return []
      let cursor = toMonth(start)
      const lastMonth = toMonth(end)
      while (cursor <= lastMonth && out.length < MAX_OCCURRENCES) {
        const [y, m] = cursor.split('-').map(Number) as [number, number]
        push(makeIso(y, m, clampDayToMonth(y, m, day)))
        const total = y * 12 + m // já é (m-1)+1, avança um mês
        cursor = `${String(Math.floor(total / 12)).padStart(4, '0')}-${String(
          (total % 12) + 1,
        ).padStart(2, '0')}`
      }
      break
    }

    case 'weekly': {
      const weekday = spec.weekday
      if (weekday == null) return []
      // Anda até o primeiro dia da semana pedido: como toda ocorrência semanal
      // cai no mesmo dia da semana, alinhar pelo dia já reproduz a cadência.
      let cursor = start
      const shift = (weekday - weekdayOf(cursor) + 7) % 7
      if (shift > 0) cursor = addDays(cursor, shift)
      while (cursor <= end && out.length < MAX_OCCURRENCES) {
        push(cursor)
        cursor = addDays(cursor, 7)
      }
      break
    }

    case 'yearly': {
      const { dayOfMonth: day, monthOfYear: month } = spec
      if (day == null || month == null) return []
      const firstYear = parseIsoParts(start).year
      const lastYear = parseIsoParts(end).year
      for (let y = firstYear; y <= lastYear && out.length < MAX_OCCURRENCES; y++) {
        push(makeIso(y, month, clampDayToMonth(y, month, day)))
      }
      break
    }
  }

  return out
}

/**
 * Confere se os campos batem com a frequência antes de gravar.
 * A união discriminada em `@financas/contracts` já barra a maioria dos casos na
 * borda da API; isto protege o que vier de migração ou de escrita direta.
 */
export function validateSpec(spec: RecurrenceSpec): string | null {
  switch (spec.frequency) {
    case 'monthly':
      if (spec.dayOfMonth == null || spec.dayOfMonth < 1 || spec.dayOfMonth > 31)
        return 'Recorrência mensal exige um dia do mês entre 1 e 31'
      return null
    case 'weekly':
      if (spec.weekday == null || spec.weekday < 0 || spec.weekday > 6)
        return 'Recorrência semanal exige um dia da semana entre 0 e 6'
      return null
    case 'yearly':
      if (spec.monthOfYear == null || spec.monthOfYear < 1 || spec.monthOfYear > 12)
        return 'Recorrência anual exige um mês entre 1 e 12'
      if (spec.dayOfMonth == null || spec.dayOfMonth < 1 || spec.dayOfMonth > 31)
        return 'Recorrência anual exige um dia do mês entre 1 e 31'
      if (spec.dayOfMonth > lastDayOfMonth(2024, spec.monthOfYear))
        return 'Esse dia não existe no mês escolhido'
      return null
  }
}
