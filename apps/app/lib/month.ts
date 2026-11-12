import { useSyncExternalStore } from 'react'
import { currentMonth } from '@/lib/format'

/**
 * O mês escolhido na faixa do topo, um só para o app inteiro. A Início e os
 * Relatórios tinham cada um o seu: escolher outubro numa aba e trocar de aba
 * caía de volta em novembro.
 *
 * Fica só na memória: abrir o app de novo começa no mês de hoje, que é o que
 * se espera ao abrir.
 */
let month: string | null = null
const listeners = new Set<() => void>()

/** Lido na primeira vez que alguém pede, não ao carregar o arquivo. */
function get(): string {
  month ??= currentMonth()
  return month
}

export function setSelectedMonth(next: string): void {
  if (next === get()) return
  month = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSelectedMonth(): [string, (next: string) => void] {
  const value = useSyncExternalStore(subscribe, get, get)
  return [value, setSelectedMonth]
}
