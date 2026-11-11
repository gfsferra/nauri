import {
  addDays,
  addMonthsToMonth,
  clampDayToMonth,
  makeIso,
  monthBounds,
  parseAmountToCents,
  todayInTimezone,
} from '@nauri/contracts'

/**
 * Conversão de uma transação da Pluggy (Open Finance, via Meu Pluggy) num
 * lançamento do Nauri. Função pura, sem rede nem banco: é onde um erro custa
 * dinheiro, então concentra as regras e os testes.
 *
 * Os formatos abaixo foram conferidos contra dados reais da conta corrente e
 * do cartão do Nubank em nov/2026.
 */

export type PluggyAccountType = 'BANK' | 'CREDIT'

/** Só os campos que usamos. A Pluggy manda muitos outros. */
export interface PluggyTransaction {
  id: string
  description: string
  /** Em reais, com até duas casas. O sinal muda entre conta e cartão. */
  amount: number
  /** Timestamp UTC. Itens sem hora vêm como 03:00Z (meia-noite em Brasília). */
  date: string
  category: string | null
  status: 'PENDING' | 'POSTED'
  type: 'DEBIT' | 'CREDIT'
  operationType: string | null
  /** Dados do Pix/TED. `routingNumber` é o código do banco (COMPE), ex.: "341". */
  paymentData?: { payer?: { routingNumber?: string | null } | null } | null
  /** Só no cartão. `billForecastDate` é o mês da fatura ("2026-12"). */
  creditCardMetadata?: {
    installmentNumber?: number | null
    totalInstallments?: number | null
    billForecastDate?: string | null
  } | null
}

export interface MappedTransaction {
  externalId: string
  kind: 'expense' | 'income'
  occurredOn: string
  amountCents: number
  description: string
  /** Nome de uma categoria padrão do Nauri (ver `seed.ts`). */
  categoryName: string
  isPending: boolean
  isInstallment: boolean
  /** Ver `budgetOnOf`. Null quando o mês do orçamento é o da própria data. */
  budgetOn: string | null
}

export type SkipReason =
  /** Valor zero: não é lançamento. */
  | 'zero'
  /** Parcela futura do cartão: entra quando a data chegar. */
  | 'future'
  /** Pagamento da fatura: as compras já entraram pelo cartão. */
  | 'bill_payment'
  /** Transferência entre contas do próprio titular. */
  | 'own_transfer'
  /** Aplicação e resgate automáticos (ex.: o saldo do Nubank rendendo). */
  | 'investment'

export type MapResult = { ok: true; value: MappedTransaction } | { ok: false; reason: SkipReason }

/** Família "Investments" da taxonomia da Pluggy, menos os rendimentos, que são receita. */
const INVESTMENT_CATEGORIES = new Set([
  'Investments',
  'Automatic investment',
  'Fixed income',
  'Mutual funds',
  'Variable income',
  'Margin',
  'Pension',
])

/**
 * Categoria da Pluggy → categoria padrão do Nauri. O que não estiver aqui cai
 * em "Outros" (gasto) ou "Outras receitas" (receita), e o usuário reclassifica.
 */
