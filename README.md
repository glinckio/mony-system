# Mony

Monorepo do app **Monitorizze** e da assistente **Mony**: app mobile (Expo), API (NestJS), painel admin (React + Vite) e os pacotes compartilhados entre eles.

- O que o produto faz e como vamos construir: [`docs/arquitetura/`](docs/arquitetura/README.md)
- Regras de negócio numeradas (`RN-xxx`): [`docs/arquitetura/07-regras-de-negocio.md`](docs/arquitetura/07-regras-de-negocio.md)
- Tarefas, decisões e bloqueios: [`docs/agentes/`](docs/agentes/BACKLOG.md)
- Protocolo de trabalho (pessoas e agentes de IA): [`CLAUDE.md`](CLAUDE.md)

## Estrutura

```
mony/
├─ apps/          # mobile (Expo), api (NestJS: API e worker), admin (React + Vite)
├─ packages/      # shared (Zod, enums, dinheiro, datas), api-client (gerado pelo Orval), config
├─ modules/       # Expo Modules nativos (Swift/Kotlin): mony-app-usage, mony-alarm
├─ infra/         # Terraform (AWS)
├─ docs/
│  ├─ arquitetura/  # Documentação técnica
│  └─ agentes/      # BACKLOG, DECISOES, BLOQUEIOS
├─ .github/       # Template de PR e workflows de CI/CD
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

As pastas de `apps/`, `packages/` e `modules/` são criadas pelas tarefas do [BACKLOG](docs/agentes/BACKLOG.md). Detalhes e convenções em [`docs/arquitetura/03-monorepo-e-convencoes.md`](docs/arquitetura/03-monorepo-e-convencoes.md).

## Pré-requisitos

- **Node.js 24** (LTS). A versão está em [`.nvmrc`](.nvmrc): com nvm, `nvm use`; no Windows com nvm-windows, `nvm install 24 && nvm use 24`.
- **pnpm 12**. Instale uma vez com `npm install -g pnpm`; o pnpm troca sozinho para a versão fixada no campo `packageManager` do `package.json`.
- **Git** e **GitHub CLI** (`gh`), autenticado com `gh auth login`. O protocolo de trabalho usa o `gh` para PRs.
- **Docker** com Docker Compose, para os serviços do ambiente local.

## Ambiente local

```bash
docker compose up -d --wait   # sobe os serviços e espera ficarem saudáveis
docker compose ps             # estado dos serviços
docker compose down           # para (os dados ficam nos volumes)
docker compose down -v        # para e apaga os dados
```

| Serviço | Endereço | Acesso (só desenvolvimento) |
|---|---|---|
| Postgres 18 | `localhost:5432` | usuário `mony`, senha `mony-local`, banco `mony` |
| Redis 8 | `localhost:6379` | sem senha |
| S3 local (SeaweedFS) | `http://localhost:8333` | chave `mony-local`, segredo `mony-local-segredo`, bucket `mony-local`; painel em `http://localhost:23646` |
| Mailpit | SMTP em `localhost:1025` | e-mails capturados em `http://localhost:8025` |

Porta ocupada na sua máquina? Defina `POSTGRES_PORTA`, `REDIS_PORTA`, `S3_PORTA`, `S3_PAINEL_PORTA`, `SMTP_PORTA` ou `MAILPIT_PAINEL_PORTA` no ambiente ou num arquivo `.env` na raiz (ex.: `POSTGRES_PORTA=5433`).

## API

```bash
cp apps/api/.env.example apps/api/.env   # uma vez
pnpm turbo run build --filter=api... --filter=@mony/api-client...   # pacotes compartilhados e Prisma Client
pnpm --filter api dev          # API em http://localhost:3000, recarrega ao salvar
pnpm --filter api dev:worker   # worker (filas e rotinas)
```

O `dev` não compila o `@mony/shared` nem gera o Prisma Client: rode o `turbo run build` acima na primeira vez e de novo depois de puxar mudanças em `packages/` ou no `schema.prisma`.

