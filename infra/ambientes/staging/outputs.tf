output "endereco" {
  description = "Endereço de staging: o painel admin na raiz e a API em /v1."
  value       = module.servidor.endereco
}

output "servidor" {
  description = "ID do servidor (acesso: aws ssm start-session --target <id>)."
  value       = module.servidor.servidor
}

output "repositorio_imagem" {
  description = "Repositório ECR da imagem da API."
  value       = module.servidor.repositorio_imagem
}

output "bucket_arquivos" {
  description = "Bucket dos arquivos dos usuários."
  value       = module.servidor.bucket_arquivos
}

output "parametro_app" {
  description = "Parâmetro do SSM onde entram as chaves da aplicação."
  value       = module.servidor.parametro_app
}

output "comandos_github" {
  description = "Comandos para gravar as variáveis do deploy no GitHub."
  value       = module.servidor.comandos_github
}
