import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import {
  Avatar,
  BankLogo,
  Button,
  Card,
  ErrorBanner,
  Field,
  Gutter,
  ListGroup,
  ListRow,
  Screen,
  SectionLabel,
  Toggle,
  TrustNote,
  useTabBarSpace,
} from '@/components/ui'
import { Figure, Rise } from '@/components/metrics'
import { client, unwrap } from '@/lib/api'
import { signOut, useSession } from '@/lib/auth-client'
import { API_URL } from '@/lib/config'
import { formatDate, formatMonth, sinceLabel, toneOf } from '@/lib/format'
import { useReveal, useReducedMotion } from '@/lib/motion'
import { useHidden } from '@/lib/privacy'
import { radius, spacing, type, useTheme } from '@/lib/theme'

type Status = Awaited<ReturnType<typeof loadStatus>>
type Connected = Extract<Status, { connected: true }>

async function loadStatus() {
  return unwrap(await client['open-finance'].$get())
}

/** '2025-04-12' → 'abr/2025'. */
function shortMonth(iso: string): string {
  return `${formatMonth(iso.slice(0, 7)).slice(0, 3)}/${iso.slice(0, 4)}`
}

/** ['Nubank', 'Itaú', 'Inter'] → 'Nubank, Itaú e Inter'. */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

/** 1 conta e 2 cartões. */
function accountsText(accounts: Connected['accounts']): string {
  const credit = accounts.filter((a) => a.type === 'CREDIT').length
  const bank = accounts.length - credit
  const parts = [
    bank ? `${bank} ${bank === 1 ? 'conta' : 'contas'}` : '',
    credit ? `${credit} ${credit === 1 ? 'cartão' : 'cartões'}` : '',
  ].filter(Boolean)
  return parts.join(' e ')
}

/** O acesso do Open Finance dura no máximo 12 meses: a régua vai até lá. */
const CONSENT_DAYS = 365

export default function Settings() {
  const theme = useTheme()
  const tabBarSpace = useTabBarSpace()
  const router = useRouter()
  const { data } = useSession()
  const [hidden, setHidden] = useHidden()
  const [confirming, setConfirming] = useState(false)
  const scroll = useRef<ScrollView>(null)

  // O painel de exclusão abre no fim da tela, embaixo da barra de abas: rola até ele.
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(timer)
  }, [confirming])

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  function handleExport() {
    // Portabilidade (LGPD art. 18): abre o download direto da API, que já
    // responde com Content-Disposition.
    const url = `${API_URL}/api/account/export?format=csv`
    if (Platform.OS === 'web') window.open(url, '_blank')
    else Linking.openURL(url)
  }

  const name = data?.user.name ?? 'Você'
  const email = data?.user.email ?? ''
  const createdAt = data?.user.createdAt ? new Date(data.user.createdAt) : null
  const tile = (icon: keyof typeof Ionicons.glyphMap, destructive = false) => (
    <Ionicons name={icon} size={17} color={destructive ? theme.danger : theme.accentText} />
  )

  // Mesma chave da barra de abas e da Início: o cache é um só.
  const status = useQuery({ queryKey: ['open-finance'], queryFn: loadStatus, refetchInterval: 5 * 60_000 })
  const openFinance = status.data?.enabled ? status.data : null

  return (
    <Screen>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: tabBarSpace, gap: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── quem é você ── */}
        <Rise index={0}>
          <Gutter style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: spacing.sm }}>
            <Avatar name={name} tone={toneOf(name)} size={60} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ ...type.heading, color: theme.text }} numberOfLines={1}>
                {name}
              </Text>
              <Text style={{ ...type.body, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
                {email}
              </Text>
              {createdAt ? (
                <Text style={{ ...type.caption, color: theme.text3, marginTop: 3 }} numberOfLines={1}>
                  No Nauri desde {formatMonth(createdAt.toISOString().slice(0, 7))}
                </Text>
              ) : null}
            </View>
            {/* Exportar ficou para quem quiser os dados fora do app (LGPD,
                portabilidade): um ícone discreto em vez de uma seção inteira. */}
            <Pressable
              onPress={handleExport}
              accessibilityRole="button"
              accessibilityLabel="Exportar meus dados (CSV)"
              hitSlop={8}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.surface2 : 'transparent',
              })}
            >
              <Ionicons name="download-outline" size={19} color={theme.text3} />
            </Pressable>
          </Gutter>
        </Rise>

        {/* ── o banco conectado ── */}
        {openFinance ? (
          <Rise index={1}>
            <Gutter>
              <OpenFinanceCard status={openFinance} />
            </Gutter>
          </Rise>
        ) : null}

        {/* ── preferências ── */}
        <Rise index={2}>
          <Gutter style={{ gap: spacing.sm }}>
            <SectionLabel>Preferências</SectionLabel>
            <ListGroup>
              {/* O mesmo olho do topo da Início, dos Relatórios e dos Investimentos. */}
              <ListRow
                icon={tile(hidden ? 'eye-off-outline' : 'eye-outline')}
                label="Ocultar valores"
                checked={hidden}
                trailing={<Toggle value={hidden} />}
                onPress={() => setHidden(!hidden)}
                last
              />
            </ListGroup>
          </Gutter>
        </Rise>

        {/* ── conta ── */}
        <Rise index={3}>
          <Gutter style={{ gap: spacing.sm }}>
            <SectionLabel>Conta</SectionLabel>
            <ListGroup>
              <ListRow icon={tile('log-out-outline')} label="Sair" onPress={handleSignOut} />
              <ListRow
                icon={tile('trash-outline', true)}
                label="Excluir minha conta"
                onPress={() => setConfirming(!confirming)}
                destructive
                last
              />
            </ListGroup>
            {confirming ? <DeleteAccount email={email} onCancel={() => setConfirming(false)} /> : null}

            <TrustNote icon={<Ionicons name="shield-checkmark-outline" size={13} color={theme.text3} />}>
              {openFinance
                ? 'Banco só leitura · exporte ou exclua quando quiser'
                : 'Exporte ou exclua seus dados quando quiser'}
            </TrustNote>
          </Gutter>
        </Rise>
      </ScrollView>
    </Screen>
  )
}

