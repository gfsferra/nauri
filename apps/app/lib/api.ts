import { hc } from 'hono/client'
import { Platform } from 'react-native'
// Só o TIPO cruza a fronteira: o TypeScript enxerga cada rota e cada resposta,
// mas o Metro não empacota uma linha do servidor dentro do app.
import type { AppType } from '@financas/api'
import { authClient } from './auth-client'
import { API_URL } from './config'

const rpc = hc<AppType>(API_URL, {
  fetch: async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)

    // Na web o cookie viaja sozinho. No nativo é preciso anexar o que o
    // SecureStore guardou — e essa leitura é assíncrona, por isso o wrapper
    // inteiro é async.
    if (Platform.OS !== 'web') {
      const cookie = await authClient.getCookie()
      if (cookie) headers.set('Cookie', cookie)
    }

    return fetch(input, { ...init, headers, credentials: 'include' })
  },
})

/** Já ancorado em /api, então as chamadas ficam `client.transactions.$get()`. */
export const client = rpc.api

/** Formato de erro das rotas de domínio. */
type ApiError = { error: string }
/** Formato que o zValidator devolve quando a entrada não passa. */
type ValidationError = { success: false }

/**
 * Descarta os ramos de erro da união que o RPC devolve, sobrando o tipo de
 * sucesso — que é o que a tela realmente consome.
 */
type Success<U> = Exclude<U, ApiError | ValidationError>

type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> }

/**
 * Converte a resposta do RPC em dado ou exceção.
 *
 * O tipo de retorno é DERIVADO da rota, não anotado na tela: mudar o formato de
 * uma resposta no servidor quebra o `tsc` do app na hora, que é justamente o
 * que o monorepo com contrato compartilhado existe para garantir.
 */
export async function unwrap<R extends JsonResponse>(
  response: R,
): Promise<Success<Awaited<ReturnType<R['json']>>>> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null
    throw new Error(body?.error ?? `Falha na requisição (${response.status})`)
  }
  return response.json() as Promise<Success<Awaited<ReturnType<R['json']>>>>
}
