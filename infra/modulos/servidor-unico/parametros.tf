# Configuração que o servidor lê a cada deploy, no Parameter Store do SSM (sem custo, ao contrário
# do Secrets Manager):
# - config: escrito pelo Terraform (bucket, região, endereço público, logs, Sentry).
# - app: as chaves que o humano preenche (JWT, Stripe, IA, e-mail...), em JSON, cifrado. O
#   Terraform só cria; o valor muda pelo `aws ssm put-parameter` (infra/README.md).

resource "aws_ssm_parameter" "config" {
  name        = local.parametro_config
  description = "Configuracao publica do ${local.nome} (Terraform)"
  type        = "String"
  value = jsonencode({
    NODE_ENV                = "production"
    LOG_LEVEL               = "info"
    S3_BUCKET               = aws_s3_bucket.arquivos.bucket
    AWS_REGION              = local.regiao
    API_URL_PUBLICA         = "https://${aws_cloudfront_distribution.principal.domain_name}"
    ALERTAS_TECNICOS_EMAILS = join(",", var.emails_alertas)
    METRICAS_NAMESPACE      = local.namespace_metricas
    SENTRY_AMBIENTE         = var.ambiente
    SENTRY_DSN_API          = var.sentry_dsn_api
    SENTRY_DSN_WORKER       = var.sentry_dsn_worker
    LOG_API                 = aws_cloudwatch_log_group.api.name
    LOG_WORKER              = aws_cloudwatch_log_group.worker.name
    REPOSITORIO             = aws_ecr_repository.api.repository_url
  })
}

resource "aws_ssm_parameter" "app" {
  name        = local.parametro_app
  description = "Chaves da aplicacao do ${local.nome} (JSON), preenchidas a mao"
  type        = "SecureString"
  value       = "{}"

  lifecycle {
    # O valor é do humano: o Terraform não volta para o `{}`.
    ignore_changes = [value]
  }
}
