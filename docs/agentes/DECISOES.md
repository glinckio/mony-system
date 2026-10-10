# Decisões tomadas durante o desenvolvimento

Registro em ordem cronológica. Só acrescente no fim. Formato em [CLAUDE.md](../../CLAUDE.md), seção 9.
Decisões de arquitetura anteriores ao código estão em [docs/arquitetura/02-stack-e-decisoes.md](../arquitetura/02-stack-e-decisoes.md).

## 2026-10-08 — Fluxo de agentes adotado
Contexto: o trabalho é feito por agentes de IA alternando entre contas, sem memória entre sessões. Decisão: todo estado vive no Git/GitHub (BACKLOG, PRs, este arquivo, BLOQUEIOS). Reversível: sim.

## 2026-10-08 — T-001 — Versões base do monorepo
Contexto: o doc 03 pede Node LTS ativa, pnpm e Turborepo, sem fixar versão. Decisão: Node 24 (`.nvmrc` e `engines` `>=24`), pnpm 12.10.1 no campo `packageManager`, turbo `^2.11.7`. O Node 24 entra em manutenção em 2026-10-20 (suporte até 2028-04) e o Node 26 vira LTS ativa em 2026-10-28; migrar para o 26 quando Expo e NestJS o suportarem oficialmente. Reversível: sim, `.nvmrc` e `package.json`.

## 2026-10-08 — T-001 — Template de PR em `.github/`
Contexto: o CLAUDE.md usa `--body-file .github/pull_request_template.md`, mas o template estava em `docs/agentes/`. Decisão: movido para `.github/pull_request_template.md`, caminho que o GitHub também usa para preencher PRs abertos pela web. Reversível: sim.

## 2026-10-08 — T-001 — Bloco automático do Turborepo no AGENTS.md desligado
Contexto: o turbo 2.11 cria e reescreve um bloco gerenciado no `AGENTS.md` quando detecta um agente de IA. Decisão: `"agentGuidance": false` no `turbo.json`, para o `AGENTS.md` continuar apontando só para o `CLAUDE.md`. O que o bloco dizia e vale seguir: a configuração do turbo muda entre versões; antes de mexer em `turbo.json`, leia a documentação que vem no pacote instalado (`node_modules/turbo/docs/`). Reversível: sim.

## 2026-10-08 — T-001 — Commit inicial antes de existir o remoto
Contexto: o repositório no GitHub ainda não existe e a sessão não tinha `gh` autenticado. Decisão: estrutura feita e commitada localmente na `main`; T-001 marcada como concluída e o push ficou registrado em BLOQUEIOS.md. Armadilha: ao usar git por um shell Linux sobre a pasta do Windows, a montagem mostra todo arquivo como executável; o repositório local foi criado com `core.fileMode=false` para não versionar arquivos como 755. Reversível: sim.

## 2026-10-09 — T-002 — TypeScript 6.0 em vez do 7
Contexto: o `latest` do TypeScript no npm é o 7.0 (compilador nativo), mas o `typescript-eslint` 8.71 só aceita `>=4.8.4 <6.1.0`. Decisão: `typescript ~6.0.3` no monorepo e `peerDependencies` do `@mony/config` em `>=6.0.0 <6.1.0`. Reavaliar quando o typescript-eslint suportar o 7. Reversível: sim.

## 2026-10-09 — T-002 — Regras do ESLint
Contexto: o doc 03 pede TypeScript estrito, `any` só com comentário justificando e proteção contra dinheiro em float. Decisão: `strictTypeChecked` do typescript-eslint; `eslint-comments/require-description` obriga `-- motivo` em todo `eslint-disable`; `no-restricted-syntax` recusa número com casas decimais escrito em campo terminado em `Centavos`. A checagem é só de literais: valor calculado continua dependendo de `@mony/shared/dinheiro` e de revisão. Atenção: `no-restricted-syntax` é uma regra só, então um pacote que acrescentar entradas nela precisa repetir a de centavos. Reversível: sim.

## 2026-10-09 — T-002 — Commits e formatação
Contexto: o `config-conventional` do commitlint exige escopo em minúsculas, mas o CLAUDE.md usa o ID da tarefa (`T-031`). Decisão: escopo obrigatório, aceitando `T-031`, `T-031a`, `T-HOTFIX` ou domínio em kebab-case minúsculo (`cartoes`, como no doc 03); assunto começa em minúscula. O título do squash (`T-031: …`) não segue Conventional Commits, mas o merge é feito no GitHub e não passa pelos hooks. Prettier com `printWidth: 100` e aspas simples; Markdown fica fora do Prettier para não realinhar as tabelas dos docs. Reversível: sim.

## 2026-10-09 — Ambiente — Agente na nuvem ligado ao computador do humano
Contexto: quando o agente roda comandos num shell Linux ligado à pasta do Windows, o `gh` do Windows não fica visível e processos em segundo plano morrem no fim de cada comando. Decisão: `gh`, Node 24 e pnpm instalados em `$HOME/tools` do shell Linux; login do `gh` pelo fluxo de código em duas etapas (gerar o código num comando, buscar o token em outro); trabalho num clone em `$HOME/work`, para não criar `node_modules` de Linux na pasta do Windows; depois do merge, a `main` da pasta do humano é atualizada com `git pull`. Reversível: sim.

## 2026-10-09 — Repositório aceita só squash
Contexto: o PR #1 foi mergeado pelo botão do GitHub, que criou um merge commit; o CLAUDE.md pede squash. Decisão (autorizada pelo humano): repositório configurado para aceitar só squash, com o título do PR como título do commit e apagando a branch no merge. Reversível: sim, nas configurações do repositório.

## 2026-10-09 — T-003 — Formatação de dinheiro sem passar por ponto flutuante
Contexto: o doc 03 mandava formatar com `Intl.NumberFormat`, o que exige dividir centavos por 100 em ponto flutuante. Isso erra o centavo em valores muito altos (no maior inteiro seguro o Intl mostra `,90` em vez de `,91`), e o Intl do Hermes (app) varia por plataforma. Decisão: `formatarCentavos` monta o texto com aritmética inteira e produz a mesma saída do Intl pt-BR (inclusive o espaço não separável depois de "R$"); os testes comparam as duas saídas. `textoParaCentavos` recusa ponto como separador decimal (`10.50` é ambíguo em pt-BR). Doc 03 atualizado. Reversível: sim.

## 2026-10-09 — T-003 — Formato do pacote `@mony/shared`
Contexto: o pacote vai ser usado pela API (Node, talvez CommonJS), pelo app (Metro) e pelo admin (Vite). Decisão: compilado com `tsc` para `dist/` em ESM com tipos, exportado por subcaminho (`@mony/shared/dinheiro`, `/datas`, `/enums`, `/erros`); o Turbo já roda `^build` antes de lint, typecheck e test de quem depende dele, e o Node 24 carrega o pacote também por `require`. Sem `lib` de DOM nem de Node, para não depender de plataforma. Funções de data recebem o instante como parâmetro (sem relógio interno), para usar o `Clock` da T-008. Enums sem valores definidos nos docs (status de assinatura, de lembrete, de convite, de conexão Open Finance e de novidade; plataforma de dispositivo; tipos de alerta e de notificação) ficam para as tarefas que os usam. O catálogo de erros saiu das RNs; código novo entra no PR que passa a usá-lo e código existente não muda de nome. Armadilha: o TypeScript 6 exige `rootDir` explícito quando há `outDir` (erro TS5011). Reversível: sim.

