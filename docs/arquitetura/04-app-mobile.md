# 04 — App mobile (Expo)

## Princípios

1. O app **não decide regra de negócio**. Ele exibe o que a API calcula (limite usado, fatura, projeção, consumo de plano) e envia o que o usuário digitou. Validações no app servem só para UX; a API valida de novo.
2. O design vem pronto do cliente. A arquitetura separa **apresentação** (componentes que seguem o design) de **dados** (hooks de consulta e mutação), para o design poder mudar sem mexer em lógica.
3. Toda tela funciona em Android 7+ e na versão mínima de iOS do SDK. Recursos nativos opcionais são ligados por detecção de capacidade.

## Estrutura de pastas

```
apps/mobile/
├─ app/                          # Expo Router (rotas por arquivo)
│  ├─ _layout.tsx                # Providers: Query, Theme, i18n, Sentry, Auth gate
│  ├─ (auth)/                    # login, cadastro, recuperar-senha, codigo
│  ├─ (onboarding)/              # boas-vindas, primeiro-lancamento, cartoes, orcamento, permissoes, tour
│  ├─ (tabs)/
│  │  ├─ _layout.tsx             # Barra inferior: Início, Transações, Mony, Cartões, Mais
│  │  ├─ index.tsx               # Início (rota `/`, a primeira tela de quem está logado)
│  │  ├─ transacoes/
│  │  ├─ mony.tsx
│  │  ├─ cartoes/
│  │  └─ mais/
│  ├─ parcelamentos/  orcamentos/  metas/  relatorios/  listas/
│  ├─ lembretes/  agenda/  notificacoes/  contas-bancarias/  categorias/
│  ├─ perfil/  assinatura/  configuracoes/
│  └─ +not-found.tsx
├─ src/
│  ├─ features/                  # Um diretório por módulo de domínio
│  │  └─ cartoes/
│  │     ├─ components/          # Componentes da feature (seguem o design)
│  │     ├─ hooks/               # useCartoes, useFatura (wrappers do api-client)
│  │     ├─ screens/             # Composição das telas (as rotas só importam daqui)
│  │     └─ cartoes.strings.ts   # Chaves de i18n da feature
│  ├─ ui/                        # Design system: tokens, tipografia, Botao, Campo, Card, Sheet…
│  ├─ lib/
│  │  ├─ api/                    # Instância HTTP, interceptors de token, retry
│  │  ├─ auth/                   # Sessão, refresh, biometria
│  │  ├─ notifications/          # Registro de token, handlers, categorias de ação
│  │  ├─ deeplinks/              # Mapa link_interno → rota
│  │  ├─ dinheiro.ts  datas.ts   # Reexporta @mony/shared
│  │  └─ analytics.ts
│  ├─ stores/                    # Zustand: sessao, privacidade, preferenciasLocais
│  └─ i18n/
├─ plugins/                      # Config plugins próprios (permissões, entitlements)
├─ assets/
├─ test/                         # Testes que cruzam o app (navegação, app.config); fora de app/
├─ app.config.ts                 # Config dinâmica por ambiente (APP_ENV)
└─ eas.json                      # Perfis development, preview e production
```

`app.config.ts` é compilado sozinho pelo Expo: ele só importa pacotes, nunca arquivos locais. O que o app precisa ler em execução (ambiente, URL da API, DSN do Sentry) vai em `extra` e é validado por `src/lib/ambiente.ts`. Testes do app ficam em `test/` ou ao lado do código em `src/` (`*.test.ts(x)`), nunca em `app/`, que o Expo Router lê como rotas.

As rotas em `app/` ficam finas: só importam a `screen` da feature. Isso mantém a navegação trocável e as telas testáveis.

## Navegação e deep links

- Expo Router com grupos `(auth)`, `(onboarding)` e `(tabs)`. O `_layout.tsx` raiz decide o grupo pelo estado da sessão e por `usuario.onboardingConcluido`.
- Esquema `mony://` e Universal Links / App Links em `https://app.<dominio>/`.
- Toda notificação traz `linkInterno` (ex.: `mony://cartoes/<id>/faturas/<id>`). `lib/deeplinks` valida o link contra uma lista de rotas permitidas antes de navegar.
- Links que o servidor já manda (`LINKS_INTERNOS` em `@mony/shared/alertas`): `mony://inicio`, `mony://notificacoes`, `mony://cartoes/<id>`, `mony://cartoes/<id>/faturas/<id>`, `mony://orcamentos?competencia=AAAA-MM`, `mony://transacoes/<id>` e `mony://parcelamentos/<id>`.

