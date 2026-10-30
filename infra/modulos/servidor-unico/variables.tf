variable "ambiente" {
  description = "Nome do ambiente. Entra no nome de todos os recursos."
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

variable "cidr_vpc" {
  description = "Faixa de IPs da VPC (uma sub-rede pública só)."
  type        = string
}

variable "tipo_instancia" {
  description = "Tipo do EC2. ARM (Graviton, t4g): a imagem da API é publicada para arm64."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^(t4g|m7g|c7g|r7g|m8g|c8g|r8g)\\.", var.tipo_instancia))
    error_message = "Use um tipo ARM (Graviton), ex.: t4g.small. A imagem da API é arm64."
  }
}

variable "disco_gb" {
  description = "Disco do servidor em GB (sistema, imagens, Postgres e Valkey)."
  type        = number
  default     = 20
}

variable "backup_dias" {
  description = "Quantos snapshots diários do disco ficam guardados."
  type        = number
  default     = 7
}

variable "retencao_logs_dias" {
  description = "Dias de retenção dos logs no CloudWatch."
  type        = number
  default     = 14
}

variable "dias_exportacoes" {
  description = "Dias até apagar exportações de dados (prefixo exportacoes/)."
  type        = number
  default     = 7
}

variable "emails_alertas" {
  description = "Quem recebe os alertas técnicos (worker e alarmes da AWS pelo SNS). Cada endereço confirma a assinatura no primeiro e-mail."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for email in var.emails_alertas : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))])
    error_message = "Use endereços de e-mail, ex.: [\"tecnico@exemplo.com.br\"]."
  }
}

variable "sentry_dsn_api" {
  description = "DSN do projeto `api` no Sentry (T-142c). Vazio: desligado."
  type        = string
  default     = ""

  validation {
    condition     = var.sentry_dsn_api == "" || can(regex("^https://[^@\\s]+@[^/\\s]+/[0-9]+$", var.sentry_dsn_api))
    error_message = "Use o DSN do Sentry, ex.: https://chave@o123.ingest.us.sentry.io/456."
  }
}

variable "sentry_dsn_worker" {
  description = "DSN do projeto `worker` no Sentry (T-142c). Vazio: desligado."
  type        = string
  default     = ""

  validation {
    condition     = var.sentry_dsn_worker == "" || can(regex("^https://[^@\\s]+@[^/\\s]+/[0-9]+$", var.sentry_dsn_worker))
    error_message = "Use o DSN do Sentry, ex.: https://chave@o123.ingest.us.sentry.io/456."
  }
}
