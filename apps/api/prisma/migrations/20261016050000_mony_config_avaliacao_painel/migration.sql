-- T-141e: o painel pede a avaliação de uma versão do prompt da Mony; o worker roda e grava aqui.
ALTER TABLE "mony_config" ADD COLUMN "avaliacao_pedida_em" TIMESTAMPTZ(6),
ADD COLUMN "avaliacao_falha" TEXT;
