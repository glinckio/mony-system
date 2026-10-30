# Plano do módulo com a AWS simulada (sem credenciais): confere o que importa para a segurança e o
# custo do servidor único (T-156). Roda no CI com `terraform test` (job Infra).

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
  mock_data "aws_ssm_parameter" {
    defaults = { insecure_value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-0123456789abcdef0" }
  }
  # ARNs válidos onde o provider confere o formato.
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/simulado" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/simulado" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn         = "arn:aws:cloudfront::123456789012:distribution/E123456789ABCD"
      id          = "E123456789ABCD"
      domain_name = "d111111abcdef8.cloudfront.net"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:sa-east-1:123456789012:simulado" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:sa-east-1:123456789012:log-group:simulado" }
  }
  mock_resource "aws_instance" {
    defaults = {
      id  = "i-0123456789abcdef0"
      arn = "arn:aws:ec2:sa-east-1:123456789012:instance/i-0123456789abcdef0"
    }
  }
  mock_resource "aws_eip" {
    defaults = { public_dns = "ec2-203-0-113-10.sa-east-1.compute.amazonaws.com" }
  }
}

variables {
  ambiente           = "staging"
  repositorio_github = "glinckio/mony-system"
  cidr_vpc           = "10.20.0.0/16"
}

run "servidor_unico" {
  command = apply

  assert {
    condition     = aws_instance.servidor.instance_type == "t4g.small"
    error_message = "O padrão é o t4g.small (ARM)."
  }

  assert {
    condition = (
      aws_instance.servidor.metadata_options[0].http_tokens == "required" &&
      aws_instance.servidor.metadata_options[0].http_put_response_hop_limit == 2
    )
    error_message = "IMDSv2 obrigatório, com 2 saltos para os containers usarem o papel do servidor."
  }

  assert {
    condition     = aws_instance.servidor.root_block_device[0].encrypted && aws_instance.servidor.root_block_device[0].tags["Backup"] == "mony-staging"
    error_message = "O disco é cifrado e tem a etiqueta que o backup diário procura."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.http_cloudfront.from_port == 80 &&
      aws_vpc_security_group_ingress_rule.http_cloudfront.to_port == 80 &&
      aws_vpc_security_group_ingress_rule.http_cloudfront.prefix_list_id == "pl-0123456789abcdef0" &&
      aws_vpc_security_group_ingress_rule.http_cloudfront.cidr_ipv4 == null
    )
    error_message = "A única entrada é a porta 80, só da lista de IPs do CloudFront (nada de 0.0.0.0/0 nem SSH)."
  }

  assert {
    condition     = one([for o in aws_cloudfront_distribution.principal.origin : o.domain_name if o.origin_id == "api"]) == "ec2-203-0-113-10.sa-east-1.compute.amazonaws.com"
    error_message = "A origem da API é o nome público do Elastic IP do servidor."
  }

  assert {
    condition     = one([for c in aws_cloudfront_distribution.principal.ordered_cache_behavior : c.target_origin_id if c.path_pattern == "/v1/*"]) == "api"
    error_message = "O /v1/* vai para a API; o resto é o painel."
  }

  assert {
    condition     = jsondecode(aws_ssm_parameter.config.value).API_URL_PUBLICA == "https://d111111abcdef8.cloudfront.net"
    error_message = "O endereço público da API é o do CloudFront, em HTTPS."
  }

  assert {
    condition     = aws_ssm_parameter.app.type == "SecureString"
    error_message = "As chaves da aplicação ficam cifradas."
  }

  assert {
    condition     = aws_dlm_lifecycle_policy.backup.policy_details[0].schedule[0].retain_rule[0].count == 7
    error_message = "Sete snapshots diários por padrão."
  }

  assert {
    condition = toset(keys(output.variaveis_github)) == toset([
      "STAGING_AWS_REGIAO", "STAGING_AWS_PAPEL_DEPLOY", "STAGING_ECR_REPOSITORIO",
      "STAGING_SERVIDOR", "STAGING_ADMIN_BUCKET", "STAGING_ADMIN_CLOUDFRONT",
    ])
    error_message = "As variáveis do GitHub são as que os workflows de deploy leem."
  }
}

run "sujeito_imutavel" {
  command = plan

  variables {
    ids_github = { dono = 45143271, repositorio = 1410985306 }
  }

  assert {
    condition = local.sujeitos_deploy == [
      "repo:glinckio/mony-system:environment:staging",
      "repo:glinckio@45143271/mony-system@1410985306:environment:staging",
    ]
    error_message = "Com os IDs, o papel de deploy aceita também o sujeito imutável do GitHub."
  }
}

run "so_arm" {
  command = plan

  variables {
    tipo_instancia = "t3.small"
  }

  expect_failures = [var.tipo_instancia]
}
