# 07 — Regras de negócio

Todas as regras do PDF, numeradas, com os detalhes que o PDF deixa em aberto resolvidos por nós e marcados. Cada regra vira teste automatizado no servidor com o código no nome do teste (`it('RN-031 compra após o fechamento vai para a próxima fatura')`).

Legenda: **(PDF)** está na especificação · **(decisão técnica)** definido por nós, ajustável · **(confirmar com cliente)** precisa de resposta antes de implementar.

---

## Conta e acesso

- **RN-001 (PDF)** Cadastro com nome, e-mail, telefone e senha. Senha com no mínimo 8 caracteres. E-mail único, comparado em minúsculas.
- **RN-002 (PDF)** Login por e-mail e senha, Google e Apple. Login social com e-mail já existente vincula a conta só depois de login com senha ou código por e-mail **(decisão técnica, evita sequestro de conta)**.
- **RN-003 (PDF)** Recuperação por código de 6 dígitos enviado por e-mail, de uso único. Validade de 15 minutos e no máximo 5 tentativas por código **(decisão técnica: valores)**. Pedir novo código invalida o anterior.
- **RN-004 (PDF)** Sessão com token de acesso de 15 minutos e token de renovação por aparelho. Renovação é rotativa: cada uso gera novo refresh e invalida o anterior; reuso de refresh antigo revoga todas as sessões daquele aparelho **(decisão técnica)**. "Sair de todos os aparelhos" revoga todas as sessões do usuário.
- **RN-005 (PDF)** Biometria é opcional, ativada nas configurações, e só libera o token já guardado no aparelho. Não substitui autenticação no servidor.
- **RN-006 (PDF)** O cadastro inicia o teste grátis de 3 dias com acesso completo, cria as categorias padrão e as preferências de alerta padrão.
- **RN-007 (PDF)** Termos de uso e política de privacidade aceitos no cadastro, com versão e data gravadas. Nova versão dos termos pede novo aceite no próximo acesso **(decisão técnica)**.
- **RN-008 (PDF)** Limite de tentativas em login, recuperação de senha e código: 5 por 15 minutos por e-mail e 20 por 15 minutos por IP **(decisão técnica: valores)**.

## Início (dashboard)

- **RN-020 (PDF)** O Início mostra, para o período escolhido: saldo do mês, total de receitas, despesas pagas e despesas pendentes.
  - Saldo do período = receitas pagas − despesas pagas **(decisão técnica; confirmar com cliente se o saldo deve incluir pendentes)**.
  - Despesas com natureza `pagamento_fatura` não entram nos totais (ver RN-037).
  - Compras no cartão contam como despesa na data da compra (regime de competência), com status `pendente` até a fatura ser paga **(confirmar com cliente)**.
- **RN-021 (PDF)** Seletor de período: mês atual, mês anterior, personalizado.
- **RN-022 (PDF)** Modo privacidade oculta todos os valores do app com um toque; preferência guardada no aparelho.
- **RN-023 (PDF)** "Próximos vencimentos" lista faturas, parcelas e contas pendentes dos próximos 30 dias **(decisão técnica: janela)**, ordenados por data.
- **RN-024 (PDF)** Checklist de primeiros passos aparece até o usuário concluir ou dispensar todas as etapas do onboarding.

## Transações

- **RN-040 (PDF)** Campos: descrição, valor, data, categoria, tipo (receita/despesa), forma de pagamento (`cartao_credito`, `pix`, `debito`, `dinheiro`, `boleto`), status (`pago`/`pendente`), observação e anexo.
- **RN-041 (PDF)** Obrigatórios para despesa: valor, descrição, categoria e forma de pagamento. Data assume hoje (no fuso do usuário) quando não informada. Valor maior que zero.
- **RN-042 (decisão técnica)** Status padrão: `pago` para Pix, débito e dinheiro com data até hoje; `pendente` para boleto e para data futura; compra no cartão fica `pendente` até a fatura ser paga.
- **RN-043 (PDF)** Recorrência mensal, semanal ou anual, com data final ou indeterminada.
  - A rotina diária materializa as ocorrências dos próximos 35 dias como `pendente` **(decisão técnica: aparecem em "próximos vencimentos" e na projeção)**.
  - Dia 29, 30 ou 31 em mês mais curto cai no último dia do mês.
  - Editar a recorrência altera só ocorrências futuras ainda pendentes e não editadas à mão. Excluir pergunta: "só esta", "esta e as próximas" ou "todas".
