/**
 * Datas de calendário (AAAA-MM-DD), sem hora e sem fuso.
 *
 * Toda a aritmética roda em UTC puro. Isso não é descuido com o fuso: é o
 * contrário. Um lançamento "do dia 5" é uma data no calendário, não um
 * instante; fazer as contas em UTC garante que o resultado não dependa do fuso
 * da máquina que rodou o código — um Worker em UTC e o seu laptop chegam à
 * mesma resposta. O fuso só entra em UM lugar: descobrir que dia é "hoje"
 * para o usuário.
 */

import type { IsoDate, Month } from './primitives'

export const TIMEZONE = 'America/Sao_Paulo'

export type DateParseResult =
  | { ok: true; date: IsoDate }
  | { ok: false; error: string }

const pad = (n: number, size = 2) => String(n).padStart(size, '0')

export function makeIso(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

export function parseIsoParts(iso: IsoDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Data inválida: "${iso}"`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/**
 * "Hoje" segundo o relógio de São Paulo, não o do servidor.
 *
 * O locale en-CA já formata como AAAA-MM-DD, então não há remontagem manual —
 * e às 21h de São Paulo isto devolve o dia corrente, não o seguinte, que é o
 * bug que apareceria usando `new Date().toISOString()` num Worker em UTC.
 */
export function todayInTimezone(now: Date = new Date(), timeZone = TIMEZONE): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function currentMonth(now: Date = new Date(), timeZone = TIMEZONE): Month {
  return todayInTimezone(now, timeZone).slice(0, 7)
}

export function toMonth(iso: IsoDate): Month {
  return iso.slice(0, 7)
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = parseIsoParts(value)
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month)
}

/** Fevereiro de ano bissexto incluso — a regra dos 400 anos está no próprio Date. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Encaixa um dia no mês: "todo dia 31" em fevereiro vira o dia 28 (ou 29).
 * Sem isso, uma previsão para o dia 31 sumiria em sete meses do ano.
 */
export function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month))
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoParts(iso)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return makeIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addMonthsToMonth(month: Month, delta: number): Month {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + delta
  return `${pad(Math.floor(total / 12), 4)}-${pad((total % 12) + 1)}`
}

/** Primeiro e último dia do mês, prontos para um BETWEEN em SQL. */
export function monthBounds(month: Month): { from: IsoDate; to: IsoDate } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return { from: `${pad(y, 4)}-${pad(m)}-01`, to: makeIso(y, m, lastDayOfMonth(y, m)) }
}

/** 0 = domingo … 6 = sábado */
export function weekdayOf(iso: IsoDate): number {
  const { year, month, day } = parseIsoParts(iso)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export type DayOrder = 'auto' | 'dmy' | 'mdy'

/**
 * Lê as datas que aparecem numa planilha exportada.
 *
 * Aceita AAAA-MM-DD, dd/mm/aaaa, dd-mm-aaaa e dd.mm.aaaa, com ano de 2 ou 4
 * dígitos. Em `auto`, um número acima de 12 denuncia qual campo é o dia; quando
 * os dois são ambíguos ("03/04/2026") assume dd/mm, que é a convenção
 * brasileira — e a tela de importação deixa corrigir no preview.
 */
export function safeParseDateToIso(raw: string, order: DayOrder = 'auto'): DateParseResult {
  const s = String(raw ?? '').trim()
  if (s === '') return { ok: false, error: 'Data vazia' }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return finish(year, month, day, s)
  }

  const parts = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s)
  if (!parts) return { ok: false, error: `Data não reconhecida: "${raw}"` }

  const a = Number(parts[1])
  const b = Number(parts[2])
  let year = Number(parts[3])
  if (parts[3]!.length === 2) year += year >= 70 ? 1900 : 2000

  let day: number
  let month: number
  if (order === 'mdy') [month, day] = [a, b]
  else if (order === 'dmy') [day, month] = [a, b]
  else if (a > 12) [day, month] = [a, b]
  else if (b > 12) [month, day] = [a, b]
  else [day, month] = [a, b] // empate: convenção brasileira

  return finish(year, month, day, s)
}

function finish(year: number, month: number, day: number, raw: string): DateParseResult {
  if (month < 1 || month > 12) return { ok: false, error: `Mês inválido em "${raw}"` }
  if (day < 1 || day > lastDayOfMonth(year, month)) {
    return { ok: false, error: `Dia inválido em "${raw}"` }
  }
  return { ok: true, date: makeIso(year, month, day) }
}
