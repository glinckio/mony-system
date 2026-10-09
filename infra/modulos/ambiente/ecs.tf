# Cluster ECS Fargate com os serviços `api` (atrás do ALB) e `worker` (filas e rotinas), na mesma
# imagem (docs/arquitetura/02, ADR-002). As tarefas usam a tag do ambiente; o deploy move a tag e
# força um novo deploy dos serviços.

resource "aws_ecs_cluster" "principal" {
  name = local.nome

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/mony/${var.ambiente}/api"
  retention_in_days = var.retencao_logs_dias
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/mony/${var.ambiente}/worker"
  retention_in_days = var.retencao_logs_dias
}

# Papéis: "execução" é do ECS (baixar imagem, ler segredos, mandar logs); "tarefa" é do código.

data "aws_iam_policy_document" "assumir_ecs" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execucao" {
  name               = "${local.nome}-ecs-execucao"
  assume_role_policy = data.aws_iam_policy_document.assumir_ecs.json
}

resource "aws_iam_role_policy_attachment" "execucao" {
  role       = aws_iam_role.execucao.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execucao_segredos" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.infra.arn,
      aws_secretsmanager_secret.app.arn,
    ]
  }
}

resource "aws_iam_role_policy" "execucao_segredos" {
  name   = "segredos"
  role   = aws_iam_role.execucao.id
  policy = data.aws_iam_policy_document.execucao_segredos.json
}

resource "aws_iam_role" "tarefa" {
  name               = "${local.nome}-ecs-tarefa"
  assume_role_policy = data.aws_iam_policy_document.assumir_ecs.json
}

data "aws_iam_policy_document" "tarefa_arquivos" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.arquivos.arn]
  }

  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.arquivos.arn}/*"]
  }
}

resource "aws_iam_role_policy" "tarefa_arquivos" {
  name   = "arquivos"
  role   = aws_iam_role.tarefa.id
  policy = data.aws_iam_policy_document.tarefa_arquivos.json
}

locals {
  imagem = "${aws_ecr_repository.api.repository_url}:${var.ambiente}"

  # Valores públicos. Segredos entram por `segredos_container`.
  ambiente_container = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.principal.primary_endpoint_address}:6379" },
    { name = "S3_BUCKET", value = aws_s3_bucket.arquivos.bucket },
    { name = "AWS_REGION", value = local.regiao },
  ]

  segredos_container = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.infra.arn}:DATABASE_URL::" },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nome}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name         = "api"
      image        = local.imagem
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment  = local.ambiente_container
      secrets      = local.segredos_container
      stopTimeout  = 30
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = local.regiao
          awslogs-stream-prefix = "api"
        }
      }
    },
  ])

  depends_on = [aws_secretsmanager_secret_version.infra]
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.nome}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.tarefa.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name        = "worker"
      image       = local.imagem
      essential   = true
      command     = ["node", "dist/worker.js"]
      environment = local.ambiente_container
      secrets     = local.segredos_container
      stopTimeout = 60
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = local.regiao
          awslogs-stream-prefix = "worker"
        }
      }
    },
  ])

  depends_on = [aws_secretsmanager_secret_version.infra]
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_minimo
  launch_type     = "FARGATE"
  propagate_tags  = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.privada[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Deploy que não fica saudável volta sozinho para a versão anterior.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    # O auto scaling muda a quantidade de tarefas.
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.http_encaminha,
    aws_lb_listener.https,
  ]
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_quantidade
  launch_type     = "FARGATE"
  propagate_tags  = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.privada[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

# Auto scaling da API pela CPU (docs/arquitetura/12). A latência entra com o monitoramento (T-142).

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_minimo
  max_capacity       = var.api_maximo
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.nome}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