- **RN-044 (PDF)** Seleção múltipla para excluir ou mudar categoria (`POST /transacoes/lote`), em uma transação de banco.
- **RN-045 (PDF)** Transação vinda do Open Finance pode ter categoria e descrição editadas, mas não pode ser duplicada; valor e data ficam bloqueados **(decisão técnica)**.
- **RN-046 (PDF)** Exclusão é lógica (`excluido_em`). Excluir compra no cartão recalcula a fatura e o limite; excluir em fatura já paga é bloqueado **(decisão técnica)**.
- **RN-047 (PDF)** Filtros: período, tipo, categoria, cartão ou forma de pagamento, status, origem e texto. Totais do filtro: receitas, despesas, saldo, pagas, pendentes, calculados no servidor.

## Cartões e faturas

> Implementação (T-039): as regras puras de RN-031 a RN-035 e RN-038 estão em `@mony/shared/cartoes` (`faturaDaCompra`, `faturaDaCompetencia`, `statusDaFatura`, `limiteDoCartao`, `faixaAtingida`), com testes que cobrem todo par de dias de fechamento e vencimento em todas as datas de dez/2027 a mar/2028.
>
> Implementação (T-040): a API grava a compra na fatura dessas regras, refaz o total a cada mudança e recusa mexer em fatura quitada (doc 05, seção Cartões e faturas).
>
> Implementação (T-041): RN-036 e RN-037 seguem o padrão deste documento (`POST /faturas/:id/pagar`); excluir o pagamento desfaz.

- **RN-030 (PDF)** Cadastro: nome, bandeira, últimos 4 dígitos (opcional), limite total, dia de fechamento, dia de vencimento e cor. Dias entre 1 e 31.
- **RN-031 (PDF)** Compra no cartão entra na fatura correta pela data de fechamento:
  - Para a data da compra `d`, calcula-se a data de fechamento do ciclo no mês de `d`.
  - Se `d` for **antes** da data de fechamento, a compra vai para a fatura que fecha nesse mês. Se for **no dia do fechamento ou depois**, vai para a seguinte **(decisão técnica; bancos variam, confirmar com cliente)**.
  - A **competência** da fatura é o mês do **vencimento**. Se o dia de vencimento for menor ou igual ao de fechamento, o vencimento cai no mês seguinte ao fechamento.
  - A fatura é criada sob demanda (única por cartão e competência).
