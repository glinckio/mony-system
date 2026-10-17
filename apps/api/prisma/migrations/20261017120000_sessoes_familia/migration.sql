-- T-088b (RN-004): a família da sessão. O login abre uma família; cada renovação passa a mesma para
-- a sessão nova. O token de segundo plano do aparelho vale enquanto a família tiver sessão ativa.
-- As sessões que já existem viram cada uma a sua própria família (a da renovação seguinte é a dela).
-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "familia_id" UUID;
UPDATE "sessoes" SET "familia_id" = "id";
ALTER TABLE "sessoes" ALTER COLUMN "familia_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "sessoes_familia_id_idx" ON "sessoes"("familia_id");
