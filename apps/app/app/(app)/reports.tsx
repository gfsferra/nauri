import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import {
  Card,
  CategoryIcon,
  EmptyState,
  ErrorBanner,
  EyeToggle,
  Gutter,
  Screen,
  Skeleton,
  SkeletonRow,
  mask,
  useTabBarSpace,
} from '@/components/ui'
import { CountUp, Figure, Segmented } from '@/components/metrics'
import { MonthStrip } from '@/components/month-strip'
import { client, unwrap } from '@/lib/api'
import {
  addMonths,
  capitalize,
  currentMonth,
  formatBRL,
  formatMonth,
  monthBounds,
  percentDelta,
  relativeDay,
  today,
} from '@/lib/format'
import { useReveal, useTween } from '@/lib/motion'
import { useHidden } from '@/lib/privacy'
import { radius, spacing, tabular, type, useTheme } from '@/lib/theme'

type Kind = 'expense' | 'income'

/** Quantos meses o gráfico de evolução mostra, e quantos a API devolve. */
const TREND = 12
const HISTORY = 24

/** 'novembro de 2026' → 'novembro'. */
const monthName = (month: string) => formatMonth(month).replace(/ de \d{4}$/, '')
/** 'novembro de 2026' → 'nov'. */
const shortMonth = (month: string) => formatMonth(month).slice(0, 3)
/** "R$ 1.234,56" sem os centavos, para rótulo de gráfico e frase. */
const roundBRL = (cents: number) => formatBRL(Math.round(cents / 100) * 100).replace(/,00$/, '')

/** Teto de páginas de 100 ao trazer os lançamentos do mês: 1.000 por mês. */
const MAX_PAGES = 10

async function fetchPage(query: { from: string; to: string; kind: Kind; cursor?: string }) {
  return unwrap(await client.transactions.$get({ query: { ...query, limit: '100' } }))
}
type Tx = Awaited<ReturnType<typeof fetchPage>>['items'][number]

/**
 * Todos os lançamentos do mês de um tipo. A API pagina de 100 em 100; aqui as
 * páginas são juntadas, porque "os maiores do mês" precisa ver o mês inteiro,
 * e não só os 100 mais recentes.
 */