- **RN-032 (decisão técnica)** Dia de fechamento ou vencimento maior que o último dia do mês usa o último dia do mês. Vencimento em fim de semana ou feriado **não** é ajustado no cálculo (só exibido como informação), para coincidir com a data que o banco mostra.
- **RN-033 (PDF)** Status da fatura: `aberta` (antes do fechamento), `fechada` (após o fechamento, sem pagamento), `parcial` (pago menos que o total), `paga` (valor_pago ≥ valor_total), `atrasada` (vencimento passou sem pagamento total). A rotina diária faz as transições.
- **RN-034 (PDF)** Limite usado = soma dos valores ainda não pagos de todas as faturas do cartão (abertas, fechadas, parciais, atrasadas e futuras com parcelas previstas). Limite disponível = limite_total − limite usado. Pode ficar negativo; a tela mostra "acima do limite".
- **RN-035 (PDF)** Compra parcelada ocupa o limite pelo valor total e libera o valor de cada parcela quando a fatura em que ela cai é paga. (Consequência direta de RN-034.)
- **RN-036 (PDF)** "Marcar fatura como paga" aceita total ou parcial. Gera a transação de pagamento (natureza `pagamento_fatura`), soma em `valor_pago` e libera o limite pelo valor pago. Pagamento parcial deixa o saldo restante na mesma fatura com status `parcial` **(decisão técnica: não rola para a próxima fatura nem calcula juros do rotativo; confirmar com cliente)**.
- **RN-037 (decisão técnica, confirmar com cliente)** O PDF diz que pagar a fatura "gera a despesa do pagamento". Como as compras do cartão já contam como despesa, o pagamento da fatura é gravado com natureza `pagamento_fatura`, que **não entra** em totais de despesa, orçamentos nem relatórios por categoria; só aparece no extrato e no saldo da conta de onde saiu. Ao pagar a fatura, as compras dela passam a `pago`.
- **RN-038 (PDF)** Faixas de alerta de limite configuráveis por cartão (padrão 50%, 80%, 100%). Cada faixa dispara uma vez por fatura (ver RN-102).
- **RN-039 (PDF)** Cartão conectado por Open Finance atualiza limite, fatura e lançamentos automaticamente. Nesse caso os valores do banco prevalecem sobre o cálculo local; o cálculo local serve só para cartão manual.

## Parcelamentos e dívidas

- **RN-050 (PDF)** Cadastro: nome, valor total, número de parcelas, data da primeira parcela, taxa de juros mensal (opcional), categoria e observações. Tipo `compra_cartao` ou `divida`.
- **RN-051 (PDF)** Parcelas geradas automaticamente, cada uma ligada a uma despesa pendente.
  - Sem juros: `parcela = floor(total / n)`; os centavos restantes vão para a **primeira** parcela **(decisão técnica)**. Soma das parcelas é sempre igual ao total.
  - Vencimento da parcela `k` = data da primeira + (k−1) meses, com ajuste de fim de mês de RN-043.
  - Compra no cartão: a parcela `k` cai na fatura da competência da 1ª + (k−1) meses, e o vencimento é o da fatura.
- **RN-052 (PDF)** Com juros, simulação e geração pela **Tabela Price**:
  - `PMT = PV × i / (1 − (1 + i)^−n)`, com `i` = taxa mensal em fração.
  - Para cada parcela: juros = saldo × i; amortização = PMT − juros; saldo −= amortização.
  - Cálculo em decimal de precisão (biblioteca `decimal.js`), arredondando para centavos só no fim de cada parcela; a diferença de arredondamento vai para a **última** parcela.
  - `POST /parcelamentos/simular` devolve a tabela completa sem gravar.
  - Quando há juros, `valor_total` do parcelamento é a soma das parcelas (com juros); o valor financiado fica guardado à parte **(decisão técnica)**.
- **RN-053 (PDF)** Pagar parcela marca a parcela e sua transação como pagas. Desfazer volta as duas para pendente. Parcela de cartão é paga pelo pagamento da fatura, não individualmente.
- **RN-054 (PDF)** Status do parcelamento: `ativa`, `quitada` (todas pagas), `atrasada` (alguma parcela vencida e não paga), `cancelada` (pelo usuário; parcelas futuras pendentes são excluídas logicamente).
- **RN-055 (PDF)** Compras parceladas no cartão aparecem em Parcelamentos e nas faturas do cartão. Progresso de quitação em valor e em número de parcelas.

## Orçamentos e metas

- **RN-060 (PDF)** Orçamento mensal por categoria de despesa, com opção de repetir todo mês. A rotina do dia 1 copia os orçamentos com `repetir_mensal` para a nova competência.
- **RN-061 (PDF)** Acompanhamento: gasto (despesas da categoria na competência, pagas e pendentes, exceto `pagamento_fatura`), restante (limite − gasto) e projeção até o fim do mês.
  - Projeção = gasto até hoje ÷ dias decorridos × dias do mês **(decisão técnica: média linear; recorrências pendentes já materializadas entram como valor certo)**.
