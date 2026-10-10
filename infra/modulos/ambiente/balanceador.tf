# ALB público na frente da API. Com certificado: HTTPS (TLS 1.2+) e HTTP redirecionando para HTTPS.
# Sem certificado (antes do domínio existir): só HTTP, para testes de staging.

resource "aws_lb" "api" {
  name               = "${local.nome}-api"
  load_balancer_type = "application"
  internal           = false
  subnets            = aws_subnet.publica[*].id
  security_groups    = [aws_security_group.alb.id]

  drop_invalid_header_fields = true
  # Respostas em streaming da Mony (SSE) ficam abertas mais que o padrão de 60 s.
  idle_timeout = 120
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.nome}-api"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30

  health_check {
    path                = "/v1/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http_redireciona" {
  count = local.https ? 1 : 0

  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "http_encaminha" {
  count = local.https ? 0 : 1

  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "https" {
  count = local.https ? 1 : 0

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificado_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
