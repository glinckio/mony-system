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
│  ├─ (telas)/                   # Por cima das abas, com voltar e sem a barra; só com sessão
│  │  ├─ orcamentos.tsx  metas/
│  │  └─ parcelamentos/  relatorios/  listas/  lembretes/  agenda/  notificacoes/  perfil/ …
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
- Links que o servidor já manda (`LINKS_INTERNOS` em `@mony/shared/alertas`): `mony://inicio`, `mony://notificacoes`, `mony://cartoes/<id>`, `mony://cartoes/<id>/faturas/<id>`, `mony://orcamentos?competencia=AAAA-MM`, `mony://transacoes/<id>`, `mony://parcelamentos/<id>` e `mony://mony` (o chat, nos resumos da T-083).

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
  - "Sair da conta" (Perfil) revoga a renovação na API e apaga o cofre, mesmo sem rede.
- **Telas** em `(auth)`: login, cadastro (com o aceite dos termos e da política nas versões de `VERSOES_DOCUMENTOS`) e recuperação de senha (código de 6 dígitos e senha nova, que já entra no app). Formulários com React Hook Form e os esquemas Zod do `@mony/shared/autenticacao`; o erro da API aparece com a mensagem do catálogo.
- **Biometria** (RN-005): ligada no Perfil, depois de uma confirmação. Na abertura, a tela de bloqueio pede a biometria e só então renova. Quem desiste entra de novo com e-mail e senha. O texto do Face ID vem do plugin do `expo-local-authentication`.
- **Chat da Mony:** o SSE pelo `expo/fetch` manda os mesmos cabeçalhos e, em 401, espera a mesma renovação única e tenta de novo uma vez.
- **Atualização obrigatória (T-056):** na abertura, o app confere a `versaoMinima` do `GET /config-app` (rota pública, que responde até para versão antiga) com a `versaoAbaixoDaMinima` do `@mony/shared`. Abaixo dela, ou com qualquer 426 `VERSAO_APP_DESATUALIZADA` (o `aoErro` do cliente gerado e o chat da Mony avisam o store `useAtualizacao`), a raiz troca o app inteiro pela tela "Atualize o Monitorizze", sem voltar. O botão abre a página do app na loja (`urlLoja` no `extra`): no Google Play pelo identificador; na App Store pelo `EXPO_PUBLIC_APP_STORE_ID`, que sai na publicação (T-146), e até lá pela busca do nome. O store fica só em memória: a próxima abertura confere de novo.
- **Ainda não:** botões do Google e da Apple (T-055). Sem rede na abertura, o app mostra o login, e a renovação guardada vale na próxima abertura.

## Chat da Mony

