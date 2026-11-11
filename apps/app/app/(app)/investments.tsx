import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import {
  Card,
  EmptyState,
  ErrorBanner,
  Gutter,
  InkCard,
  ListGroup,
  Screen,
  SectionLabel,
  Skeleton,
  Title,
  TrustNote,
  privacyBlur,
  useTabBarSpace,
} from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { formatBRL, formatDate, formatMonth, sinceLabel } from '@/lib/format'
import { inkCard, radius, spacing, tabular, type, useTheme } from '@/lib/theme'

type Data = Awaited<ReturnType<typeof load>>
type Ready = Extract<Data, { connected: true }>

async function load() {
  return unwrap(await client.investments.$get())
}

/** "+ R$ 10,00" / "− R$ 10,00": o sinal vem sempre colado ao número. */
function signed(cents: number): string {
  return `${cents >= 0 ? '+' : '−'} ${formatBRL(Math.abs(cents))}`
}

function percentText(p: number): string {
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`
}

const GROUP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  fixed_income: 'shield-checkmark-outline',
  etf: 'stats-chart-outline',
  stocks: 'trending-up-outline',
  reits: 'business-outline',
  funds: 'layers-outline',
  pension: 'umbrella-outline',
  other: 'ellipse-outline',
}

export default function Investments() {
  const theme = useTheme()
  const tabBarSpace = useTabBarSpace()
  const [hidden, setHidden] = useState(false)

  const query = useQuery({ queryKey: ['investments'], queryFn: load, refetchInterval: 10 * 60_000 })
  const data = query.data

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace, gap: spacing.xl }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      >
        <Gutter style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title>Investimentos</Title>
            {data?.enabled && data.connected && data.updatedAt ? (
              <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }}>
                Banco atualizado {sinceLabel(data.updatedAt)}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => setHidden((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            accessibilityState={{ checked: hidden }}
            hitSlop={8}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.text2} />
          </Pressable>
        </Gutter>

        <Gutter>
          <ErrorBanner message={query.error?.message} />
        </Gutter>

        {query.isPending ? (
          <Gutter style={{ gap: spacing.lg }}>
            <Skeleton width={110} height={12} />
            <Skeleton width={230} height={38} style={{ borderRadius: 10 }} />
            <Skeleton width="100%" height={160} style={{ borderRadius: radius.card }} delay={100} />
          </Gutter>
        ) : !data ? null : !data.enabled ? (
          <Gutter>
            <EmptyState
              title="Investimentos vêm do Open Finance."
              hint="Esta aba aparece para a conta com o banco conectado."
            />
          </Gutter>
        ) : !data.connected ? (
          <Gutter>
            <EmptyState
              title="Nenhum banco conectado ainda."
              hint="Assim que a primeira sincronização terminar, a carteira aparece aqui."
            />
          </Gutter>
        ) : (
          <Body data={data} hidden={hidden} />
        )}
      </ScrollView>
    </Screen>
  )
}

function Body({ data, hidden }: { data: Ready; hidden: boolean }) {
  const theme = useTheme()
  const { portfolio, netWorth, monthly, history } = data

  return (
    <>
      {/* ── total investido, líquido ── */}
      <Gutter>
        <Text style={{ ...type.body, color: theme.text2, letterSpacing: 0.2 }}>Total investido</Text>
        <Text
          accessibilityLabel={hidden ? 'Valor oculto' : `Total investido de ${formatBRL(portfolio.totalCents)}`}
          style={[type.balance, tabular, { color: theme.text, marginTop: 6 }, privacyBlur(hidden, theme.text)]}
        >
          {formatBRL(portfolio.totalCents)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {portfolio.costCents > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 5,
                paddingHorizontal: 9,
                borderRadius: radius.full,
                backgroundColor: portfolio.profitCents >= 0 ? theme.positiveSoft : theme.surface2,
              }}
            >
              <Ionicons
                name={portfolio.profitCents >= 0 ? 'trending-up' : 'trending-down'}
                size={12}
                color={portfolio.profitCents >= 0 ? theme.positive : theme.text2}
              />
              <Text
                style={[
                  { ...type.caption, ...tabular, fontWeight: '600' },
                  { color: portfolio.profitCents >= 0 ? theme.positive : theme.text2 },
                  privacyBlur(hidden, portfolio.profitCents >= 0 ? theme.positive : theme.text2),
                ]}
              >
                {signed(portfolio.profitCents)}
                {portfolio.profitPercent !== null ? ` · ${percentText(portfolio.profitPercent)}` : ''}
              </Text>
            </View>
          ) : null}
          <Text style={{ ...type.caption, color: theme.text2 }}>rendimento desde a compra</Text>
        </View>
        <Text style={{ ...type.caption, color: theme.text2, marginTop: 8 }}>
          Valor de resgate hoje, já sem IR e IOF ·{' '}
          <Text style={[tabular, privacyBlur(hidden, theme.text2)]}>{formatBRL(portfolio.grossCents)}</Text> bruto
          {portfolio.unknownCostCount > 0
            ? ` · ${portfolio.unknownCostCount} ${portfolio.unknownCostCount === 1 ? 'posição' : 'posições'} sem custo de compra no histórico, fora do rendimento`
            : ''}
        </Text>
      </Gutter>

      {/* ── evolução ── */}
      <Gutter>
        <Card>
          <EvolutionChart history={history} hidden={hidden} />
        </Card>
      </Gutter>

      {/* ── guardado no mês ── */}
      <Gutter>
        <Card>
          <SavedChart monthly={monthly} hidden={hidden} />
        </Card>
      </Gutter>

      {/* ── patrimônio total ── */}
      <Gutter>
        <InkCard>
          <Text style={{ ...type.overline, color: inkCard.textSoft, letterSpacing: 1.4 }}>Patrimônio total</Text>
          <Text
            style={[
              { fontSize: 28, fontWeight: '700', letterSpacing: -0.8, color: inkCard.text, marginTop: spacing.sm },
              tabular,
              privacyBlur(hidden, inkCard.text),
            ]}
          >
            {formatBRL(netWorth.totalCents)}
          </Text>
          <View style={{ gap: 8, marginTop: spacing.lg }}>
            {netWorth.accounts.map((a) => (
              <InkLine key={a.bank} label={`Conta ${a.bank}`} value={formatBRL(a.balanceCents)} hidden={hidden} />
            ))}
            <InkLine label="Investimentos" value={formatBRL(netWorth.investmentsCents)} hidden={hidden} />
            {netWorth.cardBillCents > 0 ? (
              <InkLine label="Fatura em aberto" value={`− ${formatBRL(netWorth.cardBillCents)}`} hidden={hidden} />
            ) : null}
          </View>
        </InkCard>
      </Gutter>

      {/* ── por tipo ── */}
      {portfolio.groups.length ? (
        <Gutter style={{ gap: spacing.md }}>
          <SectionLabel>Por tipo</SectionLabel>
          {portfolio.groups.map((g) => {
            const share = portfolio.totalCents > 0 ? g.totalCents / portfolio.totalCents : 0
            return (
              <View key={g.group} style={{ gap: 6, paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={{ ...type.row, color: theme.text, flex: 1 }} numberOfLines={1}>
                    {g.label}
                  </Text>
                  <Text style={[{ ...type.row, ...tabular, color: theme.text }, privacyBlur(hidden, theme.text)]}>
                    {formatBRL(g.totalCents)}
                  </Text>
                  <Text style={{ ...type.row, ...tabular, color: theme.text2, width: 44, textAlign: 'right' }}>
                    {Math.round(share * 100)}%
                  </Text>
                </View>
                <View style={{ height: 8, borderRadius: radius.full, overflow: 'hidden', backgroundColor: theme.track }}>
                  <View style={{ width: `${Math.max(share * 100, 1)}%`, height: '100%', backgroundColor: theme.accent }} />
                </View>
              </View>
            )
          })}
        </Gutter>
      ) : null}

      {/* ── posições ── */}
      <Gutter style={{ gap: spacing.md }}>
        <SectionLabel>Posições</SectionLabel>
        {portfolio.positions.length === 0 ? (
          <EmptyState title="Nenhum investimento ativo." hint="Os resgatados ficam só no histórico do guardado." />
        ) : (
          <ListGroup>
            {portfolio.positions.map((p, i) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: 64,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 10,
                  borderBottomWidth: i === portfolio.positions.length - 1 ? 0 : 1,
                  borderBottomColor: theme.border,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.accentSoft,
                  }}
                >
                  <Ionicons name={GROUP_ICONS[p.group] ?? 'ellipse-outline'} size={17} color={theme.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={2}>
                    {[
                      p.rate,
                      p.quantity !== null ? `${p.quantity.toLocaleString('pt-BR')} ${p.quantity === 1 ? 'cota' : 'cotas'}` : null,
                      p.dueOn ? `vence em ${p.dueOn.split('-').reverse().join('/')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text
                    style={[{ ...type.amount, color: theme.text }, tabular, privacyBlur(hidden, theme.text)]}
                  >
                    {formatBRL(p.balanceCents)}
                  </Text>
                  {p.profitCents !== null ? (
                    <Text
                      style={[
                        { ...type.caption, ...tabular, fontWeight: '600' },
                        { color: p.profitCents >= 0 ? theme.positive : theme.text2 },
                        privacyBlur(hidden, p.profitCents >= 0 ? theme.positive : theme.text2),
                      ]}
                    >
                      {signed(p.profitCents)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ListGroup>
        )}
        {portfolio.closedCount > 0 ? (
          <Text style={{ ...type.caption, color: theme.text2 }}>
            {portfolio.closedCount} {portfolio.closedCount === 1 ? 'posição resgatada' : 'posições resgatadas'} no
            último ano ficam fora da carteira, mas contam no guardado.
          </Text>
        ) : null}
        <TrustNote icon={<Ionicons name="lock-closed-outline" size={13} color={theme.text3} />}>
          Dados do Open Finance, só de leitura
        </TrustNote>
      </Gutter>
    </>
  )
}

function InkLine({ label, value, hidden }: { label: string; value: string; hidden: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Text style={{ ...type.body, color: inkCard.textSoft }}>{label}</Text>
      <Text style={[{ ...type.body, fontWeight: '600', color: inkCard.text }, tabular, privacyBlur(hidden, inkCard.text)]}>
        {value}
      </Text>
    </View>
  )
}

/* ─────────────────────────────── gráficos ──────────────────────────── */

const CHART_HEIGHT = 120

/**
 * Faixa transparente por cima do gráfico que recebe o toque (e o mouse, na
 * web) e diz qual ponto está mais perto. Fica por cima de tudo para o
 * `locationX` ser sempre relativo a ela, e não ao traço que o dedo tocou.
 */
function Scrubber({
  width,
  count,
  bands = false,
  onPick,
}: {
  width: number
  count: number
  /** Barras ocupam faixas iguais; pontos de linha ficam nas pontas e no meio. */
  bands?: boolean
  onPick: (i: number) => void
}) {
  const pick = (x: number) => {
    if (width <= 0 || count === 0) return
    const i = bands ? Math.floor((x / width) * count) : Math.round((x / width) * (count - 1))
    onPick(Math.max(0, Math.min(count - 1, i)))
  }
  return (
    <View
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      {...(Platform.OS === 'web'
        ? ({ onPointerMove: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX) } as object)
        : null)}
    />
  )
}

