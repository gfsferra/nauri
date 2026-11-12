import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import { Skeleton, mask } from '@/components/ui'
import { formatBRL } from '@/lib/format'
import { useReducedMotion, useTween } from '@/lib/motion'
import { radius, tabular, type, useTheme } from '@/lib/theme'

/* Peças de número e de escolha que os Relatórios, os Investimentos e o Perfil dividem. */

/**
 * Um bloco que sobe e aparece ao abrir a tela, um depois do outro pelo
 * `index`, como os indicadores dos Investimentos.
 */
export function Rise({ index = 0, children }: { index?: number; children: ReactNode }) {
  const reduced = useReducedMotion()
  const rise = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduced) {
      rise.setValue(1)
      return
    }
    Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      delay: 40 + index * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [rise, index, reduced])
  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  )
}

/** O número grande da tela, contando até o valor novo em vez de saltar. */
export function CountUp({ cents, hidden }: { cents: number; hidden: boolean }) {
  const theme = useTheme()
  const value = useTween(cents)
  return (
    <Text
      accessibilityLabel={hidden ? 'Valor oculto' : formatBRL(cents)}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[type.balance, tabular, { color: theme.text, marginTop: 4 }]}
    >
      {mask(formatBRL(Math.round(value)), hidden)}
    </Text>
  )
}

/** Número pequeno embaixo do total, no desenho das Entradas/Saídas da Início. */
export function Figure({ label, value }: { label: string; value: string | null }) {
  const theme = useTheme()
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ ...type.caption, color: theme.text2 }}>{label}</Text>
      {value === null ? (
        <Skeleton width={64} height={14} style={{ marginTop: 3 }} />
      ) : (
        <Text style={[{ fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: theme.text }, tabular]}>
          {value}
        </Text>
      )}
    </View>
  )
}

/**
 * Seletor de dois estados com a cápsula deslizando entre eles. A cápsula é
 * uma camada só, que anda com o driver nativo; os rótulos ficam por cima.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: {
    value: T
    label: string
    icon?: keyof typeof Ionicons.glyphMap
    /** Cor do ícone quando a opção está ativa; o padrão é o destaque. */
    tint?: string
  }[]
  /** `sm` cabe no cabeçalho de um cartão; `md` ocupa a largura da tela. */
  size?: 'sm' | 'md'
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const x = useRef(new Animated.Value(index)).current
  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
  }, [index, x])
  const pad = size === 'sm' ? 3 : 4
  const item = width > 0 ? (width - pad * 2) / options.length : 0

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        height: size === 'sm' ? 32 : 44,
        padding: pad,
        borderRadius: radius.full,
        backgroundColor: theme.surface2,
      }}
    >
      {item > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: pad,
            left: pad,
            width: item,
            bottom: pad,
            borderRadius: radius.full,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            borderTopColor: theme.edgeTop,
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, item] }) }],
          }}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingHorizontal: size === 'sm' ? 12 : 0,
            }}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={14}
                color={active ? (option.tint ?? theme.accentText) : theme.text3}
              />
            ) : null}
            <Text
              style={{
                ...type.body,
                fontSize: size === 'sm' ? 12.5 : type.body.fontSize,
                fontWeight: '600',
                color: active ? theme.text : theme.text2,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
