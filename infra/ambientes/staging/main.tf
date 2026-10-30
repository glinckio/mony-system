# Ambiente de staging (homologação): testes do cliente, TestFlight e teste interno do Play
# (docs/arquitetura/12). Num servidor só, para gastar o mínimo enquanto o uso é pequeno (T-156):
# ~US$ 25–30 por mês. A produção usa o módulo `ambiente` (T-145).
#
# Primeira vez: terraform init -backend-config="bucket=<saída bucket_estado do infra/bootstrap>"

terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = {
      Projeto    = "mony"
      Ambiente   = "staging"
      Gerenciado = "terraform"
    }
  }
}

module "servidor" {
  source = "../../modulos/servidor-unico"

  ambiente           = "staging"
  repositorio_github = "glinckio/mony-system"
  # O repositório usa o sujeito imutável do GitHub no token do deploy (T-159).
  ids_github = { dono = 45143271, repositorio = 1410985306 }
  cidr_vpc   = "10.20.0.0/16"

  # 2 vCPU ARM e 2 GB para a API, o worker, o Postgres e o Valkey (mais 2 GB de swap).
  tipo_instancia = "t4g.small"
  disco_gb       = 20
  backup_dias    = 7

  # Quem recebe os alarmes (SNS) e os alertas técnicos do worker (T-142). Cada endereço confirma a
  # assinatura do SNS no primeiro e-mail. Ex.: ["tecnico@exemplo.com.br"].
  emails_alertas = []

  # DSNs dos projetos `api` e `worker` no Sentry (T-142c), quando o cliente criar a conta. Vazios:
  # o Sentry fica desligado. O painel e o app têm os deles (infra/README.md, "Sentry").
  sentry_dsn_api    = ""
  sentry_dsn_worker = ""
}
