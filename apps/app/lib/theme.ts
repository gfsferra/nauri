import { useSyncExternalStore } from 'react'
import { useColorScheme } from 'react-native'

/**
 * Tokens do design system Órbita (artboard 1b do projeto de Design).
 *
 * O modo claro sai de lá: #F8FAFC / #0F172A de fundo e tinta, e coral
 * #EF4444 reservado exclusivamente a ação destrutiva. O destaque, que no
 * artboard era o esmeralda, virou índigo, e o esmeralda ficou só com o
 * sentido de valor positivo (ver o comentário antes de `light`).
 *
 * O modo escuro foi redesenhado (nov/2026): o slate-900 do artboard era um
 * azul-marinho saturado, com superfícies do mesmo matiz que mal se separavam
 * do fundo. Agora segue o padrão dos temas escuros de Linear, Vercel e Apple:
 * base grafite quase preta, elevação por degraus pequenos de luminosidade
 * (sombra não aparece no escuro), bordas translúcidas e texto branco suave.
 * Os papéis não mudam: o esmeralda segue único destaque e o coral, só perigo.
 */

/** Coral vale nos dois modos: é papel, não tom. */
const shared = {
  danger: '#EF4444',
}

/*
 * Destaque e positivo são papéis separados (nov/2026). O esmeralda fazia os
 * dois: era a cor de tudo que se toca (botão, link, aba ativa) e também a de
 * dinheiro entrando, e o olho não distinguia "isto é um botão" de "isto é
 * receita". Agora:
 *   - accent (índigo): marca e interação, nunca valor;
 *   - positive (esmeralda): só valor e sinal positivo (entrada, saldo que
 *     melhorou, gasto que caiu, confirmação de sucesso);
 *   - danger (coral): só ação destrutiva, como antes.
 * Os índigos de preenchimento passam AA com rótulo branco nos dois modos.
 */
const light = {
  ...shared,
  accent: '#4F46E5',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#EEF2F6',
  track: '#EEF2F6',
  skeleton: '#E2E8F0',
  border: '#E2E8F0',
  text: '#0F172A',
  text2: '#64748B',
  text3: '#94A3B8',
  accentSoft: 'rgba(79,70,229,0.10)',
  /** Texto e ícone em destaque: um tom mais profundo, para contraste AA no fundo. */
  accentText: '#4338CA',
  /**
   * O esmeralda puro só bate 3:1 no fundo claro, então todo número positivo
   * usa este tom profundo (DS, decisão 06).
   */
  positive: '#047857',
  positiveSoft: 'rgba(16,185,129,0.12)',
  navBg: 'rgba(255,255,255,0.92)',
  /**
   * Barra de abas flutuante, de vidro: fundo translúcido com desfoque do que
   * passa por baixo (backdrop-filter), borda fina e sombra larga e suave.
   */
  glassBg: 'rgba(255,255,255,0.68)',
  glassBorder: 'rgba(15,23,42,0.08)',
  glassShadow: '0 10px 30px rgba(15,23,42,0.14), 0 1px 2px rgba(15,23,42,0.06)',
  /**
   * Aresta de cima dos cartões. No claro é a mesma borda; no escuro, mais
   * clara que as laterais, como luz vinda de cima: é o que dá corpo à
   * superfície onde a sombra não aparece.
   */
  edgeTop: '#E2E8F0',
  /** Fundos das iniciais na lista: rampa slate, nunca cor de categoria. */
  avatarFills: ['#E8EDF3', '#EEF2F6', '#EDF1F5', '#E8EDF3'],
  avatarText: '#475569',
  /** Rosca de gastos: destaque + rampa slate, sem legenda arco-íris (decisão 05). */
  chartRamp: ['#4F46E5', '#94A3B8', '#CBD5E1', '#E2E8F0'],
  /**
   * Botão desabilitado. `null` = o padrão do DS (o próprio botão a 45%). No
   * escuro o verde a 45% vira um tom lamacento, então lá ele fica neutro.
   */
  disabledButton: null as { fill: string; label: string } | null,
  /**
   * A peça de marca (cartão-herói e quadrado do logo). No claro é a tinta
   * escura do DS, que já contrasta com o fundo. No escuro, a mesma tinta
   * sumiria no fundo: ela sobe um degrau, ganha aresta e um brilho esmeralda.
   */
  ink: {
    from: '#1E293B',
    to: '#0F172A',
    end: '#111C30',
    mark: '#0F172A',
    edge: 'transparent',
    edgeTop: 'transparent',
    glow: null as string | null,
  },
}

const dark: typeof light = {
  ...shared,
  accent: '#5B5CEB',
  bg: '#0B0D12',
  surface: '#13161D',
  surface2: '#1A1E26',
  track: '#20252E',
  skeleton: '#1A1E26',
  border: 'rgba(255,255,255,0.07)',
  edgeTop: 'rgba(255,255,255,0.12)',
  text: '#F2F4F7',
  text2: '#9BA3B1',
  text3: '#646C7A',
  accentSoft: 'rgba(99,102,241,0.16)',
  accentText: '#8B93F8',
  positive: '#34D399',
  positiveSoft: 'rgba(16,185,129,0.14)',
  // Opaco: por trás da barra fica o fundo branco padrão da navegação, e
  // qualquer transparência a acinzentava.
  navBg: '#0F1116',
  glassBg: 'rgba(28,32,41,0.62)',
  glassBorder: 'rgba(255,255,255,0.10)',
  glassShadow: '0 12px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
  avatarFills: ['#1C2029', '#1E232C', '#1A1E26', '#1C2029'],
  avatarText: '#C9D1DC',
  chartRamp: ['#6366F1', '#5B6474', '#3F4653', '#2A303A'],
  disabledButton: { fill: '#1A1E26', label: '#646C7A' },
  ink: {
    from: '#1D222C',
    to: '#13161D',
    end: '#0F1217',
    mark: '#1A1E26',
    edge: 'rgba(255,255,255,0.08)',
    edgeTop: 'rgba(255,255,255,0.16)',
    glow: 'rgba(99,102,241,0.24)',
  },
}

/** Texto sobre a peça de marca: escura nos dois modos, então texto claro. */
export const inkCard = {
  text: '#F8FAFC',
  textSoft: 'rgba(248,250,252,0.55)',
}

export type Theme = typeof light

const noopSubscribe = () => () => {}

/**
 * Tema do aparelho.
 *
 * Na web cada página é pré-renderizada no build, sem saber o tema de quem vai
 * abrir, e sai no claro. Na hidratação o React não corrige atributos que
 * divergem do HTML estático, então uma página aberta direto no modo escuro
 * ficava clara até algo forçar outra renderização. Aqui o tema só vira escuro
 * depois da hidratação: o primeiro render bate com o HTML (claro) e o
 * seguinte, logo em seguida, aplica o tema real. No app nativo não há HTML
 * estático e o valor certo vale desde o primeiro render.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme()
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  return hydrated && scheme === 'dark' ? dark : light
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
