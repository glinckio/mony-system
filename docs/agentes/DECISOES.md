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
- **Infra.** O `ecs.tf` da T-013 lê `JWT_CHAVE_PRIVADA` do segredo `mony/<ambiente>/app`.

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

## 2026-10-10 — T-044 — Início (dashboard)
Contexto: RN-020 a RN-024, docs 04 e 05. Decisões:
- **Escopo.** Só a API (`GET /dashboard`); a tela fica na T-053, pelo mesmo motivo da T-049. O modo privacidade (RN-022) é só do aparelho e não passa pela API.
- **Uma chamada com tudo** que a tela abre (doc 04): resumo do período, próximos vencimentos, cartões, orçamentos e checklist. Cartões, orçamentos e checklist vêm dos mesmos Services das rotas deles, no mesmo formato, para o app reaproveitar os componentes.
- **Período (RN-021):** `mes_atual` (padrão), `mes_anterior` ou `personalizado` com `de` e `ate`, de até 366 dias, no dia de hoje do usuário. A regra é pura (`periodoDoDashboard`). Os orçamentos são os do mês em que o período começa.
- **Resumo (RN-020).** Saldo = receitas pagas − despesas pagas, como o doc 07 decidiu (falta o cliente confirmar). "Total de receitas" virou as receitas do período, recebidas ou não, e vai junto o total das recebidas. As despesas são só as de natureza `normal` (RN-037), e a compra no cartão conta na data da compra, pendente até a fatura ser paga.
- **Próximos vencimentos (RN-023).**
  - Entram faturas com saldo (pelo que falta pagar), parcelas de dívida não pagas e contas pendentes (despesas sem cartão e sem parcelamento: boletos, recorrências).
  - Parcela de cartão fica de fora, porque já está na fatura e contaria duas vezes.
  - Além dos 30 dias à frente do doc 07, entram os atrasados de até 30 dias, com `atrasado: true`, para uma conta vencida ontem não sumir da tela. Mais antigos que isso ficam para a lista de transações.
  - Ordenados por data, até 50 itens. Receitas pendentes não entram: são "contas a pagar".

Reversível: sim.

## 2026-10-10 — T-047 — Rotinas de faturas e atrasos
Contexto: doc 09 (Rotinas). O status de fatura, parcela e parcelamento já é calculado na leitura, no dia do usuário (T-040 a T-042). As rotinas gravam as transições e avisam os alertas. Decisões:
- **De hora em hora**, e não uma vez às 00:45 e 01:00 como no doc 09.
  - `atualizar-faturas` roda no minuto 45 e `marcar-atrasos` no minuto 0. É a mesma escolha da T-038: assim cada usuário é visto logo depois da virada do dia no fuso dele.
  - A consulta pega as candidatas pelo "hoje" mais adiantado do mundo (Kiritimati, UTC+14), e cada uma é decidida pelo fuso do seu usuário.
  - O doc 09 foi atualizado.
- **Troca só se o status ainda é o lido** (`UPDATE … WHERE status = antigo`): sem trava. Se um pagamento mudou a fatura no meio, a rotina perde e não avisa nada errado. Rodar de novo não repete troca nem evento.
- **Eventos para o motor de alertas (T-080):**
  - `fatura.fechada` quando a fatura fecha com valor;
  - `fatura.atrasada` quando vence sem o total pago;
  - `parcela.atrasada` só para dívida, porque a parcela de cartão já está no atraso da fatura.
  - Cada um tem id único por fatura ou parcela, para não sair duas vezes.
- **Parcelamento.** O status guardado é refeito para os parcelamentos que ganharam parcela atrasada e para os que estavam atrasados. Assim a parcela de cartão paga pela fatura tira o atraso na rodada seguinte. A fatura que ainda não fechou continua `aberta`; nada mais muda de status só com o tempo.
- **T-046** ganhou as dependências T-011 e T-034 no BACKLOG: é tarefa do app e parecia livre só por depender da T-044.

Reversível: sim.

## 2026-10-10 — T-048 — Relatórios
Contexto: RN-150, doc 05 (`GET /relatorios/:tipo?inicio=&fim=`). Decisões:
- **Escopo.** Só a API e sem exportação (RN-151 tem tarefa própria). As telas ficam na T-054, pelo mesmo motivo da T-049. O histórico de preços da NFC-e fica com a T-066, que lê as notas. O limite do gratuito (só o mês atual, RN-120) fica com a T-100.
- **Uma rota por tipo** (`/relatorios/mensal`, `anual`, `categorias`, `dias-da-semana`, `cartoes`, `formas-pagamento`) em vez de um `:tipo` com resposta variável: cada uma tem o seu contrato no OpenAPI e no cliente gerado, e o caminho continua sendo o do doc 05.
- **O que conta.** Lançamentos pagos e pendentes (competência, como no Início e nos orçamentos), sem os excluídos, só de natureza `normal`. Compra no cartão conta na data da compra, e cada parcela no mês da sua despesa.
- **Período.** Sem `inicio` e `fim`, os últimos 12 meses com o atual inteiro; com eles, até 5 anos. Os meses e anos sem lançamento vêm zerados, para o gráfico não pular.
- **"Evolução anual"** foi lida como receitas × despesas por ano. A evolução mês a mês dentro do ano é o relatório mensal com o saldo acumulado.
- **SQL só onde o Prisma não agrupa** (mês, ano e dia da semana): `$queryRaw` com parâmetros e `excluido_em IS NULL` explícito, porque a extensão de exclusão lógica não alcança SQL. As outras somas são `groupBy`.
- **Nome de categoria e cartão excluídos** continua aparecendo, porque o histórico ainda os usa.

Reversível: sim.

## 2026-10-10 — T-051 — Recorrência no cartão de crédito
Contexto: RN-043 e RN-031, assinaturas pagas no cartão. Decisões:
- **Mesmas regras da compra no cartão.** A recorrência leva `cartaoId`, é despesa e não tem conta (`problemasDaCompraNoCartao`). Cada ocorrência entra na fatura da sua data, pendente, e as faturas tocadas são refeitas pela soma (T-040).
- **Ordem da trava: recorrência → cartão → fatura.** A rotina e as rotas já travavam a recorrência (T-038); os fluxos de fatura começam pelo cartão (T-040). Ninguém trava na ordem inversa.
- **Mudar o modelo não gera de novo.** Valor, descrição, categoria e forma valem para as ocorrências livres (pendentes e não editadas, de hoje em diante), como na T-038. Ao mudar de cartão ou sair dele, cada livre muda de fatura no próprio lugar.
  - Gerar de novo traria de volta a ocorrência que o usuário excluiu e repetiria a data da editada à mão.
  - Mudar a agenda (frequência ou dia) continua refazendo as livres, como na T-038. A geração agora pula a data que já tem ocorrência, o que também corrige a repetição com a editada à mão na T-038.
- **Exclusão.** "Esta e as próximas" e "todas" excluem as ocorrências pagas ou não, menos a paga pela fatura do cartão: compra de fatura quitada não sai (RN-046). Parar a recorrência tira as livres de hoje em diante e refaz as faturas.
- **Cartão excluído para as recorrências dele.** Na rotina, a recorrência de cartão que saiu para em vez de gerar fora de fatura. Um erro numa recorrência (ex.: fatura de data passada já paga) não para a rotina para as outras: fica no log.
- **Ocorrência para o cartão.** Uma ocorrência pode ir para o cartão por `PATCH /transacoes/:id`: vira editada à mão e entra na fatura, como qualquer compra. A trava da T-040 que impedia isso saiu.

Reversível: sim.

## 2026-10-10 — T-080 — Motor de alertas e central de notificações
Contexto: RN-100 a RN-105, doc 09. O push é a T-081 e os avaliadores de cada alerta, a T-082. Decisões:
- **O motor é a porta única.** Os avaliadores chamam `MotorAlertas.emitir(candidatos, agora)`; o motor filtra, grava na central e envia. O candidato é o do doc 09, sem `acoes`: a ação do botão sai da categoria do tipo no push (doc 09), e o id da tela vem no `linkInterno`.
- **Ordem dos filtros:** tipo desligado → cota de consultoria → chave única → silêncio. A chave única é a do banco (`ON CONFLICT DO NOTHING`), então dois eventos iguais ao mesmo tempo gravam uma notificação só.
- **Cota de consultoria (RN-103):** 3 por dia do usuário (no fuso dele), contando `gasto_fora_padrao` e `projecao_mes`. Dois eventos de consultoria ao mesmo tempo podem passar um da cota; o custo de travar o usuário não compensa.
- **Silêncio (RN-101).**
  - A tabela guarda início e fim em cada linha de preferência, mas o PDF fala de um horário de silêncio só. A API trata como um horário do usuário, gravado em todas as linhas, para todos os tipos não urgentes.
  - A janela pode passar da meia-noite (22:00 às 07:00); o início conta e o fim não; início igual ao fim é sem silêncio.
  - O alerta adiado já aparece na central, sem `enviadaEm`. A rotina `liberar-silencio`, a cada 15 minutos, manda os de quem saiu do silêncio, num envio agrupado se forem mais de 3.
- **Urgente ignora o silêncio**, como manda a coluna "Urgente" do doc 09: fatura atrasada, lembrete, compromisso e assinatura.
- **Canal de envio trocável** (`EnvioNotificacoes`). Por enquanto só registra no log; a T-081 troca pelo Expo Push sem mexer no motor.
- **Central:**
  - lista por cursor, filtros por tipo e não lidas, total de não lidas;
  - marcar uma ou todas como lidas (`POST /notificacoes/lidas` entrou além do doc 05, para o "marcar todas");
  - o contador também sai no `GET /dashboard`, como o doc 09 pede.
- **Preferências:** `GET` e `PUT /preferencias-alerta`. Tipo sem linha conta como ligado. Assinatura não desliga (400). Antecedência de 0 a 30 dias.

Reversível: sim.

## 2026-10-10 — T-081 — Push pelo Expo
Contexto: doc 09 ("Envio de push") e doc 10. O app ainda não tem esqueleto (T-010), então a parte do aparelho foi para a T-088. Decisões:
- **Fila no meio.** O motor chama `EnvioPush`, que só põe o envio na fila `notificacoes`; o worker manda (`ProcessadorNotificacoes`), com 5 tentativas. O motor e as rotas não esperam o Expo, e uma queda do Expo não perde o alerta, que já está na central.
- **Um push por aparelho ativo com token.** A mensagem leva `linkInterno`, `notificacaoId` e `tipo` em `dados`, a categoria de ação do tipo e o canal do Android do tipo (`CATEGORIAS_ACAO` e `canalDoPush` no `@mony/shared`, para o app usar os mesmos nomes). O envio agrupado do fim do silêncio abre a central (`mony://notificacoes`).
- **Token recusado sai, só se ainda for o mesmo.** `DeviceNotRegistered`, no ticket ou no recibo conferido 15 minutos depois (o Expo pede uns 15 minutos e guarda por 24 h), apaga o token e põe `ativo = false`. A troca compara o token, para não apagar um token novo que o aparelho registrou no meio-tempo. O `ativo` volta a `true` quando o app registra de novo (T-033).
- **Erros.** 4xx do Expo (menos 429) não repete; 429, 5xx e falha de rede repetem com espera exponencial. Outros erros de ticket (`MessageTooBig`, `InvalidCredentials`…) ficam no log, só com o código (a mensagem do Expo pode trazer o token). Depois que o push saiu, uma falha ao tirar token ou ao agendar os recibos só vai para o log: repetir o job mandaria o push de novo.
- **Dados no Redis.** O job leva título e corpo, que têm valores: fica uma hora depois de enviado, só para segurar o envio repetido (mesmo id), e um dia se falhar. Os e-mails saem na hora porque levam código de acesso; aqui a hora a mais evita push duplicado.
- **Provedor por ambiente** (`PUSH_PROVEDOR`): `fake` é o padrão e não envia, como o e-mail. O merge não depende das credenciais do FCM e do APNs, que ficaram em `BLOQUEIOS.md`. `EXPO_ACCESS_TOKEN` é opcional: só é exigido se a segurança de push for ligada no EAS.
- **Texto cortado** em 120 caracteres no título e 900 no corpo, com reticências, para caber no limite de 4 KiB do push com os dados.

Reversível: sim.

## 2026-10-10 — T-082 — Avaliadores dos alertas de dinheiro
Contexto: doc 09 (tipos de alerta e rotinas), RN-038, RN-062, RN-102, RN-106 a RN-108. Decisões:
- **Avaliadores só no worker** (`modulos/alertas`, importado pelo `WorkerModule`). Reagem aos eventos que já existiam (`transacao.registrada`, `parcelamento.registrado`, `fatura.fechada`, `fatura.atrasada`) e a um novo, `transacao.alterada`, que o `PATCH /transacoes/:id` publica quando muda tipo, valor, data, categoria, forma ou cartão (o doc 09 pede "transação criada/editada").
- **Repetição é com o motor.** Os avaliadores propõem sempre que a condição vale; a chave única (RN-102) segura o que já saiu. Por isso rodar o evento ou a rotina de novo não repete aviso.
- **Só a maior faixa atingida** (limite e orçamento): uma compra que leva o cartão de 40% a 85% avisa 80%, não 50% e 80% juntos.
- **Ciclo do limite pela competência** da fatura aberta hoje (`limite:<cartão>:2026-11:80`), em vez do id da fatura do exemplo do doc 07: é o mesmo ciclo (uma fatura por cartão e competência) e não depende de a fatura já existir no banco.
- **Orçamento só do mês de hoje.** Lançamento com data de outro mês muda o orçamento daquele mês, mas não avisa: o aviso é sobre o mês que o usuário está vivendo.
- **RN-106:** média das despesas da categoria (pagas e pendentes, cartão e parcelas inclusive) nos 90 dias até a data do lançamento, sem ele. Só se avalia lançamento dos últimos 7 dias. Parâmetros em `PARAMETROS_FORA_DO_PADRAO` até o admin existir.
- **RN-107, a fórmula em números do sistema:**
  - saldo atual = soma das contas (saldo inicial + pago);
  - despesas pendentes do mês = contas pendentes sem cartão + parcelas de dívida + saldo das faturas que vencem no mês (a compra no cartão sai da conta pela fatura);
  - gasto variável = despesas pagas fora do cartão, sem recorrência e sem parcelamento, nos 30 dias antes de hoje, em média diária, vezes os dias que faltam no mês;
  - sem conta cadastrada, não há saldo e não há alerta;
  - "uma vez por semana" = semana ISO (`projecao:2026-W42`).
- **RN-108:** o aviso de antes sai no primeiro dia em que faltam de 1 a X dias (chave `…:<X>`), e o do dia no vencimento (`…:0`). Conta lançada já dentro do prazo também é avisada, e um dia sem rotina não perde o aviso. Antecedência 0 é só no dia. Itens: faturas com saldo, parcelas de dívida e contas pendentes (despesas sem cartão e sem parcelamento), como os próximos vencimentos do Início.
- **Rotina por fuso:** `alertas-diarios` roda de hora em hora (minuto 5) e avalia os usuários ativos em cujo fuso são 09:00, em lotes, com erro por usuário só no log.
- **Fora do escopo:** lançamentos em lote (Mony) e ocorrências de recorrência não publicam evento; entram nos avisos de vencimento, e o limite e o orçamento são reavaliados na próxima despesa. `parcela.atrasada` não tem tipo próprio no doc 09 e continua sem alerta.
- **Textos** em `modulos/alertas/textos.ts`, curtos e sem julgamento (RN-091). "Fatura do cartão <nome>", para não errar o gênero do nome do cartão.

Reversível: sim.

