# syntax=docker/dockerfile:1
# Imagem da API (docs/arquitetura/12). A mesma imagem roda a API (comando padrão), o worker
# (`node dist/worker.js`) e as migrações (`prisma migrate deploy && prisma db seed`).
# Contexto do build: a raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t mony-api .

# Imagem oficial do Node pelo espelho da AWS (sem o limite de downloads do Docker Hub).
ARG IMAGEM_NODE=public.ecr.aws/docker/library/node:24-bookworm-slim

FROM ${IMAGEM_NODE} AS base
ENV CI=1 HUSKY=0 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
RUN npm install --global pnpm@12.10.1 && npm cache clean --force
WORKDIR /repo

FROM base AS build
# Só o lockfile primeiro: a camada com as dependências baixadas é reaproveitada enquanto ele não muda.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "api..."
RUN pnpm turbo run build --filter=api
# Pasta só com a API, o @mony/shared compilado e as dependências de produção.
RUN pnpm --filter api deploy --prod --legacy /saida

FROM ${IMAGEM_NODE} AS final
# O RDS exige TLS: a autoridade certificadora dele entra no sistema (CLI do Prisma) e no Node.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /usr/local/share/ca-certificates/rds.crt
RUN update-ca-certificates
ENV NODE_ENV=production \
  NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/rds.crt \
  PATH=/app/node_modules/.bin:$PATH
WORKDIR /app
COPY --from=build --chown=node:node /saida ./
USER node
# Baixa já na imagem os binários que o CLI do Prisma usa nas migrações.
RUN prisma version
EXPOSE 3000
CMD ["node", "dist/main.js"]