## Dados e estado

| Tipo de estado | Onde |
|---|---|
| Dados do servidor (transações, cartões, dashboard) | TanStack Query, com chaves padronizadas em `@mony/api-client` |
| Sessão (usuário, tokens em memória) | Zustand + `expo-secure-store` |
| Preferências só do aparelho (modo privacidade, última aba) | Zustand persistido em MMKV/AsyncStorage |
| Formulários | React Hook Form + schema Zod de `@mony/shared` |

Regras de cache:
- Após qualquer mutação financeira, invalidar `dashboard`, `transacoes`, `cartoes`, `orcamentos` (a API devolve na resposta da mutação o "impacto" para atualizar a tela na hora).
- Mutações simples (marcar item de lista, marcar lembrete feito) são otimistas.
- **Modo offline (decisão técnica):** leitura do cache persistido (`@tanstack/query-async-storage-persister`) quando sem rede; escrita offline **não** entra no lançamento inicial, porque limites de plano e regras de fatura são do servidor. O app mostra estado "sem conexão" e bloqueia gravação. Alarmes locais continuam tocando sem internet (exigência do PDF).

**Como está (T-045):**

- `invalidarDadosFinanceiros` (`src/lib/api/invalidar.ts`) marca como velhas as consultas de transações, Início, cartões, faturas, orçamentos, contas, relatórios, recorrências e parcelamentos, pela rota no começo da chave. A mutação não espera a resposta: a tela volta na hora e a lista se atualiza depois. A consulta do lançamento excluído fica velha sem ser buscada (seria 404).
- Consulta repete até 2 vezes sem rede, em 5xx e em 429; 4xx vai direto para a tela (`deveRepetirConsulta`).
- O "agora" vem de `src/lib/relogio.ts` (os testes fixam a data) e o "hoje" é o do fuso do perfil (`useHoje`, `GET /v1/me`), o mesmo da API.

## Rede e autenticação

- Cliente gerado pelo Orval usa uma instância HTTP com:
  - `Authorization: Bearer <access>` (15 min).
  - Em 401, um único refresh concorrente (fila de requisições aguardando), depois repete. Refresh falhou → logout local.
  - Header `Idempotency-Key` (UUID) em todo `POST` que cria dado financeiro, para não duplicar em retry.
  - Headers `X-App-Version`, `X-Platform`, `X-Device-Id` para suporte e bloqueio de versões antigas.
- Tokens: `refresh` no `expo-secure-store` (Keychain / Keystore). `access` só em memória.
- Biometria (`expo-local-authentication`) **só libera o refresh guardado**; não substitui autenticação no servidor (RN-005).
- Versão mínima: `GET /v1/config-app` retorna `versaoMinima`. Abaixo dela, tela de atualização obrigatória.

**Como está (T-034):**

- **Cliente** (`@mony/api-client`, `requisicao`): manda o token, os cabeçalhos do app (`cabecalhos`) e, em 401 de requisição feita com token, chama `renovarSessaoUmaVez()` e repete a requisição uma vez. Requisições recusadas ao mesmo tempo esperam a mesma renovação. As rotas `/v1/auth/…` nunca disparam renovação; sem isso, um 401 da própria renovação travaria a fila.
- **Cofre** (`src/lib/auth/cofre.ts`, `expo-secure-store` com `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`): token de renovação, identificador do aparelho (UUID gerado na primeira abertura) e a escolha da biometria. O plugin do `expo-secure-store` tira o cofre do backup do Android.
- **Sessão** (`src/lib/auth/sessao.ts` e store `useSessao` com `estado`):
  - `iniciando`: na abertura, procura a renovação guardada. Sem renovação, vai para o login. Com biometria ligada, `bloqueada`. Senão, renova e fica `pronta`.
  - A renovação recusada (400, 401, 403) sai do aparelho. Sem rede, 5xx, 426 ou 429, o token fica para a próxima abertura.
  - A restauração roda uma vez só: duas renovações com o mesmo token seriam reuso (RN-004). Cofre ilegível vai para o login, e o erro vai para o Sentry.
  - "Sair deste aparelho" (aba Mais) revoga a renovação na API e apaga o cofre, mesmo sem rede.
