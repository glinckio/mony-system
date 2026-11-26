-- T-123d: os tipos de lista de compras viram cadastro de cada usuário, como as categorias.
-- Os cinco tipos fixos de antes (mercado, casa, carro, farmacia, outra) são criados para todos os
-- usuários, já ligados à categoria de despesa que a lista finalizada usava (RN-072, a primeira
-- que existir pelo nome, sem acento e caixa), e cada lista existente passa a apontar para o tipo
-- equivalente do dono.

-- CreateTable
CREATE TABLE "tipos_lista" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" "categoria_lista",
    "categoria_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tipos_lista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tipos_lista_usuario_id_idx" ON "tipos_lista"("usuario_id");

-- AddForeignKey
ALTER TABLE "tipos_lista" ADD CONSTRAINT "tipos_lista_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_lista" ADD CONSTRAINT "tipos_lista_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: os cinco tipos de cada usuário, na ordem da tela, com a categoria de despesa pelo nome
-- (a mesma ordem de preferência do CATEGORIA_DA_LISTA do @mony/shared).
WITH padroes ("chave", "nome", "ordem", "categorias") AS (
    VALUES
        ('mercado'::"categoria_lista", 'Mercado', 1, ARRAY['mercado', 'alimentacao']),
        ('casa'::"categoria_lista", 'Casa', 2, ARRAY['moradia', 'casa', 'compras']),
        ('carro'::"categoria_lista", 'Carro', 3, ARRAY['transporte', 'carro']),
        ('farmacia'::"categoria_lista", 'Farmácia', 4, ARRAY['saude', 'farmacia']),
        ('outra'::"categoria_lista", 'Outra', 5, ARRAY['compras', 'outros'])
)
INSERT INTO "tipos_lista" ("id", "usuario_id", "nome", "chave", "categoria_id", "criado_em", "atualizado_em")
SELECT
    gen_random_uuid(),
    u."id",
    p."nome",
    p."chave",
    (
        SELECT c."id"
        FROM "categorias" c
        CROSS JOIN LATERAL unnest(p."categorias") WITH ORDINALITY AS n("nome", "posicao")
        WHERE c."usuario_id" = u."id"
          AND c."tipo" = 'despesa'
          AND c."excluido_em" IS NULL
          AND translate(lower(btrim(c."nome")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = n."nome"
        ORDER BY n."posicao", c."criado_em"
        LIMIT 1
    ),
    -- Um milissegundo por posição: a lista de tipos sai na ordem da tela de antes.
    now() + (p."ordem" * interval '1 millisecond'),
    now()
FROM "usuarios" u
CROSS JOIN padroes p;

-- AlterTable: cada lista aponta para o tipo do dono com a mesma chave.
ALTER TABLE "listas_compras" ADD COLUMN "tipo_lista_id" UUID;

UPDATE "listas_compras" l
SET "tipo_lista_id" = t."id"
FROM "tipos_lista" t
WHERE t."usuario_id" = l."usuario_id"
  AND t."chave" = l."categoria_lista";

ALTER TABLE "listas_compras" ALTER COLUMN "tipo_lista_id" SET NOT NULL;
ALTER TABLE "listas_compras" DROP COLUMN "categoria_lista";

-- CreateIndex
CREATE INDEX "listas_compras_tipo_lista_id_idx" ON "listas_compras"("tipo_lista_id");

-- AddForeignKey
ALTER TABLE "listas_compras" ADD CONSTRAINT "listas_compras_tipo_lista_id_fkey" FOREIGN KEY ("tipo_lista_id") REFERENCES "tipos_lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
