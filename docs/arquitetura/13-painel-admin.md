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

## Assinaturas (T-141b)

- **Situações** (uma por conta, pelo plano que vale agora): **em teste** (teste valendo), **ativas** (plano pago em dia), **inadimplentes** (plano pago com cobrança recusada, enquanto a Stripe tenta de novo, RN-131), **canceladas** (o plano pago acabou e a pessoa voltou ao gratuito) e **gratuitos** (o resto, inclusive o teste vencido, RN-126, e quem nunca assinou). O teste estendido pelo admin conta como teste mesmo para quem tinha cancelado. Contas excluídas ficam de fora.
- `GET /admin/assinaturas/resumo` traz as contagens, as pagas por plano, quantas ativas têm o cancelamento agendado, o **MRR** e a **conversão do teste**. Clicar numa situação lista as contas dela (`GET /admin/assinaturas?situacao=&cursor=&limite=`, das mais novas às mais antigas, com link para a conta).
- **MRR** (centavos): o valor do mensal mais um doze avos do anual, das ativas, pelo preço que cada assinatura paga (RN-129; sem preço gravado, o vigente do plano). O cupom vale só na primeira cobrança (RN-130) e fica de fora. A parte das inadimplentes aparece à parte, como receita em risco.
- **Conversão do teste:** dos testes que acabaram nos últimos 30 dias, quantos assinaram um plano pago (mesmo que depois tenham cancelado; `assinaturas.inicio` gravado). Quem assina no meio do teste entra na conta quando o teste acabaria.
- Só leitura, sem auditoria das listas (como a lista de usuários sem busca); abrir a conta de alguém grava a visualização (T-141a). Contagens em consulta direta, que basta para o volume do início; se pesar, vão para as *materialized views* da T-141f.

## Auditoria (T-141c)

- A tabela `auditoria` recebe toda ação e visualização de dados dos admins (o login no painel, preços, limites, cupons, usuários). A seção mostra os registros do mais novo ao mais antigo, 50 por vez com [Carregar mais] (`GET /admin/auditoria`): quando, quem, a ação, sobre o quê (com link para a conta quando é um usuário), o antes e o depois numa linha e o IP.
- **Filtros:** admin, ação e entidade (as listas vêm de `GET /admin/auditoria/filtros`, com o que existe no registro), id da entidade e período. O período usa dias de São Paulo, os dois inclusos; início depois do fim responde 400.
- Consultar a auditoria não gera registro, para a lista não crescer sozinha. Ninguém edita nem apaga registros pelo painel. O admin cuja conta foi apagada aparece como "Conta apagada" (`usuario_id` vira nulo).

## Novidades (T-141d)

- A novidade tem título (até 120 caracteres), texto (até 2.000), vídeo opcional e validade opcional. O vídeo é um link do YouTube ou do Vimeo; o upload no S3 continua a confirmar com o cliente. A validade é o último dia em que vale, em São Paulo. Toda novidade nasce como **rascunho**.
- **Publicar agora** ou **agendar** (`POST /admin/novidades/:id/publicar`, com `publicarEm` ou nulo). Situações: rascunho, agendada (antes da hora), no ar, vencida (depois da validade) e desativada. A agendada pode mudar de data; a que já foi ao ar, não (desative e crie outra). Agendar no passado ou depois da validade dá 400.
- **Editar** (`PUT`) vale para qualquer uma que não foi desativada. **Desativar** tira do app e não tem volta.
- **Push opcional** (`enviar_push`): a rotina `enviar-push-novidades` roda a cada minuto. A novidade publicada que já entrou no ar, ainda vale e não teve o push enviado vai para todas as contas ativas pelo motor de alertas (tipo `novidade`, chave `novidade:<id>`, não urgente, abre a central), e grava `push_enviado_em`. A preferência da pessoa e o horário de silêncio valem como em qualquer alerta. O push sai em até um minuto depois de publicar.
- Auditoria: `novidade.criada`, `novidade.editada` (antes e depois), `novidade.publicada` e `novidade.desativada`.
- A tela das novidades no app (`GET /novidades`, aba na central, lidas) é a T-150.

## Mony (T-141e)

- **Versões do prompt:** a lista (`GET /admin/mony/versoes`) mostra cada versão de `mony_config` com o modelo, quem criou, a situação da avaliação (não avaliada, avaliando, falhou, avaliada) e o resultado (percentual e frases). A versão escolhida (`GET /admin/mony/versoes/:versao`; a 0 é o prompt do código) abre com o prompt editável, o modelo e as frases que falharam com os motivos.
- **Salvar** grava uma versão nova, inativa (`POST /admin/mony/versoes`), com as mesmas descrições de ferramentas da versão de origem. As descrições não se editam no painel por enquanto (o `mony:avaliar --criar` e o banco continuam valendo para isso).
- **Avaliar** (`POST …/:versao/avaliar`, 202) põe a versão na fila `mony-avaliacao`. O worker roda `avaliar-mony --versao <n> --gravar` num processo à parte (a avaliação fixa a versão e anota as ferramentas no processo inteiro, o que não pode acontecer no processo que atende os usuários), uma avaliação por vez, sem nova tentativa. O processo grava o resultado na versão; se não gravar, a versão fica com o motivo (a última linha da saída) em `avaliacao_falha`. Uma avaliação "rodando" há mais de 45 minutos conta como falha. A lista se relê a cada 10 s enquanto alguma roda. Com o modelo falso (`IA_PROVEDOR=fake`) o painel avisa e a API responde 409: só as frases por regra rodariam, e o resultado não vale.
- **Ativar** (`POST …/:versao/ativar`) só aparece e só passa com a avaliação em 95% ou mais (`ConfigMonyService.ativar`, doc 08); a anterior sai na mesma transação e as outras instâncias passam a usar a nova em até 1 minuto.
- **Custo por período** (`GET /admin/mony/custo?de=&ate=`, dias de São Paulo, até 1 ano): chamadas, tokens de entrada e saída e custo por modelo, o total, e quantas chamadas deram erro. O custo vem da **tabela de preços** (`GET` e `PUT /admin/mony/precos`, guardada em `configuracoes.precos_ia`) em centavos de dólar por milhão de tokens, a moeda em que o provedor cobra; arredonda uma vez por modelo. Modelo sem preço fica fora do total, com aviso e um botão para pôr o preço dele. A transcrição de áudio grava tokens 0 e não entra no custo.
- **Chamadas com erro** (`GET /admin/mony/logs?de=&ate=`, 50 por vez, cursor): quando, quem (link para a conta), a mensagem do usuário que levou à chamada (até 500 caracteres), o erro, a ferramenta, o modelo e a duração.
- Auditoria: `mony.versao_criada`, `mony.avaliacao_pedida`, `mony.versao_ativada` (antes e depois), `mony.precos_alterados` (antes e depois) e `mony.logs_vistos` a cada página aberta, porque mostra o texto dos usuários.
- Os limites de uso por usuário por dia (para todos os planos) e o alerta de custo diário ainda não existem: são a T-151 e a T-142.

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
