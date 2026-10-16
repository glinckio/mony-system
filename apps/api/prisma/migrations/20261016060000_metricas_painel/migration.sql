-- T-141f: métricas do painel. Os acessos por dia (login, cadastro e renovação da sessão) e três
-- materialized views, atualizadas de hora em hora pela rotina `atualizar-metricas`. Os dias são de
-- São Paulo, o fuso do painel. O índice único de cada view permite o REFRESH CONCURRENTLY.

CREATE TABLE "acessos_diarios" (
    "usuario_id" UUID NOT NULL,
    "dia" DATE NOT NULL,

    CONSTRAINT "acessos_diarios_pkey" PRIMARY KEY ("usuario_id","dia")
);

CREATE INDEX "acessos_diarios_dia_idx" ON "acessos_diarios"("dia");

ALTER TABLE "acessos_diarios" ADD CONSTRAINT "acessos_diarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quem já entrou antes da tabela existir conta no dia do último acesso.
INSERT INTO "acessos_diarios" ("usuario_id", "dia")
SELECT "id", ("ultimo_acesso" AT TIME ZONE 'America/Sao_Paulo')::date
FROM "usuarios"
WHERE "ultimo_acesso" IS NOT NULL;

CREATE MATERIALIZED VIEW "metricas_ativos_dia" AS
SELECT "dia", count(*)::int AS "ativos"
FROM "acessos_diarios"
GROUP BY "dia";

CREATE UNIQUE INDEX "metricas_ativos_dia_dia_key" ON "metricas_ativos_dia"("dia");

-- Um lançamento por gesto da pessoa: as ocorrências geradas pela recorrência ficam de fora, e as
-- parcelas de uma compra parcelada contam uma vez.
CREATE MATERIALIZED VIEW "metricas_lancamentos_dia" AS
SELECT ("criado_em" AT TIME ZONE 'America/Sao_Paulo')::date AS "dia",
       "origem",
       count(DISTINCT coalesce("parcelamento_id", "id"))::int AS "quantidade"
FROM "transacoes"
WHERE "recorrencia_id" IS NULL
GROUP BY 1, 2;

CREATE UNIQUE INDEX "metricas_lancamentos_dia_dia_origem_key" ON "metricas_lancamentos_dia"("dia", "origem");

CREATE MATERIALIZED VIEW "metricas_alertas_dia" AS
SELECT ("criado_em" AT TIME ZONE 'America/Sao_Paulo')::date AS "dia",
       "tipo",
       count(*)::int AS "criados",
       count("enviada_em")::int AS "enviados",
       count("lida_em")::int AS "lidos"
FROM "notificacoes"
GROUP BY 1, 2;

CREATE UNIQUE INDEX "metricas_alertas_dia_dia_tipo_key" ON "metricas_alertas_dia"("dia", "tipo");