## 2026-10-09 — T-010 — Esqueleto do app Expo
Contexto: o doc 02 pede o SDK estável mais recente do Expo, travado, com dev client, Expo Router e EAS. Decisões: (1) **Expo SDK 57** (`expo` 57.0.27, React Native 0.86.3, React 19.2.3), com todas as dependências do app em versão exata. O SDK 58 está em beta desde 15/09/2026 (React Native 0.88 RC); a troca entra na tarefa anual de atualização do SDK. Mínimos do SDK 57: Android 7 (API 24) e iOS 16.4, como pede o doc 04. (2) pnpm com instalação isolada (suportada pelo Expo desde o SDK 54); o Metro do Expo já vem preparado para monorepo. Para o app e o `@mony/api-client` enxergarem o mesmo React e o mesmo TanStack Query (senão o `QueryClientProvider` do app não vale para os hooks gerados), `react`, `react-dom`, `react-test-renderer`, `@types/react` e `@tanstack/react-query` vêm do `catalog` do `pnpm-workspace.yaml`; um `override` põe o `react-dom` opcional de outros pacotes (Prisma Studio, react-i18next) na mesma versão. Reanimated, Worklets e Gesture Handler entram já nas versões do SDK, porque o Expo Router os puxa como peer e o pnpm instalaria as mais novas, incompatíveis. Script de instalação do `@sentry/cli` negado no `allowBuilds` (o binário vem do pacote opcional da plataforma). (3) Rotas em `app/` (como no doc 04, não em `src/app` do template), finas; Início é `(tabs)/index.tsx` para ser a rota `/`. O `_layout.tsx` raiz usa `Stack.Protected`: sem sessão só existe `(auth)`, com onboarding pendente só `(onboarding)`, senão `(tabs)`. A sessão é um store Zustand provisório; a T-030 o preenche pela API. Em build de desenvolvimento, a tela de login tem um atalho para ver as abas (some em preview e produção, por `__DEV__`). (4) Ambientes `development`, `preview` (API de staging, canal `staging`) e `production`, como o doc 12; o doc 03 dizia `staging` e foi corrigido. `app.config.ts` decide nome, identificador, esquema de link e API por `APP_ENV`; preview e produção não montam sem `EXPO_PUBLIC_API_URL`, porque o domínio do cliente ainda não existe. Identificador provisório `com.monitorizze.app` (`.dev` e `.preview` nos outros ambientes), a confirmar com o cliente antes do primeiro build de loja (doc 15, pergunta 16). (5) EAS Update com `runtimeVersion` por fingerprint, desligado até existir o projeto no EAS. Sentry só com DSN, sem dados pessoais, e sem o wrapper quando desligado. (6) i18next com chaves tipadas (chave inexistente não compila); textos por feature em `<feature>.strings.ts`. (7) Testes com Jest + `jest-expo` + React Native Testing Library 13 (a 14 exige React 19.3), em `test/`; a navegação é testada com as rotas de verdade (`expo-router/testing-library`). (8) O `build` do app no Turbo é o `expo export` de iOS e Android: o CI prova que o Metro empacota o app; o CI também roda `expo install --check`. (9) React Compiler ligado (padrão do template do SDK 57) e regras do `eslint-plugin-react-hooks` no lint do app. (10) Timeout de 30 s nos testes da config do ESLint: o primeiro lint com tipos passava de 5 s com o `turbo run` inteiro rodando em paralelo. Reversível: sim.

## 2026-10-09 — T-013 — Terraform de staging e deploy no merge
Contexto: o doc 12 pede AWS `sa-east-1` com ECS (api e worker), RDS, ElastiCache, S3, Secrets Manager e ALB, e deploy em staging a cada merge. O humano confirmou manter AWS (a especificação do cliente aceita Google Cloud como alternativa). Decisões: (1) Terraform 1.16 e provider AWS 6.68. Estrutura: `infra/bootstrap` (bucket do estado e provedor OIDC do GitHub, uma vez por conta, estado local), `infra/modulos/ambiente` (tudo de um ambiente) e `infra/ambientes/staging`, com o estado no S3 e trava nativa do S3 (`use_lockfile`), sem DynamoDB. Uma pasta por ambiente em vez de *workspaces*, para staging e produção terem estados e tamanhos separados. (2) Senha do banco gerada por `ephemeral "random_password"` e gravada no RDS e no Secrets Manager por argumentos *write-only*: não fica no estado. A `DATABASE_URL` usa `sslmode=require` (o RDS do PostgreSQL 15+ exige TLS); a imagem traz a autoridade certificadora do RDS no sistema e em `NODE_EXTRA_CA_CERTS`. (3) ElastiCache com **Valkey 8** (o ElastiCache não oferece Redis 8; o Valkey fala o mesmo protocolo que o BullMQ usa), TLS e `noeviction`. Não existe AOF no ElastiCache atual: a durabilidade vem da réplica Multi-AZ (produção) e do snapshot diário. Doc 12 corrigido. (4) Staging mínimo: 2 zonas, 1 NAT, RDS `db.t4g.micro` sem Multi-AZ com 7 dias de backup, Valkey `cache.t4g.micro` sem réplica, API 0,5 vCPU/1 GB (1 a 2 tarefas, escala pela CPU), worker 0,25 vCPU/0,5 GB. (5) Sem domínio ainda (doc 15, pergunta 16): o ALB atende só HTTP até `certificado_arn` ser preenchido; HTTPS, Route 53 e o admin em CloudFront viraram a T-015. EAS Update no canal staging virou a T-016. WAF fica para produção (T-145). (6) Imagem única da API (`apps/api/Dockerfile`, contexto na raiz): `pnpm deploy --prod --legacy` gera uma pasta só com a API, o `@mony/shared` compilado e as dependências de produção; `prisma` e `tsx` passaram para `dependencies` da API, porque a migração e o seed rodam com a mesma imagem. Base `node:24-bookworm-slim` pelo espelho `public.ecr.aws`, sem o limite de downloads do Docker Hub. O schema engine do Prisma é baixado já no build da imagem (`prisma version`). (7) Deploy (`.github/workflows/deploy-staging.yml`): OIDC (papel só aceita o job com `environment: staging`), imagem com a tag do commit e a tag mutável `staging` que as tarefas usam, migração e seed numa tarefa avulsa antes dos serviços, `force-new-deployment` e conferência de que o deploy novo terminou como `COMPLETED` (o circuit breaker volta sozinho para a versão anterior). O workflow só roda quando as variáveis `STAGING_*` existem no repositório; o Terraform imprime os comandos `gh variable set`. (8) CI ganhou o job **Infra**: `terraform fmt -check`, `terraform validate` com erros em anotações, a imagem da API compilando e respondendo `/v1/health`, e a migração com seed rodando pela imagem contra um Postgres vazio (o mesmo comando do deploy). No dia 09/10 o Docker Hub recusou pulls dos runners (erro 500 no `auth.docker.io`): os serviços do CI (Postgres e Redis) passaram a vir do espelho `public.ecr.aws/docker/library`, e o Dockerfile não usa mais a linha `# syntax=docker/dockerfile:1`, que buscava o frontend no Docker Hub. O `.terraform.lock.hcl` nasce no primeiro `init` do humano (o ambiente do agente não alcança o registro do Terraform) e deve ser commitado. (9) Com a T-030, a API e o worker recebem `JWT_CHAVE_PRIVADA` do segredo `mony/<ambiente>/app`. O humano gera a chave e grava o segredo antes do primeiro deploy (passo 4 do `infra/README.md`); sem ela a tarefa não sobe. Reversível: sim.

## 2026-10-11 — T-011 — Design system base no app
Contexto: doc 04 (Design system) e o aceite da T-011 (tokens num arquivo, NativeWind configurado, componentes com testes). O design do cliente ainda não chegou. Decisões:
- **NativeWind 4.2.7 com Tailwind 3.4.19**, a versão estável. O NativeWind 5 (Tailwind 4) ainda é release candidate.
  - Com o pnpm isolado, o `react-native-css-interop` entra como dependência do app, porque o Babel do NativeWind gera import dele.
  - O `babel-preset-expo` também é declarado, porque o `babel.config.js` o chama pelo nome.
  - `disableTypeScriptGeneration` no Metro: o NativeWind reescrevia o `tsconfig.json` a cada subida; o `nativewind-env.d.ts` fica no repositório.
- **Tokens só em `src/ui/tokens.ts`.** O `tailwind.config.js` lê esse arquivo (o Tailwind carrega TypeScript pelo jiti) e troca, sem estender, cores, espaços, raios, tipografia e pesos. Assim, classe com valor fora dos tokens não gera estilo. Valores em pt (`16px` no Tailwind), não em rem.
- **Cores provisórias com nome de uso** (`primaria`, `texto-suave`, `receita`, `despesa`, `atencao`…), não de matiz, para a troca pelo design do cliente não mexer nos componentes. Um teste confere o contraste AA (4,5:1) do texto sobre fundo e superfície.
- **Só modo claro** por enquanto: o doc 04 pede modo escuro só se o design trouxer. Ícones provisórios do Ionicons. A troca é a T-017 (👤 design do cliente).
- **Componentes:** os nomes seguem a lista do doc 04 (`Botao`, `Campo`, `Valor`, `Card`, `Chip`, `BarraProgresso`, `Vazio`, `Erro`, `Skeleton`), mais `Texto` e `BotaoIcone`.
  - Toque mínimo de 44 pt.
  - Papel e rótulo para o leitor de tela; botão de ícone exige rótulo.
  - `BottomSheet` e `Toast` ficam para a primeira tela que precisar, para não puxar bibliotecas sem uso.
- **Modo privacidade (RN-022)** num store Zustand persistido no AsyncStorage, como o doc 04 pede para preferências só do aparelho. `Valor` com `ocultavel={false}` para o que não é dado do usuário (preço de plano).
- **Testes:** o `global.css` vira módulo vazio no Jest, e as fontes dos ícones são dadas como carregadas, para o ícone não se atualizar depois do teste. O `expo export` do CI prova que o Metro compila o CSS com os tokens.

Reversível: sim.

## 2026-10-11 — T-016 — EAS Update em staging
Contexto: doc 12 (merge na `main` → EAS Update no canal `staging`). O projeto no EAS ainda não existe (BLOQUEIOS, T-010). Decisões:
- **Workflow próprio** (`eas-update-staging.yml`), disparado só quando o app ou os pacotes que ele usa mudam, como os deploys da API e do admin. Fica parado até existir a variável `EAS_PROJECT_ID` no repositório, do mesmo jeito que os deploys esperam as `STAGING_*`.
- **Mesmo ambiente do build de preview.** O job define `APP_ENV=preview` e passa `--environment preview`, que traz as variáveis do EAS desse ambiente (`EXPO_PUBLIC_API_URL`, DSN do Sentry). Assim a configuração, e com ela a `runtimeVersion` por fingerprint, é a mesma do binário, e o update só chega a quem pode recebê-lo.
- **EAS CLI 24.12.1 fixo** (o `eas.json` pede ao menos 24.12.0), pela `expo/expo-github-action@v9`, com token de robô da conta Expo. A mensagem do update é a primeira linha do commit, passada por variável de ambiente, e não interpolada no shell.
- **Fora daqui:** source maps do Sentry para os updates entram com o monitoramento (T-142). Produção continua manual (`eas update --channel production`), só para correção de JS.

Reversível: sim.

## 2026-10-11 — T-020 — PoC da Mony
Contexto: doc 08 e doc 04 (chat em SSE lido pelo `expo/fetch`, "gastei 10" com botões). Sem chave do provedor de IA nem login no app ainda. Decisões:
- **SSE escrito direto no socket** (`reply.hijack()` no Fastify). Cabeçalhos contra buffer (`no-transform`, `x-accel-buffering: no`), *ping* a cada 15 s (o ALB corta conexão parada em 120 s) e cancelamento do modelo quando o app fecha a conexão. Erro antes do streaming continua em JSON com o código do catálogo; erro no meio vira evento `erro`.
- **A rota SSE fica fora do OpenAPI**: o cliente gerado lê JSON. O contrato dos eventos fica no `@mony/shared/mony`, usado pela API e pelo app, com o mesmo `LeitorSse`, que também lê o streaming da Anthropic.
- **"gastei 10" por regra, sem modelo** (RN-080, RN-084): valor pelo texto, depois botões de categoria e de forma de pagamento.
  - Na PoC, o estado vai no próprio botão (`acao`) e o servidor valida tudo de novo. A T-061 troca por `rascunhos_lancamento` e pelo `{ mensagemId, acaoId, payload }` do doc 04.
  - Descrição da despesa = nome da categoria, até a T-061 extrair o estabelecimento.
- **`LlmProvider`** com `LlmFake` (padrão; um pedaço a cada 40 ms fora dos testes, para o streaming aparecer) e `LlmAnthropic` (Messages API por `fetch`, sem SDK). Configurado por `IA_PROVEDOR` e `ANTHROPIC_CHAVE_API`, com `IA_MODELO` padrão `claude-sonnet-5-5` (doc 08, a confirmar com o cliente).
- **App:** o `expo/fetch` só na rota de streaming; as outras chamadas continuam no cliente gerado (`agirMony`). Toque em botão com chave de idempotência.
- **👤 pendente:** validar no aparelho (depende do login, T-034) e com a chave da Anthropic. Por isso a tarefa vai para o humano (`aguardando-humano`), como as outras 👤.

Reversível: sim.

## 2026-10-11 — T-034 — Autenticação no app
Contexto: doc 04 (Rede e autenticação), RN-004 e RN-005. A API de sessão já existia (T-030 a T-033). Decisões:
- **Renovação dentro do cliente gerado** (`requisicao` do `@mony/api-client`), e não num interceptor do app. O app só informa `renovarSessao` e `cabecalhos` no `configurarCliente`. Assim o `expo/fetch` da Mony usa a mesma renovação única (`renovarSessaoUmaVez`), e o admin pode usar quando precisar. As rotas `/v1/auth/…` nunca disparam renovação.
- **Só a recusa da API apaga a sessão** (400, 401, 403). Sem rede, 5xx, 426 (versão antiga) e 429 mantêm a renovação guardada, para não deslogar quem abriu o app sem conexão ou com versão antiga.
- **Restauração uma vez só**, mesmo se a raiz montar de novo: duas renovações com o mesmo token seriam reuso (RN-004) e derrubariam a família de tokens. Cofre ilegível (Keystore após restaurar backup) vai para o login, e o erro vai para o Sentry. O cofre fica fora do backup do Android pelo plugin do `expo-secure-store`.
- **Biometria como portão local** (RN-005): a escolha fica no cofre; com ela ligada, a abertura mostra a tela de bloqueio e só renova depois da confirmação. Ligar pede a biometria uma vez, para conferir que o sensor funciona. Quem desiste entra de novo (a sessão do aparelho é revogada).
- **Formulários com React Hook Form** e os mesmos esquemas Zod da API (`@mony/shared/autenticacao`), com `CampoControlado` em `src/lib/formularios.tsx`. Erro da API aparece com a mensagem do catálogo, e o resto como "sem conexão".
- **Fora daqui:** botões do Google e da Apple (T-055, nova, 👤: dependem dos clientes OAuth) e tela de atualização obrigatória (T-056, nova). O atalho de desenvolvimento do login saiu: os testes entram pelo formulário com a API simulada.

Reversível: sim.

## 2026-10-11 — T-015 — Domínio, HTTPS e admin na nuvem
Contexto: doc 12 (Route 53 + ACM; admin em S3 + CloudFront) e doc 13. O cliente ainda não tem domínio (doc 15, pergunta 16), então o Terraform fica pronto para receber um. Decisões:
- **Uma variável, `dominio`, no lugar de `certificado_arn`.** Com ela, o módulo cria a zona no Route 53, os certificados do ACM validados por DNS e os nomes `api.<dominio>` (ALB) e `admin.<dominio>` (CloudFront). Sem ela, tudo continua como na T-013 (API em HTTP no endereço do ALB) e o admin fica no endereço do CloudFront.
- **Zona própria por ambiente.** Staging usa um subdomínio delegado (ex.: `staging.monitorizze.com.br`), para não mexer no DNS do domínio principal, que pode estar no Registro.br. A delegação é um registro NS feito à mão; por isso o primeiro `apply` é só da zona (infra/README.md).
- **Admin no mesmo domínio da API, pelo CloudFront.** O CloudFront serve o build do bucket e repassa `/v1/*` para o ALB, sem cache e com todos os cabeçalhos menos o `Host`. O painel usa `VITE_API_URL` vazio, como em desenvolvimento, e a API continua sem CORS.
- **Rotas do painel por CloudFront Function**, só no comportamento do painel (caminho sem extensão vai para o `index.html`). A página de erro da distribuição trocaria também as respostas 403 e 404 da API.
- **CloudFront:**
  - `PriceClass_All`, a única classe com pontos de presença na América do Sul;
  - política de cabeçalhos de segurança gerenciada pela AWS;
  - bucket privado lido só pelo CloudFront (OAC) e só por TLS.
