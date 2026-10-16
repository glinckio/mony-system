/**
 * Frases de teste da Mony (doc 08, T-068) contra o banco e o provedor de IA do ambiente.
 *
 * Uso: `node dist/avaliar-mony.js [--criar <arquivo-do-prompt>] [--versao <n>] [--gravar]
 *       [--ativar] [--so-regras]`
 *
 * - Sem `--versao`, avalia a versão ativa (ou o prompt do código, sem versão ativa).
 * - `--criar` grava o arquivo como uma versão nova (inativa) e avalia ela.
 * - `--gravar` guarda o resultado na versão; `--ativar` ativa se passou (95% ou mais).
 * - Com `IA_PROVEDOR=fake` (ou `--so-regras`) só rodam as frases resolvidas por regra.
 *
 * Sai com código 1 quando a avaliação não chega ao mínimo. Os usuários da avaliação são apagados.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

async function avaliarMony(): Promise<number> {
  const { values: opcoes } = parseArgs({
    options: {
      criar: { type: 'string' },
      versao: { type: 'string' },
      gravar: { type: 'boolean', default: false },
      ativar: { type: 'boolean', default: false },
      'so-regras': { type: 'boolean', default: false },
    },
  });
  process.env.LOG_LEVEL ??= 'warn';

  // Importados depois do ambiente, porque a configuração é validada ao carregar.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module.js');
  const { configurarApp, criarAdaptadorFastify } = await import('./configurar-app.js');
  const { Configuracao } = await import('./core/config/configuracao.js');
  const { ConfigMonyService, MINIMO_AVALIACAO } = await import('./modulos/mony/config.service.js');
  const { CASOS_AVALIACAO } = await import('./modulos/mony/avaliacao/casos.js');
  const { avaliar } = await import('./modulos/mony/avaliacao/avaliador.js');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, criarAdaptadorFastify(), {
    logger: ['warn'],
  });
  configurarApp(app, { documentacao: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  try {
    const servico = app.get(ConfigMonyService, { strict: false });
    const configuracao = app.get(Configuracao);
    let versao = opcoes.versao === undefined ? null : Number(opcoes.versao);
    if (opcoes.criar !== undefined) {
      versao = await servico.criarVersao(
        { promptSistema: readFileSync(opcoes.criar, 'utf8') },
        null,
      );
      console.log(`Versão ${String(versao)} criada (inativa).`);
    }
    const config = versao === null ? await servico.ativa() : await servico.daVersao(versao);
    servico.fixar(config);
    const soRegras = opcoes['so-regras'] || configuracao.provedorIa === 'fake';
    const casos = soRegras ? CASOS_AVALIACAO.filter(({ regra }) => regra) : CASOS_AVALIACAO;
    const modelo =
      configuracao.provedorIa === 'fake' ? 'fake' : (config.modelo ?? configuracao.modeloIa);
    console.log(
      `Avaliando ${config.versao === null ? 'o prompt do código' : `a versão ${String(config.versao)}`} com ${modelo}: ${String(casos.length)} frases${soRegras ? ' (só as resolvidas por regra)' : ''}.`,
    );

    const resultado = await avaliar(app, casos, modelo);
    for (const caso of resultado.casos) {
      console.log(
        `${caso.passou ? 'ok  ' : 'FALHOU'} ${caso.id}${caso.passou ? '' : `: ${caso.motivos.join('; ')}`}`,
      );
    }
    console.log(
      `${String(resultado.aprovados)} de ${String(resultado.total)} (${String(resultado.percentual)}%); mínimo ${String(MINIMO_AVALIACAO)}%.`,
    );

    if (versao !== null && (opcoes.gravar || opcoes.ativar)) {
      if (soRegras) {
        console.log('Só as frases por regra rodaram: o resultado não vale para a versão.');
        return 1;
      }
      await servico.registrarAvaliacao(versao, resultado);
      console.log(`Resultado gravado na versão ${String(versao)}.`);
      if (opcoes.ativar) {
        await servico.ativar(versao);
        console.log(`Versão ${String(versao)} ativa.`);
      }
    }
    return resultado.percentual >= MINIMO_AVALIACAO ? 0 : 1;
  } finally {
    await app.close();
  }
}

avaliarMony()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    console.error(erro);
    // A última linha é o motivo que o painel mostra quando a avaliação roda pelo worker (T-141e).
    console.error(
      `Falha na avaliação da Mony: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    process.exitCode = 1;
  });
