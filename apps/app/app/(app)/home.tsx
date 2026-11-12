import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { Alert, Animated, Easing, PanResponder, Pressable, SectionList, Text, View } from 'react-native'
import {
  Amount,
  BankLogo,
  Skeleton,
  SkeletonRow,
  EmptyState,
  ErrorBanner,
  Gutter,
  ListGroup,
  Screen,
  SectionLabel,
  mask,
  useTabBarSpace,
  CategoryIcon,
  EyeToggle,
} from '@/components/ui'
import { MonthStrip } from '@/components/month-strip'
import { client, unwrap } from '@/lib/api'
import { useSelectedMonth } from '@/lib/month'
import { useHidden } from '@/lib/privacy'
import {
  addMonths,
  formatBRL,
  formatMonth,
  monthBounds,
  relativeDay,
} from '@/lib/format'
import { spacing, tabular, type, useTheme } from '@/lib/theme'

type Row = {
  id: string
  kind: 'expense' | 'income'
  occurredOn: string
  amountCents: number
  description: string
  categoryName: string
  categoryColor: string
  categoryIcon?: string | null
  /** Compra do cartão que ainda não fechou na fatura (veio do Open Finance). */
  isPending?: boolean
  /** Salário ou conta fixa prevista que ainda não aconteceu: calculado, não é lançamento. */
  isForecast?: boolean
}

