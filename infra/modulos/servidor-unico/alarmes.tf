# Logs e alarmes (T-142, adaptados ao servidor único). Os containers da API e do worker mandam o
# log para o CloudWatch (driver awslogs); o Postgres e o Valkey ficam no log local do Docker.
# Os alarmes avisam no tópico SNS, que manda e-mail para `emails_alertas`.

resource "aws_cloudwatch_log_group" "api" {
  name              = "/mony/${var.ambiente}/api"
  retention_in_days = var.retencao_logs_dias
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/mony/${var.ambiente}/worker"
  retention_in_days = var.retencao_logs_dias
}

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
}

# Falha do hardware da AWS: o servidor volta sozinho em outro hospedeiro, com o mesmo disco e IP.
resource "aws_cloudwatch_metric_alarm" "servidor_sistema" {
  alarm_name          = "${local.nome}-servidor-sistema"
  alarm_description   = "Falha na verificação de sistema do EC2: recupera o servidor em outro hospedeiro."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  alarm_actions       = concat(["arn:aws:automate:${local.regiao}:ec2:recover"], local.acoes_alarme)
  ok_actions          = local.acoes_alarme
  dimensions          = { InstanceId = aws_instance.servidor.id }
}

# O sistema do servidor parou de responder (memória esgotada, kernel travado): reinicia. Os
# containers voltam sozinhos (`--restart unless-stopped`).
resource "aws_cloudwatch_metric_alarm" "servidor_instancia" {
  alarm_name          = "${local.nome}-servidor-instancia"
  alarm_description   = "Falha na verificação da instância do EC2 por 3 minutos: reinicia o servidor."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  alarm_actions       = concat(["arn:aws:automate:${local.regiao}:ec2:reboot"], local.acoes_alarme)
  ok_actions          = local.acoes_alarme
  dimensions          = { InstanceId = aws_instance.servidor.id }
}

# Batimento da rotina `monitorar` do worker (a cada 5 minutos). Sem ele por 15 minutos, o worker,
# a fila `rotinas`, o Valkey ou o servidor pararam, e os alertas da T-142a também.
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
  alarm_description   = "A rotina monitorar do worker não rodou em 15 minutos (worker, Valkey ou servidor parados)."
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

# Consultas salvas do Logs Insights (T-142d): tempo de resposta e falhas por rota, a partir do log
# de cada requisição da API. Sem custo até alguém rodar.
resource "aws_cloudwatch_query_definition" "tempo_por_rota" {
  name            = "${local.nome}/tempo-de-resposta-por-rota"
  log_group_names = [aws_cloudwatch_log_group.api.name]
  query_string    = <<-EOT
    fields rota, responseTime
    | filter ispresent(rota) and ispresent(responseTime)
    | stats count(*) as requisicoes, avg(responseTime) as media_ms, pct(responseTime, 95) as p95_ms, max(responseTime) as max_ms by req.method, rota
    | sort p95_ms desc
    | limit 50
  EOT
}

resource "aws_cloudwatch_query_definition" "falhas_por_rota" {
  name            = "${local.nome}/falhas-por-rota"
  log_group_names = [aws_cloudwatch_log_group.api.name]
  query_string    = <<-EOT
    fields rota, res.statusCode
    | filter ispresent(rota) and res.statusCode >= 500
    | stats count(*) as erros_5xx by req.method, rota, res.statusCode
    | sort erros_5xx desc
    | limit 50
  EOT
}
