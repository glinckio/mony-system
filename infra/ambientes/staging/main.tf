# Ambiente de staging (homologação): testes do cliente, TestFlight e teste interno do Play
# (docs/arquitetura/12). Tamanhos mínimos; produção usa o mesmo módulo com valores maiores (T-145).
#
# Primeira vez: terraform init -backend-config="bucket=<saída bucket_estado do infra/bootstrap>"

terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

locals {
  etiquetas = {
    Projeto    = "mony"
    Ambiente   = "staging"
    Gerenciado = "terraform"
  }
}

provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = local.etiquetas
  }
}

# Certificado do CloudFront (admin): o CloudFront só aceita certificado da us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.etiquetas
  }
}

module "ambiente" {
  source = "../../modulos/ambiente"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  ambiente           = "staging"
  repositorio_github = "glinckio/mony-system"

  cidr_vpc     = "10.20.0.0/16"
  nat_por_zona = false

  # Domínio de staging (ex.: "staging.monitorizze.com.br"), quando o cliente tiver o domínio
  # (doc 15, pergunta 16). Até lá, a API atende só HTTP no endereço do ALB. Passo a passo no
  # infra/README.md ("Domínio e HTTPS").
  dominio = null

  banco_classe      = "db.t4g.micro"
  banco_multi_az    = false
  banco_backup_dias = 7

  cache_classe   = "cache.t4g.micro"
  cache_replicas = 0

  api_cpu     = 512
  api_memoria = 1024
  api_minimo  = 1
  api_maximo  = 2

  worker_cpu        = 256
  worker_memoria    = 512
  worker_quantidade = 1
}
