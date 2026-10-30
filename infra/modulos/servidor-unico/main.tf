# Um ambiente do Mony num servidor só (T-156, docs/arquitetura/12): para gastar o mínimo enquanto o
# uso é pequeno (staging). Um EC2 roda a API, o worker, o Postgres e o Valkey em containers; o
# CloudFront fica na frente, com HTTPS sem domínio, e serve também o painel admin. Backup por
# snapshot diário do disco. A produção usa o módulo `ambiente` (ECS, RDS, ElastiCache).

data "aws_caller_identity" "atual" {}

data "aws_region" "atual" {}

locals {
  nome   = "mony-${var.ambiente}"
  conta  = data.aws_caller_identity.atual.account_id
  regiao = data.aws_region.atual.region

  # Métricas tiradas dos logs do worker (EMF e filtros).
  namespace_metricas = "Mony/${var.ambiente}"

  # Parâmetros do SSM que o servidor lê a cada deploy (infra/servidor/atualizar.sh).
  parametro_config = "/mony/${var.ambiente}/config"
  parametro_app    = "/mony/${var.ambiente}/app"
}
