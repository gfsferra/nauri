import { LEGAL_CONTACT, LegalPage, type LegalSection } from '@/components/legal'

/*
 * Ao mudar este texto, atualize UPDATED_AT. Mudança relevante (dado novo,
 * fornecedor novo, finalidade nova) deve ser avisada aos usuários antes de
 * valer — ver a seção "Mudanças nesta política".
 */
const UPDATED_AT = '11 de novembro de 2026'

const sections: LegalSection[] = [
  {
    title: 'Quem é o responsável pelos seus dados',
    body: [
      `O Nauri (nauri.app) é mantido por Gabriel Faria Sferra, pessoa física, que é o controlador dos dados pessoais tratados no serviço, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a "LGPD").`,
      `Para qualquer assunto sobre os seus dados, inclusive para exercer os seus direitos, escreva para ${LEGAL_CONTACT}. Este é o canal de atendimento ao titular.`,
    ],
  },
  {
    title: 'Quais dados tratamos',
    body: [
      'Tratamos apenas o necessário para o serviço funcionar:',
      {
        list: [
          'Dados de cadastro: nome, e-mail e senha. A senha nunca é guardada como texto: guardamos apenas um resumo criptográfico (hash) dela, que não permite recuperá-la.',
          'Dados financeiros que você mesmo registra: lançamentos (valor, data, descrição e categoria) e categorias.',
          'Planilhas importadas: o arquivo é lido no seu próprio aparelho e nunca é enviado aos nossos servidores. Só os lançamentos que você confirma na importação são gravados.',
          'Dados técnicos de acesso: endereço IP e identificação do navegador ou aparelho (user agent) de cada sessão aberta, e o endereço IP usado para limitar tentativas de login.',
          'Registros técnicos do servidor (data, hora, endereço acessado e resultado de cada requisição), usados para diagnosticar falhas e ataques.',
        ],
      },
      'Não coletamos dados bancários, de cartão ou senhas de bancos, e o Nauri não se conecta à sua conta bancária. Não pedimos CPF nem documentos.',
      'A única exceção é a conta do próprio mantenedor do Nauri, que importa os lançamentos e os investimentos das contas dele por Open Finance, por meio da Pluggy (plano de uso pessoal). Essa integração não está disponível para os demais usuários e não envolve dados de mais ninguém.',
    ],
  },
  {
    title: 'Para que usamos e com qual base legal',
    body: [
      {
        list: [
          'Para prestar o serviço que você contratou: criar e manter sua conta, guardar e mostrar seus lançamentos e relatórios (execução de contrato, art. 7º, V, da LGPD).',
          'Para enviar e-mails necessários ao uso da conta: confirmação de cadastro e redefinição de senha (execução de contrato). Não enviamos publicidade.',
          'Para proteger a sua conta e o serviço: autenticação, limite de tentativas de login e investigação de abusos (legítimo interesse, art. 7º, IX, e execução de contrato).',
          'Para cumprir obrigações legais ou ordens de autoridades competentes, quando houver (art. 7º, II).',
        ],
      },
      'Não vendemos, alugamos nem cedemos os seus dados, e não os usamos para publicidade ou para criar perfis de consumo.',
    ],
  },
  {
    title: 'Cookies',
    body: [
      'Usamos um único cookie, essencial: o de sessão, que mantém você conectado. Ele é marcado como seguro (só trafega por HTTPS) e inacessível a scripts da página, e expira em até 30 dias.',
      'Não usamos cookies de análise, de publicidade ou de terceiros, e os nossos e-mails não têm rastreamento de abertura ou de cliques.',
    ],
  },
  {
    title: 'Com quem compartilhamos',
    body: [
      'Os dados são tratados por fornecedores que nos prestam serviços de infraestrutura (operadores, na linguagem da LGPD), apenas para que o Nauri funcione:',
      {
        list: [
          'Cloudflare: hospedagem do aplicativo, rede e registros técnicos do servidor.',
          'Neon: banco de dados, com servidores em São Paulo.',
          'Resend: envio dos e-mails de confirmação e de redefinição de senha.',
        ],
      },
      'Esses fornecedores são empresas sediadas nos Estados Unidos, e parte do tratamento pode ocorrer fora do Brasil. Essa transferência internacional acontece nos termos do art. 33 da LGPD, para a execução do contrato com você.',
      'Também podemos fornecer dados quando exigido por lei ou por ordem judicial.',
    ],
  },
  {
    title: 'Por quanto tempo guardamos',
    body: [
      {
        list: [
          'Dados da conta e dados financeiros: enquanto a conta existir. Ao excluir a conta, eles são apagados do banco de dados na hora, de forma definitiva.',
          'Cópias de segurança automáticas do banco de dados podem conter esses dados por alguns dias, até serem substituídas.',
          'Sessões: até expirarem (30 dias) ou até você sair da conta.',
          'Controle de tentativas de login: alguns minutos.',
          'Registros técnicos do servidor: poucos dias.',
        ],
      },
    ],
  },
  {
    title: 'Seus direitos',
    body: [
      'Pela LGPD (art. 18), você pode pedir, a qualquer momento: confirmação de que tratamos seus dados; acesso a eles; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei; portabilidade; eliminação dos dados; informação sobre com quem os compartilhamos; e revisão de decisões automatizadas (o Nauri não toma nenhuma).',
      'Parte disso você faz sozinho, dentro do app:',
      {
        list: [
          'Perfil → Exportar meus dados: baixa todos os seus lançamentos em uma planilha (CSV).',
          'Perfil → Excluir minha conta: apaga a conta e todos os dados de forma definitiva.',
        ],
      },
      `Para os demais pedidos, escreva para ${LEGAL_CONTACT} a partir do e-mail da sua conta. Respondemos em até 15 dias.`,
      'Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
    ],
  },
  {
    title: 'Segurança',
    body: [
      'Toda a comunicação é criptografada (HTTPS). As senhas são guardadas apenas como hash, as tentativas de login são limitadas por endereço IP, o e-mail precisa ser confirmado antes do primeiro acesso, e cada consulta ao banco de dados é restrita aos dados do próprio usuário.',
      'Nenhum sistema é totalmente imune a falhas. Se ocorrer um incidente de segurança que possa trazer risco ou dano relevante a você, avisaremos você e a ANPD, como determina o art. 48 da LGPD.',
    ],
  },
  {
    title: 'Idade mínima',
    body: ['O Nauri é destinado a pessoas com 18 anos ou mais. Não tratamos intencionalmente dados de crianças e adolescentes.'],
  },
  {
    title: 'Mudanças nesta política',
    body: [
      'Podemos atualizar esta política. A data da última atualização fica no topo da página. Se a mudança for relevante, como um novo tipo de dado, um novo fornecedor ou uma nova finalidade, avisaremos por e-mail ou no próprio app antes de ela valer.',
    ],
  },
]

export default function Privacy() {
  return (
    <LegalPage
      title="Política de Privacidade"
      updatedAt={UPDATED_AT}
      intro="Esta política explica quais dados pessoais o Nauri trata, para quê, com quem eles são compartilhados e como você pode exercer os seus direitos. O Nauri guarda dados financeiros, então tratamos o mínimo necessário e não usamos os seus dados para nada além de fazer o app funcionar."
      sections={sections}
    />
  )
}
