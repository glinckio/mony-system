# Plano do módulo com a AWS simulada (sem credenciais): confere o que muda com e sem domínio.
# Roda no CI com `terraform test` (job Infra).

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { region = "sa-east-1", name = "sa-east-1" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["sa-east-1a", "sa-east-1b", "sa-east-1c"] }
  }
  mock_data "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  # ARNs válidos onde o provider confere o formato.
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/simulado" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:sa-east-1:123456789012:targetgroup/simulado/0123456789abcdef" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/simulado" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:sa-east-1:123456789012:loadbalancer/app/simulado/0123456789abcdef" }
  }
}

mock_provider "aws" {
  alias = "us_east_1"
}

# O random fica de verdade: o Terraform ainda não simula recurso efêmero (a senha do banco).

variables {
  ambiente           = "staging"
  repositorio_github = "glinckio/mony-system"
  cidr_vpc           = "10.20.0.0/16"
  banco_classe       = "db.t4g.micro"
  banco_multi_az     = false
  banco_backup_dias  = 7
  cache_classe       = "cache.t4g.micro"
  cache_replicas     = 0
  api_cpu            = 512
  api_memoria        = 1024
  api_minimo         = 1
  api_maximo         = 2
  worker_cpu         = 256
  worker_memoria     = 512
  worker_quantidade  = 1
}

run "sem_dominio" {
  command = apply

  assert {
    condition     = length(aws_route53_zone.principal) == 0 && length(aws_acm_certificate.api) == 0
    error_message = "Sem domínio não há zona nem certificado."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 0 && length(aws_lb_listener.http_encaminha) == 1
    error_message = "Sem domínio o ALB atende só HTTP."
  }

  assert {
    condition     = aws_cloudfront_distribution.admin.viewer_certificate[0].cloudfront_default_certificate
    error_message = "Sem domínio o admin usa o certificado do CloudFront."
  }

  assert {
    condition     = startswith(output.endereco_api, "http://") && output.servidores_dns == null
    error_message = "Sem domínio a API fica em HTTP no endereço do ALB."
  }
}

run "com_dominio" {
  command = apply

  variables {
    dominio = "staging.exemplo.com.br"
  }

  override_resource {
    target = aws_acm_certificate.api[0]
    values = {
      arn = "arn:aws:acm:sa-east-1:123456789012:certificate/api"
      domain_validation_options = [{
        domain_name           = "api.staging.exemplo.com.br"
        resource_record_name  = "_a1.api.staging.exemplo.com.br."
        resource_record_type  = "CNAME"
        resource_record_value = "_b1.acm-validations.aws."
      }]
    }
  }

  override_resource {
    target = aws_acm_certificate.admin[0]
    values = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/admin"
      domain_validation_options = [{
        domain_name           = "admin.staging.exemplo.com.br"
        resource_record_name  = "_a2.admin.staging.exemplo.com.br."
        resource_record_type  = "CNAME"
        resource_record_value = "_b2.acm-validations.aws."
      }]
    }
  }

  assert {
    condition     = length(aws_route53_record.validacao) == 2
    error_message = "Um registro de validação por certificado."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 1 && length(aws_lb_listener.http_redireciona) == 1
    error_message = "Com domínio o ALB atende HTTPS e redireciona o HTTP."
  }

  assert {
    condition     = aws_cloudfront_distribution.admin.aliases == toset(["admin.staging.exemplo.com.br"])
    error_message = "O admin responde em admin.<dominio>."
  }

  assert {
    condition     = output.endereco_api == "https://api.staging.exemplo.com.br" && output.endereco_admin == "https://admin.staging.exemplo.com.br"
    error_message = "Endereços com o domínio."
  }

  assert {
    condition     = length(aws_route53_record.admin) == 2 && aws_route53_record.api[0].name == "api.staging.exemplo.com.br"
    error_message = "Registros A da API e A e AAAA do admin."
  }
}

run "dominio_invalido" {
  command = plan

  variables {
    dominio = "https://staging.exemplo.com.br/"
  }

  expect_failures = [var.dominio]
}
