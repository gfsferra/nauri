import { type ReactNode, useEffect, useRef } from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { inkCard, radius, spacing, tabular, type, useTheme } from '@/lib/theme'

/* ─────────────────────────── superfícies ─────────────────────────── */

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme()
  const Container = scroll ? ScrollView : View
  return (
    // O inset de topo cobre a barra de status no aparelho, mas na web ele é 0 —
    // e o artboard reserva 58px ali. Sem um respiro próprio o conteúdo encosta
    // na borda no navegador; somado ao inset, ele só afasta do entalhe.
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg, paddingTop: spacing.md }}
      edges={['top']}
    >
      <Container
        style={{ flex: 1 }}
        contentContainerStyle={
          scroll ? { paddingBottom: spacing.xxl, gap: spacing.xl } : undefined
        }
      >
        {children}
      </Container>
    </SafeAreaView>
  )
}

/** A margem de 20px do DS. Toda seção passa por aqui em vez de repetir padding. */
export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: spacing.gutter }, style]}>{children}</View>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          padding: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/**
 * O cartão de tinta escura do DS — a única superfície que não muda com o tema,
 * porque é a peça de marca. O degradê vem em SVG para não puxar dependência
 * nativa nova só por causa de um fundo.
 */
export function InkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          borderRadius: radius.card,
          padding: spacing.xl,
          overflow: 'hidden',
          backgroundColor: inkCard.to,
        },
        style,
      ]}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="ink" x1="0" y1="0" x2="0.72" y2="1">
            <Stop offset="0" stopColor={inkCard.from} />
            <Stop offset="0.62" stopColor={inkCard.to} />
            <Stop offset="1" stopColor="#111C30" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ink)" />
      </Svg>
      {children}
    </View>
  )
}

/**
 * A marca nas telas de entrada: o mesmo quadrado de tinta escura e canto 16 que
 * o DS usa na inicial do cabeçalho — é o único elemento de marca do sistema.
 */
export function BrandMark({ children, size = 46 }: { children: ReactNode; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: inkCard.to,
      }}
    >
      {children}
    </View>
  )
}

/* ──────────────────────────── tipografia ─────────────────────────── */

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme()
  return <Text style={[type.title, { color: theme.text }, style]}>{children}</Text>
}

export function Heading({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <Text style={[type.heading, { color: theme.text }]}>{children}</Text>
}

/** Rótulo de seção: 11,5px em caixa alta, o separador de blocos do DS. */
export function SectionLabel({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <Text style={[type.overline, { color: theme.text2 }]}>{children}</Text>
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme()
  return <Text style={[type.body, { color: theme.text2 }, style]}>{children}</Text>
}

/**
 * Valor monetário.
 *
 * Saída fica em tinta neutra e entrada no verde profundo — o DS reserva o coral
 * a ação destrutiva, porque gasto normal não é erro (decisão 01). Quem separa
 * os dois é o sinal, que vem sempre colado ao número: a cor nunca carrega o
 * significado sozinha.
 */
export function Amount({
  cents,
  direction,
  format,
  size,
  hidden = false,
}: {
  cents: number
  direction: 'in' | 'out' | 'neutral'
  format: (cents: number) => string
  size?: number
  hidden?: boolean
}) {
  const theme = useTheme()
  const sign = direction === 'in' ? '+ ' : direction === 'out' ? '− ' : ''
  const color = direction === 'in' ? theme.accentText : theme.text
  return (
    <Text
      accessibilityLabel={hidden ? 'Valor oculto' : undefined}
      style={[
        type.amount,
        tabular,
        { color, fontSize: size ?? type.amount.fontSize },
        privacyBlur(hidden, color),
      ]}
    >
      {sign}
      {format(Math.abs(cents))}
    </Text>
  )
}

/**
 * Desfoque de privacidade (DS, decisão 03): o olho no cabeçalho embaça o valor
 * em vez de trocá-lo por asteriscos — a forma do número permanece, o dado não.
 * Em React Native o efeito sai do próprio glifo: texto transparente com sombra
 * do mesmo tom e raio alto, que é um borrão de verdade, não uma máscara.
 */
export function privacyBlur(hidden: boolean, color: string): TextStyle | null {
  if (!hidden) return null
  return {
    color: 'transparent',
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  }
}

/**
 * Bloco de carregamento (DS, decisão 04): o esqueleto guarda o lugar exato do
 * conteúdo, então nada salta quando o dado chega — e o sistema não tem spinner
 * em lugar nenhum. A pulsação é a mesma do artboard: 1,3s entre 45% e 100%.
 */
export function Skeleton({
  width,
  height,
  delay = 0,
  style,
}: {
  width: number | `${number}%`
  height: number
  delay?: number
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const pulse = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, delay, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, delay])

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: height / 2, backgroundColor: theme.skeleton, opacity: pulse },
        style,
      ]}
    />
  )
}

/** O esqueleto de uma linha do extrato: inicial, duas réguas e o valor. */
export function SkeletonRow({ delay = 0 }: { delay?: number }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.md,
          backgroundColor: theme.skeleton,
        }}
      />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="60%" height={11} delay={delay} />
        <Skeleton width="35%" height={9} delay={delay + 100} />
      </View>
      <Skeleton width={64} height={12} delay={delay + 150} />
    </View>
  )
}

