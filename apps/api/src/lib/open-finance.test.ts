import {
  amountToCents,
  bankCodeOf,
  bankIconOf,
  budgetOnOf,
  bankLabelOf,
  categoryFor,
  mapPluggyTransaction,
  occurredOnOf,
  openCardBill,
  upcomingInstallments,
  planManualSync,
  planSync,
  type PluggyTransaction,
} from './open-finance.js'

const TODAY = '2026-11-10'

function tx(over: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: 'tx-1',
    description: 'Compra',
    amount: 10,
    date: '2026-11-05T15:00:00.000Z',
    category: 'Shopping',
    status: 'POSTED',
    type: 'DEBIT',
    operationType: null,
    ...over,
  }
}

describe('amountToCents', () => {
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(amountToCents(55.49)).toBe(5549)
    expect(amountToCents(0.1 + 0.2)).toBe(30) // 0.30000000000000004
    expect(amountToCents(247.99)).toBe(24799)
    expect(amountToCents(200)).toBe(20000)
    expect(amountToCents(1.5)).toBe(150)
  })

  it('ignora o sinal: o tipo do lançamento vem de outra regra', () => {
    expect(amountToCents(-76)).toBe(7600)
    expect(amountToCents(-30.05)).toBe(3005)
  })
})

describe('bankCodeOf', () => {
  it('tira o código do banco do número de transferência', () => {
    expect(bankCodeOf('341/0001/12345-6')).toBe('341')
    expect(bankCodeOf('260/0001/1234567-8')).toBe('260')
  })

  it('devolve null sem número ou com formato inesperado', () => {
    expect(bankCodeOf(null)).toBeNull()
    expect(bankCodeOf(undefined)).toBeNull()
    expect(bankCodeOf('')).toBeNull()
    expect(bankCodeOf('itau')).toBeNull()
  })
})

describe('bankLabelOf', () => {
  it('encurta o nome da conta para o nome do banco', () => {
    expect(bankLabelOf('Nu Pagamentos S.A. - Instituição de Pagamento')).toBe('Nubank')
    expect(bankLabelOf('itau')).toBe('Itaú')
    expect(bankLabelOf('Banco Inter - Conta')).toBe('Banco Inter')
  })
})

describe('occurredOnOf', () => {
  it('usa a data de São Paulo, não a de UTC', () => {
    // 01:30 UTC do dia 10 = 22:30 do dia 9 em Brasília.
    expect(occurredOnOf('2026-11-10T01:30:00.000Z')).toBe('2026-11-09')
    expect(occurredOnOf('2026-11-10T03:00:00.000Z')).toBe('2026-11-10')
  })

  it('não erra a virada do ano', () => {
    expect(occurredOnOf('2027-01-01T02:59:59.000Z')).toBe('2026-12-31')
  })
})

