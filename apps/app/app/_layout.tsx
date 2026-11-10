import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import Head from 'expo-router/head'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lançamento é dado que muda por ação do próprio usuário, não sozinho:
      // revalidar a cada foco só gastaria rede.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Título da aba e do app instalado. Sem ele o expo-router gera um
          <title> vazio, e o navegador mostra a URL no lugar do nome. */}
      <Head>
        <title>Nauri</title>
      </Head>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