## 2026-10-09 — T-004 — CI e proteção da main
Contexto: o doc 12 pede lint, typecheck e testes em todo PR. Decisão: workflow `CI` com um job `Verificar` (pnpm do `packageManager`, Node do `.nvmrc`, cache do store do pnpm e de `.turbo/cache`, `pnpm format:check` e `pnpm turbo run build lint typecheck test`), em todo PR e em push na `main`. A `main` exige PR, check `Verificar` verde com a branch atualizada e histórico linear, e recusa force push e exclusão, inclusive para administradores. Não exige aprovação humana, porque o CLAUDE.md deixa o agente mergear o próprio PR; o doc 14 fala em "1 aprovação", e o humano pode ligar isso quando houver revisor. Testcontainers, checagem do Prisma, cliente OpenAPI e avaliação da Mony entram no workflow nas tarefas que criam essas partes (T-006 a T-009, T-068). Armadilha: o log completo das execuções vem de `results-receiver.actions.githubusercontent.com`, que o shell do agente pode não alcançar; `gh run view <id> --json jobs` mostra o resultado de cada passo. Reversível: sim.

## 2026-10-09 — T-005 — SeaweedFS no lugar do MinIO no ambiente local
Contexto: o doc 12 e a T-005 pediam MinIO como S3 local. A MinIO parou de publicar imagens da edição comunitária em out/2025 e arquivou o código em 2026; segundo relatos de set/2026, `minio/minio` e `minio/mc` saíram do Docker Hub e do quay.io, e a API do Docker Hub não responde mais por elas. Com MinIO, o `docker compose up` falharia. Decisão: S3 local com SeaweedFS 4.48 em modo `mini` (Apache-2.0, um processo só), que cria a credencial e o bucket `mony-local` na subida pelas variáveis `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `S3_BUCKET`, e aceita URL assinada. Telemetria do SeaweedFS desligada. A API fala S3 padrão, então trocar de novo é só mudar o `compose.yaml`. BACKLOG (texto da T-005), doc 12 e README atualizados. Demais serviços: Postgres 18 (o 19 ainda é beta; o doc pede 16+), com o volume em `/var/lib/postgresql`, como exige a imagem do 18; Redis 8 com AOF e `noeviction`, para o BullMQ não perder jobs; Mailpit 1.31. Portas trocáveis por variável (`POSTGRES_PORTA` etc.). Reversível: sim.

## 2026-10-09 — T-006 — NestJS 11 em vez do 12
Contexto: o NestJS 12 saiu em 27/08/2026 e é ESM; o `nestjs-zod` (escolhido no ADR-004 para validação e OpenAPI) declara suporte só até o Nest 11 (versão 5.5.0). O Nest 11 segue mantido (tag `legacy`, 11.2.7). Decisão: API em Nest 11, CommonJS, seguindo o ADR-004. A migração para o 12 virou a tarefa T-014. Reversível: sim.

## 2026-10-09 — T-006 — Detalhes do esqueleto da API
Contexto: primeira versão da API. Decisões: (1) API em CommonJS (`apps/api` sem `"type": "module"`), importando o `@mony/shared` em ESM pelo `require` de ESM do Node 24; o TypeScript 6 aceita com `module: nodenext`. (2) Testes com Vitest + `unplugin-swc`, porque o Nest precisa dos metadados de decorator que só o SWC (ou o `tsc`) emite; arquivos `*.spec.ts`. (3) `x-request-id`: o Fastify aceita o id recebido ou gera um UUID, devolve no cabeçalho e o pino usa o mesmo id; o `genReqId` do pino-http não serve, porque o Fastify já preenche `req.id`. (4) `GET /v1/health` em inglês, como pede a T-006 e o padrão de balanceadores; as rotas de domínio seguem em português (doc 03). (5) OpenAPI em `/v1/docs` e JSON em `/v1/docs/openapi.json` (para o Orval na T-009), só fora de produção. (6) Até a T-008 o worker sobe, registra no log e encerra, porque ainda não há fila que o mantenha vivo. (7) O pnpm 12 recusa instalar dependência com script de instalação não autorizado: `allowBuilds` no `pnpm-workspace.yaml` libera o `@swc/core` e nega o `@scarf/scarf` (telemetria do `@nestjs/swagger`). Armadilha do ambiente: no shell Linux ligado ao computador do humano, o binário do SWC recusa os diretórios de cache (pertencem a outro usuário), então os testes da API rodam no contêiner da nuvem e no CI, não nesse shell. Reversível: sim.

## 2026-10-09 — PR #5 mergeado vazio
Contexto: o PR #5 (T-006) foi marcado como pronto e mergeado pelo site enquanto ainda era rascunho, só com o commit vazio de início da tarefa. Entrou na `main` o commit vazio `89a9a31` com o título da T-006. A `main` não pode ser reescrita, então ele fica; o código da T-006 entrou pelo PR #6. Combinado com o humano: PR em rascunho é trabalho em andamento e o merge é do agente, salvo PR com rótulo `aguardando-humano`.

## 2026-10-09 — T-007 — Prisma 7.10 e o binário do schema engine
Contexto: a tag `latest` do CLI `prisma` aponta para o 8.0.0-rc; o `@prisma/client` estável é o 7.10.0. Decisão: `prisma`, `@prisma/client` e `@prisma/adapter-pg` em `~7.10.0`, gerador `prisma-client` com saída em `apps/api/src/generated/prisma` (fora do Git), CommonJS, conexão pelo adaptador `pg`, configuração em `apps/api/prisma.config.ts` (que lê o `.env` com `process.loadEnvFile`). O CLI baixa o schema engine de `binaries.prisma.sh`; os scripts de instalação de `prisma` e `@prisma/engines` ficam negados no `allowBuilds`, e o CLI baixa o binário na primeira vez que precisa. Armadilha do ambiente do agente: `binaries.prisma.sh` é bloqueado; com `PRISMA_SCHEMA_ENGINE_BINARY=/bin/false` funcionam `validate`, `format` e `generate`, mas não as migrações, que rodam no CI. Por isso o `turbo.json` repassa `PRISMA_*` e as variáveis de proxy às tarefas (`globalPassThroughEnv`). Reversível: sim.

## 2026-10-09 — T-007 — Decisões do schema
Contexto: o doc 06 lista os campos principais, não todos. Decisões: (1) 50 tabelas (41 do PDF + 9 propostas) e 41 enums do Postgres com os mesmos valores de `@mony/shared/enums` (teste da API confere). Valores que os docs não definiam: status de assinatura `ativa`/`inadimplente`/`cancelada` (o plano fica em `plano`), lembrete `ativo`/`concluido`/`cancelado`, convite `pendente`/`aceito`/`recusado`, novidade `rascunho`/`publicada`/`arquivada`, plataforma `ios`/`android`, origem de compromisso `app`/`mony`/`externo`, importação de documento (tipo e status). (2) Colunas acrescentadas estão no doc 06 (complementos). (3) As ligações duplas que o doc 06 propõe ficaram como relações nomeadas: `parcelas.transacao_id` e `transacoes.parcela_id`; `nfce_notas.transacao_id` e `transacoes.nfce_nota_id`. O anexo de mensagem fica em `mensagens.anexo_id`, e `anexos` não tem `mensagem_id`. (4) Horário de silêncio em texto `HH:MM`. (5) Dados de usuário apagam em cascata com o usuário; categoria, cartão, fatura e parcelamento usados por transação são `Restrict`. (6) Índices: ver nota no doc 06. (7) Exclusão lógica: a extensão filtra `excluido_em IS NULL` nas leituras do modelo principal (não nas relações com `include`); excluir é um `update` de `excluidoEm` feito pelo Service. (8) Seed: limites do gratuito (sem sobrescrever edição do admin) e, fora de produção, o usuário `demo@mony.local` no plano gratuito com os padrões do cadastro (`aplicarPadroesDoUsuario`, que a T-030 reaproveita). Categorias padrão e cores são provisórias (confirmar com o cliente; tokens na T-011). Reversível: sim, por nova migração.

## 2026-10-09 — T-007 — Job Banco no CI
Contexto: o doc 12 pede checagem de migração no PR, e o ambiente do agente não roda migrações. Decisão: job `Banco` (check obrigatório na `main`) com Postgres 18: `prisma validate`, `migrate deploy` em banco limpo, `migrate diff` do banco migrado contra o schema (falha se faltar migração) e seed duas vezes. Quando falta migração, o job comenta no PR o SQL gerado pelo Prisma; foi assim que a migração inicial foi criada. Erros dos passos do Prisma saem como anotação (legível por `gh api .../check-runs/<id>/annotations`). Armadilha: `pnpm --filter … exec` transforma o código 2 do `migrate diff` em 1, então esse passo chama `./node_modules/.bin/prisma` direto. Comando de conferência local corrigido no CLAUDE.md (o Prisma 7 exige `--from-config-datasource` e `--to-schema`). Reversível: sim.

## 2026-10-09 — T-008 — Núcleo da API
Contexto: o doc 05 pede `Clock`, `Contexto`, idempotência por `Idempotency-Key`, eventos de domínio por fila e as filas BullMQ. Decisões: (1) `Clock` abstrato com `ClockSistema` (padrão) e `ClockFixo` (testes); regra de negócio nunca chama `new Date()`. (2) `Contexto` `{ usuarioId, origem, idempotencyKey, requisicaoId }`, montado pelo decorator `@ContextoAtual()` a partir de `request.usuario`, que o guard da T-030 vai preencher; `contextoDoSistema()` para rotinas. (3) Idempotência só nas rotas com `@Idempotente()`: chave obrigatória (8 a 255 caracteres), válida por usuário + método + rota, reservada no Redis com `SET NX` (5 min) e resposta guardada por 24 h; repetição devolve a resposta com o cabeçalho `Idempotent-Replayed: true`; chave em uso → 409 `REQUISICAO_EM_ANDAMENTO`; mesma chave com outros dados → 422 `CHAVE_IDEMPOTENCIA_REUTILIZADA` (códigos novos no catálogo); falha da operação libera a chave. (4) Eventos: `BarramentoEventos.publicar` põe o evento na fila `eventos-dominio`; no worker, `ProcessadorEventos` chama os métodos com `@AoEvento('Nome')`, achados pelo `DiscoveryService`. Manipuladores precisam poder rodar de novo (o job é refeito em falha). (5) BullMQ 6 + `@nestjs/bullmq` 12 (aceita Nest 11) + ioredis 6; as 9 filas do doc 05 registradas, com 5 tentativas e backoff exponencial; id de job com `idDeJob` (o BullMQ recusa `:`; exemplo do doc 05 corrigido). (6) Sem Redis, API e worker sobem; o erro de conexão vira um aviso a cada 30 s no log. (7) `REDIS_URL` obrigatória. (8) pnpm: script nativo opcional `msgpackr-extract` negado; o pnpm 12 segura versão publicada há pouco (instalou o BullMQ 6.3.11, não o 6.3.12 do dia). (9) Testes unitários trocam filas e idempotência por versões em memória (`test/utilitarios.ts`); os de integração (`TESTES_INTEGRACAO=1`) usam Postgres e Redis de verdade e rodam no job Banco, que ganhou um Redis 8. Reversível: sim.

## 2026-10-09 — T-009 — Cliente da API com Orval
Contexto: o doc 02 pede hooks TanStack Query gerados do OpenAPI e o CI falhando se o gerado estiver desatualizado. Decisões: (1) A API ganhou `dist/exportar-openapi.js` (`pnpm --filter api openapi:exportar <arquivo>`), que monta o contrato sem subir o HTTP. O contrato fica versionado em `packages/api-client/openapi.json`, para mudança de contrato aparecer no diff do PR; esse arquivo fica fora do Prettier, senão a regeração sempre acusaria diferença. (2) Nome da operação = método + recurso sem `Controller` (`SaudeController.verificar` → `verificarSaude`, hook `useVerificarSaude`). (3) Orval 8 com `client: react-query`, `httpClient: fetch` (sem axios), um arquivo por tag em `src/gerado/` (gerado e commitado, nunca editado à mão), formatado com Prettier. (4) Todas as chamadas passam por `requisicao` (`src/requisicao.ts`): URL base e token por `configurarCliente`, erro da API vira `ErroApi` com o `codigo` do catálogo. (5) `@Idempotente()` também declara o cabeçalho `Idempotency-Key` no contrato, então o cliente gerado o pede. (6) O pacote compila para `dist/` em ESM com resolução `Bundler`, porque o código gerado usa imports sem extensão e os consumidores (Metro e Vite) são bundlers. (7) `turbo.json` próprio do pacote: build, lint, typecheck e test não dependem do `generate`, que só roda quando chamado (e no CI, como checagem). Armadilha: `import()` dinâmico em arquivo CommonJS com `module: nodenext` exige extensão `.js`. Reversível: sim.

## 2026-10-09 — T-012 — Esqueleto do painel admin
Contexto: o doc 13 pede React + Vite + TanStack Router + TanStack Query + shadcn/ui com o cliente gerado. Decisões: (1) Vite 8, React 19.2.3 (mesmo `catalog` do app, para o `@mony/api-client` enxergar uma só cópia de React e TanStack Query; o bloco do `catalog` é o mesmo da T-010), TanStack Router 1.170 com rotas por arquivo em `src/rotas/` e divisão automática de código. O `src/rotas.gen.ts` gerado vai para o Git (o typecheck e os testes precisam dele sem rodar o Vite), fora do ESLint e do Prettier; um passo novo do CI ("Arquivos gerados commitados") falha se o build deixar diferença no Git. (2) shadcn/ui no estilo `new-york` com Tailwind 4 e cor base neutra: `components.json`, tema em `src/index.css`, `Button` e `Card` copiados do repositório do shadcn (o registro `ui.shadcn.com` não é acessível no ambiente do agente; com acesso, `pnpm dlx shadcn@latest add` funciona). As cores do cliente entram depois, nos tokens do `index.css`. (3) A API não tem CORS: em desenvolvimento o Vite repassa `/v1` para a API local (`API_LOCAL`); em produção, `VITE_API_URL`, e CORS ou mesmo domínio se decide com a infraestrutura (T-013). (4) Menu com as nove seções do doc 13, cada uma com página "em construção"; o Início mostra se a API está no ar pelo hook gerado `useVerificarSaude`. Login com 2FA fica para a tarefa própria. (5) Textos via i18next com chaves tipadas, como no app (doc 03). (6) Testes com Vitest + jsdom + Testing Library, com o roteador em memória. (7) `lucide-react` 1.53.0, e não a 1.54.0 do dia: o pnpm 12 recusa versão publicada há menos de um dia e, com a versão exata pedida, escreveria uma exceção à política no `pnpm-workspace.yaml`. Reversível: sim.

## 2026-10-09 — T-026 — NFC-e por API de terceiros, só com a chave
Contexto: o doc 10 manda preferir API de terceiros para ler cupons de NFC-e, e a PoC devia avaliar a cobertura nas UFs prioritárias, que o cliente ainda não definiu (doc 15, pergunta 13). Decisões: (1) Recomendação para a T-066: `NfceProvider` com a Infosimples ("SEFAZ / NFC-e Unificada"): cobrança por consulta, itens documentados, 26 UFs nas fontes (DF a confirmar). NFE.io não documenta cobertura nem campos; a Tera cobra por campanha. Leitor próprio só se o custo ou a cobertura pedirem, por UF. Relatório em `docs/agentes/poc/T-026.md`. (2) A API manda só a chave de acesso ao provedor e nunca acessa a URL do QR Code, o que elimina o risco de SSRF do doc 10. A lista de domínios por UF fica para um eventual leitor próprio. (3) `lerQrNfce` em `@mony/shared/nfce` lê os QR Codes versões 1, 2 e 3 e a chave digitada, e confere formato, dígito verificador, UF e modelo 65, já com o CNPJ alfanumérico (em produção desde 06/07/2026: letras nas posições 7 a 18, dígito com ASCII − 48). Sem `URLSearchParams`, que não existe em todos os ambientes do pacote. (4) Nota em contingência entra com novas tentativas espaçadas; cupom de homologação é recusado. Pendência humana em BLOQUEIOS: conta de teste e 20 cupons reais antes da T-066. Reversível: sim.

## 2026-10-09 — T-030 — Autenticação
Contexto: RN-001 a RN-008 e docs 05 e 11. Decisões:
- **Rotas e guarda.** `/v1/auth/cadastro`, `login`, `renovar`, `sair` (pelo token de renovação, sem exigir o de acesso) e `sair-todos` (com o token de acesso). Guarda global (`APP_GUARD`) com `@Publico()` para as exceções; `request.usuario` vira `{ id, papel, sessaoId, dispositivoId }`.
- **Token de acesso.** JWT ES256 de 15 minutos com `jose`, `kid`, emissor `mony-api`, audiência `mony` e a hora do `Clock`. `JWT_CHAVE_PRIVADA` (PEM PKCS#8) é obrigatória em produção; fora dela, sem a chave, a API gera uma temporária. A chave pública sai da privada. Rotação com duas chaves fica para quando houver a primeira troca.
- **Token de renovação.** 256 bits aleatórios, só o SHA-256 no banco. Vale 60 dias sem uso (valor nosso). Cada renovação cria uma sessão nova e revoga a anterior numa transação. Uma sessão por aparelho: login de novo no mesmo aparelho revoga a sessão anterior dele. Reuso de um token que já não vale (girado, ou trocado por um login novo no aparelho) revoga todas as sessões daquele aparelho; os outros aparelhos seguem (RN-004). Duas renovações simultâneas com o mesmo token também contam como reuso: o app faz uma renovação por vez (doc 04). Se a resposta de uma renovação se perder e o app repetir com o token antigo, o aparelho sai e o usuário entra de novo. Uma janela de tolerância fica para depois, se isso aparecer na prática.
- **Senha.** Argon2id com `@node-rs/argon2`, 64 MB e 3 iterações, sem script de instalação. E-mail inexistente também passa por um `verify`, para o tempo não revelar quem tem conta. Mesma resposta (`CREDENCIAIS_INVALIDAS`) para os dois casos.
- **RN-008.** Contadores no Redis (`core/limites`, `INCR` + `EXPIRE NX`, janela fixa de 15 minutos). Contam toda tentativa de login: 5 por e-mail (chave com o SHA-256 do e-mail) e 20 por IP. Login com sucesso zera o contador do e-mail. O IP vem do `X-Forwarded-For` só em produção (`trustProxy`), atrás do ALB. Em vez do `@nestjs/throttler`, porque a regra é por e-mail, não só por rota. O limite geral fica para a T-144.
- **RN-001.**
  - Telefone obrigatório e normalizado em E.164 brasileiro (`+55…`).
  - E-mail em minúsculas e sem espaços.
  - Senha de 8 a 128 caracteres. O login aceita qualquer tamanho até 128, para quem tem conta não ser barrado por regra nova.
- **RN-006 e RN-007.**
  - O cadastro cria, numa transação, o usuário, os aceites, a assinatura `teste` de 3 dias (72 h a partir do cadastro) e os padrões (`aplicarPadroesDoUsuario`). Também abre a sessão.
  - O controle de um teste por pessoa (RN-125) fica para a T-101.
  - Versões vigentes dos documentos em `@mony/shared/autenticacao` (`VERSOES_DOCUMENTOS`), provisórias até os textos do cliente.
  - Cadastro com versão antiga → `TERMOS_PENDENTES`.
  - Login e renovação devolvem `aceitesPendentes`. Bloquear as outras rotas até o novo aceite fica para a T-140 (LGPD).
- **Contrato.** Os schemas ficam em `@mony/shared/autenticacao`, e o `@mony/shared` passou a depender do `zod`. O documento OpenAPI passou para a versão 3.1: o Zod 4 gera campo anulável como `type: [..., 'null']`, que o Orval recusava em 3.0. O cliente foi regerado.
- **Infra.** Quando a T-013 entrar, o `ecs.tf` precisa ler `JWT_CHAVE_PRIVADA` do segredo `mony/<ambiente>/app`.

Reversível: sim.

## 2026-10-09 — T-031 — Recuperação de senha e e-mails
Contexto: RN-003, RN-008, docs 05, 10 e 11. Decisões:
- **Rotas.** `POST /v1/auth/senha/codigo` (202 sempre), `senha/conferir` (204, confere sem gastar) e `senha/redefinir` (200 + sessão). O doc 05 previa só `codigo` e `redefinir`. O `conferir` entrou para o app validar o código antes de pedir a senha nova (fluxo e-mail → código → senha do doc 04).
- **Código.** 6 dígitos com `randomInt`, guardado com o mesmo Argon2id das senhas: são só um milhão de valores, e um resumo rápido seria quebrado na hora por quem lesse o banco. 15 minutos, uso único, 5 tentativas erradas por código. Pedir outro faz os anteriores vencerem. Só o último código vale.
- **Respostas.** O pedido responde igual exista a conta ou não, e calcula o hash nos dois casos, para o tempo também não revelar. Contas bloqueadas ou excluídas não recebem código. `CODIGO_INVALIDO` para código errado e para e-mail sem conta. `CODIGO_EXPIRADO` para código vencido, usado, substituído ou esgotado.
- **Senha nova.** Encerra as sessões de todos os aparelhos e abre uma neste, numa sequência: primeiro uma transação (gasta o código, grava a senha, revoga as sessões), depois a sessão nova. Também zera o contador de login do e-mail, porque quem esquece a senha costuma ter esgotado as tentativas.
- **RN-008.** Contadores separados para pedir código (`recuperacao:*`) e para conferir (`codigo:*`), 5 por e-mail e 20 por IP em 15 minutos. Conferência certa zera o contador do e-mail. Na prática o limite por e-mail esgota junto com as 5 tentativas do código; as duas regras ficam.
- **E-mails.**
  - `EmailProvider` com três implementações: `brevo` (API HTTP), `smtp` e `fake`. O `smtp` entrou para o Mailpit do `docker compose`, que já esperava os e-mails da API em desenvolvimento. Usa `nodemailer`.
  - Os modelos ficam no Git, como funções que montam assunto, HTML e texto. Os templates do painel do Brevo não são usados, para o texto passar por revisão junto com o código.
  - A API só põe o e-mail na fila nova `emails`; o worker envia, com 5 tentativas. Erro 4xx do Brevo (ou 5xx do SMTP) não repete.
  - O job leva o código em texto e sai do Redis assim que o envio dá certo. Se falhar, fica um dia para investigação.
- **Produção sem Brevo.** A API sobe com `EMAIL_PROVEDOR=fake` e avisa no log, sem o conteúdo. Por isso o merge não depende da chave do Brevo, que ficou em `BLOQUEIOS.md`.

Reversível: sim.

## 2026-10-10 — T-033 — Usuário, aparelhos, onboarding e config-app
Contexto: docs 04 (rede e onboarding), 05, 06, 09 e RN-024. Decisões:
- **Perfil.** `PATCH /me` muda nome, telefone e fuso. E-mail, senha e foto ficam fora: e-mail precisa de confirmação, senha tem o fluxo da T-031, e foto depende do upload para o S3 (T-037). Telefone novo perde a verificação, porque a ligação de lembrete só vai para número verificado (RN-078). O perfil diz se há senha e quais logins sociais estão ligados, para o app montar a tela de conta.
- **Token de push.** Fica no aparelho da sessão (`did` do token de acesso), e um token pertence a um aparelho só. Quando outra pessoa entra no mesmo celular e registra o token, ele sai do registro anterior. Encerrar a sessão (`sair`, `sair-todos`, reuso de token de renovação) também apaga o token, para quem saiu não receber notificação.
- **Onboarding.**
  - Usa a tabela `dicas_vistas`, sem migração, com marcas por chave.
  - Etapas provisórias até o design: `primeiro-lancamento`, `cartoes`, `orcamento`, `permissoes`, `tour`. Cada uma fica pendente, concluída ou dispensada; concluída vale mais que dispensada e nada volta a pendente.
  - O checklist aparece enquanto houver etapa pendente (RN-024). `concluido` é o fim do fluxo inicial (`onboarding_concluido`), que decide se o app abre nas abas (doc 04).
  - Outros módulos marcam etapas com `UsuariosService.concluirEtapa`.
- **Versão mínima.**
  - Guarda global com `X-App-Version` e `X-Platform` → 426 `VERSAO_APP_DESATUALIZADA`. Sem cabeçalho não bloqueia.
  - As mínimas vêm do ambiente (`APP_VERSAO_MINIMA_IOS`, `APP_VERSAO_MINIMA_ANDROID`, padrão `0.0.0`), até o painel admin editá-las (T-141, doc 13). Mudar exige novo deploy.
  - `config-app` e o health check respondem a qualquer versão.
- **`GET /config-app`** é público, porque o app consulta antes do login. `flags` vazio por enquanto. `sugestoesChat` com quatro sugestões provisórias até a Mony (T-060).
## 2026-10-10 — T-032 — Login social Google e Apple
Contexto: RN-002 e docs 02, 05, 10 e 11. Decisões:
- **Rotas.**
  - `POST /v1/auth/social` (pública) entra ou cria a conta.
  - `POST /v1/auth/social/vincular` (logada) liga o Google ou a Apple à conta atual. É uma proposta nossa; o doc 05 previa só `/auth/social`.
  - O app segue pelos códigos de erro: `CADASTRO_INCOMPLETO` (novo, 422, com `detalhes.faltando`) e `VINCULO_SOCIAL_PENDENTE` (409). Nos dois casos chama de novo com o mesmo token.
- **RN-002 (vínculo).** E-mail de conta existente não entra direto: a pessoa entra com a senha ou recupera pelo código (T-031) e depois vincula. Assim ninguém toma a conta de outro criando um login social com o mesmo e-mail. Conta nova exige e-mail confirmado no provedor. O vínculo aceita qualquer conta Google ou Apple da pessoa logada; uma já ligada a outro usuário dá `CONFLITO`.
- **Conta nova** segue o cadastro: nome, telefone e aceites obrigatórios (RN-001, RN-007), sem senha (`senha_hash` nulo), com teste de 3 dias e padrões (RN-006).
  - O nome vem do token (Google) ou do app (a Apple só o entrega ao app, no primeiro login).
  - Telefone obrigatório também aqui, porque a RN-001 não faz exceção. **Confirmar com o cliente** se o login social pode pular o telefone.
- **Conferência do token** com `jose`:
  - chaves remotas do provedor, só RS256, emissor, audiência pelos IDs de cliente do ambiente (`GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`) e validade com 60 s de tolerância;
  - provedor sem ID configurado → 503; chaves fora do ar → 503; token ruim → 401 `CREDENCIAIS_INVALIDAS`.
- **Nonce.** Obrigatório com a Apple: o token traz o SHA-256 do valor que o app gerou, que a API confere. Com o Google é conferido quando o token traz um, porque o SDK nem sempre aceita nonce.
- **Repetição.** Cada `id_token` vale uma vez: o resumo dele fica marcado no Redis até vencer (`LimiteTentativas.usarUmaVez`). O token só é gasto quando o pedido dá certo. Limite de 20 chamadas por IP a cada 15 minutos.
- **Testes.** Google e Apple de mentira com um par RSA local (`test/provedor-social-falso.ts`); a conferência é a mesma de produção.
- **`config-app`.** `flags.loginGoogle` e `flags.loginApple` dizem se o provedor está configurado, para o app esconder o botão de quem não está.
- **Humano.** Falta criar os clientes OAuth e ativar o Sign in with Apple em nome do cliente (BLOQUEIOS). Por isso o PR fica com `aguardando-humano`.

Reversível: sim.

## 2026-10-10 — T-035 — Categorias
Contexto: RN-065, RN-066, doc 05. Decisões:
- **Escopo.** A T-035 pedia API e app. As telas precisam do esqueleto do app (T-010, aguardando merge), do design system (T-011) e da sessão no app (T-034). Por isso a T-035 entregou a API, e as telas de categorias e contas viraram a T-049. A T-036 segue o mesmo caminho.
- **Nome único** por usuário e tipo, comparado sem diferença de maiúsculas e de espaços repetidos; acento conta ("Saúde" ≠ "Saude"). Vale só entre categorias ativas: excluir libera o nome. Sem índice único no banco por causa da exclusão lógica. A garantia vem de travar as categorias do usuário naquele tipo (`SELECT … FOR UPDATE`) antes de conferir, o que também impede duas exclusões simultâneas de apagarem as duas últimas de um tipo.
- **Edição.** Muda nome, cor e ícone; o tipo não muda, porque os lançamentos de uma categoria são de um tipo só. Categorias padrão podem ser editadas e excluídas como as outras.
- **Exclusão (RN-066).**
  - `?mover_para=` segue o doc 05.
  - Movem para a categoria escolhida, que precisa ser do mesmo tipo: transações (inclusive as excluídas, para nenhuma apontar para categoria excluída), recorrências, parcelamentos e preferências aprendidas.
  - Orçamentos da categoria são apagados.
  - Sem lançamentos, o destino é dispensável. Com lançamentos e sem destino, 400 com `detalhes.lancamentos`, para o app pedir a escolha.
  - A última categoria de um tipo fica (`ULTIMA_CATEGORIA_DO_TIPO`).
- **Lista** sem paginação (`{ itens }`), porque são poucas por usuário.
- **Formato.** Cor em `#RRGGBB`; ícone como chave (`pet-shop`) que o app mapeia para o design system.
- **Services com `Contexto`.** Os Services de domínio financeiro recebem o `Contexto` (doc 05), com `usuarioDoContexto` para exigir alguém logado.
## 2026-10-10 — T-039 — Regras puras de cartão e fatura
Contexto: RN-031 a RN-035, RN-038 e doc 05 ("cálculos são funções puras em `dominio/`"). Decisões:
- **Onde ficam.** Em `@mony/shared/cartoes`, e não em `modulos/cartoes/dominio/` da API. São funções sem banco nem relógio, e o app e a Mony também vão precisar delas, por exemplo para mostrar em qual fatura uma compra vai entrar antes de gravar. A API (T-040) chama as mesmas.
- **RN-031.** O "vencimento no mês seguinte" compara os dias configurados (vencimento ≤ fechamento), não os dias já ajustados ao mês. Assim um cartão que fecha dia 31 e vence dia 8 tem sempre o mesmo intervalo, também em fevereiro. Com o fechamento no dia 30 e o vencimento no 31, em fevereiro os dois caem no último dia; é o único caso em que vencimento e fechamento coincidem.
- **RN-033.** Valem as regras abaixo; a rotina diária (T-047) só aplica `statusDaFatura` com o "hoje" do fuso do usuário.
  - Antes do fechamento a fatura é sempre `aberta`, mesmo paga adiantado, porque ainda recebe compras.
  - Fatura fechada sem compras (total zero) é `paga`, para não aparecer como atrasada.
  - O vencimento é o último dia sem atraso: `atrasada` só a partir do dia seguinte.
