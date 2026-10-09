# Papel que o workflow de deploy do GitHub assume por OIDC (sem chave de acesso guardada no GitHub).
# Só o job com `environment: <ambiente>` do repositório configurado consegue assumir.

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

  statement {
    sid       = "RodaMigracao"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${local.regiao}:${local.conta}:task-definition/${aws_ecs_task_definition.api.family}:*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.principal.arn]
    }
  }

  statement {
    sid       = "AcompanhaTarefas"
    actions   = ["ecs:DescribeTasks"]
    resources = ["arn:aws:ecs:${local.regiao}:${local.conta}:task/${aws_ecs_cluster.principal.name}/*"]
  }

  statement {
    sid = "AtualizaServicos"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = [
      aws_ecs_service.api.id,
      aws_ecs_service.worker.id,
    ]
  }

  statement {
    sid     = "EntregaPapeisAsTarefas"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.execucao.arn,
      aws_iam_role.tarefa.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "LeLogDaMigracao"
    actions   = ["logs:GetLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:log-stream:*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
