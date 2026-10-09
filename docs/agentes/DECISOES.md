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
