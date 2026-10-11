# Domínio do ambiente (T-015, docs/arquitetura/12): zona no Route 53, certificados do ACM validados
# por DNS e os nomes api.<dominio> (ALB) e admin.<dominio> (CloudFront). Sem `dominio`, nada daqui
# é criado.
#
# A zona é do domínio do ambiente (ex.: staging.monitorizze.com.br): os servidores de nome dela
# (saída `servidores_dns`) entram como registros NS no DNS do domínio pai. Enquanto isso não for
# feito, o ACM não valida os certificados (infra/README.md).

locals {
  dominio_api   = local.https ? "api.${var.dominio}" : null
  dominio_admin = local.https ? "admin.${var.dominio}" : null
}

resource "aws_route53_zone" "principal" {
  count = local.https ? 1 : 0

  name    = var.dominio
  comment = "Mony ${var.ambiente}"
}

resource "aws_acm_certificate" "api" {
  count = local.https ? 1 : 0

  domain_name       = local.dominio_api
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "admin" {
  count    = local.https ? 1 : 0
  provider = aws.us_east_1

  domain_name       = local.dominio_admin
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  # O registro de validação de cada certificado (cada um tem um nome só). As chaves são fixas,
  # para o plano saber quantos registros cria antes de o ACM responder.
  opcoes_validacao = {
    for nome, certificados in { api = aws_acm_certificate.api, admin = aws_acm_certificate.admin } :
    nome => tolist(certificados[0].domain_validation_options)[0] if length(certificados) > 0
  }
}

resource "aws_route53_record" "validacao" {
  for_each = local.https ? toset(["api", "admin"]) : toset([])

  zone_id         = aws_route53_zone.principal[0].zone_id
  name            = local.opcoes_validacao[each.key].resource_record_name
  type            = local.opcoes_validacao[each.key].resource_record_type
  records         = [local.opcoes_validacao[each.key].resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api" {
  count = local.https ? 1 : 0

  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [aws_route53_record.validacao["api"].fqdn]
}

resource "aws_acm_certificate_validation" "admin" {
  count    = local.https ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.admin[0].arn
  validation_record_fqdns = [aws_route53_record.validacao["admin"].fqdn]
}

resource "aws_route53_record" "api" {
  count = local.https ? 1 : 0

  zone_id = aws_route53_zone.principal[0].zone_id
  name    = local.dominio_api
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "admin" {
  for_each = local.https ? toset(["A", "AAAA"]) : toset([])

  zone_id = aws_route53_zone.principal[0].zone_id
  name    = local.dominio_admin
  type    = each.key

  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}
