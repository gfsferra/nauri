/**
 * Converte o retorno de um SUM() do Postgres em centavos.
 *
 * `SUM(bigint)` devolve `numeric`, e o driver entrega isso como STRING para não
 * perder precisão. Sem conversão explícita, `total + outro` concatenaria texto
 * ("100" + "200" = "100200") e o relatório mentiria sem lançar erro nenhum.
 */
export function toCents(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Valor não numérico vindo do banco: ${String(value)}`)
  }
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Total fora da faixa de inteiro seguro: ${String(value)}`)
  }
  return n
}
