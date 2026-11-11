/**
 * Formatação para exibição. Toda entrada e saída é em centavos inteiros — a
 * conversão para reais acontece só aqui, na borda visual.
 */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** '2026-08-29' → '29 de agosto' (o ano só aparece quando não é o corrente). */
export function formatDate(iso: string, currentYear = new Date().getFullYear()): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const base = `${d} de ${MONTHS[m - 1]}`
  return y === currentYear ? base : `${base} de ${y}`
}

/** '2026-11-11T14:02:00Z' → 'há 12 min' / 'há 3 h' / '10 de novembro' */
export function sinceLabel(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return formatDate(new Date(iso).toISOString().slice(0, 10))
}

/** '2026-08' → 'agosto de 2026' */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} de ${y}`
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Hoje no fuso de São Paulo — o mesmo critério que o servidor usa. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function currentMonth(): string {
  return today().slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + delta
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Primeiro e último dia do mês, no formato que a API espera. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

/**
 * Rótulo de grupo do extrato: o DS agrupa por dia e chama os dois primeiros de
 * 'Hoje' e 'Ontem' — a data por extenso só aparece a partir do terceiro.
 */
export function relativeDay(iso: string, reference = today()): string {
  if (iso === reference) return 'Hoje'
  const [y, m, d] = reference.split('-').map(Number) as [number, number, number]
  const previous = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  return iso === previous ? 'Ontem' : formatDate(iso)
}

/**
 * Tom da inicial na lista. O DS não usa cor de categoria: escolhe um degrau da
 * rampa slate. O índice sai do próprio nome para a categoria não trocar de tom
 * a cada render.
 */
export function toneOf(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

/** Variação percentual entre dois meses, para a pílula de tendência do DS. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
