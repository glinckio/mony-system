-- T-140b (RN-161): exclusão da conta com 7 dias para desistir; código por e-mail com finalidade.
-- CreateEnum
CREATE TYPE "finalidade_codigo" AS ENUM ('recuperacao', 'exclusao_conta');
-- AlterTable
ALTER TABLE "codigos_recuperacao" ADD COLUMN     "finalidade" "finalidade_codigo" NOT NULL DEFAULT 'recuperacao';
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "exclusao_agendada_para" TIMESTAMPTZ(6),
ADD COLUMN     "exclusao_cancelou_assinatura" BOOLEAN NOT NULL DEFAULT false;