- **RN-034.** Pagamento a mais não aumenta o limite. O percentual usado é inteiro e arredondado para baixo, e chega a 0 quando o limite total é zero.
- **Fim de semana.** `venceNoFimDeSemana` só informa (RN-032). Feriados ficam de fora, porque dependem da cidade.
- **Testes exaustivos.** Os 961 pares de fechamento e vencimento são testados em todas as datas de dez/2027 a mar/2028, que inclui fevereiro bissexto e virada de ano. Confere:
  - a compra é anterior ao fechamento da fatura dela e não anterior ao da fatura de antes;
  - a competência é o mês do vencimento;
  - `faturaDaCompetencia` reconstrói as mesmas datas;
  - compras mais novas não voltam para faturas mais antigas;
  - faturas seguidas não pulam nem repetem competência.

Reversível: sim.

## 2026-10-10 — T-036 — Contas
Contexto: tabela `contas` do doc 06; rotas propostas no doc 05; sem regra de negócio própria. Decisões:
- **Escopo.** Só a API; as telas ficam na T-049, como na T-035.
- **Saldo atual calculado na leitura:** saldo inicial + receitas pagas − despesas pagas da conta, sem as excluídas. Pendentes ficam fora, como no saldo do Início (RN-020). Pagamento de fatura e transferência entram, porque o dinheiro sai da conta. Não há coluna de saldo para manter em dia. A soma usa o índice `transacoes(conta_id)`, que já existe.
- **Excluir apaga a conta** (a tabela não tem exclusão lógica): os lançamentos continuam, sem conta (`SET NULL`, que o schema já define).
- **Open Finance.** Conta conectada só muda o nome e não sai por esta rota, mesma ideia da RN-045 para transações; quem tira é a desconexão do banco (T-120).
- **Sem nome único**, porque duas contas no mesmo banco podem ter o mesmo nome.

