# Nauri

Controle financeiro pessoal: um app que roda no iPhone, no Android e no navegador,
servidos pela mesma API headless.

## Como está organizado

```
packages/contracts   Schemas Zod compartilhados — a fonte única do contrato
apps/api             Hono + Drizzle + Better Auth → Cloudflare Workers
apps/app             Expo SDK 57 + Expo Router → iOS, Android e Web
```

O app importa o tipo da API com `import type`, então o TypeScript valida cada
chamada ponta a ponta enquanto o bundler não leva nada do servidor para o cliente.
Mudar o formato de uma resposta na API quebra o `tsc` do app na hora.

## Decisões que valem saber antes de mexer

- **Dinheiro é sempre `bigint` em centavos.** Nunca `float`, nunca `numeric`.
  O parsing em `apps/api/src/lib/money.ts` arredonda em espaço de string, sem
  passar por ponto flutuante em momento algum.
- **Datas de lançamento são `DATE`, não `timestamp`.** Um gasto "do dia 5" é uma
  data de calendário. Com timestamp, uma compra às 23h em São Paulo é lida como o
  dia seguinte em UTC — e na virada do ano, como o ano seguinte.
- **A FK composta `(category_id, kind)`** faz o banco recusar um gasto vinculado a
  categoria de receita. A coerência não depende de lembrarmos de validar.
- **Rate limit de autenticação no banco.** Login e cadastro aceitam 10
  tentativas por minuto por IP; redefinição de senha, 3. A contagem fica na
  tabela `rate_limit` (Better Auth com `storage: 'database'`), então o limite é
  exato. O IP vem do `cf-connecting-ip`, que o cliente não consegue forjar.
- **Toda query filtra por `user_id`.** Num app multiusuário, um `WHERE` esquecido
  serve o extrato de uma pessoa para outra.

## Rodando localmente

### 1. Banco (Neon)