describe('mapPluggyTransaction: conta corrente', () => {
  it('saída negativa vira gasto', () => {
    const r = mapPluggyTransaction(
      tx({ amount: -30, type: 'DEBIT', category: 'Groceries' }),
      'BANK',
      TODAY,
    )
    expect(r).toEqual({
      ok: true,
      value: {
        externalId: 'tx-1',
        kind: 'expense',
        occurredOn: '2026-11-05',
        amountCents: 3000,
        description: 'Compra',
        categoryName: 'Mercado',
        isPending: false,
        isInstallment: false,
        budgetOn: null,
      },
    })
  })

  it('entrada positiva vira receita', () => {
    const r = mapPluggyTransaction(
      tx({ amount: 7500, type: 'CREDIT', category: 'Salary', description: 'Salário' }),
      'BANK',
      TODAY,
    )
    expect(r.ok && r.value).toMatchObject({ kind: 'income', amountCents: 750000, categoryName: 'Salário' })
  })

  it('PIX genérico entra, em Outros ou Outras receitas', () => {
    const out = mapPluggyTransaction(tx({ amount: -50, category: 'Transfers', operationType: 'PIX' }), 'BANK', TODAY)
    const inn = mapPluggyTransaction(
      tx({ amount: 50, type: 'CREDIT', category: 'Transfers', operationType: 'PIX' }),
      'BANK',
      TODAY,
    )
    expect(out.ok && out.value.categoryName).toBe('Outros')
    expect(inn.ok && inn.value.categoryName).toBe('Outras receitas')
  })

  it('ignora o pagamento da fatura, que chega como transferência genérica', () => {
    const r = mapPluggyTransaction(
      tx({ amount: -1234.5, category: 'Transfers', operationType: 'OUTROS', description: 'Pagamento de fatura' }),
      'BANK',
      TODAY,
    )
    expect(r).toEqual({ ok: false, reason: 'bill_payment' })
  })

  it('não confunde "fatura" dentro de outra palavra com pagamento de fatura', () => {
    const r = mapPluggyTransaction(tx({ amount: -10, description: 'Faturamento loja' }), 'BANK', TODAY)
    expect(r.ok).toBe(true)
  })

  it('ignora a saída para outra conta do próprio titular', () => {
    const r = mapPluggyTransaction(
      tx({ amount: -100, type: 'DEBIT', category: 'Same person transfer', operationType: 'PIX' }),
      'BANK',
      TODAY,
    )
    expect(r).toEqual({ ok: false, reason: 'own_transfer' })
    const sub = mapPluggyTransaction(tx({ amount: -100, category: 'Same person transfer - TED' }), 'BANK', TODAY)
    expect(sub).toEqual({ ok: false, reason: 'own_transfer' })
  })

  it('entrada vinda de outra conta do titular (não conectada) vira receita em Salário', () => {
    // O salário cai em outro banco e é repassado por Pix.
    for (const category of ['Same person transfer', 'Same person transfer - PIX']) {
      const r = mapPluggyTransaction(
        tx({ amount: 3000.5, type: 'CREDIT', category, operationType: 'PIX' }),
        'BANK',
        TODAY,
      )
      expect(r.ok && r.value).toMatchObject({ kind: 'income', amountCents: 300050, categoryName: 'Salário' })
    }
  })

  it('entrada vinda de banco também conectado é descartada: o dinheiro já entrou pela outra conta', () => {
    const repasse = tx({
      amount: 3000.5,
      type: 'CREDIT',
      category: 'Same person transfer',
      operationType: 'PIX',
      paymentData: { payer: { routingNumber: '341' } },
    })
    expect(mapPluggyTransaction(repasse, 'BANK', TODAY, new Set(['260', '341']))).toEqual({
      ok: false,
      reason: 'own_transfer',
    })
    // O mesmo repasse, com o banco de origem fora do Nauri, é dinheiro novo.
    expect(mapPluggyTransaction(repasse, 'BANK', TODAY, new Set(['260'])).ok).toBe(true)
  })

  it('entrada do titular sem banco de origem informado conta como receita', () => {
    const r = mapPluggyTransaction(
      tx({ amount: 50, type: 'CREDIT', category: 'Same person transfer', paymentData: null }),
      'BANK',
      TODAY,
      new Set(['260', '341']),
    )
    expect(r.ok && r.value.kind).toBe('income')
  })

  it('ignora aplicação e resgate automáticos', () => {
    for (const amount of [-200, 200]) {
      const r = mapPluggyTransaction(
        tx({ amount, category: 'Investments', operationType: 'RESGATE_APLIC_FINANCEIRA' }),
        'BANK',
        TODAY,
      )
      expect(r).toEqual({ ok: false, reason: 'investment' })
    }
  })

  it('rendimento não é movimento de investimento: entra como receita', () => {
    const r = mapPluggyTransaction(
      tx({ amount: 12.34, type: 'CREDIT', category: 'Proceeds interests and dividends' }),
      'BANK',
      TODAY,
    )
    expect(r.ok && r.value).toMatchObject({ kind: 'income', categoryName: 'Rendimentos' })
  })

  it('compra que usou saldo resgatado continua sendo compra', () => {
    // A Pluggy marca algumas compras com operationType de resgate; quem decide é a categoria.
    const r = mapPluggyTransaction(
      tx({ amount: -80, category: 'Shopping', operationType: 'RESGATE_APLIC_FINANCEIRA' }),
      'BANK',
      TODAY,
    )
    expect(r.ok && r.value.kind).toBe('expense')
  })
})

