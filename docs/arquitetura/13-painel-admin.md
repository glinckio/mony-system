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

## Planos e preços (T-104b)

- O cartão de cada plano mostra o valor de hoje e um campo para o valor novo (de R$ 1,00 a R$ 10.000,00). Antes de salvar, o painel confirma: "passa de X para Y para quem assinar daqui em diante; quem já assina continua pagando X" (RN-129).
- `POST /admin/planos/precos` (`plano`, `valorCentavos`) cria o preço na Stripe com o `lookup_key` do plano e o põe no portal do cliente ao lado do vigente do outro plano. Depois marca o preço novo como o único vigente em `planos_precos`, com `alterado_por`, e grava `plano.preco_alterado` em `auditoria` com o antes e o depois. O mesmo valor de hoje não cria nada. Sem a Stripe no ambiente (`COBRANCA_PROVEDOR=fake` em produção), responde 503.
- `GET /admin/planos/precos` devolve os vigentes e os 50 últimos preços, com data e autor. "Configuração inicial" é o preço gravado pelo `cobranca:configurar`.

## Plano gratuito e teste grátis (T-104c)

- O cartão "Plano gratuito e teste grátis" mostra os limites de RN-120 por recurso (por dia e por mês nos de uso; quantidade nos cadastros) e a duração do teste grátis (de 1 a 30 dias; padrão 3, RN-006). Campo vazio é "sem limite"; cada limite vai de 0 a 10.000.
- `GET /admin/planos/gratuito` devolve tudo; `PUT /admin/planos/gratuito` grava tudo de uma vez em `limites_plano` e `configuracoes` (chave `teste.duracao_dias`) e registra `plano.gratuito_alterado` em `auditoria` com o antes e o depois. Se nada mudou, não grava nem audita.
- Os limites valem na hora para quem está no gratuito. A duração vale para quem se cadastrar depois; quem já está no teste mantém a data de fim, e os avisos de RN-124 seguem essa data.

## Cupons (T-104d)

- O cartão "Cupons" cria um cupom com código (3 a 20 letras ou números, gravado em maiúsculas), desconto de 1% a 100% e, se quiser, o último dia em que vale. A lista mostra código, desconto, validade, autor e situação (ativo, vencido ou desativado), com [Desativar] e confirmação.
- `GET /admin/cupons` lista do mais novo ao mais antigo. `POST /admin/cupons` reserva o código em `cupons` (inativo), cria o cupom e o código promocional na Stripe e só então o ativa, gravando `cupom.criado` em `auditoria`; se a Stripe falhar, a reserva é desfeita. Código repetido responde 409; validade antes de hoje, 400. `POST /admin/cupons/:id/desativar` apaga o cupom na Stripe e grava `cupom.desativado`; repetir não faz nada.
- O desconto vale na primeira cobrança (doc 10). Sem a Stripe no ambiente, responde 503.

## Usuários (T-141a)

- A lista busca por parte do nome, do e-mail ou do telefone (sem diferenciar maiúsculas), das contas mais novas às mais antigas, 20 por vez com [Carregar mais] (`GET /admin/usuarios?busca=&cursor=&limite=`). Mostra nome, e-mail, plano que vale agora, situação e data da conta.
- A conta (`GET /admin/usuarios/:id`) mostra situação, plano, telefone, criação, último acesso, fuso, fim do teste ou a cobrança do plano pago, sessões ativas, logins sociais, aparelhos (com o push ligado ou não) e conexões Open Finance.
- **Bloquear** (`POST …/bloquear`, com confirmação) põe a conta em `bloqueado`, revoga todas as sessões e grava `usuario.bloqueado`. O login responde `CONTA_BLOQUEADA` e a renovação é recusada (a sessão foi revogada); o token de acesso que já saiu vence em até 15 minutos. Nada é apagado. Admin não é bloqueado pelo painel (409): o `admin:promover --rebaixar` tira o papel antes. **Reativar** volta para `ativo` (`usuario.reativado`).
- **Estender teste** (`POST …/estender-teste`, de 1 a 30 dias) soma os dias ao fim do teste que ainda vale, ou a agora se já acabou (a pessoa volta ao teste), e grava `usuario.teste_estendido` com o antes e o depois. Plano pago responde 409.
- **Auditoria das visualizações:** abrir a conta grava `usuario.visualizado`; a busca com texto grava `usuarios.buscados` (o texto e quantos vieram), só na primeira página. O painel não relê a conta sozinho, para não gravar visualizações que ninguém fez.

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
