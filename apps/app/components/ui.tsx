import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Animated,
  Image,
  Platform,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useHidden } from '@/lib/privacy'
import { radius, spacing, tabular, type, useTheme } from '@/lib/theme'

/* ─────────────────────────── superfícies ─────────────────────────── */

const noopSubscribe = () => () => {}

/**
 * App instalado na tela de início (PWA), onde a barra de status fica por
 * cima da página. Lido no navegador, não no hook de área segura: no PWA o
 * `SafeAreaView` aplica o inset por CSS, mas `useSafeAreaInsets().top` chega
 * como 0. Na pré-renderização é sempre falso, como o tema (ver `useTheme`).
 */
function useInstalledWebApp(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (window.navigator as { standalone?: boolean }).standalone === true),
    () => false,
  )
}

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme()
  const { top } = useSafeAreaInsets()
  const installed = useInstalledWebApp()
  const underStatusBar = top > 0 || installed
  const Container = scroll ? ScrollView : View
  return (
    // O inset de topo cobre a barra de status no aparelho, mas no navegador
    // ele é 0, e o artboard reserva 58px ali. Sem um respiro próprio, o
    // conteúdo encosta na borda do navegador. Com barra de status por cima
    // (app nativo, ou o PWA no iPhone com a barra translúcida), 12px colava
    // o cabeçalho no relógio, então ali o respiro dobra.
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg, paddingTop: underStatusBar ? spacing.xl + spacing.sm : spacing.md }}
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
          borderTopColor: theme.edgeTop,
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
 * O cartão de tinta escura do DS, a peça de marca. É escuro nos dois modos;
 * no escuro sobe um degrau acima do fundo, com aresta e um brilho esmeralda
 * no canto (ver `ink` em lib/theme.ts). O degradê vem em SVG para não puxar
 * dependência nativa nova só por causa de um fundo.
 */
const GLOW = 260

export function InkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { ink } = useTheme()
  return (
    <View
      style={[
        {
          borderRadius: radius.card,
          padding: spacing.xl,
          overflow: 'hidden',
          backgroundColor: ink.to,
          borderWidth: 1,
          borderColor: ink.edge,
          borderTopColor: ink.edgeTop,
        },
        style,
      ]}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="ink" x1="0" y1="0" x2="0.72" y2="1">
            <Stop offset="0" stopColor={ink.from} />
            <Stop offset="0.62" stopColor={ink.to} />
            <Stop offset="1" stopColor={ink.end} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ink)" />
      </Svg>
      {/* O brilho é um círculo de tamanho fixo no canto. Um radial
          proporcional ao cartão (largo e baixo) achatava numa faixa verde. */}
      {ink.glow ? (
        <Svg
          pointerEvents="none"
          width={GLOW}
          height={GLOW}
          style={{ position: 'absolute', top: -GLOW / 2, right: -GLOW / 3 }}
        >
          <Defs>
            <RadialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={ink.glow} />
              <Stop offset="1" stopColor={ink.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      ) : null}
      {children}
    </View>
  )
}

/**
 * A marca nas telas de entrada: o mesmo quadrado de tinta escura e canto 16 que
 * o DS usa na inicial do cabeçalho — é o único elemento de marca do sistema.
 */
export function BrandMark({ children, size = 46 }: { children: ReactNode; size?: number }) {
  const { ink } = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        // No escuro a tinta da marca era a mesma do fundo e o quadrado sumia,
        // deixando só o ícone solto. Lá ele sobe um degrau e ganha aresta.
        backgroundColor: ink.mark,
        borderWidth: 1,
        borderColor: ink.edge,
        borderTopColor: ink.edgeTop,
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
  const color = direction === 'in' ? theme.positive : theme.text
  return (
    <Text
      accessibilityLabel={hidden ? 'Valor oculto' : undefined}
      style={[
        type.amount,
        tabular,
        { color, fontSize: size ?? type.amount.fontSize },
      ]}
    >
      {sign}
      {mask(format(Math.abs(cents)), hidden)}
    </Text>
  )
}

/**
 * Valor oculto pelo olho do cabeçalho: os números viram bolinhas e o resto
 * fica ("+ R$ 1.234,56" → "+ R$ ••••"). A quantidade de bolinhas é fixa de
 * propósito: uma por dígito entregaria a ordem de grandeza do valor.
 */
