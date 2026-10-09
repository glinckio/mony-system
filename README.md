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
pnpm --filter api dev          # API em http://localhost:3000, recarrega ao salvar
pnpm --filter api dev:worker   # worker (filas e rotinas)
```

- Saúde: `http://localhost:3000/v1/health`
- Documentação OpenAPI (fora de produção): `http://localhost:3000/v1/docs`, JSON em `/v1/docs/openapi.json`
- Erros sempre em `{ "erro": { "codigo", "mensagem", "detalhes" } }`, com os códigos de `@mony/shared/erros`.

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

## Comandos

```bash
pnpm install          # instala as dependências de todos os pacotes
pnpm lint             # turbo run lint
pnpm typecheck        # turbo run typecheck
pnpm test             # turbo run test
pnpm build            # turbo run build
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
