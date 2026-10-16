-- T-142: a rotina monitorar (a cada 5 minutos) e o painel somam o custo de IA de um período em
-- logs_ia pela data, sem usuário.

CREATE INDEX "logs_ia_criado_em_idx" ON "logs_ia"("criado_em");