- **RN-062 (PDF)** Cor por faixa na barra: até 79% normal, 80–99% atenção, 100%+ estourado **(decisão técnica: cores seguem o design do cliente)**. Alertas em 80% e 100% (ver RN-102).
- **RN-063 (PDF)** Metas de economia com título, valor alvo, prazo, valor atual e aportes. `valor_atual` = soma dos aportes. Meta pode ser marcada como concluída a qualquer momento; ao atingir o alvo, a Mony sugere concluir **(decisão técnica)**.

## Categorias

- **RN-065 (PDF)** Categorias padrão criadas no cadastro e categorias próprias, com nome, tipo, cor e ícone. Nome único por usuário e tipo.
- **RN-066 (PDF)** Ao excluir, o usuário escolhe para qual categoria mover os lançamentos (`?mover_para=`). Orçamentos da categoria excluída são removidos. Não é possível excluir a última categoria de um tipo **(decisão técnica)**.

## Listas de compras

- **RN-070 (PDF)** Várias listas, cada uma com uma categoria (mercado, casa, carro, farmácia, outra). Itens com nome, quantidade, unidade e preço estimado.
- **RN-071 (PDF)** Preço estimado sugerido pelo histórico de NFC-e: último preço unitário pago pelo usuário em item com descrição semelhante (busca por texto) nos últimos 90 dias **(decisão técnica)**.
- **RN-072 (PDF)** Marcar item como comprado. "Finalizar" gera **uma** despesa com o total dos itens comprados, na categoria de despesa mapeada para a categoria da lista **(decisão técnica: mapeamento padrão mercado → Mercado etc., editável na hora)**.
- **RN-073 (PDF)** Total estimado da lista comparado ao restante do orçamento da categoria mapeada.
- **RN-074 (PDF)** Compartilhamento por convite com edição em tempo real (WebSocket). Convidado precisa ter conta. Permissões `ver` ou `editar`. A despesa gerada ao finalizar é de quem finalizou **(decisão técnica)**.

## Lembretes e agenda

- **RN-075 (PDF)** Lembretes únicos ou recorrentes (diário, semanal, mensal, anual, personalizado em formato RRULE) com canais: notificação, alarme, ligação.
- **RN-076 (PDF)** Adiar (soneca) e marcar como feito direto da notificação. Soneca padrão de 10 minutos, com opções 10 min, 1 h, amanhã **(decisão técnica)**.
- **RN-077 (PDF)** Lembretes e alarmes ignoram horário de silêncio.
- **RN-078 (PDF)** Ligação é opcional, só em plano pago, com limite mensal por usuário (sugestão: 10 por mês, configurável no admin) **(confirmar com cliente: valor)**. Só para telefone verificado.
- **RN-079 (PDF)** Compromissos externos aparecem só para leitura. Compromissos criados pelo app (ou pela Mony) vão para a agenda padrão escolhida e podem ser editados.

## Mony