- Saúde: `http://localhost:3000/v1/health`
- Documentação OpenAPI (fora de produção): `http://localhost:3000/v1/docs`, JSON em `/v1/docs/openapi.json`
- Erros sempre em `{ "erro": { "codigo", "mensagem", "detalhes" } }`, com os códigos de `@mony/shared/erros`.
- Arquivos (anexos): com o `.env` do exemplo, vão para o S3 local do `docker compose` (SeaweedFS, bucket `mony-local`). Sem `S3_BUCKET`, as rotas de arquivo respondem 503.
- E-mails: a API põe na fila `emails` e o worker envia. Com o `.env` do exemplo (`EMAIL_PROVEDOR=smtp`), eles chegam ao Mailpit (`http://localhost:8025`); o worker precisa estar rodando. O código de recuperação de senha (`POST /v1/auth/senha/codigo`) aparece lá.
- Push: o motor de alertas põe na fila `notificacoes` e o worker envia pelo Expo. Com o `.env` do exemplo (`PUSH_PROVEDOR=fake`), nada sai do computador: o worker escreve no log o título de cada push.
- Mony: `POST /v1/mony/mensagens` responde em SSE (teste com `curl -N -H "authorization: Bearer <acesso>" -H 'content-type: application/json' -d '{"texto":"gastei 10"}' http://localhost:3000/v1/mony/mensagens`). Com o `.env` do exemplo (`IA_PROVEDOR=fake`), o que não for gasto recebe um texto fixo; com `IA_PROVEDOR=anthropic` e `ANTHROPIC_CHAVE_API`, o Claude responde. Áudio (T-064): `{"arquivoId"}` de um `POST /v1/arquivos` com `tipo: "audio"`; com `TRANSCRICAO_PROVEDOR=fake`, todo áudio vira "gastei 10 no mercado".
- Autenticação: `POST /v1/auth/cadastro` e `/v1/auth/login` devolvem os tokens; as demais rotas pedem `Authorization: Bearer <acesso>` (detalhes no [doc 05](docs/arquitetura/05-api-nestjs.md#autenticação)). Sem `JWT_CHAVE_PRIVADA` no `.env`, a API gera uma chave temporária a cada subida (os tokens caem ao reiniciar); produção exige a chave. Login com Google e Apple (`POST /v1/auth/social`) só funciona com `GOOGLE_CLIENT_IDS` e `APPLE_CLIENT_IDS` preenchidos; sem eles responde 503.

## Banco de dados

Com os serviços do `docker compose` no ar e o `apps/api/.env` criado:

```bash
pnpm --filter api prisma migrate deploy        # aplica as migrações
pnpm --filter api seed                         # limites do plano gratuito + usuário demo@mony.local
pnpm --filter api prisma migrate dev --name x  # depois de mudar o schema.prisma: cria a migração
TESTES_INTEGRACAO=1 pnpm --filter api test     # testes da API também contra Postgres e Redis
```

Schema em [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma). O cliente do Prisma é gerado em `apps/api/src/generated/` (fora do Git) por `pnpm --filter api generate`, que o Turbo já roda antes de build, lint, typecheck e testes.

## Cliente da API (`@mony/api-client`)

Funções e hooks TanStack Query gerados pelo [Orval](https://orval.dev) a partir do contrato OpenAPI da API. Depois de mudar uma rota ou um schema da API:

```bash
pnpm --filter @mony/api-client generate   # exporta packages/api-client/openapi.json e gera src/gerado/
```

Commite o `openapi.json` e o `src/gerado/` junto com a mudança da API; o CI falha se o cliente estiver desatualizado. No app e no admin, configure uma vez com `configurarCliente({ urlBase, obterToken })` e use os hooks (`useVerificarSaude()` etc.). Erros chegam como `ErroApi`, com o `codigo` do catálogo de `@mony/shared/erros`.

## App mobile (`apps/mobile`)

Expo SDK 57 (React Native 0.86) com Expo Router, em **development build** (`expo-dev-client`): o Expo Go não serve, porque o app terá módulos nativos próprios. Android 7+ e iOS 16.4+.

```bash
cp apps/mobile/.env.example apps/mobile/.env   # uma vez; ajuste EXPO_PUBLIC_API_URL
pnpm --filter mobile start      # Metro para o dev client instalado no aparelho ou emulador
pnpm --filter mobile android    # gera o projeto nativo e instala no emulador (precisa do Android Studio)
pnpm --filter mobile ios        # idem no simulador (só no macOS, com Xcode)
pnpm --filter mobile build      # empacota o JS de iOS e Android em apps/mobile/dist (o CI roda)
```

- **URL da API:** no emulador Android, deixe `http://localhost:3000` e rode `adb reverse tcp:3000 tcp:3000` e `adb reverse tcp:8333 tcp:8333` (veja [Testar o sistema inteiro no computador](#testar-o-sistema-inteiro-no-computador)). Em aparelho, o IP do computador na rede (`http://192.168.x.x:3000`), com `S3_ENDPOINT` no mesmo IP no `apps/api/.env` para os uploads funcionarem. No simulador iOS, `localhost` já serve.
- **Ambientes:** `APP_ENV` = `development`, `preview` ou `production` (perfis do [`eas.json`](apps/mobile/eas.json)). Cada um tem nome, identificador e esquema de link próprios (`mony-dev://`, `mony-preview://`, `mony://`), então os três convivem no mesmo aparelho. Tudo em [`app.config.ts`](apps/mobile/app.config.ts).
- **Rotas** ficam em `app/` (finas: só importam a tela de `src/features/<feature>/screens`); textos em `src/features/<feature>/<feature>.strings.ts`, via i18next (`t('cartoes.titulo')`, chave conferida pelo TypeScript). Detalhes em [`docs/arquitetura/04`](docs/arquitetura/04-app-mobile.md).
- **Telas de teste** das provas de conceito, só no build de desenvolvimento: "Teste do alarme" (T-023a) e "Teste da detecção de apps" (T-022), no Perfil.
- **Pastas `ios/` e `android/`** são geradas pelo `expo prebuild` e ficam fora do Git: nada nativo é editado à mão.

### EAS (builds e updates)

Precisa da conta Expo do cliente. Uma vez, na pasta `apps/mobile`:

```bash
npm install -g eas-cli
eas login
eas init                        # cria o projeto; copie o projectId para PROJETO_EAS no app.config.ts
eas build --profile development --platform android   # dev client para instalar no aparelho
```

Antes do primeiro build de `preview` ou `production`: defina `EXPO_PUBLIC_API_URL` (e `EXPO_PUBLIC_SENTRY_DSN`, se houver) nas variáveis do ambiente correspondente no EAS, e `SENTRY_AUTH_TOKEN` como segredo para o envio de source maps (ou `SENTRY_DISABLE_AUTO_UPLOAD=true`).

**EAS Update em staging:** a cada merge na `main` que mexe no app, o workflow [EAS Update em staging](.github/workflows/eas-update-staging.yml) publica o JS novo no canal `staging`, e os builds de `preview` o recebem ao abrir. Para ligar, uma vez, na raiz do repositório:

```bash
gh variable set EAS_PROJECT_ID --body '<projectId do eas init>'
gh variable set EXPO_OWNER --body '<conta Expo do cliente>'
gh secret set EXPO_TOKEN        # token de robô criado em expo.dev → Account settings → Access tokens
```

O update só chega ao binário com a mesma `runtimeVersion` (fingerprint do que é nativo): mudança nativa pede um build novo de `preview`.

## Painel admin (`apps/admin`)

React 19 + Vite 8, TanStack Router (rotas por arquivo) e TanStack Query, com shadcn/ui sobre Tailwind 4. Usa o mesmo `@mony/api-client` do app.

```bash
pnpm --filter admin dev       # http://localhost:5173 (precisa da API rodando em localhost:3000)
pnpm --filter admin build     # gera apps/admin/dist (site estático)
```

- **API:** em desenvolvimento o painel chama `/v1` no próprio endereço e o Vite repassa para `http://localhost:3000` (troque com `API_LOCAL` no `apps/admin/.env`). Em produção, `VITE_API_URL` aponta para a API.
- **Rotas** em `apps/admin/src/rotas/` (um arquivo por página). O `src/rotas.gen.ts` é gerado pelo plugin do TanStack Router ao rodar `dev` ou `build` e vai para o Git; o CI falha se ele estiver desatualizado.
- **Componentes do shadcn/ui** ficam em `src/components/ui/`. Para adicionar outro: `pnpm dlx shadcn@latest add <componente>` dentro de `apps/admin`.
- **Login:** e-mail e senha de uma conta do app com papel `admin`, mais o 2FA (código de um app autenticador), configurado no primeiro acesso. Para promover uma conta, com a API compilada (`turbo run build` da seção API):

  ```bash
  # Git Bash. O script não lê o apps/api/.env: o banco vai no comando.
  DATABASE_URL=postgresql://mony:mony-local@localhost:5432/mony pnpm --filter api admin:promover --email voce@exemplo.com
  # PowerShell
  $env:DATABASE_URL="postgresql://mony:mony-local@localhost:5432/mony"; pnpm --filter api admin:promover --email voce@exemplo.com
  ```

  `--refazer-2fa` pede o 2FA de novo no próximo login, e `--rebaixar` volta a conta a usuário comum.

## Testar o sistema inteiro no computador

Roteiro para usar a API, o worker, o painel e o app no emulador Android, tudo local e com os provedores de teste: nenhuma conta externa é necessária. O iPhone fica para depois ([DECISOES](docs/agentes/DECISOES.md), 2026-10-17).

**Uma vez:**

1. Os [pré-requisitos](#pré-requisitos), mais o **Android Studio** com um emulador (AVD), as variáveis `ANDROID_HOME` e `JAVA_HOME` (o JDK que vem com o Android Studio serve) e o `adb` no `PATH` (`platform-tools` do SDK). Passo a passo da Expo: [Android Studio Emulator](https://docs.expo.dev/workflow/android-studio-emulator).
2. Na raiz do repositório:

   ```bash
   pnpm install
   docker compose up -d --wait
   cp apps/api/.env.example apps/api/.env
   cp apps/mobile/.env.example apps/mobile/.env
   pnpm turbo run build --filter=api... --filter=@mony/api-client...
   pnpm --filter api prisma migrate deploy
   pnpm --filter api seed
   ```

**Cada vez**, um terminal para cada:

| Terminal | Comando | O quê |
|---|---|---|
| 1 | `pnpm --filter api dev` | API em `http://localhost:3000` |
| 2 | `pnpm --filter api dev:worker` | Filas e rotinas: e-mails, alertas, exportações |
| 3 | `pnpm --filter admin dev` | Painel em `http://localhost:5173` |
| 4 | `pnpm --filter mobile android` na primeira vez (gera o projeto nativo e instala no emulador; leva alguns minutos), depois `pnpm --filter mobile start` | App no emulador |

Com o emulador aberto, antes de usar o app:

```bash
adb reverse tcp:3000 tcp:3000   # API
adb reverse tcp:8333 tcp:8333   # S3 local: fotos, PDFs e áudios
```

Assim o `localhost` do emulador passa a ser o computador, e o `apps/mobile/.env` fica com `http://localhost:3000`, como no exemplo. Com `http://10.0.2.2:3000` a API responde, mas os uploads falham, porque a API gera os links do S3 com `localhost:8333`. O `adb reverse` se perde quando o emulador reinicia.

Depois de puxar mudanças: `pnpm install`, o `turbo run build` de novo e o `prisma migrate deploy`. Se mudou algo nativo (pacote com código nativo, `app.config.ts` ou `modules/`), rode `pnpm --filter mobile android` de novo.

**Contas:**

- Crie a sua pelo app. A primeira conta de cada aparelho começa com 3 dias de teste grátis, com tudo liberado (RN-006). As seguintes no mesmo emulador entram direto no gratuito, porque o teste é um por pessoa e por aparelho (RN-125); serve para testar os limites do gratuito.
- Códigos por e-mail (recuperar a senha, por exemplo) chegam ao Mailpit, em `http://localhost:8025`, com o worker rodando.
- O `demo@mony.local` do seed não tem senha: para usá-lo, peça o código em "Esqueci a senha".
- Painel: promova a sua conta ([Login](#painel-admin-appsadmin) do painel) e entre com o mesmo e-mail e senha.

**O que cada provedor de teste faz**, com o `apps/api/.env` do exemplo:

| Recurso | Com o `.env` do exemplo | Para usar o de verdade |
|---|---|---|
| E-mail | Chega ao Mailpit | `EMAIL_PROVEDOR=brevo` e a chave ([BLOQUEIOS](docs/agentes/BLOQUEIOS.md), T-031) |
| Push | Não sai do computador: o worker escreve no log. Os alertas aparecem na central de notificações do app | Chaves do FCM e do APNs no EAS (BLOQUEIOS, T-081) |
| Mony | Lançamentos simples funcionam pelas regras (ex.: "gastei 45 no mercado no pix"); o resto recebe um texto fixo | `IA_PROVEDOR=anthropic` e `ANTHROPIC_CHAVE_API` |
| Áudio na Mony | Todo áudio vira "gastei 10 no mercado" | `TRANSCRICAO_PROVEDOR=deepgram` e a chave (BLOQUEIOS, T-064) |
| Cupom fiscal (NFC-e) | Toda chave devolve o mesmo cupom de exemplo (arroz, feijão e leite) | `NFCE_PROVEDOR=infosimples` e o token (BLOQUEIOS, T-066a) |
| Planos | O checkout volta como pago, mas o plano não muda | `COBRANCA_PROVEDOR=stripe` com as chaves de teste, os preços criados por `pnpm --filter api cobranca:configurar` e o webhook pelo `stripe listen --forward-to localhost:3000/v1/webhooks/stripe` |
| Entrar com Google e Apple | A API responde 503 | Clientes OAuth (BLOQUEIOS, T-032) |

- **Recursos pagos sem a Stripe:** use os 3 dias de teste da primeira conta, ou "Estender o teste" na página do usuário no painel.
- **Alarme e detecção de apps de compra:** telas de teste no Perfil, só no build de desenvolvimento.
- **Rotinas** (alertas das 09:00, faturas, lembretes) rodam no worker, cada uma no seu horário; a página Filas do painel mostra os jobs que falharam.
- **Open Finance, agendas e lembrete por ligação** ainda não existem: são tarefas 👤 do [BACKLOG](docs/agentes/BACKLOG.md).
- **Fluxos automáticos:** os três fluxos do Maestro rodam no mesmo emulador ([`apps/mobile/.maestro`](apps/mobile/.maestro/README.md)).

## Infraestrutura

Terraform da AWS em [`infra/`](infra/README.md): bootstrap da conta, módulo de ambiente e staging. Quem aplica é o humano, com a conta do cliente; o CI só valida. A imagem da API sai de [`apps/api/Dockerfile`](apps/api/Dockerfile) (`docker build -f apps/api/Dockerfile .` na raiz) e o deploy de staging roda a cada merge na `main` depois que a infra existir.

## Comandos

```bash
pnpm install          # instala as dependências de todos os pacotes
pnpm lint             # turbo run lint
pnpm typecheck        # turbo run typecheck
pnpm test             # turbo run test
pnpm build            # turbo run build (inclui empacotar o JS do app)
pnpm dev              # turbo run dev (api, worker e admin, quando existirem)
pnpm format           # Prettier em todo o repositório (pnpm format:check só confere)
```

A verificação completa antes de abrir PR está no [`CLAUDE.md`](CLAUDE.md), seção 5.

## Configurações compartilhadas e hooks de Git

ESLint, Prettier, `tsconfig` base e commitlint ficam em [`packages/config`](packages/config) (`@mony/config`). Cada pacote cria o próprio `eslint.config.js` com `criarConfigEslint({ tsconfigRootDir: import.meta.dirname })` e estende `@mony/config/tsconfig/base.json` (ou `node.json`).

O `pnpm install` instala os hooks do Husky:

- **pre-commit**: ESLint e Prettier só nos arquivos em stage (lint-staged).
- **commit-msg**: commitlint recusa mensagem fora do padrão `tipo(T-031): assunto em minúsculas`.

No Windows, os hooks rodam pelo shell do Git. Se um cliente gráfico de Git disser que não acha o `pnpm`, faça o commit pelo terminal ou ajuste o `PATH` em `~/.config/husky/init.sh`.

## Convenções rápidas

- Commits em português no padrão Conventional Commits, com o ID da tarefa: `feat(T-031): calcula fatura pela data de fechamento [RN-031]`.
- Nada entra direto na `main`: tudo por PR com squash.
- Dinheiro sempre em centavos inteiros. Regra de negócio sempre no servidor.
- Nenhum segredo no repositório: use `.env.example` com valores falsos.