Reversível: sim.

## 2026-10-10 — T-037 — Transações e anexos
Contexto: RN-040 a RN-047, docs 05, 06 e 11. Decisões:
- **Escopo.** Lançamentos sem cartão. Compra no cartão de crédito é recusada até a T-040, que liga a compra à fatura certa (RN-031). Lançamentos de cartão, parcelamento e pagamento de fatura (criados pelas T-040 a T-042) só mudam categoria, descrição, observação e anexos por estas rotas, e não são excluídos por elas, para não deixar fatura e limite errados. Recorrências (T-038) também ficam fora.
- **Resposta `{ transacao, impacto }`** desde já, como pede o doc 05. `impacto` vem vazio até orçamentos (T-043) e cartões (T-040), sem quebrar o contrato depois.
- **Totais (RN-047).** Receitas, despesas (só natureza `normal`, RN-037), saldo = receitas − despesas, despesas pagas e pendentes, quantidade. "Pagas" e "pendentes" do PDF foram lidas como despesas pagas e pendentes, como no Início (RN-020).
- **Paginação** por cursor opaco (data e id da última linha, em base64url). Página de até 100.
- **Busca** com `ILIKE` em descrição e observação, sem índice GIN: a busca precisa achar pedaços de palavra ("uber" em "Uber centro"), o que o `to_tsvector` não faz. Ela já roda sobre as linhas de um usuário. Se pesar, a saída é `pg_trgm` (doc 06 atualizado).
- **Idempotência** obrigatória no `POST /transacoes` (doc 05). O lote não cria registro, então não exige chave.
- **RN-045.** Do Open Finance mudam categoria, descrição, observação e anexos. Qualquer outro campo → `TRANSACAO_OPEN_FINANCE_BLOQUEADA`. Excluir é permitido; reimportar não duplica, por causa do índice único de `id_externo`.
- **RN-044.** Lote de até 200, tudo ou nada: um id que não existe ou é de outro usuário (404), um lançamento preso a outro fluxo (409) ou tipos misturados com uma categoria (400) cancelam o lote inteiro.
- **Efeitos.** O primeiro lançamento conclui a etapa `primeiro-lancamento` do onboarding (T-033). Cada gravação publica `transacao.registrada` na fila de eventos, com id único, para os alertas e as preferências aprendidas (T-080, T-063).
- **Anexos.**
  - O app pede `POST /arquivos` (tipo, `content-type` e tamanho até 10 MB) e recebe a URL de `PUT` assinada (5 min) e o id. O `content-type` entra na assinatura.
  - O arquivo vai direto ao S3. Na transação, `anexoIds` liga o anexo: a API confere no S3 que ele chegou e o tamanho real, que fica gravado. Se passou de 10 MB, o arquivo é apagado e o pedido recusado.
  - A chave é `usuarios/<usuarioId>/anexos/<uuid aleatório>.<extensão>` (doc 11) e não revela o id do anexo. A leitura é por URL de 15 min.
  - Anexo solto (enviado e nunca ligado, ou tirado da lista) fica para a limpeza de retenção (RN-162, T-140).
