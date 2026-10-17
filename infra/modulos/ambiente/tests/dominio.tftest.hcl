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
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:sa-east-1:123456789012:simulado" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:sa-east-1:123456789012:log-group:simulado" }
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

run "alarmes" {
  command = apply

  variables {
    emails_alertas = ["tecnico@exemplo.com.br", "socio@exemplo.com.br"]
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alertas_email) == 2
    error_message = "Uma assinatura do SNS por e-mail."
  }

  assert {
    condition = alltrue([
      for alarme in [
        aws_cloudwatch_metric_alarm.api_fora_do_ar,
        aws_cloudwatch_metric_alarm.api_5xx,
        aws_cloudwatch_metric_alarm.monitoramento_parado,
        aws_cloudwatch_metric_alarm.alerta_sem_email,
        aws_cloudwatch_metric_alarm.backup_nao_encontrado,
      ] : contains(alarme.alarm_actions, aws_sns_topic.alertas.arn)
    ])
    error_message = "Todos os alarmes avisam no tópico."
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.backup_concluido.event_pattern).detail.SourceIdentifier == ["mony-staging"]
    error_message = "A regra de backup olha o banco do ambiente."
  }

  assert {
    condition     = one([for variavel in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment : variavel.value if variavel.name == "ALERTAS_TECNICOS_EMAILS"]) == "tecnico@exemplo.com.br,socio@exemplo.com.br"
    error_message = "O worker recebe os mesmos e-mails para os alertas dele."
  }
}

run "painel" {
  command = apply

  assert {
    condition     = length(jsondecode(aws_cloudwatch_dashboard.principal.dashboard_body).widgets) == 7
    error_message = "O painel tem a API, as filas, o custo de IA e as consultas por rota."
  }

  assert {
    condition     = one([for variavel in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment : variavel.value if variavel.name == "METRICAS_NAMESPACE"]) == "Mony/staging"
    error_message = "O worker escreve as métricas no namespace do ambiente."
  }

  assert {
    condition     = strcontains(aws_cloudwatch_query_definition.tempo_por_rota.query_string, "by req.method, rota")
    error_message = "A consulta salva agrupa por rota."
  }
}

run "email_invalido" {
  command = plan

  variables {
    emails_alertas = ["tecnico"]
  }

  expect_failures = [var.emails_alertas]
}

run "dominio_invalido" {
  command = plan

  variables {
    dominio = "https://staging.exemplo.com.br/"
  }

  expect_failures = [var.dominio]
}

# T-142c: o DSN de cada serviço vai só para o contêiner dele; o ambiente do Sentry, para os dois.
run "sentry_por_servico" {
  command = plan

  variables {
    sentry_dsn_api    = "https://chave@o1.ingest.sentry.io/11"
    sentry_dsn_worker = "https://chave@o1.ingest.sentry.io/22"
  }

  assert {
    condition = (
      strcontains(aws_ecs_task_definition.api.container_definitions, "ingest.sentry.io/11") &&
      !strcontains(aws_ecs_task_definition.api.container_definitions, "ingest.sentry.io/22")
    )
    error_message = "A API leva só o DSN do projeto api."
  }

  assert {
    condition = (
      strcontains(aws_ecs_task_definition.worker.container_definitions, "ingest.sentry.io/22") &&
      !strcontains(aws_ecs_task_definition.worker.container_definitions, "ingest.sentry.io/11")
    )
    error_message = "O worker leva só o DSN do projeto worker."
  }

  assert {
    condition     = strcontains(aws_ecs_task_definition.worker.container_definitions, "\"SENTRY_AMBIENTE\",\"value\":\"staging\"")
    error_message = "O ambiente do Sentry é o nome do ambiente."
  }
}

run "sentry_dsn_invalido" {
  command = plan

  variables {
    sentry_dsn_api = "chave@sentry"
  }

  expect_failures = [var.sentry_dsn_api]
}
