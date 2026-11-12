import { describe, expect, it } from 'vitest'
import { categoryFromRules, idsMatchingRule, normalizeDescription, ruleKey } from './rule'

describe('normalizeDescription — a mesma loja escrita de jeitos diferentes', () => {
  it('ignora caixa, acento e espaços sobrando', () => {
    expect(normalizeDescription('  PADARIA  SÃO JOÃO ')).toBe('padaria sao joao')
    expect(normalizeDescription('Padaria Sao Joao')).toBe('padaria sao joao')
  })

  it('tira o número da parcela', () => {
    expect(normalizeDescription('LOJA X 2/4')).toBe('loja x')
    expect(normalizeDescription('Loja X 02/10')).toBe('loja x')
    expect(normalizeDescription('Loja X parc 3/12')).toBe('loja x')
    expect(normalizeDescription('Loja X parcela 3 de 12')).toBe('loja x')
  })

  it('mantém números que fazem parte do nome', () => {
    expect(normalizeDescription('Posto 24h')).toBe('posto 24h')
    expect(normalizeDescription('Mercado 2000')).toBe('mercado 2000')
  })

  it('descrição vazia continua vazia', () => {
    expect(normalizeDescription('   ')).toBe('')
  })
})

describe('categoryFromRules', () => {
  const rules = new Map([
    [ruleKey('expense', 'padaria sao joao'), 'cat-padaria'],
    [ruleKey('income', 'pix recebido ana'), 'cat-reembolso'],
  ])

  it('acha a regra pela descrição normalizada', () => {
    expect(categoryFromRules(rules, 'expense', 'PADARIA SÃO JOÃO')).toBe('cat-padaria')
  })

  it('não cruza gasto com receita', () => {
    expect(categoryFromRules(rules, 'income', 'Padaria São João')).toBeNull()
    expect(categoryFromRules(rules, 'expense', 'Pix recebido Ana')).toBeNull()
  })

  it('sem regra, ou sem descrição, devolve null', () => {
    expect(categoryFromRules(rules, 'expense', 'Farmácia')).toBeNull()
    expect(categoryFromRules(rules, 'expense', '')).toBeNull()
  })
})

describe('idsMatchingRule — o que a regra nova troca no histórico', () => {
  const rows = [
    { id: 'a', description: 'PADARIA SÃO JOÃO', categoryId: 'outros' },
    { id: 'b', description: 'Padaria Sao Joao 2/3', categoryId: 'outros' },
    { id: 'c', description: 'Padaria São João', categoryId: 'padaria' },
    { id: 'd', description: 'Padaria Central', categoryId: 'outros' },
  ]

  it('pega as variações da mesma descrição que ainda estão em outra categoria', () => {
    expect(idsMatchingRule(rows, 'padaria sao joao', 'padaria')).toEqual(['a', 'b'])
  })

  it('padrão vazio não alcança nada', () => {
    expect(idsMatchingRule(rows, '', 'padaria')).toEqual([])
  })
})
