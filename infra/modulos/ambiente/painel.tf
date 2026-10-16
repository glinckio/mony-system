# Métricas (docs/arquitetura/12, T-142d): um painel do CloudWatch com a API (ALB), as filas e o
# custo de IA, e consultas salvas do Logs Insights para tempo de resposta e falhas por rota.
#
# As métricas das filas e do custo vêm do log do worker no Embedded Metric Format (rotina
# `monitorar`, a cada 5 minutos). As de rota saem do log de cada requisição da API (campo `rota`),
# sem métrica própria: uma métrica por rota custaria por mês o que o Logs Insights cobra por
# consulta.

locals {
  consulta_tempo_por_rota = <<-EOT
    fields rota, responseTime
    | filter ispresent(rota) and ispresent(responseTime)
    | stats count(*) as requisicoes, avg(responseTime) as media_ms, pct(responseTime, 95) as p95_ms, max(responseTime) as max_ms by req.method, rota
    | sort p95_ms desc
    | limit 50
  EOT

  consulta_falhas_por_rota = <<-EOT
    fields rota, res.statusCode
    | filter ispresent(rota) and res.statusCode >= 500
    | stats count(*) as erros_5xx by req.method, rota, res.statusCode
    | sort erros_5xx desc
    | limit 50
  EOT

  dimensao_alb = { LoadBalancer = aws_lb.api.arn_suffix }
}

resource "aws_cloudwatch_query_definition" "tempo_por_rota" {
  name            = "${local.nome}/tempo-de-resposta-por-rota"
  log_group_names = [aws_cloudwatch_log_group.api.name]
  query_string    = local.consulta_tempo_por_rota
}

resource "aws_cloudwatch_query_definition" "falhas_por_rota" {
  name            = "${local.nome}/falhas-por-rota"
  log_group_names = [aws_cloudwatch_log_group.api.name]
  query_string    = local.consulta_falhas_por_rota
}

resource "aws_cloudwatch_dashboard" "principal" {
  dashboard_name = local.nome

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API: tempo de resposta (ms)"
          region = local.regiao
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.dimensao_alb.LoadBalancer, { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API: requisições e 5xx"
          region = local.regiao
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.dimensao_alb.LoadBalancer, { label = "Requisições" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { label = "5xx da API", yAxis = "right" }],
            [".", "HTTPCode_ELB_5XX_Count", ".", ".", { label = "5xx do ALB", yAxis = "right" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Filas: jobs esperando"
          region = local.regiao
          view   = "timeSeries"
          period = 300
          metrics = [
            [{ expression = "SEARCH('{${local.namespace_metricas},Fila} MetricName=\"Aguardando\"', 'Maximum', 300)", id = "aguardando" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Filas: jobs que esgotaram as tentativas"
          region = local.regiao
          view   = "timeSeries"
          period = 300
          metrics = [
            [{ expression = "SEARCH('{${local.namespace_metricas},Fila} MetricName=\"Falhos\"', 'Maximum', 300)", id = "falhos" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Custo de IA por dia (centavos de dólar)"
          region = local.regiao
          view   = "bar"
          stat   = "Maximum"
          period = 86400
          metrics = [
            [local.namespace_metricas, "CustoIaHojeCentavosDolar", { label = "Custo do dia" }],
          ]
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 18
        width  = 24
        height = 8
        properties = {
          title  = "Tempo de resposta por rota"
          region = local.regiao
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.api.name}' | ${replace(trimspace(local.consulta_tempo_por_rota), "\n", " ")}"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 26
        width  = 24
        height = 6
        properties = {
          title  = "Falhas 5xx por rota"
          region = local.regiao
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.api.name}' | ${replace(trimspace(local.consulta_falhas_por_rota), "\n", " ")}"
        }
      },
    ]
  })
}
