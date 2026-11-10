import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/lib/theme'

export default function AppLayout() {
  const { data, isPending } = useSession()
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  // Guarda de rota: sem isso, uma URL colada direto no navegador entraria numa
  // tela que chamaria a API sem sessão e só mostraria erro.
  if (isPending) return null
  if (!data?.user) return <Redirect href="/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // A barra do DS: régua de 1px, fundo quase opaco e destaque só no item
        // atual — nada de pílula ou sombra sob os ícones.
        tabBarActiveTintColor: theme.accentText,
        tabBarInactiveTintColor: theme.text3,
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          elevation: 0,
          // Só a altura. O BottomTabItem já traz `paddingVertical: 7`, então
          // somar padding aqui encolhe a caixa de conteúdo e corta o rótulo —
          // o item precisa de 7 + ícone 21 + rótulo 13 + 7 = 48px. A barra
          // reserva 58 e deixa o inset do indicador de home por fora (0 na
          // web, ~34 num iPhone sem botão).
          height: 58 + insets.bottom,
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
        name="new"
        options={{
          title: 'Novo',
          tabBarIcon: ({ color }) => <Ionicons name="add-circle-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color }) => <Ionicons name="pie-chart-outline" color={color} size={20} />,
        }}
      />
      {/* Importar é operação pontual, não merece uma aba fixa: `href: null`
          mantém a rota navegável sem ocupar espaço na barra. */}
      <Tabs.Screen name="import" options={{ href: null }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" color={color} size={21} />,
        }}
      />
    </Tabs>
  )
}
