output "endereco_api" {
  description = "Endereço público da API de staging."
  value       = module.ambiente.endereco_api
}

output "repositorio_imagem" {
  description = "Repositório ECR da imagem da API."
  value       = module.ambiente.repositorio_imagem
}

output "bucket_arquivos" {
  description = "Bucket dos arquivos dos usuários."
  value       = module.ambiente.bucket_arquivos
}

output "segredo_app" {
  description = "Segredo onde entram as chaves da aplicação."
  value       = module.ambiente.segredo_app
}

output "comandos_github" {
  description = "Comandos para gravar as variáveis do deploy no GitHub."
  value       = module.ambiente.comandos_github
}
