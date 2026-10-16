-- T-140a (RN-160): exportação dos dados do usuário (ZIP com JSON e XLSX), gerada no worker.
-- CreateTable
CREATE TABLE "exportacoes_dados" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "status" "status_exportacao" NOT NULL DEFAULT 'processando',
    "chave_arquivo" TEXT,
    "concluida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exportacoes_dados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exportacoes_dados_usuario_id_criado_em_idx" ON "exportacoes_dados"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "exportacoes_dados" ADD CONSTRAINT "exportacoes_dados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

