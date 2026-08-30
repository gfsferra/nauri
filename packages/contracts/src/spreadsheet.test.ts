import { describe, expect, it } from 'vitest'
import { buildRowsFromSheet, guessColumns, type SheetMapping } from './spreadsheet'

/** O layout descrito: gastos e ganhos lado a lado, na mesma linha. */
const mapping: SheetMapping = {
  expense: {
    date: 'Data',
    amount: 'Valor',
    description: 'Descrição',
    category: 'Categoria',
    fallbackCategory: 'Outros',
  },
  income: {
    date: 'Data Ganho',
    amount: 'Valor Ganho',
    description: 'Descrição Ganho',
    category: 'Categoria Ganho',
    fallbackCategory: 'Outras receitas',
  },
}

describe('buildRowsFromSheet — as duas colunas da planilha', () => {
  it('extrai gasto e ganho da mesma linha', () => {
    const { rows, errors } = buildRowsFromSheet(
      [
        {
          Data: '05/03/2026',
          Valor: '1.234,56',
          'Descrição': 'Feira',
          Categoria: 'Mercado',
          'Data Ganho': '05/03/2026',
          'Valor Ganho': '7.500,00',
          'Descrição Ganho': 'Salário março',
          'Categoria Ganho': 'Salário',
        },
      ],
      mapping,
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        kind: 'expense',
        occurredOn: '2026-03-05',
        amountCents: 123456,
        description: 'Feira',
        categoryName: 'Mercado',
      },
      {
        kind: 'income',
        occurredOn: '2026-03-05',
        amountCents: 750000,
        description: 'Salário março',
        categoryName: 'Salário',
      },
    ])
  })

  it('ignora o bloco vazio quando a linha só tem gasto', () => {
    const { rows, errors, emptyRows } = buildRowsFromSheet(
      [
        {
          Data: '10/03/2026',
          Valor: '50,00',
          'Descrição': 'Ônibus',
          Categoria: 'Transporte',
          'Data Ganho': '',
          'Valor Ganho': '',
          'Descrição Ganho': '',
          'Categoria Ganho': '',
        },
      ],
      mapping,
    )

    expect(errors).toEqual([])
    expect(emptyRows).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe('expense')
  })

  it('guarda gasto lançado como negativo em valor positivo', () => {
    // O sinal já está no `kind`; guardar negativo faria a soma do mês dobrar o erro.
    const { rows } = buildRowsFromSheet(
      [{ Data: '01/03/2026', Valor: '-89,90', 'Descrição': 'Assinatura', Categoria: 'Lazer' }],
      { expense: mapping.expense },
    )
    expect(rows[0]!.amountCents).toBe(8990)
  })

  it('usa a categoria padrão quando a célula está em branco', () => {
    const { rows } = buildRowsFromSheet(
      [{ Data: '01/03/2026', Valor: '20,00', 'Descrição': '', Categoria: '' }],
      { expense: mapping.expense },
    )
    expect(rows[0]!.categoryName).toBe('Outros')
  })
})

describe('buildRowsFromSheet — linhas ruins não derrubam a importação', () => {
  it('reporta o erro e segue com o resto', () => {
    // Abortar anos de histórico por uma célula digitada errada em 2019 seria
    // o pior comportamento possível.
    const { rows, errors } = buildRowsFromSheet(
      [
        { Data: '01/03/2026', Valor: '10,00', 'Descrição': 'ok', Categoria: 'Mercado' },
        { Data: '31/02/2026', Valor: '20,00', 'Descrição': 'data inválida', Categoria: 'Mercado' },
        { Data: '03/03/2026', Valor: 'abc', 'Descrição': 'valor inválido', Categoria: 'Mercado' },
        { Data: '04/03/2026', Valor: '40,00', 'Descrição': 'ok também', Categoria: 'Mercado' },
      ],
      { expense: mapping.expense },
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.amountCents)).toEqual([1000, 4000])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatchObject({ line: 3, column: 'Data', value: '31/02/2026' })
    expect(errors[1]).toMatchObject({ line: 4, column: 'Valor', value: 'abc' })
  })

  it('rejeita valor zerado em vez de gravar lançamento vazio', () => {
    const { rows, errors } = buildRowsFromSheet(
      [{ Data: '01/03/2026', Valor: '0,00', 'Descrição': '', Categoria: '' }],
      { expense: mapping.expense },
    )
    expect(rows).toHaveLength(0)
    expect(errors[0]!.reason).toMatch(/zerado/)
  })

  it('aponta a linha como o usuário a vê na planilha', () => {
    // Linha 1 é o cabeçalho, então o primeiro registro é a linha 2.
    const { errors } = buildRowsFromSheet(
      [{ Data: 'ontem', Valor: '10,00', 'Descrição': '', Categoria: '' }],
      { expense: mapping.expense },
    )
    expect(errors[0]!.line).toBe(2)
  })
})

describe('buildRowsFromSheet — formatos ambíguos', () => {
  it('respeita o locale forçado no preview', () => {
    const raw = [{ Data: '01/03/2026', Valor: '1.234', 'Descrição': '', Categoria: '' }]
    expect(buildRowsFromSheet(raw, { expense: mapping.expense }).rows[0]!.amountCents).toBe(123400)
    expect(
      buildRowsFromSheet(raw, { expense: mapping.expense }, { locale: 'en-US' }).rows[0]!
        .amountCents,
    ).toBe(123)
  })

  it('respeita a ordem de data forçada', () => {
    const raw = [{ Data: '03/04/2026', Valor: '10,00', 'Descrição': '', Categoria: '' }]
    expect(buildRowsFromSheet(raw, { expense: mapping.expense }).rows[0]!.occurredOn).toBe('2026-04-03')
    expect(
      buildRowsFromSheet(raw, { expense: mapping.expense }, { dayOrder: 'mdy' }).rows[0]!.occurredOn,
    ).toBe('2026-03-04')
  })
})

describe('guessColumns', () => {
  it('reconhece cabeçalhos comuns em português', () => {
    expect(guessColumns(['Data', 'Valor', 'Descrição', 'Categoria'])).toEqual({
      date: 'Data',
      amount: 'Valor',
      description: 'Descrição',
      category: 'Categoria',
    })
  })

  it('tolera variações de caixa e acento', () => {
    const guess = guessColumns(['DATA DO GASTO', 'R$', 'Histórico', 'Tipo de gasto'])
    expect(guess.date).toBe('DATA DO GASTO')
    expect(guess.amount).toBe('R$')
    expect(guess.description).toBe('Histórico')
  })

  it('devolve indefinido para o que não reconhece, em vez de chutar', () => {
    expect(guessColumns(['col1', 'col2']).date).toBeUndefined()
  })
})
