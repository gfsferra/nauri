import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import {
  BrandMark,
  Button,
  ErrorBanner,
  Field,
  Gutter,
  Muted,
  Screen,
  Title,
} from '@/components/ui'
import { signUp } from '@/lib/auth-client'
import { spacing, type, useTheme } from '@/lib/theme'

const MIN_PASSWORD = 10

export default function SignUp() {
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
    router.replace('/verify-email')
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Gutter style={{ gap: spacing.xxl }}>
        <View style={{ gap: spacing.lg }}>
          <BrandMark>
            <Ionicons name="wallet-outline" size={22} color="#F8FAFC" />
          </BrandMark>
          <View style={{ gap: 6 }}>
            <Title>Criar conta</Title>
            <Muted>Leva um minuto. Depois dá para importar sua planilha inteira.</Muted>
          </View>
        </View>

        <View style={{ gap: spacing.lg }}>
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

          <Pressable
            onPress={() => setAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 48, paddingTop: 2 }}
          >
            <Ionicons
              name={accepted ? 'checkbox' : 'square-outline'}
              size={20}
              color={accepted ? theme.accent : theme.text3}
            />
            <Text style={{ ...type.row, fontWeight: '400', color: theme.text, flex: 1, lineHeight: 20 }}>
              Li e aceito os <Text style={{ fontWeight: '600' }}>Termos de Uso</Text> e a{' '}
              <Text style={{ fontWeight: '600' }}>Política de Privacidade</Text>.
            </Text>
          </Pressable>

          <Button
            label="Criar conta"
            onPress={handleSubmit}
            loading={loading}
            disabled={!name || !email || password.length < MIN_PASSWORD || !accepted}
          />
        </View>

        <Link href="/sign-in">
          <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>
            Já tenho conta
          </Text>
        </Link>
        </Gutter>
      </KeyboardAvoidingView>
    </Screen>
  )
}
