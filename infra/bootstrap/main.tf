# Recursos criados uma vez por conta da AWS, antes de qualquer ambiente:
# - bucket do estado do Terraform (versionado, criptografado, privado);
# - provedor OIDC do GitHub, para o CI assumir papéis sem chave de acesso guardada.
# O estado deste diretório fica local (terraform.tfstate, fora do Git). Ver infra/README.md.

terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }
}

provider "aws" {
  region = var.regiao

  default_tags {
    tags = {
      Projeto    = "mony"
      Pilha      = "bootstrap"
      Gerenciado = "terraform"
    }
  }
}

data "aws_caller_identity" "atual" {}

resource "aws_s3_bucket" "estado" {
  bucket = "mony-terraform-estado-${data.aws_caller_identity.atual.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "estado" {
  bucket = aws_s3_bucket.estado.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "estado_so_tls" {
  statement {
    sid     = "SoTls"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.estado.arn,
      "${aws_s3_bucket.estado.arn}/*",
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

resource "aws_s3_bucket_policy" "estado" {
  bucket = aws_s3_bucket.estado.id
  policy = data.aws_iam_policy_document.estado_so_tls.json
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
