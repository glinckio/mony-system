# 15 — Roadmap, riscos e pendências

Ordem pensada para entregar valor cedo e atacar primeiro o que pode inviabilizar recursos (aprovações de loja e limitações de sistema). Sem estimativa de prazo aqui: dimensionar com o time depois de receber o design.

## Fase 0 — Fundação e provas de conceito

**Fundação:** monorepo, CI, Docker Compose, Terraform de staging, Expo com dev client e EAS, NestJS com Prisma, Sentry, esqueleto do design system (aguardando tokens do cliente).

**Provas de conceito (PoCs) com critério de sucesso:**

| PoC | Pergunta a responder | Se falhar |
|---|---|---|
| Screen Time (iOS) | A extensão `DeviceActivityMonitor` dispara de forma confiável e consegue avisar o servidor ou mostrar notificação local? | Plano B de notificação local com cache (ver [10](10-integracoes.md#detecção-de-apps-de-compra)) ou recurso só no Android |
| UsageStats (Android) | WorkManager periódico dá precisão aceitável? Play aceita a declaração? | Foreground service ou retirar do escopo |
| Alarme | Alarme local toca com app fechado e sem internet em Android 8–15 e iOS (AlarmKit 26+ e notificação abaixo)? | Reduzir a "notificação de alta prioridade" em versões antigas |
| Stripe Pix recorrente | Pix funciona em assinatura recorrente na conta BR? | Alternativas de [10](10-integracoes.md#stripe) |
| Open Finance | Widget do agregador abre, vai ao app do banco e volta no Expo? | WebView com deep link de retorno |
| NFC-e | API de terceiros cobre as UFs prioritárias? | Leitor próprio por UF + fallback por foto |
| Mony | Fluxo "gastei 10" com botões, streaming SSE no `expo/fetch`, custo por mensagem medido | Ajustar modelo/estratégia de contexto |

**Pedidos que levam tempo (iniciar já):** entitlement Family Controls da Apple, verificação do app no Google (escopo de agenda), contas de desenvolvedor Apple/Google no nome do cliente, conta Stripe BR, contrato com o agregador.

## Fase 1 — Núcleo financeiro

Cadastro/login (e-mail, Google, Apple), sessão e biometria, recuperação de senha, categorias, transações (com recorrência e anexos), cartões e faturas, parcelamentos e dívidas, orçamentos e metas, Início (dashboard), onboarding com checklist. Painel admin mínimo (usuários).

## Fase 2 — Mony

Chat com texto, botões e rascunhos; áudio; foto/print/PDF com confirmação; NFC-e; ferramentas de finanças; preferências aprendidas; consultoria pós-lançamento; prompt versionado; avaliação no CI; controle de custo.

## Fase 3 — Alertas, lembretes e agenda

Motor de alertas, central de notificações, preferências e silêncio, push com ações, lembretes com alarme, resumos periódicos, agendas Google/Outlook/aparelho, compromissos pela Mony.

## Fase 4 — Planos e cobrança

Teste de 3 dias, plano gratuito com cotas, Stripe (checkout, webhooks, portal), avisos de teste, controle de um teste por pessoa, admin de preços, limites e cupons.

## Fase 5 — Recursos de plano pago e colaboração

Open Finance (conexão, importação, conflitos, consentimento), detecção de apps de compra, lembrete por ligação, listas de compras com compartilhamento em tempo real, lembretes compartilhados, relatórios completos e exportação.

## Fase 6 — Lançamento

LGPD completa (exportar, excluir conta, consentimentos, retenção), painel admin completo (métricas, novidades, auditoria, Mony), hardening de segurança, testes de carga, monitoramento e alertas, fichas das lojas (privacidade, declarações de permissão), TestFlight e teste interno do Play com o cliente, publicação.

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Apple negar o entitlement de Family Controls | Sem detecção de apps no iOS | Pedir cedo; recurso desenhado para ser opcional |
| Google Play recusar uso de UsageStats ou foreground service | Sem detecção no Android | Declaração bem justificada; recurso opcional |
| Pix recorrente indisponível na Stripe | Pix só parcial | Alternativas em [10](10-integracoes.md#stripe) |
| Custo do agregador (a partir de R$ 2.500/mês, segundo o PDF) | Custo fixo antes de ter receita | Recurso só no pago; lançar Open Finance quando houver base pagante |
| Custo de IA por usuário | Margem | Regras sem modelo, cache de prompt, modelo menor para tarefas simples, cotas |
| Regras das lojas sobre pagamento externo mudarem | Fluxo de pagamento | `BillingProvider` com "loja" prevista; revalidar antes de publicar |
| Formato das NFC-e variar por UF | Leitura falha | API de terceiros + fallback por foto |
| Design chegar depois do desenvolvimento | Retrabalho de UI | Tokens e componentes base isolados; telas feitas sobre componentes |

## Perguntas ao cliente

Respostas necessárias antes da fase indicada.

| # | Pergunta | Fase | Nossa sugestão |
|---|---|---|---|
| 1 | Pagar a fatura deve contar como despesa? (Pelo PDF, gera "a despesa do pagamento", o que contaria as compras duas vezes) | 1 | Não conta; só registra a saída da conta (RN-037) |
| 2 | Compra feita no dia do fechamento entra em qual fatura? | 1 | Na próxima (RN-031) |
| 3 | O saldo do Início considera só o que foi pago, ou também pendentes? | 1 | Só pagos, com pendentes ao lado (RN-020) |
| 4 | Pagamento parcial de fatura: o restante fica na mesma fatura ou rola para a próxima com juros? | 1 | Fica na mesma, sem juros (RN-036) |
| 5 | Lista de categorias padrão | 1 | Lista em [06](06-modelo-de-dados.md#dados-iniciais-seed) |
| 6 | Qual provedor de IA? | 2 | Anthropic Claude ([08](08-mony-agente-ia.md#provedor-de-ia)) |
| 7 | Prazo de retenção de fotos e áudios | 2 | 90 dias (RN-162) |
| 8 | Limite mensal de ligações no plano pago | 3 | 10 por mês (RN-078) |
| 9 | Pix na assinatura: aceitar só no anual se a Stripe não suportar recorrente? | 4 | Sim, como pagamento único anual |
| 10 | Valores dos planos mensal e anual | 4 | Definidos pelo cliente no admin |
| 11 | No gratuito, o que acontece com itens acima do limite (ex.: 3 cartões)? | 4 | Ficam visíveis e editáveis, sem criar novos (RN-127) |
| 12 | Qual agregador de Open Finance (Pluggy, Belvo, Klavi)? | 5 | Decidir após cotação |
| 13 | Quais UFs priorizar para NFC-e? | 2 | As do público principal |
| 14 | Prazo de arrependimento antes da exclusão definitiva da conta | 6 | 7 dias (RN-161) |
| 15 | Vídeo das novidades: link externo ou upload? | 6 | Link externo |
| 16 | Domínio, nome nas lojas, contas Apple/Google/Stripe em nome de quem? | 0 | Em nome da empresa do cliente |
| 17 | O design inclui modo escuro, estados vazios/erro e telas de permissão? | 1 | Pedir junto com as telas ([04](04-app-mobile.md#design-system)) |