/* ─────────────────────────────── Open Finance ─────────────────────────── */

/**
 * Open Finance (Meu Pluggy) num cartão só: quais bancos, como está a
 * sincronização, quanto já chegou e até quando vale o acesso. Só aparece
 * para o dono da conexão: para os outros a API responde `enabled: false`.
 */
function OpenFinanceCard({ status }: { status: Extract<Status, { enabled: true }> }) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const [justSynced, setJustSynced] = useState(false)

  const sync = useMutation({
    mutationFn: async () => unwrap(await client['open-finance'].sync.$post()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-finance'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      setJustSynced(true)
    },
  })
  useEffect(() => {
    if (!justSynced) return
    const timer = setTimeout(() => setJustSynced(false), 2600)
    return () => clearTimeout(timer)
  }, [justSynced])

  const connected = status.connected ? status : null

  // Um logo por banco, na ordem em que as contas chegam.
  const banks = new Map<string, string | null>()
  for (const a of connected?.accounts ?? []) if (!banks.has(a.bank)) banks.set(a.bank, a.bankIcon)

  const failed = sync.isError || !!connected?.lastError
  // Durante a sincronização a pílula fica como estava: quem diz
  // "Sincronizando…" é o botão, e uma pílula larga cortava o subtítulo.
  const pill: { label: string; tone: 'positive' | 'accent' | 'neutral' } = failed
      ? { label: 'Falhou', tone: 'neutral' }
      : !connected
        ? { label: 'Aguardando', tone: 'neutral' }
        : !connected.historyComplete
          ? { label: 'Importando', tone: 'accent' }
          : { label: 'Em dia', tone: 'positive' }

  const consentDays =
    connected?.consentExpiresAt != null
      ? Math.max(0, Math.floor((new Date(connected.consentExpiresAt).getTime() - Date.now()) / 86_400_000))
      : null

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 18, gap: spacing.lg }}>
        {/* ── bancos e status ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {banks.size ? (
            <View style={{ flexDirection: 'row' }}>
              {[...banks].map(([bank, icon], i) => (
                <View
                  key={bank}
                  style={{
                    marginLeft: i ? -10 : 0,
                    borderRadius: 13,
                    borderWidth: 2,
                    borderColor: theme.surface,
                    zIndex: banks.size - i,
                  }}
                >
                  <BankLogo uri={icon} fallback="business-outline" size={36} />
                </View>
              ))}
            </View>
          ) : (
            <BankLogo uri={null} fallback="business-outline" size={36} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ ...type.row, fontWeight: '600', color: theme.text }} numberOfLines={1}>
              {connected ? joinNames([...banks.keys()]) : 'Open Finance'}
            </Text>
            <Text style={{ ...type.caption, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
              {connected ? accountsText(connected.accounts) : 'Ainda não sincronizado'}
            </Text>
          </View>
          <StatusPill {...pill} />
        </View>

        {/* ── o que já chegou ── */}
        {connected ? (
          <View style={{ flexDirection: 'row', gap: spacing.xl }}>
            <Figure label="Lançamentos" value={connected.importedCount.toLocaleString('pt-BR')} />
            <Figure label="Histórico desde" value={shortMonth(connected.historyFrom)} />
            {connected.lastSyncedAt ? (
              <Figure label="Atualizado" value={sinceLabel(connected.lastSyncedAt)} />
            ) : null}
          </View>
        ) : null}

        {/* ── até quando vale o acesso ── */}
        {consentDays !== null && connected?.consentExpiresAt ? (
          <ConsentMeter days={consentDays} until={connected.consentExpiresAt.slice(0, 10)} />
        ) : null}

        {failed ? (
          <Text style={{ ...type.caption, color: theme.text2 }}>
            {sync.isError ? sync.error.message : 'A última tentativa falhou · tente sincronizar de novo'}
          </Text>
        ) : null}
      </View>

      {/* ── sincronizar ── */}
      <Pressable
        onPress={sync.isPending ? undefined : () => sync.mutate()}
        accessibilityRole="button"
        accessibilityState={{ busy: sync.isPending, disabled: sync.isPending }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: 52,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          backgroundColor: pressed ? theme.surface2 : 'transparent',
        })}
      >
        <SyncIcon spinning={sync.isPending} done={justSynced} />
        <Text style={{ ...type.row, fontWeight: '600', color: justSynced ? theme.positive : theme.accentText }}>
          {sync.isPending ? 'Sincronizando…' : justSynced ? 'Atualizado agora' : 'Sincronizar agora'}
        </Text>
      </Pressable>
    </Card>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'positive' | 'accent' | 'neutral' }) {
  const theme = useTheme()
  const tint = tone === 'positive' ? theme.positive : tone === 'accent' ? theme.accentText : theme.text2
  const soft = tone === 'positive' ? theme.positiveSoft : tone === 'accent' ? theme.accentSoft : theme.surface2
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 26,
        paddingHorizontal: 10,
        borderRadius: radius.full,
        backgroundColor: soft,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
      <Text style={{ ...type.caption, fontWeight: '600', color: tint }}>{label}</Text>
    </View>
  )
}

