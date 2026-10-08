# 13 — Painel administrativo (web)

Aplicação React (Vite + TanStack Router + TanStack Query + shadcn/ui) em `apps/admin`, consumindo a mesma API (`/v1/admin/*`) pelo cliente gerado. Nenhuma regra de negócio no painel: ele chama os mesmos Services que o app.

## Acesso

- Login separado do app, 2FA TOTP obrigatório (do PDF).
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
