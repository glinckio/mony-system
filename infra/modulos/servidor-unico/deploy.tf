# Papel que os workflows de deploy do GitHub assumem por OIDC (sem chave guardada no GitHub). Só o
# job com `environment: <ambiente>` do repositório configurado consegue assumir. O provedor OIDC é
# o da conta, criado no `infra/bootstrap`.

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "assumir_deploy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repositorio_github}:environment:${var.ambiente}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.nome}-deploy-github"
  assume_role_policy   = data.aws_iam_policy_document.assumir_deploy.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "LoginNoEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PublicaImagem"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.api.arn]
  }

  # O deploy roda o `infra/servidor/atualizar.sh` no servidor pelo Run Command.
  statement {
    sid     = "AtualizaServidor"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.servidor.arn,
      "arn:aws:ssm:${local.regiao}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "AcompanhaComando"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }

  statement {
    sid       = "ListaBucketDoAdmin"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.admin.arn]
  }

  statement {
    sid       = "PublicaAdmin"
    actions   = ["s3:DeleteObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.admin.arn}/*"]
  }

  statement {
    sid       = "InvalidaCacheDoAdmin"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.principal.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