- **Certificado do admin na `us-east-1`** (exigência do CloudFront): o módulo pede um provider `aws.us_east_1`, que o ambiente de staging passa.
- **Deploy do admin** num workflow próprio (`deploy-admin-staging.yml`), só quando o admin ou os pacotes dele mudam, com o mesmo papel OIDC do deploy da API (que ganhou permissão no bucket e na invalidação). O que está em `assets/` (com hash no nome) tem cache de um ano; o resto é revalidado a cada acesso.
- **`terraform test` no CI** com a AWS simulada (`mock_provider`): o plano do módulo com e sem domínio e a recusa de domínio malformado. Sem credenciais, é o que dá para conferir antes do `apply`.
- **Fora daqui:** `app.<dominio>` (universal links) entra com o deep link do app; WAF na frente do ALB, com o hardening (T-144).

Reversível: sim.

## 2026-10-11 — Humano — Credenciais do cliente só no fim do projeto
Contexto: muitas tarefas 👤 esperam conta ou chave do cliente (Stripe, Open Finance, OAuth, push, e-mail, AWS). O humano vai pedir esses dados ao cliente só no fim do projeto e pediu para seguir sem eles. Decisões:
- **Tarefas que precisam de credencial são feitas com os provedores falsos e testes.** O passo de ligar a chave real fica descrito no BLOQUEIOS, para o fim do projeto.
- O PR dessas tarefas continua com `aguardando-humano`, para o humano mergear, como pede o CLAUDE.md para 👤.

Reversível: sim.

## 2026-10-11 — T-017 — Design do cliente no app
Contexto: o cliente mandou as telas em PDF (`docs/design/telas-app.pdf`), com o app e o painel administrativo. O humano confirmou: **sem modo claro**, e o logo do PDF vale até chegar o arquivo original. Decisões:
- **Tokens medidos nos pixels das telas.** Elas são imagens de 390 × 844 pt em 2×.
  - O app é escuro: fundo em degradê de ciano para marinho, cards marinho, texto claro e azul `#3D8BFF` como cor principal. O verde provisório saiu.
  - Elementos de "vidro" (branco a 16%) para botões secundários, chips e círculos de ícone sobre o degradê.
  - Os nomes continuam por uso. Entram `vidro`, `claro`, `link`, `texto-fraco`, `balao-usuario` e as versões `-suave` de receita, atenção e perigo.
- **O topo do degradê é claro** (contraste 2:1 com texto branco). Lá só vão títulos grandes e em negrito, como no design. O teste de contraste confere o texto sobre o `fundo` e a `superficie`.
- **Botões e chips em pílula.**
  - O botão principal é claro com texto escuro. O azul cheio fica para o botão do microfone e a aba da Mony.
  - Botões de texto têm 50 pt de altura.
  - Chips têm 32 pt e chegam aos 44 pt de toque pelo `hitSlop`.
- **Lucide no lugar do Ionicons**, porque é o traço do design. Cada ícone é importado pelo caminho dele, porque o Metro não descarta o resto do pacote. No Jest, um `moduleNameMapper` aponta para a versão CommonJS. O `@expo/vector-icons` saiu.
- **Barra de abas própria** (`BarraAbas`, no `tabBar` das abas): pílula flutuante sobre o fim do degradê, aba atual em vidro e a Mony num círculo azul no meio. As abas têm papel `tab` e estado selecionado.
- **`Tela`** é a moldura das telas: degradê do `expo-linear-gradient` e área segura. As classes vão numa `View` interna, porque o `SafeAreaView` usa o padding para a área segura.
- **Tema escuro da navegação** nas cores do app, para não aparecer fundo branco entre telas. Também entram `backgroundColor` e `userInterfaceStyle: 'dark'` no `app.config`.
- **Logo provisório** recortado da capa do PDF (1080 px): ícone do iOS (branco com a marca), ícone adaptativo e monocromático do Android, splash (bloco branco sobre `#0A2133`) e o bloco do login.
- **Telas existentes no visual novo:** login com o logo e a chamada do design; cadastro, recuperação, bloqueio, Mony e Mais com `Tela`. O balão da pessoa no chat passa a ser azul-escuro com texto claro.
  - Os botões de Apple e Google continuam na T-055.
  - A grade da aba Mais e o Perfil foram para uma tarefa nova, a T-057.
  - O "3 dias grátis, sem cartão" do login fica para a T-101, quando o teste grátis existir.
- **Conferido em tela** com um export web temporário (Playwright, 390 × 844). Ele não foi para o repositório: o app é só iOS e Android.

Reversível: sim.


## 2026-10-11 — Humano — T-045 antes da T-022
Contexto: pela regra de prioridade a próxima tarefa livre era a T-022 (a T-014 segue esperando: o `nestjs-zod` 5.5.0 aceita Nest só até o 11). Nenhum dos dois ambientes do agente baixa o SDK do Android, então o Kotlin da PoC nem seria compilado. Decisão do humano: fazer a T-045 (tela de Transações), que dá para testar por completo. A T-022 continua a próxima da fila para quem tiver o SDK do Android ou um aparelho. Reversível: sim.

## 2026-10-11 — Ambiente — GitHub pelo shell do computador e trabalho na nuvem
Contexto: nesta sessão o token do GitHub do contêiner da nuvem estava vencido, e o shell Linux ligado ao computador do humano tinha só 2,5 GB livres, sem Docker. Decisões:
- **`gh` no shell do computador** (`$HOME/tools`), com login pelo código do `github.com/login/device`, e um clone leve (`--filter=blob:none`) em `$HOME/work`, só para push e PR.
- **Código, testes e build no contêiner da nuvem**, com Node 24 e o binário nativo do pnpm 12 (o `pnpm` sem shebang dá "Exec format error" quando o Turbo o chama).
- **Transporte por `git bundle`**: o contêiner grava o bundle com nome único (o mesmo nome reaproveitava o arquivo antigo) e o copia para `.turbo/cowork/` na pasta do humano, que o Git ignora; a ferramenta não grava dentro de `.git`. O clone do computador busca o bundle e faz o push.
- **Pasta do humano**: `git fetch` ali deixa arquivos `.lock` sem a permissão de apagar; sem ela, não rodar Git na pasta (só atualizar a `main` no fim, com a permissão).
Reversível: sim.

## 2026-10-11 — T-045 — Aba Transações no app
Contexto: primeira tela do app com dados da API, seguindo a página 4 do design. Decisões:
- **Período é sempre um mês**, com setas, como no design. Os chips (Todas, Despesas, Receitas, Pendentes) trocam só tipo e situação; o resto da RN-047 fica na folha de filtros. A busca espera 350 ms depois da última letra.
- **Lista paginada** com `useInfiniteQuery` e o `listarTransacoes` gerado, 30 por página, chave começando por `/v1/transacoes` para a invalidação por prefixo. Agrupada por dia na ordem da API; o dia cortado entre páginas continua no mesmo grupo.
- **Datas e nomes de mês sem `Intl`** (o Intl do Hermes varia por plataforma; ver T-003): "Hoje, 9 de outubro" sai do calendário em texto e dos nomes no i18n. **Sem chaves de plural do i18next**: o Hermes pode não ter `Intl.PluralRules`, então "1 selecionado" e "2 selecionados" são chaves separadas.
- **Formulário**:
  - valor digitado só em dígitos ("1050" → R$ 10,50), sem vírgula e sem ponto flutuante;
  - data em `DD/MM/AAAA` com Hoje e Ontem, sem o seletor nativo de data: um módulo nativo novo mudaria o runtime do EAS Update (T-016) e pediria build novo;
  - validação com `esquemaNovaTransacao` e `esquemaAtualizacaoTransacao` do `@mony/shared` num `resolver` próprio do React Hook Form, e mensagens por campo no i18n;
  - "já foi pago" mostra o padrão da RN-042 (`statusPadrao`) e só manda `status` se a pessoa mexer, para a regra continuar no servidor;
  - travas espelhadas do doc 05 em `motivoDaTrava` (do banco, parcela, pagamento de fatura, transferência e compra em fatura paga, que o app reconhece por cartão + pago);
  - uma `Idempotency-Key` por formulário montado: tentar de novo depois de falha não duplica.
- **Seleção múltipla** começa segurando um item. Mudar categoria só oferece categorias do tipo dos selecionados e avisa quando há receita e despesa juntas (a API recusaria).
- **Voltar** do formulário usa `router.dismissTo('/transacoes')`: aberto direto pelo link, `router.back()` levava ao Início.
- **Cache**: as mutações não esperam a invalidação (a tela volta na hora); a consulta do lançamento excluído fica velha sem ser buscada. Consultas não repetem em 4xx (`deveRepetirConsulta`), para "não encontrado" aparecer sem as duas esperas.
- **Contrato**: o cliente gerado tipa `string | null` de topo como `string[]` (`proximoCursor`, `observacao`). A tela converte as respostas da lista e do lançamento para os tipos do `@mony/shared`; a correção na geração virou a T-018.
- **Fora daqui**: anexos (T-058, módulos nativos) e criar ou editar recorrência no formulário (T-059).
Reversível: sim.

## 2026-10-11 — T-046 — Onboarding, checklist e dicas
Contexto: o design (página 2) traz duas telas do onboarding: a primeira boas-vindas e as permissões ("Etapa 3 de 3"). O doc 04 previa também primeiro lançamento, cartões, orçamento e tour como telas do fluxo. Decisões:
- **Fluxo curto, como o design**: duas boas-vindas e as permissões. Primeiro lançamento, cartões, orçamento e tour viram passos do checklist do Início, como no "Termine de configurar" do design. A segunda boas-vindas (avisos de limite e fatura) não tem design e segue o visual da primeira.
- **"Concluir" marca o passo das permissões; "Configurar depois" não**: os dois terminam o fluxo (`concluido`), e o passo pendente continua no checklist.
- **Permissões sem módulo nativo neste build**: notificações (T-088), agenda (T-085), apps de compra (T-121) e banco (T-120) pedem módulos que ainda não estão no app, e adicioná-los mudaria o runtime do EAS Update. A tela segue o design, com "Em breve" no lugar da chave enquanto `PEDIDOS_DE_PERMISSAO` não tem o pedido; cada tarefa só registra o seu.
- **Checklist no Início provisório**: o Início de verdade é a T-053, que só reaproveita o `CartaoChecklist`. Os passos sem tela (orçamento até a T-052, tour) só têm "Dispensar".
- **Tour = primeira dica**: o passo "Conhecer o app" é concluído ao fechar a primeira dica contextual; não há tour em telas, que o design não trouxe.
- **Atualização otimista** do `GET /me/onboarding` (`aplicarAtualizacao` espelha a `montarOnboarding` da API: concluída vale mais que dispensada, nada volta a pendente), para a dica sumir e o passo mudar na hora.
- **Contraste**: "Pular" e "Etapa 3 de 3" em branco e negrito, porque o azul de link e o texto suave somem no topo claro do degradê. Pelo mesmo motivo, o formulário de lançamento (T-045) passou a usar fundo sólido: os rótulos dele começam no topo.
- **Conferido em tela** com um export web temporário (Playwright, 390 × 844, API falsa e cofre em memória), fora do repositório.
Reversível: sim.

## 2026-10-11 — T-049 — Categorias e contas no app
Contexto: o design traz a lista de categorias (página 8), sem o formulário; contas manuais não têm design. Decisões:
- **Rotas dentro da aba Mais** (`/mais/categorias`, `/mais/contas`), e não na raiz como no esboço do doc 04: na raiz, fora dos grupos protegidos, a rota abriria sem sessão. A aba Mais ganhou atalhos simples até a grade da T-057.
- **Sem a contagem de lançamentos** que o design mostra em cada categoria: `GET /categorias` não a manda. Se o cliente fizer questão, é uma tarefa de API.
- **Cores e ícones fechados**: 14 cores (as das categorias padrão) e 21 ícones (os 14 padrão e 7 novos: viagem, pets, presentes, investimentos, academia, roupas, filhos). A chave do ícone continua livre na API; chave desconhecida vira a etiqueta.
- **Excluir categoria sempre pede o destino** (RN-066), mesmo quando ela não tem lançamentos: o app não sabe a contagem, e escolher um destino nunca está errado. A única do tipo não oferece destino (a API recusaria com `ULTIMA_CATEGORIA_DO_TIPO`).
- **Saldo inicial negativo** por uma chave ao lado do `CampoValor`, que só aceita dígitos.
- **Componentes novos**: `GrupoOpcoes` saiu da feature de transações para `src/ui`; `Segmentado` e `Cabecalho` entram no design system.
Reversível: sim.

## 2026-10-11 — T-050 — Cartões e faturas no app
Contexto: o design (página 4) traz a aba Cartões com o carrossel, o limite, a fatura atual e as próximas faturas; lista de faturas, detalhe da fatura e formulário do cartão não têm design. Decisões:
- **Pagar a fatura entra aqui**: "Marcar fatura como paga" está na tela do design, e a API (`POST /faturas/:id/pagar`, RN-036) já existe. Valor acima do saldo não vai (a API também recusa); a folha não deixa data no futuro.
- **Rotas iguais às dos alertas** (`/cartoes/<id>`, `/cartoes/<id>/faturas/<id>`): o link da notificação abre a tela certa sem tradução. `/cartoes/<id>` é a própria aba com aquele cartão escolhido.
- **Próximas faturas**: as de competência depois da atual, até três, da lista de faturas do cartão (que já traz as futuras com parcelas e recorrências).
- **Faixas de aviso** em cinco opções (50, 70, 80, 90 e 100%) que ligam e desligam; o esquema aceita qualquer inteiro de 1 a 200, mas o design só fala em porcentagens redondas.
- **Nomes dos meses** (`comum.meses`, `comum.mesesCurtos`) saíram das strings de transações para `comum`, com os ganchos em `src/lib/datas-texto.ts`, porque cartões também usam.
- **Token novo** `chip-cartao` (dourado do chip no cartão), para não usar cor solta na tela.
Reversível: sim.

## 2026-10-12 — T-052 — Orçamentos e metas no app
Contexto: o design (página 5) traz as telas de orçamentos e de metas; a folha de orçamento, o detalhe e o formulário da meta não têm design. Decisões:
- **Grupo `(telas)`** na raiz, ao lado de `(tabs)` e no mesmo `Stack.Protected`: telas com voltar e sem a barra de abas, como no design, e com as rotas dos alertas (`mony://orcamentos?competencia=AAAA-MM`) sem tradução. Fica protegido, que era o problema das rotas na raiz na T-049. As próximas telas desse tipo (parcelamentos, relatórios, lembretes…) entram aqui.
- **Mês com setas** em Orçamentos, que o design não mostra: o link do alerta abre outro mês, e ver o mês passado é útil. "Faltam N dias" só no mês de hoje; nos outros, "mês fechado" ou "ainda não começou", sem projeção.
- **Projeção do mês** = soma das projeções que a API manda por categoria (o total dela não traz a projeção). O percentual do anel usa `percentualDoOrcamento` do `@mony/shared` sobre os totais da API.
- **O lápis liga a edição**: no modo normal o item só mostra, como no design; no de edição, tocar abre a folha para mudar ou tirar.
- **Metas sem ícone nem cor próprios** (a API não tem esses campos): todas com o ícone de alvo, em verde e azul alternados, como as duas do design. O percentual é o da API (para baixo): 6.400 de 15.000 é 42%, e não os 43% do design.
- **"+ R$ 450 este mês" e "Dica da Mony"** ficaram para a T-147: a lista de metas não traz os aportes, e buscar o detalhe de cada meta para somar seria uma chamada por meta.
- **Etapa `orcamento` do onboarding concluída pela API** no primeiro `PUT /orcamentos` (como cartões e primeiro lançamento), e o "Fazer agora" do checklist abre `/orcamentos`.
- **Componentes**: `SeletorMes` saiu de transações para `src/ui`; `AnelProgresso` aceita cor e conteúdo no meio; `BarraProgresso`, uma cor fixa; `Botao`, `compacto` e `rotulo`; `Etiqueta`, o alinhamento; `useTextoDoValor` dá o valor (ou o oculto) para frases.
- **API rodando nesta sessão**: Postgres 16 e Redis locais, e o Prisma gerado sem baixar engines (`PRISMA_SCHEMA_ENGINE_BINARY` apontando para um arquivo vazio, só para o `generate`; as migrações aplicadas com `psql`). Os 312 testes da API, com os de integração, passaram aqui.
Reversível: sim.