- **RN-080 (PDF)** A Mony identifica o que veio na mensagem e pergunta só o que falta, uma pergunta por vez, sempre com botões. Ordem das perguntas: categoria → forma de pagamento → cartão → à vista/parcelado → resumo.
- **RN-081 (PDF)** Botões vêm ordenados pelo hábito do usuário (preferências aprendidas), com as 4 categorias mais usadas e [Outra].
- **RN-082 (PDF)** Lançamento completo na primeira mensagem é gravado sem perguntas e mostra o resumo com [Desfazer]. Desfazer vale por 24 h **(decisão técnica)**.
- **RN-083 (PDF)** Lançamento vindo de foto ou PDF sempre passa por confirmação antes de gravar.
- **RN-084 (PDF)** Toque em botão é tratado por regra no servidor, sem passar texto livre ao modelo.
- **RN-085 (PDF)** Resposta a uma pergunta da Mony completa o rascunho em andamento, nunca inicia um novo.
- **RN-086 (PDF)** Várias transações na mesma mensagem geram um cartão de resumo por transação, com [Confirmar todos].
- **RN-087 (PDF)** A Mony só diz que registrou depois que a ferramenta retornou sucesso. Em erro, informa o erro e oferece [Tentar de novo].
- **RN-088 (PDF)** Rascunho incompleto fica salvo por 24 horas. Um rascunho ativo por conversa **(decisão técnica)**.
- **RN-089 (PDF)** Após cada lançamento, a Mony comenta o impacto: situação do orçamento da categoria e do limite do cartão.
- **RN-090 (PDF)** Preferências aprendidas (estabelecimento → categoria, cartão, forma de pagamento) atualizadas a cada confirmação: `contagem += 1` na combinação confirmada.
- **RN-091 (PDF)** Tom direto, amigável e sem julgamento. Não dá recomendação de investimento.
- **RN-092 (PDF)** Ferramentas sempre limitadas aos dados do usuário da conversa. Excluir transação exige confirmação por botão.

## Alertas e notificações

- **RN-100 (PDF)** Cada tipo de alerta pode ser ligado ou desligado pelo usuário, exceto os de assinatura.
- **RN-101 (PDF)** Horário de silêncio: alertas não urgentes gerados no período são enviados no fim dele (agrupados em uma notificação se forem mais de 3 **(decisão técnica)**).
- **RN-102 (PDF)** Sem repetição: a mesma faixa de limite ou orçamento dispara uma vez por fatura ou por mês. Implementado com `notificacoes.chave_unica`, ex.: `limite:<cartaoId>:<faturaId>:80`, `orcamento:<categoriaId>:2026-10:100`.
- **RN-103 (PDF)** Limite diário de alertas de consultoria (dicas, gasto fora do padrão, projeção): padrão 3 por dia.
- **RN-104 (PDF)** Alerta de app de compra respeita intervalo mínimo por app: padrão 1 por dia.
- **RN-105 (PDF)** Toda notificação tem link interno que abre a tela relacionada.
- **RN-106 (decisão técnica)** "Gasto fora do padrão": valor ≥ 3× a média da categoria nos últimos 90 dias, com pelo menos 5 lançamentos na média e valor mínimo de R$ 50. Parâmetros no admin.
- **RN-107 (PDF)** Projeção do mês negativa: rotina diária calcula saldo projetado = saldo atual + receitas pendentes do mês − despesas pendentes do mês − (média diária de gasto variável × dias restantes). Alerta se < 0, no máximo uma vez por semana **(decisão técnica: frequência)**.
- **RN-108 (PDF)** Vencimentos: X dias antes (preferência do usuário, padrão 3 **(decisão técnica)**) e no dia.

## Planos, teste e limites

- **RN-120 (PDF)** Limites do plano gratuito (padrões editáveis no admin):

  | Recurso (`recurso`) | Limite |
  |---|---|
  | `lancamento` (manual e Mony) | 3/dia e 30/mês |
  | `mensagem_mony` (texto e áudio) | 10/dia |
  | `leitura_documento` (foto, PDF, NFC-e) | 3/mês |
  | `cartao` | 1 cadastrado |
  | `lista_compras` | 1 |
  | `lembrete_ativo` | 5 |
  | `relatorio` | só mês atual, sem exportação |

  Limites de quantidade (cartão, lista, lembrete) contam itens existentes, não uso. Toque em botão da Mony não conta como mensagem **(decisão técnica)**. Lançamento importado por Open Finance não conta (não existe no gratuito).
