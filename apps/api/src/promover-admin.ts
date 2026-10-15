/**
 * Dá ou tira o acesso ao painel admin (T-104a). O primeiro admin só nasce assim, porque o painel não
 * cria admins. A pessoa precisa ter conta no app; no primeiro login do painel, configura o 2FA.
 *
 * Uso: `DATABASE_URL=… node dist/promover-admin.js --email ana@exemplo.com [--refazer-2fa | --rebaixar]`
 *
 * `--refazer-2fa` apaga o 2FA (celular perdido, ou depois de trocar `JWT_CHAVE_PRIVADA`): o próximo
 * login configura de novo. `--rebaixar` volta a pessoa a usuário comum. Tudo fica na auditoria.
 */
import { parseArgs } from 'node:util';

import { normalizarEmail } from '@mony/shared/autenticacao';

import { criarClientePrisma } from './core/prisma/cliente';

async function executar(): Promise<void> {
  const { values: opcoes } = parseArgs({
    options: {
      email: { type: 'string' },
      'refazer-2fa': { type: 'boolean', default: false },
      rebaixar: { type: 'boolean', default: false },
    },
  });
  const urlBanco = process.env.DATABASE_URL;
  if (!urlBanco) throw new Error('Defina DATABASE_URL.');
  if (!opcoes.email) throw new Error('Informe --email.');
  const email = normalizarEmail(opcoes.email);

  const prisma = criarClientePrisma(urlBanco);
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, papel: true, totpAtivadoEm: true },
    });
    if (!usuario) throw new Error(`Não existe conta com o e-mail ${email}. Crie a conta no app.`);
    const rebaixar = opcoes.rebaixar;
    const refazer = rebaixar || opcoes['refazer-2fa'];
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          papel: rebaixar ? 'usuario' : 'admin',
          ...(refazer ? { totpSegredo: null, totpAtivadoEm: null } : {}),
        },
      }),
      prisma.registroAuditoria.create({
        data: {
          usuarioId: null,
          acao: rebaixar ? 'admin.rebaixado' : refazer ? 'admin.2fa_refeito' : 'admin.promovido',
          entidade: 'usuario',
          entidadeId: usuario.id,
          antes: { papel: usuario.papel, com2fa: usuario.totpAtivadoEm !== null },
          depois: { papel: rebaixar ? 'usuario' : 'admin' },
        },
      }),
    ]);
    if (rebaixar) console.log(`${email} não é mais admin.`);
    else if (refazer) console.log(`${email} é admin; o 2FA será configurado no próximo login.`);
    else console.log(`${email} é admin. No primeiro login do painel, configura o 2FA.`);
  } finally {
    await prisma.$disconnect();
  }
}

executar().catch((erro: unknown) => {
  console.error('Falha:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
