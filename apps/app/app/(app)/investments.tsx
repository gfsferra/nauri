import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import {
  BankLogo,
  Card,
  EmptyState,
  ErrorBanner,
  EyeToggle,
  Gutter,
  InkCard,
  ListGroup,
  Screen,
  Skeleton,
  TrustNote,
  mask,
  useTabBarSpace,
} from '@/components/ui'
import { CountUp, Segmented } from '@/components/metrics'
import { client, unwrap } from '@/lib/api'
import { formatBRL, formatDate, formatMonth, sinceLabel } from '@/lib/format'
import { useReveal } from '@/lib/motion'
import { useHidden } from '@/lib/privacy'
import { inkCard, radius, spacing, tabular, type, useTheme } from '@/lib/theme'

type Data = Awaited<ReturnType<typeof load>>
type Ready = Extract<Data, { connected: true }>
type Position = Ready['portfolio']['positions'][number]

async function load() {
  return unwrap(await client.investments.$get())
}

/** "+ R$ 10,00" / "− R$ 10,00": o sinal vem sempre colado ao número. */
function signed(cents: number): string {
  return `${cents >= 0 ? '+' : '−'} ${formatBRL(Math.abs(cents))}`
}

/** 'agosto de 2026' → 'agosto'. */
function monthName(month: string): string {
  return formatMonth(month).replace(/ de \d{4}$/, '')
}

/** 0,183 → '18%'; o sinal de menos tipográfico quando negativo. */
function rateText(rate: number): string {
  const p = Math.round(rate * 100)
  return `${p < 0 ? '−' : ''}${Math.abs(p)}%`
}

/** '2027-02-21' → '21/02/2027'. */
function shortDate(iso: string): string {
  return iso.split('-').reverse().join('/')
}

