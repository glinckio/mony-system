# VPC com sub-redes públicas (ALB e NAT) e privadas (containers, banco e cache) em cada zona.

data "aws_availability_zones" "disponiveis" {
  state = "available"
}

locals {
  zonas      = slice(data.aws_availability_zones.disponiveis.names, 0, var.quantidade_zonas)
  total_nats = var.nat_por_zona ? length(local.zonas) : 1
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
  count = length(local.zonas)

  vpc_id            = aws_vpc.principal.id
  availability_zone = local.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 4, count.index)

  tags = {
    Name = "${local.nome}-publica-${local.zonas[count.index]}"
  }
}

resource "aws_subnet" "privada" {
  count = length(local.zonas)

  vpc_id            = aws_vpc.principal.id
  availability_zone = local.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 4, count.index + 8)

  tags = {
    Name = "${local.nome}-privada-${local.zonas[count.index]}"
  }
}

resource "aws_eip" "nat" {
  count  = local.total_nats
  domain = "vpc"

  tags = {
    Name = "${local.nome}-nat-${count.index}"
  }
}

resource "aws_nat_gateway" "principal" {
  count = local.total_nats

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id

  tags = {
    Name = "${local.nome}-nat-${count.index}"
  }

  depends_on = [aws_internet_gateway.principal]
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
  count = length(local.zonas)

  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

# Saída para a internet (APIs externas, download do schema engine do Prisma etc.) pelo NAT.
resource "aws_route_table" "privada" {
  count  = length(local.zonas)
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal[var.nat_por_zona ? count.index : 0].id
  }

  tags = {
    Name = "${local.nome}-privada-${local.zonas[count.index]}"
  }
}

resource "aws_route_table_association" "privada" {
  count = length(local.zonas)

  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

# Tráfego para o S3 sai pelo endpoint (gratuito), não pelo NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${local.regiao}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.privada[*].id

  tags = {
    Name = "${local.nome}-s3"
  }
}