async function fetchMonth(month: string, kind: Kind): Promise<Tx[]> {
  const { from, to } = monthBounds(month)
  const items: Tx[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage({ from, to, kind, ...(cursor ? { cursor } : {}) })
    items.push(...result.items)
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return items
}

export default function Reports() {
  const theme = useTheme()
  const tabBarSpace = useTabBarSpace()
  const now = currentMonth()

  const [month, setMonth] = useState(now)
  const [kind, setKind] = useState<Kind>('expense')
  const [hidden] = useHidden()
  /** Valor em reais, ou bolinhas quando o olho está fechado. */
  const brl = (cents: number) => mask(formatBRL(cents), hidden)
  const previous = addMonths(month, -1)
  // No mês corrente, o anterior entra só até o mesmo dia: comparar 11 dias de
  // novembro com outubro inteiro faria todo mês parecer econômico.
  const day = Number(today().slice(8, 10))
  const partial = month === now
  const previousRange = (() => {
    const bounds = monthBounds(previous)
    if (!partial) return bounds
    const last = Number(bounds.to.slice(8, 10))
    return { from: bounds.from, to: `${previous}-${String(Math.min(day, last)).padStart(2, '0')}` }
  })()
  const against = partial
    ? `1–${previousRange.to.slice(8, 10).replace(/^0/, '')} ${shortMonth(previous)}`
    : shortMonth(previous)

  // Trocar de mês desliza o número no sentido da troca, como na Início.
  const direction = useRef(0)
  const slide = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  function goTo(next: string) {
    if (next === month) return
    direction.current = next > month ? 1 : -1
    setMonth(next)
  }
  useEffect(() => {
    if (!direction.current) return
    slide.setValue(direction.current * 28)
    fade.setValue(0)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [month, slide, fade])

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -50) goTo(addMonths(month, 1))
          else if (g.dx > 50) goTo(addMonths(month, -1))
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month],
  )

  const byCategory = useQuery({
    queryKey: ['by-category', month, kind],
    queryFn: async () => {
      const { from, to } = monthBounds(month)
      return unwrap(await client.reports['by-category'].$get({ query: { from, to, kind } }))
    },
  })
  // O mês anterior por categoria dá a variação de cada linha e os destaques.
  const byCategoryBefore = useQuery({
    queryKey: ['by-category', previous, kind, previousRange.to],
    queryFn: async () => {
      const { from, to } = previousRange
      return unwrap(await client.reports['by-category'].$get({ query: { from, to, kind } }))
    },
  })
  // Mesma chave da Início: o cache é um só.
  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month } })),
  })
  // O mês corrente leva a previsão por cima da barra dele no gráfico.
  const summaryNow = useQuery({
    queryKey: ['summary', now],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month: now } })),
  })
  // Os lançamentos do mês alimentam a categoria aberta e os maiores do mês.
  // A chave começa como a da Início: excluir um lançamento lá invalida aqui.
  const txs = useQuery({
    queryKey: ['transactions', month, 'all', kind],
    queryFn: () => fetchMonth(month, kind),
  })
  const monthly = useQuery({
    queryKey: ['monthly', HISTORY],
    queryFn: async () => unwrap(await client.reports.monthly.$get({ query: { months: String(HISTORY) } })),
  })

  const rows = useMemo(
    () => [...(byCategory.data ?? [])].sort((a, b) => b.totalCents - a.totalCents),
    [byCategory.data],
  )
  const beforeById = useMemo(
    () => new Map((byCategoryBefore.data ?? []).map((r) => [r.categoryId, r.totalCents])),
    [byCategoryBefore.data],
  )
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0)
  const count = rows.reduce((sum, row) => sum + row.transactionCount, 0)

  const valueOf = (s: { incomeCents: number; expenseCents: number }) =>
    kind === 'expense' ? s.expenseCents : s.incomeCents
  const forecastOf = (s: { forecastIncomeCents: number; forecastExpenseCents: number }) =>
    kind === 'expense' ? s.forecastExpenseCents : s.forecastIncomeCents

  const series = monthly.data ?? []
  const beforeTotal = (byCategoryBefore.data ?? []).reduce((sum, row) => sum + row.totalCents, 0)
  const delta = byCategoryBefore.data && total > 0 ? percentDelta(total, beforeTotal) : null
  const forecast = summary.data ? forecastOf(summary.data) : 0

  // Média por dia: no mês corrente, pelos dias que já passaram.
  const days = month > now ? 0 : partial ? day : Number(monthBounds(month).to.slice(8, 10))

  // Gráfico de 12 meses: fica parado enquanto o mês escolhido estiver dentro
  // dele, e só o destaque anda. Fora da janela, ela acompanha o mês.
  const windowEnd =
    month > now ? month : month > addMonths(now, -TREND) ? now : addMonths(month, TREND - 1)
  const trend = useMemo(() => {
    const found = new Map(series.map((m) => [m.month, m]))
    return Array.from({ length: TREND }, (_, i) => {
      const m = addMonths(windowEnd, i - (TREND - 1))
      const row = found.get(m)
      return {
        month: m,
        cents: row ? valueOf(row) : 0,
        forecast: m === now && summaryNow.data ? forecastOf(summaryNow.data) : 0,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, windowEnd, kind, summaryNow.data, now])

  /* A categoria em foco na rosca. Começa na maior e volta a ela a cada troca
     de mês ou de tipo. */
  const [focus, setFocus] = useState<string | null>(null)
  // A categoria aberta, com os lançamentos dela à mostra.
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    setFocus(null)
    setOpen(null)
  }, [month, kind])
  const focused = rows.find((r) => r.categoryId === focus) ?? rows[0] ?? null
  function pick(id: string) {
    // O primeiro toque já foca e abre; tocar de novo na aberta fecha.
    if (focused?.categoryId === id) setOpen(open === id ? null : id)
    else {
      setFocus(id)
      setOpen(id)
    }
  }

  const txsByCategory = useMemo(() => {
    const map = new Map<string, Tx[]>()
    for (const tx of txs.data ?? []) {
      const list = map.get(tx.categoryId)
      if (list) list.push(tx)
      else map.set(tx.categoryId, [tx])
    }
    return map
  }, [txs.data])
  const largest = useMemo(
    () => [...(txs.data ?? [])].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5),
    [txs.data],
  )

  const insights = useMemo(
    () =>
      buildInsights({
        rows,
        beforeById,
        total,
        kind,
        month,
        now,
        forecast,
        money: (cents: number) => mask(roundBRL(cents), hidden),
        against: partial ? `1 a ${Math.min(day, Number(monthBounds(previous).to.slice(8, 10)))} de ${monthName(previous)}` : monthName(previous),
      }),
    [rows, beforeById, total, kind, month, now, forecast, previous, partial, day, hidden],
  )

  const loading = byCategory.isPending
  const error =
    byCategory.error?.message ?? summary.error?.message ?? monthly.error?.message ?? txs.error?.message

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace, gap: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={byCategory.isRefetching}
            onRefresh={() => {
              byCategory.refetch()
              byCategoryBefore.refetch()
              summary.refetch()
              monthly.refetch()
              txs.refetch()
            }}
          />
        }
      >
        {/* ── a faixa de meses, a mesma da Início ── */}
        <MonthStrip month={month} onChange={goTo} />

        <Gutter style={{ gap: spacing.xl }}>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Gastos', icon: 'arrow-down' },
              { value: 'income', label: 'Entradas', icon: 'arrow-up', tint: theme.positive },
            ]}
          />

          {/* ── o número do mês ── */}
          <Animated.View {...swipe.panHandlers} style={{ opacity: fade, transform: [{ translateX: slide }] }}>
            <Text style={{ ...type.caption, color: theme.text2 }}>
              {kind === 'expense' ? 'Gastos' : 'Entradas'} em {monthName(month)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {loading ? (
                  <Skeleton width={220} height={38} style={{ borderRadius: 10, marginTop: 6 }} />
                ) : (
                  <CountUp cents={total} hidden={hidden} />
                )}
              </View>
              {/* O mesmo olho da Início, e o mesmo estado: esconder lá esconde aqui. */}
              <EyeToggle />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 10 }}>
              {delta !== null ? <DeltaPill delta={delta} kind={kind} against={against} /> : null}
              {forecast > 0 ? (
                <Text style={{ ...type.caption, color: theme.text2 }}>
                  + <Text style={[{ fontWeight: '600', color: theme.text }, tabular]}>{brl(forecast)}</Text>{' '}
                  {kind === 'expense' ? 'previstos até o fim do mês' : 'previstos para cair'}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
              {kind === 'expense' ? (
                <Figure label="Por dia" value={loading ? null : days > 0 ? brl(Math.round(total / days)) : '—'} />
              ) : (
                // Nas entradas, a média por dia não diz nada; o que sobrou, sim.
                <Figure
                  label="Sobrou no mês"
                  value={
                    summary.data
                      ? `${summary.data.balanceCents < 0 ? '−' : ''}${brl(Math.abs(summary.data.balanceCents))}`
                      : null
                  }
                />
              )}
              <Figure label="Lançamentos" value={loading ? null : String(count)} />
              <Figure label="Categorias" value={loading ? null : String(rows.length)} />
            </View>
          </Animated.View>

          <ErrorBanner message={error} />

          {/* ── evolução ── */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ ...type.section, color: theme.text }}>Últimos 12 meses</Text>
              <TrendAverage trend={trend} now={now} hidden={hidden} />
            </View>
            <TrendChart
              trend={trend}
              selected={month}
              now={now}
              loading={monthly.isPending}
              hidden={hidden}
              onPick={goTo}
            />
          </Card>

          {/* ── destaques ── */}
          {!loading && insights.length ? (
            <View style={{ gap: spacing.md }}>
              <Text style={{ ...type.section, color: theme.text }}>Destaques</Text>
              <View style={{ gap: spacing.sm }}>
                {insights.map((insight, i) => (
                  <InsightRow key={insight.key} insight={insight} index={i} />
                ))}
              </View>
            </View>
          ) : null}

          {/* ── por categoria ── */}
          {loading ? (
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
                <View
                  style={{
                    width: DONUT,
                    height: DONUT,
                    borderRadius: DONUT / 2,
                    borderWidth: STROKE,
                    borderColor: theme.skeleton,
                  }}
                />
              </View>
              <View style={{ gap: 14, marginTop: spacing.xl }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={12} delay={i * 90} />
                ))}
              </View>
            </Card>
          ) : rows.length === 0 ? (
            <EmptyState
              title={`Sem ${kind === 'expense' ? 'gastos' : 'entradas'} em ${formatMonth(month)}.`}
              hint={
                kind === 'expense'
                  ? 'Assim que houver lançamentos de saída, a divisão por categoria aparece aqui.'
                  : 'Assim que cair alguma entrada, a divisão por categoria aparece aqui.'
              }
            />
          ) : (
            <Card style={{ paddingHorizontal: 0, paddingBottom: spacing.sm }}>
              <View style={{ paddingHorizontal: 18 }}>
                <Text style={{ ...type.section, color: theme.text }}>
                  {kind === 'expense' ? 'Para onde foi' : 'De onde veio'}
                </Text>
                <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }}>
                  Toque numa categoria para ver os lançamentos dela
                </Text>
              </View>

              <Donut
                rows={rows}
                total={total}
                focused={focused}
                hidden={hidden}
                revealKey={`${month}:${kind}`}
              />

              <View style={{ marginTop: spacing.sm }}>
                {rows.map((row, i) => (
                  <CategoryRow
                    key={row.categoryId}
                    row={row}
                    total={total}
                    before={beforeById.get(row.categoryId)}
                    hasBefore={!!byCategoryBefore.data}
                    against={against}
                    kind={kind}
                    selected={focused?.categoryId === row.categoryId}
                    expanded={open === row.categoryId}
                    transactions={txs.isPending ? null : (txsByCategory.get(row.categoryId) ?? [])}
                    hidden={hidden}
                    onPress={() => pick(row.categoryId)}
                    index={i}
                    revealKey={`${month}:${kind}`}
                  />
                ))}
              </View>
            </Card>
          )}

          {/* ── os maiores do mês ── */}
          {txs.isPending ? (
            <Card style={{ gap: spacing.sm }}>
              {[0, 1, 2].map((i) => (
                <SkeletonRow key={i} delay={i * 100} />
              ))}
            </Card>
          ) : largest.length ? (
            <Largest items={largest} total={total} kind={kind} hidden={hidden} />
          ) : null}
        </Gutter>
      </ScrollView>
    </Screen>
  )
}

