import {
  averageCostCents,
  dateOf,
  displayName,
  groupOf,
  issuerLabel,
  mapInvestment,
  mapMovement,
  monthlyFlows,
  planMovementFetches,
  portfolioSummary,
  rateLabel,
  signedCents,
  type PluggyInvestment,
  type PluggyInvestmentTransaction,
} from './investments.js'

const NU = 'NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO'

function inv(over: Partial<PluggyInvestment>): PluggyInvestment {
  return {
    id: 'inv-1',
    name: `CDB - ${NU}`,
    code: null,
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    balance: 0,
    amount: 0,
    amountOriginal: null,
    quantity: null,
    date: '2026-11-11T00:00:00.000Z',
    dueDate: null,
    purchaseDate: null,
    issuer: NU,
    rate: null,
    rateType: null,
    fixedAnnualRate: null,
    status: 'ACTIVE',
    ...over,
  }
}

function mov(over: Partial<PluggyInvestmentTransaction>): PluggyInvestmentTransaction {
  return { id: 'm', type: 'BUY', amount: 0, netAmount: null, quantity: null, date: '2026-01-01T00:00:00.000Z', ...over }
}

describe('dateOf', () => {
  it('fica com o dia escrito, sem converter de fuso', () => {
    // Meia-noite UTC em São Paulo seria o dia anterior: o dia é o do texto.
    expect(dateOf('2026-02-25T00:00:00.000Z')).toBe('2026-02-25')
    expect(dateOf('2028-02-25T03:00:00.000Z')).toBe('2028-02-25')
    expect(dateOf(null)).toBeNull()
    expect(dateOf('lixo')).toBeNull()
  })
})

describe('signedCents', () => {
  it('converte reais com sinal sem erro de ponto flutuante', () => {
    expect(signedCents(1234.56)).toBe(123456)
    expect(signedCents(0.1 + 0.2)).toBe(30)
    expect(signedCents(-12.34)).toBe(-1234)
    expect(signedCents(0)).toBe(0)
  })
})

describe('averageCostCents', () => {
  it('ETF: uma compra explica a posição inteira', () => {
    const m = [mov({ type: 'BUY', amount: 412.8, quantity: 4 })]
    expect(averageCostCents(m, 4)).toBe(41280)
  })

  it('venda tira a fatia proporcional do custo', () => {
    const m = [
      mov({ type: 'BUY', amount: 100, quantity: 10, date: '2026-01-01T00:00:00Z' }),
      mov({ type: 'BUY', amount: 300, quantity: 10, date: '2026-02-01T00:00:00Z' }),
      mov({ type: 'SELL', amount: 250, quantity: 5, date: '2026-03-01T00:00:00Z' }),
    ]
    // Preço médio 20,00 por cota; sobram 15 cotas = 300,00.
    expect(averageCostCents(m, 15)).toBe(30000)
  })

  it('proventos não mexem no custo', () => {
    const m = [
      mov({ type: 'BUY', amount: 250.5, quantity: 25 }),
      mov({ type: 'INTEREST', amount: 3.1, quantity: null, date: '2026-05-15T00:00:00Z' }),
    ]
    expect(averageCostCents(m, 25)).toBe(25050)
  })

  it('custo desconhecido quando a compra é anterior ao histórico', () => {
    expect(averageCostCents([mov({ type: 'BUY', amount: 100, quantity: 2 })], 4)).toBeNull()
    expect(averageCostCents([], 4)).toBeNull()
    expect(averageCostCents([mov({ type: 'SELL', amount: 100, quantity: 2 })], 2)).toBeNull()
  })
})

describe('mapInvestment', () => {
  it('CDB ativo: líquido, bruto e custo em centavos', () => {
    const m = mapInvestment(
      inv({
        balance: 1234.56,
        amount: 1260.1,
        amountOriginal: 1100.004951,
        dueDate: '2028-02-25T03:00:00.000Z',
        purchaseDate: '2026-02-25T03:00:00.000Z',
        rate: 120,
        rateType: 'CDI',
      }),
      null,
    )
    expect(m).toMatchObject({
      balanceCents: 123456,
      grossCents: 126010,
      // O custo sai com duas casas: 1100,004951 vira 1100,00.
      costCents: 110000,
      dueOn: '2028-02-25',
      purchaseOn: '2026-02-25',
      positionOn: '2026-11-11',
    })
  })

  it('ETF sem custo informado usa o preço médio das movimentações', () => {
    const m = mapInvestment(
      inv({ type: 'ETF', subtype: 'ETF', code: 'IVVB11', balance: 398.4, amount: 398.4, quantity: 4 }),
      [mov({ type: 'BUY', amount: 412.8, quantity: 4 })],
    )
    expect(m.costCents).toBe(41280)
  })

  it('posição resgatada não tem custo', () => {
    const m = mapInvestment(inv({ status: 'TOTAL_WITHDRAWAL', amountOriginal: 100 }), null)
    expect(m.costCents).toBeNull()
    expect(m.balanceCents).toBe(0)
  })
})

