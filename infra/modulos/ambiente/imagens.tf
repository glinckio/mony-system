# Repositório da imagem da API (a mesma imagem roda a API, o worker e as migrações).
# O deploy publica a tag do commit e move a tag do ambiente (ex.: `staging`), que o ECS usa.

resource "aws_ecr_repository" "api" {
  name                 = "${local.nome}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Guarda as 30 imagens mais recentes"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 30
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}
