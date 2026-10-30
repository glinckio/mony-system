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

variable "ids_github" {
  description = "IDs numéricos do dono e do repositório no GitHub. Com o \"sujeito imutável\" ligado no repositório (`gh api repos/<dono>/<nome>/actions/oidc/customization/sub`), o token do deploy traz `repo:<dono>@<id>/<nome>@<id>:...` em vez de `repo:<dono>/<nome>:...`. Com os IDs, o papel aceita os dois formatos."
  type = object({
    dono        = number
    repositorio = number
  })
  default = null
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

# Domínio e HTTPS

variable "dominio" {
  description = "Domínio do ambiente (ex.: staging.monitorizze.com.br). Cria a zona no Route 53, os certificados e os nomes api.<dominio> e admin.<dominio>. Sem ele, a API fica só em HTTP no endereço do ALB e o admin no endereço do CloudFront."
  type        = string
  default     = null

  validation {
    condition     = var.dominio == null || can(regex("^([a-z0-9-]+\\.)+[a-z]{2,}$", var.dominio))
    error_message = "Use só o domínio, em minúsculas, sem protocolo nem barra (ex.: staging.monitorizze.com.br)."
  }
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

variable "emails_alertas" {
  description = "Quem recebe os alertas técnicos: os do worker (fila parada, falha em webhook, custo de IA; T-142a) e os alarmes da AWS pelo SNS (T-142b). Cada endereço confirma a assinatura do SNS no primeiro e-mail."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for email in var.emails_alertas : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))])
    error_message = "Use endereços de e-mail, ex.: [\"tecnico@exemplo.com.br\"]."
  }
}

# Arquivos (S3)

variable "dias_exportacoes" {
  description = "Dias até apagar exportações de dados (prefixo exportacoes/, docs/arquitetura/12)."
  type        = number
  default     = 7
}

variable "sentry_dsn_api" {
  description = "DSN do projeto `api` no Sentry (T-142c, doc 12). Vazio: o Sentry fica desligado na API."
  type        = string
  default     = ""

  validation {
    condition     = var.sentry_dsn_api == "" || can(regex("^https://[^@\\s]+@[^/\\s]+/[0-9]+$", var.sentry_dsn_api))
    error_message = "Use o DSN do Sentry, ex.: https://chave@o123.ingest.us.sentry.io/456."
  }
}

variable "sentry_dsn_worker" {
  description = "DSN do projeto `worker` no Sentry (T-142c, doc 12). Vazio: o Sentry fica desligado no worker."
  type        = string
  default     = ""

  validation {
    condition     = var.sentry_dsn_worker == "" || can(regex("^https://[^@\\s]+@[^/\\s]+/[0-9]+$", var.sentry_dsn_worker))
    error_message = "Use o DSN do Sentry, ex.: https://chave@o123.ingest.us.sentry.io/456."
  }
}
