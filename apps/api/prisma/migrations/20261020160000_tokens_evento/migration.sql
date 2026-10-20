-- CreateTable
CREATE TABLE "tokens_evento" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ultimo_uso" TIMESTAMPTZ(6),
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tokens_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_evento_dispositivo_id_key" ON "tokens_evento"("dispositivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_evento_token_hash_key" ON "tokens_evento"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_evento_usuario_id_idx" ON "tokens_evento"("usuario_id");

-- AddForeignKey
ALTER TABLE "tokens_evento" ADD CONSTRAINT "tokens_evento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_evento" ADD CONSTRAINT "tokens_evento_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

