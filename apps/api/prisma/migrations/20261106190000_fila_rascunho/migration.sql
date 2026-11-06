-- T-061a (RN-086): vários lançamentos na mesma mensagem viram um de cada vez; os que esperam ficam
-- na fila do rascunho em andamento.
-- AlterTable
ALTER TABLE "rascunhos_lancamento" ADD COLUMN     "fila" JSONB NOT NULL DEFAULT '[]';
