import { Link } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button, ErrorBanner, Field, Muted, Screen, Title } from '@/components/ui'
import { requestPasswordReset } from '@/lib/auth-client'
import { API_URL } from '@/lib/config'
import { spacing, useTheme } from '@/lib/theme'

export default function EsqueciSenha() {
  const theme = useTheme()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    const { error: authError } = await requestPasswordReset({
      email: email.trim(),
      redirectTo: `${API_URL}/redefinir-senha`,
    })
    setLoading(false)
    // Sucesso mesmo quando o e-mail não existe: responder diferente revelaria
    // quem tem conta no serviço.
    if (authError && authError.status !== 404) {
      setError('Não foi possível enviar agora. Tente novamente em instantes.')
      return
    }
    setSent(true)
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <Title>Esqueci a senha</Title>
          <Muted>
            {sent
              ? 'Se existir uma conta com esse e-mail, o link de redefinição já está a caminho.'
              : 'Enviamos um link para você escolher uma nova senha.'}
          </Muted>
        </View>

        {!sent && (
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
            <Button label="Enviar link" onPress={handleSubmit} loading={loading} disabled={!email} />
          </View>
        )}

        <Link href="/entrar" style={{ alignSelf: 'center' }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>Voltar para entrar</Text>
        </Link>
      </View>
    </Screen>
  )
}
