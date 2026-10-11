# Bloqueios que dependem de humano

Uma linha por bloqueio: `- <ID> — <o que falta> — <quem resolve> — <data>`. Quem resolver apaga a linha.

- T-021 — Pedir à Apple o entitlement Family Controls (demora; pedir já) — humano/cliente — 2026-10-08
- T-085 — Iniciar a verificação do app no Google para escopos de agenda (demora; pedir já) — humano/cliente — 2026-10-08
- Geral — Respostas do cliente às perguntas de docs/arquitetura/15-roadmap-e-pendencias.md — cliente — 2026-10-08
- T-031 — Conta Brevo do cliente: domínio do remetente verificado (SPF e DKIM) e chave da API. Com isso, gravar `BREVO_CHAVE_API` no segredo `mony/<ambiente>/app` e ligar `EMAIL_PROVEDOR=brevo`, `EMAIL_REMETENTE` e a leitura da chave no `infra/modulos/ambiente/ecs.tf`. Até lá, staging não envia e-mails (avisa no log) — humano/cliente — 2026-10-09
- T-081 — Push de verdade: chave do FCM (Android) e do APNs (iOS) no projeto do EAS (junto com a T-010) e `PUSH_PROVEDOR=expo` no ambiente do worker (`infra/modulos/ambiente/ecs.tf`, PR #12). Se ligar a segurança de push no EAS, gravar `EXPO_ACCESS_TOKEN` no segredo `mony/<ambiente>/app`. Até lá, o worker não envia push (avisa no log) — humano — 2026-10-10
- T-032 — Clientes OAuth no Google Cloud (iOS, Android com o SHA-1 da assinatura e web) e Sign in with Apple ativado no App ID, em nome do cliente. Com os IDs, preencher `GOOGLE_CLIENT_IDS` e `APPLE_CLIENT_IDS` no ambiente da API (variáveis públicas no `ecs.tf`). Até lá, `/auth/social` responde 503 — humano/cliente — 2026-10-10
- T-017 — Design do cliente (de preferência tokens exportados do Figma: cores, tipografia, espaços, raios, sombras), ícones e se o app terá modo escuro — cliente — 2026-10-11
- T-066 — Conta de teste no provedor de NFC-e (Infosimples, R$ 100 de crédito grátis) e teste com 20 cupons reais das UFs prioritárias; preço por consulta e cobertura do DF (docs/agentes/poc/T-026.md) — humano/cliente — 2026-10-09
- T-010 — Criar o projeto no EAS na conta Expo do cliente (`eas init` em `apps/mobile`) e copiar o projectId para `PROJETO_EAS` no `app.config.ts`; definir `EXPO_PUBLIC_API_URL` de preview e produção e o `SENTRY_AUTH_TOKEN` no EAS; confirmar o identificador do app nas lojas — humano/cliente — 2026-10-09
- T-016 — Depois do projeto no EAS (T-010): gravar no GitHub as variáveis `EAS_PROJECT_ID` e `EXPO_OWNER` e o segredo `EXPO_TOKEN` (token de robô da conta Expo), e fazer o primeiro build de `preview` (README, "EAS Update em staging") — humano/cliente — 2026-10-11
- T-020 — Validar a PoC da Mony no aparelho (iOS e Android, depois do login da T-034) e com a chave da Anthropic (`IA_PROVEDOR=anthropic`, `ANTHROPIC_CHAVE_API`); passo a passo em docs/agentes/poc/T-020.md, "O que falta validar" — humano — 2026-10-11
- T-015 — Domínio do cliente (doc 15, pergunta 16): preencher `dominio` em `infra/ambientes/staging/main.tf`, criar a zona, delegar o NS a partir do domínio principal e aplicar (infra/README.md, "Domínio e HTTPS") — humano/cliente — 2026-10-11
- T-013 — Aplicar o Terraform na conta AWS de staging do cliente, gravar as variáveis `STAGING_*` no GitHub e a chave JWT no segredo `mony/staging/app` (passo a passo em infra/README.md) — humano/cliente — 2026-10-09