- Envio por `POST /v1/mony/mensagens` com resposta em **SSE** lida com `expo/fetch` (streaming de texto e eventos de componente).
- Eventos SSE: `transcricao` (o texto do áudio, T-064), `texto.delta`, `componente` (botões, cartão de resumo), `acao.resultado`, `erro`, `fim`.
- Toque em botão vai por `POST /v1/mony/acoes` com `{ acao }`, a ação que veio no botão (`{ tipo, … }`: resposta do rascunho, [Desfazer], confirmação de exclusão, confirmação do que foi lido de foto ou PDF ou cancelar; T-061, T-062a e T-065), com `Idempotency-Key` e sem texto livre (RN-084). O app não lê a ação: só a devolve. A exceção é o botão que só abre uma tela, `{ tipo: 'abrir', link }` (o [Ver planos] do limite do gratuito, RN-123, T-100): o app abre a rota do link (`rotaDoLink`) e não chama a API.
- **Como está (T-020, tela completa na T-069):** `src/lib/mony/conversa.ts` lê o SSE com o `expo/fetch` (`body.getReader()`) e o `LeitorSse` de `@mony/shared/mony`. A aba Mony (`features/mony`: a tela, o `useChatMony`, o `useHistoricoMony` e os componentes `Balao`, `Atalhos`, `FolhaDocumento` e `FolhaBusca`) abre com o histórico (`GET /mony/conversa`, 30 por página, lido uma vez por abertura) numa `FlatList` invertida: a mais nova embaixo, as mais antigas ao subir até o topo. Mostra a resposta crescendo, os botões como `Chip` e o cartão de resumo do que foi gravado (valor, descrição, categoria, data, forma ou cartão e parcelas, e o impacto no orçamento e no cartão na cor da faixa, RN-089) com o [Desfazer]; os botões do histórico também respondem, e tocar num botão tira só aquele componente. O estado do lançamento fica no rascunho do servidor (T-061). Falha ao carregar o histórico mostra o aviso com [Tentar de novo] e o chat continua.
- Áudio (T-064): com o campo vazio, o botão de microfone grava com `expo-audio` (AAC/m4a, mono, 64 kbps; até 10 minutos, quando envia sozinho), com [Cancelar gravação] e [Enviar áudio]. O arquivo sobe por URL assinada (`POST /arquivos`, tipo `audio`) e a mensagem leva o `arquivoId`; o balão mostra "Entendendo o áudio…" até o evento `transcricao` trazer o texto. Microfone negado: a Mony avisa para liberar nos Ajustes. Sem áudio em segundo plano (`enableBackgroundPlayback` e `enableBackgroundRecording` desligados).
- Foto, print, PDF (T-065): o clipe ao lado do microfone abre a folha com [Tirar foto], [Foto ou print da galeria] e [PDF] (`expo-image-picker` / `expo-document-picker`, compressão de imagem no aparelho, lado maior até ~2000 px, em JPEG); o arquivo sobe por URL assinada e a mensagem leva o `arquivoId`. Os lançamentos lidos chegam como cartões "para confirmar" (o que falta aparece "a escolher"); tocar num botão tira só aquele componente da mensagem, e [Confirmar todos] tira os cartões da mesma leitura.
- QR Code de NFC-e: `expo-camera` com leitura de código; envia a URL lida para `POST /v1/mony/nfce`.
- Histórico paginado (`GET /v1/mony/conversa`) com lista invertida (`FlatList`; a FlashList entra se a conversa longa pesar) e busca: a lupa abre a folha "Buscar na conversa", que busca a partir de 2 letras (300 ms depois da última) e mostra quem disse, o dia e o texto.
- Atalhos de sugestão acima do campo vêm da API (`sugestoes` na primeira página da conversa, T-069), com o campo vazio; tocar manda a frase.

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

Config plugins em `plugins/` adicionam permissões, entitlements, App Groups e extensões ao `prebuild`, então nada nativo é editado à mão. No Android, o que é só do módulo (permissões, `<queries>`) fica no `AndroidManifest.xml` do próprio módulo, que o build junta ao do app; config plugin só para o que mexe no app.

Cada módulo é um pacote do workspace (`modules/<nome>`) e entra no app como dependência (`"mony-app-usage": "workspace:*"` no `package.json` do app), que o autolinking do Expo encontra. O JS que conversa com o módulo fica no app (`src/lib/uso-de-apps.ts`), com `requireOptionalNativeModule`: no iOS, nos testes e em build sem o módulo, ele é `null`, e a tela trata. A lógica que não depende do Android fica em classes Kotlin puras, testadas com JUnit no CI ("Módulos nativos").

