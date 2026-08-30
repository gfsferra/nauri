import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { Button, ErrorBanner, Field, Muted, Screen, Title } from '@/components/ui'
import { signUp } from '@/lib/auth-client'
import { spacing, useTheme } from '@/lib/theme'

const MIN_PASSWORD = 10

export default function Cadastrar() {
  const theme = useTheme()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    const { error: authError } = await signUp.email(
      { name: name.trim(), email: email.trim(), password },
      // O código só é exigido enquanto SIGNUP_MODE=invite no servidor.
      { headers: invite ? { 'x-invite-code': invite.trim() } : undefined },
    )
    setLoading(false)

    if (authError) {
      setError(authError.message ?? 'Não foi possível criar a conta.')
      return
    }
    router.replace('/verificar')
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: spacing.md, gap: spacing.lg }}
      >
        <View style={{ gap: spacing.xs }}>
          <Title>Criar conta</Title>
          <Muted>Leva um minuto. Depois dá para importar sua planilha inteira.</Muted>
        </View>

        <View style={{ gap: spacing.md }}>
          <ErrorBanner message={error} />

          <Field label="Nome" value={name} onChangeText={setName} autoComplete="name" placeholder="Como quer ser chamado" />
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
            label={`Senha (mínimo ${MIN_PASSWORD} caracteres)`}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            error={passwordTooShort ? `Faltam ${MIN_PASSWORD - password.length} caractere(s)` : undefined}
            placeholder="••••••••••"
          />
          <Field
            label="Código de convite (se você tiver um)"
            value={invite}
            onChangeText={setInvite}
            autoCapitalize="none"
            placeholder="Opcional"
          />

          <Text
            onPress={() => setAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}
          >
            {accepted ? '☑' : '☐'}  Li e aceito os{' '}
            <Text style={{ fontWeight: '600' }}>Termos de Uso</Text> e a{' '}
            <Text style={{ fontWeight: '600' }}>Política de Privacidade</Text>.
          </Text>

          <Button
            label="Criar conta"
            onPress={handleSubmit}
            loading={loading}
            disabled={!name || !email || password.length < MIN_PASSWORD || !accepted}
          />
        </View>

        <Link href="/entrar" style={{ alignSelf: 'center' }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
            Já tenho conta
          </Text>
        </Link>
      </KeyboardAvoidingView>
    </Screen>
  )
}
