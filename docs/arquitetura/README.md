# Mony — Arquitetura de desenvolvimento

Documentação técnica para construir o app **Monitorizze** com a assistente **Mony**, a partir da especificação do cliente (`Arquitetura_App_Monitorizze.pdf`, 27 páginas, 08/10/2026).

O PDF diz **o que** o produto faz. Estes arquivos dizem **como** vamos construir: stack, estrutura de código, convenções, regras de negócio consolidadas e numeradas, contratos de API, ordem de entrega e os pontos que ainda dependem do cliente.

## Decisões principais

| Tema | Decisão |
|---|---|
| App mobile | React Native com **Expo** (SDK estável mais recente), TypeScript, **Development Builds** + **EAS Build/Submit/Update** |
| Cobertura de aparelhos | Android 7.0+ (API 24) e iOS na versão mínima do SDK Expo escolhido. Recursos que exigem sistema mais novo são ligados por detecção de capacidade, nunca derrubam o app |
| Módulos nativos | Swift e Kotlin via **Expo Modules API** + config plugins (sem "eject") |
| API | **NestJS** (TypeScript), monólito modular, REST `/v1`, OpenAPI automático |
| Banco | **PostgreSQL** com **Prisma** |
| Filas e rotinas | **Redis + BullMQ**, processo `worker` separado da API |
| Painel admin | React + Vite consumindo a mesma API |
| Repositório | **Monorepo** pnpm + Turborepo, tipos e schemas compartilhados entre app, API e admin |
| Nuvem | AWS `sa-east-1` (São Paulo) |
| Design | Telas vêm prontas do cliente. O app tem uma camada de **design tokens** e componentes base para encaixar o design sem tocar em regra de negócio |

## Índice

| # | Arquivo | Conteúdo |
|---|---|---|
| 01 | [01-visao-geral-e-escopo.md](01-visao-geral-e-escopo.md) | Produto, escopo, fora de escopo, glossário |
| 02 | [02-stack-e-decisoes.md](02-stack-e-decisoes.md) | Stack completa e registros de decisão (ADRs), incluindo por que Expo |
| 03 | [03-monorepo-e-convencoes.md](03-monorepo-e-convencoes.md) | Estrutura de pastas, idioma do código, Git, lint, commits |
| 04 | [04-app-mobile.md](04-app-mobile.md) | Arquitetura do app Expo: navegação, estado, rede, auth, nativo, design |
| 05 | [05-api-nestjs.md](05-api-nestjs.md) | Arquitetura da API: módulos, camadas, padrões, erros, rotas |
| 06 | [06-modelo-de-dados.md](06-modelo-de-dados.md) | 41 tabelas do PDF, convenções, índices e tabelas propostas a mais |
| 07 | [07-regras-de-negocio.md](07-regras-de-negocio.md) | Todas as regras de negócio numeradas (RN-xxx), com fórmulas |
| 08 | [08-mony-agente-ia.md](08-mony-agente-ia.md) | Agente Mony: orquestração, ferramentas, rascunhos, custo, testes |
| 09 | [09-notificacoes-e-rotinas.md](09-notificacoes-e-rotinas.md) | Motor de alertas, push, alarmes, ligações e rotinas agendadas |
| 10 | [10-integracoes.md](10-integracoes.md) | Open Finance, Stripe, agendas, NFC-e, apps de compra, voz, e-mail |
| 11 | [11-seguranca-e-lgpd.md](11-seguranca-e-lgpd.md) | Autenticação, criptografia, segredos, LGPD |
| 12 | [12-infra-e-devops.md](12-infra-e-devops.md) | Ambientes, AWS, CI/CD, EAS, monitoramento |
| 13 | [13-painel-admin.md](13-painel-admin.md) | Painel web administrativo |
| 14 | [14-testes-e-qualidade.md](14-testes-e-qualidade.md) | Estratégia de testes, incluindo testes da Mony |
| 15 | [15-roadmap-e-pendencias.md](15-roadmap-e-pendencias.md) | Fases de entrega, provas de conceito, riscos e perguntas ao cliente |

## Como usar estes documentos

- Toda regra de negócio tem um código `RN-xxx` em [07](07-regras-de-negocio.md). Issues, PRs e testes citam esse código.
- Quando algo não está no PDF e foi decidido por nós, o texto marca **(decisão técnica)**. Quando depende do cliente, marca **(confirmar com cliente)** e entra na lista de [15](15-roadmap-e-pendencias.md#perguntas-ao-cliente).
- Mudou uma decisão? Atualize o ADR em [02](02-stack-e-decisoes.md) e o arquivo afetado no mesmo PR.
- Estes arquivos vivem em `docs/arquitetura/` do monorepo e mudam no mesmo PR que muda o código.
