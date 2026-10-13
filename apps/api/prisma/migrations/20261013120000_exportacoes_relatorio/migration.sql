-- T-125 (RN-151): exportação de relatórios em PDF e XLSX, gerada no worker.
-- CreateEnum
CREATE TYPE "formato_exportacao" AS ENUM ('pdf', 'xlsx');

-- CreateEnum
CREATE TYPE "status_exportacao" AS ENUM ('processando', 'pronta', 'erro');

-- CreateTable
CREATE TABLE "exportacoes_relatorio" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "formato" "formato_exportacao" NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "status" "status_exportacao" NOT NULL DEFAULT 'processando',
    "chave_arquivo" TEXT,
    "concluida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exportacoes_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exportacoes_relatorio_usuario_id_criado_em_idx" ON "exportacoes_relatorio"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "exportacoes_relatorio" ADD CONSTRAINT "exportacoes_relatorio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