- **S3.** `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` na mesma versão exata (3.1146.0), porque os dois andam juntos.
  - Configuração: `S3_BUCKET`, `AWS_REGION` e, só no local, `S3_ENDPOINT` (SeaweedFS do `docker compose`, endereço por caminho). Credenciais pela cadeia padrão da AWS: papel da tarefa no ECS, variáveis no local.
  - Sem `S3_BUCKET`, as rotas de arquivo respondem 503 e o resto da API sobe normalmente.
  - Nos testes, um armazenamento em memória faz o papel do app enviando o arquivo.

Reversível: sim.

## 2026-10-10 — T-038 — Recorrências e rotina de materialização
Contexto: RN-043, docs 05, 06 e 09. Decisões:
- **Agenda.** `dia` é o dia do mês (mensal e anual) ou da semana (semanal, 0 = domingo); sem ele, vale o da data de início. A `k`-ésima data é sempre calculada a partir do início, para que 31 vire 28/02 e volte a 31/03. A regra é pura (`ocorrenciasEntre`, `proximaOcorrencia` em `@mony/shared/recorrencias`), para o app mostrar as próximas datas.
- **Materialização.** Ocorrências da data do ponteiro até hoje + 35 dias, no fuso do usuário, todas `pendente` (RN-043), inclusive as de datas que já passaram, quando a recorrência começa no passado. O começo pode ser no máximo um ano para trás, para não gerar centenas de lançamentos de uma vez. Na criação, as ocorrências já saem na resposta.
- **Ponteiro.**
  - `proxima_geracao` aponta para a próxima data da agenda ainda não gerada, mesmo depois da data final; `ativa` diz se ela ainda vale.
  - Assim, estender a data final retoma de onde parou, e uma ocorrência excluída nunca volta: o ponteiro já passou dela.
  - Rotina e rotas travam a recorrência com `FOR UPDATE`, então uma edição e a rotina ao mesmo tempo não geram em dobro.
