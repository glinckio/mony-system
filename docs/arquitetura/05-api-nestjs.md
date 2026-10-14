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
│  │  ├─ idempotencia/           # Interceptor de Idempotency-Key (Redis)
│  │  ├─ erros/                  # Filtro global, catálogo de códigos de erro
│  │  ├─ eventos/                # Barramento interno de eventos de domínio
│  │  ├─ filas/                  # Definição de filas BullMQ
│  │  ├─ arquivos/               # S3, URL assinada
│  │  ├─ cripto/                 # Criptografia de campo (KMS envelope)
│  │  ├─ auditoria/
│  │  └─ config/
│  ├─ modulos/                   # Um módulo por domínio
│  │  ├─ autenticacao/  usuarios/  assinaturas/  planos/   # planos: cotas do gratuito, @RecursoLimitado
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
│     ├─ push/          (PushProvider → expo | fake)
│     ├─ login-social/  (VerificadorLoginSocial: id_token do Google e da Apple)
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
- **DTOs com `criarDto`** (`src/core/openapi/dto.ts`), e não com o `createZodDto` do `nestjs-zod` (o ESLint barra): ele acerta no contrato os campos de topo que aceitam nulo, que o `@nestjs/swagger` leria como lista (T-018).
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
{ "erro": { "codigo": "LIMITE_PLANO_ATINGIDO", "mensagem": "Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo.", "detalhes": { "recurso": "lancamento", "periodo": "dia", "limite": 3, "renovaEm": "2026-10-09T03:00:00.000Z" } } }
```

  Códigos estáveis em `@mony/shared/erros` (o app traduz e decide a UI, por exemplo mostrar [Ver planos]). Mensagens internas e stack só no log (PDF, Segurança).
- `Idempotency-Key` obrigatório em `POST` que cria transação, parcelamento, pagamento de fatura, aporte e checkout. Resposta guardada no Redis por 24 h.
- Mutações financeiras devolvem `impacto` junto com o recurso criado (ex.: `{ cartao: { percentualUsado: 62 }, orcamento: { percentualUsado: 81 } }`), que o app e a Mony usam para a mensagem "Nubank: 62% do limite usado".
- OpenAPI em `/v1/docs` (só fora de produção ou atrás de autenticação).

## Rotas

Base do PDF, com os complementos marcados **(proposta)**.

| Grupo | Rotas |
|---|---|
| Autenticação | `POST /auth/cadastro` · `POST /auth/login` · `POST /auth/social` · `POST /auth/social/vincular` **(proposta)** · `POST /auth/renovar` · `POST /auth/sair` · `POST /auth/sair-todos` **(proposta)** · `POST /auth/senha/codigo` · `POST /auth/senha/conferir` **(proposta)** · `POST /auth/senha/redefinir` |
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
| Lembretes e agenda | `GET /lembretes` · `POST /lembretes` · `PATCH /lembretes/:id` · `DELETE /lembretes/:id` · `POST /lembretes/:id/concluir` · `POST /lembretes/:id/adiar` · `GET /lembretes/alarmes` (prontas: T-084a) · `GET /agenda?inicio=&fim=` · `POST /agendas/conectar` · `GET /agendas/oauth/callback` **(proposta)** · `POST /compromissos` · `PATCH /compromissos/:id` **(proposta)** |
| Notificações | `GET /notificacoes` · `POST /notificacoes/:id/lida` · `GET /preferencias-alerta` · `PUT /preferencias-alerta` |
| Apps de compra | `GET /apps-monitorados` · `PUT /apps-monitorados` · `POST /eventos/app-compra-aberto` |
| Open Finance | `POST /open-finance/token-conexao` · `GET /open-finance/conexoes` · `POST /open-finance/conexoes/:id/sincronizar` · `DELETE /open-finance/conexoes/:id` · `POST /webhooks/open-finance` |
| Mony | `POST /mony/mensagens` (SSE) · `POST /mony/acoes` · `GET /mony/conversa` · `POST /mony/nfce` (prontas: T-020, T-060 e T-066a; SSE fora do OpenAPI, contrato em `@mony/shared/mony`) |
| Arquivos | `POST /arquivos` (retorna URL assinada de upload) · `GET /arquivos/:id` (retorna URL assinada de leitura) |
| Novidades | `GET /novidades` · `POST /novidades/:id/lida` |
| Admin | `GET /admin/usuarios` · `PATCH /admin/usuarios/:id` · `GET /admin/assinaturas` · `GET /admin/metricas` · CRUD `/admin/novidades` · `GET/PUT /admin/mony/config` · `GET /admin/logs-ia` · `GET/PUT /admin/planos` · `GET/PUT /admin/limites` · CRUD `/admin/cupons` · `GET /admin/auditoria` **(proposta)** |
| Tempo real | WebSocket `/v1/ws` (Socket.IO), salas `lista:<id>` para listas compartilhadas |

## Autenticação

Implementada nas T-030, T-031 e T-032 (RN-001 a RN-008; detalhes de segurança em [11](11-seguranca-e-lgpd.md#autenticação)).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/cadastro` | nome, e-mail, telefone, senha, `aceites` (versões dos termos e da privacidade), `dispositivo` | 201 + sessão |
| `POST /auth/login` | e-mail, senha, `dispositivo` | 200 + sessão |
| `POST /auth/social` | `provedor` (`google`, `apple`), `idToken`, `nonce`, `dispositivo`; na conta nova, `nome`, `telefone` e `aceites` | 200 + sessão (cria a conta no primeiro acesso) |
| `POST /auth/social/vincular` | `provedor`, `idToken`, `nonce` (com o token de acesso) | 204 |
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
- **Login social (RN-002):** o `id_token` do Google ou da Apple é conferido no servidor e vale uma vez só. O app segue pelo código de erro:
  - `CADASTRO_INCOMPLETO` (422, `detalhes.faltando` com `nome`, `telefone` ou `aceites`): o app pede os dados e chama de novo com o mesmo token.
  - `VINCULO_SOCIAL_PENDENTE` (409, `detalhes.email`): o e-mail já tem conta. A pessoa entra com a senha (ou recupera pelo código) e o app chama `social/vincular` com o mesmo token.
  - Provedor sem ID de cliente configurado: 503 `SERVICO_INDISPONIVEL`.
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
| `GET /config-app` | — (público) | `versaoMinima` por plataforma, `flags` (`loginGoogle`, `loginApple`: provedor configurado), `sugestoesChat` |

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

