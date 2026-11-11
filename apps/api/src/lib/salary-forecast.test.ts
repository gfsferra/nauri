import { forecastForMonth, salarySlots, type SalaryPayment } from './salary-forecast.js'

const TODAY = '2026-11-11'

// Adiantamento por volta do dia 15 e o restante no fim do mês.
const history: SalaryPayment[] = [
  { occurredOn: '2026-08-14', amountCents: 150000 },
  { occurredOn: '2026-08-31', amountCents: 200000 },
  { occurredOn: '2026-09-16', amountCents: 150000 },
  { occurredOn: '2026-09-30', amountCents: 200000 },
  { occurredOn: '2026-10-16', amountCents: 160000 },
  { occurredOn: '2026-10-30', amountCents: 210000 },
]

describe('salarySlots', () => {
  it('acha as duas parcelas, com o dia e o valor do último pagamento', () => {
    expect(salarySlots(history, TODAY)).toEqual([
      { day: 16, amountCents: 160000 },
      { day: 30, amountCents: 210000 },
    ])
  })

  it('pagamento avulso não vira previsão', () => {
    const slots = salarySlots([...history, { occurredOn: '2026-10-05', amountCents: 999900 }], TODAY)
    expect(slots.map((s) => s.day)).toEqual([16, 30])
  })

  it('o fim do mês que cai no dia 1 conta como a mesma parcela', () => {
    const slots = salarySlots(
      [
        { occurredOn: '2026-09-01', amountCents: 200000 },
        { occurredOn: '2026-09-30', amountCents: 200000 },
        { occurredOn: '2026-10-31', amountCents: 200000 },
      ],
      TODAY,
    )
    expect(slots).toEqual([{ day: 31, amountCents: 200000 }])
  })

  it('ignora pagamentos antigos demais e sem histórico não prevê nada', () => {
    expect(salarySlots([{ occurredOn: '2025-01-15', amountCents: 1 }, { occurredOn: '2025-02-15', amountCents: 1 }], TODAY)).toEqual([])
    expect(salarySlots([], TODAY)).toEqual([])
  })
})

describe('forecastForMonth', () => {
  const slots = salarySlots(history, TODAY)

  it('mês atual sem salário ainda: as duas parcelas previstas', () => {
    expect(forecastForMonth(slots, [], '2026-11', TODAY)).toEqual([
      { occurredOn: '2026-11-16', amountCents: 160000 },
      { occurredOn: '2026-11-30', amountCents: 210000 },
    ])
  })

  it('parcela que caiu sai da previsão, mesmo com outro dia e outro valor', () => {
    const received = [{ occurredOn: '2026-11-13', amountCents: 171234 }]
    expect(forecastForMonth(slots, received, '2026-11', TODAY)).toEqual([
      { occurredOn: '2026-11-30', amountCents: 210000 },
    ])
  })

  it('mês futuro: tudo previsto, com o dia ajustado ao tamanho do mês', () => {
    const feb = forecastForMonth([{ day: 30, amountCents: 1 }], [], '2027-02', TODAY)
    expect(feb).toEqual([{ occurredOn: '2027-02-28', amountCents: 1 }])
  })

  it('mês passado não tem previsão', () => {
    expect(forecastForMonth(slots, [], '2026-10', TODAY)).toEqual([])
  })

  it('pagamento de outro mês não cobre a parcela deste', () => {
    const received = [{ occurredOn: '2026-10-30', amountCents: 210000 }]
    expect(forecastForMonth(slots, received, '2026-11', TODAY)).toHaveLength(2)
  })
})
