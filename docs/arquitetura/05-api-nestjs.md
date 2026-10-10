# 05 — API (NestJS)

## Estrutura

```
apps/api/
├─ src/
│  ├─ main.ts                    # Entrypoint HTTP
│  ├─ worker.ts                  # Entrypoint dos consumidores BullMQ e rotinas
│  ├─ app.module.ts
│  ├─ core/                      # Infra transversal (sem regra de negócio)
│  │  ├─ prisma/                 # PrismaService, extensão de soft delete
│  │  ├─ auth/                   # GuardaAutenticacao, TokensAcesso, @UsuarioAtual(), @Publico(), AdminGuard + 2FA
│  │  ├─ limites/                # Contadores de tentativas no Redis (RN-008)
│  │  ├─ planos/                 # @RecursoLimitado('lancamento'), PlanoGuard
│  │  ├─ idempotencia/           # Interceptor de Idempotency-Key (Redis)
│  │  ├─ erros/                  # Filtro global, catálogo de códigos de erro
│  │  ├─ eventos/                # Barramento interno de eventos de domínio
│  │  ├─ filas/                  # Definição de filas BullMQ
│  │  ├─ arquivos/               # S3, URL assinada
│  │  ├─ cripto/                 # Criptografia de campo (KMS envelope)
│  │  ├─ auditoria/
│  │  └─ config/
│  ├─ modulos/                   # Um módulo por domínio
│  │  ├─ autenticacao/  usuarios/  assinaturas/  planos/
│  │  ├─ categorias/  contas/  transacoes/  recorrencias/
│  │  ├─ cartoes/  faturas/  parcelamentos/
│  │  ├─ orcamentos/  metas/  relatorios/  dashboard/
│  │  ├─ listas-compras/  compartilhamentos/
│  │  ├─ lembretes/  agenda/
│  │  ├─ notificacoes/  alertas/          # motor de alertas
│  │  ├─ apps-monitorados/
│  │  ├─ open-finance/  nfce/
│  │  ├─ mony/                            # agente de IA
│  │  ├─ novidades/  admin/
│  │  └─ lgpd/                            # exportar e excluir conta
│  └─ integracoes/               # Adaptadores de fornecedores (um por pasta)
│     ├─ ia/            (LlmProvider, TranscricaoProvider)
│     ├─ open-finance/  (OpenFinanceProvider → pluggy | belvo | klavi)
│     ├─ pagamentos/    (BillingProvider → stripe)
│     ├─ push/          (PushProvider → expo-push | fcm+apns)
│     ├─ agenda/        (CalendarProvider → google | microsoft)
│     ├─ nfce/          (NfceProvider → api-terceiro | sefaz-scraper)
│     ├─ telefonia/     (VozProvider → twilio)
│     └─ email/         (EmailProvider → brevo | smtp | fake; modelos/ com os e-mails)
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                    # Categorias padrão, limites do gratuito, planos
└─ test/
```

## Camadas dentro de um módulo

```
modulos/cartoes/
├─ cartoes.controller.ts     # HTTP: rota, DTO, status code. Nada de regra
├─ cartoes.service.ts        # Casos de uso. ÚNICO ponto de entrada da regra
├─ cartoes.repository.ts     # Acesso ao Prisma, sempre filtrando usuarioId
├─ dominio/
│  ├─ calcular-fatura.ts     # Funções puras (datas de fechamento, limite)
│  └─ calcular-fatura.spec.ts
├─ dto/                      # Reexporta schemas Zod de @mony/shared
├─ eventos.ts                # Eventos emitidos (ex.: CompraNoCartaoRegistrada)
└─ cartoes.module.ts
```

