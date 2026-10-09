# Bucket privado dos arquivos dos usuários (anexos, fotos, áudios, exportações), acessado só por
# URL assinada gerada pela API (docs/arquitetura/02 e 12).

resource "aws_s3_bucket" "arquivos" {
  bucket = "${local.nome}-arquivos-${local.conta}"
}

resource "aws_s3_bucket_public_access_block" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id

  rule {
    id     = "exportacoes-expiram"
    status = "Enabled"

    filter {
      prefix = "exportacoes/"
    }

    expiration {
      days = var.dias_exportacoes
    }
  }

  rule {
    id     = "uploads-incompletos"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }
}

data "aws_iam_policy_document" "arquivos_so_tls" {
  statement {
    sid     = "SoTls"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.arquivos.arn,
      "${aws_s3_bucket.arquivos.arn}/*",
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

resource "aws_s3_bucket_policy" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  policy = data.aws_iam_policy_document.arquivos_so_tls.json
}
