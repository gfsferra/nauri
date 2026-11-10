import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useSession } from '@/lib/auth-client'
import { useTheme } from '@/lib/theme'

/** Porta de entrada: decide entre app e login assim que a sessão é conhecida. */
export default function Index() {
  const { data, isPending } = useSession()
  const theme = useTheme()

  // Enquanto a sessão não é conhecida, só o fundo do tema: o DS não usa
  // spinner em lugar nenhum, e aqui a espera é de milissegundos.
  if (isPending) return <View style={{ flex: 1, backgroundColor: theme.bg }} />

  return <Redirect href={data?.user ? '/home' : '/sign-in'} />
}