/** '2027-02-21' → '02/2027'. */
function monthYear(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** 22.5 → '22,5'. */
function taxRate(rate: number): string {
  return rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function inDaysText(days: number): string {
  return days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`
}

function percentText(p: number, digits = 1): string {
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(digits).replace('.', ',')}%`
}

/** O dia `days` antes de `iso`, no calendário (sem fuso). */
function daysBefore(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
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
  const tabBarSpace = useTabBarSpace()
  const [hidden] = useHidden()

  const query = useQuery({ queryKey: ['investments'], queryFn: load, refetchInterval: 10 * 60_000 })
  const data = query.data

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace, gap: spacing.xl }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      >
        {query.isPending ? (
          <Gutter style={{ gap: spacing.lg }}>
            <Skeleton width={140} height={12} />
            <Skeleton width={230} height={38} style={{ borderRadius: 10 }} />
            <Skeleton width={180} height={26} delay={80} />
            <Skeleton width="100%" height={96} style={{ borderRadius: radius.card }} delay={120} />
            <Skeleton width="100%" height={240} style={{ borderRadius: radius.card }} delay={180} />
          </Gutter>
        ) : !data ? (
          <Gutter>
            <ErrorBanner message={query.error?.message} />
          </Gutter>
        ) : !data.enabled ? (
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
          <>
            {query.error ? (
              <Gutter>
                <ErrorBanner message={query.error.message} />
              </Gutter>
            ) : null}
            <Body data={data} hidden={hidden} />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Body({ data, hidden }: { data: Ready; hidden: boolean }) {
  const theme = useTheme()
  const { portfolio, netWorth, monthly, history, savings, yield: yields } = data
  const up = portfolio.profitCents >= 0

  return (
    <>
      {/* ── total investido ── */}
      <Gutter style={{ paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* O valor é o de resgate hoje: o rótulo diz isso em vez de uma frase à parte. */}
            <Text style={{ ...type.caption, color: theme.text2 }}>Total investido, líquido de IR e IOF</Text>
            <CountUp cents={portfolio.totalCents} hidden={hidden} />
          </View>
          <EyeToggle />
        </View>
        {portfolio.costCents > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                height: 26,
                paddingHorizontal: 10,
                borderRadius: radius.full,
                backgroundColor: up ? theme.positiveSoft : theme.surface2,
              }}
            >
              <Ionicons name={up ? 'trending-up' : 'trending-down'} size={14} color={up ? theme.positive : theme.text} />
              <Text style={[{ ...type.caption, fontWeight: '600', color: up ? theme.positive : theme.text }, tabular]}>
                {mask(signed(portfolio.profitCents), hidden)}
                {portfolio.profitPercent !== null ? ` · ${percentText(portfolio.profitPercent)}` : ''}
              </Text>
            </View>
            <Text style={{ ...type.caption, color: theme.text2 }}>desde a compra</Text>
          </View>
        ) : null}
      </Gutter>

      {/* ── os três números que dizem como vai a carteira ── */}
      <KpiStrip yields={yields} savings={savings} hidden={hidden} />

      {/* ── evolução e guardado, num cartão só ── */}
      <Gutter>
        <ChartCard history={history} monthly={monthly} rates={savings.monthly} hidden={hidden} />
      </Gutter>

      {/* ── imposto que cai em breve: vale esperar para resgatar ── */}
      {portfolio.taxDrops.length ? (
        <Gutter style={{ gap: spacing.md }}>
          <SectionTitle>Vale esperar para resgatar</SectionTitle>
          <View style={{ gap: spacing.sm }}>
            {portfolio.taxDrops.map((d) => (
              <View
                key={`${d.id}:${d.kind}`}
                style={{
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
                    backgroundColor: theme.positiveSoft,
                  }}
                >
                  <Ionicons name="hourglass-outline" size={17} color={theme.positive} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ ...type.row, fontWeight: '600', color: theme.text }} numberOfLines={1}>
                    {d.kind === 'iof'
                      ? `IOF zera ${inDaysText(d.inDays)}`
                      : `IR cai para ${taxRate(d.toRate!)}% ${inDaysText(d.inDays)}`}
                  </Text>
                  <Text style={{ ...type.caption, color: theme.text2 }} numberOfLines={1}>
                    {d.name} · {shortDate(d.on)}
                  </Text>
                </View>
                {/* Centavos não mudam a decisão de esperar: só a partir de R$ 1. */}
                {d.savingsCents !== null && d.savingsCents >= 100 ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[{ ...type.amount, color: theme.positive }, tabular]}>
                      {mask(formatBRL(d.savingsCents), hidden)}
                    </Text>
                    <Text style={{ ...type.caption, color: theme.text2 }}>a menos</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Gutter>
      ) : null}

      {/* ── patrimônio total ── */}
      <Gutter>
        <NetWorthCard netWorth={netWorth} hidden={hidden} />
      </Gutter>

      {/* ── por tipo: só quando há mais de um, senão é uma barra cheia que não diz nada ── */}
      {portfolio.groups.length > 1 ? (
        <Gutter>
          <Allocation groups={portfolio.groups} total={portfolio.totalCents} hidden={hidden} />
        </Gutter>
      ) : null}

      {/* ── posições ── */}
      <Gutter style={{ gap: spacing.md }}>
        <SectionTitle>Posições</SectionTitle>
        {portfolio.positions.length === 0 ? (
          <EmptyState title="Nenhum investimento ativo." hint="Os resgatados ficam só no histórico do guardado." />
        ) : (
          <ListGroup>
            {portfolio.positions.map((p, i) => (
              <PositionRow key={p.id} position={p} last={i === portfolio.positions.length - 1} hidden={hidden} />
            ))}
          </ListGroup>
        )}
        <TrustNote icon={<Ionicons name="lock-closed-outline" size={13} color={theme.text3} />}>
          Open Finance, só leitura{data.updatedAt ? ` · atualizado ${sinceLabel(data.updatedAt)}` : ''}
          {portfolio.unknownCostCount > 0
            ? ` · ${portfolio.unknownCostCount} ${portfolio.unknownCostCount === 1 ? 'posição' : 'posições'} fora do rendimento`
            : ''}
        </TrustNote>
      </Gutter>
    </>
  )
}

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme()
  return <Text style={{ ...type.section, color: theme.text }}>{children}</Text>
}

/* ────────────────────────────── indicadores ─────────────────────────── */

/**
 * Faixa de indicadores que rola de lado: cada um é um número e um rótulo
 * curto. O que não tem dado ainda não aparece, em vez de mostrar um traço.
 */
function KpiStrip({
  yields,
  savings,
  hidden,
}: {
  yields: Ready['yield']
  savings: Ready['savings']
  hidden: boolean
}) {
  const tiles: KpiProps[] = []

  const current = yields.current
  if (current) {
    const up = current.yieldCents >= 0
    tiles.push({
      icon: 'sparkles-outline',
      tone: up ? 'positive' : 'neutral',
      label: `Rendeu em ${monthName(current.month)}`,
      value: mask(signed(current.yieldCents), hidden),
      // Um mês de renda fixa rende perto de 1%: uma casa só não separa os meses.
      detail: current.percent !== null ? `${percentText(current.percent, 2)} no mês` : 'sem aportes e resgates',
    })
  }
  if (savings.reserveMonths !== null) {
    const r = savings.reserveMonths
    tiles.push({
      icon: 'shield-checkmark-outline',
      tone: 'accent',
      label: 'Reserva',
      value: `${r.toFixed(1).replace('.', ',')} ${r < 2 ? 'mês' : 'meses'}`,
      detail: 'dos seus gastos',
      // A régua vai até 12 meses; a marca dos 6 é a reserva que se costuma recomendar.
      meter: Math.min(r / 12, 1),
    })
  }
  if (savings.rate !== null) {
    tiles.push({
      icon: 'trending-up-outline',
      tone: savings.rate > 0 ? 'positive' : 'neutral',
      label: 'Taxa de poupança',
      value: rateText(savings.rate),
      detail:
        savings.fromMonth && savings.toMonth
          ? `do que entrou, ${formatMonth(savings.fromMonth).slice(0, 3)}–${formatMonth(savings.toMonth).slice(0, 3)}`
          : 'do que entrou',
    })
  }
  if (!tiles.length) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: 10 }}
      snapToInterval={KPI_WIDTH + 10}
      decelerationRate="fast"
    >
      {tiles.map((t, i) => (
        <Kpi key={t.label} {...t} index={i} />
      ))}
    </ScrollView>
  )
}

