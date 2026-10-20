-- T-085a: uma conexão por provedor, e quando a agenda foi sincronizada ou recusou os tokens.
-- DropIndex
DROP INDEX "agendas_conectadas_usuario_id_idx";

-- AlterTable
ALTER TABLE "agendas_conectadas" ADD COLUMN     "desconectada_em" TIMESTAMPTZ(6),
ADD COLUMN     "sincronizada_em" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "agendas_conectadas_usuario_id_provedor_key" ON "agendas_conectadas"("usuario_id", "provedor");

