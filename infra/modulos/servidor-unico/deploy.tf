# Papel que os workflows de deploy do GitHub assumem por OIDC (sem chave guardada no GitHub). Só o
# job com `environment: <ambiente>` do repositório configurado consegue assumir. O provedor OIDC é
# o da conta, criado no `infra/bootstrap`.

locals {
  # Quem pode assumir o papel: o job do ambiente, no formato com os nomes e, com `ids_github`, no
  # formato imutável do GitHub (com os IDs, que não mudam se o nome do dono ou do repositório for
  # reaproveitado por outra pessoa).
  partes_repositorio = split("/", var.repositorio_github)
  sujeitos_deploy = concat(
    ["repo:${var.repositorio_github}:environment:${var.ambiente}"],
    var.ids_github == null ? [] : [
      "repo:${local.partes_repositorio[0]}@${var.ids_github.dono}/${local.partes_repositorio[1]}@${var.ids_github.repositorio}:environment:${var.ambiente}",
    ],
  )
}

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
      values   = local.sujeitos_deploy
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
