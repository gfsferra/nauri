import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { Button, ErrorBanner, Field, Muted, Screen, Title } from '@/components/ui'
import { signIn } from '@/lib/auth-client'
import { spacing, useTheme } from '@/lib/theme'

export default function Entrar() {
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
    router.replace('/lancamentos')
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ gap: spacing.xs }}>
          <Title>Entrar</Title>
          <Muted>Suas finanças, no bolso e no navegador.</Muted>
        </View>

        <View style={{ gap: spacing.md }}>
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

        <View style={{ gap: spacing.sm, alignItems: 'center' }}>
          <Link href="/esqueci-senha">
            <Text style={{ color: theme.muted, fontSize: 14 }}>Esqueci minha senha</Text>
          </Link>
          <Link href="/cadastrar">
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
              Criar uma conta
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
