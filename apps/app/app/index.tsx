import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/lib/theme'

/** Porta de entrada: decide entre app e login assim que a sessão é conhecida. */
export default function Index() {
  const { data, isPending } = useSession()
  const theme = useTheme()

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.muted} />
      </View>
    )
  }

  return <Redirect href={data?.user ? '/lancamentos' : '/entrar'} />
}
