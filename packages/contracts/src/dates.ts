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
