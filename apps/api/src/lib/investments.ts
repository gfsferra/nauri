import { addMonthsToMonth } from '@nauri/contracts'
import { amountToCents } from './open-finance.js'

/**
 * Investimentos do Open Finance (Meu Pluggy). Funções puras: conversão do
 * formato da Pluggy, custo de compra, rótulos para a tela e as somas da aba.
 *
 * Formatos conferidos contra dados reais em nov/2026: CDBs (taxa em % do
 * CDI), ETF e FII, ativos e resgatados.
 */

/** Só os campos que usamos. */
export interface PluggyInvestment {
  id: string
  name: string
  code: string | null
  /** FIXED_INCOME, ETF, EQUITY, MUTUAL_FUND, SECURITY, COE, OTHER. */
  type: string
  /** CDB, LCI, TREASURY, REAL_ESTATE_FUND, STOCK... */
  subtype: string | null
  /** Valor líquido de hoje: o que cai na conta num resgate (já sem IR e IOF). */
  balance: number
  /** Valor bruto, antes dos impostos. */
  amount: number | null
  /** Custo de compra do que ainda está aplicado. Vem vazio no ETF. */
  amountOriginal: number | null
  quantity: number | null
  /** Data da cotação/posição. */
  date: string | null
  dueDate: string | null
  purchaseDate: string | null
  issuer: string | null
  /** Percentual do indexador: 120 com `rateType` CDI é "120% do CDI". */
  rate: number | null
  rateType: string | null
  /** Taxa fixa ao ano: o "6%" de IPCA + 6%, ou a taxa de um prefixado. */
  fixedAnnualRate: number | null
  /** ACTIVE, PENDING ou TOTAL_WITHDRAWAL (resgatado por inteiro). */
  status: string | null
}

export interface PluggyInvestmentTransaction {
  id: string
  /** BUY, SELL, INTEREST (provento), TAX, TRANSFER, AMORTIZATION... */
  type: string
  /** Valor bruto da operação, em reais. */
  amount: number
  /** O que de fato saiu ou entrou na conta, depois de IR, IOF e taxas. */
  netAmount: number | null
  quantity: number | null
  /** Meia-noite UTC do dia da operação. */
  date: string
}

/**
 * A data de um campo da Pluggy. Nos investimentos as datas vêm à meia-noite
 * UTC ("2026-02-25T00:00:00Z") ou às 03:00Z, as duas querendo dizer o dia
 * escrito. Converter para o fuso de São Paulo jogaria a de meia-noite para o
 * dia anterior, então aqui vale o texto.
 */
export function dateOf(iso: string | null | undefined): string | null {
  const day = iso?.slice(0, 10)
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Reais → centavos, com sinal. Ver `amountToCents`. */
export function signedCents(amount: number): number {
  const cents = amountToCents(amount)
  return amount < 0 ? -cents : cents
}

/**
 * Custo do que ainda está aplicado, pelo preço médio: cada compra soma, cada
 * venda tira a fatia proporcional às cotas vendidas. Só serve quando o
 * histórico explica a posição inteira (as cotas batem com as de hoje); com
 * compra anterior aos 12 meses que a Pluggy devolve, o custo é desconhecido.
 */
export function averageCostCents(
  movements: readonly PluggyInvestmentTransaction[],
  currentQuantity: number | null,
): number | null {
  if (currentQuantity === null || currentQuantity <= 0) return null
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date))
  let quantity = 0
  let cost = 0
  for (const m of ordered) {
    if (m.quantity === null || m.quantity <= 0) continue
    if (m.type === 'BUY') {
      quantity += m.quantity
      cost += amountToCents(m.amount)
    } else if (m.type === 'SELL') {
      if (quantity <= 0) return null
      const sold = Math.min(m.quantity, quantity)
      cost -= Math.round((cost * sold) / quantity)
      quantity -= sold
    }
  }
  // Tolerância para as frações de cota que os bancos arredondam.
  if (Math.abs(quantity - currentQuantity) > Math.max(1e-6, currentQuantity * 1e-6)) return null
  return cost
}

