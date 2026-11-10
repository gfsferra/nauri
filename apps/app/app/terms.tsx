import { LEGAL_CONTACT, LegalPage, type LegalSection } from '@/components/legal'

/* Ao mudar este texto, atualize UPDATED_AT e avise os usuários (seção 10). */
const UPDATED_AT = '10 de novembro de 2026'

const sections: LegalSection[] = [
  {
    title: 'Aceitação',
    body: [
      'Estes termos regem o uso do Nauri (nauri.app), mantido por Gabriel Faria Sferra. Ao criar uma conta, você declara que leu e aceita estes termos e a Política de Privacidade. Se não concordar, não use o serviço.',
    ],
  },
  {
    title: 'O que é o Nauri',
    body: [
      'O Nauri é uma ferramenta para organizar as suas finanças pessoais: você registra receitas e despesas, separa por categoria, acompanha orçamentos e vê relatórios.',
      'O Nauri não é um banco nem uma instituição de pagamento: não guarda, não movimenta e não investe dinheiro, e não se conecta à sua conta bancária. Também não é consultoria financeira, contábil, fiscal ou de investimentos. Os números mostrados dependem do que você registra e servem para a sua organização, não como recomendação.',
    ],
  },
  {
    title: 'Sua conta',
    body: [
      {
        list: [
          'Você precisa ter 18 anos ou mais.',
          'As informações de cadastro devem ser verdadeiras, e o e-mail precisa ser seu: é por ele que confirmamos a conta e enviamos a redefinição de senha.',
          'Você é responsável por manter a senha em sigilo e pelo que for feito com a sua conta. Se suspeitar de acesso indevido, troque a senha e nos avise.',
          'Cada conta é de uso individual.',
          'No momento, o cadastro de contas novas é feito por convite.',
        ],
      },
    ],
  },
  {
    title: 'Uso permitido',
    body: [
      'Você concorda em não:',
      {
        list: [
          'usar o Nauri para qualquer finalidade ilegal;',
          'tentar acessar contas ou dados de outras pessoas;',
          'tentar burlar os limites de segurança, sobrecarregar ou atacar o serviço, ou testar vulnerabilidades sem autorização;',
          'coletar dados do serviço de forma automatizada.',
        ],
      },
      `Se encontrar uma falha de segurança, por favor nos conte em ${LEGAL_CONTACT} antes de divulgá-la.`,
    ],
  },
  {
    title: 'Seus dados',
    body: [
      'Os dados que você registra no Nauri são seus. Nós os usamos apenas para prestar o serviço, como descrito na Política de Privacidade.',
      'Você pode exportá-los a qualquer momento (Perfil → Exportar meus dados) e excluir a conta quando quiser (Perfil → Excluir minha conta). A exclusão é definitiva e não pode ser desfeita.',
    ],
  },
  {
    title: 'Preço e disponibilidade',
    body: [
      'O Nauri é gratuito no momento. Se um dia passar a ter planos pagos, nada será cobrado sem o seu aceite prévio.',
      'Trabalhamos para manter o serviço no ar e os dados seguros, mas não garantimos funcionamento ininterrupto: podem ocorrer manutenções e falhas. Recomendamos exportar os seus dados periodicamente.',
      'O Nauri pode mudar, ganhar ou perder funções. Se o serviço for encerrado, avisaremos com pelo menos 30 dias de antecedência, para que você possa exportar os seus dados.',
    ],
  },
  {
    title: 'Responsabilidade',
    body: [
      'Nos limites permitidos pela lei, incluindo o Código de Defesa do Consumidor, o Nauri não se responsabiliza por decisões financeiras tomadas com base nas informações que você registrou, nem por perdas causadas por informações incorretas, pelo uso indevido da sua conta por falta de cuidado com a senha, ou por indisponibilidades temporárias do serviço.',
    ],
  },
  {
    title: 'Suspensão e encerramento',
    body: [
      'Você pode encerrar a sua conta a qualquer momento, excluindo-a no app.',
      'Podemos suspender ou encerrar contas que violem estes termos ou a lei. Sempre que possível, avisaremos antes e daremos a chance de exportar os dados.',
    ],
  },
  {
    title: 'Lei aplicável',
    body: [
      'Estes termos são regidos pelas leis brasileiras. Eventuais conflitos serão resolvidos no foro do seu domicílio.',
    ],
  },
  {
    title: 'Mudanças nestes termos',
    body: [
      'Podemos atualizar estes termos. A data da última atualização fica no topo da página. Se a mudança for relevante, avisaremos por e-mail ou no próprio app antes de ela valer. Continuar usando o Nauri depois disso significa aceitar a nova versão; se não concordar, você pode exportar os seus dados e excluir a conta.',
    ],
  },
  {
    title: 'Contato',
    body: [`Dúvidas, pedidos ou reclamações: ${LEGAL_CONTACT}.`],
  },
]

export default function Terms() {
  return (
    <LegalPage
      title="Termos de Uso"
      updatedAt={UPDATED_AT}
      intro="Estes termos explicam o que o Nauri é, o que você pode esperar dele e o que esperamos de você. Escrevemos de forma direta, sem letras miúdas."
      sections={sections}
    />
  )
}
