-- CreateTable
CREATE TABLE "configuracoes" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "alterado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "configuracoes_alterado_por_idx" ON "configuracoes"("alterado_por");

-- AddForeignKey
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_alterado_por_fkey" FOREIGN KEY ("alterado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

