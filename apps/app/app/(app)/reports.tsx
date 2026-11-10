import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import {
  Card,
  EmptyState,
  ErrorBanner,
  Gutter,
  Screen,
  SectionLabel,
  Skeleton,
  Title,
} from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import {
  addMonths,
  capitalize,
  currentMonth,
  formatBRL,
  formatMonth,
  monthBounds,
  percentDelta,
} from '@/lib/format'
import { radius, spacing, tabular, type, useTheme } from '@/lib/theme'

/** Medidas da rosca, copiadas do artboard: 112px de caixa, raio 41, traço 13. */
const SIZE = 112
const RADIUS = 41
const STROKE = 13
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** O respiro de 2px entre fatias que o DS desenha. */
const GAP = 2

export default function Reports() {
  const theme = useTheme()
  const [month, setMonth] = useState(currentMonth())
  const { from, to } = monthBounds(month)
  const previous = addMonths(month, -1)

  const byCategory = useQuery({
    queryKey: ['by-category', month],
    queryFn: async () =>
      unwrap(await client.reports['by-category'].$get({ query: { from, to, kind: 'expense' } })),
  })

  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month } })),
  })

  const before = useQuery({
    queryKey: ['summary', previous],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month: previous } })),
  })

  const rows = byCategory.data ?? []
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0)

  /**
   * O DS pede uma cor de destaque e uma rampa slate — sem legenda arco-íris.
   * A rampa tem quatro degraus, então as três maiores categorias ficam
   * nomeadas e o resto vira 'Outras': o gráfico nunca cresce além do sistema.
   */
  const slices = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.totalCents - a.totalCents)
    const top = sorted.slice(0, 3).map((row) => ({
      key: row.categoryId,
      name: row.categoryName,
      cents: row.totalCents,
      count: row.transactionCount,
    }))
    const rest = sorted.slice(3)
    if (rest.length) {
      top.push({
        key: 'outras',
        name: `Outras (${rest.length})`,
        cents: rest.reduce((sum, row) => sum + row.totalCents, 0),
        count: rest.reduce((sum, row) => sum + row.transactionCount, 0),
      })
    }
    return top.map((slice, index) => ({ ...slice, color: theme.chartRamp[index] }))
  }, [rows, theme.chartRamp])

  const delta =
    summary.data && before.data
      ? percentDelta(summary.data.expenseCents, before.data.expenseCents)
      : null

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl, gap: spacing.xl }}>
        <Gutter style={{ gap: spacing.lg }}>
          <Title>Relatórios</Title>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
              <Ionicons name="chevron-back" size={18} color={theme.text3} />
            </Pressable>
            <Pressable onPress={() => setMonth(currentMonth())} accessibilityLabel="Voltar para o mês atual">
              <Text style={{ ...type.body, fontWeight: '600', color: theme.text2 }}>
                {capitalize(formatMonth(month))}
              </Text>
            </Pressable>
            <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
              <Ionicons name="chevron-forward" size={18} color={theme.text3} />
            </Pressable>
          </View>

          <ErrorBanner message={byCategory.error?.message} />
        </Gutter>

        {byCategory.isPending ? (
          /* O esqueleto guarda a forma do cartão inteiro — rosca e legenda —
             para nada saltar quando o relatório chega (DS, decisão 04). */
          <Gutter>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
                <View
                  style={{
                    width: SIZE,
                    height: SIZE,
                    borderRadius: SIZE / 2,
                    borderWidth: STROKE,
                    borderColor: theme.skeleton,
                  }}
                />
                <View style={{ flex: 1, gap: 11 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} width="100%" height={11} delay={i * 90} />
                  ))}
                </View>
              </View>
            </Card>
          </Gutter>
        ) : slices.length === 0 ? (
          <Gutter>
            <EmptyState
              title={`Sem gastos em ${formatMonth(month)}.`}
              hint="Assim que houver lançamentos de saída, a divisão por categoria aparece aqui."
            />
          </Gutter>
        ) : (
          <Gutter style={{ gap: spacing.xl }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ ...type.section, color: theme.text }}>
                  Gastos de {formatMonth(month).split(' de ')[0]}
                </Text>
                <Text style={{ ...type.body, ...tabular, color: theme.text2 }}>{formatBRL(total)}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: 14 }}>
                <View style={{ width: SIZE, height: SIZE }}>
                  <Svg width={SIZE} height={SIZE}>
                    {/* -90° põe a primeira fatia no topo, como no artboard.
                        O pivô vai dentro do próprio `rotate()`: o prop
                        `rotation` do react-native-svg depende de originX/originY,
                        que na web viram o atributo `transform-origin` em
                        kebab-case — nome que o React DOM recusa, deixando a
                        rosca girar em torno de (0,0). */}
                    <G transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                      <Circle
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={RADIUS}
                        fill="none"
                        stroke={theme.track}
                        strokeWidth={STROKE}
                      />
                      {slices.map((slice, index) => {
                        const before_ = slices
                          .slice(0, index)
                          .reduce((sum, s) => sum + (s.cents / total) * CIRCUMFERENCE, 0)
                        const length = (slice.cents / total) * CIRCUMFERENCE
                        return (
                          <Circle
                            key={slice.key}
                            cx={SIZE / 2}
                            cy={SIZE / 2}
                            r={RADIUS}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth={STROKE}
                            strokeDasharray={`${Math.max(length - GAP, 0)} ${CIRCUMFERENCE - length + GAP}`}
                            strokeDashoffset={-before_}
                          />
                        )
                      })}
                    </G>
                  </Svg>

                  {/* O centro carrega só a comparação mês a mês — sem valores
                      flutuantes sobre o gráfico (DS, decisão 05). */}
                  <View style={styles.donutCenter}>
                    <Text style={{ ...type.overline, textTransform: 'none', letterSpacing: 0, color: theme.text2 }}>
                      vs. {formatMonth(previous).split(' de ')[0]}
                    </Text>
                    <Text
                      style={{
                        ...type.section,
                        ...tabular,
                        color: delta !== null && delta <= 0 ? theme.accentText : theme.text,
                      }}
                    >
                      {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(0)}%`}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1, gap: 11, minWidth: 0 }}>
                  {slices.map((slice) => (
                    <View key={slice.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <View style={[styles.swatch, { backgroundColor: slice.color }]} />
                      <Text style={{ ...type.body, color: theme.text, flex: 1 }} numberOfLines={1}>
                        {slice.name}
                      </Text>
                      <Text style={{ ...type.body, ...tabular, fontWeight: '600', color: theme.text }}>
                        {formatBRL(slice.cents)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            {/* A tabela por categoria continua: a rosca dá a proporção, a lista
                dá o número exato e a contagem. */}
            <View style={{ gap: spacing.md }}>
              <SectionLabel>Todas as categorias</SectionLabel>
              {[...rows]
                .sort((a, b) => b.totalCents - a.totalCents)
                .map((row) => {
                  const share = total > 0 ? row.totalCents / total : 0
                  return (
                    <View key={row.categoryId} style={{ gap: 6, paddingVertical: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                        <Text style={{ ...type.row, color: theme.text, flex: 1 }} numberOfLines={1}>
                          {row.categoryName}
                        </Text>
                        <Text style={{ ...type.row, ...tabular, color: theme.text }}>
                          {formatBRL(row.totalCents)}
                        </Text>
                        <Text style={{ ...type.row, ...tabular, color: theme.text2, width: 44, textAlign: 'right' }}>
                          {Math.round(share * 100)}%
                        </Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: theme.track }]}>
                        <View
                          style={{
                            width: `${Math.max(share * 100, 1)}%`,
                            height: '100%',
                            backgroundColor: theme.accent,
                          }}
                        />
                      </View>
                      <Text style={{ ...type.caption, color: theme.text2 }}>
                        {row.transactionCount} lançamento{row.transactionCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  )
                })}
            </View>
          </Gutter>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = {
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 9×9 com canto 3: o quadradinho da legenda, não um círculo. */
  swatch: { width: 9, height: 9, borderRadius: 3, flexShrink: 0 },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
} as const