## Contas

Implementado na T-036 (rotas propostas; a tabela é do PDF).

- `GET /contas` → `{ itens }` com `saldoInicialCentavos` e `saldoAtualCentavos`. O saldo atual é o inicial mais as receitas pagas, menos as despesas pagas lançadas na conta, sem as excluídas. Pagamento de fatura e transferência também contam: saem da conta, só não entram nos totais de despesa.
- `POST /contas` com `nome`, `tipo` (`corrente`, `poupanca`, `carteira`) e `saldoInicialCentavos` (padrão 0; pode ser negativo) → 201. `PATCH /contas/:id` muda os mesmos campos.
- `DELETE /contas/:id` apaga a conta; transações, recorrências e cartões que a usavam ficam sem conta.
- Conta do Open Finance (`origem = open_finance`) só muda o nome. Tipo e saldo vêm do banco, e ela sai desconectando o banco (409 `CONFLITO` nos outros casos).

## Transações e arquivos

Implementado na T-037 (RN-040 a RN-047).

| Rota | O que faz |
|---|---|
| `GET /transacoes` | Filtros da RN-047 (`de`, `ate`, `tipo`, `categoriaId`, `formaPagamento`, `cartaoId`, `contaId`, `status`, `origem`, `texto`), por data e id decrescentes, `?cursor=&limite=` → `{ itens, proximoCursor }` |
| `GET /transacoes/totais` | Com os mesmos filtros: receitas, despesas, saldo, despesas pagas e pendentes, quantidade |
| `POST /transacoes` | `Idempotency-Key` obrigatória → 201 `{ transacao, impacto }` |
| `PATCH /transacoes/:id` | Só o que veio; `anexoIds` substitui a lista |
| `DELETE /transacoes/:id` | Exclusão lógica (RN-046) |
| `POST /transacoes/lote` | `excluir` ou `mudar_categoria` em vários, tudo ou nada (RN-044) |
| `POST /arquivos` | URL assinada de `PUT` (5 min) e o id do anexo. O `tipoConteudo` combina com o `tipo` (`foto`: imagens; `pdf`; `comprovante`: imagem ou PDF; `audio`: m4a, aac, mp3 ou webm). Áudio é só para a Mony (`arquivoId` em `POST /mony/mensagens`) e não entra em `anexoIds` |
| `GET /arquivos/:id` | URL assinada de leitura (15 min) |

- **Gravação:**
  - sem data, vale o "hoje" no fuso do usuário;
  - sem status, vale o padrão da RN-042 (`statusPadrao` em `@mony/shared/transacoes`);
  - a categoria precisa ser do usuário e do mesmo tipo;
  - despesa exige forma de pagamento (RN-041);
  - o primeiro lançamento conclui a etapa `primeiro-lancamento` do onboarding;
  - depois de gravar sai o evento `transacao.registrada`, para alertas e preferências (T-080, T-063); o `PATCH` que muda tipo, valor, data, categoria, forma ou cartão publica `transacao.alterada`, para os alertas (T-082).
- **Compra no cartão** (`cartao_credito`, T-040) leva `cartaoId` e entra na fatura certa (ver "Cartões e faturas" abaixo).
- **Parcela e pagamento de fatura** só mudam categoria, descrição, observação e anexos por aqui. A parcela sai pelo parcelamento (T-042). O pagamento de fatura sai por `DELETE /transacoes/:id`, o que desfaz o pagamento (T-041).
- **Open Finance (RN-045):** valor, data e os demais campos travados dão 409 `TRANSACAO_OPEN_FINANCE_BLOQUEADA`.
- **Recorrência (RN-043):** ocorrência editada à mão fica com `editada_manualmente`.
- **Totais:** pagamento de fatura e transferência não entram nas despesas (RN-037).
- **Busca por texto:** `ILIKE` na descrição e na observação, depois do filtro por usuário.
- **`impacto`**:
  - `cartao` (`cartaoId`, `percentualUsado`) na compra no cartão;
  - `orcamento` (`categoriaId`, `percentualUsado`) na despesa de categoria com orçamento no mês da data (T-043).
- **Anexos:**
  - o app envia o arquivo direto ao S3 com a URL assinada; o `content-type` faz parte da assinatura;
  - ao ligar o anexo (`anexoIds`), a API confere que o arquivo chegou, que tem até 10 MB e que é do usuário;
  - um anexo fica em um lançamento só;
  - a chave no S3 é `usuarios/<usuarioId>/anexos/<aleatório>.<extensão>`.