const KPI_WIDTH = 164

type KpiProps = {
  icon: keyof typeof Ionicons.glyphMap
  tone: 'positive' | 'accent' | 'neutral'
  label: string
  value: string
  detail: string
  meter?: number
}

function Kpi({ icon, tone, label, value, detail, meter, index }: KpiProps & { index: number }) {
  const theme = useTheme()
  const rise = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      delay: 60 + index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [rise, index])
  const fill = useReveal(`kpi:${meter}`, { duration: 900, delay: 250 + index * 80 })

  const tint = tone === 'positive' ? theme.positive : tone === 'accent' ? theme.accentText : theme.text2
  const soft = tone === 'positive' ? theme.positiveSoft : tone === 'accent' ? theme.accentSoft : theme.surface2

  return (
    <Animated.View
      style={{
        width: KPI_WIDTH,
        padding: 14,
        gap: 3,
        borderRadius: radius.lg + 2,
        borderWidth: 1,
        borderColor: theme.border,
        borderTopColor: theme.edgeTop,
        backgroundColor: theme.surface,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: soft,
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <Text style={{ ...type.caption, color: theme.text2 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          { fontSize: 19, fontWeight: '700', letterSpacing: -0.5 },
          tabular,
          { color: tone === 'positive' ? theme.positive : theme.text },
        ]}
      >
        {value}
      </Text>
      {meter !== undefined ? (
        <View style={{ height: 4, borderRadius: radius.full, backgroundColor: theme.track, marginVertical: 4 }}>
          <View
            style={{
              width: `${meter * fill * 100}%`,
              height: '100%',
              borderRadius: radius.full,
              backgroundColor: theme.accent,
            }}
          />
          {/* A marca dos 6 meses. */}
          <View
            style={{
              position: 'absolute',
              left: '50%',
              top: -2,
              width: 2,
              height: 8,
              borderRadius: 1,
              backgroundColor: theme.text3,
            }}
          />
        </View>
      ) : null}
      <Text style={{ ...type.caption, color: theme.text2 }} numberOfLines={1}>
        {detail}
      </Text>
    </Animated.View>
  )
}

/* ─────────────────────────────── patrimônio ─────────────────────────── */

/**
 * O patrimônio na peça de marca, com uma barra que mostra de que ele é feito:
 * investimentos no destaque, as contas em tons de branco. A fatura em aberto
 * desconta do total e fica só na lista.
 */
function NetWorthCard({ netWorth, hidden }: { netWorth: Ready['netWorth']; hidden: boolean }) {
  const theme = useTheme()
  const grow = useReveal('patrimonio', { duration: 900, delay: 200 })
  const parts = [
    { key: 'inv', label: 'Investimentos', cents: netWorth.investmentsCents, color: theme.accent, logo: null as string | null },
    ...netWorth.accounts.map((a, i) => ({
      key: a.bank,
      label: `Conta ${a.bank}`,
      cents: Math.max(0, a.balanceCents),
      color: i % 2 === 0 ? 'rgba(248,250,252,0.55)' : 'rgba(248,250,252,0.3)',
      logo: a.bankIcon,
    })),
  ]
  const sum = parts.reduce((s, p) => s + p.cents, 0)

  return (
    <InkCard>
      <Text style={{ ...type.overline, color: inkCard.textSoft, letterSpacing: 1.4 }}>Patrimônio total</Text>
      <Text
        style={[
          { fontSize: 28, fontWeight: '700', letterSpacing: -0.8, color: inkCard.text, marginTop: spacing.sm },
          tabular,
        ]}
      >
        {mask(formatBRL(netWorth.totalCents), hidden)}
      </Text>

      {sum > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            height: 8,
            gap: 3,
            marginTop: spacing.lg,
            width: `${grow * 100}%`,
          }}
        >
          {parts
            .filter((p) => p.cents > 0)
            .map((p) => (
              <View key={p.key} style={{ flex: p.cents / sum, borderRadius: radius.full, backgroundColor: p.color }} />
            ))}
        </View>
      ) : null}

      <View style={{ gap: 10, marginTop: spacing.lg }}>
        {parts.map((p) => (
          <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: p.color }} />
            {p.logo ? <BankLogo uri={p.logo} fallback="business-outline" size={20} /> : null}
            <Text style={{ ...type.body, color: inkCard.textSoft, flex: 1 }} numberOfLines={1}>
              {p.label}
            </Text>
            <Text style={[{ ...type.body, fontWeight: '600', color: inkCard.text }, tabular]}>
              {mask(formatBRL(p.cents), hidden)}
            </Text>
          </View>
        ))}
        {netWorth.cardBillCents > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 3, borderWidth: 1, borderColor: inkCard.textSoft }} />
            <Text style={{ ...type.body, color: inkCard.textSoft, flex: 1 }}>Fatura em aberto</Text>
            <Text style={[{ ...type.body, fontWeight: '600', color: inkCard.text }, tabular]}>
              {mask(`− ${formatBRL(netWorth.cardBillCents)}`, hidden)}
            </Text>
          </View>
        ) : null}
      </View>
    </InkCard>
  )
}