const EXPENSE_MAP: Record<string, string> = {
  Groceries: 'Mercado',
  Supermarkets: 'Mercado',

  'Eating out': 'Alimentação fora',
  'Food delivery': 'Alimentação fora',
  'Food and drinks': 'Alimentação fora',
  Restaurants: 'Alimentação fora',

  'Digital services': 'Assinaturas',
  'Video streaming': 'Assinaturas',
  'Music streaming': 'Assinaturas',
  Gaming: 'Assinaturas',

  Housing: 'Moradia',
  Rent: 'Moradia',
  Electricity: 'Moradia',
  Water: 'Moradia',
  'Gas utility': 'Moradia',
  Internet: 'Moradia',
  Telecommunications: 'Moradia',
  'Houseware': 'Moradia',

  School: 'Educação',
  University: 'Educação',
  Education: 'Educação',
  'Online courses': 'Educação',
  Bookstore: 'Educação',

  Leisure: 'Lazer',
  'Cinema, theater and concerts': 'Lazer',
  Travel: 'Lazer',
  'Airport and airlines': 'Lazer',
  Accommodation: 'Lazer',
  'Sports goods': 'Lazer',
  Entertainment: 'Lazer',

  Pharmacy: 'Saúde',
  Health: 'Saúde',
  'Health insurance': 'Saúde',
  'Hospital clinics and labs': 'Saúde',
  Dentist: 'Saúde',
  'Wellness and fitness': 'Saúde',
  'Gyms and fitness centers': 'Saúde',

  'Gas stations': 'Transporte',
  'Taxi and ride-hailing': 'Transporte',
  Parking: 'Transporte',
  'Vehicle maintenance': 'Transporte',
  Automotive: 'Transporte',
  'Public transportation': 'Transporte',
  'Tolls and in vehicle payment': 'Transporte',
  Transportation: 'Transporte',

  // As duas abaixo não são categorias padrão: a sincronização as cria na
  // primeira vez. Sem elas, ~40% das compras do cartão caíam em "Outros".
  Shopping: 'Compras',
  'Online shopping': 'Compras',
  Clothing: 'Compras',
  Electronics: 'Compras',
  'Office supplies': 'Compras',
  Services: 'Serviços',
}

const INCOME_MAP: Record<string, string> = {
  Salary: 'Salário',
  Income: 'Salário',
  'Entrepreneurial activities': 'Freelance',
  'Proceeds interests and dividends': 'Rendimentos',
}

export function categoryFor(kind: 'expense' | 'income', pluggyCategory: string | null): string {
  const name = pluggyCategory ?? ''
  if (kind === 'expense') return EXPENSE_MAP[name] ?? 'Outros'
  // Dinheiro do titular vindo de uma conta não conectada: na prática, o
  // salário que cai em outro banco e é repassado.
  if (name.startsWith('Same person transfer')) return 'Salário'
  return INCOME_MAP[name] ?? 'Outras receitas'
}

/**
 * Reais → centavos sem passar por `* 100` em ponto flutuante: o número vira
 * texto e segue o mesmo parser em string da importação de planilha.
 */
export function amountToCents(amount: number): number {
  const text = Math.abs(amount).toString()
  // Notação científica (1e-7) não aparece em valores da Pluggy, mas se aparecer
  // o `toFixed` resolve: nesses casos o valor é irrisório.
  const safe = /e/i.test(text) ? Math.abs(amount).toFixed(2) : text
  return parseAmountToCents(safe, 'en-US')
}

/**
 * A data do lançamento no fuso de São Paulo. Uma compra às 22h do dia 9 chega
 * como 01:00Z do dia 10 e precisa continuar sendo do dia 9.
 */
export function occurredOnOf(isoTimestamp: string): string {
  return todayInTimezone(new Date(isoTimestamp))
}

/**
 * Código do banco (COMPE) de uma conta da Pluggy, tirado do número de
 * transferência ("341/0001/12345-6" → "341"). Null no cartão, que não tem.
 */
export function bankCodeOf(transferNumber: string | null | undefined): string | null {
  const code = transferNumber?.split('/')[0]?.trim()
  return code && /^\d{3}$/.test(code) ? code : null
}

/**
 * Nome curto do banco para a tela, a partir do nome da conta na Pluggy
 * ("Nu Pagamentos S.A. - Instituição de Pagamento" → "Nubank").
 */
export function bankLabelOf(accountName: string): string {
  if (/nu pagamentos|nubank/i.test(accountName)) return 'Nubank'
  if (/ita[uú]/i.test(accountName)) return 'Itaú'
  return accountName.split(' - ')[0]!.trim()
}

/**
 * O dia que conta para o orçamento de uma compra no cartão. A fatura que
 * vence num mês é paga com o salário do mês anterior, então a compra pesa no
 * mês anterior ao vencimento da fatura dela: a parcela de 31/10 na fatura que
 * vence em dezembro conta em novembro.
 *
 * Devolve null quando a data já está nesse mês (o caso comum) e, fora dele, o
 * primeiro ou o último dia do mês, o mais perto da data real.
 *
 * @param billMonth mês do vencimento da fatura ("2026-12"), da Pluggy.
 */
