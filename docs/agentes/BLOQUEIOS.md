# Bloqueios que dependem de humano

Uma linha por bloqueio: `- <ID> — <o que falta> — <quem resolve> — <data>`. Quem resolver apaga a linha.

- T-021 — Pedir à Apple o entitlement Family Controls (demora; pedir já) — humano/cliente — 2026-10-08
- T-085 — Iniciar a verificação do app no Google para escopos de agenda (demora; pedir já) — humano/cliente — 2026-10-08
- Geral — Respostas do cliente às perguntas de docs/arquitetura/15-roadmap-e-pendencias.md — cliente — 2026-10-08
- T-031 — Conta Brevo do cliente: domínio do remetente verificado (SPF e DKIM) e chave da API. Com isso, gravar `BREVO_CHAVE_API` no segredo `mony/<ambiente>/app` e ligar `EMAIL_PROVEDOR=brevo`, `EMAIL_REMETENTE` e a leitura da chave no `infra/modulos/ambiente/ecs.tf`. Até lá, staging não envia e-mails (avisa no log) — humano/cliente — 2026-10-09
- T-066 — Conta de teste no provedor de NFC-e (Infosimples, R$ 100 de crédito grátis) e teste com 20 cupons reais das UFs prioritárias; preço por consulta e cobertura do DF (docs/agentes/poc/T-026.md) — humano/cliente — 2026-10-09
