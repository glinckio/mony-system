# BACKLOG — Mony

Fonte da verdade das tarefas. Protocolo de uso em [CLAUDE.md](../../CLAUDE.md).

**Legenda**
- `[ ]` pendente · `[x]` concluída (com o número do PR). "Em andamento" não é marcado aqui: é a tarefa que tem PR aberto.
- `dep:` tarefas que precisam estar `[x]` antes.
- `docs:` arquivos de `docs/arquitetura/` a ler antes de começar.
- 👤 precisa de ação humana (conta, pagamento, aprovação, decisão do cliente). O agente prepara tudo o que puder e não mergeia sozinho se a tarefa depender disso para funcionar (ver CLAUDE.md, seção 6).
- Critério de aceite comum a todas: testes passando, lint e typecheck verdes, docs atualizados se algo mudou.
- Telas do app e do painel seguem o design do cliente: `docs/design/telas-app.pdf`, com o índice e os tokens em `docs/design/README.md`.

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
- [x] **T-010** Esqueleto do app Expo (dev client, Expo Router, abas, providers, i18n, Sentry, EAS) (PR #10)
  - dep: T-003 · docs: 02, 04
  - Aceite: SDK estável mais recente travado; grupos `(auth)`, `(onboarding)`, `(tabs)` com cinco abas vazias; `app.config.ts` por ambiente; `eas.json` com perfis development/preview/production. 👤 Conta Expo/EAS do cliente.
- [x] **T-011** Design system base no app (tokens provisórios, componentes base, componente `Valor` com modo privacidade) (PR #34)
  - dep: T-010 · docs: 04 (Design system)
  - Aceite: tokens em um arquivo único, NativeWind configurado, componentes de `src/ui` com testes. Quando o design do cliente chegar, uma tarefa nova troca os tokens.
- [x] **T-012** Esqueleto do painel admin (Vite, TanStack Router/Query, shadcn/ui, cliente gerado) (PR #11)
  - dep: T-009 · docs: 13
- [ ] **T-014** Migrar a API para NestJS 12 (ESM) quando o `nestjs-zod` suportar
  - dep: T-006 · docs: 02, 05
  - Aceite: `@nestjs/*` 12, `nestjs-zod` com suporte oficial ao Nest 12, API em ESM, testes e CI verdes. Ver DECISOES (2026-10-09, T-006).
- [x] **T-013** Terraform de staging (VPC, ECS api e worker, RDS, ElastiCache, S3, Secrets Manager, ALB) e deploy de staging no merge (PR #12)
  - dep: T-006, T-004 · docs: 12
  - 👤 Conta AWS e credenciais do CI. O agente escreve o Terraform e o workflow; o humano aplica.
- [x] **T-015** 👤 Domínio e HTTPS de staging: Route 53, certificado do ACM no ALB (`certificado_arn`), admin em S3 + CloudFront (PR #36)
  - dep: T-013, T-012 · docs: 12, 13 · requer o domínio do cliente (doc 15, pergunta 16)
- [x] **T-016** 👤 EAS Update no canal `staging` a cada merge na `main` (PR #37)
  - dep: T-010, T-013 · docs: 12 · requer o projeto no EAS e o `EXPO_TOKEN` no GitHub
- [x] **T-017** 👤 Tokens e ícones do design do cliente no lugar dos provisórios (e modo escuro, se o design trouxer) (PR #40; só escuro; logo provisório do PDF)
  - dep: T-011 · docs: 04 (Design system) · 👤 design do cliente
  - Só `src/ui/tokens.ts` e os ícones mudam: os componentes e as telas já usam só os tokens.
- [x] **T-018** Contrato OpenAPI: campos `string | null` de topo saem como `string[]` (PR #46)
  - dep: T-009 · docs: 02, 05
  - O `nestjs-zod` gera `type: ['string', 'null']` (JSON Schema 2020-12) para `z.string().nullable()` sem formato, e o `@nestjs/swagger` lê o `type` em lista como array. Exemplos no `openapi.json`: `PaginaTransacoesDto.proximoCursor`, `TransacaoDto.observacao`, `PerfilDto.telefone`, `CartaoDto.bandeira`.
  - Aceite: esses campos saem `string | null` no contrato e no cliente gerado; teste que falha se um campo `nullable` virar array; o app tira as conversões `as unknown as` de `src/features/transacoes/hooks/use-transacoes.ts`.

### Provas de conceito (PoC)

Cada PoC entrega um relatório em `docs/agentes/poc/<ID>.md` com resultado, limitações e recomendação, e atualiza os docs de arquitetura afetados.

- [x] **T-020** PoC Mony: fluxo "gastei 10" com botões e streaming SSE lido por `expo/fetch` (PR #38; validar no aparelho e com a chave da IA, ver o relatório)
  - dep: T-008, T-010 · docs: 08 · 👤 chave do provedor de IA
- [ ] **T-021** 👤 PoC Screen Time (iOS): módulo `mony-app-usage` com FamilyControls/DeviceActivity
  - dep: T-010 · docs: 10 (Detecção de apps de compra) · requer entitlement da Apple e aparelho físico
- [x] **T-022** PoC UsageStats (Android): WorkManager periódico no módulo `mony-app-usage` (PR #71; medir no aparelho, ver o relatório)
  - dep: T-010 · docs: 10
- [x] **T-023a** PoC alarme no Android: módulo `mony-alarm` com `AlarmManager` (PR #72; tocar nos aparelhos, ver o relatório)
  - dep: T-010 · docs: 04, 09
  - A T-023 (PoC do alarme) foi dividida: o Android dá para compilar e testar no ambiente do agente; o iOS precisa de Mac.
- [ ] **T-023b** PoC alarme no iOS: `mony-alarm` com AlarmKit no iOS 26+ e notificação local com som de alarme (até 30 s) abaixo
  - dep: T-023a · docs: 04, 09 · requer Mac com Xcode 26 (ou um job de macOS no CI) e um iPhone para validar
  - Mesmas funções do Android (`permissoes`, `sincronizar`, `estado`…), para o JS e a tela de teste não mudarem; relatório em `docs/agentes/poc/T-023b.md`.
- [x] **T-024** 👤 PoC Stripe: assinatura com cartão e Pix em conta BR, checkout externo com retorno por deep link (feita no teste da T-102, PR #92: cartão ok; Pix recorrente não existe na Stripe, ver doc 10)
  - dep: T-008, T-010 · docs: 10 (Stripe)
- [ ] **T-025** 👤 PoC Open Finance: widget do agregador no Expo, ida ao app do banco e volta
  - dep: T-010 · docs: 10 (Open Finance) · requer sandbox do agregador
- [x] **T-026** PoC NFC-e: avaliar API de terceiros nas UFs prioritárias (PR #13)
  - dep: T-006 · docs: 10 (NFC-e)

---

## Fase 1 — Núcleo financeiro

- [x] **T-030** Autenticação: cadastro, login e-mail/senha, Argon2id, JWT 15 min, refresh rotativo por aparelho, sair, sair de todos (PR #14)
  - dep: T-008 · docs: 05, 11 · RN-001, RN-004, RN-007, RN-008
- [x] **T-031** Recuperação de senha por código de 6 dígitos + e-mail (EmailProvider com fake e Brevo) (PR #15)
  - dep: T-030 · RN-003
- [x] **T-032** 👤 Login social Google e Apple (validação de id_token no servidor) (PR #16)
  - dep: T-030 · RN-002 · requer credenciais Google/Apple
- [x] **T-033** Usuário: `GET/PATCH /me`, dispositivos (token push), onboarding, `config-app` com versão mínima (PR #17)
  - dep: T-030 · docs: 05
- [x] **T-034** App: telas de auth, sessão segura, refresh único concorrente, biometria (PR #39; botões do Google e da Apple na T-055, atualização obrigatória na T-056)
  - dep: T-030, T-011 · docs: 04 · RN-005
- [x] **T-035** Categorias (API + app), incluindo exclusão com mover lançamentos (PR #18; telas na T-049)
  - dep: T-030 · RN-065, RN-066
- [x] **T-036** Contas (API + app) (PR #19; telas na T-049)
  - dep: T-030 · docs: 06
- [x] **T-037** Transações: CRUD, filtros, totais, busca, lote, anexos via S3 com URL assinada (PR #21)
  - dep: T-035, T-036 · RN-040 a RN-042, RN-044 a RN-047
- [x] **T-038** Recorrências e rotina de materialização (35 dias) (PR #22)
  - dep: T-037 · RN-043
- [x] **T-039** Funções de domínio de cartão e fatura (puras, com testes exaustivos de datas) (PR #20)
  - dep: T-003 · RN-031, RN-032, RN-033, RN-034
- [x] **T-040** Cartões e faturas: CRUD de cartão, compra no cartão, telas do cartão e da fatura (PR #23; telas na T-050, recorrência no cartão na T-051)
  - dep: T-037, T-039 · RN-030 a RN-035, RN-038
- [x] **T-041** Pagar fatura (total/parcial) com natureza `pagamento_fatura` (PR #24)
  - dep: T-040 · RN-036, RN-037 (padrão do doc; decisão pendente do cliente, ver 15)
- [x] **T-042** Parcelamentos e dívidas: geração de parcelas, Tabela Price, simulação, pagar/desfazer (PR #25)
  - dep: T-040 · RN-050 a RN-055
- [x] **T-043** Orçamentos e metas (API + app) e rotina de repetir orçamentos (PR #26; telas na T-052)
  - dep: T-037 · RN-060 a RN-063
- [x] **T-044** Dashboard (`GET /dashboard` em uma chamada) e tela Início (PR #27; tela na T-053)
  - dep: T-041, T-042, T-043 · RN-020 a RN-024
- [x] **T-045** Tela Transações no app (lista por dia, filtros, criação/edição, seleção múltipla) (PR #41; anexos na T-058, recorrência na T-059)
  - dep: T-037, T-034
- [x] **T-046** Onboarding no app com checklist e dicas contextuais (PR #42; checklist no Início provisório até a T-053, permissões de verdade nas T-088, T-085, T-121 e T-120)
  - dep: T-044, T-011, T-034 · docs: 04 (Onboarding)
  - As dependências do app (T-011, T-034) entraram na T-047: sem elas a tarefa parecia livre, mas não há app onde fazê-la.
- [x] **T-047** Rotinas diárias de faturas e atrasos (fechar faturas, marcar atrasadas) (PR #28)
  - dep: T-041, T-042 · docs: 09 (Rotinas)
- [x] **T-048** Relatórios (API + telas), sem exportação (PR #29; telas na T-054, histórico de preços da NFC-e na T-066c)
  - dep: T-044 · RN-150

- [x] **T-049** Telas de categorias e contas no app (lista, criar, editar, excluir escolhendo para onde mover os lançamentos) (PR #43)
  - dep: T-035, T-036, T-011, T-034 · docs: 04 · RN-065, RN-066
  - Separada da T-035 e da T-036: as telas dependem do esqueleto do app (T-010), do design system (T-011) e da sessão no app (T-034), que ainda não existiam.
- [x] **T-050** Telas de cartões e faturas no app (lista com limite, cadastro e edição, fatura atual, lista de faturas, detalhe da fatura com as compras) (PR #44)
  - dep: T-040, T-011, T-034 · docs: 04 · RN-030 a RN-034
  - Separada da T-040 pelo mesmo motivo da T-049.
- [x] **T-051** Recorrência no cartão de crédito (assinaturas): ocorrências entram nas faturas e editar ou excluir a recorrência refaz as faturas (PR #30)
  - dep: T-040 · RN-043, RN-031
- [x] **T-052** Telas de orçamentos e metas no app (barras por faixa, projeção, definir orçamento, metas com aportes e sugestão de concluir) (PR #45)
  - dep: T-043, T-011, T-034 · docs: 04 · RN-060 a RN-063
  - Separada da T-043 pelo mesmo motivo da T-049.
- [x] **T-053** Tela Início no app (seletor de período, resumo, próximos vencimentos, cartões, orçamentos, checklist e modo privacidade) (PR #47)
  - dep: T-044, T-011, T-034 · docs: 04 · RN-020 a RN-024
  - Separada da T-044 pelo mesmo motivo da T-049. O modo privacidade (RN-022) fica só no aparelho.
- [x] **T-054** Telas de relatórios no app (mensal, anual, por categoria, dia da semana, cartão e forma de pagamento) (PR #48)
  - dep: T-048, T-011, T-034 · docs: 04 · RN-150
  - Separada da T-048 pelo mesmo motivo da T-049.
- [ ] **T-055** 👤 Botões de entrar com Google e com Apple no app (`POST /v1/auth/social` com o `id_token`)
  - dep: T-032, T-034 · docs: 04 · RN-002 · requer os clientes OAuth (BLOQUEIOS, T-032) e build de desenvolvimento no aparelho
  - Separada da T-034: sem os clientes OAuth do cliente, não há como testar o login social de ponta a ponta.
- [x] **T-056** Tela de atualização obrigatória no app (426 `VERSAO_APP_DESATUALIZADA` e `versaoMinima` do `GET /v1/config-app`), com link para a loja (PR #49)
  - dep: T-033, T-034 · docs: 04
  - Separada da T-034: a sessão já manda a versão do app, mas a tela de atualização não estava em nenhuma tarefa.
- [x] **T-057** Telas Mais (grade de atalhos) e Perfil no app: dados pessoais, assinatura, biometria, alertas, permissões, rever tutorial, exportar dados, sair e excluir conta (PR #50; assinatura, alertas, exportar e excluir entram com a Fase 4, a T-087 e a T-140)
  - dep: T-033, T-034, T-017 · docs: 04, `docs/design` (página 9)
  - O design trouxe as duas telas, que não estavam em nenhuma tarefa. Exportar e excluir conta só abrem o fluxo da T-140, e as preferências de alerta são da T-087.
- [x] **T-058** Anexos no formulário do lançamento no app (foto, PDF ou comprovante: `POST /arquivos`, envio direto ao S3 e `anexoIds`) (PR #51)
  - dep: T-045 · docs: 04, 05 (Transações e arquivos) · RN-040
  - Separada da T-045: precisa do `expo-image-picker` e do `expo-document-picker`, módulos nativos que pedem novo build de desenvolvimento.
- [x] **T-059** Recorrência no app: "repetir" no formulário do lançamento (`POST /recorrencias`), editar e parar a recorrência (PR #52)
  - dep: T-045, T-038, T-051 · docs: 04, 05 (Recorrências) · RN-043
  - Separada da T-045: a lista já mostra "todo mês" e a exclusão pergunta o escopo, mas criar e editar a recorrência usam outras rotas.
- [x] **T-147** Metas: quanto foi guardado no mês (total e por meta) no `GET /metas` e, no app, o "+ R$ 450 este mês" e a "Dica da Mony" da tela de metas ("Guardando R$ 450 por mês, sua reserva fica completa em 19 meses") (PR #54)
  - dep: T-043, T-052 · docs: 04, 05 (Orçamentos e metas) · RN-063
  - Achada na T-052: o design (página 5) mostra os dois, mas a lista de metas não traz os aportes. A conta do ritmo fica na API, como as outras.
- [x] **T-148** Teste que falha quando uma classe do Tailwind usa valor fora dos tokens (ex.: `h-14`, `w-px`) no app (PR #55)
  - dep: T-011 · docs: 04 (Design system)
  - Achada na T-053: o tema troca a escala pelos tokens, e uma classe com valor que não existe some sem aviso (os círculos dos atalhos ficaram sem tamanho). Só apareceu na conferência visual.

## Fase 2 — Mony

- [x] **T-060** Módulo Mony: orquestrador, `LlmProvider` (fake + provedor real), SSE, histórico, `logs_ia` (PR #53; ferramenta `listar_categorias`, as de finanças na T-062)
  - dep: T-020, T-037 · docs: 08
- [x] **T-061** Rascunhos e roteador por regra (próximo campo, botões, `/mony/acoes` sem modelo) (PR #56)
  - dep: T-060 · RN-080, RN-081, RN-084, RN-085, RN-088
- [x] **T-062a** Ferramentas de lançamento da Mony: `listar_cartoes`, `criar_categoria`, `criar_transacao`, `criar_parcelamento`, `editar_transacao`, `excluir_transacao` (confirmação por botão), `consultar_transacoes`; cartão de resumo com [Desfazer] (PR #57)
  - dep: T-061, T-042, T-043 · RN-082, RN-086, RN-087, RN-092
  - A T-062 (ferramentas de finanças) foi dividida em T-062a e T-062b por tamanho.
- [x] **T-062b** Ferramentas de consulta e planejamento da Mony: `resumo_periodo`, `consultar_cartao`, `pagar_fatura` (confirmação por botão), `consultar_orcamentos`, `definir_orcamento`, `consultar_metas`, `atualizar_meta` (PR #58)
  - dep: T-062a · RN-087, RN-092 · docs: 08 (Ferramentas)
- [x] **T-063** Preferências aprendidas e ordenação de botões (PR #60)
  - dep: T-062b · RN-081, RN-090
- [x] **T-064** Áudio: gravação no app + `TranscricaoProvider` (PR #61)
  - dep: T-060
- [x] **T-065** Foto, print e PDF: `ler_documento`, `importacoes_documento`, confirmação obrigatória (PR #62)
  - dep: T-062b · RN-083, RN-086
- [x] **T-066a** NFC-e na API: `NfceProvider` (falso e Infosimples), `POST /mony/nfce` com a compra a confirmar, novas tentativas na `mony-midia` e foto como plano B (PR #73; testar com a conta e cupons reais, ver BLOQUEIOS)
  - dep: T-026, T-065 · docs: 10 (NFC-e) · RN-083, RN-090, RN-120
  - A T-066 foi dividida em API (T-066a), leitura do QR no app (T-066b) e histórico de preços (T-066c).
- [x] **T-066b** NFC-e no app: ler o QR do cupom com `expo-camera` na aba Mony, conferir com `lerQrNfce` e mandar para `POST /mony/nfce`; o [Ver a compra] da mensagem da nova tentativa (PR #74)
  - dep: T-066a, T-069 · docs: 04, 10 (NFC-e)
  - Módulo nativo novo (`expo-camera`): sem build publicado ainda, não quebra o EAS Update (ver T-058).
- [x] **T-066c** Histórico de preços da NFC-e (RN-150): `GET /relatorios/precos` (busca por descrição em `nfce_itens`, último preço, menor e média por loja) e a tela em Relatórios (PR #75)
  - dep: T-066a, T-054 · docs: 05 (Relatórios), 06 (índice `to_tsvector` em `nfce_itens`) · RN-150, RN-071
- [x] **T-067** Consultoria pós-lançamento (impacto no orçamento e no cartão) (PR #63)
  - dep: T-062b · RN-089
- [x] **T-068** Prompt versionado (`mony_config`) e avaliação com frases de teste no CI (PR #64)
  - dep: T-062b · docs: 08 (Controle de custo e qualidade)
- [x] **T-069** Tela de chat completa no app (componentes, atalhos, busca no histórico) (PR #65)
  - dep: T-061, T-034

## Fase 3 — Alertas, lembretes e agenda

- [x] **T-080** Motor de alertas: avaliadores, filtros (preferências, chave única, cota de consultoria, silêncio), central de notificações (PR #31)
  - dep: T-047 · docs: 09 · RN-100 a RN-105
- [x] **T-081** Push: `PushProvider` (Expo Push), registro de token, categorias de ação, deep links (PR #32; no app na T-088)
  - dep: T-080, T-033 · docs: 04, 09
- [x] **T-082** Alertas de cartão, fatura, orçamento, vencimentos, fora do padrão e projeção (PR #33)
  - dep: T-080 · RN-106, RN-107, RN-108
- [x] **T-083** Resumos semanal e mensal no chat (PR #66)
  - dep: T-080, T-062b
- [x] **T-084a** Lembretes na API: CRUD, repetição em RRULE (subconjunto), [Feito] e [Adiar], rotina por minuto com push urgente, `GET /lembretes/alarmes` e push silencioso; 5 ativos no gratuito (PR #76)
  - dep: T-081, T-023a · RN-075 a RN-077, RN-120
  - A T-084 foi dividida em API (T-084a) e app (T-084b).
- [x] **T-084b** Lembretes no app: lista (ativos e feitos), novo e editar (título, data e hora, repetição diária, semanal com os dias, mensal ou anual, a cada N, até; canais notificação e alarme), [Feito] e [Adiar] na lista, a tela do lembrete (`mony://lembretes/:id`) e os atalhos (Mais e o "Lembrete" do Início) (PR #78)
  - dep: T-084a · docs: 04, 09 · RN-075, RN-076
  - Alarme local pelo `mony-alarm` (T-023a): o app chama `sincronizar` com `GET /lembretes/alarmes` ao abrir e depois de criar, editar, concluir, adiar ou excluir; pede o alarme exato e a tela cheia no primeiro lembrete com alarme. No iOS, o alarme chega com a T-023b; até lá, o lembrete com alarme sai só como notificação (a API já manda o push para quem tem iPhone).
- [ ] **T-085** 👤 Agendas Google e Outlook (OAuth no servidor) e agenda do aparelho
  - dep: T-084a · RN-079 · requer verificação do app no Google
- [x] **T-086a** Ferramentas da Mony: `criar_lembrete`, `consultar_lembretes` e `ajuda_app` (base de ajuda versionada) (PR #79)
  - dep: T-084a, T-062b
  - A T-086 foi dividida: lembretes e ajuda (T-086a) e compromissos e agenda (T-086b), que dependem das agendas da T-085.
- [ ] **T-086b** Ferramentas da Mony: `criar_compromisso` e `consultar_agenda`
  - dep: T-085, T-086a
- [x] **T-087** Preferências de alerta e horário de silêncio no app; central de notificações (PR #67)
  - dep: T-081, T-011, T-034 · docs: 04
  - Tela do app: depende do design system (T-011) e da sessão no app (T-034), como a T-049.
  - "Alertas da Mony" (com o horário de silêncio, "silêncio 22h às 7h") entra no Perfil (T-057), e o sino do Início (T-053) passa a abrir a central.
- [x] **T-088** Push no app: permissão, registro do token (`POST /me/dispositivos` ao abrir e ao trocar), canais do Android, categorias de ação ([Paguei], [Feito], [Adiar]) e abrir o `linkInterno` ao tocar (PR #81)
  - dep: T-081, T-010, T-034 · docs: 04, 09
  - Separada da T-081 pelo mesmo motivo da T-049. Os canais (`CANAIS_ANDROID`) precisam existir antes do primeiro push: o Android não mostra push de canal que o app não criou.
  - O canal `alarmes` é do `mony-alarm` (T-023a), que o cria com o som de alarme; esta tarefa cria os outros três.
  - Lembretes (T-084a): o [Feito] chama `POST /lembretes/:id/concluir` com a `ocorrencia` do link (`?ocorrencia=<ms>`, em ISO) e o [Adiar], `POST /lembretes/:id/adiar` (10 min); o push silencioso (`dados.tipo = sincronizar_alarmes`) busca `GET /lembretes/alarmes` e chama o `sincronizar` do `mony-alarm` em segundo plano.
  - Feito no PR #81: os botões abrem o app e o silencioso funciona com o app aberto. O resto ficou na T-088b.
- [ ] **T-088b** Push com o app fechado: o silencioso dos alarmes e os botões [Feito] e [Adiar] sem abrir o app, por uma tarefa de segundo plano (`expo-task-manager` e `Notifications.registerTaskAsync`)
  - dep: T-088 · docs: 04, 09 · testar em aparelho Android e iPhone
  - A tarefa roda sem a tela: precisa de acesso à API sem renovar a sessão junto com o app aberto (dois usos do mesmo token de renovação derrubam a sessão, RN-004). Uma saída é um token só de leitura dos alarmes por aparelho.

## Fase 4 — Planos e cobrança

- [x] **T-100** Cotas do plano gratuito: `@RecursoLimitado`, contagem atômica, `GET /assinatura/uso`, aviso com [Ver planos] (PR #68)
  - dep: T-062b · RN-120, RN-122, RN-123, RN-127
- [x] **T-101** Teste de 3 dias: início no cadastro, controle de um teste por pessoa, avisos, encerramento automático (PR #69)
  - dep: T-100, T-080 · RN-124, RN-125, RN-126
  - A T-100 já trata o teste vencido como gratuito (`planoEfetivo`); a rotina só grava a troca e avisa.
- [x] **T-102** 👤 Stripe: `BillingProvider`, checkout, webhooks idempotentes, portal, inadimplência (PR #92)
  - dep: T-024, T-101 · RN-128, RN-131 · docs: 10 (Stripe)
- [x] **T-103** Telas de planos e assinatura no app (PR #93)
  - dep: T-102
  - Parte de "Seu plano" (`/mais/plano`, T-100), que o [Ver planos] da Mony abre; os formulários que recebem `LIMITE_PLANO_ATINGIDO` e os relatórios no gratuito podem mostrar o [Ver planos] também.
- [x] **T-104** Admin: preços (novo Price na Stripe), limites, duração do teste, cupons, histórico. Dividida em T-104a a T-104d: o painel ainda não tinha login.
- [x] **T-104a** Login do painel admin: e-mail e senha de quem tem papel `admin`, 2FA TOTP obrigatório (configurado no primeiro acesso), sessão curta, `@Admin()` na API, auditoria das entradas e um comando para promover o primeiro admin (PR #94)
  - dep: T-012 · docs: 11, 13
- [x] **T-104b** Admin: preços do mensal e do anual (novo Price na Stripe, só para novas assinaturas) e histórico com data e autor (PR #95)
  - dep: T-104a, T-102 · RN-129 · docs: 13
- [x] **T-104c** Admin: limites do plano gratuito e duração do teste grátis (PR #96)
  - dep: T-104a · RN-120, RN-124 · docs: 13
- [x] **T-104d** Admin: cupons espelhados na Stripe (PR #97)
  - dep: T-104a, T-102 · RN-130 · docs: 13
- [ ] **T-105** Pix no plano anual como pagamento único que libera 12 meses (Checkout `mode=payment`), com aviso antes do fim e renovação por novo pagamento **(confirmar com cliente: pergunta 9 do doc 15)**
  - dep: T-102 · RN-128 · docs: 10 (Stripe)
  - A Stripe não aceita Pix em assinatura recorrente (teste da T-102). O mensal fica só no cartão.

## Fase 5 — Recursos pagos e colaboração

- [ ] **T-120** 👤 Open Finance: `OpenFinanceProvider`, conexão, webhooks, importação, dedupe, conflito manual, categoria, consentimento
  - dep: T-025, T-102 · RN-121, RN-140 a RN-144
- [ ] **T-121** 👤 Detecção de apps de compra (iOS e Android) com endpoint e alerta
  - dep: T-021, T-022, T-081 · RN-104, RN-121
  - O intervalo por app (RN-104) vem do painel: `ParametrosService.obter()` → `alertas.intervaloAppCompraHoras` (T-141g).
  - Android sobre o módulo `mony-app-usage` da T-022; a abertura vai para o servidor com o token de evento recomendado em `docs/agentes/poc/T-022.md` ("Limitações da PoC"). A tela de teste da PoC sai quando a do produto existir.
- [ ] **T-122** 👤 Lembrete por ligação (`VozProvider`), telefone verificado, limite mensal
  - dep: T-084a, T-102 · RN-078
  - O limite mensal vem do painel: `ParametrosService.obter()` → `ligacoes.limiteMensal` (T-141g).
- [x] **T-123a** Listas de compras na API: listas, itens, preço por NFC-e, orçamento e "Finalizar" com a despesa (PR #82)
  - dep: T-066a, T-066c · RN-070 a RN-073, RN-120 · docs: 05 (Listas de compras)
- [x] **T-123b** Telas das listas de compras no app (desenho, página 6) (PR #83)
  - dep: T-123a · RN-070 a RN-073
  - Entrada em Mais e nos atalhos do Início; item com o preço sugerido e o "Subiu 12% desde a última compra" (`historico`); total estimado contra o `orcamento` da categoria; "Finalizar" com a forma de pagamento, a categoria e o valor editáveis; `LIMITE_PLANO_ATINGIDO` com [Ver planos].
- [x] **T-123c** Ferramenta da Mony para listas de compras (`gerenciar_lista_compras`) (PR #84)
  - dep: T-123a · RN-070, RN-072 · docs: 08
  - Criar lista, pôr e tirar itens, marcar comprado e consultar o total pelo `ListasService`; o "Finalizar" pela Mony passa pela confirmação como os lançamentos.
- [x] **T-124a** Compartilhar listas na API: convites para quem tem conta (e-mail ou telefone), aceitar, recusar, sair e remover, permissão `ver` ou `editar`; a lista compartilhada aparece para o convidado com o dono e a permissão; `CompartilhamentosService.verificarAcesso` (PR #85)
  - dep: T-123b, T-084b · RN-074 · docs: 05, 06
  - A T-124 foi dividida: API das listas (T-124a), tempo real (T-124b), lembretes compartilhados (T-124c) e as telas do app (T-124d).
- [x] **T-124b** Tempo real das listas compartilhadas: WebSocket `/v1/ws` (Socket.IO com adapter Redis), sala `lista:<id>` só para quem tem acesso, evento a cada mudança da lista (PR #86)
  - dep: T-124a · RN-074 · docs: 02, 05
- [x] **T-124c** Lembretes compartilhados: convite para o lembrete, o convidado vê e recebe o aviso; quem pode concluir e adiar (PR #88)
  - dep: T-124a · RN-074 · docs: 07, 09
- [x] **T-124d** Compartilhar no app: convidar pela lista, convites recebidos (aceitar e recusar), avatares e "compartilhada com N pessoas" (doc 04), lista atualizando em tempo real (PR #90)
  - dep: T-124b, T-124c · RN-074 · docs: 04
  - Lembrete recebido com `ver`: sem [Feito] e [Adiar] na tela; se tocar no botão do push, mostrar a mensagem do 403 (DECISOES, T-124c).
- [x] **T-125** Exportação de relatórios PDF e XLSX no worker (PR #70)
  - dep: T-048, T-100 · RN-151
  - No gratuito, sem exportação (RN-120): `LIMITE_PLANO_ATINGIDO` com `recurso: relatorio`.

## Fase 6 — Lançamento

- [ ] **T-140** LGPD: aceites de termos, consentimentos, exportar dados, excluir conta, retenção de arquivos
  - dep: T-120, T-102 · docs: 11 · RN-160 a RN-162
  - No app, "Exportar meus dados" e "Excluir conta" entram na seção Privacidade do Perfil (T-057).
  - Excluir conta mantém os resumos da `controle_teste` (RN-125, T-101): sem eles, excluir e cadastrar de novo daria outro teste grátis.
- [x] **T-141** Admin completo: usuários, assinaturas, métricas, novidades, Mony (prompt e custos), auditoria, filas. Dividida em T-141a a T-141g, uma seção do painel por vez.
  - dep: T-104b, T-104c, T-104d, T-068 · docs: 13
- [x] **T-141a** Admin: usuários (busca, dados da conta, aparelhos e conexões, bloquear e reativar, estender teste grátis, auditoria das visualizações) (PR #98)
  - dep: T-104a · docs: 13
- [x] **T-141b** Admin: assinaturas (em teste, gratuitos, ativas, canceladas, inadimplentes; conversão do teste; MRR) (PR #99)
  - dep: T-104a, T-102 · docs: 13
- [x] **T-141c** Admin: auditoria (registro das ações dos administradores, com filtros) (PR #100)
  - dep: T-104a · docs: 13
- [x] **T-141d** Admin: novidades (criar, editar, agendar e desativar comunicados com título, texto, vídeo e validade; push opcional) (PR #102)
  - dep: T-104a · docs: 13 · vídeo por URL ou upload no S3 **(confirmar com cliente)**
- [x] **T-141e** Admin: Mony (prompt do sistema versionado com avaliação antes de ativar, logs de conversas com erro, custo por período) (PR #103)
  - dep: T-104a, T-068 · docs: 08, 13
- [x] **T-141f** Admin: métricas (usuários ativos, lançamentos por origem, alertas enviados) por materialized views (PR #104)
  - dep: T-104a · docs: 13
- [x] **T-141g** Admin: filas (jobs falhos, reprocessar; tela própria no lugar do Bull Board) e configurações (parâmetros de alertas, limite de ligações, versão mínima do app) (PR #105)
  - dep: T-104a · docs: 13
- [ ] **T-142** Monitoramento e alertas (Sentry, métricas, alarmes de fila, webhook, custo de IA, backup), dividida em:
  - dep: T-013 · docs: 12
  - [x] **T-142a** Alertas técnicos pelo worker: rotina a cada 5 minutos que confere fila parada, falhas nas filas de webhook (Stripe e agregador) e custo de IA do dia acima do limite do painel; e-mail para `ALERTAS_TECNICOS_EMAILS` e log `alerta_tecnico`, sem repetir o mesmo alerta (PR #110)
  - [x] **T-142b** Alarmes da AWS no Terraform (SNS por e-mail): alvos não saudáveis no ALB, 5xx acima de 1% por 5 minutos, log `alerta_tecnico` do worker, rotina de monitoramento sem rodar, backup diário do RDS não encontrado (PR #111)
  - [ ] **T-142c** Sentry na API, no worker e no admin, com releases e source maps (o app já liga o Sentry quando o build tem DSN)
  - [ ] **T-142d** Métricas de rota e de fila no CloudWatch (tempo de resposta e falhas por rota, tamanho e falhas das filas)
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

- [x] **T-149** Importação de fatura e extrato pela Mony: reconhecer a parcela ("02/10") como parte de um parcelamento e não duplicar o que já está lançado (mesmo valor, data e cartão), avisando no cartão a confirmar (PR #91)
  - dep: T-065 · RN-083 · docs: 08 (Leitura de mídia)
- [x] **T-150** Novidades no app: `GET /novidades` (as que estão no ar e valem) e `POST /novidades/:id/lida`, aba Novidades na central com o vídeo, e o contador de não lidas (PR #106)
  - dep: T-141d, T-087 · docs: 05, 09, 13 · o push da novidade já chega na central como notificação (T-141d)
- [x] **T-151** Limites de uso da Mony por usuário por dia, para todos os planos (mensagens e leituras de imagem), editáveis na seção Mony do painel; ao chegar no limite, a Mony avisa e para até o dia seguinte (PR #107)
  - dep: T-141e · docs: 08 (Controle de custo e qualidade), 13 · o gratuito já tem cotas próprias (RN-120, T-104c); este limite é de custo e vale também para quem paga
- [x] **T-152** Teste de integração instável: `recorrencias-cartao.integracao.spec.ts` › "editar refaz as ocorrências livres nas faturas" às vezes vê R$ 100 em vez de R$ 75 em dez/2026 (uma ocorrência a mais) quando roda com a suíte inteira; sozinho passa. Achar a corrida (provavelmente a rotina ou outro teste gerando ocorrências no mesmo instante) e tornar o teste determinístico (PR #108)
  - dep: — · visto nas verificações locais das T-141f e T-150
