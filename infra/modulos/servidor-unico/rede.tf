# Rede mínima: uma sub-rede pública com saída pela internet. Sem NAT (o servidor tem IP público) e
# sem sub-rede privada (o banco e o cache rodam no próprio servidor, sem porta aberta).

data "aws_availability_zones" "disponiveis" {
  state = "available"
}

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr_vpc
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = local.nome
  }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id

  tags = {
    Name = local.nome
  }
}

resource "aws_subnet" "publica" {
  vpc_id            = aws_vpc.principal.id
  availability_zone = data.aws_availability_zones.disponiveis.names[0]
  cidr_block        = cidrsubnet(var.cidr_vpc, 4, 0)

  tags = {
    Name = "${local.nome}-publica"
  }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }

  tags = {
    Name = "${local.nome}-publica"
  }
}

resource "aws_route_table_association" "publica" {
  subnet_id      = aws_subnet.publica.id
  route_table_id = aws_route_table.publica.id
}

# A porta 80 só aceita o CloudFront (lista de IPs dele mantida pela AWS). Sem SSH: o acesso ao
# servidor é pelo Session Manager do SSM.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "servidor" {
  name        = "${local.nome}-servidor"
  description = "API do Mony: porta 80 so do CloudFront"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "http_cloudfront" {
  security_group_id = aws_security_group.servidor.id
  description       = "CloudFront para a API"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

resource "aws_vpc_security_group_egress_rule" "tudo" {
  security_group_id = aws_security_group.servidor.id
  description       = "Saida: ECR, SSM, CloudWatch, S3 e os provedores (Stripe, IA, e-mail, push)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