/** A régua do acesso ao banco: cheia logo depois de autorizar, vazia no dia em que vence. */
function ConsentMeter({ days, until }: { days: number; until: string }) {
  const theme = useTheme()
  const fill = useReveal(`consent:${days}`, { duration: 900, delay: 300 })
  const soon = days <= 30
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
        <Text style={{ ...type.caption, color: theme.text2 }}>Acesso ao banco</Text>
        <Text style={{ ...type.caption, fontWeight: '600', color: theme.text }}>
          {soon ? `vence em ${days} ${days === 1 ? 'dia' : 'dias'}` : `até ${formatDate(until)}`}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Acesso ao banco: faltam ${days} dias`}
        accessibilityValue={{ min: 0, max: CONSENT_DAYS, now: Math.min(days, CONSENT_DAYS) }}
        style={{ height: 6, borderRadius: radius.full, backgroundColor: theme.track, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${Math.min(days / CONSENT_DAYS, 1) * fill * 100}%`,
            height: '100%',
            borderRadius: radius.full,
            backgroundColor: soon ? theme.text2 : theme.accent,
          }}
        />
      </View>
      {soon ? <Text style={{ ...type.caption, color: theme.text2 }}>Renove no Meu Pluggy</Text> : null}
    </View>
  )
}

/** O ícone de sincronizar, que gira enquanto a leitura acontece e vira um ✓ ao terminar. */
function SyncIcon({ spinning, done }: { spinning: boolean; done: boolean }) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const turn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!spinning || reduced) {
      turn.stopAnimation()
      turn.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [spinning, reduced, turn])
  return (
    <Animated.View
      style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'sync-outline'}
        size={18}
        color={done ? theme.positive : theme.accentText}
      />
    </Animated.View>
  )
}

/* ─────────────────────────────── exclusão ─────────────────────────── */

/**
 * Exclusão definitiva, na própria tela: o `Alert` do React Native não faz
 * nada na web, que é onde o app roda. Digitar o e-mail da conta evita que um
 * toque errado apague anos de histórico; a API confere de novo.
 */
function DeleteAccount({ email, onCancel }: { email: string; onCancel: () => void }) {
  const theme = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email !== ''

  const remove = useMutation({
    mutationFn: async () => unwrap(await client.account.$delete({ json: { confirmEmail: typed.trim() } })),
    onSuccess: async () => {
      // As sessões já caíram junto com a conta; sair só limpa o que ficou aqui.
      await signOut().catch(() => {})
      queryClient.clear()
      router.replace('/login')
    },
  })

  return (
    <Rise>
      <Card style={{ gap: spacing.md, borderColor: `${theme.danger}55`, borderTopColor: `${theme.danger}55` }}>
        <View style={{ gap: 4 }}>
          <Text style={{ ...type.row, fontWeight: '600', color: theme.text }}>Excluir a conta de vez?</Text>
          <Text style={{ ...type.caption, color: theme.text2 }}>
            Lançamentos, categorias e investimentos somem e não voltam. Exporte antes, se quiser guardar.
          </Text>
        </View>
        <Field
          label="Digite seu e-mail para confirmar"
          value={typed}
          onChangeText={setTyped}
          placeholder={email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardType="email-address"
          onSubmitEditing={matches ? () => remove.mutate() : undefined}
        />
        <ErrorBanner message={remove.error?.message} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={remove.isPending} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Excluir"
              variant="danger"
              onPress={() => remove.mutate()}
              disabled={!matches}
              loading={remove.isPending}
            />
          </View>
        </View>
      </Card>
    </Rise>
  )
}