- **Rotina de hora em hora (`30 * * * *`),** e não uma vez por dia às 00:30 como no doc 09.
  - Rodar de novo não repete nada.
  - Cobre todos os fusos sem agendar por usuário.
  - A consulta só pega recorrências cujo ponteiro entrou na janela.
  - O doc 09 foi atualizado.
- **Infra de rotinas (`core/rotinas`).** `@Rotina({ nome, padrao })` num método de provider. O `ProcessadorRotinas` (só no worker) acha os métodos, cria os agendadores do BullMQ (`upsertJobScheduler`, cron no fuso de São Paulo) e chama a rotina com o `Clock`. As próximas rotinas (T-047, T-080 etc.) seguem o mesmo caminho.
- **Edição (RN-043).** Modelo (descrição, valor, categoria, forma, conta) vale para as ocorrências de hoje em diante que estão pendentes e não foram editadas à mão. Mudar frequência ou dia exclui essas ocorrências livres e gera pela agenda nova a partir de hoje. Encurtar a data final exclui as livres depois dela.
- **Exclusão (RN-043).**
  - Na ocorrência, `DELETE /transacoes/:id?recorrencia=` aceita três escopos:
    - `esta` (padrão): só ela;
    - `proximas`: ela e as seguintes, pagas ou não, com a data final na véspera;
    - `todas`: todas as ocorrências, e a recorrência para.
  - `DELETE /recorrencias/:id` para a recorrência e tira as livres de hoje em diante; passadas e editadas ficam.
  - A recorrência fica no banco, inativa: não há exclusão lógica em `recorrencias`.
