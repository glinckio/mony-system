#!/bin/bash
# Atualiza o servidor único de um ambiente (T-156, infra/modulos/servidor-unico). O workflow de
# deploy manda este arquivo pelo SSM Run Command a cada versão, como root, com:
#   AMBIENTE=staging VERSAO=<commit>
# Idempotente: prepara o que faltar (Docker, swap, rede, Postgres, Valkey), migra o banco com a
# imagem nova e troca a API e o worker. Se a API nova não responder o health check, volta a
# anterior e termina com erro.
set -euo pipefail

: "${AMBIENTE:?defina AMBIENTE}" "${VERSAO:?defina VERSAO}"

DADOS=/var/lib/mony
REDE=mony
POSTGRES=public.ecr.aws/docker/library/postgres:18-alpine
# O Valkey não está no espelho da biblioteca oficial do Docker: o projeto publica no próprio ECR público.
VALKEY=public.ecr.aws/valkey/valkey:8-alpine

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Na primeira subida, o user_data ainda pode estar instalando o Docker.
cloud-init status --wait > /dev/null 2>&1 || true

# Sistema: Docker, jq e 2 GB de swap (o servidor tem pouca memória para quatro processos).
if ! command -v docker > /dev/null || ! command -v jq > /dev/null; then
  log "instalando Docker e jq"
  dnf install -y docker jq
fi
systemctl enable --now docker
if [ ! -f /swapfile ]; then
  log "criando swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show | grep -q /swapfile || swapon /swapfile

install -d -m 700 "$DADOS" "$DADOS/postgres" "$DADOS/valkey"
if [ ! -s "$DADOS/senha-banco" ]; then
  # A senha só vale dentro da rede do Docker (o Postgres não abre porta no servidor).
  (umask 077 && openssl rand -hex 24 > "$DADOS/senha-banco")
fi
SENHA_BANCO=$(cat "$DADOS/senha-banco")

# Configuração do Terraform e chaves da aplicação, do Parameter Store.
regiao=$(TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60') &&
  curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/placement/region)
parametro() {
  aws ssm get-parameter --region "$regiao" --name "$1" --with-decryption \
    --query Parameter.Value --output text
}
CONFIG=$(parametro "/mony/$AMBIENTE/config")
APP=$(parametro "/mony/$AMBIENTE/app")
cfg() { jq -r --arg c "$1" '.[$c] // ""' <<< "$CONFIG"; }
REPOSITORIO=$(cfg REPOSITORIO)
IMAGEM="$REPOSITORIO:$VERSAO"

# Variáveis dos containers da aplicação. `docker run --env-file` lê cada linha ao pé da letra (sem
# aspas nem `$`); quebras de linha das chaves (PEM) viram `\n`, que a API desfaz.
ambiente_app="$DADOS/app.env"
(
  umask 077
  {
    jq -r 'to_entries[]
      | select(.key | IN("SENTRY_DSN_API", "SENTRY_DSN_WORKER", "LOG_API", "LOG_WORKER", "REPOSITORIO") | not)
      | "\(.key)=\(.value)"' <<< "$CONFIG"
    jq -r 'to_entries[] | "\(.key)=\(.value | tostring | gsub("\n"; "\\n"))"' <<< "$APP"
    echo "PORT=3000"
    echo "DATABASE_URL=postgresql://mony:$SENHA_BANCO@postgres:5432/mony"
    echo "REDIS_URL=redis://valkey:6379"
  } > "$ambiente_app"
)

docker network inspect "$REDE" > /dev/null 2>&1 || docker network create "$REDE" > /dev/null

# Postgres e Valkey: só sobem se não estiverem rodando. Os dados ficam no disco do servidor (que o
# snapshot diário copia). Sem porta publicada: só a rede do Docker alcança.
log_local=(--log-driver json-file --log-opt max-size=10m --log-opt max-file=3)
if [ -z "$(docker ps -q --filter name=^postgres$)" ]; then
  log "subindo o Postgres"
  docker rm -f postgres > /dev/null 2>&1 || true
  docker run -d --name postgres --network "$REDE" --restart unless-stopped "${log_local[@]}" \
    --shm-size 128m -e POSTGRES_USER=mony -e POSTGRES_DB=mony -e POSTGRES_PASSWORD="$SENHA_BANCO" \
    -v "$DADOS/postgres:/var/lib/postgresql" "$POSTGRES" \
    -c shared_buffers=128MB -c max_connections=50 > /dev/null
