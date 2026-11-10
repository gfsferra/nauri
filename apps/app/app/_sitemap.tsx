import { Redirect } from 'expo-router'

/**
 * Sobrescreve o `/_sitemap` que o expo-router gera sozinho: é uma página de
 * depuração (lista de rotas, versão do SDK) e não deve ficar no ar. Quem chega
 * aqui vai para a porta de entrada, como em qualquer outra rota sem tela.
 */
export default function Sitemap() {
  return <Redirect href="/" />
}
