-- T-105: o plano anual pago com Pix é um pagamento único que libera 12 meses. `pago_ate` é até
-- quando ele vale (sem renovação automática); `pagamento_unico_id` é o último checkout aplicado,
-- para o mesmo pagamento não somar duas vezes.

ALTER TABLE "assinaturas" ADD COLUMN "pago_ate" TIMESTAMPTZ(6),
ADD COLUMN "pagamento_unico_id" TEXT;

CREATE UNIQUE INDEX "assinaturas_pagamento_unico_id_key" ON "assinaturas"("pagamento_unico_id");