fi
if [ -z "$(docker ps -q --filter name=^valkey$)" ]; then
  log "subindo o Valkey"
  docker rm -f valkey > /dev/null 2>&1 || true
  # Filas do BullMQ: gravadas em disco (appendonly) e nunca descartadas por falta de memória.
  docker run -d --name valkey --network "$REDE" --restart unless-stopped "${log_local[@]}" \
    -v "$DADOS/valkey:/data" "$VALKEY" \
    valkey-server --appendonly yes --maxmemory 128mb --maxmemory-policy noeviction > /dev/null
fi
for _ in $(seq 1 60); do
  docker exec postgres pg_isready -U mony -d mony > /dev/null 2>&1 && break
  sleep 1
done
docker exec postgres pg_isready -U mony -d mony > /dev/null

# Imagem nova (o papel do servidor lê o ECR).
log "baixando $IMAGEM"
aws ecr get-login-password --region "$regiao" |
  docker login --username AWS --password-stdin "${REPOSITORIO%%/*}" > /dev/null
docker pull -q "$IMAGEM" > /dev/null

# Migração antes de trocar a API: é sempre compatível com a versão anterior (expandir → migrar →
# contrair), então a API velha segue no ar enquanto isso.
log "migrações e seed"
docker run --rm --network "$REDE" --env-file "$ambiente_app" "$IMAGEM" \
  sh -c "prisma migrate deploy && prisma db seed"

# Sobe um container da aplicação: `rodar <nome> <imagem> [comando...]`.
rodar() {
  local nome=$1 imagem=$2 dsn grupo
  shift 2
  if [ "$nome" = api ]; then dsn=$(cfg SENTRY_DSN_API) grupo=$(cfg LOG_API); else dsn=$(cfg SENTRY_DSN_WORKER) grupo=$(cfg LOG_WORKER); fi
  local porta=()
  [ "$nome" = api ] && porta=(-p 80:3000)
  docker stop -t 30 "$nome" > /dev/null 2>&1 || true
  docker rm -f "$nome" > /dev/null 2>&1 || true
  docker run -d --name "$nome" --network "$REDE" --restart unless-stopped "${porta[@]}" \
    --env-file "$ambiente_app" -e SENTRY_DSN="$dsn" \
    --log-driver awslogs --log-opt awslogs-region="$regiao" --log-opt awslogs-group="$grupo" \
    --log-opt awslogs-stream="$nome" "$imagem" "$@" > /dev/null
}

api_saudavel() {
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null http://localhost/v1/health && return 0
    sleep 2
  done
  return 1
}

anterior=$(docker inspect -f '{{.Config.Image}}' api 2> /dev/null || true)
log "trocando a API (anterior: ${anterior:-nenhuma})"
rodar api "$IMAGEM"
if ! api_saudavel; then
  echo "A API nova não respondeu /v1/health. Últimas linhas:"
  docker logs --tail 40 api 2>&1 || true
  if [ -n "$anterior" ] && [ "$anterior" != "$IMAGEM" ]; then
    log "voltando para $anterior"
    rodar api "$anterior"
    api_saudavel || echo "A versão anterior também não respondeu."
  fi
  exit 1
fi

log "trocando o worker"
rodar worker "$IMAGEM" node dist/worker.js
sleep 10
if [ "$(docker inspect -f '{{.State.Running}}' worker)" != "true" ]; then
  echo "O worker novo parou. Últimas linhas:"
  docker logs --tail 40 worker 2>&1 || true
  exit 1
fi

# Libera o disco: imagens que nenhum container usa (a anterior inclusive).
docker image prune -af > /dev/null
log "pronto: $VERSAO no ar"
