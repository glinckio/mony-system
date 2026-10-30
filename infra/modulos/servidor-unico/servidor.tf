# O servidor: Amazon Linux 2023 ARM com Docker. A configuração dos containers não fica aqui: o
# deploy manda o `infra/servidor/atualizar.sh` pelo SSM a cada versão, e ele prepara o que faltar
# (Docker, swap, Postgres, Valkey), migra o banco e troca a API e o worker. Assim a AMI e o
# user_data só valem na criação, e mudar o script não recria o servidor (nem o disco com o banco).

data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_iam_policy_document" "assumir_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "servidor" {
  name               = "${local.nome}-servidor"
  assume_role_policy = data.aws_iam_policy_document.assumir_ec2.json
}

# Session Manager e Run Command (o deploy e o acesso de manutenção, sem SSH).
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.servidor.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr" {
  role       = aws_iam_role.servidor.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "servidor" {
  statement {
    sid       = "LeConfiguracao"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.config.arn, aws_ssm_parameter.app.arn]
  }

  statement {
    sid       = "ListaArquivos"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.arquivos.arn]
  }

  statement {
    sid       = "Arquivos"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.arquivos.arn}/*"]
  }

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*", "${aws_cloudwatch_log_group.worker.arn}:*"]
  }
}

resource "aws_iam_role_policy" "servidor" {
  name   = "servidor"
  role   = aws_iam_role.servidor.id
  policy = data.aws_iam_policy_document.servidor.json
}

resource "aws_iam_instance_profile" "servidor" {
  name = "${local.nome}-servidor"
  role = aws_iam_role.servidor.name
}

resource "aws_instance" "servidor" {
  ami                    = data.aws_ssm_parameter.ami.insecure_value
  instance_type          = var.tipo_instancia
  subnet_id              = aws_subnet.publica.id
  vpc_security_group_ids = [aws_security_group.servidor.id]
  iam_instance_profile   = aws_iam_instance_profile.servidor.name
  # O IP público fixo vem do Elastic IP abaixo.
  associate_public_ip_address = true

  # Os containers usam o papel do servidor (S3, logs): IMDSv2 com 2 saltos, para alcançar de
  # dentro do Docker.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.disco_gb
    encrypted             = true
    delete_on_termination = true

    # O backup diário (DLM, abaixo) acha o disco por esta etiqueta.
    tags = {
      Name   = local.nome
      Backup = local.nome
    }
  }

  # Primeira subida: Docker e swap. O resto vem do primeiro deploy (atualizar.sh), que também
  # confere estes dois.
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    dnf install -y docker jq
    systemctl enable --now docker
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
  EOT

  tags = {
    Name = local.nome
  }

  lifecycle {
    # Uma AMI nova ou outro user_data recriariam o servidor, e o banco está no disco dele.
    # Atualizações do sistema entram pelo `dnf upgrade` (infra/README.md).
    ignore_changes = [ami, user_data]
  }
}

# IP fixo: o CloudFront aponta para o nome público dele, que não muda ao parar e ligar o servidor.
resource "aws_eip" "servidor" {
  domain   = "vpc"
  instance = aws_instance.servidor.id

  tags = {
    Name = local.nome
  }
}

# Backup: snapshot diário do disco às 06:00 UTC (03:00 em Brasília), guardando `backup_dias`. O
# Postgres volta de um snapshot como de uma queda de energia (o WAL refaz o que faltava).

data "aws_iam_policy_document" "assumir_dlm" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${local.nome}-backup"
  assume_role_policy = data.aws_iam_policy_document.assumir_dlm.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "backup" {
  description        = "Snapshot diario do disco do ${local.nome}"
  execution_role_arn = aws_iam_role.backup.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Backup = local.nome }

    schedule {
      name      = "diario"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["06:00"]
      }

      retain_rule {
        count = var.backup_dias
      }
    }
  }
}
