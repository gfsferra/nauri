import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { addMonths, capitalize, currentMonth, formatMonth } from '@/lib/format'
import { radius, type, useTheme } from '@/lib/theme'

/**
 * Largura de cada mês. Todos iguais: assim a posição da rolagem diz direto
 * qual mês está no centro. A cápsula do escolhido pode passar um pouco da
 * largura ("Fevereiro"), por cima do respiro dos vizinhos.
 */
const ITEM = 80
const HEIGHT = 40
/** Pausa na rolagem que conta como "parou": aí o mês do centro é escolhido. */
const SETTLE_MS = 140
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
 * numa cápsula no centro e os vizinhos esmaecem nas bordas. Rolar já
 * escolhe: a cápsula acompanha o mês que passa pelo centro e, quando a
 * rolagem para, ele vira o mês da tela. Tocar num mês também escolhe.
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
  // Com meia tela de sobra em cada ponta, o mês de índice i fica no centro
  // quando a rolagem está em i × ITEM.
  const target = Math.max(0, index) * ITEM
  // O mês que está no centro agora, durante a rolagem; fora dela, o escolhido.
  const [focus, setFocus] = useState(index)
  useEffect(() => setFocus(index), [index])
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current)
  }, [])

  function onScroll(x: number) {
    const i = Math.min(months.length - 1, Math.max(0, Math.round(x / ITEM)))
    setFocus(i)
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      if (months[i] !== month) onChange(months[i]!)
      // Parou entre dois meses: encaixa no do centro.
      else if (Math.abs(x - i * ITEM) > 1) scroll.current?.scrollTo({ x: i * ITEM, animated: true })
    }, SETTLE_MS)
  }
  // Primeira vez sem animação (a faixa já abre no lugar); depois, desliza.
  const placed = useRef(false)
  function center() {
    if (width <= 0 || index < 0) return
    scroll.current?.scrollTo({ x: target, animated: placed.current })
    placed.current = true
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(center, [target, width])

  // O ano acompanha o mês do centro, para quem rola até virar o ano.
  const year = (months[focus] ?? month).slice(0, 4)

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ alignSelf: 'stretch', height: HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Sobra de meia tela em cada ponta: o primeiro e o último mês
          // também conseguem ficar no centro.
          contentContainerStyle={{ paddingHorizontal: Math.max(0, (width - ITEM) / 2) }}
          onScroll={(e) => onScroll(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          // No aparelho a própria rolagem já para num mês; na web o encaixe
          // vem do `onScroll` acima.
          snapToInterval={ITEM}
          decelerationRate="fast"
          // A primeira rolagem pode chegar antes de a faixa ter tamanho.
          onContentSizeChange={() => {
            if (!placed.current) center()
          }}
          accessibilityRole="tablist"
        >
          {months.map((m, i) => {
            const selected = m === month
            const focused = i === focus
            return (
              <Pressable
                key={m}
                onPress={() => onChange(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                // Na web o estado acima não vira aria-selected sozinho.
                aria-selected={selected}
                accessibilityLabel={formatMonth(m)}
                style={{ width: ITEM, height: HEIGHT, alignItems: 'center', justifyContent: 'center' }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: radius.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: focused ? theme.accentSoft : 'transparent',
                      opacity: pressed && !focused ? 0.6 : 1,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: focused ? 15 : 14,
                        fontWeight: focused ? '700' : '500',
                        letterSpacing: focused ? -0.3 : 0,
                        color: focused ? theme.accentText : m === today ? theme.text : theme.text3,
                      }}
                    >
                      {focused ? capitalize(formatMonth(m).replace(/ de \d{4}$/, '')) : shortName(m)}
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
