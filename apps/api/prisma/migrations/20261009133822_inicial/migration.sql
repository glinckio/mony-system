-- CreateEnum
CREATE TYPE "papel_usuario" AS ENUM ('usuario', 'admin');

-- CreateEnum
CREATE TYPE "status_usuario" AS ENUM ('ativo', 'bloqueado', 'excluido');

-- CreateEnum
CREATE TYPE "provedor_login_social" AS ENUM ('google', 'apple');

-- CreateEnum
CREATE TYPE "plataforma_dispositivo" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "plano" AS ENUM ('teste', 'gratuito', 'mensal', 'anual');

-- CreateEnum
CREATE TYPE "plano_pago" AS ENUM ('mensal', 'anual');

-- CreateEnum
CREATE TYPE "status_assinatura" AS ENUM ('ativa', 'inadimplente', 'cancelada');

-- CreateEnum
CREATE TYPE "recurso_plano" AS ENUM ('lancamento', 'mensagem_mony', 'leitura_documento', 'cartao', 'lista_compras', 'lembrete_ativo', 'relatorio');

-- CreateEnum
CREATE TYPE "tipo_categoria" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "tipo_transacao" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "tipo_conta" AS ENUM ('corrente', 'poupanca', 'carteira');

-- CreateEnum
CREATE TYPE "origem_conta" AS ENUM ('manual', 'open_finance');

-- CreateEnum
CREATE TYPE "status_fatura" AS ENUM ('aberta', 'fechada', 'paga', 'parcial', 'atrasada');

-- CreateEnum
CREATE TYPE "status_transacao" AS ENUM ('pago', 'pendente');

-- CreateEnum
CREATE TYPE "forma_pagamento" AS ENUM ('cartao_credito', 'pix', 'debito', 'dinheiro', 'boleto');

-- CreateEnum
CREATE TYPE "origem_transacao" AS ENUM ('manual', 'mony', 'open_finance', 'foto');

-- CreateEnum
CREATE TYPE "natureza_transacao" AS ENUM ('normal', 'pagamento_fatura', 'transferencia');

-- CreateEnum
CREATE TYPE "frequencia_recorrencia" AS ENUM ('semanal', 'mensal', 'anual');

-- CreateEnum
CREATE TYPE "tipo_parcelamento" AS ENUM ('compra_cartao', 'divida');

-- CreateEnum
CREATE TYPE "status_parcelamento" AS ENUM ('ativa', 'quitada', 'atrasada', 'cancelada');

-- CreateEnum
CREATE TYPE "status_parcela" AS ENUM ('pendente', 'pago', 'atrasado');

-- CreateEnum
CREATE TYPE "tipo_anexo" AS ENUM ('foto', 'pdf', 'comprovante');

-- CreateEnum
CREATE TYPE "categoria_lista" AS ENUM ('mercado', 'casa', 'carro', 'farmacia', 'outra');

-- CreateEnum
CREATE TYPE "recurso_compartilhavel" AS ENUM ('lista', 'lembrete');

-- CreateEnum
CREATE TYPE "permissao_compartilhamento" AS ENUM ('ver', 'editar');

-- CreateEnum
CREATE TYPE "status_convite" AS ENUM ('pendente', 'aceito', 'recusado');

-- CreateEnum
CREATE TYPE "canal_lembrete" AS ENUM ('push', 'alarme', 'ligacao');

