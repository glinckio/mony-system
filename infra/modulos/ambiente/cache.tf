# Valkey no ElastiCache: filas do BullMQ e cache (docs/arquitetura/12). O ElastiCache não oferece o
# Redis 8 do ambiente local; o Valkey 8 é compatível com o protocolo do Redis que o BullMQ usa.
# `noeviction` porque o BullMQ não pode perder chaves de fila por falta de memória.

resource "aws_elasticache_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.privada[*].id
}

resource "aws_elasticache_parameter_group" "principal" {
  name   = "${local.nome}-valkey8"
  family = "valkey8"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "principal" {
  replication_group_id = local.nome
  description          = "Filas BullMQ e cache do Mony (${var.ambiente})"

  engine               = "valkey"
  engine_version       = var.cache_versao
  node_type            = var.cache_classe
  num_cache_clusters   = 1 + var.cache_replicas
  parameter_group_name = aws_elasticache_parameter_group.principal.name
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.principal.name
  security_group_ids = [aws_security_group.cache.id]

  automatic_failover_enabled = var.cache_replicas > 0
  multi_az_enabled           = var.cache_replicas > 0

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "sun:08:30-sun:09:30"
}
