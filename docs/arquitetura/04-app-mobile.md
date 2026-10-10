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

## Rede e autenticação

- Cliente gerado pelo Orval usa uma instância HTTP com:
  - `Authorization: Bearer <access>` (15 min).
  - Em 401, um único refresh concorrente (fila de requisições aguardando), depois repete. Refresh falhou → logout local.
  - Header `Idempotency-Key` (UUID) em todo `POST` que cria dado financeiro, para não duplicar em retry.
  - Headers `X-App-Version`, `X-Platform`, `X-Device-Id` para suporte e bloqueio de versões antigas.
- Tokens: `refresh` no `expo-secure-store` (Keychain / Keystore). `access` só em memória.
- Biometria (`expo-local-authentication`) **só libera o refresh guardado**; não substitui autenticação no servidor (RN-005).
- Versão mínima: `GET /v1/config-app` retorna `versaoMinima`. Abaixo dela, tela de atualização obrigatória.

## Chat da Mony

- Envio por `POST /v1/mony/mensagens` com resposta em **SSE** lida com `expo/fetch` (streaming de texto e eventos de componente).
- Eventos SSE: `texto.delta`, `componente` (botões, cartão de resumo), `acao.resultado`, `erro`, `fim`.
- Toque em botão vai por `POST /v1/mony/acoes` com `{ mensagemId, acaoId, payload }`, sem texto livre (RN-084).
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

## Design system

O cliente vai entregar as telas. Fluxo para receber o design:

1. **Tokens primeiro.** Cores, tipografia, espaçamentos, raios, sombras e ícones viram `src/ui/tokens.ts` e o `tailwind.config.js` do NativeWind. Nenhum componente usa cor ou tamanho fora dos tokens.
2. **Componentes base** em `src/ui/` (Botão, Campo, Valor monetário com modo privacidade, Card, Chip, Barra de progresso por faixa, BottomSheet, Toast, Vazio, Erro, Skeleton) antes das telas.
3. **Telas** montadas só com componentes base + componentes de feature.
4. Modo claro/escuro se o design trouxer os dois.
5. Se o design vier no Figma, exportar tokens (ex.: Tokens Studio) para não copiar valor à mão.

Pedir ao cliente junto com as telas: estados vazios, de carregamento e de erro; tela de sem conexão; versões das telas de permissão; ícone e splash; ícones de categoria e bandeiras de cartão.

Componente `Valor` concentra a formatação de dinheiro e o **modo privacidade** (oculta valores em todo o app com um toque, RN-022).

## Onboarding

Rotas em `(onboarding)` seguindo o PDF: boas-vindas (2–3 telas), primeiro lançamento guiado no chat, cartões (opcional), orçamento inicial, permissões uma a uma, tour pulável. O progresso fica no servidor (`GET/PATCH /v1/me/onboarding`) para o **checklist de primeiros passos** no Início. Dicas contextuais na primeira visita a cada tela usam um registro de "dicas vistas" no servidor (para sobreviver a reinstalação).

## Performance e qualidade

- Hermes ligado (padrão).
- Imagens com `expo-image` e cache.
- Dashboard em uma chamada (`GET /v1/dashboard`), para a tela inicial abrir com um request.
- Sentry com source maps enviados pelo EAS. PostHog com eventos de funil (cadastro, onboarding, primeiro lançamento, uso da Mony, conversão).
- Acessibilidade: `accessibilityLabel` em todo botão de ícone, tamanho de toque mínimo de 44 pt, fonte dinâmica respeitada.