/** Resgatada por inteiro ou zerada: sai da carteira, fica só no histórico. */
export function isActive(inv: Pick<PluggyInvestment, 'status' | 'balance'>): boolean {
  return inv.status !== 'TOTAL_WITHDRAWAL' && inv.balance > 0
}

export interface MappedInvestment {
  externalId: string
  type: string
  subtype: string | null
  name: string
  code: string | null
  issuer: string | null
  status: string
  balanceCents: number
  grossCents: number
  costCents: number | null
  quantity: number | null
  rate: number | null
  rateType: string | null
  fixedAnnualRate: number | null
  dueOn: string | null
  purchaseOn: string | null
  positionOn: string | null
}

export function mapInvestment(
  inv: PluggyInvestment,
  movements: readonly PluggyInvestmentTransaction[] | null,
): MappedInvestment {
  const balanceCents = signedCents(inv.balance)
  const active = isActive(inv)
  let costCents: number | null = null
  if (active) {
    if (inv.amountOriginal !== null && inv.amountOriginal > 0) costCents = amountToCents(inv.amountOriginal)
    else if (movements) costCents = averageCostCents(movements, inv.quantity)
  }
  return {
    externalId: inv.id,
    type: inv.type,
    subtype: inv.subtype,
    name: inv.name,
    code: inv.code,
    issuer: inv.issuer,
    status: inv.status ?? 'ACTIVE',
    balanceCents,
    grossCents: inv.amount !== null ? signedCents(inv.amount) : balanceCents,
    costCents,
    quantity: inv.quantity,
    rate: inv.rate,
    rateType: inv.rateType,
    fixedAnnualRate: inv.fixedAnnualRate,
    dueOn: dateOf(inv.dueDate),
    purchaseOn: dateOf(inv.purchaseDate),
    positionOn: dateOf(inv.date),
  }
}

/**
 * De quais investimentos ler as movimentações nesta execução. Primeiro os
 * novos ou que mudaram de estado (um resgate total, por exemplo), depois os
 * ativos, que podem ter aporte ou resgate novo. Resgatado e sem mudança já
 * tem tudo no banco. A ordem garante que o corte por execução nunca deixa
 * uma posição nova sem movimentação para sempre.
 */
export function planMovementFetches<T extends Pick<PluggyInvestment, 'id' | 'status' | 'balance'>>(
  remote: readonly T[],
  /** Por investimento, o estado da última leitura das movimentações (null: nunca lidas). */
  stored: ReadonlyMap<string, { status: string | null }>,
  limit: number,
): { toFetch: T[]; complete: boolean } {
  const changed = remote.filter((i) => stored.get(i.id)?.status !== (i.status ?? 'ACTIVE'))
  const activeKnown = remote.filter((i) => !changed.includes(i) && isActive(i))
  const queue = [...changed, ...activeKnown]
  return { toFetch: queue.slice(0, limit), complete: queue.length <= limit }
}

export interface MappedMovement {
  externalId: string
  type: string
  occurredOn: string
  amountCents: number
  netAmountCents: number | null
}

export function mapMovement(tx: PluggyInvestmentTransaction): MappedMovement | null {
  const occurredOn = dateOf(tx.date)
  if (!occurredOn) return null
  return {
    externalId: tx.id,
    type: tx.type,
    occurredOn,
    amountCents: amountToCents(tx.amount),
    netAmountCents: tx.netAmount === null ? null : amountToCents(tx.netAmount),
  }
}

/* ───────────────────────────── rótulos ───────────────────────────── */

export type InvestmentGroup = 'fixed_income' | 'etf' | 'stocks' | 'reits' | 'funds' | 'pension' | 'other'

export const GROUP_LABELS: Record<InvestmentGroup, string> = {
  fixed_income: 'Renda fixa',
  etf: 'ETFs',
  stocks: 'Ações',
  reits: 'Fundos imobiliários',
  funds: 'Fundos',
  pension: 'Previdência',
  other: 'Outros',
}