## 2026-10-12 — T-018 — Campos que aceitam nulo no contrato
Contexto: o Zod 4 escreve `z.string().nullable()` como `type: ['string', 'null']`; o `nestjs-zod` passa isso ao `@nestjs/swagger` como metadado do campo, e o swagger lê `type` em lista como "lista de" (`string[]`). Só os campos de topo: os aninhados não passam pelo swagger. O `nestjs-zod` 5.5 (o mais novo) ainda faz assim. Decisões:
- **`criarDto`** (`src/core/openapi/dto.ts`) no lugar do `createZodDto`: o mesmo DTO, com o metadado do campo trocado por `anyOf: [{ type: 'string' }, { type: 'null' }]`, a forma que o Zod já usa para os outros campos que aceitam nulo (uuid, enum). O ESLint barra o `createZodDto` em `src/`.
- **Alternativas**: pós-processar o `openapi.json` (não dá: depois do swagger, um `string[]` de verdade e um nulo perdido ficam iguais) e `nullable: true` (é do OpenAPI 3.0; o documento é 3.1).
- **Testes** (`test/openapi.spec.ts`): o contrato com um DTO de teste (texto, número, uuid, opcional, lista, lista ou nulo, aninhado), os campos que saíam errados, todos os DTOs criados sem tipo em lista e um que falha quando o `createZodDto` puro passar a acertar (aí o `criarDto` pode sair).
- **App**: as respostas do cliente gerado entram sem conversão (transações, cartões, metas).
Reversível: sim.

## 2026-10-12 — T-053 — Início no app
Contexto: o design (página 3) mostra o topo, o saldo, quatro atalhos, o checklist e os cartões; as RN-020 a RN-024 pedem também o resumo, o período, os próximos vencimentos e os orçamentos. Decisões:
- **Uma chamada** (`GET /dashboard`); o checklist continua com o `GET /me/onboarding` dele (a mesma consulta que o "Dispensar" muda na hora), e as categorias dos orçamentos vêm do cache de `GET /categorias`.
- **Abaixo do que o design mostra**: resumo, próximos vencimentos (até cinco) e orçamentos do mês (total e as três categorias mais perto de estourar). Cartões e orçamentos só aparecem quando existem; o checklist já convida a cadastrar.
- **Topo**: iniciais → aba Mais (perfil, até a T-057); "Pesquisar" → Transações; calendário → período (RN-021); sino só avisa até a central (T-087), sem botão que não faz nada.
- **Atalhos**: Lançar, Orçamentos e Metas no lugar de Ler nota (T-066), Lista e Lembrete (T-084), que ainda não têm tela.
- **Período** com rótulos curtos ("Este mês", "Mês passado", "Escolher") para caber nas três abas; ao trocar, a tela mantém o anterior até o novo chegar (`keepPreviousData`).
- **Título "Início" só para o leitor de tela** (recortado em 1 pt): o design não tem título visível.
- **Conferido em tela** (export web temporário, Playwright, 390 × 844, API falsa), fora do repositório. A conferência achou classes com valor fora dos tokens (`h-14`, `h-11`, `h-px`), que o Tailwind ignora sem aviso: viraram tamanhos do tema, e o teste que pega isso é a T-148. Orçamentos e metas (T-052) também foram conferidos e estão como o design.
- `Segmentado` com menos respiro lateral (`px-2`), para "Mês passado" caber.
Reversível: sim.

## 2026-10-12 — T-054 — Relatórios no app
Contexto: o design (página 6) traz Mês, 6 meses e Ano, as barras de receitas × despesas, a rosca por categoria e uma frase da Mony; a RN-150 pede também dia da semana, cartão, forma de pagamento e evolução anual. Decisões:
- **Abas** com o mês de hoje inteiro: Mês (1), 6 meses e Ano (12 meses), e 6 meses aberta primeiro, como no design. Abaixo do que o design mostra: dia da semana, cartão, forma de pagamento e, na aba Ano, a evolução dos últimos cinco anos (o "por ano" com 12 meses teria no máximo dois anos).
- **"Sobrou em média por mês"** = saldo do período ÷ número de meses, arredondado ao centavo: conta de exibição sobre o total da API. Com um mês só, "Sobrou em outubro"; negativo vira "Faltou".
- **A frase da Mony** do design ("Você gasta mais às sextas e sábados: 41% das despesas de lazer…") virou a do dia de mais gastos, com o percentual sobre os totais da API. Por categoria e dia ao mesmo tempo, só com outra rota (a Mony de verdade é a Fase 2).
- **Rosca** com as quatro maiores e "Outras" (soma das demais, percentual para baixo), nas cores das categorias.
- **Gráficos sem biblioteca**: barras são `View` com altura proporcional e a rosca é um `react-native-svg` (já no app). Cada coluna tem o rótulo para o leitor de tela com os valores, que respeitam o modo privacidade.
- **Sem o botão de baixar**: a exportação é a T-125.
- Conferido em tela (export web temporário, Playwright, API falsa), fora do repositório.
Reversível: sim.

## 2026-10-12 — T-056 — Atualização obrigatória no app
Contexto: a API já recusa versão antiga (426 `VERSAO_APP_DESATUALIZADA`, T-033) e manda a `versaoMinima` no `GET /config-app`. Decisões:
- **Duas portas**: na abertura, o app confere o `GET /config-app`; e qualquer 426, de qualquer chamada, também abre a tela. O 426 é a garantia (a API recusa), e a conferência na abertura evita a pessoa preencher um formulário para só então descobrir.
- **Gancho no cliente gerado** (`aoErro` no `configurarCliente`), chamado com todo erro da API antes de a chamada falhar. O chat da Mony, que usa o `expo/fetch` direto, chama o mesmo tratamento.
- **Tela no lugar do app inteiro**, como a de bloqueio da biometria, sem voltar nem abas. A sessão guardada fica: depois de atualizar, a pessoa entra direto.
- **Link da loja no `app.config`** (`urlLoja` no `extra`): Google Play pelo identificador; App Store pelo número do app (`EXPO_PUBLIC_APP_STORE_ID`, que só existe na publicação, T-146), e até lá a busca por "Monitorizze". Alternativa: a API mandar o link no `GET /config-app`; ficou no app porque a versão antiga que precisa do link é justamente a que já está instalada.
- **Store só em memória**: a próxima abertura confere de novo, e a versão nova não fica presa na tela.
- **T-055 pulada e registrada em BLOQUEIOS**: os botões do Google e da Apple dependem dos clientes OAuth (bloqueio da T-032) e de módulos nativos novos, que só dão para testar num build de desenvolvimento no aparelho.
Reversível: sim.

## 2026-10-12 — T-057 — Aba Mais e Perfil
Contexto: o design traz a aba Mais (página 8: perfil, grade de nove atalhos e três linhas) e o Perfil (página 9: conta, preferências e privacidade). Boa parte aponta para telas que ainda não existem. Decisões:
- **Só o que funciona**: a grade mostra Orçamentos, Metas, Relatórios, Categorias e Contas; Assinatura, "Teste grátis", Alertas da Mony, Exportar e Excluir conta, Planos e Ajuda ficam para as tarefas deles (anotado na T-087 e na T-140). Botão que não faz nada é pior que botão que ainda não está lá; a mesma escolha dos atalhos do Início (T-053).
- **Contas manuais na grade** até "Bancos" (Open Finance, T-120).
- **Biometria e "Sair" saíram da aba Mais para o Perfil**, como no design; "Sair deste aparelho" virou "Sair da conta" (o texto de ajuda diz que é só deste aparelho).
- **Rever tutorial** reaproveita as boas-vindas do onboarding (`revisao`), sem as permissões, numa rota fora do grupo do onboarding (que só existe com o onboarding pendente).
- **Modo escuro** do design não vira chave: o app é só escuro (decisão do cliente, T-017).
- **Iniciais** num `Avatar` do design system e o `iniciais` em `src/lib/nomes.ts`; o nome que muda no Perfil vai para a sessão (`mudarNome`).
- Conferido em tela (export web temporário, Playwright, API falsa), fora do repositório.
Reversível: sim.

## 2026-10-12 — T-058 — Anexos no formulário do lançamento
Contexto: a API já tem `POST /arquivos` (URL assinada de `PUT`), `GET /arquivos/:id` e `anexoIds` na transação (T-037); faltava o app. Decisões:
- **Três módulos nativos novos** nas versões do SDK 57 (`expo-image-picker`, `expo-document-picker`, `expo-image-manipulator`): mudam o fingerprint do runtime, mas ainda não há build publicado (o projeto do EAS é a T-010), então nada quebra no EAS Update. O próximo build de desenvolvimento já sai com eles.
- **Envio na hora da escolha**, não no salvar: a pessoa vê que o anexo subiu (ou o erro) antes de terminar o formulário, e o salvar continua uma chamada só. Anexo enviado e abandonado (formulário fechado sem salvar) fica sem lançamento no S3; a limpeza de órfãos é da retenção de arquivos (T-140).
- **Foto reduzida no aparelho** (lado maior até 2.000 px, JPEG 0,8, doc 04), PDF como veio; acima de 10 MB (`TAMANHO_MAXIMO_ANEXO`) não vai. Os tipos `foto` e `pdf`; `comprovante` fica para a leitura de documentos da Mony (T-065).
- **Abrir anexo** pela URL de leitura no navegador do aparelho (`Linking`), sem visualizador próprio.
- **Galeria sem pedir permissão**: o seletor do sistema (PHPicker no iOS, Photo Picker no Android) não precisa; só a câmera pede.
Reversível: sim.

## 2026-10-12 — T-059 — Recorrência no app
Contexto: a API de recorrências existe (T-038, T-051); o app só mostrava "todo mês" e perguntava o escopo ao excluir. Decisões:
- **"Repetir" no próprio formulário do lançamento novo**, e não numa tela separada: é o mesmo modelo (tipo, valor, descrição, categoria, forma, cartão ou conta), e a data vira o início. Com "Repetir", o salvar chama `POST /recorrencias` em vez de `POST /transacoes`, com a mesma `Idempotency-Key` do formulário.
- **Status, observação e anexos somem com "Repetir"**: não são do modelo da recorrência; ficam para cada lançamento gerado. O aviso explica.
- **Editar e parar pela ocorrência**: sem lista de recorrências (o design não tem); a ocorrência é o caminho natural ("o aluguel deste mês" → "Editar recorrência"). Uma lista pode vir com a tela de Parcelamentos e dívidas.
- **Trocar entre semanal e mensal/anual volta o dia ao da data de início** (`diaPadrao` do `@mony/shared`): dia da semana (0 a 6) e do mês (1 a 31) não se convertem.
- **Recorrência parada** mostra só o aviso, sem edição (a API não reativa).

## 2026-10-12 — T-060 — Orquestrador da Mony, histórico e `logs_ia`
Contexto: a PoC (T-020) respondia sem histórico, sem ferramentas e sem `logs_ia`. Decisões:
- **Uma conversa por usuário**: a mensagem vai para a conversa mais recente (a primeira cria uma). `GET /mony/conversa` lista as mensagens de todas as conversas do usuário, da mais nova para a mais antiga, por cursor, com `texto` para a busca da T-069. Atalhos de sugestão (`sugestoes`, doc 04) ficam para a T-069.
- **Idempotência opcional em `POST /mony/mensagens`**: com `Idempotency-Key`, a mensagem do usuário grava a chave e a resposta grava `<chave>:resposta` (o único `(conversa_id, idempotency_key)` já existia). Reenvio com resposta gravada repete os eventos; sem resposta, refaz sem gravar a mensagem de novo. Resposta com falha é gravada **sem** a chave, para "Tentar de novo" com a mesma chave refazer; se o app fecha a conexão, nada é gravado como resposta.
- **Botão no histórico**: o toque vira mensagem do usuário com tipo `botao` e o rótulo em `conteudo`; o modelo vê `(tocou em "Pix")` e os botões oferecidos como `[botões: …]`.
- **Contexto ao modelo** em dois blocos de sistema com cache de prompt (o prompt, igual para todos, e o contexto do usuário): data de hoje no fuso, primeiro nome, nomes das categorias, cartões (dias e % do limite) e orçamentos do mês, tudo pelos Services. Sem ids: as ferramentas os trazem. Histórico de até 20 mensagens ou 12.000 caracteres; turnos seguidos do mesmo papel viram um só.
- **`logs_ia` por chamada ao modelo**, inclusive retentativas e chamadas canceladas, ligado à **mensagem do usuário** (a resposta ainda não existe durante as chamadas). `tokens_entrada` soma a entrada normal e a gravada e lida do cache: o custo por tipo fica para o admin (T-141), que pode pedir colunas novas.
- **Retentativas** (RN-087, doc 08): até 2, após 400 ms e 1.200 ms, só em erro transitório e só enquanto nada saiu para o app (texto já enviado não se repete). Tempo limite de 60 s por chamada e até 5 chamadas por mensagem (voltas de ferramenta).
- **Primeira ferramenta já na T-060**: `listar_categorias` (só leitura), para o loop de ferramentas rodar de ponta a ponta. As demais são da T-062. Erro de regra, entrada inválida e ferramenta desconhecida voltam ao modelo como `tool_result` com erro; falha inesperada vai ao log e volta como "Falha interna".
- O fluxo "gastei 10" da PoC segue no `RoteadorRegras` até a T-061 trocar por rascunhos.
Reversível: sim.

## 2026-10-12 — T-147 — Guardado no mês e ritmo das metas
Contexto: o design (página 5) mostra "+ R$ 450 este mês" e a dica "Guardando R$ 450 por mês, sua reserva fica completa em 19 meses. Com R$ 600, em 15.", sem dizer de onde vêm os números. Decisões:
- **Guardado no mês**: soma dos aportes com data no mês de hoje (fuso do usuário), por meta e no total, na lista (`GET /metas`). O detalhe e as respostas de criar, editar e aportar não mudam.
- **Ritmo**: média mensal dos aportes nos últimos 3 meses, o atual incluso, dividida só pelos meses em que a meta já existia (meta nova não fica com ritmo baixo). Os aportes até o dia da criação contam como **saldo inicial** e ficam fora da média: quem cria a meta e lança o que já tinha guardado não vira "ritmo" de milhares por mês. Alternativa: só o guardado no mês (como no design), que zera no começo de todo mês.
- **Meses para completar**: para cima (8.600 / 450 = 19,1 → 20; o design arredonda para baixo). **Necessário até o prazo**: o restante dividido pelos meses do mês de hoje ao do prazo, os dois inclusos, para cima; prazo vencido não tem conta.
- **A dica no app**: a primeira meta aberta, na ordem da API (pelo prazo), que tem conta. Em vez do "Com R$ 600, em 15" do design (valor sem critério), a segunda frase diz quanto guardar por mês para chegar no prazo, e só aparece quando o ritmo não chega.
Reversível: sim, `ritmoDaMeta` em `@mony/shared/metas` e `dicaDasMetas` no app.