- **Telas** em `(auth)`: login, cadastro (com o aceite dos termos e da política nas versões de `VERSOES_DOCUMENTOS`) e recuperação de senha (código de 6 dígitos e senha nova, que já entra no app). Formulários com React Hook Form e os esquemas Zod do `@mony/shared/autenticacao`; o erro da API aparece com a mensagem do catálogo.
- **Biometria** (RN-005): ligada na aba Mais, depois de uma confirmação. Na abertura, a tela de bloqueio pede a biometria e só então renova. Quem desiste entra de novo com e-mail e senha. O texto do Face ID vem do plugin do `expo-local-authentication`.
- **Chat da Mony:** o SSE pelo `expo/fetch` manda os mesmos cabeçalhos e, em 401, espera a mesma renovação única e tenta de novo uma vez.
- **Ainda não:** botões do Google e da Apple (T-055) e tela de atualização obrigatória (T-056). Sem rede na abertura, o app mostra o login, e a renovação guardada vale na próxima abertura.

## Chat da Mony

- Envio por `POST /v1/mony/mensagens` com resposta em **SSE** lida com `expo/fetch` (streaming de texto e eventos de componente).
- Eventos SSE: `texto.delta`, `componente` (botões, cartão de resumo), `acao.resultado`, `erro`, `fim`.
- Toque em botão vai por `POST /v1/mony/acoes` com `{ mensagemId, acaoId, payload }`, sem texto livre (RN-084).
- **Como está (PoC T-020):** `src/lib/mony/conversa.ts` lê o SSE com o `expo/fetch` (`body.getReader()`) e o `LeitorSse` de `@mony/shared/mony`. A aba Mony mostra a resposta crescendo e os botões como `Chip`. Na PoC, o botão manda `{ acao }` (o estado do lançamento vai no botão); a T-061 troca por rascunho no servidor.
- Áudio: gravação com `expo-audio` (AAC/m4a), upload por URL assinada, depois a mensagem referencia o `arquivoId`.
- Foto, print, PDF: `expo-image-picker` / `expo-document-picker`, compressão de imagem no aparelho (lado maior até ~2000 px) antes do upload.
- QR Code de NFC-e: `expo-camera` com leitura de código; envia a URL lida para `POST /v1/mony/nfce`.
- Histórico paginado (`GET /v1/mony/conversa`) com FlashList invertida e busca.
- Atalhos de sugestão acima do teclado vêm da API (`sugestoes` na resposta da conversa).

## Notificações no aparelho

- `expo-notifications` registra o token e envia em `POST /v1/me/dispositivos`.
- Categorias de ação (botões na notificação): `lembrete` → [Feito] [Adiar]; `fatura_atrasada` → [Paguei]. A ação chama a API em segundo plano.
- Canais Android: `alertas`, `lembretes`, `alarmes` (som próprio, prioridade máxima), `novidades`.
- Alarmes: módulo `mony-alarm` (ver abaixo). Agendados localmente para tocar sem internet; o servidor envia a lista de lembretes com canal alarme e o app reagenda ao abrir e ao receber push silencioso.

## Módulos nativos (Expo Modules API)

| Módulo | iOS (Swift) | Android (Kotlin) | Disponibilidade |
|---|---|---|---|
| `mony-app-usage` | FamilyControls + DeviceActivity (extensão `DeviceActivityMonitor`), exige entitlement da Apple | `UsageStatsManager` com permissão de acesso ao uso, verificação periódica | iOS 16+. Android: todas as versões suportadas |
| `mony-alarm` | **AlarmKit** no iOS 26+. Abaixo: notificação local com som de alarme (até 30 s) | `AlarmManager.setAlarmClock` + notificação de tela cheia, permissões `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` | Todos, com qualidade diferente por versão |

