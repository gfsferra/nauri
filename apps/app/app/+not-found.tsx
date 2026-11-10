import { Redirect } from 'expo-router'

/**
 * Rota sem tela vai para a porta de entrada, que decide entre login e início.
 * Sem isto o expo-router mostra a própria tela de erro, em inglês e com link
 * para o sitemap de depuração.
 */
export default function NotFound() {
  return <Redirect href="/" />
}
