import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { radius, spacing, useTheme } from '@/lib/theme'

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme()
  const Container = scroll ? ScrollView : View
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <Container
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? { padding: spacing.md, paddingBottom: spacing.xl } : undefined}
      >
        {children}
      </Container>
    </SafeAreaView>
  )
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <Text style={[styles.title, { color: theme.text }]}>{children}</Text>
}

export function Muted({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme()
  return <Text style={[styles.muted, { color: theme.muted }, style]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  )
}

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'ghost'
}) {
  const theme = useTheme()
  const inactive = disabled || loading
  const primary = variant === 'primary'

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      // `accessibilityState` faz o VoiceOver anunciar o botão como desabilitado
      // em vez de apenas não responder ao toque.
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : 'transparent',
          borderColor: primary ? theme.accent : theme.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? theme.accentText : theme.text} />
      ) : (
        <Text style={[styles.buttonLabel, { color: primary ? theme.accentText : theme.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme()
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.muted}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBg,
            color: theme.text,
            borderColor: error ? theme.expense : 'transparent',
          },
        ]}
        {...props}
      />
      {error ? <Text style={[styles.error, { color: theme.expense }]}>{error}</Text> : null}
    </View>
  )
}

/** Erro vindo da API, sempre no mesmo lugar e com a mesma cara. */
export function ErrorBanner({ message }: { message?: string | null }) {
  const theme = useTheme()
  if (!message) return null
  return (
    <View style={[styles.banner, { backgroundColor: `${theme.expense}18`, borderColor: theme.expense }]}>
      <Text style={{ color: theme.expense, fontSize: 14 }}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  muted: { fontSize: 14 },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  button: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '500' },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  error: { fontSize: 13 },
  banner: { borderRadius: radius.sm, borderWidth: 1, padding: spacing.sm },
})
