import { useSyncExternalStore } from 'react'

/**
 * Valores ocultos (o olho), um estado só para o app inteiro. Cada tela tinha
 * o seu: escondia-se o saldo na Início e os Relatórios, uma aba ao lado,
 * mostravam tudo.
 *
 * Na web a escolha fica no `localStorage`, para valer também depois de
 * recarregar a página. No nativo vale enquanto o app estiver aberto.
 */
const KEY = 'nauri:valores-ocultos'

function read(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let hidden = read()
const listeners = new Set<() => void>()

export function setHidden(next: boolean): void {
  hidden = next
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Armazenamento bloqueado (aba anônima): segue só na memória.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Na pré-renderização da web é sempre falso, como o tema (ver `useTheme`): o
 * primeiro render bate com o HTML estático e o seguinte aplica a escolha.
 */
export function useHidden(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  )
  return [value, setHidden]
}
