# Design do cliente

`telas-app.pdf` traz as telas do app e do painel administrativo, recebidas em 2026-10-11. As telas do app são imagens de 390 × 844 pt (iPhone) em escala 2×. Por isso as medidas dos tokens saíram dos pixels divididos por 2.

| Página | Telas |
|---|---|
| 2 | Login, onboarding: boas-vindas, onboarding: permissões |
| 3 | Início, chat da Mony: lançamento guiado, chat da Mony: leitura de NF |
| 4 | Transações, cartões de crédito, parcelamentos e dívidas |
| 5 | Orçamentos, metas |
| 6 | Relatórios, listas de compras, lembretes |
| 7 | Agenda, notificações |
| 8 | Mais, contas bancárias (Open Finance), categorias |
| 9 | Perfil e configurações, planos |
| 10 a 16 | Admin: visão geral, usuários, assinaturas, planos e preços, novidades, Mony e auditoria |

**O que vale para todas as telas** (já em `apps/mobile/src/ui/tokens.ts`, T-017):

- **Tema:** só escuro, sem modo claro (decisão do cliente, 2026-10-11).
- **Fundo:** degradê de `#45BFDC` no topo a `#0A2133` embaixo. O chat usa fundo sólido.
- **Cards:** marinho quase preto (`#061A2C`) com cantos de 22 pt.
- **Botões, chips, campos de busca e a barra de abas:** em pílula.
- **Botão principal:** claro (`#F3F6FA`) com texto escuro.
- **Botão secundário, chip e círculo de ícone:** de "vidro", branco a 16%.
- **Cores:** azul `#3D8BFF` (barras e destaque), link `#7DC4FF`, receita `#5BD69A`, despesa `#FF9A8F`, atenção `#F2A65A`, estourado `#FF8A7F`.
- **Ícones:** Lucide, traço 2.
- **Fonte:** a do sistema.
- **Logo:** provisório, tirado da capa do PDF, até o cliente mandar o arquivo original.

**Telas que o PDF não traz** (seguem o mesmo visual):

- cadastro e recuperação de senha;
- formulários de lançamento, cartão e orçamento;
- detalhe da fatura;
- contas manuais;
- estados vazio, de carregamento, de erro e sem conexão.