export function groupOf(type: string, subtype: string | null): InvestmentGroup {
  if (type === 'FIXED_INCOME') return 'fixed_income'
  if (type === 'ETF') return 'etf'
  if (type === 'EQUITY') return subtype === 'REAL_ESTATE_FUND' ? 'reits' : 'stocks'
  if (type === 'MUTUAL_FUND') return 'funds'
  if (type === 'SECURITY') return 'pension'
  return 'other'
}

const FIXED_INCOME_SUBTYPES: Record<string, string> = {
  CDB: 'CDB',
  RDB: 'RDB',
  LCI: 'LCI',
  LCA: 'LCA',
  LC: 'LC',
  LF: 'LF',
  LIG: 'LIG',
  CRI: 'CRI',
  CRA: 'CRA',
  DEBENTURE: 'Debênture',
}

/** "NU FINANCEIRA S.A. - SOCIEDADE DE CRÉDITO..." → "Nubank". */
export function issuerLabel(issuer: string | null): string | null {
  if (!issuer) return null
  if (/^nu\s|nubank|nu pagamentos/i.test(issuer)) return 'Nubank'
  if (/ita[uú]/i.test(issuer)) return 'Itaú'
  const head = issuer.split(' - ')[0]!.replace(/\s+S\.?A\.?$/i, '').trim()
  return head
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
    .slice(0, 28)
}

/**
 * O nome que cabe numa linha. O nome que a Pluggy manda num CDB do Nubank é
 * "CDB - NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E
 * INVESTIMENTO"; na tela vira "CDB Nubank". Na bolsa vale o código (IVVB11).
 */
export function displayName(inv: Pick<MappedInvestment, 'type' | 'subtype' | 'name' | 'code' | 'issuer'>): string {
  if (inv.type === 'FIXED_INCOME' && inv.subtype && FIXED_INCOME_SUBTYPES[inv.subtype]) {
    const issuer = issuerLabel(inv.issuer)
    return issuer ? `${FIXED_INCOME_SUBTYPES[inv.subtype]} ${issuer}` : FIXED_INCOME_SUBTYPES[inv.subtype]!
  }
  if ((inv.type === 'ETF' || inv.type === 'EQUITY') && inv.code) return inv.code
  return inv.name
}

const percent = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const INDEXERS: Record<string, string> = { CDI: 'CDI', SELIC: 'Selic', IPCA: 'IPCA', IGPM: 'IGP-M', INPC: 'INPC' }

/** "120% do CDI", "IPCA + 6% a.a.", "12,5% a.a."; null quando não há taxa. */
export function rateLabel(inv: Pick<MappedInvestment, 'rate' | 'rateType' | 'fixedAnnualRate'>): string | null {
  const type = inv.rateType?.toUpperCase() ?? null
  const indexer = type && type !== 'PRE' ? (INDEXERS[type] ?? inv.rateType) : null
  const fixed = inv.fixedAnnualRate && inv.fixedAnnualRate > 0 ? inv.fixedAnnualRate : null
  if (indexer && fixed) return `${indexer} + ${percent(fixed)}% a.a.`
  if (indexer && inv.rate && inv.rate > 0) return `${percent(inv.rate)}% ${type === 'SELIC' ? 'da' : 'do'} ${indexer}`
  if (fixed) return `${percent(fixed)}% a.a.`
  return null
}

/* ───────────────────────────── somas ─────────────────────────────── */

/**
 * O que foi guardado em cada mês: aportes menos resgates, pelo dinheiro que
 * de fato saiu ou voltou para a conta. Proventos e impostos não entram: não
 * são decisão de guardar ou tirar.
 */
export interface MonthFlow {
  month: string
  contributionsCents: number
  withdrawalsCents: number
  savedCents: number
}

export function monthlyFlows(
  movements: readonly Pick<MappedMovement, 'type' | 'occurredOn' | 'amountCents' | 'netAmountCents'>[],
  lastMonth: string,
  months: number,
): MonthFlow[] {
  const first = addMonthsToMonth(lastMonth, -(months - 1))
  const byMonth = new Map<string, { in: number; out: number }>()
  for (let i = 0; i < months; i++) byMonth.set(addMonthsToMonth(first, i), { in: 0, out: 0 })
  for (const m of movements) {
    const bucket = byMonth.get(m.occurredOn.slice(0, 7))
    if (!bucket) continue
    if (m.type === 'BUY') bucket.in += m.amountCents
    else if (m.type === 'SELL') bucket.out += m.netAmountCents ?? m.amountCents
  }
  return [...byMonth.entries()].map(([month, f]) => ({
    month,
    contributionsCents: f.in,
    withdrawalsCents: f.out,
    savedCents: f.in - f.out,
  }))
}