describe('mapMovement', () => {
  it('guarda bruto e líquido; o dia é o do texto', () => {
    expect(
      mapMovement(mov({ id: 'x', type: 'SELL', amount: 120.4, netAmount: 120.1, date: '2026-02-28T00:00:00.000Z' })),
    ).toEqual({ externalId: 'x', type: 'SELL', occurredOn: '2026-02-28', amountCents: 12040, netAmountCents: 12010 })
  })

  it('sem data válida não entra', () => {
    expect(mapMovement(mov({ date: '' }))).toBeNull()
  })
})

describe('rótulos', () => {
  it('nome curto', () => {
    expect(displayName({ type: 'FIXED_INCOME', subtype: 'CDB', name: `CDB - ${NU}`, code: null, issuer: NU })).toBe(
      'CDB Nubank',
    )
    expect(displayName({ type: 'ETF', subtype: 'ETF', name: 'IVVB11', code: 'IVVB11', issuer: 'ISHARES' })).toBe('IVVB11')
    expect(
      displayName({ type: 'FIXED_INCOME', subtype: 'TREASURY', name: 'Tesouro IPCA+ 2035', code: null, issuer: null }),
    ).toBe('Tesouro IPCA+ 2035')
  })

  it('emissor', () => {
    expect(issuerLabel(NU)).toBe('Nubank')
    expect(issuerLabel('ITAU UNIBANCO S.A.')).toBe('Itaú')
    expect(issuerLabel('BANCO INTER S.A. - QUALQUER COISA')).toBe('Banco Inter')
    expect(issuerLabel(null)).toBeNull()
  })

  it('taxa', () => {
    expect(rateLabel({ rate: 120, rateType: 'CDI', fixedAnnualRate: null })).toBe('120% do CDI')
    expect(rateLabel({ rate: 102.5, rateType: 'CDI', fixedAnnualRate: null })).toBe('102,5% do CDI')
    expect(rateLabel({ rate: 100, rateType: 'SELIC', fixedAnnualRate: null })).toBe('100% da Selic')
    expect(rateLabel({ rate: null, rateType: 'IPCA', fixedAnnualRate: 6.1 })).toBe('IPCA + 6,1% a.a.')
    expect(rateLabel({ rate: null, rateType: 'PRE', fixedAnnualRate: 12.5 })).toBe('12,5% a.a.')
    expect(rateLabel({ rate: null, rateType: null, fixedAnnualRate: null })).toBeNull()
  })

  it('grupo', () => {
    expect(groupOf('FIXED_INCOME', 'CDB')).toBe('fixed_income')
    expect(groupOf('EQUITY', 'REAL_ESTATE_FUND')).toBe('reits')
    expect(groupOf('EQUITY', 'STOCK')).toBe('stocks')
    expect(groupOf('ETF', 'ETF')).toBe('etf')
    expect(groupOf('COE', null)).toBe('other')
  })
})

describe('monthlyFlows', () => {
  const movements = [
    { type: 'BUY', occurredOn: '2026-10-05', amountCents: 100000, netAmountCents: 100000 },
    { type: 'BUY', occurredOn: '2026-11-02', amountCents: 50000, netAmountCents: 50000 },
    // Resgate conta pelo que voltou para a conta, já sem IR e IOF.
    { type: 'SELL', occurredOn: '2026-11-08', amountCents: 12040, netAmountCents: 12010 },
    // Provento não é decisão de guardar.
    { type: 'INTEREST', occurredOn: '2026-11-15', amountCents: 1090, netAmountCents: 1090 },
    // Fora da janela.
    { type: 'BUY', occurredOn: '2025-01-01', amountCents: 999, netAmountCents: 999 },
  ]

  it('aportes menos resgates, mês a mês, com os meses vazios', () => {
    expect(monthlyFlows(movements, '2026-11', 3)).toEqual([
      { month: '2026-09', contributionsCents: 0, withdrawalsCents: 0, savedCents: 0 },
      { month: '2026-10', contributionsCents: 100000, withdrawalsCents: 0, savedCents: 100000 },
      { month: '2026-11', contributionsCents: 50000, withdrawalsCents: 12010, savedCents: 37990 },
    ])
  })

  it('a janela atravessa a virada do ano', () => {
    expect(monthlyFlows([], '2026-01', 2).map((f) => f.month)).toEqual(['2025-12', '2026-01'])
  })
})

