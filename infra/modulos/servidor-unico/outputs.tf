output "endereco" {
  description = "Endereço do ambiente (CloudFront): o painel admin na raiz e a API em /v1."
  value       = "https://${aws_cloudfront_distribution.principal.domain_name}"
}

output "servidor" {
  description = "ID do EC2 (acesso: aws ssm start-session --target <id>)."
  value       = aws_instance.servidor.id
}

output "repositorio_imagem" {
  description = "Repositório ECR da imagem da API."
  value       = aws_ecr_repository.api.repository_url
}

output "bucket_arquivos" {
  description = "Bucket dos arquivos dos usuários."
  value       = aws_s3_bucket.arquivos.bucket
}

output "parametro_app" {
  description = "Parâmetro do SSM (SecureString, JSON) onde entram as chaves da aplicação."
  value       = aws_ssm_parameter.app.name
}

output "topico_alertas" {
  description = "Tópico SNS dos alarmes. Outros assinantes (Slack, SMS) entram por ele."
  value       = aws_sns_topic.alertas.arn
}

locals {
  # Variáveis do repositório no GitHub que os workflows de deploy leem (.github/workflows/deploy-*.yml).
  variaveis_github = {
    "${upper(var.ambiente)}_AWS_REGIAO"       = local.regiao
    "${upper(var.ambiente)}_AWS_PAPEL_DEPLOY" = aws_iam_role.deploy.arn
    "${upper(var.ambiente)}_ECR_REPOSITORIO"  = aws_ecr_repository.api.repository_url
    "${upper(var.ambiente)}_SERVIDOR"         = aws_instance.servidor.id
    "${upper(var.ambiente)}_ADMIN_BUCKET"     = aws_s3_bucket.admin.bucket
    "${upper(var.ambiente)}_ADMIN_CLOUDFRONT" = aws_cloudfront_distribution.principal.id
  }
}

output "variaveis_github" {
  description = "Variáveis do repositório que os workflows de deploy usam."
  value       = local.variaveis_github
}

output "comandos_github" {
  description = "Comandos para gravar as variáveis do deploy no GitHub (rodar na raiz do repositório)."
  value = join("\n", [
    for nome, valor in local.variaveis_github : "gh variable set ${nome} --body '${valor}'"
  ])
}
