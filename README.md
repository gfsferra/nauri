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
- **Recorrentes são gerados na leitura, sem cron.** O índice único
  `(recurrence_id, occurred_on)` garante que abrir o mesmo mês duas vezes não
  lança o salário duas vezes.
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
npm test           # 82 testes: dinheiro, datas, recorrência
npm run typecheck  # todos os workspaces
```

A suíte cobre de propósito os pontos onde um erro custa dinheiro: parsing de
valores em pt-BR, limites de mês e fuso, e a idempotência da geração de
recorrentes.

## Cadastro por convite

Enquanto o app amadurece, mantenha no `.dev.vars` (e nos secrets do deploy):

```
SIGNUP_MODE="invite"
INVITE_CODE="algum-código"
```

O schema já é multiusuário; isto só adia a abertura pública.

## Deploy

App web e API vão no **mesmo Worker**, em `https://nauri.app`: os arquivos do
`expo export` são servidos como assets e só `/api/*` e `/health` passam pelo
código da API. Mesma origem significa cookie `SameSite=Lax` (o Safari não
bloqueia) e nenhum CORS em produção. A configuração está em
`apps/api/wrangler.jsonc`.

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
