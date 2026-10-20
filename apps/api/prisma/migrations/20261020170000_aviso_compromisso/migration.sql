-- AlterTable
ALTER TABLE "compromissos" ADD COLUMN     "aviso_para" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "preferencias_alerta" ADD COLUMN     "antecedencia_minutos" SMALLINT;

-- CreateIndex
CREATE INDEX "compromissos_inicio_idx" ON "compromissos"("inicio");

