# 02 — Stack e decisões de arquitetura

## Stack completa

### App mobile (`apps/mobile`)

| Necessidade | Escolha |
|---|---|
| Base | React Native + **Expo** (SDK estável mais recente no início do projeto, travado no `package.json`), TypeScript estrito, New Architecture |
| Build e publicação | **EAS Build** (binários), **EAS Submit** (lojas), **EAS Update** (OTA de JS) |
| Tipo de build | **Development Build** (`expo-dev-client`). Expo Go não serve, porque o app tem módulos nativos próprios |
| Navegação | **Expo Router** (rotas por arquivo, abas, deep links e links de notificação prontos) |
| Dados do servidor | **TanStack Query** (cache, revalidação, paginação, mutações otimistas) |
| Estado local de UI | **Zustand** (sessão, preferências locais, modo privacidade) |
| Formulários | React Hook Form + **Zod** (schemas compartilhados com a API) |
| Cliente HTTP | Gerado do OpenAPI com **Orval** (hooks TanStack Query tipados) |
| Streaming da Mony | `fetch` do pacote `expo/fetch` (suporta leitura de corpo em streaming) com SSE |
| Tempo real (listas compartilhadas) | Socket.IO client |
| Estilo | **NativeWind** (Tailwind) com tokens do design do cliente. Ver [04](04-app-mobile.md#design-system) |
| Listas longas | `@shopify/flash-list` |
| Gráficos | `victory-native` (Skia) |
| Animações | `react-native-reanimated`, `react-native-gesture-handler` |
| Armazenamento seguro | `expo-secure-store` (Keychain / Keystore) |
| Biometria | `expo-local-authentication` |
| Push e notificações locais | `expo-notifications` (FCM no Android, APNs no iOS) |
| Câmera, QR Code NFC-e | `expo-camera` |
| Galeria e PDF | `expo-image-picker`, `expo-document-picker` |
| Áudio | `expo-audio` (gravação) |
| Agenda do aparelho | `expo-calendar` |
| Login social | `expo-apple-authentication`, `@react-native-google-signin/google-signin` |
| Pagamento | `@stripe/stripe-react-native` (PaymentSheet) e/ou página externa (Checkout). Ver [10](10-integracoes.md#stripe) |
| Erros | `@sentry/react-native` |
| Analítica | PostHog (`posthog-react-native`) |
| Internacionalização | `i18next` (só pt-BR no lançamento, mas sem texto fixo em componente) |

### API (`apps/api`)

| Necessidade | Escolha |
|---|---|
| Framework | **NestJS** (TypeScript estrito), Fastify adapter |
| ORM e migrações | **Prisma** |
| Banco | PostgreSQL 16+ |
| Validação e OpenAPI | **Zod** + `nestjs-zod` (mesmo schema valida a entrada e gera a documentação) |
| Autenticação | `@nestjs/passport` + JWT, senha com **Argon2id** |
| Filas e agendamento | **BullMQ** (`@nestjs/bullmq`) sobre Redis, com *job schedulers* para as rotinas |
| Tempo real | `@nestjs/websockets` + Socket.IO com adapter Redis |
| Arquivos | S3 com URL assinada (`@aws-sdk/client-s3`, `s3-request-presigner`) |
| PDF e planilhas | `pdfkit` (ou Puppeteer no worker), `exceljs` |
| Logs | `pino` (`nestjs-pino`), JSON estruturado |
| Erros e tracing | Sentry + OpenTelemetry |
| Rate limit | `@nestjs/throttler` com storage Redis |
| Config | `@nestjs/config` validado por Zod. Segredos vêm do AWS Secrets Manager |

### Painel admin (`apps/admin`)

React + Vite + TanStack Router + TanStack Query + shadcn/ui, consumindo o mesmo cliente gerado do OpenAPI. Ver [13](13-painel-admin.md).

### Compartilhado (`packages/*`)

| Pacote | Conteúdo |
|---|---|
| `@mony/shared` | Schemas Zod, enums, constantes (limites padrão, faixas), utilitários de dinheiro e data |
| `@mony/api-client` | Cliente HTTP e hooks gerados pelo Orval a partir do OpenAPI da API |
| `@mony/config` | ESLint, Prettier, `tsconfig` base |

## Registros de decisão (ADRs)

### ADR-001 — Expo como SDK do app

**Contexto.** O pedido é "uma SDK que aceite em todos os celulares", com um código só para iOS e Android. O PDF já sugere React Native com Expo.

**Decisão.** Expo (SDK estável mais recente), com Development Builds, Continuous Native Generation (`expo prebuild` no CI, pastas `ios/` e `android/` não versionadas) e EAS.

**Por quê.**
- Um código TypeScript gera os dois apps. As bibliotecas `expo-*` cobrem câmera, agenda, notificações, biometria, armazenamento seguro e áudio sem código nativo próprio.
- Cobertura ampla: os SDKs atuais do Expo suportam Android 7.0 (API 24) em diante, que cobre praticamente todos os Android ativos no Brasil, e as versões de iOS ainda suportadas pela Apple. O mínimo exato de iOS depende do SDK; conferir na tabela de versões do Expo antes de travar.
- Os recursos que o PDF pede em Swift/Kotlin (Screen Time, UsageStatsManager, alarmes) entram como **Expo Modules** com config plugins, sem abandonar o Expo.
- EAS Update permite corrigir JS sem esperar loja, dentro das regras das lojas.
- O Expo acompanha os requisitos das lojas (targetSdk anual do Google Play, páginas de 16 KB, privacy manifests da Apple), o que tira trabalho recorrente do time.

**Consequências.**
- Atualizar o SDK do Expo uma vez por ano no mínimo (o Expo lança cerca de três SDKs por ano). Tarefa fixa no roadmap.
- Recursos que exigem sistema mais novo (ex.: AlarmKit no iOS 26, Screen Time no iOS 16) são habilitados por detecção de capacidade. Em aparelho antigo o recurso aparece como indisponível, o resto do app funciona.

**Alternativas descartadas.** React Native "puro" (mais manutenção nativa sem ganho real), Flutter (não compartilha TypeScript com a API, contrário à premissa do PDF), dois apps nativos (dobra o custo).

### ADR-002 — Monólito modular no NestJS, com processo de worker separado

Um único código de servidor com módulos por domínio. Dois *entrypoints*: `main.ts` (API HTTP) e `worker.ts` (consumidores BullMQ e rotinas). Ambos escalam separado no ECS, como o PDF pede ("serviços separados para API e para as filas"). Microsserviços ficam para quando houver motivo medido.

### ADR-003 — Prisma como ORM

Migrações versionadas, tipos gerados, bom suporte a `bigint`, `enum`, `jsonb` e `uuid`. Consultas pesadas de relatório usam `$queryRaw` tipado (TypedSQL) ou views. Alternativa considerada: Drizzle (mais próximo do SQL); escolhemos Prisma pela maturidade com NestJS e pelo fluxo de migração.

### ADR-004 — Zod como fonte única de contrato

Schemas Zod em `@mony/shared` validam a entrada na API (`nestjs-zod`), geram o OpenAPI e validam formulários no app e no admin. O cliente HTTP é gerado do OpenAPI (Orval). Assim uma mudança de contrato quebra a compilação dos três apps, e não a produção.

### ADR-005 — Provedor de IA atrás de uma interface

A Mony usa uma interface `LlmProvider` (chat com ferramentas, visão, PDF, streaming) e outra `TranscricaoProvider` (áudio → texto). Recomendação inicial **(decisão técnica, confirmar com cliente)**: Anthropic Claude (`claude-sonnet-5-5` para conversa, leitura de imagem e PDF; `claude-haiku-5-5` para classificações simples e baratas). Transcrição em um provedor de fala dedicado (avaliar AWS Transcribe, Deepgram ou OpenAI) porque o modelo de conversa não recebe áudio. Detalhes em [08](08-mony-agente-ia.md).

### ADR-006 — Open Finance via agregador, atrás de interface

`OpenFinanceProvider` com implementação inicial para o agregador escolhido. A escolha entre Pluggy, Belvo e Klavi depende de cotação **(confirmar com cliente)**. Ver [10](10-integracoes.md#open-finance).

### ADR-007 — Pagamentos pela Stripe, cobrança das lojas prevista mas não implementada

`BillingProvider` com implementação Stripe. A interface já prevê "loja" (Apple/Google) como fonte alternativa do status de assinatura, sem implementar agora (do PDF).

### ADR-008 — Fuso horário

Tudo que é "dia" ou "mês" para o usuário (limites diários, competência, vencimento, horário de silêncio, rotinas) é calculado no fuso do usuário, padrão `America/Sao_Paulo`, guardado em `usuarios.fuso_horario` **(decisão técnica; campo não está no PDF)**. Timestamps no banco em `timestamptz` UTC.

### ADR-009 — Idioma

Domínio em português (tabelas, rotas, entidades, DTOs: `transacoes`, `TransacoesService`), termos técnicos de framework em inglês (`Controller`, `Module`, `Guard`). Ver [03](03-monorepo-e-convencoes.md#idioma-e-nomes).
