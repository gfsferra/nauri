import { Ionicons } from '@expo/vector-icons'
import { Link, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { BrandMark, Button, ErrorBanner, Field, Gutter, Muted, Screen, Title } from '@/components/ui'
import { resetPassword } from '@/lib/auth-client'
import { spacing, type, useTheme } from '@/lib/theme'

const MIN_PASSWORD = 10

/**
 * Destino do link do e-mail de redefinição. O Better Auth valida o token na
 * própria API e redireciona para cá com `?token=…` — ou com `?error=…` quando
 * o link expirou ou já foi usado.
 */
export default function ResetPassword() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ token?: string; error?: string }>()
  const token = typeof params.token === 'string' ? params.token : undefined
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const invalidLink = !token || Boolean(params.error)
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password

  async function handleSubmit() {
    if (!token) return
    setError(null)
    setLoading(true)
    const { error: authError } = await resetPassword({ newPassword: password, token })
    setLoading(false)
    if (authError) {
      setError(
        authError.code === 'INVALID_TOKEN'
          ? 'Este link expirou ou já foi usado. Peça um novo.'
          : 'Não foi possível trocar a senha agora. Tente novamente em instantes.',
      )
      return
    }
    setDone(true)
  }

  const title = done ? 'Senha alterada' : invalidLink ? 'Link inválido' : 'Nova senha'
  const subtitle = done
    ? 'Pronto. Entre com a senha nova — as outras sessões abertas continuam valendo até expirar.'
    : invalidLink
      ? 'Este link de redefinição expirou ou já foi usado. Os links valem por 1 hora.'
      : 'Escolha a nova senha da sua conta.'

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Gutter style={{ gap: spacing.xxl }}>
          <View style={{ gap: spacing.lg }}>
            <BrandMark>
              <Ionicons
                name={done ? 'checkmark' : invalidLink ? 'alert-outline' : 'key-outline'}
                size={22}
                color="#F8FAFC"
              />
            </BrandMark>
            <View style={{ gap: 6 }}>
              <Title>{title}</Title>
              <Muted>{subtitle}</Muted>
            </View>
          </View>

          {!done && !invalidLink && (
            <View style={{ gap: spacing.lg }}>
              <ErrorBanner message={error} />
              <Field
                label={`Nova senha (mínimo ${MIN_PASSWORD} caracteres)`}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={passwordTooShort ? `Faltam ${MIN_PASSWORD - password.length} caractere(s)` : undefined}
                placeholder="••••••••••"
              />
              <Field
                label="Repita a nova senha"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                error={mismatch ? 'As senhas não conferem' : undefined}
                placeholder="••••••••••"
              />
              <Button
                label="Salvar nova senha"
                onPress={handleSubmit}
                loading={loading}
                disabled={password.length < MIN_PASSWORD || confirm !== password}
              />
            </View>
          )}

          <Link href={invalidLink && !done ? '/forgot-password' : '/login'}>
            <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>
              {invalidLink && !done ? 'Pedir um novo link' : 'Ir para entrar'}
            </Text>
          </Link>
        </Gutter>
      </KeyboardAvoidingView>
    </Screen>
  )
}
