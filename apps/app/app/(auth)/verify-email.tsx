import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { Text, View } from 'react-native'
import { BrandMark, Gutter, Muted, Screen, Title, TrustNote } from '@/components/ui'
import { spacing, type, useTheme } from '@/lib/theme'

/** Tela de espera entre o cadastro e a confirmação do e-mail. */
export default function VerifyEmail() {
  const theme = useTheme()
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Gutter style={{ gap: spacing.xxl }}>
          <View style={{ gap: spacing.lg }}>
            <BrandMark>
              <Ionicons name="mail-outline" size={22} color="#F8FAFC" />
            </BrandMark>
            <View style={{ gap: 6 }}>
              <Title>Confirme seu e-mail</Title>
              <Muted>
                Enviamos um link de confirmação. Abra-o para ativar a conta — guardamos dados
                financeiros, então esse passo não dá para pular.
              </Muted>
              <Muted>Não chegou? Verifique o spam antes de tentar de novo.</Muted>
            </View>
          </View>

          <Link href="/login">
            <Text style={{ ...type.row, fontWeight: '600', color: theme.accentText }}>
              Já confirmei, quero entrar
            </Text>
          </Link>

          <TrustNote icon={<Ionicons name="shield-checkmark-outline" size={13} color={theme.text3} />}>
            Verificação exigida para dados financeiros
          </TrustNote>
        </Gutter>
      </View>
    </Screen>
  )
}
