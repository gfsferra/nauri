import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { Card, Muted, Screen, Title } from '@/components/ui'
import { signOut, useSession } from '@/lib/auth-client'
import { API_URL } from '@/lib/config'
import { spacing, useTheme } from '@/lib/theme'

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
            Alert.alert('Ainda não implementado', 'A confirmação por e-mail digitado entra junto com a tela de exclusão.'),
        },
      ],
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <Title>Ajustes</Title>

        <Card style={{ gap: 4 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>
            {data?.user.name}
          </Text>
          <Muted>{data?.user.email}</Muted>
        </Card>

        <View style={{ gap: 1, borderRadius: 12, overflow: 'hidden' }}>
          <Item icon="cloud-upload-outline" label="Importar planilha (CSV)" onPress={() => router.push('/importar')} />
          <Item icon="download-outline" label="Exportar meus dados (CSV)" onPress={handleExport} />
          <Item icon="log-out-outline" label="Sair" onPress={handleSignOut} />
          <Item icon="trash-outline" label="Excluir minha conta" onPress={handleDelete} destructive />
        </View>
      </ScrollView>
    </Screen>
  )
}

function Item({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  destructive?: boolean
}) {
  const theme = useTheme()
  const color = destructive ? theme.expense : theme.text
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: pressed ? theme.inputBg : theme.card,
      })}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color, fontSize: 15, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.muted} />
    </Pressable>
  )
}