describe('mapPluggyTransaction: cartão de crédito', () => {
  it('compra vem positiva e vira gasto', () => {
    const r = mapPluggyTransaction(
      tx({ amount: 247.99, type: 'DEBIT', category: 'Eating out', operationType: 'PAGAMENTO' }),
      'CREDIT',
      TODAY,
    )
    expect(r.ok && r.value).toMatchObject({ kind: 'expense', amountCents: 24799, categoryName: 'Alimentação fora' })
  })

  it('estorno vem negativo e vira receita', () => {
    const r = mapPluggyTransaction(
      tx({ amount: -15, type: 'CREDIT', category: 'Tax on financial operations', operationType: 'ESTORNO' }),
      'CREDIT',
      TODAY,
    )
    expect(r.ok && r.value).toMatchObject({ kind: 'income', amountCents: 1500, categoryName: 'Outras receitas' })
  })

  it('ignora o pagamento da fatura do lado do cartão', () => {
    const r = mapPluggyTransaction(
      tx({ amount: -1234.5, type: 'CREDIT', category: 'Credit card payment', operationType: 'PAGAMENTO_FATURA' }),
      'CREDIT',
      TODAY,
    )
    expect(r).toEqual({ ok: false, reason: 'bill_payment' })
  })

  it('parcela futura fica de fora até a data chegar', () => {
    const r = mapPluggyTransaction(tx({ date: '2027-01-10T03:00:00.000Z' }), 'CREDIT', TODAY)
    expect(r).toEqual({ ok: false, reason: 'future' })
    const hoje = mapPluggyTransaction(tx({ date: '2026-11-10T03:00:00.000Z' }), 'CREDIT', TODAY)
    expect(hoje.ok).toBe(true)
  })

  it('compra pendente entra marcada como pendente', () => {
    const r = mapPluggyTransaction(tx({ status: 'PENDING' }), 'CREDIT', TODAY)
    expect(r.ok && r.value.isPending).toBe(true)
  })

  it('a palavra "fatura" na descrição de uma compra no cartão não a descarta', () => {
    const r = mapPluggyTransaction(tx({ amount: 30, description: 'Loja Fatura Certa' }), 'CREDIT', TODAY)
    expect(r.ok).toBe(true)
  })
})

describe('mapPluggyTransaction: casos gerais', () => {
  it('ignora valor zero', () => {
    expect(mapPluggyTransaction(tx({ amount: 0 }), 'BANK', TODAY)).toEqual({ ok: false, reason: 'zero' })
  })

  it('corta descrições longas em 200 caracteres e remove espaços nas pontas', () => {
    const r = mapPluggyTransaction(tx({ amount: -1, description: `  ${'x'.repeat(250)}  ` }), 'BANK', TODAY)
    expect(r.ok && r.value.description).toHaveLength(200)
  })

  it('compras e serviços ganham categorias próprias em vez de "Outros"', () => {
    expect(categoryFor('expense', 'Shopping')).toBe('Compras')
    expect(categoryFor('expense', 'Clothing')).toBe('Compras')
    expect(categoryFor('expense', 'Services')).toBe('Serviços')
    expect(categoryFor('expense', 'Bank fees')).toBe('Outros')
  })

  it('categoria nula cai no padrão do tipo', () => {
    expect(categoryFor('expense', null)).toBe('Outros')
    expect(categoryFor('income', null)).toBe('Outras receitas')
  })
})