Regras:
- **Controller → Service → Repository.** Controller nunca chama Prisma.
- **Cálculos são funções puras** em `dominio/`, testadas sem banco (datas de fatura, Price, projeção, faixas).
- **A Mony chama Services**, nunca Controllers nem Prisma (regra de arquitetura do PDF). Todo Service recebe um `Contexto` com `usuarioId`, `origem` (`app`, `mony`, `open_finance`, `admin`, `sistema`) e `idempotencyKey`.
- Comunicação entre módulos: chamada direta ao Service exportado quando é síncrona e transacional (criar transação + atualizar fatura). Efeitos colaterais (alertas, preferências aprendidas, analítica) por **evento de domínio** → fila BullMQ, para não deixar a resposta lenta.
- Operações financeiras com várias escritas usam `prisma.$transaction` com isolamento adequado; atualização de saldo de fatura usa `SELECT … FOR UPDATE` na fatura.

## Isolamento por usuário

- Toda tabela de dados do usuário tem `usuario_id`.
- Repositories recebem `usuarioId` obrigatório no construtor do método; não existe método "buscar por id" sem usuário.
- Teste automatizado em cada rota: usuário A não lê, edita nem apaga recurso de B (retorno 404, não 403, para não revelar existência).
- Compartilhamentos (listas, lembretes) passam por `CompartilhamentosService.verificarAcesso(usuarioId, recurso, recursoId, permissao)`.

## Contrato HTTP

- Prefixo `/v1`. Quebra de contrato gera `/v2` só da rota afetada.
- JSON `camelCase`, dinheiro em centavos inteiros (`valorCentavos`), datas ISO 8601.
- Paginação por cursor: `?cursor=&limite=50` → `{ itens, proximoCursor }`.
- Filtros por query string validados por Zod.
- Erros sempre no formato:

```json
{ "erro": { "codigo": "LIMITE_PLANO_ATINGIDO", "mensagem": "Você atingiu 3 lançamentos hoje.", "detalhes": { "recurso": "lancamento", "renovaEm": "2026-10-09T03:00:00Z" } } }
```

  Códigos estáveis em `@mony/shared/erros` (o app traduz e decide a UI, por exemplo mostrar [Ver planos]). Mensagens internas e stack só no log (PDF, Segurança).
- `Idempotency-Key` obrigatório em `POST` que cria transação, parcelamento, pagamento de fatura, aporte e checkout. Resposta guardada no Redis por 24 h.
- Mutações financeiras devolvem `impacto` junto com o recurso criado (ex.: `{ cartao: { percentualUsado: 62 }, orcamento: { percentualUsado: 81 } }`), que o app e a Mony usam para a mensagem "Nubank: 62% do limite usado".
- OpenAPI em `/v1/docs` (só fora de produção ou atrás de autenticação).

## Rotas

Base do PDF, com os complementos marcados **(proposta)**.

