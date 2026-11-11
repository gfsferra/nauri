import type { PluggyInvestment, PluggyInvestmentTransaction } from './investments.js'
import type { PluggyAccountType, PluggyTransaction } from './open-finance.js'

/**
 * Cliente mínimo da API da Pluggy: só as chamadas que a sincronização usa. `fetch` puro, sem SDK, para não puxar dependência de Node para o Worker.
 */

const API = 'https://api.pluggy.ai'

export class PluggyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface PluggyItem {
  id: string
  status: string
  lastUpdatedAt: string | null
  consentExpiresAt: string | null
}

export interface PluggyAccount {
  id: string
  type: PluggyAccountType
  name: string
  /** Conta corrente: o saldo. Cartão: o limite usado. Em reais. */
  balance?: number | null
  /** Só na conta corrente. `transferNumber` é "banco/agência/conta". */
  bankData?: { transferNumber?: string | null } | null
  /** Só no cartão. `balanceDueDate` é o vencimento da fatura mais recente. */
  creditData?: { balanceDueDate?: string | null } | null
}

type Fetch = typeof fetch

/**
 * Autentica e devolve o cliente. A chave de API vale 2 horas; como o Worker
 * não guarda estado entre execuções, cada sincronização pede uma nova. Com
 * uma execução por hora, fica longe do limite do `/auth`.
 */
export async function createPluggyClient(clientId: string, clientSecret: string, fetchImpl: Fetch = fetch) {
  const auth = await fetchImpl(`${API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })
  if (!auth.ok) throw new PluggyError(`Falha na autenticação da Pluggy (${auth.status})`, auth.status)
  const { apiKey } = (await auth.json()) as { apiKey: string }

  async function get<T>(path: string): Promise<T> {
    const res = await fetchImpl(path.startsWith('http') ? path : `${API}${path}`, {
      headers: { 'X-API-KEY': apiKey },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      throw new PluggyError(`Pluggy ${res.status} em ${path.split('?')[0]}: ${body?.message ?? ''}`, res.status)
    }
    return res.json() as Promise<T>
  }

  return {
    item: (itemId: string) => get<PluggyItem>(`/items/${itemId}`),

    accounts: async (itemId: string) =>
      (await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)).results,

    /**
     * Transações de uma conta num intervalo de datas, já seguindo a paginação
     * por cursor da v2 (a v1 foi desativada). A v2 recusa `pageSize`.
     */
    transactions: async (accountId: string, dateFrom: string, dateTo: string) => {
      const all: PluggyTransaction[] = []
      let url: string | null = `/v2/transactions?accountId=${accountId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      // Trava de segurança: um cursor que nunca acaba não pode prender o Worker.
      for (let page = 0; url && page < 50; page++) {
        const body: { results: PluggyTransaction[]; next: string | null } = await get(url)
        all.push(...body.results)
        url = body.next
          ? body.next.startsWith('http') || body.next.startsWith('/')
            ? body.next
            : `/v2/transactions?accountId=${accountId}&dateFrom=${dateFrom}&dateTo=${dateTo}&cursor=${encodeURIComponent(body.next)}`
          : null
      }
      return all
    },

    /** Investimentos de uma conexão, ativos e resgatados (a v1 pagina por número). */
    investments: (itemId: string) => paged<PluggyInvestment>(`/investments?itemId=${itemId}`),

    /** Aportes, resgates e proventos de um investimento (até 12 meses atrás). */
    investmentTransactions: (investmentId: string) =>
      paged<PluggyInvestmentTransaction>(`/investments/${investmentId}/transactions`),
  }

  async function paged<T>(path: string): Promise<T[]> {
    const all: T[] = []
    const sep = path.includes('?') ? '&' : '?'
    // Mesma trava do cursor da v2: nada de laço sem fim dentro do Worker.
    for (let page = 1; page <= 10; page++) {
      const body: { results: T[]; totalPages?: number } = await get(`${path}${sep}pageSize=500&page=${page}`)
      all.push(...body.results)
      if (!body.totalPages || page >= body.totalPages) break
    }
    return all
  }
}

export type PluggyClient = Awaited<ReturnType<typeof createPluggyClient>>
