import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

/**
 * Esqueleto HTML do export web (só roda no build, nunca no navegador).
 *
 * Além do padrão do Expo, declara o PWA: o manifest, a cor da barra do
 * navegador nos dois temas e os ícones e metas que o iOS lê para "Adicionar à
 * Tela de Início". Sem service worker de propósito: um app de dados
 * financeiros não deve mostrar saldo de cache como se fosse atual, e o Chrome
 * não exige service worker para instalar.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover: no app instalado no iPhone o conteúdo usa a
            tela toda, e o SafeAreaView cuida do entalhe. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* O <title> vem do <Head> em app/_layout.tsx: o expo-router sempre
            injeta o dele antes deste esqueleto, e o navegador usa o primeiro. */}
        <meta name="description" content="Suas finanças, no bolso e no navegador." />

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#F8FAFC" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0F172A" media="(prefers-color-scheme: dark)" />

        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Nauri" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  )
}