-- CreateEnum
CREATE TYPE "status_lembrete" AS ENUM ('ativo', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "provedor_agenda" AS ENUM ('google', 'outlook', 'aparelho');

-- CreateEnum
CREATE TYPE "origem_compromisso" AS ENUM ('app', 'mony', 'externo');

-- CreateEnum
CREATE TYPE "tipo_alerta" AS ENUM ('limite_cartao', 'fatura_fechada', 'fatura_vencimento', 'fatura_atrasada', 'orcamento', 'gasto_fora_padrao', 'projecao_mes', 'vencimento_pendente', 'app_compra', 'lembrete', 'compromisso', 'resumo_periodo', 'open_finance', 'assinatura', 'novidade');

-- CreateEnum
CREATE TYPE "status_conexao_open_finance" AS ENUM ('ativa', 'atualizando', 'erro_login', 'consentimento_expirado', 'desconectada');

-- CreateEnum
CREATE TYPE "autor_mensagem" AS ENUM ('usuario', 'mony');

-- CreateEnum
CREATE TYPE "tipo_mensagem" AS ENUM ('texto', 'audio', 'imagem', 'pdf', 'botao');

-- CreateEnum
CREATE TYPE "tipo_importacao" AS ENUM ('foto', 'pdf');

-- CreateEnum
CREATE TYPE "status_importacao" AS ENUM ('processando', 'aguardando_confirmacao', 'confirmada', 'descartada', 'erro');

-- CreateEnum
CREATE TYPE "status_novidade" AS ENUM ('rascunho', 'publicada', 'arquivada');

-- CreateEnum
CREATE TYPE "provedor_webhook" AS ENUM ('stripe', 'open_finance');

-- CreateEnum
CREATE TYPE "documento_aceite" AS ENUM ('termos', 'privacidade');

-- CreateEnum
CREATE TYPE "finalidade_consentimento" AS ENUM ('open_finance', 'agenda', 'apps_compra', 'ligacao');

-- CreateEnum
CREATE TYPE "tipo_controle_teste" AS ENUM ('email', 'google', 'apple', 'aparelho');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "senha_hash" TEXT,
    "foto_url" TEXT,
    "papel" "papel_usuario" NOT NULL DEFAULT 'usuario',
    "status" "status_usuario" NOT NULL DEFAULT 'ativo',
    "onboarding_concluido" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_acesso" TIMESTAMPTZ(6),
    "fuso_horario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "telefone_verificado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logins_sociais" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "provedor" "provedor_login_social" NOT NULL,
    "id_externo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "logins_sociais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "plataforma" "plataforma_dispositivo" NOT NULL,
    "token_push" TEXT,
    "identificador_aparelho" TEXT NOT NULL,
    "modelo" TEXT,
    "ultimo_uso" TIMESTAMPTZ(6),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "revogada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_recuperacao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "codigos_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "plano" "plano" NOT NULL,
    "status" "status_assinatura" NOT NULL DEFAULT 'ativa',
    "plano_preco_id" UUID,
    "teste_inicio" TIMESTAMPTZ(6),
    "teste_fim" TIMESTAMPTZ(6),
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "inicio" TIMESTAMPTZ(6),
    "proxima_cobranca" TIMESTAMPTZ(6),
    "cancelamento_agendado" BOOLEAN NOT NULL DEFAULT false,
    "cancelada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_precos" (
    "id" UUID NOT NULL,
    "plano" "plano_pago" NOT NULL,
    "valor" BIGINT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT false,
    "vigente_desde" TIMESTAMPTZ(6) NOT NULL,
    "alterado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planos_precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limites_plano" (
    "id" UUID NOT NULL,
    "recurso" "recurso_plano" NOT NULL,
    "limite_dia" INTEGER,
    "limite_mes" INTEGER,
    "limite_quantidade" INTEGER,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "limites_plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_recursos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "recurso" "recurso_plano" NOT NULL,
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "uso_recursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "tipo_categoria" NOT NULL,
    "cor" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "excluido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "tipo_conta" NOT NULL,
    "saldo_inicial" BIGINT NOT NULL DEFAULT 0,
    "origem" "origem_conta" NOT NULL DEFAULT 'manual',
    "id_externo" TEXT,
    "conexao_open_finance_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "bandeira" TEXT,
    "final" VARCHAR(4),
    "limite_total" BIGINT NOT NULL,
    "dia_fechamento" SMALLINT NOT NULL,
    "dia_vencimento" SMALLINT NOT NULL,
    "cor" TEXT NOT NULL,
    "faixas_alerta" INTEGER[] DEFAULT ARRAY[50, 80, 100]::INTEGER[],
    "origem" "origem_conta" NOT NULL DEFAULT 'manual',
    "id_externo" TEXT,
    "conexao_open_finance_id" UUID,
    "conta_pagamento_id" UUID,
    "excluido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cartoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cartao_id" UUID NOT NULL,
    "competencia" DATE NOT NULL,
    "data_fechamento" DATE NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "valor_total" BIGINT NOT NULL DEFAULT 0,
    "valor_pago" BIGINT NOT NULL DEFAULT 0,
    "status" "status_fatura" NOT NULL DEFAULT 'aberta',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_transacao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" BIGINT NOT NULL,
    "data" DATE NOT NULL,
    "status" "status_transacao" NOT NULL,
    "forma_pagamento" "forma_pagamento",
    "origem" "origem_transacao" NOT NULL DEFAULT 'manual',
    "natureza" "natureza_transacao" NOT NULL DEFAULT 'normal',
    "observacao" TEXT,
    "categoria_id" UUID NOT NULL,
    "conta_id" UUID,
    "cartao_id" UUID,
    "fatura_id" UUID,
    "recorrencia_id" UUID,
    "parcelamento_id" UUID,
    "parcela_id" UUID,
    "nfce_nota_id" UUID,
    "id_externo" TEXT,
    "transacao_unida_id" UUID,
    "estabelecimento" TEXT,
    "editada_manualmente" BOOLEAN NOT NULL DEFAULT false,
    "excluido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recorrencias" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "tipo" "tipo_transacao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" BIGINT NOT NULL,
    "forma_pagamento" "forma_pagamento",
    "conta_id" UUID,
    "cartao_id" UUID,
    "frequencia" "frequencia_recorrencia" NOT NULL,
    "dia" SMALLINT,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "proxima_geracao" DATE NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelamentos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "tipo_parcelamento" NOT NULL,
    "valor_total" BIGINT NOT NULL,
    "valor_financiado" BIGINT,
    "total_parcelas" SMALLINT NOT NULL,
    "taxa_juros" DECIMAL(9,6),
    "data_inicio" DATE NOT NULL,
    "status" "status_parcelamento" NOT NULL DEFAULT 'ativa',
    "observacao" TEXT,
    "categoria_id" UUID NOT NULL,
    "cartao_id" UUID,
    "excluido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parcelamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "parcelamento_id" UUID NOT NULL,
    "numero" SMALLINT NOT NULL,
    "valor" BIGINT NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" "status_parcela" NOT NULL DEFAULT 'pendente',
    "pago_em" TIMESTAMPTZ(6),
    "transacao_id" UUID,
    "fatura_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_anexo" NOT NULL,
    "arquivo_url" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "transacao_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfce_notas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "chave_acesso" VARCHAR(44) NOT NULL,
    "emitente" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "data" TIMESTAMPTZ(6) NOT NULL,
    "total" BIGINT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "transacao_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nfce_notas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfce_itens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nota_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "unidade" TEXT NOT NULL,
    "valor_unitario" BIGINT NOT NULL,
    "valor_total" BIGINT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nfce_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "competencia" DATE NOT NULL,
    "valor_limite" BIGINT NOT NULL,
    "repetir_mensal" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor_alvo" BIGINT NOT NULL,
    "valor_atual" BIGINT NOT NULL DEFAULT 0,
    "prazo" DATE,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas_aportes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "meta_id" UUID NOT NULL,
    "valor" BIGINT NOT NULL,
    "data" DATE NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metas_aportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listas_compras" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria_lista" "categoria_lista" NOT NULL,
    "finalizada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listas_compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_lista" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "lista_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unidade" TEXT,
    "preco_estimado" BIGINT,
    "comprado" BOOLEAN NOT NULL DEFAULT false,
    "comprado_em" TIMESTAMPTZ(6),
    "transacao_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "itens_lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compartilhamentos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "recurso" "recurso_compartilhavel" NOT NULL,
    "recurso_id" UUID NOT NULL,
    "convidado_id" UUID NOT NULL,
    "permissao" "permissao_compartilhamento" NOT NULL,
    "status" "status_convite" NOT NULL DEFAULT 'pendente',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compartilhamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lembretes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "data_hora" TIMESTAMPTZ(6) NOT NULL,
    "recorrencia" TEXT,
    "canais" "canal_lembrete"[],
    "status" "status_lembrete" NOT NULL DEFAULT 'ativo',
    "adiado_ate" TIMESTAMPTZ(6),
    "ultima_ligacao_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lembretes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas_conectadas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "provedor" "provedor_agenda" NOT NULL,
    "tokens_cifrados" TEXT,
    "agenda_padrao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agendas_conectadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromissos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "agenda_id" UUID,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6),
    "local" TEXT,
    "id_externo" TEXT,
    "origem" "origem_compromisso" NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compromissos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_alerta" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "link_interno" TEXT NOT NULL,
    "enviada_em" TIMESTAMPTZ(6),
    "lida_em" TIMESTAMPTZ(6),
    "chave_unica" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_alerta" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_alerta" "tipo_alerta" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "antecedencia_dias" SMALLINT,
    "silencio_inicio" VARCHAR(5),
    "silencio_fim" VARCHAR(5),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "preferencias_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps_monitorados" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "identificador_app" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_alerta" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "apps_monitorados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conexoes_open_finance" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "agregador" TEXT NOT NULL,
    "item_id_externo" TEXT NOT NULL,
    "instituicao" TEXT NOT NULL,
    "status" "status_conexao_open_finance" NOT NULL,
    "consentimento_expira_em" TIMESTAMPTZ(6),
    "ultima_sincronizacao" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conexoes_open_finance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_mensagem_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "conversa_id" UUID NOT NULL,
    "autor" "autor_mensagem" NOT NULL,
    "tipo" "tipo_mensagem" NOT NULL,
    "conteudo" TEXT,
    "componentes" JSONB,
    "anexo_id" UUID,
    "rascunho_id" UUID,
    "idempotency_key" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rascunhos_lancamento" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "conversa_id" UUID NOT NULL,
    "dados" JSONB NOT NULL,
    "campo_pendente" TEXT,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rascunhos_lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_aprendidas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "categoria_id" UUID,
    "cartao_id" UUID,
    "forma_pagamento" "forma_pagamento",
    "contagem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "preferencias_aprendidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_ia" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "mensagem_id" UUID,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL,
    "tokens_saida" INTEGER NOT NULL,
    "ferramenta" TEXT,
    "duracao_ms" INTEGER NOT NULL,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "logs_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novidades" (
    "id" UUID NOT NULL,
    "autor_id" UUID,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "video_url" TEXT,
    "publicada_em" TIMESTAMPTZ(6),
    "validade" TIMESTAMPTZ(6),
    "status" "status_novidade" NOT NULL DEFAULT 'rascunho',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "novidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novidades_leituras" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "novidade_id" UUID NOT NULL,
    "lida_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "novidades_leituras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_eventos" (
    "id" UUID NOT NULL,
    "provedor" "provedor_webhook" NOT NULL,
    "id_externo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processado_em" TIMESTAMPTZ(6),
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceites_termos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "documento" "documento_aceite" NOT NULL,
    "versao" TEXT NOT NULL,
    "aceito_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aceites_termos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimentos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "finalidade" "finalidade_consentimento" NOT NULL,
    "concedido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consentimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_teste" (
    "id" UUID NOT NULL,
    "tipo" "tipo_controle_teste" NOT NULL,
    "valor_hash" TEXT NOT NULL,
    "usado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "controle_teste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupons" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "stripe_coupon_id" TEXT NOT NULL,
    "percentual" SMALLINT NOT NULL,
    "validade" TIMESTAMPTZ(6),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mony_config" (
    "id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "prompt_sistema" TEXT NOT NULL,
    "ferramentas" JSONB NOT NULL,
    "modelo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mony_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligacoes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "lembrete_id" UUID,
    "status" TEXT NOT NULL,
    "provedor_id" TEXT,
    "custo_centavos" BIGINT,
    "iniciada_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ligacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dicas_vistas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "vista_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dicas_vistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes_documento" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "arquivo_id" UUID NOT NULL,
    "tipo" "tipo_importacao" NOT NULL,
    "status" "status_importacao" NOT NULL DEFAULT 'processando',
    "resultado" JSONB,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "importacoes_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "logins_sociais_usuario_id_idx" ON "logins_sociais"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "logins_sociais_provedor_id_externo_key" ON "logins_sociais"("provedor", "id_externo");

-- CreateIndex
CREATE INDEX "dispositivos_usuario_id_idx" ON "dispositivos"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_usuario_id_identificador_aparelho_key" ON "dispositivos"("usuario_id", "identificador_aparelho");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refresh_token_hash_key" ON "sessoes"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_dispositivo_id_idx" ON "sessoes"("dispositivo_id");

-- CreateIndex
CREATE INDEX "codigos_recuperacao_usuario_id_idx" ON "codigos_recuperacao"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_usuario_id_key" ON "assinaturas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_stripe_customer_id_key" ON "assinaturas"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_stripe_subscription_id_key" ON "assinaturas"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "assinaturas_plano_preco_id_idx" ON "assinaturas"("plano_preco_id");

-- CreateIndex
CREATE UNIQUE INDEX "planos_precos_stripe_price_id_key" ON "planos_precos"("stripe_price_id");

-- CreateIndex
CREATE INDEX "planos_precos_plano_vigente_idx" ON "planos_precos"("plano", "vigente");

-- CreateIndex
CREATE INDEX "planos_precos_alterado_por_idx" ON "planos_precos"("alterado_por");

-- CreateIndex
CREATE UNIQUE INDEX "limites_plano_recurso_key" ON "limites_plano"("recurso");

-- CreateIndex
CREATE UNIQUE INDEX "uso_recursos_usuario_id_recurso_data_key" ON "uso_recursos"("usuario_id", "recurso", "data");

-- CreateIndex
CREATE INDEX "categorias_usuario_id_tipo_idx" ON "categorias"("usuario_id", "tipo");

-- CreateIndex
CREATE INDEX "contas_conexao_open_finance_id_idx" ON "contas"("conexao_open_finance_id");

-- CreateIndex
CREATE UNIQUE INDEX "contas_usuario_id_id_externo_key" ON "contas"("usuario_id", "id_externo");

-- CreateIndex
CREATE INDEX "cartoes_conexao_open_finance_id_idx" ON "cartoes"("conexao_open_finance_id");

-- CreateIndex
CREATE INDEX "cartoes_conta_pagamento_id_idx" ON "cartoes"("conta_pagamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_usuario_id_id_externo_key" ON "cartoes"("usuario_id", "id_externo");

-- CreateIndex
CREATE INDEX "faturas_usuario_id_idx" ON "faturas"("usuario_id");

-- CreateIndex
CREATE INDEX "faturas_data_vencimento_status_idx" ON "faturas"("data_vencimento", "status");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_cartao_id_competencia_key" ON "faturas"("cartao_id", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_parcela_id_key" ON "transacoes"("parcela_id");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_nfce_nota_id_key" ON "transacoes"("nfce_nota_id");

-- CreateIndex
CREATE INDEX "transacoes_usuario_id_data_idx" ON "transacoes"("usuario_id", "data" DESC);

-- CreateIndex
CREATE INDEX "transacoes_usuario_id_categoria_id_data_idx" ON "transacoes"("usuario_id", "categoria_id", "data");

-- CreateIndex
CREATE INDEX "transacoes_fatura_id_idx" ON "transacoes"("fatura_id");

-- CreateIndex
CREATE INDEX "transacoes_categoria_id_idx" ON "transacoes"("categoria_id");

-- CreateIndex
CREATE INDEX "transacoes_conta_id_idx" ON "transacoes"("conta_id");

-- CreateIndex
CREATE INDEX "transacoes_cartao_id_idx" ON "transacoes"("cartao_id");

-- CreateIndex
CREATE INDEX "transacoes_recorrencia_id_idx" ON "transacoes"("recorrencia_id");

-- CreateIndex
CREATE INDEX "transacoes_parcelamento_id_idx" ON "transacoes"("parcelamento_id");

-- CreateIndex
CREATE INDEX "transacoes_transacao_unida_id_idx" ON "transacoes"("transacao_unida_id");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_usuario_id_id_externo_key" ON "transacoes"("usuario_id", "id_externo");

-- CreateIndex
CREATE INDEX "recorrencias_usuario_id_idx" ON "recorrencias"("usuario_id");

-- CreateIndex
CREATE INDEX "recorrencias_proxima_geracao_ativa_idx" ON "recorrencias"("proxima_geracao", "ativa");

-- CreateIndex
CREATE INDEX "recorrencias_categoria_id_idx" ON "recorrencias"("categoria_id");

-- CreateIndex
CREATE INDEX "recorrencias_conta_id_idx" ON "recorrencias"("conta_id");

-- CreateIndex
CREATE INDEX "recorrencias_cartao_id_idx" ON "recorrencias"("cartao_id");

-- CreateIndex
CREATE INDEX "parcelamentos_usuario_id_idx" ON "parcelamentos"("usuario_id");

-- CreateIndex
CREATE INDEX "parcelamentos_categoria_id_idx" ON "parcelamentos"("categoria_id");

-- CreateIndex
CREATE INDEX "parcelamentos_cartao_id_idx" ON "parcelamentos"("cartao_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_transacao_id_key" ON "parcelas"("transacao_id");

-- CreateIndex
CREATE INDEX "parcelas_usuario_id_idx" ON "parcelas"("usuario_id");

-- CreateIndex
CREATE INDEX "parcelas_vencimento_status_idx" ON "parcelas"("vencimento", "status");

-- CreateIndex
CREATE INDEX "parcelas_fatura_id_idx" ON "parcelas"("fatura_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_parcelamento_id_numero_key" ON "parcelas"("parcelamento_id", "numero");

-- CreateIndex
CREATE INDEX "anexos_usuario_id_idx" ON "anexos"("usuario_id");

-- CreateIndex
CREATE INDEX "anexos_transacao_id_idx" ON "anexos"("transacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "nfce_notas_transacao_id_key" ON "nfce_notas"("transacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "nfce_notas_usuario_id_chave_acesso_key" ON "nfce_notas"("usuario_id", "chave_acesso");

-- CreateIndex
CREATE INDEX "nfce_itens_usuario_id_idx" ON "nfce_itens"("usuario_id");

-- CreateIndex
CREATE INDEX "nfce_itens_nota_id_idx" ON "nfce_itens"("nota_id");

-- CreateIndex
CREATE INDEX "orcamentos_categoria_id_idx" ON "orcamentos"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_usuario_id_categoria_id_competencia_key" ON "orcamentos"("usuario_id", "categoria_id", "competencia");

-- CreateIndex
CREATE INDEX "metas_usuario_id_idx" ON "metas"("usuario_id");

-- CreateIndex
CREATE INDEX "metas_aportes_usuario_id_idx" ON "metas_aportes"("usuario_id");

-- CreateIndex
CREATE INDEX "metas_aportes_meta_id_idx" ON "metas_aportes"("meta_id");

-- CreateIndex
CREATE INDEX "listas_compras_usuario_id_idx" ON "listas_compras"("usuario_id");

-- CreateIndex
CREATE INDEX "itens_lista_usuario_id_idx" ON "itens_lista"("usuario_id");

-- CreateIndex
CREATE INDEX "itens_lista_lista_id_idx" ON "itens_lista"("lista_id");

-- CreateIndex
CREATE INDEX "itens_lista_transacao_id_idx" ON "itens_lista"("transacao_id");

-- CreateIndex
CREATE INDEX "compartilhamentos_usuario_id_idx" ON "compartilhamentos"("usuario_id");

-- CreateIndex
CREATE INDEX "compartilhamentos_convidado_id_idx" ON "compartilhamentos"("convidado_id");

-- CreateIndex
CREATE UNIQUE INDEX "compartilhamentos_recurso_recurso_id_convidado_id_key" ON "compartilhamentos"("recurso", "recurso_id", "convidado_id");

-- CreateIndex
CREATE INDEX "lembretes_usuario_id_idx" ON "lembretes"("usuario_id");

-- CreateIndex
CREATE INDEX "lembretes_status_data_hora_idx" ON "lembretes"("status", "data_hora");

-- CreateIndex
CREATE INDEX "agendas_conectadas_usuario_id_idx" ON "agendas_conectadas"("usuario_id");

-- CreateIndex
CREATE INDEX "compromissos_usuario_id_inicio_idx" ON "compromissos"("usuario_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "compromissos_agenda_id_id_externo_key" ON "compromissos"("agenda_id", "id_externo");

-- CreateIndex
CREATE INDEX "notificacoes_usuario_id_criado_em_idx" ON "notificacoes"("usuario_id", "criado_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notificacoes_usuario_id_chave_unica_key" ON "notificacoes"("usuario_id", "chave_unica");

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_alerta_usuario_id_tipo_alerta_key" ON "preferencias_alerta"("usuario_id", "tipo_alerta");

-- CreateIndex
CREATE UNIQUE INDEX "apps_monitorados_usuario_id_identificador_app_key" ON "apps_monitorados"("usuario_id", "identificador_app");

-- CreateIndex
CREATE INDEX "conexoes_open_finance_usuario_id_idx" ON "conexoes_open_finance"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "conexoes_open_finance_agregador_item_id_externo_key" ON "conexoes_open_finance"("agregador", "item_id_externo");

-- CreateIndex
CREATE INDEX "conversas_usuario_id_idx" ON "conversas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_anexo_id_key" ON "mensagens"("anexo_id");

-- CreateIndex
CREATE INDEX "mensagens_usuario_id_idx" ON "mensagens"("usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_conversa_id_criado_em_idx" ON "mensagens"("conversa_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "mensagens_rascunho_id_idx" ON "mensagens"("rascunho_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_conversa_id_idempotency_key_key" ON "mensagens"("conversa_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "rascunhos_lancamento_conversa_id_key" ON "rascunhos_lancamento"("conversa_id");

-- CreateIndex
CREATE INDEX "rascunhos_lancamento_usuario_id_idx" ON "rascunhos_lancamento"("usuario_id");

-- CreateIndex
CREATE INDEX "preferencias_aprendidas_categoria_id_idx" ON "preferencias_aprendidas"("categoria_id");

-- CreateIndex
CREATE INDEX "preferencias_aprendidas_cartao_id_idx" ON "preferencias_aprendidas"("cartao_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_aprendidas_usuario_id_chave_key" ON "preferencias_aprendidas"("usuario_id", "chave");

-- CreateIndex
CREATE INDEX "logs_ia_usuario_id_criado_em_idx" ON "logs_ia"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "logs_ia_mensagem_id_idx" ON "logs_ia"("mensagem_id");

-- CreateIndex
CREATE INDEX "novidades_status_publicada_em_idx" ON "novidades"("status", "publicada_em");

-- CreateIndex
CREATE INDEX "novidades_autor_id_idx" ON "novidades"("autor_id");

-- CreateIndex
CREATE INDEX "novidades_leituras_usuario_id_idx" ON "novidades_leituras"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "novidades_leituras_novidade_id_usuario_id_key" ON "novidades_leituras"("novidade_id", "usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_entidade_entidade_id_idx" ON "auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_eventos_provedor_id_externo_key" ON "webhook_eventos"("provedor", "id_externo");

-- CreateIndex
CREATE INDEX "aceites_termos_usuario_id_documento_idx" ON "aceites_termos"("usuario_id", "documento");

-- CreateIndex
CREATE INDEX "consentimentos_usuario_id_finalidade_idx" ON "consentimentos"("usuario_id", "finalidade");

-- CreateIndex
CREATE UNIQUE INDEX "controle_teste_tipo_valor_hash_key" ON "controle_teste"("tipo", "valor_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cupons_stripe_coupon_id_key" ON "cupons"("stripe_coupon_id");

-- CreateIndex
CREATE INDEX "cupons_criado_por_idx" ON "cupons"("criado_por");

-- CreateIndex
CREATE UNIQUE INDEX "mony_config_versao_key" ON "mony_config"("versao");

-- CreateIndex
CREATE INDEX "mony_config_criado_por_idx" ON "mony_config"("criado_por");

-- CreateIndex
CREATE UNIQUE INDEX "ligacoes_provedor_id_key" ON "ligacoes"("provedor_id");

-- CreateIndex
CREATE INDEX "ligacoes_usuario_id_iniciada_em_idx" ON "ligacoes"("usuario_id", "iniciada_em");

-- CreateIndex
CREATE INDEX "ligacoes_lembrete_id_idx" ON "ligacoes"("lembrete_id");

-- CreateIndex
CREATE UNIQUE INDEX "dicas_vistas_usuario_id_chave_key" ON "dicas_vistas"("usuario_id", "chave");

-- CreateIndex
CREATE INDEX "importacoes_documento_usuario_id_idx" ON "importacoes_documento"("usuario_id");

-- CreateIndex
CREATE INDEX "importacoes_documento_arquivo_id_idx" ON "importacoes_documento"("arquivo_id");

-- AddForeignKey
ALTER TABLE "logins_sociais" ADD CONSTRAINT "logins_sociais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_recuperacao" ADD CONSTRAINT "codigos_recuperacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_preco_id_fkey" FOREIGN KEY ("plano_preco_id") REFERENCES "planos_precos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_precos" ADD CONSTRAINT "planos_precos_alterado_por_fkey" FOREIGN KEY ("alterado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uso_recursos" ADD CONSTRAINT "uso_recursos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_conexao_open_finance_id_fkey" FOREIGN KEY ("conexao_open_finance_id") REFERENCES "conexoes_open_finance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_conexao_open_finance_id_fkey" FOREIGN KEY ("conexao_open_finance_id") REFERENCES "conexoes_open_finance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_conta_pagamento_id_fkey" FOREIGN KEY ("conta_pagamento_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "cartoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "cartoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_recorrencia_id_fkey" FOREIGN KEY ("recorrencia_id") REFERENCES "recorrencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_parcelamento_id_fkey" FOREIGN KEY ("parcelamento_id") REFERENCES "parcelamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_parcela_id_fkey" FOREIGN KEY ("parcela_id") REFERENCES "parcelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_nfce_nota_id_fkey" FOREIGN KEY ("nfce_nota_id") REFERENCES "nfce_notas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_transacao_unida_id_fkey" FOREIGN KEY ("transacao_unida_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "cartoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamentos" ADD CONSTRAINT "parcelamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamentos" ADD CONSTRAINT "parcelamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamentos" ADD CONSTRAINT "parcelamentos_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "cartoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_parcelamento_id_fkey" FOREIGN KEY ("parcelamento_id") REFERENCES "parcelamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_notas" ADD CONSTRAINT "nfce_notas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_notas" ADD CONSTRAINT "nfce_notas_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_itens" ADD CONSTRAINT "nfce_itens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_itens" ADD CONSTRAINT "nfce_itens_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "nfce_notas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_aportes" ADD CONSTRAINT "metas_aportes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_aportes" ADD CONSTRAINT "metas_aportes_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "metas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_compras" ADD CONSTRAINT "listas_compras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_lista" ADD CONSTRAINT "itens_lista_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_lista" ADD CONSTRAINT "itens_lista_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas_compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_lista" ADD CONSTRAINT "itens_lista_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamentos" ADD CONSTRAINT "compartilhamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamentos" ADD CONSTRAINT "compartilhamentos_convidado_id_fkey" FOREIGN KEY ("convidado_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lembretes" ADD CONSTRAINT "lembretes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas_conectadas" ADD CONSTRAINT "agendas_conectadas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_agenda_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "agendas_conectadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_alerta" ADD CONSTRAINT "preferencias_alerta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps_monitorados" ADD CONSTRAINT "apps_monitorados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conexoes_open_finance" ADD CONSTRAINT "conexoes_open_finance_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_anexo_id_fkey" FOREIGN KEY ("anexo_id") REFERENCES "anexos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_rascunho_id_fkey" FOREIGN KEY ("rascunho_id") REFERENCES "rascunhos_lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rascunhos_lancamento" ADD CONSTRAINT "rascunhos_lancamento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rascunhos_lancamento" ADD CONSTRAINT "rascunhos_lancamento_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_aprendidas" ADD CONSTRAINT "preferencias_aprendidas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_aprendidas" ADD CONSTRAINT "preferencias_aprendidas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_aprendidas" ADD CONSTRAINT "preferencias_aprendidas_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "cartoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_ia" ADD CONSTRAINT "logs_ia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_ia" ADD CONSTRAINT "logs_ia_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novidades" ADD CONSTRAINT "novidades_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novidades_leituras" ADD CONSTRAINT "novidades_leituras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novidades_leituras" ADD CONSTRAINT "novidades_leituras_novidade_id_fkey" FOREIGN KEY ("novidade_id") REFERENCES "novidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_termos" ADD CONSTRAINT "aceites_termos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimentos" ADD CONSTRAINT "consentimentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mony_config" ADD CONSTRAINT "mony_config_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligacoes" ADD CONSTRAINT "ligacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligacoes" ADD CONSTRAINT "ligacoes_lembrete_id_fkey" FOREIGN KEY ("lembrete_id") REFERENCES "lembretes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dicas_vistas" ADD CONSTRAINT "dicas_vistas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes_documento" ADD CONSTRAINT "importacoes_documento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes_documento" ADD CONSTRAINT "importacoes_documento_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "anexos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
