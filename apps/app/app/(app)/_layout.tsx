import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/lib/theme'

export default function AppLayout() {
  const { data, isPending } = useSession()
  const theme = useTheme()

  // Guarda de rota: sem isso, uma URL colada direto no navegador entraria numa
  // tela que chamaria a API sem sessão e só mostraria erro.
  if (isPending) return null
  if (!data?.user) return <Redirect href="/entrar" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen
        name="lancamentos"
        options={{
          title: 'Lançamentos',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="novo"
        options={{
          title: 'Novo',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart" color={color} size={size} />,
        }}
      />
      {/* Importar é operação pontual, não merece uma aba fixa: `href: null`
          mantém a rota navegável sem ocupar espaço na barra. */}
      <Tabs.Screen name="importar" options={{ href: null }} />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
