# Infraestrutura (Terraform)

AWS em `sa-east-1` (São Paulo), como descrito em [docs/arquitetura/12](../docs/arquitetura/12-infra-e-devops.md).

```
infra/
├─ bootstrap/             # Uma vez por conta: bucket do estado do Terraform e provedor OIDC do GitHub
├─ modulos/ambiente/      # Um ambiente completo: rede, RDS, Valkey, S3, segredos, ECR, ALB, ECS, admin, domínio, papel de deploy
│  └─ tests/              # terraform test com a AWS simulada
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
| Admin | Bucket privado + CloudFront. O CloudFront também repassa `/v1/*` para o ALB: o painel chama a API no próprio domínio, sem CORS |
| Domínio (com `dominio`) | Zona no Route 53, certificados do ACM validados por DNS, `api.<dominio>` (ALB em HTTPS) e `admin.<dominio>` (CloudFront) |
| Deploy | Papel que o GitHub Actions assume por OIDC, só pelo job do ambiente (`environment: staging`): API (ECR e ECS) e admin (bucket e invalidação do CloudFront) |

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

Isso grava as variáveis `STAGING_*` do repositório (região, papel de deploy, ECR, cluster, sub-redes, bucket e CloudFront do admin etc.). Sem elas, os workflows [Deploy de staging](../.github/workflows/deploy-staging.yml) e [Deploy do admin em staging](../.github/workflows/deploy-admin-staging.yml) ficam parados.

### 4. Chaves da aplicação

A API não sobe em produção sem a chave dos tokens de acesso (`JWT_CHAVE_PRIVADA`, ES256), lida do segredo `mony/staging/app`. Gere a chave e grave o segredo, na raiz do repositório:

```bash
node -e "
const { generateKeyPairSync } = require('node:crypto');
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.stdout.write(JSON.stringify({ JWT_CHAVE_PRIVADA: pem }));
" > segredo-app.json
aws secretsmanager put-secret-value --secret-id mony/staging/app --secret-string file://segredo-app.json
rm segredo-app.json
```

O `put-secret-value` troca o JSON inteiro: quando houver outras chaves (Stripe, provedor de IA), grave todas juntas. Trocar a chave JWT derruba os tokens de acesso em uso; o app renova sozinho.

### 5. Primeiro deploy

```bash
gh workflow run deploy-staging.yml
gh run watch
```

O workflow publica a imagem da API no ECR (tags do commit e `staging`), roda `prisma migrate deploy && prisma db seed` numa tarefa avulsa e faz o deploy dos serviços `api` e `worker`. Antes desse primeiro deploy os serviços ficam tentando subir sem imagem; é esperado.

O painel admin vai no workflow dele:

```bash
gh workflow run deploy-admin-staging.yml
terraform -chdir=infra/ambientes/staging output -raw endereco_admin   # abra no navegador
```

Depois, todo merge na `main` que mexe na API faz o mesmo.

```bash
curl "$(terraform -chdir=infra/ambientes/staging output -raw endereco_api)/v1/health"   # {"status":"ok"}
```

## Dia a dia

- **Logs:** CloudWatch, grupos `/mony/staging/api` e `/mony/staging/worker` (30 dias).
- **Alarmes** (T-142, doc 12): API fora do ar, 5xx acima de 1% em 5 minutos, rotina `monitorar` do worker parada, alerta técnico sem e-mail e backup diário do banco não encontrado. Avisam no tópico SNS `mony-staging-alertas` (output `topico_alertas`), que manda e-mail para `emails_alertas` em `ambientes/staging/main.tf`. Cada endereço recebe primeiro um e-mail da AWS para confirmar a assinatura; sem confirmar, não recebe nada. A mesma lista vai para o worker (`ALERTAS_TECNICOS_EMAILS`), que manda os alertas dele (fila parada, falha em webhook, custo de IA) pelo provedor de e-mail. Com o ambiente recém-criado, o alarme de backup fica em alarme até o primeiro backup automático (janela das 06:00 UTC).
- **Chaves da aplicação** (JWT, Stripe, provedor de IA): no segredo `mony/staging/app`, em JSON (passo 4). A tarefa que passar a usar uma chave inclui a leitura dela no `infra/modulos/ambiente/ecs.tf`. Depois de mudar o segredo, um novo deploy (`gh workflow run deploy-staging.yml`) faz as tarefas lerem o valor novo.
- **HTTPS:** até existir o domínio, o ALB atende só HTTP e o admin fica no endereço do CloudFront (`https://<id>.cloudfront.net`). Veja "Domínio e HTTPS" abaixo.
- **Custos:** os itens fixos são o NAT gateway, o ALB, o RDS, o ElastiCache e as tarefas do Fargate, mesmo sem uso. Estime na [calculadora da AWS](https://calculator.aws/) antes de aplicar.
- **Apagar o ambiente:** mude `banco_protecao_exclusao` para `false`, `terraform apply`, depois `terraform destroy`. O RDS deixa um snapshot final.

## Domínio e HTTPS

Quando o cliente tiver o domínio (doc 15, pergunta 16), staging usa um subdomínio dele, com zona própria no Route 53 (ex.: `staging.monitorizze.com.br`). Assim o DNS do domínio principal continua onde está (Registro.br ou outro).

1. Em `ambientes/staging/main.tf`, preencha `dominio = "staging.<domínio do cliente>"`.
2. Crie só a zona e veja os servidores de nome dela:

   ```bash
   cd infra/ambientes/staging
   terraform apply -target=module.ambiente.aws_route53_zone.principal
   terraform output servidores_dns
   ```

3. No DNS do domínio principal, crie um registro **NS** para `staging` com esses quatro servidores. Confira com `dig NS staging.<domínio> +short`.
4. Aplique o resto: `terraform apply`. O ACM valida os certificados pelo DNS (alguns minutos depois da delegação; o `apply` espera). A API passa a responder em `https://api.<dominio>` (o HTTP redireciona) e o admin em `https://admin.<dominio>`.
5. Para o app de preview apontar para a API nova, use `EXPO_PUBLIC_API_URL=https://api.<dominio>` no perfil `preview` do EAS.

O certificado do admin fica na `us-east-1`, porque o CloudFront só aceita certificado de lá; por isso o ambiente usa também o provider `aws.us_east_1`.

## CI

O job **Infra** do CI roda em todo PR:

- `terraform fmt -check`;
- `terraform validate`, sem tocar na AWS;
- `terraform test` do módulo (`modulos/ambiente/tests`), com a AWS simulada: o plano com e sem domínio;
- o build da imagem da API.
