# Um CloudFront só para o ambiente (T-156): o painel admin (build estático do Vite num bucket
# privado) e a API em `/v1/*`, que vai para o servidor pela porta 80. O HTTPS é o do próprio
# CloudFront (`*.cloudfront.net`), sem domínio nem certificado. O app e o painel usam o mesmo
# endereço; o painel chama a API sem CORS (build com VITE_API_URL vazio).

resource "aws_s3_bucket" "admin" {
  bucket = "${local.nome}-admin-${local.conta}"
}

resource "aws_s3_bucket_public_access_block" "admin" {
  bucket = aws_s3_bucket.admin.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "admin" {
  bucket = aws_s3_bucket.admin.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "admin" {
  name                              = "${local.nome}-admin"
  description                       = "CloudFront le o bucket do painel admin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Rotas do painel (TanStack Router): caminho sem extensão é rota do app e recebe o index.html. Só
# no comportamento do painel; o /v1/* vai direto para a API, com os erros dela.
resource "aws_cloudfront_function" "rotas_admin" {
  name    = "${local.nome}-admin-rotas"
  runtime = "cloudfront-js-2.0"
  comment = "Rotas do painel admin vao para o index.html"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var ultimo = request.uri.split('/').pop();
      if (ultimo.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

data "aws_cloudfront_cache_policy" "otimizado" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "sem_cache" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "tudo_menos_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "seguranca" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "principal" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "Mony (${var.ambiente}): painel admin e API"
  default_root_object = "index.html"
  # Só a classe completa tem pontos de presença na América do Sul. O nível sempre gratuito (1 TB e
  # 10 milhões de requisições por mês) vale para todas.
  price_class = "PriceClass_All"

  origin {
    origin_id                = "painel"
    domain_name              = aws_s3_bucket.admin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.admin.id
  }

  origin {
    origin_id   = "api"
    domain_name = aws_eip.servidor.public_dns

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # A Mony responde em SSE: o máximo sem pedir aumento de cota entre um pedaço e outro.
      origin_read_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id           = "painel"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.otimizado.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.seguranca.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rotas_admin.arn
    }
  }

  # O CloudFront acrescenta o IP de quem chamou no fim do X-Forwarded-For: é o que a API usa nos
  # limites por IP (um salto de proxy, `configurar-app.ts`).
  ordered_cache_behavior {
    path_pattern             = "/v1/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.sem_cache.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.tudo_menos_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "admin" {
  statement {
    sid       = "CloudFrontLe"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.admin.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.principal.arn]
    }
  }

  statement {
    sid     = "SoTls"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.admin.arn,
      "${aws_s3_bucket.admin.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "admin" {
  bucket = aws_s3_bucket.admin.id
  policy = data.aws_iam_policy_document.admin.json

  depends_on = [aws_s3_bucket_public_access_block.admin]
}
