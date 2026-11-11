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
const statusBarScript = `(function () {
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var meta = document.createElement('meta');
  meta.name = 'apple-mobile-web-app-status-bar-style';
  meta.content = dark ? 'black-translucent' : 'default';
  document.head.appendChild(meta);
})();`

/*
 * - Fundo da página na cor do tema: no iPhone a tela "estica" ao rolar além
 *   do topo, e sem isto aparece branco por trás do app (e da barra de status
 *   translúcida).
 * - O Safari do iOS dá zoom ao focar um campo com fonte menor que 16px (os do
 *   DS são 14,5). A regra vale só no iOS (-webkit-touch-callout é exclusivo
 *   dele), então o resto não muda, e o zoom de pinça continua funcionando,
 *   ao contrário de travar o zoom no viewport.
 */
const iosCss = `
html, body { background-color: #F8FAFC; }
@media (prefers-color-scheme: dark) { html, body { background-color: #0F172A; } }
@supports (-webkit-touch-callout: none) {
  input, textarea, select { font-size: 16px !important; }
}
`

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
        {/* Barra de status do app instalado no iPhone. No escuro ela fica
            transparente ("black-translucent"), com o fundo do app por trás e
            o texto branco; o SafeAreaView afasta o conteúdo do relógio. No
            claro fica "default" (branca, texto escuro), que já combina com o
            fundo claro: a translúcida tem texto sempre branco e sumiria. O iOS
            lê a meta quando o app abre, então trocar o tema do aparelho com o
            app aberto só vale na próxima abertura. */}
        <script dangerouslySetInnerHTML={{ __html: statusBarScript }} />
        <style dangerouslySetInnerHTML={{ __html: iosCss }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  )
}
