-- T-066a: o cupom fiscal lido pelo QR Code (NFC-e) vira uma importação a confirmar, como a foto,
-- mas sem arquivo. Compatível com a versão anterior: só acrescenta um valor e afrouxa a coluna.

-- AlterEnum
ALTER TYPE "tipo_importacao" ADD VALUE 'nfce';

-- AlterTable
ALTER TABLE "importacoes_documento" ALTER COLUMN "arquivo_id" DROP NOT NULL;

-- A forma de pagamento que o cupom informa, para o lançamento feito depois da consulta (a nota pode
-- ser gravada pelo worker e lançada mais tarde).
-- AlterTable
ALTER TABLE "nfce_notas" ADD COLUMN     "forma_pagamento" "forma_pagamento";
