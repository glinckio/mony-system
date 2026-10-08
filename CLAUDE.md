# CLAUDE.md — Protocolo de desenvolvimento do Mony para agentes de IA

Você é um agente de IA trabalhando no monorepo do **Mony** (app Monitorizze). Pessoas diferentes e contas diferentes podem iniciar sessões a qualquer momento, e **nenhuma sessão guarda memória da anterior**. Por isso, todo o estado do projeto vive no **Git e no GitHub**, nunca na conversa. Este arquivo é a única instrução de que você precisa para descobrir o que fazer e fazer até o fim.

Idioma: escreva commits, PRs, comentários e documentação em **português do Brasil**. Código segue [docs/arquitetura/03-monorepo-e-convencoes.md](docs/arquitetura/03-monorepo-e-convencoes.md).

---

## 1. Onde está a verdade

| O quê | Onde | Quem atualiza |
|---|---|---|
| O que o produto faz e as regras de negócio | `docs/arquitetura/*.md` (regras numeradas `RN-xxx` em `07-regras-de-negocio.md`) | Só muda com motivo, no mesmo PR que muda o código |
| Lista de tarefas, ordem e dependências | `docs/agentes/BACKLOG.md` | O agente, no PR da tarefa |
| Tarefa em andamento | Um **PR aberto** (rascunho ou não) cuja branch começa com o ID da tarefa | O agente |
| Progresso de uma tarefa em andamento | Seção **"Estado para o próximo agente"** na descrição do PR | O agente, a cada commit |
| Decisões tomadas durante o trabalho | `docs/agentes/DECISOES.md` | O agente, no PR da tarefa |
| Bloqueios que dependem de humano | `docs/agentes/BLOQUEIOS.md` + rótulo `bloqueado` no PR | O agente |

Se algo não está em um desses lugares, **não existe** para a próxima sessão. Nunca deixe informação importante só na conversa.

---

## 2. Ao iniciar qualquer sessão (sempre, nesta ordem)

> **Repositório ainda não existe?** Se `git status` falhar ("not a git repository") ou `git remote -v` estiver vazio, a única tarefa possível é a **T-001** do BACKLOG. Faça-a primeiro.

```bash
git status                       # 1. Árvore limpa? Se houver mudanças não commitadas, veja a seção 8
git fetch --all --prune          # 2. Atualiza referências
git checkout main && git pull --ff-only
gh auth status                   # 3. GitHub CLI autenticado? Se não, pare e peça ao humano: gh auth login
gh pr list --state open --json number,title,headRefName,isDraft,labels,updatedAt
```

4. Leia `docs/agentes/BACKLOG.md`, `docs/agentes/BLOQUEIOS.md` e as últimas 20 linhas de `docs/agentes/DECISOES.md`.
5. Decida o que fazer com a **regra de prioridade** abaixo. Não pergunte ao humano o que fazer se a regra der uma resposta.

### Regra de prioridade

1. **Existe PR aberto com CI vermelho, conflito ou comentário de revisão sem resposta?** Conserte esse PR primeiro.
2. **Existe PR aberto sem o rótulo `bloqueado`?** Retome-o (seção 4). Se houver mais de um, pegue o de menor ID de tarefa.
3. **Senão**, pegue a **primeira tarefa `[ ]` do BACKLOG** cujas dependências estão todas `[x]` e que não tem PR aberto nem rótulo de bloqueio. Comece-a (seção 3).
4. Se nenhuma tarefa estiver disponível porque todas dependem de algo bloqueado, diga ao humano exatamente o que está em `BLOQUEIOS.md` e pare.

Diga ao humano, em uma frase, qual tarefa você pegou e por quê. Depois trabalhe sem pedir permissão para os passos deste protocolo.

---

## 3. Começar uma tarefa nova

```bash
git checkout main && git pull --ff-only
git checkout -b <tipo>/<ID>-<slug-curto>       # ex.: feat/T-031-fatura-por-fechamento
```