export function budgetOnOf(occurredOn: string, billMonth: string | null | undefined): string | null {
  const bill = billMonth?.slice(0, 7)
  if (!bill || !/^\d{4}-\d{2}$/.test(bill)) return null
  const month = addMonthsToMonth(bill, -1)
  if (occurredOn.startsWith(month)) return null
  const { from, to } = monthBounds(month)
  return occurredOn < from ? from : to
}

function skipReason(
  tx: PluggyTransaction,
  accountType: PluggyAccountType,
  connectedBanks: ReadonlySet<string>,
): SkipReason | null {
  const category = tx.category ?? ''
  if (
    category === 'Credit card payment' ||
    tx.operationType === 'PAGAMENTO_FATURA' ||
    // Na conta corrente o pagamento da fatura chega como transferência
    // genérica; só a descrição denuncia.
    (accountType === 'BANK' && /\bfatura\b/i.test(tx.description))
  ) {
    return 'bill_payment'
  }
  // Entre contas do próprio titular, a saída é sempre descartada. A entrada
  // só quando vem de um banco também conectado: aí o dinheiro já entrou no
  // Nauri pela outra conta (o salário que cai num banco e é repassado a
  // outro, por exemplo). Vinda de banco não conectado, é dinheiro novo.
  if (category.startsWith('Same person transfer')) {
    if (isOutflow(tx, accountType)) return 'own_transfer'
    const payerBank = tx.paymentData?.payer?.routingNumber
    if (payerBank && connectedBanks.has(payerBank)) return 'own_transfer'
  }
  if (INVESTMENT_CATEGORIES.has(category)) return 'investment'
  return null
}

/** Na conta, saída vem negativa. No cartão é o contrário: a compra vem positiva e o estorno negativo. */
function isOutflow(tx: PluggyTransaction, accountType: PluggyAccountType): boolean {
  return accountType === 'CREDIT' ? tx.amount > 0 : tx.amount < 0
}

export function mapPluggyTransaction(
  tx: PluggyTransaction,
  accountType: PluggyAccountType,
  today: string,
  /** Códigos dos bancos com conta conectada (ver `bankCodeOf`). */
  connectedBanks: ReadonlySet<string> = new Set(),
): MapResult {
  const reason = skipReason(tx, accountType, connectedBanks)
  if (reason) return { ok: false, reason }

  const amountCents = amountToCents(tx.amount)
  if (amountCents === 0) return { ok: false, reason: 'zero' }

  const occurredOn = occurredOnOf(tx.date)
  if (occurredOn > today) return { ok: false, reason: 'future' }

  const kind = isOutflow(tx, accountType) ? 'expense' : 'income'

  return {
    ok: true,
    value: {
      externalId: tx.id,
      kind,
      occurredOn,
      amountCents,
      description: tx.description.trim().slice(0, 200),
      categoryName: categoryFor(kind, tx.category),
      isPending: tx.status === 'PENDING',
      isInstallment: (tx.creditCardMetadata?.totalInstallments ?? 0) > 1,
      budgetOn: accountType === 'CREDIT' ? budgetOnOf(occurredOn, tx.creditCardMetadata?.billForecastDate) : null,
    },
  }
}

/** Quanto voltar no tempo a cada leitura recente: cobre compras pendentes que viram definitivas. */
export const RECENT_WINDOW_DAYS = 35

/** A Pluggy entrega até 12 meses de histórico. */
export const HISTORY_DAYS = 365

/** Tamanho de cada fatia do histórico, para nenhuma execução estourar a CPU do Worker. */
export const BACKFILL_CHUNK_DAYS = 31

export interface SyncState {
  syncFrom: string
  /** Data mais antiga já importada. Igual a `syncFrom` quando o histórico terminou. */
  backfillCursor: string
  /** `lastUpdatedAt` da conexão na Pluggy na última leitura recente; null se nunca leu. */
  providerUpdatedAt: string | null
}

export type SyncPlan =
  | { kind: 'idle' }
  | { kind: 'recent'; from: string; to: string }
  | { kind: 'backfill'; from: string; to: string }