function EvolutionChart({ history, hidden }: { history: Ready['history']; hidden: boolean }) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const points = history
  const index = picked ?? points.length - 1
  const current = points[index]

  const geometry = useMemo(() => {
    if (points.length < 2 || width <= 0) return null
    const values = points.map((p) => p.investmentsCents)
    let min = Math.min(...values)
    let max = Math.max(...values)
    // Linha reta ainda precisa de altura: abre uma folga de 1% em volta.
    if (max - min < Math.max(max * 0.002, 100)) {
      min -= Math.max(max * 0.01, 100)
      max += Math.max(max * 0.01, 100)
    }
    const pad = (max - min) * 0.12
    const lo = min - pad
    const hi = max + pad
    const x = (i: number) => (i / (points.length - 1)) * width
    const y = (v: number) => CHART_HEIGHT - ((v - lo) / (hi - lo)) * CHART_HEIGHT
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.investmentsCents).toFixed(1)}`).join(' ')
    const area = `${line} L${width},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`
    return { line, area, x, y }
  }, [points, width])

  return (
    <View>
      <Text style={{ ...type.section, color: theme.text }}>Evolução</Text>
      {points.length < 2 ? (
        <Text style={{ ...type.body, color: theme.text2, marginTop: 6 }}>
          A Pluggy só informa o valor de hoje, então o Nauri guarda uma foto por dia a partir de agora. Com dois dias
          de fotos, a linha aparece aqui.
        </Text>
      ) : (
        <>
          <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }}>
            {current ? formatDate(current.day) : ''} ·{' '}
            <Text style={[{ fontWeight: '600', color: theme.text }, tabular, privacyBlur(hidden, theme.text)]}>
              {current ? formatBRL(current.investmentsCents) : ''}
            </Text>
          </Text>
          <View
            style={{ height: CHART_HEIGHT, marginTop: spacing.md }}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          >
            {geometry ? (
              <Svg width={width} height={CHART_HEIGHT}>
                <Path d={geometry.area} fill={theme.accentSoft} />
                <Path d={geometry.line} stroke={theme.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
                {current ? (
                  <>
                    <Line
                      x1={geometry.x(index)}
                      x2={geometry.x(index)}
                      y1={0}
                      y2={CHART_HEIGHT}
                      stroke={theme.text3}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Circle
                      cx={geometry.x(index)}
                      cy={geometry.y(current.investmentsCents)}
                      r={5}
                      fill={theme.accent}
                      stroke={theme.surface}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </Svg>
            ) : null}
            <Scrubber width={width} count={points.length} onPick={setPicked} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ ...type.caption, color: theme.text3 }}>{formatDate(points[0]!.day)}</Text>
            <Text style={{ ...type.caption, color: theme.text3 }}>{formatDate(points.at(-1)!.day)}</Text>
          </View>
        </>
      )}
    </View>
  )
}

const BAR_HEIGHT = 110
const BAR_GAP = 4

/** Retângulo com a ponta de dado arredondada (a ponta longe da linha do zero). */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h)
  if (h <= 0) return ''
  if (up) {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
  }
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} Z`
}

