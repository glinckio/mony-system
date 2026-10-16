-- T-151: os limites diários da Mony contam as mensagens do usuário desde o começo do dia no fuso
-- dele. O índice por usuário e data troca o índice só por usuário (que ele já cobre).

DROP INDEX "mensagens_usuario_id_idx";

CREATE INDEX "mensagens_usuario_id_criado_em_idx" ON "mensagens"("usuario_id", "criado_em");
