# Painel admin (docs/arquitetura/13): build estático do Vite num bucket privado, servido pelo
# CloudFront. O CloudFront também repassa /v1/* para o ALB, então o painel chama a API no próprio
# domínio, sem CORS (build com VITE_API_URL vazio, como em desenvolvimento).

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

resource "aws_cloudfront_distribution" "admin" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "Painel admin do Mony (${var.ambiente})"
  default_root_object = "index.html"
  # Só a classe completa tem pontos de presença na América do Sul.
  price_class = "PriceClass_All"
  aliases     = local.https ? [local.dominio_admin] : []

  origin {
    origin_id                = "painel"
    domain_name              = aws_s3_bucket.admin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.admin.id
  }

  origin {
    origin_id   = "api"
    domain_name = local.https ? local.dominio_api : aws_lb.api.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = local.https ? "https-only" : "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
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
    cloudfront_default_certificate = local.https ? null : true
    acm_certificate_arn            = one(aws_acm_certificate_validation.admin[*].certificate_arn)
    ssl_support_method             = local.https ? "sni-only" : null
    minimum_protocol_version       = local.https ? "TLSv1.2_2021" : null
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
      values   = [aws_cloudfront_distribution.admin.arn]
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
