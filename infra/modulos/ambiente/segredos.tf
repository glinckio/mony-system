# Segredos no Secrets Manager (docs/arquitetura/11), lidos pelo ECS na subida dos containers.
# - infra: escrito pelo Terraform (DATABASE_URL), sem passar pelo estado.
# - app: chaves que o humano preenche (JWT, Stripe, provedor de IA...). O Terraform só cria o
#   segredo; quando a tarefa que usa uma chave entrar, ela passa a ser lida no `ecs.tf`.

resource "aws_secretsmanager_secret" "infra" {
  name                    = "mony/${var.ambiente}/infra"
  description             = "Conexao com o banco, gerada pelo Terraform"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "infra" {
  secret_id = aws_secretsmanager_secret.infra.id
  secret_string_wo = jsonencode({
    DATABASE_URL = "postgresql://${aws_db_instance.principal.username}:${ephemeral.random_password.banco.result}@${aws_db_instance.principal.address}:${aws_db_instance.principal.port}/${aws_db_instance.principal.db_name}?sslmode=require"
  })
  secret_string_wo_version = var.versao_senha_banco
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "mony/${var.ambiente}/app"
  description             = "Chaves da aplicacao (JWT, Stripe, provedor de IA), preenchidas a mao"
  recovery_window_in_days = 7
}