type PositionRow = Pick<
  MappedInvestment,
  | 'externalId'
  | 'type'
  | 'subtype'
  | 'name'
  | 'code'
  | 'issuer'
  | 'status'
  | 'balanceCents'
  | 'grossCents'
  | 'costCents'
  | 'quantity'
  | 'rate'
  | 'rateType'
  | 'fixedAnnualRate'
  | 'dueOn'
>

/**
 * O resumo da carteira para a aba: totais, rendimento, divisão por tipo e as
 * posições ativas. O rendimento só soma as posições com custo conhecido, e o
 * percentual é sobre esse mesmo custo, para não comparar coisas diferentes.
 */
export function portfolioSummary(rows: readonly PositionRow[]) {
  const active = rows.filter((r) => r.status !== 'TOTAL_WITHDRAWAL' && r.balanceCents > 0)
  const totalCents = active.reduce((s, r) => s + r.balanceCents, 0)
  const grossCents = active.reduce((s, r) => s + r.grossCents, 0)
  const known = active.filter((r) => r.costCents !== null)
  const costCents = known.reduce((s, r) => s + r.costCents!, 0)
  const profitCents = known.reduce((s, r) => s + r.balanceCents - r.costCents!, 0)

  const groups = new Map<InvestmentGroup, number>()
  for (const r of active) {
    const g = groupOf(r.type, r.subtype)
    groups.set(g, (groups.get(g) ?? 0) + r.balanceCents)
  }

  return {
    totalCents,
    grossCents,
    taxesCents: grossCents - totalCents,
    costCents,
    profitCents,
    profitPercent: costCents > 0 ? (profitCents / costCents) * 100 : null,
    /** Posições sem custo conhecido ficam fora do rendimento. */
    unknownCostCount: active.length - known.length,
    groups: [...groups.entries()]
      .map(([group, cents]) => ({ group, label: GROUP_LABELS[group], totalCents: cents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    positions: active
      .map((r) => ({
        id: r.externalId,
        name: displayName(r),
        group: groupOf(r.type, r.subtype),
        rate: rateLabel(r),
        dueOn: r.dueOn,
        quantity: r.type === 'ETF' || r.type === 'EQUITY' ? r.quantity : null,
        balanceCents: r.balanceCents,
        profitCents: r.costCents === null ? null : r.balanceCents - r.costCents,
      }))
      .sort((a, b) => b.balanceCents - a.balanceCents),
    closedCount: rows.length - active.length,
  }
}

/* ─────────────────────── poupança e reserva ──────────────────────── */

/** Meses fechados usados na taxa de poupança e na média de gastos. */
export const SAVINGS_WINDOW_MONTHS = 3

export interface MonthTotals {
  month: string
  incomeCents: number
  expenseCents: number
}

/** Fração guardada do que entrou; null sem entrada (não há o que dividir). */
export function savingsRate(savedCents: number, incomeCents: number): number | null {
  return incomeCents > 0 ? savedCents / incomeCents : null
}

/**
 * O que a aba mostra junto dos investimentos, cruzando com os lançamentos:
 *
 * - **Taxa de poupança:** quanto do que entrou foi guardado, somando os
 *   últimos meses fechados. Soma antes de dividir: a média das taxas daria
 *   o mesmo peso a um mês de salário e a um mês sem entrada.
 * - **Reserva em meses:** quantos meses dos gastos médios os investimentos
 *   cobrem. Só contam meses fechados com algum gasto: o mês corrente está
 *   pela metade, e um mês sem lançamento é falta de histórico, não um mês
 *   sem gastos.
 */
export function savingsSummary(
  flows: readonly MonthFlow[],
  totals: readonly MonthTotals[],
  investedCents: number,
  currentMonth: string,
  window = SAVINGS_WINDOW_MONTHS,
) {
  const totalsOf = new Map(totals.map((t) => [t.month, t]))
  const closed = flows.filter((f) => f.month < currentMonth).slice(-window)

  const saved = closed.reduce((s, f) => s + f.savedCents, 0)
  const income = closed.reduce((s, f) => s + (totalsOf.get(f.month)?.incomeCents ?? 0), 0)

  const withExpenses = closed
    .map((f) => totalsOf.get(f.month)?.expenseCents ?? 0)
    .filter((cents) => cents > 0)
  const avgExpenseCents = withExpenses.length
    ? Math.round(withExpenses.reduce((s, c) => s + c, 0) / withExpenses.length)
    : null

  return {
    /** Primeiro e último mês da janela, para a legenda ("ago. a out."). */
    fromMonth: closed[0]?.month ?? null,
    toMonth: closed.at(-1)?.month ?? null,
    savedCents: saved,
    incomeCents: income,
    rate: savingsRate(saved, income),
    avgExpenseCents,
    reserveMonths: avgExpenseCents ? investedCents / avgExpenseCents : null,
    /** Taxa de cada mês do gráfico do guardado. */
    monthly: flows.map((f) => {
      const t = totalsOf.get(f.month)
      return { month: f.month, incomeCents: t?.incomeCents ?? 0, rate: savingsRate(f.savedCents, t?.incomeCents ?? 0) }
    }),
  }
}

/* ─────────────────────── rendimento do mês ───────────────────────── */

export interface Snapshot {
  day: string
  investmentsCents: number
}

/** Dias entre duas datas ISO (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * Quanto os investimentos renderam num mês, sem contar o dinheiro que entrou
 * ou saiu: valor no fim − valor no início − (aportes − resgates).
 *
 * O início é a última foto do mês anterior. Sem ela (as fotos começaram no
 * meio do mês), vale a primeira foto do próprio mês, e o resultado sai
 * marcado como parcial. O fim é a última foto do mês.
 *
 * O percentual é o de Dietz modificado: cada aporte ou resgate pesa pela
 * fração do período em que ficou aplicado. Sem isso, um aporte grande no
 * último dia faria o mês parecer render menos do que rendeu.
 *
 * Aportes e resgates são os mesmos do "guardado": a compra pelo valor que
 * saiu da conta, o resgate pelo líquido que voltou. Como o valor das fotos
 * também é o líquido, IR e IOF do resgate não aparecem como rendimento.
 */
export function monthYield(
  snapshots: readonly Snapshot[],
  movements: readonly Pick<MappedMovement, 'type' | 'occurredOn' | 'amountCents' | 'netAmountCents'>[],
  month: string,
) {
  const first = `${month}-01`
  const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day))
  const inMonth = sorted.filter((s) => s.day.slice(0, 7) === month)
  const end = inMonth.at(-1)
  if (!end) return null
  const before = sorted.filter((s) => s.day < first).at(-1)
  const start = before ?? inMonth[0]!
  const span = daysBetween(start.day, end.day)
  if (span <= 0) return null

  let flowsCents = 0
  let weightedFlows = 0
  for (const m of movements) {
    if (m.occurredOn <= start.day || m.occurredOn > end.day) continue
    const flow = m.type === 'BUY' ? m.amountCents : m.type === 'SELL' ? -(m.netAmountCents ?? m.amountCents) : 0
    if (flow === 0) continue
    flowsCents += flow
    weightedFlows += flow * (daysBetween(m.occurredOn, end.day) / span)
  }

  const yieldCents = end.investmentsCents - start.investmentsCents - flowsCents
  const base = start.investmentsCents + weightedFlows
  return {
    month,
    fromDay: start.day,
    toDay: end.day,
    /** Começou no meio do mês: ainda não há foto do fim do mês anterior. */
    partial: !before,
    startCents: start.investmentsCents,
    endCents: end.investmentsCents,
    flowsCents,
    yieldCents,
    percent: base > 0 ? (yieldCents / base) * 100 : null,
  }
}
