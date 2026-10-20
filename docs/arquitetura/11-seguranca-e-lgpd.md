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
| Limite de tentativas | Contadores por e-mail (resumo SHA-256) e por IP no Redis, janela fixa de 15 minutos (`core/limites`, RN-008), separados para login, pedido de código e conferência de código. Login com sucesso zera o contador do e-mail; código certo zera o da conferência; senha redefinida zera o do login. |
| Limite geral por IP | Guard global `GuardaLimiteGeral` (`core/limites/limite-geral.ts`, T-144a) no mesmo contador do Redis: `LIMITE_REQUISICOES_IP_MINUTO` (padrão 1200) por IP por minuto, alto porque muita gente sai pelo mesmo IP da operadora (CGNAT). Passou do limite, 429 `MUITAS_TENTATIVAS`. Ficam de fora a saúde e os webhooks (`@SemLimiteGeral()`); 0 desliga. O IP é o que o ALB pôs por último no `X-Forwarded-For` (`trustProxy: 1` em produção), porque os da esquerda vêm do cliente; o painel, que passa pelo CloudFront, conta pelo IP do CloudFront. O WAF na frente do ALB soma o limite da borda |
| Posse do recurso | Repositories sempre filtram `usuario_id`; testes de acesso cruzado por rota |
| Login social | Validar `id_token` do Google e da Apple no servidor (assinatura, `aud`, `iss`, `nonce`; ver [10](10-integracoes.md#login-social)). Token de uso único. Login social com e-mail de conta existente só vincula depois do login com senha ou código (RN-002). Conta nova exige e-mail confirmado no provedor |
| Admin | Login separado, 2FA TOTP obrigatório, sessão curta (token de 15 minutos, no máximo 8 horas por login), IP allowlist opcional. Detalhes no doc 13, "Acesso" |

## Dados e infraestrutura

| Requisito (PDF) | Implementação |
|---|---|
| Cabeçalhos de segurança | Toda resposta da API leva `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin` e `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (menos a página da documentação, `/v1/docs`). HSTS (`max-age=31536000; includeSubDomains`) só em produção (`configurar-app.ts`, T-144a) |
| Só HTTPS | ALB com TLS 1.2+, HSTS; app com ATS (iOS) e `usesCleartextTraffic=false` (Android) |
| Criptografia em repouso | RDS e S3 com KMS |
| Tokens de agenda e Open Finance criptografados na aplicação | Criptografia de envelope: chave de dados por registro, cifrada pela KMS; AES-256-GCM. Serviço `core/cripto`. **Como está (T-085a):** `Cifra` gera uma chave de dados por valor e a cifra com a chave mestra de `CRIPTO_CHAVE_MESTRA` (32 bytes em base64), no formato `v1.<chave de dados cifrada>.<valor cifrado>`; fora de produção, sem ela, vale uma chave fixa de desenvolvimento, e em produção, sem ela, nada é cifrado (conectar a agenda responde 503). A KMS no lugar da chave mestra entra na T-085b |
| Chaves de API em cofre | AWS Secrets Manager, lidas na subida; nada em código, `.env` de produção ou app |
| Webhooks validados por assinatura | Stripe: `stripe-signature`. Agregador: assinatura/segredo do fornecedor. Corpo bruto preservado |
| Arquivos só por URL assinada | S3 privado; upload e download por URL pré-assinada de curta validade (5 min upload, 15 min leitura). Chave do objeto inclui `usuarioId` e é conferida |
| Backup diário, 30 dias, teste de restauração | Snapshots automáticos do RDS com retenção de 30 dias + PITR; restauração testada todo mês em homologação (checklist) |
| CORS restrito | Só o domínio do painel admin. O app não usa CORS |
| Erros detalhados só em log | Filtro global devolve código + mensagem genérica; detalhe vai para log/Sentry com `requestId` |

Complementos **(decisão técnica)**:
- WAF na frente do ALB (regras gerenciadas + limite por IP).
- Validação de upload (T-144b): ao ligar o arquivo (lançamento ou mensagem da Mony), a API lê os primeiros 64 bytes no S3 (`Range`) e confere o tipo real (`core/arquivos/tipo-real.ts`): JPEG, PNG, WebP, HEIC, PDF, M4A, AAC, MP3 ou WebM, no mesmo grupo do declarado (imagem, PDF ou áudio; PDF só com PDF). Tamanho máximo pelo tipo: PDF 20 MB, imagem e áudio 10 MB (10 min de voz a 64 kbps dão uns 5 MB). Fora disso, o arquivo é apagado do S3 e a ligação responde 400. A Mony recebe o tipo real.
- Proteção contra SSRF na consulta de NFC-e (lista de domínios Sefaz).
- Logs sem dados sensíveis: o pino troca por `[redigido]` os cabeçalhos `authorization`, `cookie` e `stripe-signature` e os campos `senha`, `senhaNova`, `senhaAtual`, `renovacao`, `refreshToken`, `tokenPush`, `idToken`, `token`, `totpSegredo`, `cpf` e `numeroCartao`, no topo, um nível abaixo e no corpo da requisição (`CAMINHOS_REDIGIDOS` em `core/log/log.module.ts`, T-144a). Campo sensível novo entra nessa lista.
- Dependências: Dependabot semanal para npm (Expo e React Native ficam de fora, sobem com o SDK), mensal para Actions e Terraform. O job **Dependências** do CI roda `pnpm audit --prod`: vulnerabilidade alta ou crítica bloqueia, e as moderadas aparecem no log sem bloquear. Falha alta sem correção publicada só passa registrada em `auditConfig.ignoreGhsas` (`pnpm-workspace.yaml`), com o motivo; falha corrigida numa dependência que outro pacote fixa entra por `overrides`, com a condição para sair.
- App: sem segredos no bundle; detecção de jailbreak/root só como sinal para analítica, não bloqueio **(decisão técnica)**.

## LGPD

| Requisito (PDF) | Implementação |
|---|---|
| Termos e política aceitos com versão e data | Tabela `aceites_termos`; nova versão pede novo aceite (RN-007) |
| Consentimento separado e revogável para Open Finance, agenda, apps de compra e ligações | Tabela `consentimentos`; revogar desliga o recurso e apaga dados derivados quando aplicável. Como está (T-140d): o consentimento é gravado quando a pessoa liga o recurso (conectar a agenda, ligar os apps de compra no aparelho, pôr a ligação num lembrete), `GET /consentimentos` mostra cada finalidade e `DELETE /consentimentos/:finalidade` revoga: desconecta as agendas externas e tira os compromissos delas, derruba os tokens de evento dos apps de compra, tira a ligação dos lembretes. Open Finance com o provedor (T-140f); a tela no app na T-140e (doc 05, "Consentimentos") |
| Exportar meus dados | Job no worker (fila `privacidade`) gera um ZIP com JSON + XLSX de todas as tabelas do usuário, sem hashes, tokens e segredos; link assinado por 24 h no app (Perfil > Privacidade) e por e-mail (RN-160, T-140a). Um teste exige que toda tabela nova com `usuario_id` entre na exportação ou tenha o motivo de ficar fora |
| Excluir conta | Fluxo de RN-161 (T-140b): confirma com a senha ou com um código por e-mail, encerra as sessões e agenda a exclusão para 7 dias depois, com o cancelamento da assinatura no fim do período; entrar de novo e desistir desfaz tudo. Vencido o prazo, a rotina `excluir-contas` põe o job na fila `privacidade`: cancela a assinatura na Stripe na hora, apaga os arquivos do S3 (anexos e exportações), apaga os dados e deixa a linha de `usuarios` anonimizada (`status = excluido`, e-mail `excluida-<id>@excluida.invalid`, sem nome, telefone, senha ou foto). Ficam, sem nada que identifique a pessoa no app: `assinaturas` (histórico de cobrança), `acessos_diarios` e `logs_ia` (métricas, sem texto), `auditoria`, `aceites_termos` e `consentimentos` (prova), e a `controle_teste` (RN-125, sem `usuario_id`). Conexões de Open Finance e agendas saem do banco com os tokens; quando houver provedor (T-120, T-085), a exclusão também revoga lá. Um teste exige que toda tabela nova com `usuario_id` seja apagada ou tenha o motivo de ficar |
| Retenção de fotos e áudios | Arquivo apagado após o prazo; lançamento fica (RN-162). A rotina `limpar-arquivos` (diária, 03:30, T-140c) apaga do S3 os anexos enviados há mais dias que o prazo do painel (padrão 90) e a linha de `anexos`; o lançamento perde só o anexo. Sem regra de ciclo de vida no S3 para `usuarios/`, porque o prazo muda no painel |
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
