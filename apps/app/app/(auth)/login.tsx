import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import {
  BrandMark,
  Button,
  ErrorBanner,
  Field,
  Gutter,
  Muted,
  Screen,
  Title,
  TrustNote,
} from '@/components/ui'
import { signIn } from '@/lib/auth-client'
import { spacing, type, useTheme } from '@/lib/theme'

export default function Login() {
  const theme = useTheme()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    const { error: authError } = await signIn.email({ email: email.trim(), password })
    setLoading(false)

    if (authError) {
      // Mensagem única para e-mail errado e senha errada: distinguir os dois
      // permitiria descobrir quem tem conta aqui só testando endereços.
      setError(
        authError.status === 403
          ? 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
          : 'E-mail ou senha incorretos.',
      )
      return
    }
    router.replace('/home')
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        {/* Tudo rente à esquerda: o DS não centraliza título nem rótulo. */}
        <Gutter style={{ gap: spacing.xxl }}>
          <View style={{ gap: spacing.lg }}>
            <BrandMark>
              <Ionicons name="wallet-outline" size={22} color="#F8FAFC" />
            </BrandMark>
            <View style={{ gap: 6 }}>
              <Title>Entrar</Title>
              <Muted>Suas finanças, no bolso e no navegador.</Muted>
            </View>
          </View>

          <View style={{ gap: spacing.lg }}>
            <ErrorBanner message={error} />

            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              placeholder="voce@exemplo.com"
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
              placeholder="••••••••••"
            />

            <Button label="Entrar" onPress={handleSubmit} loading={loading} disabled={!email || !password} />
          </View>

          <View style={{ gap: spacing.md }}>
            <Link href="/forgot-password">
              <Text style={{ ...type.body, fontWeight: '600', color: theme.text2 }}>
                Esqueci minha senha
              </Text>
            </Link>
            <Link href="/register">
              <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>
                Criar uma conta
              </Text>
            </Link>
          </View>

          <TrustNote icon={<Ionicons name="lock-closed-outline" size={13} color={theme.text3} />}>
            Conexão criptografada ponta a ponta
          </TrustNote>
        </Gutter>
      </KeyboardAvoidingView>
    </Screen>
  )
}
