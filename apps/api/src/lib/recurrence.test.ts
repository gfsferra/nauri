import { describe, expect, it } from 'vitest'
import { occurrencesBetween, validateSpec, type RecurrenceSpec } from './recurrence.js'

const monthly = (dayOfMonth: number, startOn = '2026-01-01', endOn: string | null = null):
  RecurrenceSpec => ({ frequency: 'monthly', dayOfMonth, weekday: null, monthOfYear: null, startOn, endOn })

const weekly = (weekday: number, startOn = '2026-01-01', endOn: string | null = null):
  RecurrenceSpec => ({ frequency: 'weekly', dayOfMonth: null, weekday, monthOfYear: null, startOn, endOn })

const yearly = (monthOfYear: number, dayOfMonth: number, startOn = '2020-01-01'):
  RecurrenceSpec => ({ frequency: 'yearly', dayOfMonth, weekday: null, monthOfYear, startOn, endOn: null })

describe('recorrência mensal', () => {
  it('gera o salário todo dia 5', () => {
    expect(occurrencesBetween(monthly(5), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
    ])
  })

  it('encaixa "todo dia 31" nos meses que não têm dia 31', () => {
    // Sem o clamp, sete meses do ano simplesmente não gerariam lançamento.
    expect(occurrencesBetween(monthly(31), '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })

  it('acerta fevereiro de ano bissexto', () => {
    expect(occurrencesBetween(monthly(30, '2024-01-01'), '2024-02-01', '2024-02-29')).toEqual(['2024-02-29'])
  })

  it('atravessa a virada do ano', () => {
    expect(occurrencesBetween(monthly(15), '2026-11-01', '2027-02-28')).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ])
  })
})

describe('idempotência — a garantia de não lançar salário duas vezes', () => {
  it('devolve exatamente o mesmo resultado quando chamada de novo', () => {
    const spec = monthly(5)
    const first = occurrencesBetween(spec, '2026-01-01', '2026-12-31')
    const second = occurrencesBetween(spec, '2026-01-01', '2026-12-31')
    expect(second).toEqual(first)
  })

  it('não inventa ocorrência nova ao consultar mês a mês em vez do ano inteiro', () => {
    const spec = monthly(31)
    const wholeYear = occurrencesBetween(spec, '2026-01-01', '2026-12-31')
    const monthByMonth = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0')
      const last = new Date(Date.UTC(2026, i + 1, 0)).getUTCDate()
      return occurrencesBetween(spec, `2026-${m}-01`, `2026-${m}-${last}`)
    }).flat()
    expect(monthByMonth).toEqual(wholeYear)
  })
})

describe('janelas start/end', () => {
  it('não gera nada antes do início', () => {
    expect(occurrencesBetween(monthly(5, '2026-03-01'), '2026-01-01', '2026-04-30')).toEqual([
      '2026-03-05',
      '2026-04-05',
    ])
  })

  it('para no fim configurado', () => {
    expect(
      occurrencesBetween(monthly(5, '2026-01-01', '2026-02-28'), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-05', '2026-02-05'])
  })

  it('devolve vazio quando a janela é anterior ao início', () => {
    expect(occurrencesBetween(monthly(5, '2027-01-01'), '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('devolve vazio quando o intervalo é invertido', () => {
    expect(occurrencesBetween(monthly(5), '2026-12-31', '2026-01-01')).toEqual([])
  })
})

describe('recorrência semanal', () => {
  it('cai sempre no mesmo dia da semana', () => {
    const dates = occurrencesBetween(weekly(1), '2026-01-01', '2026-01-31') // segundas
    expect(dates).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('inclui o próprio dia inicial quando ele já é o dia da semana pedido', () => {
    expect(occurrencesBetween(weekly(6), '2026-08-29', '2026-09-05')).toEqual([
      '2026-08-29',
      '2026-09-05',
    ])
  })
})

describe('recorrência anual', () => {
  it('repete na mesma data todo ano', () => {
    expect(occurrencesBetween(yearly(3, 15), '2026-01-01', '2028-12-31')).toEqual([
      '2026-03-15',
      '2027-03-15',
      '2028-03-15',
    ])
  })

  it('encaixa 29 de fevereiro nos anos não bissextos', () => {
    expect(occurrencesBetween(yearly(2, 29), '2024-01-01', '2027-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
    ])
  })
})

describe('validateSpec', () => {
  it('aceita configurações coerentes', () => {
    expect(validateSpec(monthly(5))).toBeNull()
    expect(validateSpec(weekly(0))).toBeNull()
    expect(validateSpec(yearly(2, 29))).toBeNull()
  })

  it('recusa campos que não combinam com a frequência', () => {
    expect(validateSpec({ ...monthly(5), dayOfMonth: null })).toMatch(/dia do mês/)
    expect(validateSpec({ ...weekly(0), weekday: 9 })).toMatch(/dia da semana/)
    expect(validateSpec({ ...yearly(2, 30), dayOfMonth: 30 })).toMatch(/não existe/)
  })
})
