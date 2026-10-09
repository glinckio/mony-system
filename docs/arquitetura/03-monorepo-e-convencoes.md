# 03 — Monorepo e convenções

## Estrutura

```
mony/
├─ apps/
│  ├─ mobile/            # App Expo (iOS e Android)
│  ├─ api/               # NestJS (entrypoints: API e worker)
│  └─ admin/             # Painel web React + Vite
├─ packages/
│  ├─ shared/            # Schemas Zod, enums, dinheiro, datas, constantes
│  ├─ api-client/        # Gerado pelo Orval a partir do OpenAPI (não editar à mão)
│  └─ config/            # eslint, prettier, tsconfig base
├─ modules/              # Expo Modules nativos (Swift/Kotlin)
│  ├─ mony-app-usage/    # Detecção de apps de compra (Screen Time / UsageStats)
│  └─ mony-alarm/        # Alarmes (AlarmKit / AlarmManager)
├─ infra/                # Terraform (AWS)
├─ docs/
│  └─ arquitetura/       # Estes arquivos .md
├─ .github/workflows/    # CI/CD
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

Gerenciador: **pnpm** com workspaces. Orquestração de tarefas e cache: **Turborepo** (`turbo run lint test build`).

Versão do Node fixada em `.nvmrc` (LTS ativa) e em `engines`.

## Idioma e nomes

| Onde | Regra | Exemplo |
|---|---|---|
| Tabelas e colunas | português, `snake_case`, plural nas tabelas (como no PDF) | `transacoes.forma_pagamento` |
| Modelos Prisma | português, `PascalCase` singular, `@@map` para a tabela | `model Transacao { @@map("transacoes") }` |
| Rotas | português, `kebab-case` | `/v1/preferencias-alerta` |
| JSON da API | `camelCase` | `formaPagamento`, `valorCentavos` |
| Classes Nest | domínio em português + sufixo técnico em inglês | `FaturasService`, `CartoesController` |
| Enums | valores em minúsculas, português, sem acento | `pendente`, `cartao_credito` |
| Componentes React | `PascalCase` em português quando for domínio | `CartaoResumo`, `FaturaLista` |
| Textos de tela | sempre via i18n (`t('transacoes.vazio')`) | |

Dinheiro: todo campo de valor termina em `Centavos` na API (`valorCentavos`) e é `bigint` no banco. No JSON vai como `number` (inteiro seguro até ~R$ 90 trilhões). Formatação só na borda (app), com `formatarCentavos` de `@mony/shared/dinheiro`: mesma saída de `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, mas com aritmética inteira, sem dividir centavos por 100 em ponto flutuante.

Datas: competência como `YYYY-MM-01`, datas de calendário como `YYYY-MM-DD`, instantes em ISO 8601 com fuso.

## Git

- Branch principal `main` protegida. Trabalho em branches `feat/…`, `fix/…`, `chore/…`.
- PR obrigatório com CI verde e uma revisão.
- Commits no padrão **Conventional Commits** (`feat(cartoes): calcula fatura pela data de fechamento [RN-031]`), validados por `commitlint`.
- Cada PR que implementa regra de negócio cita o código `RN-xxx` de [07](07-regras-de-negocio.md).
- Versões do app seguem SemVer. `runtimeVersion` do EAS Update segue a política `fingerprint` para nunca mandar JS incompatível com o binário.

## Qualidade de código

- TypeScript `strict: true` em todos os pacotes.
- ESLint (config compartilhada) + Prettier. `lint-staged` + Husky no pre-commit.
- Proibido `any` sem comentário justificando.
- Proibido número de dinheiro em `float`: regra de lint customizada ou revisão obrigatória em `@mony/shared/dinheiro`.
- Imports entre apps proibidos. O que for comum vai para `packages/`.

## Variáveis de ambiente

- `apps/api`: `.env.example` documentado. Em nuvem, segredos vêm do Secrets Manager. Nenhum segredo em repositório.
- `apps/mobile`: só valores públicos (`EXPO_PUBLIC_API_URL`, DSN do Sentry, chave pública da Stripe). Perfis `development`, `staging`, `production` em `eas.json`.

## Definição de pronto

Uma história está pronta quando: regra implementada no servidor com teste, contrato no OpenAPI, cliente regenerado, tela integrada com o design do cliente, textos em i18n, eventos de analítica definidos, e o checklist de acessibilidade básico (rótulos, tamanho de toque, contraste) verificado.