/**
 * Guardado mês a mês: barra para cima quando entrou mais do que saiu dos
 * investimentos, para baixo quando o resgate foi maior. O sinal está na
 * direção e no número do topo; a cor só reforça.
 */
function SavedChart({ monthly, hidden }: { monthly: Ready['monthly']; hidden: boolean }) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const index = picked ?? monthly.length - 1
  const selected = monthly[index]

  const maxUp = Math.max(0, ...monthly.map((m) => m.savedCents))
  const maxDown = Math.max(0, ...monthly.map((m) => -m.savedCents))
  const range = maxUp + maxDown || 1
  const zeroY = (maxUp / range) * BAR_HEIGHT
  const barW = monthly.length ? (width - BAR_GAP * (monthly.length - 1)) / monthly.length : 0

  return (
    <View>
      <Text style={{ ...type.section, color: theme.text }}>
        Guardado em {selected ? formatMonth(selected.month).replace(/ de \d{4}$/, '') : ''}
      </Text>
      {selected ? (
        <>
          <Text
            style={[
              { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
              tabular,
              { color: selected.savedCents > 0 ? theme.positive : theme.text },
              privacyBlur(hidden, selected.savedCents > 0 ? theme.positive : theme.text),
            ]}
          >
            {selected.savedCents === 0 ? formatBRL(0) : signed(selected.savedCents)}
          </Text>
          <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }}>
            Aportes{' '}
            <Text style={[tabular, privacyBlur(hidden, theme.text2)]}>{formatBRL(selected.contributionsCents)}</Text> ·
            resgates{' '}
            <Text style={[tabular, privacyBlur(hidden, theme.text2)]}>{formatBRL(selected.withdrawalsCents)}</Text>
          </Text>
        </>
      ) : null}

      <View
        style={{ height: BAR_HEIGHT, marginTop: spacing.lg }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Svg width={width} height={BAR_HEIGHT}>
            {monthly.map((m, i) => {
              const h = (Math.abs(m.savedCents) / range) * BAR_HEIGHT
              const x = i * (barW + BAR_GAP)
              const up = m.savedCents >= 0
              return (
                <Path
                  key={m.month}
                  d={barPath(x, up ? zeroY - h : zeroY, barW, Math.max(h, m.savedCents === 0 ? 0 : 2), up)}
                  fill={up ? theme.accent : theme.text3}
                  opacity={i === index ? 1 : 0.45}
                />
              )
            })}
            <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={theme.border} strokeWidth={1} />
          </Svg>
        ) : null}
        <Scrubber width={width} count={monthly.length} bands onPick={setPicked} />
      </View>
      <View style={{ flexDirection: 'row', gap: BAR_GAP, marginTop: 6 }}>
        {monthly.map((m, i) => (
          <Text
            key={m.month}
            style={{
              flex: 1,
              textAlign: 'center',
              ...type.caption,
              fontSize: 10.5,
              color: i === index ? theme.text : theme.text3,
              fontWeight: i === index ? '600' : '400',
            }}
          >
            {formatMonth(m.month).charAt(0).toUpperCase()}
          </Text>
        ))}
      </View>
    </View>
  )
}