/**
 * Decide o que uma execução faz. Uma janela só por vez, para o custo de cada
 * execução ficar pequeno e previsível:
 *   1. se a Pluggy atualizou desde a última leitura (ou foi pedido), lê os
 *      últimos 35 dias;
 *   2. senão, se ainda falta histórico, importa a próxima fatia de um mês, do
 *      mais recente para o mais antigo;
 *   3. senão, não faz nada.
 */
export function planSync(
  state: SyncState,
  providerUpdatedAt: string | null,
  today: string,
  force = false,
): SyncPlan {
  const changed =
    force ||
    state.providerUpdatedAt === null ||
    (providerUpdatedAt !== null && providerUpdatedAt > state.providerUpdatedAt)

  if (changed) {
    const from = maxDate(state.syncFrom, addDays(today, -RECENT_WINDOW_DAYS))
    return { kind: 'recent', from, to: today }
  }

  if (state.backfillCursor > state.syncFrom) {
    const to = addDays(state.backfillCursor, -1)
    const from = maxDate(state.syncFrom, addDays(state.backfillCursor, -BACKFILL_CHUNK_DAYS))
    return { kind: 'backfill', from, to }
  }

  return { kind: 'idle' }
}

/**
 * "Sincronizar agora": faz o trabalho que estiver pendente (dado novo ou
 * próxima fatia do histórico) e, se não houver nenhum, relê os últimos dias.
 * Assim o botão também avança o histórico, se o agendamento falhar.
 */
export function planManualSync(state: SyncState, providerUpdatedAt: string | null, today: string): SyncPlan {
  const plan = planSync(state, providerUpdatedAt, today)
  return plan.kind === 'idle' ? planSync(state, providerUpdatedAt, today, true) : plan
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

export interface CardBill {
  /** Compras menos estornos da fatura em aberto, em centavos. */
  amountCents: number
  dueOn: string
}

/**
 * A fatura em aberto do cartão: a próxima a vencer. A Pluggy marca cada
 * lançamento ainda não faturado com o mês da fatura (`billForecastDate`); o
 * dia do vencimento vem da conta (`balanceDueDate`). Null sem esses dados.
 *
 * @param transactions lançamentos do cartão, incluindo as parcelas futuras.
 * @param dueDay dia do vencimento da fatura.
 */
export function openCardBill(
  transactions: PluggyTransaction[],
  dueDay: number | null,
  today: string,
): CardBill | null {
  if (!dueDay) return null
  const dueOnOf = (month: string) => {
    const [year, m] = month.split('-').map(Number) as [number, number]
    return makeIso(year, m, clampDayToMonth(year, m, dueDay))
  }

  const byBill = new Map<string, number>()
  for (const tx of transactions) {
    const month = tx.creditCardMetadata?.billForecastDate?.slice(0, 7)
    if (tx.status !== 'PENDING' || !month || !/^\d{4}-\d{2}$/.test(month)) continue
    // Compra positiva, estorno negativo (ver `mapPluggyTransaction`).
    const cents = amountToCents(tx.amount) * (tx.amount > 0 ? 1 : -1)
    byBill.set(month, (byBill.get(month) ?? 0) + cents)
  }

  const open = [...byBill.keys()].sort().find((month) => dueOnOf(month) >= today)
  return open ? { amountCents: byBill.get(open)!, dueOn: dueOnOf(open) } : null
}

/**
 * Parcelas futuras do cartão: entram como lançamento quando a data chega
 * (`mapPluggyTransaction` as recusa antes) e, até lá, viram previsão.
 */
export function upcomingInstallments(
  transactions: PluggyTransaction[],
  today: string,
  connectedBanks: ReadonlySet<string> = new Set(),
): MappedTransaction[] {
  const out: MappedTransaction[] = []
  for (const tx of transactions) {
    if (occurredOnOf(tx.date) <= today) continue
    // Mapeia como se a data já tivesse chegado, para aproveitar as mesmas regras.
    const r = mapPluggyTransaction(tx, 'CREDIT', '9999-12-31', connectedBanks)
    if (r.ok && r.value.kind === 'expense') out.push(r.value)
  }
  return out.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
}
