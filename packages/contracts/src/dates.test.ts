import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonthsToMonth,
  clampDayToMonth,
  currentMonth,
  isValidIsoDate,
  lastDayOfMonth,
  monthBounds,
  safeParseDateToIso,
  todayInTimezone,
  weekdayOf,
} from './dates'

describe('todayInTimezone — o fuso importa exatamente aqui', () => {
  it('devolve o dia de São Paulo, não o do servidor em UTC', () => {
    // 02:30 UTC do dia 16 ainda é 23:30 do dia 15 em São Paulo (UTC-3).
    // Com `new Date().toISOString()` num Worker, este gasto iria para o dia 16
    // e o fechamento do mês sairia errado.
    expect(todayInTimezone(new Date('2026-03-16T02:30:00Z'))).toBe('2026-03-15')
  })

  it('não vira o dia cedo demais', () => {
    expect(todayInTimezone(new Date('2026-03-15T23:30:00Z'))).toBe('2026-03-15')
    expect(todayInTimezone(new Date('2026-03-16T03:30:00Z'))).toBe('2026-03-16')
  })

  it('mantém a compra da virada do ano em dezembro', () => {
    // O caso mais caro: 23:00 de 31/12 em São Paulo já é 02:00 de 01/01 em UTC.
    expect(todayInTimezone(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31')
    expect(currentMonth(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12')
  })
})

describe('limites de mês', () => {
  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2024, 2, 29], // bissexto
    [2000, 2, 29], // divisível por 400
    [1900, 2, 28], // divisível por 100, não por 400
    [2026, 4, 30],
  ])('último dia de %i-%i é %i', (year, month, expected) => {
    expect(lastDayOfMonth(year, month)).toBe(expected)
  })

  it('encaixa o dia 31 em meses curtos', () => {
    expect(clampDayToMonth(2026, 2, 31)).toBe(28)
    expect(clampDayToMonth(2024, 2, 31)).toBe(29)
    expect(clampDayToMonth(2026, 4, 31)).toBe(30)
    expect(clampDayToMonth(2026, 1, 31)).toBe(31)
  })

  it('entrega o intervalo pronto para um BETWEEN em SQL', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('aritmética de calendário', () => {
  it('atravessa a virada do ano', () => {
    expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01')
    expect(addMonthsToMonth('2026-01', -1)).toBe('2025-12')
    expect(addMonthsToMonth('2026-06', 12)).toBe('2027-06')
    expect(addMonthsToMonth('2026-06', -18)).toBe('2024-12')
  })

  it('soma dias atravessando mês, ano e fevereiro bissexto', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('identifica o dia da semana', () => {
    expect(weekdayOf('2026-08-29')).toBe(6) // sábado
    expect(weekdayOf('2026-01-05')).toBe(1) // segunda
  })

  it('rejeita datas que não existem', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('29/08/2026')).toBe(false)
  })
})

describe('safeParseDateToIso — leitura da planilha', () => {
  it.each([
    ['05/03/2026', '2026-03-05'],
    ['5/3/2026', '2026-03-05'],
    ['05-03-2026', '2026-03-05'],
    ['05.03.2026', '2026-03-05'],
    ['2026-03-05', '2026-03-05'],
    ['31/12/2026', '2026-12-31'],
  ])('lê %s como %s', (input, expected) => {
    expect(safeParseDateToIso(input)).toEqual({ ok: true, date: expected })
  })

  it('desempata pelo número que só pode ser dia', () => {
    expect(safeParseDateToIso('13/03/2026')).toEqual({ ok: true, date: '2026-03-13' })
    expect(safeParseDateToIso('03/13/2026')).toEqual({ ok: true, date: '2026-03-13' })
  })

  it('na dúvida assume dd/mm, a convenção brasileira', () => {
    expect(safeParseDateToIso('03/04/2026')).toEqual({ ok: true, date: '2026-04-03' })
    expect(safeParseDateToIso('03/04/2026', 'mdy')).toEqual({ ok: true, date: '2026-03-04' })
  })

  it('completa o século em anos de dois dígitos', () => {
    expect(safeParseDateToIso('05/03/26')).toEqual({ ok: true, date: '2026-03-05' })
    expect(safeParseDateToIso('05/03/99')).toEqual({ ok: true, date: '1999-03-05' })
  })

  it.each(['', '31/02/2026', '32/01/2026', '00/01/2026', 'ontem', '2026-02-30'])(
    'rejeita %j',
    (input) => {
      expect(safeParseDateToIso(input).ok).toBe(false)
    },
  )
})