describe('planSync', () => {
  const base = { syncFrom: '2025-11-10', backfillCursor: '2026-10-06', providerUpdatedAt: '2026-11-10T00:55:07.612Z' }

  it('primeira execução lê a janela recente', () => {
    expect(planSync({ ...base, providerUpdatedAt: null }, '2026-11-10T00:55:07.612Z', TODAY)).toEqual({
      kind: 'recent',
      from: '2026-10-06',
      to: TODAY,
    })
  })

  it('lê de novo a janela recente quando a Pluggy atualizou', () => {
    expect(planSync(base, '2026-11-11T00:55:00.000Z', TODAY).kind).toBe('recent')
  })

  it('sem atualização na Pluggy, importa a próxima fatia do histórico', () => {
    expect(planSync(base, base.providerUpdatedAt, TODAY)).toEqual({
      kind: 'backfill',
      from: '2026-09-05',
      to: '2026-10-05',
    })
  })

  it('a última fatia não passa da data de corte', () => {
    expect(planSync({ ...base, backfillCursor: '2025-11-20' }, base.providerUpdatedAt, TODAY)).toEqual({
      kind: 'backfill',
      from: '2025-11-10',
      to: '2025-11-19',
    })
  })

  it('com histórico completo e nada novo, não faz nada', () => {
    expect(planSync({ ...base, backfillCursor: base.syncFrom }, base.providerUpdatedAt, TODAY)).toEqual({ kind: 'idle' })
  })

  it('pedido manual força a leitura recente', () => {
    expect(planSync({ ...base, backfillCursor: base.syncFrom }, base.providerUpdatedAt, TODAY, true).kind).toBe('recent')
  })

  it('botão manual avança o histórico quando não há dado novo', () => {
    expect(planManualSync(base, base.providerUpdatedAt, TODAY).kind).toBe('backfill')
  })

  it('botão manual relê os últimos dias quando não há nada pendente', () => {
    expect(planManualSync({ ...base, backfillCursor: base.syncFrom }, base.providerUpdatedAt, TODAY).kind).toBe('recent')
  })

  it('botão manual prioriza dado novo da Pluggy', () => {
    expect(planManualSync(base, '2026-11-11T00:55:00.000Z', TODAY).kind).toBe('recent')
  })

  it('a janela recente não começa antes da data de corte', () => {
    const r = planSync({ ...base, syncFrom: '2026-11-01', providerUpdatedAt: null }, null, TODAY)
    expect(r).toEqual({ kind: 'recent', from: '2026-11-01', to: TODAY })
  })
})

