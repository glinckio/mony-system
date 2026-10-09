# PostgreSQL no RDS (docs/arquitetura/12): sub-redes privadas, criptografado, com backup e PITR.
# A senha é gerada na hora do apply e vai direto para o RDS e para o Secrets Manager por argumentos
# "write-only": não fica no estado do Terraform. Para trocar, aumente `versao_senha_banco`.

ephemeral "random_password" "banco" {
  length  = 40
  special = false
}

resource "aws_db_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.privada[*].id
}

resource "aws_db_instance" "principal" {
  identifier     = local.nome
  engine         = "postgres"
  engine_version = var.banco_versao
  instance_class = var.banco_classe

  allocated_storage     = var.banco_armazenamento_gb
  max_allocated_storage = var.banco_armazenamento_gb * 5
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name             = "mony"
  username            = "mony"
  password_wo         = ephemeral.random_password.banco.result
  password_wo_version = var.versao_senha_banco

  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.banco.id]
  publicly_accessible    = false
  multi_az               = var.banco_multi_az

  # Horários em UTC: 03h às 04h e domingo 04h30 às 05h30 em Brasília.
  backup_retention_period = var.banco_backup_dias
  backup_window           = "06:00-07:00"
  maintenance_window      = "sun:07:30-sun:08:30"
  copy_tags_to_snapshot   = true

  auto_minor_version_upgrade = true
  deletion_protection        = var.banco_protecao_exclusao
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.nome}-final"
}
