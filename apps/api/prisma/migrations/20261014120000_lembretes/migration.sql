-- T-084a: quando a ocorrência atual do lembrete tocou (para não tocar de novo e esperar o [Feito]),
-- e o índice da soneca para a rotina por minuto. Compatível com a versão anterior.

-- AlterTable
ALTER TABLE "lembretes" ADD COLUMN     "disparado_em" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "lembretes_status_adiado_ate_idx" ON "lembretes"("status", "adiado_ate");