- **Cartão.** Recorrência no cartão de crédito é recusada até a T-040, como as transações.

Reversível: sim.

## 2026-10-10 — T-040 — Cartões e faturas
Contexto: RN-030 a RN-035, RN-038 e RN-046, docs 05, 06 e 07. As regras puras são as da T-039. Decisões:
- **Escopo.** Só a API. As telas ficam na T-050 (mesmo motivo da T-049), a recorrência no cartão na T-051, o pagamento da fatura na T-041, a rotina que fecha faturas e marca atrasos na T-047 e a cota de 1 cartão do plano gratuito na T-100.
- **Compra pelo `POST /transacoes`.** Não há rota própria: `formaPagamento: 'cartao_credito'` com `cartaoId`. App e Mony usam a mesma entrada.
  - A compra é sempre despesa. Estorno no cartão fica para quando o Open Finance trouxer (T-120).
  - Não tem `contaId`: quando a T-041 pagar a fatura e marcar as compras como pagas, elas não podem sair de novo do saldo da conta, porque o pagamento já sai.
  - Fica `pendente` até a fatura ser paga (RN-042); pedir `pago` dá 400.
  - As regras ficam em `problemasDaCompraNoCartao` (`@mony/shared/transacoes`), usadas pelo esquema e pelo Service.
- **Fatura sob demanda.** A fatura de uma competência nasce com a primeira compra. A fatura atual do cartão vem com `id: null` enquanto não existe.
- **Mudar os dias** vale para as faturas que ainda não existem; as criadas mantêm as datas, como o banco faz ao trocar o vencimento. A compra entra na fatura da competência calculada. Se essa fatura já existe e fechou antes da data da compra, a compra vai para a seguinte (`faturaDestino`).
- **Total refeito pela soma.** A cada compra que entra, muda ou sai, o total da fatura é a soma das compras não excluídas, e não o total antigo mais a diferença. Assim um erro nunca se acumula. O status gravado é refeito junto.
- **Trava.** Todo fluxo que mexe em fatura trava o cartão (`FOR UPDATE`) e depois as faturas, sempre em ordem de id. Doze compras ao mesmo tempo no mesmo cartão somam certo (teste de integração). A T-041 deve seguir a mesma ordem: cartão, depois fatura.
- **Fatura quitada** = tem pagamento e o pago cobre o total.
  - Compra nela não entra, não muda valor, data, cartão nem forma, e não sai: 409 `TRANSACAO_EM_FATURA_PAGA` (RN-046). Descrição, categoria, observação e anexos continuam mudando.
  - Fatura fechada e sem pagamento ainda aceita compra com data antiga, para o usuário acertar com o extrato.
  - Fatura zerada não conta como quitada.
- **Status na leitura.** A resposta calcula o status no "hoje" do usuário com `statusDaFatura`, então já sai certo antes da rotina da T-047. A coluna também é gravada a cada mudança.
- **Sair do cartão.** Ao mudar a forma de pagamento para outra, a compra sai da fatura e, se o status não veio, ganha o padrão da RN-042.
- **Recorrência.** Ocorrência de recorrência não pode ir para o cartão até a T-051, porque editar ou excluir a recorrência ainda não refaz faturas.
- **Exclusão do cartão** é lógica.
  - Com saldo em aberto em qualquer fatura, inclusive compra futura, dá 409 com o saldo: as compras ficariam pendentes para sempre. Paga-se a fatura (T-041) ou excluem-se as compras antes.
  - Sem saldo, o cartão some das listas, e as faturas dele também.
  - Cartão do Open Finance só sai desconectando o banco. Ele também só muda nome, cor, faixas e conta de pagamento (RN-039).
- **Cadastro.**
  - Bandeira de uma lista (`BANDEIRAS_CARTAO`: visa, mastercard, elo, amex, hipercard, diners, outra), para o app escolher o ícone. A resposta aceita qualquer texto, por causa do Open Finance.
  - O limite é de pelo menos 1 centavo.
  - Até 5 faixas de alerta, de 1% a 100%, gravadas em ordem e sem repetição. Lista vazia desliga os alertas do cartão.
  - O primeiro cartão conclui a etapa `cartoes` do onboarding.
- **`impacto.cartao`** traz o percentual do limite usado depois da compra (doc 05). O alerta de faixa (RN-038, RN-102) fica com o motor de alertas (T-080), a partir do evento `transacao.registrada`.

Reversível: sim.

## 2026-10-10 — T-041 — Pagar fatura
Contexto: RN-036 e RN-037, no padrão documentado. As duas estão marcadas "confirmar com cliente" no doc 15, mas a tarefa não muda o padrão. Decisões:
- **`POST /faturas/:id/pagar`, tudo opcional.** O [Paguei] da notificação (doc 09) paga com um toque.
  - Sem valor, paga o saldo; acima do saldo dá 400 (não há crédito para a fatura seguinte); sem saldo, 409.
  - Sem data, hoje. Data futura dá 400: o pagamento é registro do que aconteceu, e agendar pagamento não está na especificação.
  - Sem conta, vale a conta de pagamento do cartão; `null` grava sem conta, e então nenhum saldo de conta muda.
  - A forma é opcional e não pode ser o próprio cartão.
  - `Idempotency-Key` obrigatória (doc 05).