## 2026-10-12 — T-148 — Teste de classes fora dos tokens
Contexto: o tema do Tailwind troca a escala pelos tokens, e classe com valor fora deles some sem aviso (achado da T-053). Decisões:
- **Comparação com o Tailwind de fábrica**: o teste junta toda palavra dos textos do código (`app/` e `src/`, lidos pelo compilador do TypeScript: literais e partes fixas de template) e acusa a que gera CSS no Tailwind de fábrica (com o mesmo preset do NativeWind) e não no tema do app. Palavra que não é classe em nenhum dos dois (texto comum, rótulo) não conta, então não precisa de lista de exceções. Não pega erro de digitação (`bg-superfice`), que não é classe em nenhum dos dois.
- Usa APIs internas do Tailwind 3.4 (`createContext`, `generateRules`), seguras porque a versão é fixa no `package.json`; na troca para o Tailwind 4 o teste precisa mudar junto.

## 2026-10-12 — T-061 — Rascunho do lançamento da Mony
Contexto: a PoC (T-020) guardava o estado do lançamento no próprio botão. Decisões:
- **Ação do botão `{ rascunhoId, campo, valor }`**, devolvida inteira em `POST /mony/acoes { acao }`, e não o `{ mensagemId, acaoId, payload }` do doc 04: o app não precisa saber de mensagens nem de ids de ação, e o servidor confere a ação contra o rascunho (410 se ele não existe mais, 409 se a pergunta já foi respondida) e contra os dados do usuário. O app não mudou.
- **Validade de 24 h desde a última resposta** (RN-088 diz só "24 horas"): quem está respondendo não perde o rascunho no meio.
- **Gasto novo com valor troca o rascunho** em vez de completar o atual (RN-085 fala de resposta a uma pergunta; "gastei 30" não é resposta) e a Mony avisa ("Deixei de lado o lançamento de R$ 25,00."). Um rascunho por conversa continua valendo.
- **O texto preenche tudo o que diz**, não só o campo da pergunta: "gastei 80 de iFood no Nubank em 3x" já sai com cartão e parcelas; nome de cartão diz crédito; parcelado (mais de 1x) também. Com um cartão só, ele vale sem perguntar; crédito sem cartão cadastrado avisa e pergunta a forma de novo.
- **Descrição pelo texto** ("no mercado" → Mercado); sem ela, o nome da categoria. A categoria sai do nome na descrição ou no texto, sem diferença de acento e maiúscula. Dois nomes diferentes no texto (ex.: dois cartões) não escolhem nenhum.
- **Texto que não responde vai ao modelo** com o rascunho no contexto, e a pergunta pendente volta com os botões depois da resposta (RN-080: sempre com botões). "cancela", "esquece" e afins descartam por regra.
- **"Mais usadas" pelo `CategoriasService.maisUsadas`**: a consulta saiu do repositório da Mony, que agora só lê as tabelas dela (a Mony chama Services). O fuso vem do `UsuariosService`.
- `mensagens.rascunho_id` fica sem uso: o rascunho some ao gravar e o vínculo viraria nulo de qualquer jeito.
- O resumo com [Desfazer] (RN-082) e as preferências por estabelecimento (RN-081, RN-090) ficam para a T-062 e a T-063.
Reversível: sim.

## 2026-10-12 — T-062a — Ferramentas de lançamento da Mony
Contexto: a T-062 lista 15 ferramentas de finanças; ficou grande demais para um PR. Decisões:
- **Divisão**: T-062a (lançamentos: criar, editar, excluir, consultar, cartões e categoria nova, com o resumo e o [Desfazer]) e T-062b (consultas e planejamento: resumo do período, cartão e fatura, pagar fatura, orçamentos e metas). As tarefas que dependiam da T-062 passam a depender da T-062b.
- **`criar_transacao` de despesa passa pelo rascunho** da T-061 em vez de gravar direto ou devolver erro quando falta algo: o modelo manda o que a pessoa disse; completo, grava; incompleto, o app pergunta com botões (RN-080). Assim as regras de cartão único, crédito sem cartão e parcelas ficam num lugar só. Receita grava direto e precisa da categoria.
- **Componentes das ferramentas saem depois da resposta** do modelo e entram na mensagem gravada; o que foi gravado aparece mesmo se a chamada seguinte ao modelo falhar (RN-087).
- **[Desfazer]**: até 24 h depois de gravar (RN-082), só para lançamento de origem `mony`; parcelamento sai cancelado (o `ParcelamentosService.cancelar`). A hora vem do `criadoEm` da transação.
- **Exclusão**: `excluir_transacao` só devolve os botões [Excluir …] e [Cancelar]; a exclusão acontece no toque (RN-092), pelo `TransacoesService.excluir` (que já recusa parcela e pagamento de fatura).
- **Ação do botão com `tipo`** (`rascunho`, `desfazer`, `excluir_transacao`, `cancelar`): a ação de rascunho da T-061 ganhou `tipo: 'rascunho'`; nada publicado usava o formato antigo.
- **Cartão de resumo com `opcoes`**, como o componente de botões, para a aba Mony da PoC mostrar o [Desfazer] sem saber de cada tipo; a tela completa do chat é a T-069.
- `criar_categoria` usa cor e ícone padrão (`#94A3B8`, `outros`); a pessoa troca no app.
Reversível: sim.

## 2026-10-12 — T-HOTFIX — Patches do SDK 57 do Expo
Contexto: o Expo publicou patches do SDK 57 (`expo` 57.0.28 e afins) e o passo "App com as versões do SDK do Expo" (`expo install --check`) do CI passou a falhar em todo PR, inclusive na `main`. O pnpm 12 só instala versão publicada há mais de um dia (`minimumReleaseAge`). Decisão: subir os pacotes para as versões exigidas, fixas, com as versões novas do Expo na lista `minimumReleaseAgeExclude` do `pnpm-workspace.yaml` (o pnpm acrescenta sozinho ao instalar). Alternativa: esperar um dia com o CI vermelho. As exceções podem sair da lista quando as versões passarem de um dia. Reversível: sim.

## 2026-10-12 — T-062b — Ferramentas de consulta e planejamento da Mony
Contexto: segunda parte da T-062. Decisões:
- **`resumo_periodo`**: sem datas, do dia 1 do mês até hoje (no fuso do usuário). A comparação é com o período anterior do mesmo tamanho, logo antes (1 a 15/10 compara com 16 a 30/09), e não com o mês anterior inteiro, para não comparar meio mês com um mês. Totais pelo `TransacoesService.totais` (RN-047) e categorias pelo `RelatoriosService.categorias` (que passou a ser exportado).
- **`pagar_fatura`** segue a `excluir_transacao`: só devolve [Pagar R$ X] e [Cancelar]; o valor vai no botão (sem ele, o que falta pagar; acima disso, recusa) e o pagamento é de hoje, pelo `CartoesService.pagar`, com a conta de pagamento do cartão (RN-036, RN-092).
- **`definir_orcamento` e `atualizar_meta` gravam direto e respondem em texto**, sem cartão de resumo nem [Desfazer]: o doc 08 pede o resumo com [Desfazer] para lançamentos, e mudar um orçamento ou uma meta se corrige pedindo de novo ou no app. `atualizar_meta` faz o aporte de hoje e repassa o `sugerirConclusao` (RN-063) para a Mony perguntar.
- `consultar_cartao` devolve as faturas com saldo, a aberta e a última paga, não o histórico todo.
- O `LlmFake` guarda uma cópia da conversa de cada pedido: o orquestrador continua a mesma lista nas voltas de ferramenta.
Reversível: sim.

## 2026-10-12 — T-063 — Preferências aprendidas
Contexto: `preferencias_aprendidas` tem uma linha por estabelecimento (único usuário + chave), com uma combinação e a contagem; a RN-090 diz "`contagem += 1` na combinação confirmada" sem dizer o que fazer quando a combinação muda. Decisões:
- **Uma combinação por estabelecimento**: a mesma soma 1; outra toma o lugar e volta para 1 (o hábito mais recente vale). Alternativa: guardar várias combinações por estabelecimento, que pediria mudar a tabela.
- **Chave = descrição normalizada** (sem acento, minúscula, só letras e números, até 100), em `chaveDoEstabelecimento`; a mesma função serve depois para a coluna `transacoes.estabelecimento` (ainda sem uso).
- **Aprende só com o que a Mony grava** (rascunho e ferramentas), que é a "confirmação" da RN-090; lançamentos feitos no app ficam de fora por enquanto. Falha ao gravar a preferência vai ao log e não desfaz o lançamento; [Desfazer] não desaprende.
- **Ordem dos botões (RN-081)**: a preferida na frente, inclusive a categoria que não está entre as 4 mais usadas (ela entra e a quarta sai); formas e cartões também. Nada é preenchido sozinho: a pessoa ainda toca (RN-080 pergunta o que o texto não disse).
- **Contexto do modelo**: os 10 hábitos com mais confirmações.
Reversível: sim.

## 2026-10-12 — T-064 — Áudio na Mony
Contexto: o doc 08 manda o áudio pelo `TranscricaoProvider` na fila `mony-midia` e o ADR-005 deixa o provedor em aberto. Decisões:
- **Deepgram** (`nova-3`, pre-recorded por URL, pt-BR com pontuação) **(confirmar com cliente)**: a API manda a URL de leitura assinada do S3 (15 min) e a Deepgram baixa o arquivo, sem o áudio passar pela API. Alternativas atrás da mesma interface: AWS Transcribe (assíncrono, mais lento para chat), OpenAI. `TRANSCRICAO_PROVEDOR=fake` é o padrão (desenvolvimento e testes).
- **Transcrição dentro da requisição do SSE**, não na fila `mony-midia`: um áudio de chat leva poucos segundos e a pessoa espera a resposta com a conexão aberta; a fila fica para foto, PDF e NFC-e (T-065, T-066). Tempo limite de 60 s.
- **O áudio é um anexo `tipo audio`** (novo valor no enum), enviado pelo mesmo `POST /arquivos`; o `tipoConteudo` agora precisa combinar com o `tipo` (foto só imagem, PDF só PDF, áudio só áudio). Áudio não vira anexo de lançamento.
- **Áudio inválido** (de outra pessoa, que não chegou ao S3 ou já usado em outra mensagem) responde o evento `erro` no SSE, sem gravar nada, em vez de status HTTP: a checagem do reenvio com a mesma `Idempotency-Key` precisa da mensagem já gravada.
- **Duração**: o app para sozinho em 10 minutos (doc 11); a API confere só o tamanho (10 MB). A `duracaoSegundos` do provedor ainda não é gravada (custo por minuto entra no admin, T-141).
- **`logs_ia` da transcrição**: `ferramenta = transcricao`, tokens 0, modelo do provedor.
- **App**: gravação AAC mono a 64 kbps (10 minutos ≈ 4,8 MB). O `expo-image-picker` tinha `microphonePermission: false`, que bloqueia o `RECORD_AUDIO` no Android; agora usa o mesmo texto do `expo-audio`. Áudio em segundo plano desligado.
Reversível: sim (`TRANSCRICAO_PROVEDOR`; o enum `audio` fica).

## 2026-10-12 — T-065 — Foto, print e PDF na Mony
Contexto: o doc 08 põe a leitura na fila `mony-midia` e `ler_documento` entre as ferramentas da conversa, e fala em [Confirmar]/[Editar]. Decisões:
- **A leitura não passa pelo modelo da conversa**: mensagem com foto ou PDF vai direto ao `DocumentosMony.ler`, que obriga o modelo a responder pela ferramenta `ler_documento` (`ferramentaObrigatoria`, saída estruturada validada por Zod). Mais previsível e barato que deixar o modelo da conversa decidir.
- **Na própria requisição do SSE**, como o áudio (T-064), com tempo limite de 120 s; a fila fica para quando um PDF grande passar disso.
- **Arquivo pela URL assinada** (imagem e PDF em `source.type = url` na Anthropic): a API não baixa o arquivo. HEIC e imagem acima de 5 MB são recusados (limite do provedor); o app já manda JPEG.
- **Confirmação**: um cartão `resumo` com `aConfirmar` por lançamento, com [Confirmar] e [Descartar], e [Confirmar todos]/[Descartar todos]. [Editar] fica para a T-069; o que falta (categoria, forma, cartão, parcelas) vira as perguntas do rascunho no [Confirmar] (um rascunho por vez, RN-088), e o [Confirmar todos] só grava os completos.
- **Origem `foto`** no que foi lido de documento (foto ou PDF), pelo `Contexto.deDocumento` e pelo `deDocumento` do rascunho; o [Desfazer] vale para `mony` e `foto`.
- **Concorrência**: a importação é travada (`SELECT … FOR UPDATE`) para reservar os lançamentos ("gravando") antes de gravar; o que falhar volta a "pendente".
- **Fatura e extrato**: cada linha vira um lançamento à vista (parcela de compra vira a despesa do valor da parcela, com "(parcela 2/10)" na descrição), sem conferir se já existe. Reconstruir parcelamentos e evitar duplicados fica na T-149.
- **Ids pelo usuário**: categoria pelo nome que o modelo escolheu na lista do contexto, senão a preferência do estabelecimento (RN-090); cartão pelo nome ou final, pela preferência ou o único cadastrado; receita sem categoria vai para "Outros".
- **Sem a imagem no lançamento**: o arquivo lido não vira anexo da transação gravada (um documento pode ter vários lançamentos).
Reversível: sim.

## 2026-10-12 — T-067 — Consultoria pós-lançamento
Contexto: a RN-089 pede que a Mony comente o impacto no orçamento da categoria e no limite do cartão depois de cada lançamento, sem dizer onde nem como. Decisões:
- **No cartão de resumo, não no texto**: o impacto vai em `lancamento.impacto` (dados e a frase pronta) e o cartão mostra a frase na cor da faixa; o texto da regra fica como estava, e o modelo recebe o impacto no resultado da ferramenta com a instrução de não repetir os números e só alertar em atenção ou estouro. Assim a frase é a mesma em todo caminho (regra, ferramenta, documento) e não depende do modelo.
- **Mês do orçamento**: o da data da despesa; no parcelamento, o da primeira parcela (no cartão, a data da compra; fora dele, o vencimento).
- **Faixas**: as do orçamento (RN-062: atenção a partir de 80%, estourado a partir de 100%); no cartão, "estourado" só quando o disponível fica negativo, e 100% exato é "chegou ao limite".
- **Receita** não tem orçamento; só comenta o cartão quando houver. [Confirmar todos] de documento responde só o total, sem o impacto de cada lançamento.
- **Falha no cálculo** vai ao log e o lançamento fica sem o comentário.
Reversível: sim.

## 2026-10-12 — T-068 — Prompt versionado e avaliação da Mony
Contexto: o doc 08 pede o prompt em `mony_config` com uma versão ativa, publicada só depois das frases de teste (95%), e o conjunto de frases em `avaliacao/casos.yaml` rodando no CI. Decisões:
- **Frases em TypeScript** (`casos.ts`), não YAML: tipadas, sem dependência nova, e o mesmo arquivo serve ao teste e ao script.
- **`mony_config.avaliacao`** (coluna nova, `jsonb`) guarda o resultado da avaliação de cada versão; `ativar` recusa sem ela ou abaixo de 95%.
- **Cache de 1 minuto** da versão ativa: ativar vale em todas as instâncias sem reiniciar; banco fora do ar usa a última lida ou o prompt do código.
- **Avaliação pela conversa de verdade** (HTTP injetado no app, um usuário novo por frase, apagado no fim), não por chamada direta ao modelo: testa regras, ferramentas e componentes juntos. Por isso as frases resolvidas por regra rodam no CI com o modelo falso e as do modelo só com a chave.
- **Sem painel ainda**: criar, avaliar e ativar versão é pelo script `mony:avaliar` até a T-141. O workflow da avaliação não é obrigatório para mergear e roda só quando muda o que afeta a Mony.
- **Testes de integração** que olham o prompt fixam a configuração local (`fixar(CONFIG_LOCAL)`): os arquivos rodam em paralelo no mesmo banco e um deles ativa uma versão.
Reversível: sim.