| Grupo | Rotas |
|---|---|
| Autenticação | `POST /auth/cadastro` · `POST /auth/login` · `POST /auth/social` · `POST /auth/renovar` · `POST /auth/sair` · `POST /auth/sair-todos` **(proposta)** · `POST /auth/senha/codigo` · `POST /auth/senha/conferir` **(proposta)** · `POST /auth/senha/redefinir` |
| Usuário | `GET /me` · `PATCH /me` · `POST /me/dispositivos` · `GET /me/onboarding` · `PATCH /me/onboarding` **(proposta)** · `GET /me/exportar` · `DELETE /me` |
| App | `GET /config-app` **(proposta)**: versão mínima, flags, sugestões do chat |
| Planos e assinatura | `GET /planos` · `GET /assinatura` · `GET /assinatura/uso` · `POST /assinatura/checkout` · `POST /assinatura/portal` · `POST /webhooks/stripe` |
| Categorias | `GET /categorias` · `POST /categorias` · `PATCH /categorias/:id` · `DELETE /categorias/:id?mover_para=` |
| Contas | `GET /contas` · `POST /contas` · `PATCH /contas/:id` · `DELETE /contas/:id` **(proposta; tabela existe no PDF, rotas não)** |
| Transações | `GET /transacoes` · `GET /transacoes/totais` · `POST /transacoes` · `PATCH /transacoes/:id` · `DELETE /transacoes/:id` · `POST /transacoes/lote` · `POST /transacoes/:id/unir` **(proposta, conflito Open Finance)** |
| Recorrências | `GET /recorrencias` · `POST /recorrencias` · `PATCH /recorrencias/:id` · `DELETE /recorrencias/:id` |
| Cartões e faturas | `GET /cartoes` · `POST /cartoes` · `PATCH /cartoes/:id` · `DELETE /cartoes/:id` · `GET /cartoes/:id/faturas` · `GET /faturas/:id` · `POST /faturas/:id/pagar` |
| Parcelamentos | `GET /parcelamentos` · `POST /parcelamentos` · `PATCH /parcelamentos/:id` · `DELETE /parcelamentos/:id` · `POST /parcelas/:id/pagar` · `POST /parcelas/:id/desfazer` · `POST /parcelamentos/simular` |
| Orçamentos e metas | `GET /orcamentos?competencia=` · `PUT /orcamentos` · `GET /metas` · `POST /metas` · `PATCH /metas/:id` · `POST /metas/:id/aportes` |
| Dashboard e relatórios | `GET /dashboard?periodo=` · `GET /relatorios/:tipo?inicio=&fim=` · `POST /relatorios/exportar` |
| Listas de compras | `GET /listas` · `POST /listas` · `PATCH /listas/:id` · `DELETE /listas/:id` · `POST /listas/:id/itens` · `PATCH /itens/:id` · `DELETE /itens/:id` **(proposta)** · `POST /listas/:id/finalizar` |
| Compartilhamento | `POST /compartilhamentos` · `POST /compartilhamentos/:id/aceitar` · `DELETE /compartilhamentos/:id` |
| Lembretes e agenda | `GET /lembretes` · `POST /lembretes` · `PATCH /lembretes/:id` · `POST /lembretes/:id/concluir` · `POST /lembretes/:id/adiar` · `GET /agenda?inicio=&fim=` · `POST /agendas/conectar` · `GET /agendas/oauth/callback` **(proposta)** · `POST /compromissos` · `PATCH /compromissos/:id` **(proposta)** |
| Notificações | `GET /notificacoes` · `POST /notificacoes/:id/lida` · `GET /preferencias-alerta` · `PUT /preferencias-alerta` |
| Apps de compra | `GET /apps-monitorados` · `PUT /apps-monitorados` · `POST /eventos/app-compra-aberto` |
| Open Finance | `POST /open-finance/token-conexao` · `GET /open-finance/conexoes` · `POST /open-finance/conexoes/:id/sincronizar` · `DELETE /open-finance/conexoes/:id` · `POST /webhooks/open-finance` |
| Mony | `POST /mony/mensagens` (SSE) · `POST /mony/acoes` · `GET /mony/conversa` · `POST /mony/nfce` |
| Arquivos | `POST /arquivos` (retorna URL assinada de upload) · `GET /arquivos/:id` (retorna URL assinada de leitura) |
| Novidades | `GET /novidades` · `POST /novidades/:id/lida` |
| Admin | `GET /admin/usuarios` · `PATCH /admin/usuarios/:id` · `GET /admin/assinaturas` · `GET /admin/metricas` · CRUD `/admin/novidades` · `GET/PUT /admin/mony/config` · `GET /admin/logs-ia` · `GET/PUT /admin/planos` · `GET/PUT /admin/limites` · CRUD `/admin/cupons` · `GET /admin/auditoria` **(proposta)** |
| Tempo real | WebSocket `/v1/ws` (Socket.IO), salas `lista:<id>` para listas compartilhadas |

## Autenticação

