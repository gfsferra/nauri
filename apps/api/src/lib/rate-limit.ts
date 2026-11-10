/**
 * O rate limit do Better Auth responde 429 com uma mensagem fixa em inglês. O
 * app mostra o `message` da resposta como está, então trocamos pelo texto em
 * português e mantemos o `X-Retry-After` (segundos até liberar).
 *
 * Qualquer outra resposta passa intacta.
 */
export function translateRateLimit(res: Response): Response {
  if (res.status !== 429) return res

  const retryAfter = Number(res.headers.get('X-Retry-After'))
  const wait =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter === 1
        ? '1 segundo'
        : retryAfter < 60
          ? `${retryAfter} segundos`
          : 'um minuto'
      : 'alguns instantes'

  const headers = new Headers(res.headers)
  headers.set('Content-Type', 'application/json')
  headers.delete('Content-Length')

  // Mesmo formato de erro do Better Auth ({ code, message }).
  return new Response(
    JSON.stringify({ code: 'TOO_MANY_REQUESTS', message: `Muitas tentativas. Tente de novo em ${wait}.` }),
    { status: 429, headers },
  )
}
