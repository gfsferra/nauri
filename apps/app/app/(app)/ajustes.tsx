import { Ionicons } from '@expo/vector-icons'
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
import { signOut, useSession } from '@/lib/auth-client'
import { API_URL } from '@/lib/config'
import { toneOf } from '@/lib/format'
import { spacing, type, useTheme } from '@/lib/theme'

export default function Ajustes() {
  const theme = useTheme()
  const router = useRouter()
  const { data } = useSession()

  async function handleSignOut() {
    await signOut()
    router.replace('/entrar')
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
              onPress={() => router.push('/importar')}
            />
            <ListRow
              icon={tile('download-outline')}
              label="Exportar meus dados (CSV)"
              onPress={handleExport}
              last
            />
          </ListGroup>
        </Gutter>

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
