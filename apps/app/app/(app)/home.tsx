import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, SectionList, Text, View } from 'react-native'
import {
  Amount,
  Avatar,
  Skeleton,
  SkeletonRow,
  Chip,
  EmptyState,
  ErrorBanner,
  Gutter,
  InkCard,
  Screen,
  SectionLabel,
  TrustNote,
  privacyBlur,
} from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { client, unwrap } from '@/lib/api'
import {
  addMonths,
  currentMonth,
  formatBRL,
  formatMonth,
  monthBounds,
  percentDelta,
  relativeDay,
  toneOf,
} from '@/lib/format'
import { inkCard, radius, spacing, tabular, type, useTheme } from '@/lib/theme'

type Row = {
  id: string
  kind: 'expense' | 'income'
  occurredOn: string
  amountCents: number
  description: string
  categoryName: string
  categoryColor: string
  recurrenceId: string | null
}

export default function Home() {
  const theme = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  const [month, setMonth] = useState(currentMonth())
  const [hidden, setHidden] = useState(false)
  const { from, to } = monthBounds(month)
  const previous = addMonths(month, -1)

  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month } })),
  })

  // O DS mostra a variação contra o mês anterior na pílula abaixo do saldo;
  // é o mesmo endpoint, só com outro mês.
  const before = useQuery({
    queryKey: ['summary', previous],
    queryFn: async () => unwrap(await client.reports.summary.$get({ query: { month: previous } })),
  })

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
    for (const row of (list.data?.items ?? []) as Row[]) {
      const bucket = byDay.get(row.occurredOn)
      if (bucket) bucket.push(row)
      else byDay.set(row.occurredOn, [row])
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, data]) => ({ title: relativeDay(day), data }))
  }, [list.data])

  const balance = summary.data?.balanceCents ?? 0
  const delta =
    summary.data && before.data
      ? percentDelta(summary.data.balanceCents, before.data.balanceCents)
      : null

  const quickActions = [
    { key: 'new', label: 'Novo', icon: 'add-outline', go: () => router.push('/new') },
    { key: 'reports', label: 'Relatórios', icon: 'pie-chart-outline', go: () => router.push('/reports') },
    { key: 'import', label: 'Importar', icon: 'cloud-upload-outline', go: () => router.push('/import') },
    { key: 'settings', label: 'Perfil', icon: 'person-outline', go: () => router.push('/settings') },
  ] as const

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
          before.refetch()
        }}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <View style={{ gap: spacing.xl, paddingBottom: spacing.lg }}>
            {/* ── cabeçalho: saudação, inicial e o olho de privacidade ── */}
            <Gutter style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={session?.user.name ?? '?'} tone={toneOf(session?.user.name ?? '')} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.body, color: theme.text2 }}>{greeting()},</Text>
                <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text, marginTop: 1 }}>
                  {session?.user.name ?? 'Você'}
                </Text>
              </View>
              <Pressable
                onPress={() => setHidden((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                accessibilityState={{ checked: hidden }}
                hitSlop={8}
                style={styles.iconButton}
              >
                <Ionicons
                  name={hidden ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={theme.text2}
                />
              </Pressable>
            </Gutter>

            {/* ── saldo do mês: o número de 40px que o DS coloca em 0 toques ── */}
            <Gutter>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={() => setMonth(addMonths(month, -1))}
                  accessibilityLabel="Mês anterior"
                  hitSlop={12}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.text3} />
                </Pressable>
                <Pressable onPress={() => setMonth(currentMonth())} accessibilityLabel="Voltar para o mês atual">
                  <Text style={{ ...type.body, color: theme.text2, letterSpacing: 0.2 }}>
                    Saldo de {formatMonth(month)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMonth(addMonths(month, 1))}
                  accessibilityLabel="Próximo mês"
                  hitSlop={12}
                >
                  <Ionicons name="chevron-forward" size={18} color={theme.text3} />
                </Pressable>
              </View>

              {/* Esqueleto no lugar do número, na mesma altura: o layout não
                  salta quando o saldo chega (DS, decisão 04). */}
              {summary.data ? (
                <Text
                  accessibilityLabel={hidden ? 'Saldo oculto' : `Saldo de ${formatBRL(balance)}`}
                  style={[
                    type.balance,
                    tabular,
                    { color: theme.text, marginTop: 6 },
                    privacyBlur(hidden, theme.text),
                  ]}
                >
                  {formatBRL(balance)}
                </Text>
              ) : (
                <Skeleton width={230} height={38} style={{ marginTop: 8, borderRadius: 10 }} />
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                {delta === null ? null : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingVertical: 5,
                      paddingHorizontal: 9,
                      borderRadius: radius.full,
                      backgroundColor: delta >= 0 ? theme.accentSoft : theme.surface2,
                    }}
                  >
                    <Ionicons
                      name={delta >= 0 ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={delta >= 0 ? theme.accentText : theme.text2}
                    />
                    {/* O sinal acompanha a cor: a seta e o + / − dizem a direção
                        sozinhos, para quem não separa os dois tons. */}
                    <Text
                      style={{
                        ...type.caption,
                        ...tabular,
                        fontWeight: '600',
                        color: delta >= 0 ? theme.accentText : theme.text2,
                      }}
                    >
                      {delta >= 0 ? '+' : '−'}
                      {Math.abs(delta).toFixed(1).replace('.', ',')}%
                    </Text>
                  </View>
                )}
                <Text style={{ ...type.caption, color: theme.text2 }}>vs. {formatMonth(previous)}</Text>
              </View>
            </Gutter>

            {/* ── ações rápidas: o carrossel de pílulas do DS ── */}
            {/* Carrossel, não grade: o DS rola as ações na horizontal, então
                uma ação a mais nunca abre uma segunda linha órfã. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.gutter }}
            >
              {quickActions.map((action) => (
                <Chip
                  key={action.key}
                  label={action.label}
                  active={false}
                  accessibilityRole="button"
                  onPress={action.go}
                  leading={<Ionicons name={action.icon} size={17} color={theme.accent} />}
                />
              ))}
            </ScrollView>

            {/* ── o cartão de tinta: entradas e saídas do mês ── */}
            <Gutter>
              <InkCard>
                <Text style={{ ...type.overline, color: inkCard.textSoft, letterSpacing: 1.4 }}>
                  Resumo de {formatMonth(month)}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ ...type.caption, color: inkCard.textSoft }}>Entradas</Text>
                    {summary.data ? (
                      <Text
                        style={[
                          { fontSize: 19, fontWeight: '600', color: inkCard.text },
                          tabular,
                          privacyBlur(hidden, inkCard.text),
                        ]}
                      >
                        + {formatBRL(summary.data.incomeCents)}
                      </Text>
                    ) : (
                      <Skeleton width="70%" height={16} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ ...type.caption, color: inkCard.textSoft }}>Saídas</Text>
                    {summary.data ? (
                      <Text
                        style={[
                          { fontSize: 19, fontWeight: '600', color: inkCard.text },
                          tabular,
                          privacyBlur(hidden, inkCard.text),
                        ]}
                      >
                        − {formatBRL(summary.data.expenseCents)}
                      </Text>
                    ) : (
                      <Skeleton width="70%" height={16} delay={100} />
                    )}
                  </View>
                </View>
              </InkCard>
            </Gutter>

            <Gutter style={{ gap: spacing.md }}>
              <ErrorBanner message={list.error?.message ?? summary.error?.message} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ ...type.section, color: theme.text }}>Lançamentos</Text>
                <Pressable onPress={() => router.push('/reports')} hitSlop={8}>
                  <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>
                    Ver relatórios
                  </Text>
                </Pressable>
              </View>
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
                hint="Toque em Novo para registrar o primeiro — ou importe sua planilha em Perfil."
              />
            </Gutter>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => confirmRemove(item)}
            accessibilityHint="Toque e segure para excluir"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
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
              <Avatar
                name={item.description || item.categoryName}
                tone={toneOf(item.categoryName)}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.row, color: theme.text }} numberOfLines={1}>
                  {item.description || item.categoryName}
                </Text>
                <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
                  {item.categoryName}
                  {item.recurrenceId ? ' · recorrente' : ''}
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
        ListFooterComponent={
          sections.length ? (
            <Gutter>
              <TrustNote icon={<Ionicons name="lock-closed-outline" size={13} color={theme.text3} />}>
                Seus dados ficam só na sua conta
              </TrustNote>
            </Gutter>
          ) : null
        }
      />
    </Screen>
  )
}

function greeting(): string {
  // A hora sai em en-US/h23 e passa por parseInt: o padrão pt-BR varia entre
  // motores ICU (há os que devolvem "14 h"), e Number() disso é NaN.
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' })
      .format(new Date()),
    10,
  )
  if (hour < 12) return 'Bom dia'
  return hour < 18 ? 'Boa tarde' : 'Boa noite'
}

const styles = {
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
} as const
