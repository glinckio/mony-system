# Alarmes para o responsável técnico (docs/arquitetura/12, T-142b): o que só a AWS vê (ALB, 5xx,
# backup) e o batimento da rotina `monitorar` do worker (T-142a). Todos avisam no tópico SNS, que
# manda e-mail para `emails_alertas` (cada endereço confirma a assinatura no primeiro e-mail).

resource "aws_sns_topic" "alertas" {
  name = "${local.nome}-alertas"
}

resource "aws_sns_topic_subscription" "alertas_email" {
  for_each = toset(var.emails_alertas)

  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  acoes_alarme = [aws_sns_topic.alertas.arn]
  # Métricas tiradas dos logs do worker e dos eventos de backup.
  namespace_metricas = "Mony/${var.ambiente}"
}

# API fora do ar: nenhuma tarefa passando no health check do ALB por 2 minutos.
resource "aws_cloudwatch_metric_alarm" "api_fora_do_ar" {
  alarm_name          = "${local.nome}-api-fora-do-ar"
  alarm_description   = "Nenhuma tarefa da API saudável no ALB (health check /v1/health)."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = local.acoes_alarme
  ok_actions          = local.acoes_alarme

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

# 5xx (da API e do próprio ALB) acima de 1% das requisições em 5 minutos. Com menos de 20
# requisições no período, não alarma: um erro em 3 requisições não é tendência.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.nome}-api-5xx"
  alarm_description   = "Respostas 5xx acima de 1% das requisições em 5 minutos."
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.acoes_alarme
  ok_actions          = local.acoes_alarme

  metric_query {
    id          = "taxa"
    expression  = "IF(requisicoes >= 20, 100 * (FILL(erros_api, 0) + FILL(erros_alb, 0)) / requisicoes, 0)"
    label       = "Porcentagem de 5xx"
    return_data = true
  }

  metric_query {
    id = "requisicoes"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      stat        = "Sum"
      period      = 300
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }

  metric_query {
    id = "erros_api"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      stat        = "Sum"
      period      = 300
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }

  metric_query {
    id = "erros_alb"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      stat        = "Sum"
      period      = 300
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }
}

# Batimento da rotina `monitorar` (a cada 5 minutos). Sem ele por 15 minutos, o worker, a fila
# `rotinas` ou o Redis pararam, e os alertas da T-142a também.
resource "aws_cloudwatch_log_metric_filter" "monitoramento_executado" {
  name           = "${local.nome}-monitoramento-executado"
  log_group_name = aws_cloudwatch_log_group.worker.name
  pattern        = "{ $.evento = \"monitoramento_executado\" }"

  metric_transformation {
    name      = "MonitoramentoExecutado"
    namespace = local.namespace_metricas
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "monitoramento_parado" {
  alarm_name          = "${local.nome}-monitoramento-parado"
  alarm_description   = "A rotina monitorar do worker não rodou em 15 minutos (worker, fila rotinas ou Redis parados)."
  namespace           = local.namespace_metricas
  metric_name         = aws_cloudwatch_log_metric_filter.monitoramento_executado.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = local.acoes_alarme
  ok_actions          = local.acoes_alarme
}

# Alerta técnico que não saiu por e-mail (provedor fora ou sem configurar): o SNS avisa no lugar.
resource "aws_cloudwatch_log_metric_filter" "alerta_sem_email" {
  name           = "${local.nome}-alerta-tecnico-sem-email"
  log_group_name = aws_cloudwatch_log_group.worker.name
  pattern        = "{ $.evento = \"alerta_tecnico_sem_email\" }"

  metric_transformation {
    name      = "AlertaTecnicoSemEmail"
    namespace = local.namespace_metricas
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "alerta_sem_email" {
  alarm_name          = "${local.nome}-alerta-tecnico-sem-email"
  alarm_description   = "Um alerta técnico do worker não saiu por e-mail. Veja o log do worker (evento alerta_tecnico)."
  namespace           = local.namespace_metricas
  metric_name         = aws_cloudwatch_log_metric_filter.alerta_sem_email.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.acoes_alarme
}

# Backup diário: o RDS publica RDS-EVENT-0002 ("Finished DB instance backup") ao fim de cada
# backup automático. A regra grava o evento num grupo de logs, o filtro conta, e o alarme dispara
# quando passa um dia sem nenhum.
resource "aws_cloudwatch_log_group" "eventos_backup" {
  name              = "/aws/events/${local.nome}-backup"
  retention_in_days = var.retencao_logs_dias
}

data "aws_iam_policy_document" "eventos_backup" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.eventos_backup.arn}:*"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "delivery.logs.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "eventos_backup" {
  policy_name     = "${local.nome}-eventos-backup"
  policy_document = data.aws_iam_policy_document.eventos_backup.json
}

resource "aws_cloudwatch_event_rule" "backup_concluido" {
  name        = "${local.nome}-backup-concluido"
  description = "Backup automático do banco concluído."

  event_pattern = jsonencode({
    source      = ["aws.rds"]
    detail-type = ["RDS DB Instance Event"]
    detail = {
      SourceIdentifier = [aws_db_instance.principal.identifier]
      EventID          = ["RDS-EVENT-0002"]
    }
  })
}

resource "aws_cloudwatch_event_target" "backup_concluido" {
  rule = aws_cloudwatch_event_rule.backup_concluido.name
  arn  = aws_cloudwatch_log_group.eventos_backup.arn
}

resource "aws_cloudwatch_log_metric_filter" "backup_concluido" {
  name           = "${local.nome}-backup-concluido"
  log_group_name = aws_cloudwatch_log_group.eventos_backup.name
  pattern        = ""

  metric_transformation {
    name      = "BackupConcluido"
    namespace = local.namespace_metricas
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "backup_nao_encontrado" {
  alarm_name          = "${local.nome}-backup-nao-encontrado"
  alarm_description   = "Nenhum backup automático do banco concluído nas últimas 24 horas."
  namespace           = local.namespace_metricas
  metric_name         = aws_cloudwatch_log_metric_filter.backup_concluido.metric_transformation[0].name
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = local.acoes_alarme
  ok_actions          = local.acoes_alarme
}
