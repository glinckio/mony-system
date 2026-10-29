# Infraestrutura (Terraform)

AWS em `sa-east-1` (São Paulo), como descrito em [docs/arquitetura/12](../docs/arquitetura/12-infra-e-devops.md).

```
infra/
├─ bootstrap/                # Uma vez por conta: bucket do estado do Terraform e provedor OIDC do GitHub
├─ modulos/servidor-unico/   # Staging (T-156): um EC2 com a API, o worker, o Postgres e o Valkey, e o CloudFront na frente
│  └─ tests/                 # terraform test com a AWS simulada
├─ modulos/ambiente/         # Produção (T-145): rede, RDS, Valkey, S3, segredos, ECR, ALB, ECS, admin, domínio
│  └─ tests/
├─ servidor/atualizar.sh     # O que o deploy de staging roda no servidor (pelo SSM)
└─ ambientes/staging/        # Staging: chama o módulo servidor-unico
```

## Staging: um servidor só

Para gastar o mínimo enquanto o uso é pequeno, o staging roda num servidor só (ADR-010, doc 12): **~US$ 27 por mês** em São Paulo. O que o módulo `servidor-unico` cria:

| Peça | Recurso |
|---|---|
| Rede | VPC com uma sub-rede pública. Sem NAT e sem ALB |
| Servidor | EC2 `t4g.small` (ARM), Amazon Linux 2023, disco gp3 de 20 GB cifrado, Elastic IP. A porta 80 só aceita o CloudFront; sem SSH (acesso pelo Session Manager) |
| Containers | `api`, `worker`, `postgres` (18) e `valkey` (8), na rede `mony` do Docker. Dados em `/var/lib/mony` |
| Endereço | CloudFront com o HTTPS dele (`https://<id>.cloudfront.net`): o painel admin na raiz e a API em `/v1/*` |
| Backup | Snapshot diário do disco às 03:00 de Brasília, 7 guardados |
| Arquivos | S3 privado, criptografado, só TLS; `exportacoes/` expira em 7 dias |
| Configuração | Parameter Store: `/mony/staging/config` (Terraform) e `/mony/staging/app` (chaves da aplicação, cifrado, preenchido à mão) |
| Imagem | ECR `mony-staging-api` (arm64), as 10 mais recentes |
| Alarmes | Falha de sistema do EC2 (recupera sozinho), falha da instância (reinicia), rotina `monitorar` parada, alerta técnico sem e-mail |
| Deploy | Papel que o GitHub Actions assume por OIDC, só pelo job do ambiente (`environment: staging`): ECR, Run Command no servidor, bucket e invalidação do admin |

A senha do Postgres é gerada no próprio servidor no primeiro deploy (`/var/lib/mony/senha-banco`) e não sai dele: o banco não abre porta, só a rede do Docker o alcança.

## Pré-requisitos