Crie uma conta em [neon.tech](https://neon.tech), um projeto na região `sa-east-1`
(São Paulo) e copie a connection string.

### 2. E-mail (Resend)

Crie uma conta em [resend.com](https://resend.com) e gere uma API key. Sem isso o
cadastro trava na verificação de e-mail.

### 3. Variáveis

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
# preencha DATABASE_URL, RESEND_API_KEY e MAIL_FROM
# gere o segredo com: openssl rand -base64 32
```

Para o app, crie `apps/app/.env.local`:

```
EXPO_PUBLIC_API_URL=http://localhost:8787
```

### 4. Migrations e execução

```bash
npm install
DATABASE_URL="sua-url" npm run db:migrate --workspace @nauri/api

npm run dev:api    # API em http://localhost:8787
npm run dev:app    # Expo: aperte 'w' para web, ou leia o QR no Expo Go
```

## Verificação

```bash
npm test           # dinheiro, datas, Open Finance e investimentos
npm run typecheck  # todos os workspaces
```

A suíte cobre de propósito os pontos onde um erro custa dinheiro: parsing de
valores em pt-BR, limites de mês e fuso, a conversão do Open Finance e as
contas dos investimentos.

## Cadastro por convite

Enquanto o app amadurece, mantenha no `.dev.vars` (e nos secrets do deploy):

```
SIGNUP_MODE="invite"
INVITE_CODE="algum-código"
```

O schema já é multiusuário; isto só adia a abertura pública.

## Open Finance (Meu Pluggy)

O dono do Nauri importa a conta corrente e o cartão do próprio banco pelo
[Meu Pluggy](https://www.pluggy.ai/meu-pluggy), o plano gratuito de **uso
pessoal** da Pluggy. Por ser uso pessoal, o recurso existe para **uma conta
só** (`OPEN_FINANCE_USER_ID`). Para os demais usuários a API responde
`enabled: false` e a seção nem aparece no Perfil. Abrir para outras pessoas
exige o plano pago da Pluggy.

**Como os dados chegam**
- Os bancos são conectados no site do Meu Pluggy. No painel da Pluggy
  (dashboard.pluggy.ai), a aplicação "Nauri" tem a conexão do conector
  MeuPluggy, criada pela página de demonstração ("Conectar Conta" →
  MeuPluggy).
- A Pluggy atualiza essa conexão sozinha a cada 24 h, e ela não aceita
  atualização manual.
- Um Cron Trigger roda de hora em hora (`wrangler.jsonc`) e processa uma janela
  só por execução (`planSync` em `lib/open-finance.ts`):
  - os últimos 35 dias, quando a Pluggy tem dado novo;
  - senão, uma fatia de um mês do histórico de 12 meses.

  Nenhuma execução carrega o ano inteiro, o que estouraria o limite de CPU do
  plano gratuito do Workers.
- "Sincronizar agora", no Perfil, faz o que estiver pendente (dado novo ou
  a próxima fatia do histórico) e, se não houver nada, relê os últimos 35
  dias. Serve de reserva se o agendamento falhar.
- Cron Triggers exigem que a conta Cloudflare tenha um subdomínio
  `workers.dev` (erro 10063 no deploy, se não tiver). Ele é criado ao abrir
  Workers & Pages no painel pela primeira vez. O Nauri não usa esse
  endereço (`workers_dev: false`).

**Regras da conversão** (`lib/open-finance.ts`, com testes):
- **Datas:** convertidas de UTC para o horário de São Paulo.
- **Valores:** em centavos, pelo parser em string.
- **Sinal:** invertido no cartão (lá a compra vem positiva).
- **Ficam de fora:**
  - o pagamento da fatura, dos dois lados;
  - a saída para outra conta do próprio titular, e a entrada vinda de um
    banco também conectado (o código do banco de origem vem no Pix/TED). A
    entrada vinda de banco não conectado é dinheiro novo: vira receita, em
    "Salário";
  - a aplicação e o resgate automáticos;
  - as parcelas futuras, que entram quando a data chega.
- **Categorias:** as da Pluggy viram as do Nauri; "Compras" e "Serviços" são
  criadas na primeira sincronização.
- **Compras pendentes:** entram marcadas como "pendente". A pendente que some
  da Pluggy (virou definitiva com outro ID) é removida.
- **Edições do usuário:** a sincronização atualiza só valor, data e status;
  categoria e descrição editadas ficam como estão.
- **Regras de categoria:** "Sempre usar para *descrição*", no detalhe do
  lançamento, grava uma regra em `category_rules` (descrição normalizada, sem
  acento, caixa nem número de parcela) e troca o histórico na hora. Todo
  lançamento novo que a sincronização insere passa pelas regras antes da
  categoria sugerida pela Pluggy. Isso cobre também a compra pendente que
  volta definitiva com outro ID.
- **Exclusões:** um lançamento do banco apagado pelo usuário vai para
  `open_finance_ignored` e não volta.

**Variáveis** (todas como segredo: o repositório é público):
`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_ID` e
`OPEN_FINANCE_USER_ID`. Sem as quatro, o recurso fica desligado. No Meu
Pluggy cada banco é uma conexão separada: `PLUGGY_ITEM_ID` aceita vários IDs
separados por vírgula, e cada execução avança uma janela em cada conexão. Se
uma conexão não responde, a rodada não importa nada (sem os bancos de todas,
um repasse entre contas contaria duas vezes). No
`wrangler dev --test-scheduled`, o cron dispara em `GET /__scheduled`.

**Investimentos** (aba "Investir", só para a mesma conta):
- A mesma conexão traz as posições (`/investments`) e as movimentações de cada
  uma (`/investments/{id}/transactions`, 12 meses). Regras puras e testes em
  `lib/investments.ts`; leitura em `lib/investments-sync.ts`.
- **Quando:** uma vez por atualização da Pluggy, numa execução do cron em que
  a conexão não teve transação para ler (na prática, a hora seguinte à da
  leitura das transações). Juntas, as duas leituras passariam do limite de
  CPU e das 50 chamadas externas do plano gratuito. O botão "Sincronizar
  agora" lê na hora.
- **Corte:** no máximo 20 leituras de movimentações por execução. Primeiro as
  posições novas ou que mudaram de estado (`movements_status` ≠ `status`),
  depois as ativas. O que sobrar fica para a execução seguinte, e a conexão
  só é marcada como lida (`investments_synced_at`) quando nada sobra.
- **Valores:** o principal é o líquido (`balance`, já sem IR e IOF), com o
  bruto ao lado. O custo vem de `amountOriginal` (CDB) ou do preço médio das
  movimentações (ETF, ação). Sem histórico que explique a posição inteira, o
  custo fica desconhecido e a posição sai do rendimento.
- **Guardado no mês:** aportes (BUY) menos resgates (SELL, pelo líquido que
  voltou para a conta). Proventos não entram.
- **Evolução:** a Pluggy só dá o valor de hoje, então cada leitura grava uma
  foto do dia em `wealth_snapshots` (investimentos, saldo das contas
  correntes e faturas em aberto). O gráfico começa no dia do deploy.
- **Patrimônio total:** saldo das contas correntes + investimentos − faturas
  em aberto.
- **Reserva e taxa de poupança** (`savingsSummary`): cruzam os investimentos
  com os lançamentos dos últimos 3 meses fechados, pela mesma data de
  orçamento da Início. A reserva é o total investido dividido pela média de
  saídas, contando só meses com gasto. A taxa é o guardado dividido pelas
  entradas, somando os meses antes de dividir. O gráfico do guardado mostra
  também a taxa do mês escolhido.
- **Rendimento do mês** (`monthYield`): valor no fim − valor no início −
  (aportes − resgates), pelas fotos diárias. O início é a última foto do mês
  anterior; sem ela, a primeira do mês, e o número sai como "desde dia X". O
  percentual é o de Dietz modificado: cada aporte pesa pelos dias em que
  ficou aplicado. Aparece no quadro da evolução, com o mês anterior ao lado.
- **Imposto menor em breve** (`taxSchedule`): IR regressivo de CDB, RDB, LC,
  LF e Tesouro pela data de compra (22,5% até 180 dias, 20% até 360, 17,5%
  até 720 e 15% depois) e IOF até o 30º dia. LCI, LCA e debêntures ficam de
  fora (isentas ou sem como saber). Cada posição mostra a alíquota e quando
  ela cai. Quedas de IR nos próximos 30 dias e IOF ainda ativo viram aviso,
  com a economia estimada sobre o ganho de hoje. Conferido contra o imposto
  que a Pluggy informa (bruto − líquido): bate no centavo.

O acesso autorizado ao banco vence em 12 meses. A partir de 30 dias antes do
vencimento, o Perfil avisa para renovar no Meu Pluggy.

## Deploy

App web e API vão no **mesmo Worker**, em `https://nauri.app`: os arquivos do
`expo export` são servidos como assets e só `/api/*` e `/health` passam pelo
código da API. Mesma origem significa cookie `SameSite=Lax` (o Safari não
bloqueia) e nenhum CORS em produção. A configuração está em
`apps/api/wrangler.jsonc`.

O deploy é automático: todo push na `master` passa por typecheck e testes e,
se tudo passar, vai para produção (`.github/workflows/ci.yml`). Os PRs rodam
só as checagens. O job de deploy usa o environment `production` do GitHub,
com o segredo `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") e a
variável `CLOUDFLARE_ACCOUNT_ID`.

Para publicar à mão, sem passar pelo CI:

```bash
npx wrangler login   # uma vez por máquina
npm run deploy       # build:web + wrangler deploy
```

O `build:web` da raiz embute `EXPO_PUBLIC_API_URL=https://nauri.app` de forma
explícita, limpa o cache do Metro (sem isso um valor antigo da URL pode ficar
no bundle) e falha se `localhost:8787` aparecer no resultado. Não crie um
`.env.production`: o `.env.local` tem prioridade e levaria `localhost` para o
ar.

### Variáveis de produção

As públicas ficam nos `vars` do `wrangler.jsonc` (`APP_URL`, `BETTER_AUTH_URL`,
`MAIL_FROM`, `SIGNUP_MODE`). No `wrangler dev`, as do `.dev.vars` têm
prioridade. Os segredos vão por `wrangler secret put`, a partir de `apps/api`:

| Segredo | Valor |
|---|---|
| `DATABASE_URL` | connection string **pooled** da branch `production` do Neon |
| `BETTER_AUTH_SECRET` | novo, diferente do local: `openssl rand -base64 32` |
| `RESEND_API_KEY` | chave de produção, só de envio, restrita a `nauri.app` |
| `INVITE_CODE` | código de convite de produção |

No Neon, a branch `production` é a de produção e a `dev` é a do `.dev.vars`
local. Migrations em produção:
`DATABASE_URL=<production> npm run db:migrate --workspace @nauri/api`.

**O CI não roda migrations.** Num PR que traz migration nova, aplique-a na
branch `production` *antes* do merge: o deploy sai sozinho logo depois, e o
código novo já espera o schema novo. Por isso as migrations devem ser
aditivas (tabela ou coluna nova), de modo que a versão que está no ar continue
funcionando com o schema à frente.

### Testar a mesma origem localmente

```bash
EXPO_PUBLIC_API_URL=http://localhost:8787 npm run build:web --workspace @nauri/app
npm run dev:api      # app e API juntos em http://localhost:8787
```

Para logar nessa porta, o `APP_URL` do `.dev.vars` precisa ser
`http://localhost:8787`; com `8081` o Better Auth recusa a origem. Depois de
um novo build, reinicie o `dev:api`: o servidor de arquivos não acompanha a
`dist` recriada.

Para voltar à versão anterior: `npx wrangler rollback` (não mexe no banco).
