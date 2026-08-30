import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native'
import { Card, ErrorBanner, Muted, Screen, Title } from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import {
  addMonths,
  capitalize,
  currentMonth,
  formatBRL,
  formatDate,
  formatMonth,
  monthBounds,
} from '@/lib/format'
import { radius, spacing, useTheme } from '@/lib/theme'

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

type Summary = { incomeCents: number; expenseCents: number; balanceCents: number }

export default function Lancamentos() {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth())
  const { from, to } = monthBounds(month)

  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: async () =>
      unwrap(await client.reports.summary.$get({ query: { month } })),
  })

  const list = useQuery({
    queryKey: ['transactions', month],
    queryFn: async () =>
      unwrap(
        await client.transactions.$get({ query: { from, to, limit: '100' } }),
      ),
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.transactions[':id'].$delete({ param: { id } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] })
      queryClient.invalidateQueries({ queryKey: ['summary', month] })
    },
  })

  function confirmRemove(row: Row) {
    Alert.alert('Excluir lançamento', `"${row.description || row.categoryName}" será removido.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate(row.id) },
    ])
  }

  return (
    <Screen>
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        {/* Navegação de mês: a planilha tinha uma aba por mês, aqui são duas setas. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => setMonth(addMonths(month, -1))}
            accessibilityLabel="Mês anterior"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={theme.muted} />
          </Pressable>

          <Pressable onPress={() => setMonth(currentMonth())} accessibilityLabel="Voltar para o mês atual">
            <Title>{capitalize(formatMonth(month))}</Title>
          </Pressable>

          <Pressable
            onPress={() => setMonth(addMonths(month, 1))}
            accessibilityLabel="Próximo mês"
            hitSlop={12}
          >
            <Ionicons name="chevron-forward" size={24} color={theme.muted} />
          </Pressable>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Muted>Ganhos</Muted>
              <Text style={{ color: theme.income, fontSize: 16, fontWeight: '600' }}>
                {summary.data ? formatBRL(summary.data.incomeCents) : '—'}
              </Text>
            </View>
            <View style={{ gap: 2 }}>
              <Muted>Gastos</Muted>
              <Text style={{ color: theme.expense, fontSize: 16, fontWeight: '600' }}>
                {summary.data ? formatBRL(summary.data.expenseCents) : '—'}
              </Text>
            </View>
            <View style={{ gap: 2, alignItems: 'flex-end' }}>
              <Muted>Saldo</Muted>
              <Text
                style={{
                  // Saldo negativo muda de cor E ganha o sinal, para não depender
                  // só da cor.
                  color: (summary.data?.balanceCents ?? 0) < 0 ? theme.expense : theme.text,
                  fontSize: 18,
                  fontWeight: '700',
                }}
              >
                {summary.data ? formatBRL(summary.data.balanceCents) : '—'}
              </Text>
            </View>
          </View>
        </Card>

        <ErrorBanner message={list.error?.message ?? summary.error?.message} />
      </View>

      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.muted} />
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          refreshing={list.isRefetching}
          onRefresh={() => list.refetch()}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border }} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl }}>
              <Text style={{ fontSize: 36 }}>🗒️</Text>
              <Muted>Nenhum lançamento em {formatMonth(month)}.</Muted>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => confirmRemove(item)}
              accessibilityHint="Toque e segure para excluir"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: radius.full,
                  backgroundColor: item.categoryColor,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                  {item.description || item.categoryName}
                </Text>
                <Muted>
                  {item.categoryName} · {formatDate(item.occurredOn)}
                  {item.recurrenceId ? ' · recorrente' : ''}
                </Muted>
              </View>
              <Text
                style={{
                  color: item.kind === 'expense' ? theme.expense : theme.income,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                {item.kind === 'expense' ? '−' : '+'}
                {formatBRL(item.amountCents)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  )
}