**`mony-app-usage` no Android (T-022):** o WorkManager roda a verificação a cada 15 min; ela lê os eventos `ACTIVITY_RESUMED` e `ACTIVITY_PAUSED` dos apps monitorados desde a anterior e conta como abertura a volta ao app depois de 30 min sem vê-lo. O estado fica nas preferências do app, porque o worker roda sem o JS. Detalhes e medições em [docs/agentes/poc/T-022.md](../agentes/poc/T-022.md).

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
- **NativeWind 4** (Tailwind 3): o `tailwind.config.js` lê os tokens e **troca** o tema do Tailwind, então classe fora dos tokens (`bg-blue-500`, `p-7`) não existe e some sem aviso. O teste `test/classes-tailwind.test.ts` (T-148) lê os textos do código de `app/` e `src/` e falha quando uma palavra é classe no Tailwind de fábrica e não no tema do app; tamanho fora da escala vai em `style`. O `global.css` entra no `_layout.tsx` raiz, e o Metro compila o CSS.
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
- **Anexos** (T-058, RN-040): câmera, galeria ou PDF, até cinco por lançamento. A foto é reduzida no aparelho (`expo-image-manipulator`, lado maior até 2.000 px, JPEG); o PDF vem do `expo-document-picker`. Cada anexo vai direto ao S3 ao ser escolhido (`POST /arquivos` com tipo e tamanho, depois o `PUT` na URL assinada com os cabeçalhos dela) e só fica no lançamento quando ele é salvo (`anexoIds`; na edição, a lista inteira, só se mudou, inclusive no lançamento travado). O que já está no lançamento abre pela URL de leitura (`GET /arquivos/:id`) e pode sair. Os textos dos pedidos de câmera e fotos vão no plugin do `expo-image-picker`.
- **Recorrência** (T-059, RN-043): o lançamento novo tem "Repetir" (toda semana, todo mês ou todo ano, com "Até" opcional). Com ele, o salvar vira `POST /recorrencias` (a data é o início; a mesma `Idempotency-Key`), e a API gera as ocorrências; status, observação e anexos somem do formulário, porque são de cada lançamento. A ocorrência mostra a recorrência dela ("Repete todo mês · sem data final"), com "Editar recorrência" e "Parar recorrência" (`DELETE /recorrencias/:id`, com confirmação).
- **Editar recorrência** (`/recorrencias/<id>`, no grupo `(telas)`): valor, descrição, categoria, forma (com cartão ou conta), frequência, dia (do mês, ou da semana na semanal; trocar entre as duas volta ao dia da data de início) e data final (vazia tira). Vai só o que mudou (`PATCH /recorrencias/:id`), e a API refaz as ocorrências futuras livres.

## Categorias e contas (T-049)

Telas na aba Mais (`/mais/categorias`, `/mais/contas`), abertas pela grade da aba:

- **Categorias** (design, página 8): abas Despesas e Receitas com a quantidade, ícone e cor de cada uma e o "+" que cria no tipo da aba. O formulário mostra a prévia, o nome, o tipo (só ao criar), 14 cores e 21 ícones (os das categorias padrão e outros para categorias novas), validado pelo `esquemaNovaCategoria`; a edição manda só o que mudou. Nome repetido volta com a mensagem da API (RN-065).
- **Excluir categoria** (RN-066) pede a categoria do mesmo tipo para onde vão os lançamentos, avisa que os orçamentos dela saem e não oferece excluir a única do tipo.
- **Contas** (sem design próprio): nome, tipo e o saldo atual calculado pela API. O formulário tem saldo inicial em dígitos e uma chave para saldo negativo. Conta do banco (Open Finance) só muda o nome e não tem "Excluir" (sai desconectando o banco); a manual sai com confirmação, e o que a usava fica sem conta.
- O design mostra "38 lançamentos" em cada categoria; a API não manda essa contagem, então a lista não mostra.

## Cartões e faturas (T-050)

Telas em `src/features/cartoes`, no design da página 4 (`docs/design`), nas rotas que o servidor já manda nos alertas (`LINKS_INTERNOS`):

- **Aba Cartões** (`/cartoes`, e `/cartoes/<id>` pelo link da notificação, já com aquele cartão): os cartões em carrossel (arrastar ou tocar escolhe) e, do escolhido:
  - o limite (RN-034): usado, disponível (ou "Acima do limite", em vermelho), a barra e as faixas de aviso do cartão;
  - a fatura atual: total, situação (aberta, fechada, paga em parte, paga, atrasada), fechamento e vencimento, o aviso de vencimento no fim de semana, "Marcar fatura como paga" (com saldo) e "Ver fatura" (com compras);
  - as próximas faturas (até três, com parcelas e recorrências já lançadas), "Todas as faturas" e "Editar cartão".
