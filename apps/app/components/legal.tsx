import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { Gutter, Heading, Muted, Screen, Title } from '@/components/ui'
import { spacing, type, useTheme } from '@/lib/theme'

/** Um parágrafo é texto corrido; uma lista vira itens com marcador. */
export type LegalBlock = string | { list: string[] }

export type LegalSection = { title: string; body: LegalBlock[] }

export const LEGAL_CONTACT = 'support@nauri.app'

/**
 * Página de texto legal (Termos, Privacidade). Pública: fica fora dos grupos
 * (auth) e (app) para abrir com ou sem sessão, e o export estático gera um
 * HTML próprio, com URL fixa para linkar de fora (e-mails, lojas de apps).
 */
export function LegalPage({
  title,
  updatedAt,
  intro,
  sections,
}: {
  title: string
  updatedAt: string
  intro: string
  sections: LegalSection[]
}) {
  const theme = useTheme()
  const router = useRouter()

  // Quem chega por link direto não tem para onde voltar: cai na entrada.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const paragraph = { ...type.row, fontWeight: '400' as const, color: theme.text, lineHeight: 22 }

  return (
    <Screen scroll>
      {/* Linha de texto longa cansa: no desktop o conteúdo fica numa coluna. */}
      <Gutter style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.xxl }}>
        <Pressable
          onPress={back}
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
        >
          <Ionicons name="chevron-back" size={18} color={theme.accentText} />
          <Text style={{ ...type.row, fontWeight: '600', color: theme.accentText }}>Voltar</Text>
        </Pressable>

        <View style={{ gap: spacing.sm }}>
          <Title>{title}</Title>
          <Muted>Última atualização: {updatedAt}</Muted>
        </View>

        <Text style={paragraph}>{intro}</Text>

        {sections.map((section, i) => (
          <View key={section.title} style={{ gap: spacing.md }}>
            {/* Uma string só: com o número separado, o leitor de tela lê
                "1", ". " e o título como três trechos. */}
            <Heading>{`${i + 1}. ${section.title}`}</Heading>
            {section.body.map((block, j) =>
              typeof block === 'string' ? (
                <Text key={j} style={paragraph}>
                  {block}
                </Text>
              ) : (
                <View key={j} style={{ gap: spacing.sm }}>
                  {block.list.map((item) => (
                    <View key={item} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Text style={paragraph}>•</Text>
                      <Text style={[paragraph, { flex: 1 }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}

        <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
          <Link href="/terms">
            <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>Termos de Uso</Text>
          </Link>
          <Link href="/privacy">
            <Text style={{ ...type.body, fontWeight: '600', color: theme.accentText }}>
              Política de Privacidade
            </Text>
          </Link>
        </View>
      </Gutter>
    </Screen>
  )
}