export const MASK = '••••'

export function mask(text: string, hidden: boolean): string {
  return hidden ? text.replace(/\d[\d.,]*/g, MASK) : text
}

/**
 * O olho que esconde os valores. O estado é do app inteiro (`lib/privacy`):
 * esconder na Início esconde também nos Relatórios.
 */
export function EyeToggle() {
  const theme = useTheme()
  const [hidden, setHidden] = useHidden()
  return (
    <Pressable
      onPress={() => setHidden(!hidden)}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      accessibilityState={{ checked: hidden }}
      hitSlop={8}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
    >
      <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.text2} />
    </Pressable>
  )
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

  // Desabilitado (não ocupado) num tema com estado neutro próprio: cinza com
  // rótulo apagado, em vez do botão inteiro a 45% (ver `disabledButton`).
  const neutral = disabled && !loading && (variant === 'primary' || variant === 'danger')
    ? theme.disabledButton
    : null

  const fill = neutral
    ? neutral.fill
    : variant === 'primary'
      ? theme.accent
      : variant === 'danger'
        ? theme.danger
        : 'transparent'
  const label_ = neutral
    ? neutral.label
    : variant === 'primary' || variant === 'danger'
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
          // 45% é o estado desabilitado do DS (salvo quando o tema tem o neutro).
          opacity: neutral ? 1 : inactive ? 0.45 : pressed ? 0.88 : 1,
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

/**
 * Ícone da categoria num quadrado com a cor dela, suave. Usa a versão
 * "outline" do Ionicons quando existe, que combina com o resto do app; sem
 * ícone (categoria criada à mão), cai na etiqueta.
 */
export function CategoryIcon({
  icon,
  color,
  size = 42,
}: {
  icon: string | null | undefined
  color: string | null | undefined
  size?: number
}) {
  const theme = useTheme()
  const glyphs = Ionicons.glyphMap as Record<string, number>
  const base = icon && glyphs[icon] ? icon : 'pricetag'
  const name = (glyphs[`${base}-outline`] ? `${base}-outline` : base) as keyof typeof Ionicons.glyphMap
  const tint = color && /^#[0-9a-f]{6}$/i.test(color) ? color : theme.text2
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size < 36 ? radius.sm : radius.md,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        // A cor da categoria a 16%: dá para reconhecer de relance sem virar
        // um arco-íris na lista.
        backgroundColor: `${tint}29`,
      }}
    >
      <Ionicons name={name} size={size * 0.46} color={tint} />
    </View>
  )
}

/**
 * Logo do banco (Nubank, Itaú), vindo da CDN da Pluggy. Fica sobre uma placa
 * branca: os logos chegam sem fundo, e o roxo do Nubank sumiria no tema
 * escuro. Sem logo, ou se a imagem não carregar, mostra o ícone genérico no
 * quadrado de destaque, como antes.
 */
export function BankLogo({
  uri,
  fallback,
  size = 36,
}: {
  uri: string | null | undefined
  fallback: keyof typeof Ionicons.glyphMap
  size?: number
}) {
  const theme = useTheme()
  const [failed, setFailed] = useState(false)
  const corner = size >= 30 ? 11 : Math.round(size * 0.3)
  if (!uri || failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: corner,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.accentSoft,
        }}
      >
        <Ionicons name={fallback} size={Math.round(size * 0.47)} color={theme.accentText} />
      </View>
    )
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
    </View>
  )
}

/* ─────────────────────── barra de abas flutuante ─────────────────────── */

/** Altura da barra de abas e a folga entre ela e a borda de baixo. */
export const TAB_BAR_HEIGHT = 64
export function tabBarBottom(insetBottom: number): number {
  // No iPhone a barra fica logo acima do indicador de início; sem inset
  // (navegador), a 14px da borda.
  return insetBottom > 0 ? Math.max(insetBottom - 6, 12) : 14
}

/**
 * Espaço a deixar no fim de cada tela: a barra flutua por cima do conteúdo,
 * então o último item precisa poder rolar até acima dela.
 */
export function useTabBarSpace(): number {
  const { bottom } = useSafeAreaInsets()
  return TAB_BAR_HEIGHT + tabBarBottom(bottom) + spacing.xl
}

/** Cartão agrupado do DS: raio 20, filhos separados por régua de 1px. */
export function ListGroup({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderTopColor: theme.edgeTop,
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
