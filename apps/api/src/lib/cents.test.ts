import { describe, expect, it } from 'vitest'
import { toCents } from './cents.js'

describe('toCents', () => {
  it('converte a string que o driver devolve para SUM(bigint)', () => {
    expect(toCents('123456')).toBe(123456)
    expect(toCents(123456)).toBe(123456)
  })

  it('trata soma sem linhas como zero', () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
  })

  it('evita a concatenação silenciosa que motivou esta função', () => {
    // Sem conversão: '100' + '200' === '100200'
    expect(toCents('100') + toCents('200')).toBe(300)
  })

  it('recusa valores que não são inteiros seguros em vez de arredondar calado', () => {
    expect(() => toCents('9007199254740993')).toThrow(/inteiro seguro/)
    expect(() => toCents('abc')).toThrow(/não numérico/)
  })
})
