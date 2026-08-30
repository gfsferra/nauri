import { useColorScheme } from 'react-native'

const shared = {
  /** Gasto e ganho nunca se distinguem só pela cor: o sinal e o rótulo vêm
   *  junto, porque cerca de 8% dos homens não separa vermelho de verde. */
  expense: '#dc2626',
  income: '#059669',
  warning: '#f59e0b',
}

const light = {
  ...shared,
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  accent: '#0f172a',
  accentText: '#ffffff',
  inputBg: '#f1f5f9',
}

const dark = {
  ...shared,
  expense: '#f87171',
  income: '#34d399',
  bg: '#0b1120',
  card: '#111827',
  text: '#f1f5f9',
  muted: '#94a3b8',
  border: '#1f2937',
  accent: '#f1f5f9',
  accentText: '#0b1120',
  inputBg: '#1f2937',
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
export const radius = { sm: 8, md: 12, lg: 16, full: 999 }
