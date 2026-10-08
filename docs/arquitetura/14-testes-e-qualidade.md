# 14 — Testes e qualidade

## Pirâmide

| Camada | Ferramenta | O que cobre | Meta |
|---|---|---|---|
| Unitário (domínio) | Vitest | Funções puras: fatura (RN-031 a RN-037), Price (RN-052), parcelas e arredondamento (RN-051), projeção (RN-061, RN-107), faixas, recorrência (RN-043), próximo campo do rascunho (RN-080) | 100% das regras `RN-xxx` com cálculo |
| Integração (API) | Vitest + Testcontainers (Postgres e Redis reais) + Supertest | Services e rotas com banco: posse de recurso, cotas do plano (RN-122) com concorrência, webhooks idempotentes, transações de banco | Toda rota |
| Contrato | OpenAPI gerado + `orval` sem diff no CI | App e API falam o mesmo contrato | Sempre |
| Avaliação da Mony | Script próprio (`modulos/mony/avaliacao`) | Frases de teste → ferramentas e argumentos esperados | ≥ 95% para publicar prompt |
| App (componentes) | Jest + React Native Testing Library | Componentes base, formulários, estados vazio/erro | Componentes de `src/ui` e telas críticas |
| E2E mobile | **Maestro** | Fluxos: cadastro → onboarding → primeiro lançamento no chat; cartão → compra parcelada → pagar fatura; limite do gratuito → [Ver planos] | Rodar em staging antes de cada release |
| Admin | Playwright | Login com 2FA, alterar preço, publicar novidade | Fluxos principais |

## Casos de teste obrigatórios (amostra)

- Compra no dia do fechamento vai para a próxima fatura (RN-031).
- Cartão com fechamento dia 31 em fevereiro fecha no dia 28/29 (RN-032).
- Compra de R$ 100,00 em 3x sem juros gera 33,34 + 33,33 + 33,33 (RN-051).
- Price: R$ 1.000,00, 2% a.m., 12x → parcela R$ 94,56; soma das amortizações = 1.000,00 (RN-052).
- Pagamento de fatura não aparece em despesas por categoria (RN-037).
- 10 requisições simultâneas de lançamento no gratuito com cota 3 → exatamente 3 aceitas (RN-122).
- Mesmo webhook Stripe recebido duas vezes → um único efeito.
- Transação Open Finance com mesmo `id_externo` → não duplica (RN-140).
- Usuário A tentando `GET /transacoes/<id de B>` → 404.
- Faixa de 80% do cartão cruzada duas vezes na mesma fatura → um alerta (RN-102).
- Alerta não urgente durante silêncio → enviado no fim do silêncio (RN-101); lembrete → enviado na hora (RN-077).
- "gastei 10" → pergunta categoria com botões; toque em botão → não chama o modelo (RN-080, RN-084).

## Dados de teste

- Fábricas (`test/factories`) para usuário, cartão, transação etc.
- Relógio controlável (`Clock` injetado em vez de `new Date()`) para testar datas, faturas e rotinas. **Proibido** `new Date()` direto em regra de negócio.
- Seeds de staging com usuários de demonstração em cada plano.

## Revisão e release

- PR com CI verde + 1 aprovação.
- Release do app: checklist de segurança ([11](11-seguranca-e-lgpd.md#checklist-de-segurança-antes-de-cada-release)), E2E Maestro em staging, teste manual em um Android antigo (Android 7/8, pouca memória) e no iPhone mais antigo suportado.
- Matriz de aparelhos de teste mínima **(decisão técnica)**: Android 7 ou 8 de entrada, Android recente Samsung, Android recente Motorola/Xiaomi, iPhone na versão mínima do SDK, iPhone atual.
