/**
 * Dinheiro, sempre em centavos inteiros.
 *
 * Nada aqui usa ponto flutuante: `0.1 + 0.2 === 0.30000000000000004`, e num
 * extrato de milhares de linhas esse resíduo vira centavo visível no total do
 * ano. O parsing arredonda em espaço de string, dígito a dígito, justamente
 * para nunca passar por um `Number` fracionário.
 */

export type MoneyLocale = 'auto' | 'pt-BR' | 'en-US'

export type ParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string }

const MAX_CENTS = 1_000_000_000_000

/**
 * Converte texto em centavos.
 *
 * `pt-BR` usa "." para milhar e "," para decimal; `en-US`, o contrário. Em
 * `auto`, quando os dois separadores aparecem o ÚLTIMO é o decimal — regra que
 * resolve "1.234,56" e "1,234.56" sem ambiguidade.
 *
 * Sobra um caso genuinamente ambíguo: um separador só, com exatamente três
 * dígitos depois ("1.234"). Aqui isso é lido como milhar, que é a leitura certa
 * numa planilha brasileira. Como a heurística pode errar, a tela de importação
 * mostra o preview e deixa forçar o locale.
 */
export function safeParseAmountToCents(
  raw: string,
  locale: MoneyLocale = 'auto',
): ParseResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Valor não é texto' }

  // Remove símbolo de moeda, espaços (inclusive NBSP e narrow NBSP) e o sinal.
  let s = raw.replace(/[\s  ]/g, '').replace(/R\$|BRL|US\$|USD|\$/gi, '')
  if (s === '') return { ok: false, error: 'Valor vazio' }

  // Negativo por sinal ou por parênteses contábeis: (1.234,56)
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  if (!/^[\d.,]+$/.test(s)) {
    return { ok: false, error: `Valor inválido: "${raw}"` }
  }

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  let decimalSep: '.' | ',' | null = null
  if (locale === 'pt-BR') {
    decimalSep = lastComma >= 0 ? ',' : null
  } else if (locale === 'en-US') {
    decimalSep = lastDot >= 0 ? '.' : null
  } else if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma >= 0) {
    decimalSep = ','
  } else if (lastDot >= 0) {
    // Separador único: 3 dígitos depois = milhar; 1 ou 2 = decimal.
    const after = s.length - lastDot - 1
    const onlyOne = s.indexOf('.') === lastDot
    decimalSep = onlyOne && after !== 3 ? '.' : null
  }

  let intPart: string
  let fracPart: string
  if (decimalSep === null) {
    intPart = s.replace(/[.,]/g, '')
    fracPart = ''
  } else {
    const cut = s.lastIndexOf(decimalSep)
    intPart = s.slice(0, cut).replace(/[.,]/g, '')
    fracPart = s.slice(cut + 1).replace(/[.,]/g, '')
  }

  if (intPart === '' && fracPart === '') {
    return { ok: false, error: `Valor inválido: "${raw}"` }
  }
  if (intPart === '') intPart = '0'

  // Arredondamento em string: nenhum float envolvido.
  let roundUp = false
  let frac2: string
  if (fracPart.length > 2) {
    roundUp = fracPart.charCodeAt(2) >= 53 // '5'
    frac2 = fracPart.slice(0, 2)
  } else {
    frac2 = fracPart.padEnd(2, '0')
  }

  const digits = (intPart + frac2).replace(/^0+(?=\d)/, '')
  if (digits.length > 15) return { ok: false, error: 'Valor acima do limite suportado' }

  let cents = Number(digits)
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: 'Valor acima do limite suportado' }
  }
  if (roundUp) cents += 1
  if (cents > MAX_CENTS) return { ok: false, error: 'Valor acima do limite suportado' }

  return { ok: true, cents: negative ? -cents : cents }
}

export function parseAmountToCents(raw: string, locale: MoneyLocale = 'auto'): number {
  const result = safeParseAmountToCents(raw, locale)
  if (!result.ok) throw new Error(result.error)
  return result.cents
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 123456 → "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

/** 123456 → "1234.56" — formato neutro para exportação em CSV. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents).toString().padStart(3, '0')
  const out = `${abs.slice(0, -2)}.${abs.slice(-2)}`
  return negative ? `-${out}` : out
}
