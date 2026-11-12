import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { Redirect, Tabs } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TransactionSheetHost } from '@/components/transaction-sheet'
import { TAB_BAR_HEIGHT, tabBarBottom } from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { spacing, useTheme } from '@/lib/theme'

export default function AppLayout() {
  const { data, isPending } = useSession()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // A aba Investimentos só existe para quem tem Open Finance. Mesma chave da
  // Início e do Perfil: o cache é um só.
  const openFinance = useQuery({
    queryKey: ['open-finance'],
    queryFn: async () => unwrap(await client['open-finance'].$get()),
    enabled: !!data?.user,
  })
  const showInvestments = openFinance.data?.enabled === true

  // Guarda de rota: sem isso, uma URL colada direto no navegador entraria numa
  // tela que chamaria a API sem sessão e só mostraria erro.
  if (isPending) return null
  if (!data?.user) return <Redirect href="/login" />

  return (
    <>
      <Tabs
        // A barra é posicionada à mão (flutuando acima do indicador de início),
        // então o inset de baixo não entra no padding interno dela.
        safeAreaInsets={{ bottom: 0 }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.accentText,
          tabBarInactiveTintColor: theme.text3,
          // Pílula de vidro flutuante, no estilo das barras do iOS: o conteúdo
          // rola por baixo e aparece desfocado. Cada tela reserva o espaço no
          // fim com `useTabBarSpace`.
          tabBarStyle: {
            position: 'absolute',
            left: spacing.gutter,
            right: spacing.gutter,
            bottom: tabBarBottom(insets.bottom),
            height: TAB_BAR_HEIGHT,
            paddingHorizontal: 6,
            paddingTop: 0,
            paddingBottom: 0,
            borderRadius: TAB_BAR_HEIGHT / 2,
            borderTopWidth: 1,
            borderWidth: 1,
            borderColor: theme.glassBorder,
            borderTopColor: theme.glassBorder,
            backgroundColor: 'transparent',
            elevation: 0,
            // Sombra e desfoque só existem como CSS na web, que é onde o app
            // roda (PWA). No nativo a barra fica translúcida, sem desfoque.
            ...(Platform.OS === 'web' ? ({ boxShadow: theme.glassShadow } as object) : null),
          },
          tabBarBackground: () => (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: TAB_BAR_HEIGHT / 2,
                  overflow: 'hidden',
                  backgroundColor: theme.glassBg,
                },
                Platform.OS === 'web'
                  ? ({
                      backdropFilter: 'blur(22px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                    } as object)
                  : null,
              ]}
            />
          ),
          // A aba atual ganha uma cápsula, como no iOS: dá para saber onde se
          // está sem depender só da cor.
          tabBarActiveBackgroundColor: theme.accentSoft,
          // Sem padding no item: a cor da aba atual fica no elemento de dentro, e
          // com padding ela não preencheria a cápsula arredondada.
          tabBarItemStyle: {
            marginVertical: 6,
            marginHorizontal: 2,
            borderRadius: (TAB_BAR_HEIGHT - 14) / 2,
            paddingVertical: 0,
            overflow: 'hidden',
          },
          tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Início',
            tabBarIcon: ({ color }) => <Ionicons name="home-outline" color={color} size={21} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Relatórios',
            tabBarIcon: ({ color }) => <Ionicons name="pie-chart-outline" color={color} size={20} />,
          }}
        />
        <Tabs.Screen
          name="investments"
          options={{
            // "Investimentos" sai cortado na barra a 390px; o título da tela é o nome completo.
            title: 'Investir',
            href: showInvestments ? undefined : null,
            tabBarIcon: ({ color }) => <Ionicons name="trending-up-outline" color={color} size={21} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color }) => <Ionicons name="person-outline" color={color} size={21} />,
          }}
        />
      </Tabs>
      {/* O detalhe de um lançamento, aberto da Início ou dos Relatórios. */}
      <TransactionSheetHost />
    </>
  )
}