## Recorrências

Implementado na T-038 (RN-043).

| Rota | O que faz |
|---|---|
| `GET /recorrencias` | Recorrências ativas |
| `POST /recorrencias` | `Idempotency-Key`; cria e devolve `{ recorrencia, ocorrencias }`, com as ocorrências até 35 dias à frente |
| `PATCH /recorrencias/:id` | Muda o modelo e as ocorrências futuras pendentes não editadas à mão |
| `DELETE /recorrencias/:id` | Para a recorrência; as ocorrências livres de hoje em diante saem |
| `DELETE /transacoes/:id?recorrencia=esta\|proximas\|todas` | Exclusão de uma ocorrência, com o escopo da RN-043 |

- **Agenda:** `frequencia` (`semanal`, `mensal`, `anual`) e `dia` (do mês, ou da semana com 0 = domingo; sem ele vale o da data de início), `dataInicio` e `dataFim` opcional. As datas vêm de `ocorrenciasEntre` em `@mony/shared/recorrencias`, sempre a partir do início (31/01 → 28/02 → 31/03).
- **Ponteiro:** `proxima_geracao` é a próxima data da agenda ainda não gerada, mesmo depois da data final; `ativa` diz se ainda vale. A rotina e as rotas travam a recorrência (`FOR UPDATE`) e só andam o ponteiro para a frente, então nada se repete.
- **Edição:** mudar frequência ou dia refaz as ocorrências livres de hoje em diante. Encurtar a data final tira as livres que passaram dela; estender retoma a geração de onde parou.
- **"Esta e as próximas":** exclui a ocorrência e as seguintes (pagas ou não) e põe a data final na véspera. **"Todas"** exclui todas e para a recorrência.
- **Rotina `gerar-recorrencias`:** roda de hora em hora (`30 * * * *`), no fuso de cada usuário (doc 09).
- **Limites:** começo no máximo um ano atrás.
- **No cartão de crédito (T-051):**
  - `formaPagamento: 'cartao_credito'` com `cartaoId`, sem conta, como na compra.
  - Cada ocorrência entra na fatura da sua data (RN-031) e as faturas são refeitas; a trava segue a ordem recorrência → cartão → fatura.
  - Mudar valor, cartão ou forma de pagamento move as ocorrências livres de fatura, uma a uma, sem gerar de novo; a excluída não volta. A editada à mão fica onde está.
  - "Esta e as próximas" e "todas" deixam a ocorrência paga pela fatura (RN-046).
  - Cartão excluído para as recorrências dele.
  - Uma data que já tem ocorrência não ganha outra quando a agenda é refeita.

## Cartões e faturas

Implementado na T-040 (RN-030 a RN-035, RN-038, RN-046) e na T-041 (pagamento, RN-036 e RN-037).

| Rota | O que faz |
|---|---|
| `GET /cartoes` | Cartões com limite usado, disponível, percentual e a fatura atual |
| `GET /cartoes/:id` | Um cartão, no mesmo formato |
| `POST /cartoes` | Nome, bandeira, final, limite, dias de fechamento e vencimento, cor, faixas de alerta e conta de pagamento → 201 |
| `PATCH /cartoes/:id` | Só o que veio; `null` limpa bandeira, final e conta de pagamento |
| `DELETE /cartoes/:id` | Exclusão lógica; com saldo em aberto em alguma fatura → 409 `CONFLITO` com `detalhes.saldoEmAbertoCentavos` |
| `GET /cartoes/:id/faturas` | Faturas do cartão, da mais nova para a mais antiga |
| `GET /faturas/:id` | `{ fatura, cartao, transacoes, pagamentos }`: compras e pagamentos, do mais novo para o mais antigo |
| `POST /faturas/:id/pagar` | `Idempotency-Key`; pagamento total ou parcial → 201 `{ fatura, transacao, impacto }` |

- **Compra:** `POST /transacoes` com `formaPagamento: 'cartao_credito'` e `cartaoId`.
  - É sempre despesa, sem `contaId` e pendente até a fatura ser paga; o contrário dá 400 (`problemasDaCompraNoCartao` em `@mony/shared/transacoes`).
  - A fatura vem de `faturaDaCompra` (RN-031) e é criada na primeira compra. Se a fatura daquela competência já existe e fechou antes da data (os dias do cartão mudaram depois), a compra vai para a seguinte.
  - Mudar valor, data, cartão ou forma de pagamento tira a compra de uma fatura e põe na outra; excluir tira da fatura.
- **Fatura quitada** (tem pagamento e o pago cobre o total):
  - as compras dela ficam pagas (RN-037) e não mudam de valor, data, cartão ou forma, nem saem → 409 `TRANSACAO_EM_FATURA_PAGA`. Descrição, categoria, observação e anexos continuam mudando;
  - se já fechou, compra nova com data dela também não entra. Ainda aberta (pagamento antecipado), recebe a compra, que vira saldo, e as compras voltam a pendentes.
