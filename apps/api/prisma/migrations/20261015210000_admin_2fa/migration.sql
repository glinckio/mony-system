-- T-104a: 2FA (TOTP) do painel admin. Colunas novas e nulas: compatível com a versão anterior.
ALTER TABLE "usuarios" ADD COLUMN "totp_segredo" TEXT,
ADD COLUMN "totp_ativado_em" TIMESTAMPTZ(6);
