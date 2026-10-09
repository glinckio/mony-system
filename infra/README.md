# Infraestrutura (Terraform)

AWS em `sa-east-1` (São Paulo), como descrito em [docs/arquitetura/12](../docs/arquitetura/12-infra-e-devops.md).

```
infra/
├─ bootstrap/             # Uma vez por conta: bucket do estado do Terraform e provedor OIDC do GitHub
├─ modulos/ambiente/      # Um ambiente completo: rede, RDS, Valkey, S3, segredos, ECR, ALB, ECS, papel de deploy
└─ ambientes/staging/     # Staging: chama o módulo com tamanhos mínimos
```

O que o ambiente cria:

| Peça | Recurso |
|---|---|
| Rede | VPC com sub-redes públicas (ALB, NAT) e privadas (containers, banco, cache) em 2 zonas; endpoint do S3 |
| API e worker | ECS Fargate, serviços `api` (atrás do ALB, escala pela CPU) e `worker`, mesma imagem |
| Banco | RDS PostgreSQL 18, criptografado, backup com PITR, TLS obrigatório |
| Filas e cache | ElastiCache Valkey 8 (compatível com Redis), TLS, `noeviction` |
| Arquivos | S3 privado, criptografado, só TLS; `exportacoes/` expira em 7 dias |
| Segredos | Secrets Manager: `mony/<ambiente>/infra` (`DATABASE_URL`, escrita pelo Terraform) e `mony/<ambiente>/app` (chaves da aplicação, preenchidas à mão) |
| Imagem | ECR `mony-<ambiente>-api`, com análise de vulnerabilidades |
| Deploy | Papel que o GitHub Actions assume por OIDC, só pelo job do ambiente (`environment: staging`) |

A senha do banco é gerada no `apply` e vai direto para o RDS e para o Secrets Manager: ela não fica no estado do Terraform (argumentos *write-only*). Para trocar a senha, aumente `versao_senha_banco` no módulo.

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
terraform apply       # 15 a 25 minutos (RDS e ElastiCache demoram)
```

Commite os arquivos `.terraform.lock.hcl` que o `init` criar em `infra/bootstrap` e `infra/ambientes/staging`: eles travam as versões dos providers.

### 3. Variáveis do deploy no GitHub

Na raiz do repositório:

```bash
terraform -chdir=infra/ambientes/staging output -raw comandos_github | sh
```

Isso grava as variáveis `STAGING_*` do repositório (região, papel de deploy, ECR, cluster, sub-redes etc.). Sem elas, o workflow [Deploy de staging](../.github/workflows/deploy-staging.yml) fica parado.

### 4. Primeiro deploy

```bash
gh workflow run deploy-staging.yml
gh run watch
```

O workflow publica a imagem da API no ECR (tags do commit e `staging`), roda `prisma migrate deploy && prisma db seed` numa tarefa avulsa e faz o deploy dos serviços `api` e `worker`. Antes desse primeiro deploy os serviços ficam tentando subir sem imagem; é esperado.

Depois, todo merge na `main` que mexe na API faz o mesmo.

```bash
curl "$(terraform -chdir=infra/ambientes/staging output -raw endereco_api)/v1/health"   # {"status":"ok"}
```

## Dia a dia

- **Logs:** CloudWatch, grupos `/mony/staging/api` e `/mony/staging/worker` (30 dias).
- **Chaves da aplicação** (JWT, Stripe, provedor de IA): no segredo `mony/staging/app`, em JSON. A tarefa que passar a usar uma chave inclui a leitura dela no `infra/modulos/ambiente/ecs.tf`.
- **HTTPS:** até existir o domínio, o ALB atende só HTTP. Com o certificado do ACM, preencha `certificado_arn` em `ambientes/staging/main.tf` (T-015).
- **Custos:** os itens fixos são o NAT gateway, o ALB, o RDS, o ElastiCache e as tarefas do Fargate, mesmo sem uso. Estime na [calculadora da AWS](https://calculator.aws/) antes de aplicar.
- **Apagar o ambiente:** mude `banco_protecao_exclusao` para `false`, `terraform apply`, depois `terraform destroy`. O RDS deixa um snapshot final.

## CI

O job **Infra** do CI roda `terraform fmt -check`, `terraform validate` (sem tocar na AWS) e compila e sobe a imagem da API em todo PR.
