import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Button, Card, ErrorBanner, Muted, Screen, Title } from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { formatCents, formatDate, today } from '@/lib/format'
import { radius, spacing, useTheme } from '@/lib/theme'

type Category = {
  id: string
  name: string
  kind: 'expense' | 'income'
  color: string
  isArchived: boolean
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export default function Novo() {
  const theme = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [cents, setCents] = useState(0)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [error, setError] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => unwrap(await client.categories.$get()),
    staleTime: 5 * 60_000,
  })

  const visible = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === kind && !c.isArchived),
    [categories.data, kind],
  )

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.transactions.$post({
          json: {
            kind,
            amountCents: cents,
            categoryId: categoryId!,
            description: description.trim(),
            occurredOn,
          },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      // Zera valor e descrição mas mantém tipo, categoria e data: lançar a
      // feira e depois o estacionamento não deveria custar dois formulários.
      setCents(0)
      setDescription('')
      router.push('/lancamentos')
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSave = cents > 0 && categoryId !== null

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <Title>Novo lançamento</Title>

        {/* Gasto ou ganho — o que na planilha era escolher a coluna A ou B. */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['expense', 'income'] as const).map((option) => {
            const active = kind === option
            const color = option === 'expense' ? theme.expense : theme.income
            return (
              <Pressable
                key={option}
                onPress={() => {
                  setKind(option)
                  setCategoryId(null) // categoria de gasto não serve para ganho
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? color : theme.border,
                  backgroundColor: active ? `${color}18` : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: active ? color : theme.muted, fontWeight: '600' }}>
                  {option === 'expense' ? 'Gasto' : 'Ganho'}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/*
          Máscara de moeda: os dígitos entram pela direita, como numa maquininha.
          O usuário nunca digita a vírgula — o que elimina o erro de lançar
          R$ 1.000,00 no lugar de R$ 10,00 por causa do separador do teclado.
        */}
        <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Muted>Valor</Muted>
          <TextInput
            value={formatCents(cents)}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '')
              setCents(Math.min(Number(digits || '0'), 1_000_000_000_000))
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            accessibilityLabel="Valor em reais"
            style={{
              color: kind === 'expense' ? theme.expense : theme.income,
              fontSize: 40,
              fontWeight: '700',
              textAlign: 'center',
              minWidth: 200,
            }}
          />
          <Muted>R$</Muted>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Muted>Categoria</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {visible.map((category) => {
              const active = categoryId === category.id
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: spacing.md,
                    height: 38,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: active ? category.color : theme.border,
                    backgroundColor: active ? `${category.color}22` : theme.card,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radius.full,
                      backgroundColor: category.color,
                    }}
                  />
                  <Text style={{ color: theme.text, fontSize: 14 }}>{category.name}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Muted>Data</Muted>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable onPress={() => setOccurredOn(shiftDate(occurredOn, -1))} hitSlop={10} accessibilityLabel="Dia anterior">
              <Ionicons name="chevron-back" size={22} color={theme.muted} />
            </Pressable>
            <Pressable onPress={() => setOccurredOn(today())} style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, textAlign: 'center', fontWeight: '500' }}>
                {occurredOn === today() ? 'Hoje' : formatDate(occurredOn)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => occurredOn < today() && setOccurredOn(shiftDate(occurredOn, 1))}
              hitSlop={10}
              accessibilityLabel="Próximo dia"
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                // Lançar no futuro é quase sempre engano de digitação; para isso
                // existem os recorrentes.
                color={occurredOn < today() ? theme.muted : theme.border}
              />
            </Pressable>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Muted>Descrição (opcional)</Muted>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Feira da semana"
            placeholderTextColor={theme.muted}
            maxLength={200}
            style={{
              height: 52,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              backgroundColor: theme.inputBg,
              color: theme.text,
              fontSize: 16,
            }}
          />
        </View>

        <ErrorBanner message={error} />

        <Button
          label="Salvar lançamento"
          onPress={() => {
            setError(null)
            create.mutate()
          }}
          loading={create.isPending}
          disabled={!canSave}
        />
      </ScrollView>
    </Screen>
  )
}