- **Total e pago da fatura:** a cada mudança, as somas das compras e dos pagamentos são refeitas (sem os excluídos), em vez de somar a diferença.
- **Pagamento (RN-036, RN-037):**
  - Todos os campos são opcionais, para o [Paguei] da notificação pagar com um toque.
  - Sem `valorCentavos`, paga o saldo; acima do saldo → 400 com `detalhes.saldoCentavos`; sem saldo → 409.
  - Sem `data`, hoje; data futura → 400.
  - Sem `contaId`, usa a conta de pagamento do cartão; `null` registra sem conta.
  - Sem `categoriaId`, usa a categoria "Contas" padrão ou a de despesa mais antiga.
  - Grava a transação `pagamento_fatura`, paga, ligada ao cartão e à fatura. Ela sai do saldo da conta, mas não entra nos totais de despesa. Depois publica `fatura.paga`.
  - Pagamento parcial deixa o restante na mesma fatura, sem juros.
  - Excluir o pagamento (`DELETE /transacoes/:id`) desfaz: refaz o pago da fatura e devolve as compras a pendentes.

## Início (dashboard)

Implementado na T-044 (RN-020 a RN-024). `GET /dashboard?periodo=mes_atual|mes_anterior|personalizado&de=&ate=` abre a tela inicial com uma chamada (doc 04). O período padrão é o mês atual; o personalizado precisa de `de` e `ate`, com até 366 dias.

- **`resumo` (RN-020):**
  - saldo = receitas pagas − despesas pagas;
  - receitas (recebidas ou não), receitas pagas, despesas pagas e pendentes;
  - despesas só de natureza `normal` (RN-037); compra no cartão conta na data da compra.
- **`proximosVencimentos` (RN-023):**
  - faturas com saldo (o valor é o que falta pagar), parcelas de dívida não pagas e contas pendentes (despesas sem cartão e sem parcelamento);
  - de 30 dias atrás (`atrasado: true`) até 30 dias à frente, por data, até 50 itens;
  - parcela de cartão não aparece sozinha: ela já está na fatura.
- **`cartoes`:** os mesmos de `GET /cartoes`.
- **`orcamentos`:** os de `GET /orcamentos` no mês em que o período começa.
- **`onboarding` (RN-024):** o de `GET /me/onboarding`.

## Notificações e preferências de alerta

Implementado na T-080 (RN-100 a RN-105; motor no doc 09), na T-081 (push) e na T-082 (avaliadores dos alertas de cartão, fatura, orçamento, vencimentos, gasto fora do padrão e projeção; doc 09).

| Rota | O que faz |
|---|---|
| `GET /notificacoes?tipo=&naoLidas=&cursor=&limite=` | Central, da mais nova para a mais antiga → `{ itens, proximoCursor, naoLidas }` |
| `POST /notificacoes/:id/lida` | Marca como lida (de novo não muda a hora) |
| `POST /notificacoes/lidas` | Marca todas → `{ afetadas }` |
| `GET /preferencias-alerta` | `{ silencio, tipos }`: cada tipo com `ativo`, `antecedenciaDias` e `desligavel` |
| `PUT /preferencias-alerta` | Só o que veio: `tipos` (ligar, desligar, antecedência) e `silencio` (`{ inicio, fim }` em `HH:MM` local, ou `null`) |

- O `GET /dashboard` traz `notificacoesNaoLidas`.
- **`MotorAlertas.emitir(candidatos, agora)`** é a porta dos avaliadores. Cada candidato traz `tipo`, `chaveUnica`, `urgente`, `titulo`, `corpo`, `linkInterno` (`mony://…`) e `vaiParaChat`.
- **Filtros do motor, nesta ordem:**
  1. tipo desligado (assinatura não desliga);
  2. cota de 3 alertas de consultoria por dia do usuário;
  3. chave única (`ON CONFLICT DO NOTHING`);
  4. horário de silêncio: o não urgente fica gravado sem `enviadaEm`.
- **Envio:** o que passa vai para a central e para `EnvioNotificacoes` (`EnvioPush`), que põe o envio na fila `notificacoes`; o worker manda o push (doc 09, "Envio de push").

## Relatórios

Implementado na T-048 (RN-150); a exportação (RN-151) na T-125 (ver abaixo). `GET /relatorios/:tipo?inicio=&fim=` tem uma rota por tipo, cada uma com o seu contrato. Sem período, vale os últimos 12 meses, com o atual inteiro; o período vai até 5 anos.

| Rota | O que traz |
|---|---|
| `GET /relatorios/mensal` | Receitas × despesas por mês, com saldo e saldo acumulado; todos os meses do período |
| `GET /relatorios/anual` | Evolução anual: receitas × despesas por ano |
| `GET /relatorios/categorias?tipo=despesa\|receita` | Por categoria (nome, cor e ícone), com percentual e quantidade, da maior para a menor |
| `GET /relatorios/dias-da-semana` | Despesas por dia da semana (0 = domingo), sempre os sete |
| `GET /relatorios/cartoes` | Despesas no cartão por cartão, parcelas incluídas |
| `GET /relatorios/formas-pagamento` | Despesas por forma de pagamento |
| `GET /relatorios/precos?busca=` | Histórico de preços da NFC-e (T-066c): os produtos dos cupons fiscais com a busca na descrição, com o último preço, o menor e a média por loja |