- **RN-121 (PDF)** Open Finance, detecção de apps de compra e lembrete por ligação não estão no gratuito.
- **RN-122 (PDF)** Limites conferidos no servidor, de forma atômica (`UPDATE uso_recursos SET quantidade = quantidade + 1 WHERE … AND quantidade < limite RETURNING`). "Dia" e "mês" no fuso do usuário.
- **RN-123 (PDF)** Ao atingir um limite, a Mony avisa e mostra [Ver planos]. O recurso volta no dia ou mês seguinte.
- **RN-124 (PDF)** Avisos do teste no 2º dia e no último dia, por push e pela Mony, com resumo do que o usuário já registrou.
- **RN-125 (PDF)** Um teste por pessoa, controlado por e-mail, conta Google/Apple e identificador do aparelho (hash em `controle_teste`). Conta nova que bate em qualquer um entra direto no gratuito.
- **RN-126 (PDF)** Teste encerrado sem plano escolhido: passa automaticamente para o gratuito (rotina diária).
- **RN-127 (PDF)** Nenhum dado é apagado ao ir para o gratuito; histórico continua visível. Itens acima do limite (ex.: 3 cartões) continuam visíveis e editáveis, mas não dá para criar novos **(decisão técnica; confirmar com cliente)**.
- **RN-128 (PDF)** Assinatura paga libera tudo na hora (status atualizado pelo webhook; o app consulta `GET /assinatura` após o checkout).
- **RN-129 (PDF)** Novo preço no admin cria novo `Price` na Stripe e o marca como vigente. Assinaturas existentes ficam no preço antigo. Histórico com data e autor.
- **RN-130 (PDF)** Cupons criados pelo admin (espelhados na Stripe) e aplicados no pagamento.
- **RN-131 (PDF)** Inadimplência: pagamento recusado gera alerta de assinatura. Após o fim das tentativas da Stripe, o usuário volta para o gratuito **(decisão técnica: período de carência segue a configuração de retentativas da Stripe)**.

## Open Finance

- **RN-140 (PDF)** Cada transação importada guarda o identificador externo; reimportação nunca duplica (índice único).
- **RN-141 (PDF)** O usuário escolhe quais contas e cartões importar.
- **RN-142 (PDF)** Conflito com lançamento manual: transação importada com mesmo valor e data até 3 dias de diferença de um lançamento manual do mesmo tipo e sem `id_externo` gera uma pergunta "É o mesmo?". Sim: une (mantém dados do banco, preserva categoria e observação do manual, anexo é mantido). Não: ficam as duas.
- **RN-143 (PDF)** Categoria do agregador convertida para a do usuário: primeiro pelas preferências aprendidas (estabelecimento), depois por uma tabela de mapeamento padrão categoria-do-agregador → categoria padrão.
- **RN-144 (PDF)** Consentimento dura até 12 meses e pode ser revogado no banco. Aviso 7 dias antes de vencer e em erro de conexão **(decisão técnica: 7 dias, como no exemplo do PDF)**.

## Relatórios

- **RN-150 (PDF)** Receitas × despesas por mês, por categoria, evolução anual, por dia da semana, por cartão e forma de pagamento, histórico de preços NFC-e.
- **RN-151 (PDF)** Exportação PDF e XLSX, gerada no worker, entregue por URL assinada válida por 24 h. Bloqueada no gratuito.

## Privacidade (LGPD)

- **RN-160 (PDF)** Exportar meus dados: arquivo (JSON + XLSX) com todos os dados do usuário, gerado no worker, link por e-mail e no app.
- **RN-161 (PDF)** Excluir conta: confirmação com senha ou código; revoga conexões de Open Finance e agendas, cancela a assinatura na Stripe, apaga arquivos e anonimiza ou apaga os dados. Prazo de arrependimento de 7 dias antes da exclusão definitiva **(decisão técnica; confirmar com cliente)**.
- **RN-162 (PDF)** Fotos de documentos e áudios têm prazo de retenção (sugestão 90 dias **(confirmar com cliente)**); o lançamento fica, o arquivo é apagado.
