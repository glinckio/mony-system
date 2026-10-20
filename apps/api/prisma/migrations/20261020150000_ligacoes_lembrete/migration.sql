-- AlterEnum
ALTER TYPE "finalidade_codigo" ADD VALUE 'verificacao_telefone';

-- AlterTable
ALTER TABLE "ligacoes" ADD COLUMN     "chave_unica" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ligacoes_chave_unica_key" ON "ligacoes"("chave_unica");