- Conta AWS do cliente para staging (o doc 12 prevê uma conta por ambiente, via AWS Organizations).
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) com acesso de administrador nessa conta (`aws sts get-caller-identity` responde a conta certa).
- [Terraform 1.16](https://developer.hashicorp.com/terraform/install) ou mais novo (abaixo do 2.0).
- GitHub CLI (`gh`) autenticado no repositório.

## Primeira vez em uma conta

### 1. Bootstrap

```bash
cd infra/bootstrap
terraform init
terraform apply
terraform output bucket_estado     # anote: vai no init dos ambientes
```

O estado do bootstrap fica em `infra/bootstrap/terraform.tfstate`, fora do Git. Guarde esse arquivo (ou, depois do apply, mova o estado para o bucket criado com um bloco `backend "s3"` e `terraform init -migrate-state`).

### 2. Ambiente de staging

```bash
cd infra/ambientes/staging
terraform init -backend-config="bucket=<bucket_estado do passo 1>"
terraform plan        # confira o que será criado
terraform apply       # uns 5 minutos (o CloudFront é o que mais demora)
```

Commite os arquivos `.terraform.lock.hcl` que o `init` criar em `infra/bootstrap` e `infra/ambientes/staging`: eles travam as versões dos providers.

### 3. Variáveis do deploy no GitHub

Na raiz do repositório:

```bash
terraform -chdir=infra/ambientes/staging output -raw comandos_github | sh
```

Isso grava as variáveis `STAGING_*` do repositório (região, papel de deploy, ECR, servidor, bucket e CloudFront do admin). Sem elas, os workflows [Deploy de staging](../.github/workflows/deploy-staging.yml) e [Deploy do admin em staging](../.github/workflows/deploy-admin-staging.yml) ficam parados.

### 4. Chaves da aplicação

A API não sobe em produção sem a chave dos tokens de acesso (`JWT_CHAVE_PRIVADA`, ES256), lida do parâmetro `/mony/staging/app` (JSON, cifrado). Gere a chave e grave o parâmetro, na raiz do repositório:

```bash
node -e "
const { generateKeyPairSync } = require('node:crypto');
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.stdout.write(JSON.stringify({ JWT_CHAVE_PRIVADA: pem }));
" > segredo-app.json
aws ssm put-parameter --name /mony/staging/app --type SecureString --overwrite \
  --value file://segredo-app.json
rm segredo-app.json
```

O `put-parameter` troca o JSON inteiro: quando houver outras chaves (Stripe, provedor de IA, Brevo, Expo), grave todas juntas. Cada chave do JSON vira uma variável de ambiente da API e do worker, com o mesmo nome (lista em `apps/api/src/core/config/ambiente.ts`). O parâmetro aceita até 4 KB. Trocar a chave JWT derruba os tokens de acesso em uso; o app renova sozinho.

### 5. Primeiro deploy

```bash
gh workflow run deploy-staging.yml
gh run watch
```

O workflow publica a imagem arm64 da API no ECR (tags do commit e `staging`) e roda o [`atualizar.sh`](servidor/atualizar.sh) no servidor pelo SSM: no primeiro, ele também sobe o Postgres e o Valkey. Depois roda `prisma migrate deploy && prisma db seed`, troca a API (e volta para a anterior se `/v1/health` não responder) e troca o worker. A saída do script aparece no log do job.

O painel admin vai no workflow dele:

```bash
gh workflow run deploy-admin-staging.yml
terraform -chdir=infra/ambientes/staging output -raw endereco   # abra no navegador
```

Depois, todo merge na `main` que mexe na API ou no painel faz o mesmo.

```bash
curl "$(terraform -chdir=infra/ambientes/staging output -raw endereco)/v1/health"   # {"status":"ok"}
```

No app, o perfil `preview` do EAS usa `EXPO_PUBLIC_API_URL=<endereco>`.

## Dia a dia

- **Entrar no servidor:** `aws ssm start-session --target "$(terraform -chdir=infra/ambientes/staging output -raw servidor)"` (precisa do [plugin do Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)). Lá: `sudo docker ps`, `sudo docker logs --tail 100 api`, `sudo docker exec -it postgres psql -U mony`.
- **Logs:** CloudWatch, grupos `/mony/staging/api` e `/mony/staging/worker` (14 dias). Os do Postgres e do Valkey ficam no servidor (`docker logs`).
- **Alarmes** (T-142, doc 12): falha de sistema do EC2 (a AWS recupera o servidor em outro hospedeiro, com o mesmo disco e IP), falha da instância (reinicia), rotina `monitorar` do worker parada e alerta técnico sem e-mail. Avisam no tópico SNS `mony-staging-alertas`, que manda e-mail para `emails_alertas` em `ambientes/staging/main.tf`. Cada endereço recebe primeiro um e-mail da AWS para confirmar a assinatura; sem confirmar, não recebe nada. A mesma lista vai para o worker (`ALERTAS_TECNICOS_EMAILS`).
- **Chaves da aplicação:** no parâmetro `/mony/staging/app` (passo 4). Depois de mudar, um novo deploy (`gh workflow run deploy-staging.yml`) faz a API e o worker lerem o valor novo.
- **Atualizar o sistema do servidor:** pelo Session Manager, `sudo dnf upgrade -y` e, se o kernel mudou, `sudo reboot` (os containers voltam sozinhos). O Terraform não troca a AMI de um servidor que já existe, porque o banco está no disco dele.
- **Voltar um backup:** no console do EC2, em Snapshots (etiqueta `Backup = mony-staging`), crie um volume do snapshot na mesma zona, pare o servidor, troque o disco raiz pelo volume novo e ligue de novo.
- **Custos (~US$ 27 por mês):** EC2 US$ 19,56, disco US$ 3,04, IPv4 US$ 3,65 e snapshots ~US$ 0,50. CloudFront, CloudWatch (logs até 5 GB, 10 alarmes), Parameter Store, ECR e S3 ficam no nível sempre gratuito ou em centavos. Um Savings Plan de 1 ano tira ~30% do EC2.
- **Apagar o ambiente:** `terraform destroy`. O banco vai junto com o disco; os snapshots do DLM ficam até vencer.

## Domínio e HTTPS

Até existir o domínio, o staging usa o HTTPS do próprio CloudFront (`https://<id>.cloudfront.net`), que já serve para o app, o painel e os webhooks. Quando o cliente tiver o domínio (doc 15, pergunta 16), o módulo `servidor-unico` ganha um certificado do ACM na `us-east-1` e o nome (ex.: `staging.monitorizze.com.br`) como alias do CloudFront (tarefa nova no BACKLOG quando chegar a hora). O módulo `ambiente` (produção) já faz isso com a variável `dominio`.

## Sentry

Erros da API, do worker, do painel e do app (T-142c, doc 12). Sem configuração, o Sentry fica desligado e nada sai do ambiente.

1. Na conta do cliente no [Sentry](https://sentry.io), crie a organização e quatro projetos: `api` e `worker` (Node), `admin` (React) e `mobile` (React Native).
2. **API e worker:** em `ambientes/staging/main.tf`, preencha `sentry_dsn_api` e `sentry_dsn_worker` com o DSN de cada projeto, aplique (`terraform apply`) e rode um deploy (`gh workflow run deploy-staging.yml`). O ambiente no Sentry é o nome do ambiente (`staging`), e a release é o commit da imagem.
3. **Painel:** grave o DSN do projeto `admin` na variável do GitHub:

   ```bash
   gh variable set STAGING_SENTRY_DSN_ADMIN --body '<DSN do projeto admin>'
   ```

4. **Source maps** (pilha dos erros com o código-fonte): crie um token de organização no Sentry (Settings → Developer Settings → Organization Tokens) e grave-o no GitHub com a organização:

   ```bash
   gh secret set SENTRY_AUTH_TOKEN
   gh variable set SENTRY_ORG --body '<slug da organização>'
   ```

   Os deploys de staging enviam os source maps a cada merge. Sem o token, esse passo é pulado.
5. **App:** `EXPO_PUBLIC_SENTRY_DSN` e o segredo `SENTRY_AUTH_TOKEN` nos ambientes do EAS (README da raiz, "EAS").

O que vai para o Sentry: o erro com a pilha, a rota e o `requestId` (para achar o log no CloudWatch). Cabeçalhos, corpo, query string, dados do usuário, argumentos dos jobs e variáveis locais ficam de fora (`@mony/shared/sentry`, doc 11).

## CI

O job **Infra** do CI roda em todo PR:

- `terraform fmt -check`;
- `terraform validate`, sem tocar na AWS;
- `terraform test` dos dois módulos, com a AWS simulada: o `ambiente` com e sem domínio, e o `servidor-unico`;
- `shellcheck` no `servidor/atualizar.sh`;
- o build da imagem da API (x86; o deploy de staging faz a arm64).