/* ───────────────────────────── controles ─────────────────────────── */

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
}: {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: ReactNode
}) {
  const theme = useTheme()
  const inactive = disabled || loading

  const fill =
    variant === 'primary' ? theme.accent : variant === 'danger' ? theme.danger : 'transparent'
  const label_ =
    variant === 'primary' || variant === 'danger'
      ? '#FFFFFF'
      : variant === 'ghost'
        ? theme.accentText
        : theme.text2
  const border = variant === 'secondary' ? theme.border : 'transparent'

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
          backgroundColor: fill,
          borderColor: border,
          // 45% é o estado desabilitado do DS.
          opacity: inactive ? 0.45 : pressed ? 0.88 : 1,
        },
      ]}
    >
      {/* Sem spinner: o estado ocupado é a mesma lavagem clara que corre por
          dentro do botão de confirmação do artboard. O rótulo fica no lugar,
          então a largura não muda no meio do envio. */}
      {loading ? <ButtonWash /> : null}
      {icon}
      <Text style={[styles.buttonLabel, { color: label_ }]}>{label}</Text>
    </Pressable>
  )
}

/** A lavagem de progresso do botão de confirmação do DS, em laço. */
function ButtonWash() {
  const sweep = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1100, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [sweep])

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: 'rgba(255,255,255,0.22)',
          transform: [
            { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: ['-100%', '100%'] }) },
          ],
        },
      ]}
    />
  )
}

/** Pílula de filtro/escolha: 40px de alto, raio total, ativa em accentSoft. */
export function Chip({
  label,
  active,
  onPress,
  leading,
  accessibilityRole = 'radio',
}: {
  label: string
  active: boolean
  onPress: () => void
  leading?: ReactNode
  accessibilityRole?: 'radio' | 'button'
}) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'radio' ? { selected: active } : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accentSoft : 'transparent',
          borderColor: active ? 'transparent' : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {leading}
      <Text
        style={{
          ...type.body,
          fontWeight: '600',
          color: active ? theme.accentText : theme.text2,
        }}
      >
        {label}
      </Text>
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
    <View style={{ gap: 5 }}>
      <Text style={{ ...type.caption, color: theme.text2 }}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.text3}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface2,
            color: theme.text,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}
        {...props}
      />
      {error ? <Text style={{ ...type.caption, color: theme.danger }}>{error}</Text> : null}
    </View>
  )
}

/* ──────────────────────────────── listas ─────────────────────────── */

/**
 * A inicial em quadrado arredondado que o DS usa no lugar de um marcador
 * colorido. O tom sai da rampa slate, não da cor da categoria: o DS pede uma
 * cor de destaque só, sem legenda arco-íris.
 */
export function Avatar({ name, tone = 0, size = 42 }: { name: string; tone?: number; size?: number }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size < 36 ? radius.sm : radius.md,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.avatarFills[tone % theme.avatarFills.length],
      }}
    >
      <Text style={{ color: theme.avatarText, fontSize: size * 0.36, fontWeight: '600' }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  )
}

/** Cartão agrupado do DS: raio 20, filhos separados por régua de 1px. */
export function ListGroup({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 20,
        backgroundColor: theme.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  )
}

export function ListRow({
  icon,
  label,
  detail,
  onPress,
  last = false,
  destructive = false,
}: {
  icon?: ReactNode
  label: string
  detail?: string
  onPress?: () => void
  last?: boolean
  destructive?: boolean
}) {
  const theme = useTheme()
  const color = destructive ? theme.danger : theme.text

  const body = (pressed: boolean) => (
    <View
      style={{
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.border,
        backgroundColor: pressed ? theme.surface2 : 'transparent',
      }}
    >
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: destructive ? `${theme.danger}1F` : theme.accentSoft,
          }}
        >
          {icon}
        </View>
      ) : null}
      <Text style={{ ...type.row, color, flex: 1 }}>{label}</Text>
      {detail ? <Text style={{ ...type.caption, color: theme.text2 }}>{detail}</Text> : null}
    </View>
  )

  if (!onPress) return body(false)
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => body(pressed)}
    </Pressable>
  )
}

/** Caixa de número do DS (Entradas / Saídas), raio 16 e régua de 1px. */
export function StatTile({
  label,
  children,
  style,
}: {
  label: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          flex: 1,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radius.lg,
          paddingVertical: 13,
          paddingHorizontal: spacing.lg - 2,
          gap: 3,
        },
        style,
      ]}
    >
      <Text style={{ ...type.overline, textTransform: 'none', letterSpacing: 0, color: theme.text2 }}>
        {label}
      </Text>
      {children}
    </View>
  )
}

/** Erro vindo da API, sempre no mesmo lugar e com a mesma cara. */
export function ErrorBanner({ message }: { message?: string | null }) {
  const theme = useTheme()
  if (!message) return null
  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: theme.danger,
        backgroundColor: `${theme.danger}18`,
        padding: spacing.md,
      }}
    >
      <Text style={{ ...type.body, color: theme.danger }}>{message}</Text>
    </View>
  )
}

/** Estado vazio no tom do DS: sem emoji, texto flush left, ação em ghost. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme()
  return (
    <View style={{ gap: 6, paddingVertical: spacing.xxl }}>
      <Text style={{ ...type.section, color: theme.text }}>{title}</Text>
      {hint ? <Text style={{ ...type.body, color: theme.text2 }}>{hint}</Text> : null}
    </View>
  )
}

/** Rodapé de confiança que fecha as telas no DS. */
export function TrustNote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingTop: spacing.lg,
        paddingHorizontal: spacing.sm,
      }}
    >
      {icon}
      {/* `flexShrink` mantém o texto dentro da margem quando ele não cabe numa
          linha só, em vez de empurrar o bloco inteiro para fora da grade. */}
      <Text
        style={{
          ...type.overline,
          textTransform: 'none',
          letterSpacing: 0,
          color: theme.text3,
          flexShrink: 1,
          textAlign: 'center',
        }}
      >
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    // 48px é o alvo mínimo que o DS exige (decisão 06); 52 dá folga ao rótulo.
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: spacing.xl,
  },
  buttonLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 15,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14.5,
    letterSpacing: -0.2,
  },
})
