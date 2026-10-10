# 11 — Segurança, privacidade e LGPD

O app guarda dados financeiros e acessa contas bancárias. Segurança e LGPD são requisitos desde a primeira linha (do PDF).

## Autenticação

| Requisito | Implementação |
|---|---|
| Senha com hash forte | Argon2id (`@node-rs/argon2`), parâmetros memória 64 MB, iterações 3. Nunca em log. E-mail inexistente também passa por uma conferência de hash, para o tempo de resposta não revelar quem tem conta |
| Access token curto | JWT 15 min, assinado com chave assimétrica (ES256) guardada no Secrets Manager (`JWT_CHAVE_PRIVADA`); `kid` para rotação (`JWT_ID_CHAVE`). A chave pública sai da privada. Fora de produção, sem chave configurada, a API gera uma temporária na subida |
| Refresh por aparelho, revogável | Token aleatório de 256 bits; banco guarda só o hash SHA-256 (`sessoes.refresh_token_hash`). Vale 60 dias sem uso. Rotação a cada uso; reuso detectado revoga todas as sessões do aparelho (a família, RN-004). Uma sessão por aparelho |
| Tokens no aparelho | `expo-secure-store` (Keychain com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` / Android Keystore) |
| Biometria | Só destrava o refresh local (RN-005) |
| Recuperação de senha | Código de 6 dígitos com gerador criptográfico, guardado com o mesmo Argon2id das senhas (só um milhão de valores; o hash lento atrasa quem ler o banco). 15 minutos, uso único, 5 tentativas erradas por código, e o pedido de outro código invalida o anterior (RN-003). A resposta do pedido é igual exista a conta ou não. A senha nova encerra as sessões de todos os aparelhos. O e-mail passa pela fila, que guarda o código só até o envio |
| Limite de tentativas | Contadores por e-mail (resumo SHA-256) e por IP no Redis, janela fixa de 15 minutos (`core/limites`, RN-008), separados para login, pedido de código e conferência de código. Login com sucesso zera o contador do e-mail; código certo zera o da conferência; senha redefinida zera o do login. Limite geral por IP (`@nestjs/throttler` ou WAF) fica para o hardening (T-144) |
| Posse do recurso | Repositories sempre filtram `usuario_id`; testes de acesso cruzado por rota |
| Login social | Validar `id_token` do Google e da Apple no servidor (assinatura, `aud`, `iss`, `nonce`) |
| Admin | Login separado, 2FA TOTP obrigatório, sessão curta, IP allowlist opcional |

## Dados e infraestrutura

| Requisito (PDF) | Implementação |
|---|---|
| Só HTTPS | ALB com TLS 1.2+, HSTS; app com ATS (iOS) e `usesCleartextTraffic=false` (Android) |
| Criptografia em repouso | RDS e S3 com KMS |
| Tokens de agenda e Open Finance criptografados na aplicação | Criptografia de envelope: chave de dados por registro, cifrada pela KMS; AES-256-GCM. Serviço `core/cripto` |
| Chaves de API em cofre | AWS Secrets Manager, lidas na subida; nada em código, `.env` de produção ou app |
| Webhooks validados por assinatura | Stripe: `stripe-signature`. Agregador: assinatura/segredo do fornecedor. Corpo bruto preservado |
| Arquivos só por URL assinada | S3 privado; upload e download por URL pré-assinada de curta validade (5 min upload, 15 min leitura). Chave do objeto inclui `usuarioId` e é conferida |
| Backup diário, 30 dias, teste de restauração | Snapshots automáticos do RDS com retenção de 30 dias + PITR; restauração testada todo mês em homologação (checklist) |
| CORS restrito | Só o domínio do painel admin. O app não usa CORS |
| Erros detalhados só em log | Filtro global devolve código + mensagem genérica; detalhe vai para log/Sentry com `requestId` |

Complementos **(decisão técnica)**:
- WAF na frente do ALB (regras gerenciadas + limite por IP).
- Validação de upload: tipo real do arquivo (magic bytes), tamanho máximo (20 MB PDF, 10 MB imagem, 10 min de áudio).
- Proteção contra SSRF na consulta de NFC-e (lista de domínios Sefaz).
- Logs sem dados sensíveis: redação automática de `senha`, `token`, `authorization`, números de cartão, CPF.
- Dependências com Dependabot/Renovate e `pnpm audit` no CI.
- App: sem segredos no bundle; detecção de jailbreak/root só como sinal para analítica, não bloqueio **(decisão técnica)**.

## LGPD

| Requisito (PDF) | Implementação |
|---|---|
| Termos e política aceitos com versão e data | Tabela `aceites_termos`; nova versão pede novo aceite (RN-007) |
| Consentimento separado e revogável para Open Finance, agenda, apps de compra e ligações | Tabela `consentimentos`; revogar desliga o recurso e apaga dados derivados quando aplicável |
| Exportar meus dados | Job no worker gera JSON + XLSX com todas as tabelas do usuário; link assinado por 24 h (RN-160) |
| Excluir conta | Fluxo de RN-161: revoga Open Finance e agendas, cancela Stripe, apaga arquivos do S3, anonimiza registros que precisam ficar por obrigação legal (ex.: dados fiscais de cobrança) e apaga o resto |
| Retenção de fotos e áudios | Arquivo apagado após o prazo; lançamento fica (RN-162). Regra de ciclo de vida no S3 + limpeza diária |
| Provedor de IA sem treino | Cláusula contratual / configuração de retenção zero quando disponível |
| Auditoria de acesso pelo admin | Tabela `auditoria` grava toda leitura de dados de usuário e toda alteração feita no painel |
| DPO | Indicado na política de privacidade (responsabilidade do cliente) |

Base legal sugerida por finalidade (validar com o jurídico do cliente): execução de contrato (finanças, chat), consentimento (Open Finance, agenda, apps de compra, ligações, analítica de produto), legítimo interesse (segurança e prevenção a fraude, como o controle de um teste por pessoa).

## Checklist de segurança antes de cada release

- [ ] Nenhum segredo novo fora do Secrets Manager.
- [ ] Rotas novas com teste de acesso cruzado.
- [ ] Rotas novas com rate limit adequado.
- [ ] Dados novos sensíveis listados na exportação e na exclusão de conta.
- [ ] Logs revisados para não vazar dados pessoais.
- [ ] Permissões novas do app justificadas nos textos do sistema e nos formulários das lojas.
