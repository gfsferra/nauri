import { Link } from 'expo-router'
import { Text, View } from 'react-native'
import { Muted, Screen, Title } from '@/components/ui'
import { spacing, useTheme } from '@/lib/theme'

/** Tela de espera entre o cadastro e a confirmação do e-mail. */
export default function Verificar() {
  const theme = useTheme()
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ fontSize: 44 }}>📬</Text>
        <Title>Confirme seu e-mail</Title>
        <Muted>
          Enviamos um link de confirmação. Abra-o para ativar a conta — guardamos dados
          financeiros, então esse passo não dá para pular.
        </Muted>
        <Muted>Não chegou? Verifique o spam antes de tentar de novo.</Muted>

        <Link href="/entrar" style={{ marginTop: spacing.md }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
            Já confirmei, quero entrar
          </Text>
        </Link>
      </View>
    </Screen>
  )
}