describe('portfolioSummary', () => {
  const base = {
    subtype: 'CDB',
    name: 'CDB',
    code: null,
    issuer: NU,
    quantity: null,
    rate: 120,
    rateType: 'CDI',
    fixedAnnualRate: null,
    dueOn: '2028-02-25',
  }
  const rows = [
    { ...base, externalId: 'a', type: 'FIXED_INCOME', status: 'ACTIVE', balanceCents: 123456, grossCents: 126010, costCents: 110000 },
    { ...base, externalId: 'b', type: 'ETF', subtype: 'ETF', code: 'IVVB11', quantity: 4, status: 'ACTIVE', balanceCents: 39840, grossCents: 39840, costCents: 41280 },
    // Sem custo conhecido: entra no total, fica fora do rendimento.
    { ...base, externalId: 'c', type: 'FIXED_INCOME', status: 'ACTIVE', balanceCents: 10000, grossCents: 10000, costCents: null },
    { ...base, externalId: 'd', type: 'EQUITY', subtype: 'REAL_ESTATE_FUND', status: 'TOTAL_WITHDRAWAL', balanceCents: 0, grossCents: 0, costCents: null },
  ]

  it('soma o líquido, separa os impostos e calcula o rendimento só com custo conhecido', () => {
    const s = portfolioSummary(rows)
    expect(s.totalCents).toBe(123456 + 39840 + 10000)
    expect(s.grossCents).toBe(126010 + 39840 + 10000)
    expect(s.taxesCents).toBe(126010 - 123456)
    expect(s.costCents).toBe(110000 + 41280)
    expect(s.profitCents).toBe(123456 - 110000 + (39840 - 41280))
    expect(s.profitPercent).toBeCloseTo(((13456 - 1440) / 151280) * 100, 6)
    expect(s.unknownCostCount).toBe(1)
    expect(s.closedCount).toBe(1)
  })

  it('divide por tipo e ordena as posições pelo valor', () => {
    const s = portfolioSummary(rows)
    expect(s.groups).toEqual([
      { group: 'fixed_income', label: 'Renda fixa', totalCents: 133456 },
      { group: 'etf', label: 'ETFs', totalCents: 39840 },
    ])
    expect(s.positions.map((p) => [p.name, p.rate, p.profitCents])).toEqual([
      ['CDB Nubank', '120% do CDI', 13456],
      ['IVVB11', '120% do CDI', -1440],
      ['CDB Nubank', '120% do CDI', null],
    ])
    expect(s.positions[1]!.quantity).toBe(4)
  })

  it('carteira vazia', () => {
    const s = portfolioSummary([])
    expect(s).toMatchObject({ totalCents: 0, profitCents: 0, profitPercent: null, groups: [], positions: [] })
  })
})

describe('planMovementFetches', () => {
  const active = (id: string) => ({ id, status: 'ACTIVE', balance: 100 })
  const closed = (id: string) => ({ id, status: 'TOTAL_WITHDRAWAL', balance: 0 })

  it('resgatado sem mudança não é relido; ativo sempre é', () => {
    const stored = new Map([
      ['a', { status: 'ACTIVE' }],
      ['c', { status: 'TOTAL_WITHDRAWAL' }],
    ])
    const r = planMovementFetches([active('a'), closed('c')], stored, 20)
    expect(r.toFetch.map((i) => i.id)).toEqual(['a'])
    expect(r.complete).toBe(true)
  })

  it('novos e recém-resgatados vêm antes dos ativos', () => {
    const stored = new Map([
      ['a', { status: 'ACTIVE' }],
      ['b', { status: 'ACTIVE' }],
    ])
    const r = planMovementFetches([active('a'), closed('b'), active('n')], stored, 20)
    expect(r.toFetch.map((i) => i.id)).toEqual(['b', 'n', 'a'])
  })

  it('primeira leitura de uma carteira grande: 27 posições em duas execuções', () => {
    const remote = [...Array.from({ length: 10 }, (_, i) => active(`a${i}`)), ...Array.from({ length: 17 }, (_, i) => closed(`c${i}`))]
    const first = planMovementFetches(remote, new Map(), 20)
    expect(first.toFetch).toHaveLength(20)
    expect(first.complete).toBe(false)

    // Todas as posições ficam gravadas, mas só as lidas têm o estado das
    // movimentações; as outras seguem pendentes.
    const fetched = new Set(first.toFetch.map((i) => i.id))
    const stored = new Map(remote.map((i) => [i.id, { status: fetched.has(i.id) ? i.status : null }]))
    const second = planMovementFetches(remote, stored, 20)
    expect(second.complete).toBe(true)
    // As 7 que faltavam e as 10 ativas.
    expect(second.toFetch).toHaveLength(17)
    expect(second.toFetch.filter((i) => i.status === 'TOTAL_WITHDRAWAL').map((i) => i.id).sort()).toEqual(
      remote.filter((i) => !fetched.has(i.id)).map((i) => i.id).sort(),
    )
  })
})