## 2026-10-12 — T-069 — Tela de chat completa da Mony
Contexto: o doc 04 pede o histórico com FlashList invertida, busca e atalhos vindos da API (`sugestoes`), sem dizer quais atalhos. Decisões:
- **`FlatList` invertida**, não FlashList: sem dependência nativa nova agora; a troca é local à tela se uma conversa longa pesar.
- **Histórico lido uma vez por abertura** (`staleTime` infinito, `gcTime` 0): o que se conversa depois fica na tela; buscar de novo mostraria a mesma mensagem duas vezes. Os botões do histórico respondem como os novos (a API confere o estado: botão velho dá o erro dela no balão).
- **Atalhos pelo que a pessoa tem**, calculados na API só na primeira página sem busca: o mês, a fatura do primeiro cartão (ou anotar um gasto), os orçamentos (ou criar um) e as metas abertas. Nenhum atalho é um lançamento pronto ("gastei 25"), para um toque não gravar sem querer.
- **Busca numa folha**, a partir de 2 letras, só leitura: tocar no resultado não pula para a mensagem (fica para quando a conversa tiver âncora por id).
Reversível: sim.

## 2026-10-12 — T-083 — Resumos semanal e mensal e alertas no chat
Contexto: o doc 09 manda o resumo da segunda e do dia 1 "no chat + push" e já tinha `vaiParaChat` nos alertas, sem dizer o conteúdo nem quando a mensagem entra. Decisões:
- **Na rotina `alertas-diarios` das 09:00**, não numa rotina nova: o mesmo horário e o mesmo laço por fuso.
- **Períodos fechados**: a semana de segunda a domingo anterior e o mês anterior, comparados com o período de antes do mesmo tipo (sem movimento antes, sem comparação). Três categorias; no mês, os orçamentos estourados.
- **Sem movimento, sem resumo** (nem despesa nem receita): não manda "R$ 0,00" a quem não usa o app.
- **Chat na hora, push no fim do silêncio**: a mensagem da Mony não toca o aparelho. Todo alerta com `vaiParaChat` entra no chat, não só o resumo.
- **Porta `ChatDosAlertas`** no módulo de notificações, implementada na Mony (`ChatDaMony`, no `RascunhosModule`, que o worker já carrega): o motor não depende do resto da Mony.
- **Link `mony://mony`** (a aba do chat) entra nos `LINKS_INTERNOS`; o app passa a abrir links com a T-088.
Reversível: sim.

## 2026-10-12 — T-087 — Central de notificações e alertas da Mony no app
Contexto: o doc 04 põe a central atrás do sino e os "Alertas da Mony" no Perfil, sem detalhar a tela. Decisões:
- **Só os alertas que o app já manda** aparecem nas preferências; lembretes, compromissos, apps de compra, banco e novidades entram com as tarefas deles (as preferências deles continuam na API, ligadas).
- **Antecedência em chips** (no dia, 1, 3, 5 e 7 dias), dentro do 0–30 que a API aceita.
- **Salvar com botão**, mandando só o que mudou, em vez de gravar a cada chave: uma requisição só e o silêncio validado antes (hora "HH:MM", começo diferente do fim).
- **Links internos pelo app** (`rotaDoLink`): uma lista de padrões das rotas que existem; o resto (parcelamento, por exemplo) marca como lida e não navega. A T-088 usa a mesma função para o toque no push.
Reversível: sim.

## 2026-10-12 — T-100 — Cotas do plano gratuito
Contexto: o doc 05 punha a conta no `@RecursoLimitado`, antes do handler, e o RN-122 descreve um `UPDATE … WHERE quantidade < limite`; o RN-120 diz que o lançamento da Mony também conta. Decisões:
- **A conta é no Service que grava, dentro da transação dele** (`CotasService.consumir(contexto, recurso, tx)`), não num guard: a Mony chama os Services e não as rotas, e o que não foi gravado não conta (o erro desfaz). O `@RecursoLimitado` ficou só para marcar as rotas no contrato (`x-recurso-limitado`); uma resposta 403 tipada no OpenAPI trocaria o tipo de erro de todas as mutações do cliente gerado. Doc 05 corrigido.
- **Trava por usuário e recurso** (`pg_advisory_xact_lock`) e soma do dia e do mês em `uso_recursos`: o `UPDATE` de uma linha do RN-122 não confere o limite do mês, que soma vários dias. Só o gratuito é contado; no teste e nos planos pagos, nada é gravado em `uso_recursos`.
- **Plano que vale agora:** o teste que acabou é o gratuito sem esperar a rotina da T-101; inadimplente continua pago (RN-131); cancelada ou sem assinatura, gratuito.
- **O que conta:** app e Mony; rotinas, Open Finance e admin não. Parcelamento e recorrência criada contam um lançamento cada (as ocorrências não); lançamento de foto ou PDF, ao confirmar; mensagem de texto ou áudio e leitura de documento, ao chegar; editar, excluir, pagar fatura e aportar não contam.
- **Relatórios no gratuito:** o período é cortado ao mês atual (a tela de 6 meses e Ano continua funcionando, com um mês), e só a origem `app`; as consultas da Mony e os resumos das rotinas não são "relatórios". Pedido sem nenhum dia no mês atual: 403 com `recurso: relatorio`.
- **Aviso da Mony (RN-123):** a frase do limite e o botão [Ver planos], de ação `{ tipo: 'abrir', link }`, que o app abre sem chamar a API. O lançamento pelo rascunho é conferido antes da primeira pergunta (não pergunta o que não vai gravar).
- **Tela "Seu plano"** (`/mais/plano`) já nesta tarefa, para o [Ver planos] levar a algum lugar: o plano e o uso dos limites; a compra entra com a T-103.
- **Contadores de quantidade** só para cartão; listas de compras e lembretes ativos ganham os deles com a T-123 e a T-084.
Reversível: sim.

## 2026-10-13 — T-101 — Teste grátis de 3 dias
Contexto: o RN-125 pede um teste por pessoa pelo e-mail, pela conta Google/Apple e pelo aparelho, em resumo na `controle_teste`; o doc 09 põe os avisos do RN-124 na rotina das 01:15. Decisões:
- **Controle no cadastro, na mesma transação**, com `ON CONFLICT DO NOTHING`: se algum dos resumos já existia, a conta começa no `gratuito` (sem datas de teste). A chave única resolve dois cadastros ao mesmo tempo. Os resumos ficam também quando a conta é gratuita, e ficam depois de excluir a conta (T-140 deve mantê-los: sem eles, excluir e cadastrar de novo daria outro teste).
- **E-mail pela caixa de entrada**: minúsculo, sem `+etiqueta` e, no Gmail, sem pontos. Só para o controle; o login continua pelo e-mail digitado.
- **SHA-256 sem segredo**, como os outros resumos do banco (e-mail no limite de tentativas, tokens): trocar um segredo apagaria o controle. O aparelho é o identificador que o app manda no cadastro.
- **Avisos às 09:00 de cada pessoa**, na `alertas-diarios`, e não às 01:15 (push de madrugada): o 2º dia, o último (faltando menos de 24 horas, para o aviso sair antes do fim mesmo para quem se cadastrou cedo) e o do fim, na primeira rodada depois dele. Push, central e Mony; não urgentes (esperam o silêncio). O do fim é o "fim de teste" que o doc 09 já listava no tipo `assinatura`.
- **Encerramento às 01:15**, como no doc 09, só gravando `gratuito` (as datas ficam, para o aviso do fim e o histórico); antes dele, o teste vencido já vale como gratuito (T-100).
- **Selo "Teste grátis"** na linha "Seu plano" do Perfil.
- **Contas antigas** (antes da T-101) não ganham controles: ainda não há usuários reais.
Reversível: sim.

## 2026-10-13 — T-125 — Exportação dos relatórios em PDF e XLSX
Contexto: o RN-151 pede PDF e XLSX gerados no worker e entregues por URL assinada de 24 h, sem dizer o conteúdo nem como o app sabe que ficou pronto. Decisões:
- **Tabela `exportacoes_relatorio`** com o status (`processando`, `pronta`, `erro`), e o app pergunta por `GET /relatorios/exportacoes/:id` a cada 1,5 s: sem depender do histórico dos jobs no Redis, que é apagado. Sem push quando fica pronta: em geral leva segundos e a pessoa está na tela.
- **O mesmo conteúdo da tela**: as tabelas das rotas de relatório do período (com a evolução anual quando o período passa de um ano), montadas uma vez (`montarDocumento`) e desenhadas em PDF ou XLSX.
- **PDF com `pdfkit`** e as fontes padrão (Helvetica, que já tem os acentos); **XLSX escrito à mão** (OOXML mínimo, texto inline, uma aba por tabela) e compactado com `fflate`, em vez do `exceljs`, que trazia dezenas de dependências antigas. Na planilha, dinheiro em reais com formato de moeda, para dar para fazer conta; centavos continuam sendo a regra da API.
- **Arquivo em `exportacoes/relatorios/`**, o prefixo que o bucket já apaga sozinho (7 dias, doc 12), e não em `usuarios/`; a URL baixa com o nome `relatorio-<inicio>-a-<fim>.<formato>`. A URL é assinada a cada consulta e vale 24 h a partir dela.
- **O mesmo pedido enquanto gera devolve a mesma exportação**; 3 tentativas, e na última falha ela fica com `erro` (o app oferece tentar de novo).
- **Gratuito**: 403 `LIMITE_PLANO_ATINGIDO` com `recurso: relatorio` e a frase "No plano gratuito, os relatórios não são exportados."; o app mostra [Ver planos].
Reversível: sim.

## 2026-10-13 — T-022 — PoC UsageStats no Android
Contexto: o doc 10 deixava para a PoC escolher entre WorkManager periódico e serviço em primeiro plano. As sessões anteriores não compilavam Kotlin (decisão de 2026-10-11, "T-045 antes da T-022"); esta baixou o SDK do Android no contêiner da nuvem. Relatório em `docs/agentes/poc/T-022.md`. Decisões:
- **WorkManager periódico de 15 min** (o mínimo), com o trabalho único `UPDATE`: trocar a lista de apps não adia a próxima verificação. O serviço em primeiro plano fica como plano B, só se a medição no aparelho reprovar o atraso.
- **Abertura = volta ao app depois de 30 min sem vê-lo**, olhando `ACTIVITY_RESUMED` e `ACTIVITY_PAUSED`. Só com `RESUMED`, uma troca de tela depois de 40 min na mesma tela contaria como abertura nova. No mesmo milissegundo, a saída vem antes da entrada. A RN-104 continua no servidor.
- **Janela de leitura** de onde a anterior parou, no máximo 24 h para trás. Sem acesso ao uso, a janela não anda.
- **Lógica em Kotlin puro** (`DetectorAberturas`, `Historico`), testada com JUnit na JVM. O histórico nas preferências é texto com `|`, sem `org.json`, que na JVM dos testes só existe como esboço.
- **JS do módulo no app** (`src/lib/uso-de-apps.ts`, `requireOptionalNativeModule`), e não no pacote do módulo. Um pacote em `modules/` que dependesse do `expo` arriscaria uma segunda cópia dele no Metro (o mesmo cuidado do catálogo do pnpm com o React).
- **Módulo como dependência do workspace** (`"mony-app-usage": "workspace:*"` no app), que o autolinking acha, em vez do `nativeModulesDir`.
- **Sem config plugin no Android**: permissões e `<queries>` no manifesto do próprio módulo, que o build junta ao do app. `<queries>` de `MAIN/LAUNCHER` no lugar do `QUERY_ALL_PACKAGES`, que a Play restringe.
- **Tela de teste só em desenvolvimento** (Perfil → "Teste da detecção de apps", quando o módulo existe), fora do design: ela mede o atraso no aparelho. O aviso local da PoC usa um canal próprio (`poc-apps-de-compra`) para não criar o canal `alertas` antes da T-088 com outra importância.
- **Para a T-121, token de evento por aparelho** com escopo só para `POST /eventos/app-compra-aberto`: o worker roda sem o JS, e usar o refresh rotativo da sessão (RN-008) fora do app arriscaria dois processos renovando o mesmo token.
- **Workflow "Módulos nativos"** (`modulos-nativos.yml`): `expo prebuild` e `testDebugUnitTest` de cada módulo com `android/`, só quando `modules/**` ou as dependências do app mudam. Não é check obrigatório: com filtro de caminho, ele travaria os PRs que não o disparam.
- **Ambiente do agente**: o `sdkmanager` baixa o SDK de `dl.google.com` no contêiner da nuvem. O Maven Central responde 429 para a saída do contêiner, então um init script do Gradle fora do repositório (`~/.gradle/init.d`) troca o Maven Central pelo espelho do Google (`maven-central.storage-download.googleapis.com`) e o põe na frente. O CI do GitHub não precisa disso.
- **Lockfile mínimo**: `pnpm install` sem `--frozen-lockfile` também reescrevia a resolução de pares do `@swc/core` do admin. O lockfile do PR só ganhou as linhas do módulo, conferidas com `--frozen-lockfile`.

Reversível: sim.

## 2026-10-13 — T-023a — PoC do alarme no Android
Contexto: a T-023 pedia o alarme no iOS (AlarmKit) e no Android. O ambiente do agente compila Kotlin (T-022), mas não Swift. Relatório em `docs/agentes/poc/T-023a.md`. Decisões:
- **T-023 dividida** em T-023a (Android, esta) e T-023b (iOS, precisa de Mac com Xcode 26 ou de um job de macOS no CI). A T-084 passou a depender só da T-023a: no iOS, o lembrete com alarme sai como notificação até a T-023b, em vez de a T-084 ficar parada esperando um Mac.
- **`setAlarmClock` com `SCHEDULE_EXACT_ALARM`; sem a liberação, `setAndAllowWhileIdle`.** O `USE_EXACT_ALARM` não entra: a Play só o aceita em despertador ou agenda. A liberação concedida depois (`SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`) troca tudo por exatos.
- **Tela cheia sem declarar o app como despertador**: no Android 14+, a pessoa libera; sem isso, o alarme é notificação flutuante com som.
- **Agenda trocada inteira a cada sincronização** (o servidor é a fonte da verdade, doc 09), no máximo os 50 mais próximos (o Android recusa mais de 500 por app; o iOS guarda 64 notificações pendentes). Os adiados ficam fora da troca, com id `<id>:adiado`, até tocarem.
- **Canal `alarmes` criado pelo módulo**, com `USAGE_ALARM` e o toque de alarme do aparelho (toca no modo silencioso), porque som e importância só valem na criação do canal. A T-088 cria os outros três. Som insistente por até 10 min, como o "silenciar depois de 10 min" dos despertadores.
- **Textos do alarme pelo i18n**: canal e botões vão na `sincronizar` e ficam guardados para o disparo sem o JS.
- **Receptores**: um não exportado (disparo, parar, adiar; só o app manda) e um exportado só para avisos que só o sistema manda (ligar o aparelho, atualizar o app, liberar o alarme exato).
- **Tela de teste** só em desenvolvimento (Perfil → "Teste do alarme"), como a da T-022. `horaDoAparelho` foi para `src/lib/datas-texto.ts`, com segundos opcionais.

Reversível: sim.

## 2026-10-13 — Humano — T-066 antes da T-023b
Contexto: pela regra de prioridade a próxima tarefa livre era a T-023b (alarme no iOS). Sem Mac, o Swift só compilaria num job de macOS no CI, por tentativa e erro, e o teste fica para um iPhone. Decisão do humano: seguir com a T-066 (NFC-e); a T-023b fica na fila para quando houver Mac. Reversível: sim.

