output "endereco_api" {
  description = "Endereço público do ALB (até existir o domínio)."
  value       = "${local.https ? "https" : "http"}://${aws_lb.api.dns_name}"
}

output "repositorio_imagem" {
  description = "Repositório ECR da imagem da API."
  value       = aws_ecr_repository.api.repository_url
}

output "bucket_arquivos" {
  description = "Bucket dos arquivos dos usuários."
  value       = aws_s3_bucket.arquivos.bucket
}

output "segredo_app" {
  description = "Segredo onde entram as chaves da aplicação (JWT, Stripe, IA...)."
  value       = aws_secretsmanager_secret.app.name
}

locals {
  # Variáveis do repositório no GitHub que o workflow de deploy lê (.github/workflows/deploy-*.yml).
  variaveis_github = {
    "${upper(var.ambiente)}_AWS_REGIAO"       = local.regiao
    "${upper(var.ambiente)}_AWS_PAPEL_DEPLOY" = aws_iam_role.deploy.arn
    "${upper(var.ambiente)}_ECR_REPOSITORIO"  = aws_ecr_repository.api.repository_url
    "${upper(var.ambiente)}_ECS_CLUSTER"      = aws_ecs_cluster.principal.name
    "${upper(var.ambiente)}_TAREFA_API"       = aws_ecs_task_definition.api.family
    "${upper(var.ambiente)}_SUBREDES"         = join(",", aws_subnet.privada[*].id)
    "${upper(var.ambiente)}_GRUPO_API"        = aws_security_group.api.id
    "${upper(var.ambiente)}_LOG_API"          = aws_cloudwatch_log_group.api.name
  }
}

output "variaveis_github" {
  description = "Variáveis do repositório que o workflow de deploy usa."
  value       = local.variaveis_github
}

output "comandos_github" {
  description = "Comandos para gravar as variáveis do deploy no GitHub (rodar na raiz do repositório)."
  value = join("\n", [
    for nome, valor in local.variaveis_github : "gh variable set ${nome} --body '${valor}'"
  ])
}
