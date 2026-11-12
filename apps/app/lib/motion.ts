import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Animações dos gráficos e números. Ficam fora do `Animated` porque os
 * gráficos são SVG e o driver nativo não chega nos atributos deles.
 */

/** Respeita o "reduzir movimento" do sistema: aí tudo aparece pronto. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduced(value))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced)
    return () => {
      alive = false
      sub?.remove?.()
    }
  }, [])
  return reduced
}

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Progresso de 0 a 1 que recomeça a cada `key`. Os gráficos são SVG e o
 * driver nativo do Animated não chega nos atributos deles, então o progresso
 * vira estado, quadro a quadro, só no componente que anima.
 */
export function useReveal(key: string, { duration = 760, delay = 0 } = {}): number {
  const reduced = useReducedMotion()
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (reduced) {
      setProgress(1)
      return
    }
    let frame = 0
    const start = Date.now() + delay
    setProgress(0)
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / duration))
      setProgress(easeOut(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [key, reduced, duration, delay])
  return progress
}

/** Vai do valor anterior até o novo, em vez de saltar. */
export function useTween(target: number, duration = 620): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(target)
  const shown = useRef(target)
  useEffect(() => {
    if (reduced) {
      shown.current = target
      setValue(target)
      return
    }
    const from = shown.current
    const start = Date.now()
    let frame = 0
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const next = from + (target - from) * easeOut(t)
      shown.current = next
      setValue(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, reduced, duration])
  return value
}