- **Pagar a fatura** (RN-036): folha com o valor começando no que falta pagar (menor é parcial e avisa que o resto fica na fatura; maior não vai), a data até hoje, a conta de pagamento do cartão já escolhida e a forma (opcional). Uma `Idempotency-Key` por abertura da folha.
- **Faturas** (`/cartoes/<id>/faturas`): todas, da mais nova para a mais antiga, com total e situação. **Fatura** (`/cartoes/<id>/faturas/<id>`, também pelo link): total, pago, saldo, as compras (abrem o lançamento) e os pagamentos.
- **Cadastro e edição** (`/cartoes/novo`, `/cartoes/<id>/editar`): nome, bandeira, últimos 4 dígitos, limite, dias de fechamento e vencimento (RN-030), 10 cores, faixas de aviso (50, 70, 80, 90 e 100%, RN-038) e conta de pagamento, validados pelo `esquemaNovoCartao`; a edição manda só o que mudou. Cartão do banco (Open Finance) só muda nome, cor, avisos e conta. Excluir pede confirmação e mostra a recusa da API quando há fatura em aberto.

## Orçamentos e metas (T-052)

Telas em `src/features/orcamentos` e `src/features/metas`, no design da página 5 (`docs/design`), no grupo `(telas)`: abrem por cima das abas, com a seta de voltar, pela grade da aba Mais e, o orçamento, pelo checklist e pelo link dos alertas.

- **Orçamentos** (`/orcamentos`, e `mony://orcamentos?competencia=AAAA-MM` no mês do alerta):
  - o mês com setas, como em Transações;
  - o resumo: anel com o percentual do planejado já gasto (na cor da faixa), o gasto, o planejado, "faltam N dias" e, no mês de hoje, a projeção (soma das projeções da API, RN-061), em laranja quando passa do planejado;
  - cada categoria com a barra na cor da faixa (RN-062), "R$ 312 de R$ 300" e o selo: "Passou R$ 12" quando estoura, o percentual em destaque na atenção, só o percentual no normal;
  - o lápis liga a edição: tocar no item muda o valor, liga ou desliga "repetir todo mês" ou tira o orçamento do mês (RN-060). "Adicionar orçamento" oferece só as categorias de despesa sem orçamento no mês.
- **Metas** (`/metas`): o total guardado em todas, "+ R$ 450 este mês" (o guardado no mês, quando há), cada meta com o prazo ("até dez/2027"), o percentual, a barra (verde e azul, alternados) e "Guardar", e a "Dica da Mony" no fim.
  - **Guardar** (RN-063): folha com o valor e a data (até hoje), uma `Idempotency-Key` por abertura. Se a API mandar `sugerirConclusao`, a folha pergunta se é para concluir a meta.
  - **A meta** (`/metas/<id>`): guardado, falta, prazo, os aportes (cada um pode sair, com confirmação), "Guardar" e "Marcar como concluída" ou "Reabrir meta".
  - **Cadastro e edição** (`/metas/nova`, `/metas/<id>/editar`): nome, valor alvo e prazo opcional (`DD/MM/AAAA`), validados pelo `esquemaNovaMeta`; a edição manda só o que mudou, e apagar o prazo manda `prazo: null`. Excluir pede confirmação.
  - **Dica da Mony** (`dicaDasMetas`): a primeira meta aberta, na ordem da API, que tem conta a fazer. Com ritmo: "Guardando R$ 450 por mês, Reserva fica completa em 20 meses." e, se o ritmo não chega no prazo, "Para chegar até dez/2027, guarde R$ 573,34 por mês."; sem ritmo e com prazo, só o necessário. As contas vêm da API (RN-063); sem conta, a dica some.

## Início (T-053)

Tela em `src/features/inicio`, no design da página 3 (`docs/design`), com uma chamada (`GET /dashboard`):

- **Topo**: as iniciais do nome (abrem o Perfil), "Pesquisar" (abre Transações, que tem a busca), o calendário do período e o sino com o ponto das não lidas, que abre a central de notificações (T-087).
- **Saldo do período** (RN-020) grande, com os centavos menores, o olho do modo privacidade (RN-022) e "Ver o mês" (abre Transações). O título da tela ("Início") é só para o leitor de tela: o design não tem título visível.
- **Período** (RN-021): folha com "Este mês", "Mês passado" e "Escolher" (de e até, `DD/MM/AAAA`), validada pelo `esquemaConsultaDashboard`. Ao trocar, a tela segue com o período anterior até o novo chegar.
- **Atalhos**: Lançar, Orçamentos e Metas. Os do design que ainda não têm tela (Ler nota, Lista, Lembrete) entram com as tarefas deles.
- **Blocos**: o checklist (RN-024), o resumo (receitas e quanto já entrou, despesas pagas, a pagar), os próximos vencimentos (RN-023, até cinco; a fatura abre a fatura, parcela e conta abrem o lançamento), os cartões (cor, fatura atual, barra do limite e vencimento) e os orçamentos do mês (total e as três categorias mais perto de estourar). Cartões e orçamentos só aparecem quando existem.
- Puxar para baixo atualiza o Início e o checklist.

