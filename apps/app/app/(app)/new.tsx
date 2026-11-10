import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Button, Chip, ErrorBanner, Gutter, Screen, SectionLabel, Title } from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { formatCents, formatDate, popDigit, pushDigit, today } from '@/lib/format'
import { radius, spacing, tabular, type, useTheme } from '@/lib/theme'

/** As doze teclas do artboard, na mesma ordem. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'] as const

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export default function NewTransaction() {
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
      router.push('/home')
    },
    onError: (e: Error) => setError(e.message),
  })

  const canSave = cents > 0 && categoryId !== null

  function press(key: string) {
    if (key === '⌫') return setCents(popDigit(cents))
    setCents(key.split('').reduce((value, digit) => pushDigit(value, digit), cents))
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl, gap: spacing.xl }}>
        <Gutter style={{ gap: spacing.lg }}>
          <Title>Novo lançamento</Title>

          {/*
            Gasto ou ganho. Os dois usam o mesmo destaque quando escolhidos: o
            DS reserva o coral a ação destrutiva, e gasto normal não é erro
            (decisão 01). Quem diz qual é qual é o próprio rótulo.
          */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(['expense', 'income'] as const).map((option) => (
              <Chip
                key={option}
                label={option === 'expense' ? 'Gasto' : 'Ganho'}
                active={kind === option}
                onPress={() => {
                  setKind(option)
                  setCategoryId(null) // categoria de gasto não serve para ganho
                }}
                leading={
                  <Ionicons
                    name={option === 'expense' ? 'arrow-up-outline' : 'arrow-down-outline'}
                    size={15}
                    color={kind === option ? theme.accentText : theme.text3}
                  />
                }
              />
            ))}
          </View>
        </Gutter>

        {/*
          O valor no tamanho de manchete do DS, alinhado à esquerda, com o
          teclado próprio logo abaixo. Os dígitos entram pela direita, como numa
          maquininha: o usuário nunca digita a vírgula, o que elimina o erro de
          lançar R$ 1.000,00 no lugar de R$ 10,00 por causa do separador do
          teclado do aparelho.
        */}
        <Gutter>
          <Text style={{ ...type.body, color: theme.text2 }}>
            Valor do {kind === 'expense' ? 'gasto' : 'ganho'}
          </Text>
          <Text
            accessibilityLabel={`Valor: ${formatCents(cents)} reais`}
            style={[
              type.keypad,
              tabular,
              { color: cents > 0 ? theme.text : theme.text3, marginTop: 6 },
            ]}
          >
            R$ {formatCents(cents)}
          </Text>
        </Gutter>

        <View style={styles.keypad}>
          {KEYS.map((key) => (
            <Pressable
              key={key}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? 'Apagar último dígito' : key}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? theme.surface2 : 'transparent' },
              ]}
            >
              <Text style={{ fontSize: 23, fontWeight: '500', color: theme.text }}>{key}</Text>
            </Pressable>
          ))}
        </View>

        <Gutter style={{ gap: spacing.md }}>
          <SectionLabel>Categoria</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {visible.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                active={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </View>
        </Gutter>

        <Gutter style={{ gap: spacing.md }}>
          <SectionLabel>Data</SectionLabel>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 48,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              backgroundColor: theme.surface2,
            }}
          >
            <Pressable onPress={() => setOccurredOn(shiftDate(occurredOn, -1))} hitSlop={10} accessibilityLabel="Dia anterior">
              <Ionicons name="chevron-back" size={20} color={theme.text2} />
            </Pressable>
            <Pressable onPress={() => setOccurredOn(today())} style={{ flex: 1 }}>
              <Text style={{ ...type.row, color: theme.text, textAlign: 'center' }}>
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
                size={20}
                // Lançar no futuro é quase sempre engano de digitação; para isso
                // existem os recorrentes.
                color={occurredOn < today() ? theme.text2 : theme.border}
              />
            </Pressable>
          </View>
        </Gutter>

        <Gutter style={{ gap: spacing.md }}>
          <SectionLabel>Descrição (opcional)</SectionLabel>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Feira da semana"
            placeholderTextColor={theme.text3}
            maxLength={200}
            style={{
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 14,
              backgroundColor: theme.surface2,
              color: theme.text,
              fontSize: 14.5,
              letterSpacing: -0.2,
            }}
          />
        </Gutter>

        <Gutter style={{ gap: spacing.md }}>
          <ErrorBanner message={error} />
          <Button
            label="Salvar lançamento"
            onPress={() => {
              setError(null)
              create.mutate()
            }}
            loading={create.isPending}
            disabled={!canSave}
            icon={<Ionicons name="checkmark" size={17} color="#FFFFFF" />}
          />
        </Gutter>
      </ScrollView>
    </Screen>
  )
}

const styles = {
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },
  /** Grade de 3 colunas, teclas de 56px e canto 16 — a do artboard. */
  key: {
    width: '33.333%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
} as const