/* ─────────────────────────────── topo ─────────────────────────────── */

/**
 * Pílula de variação. Gasto que caiu e entrada que subiu são boas notícias e
 * ficam no verde; o contrário fica neutro: gasto maior não é erro (DS, 01).
 */
function DeltaPill({ delta, kind, against }: { delta: number; kind: Kind; against: string }) {
  const theme = useTheme()
  const good = kind === 'expense' ? delta < 0 : delta > 0
  const flat = Math.abs(delta) < 0.5
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 26,
        paddingHorizontal: 10,
        borderRadius: radius.full,
        backgroundColor: flat ? theme.surface2 : good ? theme.positiveSoft : theme.surface2,
      }}
    >
      <Ionicons
        name={flat ? 'remove' : delta > 0 ? 'trending-up' : 'trending-down'}
        size={14}
        color={flat ? theme.text2 : good ? theme.positive : theme.text}
      />
      <Text
        style={[
          { ...type.caption, fontWeight: '600', color: flat ? theme.text2 : good ? theme.positive : theme.text },
          tabular,
        ]}
      >
        {flat ? 'igual a' : `${Math.abs(delta).toFixed(0)}% ${delta > 0 ? 'acima de' : 'abaixo de'}`} {against}
      </Text>
    </View>
  )
}

