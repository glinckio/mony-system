# Grupos de segurança: internet → ALB → API; API e worker → banco e cache. Nada mais entra.

resource "aws_security_group" "alb" {
  name        = "${local.nome}-alb"
  description = "ALB publico da API"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(["0.0.0.0/0", "::/0"])

  security_group_id = aws_security_group.alb.id
  description       = "HTTP (redireciona para HTTPS quando ha certificado)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = each.value == "0.0.0.0/0" ? each.value : null
  cidr_ipv6         = each.value == "::/0" ? each.value : null
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = local.https ? toset(["0.0.0.0/0", "::/0"]) : toset([])

  security_group_id = aws_security_group.alb.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value == "0.0.0.0/0" ? each.value : null
  cidr_ipv6         = each.value == "::/0" ? each.value : null
}

resource "aws_vpc_security_group_egress_rule" "alb_para_api" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Encaminha para a API"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.api.id
}

resource "aws_security_group" "api" {
  name        = "${local.nome}-api"
  description = "Tarefas da API e das migracoes"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "api_do_alb" {
  security_group_id            = aws_security_group.api.id
  description                  = "Requisicoes vindas do ALB"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group" "worker" {
  name        = "${local.nome}-worker"
  description = "Tarefas do worker (sem entrada)"
  vpc_id      = aws_vpc.principal.id
}

# API e worker saem para qualquer destino: banco, cache, S3, Secrets Manager e APIs externas.
resource "aws_vpc_security_group_egress_rule" "containers" {
  for_each = {
    api    = aws_security_group.api.id
    worker = aws_security_group.worker.id
  }

  security_group_id = each.value
  description       = "Saida liberada"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "banco" {
  name        = "${local.nome}-banco"
  description = "PostgreSQL, so para API e worker"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_security_group" "cache" {
  name        = "${local.nome}-cache"
  description = "Valkey, so para API e worker"
  vpc_id      = aws_vpc.principal.id
}

locals {
  # Quem pode falar com o banco e com o cache.
  origens_internas = {
    api    = aws_security_group.api.id
    worker = aws_security_group.worker.id
  }
}

resource "aws_vpc_security_group_ingress_rule" "banco" {
  for_each = local.origens_internas

  security_group_id            = aws_security_group.banco.id
  description                  = "PostgreSQL a partir do ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = each.value
}

resource "aws_vpc_security_group_ingress_rule" "cache" {
  for_each = local.origens_internas

  security_group_id            = aws_security_group.cache.id
  description                  = "Valkey a partir do ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = each.value
}