Implementada na T-030 e na T-031 (RN-001 a RN-008; detalhes de segurança em [11](11-seguranca-e-lgpd.md#autenticação)).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/cadastro` | nome, e-mail, telefone, senha, `aceites` (versões dos termos e da privacidade), `dispositivo` | 201 + sessão |
| `POST /auth/login` | e-mail, senha, `dispositivo` | 200 + sessão |
| `POST /auth/renovar` | `renovacao` | 200 + sessão nova (o token anterior deixa de valer) |
| `POST /auth/sair` | `renovacao` | 204 |
| `POST /auth/sair-todos` | (token de acesso) | 204 |
| `POST /auth/senha/codigo` | e-mail | 202, exista a conta ou não (RN-003) |
| `POST /auth/senha/conferir` | e-mail, `codigo` | 204 se o código vale; não gasta o código |
| `POST /auth/senha/redefinir` | e-mail, `codigo`, senha nova, `dispositivo` | 200 + sessão; as sessões dos outros aparelhos caem |

- **Sessão** (`@mony/shared/autenticacao`, `esquemaSessao`): `usuario`, `tokens` (`acesso`, `acessoExpiraEm`, `renovacao`, `renovacaoExpiraEm`) e `aceitesPendentes` (documentos com versão nova a aceitar, RN-007).
- **Guarda global:** toda rota exige `Authorization: Bearer <acesso>`, menos as com `@Publico()`. Sem token ou token inválido → 401 `NAO_AUTENTICADO`; token vencido → 401 `TOKEN_EXPIRADO` (o app renova e repete a chamada).
- **Erros:** `EMAIL_JA_CADASTRADO` (409), `TERMOS_PENDENTES` (403, cadastro com versão antiga), `CREDENCIAIS_INVALIDAS` (401, a mesma para e-mail inexistente e senha errada), `CONTA_BLOQUEADA` (403), `SESSAO_INVALIDA` (401, renovação recusada), `MUITAS_TENTATIVAS` (429, com `detalhes.tenteNovamenteEm`).
- **Dispositivo:** o app manda um identificador estável do aparelho, gerado na instalação. Há uma sessão por aparelho: login de novo no mesmo aparelho troca a sessão.
- **Recuperação de senha (RN-003):** código de 6 dígitos por e-mail, válido por 15 minutos, com até 5 tentativas erradas; pedir outro faz o anterior vencer. O fluxo do app é e-mail → código (`conferir`) → senha nova (`redefinir`). Erros: `CODIGO_INVALIDO` (400, inclusive para e-mail sem conta) e `CODIGO_EXPIRADO` (400: vencido, usado, substituído ou com as tentativas esgotadas; o app oferece pedir outro).

## Usuário e app

Implementado na T-033.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /me` | — | Perfil: nome, e-mail, telefone (e se está verificado), foto, fuso, `onboardingConcluido`, `temSenha`, `loginsSociais` |
| `PATCH /me` | `nome`, `telefone`, `fusoHorario` (só os que mudam) | Perfil. Telefone novo perde a verificação (RN-078) |
| `POST /me/dispositivos` | `tokenPush` (ou `null`), `modelo` | 204. Grava no aparelho da sessão |
| `GET /me/onboarding` | — | `concluido`, `etapas` (pendente, concluída ou dispensada), `checklistVisivel` (RN-024), `dicasVistas` |
| `PATCH /me/onboarding` | `concluido`, `etapas`, `dicasVistas` | O progresso atualizado |
| `GET /config-app` | — (público) | `versaoMinima` por plataforma, `flags`, `sugestoesChat` |

- **Token de push:** o mesmo token sai de qualquer outro aparelho registrado, porque é do app instalado e não da pessoa. Também sai quando a sessão termina: `sair`, `sair-todos` e reuso de token de renovação.
- **Onboarding:** as marcas ficam em `dicas_vistas` (`onboarding:<etapa>:concluida`, `onboarding:<etapa>:dispensada`, `dica:<chave>`). Concluída vale mais que dispensada, e nenhuma etapa volta a pendente. Outros módulos marcam etapas com `UsuariosService.concluirEtapa` (ex.: o primeiro lançamento).
- **Versão mínima:** uma guarda global compara `X-App-Version` com a mínima da plataforma (`X-Platform`). Abaixo dela responde 426 `VERSAO_APP_DESATUALIZADA`, com `detalhes.versaoMinima`. Sem os cabeçalhos não bloqueia (admin, ferramentas). `GET /config-app` e o health check respondem a qualquer versão (`@LiberadaParaVersaoAntiga()`). As mínimas vêm de `APP_VERSAO_MINIMA_IOS` e `APP_VERSAO_MINIMA_ANDROID`; a edição pelo painel admin fica para a T-141.

## Categorias

Implementado na T-035 (RN-065, RN-066).

- `GET /categorias?tipo=` → `{ itens }`, ordenado por tipo e nome. São poucas por usuário, então não há paginação.
- `POST /categorias` com `nome`, `tipo`, `cor` (`#RRGGBB`) e `icone` (chave do ícone) → 201. `PATCH /categorias/:id` muda nome, cor e ícone; o tipo não muda.
- **Nome único** por usuário e tipo, sem diferença de maiúsculas nem de espaços (acento conta) → 409 `CATEGORIA_DUPLICADA`. Categoria excluída libera o nome.
- **`DELETE /categorias/:id?mover_para=`** (RN-066):
  - transações (inclusive as excluídas), recorrências, parcelamentos e preferências aprendidas vão para a categoria escolhida, que precisa ser do mesmo tipo;
  - os orçamentos da categoria são apagados e ela fica com `excluido_em`;
  - sem lançamentos, `mover_para` é dispensável; com lançamentos e sem destino → 400 com `detalhes.lancamentos`;
  - a última categoria de um tipo não sai: 409 `ULTIMA_CATEGORIA_DO_TIPO`.
- Criar, editar e excluir travam as categorias do usuário naquele tipo (`SELECT … FOR UPDATE`), para dois pedidos ao mesmo tempo não criarem nomes repetidos nem apagarem as duas últimas.
- O `CategoriasService` recebe o `Contexto`; a Mony vai usá-lo na T-062.

## Guardas e decoradores

| Decorador | Função |
|---|---|
| `@Publico()` | Rota sem token (cadastro, login, webhooks) |
| `@LiberadaParaVersaoAntiga()` | Rota que responde a app abaixo da versão mínima (`config-app`, health) |
| `@UsuarioAtual()` | Injeta `{ id, papel, sessaoId, dispositivoId }` do token de acesso |
| `@RecursoLimitado('lancamento')` | Confere e consome cota do plano gratuito de forma atômica antes do handler (RN-122) |
| `@ExigePlano('pago')` | Bloqueia Open Finance, detecção de apps e ligação no gratuito (RN-121) |
| `@Admin()` | Papel admin + sessão de admin com 2FA |
| `@Webhook('stripe')`, `@Webhook('open-finance')` | Valida assinatura do corpo bruto, registra evento e deduplica |

## Webhooks

1. Validar assinatura com o corpo bruto.
2. Gravar em `webhook_eventos` (proposta, ver [06](06-modelo-de-dados.md#tabelas-propostas)) com `id_externo` único. Se já existe, responder 200 e parar.
3. Responder 200 rápido e processar numa fila (`webhooks`), com retry e backoff.

## Filas BullMQ

| Fila | Uso |
|---|---|
| `eventos-dominio` | Reações a eventos (alertas pós-lançamento, preferências aprendidas) |
| `notificacoes` | Envio de push, gravação na central, mensagem da Mony |
| `emails` | E-mails transacionais pelo `EmailProvider` (o job sai do Redis assim que o envio dá certo) |
| `mony-midia` | Transcrição de áudio, leitura de foto/PDF, NFC-e |
| `open-finance` | Sincronizações por webhook e periódicas |
| `webhooks` | Processamento de eventos Stripe e Open Finance |
| `relatorios` | Exportação PDF/XLSX e exportação LGPD |
| `lembretes` | Disparo por minuto e ligações |
| `agenda` | Sincronização Google/Microsoft |
| `rotinas` | Rotinas diárias, semanais e mensais (ver [09](09-notificacoes-e-rotinas.md#rotinas-agendadas)) |

Jobs são idempotentes (id de job determinístico, ex.: `fechar-fatura-<faturaId>`, montado com `idDeJob`; o BullMQ recusa id com `:` e id só com dígitos), com retry exponencial e fila de falhas monitorada.