/* ───────────────────────────── evolução ───────────────────────────── */

const BARS_HEIGHT = 128
const BAR_GAP = 5

type TrendPoint = { month: string; cents: number; forecast: number }

/** Média dos meses que já passaram e tiveram movimento. */
function averageOf(trend: TrendPoint[], now: string): number {
  const past = trend.filter((p) => p.month <= now && p.cents > 0)
  return past.length ? past.reduce((s, p) => s + p.cents, 0) / past.length : 0
}

function TrendAverage({ trend, now, hidden }: { trend: TrendPoint[]; now: string; hidden: boolean }) {
  const theme = useTheme()
  const average = averageOf(trend, now)
  if (!average) return null
  return (
    <Text style={{ ...type.caption, color: theme.text2 }}>
      média <Text style={[{ fontWeight: '600', color: theme.text }, tabular]}>{mask(roundBRL(average), hidden)}</Text>
    </Text>
  )
}

/** Retângulo com a ponta de cima arredondada. */
function barPath(x: number, y: number, w: number, h: number, round = true): string {
  if (h <= 0) return ''
  const r = round ? Math.min(5, w / 2, h) : 0
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

/**
 * Barras dos 12 meses. O mês escolhido fica no destaque e os outros no tom
 * da rampa; no mês corrente, o previsto empilha por cima, mais claro. Tocar
 * numa barra leva a tela inteira para aquele mês.
 */
function TrendChart({
  trend,
  selected,
  now,
  loading,
  hidden,
  onPick,
}: {
  trend: TrendPoint[]
  selected: string
  now: string
  loading: boolean
  hidden: boolean
  onPick: (month: string) => void
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const grow = useReveal(`${trend[0]?.month}:${loading}:${trend.map((p) => p.cents).join(',')}`, { duration: 820 })
  const max = Math.max(1, ...trend.map((p) => p.cents + p.forecast))
  const average = averageOf(trend, now)
  const barW = width > 0 ? (width - BAR_GAP * (trend.length - 1)) / trend.length : 0
  const scale = (cents: number) => (cents / max) * (BARS_HEIGHT - 8)
  const avgY = BARS_HEIGHT - scale(average)

  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={{ height: BARS_HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={BARS_HEIGHT}>
            {trend.map((p, i) => {
              const x = i * (barW + BAR_GAP)
              const isSelected = p.month === selected
              // Cada barra cresce um tico depois da vizinha: a onda vai da
              // esquerda para a direita.
              const local = Math.min(1, Math.max(0, grow * 1.6 - (i / trend.length) * 0.6))
              const h = loading ? BARS_HEIGHT * 0.25 : scale(p.cents) * local
              const fh = loading ? 0 : scale(p.forecast) * local
              const fill = loading ? theme.skeleton : isSelected ? theme.accent : theme.chartRamp[2]
              return (
                <G key={p.month}>
                  {/* Trilho do mês vazio: sem ele, a falta de barra parece falha. */}
                  <Path d={barPath(x, BARS_HEIGHT - 3, barW, 3, false)} fill={theme.track} />
                  {fh > 0 ? (
                    <Path
                      d={barPath(x, BARS_HEIGHT - h - fh, barW, fh)}
                      fill={isSelected ? theme.accent : theme.chartRamp[2]}
                      opacity={0.32}
                    />
                  ) : null}
                  <Path d={barPath(x, BARS_HEIGHT - h, barW, h, fh <= 0)} fill={fill} />
                </G>
              )
            })}
            {average > 0 && !loading ? (
              <Line
                x1={0}
                x2={width}
                y1={avgY}
                y2={avgY}
                stroke={theme.text3}
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={grow}
              />
            ) : null}
          </Svg>
        ) : null}

        {/* Faixas de toque por cima das barras, uma por mês. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: BAR_GAP }}>
          {trend.map((p) => (
            <Pressable
              key={p.month}
              onPress={() => onPick(p.month)}
              accessibilityRole="button"
              accessibilityLabel={`${formatMonth(p.month)}: ${hidden ? 'valor oculto' : formatBRL(p.cents)}`}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: BAR_GAP, marginTop: 8 }}>
        {trend.map((p) => {
          const isSelected = p.month === selected
          return (
            <Text
              key={p.month}
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 10.5,
                letterSpacing: -0.1,
                fontWeight: isSelected ? '700' : '500',
                color: isSelected ? theme.accentText : p.month === now ? theme.text : theme.text3,
              }}
            >
              {shortMonth(p.month)}
            </Text>
          )
        })}
      </View>
    </View>
  )
}

/* ────────────────────────────── rosca ─────────────────────────────── */

const DONUT = 200
const RADIUS = 80
const STROKE = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** O respiro entre fatias. */
const GAP = 3
/** Fatias nomeadas na rosca; o resto vira uma só, 'Outras'. */
const NAMED = 5

type Row = {
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string | null
  totalCents: number
  transactionCount: number
}

/**
 * A rosca do mês. Fica toda no tom neutro e só a categoria em foco acende no
 * destaque, mais grossa: uma cor só, como pede o DS (decisão 05), e o olho
 * vai direto para a fatia de que se está falando.
 */
function Donut({
  rows,
  total,
  focused,
  hidden,
  revealKey,
}: {
  rows: Row[]
  total: number
  focused: Row | null
  hidden: boolean
  revealKey: string
}) {
  const theme = useTheme()
  const sweep = useReveal(revealKey, { duration: 900 })

  const slices = useMemo(() => {
    const named = rows.slice(0, NAMED).map((r) => ({ key: r.categoryId, ids: [r.categoryId], cents: r.totalCents }))
    const rest = rows.slice(NAMED)
    if (rest.length) {
      named.push({
        key: 'outras',
        ids: rest.map((r) => r.categoryId),
        cents: rest.reduce((s, r) => s + r.totalCents, 0),
      })
    }
    return named
  }, [rows])

  const share = focused && total > 0 ? focused.totalCents / total : 0
  const shownShare = useTween(share * 100, 420)
  const drawn = CIRCUMFERENCE * sweep
  const c = DONUT / 2

  let offset = 0
  return (
    <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
      <View style={{ width: DONUT, height: DONUT }}>
        <Svg width={DONUT} height={DONUT}>
          {/* -90° põe a primeira fatia no topo. O pivô vai dentro do próprio
              `rotate()`: o prop `rotation` do react-native-svg vira, na web,
              um `transform-origin` que o React DOM recusa. */}
          <G transform={`rotate(-90 ${c} ${c})`}>
            <Circle cx={c} cy={c} r={RADIUS} fill="none" stroke={theme.track} strokeWidth={STROKE} />
            {slices.map((slice, i) => {
              const length = (slice.cents / total) * CIRCUMFERENCE
              const start = offset
              offset += length
              // Só a parte da fatia que a varredura já alcançou.
              const visible = Math.max(0, Math.min(length, drawn - start))
              const active = !!focused && slice.ids.includes(focused.categoryId)
              const gap = slices.length > 1 ? GAP : 0
              if (visible <= gap) return null
              return (
                <Circle
                  key={slice.key}
                  cx={c}
                  cy={c}
                  r={RADIUS}
                  fill="none"
                  stroke={active ? theme.accent : theme.chartRamp[i % 2 === 0 ? 2 : 1]}
                  strokeWidth={active ? STROKE + 8 : STROKE}
                  strokeLinecap="butt"
                  strokeDasharray={`${visible - gap} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-start}
                />
              )
            })}
          </G>
        </Svg>

        {/* O centro diz de que fatia se está falando. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}
        >
          {focused ? (
            <>
              <CategoryIcon icon={focused.categoryIcon} color={focused.categoryColor} size={30} />
              <Text style={{ ...type.caption, color: theme.text2, marginTop: 6 }} numberOfLines={1}>
                {focused.categoryName}
              </Text>
              <Text style={[{ fontSize: 26, fontWeight: '700', letterSpacing: -0.8, color: theme.text }, tabular]}>
                {Math.round(shownShare)}%
              </Text>
              <Text style={[{ ...type.caption, fontWeight: '600', color: theme.text2 }, tabular]} numberOfLines={1}>
                {mask(formatBRL(focused.totalCents), hidden)}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/* ──────────────────────────── categorias ──────────────────────────── */

function CategoryRow({
  row,
  total,
  before,
  hasBefore,
  against,
  kind,
  selected,
  expanded,
  transactions,
  hidden,
  onPress,
  index,
  revealKey,
}: {
  row: Row
  total: number
  before: number | undefined
  hasBefore: boolean
  against: string
  kind: Kind
  selected: boolean
  expanded: boolean
  /** Os lançamentos da categoria no mês; `null` enquanto carregam. */
  transactions: Tx[] | null
  hidden: boolean
  onPress: () => void
  index: number
  revealKey: string
}) {
  const theme = useTheme()
  // As barras enchem em cascata, uma linha depois da outra.
  const fill = useReveal(revealKey, { duration: 700, delay: 120 + Math.min(index, 8) * 45 })
  const share = total > 0 ? row.totalCents / total : 0
  const change = before !== undefined ? percentDelta(row.totalCents, before) : null
  const good = change !== null && (kind === 'expense' ? change < 0 : change > 0)

  let trend: { text: string; color: string } | null = null
  if (hasBefore && before === undefined) trend = { text: `novo vs ${against}`, color: theme.text2 }
  else if (change !== null && Math.abs(change) >= 1) {
    trend = {
      text: `${change > 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(0)}% vs ${against}`,
      color: good ? theme.positive : theme.text2,
    }
  }

  // A seta gira meia volta ao abrir.
  const turn = useRef(new Animated.Value(expanded ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(turn, { toValue: expanded ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }, [expanded, turn])

  return (
    <View
      style={{
        marginHorizontal: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: selected ? theme.accentSoft : 'transparent',
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected, expanded }}
        accessibilityLabel={`${row.categoryName}, ${hidden ? 'valor oculto' : formatBRL(row.totalCents)}, ${Math.round(share * 100)}%`}
        accessibilityHint={expanded ? 'Toque para fechar os lançamentos' : 'Toque para ver os lançamentos'}
        style={({ pressed }) => ({
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderRadius: radius.lg,
          backgroundColor: !selected && pressed ? theme.surface2 : 'transparent',
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <CategoryIcon icon={row.categoryIcon} color={row.categoryColor} size={38} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text style={{ ...type.row, color: theme.text, flex: 1 }} numberOfLines={1}>
                {row.categoryName}
              </Text>
              <Text style={[{ ...type.amount, color: theme.text }, tabular]}>
                {mask(formatBRL(row.totalCents), hidden)}
              </Text>
            </View>
            <View style={{ height: 5, borderRadius: radius.full, backgroundColor: theme.track, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(share * 100 * fill, share > 0 ? 1.5 : 0)}%`,
                  height: '100%',
                  borderRadius: radius.full,
                  backgroundColor: selected ? theme.accent : theme.chartRamp[1],
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ ...type.caption, color: theme.text2, flex: 1 }} numberOfLines={1}>
                {row.transactionCount} lançamento{row.transactionCount === 1 ? '' : 's'}
                {trend ? <Text style={{ color: trend.color }}> · {trend.text}</Text> : null}
              </Text>
              <Text style={[{ ...type.caption, fontWeight: '600', color: theme.text2 }, tabular]}>
                {Math.round(share * 100)}%
              </Text>
              <Animated.View
                style={{
                  transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
                }}
              >
                <Ionicons name="chevron-down" size={14} color={selected ? theme.accentText : theme.text3} />
              </Animated.View>
            </View>
          </View>
        </View>
      </Pressable>

      {expanded ? <CategoryTransactions transactions={transactions} kind={kind} hidden={hidden} /> : null}
    </View>
  )
}

/** Quantos lançamentos a categoria aberta mostra antes do "mostrar mais". */
const PREVIEW = 5

/**
 * Os lançamentos da categoria aberta, do mais recente para o mais antigo. A
 * lista fica recuada até o texto da linha, para ler como parte dela.
 */
function CategoryTransactions({
  transactions,
  kind,
  hidden,
}: {
  transactions: Tx[] | null
  kind: Kind
  hidden: boolean
}) {
  const theme = useTheme()
  const [all, setAll] = useState(false)
  const rise = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [rise])

  const shown = transactions ? (all ? transactions : transactions.slice(0, PREVIEW)) : []
  const rest = transactions ? transactions.length - shown.length : 0

  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
        paddingLeft: 60,
        paddingRight: 10,
        paddingBottom: 8,
      }}
    >
      {transactions === null ? (
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <Skeleton width="80%" height={10} />
          <Skeleton width="60%" height={10} delay={90} />
        </View>
      ) : transactions.length === 0 ? (
        <Text style={{ ...type.caption, color: theme.text2, paddingVertical: 8 }}>
          Nenhum lançamento encontrado.
        </Text>
      ) : (
        <>
          {shown.map((tx) => (
            <View
              key={tx.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.body, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                  {tx.description || 'Sem descrição'}
                </Text>
                <Text style={{ ...type.caption, color: theme.text2, marginTop: 1 }} numberOfLines={1}>
                  {relativeDay(tx.occurredOn)}
                  {tx.isPending ? ' · pendente' : ''}
                </Text>
              </View>
              <Text
                style={[
                  { ...type.body, fontWeight: '600', color: kind === 'income' ? theme.positive : theme.text },
                  tabular,
                ]}
              >
                {kind === 'income' ? '+ ' : ''}
                {mask(formatBRL(tx.amountCents), hidden)}
              </Text>
            </View>
          ))}
          {rest > 0 || all ? (
            <Pressable
              onPress={() => setAll((v) => !v)}
              accessibilityRole="button"
              hitSlop={6}
              style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border }}
            >
              <Text style={{ ...type.caption, fontWeight: '600', color: theme.accentText }}>
                {all ? 'Mostrar menos' : `Mostrar mais ${rest}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Animated.View>
  )
}

/* ─────────────────────────── os maiores ──────────────────────────── */

/**
 * Os cinco maiores lançamentos do mês. A visão por categoria diz para onde o
 * dinheiro foi; esta diz o que pesou, que a soma por categoria esconde.
 */
function Largest({ items, total, kind, hidden }: { items: Tx[]; total: number; kind: Kind; hidden: boolean }) {
  const theme = useTheme()
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ ...type.section, color: theme.text }}>
        {kind === 'expense' ? 'Maiores gastos' : 'Maiores entradas'}
      </Text>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
        {items.map((tx, i) => (
          <View
            key={tx.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: 60,
              paddingVertical: 8,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: theme.border,
            }}
          >
            <CategoryIcon icon={tx.categoryIcon} color={tx.categoryColor} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
                {tx.description || tx.categoryName}
              </Text>
              <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
                {tx.categoryName} · {relativeDay(tx.occurredOn)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  { ...type.amount, color: kind === 'income' ? theme.positive : theme.text },
                  tabular,
                ]}
              >
                {kind === 'income' ? '+ ' : ''}
                {mask(formatBRL(tx.amountCents), hidden)}
              </Text>
              {total > 0 ? (
                <Text style={[{ ...type.caption, color: theme.text2, marginTop: 2 }, tabular]}>
                  {Math.max(1, Math.round((tx.amountCents / total) * 100))}% do mês
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>
    </View>
  )
}

/* ──────────────────────────── destaques ───────────────────────────── */

type Insight = {
  key: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'accent' | 'positive' | 'neutral'
  title: string
  detail: string
}

/**
 * Frases curtas tiradas dos próprios números: o que mais pesou, o que mais
 * mudou e onde o mês deve fechar. Só entra o que tiver dado para sustentar.
 */
function buildInsights({
  rows,
  beforeById,
  total,
  kind,
  month,
  now,
  forecast,
  money,
  against,
}: {
  rows: Row[]
  beforeById: Map<string, number>
  total: number
  kind: Kind
  month: string
  now: string
  forecast: number
  /** Reais arredondados, ou bolinhas com o olho fechado. */
  money: (cents: number) => string
  /** 'outubro', ou '1 a 11 de outubro' no mês corrente. */
  against: string
}): Insight[] {
  if (total <= 0) return []
  const out: Insight[] = []

  if (month === now && forecast > 0) {
    out.push({
      key: 'fecha',
      icon: 'flag-outline',
      tone: 'accent',
      title: `${kind === 'expense' ? 'O mês deve fechar' : 'As entradas devem chegar'} em ${money(total + forecast)}`,
      detail: `${money(total)} até agora e ${money(forecast)} ${kind === 'expense' ? 'em contas previstas' : 'previstos'}.`,
    })
  }

  const top = rows[0]
  if (top) {
    const share = Math.round((top.totalCents / total) * 100)
    out.push({
      key: 'maior',
      icon: 'podium-outline',
      tone: 'neutral',
      title: `${top.categoryName} ${kind === 'expense' ? 'levou' : 'trouxe'} ${share}% do mês`,
      detail:
        rows.length > 3
          ? `As 3 maiores categorias somam ${Math.round(
              (rows.slice(0, 3).reduce((s, r) => s + r.totalCents, 0) / total) * 100,
            )}% ${kind === 'expense' ? 'dos gastos' : 'das entradas'}.`
          : `${money(top.totalCents)} em ${top.transactionCount} lançamento${top.transactionCount === 1 ? '' : 's'}.`,
    })
  }

  if (beforeById.size) {
    const moves = rows
      .map((r) => ({ row: r, diff: r.totalCents - (beforeById.get(r.categoryId) ?? 0) }))
      // Mudança de menos de R$ 20 não vale uma frase.
      .filter((m) => Math.abs(m.diff) >= 2000)
    const up = [...moves].sort((a, b) => b.diff - a.diff)[0]
    const down = [...moves].sort((a, b) => a.diff - b.diff)[0]
    if (up && up.diff > 0) {
      out.push({
        key: 'subiu',
        icon: 'trending-up',
        tone: kind === 'income' ? 'positive' : 'neutral',
        title: `${up.row.categoryName} subiu ${money(up.diff)}`,
        detail: `Em relação a ${against}.`,
      })
    }
    if (down && down.diff < 0) {
      out.push({
        key: 'caiu',
        icon: 'trending-down',
        tone: kind === 'expense' ? 'positive' : 'neutral',
        title: `${down.row.categoryName} caiu ${money(-down.diff)}`,
        detail: `Em relação a ${against}.`,
      })
    }
  }

  return out.slice(0, 3)
}

function InsightRow({ insight, index }: { insight: Insight; index: number }) {
  const theme = useTheme()
  // Entram em cascata, subindo um pouco: dá a sensação de que a tela "leu" o mês.
  const rise = useRef(new Animated.Value(0)).current
  useEffect(() => {
    rise.setValue(0)
    Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      delay: 80 + index * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [insight.title, index, rise])

  const tint =
    insight.tone === 'positive' ? theme.positive : insight.tone === 'accent' ? theme.accentText : theme.text2
  const soft =
    insight.tone === 'positive' ? theme.positiveSoft : insight.tone === 'accent' ? theme.accentSoft : theme.surface2

  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: 14,
        borderRadius: radius.lg + 2,
        borderWidth: 1,
        borderColor: theme.border,
        borderTopColor: theme.edgeTop,
        backgroundColor: theme.surface,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: soft,
        }}
      >
        <Ionicons name={insight.icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ ...type.row, fontWeight: '600', color: theme.text }}>{capitalize(insight.title)}</Text>
        <Text style={{ ...type.caption, color: theme.text2 }}>{insight.detail}</Text>
      </View>
    </Animated.View>
  )
}
