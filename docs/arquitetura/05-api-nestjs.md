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
| `POST /arquivos` | URL assinada de `PUT` (5 min) e o id do anexo |
| `GET /arquivos/:id` | URL assinada de leitura (15 min) |

- **Gravação:**
  - sem data, vale o "hoje" no fuso do usuário;
  - sem status, vale o padrão da RN-042 (`statusPadrao` em `@mony/shared/transacoes`);
  - a categoria precisa ser do usuário e do mesmo tipo;
  - despesa exige forma de pagamento (RN-041);
  - o primeiro lançamento conclui a etapa `primeiro-lancamento` do onboarding;
  - depois de gravar sai o evento `transacao.registrada`, para alertas e preferências (T-080, T-063).
- **Compra no cartão** (`cartao_credito`, T-040) leva `cartaoId` e entra na fatura certa (ver "Cartões e faturas" abaixo).
- **Parcela e pagamento de fatura** só mudam categoria, descrição, observação e anexos por aqui. A parcela sai pelo parcelamento (T-042). O pagamento de fatura sai por `DELETE /transacoes/:id`, o que desfaz o pagamento (T-041).
- **Open Finance (RN-045):** valor, data e os demais campos travados dão 409 `TRANSACAO_OPEN_FINANCE_BLOQUEADA`.
- **Recorrência (RN-043):** ocorrência editada à mão fica com `editada_manualmente`.
- **Totais:** pagamento de fatura e transferência não entram nas despesas (RN-037).
- **Busca por texto:** `ILIKE` na descrição e na observação, depois do filtro por usuário.
- **`impacto`** traz `cartao` (`cartaoId`, `percentualUsado`) na compra no cartão; o do orçamento entra na T-043.
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
- **Limites:** sem cartão de crédito até a T-051; começo no máximo um ano atrás.

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
- **Trava:** todo fluxo que mexe em fatura trava o cartão (`FOR UPDATE`) e depois as faturas, sempre em ordem de id. Assim, compras ao mesmo tempo não se perdem e a T-041 segue a mesma ordem.
- **Status (RN-033):** a resposta calcula o status no "hoje" do usuário com `statusDaFatura`; a coluna é atualizada a cada mudança e pela rotina diária (T-047).
- **Fatura atual:** a que recebe uma compra feita hoje, com `id: null` enquanto não tem lançamento.
- **Dias:** mudar o fechamento ou o vencimento vale para as faturas que ainda não existem; as criadas mantêm as datas.
- **Open Finance (RN-039):** cartão conectado só muda nome, cor, faixas de alerta e conta de pagamento, e sai desconectando o banco.

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
