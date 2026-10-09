variable "ambiente" {
  description = "Nome do ambiente: staging ou production. Entra no nome de todos os recursos."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.ambiente)
    error_message = "Use staging ou production."
  }
}

variable "repositorio_github" {
  description = "Repositório (dono/nome) cujo workflow de deploy pode assumir o papel de deploy."
  type        = string
}

# Rede

variable "cidr_vpc" {
  description = "Faixa de IPs da VPC. Cada ambiente usa uma faixa própria."
  type        = string
}

variable "quantidade_zonas" {
  description = "Zonas de disponibilidade usadas (sub-redes pública e privada em cada uma)."
  type        = number
  default     = 2
}

variable "nat_por_zona" {
  description = "Um NAT gateway por zona (alta disponibilidade) ou um só para todas (mais barato)."
  type        = bool
  default     = false
}

# HTTPS

variable "certificado_arn" {
  description = "Certificado do ACM para o ALB. Sem ele, o ALB só atende HTTP (provisório, até existir o domínio)."
  type        = string
  default     = null
}

# Banco (RDS PostgreSQL)

variable "banco_versao" {
  description = "Versão principal do PostgreSQL."
  type        = string
  default     = "18"
}

variable "banco_classe" {
  description = "Classe da instância do RDS."
  type        = string
}

variable "banco_armazenamento_gb" {
  description = "Armazenamento inicial em GB (cresce sozinho até 5 vezes isso)."
  type        = number
  default     = 20
}

variable "banco_multi_az" {
  description = "Réplica em outra zona com failover automático."
  type        = bool
}

variable "banco_backup_dias" {
  description = "Dias de backup automático (também é a janela de recuperação para um instante, PITR)."
  type        = number
}

variable "banco_protecao_exclusao" {
  description = "Impede apagar o banco por engano (inclusive pelo Terraform)."
  type        = bool
  default     = true
}

variable "versao_senha_banco" {
  description = "Aumente para gerar e gravar uma senha nova do banco (a senha não fica no estado do Terraform)."
  type        = number
  default     = 1
}

# Cache e filas (ElastiCache Valkey)

variable "cache_versao" {
  description = "Versão do Valkey."
  type        = string
  default     = "8.0"
}

variable "cache_classe" {
  description = "Classe dos nós do ElastiCache."
  type        = string
}

variable "cache_replicas" {
  description = "Réplicas além do primário. Com 1 ou mais, há failover automático entre zonas."
  type        = number
}

# Containers (ECS Fargate)

variable "api_cpu" {
  description = "CPU de cada tarefa da API (1024 = 1 vCPU)."
  type        = number
}

variable "api_memoria" {
  description = "Memória de cada tarefa da API, em MB."
  type        = number
}

variable "api_minimo" {
  description = "Mínimo de tarefas da API."
  type        = number
}

variable "api_maximo" {
  description = "Máximo de tarefas da API (escala pela CPU)."
  type        = number
}

variable "worker_cpu" {
  description = "CPU de cada tarefa do worker."
  type        = number
}

variable "worker_memoria" {
  description = "Memória de cada tarefa do worker, em MB."
  type        = number
}

variable "worker_quantidade" {
  description = "Tarefas do worker. A escala pelo tamanho das filas vem com o monitoramento (T-142)."
  type        = number
}

variable "container_insights" {
  description = "Métricas detalhadas dos containers no CloudWatch (têm custo)."
  type        = bool
  default     = false
}

variable "retencao_logs_dias" {
  description = "Dias de retenção dos logs no CloudWatch."
  type        = number
  default     = 30
}

# Arquivos (S3)

variable "dias_exportacoes" {
  description = "Dias até apagar exportações de dados (prefixo exportacoes/, docs/arquitetura/12)."
  type        = number
  default     = 7
}