## 2026-10-13 — T-066a — NFC-e na API
Contexto: doc 10 (NFC-e), PoC da T-026 e doc 05 (`POST /mony/nfce`). Decisões:
- **T-066 dividida** em API (T-066a), QR no app (T-066b) e histórico de preços (T-066c).
- **Rota JSON, não SSE**: `POST /mony/nfce` responde como `POST /mony/acoes` (`RespostaAcaoMony`), com idempotência; a mensagem da pessoa ("QR Code do cupom fiscal") e a resposta entram no histórico. Está no OpenAPI (cliente gerado `lerNfceMony`).
- **A compra passa por confirmação, como a foto** (RN-083 estendida): a nota vem da Sefaz, mas a mesma compra pode já ter sido lançada à mão. Reaproveita a importação da T-065: `importacoes_documento` ganhou o tipo `nfce` e `arquivo_id` opcional; `resultado.notaNfceId` aponta a nota. Um lançamento só, o total pago, com a descrição pelo nome da loja sem o sufixo jurídico (`nomeDoEstabelecimento`), para as preferências do estabelecimento (RN-090) acharem a mesma loja.
- **Forma de pagamento do cupom** (`formaDePagamentoDoCupom`): uma forma só vale; formas diferentes, vale e crédito da loja ficam sem forma, e a Mony pergunta. Guardada em `nfce_notas.forma_pagamento` (coluna nova), porque a nota da nova tentativa pode ser lançada horas depois.
- **Data da compra**: a Sefaz devolve o relógio da loja, sem fuso; vale o fuso do usuário (sem a hora, meio-dia).
- **Origem `foto`** na compra confirmada, como tudo que a Mony lê de documento (T-065). Uma origem `nfce` pediria mudar o enum `origem_transacao` sem ganho para o usuário agora.
- **Nota ligada à transação no rascunho**: o [Confirmar] passa pelo rascunho (RN-080), então o `notaNfceId` vai em `rascunhos_lancamento.dados` e a gravação liga `nfce_notas.transacao_id` e `transacoes.nfce_nota_id`.
- **Uma consulta por chave e usuário**: ler o mesmo QR mostra o cartão que espera (sem consultar nem contar na cota), ou avisa que já foi lançado. QR inválido ou de homologação não consulta nem conta.
- **Novas tentativas na fila `mony-midia`** (5 min, 1 h, 6 h; um job por tentativa com id fixo), para nota em contingência, emissão recente e consulta fora do ar. O worker só carrega o `ConsultasNfceModule` (provedor, repositório, fila e `ChatDaMony`), não a Mony inteira: a nota encontrada vira mensagem da Mony com o botão [Ver a compra] (ação `importar_nfce`), e o cartão é montado na API, no toque. O `ChatDosAlertas.enviar` aceita componentes. Sem push por enquanto: a mensagem aparece quando a pessoa abre o chat (como os alertas da T-083).
- **Infosimples por `fetch`**, só com o token e a chave no corpo. Valores pelos campos `normalizado_*` (números) ou pelo texto em pt-BR, sempre convertidos a centavos sem multiplicar em ponto flutuante; o total é o "valor a pagar" (com desconto). Códigos: 612 = nota não encontrada; 600, 605, 609, 610, 613–618 e os da conta (601–603) = indisponível; o resto, recusa. A confirmar com cupons reais (BLOQUEIOS).
- **Cota**: o nome do recurso `leitura_documento` nas mensagens passou a "leitura de foto, PDF ou cupom" (API e app).

Reversível: sim.

## 2026-10-14 — T-066b — QR Code do cupom fiscal no app
Contexto: doc 04 e doc 10 pedem a leitura com `expo-camera` e o envio a `POST /mony/nfce`, sem dizer onde fica o botão nem o que fazer com QR errado. Decisões:
- **Na folha do clipe**, como a primeira opção ("QR Code do cupom fiscal"): é a mesma ideia de mandar um documento para a Mony, sem um botão a mais na barra do chat.
- **Leitor em tela cheia** (`Modal`), só QR; o conteúdo lido é conferido na hora com `lerQrNfce` e só o cupom que vale sai do aparelho. QR de outra coisa, chave danificada, NF-e (modelo 55) e cupom de homologação avisam e a câmera continua. A câmera repete o mesmo código várias vezes por segundo: o mesmo conteúdo não é tratado de novo, e depois do cupom lido nada mais até abrir de novo.
- **Sem digitar a chave** por enquanto: a API aceita, mas a tela fica para quando aparecer cupom com QR ilegível (a foto, T-065, cobre o caso).
- **`expo-camera` com o mesmo texto de câmera do `expo-image-picker`** (agora citando o QR do cupom) e o mesmo texto de microfone dos outros plugins: o plugin também pede o `RECORD_AUDIO` no Android, que a mensagem de voz já usa.
Reversível: sim.

## 2026-10-14 — T-066c — Histórico de preços da NFC-e
Contexto: o BACKLOG cita o índice `to_tsvector` do doc 06 e a RN-150 só diz "histórico de preços NFC-e". Decisões:
- **Sem o GIN de `to_tsvector`**, como na T-037: o `to_tsvector('portuguese')` reduz as palavras ao radical e não acha pedaço ("lei" não acha "leite"), e a descrição do cupom é abreviada ("LTE INT 1L"). A busca é `LIKE '%palavra%'` em cada palavra, sem acento (`translate(lower(…))`, com as maiúsculas acentuadas também, para o caso de o `lower` do banco só tratar ASCII), sobre os itens de um usuário só. Se pesar, `pg_trgm`.
- **Produto = mesma descrição (sem acento, minúscula, espaços simples) e mesma unidade.** Não junta descrições diferentes do mesmo produto em lojas diferentes ("LEITE INTEGRAL 1L" e "LT INTEGRAL 1L"): cada uma vira um card. Juntar por semelhança fica para quando houver cupons reais (a lista de compras, RN-071, usa a mesma busca).
- **Loja pelo CNPJ**, com o nome do emitente sem o sufixo jurídico (`nomeDoEstabelecimento`); filiais aparecem separadas.
- **Limites**: 500 itens mais recentes e 20 produtos por busca. Preço é o valor unitário do cupom.
- **Período padrão da API** (12 meses; no gratuito, o mês atual, RN-120), sem seletor na tela: o histórico é para comparar ao longo do tempo.
- **Tela própria** (`/relatorios/precos`), aberta pelo último bloco dos Relatórios, porque é uma busca, não um gráfico do período da aba.
Reversível: sim.

## 2026-10-14 — T-084a — Lembretes na API
Contexto: RN-075 a RN-077 e o doc 09 dizem o quê (repetição em RRULE, soneca, [Feito] pela notificação, alarme sincronizado), mas não como guardar a ocorrência nem o que é "personalizado". Decisões:
- **T-084 dividida** em API (T-084a, esta) e app (T-084b). As ações da notificação e o push silencioso no app ficam na T-088, que trata todo push.
- **RRULE num subconjunto, sem biblioteca:**
  - aceita `FREQ` (diária, semanal, mensal, anual), `INTERVAL` (1 a 99), `BYDAY` na semanal, `BYMONTHDAY` na mensal e anual, `BYMONTH` na anual e `UNTIL` como data;
  - recusa `COUNT` e o resto;
  - a hora vem do lembrete, no fuso do usuário (horário de verão certo);
  - a regra é completada pela data pedida e guardada canônica, então a próxima ocorrência sai só da regra e da atual, sem guardar o `DTSTART`;
  - dia 31 cai no último dia do mês e volta (como nas recorrências, RN-043), o que diverge da RFC, que pula o mês.

  Alternativa: o `rrule`, que pede o `DTSTART` guardado e conta `COUNT`.
- **`data_hora` é a ocorrência atual, e uma coluna nova, `disparado_em`**, diz que ela já tocou. Sem ela, a rotina por minuto não sabe se o único já tocou sem olhar a central (e o lembrete só com alarme no Android nem passa pela central). O único que tocou fica ativo e "pendente" até o [Feito], e conta no limite do gratuito.
- **A ocorrência vai no link do push** (`mony://lembretes/<id>?ocorrencia=<ms>`), para o [Feito] da notificação de um lembrete que repete não pular a próxima: com a ocorrência que já passou (ou o fim da soneca), o [Feito] só tira a soneca. Sem ocorrência (da lista), o [Feito] da repetição pula a próxima.
- **Adiar "amanhã"** = o dia seguinte ao de hoje, no fuso, na hora do lembrete. A soneca do feito é `CONFLITO`.
- **Só com alarme**:
  - no Android, o push não vai, porque o aparelho toca e um push junto seria repetido;
  - com iPhone, vai, porque lá o alarme é a T-023b. Com os dois aparelhos, o Android também recebe o push.
- **Alarmes:** as ocorrências dos próximos 35 dias e as sonecas, as 50 mais próximas.
- **Push silencioso:** job por usuário com 5 s de espera, para juntar mudanças seguidas. Sem Redis, fica no log, porque o app também sincroniza ao abrir.
- **Excluir = `cancelado`** (some de tudo; as `ligacoes` da T-122 apontam para o lembrete). `DELETE /lembretes/:id` entrou nas rotas do doc 05.
- **A ligação** fica fora dos canais aceitos até a T-122.
- **Na tela do plano** (`GET /assinatura/uso`), "Lembretes ativos" entra com o uso.

Reversível: sim (a coluna nova só acrescenta).

## 2026-10-14 — T-084b — Lembretes no app
Contexto: o design (página 6) traz a lista com Próximos, Recorrentes e Feitos, o bloco da hora ou do dia e o selo do canal. Não traz o formulário, a tela do lembrete nem o pedido das permissões do alarme. Decisões:
- **Grupos de Próximos:** "Já tocaram" (pendentes, que esperam o [Feito]), Hoje, Amanhã e Próximos dias. O selo é o canal mais forte (Alarme; senão, Push).
- **Data e hora em campos de texto com máscara**, como no resto do app, sem o seletor nativo. O novo sugere a próxima hora cheia.
- **A repetição do formulário não manda `BYMONTHDAY` nem `BYMONTH`**: a API completa pela data, então mudar a data muda o dia da repetição. A semanal começa pelo dia da semana da data.
- **A tela do lembrete é o destino do push** (`/lembretes/<id>`), com [Feito], [Adiar], Editar e Excluir. O feito tem "Lembrar de novo", que manda a data nova (reativa, RN-120).
- **Sincronização dos alarmes:**
  - acontece no layout das abas, ao abrir e ao voltar para o app, e depois de toda mudança em lembrete (mesmo sem alarme, para cobrir o lembrete que perdeu o canal);
  - sem o módulo, não faz nada; com erro, fica a agenda de antes.
- **Permissões do alarme:** pedidas uma vez, guardadas no aparelho (`AsyncStorage`), só as que faltam, e depois de salvar o primeiro lembrete com alarme.
- **O calendário do cabeçalho** (a agenda) fica para a T-085.
- **A tela de teste do alarme (T-023a) fica**, só no build de desenvolvimento, até medir nos aparelhos e fazer a T-023b.

Reversível: sim.


