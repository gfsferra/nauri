import { Ionicons } from '@expo/vector-icons'
import { normalizeDescription } from '@nauri/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Amount,
  Button,
  CategoryIcon,
  ErrorBanner,
  ListGroup,
  ListRow,
  SectionLabel,
  Toggle,
} from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { formatBRL, formatDate } from '@/lib/format'
import { useReducedMotion } from '@/lib/motion'
import { useHidden } from '@/lib/privacy'
import { radius, spacing, type, useTheme } from '@/lib/theme'

/** O que a folha precisa de um lançamento: o mesmo formato da listagem da API. */
export type SheetTransaction = {
  id: string
  kind: 'expense' | 'income'
  occurredOn: string
  amountCents: number
  description: string
  categoryId: string
  categoryName: string
  categoryColor: string | null
  categoryIcon?: string | null
  isPending?: boolean
  fromBank?: boolean
}

/* Uma folha só para o app inteiro, como o olho (lib/privacy): a Início e os
   Relatórios chamam `openTransaction` e o layout das abas a desenha. */

let current: SheetTransaction | null = null
const listeners = new Set<() => void>()

export function openTransaction(tx: SheetTransaction): void {
  current = tx
  listeners.forEach((l) => l())
}

function closeTransaction(): void {
  current = null
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Montado uma vez, no layout das abas. */
export function TransactionSheetHost() {
  const tx = useSyncExternalStore(subscribe, () => current, () => null)
  return (
    <Modal visible={tx !== null} transparent animationType="fade" onRequestClose={closeTransaction}>
      {tx ? <Sheet key={tx.id} tx={tx} /> : null}
    </Modal>
  )
}

/** O que uma troca de categoria muda: a lista, os totais por categoria e os relatórios. */
const AFFECTED = [['transactions'], ['summary'], ['by-category'], ['monthly']]

function Sheet({ tx }: { tx: SheetTransaction }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const queryClient = useQueryClient()
  const [hidden] = useHidden()

  const [categoryId, setCategoryId] = useState(tx.categoryId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Sobe de baixo, como as folhas do iOS.
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current
  useEffect(() => {
    if (reduced) return
    Animated.timing(rise, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [rise, reduced])

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => unwrap(await client.categories.$get()),
    staleTime: 5 * 60_000,
  })
  const rules = useQuery({
    queryKey: ['category-rules'],
    queryFn: async () => unwrap(await client['category-rules'].$get()),
  })

  const pattern = normalizeDescription(tx.description)
  const rule = rules.data?.find((r) => r.kind === tx.kind && r.pattern === pattern) ?? null

  function refresh() {
    for (const key of AFFECTED) queryClient.invalidateQueries({ queryKey: key })
  }

  /** Cria (ou troca) a regra e aplica nos lançamentos com a mesma descrição. */
  const saveRule = useMutation({
    mutationFn: async (target: string) =>
      unwrap(await client['category-rules'].$post({ json: { transactionId: tx.id, categoryId: target } })),
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: ['category-rules'] })
      refresh()
      // `updated` inclui este lançamento quando ele também mudou de categoria.
      setNotice(
        updated > 0
          ? `Regra salva · ${updated} ${updated === 1 ? 'lançamento trocado' : 'lançamentos trocados'}`
          : 'Regra salva · vale para os próximos também',
      )
    },
  })

  const removeRule = useMutation({
    mutationFn: async (id: string) => unwrap(await client['category-rules'][':id'].$delete({ param: { id } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-rules'] })
      setNotice('Regra removida · os lançamentos ficam como estão')
    },
  })

  const recategorize = useMutation({
    mutationFn: async (target: string) =>
      unwrap(await client.transactions[':id'].$patch({ param: { id: tx.id }, json: { categoryId: target } })),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: async () => unwrap(await client.transactions[':id'].$delete({ param: { id: tx.id } })),
    onSuccess: () => {
      refresh()
      closeTransaction()
    },
  })

  function pick(target: string) {
    if (target === categoryId) return
    const previous = categoryId
    setCategoryId(target)
    setNotice(null)
    // Com regra ligada, trocar a categoria troca a regra (e o histórico junto).
    const done = { onError: () => setCategoryId(previous) }
    if (rule) saveRule.mutate(target, done)
    else recategorize.mutate(target, done)
  }

  function toggleRule() {
    // A linha fica tocável o tempo todo (trocar de Pressable para View no
    // meio do envio tiraria o foco dela); o toque durante o envio só é ignorado.
    if (busy || rules.isPending) return
    setNotice(null)
    if (rule) removeRule.mutate(rule.id)
    else saveRule.mutate(categoryId)
  }

  const options = (categories.data ?? [])
    .filter((c) => c.kind === tx.kind && (!c.isArchived || c.id === categoryId))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const selected = options.find((c) => c.id === categoryId)
  const busy = saveRule.isPending || removeRule.isPending || recategorize.isPending
  const error =
    saveRule.error?.message ?? removeRule.error?.message ?? recategorize.error?.message ?? remove.error?.message

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      {/* O fundo escurecido fecha ao toque; para o leitor de tela, o "Fechar" é o botão do canto. */}
      <Pressable
        accessible={false}
        onPress={closeTransaction}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.45)' }}
      />
      <Animated.View
        accessibilityViewIsModal
        style={{
          maxHeight: '88%',
          borderTopLeftRadius: radius.card + 4,
          borderTopRightRadius: radius.card + 4,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: theme.border,
          borderTopColor: theme.edgeTop,
          backgroundColor: theme.bg,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }],
        }}
      >
        {/* A alça e o fechar. */}
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: theme.skeleton }} />
        </View>
        <Pressable
          onPress={closeTransaction}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            width: 36,
            height: 36,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surface2,
            zIndex: 1,
          }}
        >
          <Ionicons name="close" size={18} color={theme.text2} />
        </Pressable>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── o lançamento ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: 40 }}>
            <CategoryIcon
              icon={selected?.icon ?? tx.categoryIcon}
              color={selected?.color ?? tx.categoryColor}
              size={48}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ ...type.section, color: theme.text }} numberOfLines={2}>
                {tx.description || tx.categoryName}
              </Text>
              <Text style={{ ...type.caption, color: theme.text2, marginTop: 3 }} numberOfLines={1}>
                {formatDate(tx.occurredOn)}
                {tx.isPending ? ' · pendente' : ''}
                {tx.fromBank ? ' · Open Finance' : ''}
              </Text>
            </View>
          </View>
          <Amount
            cents={tx.amountCents}
            direction={tx.kind === 'income' ? 'in' : 'out'}
            format={formatBRL}
            size={28}
            hidden={hidden}
          />

          {/* ── categoria ── */}
          <View style={{ gap: spacing.sm }}>
            <SectionLabel>Categoria</SectionLabel>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {options.map((c) => {
                const active = c.id === categoryId
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => pick(c.id)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    aria-checked={active}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      minHeight: 40,
                      paddingLeft: 6,
                      paddingRight: 13,
                      borderRadius: radius.full,
                      borderWidth: 1,
                      borderColor: active ? theme.accent : theme.border,
                      backgroundColor: active ? theme.accentSoft : theme.surface,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={28} />
                    <Text
                      style={{ ...type.body, fontWeight: '600', color: active ? theme.accentText : theme.text }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* ── sempre usar ── */}
          {pattern ? (
            <View style={{ gap: spacing.sm }}>
              <ListGroup>
                <ListRow
                  icon={<Ionicons name="repeat-outline" size={17} color={theme.accentText} />}
                  label={`Sempre usar para “${tx.description.trim()}”`}
                  checked={rule !== null}
                  trailing={<Toggle value={rule !== null} />}
                  onPress={toggleRule}
                  last
                />
              </ListGroup>
              {notice ? (
                <Text style={{ ...type.caption, color: theme.positive, paddingHorizontal: spacing.xs }}>{notice}</Text>
              ) : (
                <Text style={{ ...type.caption, color: theme.text3, paddingHorizontal: spacing.xs }}>
                  Troca os lançamentos com essa descrição e os que chegarem do banco
                </Text>
              )}
            </View>
          ) : null}

          <ErrorBanner message={error} />

          {/* ── excluir ── */}
          {confirmDelete ? (
            <View
              style={{
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: `${theme.danger}55`,
                backgroundColor: theme.surface,
              }}
            >
              <Text style={{ ...type.body, color: theme.text }}>
                {tx.fromBank
                  ? 'O lançamento some do extrato e não volta na próxima sincronização.'
                  : 'O lançamento some do extrato.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" variant="secondary" onPress={() => setConfirmDelete(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Excluir" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} />
                </View>
              </View>
            </View>
          ) : (
            <ListGroup>
              <ListRow
                icon={<Ionicons name="trash-outline" size={17} color={theme.danger} />}
                label="Excluir lançamento"
                onPress={() => setConfirmDelete(true)}
                destructive
                last
              />
            </ListGroup>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  )
}