- **Categoria do pagamento.** A transação precisa de categoria (coluna obrigatória), mas o pagamento não entra em totais por categoria (RN-037). Sem escolha, vale a "Contas" padrão do cadastro; se ela foi excluída, a categoria de despesa mais antiga. Sempre sobra uma, pela RN-066.
- **Pago refeito pela soma.** O valor pago da fatura é a soma das transações `pagamento_fatura` não excluídas dela, como o total é a soma das compras (T-040). Assim pagar é gravar a transação e refazer as somas, e desfazer é excluí-la e refazer.
- **Desfazer = excluir o pagamento** por `DELETE /transacoes/:id` (também no lote). O pago, o status e as compras voltam. Valor e data do pagamento não mudam por `PATCH`: exclui-se e paga-se de novo. Desfazer pagamento de cartão excluído dá 404, para não reabrir saldo num cartão que saiu.
- **Compras seguem a fatura (RN-037).** Quitada, todas as compras dela ficam `pago`; senão, `pendente`. Isso é refeito a cada mudança, então nunca há fatura quitada com compra pendente, nem o contrário.
- **Pagamento antecipado.** Pagar fatura ainda aberta é permitido, porque muita gente antecipa para liberar limite. A regra da T-040 para compra nova mudou: só fatura **fechada** e quitada recusa a compra. Aberta e já paga recebe a compra, que vira saldo, e as compras voltam a pendentes. Compra de fatura quitada continua sem mudar valor e data nem sair, aberta ou fechada.
- **Detalhe da fatura.** `GET /faturas/:id` separa `transacoes` (compras) de `pagamentos`.
- **Trava.** Cartão, depois fatura, como na T-040. Três pagamentos ao mesmo tempo da mesma fatura: um passa e os outros recebem 409 (teste de integração).
- **Evento `fatura.paga`** (com `faturaId` e `transacaoId`) para o motor de alertas (T-080), que vai encerrar o aviso de fatura atrasada.

Reversível: sim.

## 2026-10-10 — T-042 — Parcelamentos e dívidas
Contexto: RN-050 a RN-055, docs 05, 06 e 07. Decisões:
- **Price com o saldo exato.** O doc 07 pede a conta em decimal, arredondando no fim de cada parcela, com a diferença na última.
  - Se o saldo também fosse arredondado a cada mês, o erro de meio centavo cresceria com os juros. Em 360 meses a 1%, isso chega a R$ 17 de diferença na última parcela.
  - Então o saldo segue exato em decimal (`decimal.js`, 200 dígitos), e só juros e parcela saem em centavos. A última amortiza o que falta, e a diferença nela é de no máximo um centavo por parcela.
  - Amortização menor que um centavo nunca fica negativa.
  - O teste sorteia 1.500 combinações de valor, prazo (até 480) e taxa (até 15% a.m.), além do extremo de 100% a.m. em 480 meses.
- **Funções puras no `@mony/shared`** (`valoresDasParcelas`, `tabelaPrice`, `vencimentoDaParcela`, `statusDaParcela`, `statusDoParcelamento`), para o app simular sem chamar a API. `decimal.js` entrou como dependência do `@mony/shared` (já estava no lockfile, pelo Prisma).
- **Taxa** em % ao mês com até 4 casas (`2.99`), de 0 a 100%. Zero é sem juros. O banco guarda a fração com 6 casas, como no doc 06.
- **De 2 a 480 parcelas**: uma parcela só é uma despesa pendente comum; 480 meses é o prazo de um financiamento de imóvel.
- **Despesa de cada parcela:** "Nome (k/n)", pendente, ligada à parcela nos dois sentidos.
  - Dívida: data = vencimento, conta e forma opcionais (forma padrão boleto, porque despesa precisa de forma, RN-041).
  - Cartão: data da compra + (k − 1) meses, para cada mês ter a sua parcela no Início. A fatura segue a regra do RN-051: a parcela `k` cai na competência da primeira + (k − 1), e não a fatura da data da despesa. O vencimento da parcela é o da fatura.
- **Parcela de cartão segue a fatura.** O recálculo da fatura (T-041) também marca as parcelas: quitada → pagas, senão → pendentes. Fatura fechada e quitada recusa a parcela, e nada é gravado.
- **Status calculado na leitura** (parcela `atrasado`, parcelamento `atrasada`/`quitada`), no "hoje" do usuário, como o das faturas. O banco guarda `cancelada` e o `quitada` das dívidas; as marcações diárias ficam com a T-047.
- **Cancelar** (`DELETE`, RN-054) tira as parcelas não pagas ainda futuras: na dívida, as que vencem depois de hoje; no cartão, as de faturas ainda abertas. Elas são apagadas e as despesas delas, excluídas logicamente. Assim o parcelamento mostra só o que continua devido. Não há outra forma de apagar parcelamento: lançado por engano hoje, ele cancela inteiro, porque tudo é futuro.
- **Pagar ou desfazer parcela** já paga, ou já pendente, devolve o estado atual (200), em vez de erro, para o toque duplo do app.
- **Edição** só de nome, categoria e observação. Nome e categoria vão para as despesas. Valores e datas mudam cancelando e lançando de novo.

Reversível: sim.

## 2026-10-10 — T-043 — Orçamentos e metas
Contexto: RN-060 a RN-063, docs 05, 06 e 09. Decisões:
- **Escopo.** Só a API; as telas ficam na T-052 (mesmo motivo da T-049).
- **Gasto calculado na leitura**, sem coluna de gasto. É a soma das despesas `normal` da categoria com data no mês, pagas e pendentes, sem as excluídas (RN-061). Compra no cartão conta na data da compra, como no Início (RN-020), e cada parcela no mês da sua despesa (T-042).
- **Projeção (RN-061).** No mês corrente, gasto até hoje ÷ dias decorridos × dias do mês, mais o que já está lançado para depois de hoje pelo valor certo (recorrências, parcelas, compras futuras, como o doc 07 pede para as recorrências). Mês passado ou futuro: o que está lançado. A regra é pura (`projecaoDoMes`), para o app.
- **`PUT /orcamentos` é criar ou mudar** a categoria na competência (`ON CONFLICT`), sem competência = mês de hoje do usuário. Orçamento novo repete todo mês por padrão, porque é o uso comum; `repetirMensal: false` desliga. `DELETE /orcamentos/:id` entrou, porque o doc 05 não tinha como tirar um orçamento.
- **Rotina `repetir-orcamentos`** no dia 1, às 00:15 de São Paulo, como no doc 09, e só nesse dia.
  - Ela copia do mês anterior os que repetem, de categorias que ainda existem, em lotes, sem mexer no que já existe no mês novo.
  - Se rodasse todo dia, recriaria um orçamento que o usuário tirou do mês. Tirar o orçamento do mês também para a repetição.
  - O mês é o de São Paulo: em outros fusos a cópia pode chegar algumas horas antes ou depois da virada do mês local, o que não muda o gasto.
- **`impacto.orcamento`** em `POST` e `PATCH /transacoes` de despesa `normal` cuja categoria tem orçamento no mês da data. O alerta de 80% e 100% (RN-102) fica com o motor de alertas (T-080).
- **Metas.**
  - O valor atual é a soma dos aportes, refeita com a meta travada: dez aportes ao mesmo tempo somam certo (teste).
  - O aporte é positivo e não tem data futura.
  - `DELETE /metas/:id/aportes/:aporteId` desfaz aporte lançado por engano.
  - `sugerirConclusao` vem só no aporte que fez a meta chegar ao alvo, se ela não estiver concluída; a Mony usa para perguntar (RN-063).
  - A meta pode ser concluída ou reaberta a qualquer momento.
  - Aporte não gera transação nem mexe em conta: o PDF não pede, e mexer no saldo pediria escolher conta de origem e destino.

Reversível: sim.
