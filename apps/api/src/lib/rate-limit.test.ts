import { translateRateLimit } from './rate-limit.js'

function tooMany(retryAfter?: string) {
  return new Response(JSON.stringify({ message: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: retryAfter === undefined ? {} : { 'X-Retry-After': retryAfter },
  })
}

const message = async (res: Response) => ((await res.json()) as { message: string }).message

describe('translateRateLimit', () => {
  it('troca a mensagem do 429 e mantém o tempo de espera', async () => {
    const res = translateRateLimit(tooMany('42'))
    expect(res.status).toBe(429)
    expect(res.headers.get('X-Retry-After')).toBe('42')
    expect(await res.json()).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas tentativas. Tente de novo em 42 segundos.',
    })
  })

  it('usa singular para 1 segundo e arredonda janelas longas para um minuto', async () => {
    expect(await message(translateRateLimit(tooMany('1')))).toBe(
      'Muitas tentativas. Tente de novo em 1 segundo.',
    )
    expect(await message(translateRateLimit(tooMany('60')))).toBe(
      'Muitas tentativas. Tente de novo em um minuto.',
    )
  })

  it('sem tempo de espera válido, não inventa um número', async () => {
    expect(await message(translateRateLimit(tooMany()))).toBe(
      'Muitas tentativas. Tente de novo em alguns instantes.',
    )
    expect(await message(translateRateLimit(tooMany('abc')))).toBe(
      'Muitas tentativas. Tente de novo em alguns instantes.',
    )
  })

  it('deixa qualquer outra resposta passar intacta', () => {
    const ok = new Response('{}', { status: 401 })
    expect(translateRateLimit(ok)).toBe(ok)
  })
})
