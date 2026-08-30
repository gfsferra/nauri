import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Card, ErrorBanner, Muted, Screen, Title } from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import {
  addMonths,
  capitalize,
  currentMonth,
  formatBRL,
  formatMonth,
  monthBounds,
} from '@/lib/format'
import { radius, spacing, useTheme } from '@/lib/theme'

type ByCategory = {
  categoryId: string
  categoryName: string
  categoryColor: string
  kind: 'expense' | 'income'
  totalCents: number
  transactionCount: number
}

export default function Relatorios() {
  const theme = useTheme()
  const [month, setMonth] = useState(currentMonth())
  const { from, to } = monthBounds(month)

  const byCategory = useQuery({
    queryKey: ['by-category', month],
    queryFn: async () =>
      unwrap(
        await client.reports['by-category'].$get({ query: { from, to, kind: 'expense' } }),
      ),
  })

  const rows = byCategory.data ?? []
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0)

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
            <Ionicons name="chevron-back" size={24} color={theme.muted} />
          </Pressable>
          <Title>{capitalize(formatMonth(month))}</Title>
          <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
            <Ionicons name="chevron-forward" size={24} color={theme.muted} />
          </Pressable>
        </View>

        <ErrorBanner message={byCategory.error?.message} />

        {byCategory.isPending ? (
          <ActivityIndicator color={theme.muted} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl }}>
            <Text style={{ fontSize: 36 }}>📊</Text>
            <Muted>Sem gastos em {formatMonth(month)}.</Muted>
          </View>
        ) : (
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Muted>Gasto no mês</Muted>
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>
                {formatBRL(total)}
              </Text>
            </View>

            {/*
              Barras proporcionais em View comum: para "quanto cada categoria
              pesa" isso comunica igual a um gráfico de pizza, lê melhor em tela
              estreita e não custa nenhuma dependência nativa.
            */}
            {rows.map((row) => {
              const share = total > 0 ? row.totalCents / total : 0
              return (
                <View key={row.categoryId} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '500' }}>
                      {row.categoryName}
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 14 }}>
                      {formatBRL(row.totalCents)}
                      <Text style={{ color: theme.muted }}>  {Math.round(share * 100)}%</Text>
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 8,
                      borderRadius: radius.full,
                      backgroundColor: theme.inputBg,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.max(share * 100, 1)}%`,
                        height: '100%',
                        backgroundColor: row.categoryColor,
                      }}
                    />
                  </View>
                  <Muted>
                    {row.transactionCount} lançamento{row.transactionCount === 1 ? '' : 's'}
                  </Muted>
                </View>
              )
            })}
          </Card>
        )}
      </ScrollView>
    </Screen>
  )
}
