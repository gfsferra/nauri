import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { addMonths, capitalize, currentMonth, formatMonth } from '@/lib/format'
import { radius, type, useTheme } from '@/lib/theme'

/** Largura dos meses vizinhos e do escolhido, que cabe "Fevereiro" na cápsula. */
const ITEM = 64
const SELECTED = 116
const HEIGHT = 40
/** Esmaecimento das bordas: os meses vizinhos somem em vez de serem cortados. */
const FADE = 44
/** Quantos meses para trás e para a frente do atual a faixa oferece. */
const BACK = 24
const AHEAD = 3

/** 'novembro de 2026' → 'nov'. */
function shortName(month: string): string {
  return formatMonth(month).slice(0, 3)
}

/**
 * Seletor de mês em faixa: os meses rolam na horizontal, o escolhido fica
 * numa cápsula no centro e os vizinhos esmaecem nas bordas. Tocar escolhe.
 * O ano fica embaixo, com o atalho para voltar ao mês de hoje quando se sai
 * dele.
 */
export function MonthStrip({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const theme = useTheme()
  const today = currentMonth()
  const scroll = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)

  const months = useMemo(() => {
    const first = month < addMonths(today, -BACK) ? month : addMonths(today, -BACK)
    const last = month > addMonths(today, AHEAD) ? month : addMonths(today, AHEAD)
    const list: string[] = []
    for (let m = first; m <= last; m = addMonths(m, 1)) list.push(m)
    return list
  }, [month, today])

  const index = months.indexOf(month)
  // Com meia tela de sobra em cada ponta, centralizar o escolhido é rolar até
  // o começo dele: a soma das larguras (todas de vizinho) antes dele.
  const target = Math.max(0, index) * ITEM
  // Primeira vez sem animação (a faixa já abre no lugar); depois, desliza.
  const placed = useRef(false)
  function center() {
    if (width <= 0 || index < 0) return
    scroll.current?.scrollTo({ x: target, animated: placed.current })
    placed.current = true
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(center, [target, width])

  const year = month.slice(0, 4)

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ alignSelf: 'stretch', height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Sobra de meia tela em cada ponta: o primeiro e o último mês
          // também conseguem ficar no centro.
          contentContainerStyle={{ paddingHorizontal: Math.max(0, (width - SELECTED) / 2) }}
          // A primeira rolagem pode chegar antes de a faixa ter tamanho.
          onContentSizeChange={() => {
            if (!placed.current) center()
          }}
          accessibilityRole="tablist"
        >
          {months.map((m) => {
            const selected = m === month
            return (
              <Pressable
                key={m}
                onPress={() => onChange(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                // Na web o estado acima não vira aria-selected sozinho.
                aria-selected={selected}
                accessibilityLabel={formatMonth(m)}
                style={{ width: selected ? SELECTED : ITEM, height: HEIGHT, alignItems: 'center', justifyContent: 'center' }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      height: 36,
                      minWidth: selected ? SELECTED - 8 : 0,
                      paddingHorizontal: 14,
                      borderRadius: radius.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? theme.accentSoft : 'transparent',
                      opacity: pressed && !selected ? 0.6 : 1,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: selected ? 15 : 14,
                        fontWeight: selected ? '700' : '500',
                        letterSpacing: selected ? -0.3 : 0,
                        color: selected ? theme.accentText : m === today ? theme.text : theme.text3,
                      }}
                    >
                      {selected ? capitalize(formatMonth(m).replace(/ de \d{4}$/, '')) : shortName(m)}
                    </Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </ScrollView>

        {/* As bordas esmaecem para o fundo da tela. */}
        {(['left', 'right'] as const).map((side) => (
          <Svg
            key={side}
            pointerEvents="none"
            width={FADE}
            height={HEIGHT}
            style={{ position: 'absolute', top: 0, [side]: 0 }}
          >
            <Defs>
              <LinearGradient id={`fade-${side}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={theme.bg} stopOpacity={side === 'left' ? 1 : 0} />
                <Stop offset="1" stopColor={theme.bg} stopOpacity={side === 'left' ? 0 : 1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={FADE} height={HEIGHT} fill={`url(#fade-${side})`} />
          </Svg>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
        <Text style={{ ...type.caption, color: theme.text3, letterSpacing: 0.4 }}>{year}</Text>
        {month !== today ? (
          <>
            <Text style={{ ...type.caption, color: theme.text3 }}>·</Text>
            <Pressable onPress={() => onChange(today)} hitSlop={10} accessibilityRole="button">
              <Text style={{ ...type.caption, fontWeight: '600', color: theme.accentText }}>Voltar para hoje</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  )
}
