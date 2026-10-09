# BACKLOG — Mony

Fonte da verdade das tarefas. Protocolo de uso em [CLAUDE.md](../../CLAUDE.md).

**Legenda**
- `[ ]` pendente · `[x]` concluída (com o número do PR). "Em andamento" não é marcado aqui: é a tarefa que tem PR aberto.
- `dep:` tarefas que precisam estar `[x]` antes.
- `docs:` arquivos de `docs/arquitetura/` a ler antes de começar.
- 👤 precisa de ação humana (conta, pagamento, aprovação, decisão do cliente). O agente prepara tudo o que puder e não mergeia sozinho se a tarefa depender disso para funcionar (ver CLAUDE.md, seção 6).
- Critério de aceite comum a todas: testes passando, lint e typecheck verdes, docs atualizados se algo mudou.

Ordem: siga de cima para baixo. Uma tarefa só pode começar se as dependências estiverem `[x]`.

---

## Fase 0 — Fundação

- [x] **T-001** 👤 Criar repositório no GitHub e estrutura base do monorepo (commit inicial direto na `main`, sem PR)
  - dep: — · docs: 03
  - Se `git remote -v` estiver vazio: peça ao humano para criar o repositório (ou rode `gh repo create <org>/mony --private --source . --push` se ele autorizar). Até existir remoto, nada de PR.
  - Aceite: pnpm workspaces + Turborepo, pastas `apps/`, `packages/`, `modules/`, `infra/`, `docs/`; `.nvmrc`, `.editorconfig`, `.gitignore`, `README.md` raiz; `docs/arquitetura/` e `docs/agentes/` versionados; `CLAUDE.md` na raiz. Este primeiro commit pode ir direto na `main` (é o único caso).