describe('parcelas e fatura do cartão', () => {
  const parcela = (over: Partial<PluggyTransaction>, n: number, total: number, bill: string) =>
    tx({
      status: 'PENDING',
      ...over,
      creditCardMetadata: { installmentNumber: n, totalInstallments: total, billForecastDate: bill },
    })

  it('marca a parcela, mesmo sem "2/4" na descrição', () => {
    const r = mapPluggyTransaction(parcela({ description: 'Loja de Eletrônicos' }, 3, 10, '2026-12'), 'CREDIT', TODAY)
    expect(r.ok && r.value.isInstallment).toBe(true)
    const avista = mapPluggyTransaction(tx({ creditCardMetadata: { totalInstallments: 1 } }), 'CREDIT', TODAY)
    expect(avista.ok && avista.value.isInstallment).toBe(false)
  })

  it('a fatura em aberto é a próxima a vencer, com compras menos estornos', () => {
    const txs = [
      parcela({ id: 'a', amount: 248, date: '2026-10-31T03:00:00.000Z' }, 3, 10, '2026-12'),
      tx({ id: 'b', amount: 40.97, status: 'PENDING', creditCardMetadata: { billForecastDate: '2026-12' } }),
      tx({ id: 'c', amount: -10, status: 'PENDING', creditCardMetadata: { billForecastDate: '2026-12' } }),
      // Fatura que já venceu (dia 9 de novembro) e parcela de uma fatura futura.
      tx({ id: 'd', amount: 112.83, status: 'PENDING', creditCardMetadata: { billForecastDate: '2026-11' } }),
      parcela({ id: 'e', amount: 247.99, date: '2027-01-13T03:00:00.000Z' }, 5, 10, '2027-02'),
      // Lançamento já faturado não entra.
      tx({ id: 'f', amount: 500, status: 'POSTED', creditCardMetadata: { billForecastDate: '2026-12' } }),
    ]
    expect(openCardBill(txs, 9, TODAY)).toEqual({ amountCents: 24800 + 4097 - 1000, dueOn: '2026-12-09' })
  })

  it('sem dia de vencimento ou sem lançamento em aberto, não há fatura', () => {
    expect(openCardBill([], 9, TODAY)).toBeNull()
    expect(openCardBill([tx({ status: 'PENDING', creditCardMetadata: { billForecastDate: '2026-12' } })], null, TODAY)).toBeNull()
  })

  it('parcelas futuras viram previsão; as de hoje para trás, não', () => {
    const txs = [
      parcela({ id: 'hoje', date: '2026-11-10T03:00:00.000Z' }, 2, 4, '2026-12'),
      parcela({ id: 'dez', amount: 244.77, date: '2026-12-27T03:00:00.000Z', category: 'Travel' }, 3, 4, '2027-01'),
      parcela({ id: 'jan', amount: 244.77, date: '2027-01-27T03:00:00.000Z', category: 'Travel' }, 4, 4, '2027-02'),
    ]
    expect(upcomingInstallments(txs, TODAY).map((m) => [m.externalId, m.occurredOn, m.categoryName, m.isInstallment])).toEqual([
      ['dez', '2026-12-27', 'Lazer', true],
      ['jan', '2027-01-27', 'Lazer', true],
    ])
  })
})

describe('budgetOnOf: mês do orçamento das compras no cartão', () => {
  it('compra na fatura que vence em dezembro conta em novembro', () => {
    expect(budgetOnOf('2026-11-15', '2026-12')).toBeNull()
  })

  it('a parcela de 31/10 na fatura de dezembro vai para 1/11', () => {
    expect(budgetOnOf('2026-10-31', '2026-12')).toBe('2026-11-01')
  })

  it('compra depois do mês do orçamento vai para o último dia dele', () => {
    expect(budgetOnOf('2026-12-01', '2026-12')).toBe('2026-11-30')
  })

  it('a virada do ano: fatura de janeiro conta em dezembro', () => {
    expect(budgetOnOf('2026-12-31', '2027-01')).toBeNull()
    expect(budgetOnOf('2027-01-01', '2027-01')).toBe('2026-12-31')
  })

  it('sem mês da fatura, vale a própria data', () => {
    expect(budgetOnOf('2026-10-31', null)).toBeNull()
    expect(budgetOnOf('2026-10-31', 'lixo')).toBeNull()
  })

  it('o mapeamento do cartão já traz o dia do orçamento; a conta corrente não', () => {
    const parcela = tx({ date: '2026-10-31T03:00:00.000Z', creditCardMetadata: { billForecastDate: '2026-12' } })
    const card = mapPluggyTransaction(parcela, 'CREDIT', TODAY)
    expect(card.ok && card.value.budgetOn).toBe('2026-11-01')
    const bank = mapPluggyTransaction({ ...parcela, amount: -10 }, 'BANK', TODAY)
    expect(bank.ok && bank.value.budgetOn).toBeNull()
  })
})

describe('bankIconOf', () => {
  it('logo dos bancos conhecidos, pela CDN da Pluggy', () => {
    expect(bankIconOf('Nubank')).toBe('https://cdn.pluggy.ai/assets/connector-icons/212.svg')
    expect(bankIconOf('Itaú')).toBe('https://cdn.pluggy.ai/assets/connector-icons/201.svg')
  })
  it('banco desconhecido ou vazio fica sem logo', () => {
    expect(bankIconOf('Banco Inter')).toBeNull()
    expect(bankIconOf(null)).toBeNull()
    expect(bankIconOf('')).toBeNull()
  })
})
