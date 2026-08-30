import { useColorScheme } from 'react-native'

/**
 * Tokens do design system Órbita (artboard 1b do projeto de Design).
 *
 * A paleta inteira sai de lá: #F8FAFC / #0F172A de fundo e tinta, esmeralda
 * #10B981 como único destaque, e coral #EF4444 reservado exclusivamente a ação
 * destrutiva. Nada aqui é escolha nossa — mexer em um valor é mexer no DS.
 */

/** Tinta neutra e coral valem nos dois modos: são papéis, não tons. */
const shared = {
  danger: '#EF4444',
  accent: '#10B981',
}

const light = {
  ...shared,
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#EEF2F6',
  track: '#EEF2F6',
  skeleton: '#E2E8F0',
  border: '#E2E8F0',
  text: '#0F172A',
  text2: '#64748B',
  text3: '#94A3B8',
  accentSoft: 'rgba(16,185,129,0.12)',
  /**
   * O esmeralda puro só bate 3:1 no fundo claro — serve a ícone e chrome, não a
   * número. Todo texto em destaque usa este tom profundo (DS, decisão 06).
   */
  accentText: '#047857',
  navBg: 'rgba(255,255,255,0.92)',
  /** Fundos das iniciais na lista: rampa slate, nunca cor de categoria. */
  avatarFills: ['#E8EDF3', '#EEF2F6', '#EDF1F5', '#E8EDF3'],
  avatarText: '#475569',
  /** Rosca de gastos: destaque + rampa slate, sem legenda arco-íris (decisão 05). */
  chartRamp: ['#10B981', '#94A3B8', '#CBD5E1', '#E2E8F0'],
}

const dark: typeof light = {
  ...shared,
  bg: '#0F172A',
  surface: '#182238',
  surface2: '#1E2A42',
  track: '#22304A',
  skeleton: '#22304A',
  border: 'rgba(248,250,252,0.09)',
  text: '#F8FAFC',
  text2: '#94A3B8',
  text3: '#64748B',
  accentSoft: 'rgba(16,185,129,0.18)',
  accentText: '#6EE7B7',
  navBg: 'rgba(15,23,42,0.92)',
  avatarFills: ['#22304A', '#243349', '#1E2A42', '#22304A'],
  avatarText: '#CBD5E1',
  chartRamp: ['#10B981', '#64748B', '#475569', '#334155'],
}

/** O cartão-herói é tinta escura nos dois modos — é a peça de marca. */
export const inkCard = {
  from: '#1E293B',
  to: '#0F172A',
  text: '#F8FAFC',
  textSoft: 'rgba(248,250,252,0.55)',
}

export type Theme = typeof light

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}

/** Medida horizontal do DS: 20px de margem, seções separadas por 20. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, gutter: 20 }

/**
 * O DS não tem um raio só: cresce com a superfície — ícone 11, campo 14,
 * botão 16, cartão 22. `full` é a pílula.
 */
export const radius = { sm: 11, md: 14, lg: 16, card: 22, full: 99 }

/**
 * Escala tipográfica do DS: 40 / 26 / 19 / 15 / 14,5 / 13 / 11,5.
 *
 * Todo número sai em `tabular-nums` com peso 600–700, para o olho comparar
 * colunas sem reler. Cinza-médio só em rótulo e subtexto, nunca em valor.
 */
export const type = {
  balance: { fontSize: 40, fontWeight: '700', letterSpacing: -1.4, lineHeight: 42 },
  keypad: { fontSize: 44, fontWeight: '700', letterSpacing: -1.6 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.8 },
  heading: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4 },
  section: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  row: { fontSize: 14.5, fontWeight: '500', letterSpacing: -0.2 },
  amount: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 13, letterSpacing: -0.1 },
  caption: { fontSize: 12, letterSpacing: 0 },
  overline: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} as const

/** Números sempre tabulares — o DS pede em todo valor. */
export const tabular = { fontVariant: ['tabular-nums' as const] }
