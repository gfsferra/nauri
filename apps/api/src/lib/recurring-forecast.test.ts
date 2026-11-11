import { forecastExpensesForMonth, recurringSeries, type ExpensePayment } from './recurring-forecast.js'

const TODAY = '2026-11-11'

function charges(description: string, list: Array<[string, number]>, categoryName = 'Assinaturas'): ExpensePayment[] {
  return list.map(([occurredOn, amountCents]) => ({ occurredOn, amountCents, description, categoryName }))
}

const streaming = charges('Streaming Plus', [
  ['2026-08-27', 1990],
  ['2026-09-27', 1990],
  ['2026-10-27', 1990],
])

describe('recurringSeries', () => {
  it('cobrança mensal no mesmo dia e valor vira série', () => {
    expect(recurringSeries(streaming, TODAY)).toEqual([
      { description: 'Streaming Plus', categoryName: 'Assinaturas', day: 27, amountCents: 1990 },
    ])
  })

  it('aceita reajuste pequeno e usa o valor mais recente', () => {
    const ia = charges('Assistente IA', [
      ['2026-08-24', 2127],
      ['2026-09-24', 2146],
      ['2026-10-24', 2184],
    ])
    expect(recurringSeries(ia, TODAY)[0]).toMatchObject({ day: 24, amountCents: 2184 })
  })

  it('mês faltando no meio não impede, desde que haja três meses', () => {
    const video = charges('Video Premium', [
      ['2026-07-15', 2490],
      ['2026-08-15', 2690],
      ['2026-10-15', 2690],
    ])
    expect(recurringSeries(video, TODAY)).toHaveLength(1)
  })

  it('consumo do dia a dia não é conta fixa', () => {
    const fuel = charges(
      'Posto Centro',
      [
        ['2026-08-12', 15797],
        ['2026-09-19', 12361],
        ['2026-10-19', 15511],
      ],
      'Transporte',
    )
    const twicePerMonth = charges('Barbearia', [
      ['2026-08-06', 9500],
      ['2026-09-02', 8000],
      ['2026-09-30', 8000],
      ['2026-10-28', 8000],
    ])
    const wanderingDay = charges('Loja 1a99', [
      ['2026-08-05', 449],
      ['2026-09-23', 449],
      ['2026-10-16', 498],
    ])
    expect(recurringSeries([...fuel, ...twicePerMonth, ...wanderingDay], TODAY)).toEqual([])
  })

  it('assinatura que parou de cobrar sai da previsão', () => {
    const cancelled = charges('Musica Online', [
      ['2026-07-21', 1290],
      ['2026-08-21', 1290],
      ['2026-09-21', 1290],
    ])
    expect(recurringSeries(cancelled, TODAY)).toEqual([])
  })

  it('agrupa a mesma descrição com caixa ou espaços diferentes', () => {
    const mixed = [
      ...charges('Academia  Plano', [['2026-08-13', 13750]]),
      ...charges('ACADEMIA PLANO', [['2026-09-13', 13750]]),
      ...charges('academia plano', [['2026-10-13', 13750]]),
    ]
    expect(recurringSeries(mixed, TODAY)).toHaveLength(1)
  })

  it('menos de três meses ainda não é série', () => {
    expect(recurringSeries(streaming.slice(1), TODAY)).toEqual([])
  })
})

describe('forecastExpensesForMonth', () => {
  const series = recurringSeries(
    [
      ...streaming,
      ...charges('Pix fixo', [
        ['2026-08-06', 7600],
        ['2026-09-06', 7600],
        ['2026-10-06', 7600],
      ]),
    ],
    TODAY,
  )

  it('mês atual: prevê o que ainda não cobrou', () => {
    const charged = charges('Pix fixo', [['2026-11-06', 7600]])
    expect(forecastExpensesForMonth(series, charged, '2026-11', TODAY)).toEqual([
      { occurredOn: '2026-11-27', amountCents: 1990, description: 'Streaming Plus', categoryName: 'Assinaturas' },
    ])
  })

  it('mês atual: a que já devia ter cobrado há dias e não cobrou não é prevista', () => {
    // Dia 14: o Pix do dia 6 está 8 dias atrasado.
    expect(forecastExpensesForMonth(series, [], '2026-11', '2026-11-14').map((f) => f.description)).toEqual([
      'Streaming Plus',
    ])
    // Dia 11: só 5 dias, ainda dentro da tolerância.
    expect(forecastExpensesForMonth(series, [], '2026-11', TODAY)).toHaveLength(2)
  })

  it('mês futuro: todas previstas', () => {
    expect(forecastExpensesForMonth(series, [], '2026-12', TODAY)).toHaveLength(2)
  })

  it('mês passado não tem previsão', () => {
    expect(forecastExpensesForMonth(series, [], '2026-10', TODAY)).toEqual([])
  })
})