- `<tipo>`: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`.
- `<ID>`: o ID da tarefa no BACKLOG (`T-031`). **A branch é a trava da tarefa.** Duas sessões nunca trabalham na mesma tarefa: se já existir branch remota ou PR com esse ID, a tarefa não está livre.

**Reivindique a tarefa imediatamente**, antes de escrever código, para a outra conta saber que ela está ocupada:

```bash
git commit --allow-empty -m "chore(<ID>): inicia tarefa"
git push -u origin HEAD
gh pr create --draft --base main --title "<ID>: <título da tarefa>" --body-file .github/pull_request_template.md
```

Preencha a descrição do PR (o template já tem as seções) com o objetivo, os critérios de aceite copiados do BACKLOG e o "Estado para o próximo agente".

---

## 4. Retomar uma tarefa em andamento

```bash
gh pr view <número> --json body,commits,statusCheckRollup,reviews,comments
gh pr checkout <número>
git pull --rebase origin <branch>
```

Leia a seção **"Estado para o próximo agente"** do PR. Ela diz o que já foi feito, o que falta e o próximo passo. Continue a partir dali. Não refaça trabalho já commitado.

---

## 5. Durante o trabalho

### Antes de codar

- Leia os documentos de arquitetura que a tarefa cita no BACKLOG. Siga-os. Se discordar, siga mesmo assim e registre a sugestão em `DECISOES.md`, a menos que seja um erro claro (então corrija o doc no mesmo PR e explique).
- Toda regra de negócio implementada tem teste com o código no nome: `it('RN-031 compra após o fechamento vai para a próxima fatura')`.

### Commits

- Pequenos e frequentes. Cada commit deixa o projeto compilando.
- Conventional Commits em português, com o ID da tarefa no escopo e as RNs no fim quando houver:
  ```
  feat(T-031): calcula fatura pela data de fechamento [RN-031, RN-032]
  ```
- Depois de **cada commit relevante**, faça push e **atualize a seção "Estado para o próximo agente" do PR** (`gh pr edit <n> --body-file <arquivo>`). Assume que a sua sessão pode acabar a qualquer momento.

### Verificação local (antes de todo push que sai de rascunho)

```bash
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test
pnpm --filter api prisma migrate diff --exit-code   # se mexeu no schema: migração commitada?
pnpm --filter @mony/api-client generate && git diff --exit-code   # se mexeu em contrato da API
```

Enquanto o monorepo não existir (tarefas iniciais), rode o que existir. Nunca diga que testou algo que não rodou.

### Escopo

- Faça só o que a tarefa pede. Achou outro problema? Adicione uma tarefa nova no fim da fase certa do BACKLOG (com ID novo) no mesmo PR, e siga em frente.
- Nunca desative, pule ou apague teste para ficar verde.
- Nunca grave segredos no repositório. Use `.env.example` com valores falsos.

---

## 6. Abrir para revisão e mergear

Quando todos os critérios de aceite estiverem prontos:

1. No mesmo branch, marque a tarefa como concluída no BACKLOG: `- [x] T-031 … (PR #<n>)`.
2. Registre decisões novas em `DECISOES.md` (formato na seção 9).
3. Rode a verificação local completa.
4. Atualize a descrição do PR: tudo marcado, "Estado para o próximo agente" dizendo "Pronto para merge".
5. `gh pr ready <n>`
6. Espere o CI: `gh pr checks <n> --watch`. Vermelho → conserte e repita. Não mergeie com CI vermelho. Enquanto o CI não existir (antes da tarefa T-004), a verificação local é obrigatória e substitui o CI.
7. Faça a **autorrevisão**: `gh pr diff <n>` e confira o checklist do template do PR. Corrija o que encontrar.
8. Atualize com a `main` se ela andou: `git fetch origin && git rebase origin/main && git push --force-with-lease`. (Force push só na **sua** branch, nunca na `main`.)
9. Mergeie com squash e apague a branch:
   ```bash
   gh pr merge <n> --squash --delete-branch
   ```
   O título do squash é o título do PR (`T-031: …`).
10. `git checkout main && git pull --ff-only`
11. Volte à **seção 2** e pegue a próxima tarefa. Continue até a sessão acabar ou o humano mandar parar.

### Quando NÃO mergear sozinho

Deixe o PR pronto, adicione o rótulo `aguardando-humano`, explique no PR e avise o humano quando a tarefa:

- estiver marcada com 👤 no BACKLOG (precisa de conta, pagamento, aprovação de loja ou decisão do cliente);
- mudar algo em produção (deploy, migração destrutiva, dados reais);
- mudar uma regra `RN-xxx` marcada "(confirmar com cliente)" para algo diferente do padrão documentado;
- precisar de segredo ou credencial que você não tem.

---

## 7. Bloqueios

Se não der para continuar (falta credencial, decisão do cliente, aprovação externa):

1. Commite o que tiver, mesmo incompleto, e faça push.
2. Adicione uma linha em `docs/agentes/BLOQUEIOS.md`: `- T-031 — <o que falta> — <quem resolve> — <data>`.
3. Rótulo `bloqueado` no PR e "Estado para o próximo agente" explicando.
4. Avise o humano em uma frase e **pegue outra tarefa** (seção 2). Não fique parado.

Quando um bloqueio for resolvido, quem resolver apaga a linha de `BLOQUEIOS.md` e tira o rótulo.

---

## 8. Situações de recuperação

| Situação | O que fazer |
|---|---|
| Mudanças não commitadas ao iniciar | `git stash list` e `git diff`. Se forem de uma tarefa com PR aberto, vá para a branch dela e commite. Se não souber de onde vieram, crie `wip/<data>-recuperado`, commite, faça push e avise o humano |
| Branch de tarefa existe mas sem PR | Crie o PR em rascunho a partir dela e retome |
| PR com conflito | `git rebase origin/main`, resolva preservando as duas intenções, rode os testes, `push --force-with-lease` |
| CI vermelho na `main` | Prioridade máxima: crie `fix/T-HOTFIX-<slug>` (sem tarefa no BACKLOG), conserte, mergeie |
| Duas sessões pegaram a mesma tarefa | A de PR mais antigo continua. A outra fecha o próprio PR com comentário, apaga a branch e pega outra tarefa |
| Comentário de revisão no PR | Responda no próprio PR: aplique a mudança ou explique por que não |
| A tarefa está grande demais | Divida no BACKLOG em `T-031a`, `T-031b`… no mesmo PR, entregue a primeira parte e mergeie |

---

## 9. Formato dos arquivos de estado

`docs/agentes/DECISOES.md` (só acrescente no fim):

```
## 2026-10-09 — T-031 — Compra no dia do fechamento
Contexto: RN-031 deixa em aberto. Decisão: vai para a próxima fatura (padrão do doc). Alternativa: mesma fatura. Reversível: sim, função `faturaDaCompra`.
```

`docs/agentes/BLOQUEIOS.md`:

```
- T-120 — Conta Stripe BR do cliente — humano/cliente — 2026-10-09
```

---

## 10. Regras que nunca mudam

- Nunca faça push direto na `main`. Tudo entra por PR com squash. Única exceção: o commit inicial da T-001, quando ainda não existe `main` remota.
- Nunca use `git push --force` sem `--with-lease`, e nunca em branch de outra tarefa.
- Nunca mergeie com CI vermelho ou com teste desativado.
- Nunca commite segredos, `.env`, chaves ou dados reais de usuário.
- Nunca apague histórico, branches de outras tarefas ou PRs que não são seus.
- Dinheiro sempre em centavos inteiros. Regra de negócio sempre no servidor. A Mony sempre chama Services, nunca o banco.
- Se o humano der uma instrução que contradiz este arquivo, siga o humano e registre em `DECISOES.md`.