/* ─────────────────────────────── por tipo ──────────────────────────── */

function Allocation({
  groups,
  total,
  hidden,
}: {
  groups: Ready['portfolio']['groups']
  total: number
  hidden: boolean
}) {
  const theme = useTheme()
  const grow = useReveal('alocacao', { duration: 800 })
  const colorOf = (i: number) => (i === 0 ? theme.accent : theme.chartRamp[Math.min(i, theme.chartRamp.length - 1)])
  return (
    <Card>
      <SectionTitle>Por tipo</SectionTitle>
      <View style={{ flexDirection: 'row', height: 10, gap: 3, marginTop: spacing.md, width: `${grow * 100}%` }}>
        {groups.map((g, i) => (
          <View
            key={g.group}
            style={{ flex: total > 0 ? g.totalCents / total : 0, borderRadius: radius.full, backgroundColor: colorOf(i) }}
          />
        ))}
      </View>
      <View style={{ gap: 10, marginTop: spacing.lg }}>
        {groups.map((g, i) => (
          <View key={g.group} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: colorOf(i) }} />
            <Text style={{ ...type.body, color: theme.text, flex: 1 }} numberOfLines={1}>
              {g.label}
            </Text>
            <Text style={[{ ...type.body, fontWeight: '600', color: theme.text }, tabular]}>
              {mask(formatBRL(g.totalCents), hidden)}
            </Text>
            <Text style={[{ ...type.caption, color: theme.text2, width: 38, textAlign: 'right' }, tabular]}>
              {total > 0 ? Math.round((g.totalCents / total) * 100) : 0}%
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

/* ─────────────────────────────── posições ──────────────────────────── */

/**
 * Uma posição: nome, taxa e vencimento numa linha, valor e rendimento à
 * direita. O resto (imposto, alíquota, cotas) fica atrás de um toque.
 */
function PositionRow({ position: p, last, hidden }: { position: Position; last: boolean; hidden: boolean }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const turn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }, [open, turn])

  // Na linha, só o ano do vencimento; a data inteira fica nos detalhes.
  const subtitle = [p.rate, p.dueOn ? `até ${p.dueOn.slice(0, 4)}` : null].filter(Boolean).join(' · ')
  const details: { label: string; value: string }[] = []
  if (p.profitCents !== null) details.push({ label: 'Rendimento', value: mask(signed(p.profitCents), hidden) })
  if (p.taxesCents > 0) details.push({ label: 'IR e IOF hoje', value: mask(formatBRL(p.taxesCents), hidden) })
  if (p.tax) {
    details.push(
      p.tax.next
        ? {
            label: `IR, cai em ${monthYear(p.tax.next.on)}`,
            value: `${taxRate(p.tax.irRate)}% → ${taxRate(p.tax.next.rate)}%`,
          }
        : { label: 'Alíquota de IR', value: `${taxRate(p.tax.irRate)}%, a menor` },
    )
  }
  if (p.dueOn) details.push({ label: 'Vencimento', value: shortDate(p.dueOn) })
  if (p.quantity !== null) {
    details.push({ label: 'Cotas', value: p.quantity.toLocaleString('pt-BR') })
  }

  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.border }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${p.name}, ${hidden ? 'valor oculto' : formatBRL(p.balanceCents)}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 64,
          paddingHorizontal: spacing.lg,
          paddingVertical: 10,
          backgroundColor: pressed ? theme.surface2 : 'transparent',
        })}
      >
        <BankLogo uri={p.issuerIcon} fallback={GROUP_ICONS[p.group] ?? 'ellipse-outline'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
            {p.name}
          </Text>
          {subtitle ? (
            <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={[{ ...type.amount, color: theme.text }, tabular]}>{mask(formatBRL(p.balanceCents), hidden)}</Text>
          {p.profitCents !== null ? (
            <Text
              style={[
                { ...type.caption, fontWeight: '600', color: p.profitCents >= 0 ? theme.positive : theme.text2 },
                tabular,
              ]}
            >
              {mask(signed(p.profitCents), hidden)}
            </Text>
          ) : null}
        </View>
        <Animated.View
          style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
        >
          <Ionicons name="chevron-down" size={15} color={theme.text3} />
        </Animated.View>
      </Pressable>

      {open && details.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            rowGap: spacing.md,
            marginHorizontal: spacing.lg,
            marginBottom: spacing.md,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: theme.surface2,
          }}
        >
          {details.map((d) => (
            <View key={d.label} style={{ width: '50%', paddingRight: spacing.sm, gap: 2 }}>
              <Text style={{ ...type.caption, color: theme.text2 }}>{d.label}</Text>
              <Text style={[{ ...type.body, fontWeight: '600', color: theme.text }, tabular]}>{d.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/* ─────────────────────────────── gráficos ──────────────────────────── */

const CHART_HEIGHT = 140

/**
 * Faixa transparente por cima do gráfico que recebe o toque (e o mouse, na
 * web) e diz qual ponto está mais perto. Fica por cima de tudo para o
 * `locationX` ser sempre relativo a ela, e não ao traço que o dedo tocou.
 * Soltar o dedo (ou tirar o mouse) volta para o ponto mais recente.
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
  onPick: (i: number | null) => void
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
      onResponderRelease={() => onPick(null)}
      {...(Platform.OS === 'web'
        ? ({
            onPointerMove: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX),
            onPointerLeave: () => onPick(null),
          } as object)
        : null)}
    />
  )
}

type Tab = 'evolution' | 'saved'

/**
 * Um cartão, dois gráficos: a evolução do investido e o guardado mês a mês.
 * Antes eram dois cartões, cada um com seu parágrafo; as abas deixam um à
 * vista por vez.
 */
function ChartCard({
  history,
  monthly,
  rates,
  hidden,
}: {
  history: Ready['history']
  monthly: Ready['monthly']
  rates: Ready['savings']['monthly']
  hidden: boolean
}) {
  const [tab, setTab] = useState<Tab>('evolution')
  return (
    <Card>
      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'evolution', label: 'Evolução' },
          { value: 'saved', label: 'Guardado por mês' },
        ]}
      />
      <View style={{ marginTop: spacing.lg }}>
        {tab === 'evolution' ? (
          <EvolutionChart history={history} hidden={hidden} />
        ) : (
          <SavedChart monthly={monthly} rates={rates} hidden={hidden} />
        )}
      </View>
    </Card>
  )
}

const RANGES = [
  { key: '1M', label: '1M', days: 31, name: 'no último mês' },
  { key: '3M', label: '3M', days: 92, name: 'em 3 meses' },
  { key: '6M', label: '6M', days: 183, name: 'em 6 meses' },
  { key: '1A', label: '1A', days: 366, name: 'em 1 ano' },
] as const

/** Linha suave: cada trecho curva até o meio do próximo, sem passar dos pontos. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!
    const n = pts[i + 1]!
    d += ` Q${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + n.x) / 2).toFixed(1)},${((p.y + n.y) / 2).toFixed(1)}`
  }
  const last = pts.at(-1)!
  return `${d} L${last.x.toFixed(1)},${last.y.toFixed(1)}`
}

function EvolutionChart({ history, hidden }: { history: Ready['history']; hidden: boolean }) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)

  // Só os períodos que o histórico cobre: com 20 dias de fotos, "1A" mostraria
  // o mesmo que "1M".
  const lastDay = history.at(-1)?.day ?? ''
  const firstDay = history[0]?.day ?? ''
  const ranges = RANGES.filter((r, i) => i === 0 || firstDay < daysBefore(lastDay, RANGES[i - 1]!.days))
  const [rangeKey, setRangeKey] = useState<string | null>(null)
  const range = ranges.find((r) => r.key === rangeKey) ?? ranges.at(-1)!

  const points = useMemo(() => {
    const cutoff = daysBefore(lastDay, range.days)
    return history.filter((h) => h.day >= cutoff)
  }, [history, lastDay, range.days])

  const draw = useReveal(`${range.key}:${points.length}`, { duration: 900 })
  const index = picked ?? points.length - 1
  const current = points[index]
  const first = points[0]

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
    const pad = (max - min) * 0.14
    const lo = min - pad
    const hi = max + pad
    // Folga nas pontas para o ponto em destaque não ser cortado na borda.
    const inset = 10
    const x = (i: number) => inset + (i / (points.length - 1)) * (width - inset * 2)
    const y = (v: number) => CHART_HEIGHT - ((v - lo) / (hi - lo)) * CHART_HEIGHT
    return { x, y, pts: points.map((p, i) => ({ x: x(i), y: y(p.investmentsCents) })) }
  }, [points, width])

  if (history.length < 2) {
    return (
      <View style={{ paddingVertical: spacing.lg, alignItems: 'center', gap: 8 }}>
        <Ionicons name="analytics-outline" size={26} color={theme.text3} />
        <Text style={{ ...type.body, color: theme.text2, textAlign: 'center' }}>
          A linha aparece a partir do segundo dia de histórico.
        </Text>
      </View>
    )
  }

  // A linha se desenha da esquerda para a direita.
  const shown = geometry ? geometry.pts.slice(0, Math.max(2, Math.ceil(geometry.pts.length * draw))) : []
  const line = smoothPath(shown)
  const area = shown.length
    ? `${line} L${shown.at(-1)!.x.toFixed(1)},${CHART_HEIGHT} L${shown[0]!.x.toFixed(1)},${CHART_HEIGHT} Z`
    : ''
  const change = current && first ? current.investmentsCents - first.investmentsCents : 0
  const changePct = first && first.investmentsCents > 0 ? (change / first.investmentsCents) * 100 : null
  const up = change >= 0
  // Com histórico menor que o período, "em 1 ano" mentiria: diz desde quando.
  const covers = first ? first.day <= daysBefore(lastDay, range.days - 3) : false
  const periodName = covers ? range.name : first ? `desde ${formatDate(first.day)}` : ''

  return (
    <View>
      <Text style={{ ...type.caption, color: theme.text2 }}>
        {picked === null ? 'Hoje' : current ? formatDate(current.day) : ''}
      </Text>
      <Text style={[{ fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: theme.text, marginTop: 2 }, tabular]}>
        {mask(current ? formatBRL(current.investmentsCents) : '', hidden)}
      </Text>
      {/* A variação inclui aportes e resgates: é o quanto o investido mudou, não o rendimento. */}
      <Text style={[{ ...type.caption, fontWeight: '600', color: up ? theme.positive : theme.text2, marginTop: 2 }, tabular]}>
        {mask(signed(change), hidden)}
        {changePct !== null ? ` (${percentText(changePct)})` : ''}
        <Text style={{ fontWeight: '400', color: theme.text2 }}> {picked === null ? periodName : 'no período'}</Text>
      </Text>

      <View style={{ height: CHART_HEIGHT, marginTop: spacing.lg }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geometry ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="evolution-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.accent} stopOpacity={0.28} />
                <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#evolution-fill)" />
            <Path d={line} stroke={theme.accent} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {current && draw >= 1 ? (
              <>
                {picked !== null ? (
                  <Line
                    x1={geometry.x(index)}
                    x2={geometry.x(index)}
                    y1={0}
                    y2={CHART_HEIGHT}
                    stroke={theme.text3}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                ) : null}
                <Circle
                  cx={geometry.x(index)}
                  cy={geometry.y(current.investmentsCents)}
                  r={9}
                  fill={theme.accent}
                  opacity={0.18}
                />
                <Circle
                  cx={geometry.x(index)}
                  cy={geometry.y(current.investmentsCents)}
                  r={4.5}
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

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
        <Text style={{ ...type.caption, color: theme.text3 }}>{first ? formatDate(first.day) : ''}</Text>
        {ranges.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {ranges.map((r) => {
              const active = r.key === range.key
              return (
                <Pressable
                  key={r.key}
                  onPress={() => {
                    setRangeKey(r.key)
                    setPicked(null)
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={r.name}
                  hitSlop={4}
                  style={{
                    minWidth: 34,
                    height: 26,
                    paddingHorizontal: 8,
                    borderRadius: radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? theme.accentSoft : 'transparent',
                  }}
                >
                  <Text style={{ ...type.caption, fontWeight: '700', color: active ? theme.accentText : theme.text3 }}>
                    {r.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Text style={{ ...type.caption, color: theme.text3 }}>Hoje</Text>
        )}
      </View>
    </View>
  )
}

const BAR_HEIGHT = 120
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
function SavedChart({
  monthly,
  rates,
  hidden,
}: {
  monthly: Ready['monthly']
  rates: Ready['savings']['monthly']
  hidden: boolean
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const grow = useReveal(`saved:${monthly.length}`, { duration: 800 })
  const index = picked ?? monthly.length - 1
  const selected = monthly[index]
  const selectedRate = rates.find((r) => r.month === selected?.month)?.rate ?? null

  const maxUp = Math.max(0, ...monthly.map((m) => m.savedCents))
  const maxDown = Math.max(0, ...monthly.map((m) => -m.savedCents))
  const range = maxUp + maxDown || 1
  const zeroY = (maxUp / range) * BAR_HEIGHT
  const barW = monthly.length ? (width - BAR_GAP * (monthly.length - 1)) / monthly.length : 0

  return (
    <View>
      <Text style={{ ...type.caption, color: theme.text2 }}>
        Guardado em {selected ? monthName(selected.month) : ''}
      </Text>
      {selected ? (
        <>
          <Text
            style={[
              { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginTop: 2 },
              tabular,
              { color: selected.savedCents > 0 ? theme.positive : theme.text },
            ]}
          >
            {mask(selected.savedCents === 0 ? formatBRL(0) : signed(selected.savedCents), hidden)}
          </Text>
          <Text style={[{ ...type.caption, color: theme.text2, marginTop: 2 }, tabular]} numberOfLines={1}>
            {/* Só o que aconteceu: "↓ R$ 0,00" num mês sem resgate é ruído. */}
            {[
              selected.contributionsCents > 0 ? `↑ ${mask(formatBRL(selected.contributionsCents), hidden)}` : null,
              selected.withdrawalsCents > 0 ? `↓ ${mask(formatBRL(selected.withdrawalsCents), hidden)}` : null,
              selectedRate !== null && selected.savedCents > 0 ? `${rateText(selectedRate)} da renda` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Sem aportes nem resgates'}
          </Text>
        </>
      ) : null}

      <View style={{ height: BAR_HEIGHT, marginTop: spacing.lg }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={BAR_HEIGHT}>
            {monthly.map((m, i) => {
              const local = Math.min(1, Math.max(0, grow * 1.6 - (i / monthly.length) * 0.6))
              const h = (Math.abs(m.savedCents) / range) * BAR_HEIGHT * local
              const x = i * (barW + BAR_GAP)
              const up = m.savedCents >= 0
              return (
                <Path
                  key={m.month}
                  d={barPath(x, up ? zeroY - h : zeroY, barW, Math.max(h, m.savedCents === 0 ? 0 : 2 * local), up)}
                  fill={i === index ? (up ? theme.accent : theme.text2) : theme.chartRamp[2]}
                />
              )
            })}
            <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={theme.border} strokeWidth={1} />
          </Svg>
        ) : null}
        <Scrubber width={width} count={monthly.length} bands onPick={setPicked} />
      </View>
      <View style={{ flexDirection: 'row', gap: BAR_GAP, marginTop: 8 }}>
        {monthly.map((m, i) => (
          <Text
            key={m.month}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10.5,
              color: i === index ? theme.accentText : theme.text3,
              fontWeight: i === index ? '700' : '500',
            }}
          >
            {formatMonth(m.month).charAt(0).toUpperCase()}
          </Text>
        ))}
      </View>
    </View>
  )
}