## Relatórios (T-054)

Tela em `src/features/relatorios` (`/relatorios`, no grupo `(telas)`, pela grade da aba Mais), no design da página 6 (`docs/design`). Cada bloco é uma rota da API (`GET /relatorios/:tipo?inicio=&fim=`, RN-150), e a API faz as contas:

- **Abas**: Mês (o de hoje), 6 meses e Ano (12 meses), sempre com o mês de hoje inteiro.
- **Receitas × despesas** (`mensal`): quanto sobrou (ou faltou) no mês ou, com mais de um mês, em média por mês, as barras verde e azul de cada mês e os totais.
- **Por categoria** (`categorias`, despesas): rosca com as quatro maiores e "Outras", nas cores das categorias, o total no meio e os percentuais da API.
- **Por dia da semana**: sete barras, o dia de mais gastos em destaque e a frase "Você gasta mais às sextas: 41% das despesas do período."
- **Por cartão** e **por forma de pagamento**: barras horizontais, do maior para o menor, com quantos lançamentos.
- **Evolução anual** (só na aba Ano): os últimos cinco anos, com receitas, despesas e saldo.
- **Baixar** (RN-151, T-125): o botão do topo abre a folha com [PDF] e [Planilha (Excel)] do período da aba; enquanto o worker gera, "Gerando o relatório…" (o app pergunta a cada 1,5 s); pronto, [Abrir o relatório] abre a URL de 24 h no navegador do aparelho. Falhou: [Tentar de novo]. No gratuito, a mensagem da API e [Ver planos].

## Aba Mais e Perfil (T-057)

Telas em `src/features/mais`, no design das páginas 8 e 9 (`docs/design`):

- **Mais** (`/mais`): o cartão do perfil (iniciais e nome, abre o Perfil), a grade de atalhos e "Configurações". A grade só mostra as telas que já existem (Orçamentos, Metas, Relatórios, Categorias e Contas); Parcelamentos, Listas, Lembretes, Agenda e Bancos entram com as tarefas deles, e Contas sai quando Bancos (Open Finance) chegar.
- **Perfil** (`/mais/perfil`, também pelas iniciais do Início): iniciais, nome e e-mail (`GET /me`); Dados pessoais; Seu plano; Entrar com biometria (RN-005, quando o aparelho tem); Alertas da Mony; Permissões e apps de compra; Rever tutorial; Sair da conta.
- **Seu plano** (`/mais/plano`, T-100): o plano que vale agora (`GET /assinatura/uso`): no teste, "Tudo liberado até 18/out, 12:00."; no gratuito, cada limite com "2 de 3", a barra e, quando acabou, quando volta ("Amanhã libera de novo.", "No dia 1º libera de novo.") ou, nos de quantidade, "Para ter mais, conheça os planos."; e o aviso de que os relatórios mostram só o mês atual. O [Ver planos] da Mony (link `mony://planos`) abre esta tela; a compra dos planos entra com a T-103. No teste, a linha "Seu plano" do Perfil tem o selo "Teste grátis" (T-101); os avisos do teste chegam por push e pela Mony e abrem esta tela.
- **Alertas da Mony** (`/mais/alertas`, T-087): o horário de silêncio (chave e as horas de começo e fim, "22:00"; RN-101), a chave de cada alerta que o app já manda (limite, fatura fechada, vencimento da fatura, fatura atrasada, orçamentos, contas a vencer, fora do padrão, projeção, resumos; assinatura "sempre ligado", RN-100) e, nos vencimentos, a antecedência (no dia, 1, 3, 5 ou 7 dias, RN-108). "Salvar" manda só o que mudou (`PUT /preferencias-alerta`). Os alertas de recursos que ainda não existem (lembretes, agenda, apps de compra, banco) entram com eles.
- **Central de notificações** (`/notificacoes`, pelo sino do Início, T-087): "Todas | Não lidas", da mais nova para a mais antiga (`GET /notificacoes`, 30 por página), a não lida em destaque com o ponto, o título, o corpo e o dia e a hora no fuso do usuário. Tocar marca como lida (`POST /notificacoes/:id/lida`) e abre a tela do `linkInterno` (`rotaDoLink` em `src/lib/links-internos.ts`, que só aceita as rotas que o app tem; parcelamento ainda não tem tela e não abre). "Marcar todas como lidas" (`POST /notificacoes/lidas`). Ler atualiza o ponto do sino.
- **Dados pessoais** (`/mais/dados-pessoais`): nome e celular (`PATCH /me`, validado pelo `esquemaAtualizacaoPerfil`), só o que mudou; o e-mail só aparece. O nome novo vai para a sessão, e as iniciais do app acompanham.
- **Rever tutorial** (`/tutorial`, no grupo `(telas)`): as duas boas-vindas do onboarding, sem as permissões no fim; "Entendi" volta ao Perfil.
- **Ainda não** (com as tarefas deles): a compra dos planos (T-102 e T-103), Exportar meus dados e Excluir conta (T-140) e Ajuda e suporte. O modo escuro do design não vira chave: o app é só escuro (T-017).

