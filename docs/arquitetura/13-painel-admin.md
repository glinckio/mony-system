# 13 — Painel administrativo (web)

Aplicação React (Vite + TanStack Router + TanStack Query + shadcn/ui) em `apps/admin`, consumindo a mesma API (`/v1/admin/*`) pelo cliente gerado. Nenhuma regra de negócio no painel: ele chama os mesmos Services que o app.

## Estrutura

```
apps/admin/
├─ src/
│  ├─ rotas/                 # TanStack Router, um arquivo por página (__root.tsx = menu lateral)
│  ├─ rotas.gen.ts           # Gerado pelo plugin do router (commitado; o CI confere)
│  ├─ components/ui/         # Componentes do shadcn/ui (copiados para o projeto, editáveis)
│  ├─ components/            # Componentes do painel
│  ├─ i18n/                  # Textos em pt-BR (chaves tipadas)
│  ├─ lib/                   # Cliente da API, utilitários
│  ├─ secoes.ts              # Seções do menu
│  └─ index.css              # Tailwind 4 + tema do shadcn/ui
├─ components.json           # Configuração do `shadcn add`
└─ vite.config.ts            # Plugins (router, React, Tailwind), proxy /v1 em desenvolvimento, Vitest
```

O painel é um site estático (`vite build`). Em desenvolvimento, o Vite repassa `/v1` para a API local. Na nuvem (T-015), o CloudFront do admin faz o mesmo: serve o build do bucket e repassa `/v1/*` para o ALB da API. Por isso o build usa `VITE_API_URL` vazio e a API não precisa de CORS. Deploy pelo workflow `deploy-admin-staging.yml`.

## Acesso

- Login separado do app, 2FA TOTP obrigatório (do PDF). Feito na T-104a:
  - `/entrar` pede e-mail e senha de quem tem papel `admin` (`POST /admin/auth/entrar`). Quem não é admin recebe o mesmo `CREDENCIAIS_INVALIDAS` de senha errada.
  - A senha certa devolve um **desafio** de 5 minutos, que vai no `Authorization` das rotas do 2FA. No primeiro acesso (`configurar2fa: true`), o painel pede o segredo (`POST /admin/auth/2fa/novo`) e mostra o QR Code e a chave para digitar; o 2FA só fica ativo quando o primeiro código confere.
  - O código de 6 dígitos (`POST /admin/auth/2fa`, até 5 tentativas a cada 15 minutos, cada código vale uma vez) abre a sessão: token de 15 minutos com audiência `mony-admin`, que o app não aceita (e o token do app não abre rota `@Admin()`).
  - O painel guarda a sessão na `sessionStorage` (some ao fechar a aba) e renova um minuto antes de vencer (`POST /admin/auth/renovar`), até **8 horas** depois do login; aí pede o login de novo. [Sair] apaga a sessão do navegador.
  - O segredo do 2FA fica cifrado no banco (AES-256-GCM, chave derivada da chave do JWT). Entradas e códigos recusados gravam em `auditoria` (`admin.entrou`, `admin.2fa_recusado`).
- **Primeiro admin:** a pessoa cria a conta no app e alguém com acesso ao ambiente roda `pnpm --filter api admin:promover --email <e-mail>`. `--refazer-2fa` apaga o 2FA (celular perdido; configura de novo no próximo login) e `--rebaixar` tira o papel. Tudo grava em `auditoria`.
- Papéis **(decisão técnica)**: `admin` (tudo), `suporte` (usuários e assinaturas em leitura, estender teste), `financeiro` (planos, preços, cupons, métricas). Começar só com `admin` e deixar o papel no token.
- Toda ação e toda visualização de dados de usuário gravam em `auditoria` (quem, o quê, antes/depois, IP).

## Telas (do PDF)

| Seção | Funções |
|---|---|
| Usuários | Busca, dados da conta, status, plano, conexões ativas, bloquear e reativar, estender teste grátis |
| Assinaturas | Em teste, gratuitos, ativas, canceladas, inadimplentes; conversão do teste; receita mensal recorrente (MRR) |
| Planos e preços | Valor do mensal e anual (só novas assinaturas, RN-129), duração do teste, limites do gratuito (RN-120), cupons, histórico de preços |
| Novidades | Criar, editar, agendar e desativar comunicados com título, texto, vídeo e validade; push opcional |
| Mony | Editar prompt do sistema (versionado, com avaliação antes de ativar), limites de uso, logs de conversas com erro, custo por período |
| Métricas | Usuários ativos, lançamentos por origem (manual, Mony, foto, Open Finance), alertas enviados |
| Auditoria | Registro de ações dos administradores |
| Filas **(proposta)** | Bull Board: jobs falhos, reprocessar |
| Configurações **(proposta)** | Parâmetros de alertas (RN-103, RN-104, RN-106), limite de ligações, versão mínima do app |

## Detalhes de implementação

- Métricas pesadas vêm de *materialized views* atualizadas por rotina, não de consultas em tempo real nas tabelas grandes.
- "Estender teste" altera `assinaturas.teste_fim` e grava auditoria.
- "Bloquear usuário" revoga todas as sessões e impede login; não apaga dados.
- Vídeo das novidades: URL externa (YouTube/Vimeo) ou upload no S3 **(confirmar com cliente)**.