Ambos têm **prova de conceito obrigatória na Fase 0** ([15](15-roadmap-e-pendencias.md)), porque dependem de aprovação das lojas e de limitações do sistema. Detalhes em [10](10-integracoes.md#detecção-de-apps-de-compra).

Config plugins em `plugins/` adicionam permissões, entitlements, App Groups e extensões ao `prebuild`, então nada nativo é editado à mão.

## Permissões

Pedidas uma por vez, com tela explicativa antes do diálogo do sistema (onboarding passo 5): notificações, agenda, detecção de apps de compra, conexão bancária. Recusa nunca bloqueia o app; a tela de Permissões em Configurações mostra o estado e leva às configurações do sistema.

**Como está (T-046):** `src/lib/permissoes.ts` lista as quatro permissões e guarda, em `PEDIDOS_DE_PERMISSAO`, quem sabe ver o estado e pedir cada uma. O quadro (`ListaPermissoes`) aparece no onboarding e em `/mais/permissoes`: chave para notificações, agenda e apps de compra, botão "Conectar" para o banco, e a explicação de onde liberar quando a pessoa recusa. Sem o pedido no build, o item mostra "Em breve". Cada módulo nativo entra na sua tarefa: notificações na T-088, agenda na T-085, apps de compra na T-121 e banco na T-120.

## Design system

O cliente vai entregar as telas. Fluxo para receber o design:

1. **Tokens primeiro.** Cores, tipografia, espaçamentos, raios, sombras e ícones viram `src/ui/tokens.ts` e o `tailwind.config.js` do NativeWind. Nenhum componente usa cor ou tamanho fora dos tokens.
2. **Componentes base** em `src/ui/` (Botão, Campo, Valor monetário com modo privacidade, Card, Chip, Barra de progresso por faixa, BottomSheet, Toast, Vazio, Erro, Skeleton) antes das telas.
3. **Telas** montadas só com componentes base + componentes de feature.
4. Modo claro/escuro se o design trouxer os dois. (O design veio só escuro.)
5. Se o design vier no Figma, exportar tokens (ex.: Tokens Studio) para não copiar valor à mão.

Pedir ao cliente junto com as telas: estados vazios, de carregamento e de erro; tela de sem conexão; versões das telas de permissão; ícone e splash; ícones de categoria e bandeiras de cartão.

Componente `Valor` concentra a formatação de dinheiro e o **modo privacidade** (oculta valores em todo o app com um toque, RN-022).

**Como está (T-017), com o design do cliente** (`docs/design/telas-app.pdf` e o resumo em `docs/design/README.md`):

- **Tokens** em `src/ui/tokens.ts`, medidos nas telas do cliente.
  - Cores com nome de uso: `fundo`, `superficie`, `superficie-alta`, `vidro`, `texto`, `texto-suave`, `texto-fraco`, `claro`, `primaria`, `link`, `receita`, `despesa`, `balao-usuario` e as faixas `normal`/`atencao`/`estourado`.
  - O degradê do fundo (`degradeFundo`).
  - Espaços em pt e raios: cards de 22 pt, botões e chips em pílula.
  - Tipografia de `legenda` a `destaque`, pesos e sombras.
  - Toque mínimo de 44 pt e botão de 50 pt.
  - As cores de texto têm contraste AA sobre `fundo` e `superficie`, conferido em teste.
- **Só modo escuro** (decisão do cliente): `userInterfaceStyle: 'dark'`, tema escuro da navegação nas cores do app e barra de status clara.
- **NativeWind 4** (Tailwind 3): o `tailwind.config.js` lê os tokens e **troca** o tema do Tailwind, então classe fora dos tokens (`bg-blue-500`, `p-7`) não existe. O `global.css` entra no `_layout.tsx` raiz, e o Metro compila o CSS.
- **Componentes** (`@/ui`), todos com rótulo e papel para o leitor de tela:
  - `Tela` (degradê e área segura);
  - `Texto`, `Icone`, `Logo`;
  - `Botao` (`primaria` clara, `secundaria` de vidro, `fantasma` como link, `perigo`) e `BotaoIcone` (com ou sem círculo de vidro);
  - `Campo`, `CaixaDeSelecao`, `Chip`;
  - `Valor` e `BotaoPrivacidade`;
  - `Card`, `BarraProgresso` (cor pela faixa da RN-062);
  - `Vazio`, `Erro`, `Skeleton`;
  - `BarraAbas`: pílula flutuante, com a aba atual em vidro e a Mony no meio;
  - da T-045: `Folha` (bottom sheet sobre `Modal`, com véu, X e voltar do Android), `Etiqueta` ("Pendente", "Atrasada"), `CampoBusca` (pílula com lupa e X), `CampoValor` (só dígitos: "1050" vira R$ 10,50), `Valor` com `comSinal` e `Chip` desabilitado;
  - da T-046: `AnelProgresso`; da T-049: `GrupoOpcoes` (escolha em chips com título e erro), `Segmentado` (abas em pílula) e `Cabecalho` (voltar, título e ação).

  `Toast` entra com a primeira tela que precisar dele. O ícone da categoria (`IconeCategoria`, em `src/features/categorias`) liga a chave do ícone das categorias padrão a um ícone do Lucide; a cor é a da categoria, escolhida pelo usuário.
- **Ícones:** Lucide (`lucide-react-native` com `react-native-svg`), importados um a um pelo caminho (`lucide-react-native/icons/<nome>`) para o bundle levar só os usados. A lista fica em `src/ui/icone.tsx`.
- **Logo, ícone e splash** provisórios, tirados do PDF, em `assets/images/`. O cliente ainda vai mandar o arquivo original.
- **Modo privacidade:** store `usePrivacidade`, guardado no AsyncStorage do aparelho.

## Aba Transações (T-045)

Telas em `src/features/transacoes`, no design da página 4 (`docs/design`):

- **Lista** (`/transacoes`): mês com setas, busca (350 ms depois da última letra), botão de filtros, totais do filtro (receitas, despesas, saldo, de `GET /transacoes/totais`), chips Todas, Despesas, Receitas e Pendentes, e a lista por dia ("Hoje, 9 de outubro"), 30 por página pelo cursor.
  - O item mostra o ícone e a cor da categoria, a descrição e a linha de detalhes: categoria, cartão (ou forma de pagamento, ou conta), "todo mês" da recorrência e a origem ("via Mony", "do banco"). Receita vem com "+" em verde; pendente ganha a etiqueta.
  - A folha de filtros combina tipo, situação, categoria, forma de pagamento, cartão, conta e origem (RN-047). Os chips só acendem nas combinações deles; o resto conta no botão ("Filtros, 2 ativos").
- **Seleção múltipla:** segurar um item começa; tocar marca e desmarca. Mudar categoria (só com itens do mesmo tipo) e excluir vão por `POST /transacoes/lote`, tudo ou nada (RN-044); a mensagem da API aparece na folha.
- **Formulário** (`/transacoes/nova` e `/transacoes/<id>`, também pelo link `mony://transacoes/<id>`):
  - tipo, valor, descrição, data (`DD/MM/AAAA` com Hoje e Ontem), categoria do tipo, forma de pagamento, cartão (na compra no cartão) ou conta, "já foi pago" e observação;
  - validado pelos esquemas `esquemaNovaTransacao` e `esquemaAtualizacaoTransacao` do `@mony/shared`; a edição manda só o que mudou;
  - "já foi pago" mostra o status padrão da RN-042 e só vai para a API se a pessoa mexer; compra no cartão não tem conta nem status;
  - lançamento do banco, parcela, pagamento de fatura, transferência e compra em fatura paga só mudam descrição, categoria e observação (`motivoDaTrava`, espelho do doc 05);
  - a `Idempotency-Key` é uma por formulário;
  - excluir pede confirmação, e na ocorrência de recorrência pergunta só esta, esta e as próximas, ou todas (RN-043). Parcela, transferência e compra em fatura paga não têm o botão.
- **Ainda não:** anexos e recorrência no formulário (tarefas próprias no BACKLOG). O tipo das respostas da lista e do lançamento vem do `@mony/shared`, porque o contrato gerado tipa `string | null` de topo como `string[]` (tarefa própria no BACKLOG).

## Categorias e contas (T-049)

Telas na aba Mais (`/mais/categorias`, `/mais/contas`), abertas pelos atalhos da aba até a grade da T-057:

- **Categorias** (design, página 8): abas Despesas e Receitas com a quantidade, ícone e cor de cada uma e o "+" que cria no tipo da aba. O formulário mostra a prévia, o nome, o tipo (só ao criar), 14 cores e 21 ícones (os das categorias padrão e outros para categorias novas), validado pelo `esquemaNovaCategoria`; a edição manda só o que mudou. Nome repetido volta com a mensagem da API (RN-065).
- **Excluir categoria** (RN-066) pede a categoria do mesmo tipo para onde vão os lançamentos, avisa que os orçamentos dela saem e não oferece excluir a única do tipo.
- **Contas** (sem design próprio): nome, tipo e o saldo atual calculado pela API. O formulário tem saldo inicial em dígitos e uma chave para saldo negativo. Conta do banco (Open Finance) só muda o nome e não tem "Excluir" (sai desconectando o banco); a manual sai com confirmação, e o que a usava fica sem conta.
- O design mostra "38 lançamentos" em cada categoria; a API não manda essa contagem, então a lista não mostra.

## Onboarding

Rotas em `(onboarding)` seguindo o PDF: boas-vindas (2–3 telas), primeiro lançamento guiado no chat, cartões (opcional), orçamento inicial, permissões uma a uma, tour pulável. O progresso fica no servidor (`GET/PATCH /v1/me/onboarding`) para o **checklist de primeiros passos** no Início. Dicas contextuais na primeira visita a cada tela usam um registro de "dicas vistas" no servidor (para sobreviver a reinstalação).

**Como está (T-046), com o design (página 2):**

- **Fluxo inicial** em `(onboarding)`: duas telas de boas-vindas (`/boas-vindas`, etapas 1 e 2 de 3; a segunda não tem design próprio e segue o mesmo visual) e as permissões (`/permissoes`, etapa 3). "Pular" leva às permissões.
  - "Concluir" grava `{ concluido: true, etapas: { permissoes: 'concluida' } }`; "Configurar depois" grava só `concluido`, e o passo fica no checklist. Com a resposta, a sessão marca `onboardingConcluido` e a navegação passa para as abas.
  - Primeiro lançamento, cartões e orçamento não são telas do fluxo: viram passos do checklist, como no design do Início.
- **Checklist** (`CartaoChecklist`, RN-024), no Início provisório até a T-053: anel com os passos feitos, a frase dos dois próximos ("Cadastre seus cartões e defina os orçamentos do mês.") e "Continuar", que abre a folha com os cinco passos.
  - Cada passo pendente tem "Fazer agora" (primeiro gasto → `/transacoes/nova`, cartões → `/cartoes`, avisos → `/mais/permissoes`) e "Dispensar". Orçamento ainda não tem tela (T-052) e o tour não tem tela própria: os dois só são dispensados.
  - O primeiro lançamento e o primeiro cartão são marcados pela API; avisos, pelo "Concluir" ou pelo "Pronto" da tela de Permissões; o tour, ao fechar a primeira dica.
  - A mudança aparece na hora (`useAtualizarOnboarding` atualiza o cache antes da resposta e volta se a API recusar).
- **Dicas** (`Dica`): uma por tela, só depois que o progresso chega da API e só se a chave não está em `dicasVistas`. Fechar grava a chave no servidor. Hoje: `transacoes.selecao` e `mony.primeira-conversa`; dica nova entra no tipo `ChaveDica` e nos textos.

## Performance e qualidade

- Hermes ligado (padrão).
- Imagens com `expo-image` e cache.
- Dashboard em uma chamada (`GET /v1/dashboard`), para a tela inicial abrir com um request.
- Sentry com source maps enviados pelo EAS. PostHog com eventos de funil (cadastro, onboarding, primeiro lançamento, uso da Mony, conversão).
- Acessibilidade: `accessibilityLabel` em todo botão de ícone, tamanho de toque mínimo de 44 pt, fonte dinâmica respeitada.