export default function Home() {
  const theme = useTheme()
  const tabBarSpace = useTabBarSpace()
  const queryClient = useQueryClient()

  // O mês é o mesmo em todas as abas (lib/month).
  const [month, setMonth] = useSelectedMonth()
  const [hidden] = useHidden()

  // Trocar de mês desliza o saldo no sentido da troca: o mês seguinte entra
  // pela direita, o anterior pela esquerda.
  const direction = useRef(0)
  const slide = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  function goTo(next: string) {
    if (next === month) return
    direction.current = next > month ? 1 : -1
    setMonth(next)
  }
  useEffect(() => {
    // Sem direção, a troca veio de outra aba: a tela já aparece no mês novo,
    // sem deslizar escondida.
    if (!direction.current) return
    slide.setValue(direction.current * 28)
    direction.current = 0
    fade.setValue(0)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [month, slide, fade])

  // Arrastar o saldo para o lado troca o mês, como virar a página. Só gesto
  // claramente horizontal: a rolagem vertical da lista continua livre.
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
  const { from, to } = monthBounds(month)

  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month } })),
  })

  // Mesma chave da seção do Perfil: o cache é um só. Para quem não tem Open
  // Finance a API responde `enabled: false` e o cartão da fatura não aparece.
  const openFinance = useQuery({
    queryKey: ['open-finance'],
    queryFn: async () => unwrap(await client['open-finance'].$get()),
    refetchInterval: 5 * 60_000,
  })
  const cards = openFinance.data?.enabled && openFinance.data.connected ? openFinance.data.cards : []

  const list = useQuery({
    queryKey: ['transactions', month],
    queryFn: async () =>
      unwrap(await client.transactions.$get({ query: { from, to, limit: '100' } })),
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.transactions[':id'].$delete({ param: { id } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  function confirmRemove(row: Row) {
    Alert.alert('Excluir lançamento', `"${row.description || row.categoryName}" será removido.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate(row.id) },
    ])
  }

  // O extrato do DS é agrupado por dia, com 'Hoje' e 'Ontem' à frente.
  const sections = useMemo(() => {
    const byDay = new Map<string, Row[]>()
    const forecastRows: Row[] = (summary.data?.forecast ?? []).map((f) => ({
      id: `previsto:${f.kind}:${f.occurredOn}:${f.description}`,
      kind: f.kind,
      occurredOn: f.occurredOn,
      amountCents: f.amountCents,
      description: f.description,
      categoryName: f.categoryName,
      categoryColor: f.categoryColor ?? '',
      categoryIcon: f.categoryIcon,
      isForecast: true,
    }))
    for (const row of [...((list.data?.items ?? []) as Row[]), ...forecastRows]) {
      const bucket = byDay.get(row.occurredOn)
      if (bucket) bucket.push(row)
      else byDay.set(row.occurredOn, [row])
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, data]) => ({ title: relativeDay(day), data }))
  }, [list.data, summary.data])

  // O saldo mostrado já conta o que ainda vai acontecer no mês (o salário a
  // cair e as contas fixas a cobrar).
  const forecastIncome = summary.data?.forecastIncomeCents ?? 0
  const forecastExpense = summary.data?.forecastExpenseCents ?? 0
  const projected = (s: { balanceCents: number; forecastIncomeCents: number; forecastExpenseCents: number }) =>
    s.balanceCents + s.forecastIncomeCents - s.forecastExpenseCents
  const balance = summary.data ? projected(summary.data) : 0

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        refreshing={list.isRefetching}
        onRefresh={() => {
          list.refetch()
          summary.refetch()
        }}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        ListHeaderComponent={
          <View style={{ gap: spacing.xl, paddingBottom: spacing.sm }}>
            {/* ── a faixa de meses ── */}
            <MonthStrip month={month} onChange={goTo} />

            {/* ── saldo, e de onde ele vem ── */}
            <Animated.View
              {...swipe.panHandlers}
              style={{ paddingHorizontal: spacing.gutter, opacity: fade, transform: [{ translateX: slide }] }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Esqueleto no lugar do número, na mesma altura: o layout não
                      salta quando o saldo chega (DS, decisão 04). */}
                  {summary.data ? (
                    <Text
                      accessibilityLabel={hidden ? 'Saldo oculto' : `Saldo de ${formatBRL(balance)}`}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[type.balance, tabular, { color: theme.text }]}
                    >
                      {mask(formatBRL(balance), hidden)}
                    </Text>
                  ) : (
                    <Skeleton width={230} height={38} style={{ borderRadius: 10 }} />
                  )}
                </View>
                {/* O olho fica ao lado do valor que ele esconde. */}
                <EyeToggle />
              </View>
              {/* O saldo já conta o salário a cair e as contas fixas a cobrar:
                  sem isso, todo começo de mês parece negativo. Os valores
                  previstos aparecem na lista, marcados como "previsto". */}
              <Text style={{ ...type.caption, color: theme.text2, marginTop: 6 }}>
                {forecastIncome > 0 || forecastExpense > 0 ? 'Saldo previsto para o fim do mês' : 'Saldo do mês'}
              </Text>

              <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
                <Flow
                  label="Entradas"
                  icon="arrow-up"
                  tint={theme.positive}
                  cents={summary.data ? summary.data.incomeCents + forecastIncome : null}
                  hidden={hidden}
                />
                <Flow
                  label="Saídas"
                  icon="arrow-down"
                  tint={theme.text2}
                  cents={summary.data ? summary.data.expenseCents + forecastExpense : null}
                  hidden={hidden}
                />
              </View>
            </Animated.View>

            {/* ── fatura em aberto do cartão (Open Finance) ── */}
            {cards.length ? (
              <Gutter>
                <ListGroup>
                  {cards.map((card, i) => (
                    <View
                      key={card.bank}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        minHeight: 64,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: 10,
                        borderBottomWidth: i === cards.length - 1 ? 0 : 1,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <BankLogo uri={card.bankIcon} fallback="card-outline" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
                          Fatura {card.bank}
                        </Text>
                        {/* Quando a Pluggy leu a fatura fica no Open Finance do Perfil:
                            aqui, só o que importa para pagar. */}
                        <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
                          Vence em {card.billDueOn.slice(8, 10)}/{card.billDueOn.slice(5, 7)}
                        </Text>
                      </View>
                      <Text style={[{ ...type.row, fontWeight: '600', color: theme.text }, tabular]}>
                        {mask(formatBRL(card.billAmountCents), hidden)}
                      </Text>
                    </View>
                  ))}
                </ListGroup>
              </Gutter>
            ) : null}

            <Gutter style={{ gap: spacing.md }}>
              <ErrorBanner message={list.error?.message ?? summary.error?.message} />
              <Text style={{ ...type.section, color: theme.text }}>Lançamentos</Text>
            </Gutter>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Gutter style={{ paddingTop: 14, paddingBottom: 6 }}>
            <SectionLabel>{section.title}</SectionLabel>
          </Gutter>
        )}
        ListEmptyComponent={
          list.isPending ? (
            <Gutter style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
              {[0, 1, 2].map((i) => (
                <SkeletonRow key={i} delay={i * 100} />
              ))}
            </Gutter>
          ) : list.error ? null : (
            <Gutter>
              <EmptyState
                title={`Nenhum lançamento em ${formatMonth(month)}.`}
                hint="Os lançamentos chegam do banco pelo Open Finance."
              />
            </Gutter>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            // A previsão não é lançamento: não há o que excluir.
            onLongPress={item.isForecast ? undefined : () => confirmRemove(item)}
            accessibilityHint={item.isForecast ? undefined : 'Toque e segure para excluir'}
            style={({ pressed }) => ({ opacity: item.isForecast ? 0.55 : pressed ? 0.6 : 1 })}
          >
            <Gutter
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 56,
                paddingVertical: 4,
              }}
            >
              <CategoryIcon icon={item.categoryIcon} color={item.categoryColor} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
                  {item.description || item.categoryName}
                </Text>
                <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
                  {item.categoryName}
                  {item.isPending ? ' · pendente' : ''}
                  {item.isForecast ? ' · previsto' : ''}
                </Text>
              </View>
              <Amount
                cents={item.amountCents}
                direction={item.kind === 'income' ? 'in' : 'out'}
                format={formatBRL}
                hidden={hidden}
              />
            </Gutter>
          </Pressable>
        )}
      />
    </Screen>
  )
}

/** Entradas ou saídas do mês: rótulo pequeno, seta e o valor. */
function Flow({
  label,
  icon,
  tint,
  cents,
  hidden,
}: {
  label: string
  icon: 'arrow-up' | 'arrow-down'
  tint: string
  cents: number | null
  hidden: boolean
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ ...type.caption, color: theme.text2 }}>{label}</Text>
      {cents === null ? (
        <Skeleton width={96} height={14} style={{ marginTop: 3 }} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={icon} size={14} color={tint} />
          <Text style={[{ fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: theme.text }, tabular]}>
            {mask(formatBRL(cents), hidden)}
          </Text>
        </View>
      )}
    </View>
  )
}