## 2026-10-14 — T-HOTFIX — Tempo dos testes do app no CI
Contexto: o reporter `github-actions` do Jest (PR #77) mostrou a falha que deixava o Verificar vermelho de vez em quando: o primeiro teste de um arquivo (`renderRouter` com todas as rotas) passou dos 30 s.

No CI, o `turbo run build lint typecheck test` roda o Jest junto com o bundle do Metro (iOS e Android) e os testes da API. Além disso, a primeira transformação do app é fria, sem cache do Jest. Localmente, o mesmo teste leva 2 s.

Decisão: o tempo limite dos testes do app que abrem rotas vai a 60 s (`TEMPO_LIMITE_MS`), sem mudar as esperas de cada passo (10 s). Alternativas: o teste do app depender do build no `turbo.json` (o CI fica mais lento) ou guardar o cache do Jest no CI.

Reversível: sim.

## 2026-10-14 — T-086a — Mony com lembretes e ajuda do app
Contexto: o doc 08 lista `criar_lembrete` ("com canal"), `criar_compromisso`, `consultar_agenda` e `ajuda_app` ("base de ajuda do app, markdown versionado"), mas as agendas são da T-085 (👤). Decisões:
- **T-086 dividida:** lembretes e ajuda agora (T-086a); compromissos e agenda (T-086b) depois da T-085.
- **`criar_lembrete` com data e hora locais e a repetição estruturada.**
  - Por quê: o modelo erra menos com `{ frequencia, dias: ['seg'] }` do que escrevendo RRULE, e a conversão para o instante (fuso, horário de verão) fica no servidor.
  - A notificação vai sempre; o alarme, quando a pessoa pede.
  - Grava direto, sem [Desfazer]: o lembrete se exclui na tela dele, aberta pelo [Ver lembrete].
- **`consultar_lembretes`** entrou, embora não esteja no doc 08, para "quais meus lembretes?".
- **Base de ajuda como módulo TypeScript** (`modulos/ajuda/base-ajuda.ts`), com o texto em markdown: entra no build sem copiar arquivos. A busca é por palavra-chave e título, sem índice nem embeddings, porque com 15 tópicos basta.
- **"Agora: HH:MM" no contexto** da Mony, para a hora relativa dos lembretes.
- **Avaliação:** o caso `definir-orcamento` esperava `valorLimiteCentavos`, mas o campo da ferramenta é `limiteCentavos`; foi corrigido. Os casos de lembrete não fixam a data, porque a avaliação roda no dia de hoje.

Reversível: sim.

## 2026-10-14 — T-088 — Push no app
Contexto: o doc 04 diz que "a ação chama a API em segundo plano" e que o app reagenda os alarmes "ao receber push silencioso". Com o app fechado, o `expo-notifications` só entrega ao JS por uma tarefa de segundo plano. Essa tarefa roda sem a tela, e a sessão do app renova o token a cada abertura: se a tarefa e o app renovassem com o mesmo token, a sessão cairia (RN-004). Decisões:
- **Os botões abrem o app** (`opensAppToForeground` padrão). O app faz a ação e mostra a tela do lembrete ou da fatura. É o caminho que funciona com o app fechado sem tarefa de segundo plano.
- **O push silencioso** sincroniza os alarmes com o app aberto (ouvinte de notificação recebida). Fechado, vale a sincronização da abertura.
- O segundo plano de verdade virou a **T-088b**, com teste em aparelho.
- **[Paguei]** paga a fatura sem corpo (`POST /faturas/:id/pagar`, o restante, hoje, a conta do cartão), com a `Idempotency-Key` `paguei-<notificação>`.
- **Canais:** `lembretes` com prioridade máxima, `alertas` alta, `novidades` padrão.
- **Plugin:** com `enableBackgroundRemoteNotifications`, o iOS acorda o app para o silencioso quando ele está em segundo plano.
- **Ícone:** fica o do app até o cliente mandar o monocromático.

Reversível: sim.

## 2026-10-14 — T-123a — Listas de compras na API
Contexto: RN-071 e RN-072 deixam em aberto a busca do preço, o mapeamento da categoria e o "Finalizar" concorrente; RN-120 não diz se a lista finalizada conta. Decisão: (1) o preço sugerido é o último preço unitário de um item de cupom com todas as palavras do nome nos últimos 90 dias, e sem nada só com a primeira palavra de 3 letras ou mais (reusa a busca da T-066c pelo `RelatoriosService`); (2) cada tipo de lista tem nomes de categoria em ordem (`CATEGORIA_DA_LISTA`: mercado → Mercado/Alimentação, casa → Moradia/Casa/Compras, carro → Transporte/Carro, farmácia → Saúde/Farmácia, outra → Compras/Outros), e vale a primeira que a pessoa tiver; (3) o "Finalizar" reserva a lista (`finalizada_em` só se aberta) antes de lançar e a reabre se o lançamento falhar, para dois toques não lançarem duas despesas; (4) no gratuito conta só a lista aberta, a finalizada é histórico. Alternativa: busca por similaridade (pg_trgm) e lançar a despesa na mesma transação da lista (o `TransacoesService` abre a dele). Reversível: sim, `ultimasComprasDoProduto`, `CATEGORIA_DA_LISTA`, `ListasService.finalizar` e `CotasRepository.contarItens`.

## 2026-10-14 — T-123b — Telas das listas de compras
Contexto: o design (página 6) mostra uma lista aberta direto na tela "Listas", com os comprados no topo, e o atalho Lista no Início. Decisão: (1) a tela das listas tem os chips do tipo (com "Todas") e os cartões das listas, e cada lista abre numa tela própria, porque um tipo pode ter várias listas (RN-070); (2) os itens ficam na ordem em que entraram, sem pular para o fim ao marcar (a API deixou de pôr os não comprados primeiro); (3) a caixa de comprado muda na hora e volta se a API falhar; (4) o atalho Lista do Início toma o lugar de Metas (Orçamentos segue no lugar de Ler nota). Alternativa: a lista aberta inline na tela das listas, como no design. Reversível: sim, `TelaListas`, `ListasService.detalhe`, `useAtualizarItem` e `Atalhos`.

## 2026-10-15 — T-123c — Mony nas listas de compras
Contexto: o doc 08 lista `gerenciar_lista_compras` sem dizer o formato, e o BACKLOG pede que o "Finalizar" pela Mony passe pela confirmação como os lançamentos. Decisões: (1) **uma ferramenta com `acao`** (`consultar`, `criar_lista`, `adicionar_itens`, `marcar_itens`, `remover_itens`, `finalizar`) e um esquema plano, porque o JSON Schema de uma união no topo não é aceito como entrada de ferramenta; os campos de cada ação são conferidos no código. (2) **Sem `listaId`, vale a única lista aberta**: "põe leite na lista" funciona sem consultar antes; com mais de uma aberta, a falha traz os nomes para o modelo perguntar. (3) Pôr, marcar e tirar itens **gravam direto** (como `definir_orcamento`), com o [Ver lista]; só o "Finalizar" pede confirmação, porque lança dinheiro. (4) **Finalizar sem a forma de pagamento dita** mostra um botão por forma (Pix, Débito, Dinheiro e o crédito de cada cartão; sem boleto), e o toque já é a confirmação; com a forma dita, um [Finalizar R$ X]. O valor e a categoria vão fixos no botão, para lançar o que a pessoa viu. (5) Depois do toque, o cartão de resumo **sem [Desfazer]**: desfazer tiraria a despesa e deixaria a lista fechada sem ela (reabrir a lista pela Mony fica para quando alguém pedir). (6) O app não muda: ele devolve a ação do botão como veio. Alternativa: ferramentas separadas por ação (mais nomes para o modelo escolher) ou o rascunho de lançamento (T-061) para perguntar a forma. Reversível: sim, `ListasMony` e `GerenciarListaComprasTool`.

## 2026-10-15 — T-124a — Compartilhar listas
Contexto: RN-074 diz convite, conta obrigatória e `ver` ou `editar`, e o doc 05 lista três rotas. Decisões: (1) **A T-124 foi dividida** em API das listas (T-124a), tempo real (T-124b), lembretes compartilhados (T-124c) e telas (T-124d). (2) **Convite pelo e-mail ou pelo telefone** da conta; telefone em mais de uma conta (o cadastro não o deixa único) pede o e-mail. (3) **Rotas a mais**: `GET`, `recusar` e `PATCH` (permissão). (4) **Convidar de novo usa o mesmo convite** (chave única recurso + convidado): recusado volta a pendente, aceito só muda a permissão. (5) **Até 20 convites por hora**: a resposta diz se o contato tem conta, então o limite segura a varredura de e-mails. (6) **Sem acesso, 404; com acesso menor, 403** (`ACESSO_NEGADO`): quem foi convidado já sabe que a lista existe. (7) **Só o dono** muda nome e tipo, apaga e convida; `editar` mexe nos itens e finaliza, e a despesa é de quem finaliza, na categoria padrão dele (RN-074 já dizia). (8) **Item continua do dono** (`usuario_id`), como o schema dizia; o preço sugerido vem das notas de quem põe. (9) **Sem limite de plano para compartilhar**; a lista conta só para o dono. (10) **Apagar a lista apaga os convites** no serviço, porque `recurso_id` não tem chave estrangeira. (11) Sem push do convite por enquanto: o app mostra os convites recebidos na T-124d. Alternativa: convite por link. Reversível: sim, `CompartilhamentosService` e `ListasService.acesso`.

## 2026-10-15 — T-124b — Listas em tempo real
Contexto: RN-074 pede edição em tempo real, e os docs 02 e 05 já fixavam Socket.IO com adaptador Redis em `/v1/ws`. Decisões: (1) **O aviso não leva dados**, só `{ listaId, motivo }`, e o app busca a lista de novo: o detalhe muda conforme quem vê (acesso, preço pelas notas de quem vê, orçamento dele). (2) **O token é conferido só na conexão**; um token que expira não derruba o socket, porque o aviso não revela nada e a busca exige token válido. Perder o acesso tira a pessoa da sala na hora. (3) **Só WebSocket, sem long polling**: o ALB não precisa de sessão fixa entre instâncias. (4) **Sala do usuário** (`usuario:<id>`) para tirar todos os aparelhos de quem foi removido. (5) Entrar sem acesso responde `NAO_ENCONTRADO`, como a API. (6) O `socket.io` fica na mesma versão que o `@nestjs/platform-socket.io` usa, para os tipos baterem. Alternativa: mandar a lista inteira no evento (um envio por pessoa) ou SSE. Reversível: sim, `AvisosTempoReal` e `ListasGateway`.

## 2026-10-15 — T-HOTFIX — Imagens do CI pelo mirror.gcr.io
Contexto: o pull de `public.ecr.aws/docker/library/postgres` falhou no "Initialize containers" três vezes no mesmo dia (limite de dados do espelho público da AWS), nos PRs #84, #85 e #86; o Docker Hub já recusava pulls do runner desde 09/10. Decisão: Postgres e Redis do CI e da avaliação da Mony pelo `mirror.gcr.io/library/…`, o cache público do Google para as imagens oficiais do Docker Hub (mesmas tags e digests). Alternativa: login no Docker Hub com segredo. No build da imagem da API no CI, o Node vem do mesmo espelho por `--build-arg IMAGEM_NODE` (o `Dockerfile` e o deploy continuam na AWS). Reversível: sim, só o `image:` e o `--build-arg` dos workflows.

## 2026-10-15 — T-124c — Lembretes compartilhados
Contexto: RN-074 diz convite, conta obrigatória e `ver` ou `editar`, e o BACKLOG deixa em aberto quem conclui e adia. Decisões: (1) **O lembrete continua do dono**: a hora, o fuso, a cota (RN-120) e os alarmes do aparelho são dele. (2) **`ver` vê e recebe o aviso; `editar` também conclui e adia**, e vale para todos (a agenda é uma só), como marcar item na lista; mudar, excluir e convidar são do dono. (3) **Quem aceitou recebe o push** da rotina, com a hora no fuso dele e o nome do dono, mesmo quando o dono só tem o alarme; o alarme local fica só no aparelho do dono (`GET /lembretes/alarmes` traz só os próprios). (4) O push do convidado com `ver` traz os botões [Feito] e [Adiar] (a categoria vem do tipo); o toque responde 403 "Você só pode ver este lembrete." Tirar os botões pede um tipo de alerta novo, e fica para quando o app mostrar a falha mal (T-124d). (5) **Excluir o lembrete apaga os convites.** (6) O worker passou a ter o `LimitesModule`, porque a rotina usa o `CompartilhamentosService`. (7) `AcessoLista` virou `AcessoRecurso`, para servir aos dois. Alternativa: soneca de cada pessoa (uma agenda por convidado). Reversível: sim, `LembretesService.acesso` e `DisparoLembretes`.

## 2026-10-15 — T-124d — Compartilhar no app
Contexto: o doc 04 só citava os avatares e "compartilhada com 1 pessoa"; a T-124c deixou para o app a falha do push com `ver`. Decisões: (1) **Os avatares vêm de `GET /compartilhamentos`** (os enviados aceitos), sem campo novo no detalhe da lista, que só tem a contagem; na de outro, o avatar é o do dono. (2) **Convite com "Ver e mudar" por padrão**: o caso comum é dividir a lista do mercado com quem também compra. (3) **Os convites recebidos ficam no topo das Listas e dos Lembretes**, cada um com os seus, sem tela própria nem badge, até existir push do convite. (4) **Uma conexão Socket.IO para o app todo**, aberta só enquanto uma lista compartilhada está na tela; a própria sem ninguém não conecta. (5) **O 403 do botão do push vira um alerta** com a mensagem da API, e a tela do lembrete abre como antes; os botões continuam no push (tirar pede outra categoria de notificação). (6) **"Sair" apaga o próprio convite** (`DELETE /compartilhamentos/:id`), com confirmação. Alternativa: tela "Compartilhados comigo" na aba Mais. Reversível: sim, `features/compartilhamentos` e `lib/tempo-real.ts`.

## 2026-10-15 — T-149 — Parcelas e duplicados na importação de fatura e extrato
Contexto: a T-065 lançava cada linha à vista, com "(parcela 2/10)" na descrição, sem conferir o que já existia; o BACKLOG pede reconhecer a parcela e não duplicar "mesmo valor, data e cartão". Decisões: (1) **A parcela vira o parcelamento inteiro** (valor da parcela × total, com a data da compra que a linha mostra), porque as próximas faturas trazem as outras parcelas e o limite do cartão precisa delas; a fatura brasileira mostra a data da compra original na linha parcelada. (2) **Campos `parcelaAtual` e `parcelaTotal` na leitura**, com a descrição como reserva só quando tem "parc"/"parcela" (sem a palavra, "05/10" pode ser data). (3) **Já lançado não é descartado sozinho**: o cartão avisa e o [Confirmar todos] passa por ele, mas o [Confirmar] grava, porque duas compras iguais no mesmo dia existem. (4) **A parcela casa pelo número, total e valor (1 centavo de folga)**, sem a data, porque a despesa da parcela tem a data dela, não a da compra. (5) Só fatura e extrato conferem duplicados; cupom e comprovante continuam como estavam (o cupom fiscal já tem a nota). Alternativa: casar também pela descrição (a da fatura é diferente da que a pessoa escreveu). Reversível: sim, `acharJaLancados`, `parcelaDoLancamento` e `DocumentosMony.resolver`.

## 2026-10-15 — T-102 — Stripe com a conta de teste do dono, antes da PoC
Contexto: a T-102 dependia da PoC T-024 e da conta Stripe do cliente (👤). O dono pediu para seguir já, com a conta Stripe dele em modo de teste; trocar para a do cliente depois é só chave, segredo do webhook e rodar o `cobranca:configurar` lá. Decisões: (1) **O dono manda: a T-102 começa antes da T-024**, e o teste de cartão e Pix no checkout da conta de teste faz o papel da PoC. (2) **Provedor `CobrancaProvider` com Stripe e falso**, como e-mail e NFC-e; o falso em produção responde 503, porque um webhook sem conferência liberaria plano pago. (3) **Retorno pela API** (`/v1/assinatura/retorno` → `mony://planos?checkout=…`): a Stripe só aceita `https` no `success_url`. (4) **O worker lê a assinatura na Stripe** em vez de usar o objeto do evento, porque os eventos chegam fora de ordem. (5) **`unpaid` conta como fim** (RN-131: acabaram as tentativas), igual a `canceled`. (6) **O webhook não tem o decorador `@Webhook`** do doc 05: um só provedor; vira decorador se o Open Finance repetir o caminho. (7) **Preços provisórios para o teste: R$ 19,90 por mês e R$ 199,00 por ano**; o PDF não traz valores (confirmar com cliente). Alternativas: esperar a conta do cliente (parado); PaymentSheet dentro do app (depende das regras das lojas, doc 10). Reversível: sim; os valores mudam rodando o script de novo (RN-129).

## 2026-10-15 — T-102 — Teste na conta Stripe do dono e Pix
Contexto: teste real na conta BR de teste do dono (cartão e Pix ligados no painel). Resultado: assinatura mensal com cartão 4242 paga no checkout, eventos com assinatura conferida, plano liberado (RN-128); assinatura anual criada e cancelada pela API voltou ao gratuito (RN-131). O Pix não funciona em assinatura: o checkout só mostra cartão, e pedindo `pix` a Stripe recusa por `setup_future_usage`; fatura enviada também recusa. Decisões: (1) **O código continua sem lista de formas de pagamento** (assinatura = cartão). (2) **Pix no anual como pagamento único vira a T-105**, que é a resposta sugerida à pergunta 9 do doc 15 (confirmar com cliente). (3) **A T-024 conta como feita** por este teste. O webhook foi testado entregando os eventos reais da Stripe na API local, assinados com um segredo local, porque o ambiente não tinha URL pública nem acesso ao checkout.stripe.com; o webhook de verdade fica para staging (BLOQUEIOS). Alternativa: Pix mensal por fatura avulsa a cada mês (fora da Stripe Billing). Reversível: sim.

## 2026-10-15 — T-103 — Telas de planos e assinatura no app
Contexto: o BACKLOG punha a compra dentro de "Seu plano"; o design do cliente (pág. 9) traz uma tela de planos própria, com [X]. Decisões: (1) **Tela própria `/planos`, como no design**, e o `mony://planos` (Mony, avisos do teste) e todos os [Ver planos] levam a ela; "Seu plano" continua com o uso e ganha o [Ver planos] (sem plano pago) ou o valor, a próxima cobrança e o [Gerenciar assinatura] (com plano pago). (2) **Rodapé "Cartão · renovação automática · cancele quando quiser"**, sem o "ou Pix" do design: a Stripe não aceita Pix em assinatura (teste da T-102); o Pix no anual é a T-105. (3) **Quem decide se pagou é o servidor**: na volta com `checkout=sucesso`, o app pergunta `GET /assinatura` a cada 1,5 s, até 30 s (RN-128). (4) **Fechar o navegador sem a volta de sucesso pergunta uma vez**: nas versões de desenvolvimento e preview o esquema do app é `mony-dev`/`mony-preview`, e o `mony://` que a API devolve não fecha o navegador no Android; a pessoa fecha e o app confere. (5) **"equivale a" arredonda** o anual ÷ 12 ao centavo (R$ 16,58), só para exibir. (6) **[Ver planos] nos formulários** de lançamento, cartão e lembrete quando a API responde `LIMITE_PLANO_ATINGIDO`, como já era nas listas e na exportação. Alternativa: a compra dentro de "Seu plano", sem tela própria. Reversível: sim, `features/planos` e `links-internos.ts`.

## 2026-10-15 — T-104a — Login do painel admin com 2FA
Contexto: doc 11 pede login separado, 2FA TOTP obrigatório e sessão curta, sem detalhar. Decisões: (1) **Mesma conta do app, com papel `admin`**, e não uma tabela de admins à parte; o primeiro admin é promovido por comando (`admin:promover`), porque não há tela para isso sem um admin. (2) **Audiências de JWT separadas** (`mony` do app, `mony-admin` do painel, `mony-admin-2fa` do desafio): um token não serve no lugar do outro, e a guarda devolve 403 `ACESSO_NEGADO` na troca. (3) **Sessão sem linha no banco**: token de 15 minutos renovado pelo painel até 8 horas do login (`auth_time` no token); a cada renovação a API confere se a pessoa ainda é admin e está ativa, então rebaixar ou bloquear corta o acesso em até 15 minutos. (4) **Segredo do 2FA cifrado com chave derivada da chave do JWT (HKDF)**, para não ter outro segredo para guardar; trocar a chave do JWT obriga a refazer o 2FA (`--refazer-2fa`). (5) **TOTP próprio (RFC 6238, ~90 linhas)**, sem biblioteca, testado com os vetores do RFC. (6) **Sessão do painel na `sessionStorage`**, não na `localStorage`: some ao fechar a aba. (7) No cliente da API, `/v1/admin/auth/` também não dispara renovação no 401 (a renovação recusada esperaria por ela mesma), e um `Authorization` passado na chamada vence o token da sessão (o desafio do 2FA). Alternativa: sessão de admin no banco com revogação imediata. Reversível: sim, `modulos/admin` e `apps/admin/src/lib/sessao.ts`.
