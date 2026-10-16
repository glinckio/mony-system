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
- Links que o servidor já manda (`LINKS_INTERNOS` em `@mony/shared/alertas`): `mony://inicio`, `mony://notificacoes`, `mony://cartoes/<id>`, `mony://cartoes/<id>/faturas/<id>`, `mony://orcamentos?competencia=AAAA-MM`, `mony://transacoes/<id>`, `mony://parcelamentos/<id>`, `mony://mony` (o chat, nos resumos da T-083), `mony://planos`, `mony://lembretes/<id>` e `mony://listas/<id>` (T-123b, para a Mony da T-123c).

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
- QR Code de NFC-e (T-066b): na folha do clipe, [QR Code do cupom fiscal] abre o leitor em tela cheia (`expo-camera`, só QR). O que a câmera lê é conferido na hora com `lerQrNfce`: QR que não é de cupom, chave danificada, nota fiscal eletrônica (modelo 55) ou cupom de teste do estabelecimento só avisam, e a câmera continua. O cupom que vale fecha o leitor e vai uma vez só a `POST /v1/mony/nfce` (com `Idempotency-Key`); o balão da pessoa é "QR Code do cupom fiscal" e a resposta da Mony traz a compra para confirmar. Câmera negada: [Permitir câmera] ou, negada de vez, [Abrir ajustes]. O [Ver a compra] da nota que a Sefaz achou depois é um botão como os outros (`importar_nfce` em `POST /mony/acoes`).
- Histórico paginado (`GET /v1/mony/conversa`) com lista invertida (`FlatList`; a FlashList entra se a conversa longa pesar) e busca: a lupa abre a folha "Buscar na conversa", que busca a partir de 2 letras (300 ms depois da última) e mostra quem disse, o dia e o texto.
- Atalhos de sugestão acima do campo vêm da API (`sugestoes` na primeira página da conversa, T-069), com o campo vazio; tocar manda a frase.

## Notificações no aparelho

- `expo-notifications` registra o token e envia em `POST /v1/me/dispositivos`.
- Categorias de ação (botões na notificação): `lembrete` → [Feito] [Adiar]; `fatura_atrasada` → [Paguei]. A ação chama a API em segundo plano.
- Canais Android: `alertas`, `lembretes`, `alarmes` (som de alarme, prioridade máxima; criado pelo `mony-alarm`), `novidades`.
- Alarmes: módulo `mony-alarm` (ver abaixo). Agendados localmente para tocar sem internet; o servidor envia a lista de lembretes com canal alarme e o app reagenda ao abrir e ao receber push silencioso.

**Como está (T-088):** `src/lib/push.ts` e o `usePushNoApp`, no layout das abas, que só existe com a sessão aberta.

- **Abertura:** o push também aparece com o app aberto. Os canais `alertas`, `lembretes` (prioridade máxima) e `novidades` são criados com os nomes do i18n (o `alarmes` é do `mony-alarm`), e as categorias, com os botões.
- **Token:** com a permissão liberada, o token do Expo vai para `POST /me/dispositivos` (com o `projectId` do EAS quando há). Isso acontece ao abrir, quando o sistema troca o token e quando a pessoa libera a permissão.
- **Permissão:** o item Notificações das Permissões (onboarding e `/mais/permissoes`) pede ao sistema (`PEDIDOS_DE_PERMISSAO`).
- **Toque:**
  - O toque no corpo abre o `linkInterno` (`rotaDoLink`), e todo toque marca a notificação como lida.
  - [Feito] chama `POST /lembretes/:id/concluir` com a `ocorrencia` do link; [Adiar] chama `POST /lembretes/:id/adiar` com 10 min. Os dois sincronizam os alarmes.
  - [Paguei] chama `POST /faturas/:id/pagar` sem corpo, com a `Idempotency-Key` `paguei-<notificação>`, para o toque repetido não pagar duas vezes.
  - Depois, abre a tela do lembrete ou da fatura. O mesmo toque entregue duas vezes (o ouvinte e a última resposta) é tratado uma vez só.
- **Botões abrem o app:** o JS só recebe o botão que não abre o app se ele ainda estiver vivo.
- **App fechado:** o toque que abriu o app vem pela última resposta.
- **Push silencioso** (`sincronizar_alarmes`): com o app aberto, busca os alarmes de novo. Com o app fechado, quem cobre é a sincronização da próxima abertura (T-088b).

