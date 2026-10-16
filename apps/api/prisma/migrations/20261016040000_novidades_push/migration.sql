-- T-141d: push opcional das novidades do painel.
ALTER TABLE "novidades" ADD COLUMN "enviar_push" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "push_enviado_em" TIMESTAMPTZ(6);
