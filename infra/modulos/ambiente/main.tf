# Um ambiente completo do Mony na AWS (docs/arquitetura/12): rede, banco, cache, arquivos,
# segredos, imagem, balanceador, os serviços api e worker no ECS Fargate, o painel admin no
# CloudFront e, com `dominio`, a zona DNS e os certificados.

data "aws_caller_identity" "atual" {}

data "aws_region" "atual" {}

locals {
  nome   = "mony-${var.ambiente}"
  conta  = data.aws_caller_identity.atual.account_id
  regiao = data.aws_region.atual.region
  https  = var.dominio != null
}
