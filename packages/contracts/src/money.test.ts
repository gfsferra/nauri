import { describe, expect, it } from 'vitest'
import {
  centsToDecimalString,
  formatBRL,
  parseAmountToCents,
  safeParseAmountToCents,
} from './money'

describe('parseAmountToCents — formato brasileiro', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['R$1.234,56', 123456],
    ['0,01', 1],
    ['0,10', 10],
    [',5', 50],
    ['1.234.567,89', 123456789],
    ['1234', 123400],
    ['12,3', 1230],
  ])('lê %s como %i centavos', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it('aceita espaço não separável, que o Excel costuma inserir', () => {
    expect(parseAmountToCents('R$ 1.234,56')).toBe(123456)
    expect(parseAmountToCents('1 234,56')).toBe(123456)
  })
})

describe('parseAmountToCents — negativos', () => {
  it.each([
    ['-1.234,56', -123456],
    ['(1.234,56)', -123456],
    ['-R$ 50,00', -5000],
  ])('lê %s como %i', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })
})

describe('parseAmountToCents — separador único e ambíguo', () => {
  it('trata "1.234" como milhar: é a leitura certa numa planilha brasileira', () => {
    expect(parseAmountToCents('1.234')).toBe(123400)
  })

  it('trata "1.23" como decimal: dois dígitos não formam grupo de milhar', () => {
    expect(parseAmountToCents('1.23')).toBe(123)
  })

  it('usa o ÚLTIMO separador como decimal quando os dois aparecem', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456) // pt-BR
    expect(parseAmountToCents('1,234.56')).toBe(123456) // en-US
  })

  it('respeita o locale forçado no preview da importação', () => {
    expect(parseAmountToCents('1.234', 'pt-BR')).toBe(123400)
    expect(parseAmountToCents('1.234', 'en-US')).toBe(123)
  })
})

describe('parseAmountToCents — arredondamento sem float', () => {
  it('arredonda o terceiro decimal para cima a partir de 5', () => {
    expect(parseAmountToCents('1,005')).toBe(101)
    expect(parseAmountToCents('1,004')).toBe(100)
    expect(parseAmountToCents('1,999')).toBe(200)
  })

  it('não acumula resíduo somando mil parcelas de sete centavos', () => {
    // Com float, 1000 * 0.07 dá 70.00000000000001 e o total do ano vaza centavo.
    const total = Array.from({ length: 1000 }, () => parseAmountToCents('0,07')).reduce(
      (a, b) => a + b,
      0,
    )
    expect(total).toBe(7000)
  })

  it('mantém exatidão no caso canônico 0,1 + 0,2', () => {
    expect(parseAmountToCents('0,1') + parseAmountToCents('0,2')).toBe(30)
  })
})

describe('safeParseAmountToCents — entradas inválidas', () => {
  it.each(['', '   ', 'abc', 'R$', '12a3', '--5'])('rejeita %j', (input) => {
    expect(safeParseAmountToCents(input).ok).toBe(false)
  })

  it('rejeita valor acima do teto suportado', () => {
    expect(safeParseAmountToCents('99999999999999999,00').ok).toBe(false)
  })

  it('devolve motivo legível em vez de lançar', () => {
    const result = safeParseAmountToCents('abc')
    expect(result).toEqual({ ok: false, error: expect.stringContaining('abc') })
  })
})

describe('formatação', () => {
  it('formata centavos como moeda brasileira', () => {
    // O Intl usa espaço não separável depois do "R$".
    expect(formatBRL(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatBRL(5).replace(/ /g, ' ')).toBe('R$ 0,05')
    expect(formatBRL(-5000).replace(/ /g, ' ')).toBe('-R$ 50,00')
  })

  it('exporta em formato neutro para CSV', () => {
    expect(centsToDecimalString(123456)).toBe('1234.56')
    expect(centsToDecimalString(5)).toBe('0.05')
    expect(centsToDecimalString(0)).toBe('0.00')
    expect(centsToDecimalString(-5)).toBe('-0.05')
  })

  it('faz a volta completa texto → centavos → texto', () => {
    for (const original of ['1.234,56', '0,01', '999,99', '1.000.000,00']) {
      const cents = parseAmountToCents(original)
      expect(formatBRL(cents).replace(/ /g, ' ')).toBe(`R$ ${original}`)
    }
  })
})
