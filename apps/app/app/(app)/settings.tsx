import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native'
import {
  Avatar,
  Gutter,
  ListGroup,
  ListRow,
  Screen,
  SectionLabel,
  TrustNote,
} from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { signOut, useSession } from '@/lib/auth-client'
import { API_URL } from '@/lib/config'
import { formatDate, toneOf } from '@/lib/format'
import { spacing, type, useTheme } from '@/lib/theme'

/** '2026-11-11T14:02:00Z' → 'há 12 min' / 'há 3 h' / '10 de novembro' */
function sinceLabel(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return formatDate(new Date(iso).toISOString().slice(0, 10))
}

/**
 * Open Finance (Meu Pluggy). Só aparece para o dono da conexão: para qualquer
 * outro usuário a API responde `enabled: false` e a seção não existe.
 */
function OpenFinanceSection() {
  const theme = useTheme()
  const queryClient = useQueryClient()

  const status = useQuery({
    queryKey: ['open-finance'],
    queryFn: async () => unwrap(await client['open-finance'].$get()),
    // A sincronização de hora em hora acontece no servidor; reler de vez em
    // quando mantém "há X min" honesto sem exigir recarregar a tela.
    refetchInterval: 5 * 60_000,
  })

  const sync = useMutation({
    mutationFn: async () => unwrap(await client['open-finance'].sync.$post()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-finance'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  const data = status.data
  if (!data?.enabled) return null

  const tile = (icon: keyof typeof Ionicons.glyphMap) => (
    <Ionicons name={icon} size={17} color={theme.accentText} />
  )

  const connected = data.connected
  const consentDays =
    connected && data.consentExpiresAt
      ? Math.floor((new Date(data.consentExpiresAt).getTime() - Date.now()) / 86_400_000)
      : null

  let note: string
  if (sync.isError) note = sync.error.message
  else if (!connected) note = 'Ainda não sincronizado · toque em Sincronizar agora'
  else if (data.lastError) note = 'A última tentativa falhou · tente sincronizar de novo'
  else if (!data.historyComplete)
    note = `Importando o histórico aos poucos · ${data.importedCount} lançamentos até agora`
  else if (consentDays !== null && consentDays <= 30)
    note = `O acesso ao banco vence em ${Math.max(consentDays, 0)} dia(s) · renove no Meu Pluggy`
  else if (data.consentExpiresAt)
    note = `Acesso autorizado até ${formatDate(data.consentExpiresAt.slice(0, 10))}`
  else note = 'Dados do banco atualizados uma vez por dia'

  const accountLabel = (type: string) => (type === 'CREDIT' ? 'Cartão de crédito' : 'Conta corrente')
  const banks = connected ? new Set(data.accounts.map((a) => a.bank)).size : 0

  return (
    <Gutter style={{ gap: spacing.sm }}>
      <SectionLabel>{banks > 1 ? 'Bancos conectados' : 'Banco conectado'}</SectionLabel>
      <ListGroup>
        {connected
          ? data.accounts.map((account) => (
              <ListRow
                key={`${account.type}:${account.name}`}
                icon={tile(account.type === 'CREDIT' ? 'card-outline' : 'business-outline')}
                label={accountLabel(account.type)}
                detail={account.bank}
              />
            ))
          : null}
        <ListRow
          icon={tile('sync-outline')}
          label={sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
          detail={connected && data.lastSyncedAt ? sinceLabel(data.lastSyncedAt) : undefined}
          onPress={sync.isPending ? undefined : () => sync.mutate()}
          last
        />
      </ListGroup>
      <TrustNote icon={<Ionicons name="lock-closed-outline" size={13} color={theme.text3} />}>
        {note}
      </TrustNote>
    </Gutter>
  )
}

export default function Settings() {
  const theme = useTheme()
  const router = useRouter()
  const { data } = useSession()

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

  function handleDelete() {
    Alert.alert(
      'Excluir conta',
      'Todos os seus lançamentos, categorias e orçamentos serão apagados definitivamente. Exporte seus dados antes, se quiser guardá-los.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Ainda não implementado',
              'A confirmação por e-mail digitado entra junto com a tela de exclusão.',
            ),
        },
      ],
    )
  }

  const name = data?.user.name ?? 'Você'
  const tile = (icon: keyof typeof Ionicons.glyphMap, destructive = false) => (
    <Ionicons name={icon} size={17} color={destructive ? theme.danger : theme.accentText} />
  )

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl, gap: spacing.xxl }}>
        {/* Cabeçalho de perfil do DS: inicial em quadrado de 60, nome em 19 e a
            identificação da conta logo abaixo, em cinza-médio. */}
        <Gutter style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name} tone={toneOf(name)} size={60} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ ...type.heading, color: theme.text }} numberOfLines={1}>
              {name}
            </Text>
            <Text style={{ ...type.body, color: theme.text2, marginTop: 2 }} numberOfLines={1}>
              {data?.user.email}
            </Text>
          </View>
        </Gutter>

        <Gutter style={{ gap: spacing.sm }}>
          <SectionLabel>Seus dados</SectionLabel>
          <ListGroup>
            <ListRow
              icon={tile('cloud-upload-outline')}
              label="Importar planilha (CSV)"
              onPress={() => router.push('/import')}
            />
            <ListRow
              icon={tile('download-outline')}
              label="Exportar meus dados (CSV)"
              onPress={handleExport}
              last
            />
          </ListGroup>
        </Gutter>

        <OpenFinanceSection />

        <Gutter style={{ gap: spacing.sm }}>
          <SectionLabel>Conta</SectionLabel>
          <ListGroup>
            <ListRow icon={tile('log-out-outline')} label="Sair" onPress={handleSignOut} />
            <ListRow
              icon={tile('trash-outline', true)}
              label="Excluir minha conta"
              onPress={handleDelete}
              destructive
              last
            />
          </ListGroup>

          <TrustNote icon={<Ionicons name="shield-checkmark-outline" size={13} color={theme.text3} />}>
            Exclusão é definitiva · exporte antes se quiser guardar
          </TrustNote>
        </Gutter>
      </ScrollView>
    </Screen>
  )
}
