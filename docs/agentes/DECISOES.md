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