- [x] **T-002** Pacote `@mony/config`: ESLint, Prettier, tsconfig base, commitlint, Husky + lint-staged (PR #1)
  - dep: T-001 · docs: 03
  - Aceite: `pnpm turbo run lint typecheck` roda na raiz; commit fora do padrão é recusado.
- [x] **T-003** Pacote `@mony/shared`: utilitários de dinheiro e datas, enums e catálogo de erros (PR #2)
  - dep: T-002 · docs: 02, 03, 05
  - Aceite: `dinheiro.ts` (centavos ↔ exibição pt-BR, soma e divisão sem perder centavo, distribuição de resto), `datas.ts` (fuso do usuário, competência, último dia do mês), enums do modelo de dados, códigos de erro. Testes com Vitest.
- [x] **T-004** CI no GitHub Actions (PR #3)
  - dep: T-002 · docs: 12, 14
  - Aceite: workflow em PR roda install, lint, typecheck, test com cache do Turborepo; status obrigatório configurado como check. 👤 Proteção da branch `main` (exigir PR e CI verde) é configurada pelo humano se o agente não tiver permissão de admin.
- [x] **T-005** Ambiente local com Docker Compose (PR #4)
  - dep: T-001 · docs: 12
  - Aceite: `docker compose up -d` sobe Postgres, Redis, S3 local (SeaweedFS, no lugar do MinIO; ver DECISOES) e Mailpit; instruções no README.
- [x] **T-006** Esqueleto da API NestJS (Fastify, config Zod, pino, health check, filtro de erros, OpenAPI) (PR #6)
  - dep: T-003, T-005 · docs: 05
  - Aceite: `GET /v1/health` responde; erro segue o formato `{ erro: { codigo, mensagem } }`; `/v1/docs` fora de produção; entrypoints `main.ts` e `worker.ts`.
- [x] **T-007** Prisma: schema inicial completo e seed (PR #7)
  - dep: T-006 · docs: 06
  - Aceite: as 41 tabelas do PDF + colunas e tabelas propostas em 06, enums, índices essenciais, extensão de soft delete, seed (categorias padrão, limites do gratuito, apps sugeridos). Migração aplicando em banco limpo.
- [x] **T-008** Núcleo da API: `Clock` injetável, `Contexto` (usuarioId, origem, idempotencyKey), interceptor de idempotência, barramento de eventos, filas BullMQ registradas (PR #8)
  - dep: T-007 · docs: 05
  - Aceite: testes provando que POST repetido com a mesma `Idempotency-Key` devolve a mesma resposta sem duplicar.
- [x] **T-009** Geração do cliente `@mony/api-client` com Orval e verificação no CI (PR #9)
  - dep: T-006, T-004 · docs: 02
  - Aceite: `pnpm --filter @mony/api-client generate` gera hooks TanStack Query; CI falha se o gerado estiver desatualizado.
- [ ] **T-010** Esqueleto do app Expo (dev client, Expo Router, abas, providers, i18n, Sentry, EAS)
  - dep: T-003 · docs: 02, 04
  - Aceite: SDK estável mais recente travado; grupos `(auth)`, `(onboarding)`, `(tabs)` com cinco abas vazias; `app.config.ts` por ambiente; `eas.json` com perfis development/preview/production. 👤 Conta Expo/EAS do cliente.
- [ ] **T-011** Design system base no app (tokens provisórios, componentes base, componente `Valor` com modo privacidade)
  - dep: T-010 · docs: 04 (Design system)
  - Aceite: tokens em um arquivo único, NativeWind configurado, componentes de `src/ui` com testes. Quando o design do cliente chegar, uma tarefa nova troca os tokens.
- [x] **T-012** Esqueleto do painel admin (Vite, TanStack Router/Query, shadcn/ui, cliente gerado) (PR #11)
  - dep: T-009 · docs: 13
- [ ] **T-014** Migrar a API para NestJS 12 (ESM) quando o `nestjs-zod` suportar
  - dep: T-006 · docs: 02, 05
  - Aceite: `@nestjs/*` 12, `nestjs-zod` com suporte oficial ao Nest 12, API em ESM, testes e CI verdes. Ver DECISOES (2026-10-09, T-006).
- [ ] **T-013** Terraform de staging (VPC, ECS api e worker, RDS, ElastiCache, S3, Secrets Manager, ALB) e deploy de staging no merge
  - dep: T-006, T-004 · docs: 12
  - 👤 Conta AWS e credenciais do CI. O agente escreve o Terraform e o workflow; o humano aplica.

### Provas de conceito (PoC)

Cada PoC entrega um relatório em `docs/agentes/poc/<ID>.md` com resultado, limitações e recomendação, e atualiza os docs de arquitetura afetados.

- [ ] **T-020** PoC Mony: fluxo "gastei 10" com botões e streaming SSE lido por `expo/fetch`
  - dep: T-008, T-010 · docs: 08 · 👤 chave do provedor de IA
- [ ] **T-021** 👤 PoC Screen Time (iOS): módulo `mony-app-usage` com FamilyControls/DeviceActivity
  - dep: T-010 · docs: 10 (Detecção de apps de compra) · requer entitlement da Apple e aparelho físico
- [ ] **T-022** PoC UsageStats (Android): WorkManager periódico no módulo `mony-app-usage`
  - dep: T-010 · docs: 10
- [ ] **T-023** PoC alarme: módulo `mony-alarm` (AlarmKit iOS 26+, notificação abaixo; AlarmManager no Android)
  - dep: T-010 · docs: 04, 09
- [ ] **T-024** 👤 PoC Stripe: assinatura com cartão e Pix em conta BR, checkout externo com retorno por deep link
  - dep: T-008, T-010 · docs: 10 (Stripe)
- [ ] **T-025** 👤 PoC Open Finance: widget do agregador no Expo, ida ao app do banco e volta
  - dep: T-010 · docs: 10 (Open Finance) · requer sandbox do agregador
- [ ] **T-026** PoC NFC-e: avaliar API de terceiros nas UFs prioritárias
  - dep: T-006 · docs: 10 (NFC-e)

---

## Fase 1 — Núcleo financeiro

- [ ] **T-030** Autenticação: cadastro, login e-mail/senha, Argon2id, JWT 15 min, refresh rotativo por aparelho, sair, sair de todos
  - dep: T-008 · docs: 05, 11 · RN-001, RN-004, RN-007, RN-008
- [ ] **T-031** Recuperação de senha por código de 6 dígitos + e-mail (EmailProvider com fake e Brevo)
  - dep: T-030 · RN-003
- [ ] **T-032** 👤 Login social Google e Apple (validação de id_token no servidor)
  - dep: T-030 · RN-002 · requer credenciais Google/Apple
- [ ] **T-033** Usuário: `GET/PATCH /me`, dispositivos (token push), onboarding, `config-app` com versão mínima
  - dep: T-030 · docs: 05
- [ ] **T-034** App: telas de auth, sessão segura, refresh único concorrente, biometria
  - dep: T-030, T-011 · docs: 04 · RN-005
- [ ] **T-035** Categorias (API + app), incluindo exclusão com mover lançamentos
  - dep: T-030 · RN-065, RN-066
- [ ] **T-036** Contas (API + app)
  - dep: T-030 · docs: 06
- [ ] **T-037** Transações: CRUD, filtros, totais, busca, lote, anexos via S3 com URL assinada
  - dep: T-035, T-036 · RN-040 a RN-042, RN-044 a RN-047
- [ ] **T-038** Recorrências e rotina de materialização (35 dias)
  - dep: T-037 · RN-043
- [ ] **T-039** Funções de domínio de cartão e fatura (puras, com testes exaustivos de datas)
  - dep: T-003 · RN-031, RN-032, RN-033, RN-034
- [ ] **T-040** Cartões e faturas: CRUD de cartão, compra no cartão, telas do cartão e da fatura
  - dep: T-037, T-039 · RN-030 a RN-035, RN-038
- [ ] **T-041** Pagar fatura (total/parcial) com natureza `pagamento_fatura`
  - dep: T-040 · RN-036, RN-037 (padrão do doc; decisão pendente do cliente, ver 15)
- [ ] **T-042** Parcelamentos e dívidas: geração de parcelas, Tabela Price, simulação, pagar/desfazer
  - dep: T-040 · RN-050 a RN-055
- [ ] **T-043** Orçamentos e metas (API + app) e rotina de repetir orçamentos
  - dep: T-037 · RN-060 a RN-063
- [ ] **T-044** Dashboard (`GET /dashboard` em uma chamada) e tela Início
  - dep: T-041, T-042, T-043 · RN-020 a RN-024
- [ ] **T-045** Tela Transações no app (lista por dia, filtros, criação/edição, seleção múltipla)
  - dep: T-037, T-034
- [ ] **T-046** Onboarding no app com checklist e dicas contextuais
  - dep: T-044 · docs: 04 (Onboarding)
- [ ] **T-047** Rotinas diárias de faturas e atrasos (fechar faturas, marcar atrasadas)
  - dep: T-041, T-042 · docs: 09 (Rotinas)
- [ ] **T-048** Relatórios (API + telas), sem exportação
  - dep: T-044 · RN-150

## Fase 2 — Mony

- [ ] **T-060** Módulo Mony: orquestrador, `LlmProvider` (fake + provedor real), SSE, histórico, `logs_ia`
  - dep: T-020, T-037 · docs: 08
- [ ] **T-061** Rascunhos e roteador por regra (próximo campo, botões, `/mony/acoes` sem modelo)
  - dep: T-060 · RN-080, RN-081, RN-084, RN-085, RN-088
- [ ] **T-062** Ferramentas de finanças (categorias, cartões, transações, parcelamento, consultas, resumo, fatura, orçamentos, metas)
  - dep: T-061, T-042, T-043 · RN-082, RN-086, RN-087, RN-092
- [ ] **T-063** Preferências aprendidas e ordenação de botões
  - dep: T-062 · RN-081, RN-090
- [ ] **T-064** Áudio: gravação no app + `TranscricaoProvider`
  - dep: T-060
- [ ] **T-065** Foto, print e PDF: `ler_documento`, `importacoes_documento`, confirmação obrigatória
  - dep: T-062 · RN-083, RN-086
- [ ] **T-066** NFC-e: leitura do QR no app, `NfceProvider`, histórico de preços, fallback por foto
  - dep: T-026, T-065 · docs: 10 (NFC-e)
- [ ] **T-067** Consultoria pós-lançamento (impacto no orçamento e no cartão)
  - dep: T-062 · RN-089
- [ ] **T-068** Prompt versionado (`mony_config`) e avaliação com frases de teste no CI
  - dep: T-062 · docs: 08 (Controle de custo e qualidade)
- [ ] **T-069** Tela de chat completa no app (componentes, atalhos, busca no histórico)
  - dep: T-061, T-034

## Fase 3 — Alertas, lembretes e agenda

- [ ] **T-080** Motor de alertas: avaliadores, filtros (preferências, chave única, cota de consultoria, silêncio), central de notificações
  - dep: T-047 · docs: 09 · RN-100 a RN-105
- [ ] **T-081** Push: `PushProvider` (Expo Push), registro de token, categorias de ação, deep links
  - dep: T-080, T-033 · docs: 04, 09
- [ ] **T-082** Alertas de cartão, fatura, orçamento, vencimentos, fora do padrão e projeção
  - dep: T-080 · RN-106, RN-107, RN-108
- [ ] **T-083** Resumos semanal e mensal no chat
  - dep: T-080, T-062
- [ ] **T-084** Lembretes: CRUD, recorrência RRULE, soneca, feito pela notificação, alarme local
  - dep: T-081, T-023 · RN-075 a RN-077
- [ ] **T-085** 👤 Agendas Google e Outlook (OAuth no servidor) e agenda do aparelho
  - dep: T-084 · RN-079 · requer verificação do app no Google
- [ ] **T-086** Ferramentas da Mony: lembretes, compromissos, agenda, `ajuda_app`
  - dep: T-084, T-062
- [ ] **T-087** Preferências de alerta e horário de silêncio no app; central de notificações
  - dep: T-081

## Fase 4 — Planos e cobrança

- [ ] **T-100** Cotas do plano gratuito: `@RecursoLimitado`, contagem atômica, `GET /assinatura/uso`, aviso com [Ver planos]
  - dep: T-062 · RN-120, RN-122, RN-123, RN-127
- [ ] **T-101** Teste de 3 dias: início no cadastro, controle de um teste por pessoa, avisos, encerramento automático
  - dep: T-100, T-080 · RN-124, RN-125, RN-126
- [ ] **T-102** 👤 Stripe: `BillingProvider`, checkout, webhooks idempotentes, portal, inadimplência
  - dep: T-024, T-101 · RN-128, RN-131 · docs: 10 (Stripe)
- [ ] **T-103** Telas de planos e assinatura no app
  - dep: T-102
- [ ] **T-104** Admin: preços (novo Price na Stripe), limites, duração do teste, cupons, histórico
  - dep: T-102, T-012 · RN-129, RN-130

## Fase 5 — Recursos pagos e colaboração

- [ ] **T-120** 👤 Open Finance: `OpenFinanceProvider`, conexão, webhooks, importação, dedupe, conflito manual, categoria, consentimento
  - dep: T-025, T-102 · RN-121, RN-140 a RN-144
- [ ] **T-121** 👤 Detecção de apps de compra (iOS e Android) com endpoint e alerta
  - dep: T-021, T-022, T-081 · RN-104, RN-121
- [ ] **T-122** 👤 Lembrete por ligação (`VozProvider`), telefone verificado, limite mensal
  - dep: T-084, T-102 · RN-078
- [ ] **T-123** Listas de compras com preço por NFC-e e geração de despesa
  - dep: T-066 · RN-070 a RN-073
- [ ] **T-124** Compartilhamento de listas e lembretes em tempo real (WebSocket)
  - dep: T-123, T-084 · RN-074
- [ ] **T-125** Exportação de relatórios PDF e XLSX no worker
  - dep: T-048, T-100 · RN-151

## Fase 6 — Lançamento

- [ ] **T-140** LGPD: aceites de termos, consentimentos, exportar dados, excluir conta, retenção de arquivos
  - dep: T-120, T-102 · docs: 11 · RN-160 a RN-162
- [ ] **T-141** Admin completo: usuários, assinaturas, métricas, novidades, Mony (prompt e custos), auditoria, filas
  - dep: T-104, T-068 · docs: 13
- [ ] **T-142** Monitoramento e alertas (Sentry, métricas, alarmes de fila, webhook, custo de IA, backup)
  - dep: T-013 · docs: 12
- [ ] **T-143** Testes E2E com Maestro dos fluxos principais
  - dep: T-103, T-069 · docs: 14
- [ ] **T-144** Hardening de segurança (checklist de 11) e teste de carga
  - dep: T-140 · docs: 11
- [ ] **T-145** 👤 Terraform e pipeline de produção
  - dep: T-142 · docs: 12
- [ ] **T-146** 👤 Publicação: fichas das lojas, declarações de permissão, TestFlight e teste interno, envio para revisão
  - dep: T-143, T-144, T-145

---

## Tarefas adicionadas durante o trabalho

(Agentes acrescentam aqui ou no fim da fase certa, com o próximo ID livre da faixa da fase.)
