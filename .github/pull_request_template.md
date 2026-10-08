## Tarefa

<!-- ID e título do BACKLOG, ex.: T-031: Cartões e faturas -->

## O que muda

Antes:

Depois:

## Critérios de aceite

<!-- Copiados do BACKLOG. Marque conforme for concluindo. -->
- [ ] 

## Regras de negócio

<!-- RN-xxx implementadas ou alteradas, cada uma com teste. -->

## Estado para o próximo agente

<!-- ATUALIZE A CADA COMMIT. Outra sessão, sem memória, vai continuar daqui. -->
- **Feito:**
- **Falta:**
- **Próximo passo exato:**
- **Armadilhas encontradas:**

## Como foi verificado

<!-- Comandos rodados e resultado. Não declare o que não rodou. -->

## Checklist de autorrevisão

- [ ] Só o escopo da tarefa (extras viraram tarefas novas no BACKLOG)
- [ ] Testes para cada RN tocada, com o código no nome
- [ ] Dinheiro em centavos inteiros; datas no fuso do usuário
- [ ] Regra de negócio no servidor; rotas filtram por usuário (teste de acesso cruzado)
- [ ] Contrato da API regenerado (`@mony/api-client`) se mudou
- [ ] Migração Prisma commitada e compatível com a versão anterior
- [ ] Nenhum segredo, `.env` ou dado real
- [ ] Textos de tela via i18n
- [ ] BACKLOG marcado `[x]`, DECISOES e docs de arquitetura atualizados se preciso