## Onboarding

Rotas em `(onboarding)` seguindo o PDF: boas-vindas (2–3 telas), primeiro lançamento guiado no chat, cartões (opcional), orçamento inicial, permissões uma a uma, tour pulável. O progresso fica no servidor (`GET/PATCH /v1/me/onboarding`) para o **checklist de primeiros passos** no Início. Dicas contextuais na primeira visita a cada tela usam um registro de "dicas vistas" no servidor (para sobreviver a reinstalação).

**Como está (T-046), com o design (página 2):**

- **Fluxo inicial** em `(onboarding)`: duas telas de boas-vindas (`/boas-vindas`, etapas 1 e 2 de 3; a segunda não tem design próprio e segue o mesmo visual) e as permissões (`/permissoes`, etapa 3). "Pular" leva às permissões.
  - "Concluir" grava `{ concluido: true, etapas: { permissoes: 'concluida' } }`; "Configurar depois" grava só `concluido`, e o passo fica no checklist. Com a resposta, a sessão marca `onboardingConcluido` e a navegação passa para as abas.
  - Primeiro lançamento, cartões e orçamento não são telas do fluxo: viram passos do checklist, como no design do Início.
- **Checklist** (`CartaoChecklist`, RN-024), no Início: anel com os passos feitos, a frase dos dois próximos ("Cadastre seus cartões e defina os orçamentos do mês.") e "Continuar", que abre a folha com os cinco passos.
  - Cada passo pendente tem "Fazer agora" (primeiro gasto → `/transacoes/nova`, cartões → `/cartoes`, orçamento → `/orcamentos`, avisos → `/mais/permissoes`) e "Dispensar". O tour não tem tela própria: só é dispensado.
  - O primeiro lançamento e o primeiro cartão são marcados pela API; avisos, pelo "Concluir" ou pelo "Pronto" da tela de Permissões; o tour, ao fechar a primeira dica.
  - A mudança aparece na hora (`useAtualizarOnboarding` atualiza o cache antes da resposta e volta se a API recusar).
- **Dicas** (`Dica`): uma por tela, só depois que o progresso chega da API e só se a chave não está em `dicasVistas`. Fechar grava a chave no servidor. Hoje: `transacoes.selecao` e `mony.primeira-conversa`; dica nova entra no tipo `ChaveDica` e nos textos.

## Performance e qualidade

- Hermes ligado (padrão).
- Imagens com `expo-image` e cache.
- Dashboard em uma chamada (`GET /v1/dashboard`), para a tela inicial abrir com um request.
- Sentry com source maps enviados pelo EAS. PostHog com eventos de funil (cadastro, onboarding, primeiro lançamento, uso da Mony, conversão).
- Acessibilidade: `accessibilityLabel` em todo botão de ícone, tamanho de toque mínimo de 44 pt, fonte dinâmica respeitada.