## Módulos nativos (Expo Modules API)

| Módulo | iOS (Swift) | Android (Kotlin) | Disponibilidade |
|---|---|---|---|
| `mony-app-usage` | FamilyControls + DeviceActivity (extensão `DeviceActivityMonitor`), exige entitlement da Apple | `UsageStatsManager` com permissão de acesso ao uso, verificação periódica | iOS 16+. Android: todas as versões suportadas |
| `mony-alarm` | **AlarmKit** no iOS 26+. Abaixo: notificação local com som de alarme (até 30 s) (T-023b) | `AlarmManager.setAlarmClock` + notificação de tela cheia, permissão `SCHEDULE_EXACT_ALARM`; sem ela, `setAndAllowWhileIdle` (T-023a). O `USE_EXACT_ALARM` fica de fora: a Play só aceita em despertador ou agenda | Todos, com qualidade diferente por versão |

Ambos têm **prova de conceito obrigatória na Fase 0** ([15](15-roadmap-e-pendencias.md)), porque dependem de aprovação das lojas e de limitações do sistema. Detalhes em [10](10-integracoes.md#detecção-de-apps-de-compra).

Config plugins em `plugins/` adicionam permissões, entitlements, App Groups e extensões ao `prebuild`, então nada nativo é editado à mão. No Android, o que é só do módulo (permissões, `<queries>`) fica no `AndroidManifest.xml` do próprio módulo, que o build junta ao do app; config plugin só para o que mexe no app.

Cada módulo é um pacote do workspace (`modules/<nome>`) e entra no app como dependência (`"mony-app-usage": "workspace:*"` no `package.json` do app), que o autolinking do Expo encontra. O JS que conversa com o módulo fica no app (`src/lib/uso-de-apps.ts`), com `requireOptionalNativeModule`: no iOS, nos testes e em build sem o módulo, ele é `null`, e a tela trata. A lógica que não depende do Android fica em classes Kotlin puras, testadas com JUnit no CI ("Módulos nativos").

**`mony-app-usage` no Android (T-022):** o WorkManager roda a verificação a cada 15 min; ela lê os eventos `ACTIVITY_RESUMED` e `ACTIVITY_PAUSED` dos apps monitorados desde a anterior e conta como abertura a volta ao app depois de 30 min sem vê-lo. O estado fica nas preferências do app, porque o worker roda sem o JS. Detalhes e medições em [docs/agentes/poc/T-022.md](../agentes/poc/T-022.md).

**`mony-alarm` no Android (T-023a):** `sincronizar(alarmes, textos)` troca a agenda pela lista do servidor (no máximo os 50 mais próximos; os adiados ficam). O disparo, o [Parar], o [Adiar 10 min] e o reagendar depois de ligar o aparelho rodam em receptores do próprio módulo, sem o JS. O canal `alarmes` é criado pelo módulo, com o som de alarme no volume de alarme (toca no modo silencioso). Detalhes em [docs/agentes/poc/T-023a.md](../agentes/poc/T-023a.md).

## Permissões

Pedidas uma por vez, com tela explicativa antes do diálogo do sistema (onboarding passo 5): notificações, agenda, detecção de apps de compra, conexão bancária. Recusa nunca bloqueia o app; a tela de Permissões em Configurações mostra o estado e leva às configurações do sistema.

**Como está (T-046, notificações na T-088):** `src/lib/permissoes.ts` lista as quatro permissões e guarda, em `PEDIDOS_DE_PERMISSAO`, quem sabe ver o estado e pedir cada uma. O quadro (`ListaPermissoes`) aparece no onboarding e em `/mais/permissoes`: chave para notificações, agenda e apps de compra, botão "Conectar" para o banco, e a explicação de onde liberar quando a pessoa recusa. Sem o pedido no build, o item mostra "Em breve". Cada módulo nativo entra na sua tarefa: notificações na T-088, agenda na T-085, apps de compra na T-121 e banco na T-120.

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

- **Topo**: as iniciais do nome (abrem o Perfil), "Pesquisar" (abre Transações, que tem a busca), o calendário do período e o sino com o ponto das não lidas (alertas e novidades, somados), que abre a central de notificações (T-087).
- **Saldo do período** (RN-020) grande, com os centavos menores, o olho do modo privacidade (RN-022) e "Ver o mês" (abre Transações). O título da tela ("Início") é só para o leitor de tela: o design não tem título visível.
- **Período** (RN-021): folha com "Este mês", "Mês passado" e "Escolher" (de e até, `DD/MM/AAAA`), validada pelo `esquemaConsultaDashboard`. Ao trocar, a tela segue com o período anterior até o novo chegar.
- **Atalhos**: Lançar, Orçamentos, Lista (as listas de compras, T-123b) e Lembrete (o novo lembrete, T-084b). Ler nota, do design, entra com a tarefa dele; até lá, Orçamentos fica no lugar.
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
- **Histórico de preços** (RN-150, T-066c): o último bloco abre `/relatorios/precos`, com a busca de produto ("leite", "café"). Com 2 letras ou mais, depois de 350 ms sem digitar, pede `GET /relatorios/precos?busca=` (sem período: o padrão da API). Cada produto dos cupons fiscais lidos pela Mony vem num card com a descrição, a unidade e quantas compras, o último preço e o menor (data e loja) e, com mais de uma loja, a média em cada uma. Acima, o período ("Compras de nov/2025 a out/2026"; no gratuito, "Compras de outubro"). Sem nada: "Nada com “caviar”".

## Lembretes (T-084b)

Telas em `src/features/lembretes`, no design da página 6, sobre as rotas da T-084a (doc 05, "Lembretes"; RN-075 e RN-076):

- **Lista** (`/lembretes`, pela grade da aba Mais):
  - **Abas:** Próximos, Recorrentes e Feitos.
  - **Próximos:** os que tocaram e esperam o [Feito] ("Já tocaram"), Hoje, Amanhã e Próximos dias. Em "Já tocaram" e Hoje, o bloco da esquerda mostra a hora; nos outros, o dia ("QUA 21").
  - **Cada item:** a repetição curta ("Todo mês · 08:00") ou "Adiado até 12:10", e o selo do canal (Alarme, quando tem; senão, Push).
  - **No fim:** "Peça no chat: …".
  - **Recorrentes:** os ativos que repetem. **Feitos:** os últimos 100.
  - **Fora:** o calendário do design (a agenda) entra com a T-085.
- **Novo** (`/lembretes/novo`, pelo "+" e pelo atalho Lembrete do Início) e **editar** (`/lembretes/<id>/editar`):
  - **Campos:** o que lembrar; a data (`DD/MM/AAAA`) e a hora (`HH:MM`) no fuso do usuário (o novo sugere a próxima hora cheia); a repetição; avisar por notificação e por alarme.
  - **Repetição:** não repete, diária, semanal nos dias escolhidos (começa pelo dia da data), mensal ou anual, "a cada N" e "até". A RRULE sai sem o dia do mês nem o mês, que a API tira da data.
  - **Validação:** a data e hora não pode ter passado, menos no ativo que mantém a data.
  - **Envio:** `POST` com a `Idempotency-Key` do formulário. A edição manda só o que mudou. O feito ("Lembrar de novo") vai com a data nova, que o reativa.
- **O lembrete** (`/lembretes/<id>`, também pelo link `mony://lembretes/<id>` do push):
  - **O que mostra:** quando ("Quinta, 15/10/2026 às 08:00"), a repetição por extenso ("Toda semana: seg, qua", "Todo mês, dia 21", ", até 31/12/2027"), os canais, a soneca e "Tocou e espera o feito".
  - **Ações:** [Feito]; [Adiar] (10 minutos, 1 hora ou amanhã no mesmo horário); Editar; Excluir (com confirmação).
- **Alarmes do aparelho (`mony-alarm`, doc 09):**
  - **Quando sincroniza:** ao abrir o app (o layout das abas, e de novo ao voltar para ele) e depois de cada mudança.
  - **Como:** o app busca `GET /lembretes/alarmes` e chama `sincronizar` com os textos do alarme. Sem o módulo (iOS até a T-023b, testes), não faz nada; sem conexão, fica a agenda de antes.
  - **Permissões:** no primeiro lembrete com alarme, se faltam o alarme exato ou a tela cheia, uma folha leva às configurações do sistema. O pedido fica guardado no aparelho e não volta.
  - **Push silencioso:** é tratado na T-088.

## Listas de compras (T-123b)

Telas em `src/features/listas`, no design da página 6, sobre as rotas da T-123a (doc 05, "Listas de compras"; RN-070 a RN-073):

- **Listas** (`/listas`, pela grade da aba Mais e pelo atalho Lista do Início):
  - **Chips:** Todas, Mercado, Casa, Carro, Farmácia e Outra. Filtram as listas pelo tipo.
  - **Cada lista:** o nome, o tipo, "2 de 4 itens" (a finalizada: "Finalizada em 12/out") e o total estimado. As finalizadas ficam embaixo, em "Finalizadas".
  - **Diferença do design:** o design mostra uma lista aberta direto na tela das listas. O app abre a lista numa tela própria, porque cada tipo pode ter várias listas (RN-070).
  - **Compartilhada (T-124d):** a lista diz "Compartilhada com 1 pessoa", ou "Lista de Ana" quando é de outra pessoa.
- **A lista** (`/listas/<id>`, também pelo link `mony://listas/<id>`):
  - **O topo:** o nome, quantos já foram comprados e o total estimado contra o orçamento livre da categoria ("Orçamento livre em Mercado: R$ 40,00"), em laranja e com o aviso "A lista passa do orçamento livre." quando passa (RN-073). Sem orçamento, "Sem orçamento para Mercado".
  - **Os itens:** na ordem em que entraram, com a caixa de comprado. O comprado fica riscado. Ao lado do nome, a quantidade ("(x6)" ou "(1,5 kg)") e o total do item, ou "Sem preço"; embaixo, "subiu 12% desde a última compra" em laranja (ou "caiu", em verde).
  - **Marcar comprado:** a caixa muda na hora (a resposta da API confirma; se falhar, volta).
  - **Pôr item:** o campo no fim da lista manda só o nome, e a API sugere o preço pelas notas (RN-071). O teclado fica aberto para o próximo.
  - **Editar item:** tocar no item abre a folha com o nome, a quantidade (com vírgula, até 3 casas), a unidade e o preço por unidade (vazio deixa sem preço), e o último preço pago nas notas. "Tirar da lista" apaga o item.
- **Finalizar e lançar despesa (RN-072):**
  - **Quando:** só com algum item comprado; antes disso, o botão fica parado com "Marque o que já comprou para finalizar.".
  - **A folha:** o valor (o total dos comprados), a descrição (o nome da lista), a data (hoje), a categoria (a da lista, entre as de despesa), a forma de pagamento e, no crédito, o cartão (senão, a conta opcional).
  - **O envio:** `POST /listas/:id/finalizar` com a `Idempotency-Key` da folha. Depois, a lista fica finalizada, sem caixas nem campo, com [Ver despesa]. Lançamentos, Início e orçamentos buscam de novo.
- **Nova** (`/listas/nova`, pelo "+") e **editar** (`/listas/<id>/editar`, pelo lápis da lista): o nome e o tipo.
  - **Nova:** abre a lista criada. No gratuito, a segunda lista aberta mostra a frase do limite com [Ver planos] (RN-120).
  - **Editar:** manda só o que mudou e tem "Excluir lista", com confirmação. A despesa de uma lista finalizada continua.

## Compartilhar listas e lembretes (T-124d)

Telas em `src/features/compartilhamentos`, sobre as rotas de `/compartilhamentos` (doc 05; RN-074):

- **Convites recebidos:** no topo das Listas (os de lista) e dos Lembretes (os de lembrete, fora da aba Feitos), um card "Convites para você" com "Ana chamou você para a lista “Feira”", [Aceitar] e [Recusar]. Responder busca de novo os convites, as listas e os lembretes.
- **Quem divide:** na lista e no lembrete, os avatares (até três, com as iniciais) e "Compartilhada com 2 pessoas" (no lembrete, "Compartilhado"); no de outra pessoa, o avatar do dono e "Lista de Ana", com "Você só pode ver." quando o acesso é `ver`. Na própria sem ninguém, nada.
- **Compartilhar (só o dono):** o ícone de convidar no topo, ou um toque nos avatares, abre a folha:
  - **Convite:** o e-mail ou o celular de quem tem conta, e "Só ver" ou "Ver e mudar" (o padrão). A recusa da API (sem conta, limite de convites) aparece no campo; o enviado, em "Convite enviado para Ana.".
  - **Quem tem acesso:** cada pessoa com "Convite enviado", "Aceitou" ou "Recusou" (quem recusou fica no fim), os chips da permissão e a lixeira para tirar.
- **O que cada acesso faz:**
  - **Lista:** com `ver`, as caixas ficam paradas e somem o campo de pôr item e o "Finalizar". Nome, tipo e excluir (o lápis) são só do dono.
  - **Lembrete:** com `ver`, sem [Feito] e [Adiar]; com `editar`, os dois. Editar, "Lembrar de novo" e excluir são só do dono. Na lista dos lembretes, o recebido diz "Lembrete de Ana" e o selo é sempre Push (o alarme é do aparelho do dono).
  - **Sair:** quem recebeu tem "Sair da lista" (ou "do lembrete"), com confirmação; apaga o próprio convite e volta para a lista das listas (ou dos lembretes).
- **Tempo real (T-124b):** a lista aberta que é de outra pessoa, ou que a própria divide, ouve o Socket.IO da API (`src/lib/tempo-real.ts`): uma conexão só, aberta na primeira lista e fechada quando nenhuma tela ouve, só pelo WebSocket, com o token da sessão em `auth.token`. Entra em `lista:entrar` ao conectar (e de novo a cada reconexão) e, a cada `lista:mudou`, busca a lista e as listas. Token vencido: renova uma vez (`renovarSessaoUmaVez`) e conecta de novo.
- **Push do lembrete recebido com `ver`:** o [Feito] ou o [Adiar] da notificação recebe 403; o app mostra a mensagem da API num alerta e abre o lembrete.

## Aba Mais e Perfil (T-057)

Telas em `src/features/mais`, no design das páginas 8 e 9 (`docs/design`):

- **Mais** (`/mais`): o cartão do perfil (iniciais e nome, abre o Perfil), a grade de atalhos e "Configurações". A grade só mostra as telas que já existem (Orçamentos, Metas, Relatórios, Listas, Lembretes, Categorias e Contas); Parcelamentos, Agenda e Bancos entram com as tarefas deles, e Contas sai quando Bancos (Open Finance) chegar.
- **Perfil** (`/mais/perfil`, também pelas iniciais do Início): iniciais, nome e e-mail (`GET /me`); Dados pessoais; Seu plano; Entrar com biometria (RN-005, quando o aparelho tem); Alertas da Mony; Permissões e apps de compra; Rever tutorial; na seção Privacidade, Exportar meus dados, Sair da conta e Excluir conta (com a exclusão agendada, a linha mostra a data e abre a desistência).
- **Seu plano** (`/mais/plano`, T-100): o plano que vale agora (`GET /assinatura/uso`): no teste, "Tudo liberado até 18/out, 12:00."; no gratuito, cada limite com "2 de 3", a barra e, quando acabou, quando volta ("Amanhã libera de novo.", "No dia 1º libera de novo.") ou, nos de quantidade, "Para ter mais, conheça os planos."; e o aviso de que os relatórios mostram só o mês atual. Sem plano pago, o [Ver planos] abre os planos. Com plano pago (T-103, `GET /assinatura`): "R$ 199,00 por ano", "Próxima cobrança em 15/out." ou, com o cancelamento agendado, "Termina em 15/out. Não vai ser renovado.", o aviso de cobrança recusada (RN-131) e o [Gerenciar assinatura], que abre o portal da Stripe no navegador do app e, na volta, busca o plano de novo. No teste, a linha "Seu plano" do Perfil tem o selo "Teste grátis" (T-101).
- **Planos** (`/planos`, T-103, design do cliente, pág. 9): o [X] e, no teste, o selo "Seu teste termina em 2 dias" (hoje, amanhã, em N dias, no fuso do usuário); "Continue com a Mony cuidando do seu dinheiro"; o anual (escolhido, selo "Melhor valor", "equivale a R$ 16,58 por mês") e o mensal ("cancele quando quiser"), com os preços de `GET /planos`; o que os pagos liberam; [Assinar plano anual|mensal]; "Cartão · renovação automática · cancele quando quiser" (sem Pix: a Stripe não aceita Pix em assinatura, doc 10); e [Continuar no plano gratuito, com limites], que fecha. O [Assinar] pede `POST /assinatura/checkout` e abre a página com `WebBrowser.openAuthSessionAsync(url, 'mony://planos')`. Volta com `checkout=sucesso`: "Confirmando o pagamento…" e o app pergunta `GET /assinatura` a cada 1,5 s, até 30 s, e, liberado (RN-128), vai para "Seu plano"; passou disso, "O pagamento ainda está sendo confirmado…" com [Ver seu plano]. Fechou de outro jeito: pergunta uma vez (o pagamento pode ter passado sem a volta). Quem já tem plano pago vai direto para "Seu plano". É onde levam o `mony://planos` (o [Ver planos] da Mony e os avisos do teste) e o [Ver planos] dos formulários que recebem `LIMITE_PLANO_ATINGIDO` (lançamento, cartão, lembrete e lista) e da exportação de relatórios.
- **Alertas da Mony** (`/mais/alertas`, T-087): o horário de silêncio (chave e as horas de começo e fim, "22:00"; RN-101), a chave de cada alerta que o app já manda (limite, fatura fechada, vencimento da fatura, fatura atrasada, orçamentos, contas a vencer, fora do padrão, projeção, resumos; assinatura "sempre ligado", RN-100) e, nos vencimentos, a antecedência (no dia, 1, 3, 5 ou 7 dias, RN-108). "Salvar" manda só o que mudou (`PUT /preferencias-alerta`). Os alertas de recursos que ainda não existem (lembretes, agenda, apps de compra, banco) entram com eles.
- **Central de notificações** (`/notificacoes`, pelo sino do Início): duas abas, **Alertas** (T-087) e **Novidades** (T-150, com o número das não lidas no nome). Na aba Alertas, "Todas | Não lidas", da mais nova para a mais antiga (`GET /notificacoes`, 30 por página), a não lida em destaque com o ponto, o título, o corpo e o dia e a hora no fuso do usuário. Tocar marca como lida (`POST /notificacoes/:id/lida`) e abre a tela do `linkInterno` (`rotaDoLink` em `src/lib/links-internos.ts`, que só aceita as rotas que o app tem; parcelamento ainda não tem tela e não abre). "Marcar todas como lidas" (`POST /notificacoes/lidas`). Ler atualiza o ponto do sino.
- **Aba Novidades** (T-150): as novidades no ar (`GET /novidades`, até 50), da mais nova para a mais antiga, com a data, o título, o texto inteiro e, se houver, "Assistir ao vídeo", que abre o link do YouTube ou do Vimeo fora do app (no app deles, ou no navegador). O que estava sem ler quando a aba abriu ganha o selo **Nova** e já é marcado como lido (`POST /novidades/:id/lida`), porque o texto está todo no cartão; o selo fica até sair da aba. O push de uma novidade abre direto nesta aba (`mony://notificacoes?aba=novidades`).
- **Dados pessoais** (`/mais/dados-pessoais`): nome e celular (`PATCH /me`, validado pelo `esquemaAtualizacaoPerfil`), só o que mudou; o e-mail só aparece. O nome novo vai para a sessão, e as iniciais do app acompanham.
- **Rever tutorial** (`/tutorial`, no grupo `(telas)`): as duas boas-vindas do onboarding, sem as permissões no fim; "Entendi" volta ao Perfil.
- **Exportar meus dados** (folha do Perfil, T-140a, RN-160): [Pedir meus dados] (`POST /me/exportar`); enquanto o worker gera, "Juntando seus dados…" e o app pergunta `GET /me/exportar` a cada 3 s; pronto, [Baixar meus dados] abre a URL (24 h, a mesma do e-mail) e [Gerar de novo]. Link vencido ou falha: pede de novo.
- **Excluir conta** (folha do Perfil, T-140b, RN-161): explica o que é apagado em 7 dias e sugere exportar antes. Com senha, confirma com ela; sem senha (só Google ou Apple), [Enviar código por e-mail] e o código de 6 dígitos. Pedida (`POST /me/exclusao`), mostra a data e [Entendi] sai da conta: a API encerrou as sessões de todos os aparelhos. Quem entra de novo no prazo vê "Exclusão agendada para 23/out" e [Desistir da exclusão] (`DELETE /me/exclusao`).
- **Ainda não** (com as tarefas deles): Excluir conta (T-140b) e Ajuda e suporte. O modo escuro do design não vira chave: o app é só escuro (T-017).

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