- Contam lançamentos pagos e pendentes, sem os excluídos, só de natureza `normal`: pagamento de fatura e transferência não são receita nem despesa (RN-037).
- Categoria e cartão excluídos ainda aparecem com o nome.
- As somas por mês, ano e dia da semana são SQL (`$queryRaw`), com `excluido_em IS NULL` escrito à mão; as outras são `groupBy` do Prisma.
- **Histórico de preços (RN-150, T-066c):** `busca` de 2 a 60 letras; cada palavra tem de estar na descrição do item (`nfce_itens`), sem diferenciar maiúscula nem acento (`translate(lower(…))` com `LIKE '%palavra%'`, sem os curingas `%`, `_` e `\` da busca). Conta a data da nota no fuso do usuário, no período pedido ou no padrão (12 meses; no gratuito, o mês atual). Lê os 500 itens mais recentes e junta por produto (a mesma descrição, sem acento e espaços repetidos, e a mesma unidade): até 20 produtos, o comprado mais recentemente primeiro, cada um com o último preço unitário pago (data e loja), o menor (o mais recente, no empate) e a média por loja (por CNPJ, com o nome do emitente sem o sufixo jurídico), da mais barata para a mais cara. Sem o índice GIN de `to_tsvector` do doc 06: como a busca de transações (T-037), é substring sobre os itens de um usuário só, já filtrados pelo índice de `usuario_id`.
- **Exportação (RN-151, T-125):** `POST /relatorios/exportar` (`{ formato: pdf|xlsx, inicio?, fim? }`, com `Idempotency-Key`; sem período, os últimos 12 meses) grava a exportação (`exportacoes_relatorio`, `processando`) e põe o job `exportar` na fila `relatorios` (3 tentativas); responde 202. O mesmo pedido enquanto gera devolve a mesma exportação. O worker (`ProcessadorRelatorios`) monta as tabelas com os mesmos números das rotas (meses, categorias de despesa e de receita, dias da semana, cartões, formas de pagamento e, com mais de um ano, a evolução anual), gera o PDF (`pdfkit`, A4) ou o XLSX (OOXML escrito à mão e compactado com `fflate`; dinheiro em reais com formato de moeda), grava no S3 em `exportacoes/relatorios/<usuario>/<id>.<formato>` (o ciclo de vida do bucket apaga) e marca `pronta`; na última falha, `erro`. `GET /relatorios/exportacoes/:id` devolve o status e, pronta, a URL assinada de 24 horas, que baixa como `relatorio-<inicio>-a-<fim>.<formato>`. No gratuito, `LIMITE_PLANO_ATINGIDO` (RN-120).
- **Plano gratuito (RN-120, T-100):** a tela de relatórios (origem `app`) mostra só o mês atual: o período pedido (ou o padrão) é cortado ao mês de hoje, e o pedido sem nenhum dia nele responde `LIMITE_PLANO_ATINGIDO` (`recurso: relatorio`). As consultas da Mony e os resumos das rotinas não mudam.

## Orçamentos e metas

Implementado na T-043 (RN-060 a RN-063).

| Rota | O que faz |
|---|---|
| `GET /orcamentos?competencia=` | Orçamentos do mês (sem competência, o de hoje) com gasto, restante, percentual, faixa e projeção; e os totais |
| `PUT /orcamentos` | Cria ou muda o orçamento da categoria na competência (`categoriaId`, `valorLimiteCentavos`, `competencia?`, `repetirMensal?`) |
| `DELETE /orcamentos/:id` | Tira o orçamento do mês; os seguintes não o recebem |
| `GET /metas` · `GET /metas/:id` | Metas (abertas primeiro, pelo prazo); a lista traz o ritmo de cada uma e o guardado no mês, o detalhe traz os aportes |
| `POST /metas` · `PATCH /metas/:id` · `DELETE /metas/:id` | Título, alvo, prazo e `concluida` |
| `POST /metas/:id/aportes` | `Idempotency-Key`; aporte → `{ meta, aporte, sugerirConclusao }` |
| `DELETE /metas/:id/aportes/:aporteId` | Tira o aporte e devolve a meta |

- **Gasto (RN-061):** despesas `normal` da categoria com data no mês, pagas e pendentes, sem as excluídas. Pagamento de fatura e transferência ficam de fora; compra no cartão conta na data da compra, e cada parcela no mês da sua despesa.
- **Projeção:** `projecaoDoMes` em `@mony/shared/orcamentos`. O gasto até hoje segue a média linear até o fim do mês, e o que já está lançado para depois de hoje entra pelo valor certo.
- **Faixa (RN-062):** até 79% `normal`, de 80% a 99% `atencao`, 100% ou mais `estourado`.
- **Repetir (RN-060):**
  - Orçamento novo repete todo mês, salvo `repetirMensal: false`.
  - O primeiro orçamento conclui a etapa `orcamento` do onboarding (T-052).
  - A rotina `repetir-orcamentos` roda no dia 1, às 00:15 de São Paulo (`15 0 1 * *`). Ela copia do mês anterior os que repetem, de categorias que ainda existem, e não mexe no que já existe no mês novo.
- **Metas (RN-063):**
  - O valor atual é a soma dos aportes, refeita com a meta travada (`FOR UPDATE`).
  - O aporte não pode ter data futura.
  - `sugerirConclusao` vem quando o aporte fez a meta chegar ao alvo e ela não está concluída.
  - **Ritmo (T-147, `ritmoDaMeta` em `@mony/shared/metas`)**: a lista traz, por meta, o guardado no mês de hoje, o ritmo (média mensal dos aportes nos últimos 3 meses, o atual incluso, só nos meses em que a meta existia e sem os aportes até o dia da criação, que contam como saldo inicial), os meses para completar nesse ritmo (para cima) e quanto guardar por mês, do mês de hoje ao do prazo, para chegar a tempo. Também o total guardado no mês em todas as metas.

## Parcelamentos e dívidas

Implementado na T-042 (RN-050 a RN-055).

| Rota | O que faz |
|---|---|
| `GET /parcelamentos` | Com status e progresso; filtros `tipo` e `status` (o do dia) |
| `GET /parcelamentos/:id` | O parcelamento e as parcelas |
| `POST /parcelamentos` | `Idempotency-Key`; grava parcelas e despesas → 201 `{ parcelamento, impacto }` |
| `POST /parcelamentos/simular` | A tabela sem gravar (RN-052); com `cartaoId`, vencimentos das faturas |
| `PATCH /parcelamentos/:id` | Nome, categoria e observação; nome e categoria vão para as despesas das parcelas |
| `DELETE /parcelamentos/:id` | Cancela (RN-054) |
| `POST /parcelas/:id/pagar` | Parcela de dívida paga, com a despesa dela (RN-053); `contaId` opcional |
| `POST /parcelas/:id/desfazer` | Volta a parcela e a despesa para pendente |

- **Valores:** `valoresDasParcelas` em `@mony/shared/parcelamentos`.
  - Sem juros, divide e põe os centavos que sobram na primeira parcela.
  - Com `taxaJurosMensal` (% ao mês, até 4 casas), usa a Tabela Price em decimal: `valorCentavos` é o financiado, e o total é a soma das parcelas.
- **Despesas:** cada parcela tem uma despesa pendente, "Nome (k/n)", ligada nos dois sentidos (`parcelas.transacao_id` e `transacoes.parcela_id`). Ela só muda descrição, categoria, observação e anexos por `/transacoes`.
- **Dívida:** a parcela `k` vence `k − 1` meses depois da primeira, com o ajuste de fim de mês. Conta e forma de pagamento são opcionais; a forma padrão é boleto.
- **Compra no cartão:**
  - A parcela `k` cai na fatura da competência da primeira + (k − 1) meses (a primeira é a da compra, RN-031). As faturas que faltam são criadas.
  - O vencimento da parcela é o da fatura, e a despesa tem a data da compra + (k − 1) meses.
  - A parcela é paga pelo pagamento da fatura: quitar a fatura marca a parcela e a despesa como pagas, e desfazer o pagamento volta as duas. Pagar parcela de cartão aqui → 409 `PARCELA_PAGA_PELA_FATURA`.
  - Fatura fechada e quitada recusa a parcela → 409 `TRANSACAO_EM_FATURA_PAGA`, e nada é gravado.
- **Status (RN-054)** calculado no dia de hoje do usuário: parcela `atrasado` quando venceu sem pagamento; parcelamento `cancelada`, `quitada` (todas pagas), `atrasada` ou `ativa`.
- **Cancelar (RN-054):**
  - Tira as parcelas não pagas que ainda são futuras: na dívida, as que vencem depois de hoje; no cartão, as de faturas que ainda não fecharam. Essas parcelas são apagadas e as despesas delas, excluídas logicamente.
  - As vencidas e as de fatura fechada continuam devidas e podem ser pagas.
- **Trava:** todo fluxo que mexe em fatura trava o cartão (`FOR UPDATE`) e depois as faturas, sempre em ordem de id. Assim, compras ao mesmo tempo não se perdem e a T-041 segue a mesma ordem.
- **Status (RN-033):** a resposta calcula o status no "hoje" do usuário com `statusDaFatura`; a coluna é atualizada a cada mudança e pela rotina diária (T-047).
- **Fatura atual:** a que recebe uma compra feita hoje, com `id: null` enquanto não tem lançamento.
- **Dias:** mudar o fechamento ou o vencimento vale para as faturas que ainda não existem; as criadas mantêm as datas.
- **Open Finance (RN-039):** cartão conectado só muda nome, cor, faixas de alerta e conta de pagamento, e sai desconectando o banco.

## Lembretes

Implementado na T-084a (RN-075 a RN-077), em `modulos/lembretes`; a regra da repetição fica em `@mony/shared/lembretes`, e as telas chegam com a T-084b. A ligação (RN-078) é a T-122: até lá, os canais aceitos são `push` e `alarme`.

| Rota | O que faz |
|---|---|
| `GET /lembretes?status=ativo\|concluido` | Os ativos (os que tocaram e esperam o [Feito] primeiro, depois o mais próximo) ou os últimos 100 feitos |
| `GET /lembretes/:id` | Um lembrete |
| `POST /lembretes` | Cria (`titulo`, `dataHora`, `recorrencia?`, `canais`), com `Idempotency-Key` |
| `PATCH /lembretes/:id` | Muda o título, a data e hora, a repetição ou os canais; uma data nova reativa o feito |
| `DELETE /lembretes/:id` | Exclui: o status vira `cancelado`, e ele some das listas e dos alarmes |
| `POST /lembretes/:id/concluir` | O [Feito] (`ocorrencia?`) |
| `POST /lembretes/:id/adiar` | A soneca (`opcao`: `10min`, o padrão, `1h` ou `amanha`) |
| `GET /lembretes/alarmes` | Os próximos alarmes, para o `mony-alarm` |

- **Agenda:** `data_hora` é a ocorrência atual: a próxima a tocar ou a que já tocou e espera o [Feito] (`disparado_em` preenchido; na resposta, `pendente`). Segundos não contam (a rotina é por minuto). A data pedida não pode ter passado.
- **Repetição (RN-075):** RRULE num subconjunto conferido (`lerRegra`):
  - `FREQ` diária, semanal, mensal ou anual, e `INTERVAL` de 1 a 99;
  - `BYDAY` na semanal, `BYMONTHDAY` na mensal e na anual, e `BYMONTH` na anual;
  - `UNTIL` como data, inclusive.

  O que a regra não diz vem da data pedida, e a regra é guardada canônica (`FREQ=WEEKLY;BYDAY=MO,FR`). O primeiro aviso é a primeira data da regra a partir da pedida, na mesma hora local. Dia 31 em mês mais curto cai no último dia e volta ao 31, como nas recorrências (RN-043). A semana da regra começa na segunda. `COUNT` e o resto da RFC 5545 são recusados.
- **Rotina `disparar-lembretes` (a cada minuto):**
  - **O que toca:** os ativos com a ocorrência vencida e ainda não tocada, ou com a soneca vencida, até 500 por minuto.
  - **O aviso:** tipo `lembrete`, urgente (ignora o silêncio, RN-077), com a categoria `lembrete` ([Feito] [Adiar]) e o texto "Lembrete das 08:00" ("Lembrete adiado das 08:00" na soneca).
  - **Link e chave:** o link leva a ocorrência, `mony://lembretes/<id>?ocorrencia=<ms>`. A chave é `lembrete:<id>:<ocorrência>` ou `lembrete:<id>:adiado:<fim da soneca>`.
  - **Depois do aviso:** a repetição passa para a próxima ocorrência depois de agora (o que passou com a rotina parada não toca). O único, e a repetição que acabou, ficam esperando o [Feito].
  - **Concorrência:** o estado só é gravado se o lembrete ainda está como a rotina leu. Se falhar no meio, a chave única segura o aviso repetido.
  - **Só com alarme:** o push vai só para quem tem iPhone. No Android, o alarme toca no aparelho; no iOS, o alarme chega com a T-023b.
- **[Feito] (RN-076):**
  - O único (tocado ou não) e a repetição que já tocou a última ficam `concluido`.
  - Na repetição, o [Feito] da ocorrência atual (sem `ocorrencia`, ou com ela) pula para a próxima.
  - O [Feito] de uma ocorrência que já passou ou de uma soneca (a notificação manda a `ocorrencia` do link) só tira a soneca.
  - O mesmo [Feito] de novo não muda nada.
- **[Adiar] (RN-076):** `adiado_ate` é agora (sem os segundos) mais 10 minutos ou 1 hora, ou "amanhã": o dia seguinte ao de hoje no fuso do usuário, na hora do lembrete. A soneca de um lembrete feito responde `CONFLITO`.
- **PATCH:**
  - Mudar a data ou a repetição recomeça a agenda: tira a soneca e o "tocou".
  - Só a repetição recomeça da data atual, sem voltar para antes de agora nem tocar de novo a que já tocou.
- **Alarmes (doc 09):**
  - **A lista:** `GET /lembretes/alarmes` devolve, dos ativos com o canal alarme, as ocorrências dos próximos 35 dias (a que já tocou não volta) e as sonecas. São os 50 mais próximos, com `id` `<lembrete>-<instante em ms>`, título e texto.
  - **O push silencioso:** toda mudança num lembrete com alarme (criar, mudar, concluir, adiar, excluir) põe um job `sincronizar-alarmes` na fila `notificacoes`. O id é por usuário e o job espera 5 s, então mudanças seguidas viram um push só. O worker manda o push silencioso (`_contentAvailable`, só `dados.tipo = sincronizar_alarmes`) a cada aparelho com token.
- **Gratuito (RN-120):** 5 lembretes ativos, conferidos ao criar e ao reativar (`conferirQuantidade(contexto, 'lembrete_ativo', tx)`).

## Planos e cotas do gratuito

Implementado na T-100 (RN-120 a RN-123, RN-127), em `modulos/planos`; o teste de 3 dias na T-101 (ver "Teste grátis"). A Stripe e as telas de compra chegam com a T-102 e a T-103.

- **Plano que vale agora** (`planoEfetivo`): `teste` até o `teste_fim` (depois, gratuito, mesmo antes da rotina diária da T-101); `mensal` e `anual`, inclusive inadimplente (RN-131); assinatura cancelada ou ausente, gratuito. Só o gratuito tem limite.
- **Quem conta:** o que vem do app e da Mony (`contexto.origem` `app` ou `mony`). Rotinas (ocorrências de recorrência), Open Finance e admin não contam.
- **Onde conta:** no Service que grava, dentro da transação dele (`CotasService.consumir(contexto, recurso, tx)`), e não num guard antes do handler: a Mony chama os Services, não as rotas, e o que não foi gravado não conta (o erro desfaz tudo). Lançamento: `TransacoesService.registrar` (manual, Mony e foto ou PDF confirmado), `ParcelamentosService.registrar` (um parcelamento é um lançamento) e `RecorrenciasService.criar` (a recorrência é um lançamento; as ocorrências não). Mensagem (texto e áudio) e leitura de foto ou PDF: no orquestrador da Mony, ao receber; toque em botão não conta.
- **Contagem atômica (RN-122):** trava por usuário e recurso até o fim da transação (`pg_advisory_xact_lock`), soma o uso do dia e do mês (do dia 1º a hoje, no fuso do usuário) em `uso_recursos` e grava `+1` na linha do dia (`INSERT … ON CONFLICT DO UPDATE`). O `UPDATE … WHERE quantidade < limite` do RN-122 sozinho não confere o limite do mês, que soma várias linhas.
- **Quantidade (cartão e lembrete ativo):** conta os itens que existem (cartões não excluídos; lembretes `ativo`, inclusive o que tocou e espera o [Feito]) na transação que cria (e, no lembrete, na que reativa); os que passam do limite continuam visíveis e editáveis (RN-127). As listas de compras entram com a T-123.
- **Erro:** `LIMITE_PLANO_ATINGIDO` (403) com a frase da Mony e `detalhes` `{ recurso, periodo: dia|mes|quantidade, limite, renovaEm }`; `renovaEm` é a meia-noite do dia seguinte ou do dia 1º no fuso do usuário (nulo na quantidade).
- **Mony (RN-123):** no limite, a Mony responde a frase com o botão [Ver planos] (`{ tipo: 'abrir', link: 'mony://planos' }`, que o app abre sem chamar `POST /mony/acoes`): na mensagem e na leitura, sem chamar o modelo; no lançamento pelo rascunho, antes das perguntas, sem guardar o rascunho; nas ferramentas, o modelo recebe a falha e o botão sai uma vez; no [Confirmar todos] da foto ou PDF, grava até o limite e o resto continua esperando.
- **`GET /assinatura/uso`:** o plano que vale agora, `limitado`, o fim do teste e, no gratuito, cada limite com `uso`, `limite` e `renovaEm`.
- **`@RecursoLimitado(recurso)`** marca as rotas que podem responder o 403 (`x-recurso-limitado` no OpenAPI): `POST /transacoes`, `/parcelamentos`, `/recorrencias`, `/cartoes`, `POST` e `PATCH /lembretes` e os relatórios. A conta não é feita por ele.

## Teste grátis

Implementado na T-101 (RN-124 a RN-126), em `modulos/planos` (`dominio/teste.ts`, `TesteGratis`).

- **Início:** o cadastro (e-mail e senha ou login social, `abrirContaNova`) abre o teste de 3 dias (`teste_inicio`, `teste_fim`).
- **Um por pessoa (RN-125):** na mesma transação do cadastro, grava em `controle_teste` o SHA-256 do e-mail como caixa de entrada (minúsculo, sem `+etiqueta` e, no Gmail, sem pontos), do login do Google ou da Apple (o `sub`) e do identificador do aparelho, com `ON CONFLICT DO NOTHING` (`createMany` com `skipDuplicates`). Se algum já existia, a conta começa no `gratuito`, sem datas de teste. Dois cadastros ao mesmo tempo esperam a chave única um do outro: só um ganha o teste.
- **Avisos (RN-124):** na rotina `alertas-diarios` (09:00 de cada pessoa), tipo `assinatura`, com push, central e mensagem da Mony, abrindo `mony://planos`: no 2º dia do teste; no último (faltando menos de 24 horas: "acaba hoje às 12:00" ou "amanhã às 07:00"), com o que a pessoa já registrou (lançamentos e despesas, cartões, orçamentos e metas); e na primeira rodada depois do fim, para quem não assinou. Chaves `assinatura:teste:segundo-dia`, `:ultimo-dia` e `:fim`. Não são urgentes: esperam o fim do horário de silêncio.
- **Encerramento (RN-126):** a rotina `encerrar-testes`, todo dia às 01:15, passa para o `gratuito` o teste que acabou (as datas ficam). Antes dela, o teste vencido já vale como gratuito (`planoEfetivo`).

## Guardas e decoradores

| Decorador | Função |
|---|---|
| `@Publico()` | Rota sem token (cadastro, login, webhooks) |
| `@LiberadaParaVersaoAntiga()` | Rota que responde a app abaixo da versão mínima (`config-app`, health) |
| `@UsuarioAtual()` | Injeta `{ id, papel, sessaoId, dispositivoId }` do token de acesso |
| `@RecursoLimitado('lancamento')` | Marca a rota que pode responder `LIMITE_PLANO_ATINGIDO` (`x-recurso-limitado` no OpenAPI); a conta é do `CotasService`, no Service que grava (ver "Planos e cotas do gratuito") |
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
| `notificacoes` | Envio de push (`enviar-push`) e conferência dos recibos 15 minutos depois (`conferir-recibos`); depois, mensagem da Mony |
| `emails` | E-mails transacionais pelo `EmailProvider` (o job sai do Redis assim que o envio dá certo) |
| `mony-midia` | Novas consultas do cupom fiscal (`nfce-reconsulta`, T-066a: 5 min, 1 h e 6 h depois). A transcrição (T-064) e a leitura de foto e PDF (T-065) rodam na própria requisição |
| `open-finance` | Sincronizações por webhook e periódicas |
| `webhooks` | Processamento de eventos Stripe e Open Finance |
| `relatorios` | Exportação PDF/XLSX e exportação LGPD |
| `lembretes` | Disparo por minuto e ligações |
| `agenda` | Sincronização Google/Microsoft |
| `rotinas` | Rotinas diárias, semanais e mensais (ver [09](09-notificacoes-e-rotinas.md#rotinas-agendadas)) |

Jobs são idempotentes (id de job determinístico, ex.: `fechar-fatura-<faturaId>`, montado com `idDeJob`; o BullMQ recusa id com `:` e id só com dígitos), com retry exponencial e fila de falhas monitorada.
